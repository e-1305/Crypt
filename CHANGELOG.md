# Changelog

## Unreleased

- Brand tokens: `docs/BRAND.md` and `web/brand.css` (palette, type, spacing, radius, focus ring, motion), loaded first by every page.
- Surgeon's theatre in the 3D bench (#217): repos as labelled jars on a shelf, the creature on the table, a tool tray (scalpel EXAMINE, needle GRAFT, magnifier simulated CI, lamp SEAL, bell reraise) lifted when the command runs, and one plain narrator line per step with a hidden live DOM twin. The text commands and the 2D page are unchanged.
- `crypt init` (P4): one onboarding pull request with the workflow in report mode and, if missing, a CODEOWNERS draft with team placeholders.
- Buyer page `/for-teams.html` and a design-partner issue template (P5).
- The Action self-test uploads SARIF to this repository's Code Scanning.

- Import scan for npm (P3a, `src/exhume/usage.ts`): a static, deterministic text scan that labels each locked package `direct`, `transitive`, `dev` or `unknown`. It is not a reachability claim. Wired into the CLI summary, creature.json, OCSF `unmapped.usage` and SARIF `properties.usage` by P3b (#200).
- Run history, ageing and SLA trend (P2): `out/crypt-history.jsonl` with one line per limb per run, Action input `history-branch` (only `crypt-history`, never the default branch), and four panels on the autopsy page and in the War Room: open KEV limbs over time, age per limb, deadline breaches, mean time to heal. Unknown values read `unknown`. Seeded with the real crypt-demo events of 2026-11-18.

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
