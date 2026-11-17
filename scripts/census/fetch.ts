import { CODEOWNERS_LOCATIONS } from "../../src/exhume/owners.js";
import type { ExhumeFs } from "../../src/exhume/types.js";

const FILES = ["package-lock.json", "requirements.txt", ...CODEOWNERS_LOCATIONS];
const TIMEOUT_MS = 60_000;

/**
 * Reads the root manifests and CODEOWNERS of a repository at one commit, as text.
 * A 404 is a missing file. Any other failure throws, so it is never mistaken for an empty repository.
 */
export async function repoAtSha(repo: string, sha: string): Promise<Pick<ExhumeFs, "read">> {
  const files = new Map<string, string>();
  for (const f of FILES) {
    const url = `https://raw.githubusercontent.com/${repo}/${sha}/${f}`;
    let res: Response;
    try {
      res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    } catch (e) {
      throw new Error(`could not fetch ${f}: ${(e as Error).message}`);
    }
    if (res.status === 404) continue;
    if (!res.ok) throw new Error(`could not fetch ${f}: HTTP ${res.status}`);
    files.set(f, await res.text());
  }
  return { read: (p) => files.get(p) ?? null };
}
