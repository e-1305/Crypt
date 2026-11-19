import { LockfileError } from "./lockfile.js";

/**
 * Static import scan for npm. Says how a package is used by the source text,
 * never whether a vulnerable code path is reachable. Pure: no network, no
 * execution, no file system access.
 */
export type Usage = "direct" | "transitive" | "dev" | "unknown";

export interface PackageUsage {
  name: string;
  usage: Usage;
}

export const USAGE_LIMITS =
  "Static text scan of source files for require, import and dynamic import of a package name. It does not run code, follow variables, or say whether a vulnerable function is called. A regex literal containing a quote or comment marker can hide imports, which then read as transitive or dev. Workspace members are not listed.";

const NM = "node_modules/";
const SOURCE_EXT = /\.(?:[cm]?[jt]s|[jt]sx)$/;
const SKIP_DIRS = new Set([
  "node_modules",
  "dist",
  "build",
  "test",
  "tests",
  "__tests__",
  "fixtures",
  "__fixtures__",
]);
const SOURCE_DIRS = new Set(["src", "lib", "app"]);
const TEST_FILE = /\.(?:test|spec)\.[^/]+$/;

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** True when the path is a source file the scan reads. */
export function isScannedSource(path: string): boolean {
  const parts = path.replace(/\\/g, "/").replace(/^\.\//, "").split("/");
  const file = parts[parts.length - 1] ?? "";
  if (!SOURCE_EXT.test(file) || file.endsWith(".d.ts") || TEST_FILE.test(file)) return false;
  const dirs = parts.slice(0, -1);
  if (dirs.some((d) => SKIP_DIRS.has(d) || d === "")) return false;
  return dirs.length === 0 || dirs.some((d) => SOURCE_DIRS.has(d));
}

/** Remove comments, leaving string and template literals intact so "src/*" does not open a comment. */
function stripComments(text: string): string {
  let out = "";
  let i = 0;
  while (i < text.length) {
    const c = text[i]!;
    const n = text[i + 1];
    if (c === "/" && n === "*") {
      const end = text.indexOf("*/", i + 2);
      i = end < 0 ? text.length : end + 2;
      out += " ";
    } else if (c === "/" && n === "/") {
      while (i < text.length && text[i] !== "\n") i++;
    } else if (c === '"' || c === "'" || c === "`") {
      let j = i + 1;
      while (j < text.length && text[j] !== c && (c === "`" || text[j] !== "\n")) j += text[j] === "\\" ? 2 : 1;
      out += text.slice(i, j + 1);
      i = j + 1;
    } else {
      out += c;
      i++;
    }
  }
  return out;
}

/** Package name for an import specifier, or null for relative, absolute, node: and # imports. */
export function packageOfSpecifier(spec: string): string | null {
  if (spec === "" || spec.startsWith(".") || spec.startsWith("/") || spec.startsWith("#")) return null;
  if (/^[a-z][a-z0-9+.-]*:/i.test(spec)) return null;
  const parts = spec.split("/");
  if (spec.startsWith("@")) {
    return parts.length >= 2 && parts[0] !== "@" && parts[1] !== "" ? `${parts[0]}/${parts[1]}` : null;
  }
  return parts[0] ?? null;
}

const SPEC = String.raw`(['"])([^'"\n]+)\1`;
const PATTERNS = [
  new RegExp(String.raw`\brequire\s*\(\s*${SPEC}\s*\)`, "g"),
  new RegExp(String.raw`\bimport\s*\(\s*${SPEC}\s*[,)]`, "g"),
  new RegExp(String.raw`\bimport\s+${SPEC}`, "g"),
  new RegExp(String.raw`\b(?:import|export)\b[^'";()]*?\bfrom\s*${SPEC}`, "g"),
];

/** Package names imported by one source text. */
export function importedPackages(text: string): Set<string> {
  const out = new Set<string>();
  const clean = stripComments(text);
  for (const re of PATTERNS) {
    re.lastIndex = 0;
    for (const m of clean.matchAll(re)) {
      const pkg = packageOfSpecifier(m[2] ?? "");
      if (pkg !== null) out.add(pkg);
    }
  }
  return out;
}

/**
 * Classify every package in a package-lock.json (v2 or v3).
 * `files` maps repo-relative path to text; null means the source could not be read.
 * direct: imported in scanned source. dev: every copy in the lock is dev-only.
 * transitive: in the lock, not imported, not dev-only. unknown: no readable source.
 * Output is sorted by name.
 */
export function classifyUsage(files: ReadonlyMap<string, string> | null, lockText: string, manifest = "package-lock.json"): PackageUsage[] {
  let doc: unknown;
  try {
    doc = JSON.parse(lockText);
  } catch {
    throw new LockfileError(`${manifest}: invalid JSON`);
  }
  if (!isObj(doc) || !isObj(doc.packages) || (doc.lockfileVersion !== 2 && doc.lockfileVersion !== 3)) {
    throw new LockfileError(`${manifest}: unsupported lockfileVersion (need 2 or 3)`);
  }
  // name -> true when every copy is dev-only
  const devOnly = new Map<string, boolean>();
  for (const [path, raw] of Object.entries(doc.packages)) {
    if (path === "" || !isObj(raw) || raw.link === true) continue;
    const idx = path.lastIndexOf(NM);
    // Entries outside node_modules are workspace members (first-party), not dependencies.
    if (idx < 0) continue;
    const derived = path.slice(idx + NM.length);
    const name = typeof raw.name === "string" && raw.name !== "" ? raw.name : derived;
    if (name === "") continue;
    const dev = raw.dev === true;
    devOnly.set(name, (devOnly.get(name) ?? true) && dev);
  }

  let sourceCount = 0;
  const imported = new Set<string>();
  if (files !== null) {
    for (const [path, text] of files) {
      if (typeof text !== "string" || !isScannedSource(path)) continue;
      sourceCount++;
      for (const p of importedPackages(text)) imported.add(p);
    }
  }
  const readable = files !== null && sourceCount > 0;

  return [...devOnly.keys()]
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
    .map((name) => {
      let usage: Usage;
      if (!readable) usage = "unknown";
      else if (imported.has(name)) usage = "direct";
      else usage = devOnly.get(name) ? "dev" : "transitive";
      return { name, usage };
    });
}
