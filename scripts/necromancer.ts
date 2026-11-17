// CLI: npm run necromancer -- [--dry-run] [--repo owner/name] [--target dir] [--advisories dir] [request.json ...]
// Default requests: all of out/requests/graft-*.json. Dry-run writes PR payloads to out/prs/ and calls nothing.
import { graft } from "../src/necromancer/index.js";
import { defaultPaths } from "../src/common/agent.js";
import { nodeIo } from "../src/common/io.js";
import { makeClient, parseArgs, preflightLive } from "./agent-cli.js";
import { apiAuditHook } from "./live-audit.js";
import { npmRegistryClient } from "./registry-client.js";
import { fixtureAdvisories, osvAdvisories } from "./osv-advisory.js";

async function main(): Promise<void> {
  const o = parseArgs(process.argv.slice(2));
  const paths = defaultPaths();
  const files = o.positional.length
    ? o.positional
    : nodeIo.listDir("out/requests").filter((f) => /^graft-.*\.json$/.test(f)).map((f) => `out/requests/${f}`);
  await preflightLive(o);
  const client = makeClient(o);
  const ctx = {
    ...paths,
    io: nodeIo,
    client,
    registry: client.dryRun ? undefined : npmRegistryClient({ audit: apiAuditHook(nodeIo, paths.auditPath), secrets: [process.env.GITHUB_TOKEN ?? ""] }),
    advisories: o.advisories ? fixtureAdvisories(o.advisories) : osvAdvisories(),
    targetDir: o.target,
    now: () => new Date(),
  };
  for (const f of files) {
    const r = await graft(ctx, f);
    console.log(`${f}: ${r.outcome}${r.branch ? ` ${r.branch}${r.breaking ? " (breaking: true)" : ""}` : ""}`);
  }
}

main().catch((e) => {
  process.stderr.write(`necromancer: ${(e as Error).message}\n`);
  process.exitCode = 1;
});
