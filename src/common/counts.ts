// One place for the words that count a creature. The CLI summary, the game intro and the plate footer
// all call these, so the same numbers always carry the same names:
//   dependencies  every package in the lockfile
//   findings      dependencies with a known vulnerability
//   limbs that spawn  findings above the noise line, the ones you can GRAFT
//   below the noise line  findings too low-risk to spawn a limb
export interface CountTerms {
  dependencies: number;
  findings: number;
  spawned: number;
  /** Findings that did not spawn and are not unresolved. */
  noise: number;
  unresolved?: number;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** "7 dependencies, 5 findings, 2 limbs spawn, 3 below the noise line" (plus unresolved when above zero). */
export function countsPhrase(c: CountTerms): string {
  const parts = [
    plural(c.dependencies, "dependency", "dependencies"),
    plural(c.findings, "finding", "findings"),
    `${c.spawned} ${c.spawned === 1 ? "limb spawns" : "limbs spawn"}`,
    `${c.noise} below the noise line`,
  ];
  if ((c.unresolved ?? 0) > 0) parts.push(`${c.unresolved} unresolved`);
  return parts.join(", ");
}

/** One sentence that says what the two unusual terms mean. */
export const NOISE_LEGEND = "A limb spawns for a finding above the noise line. Findings below it are low risk and stay as stitches.";
