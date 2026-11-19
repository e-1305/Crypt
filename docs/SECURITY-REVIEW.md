# CRYPT security review for vendor assessment

This page is for a CISO or a vendor-risk reviewer. Each statement below was checked against the code at the file named beside it. CRYPT is an open-source command line tool, not a hosted service, so most vendor questionnaire items about hosting, staff access and data centres do not apply. Where something is not offered, the last section says so. To report a vulnerability in CRYPT itself, see the contact in [SECURITY.md](../SECURITY.md).

## Data handled

- **Input:** `package-lock.json`, `requirements.txt` and `CODEOWNERS` files of the repository you point it at (`scripts/cli/target.ts` lists the read paths; `scripts/exhume.ts` fetches the same files for a GitHub URL).
- **Nothing is executed or installed.** A GitHub URL is shallow-cloned into a temporary directory with git hooks disabled (`-c core.hooksPath=/dev/null`, no submodules) and the clone is only read. No package manager runs and no code from the target runs. Symbolic links in a cloned repository are refused (`assertNoSymlinks` in `scripts/cli/target.ts`).
- **No source code and no secrets are read.** Only the files above are opened. Owners come from `CODEOWNERS` as team handles; an individual is never named in the OCSF output (`src/alerts/ocsf.ts`).

## Data stored

All state is local files in the directory where you run the command:

| File | Content |
|---|---|
| `out/creature.json`, `out/limbs.json`, `out/*.z8` | Findings: package names, locked versions, advisory IDs, KEV and EPSS values, owner teams |
| `out/alerts.ocsf.json` | OCSF events built from `out/creature.json` |
| `out/state.json`, `out/target.json`, `out/prs/` | Graft state, the last raid target, dry-run pull request payloads |
| `crypt-audit.log` | Append-only action log (format below) |
| `.crypt-seal` | The kill switch marker |

There is no CRYPT server and no database. The CLI has no telemetry or analytics code: a search of `src/`, `scripts/` and `web/` finds none. The hosted demo page at e-1305.github.io/Crypt is static files on GitHub Pages; its paste flow runs in your browser and reads the public repository files from `raw.githubusercontent.com` and advisories from OSV.

## Network calls

| Destination | When | What is sent | Code |
|---|---|---|---|
| `github.com` (git clone) | `raid` or `exhume` with a GitHub URL | A shallow clone request for that repository | `scripts/cli/target.ts` |
| `raw.githubusercontent.com` | `exhume` with a GitHub URL | Requests for the lockfile and `CODEOWNERS` paths | `scripts/exhume.ts` |
| `api.osv.dev` | `raid`, `exhume` and `graft` without `--offline` | Package name, ecosystem and version, and advisory IDs | `src/exhume/osv-client.ts`, `scripts/osv-advisory.ts` |
| `www.cisa.gov` (KEV) and `epss.empiricalsecurity.com` (FIRST EPSS scores) | Only `npm run feeds:update` | A download of each public feed | `scripts/feeds-update.ts` |
| `api.github.com` | Only with `--live` and a `GITHUB_TOKEN` you provide | Repository reads, one branch, one commit, one pull request, issues for `alerts --format issues` | `scripts/github-client.ts` |
| `registry.npmjs.org` | Only with `--live` grafts | Metadata for one exact package version. No tarball download | `scripts/registry-client.ts` |

`--offline` makes `raid` and `exhume` answer from the local OSV cache with no network call. `crypt alerts --format ocsf` makes no network call. KEV and EPSS are read from local files, not fetched during a raid.

## Token scopes

- Without `GITHUB_TOKEN`, every graft is a dry run that writes its payload to `out/prs/`.
- A live run needs a **fine-grained** token for **one repository** with Contents: read and write and Pull requests: read and write.
- `scripts/live-preflight.ts` runs before anything is cloned or written. It refuses a classic token (`ghp_` or `gho_` prefix), refuses a token that cannot push to the target, and refuses a token whose repository listing shows any other private repository. If the listing cannot be read it prints a warning and continues, so use "Only select repositories" when you create the token.
- The token is sent only as an `Authorization` header to `api.github.com` and is redacted from error messages (`redact` in `scripts/github-client.ts`). CI rejects code that passes `GITHUB_TOKEN` or `Authorization` values to a log or audit call (`secret_log_hits` in `scripts/ci/failsafe-rules.sh`).
- Writes go only to branches named `crypt/...`, and at most 5 pull requests are opened per raid (`MAX_PRS_PER_RAID` in `src/necromancer/index.ts`).

## No merge capability

The GitHub client has no method that lands a pull request, and the interface it implements has none either (`scripts/github-client.ts`, `src/github/client.ts`). A person merges every pull request. The CI job `failsafe-guard` (`scripts/ci/failsafe-guard.sh`, rules in `scripts/ci/failsafe-rules.sh`) fails the build if `src/` or `bin/` contains a merge endpoint, a merge call, an auto-merge setting or a `git blame` call. The `scripts/` directory is covered by `tests/static.test.ts`.

## SEAL kill switch

`crypt seal` writes `.crypt-seal` in the working directory; `crypt unseal` removes it; typing `SEAL CRYPT` in the game does the same. While the file exists, grafts, inquisitions, reraise and live `alerts --format issues` are rejected and the rejection is logged as `REJECTED_SEALED` (`src/necromancer/index.ts`, `src/inquisitor/index.ts`, `src/reraise/index.ts`, `scripts/cli/alerts.ts`). If the seal state cannot be determined, the check treats it as sealed (`isSealed` in `src/common/agent.ts`).

## Audit log format

`crypt-audit.log` in the working directory is append-only text, one line per action, with five tab-separated fields (`audit` in `src/common/agent.ts`):

```
<ISO 8601 time>	<command>	<limb or ->	<outcome>	<url or ->
```

Outcomes include `PR_OPENED`, `DRYRUN_WRITTEN`, `REJECTED_SEALED`, `RAID_LIMIT`, `HEALED` and `API_CALL`. For every live API request, a line with `API_CALL` and the method and path (never headers, body or token) is written before the request is sent. If that write fails, the request is not sent (`scripts/live-audit.ts`). The file is plain local text: CRYPT does not sign it or ship it anywhere. Forward it with your own log agent if you need central retention.

## Supply chain

- The package `@e-1305/crypt` is published from GitHub Actions with `npm publish --access public --provenance` (`.github/workflows/release.yml`, `id-token: write`), so each release carries an npm provenance statement linking it to the workflow run and commit. The workflow runs typecheck, the full test suite and a pack-and-install test first.
- Runtime dependencies are `@modelcontextprotocol/sdk`, `tsx` and `zod` (`package.json`). Third-party data and tools are listed in [ATTRIBUTION.md](ATTRIBUTION.md).
- To check a release yourself, run `npm audit signatures` in a project that installs it.

## Not offered

- **SSO and user accounts.** There is no service to sign in to. Access is whatever access your machine and your GitHub token have.
- **Multi-tenancy.** The tool runs per user and per working directory. There is no shared tenant model.
- **Retention SLA.** Files stay where you wrote them until you delete them. No retention period is promised or enforced.
- **Support contract.** There is no paid support, uptime commitment or response-time SLA. Issues go to the public repository.
- **A named security contact.** There is no security team and no person to call. Report a vulnerability in CRYPT through GitHub private vulnerability reporting, as described in [SECURITY.md](../SECURITY.md). Replies are best effort from a single maintainer.
- **Independent audit.** No third-party penetration test or compliance certification (SOC 2, ISO 27001) exists for CRYPT.
- **Reachability analysis.** A finding means the locked version has a known advisory, not that the vulnerable code runs (see [SOC.md](SOC.md)).
