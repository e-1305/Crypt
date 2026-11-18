// First 30 seconds (Milestone G3): guided tutorial steps, idle hints, a display-only "possession spreads" pressure level
// and a daily banner. Pure: no clock (idle and elapsed times are passed in), no random, no fs, no network.
// Failsafe: the tutorial only ever suggests text for the player to type. Nothing here runs a command, and every
// suggested command passes parseCommand (strict grammar) in tests/onboarding.test.ts. Display only: teamScore() in
// raid.ts is untouched. Blameless: limbs and the team only, no person appears.
import { parseCommand } from "../bridge/grammar.js";
import { clean } from "../render/plate.js";
import { RAID_MS, fnv1a } from "./raid.js";

export const IDLE_HINT_MS = 8000;
export const WARN_MINUTES = [10, 5, 1] as const;

export interface TutorialStep {
  id: "look" | "examine" | "assign" | "graft" | "ci" | "seal" | "review";
  /** Shown in the strip. "{limb}" is replaced by the limb id the player types. */
  text: string;
  /** The command the player types, with "{limb}" in place of the limb. null for read-only steps. */
  command: string | null;
  /** Read-only steps finish with the Got it button; command steps finish when the game accepts the verb. */
  verb: "EXAMINE" | "ASSIGN" | "GRAFT" | null;
  /** Steps that finish on a page event, not on a typed verb: the simulated CI went green, or a graft was refused by the seal. */
  event?: TutorialEvent;
  /** The idle hint for an event step that has no command to type. */
  hint?: string;
}

export type TutorialEvent = "ci-green" | "seal-refused";

export const tutorialSteps: readonly TutorialStep[] = [
  { id: "look", text: "Look at the creature in Plate I. Limbs marked possessed or rotting are the ones to heal.", command: null, verb: null },
  { id: "examine", text: "Type EXAMINE {limb} in the game input to inspect a limb that has a rehearsal pull request.", command: "EXAMINE {limb}", verb: "EXAMINE" },
  { id: "assign", text: "Type ASSIGN {limb} to put a healer on it.", command: "ASSIGN {limb}", verb: "ASSIGN" },
  { id: "graft", text: "Type GRAFT {limb} yourself to open a rehearsal pull request. Nothing leaves this page.", command: "GRAFT {limb}", verb: "GRAFT" },
  { id: "ci", text: "Run Simulate CI: green, below the raid panel. A limb heals only when CI is green.", command: null, verb: null, event: "ci-green", hint: "Hint: press the Simulate CI: green button and watch the plate." },
  { id: "seal", text: "Type SEAL CRYPT, then GRAFT {limb}. The graft is rejected, because a sealed crypt runs nothing.", command: "SEAL CRYPT", verb: null, event: "seal-refused" },
  { id: "review", text: "The pull request now waits for a human to review it. CRYPT leaves the final decision to people.", command: null, verb: null },
];

const LIMB_ID = /^[A-Z]{1,32}$/;

/** The text to type for a step, or null for a read-only step or a limb id the grammar would not accept. */
export function tutorialCommand(step: TutorialStep, limb: string): string | null {
  if (step.command === null || !LIMB_ID.test(limb)) return null;
  const text = step.command.replace("{limb}", limb);
  return parseCommand(text).ok ? text : null;
}

export function stepText(step: TutorialStep, limb: string): string {
  return step.text.replace("{limb}", LIMB_ID.test(limb) ? limb : "(a limb name from the plate)");
}

/** One hint at most: for the first unfinished step, and only after 8 seconds without input. */
export function nextHint(stepDone: readonly boolean[], idleMs: number, limb = ""): string | null {
  if (!(idleMs >= IDLE_HINT_MS)) return null;
  const i = tutorialSteps.findIndex((_, k) => stepDone[k] !== true);
  if (i < 0) return null;
  const step = tutorialSteps[i];
  const cmd = tutorialCommand(step, limb);
  if (step.event === "seal-refused") return "Hint: type SEAL CRYPT and press Enter, then type GRAFT " + (LIMB_ID.test(limb) ? limb : "followed by a limb name") + ".";
  if (step.event && step.hint) return step.hint;
  if (cmd !== null) return "Hint: type " + cmd + " and press Enter.";
  if (step.command !== null) return "Hint: type " + step.verb + " followed by a limb name from the plate, in capital letters.";
  return "Hint: read the step above, then press Got it.";
}

/** 0..1 level of "possession spreads". Rises with elapsed time; open KEV limbs make it climb faster. Recomputed on every render, so healing a KEV limb lowers it. */
export function spreadPressure(elapsedMs: number, openKevCount: number): number {
  const t = Number.isFinite(elapsedMs) ? Math.min(1, Math.max(0, elapsedMs / RAID_MS)) : 0;
  const k = Number.isFinite(openKevCount) ? Math.min(3, Math.max(0, Math.floor(openKevCount))) : 0;
  return Math.min(1, t * (0.7 + 0.1 * k));
}

export function pressureLabel(level: number, openKevCount: number): string {
  const pct = Math.round(Math.min(1, Math.max(0, level)) * 100);
  const act = openKevCount > 0 ? "Heal the KEV limbs first." : "Heal the next limb.";
  return "Possession spread: " + pct + " percent. " + act;
}

/** The warning for the time left, at 10, 5 and 1 minutes. Null before the first threshold. */
export function pressureWarning(remainingMs: number): string | null {
  if (!Number.isFinite(remainingMs)) return null;
  const mins = [...WARN_MINUTES].reverse().find((m) => remainingMs <= m * 60000);
  if (mins === undefined) return null;
  return mins === 1 ? "One minute left. Possession is spreading fast." : mins + " minutes left. Possession is spreading.";
}

export const DAILY_EVENTS = [
  "Fog Night: the crypt is quiet. A good day to heal the oldest limb.",
  "Full Moon Raid: KEV limbs spread possession fastest. Heal them first.",
  "Open Slab Day: every limb on the table is waiting for its first EXAMINE.",
  "Steady Hands: one limb at a time, one pull request at a time.",
  "Lantern Night: look closely at the plate. The quiet limbs hold surprises.",
  "Thunder Rolls: chain heals within 90 seconds to keep the combo alive.",
  "Grave Shift: the team that heals together keeps the creature breathing.",
  "Dawn Patrol: heal before the pressure meter fills and the day starts clean.",
] as const;

/** Same date, same banner, on every machine. A malformed date falls back to the first banner. */
export function dailyEvent(dateISO: string): string {
  const day = typeof dateISO === "string" && /^\d{4}-\d{2}-\d{2}/.test(dateISO) ? dateISO.slice(0, 10) : "";
  return day === "" ? DAILY_EVENTS[0] : DAILY_EVENTS[fnv1a(clean("crypt-daily|" + day, 40)) % DAILY_EVENTS.length];
}
