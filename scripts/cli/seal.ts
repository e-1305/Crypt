// seal and unseal: human-run CLI actions. No marker printed by the game can reach them.
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { defaultPaths } from "../../src/common/agent.js";
import { nodeIo } from "../../src/common/io.js";

function audit(path: string, command: string, outcome: string): void {
  nodeIo.appendLine(path, [new Date().toISOString(), command, "-", outcome, "-"].join("\t"));
}

export function seal(cwd: string = process.cwd()): string {
  const p = defaultPaths(cwd);
  if (existsSync(p.sealPath)) return "The crypt is already sealed.";
  mkdirSync(cwd, { recursive: true });
  writeFileSync(p.sealPath, new Date().toISOString() + "\n", { flag: "wx" });
  audit(p.auditPath, "SEAL CRYPT", "SEALED");
  return "The crypt is sealed. Every needle rests. Run 'crypt unseal' to lift it.";
}

export function unseal(cwd: string = process.cwd()): string {
  const p = defaultPaths(cwd);
  if (!existsSync(p.sealPath)) return "The crypt is not sealed.";
  rmSync(p.sealPath, { force: true });
  audit(p.auditPath, "UNSEAL CRYPT", "UNSEALED");
  return "The seal is lifted.";
}
