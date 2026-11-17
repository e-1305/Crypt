// Remove all generated runtime state so `npm run spike` is repeatable,
// then seed the spike's lookup table.
import { mkdirSync, rmSync, writeFileSync } from "node:fs";

for (const p of ["out", "crypt-audit.log", ".crypt-seal", "transcript.txt"]) {
  rmSync(p, { recursive: true, force: true });
}

// The spike game has one limb, ARM. The watcher only acts on IDs listed in out/limbs.json.
mkdirSync("out", { recursive: true });
writeFileSync("out/limbs.json", JSON.stringify({ ARM: { ecosystem: "spike", name: "arm", version: "0" } }, null, 2) + "\n");
