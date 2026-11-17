# CRYPT
### Don't abandon your creature.

> Every app is a Frankenstein, stitched from strangers' code.
> CRYPT finds the rotting limbs, names a surgeon, and proves the fix.

**Zork that patches your code, and can never break it.**

CRYPT turns your dependency tree into a creature, one limb per package.
Limbs with known vulnerabilities rot. Limbs with actively exploited vulnerabilities (CISA KEV) are *possessed*.
You heal them by playing a real **Z-machine** text adventure (Infocom's 1979 virtual machine).
Each command dispatches AI agents built with [Kiro](https://kiro.dev) that open a fix PR. A limb only heals when CI is green **and a human merges**.

> 🎃 Built for [Kiroween 2026](https://kiroween.devpost.com/), Frankenstein track.

---

## Quickstart

```bash
# coming soon
npx crypt exhume <github-repo-url>
```

## Play in the browser

```bash
npm ci
npm run web        # builds spike.z5 if needed, then serves http://127.0.0.1:8080/
```

Type `GRAFT ARM` and the event log on the right shows `[[CRYPT GRAFT ARM]]` as detected. Text you type never counts as a marker. Set `PORT` to change the port.

### Deploy as static files

No server code is needed.

1. `npm run build:game && npm run build:web`
2. `mkdir -p web/game && cp spike.z5 web/game/spike.z5`
3. Upload the contents of `web/` to any static host: `index.html`, `app.js`, `style.css`, `vendor/` (the interpreter and its licence), `js/` (compiled marker reader) and `game/spike.z5`.

The page requests only these files from its own origin.

## The three pillars

| Pillar | Source | In CRYPT |
|---|---|---|
| **Ownership** | Mary Shelley, *Frankenstein* (1818) | Every rotting limb gets a named surgeon (from `CODEOWNERS`). |
| **Blamelessness** | Nadya Bartol, TED@BCG (2021) | CRYPT never asks who broke it, only who will heal it. |
| **Control** | Saltzer & Schroeder (1975) | Agents can't merge, can't push to main, and change nothing on failure. |

## How it works

1. **Exhume**: scan lockfiles (npm, pip) with [OSV](https://osv.dev).
2. **Exorcise the noise**: deterministic ranking using [CISA KEV](https://www.cisa.gov/known-exploited-vulnerabilities-catalog) and [FIRST EPSS](https://www.first.org/epss/). Only what matters spawns.
3. **Operate**: play the generated `.z5` story file. `EXAMINE`, `ASSIGN`, `GRAFT`, `SEAL CRYPT`.
4. **Prove it**: agents open a PR → CI → a human merges → the creature is recompiled, healed.

## Safety guarantees

- No code path can merge a PR. Agents hold a PR-only token.
- Any failure leaves the creature unchanged (fail-safe default).
- One dependency per PR. Max 5 PRs per raid.
- `SEAL CRYPT` freezes every agent instantly.
- Every agent action is written to an audit log.

Each guarantee is enforced by a property-based test. See [`.kiro/steering/failsafe.md`](.kiro/steering/failsafe.md).

## Built with Kiro

Specs, steering, hooks, custom agents and property-based tests live in [`.kiro/`](.kiro/).
See [`docs/KIRO.md`](docs/KIRO.md) for how Kiro was used.

## Attribution

Third-party data, tools and code are listed in [`docs/ATTRIBUTION.md`](docs/ATTRIBUTION.md).

## License

[MIT](LICENSE)

## Transcript bridge spike

```
npm install
npm run spike   # builds tools into .toolchain/ on first run, compiles the game, plays a scripted session, checks the result
npm test        # vitest + fast-check
```

See `.kiro/specs/transcript-bridge-spike/` for the spec.
