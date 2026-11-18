# Design: kiro-writeup-honesty

Docs only. No code, hook or script changes.

## Files
- `docs/KIRO.md`: intro sentence, "Limits" first bullet, "Steering" intro (new paragraph on how rules reached the agent), "Hooks" intro (status sentence), "Specs" (trail sentence).
- `docs/DEVPOST.md`, `docs/BLOG.md`: the Kiro paragraph and the limit sentence.
- `docs/img/architecture.svg`: the two text lines of the hooks card.

## Wording rules
- Observed facts: hook files exist, CI checks them, 5 `manual` runs, 0 Kiro-session runs.
- Inference, marked as probable: the Web layout kept the repository's `.kiro/` from loading.
- Not claimed: that hooks work or fail in the IDE or CLI. Nobody ran them there.
- Steering: "told to read", not "auto-loaded". Evidence is in code and tests.

## Steering examples (all verifiable in the repository)
1. No merge path: `failsafe.md` rule 2, `tests/static.test.ts` and CI job `failsafe-guard` (`scripts/ci/failsafe-guard.sh`).
2. CODEOWNERS only: `blameless.md`, `tests/exhume.test.ts` ("CODEOWNERS (E6)", "creature.json (E7) and blamelessness (E6.3)").
3. Deterministic ranking: `failsafe.md` rule 4, `sla-policy.md`, `tests/exhume.test.ts` (KEV outranks non-KEV, input order does not matter).

## Spec trail
`mcp-server`: spec `a1bc445`, code and tests `ccbc8db`. `exhume-and-rank`: spec `580fc00`, code `2b27e53`. `necromancer`: spec `2b4bfdb`, code `a56aa39`, `a58e201`. `hook-evidence`: `7e065a2`, `bb86908`, `9da30b7`.
