# Requirements: transcript-bridge-spike

Goal: prove end to end that a real Z-machine game can trigger an agent action.
Throwaway-quality spike. No GitHub calls. Follows `.kiro/steering/failsafe.md`.

Terms: **transcript** is `transcript.txt`. **Watcher** is `src/bridge/watch.ts`. **Seal file** is `.crypt-seal`. **Audit log** is `crypt-audit.log`. **Graft request** is a JSON file in `out/requests/`.

## R1 Game
1. The game source `game/spike.inf` SHALL define one room, "The Crypt", and one object, "arm".
2. WHEN the player enters `EXAMINE ARM`, the game SHALL describe the arm.
3. WHEN the player enters `GRAFT ARM`, the game SHALL print "The surgeon begins the graft."
4. WHEN the player enters `SEAL CRYPT`, the game SHALL print a confirmation that the crypt is sealed.

## R2 Build and play
1. The build script SHALL compile `game/spike.inf` to `spike.z5` with the Inform 6 compiler.
2. The play script SHALL run `spike.z5` headlessly from a commands file and write `transcript.txt`, where each command appears as a line `> <COMMAND>` followed by the game output.

## R3 Strict grammar (failsafe 5, complete mediation)
1. The parser SHALL accept only `EXAMINE <limb>`, `GRAFT <limb>` and `SEAL CRYPT`, where `<limb>` is 1 to 32 characters from `A-Z`, with single spaces and no surrounding whitespace.
2. IF an input does not match the grammar exactly, THEN the parser SHALL return a rejection and the watcher SHALL write no request, no seal file and no audit line.
3. The watcher SHALL pass every `> ` command line of the transcript through the parser before taking any action. Game output lines are not commands and are ignored.

## R4 Graft request
1. WHEN an accepted `GRAFT ARM` is read and no seal file exists, the watcher SHALL write one JSON file to `out/requests/` containing the limb, the command and a timestamp.
2. WHEN an accepted `GRAFT <limb>` names a limb other than ARM, the watcher SHALL write no request and SHALL audit it as `NO_ACTION`.
3. The watcher SHALL make no network call and SHALL NOT contain any GitHub merge call (failsafe 2).

## R5 Seal (failsafe 7, kill switch)
1. WHEN an accepted `SEAL CRYPT` is read, the watcher SHALL create the seal file.
2. WHILE the seal file exists, the watcher SHALL refuse every `GRAFT` and write no request.

## R6 Audit (failsafe 8)
1. For every command accepted by the grammar, the watcher SHALL append exactly one line to `crypt-audit.log` with timestamp, command, limb, outcome and PR URL (`-` in this spike).
2. A refused GRAFT SHALL be logged with outcome `REJECTED_SEALED`.

## R7 Fail-safe (failsafe 1)
1. IF any error occurs while handling a command (I/O failure, unreadable seal state, bad input), THEN the watcher SHALL change nothing further and treat the crypt as sealed for that command.
2. IF the seal file's existence cannot be determined, THEN the watcher SHALL refuse the GRAFT.

## R8 Acceptance
`npm run spike` SHALL compile the game, play `EXAMINE ARM`, `GRAFT ARM`, `SEAL CRYPT`, `GRAFT ARM`, and the result SHALL be exactly 1 graft request, exactly 4 audit lines, and 1 `REJECTED_SEALED` graft.

## R9 Property tests (fast-check), one per failsafe rule
| Rule | Property |
|---|---|
| 1 Fail-safe defaults | Any parse error or injected I/O error writes nothing |
| 2 Least privilege | Source under `src/` contains no merge call and no network client |
| 4 Economy | Parser and watcher import no LLM or network module |
| 5 Complete mediation | The parser rejects every string outside the grammar |
| 7 Kill switch | After SEAL, no request is ever written, for any command sequence |
| 8 Audit | Accepted commands yield exactly one audit line each; rejected input yields none |
| 3, 6 | Out of spike scope (no PRs, no verifier yet); noted in design.md |

## R10 Attribution
Every third-party tool (Inform 6 compiler, Inform 6 library, interpreter) SHALL be recorded in `docs/ATTRIBUTION.md` with its license.
