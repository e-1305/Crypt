// Remove all generated runtime state so `npm run spike` is repeatable.
import { rmSync } from "node:fs";

for (const p of ["out", "crypt-audit.log", ".crypt-seal", "transcript.txt"]) {
  rmSync(p, { recursive: true, force: true });
}
