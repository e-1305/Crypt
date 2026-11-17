# Design: transcript-bridge-spike

## Pipeline

```
commands.txt --> scripts/play.ts --> dfrotz spike.z5 (stdin/stdout) --> transcript.txt
                                                                           |
                                         src/bridge/watch.ts (tail) <------+
                                             |  grammar.ts (strict)
                                             +--> out/requests/graft-<n>-<limb>.json
                                             +--> crypt-audit.log
                                             +--> .crypt-seal
```

`npm run spike` = `build-game` then `play` then `watch --once`, then a check script that asserts the R8 counts.

## Toolchain (probed in the sandbox)

| Tool | Version probed | License |
|---|---|---|
| Inform 6 compiler (`inform6`) | 6.45 (DavidKinder/Inform6 @ 624aabb) | Artistic License 2.0 or original Inform licence, user's choice |
| Inform 6 standard library | 6.12.2 (DavidGriffith/inform6lib @ 33aebe6) | Artistic License 2.0 or traditional Inform licence |
| Frotz `dfrotz` (dumb interface) | 2.44 (DavidGriffith/frotz @ fe66e2e) | GPL-2.0 |

Built from source by `scripts/setup-tools.sh` into `.toolchain/` (git-ignored). No apt in the sandbox.
`dfrotz` is a separate process that we run; we do not link or redistribute it, so GPL-2.0 does not affect the MIT repo.

## Limitations and fallbacks

| # | Limitation found while probing | Fallback / handling |
|---|---|---|
| L1 | `dfrotz` does not echo stdin commands to stdout when input is piped. | The driver feeds one command at a time and writes `> <COMMAND>` itself before the game output. This is the primary design. |
| L2 | The in-game `SCRIPT` command makes `dfrotz` prompt for a filename on stdin, which is awkward to automate and mixes with commands. | Do not use `SCRIPT`. The driver builds `transcript.txt` from captured stdout (same fallback as L1). |
| L3 | `dfrotz` prints status-line text (`The Crypt   Score: 0  Moves: 1`) and `>` prompts into stdout. | Driver runs `dfrotz -m -p` and strips lines that match the status line and prompts. The watcher also ignores any line not starting with `> `. |
| L4 | `dfrotz` 2.44 fails to link with modern GCC (duplicate symbols). | Build with `CFLAGS="-O2 -fcommon"`. |
| L5 | `dfrotz` gives no marker for when output for one command is complete, other than the `>` prompt. | One `dfrotz` process per session with all commands piped in; the driver splits output on the `>` prompt. Fallback: feed commands one at a time and wait for the next prompt. |
| L6 | The Inform 6 library `#include` names use mixed case (`Parser`, `VerbLib`, `English`) while the library repo ships lowercase files; Linux is case-sensitive. | `setup-tools.sh` creates a case-fixed include directory of symlinks. Fallback: write a library-free game with a hand-written parser. |
| L7 | The standard library also accepts many verbs (`TAKE`, `LOOK`, ...). Game acceptance is not the security boundary. | The watcher grammar is the only gate (failsafe 5). Words outside the grammar are rejected there even if the game understood them. `SEAL CRYPT` and `GRAFT` are added with `Verb` lines in `game/spike.inf`. |
| L8 | Z5 limits: 8-bit object counts, 64 KB-ish text; not a concern for one room. | Revisit when game source is generated from scan data (use `-v8`/z8 then). |
| L9 | The browser interpreter (Tier 1) is not exercised by this spike. | Out of scope. `ATTRIBUTION.md` row left for a later spike. |

## Transcript format

Plain UTF-8, LF line endings.

```
> EXAMINE ARM
A rotting limb...
> GRAFT ARM
The surgeon begins the graft.
```

Command lines start with `> ` and carry the upper-cased command. Everything else is game output and ignored by the watcher.

## Grammar (`src/bridge/grammar.ts`)

```
command := ("EXAMINE" | "GRAFT") " " limb | "SEAL CRYPT"
limb    := [A-Z]{1,32}
```

Implemented as one anchored regex per production, tested against the whole string (no trimming, no case folding, no multi-line). Returns `{ ok: true, verb, limb }` or `{ ok: false }`. `SEAL CRYPT` has limb `-`. Any grammatical limb passes the parser and is audited, but only `GRAFT ARM` writes a request (per the issue). `GRAFT <other limb>` is audited as `NO_ACTION`.

## Watcher (`src/bridge/watch.ts`)

- `processTranscript(text, ctx)` is pure over an injectable `ctx` (paths, clock, fs ops) so property tests can inject faults.
- `--once` reads the whole file and exits. Default mode tails by polling the byte offset every 250 ms.
- For each `> ` line: parse. On reject: write nothing (stderr note only). On accept:
  - `EXAMINE`: audit `OK`.
  - `SEAL`: create `.crypt-seal` (flag `wx`; already existing is fine), audit `SEALED`.
  - `GRAFT`: check seal. If it exists or cannot be determined: audit `REJECTED_SEALED`, no request (any limb). Else if the limb is `ARM`: write the request, then audit `REQUEST_WRITTEN`. Else audit `NO_ACTION`, no request.
- Any thrown error inside handling: no further writes for that command, error to stderr, continue to next line only after re-checking the seal (fail safe).
- Order for GRAFT: request file written before the audit line; if the request write fails, audit `ERROR` is attempted and no retry. If the audit write fails after the request was written, the request file is removed and the watcher stays sealed.

## Files

| Item | Path |
|---|---|
| Seal file | `.crypt-seal` in the working directory (already git-ignored) |
| Audit log | `crypt-audit.log` in the working directory |
| Requests | `out/requests/graft-<seq>-<limb lowercase>.json`, seq is 3-digit counter from the transcript order |
| Request JSON | `{ "version": 1, "action": "GRAFT", "limb": "ARM", "command": "GRAFT ARM", "requestedAt": "<ISO>" }` |

## Audit line format

Tab-separated, one line per accepted command:

```
<ISO-8601 timestamp>\t<COMMAND>\t<LIMB or ->\t<OUTCOME>\t<PR URL or ->
```

Outcomes: `OK`, `NO_ACTION`, `REQUEST_WRITTEN`, `SEALED`, `REJECTED_SEALED`, `ERROR`. PR URL is always `-` in this spike.
Expected acceptance log: 4 lines (`EXAMINE ARM OK`, `GRAFT ARM REQUEST_WRITTEN`, `SEAL CRYPT SEALED`, `GRAFT ARM REJECTED_SEALED`).

## Failsafe mapping

Rules 3 (separation of privilege) and 6 (blast radius) concern PRs and verification and do not apply until a later spike. Recorded waiver: no real property exists yet, so `tests/review.test.ts` only checks invariants (requests are `GRAFT ARM` only, at most one per command, no merge or verification fields). Rule 4 holds because nothing here scores or ranks; a property test checks the watcher is deterministic. Rule 2 has a property test that no `fetch` is made on any generated transcript, plus the static grep in `tests/static.test.ts`.

## Review decisions (review 2026-11-17-124000)

1. **Driver-synthesized commands (fixed by documentation).** Because of L1, the `> CMD` lines come from the driver, not the game. This spike proves the pipeline (transcript line to parser to request, audit and seal), not that the game accepted the command. A game-reply check was not added: the replies are not machine-stable (the library varies wording) and the real source, a browser interpreter transcript, will differ. Fallback: require the reply line "The surgeon begins the graft." after `> GRAFT ARM` before acting.
2. **Tail replay (fixed).** `tail()` now starts at end-of-file; `--from-start` opts into replay. `seq` still restarts at 0 per process, so a restart on a populated `out/requests/` fails the exclusive create and audits `ERROR` (fail-safe, nothing overwritten). Known limitation.
3. **Property tests for rules 2, 3, 4, 6 (partly fixed, partly waived).** See Failsafe mapping. The `merge` grep also matches comments and identifiers; accepted for a spike, change the word if it trips.
4. **Audit scope (decision).** Rejected lines are not agent actions (no action is taken), so they go to stderr only, not `crypt-audit.log`. Rule 8 covers accepted commands.
5. **Segmentation on `^> ` (fixed).** `buildTranscript` now throws unless the segment count is exactly commands + 1, so a game line starting with `> ` fails the run instead of shifting segments. Tested.
6. **Manual unseal (decision).** Once a SEAL is seen the process stays sealed. Deleting `.crypt-seal` re-enables GRAFT in a running watcher only if no SEAL was processed by that process. Removing the file is the intended manual unseal; restart the watcher afterwards.

## Testing

vitest + fast-check, in `tests/`. Properties follow the table in requirements.md R9. A static test greps `src/` for `merge`/network imports.
