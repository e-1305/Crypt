// One live poll cycle (Epic D4) with the network injected, so the stale-poll and bot rules are testable.
// Every request is a GET. A finished pull request is only counted after its single-pull response names a human, non-bot account.
import { checkRunsRequest, eventsFromCheckRuns, eventsFromPull, header, pollPlan, pullRequest, rateLimitDecision, type PollRequest, type RateDecision } from "./github-events.js";
import type { WarEvent } from "./events.js";
import type { WarLimb } from "./state.js";

export interface HttpResult {
  ok: boolean;
  status: number;
  headers: unknown;
  /** Parsed JSON, or null when the response was not ok. */
  body: unknown;
}

export interface PollDeps {
  getJson(req: PollRequest): Promise<HttpResult>;
  /** True once a mode switch made this poll obsolete. Checked after every await. */
  isStale(): boolean;
  now(): number;
}

export interface PollConfig {
  repos: readonly string[];
  limbs: readonly WarLimb[];
  token: string;
  /** Raid start: pull requests finished before this are not raid progress. */
  t0: number;
}

export type PollResult =
  | { stale: true }
  | { stale: false; events: WarEvent[]; decision: RateDecision; quota: string | null; error: { repo: string; status: number } | null };

export async function pollCycle(cfg: PollConfig, deps: PollDeps): Promise<PollResult> {
  let decision = rateLimitDecision({}, deps.now(), cfg.token !== "");
  let quota: string | null = null;
  const events: WarEvent[] = [];
  const note = (r: HttpResult) => {
    decision = rateLimitDecision(r.headers, deps.now(), cfg.token !== "");
    quota = header(r.headers, "x-ratelimit-remaining");
  };
  for (const repo of cfg.repos) {
    const [req] = pollPlan(repo, cfg.token);
    if (!req) continue;
    const r = await deps.getJson(req);
    if (deps.isStale()) return { stale: true };
    note(r);
    if (!r.ok || !Array.isArray(r.body)) return { stale: false, events: [], decision, quota, error: { repo, status: r.status } };
    for (const item of r.body as unknown[]) {
      const pull = item !== null && typeof item === "object" ? (item as Record<string, unknown>) : null;
      if (!pull) continue;
      const doneAt = Date.parse(typeof pull.merged_at === "string" ? pull.merged_at : "");
      if (Number.isFinite(doneAt) && doneAt < cfg.t0) continue;
      let source: Record<string, unknown> = pull;
      if (typeof pull.merged_at === "string") {
        // Finished: ask the single-pull endpoint who did it (merged_by). Any failure leaves it unset, so nothing heals.
        const dr = pullRequest(repo, pull.number, cfg.token);
        if (dr) {
          const d = await deps.getJson(dr);
          if (deps.isStale()) return { stale: true };
          note(d);
          const body = d.ok && d.body !== null && typeof d.body === "object" ? (d.body as Record<string, unknown>) : null;
          source = { ...pull, merged_by: body?.merged_by };
        } else source = { ...pull, merged_by: undefined };
      }
      const evs = eventsFromPull(source, cfg.limbs);
      events.push(...evs);
      const opened = evs.find((e) => e.type === "pr-opened");
      const sha = (pull.head as { sha?: unknown } | null | undefined)?.sha;
      if (opened && !evs.some((e) => e.type === "human-merged") && pull.state === "open") {
        const cr = checkRunsRequest(repo, sha, cfg.token);
        if (!cr) continue;
        const c = await deps.getJson(cr);
        if (deps.isStale()) return { stale: true };
        note(c);
        if (c.body && opened.pr !== undefined) events.push(...eventsFromCheckRuns(c.body, opened.limb, opened.pr, deps.now()));
      }
    }
  }
  return { stale: false, events, decision, quota, error: null };
}
