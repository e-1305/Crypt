# Review round 1: grades and fixes

Written 2026-11-18. Method and sources: [personas.md](personas.md). Outsider view only. The grades are the reviewer's judgment, not measurements. A 10 means a judge would put CRYPT in first place. Nobody here would, yet.

## Persona grades

| Persona | Grade /10 | The one sentence they would say | Single biggest blocker |
|---|---|---|---|
| 1. Kiroween judge | 6 | "Great concept and honest write-up, but I cannot see the video, a hook that fired, or an install that works." | Evidence gap: Devpost video is "TODO", 0 hook runs in a Kiro session, unpublished package |
| 2. CISO at a large bank | 5 | "The control model is the right one, but I have nothing to hand the board and nothing to put through vendor review." | No exportable, board-ready output; audit log is a local file |
| 3. SOC L1 analyst | 4 | "Fun, but dependency findings are not what I triage and I cannot feed it a queue." | No alert or ticket output; not a SOC workflow |
| 4. VOC lead | 5 | "The KEV and EPSS order and the 48-hour rule are what I want, but I cannot see them on the page or export them." | SLA and ranking are not on the first screen and there is no report export |
| 5. Open-source maintainer | 5 | "Paste-a-repo is nice and fewer PRs is the right idea, but I cannot install the real thing." | `@e-1305/crypt` is not published |
| 6. AppSec engineer | 5 | "Deterministic ranking is right, but show me what you hid and what lockfile-only cannot tell me." | The 95.2% "noise" is not inspectable on the landing flow; no reachability |
| 7. Engineering manager | 4 | "My team will not adopt a toolchain build and there is no Slack, Teams or Action." | No workflow integration and unpublished install |
| 8. Game designer and Devpost voter | 6 | "Good hook and look, short loop, and I cannot share it in one click." | No video or GIF, no one-click share |
| 9. VC or acquirer | 3 | "Nice craft. Who pays, and what stops a copy?" | No buyer, no sourced problem size, public data and a simple rule |
| 10. Recruiter, non-technical | 6 | "I get 'a game that fixes security bugs', but I cannot repost it without a clip." | The pitch sentence uses four unexplained terms; no 30-second clip |

**Overall grade: 4.9 / 10** (mean of the ten grades: 6+5+4+5+5+5+4+6+3+6 = 49).

The mean is low on purpose. Four personas (SOC, EM, VC, CISO as a buyer) are outside the product's proven scope in `.kiro/steering/product.md`. The three most useful audiences for the next two weeks are the judge, the voter and the VOC lead, and the fixes below favor them.

## Official Kiroween criteria

| Criterion | Grade /10 | Why |
|---|---|---|
| Potential Value | 5 | Real problem and a clear, safe wedge (paste a repo, ranked limbs, dry-run PRs). Unpublished package, lockfile-only npm scope, no integration and no buyer lower it. |
| Implementation of Kiro | 6 | Strong, checkable artifacts: 30 specs with commit trails, 6 steering files that show up in code and tests, 2 agents, an MCP server (all per `docs/KIRO.md`). Capped because 0 hook runs were seen in a Kiro session, steering auto-load is unobserved, and the 7.7 self-score in `docs/PLAYTEST_LOG.md` came from the authors' own personas. |
| Quality and Design | 7 | Distinct art direction, a 2D fallback, accessibility notes, property tests in CI. Capped: the 3D bench, sound and Lighthouse are "not verified" by the project's own text, and live pages (`graveyard/`) 404 while the docs list them. |
| Frankenstein category fit | 8 | The best-fitting part: a 1979 VM drives 2026 agents, four data sources are stitched into one creature, and the theme runs through naming and story. |

Mean of the four criteria: 6.5. It is higher than the persona mean because the judge criteria reward the build, while the other personas judge adoption.

## Top 10 fixes

Ranking = estimated grade gain across personas divided by effort. Gain is the reviewer's estimate in grade points summed over the personas listed (an opinion, not a measurement). Effort: 1 = under 2 hours, 2 = half a day. Fixes marked "human" need a person with an account or a recording; the coder cannot do them in a sandbox. All fixes respect the steering files and the feature freeze on 2026-11-27 (`product.md`): none adds a Tier 2 or 3 feature.

| Rank | Fix | Est. gain / effort |
|---|---|---|
| 1 | Publish `@e-1305/crypt` | 4.5 / 1 |
| 2 | Add a copy-paste GitHub Actions example | 3.0 / 1 |
| 3 | Rewrite the 10-second line for non-experts | 2.5 / 1 |
| 4 | Add a "who is this for and who pays" section, sourced | 2.0 / 1 |
| 5 | Link and deploy War Room, graveyard and an autopsy sample | 3.5 / 2 |
| 6 | Record the video and a GIF and fill the Devpost link | 3.5 / 2 |
| 7 | Fix the "Real PRs, real CI" caption in judge mode | 1.5 / 1 |
| 8 | Put the SLA rule and a report export on the page | 3.0 / 2 |
| 9 | Make the noise filter inspectable and state its limits | 2.5 / 2 |
| 10 | Record one real hook run from a desktop IDE or CLI session | 1.0 / 2 |

### 1. Publish `@e-1305/crypt` to npm (human)

- **What to change.** Publish the package, or, if that is not possible before the deadline, remove the `npx @e-1305/crypt` block from the top of the README and lead with the checkout form that works today. The README currently shows the `npx` line first and says "not published yet" a few lines later.
- **Files.** `README.md` (top code block, "Install"), `docs/DEVPOST.md` ("What is next"), `package.json` (`files`, `bin`), `.github/workflows/ci.yml` (pack-install test already exists).
- **Lifts.** Engineering manager, open-source maintainer, SOC analyst, AppSec engineer, VC.
- **Acceptance check.** In a clean container with no checkout: `npx @e-1305/crypt --help` exits 0 and prints the command list (paste the terminal screenshot). If not published: a screenshot of the README top block shows no command that fails, and `tests/devpost-docs.test.ts` or a new test fails if the README's first install command is not runnable from a clean state.

### 2. Add a copy-paste GitHub Actions example (docs only)

- **What to change.** Add a short workflow that runs `crypt exhume` on a schedule in a fork or checkout, writes the ranked list to the job summary, and opens nothing. State that no Slack or Teams message exists yet. Depends on fix 1 for a clean `npx`, or use the checkout form.
- **Files.** `docs/INTEGRATIONS.md`, `docs/USER_MANUAL.md` ("fit in your week"), link from `README.md`.
- **Lifts.** Engineering manager, open-source maintainer, VOC lead, SOC analyst.
- **Acceptance check.** The example workflow, copied into a scratch repo, produces a green run whose job summary lists the ranked limbs (link or screenshot of the run). A test asserts the YAML in the doc parses.

### 3. Rewrite the 10-second line for non-experts

- **What to change.** Keep "The first vulnerability report you can play". Replace the pitch sentence with one that avoids "dependency", "pull request" and "GRAFT" on first use, for example: "Your software is built from other people's code. CRYPT shows the risky parts as a creature and helps you fix them, with a person approving every change." Keep the existing safety wording intact and the "dry run" label.
- **Files.** `web/index.html` (`#pitch`, `#theatre-caption`, `<meta name="description">`), `web/copy.js`, `README.md` top quote, `docs/DEVPOST.md` tagline if reused. Respect `blameless.md`: state actions, not prohibitions.
- **Lifts.** Recruiter, game voter, VC, CISO.
- **Acceptance check.** Screenshots of `/` at 1440x900 and 390x844 show the new line above the fold and not clipped; `tests` for copy (the existing blameless copy check and no-em-dash check) pass; five non-technical readers shown the screenshot for 10 seconds can state what it does (record the result honestly, do not report it if not run).

### 4. Add "who is this for and who pays", sourced

- **What to change.** A short section naming the primary user (a dev team in a 15-minute weekly raid, per `product.md`), the secondary readers (VOC, CISO), what is free today, and what is not claimed. Any market-size figure must carry a link to a public source and its date. If no source is found, say none is claimed. No invented numbers.
- **Files.** `docs/PITCH.md`, `docs/DEVPOST.md`.
- **Lifts.** VC, judge (Potential Value).
- **Acceptance check.** Every number in the new section has a footnote link that resolves (link-check script in CI, as used for `docs/KIRO.md`); a reviewer reading `docs/PITCH.md` can answer "who pays" in one sentence.

### 5. Link and deploy War Room, graveyard and an autopsy sample

- **What to change.** On the live site, `graveyard/graveyard.html` returns 404 and the landing page has no link to the War Room or the graveyard. Confirm the Pages deploy includes #116, add links in the Bench drawer and in the manual, and publish one static autopsy sample (built from the demo creature, labelled "sample") next to them. Add all three to the README.
- **Files.** `web/index.html` (Bench body), `scripts/build-site.ts` (copy the sample and the graveyard), `.github/workflows/pages.yml`, `src/report/sample.ts` and `scripts/cli/autopsy.ts` (source of the sample), `README.md`.
- **Lifts.** CISO, VOC lead, SOC analyst, VC, judge.
- **Acceptance check.** A link-check test or Playwright script requests `/`, `/war-room.html`, `/graveyard/graveyard.html` and the sample page on the built `_site/` and gets 200 for all; screenshots of each show "SIMULATED" or "SAMPLE" in view.

### 6. Record the video and a GIF, fill the Devpost link (human)

- **What to change.** Record the 3:00 video from `docs/VIDEO.md` and a 20 to 30 second GIF of the graft, the red-CI rejection and `SEAL CRYPT`. Put the GIF at the top of the README and the video URL in `docs/DEVPOST.md`. Keep the simulated labels in frame, as `docs/VIDEO.md` requires.
- **Files.** `docs/DEVPOST.md` (replace "TODO add URL after upload"), `README.md`, `docs/VIDEO.md`, `assets/video/`.
- **Lifts.** Judge, game voter, recruiter, VC.
- **Acceptance check.** `docs/DEVPOST.md` contains no "TODO"; `tests/devpost-docs.test.ts` gains an assertion for it; a screenshot of the rendered README shows the GIF above the fold on GitHub.

### 7. Fix the "Real PRs, real CI" caption in judge mode

- **What to change.** `FINAL_CAPTION` in `web/judge-mode.js` says "Real PRs, real CI, a human always merges. Your turn." The page is a rehearsal, so the caption reads as a claim the page does not demonstrate. Reword to say what is true, for example: "This page is a rehearsal. The CLI opens real PRs, CI checks them, a person merges. Your turn." Check `scripts/hooks/blameless-copy-check.sh` still passes.
- **Files.** `web/judge-mode.js` (`FINAL_CAPTION`), the judge-mode test that pins the text, `.kiro/specs/judge-mode/`.
- **Lifts.** Judge, CISO, AppSec.
- **Acceptance check.** Screenshot of `/?judge=1` at 45 seconds shows the new caption and the "simulated" label together; the updated unit test passes.

### 8. Put the SLA rule and a report export on the page

- **What to change.** In the paste result, show the SLA line from `sla-policy.md` (Possessed 48 hours, EPSS of 0.1 or more this sprint, others backlog) next to each limb, and add "Download as CSV" and "Download as JSON" for the ranked list. Everything is generated in the browser from the same ranking code, with the dry-run label. No owner is shown next to a failure (blameless).
- **Files.** `web/app.js` or `web/live-exhume.js` (paste result), `web/import.js`, `src/exhume/rank.ts` (read only), `web/war-room/war-room.js` (recap).
- **Lifts.** VOC lead, CISO, engineering manager.
- **Acceptance check.** A test parses the downloaded CSV for the demo creature and finds the same order as `crypt exhume`; a screenshot of the paste result shows the SLA column and the export buttons at 1440x900 and 390x844.

### 9. Make the noise filter inspectable and state its limits

- **What to change.** Where the paste result and census say "N findings, M monsters", add a one-click list of the exorcised findings with the reason ("EPSS below 0.1, not in KEV"), and one plain line: "Lockfile only. A finding means the locked version has an advisory, not that the code runs it." Unknown limbs stay shown as unknown.
- **Files.** `web/live-exhume.js`, `web/index.html`, `src/exhume/rank.ts` (data source, no logic change), `docs/census/RESULTS.md` (already states the limits; link to it).
- **Lifts.** AppSec engineer, SOC analyst, CISO, open-source maintainer.
- **Acceptance check.** Screenshot of a paste result shows the exorcised list expanded with reasons for each row; a test confirms every exorcised row has a reason and no row is dropped (count of shown plus exorcised equals findings).

### 10. Record one real hook run from a desktop IDE or CLI session (human)

- **What to change.** Open the repository as the workspace root in the Kiro IDE or CLI, edit a file that matches a hook filter, and commit the resulting line in `docs/evidence/hook-runs.jsonl` with the trigger the tool reports. If it does not fire, document the failure there. Do not hand-write a non-manual line. The stats block updates on `main` by the `stats` workflow, not in a PR (`tech.md`).
- **Files.** `docs/evidence/hook-runs.jsonl`, `docs/KIRO.md` (Limits).
- **Lifts.** Judge (Implementation of Kiro).
- **Acceptance check.** After the stats workflow runs on `main`, the "Hook runs recorded in a Kiro session" row in `docs/KIRO.md` is greater than 0, and a screenshot of the IDE shows the hook run.

## Not fixable by docs or small code, and why

- SOC fit and a real buyer need Tier 2 or 3 work (alert formats, multi-tenant reporting), which `product.md` excludes before the freeze. They stay as stated limits in the pitch.
- The 3D bench, sound and Lighthouse score are "not verified" in the project's own text. They need a GPU, audio and a live audit run on real hardware, which this review did not do.
