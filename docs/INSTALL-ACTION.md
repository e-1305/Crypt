# Install the CRYPT GitHub Action

Add this step to a workflow, after `actions/checkout`:

```yaml
- uses: actions/checkout@v4
- uses: e-1305/Crypt@main
  with:
    mode: report   # report only by default; never grafts unless mode: graft and a token is given
```

## What report mode does

- Needs no token beyond the default read-only `GITHUB_TOKEN`. Use `permissions: contents: read`.
- Fetches the KEV and EPSS feeds, exhumes the checked-out repository (lockfile and CODEOWNERS only, nothing is run or installed from it) and writes the plate and the noise funnel to the job summary: findings, exorcised as noise, monsters left to fight.
- Uploads `creature.json` and `autopsy.html` as an artifact named `crypt-creature-<job>-<job index>-<step id>`, so several uses in one run do not collide.
- Never writes to the repository. All output goes to a temporary directory.

## Fail-safe

Any error or unknown state fails the step with a FAILED summary, never a green "all clean". That includes a feed that did not download, a missing or unreadable `creature.json`, and findings that stayed unresolved or unknown.

## Inputs

| Input | Default | Meaning |
| --- | --- | --- |
| `mode` | `report` | `report` or `graft` |
| `path` | `.` | Directory of the checked-out repository, relative to the workspace |
| `token` | none | Fine-grained token, `graft` only |
| `limb` | `LODASH` | `LODASH` or `JQUERY`, `graft` only |
| `sabotage` | `false` | Demo only, `graft` only |
| `alerts` | `none` | `none` or `issues`. With `issues`, report mode adds the dry-run output of `crypt alerts --format issues` to the job summary |

## Alerts

`crypt alerts --format issues` prints one issue per Possessed (KEV) limb, titled `[CRYPT] KEV: <pkg> <version>`, with the CVEs, the owner team from CODEOWNERS, the 48 hour SLA and the graft command. Add `--live --repo owner/name` (with `GITHUB_TOKEN`, same preflight as live graft) to open them: at most 5 new issues per run, and never a second issue with the same open title. Titles that are already open are skipped first, so limbs beyond the first 5 still get issues on later runs. The check lists the open issues, so it sees an issue created seconds ago. A closed issue is not matched: a closed but unfixed limb gets a new issue on the next run. Only team owners (`@org/team`) are shown; an individual or an email shows as "no owner yet". With more than 1000 open issues the live run stops without opening anything.

## Graft mode (opt-in)

`mode: graft` runs the same raid as `scripts/ci/live-raid.sh graft`, including its preflight, and opens one pull request. It fails without a `token`. It never merges: a person lands the pull request. Note that the graft target is the demo repository `e-1305/crypt-demo`.

```yaml
- uses: e-1305/Crypt@main
  with:
    mode: graft
    limb: LODASH
    token: ${{ secrets.CRYPT_DEMO_TOKEN }}
```

## Self-test

The `action-selftest` workflow in this repository runs the action against `e-1305/crypt-demo` on manual dispatch.
