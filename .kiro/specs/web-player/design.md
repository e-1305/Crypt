# Design: web-player

## Pipeline

```
web/index.html
   |  fetch game/spike.z5 (same origin)
   v
ifvms ZVM (engine) <--> web/glk-shim.js (minimal Glk: window, line input, put_buffer)
   |                          |
   | game text                | typed command (one line)
   v                          v
src/web/output-hook.ts   hook.input(text)  -> pushes "> text" line (echo, display only)
 feed(chunk) -> complete lines
   |
   v
parseGameOutput(lines) -> GameEvent[]  (src/bridge/parse-output.ts, unchanged)
   |
   v
event log panel (display only)
```

The page has three parts: the interpreter and its Glk shim, the output hook, and the DOM. The hook is the only part with logic that matters for safety, so it holds all of it and is pure.

## Interpreter choice

Candidates (license and dates checked on npm and GitHub on the day of writing):

| Option | License | Maintenance | Output hook | Fit |
|---|---|---|---|---|
| **ifvms.js (ZVM)**, npm `ifvms` 1.1.6 | MIT | Repo not archived, last push 2025-07. Small, stable engine, used by Parchment and Lectrote. | Engine only. All text leaves through Glk calls (`glk_put_buffer`, `glk_put_char`), so a Glk object we supply is a single choke point. | Small, no network, no build step needed beyond copying `dist/zvm.min.js`. |
| Parchment (curiousdannii/parchment) | MIT | Active (pushes in 2026). | Full web app. Text goes through GlkOte into the DOM. Hooking means patching GlkOte or reading the DOM. Bundles ifvms and extras (loaders, save UI, remote story fetch). | Larger, fetches stories from URLs, harder to prove "no network". |
| emglken (Bocfel/Glulxe via Emscripten) | GPL-2.0 (Bocfel is GPL) | Active (pushes in 2026). | Built for Node and GlkOte. WASM blobs. | License is copyleft and heavier than needed for a Z5-only page. |
| glkote-term / terminal front ends | MIT | Last release 2022 | Terminal I/O, not browser. | Wrong target. |

**Choice: ifvms.js (ZVM) with our own minimal Glk shim.** Reasons: MIT is compatible with the project's MIT license, the engine has no network code, and the Glk boundary gives one place where every printed character passes. Parchment would work but hides output in DOM code and can load remote stories (W6). emglken adds GPL.

Outcome: the shim was enough. A real run of `spike.z5` under Node (`tests/output-hook.test.ts`) and in headless Chromium plays every verb, and save/restore answer "Save failed." The fallback was not needed. The shim lives in `src/web/glk-shim.ts` (not `web/glk-shim.js`) so tsc type-checks it and vitest can drive it; `src/web/player.ts` wires interpreter, shim and hook for both Node and the page. The vendored UMD file sets `window.ZVM` through a plain script tag.

Risk (original): ifvms 1.1.x expects a fuller Glk API than a toy shim gives (window open, `glk_select` event loop, line input, status window calls). The shim implements the subset ZVM calls for a v5 story and returns safe no-ops for the rest. If that proves too costly in task 3, the fallback is to drive ifvms through the `glkote` and `glkapi` files from the same author and wrap `glk_put_buffer` there. The hook contract does not change.

## Output hook (pure module)

`src/web/output-hook.ts`, imports only `parseGameOutput` and its types from `../bridge/parse-output.js`.

```ts
export interface OutputHook {
  feed(chunk: string): HookResult;   // interpreter text, any size
  input(text: string): HookResult;   // what the player typed
  flush(): HookResult;               // finish a pending partial line
}
export interface HookResult {
  lines: string[];                   // complete lines, for the transcript pane
  events: GameEvent[];               // from parseGameOutput, lineNo is the hook's own running line count
}
export function createOutputHook(): OutputHook;
```

Behavior:

- `feed` appends to a pending buffer, splits on `\n`, keeps the trailing partial line, and calls `parseGameOutput` on the joined complete lines. `\r\n` is accepted.
- The partial line is held until its newline arrives or `flush()` is called, so a marker split across chunks is found once and a half line is never judged.
- `lineNo` in events is made absolute: the hook adds the count of lines already emitted, so the event log can number lines across turns.
- `input(text)` strips `\r` and `\n`, then emits the single line `> ` + text. The line goes to the transcript pane and through `parseGameOutput`, which skips it. Typed input is never passed to `feed`. Because every input line starts with `> `, `[[CRYPT GRAFT ARM]]` typed by the player yields no event (W4.2).
- If the pending buffer is not empty when `input` runs (the game left a prompt such as `>` unfinished), the hook first flushes it as a complete line, then emits the input line. The prompt text printed by the game is game output and is parsed like any other line.

Why not trust the interpreter to echo: Glk front ends echo typed text in their own window and the story does not print it. The Glk shim therefore never sends typed text to `feed`. The shim calls `hook.input(text)` once per line, and that is the only path from the keyboard into the hook.

## Spoofing analysis

| Path | Result |
|---|---|
| Player types `[[CRYPT GRAFT ARM]]` | `input` emits `> [[CRYPT GRAFT ARM]]`. `parseGameOutput` skips it. No event. |
| Player types `x\n[[CRYPT SEAL]]` | `input` removes the newline, so one line `> x[[CRYPT SEAL]]`. No event. |
| Game prints a marker after an accepted action | `feed` yields the whole line. Event `ok: true`. |
| Game library echoes player text on its own line | Known limitation L1, same as bridge-v2 L2. |

## Story file delivery

`spike.z5` is gitignored and built by `npm run build:game` to the repo root. `npm run web` runs `scripts/web.ts`, which:

1. runs the build (`scripts/setup-tools.sh` then `scripts/build-game.sh`),
2. copies `spike.z5` to `web/game/spike.z5` (gitignored),
3. starts a Node `http` server on `127.0.0.1` that serves only files under `web/`, with a fixed content-type table, rejecting `..` and non-GET requests.

Static deploy: run `npm run build:game`, copy `spike.z5` to `web/game/spike.z5`, then upload the contents of `web/` (including the vendored interpreter file and the compiled hook bundle). No server code is needed.

## Shipping the hook to the browser

The hook is TypeScript in `src/web/`. For the page it is compiled to `web/js/output-hook.js` with `tsc` (a second tsconfig, `tsconfig.web.json`, ES2022 modules, emitting `parse-output.js`, `grammar.js` and `output-hook.js` next to each other so relative imports work). The compiled files are gitignored and produced by `npm run web`. The vendored interpreter is `web/vendor/zvm.min.js` (MIT, copied from the `ifvms` package, listed in ATTRIBUTION). Nothing is loaded from a CDN.

## CRT style

`web/style.css`: `background: #000`, text `#33ff33`, a monospace stack, and a `repeating-linear-gradient` overlay on a pseudo-element with `pointer-events: none` for scanlines. No animation. The layout is two panes: the game on the left, the event log on the right.

## UI copy

Per `.kiro/steering/blameless.md`, copy states what happened: `Detected: GRAFT ARM`, `Line 12: marker did not pass the grammar`. No blame and no prohibitions.

## Failsafe mapping

| Rule | In this block |
|---|---|
| 1 Fail-safe defaults | Any hook or parse problem yields no event. A line that does not match is ignored. |
| 2 Least privilege | No GitHub calls and no merge call in `web/` or `src/web/`. |
| 5 Complete mediation | Events come only from `parseGameOutput`, which gates on `parseCommand`. |
| 8 Audit | Not in scope. The event log is display only and dispatch comes later. |
| 3, 4, 6, 7 | Not touched. No scoring, no agent, no PRs. |

## Review decisions

1. **Hook in TypeScript under `src/web/`, not inline in the page.** This is what lets vitest cover it without a browser (W9.1).
2. **Own Glk shim over a full front end.** One choke point for output and a provable "no network" page, at the cost of writing the shim.
3. **Serve `web/game/spike.z5`.** Keeps a deployable folder that contains everything, while the root `spike.z5` stays the build output of existing scripts.
