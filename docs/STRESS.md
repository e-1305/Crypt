# Stress results (issue #339)

`npm run test:stress` (`node scripts/stress/run.mjs`) loads the built site (`npm run build:site`) in headless Chromium and pushes it through six load and edge-case scenarios. It uses the same static server and `playwright-core` setup as `scripts/ci/visual-qa.mjs`. It writes `out/stress/report.json` and exits 1 when a check fails. It fixes nothing: each failure below has an issue.

CI runs it as the `stress` job in `.github/workflows/ci.yml`. The job has `continue-on-error: true`, so it never blocks a merge, and it uploads `out/stress` as the `stress` artifact. `STRESS_HOLD_MS` shortens the 60 s hold of scenario 1 for a quick local run.

## Environment

Dated snapshot of one run (later runs and `out/stress/report.json` take precedence; the failure table goes stale once #342 or #343 is fixed). Measured on one run in a Linux sandbox: Chromium 159.0.8154.6 headless, Node 22, software WebGL (SwiftShader, no GPU), viewport 1440x900. GPU cost is therefore not in the frame numbers. Treat times as relative (400 limbs against the 7-limb demo in the same browser), not as device figures. Totals: 48 checks, 46 pass, 2 fail.

Reproduced on a second machine (the CTO review sandbox, 2026-11-24): Chrome for Testing 153.0.8010.12 headless, Node 22, SwiftShader, 60 s hold. Same totals (48 checks, 2 fail) and the same two failures with the same counts (4 context warnings; 16, 981 and 3855 transcript lines). Small drift elsewhere: p95 frame cost 0.8 ms against 0.5 ms, heap after 60 s 7.4 MB, 4x startup frame 200.1 ms.

## Failures

| Issue | Scenario | What failed |
| --- | --- | --- |
| [#343](https://github.com/e-1305/Crypt/issues/343) | Gallery | `dispose()` does not release WebGL contexts: 22 created in 20 open/close cycles, 2 collected, 4 "Too many active WebGL contexts" warnings. |
| [#342](https://github.com/e-1305/Crypt/issues/342) | Command line | The transcript grows by about 5 lines per command with no cap: 16 lines at start, 981 after 200 commands, 3855 after 800. |

## Results by scenario

Stated bounds are in the `BOUNDS` object at the top of `scripts/stress/run.mjs`.

### 1. 3D creature with 400 limbs

A synthetic creature of 400 limbs is served in place of `game/demo.json` and opened in the Creature 3D view. The view stays awake for 60 s (the pointer moves once a second).

| Measure | 400 limbs | 7-limb demo |
| --- | --- | --- |
| Median frame interval | 16.7 ms | 16.7 ms |
| p95 frame interval | 16.8 ms | |
| p95 frame callback cost | 0.7 ms | 0.5 ms |
| JS heap before / after 60 s | 2.7 MB / 7.2 MB | |
| Longest main-thread task (mount) | 186 ms | |
| Page and console errors | 0 | |

Caps hold: the canvas label reads "60 limbs shown" and the legend ends with "340 more" (`MAX_LIMBS` = 60 in `src/theatre/caps.ts`). Closing the view removes the canvas. The 4x CPU run (scenario 5) shows the frame guard separately.

### 2. Gallery: 20 creatures in 3D, disposed one by one

Each of the 20 gallery creatures is loaded, opened in Creature 3D and closed. All 20 opened and each close removed the canvas. 60 contexts were created over the 20 loads and none stayed attached. JS heap went from 5.1 MB (first creature) to 4.8 MB (last), a growth of -0.1 MB against the bound of 30 MB.

A second run opens and closes the view 20 times on one page: 22 contexts created, 0 attached, 2 collected after a GC, 5 `webglcontextlost` events, heap growth 5.3 MB (bound 30 MB). Chrome logged 4 "Too many active WebGL contexts" warnings. That check fails: [#343](https://github.com/e-1305/Crypt/issues/343).

### 3. Command line: 200 fast commands

200 commands (EXAMINE, GRAFT, HELP, garbage, a 1 KB line, unicode, right-to-left override, markup, shell syntax) were entered back to back in 3.7 s. No page error, the input stayed enabled and HELP still answered afterwards. Heap: 2.6 MB at start, 5.6 MB after 200, 6.6 MB after 800. The transcript has no cap, so the stated bound of 2000 lines after 800 commands fails with 3855 lines (169 KB of text): [#342](https://github.com/e-1305/Crypt/issues/342). The cost is DOM nodes. Memory stays flat.

### 4. Paste box

| Case | Result |
| --- | --- |
| 7 invalid inputs (not a URL, foreign host, `javascript:`, `..` path, 3000-character owner, unicode, spaces) | Each shows a message, none draws a creature, none makes a network request. |
| Repo that returns 404 | "No package-lock.json found at the root of ... (checked HEAD, main and master)." No creature. |
| 50,000 packages (6.6 MB, over the 20,000 package cap) | "package-lock.json is over the cap (20 MB or 20,000 packages), so nothing was drawn. Nothing is marked healthy." No OSV request. |
| 21.2 MB lockfile (over the 20 MB cap) | "package-lock.json is larger than the 20 MB cap, so nothing was drawn. Nothing is marked healthy." No OSV request. |

No task over 50 ms was recorded in the page for either large lockfile (the freeze bound is 2000 ms). The harness checks its own probe: a deliberate 120 ms busy loop must show up as a long task, so "0 ms" is a real reading. No message claims a clean repo (`claimsClean` in `scripts/stress/lib.mjs`). The caps from `docs/SECURITY-AUDIT.md` item 11 (FIX-13) hold.

### 5. Slow device: CPU throttle 4x

The landing at 1440x900 with `Emulation.setCPUThrottlingRate` 4. Playwright sets `navigator.webdriver`, which turns the frame guard off by design (`shouldRunGuard` in `src/theatre/caps.ts`), so the harness sets it to false for this scenario.

| Throttle | Final `data-theatre` | Median startup frame | Idle animation frames |
| --- | --- | --- | --- |
| 1x | `2d:slow` | 100 ms | 0.0 per second |
| 4x | `2d:slow` | 116.7 ms | 0.0 per second |

At 4x the guard drops the bench to the 2D page, the plate and `#cmd` are present, and idle stays under the budget of 2 frames per second. The 1x reference also falls to 2D here because SwiftShader is slow, so this run cannot show where the guard stops firing on real hardware.

### 6. Offline

| Case | Message | Result |
| --- | --- | --- |
| Network blocked after load | "The KEV and EPSS snapshot did not load, so nothing can be ranked. Reload the page, then try again." | No creature, nothing claims clean, the local game still answers HELP, no page error. |
| Lockfile arrives, OSV blocked | "api.osv.dev did not answer, so no package could be checked. Nothing is marked healthy. Try again in a minute." | No creature, nothing claims clean. |

The browser logs each blocked request as a console error. The harness ignores that line because it is the test itself.

## Run it

```
npm ci
npx playwright-core install --with-deps chromium
npm run build:site
npm run test:stress
```
