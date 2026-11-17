// Pure reader of game output (bridge-v2 V2, V3, V6). No fs, clock, process or stderr access.
// A marker is a whole line printed by the game. Lines starting with "> " are input records and never count.
// The regex only finds candidates; grammar.ts parseCommand is the gate (failsafe 5).
import { parseCommand, type ParseResult } from "./grammar.js";

export type GameEvent =
  | { ok: true; lineNo: number; command: string; parsed: Extract<ParseResult, { ok: true }> }
  | { ok: false; lineNo: number; reason: string };

const MARKER = /^\[\[CRYPT ([A-Z]+(?: [A-Z]+)*)\]\]$/;
const MARKER_PREFIX = "[[CRYPT ";

export function parseGameOutput(text: string): GameEvent[] {
  const events: GameEvent[] = [];
  text.split("\n").forEach((raw, i) => {
    const line = raw.endsWith("\r") ? raw.slice(0, -1) : raw;
    if (line.startsWith("> ")) return; // input record, never a trigger
    const lineNo = i + 1;
    const m = MARKER.exec(line);
    if (!m) {
      if (line.startsWith(MARKER_PREFIX)) events.push({ ok: false, lineNo, reason: "malformed marker" });
      return;
    }
    const payload = m[1];
    const command = payload === "SEAL" ? "SEAL CRYPT" : payload;
    const parsed = parseCommand(command);
    // "SEAL CRYPT" is a command, not a payload: only the payload "SEAL" maps to it.
    if (!parsed.ok || (parsed.verb === "SEAL" && payload !== "SEAL")) {
      events.push({ ok: false, lineNo, reason: "marker fails the grammar" });
      return;
    }
    events.push({ ok: true, lineNo, command, parsed });
  });
  return events;
}
