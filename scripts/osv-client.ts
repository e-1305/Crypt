import type { OsvLookup } from "../src/exhume/osv.js";
import type { Limb, OsvVuln } from "../src/exhume/types.js";
import { limbKey } from "../src/exhume/types.js";

export type Fetcher = (url: string, init?: { method?: string; body?: string; headers?: Record<string, string> }) => Promise<{
  ok: boolean;
  json(): Promise<unknown>;
}>;

const API = "https://api.osv.dev/v1";
const BATCH = 500;

async function json(f: Fetcher, url: string, body?: unknown): Promise<any> {
  const res = await f(
    url,
    body === undefined
      ? undefined
      : { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } },
  );
  if (!res.ok) throw new Error(`OSV ${url} failed`);
  return res.json();
}

/**
 * Returns an entry only for limbs whose batch answer and every vulnerability
 * detail were fetched. Everything else is left out, so the limb stays Unknown.
 */
export function osvLookup(f: Fetcher): OsvLookup {
  return async (limbs: Limb[]) => {
    const out = new Map<string, OsvVuln[]>();
    const details = new Map<string, OsvVuln | null>();
    for (let i = 0; i < limbs.length; i += BATCH) {
      const chunk = limbs.slice(i, i + BATCH);
      let res: any;
      try {
        res = await json(f, `${API}/querybatch`, {
          queries: chunk.map((l) => ({ package: { ecosystem: l.ecosystem, name: l.name }, version: l.version })),
        });
      } catch {
        continue;
      }
      if (!Array.isArray(res?.results) || res.results.length !== chunk.length) continue;
      if (res.results.some((r: any) => r?.next_page_token)) continue; // incomplete page: stay unknown
      for (let j = 0; j < chunk.length; j++) {
        const ids: string[] = (res.results[j]?.vulns ?? []).map((v: any) => v.id);
        const vulns: OsvVuln[] = [];
        let complete = true;
        for (const id of ids) {
          if (!details.has(id)) {
            try {
              const d = await json(f, `${API}/vulns/${encodeURIComponent(id)}`);
              details.set(id, {
                id,
                aliases: Array.isArray(d.aliases) ? d.aliases.filter((a: unknown) => typeof a === "string") : [],
                severity: typeof d.database_specific?.severity === "string" ? d.database_specific.severity : null,
              });
            } catch {
              details.set(id, null);
            }
          }
          const d = details.get(id);
          if (d) vulns.push(d);
          else complete = false;
        }
        if (complete) out.set(limbKey(chunk[j]!), vulns);
      }
    }
    return out;
  };
}
