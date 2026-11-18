# Requirements: import-adapters

Goal: CRYPT raises a creature from what security teams already have, not only lockfiles and OSV (issue #101, Epic D, D2 "Works with your stack"). Follows `.kiro/steering/failsafe.md`, `blameless.md`, `sla-policy.md` and `product.md`. Builds on `exhume-and-rank`.

Terms: **Format** is one of `sarif`, `dependabot`, `trivy`, `grype`, `snyk`. **Vendor severity** is the severity label a tool wrote in its file.

## I1 Formats
1. The adapters SHALL read SARIF 2.1.0, GitHub Dependabot alerts (REST JSON array), Trivy JSON, Grype JSON and `snyk test --json`.
2. Each adapter SHALL map findings to the existing limb model: ecosystem (npm or PyPI), name, version, and vulnerabilities with their CVE and GHSA aliases.
3. Findings of the same package and version SHALL be merged into one limb. Output order SHALL not depend on input order.

## I2 Ranking stays deterministic
1. Ranking SHALL use the existing `rankLimbs`: KEV, then EPSS from the local feeds.
2. Vendor severity SHALL be shown (`vendorSeverity`) and SHALL NOT be used for ranking or state.
3. Property test: changing any vendor severity never changes the limb order or any state.

## I3 Fail-safe
1. A finding with no package name, no version, an unparsable purl, an unsupported ecosystem or a malformed vulnerability entry SHALL give a limb with `unknown: true`. It SHALL never be Healthy.
2. Invalid JSON, a file of another format, or a file without any package SHALL throw a clear error. No creature.json is written.
3. Nothing from the file is executed, and the adapters make no network call.

## I4 CLI
1. `crypt exhume --from <format> <file>` SHALL treat the target as a file. An unknown format is a usage error. `--from` belongs to `exhume` only.
2. The run is offline: no OSV call. KEV and EPSS come from `--feeds`.
3. The creature.json has the same shape as an exhume of a lockfile, and `raise` accepts it.

## I5 Docs and fixtures
1. `fixtures/import/<format>.json` is small, synthetic and licence-clean, with golden outputs in `fixtures/import/golden/`.
2. `docs/INTEGRATIONS.md` gives one command per tool.
