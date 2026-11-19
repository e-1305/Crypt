# Changelog

## 0.2.0

- `crypt alerts --format issues`: one GitHub issue per KEV limb (dry run by default, `--live` to open).
- `crypt alerts --format ocsf`: OCSF 1.1 Vulnerability Findings (class 2002) for Security Lake, Splunk and Sentinel. See docs/SOC.md.
- `crypt alerts --format sarif` and Action input `upload-sarif`: SARIF 2.1.0 for GitHub Code Scanning (KEV error, EPSS warning, owner team, SLA). Results anchor to the real manifest path (`--base`, set from the Action `path`), and the upload is skipped on fork PRs. See docs/SOC.md.
- SLA column and CSV/JSON export in the scan result.
- Explicit "scan your own repo" hero, compact phone layout, inspectable exorcised list.
- GitHub Action, graveyard, War Room and CISO report sample pages.
- `npm run traction` reports "downloads not indexed yet" instead of "not published" when the registry lists versions.

## 0.1.0

- First release.
