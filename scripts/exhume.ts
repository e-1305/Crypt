import { mkdirSync, writeFileSync } from "node:fs";
import { basename, dirname, isAbsolute, resolve } from "node:path";
import { NoManifestError, buildCreature, serializeCreature, summarize } from "../src/exhume/creature.js";
import { parseEpss, parseKev } from "../src/exhume/feeds.js";
import { LockfileError } from "../src/exhume/lockfile.js";
import { CODEOWNERS_LOCATIONS } from "../src/exhume/owners.js";
import type { ExhumeFs } from "../src/exhume/types.js";
import { collectSources } from "../src/exhume/usage-sources.js";
import { creatureRepoName, packageJsonName } from "../src/exhume/name.js";
import { buildImportedCreature } from "../src/import/build.js";
import { ImportError, isImportFormat } from "../src/import/index.js";
import { nodeFs } from "./node-fs.js";
import { osvLookup } from "./osv-client.js";

const USAGE =
  "usage: crypt exhume <path-or-github-url> [--out out/creature.json] [--feeds data/feeds] [--cache data/cache/osv] [--offline] [--name repo] [--from sarif|dependabot|trivy|grype|snyk]";

function parseArgs(argv: string[]) {
  const o = { target: "", out: "out/creature.json", feeds: "data/feeds", cache: "data/cache/osv", offline: false, name: "", from: "" };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--offline") o.offline = true;
    else if (a === "--out" || a === "--feeds" || a === "--cache" || a === "--name" || a === "--from") {
      const v = argv[++i];
      if (!v) throw new Error(`${a} needs a value`);
      o[a.slice(2) as "out" | "feeds" | "cache" | "name" | "from"] = v;
    } else if (a.startsWith("--") || o.target) throw new Error(`unexpected argument ${a}`);
    else o.target = a;
  }
  if (!o.target) throw new Error("missing target");
  return o;
}

const GITHUB = /^https:\/\/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?\/?$/;
const FILES = ["package-lock.json", "requirements.txt", ...CODEOWNERS_LOCATIONS];

const FETCH_TIMEOUT_MS = 20_000;
const MAX_FEED_AGE_DAYS = 7;

/** A missing file (404) is normal. Any other failure aborts, so it is never mistaken for an empty repository. */
async function githubRepo(owner: string, repo: string): Promise<Pick<ExhumeFs, "read">> {
  const files = new Map<string, string>();
  for (const f of FILES) {
    const url = `https://raw.githubusercontent.com/${owner}/${repo}/HEAD/${f}`;
    let res: Response;
    try {
      res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    } catch (e) {
      throw new Error(`could not fetch ${f} from ${owner}/${repo}: ${(e as Error).message}`);
    }
    if (res.status === 404) continue;
    if (!res.ok) throw new Error(`could not fetch ${f} from ${owner}/${repo}: HTTP ${res.status} (private repository or rate limit?)`);
    files.set(f, await res.text());
  }
  return { read: (p) => files.get(p) ?? null };
}

/** One raw file for the usage scan. Null on any failure: usage then reads unknown. */
async function githubSource(owner: string, repo: string, path: string): Promise<string | null> {
  try {
    const res = await fetch(`https://raw.githubusercontent.com/${owner}/${repo}/HEAD/${path}`, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    return res.ok ? await res.text() : null;
  } catch {
    return null;
  }
}

function warnIfStale(name: string, date: string | undefined): void {
  if (!date) return;
  const days = (Date.now() - Date.parse(date)) / 86_400_000;
  if (Number.isNaN(days) || days > MAX_FEED_AGE_DAYS)
    console.error(`exhume: warning: ${name} feed is older than ${MAX_FEED_AGE_DAYS} days (${date}). Run npm run feeds:update.`);
}

async function main(): Promise<void> {
  const a = parseArgs(process.argv.slice(2));
  if (a.from) {
    if (!isImportFormat(a.from)) throw new Error(`--from must be sarif, dependabot, trivy, grype or snyk, got '${a.from.slice(0, 20)}'`);
    const text = nodeFs(dirname(resolve(a.target))).read(basename(a.target));
    if (text === null) throw new Error(`cannot read ${a.target}`);
    const feedFs = nodeFs(a.feeds);
    const kevText = feedFs.read("kev.json");
    const epssText = feedFs.read("epss.csv");
    const kev = kevText === null ? null : parseKev(kevText);
    const epss = epssText === null ? null : parseEpss(epssText);
    // Build first: an invalid file throws here and nothing is written.
    const creature = buildImportedCreature({ format: a.from, text, file: basename(a.target), name: a.name || basename(a.target).replace(/\.json$/i, ""), kev, epss });
    warnIfStale("KEV", kev?.date);
    warnIfStale("EPSS", epss?.date);
    mkdirSync(dirname(a.out), { recursive: true });
    writeFileSync(a.out, serializeCreature(creature));
    console.log(summarize(creature));
    console.log(`  wrote ${a.out}`);
    return;
  }
  const gh = GITHUB.exec(a.target);
  const repo = gh ? await githubRepo(gh[1]!, gh[2]!) : nodeFs(a.target);
  // Feeds only come from --feeds (default data/feeds), never from the scanned repository.
  const feedFs = nodeFs(a.feeds);
  const kevText = feedFs.read("kev.json");
  const epssText = feedFs.read("epss.csv");
  const kev = kevText === null ? null : parseKev(kevText);
  const epss = epssText === null ? null : parseEpss(epssText);
  // The name comes from the scanned target (or --name when the CLI scans a temporary clone), never from the cwd.
  const name = a.name || creatureRepoName(a.target, () => packageJsonName(gh ? null : nodeFs(a.target).read("package.json")), resolve(a.target));
  // Static import scan. Both a local folder and a GitHub URL use the same bounded crawl as the paste flow; a failure leaves usage unknown.
  const sources = await collectSources(gh ? (p) => githubSource(gh[1]!, gh[2]!, p) : (p) => repo.read(p)).catch(() => null);
  const creature = await buildCreature({
    repo,
    name,
    sources,
    cacheFs: nodeFs(isAbsolute(a.cache) ? "/" : "."), // an absolute --cache must not be re-rooted under the cwd
    cacheDir: a.cache,
    kev,
    epss,
    now: Date.now(),
    lookup: a.offline
      ? undefined
      : osvLookup((url, init) => fetch(url, { ...init, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })),
  });
  warnIfStale("KEV", kev?.date);
  warnIfStale("EPSS", epss?.date);
  mkdirSync(dirname(a.out), { recursive: true });
  writeFileSync(a.out, serializeCreature(creature));
  console.log(summarize(creature));
  console.log(`  wrote ${a.out}`);
}

main().catch((e) => {
  console.error(e instanceof LockfileError || e instanceof NoManifestError || e instanceof ImportError ? `exhume: ${e.message}` : `exhume: ${(e as Error).message}\n${USAGE}`);
  process.exit(1);
});
