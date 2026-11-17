// Regenerates fixtures/vulnerable-npm/feeds/ from data/feeds/, keeping only the
// rows for CVEs that appear in out/creature.json (small, committed snapshot).
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const dir = process.argv[2] ?? "fixtures/vulnerable-npm/feeds";
const creature = JSON.parse(readFileSync("out/creature.json", "utf8"));
const cves = new Set<string>(creature.limbs.flatMap((l: any) => l.vulns.flatMap((v: any) => v.cves)));

const kev = JSON.parse(readFileSync("data/feeds/kev.json", "utf8"));
kev.vulnerabilities = kev.vulnerabilities.filter((v: any) => cves.has(String(v.cveID).toUpperCase()));
kev.count = kev.vulnerabilities.length;

const lines = readFileSync("data/feeds/epss.csv", "utf8").split("\n");
const epss = [...lines.slice(0, 2), ...lines.slice(2).filter((r) => cves.has(r.split(",")[0]!.toUpperCase()))];

mkdirSync(dir, { recursive: true });
writeFileSync(`${dir}/kev.json`, JSON.stringify(kev, null, 2) + "\n");
writeFileSync(`${dir}/epss.csv`, epss.join("\n") + "\n");
console.log(`${dir}: ${kev.count} KEV rows, ${epss.length - 2} EPSS rows`);
