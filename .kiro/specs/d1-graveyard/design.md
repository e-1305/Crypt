# Design: d1-graveyard

## Layers
**Pure (`src/graveyard/`):** no file, clock or network access. The clock arrives as `now`. Every reader is tolerant: junk input gives `null` or an empty list, never an exception.
- `model.ts`: `buildTomb`, `buildTombs`, `limbRisk`, `slaState`, `glowOf`, `sizeOf`, `ownerTeamOf`, `sortTombs`, `filterTombs`, `ownerTeams`, `layoutTombs`, `parseGraveyard`, `serializeGraveyard`, and the builders `fromExhume` (Input A and C) and `fromSnapshot` (Input B). It imports nothing from node, so `tsconfig.web.json` compiles it to `web/js/graveyard/model.js` for the page.
- `sample.ts`: `SAMPLE_REPOS` with a fixed scan time and `SAMPLE_NOW`, used by `--sample`, tests and visual QA.

**Glue (`scripts/cli/graveyard.ts`):** reads the token from the named environment variable, lists repositories through `makeCall` from `scripts/github-client.ts` (GET only, audit hook, token redacted), reads `package-lock.json` and the first CODEOWNERS file through the contents API (blob API for large files), runs `buildCreature` with the feeds from `data/feeds`, converts with `fromExhume` and writes `out/graveyard.json`. OSV calls use a separate fetch that never gets the token. Dependencies (`cwd`, `io`, `now`, `env`, `fetchImpl`, `osvFetchImpl`, `feedsDir`, `out`) are injectable like `scripts/cli/gazette.ts`.

**Page (`web/graveyard/`):** `graveyard.html`, `graveyard.js`, `graveyard.css`. It imports the compiled model. Canvas night scene (moon, fog, phosphor green) with a 2D list fallback and a hidden table.

## Stored shape (`graveyard.json`)
`{schemaVersion: 1, source: "live"|"census"|"cli", org, repos: [{repo, scannedAt, scannedLimbs, ownersKnown, limbs: [{name, state, kev, epss, owner}]}]}`. Only findings are listed. The tomb is computed from this record and a `now`, so the SLA state is live when the page is opened later.

## Decisions
- **Raw records, not tombs, in the file.** SLA state depends on the current time. Storing the inputs keeps the file honest after a day.
- **A single `@user` owner counts as no owner.** CODEOWNERS can name people. The blameless rule shows teams only.
- **No ranking helpers.** `sortTombs` takes a key from the user. No exported name contains rank, top or worst (tested).
- **Skipped is not Healthy.** A repo whose lockfile cannot be read is left out and counted in the CLI summary.
- **Seeded layout.** A tomb keeps its position and tilt when other repos change in the row, so a screen recording is repeatable.
