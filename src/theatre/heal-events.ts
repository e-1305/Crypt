// Live heal events (Epic B3). Pure logic: parse events, decide what a plate does with them, and
// build the simulated CI script from a dry-run payload. Fail-safe: anything malformed, unknown or
// ambiguous changes nothing and a limb is never marked healed on error.
import { clean, limbKey } from "../render/plate.js";

export type HealEventType = "healed" | "ci-red" | "ci-green";
export interface HealEvent {
  type: HealEventType;
  limb: string;
}

/** Same words the Inquisitor prints for a red CI (REJECTED_TEXT in src/common/agent.ts; a test keeps them equal). */
export const REJECTION_LINE = "The graft was rejected. The creature remains.";
/** Shown wherever the simulated source speaks, in 3D and in 2D. */
export const SIMULATED_LABEL = "SIMULATED CI";

const TYPES: readonly string[] = ["healed", "ci-red", "ci-green"];
const LIMB_KEY = /^[A-Za-z0-9_-]{1,12}:[\x21-\x7e]{1,40}$/;

/** Returns a clean event, or null for anything that is not exactly a known event on a well-formed limb key. */
export function parseHealEvent(raw: unknown): HealEvent | null {
  try {
    if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return null;
    const o = raw as Record<string, unknown>;
    const type = o.type;
    const limb = o.limb;
    if (typeof type !== "string" || !TYPES.includes(type)) return null;
    if (typeof limb !== "string" || !LIMB_KEY.test(limb)) return null;
    return { type: type as HealEventType, limb };
  } catch {
    return null;
  }
}

export type PlateLimbState = "Possessed" | "Rotting" | "Healed" | "Healthy";
export type Effect =
  | { kind: "heal"; limb: string }
  | { kind: "convulse"; limb: string; line: string }
  | { kind: "ci-green"; limb: string };

/** `states` maps limb key to its current plate state. The input map is never changed. */
export interface Applied {
  states: Record<string, PlateLimbState>;
  effect: Effect | null;
}

const SICK: readonly string[] = ["Possessed", "Rotting"];

/**
 * Applies one raw event. Only a "healed" event for a limb that is currently Possessed or Rotting
 * produces a Healed state. A red CI never changes state. An unknown limb or a bad event does nothing.
 */
export function applyHealEvent(states: Readonly<Record<string, PlateLimbState>>, raw: unknown): Applied {
  const unchanged: Applied = { states: { ...states }, effect: null };
  try {
    const ev = parseHealEvent(raw);
    if (!ev) return unchanged;
    if (!Object.prototype.hasOwnProperty.call(states, ev.limb)) return unchanged;
    const now = states[ev.limb];
    if (!SICK.includes(now)) return unchanged;
    if (ev.type === "healed") return { states: { ...states, [ev.limb]: "Healed" }, effect: { kind: "heal", limb: ev.limb } };
    if (ev.type === "ci-red") return { states: { ...states }, effect: { kind: "convulse", limb: ev.limb, line: REJECTION_LINE } };
    return { states: { ...states }, effect: { kind: "ci-green", limb: ev.limb } };
  } catch {
    return unchanged;
  }
}

export type Verdict = "green" | "red" | "pending";

export interface SimStep {
  /** Delay from the start of the simulation, in ms. */
  atMs: number;
  /** One transcript line. Every line carries the SIMULATED CI label. */
  text: string;
  event?: HealEvent;
}

/** Fields of a dry-run payload (out/prs/*.json) the simulation reads. */
export interface DryRunPayload {
  ecosystem?: unknown;
  name?: unknown;
  from?: unknown;
  to?: unknown;
}

const tag = (s: string) => `[${SIMULATED_LABEL}] ${s}`;

/**
 * Replays a dry-run payload as graft, CI result, then heal (green) or rejection (red).
 * A payload without an ecosystem and a name, or a verdict other than green or red, yields no healing events.
 */
export function simulateFromPayload(payload: unknown, verdict: unknown): SimStep[] {
  try {
    if (payload === null || typeof payload !== "object") return [];
    const p = payload as DryRunPayload;
    const eco = clean(p.ecosystem, 12);
    const name = clean(p.name, 40);
    if (eco === "" || name === "") return [];
    const limb = limbKey(eco, name);
    if (!LIMB_KEY.test(limb)) return [];
    const from = clean(p.from, 20);
    const to = clean(p.to, 20);
    const what = from && to ? `${name} ${from} to ${to}` : name;
    const steps: SimStep[] = [{ atMs: 0, text: tag(`GRAFT ${name}: dry-run payload replayed, no token, no network (${what}).`) }];
    if (verdict === "green") {
      steps.push({ atMs: 1200, text: tag(`CI is green for ${name}.`), event: { type: "ci-green", limb } });
      steps.push({ atMs: 2400, text: tag(`${name} is healed. A human still has to approve the real fix.`), event: { type: "healed", limb } });
    } else if (verdict === "red") {
      steps.push({ atMs: 1200, text: tag(`CI is red for ${name}. ${REJECTION_LINE}`), event: { type: "ci-red", limb } });
    } else {
      steps.push({ atMs: 1200, text: tag(`CI is still pending for ${name}. The limb stays rotting.`) });
    }
    return steps;
  } catch {
    return [];
  }
}

/** A stand-in payload for the hosted demo, built from the first sick limb on the plate. Null if none. */
export function demoPayload(limbs: unknown): DryRunPayload | null {
  try {
    if (!Array.isArray(limbs)) return null;
    for (const l of limbs) {
      if (l && typeof l === "object") {
        const o = l as Record<string, unknown>;
        if ((o.state === "Possessed" || o.state === "Rotting") && clean(o.name, 40) !== "" && clean(o.ecosystem, 12) !== "") {
          return { ecosystem: o.ecosystem, name: o.name, from: o.version, to: o.fixedIn };
        }
      }
    }
    return null;
  } catch {
    return null;
  }
}
