// The raid board on the bench wall: no two text boxes overlap and none leaves the frame.
import { afterEach, describe, expect, it } from "vitest";

interface Box { text: string; x: number; y: number; w: number; h: number }

function fakeDom(texts: Record<string, string>) {
  const boxes: Box[] = [];
  let size = 16;
  const ctx = {
    set font(v: string) { size = Number(/(\d+)px/.exec(v)?.[1] ?? 16); },
    get font() { return size + "px"; },
    fillText(text: string, x: number, y: number, max?: number) {
      const natural = text.length * size * 0.6; // monospace advance is about 0.6 em
      boxes.push({ text, x, y, w: Math.min(natural, max ?? natural), h: size });
    },
    fillRect() {}, strokeRect() {},
  } as unknown as CanvasRenderingContext2D;
  const g = globalThis as Record<string, unknown>;
  g.document = {
    createElement: () => ({ width: 0, height: 0, getContext: () => ctx }),
    getElementById: (id: string) => (id in texts ? { textContent: texts[id] } : null),
  };
  g.MutationObserver = class { observe() {} disconnect() {} };
  return boxes;
}

const overlap = (a: Box, b: Box) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

describe("raid board layout", () => {
  afterEach(() => { const g = globalThis as Record<string, unknown>; delete g.document; delete g.MutationObserver; });

  const cases: Record<string, string>[] = [
    { "raid-timer": "15:00", "raid-score": "Team risk removed: 0.00", "raid-rank": "Rank: Apprentice", "raid-nights": "Nights Without Possession: 0",
      "raid-state": "Ready.", "raid-epitaph": "", "raid-combo": "Combo: none. Heal two limbs.", "raid-shelf": "Trophies 0 of 6", "raid-vitals": "Creature health 29 of 100. Heartbeat 128 beats per minute." },
    { "raid-timer": "14:59", "raid-score": "Team risk removed: 1234.56", "raid-rank": "Rank: Grave Surgeon", "raid-nights": "Nights Without Possession: 1234",
      "raid-state": "Raid running", "raid-epitaph": "A long epitaph that is longer than the board is wide so it must be squeezed to fit", "raid-combo": "Combo: x3 chain going", "raid-shelf": "Trophies 6 of 6", "raid-vitals": "Creature health 100 of 100. Heartbeat 50." },
  ];

  it.each(cases)("no text overlaps or leaves the frame (%#)", async (texts) => {
    const boxes = fakeDom(texts);
    const { makeBoard } = (await import("../web/theatre/board.js" as string)) as { makeBoard: () => { update(): boolean } };
    makeBoard().update();
    expect(boxes.length).toBeGreaterThan(5);
    for (const b of boxes) {
      expect(b.x + b.w, b.text).toBeLessThanOrEqual(640 - 16);
      expect(b.y + b.h, b.text).toBeLessThanOrEqual(420 - 16);
    }
    // The nights stat has its own band: at least 8 px clear of every other box above it.
    const nights = boxes.find((b) => b.text.startsWith("Nights"))!;
    for (const b of boxes) if (b !== nights && b.y < nights.y) expect(nights.y - (b.y + b.h), b.text).toBeGreaterThanOrEqual(8);
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) expect(overlap(boxes[i]!, boxes[j]!), `${boxes[i]!.text} / ${boxes[j]!.text}`).toBe(false);
  });
});
