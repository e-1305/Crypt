# Changelog

## Unreleased

- "Is it used?" signal per npm limb (`imported directly`, `transitive only`, `dev only`, `unknown`): a static text scan of imports plus the lockfile dev flag. Shown in the plate, summary, paste result, CSV/JSON export (`used` column) and OCSF (`unmapped.used`). Limits are written next to it. See the manual.

## 0.2.0

- `crypt alerts --format issues`: one GitHub issue per KEV limb (dry run by default, `--live` to open).
- `crypt alerts --format ocsf`: OCSF 1.1 Vulnerability Findings (class 2002) for Security Lake, Splunk and Sentinel. See docs/SOC.md.
- SLA column and CSV/JSON export in the scan result.
- Explicit "scan your own repo" hero, compact phone layout, inspectable exorcised list.
- GitHub Action, graveyard, War Room and CISO report sample pages.
- `npm run traction` reports "downloads not indexed yet" instead of "not published" when the registry lists versions.

## 0.1.0

- First release.
