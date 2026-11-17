// Pure npm lockfile bump from registry metadata (lockfileVersion 2 or 3). Nothing is installed or run.
import type { RegistryVersion } from "../registry/types.js";
import { compareVersions, parseVersion } from "./version.js";

type Json = Record<string, unknown>;
const isObj = (v: unknown): v is Json => typeof v === "object" && v !== null && !Array.isArray(v);

export type BumpAbort =
  | "invalid-json"
  | "lockfile-version"
  | "not-direct-dependency"
  | "lock-entry-count"
  | "dependencies-changed"
  | "integrity-invalid"
  | "version-mismatch"
  | "version-below-fixed";

export const BUMP_MESSAGES: Record<BumpAbort, string> = {
  "invalid-json": "package.json or package-lock.json is not valid JSON",
  "lockfile-version": "package-lock.json must use lockfileVersion 2 or 3",
  "not-direct-dependency": "the package is not a direct dependency in package.json",
  "lock-entry-count": "package-lock.json must hold exactly one entry for the package at the current version",
  "dependencies-changed": "the new version declares different dependencies, so the lockfile tree would change",
  "integrity-invalid": "the registry gave no sha512 integrity for the new version",
  "version-mismatch": "the registry answered for a different version than requested",
  "version-below-fixed": "the new version is below the fixed version",
};

export type BumpResult = { ok: true; pkg: string; lock: string } | { ok: false; reason: BumpAbort };

export interface BumpInput {
  pkgText: string;
  lockText: string;
  name: string;
  from: string;
  meta: RegistryVersion;
  fixed: string;
}

export function jsonIndent(text: string): number | string {
  const m = /^[{[]\r?\n([ \t]+)"/.exec(text);
  return m ? m[1]! : 2;
}

export function respec(old: string, version: string): string {
  return /^[\^~]/.test(old) ? old[0] + version : version;
}

const DEP_KEYS = ["dependencies", "devDependencies", "optionalDependencies"];

function sameMap(a: unknown, b: Record<string, string>): boolean {
  const x = isObj(a) ? a : {};
  const ka = Object.keys(x).sort();
  const kb = Object.keys(b).sort();
  return ka.length === kb.length && ka.every((k, i) => k === kb[i] && x[k] === b[k]);
}

/** Replaces version, resolved and integrity in place; keeps every other field and the key order. */
function rewriteEntry(entry: Json, meta: RegistryVersion): Json {
  const out: Json = {};
  for (const k of Object.keys(entry)) {
    if (k === "version") {
      out.version = meta.version;
      out.resolved = meta.resolved;
      out.integrity = meta.integrity;
    } else if (k !== "resolved" && k !== "integrity") out[k] = entry[k];
  }
  return out;
}

export function bumpLockfile(input: BumpInput): BumpResult {
  const { name, from, meta } = input;
  const fail = (reason: BumpAbort): BumpResult => ({ ok: false, reason });
  let pkg: unknown;
  let lock: unknown;
  try {
    pkg = JSON.parse(input.pkgText);
    lock = JSON.parse(input.lockText);
  } catch {
    return fail("invalid-json");
  }
  if (!isObj(pkg) || !isObj(lock)) return fail("invalid-json");
  if (lock.lockfileVersion !== 2 && lock.lockfileVersion !== 3) return fail("lockfile-version");
  const packages = lock.packages;
  if (!isObj(packages)) return fail("lockfile-version");

  const newV = parseVersion(meta.version);
  const fixedV = parseVersion(input.fixed);
  if (meta.version === from || !newV || !fixedV) return fail("version-mismatch");
  if (compareVersions(newV, fixedV) < 0) return fail("version-below-fixed");
  if (!/^sha512-[A-Za-z0-9+/]+={0,2}$/.test(meta.integrity) || !/^https:\/\//.test(meta.resolved)) return fail("integrity-invalid");

  const direct = DEP_KEYS.filter((k) => isObj(pkg[k]) && typeof (pkg[k] as Json)[name] === "string");
  if (direct.length === 0) return fail("not-direct-dependency");

  const keys = Object.keys(packages).filter((k) => {
    if (k !== `node_modules/${name}` && !k.endsWith(`/node_modules/${name}`)) return false;
    const e = packages[k];
    return isObj(e) && e.version === from;
  });
  if (keys.length !== 1) return fail("lock-entry-count");
  const key = keys[0]!;
  const entry = packages[key] as Json;
  if (
    !sameMap(entry.dependencies, meta.dependencies) ||
    !sameMap(entry.optionalDependencies, meta.optionalDependencies) ||
    !sameMap(entry.peerDependencies, meta.peerDependencies)
  ) {
    return fail("dependencies-changed");
  }

  for (const k of direct) {
    const deps = pkg[k] as Json;
    deps[name] = respec(deps[name] as string, meta.version);
  }
  packages[key] = rewriteEntry(entry, meta);
  const root = packages[""];
  if (isObj(root)) {
    for (const k of DEP_KEYS) {
      const deps = root[k];
      if (isObj(deps) && typeof deps[name] === "string") deps[name] = respec(deps[name] as string, meta.version);
    }
  }
  if (lock.lockfileVersion === 2 && isObj(lock.dependencies) && isObj(lock.dependencies[name])) {
    const legacy = lock.dependencies[name] as Json;
    if (legacy.version === from) lock.dependencies[name] = rewriteEntry(legacy, meta);
  }
  return {
    ok: true,
    pkg: JSON.stringify(pkg, null, jsonIndent(input.pkgText)) + "\n",
    lock: JSON.stringify(lock, null, jsonIndent(input.lockText)) + "\n",
  };
}
