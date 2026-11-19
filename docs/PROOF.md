# Proof: the real chain, 2026-11-18

Every step below happened on GitHub. Each link opens the real page. The rehearsal on the landing page ("Rehearsal (nothing leaves this page)") is a dry run in your browser; this chain is the real run.

1. **Found.** jquery 3.4.1 is Possessed (listed in CISA KEV). lodash 4.17.15 is Rotting. The live raid summaries: [graft LODASH run](https://github.com/e-1305/Crypt/actions/runs/44369138370) and [graft JQUERY run](https://github.com/e-1305/Crypt/actions/runs/44374815473).
2. **Fix PR opened by CRYPT.** [crypt-demo PR #1](https://github.com/e-1305/crypt-demo/pull/1): lodash 4.17.15 to 4.18.1, one dependency, opened 18:23:40Z.
3. **CI green.** The `test` check on PR #1 passed: [job](https://github.com/e-1305/crypt-demo/actions/runs/44369232555/job/135031172852) in [run 44369232555](https://github.com/e-1305/crypt-demo/actions/runs/44369232555).
4. **Merged by a human.** [PR #1](https://github.com/e-1305/crypt-demo/pull/1) was merged at 18:26:40Z (merge commit 843a0c2) by the repo owner using GitHub's Merge button. The account whose token opened PR #1 also merged it; CRYPT has no merge call.
5. **Re-raised: HEALED.** After the merge the live raid ran again and lodash read HEALED: [reraise run](https://github.com/e-1305/Crypt/actions/runs/44373819785).
6. **Counter-proof.** [PR #2](https://github.com/e-1305/crypt-demo/pull/2), `[DEMO SABOTAGE]` jquery 3.4.1 to 3.5.0, was opened at 18:55:22Z. Its `test` check [failed](https://github.com/e-1305/crypt-demo/actions/runs/44374944193/job/135051477584), the Inquisitor reported `GRAFT_REJECTED` ([run](https://github.com/e-1305/Crypt/actions/runs/44375794960)), and the PR was closed unmerged at 19:01:18Z.

## SARIF in GitHub Code Scanning

Status: **not verified**. No run URL and no alert fields are recorded here, because none could be read back yet.

- The `selftest` job in `.github/workflows/action-selftest.yml` now has a second step that runs the Action with `upload-sarif: "true"` against e-1305/crypt-demo. The job has `security-events: write`; the top-level permissions stay `contents: read`.
- The workflow is `workflow_dispatch` only, and the change was prepared in an environment that could not dispatch it. A read of `GET /repos/e-1305/Crypt/code-scanning/alerts` there returned HTTP 403 (`Github returned a client error`), so no alert could be read.
- Still to record after a dispatched run on the merged workflow, dated: the run URL, and for each alert the rule id, severity, tool name and `created_at` from the REST API. If the upload is refused (for example Code Scanning is not enabled for the repository), that refusal is to be recorded here instead.

## Notes

- What this proof does and does not show: one demo repo, a lockfile-level finding (the package version is vulnerable), not reachability of the vulnerable code.
- Run modes for the reraise and rejection runs are inferred from run timing and the PR timestamps, because Actions logs need a signed-in session. The PR, check and merge facts come from the GitHub REST API.
- Failures are attributed to the limb (the package), never to a person.
