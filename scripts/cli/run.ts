// Runs one of the existing scripts/*.ts as a child process (node --import tsx), stdio inherited.
import { spawn } from "node:child_process";
import { join } from "node:path";
import { CliError, EXIT } from "../../src/cli/exit.js";
import { PACKAGE_ROOT } from "../toolchain-dir.js";
import { onInterrupt } from "./signals.js";

/** tsx is resolved from this package, never from the current directory. */
export const TSX = import.meta.resolve("tsx");

/** Resolves to the child's exit code. A child that dies by signal gives 130. */
export function runScript(script: string, args: string[]): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["--import", TSX, join(PACKAGE_ROOT, "scripts", script), ...args], {
      stdio: "inherit",
      env: process.env,
    });
    const off = onInterrupt(() => {
      child.kill("SIGTERM");
    });
    child.on("error", (e) => {
      off();
      reject(new CliError(`could not start ${script}: ${e.message}`));
    });
    child.on("close", (code, signal) => {
      off();
      resolve(signal ? EXIT.INTERRUPTED : (code ?? EXIT.FAILURE));
    });
  });
}

/** Like runScript, but a non-zero exit throws a silent CliError (the script already printed its message). */
export async function runScriptOrFail(script: string, args: string[]): Promise<void> {
  const code = await runScript(script, args);
  if (code !== 0) throw new CliError("", code === EXIT.INTERRUPTED ? EXIT.INTERRUPTED : EXIT.FAILURE);
}
