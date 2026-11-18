# Review round 1: the 10 personas

Status: round 1, written 2026-11-18 from the outside view only. Grades and quotes are the reviewer's judgment, not measurements and not real people's words.

## What was judged

Only what an outsider sees:

- The live site, https://e-1305.github.io/Crypt/, fetched on 2026-11-18: the landing page HTML, `?judge=1`, `war-room.html`, `manual.html`.
- `README.md`, `docs/DEVPOST.md`, `docs/VIDEO.md`, `docs/BLOG.md`, plus the figures they cite (`docs/census/RESULTS.md`, `docs/KIRO.md`, `docs/PLAYTEST_LOG.md`).
- The steering files in `.kiro/steering/` (blameless, failsafe, paste-flow, product, sla-policy, tech) as the rules every judgment is checked against.

What this review did not do: render the page in a browser, run WebGL, listen to sound, or run the live raid. Statements about the 3D bench come from the repository's own docs and are marked "per the docs". Where a page was missing from the live site, that is reported as found.

Facts found while fetching, used by several personas:

- Landing page title line: "The first vulnerability report you can play". Pitch: "Each vulnerable dependency is a limb on a creature, and you heal it by typing GRAFT, which writes a fix pull request for a human to review and land."
- One primary button: "Paste your GitHub repo" (public repo, npm `package-lock.json` only). Everything else (raid, import, Simulated CI, gallery) sits in a collapsed "Bench" drawer.
- `?judge=1` returns the same page (HTTP 200). In the source, judge mode is a 45-second scripted demo.
- `war-room.html` is live and labelled "SIMULATED: a scripted raid on the crypt-demo creature. Nothing here is real." The landing page HTML contains no link to it.
- `graveyard/` and `graveyard/graveyard.html` return 404 on the live site on this date, although `scripts/build-site.ts` builds them and PR #116 is merged. The landing page HTML has no link to it either.
- There is no hosted autopsy sample. The autopsy exists as a CLI command (`scripts/cli/autopsy.ts`) and a PNG (`docs/img/autopsy.png`). `README.md` does not mention it.
- `@e-1305/crypt` is not published to npm (README and DEVPOST say so), yet the first code block in the README is `npx @e-1305/crypt raid ...`.
- `docs/DEVPOST.md` still has "Video: TODO add URL after upload".
- `docs/KIRO.md`: 0 hook runs recorded in a Kiro session. All 5 lines of `docs/evidence/hook-runs.jsonl` are by-hand runs.
- Census (`docs/census/RESULTS.md`, scan 2026-11-17): 20 projects, 11,244 limbs, 248 findings, 3 spawned, 0 possessed, 84.7% of limbs without a CODEOWNERS owner. Lockfile only, popular projects, not a random sample.
- `docs/PLAYTEST_LOG.md`: the earlier 7.7 mean is a self-assessment by the authors' own judge and product-manager personas, as the log itself says.
- In `web/judge-mode.js` the final caption is "Real PRs, real CI, a human always merges. Your turn." The page sends nothing and the CI shown during the demo is labelled simulated.

## 1. Kiroween judge (Kiro and AWS developer relations)

**Bio.** Reviews dozens of Frankenstein-track entries in a weekend. Opens the Devpost page, the video, then the repo. Knows what Kiro specs, steering, hooks, agents and MCP look like when they are real.

**Cares about.** Potential Value, Implementation of Kiro, Quality and Design, and whether the project fits the Frankenstein category.

**First 10 seconds.** Sees "The first vulnerability report you can play" and a CRT with a creature. The hook is clear and distinctive. Looks for the video link on Devpost and finds "TODO". Goes to the repo instead.

**First 3 minutes.** Reads the README: strong tagline ("Zork that patches your code, and can never break it"). Opens `.kiro/`: 30 specs, 6 steering files, 7 hooks, 2 agents, an MCP server. Opens `docs/KIRO.md` and finds the honest limit: no hook was seen firing in a Kiro session. Appreciates the honesty, still scores the hooks as configured, not demonstrated. Tries `?judge=1`, sees the scripted demo, reads "Real PRs, real CI" in the last caption while the on-screen CI is simulated. Notes the mismatch. Tries the install line in the README, which cannot work because the package is unpublished.

## 2. CISO at a large bank

**Bio.** Owns the risk register and the board report. Every tool must pass third-party risk review. Reads vendor claims skeptically.

**Cares about.** Measurable risk reduction, an audit trail, whether it would pass a security review, output a board can read.

**First 10 seconds.** A game with a creature. Not obviously a security product. The subtitle says "vulnerability report", which helps. No sign of who ships it, any support, or a compliance statement.

**First 3 minutes.** Likes the control story: no merge call, one dependency per PR, a human merges, a kill switch, an audit log. Finds the War Room by URL only, labelled simulated, and sees the big-screen idea but no export a board could receive. No SSO, no tenant, no retention story. The audit log is a local file. Concludes it is an interesting team ritual and a good demonstration of safe agent design, not something to put through vendor review.

## 3. SOC L1 analyst

**Bio.** Triages alerts on a rotating shift. Lives in a SIEM and a ticket queue. Dependency vulnerabilities reach them as noise from scanners.

**Cares about.** Alert fatigue, whether it removes noise, whether they would open it during a shift.

**First 10 seconds.** A text adventure. Not an analyst tool at first glance.

**First 3 minutes.** The noise filter idea is the only part that touches their day: only Possessed (in CISA KEV) and Rotting with EPSS of 0.1 or more spawn. They paste a repo and see a creature. There is nothing to ingest into a queue, no webhook, no alert format. Importing a scanner report is hidden in the Bench drawer. They would watch the demo once and not use it on shift, since dependency findings are not what they triage.

## 4. Vulnerability management (VOC) lead

**Bio.** Runs the remediation program: SLAs, ownership, exceptions, metrics, monthly reporting to the CISO.

**Cares about.** SLA, KEV and EPSS prioritization, a named owner per finding, reporting.

**First 10 seconds.** Sees the creature but not the policy. The words KEV, EPSS and CODEOWNERS only appear after the first screen.

**First 3 minutes.** In the manual and steering they find the SLA policy: Possessed in 48 hours, EPSS of 0.1 or more this sprint, the rest backlog. That is what they would have wanted on the landing page. Ranking is deterministic and explained, which they respect. Owners come only from CODEOWNERS, and the census says 84.7% of limbs have none, which is a real insight for them. Missing: ageing, exceptions, a trend over time, an export to a spreadsheet or ticket system. The 48-hour and 0.1 rules are fixed defaults, not configurable. Lockfile-only scope means no containers, no OS packages, no code reachability.

## 5. Open-source maintainer drowning in Dependabot PRs

**Bio.** Maintains a popular library alone or with two others. Has dozens of open bot PRs and ignores most.

**Cares about.** Fewer PRs, not more. Safe, tiny, well-explained changes. Zero setup.

**First 10 seconds.** "Paste your GitHub repo" is exactly the zero-setup entry they want. Pastes their repo.

**First 3 minutes.** Gets a creature and dry-run PR payloads. The idea of one dependency per PR and at most five per raid is attractive next to a bot that opens thirty. The noise filter is the value. They would try the CLI next and hit the unpublished package. The rehearsal sends nothing, so they cannot see what a real PR looks like without a token and a CLI run. They do not see a comparison against what Dependabot would have opened on the same repo.

## 6. AppSec engineer

**Bio.** Reviews fixes before they ship and tunes the scanner rules. Cares more about being right than about being fast.

**Cares about.** Are the fixes safe, is the ranking right, how many false positives.

**First 10 seconds.** Skeptical of a game. Looks for how the ranking works.

**First 3 minutes.** Ranking is deterministic code, not an LLM, with property tests (KEV always outranks non-KEV, score monotonic in EPSS). Good. The sections on unknown status are good: an unresolved limb is shown as rotting (unknown), never clean. Weaknesses: lockfile-only means a finding is "version has an advisory", not "code is reachable", and the census says so but the landing page does not. Hiding 95.2% of findings as noise is a risky default for an AppSec reviewer unless the hidden list is one click away with reasons. Who verifies that a generated fix does not break the build? CI, per the design, and a human. The Simulated CI on the page is by design not evidence.

## 7. Engineering manager

**Bio.** Runs a team of 8 to 12. Adopts a tool only if it fits the existing flow and costs little time.

**Cares about.** Team adoption, time cost, workflow fit with GitHub and Slack or Teams.

**First 10 seconds.** Fun, but "will my team do this"? The 15-minute weekly raid is a concrete ritual they can picture.

**First 3 minutes.** The pitch is a team ritual, which is a good fit. But there is no Slack or Teams message, no GitHub Action, no PR comment bot. Install is a checkout and a toolchain build that needs git, make and a C compiler (README). The package is unpublished. They cannot pilot it with a team this week without a developer spending an afternoon.

## 8. Game designer and Devpost community voter

**Bio.** Plays many entries and votes on the ones that make them smile or want to tell a friend.

**Cares about.** Is it fun, is the hook obvious, would they share it.

**First 10 seconds.** The CRT and creature look good. "Don't abandon your creature" is a hook. The tagline "Zork that patches your code" is quotable.

**First 3 minutes.** Judge mode demonstrates the loop in 45 seconds. The raid has a timer, ranks and combos, per the docs. The text game is niche: the typed verbs (EXAMINE, GRAFT) are discoverable, but the loop is short and the reward is a PR payload that is a dry run. Sharing: the creature card and downloadable `.z8` are real share hooks, but there is no one-click share. No video on Devpost yet, which loses voters who never open the site.

## 9. VC or acquirer

**Bio.** Looks for a large problem, a narrow wedge, a buyer with budget, and something that is hard to copy.

**Cares about.** Problem size, wedge, who pays, what is defensible.

**First 10 seconds.** A hackathon project. No team page, no pricing, no customers.

**First 3 minutes.** Problem (vulnerability backlog) is large and well known, but the pitch cites no sourced market figure, and none should be invented. Wedge: "paste a repo, get a ranked creature" is a decent top of funnel. Buyer is unclear: dev team, VOC or CISO? Everything is free, MIT licensed, runs in the browser with no server. Defensibility is thin: OSV, KEV and EPSS are public, and the ranking is a published, simple rule. What is hard to copy is the safety design and the brand, and neither is a moat. Not investable as is; a good portfolio piece.

## 10. Recruiter on LinkedIn, non-technical

**Bio.** Scrolls a feed. Decides in seconds whether a post is worth a like or a message to the author.

**Cares about.** Do I understand what it does in 10 seconds, is it impressive.

**First 10 seconds.** "The first vulnerability report you can play" is understandable. "Each vulnerable dependency is a limb on a creature, and you heal it by typing GRAFT, which writes a fix pull request" uses four terms they do not know (dependency, vulnerable, pull request, GRAFT). The visual is striking.

**First 3 minutes.** Follows the demo because it moves. Remembers "a game that fixes security bugs". The README is long and technical. Impressive in craft (a 1979 virtual machine, a 3D bench, tests), but there is no 30-second video or GIF to send in a post. Would like it and move on.
