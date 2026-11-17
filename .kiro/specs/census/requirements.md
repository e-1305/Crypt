# Requirements: census

Goal: run CRYPT's exhume (not the game) on 20 popular public projects and publish **aggregate** numbers for the demo video and blog. Driven by issue #15 (Top 5 multiplier, Impact proof). Independent of other work: adds only `scripts/census/`, `docs/census/`, this spec, one `package.json` script and one test file. Follows `.kiro/steering/blameless.md`, `failsafe.md`, `sla-policy.md` and `tech.md`.

Terms. **Repo list**: `docs/census/repos.md`. **Raw data**: `out/census/` (gitignored). **Results**: `docs/census/RESULTS.md`. **Counts** are those of `countLimbs` in `src/exhume/rank.ts`: findings = limbs that are not Healthy; exorcised = findings that are not spawned and not unknown; spawned = Possessed limbs plus Rotting limbs with EPSS >= 0.1; unresolved = unknown findings that are not spawned.

## C1 Repo list
1. `repos.md` SHALL list exactly 20 repositories: 10 npm with a root `package-lock.json` (v2 or v3) and 10 Python with a root `requirements.txt` containing `==` pins. Sizes SHALL be mixed.
2. Each row SHALL carry the ecosystem, `owner/name` and the full 40 character commit SHA that is scanned.
3. The census SHALL read the repository only at that SHA, so a rerun scans the same files.

## C2 Read-only scan
1. The census SHALL never run target code, install dependencies, run package scripts or write into the target. It only downloads the root manifests and CODEOWNERS files at the pinned SHA, as text.
2. It SHALL use the same `buildCreature` as `npm run exhume`, with the KEV and EPSS feeds from `data/feeds/`. Feeds SHALL come from the feeds directory only, never from a scanned repository.
3. A missing feed, a repository that cannot be read, or a repository with no supported manifest SHALL abort the run with a non-zero exit before `RESULTS.md` is written (fail-safe: change nothing).
4. OSV answers SHALL be cached in `out/census/osv-cache/`, not in the committed `data/cache/osv/`.

## C3 Aggregates
1. Results SHALL contain: total limbs, % of limbs that are findings, % of findings exorcised by the noise filter, % of findings spawned, number of possessed (KEV) limbs, % of limbs with no CODEOWNERS owner (owner `unowned`), and the median findings per repo before exorcism (findings) and after (spawned).
2. Limbs whose status could not be established (unknown) SHALL be counted and reported, never treated as clean.
3. The median of an even count SHALL be the mean of the two middle values.

## C4 Blameless publication
1. `RESULTS.md` SHALL publish aggregates only: no per-repo table, no project name, and no package name next to a finding. The renderer takes aggregate numbers only, and the run refuses to write a file that contains any `owner/name` from `repos.md`.
2. Per-repo raw data SHALL stay in `out/census/` (gitignored).
3. Owners come from CODEOWNERS only. No git history is read, so no commit author can appear.

## C5 Results document
1. The top of `RESULTS.md` SHALL hold 3 headline sentences usable in a video, built from the aggregates, e.g. "Across 20 popular projects, CRYPT's filter cut N findings to M monsters".
2. `RESULTS.md` SHALL state the scan date (UTC), the KEV and EPSS feed dates, and the limitations (lockfile only, no reachability, only root manifests, `==` pins only for Python, OSV and feed data change daily).
3. Rerunning `npm run census` SHALL regenerate `RESULTS.md` from `repos.md`.
