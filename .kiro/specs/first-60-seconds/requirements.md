# Requirements: first-60-seconds

Goal: a judge or visitor sees a real creature for their own repository within 60 seconds of opening the page (issue #78). Follows `.kiro/steering/failsafe.md`, `blameless.md`, `sla-policy.md` and `product.md`. Builds on `web-player`, `visual-qa-1` and `exhume-and-rank`.

Terms: **Live exhume** is the exhume logic running in the browser on a pasted public GitHub repository. **Feed snapshot** is the compact KEV and EPSS data shipped with the site. **Dry-run payload** is the pull request the Necromancer would open for a spawned limb. **Gallery** is the committed census snapshots. **Demo crypt** is the built-in `crypt-demo` creature.

## F1 Declutter
1. The landing page SHALL show, above the fold, one headline, the install command, the paste-your-repo form and the plate.
2. Secondary panels (event log, 3D bench controls, sound, recording) SHALL move into a "Bench" drawer that is closed by default.
3. The Bench drawer SHALL be keyboard operable and SHALL NOT hide any control from screen readers while open.

## F2 Three-step onboarding
1. The onboarding SHALL have three steps: paste a repository, read the plate, open the dry-run pull request.
2. WHEN the visitor completes a step, the page SHALL mark it done and point to the next one.
3. The onboarding SHALL be skippable and SHALL NOT block the game.

## F3 Paste your repo
1. WHEN the visitor submits a GitHub URL, the page SHALL run a live exhume in the browser and render the plate, the ranked limb list and the owners.
2. The URL SHALL be parsed by `src/web/repo-url.ts`. Anything else than an https `github.com/<owner>/<repo>` URL SHALL give a clear message and no request.
3. The page SHALL state that the web version reads npm projects only (`package-lock.json`, lockfileVersion 2 or 3).
4. The page SHALL show the date of the feed snapshot used for ranking.
5. The live exhume SHALL use the same parser, OSV lookup, ranking, counting and CODEOWNERS code as the CLI, so the same inputs give the same ranking.
6. Ranking SHALL stay deterministic and SHALL NOT call an LLM.

## F4 Dry-run payloads
1. For each spawned limb (Possessed, or EPSS at or above 0.1) the page SHALL show the pull request the Necromancer would open: title, branch, body and files.
2. The version SHALL be chosen by the same deterministic `chooseVersion` the Necromancer uses, from OSV advisory ranges.
3. Every payload SHALL be labelled: dry run: run `npx @e-1305/crypt raid <repo> --live` to open it for real.
4. The page SHALL show at most 5 payloads (one dependency per payload).
5. WHEN no fixed version can be chosen or an advisory cannot be fetched, the page SHALL say so for that limb and SHALL NOT invent a version.
6. Nothing SHALL be sent to GitHub. The page SHALL contain no merge call.

## F5 Fail-safe errors
1. WHEN a fetch or parse fails (404, malformed JSON, unsupported lockfile, non-npm repository, rate limit 403 or 429, network error, OSV outage, missing feed snapshot), the page SHALL show a message that names the cause and the next action.
2. In every error case the page SHALL render no plate and SHALL NOT mark any limb Healthy. Unknown is not clean.
3. A limb whose OSV answer is missing SHALL be Rotting with an unknown flag, never Healthy.

## F6 Rate limits and sources
1. Repository files SHALL be fetched only from `raw.githubusercontent.com` (no `api.github.com`, no token). The ref order SHALL be `HEAD`, `main`, `master`.
2. Vulnerability data SHALL come from `api.osv.dev`. The feed snapshot SHALL come from the site itself.
3. WHEN a response is 403 or 429 the page SHALL stop and name the rate limit, and SHALL NOT retry in a loop.

## F7 Blameless
1. The page SHALL read no git history, no commit author and no committer. No author name or e-mail SHALL appear in any output.
2. Owners SHALL come from CODEOWNERS only. A repository without CODEOWNERS SHALL show `unowned`.
3. UI copy SHALL state actions ("Paste a public GitHub URL"), not prohibitions.

## F8 Gallery and demo crypt
1. The gallery SHALL stay a list of committed census snapshots, separate from the live result.
2. The demo crypt SHALL stay the playable default; a live result SHALL be labelled with the repository it came from.
3. Live results SHALL NOT be added to the gallery or stored.
