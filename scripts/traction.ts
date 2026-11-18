// npm run traction: print real adoption numbers as a markdown table. Never invents a number.
// Each row is a value, "not published", "not discoverable" or "unavailable".
import type { Fetcher } from "./github-client.js";

export const NPM_URL = "https://api.npmjs.org/downloads/point/last-week/@e-1305/crypt";
export const REPO_URL = "https://api.github.com/repos/e-1305/Crypt";
export const CODE_SEARCH_URL = "https://api.github.com/search/code?q=%22e-1305%2FCrypt%22+path%3A.github%2Fworkflows&per_page=1";

export interface TractionRow {
  measure: string;
  value: string;
  source: string;
}

const UNAVAILABLE = "unavailable";

async function getJson(f: Fetcher, url: string, headers?: Record<string, string>): Promise<{ status: number; ok: boolean; body: unknown }> {
  const r = await f(url, { headers: { accept: "application/json", ...headers } });
  let body: unknown = null;
  try {
    body = await r.json();
  } catch {
    body = null;
  }
  return { status: r.status, ok: r.ok, body };
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const count = (v: unknown): string => (typeof v === "number" && Number.isInteger(v) && v >= 0 ? String(v) : UNAVAILABLE);

async function safe(fn: () => Promise<string[]>, n: number): Promise<string[]> {
  try {
    return await fn();
  } catch {
    return Array<string>(n).fill(UNAVAILABLE);
  }
}

export async function collectTraction(o: { fetch?: Fetcher; token?: string } = {}): Promise<TractionRow[]> {
  const f = o.fetch ?? (fetch as unknown as Fetcher);
  const auth = o.token ? { authorization: `Bearer ${o.token}` } : undefined;

  const [npm] = await safe(async () => {
    const r = await getJson(f, NPM_URL);
    if (isObj(r.body) && typeof r.body.error === "string") return [/not found/i.test(r.body.error) ? "not published" : UNAVAILABLE];
    if (!r.ok || !isObj(r.body)) return [UNAVAILABLE];
    return [count(r.body.downloads)];
  }, 1);

  const [stars, forks] = await safe(async () => {
    const r = await getJson(f, REPO_URL, auth);
    if (!r.ok || !isObj(r.body)) return [UNAVAILABLE, UNAVAILABLE];
    return [count(r.body.stargazers_count), count(r.body.forks_count)];
  }, 2);

  const [users] = await safe(async () => {
    if (!o.token) return ["not discoverable (GitHub code search needs a token)"];
    const r = await getJson(f, CODE_SEARCH_URL, auth);
    if (!r.ok || !isObj(r.body)) return [UNAVAILABLE];
    // total_count is workflow files, an upper bound on repositories; label it so.
    const n = count(r.body.total_count);
    return [n === UNAVAILABLE ? n : `${n} workflow files (not deduplicated by repository)`];
  }, 1);

  return [
    { measure: "npm downloads, last week (@e-1305/crypt)", value: npm!, source: "api.npmjs.org" },
    { measure: "GitHub stars (e-1305/Crypt)", value: stars!, source: "api.github.com" },
    { measure: "GitHub forks (e-1305/Crypt)", value: forks!, source: "api.github.com" },
    { measure: "Public repos using the Action", value: users!, source: "GitHub code search" },
  ];
}

export function renderTraction(rows: TractionRow[], date: string): string {
  const lines = [`Traction as of ${date} (UTC)`, "", "| Measure | Value | Source |", "|---|---|---|"];
  for (const r of rows) lines.push(`| ${r.measure} | ${r.value} | ${r.source} |`);
  return lines.join("\n");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const rows = await collectTraction({ token: process.env.GITHUB_TOKEN || undefined });
  console.log(renderTraction(rows, new Date().toISOString().slice(0, 10)));
}
