// Acceptance check for the Necromancer, offline. On the fixture, in dry-run:
// GRAFT JQUERY gives one PR payload bumping jquery to a fixed version; SEAL CRYPT then GRAFT LODASH gives none.
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createWatcher, nodeFsOps } from "../src/bridge/watch.js";
import { defaultPaths } from "../src/common/agent.js";
import { nodeIo } from "../src/common/io.js";
import { dryRunClient } from "../src/github/client.js";
import { graft } from "../src/necromancer/index.js";
import { generate } from "../src/raise/generate.js";
import { fixtureAdvisories } from "./osv-advisory.js";

const errors: string[] = [];
const dir = mkdtempSync(join(tmpdir(), "crypt-necro-"));
const fixture = "fixtures/vulnerable-npm";

const ex = spawnSync("npx", ["tsx", "scripts/exhume.ts", fixture, "--feeds", `${fixture}/feeds`, "--offline"], { encoding: "utf8" });
if (ex.status !== 0 || !existsSync("out/creature.json")) {
  console.error(`necromancer check FAILED: exhume failed\n${ex.stdout}${ex.stderr}`);
  process.exit(1);
}
const creatureText = readFileSync("out/creature.json", "utf8");
mkdirSync(join(dir, "out"), { recursive: true });
writeFileSync(join(dir, "out", "creature.json"), creatureText);
writeFileSync(join(dir, "out", "limbs.json"), JSON.stringify(generate(JSON.parse(creatureText)).limbs));
const target = join(dir, "target");
cpSync(fixture, target, { recursive: true });

const paths = defaultPaths(dir);
const now = () => new Date();
const ctx = {
  ...paths,
  io: nodeIo,
  client: dryRunClient(nodeIo, paths.prsDir, now),
  advisories: fixtureAdvisories(`${fixture}/advisories`),
  targetDir: target,
  now,
};
const watcher = createWatcher({
  fs: nodeFsOps,
  sealPath: paths.sealPath,
  auditPath: paths.auditPath,
  requestsDir: join(dir, "out", "requests"),
  limbsPath: paths.limbsPath,
  now,
});
const requests = () => nodeIo.listDir(join(dir, "out", "requests")).map((f) => join(dir, "out", "requests", f));
const payloads = () => nodeIo.listDir(paths.prsDir);

async function main(): Promise<void> {
  watcher.processText("> GRAFT JQUERY\n[[CRYPT GRAFT JQUERY]]\nok\n");
  const first = requests();
  if (first.length !== 1) errors.push(`expected 1 graft request, found ${first.length}`);
  for (const r of first) await graft(ctx, r);
  const p = payloads();
  if (p.length !== 1) errors.push(`expected 1 PR payload, found ${p.length}: ${p.join(", ")}`);
  else {
    const pay = JSON.parse(readFileSync(join(paths.prsDir, p[0]!), "utf8"));
    if (pay.name !== "jquery" || pay.from !== "3.4.1" || pay.to !== "3.5.0") errors.push(`unexpected bump ${pay.name} ${pay.from} -> ${pay.to}`);
    if (pay.breaking !== false) errors.push(`breaking should be false for 3.4.1 -> 3.5.0, got ${pay.breaking}`);
    if (pay.branch !== "crypt/graft-jquery-3.5.0") errors.push(`unexpected branch ${pay.branch}`);
    const pkg = pay.files.find((f: { path: string }) => f.path === "package.json");
    if (!pkg || JSON.parse(pkg.content).dependencies.jquery !== "3.5.0") errors.push("package.json in payload does not pin jquery 3.5.0");
    for (const need of ["Limb: JQUERY", "CVE-2020-11022", "KEV: yes", "EPSS:", "Owner: @crypt-fixture/supply-chain", "Healed by: (pending)", "Audit ID: AUD-"]) {
      if (!pay.body.includes(need)) errors.push(`PR body lacks "${need}"`);
    }
  }
  watcher.processText("> SEAL CRYPT\n[[CRYPT SEAL]]\nok\n> GRAFT LODASH\n[[CRYPT GRAFT LODASH]]\nok\n");
  // Even a request file that reaches the Necromancer after the seal produces nothing.
  writeFileSync(join(dir, "late.json"), JSON.stringify({ limb: "LODASH" }));
  await graft(ctx, join(dir, "late.json"));
  if (requests().length !== 1) errors.push("a graft request was written after SEAL");
  if (payloads().length !== 1) errors.push(`expected still 1 payload after SEAL, found ${payloads().length}`);
  const outcomes = readFileSync(paths.auditPath, "utf8").split("\n").filter(Boolean).map((l) => l.split("\t")[3]);
  const expected = "REQUEST_WRITTEN,PR_OPENED,SEALED,REJECTED_SEALED,REJECTED_SEALED";
  if (outcomes.join(",") !== expected) errors.push(`audit outcomes ${outcomes.join(",")}, expected ${expected}`);
  if (errors.length > 0) {
    console.error("necromancer check FAILED:\n  " + errors.join("\n  "));
    process.exit(1);
  }
  console.log("necromancer check OK: GRAFT JQUERY gave 1 payload (jquery 3.4.1 -> 3.5.0, breaking false); 0 after SEAL CRYPT");
}

main().catch((e) => {
  console.error(`necromancer check FAILED: ${(e as Error).message}`);
  process.exit(1);
});
