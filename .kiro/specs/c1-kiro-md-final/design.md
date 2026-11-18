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
- PRs: unique numbers from `Merge pull request #N` and `Merge PR #N` subjects in `git log`. `(#N)` suffixes are issue references here and are not counted. `gh` is not used because its auth is not available in every environment.

## Link check
Relative markdown links, backticked repository paths and backticked tokens that are exactly 7 to 40 hex characters, and `/commit/<sha>` URLs, that `git cat-file -e` resolves. External URLs are not fetched. Globs and templates are skipped.

## Stats blocks in DEVPOST.md and BLOG.md
- `renderDocStats` builds one sentence fragment without a date, so an unchanged repository gives an unchanged file. `spliceDocStats` replaces the text between every `<!-- stats:start -->` / `<!-- stats:end -->` pair and returns null when there is no pair or one marker is unmatched.
- `--write` refreshes the blocks after KIRO.md. With `--no-tests`, or when vitest totals are unavailable, it leaves the blocks alone rather than guess.
- `--check-docs` runs vitest for `numTotalTests`, renders the expected text and compares it with each file. It runs in `kiro-docs`, which has no toolchain, so only the toolchain-independent total is compared.

## Threats
- Stale numbers: the block is regenerated and a test compares stable items.
- Shallow CI clone: the CI job uses `fetch-depth: 0`.
