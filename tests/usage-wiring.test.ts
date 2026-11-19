import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildCreature, summarize } from "../src/exhume/creature.js";
import { attachUsage } from "../src/exhume/usage.js";
import { buildOcsf } from "../src/alerts/ocsf.js";
import { buildSarif } from "../src/alerts/sarif.js";
import { readSourceTree } from "../scripts/source-tree.js";

const DIR = join(import.meta.dirname, "fixtures", "usage");
const lock = readFileSync(join(DIR, "package-lock.json"), "utf8");
const memFs = () => {
  const m = new Map<string, string>();
  return { read: (p: string) => m.get(p) ?? null, write: (p: string, t: string) => void m.set(p, t) };
};

async function creature(sourceFiles?: ReadonlyMap<string, string> | null) {
  return buildCreature({
    repo: { read: (p) => (p === "package-lock.json" ? lock : null) },
    cacheFs: memFs(),
    cacheDir: "c",
    kev: null,
    epss: null,
    now: 0,
    sourceFiles,
  });
}

describe("P3b usage wiring", () => {
  it("reads the local source tree and labels npm limbs", async () => {
    const files = readSourceTree(DIR);
    expect(files?.has("src/index.js")).toBe(true);
    const c = await creature(files);
    const by = Object.fromEntries(c.limbs.map((l) => [l.name, (l as { usage?: string }).usage]));
    expect(by.express).toBe("direct");
    expect(by.lodash).toBe("direct");
  });

  it("writes no usage field when no source was given, and 'unknown' when the source could not be read", async () => {
    expect((await creature(undefined)).limbs.every((l) => !("usage" in l))).toBe(true);
    expect((await creature(null)).limbs.every((l) => (l as { usage?: string }).usage === "unknown")).toBe(true);
  });

  it("attachUsage is fail-safe on a bad lockfile and leaves other ecosystems alone", () => {
    const out = attachUsage([{ ecosystem: "npm", name: "a" }, { ecosystem: "PyPI", name: "b" }], new Map(), "{not json");
    expect(out).toEqual([{ ecosystem: "npm", name: "a", usage: "unknown" }, { ecosystem: "PyPI", name: "b" }]);
  });

  it("the summary, OCSF and SARIF carry the signal", async () => {
    const c = await creature(readSourceTree(DIR));
    const spawned = { ...c, limbs: c.limbs.map((l, i) => (i === 0 ? { ...l, spawned: true, state: "Rotting", vulns: [{ id: "GHSA-x", cves: [] }] } : l)) };
    const first = spawned.limbs[0] as { usage?: string };
    const label = { direct: "imported directly", transitive: "only through another package", dev: "dev only", unknown: "usage unknown" }[first.usage ?? "unknown"]!;
    expect(summarize(spawned as typeof c)).toContain(label);
    expect(buildOcsf(spawned, new Date(0))[0]!.unmapped.usage).toBe(first.usage);
    expect(buildSarif(spawned, new Date(0)).runs[0]!.results[0]!.properties.usage).toBe(first.usage);
  });
});
