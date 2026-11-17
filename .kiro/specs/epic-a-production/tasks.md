# Tasks: epic-a-production

## A1 CI
- [ ] A1.1 Specs: requirements, design, tasks (this folder), committed before code
- [ ] A1.2 Baseline: `npm ci`, typecheck, vitest, spike, raise:check, necromancer:check, offline raid all green locally
- [ ] A1.3 `scripts/ci/raid-offline.sh`
- [ ] A1.4 `tests/runs.ts` and `CRYPT_NUM_RUNS` in every property test
- [ ] A1.5 `scripts/ci/failsafe-guard.sh` and `tests/failsafe-guard.test.ts`
- [ ] A1.6 `.github/workflows/ci.yml` with jobs `test` and `failsafe-guard`
- [ ] A1.7 README CI badge

## A2 Kiro hooks
- [ ] A2.1 Hook definitions in `.kiro/hooks/` (guard on save, tests on spec change)
- [ ] A2.2 `docs/KIRO.md` documents the hooks

## A3 GitHub Pages demo
- [ ] A3.1 Demo creature built from the fixture
- [ ] A3.2 Pages workflow (build, upload, deploy)
- [ ] A3.3 CORS check recorded in `design.md`

## A4 npm packaging
- [ ] A4.1 `npm pack --dry-run` matches the whitelist
- [ ] A4.2 Tarball smoke test in a clean directory
- [ ] A4.3 `docs/ATTRIBUTION.md` updated
