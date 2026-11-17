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
| Inform 6 compiler (6.45) | Tool | Compile story source to Z-machine `.z5` and `.z8`; built by `scripts/setup-tools.sh` into the user cache directory (`~/.cache/crypt/toolchain`, or `CRYPT_TOOLCHAIN_DIR`) when run through the `crypt` CLI, into `.toolchain/` for npm scripts | Artistic License 2.0 or original Inform licence (user's choice) | https://github.com/DavidKinder/Inform6 |
| Inform 6 standard library (6.12.2) | Code | Parser and verbs included by `game/spike.inf` and the generated story at compile time; cloned into the same cache directory | Artistic License 2.0 or traditional Inform licence (user's choice) | https://github.com/DavidGriffith/inform6lib |
| Frotz `dfrotz` (2.44) | Tool | Headless Z-machine interpreter that plays `spike.z5` in the spike and the raised story in `crypt raid` / `crypt play`; built into the same cache directory and run as a separate process, not bundled | GPL-2.0 | https://github.com/DavidGriffith/frotz |
| git | Tool | `crypt exhume` and `crypt raid` run `git clone --depth 1` (arguments as an array, no shell, hooks disabled, submodules not fetched) to read a GitHub repository in a temporary directory that is removed afterwards; `setup-tools.sh` uses it to fetch the toolchain sources | GPL-2.0, run as a separate process, not bundled | https://git-scm.com |
| ifvms.js ZVM (1.1.6) | Code | Z-machine interpreter that plays `spike.z5` in the browser; vendored unmodified as `web/vendor/zvm.min.js` (licence text in `web/vendor/ZVM-LICENSE.txt`), driven through our own Glk shim in `src/web/glk-shim.ts` | MIT | https://github.com/curiousdannii/ifvms.js |
| Lighthouse 13.6.0, Playwright Chromium | Tool (dev-time only) | Measure the accessibility score of the web page; not a project dependency and not committed | Apache-2.0 (Lighthouse), Apache-2.0 (Playwright), BSD-3-Clause (Chromium) | https://github.com/GoogleChrome/lighthouse |
| GitHub Pages actions (`actions/configure-pages@v5`, `actions/upload-pages-artifact@v3`, `actions/deploy-pages@v4`) | Tool (CI only) | `.github/workflows/pages.yml` publishes `_site/` to GitHub Pages | MIT | https://github.com/actions/deploy-pages |
| Gallery snapshots (`web/gallery-data/`) | Data | Per-repository lists of packages needing attention, taken from the root lockfile or requirements of the 20 public projects in `docs/census/repos.md` at pinned commits, with OSV, KEV and EPSS data as above. No owners, no commit authors | Public package names and versions; source terms as in the OSV, KEV and EPSS rows | https://github.com/e-1305/Crypt/blob/main/docs/census/repos.md |
| Model Context Protocol TypeScript SDK (`@modelcontextprotocol/sdk` 1.32.2) | Code | Stdio MCP server and in-process test client in `src/mcp/` and `scripts/mcp.ts` | MIT | https://github.com/modelcontextprotocol/typescript-sdk |
| npm registry metadata (lodash 4.17.21, lodash 4.18.0, jquery 3.5.0, handlebars 4.7.10, node-fetch 2.6.7) | Data (test fixtures) | `tests/fixtures/registry/*.json`: `name`, `version`, dependency maps and `dist.tarball`/`integrity`/`shasum` trimmed from `GET https://registry.npmjs.org/<name>/<version>`; used by offline live-raid tests | Package metadata as published by each package (MIT) | https://registry.npmjs.org |
| e-1305/crypt-demo (`package.json`, `package-lock.json`, `test/smoke.test.js`) | Data (test fixtures) | Copies in `tests/fixtures/demo/` of the demo patient files, used by offline live-raid tests | Our own repository (MIT, see LICENSE) | https://github.com/e-1305/crypt-demo |
| zod (4.6.7) | Code | Input schemas for MCP tools (dependency of the SDK, used directly in `src/mcp/server.ts`) | MIT | https://github.com/colinhacks/zod |
| tsx (4.23.15) | Tool (runtime dependency) | Runs the TypeScript scripts and the CLI without a build step (`bin/crypt.mjs`, `npm run` scripts) | MIT | https://github.com/privatenumber/tsx |
| typescript (7.0.2) | Tool (dev-time only) | `npm run typecheck` (`tsc --noEmit`) and the web build (`tsconfig.web.json`) | Apache-2.0 | https://github.com/microsoft/TypeScript |
| vitest (5.1.0) | Tool (dev-time only) | Test runner for `tests/**/*.test.ts` | MIT | https://github.com/vitest-dev/vitest |
| fast-check (4.10.2) | Tool (dev-time only) | Property-based tests for the failsafe and blameless invariants | MIT | https://github.com/dubzzz/fast-check |
| @types/node (26.6.6) | Types (dev-time only) | Node.js type declarations for `tsc --noEmit` | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped |

## Ideas and references (not code)

- Visual direction: 19th-century anatomical plates (public domain tradition); the ASCII figure and font stack are our own, no font file is bundled (system monospace)
- Mary Shelley, *Frankenstein; or, The Modern Prometheus* (1818)
- Nadya Bartol, "Better cybersecurity starts with honesty and accountability", TED@BCG (2021)
- Jerome Saltzer & Michael Schroeder, "The Protection of Information in Computer Systems", Proceedings of the IEEE (1975)

## AI assistance

The application code, specs, hooks and tests were built with Kiro.
Strategy, research and the initial steering drafts were prepared with help from Claude (Anthropic) and reviewed by the author.
