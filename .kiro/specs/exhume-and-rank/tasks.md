# Tasks: exhume-and-rank

- [x] 1. Specs: requirements, design, tasks (this folder), committed before code
- [x] 2. `src/exhume/lockfile.ts`: package-lock v2/v3 and requirements.txt parsing, dedupe, sort (E1)
- [x] 3. `src/exhume/owners.ts`: CODEOWNERS parser and matcher (E6)
- [x] 4. `src/exhume/osv.ts` and `scripts/osv-client.ts`: cache, injected lookup, fail-safe unknown (E2)
- [x] 5. `src/exhume/feeds.ts` and `scripts/feeds-update.ts`, `npm run feeds:update` (E3)
- [x] 6. `src/exhume/rank.ts`: score, states, spawned, counts (E4, E5)
- [x] 7. `src/exhume/creature.ts`, `scripts/exhume.ts`, `bin/crypt.mjs`, `npm run exhume` (E7)
- [x] 8. `fixtures/vulnerable-npm/` with a KEV-listed CVE, OSV cache and feeds snapshot (E9)
- [x] 9. Unit tests and property tests (design table)
- [x] 10. `docs/ATTRIBUTION.md`, `docs/KIRO.md`, README (E8)
- [x] 11. Verify: typecheck, tests, two runs plus an offline run give identical `creature.json`
