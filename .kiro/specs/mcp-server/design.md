# Design: mcp-server

## Layout
- `src/mcp/core.ts`: pure handlers. Input: `Ctx` (from `src/bridge/watch.ts`), plus `creaturePath` and `censusPath`. Output: `{ ok, text }`. No SDK import.
- `src/mcp/server.ts`: `createServer(ctx, paths)` registers six tools with zod input schemas. Tests connect through `InMemoryTransport`.
- `scripts/mcp.ts`: `createServer(defaultCtx(cwd))` on `StdioServerTransport`.

## Write path
`request_graft(id)`: `parseCommand("GRAFT " + id)` must be `ok`, then `watcher.processText("[[CRYPT GRAFT ID]]")`. The watcher checks the seal, checks `out/limbs.json`, writes the request and audits. The handler reads the audit lines added by the call and reports the outcome (`REQUEST_WRITTEN`, `REJECTED_SEALED`, `REJECTED_UNKNOWN_LIMB`, `ERROR`). One watcher per server, so request numbers keep counting. `seal()` uses `[[CRYPT SEAL]]`. Nothing else writes.

## Read path
Limb IDs come from `out/limbs.json` (ecosystem, name, version). They join to `out/creature.json` limbs on ecosystem+name+version. Fields are copied by name from an allowlist: state, CVE ids (from `vulns[].aliases`/`cves`, only strings that look like CVE ids), kev, epss, owner, spawned. A missing or invalid file gives an error result.

## Scrubbing
`audit_tail` lines go through `redact`: `ghp_`/`gho_`/`github_pat_`/`sk-` prefixed tokens, and runs of 32+ hex or 40+ base64 characters, become `[redacted]`. The audit format has no author field.

## Threats
- Prompt injection through a tool argument: arguments pass the grammar before any action.
- Token leak: no env access in `src/mcp`.
- Blame: no git access, allowlisted fields.
