// GitHub access for agents. The interface is deliberately small: it has no method that lands a PR.
// Real REST adapter: scripts/github-client.ts. This file has no network code.
import type { Io } from "../common/io.js";
import { branchFile } from "../common/agent.js";

export interface FileChange {
  path: string;
  content: string;
}

export interface BranchRequest {
  branch: string;
  message: string;
  files: FileChange[];
}

export interface PrRequest {
  branch: string;
  title: string;
  body: string;
  meta: { limb: string; ecosystem: string; name: string; from: string; to: string; breaking: boolean };
}

export interface CheckRun {
  name: string;
  status: string; // queued | in_progress | completed
  conclusion: string | null;
}

export interface PrState {
  open: boolean;
  /** True when a human has accepted the PR into the default branch. */
  landed: boolean;
}

export interface GithubClient {
  /** True when no call leaves the machine. */
  readonly dryRun: boolean;
  createBranchWithFiles(req: BranchRequest): Promise<void>;
  openPullRequest(req: PrRequest): Promise<{ number: number; url: string }>;
  getCheckRuns(branch: string): Promise<CheckRun[]>;
  getPullRequestState(ref: { number: number; branch: string }): Promise<PrState>;
}

/** Writes the PR payload to out/prs/ and calls nothing. */
export function dryRunClient(io: Io, prsDir: string, now: () => Date): GithubClient {
  const staged = new Map<string, BranchRequest>();
  return {
    dryRun: true,
    async createBranchWithFiles(req) {
      staged.set(req.branch, req);
    },
    async openPullRequest(req) {
      const b = staged.get(req.branch);
      if (!b) throw new Error("branch was not prepared");
      const payload = {
        dryRun: true,
        createdAt: now().toISOString(),
        branch: req.branch,
        title: req.title,
        body: req.body,
        ...req.meta,
        number: 0,
        url: "-",
        commitMessage: b.message,
        files: b.files,
      };
      io.mkdirp(prsDir);
      io.writeText(`${prsDir}/${branchFile(req.branch)}`, JSON.stringify(payload, null, 2) + "\n");
      return { number: 0, url: "-" };
    },
    async getCheckRuns() {
      return [];
    },
    async getPullRequestState() {
      return { open: true, landed: false };
    },
  };
}
