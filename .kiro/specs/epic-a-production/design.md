# Design: epic-a-production

## A1 CI

```
pull_request / push main
  job test            checkout, setup-node 22 (npm cache), npm ci, typecheck,
                      cache toolchain, setup-tools.sh, vitest (CRYPT_NUM_RUNS=1000),
                      spike, raise:check, necromancer:check, raid-offline.sh
  job failsafe-guard  checkout, scripts/ci/failsafe-guard.sh   (no Node, no toolchain)
```

| Path | Role |
|---|---|
| `.github/workflows/ci.yml` | the two jobs, `permissions: contents: read` |
| `scripts/ci/failsafe-guard.sh` | grep based guard over `src/` and `bin/`, plus `git check-ignore` for `.kiro/`. Takes an optional root directory so tests can point it at a temp tree |
| `scripts/ci/raid-offline.sh` | scripted offline raid: feeds `GRAFT JQUERY`, `SEAL CRYPT`, `GRAFT LODASH` on stdin in a temp cwd, asserts exit 0 and one payload |
| `tests/runs.ts` | `numRuns(default)` returns `max(default, CRYPT_NUM_RUNS)` when the variable is a positive integer, else `default` |
| `tests/failsafe-guard.test.ts` | runs the guard on a clean temp tree and on one tree per violation |

Guard rules, applied after removing the state label `awaiting-human-merge`: the merge patterns of `tests/static.test.ts`, `gh pr merge`, `git blame`, and `.kiro/` ignored by git. The rules live in `scripts/ci/failsafe-rules.sh`, shared with the on-save hook `scripts/hooks/failsafe-check.sh`. Each rule runs per line and on the whole file folded to one line, so calls split over lines are caught. Quoted standalone merge and blame tokens catch argument arrays (`spawn("gh", ["pr", "<merge>"])`, `execFile("git", ["-C", d, "blame", f])`), and `git` followed by flags then blame catches command strings. The `.kiro` check probes `.kiro/`, `.kiro/hooks`, `.kiro/steering` and `.kiro/specs` paths with `git check-ignore` and also fails on any `.kiro` pattern in `.gitignore`. The hook adds token-in-log detection for one line, a call split over lines, and a variable assigned from a secret and logged later. The guard never weakens `tests/static.test.ts`; it is a second, independent check that also covers `bin/` and runs without Node.

Toolchain cache: `CRYPT_TOOLCHAIN_DIR=$HOME/.cache/crypt/toolchain` for every step, cached with key `toolchain-${{ runner.os }}-${{ hashFiles('scripts/setup-tools.sh') }}`.

## A2 Kiro hooks
Format, from the [Kiro hooks documentation](https://kiro.dev/docs/hooks/) (read for this milestone; trigger list at [hook triggers](https://kiro.dev/docs/hooks/types/), actions at [hook actions](https://kiro.dev/docs/hooks/actions/)):
- Files are JSON in `.kiro/hooks/<id>.json`, any kebab-case name. A file holds `{"version": "v1", "hooks": [...]}`.
- A hook has `name`, optional `description`, `trigger` (PascalCase; the documented file-save example uses `PostFileSave`), optional `matcher` (a regex against the file path for file events), `action` and optional `timeout` (seconds, default 60).
- `action.type` is `command` (shell command run in the project root; the event JSON arrives on STDIN; exit 0 adds STDOUT to the agent context, any other exit sends STDERR to the agent as an error) or `agent` (a prompt injected into the conversation).
- The earlier `.kiro.hook` format with `eventType` and `askAgent` is replaced by this one in IDE 1.0 and CLI V3. The hooks here use the new format.

Logic lives in scripts so tests can run it. `scripts/hooks/lib.sh` takes file paths as arguments or, when called by Kiro, extracts them from the event JSON on STDIN.

| Hook file | Matcher | Action |
|---|---|---|
| `related-tests-on-save.json` | `src/**/*.ts` | command: `scripts/hooks/related-tests.sh` runs `vitest related --run` for the saved file |
| `failsafe-guard-on-save.json` | `src/(necromancer\|inquisitor\|mcp)/` | command: `scripts/hooks/failsafe-check.sh` fails on a merge endpoint or command, or a token or secret on the same line as a log or audit call |
| `trace-on-tasks-save.json` | `.kiro/specs/*/tasks.md` | agent: runs `scripts/hooks/kiro-trace.ts --write`, which rewrites only the generated block in `docs/KIRO.md` |
| `attribution-on-package-save.json` | `package.json` | agent: runs `scripts/hooks/deps-check.sh` and adds each missing dependency to `docs/ATTRIBUTION.md` |
| `blameless-copy-on-save.json` | `src/raise/`, `web/` | command: `scripts/hooks/blameless-copy-check.sh` fails on copy that names a person in failure or states a prohibition |

Requirement A2.3 (hooks only read and report) decides the two hooks that change a file: the command hooks never write, and the two write steps (traceability block, attribution row) are agent actions, so the agent shows the change in the session instead of a script editing files unseen. `kiro-trace.ts` without `--write` only prints.

Traceability: the commit for a task is the first commit whose diff adds the ticked line `- [x] <id>` to `tasks.md` (`git log -S`). Open tasks show `open`. The block is deterministic, so a second run changes nothing. Commit hashes change when a branch is rebased; saving `tasks.md` again regenerates them.

## A3 Pages

Public URL: `https://e-1305.github.io/Crypt/` (repository `e-1305/Crypt`; the owner sets Settings > Pages > Source to "GitHub Actions" once). All URLs in the page are relative, so the `/Crypt/` prefix needs no configuration.

### CORS check (measured 2026-11-17, from origin `https://e-1305.github.io`)
Curl with `Origin: https://e-1305.github.io`:

| Request | Result |
|---|---|
| `OPTIONS https://api.osv.dev/v1/query` and `/v1/querybatch` (preflight, `Access-Control-Request-Method: POST`, `-Headers: content-type`) | 200, `access-control-allow-origin: https://e-1305.github.io`, `-allow-methods: GET,POST,OPTIONS`, `-allow-headers` includes `Content-Type`, `-max-age: 1728000` |
| `POST` the same two URLs | 200, `access-control-allow-origin: https://e-1305.github.io` |
| `GET https://raw.githubusercontent.com/jquery/jquery/HEAD/package.json` | 200, `access-control-allow-origin: *`; the 404 for a missing `CODEOWNERS` also carries `*`, so a missing file reads as a 404, not a network error |
| `GET https://api.github.com/repos/jquery/jquery/contents/package.json` | 200, `access-control-allow-origin: *`, `x-ratelimit-limit: 60` (unauthenticated, per hour per IP), `x-ratelimit-remaining` exposed |

Real browser confirmation: headless Chromium (Playwright 1.x, `chromium-headless-shell` 1255) loaded a page at origin `https://e-1305.github.io` (the page body was supplied by `page.route`, because the site is not deployed yet; the five requests below went to the real hosts) and ran `fetch()`:
`osv_querybatch` POST 200 with JSON; `osv_query` POST 200; `raw` `axios/axios/HEAD/package-lock.json` 200, 355554 bytes; `raw` missing `CODEOWNERS` 404 readable; `api.github.com` contents 200 with `x-ratelimit-remaining` 59 of 60.

Result: a browser can read a public `package-lock.json` and query OSV.

### Decision: gallery, not in-browser exhume
The scan could run in the browser (`src/exhume` is pure apart from I/O). The playable part cannot: `raise` turns a creature into Inform 6 source and needs the Inform compiler, a native binary. A generic precompiled story that reads creature data at runtime would need a new story design (a Z-machine story has no file input in the ZVM shim used here), which is out of scope for A3. A scan without a playable creature would not keep the page's promise, so A3 ships the gallery:
- `npm run census` (network, run by a person) scans the 20 repositories of `docs/census/repos.md` at their pinned SHAs.
- `npm run gallery:snapshot` turns `out/census/*.json` into `web/gallery-data/<owner>__<repo>.json`: only packages that need attention (state not Healthy), at most 40 per repository, no owners, plus that repository's own package count and pinned SHA.
- `npm run build:site` raises one `.z8` per snapshot with the same `raise` as the CLI. No network.
- The page lists the gallery alphabetically. A box accepts a GitHub address (`parseRepoUrl`: https, host `github.com` only) and opens the matching gallery creature, or says the project is not in the gallery. The box makes no request.

Aggregate safety: the gallery shows one repository per page. It has no total, no ranking and no order by findings or severity across repositories; `docs/census/RESULTS.md` stays aggregate only and is not changed. Blameless: packages carry the rot; there are no owners or people in gallery data.

Census spec note: `census` C3 keeps per-repo raw data out of the repository. The snapshots are a separate committed artifact the owner has to approve (see the finding in the A3 feature file); deleting `web/gallery-data/` removes the gallery and the build then fails with a message.

### Site build (`scripts/build-site.ts`)
`npm run build:site [-- --out dir]` (default `_site/`, git-ignored): `tsc -p tsconfig.web.json`, copy `web/` (without `gallery-data/`), offline exhume of `fixtures/vulnerable-npm` with its own feed snapshot, `raise` to `game/demo.z8`, and one `game/<slug>.z8` per snapshot. Per creature it writes `<id>.json` (what the plate reads) and `<id>.payloads.json`, a map from limb ID to a dry-run PR payload.
- Demo payloads: the real necromancer (`graft`) in dry-run mode over the fixture and its advisories, with the clock fixed to the fixture's EPSS date, so the build is byte-identical on rerun.
- Gallery payloads: `previewPayload` from the snapshot alone (spawned npm limbs only; the fixed version is chosen when a person runs crypt on their own checkout).
- `npm run web` builds the same site and serves `_site/` on 127.0.0.1.

Page rules: GRAFT is a rehearsal. The marker still goes through `parseGameOutput`; on an accepted `GRAFT <limb>` the page prints the prebuilt payload. The page only issues GET requests for `game/*`. Healed memory in `localStorage` is scoped per creature. Download: `Blob` plus `<a download>`, name `crypt-<creature>.z8`; `.z8` first byte is 8.

Raise fix found by the gallery: a creature with no spawned limb produced Inform source that did not compile (the `Limb` class used properties no object defined). `generate` now declares the four properties when there are no monsters; output for creatures with limbs is unchanged.

### Owner decisions and notes (review v1)
- **Gallery data needs owner approval (open).** `web/gallery-data/*.json` names 20 third-party repositories with their unpatched package versions, KEV flags and EPSS scores, which `census` C3 kept out of the repository. Record the approval before the Pages URL is published or put in Devpost. Until then the branch is local only.
- **Nothing has run on GitHub (open).** The workflows, the Pages URL and the README badge are unverified; branches are local. After the first push, check that `ci.yml` is green and that `pages.yml` deploys.
- **`npm run web` changed.** `scripts/web.ts` no longer builds `spike.z5` or copies a creature. It delegates to `build:site`, so it now needs the Inform/Frotz toolchain (`npm run setup`) and the gallery data in `web/gallery-data/`.
- **CI time.** `tests/site.test.ts` builds the site twice for the determinism check. The build count does not scale with `CRYPT_NUM_RUNS`; measured locally, the whole file takes about 3 s. The 1000-run property tests are the cost to watch on the first CI run, inside the 30-minute job limit.
- **Hook format.** The `.kiro/hooks/*.json` schema follows the Kiro hooks documentation linked above. No hook has fired inside a Kiro session; the runs in `docs/KIRO.md` are manual invocations of the scripts.

### Workflow (`.github/workflows/pages.yml`)
Triggers: `workflow_run` of the `CI` workflow on `main` (the build job runs only when CI concluded `success` for a push, and checks out the commit CI tested, so a push that fails CI never publishes), and `workflow_dispatch` (a manual deploy that skips the gate on purpose). Top-level `permissions: contents: read`. Job `build`: checkout, Node 22, `npm ci`, toolchain cache (same key as CI), `bash scripts/setup-tools.sh`, `npm run build:site`, `configure-pages`, `upload-pages-artifact` (`_site`). Job `deploy` (needs `build`): `pages: write`, `id-token: write`, `environment: github-pages`, `deploy-pages`. Concurrency group `pages`, no cancel of a running deploy.

## A4 Packaging

### Name availability (checked 2026-11-17 with `npm view <name> name version description`)
| Name | Result |
|---|---|
| `crypt` | taken: 0.0.2, "utilities for encryption and hashing" (unrelated) |
| `crypt-cli` | taken: 1.0.0, "CLI tool to encrypt or decrypt JWT" (unrelated) |
| `@e-1305/crypt` | E404, free |

The package is named `@e-1305/crypt`. The `bin` entry stays `crypt`, so after install the command is `crypt`. Publishing a scoped package needs the `@e-1305` npm scope owned by the publisher, which the owner confirms; `publishConfig.access` is `public`. Run it with `npx @e-1305/crypt raid <dir>` (npx runs the only bin) or, once installed, `npx --no-install crypt`.

### Files whitelist
`files` ships `bin`, `scripts`, `src`, `game`, `fixtures/vulnerable-npm`, `data/cache/osv`, README, LICENSE and `docs/ATTRIBUTION.md`. Negations drop what only maintainers use: `scripts/ci`, `scripts/hooks`, `scripts/census`, `scripts/check-*.ts`, `scripts/build-site.ts`, `scripts/gallery-snapshot.ts`, `scripts/web.ts`, `src/web` and `src/site` (the web gallery and Pages build). Result: 108 files, 64 kB packed (131 files before the negations). `tsx` stays a runtime dependency because the launcher runs TypeScript through it.

### Path audit
`PACKAGE_ROOT` comes from `import.meta.url` (`scripts/toolchain-dir.ts`), so the fixture, OSV cache and `setup-tools.sh` resolve inside `node_modules`. `out/`, `crypt-audit.log` and `.crypt-seal` use `process.cwd()`. No change was needed.

### Install test
`scripts/ci/pack-install-test.sh` runs `npm pack`, checks the tarball for required and forbidden paths, installs it into an empty project, runs `crypt --help`, `crypt --version` and an offline exhume of the packaged fixture. With `CRYPT_PACK_RAID=1` it also plays the scripted raid. CI job `pack-install` runs it on Node 20 and 22. `prepublishOnly` runs typecheck, tests and the same script.
