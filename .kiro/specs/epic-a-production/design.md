# Design: epic-a-production

## A1 CI

```
pull_request / push main
  job test            checkout, setup-node 22 (npm cache), npm ci, typecheck,
                      cache toolchain, setup-tools.sh, vitest (CRYPT_NUM_RUNS=1000),
                      spike, raise:check, necromancer:check, raid-offline.sh
  job failsafe-guard  checkout, scripts/ci/failsafe-guard.sh   (no Node, no toolchain)
```

| Path | Role |
|---|---|
| `.github/workflows/ci.yml` | the two jobs, `permissions: contents: read` |
| `scripts/ci/failsafe-guard.sh` | grep based guard over `src/` and `bin/`, plus `git check-ignore` for `.kiro/`. Takes an optional root directory so tests can point it at a temp tree |
| `scripts/ci/raid-offline.sh` | scripted offline raid: feeds `GRAFT JQUERY`, `SEAL CRYPT`, `GRAFT LODASH` on stdin in a temp cwd, asserts exit 0 and one payload |
| `tests/runs.ts` | `numRuns(default)` returns `max(default, CRYPT_NUM_RUNS)` when the variable is a positive integer, else `default` |
| `tests/failsafe-guard.test.ts` | runs the guard on a clean temp tree and on one tree per violation |

Guard rules, applied after removing the state label `awaiting-human-merge`: the merge patterns of `tests/static.test.ts`, `gh pr merge`, `git blame` (also as spawn arguments `"git", "blame"`), and `.kiro/` ignored by git. The guard never weakens `tests/static.test.ts`; it is a second, independent check that also covers `bin/` and runs without Node.

Toolchain cache: `CRYPT_TOOLCHAIN_DIR=$HOME/.cache/crypt/toolchain` for every step, cached with key `toolchain-${{ runner.os }}-${{ hashFiles('scripts/setup-tools.sh') }}`.

## A2 Kiro hooks
To be designed in the A2 milestone.

## A3 Pages
To be designed in the A3 milestone. CORS result recorded here once measured.

## A4 Packaging
To be designed in the A4 milestone.
