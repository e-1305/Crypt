# Requirements: c5-upstream-candidates

Goal: prepare, but never send, upstream fix candidates from the Census run. Driven by issue #95 (EPIC C, C5). Touches only `docs/UPSTREAM.md`, `scripts/census/upstream-candidates.ts`, its test and this spec. Follows `.kiro/steering/blameless.md` and `failsafe.md`.

## U1 No action on other projects
1. Nothing SHALL open a PR, issue or comment on another project. The script SHALL send only GET requests to api.osv.dev and write no file.
2. `docs/UPSTREAM.md` SHALL state that the human owner decides and opens any PR.

## U2 Candidate list
1. At most 8 candidates, from the Census run: a pinned dependency that is Possessed (KEV) or Rotting with EPSS >= 0.1 (the `sla-policy.md` line, not lowered) and has a fixed version that stays in the same major.
2. Each entry SHALL give repo, file, package, current and fixed version, CVE IDs, the project's CONTRIBUTING rules, and whether a bot has an open PR. An entry with an open bot PR SHALL be skipped.
3. Fewer than 8 (including 0) is acceptable. The document SHALL say why each qualifying limb is held or skipped.

## U3 Honesty
1. Every number SHALL name the command or file that produces it. Anything unclear (4-part PyPI versions, unpublished derived versions, search rate limits) SHALL be stated as not verified.
2. Unclear analysis SHALL never produce a candidate (fail safe).

## U4 PR template
1. One dependency per PR, AI assistance disclosed, tests run, respectful tone, no person named next to a failure.
