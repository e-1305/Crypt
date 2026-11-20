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
  /** Size factor: Possessed limbs are the largest. */
  scale: number;
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

/** Region sizes for n limbs: a few on the head, arms and legs in left/right pairs, the rest on the arms (up to 80) then legs. */
export function regionCounts(n: number): Record<LayoutLimb["region"], number> {
  const head = n === 0 ? 0 : Math.min(6, Math.max(1, Math.round(n * 0.15)), n);
  const even = (v: number) => v - (v % 2);
  const legs = Math.min(n - head, Math.max(2, even(Math.round(n * 0.3))));
  const arms = Math.min(n - head - legs, 80);
  return { head, torso: 0, arms, legs: n - head - arms };
}

/** Position of limb k of count in a region. Arms and legs alternate left/right; heads fan out above, staggered in height. */
function slot(region: LayoutLimb["region"], k: number, count: number): { x: number; y: number } {
  const side = k % 2 === 0 ? -1 : 1;
  const j = Math.floor(k / 2);
  if (region === "head") return { x: (k - (count - 1) / 2) * 0.7, y: 4.0 + (k % 2) * 0.45 };
  if (region === "arms") return { x: side * (1.6 + 0.6 * Math.floor(j / 4)), y: BODY.torso.y + BODY.torso.half - 0.5 * (j % 4) };
  return { x: side * (0.55 + 0.6 * Math.floor(j / 3)), y: 0.3 - 0.5 * (j % 3) };
}

export const POSSESSED_SCALE = 1.6;

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

  const counts = regionCounts(rows.length);
  const out: LayoutLimb[] = [];
  let i = 0;
  for (const region of ["head", "torso", "arms", "legs"] as const) {
    const n = counts[region];
    for (let k = 0; k < n; k++, i++) {
      const { l, id } = rows[i]!;
      const state = stateOf(l);
      const p = n > 0 && region !== "torso" ? slot(region, k, n) : { x: 0, y: BODY.torso.y };
      const version = text(l.version, 40);
      out.push({
        id,
        label: `${text(l.name, 60)}${version ? " " + version : ""} · ${state}`,
        state,
        color: STATE_COLOR[state],
        shape: STATE_SHAPE[state],
        scale: state === "Possessed" ? POSSESSED_SCALE : 1,
        x: round(p.x),
        y: round(p.y),
        z: 0,
        region,
      });
    }
  }
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
const LIMB_PAD = 0.3; // times limb.scale; // the largest limb shape is about 0.5 tall, 0.3 wide

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
    minX = Math.min(minX, l.x - LIMB_PAD * l.scale); maxX = Math.max(maxX, l.x + LIMB_PAD * l.scale);
    minY = Math.min(minY, l.y - LIMB_PAD * l.scale); maxY = Math.max(maxY, l.y + LIMB_PAD * l.scale);
    minZ = Math.min(minZ, l.z - LIMB_PAD * l.scale); maxZ = Math.max(maxZ, l.z + LIMB_PAD * l.scale);
  }
  const width = maxX - minX, height = maxY - minY, depth = maxZ - minZ;
  return {
    minX, maxX, minY, maxY, minZ, maxZ, width, height,
    center: { x: (minX + maxX) / 2, y: (minY + maxY) / 2, z: (minZ + maxZ) / 2 },
    radius: Math.sqrt(width * width + height * height + depth * depth) / 2,
  };
}

/** Only Possessed and Rotting limbs carry a label. */
export const hasLabel = (l: Pick<LayoutLimb, "state">) => l.state === "Possessed" || l.state === "Rotting";

/** Short label text: the package name without its version, at most 18 characters. */
export function labelText(l: Pick<LayoutLimb, "label">): string {
  const name = l.label.split(" · ")[0]!.replace(/ \S*$/, "");
  return name.length > 18 ? name.slice(0, 17) + "…" : name;
}

/** Labels sit outward from the body: left of left limbs, right of right limbs, above head limbs. */
export function labelSide(l: Pick<LayoutLimb, "region" | "x">): "left" | "right" | "top" {
  return l.region === "head" ? "top" : l.x < 0 ? "left" : "right";
}

export const LABEL_CHAR_PX = 6.6;
export const LABEL_H_PX = 14;
export const LABEL_GAP_PX = 10;
export const CAMERA_FOV = 40;
export const CAMERA_FILL = 0.7;

export interface ScreenBox { id: string; left: number; top: number; right: number; bottom: number }

/** Screen-space boxes of all labels for a canvas of width x height, with the camera framed as the view does (still, unrotated). */
export function labelBoxes(limbs: readonly LayoutLimb[], width: number, height: number): ScreenBox[] {
  const b = layoutBounds(limbs);
  const tanV = Math.tan((CAMERA_FOV * Math.PI) / 360);
  const tanH = tanV * (width / height);
  const depth = (b.maxZ - b.minZ) / 2;
  const dist = Math.max(b.height / 2 / (CAMERA_FILL * tanV), b.width / 2 / (CAMERA_FILL * tanH)) + depth;
  const out: ScreenBox[] = [];
  for (const l of limbs) {
    if (!hasLabel(l)) continue;
    const d = dist + b.center.z - l.z;
    const px = width / 2 + ((l.x - b.center.x) / (d * tanH)) * (width / 2);
    const py = height / 2 - ((l.y - b.center.y) / (d * tanV)) * (height / 2);
    const w = labelText(l).length * LABEL_CHAR_PX;
    const side = labelSide(l);
    const lift = side === "top" ? 0.3 * l.scale * (height / 2 / (d * tanV)) + LABEL_H_PX : LABEL_H_PX / 2;
    const left = side === "left" ? px - LABEL_GAP_PX - w : side === "right" ? px + LABEL_GAP_PX : px - w / 2;
    out.push({ id: l.id, left, right: left + w, top: py - lift, bottom: py - lift + LABEL_H_PX });
  }
  return out;
}
