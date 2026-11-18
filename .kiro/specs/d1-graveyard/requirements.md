# Requirements: d1-graveyard

Goal: a CISO or a VOC wall shows every repository of an organisation at once, one tomb per repository (issue #111, Epic D, Season 2). The page is a big-screen night graveyard: a tomb per repo, a glow for Possessed limbs, ghosts for limbs with no owner, an SLA state per tomb. Follows `.kiro/steering/failsafe.md`, `blameless.md`, `sla-policy.md` and `product.md`.

Scope: `.kiro/specs/d1-graveyard/`, `src/graveyard/` (pure model), `scripts/cli/graveyard.ts`, `web/graveyard/` (page), the Bench drawer link and the landing link, tests, and the unavoidable registration points (`src/cli/parse.ts`, `src/cli/help.ts`, `scripts/cli/main.ts`, `scripts/build-site.ts`, `tsconfig.web.json`, `scripts/ci/visual-qa.mjs`, docs stats blocks).

## Data inputs
- **A. Live scan in the browser.** The user pastes a list of public GitHub repositories. Each is scanned with `liveExhume` (npm, `package-lock.json`). GitHub allows 60 unauthenticated requests per hour, so the page queues the repositories, shows progress, stops cleanly at the limit with the time to retry, and keeps finished results in `sessionStorage` (cache key per repo, nothing else is stored).
- **B. Census prebuilt.** The 20 Census repositories come from `web/gallery-data/*.json` at build time. Each repo shows its own public data only. Owners were dropped from those snapshots, so owner teams and ghosts are not shown for them.
- **C. CLI.** `crypt graveyard --org <org> --token-env GITHUB_TOKEN` lists the org repositories with read-only GET calls, exhumes each `package-lock.json` and writes `out/graveyard.json`. The page loads that file with a file picker. Private orgs stay local: the file is written to this machine only and the page reads it in the browser without uploading it.

## Model (`src/graveyard/`)
1. One **tomb** per repository: slug, exploitable risk, Possessed count, glow, SLA state, ghost count, owner team, size bucket.
2. **Exploitable risk** is the sum over the open findings of `(KEV ? 10 : 1) x EPSS`, with EPSS floored at 0.01 so an open finding never counts 0. It is monotonic in EPSS and a KEV limb always counts ten times a non-KEV limb with the same EPSS.
3. **Glow** from the Possessed count: 0 none, 1 faint, 2 to 3 strong, 4 or more blazing.
4. **SLA state** follows `sla-policy.md`, counted from the supplied scan time and a supplied `now`: Possessed (in KEV) 48 hours, EPSS >= 0.1 the 14-day sprint, anything else has no SLA. A window is `at-risk` from 75% used and `breached` at 100%. The tomb shows the worst state of its findings: `ok`, `at-risk`, `breached`.
5. **Ghosts** are the findings that have no CODEOWNERS team. A single `@user` is not a team and counts as no owner. When the source has no owner data (Input B) ghosts are not counted.
6. **Owner team** is the CODEOWNERS team that owns most findings of the repo, else `no owner yet`. Never a person.
7. **Size bucket** from the number of dependency copies read: small < 50, medium < 200, large < 800, huge.
8. **Layout** is deterministic: grid position in the chosen order, nudged by a hash of the slug. No randomness, no clock.
9. `out/graveyard.json` is versioned (`schemaVersion: 1`). The parser validates, drops unknown keys and invalid records, and returns `null` for other versions. `serialize` then `parse` is lossless.

## Honesty and safety
1. **Aggregate safe.** Each tomb shows that repository's own public data. There is no cross-repo ranking table and no label such as "worst repo" anywhere (code, page, copy). The default order is alphabetical by repo. Sort by risk, by SLA state and filter by owner team are controls the user chooses.
2. **Blameless.** Owners come from CODEOWNERS only, as a team. No git history is read. Failure is attributed to limbs (packages) and counted per repo. Copy states the action to take ("Open the repo and graft the Possessed limb"), never a prohibition and never a person.
3. **Fail-safe.** Any error leaves the state unchanged: a repo that could not be read shows "not scanned", never Healthy. The CLI writes nothing when it stops. The CLI is read-only (GET only), has no merge or write call, honours `SEAL CRYPT` and audits every request to `crypt-audit.log`.
4. **Token handling.** The token is read from the environment variable named by `--token-env` only. It is never printed, logged, written or sent to OSV. Errors are redacted.
5. **Rate limit.** 60 requests per hour for Input A: queue, progress, a clear stop with a retry hint, `sessionStorage` cache.
6. **Recording mode.** A `?record=1` view hides controls, enlarges text for a screen recording and runs the ambient animation from a fixed seed.
7. **Accessibility.** A 2D list view is a fallback for the canvas (and for `prefers-reduced-motion`). A visually hidden table with every tomb is always present for screen readers. Page copy uses `textContent` only.

## CLI contract
`crypt graveyard --org <org> --token-env GITHUB_TOKEN [--out out/graveyard.json] [--repos a/b,c/d] [--sample]`
- Missing `--org`, missing `--token-env` or an unset variable: an actionable error, a non-zero exit and no file.
- `--sample` writes a deterministic file and needs no token.
- At most 100 repositories per run. Archived repositories are skipped. Repositories without a `package-lock.json` are counted as skipped, not Healthy.
- KEV and EPSS feeds come from `data/feeds` (run `npm run feeds:update`).

## Acceptance
- `npx vitest run tests/graveyard.test.ts tests/graveyard-cli.test.ts` passes.
- `crypt graveyard --sample --out /tmp/g.json` writes a file the parser accepts.
- `crypt graveyard --org x` without `--token-env` exits non-zero with an action message and writes nothing.
