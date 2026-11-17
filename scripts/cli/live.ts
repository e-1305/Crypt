// Shared live wiring: the target record, repo and timeout resolution, and the audited clients.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { defaultPaths } from "../../src/common/agent.js";
import { nodeIo } from "../../src/common/io.js";
import { UsageError } from "../../src/cli/exit.js";
import { TIMEOUT_DEFAULT } from "../../src/cli/parse.js";
import type { Parsed } from "../../src/cli/parse.js";
import type { GithubClient } from "../../src/github/client.js";
import type { RegistryClient } from "../../src/registry/types.js";
import { githubClient } from "../github-client.js";
import { apiAuditHook } from "../live-audit.js";
import { livePreflight } from "../live-preflight.js";
import { npmRegistryClient } from "../registry-client.js";

export interface TargetRecord {
  repo: string;
  url: string;
  live: boolean;
}

const REPO = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

export const targetPath = (cwd: string): string => join(cwd, "out", "target.json");

export function writeTargetRecord(cwd: string, rec: TargetRecord): void {
  mkdirSync(join(cwd, "out"), { recursive: true });
  writeFileSync(targetPath(cwd), JSON.stringify(rec, null, 2) + "\n");
}

export function readTargetRecord(cwd: string): TargetRecord | null {
  const f = targetPath(cwd);
  if (!existsSync(f)) return null;
  try {
    const j = JSON.parse(readFileSync(f, "utf8")) as Partial<TargetRecord>;
    if (typeof j.repo === "string" && REPO.test(j.repo)) return { repo: j.repo, url: typeof j.url === "string" ? j.url : "", live: j.live === true };
  } catch {
    // an unreadable record is treated as absent
  }
  return null;
}

/** --repo wins; otherwise the repository of the last raid (out/target.json). */
export function resolveRepo(flags: Parsed["flags"], cwd: string): string {
  if (typeof flags.repo === "string") return flags.repo;
  const rec = readTargetRecord(cwd);
  if (rec) return rec.repo;
  throw new UsageError("--live needs --repo owner/name, or run 'crypt raid <url> --live' first so out/target.json names the repository.");
}

export function timeoutMsFrom(flags: Parsed["flags"]): number {
  return (typeof flags.timeout === "string" ? Number(flags.timeout) : TIMEOUT_DEFAULT) * 1000;
}

export interface LiveClients {
  client: GithubClient;
  registry: RegistryClient;
  audit: ReturnType<typeof apiAuditHook>;
  token: string;
  repo: string;
}

/** One audit hook feeds both clients. The token never leaves this object except as an Authorization header. */
export function liveClients(repo: string, token: string, cwd: string = process.cwd()): LiveClients {
  const audit = apiAuditHook(nodeIo, defaultPaths(cwd).auditPath);
  return {
    client: githubClient({ repo, token, audit }),
    registry: npmRegistryClient({ audit, secrets: [token] }),
    audit,
    token,
    repo,
  };
}

/** Preflight, then the clients. Throws a CliError with an action before any write. */
export async function preflightedClients(repo: string, token: string, cwd: string = process.cwd()): Promise<LiveClients> {
  const l = liveClients(repo, token, cwd);
  await livePreflight({ repo, token, audit: l.audit, warn: (m) => process.stderr.write(m + "\n") });
  return l;
}
