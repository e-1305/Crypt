# Design: judge-mode

`web/judge-mode.js` has two layers.

**Pure, Node-testable (no DOM at import):** `buildTimeline()` (six steps, 0 to 45000 ms), `stepAt`, `typingDelays(text)` (deterministic human cadence, 90 to 230 ms per key, longer after a space), `buildSchedule()` (sorted list of `{atMs, kind}` actions: title, exhume lines, plate draw, typed characters, submit, simulated CI click, handover), `exhumeCounts(limbs)`, `skipDecision(event, running)`, `autoplayDecision({played, reducedMotion, highContrast, automated, flag, creatureParam})`, `readPlayed` and `markPlayed` (storage in try/catch).

**DOM runner (`initJudgeMode()`, run on import only when `document` exists):** creates the overlay (`#judge-stage`: title card, caption, counter) and the replay link, un-hides the Skip button from `index.html`, and runs the schedule with drift-corrected timers. It drives the page through its public elements: appends lines to `#transcript`, sets `#cmd` and calls `#input-form.requestSubmit()` (the real game answers), clicks `#sim-green` (heal.js runs the labelled simulation and the heal effect), and adds CSS classes for the plate draw and the payload slide. Skip clears timers, empties `#cmd`, removes the overlay, focuses `#cmd` and shows the replay link.

Title text is a copy of `TITLE_CARD_TEXT` in `src/theatre/polish.ts`; a test keeps them equal.

Styles in `web/style.css` under a `judge-mode` block: overlay, caption, skip, replay, `.judge-draw` (stepped clip-path reveal, line count in `--judge-lines`), `.judge-slide`. Animations are off under `prefers-reduced-motion`. `body.record` hides skip and replay.
