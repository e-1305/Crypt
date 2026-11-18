# Design: c1-kiro-md-final

## Layout
- `scripts/kiro-stats.ts`: pure counting functions that take a root directory (so a test can use a temp fixture), plus `main`. Follows the pattern of `scripts/hooks/kiro-trace.ts`: a marked block, `--write` splices it.
- `tests/kiro-stats.test.ts`: counting functions on a temp fixture, and the stable items in the block against the repository.
- `docs/KIRO.md`: prose plus the numbers block. Appendix keeps the captured runs and the `kiro-trace` block.
- `.github/workflows/ci.yml`: job `kiro-docs`.

## Counting
- Specs: directories in `.kiro/specs`. Tasks: lines matching `- [ ]` or `- [x]` in each `tasks.md`.
- Hooks, agents: `*.json` files. Steering: `*.md` files.
- Property tests: call sites of `fc.assert(`, `fc.property(`, `fc.asyncProperty(` and `test.prop(` in `tests/*.test.ts`.
- Tests: `vitest run --reporter=json` totals (passed, skipped, files). This runs the suite, so it is opt out with `--no-tests` for the fast path.
- PRs: unique numbers from `Merge pull request #N`, `Merge PR #N` and `(#N)` subjects in `git log`. `gh` is not used because its auth is not available in every environment.

## Link check
Relative markdown links, backticked repository paths and `\b[0-9a-f]{7,40}\b` inside backticks that `git cat-file -e` resolves. External URLs are not fetched. Globs and templates are skipped.

## Threats
- Stale numbers: the block is regenerated and a test compares stable items.
- Shallow CI clone: the CI job uses `fetch-depth: 0`.
