import type { OsvLookup } from "./osv.js";
import type { Limb, OsvVuln } from "./types.js";
import { limbKey } from "./types.js";

export type Fetcher = (
  url: string,
  init?: { method?: string; body?: string; headers?: Record<string, string>; signal?: AbortSignal },
) => Promise<{
  ok: boolean;
  status?: number;
  headers?: { get(name: string): string | null };
  json(): Promise<unknown>;
}>;

export interface OsvClientOptions {
  /** Per-request timeout. */
  timeoutMs?: number;
  /** Retries after the first attempt, on network error, 429 and 5xx. */
  retries?: number;
  /** First backoff delay, doubled on each retry. */
  baseDelayMs?: number;
  /** Maximum requests in flight at once, batch and detail calls together. */
  concurrency?: number;
  sleep?: (ms: number) => Promise<void>;
  /** Vulnerability details shared by every lookup made with this client. */
  cache?: Map<string, Promise<OsvVuln>>;
}

const API = "https://api.osv.dev/v1";
const BATCH = 500;
const MAX_DELAY_MS = 30_000;
const realSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function retryAfterMs(h: string | null | undefined): number | null {
  if (!h) return null;
  const n = Number(h);
  return Number.isFinite(n) && n >= 0 ? n * 1000 : null;
}

function makeJson(f: Fetcher, o: OsvClientOptions) {
  const timeoutMs = o.timeoutMs ?? 20_000;
  const retries = Math.max(0, o.retries ?? 3);
  const base = o.baseDelayMs ?? 250;
  const sleep = o.sleep ?? realSleep;
  const cap = Math.max(1, o.concurrency ?? 8);
  let active = 0;
  const waiting: Array<() => void> = [];
  const acquire = async () => {
    if (active >= cap) await new Promise<void>((r) => waiting.push(r));
    else active++;
  };
  const release = () => {
    const next = waiting.shift();
    if (next) next();
    else active--;
  };
  return async function json(url: string, body?: unknown): Promise<any> {
    await acquire();
    try {
      for (let attempt = 0; ; attempt++) {
        let wait: number | null = null;
        try {
          const res = await f(url, {
            ...(body === undefined
              ? {}
              : { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } }),
            signal: AbortSignal.timeout(timeoutMs),
          });
          if (res.ok) return await res.json();
          const st = res.status;
          if (st === undefined || (st !== 429 && st < 500)) throw new Error(`OSV ${url} failed`);
          wait = retryAfterMs(res.headers?.get("retry-after"));
        } catch (e) {
          if (e instanceof Error && e.message === `OSV ${url} failed`) throw e;
        }
        if (attempt >= retries) throw new Error(`OSV ${url} failed`);
        await sleep(Math.min(wait ?? base * 2 ** attempt, MAX_DELAY_MS));
      }
    } finally {
      release();
    }
  };
}

/**
 * Returns an entry only for limbs whose batch answer and every vulnerability
 * detail were fetched. Everything else is left out, so the limb stays Unknown.
 */
export function osvLookup(f: Fetcher, opts: OsvClientOptions = {}): OsvLookup {
  const json = makeJson(f, opts);
  const cache = opts.cache ?? new Map<string, Promise<OsvVuln>>();
  const detail = (id: string): Promise<OsvVuln | null> => {
    let p = cache.get(id);
    if (!p) {
      p = json(`${API}/vulns/${encodeURIComponent(id)}`).then((d) => ({
        id,
        aliases: Array.isArray(d.aliases) ? d.aliases.filter((a: unknown) => typeof a === "string") : [],
        severity: typeof d.database_specific?.severity === "string" ? d.database_specific.severity : null,
      }));
      cache.set(id, p);
      p.catch(() => cache.delete(id)); // failures are not cached
    }
    return p.catch(() => null);
  };
  return async (limbs: Limb[]) => {
    const out = new Map<string, OsvVuln[]>();
    for (let i = 0; i < limbs.length; i += BATCH) {
      const chunk = limbs.slice(i, i + BATCH);
      let res: any;
      try {
        res = await json(`${API}/querybatch`, {
          queries: chunk.map((l) => ({ package: { ecosystem: l.ecosystem, name: l.name }, version: l.version })),
        });
      } catch {
        continue;
      }
      if (!Array.isArray(res?.results) || res.results.length !== chunk.length) continue;
      if (res.results.some((r: any) => r?.next_page_token)) continue; // incomplete page: stay unknown
      for (let j = 0; j < chunk.length; j++) {
        const ids: string[] = (res.results[j]?.vulns ?? []).map((v: any) => v.id);
        const found = await Promise.all(ids.map(detail));
        const vulns = found.filter((d): d is OsvVuln => d !== null);
        const complete = vulns.length === ids.length;
        if (complete) out.set(limbKey(chunk[j]!), vulns);
      }
    }
    return out;
  };
}
