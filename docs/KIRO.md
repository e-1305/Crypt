# How CRYPT was built with Kiro

> Fill this in as you go. Judges score how thoroughly and skilfully Kiro was used.

## Specs
| Spec | Folder | Outcome |
|---|---|---|
| transcript-bridge-spike | `.kiro/specs/transcript-bridge-spike/` | requirements, design (with interpreter limitations and fallbacks) and tasks written; implemented (tasks 1 to 11), PR step pending |

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

## Numbers
- Specs: 1 · Hooks: TODO · Steering files: 5 · Property tests: 9
