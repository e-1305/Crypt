# Design: epic-c2-devpost

## Files
- `docs/DEVPOST.md`: the only product file. Keeps the good lines of the previous version (Inspiration, safety wording, the Not verified bullet).
- `tests/devpost-docs.test.ts`: unchanged. It enforces the 60 line cap, no em dash, the seven required headings and the Not verified line.

## Sources of each number
| Claim | Source |
|---|---|
| 248 findings to 3 monsters, 95.2%, 11,244 limbs, 84.7% unowned, 16 of 20 no CODEOWNERS | `docs/census/RESULTS.md`, reproduce with `npm run census` |
| Spec folders, steering files, hooks, agents | counted in `.kiro/specs/`, `.kiro/steering/`, `.kiro/hooks/`, `.kiro/agents/` |
| Passing tests | `npx vitest run` |
| Pillars | README.md pillar table and `.kiro/steering/*.md` |
| Kiro limits | `docs/KIRO.md` Limits |

## Layout under 60 lines
Short paragraphs, one line per bullet, no blank-line padding beyond one between blocks. Wording stays terse rather than relaxing the test.

## Checks
`npx vitest run tests/devpost-docs.test.ts`, `npx vitest run`, `npm run typecheck`, `grep -c` for the em dash, `wc -l`, and an existence check for each relative link.
