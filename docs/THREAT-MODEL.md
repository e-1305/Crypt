# Threat model

This page lists what CRYPT protects, where untrusted input enters, and what stops it. It complements [SECURITY.md](../SECURITY.md) (reporting), [SECURITY-REVIEW.md](SECURITY-REVIEW.md) (what is read, stored and sent) and [SECURITY-AUDIT.md](SECURITY-AUDIT.md) (the audit and its fix items). The rule behind every control below is in `.kiro/steering/failsafe.md`: on an error, a cap or a timeout, stop and draw nothing. Never treat the result as clean.

## Assets

| Asset | Why it matters |
|---|---|
| A GitHub token typed into the War Room, or passed to the Action in graft mode | Grants API access, and in graft mode write access to the demo repository. |
| The user's machine and CI runner | The clone flow and the CLI parse files from repositories the user does not control. |
| The integrity of the verdict | A false "clean" or a forged creature misleads a team about its exposure. |
| The repository and its release pipeline | Workflow tokens and the npm provenance publish are the supply chain of every CRYPT user. |
| The visitor's browser session on the static site | Script injection on a page that holds a token would expose it. |

## Trust boundaries

### Paste flow (browser, public GitHub repo)

Input: a pasted `https://github.com/<owner>/<repo>` address, then `package-lock.json` and `CODEOWNERS` fetched from `raw.githubusercontent.com`, then advisories from OSV.

- The address goes through `parseGithubUrl` in `src/cli/url.ts`. It accepts only that exact shape, and rejects dots-only segments and a leading `-`.
- Network is limited to raw.githubusercontent.com and api.osv.dev. There is no token and no server.
- Fetched files are untrusted. Lockfiles are capped at 20 MB of text and 20,000 packages, and CODEOWNERS at 256 KB (`src/exhume/lockfile.ts`, `src/web/live-exhume.ts`). Over a cap, the page says nothing was drawn.
- Only npm `package-lock.json` is read. Other lockfiles stop with a typed error.
- PR payloads are a labelled dry run, capped at five. Nothing is sent.

### Clone flow (CLI, `raid <github-url>`)

Input: a GitHub URL on the command line, then a shallow clone read from disk.

- The URL is parsed by `parseGithubUrl`. Option-like text, other hosts and extra path segments are refused.
- `git` runs through `spawn` with an argument array, never a shell string, with `--` before the URL, `core.hooksPath=/dev/null`, `GIT_TERMINAL_PROMPT=0` and `GIT_LFS_SKIP_SMUDGE=1` (`scripts/cli/target.ts`). Clones have a timeout and are killed on interrupt.
- `--repo owner/name` is checked by `isRepoSlug`, so `../x`, `x/..`, `./x` and `-a/b` are refused.
- The cloned lockfile and CODEOWNERS go through the same parsers and caps as the paste flow. A size check before parsing in `scripts/cli/target.ts` is an open follow-up.

### War Room token

Input: an optional GitHub token typed into `web/war-room/war-room.html` for private repos and a higher rate limit.

- The token lives in one JS variable in `web/war-room/war-room.js`. It is never stored, never put in a URL, and is cleared on `pagehide`. The input field is emptied as soon as it is read.
- The page CSP has `connect-src 'self' https://api.github.com` and no `unsafe-eval`, so a script bug cannot send the token to another host.
- Residual risk: a script injected into the page can read the variable. The XSS guard test below and the CSP are the controls.

### Action token

Input: the `token` input of `action.yml`, used only in `graft` mode against the demo repository.

- Report mode (the default) needs no token and is read only. The token is ignored there.
- In graft mode the token should be fine-grained and limited to the demo repository. It reaches the step as `INPUT_TOKEN`. A human merges; CRYPT has no merge endpoint (`tests/static.test.ts`).
- Workflow tokens default to `contents: read`, with write granted per job.

## Hostile-input cases

| Input | What it does | Control |
|---|---|---|
| CODEOWNERS line such as 40 `*` then `z` | Catastrophic regex backtracking hangs the parser | Linear-time matching, capped rules (5,000), pattern length (200) and path length (4,096) in `src/exhume/owners.ts`. A dropped rule leaves the file unowned. |
| Oversized `package-lock.json` | Memory and CPU exhaustion | Byte and package caps, in both paste and clone flows. Web import is capped at 5 MB, CLI import at 50 MB. |
| Repo names such as `../x`, `x/..`, `-a/b` | Path traversal, option injection into `git` | `parseGithubUrl`, `isRepoSlug`, `--` before the URL, argument-array spawn. |
| Package names or owner strings with HTML | Script injection into the site | No `innerHTML` with data. Only two constant-string sites exist. `tests/web-xss-guard.test.ts` fails on any other `innerHTML`, `insertAdjacentHTML`, `document.write`, `eval` or `new Function` in first-party `web/` code. |
| Script injection on any page | Runs attacker code, reads the token | CSP `<meta>` on the game, War Room, For-teams, Graveyard, autopsy and manual pages. `unsafe-eval` is only on the game page, because `web/vendor/zvm.min.js` uses `new Function`. |
| Mutable action tags (`@v4`) | A moved tag runs attacker code with workflow tokens | Actions pinned to commit SHAs with `tests/workflow-pins.test.ts`. Pinning of the pages, live-raid and action-selftest workflows and the composite action is tracked as FIX-8 and FIX-9 in the audit. |
| Slow or hung network | Tool hangs, or reports stale data as clean | Timeouts and backoff on OSV, GitHub and feed downloads. On failure the result is "unknown" (Rotting), never Healthy. |

## Out of scope

- A malicious dependency that CRYPT reports on. CRYPT reads metadata and does not run package code.
- A compromised GitHub, OSV or npm service.
- Anyone with write access to the user's repository or CI.
