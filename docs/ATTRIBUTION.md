# Attribution & third-party disclosure

Kiroween rules require disclosing any pre-existing code or work incorporated into the project,
and using third-party SDKs, APIs and data in line with their terms. Keep this file up to date.

| Component | Type | Used for | License / terms | Link |
|---|---|---|---|---|
| OSV | API + data | Vulnerability lookup for npm / PyPI | TODO: confirm terms | https://osv.dev |
| CISA KEV catalog | Data | Actively exploited CVEs | TODO: confirm terms | https://www.cisa.gov/known-exploited-vulnerabilities-catalog |
| FIRST EPSS | Data | Exploit probability scores | TODO: confirm terms | https://www.first.org/epss/ |
| Inform 6 compiler (6.45) | Tool | Compile story source to Z-machine `.z5` | Artistic License 2.0 or original Inform licence (user's choice) | https://github.com/DavidKinder/Inform6 |
| Inform 6 standard library (6.12.2) | Code | Parser and verbs included by `game/spike.inf` at compile time | Artistic License 2.0 or traditional Inform licence (user's choice) | https://github.com/DavidGriffith/inform6lib |
| Frotz `dfrotz` (2.44) | Tool | Headless Z-machine interpreter that plays `spike.z5` in the spike; run as a separate process, not bundled | GPL-2.0 | https://github.com/DavidGriffith/frotz |
| ifvms.js ZVM (1.1.6) | Code | Z-machine interpreter that plays `spike.z5` in the browser; vendored unmodified as `web/vendor/zvm.min.js` (licence text in `web/vendor/ZVM-LICENSE.txt`), driven through our own Glk shim in `src/web/glk-shim.ts` | MIT | https://github.com/curiousdannii/ifvms.js |

## Ideas and references (not code)

- Mary Shelley, *Frankenstein; or, The Modern Prometheus* (1818)
- Nadya Bartol, "Better cybersecurity starts with honesty and accountability", TED@BCG (2021)
- Jerome Saltzer & Michael Schroeder, "The Protection of Information in Computer Systems", Proceedings of the IEEE (1975)

## AI assistance

The application code, specs, hooks and tests were built with Kiro.
Strategy, research and the initial steering drafts were prepared with help from Claude (Anthropic) and reviewed by the author.
