# Design: live-raid-actions

## Files
- `.github/workflows/live-raid.yml`: the workflow (A1, A2).
- `scripts/ci/live-raid.sh`: validation, the crypt calls, the summary (A3).
- `scripts/cli/main.ts`, `src/cli/parse.ts`: `graft --target <github url>` (A4).
- `tests/live-raid-script.test.ts`, `tests/parse.test.ts`: tests (A5).
- `docs/DEMO.md`: the phone section.

## Workflow
One job. Steps: checkout, Node 20, `npm ci`, toolchain cache and `npm run setup`, restore run state, one step that runs the script with `GITHUB_TOKEN: ${{ secrets.CRYPT_DEMO_TOKEN }}`, save run state, upload `out/` for `reraise`. The token is masked first with `::add-mask::` inside the same step.

The runs are separate, so `inquisit` and `reraise` need the PR record that `graft` wrote to `out/prs/`. The run state is kept with `actions/cache/restore` and `actions/cache/save` (key `live-raid-state-<run id>`, restore prefix `live-raid-state-`). Cache needs no permission beyond `contents: read`. Concurrency keeps the runs in order. Losing the cache only loses the local record: `graft` can be run again.

## Script
Arguments are validated first with `case` patterns. The crypt command is `${CRYPT_CMD:-npx --no-install crypt}` so tests can stub it. Output of each crypt call goes to a log file and to the console. The summary reads the PR URL from the line `Pull request: <url>`, from and to from `out/prs/*.json` for the limb, and the verdict from the crypt output (green: `awaiting`, red: `rejected`, merged: `HEALED` on the plate).

## graft --target
In `graftCommand`, a `--target` that `parseGithubUrl` accepts is treated as the repository. It needs `--live`. `resolveRepo` receives the repository from the URL, so `preflightedClients` still runs first. In live mode the Necromancer reads files through the API, so no local checkout is needed.
