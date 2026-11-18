# Requirements: graft-quality

Goal: a graft that a judge sees after pasting a real repository is correct, quiet and honest (issue #81, CTO review of PR #80 on OWASP/NodeGoat). Follows `.kiro/steering/failsafe.md`, `blameless.md`, `paste-flow.md` and `sla-policy.md`. Builds on `necromancer`, `exhume-and-rank` and `first-60-seconds`. A correctness fix, in scope of the Nov 25 feature freeze.

Terms: **Package** is one npm name. **Copy** is one installed version of a package in the lockfile (one limb in creature.json). **Group** is all copies of one package. **Direct** means the root `package.json` declares the package; **transitive** means only other packages pull it in.

## G1 The fixed version clears every advisory of the package
1. `chooseVersion` SHALL be given every known OSV advisory for the package (all versions), not only those attached to one copy.
2. The chosen version SHALL lie outside the affected ranges and outside the explicit `versions` lists of every advisory given.
3. For a group, the chosen version SHALL be above every affected copy.
4. WHEN the package-wide advisory list cannot be read completely, the graft SHALL change nothing (web: "no-fix"; CLI: ERROR).
5. Property test: for any advisory set, `chooseVersion` never returns a version that any advisory for the package marks affected.

## G2 Major bumps are flagged
1. `breaking` SHALL be true for a higher major, and for a higher minor while the version is 0.x.
2. A breaking payload SHALL show "⚠ major: review carefully" in the title and the body.
3. A non-breaking graft (jquery 3.4.1 to 3.5.0) SHALL stay unflagged.

## G3 One graft per package
1. Copies SHALL be grouped by package for the plate, the ranked list and the payloads: `lodash ×4 versions` with the versions listed.
2. The Necromancer SHALL open one PR per package. A graft for another copy of a package that already has a PR SHALL give PR_EXISTS.
3. The PR title and body SHALL list every installed version that the graft replaces.
4. creature.json keeps one limb per copy (ranking, counts and the game need that). Grouping is presentation only (`src/exhume/group.ts`).

## G4 Transitive dependencies use overrides
1. A package that is not in `package.json` SHALL be grafted with `"overrides": { "<name>": ">=<fixed>" }` and every lockfile copy below the fixed version SHALL be rewritten.
2. The PR body SHALL say: "transitive: forced via overrides; check the parents' compatibility".
3. A direct package SHALL keep the version bump in `package.json`.
4. Every list row and payload SHALL be labelled direct or transitive.
5. WHEN an existing `overrides` entry cannot be extended safely, or a copy would change its own dependencies, the graft SHALL change nothing.

## G5 Copy
1. "owner unowned" SHALL read "no owner yet" in every message a person reads. The data value `unowned` in creature.json is unchanged.
