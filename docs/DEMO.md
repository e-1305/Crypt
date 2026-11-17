# Demo script: the live raid and the operating theatre

Part 1 is the live raid. Part 2 is the 3D bench. This is the exact order for the video. A real pull request is opened on [e-1305/crypt-demo](https://github.com/e-1305/crypt-demo), its `test` check runs on GitHub, a person lands it, and `crypt reraise` shows the limb HEALED. A second, deliberate failure shows the Inquisitor rejecting a bad graft.

CRYPT never merges. It has no merge call, no merge endpoint and no merge command. The one merge in the demo is a human clicking a button.

## Shot list (3:00)

Audio is off by default. Keep it off for the take. Whenever a graft is on screen, the dry-run label ("Dry run. Nothing was sent." or SIMULATED CI) must be in frame. Never use a real token for the first five beats.

| Time | On screen | Say | Command or button | Fallback |
|---|---|---|---|---|
| 0:00 to 0:15 | The landing: title, pitch, `npx` line, the plate | "Every app is a Frankenstein. CRYPT turns the list of rotting parts into a game." | Open `/` | No GPU: load `/?theatre=off` |
| 0:15 to 0:45 | Terminal, the ranked list | "One command. Ranked by CISA KEV and EPSS, not by alarm count." | `npx --no-install crypt raid fixtures/vulnerable-npm --offline` | No network: `--offline` is already set |
| 0:45 to 1:15 | The game prompt and the dry-run payload | "I type GRAFT. The game only asks. The payload is a preview." | `GRAFT JQUERY` (or the "Try: GRAFT JQUERY" chip, then Enter) | `/?theatre=off` shows the same payload panel |
| 1:15 to 1:40 | The plate, the SIMULATED CI label | "Green CI heals the limb. This one is simulated, and the label says so." | "Simulate CI: green" | `?simulate=green` on the URL |
| 1:40 to 2:10 | Terminal: the seal, the refusal, the audit log | "SEAL CRYPT blocks every graft. The refusal is written down." | `SEAL CRYPT`, then `GRAFT LODASH`, then `cat crypt-audit.log` | The page shows the SEAL badge if the terminal is unavailable |
| 2:10 to 2:40 | `.kiro/specs/`, a hook run, `.kiro/steering/failsafe.md` | "Specs first, steering that binds, hooks on save." | `ls .kiro/specs`, `bash scripts/hooks/failsafe-check.sh src/necromancer/index.ts` | Open [KIRO.md](KIRO.md) and show the hook table |
| 2:40 to 3:00 | The pull request on `e-1305/crypt-demo`, merged by a person | "CRYPT has no merge call. A human clicked this." | Beat 2 below | Show a PR already merged in an earlier take |

The hook run in the 2:10 beat is a by-hand run of the same script. No hook has fired inside a Kiro session yet, so do not say it did.

## Prerequisites

- Node.js 20 or newer and git.
- `npm ci` run in this repository. The Inform 6 and dfrotz toolchain is built by the first raid (or `npm run setup`), so do one dry run before filming.
- A GitHub account with write access to `e-1305/crypt-demo`, or a fork with the same name and files (`package.json`, `package-lock.json`, `test/smoke.test.js`) and a workflow that runs a job named `test` on pull requests.
- The commands below use `npx --no-install crypt`. Run them from the root of this repository.

## Create the token

CRYPT refuses a token that is wider than it needs to be, so create a fine-grained token limited to the demo repository.

1. On GitHub open **Settings**, then **Developer settings**, then **Personal access tokens**, then **Fine-grained tokens**, then **Generate new token**.
2. Name it `crypt-demo`. Set **Expiration** to 7 days.
3. **Resource owner**: `e-1305` (or the owner of your fork).
4. **Repository access**: **Only select repositories**, then choose `crypt-demo`. Nothing else.
5. **Repository permissions**:
   - **Contents**: Read and write
   - **Pull requests**: Read and write
   - **Checks**: Read-only
   - **Metadata**: Read-only (added automatically)
   Leave every other permission at "No access".
6. Click **Generate token** and copy it. GitHub shows it once.
7. In the terminal: `export GITHUB_TOKEN=github_pat_...`

Notes:

- Never use a classic token (`ghp_...`). `crypt` refuses it, because a classic token cannot be limited to one repository.
- Before anything is written, `crypt` lists the repositories the token can see. If it sees any besides the target, it stops and says how many. If GitHub does not allow that listing, it prints a one-line note and continues.
- The token is only ever sent in an `Authorization` header. It is not written to the audit log, the output or any file.
- Revoke the token after the demo (Settings, Developer settings, Fine-grained tokens, Delete).

## Reset between takes

```bash
rm -rf out .crypt-seal crypt-audit.log
```

On GitHub, close any open pull request from a `crypt/` branch and delete the `crypt/` branches (the **Branches** page of the repository). If a previous take merged the lodash PR, restore `package.json` and `package-lock.json` on `main` to the original versions (lodash 4.17.15, jquery 3.4.1), or use a fresh fork.

## Beat 1: the live raid

```bash
npx --no-install crypt raid https://github.com/e-1305/crypt-demo --live
```

What happens, in order:

1. Preflight checks the token and the repository. It fails before any clone or write if something is wrong.
2. CRYPT exhumes the dependencies, ranks them with KEV and EPSS, prints the plate and opens the game.
3. In the game, the two spawned limbs for crypt-demo are `JQUERY` and `LODASH` (these are the limb IDs the raid generates for the demo files). Type:

```
GRAFT LODASH
```

4. CRYPT prints `Graft LODASH: pull request opened https://github.com/e-1305/crypt-demo/pull/<n>`. The pull request bumps lodash 4.17.15 to 4.18.0 in `package.json` and `package-lock.json` (with the `resolved` URL and `integrity` hash taken from registry metadata; no package is downloaded or installed). Open the URL in the browser.
5. Show the `test` check running on the pull request, then turning green. The console prints `LODASH: awaiting a human to land the pull request`. The default wait is 10 minutes; use `--timeout <seconds>` (10 to 3600) on `raid` for more.
6. Type `QUIT`, then `Y`, to leave the game.

The commit is one commit on the branch `crypt/graft-lodash-4.18.0`. It has no author name taken from the target's git history.

## Beat 2: a human lands the pull request

On GitHub click **Merge pull request** and confirm. This is the only merge in the demo, and it is done by a person. CRYPT cannot do it.

Then:

```bash
npx --no-install crypt reraise --live
```

It asks GitHub whether the pull request was landed, marks LODASH healed, recompiles the creature and prints the plate. Show the line for lodash with `HEALED`.

## Beat 3: the sabotage beat

This shows the Inquisitor rejecting a graft whose CI is red. The flag is for demos only and is refused unless both confirmation flags are given.

```bash
npx --no-install crypt graft JQUERY --live --sabotage --i-know-this-is-a-demo
```

Without `--live`, or without `--i-know-this-is-a-demo`, the command stops with a usage error (exit code 2) and does nothing. With both, it opens a pull request from `crypt/graft-jquery-3.5.0-sabotage` that also adds a failing assertion to `test/smoke.test.js`, and prints `DEMO SABOTAGE: ...`.

1. Open the pull request URL and show the red `test` check.
2. Run:

```bash
npx --no-install crypt inquisit JQUERY --live
```

3. It prints `The graft was rejected. The creature remains.` The limb stays rotting, and the record moves to `out/prs/rejected/`.
4. Close the pull request on GitHub (do not merge it) and delete the `crypt/graft-jquery-3.5.0-sabotage` branch.

## Beat 4: SEAL

Start the game again without `--live`:

```bash
npx --no-install crypt play
```

```
SEAL CRYPT
GRAFT JQUERY
```

The game answers `The crypt is sealed. No needle moves.` and nothing is requested. With the seal in place, `crypt graft` and `crypt reraise` make zero API calls. Lift it with `npx --no-install crypt unseal`.

## The audit log

Dry-run grafts log `DRYRUN_WRITTEN`, never `PR_OPENED`. `PR_OPENED` appears only with `--live`, when a real pull request exists, and its last column holds that pull request's URL.

Every live API call (GitHub and the npm registry) is appended to `crypt-audit.log` before the request is sent: method and path, never the token, a body or a query string.

```bash
grep API_CALL crypt-audit.log | cut -f1,5
```

Example lines:

```
2026-...Z	GET /repos/e-1305/crypt-demo
2026-...Z	GET /user/repos
2026-...Z	GET /lodash/4.18.0
2026-...Z	POST /repos/e-1305/crypt-demo/git/refs
2026-...Z	POST /repos/e-1305/crypt-demo/pulls
```

If an audit line cannot be written, the request is not sent.

## Troubleshooting

| Message or exit code | Cause | Fix |
|---|---|---|
| exit 2, `--live needs GITHUB_TOKEN` | no token in the environment | `export GITHUB_TOKEN=github_pat_...` |
| exit 2, `--live needs a GitHub URL target` | a local path was given with `--live` | pass `https://github.com/<owner>/<repo>` |
| exit 2, `--live cannot be combined with --offline` | both flags | drop `--offline` |
| exit 2, `--sabotage is a demo flag` | missing `--live` or `--i-know-this-is-a-demo` | run it as shown in Beat 3 |
| exit 2, `--timeout must be a whole number...` | value outside 10 to 3600 | pick a value in range |
| exit 1, `Use a fine-grained token` | classic token (`ghp_`, `gho_`) | create a fine-grained token |
| exit 1, `... is not readable with this token` | token not granted on the repository | add the repository to the token |
| exit 1, `This token cannot push` | Contents permission is read-only | set Contents to Read and write |
| exit 1, `This token can also reach N other repositories` | token is not limited to the demo repository | recreate it with Only select repositories |
| `ERROR` after `GRAFT`, no pull request | registry or GitHub error, a changed dependency tree (handlebars and node-fetch abort this way), no fixed version (mkdirp) | nothing was written; pick lodash or jquery |
| `The graft was rejected` after 10 minutes with no check | the `test` check never reported | confirm the workflow runs on pull requests; raise `--timeout` |
| HTTP 403 or 429 in an error line | GitHub or registry rate limit | wait and retry; the error names the status, never the token |
| exit 4 | target unreadable | check the URL and that the repository has `package.json` |

An error at any step leaves the state unchanged: no pull request is recorded and no limb changes.

## Part 2: the operating theatre (3D bench)

This is the second half of the video: the browser page as a 3D operating theatre. It runs offline against the fixture creature and needs no token. The preloaded demo creature plays on the CRT by default. "Download the playable report" and "Exhume a public repo" are in the Bench drawer (bottom left on the bench), and the plain page keeps them in the page.

Target length: 3:00. Record at 1920x1080 in a browser with a GPU. The captures in this repo were checked only with software WebGL (about 26 fps), so do the real take on a machine with a graphics card.

### Run the bench

```
npm ci
npm run setup            # builds the Inform 6 and dfrotz toolchain once
PORT=8099 npm run web    # builds the site into _site/ and serves it on 127.0.0.1; use PORT=8080 if it is free
```

`npm run web` builds the static site (the demo creature and the 20 gallery creatures), so no separate exhume or game build step is needed. Open `http://127.0.0.1:8099/`.

| URL flag | Effect |
|---|---|
| (none) | 3D bench when WebGL2 is available, otherwise the plain 2D page |
| `?theatre=off` | Plain 2D page. Use it for the accessibility shot |
| `?simulate=green` or `?simulate=red` | Runs the simulated CI once on load, same as the buttons |
| `?record=1` | Recording mode: hides the header, event log, plain-page link, bench drawer, sound toggle and the raid and CI buttons. The CRT and the plate stay. Escape leaves it |

Simulated CI is run from the two buttons "Simulate CI: green" and "Simulate CI: red" (bottom right on the bench). It replays a dry-run graft for the first sick limb, needs no token and no network, and always shows the label SIMULATED CI. For a deterministic take, load `/?simulate=green` or `/?simulate=red`: the run starts once after the first plate load and is not restarted by the raid's 5 second refresh.

Before the take: clear site data for the page (`localStorage` remembers healed limbs and raid history), reload, leave sound off.

### Shot list

| Time | Shot | Do | Show |
|---|---|---|---|
| 0:00 to 0:05 | Cold open | Load `/?record=1` with nothing else on screen | Title card "CRYPT" with the line "Don't abandon your creature." for 3 seconds, then the bench fades in: lamp flicker, CRT, plate on the wall |
| 0:05 to 0:20 | Dolly-in | Start typing `examine` in the game (no click needed) | Camera moves in on the CRT at the first key. Press Enter, the game text prints on the glass |
| 0:20 to 0:40 | The creature | Pause. Pan the mouse slightly for parallax | The plate: possessed limbs (`#`, POSSESSED) and rotting limbs (`%`, ROTTING), the legend |
| 0:40 to 1:05 | GRAFT | Type `assign jquery` then `graft jquery` | The transcript line, the accepted command, the graft sound if sound is on. Say: the game only asks, an agent opens a PR, a human merges |
| 1:05 to 1:30 | Simulated CI green | Leave recording mode (Escape), click "Simulate CI: green" | The label SIMULATED CI on the wall plate, the limb glows and heals, lamp thunder flash |
| 1:30 to 1:50 | Simulated CI red | Click "Simulate CI: red" | SIMULATED CI label again, the limb convulses and stays rotting. Say: red CI changes nothing |
| 1:50 to 2:20 | The raid | Click "Start the 15 minute raid" (or pull the lever on the bench, or type `RAID`). Heal two or three limbs through GRAFT and the simulated CI | The board on the wall: timer, team risk removed, rank, Nights Without Possession |
| 2:20 to 2:35 | End-of-raid card | Let the raid end, or use a short pre-recorded run. Click "Download the raid card (PNG)" | The end card with rank, score, praise lines (names only in praise) |
| 2:35 to 2:45 | Sound toggle | Click "Sound: off" so it reads "Sound: on" | Hum, heartbeat that speeds up with possessed limbs. Sound is off by default |
| 2:45 to 3:00 | 2D fallback and accessibility | Load `/?theatre=off`, then toggle "High-contrast reader mode" | The same game as plain text, a text twin of the plate, announced events. Mention axe-core 0 violations (re-run on the 2D page, see [ACCESSIBILITY.md](ACCESSIBILITY.md)) and that reduced motion selects this page |

### Tips

- For clean footage use `?record=1`. Press Escape to bring the controls back mid take, and click "Recording mode" (top left, faint) to go back.
- The title card is skippable by any key or click. Do not touch the keyboard for the first 3 seconds of the take.
- Software WebGL only reaches about 26 fps. Record on real hardware.
- The CI shots are simulated. Keep the SIMULATED CI label in frame.
- To show the Pages features on the bench, open the "Bench drawer" (bottom left), click "Download the playable report", then type a GitHub address such as `https://github.com/axios/axios` under "Exhume a public repo". Only gallery projects open. The same actions are in the plain page.

### Known limits

- A red CI is recorded by the Inquisitor on the limb in `out/creature.json` (`ciVerdict: "red"`, `ciPr`). The page shows the convulse effect once per PR when `game/<id>.json` carries it. `game/<id>.json` is built by `npm run build:site`, so a live page needs that file regenerated from `out/creature.json` after the Inquisitor runs.
- Praise lines read `healedBy` on a limb. reraise writes it (a cleaned GitHub login, praise only) from the PR the human landed. It is empty when the API does not name anyone.
- The Inquisitor writes `status: "awaiting-human-merge"` on the limb in `out/creature.json` when CI is green, and reraise clears it when the limb heals. The score counts it once `game/<id>.json` is regenerated.
- Risk removed and Nights Without Possession are per browser (they are remembered in localStorage), not shared team numbers. The counter starts at the browser's first visit.
