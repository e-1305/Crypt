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
Format, from the [Kiro hooks documentation](https://kiro.dev/docs/hooks/) (read for this milestone; trigger list at [hook triggers](https://kiro.dev/docs/hooks/types/), actions at [hook actions](https://kiro.dev/docs/hooks/actions/)):
- Files are JSON in `.kiro/hooks/<id>.json`, any kebab-case name. A file holds `{"version": "v1", "hooks": [...]}`.
- A hook has `name`, optional `description`, `trigger` (PascalCase; the documented file-save example uses `PostFileSave`), optional `matcher` (a regex against the file path for file events), `action` and optional `timeout` (seconds, default 60).
- `action.type` is `command` (shell command run in the project root; the event JSON arrives on STDIN; exit 0 adds STDOUT to the agent context, any other exit sends STDERR to the agent as an error) or `agent` (a prompt injected into the conversation).
- The earlier `.kiro.hook` format with `eventType` and `askAgent` is replaced by this one in IDE 1.0 and CLI V3. The hooks here use the new format.

Logic lives in scripts so tests can run it. `scripts/hooks/lib.sh` takes file paths as arguments or, when called by Kiro, extracts them from the event JSON on STDIN.

| Hook file | Matcher | Action |
|---|---|---|
| `related-tests-on-save.json` | `src/**/*.ts` | command: `scripts/hooks/related-tests.sh` runs `vitest related --run` for the saved file |
| `failsafe-guard-on-save.json` | `src/(necromancer\|inquisitor\|mcp)/` | command: `scripts/hooks/failsafe-check.sh` fails on a merge endpoint or command, or a token or secret on the same line as a log or audit call |
| `trace-on-tasks-save.json` | `.kiro/specs/*/tasks.md` | agent: runs `scripts/hooks/kiro-trace.ts --write`, which rewrites only the generated block in `docs/KIRO.md` |
| `attribution-on-package-save.json` | `package.json` | agent: runs `scripts/hooks/deps-check.sh` and adds each missing dependency to `docs/ATTRIBUTION.md` |
| `blameless-copy-on-save.json` | `src/raise/`, `web/` | command: `scripts/hooks/blameless-copy-check.sh` fails on copy that names a person in failure or states a prohibition |

Requirement A2.3 (hooks only read and report) decides the two hooks that change a file: the command hooks never write, and the two write steps (traceability block, attribution row) are agent actions, so the agent shows the change in the session instead of a script editing files unseen. `kiro-trace.ts` without `--write` only prints.

Traceability: the commit for a task is the first commit whose diff adds the ticked line `- [x] <id>` to `tasks.md` (`git log -S`). Open tasks show `open`. The block is deterministic, so a second run changes nothing. Commit hashes change when a branch is rebased; saving `tasks.md` again regenerates them.

## A3 Pages
To be designed in the A3 milestone. CORS result recorded here once measured.

## A4 Packaging
To be designed in the A4 milestone.
