// CLI: npm run reraise -- [--dry-run] [--live] [--repo owner/name]
// Reads which graft PRs landed, marks those limbs healed, regenerates the creature and recompiles it.
import { reraise } from "../src/reraise/index.js";
import { defaultPaths } from "../src/common/agent.js";
import { nodeIo } from "../src/common/io.js";
import { readFileSync } from "node:fs";
import { renderPlate } from "../src/render/plate.js";
import { raiseCreature } from "./compile.js";
import { makeClient, parseArgs } from "./agent-cli.js";

async function main(): Promise<void> {
  const o = parseArgs(process.argv.slice(2));
  const paths = defaultPaths();
  const r = await reraise({ ...paths, io: nodeIo, client: makeClient(o), now: () => new Date() });
  if (r.outcome !== "OK") {
    console.log(`reraise: ${r.outcome} (nothing changed)`);
    process.exitCode = r.outcome === "ERROR" ? 1 : 0;
    return;
  }
  console.log(`healed: ${r.healed.length ? r.healed.join(", ") : "none"}`);
  raiseCreature(paths.creaturePath, "out");
  process.stdout.write("\n" + renderPlate(JSON.parse(readFileSync(paths.creaturePath, "utf8"))) + "\n");
}

main().catch((e) => {
  process.stderr.write(`reraise: ${(e as Error).message}\n`);
  process.exitCode = 1;
});
