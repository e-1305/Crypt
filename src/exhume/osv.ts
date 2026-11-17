import { type ExhumeFs, type Limb, type OsvVuln, cmp, limbKey } from "./types.js";

/** Injected network lookup. Returns an entry only for limbs whose answer is complete. */
export type OsvLookup = (limbs: Limb[]) => Promise<Map<string, OsvVuln[]>>;

export function cachePath(dir: string, l: Pick<Limb, "ecosystem" | "name" | "version">): string {
  return `${dir}/${l.ecosystem}__${encodeURIComponent(l.name)}@${encodeURIComponent(l.version)}.json`;
}

export function normalizeVulns(vulns: OsvVuln[]): OsvVuln[] {
  return vulns
    .map((v) => ({ id: v.id, aliases: [...new Set(v.aliases)].sort(cmp), severity: v.severity }))
    .sort((a, b) => cmp(a.id, b.id));
}

function validVuln(v: unknown): v is OsvVuln {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.id === "string" &&
    Array.isArray(o.aliases) &&
    o.aliases.every((a) => typeof a === "string") &&
    (o.severity === null || typeof o.severity === "string")
  );
}

export function readCache(fs: ExhumeFs, dir: string, l: Limb): OsvVuln[] | null {
  const text = fs.read(cachePath(dir, l));
  if (text === null) return null;
  try {
    const o = JSON.parse(text) as Record<string, unknown>;
    if (o.ecosystem !== l.ecosystem || o.name !== l.name || o.version !== l.version) return null;
    if (!Array.isArray(o.vulns) || !o.vulns.every(validVuln)) return null;
    return normalizeVulns(o.vulns);
  } catch {
    return null;
  }
}

export function writeCache(fs: ExhumeFs, dir: string, l: Limb, vulns: OsvVuln[]): void {
  const body = { ecosystem: l.ecosystem, name: l.name, version: l.version, vulns: normalizeVulns(vulns) };
  fs.write(cachePath(dir, l), JSON.stringify(body, null, 2) + "\n");
}

export interface OsvResult {
  /** limb key to vulns; a key is absent when OSV status is unknown. */
  known: Map<string, OsvVuln[]>;
  unknown: Set<string>;
}

export async function resolveOsv(
  limbs: Limb[],
  opts: { fs: ExhumeFs; cacheDir: string; lookup?: OsvLookup },
): Promise<OsvResult> {
  const known = new Map<string, OsvVuln[]>();
  const unknown = new Set<string>();
  const misses: Limb[] = [];
  for (const l of limbs) {
    if (l.version === "unknown") {
      unknown.add(limbKey(l));
      continue;
    }
    const hit = readCache(opts.fs, opts.cacheDir, l);
    if (hit) known.set(limbKey(l), hit);
    else misses.push(l);
  }
  let fetched = new Map<string, OsvVuln[]>();
  if (misses.length > 0 && opts.lookup) {
    try {
      fetched = await opts.lookup(misses);
    } catch {
      fetched = new Map();
    }
  }
  for (const l of misses) {
    const got = fetched.get(limbKey(l));
    if (got === undefined) {
      unknown.add(limbKey(l));
      continue;
    }
    try {
      writeCache(opts.fs, opts.cacheDir, l, got);
    } catch {
      // cache write failure does not change the answer
    }
    known.set(limbKey(l), normalizeVulns(got));
  }
  return { known, unknown };
}
