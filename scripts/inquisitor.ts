// CLI: npm run inquisitor -- <LIMB> [--dry-run] [--repo owner/name]
// Polls the PR's check runs. Green: limb awaits a human. Anything else: the creature remains.
import { verify } from "../src/inquisitor/index.js";
import { defaultPaths } from "../src/common/agent.js";
import { nodeIo } from "../src/common/io.js";
import { makeClient, parseArgs, preflightLive } from "./agent-cli.js";

const INTERVAL_MS = 20_000;

async function main(): Promise<void> {
  const o = parseArgs(process.argv.slice(2));
  const limb = o.positional[0];
  if (!limb || o.positional.length !== 1) throw new Error("usage: inquisitor <LIMB> [--dry-run] [--live] [--timeout seconds] [--repo owner/name]");
  await preflightLive(o);
  const ctx = {
    ...defaultPaths(),
    io: nodeIo,
    client: makeClient(o),
    now: () => new Date(),
    sleep: (ms: number) => new Promise<void>((r) => setTimeout(r, ms)),
    maxAttempts: o.dryRun ? 1 : Math.max(2, Math.ceil((o.timeout * 1000) / INTERVAL_MS)),
    intervalMs: INTERVAL_MS,
    requiredCheck: o.dryRun ? undefined : "test",
  };
  const r = await verify(ctx, limb);
  console.log(`${limb}: ${r.outcome}${r.message ? ` ${r.message}` : ""}`);
}

main().catch((e) => {
  process.stderr.write(`inquisitor: ${(e as Error).message}\n`);
  process.exitCode = 1;
});
