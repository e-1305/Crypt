// CLI shell for raise: creature.json -> out/creature.inf, out/limbs.json, out/creature.z8.
// All I/O and the compiler call live here; src/raise/generate.ts is pure.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { generate } from "../src/raise/generate.js";

const USAGE = "usage: crypt raise [out/creature.json] [--out out]";

function main(): void {
  const args = process.argv.slice(2);
  let input = "out/creature.json";
  let outDir = "out";
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--out") {
      const v = args[++i];
      if (!v) throw new Error("--out needs a value");
      outDir = v;
    } else if (args[i]!.startsWith("--")) throw new Error(`unexpected argument ${args[i]}`);
    else input = args[i]!;
  }
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
  const r = spawnSync(".toolchain/Inform6/inform6", ["-v8", "+include_path=.toolchain/inc", infPath, z8Path], {
    encoding: "utf8",
  });
  if (r.error || r.status !== 0 || !existsSync(z8Path)) {
    process.stderr.write((r.stdout ?? "") + (r.stderr ?? ""));
    throw new Error(`inform6 failed${r.error ? `: ${r.error.message}` : ` (exit ${r.status})`}`);
  }
  console.log(`raised ${Object.keys(limbs).length} limb(s): ${z8Path}`);
}

try {
  main();
} catch (e) {
  process.stderr.write(`raise: ${(e as Error).message}\n${USAGE}\n`);
  process.exitCode = 1;
}
