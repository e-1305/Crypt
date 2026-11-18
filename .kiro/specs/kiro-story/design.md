# Design: kiro-story

## Layout
- `docs/img/architecture.svg`: hand-authored, inline `<style>` with classes and a `prefers-color-scheme: dark` block, generic font families.
- `scripts/kiro-timeline.ts`: pure functions taking a root directory and git output (`specAddDates`, `mergeDates`, `buildTimeline`, `renderTimeline`), plus `main` guarded like `scripts/kiro-stats.ts`. PR numbers reuse `prNumbers` from `scripts/kiro-stats.ts`.
- `tests/kiro-timeline.test.ts`: a temp git repository fixture and checks on both SVGs.
- `docs/KIRO.md`: only the part above `## Specs` changes.

## Dates
- Spec date: earliest author date of any commit touching `.kiro/specs/<name>/`.
- Merge date: date of the landing commit whose subject matches `Merge pull request #N` or `Merge PR #N`.
- End: date of the HEAD commit.

## Threats
- Stale image: `--check` and a CI-runnable command.
- Hostile label text: every label is XML-escaped.
