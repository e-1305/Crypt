// CLI shell for raise: creature.json -> out/creature.inf, out/limbs.json, out/creature.z8.
// All I/O and the compiler call live here; src/raise/generate.ts is pure.
import { raiseCreature } from "./compile.js";

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
  raiseCreature(input, outDir);
}

try {
  main();
} catch (e) {
  process.stderr.write(`raise: ${(e as Error).message}\n${USAGE}\n`);
  process.exitCode = 1;
}
