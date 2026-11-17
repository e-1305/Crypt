// Pure, deterministic version choice from OSV affected ranges. No I/O, no clock, no LLM.
// Minimal semver: major.minor.patch with optional prerelease. Anything that does not parse is never chosen.

export interface Semver {
  major: number;
  minor: number;
  patch: number;
  pre: string[];
}

export interface RangeEvent {
  introduced?: string;
  fixed?: string;
  last_affected?: string;
}

export interface OsvRange {
  type: string;
  events: RangeEvent[];
}

export interface OsvAffected {
  package: { ecosystem: string; name: string };
  ranges: OsvRange[];
}

export interface Advisory {
  id: string;
  aliases: string[];
  affected: OsvAffected[];
}

const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/;
const MAX = Number.MAX_SAFE_INTEGER;

export function parseVersion(v: string): Semver | null {
  const m = SEMVER.exec(v);
  if (!m) return null;
  const [major, minor, patch] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (![major, minor, patch].every((n) => Number.isSafeInteger(n))) return null;
  return { major, minor, patch, pre: m[4] ? m[4].split(".") : [] };
}

export function formatVersion(s: Semver): string {
  return `${s.major}.${s.minor}.${s.patch}${s.pre.length ? "-" + s.pre.join(".") : ""}`;
}

function cmpIdent(a: string, b: string): number {
  const an = /^\d+$/.test(a);
  const bn = /^\d+$/.test(b);
  if (an && bn) return Math.sign(Number(a) - Number(b));
  if (an) return -1;
  if (bn) return 1;
  return a < b ? -1 : a > b ? 1 : 0;
}

export function compareVersions(a: Semver, b: Semver): number {
  for (const k of ["major", "minor", "patch"] as const) {
    if (a[k] !== b[k]) return a[k] < b[k] ? -1 : 1;
  }
  if (a.pre.length === 0 || b.pre.length === 0) return a.pre.length === b.pre.length ? 0 : a.pre.length === 0 ? 1 : -1;
  for (let i = 0; i < Math.min(a.pre.length, b.pre.length); i++) {
    const c = cmpIdent(a.pre[i]!, b.pre[i]!);
    if (c !== 0) return c;
  }
  return Math.sign(a.pre.length - b.pre.length);
}

interface Interval {
  from: Semver;
  to: Semver; // exclusive when !inclusive
  inclusive: boolean;
}

const ZERO: Semver = { major: 0, minor: 0, patch: 0, pre: [] };
const INFINITY: Semver = { major: MAX, minor: MAX, patch: MAX, pre: [] };

/** Turns the events of one range into intervals. Returns null when a bound does not parse (ambiguity). */
function intervals(range: OsvRange): Interval[] | null {
  const out: Interval[] = [];
  let start: Semver | null = null;
  for (const ev of range.events) {
    if (typeof ev.introduced === "string") {
      const s = ev.introduced === "0" ? ZERO : parseVersion(ev.introduced);
      if (!s) return null;
      if (start === null) start = s;
    } else if (typeof ev.fixed === "string" || typeof ev.last_affected === "string") {
      const inclusive = typeof ev.last_affected === "string";
      const end = parseVersion((inclusive ? ev.last_affected : ev.fixed) as string);
      if (!end || start === null) return null;
      out.push({ from: start, to: end, inclusive });
      start = null;
    } else {
      return null;
    }
  }
  if (start !== null) out.push({ from: start, to: INFINITY, inclusive: false });
  return out;
}

function usableRanges(advisory: Advisory, ecosystem: string, name: string): OsvRange[] {
  return advisory.affected
    .filter((a) => a.package.ecosystem === ecosystem && a.package.name === name)
    .flatMap((a) => a.ranges)
    .filter((r) => r.type === "SEMVER" || r.type === "ECOSYSTEM");
}

/** True when version v lies inside any range. Null when the ranges cannot be understood. */
export function isAffected(v: Semver, ranges: OsvRange[]): boolean | null {
  let hit = false;
  for (const r of ranges) {
    const ivs = intervals(r);
    if (ivs === null) return null;
    for (const iv of ivs) {
      const lo = compareVersions(v, iv.from) >= 0;
      const c = compareVersions(v, iv.to);
      if (lo && (iv.inclusive ? c <= 0 : c < 0)) hit = true;
    }
  }
  return hit;
}

export interface Choice {
  version: string;
  breaking: boolean;
}

/**
 * Smallest stable version > current that is outside every range of every advisory.
 * Candidates: each `fixed` bound and the next patch after each `last_affected`.
 * Same major as current is preferred; a higher major sets breaking. Null when nothing qualifies or anything is unclear.
 */
export function chooseVersion(
  ecosystem: string,
  name: string,
  current: string,
  advisories: Advisory[],
): Choice | null {
  const cur = parseVersion(current);
  if (!cur || advisories.length === 0) return null;
  const ranges = advisories.flatMap((a) => usableRanges(a, ecosystem, name));
  if (ranges.length === 0) return null;
  const candidates = new Map<string, Semver>();
  for (const r of ranges) {
    for (const ev of r.events) {
      let c: Semver | null = null;
      if (typeof ev.fixed === "string") c = parseVersion(ev.fixed);
      else if (typeof ev.last_affected === "string") {
        const l = parseVersion(ev.last_affected);
        if (l) c = { ...l, patch: l.patch + 1, pre: [] };
      }
      if (c && c.pre.length === 0 && compareVersions(c, cur) > 0) candidates.set(formatVersion(c), c);
    }
  }
  const good: Semver[] = [];
  for (const c of candidates.values()) {
    const hit = isAffected(c, ranges);
    if (hit === null) return null;
    if (!hit) good.push(c);
  }
  good.sort(compareVersions);
  const pick = good.find((c) => c.major === cur.major) ?? good[0];
  if (!pick) return null;
  return { version: formatVersion(pick), breaking: pick.major > cur.major };
}
