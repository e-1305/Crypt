# Devpost entry notes

Tagline: the first vulnerability report you can play. Live demo: [e-1305.github.io/Crypt](https://e-1305.github.io/Crypt/). Source: [github.com/e-1305/Crypt](https://github.com/e-1305/Crypt). Pitch text: [PITCH.md](PITCH.md). Video script: [DEMO.md](DEMO.md).

## Inspiration

Every app is a Frankenstein of strangers' code. Scanners print a list that nobody reads. We wanted the list to be something you play, with a safety story a security team can accept.

## What it does

CRYPT turns a lockfile into a creature: one limb per dependency, rotting if vulnerable, possessed if CISA KEV lists it. You play a Z-machine text adventure and type `GRAFT JQUERY`. CRYPT writes the fix as a pull request. By default that is a dry run: a payload file, nothing sent. `SEAL CRYPT` blocks every graft. A person lands every pull request.

Open the page and type `GRAFT JQUERY`. The page is a rehearsal and sends nothing. The CLI is the only part that can open a real pull request.

## How we built it with Kiro

Specs first (13 folders in `.kiro/specs/`), five steering files that bind every change, five save hooks, and two custom agents, the Necromancer and the Inquisitor. See [KIRO.md](KIRO.md) for the evidence and the limits.

## Challenges

- A game must not be able to trick the watcher. Only markers the story prints count; typed text never does.
- Keeping the 3D bench optional. WebGL2 failure, reduced motion and high contrast all land on a full 2D page.
- Not verified: no real GPU run, no audio test, no live Lighthouse score. axe-core on the 2D page was run in a headless browser (see [ACCESSIBILITY.md](ACCESSIBILITY.md)).

## What we learned

Putting safety rules in steering files and tests made them cheap to keep. A judge persona and a product manager persona, run in a loop over the live page, found problems that unit tests did not (the prompt sat 1500 px down the page).

## What is next

- Publish `@e-1305/crypt` to npm (not published yet).
- Re-check on real hardware: GPU frame rate, sound, Lighthouse.
- Beyond Tier 1: only npm and pip lockfiles are supported today.

## Built with

TypeScript, Node 20, Inform 6, dfrotz, ZVM (browser Z-machine), three.js, OSV, CISA KEV, FIRST EPSS, Kiro, vitest and fast-check.
