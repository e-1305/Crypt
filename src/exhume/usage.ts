// The static "is it used?" signal for npm limbs. Pure: no fs, no network, no clock.
// A text scan of source files for require/import of the package name, combined with the lockfile dev flag
// and the root package declarations. It is a hint, not proof: it cannot see dynamic requires, bundler aliases
// or code run by tools. Fail-safe: anything that cannot be read or parsed is "unknown".

export type UsageSignal = "imported directly" | "transitive only" | "dev only" | "unknown";

export const USAGE_SIGNALS: readonly UsageSignal[] = ["imported directly", "transitive only", "dev only", "unknown"];

export interface UsageResult {
  signal: UsageSignal;
  basis: string;
}

export interface SourceFile {
  path: string;
  text: string;
}

/** One-line limit note for the plate footer and CLI text. */
export const USAGE_LIMIT_LINE = "USED?: text scan of imports, a hint, not proof";

/** Longer limit note for the paste result and the manual. */
export const USAGE_LIMITS_TEXT =
  "Static text scan only. Looks for require/import of the package name in source files and the lockfile dev flag. It cannot see dynamic requires, bundler aliases, or code run by tools. The web version cannot read your source, so it shows only dev only or unknown.";

export const isUsageSignal = (v: unknown): v is UsageSignal => typeof v === "string" && (USAGE_SIGNALS as readonly string[]).includes(v);

/** Usage of a value read from untrusted data: anything else is "unknown". */
export const usageOf = (v: unknown): UsageSignal => (isUsageSignal(v) ? v : "unknown");

// Specifier forms. The string must be an exact literal in single, double or back quotes (no interpolation).
const SPEC = String.raw`(["'\x60])([^"'\x60\n\\]+)\1`;
const PATTERNS: RegExp[] = [
  new RegExp(String.raw`\b(?:require)(?:\.resolve)?\s*\(\s*` + SPEC + String.raw`\s*[,)]`, "g"),
  new RegExp(String.raw`\bimport\s*\(\s*` + SPEC + String.raw`\s*[,)]`, "g"),
  new RegExp(String.raw`\bimport\s+` + SPEC, "g"),
  new RegExp(String.raw`\b(?:import|export)\b[^;"'\x60]*?\bfrom\s*` + SPEC, "g"),
];

/** "pkg/sub" -> "pkg", "@scope/pkg/sub" -> "@scope/pkg". Null for relative, absolute, node: and other non-package specifiers. */
export function packageOfSpecifier(spec: string): string | null {
  if (spec === "" || spec.startsWith(".") || spec.startsWith("/") || spec.startsWith("node:") || /^[a-z][a-z0-9+.-]*:/i.test(spec)) return null;
  const parts = spec.split("/");
  if (spec.startsWith("@")) {
    if (parts.length < 2 || parts[0]!.length < 2 || parts[1] === "") return null;
    return `${parts[0]}/${parts[1]}`;
  }
  return parts[0]!;
}

export function scanImports(files: readonly SourceFile[]): Set<string> {
  const found = new Set<string>();
  for (const f of files) {
    if (typeof f?.text !== "string") continue;
    for (const re of PATTERNS) {
      re.lastIndex = 0;
      for (let m = re.exec(f.text); m !== null; m = re.exec(f.text)) {
        const pkg = packageOfSpecifier(m[2]!);
        if (pkg) found.add(pkg);
      }
    }
  }
  return found;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * Signal per `name@version` of the lockfile. `imports` is null when the source could not be read or held no source files.
 * Rules, in order: (1) every entry is dev:true -> dev only; (2) no source -> unknown; (3) imported -> imported directly;
 * (4) not imported and not declared by the root package -> transitive only; (5) otherwise unknown.
 * A lockfile that cannot be parsed gives an empty map: callers treat a missing key as unknown.
 */
export function classifyUsage(lockText: string, imports: ReadonlySet<string> | null): Map<string, UsageResult> {
  const out = new Map<string, UsageResult>();
  let doc: unknown;
  try {
    doc = JSON.parse(lockText);
  } catch {
    return out;
  }
  if (!isObj(doc) || !isObj(doc.packages)) return out;
  const root = isObj(doc.packages[""]) ? (doc.packages[""] as Record<string, unknown>) : {};
  const declared = new Set<string>();
  for (const f of ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"]) {
    if (isObj(root[f])) for (const n of Object.keys(root[f] as object)) declared.add(n);
  }
  const entries = new Map<string, { name: string; version: string; allDev: boolean }>();
  for (const [path, raw] of Object.entries(doc.packages)) {
    if (path === "" || !isObj(raw) || raw.link === true) continue;
    if (typeof raw.version !== "string" || raw.version === "") continue;
    const idx = path.lastIndexOf("node_modules/");
    const derived = idx >= 0 ? path.slice(idx + "node_modules/".length) : "";
    const name = typeof raw.name === "string" && raw.name !== "" ? raw.name : derived;
    if (name === "") continue;
    const key = `${name}@${raw.version}`;
    const prev = entries.get(key);
    const dev = raw.dev === true;
    if (prev) prev.allDev = prev.allDev && dev;
    else entries.set(key, { name, version: raw.version, allDev: dev });
  }
  for (const [key, e] of entries) {
    if (e.allDev) out.set(key, { signal: "dev only", basis: "lockfile marks every copy as a dev dependency" });
    else if (imports === null) out.set(key, { signal: "unknown", basis: "source not read" });
    else if (imports.has(e.name)) out.set(key, { signal: "imported directly", basis: "require or import of the name found in source" });
    else if (!declared.has(e.name)) out.set(key, { signal: "transitive only", basis: "no import in source and not declared by the root package" });
    else out.set(key, { signal: "unknown", basis: "declared but no import found (tool, config or dynamic require?)" });
  }
  return out;
}

/** What one limb gets. PyPI is not scanned. */
export function usageForLimb(
  l: { ecosystem: string; name: string; version: string },
  table: ReadonlyMap<string, UsageResult> | null,
): UsageResult {
  if (l.ecosystem !== "npm") return { signal: "unknown", basis: "npm only" };
  return table?.get(`${l.name}@${l.version}`) ?? { signal: "unknown", basis: "not determined" };
}

/**
 * Combines several copies of one package: any copy imported directly wins, else transitive only,
 * else dev only when every copy is dev only, else unknown.
 */
export function combineUsage(signals: readonly unknown[]): UsageSignal {
  const s = signals.map(usageOf);
  if (s.length === 0) return "unknown";
  if (s.includes("imported directly")) return "imported directly";
  if (s.includes("transitive only")) return "transitive only";
  if (s.every((x) => x === "dev only")) return "dev only";
  return "unknown";
}
