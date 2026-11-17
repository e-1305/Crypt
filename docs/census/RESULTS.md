# Crypt Census: results

- Across 20 popular open-source projects, CRYPT's filter cut 231 findings to 3 monsters.
- 94.8% of findings were exorcised as noise, so only 1.3% spawned: 3 limbs out of 11,244 dependencies.
- 0 limbs were possessed (actively exploited, CISA KEV), and 84.7% of all limbs had no CODEOWNERS owner to heal them.

Aggregates only. No project is named next to a finding. Per-repo data stays in a gitignored directory (blameless publication rule).

## Numbers

| Measure | Value |
|---|---|
| Repositories scanned | 20 |
| Total limbs (dependencies) | 11,244 |
| Findings (limbs with a known vulnerability) | 231 (2.1% of limbs) |
| Exorcised by the noise filter | 219 (94.8% of findings) |
| Spawned as monsters | 3 (1.3% of findings) |
| Unresolved (status unknown, kept as findings, never called clean) | 9 |
| Possessed limbs (CISA KEV) | 0 |
| Limbs with no CODEOWNERS owner | 9,528 (84.7% of limbs) |
| Median findings per repo, before exorcism | 9.5 |
| Median findings per repo, after exorcism (spawned) | 0 |

## Method

- Each repository was read at a pinned commit SHA (list: [repos.md](repos.md)). Only the root manifests and CODEOWNERS files were downloaded as text. No code was run and nothing was installed.
- The scan used CRYPT's `exhume` (OSV for vulnerabilities, CISA KEV and FIRST EPSS for ranking). Noise exorcism follows `.kiro/steering/sla-policy.md`: only Possessed limbs and Rotting limbs with EPSS >= 0.1 spawn.
- A limb owner comes from CODEOWNERS only. Git history is never read.
- Reproduce with `npm run census`.

## Dates

- Scan date (UTC): 2026-11-17
- CISA KEV feed date: 2026-11-13T20:24:18.3008Z
- FIRST EPSS feed date: 2026-11-17T12:03:07Z

OSV advisories and both feeds change daily, so a rerun on another day gives different numbers for the same SHAs.

## Limitations

- Lockfile only: the scan reads `package-lock.json` (v2/v3) and `requirements.txt` (`==` pins). Python requirements without an `==` pin cannot be checked; they are counted as unresolved findings, never as clean.
- No reachability analysis: a finding means the locked version has a known advisory, not that the vulnerable code runs.
- Only root manifests are read. Manifests in subdirectories and other lockfile formats (yarn, pnpm, poetry) are out of scope.
- Lockfiles include development dependencies, so some findings sit in build tooling.
- CODEOWNERS covers the manifest, so every limb of a manifest shares one owner (or none).
- A sample of 20 popular projects is not a random sample of all software.
