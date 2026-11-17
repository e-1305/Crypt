# Design: bridge-v2

## Pipeline

```
commands.txt --> scripts/play.ts --> dfrotz spike.z5 --> transcript.txt
                                         |                   |
          game prints [[CRYPT ...]] <----+                   |
          on accepted actions only                           v
                                          src/bridge/parse-output.ts
                                          parseGameOutput(text) -> GameEvent[]
                                                             |
                                          src/bridge/watch.ts (tail)
                                                |  grammar.ts parseCommand (gate)
                                                +--> out/requests/graft-<n>-<limb>.json
                                                +--> crypt-audit.log
                                                +--> .crypt-seal
```

`> CMD` lines are still written by `play.ts` (spike L1) and stay in `transcript.txt`, but `parseGameOutput` skips them.

## Marker syntax

A marker is a whole line matching:

```
^\[\[CRYPT ([A-Z]+(?: [A-Z]+)*)\]\]$
```

Tested against one line, with no trimming. The captured payload maps to a command string:

| Payload | Command string |
|---|---|
| `GRAFT ARM` | `GRAFT ARM` |
| `EXAMINE ARM` | `EXAMINE ARM` |
| `SEAL` | `SEAL CRYPT` |
| anything else | unchanged, then judged by the grammar |

The command string then goes through `parseCommand` in `grammar.ts`. The regex only finds candidates. The grammar is the gate (failsafe 5).

## GameEvent

```ts
type GameEvent =
  | { ok: true; lineNo: number; command: string; parsed: ParsedCommand }
  | { ok: false; lineNo: number; reason: string };
```

`ok: false` covers a line that looks like a marker but fails the grammar, or has extra text around the marker. The watcher writes a stderr note for these and nothing else. `lineNo` is 1-based. Input lines and plain game text produce no event.

## Modules

- New `src/bridge/parse-output.ts`: exports `parseGameOutput`. It imports only `grammar.ts`. No fs, clock or process access, so it is pure and reusable by Tier 1.
- `src/bridge/watch.ts`: `processText` and `processLine` call `parseGameOutput` and act on its events. The seal, request and audit logic is unchanged. Tailing still passes new complete lines through the same function.
- `game/spike.inf`: prints the marker from the `GRAFT ARM`, `EXAMINE ARM` and `SEAL CRYPT` routines only, after the action is accepted.

## Reading markers in the browser (Tier 1)

The browser interpreter has no driver and no `transcript.txt`. The page collects the text the interpreter prints to its output window for each turn (and keeps the full buffer), splits it into lines, and calls the same `parseGameOutput`. The events then go to the same watcher handling. Player input is echoed by the interpreter in a separate input style or line. The page drops that before parsing, or the line starts with `> ` and `parseGameOutput` ignores it identically.

Not proven yet: no browser interpreter is wired in, the interpreter's echo format is not checked, and the page to watcher hand-off is not designed. This section only fixes the contract: text in, `GameEvent[]` out.

## Threat notes

- Player input cannot forge a marker: input lines start with `> ` and are ignored, the game does not echo raw input in its own output, and the driver strips output lines starting with `>`.
- Known limitation (requirements L2): a game library message that echoes player text on its own line could forge a marker. Mitigations: `spike.inf` prints markers only from accepted-action routines, `parseGameOutput` needs the whole line to match, and the grammar gate runs on the payload.
- `play.ts` still writes `> CMD` lines (spike L1). They no longer matter for triggering.

## Failsafe mapping

Rules 1, 2, 4, 5, 7 and 8 keep their property tests, fed with marker transcripts. Rule 5 adds: any string outside the marker regex or grammar yields no action. V4 adds the spoofing property. Rules 3 and 6 stay waived as in the spike.

## Review decisions

1. **Markers replace the spike's game-reply fallback.** The spike design (review decision 1) proposed requiring the reply "The surgeon begins the graft." as a fallback. Markers replace it: they are machine-stable and printed only on acceptance.
