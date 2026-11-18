// Live exhume: the exhume pipeline in the browser for one pasted public GitHub repository.
// Pure apart from the injected fetch: no node:, no clock (except opts.now), no git history. npm only (package-lock.json).
// Fail-safe: any problem throws LiveExhumeError and returns no creature, so nothing is ever shown as Healthy by mistake.
import { buildCreature, type Creature } from "../exhume/creature.js";
import { LockfileError } from "../exhume/lockfile.js";
import { osvLookup } from "../exhume/osv-client.js";
import { CODEOWNERS_LOCATIONS } from "../exhume/owners.js";
import type { OsvLookup } from "../exhume/osv.js";
import type { ExhumeFs } from "../exhume/types.js";
import { parseAdvisory } from "../necromancer/advisory.js";
import { auditIdFor, prBody } from "../necromancer/pr-body.js";
import { chooseVersion, type Advisory } from "../necromancer/version.js";
import { limbIds } from "../raise/generate.js";
import { plateSummary, renderPlate } from "../render/plate.js";
import type { FeedSnapshot } from "./feed-snapshot.js";
import { parseRepoUrl } from "./repo-url.js";

/** Failsafe rule 6: one dependency per PR, at most 5 per raid. */
export const MAX_PAYLOADS = 5;
export const RAW_HOST = "https://raw.githubusercontent.com";
export const REFS = ["HEAD", "main", "master"] as const;
export const NPM_ONLY_NOTE = "The web version reads npm projects only (package-lock.json). Python and other ecosystems: run `npx @e-1305/crypt exhume <repo>` locally.";
const FETCH_TIMEOUT_MS = 20_000;
const OSV_VULNS = "https://api.osv.dev/v1/vulns";
const ADVISORY_ID = /^[A-Za-z0-9_.-]{1,64}$/;
/** Other manifests whose presence means "not an npm project" rather than "not found". */
const OTHER_MANIFESTS = ["yarn.lock", "pnpm-lock.yaml", "requirements.txt", "poetry.lock", "Pipfile.lock"];

export type FetchLike = (
  url: string,
  init?: { method?: string; body?: string; headers?: Record<string, string>; signal?: AbortSignal },
) => Promise<{ ok: boolean; status: number; text(): Promise<string>; json(): Promise<unknown> }>;

export type LiveErrorCode =
  | "bad-url"
  | "not-found"
  | "no-npm-lockfile"
  | "unsupported-lockfile"
  | "malformed-lockfile"
  | "rate-limited"
  | "network"
  | "osv-unavailable"
  | "feed-missing";

export class LiveExhumeError extends Error {
  constructor(
    readonly code: LiveErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "LiveExhumeError";
  }
}

export interface LiveExhumeOptions {
  fetch: FetchLike;
  /** The snapshot shipped with the site. Null or absent: the run stops (ranking needs both feeds). */
  feeds: FeedSnapshot | null | undefined;
  /** Replaces the OSV network lookup (tests). */
  osv?: OsvLookup;
  /** Pre-filled OSV cache (tests). Default: empty in-memory cache. */
  cacheFs?: ExhumeFs;
  cacheDir?: string;
  /** Current time in ms, used only for the OSV cache TTL. */
  now?: number;
}

export type DryRunPayload =
  | {
      status: "ready";
      /** Stable limb ID, as the game uses it (for example JQUERY). */
      limb: string;
      name: string;
      from: string;
      to: string;
      breaking: boolean;
      title: string;
      branch: string;
      body: string;
      files: string[];
      dryRun: true;
      sent: false;
      label: string;
    }
  | { status: "no-fix"; limb: string; name: string; from: string; reason: string };

export interface LiveExhumeResult {
  /** "owner/repo" as typed. */
  repo: string;
  /** The ref the lockfile was read from. */
  ref: string;
  /** Same shape as the CLI creature.json. */
  creature: Creature;
  /** Ranked limbs (creature.limbs): rank order, owners from CODEOWNERS. */
  limbs: Creature["limbs"];
  /** Manifest to owner, from CODEOWNERS only ("unowned" without one). */
  owners: { manifest: string; owner: string }[];
  /** renderPlate(creature): identical to the CLI plate. */
  plate: string;
  summary: string[];
  feeds: { kev: string; epss: string };
  payloads: DryRunPayload[];
  /** Spawned limbs beyond MAX_PAYLOADS that got no payload. */
  payloadsOmitted: number;
  notes: string[];
}

export function dryRunLabel(repo: string): string {
  return `dry run: run \`npx @e-1305/crypt raid ${repo} --live\` to open it for real`;
}

function withTimeout(f: FetchLike): FetchLike {
  return (url, init) => f(url, { ...init, signal: init?.signal ?? AbortSignal.timeout(FETCH_TIMEOUT_MS) });
}

const rateLimited = (what: string) =>
  new LiveExhumeError("rate-limited", `GitHub or OSV is rate limiting requests (${what}). Wait a few minutes, then try again.`);

/** One raw file. Null on 404. Throws a typed error on a rate limit or any other failure. */
async function rawFile(f: FetchLike, owner: string, repo: string, ref: string, path: string): Promise<string | null> {
  const url = `${RAW_HOST}/${owner}/${repo}/${ref}/${path}`;
  let res;
  try {
    res = await f(url);
  } catch (e) {
    throw new LiveExhumeError("network", `Could not reach raw.githubusercontent.com for ${path} (${(e as Error).message}). Check your connection, then try again.`);
  }
  if (res.status === 404) return null;
  if (res.status === 403 || res.status === 429) throw rateLimited(path);
  if (!res.ok) throw new LiveExhumeError("network", `raw.githubusercontent.com answered HTTP ${res.status} for ${path}. Try again in a minute.`);
  try {
    return await res.text();
  } catch (e) {
    throw new LiveExhumeError("network", `Could not read ${path} (${(e as Error).message}). Try again.`);
  }
}

function cache(): ExhumeFs {
  const m = new Map<string, string>();
  return { read: (p) => m.get(p) ?? null, write: (p, t) => void m.set(p, t) };
}

async function advisoryFor(f: FetchLike, id: string): Promise<Advisory | "rate-limited" | null> {
  if (!ADVISORY_ID.test(id)) return null;
  try {
    const res = await f(`${OSV_VULNS}/${encodeURIComponent(id)}`);
    if (res.status === 403 || res.status === 429) return "rate-limited";
    if (!res.ok) return null;
    return parseAdvisory(await res.json());
  } catch {
    return null;
  }
}

/** The PR the Necromancer would open, built by its own pure code. Nothing is sent. */
async function buildPayloads(
  f: FetchLike,
  creature: Creature,
  repo: string,
  notes: string[],
): Promise<{ payloads: DryRunPayload[]; omitted: number }> {
  const spawned = creature.limbs.filter((l) => l.spawned && l.ecosystem === "npm");
  const ids = limbIds(spawned.map((l) => l.name));
  const stamp = new Date(Date.parse(creature.feeds.epss.date ?? "") || 0);
  const payloads: DryRunPayload[] = [];
  const label = dryRunLabel(repo);
  for (let i = 0; i < Math.min(spawned.length, MAX_PAYLOADS); i++) {
    const l = spawned[i]!;
    const limb = ids[i]!;
    const noFix = (reason: string): DryRunPayload => ({ status: "no-fix", limb, name: l.name, from: l.version, reason });
    const advisories: Advisory[] = [];
    let missing = false;
    for (const v of l.vulns) {
      const a = await advisoryFor(f, v.id);
      if (a === "rate-limited") {
        notes.push("OSV rate limit reached while reading advisories; some dry-run payloads are missing. Wait a few minutes and paste the URL again.");
        payloads.push(noFix("advisory could not be read (rate limit)"));
        missing = true;
        break;
      }
      if (a === null) {
        missing = true;
        break;
      }
      advisories.push(a);
    }
    if (missing) {
      if (payloads.length <= i) payloads.push(noFix("advisory could not be read from OSV"));
      continue;
    }
    const choice = chooseVersion(l.ecosystem, l.name, l.version, advisories);
    if (!choice) {
      payloads.push(noFix("no single fixed version could be chosen from the OSV ranges"));
      continue;
    }
    const cves = [...new Set(l.vulns.flatMap((v) => v.cves))].sort();
    payloads.push({
      status: "ready",
      limb,
      name: l.name,
      from: l.version,
      to: choice.version,
      breaking: choice.breaking,
      title: `fix: graft ${l.name} ${l.version} to ${choice.version} (${limb})`,
      branch: `crypt/graft-${limb.toLowerCase()}-${choice.version}`,
      body: prBody({
        limb,
        name: l.name,
        from: l.version,
        to: choice.version,
        breaking: choice.breaking,
        cves,
        kev: l.kev,
        epss: l.epss,
        owner: l.owner,
        auditId: auditIdFor(stamp, limb),
      }),
      files: ["package.json", "package-lock.json"],
      dryRun: true,
      sent: false,
      label,
    });
  }
  return { payloads, omitted: Math.max(0, spawned.length - MAX_PAYLOADS) };
}

export async function liveExhume(input: string, opts: LiveExhumeOptions): Promise<LiveExhumeResult> {
  const ref = parseRepoUrl(input);
  if (!ref) {
    throw new LiveExhumeError("bad-url", "Paste a public GitHub repository URL, for example https://github.com/e-1305/crypt-demo.");
  }
  if (!opts.feeds) {
    throw new LiveExhumeError("feed-missing", "The KEV and EPSS snapshot did not load, so nothing can be ranked. Reload the page, then try again.");
  }
  const f = withTimeout(opts.fetch);
  const { owner, repo } = ref;
  const name = `${owner}/${repo}`;

  let lock: string | null = null;
  let usedRef: string = REFS[0];
  for (const r of REFS) {
    lock = await rawFile(f, owner, repo, r, "package-lock.json");
    if (lock !== null) {
      usedRef = r;
      break;
    }
  }
  if (lock === null) {
    for (const other of OTHER_MANIFESTS) {
      if ((await rawFile(f, owner, repo, REFS[0], other)) !== null) {
        throw new LiveExhumeError("no-npm-lockfile", `${name} has ${other} but no package-lock.json at its root. ${NPM_ONLY_NOTE}`);
      }
    }
    throw new LiveExhumeError(
      "not-found",
      `No package-lock.json found at the root of ${name} (checked HEAD, main and master). Check that the repository is public and has a package-lock.json. ${NPM_ONLY_NOTE}`,
    );
  }

  const files = new Map<string, string>([["package-lock.json", lock]]);
  const notes: string[] = [];
  for (const loc of CODEOWNERS_LOCATIONS) {
    try {
      const text = await rawFile(f, owner, repo, usedRef, loc);
      if (text !== null) {
        files.set(loc, text);
        break;
      }
    } catch (e) {
      if (e instanceof LiveExhumeError && e.code === "rate-limited") throw e;
      notes.push("CODEOWNERS could not be read, so owners show as unowned.");
      break;
    }
  }

  let creature: Creature;
  try {
    creature = await buildCreature({
      repo: { read: (p) => files.get(p) ?? null },
      cacheFs: opts.cacheFs ?? cache(),
      cacheDir: opts.cacheDir ?? "osv",
      kev: opts.feeds.kev,
      epss: opts.feeds.epss,
      lookup: opts.osv ?? osvLookup(f),
      now: opts.now,
      name,
    });
  } catch (e) {
    if (e instanceof LockfileError) {
      const unsupported = /unsupported lockfileVersion/.test(e.message);
      throw new LiveExhumeError(
        unsupported ? "unsupported-lockfile" : "malformed-lockfile",
        unsupported
          ? "This package-lock.json uses lockfileVersion 1, which carries no per-package list. Run npm install with npm 7 or newer to regenerate it, then try again."
          : "package-lock.json is not valid JSON, so nothing was exhumed. Fix the file or try another repository.",
      );
    }
    throw new LiveExhumeError("network", `Exhume stopped: ${(e as Error).message}. Try again.`);
  }

  // No OSV answer for any pinned package is an outage, not a clean repository.
  const pinned = creature.limbs.filter((l) => l.version !== "unknown");
  if (pinned.length > 0 && pinned.every((l) => l.unknownReason === "osv-unavailable")) {
    throw new LiveExhumeError("osv-unavailable", "api.osv.dev did not answer, so no package could be checked. Nothing is marked healthy. Try again in a minute.");
  }
  const unresolved = creature.limbs.filter((l) => l.unknown).length;
  if (unresolved > 0) notes.push(`${unresolved} package${unresolved === 1 ? "" : "s"} could not be checked and stay Rotting (unknown), never Healthy.`);
  notes.push(NPM_ONLY_NOTE);

  const { payloads, omitted } = await buildPayloads(f, creature, name, notes);
  return {
    repo: name,
    ref: usedRef,
    creature,
    limbs: creature.limbs,
    owners: creature.manifests.map((m) => ({ manifest: m.path, owner: m.owner })),
    plate: renderPlate(creature),
    summary: plateSummary(creature),
    feeds: { kev: creature.feeds.kev.date ?? "", epss: creature.feeds.epss.date ?? "" },
    payloads,
    payloadsOmitted: omitted,
    notes,
  };
}
