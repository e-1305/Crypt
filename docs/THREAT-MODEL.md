# Threat model

This page lists what CRYPT protects, where untrusted data enters, and which hostile inputs are handled. It is grounded in [SECURITY-AUDIT.md](SECURITY-AUDIT.md) and [SECURITY-REVIEW.md](SECURITY-REVIEW.md). Report a vulnerability as described in [SECURITY.md](../SECURITY.md).

## Assets

| Asset | Why it matters |
|---|---|
| GitHub token typed into the War Room | Grants read access to repositories. Must not leave the browser except to `api.github.com`. |
| `GITHUB_TOKEN` in the GitHub Action | Scoped by the workflow `permissions`. Must not be written to logs or reports. |
| The honest answer | A cap, timeout or parse failure must produce "stop and draw nothing", never "treat as clean" (`.kiro/steering/failsafe.md`). |
| The user's browser session | Pages must not run attacker-supplied script. |
| The release pipeline | npm publish and the SEAL step run with write or `id-token` permissions. |
| Repository contents on disk | The clone flow must not read or write outside its target directory. |

## Trust boundaries

### Paste flow (static site)

Untrusted input: the pasted GitHub URL and any pasted lockfile or CODEOWNERS text. The URL parser accepts only `https://github.com/<owner>/<repo>` and rejects `..` and absolute paths. Fetches go to `raw.githubusercontent.com` and `api.osv.dev` only, limited by a Content-Security-Policy meta tag. Imported text is capped at 5 MB in the browser. Data is written to the page with `textContent`; the only `innerHTML` writes are two constant strings, enforced by `tests/web-xss-guard.test.ts`. Nothing is sent to a CRYPT server.

### Clone flow (CLI and scripts)

Untrusted input: the `--repo owner/name` argument and the cloned repository's files. `--repo` is validated by one strict pattern that rejects dots-only segments and a leading `-`. Lockfile and CODEOWNERS files are size-capped before parsing. The CLI does not execute code from the cloned repository.

### War Room token

The token is pasted by the user and used only for calls to `api.github.com`. The War Room page has a CSP with `connect-src 'self' https://api.github.com` and no `unsafe-eval`, so a script bug cannot send the token to another host. The token is not stored by CRYPT. See Token scopes in [SECURITY-REVIEW.md](SECURITY-REVIEW.md).

### Action token

The composite action and workflows use the default `GITHUB_TOKEN`. Workflows default to `contents: read`; write permissions are granted per job. Every `uses:` reference is pinned to a 40 character commit SHA, and Dependabot keeps the pins current. The `workflow_run` gate in `pages.yml` is kept as is. The action has no merge capability.

## Hostile-input cases

| Input | Defense | Test |
|---|---|---|
| CODEOWNERS line with many wildcards (ReDoS, a 41 byte line once hung the parser for over a minute) | Linear-time matching, with caps on pattern length, wildcard count and rule count. A dropped rule leaves the file unowned. | `tests/owners-redos.test.ts` |
| Oversized lockfile or CODEOWNERS file, or a huge package count | Byte and package caps with a typed error that says nothing was drawn. | `tests/live-exhume.test.ts` |
| Bad `--repo` such as `../x`, `x/..`, `./x`, `-a/b` | Strict owner/name validation. | `tests/github-client.test.ts` |
| Script injection into pages (`innerHTML`, `insertAdjacentHTML`, `document.write`, `eval`) | `textContent` for data, CSP on every page, and a repository-wide guard test. | `tests/web-xss-guard.test.ts`, `tests/csp.test.ts` |
| Mutable action tags in workflows | Pinned commit SHAs. | `tests/workflow-pins.test.ts` |
| Feed download that never returns | 30 second timeout. | `tests/static.test.ts` |

## Known limits

The game page allows `unsafe-eval` because the vendored ZVM interpreter (`web/vendor/zvm.min.js`) uses `new Function`. The guard test excludes `web/vendor/` for the same reason. A vulnerability in a dependency that CRYPT reports on belongs to that project.
