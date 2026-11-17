// npm run gallery:snapshot: out/census/*.json (from npm run census) -> web/gallery-data/<slug>.json (committed).
// Each file holds one repository's own public scan data: packages that need attention, no owners, no totals across repositories.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { parseRepos } from "./census/aggregate.js";
import { slugForRepo, snapshotCreature } from "../src/site/gallery.js";

const OUT = "web/gallery-data";
const repos = parseRepos(readFileSync("docs/census/repos.md", "utf8"));
mkdirSync(OUT, { recursive: true });
for (const r of repos) {
  const raw = JSON.parse(readFileSync(`out/census/${r.repo.replace("/", "__")}.json`, "utf8"));
  const snap = snapshotCreature(raw, r.repo, r.sha);
  if (!snap) throw new Error(`gallery: ${r.repo}: not a creature file`);
  writeFileSync(`${OUT}/${slugForRepo(r.repo)}.json`, JSON.stringify(snap, null, 2) + "\n");
  console.log(`gallery: ${r.repo}: ${snap.limbs.length} of ${snap.scannedLimbs} packages kept`);
}
