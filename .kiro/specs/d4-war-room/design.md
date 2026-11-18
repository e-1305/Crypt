# Design: d4-war-room

`src/warroom/` is pure: no fs, no clock, no random, no network. The clock and `fetch` are passed in.

- `events.ts`: `WarEvent` (`pr-opened`, `ci-running`, `ci-green`, `ci-red`, `human-merged`) with `limb` (key format checked through `parseHealEvent` from `src/theatre/heal-events.ts`), optional `pr`, `at` (epoch ms), optional `healedBy` (human-merged only) and optional `source`. `parseWarEvent(raw)` returns null for anything malformed.
- `state.ts`: `reduce(state, event)` inserts into a sorted, de-duplicated log (total order on event content, so arrival order never matters). `sceneFrom(events, limbs, now, opts)` folds the log into the scene. `healed` is absorbing and reachable only through `human-merged`. Boss HP is `bossHp(epss, exposure)`. Bosses ordered by `bossOrder`.
- `badges.ts`: season badges from the scene.
- `github-events.ts`: `limbForBranch`, `eventsFromPull`, `eventsFromCheckRuns`, `rateLimitDecision(headers, now, authed)`, `pollPlan` (GET URLs only).
- `simulated.ts`: `simulatedTimeline(limbs, t0)`.
- `recap.ts`: `recapFor(scene, repo)` maps to `cardData`.

Page: `web/war-room/` imports the compiled modules from `js/warroom/` (`tsconfig.web.json` includes `src/warroom/*.ts`). `scripts/build-site.ts` copies `web/war-room/`. The page is large type on a dark CRT palette, readable from 5 m, with reduced-motion support.

Branch mapping: grafts use `crypt/graft-<limb>-<version>`, so a pull request maps to the limb whose lowercase name is the longest prefix after `crypt/graft-`.
