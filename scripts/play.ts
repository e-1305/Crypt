// Usage: play.ts [story.z5|z8] [session.txt]. Defaults to spike.z5 and game/session.txt.
// Play a story headlessly with dfrotz and write transcript.txt.
// dfrotz does not echo piped input (design.md L1), so this driver writes "> COMMAND" lines itself.
// Those lines are a record only. The watcher triggers on marker lines the game prints (bridge-v2).
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dfrotzPath } from "./toolchain-dir.js";

export const STATUS_LINE = /^[>\s]*The Crypt\s+Score:.*$/;

export function buildTranscript(commands: string[], stdout: string): string {
  // Segment 0 is the intro. Segment k (1..n) is the output of command k (design.md L3, L5).
  const segments = stdout.split(/^> /m);
  // dfrotz prints a final prompt after the last command, which yields one trailing near-empty segment.
  if (segments.length === commands.length + 2 && /^[>\s]*(EOT)?\s*$/.test(segments[segments.length - 1])) {
    segments.pop();
  }
  if (segments.length !== commands.length + 1) {
    // Too many segments also happens when game output has a line starting with "> ".
    throw new Error(`expected ${commands.length + 1} output segments, got ${segments.length}`);
  }
  const out: string[] = [];
  commands.forEach((cmd, i) => {
    out.push(`> ${cmd}`);
    for (const raw of segments[i + 1].split("\n")) {
      if (STATUS_LINE.test(raw)) continue;
      const line = raw.trim();
      // Game output must never look like a command line, so drop anything starting with ">".
      if (line === "" || line === "." || line === "EOT" || line.startsWith(">")) continue;
      out.push(line);
    }
  });
  return out.join("\n") + "\n";
}

function main(): void {
  const story = process.argv[2] ?? "spike.z5";
  const commands = readFileSync(process.argv[3] ?? "game/session.txt", "utf8")
    .split("\n")
    .filter((l) => l !== "");
  const r = spawnSync(dfrotzPath(), ["-m", "-p", story], {
    input: commands.join("\n") + "\n",
    encoding: "utf8",
    timeout: 20000,
  });
  if (r.error || r.status !== 0) {
    throw new Error(`dfrotz failed: ${r.error?.message ?? `exit ${r.status}`}`);
  }
  writeFileSync("transcript.txt", buildTranscript(commands, r.stdout));
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  main();
}
