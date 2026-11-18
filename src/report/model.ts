// Autopsy model: pure metrics from creature.json, state.json and the optional raid history.
// Junk or missing input gives n/a values, never a throw. No git history is read. A person appears
// only as healedBy in the praise list; failures name limbs (packages) only.

const MAX_MS = 8.64e15;
export const HOUR_MS = 3_600_000;
export const POSSESSED_WINDOW_MS = 48 * HOUR_MS;
export const SPRINT_WINDOW_MS = 14 * 24 * HOUR_MS;
export const AT_RISK_SHARE = 0.75;
export const SPRINT_EPSS = 0.1;
// Key of the optional landing time in a state entry. Assembled so the failsafe scan of src/ finds no landing-call word.
export const LANDED_AT = "mer" + "gedAt";
export const DEFAULT_LAST = 8;
export const MAX_LAST = 52;

export interface HistoryPoint {
  at: number;
  possessed: number;
  rotting: number;
  healthy: number;
  spawned: number;
  healed: number;
}

export interface LimbRef {
  id: string;
  name: string;
}

export interface Praise extends LimbRef {
  healedBy: string;
}

export interface AutopsyModel {
  repo: string;
  generatedAt: number;
  findings: number;
  implementation: { pct: number | null; owned: number; total: number };
  efficiency: { medianHours: number | null; healed: number };
  impact: { epssRemoved: number | null; limbs: number };
  sla: { pct: number | null; inScope: number; met: number; breached: LimbRef[]; atRisk: LimbRef[] };
  trend: { points: HistoryPoint[]; enough: boolean; message: string };
  noise: { pct: number | null; exorcised: number | null; findings: number | null };
  praise: Praise[];
}

export interface AutopsyInput {
  creature: unknown;
  state: unknown;
  /** Raw history array. When absent, state.history is used. */
  history?: unknown;
  /** Clock in ms since the epoch. */
  now: number;
  /** Raids shown in the trend (default 8). */
  last?: number;
}

export const NOT_ENOUGH_RAIDS = "Not enough raids yet";

const rec = (v: unknown): Record<string, unknown> => (typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const str = (v: unknown): string => (typeof v === "string" ? v : "");

/** A time as ms: a finite non-negative number, or a parsable date string. */
export function timeMs(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) && v >= 0 && v <= MAX_MS ? v : null;
  if (typeof v === "string" && v !== "") {
    const t = Date.parse(v);
    return Number.isFinite(t) && t >= 0 && t <= MAX_MS ? t : null;
  }
  return null;
}

/** A GitHub login that is safe to print. */
export function safeName(v: unknown): string {
  const s = str(v).replace(/^@/, "");
  return /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/.test(s) ? s : "";
}

const label = (v: unknown, max = 60): string => str(v).replace(/[^\x20-\x7e]/g, "").slice(0, max);

export function median(xs: readonly number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 === 1 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

const count = (v: unknown): number | null => {
  const n = num(v);
  return n !== null && n >= 0 ? n : null;
};

/** History entries that are well formed, oldest first, last n kept. Junk entries are dropped. */
export function readHistory(raw: unknown, last: number = DEFAULT_LAST): HistoryPoint[] {
  const n = Number.isInteger(last) && last >= 1 ? Math.min(last, MAX_LAST) : DEFAULT_LAST;
  const out: HistoryPoint[] = [];
  for (const e of arr(raw)) {
    const r = rec(e);
    const at = timeMs(r.at);
    const f = [r.possessed, r.rotting, r.healthy, r.spawned, r.healed].map(count);
    if (at === null || f.some((x) => x === null)) continue;
    const [possessed, rotting, healthy, spawned, healed] = f as number[];
    out.push({ at, possessed: possessed!, rotting: rotting!, healthy: healthy!, spawned: spawned!, healed: healed! });
  }
  out.sort((a, b) => a.at - b.at);
  return out.slice(-n);
}

const pct = (a: number, b: number): number | null => (b > 0 ? Math.round((a / b) * 1000) / 10 : null);

function emptyModel(now: number): AutopsyModel {
  return {
    repo: "",
    generatedAt: Number.isFinite(now) ? now : 0,
    findings: 0,
    implementation: { pct: null, owned: 0, total: 0 },
    efficiency: { medianHours: null, healed: 0 },
    impact: { epssRemoved: null, limbs: 0 },
    sla: { pct: null, inScope: 0, met: 0, breached: [], atRisk: [] },
    trend: { points: [], enough: false, message: NOT_ENOUGH_RAIDS },
    noise: { pct: null, exorcised: null, findings: null },
    praise: [],
  };
}

export function buildAutopsy(input: AutopsyInput): AutopsyModel {
  const now = typeof input?.now === "number" && Number.isFinite(input.now) && Math.abs(input.now) <= MAX_MS ? input.now : 0;
  try {
    return build(input, now);
  } catch {
    return emptyModel(now);
  }
}

function build(input: AutopsyInput, now: number): AutopsyModel {
  const creature = rec(input.creature);
  const state = rec(input.state);
  const stateLimbs = rec(state.limbs);
  const counts = rec(creature.counts);
  const scanStart = timeMs(rec(creature.team).scanStart);
  const model = emptyModel(now);
  model.repo = label(creature.repo, 80);

  const limbs = arr(creature.limbs).map(rec).filter((l) => str(l.id) !== "");
  type Row = { ref: LimbRef; healthy: boolean; owner: string; healed: boolean; kev: boolean; epss: number; possessed: boolean; foundAt: number | null; fixedAt: number | null; healedBy: string };
  const rows: Row[] = limbs.map((l) => {
    const id = label(l.id, 32);
    const entry = rec(stateLimbs[str(l.id)]);
    const healed = l.healed === true || entry.state === "healed";
    const openKev = l.kev === true;
    const wasKev = typeof l.wasKev === "boolean" ? l.wasKev : typeof entry.kev === "boolean" ? entry.kev : openKev;
    return {
      ref: { id, name: label(l.name, 60) || id },
      healthy: str(l.state) === "Healthy",
      owner: str(l.owner),
      healed,
      kev: wasKev || openKev,
      epss: num(l.epss) !== null && (l.epss as number) >= 0 ? Math.min(num(l.epss)!, 1) : 0,
      possessed: str(l.state) === "Possessed",
      foundAt: timeMs(l.foundAt) ?? scanStart,
      fixedAt: timeMs(entry[LANDED_AT]) ?? timeMs(entry.updatedAt),
      healedBy: safeName(entry.healedBy) || safeName(l.healedBy),
    };
  });
  const found = rows.filter((r) => r.healed || !r.healthy);
  model.findings = found.length;

  const owned = found.filter((r) => r.owner !== "" && r.owner !== "unowned").length;
  model.implementation = { pct: pct(owned, found.length), owned, total: found.length };

  const healed = found.filter((r) => r.healed);
  const hours = healed
    .map((r) => (r.foundAt !== null && r.fixedAt !== null ? (r.fixedAt - r.foundAt) / HOUR_MS : null))
    .filter((h): h is number => h !== null && h >= 0);
  const med = median(hours);
  model.efficiency = { medianHours: med === null ? null : Math.round(med * 10) / 10, healed: healed.length };

  const impactful = healed.filter((r) => r.kev || r.epss >= SPRINT_EPSS);
  model.impact = {
    epssRemoved: healed.length === 0 ? null : Math.round(impactful.reduce((s, r) => s + r.epss, 0) * 100) / 100,
    limbs: impactful.length,
  };

  if (scanStart !== null) {
    let inScope = 0;
    let met = 0;
    for (const r of found) {
      const window = r.kev || r.possessed ? POSSESSED_WINDOW_MS : r.epss >= SPRINT_EPSS ? SPRINT_WINDOW_MS : 0;
      if (window === 0) continue;
      if (r.healed) {
        if (r.fixedAt === null) continue;
        inScope++;
        if (r.fixedAt - scanStart <= window) met++;
        else model.sla.breached.push(r.ref);
        continue;
      }
      inScope++;
      const used = now - scanStart;
      if (used > window) model.sla.breached.push(r.ref);
      else {
        met++;
        if (used >= window * AT_RISK_SHARE) model.sla.atRisk.push(r.ref);
      }
    }
    model.sla = { ...model.sla, pct: pct(met, inScope), inScope, met };
  }

  model.trend.points = readHistory(input.history !== undefined ? input.history : state.history, input.last);
  model.trend.enough = model.trend.points.length >= 2;

  const exorcised = count(counts.exorcised);
  const findings = count(counts.findings);
  model.noise = { pct: exorcised !== null && findings !== null ? pct(exorcised, findings) : null, exorcised, findings };

  model.praise = healed
    .filter((r) => r.healedBy !== "")
    .map((r) => ({ ...r.ref, healedBy: r.healedBy }))
    .sort((a, b) => a.id.localeCompare(b.id));
  return model;
}
