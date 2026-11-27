# CRYPT, Devpost entry

Tagline (111 chars, limit 200): CRYPT finds security holes that matter in your code's building blocks, opens one fix, and a person approves it.

## Links
- Repo: https://github.com/e-1305/Crypt · product docs: [PRFAQ](PRFAQ.md), [competitors](COMPETITORS.md), [metrics](METRICS.md), [RICE roadmap](ROADMAP.md#5b-rice-scoring-next-quarter), [interview guide](INTERVIEWS.md)
- Live site: https://e-1305.github.io/Crypt/
- Demo repo: https://github.com/e-1305/crypt-demo
- Video: VIDEO_URL_PENDING (shot list in [review/round-5.md](review/round-5.md), pitch in [PITCH.md](PITCH.md))

## For the judges, criterion by criterion
**Potential Impact.** In the [census](census/RESULTS.md) of 20 popular projects (lockfile only, not a random sample), 248 findings were cut to 3 monsters, 95.2% were exorcised as noise, and 84.7% of 11,244 limbs have no CODEOWNERS owner. Who would pay is labelled as opinion, with no market size claimed, in [WHO-PAYS.md](WHO-PAYS.md).
**Technological Implementation.** Work is split between a read and write agent (Necromancer, no shell, no web) and a read only agent (Inquisitor), described under [Custom agents](KIRO.md#custom-agents). Fail-safe rules are enforced by the [CI guard jobs](KIRO.md#ci-guard-jobs) and by hooks, with the rest of the Kiro setup under [Hooks](KIRO.md#hooks) and [Property-based tests](KIRO.md#property-based-tests). The [steering files](KIRO.md#steering) act as governance policy: the same rules load in every session for every agent, and the `failsafe-guard` CI job applies them to pull requests, which is how a team can roll Kiro out safely.
**Design.** The [live site](https://e-1305.github.io/Crypt/) shows each project as a creature, with a 3D bench and a 2D fallback, and [ACCESSIBILITY.md](ACCESSIBILITY.md) lists what was measured and what was not yet measured. A 15-item [security audit](SECURITY-AUDIT.md) records its findings and the PRs that fixed them. CRYPT is CI/CD-native: `crypt init` opens one PR with a read-only report-mode workflow ([INSTALL-ACTION.md](INSTALL-ACTION.md#what-report-mode-does)), and SARIF lands in GitHub Code Scanning ([PROOF.md](PROOF.md#sarif-in-github-code-scanning)).
**Innovation.** The report is a playable Z-machine game (a 1979 VM, written in Inform 6) whose GRAFT command prepares a fix, a dry run by default. Real PRs are opened only from the CLI with `crypt raid <url> --live`, and each dependency becomes one limb of the creature ([DEVPOST.md, What it does](#what-it-does)).
**Presentation.** The chain is a scan, a PR, CI, a person landing it, then `crypt reraise` showing HEALED, as described in [DEMO.md](DEMO.md) and run on the [demo repo PR](https://github.com/e-1305/crypt-demo/pull/1). The video is recorded (under two minutes, script in [VIDEO.md](VIDEO.md)); its link (VIDEO_URL_PENDING above) is added on upload. Pitch in [PITCH.md](PITCH.md).
**Limit.** Kiro CLI was not used (Free plan, no API key): the CI workflow that would call it is ready but has not run, per [KIRO.md Limits](KIRO.md#limits), and API key use needs a paid plan per [ATTRIBUTION.md](ATTRIBUTION.md).

## Who uses it and who pays
Users: vulnerability management / VOC teams, AppSec, OSS maintainers. Opinion: the buyer is the security org that owns remediation SLAs. CRYPT is free today and no market size is claimed. The wedge, from the [census](census/RESULTS.md): 84.7% of limbs have no CODEOWNERS owner, and 95.2% of findings were filtered as noise. Hard to copy (opinion): the human-in-the-loop trust model enforced in code and CI, deterministic ranking, and the playable report. Details and sources: [WHO-PAYS.md](WHO-PAYS.md). Market, pricing hypothesis and real traction (none yet): [BUSINESS.md](BUSINESS.md).

## Proof on a real repository
- [crypt-demo PR #1](https://github.com/e-1305/crypt-demo/pull/1): lodash 4.17.15 to 4.18.1, opened by CRYPT, CI green, merged by the repo owner with GitHub's Merge button (CRYPT has no merge call). One demo repo, lockfile-level finding, not reachability.
- [crypt-demo PR #2](https://github.com/e-1305/crypt-demo/pull/2): sabotage, CI red, rejected and closed.

## For teams (what shipped for the people who would run it)
- **Install:** `npx @e-1305/crypt raid <repo>` (npm 0.2.0), or `crypt init` to open one onboarding pull request (workflow in report mode plus a CODEOWNERS draft with team placeholders).
- **Triage:** the noise line (95.2% of census findings exorcised), a reason for every hidden finding, and a static import label per npm package: imported directly, only through another package, dev only, or unknown. Static check of imports, not a proof that the vulnerable code runs.
- **Outputs:** SARIF 2.1.0 to GitHub Code Scanning (the self-test uploads it on every run), OCSF 1.1 Vulnerability Findings for Security Lake, Splunk or Sentinel, one GitHub issue per actively exploited (KEV) limb, CSV and JSON with the 48-hour SLA column.
- **Reporting:** run history with age per limb, deadline breaches and mean time to heal in the War Room and the CISO report.
- **Buyer page:** `/for-teams.html` with a two-week read-only pilot, an ROI figure labelled ESTIMATE with its formula, a pricing hypothesis and a design-partner form.
- **Traction, honestly:** about 177 npm downloads in the week of 2026-11-12 to 11-18 (api.npmjs.org; downloads include mirrors and CI, so they are not users), no customer and no design partner yet.

## Inspiration
Every app is a Frankenstein of strangers' code. Scanners print a list that nobody reads. We wanted the list to be something you play, with a safety story a security team can accept.

## What it does
CRYPT turns a lockfile into a creature: one limb per dependency, rotting if vulnerable, possessed if CISA KEV lists it. You play a Z-machine text adventure and type `GRAFT JQUERY`. CRYPT writes the fix as a pull request. By default that is a dry run: a payload file, nothing sent. `SEAL CRYPT` blocks every graft. A person lands every pull request.

The page is a rehearsal and sends nothing. Only the CLI (`crypt raid <url> --live`) can open a real pull request on [crypt-demo](https://github.com/e-1305/crypt-demo), and a human lands it before `crypt reraise` shows HEALED.

Three pillars, paraphrased. Mary Shelley, *Frankenstein* (1818): every rotting limb gets a named surgeon from CODEOWNERS. Nadya Bartol, TED@BCG (2021): rot belongs to the package, never to a person. Saltzer and Schroeder, "The Protection of Information in Computer Systems" (1975): safe defaults and least privilege, so the Necromancer writes, the Inquisitor verifies, a human merges, at most 5 PRs per raid, one dependency each.

## How we built it with Kiro
Specs first. Counts: <!-- stats:start -->31 specs in `.kiro/specs/`, 8 steering files, 7 hooks, 4 custom agents and 1469 tests (passed plus skipped, `npx vitest run`; counted by `npm run kiro:stats`)<!-- stats:end -->. The agents are the Necromancer and the Inquisitor, in `.kiro/agents/`; hooks are in `.kiro/hooks/` and steering in `.kiro/steering/`. A bridge ([bridge-v2](../.kiro/specs/bridge-v2/requirements.md)) watches the game transcript for `[[CRYPT ...]]` markers and drives the agents. See [KIRO.md](KIRO.md). Limits: the repository hooks were not seen firing in Kiro Web (saving matching files wrote no line), but a cloud hook configured in Agent Config did fire once (`failsafe-guard-on-stop-cloud`, Stop, 2026-11-18T21:15:44Z, in `docs/evidence/hook-runs.jsonl`); we did not measure time saved. Where Kiro surprised us: big sessions stalled, so we moved to one small issue per change (two or three files plus a test), which is how the 7 security-audit failures got fixed; our own steering test blocked one of our PRs; and the read-only Inquisitor rejected the sabotaged PR on red CI. Details with links: [KIRO.md, Where Kiro surprised us](KIRO.md#where-kiro-surprised-us).

## Challenges
- A game must not be able to trick the watcher. Only markers the story prints count; typed text never does.
- Keeping the 3D bench optional. WebGL2 failure, reduced motion and high contrast all land on a full 2D page.
- Not verified: no real GPU run, no audio test, no live Lighthouse score. axe-core on the 2D page was run in a headless browser (see [ACCESSIBILITY.md](ACCESSIBILITY.md)).

## Accomplishments
- Census ([docs/census/RESULTS.md](census/RESULTS.md), scan 2026-11-17, rerun with `npm run census`): across 20 popular open-source projects, the filter cut 248 findings to 3 monsters. 95.2% were exorcised as noise, 0 were possessed, 84.7% of 11,244 limbs have no CODEOWNERS owner. Limits: lockfile only, no reachability, 20 popular projects, not a random sample.
- Tests: <!-- stats:start -->31 specs in `.kiro/specs/`, 8 steering files, 7 hooks, 4 custom agents and 1469 tests (passed plus skipped, `npx vitest run`; counted by `npm run kiro:stats`)<!-- stats:end -->.

## What we learned
Putting safety rules in steering files and tests made them cheap to keep. A judge persona and a product manager persona, run in a loop over the live page ([PLAYTEST_LOG.md](PLAYTEST_LOG.md)), found problems that unit tests did not (the prompt sat 1500 px down the page).

## What is next
- Re-check on real hardware: GPU frame rate, sound, Lighthouse.
- Beyond Tier 1: only npm and pip lockfiles are supported today.

## Category
Frankenstein. A 1979 Z-machine VM with no network drives 2026 AI agents through a game transcript, and four data sources (OSV, CISA KEV, FIRST EPSS, CODEOWNERS) are stitched into one creature.

## Built with
TypeScript, Node 20, Inform 6, dfrotz, ZVM (browser Z-machine), three.js, OSV, CISA KEV, FIRST EPSS, CODEOWNERS, Kiro, vitest and fast-check.
