#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const [cmd, ...rest] = process.argv.slice(2);
if (cmd !== "exhume") {
  console.error("usage: crypt exhume <path-or-github-url> [options]");
  process.exit(2);
}
const script = fileURLToPath(new URL("../scripts/exhume.ts", import.meta.url));
const r = spawnSync(process.execPath, ["--import", "tsx", script, ...rest], { stdio: "inherit" });
process.exit(r.status ?? 1);
