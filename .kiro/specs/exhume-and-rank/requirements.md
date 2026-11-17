# Requirements: exhume-and-rank

Goal: `npx crypt exhume <path-or-github-url>` produces a deterministic, ranked list of limbs (packages) from a real repository, and works offline once its data is cached. Follows `.kiro/steering/failsafe.md`, `blameless.md` and `sla-policy.md`. Driven by issue #5 (Tier 1).

Terms. **Limb**: one `package@version` (direct or transitive). **Manifest**: the lockfile a limb was read from. **Feed**: a local copy of CISA KEV (JSON) or FIRST EPSS (CSV) in `data/feeds/`. **Unknown**: the tool could not establish whether a limb is clean. **Finding**: any limb whose state is not Healthy. **Spawned**: a finding that becomes a monster. **Exorcised**: a finding that is not spawned and not Unknown. **Unresolved**: an Unknown finding that is not spawned.

## E1 Lockfile parsing
1. The scanner SHALL read `package-lock.json` (lockfileVersion 2 or 3, `packages` map) and emit one limb per distinct `name@version`, direct and transitive. Root (`""`) and `link` entries are skipped.
2. A limb SHALL be `direct` when its name is a top-level dependency (dependencies, devDependencies, optionalDependencies or peerDependencies) of the root package.
3. The scanner SHALL read `requirements.txt` and emit a limb only with the exact version for lines of the form `name==version`. Any other requirement line (ranges, unpinned, VCS, URL) SHALL be reported as a limb with version `unknown` and SHALL never be Healthy. Versions SHALL never be guessed. Comments, blank lines and option lines (`-r`, `--index-url`) are skipped.
4. Unsupported or malformed lockfiles (for example lockfileVersion 1, invalid JSON) SHALL be an error with a non-zero exit code. No creature is written.
5. Limbs SHALL be deduplicated and sorted by `ecosystem`, `name`, `version`.

## E2 OSV lookup and cache
1. Vulnerabilities SHALL be looked up with the OSV `querybatch` API. The network client lives in `scripts/`; `src/` receives an injected lookup function.
2. Every answer SHALL be cached in `data/cache/osv/`, one file per `ecosystem`, `name` and `version`, so a rerun needs no network.
3. WHEN the cache has an entry newer than 7 days, or the scanner runs offline, the scanner SHALL not call the lookup. An older entry SHALL be refreshed; if the refresh fails the limb SHALL be Unknown (stale), never Healthy.
4. IF a limb has no cache entry and the lookup fails, is absent (offline) or answers incompletely, THEN the limb SHALL be Unknown and SHALL NOT be Healthy. A corrupt cache file SHALL be treated as a miss.

## E3 Exploit intel feeds
1. `npm run feeds:update` SHALL download the CISA KEV JSON and the FIRST EPSS CSV (gzip) into `data/feeds/kev.json` and `data/feeds/epss.csv`.
2. A scan SHALL read only these local files and SHALL never download a feed.
3. The output SHALL record the feed dates: KEV `dateReleased` and the EPSS `score_date`.
4. IF a feed is missing or unparseable, THEN the output SHALL record its status as `missing` and no limb SHALL be Healthy.

## E4 Deterministic ranking (sla-policy.md)
1. States are `Healthy`, `Rotting`, `Possessed`. A limb is Possessed when any CVE id of its vulnerabilities, including aliases, is in KEV. It is Rotting when it has at least one vulnerability and is not Possessed. Otherwise it is Healthy.
2. Order: Possessed first, then Rotting by max EPSS descending, then by max severity descending, then by `ecosystem:name@version` ascending. Unknown limbs rank after known limbs of the same state.
3. The score SHALL be a pure function of `{kev, epss, severity}`, with no LLM and no clock. KEV always outranks non-KEV. The score is monotonic in EPSS.
4. An Unknown limb SHALL have state `Rotting` and `unknown: true` (failsafe: unknown is never clean).

## E5 Noise exorcism
1. Spawned = Possessed, plus Rotting limbs with max EPSS >= 0.1.
2. The output SHALL carry counts: `findings`, `exorcised`, `spawned`, `unresolved` (and `limbs`, `possessed`, `rotting`, `healthy`, `unknown`).

## E6 Ownership (blameless.md)
1. The owner SHALL come only from CODEOWNERS, searched in `.github/`, the repository root, then `docs/` (first file found is used). The last matching rule wins.
2. The owner of a limb SHALL be the owner of its manifest path. No match means `unowned`.
3. The code SHALL never call git blame or read commit data. No output field SHALL contain a commit author or committer.

## E7 Output
1. The scanner SHALL write `out/creature.json` with the schema in `design.md` and print a short summary: totals, exorcised, spawned, feed dates, top limbs.
2. The same inputs SHALL give a byte-identical `creature.json`. It contains no run timestamp, only feed dates.
3. The target SHALL be a local path or a GitHub URL (`https://github.com/<owner>/<repo>`). For a URL the manifests and CODEOWNERS are downloaded by `scripts/` from the repository's default branch.

## E8 Safety and attribution
1. `src/` SHALL contain no network call, no merge call, no LLM import and no git access (`tests/static.test.ts`).
2. OSV, KEV and EPSS terms SHALL be recorded in `docs/ATTRIBUTION.md`.

## E9 Acceptance fixture
`fixtures/vulnerable-npm/` SHALL hold a pinned old lockfile with at least one KEV-listed CVE and several non-KEV CVEs. `npm run exhume -- fixtures/vulnerable-npm` SHALL print totals and write `creature.json`, and a rerun offline SHALL produce identical bytes.
