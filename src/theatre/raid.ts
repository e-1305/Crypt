// The raid (Epic B2): deterministic scoring, ranks, the Nights Without Possession counter, epitaphs and a
// 15-minute timer. Pure: no fs, no real clock (the clock is injected), no random, no network, no LLM.
// Blameless: the team has one score. People appear only in praise strings ("healed by <name>"), never ordered or totalled.
import { clean } from "../render/plate.js";

export const RAID_MS = 15 * 60 * 1000;
export const KEV_WEIGHT = 3;
export const SLA_KEV_MS = 48 * 3600 * 1000;
/** Limbs healed needed for each rank. */
export const RANK_SURGEON = 3;
export const RANK_RESURRECTIONIST = 7;
export type Rank = "Apprentice" | "Surgeon" | "Resurrectionist";

export interface RaidLimb {
  ecosystem?: unknown;
  name?: unknown;
  epss?: unknown;
  kev?: unknown;
  state?: unknown;
  healed?: unknown;
  /** Set to "awaiting-human-merge" when a fix PR is open and waiting for review. */
  status?: unknown;
  /** Praise only. Never used for ordering or totals. */
  healedBy?: unknown;
  /** Epoch ms when a KEV limb was first detected. */
  detectedAt?: unknown;
  /** Epoch ms when the limb stopped being open. */
  resolvedAt?: unknown;
}

/** EPSS (0 when missing or out of range) times 3 for KEV, 1 otherwise. */
export function riskOf(limb: RaidLimb): number {
  const e = limb.epss;
  const epss = typeof e === "number" && Number.isFinite(e) && e >= 0 && e <= 1 ? e : 0;
  return epss * (limb.kev === true ? KEV_WEIGHT : 1);
}

export function isHealed(limb: RaidLimb): boolean {
  return limb.healed === true || limb.state === "Healed";
}

/** Healed, or confirmed awaiting-human-merge. */
export function countsForScore(limb: RaidLimb): boolean {
  return isHealed(limb) || limb.status === "awaiting-human-merge";
}

export function teamScore(limbs: readonly RaidLimb[]): number {
  let sum = 0;
  for (const l of limbs) if (countsForScore(l)) sum += riskOf(l);
  return sum;
}

export function healedCount(limbs: readonly RaidLimb[]): number {
  return limbs.filter(isHealed).length;
}

export function rankFor(healed: number): Rank {
  if (healed >= RANK_RESURRECTIONIST) return "Resurrectionist";
  if (healed >= RANK_SURGEON) return "Surgeon";
  return "Apprentice";
}

function finite(x: unknown): x is number {
  return typeof x === "number" && Number.isFinite(x);
}

/**
 * Whole days since the latest moment a KEV limb stayed open past 48h of its detection.
 * A KEV limb that is open and past its SLA now means 0. With no breach the count runs from scanStart.
 */
export function nightsWithoutPossession(limbs: readonly RaidLimb[], now: number, scanStart: number): number {
  let latest = scanStart;
  for (const l of limbs) {
    if (l.kev !== true && !(finite(l.detectedAt) && finite(l.resolvedAt))) continue;
    const detected = finite(l.detectedAt) ? l.detectedAt : scanStart;
    if (finite(l.resolvedAt)) {
      if (l.resolvedAt - detected > SLA_KEV_MS) latest = Math.max(latest, l.resolvedAt);
    } else if (l.kev === true && !countsForScore(l) && now - detected > SLA_KEV_MS) {
      latest = Math.max(latest, now);
    }
  }
  return Math.max(0, Math.floor((now - latest) / 86400000));
}

function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

export const EPITAPHS = [
  "The dead patched what the living postponed.",
  "It rose, it was stitched, it slept.",
  "No limb was left to the dark tonight.",
  "The crypt is quiet. The lamp stays lit.",
  "What rotted is sewn. What sewed it is remembered.",
  "The slab is cold and the creature breathes.",
  "Every stitch held until the morning.",
  "Rest now. The next raid will find you ready.",
];

/** Same seed, same epitaph. Seed comes from public scan data (repo, healed count). */
export function epitaph(seed: string): string {
  return EPITAPHS[fnv1a(clean(seed, 200)) % EPITAPHS.length];
}

/** Praise lines for healed limbs that name a healer. Sorted by limb only; no counts per person. */
export function praiseLines(limbs: readonly RaidLimb[]): string[] {
  const out: { key: string; line: string }[] = [];
  for (const l of limbs) {
    if (!isHealed(l) || typeof l.healedBy !== "string") continue;
    const who = clean(l.healedBy, 40);
    const limb = clean(l.name, 40);
    if (who === "" || limb === "") continue;
    out.push({ key: `${clean(l.ecosystem, 20)}:${limb}`, line: `${limb} healed by ${who}` });
  }
  return out.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0)).map((x) => x.line);
}

export type RaidStatus = "idle" | "running" | "done";
export interface RaidView {
  status: RaidStatus;
  elapsedMs: number;
  remainingMs: number;
}

export interface RaidTimer {
  start(): void;
  view(): RaidView;
  reset(): void;
}

/** Timer state machine. Elapsed time never exceeds 15:00; at 15:00 the status is "done". */
export function createRaidTimer(clock: () => number): RaidTimer {
  let startedAt: number | null = null;
  return {
    start() {
      if (startedAt === null) startedAt = clock();
    },
    reset() {
      startedAt = null;
    },
    view() {
      if (startedAt === null) return { status: "idle", elapsedMs: 0, remainingMs: RAID_MS };
      const raw = clock() - startedAt;
      const elapsedMs = Math.min(RAID_MS, Math.max(0, Number.isFinite(raw) ? raw : 0));
      return { status: elapsedMs >= RAID_MS ? "done" : "running", elapsedMs, remainingMs: RAID_MS - elapsedMs };
    },
  };
}

/** "MM:SS", rounding up so the display reads 15:00 until the first second passes and 00:00 only when done. */
export function formatClock(ms: number): string {
  const total = Math.min(RAID_MS / 1000, Math.max(0, Math.ceil((Number.isFinite(ms) ? ms : 0) / 1000)));
  const m = Math.floor(total / 60), s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/** True only for the exact typed command, ignoring surrounding spaces and case. */
export function isRaidCommand(text: unknown): boolean {
  return typeof text === "string" && text.trim().toUpperCase() === "RAID";
}
