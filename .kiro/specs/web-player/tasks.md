# Tasks: web-player

- [x] 1. Spec: requirements, design, tasks (this folder)
- [x] 2. `src/web/output-hook.ts`: pure `createOutputHook` with `feed`, `input`, `flush`, absolute line numbers (W2, W4)
- [x] 3. `tests/output-hook.test.ts`: chunk splitting, split marker, CRLF, input echo, input never triggers, property tests for arbitrary input and output (W2, W4.4, W9.1)
- [x] 4. Vendor `web/vendor/zvm.min.js` from `ifvms` 1.1.6; write `web/glk-shim.js` that sends game text to `hook.feed` and typed lines to `hook.input` only (W1, W2, W4.1)
- [x] 5. `web/index.html`, `web/app.js`, event log panel (W1, W3)
- [x] 6. `web/style.css`: phosphor green, monospace, CSS scanlines (W5)
- [x] 7. `tsconfig.web.json` and `scripts/web.ts`: build game, copy story file, compile hook, serve `web/` on 127.0.0.1 (W6, W7)
- [x] 8. `package.json` `web` script; `.gitignore` for `web/game/` and compiled `web/js/` (W7)
- [x] 9. Manual check: `GRAFT ARM` logs `[[CRYPT GRAFT ARM]]`; typing the marker logs nothing; no requests beyond own files (W3, W4, W6)
- [x] 10. `docs/ATTRIBUTION.md` (replace the interpreter TODO row), `docs/KIRO.md`, README deploy section (W8, W9)
