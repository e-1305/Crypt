# Requirements: stats-on-main

Goal: issue #112. Generated numbers (stats blocks in `docs/KIRO.md`, `docs/DEVPOST.md`, `docs/BLOG.md`, and `docs/img/kiro-timeline.svg`) are regenerated only on `main` by a bot commit, never in a pull request. This removes the merge conflicts that every parallel PR produced in those blocks.

Terms: **Generated blocks** are the regions written by `npm run kiro:stats -- --write` and the timeline written by `npm run kiro:timeline`. **Stats commit** is a commit whose subject starts with `chore(stats): regenerate`.

## S1 PRs never touch generated blocks
1. The `kiro-docs` CI job SHALL NOT check that the stats blocks in `docs/DEVPOST.md` and `docs/BLOG.md` are current.
2. The `kiro-docs` job SHALL keep the link check and the hook evidence check.
3. `docs/KIRO.md` and `.kiro/steering/tech.md` SHALL say: do not run `kiro:stats --write` or `kiro:timeline` in a PR.

## S2 Regeneration on main
1. A `stats` workflow SHALL run on push to `main` and on `workflow_dispatch`.
2. It SHALL run `npm run kiro:stats -- --write` and `npm run kiro:timeline`.
3. WHEN files changed, it SHALL commit them with the message `chore(stats): regenerate [skip ci]` and push to `main` using `GITHUB_TOKEN`.
4. Only this workflow SHALL have `permissions: contents: write`. `ci.yml` stays `contents: read`.
5. WHEN the head commit is a stats commit, a push-triggered run SHALL be skipped. A `workflow_dispatch` run SHALL always run.
6. Runs SHALL share one concurrency group and SHALL NOT cancel each other.

## S3 Fresh numbers before submission
1. A final manual `workflow_dispatch` run of `stats` SHALL give fresh numbers before submission.

## S4 Tests
1. `splice`, `spliceDocStats` and the whole `--write` computation SHALL be idempotent: applying twice equals applying once.
2. `npm run kiro:timeline -- --check` SHALL keep working locally.
3. A test SHALL check that `stats.yml` has the loop guard and `contents: write`, and that `ci.yml` has no stale-block check.
