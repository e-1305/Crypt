// Reads the source files of a local target for the "is it used?" scan. Read-only, bounded, no symlinks.
// Any filesystem error gives null: the signal then says unknown, never a guess.
import { lstatSync, readFileSync, readdirSync } from "node:fs";
import { extname, join } from "node:path";
import type { SourceFile } from "../src/exhume/usage.js";

export const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "build", "coverage", "out"]);
export const SOURCE_EXTENSIONS = new Set([".js", ".mjs", ".cjs", ".jsx", ".ts", ".tsx", ".mts", ".cts"]);
export const MAX_FILES = 5000;
export const MAX_FILE_BYTES = 1024 * 1024;
// Source in these formats is not scanned. Finding one means the scan would be partial, so the result is null (unknown).
export const UNSCANNED_EXTENSIONS = new Set([".vue", ".svelte", ".astro", ".mdx", ".coffee"]);

/** Null when the read is partial (file cap, oversized file, unscanned source format) or fails: the signal then says unknown. */
export function readSourceFiles(root: string, maxFiles: number = MAX_FILES): SourceFile[] | null {
  try {
    const out: SourceFile[] = [];
    let partial = false;
    const walk = (dir: string, rel: string): void => {
      for (const e of readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
        if (partial) return;
        if (e.isSymbolicLink()) continue;
        const full = join(dir, e.name);
        const r = rel === "" ? e.name : `${rel}/${e.name}`;
        if (e.isDirectory()) {
          if (!SKIP_DIRS.has(e.name)) walk(full, r);
        } else if (e.isFile() && UNSCANNED_EXTENSIONS.has(extname(e.name))) {
          partial = true;
        } else if (e.isFile() && SOURCE_EXTENSIONS.has(extname(e.name))) {
          if (out.length >= maxFiles || lstatSync(full).size > MAX_FILE_BYTES) {
            partial = true;
            return;
          }
          out.push({ path: r, text: readFileSync(full, "utf8") });
        }
      }
    };
    walk(root, "");
    return partial ? null : out;
  } catch {
    return null;
  }
}
