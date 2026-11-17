// Real GitHub REST adapter. PR-only token: it can create a branch, commit files, open a PR and read.
// It has no method that lands a PR, and the interface it implements has none either.
import type { GithubClient } from "../src/github/client.js";

const API = "https://api.github.com";

export type Fetcher = (url: string, init?: { method?: string; body?: string; headers?: Record<string, string>; signal?: AbortSignal }) => Promise<{
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}>;

const refPath = (b: string) => b.split("/").map(encodeURIComponent).join("/");

export function githubClient(repo: string, token: string, f: Fetcher = fetch as unknown as Fetcher): GithubClient {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo)) throw new Error("--repo must look like owner/name");
  if (!token) throw new Error("GITHUB_TOKEN is not set");
  async function call(method: string, path: string, body?: unknown): Promise<any> {
    const res = await f(`${API}/repos/${repo}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        accept: "application/vnd.github+json",
        "x-github-api-version": "2022-11-28",
        ...(body === undefined ? {} : { "content-type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) throw Object.assign(new Error(`GitHub ${method} ${path} failed (${res.status})`), { status: res.status });
    return res.json();
  }
  return {
    dryRun: false,
    async createBranchWithFiles(req) {
      const info = await call("GET", "");
      const base = String(info.default_branch);
      const head = await call("GET", `/git/ref/heads/${refPath(base)}`);
      if (!req.branch.startsWith("crypt/")) throw new Error("refusing to write a branch outside crypt/");
      try {
        await call("POST", "/git/refs", { ref: `refs/heads/${req.branch}`, sha: head.object.sha });
      } catch (e) {
        if ((e as { status?: number }).status !== 422) throw e;
        // Leftover of an earlier failed or rejected attempt: reset our own crypt/ branch to the base.
        await call("PATCH", `/git/refs/heads/${refPath(req.branch)}`, { sha: head.object.sha, force: true });
      }
      try {
        for (const file of req.files) {
          const existing = await call("GET", `/contents/${refPath(file.path)}?ref=${encodeURIComponent(req.branch)}`);
          await call("PUT", `/contents/${refPath(file.path)}`, {
            message: req.message,
            content: Buffer.from(file.content, "utf8").toString("base64"),
            branch: req.branch,
            sha: existing.sha,
          });
        }
      } catch (e) {
        await call("DELETE", `/git/refs/heads/${refPath(req.branch)}`).catch(() => undefined); // no orphan branch
        throw e;
      }
    },
    async openPullRequest(req) {
      const info = await call("GET", "");
      const owner = repo.split("/")[0]!;
      const open = await call("GET", `/pulls?state=open&head=${encodeURIComponent(`${owner}:${req.branch}`)}`);
      if (Array.isArray(open) && open.length > 0) return { number: Number(open[0].number), url: String(open[0].html_url) };
      const pr = await call("POST", "/pulls", { title: req.title, head: req.branch, base: String(info.default_branch), body: req.body });
      return { number: Number(pr.number), url: String(pr.html_url) };
    },
    async getCheckRuns(branch) {
      const r = await call("GET", `/commits/${refPath(branch)}/check-runs`);
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
      return { open: pr.state === "open", landed: typeof pr.merged_at === "string" };
    },
  };
}
