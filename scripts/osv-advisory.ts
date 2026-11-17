// Advisory sources with affected ranges: OSV (network) and a local fixture directory (offline).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseAdvisory } from "../src/necromancer/advisory.js";
import type { AdvisoryLookup } from "../src/necromancer/index.js";

const ID = /^[A-Za-z0-9_.-]{1,64}$/;

export function osvAdvisories(): AdvisoryLookup {
  return async (id) => {
    if (!ID.test(id)) return null;
    try {
      const res = await fetch(`https://api.osv.dev/v1/vulns/${encodeURIComponent(id)}`, { signal: AbortSignal.timeout(20_000) });
      if (!res.ok) return null;
      return parseAdvisory(await res.json());
    } catch {
      return null;
    }
  };
}

export function fixtureAdvisories(dir: string): AdvisoryLookup {
  return async (id) => {
    if (!ID.test(id)) return null; // never leaves the directory
    try {
      return parseAdvisory(JSON.parse(readFileSync(join(dir, `${id}.json`), "utf8")));
    } catch {
      return null;
    }
  };
}
