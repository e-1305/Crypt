// Shared by raise and reraise: creature.json -> out/creature.inf, out/limbs.json, out/creature.z8.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { generate } from "../src/raise/generate.js";
import { includePath, inform6Path } from "./toolchain-dir.js";

export function raiseCreature(input: string, outDir: string): void {
  let creature: unknown;
  try {
    creature = JSON.parse(readFileSync(input, "utf8"));
  } catch (e) {
    throw new Error(`cannot read creature file ${input}: ${(e as Error).message}`);
  }
  if (!creature || typeof creature !== "object" || (creature as { schemaVersion?: unknown }).schemaVersion !== 1) {
    throw new Error(`${input} is not a creature file (schemaVersion 1 expected)`);
  }
  if (!Array.isArray((creature as { limbs?: unknown }).limbs)) {
    throw new Error(`${input} is not a creature file (limbs array expected)`);
  }
  const { inf, limbs } = generate(creature as Parameters<typeof generate>[0]);
  mkdirSync(outDir, { recursive: true });
  const infPath = `${outDir}/creature.inf`;
  const z8Path = `${outDir}/creature.z8`;
  rmSync(z8Path, { force: true });
  writeFileSync(infPath, inf);
  const sorted = Object.fromEntries(Object.keys(limbs).sort().map((k) => [k, limbs[k]]));
  writeFileSync(`${outDir}/limbs.json`, JSON.stringify(sorted, null, 2) + "\n");
  const r = spawnSync(inform6Path(), ["-v8", `+include_path=${includePath()}`, infPath, z8Path], {
    encoding: "utf8",
  });
  if (r.error || r.status !== 0 || !existsSync(z8Path)) {
    process.stderr.write((r.stdout ?? "") + (r.stderr ?? ""));
    throw new Error(`inform6 failed${r.error ? `: ${r.error.message}` : ` (exit ${r.status})`}`);
  }
  console.log(`raised ${Object.keys(limbs).length} limb(s): ${z8Path}`);
}
