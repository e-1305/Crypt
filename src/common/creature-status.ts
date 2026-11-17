// Pipeline records on a creature limb (ciVerdict, ciPr, status, healedBy). Pure: no fs, clock or network.
// Fail-safe: a creature that is not an object with a limbs array, or a limb that is not found, is returned unchanged.
// Blameless: healedBy is praise only. It is a cleaned login and never feeds ordering or totals.

export interface LimbRef {
  ecosystem: string;
  name: string;
  version?: string;
}

export interface LimbPatch {
  set?: Record<string, unknown>;
  clear?: readonly string[];
}

/** A GitHub login reduced to [A-Za-z0-9-], at most 39 characters. Empty when nothing usable is left. */
export function safeLogin(input: unknown): string {
  if (typeof input !== "string") return "";
  return input.replace(/[^A-Za-z0-9-]/g, "").slice(0, 39);
}

/** Sets and clears fields on the one limb that matches ecosystem, name and (when given) version. Input is not changed. */
export function patchLimb(creature: unknown, ref: LimbRef, patch: LimbPatch): Record<string, unknown> {
  if (creature === null || typeof creature !== "object" || Array.isArray(creature)) return creature as Record<string, unknown>;
  const c = creature as Record<string, unknown>;
  if (!Array.isArray(c.limbs)) return c;
  const limbs = c.limbs.map((l: unknown) => {
    if (l === null || typeof l !== "object") return l;
    const o = l as Record<string, unknown>;
    if (o.ecosystem !== ref.ecosystem || o.name !== ref.name) return l;
    if (ref.version !== undefined && o.version !== ref.version) return l;
    const next = { ...o };
    for (const k of patch.clear ?? []) delete next[k];
    return { ...next, ...(patch.set ?? {}) };
  });
  return { ...c, limbs };
}

export function serializeCreature(c: unknown): string {
  return JSON.stringify(c, null, 2) + "\n";
}
