# Crypt Census: results

- Across 20 popular open-source projects, CRYPT's filter cut 248 findings to 3 monsters.
- 95.2% of findings were exorcised as noise, so only 1.2% spawned: 3 limbs out of 11,244 dependencies.
- 0 limbs were possessed (actively exploited, CISA KEV), and 84.7% of all limbs had no CODEOWNERS owner to heal them. 16 of 20 repositories have no CODEOWNERS file at all.

Aggregates only. No project is named next to a finding. Per-repo data stays in a gitignored directory (blameless publication rule).

## Numbers

| Measure | Value |
|---|---|
| Repositories scanned | 20 |
| Total limbs (dependencies) | 11,244 |
| Findings (limbs with a known vulnerability) | 248 (2.2% of limbs) |
| Exorcised by the noise filter | 236 (95.2% of findings) |
| Spawned as monsters | 3 (1.2% of findings) |
| Unresolved (status unknown, kept as findings, never called clean) | 9 |
| Possessed limbs (CISA KEV) | 0 |
| Limbs with no CODEOWNERS owner | 9,528 (84.7% of limbs) |
| Repositories with no CODEOWNERS file at all | 16 of 20 |
| Median findings per repo, before exorcism | 10 |
| Median findings per repo, after exorcism (spawned) | 0 |

## Worked example: one finding below the noise line

One real finding from a census scan, with no project named. A rerun on 2026-11-18 (KEV feed 2026-11-18T19:17:41.0354Z, EPSS feed 2026-11-18T12:00:28Z) found a locked `lodash` 4.17.21 in the census data with advisory GHSA-r5fr-rjxr-66jc (CVE-2026-4800).

| Question | Answer |
|---|---|
| Is it a known vulnerability? | Yes. OSV lists the advisory against that locked version, with a CVSS score of 7.5. |
| What is its EPSS? | 0.0287 in the EPSS feed of 2026-11-18 (about a 3% chance of exploitation in the next 30 days). |
| Is it in CISA KEV? | No. CVE-2026-4800 is not in the KEV feed of 2026-11-18. |
| What state does it get? | Rotting, not Possessed. |
| Does it spawn? | No. It is exorcised as noise and stays in the report as a finding. |

Why it is below the noise line: the rule in `.kiro/steering/sla-policy.md` spawns only Possessed limbs (in KEV) and Rotting limbs with EPSS >= 0.1. This limb is not in KEV, and 0.0287 is under 0.1 by a factor of about 3.5. Its SLA class is `backlog`. A high CVSS score does not change that, because the filter ranks by exploitation likelihood, not by severity alone.

What would make it spawn, either of these on a later feed:

- CVE-2026-4800 appears in the CISA KEV catalogue. The limb becomes Possessed, spawns at once and gets the 48-hour SLA.
- Its EPSS rises to 0.1 or more. The limb spawns with the `this sprint` SLA.

Both are re-checked on every run, so the finding is not hidden: it moves up when the feeds say so. It also stays a lockfile-level finding. It does not show that the vulnerable code runs.

## Method

- Each repository was read at a pinned commit SHA (list: [repos.md](repos.md)). Only the root manifests and CODEOWNERS files were downloaded as text. No code was run and nothing was installed.
- The scan used CRYPT's `exhume` (OSV for vulnerabilities, CISA KEV and FIRST EPSS for ranking). Noise exorcism follows `.kiro/steering/sla-policy.md`: only Possessed limbs and Rotting limbs with EPSS >= 0.1 spawn.
- A limb owner comes from CODEOWNERS only. Git history is never read.
- Reproduce with `npm run census`.

## Dates

- Scan date (UTC): 2026-11-17
- CISA KEV feed date: 2026-11-17T17:53:15.5664Z
- FIRST EPSS feed date: 2026-11-17T12:03:07Z

OSV advisories and both feeds change daily, so a rerun on another day gives different numbers for the same SHAs.

## Limitations

- Lockfile only: the scan reads `package-lock.json` (v2/v3) and `requirements.txt` (`==` pins). Python requirements without an `==` pin cannot be checked; they are counted as unresolved findings, never as clean.
- No reachability analysis: a finding means the locked version has a known advisory, not that the vulnerable code runs.
- Only root manifests are read. Manifests in subdirectories and other lockfile formats (yarn, pnpm, poetry) are out of scope.
- Lockfiles include development dependencies, so some findings sit in build tooling.
- CODEOWNERS covers the manifest, so every limb of a manifest shares one owner (or none).
- A sample of 20 popular projects is not a random sample of all software.
