# Requirements: judge-mode

Goal: judges do not type into text adventures. On first load the page plays a 45-second self-running demo on the `crypt-demo` creature, then hands over: "Your turn. Type EXAMINE JQUERY." (issue #86). Follows `.kiro/steering/failsafe.md`, `blameless.md`, `product.md` and `sla-policy.md`. Builds on `first-60-seconds`, `web-player` and `c3-video-kit` (title card, recording mode). Feature freeze (Nov 25): judge mode is in scope.

Scope: `web/judge-mode.js` (new), one script tag and one button in `web/index.html`, judge-mode rules in `web/style.css`, tests. No other web file changes.

## J1 Sequence
The demo SHALL use the real game and real page components. No video file.
1. 0 to 5 s: title card "CRYPT — Don't abandon your creature." (the B5 text).
2. 5 to 12 s: `crypt exhume` lines appear on the CRT transcript. The plate draws limb by limb. A counter reads "5 findings → 2 monsters", computed from `game/demo.json`.
3. 12 to 22 s: `EXAMINE JQUERY` is typed into the command box at a human cadence and submitted. The game answers.
4. 22 to 32 s: `GRAFT JQUERY` is typed and submitted. The dry-run payload panel slides in (jquery 3.4.1 to 3.5.0, owner @e-1305, "a human merges").
5. 32 to 40 s: the page's own Simulated CI (green) runs. The caption says **simulated**. The limb heals on the plate with the heal effect.
6. 40 to 45 s: caption "Real PRs, real CI, a human always merges. Your turn." The command box gets focus.

## J2 Control
1. The Skip button SHALL be visible from second 0. Any keypress (not a lone modifier), any click and `Esc` SHALL skip. Skipping hands over at once and leaves the page usable.
2. The demo SHALL play once per browser. The flag lives in localStorage inside try/catch. When storage throws, the demo plays (never blocks) and nothing is remembered.
3. After the demo (played or skipped), and whenever it did not autoplay, a "Replay the 45-second demo" link SHALL be shown. It reloads the page with `?judge=1`.
4. `?judge=0` disables autoplay. Automated browsers (`navigator.webdriver`) do not autoplay unless `?judge=1`, so the visual-qa CI sees the normal page.
5. `prefers-reduced-motion` and high-contrast mode (`body.hc` or the stored `crypt.hc`): no autoplay, the replay link is shown.
6. Only the demo creature autoplays (no `?creature=` parameter).

## J3 Honesty and safety
1. Anything simulated SHALL say "simulated" on screen. The exhume lines say they are replayed from the committed snapshot.
2. The demo types only EXAMINE and GRAFT, which are dry-run rehearsals. It sends nothing and opens no pull request.
3. Any failure (game not loaded, missing element) ends the demo and hands over. It SHALL NOT throw.

## J4 Display
1. Works on the 3D bench and the 2D fallback (mobile).
2. Recording mode (`body.record`) hides the Skip button and the replay link, so a capture is clean (B-roll for the video).
3. The caption is a polite live region.

## J5 Acceptance
Node tests cover the timeline, the typing cadence, the skip decision, the autoplay and once-per-browser rules. `docs/img/judge-mode.png` is a screenshot at about t=30 s.
