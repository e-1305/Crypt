# Review round 4: grades and fixes

Written 2026-11-19 (the sandbox clock on the day of the run). Same 10 personas as [round 1](round-1.md), [round 2](round-2.md) and [round 3](round-3.md), same method as [personas.md](personas.md). Outsider view only. The grades are the reviewer's judgment, not measurements. A 10 means a judge would put CRYPT in first place. Nobody here would, yet. The owner wants every persona at 10. This round says which ones cannot get there before the 2026-11-27 freeze and why.

Version 0.2.0 is prepared in the repository but **not published**. This round grades what is live (npm 0.1.0, the deployed site) and states in the section "What changes once 0.2.0 is published" what moves after the Release workflow runs.

## What was judged

- The live site, https://e-1305.github.io/Crypt/. `/`, `war-room.html`, `graveyard/graveyard.html`, `manual.html`, `autopsy.html` and `/?judge=1` all returned HTTP 200 to `curl`. The deployed `live-exhume.js` is 12,791 bytes, the same size as in round 3.
- A local build on `main` (commit 328848c): `npm ci` exits 0, `npm run build:site` exits 0 ("wrote _site (demo + 20 gallery creatures)"). `npm test`: 75 test files passed, 1,136 tests passed, 4 skipped (round 3: 73 files, 1,119 passed, 4 skipped).
- The published package: `npm view @e-1305/crypt` reports version 0.1.0, dist-tag `latest`, last modified 2026-11-18T20:38:32.613Z. In an empty folder, `npx @e-1305/crypt@latest --help` prints "crypt 0.1.0" and lists no `alerts` command. `npx @e-1305/crypt alerts --format ocsf` prints `crypt: unknown command 'alerts'. Run 'crypt --help' for usage.`
- `npm run traction`, quoted in the section "Traction" below.
- The local CLI (`node bin/crypt.mjs`) in a fresh temporary folder: `exhume fixtures/crypt-demo --offline --cache data/cache/osv` ranked 5 limbs as Rotting (unknown), and `alerts --format ocsf` printed "Wrote 0 OCSF Vulnerability Finding events (class 2002)". No feeds were given, so no limb is flagged KEV and none spawns. `docs/SOC.md` now says this ("In an empty folder both feeds report `missing`").
- Files read: `docs/SOC.md`, `docs/SECURITY-REVIEW.md`, `docs/VS-DEPENDABOT.md`, `docs/PROOF.md`, `docs/BUSINESS.md`, `docs/INTEGRATIONS.md`, `docs/KIRO.md`, `docs/DEVPOST.md`, `CHANGELOG.md`, `README.md`, `docs/evidence/hook-runs.jsonl` (6 lines, unchanged), `web/index.html`.
- Facts from the GitHub REST API: `e-1305/Crypt` has 0 stars, 0 forks, 1 open issue. PR #1 on crypt-demo has `user` e-1305 and `merged_by` e-1305.

What this review did not do: render the page in a browser, run WebGL, listen to sound, measure Lighthouse, run a live raid, run the online `npx` path of `docs/SOC.md` past the first failing command, run `npm run compare:dependabot`, load OCSF events into a real SIEM, or validate them against the OCSF schema. The `tests/soc-runbook.test.ts` file exists and passes inside `npm test`; I did not read its assertions line by line. The SOC sample event in `docs/SOC.md` (severity 3 "Medium", product version "0.1.0") was not re-run: not checked.

## What changed since round 3

Checked and true:

- **SOC runbook (#170).** `docs/SOC.md` now starts from an empty folder, says the feeds are not in the npm package and what happens without them (`missing`, no KEV flag, `unmapped.sla` is `backlog`), and gives an offline path. This closes the round 3 complaint that the quickstart can silently write zero events. `tests/soc-runbook.test.ts` (94 lines) is new.
- **Vendor review page (#170).** `docs/SECURITY-REVIEW.md` has data handled, data stored, a network call table with the code file for each row, token scopes, the no-merge control, the SEAL kill switch, the audit log format, supply chain (npm provenance) and a "Not offered" list: no SSO, no tenancy, no retention SLA, no support contract, no independent audit, no reachability. It is linked from the README. It gives no named contact. This is the page round 3 fix 7 asked for.
- **Contradictions fixed (#173).** `docs/BUSINESS.md` now says OCSF export is "Built" and "Not yet confirmed loading in a customer SIEM". `docs/INTEGRATIONS.md` says CSV and JSON export ship in the scan result. `grep -n "Not built" docs/BUSINESS.md` returns nothing.
- **Traction (#173).** `npm run traction` now prints "downloads not indexed yet" instead of "not published". `curl https://api.npmjs.org/downloads/point/last-week/@e-1305/crypt` still returns 404 `{"error":"package @e-1305/crypt not found"}` today, one day after the publish. The wording is now true.
- **Dependabot side by side (#174).** `docs/VS-DEPENDABOT.md` compares both tools on `e-1305/crypt-demo` at commit bd82e8e: Dependabot would open 5 PRs, CRYPT spawns 2 and sets 3 aside with the EPSS value as the reason. It has a "Where Dependabot is better" section and a "Limits" section that says the Dependabot side is derived from a rule, not a recorded run. `npm run compare:dependabot` and a test keep the table in sync. This closes round 3 fix 8 for one repository.
- **Version prepared (#173).** `package.json` is 0.2.0 and `CHANGELOG.md` has a 0.2.0 entry that lists `alerts`.

New problems found this round (each checked):

- **Every `npx` command in `docs/SOC.md` fails today.** The first `alerts` command prints "unknown command". The doc is correct for 0.2.0 and wrong for what a reader can install. This is the same problem as round 3, now only waiting on the Release workflow.
- **The live landing page lags `main`.** `main` has "The same account (the repo owner) opened the token and merged PR #1; CRYPT has no merge call." in `web/index.html`. The deployed page says "PR #1 merged by the repo owner, using GitHub's Merge button. CRYPT has no merge call." with no same-account sentence. The cause was not determined here (a Pages run that has not happened since #173 is the likely one). Round 3 fix 4 is done in the repository and not yet visible to a visitor.
- **The same-account sentence has a wording error.** "opened the token and merged PR #1" (`docs/PROOF.md` line 8 and `web/index.html` line 199). A token is not opened. It should say the account's token opened PR #1 and the same account merged it.
- **The Dependabot comparison is the author's own demo repo, and the Dependabot column is a rule, not a run.** The doc says so. A maintainer will notice that the repo is `e-1305/crypt-demo`, 7 packages, and the "3 of 5 set aside" is on a fixture chosen by the project.
- **No named contact in `docs/SECURITY-REVIEW.md`.** A vendor reviewer needs one. `grep -n "contact"` on the page finds nothing. The page says issues go to the public repository.
- **No video.** `docs/DEVPOST.md` line 9 is still "Video: TODO add URL after upload".
- **No new hook evidence.** `docs/evidence/hook-runs.jsonl` still has 6 lines (5 manual, 1 `failsafe-guard-on-stop-cloud`). `docs/KIRO.md` still reports 1 run in a real Kiro session.
- **Traction is flat.** 0 stars, 0 forks, Action users "not discoverable" without a token.

## Traction

`npm run traction`, as printed on 2026-11-19 (UTC):

```
| npm downloads, last week (@e-1305/crypt) | downloads not indexed yet | api.npmjs.org |
| GitHub stars (e-1305/Crypt) | 0 | api.github.com |
| GitHub forks (e-1305/Crypt) | 0 | api.github.com |
| Public repos using the Action | not discoverable (GitHub code search needs a token) | GitHub code search |
```

## Persona grades

| Persona | R1 | R2 | R3 | R4 | The one sentence they would say | Single biggest remaining blocker |
|---|---|---|---|---|---|---|
| 1. Kiroween judge | 6 | 7 | 8 | 8 | "The proof and the write-up are solid and honest, but there is still no video and still one cloud hook line." | No video; no hook line from the repository's own hooks |
| 2. CISO at a large bank | 5 | 6 | 7 | 8 | "Now I have a vendor-review page with a 'Not offered' list I can believe, but no named contact and no SSO." | No contact, SSO, tenancy, retention or audit; SOC export not in the installable package |
| 3. SOC L1 analyst | 4 | 4 | 6 | 7 | "The runbook and the OCSF test are real and the feed warning is honest, but `npx` still says unknown command and no SIEM has loaded it." | `alerts` missing from npm 0.1.0; no real SIEM has ingested the output |
| 4. VOC lead | 5 | 6 | 8 | 8 | "The 48-hour rule and the export are there, but I cannot see ageing or a trend." | No history: no ageing, no trend (Tier 2) |
| 5. Open-source maintainer | 5 | 7 | 8 | 8 | "I can finally see 5 PRs against 2 on a real repo, but it is the author's own demo and Dependabot was not actually run." | Comparison on one project-owned fixture, Dependabot side derived, no outside maintainer |
| 6. AppSec engineer | 5 | 5 | 7 | 7 | "The limits are written down and the network table cites code, but I still cannot tell if the code runs it." | No reachability signal (not feasible from a lockfile) |
| 7. Engineering manager | 4 | 6 | 7 | 7 | "Job summary, Slack and Teams digests exist on paper, but I see no screenshot of a real run and no first-run time." | No evidence of the Action or digest running on a real repo |
| 8. Game designer and Devpost voter | 6 | 6 | 7 | 7 | "Nothing changed for me: still no clip to share and the loop is short." | No video or GIF; no one-click share |
| 9. VC or acquirer | 3 | 4 | 5 | 6 | "The numbers no longer contradict each other and the traction table is honest, but it says 0 stars, no customer and no downloads." | No customer, no traction |
| 10. Recruiter, non-technical | 6 | 6 | 7 | 7 | "I still have nothing to repost." | No 30-second clip |

**Overall grade: 7.3 / 10** (mean of the ten grades: 8+8+7+8+8+7+7+7+6+7 = 73, and 73 / 10 = 7.3). Round 3 was 6.9, round 2 was 5.7 and round 1 was 4.9, so this round gained 0.4.

Why the gain is small: the work since round 3 closed the items that a document or a script can close (SOC runbook, vendor page, contradictions, Dependabot table). Four personas moved (CISO, SOC, maintainer, VC), each by one point. The six that did not move wait on a video, a real Action run, a hook from the repository's own hooks, reachability, or history. None of those is a docs task.

## Official Kiroween criteria

| Criterion | R1 | R2 | R3 | R4 | Why |
|---|---|---|---|---|---|
| Potential Value | 5 | 6 | 7 | 7 | Gained: a vendor page, a reproducible comparison, honest traction text. Held back: no customer, 0 stars, lockfile only, and the SOC outputs are not in the published package. Not raised, because the value claim still rests on documents. |
| Implementation of Kiro | 6 | 6 | 7 | 7 | Unchanged. 6 steering files, specs, agents and 1 non-manual hook line. The repository's own 7 hooks were not observed firing, and steering auto-load is unobserved. |
| Quality and Design | 7 | 7 | 8 | 8 | Gained: contradictions fixed, 1,136 passing tests, new runbook and comparison tests. Lost back: the live site lags `main`, the PROOF sentence has a wording error, and the 3D bench, sound and Lighthouse are still "not verified". |
| Frankenstein category fit | 8 | 8 | 8 | 8 | Unchanged. A 1979 VM drives 2026 agents, and four data sources become one creature. |

Mean of the four criteria: 7.5 (7+7+8+8 = 30, and 30 / 4 = 7.5). Round 3: 7.5, round 2: 6.75 (6+6+7+8 = 27), round 1: 6.5 (5+6+7+8 = 26). The mean did not move this round.

## What changes once 0.2.0 is published

These are the reviewer's estimates, not measurements, and each needs the check shown.

- Check: in an empty folder, `npx @e-1305/crypt@latest --help` lists `alerts`, and the first two commands of `docs/SOC.md` exit 0.
- **SOC L1 7 to 8.** The runbook then works as written. It stays below 9 until a SIEM team loads the file.
- **CISO 8 stays 8.** The page already assumes the package carries `alerts`. Provenance on the new release is a checkable plus (`npm audit signatures`).
- **VC 6 stays 6.** A published version with a download count of 0 from outsiders adds nothing. A non-zero count from someone outside the team would.
- **Judge, engineering manager, voter, recruiter: no change.**
- If the Release workflow fails or the site is not redeployed, none of this holds. Re-run this check after the release, not before.

Estimated overall after 0.2.0 and a Pages redeploy, with nothing else changed: 7.4 (74 / 10).

## Path to 10 for every persona below 10

All ten are below 10. Each item is tagged **product** (code or docs shippable before the 2026-11-27 freeze, per `.kiro/steering/product.md`) or **signal** (needs the real world: people, downloads, stars, quotes, a recording).

### 1. Kiroween judge (8)

- **product.** Replace the "TODO" in `docs/DEVPOST.md` line 9 with the URL once it exists, and add a test that fails if "TODO" returns.
- **product.** Keep claims at size: "1 hook run recorded in a Kiro Web session (cloud hook, trigger Stop)". Do not write "hooks are working".
- **signal.** The 3:00 video from `docs/VIDEO.md`, with the simulated labels in frame.
- **signal.** One line in `docs/evidence/hook-runs.jsonl` from one of the repository's own 7 hooks, fired in a desktop IDE or CLI session (or by `kiro-hooks.yml` with `KIRO_API_KEY`). A second line of the cloud hook adds little.
- **signal.** A session transcript that shows steering files loading by themselves.

**Grade 10 when:** the video is linked from the Devpost page with no "TODO" left, `docs/evidence/hook-runs.jsonl` has a line from one of the repository's own 7 hooks, and a judge checking each claim against the repository finds nothing that has to be taken on trust. This is the reviewer's estimate; this review lists 9 as the realistic ceiling before the freeze.

### 2. CISO at a large bank (8)

- **product.** Add a named contact (an address or a security policy file) to `docs/SECURITY-REVIEW.md`, and a `SECURITY.md` at the repository root for vulnerability reports. This is the gap a vendor reviewer sees first.
- **product.** Publish 0.2.0 so the export described exists.
- **signal.** A named bank or security team that ran the vendor review and wrote the result.
- **Ceiling.** SSO, tenancy, retention, an independent audit and a support contract are not buildable before the freeze (`product.md` rules out new features, and a third-party audit needs money and weeks). The honest ceiling for this persona this month is 8. A 10 needs a real vendor-risk approval.

### 3. SOC L1 analyst (7)

- **product.** Publish 0.2.0 (fix 2).
- **product.** Update the sample event in `docs/SOC.md` to the product version that prints (the sample says "0.1.0") and, if the first run still prints `severity_id` 0, show that output as well. I did not re-run the sample: not checked.
- **signal.** One security team loads `alerts.ocsf.json` into Security Lake, Splunk or Sentinel and writes down the result.
- **signal.** A SOC practitioner's quote that KEV dependency findings belong in their queue. Only a practitioner can say that. Cap without both: 8.

### 4. VOC lead (8)

- **product.** An "as of" date and the feed dates in the export, with a test (check `src/web/report-export.ts`; not checked this round).
- **product.** Ageing needs stored history, which is Tier 2. It is a product item only if the owner approves a Tier 2 feature before the freeze. Without it the ceiling is 8.
- **signal.** One real VOC lead tries the CSV against their tracker and names the missing column.

### 5. Open-source maintainer (8)

- **product.** Run the comparison on a second public repository that the project does not own, with date and commit, in `docs/VS-DEPENDABOT.md`. `npm run compare:dependabot` takes fixture paths, so a second fixture is a small change. Say "not compared" for anything not run.
- **product.** Record one actual Dependabot run (a screenshot or link of the PRs it opened) on `e-1305/crypt-demo` so the Dependabot column is observed, not derived. This needs Dependabot enabled on that repo, which the owner does.
- **signal.** One maintainer outside the e-1305 account runs the Action or `npx` and posts the result (an issue, a star, a PR).

**Grade 10 when:** the comparison page shows a recorded Dependabot run, covers at least one repository the project does not own, and a maintainer outside the e-1305 account has run the Action or `npx` and posted the result.

### 6. AppSec engineer (7)

- **product.** A worked example in `docs/census/RESULTS.md` that lists a few exorcised rows with their reasons, so the noise claim can be checked without running the site.
- **product.** Reword the headline noise number as a link to those rows.
- **Ceiling.** Reachability is not available from a lockfile. A 10 is out of reach by design. Ceiling: 8, with the "what lockfile-only cannot see" box already on the page.

### 7. Engineering manager (7)

- **product.** In `docs/INSTALL-ACTION.md`: a screenshot of the job summary from a real run in a scratch repo, the Slack or Teams digest step as a YAML snippet (label it "untested" if it was not run), and a measured first-run time. A test parses the YAML.
- **signal.** One team outside the org runs the Action for a week, visible in `npm run traction` with a token.

### 8. Game designer and Devpost voter (7)

- **product.** The GIF in the README top once it exists, and a one-click share link on the creature card.
- **product.** Record the real distance of the game input at 390x844 and set the limit in `scripts/ci/visual-qa.mjs` just above it so the layout cannot drift.
- **signal.** The 20 to 30 second clip, and a few real people playing it. The `docs/PLAYTEST_LOG.md` scores come from the authors' own personas.

**Grade 10 when:** the GIF and clip exist, the game input fits at 390x844 with a test holding it there, and people outside the authors have played it and the log shows their scores.

### 9. VC or acquirer (6)

- **product.** Keep every table row true. After 0.2.0, re-run `npm run traction` and paste the real output into `docs/BUSINESS.md` section 5.
- **product.** Do not add a moat claim beyond what the page already states (the trust model is enforced in code and CI; the ranking rule and the data are copyable).
- **signal.** Everything else: a paying customer or signed design partner, downloads above 0 from outside the team, stars, the Action in repositories outside the org, one written confirmation from a security team. No writing before 2026-11-27 reaches 10. The realistic ceiling this month is 7, from a first outside user plus a non-zero download count.

### 10. Recruiter, non-technical (7)

- **product.** Keep the Devpost page, README and site on the same first sentence. They matched in round 3. After the Pages redeploy, re-check the live page.
- **signal.** The 30 second clip to repost. Nothing else is in the way.

**Grade 10 when:** the 30 second clip exists to repost and the live page, README and Devpost page open with the same first sentence.

## Top 10 fixes

Ranking = estimated grade gain divided by effort, highest first. Gain is the number of personas the fix can raise by one point, counted only where that persona's own ceiling in the section above allows it (the reviewer's estimate, not a measurement). Each fix is counted on its own, so two fixes can name the same persona. Ties go to lower effort, then to the order in which the fixes were first listed. Effort: 1 = under 2 hours, 2 = half a day, 3 = a day or more. Fixes marked "human" need a person with an account, a recording tool or a real user. All respect the steering files and the 2026-11-27 freeze. None adds a Tier 2 or 3 feature.

| Rank | Fix | Est. gain / effort | Ratio |
|---|---|---|---|
| 1 | Record the video and a GIF, fill the Devpost link (human) | 3 / 2 | 1.50 |
| 2 | Run the Release workflow for 0.2.0 and redeploy Pages (human) | 1 / 1 | 1.00 |
| 3 | Fix the PROOF sentence wording and add a named contact and `SECURITY.md` | 1 / 1 | 1.00 |
| 4 | Noise worked example in `docs/census/RESULTS.md` | 1 / 1 | 1.00 |
| 5 | One outside maintainer or team runs the Action or `npx` (human) | 2 / 3 | 0.67 |
| 6 | Observed Dependabot run plus a second, outside repo in the comparison (human) | 1 / 2 | 0.50 |
| 7 | Action job summary screenshot and digest snippet from a real run (human) | 1 / 2 | 0.50 |
| 8 | A hook line from one of the repository's own hooks (human) | 1 / 2 | 0.50 |
| 9 | One outside security team loads the OCSF file and writes the result (human) | 1 / 3 | 0.33 |
| 10 | Fresh sample and version in `docs/SOC.md`, "as of" dates in the export | 0 / 1 | 0.00 |

### 1. Record the video and a GIF, fill the Devpost link (human)

- **What to change.** The 3:00 video from `docs/VIDEO.md` and a 20 to 30 second GIF (graft, red CI rejection, SEAL CRYPT), with the simulated labels in frame. Link PR #1 and PR #2 in the description.
- **Files.** `docs/DEVPOST.md` (line 9), `README.md` (top), `docs/VIDEO.md`, `assets/video/`.
- **Lifts.** Judge, voter, recruiter.
- **Acceptance check.** `docs/DEVPOST.md` contains no "TODO" and a test asserts it. The README shows the GIF above the fold on GitHub (screenshot).

### 2. Run the Release workflow for 0.2.0 and redeploy Pages (human)

- **What to change.** The owner runs the Release workflow (`.github/workflows/release.yml`, see `docs/RELEASE.md`), then triggers `pages.yml` so the landing page carries the same-account sentence.
- **Files.** None to edit. `package.json` is already 0.2.0.
- **Lifts.** SOC (7 to 8, as the section "What changes once 0.2.0 is published" says). CISO and VC stay at 8 and 6 there, so they are not counted.
- **Acceptance check.** `npm view @e-1305/crypt version` prints 0.2.0. In an empty folder `npx @e-1305/crypt@latest --help` lists `alerts`. `curl` of the live landing page contains "The same account". `npm audit signatures` reports a provenance statement.

### 3. Fix the PROOF sentence wording and add a named contact and `SECURITY.md`

- **What to change.** In `docs/PROOF.md` line 8 and `web/index.html` line 199, replace "opened the token and merged PR #1" with "the account whose token opened PR #1 also merged it". Add a contact line to `docs/SECURITY-REVIEW.md` and a root `SECURITY.md` for vulnerability reports.
- **Files.** `docs/PROOF.md`, `web/index.html`, `docs/SECURITY-REVIEW.md`, `SECURITY.md` (new), `README.md` (link).
- **Lifts.** Judge (the wording error is what a careful judge finds first). The CISO contact protects the 8 and does not raise it.
- **Acceptance check.** `grep -rn "opened the token" docs web README.md` returns nothing. `docs/SECURITY-REVIEW.md` has a contact. A test checks that `SECURITY.md` exists. The blameless copy check passes.

### 4. Noise worked example in `docs/census/RESULTS.md`

- **What to change.** Copy a few exorcised rows with their reasons from the page into the census results, and link the headline noise number to them.
- **Files.** `docs/census/RESULTS.md`, `docs/BUSINESS.md`.
- **Lifts.** AppSec.
- **Acceptance check.** Each row's package, version, EPSS and reason can be reproduced with a documented command.

### 5. One outside maintainer or team runs the Action or `npx` (human)

- **What to change.** Ask one maintainer outside the e-1305 account to run it and post the result. Record the link in `docs/PLAYTEST_LOG.md`.
- **Files.** `docs/PLAYTEST_LOG.md`, `docs/BUSINESS.md` section 5.
- **Lifts.** Maintainer, VC.
- **Acceptance check.** A public link to the result. `npm run traction` shows a non-zero value for downloads, stars or Action users, from an account that is not e-1305.

### 6. Observed Dependabot run plus a second, outside repo in the comparison (human)

- **What to change.** Enable Dependabot security updates on `e-1305/crypt-demo`, record the PRs it opens (links, date). Add one public repository the project does not own to `docs/VS-DEPENDABOT.md` with its commit. Mark what was not run as "not compared".
- **Files.** `docs/VS-DEPENDABOT.md`, `fixtures/` (new snapshot), `scripts/compare-dependabot.ts` (paths only), `tests/compare-dependabot.test.ts`.
- **Lifts.** Maintainer.
- **Acceptance check.** The page links real Dependabot PRs. `npm run compare:dependabot -- --check` exits 0 for both repositories. Every number traces to a command or link.

### 7. Action job summary screenshot and digest snippet from a real run (human)

- **What to change.** Run the Action in a scratch repo, add the job summary screenshot and elapsed time, and add a Slack or Teams workflow step that uses `crypt gazette --send`. Label anything not run "untested".
- **Files.** `docs/INSTALL-ACTION.md`, `docs/INTEGRATIONS.md`, `README.md` (link).
- **Lifts.** Engineering manager.
- **Acceptance check.** A test parses the YAML in the doc. A link to the real run and a screenshot of its summary exist.

### 8. A hook line from one of the repository's own hooks (human)

- **What to change.** Open the repository as the workspace root in the Kiro IDE or CLI, or run `kiro-hooks.yml` with `KIRO_API_KEY`. Commit only unedited wrapper output. If nothing fires, keep "configured, not demonstrated" for those hooks.
- **Files.** `docs/evidence/hook-runs.jsonl`, `docs/KIRO.md`. Per `tech.md`, do not run `kiro:stats --write` in the PR. The `stats` workflow regenerates the numbers on `main`.
- **Lifts.** Judge.
- **Acceptance check.** After the `stats` workflow runs, "Hook runs recorded in a real Kiro session" is at least 2, with a line whose `hook` is one of the 7 repository hooks.

### 9. One outside security team loads the OCSF file and writes the result (human)

- **What to change.** Offer `alerts.ocsf.json` and `docs/SOC.md` to one SOC or detection-engineering team (Security Lake, Splunk or Sentinel). Record their written result, pass or fail with the error, in `docs/PLAYTEST_LOG.md`. Fix what fails.
- **Files.** `docs/PLAYTEST_LOG.md`, `docs/SOC.md`, `docs/BUSINESS.md` (the "Not yet confirmed loading in a customer SIEM" row).
- **Lifts.** SOC.
- **Acceptance check.** A dated entry with the team's own words (with their permission) and the SIEM named. Until then the docs say "not tested in a real SIEM", which they do today.

### 10. Fresh sample and version in `docs/SOC.md`, "as of" dates in the export

- **What to change.** Regenerate the sample event from one documented run with feeds, so product version and `severity_id` match what prints. Add the feed dates to the CSV and JSON export if missing (not checked this round).
- **Files.** `docs/SOC.md`, `src/web/report-export.ts`, `tests/soc-runbook.test.ts`.
- **Lifts.** None. It protects the SOC and VOC ceilings of 8 and does not raise a grade.
- **Acceptance check.** A test compares the sample's field names and values with the output of the documented run. The export contains the feed dates.

## Not fixable by docs or small code, and why

- A customer, revenue, a download count, stars and Action users outside the org are facts about the world. The repository has 0 stars and 0 forks today. The VC grade moves only when those change. The VC persona cannot reach 10 in this round.
- A SOC analyst's judgment that dependency findings belong in their queue comes from a SOC practitioner. The SOC persona cannot reach 10 without one and without a SIEM load.
- Reachability is not available from a lockfile. The AppSec persona stops below 10 for any lockfile tool.
- SSO, tenancy, retention, an independent audit and a support contract are excluded before the freeze. The CISO persona stops below 10 until they exist, or until a real bank approves the tool as it is.
- The video, the GIF and a hook fired from the repository's own hooks need a person, a recording tool and a Kiro environment. The judge, voter and recruiter personas wait on these.
- History (ageing and trend) is Tier 2. The VOC persona stops at 8 unless the owner approves a Tier 2 feature.
- The 3D bench, sound and Lighthouse are "not verified" in the project's own text and need real hardware, which this review did not use.

Of the ten, none can honestly reach 10 before 2026-11-27. The realistic maximum before the freeze, if every **product** item and every human step above is done, is roughly: judge 9, CISO 8, SOC 8, VOC 8, maintainer 9, AppSec 8, engineering manager 8, voter 9, VC 7, recruiter 9. These ceilings are the reviewer's estimate.
