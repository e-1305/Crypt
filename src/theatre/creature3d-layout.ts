// 3D-a: pure layout for the 3D creature view. No rendering, no DOM, deterministic.
// One entry per limb: a position on a stitched body (most urgent nearest the head), a color from the plate palette,
// a shape token so state is never carried by color alone, and a short label. Unknown is its own state, never "healthy".

export type LayoutState = "Possessed" | "Rotting" | "Healed" | "Healthy" | "Unknown";
export type Shape = "spike" | "cube" | "ring" | "sphere" | "cone";

export interface LayoutLimb {
  id: string;
  label: string;
  state: LayoutState;
  color: string;
  shape: Shape;
  x: number;
  y: number;
  z: number;
  /** Body region, from head to feet. */
  region: "head" | "torso" | "arms" | "legs";
}

/** Same hues as the plate and the share card (src/render/card.ts); Unknown gets amber, as "not known" is not "clean". */
export const STATE_COLOR: Record<LayoutState, string> = {
  Possessed: "#ff6a3d",
  Rotting: "#c8e63c",
  Healed: "#33ff33",
  Healthy: "#8c8366",
  Unknown: "#ffb000",
};
export const STATE_SHAPE: Record<LayoutState, Shape> = {
  Possessed: "spike",
  Rotting: "cube",
  Healed: "ring",
  Healthy: "sphere",
  Unknown: "cone",
};

// Slot cycle: limbs are dealt to body slots in rank order, so any count stays balanced left/right and top/bottom.
type Slot = { region: LayoutLimb["region"]; side: -1 | 0 | 1 };
const SLOTS: Slot[] = [
  { region: "head", side: 0 },
  { region: "arms", side: -1 },
  { region: "arms", side: 1 },
  { region: "legs", side: -1 },
  { region: "legs", side: 1 },
  { region: "head", side: 0 },
  { region: "arms", side: -1 },
  { region: "arms", side: 1 },
];
const GAP = 0.75; // centre-to-centre spacing: larger than the biggest shape (Possessed is drawn at POSSESSED_SCALE)
export const POSSESSED_SCALE = 1.6;

/** Position of the j-th limb (0-based) dealt to a slot. Heads fan out above the head, arms step outward and down from the shoulder, legs below the hips. */
function place(slot: Slot, j: number): { x: number; y: number; z: number } {
  if (slot.region === "head") {
    if (j === 0) return { x: 0, y: 4.25, z: 0 };
    const k = j - 1;
    const col = Math.floor(k / 2);
    return { x: (k % 2 === 0 ? -1 : 1) * (0.95 + GAP * (col % 3)), y: 4.0 + GAP * Math.floor(col / 3) + (col % 3) * 0.1, z: 0 };
  }
  if (slot.region === "arms") {
    const row = j % 4, col = Math.floor(j / 4);
    return { x: slot.side * (1.4 + GAP * col), y: BODY_SHOULDER_Y - GAP * row, z: 0 };
  }
  return { x: slot.side * 0.55, y: 0.2 - GAP * j, z: 0 };
}
const BODY_SHOULDER_Y = 2.4; // torso.y + torso.half

const rec = (v: unknown): Record<string, unknown> => (typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const text = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/[^\x20-\x7e]/g, "").slice(0, max) : "");

export function stateOf(l: Record<string, unknown>): LayoutState {
  if (l.unknown === true || l.state === "Unknown") return "Unknown";
  if (l.healed === true || l.state === "Healed") return "Healed";
  if (l.state === "Possessed" || l.state === "Rotting" || l.state === "Healthy") return l.state;
  return "Unknown";
}

const round = (n: number) => Math.round(n * 1000) / 1000;

/** Lay out every limb of a creature. Order: by rank (missing rank last), then by id. Never throws on bad input: returns []. */
export function layoutCreature(creature: unknown): LayoutLimb[] {
  const limbs = rec(creature).limbs;
  if (!Array.isArray(limbs)) return [];
  const rows = limbs
    .map(rec)
    .filter((l) => text(l.name, 100) !== "")
    .map((l) => ({ l, rank: typeof l.rank === "number" && Number.isFinite(l.rank) ? l.rank : Number.MAX_SAFE_INTEGER, id: text(l.id, 140) || text(l.name, 100) }))
    .sort((a, b) => a.rank - b.rank || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  const out: LayoutLimb[] = [];
  const dealt = new Map<number, number>();
  rows.forEach(({ l, id }, i) => {
    const si = i % SLOTS.length;
    const slotKey = si === 5 ? 0 : si === 6 ? 1 : si === 7 ? 2 : si; // second pass shares the grid of its slot
    const j = dealt.get(slotKey) ?? 0;
    dealt.set(slotKey, j + 1);
    const slot = SLOTS[si]!;
    const { x, y, z } = place(slot, j);
    const state = stateOf(l);
    const version = text(l.version, 40);
    out.push({
      id,
      label: `${text(l.name, 60)}${version ? " " + version : ""} · ${state}`,
      state,
      color: STATE_COLOR[state],
      shape: STATE_SHAPE[state],
      x: round(x),
      y: round(y),
      z: round(z),
      region: slot.region,
    });
  });
  return out;
}

export interface LayoutBounds {
  minX: number; maxX: number; minY: number; maxY: number; minZ: number; maxZ: number;
  width: number; height: number;
  center: { x: number; y: number; z: number };
  /** Half of the box diagonal: a sphere around the center that holds the whole creature. */
  radius: number;
}

/** Body parts drawn by the view (head sphere, torso capsule). Part of the framed box even when there are no limbs. */
export const BODY = { head: { y: 3.2, r: 0.4 }, torso: { y: 1.8, r: 0.45, half: 0.6 } } as const;
const LIMB_PAD = 0.45; // the largest limb (Possessed spike at POSSESSED_SCALE) is about 0.8 tall, 0.5 wide

/** Where a limb's bone attaches to the body: head, torso, shoulder (arms) or hip (legs). */
export function anchorOf(l: Pick<LayoutLimb, "region" | "x">): { x: number; y: number; z: number } {
  const side = l.x < 0 ? -1 : 1;
  if (l.region === "head") return { x: 0, y: BODY.head.y, z: 0 };
  if (l.region === "torso") return { x: 0, y: BODY.torso.y, z: 0 };
  if (l.region === "arms") return { x: side * 0.4, y: BODY.torso.y + BODY.torso.half, z: 0 };
  return { x: side * 0.25, y: BODY.torso.y - BODY.torso.half, z: 0 };
}

/** Box around the body and all limbs, padded by shape size. Pure. Always non-degenerate (the body alone has width and height). */
export function layoutBounds(limbs: readonly LayoutLimb[]): LayoutBounds {
  let minX: number = -BODY.torso.r, maxX: number = BODY.torso.r;
  let minY = BODY.torso.y - BODY.torso.half - BODY.torso.r, maxY = BODY.head.y + BODY.head.r;
  let minZ: number = -BODY.torso.r, maxZ: number = BODY.torso.r;
  for (const l of limbs) {
    minX = Math.min(minX, l.x - LIMB_PAD); maxX = Math.max(maxX, l.x + LIMB_PAD);
    minY = Math.min(minY, l.y - LIMB_PAD); maxY = Math.max(maxY, l.y + LIMB_PAD);
    minZ = Math.min(minZ, l.z - LIMB_PAD); maxZ = Math.max(maxZ, l.z + LIMB_PAD);
  }
  const width = maxX - minX, height = maxY - minY, depth = maxZ - minZ;
  return {
    minX, maxX, minY, maxY, minZ, maxZ, width, height,
    center: { x: (minX + maxX) / 2, y: (minY + maxY) / 2, z: (minZ + maxZ) / 2 },
    radius: Math.sqrt(width * width + height * height + depth * depth) / 2,
  };
}

/** Distance from the look-at point so the box fills `fill` of the canvas on the tighter side. Shared by the view and the tests. */
export function frameDistance(b: LayoutBounds, aspect: number, fovDeg = 40, fill = 0.7): number {
  const tanV = Math.tan((fovDeg * Math.PI) / 360);
  const tanH = tanV * aspect;
  return Math.max(b.height / 2 / (fill * tanV), b.width / 2 / (fill * tanH)) + (b.maxZ - b.minZ) / 2;
}

/** Screen position (px, y down) of a point seen by the framing camera (looking down -z at the box centre, no body rotation). */
export function projectPoint(p: { x: number; y: number; z: number }, b: LayoutBounds, w: number, h: number, fovDeg = 40): { x: number; y: number } {
  const tanV = Math.tan((fovDeg * Math.PI) / 360);
  const depth = frameDistance(b, w / h, fovDeg) + b.center.z - p.z;
  const ndcX = (p.x - b.center.x) / (depth * tanV * (w / h));
  const ndcY = (p.y - b.center.y) / (depth * tanV);
  return { x: ((ndcX + 1) / 2) * w, y: ((1 - ndcY) / 2) * h };
}

export interface LabelBox { left: number; top: number; width: number; height: number }
export const LABEL_H = 14;
export const LABEL_GAP = 4;
const LABEL_CHAR_W = 6.8;

/** Only Possessed and Rotting limbs are labelled. Short name: no version, max 18 chars. */
export function labelText(l: Pick<LayoutLimb, "label">): string {
  const name = l.label.split(" · ")[0]!.replace(/ \S*$/, "");
  return name.length > 18 ? name.slice(0, 17) + "…" : name;
}
export const isLabelled = (l: Pick<LayoutLimb, "state">) => l.state === "Possessed" || l.state === "Rotting";

/**
 * Place label boxes outward from the body (left limbs: label to the left; right limbs: to the right; centred limbs: above),
 * then push boxes down until no two are within LABEL_GAP of each other. `anchors` are screen points of the limbs, `widths` the text widths.
 */
export function placeLabelBoxes(anchors: readonly { x: number; y: number; side: -1 | 0 | 1 }[], widths: readonly number[]): LabelBox[] {
  const boxes = anchors.map((a, i) => {
    const width = widths[i]!;
    const left = a.side < 0 ? a.x - 14 - width : a.side > 0 ? a.x + 14 : a.x - width / 2;
    const top = a.side === 0 ? a.y - 18 - LABEL_H : a.y - LABEL_H / 2;
    return { left, top, width, height: LABEL_H };
  });
  const order = boxes.map((_, i) => i).sort((p, q) => boxes[p]!.top - boxes[q]!.top || p - q);
  const done: LabelBox[] = [];
  for (const i of order) {
    const b = boxes[i]!;
    for (let again = true; again; ) {
      again = false;
      for (const o of done) {
        const overlapX = b.left < o.left + o.width + LABEL_GAP && o.left < b.left + b.width + LABEL_GAP;
        const overlapY = b.top < o.top + o.height + LABEL_GAP && o.top < b.top + b.height + LABEL_GAP;
        if (overlapX && overlapY) { b.top = o.top + o.height + LABEL_GAP; again = true; }
      }
    }
    done.push(b);
  }
  return boxes;
}

export const labelWidth = (text: string) => Math.ceil(text.length * LABEL_CHAR_W) + 2;
export const sideOf = (l: Pick<LayoutLimb, "x">): -1 | 0 | 1 => (l.x < -0.1 ? -1 : l.x > 0.1 ? 1 : 0);
