// L1: checks a live run before anything is cloned or written. Failures state the action to take.
import { CliError, UsageError } from "../src/cli/exit.js";
import { makeCall, type AuditLine, type Fetcher } from "./github-client.js";

export interface PreflightOpts {
  repo: string;
  token: string;
  fetch?: Fetcher;
  audit?: (line: AuditLine) => void;
  warn: (message: string) => void;
}

const NARROW = "Create a fine-grained token limited to this one repository with Contents: read and write, Pull requests: read and write, Checks: read.";

export async function livePreflight(o: PreflightOpts): Promise<void> {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(o.repo)) throw new UsageError("The target must look like owner/name.");
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
  const others = repos.filter((r: any) => typeof r?.full_name === "string" && r.full_name.toLowerCase() !== o.repo.toLowerCase());
  if (others.length > 0) {
    throw new CliError(`This token can also reach ${others.length} other repositor${others.length === 1 ? "y" : "ies"}. ${NARROW}`);
  }
}
