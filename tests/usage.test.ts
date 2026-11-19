import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { readFileSync } from "node:fs";
import { numRuns } from "./runs.js";
import { buildCreature } from "../src/exhume/creature.js";
import { buildOcsf } from "../src/alerts/ocsf.js";
import { groupLimbs } from "../src/exhume/group.js";
import { classifyUsage, combineUsage, scanImports, USAGE_LIMIT_LINE, USAGE_SIGNALS } from "../src/exhume/usage.js";
import type { OsvLookup } from "../src/exhume/osv.js";
import { renderPlate } from "../src/render/plate.js";
import { toCsv, toJson } from "../src/web/report-export.js";
import { nodeFs } from "../scripts/node-fs.js";
import { readSourceFiles } from "../scripts/source-files.js";
import { liveExhume, type FetchLike } from "../src/web/live-exhume.js";
import { parseFeedSnapshot } from "../src/web/feed-snapshot.js";
import { feedSnapshotText } from "../scripts/build-site.js";

const offline: OsvLookup = async () => new Map();
const clean: OsvLookup = async (limbs) => new Map(limbs.map((l) => [`${l.ecosystem}:${l.name}@${l.version}`, []]));
const memFs = () => {
  const m = new Map<string, string>();
  return { read: (p: string) => m.get(p) ?? null, write: (p: string, t: string) => void m.set(p, t) };
};

async function exhume(dir: string, sources?: () => { path: string; text: string }[] | null) {
  return buildCreature({
    repo: nodeFs(dir),
    cacheFs: memFs(),
    cacheDir: "osv",
    kev: null,
    epss: null,
    lookup: offline,
    sources,
  });
}
const usageOfName = (c: Awaited<ReturnType<typeof exhume>>, name: string, version?: string) =>
  c.limbs.filter((l) => l.name === name && (!version || l.version === version)).map((l) => l.usage);

describe("scanImports", () => {
  it("finds require, import, import(), export from, require.resolve and side-effect imports", () => {
    const text = `
      const a = require("a");
      import b from 'b';
      import { c } from "c";
      import "d";
      const e = await import("e");
      export * from "f";
      export { g } from "g";
      require.resolve("h");
      import type { T } from "i";
      import * as j
        from "j";`;
    expect([...scanImports([{ path: "x.ts", text }])].sort()).toEqual(["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"]);
  });
  it("reduces subpaths and keeps scopes", () => {
    const s = scanImports([{ path: "x.js", text: `require("lodash/fp"); import "@scope/pkg/lib/x"; import("@a/b");` }]);
    expect([...s].sort()).toEqual(["@a/b", "@scope/pkg", "lodash"]);
  });
  it("ignores relative, absolute, node: and URL specifiers", () => {
    const text = `require("./x"); require("../y"); require("/z"); import fs from "node:fs"; import u from "https://a.b/c.js"; require(name); require("a" + b);`;
    expect(scanImports([{ path: "x.js", text }]).size).toBe(0);
  });
  it("never throws on arbitrary text", () => {
    fc.assert(
      fc.property(fc.string(), (text) => {
        const s = scanImports([{ path: "f.js", text }]);
        for (const n of s) expect(n).not.toMatch(/^[./]/);
      }),
      { numRuns: numRuns(200) },
    );
  });
});

describe("classifyUsage rules", () => {
  const lock = JSON.stringify({
    lockfileVersion: 3,
    packages: {
      "": { dependencies: { used: "1.0.0", declared: "1.0.0" }, devDependencies: { devtool: "1.0.0" } },
      "node_modules/used": { version: "1.0.0" },
      "node_modules/declared": { version: "1.0.0" },
      "node_modules/trans": { version: "1.0.0" },
      "node_modules/devtool": { version: "1.0.0", dev: true },
      "node_modules/both": { version: "1.0.0", dev: true },
      "node_modules/x/node_modules/both": { version: "1.0.0" },
      "node_modules/@s/p": { version: "2.0.0" },
    },
  });
  const sig = (m: ReturnType<typeof classifyUsage>, k: string) => m.get(k)?.signal;
  it("applies the five rules in order", () => {
    const m = classifyUsage(lock, new Set(["used", "devtool", "@s/p"]));
    expect(sig(m, "devtool@1.0.0")).toBe("dev only"); // 1: dev wins even when imported
    expect(sig(m, "used@1.0.0")).toBe("imported directly"); // 3
    expect(sig(m, "@s/p@2.0.0")).toBe("imported directly");
    expect(sig(m, "trans@1.0.0")).toBe("transitive only"); // 4
    expect(sig(m, "declared@1.0.0")).toBe("unknown"); // 5
    expect(sig(m, "both@1.0.0")).not.toBe("dev only"); // one copy is not dev
  });
  it("needs no source for dev only, and gives unknown otherwise when source is null", () => {
    const m = classifyUsage(lock, null);
    expect(sig(m, "devtool@1.0.0")).toBe("dev only");
    for (const [k, v] of m) if (k !== "devtool@1.0.0") expect(v.signal).toBe("unknown");
  });
  it("corrupt lockfile gives no entries (read as unknown)", () => {
    expect(classifyUsage("{nope", new Set(["a"])).size).toBe(0);
    expect(classifyUsage("[]", new Set()).size).toBe(0);
  });
  it("combineUsage precedence", () => {
    expect(combineUsage(["transitive only", "imported directly", "dev only"])).toBe("imported directly");
    expect(combineUsage(["dev only", "transitive only", "unknown"])).toBe("transitive only");
    expect(combineUsage(["dev only", "dev only"])).toBe("dev only");
    expect(combineUsage(["dev only", "unknown"])).toBe("unknown");
    expect(combineUsage([undefined, "nonsense"])).toBe("unknown");
    expect(combineUsage([])).toBe("unknown");
  });
});

describe("buildCreature on fixtures", () => {
  const DEMO = "fixtures/crypt-demo";
  it("crypt-demo: ms dev only, imports found, minimist transitive only, unimported declared is unknown", async () => {
    const c = await exhume(DEMO, () => readSourceFiles(DEMO));
    expect(usageOfName(c, "ms")).toEqual(["dev only"]);
    expect(usageOfName(c, "lodash")).toEqual(["imported directly"]);
    expect(usageOfName(c, "jquery")).toEqual(["imported directly"]);
    expect(usageOfName(c, "node-fetch")).toEqual(["imported directly"]);
    expect(usageOfName(c, "minimist")).toEqual(["transitive only"]);
    expect(usageOfName(c, "handlebars")).toEqual(["unknown"]);
    expect(usageOfName(c, "mkdirp")).toEqual(["unknown"]);
    for (const l of c.limbs) expect(USAGE_SIGNALS).toContain(l.usage);
  });
  it("unreadable source (null, throw, empty) gives unknown, dev only stays", async () => {
    for (const sources of [() => null, () => { throw new Error("EACCES"); }, () => [], undefined]) {
      const c = await exhume(DEMO, sources);
      expect(usageOfName(c, "ms")).toEqual(["dev only"]);
      expect(c.limbs.filter((l) => l.name !== "ms").every((l) => l.usage === "unknown")).toBe(true);
    }
  });
  it("census-like a: CJS, subpath, scope, declared-but-unimported, dev nested copy", async () => {
    const d = "fixtures/census-like/a";
    const c = await exhume(d, () => readSourceFiles(d));
    expect(usageOfName(c, "lodash")).toEqual(["imported directly"]);
    expect(usageOfName(c, "@scope/util")).toEqual(["imported directly"]);
    expect(usageOfName(c, "minimist")).toEqual(["unknown"]);
    expect(usageOfName(c, "debug")).toEqual(["unknown"]);
    expect(usageOfName(c, "mocha")).toEqual(["dev only"]);
    expect(usageOfName(c, "ms", "2.1.2")).toEqual(["transitive only"]);
    expect(usageOfName(c, "ms", "2.1.3")).toEqual(["dev only"]);
  });
  it("census-like b: ESM, dynamic import, export from", async () => {
    const d = "fixtures/census-like/b";
    const c = await exhume(d, () => readSourceFiles(d));
    expect(usageOfName(c, "express")).toEqual(["imported directly"]);
    expect(usageOfName(c, "left-pad")).toEqual(["imported directly"]);
    expect(usageOfName(c, "qs")).toEqual(["transitive only"]);
    expect(usageOfName(c, "yaml")).toEqual(["transitive only"]);
    expect(usageOfName(c, "yaml-extra")).toEqual(["dev only"]);
  });
  it("property: without source no limb is imported directly or transitive only", async () => {
    const names = fc.stringMatching(/^[a-z][a-z0-9-]{0,8}$/);
    await fc.assert(
      fc.asyncProperty(fc.array(fc.record({ name: names, dev: fc.boolean() }), { minLength: 1, maxLength: 8 }), fc.constantFrom("null", "throw", "empty"), async (pk, mode) => {
        const packages: Record<string, unknown> = { "": { dependencies: {} } };
        for (const p of pk) packages[`node_modules/${p.name}`] = { version: "1.0.0", ...(p.dev ? { dev: true } : {}) };
        const text = JSON.stringify({ lockfileVersion: 3, packages });
        const files = new Map([["package-lock.json", text]]);
        const c = await buildCreature({
          repo: { read: (p) => files.get(p) ?? null },
          cacheFs: memFs(),
          cacheDir: "osv",
          kev: null,
          epss: null,
          lookup: offline,
          sources: mode === "null" ? () => null : mode === "empty" ? () => [] : () => { throw new Error("x"); },
        });
        for (const l of c.limbs) expect(["dev only", "unknown"]).toContain(l.usage);
      }),
      { numRuns: numRuns(40) },
    );
  });
});

describe("shown everywhere", () => {
  const DEMO = "fixtures/crypt-demo";
  it("plate lists the signal and the limits line; old creatures render unknown without throwing", async () => {
    const c = await exhume(DEMO, () => readSourceFiles(DEMO));
    const spawned = { ...c, limbs: c.limbs.map((l) => ({ ...l, spawned: true })) };
    const text = renderPlate(spawned);
    expect(text).toContain(USAGE_LIMIT_LINE);
    expect(text).toContain("lodash: imported directly");
    expect(text).toContain("ms: dev only");
    for (const line of text.split("\n")) expect(line.length).toBeLessThanOrEqual(80);
    const old = { limbs: [{ ecosystem: "npm", name: "a", version: "1", state: "Rotting", rank: 1, spawned: true }] };
    expect(renderPlate(old)).toContain("a: unknown");
  });
  it("plate combines copies", () => {
    const mk = (usage: string, version: string) => ({ ecosystem: "npm", name: "a", version, state: "Rotting", rank: 1, spawned: true, usage });
    expect(renderPlate({ limbs: [mk("dev only", "1"), mk("imported directly", "2")] })).toContain("a: imported directly");
    expect(renderPlate({ limbs: [mk("dev only", "1"), mk("dev only", "2")] })).toContain("a: dev only");
  });
  it("CSV and JSON export carry a used column", async () => {
    const c = await exhume(DEMO, () => readSourceFiles(DEMO));
    const csv = toCsv(c.limbs);
    expect(csv.split("\r\n")[0]).toMatch(/,sla,owner,used$/);
    expect(csv).toMatch(/\bms,2\.1\.3,.*,dev only\r\n/);
    const json = JSON.parse(toJson({ repo: "x/y", limbs: c.limbs, feeds: { kev: "", epss: "" } }, "dry"));
    expect(json.limbs.find((l: { package: string }) => l.package === "lodash").used).toBe("imported directly");
    expect(JSON.parse(toJson({ repo: "x/y", limbs: [{ rank: 1, name: "a", version: "1", state: "Rotting", kev: false, epss: null, severity: 0 }], feeds: { kev: "", epss: "" } }, "d")).limbs[0].used).toBe("unknown");
  });
  it("OCSF unmapped.used only carries the four values", () => {
    const base = { rank: 1, name: "a", version: "1.0.0", ecosystem: "npm", owner: "@t/x", spawned: true, kev: false, epss: null, vulns: [] };
    const out = buildOcsf({ limbs: [{ ...base, usage: "dev only" }, { ...base, name: "b", usage: "reachable" }, { ...base, name: "c" }] }, new Date(0));
    expect(out.map((e) => e.unmapped.used)).toEqual(["dev only", "unknown", "unknown"]);
  });
  it("groups use the plate precedence", async () => {
    const c = await exhume(DEMO, () => readSourceFiles(DEMO));
    expect(groupLimbs(c.limbs).find((g) => g.name === "lodash")?.usage).toBe("imported directly");
  });
  it("paste flow never shows imported directly or transitive only", async () => {
    const dir = "fixtures/crypt-demo";
    const snap = parseFeedSnapshot(feedSnapshotText(["fixtures/vulnerable-npm/feeds"]));
    const f: FetchLike = async (url) => {
      const m = /\/(?:HEAD|main|master)\/(.+)$/.exec(url);
      let body: string | null = null;
      if (m && url.startsWith("https://raw.githubusercontent.com/")) {
        try { body = readFileSync(`${dir}/${m[1]}`, "utf8"); } catch { body = null; }
      }
      return { ok: body !== null, status: body === null ? 404 : 200, text: async () => body ?? "", json: async () => (body === null ? null : JSON.parse(body)) };
    };
    const r = await liveExhume("https://github.com/e-1305/crypt-demo", { fetch: f, feeds: snap, osv: clean });
    for (const l of r.limbs) expect(["dev only", "unknown"]).toContain(l.usage);
    for (const g of r.groups) expect(["dev only", "unknown"]).toContain(g.usage);
    expect(r.plate).toContain(USAGE_LIMIT_LINE);
  });
});

describe("wording", () => {
  it("the word reachable is not used for this signal in the files that carry it", () => {
    const files = ["src/exhume/usage.ts", "src/render/plate.ts", "src/web/report-export.ts", "src/alerts/ocsf.ts", "src/exhume/group.ts", "scripts/source-files.ts", "web/live-exhume.js"];
    for (const f of files) expect(readFileSync(f, "utf8"), f).not.toMatch(/reachab/i);
    // The manual may say what the signal is not.
    const manual = readFileSync("docs/USER_MANUAL.md", "utf8");
    const section = manual.slice(manual.indexOf("## Is it used?"));
    expect(section.length).toBeGreaterThan(100);
    expect(section.split(/\n## /)[0]).not.toMatch(/reachab/i);
  });
});
