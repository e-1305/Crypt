// Acceptance check for raise: plays out/creature.z8 with dfrotz, feeds the transcript through
// parseGameOutput and the watcher in a temp dir, and asserts 1 graft request for jquery, 0 after seal.
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseGameOutput } from "../src/bridge/parse-output.js";
import { createWatcher, nodeFsOps } from "../src/bridge/watch.js";
import { buildTranscript } from "./play.js";

const story = process.argv[2] ?? "out/creature.z8";
const commands = ["EXAMINE JQUERY", "ASSIGN JQUERY", "GRAFT JQUERY", "SEAL CRYPT", "GRAFT LODASH"];
const errors: string[] = [];

if (!existsSync(story)) {
  console.error(`raise check FAILED: ${story} not found (run npm run raise first)`);
  process.exit(1);
}
const r = spawnSync(".toolchain/frotz/dfrotz", ["-m", "-p", story], {
  input: commands.join("\n") + "\n",
  encoding: "utf8",
  timeout: 20000,
});
if (r.error || r.status !== 0) {
  console.error(`raise check FAILED: dfrotz failed: ${r.error?.message ?? `exit ${r.status}`}`);
  process.exit(1);
}
const text = buildTranscript(commands, r.stdout);
const events = parseGameOutput(text);
const seen = events.map((e) => (e.ok ? e.command : "REJECTED"));
const expected = ["EXAMINE JQUERY", "ASSIGN JQUERY", "GRAFT JQUERY", "SEAL CRYPT", "GRAFT LODASH"];
if (seen.join("|") !== expected.join("|")) errors.push(`expected events ${expected.join(", ")}; got ${seen.join(", ")}`);

const dir = mkdtempSync(join(tmpdir(), "crypt-raise-"));
const w = createWatcher({
  fs: nodeFsOps,
  sealPath: join(dir, ".crypt-seal"),
  auditPath: join(dir, "crypt-audit.log"),
  requestsDir: join(dir, "requests"),
  now: () => new Date(),
});
// Feed one command at a time so requests can be counted before and after the seal.
const requests = () => (existsSync(join(dir, "requests")) ? readdirSync(join(dir, "requests")) : []);
const lines = text.split("\n");
let before = 0;
let after = 0;
let sealed = false;
for (const line of lines) {
  w.processText(line + "\n");
  if (line.startsWith("[[CRYPT SEAL]]")) {
    before = requests().length;
    sealed = true;
  }
}
after = requests().length - before;
if (!sealed) errors.push("no SEAL marker seen");
const files = requests();
if (before !== 1 || !files[0]?.endsWith("-jquery.json")) errors.push(`expected 1 graft request for jquery before seal, found: ${files.join(", ") || "none"}`);
if (after !== 0) errors.push(`expected 0 requests after seal, found ${after}`);
const audit = readFileSync(join(dir, "crypt-audit.log"), "utf8").split("\n").filter((l) => l !== "").map((l) => l.split("\t")[3]);
if (audit.join(",") !== "OK,OK,REQUEST_WRITTEN,SEALED,REJECTED_SEALED") errors.push(`unexpected audit outcomes: ${audit.join(",")}`);

if (errors.length > 0) {
  console.error("raise check FAILED:\n  " + errors.join("\n  "));
  process.exit(1);
}
console.log("raise check OK: 1 graft request for jquery, 0 after seal (GRAFT LODASH rejected)");
