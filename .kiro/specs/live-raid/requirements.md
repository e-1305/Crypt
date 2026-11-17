# Requirements: live-raid

Goal: the Tier 1 finale. `crypt raid <github-url> --live` opens a real fix PR on `e-1305/crypt-demo` through the GitHub Git Data API, the Inquisitor polls the `test` check on the PR head SHA, a human lands the PR on GitHub, and `crypt reraise` shows the limb HEALED. A demo-only sabotage flag makes CI go red on purpose. Driven by issue #24. Builds on `.kiro/specs/necromancer/` and follows `.kiro/steering/failsafe.md`, `blameless.md` and `tech.md`. Does not touch `web/` or `src/exhume/`.

Terms. **Live mode**: a run with `--live`, where the real GitHub REST adapter and the real npm registry client replace the dry-run client. **Remote graft**: creating the branch, the commit and the PR on the target repository through the GitHub API, with no local checkout of the target being edited. **Head SHA**: the commit SHA of the graft branch tip, returned when the PR is opened; check runs are read for it. **Sabotage**: a deliberately broken change added to `test/smoke.test.js` on a separate graft branch so that CI goes red; a demo feature only. **Limb ID**, **Lookup table**, **SEAL**, **Landed**: as in `necromancer`. The word for "landed" in `src/` and `scripts/` is "landed"; no code path of ours performs it.

## L1 Live preflight
1. `--live` SHALL require `GITHUB_TOKEN`. IF it is unset or empty THEN the command SHALL stop with a message that says how to create the token (fine-grained, only the target repository, Contents read and write, Pull requests read and write, Checks read).
2. Classic tokens (prefix `ghp_` or `gho_`) SHALL be refused with a message that asks for a fine-grained token (prefix `github_pat_`).
3. `GET /repos/<target>` SHALL succeed and report push permission. Otherwise the command stops and names the missing access.
4. Best effort least-privilege check: `GET /user/repos?per_page=100`. IF any repository other than the target is visible THEN the command SHALL stop, state how many extra repositories the token can see, and explain how to create a token limited to the target. IF the listing is unavailable (403 or 404, or a network error) THEN it SHALL print a one-line warning that the check could not run and continue.
5. Every preflight failure SHALL happen before any write and before the clone of the target.

## L2 Remote graft
1. For a GitHub URL target in live mode the Necromancer SHALL create the fix with the Git Data API: read the base ref, create blobs, create a tree on the base tree, create ONE commit, create the ref `refs/heads/crypt/graft-<limb>-<version>`, then open the PR. It SHALL NOT push to the default branch.
2. The metadata of the new version SHALL come from the npm registry with GET requests only (`<registry>/<name>/<version>`). The code of the package SHALL never be downloaded, executed or installed. No `npm install`, no scripts.
3. The lockfile bump SHALL set `version`, `resolved` and `integrity` of the one lock entry for the package, and the dependency range in `package.json` and in the root entry of the lockfile (`^` or `~` preserved).
4. The Necromancer SHALL abort (fail-safe, outcome `ERROR`, clear message, no PR) WHEN any of these holds:
   - `lockfileVersion` is lower than 2;
   - there is not exactly one lock entry for the package at the old version;
   - the registry integrity is missing or is not `sha512-`;
   - the `dependencies`, `optionalDependencies` or `peerDependencies` of the new version differ from the existing lock entry (the transitive tree would change);
   - the new version is lower than the chosen fixed version.
5. Any GitHub or registry error at any step SHALL open no PR and change no local state. A branch this run created SHALL be deleted on a best effort basis (only names starting with `crypt/`).
6. All version selection, one-dependency-per-PR and 5-PR rules of `necromancer` N2 still apply. The registry is asked only after those checks pass.

## L3 Inquisitor live
1. The Inquisitor SHALL poll check runs on the PR head SHA and judge only the check named `test`.
2. The timeout is configurable with `--timeout <seconds>`; the default is 10 minutes.
3. WHEN `test` completes with success, the limb SHALL be recorded as `awaiting-human-merge` and the audit SHALL say so.
4. WHEN `test` completes red, never appears, or the timeout passes, the outcome SHALL be `GRAFT_REJECTED`, the limb stays Rotting, and the text is `The graft was rejected. The creature remains.`
5. The seal SHALL be re-checked on every poll. An API error SHALL change nothing.

## L4 Game feedback
1. After `SEAL CRYPT`, `GRAFT <ID>` in the game SHALL print `The crypt is sealed. No needle moves.` instead of `The surgeon begins the graft.`
2. The sealed flag is in-game state. The watcher and every agent SHALL still refuse through the file `.crypt-seal` (defense in depth).

## L5 Reraise
1. `crypt reraise --live` SHALL read the state of each recorded PR through the API, mark the landed ones healed, and regenerate the creature, the plate and the story.
2. A healed limb SHALL show HEALED on the plate.
3. An API error SHALL change no state. SEAL SHALL abort all calls.

## L6 Sabotage (demo only)
1. `crypt graft <limb> --sabotage` SHALL be off by default.
2. It SHALL be refused with a usage error unless both `--live` and `--i-know-this-is-a-demo` are present.
3. It SHALL append a clearly labelled failing test to `test/smoke.test.js` on the branch `crypt/graft-<limb>-<version>-sabotage`, so that CI goes red. The PR title SHALL start with `[DEMO SABOTAGE]` and the body SHALL say that it is deliberately broken.
4. `docs/DEMO.md` SHALL document the flag and label it as a demo.

## L7 Audit
1. Every live API call, GitHub and registry, SHALL be appended to `crypt-audit.log` as method and path, before the request is sent. Never the token, never headers or request bodies.
2. IF the audit write fails THEN the request SHALL NOT be sent.
3. Agent actions keep the existing TSV audit lines (`necromancer` F8).

## L8 No merge, token secrecy
1. Neither `src/` nor `scripts/` SHALL contain a merge endpoint, call, mutation or auto-merge. The adapter has no method that lands a PR. `tests/static.test.ts` enforces this and a mocked-client test asserts it at run time.
2. The token SHALL never appear in stdout, stderr, `crypt-audit.log`, files under `out/`, or error messages, including errors whose upstream text contains the token.
3. Network code stays in `scripts/`; `src/` talks through the `GithubClient` and `RegistryClient` interfaces.

## Property tests
| Property | Rule |
|---|---|
| No request path or method to a merge endpoint over random raids; the mocked client records zero merge-like calls | L8, failsafe 2 |
| An API or registry failure at any step k leaves `out/` byte-identical, opens no PR and leaves no `crypt/` ref in the fake | L2.5, failsafe 1 |
| A lockfile bump changes exactly one package entry, new version >= fixed version, integrity equals the registry fixture, all other entries and key order unchanged | L2.3, L2.4 |
| Abort cases (lockfile v1, duplicate entry, integrity missing or not sha512, dependency set changed, version below fixed) produce no output | L2.4 |
| `--sabotage` is refused unless both `--live` and `--i-know-this-is-a-demo` are present | L6.2 |
| The token never appears in any captured output, audit log or `out/` file for random error injections | L8.2 |
| After SEAL, zero API calls for any input, also between polls | L3.5, failsafe 7 |
| Every API request has exactly one audit line, in order; if the audit write fails the request is not sent | L7 |
| Preflight failures (no token, classic token, no push access, extra repository) make zero write calls | L1.5 |
| `test` check judged by name: other check runs never decide the outcome | L3.1 |
| At most 5 PRs per raid, one dependency per PR | L2.6, failsafe 6 |
