# Tasks: bridge-v2

- [x] 1. `game/spike.inf`: print `[[CRYPT GRAFT ARM]]`, `[[CRYPT EXAMINE ARM]]`, `[[CRYPT SEAL]]` from accepted-action routines only (V1)
- [x] 2. `src/bridge/parse-output.ts`: pure `parseGameOutput(text)`, marker regex, payload mapping, grammar gate (V2, V3, V6)
- [x] 3. `src/bridge/watch.ts`: call `parseGameOutput`, stop triggering on `> ` lines, stderr note for rejected markers (V2, V3)
- [x] 4. Update existing tests and `tests/helpers.ts` to marker transcripts (V5, V7)
- [x] 5. Tests for `parseGameOutput`: whole line only, extra text, grammar failure, purity (V3, V6)
- [x] 6. Spoofing property test: `> [[CRYPT ...]]` input never acts (V4)
- [x] 7. Check `scripts/play.ts` and `scripts/check-spike.ts`; `npm run spike` still gives 1 request, 4 audit lines, 1 `REJECTED_SEALED` (V5)
- [x] 8. Confirm property tests for failsafe rules 1, 2, 4, 5, 7, 8 still pass; update `docs/KIRO.md` and README (V7)
