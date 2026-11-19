// `crypt init`: onboarding in one pull request. Dry run by default (prints the plan, no network).
// Live: same token preflight as live graft, one branch, one pull request, never a merge, refuses to run twice.
import { CliError, EXIT } from "../../src/cli/exit.js";
import type { Parsed } from "../../src/cli/parse.js";
import { INIT_BRANCH, planInit, prBody, type InitPlan } from "../../src/init/plan.js";
import { makeCall, type Fetcher } from "../github-client.js";
import { livePreflight } from "../live-preflight.js";

export interface InitDeps {
  env?: Record<string, string | undefined>;
  fetch?: Fetcher;
  out?: (s: string) => void;
  warn?: (s: string) => void;
}

const enc = (p: string) => p.split("/").map(encodeURIComponent).join("/");

function describe(plan: InitPlan): string {
  const lines = plan.files.map((f) => `  + ${f.path}`);
  return `${lines.join("\n")}\n${plan.hasCodeowners ? "  (CODEOWNERS already present: not changed)\n" : ""}`;
}

export async function initCommand(p: Parsed, deps: InitDeps = {}): Promise<number> {
  const env = deps.env ?? process.env;
  const out = deps.out ?? ((s: string) => void process.stdout.write(s));
  const warn = deps.warn ?? ((s: string) => void process.stderr.write(s + "\n"));
  const repo = typeof p.flags.repo === "string" ? p.flags.repo : "";
  const live = p.flags.live === true;

  if (!live) {
    // Offline plan: the repository tree is unknown, so the draft lists the common root manifest.
    const plan = planInit(["package.json"]);
    out(`Dry run. Nothing was sent.\ncrypt init would open one pull request${repo ? ` on ${repo}` : ""} adding:\n${describe(plan)}Run with --live --repo owner/name and GITHUB_TOKEN to open it.\n`);
    return EXIT.OK;
  }

  const token = env.GITHUB_TOKEN ?? "";
  await livePreflight({ repo, token, fetch: deps.fetch, warn });
  const call = makeCall({ token, fetch: deps.fetch });
  try {
    const info = await call("GET", `/repos/${repo}`);
    const base = typeof info?.default_branch === "string" && info.default_branch ? info.default_branch : "main";
    const ref = await call("GET", `/repos/${repo}/git/ref/heads/${enc(base)}`);
    const baseSha = ref?.object?.sha;
    if (typeof baseSha !== "string" || !/^[0-9a-f]{40,64}$/.test(baseSha)) throw new Error("unexpected GitHub answer: base ref");
    const tree = await call("GET", `/repos/${repo}/git/trees/${baseSha}?recursive=1`);
    if (!Array.isArray(tree?.tree)) throw new Error("unexpected GitHub answer: tree");
    if (tree.truncated === true) warn("Note: the repository tree is truncated; the CODEOWNERS draft may miss some manifests.");
    const paths = tree.tree.filter((t: any) => t?.type === "blob" && typeof t.path === "string").map((t: any) => String(t.path));
    let plan: InitPlan;
    try {
      plan = planInit(paths);
    } catch (e) {
      out(`${(e as Error).message} No pull request opened.\n`);
      return EXIT.OK;
    }
    const open = await call("GET", `/repos/${repo}/pulls?state=open&head=${encodeURIComponent(`${repo.split("/")[0]}:${INIT_BRANCH}`)}`);
    if (Array.isArray(open) && open.length > 0) {
      out(`An onboarding pull request is already open: ${open[0]?.html_url ?? INIT_BRANCH}. Nothing changed.\n`);
      return EXIT.OK;
    }
    await call("POST", `/repos/${repo}/git/refs`, { ref: `refs/heads/${INIT_BRANCH}`, sha: baseSha });
    for (const f of plan.files) {
      await call("PUT", `/repos/${repo}/contents/${enc(f.path)}`, {
        message: `chore(crypt): add ${f.path}`,
        content: Buffer.from(f.content, "utf8").toString("base64"),
        branch: INIT_BRANCH,
      });
    }
    const pr = await call("POST", `/repos/${repo}/pulls`, { title: "Set up CRYPT (report mode)", head: INIT_BRANCH, base, body: prBody(plan) });
    out(`Opened ${pr?.html_url ?? "the onboarding pull request"}. A person reviews and merges it; CRYPT never merges.\n${describe(plan)}`);
    return EXIT.OK;
  } catch (e) {
    throw new CliError(`crypt init stopped: ${(e as Error).message}. If a crypt/init branch was created, delete it before retrying.`, EXIT.FAILURE);
  }
}
