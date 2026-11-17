# Design: art-direction

## Renderer
`src/render/plate.ts` exports:
- `creatureName(repo)`: FNV-1a hash of the repo name picks a name and a number 1 to 99.
- `layoutPlate(creature, options)`: returns lines made of segments `{ text, state?, limb? }`. The web page uses the segments to style single limbs.
- `renderPlate(creature, options)`: joins the segments into the final string.

Layout (80 columns): labels for the left slots start at column 0 (max 24 chars), the figure sits at columns 27 to 52, labels for the right slots start at column 56. A leader of `-` ends in `>` or `<` at the figure edge of that row.

The figure is a fixed template with one letter per slot. Slots in order: head, chest, left arm, right arm, belly, left leg, right leg, left foot, right foot. A slot letter becomes the state texture: `#`, `%`, `.` or a space (healed, clean outline). Spawned limbs fill slots by rank, then healed limbs. The rest are listed under the figure (at most 8 lines, then a count).

The repo name is `options.repo`, else `creature.repo`, else `the-crypt`. The CLI defaults it to the name of the working directory.

## Healed
reraise stays as is. The renderer treats `state === "Healed"` or `healed === true` as healed. `web/app.js` stores seen unhealthy limbs in localStorage and marks them healed when they come back Healthy.

## Web
`scripts/web.ts` copies `out/creature.json` to `web/game/creature.json` (with `repo` set when absent). `web/app.js` imports `js/render/plate.js` (compiled by `tsc -p tsconfig.web.json`, which now includes `src/render/plate.ts`) and draws each segment as a `span` with `data-state`. CSS handles glitch and the HEALED flash. A button toggles `body.hc`.

## Files
`src/render/plate.ts`, `scripts/plate.ts`, `tests/plate.test.ts`, `web/index.html`, `web/app.js`, `web/style.css`, `docs/ACCESSIBILITY.md`, prose in `src/raise/generate.ts`.
