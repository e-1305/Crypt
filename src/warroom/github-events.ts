// GitHub REST adapter (Epic D4). Only normalises data: fetch is injected by the page, nothing here touches the network.
// Read only: every request is a GET. A pull request that GitHub reports as done (field merged_at) becomes a human-merged event; this code
// never performs that step. The token is a function argument. It is never stored, logged or written anywhere.
import { clean } from "../render/plate.js";
import { parseWarEvent, type WarEvent } from "./events.js";
import type { WarLimb } from "./state.js";
import { limbKeyOf } from "./state.js";

export const BRANCH_PREFIX = "crypt/";
export const POLL_MS = 15 * 1000;
/** 60 requests per hour unauthenticated, two requests per poll cycle at least: poll every 70 s keeps well under. */
export const POLL_MS_ANON = 70 * 1000;
export const MAX_DELAY_MS = 15 * 60 * 1000;

const obj = (x: unknown): Record<string, unknown> | null => (x !== null && typeof x === "object" && !Array.isArray(x) ? (x as Record<string, unknown>) : null);
const ms = (iso: unknown): number | null => {
  if (typeof iso !== "string") return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) && t >= 0 ? t : null;
};

/** Maps "crypt/graft-<limb>-<version>" to the limb with the longest matching lowercase name. Null when none matches. */
export function limbForBranch(ref: unknown, limbs: readonly WarLimb[]): string | null {
  if (typeof ref !== "string" || !ref.startsWith(BRANCH_PREFIX + "graft-")) return null;
  const rest = ref.slice((BRANCH_PREFIX + "graft-").length).toLowerCase();
  let best: { key: string; len: number } | null = null;
  for (const l of limbs) {
    const name = clean(l.name, 40).toLowerCase();
    if (name === "" || !(rest === name || rest.startsWith(name + "-"))) continue;
    if (best === null || name.length > best.len) best = { key: limbKeyOf(l), len: name.length };
  }
  return best ? best.key : null;
}

/** One pull request from the pulls list to events. Not a crypt/ branch, no matching limb or bad data: no events. */
export function eventsFromPull(pull: unknown, limbs: readonly WarLimb[]): WarEvent[] {
  try {
    const p = obj(pull);
    const head = obj(p?.head);
    if (!p || !head) return [];
    const limb = limbForBranch(head.ref, limbs);
    const number = p.number;
    const opened = ms(p.created_at);
    if (limb === null || typeof number !== "number" || opened === null) return [];
    const out: unknown[] = [{ type: "pr-opened", limb, pr: number, at: opened, source: "live" }];
    const doneAt = ms(p.merged_at);
    if (doneAt !== null) {
      // The pulls list omits merged_by; only the single-pull response has it. No named, non-bot account means
      // the result is unverified, so the limb stays unhealed (fail safe).
      const user = obj(p.merged_by);
      const login = user?.login;
      const human = typeof login === "string" && login !== "" && user?.type !== "Bot" && !/\[bot\]$/i.test(login);
      if (!human) return out.map(parseWarEvent).filter((e): e is WarEvent => e !== null);
      out.push({ type: "human-merged", limb, pr: number, at: doneAt, healedBy: login, source: "live" });
    }
    return out.map(parseWarEvent).filter((e): e is WarEvent => e !== null);
  } catch {
    return [];
  }
}

/** Check runs for a pull request head sha: any failure is red, anything unfinished is running, all success is green. */
export function eventsFromCheckRuns(payload: unknown, limb: string, pr: number, at: number): WarEvent[] {
  try {
    const runs = obj(payload)?.check_runs;
    if (!Array.isArray(runs) || runs.length === 0) return [];
    let state: "ci-green" | "ci-red" | "ci-running" = "ci-green";
    for (const r of runs) {
      const o = obj(r);
      if (!o) return [];
      const c = o.conclusion;
      if (o.status !== "completed") { if (state === "ci-green") state = "ci-running"; continue; }
      if (c === "success" || c === "neutral" || c === "skipped") continue;
      state = "ci-red";
    }
    const ev = parseWarEvent({ type: state, limb, pr, at, source: "live" });
    return ev ? [ev] : [];
  } catch {
    return [];
  }
}

export interface RateDecision {
  /** Milliseconds to wait before the next request. */
  delayMs: number;
  /** True when the budget is spent and the page should say it is waiting. */
  limited: boolean;
}

export function header(h: unknown, name: string): string | null {
  if (h === null || typeof h !== "object") return null;
  const get = (h as { get?: unknown }).get;
  if (typeof get === "function") {
    const v = (get as (n: string) => unknown).call(h, name);
    return typeof v === "string" ? v : null;
  }
  for (const [k, v] of Object.entries(h as Record<string, unknown>)) if (k.toLowerCase() === name && typeof v === "string") return v;
  return null;
}

/**
 * Next poll delay from response headers. Never earlier than the reset time when remaining is 0, never earlier than
 * retry-after, and slower without a token. Missing or odd headers back off to the slow default (fail-safe).
 */
export function rateLimitDecision(headers: unknown, now: number, authed: boolean): RateDecision {
  const base = authed ? POLL_MS : POLL_MS_ANON;
  const num = (n: string) => {
    const s = header(headers, n);
    const v = s === null || s.trim() === "" ? NaN : Number(s);
    return Number.isFinite(v) && v >= 0 ? v : null;
  };
  const retry = num("retry-after");
  const remaining = num("x-ratelimit-remaining");
  const reset = num("x-ratelimit-reset");
  let delay = base;
  let limited = false;
  if (retry !== null) { delay = Math.max(delay, retry * 1000); limited = true; }
  if (remaining === 0) {
    limited = true;
    delay = Math.max(delay, reset !== null ? Math.max(0, reset * 1000 - now) + 1000 : MAX_DELAY_MS);
  } else if (remaining === null && retry === null) {
    delay = Math.max(delay, POLL_MS_ANON);
  } else if (remaining !== null && remaining < 5) {
    delay = Math.max(delay, 4 * base);
  }
  return { delayMs: Math.max(delay, base), limited };
}

export interface PollRequest {
  method: "GET";
  /** Path on the GitHub API host. The page adds the host, so this module names no URL. */
  url: string;
  headers: Record<string, string>;
}

/** GET requests for one poll cycle. The token only goes into the Authorization header of the request object. */
export function pollPlan(repo: unknown, token?: string): PollRequest[] {
  const r = typeof repo === "string" && /^(?!\.+\/)[A-Za-z0-9_.-]{1,100}\/(?!\.+$)[A-Za-z0-9_.-]{1,100}$/.test(repo) ? repo : null;
  if (r === null) return [];
  const headers: Record<string, string> = { accept: "application/vnd.github+json" };
  if (typeof token === "string" && token !== "") headers.authorization = `Bearer ${token}`;
  return [{ method: "GET", url: `/repos/${r}/pulls?state=all&per_page=30&sort=updated`, headers }];
}

/** The check-runs request for one pull request head sha. */
export function checkRunsRequest(repo: unknown, sha: unknown, token?: string): PollRequest | null {
  const base = pollPlan(repo, token)[0];
  if (!base || typeof sha !== "string" || !/^[0-9a-f]{7,40}$/i.test(sha)) return null;
  return { method: "GET", url: `/repos/${String(repo)}/commits/${sha}/check-runs`, headers: base.headers };
}

/** The single-pull request. Only this response carries merged_by, which the pulls list leaves out. */
export function pullRequest(repo: unknown, n: unknown, token?: string): PollRequest | null {
  const base = pollPlan(repo, token)[0];
  if (!base || typeof n !== "number" || !Number.isSafeInteger(n) || n <= 0) return null;
  return { method: "GET", url: `/repos/${String(repo)}/pulls/${n}`, headers: base.headers };
}
