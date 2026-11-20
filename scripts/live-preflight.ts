// L1: checks a live run before anything is cloned or written. Failures state the action to take.
import { CliError, UsageError } from "../src/cli/exit.js";
import { isRepoSlug } from "../src/cli/url.js";
import { makeCall, type AuditLine, type Fetcher } from "./github-client.js";

export interface PreflightOpts {
  repo: string;
  token: string;
  fetch?: Fetcher;
  audit?: (line: AuditLine) => void;
  warn: (message: string) => void;
}

const NARROW = "Create a fine-grained token with Repository access: Only select repositories (this one), and Contents: read and write, Pull requests: read and write.";

export async function livePreflight(o: PreflightOpts): Promise<void> {
  if (!isRepoSlug(o.repo)) throw new UsageError("The target must look like owner/name.");
  if (!o.token) throw new CliError(`Set GITHUB_TOKEN to run live. ${NARROW}`);
  if (/^(ghp|gho)_/.test(o.token)) throw new CliError(`Use a fine-grained token (github_pat_...). Classic tokens cannot be limited to one repository. ${NARROW}`);
  const call = makeCall({ token: o.token, fetch: o.fetch, audit: o.audit });
  let info: any;
  try {
    info = await call("GET", `/repos/${o.repo}`);
  } catch (e) {
    throw new CliError(`${o.repo} is not readable with this token (${(e as Error).message}). ${NARROW}`);
  }
  if (info?.permissions?.push !== true) throw new CliError(`This token cannot push to ${o.repo}. ${NARROW}`);
  let repos: unknown;
  try {
    repos = await call("GET", "/user/repos?per_page=100");
  } catch {
    o.warn("Note: the least-privilege check could not run (repository listing unavailable); continuing.");
    return;
  }
  if (!Array.isArray(repos)) {
    o.warn("Note: the least-privilege check could not run (unexpected listing); continuing.");
    return;
  }
  // Every token can read every public repository, so public repositories in the listing say nothing about scope.
  // A fine-grained token limited to one repository cannot see any other private repository: a private one here means
  // the token is wider than this run needs (fail-safe: refuse).
  const others = repos.filter((r: any) => typeof r?.full_name === "string" && r.full_name.toLowerCase() !== o.repo.toLowerCase());
  const privateOthers = others.filter((r: any) => r?.private !== false);
  if (privateOthers.length > 0) {
    throw new CliError(`This token can also reach ${privateOthers.length} other private repositor${privateOthers.length === 1 ? "y" : "ies"}. ${NARROW}`);
  }
  if (others.length > 0) {
    o.warn(`Note: the token also lists ${others.length} public repositor${others.length === 1 ? "y" : "ies"} (any token can read public repositories). Write scope to public repositories cannot be checked from the API; make sure the token uses Only select repositories.`);
  }
}
