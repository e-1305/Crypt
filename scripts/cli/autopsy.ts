// crypt autopsy: read out/creature.json and out/state.json, write one printable HTML page.
import { resolve } from "node:path";
import { defaultPaths } from "../../src/common/agent.js";
import { nodeIo, type Io } from "../../src/common/io.js";
import { CliError, EXIT } from "../../src/cli/exit.js";
import type { Parsed } from "../../src/cli/parse.js";
import { buildAutopsy, DEFAULT_LAST, type AutopsyInput } from "../../src/report/model.js";
import { renderAutopsyHtml } from "../../src/report/html.js";
import { SAMPLE_INPUT } from "../../src/report/sample.js";
import { loadHistory, recordSnapshot } from "./history.js";
import { PDF_HINT } from "../../src/report/template.js";

function readJson(io: Io, path: string): unknown {
  try {
    return io.pathState(path) === "present" ? JSON.parse(io.readText(path)) : undefined;
  } catch {
    return undefined;
  }
}

export function autopsyCommand(p: Parsed, cwd: string = process.cwd(), io: Io = nodeIo, now: () => number = Date.now): number {
  const paths = defaultPaths(cwd);
  const out = resolve(cwd, typeof p.flags.out === "string" ? p.flags.out : "out/autopsy.html");
  const last = typeof p.flags.last === "string" ? Number(p.flags.last) : DEFAULT_LAST;
  let input: AutopsyInput;
  if (p.flags.sample === true) {
    input = { ...SAMPLE_INPUT, last };
  } else {
    const creature = readJson(io, paths.creaturePath);
    if (creature === undefined) {
      throw new CliError("no readable out/creature.json. Run crypt raid <target> first.", EXIT.FAILURE);
    }
    const state = readJson(io, paths.statePath) ?? {};
    input = { creature, state, now: now(), last, history: loadHistory(io, paths.creaturePath, state) };
    recordSnapshot(io, paths.creaturePath, creature, now());
  }
  io.writeText(out, renderAutopsyHtml(buildAutopsy(input)));
  console.log(`Autopsy report written to ${out}`);
  console.log(`${PDF_HINT}.`);
  return EXIT.OK;
}
