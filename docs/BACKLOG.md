# Backlog

Written by the product manager role from [PLAYTEST_LOG.md](PLAYTEST_LOG.md). Items are ordered by value divided by effort. Each cites the finding it comes from. Round 3 backlog. Round 3 mean score is 7.4 (Round 2: 6.9, Round 1: 6.1), a gain of 0.5, so no plateau yet. The scores that held (wow 7, accessibility 7, safety 8) are the ones with no new work behind them.

Constraints that apply to every item: no merge call, SEAL CRYPT blocks grafts, one team score and no leaderboard, no em dashes in user-facing copy, page weight at most 5 MB, sound off by default, the 2D page and reduced motion keep every feature. Claims that cannot be checked here (GPU, audio, Lighthouse, axe-core, screen readers) stay marked "not verified" in the text that makes them.

## Round 2 status

| # | Item | Status | Evidence |
|---|---|---|---|
| 1 | Devpost front door | Done. GIF still not recorded | README top, `docs/PITCH.md`, `docs/DEVPOST.md`, `docs/img/bench-3d.png` |
| 2 | Shot list | Done | `docs/DEMO.md`, `docs/ACCESSIBILITY.md` |
| 3 | How it works | Done | harness `how-it-works-clicks`: all within 2 clicks, section under 450 words |
| 4 | KIRO.md | Done | `tests/devpost-docs.test.ts` |
| 5 | Prompt in reach, caption, tutorial | Done | harness `prompt-in-reach-*`, `try-chip`, `caption-3d`, `tutorial-after-green` all true in the Round 3 run |

## 1. Fix the three things a judge sees in the first 10 seconds of the 3D page

Findings: Round 3 polish 7 and accessibility 7.

User value: on the default 3D view the "How to play (manual)" button sits on top of the title of Plate I, and "Nights Without Possession" on the raid board is in tiny type. In the keyboard-only harness run, "Skip to the game input" is the second-to-last Tab stop, after the tutorial and install buttons, so it skips nothing.

Effort: small (CSS and DOM order).

Acceptance criteria:
- "Skip to the game input" is the first Tab stop on `/` and `/?theatre=off`, checked by the `keyboard-only` scenario.
- At 1280x720 on 3D, no DOM control overlaps the plate title text. The harness records the bounding boxes of the manual button and of the plate title region, and a screenshot is read by eye.
- The "Nights Without Possession" line is at least 12 px at 1280x720 or is moved into the bench drawer.
- The `.crypt-seal` reminder is out of scope here (see item 2).

## 2. Make the CLI first run end on a next step that works

Findings: Round 3 CLI first run. `crypt raid fixtures/vulnerable-npm --offline` prints the plate and the opening of the story, then returns with no hint of what to type. `echo "GRAFT JQUERY" | crypt play` then answers `NO_FIX_AVAILABLE`, and `crypt play --advisories data/advisories` answers `ERROR`, because `play` does not remember the target or the advisories that `raid` used. The same command piped into `raid` writes the dry-run payload. A stale `.crypt-seal` in the working directory also seals a fresh raid; the output says so, but only after the plate.

User value: the geek who runs the one command in the README and then tries `GRAFT JQUERY` in a second command sees a failure that looks like a product bug.

Effort: medium (CLI wiring and one message).

Acceptance criteria:
- `crypt raid` ends with one line, "Next: type GRAFT JQUERY at the prompt" (naming the first limb), when it is run interactively. Non-interactive runs print the same line to stderr.
- `crypt play` with no flags in the directory where `raid` ran grafts the first limb as `raid` does (it reads the target and advisory folder from the raid output), or states in one sentence which flag is missing. `NO_FIX_AVAILABLE` and `ERROR` each get a one-line reason.
- If `.crypt-seal` exists when `raid` starts, the first output line says "The crypt is sealed (found .crypt-seal). Run 'crypt unseal' to lift it."
- Tests cover the three cases. A test pins that nothing is written under `out/prs/` when the seal is present.

## 3. Explain what looks like a bug: the `(at)` in owner names

Findings: Round 3 CLI first run. The plate shows `@crypt-fixture/supply-chain`, the game text shows `(at)crypt-fixture/supply-chain`. `src/raise/sanitize.ts` does this on purpose (the Inform source cannot carry a raw `@`), but nothing says so, and a judge who "does not trust a number that disagrees with another number" will not trust two spellings of one owner either.

User value: technical credibility. It turns a visible oddity into a visible design note.

Effort: small.

Acceptance criteria:
- Either the game prints `@` for owner names (a test compiles a creature with an owner and reads the transcript), or the manual's "How it works" says in one sentence why the story text spells it `(at)`.
- The choice is recorded in `docs/KIRO.md` or the manual, not only in a code comment.

## 4. Evidence that only a person can record

Findings: Round 3 Kiro story 7 and wow 7. The README has a screenshot but no motion, and `docs/KIRO.md` still says no hook has fired inside a Kiro session.

User value: a 20 second GIF is the wow a reader gets without opening the page. One recorded hook run inside Kiro turns the strongest honest caveat into evidence.

Effort: small for a human, impossible for this sandbox (no screen recorder, no Kiro session).

Acceptance criteria:
- A GIF under 2 MB of "Simulate CI: green" and the SEAL rejection, committed to `docs/img/` with a text alternative, linked from README below the screenshot.
- One hook run from a real Kiro session, with a captured log committed under `.kiro/` and the "Limits" paragraph in `docs/KIRO.md` updated to say what was and was not seen.
- Until both exist the text says "not recorded". Nobody writes them as done.

## Not now

- Leaderboards or per-person scores. Against the product pillars.
- New ecosystems beyond npm and pip. Tier 1 scope.
- Real-GPU performance work and a Lighthouse score. Needs hardware or tooling this sandbox does not have. Re-check before the demo recording and state the result as measured or not verified.
- A voiced or music-driven trailer. Sound is off by default and unverified here.
- Anything that opens a live PR from the Pages site. The page is a rehearsal by design.
