// crypt alerts --format ocsf: read out/creature.json, write one OCSF Vulnerability Finding per spawned limb.
// Dry by default: reads and writes local files only, no network. Any failure writes nothing and exits non-zero.
import { resolve } from "node:path";
import { defaultPaths } from "../../src/common/agent.js";
import { nodeIo, type Io } from "../../src/common/io.js";
import { CliError, EXIT } from "../../src/cli/exit.js";
import type { Parsed } from "../../src/cli/parse.js";
import { OcsfError, parseCreatureForAlerts, toOcsfEvents } from "../../src/soc/ocsf.js";

export function alertsCommand(p: Parsed, cwd: string = process.cwd(), io: Io = nodeIo, now: () => number = Date.now): number {
  const paths = defaultPaths(cwd);
  const out = resolve(cwd, typeof p.flags.out === "string" ? p.flags.out : "out/alerts.ocsf.json");
  let raw: string;
  try {
    raw = io.readText(paths.creaturePath);
  } catch {
    throw new CliError("no readable out/creature.json. Run crypt raid <target> first. Nothing was written.", EXIT.FAILURE);
  }
  let events: Record<string, unknown>[];
  try {
    const c = parseCreatureForAlerts(raw);
    events = toOcsfEvents(c.repo, c.limbs, now());
  } catch (e) {
    if (e instanceof OcsfError) throw new CliError(`${e.message}. Nothing was written.`, EXIT.FAILURE);
    throw e;
  }
  io.writeText(out, JSON.stringify(events, null, 2) + "\n");
  console.log(`${events.length} OCSF Vulnerability Finding event${events.length === 1 ? "" : "s"} written to ${out}`);
  return EXIT.OK;
}
