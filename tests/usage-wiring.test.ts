import { describe, expect, it } from "vitest";
import { buildCreature } from "../src/exhume/creature.js";
import { collectSources } from "../src/exhume/usage-sources.js";
import { USAGE_FOOTNOTE, USAGE_LABELS, groupUsage, usageLabel } from "../src/exhume/usage-label.js";

const LOCK = JSON.stringify({
  lockfileVersion: 3,
  packages: {
    "": { name: "app" },
    "node_modules/lodash": { version: "4.17.15" },
    "node_modules/ms": { version: "2.1.3" },
    "node_modules/jest": { version: "29.0.0", dev: true },
  },
});
const mem = (files: Record<string, string>) => ({ read: (p: string) => files[p] ?? null, write: () => undefined });

describe("usage labels", () => {
  it("use the exact words", () => {
    expect(USAGE_LABELS).toEqual({ direct: "imported directly", transitive: "only through another package", dev: "dev only", unknown: "unknown" });
    expect(USAGE_FOOTNOTE).toBe("Static check of imports, not a proof that the vulnerable code runs.");
    expect(usageLabel("nonsense")).toBe("unknown");
    expect(groupUsage([{ usage: "dev" }, { usage: "direct" }])).toBe("direct");
    expect(groupUsage([{}])).toBe("unknown");
  });
});

describe("collectSources", () => {
  it("follows relative imports from the entry point and never throws", async () => {
    const files: Record<string, string> = {
      "package.json": JSON.stringify({ main: "./src/index.js" }),
      "src/index.js": 'const x = require("./util"); import "lodash";',
      "src/util.js": "module.exports = 1;",
    };
    const got = await collectSources((p) => files[p] ?? null);
    expect([...got!.keys()].sort()).toEqual(["src/index.js", "src/util.js"]);
    expect(await collectSources(() => null)).toBeNull();
    expect(await collectSources(() => Promise.reject(new Error("net")))).toBeNull();
  });
});

describe("buildCreature usage", () => {
  const base = { cacheFs: mem({}), cacheDir: "c", kev: null, epss: null, lookup: async () => new Map() };
  it("sets usage per limb from the scanned sources", async () => {
    const c = await buildCreature({ ...base, repo: mem({ "package-lock.json": LOCK }), sources: new Map([["src/index.js", 'import _ from "lodash";']]) });
    expect(Object.fromEntries(c.limbs.map((l) => [l.name, l.usage]))).toEqual({ lodash: "direct", ms: "transitive", jest: "dev" });
  });
  it("reads unknown without sources, and on a lockfile it cannot classify", async () => {
    const c = await buildCreature({ ...base, repo: mem({ "package-lock.json": LOCK }) });
    expect(new Set(c.limbs.map((l) => l.usage))).toEqual(new Set(["unknown"]));
    const v1 = JSON.stringify({ lockfileVersion: 1, dependencies: {} });
    await expect(buildCreature({ ...base, repo: mem({ "package-lock.json": v1 }), sources: new Map() })).rejects.toThrow();
  });
});
