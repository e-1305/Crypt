// P3: read the source files the import scan looks at, from a local checkout. Bounded and fail-safe: null on any error.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { isScannedSource } from "../src/exhume/usage.js";

const MAX_FILES = 5000;
const MAX_BYTES = 1_000_000;
const SKIP = new Set(["node_modules", ".git", "dist", "build", "coverage", "vendor"]);

export function readSourceTree(root: string): Map<string, string> | null {
  try {
    const out = new Map<string, string>();
    const stack = [root];
    while (stack.length > 0) {
      const dir = stack.pop()!;
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        if (e.isSymbolicLink()) continue;
        const full = join(dir, e.name);
        if (e.isDirectory()) {
          if (!SKIP.has(e.name)) stack.push(full);
          continue;
        }
        const rel = relative(root, full).split(sep).join("/");
        if (!e.isFile() || !isScannedSource(rel)) continue;
        if (statSync(full).size > MAX_BYTES) continue;
        out.set(rel, readFileSync(full, "utf8"));
        if (out.size >= MAX_FILES) return out;
      }
    }
    return out;
  } catch {
    return null;
  }
}
