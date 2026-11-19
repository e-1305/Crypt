# Proof: the real chain, 2026-11-18

Every step below happened on GitHub. Each link opens the real page. The rehearsal on the landing page ("Rehearsal (nothing leaves this page)") is a dry run in your browser; this chain is the real run.

1. **Found.** jquery 3.4.1 is Possessed (listed in CISA KEV). lodash 4.17.15 is Rotting. The live raid summaries: [graft LODASH run](https://github.com/e-1305/Crypt/actions/runs/44369138370) and [graft JQUERY run](https://github.com/e-1305/Crypt/actions/runs/44374815473).
2. **Fix PR opened by CRYPT.** [crypt-demo PR #1](https://github.com/e-1305/crypt-demo/pull/1): lodash 4.17.15 to 4.18.1, one dependency, opened 18:23:40Z.
3. **CI green.** The `test` check on PR #1 passed: [job](https://github.com/e-1305/crypt-demo/actions/runs/44369232555/job/135031172852) in [run 44369232555](https://github.com/e-1305/crypt-demo/actions/runs/44369232555).
4. **Merged by a human.** [PR #1](https://github.com/e-1305/crypt-demo/pull/1) was merged at 18:26:40Z (merge commit 843a0c2) by the repo owner using GitHub's Merge button. The account whose token opened PR #1 also merged it; CRYPT has no merge call.
5. **Re-raised: HEALED.** After the merge the live raid ran again and lodash read HEALED: [reraise run](https://github.com/e-1305/Crypt/actions/runs/44373819785).
6. **Counter-proof.** [PR #2](https://github.com/e-1305/crypt-demo/pull/2), `[DEMO SABOTAGE]` jquery 3.4.1 to 3.5.0, was opened at 18:55:22Z. Its `test` check [failed](https://github.com/e-1305/crypt-demo/actions/runs/44374944193/job/135051477584), the Inquisitor reported `GRAFT_REJECTED` ([run](https://github.com/e-1305/Crypt/actions/runs/44375794960)), and the PR was closed unmerged at 19:01:18Z.

## SARIF in GitHub Code Scanning

Status as of 2026-11-19: **not verified. No SARIF has been uploaded and no alert has been read back.**

- The `action-selftest` workflow now has a second job, `selftest-sarif`, that runs the action in report mode on `e-1305/crypt-demo` with `upload-sarif: true`. Only that job has `security-events: write`. The first job and the top-level permissions stay read-only.
- The workflow is `workflow_dispatch` only, and a new workflow file cannot be dispatched before it is on the default branch. It has not been run, so there is no run URL to link.
- A read of `GET /repos/e-1305/Crypt/code-scanning/alerts` on 2026-11-19 from the sandbox returned HTTP 403 (`Github returned a client error.`). That is a refusal of the read with the sandbox token. It does not show whether Code Scanning is enabled on the repository.

To fill this section in: merge the workflow, dispatch `action-selftest` from the Actions tab, then record the run URL and the first alert's rule id, severity, tool name and `created_at` from the API response, with the date. If the upload step is refused, record the error text here instead.

| Field | Value |
|---|---|
| Run URL | not available |
| Rule id | not available |
| Severity | not available |
| Tool name | not available |
| created_at | not available |

## Notes

- What this proof does and does not show: one demo repo, a lockfile-level finding (the package version is vulnerable), not reachability of the vulnerable code.
- Run modes for the reraise and rejection runs are inferred from run timing and the PR timestamps, because Actions logs need a signed-in session. The PR, check and merge facts come from the GitHub REST API.
- Failures are attributed to the limb (the package), never to a person.
