// Pure parser for the gallery lookup box. Never throws. Accepts only https URLs on github.com.
export interface RepoRef {
  owner: string;
  repo: string;
}

const OWNER = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;
const REPO = /^[A-Za-z0-9._-]{1,100}$/;

export function parseRepoUrl(input: unknown): RepoRef | null {
  if (typeof input !== "string" || input.length > 300) return null;
  let u: URL;
  try {
    u = new URL(input.trim());
  } catch {
    return null;
  }
  if (u.protocol !== "https:" || u.hostname !== "github.com" || u.port !== "" || u.username !== "" || u.password !== "") return null;
  const parts = u.pathname.split("/").filter((p) => p !== "");
  if (parts.length < 2) return null;
  const owner = parts[0]!;
  const repo = parts[1]!.replace(/\.git$/, "");
  if (!OWNER.test(owner) || !REPO.test(repo) || repo === "." || repo === "..") return null;
  return { owner, repo };
}

/** The gallery slug for a repository: lower case, "owner__repo". */
export function repoSlug(ref: RepoRef): string {
  return `${ref.owner}__${ref.repo}`.toLowerCase();
}

/** The ?repo= value of a shared link: exactly "owner/name", nothing else (no path, no host, no dots-only name). */
export function repoFromQuery(value: unknown): RepoRef | null {
  if (typeof value !== "string" || value.length > 140) return null;
  const parts = value.split("/");
  if (parts.length !== 2) return null;
  const [owner, repo] = parts as [string, string];
  if (!OWNER.test(owner) || !REPO.test(repo) || repo === "." || repo === ".." || repo.endsWith(".git")) return null;
  return { owner, repo };
}
