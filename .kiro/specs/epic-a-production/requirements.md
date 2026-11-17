# Requirements: epic-a-production

Goal: make CRYPT production ready. Driven by issue #25 (EPIC A). One branch per milestone, each rebased on `main`. Follows `.kiro/steering/failsafe.md` and `blameless.md`. Nothing here publishes to npm, and no workflow merges anything.

Terms. **CI**: GitHub Actions on this repository. **Guard**: `scripts/ci/failsafe-guard.sh`. **Toolchain**: Inform 6, its library and dfrotz. **Demo creature**: a pre-built creature served by the Pages site.

## A1 Continuous integration
1. `.github/workflows/ci.yml` SHALL run on every pull request and on every push to `main`.
2. Job `test` SHALL run on ubuntu-latest with Node 22: `npm ci`, `npm run typecheck`, the toolchain build, `npx vitest run`, `npm run spike`, `npm run raise:check`, `npm run necromancer:check` and the offline raid script.
3. The toolchain directory SHALL be cached with `actions/cache`, keyed on the hash of `scripts/setup-tools.sh`.
4. Job `failsafe-guard` SHALL run separately and without the toolchain. It SHALL fail when `src/` or `bin/` contain a merge endpoint, `gh pr merge` or a `git blame` call, or when `.kiro/` is git-ignored.
5. WHEN `CRYPT_NUM_RUNS` is set, property tests SHALL use at least that many runs. WHEN it is unset, the local defaults SHALL not change. CI SHALL set it to 1000.
6. The workflow SHALL request `contents: read` only, and pin actions to a major version.
7. `scripts/ci/raid-offline.sh` SHALL run a scripted offline raid on the fixture and assert exit code 0 and a payload in `out/prs/`.
8. The README SHALL show the CI badge at the top.

## A2 Kiro hooks
1. `.kiro/hooks/` SHALL hold hook definitions in the documented Kiro format (`version: v1`, `trigger`, `matcher`, `action`) for five saves: `src/**/*.ts` runs the related tests, `src/necromancer|inquisitor|mcp` runs the failsafe check, `.kiro/specs/*/tasks.md` refreshes the traceability table, `package.json` reminds to attribute new dependencies, `src/raise` and `web/` run the blameless copy check.
2. Hooks SHALL be documented in `docs/KIRO.md`, each with its trigger, action and a real example of what it caught or saved.
3. Command hooks SHALL only read and report. They SHALL never write, commit or call the network. Agent hooks MAY ask the agent to edit `docs/` files and SHALL never commit.
4. Every hook script SHALL have tests that pass on clean input and fail on a violation.

## A3 GitHub Pages demo
1. A workflow SHALL build `web/` with a demo creature from the fixture and deploy it to GitHub Pages on push to `main`.
2. The workflow SHALL use `pages: write` and `id-token: write` only on the deploy job.
3. The demo SHALL work offline from the deployed files. The CORS result for any fetch the player makes SHALL be recorded in `design.md`.
4. The demo creature SHALL be built from `fixtures/vulnerable-npm`, never from a scanned repository.

## A4 npm packaging
1. `npm pack --dry-run` SHALL list exactly the files in the `files` whitelist, and SHALL exclude `web/`, `.toolchain/` and `out/`.
2. A packed tarball installed in a clean directory SHALL answer `crypt --help` and `crypt --version`.
3. The package SHALL stay `private: true` until a human removes it. No step publishes.
4. `docs/ATTRIBUTION.md` SHALL list every new dependency and action.
