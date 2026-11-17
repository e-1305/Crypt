# Requirements: art-direction

Goal: give CRYPT a look. The creature is a 19th-century anatomical plate drawn in ASCII, shown on a phosphor-green CRT (issue #18). Follows `.kiro/steering/blameless.md` and `failsafe.md`. Touches only `web/`, prose strings in `src/raise/`, `docs/`, the new `src/render/plate.ts`, `scripts/plate.ts`, and the minimum in `scripts/web.ts` needed to serve `creature.json`.

Terms. **Plate** is the ASCII picture of the creature. **Slot** is a body part on the figure that can carry one limb. **Healed** is a limb that a human landed a fix for and that reraise turned Healthy.

## A1 Plate renderer
1. `renderPlate(creature, options)` in `src/render/plate.ts` SHALL be a pure function from `creature.json` data to a string. Same input gives the same bytes. No fs, clock, random or network.
2. Every line SHALL be at most 80 columns, for any input, including zero limbs and more limbs than slots.
3. The header SHALL read `PLATE I. — THE CREATURE OF <repo name>`. The plate SHALL show a caption with the creature's deterministic name (A5).
4. The figure SHALL be a stitched humanoid. Each spawned limb SHALL occupy a slot, in rank order, with a leader line to a label `<name> <version> — <STATE>`. Limbs beyond the slots SHALL be listed under the figure.
5. Limbs that are Healthy or exorcised (not spawned) SHALL show as faint stitches. The footer SHALL give counts per state.
6. Data strings SHALL lose control characters and non-ASCII characters before they reach the plate.
7. The plate SHALL never show an owner. Rot belongs to the limb.

## A2 States are not told by color alone
1. Possessed: `#` texture and the word POSSESSED. Rotting: `%` and ROTTING. Healed: clean outline (no texture) and HEALED. Healthy: `.`.
2. A legend line SHALL list the four markers.

## A3 Healed representation
1. A limb SHALL count as healed when `state` is `Healed` or `healed` is `true`. `applyHealed` in `src/reraise` is unchanged, so after reraise a healed limb is plain Healthy in `creature.json`.
2. The web page SHALL remember which limbs it has seen Possessed or Rotting (localStorage). A remembered limb that is Healthy on a later load SHALL show as HEALED.

## A4 Web
1. The page SHALL show the plate above the game pane and load `game/creature.json` from its own origin.
2. WHEN a limb becomes HEALED, its segment SHALL flash for a short time with CSS only. Possessed limbs SHALL have a subtle CSS glitch.
3. `prefers-reduced-motion: reduce` SHALL turn off every animation.
4. Look: phosphor green on near black, scanlines, slight bloom, one system monospace stack. No font file is added.
5. A toggle button (`aria-pressed`) SHALL switch to high-contrast / screen-reader mode: plain text, no effects. The choice SHALL persist in localStorage.
6. An `aria-live` region SHALL announce game events (detected commands and healed limbs).
7. The plate SHALL be exposed to assistive technology with a text summary of every limb and its state.
8. Lighthouse accessibility score SHALL be at least 95. The score is recorded in `docs/ACCESSIBILITY.md`.

## A5 Creature name
1. `creatureName(repo)` SHALL return a name such as `Wretch-7`, seeded only from the repo name.

## A6 Prose
1. Game text SHALL be short, eerie and clear. UI copy states actions, never prohibitions. People appear only as surgeons.
2. Markers `[[CRYPT ...]]` and the grammar are unchanged.
