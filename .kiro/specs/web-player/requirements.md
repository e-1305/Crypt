# Requirements: web-player

Goal: play `spike.z5` in a browser and show the markers the game prints, live, using the same reader as the bridge. Tier 1, block 2 (issue #6). Follows `.kiro/steering/failsafe.md`. Builds on `bridge-v2` (issue #3 follow-up).

Terms as in bridge-v2. **Interpreter** is the JavaScript Z-machine that runs the story file. **Output hook** is the pure module that turns interpreter text into complete lines and feeds them to `parseGameOutput`. **Event log** is the side panel that lists the `GameEvent` values the hook produced.

## W1 Play the game in the browser
1. The page `web/index.html` SHALL load the story file `game/spike.z5` and let the player type commands and read the game's replies.
2. The page SHALL be static files only: HTML, CSS, JavaScript and the story file. It SHALL need no server code.

## W2 Every output line goes through parseGameOutput
1. Every line of text the interpreter prints SHALL be passed to `parseGameOutput` from `src/bridge/parse-output.ts`. The page SHALL NOT have a second marker reader.
2. The output hook SHALL join interpreter text chunks into complete lines before parsing, so a marker split across chunks is still found and a partial line is never parsed.
3. The output hook SHALL be a pure module with no DOM, fs, clock, network or process access, so it runs under vitest in Node.

## W3 Event log panel
1. WHEN `parseGameOutput` returns an event, the page SHALL show it in the event log, in order.
2. An `ok: true` event SHALL show the command (for example `GRAFT ARM`). An `ok: false` event SHALL show the reason.
3. WHEN the player types `GRAFT ARM` and the game accepts it, the event log SHALL show `[[CRYPT GRAFT ARM]]` as detected.
4. The event log SHALL record events only. It SHALL start no agent, write no request file and call no GitHub endpoint (W6).

## W4 Input echo never triggers
1. Text the player types SHALL reach the output hook only as a line prefixed with `> `, or not at all. It SHALL never reach the hook as game output.
2. WHEN the player types `[[CRYPT GRAFT ARM]]` as a command, the event log SHALL show nothing for that line.
3. Newline and carriage return characters in typed input SHALL be removed before it is echoed, so one typed command can never become several lines.
4. A property test SHALL show, for any generated input string and any generated interpreter output, that no event is produced from an input line (same guarantee as bridge-v2 V4).

## W5 CRT look
1. The page SHALL use phosphor green text on a black background and a monospace font.
2. The page SHALL draw scanlines with CSS only (no canvas, no image files).
3. The look SHALL stay minimal: no animation that hides text, and text SHALL stay readable.

## W6 No network, no agent dispatch
1. At runtime the page SHALL make no network request except loading its own static files, including `game/spike.z5`.
2. The page SHALL load no script, font or style from another origin. The interpreter is vendored or bundled (see ATTRIBUTION).
3. The event log is display only. Dispatching an agent from an event belongs to a later block.
4. Failsafe 2 stays true: the code SHALL contain no merge call.

## W7 npm run web
1. `npm run web` SHALL build the story file if needed, place it where the page loads it, and serve `web/` on localhost.
2. The server SHALL bind to `127.0.0.1` only.
3. IF the story file cannot be built, THEN the command SHALL exit non-zero and say which step failed.

## W8 Static deploy docs
1. The README or `docs/KIRO.md` SHALL describe how to deploy `web/` as static files: which files to copy, how to build the story file, and that no server code is needed.

## W9 Tests and attribution
1. The output hook SHALL have unit and property tests that run in Node. CI SHALL NOT need a browser.
2. The chosen interpreter and its license SHALL be recorded in `docs/ATTRIBUTION.md`, replacing the "Web Z-machine interpreter" TODO row.
3. `docs/KIRO.md` SHALL be updated.

## Limitations

| # | Limitation | Handling |
|---|---|---|
| L1 | A game message that echoes player text on its own line could forge a marker (bridge-v2 L2). | Unchanged. `spike.inf` prints markers only from accepted-action routines, and the grammar gate applies. |
| L2 | The browser path is checked by Node tests of the hook and by a manual run, not by an automated browser test in CI. | The hook is the only logic in the path. A headless-browser check is optional, outside CI. |
| L3 | The event log is not stored. A page reload clears it. | Persistence belongs to the dispatch block. |
