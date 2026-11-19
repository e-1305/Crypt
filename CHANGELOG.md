# Changelog

## Unreleased

- Run history, ageing and SLA trend (P2): `out/crypt-history.jsonl` with one line per limb per run, Action input `history-branch` (only `crypt-history`, never the default branch), and four panels on the autopsy page and in the War Room: open KEV limbs over time, age per limb, deadline breaches, mean time to heal. Unknown values read `unknown`. Seeded with the real crypt-demo events of 2026-11-18.

## 0.2.0

- `crypt alerts --format issues`: one GitHub issue per KEV limb (dry run by default, `--live` to open).
- `crypt alerts --format ocsf`: OCSF 1.1 Vulnerability Findings (class 2002) for Security Lake, Splunk and Sentinel. See docs/SOC.md.
- SLA column and CSV/JSON export in the scan result.
- Explicit "scan your own repo" hero, compact phone layout, inspectable exorcised list.
- GitHub Action, graveyard, War Room and CISO report sample pages.
- `npm run traction` reports "downloads not indexed yet" instead of "not published" when the registry lists versions.

## 0.1.0

- First release.
