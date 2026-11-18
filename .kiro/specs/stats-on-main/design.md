# Design: stats-on-main

- `.github/workflows/ci.yml`: the `kiro-docs` step "Stats blocks in docs/DEVPOST.md and docs/BLOG.md are current" (`--check-docs`) is removed. The `--no-tests` counts step does not write, so it stays.
- `.github/workflows/stats.yml`: triggers `push` to `main` and `workflow_dispatch`. Job-level `if` skips a push whose `head_commit.message` starts with `chore(stats): regenerate`. Steps: checkout with `fetch-depth: 0`, setup-node 22, `npm ci`, `npm run kiro:stats -- --write`, `npm run kiro:timeline`, then `git diff --quiet` decides whether to commit as `github-actions[bot]` and push. Concurrency group `stats-on-main` with `cancel-in-progress: false`.
- Loop guard, two layers: the job `if` and `[skip ci]` in the message. Pushes made with `GITHUB_TOKEN` do not trigger workflows anyway.
- If the push is rejected because `main` moved, the job fails and the next push run regenerates.
- `scripts/kiro-stats.ts` is unchanged. `--check-docs` stays available for local use.
- Docs: a note in `docs/KIRO.md` (CI section, and the limits line that said CI does not refresh numbers) and `.kiro/steering/tech.md`.
