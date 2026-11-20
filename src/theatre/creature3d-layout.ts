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

const REGIONS: { region: LayoutLimb["region"]; cap: number; y: number; radius: number }[] = [
  { region: "head", cap: 6, y: 3.2, radius: 0.6 },
  { region: "torso", cap: 40, y: 1.8, radius: 1.0 },
  { region: "arms", cap: 80, y: 1.9, radius: 2.1 },
  { region: "legs", cap: Infinity, y: 0.2, radius: 0.8 },
];

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
  let i = 0;
  let start = 0;
  for (const reg of REGIONS) {
    const end = Math.min(rows.length, start + reg.cap);
    const n = end - start;
    for (let k = 0; k < n; k++, i++) {
      const { l, id } = rows[i]!;
      const state = stateOf(l);
      // Spread a region's limbs on a ring; arms alternate left and right, legs alternate and step down.
      const angle = n === 1 ? 0 : (2 * Math.PI * k) / n;
      let x = reg.radius * Math.cos(angle);
      let z = reg.radius * Math.sin(angle);
      let y = reg.y;
      if (reg.region === "arms") {
        x = (k % 2 === 0 ? -1 : 1) * (reg.radius + 0.05 * Math.floor(k / 2));
        z = 0.3 * Math.sin(angle);
      } else if (reg.region === "legs") {
        x = (k % 2 === 0 ? -0.45 : 0.45) + 0.12 * Math.cos(angle);
        y = reg.y - 0.02 * Math.floor(k / 2);
      }
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
        region: reg.region,
      });
    }
    start = end;
    if (start >= rows.length) break;
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
const LIMB_PAD = 0.3; // the largest limb shape is about 0.5 tall, 0.3 wide

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
