# Requirements: live-raid-actions

Goal: run the live raid from a phone. A `workflow_dispatch` GitHub Action in this repository runs `crypt` against `e-1305/crypt-demo` with a repository secret, so no token sits on a laptop. Driven by issue #99. Builds on `.kiro/specs/live-raid/` and follows `.kiro/steering/failsafe.md`. It adds no new game rule and no merge call: a human still lands the pull request in the GitHub app.

Terms. **Limb**: `LODASH` or `JQUERY`. **Mode**: `graft`, `inquisit` or `reraise`. **Run state**: the `out/` directory and `crypt-audit.log`, restored between runs from the Actions cache.

## A1 Trigger and inputs
1. The workflow `.github/workflows/live-raid.yml` SHALL run on `workflow_dispatch` only.
2. Inputs: `limb` (choice `LODASH`, `JQUERY`; default `LODASH`), `mode` (choice `graft`, `inquisit`, `reraise`; default `graft`), `sabotage` (boolean; default false).
3. Concurrency group `live-raid` SHALL allow one run at a time, without cancelling a run in progress.

## A2 Least privilege
1. The workflow `permissions:` SHALL be `contents: read`. It never writes to this repository.
2. The secret `CRYPT_DEMO_TOKEN` (the fine-grained token of `docs/DEMO.md`, "Create the token") SHALL be exposed as `GITHUB_TOKEN` only in the one step that runs `scripts/ci/live-raid.sh`.
3. The token SHALL never be printed. The step masks it with `::add-mask::`. The script never echoes the environment.
4. The live preflight (the token sees only the target repository) SHALL stay mandatory. Nothing in the workflow or the script bypasses it.
5. No merge endpoint is called anywhere (failsafe rule 2). The guard `scripts/ci/failsafe-guard.sh` SHALL still pass.

## A3 The script `scripts/ci/live-raid.sh <mode> <limb> <sabotage>`
1. It SHALL reject, with exit code 2 and before running anything, a mode outside `graft|inquisit|reraise`, a limb outside `LODASH|JQUERY`, a sabotage value outside `true|false`, and a wrong argument count.
2. `graft` SHALL run `crypt graft <limb> --live --target https://github.com/e-1305/crypt-demo`, after exhume and raise of that URL when no limb table exists yet.
3. The sabotage flags `--sabotage --i-know-this-is-a-demo` SHALL be passed only when the sabotage input is `true`. `sabotage=true` with a mode other than `graft` SHALL be rejected.
4. `inquisit` SHALL run `crypt inquisit <limb> --live --repo <repo>`, which polls the `test` check, and print the verdict.
5. `reraise` SHALL run `crypt reraise --live --repo <repo>`, print the plate, and copy the plate text to `out/plate.txt`. The artifact is `out/` (plate text, `creature.json`, the `.z8`).
6. Every mode SHALL write a job summary to `$GITHUB_STEP_SUMMARY`: limb, from to, PR link, verdict, and the plate in a code block. A sabotage run says SABOTAGE in capitals.
7. A failing crypt command SHALL fail the script (fail-safe).

## A4 Graft target
1. `crypt graft --target` SHALL accept a GitHub repository URL together with `--live`. The repository is taken from the URL, the live preflight runs as for `--repo`, and the local disk is not read as a checkout. A URL without `--live`, or a URL and a different `--repo`, is a usage error.

## A5 Docs and tests
1. `docs/DEMO.md` SHALL have the section "Run the live raid from a phone" with the six steps of the issue.
2. Tests SHALL cover the script's argument handling with a stubbed `crypt` command, and the token never appearing in the output.
