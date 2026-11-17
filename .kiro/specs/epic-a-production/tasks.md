# Tasks: epic-a-production

## A1 CI
- [x] A1.1 Specs: requirements, design, tasks (this folder), committed before code
- [x] A1.2 Baseline: `npm ci`, typecheck, vitest, spike, raise:check, necromancer:check, offline raid all green locally
- [x] A1.3 `scripts/ci/raid-offline.sh`
- [x] A1.4 `tests/runs.ts` and `CRYPT_NUM_RUNS` in every property test
- [x] A1.5 `scripts/ci/failsafe-guard.sh` and `tests/failsafe-guard.test.ts`
- [x] A1.6 `.github/workflows/ci.yml` with jobs `test` and `failsafe-guard`
- [x] A1.7 README CI badge

## A2 Kiro hooks
- [x] A2.1 Hook scripts in `scripts/hooks/` and tests in `tests/hooks.test.ts`
- [x] A2.2 Five hook definitions in `.kiro/hooks/` (tests, failsafe, traceability, attribution, blameless copy)
- [x] A2.3 `docs/KIRO.md` documents the hooks with real captured output, traceability table and numbers

## A3 GitHub Pages demo
- [ ] A3.1 Demo creature built from the fixture
- [ ] A3.2 Pages workflow (build, upload, deploy)
- [ ] A3.3 CORS check recorded in `design.md`

## A4 npm packaging
- [ ] A4.1 `npm pack --dry-run` matches the whitelist
- [ ] A4.2 Tarball smoke test in a clean directory
- [ ] A4.3 `docs/ATTRIBUTION.md` updated
