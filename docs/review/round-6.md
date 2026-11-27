# Review round 6 (2026-11-27)

Method: `.kiro/steering/review-round-of-10s.md` and `.kiro/steering/review-conseil-des-7.md`, run by the CTO reviewer (Claude) on main at `b41a454`. Kiro's session for #338 stayed queued, so this round was not run by Kiro. Every persona below is simulated: these are not real people's opinions. Three personas were added for the judges named in the organisers' email of 2026-11-26 (paraphrased, not quoted as their grades).

Evidence: screenshots of all 7 pages at 1440 and 390 px (headless Chrome, SwiftShader), a horizontal-overflow probe at 390 px, `npx vitest run` (114 files green), the stress harness (48/48 after #347 and #348, see [STRESS.md](../STRESS.md)), and idle rAF of 0.4/s on the 3D landing page.

## Round of 10s (plus 3 judges)

| # | Persona | Grade | Why | Top fix |
|---|---|---|---|---|
| 1 | Kiro TAM judge | 8 | 31 specs, 8 steering files, 7 hooks, 4 agents, all mapped in [KIRO.md](../KIRO.md) | Show one spec and one hook on screen in the video, not only in docs |
| 2 | Ambassador, UX and CI/CD | 7 | One primary action on the landing page; `crypt init` is one PR | The 390 px plate cuts the creature on the right (`index.html`, plate `pre`) |
| 3 | Ambassador, tech and presentation | 7 | The chain is real ([crypt-demo PR #1](https://github.com/e-1305/crypt-demo/pull/1)), but the video link is still `VIDEO_URL_PENDING` ([DEVPOST.md](../DEVPOST.md)) | Upload video v5 and replace the placeholder |
| 4 | CISO | 7 | Read-only by default, a human merges, CISO page with SLA | Nothing new before Dec 4 |
| 5 | Vuln-management lead | 7 | KEV first, an owner per limb, CSV with SLA | Nothing new before Dec 4 |
| 6 | SOC analyst | 6 | OCSF output exists, but there is no SIEM screenshot | Out of scope for Dec 4 |
| 7 | AppSec engineer | 7 | An honest "no reachability" line ([COMPETITORS.md](../COMPETITORS.md)) | Nothing new |
| 8 | Engineering manager | 7 | One PR per fix, CI-gated | The video must show the PR and green CI in under 60 s |
| 9 | OSS maintainer | 6 | MIT and on npm, but no CONTRIBUTING.md and no good-first issues | Add CONTRIBUTING.md and label 3 starter issues |
| 10 | VC | 6 | Traction is honest and small ([FACTS.md](../FACTS.md)) | Out of scope for Dec 4 |
| J1 | Judge: "a real problem, and only possible with Kiro" | 7 | The problem is stated with census numbers; the "before Kiro" case is buried in [KIRO.md, Where Kiro surprised us](../KIRO.md#where-kiro-surprised-us) | Say it in one line in the video and in DEVPOST |
| J2 | Judge: "scare me, then make it easy" | 7 | Errors now open with a ghost line (#350), but the getting-started strip ("STEP 1 OF 3") is plain | Give the onboarding guide the ghost's voice, with the same next step |
| J3 | Judge: "outlives the hackathon" | 6 | MIT, npm, Action and `crypt init` are all there, but the GitHub About box (description, website, topics) is empty and there is no contributor path | Fill the About box; add CONTRIBUTING.md |

## Five criteria (1 to 10)

| Potential Impact | Technological Implementation | Design | Innovation | Presentation |
|---|---|---|---|---|
| 7 | 8 | 7 | 9 | 6 |

Presentation is lowest: the video is not yet public and v4 opens on stat cards for about 8 s before the product shows.

## Ranked fixes (value per hour)

1. Fill the GitHub About box: description, website, topics (5 min, Presentation and J3). For Amine: repository settings are not writable from the CTO session.
2. Video v5: product on screen in the first 3 s, one spec and one hook shown, no live typing, the logo, the "before Kiro" line, under 3 min (Presentation; a few hours).
3. Ghost voice for the getting-started strip in `web/onboarding.js` (Design, J2; 1 hour).
4. `CONTRIBUTING.md` plus 3 issues labelled `good first issue` (J3, OSS maintainer; 1 hour).
5. Fit the plate at 390 px: scale the plate font so the creature is not cut (Design; 1 hour).
6. One "before Kiro" sentence in DEVPOST's 30-second block (J1; 10 min).
7. Manual on brand: #335, with Kiro now.
8. Manual `code` blocks and the Graveyard screen-reader table overflow at 390 px (Design; 30 min).

## Le Conseil des 7: what single change most raises the five criteria before Dec 4?

Round 0 (blind), condensed:

| Seat | Verdict | Argument |
|---|---|---|
| L'Invite (judge's seat) | Video v5 | Judges watch the video first; the 30-second test starts there |
| Le Signataire | Video v5 | A buyer forwards a video, not a repo |
| Le Croque-mort | Video v5 | Cause of death: "judge never saw it working" (opinion, no base rate available). Warning sign: the placeholder is still in DEVPOST on Dec 2 |
| Le Tresorier | Abstain | No revenue effect before Dec 4 |
| Le Crieur | Video v5 | One upload reaches every judge; the social post reuses it |
| La Forge | Video v5, then the small fixes | Shippable in a day with the existing pipeline (`rec4.mjs`, `build6.py`) |
| Le Greffier | Video v5 with conditions | Synthetic voice disclosed; no music or trademarks without rights; no employer data |

Round 1: no seat moved. Vote: 6 approvals, 1 abstention, no veto. Recommendation: video v5 first, then fixes 3 to 6. The chair (Amine) decides.

Pre-mortem: (1) the video is not public by Dec 3, so the link stays a placeholder; cheap test: upload v4 as unlisted today. (2) The live site breaks on a judge's phone; cheap test: open it on a real phone. (3) The DEVPOST copy is not pasted into the Devpost form; cheap test: fill the form now as a draft.
