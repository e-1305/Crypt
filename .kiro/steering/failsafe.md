---
inclusion: always
---
# Failsafe rules (Saltzer & Schroeder, 1975) — NON-NEGOTIABLE

1. Fail-safe defaults: on any error, timeout or ambiguity, change NOTHING. A limb stays rotting.
2. Least privilege: never call any GitHub merge endpoint. Never push to the default branch. The code must not contain a merge call.
3. Separation of privilege: the agent that writes a fix is never the one that verifies it. A human always merges.
4. Economy of mechanism: scoring and ranking are deterministic code. Never use an LLM to score or rank.
5. Complete mediation: every game command passes the strict grammar parser before any action. Reject anything else.
6. Blast radius: one dependency per PR. Max 5 PRs per raid.
7. Kill switch: if `SEAL CRYPT` was issued, every agent action aborts.
8. Audit: log every agent action (timestamp, command, limb, PR URL) to `crypt-audit.log`.

Every rule above must have a property-based test.
