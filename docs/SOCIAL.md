# Social kit

Three build-in-public posts. Each has a LinkedIn version and an X version (280 characters or fewer, links included). Attach the named image from `docs/img/`. Every number comes from `docs/census/RESULTS.md` (`npm run census`).

## Post 1: the census

Image: `docs/img/bench-3d.png`

**LinkedIn**

#KiroweenHackathon26

I scanned the lockfiles of 20 popular open-source projects with CRYPT.

11,244 dependencies. 248 had a known vulnerability. Our noise filter (CISA KEV plus EPSS) set 236 of those aside, and 3 were left to fix first. None were actively exploited.

The number that stuck with me: 84.7% of dependencies had no CODEOWNERS owner, and 16 of the 20 repos had no CODEOWNERS file at all.

Caveats: lockfile only, no reachability analysis, 20 projects is not a random sample. Aggregates only, no project is named.

Method and numbers: docs/census/RESULTS.md. Demo: https://e-1305.github.io/Crypt/

**X**

#KiroweenHackathon26 I scanned 20 popular open-source repos. 11,244 dependencies, 248 known vulns, 3 worth fixing first. The odd part: 84.7% of dependencies have no CODEOWNERS owner. Lockfile scan only, no reachability. https://e-1305.github.io/Crypt/

## Post 2: the bridge bug

Image: `docs/img/visual-qa-1440x900.png`

**LinkedIn**

#KiroweenHackathon26

A bug from building CRYPT, a game that opens fix PRs.

The first bridge between the game and the agents watched the transcript for lines starting with "> ". A driver script can write those lines too, so the watcher could act on input the game never accepted.

Bridge v2 flips it. The game prints a [[CRYPT ...]] marker only after it accepts an action, and the watcher reacts to markers alone. I changed the spec first (.kiro/specs/bridge-v2), then the code.

Same lesson as the rest of the project: act on what the system confirmed, not on what someone typed.

https://e-1305.github.io/Crypt/

**X**

#KiroweenHackathon26 Bug in my game-to-agent bridge: the watcher acted on any "> " line in the transcript, including ones a script wrote. Fix: the game prints a marker only when it accepts an action, and the watcher reads markers only. https://e-1305.github.io/Crypt/

## Post 3: the font bug

Image: `docs/img/visual-qa-390x844.png`

**LinkedIn**

#KiroweenHackathon26

The smallest bug in CRYPT took a while to see.

The 3D scene draws labels onto canvas textures. They were drawn before JetBrains Mono finished loading, so they used a fallback proportional font.

The fix: self-host the font, wait for it before any canvas draw, and add a check in CI that the text is monospace. The screenshot is the phone-size view from that check.

Small things get a test too.

https://e-1305.github.io/Crypt/

**X**

#KiroweenHackathon26 My 3D labels drew before the monospace font loaded, so they fell back to a proportional font. Fix: self-host the font, await it before canvas draws, assert monospace in CI. https://e-1305.github.io/Crypt/
