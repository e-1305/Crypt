# Facts: one source of truth

Every number and claim in README.md, the Devpost text, the pitch, the business pages and the web pages comes from this file. Each fact names its source. If a source changes, change it here first, then fix the docs that repeat it. `tests/facts-consistency.test.ts` fails when a listed file disagrees with the census and demo numbers below.

Labels stay honest: simulated runs say SIMULATED, rehearsals say DRY RUN, guesses say assumption, and anything not measured says not measured.

## Census

Source: [docs/census/RESULTS.md](census/RESULTS.md). Lockfiles only, no reachability, not a random sample. Aggregates only, no project is named.

- Repositories scanned: 20 popular open-source repos.
- Dependencies (limbs): 11,244.
- Findings: 248.
- Noise: 95.2% of findings were exorcised as noise.
- Monsters: 3 spawned.
- Possessed: 0 (none in CISA KEV).
- No CODEOWNERS owner: 84.7% of dependencies.

## Demo

Source: [docs/PROOF.md](PROOF.md). Demo repo: e-1305/crypt-demo.

- Fixture result: 7 dependencies, 5 findings, 2 monsters.
- PR #1: lodash 4.17.15 to 4.18.1, merged by the owner on 2026-11-18.
- PR #2: sabotage, rejected (run 44375794960).

## Security audit

Source: [docs/SECURITY-AUDIT.md](SECURITY-AUDIT.md).

- 15 checks, 7 failed, all 7 fixed.

## Positioning

Source: [docs/COMPETITORS.md](COMPETITORS.md).

- CRYPT complements Dependabot, Snyk and Socket.
- It does not compete on detection: no malware detection, no function-level reachability.
- Its job is the last mile: exploited first, a named owner, one fix PR, a person merges.

## Traction

Source: [docs/INTERVIEWS.md](INTERVIEWS.md).

- No customers and no revenue. Pricing is a hypothesis (assumption).
- Interviews: 0 of 5.

## Video

Source: [docs/VIDEO.md](VIDEO.md).

- About two minutes.
- The voice is synthetic and disclosed (Kokoro-82M TTS).
