# Review round 2: grades and fixes

Written 2026-11-19. Same 10 personas as [round 1](round-1.md), same method as [personas.md](personas.md). Outsider view only. The grades are the reviewer's judgment, not measurements. A 10 means a judge would put CRYPT in first place. Nobody here would, yet.

## What was judged

- The live site, https://e-1305.github.io/Crypt/, fetched on 2026-11-19. `/`, `war-room.html`, `graveyard/graveyard.html`, `manual.html` and `/?judge=1` all return HTTP 200. The landing page text was read from the fetched HTML. A local build (`npm run build:site`) was used to read `autopsy.html` and the script sources.
- `README.md`, `docs/DEVPOST.md`, `docs/BLOG.md`, `docs/KIRO.md`, `docs/PROOF.md`, `docs/WHO-PAYS.md`, `docs/BACKLOG.md`, `docs/INSTALL-ACTION.md`.
- External facts checked: `npm view @e-1305/crypt` reports version 0.1.0, published 2026-11-18. [crypt-demo PR #1](https://github.com/e-1305/crypt-demo/pull/1) is merged (lodash 4.17.15 to 4.18.1). [crypt-demo PR #2](https://github.com/e-1305/crypt-demo/pull/2) is closed and unmerged (the jquery sabotage).
- The steering files in `.kiro/steering/` as the rules every proposal is checked against.

What this review did not do: render the page in a browser, run WebGL, listen to sound, measure Lighthouse, or run the live raid. The phone layout numbers come from the repository's own harness and the orchestrator's note, not from a measurement here.

## What changed since round 1

Seen on the live site:

- The first screen now states the problem (248 findings, 95.2% noise, 84.7% without an owner), the proof (lodash to 4.18.1, CI green, merged by a human) and three buttons: "Watch it run (60 s)", "Play the creature", "Scan your repo".
- The Bench has links to the War Room, the Graveyard and a "CISO report (sample)". The graveyard 404 from round 1 is gone. The autopsy page carries "SAMPLE DATA" in its title and body, and the War Room carries "SIMULATED: a scripted raid on the crypt-demo creature. Nothing here is real."
- A "Proof: the real run" section links every step to a real GitHub page: PR #1, its green `test` check, the human merge, the reraise run, and PR #2 rejected with CI red.
- `npx @e-1305/crypt` exists on npm. A one-line GitHub Action is documented in `docs/INSTALL-ACTION.md`. `docs/WHO-PAYS.md` exists and cites only census numbers.
- The old "Real PRs, real CI" caption problem is handled by a rehearsal label ("Rehearsal (nothing leaves this page)" with a "See the real run" link).

Still true from round 1:

- The pitch sentence is unchanged and still uses "vulnerable dependency", "GRAFT" and "fix pull request" in one breath.
- `docs/DEVPOST.md` still says "Video: TODO add URL after upload". No GIF exists in the README.
- `docs/KIRO.md`: 0 hook runs recorded in a real Kiro session, 5 manual lines in `docs/evidence/hook-runs.jsonl`.
- No SLA column or export in the paste result (#131). No list of exorcised findings (#132). The paste result and CSV or JSON export code do not mention SLA or CSV (search of the built site scripts found none).

New problems found this round:

- `README.md` line 25 still says "If `npx @e-1305/crypt` reports that the package is not found, it has not been published yet". `docs/DEVPOST.md` line 44 still says "Publish `@e-1305/crypt` to npm (not published yet)". Both are now false.
- PR #1 was opened and merged by the same GitHub account (`e-1305`, from the REST API). The proof says "merged by a human". That is probably true, but an outsider cannot tell it from a person merging a bot's PR from their own token. `docs/PROOF.md` should say what the account is.
- The Bench drawer still contains the raid, import, Simulated CI, sound, 3D bench and gallery. The first screen is better, the page below it is still long.

## Persona grades

| Persona | Round 1 | Round 2 | The one sentence they would say | Single biggest remaining blocker |
|---|---|---|---|---|
| 1. Kiroween judge | 6 | 7 | "The proof chain and the install now work, but there is still no video and no hook that fired." | Devpost video is "TODO"; 0 hook runs in a Kiro session |
| 2. CISO at a large bank | 5 | 6 | "There is a sample report I can look at, but I cannot send it to a board or put it through vendor review." | No export of the live result; no SSO, tenant or retention story |
| 3. SOC L1 analyst | 4 | 4 | "Still not what I triage, and I still cannot feed it a queue." | No alert, ticket or webhook output; dependency findings are not their workflow |
| 4. VOC lead | 5 | 6 | "The 48-hour rule is in the report sample, but not next to my ranked list, and I cannot export it." | #131: no SLA column or CSV and JSON export in the paste result |
| 5. Open-source maintainer | 5 | 7 | "`npx` works and Scan your repo is zero setup, but show me what Dependabot would have opened on my repo." | No side-by-side against Dependabot; stale README line says the package is unpublished |
| 6. AppSec engineer | 5 | 5 | "Same as before: show me the 95.2% you hid and tell me what lockfile-only cannot see." | #132: noise not inspectable on the landing flow; no reachability |
| 7. Engineering manager | 4 | 6 | "A one-line Action and `npx` I can pilot, but there is still no Slack or Teams message." | No chat or PR-comment output; the Action's output is not shown on the site |
| 8. Game designer and Devpost voter | 6 | 6 | "Better first screen, but I still cannot share a clip, and the loop is short." | No video or GIF; the game input is far down the page on a phone |
| 9. VC or acquirer | 3 | 4 | "Now I can read who pays, and it says no one has. Public data and a simple rule." | No buyer, no customer, no moat beyond the safety design (stated in WHO-PAYS) |
| 10. Recruiter, non-technical | 6 | 6 | "I get 'a game that fixes security bugs' from the problem line, but the pitch sentence is still jargon and I have no clip." | Pitch sentence unchanged; no 30-second clip |

**Overall grade: 5.7 / 10** (mean of the ten grades: 7+6+4+6+7+5+6+6+4+6 = 57). Round 1 was 4.9, a gain of 0.8.

The gain came from real, checkable things: a package that installs, a proof chain with working links, hosted samples, and an Action. What did not move are the three things only a person can produce (a video, a hook run, a buyer) and the two features still open (#131, #132).

## Official Kiroween criteria

| Criterion | Round 1 | Round 2 | Why |
|---|---|---|---|
| Potential Value | 5 | 6 | Install works, a real PR was merged, and the pitch now leads with a problem and a number. Still no buyer, lockfile-only npm scope, no SLA export, and the noise cut is not inspectable. |
| Implementation of Kiro | 6 | 6 | Unchanged. 31 specs, 6 steering files, 7 hooks, 2 agents and an MCP server are checkable (`docs/KIRO.md`). Hook runs in a real Kiro session are still 0, and steering auto-load is still unobserved. The 7.7 self-score in `docs/PLAYTEST_LOG.md` is still the authors' own. |
| Quality and Design | 7 | 7 | Gained: the graveyard 404 is fixed, samples are labelled, the first screen has a clear order. Lost back: stale README and Devpost lines contradict the npm page, the game input sits near the 3-screens-down limit on a phone, and the 3D bench, sound and Lighthouse are still "not verified" in the project's own text. |
| Frankenstein category fit | 8 | 8 | Unchanged. A 1979 VM drives 2026 agents and four data sources become one creature. |

Mean of the four criteria: 6.75 (round 1: 6.5).

## The phone first screen

`scripts/ci/visual-qa.mjs` (line 761) fails the build when, at 390 wide, the game input is more than `vp.h * 3` pixels down, which is 2,532 px at 390x844. The orchestrator reports the input is about 2,500 px down, so the check passes with about 30 px to spare. That margin is the finding. A person on a phone sees the hero, three buttons, the paste plate, the Bench and the proof section before the game that the whole product is named after. Any new block above the input (an SLA table, an exorcised list, a banner) fails the check or forces someone to raise the limit, and raising a limit to fit a feature is how a layout rots. I did not measure this myself. Fixes 3 and 7 below respect the margin.

## Path to 9 for every persona below 9

All ten are below 9. For each: what would get them there, and whether small changes can.

### 1. Kiroween judge (7)

- **To 9.** (a) A Devpost video, 3:00 or less, from `docs/VIDEO.md`, with the simulated labels in frame. (b) At least one non-manual line in `docs/evidence/hook-runs.jsonl` from a desktop IDE or CLI session, shown on a screenshot. (c) The stale "not published yet" lines removed. (d) The Devpost page and README open on the same first sentence as the site.
- **Small changes enough?** The video and the hook run are small in effort but need a person with accounts and a recording tool, so they are "human". If the hook still does not fire, the judge stays at 8 at most, since "configured, not demonstrated" is the honest state.
- **If no hook ever fires.** Cut the hooks from the headline. Lead the Kiro story with specs and steering, which are checkable, and move hooks to "Limits". Cost: one edit to `docs/DEVPOST.md` and `docs/KIRO.md`. Risk: the judge sees a smaller Kiro surface, but a smaller claim that holds is worth more than a larger one that does not.

### 2. CISO at a large bank (6)

- **To 9.** A downloadable board-ready report from a live paste result (not only the sample), a one-page statement of what data leaves the browser (the page says the file stays on the device), a retention and audit-log statement, and a named contact. A CISO also needs a control-mapping line or a clear "not a compliance tool" line.
- **Small changes enough?** No. Reaching 9 needs vendor-review material (SSO, tenancy, retention, support), which `product.md` excludes before the freeze. Small changes reach 7.
- **Radical change.** Reposition from "product" to "reference design for safe agent remediation" for this persona, and say so on the CISO report page. Cost: copy only. Risk: it lowers the "buyer" story for the VC, who is already at 4.

### 3. SOC L1 analyst (4)

- **To 9.** Alert or ticket output (webhook, SARIF out, a CSV that a SIEM can ingest), and a use case that matches triage rather than patching.
- **Small changes enough?** No. SOC triage is not the product. Even with an export, dependency findings are not what this persona works from.
- **Radical change.** Remove this persona from the target list and say so in `docs/WHO-PAYS.md`. Cost: one paragraph. Risk: none for the hackathon, since no other persona depends on it. The honest answer is that this grade should stay at 4 and that is acceptable.

### 4. VOC lead (6)

- **To 9.** SLA rule per limb in the paste result (Possessed 48 hours, EPSS of 0.1 or more this sprint, others backlog), plus Download as CSV and JSON that match the CLI order (#131). Add a "no owner" column that states the CODEOWNERS gap without naming any person, and a dated "as of" stamp on the export.
- **Small changes enough?** Yes for 8. A 9 also needs ageing and a trend over time, which need stored history and are Tier 2. Without them this persona stops at 8.
- **Constraint.** #131 is a feature. It must land before 2026-11-27 or it is out. The phone margin applies, so the SLA column goes inside the existing result plate, not above the input.

### 5. Open-source maintainer (7)

- **To 9.** One worked comparison on a real repo: what Dependabot opened versus what CRYPT would open, with counts from a real run. Remove the stale "not published yet" line. Show the one-PR-per-dependency rule in a real PR (PR #1 already does).
- **Small changes enough?** Yes. The comparison needs a run, and any number in it must come from that run (no invented numbers). If no suitable repo is available, say "not compared".

### 6. AppSec engineer (5)

- **To 9.** A one-click list of the exorcised findings with the reason for each ("EPSS below 0.1, not in KEV"), and a plain line "Lockfile only. A finding means the locked version has an advisory, not that the code runs it." on the paste result (#132). The count shown plus exorcised must equal total findings.
- **Small changes enough?** Yes for 8. A 9 also needs a reachability signal, which is not feasible from a lockfile.
- **Radical change.** Change the noise number from a boast to a question. The first screen says "95.2% were noise". For this persona that is the claim to doubt. Reword to "236 of 248 findings sit below the noise line, see why" and link to the list. Cost: copy plus #132. Risk: a weaker headline for the voter.

### 7. Engineering manager (6)

- **To 9.** A Slack or Teams message example (a docs snippet using a webhook step in the Action workflow, nothing built into the product), a screenshot of the Action's job summary on a real run, and a stated time cost for the first run. State what the Action does not do (it merges nothing).
- **Small changes enough?** Yes for 8. A native chat integration is a new feature and out of scope after the freeze. A 9 therefore depends on the docs snippet being enough.
- **Check first.** Confirm `docs/INSTALL-ACTION.md` shows a job summary. If it does not, add one before anything else.

### 8. Game designer and Devpost voter (6)

- **To 9.** A 20 to 30 second GIF at the top of the README and a one-click share link. A first screen that shows the game, not three plates of text, on a phone.
- **Small changes enough?** The GIF is human. The phone layout is the real problem: see "The phone first screen". Reaching 9 probably needs the game input above the proof section on small screens.
- **Radical change.** On phones, make the game the first screen and move the problem and proof plates below it. Cost: CSS order and a re-run of `scripts/ci/visual-qa.mjs`, about half a day. Risk: the hero tests in that script assert the hero height (55% of the viewport) and the first-screen order, so tests change with it. That is a copy and layout change, allowed after the freeze.

### 9. VC or acquirer (4)

- **To 9.** A paying customer or a signed design partner, and a defensibility story beyond public data and a published rule.
- **Small changes enough?** No, and no change before the deadline can fix this. `docs/WHO-PAYS.md` is honest ("no customer has paid"), which is the most that can be done.
- **Radical change.** Stop pitching this persona. Position CRYPT as a craft and safety-design showcase, as round 1 concluded. Cost: remove any investor-flavored line. Risk: none for judging. A 4 to 5 is the realistic ceiling.

### 10. Recruiter, non-technical (6)

- **To 9.** The pitch sentence rewritten without "dependency", "pull request" and "GRAFT" on first use ("Your software is built from other people's code. CRYPT shows the risky parts as a creature and helps you fix them, with a person approving every change."), and a 20 to 30 second clip to repost.
- **Small changes enough?** Yes. This is round 1 fix 3 and 6, still not done.
- **Constraint.** The `blameless.md` rule applies: state actions, not prohibitions.

## Top 10 fixes

Ranking = estimated grade gain across personas divided by effort. Gain is the reviewer's estimate in grade points summed over the personas listed (an opinion, not a measurement). Effort: 1 = under 2 hours, 2 = half a day, 3 = a day. Fixes marked "human" need a person with an account or a recording tool. All respect the steering files and the 2026-11-27 feature freeze. Fixes 4 and 5 are features and have to land before it.

| Rank | Fix | Est. gain / effort |
|---|---|---|
| 1 | Remove the stale "not published yet" lines | 1.5 / 1 |
| 2 | Rewrite the pitch sentence for non-experts | 2.5 / 1 |
| 3 | Record the video and a GIF, fill the Devpost link (human) | 3.5 / 2 |
| 4 | SLA column and CSV and JSON export in the paste result (#131) | 3.0 / 2 |
| 5 | Inspectable noise filter and the lockfile-only line (#132) | 2.5 / 2 |
| 6 | Record one real hook run, or cut the hook claim (human) | 1.5 / 2 |
| 7 | Phone: game input earlier on small screens | 2.0 / 2 |
| 8 | Say who merged PR #1 and what the proof does and does not show | 1.0 / 1 |
| 9 | Slack or Teams snippet and Action job summary in the docs | 2.0 / 1 |
| 10 | Dependabot comparison on a real repo, from a real run | 1.5 / 2 |

### 1. Remove the stale "not published yet" lines

- **What to change.** Delete the "If `npx @e-1305/crypt` reports that the package is not found..." paragraph and the "(not published yet)" bullet. Put the npm package first in the README Install section and state version 0.1.0 only if a test or script reads it from `package.json`.
- **Files.** `README.md` (line 25), `docs/DEVPOST.md` (line 44, "What is next"), `docs/RELEASE.md` if it says the same, `tests/devpost-docs.test.ts` (add an assertion).
- **Lifts.** Judge, maintainer, engineering manager, AppSec.
- **Acceptance check.** `grep -rn "not published yet" README.md docs/` returns nothing, and a test fails if the phrase returns. In a clean container `npx @e-1305/crypt --help` exits 0 (paste the output).

### 2. Rewrite the pitch sentence for non-experts

- **What to change.** Replace the sentence under "The first vulnerability report you can play" with plain words, keep the "dry run" label and the human-merge wording. This was round 1 fix 3 and was not done.
- **Files.** `web/index.html` (`#pitch`, `#theatre-caption`, `<meta name="description">`), `web/copy.js`, `README.md`, `docs/DEVPOST.md`.
- **Lifts.** Recruiter, voter, VC, CISO.
- **Acceptance check.** Screenshots of `/` at 1440x900 and 390x844 show the new line above the fold, not clipped. The blameless copy check and the no-em-dash check pass. Report any reader test only if it was run.

### 3. Record the video and a GIF, fill the Devpost link (human)

- **What to change.** Record the 3:00 video from `docs/VIDEO.md` and a 20 to 30 second GIF of the graft, the red-CI rejection and SEAL CRYPT, with the simulated labels in frame. Link the real PR #1 and #2 pages in the video description.
- **Files.** `docs/DEVPOST.md` (line 9), `README.md` (top), `docs/VIDEO.md`, `assets/video/`.
- **Lifts.** Judge, voter, recruiter, VC.
- **Acceptance check.** `docs/DEVPOST.md` contains no "TODO", and `tests/devpost-docs.test.ts` asserts it. A screenshot of the rendered README shows the GIF above the fold on GitHub.

### 4. SLA column and CSV and JSON export in the paste result (#131)

- **What to change.** Show the SLA rule from `sla-policy.md` next to each limb, and add Download as CSV and Download as JSON from the same ranking code, with the "as of" date and the dry-run label. No owner is shown next to a failure.
- **Files.** `web/live-exhume.js`, `web/import.js`, `web/index.html`, `src/exhume/rank.ts` (read only), `web/war-room/war-room.js`.
- **Lifts.** VOC lead, CISO, engineering manager.
- **Acceptance check.** A test parses the CSV for the demo creature and finds the same order as `crypt exhume`. Screenshots at 1440x900 and 390x844 show the SLA column and buttons, and `scripts/ci/visual-qa.mjs` still passes without raising the 3-screens limit.

### 5. Inspectable noise filter and the lockfile-only line (#132)

- **What to change.** Add a one-click list of exorcised findings with the reason for each, and the line "Lockfile only. A finding means the locked version has an advisory, not that the code runs it." Unknown limbs stay shown as unknown.
- **Files.** `web/live-exhume.js`, `web/index.html`, `src/exhume/rank.ts` (data, no logic change), `docs/census/RESULTS.md` (link).
- **Lifts.** AppSec, CISO, SOC, maintainer.
- **Acceptance check.** A test confirms every exorcised row has a reason and that shown plus exorcised equals the finding count. A screenshot shows the list expanded.

### 6. Record one real hook run, or cut the hook claim (human)

- **What to change.** Open the repository as workspace root in the Kiro IDE or CLI, edit a file that matches a hook filter, and commit the line the tool reports. If it does not fire, document that in `docs/KIRO.md` and move hooks out of the headline. Do not hand-write a non-manual line. A cloud hook attempt may also follow, and it counts only if the trigger is not `manual`.
- **Files.** `docs/evidence/hook-runs.jsonl`, `docs/KIRO.md` (Limits), `docs/DEVPOST.md`.
- **Lifts.** Judge (Implementation of Kiro).
- **Acceptance check.** After the stats workflow runs on `main`, the "Hook runs recorded in a real Kiro session" row in `docs/KIRO.md` is greater than 0 and a screenshot of the IDE shows the run. Or, if it fails, the headline no longer claims hooks and `docs/KIRO.md` says why.

### 7. Phone: game input earlier on small screens

- **What to change.** At 390 wide, reorder so the game input comes before the proof section, or shorten the plates above it. Do not raise the `vp.h * 3` limit.
- **Files.** `web/style.css`, `web/index.html`, `scripts/ci/visual-qa.mjs` (tighten the limit after the change, line 761).
- **Lifts.** Voter, recruiter, judge (Quality and Design).
- **Acceptance check.** The harness reports the input's distance down at 390x844. Record the real figure, and set the limit just above it. The hero stays under 55% of the viewport (line 760).

### 8. Say who merged PR #1 and what the proof does and does not show

- **What to change.** Add two sentences to `docs/PROOF.md` and the proof section: the account that opened PR #1 is the same account that merged it, what that account is, and that CRYPT has no merge call (code and CI enforce it, per the safety section). Keep praise wording ("merged by") and name no one in failure.
- **Files.** `docs/PROOF.md`, `web/index.html` (proof section), `docs/WHO-PAYS.md`.
- **Lifts.** Judge, CISO, AppSec.
- **Acceptance check.** `docs/PROOF.md` states the account and the control that stops CRYPT merging, with a link to the test or file. The blameless copy check passes.

### 9. Slack or Teams snippet and Action job summary in the docs

- **What to change.** Add a documented workflow step that posts the ranked list to a chat webhook, and a screenshot of the Action's job summary from a real run. State that no integration is built in, and that the Action merges nothing.
- **Files.** `docs/INSTALL-ACTION.md`, `docs/INTEGRATIONS.md`, `README.md` (link).
- **Lifts.** Engineering manager, maintainer, VOC lead, SOC.
- **Acceptance check.** A test asserts the YAML in the doc parses. The example run in a scratch repo goes green, and a link or screenshot shows the summary. If the chat step is untested, label it "untested".

### 10. Dependabot comparison on a real repo, from a real run

- **What to change.** Pick one public repo, record what Dependabot opened on it and what `crypt exhume` ranks, and put the two counts side by side with the date and the commit. State the limits (lockfile only, one repo, one day).
- **Files.** `docs/census/` (new short note) or `docs/PITCH.md`, link from `README.md`.
- **Lifts.** Maintainer, VOC lead, AppSec.
- **Acceptance check.** Every number in the note comes from a command or a link in the note. A reviewer can repeat it. If it cannot be run, the doc says "not compared".

## Not fixable by docs or small code, and why

- SOC fit, a buyer, a customer and a moat need work and time that `product.md` excludes before the freeze. They stay as stated limits in `docs/WHO-PAYS.md`.
- Hook runs in a real Kiro session depend on the Kiro environment, not on this repository. The Free plan has no API key. A cloud attempt may be made, and until a non-manual line exists the honest state is "configured, not demonstrated".
- The 3D bench, sound and Lighthouse are "not verified" in the project's own text. They need a GPU, audio and a live audit on real hardware, which this review did not do.
