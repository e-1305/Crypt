# Video kit (3:00)

Storyboard for the Devpost video. It follows [DEMO.md](DEMO.md) beat for beat, with a cold open and a closing line added. Nothing here claims more than the repository proves. Each number names its source.

## Rules

- Total length 3:00 or less. The shots below add up to exactly 3:00.
- Narration is spoken by the human who made the project. No AI voice.
- Audio: original or CC0 music only. No copyrighted tracks. Silence is fine.
- Whenever a graft is on screen, the dry-run label ("Dry run. Nothing was sent.") or "[SIMULATED CI]" is in frame.
- CRYPT has no merge call. The one merge is a person clicking **Merge pull request**.
- Do not say a Kiro hook fired in a Kiro session. The hook run is a by-hand run of the same script ([DEMO.md](DEMO.md)).
- Never show a token. Use the fine-grained token steps in [DEMO.md](DEMO.md) and revoke it after.

## Stills and captions

Made from the built site with recording mode (`?record=1`, or the Recording mode button, Escape leaves it). All are 1280x720 and live in [`assets/video/`](../assets/video/). Captions: [`assets/video/captions.srt`](../assets/video/captions.srt), timings match the table.

To rebuild the site and view the same screens: `npm ci && npm run build:site && npm run web`, then open `http://127.0.0.1:8080/?record=1` (add `&theatre=off` for the flat page).

| File | Shot |
|---|---|
| `01-title.png` | 1 |
| `02-landing-crt-record.png` | 1 (CRT, recording mode, 3D bench) |
| `03-census.png` | 3 |
| `04-live-raid-terminal.png` | 4 (first lines of the offline raid output) |
| `05-graft-dry-run.png` | 1 and 4 (dry-run payload) |
| `06-simulated-ci-green.png` | 4 (`?simulate=green`, labelled SIMULATED CI) |
| `07-ci-red-rejected.png` | 5 |
| `08-seal-crypt.png` | 6 |
| `09-under-the-hood.png` | 7 |
| `10-playable-report.png` | 8 |
| `11-closing.png` | 9 |

## Storyboard

| # | Time | Dur | On screen | Command or keys | Narration (human) | Caption |
|---|---|---|---|---|---|---|
| 1 | 0:00 to 0:12 | 12 s | The CRT on the 3D bench (`02`), then the dry-run payload (`05`). Title card `01` for the first 2 s. | Open `/?record=1`. Type `GRAFT JQUERY`, Enter. Fallback: `/?record=1&theatre=off`. | "Every app is a Frankenstein. CRYPT turns the list of rotting parts into a game. I type GRAFT." | Every app is a Frankenstein. CRYPT turns rotting parts into a game. |
| 2 | 0:12 to 0:22 | 10 s | Real footage: the pull request on `e-1305/crypt-demo`, `test` check green, **Merged** badge. | Recorded earlier ([DEMO.md](DEMO.md) Beats 1 and 2). Show the PR page, then the merged state. | "That pull request is real. A person merged it. CRYPT cannot." | A real pull request. Merged by a person. |
| 3 | 0:22 to 0:40 | 18 s | Census card (`03`). | None. Numbers come from [docs/census/RESULTS.md](census/RESULTS.md). | "I ran it on twenty popular projects. Eleven thousand dependencies, two hundred forty-eight findings, three monsters. None actively exploited." | Census: 20 projects, 248 findings, 3 monsters. 0 possessed. |
| 4 | 0:40 to 1:05 | 25 s | Terminal with the ranked list (`04`), then the live graft: terminal prints the PR URL, browser shows the PR, `06` for the labelled simulated CI. | `npx --no-install crypt raid fixtures/vulnerable-npm --offline`, then for the live take `npx --no-install crypt raid https://github.com/e-1305/crypt-demo --live` and `GRAFT LODASH`. | "One command. Ranked by CISA KEV and EPSS, not by alarm count. The graft opens a pull request and waits for a human." | One command. Ranked by CISA KEV and EPSS. GRAFT opens the pull request. |
| 5 | 1:05 to 1:35 | 30 s | A pull request with a red `test` check, then the terminal line `The graft was rejected. The creature remains.` (`07`). | `npx --no-install crypt graft JQUERY --live --sabotage --i-know-this-is-a-demo`, then `npx --no-install crypt inquisit JQUERY --live`. Close the PR, do not merge. | "Now I break the test on purpose. CI goes red. A different agent checks it. The graft was rejected. The creature remains." | CI red. The graft was rejected. The creature remains. |
| 6 | 1:35 to 1:55 | 20 s | The game (`08`): seal badge, the refusal, then the audit log. | `SEAL CRYPT`, `GRAFT LODASH`, then in a terminal `cat crypt-audit.log`. Lift with `npx --no-install crypt unseal`. | "SEAL CRYPT is the kill switch. Every graft is refused, and the refusal is written down." | SEAL CRYPT blocks every graft. The refusal is logged. |
| 7 | 1:55 to 2:25 | 30 s | Card `09`, then the real folders and one by-hand hook run. | `ls .kiro/specs`, `ls .kiro/hooks`, `bash scripts/hooks/failsafe-check.sh src/necromancer/index.ts`, open `.kiro/steering/failsafe.md` and `.kiro/settings/mcp.json`. | "I wrote the spec first, then the code. Steering rules bind every session. Hooks check on save. An MCP server lets a client query the creature under the same rules." | Built with Kiro: specs, steering, hooks, MCP. |
| 8 | 2:25 to 2:45 | 20 s | The page with the download button (`10`), then the downloaded file name. | Click "Download the playable report" (file `crypt-demo.z8`). | "Every creature is a playable file. Download it and play it anywhere a Z-machine runs." | Download the playable report. Share the creature. |
| 9 | 2:45 to 3:00 | 15 s | Closing card (`11`). | None. | "Own it. Without shame. Without losing control. Don't abandon your creature." | Own it. Without shame. Without losing control. Don't abandon your creature. |

## Where each claim comes from

| Claim | Source |
|---|---|
| 20 projects, 11,244 dependencies, 248 findings, 3 spawned, 0 possessed | [docs/census/RESULTS.md](census/RESULTS.md); reproduce with `npm run census` (scan date 2026-11-17; a rerun on another day differs) |
| Ranked by CISA KEV and EPSS | `npx --no-install crypt raid fixtures/vulnerable-npm --offline` prints the feed status and `#1 Possessed npm:jquery@3.4.1` |
| Fixture result: 7 dependencies, 5 findings, 2 limbs spawn | same command |
| CRYPT never merges | [.kiro/steering/failsafe.md](../.kiro/steering/failsafe.md) rule 2; `scripts/ci/failsafe-guard.sh` runs in CI |
| SEAL refuses every graft and the refusal is logged | [DEMO.md](DEMO.md) Beat 4 and "The audit log" |
| Spec count, hooks, steering | `ls .kiro/specs`, `ls .kiro/hooks`, `ls .kiro/steering` |
| Hook run is by hand | [DEMO.md](DEMO.md), [KIRO.md](KIRO.md) |

## Footage to record on the day

Shots 2, 4 (live part), 5, 6 (audit log) and 7 need a real token and the live repository, so they are not committed. Follow "Create the token" and "Reset between takes" in [DEMO.md](DEMO.md). If a live take fails, use the fallbacks in the DEMO.md shot list.
