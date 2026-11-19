// Collects source text for the usage scan from a reader that fetches one path at a time (raw.githubusercontent.com has no directory listing).
// Starts at the package.json entry points and the usual index files, then follows relative imports. Bounded, and any failure just ends the crawl.
export type SourceReader = (path: string) => Promise<string | null> | string | null;

export const MAX_SOURCE_FILES = 30;
const EXTS = [".js", ".mjs", ".cjs", ".ts", ".tsx", ".jsx"];
const DEFAULT_ENTRIES = ["index.js", "index.mjs", "index.cjs", "index.ts", "src/index.js", "src/index.ts", "src/index.mjs", "src/main.js", "src/main.ts", "src/app.js", "src/app.ts", "lib/index.js", "app.js", "server.js"];
const REL = /(?:\bfrom\s*|\brequire\s*\(\s*|\bimport\s*\(?\s*)(['"])(\.{1,2}\/[^'"\n]*)\1/g;

function normalize(p: string): string | null {
  const out: string[] = [];
  for (const part of p.split("/")) {
    if (part === "" || part === ".") continue;
    if (part === "..") {
      if (out.length === 0) return null;
      out.pop();
    } else out.push(part);
  }
  return out.join("/");
}

function entriesOf(pkgText: string | null): string[] {
  const out: string[] = [];
  if (pkgText === null) return out;
  try {
    const pkg = JSON.parse(pkgText) as Record<string, unknown>;
    const add = (v: unknown) => {
      if (typeof v === "string") out.push(v);
    };
    add(pkg.main);
    add(pkg.module);
    if (typeof pkg.bin === "string") add(pkg.bin);
    else if (pkg.bin && typeof pkg.bin === "object") Object.values(pkg.bin).forEach(add);
  } catch {
    // unreadable package.json: fall back to the default entries
  }
  return out.map((e) => normalize(e)).filter((e): e is string => e !== null);
}

function candidates(from: string, spec: string): string[] {
  const dir = from.includes("/") ? from.slice(0, from.lastIndexOf("/")) : "";
  const base = normalize(`${dir}/${spec}`);
  if (base === null || base === "") return [];
  const hasExt = EXTS.some((e) => base.endsWith(e));
  return hasExt ? [base] : [...EXTS.map((e) => base + e), ...EXTS.map((e) => `${base}/index${e}`)];
}

/** Returns null when nothing could be read, so the caller reports usage unknown. Never throws. */
export async function collectSources(read: SourceReader): Promise<Map<string, string> | null> {
  const files = new Map<string, string>();
  const tried = new Set<string>();
  const safe = async (p: string): Promise<string | null> => {
    try {
      return await read(p);
    } catch {
      return null;
    }
  };
  const queue: string[][] = [[...new Set([...entriesOf(await safe("package.json")), ...DEFAULT_ENTRIES])]];
  while (queue.length > 0 && files.size < MAX_SOURCE_FILES) {
    const group = queue.shift()!;
    for (const path of group) {
      if (files.size >= MAX_SOURCE_FILES) break;
      if (tried.has(path)) continue;
      tried.add(path);
      const text = await safe(path);
      if (text === null) continue;
      files.set(path, text);
      for (const m of text.matchAll(REL)) {
        const alts = candidates(path, m[2] ?? "").filter((c) => !tried.has(c));
        if (alts.length > 0) queue.push(alts);
      }
    }
  }
  return files.size > 0 ? files : null;
}
