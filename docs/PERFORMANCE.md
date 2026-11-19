# Performance budgets

Issue #232. CI runs `node scripts/ci/budget.mjs` after `npm run build:site` (visual-qa job). It fails when a budget below is exceeded.

## JS shipped on first load

First load is `_site/index.html`: its `<script>` tags plus their static imports. Dynamic `import()` is excluded.
three.js (`vendor/three.module.min.js`, 671 KB) and the 3D theatre (`theatre/stage.js`) are loaded by `web/theatre.js` only when the 3D view is opened. The script fails if either appears in the first-load set.

| Measure | Before (today) | Budget (today + 10%) |
| --- | --- | --- |
| First-load JS (raw bytes, 68 files) | 284.5 KB (291329 B) | 313.0 KB (320500 B) |
| Fonts, JetBrains Mono latin subset, woff2 (2 files) | 42.1 KB (43076 B) | 46.3 KB (47400 B), each <= 23.5 KB (24100 B) |

After: unchanged. This PR adds the budget and does not change shipped code, so the "after" numbers equal "before". Update the constants in `scripts/ci/budget.mjs` and this table together when a PR intentionally changes them.

## Time to interactive

Not measured. No browser was available when this was written. To measure, run it on the visual-qa machine and record it here.

## Memory with 300 limbs

Not measured. No browser was available when this was written.

## Runtime caps and network

Placeholder. Sibling PRs add:

- Limb and draw caps for the 3D theatre, plus a frame-time guard.
- Network backoff for the OSV and GitHub clients.
