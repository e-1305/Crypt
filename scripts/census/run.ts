import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { buildCreature, serializeCreature } from "../../src/exhume/creature.js";
import { parseEpss, parseKev } from "../../src/exhume/feeds.js";
import { UNOWNED } from "../../src/exhume/owners.js";
import { nodeFs } from "../node-fs.js";
import { osvLookup } from "../osv-client.js";
import { type RepoCounts, aggregate, leaksProjectName, parseRepos, renderResults } from "./aggregate.js";
import { repoAtSha } from "./fetch.js";

const REPOS = "docs/census/repos.md";
const RESULTS = "docs/census/RESULTS.md";
const OUT = "out/census";
const FEEDS = "data/feeds";
const EXPECTED = 20;
const MAX_FEED_AGE_DAYS = 7;
const FETCH_TIMEOUT_MS = 20_000;

function fail(msg: string): never {
  console.error(`census: ${msg}\nNothing was written to ${RESULTS}.`);
  process.exit(1);
}

async function main(): Promise<void> {
  const repos = parseRepos(readFileSync(REPOS, "utf8"));
  if (repos.length !== EXPECTED) fail(`${REPOS} lists ${repos.length} repositories, expected ${EXPECTED}`);

  const feedFs = nodeFs(FEEDS);
  const kevText = feedFs.read("kev.json");
  const epssText = feedFs.read("epss.csv");
  const kev = kevText === null ? null : parseKev(kevText);
  const epss = epssText === null ? null : parseEpss(epssText);
  if (!kev || !epss) fail(`KEV or EPSS feed missing in ${FEEDS}. Run npm run feeds:update`);
  for (const [name, date] of [["KEV", kev.date], ["EPSS", epss.date]] as const) {
    const days = (Date.now() - Date.parse(date ?? "")) / 86_400_000;
    if (Number.isNaN(days) || days > MAX_FEED_AGE_DAYS) fail(`${name} feed is older than ${MAX_FEED_AGE_DAYS} days (${date}). Run npm run feeds:update`);
  }

  mkdirSync(OUT, { recursive: true });
  const lookup = osvLookup((url, init) => fetch(url, { ...init, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) }));
  const counts: RepoCounts[] = [];
  const perRepo: Record<string, RepoCounts> = {};
  let kevDate: string | null = null;
  let epssDate: string | null = null;
  for (const r of repos) {
    let creature;
    try {
      const repo = await repoAtSha(r.repo, r.sha);
      creature = await buildCreature({ repo, cacheFs: nodeFs("."), cacheDir: `${OUT}/osv-cache`, kev, epss, lookup, now: Date.now() });
    } catch (e) {
      fail(`${r.repo}@${r.sha}: ${(e as Error).message}`);
    }
    const c = creature.counts;
    const row: RepoCounts = {
      limbs: c.limbs,
      findings: c.findings,
      exorcised: c.exorcised,
      spawned: c.spawned,
      unresolved: c.unresolved,
      possessed: c.possessed,
      unknown: c.unknown,
      unowned: creature.limbs.filter((l) => l.owner === UNOWNED).length,
    };
    counts.push(row);
    perRepo[r.repo] = row;
    kevDate = creature.feeds.kev.date;
    epssDate = creature.feeds.epss.date;
    writeFileSync(`${OUT}/${r.repo.replace("/", "__")}.json`, serializeCreature(creature));
    console.log(`census: ${r.ecosystem} ${r.repo}: ${c.limbs} limbs, ${c.findings} findings, ${c.spawned} spawned`);
  }
  writeFileSync(`${OUT}/per-repo.json`, JSON.stringify(perRepo, null, 2) + "\n");

  const text = renderResults(aggregate(counts), { scanDate: new Date().toISOString().slice(0, 10), kevDate, epssDate });
  if (leaksProjectName(text, repos)) fail("the results text names a project; refusing to publish");
  writeFileSync(RESULTS, text);
  console.log(`census: wrote ${RESULTS}`);
}

main().catch((e) => fail((e as Error).message));
