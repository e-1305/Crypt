// Advisory sources with affected ranges: OSV (network) and a local fixture directory (offline).
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { parseAdvisory } from "../src/necromancer/advisory.js";
import type { AdvisoryLookup } from "../src/necromancer/index.js";
import { fetchPackageAdvisories } from "../src/necromancer/package-advisories.js";
import type { Advisory } from "../src/necromancer/version.js";

const ID = /^[A-Za-z0-9_.-]{1,64}$/;

export function osvAdvisories(): AdvisoryLookup {
  const lookup: AdvisoryLookup = async (id) => {
    if (!ID.test(id)) return null;
    try {
      const res = await fetch(`https://api.osv.dev/v1/vulns/${encodeURIComponent(id)}`, { signal: AbortSignal.timeout(20_000) });
      if (!res.ok) return null;
      return parseAdvisory(await res.json());
    } catch {
      return null;
    }
  };
  lookup.forPackage = async (ecosystem, name) => {
    const r = await fetchPackageAdvisories((url, init) => fetch(url, { ...init, signal: AbortSignal.timeout(20_000) }), ecosystem, name);
    return r.ok ? r.advisories : null;
  };
  return lookup;
}

export function fixtureAdvisories(dir: string): AdvisoryLookup {
  const lookup: AdvisoryLookup = async (id) => {
    if (!ID.test(id)) return null; // never leaves the directory
    try {
      return parseAdvisory(JSON.parse(readFileSync(join(dir, `${id}.json`), "utf8")));
    } catch {
      return null;
    }
  };
  // Offline: every advisory in the folder that names the package.
  lookup.forPackage = async (ecosystem, name) => {
    try {
      const out: Advisory[] = [];
      for (const f of readdirSync(dir).filter((x) => x.endsWith(".json")).sort()) {
        const a = parseAdvisory(JSON.parse(readFileSync(join(dir, f), "utf8")));
        if (!a) return null;
        if (a.affected.some((x) => x.package.ecosystem === ecosystem && x.package.name === name)) out.push(a);
      }
      return out;
    } catch {
      return null;
    }
  };
  return lookup;
}
