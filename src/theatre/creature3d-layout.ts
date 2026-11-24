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
  /** EPSS in 0..1. 0 when absent or not a number (an assumption: unknown is drawn as the coolest glow, never as safe). */
  epss: number;
}

/** Emissive intensity of a Possessed limb: EPSS 0 maps to 0.3, EPSS 1 to 1.0. */
export function glowOf(epss: number): number {
  const e = Number.isFinite(epss) ? Math.min(1, Math.max(0, epss)) : 0;
  return round(0.3 + 0.7 * e);
}

/** How far the limb's bend (the middle of the tube curve) sags, in layout units. Rotting limbs droop most. */
export function droopOf(state: LayoutState): number {
  return state === "Rotting" ? 0.16 : state === "Unknown" ? 0.06 : 0;
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

/**
 * How many limbs go to head, arms and legs (the torso takes the rest). The most urgent limb crowns the head; then
 * arms get ~40% and legs ~30% of the others, so even a small creature has limbs on both sides and below the body.
 */
export function regionCounts(n: number): [number, number, number] {
  if (n <= 0) return [0, 0, 0];
  const head = 1;
  const r = n - head;
  const arms = Math.min(r, Math.max(r >= 2 ? 2 : r, Math.ceil(r * 0.4)));
  const legs = Math.min(r - arms, Math.max(r - arms >= 2 ? 2 : r - arms, Math.ceil((r - arms) * 0.5)));
  return [head, arms, legs];
}

const round = (n: number) => Math.round(n * 1000) / 1000;
const GOLDEN = Math.PI * (3 - Math.sqrt(5));
/** Position of the k-th of n limbs in a region. Deterministic; spacing grows with n so limbs never stack. */
function placeLimb(region: LayoutLimb["region"], k: number, n: number): { x: number; y: number; z: number } {
  if (region === "head") return { x: 0, y: 3.85, z: 0 };
  if (region === "arms") {
    // Alternate left/right; each side fans out along the arm and up/down a little.
    const side = k % 2 === 0 ? -1 : 1;
    const j = Math.floor(k / 2);
    const perSide = Math.ceil(n / 2);
    const step = Math.max(0.55, 2.4 / Math.max(1, perSide));
    return { x: side * (1.3 + j * step * 0.6), y: 2.2 - (j % 3) * 0.45, z: 0.25 * Math.sin(j) };
  }
  if (region === "legs") {
    const side = k % 2 === 0 ? -1 : 1;
    const j = Math.floor(k / 2);
    return { x: side * (0.5 + 0.35 * (j % 3)), y: 0.4 - j * 0.55, z: 0.2 * Math.cos(j) };
  }
  // Torso: a spiral around the torso capsule.
  const a = k * GOLDEN;
  return { x: 0.85 * Math.cos(a), y: 2.3 - (n <= 1 ? 0.5 : (k / (n - 1)) * 1.0), z: 0.85 * Math.sin(a) };
}

const rec = (v: unknown): Record<string, unknown> => (typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const text = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/[^\x20-\x7e]/g, "").slice(0, max) : "");

export function stateOf(l: Record<string, unknown>): LayoutState {
  if (l.unknown === true || l.state === "Unknown") return "Unknown";
  if (l.healed === true || l.state === "Healed") return "Healed";
  if (l.state === "Possessed" || l.state === "Rotting" || l.state === "Healthy") return l.state;
  return "Unknown";
}


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
  const [nHead, nArms, nLegs] = regionCounts(rows.length);
  const nTorso = rows.length - nHead - nArms - nLegs;
  const plan: [LayoutLimb["region"], number][] = [["head", nHead], ["arms", nArms], ["legs", nLegs], ["torso", nTorso]];
  let i = 0;
  for (const [region, n] of plan) {
    for (let k = 0; k < n; k++, i++) {
      const { l, id } = rows[i]!;
      const state = stateOf(l);
      const p = placeLimb(region, k, n);
      const version = text(l.version, 40);
      out.push({
        id,
        label: `${text(l.name, 60)}${version ? " " + version : ""} · ${state}`,
        state,
        color: STATE_COLOR[state],
        shape: STATE_SHAPE[state],
        x: round(p.x),
        y: round(p.y),
        z: round(p.z),
        region,
        epss: typeof l.epss === "number" && Number.isFinite(l.epss) ? Math.min(1, Math.max(0, l.epss)) : 0,
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
