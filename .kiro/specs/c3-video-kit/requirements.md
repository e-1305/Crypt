# Requirements: c3-video-kit

Goal: a 3:00 video kit for the Devpost submission (issue #67, EPIC C, C3). Touches only `docs/VIDEO.md`, `assets/video/` and this spec, so the five C issues can run in parallel. Follows `.kiro/steering/` (failsafe, blameless, product, tech, sla-policy).

1. `docs/VIDEO.md` SHALL hold a storyboard whose shot durations sum to at most 3:00 and whose order matches `docs/DEMO.md`: cold open (GRAFT on the CRT, then a real PR merged on GitHub), Census numbers, live raid, failsafe sabotage beat (CI red, "The graft was rejected"), `SEAL CRYPT`, under the hood (Kiro specs, hooks, steering, MCP), playable report, and the closing line "Own it. Without shame. Without losing control. Don't abandon your creature."
2. Each shot SHALL list duration, on-screen content, exact command or keys, a narration line spoken by the human (not an AI voice) and caption text.
3. Every number SHALL cite the file or command that produces it. No claim the repo cannot prove. In particular: no hook has fired inside a Kiro session (docs/DEMO.md), CRYPT never merges, and a graft on screen carries the dry-run or SIMULATED CI label.
4. `assets/video/*.png` SHALL be 1280x720 stills made with the site's recording mode (`?record=1`) or cards that reuse the site's CSS. `assets/video/captions.srt` SHALL match the storyboard timings and caption text.
5. Audio: original or CC0 only. No copyrighted music.
6. No token or secret appears in any file. Footage that needs a real token is recorded on the day, not committed.

# Design

Stills come from the built site (`npm run build:site`) driven by headless Chromium (playwright-core, software WebGL), the same way `scripts/ci/visual-qa.mjs` does. The capture script is a throwaway and is not committed (only the named files may change). Cards (title, census, raid output, rejection, Kiro, closing) load the site with `?record=1&theatre=off` and replace the body, so fonts and colours match.

# Tasks

- [x] Spec
- [x] Stills 01 to 11
- [x] `captions.srt`
- [x] `docs/VIDEO.md`
- [x] `npm run typecheck` and `npx vitest run`
