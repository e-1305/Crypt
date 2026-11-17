// Offline fakes for the live raid: an in-memory GitHub (Git Data API) and an npm registry serving fixtures.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Fetcher } from "../scripts/github-client.js";

export const TOKEN = "github_pat_SENTINEL1234567890";
export const REPO = "o/r";
const FIX = join(import.meta.dirname, "fixtures");
export const demoFile = (n: string) => readFileSync(join(FIX, "demo", n), "utf8");
export const registryFixture = (name: string, version: string) =>
  JSON.parse(readFileSync(join(FIX, "registry", `${name}-${version}.json`), "utf8"));

export interface WorldOpts {
  /** Fail the k-th request (1-based, GitHub and registry share the counter). */
  failAt?: number;
  failMode?: "status" | "throw";
  /** Fail the first request whose "METHOD path" matches. */
  failPath?: RegExp;
  baseFiles?: Record<string, string>;
  refExists?: string[];
  checkRuns?: unknown[];
  userRepos?: string[];
  userReposStatus?: number;
  push?: boolean;
}

export interface Req {
  method: string;
  path: string;
  host: string;
  body: any;
}

const hex = (n: number) => n.toString(16).padStart(40, "0");

export function makeWorld(o: WorldOpts = {}) {
  const requests: Req[] = [];
  const baseFiles: Record<string, string> = o.baseFiles ?? {
    "package.json": demoFile("package.json"),
    "package-lock.json": demoFile("package-lock.json"),
    "test/smoke.test.js": demoFile("smoke.test.js"),
  };
  const blobs = new Map<string, string>();
  const trees = new Map<string, { path: string; sha: string }[]>();
  const commits = new Map<string, { tree: string; parents: string[]; message: string }>();
  const refs = new Map<string, string>();
  const prs: { number: number; head: string; title: string; body: string; sha: string }[] = [];
  const outside: string[] = [];
  const landed = new Set<number>();
  let seq = 1;
  const baseCommit = hex(0xabc);
  const baseTree = hex(0xdef);
  refs.set("refs/heads/main", baseCommit);
  for (const r of o.refExists ?? []) refs.set(`refs/heads/${r}`, baseCommit);
  const reply = (status: number, body: unknown = {}) => ({ ok: status < 400, status, json: async () => body });

  function count(req: Req): ReturnType<typeof reply> | null {
    requests.push(req);
    const k = requests.length;
    const hit = o.failAt === k || (o.failPath !== undefined && !failed && o.failPath.test(`${req.method} ${req.path}`));
    if (!hit) return null;
    failed = true;
    if ((o.failMode ?? "status") === "throw") throw new Error(`socket closed for Bearer ${TOKEN} (${TOKEN})`);
    return reply(500, { message: `server error ${TOKEN}` });
  }
  let failed = false;

  const github: Fetcher = async (url, init) => {
    const u = new URL(url);
    const method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(init.body) : undefined;
    const injected = count({ method, path: u.pathname, host: u.host, body });
    if (injected) return injected;
    if (u.host !== "api.github.com") return reply(404);
    if (init?.headers?.authorization !== `Bearer ${TOKEN}`) return reply(401);
    const p = u.pathname;
    if (p === "/user/repos") {
      const names = o.userRepos ?? [REPO];
      return o.userReposStatus ? reply(o.userReposStatus) : reply(200, names.map((full_name) => ({ full_name })));
    }
    const prefix = `/repos/${REPO}`;
    if (!p.startsWith(prefix)) {
      outside.push(`${method} ${p}`);
      return reply(404);
    }
    const rest = p.slice(prefix.length);
    if (method === "GET" && rest === "") return reply(200, { default_branch: "main", permissions: { push: o.push !== false } });
    if (method === "GET" && rest === "/git/ref/heads/main") return reply(200, { object: { sha: refs.get("refs/heads/main") } });
    let m: RegExpExecArray | null;
    if (method === "GET" && (m = /^\/git\/commits\/([0-9a-f]+)$/.exec(rest))) {
      return m[1] === baseCommit ? reply(200, { tree: { sha: baseTree } }) : reply(404);
    }
    if (method === "GET" && (m = /^\/contents\/(.+)$/.exec(rest))) {
      const path = decodeURIComponent(m[1]!);
      if (u.searchParams.get("ref") !== baseCommit) return reply(404);
      const text = baseFiles[path];
      if (text === undefined) return reply(404);
      return reply(200, { type: "file", encoding: "base64", size: Buffer.byteLength(text), content: Buffer.from(text).toString("base64") });
    }
    if (method === "POST" && rest === "/git/blobs") {
      const sha = hex(0x1000 + seq++);
      blobs.set(sha, Buffer.from(body.content, "base64").toString("utf8"));
      return reply(201, { sha });
    }
    if (method === "POST" && rest === "/git/trees") {
      if (body.base_tree !== baseTree) return reply(422);
      const sha = hex(0x2000 + seq++);
      trees.set(sha, body.tree.map((t: any) => ({ path: t.path, sha: t.sha })));
      return reply(201, { sha });
    }
    if (method === "POST" && rest === "/git/commits") {
      if (!trees.has(body.tree)) return reply(422);
      const sha = hex(0x3000 + seq++);
      commits.set(sha, { tree: body.tree, parents: body.parents, message: body.message });
      return reply(201, { sha });
    }
    if (method === "POST" && rest === "/git/refs") {
      if (!commits.has(body.sha) || !/^refs\/heads\/crypt\//.test(body.ref)) return reply(422);
      if (refs.has(body.ref)) return reply(422);
      refs.set(body.ref, body.sha);
      return reply(201, {});
    }
    if (method === "PATCH" && (m = /^\/git\/refs\/(heads\/.+)$/.exec(rest))) {
      const ref = `refs/${decodeURIComponent(m[1]!)}`;
      if (!refs.has(ref) || !commits.has(body.sha)) return reply(422);
      refs.set(ref, body.sha);
      return reply(200, {});
    }
    if (method === "DELETE" && (m = /^\/git\/refs\/(heads\/.+)$/.exec(rest))) {
      return refs.delete(`refs/${decodeURIComponent(m[1]!)}`) ? reply(204) : reply(404);
    }
    if (method === "GET" && rest === "/pulls") {
      const head = (u.searchParams.get("head") ?? "").replace(/^[^:]*:/, "");
      return reply(200, prs.filter((x) => x.head === head).map((x) => ({ number: x.number, html_url: `https://github.com/${REPO}/pull/${x.number}`, head: { sha: x.sha } })));
    }
    if (method === "POST" && rest === "/pulls") {
      const sha = refs.get(`refs/heads/${body.head}`);
      if (!sha || body.base !== "main") return reply(422);
      const number = prs.length + 1;
      prs.push({ number, head: body.head, title: body.title, body: body.body, sha });
      return reply(201, { number, html_url: `https://github.com/${REPO}/pull/${number}`, head: { sha } });
    }
    if (method === "GET" && (m = /^\/commits\/([0-9a-f]+)\/check-runs$/.exec(rest))) return reply(200, { check_runs: o.checkRuns ?? [] });
    if (method === "GET" && (m = /^\/pulls\/(\d+)$/.exec(rest))) return reply(200, landed.has(Number(m[1])) ? { state: "closed", merged_at: "2026-01-02T00:00:00Z", merged_by: { login: "octo-cat" } } : { state: "open" });
    return reply(404);
  };

  const registry: Fetcher = async (url, init) => {
    const u = new URL(url);
    const injected = count({ method: init?.method ?? "GET", path: u.pathname, host: u.host, body: undefined });
    if (injected) return injected;
    const m = /^\/([^/]+)\/(\d+\.\d+\.\d+)$/.exec(u.pathname);
    if (u.host !== "registry.npmjs.org" || !m) return reply(404);
    try {
      return reply(200, registryFixture(decodeURIComponent(m[1]!), m[2]!));
    } catch {
      return reply(404);
    }
  };

  return {
    github,
    registry,
    requests,
    baseFiles,
    refs,
    prs,
    commits,
    trees,
    blobs,
    outside,
    baseCommit,
    /** Test-only: a human landed the PR on github.com. The fake has no merge endpoint; this only flips the state it reports. */
    land: (n: number) => void landed.add(n),
    cryptRefs: () => [...refs.keys()].filter((r) => r.startsWith("refs/heads/crypt/")),
    /** Files of the commit a ref points to, by path. */
    filesAt(ref: string): Record<string, string> {
      const c = commits.get(refs.get(ref) ?? "");
      return Object.fromEntries((trees.get(c?.tree ?? "") ?? []).map((t) => [t.path, blobs.get(t.sha)!]));
    },
  };
}
