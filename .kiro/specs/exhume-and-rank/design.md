# Design: exhume-and-rank

## Pipeline

```
target (path | github url)
   |  scripts/exhume.ts (I/O: files, raw.githubusercontent.com, OSV)
   v
RepoFiles.read(path) --> src/exhume/lockfile.ts   parsePackageLock / parseRequirements --> Limb[]
                     --> src/exhume/owners.ts     parseCodeowners / ownerOf(manifest)
data/cache/osv/*.json <-> src/exhume/osv.ts       resolveOsv(limbs, {fs, cacheDir, lookup?})
data/feeds/{kev.json,epss.csv} --> src/exhume/feeds.ts   parseKev / parseEpss
                     --> src/exhume/rank.ts       scoreOf, rankLimbs, countFindings
                     --> src/exhume/creature.ts   buildCreature, serializeCreature
                                                  --> out/creature.json + summary
```

`src/exhume/` is pure: it takes a small `ExhumeFs` (`read(path): string | null`, `write(path, text)`) and an optional injected `OsvLookup`. All network code (OSV client, feed download, GitHub raw download) lives in `scripts/`, because `tests/static.test.ts` forbids network clients in `src/`.

## Limb

`{ ecosystem: "npm" | "PyPI", name, version, direct, manifest }`. `version` is `"unknown"` for unpinned requirements. Key: `ecosystem:name@version`. PyPI names are normalised (lowercase, runs of `-_.` become `-`).

## Lockfile rules

- `package-lock.json`: iterate `packages`; skip `""` and entries with `link: true` or no `version`. Name is `entry.name` or the text after the last `node_modules/` in the path. `direct` when the path is `node_modules/<name>` (top level) and `<name>` is in the root's dependencies, devDependencies, optionalDependencies or peerDependencies. Duplicates combine with `direct = a || b`.
- `requirements.txt`: line regex `^([A-Za-z0-9][A-Za-z0-9._-]*)(\[[^\]]*\])?\s*==\s*([A-Za-z0-9._+!-]+)\s*(;.*)?(\s#.*)?$` gives a pinned limb (`==1.*` wildcard is not pinned). Every other non-comment, non-option line with a leading name gives `version: "unknown"`. Lines that start with `-` or are empty or comments are skipped.

## OSV

Request: `POST /v1/querybatch` with `{queries:[{package:{ecosystem,name},version}]}`, batches of 500. The response lists only vulnerability ids, so `scripts/osv-client.ts` then fetches `GET /v1/vulns/<id>` for each distinct id (aliases and severity are there). The lookup returns, per limb key, `OsvVuln[]`:

```
OsvVuln = { id: string, aliases: string[], severity: string | null }   // severity: LOW | MODERATE | HIGH | CRITICAL | null
```

The lookup returns an entry only when the limb's batch result and every detail fetch succeeded. Anything else is absent, so the limb is Unknown.

Cache file `data/cache/osv/<ecosystem>__<encodeURIComponent(name)>@<encodeURIComponent(version)>.json`:

```json
{"ecosystem":"npm","name":"jquery","version":"3.4.1","fetchedAt":"2026-11-17T13:01:08.765Z","vulns":[{"id":"GHSA-...","aliases":["CVE-..."],"severity":"MODERATE"}]}
```

`vulns` is sorted by id and aliases are sorted. A file with a different shape or a different key is a miss. `fetchedAt` is the time of the OSV answer. When a lookup is available, an entry older than 7 days (or without `fetchedAt`) is refreshed, so a cached "no vulnerabilities" answer does not stay clean forever. If the refresh fails, the old vulnerabilities are kept but the limb is `unknown` with reason `osv-stale`, never Healthy. With `--offline` (no lookup) the cache is used as is, without an age check. The file name starts with the ecosystem and the whole name is URL-encoded, so no name can leave the cache directory.

Severity to number (the CVSS vector in OSV `severity[]` is not evaluated, only `database_specific.severity`. Advisories that carry only a vector get severity 0, so the last tie-break is weaker for them. Known limitation; the label is used): LOW 2, MODERATE 5, HIGH 7.5, CRITICAL 9.5, null 0. This is deterministic and documented here on purpose.

## Feeds

- KEV: JSON with `dateReleased` and `vulnerabilities[].cveID`. Output `{date: dateReleased, cves}`.
- EPSS: first line `#model_version:...,score_date:<ISO>`, header `cve,epss,percentile`, then rows. Output `{date: score_date, scores: Map<cve, number>}`. A row with a non-finite score or outside [0, 1] is dropped; a missing header or `score_date` makes the feed invalid.
- `npm run feeds:update` (`scripts/feeds-update.ts`) downloads `https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json` and `https://epss.empiricalsecurity.com/epss_scores-current.csv.gz`, gunzips with `node:zlib`, validates with the same parsers, then writes files. A failed download leaves the old files untouched.

## Ranking

```
severity(limb) = max over vulns of severityNumber (0 if none)
epss(limb)     = max EPSS over all CVE ids (id and aliases starting with CVE-) found in the feed, or null
kev(limb)      = any CVE id in KEV
score = (kev ? 1e9 : 0) + (epss ?? 0) * 1e7 + severity
```

EPSS has 5 decimals, so one EPSS step is at least 1e2 in score, above the severity range (0 to 10); EPSS dominates severity, KEV dominates everything. Healthy limbs score 0.

State: `Possessed` if kev; `Rotting` if it has a vulnerability; else `Healthy`. Unknown handling (fail-safe): a limb is `unknown: true` when its OSV answer is unavailable, its OSV answer is stale (`osv-stale`), its version is `unknown`, or any feed is missing. An unknown Healthy limb becomes `Rotting`. Sort key: state rank (Possessed, Rotting, Healthy), score desc, known before unknown, `ecosystem:name@version` asc. `spawned = Possessed || (Rotting && epss !== null && epss >= 0.1)`. `findings = limbs - healthy`. `exorcised` counts findings that are not spawned and not unknown (noise below the threshold). `unresolved` counts unknown findings that are not spawned; they are never exorcised, because their score could not be computed. `exorcised + spawned + unresolved = findings`.

### Merging rows for one limb

When several rows describe the same `ecosystem:name@version`, they merge to the worst case (`combineOsvAnswers` in `src/exhume/rank.ts`): the OSV answer is unknown if any row is unknown (unknown wins over known-clean), vulns are the union by id, and KEV and EPSS then follow from that union (KEV if any row is KEV, max EPSS). The result does not depend on row order. Property tests run 1000 cases each; fast-check prints the seed and path of any failure.

## Ownership

`parseCodeowners(text)` returns rules `{pattern, owners}` (comments and blank lines dropped). Pattern to regex: leading `/` anchors to the root, a pattern without `/` (except trailing) matches at any depth, trailing `/` matches everything below, `*` stays inside a segment, `**` crosses segments, `?` is one non-`/` character. The last matching rule wins. The CODEOWNERS file is the first existing of `.github/CODEOWNERS`, `CODEOWNERS`, `docs/CODEOWNERS`. Owners are copied verbatim from that file (team or user handles); nothing else is consulted.

## creature.json (schema version 1)

Keys are written in the order below; `limbs` is in rank order. No run timestamp.

```
{
  "schemaVersion": 1,
  "repo": string,                  // name of the scanned target (GitHub repo name, else package.json name without @scope/, else directory name); never the cwd. Omitted when the caller gives no name (census)
  "feeds": {
    "kev":  { "status": "ok" | "missing", "date": string | null },
    "epss": { "status": "ok" | "missing", "date": string | null }
  },
  "counts": { "limbs", "findings", "exorcised", "spawned", "unresolved", "possessed", "rotting", "healthy", "unknown" },
  "manifests": [ { "path": string, "ecosystem": "npm" | "PyPI", "owner": string } ],
  "limbs": [ {
      "rank": number,                // 1-based
      "id": "npm:name@version",
      "ecosystem", "name", "version", "direct": boolean,
      "manifest": string, "owner": string,           // "unowned" when no CODEOWNERS rule matches
      "state": "Healthy" | "Rotting" | "Possessed",
      "unknown": boolean,
      "unknownReason": string | null, // "osv-unavailable" | "osv-stale" | "version-unpinned" | "feed-missing"
      "spawned": boolean,
      "score": number,
      "kev": boolean,
      "epss": number | null,
      "severity": number,
      "vulns": [ { "id", "cves": string[] } ]        // sorted
  } ]
}
```

Only the manifest-level `owner` is attributed; no person appears in failure messages (blameless).

## Offline fixtures and data folder

`data/feeds/` is gitignored (EPSS is about 12 MB uncompressed). `data/cache/osv/` is committed for the fixture so a clean clone can rerun it. For a clone without feeds, `fixtures/vulnerable-npm/feeds/` holds a small snapshot (KEV and EPSS rows for the fixture's CVEs only), selected with `--feeds fixtures/vulnerable-npm/feeds`. Feeds are read only from `--feeds` (default `data/feeds`), never from the scanned repository, so a target cannot choose which CVEs count as KEV. The offline demo is `npm run exhume -- fixtures/vulnerable-npm --feeds fixtures/vulnerable-npm/feeds --offline`. A KEV or EPSS feed older than 7 days prints a warning on stderr; ranking is unchanged so output stays deterministic. With no feeds at all the scan still works and marks every limb Unknown.

## CLI

`tsx scripts/exhume.ts <path-or-url> [--out out/creature.json] [--feeds data/feeds] [--cache data/cache/osv] [--offline]`. `bin/crypt.mjs` maps `crypt exhume ...` to it. `--offline` never calls OSV. Exit code is non-zero for bad arguments, an unsupported lockfile, a run that read no manifest (`package-lock.json` or `requirements.txt` at the repository root), and a GitHub fetch that fails for any reason other than 404 (404 means the file is absent). Unknown limbs are a normal result. Network calls have a 20 second timeout. `tsx` is a runtime dependency because `bin/crypt.mjs` runs the TypeScript script through it.

## Property tests

| Invariant | Requirement |
|---|---|
| KEV always outranks non-KEV (score and sort order) | E4.3 |
| Score monotonic in EPSS | E4.3 |
| Same input gives byte-identical `creature.json`, input order irrelevant | E7.2 |
| Spawned is a subset of Possessed plus Rotting with EPSS >= 0.1 | E5.1 |
| No output field contains a git author or committer; src never touches git | E6.3 |
| Missing feed or OSV failure leaves no limb Healthy | E2.4, E3.4, E4.4 |
