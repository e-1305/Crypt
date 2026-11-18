# Review round 3: grades and fixes

Written 2026-11-18 (the sandbox clock on the day of the run). Same 10 personas as [round 1](round-1.md) and [round 2](round-2.md), same method as [personas.md](personas.md). Outsider view only. The grades are the reviewer's judgment, not measurements. A 10 means a judge would put CRYPT in first place. Nobody here would, yet.

## What was judged

- The live site, https://e-1305.github.io/Crypt/. `/`, `war-room.html`, `graveyard/graveyard.html`, `manual.html`, `autopsy.html` and `/?judge=1` all returned HTTP 200 to `curl`. The landing page text was read from the fetched HTML. The deployed `live-exhume.js` is byte-identical in size to the local build (12,791 bytes both), so the live site carries the SLA column, the CSV and JSON export and the exorcised list code.
- A local build: `npm ci` and `npm run build:site` both exit 0 and write 20 gallery creatures plus the demo. `npm test`: 73 test files passed, 1,119 tests passed, 4 skipped.
- The published package: `npm view @e-1305/crypt` reports version 0.1.0, dist-tag `latest`, last modified 2026-11-18T20:38:32Z. I ran `npx @e-1305/crypt --help` and `npx @e-1305/crypt alerts --format ocsf` in an empty directory.
- The local CLI (`node bin/crypt.mjs`) on `fixtures/crypt-demo` with the feed snapshot from `fixtures/vulnerable-npm/feeds`, `--offline`: `exhume` reported 7 dependencies, 5 findings, 2 limbs spawn. `alerts --format ocsf` wrote 2 events (class 2002). `alerts --format issues` printed a dry run of 1 issue, `[CRYPT] KEV: jquery 3.4.1`, with 2 CVEs, the 48-hour line and the graft command.
- `npm run traction`, quoted as printed in the section "Traction" below.
- `docs/evidence/hook-runs.jsonl` (6 lines), `docs/KIRO.md`, `docs/SOC.md`, `docs/BUSINESS.md`, `docs/PROOF.md`, `README.md`, `docs/DEVPOST.md`, `docs/BLOG.md`, `docs/INSTALL-ACTION.md`, `docs/INTEGRATIONS.md`, `docs/PITCH.md`, `docs/WHO-PAYS.md`.
- Facts from the GitHub REST API: PR #1 on crypt-demo has `user` e-1305, `merged_by` e-1305, merged 2026-11-18T18:26:40Z.

What this review did not do: render the page in a browser, run WebGL, listen to sound, measure Lighthouse, run a live raid, load OCSF events into a real SIEM, or validate them against the OCSF schema. The phone figures come from the repository's own check (`scripts/ci/visual-qa.mjs`, lines 793 and 794), not from a measurement here.

## What changed since round 2

Checked and true:

- **Stale lines.** `README.md` no longer says "not published yet". `docs/DEVPOST.md` no longer lists publishing as open. `grep "not published yet"` finds nothing in either.
- **Plain pitch.** The live first screen opens with "CRYPT finds security holes that matter in your code's building blocks, opens one fix, and a person approves it." The README has an "In plain words" line. Round 2 fix 2 is done.
- **Hook run.** `docs/evidence/hook-runs.jsonl` now has 6 lines: 5 with trigger `manual` and 1 with `"hook":"failsafe-guard-on-stop-cloud"`, `"trigger":"Stop"`, exit 0, `failsafe-check: ok (10 files checked)`. `docs/KIRO.md` reports "Hook runs recorded in a real Kiro session: 1". The repository's own 7 hooks are still not observed firing (the document says so, and gives the workspace-layout inference as unproven).
- **Noise and SLA on the paste result.** The deployed script contains `exorcisedRows`, "exorcised findings and why", an SLA label per limb (`"SLA: " + slaOf(g)`), and `toCsv` and `toJson` imports. Round 2 fixes 4 and 5 are done in code. I did not click through them in a browser.
- **Phone.** `scripts/ci/visual-qa.mjs` line 794 now fails the build when the game input is more than 1,700 px down at 390 wide ("two screens"). In round 2 the limit was `vp.h * 3`. I did not measure the real distance.
- **SOC output.** `crypt alerts --format ocsf` and `--format issues` exist in the repository and work as described (see above). `docs/SOC.md` documents the field mapping and where the file goes (Security Lake, Splunk, Sentinel).
- **Business case.** `docs/BUSINESS.md` has a sourced table (Sonatype, CISA KEV), a labelled pricing hypothesis with four competitor pages read on 2026-11-18, a defensibility section that lists what is not hard to copy, and a traction section produced by a script.
- **Action and chat.** `docs/INSTALL-ACTION.md` describes the job summary and the `alerts` input. `docs/INTEGRATIONS.md` documents `crypt gazette` for Slack and Teams.

New problems found this round (each checked):

- **The SOC feature is not in the package people install.** `npx @e-1305/crypt --help` lists no `alerts` command. `npx @e-1305/crypt alerts --format ocsf` prints `crypt: unknown command 'alerts'. Run 'crypt --help' for usage.` Every command block in `docs/SOC.md` starts with `npx @e-1305/crypt alerts`, and the README "For a SOC" line points there. The Action runs from the repository (`npm ci` in `action.yml`), so the Action has it. The npm package does not, until a new version is published.
- **`docs/BUSINESS.md` contradicts the repository.** Line 34 says "OCSF export (SIEM format) Not built. No code or doc in this repository mentions it." Line 60 says "OCSF integration, once built". Line 83 lists building it as a future milestone. `docs/SOC.md` and `src` now have it.
- **`docs/INTEGRATIONS.md` line 37 contradicts the site.** It says "CSV export for spreadsheets is planned in #131 and is not available yet", while the deployed script builds CSV.
- **The traction script reports "not published" for a published package.** `npm run traction` printed:

  ```
  Traction as of 2026-11-18 (UTC)
  | npm downloads, last week (@e-1305/crypt) | not published | api.npmjs.org |
  | GitHub stars (e-1305/Crypt) | 0 | api.github.com |
  | GitHub forks (e-1305/Crypt) | 0 | api.github.com |
  | Public repos using the Action | not discoverable (GitHub code search needs a token) | GitHub code search |
  ```

  `curl https://api.npmjs.org/downloads/point/last-week/@e-1305/crypt` returns HTTP 404 with `{"error":"package @e-1305/crypt not found"}`, while `npm view` shows 0.1.0. The script maps that 404 to "not published" (`scripts/traction.ts` line 46), and `docs/BUSINESS.md` section 5 repeats it with the sentence "'Not published' means the registry answers that the package does not exist". The cause of the 404 (for example, a downloads API that has not indexed a package published that day) was not determined here. An outsider who runs `npm view` and then reads this table sees a contradiction.
- **Video is still a TODO.** `docs/DEVPOST.md` line 9: "Video: TODO add URL after upload". No GIF is referenced from the README.
- **Proof still does not say who merged.** The API shows PR #1 was opened and merged by the same account, e-1305. `docs/PROOF.md` and the site say "the repo owner" and "a human". `docs/PROOF.md` does not say it is the same account that opened the PR. Round 2 fix 8 is half done.
- **The SOC sample does not match a local run.** `docs/SOC.md` shows `severity_id` 3 and "Medium" for the jquery event. My offline run on the fixture wrote `severity_id` 0, "Unknown" for jquery. The doc labels its event SAMPLE DATA and states that severity is `0 Unknown` when there is no advisory severity, so this is not wrong, but the sample is not what a first run prints.
- **The SOC quickstart can write zero events.** `crypt exhume fixtures/crypt-demo --offline` with no feeds reported 0 limbs spawn and `alerts --format ocsf` printed "Wrote 0 OCSF Vulnerability Finding events". That is the fail-safe behaviour for missing feeds, but the doc does not tell a SOC reader that feeds are needed for any event to appear.

## Persona grades

| Persona | R1 | R2 | R3 | The one sentence they would say | Single biggest remaining blocker |
|---|---|---|---|---|---|
| 1. Kiroween judge | 6 | 7 | 8 | "There is now one hook line from a real Kiro session and the install works, but the video is still a TODO." | No video; 1 non-manual hook line, from a cloud hook rather than the repository's own hooks |
| 2. CISO at a large bank | 5 | 6 | 7 | "I can download a CSV and a JSON of a live result and an OCSF file, but I have no vendor-review pack and no named contact." | No SSO, tenancy, retention or support statement; SOC export not in the npm package |
| 3. SOC L1 analyst | 4 | 4 | 6 | "OCSF and a ticket per KEV limb are what I can ingest, but `npx` says unknown command and nobody has loaded it into a SIEM." | `alerts` missing from npm 0.1.0; no real SIEM has ingested the output |
| 4. VOC lead | 5 | 6 | 8 | "The 48-hour rule sits next to my ranked list and I can export it, but I cannot see ageing or a trend." | No history: no ageing, no trend (Tier 2, needs stored data) |
| 5. Open-source maintainer | 5 | 7 | 7 | "`npx` and Scan your repo work, but I still do not know what this opens that Dependabot does not." | No side-by-side against Dependabot on a real repo |
| 6. AppSec engineer | 5 | 5 | 7 | "I can open the list of what you hid and see why, and the page says lockfile only, but I still cannot tell if the code runs it." | No reachability signal (not feasible from a lockfile) |
| 7. Engineering manager | 4 | 6 | 7 | "Job summary, Slack and Teams digests exist on paper, but I see no screenshot of a real run and no first-run time." | No evidence of the Action or digest running on a real repo |
| 8. Game designer and Devpost voter | 6 | 6 | 7 | "The game is within two screens on my phone now, but there is no clip to share and the loop is short." | No video or GIF; no one-click share |
| 9. VC or acquirer | 3 | 4 | 5 | "The business case is sourced and honest, and it says no customer, no revenue, 0 stars and no download count." | No customer, no traction; moat stated as "not hard to copy" for the ranking rule and the data |
| 10. Recruiter, non-technical | 6 | 6 | 7 | "The plain-words line tells me what it is, but I have nothing to repost." | No 30-second clip |

**Overall grade: 6.9 / 10** (mean of the ten grades: 8+7+6+8+7+7+7+7+5+7 = 69). Round 2 was 5.7 and round 1 was 4.9, so this round gained 1.2.

The gain came from shipped features that answer the round 2 asks one by one (SLA and export, exorcised list, phone order, plain pitch, OCSF, issues, job summary, business case). What did not move are the things that need the real world: a video, a customer, a download, a confirmation from a SIEM team. One regression inside the gain: the newest features are not in the published package, and three docs contradict the code.

## Official Kiroween criteria

| Criterion | R1 | R2 | R3 | Why |
|---|---|---|---|---|
| Potential Value | 5 | 6 | 7 | The paste result now ranks, shows the SLA, exports and explains the noise. SOC and ticket outputs exist. The business case is sourced. Held back: no customer, 0 stars, lockfile only, and the SOC outputs are missing from the published package. |
| Implementation of Kiro | 6 | 6 | 7 | One non-manual hook line exists (trigger Stop, cloud hook), the 6 steering files, specs and agents are checkable, and the limits are written down. Held back: 1 real line out of 6, the repository's own 7 hooks were not observed firing, and steering auto-load is still unobserved. |
| Quality and Design | 7 | 7 | 8 | Gained: phone order with a two-screen limit in CI, an inspectable noise list, labelled samples, 1,119 passing tests. Lost back: BUSINESS.md, INTEGRATIONS.md and the traction output contradict reality, and the 3D bench, sound and Lighthouse are still "not verified" in the project's own text. |
| Frankenstein category fit | 8 | 8 | 8 | Unchanged. A 1979 VM drives 2026 agents, and four data sources become one creature. |

Mean of the four criteria: 7.5 (round 2: 6.75, round 1: 6.5).

## Path to 10 for every persona below 10

All ten are below 10. Each item is tagged **product** (code or docs we can ship before the 2026-11-27 freeze, in `.kiro/steering/product.md`) or **signal** (needs the real world: people, downloads, stars, quotes, a recording).

### 1. Kiroween judge (8)

- **product.** Remove the "TODO" line from `docs/DEVPOST.md` once a URL exists, and add a test that fails if it returns.
- **product.** Keep the claim size to what holds: "1 hook run recorded in a Kiro Web session (cloud hook, trigger Stop)", not "hooks are working". The text already says this. Keep it.
- **signal.** The 3:00 video from `docs/VIDEO.md`, with the simulated labels in frame.
- **signal.** At least one more non-manual line in `docs/evidence/hook-runs.jsonl`, from the repository's own hooks in a desktop IDE or CLI session, or from the `kiro-hooks.yml` workflow (needs a `KIRO_API_KEY` secret). A second line of the same cloud hook adds little. A line from a repository hook is what changes the grade.
- **signal.** Observed evidence that steering files load automatically (a session transcript).

### 2. CISO at a large bank (7)

- **product.** One page, `docs/SECURITY.md` or a section in `docs/SOC.md`, that states what leaves the machine and the browser (the page says the pasted file stays on the device, and the CLI reads lockfiles and CODEOWNERS only), what is logged, a "not a compliance tool, no control mapping" line, and a contact. A CISO needs it to start a vendor review.
- **product.** Publish the next npm version so the export they were told about exists when they run it.
- **signal.** A named person or team who ran the vendor review and wrote down the result, and a retention and SSO answer that is true. `product.md` excludes building SSO and tenancy before the freeze, so a 10 is out of reach in this round. The honest ceiling for the freeze is 8.

### 3. SOC L1 analyst (6)

- **product.** Publish a version that has `alerts` (see fix 1), so the first command in `docs/SOC.md` runs.
- **product.** Make `docs/SOC.md` runnable from a clean state: show the feed step, state that missing feeds write zero events and exit with that message, and replace the sample with the real output of one documented run (including `severity_id` as printed).
- **product.** A test that checks each emitted OCSF event for the attributes `schema.ocsf.io/1.1.0/classes/vulnerability_finding` lists as required. This review did not validate against the schema, so a SIEM team can fairly ask for it.
- **product.** Add a line to `docs/SOC.md` on what triage looks like: the issue body, the owner team, the 48-hour clock, and the cap of 5 issues per run.
- **signal.** One security team loads `alerts.ocsf.json` into Security Lake, Splunk or Sentinel and writes down the result. `docs/BUSINESS.md` already names this as a milestone. Without it, this persona stays at 7.
- **signal.** A practitioner quote that dependency findings belong in their queue. A SOC analyst triages alerts, not lockfiles, and only a SOC practitioner can say the KEV subset is worth a ticket. Cap without it: 7.

### 4. VOC lead (8)

- **product.** An "as of" date and the feed dates on the export (check `src/web/report-export.ts` and add a test if missing).
- **product.** Ageing: the Tier 2 feature that stores a prior run and shows days open per limb. It needs stored history and is outside the freeze scope, so it is a product item only if the owner approves it as Tier 2. Without it the ceiling is 8.
- **signal.** One real VOC lead who tries the CSV against their tracker and says what column is missing.

### 5. Open-source maintainer (7)

- **product.** The Dependabot comparison on one real public repo, from a real run, with the date and commit. If the comparison cannot be run, write "not compared" in the doc.
- **product.** Show the one-PR-per-dependency rule next to a Dependabot PR on that repo.
- **signal.** One maintainer outside the e-1305 account who runs the Action or `npx` on their repo and posts the result (an issue, a star, a PR).

### 6. AppSec engineer (7)

- **product.** A worked example in `docs/census/RESULTS.md` that lists a few exorcised rows with their reasons, copied from the page, so the claim "95.2% noise" can be checked without running the site.
- **product.** Reword the headline claim as a question or a link ("236 of 248 sit below the noise line, see why") because this persona doubts the number first. The 236 of 248 figure is in `docs/BUSINESS.md` from the census.
- **signal.** A reachability signal. It is not possible from a lockfile alone, so a 10 is out of reach for this tool by design. Ceiling for this persona: 8, reached only with an honest "what lockfile-only cannot see" box that is already on the page.

### 7. Engineering manager (7)

- **product.** In `docs/INSTALL-ACTION.md`: a screenshot of the job summary from a real run in a scratch repo, the Slack or Teams digest step as a workflow YAML snippet (labelled "untested" if it was not run), and a measured first-run time from that scratch repo.
- **product.** A test that parses the YAML snippets in the doc.
- **signal.** One team outside the e-1305 org running the Action for a week, shown by `npm run traction` with a token (the script says it needs one).

### 8. Game designer and Devpost voter (7)

- **product.** The README top gets the GIF once it exists, plus a one-click share link on the creature card.
- **product.** Record the actual distance of the game input at 390x844 from the harness and set the limit in `scripts/ci/visual-qa.mjs` line 794 just above it, so the layout cannot drift back.
- **signal.** The 20 to 30 second clip, and a few real people playing it (the `docs/PLAYTEST_LOG.md` 7.7 score is from the authors' own personas).

### 9. VC or acquirer (5)

- **product.** Fix `docs/BUSINESS.md` so it matches the code (OCSF is built), and fix the traction output so "published, no download data yet" is not printed as "not published". A VC who spots one wrong row stops reading the rest.
- **product.** State the moat only as far as it holds: the trust model is enforced in code and CI (checkable), the ranking rule and the data are copyable (already stated). Do not add more.
- **signal.** Every item a VC wants is a signal: a paying customer or a signed design partner, a download count above zero from outside the team, stars, the Action in repositories outside the org, one written confirmation from a security team. `docs/BUSINESS.md` section 6 lists these. No amount of writing before 2026-11-27 reaches 10. The realistic ceiling this month is 6, from a first outside user and a non-zero download count.

### 10. Recruiter, non-technical (7)

- **product.** The Devpost page, README and site open on the same sentence (they do now: the sentence is identical in all three, per the fetched HTML, README and `docs/DEVPOST.md`).
- **signal.** The 30 second clip to repost. Nothing else in the way.

## Top 10 fixes

Ranking = estimated grade gain across personas divided by effort. Gain is the reviewer's estimate in grade points summed over the personas listed (an opinion, not a measurement). Effort: 1 = under 2 hours, 2 = half a day, 3 = a day or more. Fixes marked "human" need a person with an account, a recording tool or a real user. All respect the steering files and the 2026-11-27 freeze. None adds a Tier 2 or 3 feature.

| Rank | Fix | Est. gain / effort |
|---|---|---|
| 1 | Publish a new npm version that contains `alerts` (human) | 4.0 / 1 |
| 2 | Correct BUSINESS.md, INTEGRATIONS.md and the traction output | 2.0 / 1 |
| 3 | Record the video and a GIF, fill the Devpost link (human) | 3.5 / 2 |
| 4 | Say it was the same account that opened and merged PR #1 | 1.0 / 1 |
| 5 | Make SOC.md runnable from a clean state, add an OCSF attribute test | 2.0 / 1 |
| 6 | Action job summary screenshot and digest snippet from a real run (human) | 2.0 / 2 |
| 7 | Security and data-handling page for vendor review | 1.5 / 1 |
| 8 | Dependabot comparison on a real repo | 1.5 / 2 |
| 9 | A second non-manual hook line from a repository hook (human) | 1.5 / 2 |
| 10 | One outside security team loads the OCSF file and writes the result (human) | 2.5 / 3 |

### 1. Publish a new npm version that contains `alerts` (human)

- **What to change.** Bump `package.json` from 0.1.0 and publish with the account that owns `@e-1305`. Check `release.yml` for the existing publish path. Add a CI check that the README and `docs/SOC.md` commands exist in `--help` of the packed tarball.
- **Files.** `package.json`, `.github/workflows/release.yml`, `docs/RELEASE.md`, `tests/` (a pack-install test that runs `crypt alerts --help`).
- **Lifts.** SOC, CISO, engineering manager, VC, judge.
- **Acceptance check.** In an empty directory, `npx @e-1305/crypt@latest --help` lists `alerts`, and `npx @e-1305/crypt@latest alerts --format ocsf` after an `exhume` run exits 0 and writes `out/alerts.ocsf.json`. `npm view @e-1305/crypt version` is greater than 0.1.0.

### 2. Correct BUSINESS.md, INTEGRATIONS.md and the traction output

- **What to change.** In `docs/BUSINESS.md`: line 34 (OCSF built, link `docs/SOC.md`), line 60 (drop "once built"), line 83 (replace the milestone with the one that is still open: one team confirms the load). In `docs/INTEGRATIONS.md` line 37: CSV and JSON export exist in the paste result. In `scripts/traction.ts` line 46: when the downloads API says "not found" but `npm view` or the registry lists the package, print "published, no download data yet" instead of "not published". Re-run `npm run traction` and paste its real output in section 5.
- **Files.** `docs/BUSINESS.md`, `docs/INTEGRATIONS.md`, `scripts/traction.ts`, its test.
- **Lifts.** VC, SOC, VOC lead, judge (Quality and Design).
- **Acceptance check.** `grep -n "Not built" docs/BUSINESS.md` returns nothing. A test fails if `docs/BUSINESS.md` says OCSF is not built while `alerts --format ocsf` exists. `npm run traction` for a package that exists on the registry never prints "not published".

### 3. Record the video and a GIF, fill the Devpost link (human)

- **What to change.** The 3:00 video from `docs/VIDEO.md` and a 20 to 30 second GIF (graft, red CI rejection, SEAL CRYPT), with the simulated labels in frame. Link PR #1 and PR #2 in the description.
- **Files.** `docs/DEVPOST.md` (line 9), `README.md` (top), `docs/VIDEO.md`, `assets/video/`.
- **Lifts.** Judge, voter, recruiter, VC, engineering manager.
- **Acceptance check.** `docs/DEVPOST.md` contains no "TODO" and `tests/devpost-docs.test.ts` asserts it. The rendered README shows the GIF above the fold on GitHub (screenshot).

### 4. Say it was the same account that opened and merged PR #1

- **What to change.** Add two sentences to `docs/PROOF.md`, step 4, and the proof block on the site: PR #1 was opened by CRYPT through the e-1305 account's token and merged by the same account in the GitHub UI, and CRYPT has no merge call (link the test or file that enforces it). Keep praise wording and name no one in failure.
- **Files.** `docs/PROOF.md`, `web/index.html` (proof section), `README.md` (Proof line).
- **Lifts.** Judge, CISO, AppSec.
- **Acceptance check.** `docs/PROOF.md` names the account and the no-merge-call control with a link. The blameless copy check passes.

### 5. Make SOC.md runnable from a clean state and test the OCSF output

- **What to change.** In `docs/SOC.md`: add the feed step, a sentence that missing feeds mean zero events, and replace the sample event with the printed output of one documented run. Add a test that every event has the attributes the OCSF 1.1 class lists as required.
- **Files.** `docs/SOC.md`, `tests/` (OCSF test), `src/` OCSF writer (read only unless the test finds a gap).
- **Lifts.** SOC, CISO.
- **Acceptance check.** Copy each command block in `docs/SOC.md` into a clean checkout and get the output the doc shows. The new test passes.

### 6. Action job summary screenshot and digest snippet from a real run (human)

- **What to change.** Run the Action in a scratch repo, add the job summary screenshot and the elapsed time, and add a Slack or Teams workflow step that uses `crypt gazette --send`. Label anything not run "untested".
- **Files.** `docs/INSTALL-ACTION.md`, `docs/INTEGRATIONS.md`, `README.md` (link).
- **Lifts.** Engineering manager, maintainer, VOC lead, SOC.
- **Acceptance check.** A test parses the YAML in the doc. A link to the real run and a screenshot of its summary exist.

### 7. Security and data-handling page for vendor review

- **What to change.** One page: what is read (lockfile, CODEOWNERS), what is sent (OSV lookups of package names and versions, per the code), what stays on the device (an imported report), what is logged, no SSO or tenancy, not a compliance tool, a contact. Every statement must match a file or test.
- **Files.** `docs/SECURITY.md` (new), `README.md` (link), `docs/WHO-PAYS.md`.
- **Lifts.** CISO, SOC, VC.
- **Acceptance check.** Each sentence cites a file or test path. A test checks that the page exists and is linked from the README.

### 8. Dependabot comparison on a real repo

- **What to change.** One public repo, what Dependabot opened and what `crypt exhume` ranks, both counts, the date and the commit, with limits (lockfile only, one repo, one day). If it cannot be run, "not compared".
- **Files.** `docs/census/` (new note), `README.md` (link), `docs/PITCH.md`.
- **Lifts.** Maintainer, VOC lead, AppSec.
- **Acceptance check.** Every number comes from a command or link in the note, and a reviewer can repeat it.

### 9. A second non-manual hook line from a repository hook (human)

- **What to change.** Run the repository as the workspace root in the Kiro IDE or CLI, or run `kiro-hooks.yml` with `KIRO_API_KEY`. Commit only the unedited wrapper output. If nothing fires, keep "configured, not demonstrated" for the repository's hooks and say so in `docs/DEVPOST.md`.
- **Files.** `docs/evidence/hook-runs.jsonl`, `docs/KIRO.md`.
- **Lifts.** Judge (Implementation of Kiro).
- **Acceptance check.** After `npm run kiro:stats`, the "Hook runs recorded in a real Kiro session" row is at least 2, with a line whose `hook` is one of the 7 repository hooks, plus an IDE or CLI screenshot.

### 10. One outside security team loads the OCSF file and writes the result (human)

- **What to change.** Offer `alerts.ocsf.json` and the doc to one SOC or detection-engineering team (Security Lake, Splunk or Sentinel). Record their written result, pass or fail with the error, in `docs/PLAYTEST_LOG.md`. Fix what fails.
- **Files.** `docs/PLAYTEST_LOG.md`, `docs/SOC.md`, `docs/BUSINESS.md` (milestone row).
- **Lifts.** SOC, VC, CISO.
- **Acceptance check.** A dated entry in `docs/PLAYTEST_LOG.md` with the team's own words (with their permission) and the SIEM named. If no team answers by the freeze, the doc says "not tested in a real SIEM", which it should say today.

## Not fixable by docs or small code, and why

- A customer, revenue, a download count, stars and Action users outside the org are facts about the world. `docs/BUSINESS.md` reports 0 stars, 0 forks and no download data. The VC grade moves only when those change.
- A SOC analyst's judgment that dependency findings belong in their queue comes from a SOC practitioner, not from this repository.
- Reachability is not available from a lockfile. The AppSec persona stops below 10 for any lockfile tool.
- SSO, tenancy and retention are excluded before the freeze by `product.md`. The CISO persona stops below 10 until they exist.
- The video, the GIF and a hook fired from the repository's own hooks need a person, a recording tool and a Kiro environment.
- The 3D bench, sound and Lighthouse are "not verified" in the project's own text and need real hardware, which this review did not use.
