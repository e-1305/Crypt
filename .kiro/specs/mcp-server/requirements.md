# Requirements: mcp-server

Goal: any MCP client (including Kiro) can ask the creature questions and request a graft, under the same failsafe rules as the game. Issue #19. Follows `.kiro/steering/failsafe.md` and `blameless.md`.

Terms. **Tool** is an MCP tool. **Request** is a `graft-*.json` file in `out/requests/`. **Limb ID** is a key of `out/limbs.json`.

## M1 Transport
1. `npm run mcp` SHALL start an MCP server on stdio using the official TypeScript SDK (`@modelcontextprotocol/sdk`).
2. The server SHALL write logs to stderr only. Stdout carries protocol messages only.

## M2 Read tools
1. `list_limbs` SHALL return, per limb: id, name, ecosystem, version, state, CVE ids, kev, epss, owner, spawned.
2. `get_limb(id)` SHALL return the same fields for one limb ID, or an error result for an unknown ID.
3. `census_summary` SHALL return the text of `docs/census/RESULTS.md` when present, otherwise a clear "not available" text.
4. `audit_tail(n)` SHALL return the last n lines of `crypt-audit.log`, n clamped to 1..100.

## M3 Write tools
1. The server SHALL expose exactly two write tools: `request_graft(limb_id)` and `seal()`.
2. `request_graft` SHALL pass the strict grammar (`parseCommand("GRAFT " + id)`), then go through the watcher (`createWatcher(ctx).processText`): limbs.json validation, seal check, request file, audit.
3. `request_graft` SHALL write a request only when the ID is in `out/limbs.json` and the crypt is unsealed. Any other string, including near misses, SHALL write no request.
4. `seal()` SHALL create the seal through the watcher. After it, `request_graft` SHALL write zero requests for any input.
5. The server SHALL NOT call GitHub and SHALL NOT merge. A human merges.
6. Any error SHALL return an error result and change nothing (failsafe 1).

## M4 Blameless and no secrets
1. No tool SHALL expose a git author or committer. The server SHALL NOT read git.
2. Outputs SHALL be built from an explicit field allowlist. The server SHALL NOT return environment variables or tokens.
3. `audit_tail` output SHALL have token-looking strings redacted.

## M5 Kiro integration
1. `.kiro/settings/mcp.json` SHALL register the server as `crypt`.
2. `docs/KIRO.md` SHALL show the config and list the tools.

## M6 Dependencies
1. The SDK and its schema library (`zod`) SHALL be recorded in `docs/ATTRIBUTION.md` with their licence.
