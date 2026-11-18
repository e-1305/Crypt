// Scan queue for the graveyard page (Input A). Pure: no fs, clock or network. The page supplies `scan`, which reads one
// repository, and an optional `cached` lookup (sessionStorage). The queue runs one repository at a time, counts the
// GitHub requests against the 60 per hour unauthenticated limit, and pauses (never retries in a loop) on a rate limit.
// Failure is attributed to the repository address, never to a person.

/** GitHub allows 60 unauthenticated requests per hour per address. */
export const HOURLY_LIMIT = 60;
/** Worst case per repo: lockfile at HEAD, main and master, then CODEOWNERS. */
export const REQUESTS_PER_REPO = 4;
/** Repositories per run. The rest wait for the next run. */
export const MAX_REPOS_PER_RUN = 20;

export interface RepoList {
  repos: string[];
  /** Entries that are not a public GitHub repository address. */
  rejected: number;
  /** Valid entries beyond the cap. */
  capped: number;
}

const SLUG = /^([A-Za-z0-9](?:[A-Za-z0-9-]{0,38}))\/([A-Za-z0-9._-]{1,100})$/;

function one(entry: string): string | null {
  let s = entry.trim();
  if (s === "" || s.length > 300) return null;
  const m = /^https:\/\/github\.com\/([^?#]*)/i.exec(s);
  if (m) s = (m[1] ?? "").split("/").filter((p) => p !== "").slice(0, 2).join("/");
  s = s.replace(/\.git$/, "");
  const r = SLUG.exec(s);
  if (!r || r[2] === "." || r[2] === "..") return null;
  return `${r[1]}/${r[2]}`;
}

/** Comma, space or line separated "owner/repo" or github.com URLs. Duplicates (any case) are dropped. Never throws. */
export function parseRepoList(text: unknown, cap = MAX_REPOS_PER_RUN): RepoList {
  const out: RepoList = { repos: [], rejected: 0, capped: 0 };
  if (typeof text !== "string") return out;
  const seen = new Set<string>();
  const limit = Math.max(1, Math.floor(Number.isFinite(cap) ? cap : MAX_REPOS_PER_RUN));
  for (const raw of text.slice(0, 20_000).split(/[\s,;]+/)) {
    if (raw === "") continue;
    const repo = one(raw);
    if (repo === null) {
      out.rejected++;
      continue;
    }
    const key = repo.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    if (out.repos.length >= limit) out.capped++;
    else out.repos.push(repo);
  }
  return out;
}

/** Worst case GitHub requests for `uncached` repositories, and whether they fit in one hour. */
export function estimateRequests(uncached: number): { requests: number; fits: boolean; hoursNeeded: number } {
  const n = Math.max(0, Math.floor(Number.isFinite(uncached) ? uncached : 0));
  const requests = n * REQUESTS_PER_REPO;
  return { requests, fits: requests <= HOURLY_LIMIT, hoursNeeded: Math.ceil(requests / HOURLY_LIMIT) };
}

export type QueueStatus = "idle" | "running" | "paused" | "finished";
export type PauseReason = "rate-limited" | "budget" | null;

export interface QueueState {
  status: QueueStatus;
  total: number;
  /** Repositories handled so far (scanned, cached or failed). */
  done: number;
  /** Repositories that could not be read. The page lists them as "not scanned" (fail safe: nothing is drawn as healthy). */
  failed: { repo: string; message: string }[];
  pending: string[];
  requests: number;
  pause: PauseReason;
  /** One sentence that states the next action. */
  message: string;
}

export interface QueueOptions<R> {
  repos: readonly string[];
  /** Reads one repository. Throws on failure. A thrown value with code "rate-limited" pauses the queue. */
  scan: (repo: string) => Promise<R>;
  /** A stored result for the repository, or null. A hit costs no request. */
  cached?: (repo: string) => R | null;
  onResult: (repo: string, result: R, fromCache: boolean) => void;
  onState?: (s: QueueState) => void;
  /** Requests allowed before the queue pauses. Default: the hourly limit. */
  budget?: number;
}

const codeOf = (e: unknown): string => (typeof e === "object" && e !== null && typeof (e as { code?: unknown }).code === "string" ? (e as { code: string }).code : "");
const messageOf = (e: unknown): string => (e instanceof Error && e.message !== "" ? e.message.slice(0, 300) : "The repository could not be read.");

export interface Queue {
  start(): Promise<QueueState>;
  /** Continue after a pause. A new hourly budget starts: call it once the limit has reset. */
  resume(): Promise<QueueState>;
  state(): QueueState;
}

export function createQueue<R>(opts: QueueOptions<R>): Queue {
  const budget = Math.max(REQUESTS_PER_REPO, Math.floor(opts.budget ?? HOURLY_LIMIT));
  const s: QueueState = { status: "idle", total: opts.repos.length, done: 0, failed: [], pending: [...opts.repos], requests: 0, pause: null, message: "Ready." };
  let windowUsed = 0;
  let running = false;
  const emit = () => opts.onState?.({ ...s, failed: [...s.failed], pending: [...s.pending] });

  async function loop(): Promise<QueueState> {
    if (running) return { ...s };
    running = true;
    s.status = "running";
    s.pause = null;
    s.message = "Reading repositories one at a time.";
    emit();
    while (s.pending.length > 0) {
      const repo = s.pending[0]!;
      let hit: R | null = null;
      try {
        hit = opts.cached?.(repo) ?? null;
      } catch {
        hit = null; // a broken cache lookup is a miss, never a wedge
      }
      if (hit !== null) {
        s.pending.shift();
        s.done++;
        try {
          opts.onResult(repo, hit, true);
        } catch (e) {
          s.failed.push({ repo, message: messageOf(e) });
        }
        emit();
        continue;
      }
      if (windowUsed + REQUESTS_PER_REPO > budget) {
        s.status = "paused";
        s.pause = "budget";
        s.message = `Paused after ${windowUsed} requests to stay under GitHub's ${HOURLY_LIMIT} per hour limit. Choose Resume once the hour has passed.`;
        emit();
        running = false;
        return { ...s };
      }
      try {
        windowUsed += REQUESTS_PER_REPO;
        s.requests += REQUESTS_PER_REPO;
        const r = await opts.scan(repo);
        s.pending.shift();
        s.done++;
        opts.onResult(repo, r, false);
        emit();
      } catch (e) {
        if (codeOf(e) === "rate-limited") {
          s.status = "paused";
          s.pause = "rate-limited";
          s.message = "GitHub is rate limiting requests. Wait a few minutes, then choose Resume. Finished repositories are kept.";
          emit();
          running = false;
          return { ...s };
        }
        s.pending.shift();
        s.done++;
        s.failed.push({ repo, message: messageOf(e) });
        emit();
      }
    }
    s.status = "finished";
    s.message = s.failed.length === 0 ? "All repositories are read." : `Done. ${s.failed.length} could not be read and are listed as not scanned. Check the address and run them again later.`;
    emit();
    running = false;
    return { ...s };
  }

  return {
    start: loop,
    resume: () => {
      windowUsed = 0;
      return loop();
    },
    state: () => ({ ...s, failed: [...s.failed], pending: [...s.pending] }),
  };
}

// ---- session cache --------------------------------------------------------------------------------------------

export const CACHE_PREFIX = "crypt-graveyard-v1:";

export interface StoreLike {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
}

/** Reads one cached result. Storage that is missing, throws or holds junk gives null. */
export function readCache(store: StoreLike | null | undefined, repo: string, parse: (v: unknown) => unknown): unknown {
  try {
    const raw = store?.getItem(CACHE_PREFIX + repo.toLowerCase());
    return raw ? parse(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

/** Stores one result. Returns false when storage is unavailable or full (the page keeps working without it). */
export function writeCache(store: StoreLike | null | undefined, repo: string, value: unknown): boolean {
  try {
    if (!store) return false;
    store.setItem(CACHE_PREFIX + repo.toLowerCase(), JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}
