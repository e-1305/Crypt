# UX review: Nielsen's 10 heuristics

Issue #228. A short, honest read of the web UI (`web/`) against [Nielsen's 10 usability heuristics](https://www.nngroup.com/articles/ten-usability-heuristics/). Each row says what CRYPT does now, one known gap, and a screenshot from `docs/img` where one exists. Gaps are not scheduled work. Feature freeze rules in `.kiro/steering/product.md` apply, so only reliability, accessibility and copy fixes are accepted. The visual-qa checks are not loosened by this review.

| # | Heuristic | What CRYPT does now | Known gap | Screenshot |
|---|-----------|---------------------|-----------|------------|
| 1 | Visibility of system status | A polite `aria-live` announcer and event log report detected commands, rejected commands and healed limbs (`web/index.html`, `docs/ACCESSIBILITY.md`). | A limb heals only after CI is green and a human merges, so the page has no live view of that wait. | [war-room-1440x900.png](img/war-room-1440x900.png) |
| 2 | Match between system and real world | A dependency tree is a creature: one limb per package, Rotting for CVE, Possessed for CISA KEV. Commands are plain verbs (EXAMINE, ASSIGN, GRAFT, SEAL CRYPT). | The creature metaphor needs the tutorial strip to explain the limb states to a first-time CISO or VOC reader. | [card-creature.png](img/card-creature.png) |
| 3 | User control and freedom | Tutorial Skip and "Hide for good", Esc closes the bench drawer, leaves recording mode and skips the judge demo. `?theatre=off` gives a plain page. | SEAL CRYPT lasts until the page is reloaded (`web/app.js`). The page has no in-game undo. | [judge-mode-1440x900.png](img/judge-mode-1440x900.png) |
| 4 | Consistency and standards | One ranking code path serves the CLI and the browser. Buttons and focus rings follow platform defaults. | The 3D bench and the 2D page lay out the same actions differently (drawer versus inline controls). | [hero-1440x900.png](img/hero-1440x900.png) |
| 5 | Error prevention | PR payloads are dry run only and capped at five. Nothing is sent from the browser. Agents never merge. | The paste field accepts any text and only reports a problem after submit. | [paste-your-repo.png](img/paste-your-repo.png) |
| 6 | Recognition rather than recall | The tutorial strip shows the next step. A visible "Copy command" button and the skip link show the entry points. | Game verbs must be typed. The page offers no list of valid commands next to the input. | [autopsy.png](img/autopsy.png) |
| 7 | Flexibility and efficiency of use | Judge mode plays the demo in about a minute. Typing on the bare page reaches the prompt. Recording mode and the playable report serve power users. | Tutorial and judge demo are the only shortcuts. No command history or aliases are documented. | [judge-mode.png](img/judge-mode.png) |
| 8 | Aesthetic and minimalist design | The landing page was decluttered to the paste plate and the CRT. Reader mode removes effects. | The war room and graveyard views carry many panels at 390x844. | [graveyard-390x844.png](img/graveyard-390x844.png) |
| 9 | Help users recognize, diagnose and recover from errors | Failures state an action: "The plate could not be loaded. Reload the page to try again." Outages draw no creature and unchecked packages stay Rotting (`.kiro/steering/paste-flow.md`). Messages never name a person. | Messages tell the user to reload. They do not say whether a retry is likely to succeed. | [war-room-rejected-1920x1080.png](img/war-room-rejected-1920x1080.png) |
| 10 | Help and documentation | `docs/USER_MANUAL.md` is linked from the page ("How to play (manual)"). `docs/ACCESSIBILITY.md` lists the keyboard order. | The manual opens as a separate page, so there is no in-context help while typing a command. | none |

## Sources

- `web/index.html`, `web/app.js`, `web/copy.js`
- `docs/ACCESSIBILITY.md`, `docs/USER_MANUAL.md`
- `.kiro/steering/blameless.md`, `.kiro/steering/paste-flow.md`, `.kiro/steering/product.md`
