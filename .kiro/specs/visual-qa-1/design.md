# Design: visual-qa-1

- `src/theatre/capability.ts`: `decideTheatre` gains inputs `viewportWidth` and `coarsePointer`. New rule after the explicit `?theatre=` flag and before the 3D default: small screen gives `{mode:'2d', reason:'small-screen'}`. `web/theatre.js` reads `window.innerWidth` and `matchMedia('(pointer: coarse)')`.
- 3D link: when reason is `small-screen` and webgl2 works, `web/theatre.js` unhides `#view-3d`, an anchor in `index.html` with href `?theatre=3d`.
- CSS: one `@media (max-width: 899px)` block in `web/style.css` makes the layout a block flow, plate in an `overflow-x:auto` box, controls `min-height/min-width: 44px`.
- Raid panel: `#raid-readout` becomes a grid with the health bar and vitals in one row and the nights stat in a separate row. The 3D board in `web/theatre/board.js` places the stat in its own band under the health bar.
- Demo: `fixtures/crypt-demo/{package.json,package-lock.json,SNAPSHOT.json}` with the pinned SHA. `scripts/build-site.ts` exhumes it offline with the committed OSV cache and feeds. The old fixture stays available as id `fixture` for tests.
