# Backlog

Written by the product manager role from [PLAYTEST_LOG.md](PLAYTEST_LOG.md). Items are ordered by value divided by effort. Each cites the finding it comes from. Round 2 backlog. Round 2 mean score is 6.9 (Round 1: 6.1); the scores that held (wow 7, accessibility 7) are the ones with no new work behind them.

Constraints that apply to every item: no merge call, SEAL CRYPT blocks grafts, one team score and no leaderboard, no em dashes in user-facing copy, page weight at most 5 MB, sound off by default, the 2D page and reduced motion keep every feature. Claims that cannot be checked here (GPU, audio, Lighthouse, axe-core, screen readers) stay marked "not verified" in the text that makes them.

## Round 1 status

| # | Item | Status | Evidence |
|---|---|---|---|
| 1 | Pitch and one command above the fold | Done on 2D. Partial on 3D | 2D: title, pitch, `npx` line, Kiro link in the first viewport at 1280x720 and 390x780. 3D default view shows none of them |
| 2 | One count vocabulary | Done | Plate, game intro and CLI use "dependencies" and "limbs that spawn" |
| 3 | `DRYRUN_WRITTEN` audit outcome | Done | CLI log reads `REQUEST_WRITTEN, DRYRUN_WRITTEN, SEALED, REJECTED_SEALED` |
| 4 | Visible heal and SEAL badge | Done, one gap | Badge, refusal text, event log line and announcer all seen. The tutorial text does not advance after "Simulate CI: green" in the harness run |
| 5 | Keyboard order and bench board | Done, axe not run | Tab order listed, announcer on high contrast, board has no overlap. axe-core still not run |

## 1. Devpost front door: README top section, `docs/PITCH.md`, `docs/DEVPOST.md`

Findings: Round 2 Devpost reader's pass, wow factor held at 7.

User value: most judges read the Devpost page and the README before they open the app. Today neither shows the product. A geek who reads 200 words and sees one image should know what CRYPT is, that it is safe, and where to click.

Effort: small (writing and two captured images).

Acceptance criteria:
- `docs/PITCH.md` exists, about 200 words (between 180 and 220, checked by `wc -w`), in plain language. It covers: the problem (every app is a Frankenstein of strangers' code), what CRYPT does (a dependency tree becomes a creature you heal by playing a Z-machine game), the guarantee (no merge call, SEAL blocks grafts, a human lands every PR), the Kiro story in one sentence, and one command to try. No em dashes, no superlatives.
- README: the first screen after the title holds the tagline, the live demo link, the `npx` line and one image slot. The image is a screenshot taken with `scripts/playtest/judge.mjs` (the bench with the plate, 1280x720, under 300 KB) committed to `docs/img/`. A GIF is a stretch goal: record it with the Recording mode button per the shot list in item 2, under 2 MB, with a text alternative. Until the image is committed the README says nothing about it (no broken image link).
- The "Live demo" section moves above "Quickstart". A "How it works in 60 seconds" link points at item 3.
- `docs/DEVPOST.md` follows the Devpost headings (Inspiration, What it does, How we built it with Kiro, Challenges, What we learned, What is next, Built with) in at most 60 lines. "What is next" and "Challenges" state what is not verified (no real GPU or audio test, no live Lighthouse score).
- A search for the em dash character (U+2014) in `README.md`, `docs/PITCH.md` and `docs/DEVPOST.md` returns nothing.

## 2. Refresh `docs/DEMO.md` with a 3 minute shot list

Findings: Round 2 Devpost reader's pass (DEMO.md is a runbook with no shot list).

User value: the demo video is the most-viewed artefact. A timed shot list makes the recording repeatable and keeps the safety beats in.

Effort: small.

Acceptance criteria:
- A section at the top of `docs/DEMO.md`, "Shot list (3:00)", with a table of time, what is on screen, what is said, and which command or button. It covers, in order: the landing (0:00 to 0:15), `npx ... raid ... --offline` in a terminal with the ranked list (0:15 to 0:45), `GRAFT JQUERY` and the dry-run payload (0:45 to 1:15), "Simulate CI: green" with the SIMULATED label in frame (1:15 to 1:40), `SEAL CRYPT` then `GRAFT LODASH` rejected and `cat crypt-audit.log` (1:40 to 2:10), the Kiro beat: `.kiro/specs/`, a hook run, the steering file (2:10 to 2:40), the live PR on `e-1305/crypt-demo` merged by a person (2:40 to 3:00).
- Each beat names its fallback if a network or GPU step fails (the 2D page with `?theatre=off`, `--offline`).
- The runbook (token, reset, live raid) stays below the shot list unchanged. The "0 axe violations" claim is either re-run and recorded in `docs/ACCESSIBILITY.md` or removed.
- The shot list says that audio is off by default and that the video must show the dry-run label whenever a graft is on screen.

## 3. A one-screen "How it works" with links into `.kiro/`

Findings: Round 2 discoverability table (Z-machine: fail, Kiro artefacts: fail).

User value: the Frankenstein judge wants to see the seams: a 1979 VM, the marker protocol, the failsafe, and the specs that drove it. It is the technical-credibility and Kiro-usage score in one page.

Effort: medium (one manual section or a new `how-it-works` page, linked from the landing).

Acceptance criteria:
- The landing link "Built with Kiro: specs, steering and hooks" points to a section, "How it works", reachable in one click from `/` and from the bench drawer. The section fits in about 400 words and one diagram in text (the plate or an ASCII flow: lockfile, OSV and CISA KEV, creature.json, Inform 6, Z-machine story, `[[CRYPT ...]]` marker, watcher, Necromancer, PR, CI, human merge, reraise).
- It states: why a Z-machine (one small file, runs anywhere, Infocom interpreters open the downloadable `.z8`); that only game-printed markers trigger anything, never typed text; the failsafe list (no merge call, SEAL, audit log, dry run by default); that a human merges.
- It links to `.kiro/specs/`, `.kiro/steering/`, `.kiro/hooks/` and `.kiro/agents/` (the folders) and to three named files: `.kiro/steering/failsafe.md`, `.kiro/specs/necromancer/requirements.md` and `.kiro/hooks/failsafe-guard-on-save.json`. A test or build step checks that each linked repository path exists.
- The manual and the page both say that the Pages site and the CLI share one creature file format, and which parts the page can do (rehearsal) and which only the CLI can do (real PR).
- `scripts/playtest/judge.mjs` records the click path from `/` and asserts at most 2 clicks to each of: Z-machine, failsafe, human merge, specs, steering, hooks, agents.

## 4. Tighten `docs/KIRO.md`

Findings: Round 2 Kiro story 5 to 6, draft note and dense table.

User value: judges score Kiro use. The evidence exists; it has to be quickest to find and plainly honest.

Effort: small to medium (editing, no new facts).

Acceptance criteria:
- The "Fill this in as you go" line is gone. The first 15 lines say, in plain words: spec-first (what and how many), steering that binds (and the test that enforces it), hooks (how many, what each caught), agents (`.kiro/agents/inquisitor.json`, `necromancer.json`), and one thing Kiro changed about how the work was done, with a link to the commit or run.
- A "Limits" paragraph states what is not shown: no hook has fired inside a Kiro session yet (only by hand), and which claims rest on tests rather than on a recorded session. This is moved, not removed.
- The specs table keeps one row per spec with a link, but each Outcome cell is at most 30 words. Long text moves under the table.
- Every `.kiro/` path named in the file exists (checked by a test or script), and the file is at most 220 lines or the extra lines are in an appendix section marked so.
- The page's "Built with Kiro" link and the README both point to this file or to item 3, not to different places.

## 5. Put the game prompt in reach, and make the 3D landing explain itself

Findings: Round 2 polish 6 (input 1500 px down on desktop), clarity 7 (3D shows no pitch), tutorial text does not advance after green.

User value: the one-click demo path is "type GRAFT JQUERY". If the prompt is below the plate, the demo is a scroll hunt, and a mobile visitor must scroll about 1900 px.

Effort: medium (layout and one tutorial rule).

Acceptance criteria:
- On `?theatre=off` at 1280x720 and 390x780, the `#cmd` input is inside the first viewport after the tutorial is dismissed, and while the tutorial is open its box is no taller than 25% of the viewport on desktop. A harness check records `#cmd` top and bottom for both viewports and for the tutorial open and closed.
- A one-line "Try: GRAFT JQUERY" chip next to the input (or a button that types it) works with the keyboard and announces the result in `#announcer`. It does not run a graft by itself; it only fills the box.
- The 3D default view shows the title and the pitch sentence as a small caption on the first frame, hidden by Recording mode, and not overlapping the board or buttons (checked by the existing board-layout test extended to the caption).
- After "Simulate CI: green" the tutorial moves to the next step, or a test explains why it does not. The tutorial text after green is covered by a harness assertion.
- Page weight stays under 5 MB; reduced motion and high contrast keep the caption and the chip.

## Not now

- Leaderboards or per-person scores. Against the product pillars.
- New ecosystems beyond npm and pip. Tier 1 scope.
- Real-GPU performance work and a Lighthouse score. Needs hardware or tooling this sandbox does not have. Re-check before the demo recording and state the result as measured or not verified.
- A voiced or music-driven trailer. Sound is off by default and unverified here.
- Anything that opens a live PR from the Pages site. The page is a rehearsal by design.
