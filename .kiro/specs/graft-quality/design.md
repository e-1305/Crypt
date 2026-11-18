# Design: graft-quality

## Choosing the version (`src/necromancer/version.ts`)
- `chooseVersion(eco, name, current, advisories)`: candidates are `fixed` bounds and the patch after each `last_affected`. A candidate is kept only when it is outside every range and every `versions` list of every advisory given. The smallest kept candidate wins. `breaking = isBreaking(current, pick)`.
- `isBreaking(from, to)`: higher major, or both 0.x with a higher minor.
- `chooseGroupVersion(eco, name, installed, rotting, advisories)`: affected copies are the rotting ones plus every installed version that any advisory marks affected. It calls `chooseVersion` from the highest affected copy, and sets `breaking` when any affected copy crosses a breaking boundary. Returns `from` (lowest affected copy) and `affected` (all, ascending).
- `src/necromancer/advisory.ts` also keeps the OSV `versions` list.

## All advisories of a package (`src/necromancer/package-advisories.ts`)
`fetchPackageAdvisories(fetch, eco, name)` posts `{package}` to `api.osv.dev/v1/query`, follows `next_page_token` (at most 20 pages), skips withdrawn records, and fails (no partial answer) on any HTTP error, rate limit, unparseable record or leftover page. `unionAdvisories` joins it with the advisories of the copies' own vulnerability IDs.
- Web: `buildPayloads` in `src/web/live-exhume.ts`.
- CLI: `AdvisoryLookup.forPackage` (set by `osvAdvisories()` and by `fixtureAdvisories(dir)`, which reads every advisory file in the folder).

## Grouping (`src/exhume/group.ts`)
`groupLimbs(limbs)` returns one `PackageGroup` per ecosystem and name, in rank order: versions, `kind`, worst state, best rank, KEV, max EPSS. `liveExhume` returns `groups` next to `limbs`. `src/render/plate.ts` collapses copies into `lodash x4` (counts keep counting copies, as creature.json does).

## One PR per package (`src/necromancer/index.ts`)
`graft` collects all copies of the requested limb's package, unions advisories, calls `chooseGroupVersion`, and refuses when a PR record exists for the same ecosystem and name.

## Direct and transitive (`src/necromancer/lockfile.ts`)
- Direct: `bumpLockfile` / `editManifests` as before, from the direct copy's version. No graft when the direct copy is already at or above the chosen version.
- Transitive: `overrideLockfile` sets `overrides[name] = ">=<fixed>"` (`setOverride`) and rewrites every lockfile copy below the fixed version from registry metadata; without a registry (dry run) `editManifests(..., { transitive: true })` drops `resolved` and `integrity` for those copies.

## Copy
`ownerLabel()` in `src/exhume/owners.ts`, used by `prBody`, `summarize` and `web/live-exhume.js`.

## Tests
`tests/graft-quality.test.ts` on `fixtures/graft-quality/` (direct lodash with a nested 2.4.2 copy, transitive minimist with two copies; advisory GQ-LODASH-3 only appears in the package-wide list).
