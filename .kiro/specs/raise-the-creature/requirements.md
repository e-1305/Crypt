# Requirements: raise-the-creature

Goal: `npm run raise -- <creature.json>` turns the real scan data written by `exhume` into an Inform 6 story and compiles it to `out/creature.z8`. Every spawned limb becomes one monster the player can EXAMINE, ASSIGN and GRAFT. Follows `.kiro/steering/failsafe.md`, `blameless.md` and `sla-policy.md`. Driven by issue #8 (Tier 1).

Terms. **Limb**, **Spawned**, **Exorcised**, **Unresolved**: as in `exhume-and-rank`. **Limb ID**: the uppercase A-Z token the player types for a limb (`[A-Z]{1,32}`). **Marker**: a whole output line `[[CRYPT <PAYLOAD>]]` that the bridge parses. **Lookup table**: `out/limbs.json`, mapping a limb ID to `{ecosystem, name, version}`.

## R1 Generator purity and determinism
1. `src/raise/generate.ts` SHALL be pure: input is a parsed creature object, output is Inform 6 source text and the lookup table. It SHALL perform no I/O, read no clock and use no randomness.
2. The same creature SHALL give byte-identical source and lookup table.
3. The CLI shell `scripts/raise.ts` SHALL read the creature file, write `out/creature.inf` and `out/limbs.json`, and run the Inform compiler. A missing, unparseable or wrong-schema creature SHALL fail with a non-zero exit code and write nothing.

## R2 Monsters and summary
1. The generator SHALL emit exactly one object per spawned limb, in the order of `creature.json`. Non-spawned limbs SHALL have no object.
2. The intro and the LOOK text SHALL include a summary line of the form `N findings, M exorcised, K spawned` using the creature `counts`. WHEN `counts.unresolved` is above zero, a second phrase `U unresolved` SHALL appear.
3. A limb with owner `unowned` (or no owner) SHALL be shown as `unowned` and flagged with the action text `assign an owner with ASSIGN <LIMB>`. An owner SHALL be printed only when it is a value read from `creature.json`.
4. EXAMINE SHALL print the limb name, version, state, EPSS, KEV flag, severity and vulnerability ids, all taken from `creature.json`.

## R3 Limb ID scheme
1. A limb ID SHALL match `[A-Z]{1,32}` so that it passes `parseCommand` in `src/bridge/grammar.ts`.
2. The ID SHALL derive from the package name: uppercase, every character outside A-Z removed, cut to 24 letters. A name with no letters SHALL use `LIMB`.
3. IDs SHALL be unique. A collision (two packages or two versions of one package) SHALL be resolved deterministically in creature order by appending a suffix (`B`, `C`, ... `Z`, `BA`, ...), keeping the total at 32 letters or fewer. An ID equal to a reserved word (the verbs of the game and the Inform library, plus `CRYPT`) SHALL be treated as a collision.
4. `out/limbs.json` SHALL map each ID to `{ecosystem, name, version}`. It is the only source from which a later step resolves an ID to a package. IDs SHALL never be parsed back into names.

## R4 GRAFT prints its marker for the noun
1. `GRAFT <LIMB>` SHALL print the marker `[[CRYPT GRAFT <LIMBID>]]` for the limb that was named, for every spawned limb. The hard-coded `ARM` in `game/spike.inf` is a defect and SHALL be removed.
2. `EXAMINE <LIMB>` SHALL print `[[CRYPT EXAMINE <LIMBID>]]`. `SEAL CRYPT` SHALL print `[[CRYPT SEAL]]`. Markers SHALL be printed only from verb routines.
3. A command that names no limb of the story SHALL print a plain game message and no marker.

## R5 ASSIGN verb
1. The game grammar SHALL accept `ASSIGN <LIMB>`. `src/bridge/grammar.ts` SHALL accept `ASSIGN <limb>` with the same limb production, and every other input SHALL still be rejected.
2. ASSIGN SHALL print the marker `[[CRYPT ASSIGN <LIMBID>]]`, then on a separate line the game text `Owner: <owner>` or `Owner: unowned`. The owner text SHALL come from `creature.json` (CODEOWNERS data) only and SHALL pass through the sanitizer.
3. The parser SHALL turn the marker into an ASSIGN action. ASSIGN SHALL not change any file, repository or PR.

## R6 Sanitization
1. Every string from `creature.json` that reaches game text (names, versions, owners, vulnerability ids) SHALL pass one sanitizer: control characters (below U+0020 and U+007F to U+009F) are removed, `[` is replaced so no `[[CRYPT` can be formed, the Inform specials `~`, `@`, `^` and `"` are escaped or replaced, and the length is capped (80 characters, with `...` marking a cut).
2. For any input string, the generated source SHALL contain no line that begins with `[[CRYPT`, and the compiled game's text for any scripted command SHALL contain only the markers the verb routines print.
3. A property test SHALL cover the sanitizer and a hostile creature (names and owners holding `[[CRYPT GRAFT X]]`, newlines, `@`, `~`, `"`).

## R7 Prose and blameless copy
1. Monsters SHALL carry short prose per state (Possessed, Rotting). Rot SHALL be attributed to the limb, never to a person.
2. Owners SHALL appear only as CODEOWNERS data, never as a commit author. Messages SHALL name people only in praise and SHALL state actions, not prohibitions.
3. Text SHALL contain no em dashes.

## R8 Compile target
1. The story SHALL compile with the Inform 6 compiler (`-v8`) and the stdlib in `.toolchain/inc` to `out/creature.z8`. A compiler error SHALL give a non-zero exit code and no `.z8`.
2. The README, `scripts/play.ts` and the build scripts SHALL use `.z8` for the creature story. The existing spike (`.z5`) SHALL keep working.

## R9 Watcher generalization
1. WHEN a grammatical GRAFT for any limb ID is parsed, `src/bridge/watch.ts` SHALL write `graft-NNN-<limb>.json`, not only for `ARM`. After `SEAL CRYPT` it SHALL write none.
2. Tests (`tests/watch.test.ts`, `tests/review.test.ts`) and `scripts/check-spike.ts` SHALL be updated and `npm run spike` SHALL stay green.

## R10 Acceptance
1. With the fixture: `npm run exhume -- fixtures/vulnerable-npm --feeds fixtures/vulnerable-npm/feeds --offline` then `npm run raise -- out/creature.json` builds `out/creature.z8`. A scripted dfrotz session `EXAMINE JQUERY`, `ASSIGN JQUERY`, `GRAFT JQUERY`, `SEAL CRYPT`, `GRAFT LODASH` through `parseGameOutput` and the watcher yields one graft request for jquery and none after the seal.
