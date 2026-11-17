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
    if (!res.ok) throw new Error(`GitHub ${method} ${path} failed (${res.status})`);
    return res.json();
  }
  return {
    dryRun: false,
    async createBranchWithFiles(req) {
      const info = await call("GET", "");
      const base = String(info.default_branch);
      const head = await call("GET", `/git/ref/heads/${refPath(base)}`);
      await call("POST", "/git/refs", { ref: `refs/heads/${req.branch}`, sha: head.object.sha });
      for (const file of req.files) {
        const existing = await call("GET", `/contents/${refPath(file.path)}?ref=${encodeURIComponent(req.branch)}`);
        await call("PUT", `/contents/${refPath(file.path)}`, {
          message: req.message,
          content: Buffer.from(file.content, "utf8").toString("base64"),
          branch: req.branch,
          sha: existing.sha,
        });
      }
    },
    async openPullRequest(req) {
      const info = await call("GET", "");
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
