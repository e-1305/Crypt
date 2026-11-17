# Design: necromancer

## Pipeline

```
game --> transcript --> watcher (src/bridge/watch.ts)
   GRAFT X: SEAL? -> X in out/limbs.json? -> out/requests/graft-NNN-x.json (+ audit)
        v
src/necromancer   graft request -> PR payload   (pure core, injected Fs, AdvisoryLookup, GithubClient)
        v
src/github/client.ts   GithubClient interface + dry-run client (out/prs/*.json)
scripts/github-client.ts   real REST adapter (fetch, GITHUB_TOKEN)
        v
src/inquisitor    check runs -> out/state.json (awaiting-human-merge)
        v   a human lands the PR
src/reraise       PR states -> healed limbs -> regenerate creature -> recompile
```

## Module layout

| Path | Role |
|---|---|
| `src/bridge/watch.ts` | adds `limbsPath` to `Ctx` and `readText` to `Fs`; mediation |
| `src/necromancer/version.ts` | pure semver compare and version selection |
| `src/necromancer/index.ts` | request to PR |
| `src/github/client.ts` | interface and dry-run client |
| `src/inquisitor/index.ts` | CI verification, state writes |
| `src/reraise/index.ts` | pure core of re-raise |
| `scripts/github-client.ts`, `scripts/osv-advisory.ts` | network adapters (real) |
| `scripts/necromancer.ts`, `inquisitor.ts`, `reraise.ts`, `check-necromancer.ts` | CLIs |

`tests/static.test.ts` bans `/merge/i`, `fetch(`, `https://` and octokit in `src/`. So `src/` says "landed" (`isLanded`), and the scripts adapter maps GitHub's merge timestamp to it. A second static check greps `src/` and `scripts/` for merge endpoints and commands. The one allowed use of the word in `src/` is the required state label `awaiting-human-merge` (and its audit outcome); the static test strips exactly that token before checking.

## Mediation

`Fs.readText(path)` reads a file (throws on error). On GRAFT/ASSIGN, after the SEAL check, the watcher reads and parses `limbsPath` (default `out/limbs.json`). The ID must be an own key of a plain object whose values are objects. Any failure to read or parse, or an unknown ID, gives audit `REJECTED_UNKNOWN_LIMB` and no write. Audit failure while rejecting is caught by the existing error path (`ERROR`).

## Version selection

Input: current version `c`; for every spawned vuln of the limb, the OSV `affected` ranges of type SEMVER or ECOSYSTEM for the package, each a list of events `introduced`, `fixed`, `last_affected`.

- A version `v` is affected by a range when some `introduced <= v` and `v < fixed` (or `v <= last_affected`) with the events processed in order. `introduced: "0"` is the minimum.
- Candidates: every `fixed` boundary, and the successor of every `last_affected` (the next patch, `x.y.(z+1)`), that is `>= c`.
- Choose the smallest candidate outside every range of every vuln. Prefer the same major as `c`. IF only a higher major works THEN `breaking: true`. IF none works THEN no PR.
- Pure and deterministic. A minimal comparator handles `major.minor.patch` and prerelease ordering; versions that do not parse are ignored (never chosen).

## State schema

`out/state.json`: `{ "schemaVersion": 1, "limbs": { "<LIMBID>": { "state": "awaiting-human-merge" | "healed", "pr": "<branch>", "updatedAt": "<ISO>", "ecosystem"?, "name"?, "to"? } } }`. The extra fields on healed entries let re-raise find the limb again after its ID left `out/limbs.json`. The PRs of a raid are counted from the records in `out/prs/` instead of a counter. Written to a temp file then renamed. Written only on a real change.

## Audit outcomes

Line format as before: `ISO\tcommand\tlimb\tOUTCOME\tURL-or-dash`. New outcomes: `REJECTED_UNKNOWN_LIMB`, `PR_OPENED`, `PR_EXISTS`, `ERROR`, `NO_FIX_AVAILABLE`, `REFUSED_NOT_SPAWNED`, `RAID_LIMIT`, `AWAITING_HUMAN_MERGE`, `GRAFT_REJECTED`, `HEALED`.

## PR body

Limb, version change, CVEs, KEV, EPSS, owner, `Healed by: (pending)`, audit ID, optional `breaking: true`. Built only from `creature.json` and the lookup table, never from git history.

## Lockfile edit

`package.json`: set the dependency spec to `^<version>` style preserved or exact when it was exact. `package-lock.json`: set `version` for `node_modules/<name>` and the legacy `dependencies` entry, and delete `resolved` and `integrity` for it (they refresh on the next `npm install`). The PR body says so.

## Failure modes

| Case | Result |
|---|---|
| sealed or seal unreadable | abort, zero calls, `REJECTED_SEALED` |
| `limbs.json` missing or invalid | reject, nothing written |
| non-spawned limb, no fixed version | no PR, audited |
| GitHub API error | no state change |
| CI failed, timed out, polling exhausted | stays Rotting, `GRAFT_REJECTED` |
| any ambiguity | change nothing (failsafe 1) |
