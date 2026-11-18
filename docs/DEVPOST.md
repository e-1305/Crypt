# CRYPT, Devpost entry

Tagline (149 chars, limit 200): The first vulnerability report you can play. A 1979 text-adventure VM turns your lockfile into a creature and 2026 AI agents heal it by pull request.

## Links
- Repo: https://github.com/e-1305/Crypt
- Live site: https://e-1305.github.io/Crypt/
- Demo repo: https://github.com/e-1305/crypt-demo
- Video: TODO add URL after upload (shot list in [DEMO.md](DEMO.md), pitch in [PITCH.md](PITCH.md))

## Inspiration
Every app is a Frankenstein of strangers' code. Scanners print a list that nobody reads. We wanted the list to be something you play, with a safety story a security team can accept.

## What it does
CRYPT turns a lockfile into a creature: one limb per dependency, rotting if vulnerable, possessed if CISA KEV lists it. You play a Z-machine text adventure and type `GRAFT JQUERY`. CRYPT writes the fix as a pull request. By default that is a dry run: a payload file, nothing sent. `SEAL CRYPT` blocks every graft. A person lands every pull request.

The page is a rehearsal and sends nothing. Only the CLI (`crypt raid <url> --live`) can open a real pull request on [crypt-demo](https://github.com/e-1305/crypt-demo), and a human lands it before `crypt reraise` shows HEALED.

Three pillars, paraphrased. Mary Shelley, *Frankenstein* (1818): every rotting limb gets a named surgeon from CODEOWNERS. Nadya Bartol, TED@BCG (2021): rot belongs to the package, never to a person. Saltzer and Schroeder, "The Protection of Information in Computer Systems" (1975): safe defaults and least privilege, so the Necromancer writes, the Inquisitor verifies, a human merges, at most 5 PRs per raid, one dependency each.

## How we built it with Kiro
Specs first. Counts: <!-- stats:start -->18 specs in `.kiro/specs/`, 5 steering files, 5 hooks, 2 custom agents and 641 tests (passed plus skipped, `npx vitest run`; counted by `npm run kiro:stats`)<!-- stats:end -->. The agents are the Necromancer and the Inquisitor, in `.kiro/agents/`; hooks are in `.kiro/hooks/` and steering in `.kiro/steering/`. A bridge ([bridge-v2](../.kiro/specs/bridge-v2/requirements.md)) watches the game transcript for `[[CRYPT ...]]` markers and drives the agents. See [KIRO.md](KIRO.md). Limits: no hook has fired inside a Kiro session yet (the scripts were run by hand), and we did not measure time saved.

## Challenges
- A game must not be able to trick the watcher. Only markers the story prints count; typed text never does.
- Keeping the 3D bench optional. WebGL2 failure, reduced motion and high contrast all land on a full 2D page.
- Not verified: no real GPU run, no audio test, no live Lighthouse score. axe-core on the 2D page was run in a headless browser (see [ACCESSIBILITY.md](ACCESSIBILITY.md)).

## Accomplishments
- Census ([docs/census/RESULTS.md](census/RESULTS.md), scan 2026-11-17, rerun with `npm run census`): across 20 popular open-source projects, the filter cut 248 findings to 3 monsters. 95.2% were exorcised as noise, 0 were possessed, 84.7% of 11,244 limbs have no CODEOWNERS owner. Limits: lockfile only, no reachability, 20 popular projects, not a random sample.
- Tests: <!-- stats:start -->18 specs in `.kiro/specs/`, 5 steering files, 5 hooks, 2 custom agents and 641 tests (passed plus skipped, `npx vitest run`; counted by `npm run kiro:stats`)<!-- stats:end -->.

## What we learned
Putting safety rules in steering files and tests made them cheap to keep. A judge persona and a product manager persona, run in a loop over the live page ([PLAYTEST_LOG.md](PLAYTEST_LOG.md)), found problems that unit tests did not (the prompt sat 1500 px down the page).

## What is next
- Publish `@e-1305/crypt` to npm (not published yet).
- Re-check on real hardware: GPU frame rate, sound, Lighthouse.
- Beyond Tier 1: only npm and pip lockfiles are supported today.

## Category
Frankenstein. A 1979 Z-machine VM with no network drives 2026 AI agents through a game transcript, and four data sources (OSV, CISA KEV, FIRST EPSS, CODEOWNERS) are stitched into one creature.

## Built with
TypeScript, Node 20, Inform 6, dfrotz, ZVM (browser Z-machine), three.js, OSV, CISA KEV, FIRST EPSS, CODEOWNERS, Kiro, vitest and fast-check.
