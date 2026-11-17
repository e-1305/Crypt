# How CRYPT was built with Kiro

> Fill this in as you go. Judges score how thoroughly and skilfully Kiro was used.

## Specs
| Spec | Folder | Outcome |
|---|---|---|
| transcript-bridge-spike | `.kiro/specs/transcript-bridge-spike/` | requirements, design (with interpreter limitations and fallbacks) and tasks written; implemented (tasks 1 to 11), PR step pending |
| bridge-v2 | `.kiro/specs/bridge-v2/` | requirements (V1 to V7), design (marker syntax, `GameEvent`, Tier 1 browser reading, threat notes) and tasks written before coding; implemented. Driven by issue #3: the game now prints `[[CRYPT ...]]` markers on accepted actions and the watcher triggers only on those, not on `> ` input lines |
| exhume-and-rank | `.kiro/specs/exhume-and-rank/` | requirements (E1 to E9), design (creature.json schema, ranking formula, fail-safe unknown state, fixture data policy) and tasks written and committed before any code; implemented. Driven by issue #5: `npx crypt exhume <path-or-url>` gives a deterministic KEV/EPSS ranking, offline once cached |
| raise-the-creature | `.kiro/specs/raise-the-creature/` | requirements, design (ID scheme, sanitizer, marker templates) and tasks committed before code; implemented. Driven by issue #8: `npx crypt raise out/creature.json` compiles `creature.json` to a playable `.z8` story with an ASSIGN verb |
| necromancer | `.kiro/specs/necromancer/` | requirements (N1 to N8), design (module layout, version selection, state schema, audit outcomes, static-test constraint) and tasks committed before any code. Driven by issue #11: GRAFT leads to a fix PR, CI check, human landing and re-raise. Implemented: complete mediation in the watcher (N1), Necromancer, GithubClient with dry-run, Inquisitor, re-raise, SEAL, acceptance script |
| web-player | `.kiro/specs/web-player/` | requirements (W1 to W9), design (interpreter comparison, pure output hook, Glk shim, spoofing analysis) and tasks written before coding; implemented. Issue #6: play `spike.z5` in the browser with an event log fed only by `parseGameOutput` |
| mcp-server | `.kiro/specs/mcp-server/` | requirements (M1 to M6), design (core handlers, write path through the watcher, allowlisted outputs, redaction) and tasks written before coding; implemented. Issue #19: any MCP client can query the creature and request a graft under the failsafe rules |

## Steering
| File | Purpose |
|---|---|
| `product.md` | Product scope and Tier 1 boundary |
| `tech.md` | Stack and data sources |
| `failsafe.md` | Saltzer & Schroeder safety rules |
| `sla-policy.md` | Deterministic ranking and SLAs |
| `blameless.md` | Bartol's blameless rules |

## Hooks
Five hooks in `.kiro/hooks/*.json`, in the [documented Kiro format](https://kiro.dev/docs/hooks/) (`version: v1`, `trigger: PostFileSave`, a path regex in `matcher`, a `command` or `agent` action; see `design.md` of `epic-a-production`). The logic is in `scripts/hooks/` so it is tested in `tests/hooks.test.ts` (passes on clean input, fails on a violation). Command hooks only read and report. The two hooks that change a file are agent actions, so the change shows in the session.

| Hook | Trigger (`matcher`) | Action | What it caught or saved |
|---|---|---|---|
| `related-tests-on-save.json` | save of `src/**/*.ts` | command: `scripts/hooks/related-tests.sh` runs `vitest related --run` for the saved file | Saves running the whole suite (313 tests when run 1 was captured; the final count is in the numbers section): saving `src/bridge/grammar.ts` ran 11 of 20 test files (178 tests, 3.2 s). See run 1 |
| `failsafe-guard-on-save.json` | save under `src/necromancer`, `src/inquisitor`, `src/mcp` | command: `scripts/hooks/failsafe-check.sh` fails on a merge endpoint or command, a `git blame` call (also as an argument array), or a token that reaches a log or audit call (same line, a multi-line call, or via a variable). The rules live in `scripts/ci/failsafe-rules.sh` and are shared with the CI guard | Nothing real yet: the code is clean. Demonstration runs against planted violations, see run 2 |
| `trace-on-tasks-save.json` | save of `.kiro/specs/*/tasks.md` | agent: `npx tsx scripts/hooks/kiro-trace.ts --write` refreshes the table in the traceability section below | Replaces hand-typed commit names with the first commit that contains each ticked task line (`git log -S`). Tasks ticked together in one commit share a hash, so a milestone ticked in a single commit shows one hash for all its rows. See run 3 |
| `attribution-on-package-save.json` | save of `package.json` | agent: runs `scripts/hooks/deps-check.sh`, adds each missing dependency to `docs/ATTRIBUTION.md` with licence and link | Caught five real gaps on its first run: `tsx`, `@types/node`, `fast-check`, `typescript` and `vitest` were in `package.json` and not in the attribution file. See run 4 |
| `blameless-copy-on-save.json` | save under `src/raise` or `web/` (not `web/vendor`) | command: `scripts/hooks/blameless-copy-check.sh` fails on copy that names a person in failure or states a prohibition | Caught a real prohibition: the header of every generated story said "Do not edit". Reworded. See run 5 |

None of these has fired inside a Kiro session yet. The runs below are the scripts run by hand, the same way the hook runs them, and the output is copied from the terminal. Entries from A3, A4 and Epic B get appended here as the hooks fire.

### Captured runs
Run 1, `related-tests.sh src/bridge/grammar.ts` (summary lines):
```
 Test Files  11 passed (11)
   Affected  11 of 20 test files (related to src/bridge/grammar.ts)
      Tests  178 passed (178)
   Duration  3.21s
```

Run 2, demonstration against planted violations (`src/necromancer/index.ts` restored afterwards). Planted `console.log("opening PR with", process.env.GITHUB_TOKEN);`:
```
failsafe-check: src/necromancer/index.ts line 252 sends a token or secret to a log or audit call (failsafe rule 8, keep secrets out of logs)
exit 1
```
Planted a call named like the merge endpoint, with the file path arriving as Kiro event JSON on STDIN:
```
failsafe-check: src/necromancer/index.ts matches 'merge call' (failsafe rule 2: never call a merge endpoint)
exit 1
```

Run 3, `kiro-trace.ts epic-a-production` before the A2 tasks were ticked (first rows):
```
| Task | Commit | Test |
|---|---|---|
| A1.5 scripts/ci/failsafe-guard.sh and tests/failsafe-guard.test.ts | `b7cc099` | `tests/failsafe-guard.test.ts` |
| A2.1 Hook definitions in .kiro/hooks/ (guard on save, tests on spec change) | open | n/a |
```

Run 4, `deps-check.sh` on the repository before the attribution rows existed:
```
deps-check: tsx is in package.json but not in docs/ATTRIBUTION.md (add name, use, licence, link)
deps-check: @types/node is in package.json but not in docs/ATTRIBUTION.md (add name, use, licence, link)
deps-check: fast-check is in package.json but not in docs/ATTRIBUTION.md (add name, use, licence, link)
deps-check: vitest is in package.json but not in docs/ATTRIBUTION.md (add name, use, licence, link)
exit 1
```
(`typescript` was also missing; the first version of the check matched it inside "Model Context Protocol TypeScript SDK" and `typescript-sdk`, so it was not listed. The check now matches whole names, and a test covers `zod` against `zod-to-json-schema`.) After adding the rows: `deps-check: ok (7 dependencies attributed)`.

Run 5, `blameless-copy-check.sh` on the repository before the fix:
```
blameless-copy-check: src/raise/generate.ts: copy states a prohibition:   out.push("! Generated by CRYPT raise. Do not edit; regenerate from creature.json."); (state the action to take instead)
exit 1
```
The line is an Inform comment, not text a player reads, but it ships in every generated story and states a prohibition. It now reads "To change it, edit creature.json and regenerate." Demonstration against a planted line:
```
blameless-copy-check: src/raise/generate.ts: copy names a person in failure: out.push("Rot is the fault of the author, blame @sam"); (name people only in praise, e.g. 'healed by')
exit 1
```

Runs while building A3 (Pages), on the files that milestone changed. All passed, so no hook caught anything there:
```
$ bash scripts/hooks/related-tests.sh src/raise/generate.ts src/site/gallery.ts src/web/repo-url.ts
 Test Files  6 passed (6)
      Tests  90 passed (90)
$ bash scripts/hooks/blameless-copy-check.sh web/index.html web/app.js web/style.css
blameless-copy-check: ok (3 files checked)
$ bash scripts/hooks/failsafe-check.sh src/site/gallery.ts src/web/repo-url.ts
failsafe-check: ok (0 files checked)
```
The `failsafe-check` matcher covers `src/(necromancer|inquisitor|mcp)/` only, so the new `src/site/` and `src/web/` files were outside it and the script reported 0 files. The always-on `tests/static.test.ts` and `scripts/ci/failsafe-guard.sh` cover them (`failsafe-guard: ok (37 files checked)`).

The failure A3 did hit came from running the build, not from a hook. The first `npm run build:site` over the gallery snapshots stopped with `inform6 failed (exit 1)`: `line 19: Error: No such constant as "limbcodes"`. A creature with no spawned limb produced Inform source whose `Limb` class used properties no object defined. `raise` had never been run on such a creature. `generate` now declares the four properties in that case (`src/raise/generate.ts`), and 17 of the 20 gallery creatures have no spawned limb and depend on it.

Runs while building A4 (npm packaging), on the files that milestone changed. All passed, so no hook caught anything there:
```
$ bash scripts/hooks/deps-check.sh
deps-check: ok (7 dependencies attributed)
$ bash scripts/ci/failsafe-guard.sh
failsafe-guard: ok (37 files checked)
$ bash scripts/hooks/blameless-copy-check.sh
blameless-copy-check: ok (25 files checked)
```
A4 changed no file under `src/`, so `related-tests` and `failsafe-check` had nothing to run on; the full `npx vitest run` (345 tests) passed. The renamed package (`crypt-cli` to `@e-1305/crypt`) touched `package.json`, which is the `attribution-on-package-save` trigger: no dependency changed, and `deps-check` confirmed it.

What the new check caught: the first dry run of `npm pack` listed 131 files including `scripts/ci`, `scripts/hooks`, `scripts/census`, the Pages build and `src/web`. Negations in `files` cut that to 108 files (64 kB). `scripts/ci/pack-install-test.sh` fails when the tarball lacks a runtime file or carries `tests/`, `.kiro/`, `web/` or `out/`.
Install runs (tarball into an empty project, `crypt --help`, `--version`, offline exhume, scripted raid with `CRYPT_PACK_RAID=1`): `pack-install: ok` on Node 20.20.2, 22.23.4 and 24.22.1.

## Custom agents
| Agent | Role |
|---|---|
| Oracle | Wraps the deterministic scorer |
| Necromancer | Drafts the fix PR. `.kiro/agents/necromancer.json`: read and write tools, no shell, no web |
| Inquisitor | Verifies the fix. `.kiro/agents/inquisitor.json`: read-only, no write, no shell (separation of privilege, failsafe 3) |

## MCP
`npm run mcp` starts the CRYPT MCP server on stdio. Kiro reads `.kiro/settings/mcp.json`:

```json
{
  "mcpServers": {
    "crypt": {
      "command": "npm",
      "args": ["run", "mcp", "--silent"],
      "env": {},
      "disabled": false,
      "autoApprove": ["list_limbs", "get_limb", "census_summary", "audit_tail"]
    }
  }
}
```

| Tool | Kind | What it does |
|---|---|---|
| `list_limbs` | read | Every limb: id, state, CVEs, KEV, EPSS, owner, spawned |
| `get_limb(id)` | read | One limb by ID |
| `census_summary` | read | `docs/census/RESULTS.md` when present |
| `audit_tail(n)` | read | Last n audit lines (1 to 100), token-looking strings redacted |
| `request_graft(limb_id)` | write | Grammar, `out/limbs.json`, seal check, request file, audit. Never calls GitHub. A human lands the PR |
| `seal()` | write | Seals the crypt; every later graft is refused |

Run `npm run exhume` and `npm run raise` first so `out/creature.json` and `out/limbs.json` exist.

## Property-based tests
| Invariant | Test file |
|---|---|
| Parser rejects every string outside the grammar (rule 5) | `tests/grammar.test.ts` |
| Near-miss inputs (case, whitespace, newline, length) rejected (rule 5) | `tests/grammar.test.ts` |
| Parse errors and injected I/O errors write nothing (rule 1) | `tests/watch.test.ts` |
| Unreadable seal state refuses GRAFT (rule 1) | `tests/watch.test.ts` |
| After SEAL no request is ever written (rule 7) | `tests/watch.test.ts` |
| One audit line per accepted command, none for rejected (rule 8) | `tests/watch.test.ts` |
| Only whole-line game markers trigger; marker-looking player input (`> [[CRYPT ...]]`) never acts (spoofing, V4) | `tests/parse-output.test.ts` |
| A valid marker in game output yields exactly the expected request and audit line (V2) | `tests/parse-output.test.ts` |
| Inserting arbitrary `> ...` input lines never changes audit, requests or seal (V2) | `tests/parse-output.test.ts` |
| Markers that fail the grammar or are not alone on their line yield no action (rule 5, V3) | `tests/parse-output.test.ts` |
| `parseGameOutput` is deterministic and never throws (V6) | `tests/parse-output.test.ts` |
| No merge call, network client or LLM import in `src/` (rules 2, 4) | `tests/static.test.ts` |
| KEV always outranks non-KEV, in score and in the ranked list (sla-policy, E4) | `tests/exhume.test.ts` |
| Score is monotonic in EPSS, and EPSS dominates severity (E4) | `tests/exhume.test.ts` |
| Ranking is deterministic and independent of input order; same input gives byte-identical `creature.json` (rule 4, E7) | `tests/exhume.test.ts` |
| Spawned is a subset of Possessed plus Rotting with EPSS >= 0.1 (noise exorcism, E5) | `tests/exhume.test.ts` |
| Missing feed, OSV failure or unpinned version never yields Healthy (rule 1, E2, E3) | `tests/exhume.test.ts` |
| No output field contains a git author or committer: a real git repo is read through the CLI filesystem, and `src/exhume` never touches git (blameless, E6) | `tests/exhume.test.ts` |
| Unknown findings are never exorcised; stale OSV cache entries are never Healthy; a run with no manifest fails (rule 1, E2, E5) | `tests/exhume.test.ts` |
| OSV cache file names never leave the cache directory (E2) | `tests/exhume.test.ts` |
| `generate` is deterministic, also under reversed key order (R1) | `tests/raise.test.ts` |
| Limb IDs are unique, A-Z only, 1 to 32 characters and pass the grammar gate (R3) | `tests/raise.test.ts` |
| Hostile names, CVE IDs, owners and versions never add a marker, bracket, control character or Inform special; removing the sanitizer fails these tests (R6) | `tests/raise.test.ts` |
| Markers appear in generated source only as the four fixed templates; in a compiled game they come only from verb routines for the actual noun (R4, R6) | `tests/raise.test.ts` |
| `ASSIGN <limb>` is accepted by the grammar, lowercase and near misses are rejected (R5) | `tests/grammar.test.ts` |
| Unknown limb IDs never write a request; every rejection is audited `REJECTED_UNKNOWN_LIMB` (rules 5, 8, N1) | `tests/watch.test.ts` |
| A missing, unreadable or invalid `out/limbs.json` rejects every GRAFT and ASSIGN (rule 1, N1) | `tests/watch.test.ts` |
| Unknown limb IDs never produce a PR, a client call or an advisory lookup; every rejection is audited (rules 5, 8, N2) | `tests/necromancer.test.ts` |
| Chosen version is above current, outside every affected range, and the minimum candidate (brute-force comparison), same major preferred (N2) | `tests/necromancer.test.ts` |
| At most 5 PRs per raid, one dependency per PR; PR body has the required fields and no commit author (rule 6, blameless, N2) | `tests/necromancer.test.ts` |
| The mocked client records zero merge-like calls for random inputs; `src/` and `scripts/` contain no merge endpoint or command, and the check fails on planted offenders (rule 2, N3) | `tests/necromancer.test.ts`, `tests/inquisitor.test.ts`, `tests/reraise.test.ts`, `tests/static.test.ts` |
| After SEAL zero API calls for any input: Necromancer, Inquisitor, re-raise (rule 7, N6) | `tests/necromancer.test.ts`, `tests/inquisitor.test.ts`, `tests/reraise.test.ts` |
| Any GitHub or CI error leaves `out/state.json` byte-identical; red, timeout and missing CI keep the limb Rotting (rule 1, N4, N5) | `tests/inquisitor.test.ts`, `tests/reraise.test.ts` |
| A landed PR heals its limb and the regenerated creature no longer spawns it (N5) | `tests/reraise.test.ts` |
| For any typed input and any interpreter output, the input echo yields no event (web-player W4.4) | `tests/output-hook.test.ts` |
| `request_graft` with any string writes a request only for an ID in `limbs.json` while unsealed (rules 1, 5, M3) | `tests/mcp.test.ts` |
| After `seal()` zero requests for any input through MCP (rule 7, M3) | `tests/mcp.test.ts` |
| No MCP tool output contains a token-looking string or a git author (blameless, M4) | `tests/mcp.test.ts` |
| Any chunk split of interpreter text yields the same lines and events as the whole text (W2.2) | `tests/output-hook.test.ts` |

## Spec → code traceability
| Task | Commit | Test |
|---|---|---|
| 3 package.json, tsconfig, vitest | see commit `feat: implement transcript bridge spike` | `npm test` |
| 4 `scripts/setup-tools.sh` | same | `npm run spike` from a clean `.toolchain/` |
| 5, 6 `game/spike.inf`, `scripts/build-game.sh` | same | `npm run spike` |
| 7 `scripts/play.ts` | same | `npm run spike` (transcript.txt) |
| 8 `src/bridge/grammar.ts` | same | `tests/grammar.test.ts` |
| 9 `src/bridge/watch.ts` | same | `tests/watch.test.ts`, `tests/static.test.ts` |
| 10 property tests | same | `npm test` |
| 11 `npm run spike` + `scripts/check-spike.ts` | same | exits non-zero unless 1 request, 4 audit lines, 1 REJECTED_SEALED |

### bridge-v2 (issue #3)
| Task | Commit | Test |
|---|---|---|
| 1 `game/spike.inf` markers on accepted actions | `feat: bridge v2 game markers` | `npm run spike` (4 marker lines in `transcript.txt`) |
| 2 `src/bridge/parse-output.ts` | same | `tests/parse-output.test.ts` |
| 3 `src/bridge/watch.ts` uses `parseGameOutput` | same | `tests/watch.test.ts`, `tests/review.test.ts` |
| 4 to 6 marker transcripts, spoofing property | same | `tests/helpers.ts`, `tests/parse-output.test.ts` |
| 7 `scripts/check-spike.ts` | same | `npm run spike` |
| 8 failsafe property tests, docs | same | `npm test` |

### exhume-and-rank (issue #5)
| Task | Commit | Test |
|---|---|---|
| 1 spec | `docs: add exhume-and-rank spec` | n/a (committed before code) |
| 2 to 7 `src/exhume/*`, `scripts/exhume.ts`, `scripts/feeds-update.ts`, `scripts/osv-client.ts`, `bin/crypt.mjs` | `feat: exhume and deterministic KEV/EPSS ranking` | `tests/exhume.test.ts`, `tests/static.test.ts` |
| 8 `fixtures/vulnerable-npm/`, `data/cache/osv/` | same | `npm run exhume -- fixtures/vulnerable-npm --feeds fixtures/vulnerable-npm/feeds` twice and with `--offline` give identical `out/creature.json` |
| 9 property and unit tests | same | `npm test` |
| 10 attribution, docs | same | `docs/ATTRIBUTION.md` has no TODO for OSV, KEV, EPSS |

### raise-the-creature (issue #8)
| Task | Commit | Test |
|---|---|---|
| 1 spec | `docs: add raise-the-creature spec` | n/a (committed before code) |
| 2 to 5, 7 `src/bridge/grammar.ts`, `src/bridge/watch.ts`, `game/spike.inf`, `src/raise/generate.ts`, `src/raise/sanitize.ts` | `feat: raise the creature generator, ASSIGN verb and graft fix` | `tests/raise.test.ts`, `tests/grammar.test.ts`, `tests/watch.test.ts` |
| 6, 8 `scripts/raise.ts`, `scripts/play.ts`, `scripts/check-raise.ts`, `bin/crypt.mjs` | `feat: raise script, z8 compile and acceptance check` | `npm run raise:check`: EXAMINE, ASSIGN, GRAFT JQUERY, SEAL CRYPT, GRAFT LODASH give 1 graft request for jquery and 0 after seal |
| 9 docs | `docs: update KIRO.md and README for raise` | n/a |

### necromancer (issue #11)
| Task | Commit | Test |
|---|---|---|
| 1 spec | `docs: add necromancer spec` | n/a (committed before code) |
| 2 `.kiro/agents/*.json` | `feat: necromancer and inquisitor agents, complete mediation` | n/a |
| 3 `src/bridge/watch.ts` mediation, `scripts/reset.ts`, `scripts/check-raise.ts` | same | `tests/watch.test.ts`, `npm run spike`, `npm run raise:check` |
| 5 `src/necromancer/version.ts`, `advisory.ts` | `feat: necromancer version choice, PR builder and GithubClient` | `tests/necromancer.test.ts` (brute-force comparison) |
| 6 `src/github/client.ts`, `scripts/github-client.ts` | same | `tests/static.test.ts`, mocked client in `tests/agent-helpers.ts` |
| 7 `src/necromancer/index.ts` | same | `tests/necromancer.test.ts` |
| 8 `src/inquisitor/index.ts` | `feat: inquisitor and re-raise` | `tests/inquisitor.test.ts` |
| 9 `src/reraise/index.ts`, `scripts/reraise.ts`, `scripts/compile.ts` | same | `tests/reraise.test.ts`, manual: reraise then `out/limbs.json` lacks JQUERY |
| 10 `scripts/necromancer.ts`, `inquisitor.ts`, npm scripts | `feat: CLIs, fixture advisories and acceptance check` | `npm run necromancer:check` |
| 11 `fixtures/vulnerable-npm/advisories/` | same | `docs/ATTRIBUTION.md` row |
| 12 tests, static extension | with each feature commit | `npm test` |
| 13 `scripts/check-necromancer.ts` | same | `npm run necromancer:check`: GRAFT JQUERY gives 1 payload (jquery 3.4.1 to 3.5.0, breaking false), 0 after SEAL CRYPT |
| 14 docs | `docs: necromancer usage and KIRO.md` | n/a |

### web-player (issue #6)
| Task | Commit | Test |
|---|---|---|
| 2, 3 `src/web/output-hook.ts` and tests | `feat: web player` | `tests/output-hook.test.ts` |
| 4 vendored ZVM, `src/web/glk-shim.ts`, `src/web/player.ts` | same | real `spike.z5` run in `tests/output-hook.test.ts` (skipped when `spike.z5` is not built) |
| 5, 6 `web/index.html`, `web/app.js`, `web/style.css` | same | headless Chromium check (not in CI): `GRAFT ARM` logs `[[CRYPT GRAFT ARM]]`, typing the marker logs nothing, only same-origin requests |
| 7, 8 `scripts/web.ts`, `tsconfig.web.json`, `npm run web` | same | curl of page, `.z5`, traversal (404) and POST (405) |
| 10 docs | same | review |

## Spec → code traceability, generated
Task, commit and test for the production-readiness spec, generated by the `trace-on-tasks-save` hook (`npx tsx scripts/hooks/kiro-trace.ts --write epic-a-production`). Commit hashes change when a branch is rebased; saving `tasks.md` regenerates them.

<!-- kiro-trace:begin (generated by scripts/hooks/kiro-trace.ts; edit tasks.md, not this block) -->
### epic-a-production
| Task | Commit | Test |
|---|---|---|
| A1.1 Specs: requirements, design, tasks (this folder), committed before ... | `b7cc099` | n/a |
| A1.2 Baseline: npm ci, typecheck, vitest, spike, raise:check, necromance... | `b7cc099` | n/a |
| A1.3 scripts/ci/raid-offline.sh | `b7cc099` | n/a |
| A1.4 tests/runs.ts and CRYPT_NUM_RUNS in every property test | `b7cc099` | n/a |
| A1.5 scripts/ci/failsafe-guard.sh and tests/failsafe-guard.test.ts | `b7cc099` | `tests/failsafe-guard.test.ts` |
| A1.6 .github/workflows/ci.yml with jobs test and failsafe-guard | `b7cc099` | n/a |
| A1.7 README CI badge | `b7cc099` | n/a |
| A2.1 Hook scripts in scripts/hooks/ and tests in tests/hooks.test.ts | `771e8be` | `tests/hooks.test.ts` |
| A2.2 Five hook definitions in .kiro/hooks/ (tests, failsafe, traceabilit... | `771e8be` | n/a |
| A2.3 docs/KIRO.md documents the hooks with real captured output, traceab... | `771e8be` | n/a |
| A3.1 Demo creature built from the fixture | `2d92b87` | n/a |
| A3.2 Pages workflow (build, upload, deploy) | `2d92b87` | n/a |
| A3.3 CORS check recorded in design.md | `2d92b87` | n/a |
| A3.4 Gallery of the 20 census creatures (snapshots, alphabetical, aggreg... | `2d92b87` | n/a |
| A3.5 Grafts show the dry-run payload; download button; subtitle | `2d92b87` | n/a |
| A3.6 tests/site.test.ts and README Live demo | `2d92b87` | `tests/site.test.ts` |
| A4.1 npm pack --dry-run matches the whitelist | `57c5423` | n/a |
| A4.2 Tarball smoke test in a clean directory | `57c5423` | n/a |
| A4.3 docs/ATTRIBUTION.md updated | `57c5423` | n/a |

<!-- kiro-trace:end -->

## Epic A outcomes
- A1 CI: `ci.yml` jobs `test`, `failsafe-guard` and `pack-install`; `CRYPT_NUM_RUNS=1000` for property tests.
- A2 hooks: 5 hooks with testable scripts in `scripts/hooks/`, documented above with captured runs.
- A3 Pages: demo creature and a 20-creature gallery, deployed by `pages.yml`; CORS measured and recorded in design.md.
- A4 npm: `@e-1305/crypt` (`crypt` and `crypt-cli` are taken, checked 2026-11-17), 108 files and 64 kB packed, tarball install tested on Node 20 and 22 in CI. Not published: the owner runs `npm publish` after confirming the `@e-1305` scope.

## Numbers
- Specs: 11 (`ls .kiro/specs | wc -l`) · Hooks: 5 (`ls .kiro/hooks | wc -l`) · Steering files: 5 (`ls .kiro/steering | wc -l`) · Custom agents: 2
- Property tests: 63 (`grep -rhoE "fc\.assert\(" tests | wc -l`, in 16 files)
- Tests: 345 (`npx vitest run`)
