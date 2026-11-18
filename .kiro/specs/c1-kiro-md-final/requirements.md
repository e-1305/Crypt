# Requirements: c1-kiro-md-final

Goal: `docs/KIRO.md` is the write-up a judge reads in three minutes, with every number produced by a script. Issue #65 (EPIC C, C1). Follows `.kiro/steering/blameless.md` and `failsafe.md`.

Terms. **Numbers block** is the text between `<!-- kiro-stats:begin -->` and `<!-- kiro-stats:end -->` in `docs/KIRO.md`. **Stable items** are specs, hooks, steering files and agents.

## K1 Stats script
1. `npm run kiro:stats` SHALL print the generation date (UTC) and, for each item, its count and the command or file that produces it: specs, spec tasks (ticked and total), hooks, steering files, custom agents, property tests (call sites and files), tests (total and files), PRs.
2. The PR count SHALL come from `git log` landing-commit subjects (`Merge pull request #N`, `Merge PR #N`), deduplicated. `(#N)` suffixes are not counted because they name issues in this repository, and the output SHALL name that source.
3. When a source is unavailable the script SHALL print `unavailable` and name the source, and SHALL NOT guess a number.
4. `--markdown` SHALL print the numbers block as a table. `--write` SHALL refresh the block in `docs/KIRO.md`.

## K2 Page
1. `docs/KIRO.md` SHALL have the sections Specs, Steering, Hooks, Custom agents, MCP (consumed and produced), Property-based tests and CI guard jobs, then an appendix.
2. The page before the appendix SHALL stay within the limit enforced by `tests/devpost-docs.test.ts`.
3. Each hook entry SHALL give a real catch from the captured runs or history, or say that it caught nothing.
4. The page SHALL carry no hand-typed counts. Counts come from the numbers block.
5. The process note SHALL list the commits made by the AI CTO by SHA and state the selection rule and its limits.

## K3 Checks
1. `npm run kiro:stats -- --check-links` SHALL fail when a relative link, a `.kiro/`, `src/`, `tests/` or `scripts/` path, or a commit SHA named in `docs/KIRO.md` does not resolve.
2. A test SHALL fail when the numbers block disagrees with the current count of stable items.
3. CI SHALL run both on a full-depth checkout.
