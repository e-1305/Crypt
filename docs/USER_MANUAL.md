# CRYPT user manual

CRYPT turns a project's dependency tree into a creature, one limb per package, and lets a team heal it by playing a text adventure. This manual covers day-to-day use. Background and design live in the [README](../README.md), [DEMO.md](DEMO.md) (the live pull request walkthrough), [ACCESSIBILITY.md](ACCESSIBILITY.md) (measurements) and [KIRO.md](KIRO.md).

**Where CRYPT fits.** CRYPT complements Dependabot, Snyk and Socket. It does not compete on detection: it has no malware detection and no function-level reachability. Its job is the last mile: exploited first, a named owner, one fix PR, and a person merges. See [COMPETITORS.md](COMPETITORS.md). CRYPT has no customers yet.

## Quick start for testers

You do not need to know what jQuery is. This page walks you through the live demo in about five minutes. Nothing you do here changes any real project.

The demo shows a small project as a creature. Each package the project depends on is a limb. `JQUERY` is one of those limbs: jQuery is a JavaScript library that many websites use, and the demo project depends on an old version of it that has known security problems. The game tells you what is wrong with it.

1. Open the [live page](https://e-1305.github.io/Crypt/). Click the Command box, type `EXAMINE JQUERY` and press Enter. The game describes the limb: its state, how many known vulnerabilities (CVEs, public security bug reports) it has and how likely they are to be attacked.
2. Type `GRAFT JQUERY` and press Enter. This asks for a fix. The page shows a dry-run pull request in the "Dry-run PR payload" panel. It is a preview only. Nothing is sent anywhere, and a person would still have to merge a real one.
3. Read the plate (the picture of the creature). Each limb has a glyph and a word, so colour is never the only clue. `#` POSSESSED (orange) means the vulnerability is being used by attackers right now. `%` ROTTING (yellow-green) means a known vulnerability exists. `.` HEALTHY (dim green) means none is known. HEALED (bright green) means the fix was merged.
4. Type `RAID` and press Enter to start the 15 minute timer and the team score.
5. Type `SEAL CRYPT` and press Enter to freeze every agent action. After that, any `GRAFT` or `RAID` is rejected. In the browser the seal lasts until you reload the page.

Commands use capital letters only and exactly one space between words. Anything else is rejected, and nothing happens. The rest of this manual has the details.

## 1. Install and first raid

Node 20 or newer is required.

```bash
npm install --global @e-1305/crypt     # installs the `crypt` command
crypt raid <path-or-github-url>
```

From a checkout of this repository, use the local command:

```bash
npm ci
npx --no-install crypt raid fixtures/vulnerable-npm --offline
```

The first run builds the Inform 6 and dfrotz toolchain into `~/.cache/crypt/toolchain` (set `CRYPT_TOOLCHAIN_DIR` to move it). That step needs git, make, a C compiler and network access, once. `out/`, `crypt-audit.log` and `.crypt-seal` are written to the directory you run the command from.

`crypt raid` runs the whole ritual: exhume the lockfile, rank the findings, raise the story file, print the plate (the picture of the creature) and open the game prompt.

### Commands

| Command | What it does |
|---|---|
| `crypt raid <target>` | Exhume, raise, show the plate and play. Start here. |
| `crypt exhume <target>` | Scan the dependencies and write `out/creature.json`. |
| `crypt raise [creature]` | Build `out/creature.z8` from the creature file. |
| `crypt play` | Play `out/creature.z8`. |
| `crypt graft <LIMB>` | Request one fix for a limb. |
| `crypt inquisit <LIMB>` | Check the CI of that limb's pull request. |
| `crypt reraise` | After a human landed pull requests, mark those limbs healed and recompile. |
| `crypt seal` / `crypt unseal` | Stop every agent action / lift the stop. |

`<target>` is a local directory or `https://github.com/<owner>/<repo>`. A GitHub URL is shallow-cloned into a temporary directory that is removed afterwards. Only the lockfile and CODEOWNERS are read. Nothing from the target runs and nothing is installed. `crypt --help` lists every flag.

Supported inputs: `package-lock.json` (v2 and v3) and `requirements.txt` (`==` pins only). A limb whose status cannot be established shows as unknown, never as clean.

### Exit codes

| Code | Meaning |
|---|---|
| 0 | ok |
| 1 | runtime failure |
| 2 | usage error |
| 3 | toolchain missing or failed to build |
| 4 | target unreadable (clone failed, no manifest) |
| 130 | interrupted |

## 2. Playing the game

Commands are matched against a strict grammar. Capital letters only, one space between words, no extra text. Anything else is rejected before any action happens.

| Command | Effect |
|---|---|
| `EXAMINE <LIMB>` | Describes the limb: state, number of CVEs, top EPSS score and the surgeon of record (from CODEOWNERS). |
| `ASSIGN <LIMB>` | Names the owner of the limb. |
| `GRAFT <LIMB>` | Asks for a fix. In the terminal and in the browser this writes a dry-run pull request payload (`out/prs/` in the terminal, the "Dry-run PR payload" panel in the browser). With `--live` it opens a real pull request. |
| `SEAL CRYPT` | Freezes every agent action. Later `GRAFT` and `RAID` commands are rejected. In the browser the seal lasts until the page is reloaded. |
| `RAID` | Starts the 15-minute raid timer (see section 5). |
| `HELP` | Lists the commands. Prints text only. |
| `HINT` | Names the limb to `EXAMINE` or `GRAFT` next. Works in every state, including after `SEAL CRYPT`. Prints text only. |
| `WAIT`, `SING`, `SLEEP`, `HELLO` | Pass a moment in the crypt. The vault has a few more replies, so try other words. Text only. |

Each limb has a personality (grumpy elder, nervous intern, show-off and others) picked from its package name, and its description changes with its state: healed, rotting or possessed. A limb with a high exploit chance (EPSS 0.5 or more) gets a worse line. The room text follows the worst state in the vault, and now and then the crypt adds an atmosphere line such as `The lights flicker.` These extra words never ask for a fix and never reach the pull request step.

`<LIMB>` is the package name in capitals, up to 32 letters, for example `GRAFT JQUERY`. Try the offline check with `npm run necromancer:check`: `GRAFT JQUERY` gives one payload, and after `SEAL CRYPT` a `GRAFT LODASH` gives none.

`crypt seal` writes `.crypt-seal` in the current directory and `crypt unseal` removes it. While it exists, every graft is rejected. If the story file fails to load in the browser, no command works, including `RAID`: reload the page.

## 3. Reading the creature

Each limb is one package. The state is shown by a glyph and a word, never by colour alone.

| State | Plate glyph | Colour (3D wall) | Meaning |
|---|---|---|---|
| POSSESSED | `#` | orange `#ff6a3d` | A known vulnerability is actively exploited (CISA KEV). Heal these first. |
| ROTTING | `%` | yellow-green `#c8e63c` | A known vulnerability exists (OSV). |
| HEALED | clean lines | bright green `#33ff33` | The fix was merged by a human and the creature was recompiled. |
| HEALTHY | `.` | dim green `#22b022` | No known vulnerability. |

Ranking uses KEV and EPSS data and is plain deterministic code. No AI model scores or ranks anything.

### Awaiting human merge

When a fix pull request has green CI, the limb is marked `awaiting-human-merge`. The plate keeps showing it as POSSESSED or ROTTING, because the limb is not healed yet. The raid score counts it (section 5). It becomes HEALED only after a person merges the pull request on GitHub and `crypt reraise` (or the web page, when it loads the updated creature) sees the merge. A red CI result changes nothing: the limb stays as it was.

## 4. Guarantees

- CRYPT has no merge capability. A human merges every pull request on GitHub.
- Agents never push to the default branch.
- On any error, timeout or ambiguity nothing changes and the limb stays rotting.
- One dependency per pull request, at most 5 pull requests per raid.
- `SEAL CRYPT` stops every agent action.
- Every live API call is appended to `crypt-audit.log` (method and path, never the token).
- Owners come from CODEOWNERS only. CRYPT never reads git blame. People are named only in praise ("healed by").

The full rule list is in [`.kiro/steering/failsafe.md`](../.kiro/steering/failsafe.md) and [`.kiro/steering/blameless.md`](../.kiro/steering/blameless.md).

### Live mode

`crypt raid <github-url> --live` opens a real pull request, watches its `test` check and leaves the merge to a person. It needs a fine-grained `GITHUB_TOKEN` limited to the target repository (Contents and Pull requests: read and write, Checks: read). Classic tokens are refused. Without a token, runs are dry runs. Use `--timeout <seconds>` (10 to 3600, default 600) to set how long to wait for CI. Steps for a full demonstration are in [DEMO.md](DEMO.md).

## 5. The web player

The hosted page is [e-1305.github.io/Crypt](https://e-1305.github.io/Crypt/). This manual is also hosted, at [e-1305.github.io/Crypt/manual.html](https://e-1305.github.io/Crypt/manual.html), and the page links to it as "How to play (manual)". To run it locally:

```bash
npm ci
npm run setup      # builds the toolchain once
npm run web        # serves http://127.0.0.1:8080/ (set PORT to change)
```

The page opens on a demo creature built from `fixtures/vulnerable-npm`. `GRAFT` in the browser is a rehearsal: it shows the dry-run payload and sends nothing.

- **Paste your GitHub repo.** The one primary button on the first screen. Press it, paste `https://github.com/owner/repo` and press Enter. In about 10 to 30 seconds (it depends on the lockfile size and the OSV service) the page shows your creature's plate, the ranked limbs, the owners from CODEOWNERS and, for each spawned limb, the pull request payload labelled "dry run: run `npx @e-1305/crypt raid <repo> --live` to open it for real". It then offers "Play its crypt" when the repo is in the gallery, or "Play the demo crypt" plus the `npx` command that generates yours. The web version reads npm projects only (`package-lock.json`, lockfileVersion 2 or 3, at the repo root). The KEV and EPSS feed date is shown. On any error the page shows what to do next and draws no creature. Nothing is written and no git author is read.
- **How a graft is chosen.** One graft per package, however many copies of it are installed. The list shows `lodash ×4 versions (2.4.2, 4.17.4, ...)` once, labelled direct or transitive. The fixed version must lie outside the affected ranges of every OSV advisory for that package, not only those of one copy, and above every affected copy. A major jump (or a minor jump in a 0.x version) is flagged in the title and body: "⚠ major: review carefully". A package that only other packages pull in is forced with npm `overrides` (`"overrides": { "lodash": ">=4.17.23" }`) and the body says "transitive: forced via overrides; check the parents' compatibility". A package in `package.json` keeps the plain version bump. If the advisory list cannot be read in full, no version is chosen. Packages without a CODEOWNERS owner show "no owner yet".
- **Bench.** The "Bench" button opens the raid, trophies, ranks, Simulated CI, the gallery, sound and recording mode. Escape closes it. On the 3D bench the "Bench drawer" opens the same controls.
- **Gallery.** Twenty public projects, each with its own creature, in the Bench. Type a GitHub address into "Open a project by its GitHub address" to open one.
- **Download the playable report.** Saves the loaded `.z8` file. Any Z-machine interpreter (Frotz, Lectrote, Parchment) opens it.
- **Event log.** Lists commands the story confirmed. Text you type is never counted as a command.
- **High-contrast reader mode.** Plain white-on-black text, no effects. The choice is remembered in the browser.

### URL flags

| Flag | Effect |
|---|---|
| `?creature=<slug>` | Opens a gallery creature. |
| `?theatre=off` | Loads the plain 2D page and skips three.js. |
| `?record=1` | Starts in recording mode (below). |
| `?simulate=green` or `?simulate=red` | Replays a simulated CI result on the first sick limb when the page loads. |

Flags combine with `&`, for example `?theatre=off&simulate=green`.

### The 3D operating theatre

On a browser with WebGL2, the page shows a 3D bench: a CRT with the game, the plate on the wall, a lamp and a bench drawer. Type as usual. Keys go to the real command input. The camera moves toward the CRT on the first key press. A title card shows for 3 seconds (any key or click skips it).

The page loads the plain 2D view instead when any of these hold: no WebGL2, reduced motion is requested in the operating system, reader mode is on, or the URL has `?theatre=off`. A "Plain page" link on the bench does the same.

**Bench drawer.** Use the drawer toggle to open "Download the playable report" and "Exhume a public repo" (opens that creature when it is in the gallery). Escape closes the drawer and returns focus to the toggle.

**Sound.** The "Sound: off" button turns on synthesised audio (a CRT hum, a heartbeat that quickens with possessed limbs, thunder when a limb heals). Sound starts off and only a click on the button starts it. No audio files are loaded.

**Recording mode.** The "Recording mode" button, or `?record=1`, hides the header, event log, plain-page link, sound button and the raid and CI buttons so the CRT and plate fill a screen capture. Escape leaves it. The announcer still speaks while recording, so screen-reader users hear events.

### Simulated CI

The "Simulate CI: green" and "Simulate CI: red" buttons replay a dry-run graft for the first sick limb. Everything is labelled SIMULATED CI, uses no token or network, and is kept out of the raid score. Green heals the limb on screen with a flash and thunder. Red makes the limb convulse and leaves its state unchanged. After a green result the plate marks the limb HEALED within three seconds, the event log adds "SIMULATED: jquery healed" and a screen reader hears it. After a red result the limb stays ROTTING and the log says so. Real heals appear when the page loads a creature file in which a limb has become healthy after a human merge.

### The raid

Type `RAID` in the game input, or press "Start the 15 minute raid". The readout shows:

- **Time left**, counting down from 15:00. A warning is announced at one minute. At 00:00 the raid completes and a card appears.
- **Team risk removed.** The sum, over limbs that are healed or awaiting a human merge, of the limb's EPSS score, multiplied by 3 when the limb is on the KEV list. It is one number for the whole team.
- **Rank**, from the number of healed limbs: Apprentice (0 to 2), Surgeon (3 to 6), Resurrectionist (7 or more).
- **Nights Without Possession.** Whole days since a KEV limb last stayed open longer than 48 hours after it was first seen. With no such breach it counts from this browser's first visit. It restarts at 0 while a KEV limb is open past 48 hours.
- **Praise.** Lines such as "jquery healed by `<login>`", sorted by package. Names appear in praise only.
- **Download the raid card (PNG).** Appears when the raid completes. It holds the repo name, limbs healed, risk removed, time, rank, grade, trophies and an epitaph. It carries no owner or person.

Scores are for the team. CRYPT does not rank, total or compare individuals, and has no leaderboard. Raid state is stored in the browser, per creature, so clearing site data resets it.

### Share your creature

After you paste your repo, and again when a raid ends, a share panel draws a 1200 by 627 PNG card in your browser: the plate, the creature's name, `N findings -> M monsters`, possessed and rotting counts, limbs healed, and the line "Don't abandon your creature" with the site address. The raid card adds the team score, limbs healed and the raid time. Nothing is uploaded and nothing is tracked.

- **Include the repo name** puts the repo on the card. It starts on for a public repo you pasted and off after a raid. No person, owner or commit author is ever drawn.
- **Download PNG** saves the card. **Copy image** puts it on the clipboard. **Share on LinkedIn** opens the LinkedIn share page with the site link and copies a short post text with `#KiroweenHackathon26`, which is also shown under the card. Paste the image into the post.

### Game feel

The raid adds arcade touches on top of the team score. They are display only: the team risk removed and the rank above do not change because of them. Nothing here is counted per person.

- **Combo.** Heals that land within 90 seconds of each other form a team chain. Each heal after the first adds 0.5 to the multiplier, up to x3. The readout shows the chain and a "style bonus" (team risk removed times the multiplier minus 1). The chain lapses 90 seconds after the last heal.
- **Bosses.** Limbs on the KEV list with an EPSS of 0.5 or more are bosses. If none qualify, the highest-risk KEV limb is the boss. A banner names the boss when the raid starts and says "Boss slain" when it is healed.
- **Vitals.** A health bar (0 to 100, with its value read by screen readers) falls as sick limbs remain, and the heartbeat quickens with it. The text line gives the same numbers. A risk removed counter counts up, and the readout names the next rank and the heals still needed.
- **Trophies.** Six team plates: First Blood, Chain of 3, Boss Slain, Clean Sweep, Nights Without Possession (3 or more nights), Under Ten Minutes. They belong to the team. The shelf lists each as earned or locked, and the wall board shows the count.
- **Grade.** The card shows a grade from S to D. It rises with limbs healed and falls the longer the raid takes. Each grade has its own set of epitaphs.
- **Effects.** A "+risk" pop-up, a short screen shake and a lightning flash mark a heal or a boss kill. With reduced motion or high-contrast reader mode the effects are off and the same facts appear as plain text and announcements.

### Getting started

A strip above the game walks through the first minute on the demo creature in three steps: look at the plate, type `GRAFT <limb>`, then open the Bench and press "Simulate CI: green" and watch the limb heal. The strip names a limb that has a rehearsal pull request.

- You type every command. The strip shows what to type and never runs anything, `GRAFT` included. Each command goes through the same strict grammar as the rest of the game.
- A step finishes when the game accepts its verb. Step 1 finishes with the "Got it" button. The CI step finishes when the page sees the green result.
- After 8 seconds without typing, one hint appears under the strip and is read out politely by screen readers. Typing clears the wait.
- "Skip" closes the strip. "Hide for good" keeps it closed on later visits. Both are remembered in this browser.
- A banner above the page shows one of eight daily lines, chosen from the date, so everyone sees the same line on the same day.

### The seal on the page

Typing `SEAL CRYPT` shows a badge, "SEALED: no graft will run.", on the 2D page and over the 3D bench. A `GRAFT` is then rejected and no payload is made. The "Unseal" button lifts the seal for this page only.

### Pressure

While a raid runs, "Possession spread" shows how far the possession has spread, from 0 to 100 percent, as a text line and a progress bar. It rises with the clock and climbs faster while KEV limbs stay open. Healing a KEV limb lowers it again. Warnings appear at 10, 5 and 1 minutes left, in text, and the 10 and 5 minute warnings are announced, and the last minute is announced by the raid timer. Pressure is display only: it does not change the team risk removed, the rank or the grade. It never pulses, and it looks the same with reduced motion, high-contrast reader mode and the 2D page.

### Run history and SLA trend

Each `crypt autopsy` and `crypt gazette` run appends one line per limb to `out/crypt-history.jsonl`: time, limb, state, KEV, EPSS, owner team and deadline, with a `source` label (`real` or `sample`). Lines of one limb less than five minutes apart count as one run, so `autopsy` and `gazette` in one job add one point. A deadline counts from the limb's found time when the creature has one, else from the first history line. The autopsy page and the War Room show open KEV limbs over time, the age of each limb, deadline breaches and the mean time to heal (only from Healed lines that carry their own time; landing time is shown apart). A value the file does not hold reads `unknown`.

In the GitHub Action the file is in the artifact. To keep it between runs, set `history-branch: crypt-history` and give the job `contents: write`. Only a branch named `crypt-history` that is not the default branch is accepted. To read another file, run `crypt autopsy --history <file>`. The War Room shows the real crypt-demo events of 2026-11-18 from `fixtures/history/crypt-demo-2026-11-18.jsonl`.

## 6. Accessibility

The text game is the core, so screen readers work with the same text the game prints. The transcript is a live log region, every command has a labelled input, state is told by glyph and word, and events are announced through a polite status region. Reduced motion turns off all animation. The Lighthouse score is 100 on the default 2D page. Full measurements are in [ACCESSIBILITY.md](ACCESSIBILITY.md).

Limits of the 3D bench, stated plainly:

- The canvas is hidden from assistive technology. Screen reader and keyboard users use the page's ordinary elements, which stay in the page but are visually clipped while the bench shows.
- The visible focus ring on the command input does not show in 3D. The CRT draws its own cursor.
- Text on the CRT and wall plate is small, curved and softened by effects. Browser zoom scales the 3D scene, not the text. Use reader mode or the "Plain page" link for low vision.
- The scene has a small mouse parallax and slight lamp and CRT flicker. Reduced-motion users get the 2D page.
- The 60 fps goal on a laptop GPU has not been measured. Headless software rendering gave 25 to 28 fps.
- Lighthouse has not been run on reader mode or on a creature with possessed limbs.

## 7. Troubleshooting

| Symptom | What to do |
|---|---|
| Exit code 3 | The toolchain did not build. Install git, make and a C compiler, make sure the network is reachable, then run `npm run setup` or rerun `crypt raid`. Build output is in `~/.cache/crypt/toolchain/build.log`. |
| Exit code 4 | The target has no readable manifest or the clone failed. Check the path or URL and that a `package-lock.json` or pinned `requirements.txt` exists. |
| Exit code 2 | A flag or argument is wrong. Run `crypt --help`. |
| Grafts say "The crypt is sealed" | Run `crypt unseal` in the directory that holds `.crypt-seal`. |
| `npx crypt` tries to download something | Inside a checkout use `npx --no-install crypt`. Elsewhere use `npx @e-1305/crypt`. |
| A command is rejected | Use capitals and one space: `GRAFT JQUERY`. The limb is the package name in capitals. |
| Plain page loads instead of the 3D bench | Check WebGL2 support, the reduced-motion setting, reader mode and that the URL has no `?theatre=off`. |
| No sound | Press "Sound: off" to turn it on. Browsers allow audio only after a click. |
| `--live` is refused | Set `GITHUB_TOKEN` to a fine-grained token limited to the one target repository. |
| Offline run has no data for a package | `--offline` answers only from the cache in `data/cache/osv/`. Run once with network access to fill it. |

## How it works

One lockfile in, one playable story out, and a human at the end. Each arrow is a file you can read.

```
lockfile --> OSV + CISA KEV + EPSS --> creature.json --> Inform 6 --> creature.z8
   (Z-machine story) --prints--> [[CRYPT GRAFT JQUERY]] --> watcher --> Necromancer
   --> fix PR (dry run by default) --> CI --> a person merges --> reraise --> limb HEALED
```

**Why a Z-machine.** The story is one small file that runs anywhere. Infocom's interpreters (Frotz, Lectrote, Parchment) open the `.z8` you download from the page. The game is the interface, so there is no dashboard to build.

**Only the game triggers anything.** The watcher reacts to `[[CRYPT ...]]` markers that the story prints after it accepts a command. Text you type never counts as a marker, and the command grammar is strict (capitals, one space).

**The failsafe.** There is no merge call anywhere in the code. `SEAL CRYPT` blocks every graft. Every agent action goes to `crypt-audit.log`. Without `GITHUB_TOKEN`, a graft is a dry run and writes its payload to `out/prs/`. A person merges every pull request. [failsafe.md](../.kiro/steering/failsafe.md) lists the rules, and property-based tests enforce them.

**Why the story says `(at)`.** The plate shows an owner as `@team`, and the story text shows `(at)team`. The Inform 6 compiler reads `@` as an escape inside strings, so `src/raise/sanitize.ts` spells it `(at)` in every generated string, and the same pass strips brackets and quotes. Same owner, same CODEOWNERS entry, two spellings by design.

**One file format, two front ends.** The Pages site and the CLI read the same `creature.json`. The page can rehearse: play the story, read dry-run payloads and simulate CI. Only the CLI can open a real pull request (`crypt raid <url> --live`). Tier 1 scope: npm and pip lockfiles.

### Built with Kiro

CRYPT was built with Kiro, using four of its features together:

- **Specs** in [`.kiro/specs/`](../.kiro/specs/): every feature began as requirements, a design and tasks. [necromancer/requirements.md](../.kiro/specs/necromancer/requirements.md) is the one behind the graft flow.
- **Steering** in [`.kiro/steering/`](../.kiro/steering/): the rules that bind every change (no merge call, SEAL blocks grafts, one team score, blameless wording). Tests check them.
- **Hooks** in [`.kiro/hooks/`](../.kiro/hooks/): checks that run when a file is saved. [failsafe-guard-on-save.json](../.kiro/hooks/failsafe-guard-on-save.json) fails a save that adds a merge call.
- **Agents** in [`.kiro/agents/`](../.kiro/agents/): the Necromancer and the Inquisitor.

[KIRO.md](KIRO.md) has the evidence and the limits. The playtest loop in [PLAYTEST_LOG.md](PLAYTEST_LOG.md) and [BACKLOG.md](BACKLOG.md) shows how a judge persona and a product manager persona drive each round of fixes.
