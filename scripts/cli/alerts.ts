// crypt alerts --format issues: one GitHub issue per Possessed (KEV) limb. Dry-run (print only) unless --live.
// Live: same token preflight as live graft, exact-title match against open issues (closed ones are not matched), at most 5 per run, never a merge.
import { audit, defaultPaths, isSealed } from "../../src/common/agent.js";
import { nodeIo, type Io } from "../../src/common/io.js";
import { CliError, EXIT } from "../../src/cli/exit.js";
import type { Parsed } from "../../src/cli/parse.js";
import { buildIssues, MAX_ISSUES } from "../../src/alerts/issues.js";
import { makeCall, type Fetcher } from "../github-client.js";
import { apiAuditHook } from "../live-audit.js";
import { livePreflight } from "../live-preflight.js";
import { SEAL_NOTICE } from "./session.js";

export interface AlertsDeps {
  cwd?: string;
  io?: Io;
  env?: Record<string, string | undefined>;
  fetch?: Fetcher;
  now?: () => Date;
  out?: (s: string) => void;
  warn?: (s: string) => void;
}

export async function alertsCommand(p: Parsed, deps: AlertsDeps = {}): Promise<number> {
  const cwd = deps.cwd ?? process.cwd();
  const io = deps.io ?? nodeIo;
  const env = deps.env ?? process.env;
  const now = deps.now ?? (() => new Date());
  const out = deps.out ?? ((s: string) => void process.stdout.write(s));
  const warn = deps.warn ?? ((s: string) => void process.stderr.write(s + "\n"));
  const paths = defaultPaths(cwd);
  const live = p.flags.live === true;
  const repo = typeof p.flags.repo === "string" ? p.flags.repo : undefined;

  if (io.pathState(paths.creaturePath) !== "present") throw new CliError("no readable out/creature.json. Run crypt raid <target> first.", EXIT.FAILURE);
  let creature: unknown;
  try {
    creature = JSON.parse(io.readText(paths.creaturePath));
  } catch {
    throw new CliError("out/creature.json is not readable. Run crypt raid <target> again.", EXIT.FAILURE);
  }
  
  if (!live) {
    const issues = buildIssues(creature, repo);
    out(`Dry run: ${issues.length} issue${issues.length === 1 ? "" : "s"} would be opened (at most ${MAX_ISSUES}). Add --live --repo owner/name to open them.\n`);
    for (const i of issues) out(`\n${i.title}\n\n${i.body}\n`);
    return EXIT.OK;
  }

  if (isSealed(io, paths.sealPath)) {
    warn(SEAL_NOTICE + " No issue was opened.");
    try {
      audit(io, paths.auditPath, now, "ALERTS", "-", "REJECTED_SEALED");
    } catch {
      // the notice above already says nothing was opened
    }
    return EXIT.OK;
  }

  const token = env.GITHUB_TOKEN ?? "";
  const hook = apiAuditHook(io, paths.auditPath, now);
  await livePreflight({ repo: repo!, token, fetch: deps.fetch, audit: hook, warn });
  const call = makeCall({ token, fetch: deps.fetch, audit: hook });

  // Every Possessed limb, not only the first 5: open titles are dropped first, then at most 5 new issues are created.
  const issues = buildIssues(creature, repo, Infinity);
  let opened = 0;
  let kept = 0;
  try {
    // List open issues (consistent, unlike the search index, which lags after a create) and compare exact titles.
    const open = new Set<string>();
    for (let page = 1; page <= 10; page++) {
      const items = await call("GET", `/repos/${repo}/issues?state=open&per_page=100&page=${page}`);
      const list: unknown[] = Array.isArray(items) ? items : [];
      for (const x of list) {
        const r = x as { title?: unknown; pull_request?: unknown };
        if (typeof r.title === "string" && r.pull_request === undefined) open.add(r.title);
      }
      if (list.length < 100) break;
    }
    for (const i of issues) {
      if (open.has(i.title)) {
        kept++;
        audit(io, paths.auditPath, now, "ALERTS", i.limb, "NO_ACTION");
        out(`${i.title}: already open\n`);
        continue;
      }
      if (opened >= MAX_ISSUES) break;
      const created = await call("POST", `/repos/${repo}/issues`, { title: i.title, body: i.body });
      open.add(i.title);
      opened++;
      const url = typeof created?.html_url === "string" ? created.html_url : "-";
      audit(io, paths.auditPath, now, "ALERTS", i.limb, "API_CALL", url);
      out(`${i.title}: opened ${url}\n`);
    }
  } catch (e) {
    try {
      audit(io, paths.auditPath, now, "ALERTS", "-", "ERROR");
    } catch {
      // fail-safe: a failed audit write must not hide the error
    }
    throw new CliError(`alerts stopped: ${e instanceof Error ? e.message : "unknown error"}. No further issue was opened.`, EXIT.FAILURE);
  }
  out(`Opened ${opened}, already open ${kept}.\n`);
  return EXIT.OK;
}
