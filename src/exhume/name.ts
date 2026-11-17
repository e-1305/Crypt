// Creature name for creature.json: derived from the scanned target, never from the working directory.
import { deriveRepoName } from "../cli/name.js";

/**
 * GitHub URL: the repo name with any suffix removed. Local path: the package.json "name" without any @scope/ prefix,
 * else the directory name. `readPackageJsonName` reads the target's own package.json (null when absent).
 */
export function creatureRepoName(target: string, readPackageJsonName: () => string | null, resolvedPath: string = target): string {
  const isUrl = /^https:\/\//.test(target);
  return deriveRepoName({
    url: isUrl ? target : null,
    packageName: isUrl ? null : readPackageJsonName(),
    path: resolvedPath,
  });
}

/** Reads "name" out of package.json text; null when the text is missing, invalid or has no string name. */
export function packageJsonName(text: string | null): string | null {
  if (text === null) return null;
  try {
    const n = (JSON.parse(text) as { name?: unknown } | null)?.name;
    return typeof n === "string" ? n : null;
  } catch {
    return null;
  }
}
