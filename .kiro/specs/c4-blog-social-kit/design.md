# Design: c4-blog-social-kit

Sources for every fact (no new numbers are computed):

| Claim | Source |
|---|---|
| Census numbers (20 repos, 11,244 limbs, 248 findings, 236 exorcised, 3 spawned, 0 possessed, 84.7% unowned, 16 of 20 without CODEOWNERS) | `docs/census/RESULTS.md`; reproduce with `npm run census` |
| Pillars and their sources | `README.md` "The three pillars" |
| Rules (no merge call, SEAL, one PR per dependency, max 5 PRs) | `.kiro/steering/failsafe.md` |
| Hooks, agents, spec list, limits | `docs/KIRO.md`, `.kiro/hooks/`, `.kiro/agents/` |
| Bridge v1 flaw | `.kiro/specs/bridge-v2/requirements.md` (V1, V2, V4), `.kiro/specs/transcript-bridge-spike/design.md` header, issue #3 |
| Fail-safe merge bug | commit `7111955`, `mergeOsvAnswers` in `src/exhume/rank.ts`, `.kiro/specs/exhume-and-rank/design.md` "Merging rows for one limb" |
| Proportional-font bug | commit `733d099` (#60), `web/theatre/font.js`, `tests/webfont.test.ts`, `scripts/ci/visual-qa.mjs` |
| Images | `docs/img/bench-3d.png`, `docs/img/visual-qa-1440x900.png`, `docs/img/visual-qa-390x844.png` |

Not verified, stated in the text: no hook has fired inside a Kiro session (`docs/KIRO.md` Limits). The Pullen TED talk is credited as an influence on the blameless framing; the repo holds no quote from it.

Check: word count of `docs/BLOG.md` with `wc -w`; X variant length with a character count; `grep -c '^#KiroweenHackathon26'`.
