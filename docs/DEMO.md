# Demo video: shot list and how to run it

Target length: 3:00. Record at 1920x1080 in a browser with a GPU. The captures in this repo were checked only with software WebGL (about 26 fps), so do the real take on a machine with a graphics card.

## Run it

```
npm ci
npm run exhume -- fixtures/vulnerable-npm --feeds fixtures/vulnerable-npm/feeds --offline
PORT=8099 npm run web    # prints the address; use PORT=8080 if it is free
```

`web/game/spike.z5` (the story) must exist; `npm run build:game` builds it if it does not. Open `http://127.0.0.1:8099/`.

| URL flag | Effect |
|---|---|
| (none) | 3D bench when WebGL2 is available, otherwise the plain 2D page |
| `?theatre=off` | Plain 2D page. Use it for the accessibility shot |
| `?record=1` | Recording mode: hides the header, event log, plain-page link, sound toggle and the raid and CI buttons. The CRT and the plate stay. Escape leaves it |

There is no `?simulate=` flag. Simulated CI is run from the two buttons "Simulate CI: green" and "Simulate CI: red" (bottom right on the bench). It replays a dry-run graft for the first sick limb, needs no token and no network, and always shows the label SIMULATED CI.

Before the take: clear site data for the page (`localStorage` remembers healed limbs and raid history), reload, leave sound off.

## Shot list

| Time | Shot | Do | Show |
|---|---|---|---|
| 0:00 to 0:05 | Cold open | Load `/?record=1` with nothing else on screen | Title card "CRYPT — Don't abandon your creature." for 3 seconds, then the bench fades in: lamp flicker, CRT, plate on the wall |
| 0:05 to 0:20 | Dolly-in | Start typing `examine` in the game (no click needed) | Camera moves in on the CRT at the first key. Press Enter, the game text prints on the glass |
| 0:20 to 0:40 | The creature | Pause. Pan the mouse slightly for parallax | The plate: possessed limbs (`#`, POSSESSED) and rotting limbs (`%`, ROTTING), the legend |
| 0:40 to 1:05 | GRAFT | Type `assign jquery` then `graft jquery` | The transcript line, the accepted command, the graft sound if sound is on. Say: the game only asks, an agent opens a PR, a human merges |
| 1:05 to 1:30 | Simulated CI green | Leave recording mode (Escape), click "Simulate CI: green" | The label SIMULATED CI on the wall plate, the limb glows and heals, lamp thunder flash |
| 1:30 to 1:50 | Simulated CI red | Click "Simulate CI: red" | SIMULATED CI label again, the limb convulses and stays rotting. Say: red CI changes nothing |
| 1:50 to 2:20 | The raid | Click "Start the 15 minute raid" (or pull the lever on the bench, or type `RAID`). Heal two or three limbs through GRAFT and the simulated CI | The board on the wall: timer, team risk removed, rank, Nights Without Possession |
| 2:20 to 2:35 | End-of-raid card | Let the raid end, or use a short pre-recorded run. Click "Download the raid card (PNG)" | The end card with rank, score, praise lines (names only in praise) |
| 2:35 to 2:45 | Sound toggle | Click "Sound: off" so it reads "Sound: on" | Hum, heartbeat that speeds up with possessed limbs. Sound is off by default |
| 2:45 to 3:00 | 2D fallback and accessibility | Load `/?theatre=off`, then toggle "High-contrast reader mode" | The same game as plain text, a text twin of the plate, announced events. Mention axe-core 0 violations and that reduced motion selects this page |

## Tips

- For clean footage use `?record=1`. Press Escape to bring the controls back mid take, and click "Recording mode" (top left, faint) to go back.
- The title card is skippable by any key or click. Do not touch the keyboard for the first 3 seconds of the take.
- Software WebGL only reaches about 26 fps. Record on real hardware.
- The CI shots are simulated. Keep the SIMULATED CI label in frame.
