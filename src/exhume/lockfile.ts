import { type Limb, UNKNOWN_VERSION, compareLimbs, limbKey } from "./types.js";

export class LockfileError extends Error {}
/** The lockfile is over a size cap. Nothing was parsed, so nothing is drawn. */
export class LockfileTooLargeError extends LockfileError {}

export const MAX_LOCKFILE_CHARS = 20 * 1024 * 1024;
export const MAX_LOCKFILE_PACKAGES = 20_000;

const NM = "node_modules/";

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function parsePackageLock(text: string, manifest: string): Limb[] {
  if (text.length > MAX_LOCKFILE_CHARS) {
    throw new LockfileTooLargeError(`${manifest}: larger than the ${MAX_LOCKFILE_CHARS / 1024 / 1024} MB cap, so nothing was parsed`);
  }
  let doc: unknown;
  try {
    doc = JSON.parse(text);
  } catch {
    throw new LockfileError(`${manifest}: invalid JSON`);
  }
  if (!isObj(doc)) throw new LockfileError(`${manifest}: not an object`);
  const v = doc.lockfileVersion;
  if ((v !== 2 && v !== 3) || !isObj(doc.packages)) {
    throw new LockfileError(`${manifest}: unsupported lockfileVersion (need 2 or 3)`);
  }
  const root = isObj(doc.packages[""]) ? (doc.packages[""] as Record<string, unknown>) : {};
  const direct = new Set<string>();
  for (const f of ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"]) {
    if (isObj(root[f])) for (const n of Object.keys(root[f] as object)) direct.add(n);
  }
  const entries = Object.entries(doc.packages);
  if (entries.length > MAX_LOCKFILE_PACKAGES) {
    throw new LockfileTooLargeError(`${manifest}: more than the ${MAX_LOCKFILE_PACKAGES} package cap, so nothing was parsed`);
  }
  const byKey = new Map<string, Limb>();
  for (const [path, raw] of entries) {
    if (path === "" || !isObj(raw) || raw.link === true) continue;
    if (typeof raw.version !== "string" || raw.version === "") continue;
    const idx = path.lastIndexOf(NM);
    const derived = idx >= 0 ? path.slice(idx + NM.length) : "";
    const name = typeof raw.name === "string" && raw.name !== "" ? raw.name : derived;
    if (name === "") continue;
    const topLevel = path === NM + derived && path.indexOf(NM) === path.lastIndexOf(NM);
    const limb: Limb = {
      ecosystem: "npm",
      name,
      version: raw.version,
      direct: topLevel && direct.has(name),
      manifest,
    };
    const key = limbKey(limb);
    const prev = byKey.get(key);
    if (prev) prev.direct = prev.direct || limb.direct;
    else byKey.set(key, limb);
  }
  return [...byKey.values()].sort(compareLimbs);
}

/**
 * yarn.lock is not supported yet (#361). This stub always throws, so a
 * yarn.lock is never silently read as an empty tree.
 */
export function parseYarnLock(text: string, manifest: string): Limb[] {
  throw new LockfileError(`${manifest}: yarn.lock is not supported yet`);
}

export function normalizePypiName(name: string): string {
  return name.toLowerCase().replace(/[-_.]+/g, "-");
}

const PINNED =
  /^([A-Za-z0-9][A-Za-z0-9._-]*)(?:\[[^\]]*\])?\s*==\s*([A-Za-z0-9][A-Za-z0-9._+!-]*)\s*(?:;[^#]*)?(?:\s#.*)?$/;
const NAMED = /^([A-Za-z0-9][A-Za-z0-9._-]*)/;

export function parseRequirements(text: string, manifest: string): Limb[] {
  const byKey = new Map<string, Limb>();
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === "" || line.startsWith("#") || line.startsWith("-")) continue;
    const pinned = PINNED.exec(line);
    let name: string;
    let version = UNKNOWN_VERSION;
    if (pinned && !pinned[2]!.includes("*")) {
      name = pinned[1]!;
      version = pinned[2]!;
    } else {
      const named = NAMED.exec(line);
      if (!named || /^[a-z][a-z0-9+.-]*:/i.test(line)) continue;
      name = named[1]!;
    }
    const limb: Limb = { ecosystem: "PyPI", name: normalizePypiName(name), version, direct: true, manifest };
    byKey.set(limbKey(limb), limb);
  }
  return [...byKey.values()].sort(compareLimbs);
}
