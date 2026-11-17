# Demo script: the live raid on crypt-demo

This is the exact order for the video. A real pull request is opened on [e-1305/crypt-demo](https://github.com/e-1305/crypt-demo), its `test` check runs on GitHub, a person lands it, and `crypt reraise` shows the limb HEALED. A second, deliberate failure shows the Inquisitor rejecting a bad graft.

CRYPT never merges. It has no merge call, no merge endpoint and no merge command. The one merge in the demo is a human clicking a button.

## Prerequisites

- Node.js 20 or newer and git.
- `npm ci` run in this repository. The Inform 6 and dfrotz toolchain is built by the first raid (or `npm run setup`), so do one dry run before filming.
- A GitHub account with write access to `e-1305/crypt-demo`, or a fork with the same name and files (`package.json`, `package-lock.json`, `test/smoke.test.js`) and a workflow that runs a job named `test` on pull requests.
- The commands below use `npx --no-install crypt`. Run them from the root of this repository.

## Create the token

CRYPT refuses a token that is wider than it needs to be, so create a fine-grained token limited to the demo repository.

1. On GitHub open **Settings**, then **Developer settings**, then **Personal access tokens**, then **Fine-grained tokens**, then **Generate new token**.
2. Name it `crypt-demo`. Set **Expiration** to 7 days.
3. **Resource owner**: `e-1305` (or the owner of your fork).
4. **Repository access**: **Only select repositories**, then choose `crypt-demo`. Nothing else.
5. **Repository permissions**:
   - **Contents**: Read and write
   - **Pull requests**: Read and write
   - **Checks**: Read-only
   - **Metadata**: Read-only (added automatically)
   Leave every other permission at "No access".
6. Click **Generate token** and copy it. GitHub shows it once.
7. In the terminal: `export GITHUB_TOKEN=github_pat_...`

Notes:

- Never use a classic token (`ghp_...`). `crypt` refuses it, because a classic token cannot be limited to one repository.
- Before anything is written, `crypt` lists the repositories the token can see. If it sees any besides the target, it stops and says how many. If GitHub does not allow that listing, it prints a one-line note and continues.
- The token is only ever sent in an `Authorization` header. It is not written to the audit log, the output or any file.
- Revoke the token after the demo (Settings, Developer settings, Fine-grained tokens, Delete).

## Reset between takes

```bash
rm -rf out .crypt-seal crypt-audit.log
```

On GitHub, close any open pull request from a `crypt/` branch and delete the `crypt/` branches (the **Branches** page of the repository). If a previous take merged the lodash PR, restore `package.json` and `package-lock.json` on `main` to the original versions (lodash 4.17.15, jquery 3.4.1), or use a fresh fork.

## Beat 1: the live raid

```bash
npx --no-install crypt raid https://github.com/e-1305/crypt-demo --live
```

What happens, in order:

1. Preflight checks the token and the repository. It fails before any clone or write if something is wrong.
2. CRYPT exhumes the dependencies, ranks them with KEV and EPSS, prints the plate and opens the game.
3. In the game, the two spawned limbs for crypt-demo are `JQUERY` and `LODASH` (these are the limb IDs the raid generates for the demo files). Type:

```
GRAFT LODASH
```

4. CRYPT prints `Graft LODASH: pull request opened https://github.com/e-1305/crypt-demo/pull/<n>`. The pull request bumps lodash 4.17.15 to 4.18.0 in `package.json` and `package-lock.json` (with the `resolved` URL and `integrity` hash taken from registry metadata; no package is downloaded or installed). Open the URL in the browser.
5. Show the `test` check running on the pull request, then turning green. The console prints `LODASH: awaiting a human to land the pull request`. The default wait is 10 minutes; use `--timeout <seconds>` (10 to 3600) on `raid` for more.
6. Type `QUIT`, then `Y`, to leave the game.

The commit is one commit on the branch `crypt/graft-lodash-4.18.0`. It has no author name taken from the target's git history.

## Beat 2: a human lands the pull request

On GitHub click **Merge pull request** and confirm. This is the only merge in the demo, and it is done by a person. CRYPT cannot do it.

Then:

```bash
npx --no-install crypt reraise --live
```

It asks GitHub whether the pull request was landed, marks LODASH healed, recompiles the creature and prints the plate. Show the line for lodash with `HEALED`.

## Beat 3: the sabotage beat

This shows the Inquisitor rejecting a graft whose CI is red. The flag is for demos only and is refused unless both confirmation flags are given.

```bash
npx --no-install crypt graft JQUERY --live --sabotage --i-know-this-is-a-demo
```

Without `--live`, or without `--i-know-this-is-a-demo`, the command stops with a usage error (exit code 2) and does nothing. With both, it opens a pull request from `crypt/graft-jquery-3.5.0-sabotage` that also adds a failing assertion to `test/smoke.test.js`, and prints `DEMO SABOTAGE: ...`.

1. Open the pull request URL and show the red `test` check.
2. Run:

```bash
npx --no-install crypt inquisit JQUERY --live
```

3. It prints `The graft was rejected. The creature remains.` The limb stays rotting, and the record moves to `out/prs/rejected/`.
4. Close the pull request on GitHub (do not merge it) and delete the `crypt/graft-jquery-3.5.0-sabotage` branch.

## Beat 4: SEAL

Start the game again without `--live`:

```bash
npx --no-install crypt play
```

```
SEAL CRYPT
GRAFT JQUERY
```

The game answers `The crypt is sealed. No needle moves.` and nothing is requested. With the seal in place, `crypt graft` and `crypt reraise` make zero API calls. Lift it with `npx --no-install crypt unseal`.

## The audit log

Every live API call (GitHub and the npm registry) is appended to `crypt-audit.log` before the request is sent: method and path, never the token, a body or a query string.

```bash
grep API_CALL crypt-audit.log | cut -f1,5
```

Example lines:

```
2026-...Z	GET /repos/e-1305/crypt-demo
2026-...Z	GET /user/repos
2026-...Z	GET /lodash/4.18.0
2026-...Z	POST /repos/e-1305/crypt-demo/git/refs
2026-...Z	POST /repos/e-1305/crypt-demo/pulls
```

If an audit line cannot be written, the request is not sent.

## Troubleshooting

| Message or exit code | Cause | Fix |
|---|---|---|
| exit 2, `--live needs GITHUB_TOKEN` | no token in the environment | `export GITHUB_TOKEN=github_pat_...` |
| exit 2, `--live needs a GitHub URL target` | a local path was given with `--live` | pass `https://github.com/<owner>/<repo>` |
| exit 2, `--live cannot be combined with --offline` | both flags | drop `--offline` |
| exit 2, `--sabotage is a demo flag` | missing `--live` or `--i-know-this-is-a-demo` | run it as shown in Beat 3 |
| exit 2, `--timeout must be a whole number...` | value outside 10 to 3600 | pick a value in range |
| exit 1, `Use a fine-grained token` | classic token (`ghp_`, `gho_`) | create a fine-grained token |
| exit 1, `... is not readable with this token` | token not granted on the repository | add the repository to the token |
| exit 1, `This token cannot push` | Contents permission is read-only | set Contents to Read and write |
| exit 1, `This token can also reach N other repositories` | token is not limited to the demo repository | recreate it with Only select repositories |
| `ERROR` after `GRAFT`, no pull request | registry or GitHub error, a changed dependency tree (handlebars and node-fetch abort this way), no fixed version (mkdirp) | nothing was written; pick lodash or jquery |
| `The graft was rejected` after 10 minutes with no check | the `test` check never reported | confirm the workflow runs on pull requests; raise `--timeout` |
| HTTP 403 or 429 in an error line | GitHub or registry rate limit | wait and retry; the error names the status, never the token |
| exit 4 | target unreadable | check the URL and that the repository has `package.json` |

An error at any step leaves the state unchanged: no pull request is recorded and no limb changes.
