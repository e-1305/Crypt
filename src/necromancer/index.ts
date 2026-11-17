// Necromancer: graft request -> one PR that bumps one dependency. Never lands a PR.
// Fail-safe: SEAL first (zero calls), unknown or unspawned limb or any ambiguity gives no PR.
import type { Io } from "../common/io.js";
import {
  audit,
  branchFile,
  isSealed,
  lookupLimb,
  readPrRecords,
  readState,
  tryAudit,
  type AgentOutcome,
  type AgentPaths,
  type PrRecord,
} from "../common/agent.js";
import type { FileChange, GithubClient } from "../github/client.js";
import type { RegistryClient, RegistryVersion } from "../registry/types.js";
import { BUMP_MESSAGES, bumpLockfile, jsonIndent, respec } from "./lockfile.js";
import { SABOTAGE_BODY_LINE, SABOTAGE_PATH, SABOTAGE_TITLE_PREFIX, sabotageSmokeTest } from "./sabotage.js";
import { chooseVersion, type Advisory } from "./version.js";

export const MAX_PRS_PER_RAID = 5;

/** Returns the advisory with OSV affected ranges for an ID, or null when it cannot be had. */
export type AdvisoryLookup = (id: string) => Promise<Advisory | null>;

export interface NecromancerCtx extends AgentPaths {
  io: Io;
  client: GithubClient;
  advisories: AdvisoryLookup;
  /** Directory of the target repository checkout (package.json, package-lock.json). */
  targetDir: string;
  now: () => Date;
  /** Registry metadata source. Required whenever the client is not a dry run. */
  registry?: RegistryClient;
  /** Demo only: add a deliberately failing test to the PR. */
  sabotage?: boolean;
}

export interface GraftResult {
  outcome: AgentOutcome;
  branch?: string;
  breaking?: boolean;
}

interface CreatureLimb {
  ecosystem: string;
  name: string;
  version: string;
  owner?: string;
  spawned?: boolean;
  kev?: boolean;
  epss?: number | null;
  vulns?: { id: string; cves?: string[] }[];
}

export interface PrFields {
  limb: string;
  name: string;
  from: string;
  to: string;
  breaking: boolean;
  cves: string[];
  kev: boolean;
  epss: number | null;
  owner: string;
  auditId: string;
  /** True when `resolved` and `integrity` come from registry metadata. */
  fromRegistry?: boolean;
  sabotage?: boolean;
}

/** PR body. Built from creature.json only (owners from CODEOWNERS); never from git history. */
export function prBody(f: PrFields): string {
  return [
    `Limb: ${f.limb} (${f.name})`,
    `Version: ${f.from} -> ${f.to}`,
    `CVEs: ${f.cves.length ? f.cves.join(", ") : "none listed"}`,
    `KEV: ${f.kev ? "yes" : "no"}`,
    `EPSS: ${f.epss === null ? "unknown" : f.epss.toFixed(5)}`,
    `Owner: ${f.owner || "unowned"}`,
    `Healed by: (pending)`,
    `Audit ID: ${f.auditId}`,
    ...(f.breaking ? ["breaking: true"] : []),
    "",
    ...(f.sabotage ? [SABOTAGE_BODY_LINE, ""] : []),
    f.fromRegistry
      ? "One dependency per PR. package-lock.json: `version`, `resolved` and `integrity` for this package come from the npm registry metadata. Nothing was installed or run."
      : "One dependency per PR. package-lock.json: `resolved` and `integrity` for this package were removed and refresh on the next `npm install`.",
    "A human lands this PR after CI is green.",
    "",
  ].join("\n");
}

type Json = Record<string, unknown>;
const isObj = (v: unknown): v is Json => typeof v === "object" && v !== null && !Array.isArray(v);

/** Edits package.json and package-lock.json texts. Returns null when the dependency is not found in both. */
export function editManifests(
  pkgText: string,
  lockText: string,
  name: string,
  version: string,
): { pkg: string; lock: string } | null {
  const pkg: unknown = JSON.parse(pkgText);
  const lock: unknown = JSON.parse(lockText);
  if (!isObj(pkg) || !isObj(lock)) return null;
  let found = false;
  const bump = (deps: unknown): void => {
    if (isObj(deps) && typeof deps[name] === "string") {
      deps[name] = respec(deps[name] as string, version);
      found = true;
    }
  };
  for (const k of ["dependencies", "devDependencies", "optionalDependencies"]) bump(pkg[k]);
  if (!found) return null;
  let lockFound = false;
  const packages = lock.packages;
  if (isObj(packages)) {
    const root = packages[""];
    if (isObj(root)) for (const k of ["dependencies", "devDependencies", "optionalDependencies"]) bump(root[k]);
    const entry = packages[`node_modules/${name}`];
    if (isObj(entry)) {
      entry.version = version;
      delete entry.resolved;
      delete entry.integrity;
      lockFound = true;
    }
  }
  const legacy = lock.dependencies;
  if (isObj(legacy) && isObj(legacy[name])) {
    const e = legacy[name] as Json;
    e.version = version;
    delete e.resolved;
    delete e.integrity;
    lockFound = true;
  }
  if (!lockFound) return null;
  return {
    pkg: JSON.stringify(pkg, null, jsonIndent(pkgText)) + "\n",
    lock: JSON.stringify(lock, null, jsonIndent(lockText)) + "\n",
  };
}

export function auditIdFor(now: Date, limb: string): string {
  return `AUD-${now.toISOString().replace(/\D/g, "").slice(0, 14)}-${limb}`;
}

/** Handles one graft request file. Never throws for expected failures; the outcome is audited. */
export async function graft(ctx: NecromancerCtx, requestPath: string): Promise<GraftResult> {
  const { io } = ctx;
  const log = (command: string, limb: string, outcome: AgentOutcome, url = "-") =>
    audit(io, ctx.auditPath, ctx.now, command, limb, outcome, url);
  const logSafe = (command: string, limb: string, outcome: AgentOutcome) =>
    tryAudit(io, ctx.auditPath, ctx.now, command, limb, outcome);

  let limb = "-";
  try {
    let req: unknown;
    try {
      req = JSON.parse(io.readText(requestPath));
    } catch {
      req = null;
    }
    const rawLimb = isObj(req) && typeof req.limb === "string" ? req.limb : "";
    const command = rawLimb ? `GRAFT ${rawLimb}`.slice(0, 64) : "GRAFT";
    if (isSealed(io, ctx.sealPath)) {
      logSafe(command, rawLimb || "-", "REJECTED_SEALED");
      return { outcome: "REJECTED_SEALED" };
    }
    const ref = lookupLimb(io, ctx.limbsPath, rawLimb);
    if (!ref) {
      log(command, "-", "REJECTED_UNKNOWN_LIMB");
      return { outcome: "REJECTED_UNKNOWN_LIMB" };
    }
    limb = rawLimb;
    const done = (outcome: AgentOutcome, extra: Partial<GraftResult> = {}, url = "-"): GraftResult => {
      log(command, limb, outcome, url);
      return { outcome, ...extra };
    };

    const creature: unknown = JSON.parse(io.readText(ctx.creaturePath));
    const limbs = isObj(creature) && Array.isArray(creature.limbs) ? (creature.limbs as CreatureLimb[]) : [];
    const cl = limbs.find((l) => l && l.ecosystem === ref.ecosystem && l.name === ref.name && l.version === ref.version);
    if (!cl || cl.spawned !== true) return done("REFUSED_NOT_SPAWNED");
    if (ref.ecosystem !== "npm") return done("NO_FIX_AVAILABLE");

    const vulns = Array.isArray(cl.vulns) ? cl.vulns : [];
    const advisories: Advisory[] = [];
    for (const v of vulns) {
      const a = await ctx.advisories(v.id);
      if (!a) return done("ERROR"); // missing evidence: change nothing
      advisories.push(a);
    }
    const choice = chooseVersion(ref.ecosystem, ref.name, ref.version, advisories);
    if (!choice) return done("NO_FIX_AVAILABLE");

    const branch = `crypt/graft-${limb.toLowerCase()}-${choice.version}${ctx.sabotage === true ? "-sabotage" : ""}`;
    const records: PrRecord[] = readPrRecords(io, ctx.prsDir);
    if (records.some((r) => r.branch === branch || r.limb === limb)) return done("PR_EXISTS");
    // A raid is the set of PRs not yet healed: healed and rejected records do not count.
    const state = readState(io, ctx.statePath);
    const open = records.filter((r) => state.limbs[r.limb]?.state !== "healed");
    if (open.length >= MAX_PRS_PER_RAID) return done("RAID_LIMIT");

    // Live mode (a client that writes to a remote): registry metadata is required before any GitHub write.
    const live = !ctx.client.dryRun;
    let meta: RegistryVersion | null = null;
    if (ctx.registry) {
      meta = await ctx.registry.getVersion(ref.name, choice.version);
      if (meta.version !== choice.version) throw new Error(`registry answered ${meta.version} for ${choice.version}`);
    } else if (live) {
      throw new Error("npm registry client is required for a live graft");
    }
    const readFile = (path: string): Promise<string> | string =>
      live ? ctx.client.readBaseFile(path) : io.readText(`${ctx.targetDir}/${path}`);
    const pkgText = await readFile("package.json");
    const lockText = await readFile("package-lock.json");
    let edited: { pkg: string; lock: string } | null;
    if (meta) {
      const r = bumpLockfile({ pkgText, lockText, name: ref.name, from: ref.version, meta, fixed: choice.version });
      if (!r.ok) {
        process.stderr.write(`necromancer: ${BUMP_MESSAGES[r.reason]} (${r.reason})\n`);
        return done(r.reason === "not-direct-dependency" || r.reason === "lock-entry-count" ? "NO_FIX_AVAILABLE" : "ERROR");
      }
      edited = r;
    } else {
      edited = editManifests(pkgText, lockText, ref.name, choice.version);
    }
    if (!edited) return done("NO_FIX_AVAILABLE");
    const sabotage = ctx.sabotage === true;
    const files: FileChange[] = [
      { path: "package.json", content: edited.pkg },
      { path: "package-lock.json", content: edited.lock },
    ];
    if (sabotage) files.push({ path: SABOTAGE_PATH, content: sabotageSmokeTest(await readFile(SABOTAGE_PATH)) });

    const auditId = auditIdFor(ctx.now(), limb);
    const cves = [...new Set(vulns.flatMap((v) => (Array.isArray(v.cves) ? v.cves : [])))].sort();
    const body = prBody({
      limb,
      name: ref.name,
      from: ref.version,
      to: choice.version,
      breaking: choice.breaking,
      cves,
      kev: cl.kev === true,
      epss: typeof cl.epss === "number" ? cl.epss : null,
      owner: typeof cl.owner === "string" ? cl.owner : "",
      auditId,
      fromRegistry: meta !== null,
      sabotage,
    });
    const title = `${sabotage ? SABOTAGE_TITLE_PREFIX : ""}fix: graft ${ref.name} ${ref.version} to ${choice.version} (${limb})`;
    await ctx.client.createBranchWithFiles({ branch, message: title, files });
    let pr: { number: number; url: string; headSha?: string };
    try {
      pr = await ctx.client.openPullRequest({
        branch,
        title,
        body,
        meta: { limb, ecosystem: ref.ecosystem, name: ref.name, from: ref.version, to: choice.version, breaking: choice.breaking },
      });
    } catch (e) {
      // The branch exists but no PR does: remove it so no orphan remains (best effort).
      if (ctx.client.deleteBranch && branch.startsWith("crypt/")) await ctx.client.deleteBranch(branch).catch(() => undefined);
      throw e;
    }
    if (!ctx.client.dryRun) {
      io.mkdirp(ctx.prsDir);
      const rec = {
        branch, limb, ecosystem: ref.ecosystem, name: ref.name, from: ref.version, to: choice.version, breaking: choice.breaking,
        number: pr.number, url: pr.url, headSha: pr.headSha, sabotage, auditId,
      };
      io.writeText(`${ctx.prsDir}/${branchFile(branch)}`, JSON.stringify(rec, null, 2) + "\n");
    }
    return done("PR_OPENED", { branch, breaking: choice.breaking }, pr.url);
  } catch (e) {
    process.stderr.write(`necromancer: ${(e as Error).message}\n`);
    logSafe("GRAFT", limb, "ERROR");
    return { outcome: "ERROR" };
  }
}
