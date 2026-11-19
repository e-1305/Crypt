# Review round 5: the five official criteria and the 10 personas

Written 2026-11-19 (the sandbox clock on the day of the run). Same 10 personas as [round 1](round-1.md) to [round 4](round-4.md), same method as [personas.md](personas.md). Outsider view only. Grades are the reviewer's judgment, not measurements. Steering read first (`.kiro/steering/`: blameless, failsafe, paste-flow, product, sla-policy, tech), then personas, round 4 and [ROADMAP.md](../ROADMAP.md).

**The scale changed.** Rounds 1 to 4 graded four criteria taken from an earlier reading of the rules (Potential Value, Implementation of Kiro, Quality and Design, Frankenstein fit). This round grades the five official criteria, each 20% (10 points), quoted from the [Kiroween 2026 rules](https://kiroween.devpost.com/rules). The two means are not comparable. Round 4's 7.5 is not a baseline for the new table.

## What was judged

- The live site, `https://e-1305.github.io/Crypt/`: `/`, `war-room.html`, `for-teams.html`, `autopsy.html`, `graveyard/graveyard.html`, `manual.html` all returned HTTP 200 to `curl`. The landing page links `for-teams.html`. A browser was not used: no rendering, WebGL, sound or Lighthouse check.
- `npm view @e-1305/crypt`: version 0.2.0, dist-tag `latest`.
- `https://api.npmjs.org/downloads/point/last-week/@e-1305/crypt`: 177 downloads, window 2026-11-12 to 2026-11-18. The count does not say who downloaded. Mirrors, bots and the author's own installs are not separated, so it is not evidence of 177 users.
- GitHub REST API for `e-1305/Crypt`: 0 stars, 0 forks, 3 open issues.
- A local checkout of `main` (commit 19cace7, #200): `npm ci` then `npm test`: 80 of 81 test files passed, 1,209 tests passed, 15 skipped, 5 failed. All 5 failures are in `tests/import.test.ts` ("exhume --from, end to end") with `spawnSync .../.toolchain/Inform6/inform6 ENOENT`: the Inform 6 compiler is not installed in this sandbox. This is an environment gap in the reviewer's run, not a finding about `main`. CI status was not checked here.
- Files read: `docs/ROADMAP.md`, `docs/VIDEO.md`, `docs/DEMO.md`, `docs/KIRO.md`, `docs/DEVPOST.md`, `docs/SECURITY-REVIEW.md`, `docs/ACCESSIBILITY.md`, `docs/evidence/hook-runs.jsonl`, `web/for-teams.html`, `CHANGELOG.md`, `README.md`.
- Kiro assets counted in the repository: 31 spec folders in `.kiro/specs`, 7 hook files, 3 agent files (`foreman`, `inquisitor`, `necromancer`), 6 steering files, `.kiro/settings/mcp.json`.

Not done: a live raid, a Code Scanning upload, `crypt init` on a fresh fork, a SARIF schema validation, loading OCSF into a SIEM, a Lighthouse run, the 3D bench on a GPU. Anything below that depends on those is marked "not verified".

## What changed since round 4

Checked and true:

- **P1 SARIF.** `CHANGELOG.md` describes `crypt alerts --format sarif` and the Action input `upload-sarif` (skipped on fork PRs). Not verified: that the Security tab on `crypt-demo` shows the jquery alert, which is the "done when" in the roadmap.
- **P2 history.** `fixtures/history/crypt-demo-2026-11-18.jsonl` seeds the trend with the real events of [PROOF.md](../PROOF.md) only. Unknown values read `unknown`. The trend is real but thin: one repository, one day.
- **P3 import signal.** Merged in #198 and #200 (summary, `creature.json`, OCSF `unmapped.usage`, SARIF `properties.usage`). The text calls it a static import scan, not reachability. Stale doc: `CHANGELOG.md` line 5 still says "No UI or export yet (P3b)" after P3b merged.
- **P4 `crypt init`.** Merged in #195. Not verified on a fresh fork.
- **P5 buyer page.** `web/for-teams.html` has the census numbers with source, a two-week read-only pilot, an ROI estimate labelled ESTIMATE with its formula and its assumptions, a pricing HYPOTHESIS ("No customers, no revenue and no price exist today"), and the design-partner issue form. No design partner has signed up.
- **0.2.0 is published**, which closes the round 4 blocker that every `npx` line in `docs/SOC.md` failed. Not re-run past `npm view`.
- The landing page no longer shows the round 4 wording mismatch. It says "merged by a human".
- `docs/SECURITY-REVIEW.md` now names a contact route (GitHub private vulnerability reporting, via `SECURITY.md`), and says there is no person to call.
- A README GIF exists (`docs/img/crypt-demo.gif`, 1.7 MB) and a foreman agent reports in #180.

Unchanged and still the main gap:

- **No video.** `docs/DEVPOST.md` line 9 still reads "Video: TODO add URL after upload".
- **Hooks.** `docs/evidence/hook-runs.jsonl` has 6 lines: 5 manual, 1 cloud hook (`failsafe-guard-on-stop-cloud`, trigger `Stop`, 2026-11-18T21:15:44Z). None from the repository's own 7 hooks. `docs/KIRO.md` says so.
- **Traction.** 0 stars, 0 forks, 0 signed design partners.

## Table A: the five official criteria

Equal weight. Quotes are excerpts from each criterion on the rules page.

| Criterion | Score /10 | Why | The one change that adds the most |
|---|---|---|---|
| **Potential Impact** ("Does the project make a credible case for solving a real problem for a real audience?") | 7 | The problem is stated with sourced numbers (census: 248 findings, 95.2% noise, 84.7% unowned, lockfiles only, not a random sample). The buyer page, SARIF, `init` and history make it usable by a team. Held back: no customer, no outside user known, 177 downloads of unknown origin, the buyer page says nothing was tested with a buyer. | One outside maintainer or security practitioner runs it and says so in writing (signal S1 or S2). **human** |
| **Technological Implementation** ("How thoroughly and skillfully does the project use Kiro?") | 7 | Wide use: 31 specs, 6 steering files, 7 hooks, 3 agents, an MCP server, a foreman agent on a schedule, property tests for each failsafe rule, 1,209 passing tests in this run. Held back: no run of the repository's own hooks in any Kiro session, steering auto-load never observed, and `docs/KIRO.md` says both. | One unedited line from one of the repository's own hooks, fired in a desktop IDE or CLI session (S4). **human** |
| **Design** ("a complete, coherent product experience, not just a technical proof of concept") | 8 | One story across landing, War Room, graveyard, autopsy, manual, buyer page and CLI. Blameless and failsafe rules shape the copy. Held back: the 3D bench, sound and Lighthouse on the current build are "not verified" in `docs/ACCESSIBILITY.md` (Lighthouse could not launch Chrome); this review did not render the pages either. | Run Lighthouse and the 3D bench on a machine with Chrome and a GPU, record the results in `docs/ACCESSIBILITY.md`. **human** |
| **Innovation/Idea** ("How creative and novel is the concept... public resources (like datasets)") | 8 | A 1979 Z-machine game as the interface for OSV, CISA KEV and EPSS data, with agents that can open a PR and no merge call. The static import signal and the noise line are specific, not decoration. Held back: the novelty is in the interface, and the security logic (KEV and EPSS ranking) is established. | Nothing cheap. A clip that shows the idea in 10 seconds is the Presentation item below. |
| **Presentation** ("Does the video clearly demonstrate the project working end-to-end?") | 5 | There is no video, and the first sentence of this criterion is about the video. The README GIF, the written demo script, storyboard stills and captions (`docs/VIDEO.md`, `assets/video/`) are good preparation and do not count as the video. The Devpost page has "TODO" in the video line. | Record and upload the video (P6), then replace the TODO with the URL. **human** |

**Overall (the number judges use): 7.0 / 10.** Mean of the five: 7 + 7 + 8 + 8 + 5 = 35, and 35 / 5 = 7.0.

If the video is recorded and good, Presentation is the only score that can move by several points before the freeze. The other four can each move by about one, and only with signals from people outside the team. These are the reviewer's estimates.

## Table B: the 10 personas

R1 to R4 are from round 4. R5 is this round. **product** means shippable in code or docs before the 2026-11-27 freeze. **signal** means it needs a real person, a recording, a download or a star.

| Persona | R1 → R5 | One sentence | Biggest remaining blocker | Tag |
|---|---|---|---|---|
| 1. Kiroween judge | 6 → 7 → 8 → 8 → **8** | "Five features landed and the proof is honest, but I still cannot watch it, and no hook of yours has fired in a Kiro session." | No video; no line from the repository's own hooks | **signal** |
| 2. CISO at a large bank | 5 → 6 → 7 → 8 → **8** | "A history and a trend are what I wanted, and the vendor page tells me what is not offered, but I see no customer and no SSO." | No named customer or team that ran it; no SSO, tenancy, retention or audit | **signal** |
| 3. SOC L1 analyst | 4 → 4 → 6 → 7 → **8** | "`alerts` now installs from npm and SARIF lands in Code Scanning, but nobody has loaded the OCSF file into a SIEM." | No real SIEM ingestion; SARIF upload on crypt-demo not verified | **signal** |
| 4. VOC lead | 5 → 6 → 8 → 8 → **9** | "Ageing, breaches and mean time to heal are there, but the trend rests on one day and one repository." | History holds one real heal; no multi-week run | **signal** |
| 5. Open-source maintainer | 5 → 7 → 8 → 8 → **8** | "`crypt init` is the PR I would accept, but the comparison is still the author's own demo and nobody outside has tried it." | No outside maintainer run | **signal** |
| 6. AppSec engineer | 5 → 5 → 7 → 7 → **8** | "A direct, transitive or dev label is useful and honest, but it is an import scan and it is npm only." | Static signal only; no reachability; not shown on a census repo in the UI I could check | **product** |
| 7. Engineering manager | 4 → 6 → 7 → 7 → **8** | "Setup is one PR now, but I still see no real first run with a time on it." | `init` and the Action not shown on a real repository outside the demo | **signal** |
| 8. Game designer and voter | 6 → 6 → 7 → 7 → **7** | "The GIF helps, but I still cannot watch a full run, and the loop is short." | No video; short game loop | **signal** |
| 9. VC or acquirer | 3 → 4 → 5 → 6 → **7** | "Now there is a buyer page with a pilot and an honest ESTIMATE label, but zero stars, zero signed partners and no price tested." | No customer, no design partner, no traction beyond 177 downloads of unknown origin | **signal** |
| 10. Recruiter, non-technical | 6 → 6 → 7 → 7 → **7** | "The GIF is something to repost, but there is no 30-second clip and no post from the author yet." | No clip, no social post | **signal** |

**Persona mean: 7.8 / 10.** 8 + 8 + 8 + 9 + 8 + 8 + 8 + 7 + 7 + 7 = 78, and 78 / 10 = 7.8. Round 4 was 7.3 (73 / 10), so this round gained 0.5.

Why most blockers are **signal**: the product items that a repository can close have mostly closed. What is left is a recording, outside users, a hook fired in another tool and a SIEM. Only the AppSec blocker is a product limit, and the roadmap lists runtime reachability as out of scope.

Per-persona ceilings before the freeze are not repeated here. Round 4's estimates still apply to the personas whose blockers did not change.

## What P6 (demo v2) must show to max Presentation and win Best Demo

The criterion asks four things: does the video show the project working end to end, does it say what problem, for whom and why, is it easy to follow, is it creative and memorable. The existing [VIDEO.md](../VIDEO.md) storyboard is told from the maker's side (cold open, census, `SEAL CRYPT`, `.kiro/` tour). P6 should tell the story from the customer's side and put `.kiro/` in the last 20 seconds, not the middle.

Rules carried over from `docs/VIDEO.md`, which still hold: 3:00 or less, the maker's own voice, original or CC0 audio, a visible label whenever something is simulated or a dry run, no token on screen, and no claim that the repository's own hooks fired in a Kiro session.

Two facts to get right in the script:

- **"248 findings" is the census across 20 projects, not one team's backlog.** The roadmap's opening line ("a VOC lead has 248 findings") would be false if said about one team. Say "across twenty popular projects" or show one real repository's own count.
- **Say that jquery is actively exploited only if the screen shows the KEV flag from a loaded feed.** Round 4 found that without the feeds `crypt-demo` flags no KEV limb. Show the feeds loaded, or do not say it.

Shot list, 2:50 total, customer's side. Real footage unless marked.

| # | Time | On screen | Voice (customer, first person) | Source and label |
|---|---|---|---|---|
| 1 | 0:00 to 0:12 | Monday morning inbox or scanner list: the raw count from the real scan of one repository, then a cut to the CRYPT plate for the same repository. | "Monday, 9:00. I own vulnerability operations. This is the list, and nobody on it has a name." | The count must be the real output of the shown scan. |
| 2 | 0:12 to 0:30 | The census card: 20 projects, 248 findings, 95.2% noise, 84.7% no owner. | "I checked twenty popular projects. Almost all of it is noise, and most parts have no owner." | `docs/census/RESULTS.md`. Say "lockfiles only, not a random sample" on screen. |
| 3 | 0:30 to 0:50 | Terminal: `npx @e-1305/crypt` on the repository, ranked list with the noise line, KEV flag from loaded feeds, owner team from CODEOWNERS, and the import label (`direct`, `transitive`, `dev`). | "One command. It ranks by CISA KEV and EPSS. It names a team, not a person. And it says whether we import the package." | Real run. On screen: "static import scan, not reachability". |
| 4 | 0:50 to 1:05 | `crypt init` opens the onboarding PR: workflow in report mode and a CODEOWNERS draft with team placeholders. | "Setup was one pull request." | Real run on a fork. If not recorded for real, do not show it. |
| 5 | 1:05 to 1:25 | The game: `GRAFT JQUERY`, the dry-run payload, then cut to the real [crypt-demo PR #1](https://github.com/e-1305/crypt-demo/pull/1) with the `test` check green and the Merged badge. | "I type GRAFT. It opens one pull request. CRYPT cannot merge. A person did." | Dry-run label in frame. The merge was by the repository owner, say so. |
| 6 | 1:25 to 1:40 | The Inquisitor rejecting a bad graft (CI red), then `SEAL CRYPT` and the refusal in the audit log. | "A bad fix is rejected. One word stops everything, and it is written down." | Real footage from the live raid runs listed in `docs/VIDEO.md`. |
| 7 | 1:40 to 1:55 | `reraise`: the limb shows HEALED. | "CI is green, a human merged, and the limb is healed." | Real run on crypt-demo. |
| 8 | 1:55 to 2:15 | The War Room or autopsy history panels: open KEV limbs over time, age, breaches, mean time to heal, with `unknown` where the history is empty. | "Now I can show my CISO the backlog moving, and I can see where we have no data." | Seeded history from 2026-11-18 only. Label "one repository, one day" on screen. Do not invent a trend. |
| 9 | 2:15 to 2:30 | The CISO report page, then the Security tab with the SARIF alert, then one OCSF event. | "The report goes to my CISO. The same finding shows in GitHub's Security tab and in my SIEM format." | Show the Security tab only after it has been verified on crypt-demo. Say "OCSF file, not yet loaded in a SIEM" unless that changes. |
| 10 | 2:30 to 2:42 | `for-teams.html`: pilot, the ESTIMATE label, the design-partner issue form. | "A two-week read-only pilot. The savings are an estimate, and no customer has done it yet." | Matches the page's own labels. |
| 11 | 2:42 to 2:50 | `.kiro/` tree (specs, steering, hooks, agents), then closing line and URL. | "Built with Kiro: 31 specs, steering that binds, hooks, three agents. Don't abandon your creature." | Numbers from `npm run kiro:stats` on the day. Do not say the repository's own hooks fired in Kiro. |

Why this wins on the rubric: shots 3 to 9 are the end-to-end run the first question asks for, shots 1, 2 and 10 say what, who and why, the order is one Monday morning so it is easy to follow, and the CRT creature is the memorable part. Every simulated or dry-run item keeps its label, which a judge who checks claims will credit.

Rehearse with `?record=1` and the stills in `assets/video/`. Do not claim "Best Demo" criteria beyond the five above: the rules page quoted here lists no separate Best Demo rubric.

## Top 10 fixes before the 2026-11-27 freeze, by gain over effort

Gain is the reviewer's judgment of effect on the five-criteria mean or the persona mean. Effort is rough hands-on time. Neither is a measurement. **human** means only a person can do it.

| Rank | Fix | Lifts | Gain | Effort | Tag |
|---|---|---|---|---|---|
| 1 | Record the P6 video from the shot list above, upload it, and replace "Video: TODO" in `docs/DEVPOST.md` line 9 with the URL. | Presentation, judge, voter, recruiter | Highest | Medium | **human** |
| 2 | Add a test that fails if "TODO" appears in `docs/DEVPOST.md`, and update the write-up for P1 to P5 and 0.2.0 (SARIF, history, import signal, `init`, buyer page, 177 downloads with its caveat). | Presentation, Potential Impact | High | Low | product |
| 3 | Verify P1 on `e-1305/crypt-demo`: run the Action with `upload-sarif`, screenshot the Security tab alert, add it to `docs/PROOF.md`. | Potential Impact, SOC, EM | High | Low | **human** (needs the repository's Action run and a screenshot) |
| 4 | Fire one of the repository's own hooks in a desktop IDE or CLI session with the repo as workspace root, and commit the unedited line to `docs/evidence/hook-runs.jsonl`. | Technological Implementation, judge | High | Low | **human** |
| 5 | Run `crypt init` on a fresh fork, record the time to the first green Action run, and publish that number with its date. | EM, maintainer, Potential Impact | High | Low | **human** |
| 6 | Ask one outside maintainer to run `npx @e-1305/crypt` or the Action and quote their result, with permission (S2). | Potential Impact, VC, maintainer | High | Medium (depends on a reply) | **human** |
| 7 | Run Lighthouse and the 3D bench on a machine with Chrome and a GPU, and record the results in `docs/ACCESSIBILITY.md`. | Design | Medium | Low | **human** |
| 8 | Write the dev.to post and the #KiroweenHackathon26 post in the author's own words (S5). | Presentation, recruiter, VC | Medium | Medium | **human** |
| 9 | Fix stale text: `CHANGELOG.md` line 5 ("No UI or export yet (P3b)"), and say in the README how to install the Inform 6 toolchain, so `tests/import.test.ts` does not fail with `ENOENT` for a new contributor. Check first whether CI already installs it. | Design, judge | Low to medium | Low | product |
| 10 | Hold three conversations with security practitioners and publish two-line anonymous quotes (S1). | Potential Impact, VC, CISO | Medium | Medium | **human** |

After the freeze only reliability, accessibility, copy and demo-path fixes are accepted (`.kiro/steering/product.md`), so items 2 and 9 can still ship, and nothing new should be built.

## Limits of this review

- The grades are one reviewer's judgment, with no browser, no GPU and no audio.
- The 177 downloads are an API count with no breakdown by who downloaded.
- Four criteria in earlier rounds and five here are different scales. Do not subtract.
- The five test failures are from the missing Inform 6 compiler in the sandbox, not shown to exist on `main` in CI.
