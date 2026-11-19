// crypt gazette: print the weekly digest as Slack or Teams JSON. With --send, post it once to a webhook.
// The webhook URL is read from the environment only. It is never printed, logged or written to a file.
import { audit, defaultPaths, isSealed } from "../../src/common/agent.js";
import { nodeIo, type Io } from "../../src/common/io.js";
import { CliError, EXIT } from "../../src/cli/exit.js";
import type { Parsed } from "../../src/cli/parse.js";
import { buildDigest } from "../../src/gazette/digest.js";
import { buildSlackPayload } from "../../src/gazette/slack.js";
import { buildTeamsPayload } from "../../src/gazette/teams.js";
import { sendGazette, type FetchLike } from "../../src/gazette/send.js";
import { SAMPLE_INPUT } from "../../src/report/sample.js";
import { loadHistory, recordLimbHistory, recordSnapshot } from "./history.js";
import { SEAL_NOTICE } from "./session.js";

function readJson(io: Io, path: string): unknown {
  try {
    return io.pathState(path) === "present" ? JSON.parse(io.readText(path)) : undefined;
  } catch {
    return undefined;
  }
}

export const DEFAULT_WAR_ROOM = "https://e-1305.github.io/Crypt/";

export interface GazetteDeps {
  cwd?: string;
  io?: Io;
  now?: () => number;
  env?: Record<string, string | undefined>;
  fetchImpl?: FetchLike;
  out?: (s: string) => void;
}

export async function gazetteCommand(p: Parsed, deps: GazetteDeps = {}): Promise<number> {
  const cwd = deps.cwd ?? process.cwd();
  const io = deps.io ?? nodeIo;
  const now = deps.now ?? Date.now;
  const env = deps.env ?? process.env;
  const out = deps.out ?? ((s: string) => void process.stdout.write(s));
  const paths = defaultPaths(cwd);
  const envName = typeof p.flags["webhook-env"] === "string" ? p.flags["webhook-env"] : undefined;
  const format = p.flags.format ?? (envName === "TEAMS_WEBHOOK_URL" ? "teams" : "slack");
  const send = p.flags.send === true;
  const warRoomUrl = typeof p.flags["war-room"] === "string" ? p.flags["war-room"] : DEFAULT_WAR_ROOM;

  let digest;
  if (p.flags.sample === true) {
    digest = buildDigest({ creature: SAMPLE_INPUT.creature, state: SAMPLE_INPUT.state, history: SAMPLE_INPUT.history, now: SAMPLE_INPUT.now, warRoomUrl });
  } else {
    const creature = readJson(io, paths.creaturePath);
    if (creature === undefined) throw new CliError("no readable out/creature.json. Run crypt raid <target> first.", EXIT.FAILURE);
    const state = readJson(io, paths.statePath) ?? {};
    digest = buildDigest({ creature, state, history: loadHistory(io, paths.creaturePath, state), now: now(), warRoomUrl });
    recordSnapshot(io, paths.creaturePath, creature, now());
    recordLimbHistory(io, paths.creaturePath, creature, now());
  }
  const payload = format === "teams" ? buildTeamsPayload(digest) : buildSlackPayload(digest);

  if (!send) {
    out(JSON.stringify(payload, null, 2) + "\n");
    return EXIT.OK;
  }

  const stamp = () => new Date(now());
  if (isSealed(io, paths.sealPath)) {
    process.stderr.write(SEAL_NOTICE + " Nothing was sent.\n");
    try {
      audit(io, paths.auditPath, stamp, "GAZETTE", "-", "REJECTED_SEALED");
    } catch {
      // the notice above already says nothing was sent
    }
    return EXIT.OK;
  }
  const url = envName === undefined ? undefined : env[envName];
  if (!url) throw new CliError(`${envName} is not set. Export ${envName} with your webhook URL, then run the command again.`, EXIT.FAILURE);
  try {
    await sendGazette({ payload, url, fetchImpl: deps.fetchImpl ?? ((u, i) => fetch(u, i)) });
  } catch (e) {
    try {
      audit(io, paths.auditPath, stamp, "GAZETTE", "-", "ERROR");
    } catch {
      // fail-safe: a failed audit write must not hide the send error
    }
    throw new CliError(`gazette not sent: ${e instanceof Error ? e.message : "unknown error"}`, EXIT.FAILURE);
  }
  audit(io, paths.auditPath, stamp, "GAZETTE", "-", "API_CALL");
  out(`Gazette sent to the ${format === "teams" ? "Teams" : "Slack"} webhook.\n`);
  return EXIT.OK;
}
