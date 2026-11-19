import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { buildCreature } from "../src/exhume/creature.js";
import { parseEpss, parseKev } from "../src/exhume/feeds.js";
import { compareRows, renderSummary, renderTable } from "../src/compare/dependabot.js";
import { nodeFs } from "./node-fs.js";

const FEEDS = "fixtures/vulnerable-npm/feeds";
const BEGIN = "<!-- compare:dependabot begin -->";
const END = "<!-- compare:dependabot end -->";

/** Offline: no lookup is passed, so OSV answers come from data/cache/osv only. */
export async function generate(): Promise<string> {
  const creature = await buildCreature({
    repo: nodeFs("fixtures/crypt-demo"),
    cacheFs: nodeFs("."),
    cacheDir: "data/cache/osv",
    kev: parseKev(readFileSync(`${FEEDS}/kev.json`, "utf8")),
    epss: parseEpss(readFileSync(`${FEEDS}/epss.csv`, "utf8")),
  });
  const rows = compareRows(creature);
  return `${renderTable(rows)}\n\n${renderSummary(rows)}\n`;
}

async function main(): Promise<void> {
  const out = await generate();
  if (process.argv.includes("--check")) {
    const doc = readFileSync("docs/VS-DEPENDABOT.md", "utf8");
    const i = doc.indexOf(BEGIN);
    const j = doc.indexOf(END);
    if (i < 0 || j < i) throw new Error("docs/VS-DEPENDABOT.md has no generated block");
    if (doc.slice(i + BEGIN.length, j).trim() !== out.trim()) {
      console.error("compare:dependabot: docs/VS-DEPENDABOT.md is out of date. Paste the output of npm run compare:dependabot between the markers.");
      process.exit(1);
    }
    console.log("docs/VS-DEPENDABOT.md matches the script output");
    return;
  }
  process.stdout.write(out);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1])
  main().catch((e) => {
    console.error(`compare:dependabot: ${(e as Error).message}`);
    process.exit(1);
  });
