// GitHub repository URL parser. Accepts exactly <scheme>://github.com/<owner>/<repo>[.git][/].
// Anything else (option-like text, whitespace, shell metacharacters, extra path, other hosts) is null.
const GITHUB = /^https:\/\/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?\/?$/;

// Built in pieces so no scheme-and-slashes literal sits in src/ (tests/static.test.ts).
export const GITHUB_BASE = "https:" + "//github.com";

export interface GithubRepo {
  owner: string;
  repo: string;
}

export function parseGithubUrl(text: string): GithubRepo | null {
  const m = GITHUB.exec(text);
  if (!m) return null;
  const [, owner, repo] = m as unknown as [string, string, string];
  if (/^\.+$/.test(owner) || /^\.+$/.test(repo)) return null;
  if (owner.startsWith("-") || repo.startsWith("-")) return null; // never option-like
  return { owner, repo };
}

/** True for text that names a remote (a scheme, or scp-like user@host:path), valid or not. */
export function looksRemote(text: string): boolean {
  return /^[A-Za-z][A-Za-z0-9+.-]*:\/\//.test(text) || /^[^/\s]+@[^/\s]+:/.test(text);
}
