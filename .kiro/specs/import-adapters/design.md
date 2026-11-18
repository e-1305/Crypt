# Design: import-adapters

## Modules (`src/import/`, pure, browser-safe: no fs, no network, no Node APIs)
- `types.ts`: `ImportFormat`, `IMPORT_FORMATS`, `ImportError`, `RawFinding`, `ImportedLimb`.
- `purl.ts`: `parsePurl` for `pkg:npm/...` and `pkg:pypi/...`.
- `common.ts`: `toImported`, `normalizeSeverity`, `idsOf`, `asRecord` helpers.
- `sarif.ts`, `dependabot.ts`, `trivy.ts`, `grype.ts`, `snyk.ts`: `(root: unknown) => RawFinding[]`. Each throws `ImportError` when the file is not that format.
- `index.ts`: `parseImport(format, text, manifest)` parses JSON, runs the adapter, dedupes by `limbKey`, combines vulns with `combineOsvAnswers` (any unknown answer makes the limb unknown) and sorts with `compareLimbs`. Throws when no package is found.
- `build.ts`: `buildImportedCreature({format, text, file, name, kev, epss})`, same `creature.json` shape as `buildCreature` (schemaVersion 1) plus `import: {format, file}` and `vendorSeverity` per limb.

## Mapping
| Format | Package | Vulnerability |
| --- | --- | --- |
| SARIF | `properties.purl`, or `packageName`/`packageVersion`, or Trivy style "Package:" and "Installed Version:" message lines; ecosystem from purl, `properties.ecosystem` or the artifact file name | `ruleId`, aliases from `properties.aliases`, severity from `security-severity` |
| Dependabot | `dependency.package` (no installed version in the API, so version is unknown) | `security_advisory` GHSA id, CVE id and identifiers |
| Trivy | `Results[].Vulnerabilities[]` (PkgName, InstalledVersion, PURL), `Packages[]` for clean packages | `VulnerabilityID` |
| Grype | `matches[].artifact` | `vulnerability.id`, aliases from `relatedVulnerabilities` |
| Snyk | `vulnerabilities[]` (packageName, version, packageManager) | `id`, aliases from `identifiers.CVE` and `identifiers.GHSA` |

## Unknown, never Healthy
The limb model only has npm and PyPI. A problem with the package identity (no name, no version, unparsable purl, unsupported ecosystem) gives version `unknown`, which `rankLimbs` reports as `unknown: true` (`version-unpinned`). An unsupported ecosystem keeps its name as `<ecosystem>:<name>` under npm so nothing is dropped. A malformed vulnerability entry (no id) makes the whole answer for that limb undefined, so `rankLimbs` reports `osv-unavailable`. The vulnerability ids of an unidentified package are kept, so a KEV hit is still Possessed.

## Vendor severity
`rankLimbs` adds a severity (0 to 10) as the last tie breaker of the score, after KEV and EPSS. Imports pass `severity: null` to it, so a vendor label can never move a limb. The label is kept as the text field `vendorSeverity` (highest label of the limb: LOW, MEDIUM, HIGH, CRITICAL, or null). `severity` in creature.json is therefore 0 for imports.

## CLI
`--from <format>` is a value flag of `exhume` (`src/cli/parse.ts`, `help.ts`). `exhumeCommand` in `scripts/cli/raid.ts` passes the file to `scripts/exhume.ts` without opening a target directory. `scripts/exhume.ts` reads the file, calls `buildImportedCreature` and never calls OSV. Name comes from `--name` or the file name.

## Tests
`tests/import.test.ts`: golden per format, unknown paths, malformed input, determinism and severity property tests, purity of `src/import/`, end to end `exhume --from` plus `raise`. CLI parse cases in `tests/cli.test.ts`.
