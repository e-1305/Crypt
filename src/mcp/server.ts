// MCP server for CRYPT: six tools, stdio or in-memory transport. Logs go to stderr only.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { Ctx } from "../bridge/watch.js";
import { createCore, type McpPaths, type ToolResult } from "./core.js";

const reply = (r: ToolResult) => ({ content: [{ type: "text" as const, text: r.text }], isError: !r.ok });

export function createServer(ctx: Ctx, paths: McpPaths): McpServer {
  const core = createCore(ctx, paths);
  const server = new McpServer({ name: "crypt", version: "0.1.0" });
  const ro = { readOnlyHint: true, openWorldHint: false };

  server.registerTool("list_limbs", { description: "List every limb: id, state, CVEs, KEV, EPSS, owner, spawned.", annotations: ro }, () => reply(core.listLimbs()));
  server.registerTool(
    "get_limb",
    { description: "Show one limb by its ID (for example JQUERY).", inputSchema: { id: z.string() }, annotations: ro },
    ({ id }) => reply(core.getLimb(id)),
  );
  server.registerTool("census_summary", { description: "Summary of the dependency census, when available.", annotations: ro }, () => reply(core.censusSummary()));
  server.registerTool(
    "audit_tail",
    { description: "Last n audit log lines (1 to 100).", inputSchema: { n: z.number().optional() }, annotations: ro },
    ({ n }) => reply(core.auditTail(n ?? 10)),
  );
  server.registerTool(
    "request_graft",
    {
      description: "Request a fix PR for a limb. Writes a graft request only for a known limb while the crypt is unsealed. A human lands the fix.",
      inputSchema: { limb_id: z.string() },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    ({ limb_id }) => reply(core.requestGraft(limb_id)),
  );
  server.registerTool(
    "seal",
    {
      description: "Seal the crypt. Every later graft request is refused.",
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    () => reply(core.seal()),
  );
  return server;
}
