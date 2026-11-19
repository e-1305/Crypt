// Reads and appends out/autopsy-history.json for crypt autopsy and crypt gazette.
import { dirname, join } from "node:path";
import type { Io } from "../../src/common/io.js";
import { appendLines, LIMB_HISTORY_FILE, linesFromCreature, parseHistoryJsonl, serializeHistoryJsonl, type HistoryLine } from "../../src/report/limb-history.js";
import { appendSnapshot, HISTORY_FILE, joinHistory, snapshotOf } from "../../src/report/history.js";

export function historyPath(creaturePath: string): string {
  return join(dirname(creaturePath), HISTORY_FILE);
}

function readJson(io: Io, path: string): unknown {
  try {
    return io.pathState(path) === "present" ? JSON.parse(io.readText(path)) : undefined;
  } catch {
    return undefined;
  }
}

/** The history to report from: state.history plus the history file. */
export function loadHistory(io: Io, creaturePath: string, state: unknown): unknown[] {
  const s = typeof state === "object" && state !== null ? (state as Record<string, unknown>).history : undefined;
  return joinHistory(s, readJson(io, historyPath(creaturePath)));
}

/** Records today's snapshot. A failed write is ignored: the report must still come out. */
export function recordSnapshot(io: Io, creaturePath: string, creature: unknown, now: number): void {
  try {
    const snap = snapshotOf(creature, now);
    if (snap === null) return;
    const p = historyPath(creaturePath);
    io.writeText(p, JSON.stringify(appendSnapshot(readJson(io, p), snap), null, 2) + "\n");
  } catch {
    // fail-safe: history is a convenience
  }
}

export function limbHistoryPath(creaturePath: string): string {
  return join(dirname(creaturePath), LIMB_HISTORY_FILE);
}

/** The per-limb history lines in a JSONL file. A missing or unreadable file gives []. */
export function loadLimbHistory(io: Io, path: string): HistoryLine[] {
  try {
    return io.pathState(path) === "present" ? parseHistoryJsonl(io.readText(path)) : [];
  } catch {
    return [];
  }
}

/** Appends one line per limb for this run to out/crypt-history.jsonl. A failed write is ignored, the report still comes out. */
export function recordLimbHistory(io: Io, creaturePath: string, creature: unknown, now: number): void {
  try {
    const p = limbHistoryPath(creaturePath);
    const prior = loadLimbHistory(io, p);
    const added = linesFromCreature(creature, now, "real", prior);
    if (added.length === 0) return;
    io.writeText(p, serializeHistoryJsonl(appendLines(prior, added)));
  } catch {
    // fail-safe: history is a convenience
  }
}
