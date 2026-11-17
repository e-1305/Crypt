# Tasks: transcript-bridge-spike

- [x] 1. Probe Inform 6 compiler and dfrotz; record limitations and licenses (R10, design Limitations)
- [x] 2. Write requirements.md, design.md, tasks.md
- [x] 3. Project scaffold: package.json, tsconfig, vitest, `.gitignore` additions (`.toolchain/`)
- [x] 4. `scripts/setup-tools.sh`: build inform6, dfrotz (`-fcommon`), fetch library, case-fixed include dir (R2, L4, L6)
- [x] 5. `game/spike.inf` with room, arm, EXAMINE, GRAFT, SEAL CRYPT (R1)
- [x] 6. `scripts/build-game.sh` compile to `spike.z5` (R2.1)
- [x] 7. `scripts/play.ts` headless driver writing `transcript.txt` (R2.2, L1 to L3, L5)
- [x] 8. `src/bridge/grammar.ts` strict parser (R3)
- [x] 9. `src/bridge/watch.ts` watcher: requests, audit, seal, fail-safe (R4 to R7)
- [x] 10. Property tests for each failsafe rule (R9)
- [x] 11. `npm run spike` end to end plus count check (R8)
- [ ] 12. Update `docs/ATTRIBUTION.md`, `docs/KIRO.md`; open PR (do not merge)
