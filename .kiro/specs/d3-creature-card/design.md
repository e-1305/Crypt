# Design: d3-creature-card

```
creature (plateInput data)  --\
variant, includeRepo, stats  ---> src/render/card.ts  layoutCard()  -> { width, height, ops[], alt, shareText, shareUrl }
                                         |   uses layoutPlate() for the figure rows
                                         v
web/card/card.js   paintCard(canvas, layout)  (ops -> canvas 2D, JetBrains Mono via theatre/font.js)
web/card/panel.js  mountCardPanel(root, getModel)  toggle, preview canvas, Download PNG, Copy image, Share on LinkedIn
        ^                                    ^
web/live-exhume.js (paste result)     web/raid.js (end screen)
```

## `src/render/card.ts`

- `CARD_WIDTH = 1200`, `CARD_HEIGHT = 627`, `SITE_URL = "https://e-1305.github.io/Crypt/"`.
- `Op` is `{ t: "rect", x, y, w, h, fill? , stroke? }` or `{ t: "text", x, y, size, bold, color, text }`. Numbers are integers or fixed at one decimal, so the snapshot is stable.
- `layoutCard({ variant, creature, includeRepo, raid? })`: the figure is the 22 rows of `layoutPlate` from the figure start, drawn per segment with the colour of the limb state (state plus the mark glyph, never colour alone). Left: plate. Right column: name, findings line, counts, healed, raid stats, repo (only when included). Footer: logo line and URL.
- `defaultIncludeRepo(source)`: `"paste"` gives true, anything else false.
- `linkedInShareUrl()` and `shareText(variant, counts)`.
- Inputs pass through `plateInput` and `clean`, so owners and logins never enter the layout.

## `web/card/`

`card.js` paints ops. `panel.js` builds the DOM with `textContent` only. Download uses `canvas.toBlob` and an object URL. Copy uses `navigator.clipboard.write([new ClipboardItem({"image/png": blob})])`. LinkedIn uses `window.open(url, "_blank", "noopener")` and copies the text with `clipboard.writeText`.

## Build

`scripts/build-site.ts` copies `web/card` to `_site/card`. `tsconfig.web.json` includes `src/render/card.ts`.

## Visual QA

`scripts/ci/visual-qa.mjs` mocks the lockfile and OSV requests, pastes a repo on the 2D page and checks the card controls for overlap and tap size at all viewports, plus the PNG size from the canvas.
