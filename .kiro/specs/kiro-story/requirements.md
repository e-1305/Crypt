# Requirements: kiro-story

Goal: a judge understands in under a minute how Kiro made CRYPT safe, from `docs/KIRO.md`. Issue #79. Follows `.kiro/steering/blameless.md` and `failsafe.md`.

## S1 Architecture diagram
1. `docs/img/architecture.svg` SHALL be hand-authored and show the flow: Z-machine game, transcript markers, watcher (grammar and `limbs.json`), Necromancer (PR only), CI, Inquisitor, human merge, reraise.
2. It SHALL overlay four Kiro features: steering (the constitution), hooks (the guards, with their real trigger), specs and property tests (the proof), MCP (the door other agents use).
3. It SHALL be readable at 800 px wide, work on light and dark backgrounds, and carry `viewBox`, `<title>` and `<desc>`.

## S2 Timeline
1. `npm run kiro:timeline` SHALL generate `docs/img/kiro-timeline.svg` from `git log` and `.kiro/specs`, with no hand-typed date.
2. The start SHALL be the earliest spec commit, the end the date of HEAD (not the wall clock), so a second run changes nothing.
3. `--check` SHALL exit 1 when the file is stale.

## S3 Page
1. The top of `docs/KIRO.md`, from the title to the end of `## Limits`, SHALL hold at most 350 words outside the generated table.
2. Order: one-sentence story, diagram, five bullets (specs, steering, hooks, MCP, property tests) each with an example and a link, numbers block, timeline, Limits.
3. Every honest limit stays.

## S4 Image safety
Both SVGs SHALL contain no script, no external font, `@import` or external `href`. A test checks this.
