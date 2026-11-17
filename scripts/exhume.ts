import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute } from "node:path";
import { NoManifestError, buildCreature, serializeCreature, summarize } from "../src/exhume/creature.js";
import { parseEpss, parseKev } from "../src/exhume/feeds.js";
import { LockfileError } from "../src/exhume/lockfile.js";
import { CODEOWNERS_LOCATIONS } from "../src/exhume/owners.js";
import type { ExhumeFs } from "../src/exhume/types.js";
import { nodeFs } from "./node-fs.js";
import { osvLookup } from "./osv-client.js";

const USAGE =
  "usage: crypt exhume <path-or-github-url> [--out out/creature.json] [--feeds data/feeds] [--cache data/cache/osv] [--offline]";

function parseArgs(argv: string[]) {
  const o = { target: "", out: "out/creature.json", feeds: "data/feeds", cache: "data/cache/osv", offline: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--offline") o.offline = true;
    else if (a === "--out" || a === "--feeds" || a === "--cache") {
      const v = argv[++i];
      if (!v) throw new Error(`${a} needs a value`);
      o[a.slice(2) as "out" | "feeds" | "cache"] = v;
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

function warnIfStale(name: string, date: string | undefined): void {
  if (!date) return;
  const days = (Date.now() - Date.parse(date)) / 86_400_000;
  if (Number.isNaN(days) || days > MAX_FEED_AGE_DAYS)
    console.error(`exhume: warning: ${name} feed is older than ${MAX_FEED_AGE_DAYS} days (${date}). Run npm run feeds:update.`);
}

async function main(): Promise<void> {
  const a = parseArgs(process.argv.slice(2));
  const gh = GITHUB.exec(a.target);
  const repo = gh ? await githubRepo(gh[1]!, gh[2]!) : nodeFs(a.target);
  // Feeds only come from --feeds (default data/feeds), never from the scanned repository.
  const feedFs = nodeFs(a.feeds);
  const kevText = feedFs.read("kev.json");
  const epssText = feedFs.read("epss.csv");
  const kev = kevText === null ? null : parseKev(kevText);
  const epss = epssText === null ? null : parseEpss(epssText);
  const creature = await buildCreature({
    repo,
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
  console.error(e instanceof LockfileError || e instanceof NoManifestError ? `exhume: ${e.message}` : `exhume: ${(e as Error).message}\n${USAGE}`);
  process.exit(1);
});
