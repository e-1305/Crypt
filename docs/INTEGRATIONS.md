# Works with your stack

CRYPT can raise a creature from a scanner file you already have. The file is read on your machine. CRYPT makes no OSV call for an import. Ranking uses the local KEV and EPSS feeds, the same as for a lockfile.

```
npx crypt exhume --from <sarif|dependabot|trivy|grype|snyk> <file> [--feeds data/feeds] [--out out/creature.json]
```

Then `crypt raise` and `crypt play` work as usual.

| Tool | Make the file | Import it |
| --- | --- | --- |
| SARIF 2.1.0 | any scanner that writes SARIF, for example `trivy fs . -f sarif -o results.sarif` | `npx crypt exhume --from sarif results.sarif` |
| GitHub Dependabot alerts | `gh api repos/OWNER/REPO/dependabot/alerts --paginate > alerts.json` | `npx crypt exhume --from dependabot alerts.json` |
| Trivy | `trivy fs . -f json -o trivy.json` (add `--list-all-pkgs` to include clean packages) | `npx crypt exhume --from trivy trivy.json` |
| Grype | `grype dir:. -o json > grype.json` | `npx crypt exhume --from grype grype.json` |
| Snyk | `snyk test --json > snyk.json` | `npx crypt exhume --from snyk snyk.json` |

## What is read

- Package ecosystem, name, version, and the vulnerability ids with their CVE and GHSA aliases. Only npm and PyPI packages are modelled.
- SARIF is not package oriented. CRYPT reads `properties.purl`, `packageName` and `packageVersion`, or the `Package:` and `Installed Version:` lines that Trivy writes into the message.
- Dependabot alerts carry no installed version, so every Dependabot limb is Unknown. Alerts with state `fixed` are skipped.
- Findings of one package and version are merged into one limb. The order of the findings in the file does not matter.

## Safety notes

- **Ranking is deterministic.** KEV decides first, then EPSS. The severity written by the tool is shown as `vendorSeverity` and is never used to rank or to set a state.
- **Unknown stays Unknown.** A finding with no name, no version, an unparsable purl, an unsupported ecosystem (for example Go) or a vulnerability entry without an id is marked Unknown. It is never Healthy.
- **Bad input changes nothing.** Invalid JSON, a file of another format, or a file without packages stops with an error, and no creature.json is written.
- **Nothing is run.** The file is parsed as data. The import makes no network call.
- **Owners.** Imported limbs show "no owner yet". The file name is the manifest.
