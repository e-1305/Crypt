# Design: first-60-seconds

## Data flow

```
paste URL --> src/web/repo-url.ts parseRepoUrl
   |
   v
src/web/live-exhume.ts liveExhume(url, { fetch, feeds })
   |-- raw.githubusercontent.com/<o>/<r>/{HEAD|main|master}/package-lock.json
   |-- raw.githubusercontent.com/<o>/<r>/<ref>/{.github/CODEOWNERS|CODEOWNERS|docs/CODEOWNERS}
   |-- src/exhume: parsePackageLock, resolveOsv (api.osv.dev), rankLimbs, countLimbs, ownerOf
   |-- feeds: feeds.json shipped with the site (src/web/feed-snapshot.ts)
   |-- spawned limbs: api.osv.dev/v1/vulns/<id> -> parseAdvisory -> chooseVersion -> prBody
   v
LiveExhumeResult { creature, plate, summary, limbs, owners, feeds, payloads, notes }
   |
   v
web/live-exhume.js (FEAT-003) renders plate, limb list, owners, payloads
```

`liveExhume` calls `buildCreature` from `src/exhume/creature.ts`, the same function the CLI calls, with a repository reader over the fetched files and an in-memory cache. The plate is `renderPlate(creature)`, so it equals the CLI plate for the same data.

## Browser-safe code

Modules in the web bundle SHALL NOT import `node:*`. Moved for this: `osvLookup` (to `src/exhume/osv-client.ts`, `scripts/osv-client.ts` re-exports it) and `prBody`, `PrFields`, `auditIdFor` (to `src/necromancer/pr-body.ts`, `index.ts` re-exports them). `tsconfig.web.json` compiles `src/web/*.ts`, `src/exhume/*.ts`, `src/necromancer/{version,advisory,pr-body,sabotage}.ts`, `src/common/{counts,creature-status}.ts` and `src/render/plate.ts` into `web/js`. A test fails when a compiled file imports `node:`.

## Feed snapshot

`scripts/build-site.ts` writes `_site/feeds.json`: `{ schemaVersion, kev: { date, cves[] }, epss: { date, scores: { CVE: n } } }`. The source is `data/feeds` (from `npm run feeds:update`) when present, else the committed fixture feeds. For the full feed only EPSS scores of 0.01 and above are kept; lower scores never spawn a limb. The page reads it relative to its own URL and shows the date.

## Fail-safe

`liveExhume` throws `LiveExhumeError { code, message }`. Codes: `bad-url`, `not-found`, `no-npm-lockfile`, `unsupported-lockfile`, `malformed-lockfile`, `rate-limited`, `network`, `osv-unavailable`, `feed-missing`. The message names the cause and the next action. On any error there is no result object, hence no plate and no Healthy limb. A partial OSV answer keeps the affected limbs Rotting with `unknown: true` (existing rank rule). No answer at all is `osv-unavailable`.

## Dry-run payloads

For each spawned limb, in rank order, at most 5: fetch the advisory for each vuln id, `parseAdvisory`, then `chooseVersion`. A missing advisory or no choice gives `{ limb, status: "no-fix", reason }` and no version. Otherwise `{ status: "ready", title, branch, body, files, label }` with the same title and branch shape as the Necromancer (`fix: graft <name> <from> to <to> (<ID>)`, `crypt/graft-<id>-<to>`) and `prBody` for the body. The audit ID uses the feed date, not the clock, so output is deterministic. The browser has no registry access (raw.githubusercontent.com only), so lock hashes are not computed; the body says `resolved` and `integrity` refresh on the next `npm install`.

## Rate limits

Only `raw.githubusercontent.com` for repository files: one request for the lockfile on the first ref that answers, up to three CODEOWNERS requests. A 403 or 429 stops the run at once.

## Blameless

No request touches commits, blame or the REST API. The result type has no author field. A test scans the output for author strings.

## Gallery vs demo crypt

Live results are in memory only. The gallery index and the demo creature are unchanged.
