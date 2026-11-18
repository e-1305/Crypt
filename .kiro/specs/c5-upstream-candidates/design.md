# Design: c5-upstream-candidates

| Piece | Source |
|---|---|
| Qualifying limbs | `out/census/*.json` written by `npm run census` (`scripts/census/run.ts`); filter in `passesFilter` (`scripts/census/upstream-candidates.ts`), same rule as `.kiro/steering/sla-policy.md` |
| Fixed version | OSV advisory via `parseAdvisory` (`src/necromancer/advisory.ts`) and `chooseVersion` (`src/necromancer/version.ts`); breaking = higher major, or higher minor while 0.x |
| Fail safe | `judge` returns `unverifiable` for a missing advisory or a version that is not major.minor.patch; only `candidate` verdicts count |
| Bots, CONTRIBUTING, open PRs | Checked by hand against the default branch and the GitHub search API; recorded in `docs/UPSTREAM.md` with the date |
| Tests | `tests/upstream-candidates.test.ts` (filter boundary, same-major, breaking, no fix, fail-safe, no lookup when nothing passes) |

Limits: a version derived from `last_affected + 1` may not be published (seen for lodash.template); the doc checks the registry by hand.
