# Requirements: d4-war-room

Goal: the weekly 15-minute raid runs on a TV in the VOC/SOC room. The War Room page shows the team raid with live pull request state, big enough to read from across the room (issue #103, Epic D). Follows `.kiro/steering/failsafe.md`, `blameless.md`, `product.md` and `sla-policy.md`. Feature freeze (Nov 27): this feature is in scope.

Scope: `web/war-room/` (page), `src/warroom/` (pure core), `tests/warroom.test.ts`, the spec, screenshots, plus the minimal wiring in `tsconfig.web.json`, `scripts/build-site.ts` and `scripts/ci/visual-qa.mjs`. No file under `src/theatre/` changes.

## W1 Scene
1. One creature scene for the team: every sick limb (Possessed or Rotting) has a phase: `possessed`, `rotting`, `pr-open`, `ci-running`, `ci-green`, `ci-red`, `healed`.
2. KEV limbs are bosses with an HP bar. HP is EPSS times exposure, both 0..1. Exposure is a deterministic input (default 1). A missing or invalid value counts as full HP (fail-safe). HP is 0 once the limb is healed. Bosses are ordered KEV first, then HP descending, then limb key.
3. One team score: risk removed (`teamScore` from `src/theatre/raid.ts`), counting healed limbs only.
4. Countdown from 15:00 (`RAID_MS`), shown with `formatClock`. The clock is injected.
5. Combo streak from `comboState` (`src/theatre/gamify.ts`), counted over heal times.
6. Live feed: one line per event, newest last.
7. Effects: heal with thunder on a human merge, convulse with `REJECTION_LINE` on a red CI.

## W2 Healed means a human merged
1. A limb is `healed` if and only if the event log holds a `human-merged` event for it. Event order, duplicates and interleaving do not change this.
2. `ci-green`, `pr-opened`, `ci-running` and `ci-red` never heal. A `ci-red` after a `human-merged` does not un-heal.
3. `human-merged` is derived from the pull request field `merged_at` that a person's merge leaves behind. CRYPT never performs it and the code has no merge call or endpoint.
4. Anything malformed is ignored and changes nothing.

## W3 Data sources
1. Live: GitHub REST, GET only. Pull requests whose `head.ref` starts with `crypt/`, and check runs for the head sha. The adapter only normalises data. `fetch` is injected by the page.
2. Rate limits: honour `x-ratelimit-remaining`, `x-ratelimit-reset` and `retry-after`. Back off, never hammer. Unauthenticated access allows 60 requests per hour, so the default poll delay is 70 s and shrinks only with a token.
3. Token: optional, passed as a function argument, never stored, logged or written to storage (no localStorage, sessionStorage or cookie).
4. SIMULATED mode (default on the hosted page and for the `crypt-demo` creature): a scripted timeline with one red CI rejection and one human merge. Every event carries `source: "simulated"` and the page says `SIMULATED CI` on screen.

## W4 Gamification (team only)
1. Season badges as pure functions of the scene: First Blood (first KEV limb healed), Night Shift (3 heals in one raid), Nights Without Possession: 7.
2. End-of-raid recap reuses `cardData` from `src/theatre/card.ts`.

## W5 Blameless and failsafe
1. No per-person ranking or total exists. A name appears only in the praise line "healed by <name>" on a `human-merged` event.
2. No failure text names a person. UI copy states actions, not prohibitions.
3. Fail safe: on any error nothing changes and a limb is never marked healed.
4. KEV limbs are tracked against the 48 h SLA (`sla-policy.md`). Ranking is deterministic code, no LLM.

## W6 Acceptance
Property tests (fast-check, `CRYPT_NUM_RUNS`) cover W2, idempotence, boss HP, malformed input, blameless output, rate limits and a static scan of `src/warroom`. `failsafe-guard.sh` passes. Visual QA covers the page with screenshots.
