# Design: census

## Files
- `docs/census/repos.md`: the repo list. A Markdown table `| Ecosystem | Repository | Commit SHA |`; the parser reads rows whose first cell is `npm` or `PyPI`.
- `scripts/census/aggregate.ts`: pure code. `parseRepos`, `median`, `aggregate`, `renderResults`, `leaksProjectName`. No I/O.
- `scripts/census/fetch.ts`: `repoAtSha(owner, name, sha)` downloads the manifests and CODEOWNERS files from `raw.githubusercontent.com/<owner>/<name>/<sha>/<file>` (404 is a missing file, any other failure throws) and returns a `read` function.
- `scripts/census/run.ts`: entry point of `npm run census`.
- `tests/census.test.ts`: unit and property tests for the pure code.
- `out/census/` (gitignored by `out/`): `osv-cache/`, `<owner>__<name>.json` (full creature per repo), `per-repo.json` (counts per repo).

## Why no `git clone`
The issue asks for a shallow clone at the SHA. Fetching only the root manifests at the SHA reads the same bytes, needs no checkout (so no hooks, filters or submodules can run), and works where only HTTPS access to `raw.githubusercontent.com` exists. exhume itself reads exactly these files and nothing else.

## Flow of `run.ts`
1. Read `repos.md`; require 20 rows.
2. Load `data/feeds/kev.json` and `epss.csv`; abort if missing or unparsable.
3. For each repo: `buildCreature({ repo, cacheFs, cacheDir: "out/census/osv-cache", kev, epss, lookup: osvLookup(fetch) })`. Write the creature to `out/census/`. Keep `counts` and the unowned limb count.
4. `aggregate` the per-repo numbers, `renderResults`, check `leaksProjectName` is false, then write `docs/census/RESULTS.md`.

## Metrics
- findings % = sum(findings) / sum(limbs); exorcised % = sum(exorcised) / sum(findings); spawned % = sum(spawned) / sum(findings); unresolved is shown separately.
- possessed = sum(possessed); unowned % = limbs with `owner === "unowned"` / sum(limbs).
- median before = median of per-repo `findings`; after = median of per-repo `spawned`.

## Static rules
`tests/static.test.ts` scans `scripts/`: no merge wording or calls. The census code has none.
