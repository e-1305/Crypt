# Requirements: visual-qa-1

Goal: fix the three visual defects from issue #56. Follows `.kiro/steering/failsafe.md`. Builds on `web-player` and `epic-b-operating-theatre`.

Terms: **Small screen** is a viewport narrower than 900px or a device whose primary pointer is coarse. **3D bench** is the three.js theatre. **Plate** is the creature plate on the page.

## V1 Small screens get the 2D page
1. WHEN the viewport width is below 900px, or the primary pointer is coarse, and no `?theatre=` flag is given, `decideTheatre` SHALL choose 2D with reason `small-screen`.
2. WHEN the URL carries `?theatre=3d`, the page SHALL still choose 3D on a small screen if WebGL2 works.
3. WHEN 3D is capable but the small-screen rule chose 2D, the page SHALL show a link "View the 3D bench" whose href is `?theatre=3d`.
4. `?theatre=2d` SHALL keep forcing 2D. Reduced motion and high contrast rules SHALL stay unchanged.

## V2 Mobile 2D layout
1. Below 900px the page SHALL use a single column in this order: plate, game, raid panel, sim controls.
2. The plate SHALL scroll horizontally inside its own box. The page SHALL NOT scroll horizontally.
3. In 2D mode below 900px no element SHALL be fixed or absolutely positioned over another control.
4. Buttons, inputs and links used as controls SHALL be at least 44px high and 44px wide.

## V3 Raid panel has no overlapping text
1. The side stats (Nights Without Possession and its counted-from text) SHALL sit in their own row or column, apart from the health bar and the "Health N" text.
2. This SHALL hold at viewport widths 1280, 1440 and 1920, in the 2D raid section and in the 3D THE RAID panel.
3. Any pure layout math SHALL be covered by `tests/raid-board-layout.test.ts`.

## V4 Default demo creature is crypt-demo
1. The built site's `demo` creature SHALL be the repo `crypt-demo`, owner `@e-1305`, with limbs JQUERY and LODASH.
2. It SHALL be built offline from a committed snapshot of the crypt-demo `package.json` and `package-lock.json`, in `fixtures/crypt-demo/`.
3. The snapshot SHALL record the commit SHA it was taken from, and the SHA SHALL be visible in the docs.
4. `npm run build:site` SHALL make no network call and SHALL be deterministic.
