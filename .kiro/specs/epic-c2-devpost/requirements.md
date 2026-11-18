# Requirements: epic-c2-devpost

Goal: the final Devpost copy in `docs/DEVPOST.md` (issue #66, EPIC C item C2). Touches only `docs/DEVPOST.md`, this spec and task state. Follows `.kiro/steering/blameless.md`, `failsafe.md`, `product.md` and `tech.md`. Judging criteria: Potential Impact, Technological Implementation (Kiro usage), Design, Innovation, Presentation. Track: Frankenstein.

## C1 Fields
1. `DEVPOST.md` SHALL hold, in this order: a tagline of at most 200 characters, a Links section, then `## Inspiration`, `## What it does`, `## How we built it with Kiro`, `## Challenges`, `## Accomplishments`, `## What we learned`, `## What is next`, `## Category`, `## Built with`.
2. The tagline line SHALL state its character count.
3. Links SHALL hold the repo, the live site, the demo repo and a video placeholder (`TODO add URL after upload`).
4. The file SHALL have at most 60 lines and no em dash (`tests/devpost-docs.test.ts`).

## C2 Honesty
1. Every number SHALL name the file or command that produces it.
2. The file SHALL keep the line `Not verified: no real GPU` and the other limits: no audio test, no live Lighthouse score, `@e-1305/crypt` not published, npm and pip lockfiles only, the web page sends nothing, no Kiro hook has fired inside a Kiro session yet, no measure of time saved.
3. Bonus categories SHALL NOT be claimed unless the repo proves them.

## C3 Content
1. The Census headline SHALL be quoted with its source `docs/census/RESULTS.md` and the limits (lockfile only, no reachability, 20 popular projects, not a random sample).
2. The three pillars SHALL be paraphrased and credited: Shelley (ownership), Bartol (blamelessness), Saltzer and Schroeder 1975 (control).
3. `## Category` SHALL be Frankenstein in 2 sentences: the 1979 network-less Z-machine VM drives 2026 AI agents through a transcript, and four data sources (OSV, CISA KEV, FIRST EPSS, CODEOWNERS) are stitched.

## C4 Blameless copy
1. The copy SHALL attribute rot to packages, never to people, and SHALL NOT contain prohibitions or blame wording.
