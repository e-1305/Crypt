# Contributing to CRYPT

CRYPT turns a dependency tree into a creature and prepares dry-run fix payloads. Small, careful changes are welcome.

## Setup

Node.js 20 or newer.

```bash
npm ci
npx vitest run       # the full test suite, must pass before a PR
npm run build:site   # builds the web player and report pages
```

## How `.kiro/` is used

- `.kiro/steering/` holds the rules that always apply (product, tech, failsafe, blameless copy, SLA policy, paste flow, review rules). Read them before you change anything. They override personal taste.
- `.kiro/specs/<feature>/` holds one folder per feature with its requirements, design and tasks. Add or update the spec first, then the code, then the test.
- `.kiro/hooks/` and `.kiro/agents/` hold the save/stop hooks and custom agents. Hooks run the failsafe guard and related tests on save.
- Do not run `kiro:stats --write` or `kiro:timeline` in a PR. The `stats` workflow regenerates them on `main`.
- Any third-party code, tool or dataset you add goes in `docs/ATTRIBUTION.md` with its license.

## Safety rules

These come from `.kiro/steering/failsafe.md` and are not negotiable.

- CRYPT never merges. The code must not contain a merge call. A human merges every PR.
- Dry run by default. Nothing is written or opened unless the user asks for it explicitly.
- On any error, timeout or ambiguity, change nothing. A limb stays rotting.
- Never push to the default branch. One dependency per PR, at most 5 PRs per raid.
- Scoring and ranking are deterministic code, never an LLM.
- Failure copy is blameless: it never names or blames a person.

## Adding a lockfile parser

Existing parsers live in `src/exhume/lockfile.ts`: `parsePackageLock` (npm) and `parseRequirements` (pip).

1. Add `parseYourLockfile(text: string, manifest: string): Limb[]` next to them. Return limbs sorted the same way the others do (`compareLimbs`).
2. Enforce `MAX_LOCKFILE_CHARS` and `MAX_LOCKFILE_PACKAGES`. Throw `LockfileError` (or `LockfileTooLargeError`) on bad input. Never return a partial result.
3. Call it from `src/exhume/creature.ts`, where `parsePackageLock` and `parseRequirements` are used.
4. Add a fixture under `tests/fixtures/` and a test next to the existing lockfile tests. Cover a valid file, a malformed file and an oversized file.
5. Keep ecosystems in scope in line with `.kiro/steering/tech.md` (npm and pip today) and update the docs if that changes.

## Pull requests

- One focused change per PR, with a test.
- Run `npx vitest run` and make sure it passes.
- Keep existing element ids and test hooks. Respect `prefers-reduced-motion` and high contrast, and keep idle animation at 2 frames per second or fewer.
