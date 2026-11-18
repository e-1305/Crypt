# Playtest log

A loop between two roles. The judge plays the product cold and scores it. The product manager turns the findings into a backlog ([BACKLOG.md](BACKLOG.md)). The team ships the top items, then the judge plays again. Scores only go up when the product changes.

## Loop summary

Four judge rounds and three PM backlogs on `feat/h1-judge-loop`. Each round the judge played the built site and the CLI cold, scored the rubric below, and the PM turned the findings into [BACKLOG.md](BACKLOG.md). Scores moved only when the product changed.

| Criterion | R1 | R2 | R3 | R4 |
|---|---|---|---|---|
| First-minute clarity | 6 | 7 | 8 | 8 |
| Wow factor | 7 | 7 | 7 | 7 |
| Technical credibility | 6 | 7 | 8 | 9 |
| Kiro usage story | 5 | 6 | 7 | 7 |
| Polish | 5 | 6 | 7 | 8 |
| Accessibility | 7 | 7 | 7 | 7 |
| Safety story | 7 | 8 | 8 | 8 |
| **Mean** | **6.1** | **6.9** | **7.4** | **7.7** |
| Gain over previous round | | +0.8 | +0.5 | +0.3 |

### Plateau analysis

The gain fell from 0.8 to 0.5 to 0.3, which is the plateau line, so the loop stops here. The cheap, checkable fixes are spent: front door, how-it-works, prompt in reach, CLI next step, skip link, overlap. What is left cannot be produced in this sandbox:

- Wow factor has been 7 for three rounds. It needs motion (a GIF of "Simulate CI: green" and the SEAL rejection), not another still.
- Kiro usage story is capped at 7 while `docs/KIRO.md` says no hook has fired inside a Kiro session. Only a recorded run changes that.
- Accessibility is capped at 7 because axe-core was not run on the 3D page and no screen reader was used.

A different judge could score any of these one point either way. The 0.3 gain is within that noise, so read the trajectory as "clearly better than R1, not provably better than R3".

### What a human must still do before submission

1. Record the GIF (under 2 MB, with a text alternative) of "Simulate CI: green" and the SEAL rejection. Commit it to `docs/img/` and link it under the README screenshot.
2. Run one hook in a real Kiro session (for example `.kiro/hooks/failsafe-guard-on-save.json`), commit the captured log under `.kiro/`, and update the "Limits" paragraph in `docs/KIRO.md`.
3. After merge, open the live Pages site and check the landing page, the manual links, the `.kiro/` links on the default branch, and the 3D bench on a real GPU. Run Lighthouse and state the number.
4. Run axe-core on the 3D page and try the 2D page with one screen reader.
5. Re-run `scripts/playtest/judge.mjs` against the live URL (`BASE_URL`) as a last smoke test.

None of these was done by this loop. Everything above is marked "not recorded" or "not verified" in the text that makes the claim.

---

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


---

## Round 2

Build: `feat/h1-judge-loop` at the Round 1 fixes (`81af39e`), site rebuilt with `npm run build:site`, served by `npm run web`, driven by `scripts/playtest/judge.mjs` at 1280x720 and 390x780. I read the screenshots `01-landing-default.png`, `02-landing-2d.png` and the JSON report, then the README top section, `docs/KIRO.md`, `docs/DEMO.md` and `docs/DEVPOST.md` as a Devpost reader would. Same rubric, same persona: three minutes, never played interactive fiction, judging the Frankenstein track.

### Scores

| Criterion | R1 | R2 | Reason, including why a score did not move |
|---|---|---|---|
| First-minute clarity | 6 | 7 | The 2D page now opens on the title, a one-sentence pitch and a copyable `npx` line. Still 7: the default 3D view shows no title and no pitch (they are in the drawer), and the first-run tutorial box is a full-width block with empty space that pushes the plate down |
| Wow factor | 7 | 7 | Unchanged. The bench, the plate on the wall and "Simulate CI: green" are good, but nothing in the README or Devpost notes shows them. A reader who does not open the page never sees the wow |
| Technical credibility | 6 | 7 | One count vocabulary, the audit log says `DRYRUN_WRITTEN`. Not higher: the Z-machine, failsafe and human-merge story is spread across README, manual and KIRO.md, with no one-screen "how it works" |
| Kiro usage story | 5 | 6 | A "Built with Kiro" link is on the page. It lands on three bullets in the manual, and only two `.kiro/steering/` files are linked from there. Specs, hooks and agents have no link from the site. `docs/KIRO.md` still opens with "Fill this in as you go" and says no hook has fired inside a Kiro session. A judge scoring Kiro use sees a draft |
| Polish | 5 | 6 | Bench board and recording button are fixed (F2, F5 held). New: the 2D game input is about 1500 px down on desktop (about 1900 px on a 390 px phone), so a visitor must scroll past the plate to type. The 3D "Nights Without Possession" label is tiny |
| Accessibility | 7 | 7 | Tab order and announcer fixed, reduced motion still drops to the plain page. Not higher: axe-core was not run, and no screen reader was used |
| Safety story | 7 | 8 | The visible SEALED badge, the rejection text and the honest audit outcome make the claim demonstrable in 20 seconds. Not 9: the live-mode path is not exercised in this harness |

Mean 6.9 (Round 1: 6.1).

### What I saw

- 2D page, first viewport: "CRYPT", "The first vulnerability report you can play", "Each vulnerable dependency is a limb on a creature, and you heal it by typing GRAFT, which writes a fix pull request for a human to review and land." Then `npx @e-1305/crypt raid <path-or-github-url>` with a Copy button, then "Built with Kiro: specs, steering and hooks". A cold reader can say what it does. Good.
- Same viewport: the tutorial ("GETTING STARTED, STEP 1 OF 7") takes the lower half, with a gap between the sentence and the buttons. The game prompt, which is the thing the pitch tells me to use, is not on screen.
- 3D default: no title, no pitch. The only text that explains the scene is the plate. "Recording mode" sits top left with no hint. The raid board still has a 15:00 timer and "Nights Without Possession" in very small type.
- Sealing works: `SEALED: no graft will run. Unseal` appears, the refusal reads "The crypt is sealed. The graft is rejected and no payload is made." Unseal clears it.
- "Simulate CI: green": `SIMULATED: jquery healed` in the event log, the announcer reads "SIMULATED CI. Healed: jquery." The tutorial text after green still reads "Look at the creature in Plate I", so step progress did not move in this scenario (the tutorial is probably waiting for a different step; I did not trace it).
- Page weight: 3D path 969,356 bytes in 41 requests, 2D path 251,324 bytes in 33. Under the budget. No console errors on the 2D page. The 3D page logs four "GPU stall due to ReadPixels" warnings from software GL.

### How-it-works discoverability (2 clicks from the landing)

| Question | Click path | Result |
|---|---|---|
| What is the Z-machine part? | Landing, "How to play (manual)" | The manual mentions Z-machine interpreters only in the download line. No explanation of why a 1979 VM, how the page reads game output, or that the `[[CRYPT ...]]` markers are the only trigger. Fail |
| What is the failsafe? | Landing, "Built with Kiro", then the manual's safety list | Present: no merge capability, SEAL, audit log. Reachable in 2 clicks. Pass, but buried under "Built with Kiro" and "Awaiting human merge" |
| Human merge guarantee | Same | Pass, same list |
| Kiro specs, steering, hooks, agents with links to `.kiro/` | Landing, "Built with Kiro" | Three bullets. Links only to two steering files and `KIRO.md`. No link to `.kiro/specs/`, `.kiro/hooks/` or `.kiro/agents/`. Fail |
| One-click demo | Landing, type `GRAFT JQUERY` | Works with no install, but the input is below the fold, so it is one scroll plus one click, not one click. The README has no GIF or screenshot, so a reader of the README sees no product at all before step 3 |

### Devpost reader's pass

- README top: strong tagline and the Z-machine claim. No image, no GIF. The first code block is an install command, the "Live demo" link is far down the page (after Quickstart and exit codes). A Devpost reader who clicks through to GitHub has to scroll about 60 lines to find the link they came for.
- `docs/KIRO.md` (316 lines): the content is real (nine specs, five steering files, five hooks with captured runs), which is the best Kiro evidence in the repo. It starts with a draft note, the specs table is dense, and the judge-relevant claim ("what Kiro changed about how this was built") is not stated up front. The line "None of these has fired inside a Kiro session yet" is honest and should stay, but moved to a "Limits" line so it does not read as the headline.
- `docs/DEMO.md` (212 lines): starts with token setup. It is a runbook, not a shot list. There is no timed list of shots for a 3 minute video.
- `docs/DEVPOST.md` (6 lines): a link list. No story, no "what it does / how we built it / what we learned", no pitch paragraph.

### What I did not verify

- Real GPU rendering and frame rate, audio, Lighthouse, axe-core, screen readers, Safari and Firefox.
- The live GitHub Pages site (all checks on the local build), and whether `.kiro/` links resolve on the default branch after merge.
- Live mode (`--live`), real pull requests, the Inquisitor on real CI.
- The 3D tutorial overlay (still not visible in the 3D screenshot; I did not check if that is intended).
- Why the tutorial text does not advance after "Simulate CI: green". I saw the text only.

## Round 2 after-fix check

Run with `scripts/playtest/judge.mjs` against `npm run web` (headless Chromium, software WebGL). Each row is a recorded `checks` value in the harness report, not an impression.

| Item | Check | Result |
|---|---|---|
| 1 Devpost front door | `docs/PITCH.md` word count, README order, no em dash, image under 300 KB | Pass in `tests/devpost-docs.test.ts` (PITCH is 204 words, `docs/img/bench-3d.png` is 238 KB) |
| 2 Shot list | Seven beats in order above the runbook, audio and dry-run notes | Pass in `tests/devpost-docs.test.ts`. The by-hand hook run is labelled as such |
| 3 How it works | Clicks from `/` to Z-machine, failsafe, human merge, specs, steering, hooks, agents | 1 click for the first three, 2 for the four folders. The bench drawer link needs 2 (toggle, link). Section is 357 words |
| 4 KIRO.md | Draft note gone, Limits section, 30 word Outcome cells, appendix marker, every `.kiro/` path exists | Pass in `tests/devpost-docs.test.ts`. The summary part is 57 lines |
| 5a Prompt in reach | `#cmd` top and bottom, tutorial open and closed | 1280x720: tutorial open top 715 bottom 740 (inside), closed top 564 bottom 589, tutorial box 147 px of 720 (20 percent). 390x780: closed top 702 bottom 727 (inside), open top 841 bottom 865 (below the fold while the tutorial is open, as the item allows) |
| 5b Try chip | Keyboard Enter fills the box, announces, does not run | Pass: box reads `GRAFT JQUERY`, `#announcer` says "Command box filled with GRAFT JQUERY. Press Enter to run it.", event log and payload unchanged |
| 5c 3D caption | Visible on the 3D first frame, no overlap with any visible control, hidden by Recording mode | Pass. The first placement (top) covered the raid timer on the wall board and the manual link, so it moved to the bottom centre. Checked with bounding boxes for DOM controls and by looking at the screenshot for the wall board |
| 5d Tutorial after green | Strip text after GRAFT and "Simulate CI: green" | Moves to "step 6 of 7" ("Type SEAL CRYPT"). Cause of the old behaviour: the strip waited on step 1 ("Got it") and ignored a later event. Event signals now finish the steps before them. Typed verbs still finish only the step the strip waits for |
| axe-core | `/?theatre=off`, axe 4.x | 0 violations, 43 rules passed after two fixes (Try chip name, daily banner landmark). See `docs/ACCESSIBILITY.md` |
| Page weight | Bytes loaded | 2D page 254 KB. 3D page 1.9 MB (limit 5 MB). `_site/` is 3.0 MB |

Found and fixed during this check: the Try chip made the page wider than a 390 px phone (the browser zoomed out to 529 px). The input row now wraps.

Still not verified: real GPU rendering and frame rate, audio, Lighthouse, screen readers, Safari and Firefox, the live Pages site, `--live` mode. The 3D page was not run through axe-core. The four WebGL "GPU stall due to ReadPixels" warnings on the 3D landing come from software rendering.

## Round 3

Build: `feat/h1-judge-loop` at `d8e7a9a`, `npm run build:site`, `npm run web`, `scripts/playtest/judge.mjs` (all 15 scenarios ran with no failure; every `checks` value true). Besides the harness I ran the CLI first run by hand, read the README top, `docs/PITCH.md`, `docs/KIRO.md` and the manual's "How it works", and read screenshots `01-landing-default.png` and `02-landing-2d.png`. Same rubric and persona, scored hard.

### Scores

| Criterion | R1 | R2 | R3 | Reason, including why a score did not move |
|---|---|---|---|---|
| First-minute clarity | 6 | 7 | 8 | 3D now carries the pitch sentence as a caption, the 2D page has the `npx` line, a Try chip and the prompt in the first viewport. Not 9: the CLI first run stops without saying what to type |
| Wow factor | 7 | 7 | 7 | The README now shows the bench, but only as a still. No motion, so the "Simulate CI: green" moment is described, not seen. Unchanged because nothing new happens on screen |
| Technical credibility | 6 | 7 | 8 | The "How it works" section answers Z-machine, markers, failsafe and human merge in one click. Not 9: `crypt play` after `raid` answers `NO_FIX_AVAILABLE` for the limb the README tells me to graft, and the owner is `@x` on the plate and `(at)x` in the story |
| Kiro usage story | 5 | 6 | 7 | The draft note is gone, the specs, steering, hooks and agents are one or two clicks away, and "Limits" states that no hook has fired inside a Kiro session. Not higher for exactly that reason |
| Polish | 5 | 6 | 7 | Prompt in reach, no overlap on the bench board, no console errors on 2D. Still: on 3D the manual button covers the plate title, the "Nights Without Possession" line is tiny, and four software-GL warnings appear |
| Accessibility | 7 | 7 | 7 | axe 0 violations on 2D, reduced motion and high contrast work. Not higher: the skip link is the second to last Tab stop (it should be first), the 3D page was not run through axe, no screen reader was used |
| Safety story | 7 | 8 | 8 | Unchanged and still strong: SEALED badge, refusal text, audit log. A stale `.crypt-seal` also sealed my first raid. The output says so, so it is honest, but it is a surprise |

Mean 7.4 (Round 2: 6.9, Round 1: 6.1). Gain 0.5, above the 0.3 plateau line, so another round is justified.

### What I saw

- CLI first run: `crypt raid fixtures/vulnerable-npm --offline` printed counts, the ranked list, the plate and the first story screen in a few seconds, exit 0. Wrong inputs fail plainly: no command, no target and an unreadable directory each print one line. Good.
- The first raid in this checkout printed "The crypt is sealed. Run 'crypt unseal' to lift it." because an old `.crypt-seal` was in the directory (git-ignored, left by an earlier run). I removed it and the next raid ran unsealed.
- `echo "GRAFT JQUERY" | crypt raid fixtures/vulnerable-npm --offline` wrote `out/prs/crypt-graft-jquery-3.5.0.json`. `echo "GRAFT JQUERY" | crypt play` gave `NO_FIX_AVAILABLE`. With `--advisories data/advisories` it gave `ERROR`. With `--advisories fixtures/vulnerable-npm/advisories --target fixtures/vulnerable-npm` it wrote the payload. A second command after `raid` does not work without two flags the README does not mention in that place.
- `raid` ends after the opening room and prints no "what to type" line.
- Keyboard-only: Enter on the Try chip route reaches `#cmd`, `LOOK` works. The skip link is near the end of the Tab order.
- 3D screenshot: the caption sits bottom centre, the plate, CRT and buttons do not overlap each other. "How to play (manual)" overlaps the title of Plate I, and the Recording mode label is dim.
- Page weight: 2D 254 KB (33 requests), 3D page within the 5 MB budget per the harness.

### What I did not verify

- Real GPU, frame rate, audio, Lighthouse, screen readers, Safari, Firefox.
- The live Pages site and `--live` mode, real pull requests, the Inquisitor on real CI.
- That `.kiro/` links resolve on the default branch after merge.
- axe-core on the 3D page.
- Any hook running inside a Kiro session (the repo says none has).

## Round 3 PM note

Four items in [BACKLOG.md](BACKLOG.md), ordered by value over effort: the 3D first-10-seconds polish (small), the CLI "next step" and `play` context (medium, the biggest credibility win for a geek who runs the README command), the `(at)` explanation (small), and the GIF plus one real Kiro hook run (small for a person, not possible here). Items 1 to 3 can be built in the sandbox. Item 4 stays marked "not recorded" until a person does it.

## Round 3 after-fix check

Build: `feat/h1-judge-loop` plus the Round 3 changes. Harness run with `npm run web`, all scenarios ran with every `checks` value true, including the new `first-tab-and-overlap`.

| Item | Check | Result |
|---|---|---|
| 1 | First Tab stop on `/` and `/?theatre=off` | "Skip to the game input" on both. The 3D stage and the 2D page no longer focus the prompt at load, and typing on the bare page still reaches it |
| 1 | Manual button vs plate title at 1280x720 | Button moved to the top row beside Recording mode, clear of "PLATE I: THE CREATURE" (screenshot `04b-3d-first-seconds.png` read by eye) |
| 1 | "Nights Without Possession" size | Drawn full width at 28 px on the board canvas, about 12 px on screen at 1280x720. The DOM text keeps the "counted from this browser's first visit" note |
| 2 | `crypt raid` Next line | Interactive: printed after the plate. Piped: printed on stderr after the session. Names the top limb (`GRAFT JQUERY` on the fixture) |
| 2 | `crypt play` after `raid` | Reads `out/raid-context.json` (target, advisory source, first limb). Flags still win. A raid of a temporary clone says to pass `--target` |
| 2 | Failure reasons | `NO_FIX_AVAILABLE` and `ERROR` each print a one-line reason |
| 2 | Stale `.crypt-seal` | First output line: "The crypt is sealed (found .crypt-seal). Run 'crypt unseal' to lift it." No file under `out/prs/` (pinned in `tests/cli-next-step.test.ts`) |
| 3 | `(at)` | Sanitiser kept. Explained in the manual's "How it works" and in `docs/KIRO.md` |

Not verified: real GPU, screen readers, axe-core on the 3D page. Item 4 (GIF, a real Kiro hook run) stays not recorded.

## Round 4

Build: `feat/h1-judge-loop` at `0e32afd` (Round 3 fixes), `npm run build:site`, `npm run web`, `scripts/playtest/judge.mjs` (17 scenario entries; every `checks` value true, apart from one "not required on mobile" note that is not a failure). I read screenshots `04b-3d-first-seconds.png` and `01-landing-default.png`, and ran the CLI by hand. Same rubric and persona, scored hard.

### Scores

| Criterion | R3 | R4 | Reason |
|---|---|---|---|
| First-minute clarity | 8 | 8 | Caption, pitch and prompt are in the first view. Not 9: a visitor who has never seen interactive fiction still has to guess what the `>` prompt wants beyond the caption |
| Wow factor | 7 | 7 | Same bench, still no motion in the README. Nothing new on screen |
| Technical credibility | 8 | 9 | `raid` ends with "Next: type GRAFT JQUERY at the prompt". `echo "GRAFT JQUERY" | crypt play` in the same directory wrote `out/prs/crypt-graft-jquery-3.5.0.json` with no flags. The failure I reported in R3 is gone. Not 10: I did not rerun the full vitest suite, and `--live` is untested here |
| Kiro usage story | 7 | 7 | Unchanged, and capped by "no hook has fired inside a Kiro session" |
| Polish | 7 | 8 | Screenshot shows the skip link (x 0 to 188) and the manual button (x 208 to 393) side by side with a gap of about 20 px, and the manual button clear of "PLATE I: THE CREATURE". The harness `manualClearOfPlateTitle` is true. Four software-GL console warnings remain on 3D |
| Accessibility | 7 | 7 | First Tab stop is "Skip to the game input" on both pages, which fixes the R3 finding. Not higher: axe-core not run on 3D, no screen reader |
| Safety story | 8 | 8 | Unchanged. `crypt unseal` exists, prints "The seal is lifted." and removes `.crypt-seal` (checked by hand) |

Mean 7.7 (R3: 7.4). Gain 0.3, at the plateau line. Loop stops.

### Re-checks the PM asked for

- Skip link vs manual button at 1280x720: no overlap in the screenshot. This was noted as not re-screenshotted in the Round 3 check, and is now seen.
- `crypt unseal`: listed in `--help`, run by hand, works.
- Round 3 item 4 (GIF and a real Kiro hook run): still not recorded.

### What I did not verify

- Real GPU, frame rate, audio, Lighthouse, screen readers, Safari, Firefox.
- The live Pages site, `--live` mode, real pull requests.
- That `.kiro/` links resolve on the default branch after merge.
- axe-core on the 3D page.
- Any hook inside a Kiro session.
- The full test suite and CI in this round (only `tests/devpost-docs.test.ts` is run for this change).
- This is one judge reading the repo they helped build. Treat the scores as a checklist result, not an independent review.

