# Design: d5-autopsy-gazette

## Layers
**Pure (`src/report/`, `src/gazette/`):** no file, clock or network access. The clock arrives as `now` (ms) in the input.
- `src/report/model.ts`: `buildAutopsy({creature, state, history, now, last})` returns an `AutopsyModel`. It reads unknown JSON through tolerant helpers (`rec`, `num`, `str`) and wraps the whole build in try/catch, so junk gives an all-`n/a` model.
- `src/report/html.ts`: `renderAutopsyHtml(model)` builds the page from the model. Every value goes through `esc()`. `src/report/template.ts` holds the CSS and the footnote text.
- `src/report/sample.ts`: `SAMPLE_INPUT`, a deterministic crypt-demo-like input with a fixed `now`.

**Glue (`scripts/cli/autopsy.ts`):** reads `out/creature.json` and `out/state.json` through `nodeIo`, takes `now` from the real clock, writes the HTML, prints the path and the PDF hint. A missing creature file raises a `CliError`.

## Metrics
- Finding limbs: `state !== "Healthy"` or healed. Healed: `limb.healed === true` or state entry `healed`.
- Implementation: finding limbs whose `owner` is a non-empty string other than `unowned`, over all finding limbs.
- Efficiency: for each healed limb, `fixAt - foundAt` in hours (`foundAt ?? scanStart`, `mergedAt ?? updatedAt`). Negative or unparsable values are dropped. The median of the rest, `n/a` when none.
- Impact: healed limbs with `wasKev ?? entry.kev ?? limb.kev` true or `epss >= 0.1`, summed EPSS.
- SLA: window 48 h for Possessed or KEV, 14 d for EPSS >= 0.1. Healed limbs count as met when fixed inside the window. Open limbs count as met while inside the window, breached after it, at risk from 75% of it. Healed limbs with no usable time are left out of scope.
- Trend: `history` entries need finite non-negative numbers and a parsable `at`. Sorted by time, last N kept. The series is open limbs (possessed + rotting).
- Noise exorcised: `counts.exorcised / counts.findings`.

## Page
One column, A4. Header, a grid of six metric cards (the three NIST measures, SLA, trend, noise), a praise list ("healed by"), a limb list for breached and at-risk, and a footer with "How computed" notes numbered to the cards. Dark CRT palette on screen (`#050805`, `#33ff33`, `#22b022`, `#ffb000`, as in `web/style.css`). `@media print` switches to white with dark green text.
