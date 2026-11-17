// The plate footer, the game intro and the CLI summary name the same numbers with the same words.
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { countsPhrase } from "../src/common/counts.js";
import { generate, type CreatureInput } from "../src/raise/generate.js";
import { renderPlate } from "../src/render/plate.js";
import { numRuns } from "./runs.js";

const states = ["Possessed", "Rotting", "Healthy"] as const;
const limbArb = fc.record({
  name: fc.stringMatching(/^[a-z]{3,8}$/),
  state: fc.constantFrom(...states),
  spawned: fc.boolean(),
});

function creatureOf(rows: { name: string; state: string; spawned: boolean }[]): CreatureInput {
  const seen = new Set<string>();
  const limbs = rows
    .filter((r) => !seen.has(r.name) && seen.add(r.name))
    .map((r, i) => ({
      rank: i + 1, id: `npm:${r.name}@1.0.0`, ecosystem: "npm", name: r.name, version: "1.0.0", owner: "@t/o",
      state: r.state, spawned: r.state !== "Healthy" && r.spawned, kev: false, epss: 0.1, vulns: [],
    }));
  return { schemaVersion: 1, counts: { limbs: limbs.length, spawned: limbs.filter((l) => l.spawned).length }, limbs } as unknown as CreatureInput;
}

// Same shape as the demo creature: 7 dependencies, 5 findings, 2 that spawn.
const FIXTURE = creatureOf([
  { name: "jquery", state: "Possessed", spawned: true },
  { name: "lodash", state: "Rotting", spawned: true },
  { name: "handlebars", state: "Rotting", spawned: false },
  { name: "minimist", state: "Rotting", spawned: false },
  { name: "ms", state: "Rotting", spawned: false },
  { name: "left", state: "Healthy", spawned: false },
  { name: "right", state: "Healthy", spawned: false },
]);

describe("one vocabulary for counts", () => {
  it("renders the demo creature with the same numbers on the plate and in the game", () => {
    const plate = renderPlate(FIXTURE, { repo: "crypt-demo" });
    const intro = generate(FIXTURE).inf;
    expect(plate).toContain("DEPENDENCIES 7");
    expect(plate).toContain("LIMBS THAT SPAWN 2 OF 5 FINDINGS, 3 BELOW THE NOISE LINE");
    expect(intro).toContain("7 dependencies, 5 findings, 2 limbs spawn, 3 below the noise line");
    expect(countsPhrase({ dependencies: 7, findings: 5, spawned: 2, noise: 3 })).toBe("7 dependencies, 5 findings, 2 limbs spawn, 3 below the noise line");
  });

  it("property: the plate and the game agree for any creature", () => {
    fc.assert(
      fc.property(fc.array(limbArb, { maxLength: 14 }), (rows) => {
        const c = creatureOf(rows);
        const limbs = c.limbs as unknown as { state: string; spawned: boolean }[];
        const found = limbs.filter((l) => l.state !== "Healthy").length;
        const spawned = limbs.filter((l) => l.spawned).length;
        const plate = renderPlate(c, { repo: "r" });
        expect(plate).toContain(`DEPENDENCIES ${limbs.length}`);
        expect(plate).toContain(`LIMBS THAT SPAWN ${spawned} OF ${found} FINDINGS, ${found - spawned} BELOW THE NOISE LINE`);
        const inf = generate(c).inf;
        expect(inf).toContain(`${found} ${found === 1 ? "finding" : "findings"}, ${spawned} ${spawned === 1 ? "limb spawns" : "limbs spawn"}, ${found - spawned} below the noise line`);
      }),
      { numRuns: numRuns(100) },
    );
  });
});
