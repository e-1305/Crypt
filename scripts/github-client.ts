// Real GitHub REST adapter on the Git Data API. PR-only token: it can read, create a branch with one commit
// and open a PR. It has no method that lands a PR, and the interface it implements has none either.
// Every request is announced to the audit hook first; if the hook throws, nothing is sent.
// The token is redacted from every error this module throws.
import type { GithubClient } from "../src/github/client.js";

const API = "https://api.github.com";
const MAX_FILE_BYTES = 1024 * 1024;

export type Fetcher = (url: string, init?: { method?: string; body?: string; headers?: Record<string, string>; signal?: AbortSignal }) => Promise<{
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}>;

export interface AuditLine {
  method: string;
  path: string;
}

export interface GithubClientOptions {
  repo: string;
  token: string;
  fetch?: Fetcher;
  /** Called before every request with method and path only. A throw stops the request. */
  audit?: (line: AuditLine) => void;
  timeoutMs?: number;
}

const refPath = (b: string) => b.split("/").map(encodeURIComponent).join("/");
const SHA = /^[0-9a-f]{40,64}$/;

/** Replaces the token and `Bearer <token>` in any text. */
export function redact(text: string, token: string): string {
  if (!token) return text;
  return text.split(`Bearer ${token}`).join("Bearer [redacted]").split(token).join("[redacted]");
}

/** One audited, time limited, redacting request function shared by the GitHub adapters. */
export function makeCall(o: { token: string; fetch?: Fetcher; audit?: (l: AuditLine) => void; timeoutMs?: number }) {
  const f = o.fetch ?? (fetch as unknown as Fetcher);
  return async function call(method: string, path: string, body?: unknown): Promise<any> {
    const shown = path.split("?")[0]!;
    try {
      o.audit?.({ method, path: shown });
      const res = await f(`${API}${path}`, {
        method,
        headers: {
          authorization: `Bearer ${o.token}`,
          accept: "application/vnd.github+json",
          "x-github-api-version": "2022-11-28",
          ...(body === undefined ? {} : { "content-type": "application/json" }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(o.timeoutMs ?? 20_000),
      });
      if (!res.ok) throw Object.assign(new Error(`GitHub ${method} ${shown} failed (${res.status})`), { status: res.status });
      return await res.json();
    } catch (e) {
      const err = e as { message?: unknown; status?: unknown };
      throw Object.assign(new Error(redact(String(err?.message ?? "request failed"), o.token)), {
        status: typeof err?.status === "number" ? err.status : undefined,
      });
    }
  };
}

function str(v: unknown, what: string): string {
  if (typeof v !== "string" || v === "") throw new Error(`unexpected GitHub answer: ${what}`);
  return v;
}
function sha(v: unknown, what: string): string {
  const s = str(v, what);
  if (!SHA.test(s)) throw new Error(`unexpected GitHub answer: ${what}`);
  return s;
}

export function githubClient(opts: GithubClientOptions): GithubClient;
export function githubClient(repo: string, token: string, f?: Fetcher): GithubClient;
export function githubClient(a: GithubClientOptions | string, token?: string, f?: Fetcher): GithubClient {
  const o: GithubClientOptions = typeof a === "string" ? { repo: a, token: token ?? "", fetch: f } : a;
  const { repo } = o;
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo)) throw new Error("--repo must look like owner/name");
  if (!o.token) throw new Error("GITHUB_TOKEN is not set");
  const raw = makeCall(o);
  const call = (method: string, path: string, body?: unknown) => raw(method, `/repos/${repo}${path}`, body);

  let defaultBranch: string | null = null;
  let pin: { sha: string; tree: string | null } | null = null; // base commit pinned for the current graft
  const commits = new Map<string, string>(); // branch -> commit sha we created

  async function base(): Promise<{ branch: string; sha: string }> {
    if (!defaultBranch) defaultBranch = str((await call("GET", "")).default_branch, "default_branch");
    if (!pin) {
      const head = await call("GET", `/git/ref/heads/${refPath(defaultBranch)}`);
      pin = { sha: sha(head?.object?.sha, "base sha"), tree: null };
    }
    return { branch: defaultBranch, sha: pin.sha };
  }

  return {
    dryRun: false,
    async readBaseFile(path) {
      const b = await base();
      const r = await call("GET", `/contents/${refPath(path)}?ref=${b.sha}`);
      if (!r || r.type !== "file" || r.encoding !== "base64" || typeof r.content !== "string") throw new Error(`${path} is not a readable file`);
      if (typeof r.size !== "number" || r.size > MAX_FILE_BYTES) throw new Error(`${path} is larger than 1 MB`);
      return Buffer.from(r.content, "base64").toString("utf8");
    },
    async createBranchWithFiles(req) {
      if (!req.branch.startsWith("crypt/")) throw new Error("refusing to write a branch outside crypt/");
      try {
        const b = await base();
        const parent = await call("GET", `/git/commits/${b.sha}`);
        const baseTree = sha(parent?.tree?.sha, "base tree");
        const entries: { path: string; mode: string; type: string; sha: string }[] = [];
        for (const file of req.files) {
          const blob = await call("POST", "/git/blobs", { content: Buffer.from(file.content, "utf8").toString("base64"), encoding: "base64" });
          entries.push({ path: file.path, mode: "100644", type: "blob", sha: sha(blob?.sha, "blob sha") });
        }
        const tree = await call("POST", "/git/trees", { base_tree: baseTree, tree: entries });
        const commit = await call("POST", "/git/commits", { message: req.message, tree: sha(tree?.sha, "tree sha"), parents: [b.sha] });
        const commitSha = sha(commit?.sha, "commit sha");
        try {
          await call("POST", "/git/refs", { ref: `refs/heads/${req.branch}`, sha: commitSha });
        } catch (e) {
          if ((e as { status?: number }).status !== 422) throw e;
          // Leftover of an earlier failed or rejected attempt: reset our own crypt/ branch.
          await call("PATCH", `/git/refs/heads/${refPath(req.branch)}`, { sha: commitSha, force: true });
        }
        commits.set(req.branch, commitSha);
      } finally {
        pin = null; // the next graft pins a fresh base
      }
    },
    async openPullRequest(req) {
      if (!defaultBranch) defaultBranch = str((await call("GET", "")).default_branch, "default_branch");
      const owner = repo.split("/")[0]!;
      const open = await call("GET", `/pulls?state=open&head=${encodeURIComponent(`${owner}:${req.branch}`)}`);
      if (Array.isArray(open) && open.length > 0) {
        // The listing can lag a force-reset, so the commit this client just wrote wins.
        return { number: Number(open[0].number), url: str(open[0].html_url, "html_url"), headSha: commits.get(req.branch) ?? sha(open[0].head?.sha, "head sha") };
      }
      const pr = await call("POST", "/pulls", { title: req.title, head: req.branch, base: defaultBranch, body: req.body });
      return { number: Number(pr.number), url: str(pr.html_url, "html_url"), headSha: sha(pr.head?.sha ?? commits.get(req.branch), "head sha") };
    },
    async getCheckRuns(ref) {
      const r = await call("GET", `/commits/${refPath(ref)}/check-runs`);
      if (!Array.isArray(r.check_runs)) throw new Error("unexpected check-runs answer");
      return r.check_runs.map((c: any) => ({
        name: String(c.name),
        status: String(c.status),
        conclusion: typeof c.conclusion === "string" ? c.conclusion : null,
      }));
    },
    async getPullRequestState(ref) {
      const pr = await call("GET", `/pulls/${ref.number}`);
      // The timestamp is set only when a human accepted the PR; "landed" is our neutral name for that.
      const by = pr.merged_by && typeof pr.merged_by.login === "string" ? pr.merged_by.login : undefined;
      return { open: pr.state === "open", landed: typeof pr.merged_at === "string", ...(by ? { landedBy: by } : {}) };
    },
    async deleteBranch(branch) {
      if (!branch.startsWith("crypt/")) throw new Error("refusing to delete a branch outside crypt/");
      await call("DELETE", `/git/refs/heads/${refPath(branch)}`);
    },
  };
}
