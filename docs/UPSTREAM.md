# Upstream fix candidates (planning only)

Planning notes for the human owner. **No PR has been opened on any other project, and none will be opened by an agent.** The owner decides, and opens any PR himself, under the rules in `.kiro/steering/failsafe.md` (one dependency per PR, a human merges).

Tone: blameless. A rotting limb belongs to the package, not to a person. The advisories named here are public. Where a project has a security contact, the owner uses it first.

Note for the owner: this file names projects next to findings. `docs/census/RESULTS.md` publishes aggregates only (blameless publication rule). Decide before merge whether this file stays in the public repository.

## Result

**0 of the 3 qualifying limbs are ready for a PR.** The census (20 repositories, `npm run census`) has no KEV limb. Three limbs pass the filter (EPSS >= 0.1, the line in `.kiro/steering/sla-policy.md`). Each one is held, for a different reason. The issue allows up to 8; listing fewer is the honest count.

## How the list was made

1. `npm run census` on 2026-11-18 (KEV feed 2026-11-17T17:53:15Z, EPSS feed 2026-11-18T12:00:28Z). It writes per-repository creature files to `out/census/` (gitignored).
2. `npx tsx scripts/census/upstream-candidates.ts` reads those files and keeps the limbs that pass the filter: Possessed (KEV), or Rotting with EPSS >= 0.1. For each it fetches the OSV advisories (GET only) and runs `chooseVersion` from `src/necromancer/version.ts`. A fix that stays in the same major is a candidate. Anything unclear is "not verified", never a candidate. The script writes nothing. Tests: `tests/upstream-candidates.test.ts`.
3. By hand, on 2026-11-18, for each hit: the file at the default branch HEAD (the census reads a pinned SHA, see `docs/census/repos.md`), `CONTRIBUTING.md`, Dependabot or Renovate config, and open PRs (GitHub search API, unauthenticated).

Script output at the time of writing:

| Repo | File | Package | Current | KEV | EPSS | CVEs | Script verdict |
|---|---|---|---|---|---|---|---|
| indico/indico | package-lock.json | jquery-ui | 1.12.1 | no | 0.40768 | CVE-2021-41182, CVE-2021-41183, CVE-2021-41184, CVE-2022-31160 | fix 1.13.2 (same major) |
| Rudrabha/Wav2Lip | requirements.txt | opencv-python | 4.1.0.25 | no | 0.21108 | 8 CVEs, CVE-2019-5063 to CVE-2019-16249 (list in script output) | not verified: version is not major.minor.patch |
| nestjs/nest | package-lock.json | lodash.template | 3.6.2 | no | 0.20158 | CVE-2021-23337 | fix 4.5.1 (crosses a major) |

## Candidates, with the reason each is held

### 1. indico/indico: jquery-ui 1.12.1 → 1.13.2 (hold: maintainers chose this pin)

- File: `package-lock.json`; `package.json` declares `"jquery-ui": "~1.12.1"` (direct). Still 1.12.1 at HEAD on 2026-11-18.
- CVEs: CVE-2021-41182, CVE-2021-41183, CVE-2021-41184 (fixed in 1.13.0), CVE-2022-31160 (fixed in 1.13.2). OSV: GHSA-9gj3-hwp5-pmwc, GHSA-j7qv-pgf6-hvh4, GHSA-gpqq-952q-5327, GHSA-h6gj-6jjq-h8g9.
- Bot: `.github/dependabot.yml` covers `github-actions` only. A Dependabot bump to 1.13.0 (PR #5175, 2021) was closed, and a maintainer replied "@dependabot ignore this dependency". No open bot PR. The pin is a decision, not an oversight.
- CONTRIBUTING.md: discuss anything beyond a typo or small fix first (issue or forum); follow the PR checklist (docstrings and tests where relevant, `eslint` and `ruff`, `pytest`, an entry in `CHANGES.rst`, logical commits, imperative commit subjects); security issues go by e-mail to indico-team@cern.ch.
- Suggested action: do not open a PR. If the owner wants to help, send the security contact a short note with the four CVE IDs and the fixed versions, and offer a PR only if they ask. Whether 1.13.x breaks Indico's UI is not verified.

### 2. Rudrabha/Wav2Lip: opencv-python 4.1.0.25 → 4.8.1.78 (hold: open PR, stale project, wide pin changes)

- File: `requirements.txt` (`opencv-python==4.1.0.25`, direct).
- CVEs: CVE-2019-5063, CVE-2019-5064, CVE-2019-9423, CVE-2019-14491, CVE-2019-14492, CVE-2019-14493, CVE-2019-15939, CVE-2019-16249, plus GHSA-qr4w-53vh-m672 and PYSEC-2023-183 (no CVE listed; both fixed in 4.8.1.78). The highest fixed bound across all advisories is 4.8.1.78 (OSV). The script cannot parse 4-part PyPI versions, so this fixed version was read from OSV by hand. It stays within major 4, but 4.1 → 4.8 is a large step. Compatibility with the pinned `numpy==1.17.1`, `torch==1.1.0` and `numba==0.48` is not verified and is likely to need other pin changes.
- Bot: no Dependabot or Renovate config. An open human PR already targets this pin: #552 (2023-09-15, "upgrade opencv-python to 4.2.0.32"). 4.2.0.32 is below the 4.8.1.78 fix, so it would not clear every advisory.
- CONTRIBUTING: none in the repository. The last push was 2025-06-22 and 371 issues are open, so a PR may wait a long time.
- Suggested action: skip. A PR would duplicate #552 and would force wider changes (pins that are years old). A kind comment on #552 pointing to 4.8.1.78 is the gentlest option, if the owner wishes.

### 3. nestjs/nest: lodash.template 3.6.2 (skip: no non-breaking fix)

- File: `package-lock.json`, transitive (not direct). Still 3.6.2 at HEAD on 2026-11-18. Not in `package.json`.
- CVE: CVE-2021-23337 (GHSA-35jh-r3h4-6jhm). OSV lists `lodash.template` as affected through 4.5.0 with no `fixed` event. The script's "4.5.1" is only last_affected plus one patch and is not published: `npm view lodash.template versions` lists 4.5.0, then 4.18.0 and 4.18.1. Either way the move from 3.x to 4.x crosses a major, and the package is deprecated on npm.
- Bot: Renovate config exists (`renovate.json`); the search found no open PR mentioning lodash.
- CONTRIBUTING.md (summary): search for an existing PR first, include test cases, run the full test suite, follow the commit message conventions.
- Suggested action: skip. Fixing it means finding which dev dependency pulls it in and replacing or overriding that parent. That is not a one-dependency, non-breaking PR.

## What this means

- The filter is strict on purpose (`.kiro/steering/sla-policy.md`). With 20 repositories and 3 qualifying limbs, none is a clean first upstream PR.
- To widen the search, edit `docs/census/repos.md` (more repositories, or smaller and younger ones) and rerun `npm run census`, then the script. Do not lower the EPSS line to fill the list; ranking is deterministic and the line is policy.
- Not verified: whether any of these projects fixed the issue on a branch other than the default, and whether a Dependabot security-update PR exists that the unauthenticated search missed (rate limits). Recheck on the day.

## PR description template

For the owner to use if a candidate is approved. One dependency per PR.

```markdown
## Bump <package> from <current> to <fixed>

Hello, and thank you for maintaining <project>. This PR updates one dependency to a version that fixes published advisories. Please close it if it does not suit the project.

**Change**
- `<file>`: `<package>` `<current>` → `<fixed>` (same major version: <yes/no>)
- No other dependency is touched.

**Why**
- Advisories: <CVE IDs and GHSA IDs, linked>
- Exploit signal: <in CISA KEV: yes/no>, EPSS <value> on <date> (FIRST.org)
- Fixed in: <fixed>, per OSV (<link>)

**Checked**
- [ ] I read CONTRIBUTING.md and followed it (<changelog, commit style, DCO or CLA if any>).
- [ ] I looked for an existing or closed PR or an "ignore" decision for this package, and found none.
- [ ] Tests run locally: `<command>` → <result>.
- [ ] Lockfile regenerated with `<command>`; the diff only touches this package and its own dependencies.

**AI assistance disclosure**
The candidate was found with CRYPT, an analysis tool that uses OSV, CISA KEV and FIRST EPSS data with deterministic ranking. An AI assistant helped draft this description. A human reviewed the change and ran the tests above, and will respond to review comments.

**Not verified**
- <anything not tested, for example behaviour in a downstream project>

No rush, and no obligation. Happy to adjust or split this change.
```

Rules for the owner before sending anything:

1. Read the project's CONTRIBUTING and security policy again that day.
2. Never name a person next to a failure. Name the package.
3. One dependency per PR, at most 5 PRs per raid (`.kiro/steering/failsafe.md`). A human opens, and the project's maintainers merge.
