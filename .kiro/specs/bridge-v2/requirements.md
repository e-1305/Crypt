# Requirements: bridge-v2

Goal: the game, not the driver, decides when the agent acts. The game prints a marker line only when it accepts an action, and the watcher triggers only on those marker lines. Follows `.kiro/steering/failsafe.md`. Extends `transcript-bridge-spike` (issue #3).

Terms as in the spike spec. **Marker** is a whole line of game output of the form `[[CRYPT <PAYLOAD>]]`. **Game output** is every transcript line that does not start with `> `. **Input line** is a transcript line starting with `> `.

## V1 Game-emitted markers
1. WHEN the game accepts `GRAFT ARM`, it SHALL print the whole-line marker `[[CRYPT GRAFT ARM]]`.
2. WHEN the game accepts `EXAMINE ARM`, it SHALL print the whole-line marker `[[CRYPT EXAMINE ARM]]`.
3. WHEN the game accepts `SEAL CRYPT`, it SHALL print the whole-line marker `[[CRYPT SEAL]]`.
4. IF the game rejects or does not understand a command, THEN it SHALL print no marker.

## V2 Watcher triggers only on game output markers
1. The watcher SHALL take action only for marker lines found in game output.
2. Input lines (starting with `> `) SHALL never trigger anything. They stay in `transcript.txt` as a record only and SHALL add no audit lines.
3. Game output that is not a marker SHALL be ignored.

## V3 Defense in depth (failsafe 5)
1. The marker payload SHALL be mapped to a command string: `SEAL` becomes `SEAL CRYPT`, every other payload is unchanged.
2. The command string SHALL pass `parseCommand` in `src/bridge/grammar.ts` before any action.
3. IF a marker fails the grammar, is not alone on its line, or has extra text before or after it, THEN the watcher SHALL write no request, no seal file and no audit line, and SHALL write a note to stderr only.

## V4 Spoofing property test
1. A marker-looking string typed as player input (for example `> [[CRYPT GRAFT ARM]]`) SHALL never produce a request, an audit line or a seal, for any generated transcript in which that string appears only on input lines.

## V5 Acceptance unchanged
`npm run spike` SHALL still yield exactly 1 graft request, exactly 4 audit lines and 1 `REJECTED_SEALED` graft after the seal. The audit outcomes stay `OK`, `REQUEST_WRITTEN`, `SEALED`, `REJECTED_SEALED`.

## V6 Pure parser
`parseGameOutput(text: string): GameEvent[]` SHALL be a pure function with no fs, clock or process access, so the browser interpreter (Tier 1) can reuse it. `watch.ts` SHALL call it.

## V7 Failsafe rules kept
All failsafe rules stay in force. Rules 3 and 6 stay waived as in the spike. Every other rule keeps a property test, adapted to marker input.

## Limitations

| # | Limitation | Handling |
|---|---|---|
| L1 | `play.ts` still writes `> CMD` lines itself because `dfrotz` does not echo input (spike L1). | They are record only and no longer matter for triggering (V2). |
| L2 | A game library message that echoes player text on its own line could forge a marker. | `spike.inf` prints markers only from accepted-action routines, the whole line must match, and the grammar gate applies (V3). |
| L3 | Browser reading of markers is designed but not built or proven. | See design.md, section "Reading markers in the browser (Tier 1)". |
