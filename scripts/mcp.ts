// Starts the CRYPT MCP server on stdio. Stdout is protocol only; logs go to stderr.
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { defaultCtx } from "../src/bridge/watch.js";
import { defaultMcpPaths } from "../src/mcp/core.js";
import { createServer } from "../src/mcp/server.js";

try {
  const cwd = process.cwd();
  await createServer(defaultCtx(cwd), defaultMcpPaths(cwd)).connect(new StdioServerTransport());
  process.stderr.write("crypt mcp: ready on stdio\n");
} catch (e) {
  process.stderr.write(`crypt mcp: fatal: ${(e as Error).message}\n`);
  process.exitCode = 1;
}
