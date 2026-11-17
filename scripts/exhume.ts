import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { buildCreature, serializeCreature, summarize } from "../src/exhume/creature.js";
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

async function githubRepo(owner: string, repo: string): Promise<Pick<ExhumeFs, "read">> {
  const files = new Map<string, string>();
  for (const f of FILES) {
    const res = await fetch(`https://raw.githubusercontent.com/${owner}/${repo}/HEAD/${f}`).catch(() => null);
    if (res?.ok) files.set(f, await res.text());
  }
  return { read: (p) => files.get(p) ?? null };
}

async function main(): Promise<void> {
  const a = parseArgs(process.argv.slice(2));
  const explicitFeeds = process.argv.includes("--feeds");
  const gh = GITHUB.exec(a.target);
  const repo = gh ? await githubRepo(gh[1]!, gh[2]!) : nodeFs(a.target);
  // Default feeds dir: data/feeds. A local target that ships its own feeds/ snapshot (the fixture) is used
  // only when data/feeds has no KEV file, so a fresh clone can run the demo offline.
  const useLocal = !gh && !explicitFeeds && nodeFs(a.feeds).read("kev.json") === null && nodeFs(a.target).read("feeds/kev.json") !== null;
  const feedFs = useLocal ? nodeFs(`${a.target}/feeds`) : nodeFs(a.feeds);
  const kevText = feedFs.read("kev.json");
  const epssText = feedFs.read("epss.csv");
  const creature = await buildCreature({
    repo,
    cacheFs: nodeFs("."),
    cacheDir: a.cache,
    kev: kevText === null ? null : parseKev(kevText),
    epss: epssText === null ? null : parseEpss(epssText),
    lookup: a.offline ? undefined : osvLookup((url, init) => fetch(url, init)),
  });
  mkdirSync(dirname(a.out), { recursive: true });
  writeFileSync(a.out, serializeCreature(creature));
  console.log(summarize(creature));
  console.log(`  wrote ${a.out}`);
}

main().catch((e) => {
  console.error(e instanceof LockfileError ? `exhume: ${e.message}` : `exhume: ${(e as Error).message}\n${USAGE}`);
  process.exit(1);
});
