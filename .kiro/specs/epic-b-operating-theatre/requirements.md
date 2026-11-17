# Requirements: Epic B, The Operating Theatre (issue #26)

A single dark 1979 laboratory bench in the browser. A 3D CRT whose screen is the playable Z-machine game. The anatomical plate on the wall, lit by a lamp. Fixed camera, slight parallax. Text adventure stays the core interaction; 3D is the stage.

Scope fence: work only in `web/`, `src/theatre/` (new), `src/render/`, `src/raise/` prose, `assets/`, `docs/`, plus tests in `tests/` and this spec. Any change outside these (for example `tsconfig.web.json` include list, `scripts/web.ts` static content-types) is the minimum needed and is called out in the PR description.

Steering that applies: `blameless.md` (no individual leaderboard, names only in praise as "healed by", rot attributed to limbs, UI copy states actions not prohibitions), `failsafe.md` (no merge calls, scoring deterministic code with no LLM, errors change nothing), `tech.md` (every third-party asset recorded in `docs/ATTRIBUTION.md` with license), `sla-policy.md` (KEV 48h SLA, EPSS >= 0.1).

## B1 The bench
- B1.1 Three.js scene: bench, lamp, CRT model from primitives or a CC0 model. Three.js license (MIT) and any model source recorded in `docs/ATTRIBUTION.md`. No copyrighted assets.
- B1.2 The existing web player (`web/app.js`, `src/web/player.ts`) renders to a canvas texture mapped on the CRT screen. Keyboard focus and typing work; the game is fully playable.
- B1.3 CRT shader: curvature, scanlines, phosphor bloom, subtle flicker.
- B1.4 Plate on the wall: `layoutPlate` output drawn to a texture; limb states (Possessed, Rotting, Healed, Healthy) visible.
- B1.5 Fallback to the current 2D page when WebGL is unavailable, `prefers-reduced-motion: reduce` is set, or high-contrast mode is on. Lighthouse accessibility >= 95 on the 2D fallback. 3D accessibility limits documented honestly in `docs/ACCESSIBILITY.md`.
- B1.6 60 fps on a mid laptop (measured or honestly stated how measured). Total page weight <= 5 MB (measured, recorded in docs).

## B2 The raid (blameless team gamification)
- B2.1 15-minute raid timer, started by `RAID` in the game or a lever on the bench.
- B2.2 Team score = risk removed = sum of EPSS x KEV weight over limbs healed or confirmed `awaiting-human-merge`. One team score. No individual leaderboard.
- B2.3 Surgeon ranks Apprentice, Surgeon, Resurrectionist, earned only through heals. People named only in praise ("healed by").
- B2.4 Nights Without Possession counter on the wall: days since a KEV limb stayed open past its 48h SLA.
- B2.5 End-of-raid card: limbs healed, risk removed, time, a short eerie epitaph. Shareable as an image containing only public scan data (no secrets, no repo internals beyond the public scan).
- B2.6 Scoring, ranking and counter are deterministic pure functions in `src/theatre/` with property tests. No LLM.

## B3 Live healing
- B3.1 When the Inquisitor or reraise reports a limb healed, the plate limb heals live: stitches glow, rot texture fades, thunder flash.
- B3.2 When CI goes red the limb convulses and the game prints the rejection line.
- B3.3 Hosted demo with no token: simulate the loop from the dry-run payload with a clearly labelled "simulated CI".
- B3.4 Fail-safe: ambiguity or error leaves the limb rotting.

## B4 Sound
- B4.1 CRT hum, heartbeat that speeds up with the count of possessed limbs, thunder on heal, needle clicks on GRAFT.
- B4.2 Original (synthesised in code) or CC0 only; licenses in `docs/ATTRIBUTION.md`.
- B4.3 Muted by default, obvious toggle, respects reduced-motion and a11y mode (no audio autoplay in them).

## B5 Polish
- B5.1 Title card "CRYPT — Don't abandon your creature." on load, 3-second cold open (skippable, not shown in 2D fallback).
- B5.2 Camera dolly-in to the CRT when the player starts typing.
- B5.3 Screenshot/recording mode hides UI chrome.

## Done when
Playable end-to-end on the demo creature when deployed via Epic A's Pages workflow; raid mode works; simulated live-heal works; sounds licensed; 2D fallback a11y >= 95. `docs/KIRO.md` updated; `docs/DEMO.md` has the video shot list.
