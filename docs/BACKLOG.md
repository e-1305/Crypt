# Backlog

Written by the product manager role from [PLAYTEST_LOG.md](PLAYTEST_LOG.md). Items are ordered by value divided by effort. Each cites the finding it comes from. Round 1 backlog.

Constraints that apply to every item: no merge call, SEAL CRYPT blocks grafts, one team score and no leaderboard, no em dashes in user-facing copy, page weight at most 5 MB, sound off by default, the 2D page and reduced motion keep every feature.

## 1. Show the pitch and one command above the fold on every view

Findings: F1, F13, F14, F2.

User value: a developer who lands on the page knows in 10 seconds what CRYPT does, can copy one command that works, and sees that Kiro built it. Today the 2D page opens on game text with the title scrolled away.

Effort: small (HTML, CSS, one `scrollTo`).

Acceptance criteria:
- On `/?theatre=off` at 1280x720 and 390x780, the `h1`, the subtitle and a one-sentence pitch are inside the first viewport on load. The `#cmd` input still receives focus without scrolling the page (use `focus({ preventScroll: true })`).
- A copyable line `npx @e-1305/crypt raid <path-or-github-url>` with a Copy button is visible on the 2D page and in the Bench drawer on the 3D page.
- One line states "Built with Kiro" and links to `docs/KIRO.md`.
- The "Recording mode" button no longer overlaps any heading at 1280x720 or 390x780, and has an accessible name that says what it does.
- `scripts/playtest/judge.mjs` shows the heading's bounding box inside the viewport.

## 2. Make the counts agree, and name them once

Findings: F3, F4.

User value: a sceptical reader sees one set of numbers and a short legend, so the credibility of every other claim goes up.

Effort: small (copy plus plate and game text).

Acceptance criteria:
- Plate footer, game intro, CLI summary and plate summary use the same two terms: "dependencies" (all) and "limbs that spawn" (those above the noise line). The wording is fixed in one place and checked by a test that renders the demo creature and compares the numbers.
- The words "exorcised" and "spawn line" are explained in one sentence next to the plate or in the tutorial step 1.
- The raid panel says what the health number measures ("Creature health: falls with every unhealed limb, weighted by risk") in one line, or hides it until the raid starts.
- The same text works in the 2D page and the 3D board, and no number disagrees with the CLI for `fixtures/vulnerable-npm`.

## 3. Fix the audit log wording for dry runs

Findings: F7.

User value: the safety pillar rests on `crypt-audit.log`. A log that says `PR_OPENED` when nothing was opened will be read as a lie by the first auditor.

Effort: small (one outcome name and its tests).

Acceptance criteria:
- A dry-run graft logs `DRYRUN_WRITTEN` (or similar) and never `PR_OPENED`. `PR_OPENED` appears only when a real pull request URL exists, and the last column holds that URL.
- `scripts/check-necromancer.ts` and its expected sequence are updated: `REQUEST_WRITTEN,DRYRUN_WRITTEN,SEALED,REJECTED_SEALED,REJECTED_SEALED`.
- A property test says: for any run without `--live`, no audit line contains `PR_OPENED`.
- `docs/DEMO.md` and the README mention the new outcome name where the old one appears.

## 4. Make the heal visible, and let a visitor try SEAL

Findings: F6, F15.

User value: the two ideas that set CRYPT apart (a limb heals only when CI is green, and the seal stops everything) happen on screen in under 30 seconds with no reading.

Effort: medium (UI state, event log, tutorial steps).

Acceptance criteria:
- After "Simulate CI: green", within 3 seconds the plate marks the limb HEALED, the event log shows a line "SIMULATED: jquery healed" and `#announcer` reads it. After "Simulate CI: red" the limb stays ROTTING and the log says so.
- Tutorial gets two steps after GRAFT: "Run Simulate CI: green" and "Type SEAL CRYPT, then GRAFT LODASH. The graft is rejected." Each step completes when the matching event is detected.
- The sealed state shows a visible badge "SEALED: no graft will run" on the 2D page and on the bench, cleared by a visible "Unseal" action (page only, no effect outside it).
- All of it works with `?theatre=off` and with reduced motion. The dry-run label stays on screen.

## 5. Fix keyboard order and the clipped bench board

Findings: F5, F8, F11.

User value: keyboard and screen reader users reach the controls in a sensible order, and the 3D wow moment has no clipped text.

Effort: small to medium.

Acceptance criteria:
- With focus in `#cmd`, Shift+Tab reaches "Got it", "Skip", "Hide for good", the manual link and the high-contrast toggle in a documented order, and the skip link text says where it goes. `scripts/playtest/judge.mjs` lists the tab stops and a test asserts the tutorial controls are reachable by Tab from the page start.
- The high-contrast toggle announces "High-contrast reader mode on" and "off" in `#announcer`.
- On the bench, the raid board shows "Nights Without Possession" and the health bar without overlap or clipping at 1280x720 and 1920x1080. A screenshot check compares the board region to a stored golden or measures that no text node bounding box intersects another.
- No axe-core violation is introduced (run axe on `?theatre=off` and record the result in `docs/ACCESSIBILITY.md`).

## Not now

- Leaderboards or per-person scores. Against the product pillars.
- New ecosystems beyond npm and pip. Tier 1 scope.
- Real-GPU performance work. Needs hardware this sandbox does not have; re-check before the demo recording.
