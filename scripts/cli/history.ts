// Reads and appends out/autopsy-history.json for crypt autopsy and crypt gazette.
import { dirname, join } from "node:path";
import type { Io } from "../../src/common/io.js";
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
