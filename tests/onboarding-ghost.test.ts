import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { stepText, tutorialSteps } from "../src/theatre/onboarding.js";

const src = readFileSync("web/onboarding.js", "utf8");
const block = /STEP_GHOST_LINES = \{([^}]*)\}/.exec(src)?.[1] ?? "";
const lines = Object.fromEntries([...block.matchAll(/(\w+):\s*"([^"]*)"/g)].map((m) => [m[1], m[2]]));

describe("the ghost guides the getting-started strip", () => {
  it("pins one ghost line per step, short and never blaming", () => {
    expect(lines).toEqual({
      look: "Take a slow look. The rot is easy to spot from here.",
      graft: "Your turn. The ghost keeps its hands in its sheet.",
      ci: "One last rite: the Bench wants a green light.",
    });
    expect(Object.keys(lines)).toEqual(tutorialSteps.map((s) => s.id));
    for (const [id, line] of Object.entries(lines)) {
      expect(line.length, id).toBeLessThanOrEqual(70);
      expect(line).not.toMatch(/you (did|broke)|your fault|stupid/i);
    }
  });
  it("the ghost line comes before the instruction, and the instruction text is unchanged", () => {
    expect(src).toContain('setText("tutorial-step", (STEP_GHOST_LINES[step.id] ? STEP_GHOST_LINES[step.id] + " " : "") + stepText(step, limb));');
    expect(stepText(tutorialSteps[0], "")).toBe("Look at the creature in Plate I. Limbs marked possessed or rotting are the ones to heal.");
    expect(stepText(tutorialSteps[1], "LODASH")).toBe("Type GRAFT LODASH yourself to open a rehearsal pull request. Nothing leaves this page.");
    expect(stepText(tutorialSteps[2], "")).toBe("Open the Bench and run Simulate CI: green. A limb heals only when CI is green.");
  });
});
