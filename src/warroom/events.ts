// War Room events (Epic D4). Pure: no fs, no clock, no random, no network.
// "human-merged" is data: a person approved and landed the pull request, and GitHub reports it in the PR field merged_at.
// CRYPT never performs that step. Fail-safe: anything malformed parses to null and changes nothing.
import { clean } from "../render/plate.js";
import { parseHealEvent } from "../theatre/heal-events.js";

export const WAR_EVENT_TYPES = ["pr-opened", "ci-running", "ci-green", "ci-red", "human-merged"] as const;
export type WarEventType = (typeof WAR_EVENT_TYPES)[number];
export type WarSource = "live" | "simulated";

export interface WarEvent {
  type: WarEventType;
  /** Limb key "<ecosystem>:<name>", same format as the heal events. */
  limb: string;
  pr?: number;
  /** Epoch ms. */
  at: number;
  /** Praise only. Set on human-merged events and nowhere else. */
  healedBy?: string;
  source?: WarSource;
}

/** Returns a clean event, or null for anything that is not exactly a known event on a well-formed limb key. */
export function parseWarEvent(raw: unknown): WarEvent | null {
  try {
    if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return null;
    const o = raw as Record<string, unknown>;
    const type = o.type;
    if (typeof type !== "string" || !(WAR_EVENT_TYPES as readonly string[]).includes(type)) return null;
    const limb = o.limb;
    if (typeof limb !== "string" || parseHealEvent({ type: "ci-green", limb }) === null) return null;
    const at = o.at;
    if (typeof at !== "number" || !Number.isFinite(at) || at < 0) return null;
    const ev: WarEvent = { type: type as WarEventType, limb, at };
    if (o.pr !== undefined) {
      if (typeof o.pr !== "number" || !Number.isInteger(o.pr) || o.pr < 1) return null;
      ev.pr = o.pr;
    }
    if (type === "human-merged" && typeof o.healedBy === "string") {
      const who = clean(o.healedBy, 40).trim();
      if (who !== "") ev.healedBy = who;
    }
    if (o.source === "simulated" || o.source === "live") ev.source = o.source;
    return ev;
  } catch {
    return null;
  }
}

/** Parses a list, dropping everything malformed. */
export function parseWarEvents(raw: unknown): WarEvent[] {
  if (!Array.isArray(raw)) return [];
  const out: WarEvent[] = [];
  for (const r of raw) {
    const e = parseWarEvent(r);
    if (e) out.push(e);
  }
  return out;
}
