# Design: Epic B, The Operating Theatre

## Architecture
- `web/index.html` keeps the 2D page as the default DOM. `web/theatre.js` (new, ES module) decides at load: if WebGL2 is available and not reduced-motion and not high-contrast, it dynamically imports `web/vendor/three.module.min.js` and mounts the 3D stage; otherwise it does nothing and the 2D page stays untouched (this is the fallback and the a11y baseline). Three.js is vendored and only loaded on the 3D path so the 2D path stays light.
- Pure logic lives in `src/theatre/*.ts` (compiled to `web/js/theatre/` through `tsconfig.web.json`, same pattern as `src/web/`): `raid.ts` (timer state machine, score, ranks, nights counter, epitaph), `heal-events.ts` (event types and the simulated loop), `audio-plan.ts` (heartbeat rate from possessed count), `card.ts` (end-of-raid card data and sanitising). Browser-only glue (Three.js, WebAudio, canvas) stays in `web/` and is thin.
- Game text and plate are drawn to offscreen canvases (`CanvasTexture`). The existing DOM transcript and input remain the source of truth; the 3D stage mirrors the transcript to the CRT canvas and routes key events to the hidden but focusable `#cmd` input so the screen reader and keyboard flow still work.
- Bridge: the `onResult` events from `web/app.js` are exposed through a small `window`-free event emitter (`CustomEvent` on `document`) so theatre code subscribes without modifying player logic more than adding dispatch calls.

## Scoring (B2, deterministic)
risk(limb) = EPSS (0 if null) x weight, weight = 3 if KEV else 1. Teamscore = sum over healed or `awaiting-human-merge` limbs. Rank thresholds by number of limbs healed: 0 Apprentice, >=3 Surgeon, >=7 Resurrectionist (constants exported, tested). Healer names appear only from CODEOWNERS-sourced or "healed by" praise fields; no ordering of people, no per-person totals shown. Nights Without Possession: whole days since the latest moment a KEV limb remained open beyond 48h of its detection; no breach means days since the scan start.

## Live heal (B3)
`heal-events` defines `{type:"healed"|"ci-red"|"ci-green", limb}`. A real source (polling `game/creature.json` after reraise) and a simulated source (replays the dry-run payload with a visible "SIMULATED CI" label) share the interface. Plate redraw animates state transitions on the plate canvas (glow, fade) and a lightning flash on the lamp light. Red CI: convulse animation plus a printed rejection line in the transcript. Unknown or malformed events are ignored (fail-safe).

## Sound (B4)
WebAudio synthesis in code (oscillator hum, filtered noise thunder, low-pass thump heartbeat, click bursts), so there are no audio files and no third-party licenses; ATTRIBUTION records "original, synthesised, MIT". AudioContext is created only after a user click on the mute toggle.

## Budgets and verification
Page weight: sum of transferred files for first load on 3D path <= 5 MB, measured by a script or Playwright and recorded in docs. fps measured with Playwright/Chromium `requestAnimationFrame` sampling and honestly caveated (software GL). Lighthouse a11y on the 2D fallback >= 95 via `?theatre=off` URL flag or reduced-motion emulation.

## Branching
One branch per milestone: `feat/b1-bench`, `feat/b2-raid`, `feat/b3-live-heal`, `feat/b4-sound`, `feat/b5-polish`. Each created from freshly fetched `origin/main` (rebase before finishing). Milestones are stacked in dependency (B2..B5 need B1) but each branch is rebased on main; if B1 is not yet merged, later branches are based on the previous milestone branch and rebased on main as soon as it lands.
