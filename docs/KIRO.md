# How CRYPT was built with Kiro

> Fill this in as you go. Judges score how thoroughly and skilfully Kiro was used.

## Specs
| Spec | Folder | Outcome |
|---|---|---|
| transcript-bridge-spike | `.kiro/specs/transcript-bridge-spike/` | requirements, design (with interpreter limitations and fallbacks) and tasks written; implemented (tasks 1 to 11), PR step pending |
| bridge-v2 | `.kiro/specs/bridge-v2/` | requirements (V1 to V7), design (marker syntax, `GameEvent`, Tier 1 browser reading, threat notes) and tasks written before coding; implemented. Driven by issue #3: the game now prints `[[CRYPT ...]]` markers on accepted actions and the watcher triggers only on those, not on `> ` input lines |

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
| Necromancer | Drafts the fix PR |
| Inquisitor | Verifies the fix |

## MCP
TODO

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

## Numbers
- Specs: 2 · Hooks: TODO · Steering files: 5 · Property tests: 14
