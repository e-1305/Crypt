// CLI: npm run inquisitor -- <LIMB> [--dry-run] [--repo owner/name]
// Polls the PR's check runs. Green: limb awaits a human. Anything else: the creature remains.
import { verify } from "../src/inquisitor/index.js";
import { defaultPaths } from "../src/common/agent.js";
import { nodeIo } from "../src/common/io.js";
import { makeClient, parseArgs } from "./agent-cli.js";

async function main(): Promise<void> {
  const o = parseArgs(process.argv.slice(2));
  const limb = o.positional[0];
  if (!limb || o.positional.length !== 1) throw new Error("usage: inquisitor <LIMB> [--dry-run] [--repo owner/name]");
  const ctx = {
    ...defaultPaths(),
    io: nodeIo,
    client: makeClient(o),
    now: () => new Date(),
    sleep: (ms: number) => new Promise<void>((r) => setTimeout(r, ms)),
    maxAttempts: o.dryRun ? 1 : 30,
    intervalMs: 20_000,
  };
  const r = await verify(ctx, limb);
  console.log(`${limb}: ${r.outcome}${r.message ? ` ${r.message}` : ""}`);
}

main().catch((e) => {
  process.stderr.write(`inquisitor: ${(e as Error).message}\n`);
  process.exitCode = 1;
});
