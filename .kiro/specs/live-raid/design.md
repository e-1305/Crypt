# Design: live-raid

## Pipeline

```
crypt raid <url> --live
   livePreflight (token, repo, push permission, least privilege)   scripts/live-preflight.ts
        v  (only on success)
   clone + exhume + raise (as before); writes out/target.json {repo,url,live}
        v
game: GRAFT X --> watcher --> out/requests/graft-NNN-x.json
        v
src/necromancer   request -> version choice -> RegistryClient.getVersion -> bumpLockfile -> FileChange[]
        v
GithubClient (scripts/github-client.ts, Git Data API)  -> branch crypt/graft-... -> PR (headSha)
        v
src/inquisitor   check runs on headSha, requiredCheck 'test' -> awaiting-human-merge | GRAFT_REJECTED
        v   a human lands the PR on GitHub
src/reraise      PR state via API -> healed -> creature, plate, story regenerated
```

## Module layout

| Path | Role |
|---|---|
| `src/registry/types.ts` | `RegistryClient` interface: `getVersion(name, version)` returns `{ version, resolved, integrity, dependencies, optionalDependencies, peerDependencies }` |
| `src/necromancer/lockfile.ts` | pure `bumpLockfile({ pkgText, lockText, name, from, meta, fixed })`; returns the new texts or a typed abort reason; `editManifests` stays for the dry-run path |
| `src/necromancer/sabotage.ts` | pure `sabotageSmokeTest(baseText)` appends a labelled failing test |
| `src/necromancer/index.ts` | ctx gains `registry?` and `sabotage?`; order of work below |
| `src/github/client.ts` | `GithubClient` changes below |
| `src/inquisitor/index.ts` | `requiredCheck` option |
| `src/reraise/index.ts` | live PR state reading |
| `src/raise/generate.ts` | `Global crypt_sealed` and the sealed message in `GraftSub` |
| `scripts/github-client.ts` | rewritten to the Git Data API; injectable `Fetcher`, audit hook, token redaction |
| `scripts/registry-client.ts` | real npm registry GET client, same audit hook |
| `scripts/live-preflight.ts` | L1 checks |
| `scripts/cli/*`, `src/cli/parse.ts` | flags and wiring |
| `scripts/check-live-raid.ts` | offline acceptance (`npm run live-raid:check`) |
| `docs/DEMO.md` | video script |

`src/` has no network code and never says "merge" (`tests/static.test.ts`). The adapter maps GitHub's merge timestamp to `landed`. A static check also greps `src/` and `scripts/` for merge endpoints.

## GithubClient interface changes

- `readBaseFile(path): Promise<string>`: reads a file from the default branch at the base SHA pinned in the same run. The dry-run client throws `not available in dry-run`; the Necromancer then keeps reading `targetDir`.
- `openPullRequest` returns `{ number, url, headSha }`.
- `getCheckRuns(ref)` takes a commit SHA. The dry-run client returns `[]`.
- Optional `deleteBranch?(branch)`: best effort cleanup, refuses names that do not start with `crypt/`.
- Still no method that lands a PR.

`PrRecord` (src/common/agent.ts) gains `headSha?` and `sabotage?`. `AgentOutcome` gains `API_CALL` for the audit lines of live requests.

## Necromancer order of work

1. Seal check. 2. Lookup. 3. Creature and spawned check. 4. Advisories and `chooseVersion`. 5. `PR_EXISTS` and `RAID_LIMIT` checks. 6. `registry.getVersion` (live: the registry is required, absent gives `ERROR` before any GitHub write). 7. Read `package.json` and `package-lock.json` (live: `readBaseFile`; dry-run: `targetDir`). 8. `bumpLockfile` (dry-run without a registry keeps `editManifests`). 9. With sabotage: add `test/smoke.test.js` built from `readBaseFile`; a missing file aborts. 10. Seal re-check, `createBranchWithFiles`, seal re-check (a seal here deletes the new `crypt/` branch and audits `REJECTED_SEALED`), `openPullRequest`. IF the PR call throws after the branch exists THEN `deleteBranch` runs. The adapter reports the SHA of the commit it wrote as the PR head, also after a 422 force-reset of its own `crypt/` branch. 11. Write the PR record and audit `PR_OPENED`. IF the record write fails the outcome is `ERROR` and stderr names the open PR for a human to close; the agent does not write again.

## Remote graft (Git Data API)

`GET /repos/o/r` (default branch), `GET git/ref/heads/<base>` (pin base SHA), `GET git/commits/<sha>` (base tree), `POST git/blobs` per file, `POST git/trees` with `base_tree`, `POST git/commits` (one commit, parent is the base SHA), `POST git/refs` for `refs/heads/crypt/...`. On 422 (leftover branch) `PATCH git/refs/heads/<branch>` with force, only for `crypt/` names. Then `POST pulls`. `readBaseFile` uses `GET contents/<path>?ref=<base sha>`, base64 decoded, files over 1 MB refused. `getCheckRuns` uses `GET commits/<sha>/check-runs`. PR state uses `GET pulls/<n>`; `merged_at` maps to landed.

## Lockfile bump

Applies to `lockfileVersion` 2 and 3 only. Exactly one `packages` key matching `node_modules/**/<name>` must have `version === from`. The registry dependency maps must deep-equal the entry's. Then set `version`, `resolved`, `integrity` (must start with `sha512-`), keep every other field and the key order. Update the range in `package.json` and in `packages[""]` with the existing `respec()` (`^` and `~` preserved, exact stays exact). For version 2 the legacy `dependencies[name]` block is updated too. Indent and trailing newline are preserved (`jsonIndent`). The result version must be >= the fixed version (`compareVersions`). Each abort has its own reason string. The demo lockfile stores only `version` per entry, so the bump adds `resolved` and `integrity` for the one package; the registry fixture is the source for both.

## Registry client

`npmRegistryClient({ fetch?, audit?, base? })`: `GET <registry>/<name>/<version>` (scoped names encoded as `@scope%2Fname`), 20 s timeout. Validates the JSON shape. `dist.tarball` must be https on the registry host. `dist.integrity` must be `sha512-`; if only `shasum` exists the client aborts instead of guessing. It never downloads the tarball.

## Audit and redaction

Both clients call `audit({ method, path })` before every request, without query string secrets, headers or bodies. The CLI hook appends `ISO\tlive-api\t-\tAPI_CALL\t<METHOD> <path>` to `crypt-audit.log`. IF the hook throws THEN the request is not sent. Every thrown `Error` passes through a redactor that replaces the token and `Bearer <token>` with `[redacted]`. Nothing prints headers.

## Preflight

`livePreflight({ repo, token, fetch, audit, warn })`: empty token, `ghp_` or `gho_` prefix, unreadable repo, no push permission, extra visible repositories each throw a `CliError` with an action to take (create a fine-grained token limited to the target with Contents RW, Pull requests RW, Checks R). A failed listing warns once and continues. The same preflight runs for `inquisit --live`, `reraise --live` and the standalone scripts. The warn-and-continue choice is deliberate: some enterprise setups block the listing endpoint, and the token still needs push on the target. The least-privilege listing is best effort: a fine-grained token limited to one repository may still be broader on other scopes, and GitHub offers no endpoint that lists a token's permissions, so the listing only catches visible repositories. Classic tokens are refused outright because they cannot be limited to one repository.

## Inquisitor live

`requiredCheck?: string` (live default `test`). Only runs with that name are judged: none yet is pending, completed success is green, completed with any other conclusion is red. The existing two-consecutive-polls rule stays. The timeout is `--timeout` seconds (default 600) converted into attempts with the injected sleep, with a floor of two attempts because green needs two consecutive polls. The seal is read before every poll. Timeout keeps the record; red moves it to `out/prs/rejected/` and audits `GRAFT_REJECTED`.

## Target record

`raid` writes `out/target.json` `{ "repo": "owner/name", "url": "...", "live": true }` after a successful exhume. `inquisit`, `reraise` and `graft` default `--repo` from it.

## CLI flags

| Command | New flags |
|---|---|
| `raid` | `--live`, `--timeout <seconds>`; `--live` needs a GitHub URL target and cannot combine with `--offline` |
| `graft` | `--sabotage`, `--i-know-this-is-a-demo`, plus `--live`; sabotage without both confirmations is a `UsageError` |
| `inquisit` | `--live`, `--timeout <seconds>` |
| `reraise` | `--live`, `--timeout <seconds>` |

## Session wiring

`SessionOpts.live?: { client, registry, timeoutMs, repo }`. After a live `PR_OPENED` the session starts the Inquisitor without blocking the dfrotz output loop, prints the PR URL, then `awaiting a human to land it` or `The graft was rejected. The creature remains.`

## Game

`generate.ts` adds `Global crypt_sealed = 0;`. `SealSub` prints its marker and sets it to 1. `GraftSub` still prints `[[CRYPT GRAFT <ID>]]` and, when `crypt_sealed` is 1, prints `The crypt is sealed. No needle moves.` instead of `The surgeon begins the graft.` Generated Inform source changes, so snapshots are regenerated and reviewed.

## Failure matrix

| Step | Remote effect | Local effect |
|---|---|---|
| Preflight | none | none, no clone |
| Seal active | none, zero calls | `REJECTED_SEALED` audit |
| Registry GET fails or fails validation | none | `ERROR`, no state |
| Lockfile abort | none | `ERROR`, no state |
| Base ref, blob, tree, commit failure | none | `ERROR`, no state |
| Ref created, PR call fails | branch deleted best effort | `ERROR`, no state |
| PR opened | PR and branch exist | PR record, `PR_OPENED` |
| Check polling error | none | no state change |
| `test` red or timeout | PR stays open | record to `rejected/`, `GRAFT_REJECTED`, limb Rotting |
| `test` green | none | `awaiting-human-merge` |
| Reraise API error | none | no state change |

## Audit outcomes

New: `API_CALL`. All outcomes from `necromancer` remain.
