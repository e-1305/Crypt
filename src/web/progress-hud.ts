// Compact team XP/level HUD for the Bench. The model is pure; storage is a try/catch localStorage wrapper.
// Blameless: the record holds limb keys and a KEV flag only. Nothing names or counts a person.
import { levelFor, teamProgress, LEVELS, type HealRecord } from "../theatre/progress.js";

export const HUD_KEY = "crypt.team-heals";
export const HUD_LABEL = "this browser";

/** limb key -> was it a CISA KEV limb. One entry per limb, so a reload never counts a heal twice. */
export type HealLog = Record<string, boolean>;

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** Reads the log. Blocked storage, bad JSON or a wrong shape give an empty log. */
export function loadLog(storage: StorageLike | null | undefined): HealLog {
  try {
    const raw = storage?.getItem(HUD_KEY);
    const o: unknown = raw ? JSON.parse(raw) : null;
    if (!o || typeof o !== "object" || Array.isArray(o)) return {};
    const out: HealLog = {};
    for (const [k, v] of Object.entries(o)) if (typeof v === "boolean") out[k] = v;
    return out;
  } catch {
    return {};
  }
}

/** Adds new heals to the log (existing keys keep their first entry) and saves it. Returns the log; a save failure is ignored. */
export function recordHeals(storage: StorageLike | null | undefined, healed: readonly { key: string; kev: boolean }[]): HealLog {
  const log = loadLog(storage);
  let changed = false;
  for (const h of healed) {
    if (typeof h?.key !== "string" || h.key in log) continue;
    log[h.key] = h.kev === true;
    changed = true;
  }
  if (changed) {
    try { storage?.setItem(HUD_KEY, JSON.stringify(log)); } catch { /* storage unavailable: the HUD still shows this visit */ }
  }
  return log;
}

export interface HudModel {
  label: string;
  level: number;
  title: string;
  xp: number;
  /** XP into the current level, and the span to the next one. Both 0 at the top level. */
  into: number;
  span: number;
  /** 0 to 100. 100 at the top level. */
  percent: number;
  text: string;
}

export function hudModel(log: HealLog): HudModel {
  const heals: HealRecord[] = Object.values(log).map((kev) => ({ kev }));
  const p = teamProgress(heals);
  const next = LEVELS.find((l) => l.level === p.level.level + 1);
  const into = next ? p.xp - p.level.xp : 0;
  const span = next ? next.xp - p.level.xp : 0;
  const percent = next ? Math.min(100, Math.max(0, Math.round((into / span) * 100))) : 100;
  const more = p.toNext === null ? "Top level reached." : `${p.toNext} XP to level ${p.level.level + 1}.`;
  return { label: HUD_LABEL, level: levelFor(p.xp).level, title: p.level.title, xp: p.xp, into, span, percent, text: `Team level ${p.level.level}, ${p.level.title}. ${p.xp} XP, ${HUD_LABEL}. ${more}` };
}
