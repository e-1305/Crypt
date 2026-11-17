// Option parsing shared by the necromancer, inquisitor and reraise CLIs.
import { dryRunClient, type GithubClient } from "../src/github/client.js";
import { nodeIo } from "../src/common/io.js";
import { defaultPaths } from "../src/common/agent.js";
import { githubClient } from "./github-client.js";

export interface CliOpts {
  dryRun: boolean;
  repo?: string;
  target: string;
  advisories?: string;
  positional: string[];
}

export function parseArgs(args: string[]): CliOpts {
  const o: CliOpts = { dryRun: false, target: ".", positional: [] };
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    const val = () => {
      const v = args[++i];
      if (!v) throw new Error(`${a} needs a value`);
      return v;
    };
    if (a === "--dry-run") o.dryRun = true;
    else if (a === "--repo") o.repo = val();
    else if (a === "--target") o.target = val();
    else if (a === "--advisories") o.advisories = val();
    else if (a.startsWith("--")) throw new Error(`unexpected argument ${a}`);
    else o.positional.push(a);
  }
  // Dry-run is the default whenever there is no token.
  if (!process.env.GITHUB_TOKEN) o.dryRun = true;
  return o;
}

export function makeClient(o: CliOpts): GithubClient {
  const paths = defaultPaths();
  if (o.dryRun) return dryRunClient(nodeIo, paths.prsDir, () => new Date());
  if (!o.repo) throw new Error("--repo owner/name is required without --dry-run");
  return githubClient(o.repo, process.env.GITHUB_TOKEN ?? "");
}
