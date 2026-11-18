# Requirements: kiro-writeup-honesty

Goal: the Kiro write-up says exactly what was and was not observed, no more and no less. Issue #96, after #93 and #94. Follows `.kiro/steering/blameless.md` and `product.md` (proof, copy).

Terms. **Workspace root** is the folder a Kiro session loads `.kiro/` from. **Web layout** is the Kiro Web layout found in #94: the session workspace root is `/projects/sandbox` and the repository is cloned into a subfolder, so the repository's `.kiro/` is probably not loaded as session configuration. This is an inference from the layout and from the absence of any hook line, not something Kiro reported.

## W1 Hooks
1. `docs/KIRO.md`, `docs/DEVPOST.md`, `docs/BLOG.md` SHALL say the hooks are configured (7 hook files, `PostFileSave` and `PostToolUse` twins, `Stop`, `SessionStart`), checked in CI, and run by hand (5 `manual` lines).
2. They SHALL say no hook was observed firing in Kiro Web, and name the Web layout as the probable cause, marked as probable.
3. They SHALL say a desktop IDE or CLI session with the repository as workspace root is where the hooks apply, and that real runs there would appear in the generated stats block.

## W2 Steering
1. The write-up SHALL NOT claim steering was auto-loaded in Kiro Web sessions.
2. It SHALL state what is verifiable: every Kiro issue told the agent to read `.kiro/steering/`, and the rules show in code and tests.
3. It SHALL cite three examples: no merge path with the CI guard (`failsafe.md` rule 2), owners from CODEOWNERS only (`blameless.md`), deterministic ranking (`failsafe.md` rule 4, `sla-policy.md`).

## W3 Specs
1. The write-up SHALL say spec-driven development was used for real in Web sessions and cite spec folders with the requirements, design, tasks, commit trail.

## W4 Diagram
1. The hooks box in `docs/img/architecture.svg` SHALL say where hooks apply (IDE/CLI) and that Web runs were not observed. Text only.

## W5 Numbers
1. Every number in the docs SHALL come from `npm run kiro:stats -- --write`. No number is typed by hand.
2. No file contains an em dash.
