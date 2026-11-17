// Pure output hook (web-player W2, W4). No DOM, fs, clock, network or process access.
// Turns interpreter text chunks into complete lines and feeds every line to parseGameOutput.
// Typed input reaches the hook only through input(), as a "> " line that parseGameOutput skips.
import { parseGameOutput, type GameEvent } from "../bridge/parse-output.js";

export interface HookResult {
  lines: string[];
  events: GameEvent[];
}

export interface OutputHook {
  feed(chunk: string): HookResult;
  input(text: string): HookResult;
  flush(): HookResult;
}

export function createOutputHook(): OutputHook {
  let pending = "";
  let emitted = 0; // complete lines already handed out

  function judge(lines: string[]): HookResult {
    if (lines.length === 0) return { lines: [], events: [] };
    const base = emitted;
    emitted += lines.length;
    const events = parseGameOutput(lines.join("\n")).map((e) => ({ ...e, lineNo: e.lineNo + base }));
    return { lines, events };
  }

  function takePending(): string[] {
    if (pending === "") return [];
    const line = pending.endsWith("\r") ? pending.slice(0, -1) : pending;
    pending = "";
    return [line];
  }

  return {
    feed(chunk) {
      pending += chunk;
      const parts = pending.split("\n");
      pending = parts.pop() ?? "";
      return judge(parts.map((p) => (p.endsWith("\r") ? p.slice(0, -1) : p)));
    },
    input(text) {
      const echo = "> " + text.replace(/[\r\n]/g, "");
      return judge([...takePending(), echo]);
    },
    flush() {
      return judge(takePending());
    },
  };
}
