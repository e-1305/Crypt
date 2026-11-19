# CRYPT roadmap: from hackathon entry to a product a team would buy

Status: 2026-11-19. Feature freeze: 2026-11-27. Submission: 2026-12-03.
Last measured grade: round 4, 7.3/10 across 10 personas ([review/round-4.md](review/round-4.md)). Round 5 grades against the **five official Kiroween criteria** (Potential Impact, Technological Implementation, Design, Innovation/Idea, Presentation), equally weighted.

This roadmap is written from the customer's side. Every item names the problem it removes, the step of the remediation process it improves, the personas it lifts, and how we will know it worked. Nothing here invents customers, revenue or numbers.

## 1. The problem, in one line

Security teams drown in dependency findings that nobody owns: in our census of 20 popular projects, **95.2% of findings were noise** and **84.7% of dependencies had no owner** ([census/RESULTS.md](census/RESULTS.md)). The few actively exploited ones (CISA KEV) miss their deadline because they have no name next to them.

## 2. Who we serve

| Role | Job to be done | What they buy or use |
|---|---|---|
| **Primary buyer:** head of vulnerability management (VOC) or AppSec lead | Meet the KEV deadline, show the CISO the backlog is shrinking | Org view, SLA tracking, reports, SIEM export |
| **Signer:** CISO | Evidence that exploited risk is owned and fixed, with an audit trail | Monthly report, vendor review answers |
| **User:** engineering manager and developers | Get one clear fix, not 50 alerts; keep the team in charge of merges | GitHub Action, one PR per fix, Slack/Teams digest |
| **Operator:** SOC analyst | See exploited-vulnerability exposure next to other alerts | OCSF events, one ticket per KEV limb |
| **Free wedge:** open-source maintainer | Fewer, better PRs than Dependabot | `npx`, the Action, the game |

## 3. The process CRYPT runs (and where each feature sits)

```
Detect → Triage → Assign → Fix → Verify → Approve → Heal → Report
OSV      noise    CODE-    one     CI +     human    reraise  CISO page,
+KEV     line     OWNERS   PR      inquis-  merge    plate    OCSF, SLA
+EPSS    (95%)                      itor                       history
```

Fail-safe at every step: unknown is never "clean", CRYPT never merges, SEAL CRYPT stops everything.

## 4. Gap to 10, persona by persona

| Persona | R4 | Biggest gap | Roadmap items | Target |
|---|---|---|---|---|
| Kiroween judge | 8 | Video; one hook line only | P6, S4 | 9–10 |
| CISO | 8 | No trend, no ROI, no named contact | P2, P5 | 9 |
| VOC lead | 8 | No ageing or trend | **P2** | 10 |
| OSS maintainer | 8 | Comparison only on our own demo | P4, S2 | 9 |
| SOC analyst | 7 | No SIEM has loaded it | P1, S3 | 9 |
| AppSec engineer | 7 | Cannot tell if the code uses the package | **P3** | 9 |
| Engineering manager | 7 | Setup and first run not shown | **P1**, **P4** | 9 |
| Game designer / voter | 7 | No clip, short loop | P6 | 9 |
| Recruiter | 7 | Nothing to repost | P6, S5 | 9 |
| VC | 6 | No customer, no traction, unclear wedge | **P5**, S1, S2 | 8 (9+ needs real users) |

## 5. Product work (before the freeze, in this order)

**P1. Native GitHub Code Scanning (SARIF output).** `crypt alerts --format sarif` and Action input `upload-sarif: true`, so findings appear in the repository's Security tab with the same KEV/EPSS rank and owner. Problem removed: "another dashboard nobody opens". Step: Report. Lifts EM, AppSec, SOC, maintainer. Done when: a SARIF 2.1.0 file validates, the Action uploads it on crypt-demo, and the Security tab shows the jquery alert.

**P2. History, ageing and SLA trend.** Each run appends one line per limb to a history file (Action artifact or a `crypt-history` branch, never the default branch). War Room and the CISO report show: open KEV limbs over time, age of each, deadline breaches, mean time to heal. Problem removed: "I can't show the backlog shrinking". Step: Report. Lifts VOC, CISO, VC. Done when: two runs on crypt-demo produce a trend with the real heal of lodash on 2026-11-18.

**P3. "Is it used?" signal (static, honest).** For npm: does the code import the vulnerable package directly, only through another dependency, or not at all (dev-only)? Shown next to each limb as *imported directly / transitive only / dev only / unknown*. Never called "reachable". Problem removed: "is this a real risk for us?". Step: Triage. Lifts AppSec, maintainer, SOC. Done when: tested on crypt-demo and two census repos, with the limits written in the UI.

**P4. Five-minute onboarding: `crypt init`.** Opens one PR that adds the Action workflow and, if there is no CODEOWNERS file, a CODEOWNERS **draft** with team placeholders per manifest path (never names a person, never reads git blame). Problem removed: "84.7% of parts have no owner, and setup is a chore". Step: Assign. Lifts EM, VOC, maintainer. Done when: `npx @e-1305/crypt init` on a fresh fork opens the PR and the first Action run is green.

**P5. Buyer page and design-partner path.** A `/for-teams.html` page: the problem with census numbers, the process above, what a pilot looks like (one org, two weeks, read-only first), an ROI estimate clearly labelled as an estimate with its formula (findings filtered × triage minutes), pricing **hypothesis**, security review link, and a "Become a design partner" GitHub issue template. Problem removed: "who is this for and how do I start?". Lifts VC, CISO, recruiter. Done when: the page is linked from the hero and every number cites its source. **Status: built** ([for-teams.html](https://e-1305.github.io/Crypt/for-teams.html), issue form `.github/ISSUE_TEMPLATE/design-partner.yml`). No design partner has signed up yet.

**P6. Demo v2 (after P1 to P4).** One story told from the customer's side: *Monday 9:00, a VOC lead has 248 findings and one actively exploited jquery.* Scan → noise cut → owner → one PR → CI → human merge → healed → the trend line moves → the CISO page → the SIEM sees it. Under three minutes, the owner's own voice. Lifts judge, voter, recruiter, Presentation criterion.

## 6. Signals (only real people can create these)

| # | Signal | Who | Lifts |
|---|---|---|---|
| S1 | Three conversations with security practitioners (no employer data), two-line anonymous quotes | Amine | VC, CISO, VOC |
| S2 | One outside maintainer runs `npx` or the Action on their repo | Amine's network | VC, maintainer, EM |
| S3 | An OCSF file loaded into a real SIEM or S3 + Athena, query screenshot | Amine (AWS account) + Kiro | SOC |
| S4 | A hook line from one of the repository's own hooks | Desktop IDE session | Judge |
| S5 | Blog on dev.to (Bonus Blog Prize) and a #KiroweenHackathon26 post in Amine's own words (Social Blitz) | Amine | Recruiter, VC, judge |

## 7. Out of scope (said plainly)

SSO, multi-tenant hosting, a paid plan, runtime reachability, languages other than npm/Python for P3. These are listed in [SECURITY-REVIEW.md](SECURITY-REVIEW.md) as "not offered".

## 8. Review loop

After P1–P5 merge: round 5, same 10 personas, graded on the five official criteria. Then fix, then round 6 after the demo v2 and the signals.
