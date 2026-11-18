# Business case

Status: a free, open-source project (MIT, see [LICENSE](../LICENSE)). **No customers, no revenue, no pricing exists today.** Sentences marked **Opinion** or **HYPOTHESIS** are the authors' judgment, not measured. Numbers from the CRYPT census come from [census/RESULTS.md](census/RESULTS.md) (20 popular projects, lockfile only, not a random sample). Every other number carries a link. Numbers we could not verify are left out.

## 1. Market, sourced

No market size is claimed. We tried to open analyst press releases (Gartner), and the page blocked our fetch, so no spend figure appears here.

What we could verify:

| Fact | Source |
|---|---|
| 704,102 malicious open source packages logged by Sonatype as of August 2024, up 156% year over year | [Sonatype, State of the Software Supply Chain 2024](https://www.sonatype.com/state-of-the-software-supply-chain/2024/scale) |
| CISA keeps a public catalog of vulnerabilities known to be exploited (KEV), which CRYPT uses to mark limbs Possessed | [CISA KEV catalog](https://www.cisa.gov/known-exploited-vulnerabilities-catalog) |

**Opinion:** every organization with a lockfile has this problem, and the cost sits in sorting findings and finding owners, not in finding them.

## 2. Buyer and wedge

**Buyer (opinion):** the head of vulnerability management or AppSec, reporting to the CISO. This person owns remediation SLAs and chases owners by hand.

**Pain, measured on 20 popular projects ([census](census/RESULTS.md)):** 84.7% of limbs (dependencies) had no CODEOWNERS owner (9,528 of 11,244), and 95.2% of findings were noise under the [SLA policy](../.kiro/steering/sla-policy.md) (236 of 248). Limits: lockfile only, no reachability, not a random sample.

**Wedge:** free first, paid later.

1. Free GitHub Action ([INSTALL-ACTION.md](INSTALL-ACTION.md)) and `npx @e-1305/crypt raid`.
2. A paid organization view on top.

| Org view piece | State today |
|---|---|
| Graveyard (org scan, read-only, `crypt graveyard --org`) | Built. Sample page at [graveyard](https://e-1305.github.io/Crypt/graveyard/graveyard.html). |
| War Room (big-screen raid view) | Built, simulated data only. See [war-room](https://e-1305.github.io/Crypt/war-room.html). |
| CISO report (`crypt autopsy`) | Built. Sample at [autopsy](https://e-1305.github.io/Crypt/autopsy.html). |
| OCSF export (SIEM format) | **Not built.** No code or doc in this repository mentions it. It is a plan. |

## 3. Pricing: HYPOTHESIS

Nothing here has been tested with a buyer.

- Free: public repositories, the CLI and the Action.
- Per-organization tier (**HYPOTHESIS**): private repositories and the org views (Graveyard, War Room, CISO report).
- Enterprise (**HYPOTHESIS**): SSO, audit retention, SIEM export (OCSF).

Public competitor pricing, read on 2026-11-18. We record only what each page shows.

| Product | What the public page shows | Source |
|---|---|---|
| Dependabot (GitHub) | Dependabot security updates are available for all repositories on GitHub. | [GitHub Docs](https://docs.github.com/en/code-security/dependabot/dependabot-security-updates/about-dependabot-security-updates) |
| Snyk | Free: $0 per month. Team: from $25 per month, up to 10 developers. Enterprise: contact sales. | [Snyk plans](https://snyk.io/plans/) |
| Mend | Mend AppSec "up to $1000 per dev per year". Demo-led. | [Mend pricing](https://www.mend.io/pricing/) |
| Socket | Free $0, Team $25, Business $50 per developer seat per month. SSO/SAML on Business. Enterprise: contact sales. | [Socket pricing](https://socket.dev/pricing) |

## 4. Defensibility

**Hard to copy (opinion):**

- The trust model is enforced in code and CI: agents hold a PR-only token, no code path merges, a human lands every fix. See [Safety guarantees](../README.md#safety-guarantees) and [failsafe.md](../.kiro/steering/failsafe.md).
- An ownership graph across an organization (CODEOWNERS to limb to fix), which grows with each org scanned.
- The playable report is an adoption hook: the report is a story file anyone can open.
- OCSF integration, once built (see section 2: not built today).

**Not hard to copy:** the ranking rule itself (KEV and EPSS threshold) and the data. OSV, CISA KEV and FIRST EPSS are public.

## 5. Traction

Real values from `npm run traction`, run on 2026-11-18. They are tiny, and shown as they are.

| Measure | Value | Source |
|---|---|---|
| npm downloads, last week (@e-1305/crypt) | not published | [api.npmjs.org](https://api.npmjs.org/downloads/point/last-week/@e-1305/crypt) |
| GitHub stars (e-1305/Crypt) | 0 | [api.github.com](https://api.github.com/repos/e-1305/Crypt) |
| GitHub forks (e-1305/Crypt) | 0 | [api.github.com](https://api.github.com/repos/e-1305/Crypt) |
| Public repos using the Action | not discoverable (GitHub code search needs a token) | GitHub code search |

"Not published" means the registry answers that the package does not exist. It is not a count of zero. Customers: none. Revenue: none.

## 6. Next 90 days, if it continues

| Milestone | Measurable signal |
|---|---|
| Publish `@e-1305/crypt` to npm | The npm API returns a download count instead of "not found". Add the npm downloads badge to the README after this, not before. |
| Five outside repositories run the Action | `npm run traction` with a token reports at least 5 distinct repositories outside the e-1305 org. |
| Build OCSF export and test it with one security team | One team confirms in writing that the export loads in their SIEM, and we log it in [PLAYTEST_LOG.md](PLAYTEST_LOG.md). |
