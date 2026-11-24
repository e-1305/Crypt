# CRYPT PRFAQ (working backwards)

Status: 2026-11-24. Written the Amazon way, before the next quarter of work. Every number links to its source. Nothing in here is a customer quote: CRYPT has no customers yet, and the quote slots below stay empty until real people say something.

## Press release

**CRYPT turns the dependency alerts nobody owns into one fix a person approves.**

*For security and engineering teams who drown in scanner findings, CRYPT keeps the few that are actually exploited, names the team that owns them, and opens a single fix pull request that a human merges.*

**Paris, 2026.** Security teams do not lack findings, they lack owners. Across 20 popular open-source projects, CRYPT's census found 248 vulnerability findings in 11,244 dependencies: 95.2% were noise for an exploited-first triage, and 84.7% of dependencies had no owner in CODEOWNERS ([census](census/RESULTS.md)). The few that matter miss their deadlines because no name is next to them.

CRYPT reads a lockfile, ranks each dependency by real-world exploitation (CISA KEV first, then EPSS), and draws the result as a creature: every sick package is a limb. It names the owning team from CODEOWNERS, writes one fix, and opens one pull request. It never merges: a person does, and a second, read-only agent rejects any fix whose CI is red ([sabotage test](https://github.com/e-1305/crypt-demo/pull/2)). The first real fix, lodash 4.17.15 to 4.18.1, was merged by its owner on 2026-11-18 and the next scan reported it HEALED ([PROOF.md](PROOF.md)).

"I wanted the first vulnerability report a developer would actually finish," said Amine Ben Elmahdi, who built CRYPT with Kiro for Kiroween 2026. "Turning the backlog into a creature you heal sounds like a game, but every limb is a real advisory, and every heal is a real merged pull request."

**How to start:** paste a public GitHub repo at [e-1305.github.io/Crypt](https://e-1305.github.io/Crypt/), run `npx @e-1305/crypt raid <repo>` (a dry run by default), or add it to CI with `npx @e-1305/crypt init`, which opens one read-only, report-mode workflow PR.

**Customer quote:** *(empty until a real user says something; see [INTERVIEWS.md](INTERVIEWS.md))*

## External FAQ

**Who is it for?** Vulnerability-management and AppSec leads who must meet exploited-vulnerability deadlines, and the engineering teams who do the fix. Open-source maintainers use it free. ([ROADMAP.md, Who we serve](ROADMAP.md#2-who-we-serve))

**How is it different from Dependabot, Snyk or Socket?** See [COMPETITORS.md](COMPETITORS.md). In short: CRYPT ranks exploited-first, names an owner, opens one PR, and refuses to merge; it does not detect malware and does not do function-level reachability.

**Does it change my code without asking?** No. Every mode is a dry run until you pass `--live`; even then it opens a pull request and stops. There is no merge call in the code, and a CI guard checks that ([KIRO.md](KIRO.md)).

**Which ecosystems?** npm and pip lockfiles (Tier 1). Others are not supported yet.

**What does it cost?** Free and open source (MIT). Paid tiers are a hypothesis only ([BUSINESS.md](BUSINESS.md#3-pricing-hypothesis)).

## Internal FAQ

**Why now?** CISA KEV and EPSS made "is it exploited?" a public, free signal, and GitHub now shows EPSS in Dependabot alerts. The gap left is ownership and the last mile to a merged fix.

**What is the riskiest assumption?** That a security team will act on an owner name from CODEOWNERS when 84.7% of dependencies have none. `crypt init` drafts team placeholders to close that gap; whether teams fill them is not measured.

**What would kill it?** No team adopts it after trying it; scanners copy owner naming; the game framing reads as unserious to a CISO. Early signals and cheap tests are in [ROADMAP.md, Signals](ROADMAP.md#6-signals-only-real-people-can-create-these).

**What will we not do?** SSO, hosted multi-tenant service, runtime reachability, malware detection, auto-merge. ([ROADMAP.md, Out of scope](ROADMAP.md#7-out-of-scope-said-plainly))

**How do we know it works?** Metrics are listed with where each is measured, or "not measured", in [METRICS.md](METRICS.md).
