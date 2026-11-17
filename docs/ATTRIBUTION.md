# Attribution & third-party disclosure

Kiroween rules require disclosing any pre-existing code or work incorporated into the project,
and using third-party SDKs, APIs and data in line with their terms. Keep this file up to date.

| Component | Type | Used for | License / terms | Link |
|---|---|---|---|---|
| OSV | API + data | Vulnerability lookup for npm / PyPI (`api.osv.dev` `querybatch` and `vulns/<id>`, answers cached in `data/cache/osv/`) | Free public API, no key. Each source database keeps its own licence (OSV `docs/data.md`, checked): GitHub Advisory Database (npm) CC-BY 4.0, PyPA Advisory Database (PyPI) CC-BY 4.0. Attribution: advisory ids and aliases in `creature.json` come from OSV / GitHub Advisory Database / PyPA | https://osv.dev |
| CISA KEV catalog | Data | Actively exploited CVEs, downloaded by `npm run feeds:update` to `data/feeds/kev.json`; a filtered snapshot (the fixture's CVEs only) is committed in `fixtures/vulnerable-npm/feeds/` | CC0 1.0 (`cisagov/kev-data` LICENSE and README, checked). No endorsement by CISA or DHS is implied; the CISA logo and DHS seal are not used | https://www.cisa.gov/known-exploited-vulnerabilities-catalog |
| FIRST EPSS | Data | Exploit probability scores, downloaded by `npm run feeds:update` to `data/feeds/epss.csv`; a filtered snapshot (the fixture's CVEs only) is committed in `fixtures/vulnerable-npm/feeds/` | Free to use, no registration; attribution requested (FIRST EPSS FAQ, checked). Attribution: EPSS data by FIRST.org, Inc. (https://www.first.org/epss/) | https://www.first.org/epss/ |
| OSV advisory records (affected ranges) | Data | Trimmed copies (id, aliases, `affected` SEMVER ranges for the package) of the fixture's advisories fetched from `api.osv.dev/v1/vulns/<id>`, committed in `fixtures/vulnerable-npm/advisories/` so the Necromancer runs offline; the live Necromancer fetches the same endpoint | Same as the OSV row: free public API; GitHub Advisory Database records are CC-BY 4.0. Attribution: advisories from OSV / GitHub Advisory Database | https://osv.dev |
| GitHub REST API | API | Necromancer opens fix PRs and the Inquisitor and re-raise read check runs and PR state (`scripts/github-client.ts`), using a PR-only `GITHUB_TOKEN` supplied by the user. No call lands a PR | GitHub Terms of Service and REST API terms; no data is stored beyond our own PR records | https://docs.github.com/rest |
| Inform 6 compiler (6.45) | Tool | Compile story source to Z-machine `.z5` | Artistic License 2.0 or original Inform licence (user's choice) | https://github.com/DavidKinder/Inform6 |
| Inform 6 standard library (6.12.2) | Code | Parser and verbs included by `game/spike.inf` at compile time | Artistic License 2.0 or traditional Inform licence (user's choice) | https://github.com/DavidGriffith/inform6lib |
| Frotz `dfrotz` (2.44) | Tool | Headless Z-machine interpreter that plays `spike.z5` in the spike; run as a separate process, not bundled | GPL-2.0 | https://github.com/DavidGriffith/frotz |
| ifvms.js ZVM (1.1.6) | Code | Z-machine interpreter that plays `spike.z5` in the browser; vendored unmodified as `web/vendor/zvm.min.js` (licence text in `web/vendor/ZVM-LICENSE.txt`), driven through our own Glk shim in `src/web/glk-shim.ts` | MIT | https://github.com/curiousdannii/ifvms.js |
| Lighthouse 13.6.0, Playwright Chromium | Tool (dev-time only) | Measure the accessibility score of the web page; not a project dependency and not committed | Apache-2.0 (Lighthouse), Apache-2.0 (Playwright), BSD-3-Clause (Chromium) | https://github.com/GoogleChrome/lighthouse |

## Ideas and references (not code)

- Visual direction: 19th-century anatomical plates (public domain tradition); the ASCII figure and font stack are our own, no font file is bundled (system monospace)
- Mary Shelley, *Frankenstein; or, The Modern Prometheus* (1818)
- Nadya Bartol, "Better cybersecurity starts with honesty and accountability", TED@BCG (2021)
- Jerome Saltzer & Michael Schroeder, "The Protection of Information in Computer Systems", Proceedings of the IEEE (1975)

## AI assistance

The application code, specs, hooks and tests were built with Kiro.
Strategy, research and the initial steering drafts were prepared with help from Claude (Anthropic) and reviewed by the author.
