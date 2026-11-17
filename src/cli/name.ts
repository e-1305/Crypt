// Creature name: the repository name shown on the plate and written to creature.json.
import { parseGithubUrl } from "./url.js";

export interface NameInput {
  /** The target as given, when it is a GitHub URL. */
  url?: string | null;
  /** The "name" field of the target's package.json, when it has one. */
  packageName?: string | null;
  /** The resolved target path. */
  path: string;
}

export const UNKNOWN_NAME = "unknown";

export function stripScope(name: string): string {
  return name.replace(/^@[^/]+\//, "");
}

function baseName(path: string): string {
  const parts = path.split(/[\\/]+/).filter((p) => p !== "");
  return parts.length ? parts[parts.length - 1]! : "";
}

/** GitHub URL: the repo segment. Local path: package name without @scope/, else the directory name. */
export function deriveRepoName(input: NameInput): string {
  const gh = input.url ? parseGithubUrl(input.url) : null;
  if (gh) return gh.repo;
  const pkg = typeof input.packageName === "string" ? stripScope(input.packageName.trim()) : "";
  if (pkg) return pkg;
  return baseName(input.path) || UNKNOWN_NAME;
}
