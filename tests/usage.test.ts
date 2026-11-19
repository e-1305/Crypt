import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { readFileSync } from "node:fs";
import { numRuns } from "./runs.js";
import { LockfileError } from "../src/exhume/lockfile.js";
import { classifyUsage, importedPackages, isScannedSource, packageOfSpecifier } from "../src/exhume/usage.js";

const NAMES = ["alpha", "beta", "gamma", "@s/delta", "eps-lon"];
const lockOf = (devs: Record<string, boolean>): string =>
  JSON.stringify({
    lockfileVersion: 3,
    packages: {
      "": {},
      ...Object.fromEntries(
        Object.entries(devs).map(([n, d]) => [`node_modules/${n}`, d ? { version: "1.0.0", dev: true } : { version: "1.0.0" }]),
      ),
    },
  });
const nameArb = fc.constantFrom(...NAMES);
const subArb = fc.constantFrom("", "/sub", "/a/b");

describe("usage scan", () => {
  it("classifies the fixture", () => {
    const d = "tests/fixtures/usage/";
    const files = new Map([
      ["src/index.js", readFileSync(d + "src/index.js", "utf8")],
      ["dist/bundle.js", 'import "jquery";'],
    ]);
    const got = Object.fromEntries(classifyUsage(files, readFileSync(d + "package-lock.json", "utf8")).map((p) => [p.name, p.usage]));
    expect(got).toEqual({
      "@scope/pkg": "direct",
      express: "direct",
      jquery: "transitive",
      "left-pad": "transitive",
      lodash: "direct",
      qs: "transitive",
      vitest: "dev",
    });
  });

  it("property: every import form with any subpath yields the package name", () => {
    fc.assert(
      fc.property(nameArb, subArb, fc.nat(5), (n, sub, form) => {
        const s = `${n}${sub}`;
        const code = [
          `const x = require("${s}");`,
          `import x from '${s}';`,
          `import '${s}';`,
          `const x = await import("${s}");`,
          `export * from "${s}";`,
          `import type { T } from "${s}";`,
        ][form]!;
        expect([...importedPackages(code)]).toEqual([n]);
      }),
      { numRuns: numRuns(100) },
    );
  });

  it("property: relative, absolute and node: specifiers are never packages", () => {
    fc.assert(
      fc.property(fc.constantFrom("./", "../", "/", "node:", "#"), fc.stringMatching(/^[a-z]{1,8}$/), (p, rest) => {
        expect(packageOfSpecifier(p + rest)).toBeNull();
        expect(importedPackages(`import x from "${p}${rest}"`).size).toBe(0);
      }),
      { numRuns: numRuns(100) },
    );
  });

  it("property: commented-out imports do not count", () => {
    fc.assert(
      fc.property(nameArb, (n) => {
        expect(importedPackages(`// import "${n}"\n/* require("${n}") */`).size).toBe(0);
      }),
      { numRuns: numRuns(50) },
    );
  });

  const lockArb = fc.dictionary(nameArb, fc.boolean());
  const filesArb = fc.array(fc.tuple(fc.constantFrom("src/a.ts", "lib/b.js", "app/c.mjs", "index.js", "x.cjs"), nameArb, subArb), { maxLength: 6 });
  const toMap = (fs: [string, string, string][]) => new Map(fs.map(([p, n, s], i) => [p.replace(/([^/]+)$/, `${i}$1`), `import "${n}${s}";`]));

  it("property: deterministic, sorted, labels limited, and order independent", () => {
    fc.assert(
      fc.property(lockArb, filesArb, (devs, fs) => {
        fc.pre(Object.keys(devs).length > 0);
        const lock = lockOf(devs);
        const a = classifyUsage(toMap(fs), lock);
        const b = classifyUsage(toMap([...fs].reverse()), lock);
        expect(a.map((p) => p.name)).toEqual(Object.keys(devs).sort());
        expect(a.map((p) => p.name)).toEqual(b.map((p) => p.name));
        for (const [i, p] of a.entries()) {
          expect(["direct", "transitive", "dev", "unknown"]).toContain(p.usage);
          expect(p.usage).toBe(b[i]!.usage);
        }
        expect(JSON.stringify(a)).not.toMatch(/reachable/i);
      }),
      { numRuns: numRuns(100) },
    );
  });

  it("property: imported iff direct; otherwise dev flag decides dev vs transitive", () => {
    fc.assert(
      fc.property(lockArb, filesArb, (devs, fs) => {
        fc.pre(fs.length > 0);
        const got = classifyUsage(toMap(fs), lockOf(devs));
        const used = new Set(fs.map(([, n]) => n));
        for (const p of got) {
          expect(p.usage).toBe(used.has(p.name) ? "direct" : devs[p.name] ? "dev" : "transitive");
        }
      }),
      { numRuns: numRuns(100) },
    );
  });

  it("property: unreadable or missing source gives unknown for every package", () => {
    fc.assert(
      fc.property(lockArb, (devs) => {
        const lock = lockOf(devs);
        const none = classifyUsage(null, lock);
        const empty = classifyUsage(new Map(), lock);
        const onlyExcluded = classifyUsage(new Map([["dist/a.js", `import "alpha"`]]), lock);
        for (const r of [none, empty, onlyExcluded]) expect(r.every((p) => p.usage === "unknown")).toBe(true);
      }),
      { numRuns: numRuns(50) },
    );
  });

  it("property: files in excluded directories are ignored", () => {
    fc.assert(
      fc.property(fc.constantFrom("node_modules", "dist", "build", "test", "tests", "__tests__", "fixtures"), nameArb, (dir, n) => {
        for (const path of [`${dir}/a.js`, `src/${dir}/a.js`]) expect(isScannedSource(path)).toBe(false);
        const files = new Map([
          ["src/ok.js", `import "other"`],
          [`src/${dir}/a.js`, `import "${n}"`],
        ]);
        const r = classifyUsage(files, lockOf({ [n]: false }));
        expect(r[0]!.usage).toBe("transitive");
      }),
      { numRuns: numRuns(50) },
    );
  });

  it("scans src, lib, app and root files only", () => {
    expect(isScannedSource("src/a/b.ts")).toBe(true);
    expect(isScannedSource("index.js")).toBe(true);
    expect(isScannedSource("scripts/x.js")).toBe(false);
    expect(isScannedSource("src/a.test.ts")).toBe(false);
    expect(isScannedSource("src/a.d.ts")).toBe(false);
    expect(isScannedSource("src/a.md")).toBe(false);
  });

  it("is not fooled by comment markers inside strings", () => {
    expect([...importedPackages('const g = "lib/*";\nimport "alpha";\n/* c */')]).toEqual(["alpha"]);
    expect([...importedPackages('const u = "x // y"; require("beta")')]).toEqual(["beta"]);
    expect([...importedPackages('// import "gamma"\n/* require("delta") */')]).toEqual([]);
  });

  it("handles lock edge cases", () => {
    const lock = JSON.stringify({
      lockfileVersion: 3,
      packages: {
        "": { name: "root" },
        "packages/foo": { name: "foo", version: "1.0.0" },
        "node_modules/foo": { resolved: "packages/foo", link: true },
        "node_modules/a": { version: "1.0.0", dev: true },
        "node_modules/a/node_modules/b": { version: "1.0.0", dev: true },
        "node_modules/c": { version: "1.0.0", dev: true },
        "node_modules/x/node_modules/c": { version: "2.0.0" },
        "node_modules/x": { version: "1.0.0" },
        "node_modules/alias": { name: "real", version: "1.0.0" },
      },
    });
    const got = Object.fromEntries(classifyUsage(new Map([["src/a.js", "export {}"]]), lock).map((p) => [p.name, p.usage]));
    expect(got).toEqual({ a: "dev", b: "dev", c: "transitive", real: "transitive", x: "transitive" });
  });

  it("rejects bad lockfiles", () => {
    expect(() => classifyUsage(new Map(), "{")).toThrow(LockfileError);
    expect(() => classifyUsage(new Map(), `{"lockfileVersion":1,"packages":{}}`)).toThrow(LockfileError);
  });
});
