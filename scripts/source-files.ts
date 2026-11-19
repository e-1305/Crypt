// Reads the source files of a local target for the "is it used?" scan. Read-only, bounded, no symlinks.
// Any filesystem error gives null: the signal then says unknown, never a guess.
import { lstatSync, readFileSync, readdirSync } from "node:fs";
import { extname, join } from "node:path";
import type { SourceFile } from "../src/exhume/usage.js";

export const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "build", "coverage", "out"]);
export const SOURCE_EXTENSIONS = new Set([".js", ".mjs", ".cjs", ".jsx", ".ts", ".tsx", ".mts", ".cts"]);
export const MAX_FILES = 5000;
export const MAX_FILE_BYTES = 1024 * 1024;

export function readSourceFiles(root: string): SourceFile[] | null {
  try {
    const out: SourceFile[] = [];
    const walk = (dir: string, rel: string): void => {
      for (const e of readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
        if (out.length >= MAX_FILES) return;
        if (e.isSymbolicLink()) continue;
        const full = join(dir, e.name);
        const r = rel === "" ? e.name : `${rel}/${e.name}`;
        if (e.isDirectory()) {
          if (!SKIP_DIRS.has(e.name)) walk(full, r);
        } else if (e.isFile() && SOURCE_EXTENSIONS.has(extname(e.name))) {
          const st = lstatSync(full);
          if (st.size > MAX_FILE_BYTES) continue;
          out.push({ path: r, text: readFileSync(full, "utf8") });
        }
      }
    };
    walk(root, "");
    return out;
  } catch {
    return null;
  }
}
