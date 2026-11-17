# Accessibility

CRYPT is a text adventure, so its core is already screen-reader friendly. The game is text in and text out. The art direction adds a picture (the plate) and CRT effects, and each of them has a plain-text equivalent.

## Design choices

- **Text first.** The game transcript is a `role="log"` region with live updates. Every command has a labelled input.
- **State is never told by color alone.** Possessed is `#` plus the word POSSESSED. Rotting is `%` plus ROTTING. Healed is clean lines plus HEALED. Healthy is `.`. A legend is printed on the plate.
- **The plate has a text twin.** The plate is exposed as an image with a text summary of each limb and its state (`jquery 3.5.0: Healed`).
- **Game events are announced.** A polite `aria-live` status region announces detected commands, rejected commands and healed limbs.
- **Reduced motion.** `prefers-reduced-motion: reduce` turns off every animation (the Possessed glitch and the HEALED flash). The effects are CSS only.
- **High-contrast / screen-reader mode.** The button "High-contrast reader mode" (`aria-pressed`) switches to white on black plain text with no scanlines, bloom, glitch or animation. The choice is stored in `localStorage`.
- **Contrast.** Dim green text (`#22b022`) on near-black passes WCAG AA for normal text.
- **Keyboard.** A skip link jumps to the command input. Focus rings are visible. The transcript can take focus for scrolling.
- **Landmarks and headings.** `header`, `main`, `aside`, one `h1`, `h2` per pane, `lang="en"`.

## Measured score

Lighthouse 13.6.0, accessibility category only, headless Chromium (Playwright build 1255), page served by `npm run web`:

| Page | Accessibility score |
|---|---|
| `http://127.0.0.1:<port>/` (default look) | **100** (threshold: 95) |

To repeat: `npm run exhume -- fixtures/vulnerable-npm --feeds fixtures/vulnerable-npm/feeds --offline`, `npm run web`, then run Lighthouse against the printed address. Lighthouse and Playwright were used as dev-time tools and are not project dependencies.

## Not yet measured

The recorded Lighthouse score of 100 covers the default look only. Reader mode and a page with Possessed limbs (orange `#ff6a3d`, animated) have not been run. Run Lighthouse on both and add the scores here.

## The 3D bench (Epic B1)

`web/theatre.js` mounts a Three.js scene only when WebGL2 is available, `prefers-reduced-motion` is not `reduce`, reader mode (`crypt.hc` / `body.hc`) is off, and the URL has no `?theatre=off`. In every other case it does nothing and the 2D page above is what loads, with no request for three.js. Turning reader mode on while the bench is showing removes the bench. A visible "Plain page" link (`?theatre=off`) is always present on the bench.

### Limits of the 3D bench, stated honestly

- The canvas is `aria-hidden`. Screen readers and keyboard users use the same DOM as the 2D page (transcript log, `#cmd` input, event log, plate summary, announcer). These stay in the page, visually clipped while the bench shows.
- Typing reaches the real `#cmd` input, so the browser's own text input handles it. The focus ring on that input is not visible in 3D. The canvas draws its own cursor instead.
- Text on the CRT and the wall plate is small, curved, scanlined and blurred by the bloom pass. Low-vision users should use reader mode or the Plain page link. Pinch or browser zoom scales the 3D scene, not the text.
- Plate states on the wall use a glyph and a word as well as color (`#` POSSESSED, `%` ROTTING, `+` HEALED, `.` HEALTHY legend).
- The scene has a mouse parallax of a few percent. It has no autoplay audio. The lamp and CRT flicker are small, but anyone sensitive to flicker gets the 2D page with the reduced-motion setting.

### The bench drawer (A3 inside the theatre)

The CRT plays the preloaded demo creature by default, exactly as the 2D page does (`?creature=<slug>` still selects a gallery creature). The two A3 actions have visible controls in a "Bench drawer" (`web/theatre/drawer.js`): a toggle button with `aria-expanded`, then "Download the playable report" and "Exhume a public repo", which takes a GitHub address and opens that creature when it is in the gallery. Escape closes the drawer and returns focus to the toggle. The controls forward to the same elements `web/app.js` wires for the 2D page, so behaviour is identical. A wooden drawer on the bench slides out while the drawer is open. The 2D fallback keeps the download button, dry-run payload panel, gallery list and address lookup in the page unchanged. The original page controls are still in the DOM while the bench shows (visually clipped, as above).

### Measured (B1)

Measured with Playwright and Chromium 159, 1280x720, page from `npm run web`.

| Check | Result |
|---|---|
| First-load weight, 3D path (all responses, uncompressed) | 861,672 bytes (about 0.82 MiB), of which `three.module.min.js` is 687,458. Budget: 5 MB |
| First-load weight, 2D path (`?theatre=off` or reduced motion) | 158,689 bytes, and no request for three.js |
| Frame rate | 25 to 27 fps in headless Chromium with software WebGL (SwiftShader, no GPU). This is a floor, not a laptop number. The 60 fps goal on a mid laptop with a GPU has NOT been measured |
| Accessibility on the 2D fallback (`?theatre=off`) | axe-core 4.x: 0 violations, 37 rules passed |

Lighthouse could not launch Chrome in the sandbox used for B1, so no new Lighthouse number is claimed. The axe-core result above approximates its accessibility audit (Lighthouse uses axe-core internally). The earlier Lighthouse score of 100 was for the same 2D page, which B1 leaves unchanged apart from one extra script tag and CSS rules scoped to `body.theatre`. Re-run Lighthouse against `/?theatre=off` on a machine with Chrome to confirm.

## B5 polish: title card, dolly-in, recording mode

Re-measured on the B5 branch with Playwright and Chromium, 1280x720, page from `PORT=8099 npm run web`.

| Check | Result |
|---|---|
| Accessibility on the 2D fallback (`?theatre=off`), axe-core 4.x in Playwright | 0 violations, 38 rules passed |
| Lighthouse | Not run. Lighthouse cannot launch Chrome in this sandbox. axe-core is the engine Lighthouse uses for this category, so it is the closest available measure. The recorded Lighthouse 100 on the default page is from an earlier machine. Re-run Lighthouse on `/?theatre=off` with a local Chrome before submission |
| First-load weight, 3D path | 762,257 bytes (about 0.73 MiB). Budget: 5 MB |
| First-load weight, 2D path | 143,458 bytes, no three.js request |
| Frame rate | 26 fps in headless Chromium with software WebGL (SwiftShader). Earlier runs gave 25 to 28 fps. This is a floor for a machine with no GPU. 60 fps on a laptop with a GPU has NOT been measured |

Rules for the new pieces:

- **Title card** (`CRYPT — Don't abandon your creature.`): 3D path only, 3 seconds, `aria-hidden`. Any key or click skips it. It never appears on the 2D page or under `prefers-reduced-motion`, and reduced motion already selects the 2D page.
- **Dolly-in**: the camera moves toward the CRT at the first key pressed in the command input. It is instant under reduced motion (which never mounts the bench in the first place).
- **Recording mode** (`?record=1` or the "Recording mode" button): hides the header, event log, plain-page link, sound toggle and the raid and simulated CI buttons. The CRT and the plate stay. Escape leaves it. The toggle button stays in the tab order and shows when it has focus, so keyboard users can leave without knowing the shortcut. The game input keeps working. Recording mode is for screen capture, not for everyday use, because it removes the event log and its announcements from view (the announcer region still speaks).

## Round 1 playtest fixes: keyboard order and announcements

Tab order on the 2D page, from the top: "Skip to the game input" (skip link), Sound, Recording mode, "How to play (manual)", High-contrast reader mode, "Copy command", the "Built with Kiro" link, the tutorial buttons (Got it, Skip, Hide for good), then the game input. The game input no longer has `autofocus`. The script focuses it with `preventScroll`, so the title and pitch stay in view. Shift+Tab from the game input walks the same list backwards.

- The high-contrast toggle announces "High-contrast reader mode on" and "High-contrast reader mode off" through the status region.
- The SEAL badge ("SEALED: no graft will run.") is a status region with an "Unseal" button. Unseal affects this page only.
- The Recording mode button has the accessible name "Recording mode: hide the page controls for screen capture".
- A simulated heal adds "SIMULATED: jquery healed" to the event log and announces it. A simulated red result adds "SIMULATED: jquery stays ROTTING, CI was red".
- `tests/page-above-fold.test.ts` and `tests/web-glue.test.ts` check the order and the announcements. axe-core was not re-run for this round. Re-run it on `/?theatre=off` before the demo.

