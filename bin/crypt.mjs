#!/usr/bin/env node
// Thin launcher: runs scripts/cli/main.ts with tsx. tsx is resolved from this package, so the
// current directory can be anywhere. stdio is inherited (stdin reaches the game), the exit code
// and signals are forwarded.
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const main = fileURLToPath(new URL("../scripts/cli/main.ts", import.meta.url));
const child = spawn(process.execPath, ["--import", import.meta.resolve("tsx"), main, ...process.argv.slice(2)], {
  stdio: "inherit",
});
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => child.kill(sig));
child.on("error", (e) => {
  console.error(`crypt: could not start node: ${e.message}`);
  process.exit(1);
});
child.on("close", (code, signal) => {
  if (signal) {
    process.removeAllListeners(signal);
    process.kill(process.pid, signal);
  } else process.exit(code ?? 1);
});
