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
| epic-b-operating-theatre | `.kiro/specs/epic-b-operating-theatre/` | requirements (B1 to B5), design (capability decision, fallback rules, budgets, branching) and tasks written and committed before any code (`docs: add Epic B spec`); implemented as five stacked milestone branches. Result: a 3D bench around the CRT that falls back to the plain 2D page, a 15 minute team raid, simulated live heals, synthesised sound and a recording mode for the demo video |

## Steering
| File | Purpose |
|---|---|
| `product.md` | Product scope and Tier 1 boundary |
| `tech.md` | Stack and data sources |
| `failsafe.md` | Saltzer & Schroeder safety rules |
| `sla-policy.md` | Deterministic ranking and SLAs |
| `blameless.md` | Bartol's blameless rules |

## Hooks
| Hook | Trigger | What it does | Time saved |
|---|---|---|---|
| TODO | | | |

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

### epic-b-operating-theatre (Epic B)
| Milestone | Branch | Content | Test |
|---|---|---|---|
| B0 | n/a | baseline: `npm ci`, `npm run typecheck`, `npm test`, `npm run web` | all green before B1 |
| B1 | `feat/b1-bench` | Three.js bench, CRT shader, plate texture, 2D fallback, budgets, a11y notes, ATTRIBUTION | `tests/theatre-capability.test.ts`, Playwright load check, axe-core on the 2D page |
| B2 | `feat/b2-raid` | `src/theatre/raid.ts`, 15 minute timer, team score, rank, nights counter, end card PNG | `tests/raid.test.ts` |
| B3 | `feat/b3-live-heal` | heal events, plate glow and convulsion, simulated CI replay labelled SIMULATED CI, lamp thunder | `tests/heal-events.test.ts` |
| B4 | `feat/b4-sound` | synthesised audio, muted by default toggle, heartbeat tied to possessed count | `tests/audio-plan.test.ts` |
| B5 | `feat/b5-polish` | title card, camera dolly-in, recording mode, `docs/DEMO.md`, this section | `tests/polish.test.ts`, Playwright check |

Pure decision logic (capability, raid scoring, heal events, audio plan, title card timing, record flag, dolly easing) lives in `src/theatre/*.ts` with vitest tests. The browser files in `web/` only read the DOM and the clock. Each branch was stacked on the previous one because none had merged into `main` yet.

## Numbers
- Specs: 6 · Hooks: TODO · Steering files: 5 · Property tests: 40 (16 bridge, 9 exhume, 4 raise, 11 necromancer, inquisitor and re-raise) · Tests: 143 at the web-player milestone, **319 after Epic B** (`npm test`: 23 test files, 319 tests passed; B5 added 8 in `tests/polish.test.ts`). The property test split above was not re-counted after Epic B.

