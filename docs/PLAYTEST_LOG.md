# Playtest log

A loop between two roles. The judge plays the product cold and scores it. The product manager turns the findings into a backlog ([BACKLOG.md](BACKLOG.md)). The team ships the top items, then the judge plays again. Scores only go up when the product changes.

## Rubric

Each criterion is scored 1 to 10. 5 means "works, would not remember it". 8 means "I would show this to a colleague". 10 is not given.

| Criterion | What a 8 looks like |
|---|---|
| First-minute clarity | A new visitor can say what the product does and what to type within 60 seconds, without the manual |
| Wow factor | One moment that makes the judge say "oh, nice" without being asked |
| Technical credibility | Claims can be checked: numbers agree, the CLI does what the page says, logs are honest |
| Kiro usage story | The judge can see where Kiro was used (specs, steering, hooks, agents) from the repo and the page, in under a minute |
| Polish | No overlap, clipping, dead controls or contradictory numbers in the default view |
| Accessibility | Keyboard-only play, reduced motion, high contrast and the 2D fallback keep every feature |
| Safety story | The "agents can never make things worse" claim is demonstrable in the product, not only in prose |

## Judge persona

A senior engineer who reviews hackathon entries between meetings. Sceptical. Has three minutes per entry. Has never played interactive fiction and does not know that `GRAFT` is a verb. Reads the landing page first, the README second, the repo third. Will run one command if it is in the README. Judges by what is on the screen and in the terminal, not by what the docs say it should do. Does not trust a number that disagrees with another number on the same page.

Method for the scored rounds: `scripts/playtest/judge.mjs` drives the built site in headless Chromium and records text, focus order, request sizes, console messages and screenshots in `out/playtest/` (not committed). The judge then reads the screenshots and plays the CLI by hand.

Run it:

```bash
npm run setup && PORT=8099 npm run web          # serve the built site
PLAYWRIGHT_CORE=/path/to/node_modules/playwright-core node scripts/playtest/judge.mjs
```

---

## Round 1

Build: `feat/h1-judge-loop` from main `e04deb8`. Site served locally by `npm run web`. Viewport 1280x720 unless stated.

### Scores

| Criterion | Score | One-line reason |
|---|---|---|
| First-minute clarity | 6 | Subtitle is good. The 2D page opens scrolled past it. Three different counts of limbs |
| Wow factor | 7 | The 3D bench with the plate on the wall and the CRT is a real "oh". It is not in the default 2D page or the README |
| Technical credibility | 6 | Real Z-machine, real offline CLI, 577 tests pass. Audit log says `PR_OPENED` for a dry run |
| Kiro usage story | 5 | Present in docs, absent on the page. Not visible in the first minute |
| Polish | 5 | Clipped and overlapping text on the bench raid board. Recording-mode button covers the heading |
| Accessibility | 7 | Reduced motion drops to the 2D page, visible focus rings, skip link, live regions. Tab order and scroll position need work |
| Safety story | 7 | SEAL works and is logged in the CLI. On the page the seal is not shown and "dry run" is clear |

Mean 6.1. No score is higher than the evidence I saw.

### What I did, in order

1. Loaded `/` (3D bench). Pitch text visible at 504 ms after navigation. WebGL2 was available (software GL). One canvas, `body.theatre`.
2. Loaded `/?theatre=off`. Typed `examine`, then `graft jquery`.
3. Tabbed through the 2D page from load.
4. Loaded `/` with `prefers-reduced-motion: reduce`.
5. Toggled "High-contrast reader mode".
6. Loaded the 2D page at 390x780 (mobile).
7. Grafted, clicked "Simulate CI: green", clicked "Start the 15 minute raid".
8. In a shell: `crypt raid fixtures/vulnerable-npm --offline`, then `graft jquery`, `seal crypt`, `graft lodash`.

### Findings

Quotes are copied from the page or terminal.

**F1. The 2D page opens scrolled past the title and the pitch (clarity, polish).** On `?theatre=off` the first screenshot starts at "Playing: Cinder-16 (the demo creature)." The `CRYPT` heading and "The first vulnerability report you can play" are above the fold. The `#cmd` input has `autofocus`, and the browser scrolls to it. The only thing a cold visitor sees first is game text: "Crypt: 5 findings, 3 exorcised, 2 spawned." Nothing says what a limb is or why they should type.

**F2. The faint "Recording mode" button sits on top of page content (polish).** In the 2D screenshot it overlays the heading "THE CRYPT" at the top left. In the 3D view it is the first thing in the top left corner, with no explanation. A judge will read it as a bug or a hidden mode.

**F3. Three different numbers for the creature (credibility, clarity).** The plate says "LIMBS 7 POSSESSED 1 ROTTING 4 HEALED 0 HEALTHY 2". The game says "A creature of 2 limbs." and "5 findings, 3 exorcised, 2 spawned." The CLI prints "7 limbs, 5 findings, 3 exorcised, 2 spawned". The explanation exists ("3 lesser findings rest below the spawn line"), but the words "limbs" and "findings" and "spawned" are used for different counts. A sceptical reader sees a contradiction. The vocabulary "exorcised" for "filtered out as noise" is also not self-explanatory.

**F4. Creature health starts at 29 of 100 and heartbeat at 128 before the raid starts (clarity).** Raid panel before any action: "Creature health 29 of 100. Heartbeat 128 beats per minute." It is correct for a creature with a possessed limb, but nothing on the page says what the health number measures. In the earlier markup it reads 100 by default, so the page changes the number after load without comment.

**F5. The raid board on the 3D wall clips and overlaps (polish).** In `01-landing-default.png` the line "Nights Without Possession (counted from this brow..." runs under the health bar and is cut off at the board edge. "Health 29" overlaps the same line. This is the headline UI of the wow moment.

**F6. Simulated CI green gives no visible outcome within 2.5 s (clarity, safety).** After GRAFT JQUERY and "Simulate CI: green", the label reads "SIMULATED CI: replaying a dry-run payload. No token, no network. Nothing real changes." The raid panel still reads "Team risk removed: 0.00", "Trophies 0 of 6", "Boss: jquery.". A judge who does not wait does not see the limb heal. The 2D page has no obvious "healed" event next to the button.

**F7. The audit log says `PR_OPENED` for a dry run (credibility, safety).** CLI, offline, after `graft jquery`:

```
GRAFT JQUERY  JQUERY  REQUEST_WRITTEN  -
GRAFT JQUERY  JQUERY  PR_OPENED        -
SEAL CRYPT    -       SEALED           -
GRAFT LODASH  LODASH  REJECTED_SEALED  -
```

No PR was opened: the console says "dry-run payload written to out/prs/crypt-graft-jquery-3.5.0.json". An auditor reading the log would be misled. The safety pillar depends on this log.

**F8. Keyboard: first Tab from the game input skips the controls above it (accessibility).** `#cmd` has autofocus, so the first Tab goes to `pre#payload`, then the gallery. The tutorial buttons ("Got it", "Skip", "Hide for good"), the manual link and the high-contrast toggle are before the input in the DOM, so a keyboard user reaches them only with Shift+Tab. After `Enter` focus stays in `#cmd` (good). Focus rings are `solid 2px` on every stop I tested (good).

**F9. Page weight is fine (credibility).** 3D page: 40 requests, 961,702 bytes (three.module.min.js 687 KB, demo.z8 88 KB, zvm.min.js 42 KB). 2D page: 32 requests, 244,827 bytes. `_site` is 3.0 MB on disk including the 20 gallery creatures. Under the 5 MB budget.

**F10. Reduced motion works (accessibility).** With `reduced-motion: reduce`: 0 canvases, `#cmd` visible, 0 running CSS animations, tutorial visible. The 2D page keeps the raid, simulated CI and gallery.

**F11. High-contrast toggle has no announced confirmation (accessibility).** After clicking, `aria-pressed="true"` but `#announcer` was empty after 500 ms. The help text says "game events announced", which applies to game events, not to the toggle, so this is minor.

**F12. Mobile layout holds (accessibility).** 390 px wide: no horizontal overflow. The input is at y=369 to 412 of 780, in view.

**F13. The CLI is the strongest first impression for a developer (wow, credibility).** `crypt raid fixtures/vulnerable-npm --offline` finished in about 1.1 s, printed a ranked list (#1 Possessed jquery, #2 Rotting lodash), an ASCII plate and a playable prompt. `graft jquery` wrote a payload. After `seal crypt`, `graft lodash` was rejected and logged. This is the "oh" moment, and the landing page does not show it. The page has no copy-paste `npx` line above the fold.

**F14. Kiro story is in the docs, not on the page (Kiro).** The page text I read contains no mention of Kiro, specs, steering or hooks. The README mentions Kiro once in the intro paragraph. A judge who only opens the live site cannot tell how Kiro was used.

**F15. Safety story is told, not shown, on the page (safety).** "Grafts here are rehearsals... Nothing leaves this page." is clear. There is no way on the page to try `SEAL CRYPT` and see the rejection, other than knowing to type it. The tutorial text at step 1 covers only "look at the plate".

### What I did not verify

- Real GPU rendering, frame rate, and the 3D scene on any browser except headless Chromium with software GL. Console shows "GPU stall due to ReadPixels" warnings from software GL only.
- Audio. The sandbox has none; sound is off by default and I did not turn it on.
- Lighthouse and axe-core. Neither was run in this round. The 0 axe violations claim in `docs/DEMO.md` is not re-checked here.
- The tutorial overlay on the 3D bench. The text is in the DOM (`GETTING STARTED, STEP 1 OF 5`) but it is not visible in the 3D screenshot. I cannot say if that is intended.
- The live GitHub Pages site. All page checks were on the local build.
- Live mode (`--live`), real pull requests, and the Inquisitor on real CI.
- Safari and Firefox.
- Screen reader output. I read ARIA attributes only.

---

## Round 1 after-fix check

Same harness (`scripts/playtest/judge.mjs`, now with scenarios for above the fold, SEAL and the bench board), local build, 1280x720 and 390x780. This is a re-check of the findings, not a new scored round.

| Finding | What the harness now shows |
|---|---|
| F1 pitch above the fold | `scrollY` is 0 on load. At 1280x720 the `h1` (top 45), subtitle, pitch, install command and "Built with Kiro" link all sit inside the viewport. At 390x780 they do too (Kiro link bottom at 304). `#cmd` is focused with no scroll |
| F2 recording button | `recordOverlapsHeading` is false on the 2D page. Its accessible name is "Recording mode: hide the page controls for screen capture" |
| F3 counts | Plate footer: "DEPENDENCIES 7 ... " and "LIMBS THAT SPAWN 2 OF 5 FINDINGS, 3 BELOW THE NOISE LINE". Game intro: "7 dependencies, 5 findings, 2 limbs spawn, 3 below the noise line." Same numbers on the 3D wall plate |
| F4 health | The raid panel carries "Creature health falls with every unhealed limb, weighted by risk." |
| F5 bench board | Screenshot `10-bench-board.png`: no overlap. "Nights Without Possession" is squeezed to fit its column, so it is small. `tests/raid-board-layout.test.ts` checks that no text boxes intersect |
| F6 heal | After graft and "Simulate CI: green", the plate summary reads "jquery 3.4.1: Healed", the event log shows "SIMULATED: jquery healed" and `#announcer` reads "SIMULATED CI. Healed: jquery." |
| F7 audit | CLI audit log reads `REQUEST_WRITTEN`, `DRYRUN_WRITTEN`, `SEALED`, `REJECTED_SEALED` |
| F8 keyboard | Shift+Tab from `#cmd` walks: Download, plate, Hide for good, Skip, Got it, high-contrast, manual, Kiro link, Copy command, Recording mode, Sound, skip link. Every stop has a 2px outline |
| F11 contrast | `#announcer` reads "High-contrast reader mode on" |
| F14 Kiro | "Built with Kiro" link on the page and in the bench drawer, pointing to a manual section |
| F15 SEAL | Typing `seal crypt` then `graft jquery` shows the badge "SEALED: no graft will run." and a rejection line. "Unseal" hides the badge |

Page weight: 3D path 969,340 bytes, 2D path 251,308 bytes. Console errors: none on the 2D page.

Still not verified: real GPU, audio, Lighthouse, axe-core (not re-run), screen readers, Safari and Firefox, the live Pages site. On the 2D page the game input is still below the plate, about 1500 px down. The tutorial step "Simulate CI: green" and the seal step were checked in the test suite, not by the harness.

