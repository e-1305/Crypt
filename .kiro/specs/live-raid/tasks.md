# Tasks: live-raid

- [x] 1. Specs: requirements, design, tasks (this folder), committed before code
- [x] 2. `src/registry/types.ts`, `src/necromancer/lockfile.ts` (`bumpLockfile`), `src/necromancer/sabotage.ts` (L2, L6)
- [x] 3. `GithubClient` interface changes and all call sites; `PrRecord` fields; `API_CALL` outcome (L2, L3)
- [x] 4. `scripts/github-client.ts` Git Data API, audit hook, token redaction (L2, L7, L8)
- [x] 5. `scripts/registry-client.ts` and registry fixtures with `docs/ATTRIBUTION.md` entry (L2)
- [x] 6. `scripts/live-preflight.ts` (L1)
- [x] 7. `src/necromancer/index.ts` live graft and sabotage wiring (L2, L6)
- [x] 8. Tests: `tests/live-graft.test.ts`, `tests/live-helpers.ts`, property tests for lockfile, error injection, audit, token secrecy, seal (L1, L2, L7, L8)
- [x] 9. `src/raise/generate.ts` sealed flag and message; snapshots (L4)
- [x] 10. `src/inquisitor/index.ts` `requiredCheck`, `--timeout`, seal per poll (L3)
- [x] 11. `src/cli/parse.ts` flags, `scripts/cli/raid.ts`, `session.ts`, `main.ts`, `out/target.json` (L1, L3, L6)
- [x] 12. `src/reraise/index.ts` and `scripts/reraise.ts` live, HEALED on the plate (L5)
- [x] 13. Tests: `tests/live-wiring.test.ts` incl. sabotage refusal matrix (L3, L4, L5, L6)
- [x] 14. `tests/live-raid.test.ts` and `scripts/check-live-raid.ts` (`npm run live-raid:check`) full mocked raid
- [x] 15. `docs/DEMO.md` (token creation, human landing, reraise, sabotage beat), README, `docs/KIRO.md`, `docs/ATTRIBUTION.md`
- [x] 16. Final consistency pass over this spec
