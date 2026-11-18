// Every known OSV advisory for one package, so a graft can avoid versions that any of them marks affected.
// Pure apart from the injected fetch. Fail-safe: any gap (HTTP error, bad record, too many pages) gives null.
import { parseAdvisory } from "./advisory.js";
import type { Advisory } from "./version.js";

export type PackageAdvisoryFetch = (
  url: string,
  init?: { method?: string; body?: string; headers?: Record<string, string>; signal?: AbortSignal },
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

/** Returns every advisory for the package, or null when the answer is not complete. */
export type PackageAdvisoryLookup = (ecosystem: string, name: string) => Promise<Advisory[] | null>;

export const OSV_QUERY = "https://api.osv.dev/v1/query";
export const MAX_ADVISORY_PAGES = 20;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

export type PackageAdvisoryResult = { ok: true; advisories: Advisory[] } | { ok: false; rateLimited: boolean };

export async function fetchPackageAdvisories(f: PackageAdvisoryFetch, ecosystem: string, name: string): Promise<PackageAdvisoryResult> {
  const byId = new Map<string, Advisory>();
  let token: string | undefined;
  for (let page = 0; page < MAX_ADVISORY_PAGES; page++) {
    let body: unknown;
    try {
      const res = await f(OSV_QUERY, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ package: { ecosystem, name }, ...(token ? { page_token: token } : {}) }),
      });
      if (res.status === 403 || res.status === 429) return { ok: false, rateLimited: true };
      if (!res.ok) return { ok: false, rateLimited: false };
      body = await res.json();
    } catch {
      return { ok: false, rateLimited: false };
    }
    if (!isObj(body)) return { ok: false, rateLimited: false };
    const vulns = body.vulns === undefined ? [] : body.vulns;
    if (!Array.isArray(vulns)) return { ok: false, rateLimited: false };
    for (const raw of vulns) {
      if (isObj(raw) && typeof raw.withdrawn === "string") continue; // withdrawn: no longer an advisory
      const a = parseAdvisory(raw);
      if (!a) return { ok: false, rateLimited: false };
      byId.set(a.id, a);
    }
    token = typeof body.next_page_token === "string" && body.next_page_token !== "" ? body.next_page_token : undefined;
    if (!token) return { ok: true, advisories: [...byId.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)) };
  }
  return { ok: false, rateLimited: false };
}

/** Union by advisory id; the first occurrence wins. */
export function unionAdvisories(...lists: Advisory[][]): Advisory[] {
  const byId = new Map<string, Advisory>();
  for (const l of lists) for (const a of l) if (!byId.has(a.id)) byId.set(a.id, a);
  return [...byId.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}
