#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const [cmd, ...rest] = process.argv.slice(2);
const SCRIPTS = { exhume: "exhume.ts", raise: "raise.ts" };
if (!Object.hasOwn(SCRIPTS, cmd ?? "")) {
  console.error("usage: crypt exhume <path-or-github-url> [options] | crypt raise [out/creature.json] [--out out]");
  process.exit(2);
}
const script = fileURLToPath(new URL(`../scripts/${SCRIPTS[cmd]}`, import.meta.url));
const r = spawnSync(process.execPath, ["--import", "tsx", script, ...rest], { stdio: "inherit" });
process.exit(r.status ?? 1);
