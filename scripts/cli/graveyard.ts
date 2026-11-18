// crypt graveyard: scan every repository of an organisation (read-only GitHub GETs) and write out/graveyard.json.
// The token is read from the environment variable named by --token-env. It is never printed, logged or written.
// The file stays on this machine: nothing is uploaded. Open it in the Graveyard page to see the tombs.
import { dirname, join, resolve } from "node:path";
import { audit, defaultPaths, isSealed } from "../../src/common/agent.js";
import { nodeIo, type Io } from "../../src/common/io.js";
import { CliError, EXIT } from "../../src/cli/exit.js";
import type { Parsed } from "../../src/cli/parse.js";
import { buildCreature } from "../../src/exhume/creature.js";
import { parseEpss, parseKev } from "../../src/exhume/feeds.js";
import { osvLookup } from "../../src/exhume/osv-client.js";
import { CODEOWNERS_LOCATIONS } from "../../src/exhume/owners.js";
import type { ExhumeFs } from "../../src/exhume/types.js";
import { fromExhume, safeRepo, serializeGraveyard, type RepoRecord } from "../../src/graveyard/model.js";
import { SAMPLE_REPOS } from "../../src/graveyard/sample.js";
import { makeCall, redact, type Fetcher } from "../github-client.js";
import { SEAL_NOTICE } from "./session.js";

export const DEFAULT_OUT = "out/graveyard.json";
/** One run reads at most this many repositories. Name more with several runs and --repos. */
export const MAX_REPOS_PER_RUN = 100;
const PAGE = 100;

export interface GraveyardDeps {
  cwd?: string;
  io?: Io;
  now?: () => number;
  env?: Record<string, string | undefined>;
  fetchImpl?: Fetcher;
  /** Fetch for OSV. It never carries the token. Default: the global fetch. */
  osvFetchImpl?: Fetcher;
  /** Directory with kev.json and epss.csv. Default: <cwd>/data/feeds. */
  feedsDir?: string;
  out?: (s: string) => void;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

function decode(v: unknown): string | null {
  if (!isObj(v)) return null;
  if (v.encoding === "base64" && typeof v.content === "string" && v.content !== "") return Buffer.from(v.content, "base64").toString("utf8");
  return null;
}

/** One file of a repository at HEAD, or null on 404. Large files (no inline content) come from the blob API. */
async function readFile(call: ReturnType<typeof makeCall>, repo: string, path: string): Promise<string | null> {
  const enc = path.split("/").map(encodeURIComponent).join("/");
  let meta: unknown;
  try {
    meta = await call("GET", `/repos/${repo}/contents/${enc}`);
  } catch (e) {
    if ((e as { status?: number }).status === 404) return null;
    throw e;
  }
  const inline = decode(meta);
  if (inline !== null) return inline;
  const sha = isObj(meta) && typeof meta.sha === "string" && /^[0-9a-f]{40,64}$/.test(meta.sha) ? meta.sha : null;
  if (sha === null) return null;
  return decode(await call("GET", `/repos/${repo}/git/blobs/${sha}`));
}

async function listRepos(call: ReturnType<typeof makeCall>, org: string): Promise<string[]> {
  const names: string[] = [];
  for (let page = 1; names.length < MAX_REPOS_PER_RUN && page <= 10; page++) {
    let list: unknown;
    try {
      list = await call("GET", `/orgs/${encodeURIComponent(org)}/repos?per_page=${PAGE}&type=all&page=${page}`);
    } catch (e) {
      if ((e as { status?: number }).status !== 404 || page > 1) throw e;
      list = await call("GET", `/users/${encodeURIComponent(org)}/repos?per_page=${PAGE}&page=${page}`);
    }
    if (!Array.isArray(list) || list.length === 0) break;
    for (const r of list) if (isObj(r) && typeof r.full_name === "string" && r.archived !== true) names.push(r.full_name);
    if (list.length < PAGE) break;
  }
  return names.sort().slice(0, MAX_REPOS_PER_RUN);
}

function loadFeeds(io: Io, dir: string) {
  const kev = io.pathState(join(dir, "kev.json")) === "present" ? parseKev(io.readText(join(dir, "kev.json"))) : null;
  const epss = io.pathState(join(dir, "epss.csv")) === "present" ? parseEpss(io.readText(join(dir, "epss.csv"))) : null;
  if (!kev || !epss) throw new CliError(`no usable KEV and EPSS feeds in ${dir}. Run npm run feeds:update, then run the command again.`, EXIT.FAILURE);
  return { kev, epss };
}

export async function graveyardCommand(p: Parsed, deps: GraveyardDeps = {}): Promise<number> {
  const cwd = deps.cwd ?? process.cwd();
  const io = deps.io ?? nodeIo;
  const now = deps.now ?? Date.now;
  const env = deps.env ?? process.env;
  const out = deps.out ?? ((s: string) => void process.stdout.write(s));
  const outPath = typeof p.flags.out === "string" ? p.flags.out : DEFAULT_OUT;
  const target = resolve(cwd, outPath);
  const write = (text: string) => {
    io.mkdirp(dirname(target));
    io.writeText(target, text);
  };

  if (p.flags.sample === true) {
    write(serializeGraveyard({ source: "cli", org: "example-org", repos: SAMPLE_REPOS }));
    out(`Sample graveyard written to ${outPath}. Open it in the Graveyard page.\n`);
    return EXIT.OK;
  }

  const org = typeof p.flags.org === "string" ? p.flags.org : "";
  const tokenEnv = typeof p.flags["token-env"] === "string" ? p.flags["token-env"] : "";
  if (org === "") throw new CliError("graveyard needs --org <org>. Add the organisation login, for example: crypt graveyard --org my-org --token-env GITHUB_TOKEN", EXIT.USAGE);
  if (tokenEnv === "") throw new CliError("graveyard needs --token-env <VAR>, the name of the environment variable that holds a read-only GitHub token. Example: --token-env GITHUB_TOKEN", EXIT.USAGE);
  const token = env[tokenEnv];
  if (!token) throw new CliError(`${tokenEnv} is not set. Export ${tokenEnv} with a read-only GitHub token, then run the command again.`, EXIT.FAILURE);

  const paths = defaultPaths(cwd);
  const stamp = () => new Date(now());
  if (isSealed(io, paths.sealPath)) {
    process.stderr.write(SEAL_NOTICE + " Nothing was read.\n");
    return EXIT.OK;
  }
  io.mkdirp(dirname(paths.auditPath));
  const feeds = loadFeeds(io, deps.feedsDir ?? join(cwd, "data", "feeds"));
  const f = deps.fetchImpl;
  const osvFetch = deps.osvFetchImpl ?? ((deps.fetchImpl as Fetcher | undefined) ?? (fetch as unknown as Fetcher));
  const call = makeCall({ token, fetch: f, audit: (l) => audit(io, paths.auditPath, stamp, "GRAVEYARD", "-", "API_CALL", `${l.method} ${l.path}`) });

  let named: string[] | null = null;
  if (typeof p.flags.repos === "string") {
    const list = p.flags.repos.split(",").map((x) => x.trim()).filter(Boolean);
    const bad = list.filter((x) => safeRepo(x) === "" || x.split("/").some((seg) => /^\.+$/.test(seg)));
    if (bad.length > 0) throw new CliError("--repos must be a comma separated list of owner/name, for example a/b,c/d. Nothing was read.", EXIT.USAGE);
    named = list.slice(0, MAX_REPOS_PER_RUN);
  }

  const scannedAt = now();
  const records: RepoRecord[] = [];
  let skipped = 0;
  const notScanned: string[] = [];
  try {
    const repos = named ?? (await listRepos(call, org));
    for (const repo of repos) {
      const files = new Map<string, string>();
      const lock = await readFile(call, repo, "package-lock.json");
      if (lock === null) {
        skipped++;
        notScanned.push(repo);
        continue;
      }
      files.set("package-lock.json", lock);
      for (const loc of CODEOWNERS_LOCATIONS) {
        const text = await readFile(call, repo, loc);
        if (text !== null) {
          files.set(loc, text);
          break;
        }
      }
      const cache = new Map<string, string>();
      const cacheFs: ExhumeFs = { read: (x) => cache.get(x) ?? null, write: (x, t) => void cache.set(x, t) };
      try {
        const creature = await buildCreature({ repo: { read: (x) => files.get(x) ?? null }, cacheFs, cacheDir: "osv", kev: feeds.kev, epss: feeds.epss, lookup: osvLookup(osvFetch as never), now: scannedAt, name: repo });
        const r = fromExhume(creature, scannedAt);
        if (r) records.push(r);
        else {
          skipped++;
          notScanned.push(repo);
        }
      } catch {
        skipped++;
        notScanned.push(repo);
      }
    }
  } catch (e) {
    const status = (e as { status?: number }).status;
    const hint = status === 403 || status === 429 ? " GitHub is rate limiting requests. Wait for the limit to reset, then run the command again." : status === 401 ? ` Check that ${tokenEnv} holds a valid token.` : "";
    throw new CliError(`graveyard stopped, nothing was written: ${redact(e instanceof Error ? e.message : "request failed", token)}.${hint}`, EXIT.FAILURE);
  }
  write(serializeGraveyard({ source: "cli", org, repos: records }));
  out(`Graveyard written to ${outPath}: ${records.length} repositor${records.length === 1 ? "y" : "ies"}${skipped > 0 ? `, ${skipped} skipped (no package-lock.json or unreadable)` : ""}. The file stays on this machine.\n`);
  if (notScanned.length > 0) out(`Not scanned (never shown as healthy): ${notScanned.slice(0, 50).join(", ")}${notScanned.length > 50 ? `, and ${notScanned.length - 50} more` : ""}.\n`);
  return EXIT.OK;
}
