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
| three.js (r169, `three.module.min.js`) | Code | 3D bench of the operating theatre; vendored unmodified as `web/vendor/three.module.min.js` (licence text in `web/vendor/THREE-LICENSE.txt`), loaded by dynamic import only on the 3D path (`web/theatre.js`). All scene geometry is built from primitives in code: no model, texture or audio files | MIT | https://github.com/mrdoob/three.js |
| axe-core (dev-time) | Tool (dev-time only) | Earlier dev-time cross-check of the accessibility audit inside Playwright; the gate itself is now Lighthouse (`npm run test:a11y`); not a project dependency and not committed | MPL-2.0 | https://github.com/dequelabs/axe-core |
| Model Context Protocol TypeScript SDK (`@modelcontextprotocol/sdk` 1.32.2) | Code | Stdio MCP server and in-process test client in `src/mcp/` and `scripts/mcp.ts` | MIT | https://github.com/modelcontextprotocol/typescript-sdk |
| npm registry metadata (lodash 4.17.21, lodash 4.18.0, jquery 3.5.0, handlebars 4.7.10, node-fetch 2.6.7) | Data (test fixtures) | `tests/fixtures/registry/*.json`: `name`, `version`, dependency maps and `dist.tarball`/`integrity`/`shasum` trimmed from `GET https://registry.npmjs.org/<name>/<version>`; used by offline live-raid tests | Package metadata as published by each package (MIT) | https://registry.npmjs.org |
| e-1305/crypt-demo snapshot (`fixtures/crypt-demo/`) | Data | `package.json`, `package-lock.json` and `.github/CODEOWNERS` at commit `bd82e8eb00428db829ac002944f1be98f51c94df`, the source of the default demo creature on the site | Our own repository (MIT, see LICENSE) | https://github.com/e-1305/crypt-demo/tree/bd82e8eb00428db829ac002944f1be98f51c94df |
| e-1305/crypt-demo (`package.json`, `package-lock.json`, `test/smoke.test.js`) | Data (test fixtures) | Copies in `tests/fixtures/demo/` of the demo patient files, used by offline live-raid tests | Our own repository (MIT, see LICENSE) | https://github.com/e-1305/crypt-demo |
| zod (4.6.7) | Code | Input schemas for MCP tools (dependency of the SDK, used directly in `src/mcp/server.ts`) | MIT | https://github.com/colinhacks/zod |
| tsx (4.23.15) | Tool (runtime dependency) | Runs the TypeScript scripts and the CLI without a build step (`bin/crypt.mjs`, `npm run` scripts) | MIT | https://github.com/privatenumber/tsx |
| typescript (7.0.2) | Tool (dev-time only) | `npm run typecheck` (`tsc --noEmit`) and the web build (`tsconfig.web.json`) | Apache-2.0 | https://github.com/microsoft/TypeScript |
| vitest (5.1.0) | Tool (dev-time only) | Test runner for `tests/**/*.test.ts` | MIT | https://github.com/vitest-dev/vitest |
| fast-check (4.10.2) | Tool (dev-time only) | Property-based tests for the failsafe and blameless invariants | MIT | https://github.com/dubzzz/fast-check |
| @types/node (26.6.6) | Types (dev-time only) | Node.js type declarations for `tsc --noEmit` | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped |
| playwright-core | Tool (devDependency, dev and CI only) | `scripts/ci/visual-qa.mjs` drives headless Chromium at 390x844, 1280x800 and 1440x900 for the visual QA check (`npm run test:visual`); `scripts/playtest/judge.mjs` uses it too. Not in the npm package (`scripts/ci` is excluded), not in the site | Apache-2.0 | https://github.com/microsoft/playwright |
| Lighthouse | Tool (run with `npx`, dev and CI only) | `scripts/ci/lighthouse-a11y.sh` checks the accessibility score of the 2D page is at least 0.95. Not a dependency, not in the npm package or the site | Apache-2.0 | https://github.com/GoogleChrome/lighthouse |
| JetBrains Mono (5.3.0, Latin subset, regular 400 and bold 700) | Font | Self-hosted monospace webfont for the page, the manual code samples and every canvas texture in the 3D bench (`web/theatre/font.js`), so the ASCII creature aligns the same on every machine. woff2 files `web/fonts/jetbrains-mono-latin-400-normal.woff2` and `web/fonts/jetbrains-mono-latin-700-normal.woff2`, taken unmodified from the `@fontsource/jetbrains-mono` npm package (already the Latin subset, about 43 KB for both). Licence text in `web/fonts/OFL.txt`. Copyright 2020 The JetBrains Mono Project Authors | OFL-1.1 | https://github.com/JetBrains/JetBrainsMono |
| Sound effects (`web/theatre/sound.js`) | Code | CRT hum, heartbeat, thunder and needle clicks are original, synthesised at runtime with WebAudio oscillators and filtered noise by project code. No audio files, samples or third-party sound assets are used. Sound is off on load and starts only after the user clicks the toggle | MIT (project license) | n/a |

## Images

| File | Source | Terms |
|---|---|---|
| `docs/img/bench-3d.png` | Original. A screenshot of this project's own 3D bench, taken with `scripts/playtest/judge.mjs` (headless Chromium, software WebGL, 1280x720). All geometry and text are ours | Same licence as the repository (MIT) |
| `docs/img/visual-qa-*.png` | Original. Screenshots of this project's own page at 390x844, 1280x800, 1440x900 and 1920x1080, written by `VISUAL_QA_COPY_DOCS=1 npm run test:visual` (headless Chromium; a plain run writes only to `out/visual-qa`). The 1440x900 shot shows the 3D bench | Same licence as the repository (MIT) |

## Ideas and references (not code)

- Visual direction: 19th-century anatomical plates (public domain tradition); the ASCII figure is our own, the monospace font is JetBrains Mono (see the components table; system monospace fonts are only a fallback)
- Mary Shelley, *Frankenstein; or, The Modern Prometheus* (1818)
- Nadya Bartol, "Better cybersecurity starts with honesty and accountability", TED@BCG (2021)
- Jerome Saltzer & Michael Schroeder, "The Protection of Information in Computer Systems", Proceedings of the IEEE (1975)

## AI assistance

The application code, specs, hooks and tests were built with Kiro.
Strategy, research and the initial steering drafts were prepared with help from Claude (Anthropic) and reviewed by the author.
