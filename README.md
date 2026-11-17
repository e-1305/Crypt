[![CI](https://github.com/e-1305/Crypt/actions/workflows/ci.yml/badge.svg)](https://github.com/e-1305/Crypt/actions/workflows/ci.yml)

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

**New here? Read the [user manual](docs/USER_MANUAL.md).**

## Install

```bash
npm install --global @e-1305/crypt     # gives the `crypt` command
crypt raid <path-or-github-url>
```

Or run it once without installing: `npx @e-1305/crypt raid <path-or-github-url>`.
Node 20 or newer. The package is `@e-1305/crypt` because the names `crypt` and `crypt-cli` belong to unrelated packages on the npm registry. The command it installs is still `crypt`.

## Quickstart

From a checkout of this repository:

```bash
npm ci
npx --no-install crypt raid fixtures/vulnerable-npm --offline   # or: npx --no-install crypt exhume <path-or-github-url>
```

Type `GRAFT JQUERY` at the game prompt: a dry-run fix payload lands in `out/prs/`. Type `SEAL CRYPT`, and every later graft is rejected.
`crypt raid` builds the Inform 6 and dfrotz toolchain once into `~/.cache/crypt/toolchain` (override with `CRYPT_TOOLCHAIN_DIR`; needs git, make, a C compiler and network the first time).
Run it from any directory: `out/`, `crypt-audit.log` and `.crypt-seal` are written to the current one.

Inside a checkout or a project that has the package installed, use `npx --no-install crypt`: it runs the local command and never downloads another package. Outside a project, use `npx @e-1305/crypt`.
`crypt --help` lists every command and flag. `exhume` of a GitHub URL shallow-clones it into a temporary directory, reads the lockfile and CODEOWNERS only, runs nothing from it, installs nothing, and removes the clone.
`bash scripts/ci/pack-install-test.sh` packs the package, installs the tarball into an empty project and runs the installed command, the same check CI runs on Node 20 and 22.

| Exit code | Meaning |
|---|---|
| 0 | ok |
| 1 | runtime failure |
| 2 | usage error |
| 3 | toolchain missing or failed to build |
| 4 | target unreadable (clone failed, no manifest) |
| 130 | interrupted |

### More commands

```bash
npm ci
npm run feeds:update                          # download CISA KEV and FIRST EPSS into data/feeds/
npx --no-install crypt exhume <path-or-github-url>         # writes out/creature.json, prints totals
# offline demo with the committed fixture (OSV answers cached, feeds snapshot from the fixture):
npm run exhume -- fixtures/vulnerable-npm --feeds fixtures/vulnerable-npm/feeds --offline
npm run raise -- out/creature.json            # writes out/creature.inf, out/limbs.json, out/creature.z8
npm run raise:check                           # plays the story with dfrotz and checks the graft bridge
# GRAFT requests become fix PRs (dry-run by default without GITHUB_TOKEN: payloads go to out/prs/, nothing is sent)
npm run necromancer -- --dry-run --target fixtures/vulnerable-npm --advisories fixtures/vulnerable-npm/advisories
npm run inquisitor -- JQUERY --dry-run        # checks the PR's CI; green means awaiting a human to land it
npm run reraise                               # after a human landed PRs: marks limbs healed, recompiles the creature
npm run necromancer:check                     # offline acceptance: GRAFT JQUERY gives 1 payload, SEAL CRYPT then GRAFT LODASH gives 0
```

`exhume` reads `package-lock.json` (v2/v3) and `requirements.txt` (`==` pins only), asks OSV once per `package@version` (cached in `data/cache/osv/`), ranks with local KEV/EPSS files and prints totals (findings, exorcised, spawned). A limb whose status cannot be established is reported as unknown, never as clean. Schema: `.kiro/specs/exhume-and-rank/design.md`.
## Live demo

**[e-1305.github.io/Crypt](https://e-1305.github.io/Crypt/)**: the first vulnerability report you can play. The page opens on a demo creature built from `fixtures/vulnerable-npm`, with its plate and a playable story. A gallery lists 20 public projects, each with its own creature. "Download the playable report" saves the loaded `.z8`, which any Z-machine interpreter (Frotz, Lectrote, Parchment) opens.

GRAFT on the page is a rehearsal: it shows the dry-run pull request payload and sends nothing.

Maintainers: set Settings > Pages > Source to **GitHub Actions** once. `.github/workflows/pages.yml` then deploys on every push to `main`.

## Live raid

`crypt raid https://github.com/<owner>/<repo> --live` opens a real fix pull request through the GitHub API, the Inquisitor watches its `test` check, a human lands it on GitHub, and `crypt reraise --live` shows the limb HEALED. Step by step for the video, including how to create the token: [docs/DEMO.md](docs/DEMO.md).

| Flag | Where | Meaning |
|---|---|---|
| `--live` | `raid`, `graft`, `inquisit`, `reraise` | talk to GitHub for real; needs `GITHUB_TOKEN` |
| `--timeout <seconds>` | `raid`, `inquisit`, `reraise` | how long to wait for the `test` check (10 to 3600, default 600) |
| `--sabotage --i-know-this-is-a-demo` | `graft`, with `--live` | demo only: adds a failing test so CI goes red |

Safety notes:

- Use a fine-grained token limited to the target repository (Contents, Pull requests: read and write; Checks: read). Classic tokens are refused, and so is a token that can see other repositories.
- CRYPT has no merge capability. A person lands the pull request on GitHub.
- `--sabotage` is refused unless `--live` and `--i-know-this-is-a-demo` are both given.
- Every live API call is written to `crypt-audit.log` (method and path, never the token). Any error leaves the state unchanged.
- `npm run live-raid:check` runs the whole raid offline against a mocked GitHub and registry.

## Play in the browser

```bash
npm ci
npm run web        # builds the site (needs the toolchain: npm run setup), serves http://127.0.0.1:8080/
```

Type `GRAFT JQUERY` and the event log shows `[[CRYPT GRAFT JQUERY]]` as detected, and the dry-run payload appears below it. Text you type never counts as a marker. Set `PORT` to change the port.

### Deploy as static files

No server code is needed.

1. `npm run build:site` (writes `_site/`; offline, no network use)
2. Upload `_site/` to any static host. All URLs are relative, so a sub-path such as `/Crypt/` works.

The page requests only its own files under `game/`. To refresh the gallery, run `npm run census` then `npm run gallery:snapshot` and commit `web/gallery-data/`.

## The three pillars

| Pillar | Source | In CRYPT |
|---|---|---|
| **Ownership** | Mary Shelley, *Frankenstein* (1818) | Every rotting limb gets a named surgeon (from `CODEOWNERS`). |
| **Blamelessness** | Nadya Bartol, TED@BCG (2021) | CRYPT never asks who broke it, only who will heal it. |
| **Control** | Saltzer & Schroeder (1975) | Agents can't merge, can't push to main, and change nothing on failure. |

## How it works

1. **Exhume**: scan lockfiles (npm, pip) with [OSV](https://osv.dev).
2. **Exorcise the noise**: deterministic ranking using [CISA KEV](https://www.cisa.gov/known-exploited-vulnerabilities-catalog) and [FIRST EPSS](https://www.first.org/epss/). Only what matters spawns.
3. **Operate**: play the generated `.z8` story file (`npm run raise -- out/creature.json`). `EXAMINE`, `ASSIGN`, `GRAFT`, `SEAL CRYPT`.
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

## Accessibility

See [`docs/ACCESSIBILITY.md`](docs/ACCESSIBILITY.md) for the plate's text equivalents, reader mode and the Lighthouse score.

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
