# CRYPT vs Dependabot security updates, side by side

Both tools read the same kind of input: a lockfile and an advisory database. They answer different questions. Dependabot answers "which packages have a published fix?" CRYPT answers "which of these should a human look at first, and who owns it?"

This page compares them on one real, public repository so you can reproduce every number.

## The repository

[e-1305/crypt-demo](https://github.com/e-1305/crypt-demo) at commit [`bd82e8e`](https://github.com/e-1305/crypt-demo/tree/bd82e8eb00428db829ac002944f1be98f51c94df), committed here as `fixtures/crypt-demo` (see `SNAPSHOT.json`). It has a root `package-lock.json` with seven packages (six direct, one transitive) and a `.github/CODEOWNERS` file naming `@e-1305`.

Data snapshots used:

| Source | Snapshot |
| --- | --- |
| OSV answers (GitHub Advisory Database ids) | `data/cache/osv/`, fetched 2026-11-17 |
| CISA KEV | `fixtures/vulnerable-npm/feeds/kev.json`, released 2026-11-13 |
| FIRST EPSS | `fixtures/vulnerable-npm/feeds/epss.csv`, scored 2026-11-16 |

## The table

Rows are sorted alphabetically by package. GitHub does not document an order in which Dependabot opens security update PRs, so the alphabetical order is our choice and carries no claim about Dependabot. The "Dependabot would open" column follows the rule that [Dependabot security updates](https://docs.github.com/en/code-security/dependabot/dependabot-security-updates/about-dependabot-security-updates) raise a pull request for a dependency with a known advisory: here, one PR per package that has at least one advisory. Whether a patched version exists for each advisory is not in the cache, so no target version is claimed. The "CRYPT" column shows CRYPT's rank (1 is first).

<!-- compare:dependabot begin -->
| Package | Version | Advisories | Dependabot would open | CRYPT | Why |
| --- | --- | --- | --- | --- | --- |
| handlebars | 4.0.11 | 20: GHSA-2cf5-4w76-r9qv, GHSA-2qvq-rjwj-gvw9, GHSA-2w6w-674q-4c4q, +17 more | 1 PR | #3 exorcises (no PR) | EPSS 0.07066 < 0.1 noise line, backlog |
| jquery | 3.4.1 | 2: GHSA-gxr4-xjj5-5px2, GHSA-jpcq-cgw6-v4j6 | 1 PR | #1 spawns, owner @e-1305 | in CISA KEV (Possessed, 48h), EPSS 0.99215 |
| lodash | 4.17.15 | 5: GHSA-29mw-wpgm-hmr9, GHSA-35jh-r3h4-6jhm, GHSA-p6mc-m468-83gw, +2 more | 1 PR | #2 spawns, owner @e-1305 | EPSS 0.20158 >= 0.1 (this sprint) |
| minimist (transitive) | 0.0.8 | 2: GHSA-vh95-rmgr-6w4m, GHSA-xvch-5gv4-984h | 1 PR | #4 exorcises (no PR) | EPSS 0.04581 < 0.1 noise line, backlog |
| mkdirp | 0.5.1 | 0 | none | #6 healthy | no advisories, nothing to fix |
| ms | 2.1.3 | 0 | none | #7 healthy | no advisories, nothing to fix |
| node-fetch | 2.6.0 | 2: GHSA-r683-j2x4-v87g, GHSA-w7rc-rwvf-8q5r | 1 PR | #5 exorcises (no PR) | EPSS 0.01778 < 0.1 noise line, backlog |

Dependabot would open 5 PRs. CRYPT spawns 2 (max 5) and exorcises 3 as noise. Every PR waits for human review.
<!-- compare:dependabot end -->

Reading it: five packages carry advisories, so five Dependabot PRs. CRYPT puts jquery first because it is in the CISA KEV catalog (exploited in the wild), then lodash because its EPSS is above the 0.1 line. The other three stay on the backlog list and open no PR.

## Reproduce

```
npm ci
npm run compare:dependabot           # prints the table above, offline
npm run compare:dependabot -- --check  # fails if this page is out of date
```

The script reads only files in this repository: the lockfile and CODEOWNERS in `fixtures/crypt-demo`, the OSV cache in `data/cache/osv`, and the KEV and EPSS snapshots. It makes no network call. A test (`tests/compare-dependabot.test.ts`) fails if the table on this page differs from the script output.

## Where Dependabot is better

- It is native to GitHub. There is nothing to install or run.
- It is automatic: once [enabled](https://docs.github.com/en/code-security/dependabot/dependabot-security-updates/configuring-dependabot-security-updates), it raises PRs without anyone starting a scan.
- It supports many more package ecosystems than CRYPT, which covers npm and pip only. See the [supported ecosystems](https://docs.github.com/en/code-security/dependabot/ecosystems-supported-by-dependabot/supported-ecosystems-and-repositories).
- It draws on the [GitHub Advisory Database](https://docs.github.com/en/code-security/security-advisories/working-with-global-security-advisories-from-the-github-advisory-database/about-the-github-advisory-database), which is a first-party source.
- It is maintained by GitHub. CRYPT is a young project.

## Where CRYPT differs

- **Prioritisation.** CRYPT ranks by CISA KEV first, then EPSS, then CVSS severity. The same input always gives the same order.
- **Noise cut.** Only KEV-listed packages and packages with EPSS of 0.1 or more spawn. Here 3 of 5 vulnerable packages are set aside as noise, with the reason printed.
- **Ownership.** Each limb carries the owner from CODEOWNERS. Git history is never used to name anyone.
- **Cap.** At most 5 PRs per run, one dependency per PR.
- **Human merge.** CRYPT's token cannot merge. A limb heals only when CI is green and a person merges.
- **SOC output.** `crypt alerts --format ocsf` writes OCSF Vulnerability Finding events, see [SOC.md](SOC.md).

## Limits of this comparison

- It is derived from cached OSV data and the rule above. It is not a recorded run of Dependabot on this repository.
- Not compared: whether a patched version exists for each advisory, PR contents, version bump size, grouping, schedules, or any Dependabot configuration the repository may have.
- The KEV and EPSS values are a snapshot. They change daily, so a fresh run may rank differently.
