# Design: raise-the-creature

## Pipeline

```
out/creature.json (from exhume)
   |  scripts/raise.ts (I/O: read creature, write files, run inform6)
   v
src/raise/generate.ts   generateStory(creature) --> { source, limbs }
   |                    (pure, no I/O)
   +--> out/creature.inf   Inform 6 source
   +--> out/limbs.json     { "<LIMBID>": { ecosystem, name, version } }
   v
.toolchain/Inform6/inform6 -v8 +include_path=.toolchain/inc out/creature.inf out/creature.z8
   v
scripts/play.ts <story.z8>  --> transcript.txt --> parseGameOutput --> watcher --> graft-NNN-<limb>.json
```

`src/raise/` is pure and holds no network, merge, LLM or git code (`tests/static.test.ts`). Compiler invocation and file writes live in `scripts/raise.ts`.

## Baseline (fixture)

`exhume` on `fixtures/vulnerable-npm` gives 7 limbs, 5 findings, 3 exorcised, 2 spawned, 0 unresolved. Spawned: `npm:jquery@3.4.1` (Possessed, KEV) and `npm:lodash@4.17.15` (Rotting, EPSS >= 0.1). Both are owned by `@crypt-fixture/supply-chain`. So the story has two monsters, JQUERY and LODASH.

## Limb ID algorithm

```
reserved = {EXAMINE, X, GRAFT, ASSIGN, SEAL, CRYPT, plus Inform library verbs and directions}
used = {}
for limb in creature.limbs where spawned, in file order:
    base = upper(limb.name) with every char not in A-Z removed, cut to 24
    if base == "": base = "LIMB"
    id = base; k = 0
    while id in used or id in reserved:
        k += 1
        id = base + suffix(k)             // k=1 gives B, 25 gives Z, 26 gives BA
    used.add(id)
```

The suffix sequence is `B`..`Z` then `BA`, `BB`, ... (k=1 gives `B`). Length is at most 24 + 3 = 27, so within 32. IDs never contain digits, so `@scope/pkg-2` becomes `SCOPEPKG`. The ID is a label, not a key: `out/limbs.json` is the authority and nothing parses an ID back into a name.

## Markers

| Verb | Marker line | Following game text |
|---|---|---|
| EXAMINE X | `[[CRYPT EXAMINE X]]` | description |
| GRAFT X | `[[CRYPT GRAFT X]]` | one line of prose |
| ASSIGN X | `[[CRYPT ASSIGN X]]` | `Owner: <sanitized owner>` on its own line |
| SEAL CRYPT | `[[CRYPT SEAL]]` | one line of prose |

Each marker is printed by the verb routine (`XSub`, `GraftSub`, `AssignSub`, `SealSub`) using `print "[[CRYPT GRAFT "; print (string) noun.limbid; print "]]^"`. The limb ID comes from a generated `limbid` property, a literal built only from `[A-Z]`. `GraftSub` uses `noun`, which fixes the hard-coded `ARM`.

The parser (`src/bridge/parse-output.ts`) accepts only a whole line `[[CRYPT ...]]` and now also the ASSIGN payload. The owner line is plain game text, so it is not a marker even if it were to look like one, and the sanitizer guarantees it cannot.

## Inform string escaping and sanitizer

`sanitize(text)` is one pure function used for every dynamic string:

1. Remove control characters (code < 32 or 127 to 159), so a newline in data cannot begin a new line.
2. Replace `[` with `(` and `]` with `)`, so no `[[CRYPT` can form (Inform also treats `[` as a string-escape in some contexts).
3. Replace the Inform specials: `"` with `'`, `~` with `-`, `^` with a space, `@` with `(at)`. Replacement is used instead of Inform escapes (`~` for quote, `@@64` for at) so the output has no escape syntax to get wrong.
4. Cap at 80 characters; a cut ends in `...`.

The emitter writes each string only inside a double-quoted Inform literal after sanitization. A property test asserts that for arbitrary input the result contains none of `"`, `~`, `^`, `@`, `[`, `]`, control characters, and has length at most 80.

## Parse words

Inform truncates dictionary words to 9 characters in z8, so `lodash-es` style names that share a 9 letter prefix would collide. Each object therefore uses a `parse_name` routine. It reads each word typed with `WordAddress` and `WordLength`, and compares its letters with the object's full `limbid` string, lowercase, character by character. The object declares no short `name` words that could clash. Matching one word consumes one word. This distinguishes `JQUERY` and any long, similar IDs exactly. Because the grammar gate only passes uppercase `[A-Z]{1,32}`, the game receives the ID (dfrotz folds case).

## Game grammar

```
Verb 'examine' 'x//' * noun -> Examine;
Verb 'graft' * noun -> Graft;
Verb 'assign' * noun -> Assign;
Verb 'seal' * 'crypt' -> Seal;
```

The strict TS grammar is the gate; the game grammar is only the second layer. `grammar.ts` gains `ASSIGN`:

```
command := ("EXAMINE" | "GRAFT" | "ASSIGN") " " limb | "SEAL CRYPT"
```

## Intro and summary

The intro prints `Crypt: N findings, M exorcised, K spawned` (plus `, U unresolved` when above zero), and one line per monster: ID, state, owner or `unowned` with the action `assign an owner with ASSIGN <ID>`.

## Compile

`inform6 -v8 +include_path=.toolchain/inc out/creature.inf out/creature.z8`. `scripts/raise.ts` checks the exit code and the presence of `.z8`; any failure exits non-zero.

## Watcher

`handleGraft` drops the `limb === "ARM"` test: a parsed, grammatical GRAFT for any limb writes `graft-NNN-<limb>.json` unless the seal is set. The seal check, audit log and request numbering are unchanged.

## Failure modes

| Case | Result |
|---|---|
| creature file missing, bad JSON, wrong `schemaVersion` | exit non-zero, no output files |
| zero spawned limbs | story compiles with the summary and no monsters; GRAFT says no such limb |
| hostile strings in data | sanitized; no marker can form |
| two names give one ID | suffix in creature order; deterministic |
| compiler error | exit non-zero, no `.z8` |
| unknown limb typed | plain message, no marker, no request |
| any ambiguity | change nothing (failsafe 1) |

## Property tests

| Property | Rule |
|---|---|
| `generateStory` is deterministic and pure | R1 |
| IDs are unique, match `[A-Z]{1,32}`, pass `parseCommand` | R3 |
| every spawned limb has one object, no non-spawned limb has one | R2 |
| sanitizer output has no specials, no control chars, length <= 80 | R6 |
| hostile creature source has no line starting with `[[CRYPT` | R6 |
| generated source never contains a commit author field | blameless |
| owner text in source equals creature owner or `unowned` | R2, R5 |
| `parseCommand` accepts ASSIGN limb, rejects variants | R5, failsafe 5 |
| watcher writes a request for any grammatical limb, none after seal | R9, failsafe 7 |
| compiled story, scripted session: one graft request for jquery, none after seal | R10 |
