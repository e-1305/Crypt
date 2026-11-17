# Requirements: necromancer

Goal: a `GRAFT <LIMB>` typed in the game becomes a reviewable fix PR for one dependency (Necromancer), CI is checked by a separate agent (Inquisitor), a human lands the PR, and the creature is re-raised without that limb. Follows `.kiro/steering/failsafe.md`, `blameless.md` and `tech.md`. Driven by issue #11 (Tier 1). Does not touch `web/` or `src/exhume/`.

Terms. **Limb ID**, **Lookup table** (`out/limbs.json`), **Marker**: as in `raise-the-creature`. **Graft request**: `out/requests/graft-NNN-<limb>.json`. **SEAL**: the file `.crypt-seal`. **Landed**: a PR that a human has accepted into the default branch. The word for this in `src/` is "landed"; no code path of ours performs it.

## N1 Complete mediation in the watcher
1. WHEN the watcher handles a GRAFT or ASSIGN for a limb ID, it SHALL first check that the ID is a key of `out/limbs.json`.
2. An unknown ID SHALL write nothing (no request file) and SHALL append one audit line with outcome `REJECTED_UNKNOWN_LIMB`.
3. IF `out/limbs.json` is missing, unreadable or not a valid lookup table, THEN every GRAFT and ASSIGN SHALL be rejected the same way (fail-safe).
4. Known IDs SHALL behave as before. SEAL is checked before the lookup; a sealed watcher audits `REJECTED_SEALED`.

## N2 Necromancer: graft request to PR
1. Input is a graft request. The Necromancer SHALL check the SEAL first. IF sealed or unreadable THEN it SHALL abort with zero GitHub calls and audit `REJECTED_SEALED`.
2. It SHALL resolve the limb ID through `out/limbs.json` only. An unknown ID gives no PR and an audit line.
3. It SHALL refuse a limb that is not spawned in `out/creature.json`.
4. It SHALL choose the target version with the algorithm in the design. IF none exists THEN no PR is opened and the outcome is audited.
5. It SHALL edit `package.json` and `package-lock.json` of the target repository on branch `crypt/graft-<limb>-<version>`, one dependency per PR.
6. It SHALL open at most 5 PRs per raid.
7. The PR body SHALL contain the limb, its CVEs, KEV and EPSS, the owner (from `creature.json`, which comes from CODEOWNERS), a `Healed by: (pending)` placeholder, an audit ID, and `breaking: true` when the bump crosses a major version. It SHALL never name a commit author.

## N3 GitHub access with no merge
1. Code in `src/` talks to GitHub only through the `GithubClient` interface with the methods `createBranchWithFiles`, `openPullRequest`, `getCheckRuns`, `getPullRequestState`. The interface has no method that lands a PR.
2. The dry-run client writes the PR payload to `out/prs/<branch with / replaced by ->.json` and makes no call.
3. The real REST adapter lives in `scripts/` (network code is banned from `src/`). It uses `GITHUB_TOKEN` and `--repo owner/name`.
4. Neither `src/` nor `scripts/` SHALL contain `gh pr merge`, a `/merge` endpoint, a merge mutation or auto-merge. `tests/static.test.ts` enforces this.

## N4 Inquisitor: verify the PR
1. The Inquisitor SHALL check the SEAL first (zero calls when sealed).
2. It SHALL poll check runs with a bounded number of attempts and an injected sleep.
3. WHEN all runs are completed and successful, it SHALL record the limb as `awaiting-human-merge` in `out/state.json` and audit it.
4. WHEN any run failed, timed out or was cancelled, or polling ran out of attempts, the limb SHALL stay Rotting and the audit SHALL say `GRAFT_REJECTED` with the text `The graft was rejected. The creature remains.`
5. An API error SHALL change nothing and write no state.
6. `out/state.json` SHALL be written atomically, and only on a real transition.

## N5 Re-raise
1. `npm run reraise` SHALL read PR states through `GithubClient`. For each PR that landed, the limb SHALL be marked `healed` in `out/state.json`.
2. The creature SHALL be regenerated with healed limbs Healthy and not spawned, then recompiled. A healed limb SHALL NOT spawn again.
3. Any API error SHALL change no state. SEAL SHALL abort all calls.

## N6 SEAL
After `SEAL CRYPT`, Necromancer, Inquisitor and re-raise SHALL make zero API calls for any input.

## N7 Dry-run
The Necromancer and Inquisitor CLIs accept `--dry-run`. It is the default when `GITHUB_TOKEN` is unset. Tests always run dry and offline with a mocked client.

## N8 Evidence and records
1. Advisory ranges (OSV `affected.ranges`) come from an injected `AdvisoryLookup`. Offline fixtures live in `fixtures/vulnerable-npm/advisories/` and are recorded in `docs/ATTRIBUTION.md`.
2. `scripts/check-necromancer.ts` is the acceptance run. `docs/KIRO.md` records specs, agents, properties and traceability.
3. Custom agents `.kiro/agents/necromancer.json` and `inquisitor.json` separate privilege: the Necromancer writes fixes, the Inquisitor can only read code.

## Property tests
| Property | Rule |
|---|---|
| Unknown limb IDs never write a request; every rejection is audited | N1, failsafe 5, 8 |
| Mocked client records zero merge-like calls for random inputs | N3, failsafe 2 |
| Any GitHub or CI error leaves `out/state.json` byte-identical | N4, N5, failsafe 1 |
| After SEAL, zero API calls for any input | N6, failsafe 7 |
| Unknown limbs never produce a PR | N2, failsafe 5 |
| Chosen version is >= current, outside every range, and the minimum such candidate | N2 |
| At most 5 PRs per raid, one dependency per PR | N2, failsafe 6 |
| PR body has the required fields and no commit author | N2, blameless |
