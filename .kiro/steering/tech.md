---
inclusion: always
---
# CRYPT — Tech

- Runtime: Node.js 20+, TypeScript, distributed as `npx crypt`.
- Vulnerability data: OSV API (osv.dev) for npm + PyPI lockfiles.
- Exploit intel: CISA KEV catalog (JSON) and FIRST EPSS (CSV), cached locally in `data/` so the tool runs offline.
- Game engine: Inform 6 source generated from scan data, compiled to Z-machine `.z5`, played in the browser via a web Z-machine interpreter.
- Bridge: the game writes a transcript file; a watcher parses it with a strict command grammar.
- GitHub: PR-only token (no merge rights).
- Tests: vitest + fast-check for property-based tests.
- Ecosystems in scope: npm and pip only.
- Any third-party code, tool or dataset added must be recorded in `docs/ATTRIBUTION.md` with its license.
- Generated stats blocks and the timeline are regenerated only on `main` by the `stats` workflow (bot commit). Do not run `kiro:stats --write` or `kiro:timeline` in a PR.
