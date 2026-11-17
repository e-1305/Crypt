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
