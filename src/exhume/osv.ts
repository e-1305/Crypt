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

export interface CacheEntry {
  vulns: OsvVuln[];
  /** ISO time of the OSV answer; null for entries written without one. */
  fetchedAt: string | null;
}

export function readCache(fs: ExhumeFs, dir: string, l: Limb): CacheEntry | null {
  const text = fs.read(cachePath(dir, l));
  if (text === null) return null;
  try {
    const o = JSON.parse(text) as Record<string, unknown>;
    if (o.ecosystem !== l.ecosystem || o.name !== l.name || o.version !== l.version) return null;
    if (!Array.isArray(o.vulns) || !o.vulns.every(validVuln)) return null;
    const fetchedAt = typeof o.fetchedAt === "string" && !Number.isNaN(Date.parse(o.fetchedAt)) ? o.fetchedAt : null;
    return { vulns: normalizeVulns(o.vulns), fetchedAt };
  } catch {
    return null;
  }
}

export function writeCache(fs: ExhumeFs, dir: string, l: Limb, vulns: OsvVuln[], now?: number): void {
  const body = {
    ecosystem: l.ecosystem,
    name: l.name,
    version: l.version,
    ...(now === undefined ? {} : { fetchedAt: new Date(now).toISOString() }),
    vulns: normalizeVulns(vulns),
  };
  fs.write(cachePath(dir, l), JSON.stringify(body, null, 2) + "\n");
}

export interface OsvResult {
  /** limb key to vulns; a key is absent when OSV status is unknown. */
  known: Map<string, OsvVuln[]>;
  unknown: Set<string>;
  /** Keys in `known` whose cached answer is older than the TTL and could not be refreshed. */
  stale: Set<string>;
}

/** Cached answers older than this are refreshed when a lookup is available. */
export const OSV_TTL_MS = 7 * 24 * 3600 * 1000;

export async function resolveOsv(
  limbs: Limb[],
  opts: {
    fs: ExhumeFs;
    cacheDir: string;
    lookup?: OsvLookup;
    /** Current time in ms. Without it, or without a lookup (offline), cache age is not checked. */
    now?: number;
    maxAgeMs?: number;
  },
): Promise<OsvResult> {
  const known = new Map<string, OsvVuln[]>();
  const unknown = new Set<string>();
  const stale = new Set<string>();
  const staleHits = new Map<string, OsvVuln[]>();
  const maxAge = opts.maxAgeMs ?? OSV_TTL_MS;
  const misses: Limb[] = [];
  for (const l of limbs) {
    if (l.version === "unknown") {
      unknown.add(limbKey(l));
      continue;
    }
    const hit = readCache(opts.fs, opts.cacheDir, l);
    if (!hit) {
      misses.push(l);
      continue;
    }
    const expired =
      opts.lookup !== undefined &&
      opts.now !== undefined &&
      (hit.fetchedAt === null || opts.now - Date.parse(hit.fetchedAt) > maxAge);
    if (expired) {
      staleHits.set(limbKey(l), hit.vulns);
      misses.push(l);
    } else known.set(limbKey(l), hit.vulns);
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
      // A failed refresh keeps the old vulnerabilities but never a clean verdict.
      const old = staleHits.get(limbKey(l));
      if (old !== undefined) {
        known.set(limbKey(l), old);
        stale.add(limbKey(l));
      } else unknown.add(limbKey(l));
      continue;
    }
    try {
      writeCache(opts.fs, opts.cacheDir, l, got, opts.now);
    } catch {
      // cache write failure does not change the answer
    }
    known.set(limbKey(l), normalizeVulns(got));
  }
  return { known, unknown, stale };
}
