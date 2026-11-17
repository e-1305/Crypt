// npm registry client: GET metadata for one exact version. It never downloads a tarball and never runs package code.
import type { RegistryClient, RegistryVersion } from "../src/registry/types.js";
import { redact, type AuditLine, type Fetcher } from "./github-client.js";

const DEFAULT_BASE = "https://registry.npmjs.org";
const NAME = /^(?:@[a-z0-9~][a-z0-9._~-]*\/)?[a-z0-9~][a-z0-9._~-]*$/;
const VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

export interface RegistryClientOptions {
  fetch?: Fetcher;
  audit?: (line: AuditLine) => void;
  base?: string;
  timeoutMs?: number;
  /** Strings (such as a GitHub token) removed from every error message. The registry request itself carries none. */
  secrets?: string[];
}

function stringMap(v: unknown, what: string): Record<string, string> {
  if (v === undefined) return {};
  if (typeof v !== "object" || v === null || Array.isArray(v)) throw new Error(`registry answer has an invalid ${what}`);
  const out: Record<string, string> = {};
  for (const [k, x] of Object.entries(v)) {
    if (typeof x !== "string") throw new Error(`registry answer has an invalid ${what}`);
    out[k] = x;
  }
  return out;
}

export function npmRegistryClient(o: RegistryClientOptions = {}): RegistryClient {
  const f = o.fetch ?? (fetch as unknown as Fetcher);
  const base = new URL(o.base ?? DEFAULT_BASE);
  return {
    async getVersion(name, version) {
      try {
        return await read(name, version);
      } catch (e) {
        let msg = String((e as Error)?.message ?? "request failed");
        for (const secret of o.secrets ?? []) msg = redact(msg, secret);
        throw new Error(msg);
      }
    },
  };
  async function read(name: string, version: string): Promise<RegistryVersion> {
    if (!NAME.test(name) || !VERSION.test(version)) throw new Error("invalid package name or version");
    const path = `/${name.replace("/", "%2F")}/${version}`;
    o.audit?.({ method: "GET", path });
    const res = await f(`${base.origin}${path}`, { method: "GET", headers: { accept: "application/json" }, signal: AbortSignal.timeout(o.timeoutMs ?? 20_000) });
    if (!res.ok) throw new Error(`npm registry GET ${path} failed (${res.status})`);
    const j = (await res.json()) as Record<string, unknown> | null;
    if (typeof j !== "object" || j === null) throw new Error("registry answer is not an object");
    if (j.name !== name || j.version !== version) throw new Error("registry answered for a different package or version");
    const dist = j.dist as Record<string, unknown> | undefined;
    if (typeof dist !== "object" || dist === null) throw new Error("registry answer has no dist metadata");
    const integrity = dist.integrity;
    if (typeof integrity !== "string" || !/^sha512-[A-Za-z0-9+/]+={0,2}$/.test(integrity)) {
      throw new Error("registry gave no sha512 integrity for this version; refusing to guess");
    }
    const tarball = dist.tarball;
    if (typeof tarball !== "string") throw new Error("registry answer has no tarball URL");
    const url = new URL(tarball);
    if (url.protocol !== "https:" || url.host !== base.host) throw new Error("tarball URL is not an https URL on the registry host");
    return {
      version,
      resolved: url.href,
      integrity,
      dependencies: stringMap(j.dependencies, "dependencies"),
      optionalDependencies: stringMap(j.optionalDependencies, "optionalDependencies"),
      peerDependencies: stringMap(j.peerDependencies, "peerDependencies"),
    };
  }
}
