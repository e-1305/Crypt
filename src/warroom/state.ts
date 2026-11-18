// War Room state machine (Epic D4): events in, scene out. Pure and deterministic.
// INVARIANT: a limb is "healed" only when a human-merged event for it is in the log, whatever the order or duplicates.
// Team only: nothing is counted or ordered per person. A name exists only inside a "healed by" praise string.
import { clean } from "../render/plate.js";
import { REJECTION_LINE, SIMULATED_LABEL } from "../theatre/heal-events.js";
import { RAID_MS, formatClock, riskOf, teamScore, type RaidLimb } from "../theatre/raid.js";
import { comboState, type ComboState } from "../theatre/gamify.js";
import { WAR_EVENT_TYPES, parseWarEvent, type WarEvent } from "./events.js";

export type Phase = "possessed" | "rotting" | "pr-open" | "ci-running" | "ci-green" | "ci-red" | "healed";

/** What the scene needs to know about a limb. `exposure` is a deterministic value, 0..1. */
export interface WarLimb extends RaidLimb {
  exposure?: unknown;
}

export interface SceneLimb {
  key: string;
  name: string;
  kev: boolean;
  phase: Phase;
  pr?: number;
  healedBy?: string;
}

export interface Boss {
  key: string;
  name: string;
  /** 0..1. EPSS times exposure, 0 once healed. */
  hp: number;
  healed: boolean;
}

export type WarEffect =
  | { kind: "heal"; limb: string; at: number; thunder: true }
  | { kind: "convulse"; limb: string; at: number; line: string };

export interface Scene {
  limbs: SceneLimb[];
  bosses: Boss[];
  /** Risk removed by healed limbs. */
  score: number;
  remainingMs: number;
  clock: string;
  combo: ComboState;
  healedCount: number;
  /** Heal times in order, one per healed limb. */
  healTimes: number[];
  feed: string[];
  effects: WarEffect[];
  simulated: boolean;
}

export interface WarState {
  /** Sorted, de-duplicated log. */
  events: WarEvent[];
}

export const EMPTY_STATE: WarState = { events: [] };
export const FEED_MAX = 12;

const finite = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);
const unit = (x: unknown): number => (finite(x) ? Math.min(1, Math.max(0, x)) : 1);
const cmp = (a: string | number, b: string | number) => (a < b ? -1 : a > b ? 1 : 0);

/** EPSS times exposure, each clamped to 0..1. A missing or invalid value counts as 1 (fail-safe: full HP). */
export function bossHp(epss: unknown, exposure?: unknown): number {
  return unit(epss) * unit(exposure);
}

export function limbKeyOf(l: RaidLimb): string {
  return `${clean(l.ecosystem, 12)}:${clean(l.name, 40) || "unnamed"}`;
}

function order(a: WarEvent, b: WarEvent): number {
  return (
    cmp(a.at, b.at) || cmp(WAR_EVENT_TYPES.indexOf(a.type), WAR_EVENT_TYPES.indexOf(b.type)) || cmp(a.limb, b.limb) ||
    cmp(a.pr ?? 0, b.pr ?? 0) || cmp(a.healedBy ?? "", b.healedBy ?? "") || cmp(a.source ?? "", b.source ?? "")
  );
}

/** Adds one raw event to the log. Malformed events and exact duplicates change nothing. Arrival order never matters. */
export function reduce(state: WarState, raw: unknown): WarState {
  const ev = parseWarEvent(raw);
  if (!ev) return state;
  if (state.events.some((e) => order(e, ev) === 0)) return state;
  return { events: [...state.events, ev].sort(order) };
}

/** Folds a raw event list into a state. */
export function reduceAll(raws: readonly unknown[], state: WarState = EMPTY_STATE): WarState {
  return raws.reduce<WarState>((s, r) => reduce(s, r), state);
}

function line(ev: WarEvent, name: string): string {
  const tag = ev.source === "simulated" ? `[${SIMULATED_LABEL}] ` : "";
  const pr = ev.pr !== undefined ? ` (PR #${ev.pr})` : "";
  switch (ev.type) {
    case "pr-opened": return `${tag}${name}: pull request opened${pr}. A human reviews it.`;
    case "ci-running": return `${tag}${name}: CI is running${pr}.`;
    case "ci-green": return `${tag}${name}: CI is green${pr}. Waiting for a human review.`;
    case "ci-red": return `${tag}${name}: ${REJECTION_LINE}`;
    case "human-merged": return `${tag}${name} healed${ev.healedBy ? ` by ${ev.healedBy}` : ""}${pr}.`;
  }
}

/** Builds the scene. Only Possessed and Rotting limbs take part. Events for other limbs are ignored. */
export function sceneFrom(events: readonly unknown[] | WarState, limbs: readonly WarLimb[], now: number, opts: { raidStart?: number } = {}): Scene {
  const log = Array.isArray(events) ? reduceAll(events).events : (events as WarState).events;
  const sick = limbs.filter((l) => l.state === "Possessed" || l.state === "Rotting");
  const byKey = new Map<string, { limb: WarLimb; view: SceneLimb; healedAt?: number }>();
  for (const l of sick) {
    const key = limbKeyOf(l);
    if (byKey.has(key)) continue;
    byKey.set(key, { limb: l, view: { key, name: clean(l.name, 40) || "unnamed", kev: l.kev === true, phase: l.state === "Possessed" ? "possessed" : "rotting" } });
  }
  const feed: string[] = [];
  const effects: WarEffect[] = [];
  let simulated = false;
  for (const ev of log) {
    const slot = byKey.get(ev.limb);
    if (!slot) continue;
    const v = slot.view;
    if (ev.source === "simulated") simulated = true;
    if (v.phase === "healed") continue; // absorbing: nothing after human-merged changes the limb
    if (ev.pr !== undefined) v.pr = ev.pr;
    switch (ev.type) {
      case "pr-opened": v.phase = "pr-open"; break;
      case "ci-running": v.phase = "ci-running"; break;
      case "ci-green": v.phase = "ci-green"; break;
      case "ci-red": v.phase = "ci-red"; effects.push({ kind: "convulse", limb: ev.limb, at: ev.at, line: REJECTION_LINE }); break;
      case "human-merged":
        v.phase = "healed";
        slot.healedAt = ev.at;
        if (ev.healedBy) v.healedBy = ev.healedBy;
        effects.push({ kind: "heal", limb: ev.limb, at: ev.at, thunder: true });
        break;
    }
    feed.push(line(ev, v.name));
  }
  const view = [...byKey.values()];
  const healedSlots = view.filter((s) => s.view.phase === "healed");
  const healTimes = healedSlots.map((s) => s.healedAt as number).sort((a, b) => a - b);
  const bosses = bossOrder(view.map((s) => s.limb).filter((l) => l.kev === true)).map((l) => {
    const key = limbKeyOf(l);
    const healed = byKey.get(key)?.view.phase === "healed";
    return { key, name: clean(l.name, 40) || "unnamed", hp: healed ? 0 : bossHp(l.epss, l.exposure), healed };
  });
  const start = finite(opts.raidStart) ? opts.raidStart : (log[0]?.at ?? now);
  const elapsed = Math.min(RAID_MS, Math.max(0, finite(now) ? now - start : 0));
  return {
    limbs: view.map((s) => s.view).sort((a, b) => cmp(a.key, b.key)),
    bosses,
    score: teamScore(healedSlots.map((s) => ({ ...s.limb, healed: true }))),
    remainingMs: RAID_MS - elapsed,
    clock: formatClock(RAID_MS - elapsed),
    combo: comboState(healTimes, undefined, now),
    healedCount: healedSlots.length,
    healTimes,
    feed: feed.slice(-FEED_MAX),
    effects,
    simulated,
  };
}

/** KEV first, then higher HP, then limb key. Deterministic, no LLM. */
export function bossOrder<T extends WarLimb>(limbs: readonly T[]): T[] {
  const hp = (l: T) => (l.kev === true ? bossHp(l.epss, l.exposure) : riskOf(l) / 3);
  return [...limbs].sort((a, b) => cmp(a.kev === true ? 0 : 1, b.kev === true ? 0 : 1) || cmp(hp(b), hp(a)) || cmp(limbKeyOf(a), limbKeyOf(b)));
}
