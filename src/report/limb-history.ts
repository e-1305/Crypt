// Run history per limb (roadmap P2). One line per limb per run, kept as JSONL. Pure functions: junk input gives null or empty
// results, never a throw. Unknown stays unknown: a missing kev, epss, owner team, deadline or time is null, never 0 or a guess.
// Owners are CODEOWNERS teams only (@org/team). A person handle or a commit author never enters a line.
import { HOUR_MS, POSSESSED_WINDOW_MS, SPRINT_EPSS, SPRINT_WINDOW_MS } from "./model.js";

export const LIMB_HISTORY_FILE = "crypt-history.jsonl";
/** The only branch name the Action may push the history to. */
export const HISTORY_BRANCH = "crypt-history";

export const HISTORY_STATES = ["Possessed", "Rotting", "Healthy", "Landed", "Healed"] as const;
export type HistoryState = (typeof HISTORY_STATES)[number];
export type HistorySource = "real" | "sample";

/** ts, limb, state, kev, epss, ownerTeam and deadline are the history fields. source labels where the line came from. */
export interface HistoryLine {
  /** ISO time of the run, or null when no time was recorded. */
  ts: string | null;
  limb: string;
  state: HistoryState;
  kev: boolean | null;
  epss: number | null;
  ownerTeam: string | null;
  /** ISO time the SLA window ends, or null when the limb has no window or it is unknown. */
  deadline: string | null;
  source: HistorySource;
}

const isRec = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const MAX_MS = 8.64e15;

function isoOrNull(v: unknown): string | null {
  if (typeof v !== "string" || v === "") return null;
  const t = Date.parse(v);
  return Number.isFinite(t) && t >= 0 && t <= MAX_MS ? new Date(t).toISOString() : null;
}
const ms = (iso: string | null): number | null => (iso === null ? null : Date.parse(iso));
const TEAM = /^@[A-Za-z0-9][A-Za-z0-9._-]{0,38}\/[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;
const LIMB = /^[A-Za-z0-9._-]{1,32}$/;

/** A CODEOWNERS team (@org/team) or null. A person handle gives null. */
export function teamOf(v: unknown): string | null {
  return typeof v === "string" && TEAM.test(v) ? v : null;
}

/** One parsed line, or null for junk. Missing optional fields stay null. */
export function parseHistoryLine(raw: unknown): HistoryLine | null {
  if (!isRec(raw)) return null;
  const limb = typeof raw.limb === "string" && LIMB.test(raw.limb) ? raw.limb : null;
  const state = HISTORY_STATES.find((s) => s === raw.state);
  if (limb === null || state === undefined) return null;
  if (raw.ts !== null && raw.ts !== undefined && isoOrNull(raw.ts) === null) return null;
  const epss = typeof raw.epss === "number" && Number.isFinite(raw.epss) && raw.epss >= 0 && raw.epss <= 1 ? raw.epss : null;
  return {
    ts: isoOrNull(raw.ts),
    limb,
    state,
    kev: typeof raw.kev === "boolean" ? raw.kev : null,
    epss,
    ownerTeam: teamOf(raw.ownerTeam),
    deadline: isoOrNull(raw.deadline),
    source: raw.source === "real" ? "real" : "sample",
  };
}

/** Parses JSONL text. Blank and junk lines are skipped. */
export function parseHistoryJsonl(text: unknown): HistoryLine[] {
  if (typeof text !== "string") return [];
  const out: HistoryLine[] = [];
  for (const row of text.split("\n")) {
    if (row.trim() === "") continue;
    try {
      const l = parseHistoryLine(JSON.parse(row));
      if (l !== null) out.push(l);
    } catch {
      // junk row: skipped
    }
  }
  return out;
}

const keyed = (l: HistoryLine): string =>
  JSON.stringify([l.ts, l.limb, l.state, l.kev, l.epss, l.ownerTeam, l.deadline, l.source]);

export function serializeHistoryJsonl(lines: readonly HistoryLine[]): string {
  return lines.length === 0
    ? ""
    : lines
        .map((l) => JSON.stringify({ ts: l.ts, limb: l.limb, state: l.state, kev: l.kev, epss: l.epss, ownerTeam: l.ownerTeam, deadline: l.deadline, source: l.source }))
        .join("\n") + "\n";
}

/**
 * One line per limb for this run. The deadline comes from the SLA policy: Possessed or KEV is 48 hours, EPSS of 0.1 or more is the
 * 14-day sprint, anything else has none. A deadline already recorded for the limb in `prior` is kept, so it is counted from the
 * first sighting and does not move on every run.
 */
export function linesFromCreature(creature: unknown, now: number, source: HistorySource = "real", prior: readonly HistoryLine[] = []): HistoryLine[] {
  if (!isRec(creature) || !Array.isArray(creature.limbs) || !Number.isFinite(now) || Math.abs(now) > MAX_MS) return [];
  const ts = new Date(now).toISOString();
  const out: HistoryLine[] = [];
  for (const l of creature.limbs) {
    if (!isRec(l) || typeof l.id !== "string" || !LIMB.test(l.id)) continue;
    const state: HistoryState | null = l.healed === true ? "Healed" : l.state === "Possessed" || l.state === "Rotting" || l.state === "Healthy" ? l.state : null;
    if (state === null) continue;
    const kev = state === "Possessed" ? true : typeof l.kev === "boolean" ? l.kev : null;
    const epss = typeof l.epss === "number" && Number.isFinite(l.epss) && l.epss >= 0 && l.epss <= 1 ? l.epss : null;
    const window = kev === true ? POSSESSED_WINDOW_MS : epss !== null && epss >= SPRINT_EPSS ? SPRINT_WINDOW_MS : null;
    const known = prior
      .filter((p) => p.limb === l.id && p.deadline !== null)
      .map((p) => Date.parse(p.deadline!))
      .sort((a, b) => a - b)[0];
    const open = state === "Possessed" || state === "Rotting";
    const deadline = !open || window === null ? null : new Date(known ?? now + window).toISOString();
    out.push({ ts, limb: l.id, state, kev, epss, ownerTeam: teamOf(l.owner), deadline, source });
  }
  return out;
}

/** Existing plus new lines. A line with the same run ts and limb is replaced, so a rerun in one run adds nothing. */
export function appendLines(existing: readonly HistoryLine[], added: readonly HistoryLine[]): HistoryLine[] {
  const same = (a: HistoryLine, b: HistoryLine): boolean => a.ts !== null && a.ts === b.ts && a.limb === b.limb;
  return [...existing.filter((e) => !added.some((a) => same(e, a))), ...added];
}

// ---- aggregation ----

export interface RunPoint {
  ts: string;
  possessed: number;
  rotting: number;
  healthy: number;
  landed: number;
  healed: number;
  /** Lines in this run. Equals the sum of the five state counts. */
  lines: number;
  /** Possessed or Rotting limbs. */
  open: number;
  /** Open limbs whose kev is true. Unknown kev is not counted. */
  openKev: number;
}

export interface LimbAge {
  limb: string;
  state: HistoryState;
  /** Hours from the first sighting to now (open) or to the heal time. Null when a needed time is unknown. */
  hours: number | null;
}

export interface Breach {
  limb: string;
  deadline: string;
  /** "open": still open past the deadline. "late": healed after the deadline. */
  kind: "open" | "late";
}

export interface HistoryAggregate {
  /** Lines after removing duplicates. */
  lineCount: number;
  /** Lines with no run time. They are in no run point. */
  undated: number;
  runs: RunPoint[];
  ageByLimb: LimbAge[];
  deadlineBreaches: Breach[];
  /** Limbs whose last line is Healed. */
  healedLimbs: number;
  /** Limbs whose last line is Possessed or Rotting. */
  openLimbs: number;
  limbsWithDeadline: number;
  /** Mean of first sighting to heal over healed limbs with both times known. Null when there is none. */
  meanTimeToHealHours: number | null;
  /** How many healed limbs the mean uses. */
  healTimesKnown: number;
  sources: HistorySource[];
}

const RANK: Record<HistoryState, number> = { Healthy: 0, Rotting: 1, Possessed: 2, Landed: 3, Healed: 4 };
const isOpen = (s: HistoryState): boolean => s === "Possessed" || s === "Rotting";

function compare(a: HistoryLine, b: HistoryLine): number {
  const ta = ms(a.ts);
  const tb = ms(b.ts);
  if (ta !== tb) return ta === null ? 1 : tb === null ? -1 : ta - tb;
  if (a.limb !== b.limb) return a.limb < b.limb ? -1 : 1;
  if (RANK[a.state] !== RANK[b.state]) return RANK[a.state] - RANK[b.state];
  const ka = keyed(a);
  const kb = keyed(b);
  return ka < kb ? -1 : ka > kb ? 1 : 0;
}

/** Sorted, with one line per run ts and limb (the later in sort order wins) and exact duplicates removed. */
function normalise(raw: readonly unknown[]): HistoryLine[] {
  const parsed = raw.map(parseHistoryLine).filter((l): l is HistoryLine => l !== null).sort(compare);
  const out = new Map<string, HistoryLine>();
  for (const l of parsed) out.set(l.ts === null ? keyed(l) : `${l.ts}|${l.limb}`, l);
  return [...out.values()].sort(compare);
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

export function aggregate(raw: readonly unknown[], now: number): HistoryAggregate {
  const lines = normalise(Array.isArray(raw) ? raw : []);
  const clock = Number.isFinite(now) ? now : null;
  const runMap = new Map<string, RunPoint>();
  for (const l of lines) {
    if (l.ts === null) continue;
    const r = runMap.get(l.ts) ?? { ts: l.ts, possessed: 0, rotting: 0, healthy: 0, landed: 0, healed: 0, lines: 0, open: 0, openKev: 0 };
    const k = l.state.toLowerCase() as "possessed" | "rotting" | "healthy" | "landed" | "healed";
    r[k]++;
    r.lines++;
    if (isOpen(l.state)) {
      r.open++;
      if (l.kev === true) r.openKev++;
    }
    runMap.set(l.ts, r);
  }
  const runs = [...runMap.values()].sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts));

  const byLimb = new Map<string, HistoryLine[]>();
  for (const l of lines) byLimb.set(l.limb, [...(byLimb.get(l.limb) ?? []), l]);

  const ageByLimb: LimbAge[] = [];
  const deadlineBreaches: Breach[] = [];
  let healedLimbs = 0;
  let openLimbs = 0;
  let limbsWithDeadline = 0;
  const healHours: number[] = [];
  for (const [limb, ls] of [...byLimb.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    const last = ls[ls.length - 1]!;
    if (last.state === "Healed") healedLimbs++;
    if (isOpen(last.state)) openLimbs++;
    const deadlines = ls.map((l) => ms(l.deadline)).filter((t): t is number => t !== null);
    const deadline = deadlines.length === 0 ? null : Math.min(...deadlines);
    if (deadline !== null) limbsWithDeadline++;
    const everOpen = ls.some((l) => isOpen(l.state) || l.state === "Landed" || l.state === "Healed");
    if (!everOpen) continue;
    const seen = ls.map((l) => ms(l.ts)).filter((t): t is number => t !== null);
    const first = seen.length === 0 ? null : Math.min(...seen);
    const fixTimes = ls.filter((l) => (l.state === "Landed" || l.state === "Healed") && l.ts !== null).map((l) => ms(l.ts)!);
    const fixedAt = fixTimes.length === 0 ? null : Math.min(...fixTimes);
    const fixed = last.state === "Landed" || last.state === "Healed";
    const end = fixed ? fixedAt : clock;
    const hours = first !== null && end !== null && end >= first ? round2((end - first) / HOUR_MS) : null;
    ageByLimb.push({ limb, state: last.state, hours });
    if (last.state === "Healed" && hours !== null) healHours.push(hours);
    if (deadline !== null) {
      const iso = new Date(deadline).toISOString();
      if (isOpen(last.state) && clock !== null && clock > deadline) deadlineBreaches.push({ limb, deadline: iso, kind: "open" });
      else if (fixed && fixedAt !== null && fixedAt > deadline) deadlineBreaches.push({ limb, deadline: iso, kind: "late" });
    }
  }
  return {
    lineCount: lines.length,
    undated: lines.filter((l) => l.ts === null).length,
    runs,
    ageByLimb,
    deadlineBreaches,
    healedLimbs,
    openLimbs,
    limbsWithDeadline,
    meanTimeToHealHours: healHours.length === 0 ? null : round2(healHours.reduce((s, h) => s + h, 0) / healHours.length),
    healTimesKnown: healHours.length,
    sources: (["real", "sample"] as const).filter((s) => lines.some((l) => l.source === s)),
  };
}

/** "unknown" for null, minutes under an hour, hours under 48, else days. */
export function durationText(hours: number | null): string {
  if (hours === null) return "unknown";
  if (hours < 1) return `${Math.round(hours * 60)} minutes`;
  if (hours >= 48) return `${Math.round((hours / 24) * 10) / 10} days`;
  return `${hours} hours`;
}

/** The branch the history may be pushed to: only the literal crypt-history, never the default branch, never empty. */
export function historyBranchAllowed(branch: unknown, defaultBranch: unknown): boolean {
  if (typeof branch !== "string" || typeof defaultBranch !== "string") return false;
  const b = branch.trim();
  const d = defaultBranch.trim();
  return b === HISTORY_BRANCH && d !== "" && b !== d;
}
