import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import fc from "fast-check";
import { afterAll, describe, expect, it } from "vitest";
import { parseEpss, parseKev } from "../src/exhume/feeds.js";
import { buildImportedCreature } from "../src/import/build.js";
import { IMPORT_FORMATS, ImportError, type ImportFormat, parseImport } from "../src/import/index.js";
import { parsePurl } from "../src/import/purl.js";
import { numRuns } from "./runs.js";

const FEEDS = "fixtures/vulnerable-npm/feeds";
const kev = parseKev(readFileSync(join(FEEDS, "kev.json"), "utf8"));
const epss = parseEpss(readFileSync(join(FEEDS, "epss.csv"), "utf8"));
const fixture = (f: ImportFormat) => readFileSync(`fixtures/import/${f}.json`, "utf8");
const build = (format: ImportFormat, text: string, extra: { kev?: typeof kev; epss?: typeof epss } = {}) =>
  buildImportedCreature({ format, text, file: `${format}.json`, name: "fixture", kev: extra.kev === undefined ? kev : extra.kev, epss: extra.epss === undefined ? epss : extra.epss });

describe("golden per format", () => {
  for (const f of IMPORT_FORMATS) {
    it(`${f}: limbs match fixtures/import/golden/${f}.limbs.json`, () => {
      const c = build(f, fixture(f));
      const path = `fixtures/import/golden/${f}.limbs.json`;
      if (process.env.UPDATE_GOLDEN === "1") writeFileSync(path, JSON.stringify(c.limbs, null, 2) + "\n");
      expect(c.limbs).toEqual(JSON.parse(readFileSync(path, "utf8")));
      expect(c.schemaVersion).toBe(1);
      expect(c.import).toEqual({ format: f, file: `${f}.json` });
      expect(c.limbs.map((l) => l.rank)).toEqual(c.limbs.map((_, i) => i + 1));
      expect(c.counts.limbs).toBe(c.limbs.length);
    });
    it(`${f}: KEV limb ranks first and is Possessed`, () => {
      const c = build(f, fixture(f));
      expect(c.limbs[0]).toMatchObject({ id: expect.stringMatching(/^npm:jquery@/), state: "Possessed", kev: true });
    });
  }
  it("trivy keeps the clean package Healthy and the PyPI name normalized", () => {
    const c = build("trivy", fixture("trivy"));
    expect(c.limbs.find((l) => l.id === "npm:ms@2.1.3")).toMatchObject({ state: "Healthy", unknown: false });
    expect(c.limbs.some((l) => l.id === "PyPI:flask-cors@3.0.8")).toBe(true);
  });
  it("aliases and vendor severity are kept as display data", () => {
    const c = build("sarif", fixture("sarif"));
    const lodash = c.limbs.find((l) => l.name === "lodash")!;
    expect(lodash.vulns[0]!.cves).toEqual(["CVE-2020-8203"]);
    expect(lodash.vendorSeverity).toBe("HIGH");
  });
});

describe("fail-safe: ambiguous entries are Unknown, never Healthy", () => {
  const unknownNames: Record<ImportFormat, string[]> = {
    sarif: ["unidentified/no-eval"],
    dependabot: ["lodash", "jquery", "go:example.invalid/mod", "mystery"],
    trivy: ["no-version-pkg"],
    grype: ["go-module:example.invalid/mod", "no-id-pkg"],
    snyk: ["unidentified/SNYK-JS-MYSTERY-1"],
  };
  for (const f of IMPORT_FORMATS) {
    it(`${f}`, () => {
      const c = build(f, fixture(f));
      for (const n of unknownNames[f]) {
        const l = c.limbs.find((x) => x.name === n || x.name.endsWith(n));
        expect(l, n).toBeDefined();
        expect(l!.unknown).toBe(true);
        expect(l!.state).not.toBe("Healthy");
      }
    });
  }
  it("a vulnerability entry without an id leaves the limb out of the OSV map (osv-unavailable)", () => {
    const text = JSON.stringify({ matches: [{ vulnerability: {}, artifact: { name: "left", version: "1.0.0", type: "npm" } }] });
    const l = build("grype", text).limbs[0]!;
    expect(l).toMatchObject({ unknown: true, unknownReason: "osv-unavailable" });
    expect(l.state).not.toBe("Healthy");
  });
  it("an unparsable purl or missing version never gives Healthy", () => {
    const text = JSON.stringify({ Results: [{ Type: "npm", Vulnerabilities: [{ VulnerabilityID: "CVE-2099-1", PkgName: "x", PkgIdentifier: { PURL: "pkg:%%%" } }] }] });
    const l = build("trivy", text).limbs[0]!;
    expect(l.unknown).toBe(true);
    expect(l.state).not.toBe("Healthy");
  });
  it("a clean package is unknown, not Healthy, when the feeds are missing", () => {
    const c = build("trivy", fixture("trivy"), { kev: null, epss: null });
    expect(c.limbs.every((l) => l.state !== "Healthy")).toBe(true);
  });
  it("one ambiguous entry makes the merged limb unknown", () => {
    const text = JSON.stringify({
      matches: [
        { vulnerability: { id: "CVE-2099-1" }, artifact: { name: "a", version: "1.0.0", type: "npm" } },
        { vulnerability: {}, artifact: { name: "a", version: "1.0.0", type: "npm" } },
      ],
    });
    expect(parseImport("grype", text)[0]!.vulns).toBeUndefined();
  });
});

describe("malformed input throws and yields no creature", () => {
  const bad: [string, ImportFormat, string][] = [
    ["empty text", "trivy", ""],
    ["not json", "sarif", "{nope"],
    ["null", "snyk", "null"],
    ["empty object", "grype", "{}"],
    ["empty array", "dependabot", "[]"],
    ["empty trivy results", "trivy", '{"Results":[]}'],
    ["empty sarif run", "sarif", '{"version":"2.1.0","runs":[{"results":[]}]}'],
  ];
  for (const [label, format, text] of bad) {
    it(`${format}: ${label}`, () => {
      expect(() => build(format, text)).toThrow(ImportError);
    });
  }
  it("every format rejects every other format's fixture", () => {
    for (const a of IMPORT_FORMATS) {
      for (const b of IMPORT_FORMATS) {
        if (a !== b) expect(() => parseImport(a, fixture(b)), `${a} given ${b}`).toThrow(ImportError);
      }
    }
  });
  it("an unknown format name throws", () => {
    expect(() => parseImport("bogus" as ImportFormat, "{}")).toThrow(ImportError);
  });
  it("arbitrary JSON never throws anything but ImportError and never gives a Healthy unknown", () => {
    fc.assert(
      fc.property(fc.constantFrom(...IMPORT_FORMATS), fc.json(), (f, text) => {
        try {
          for (const l of build(f, text).limbs) if (l.unknown) expect(l.state).not.toBe("Healthy");
        } catch (e) {
          expect(e).toBeInstanceOf(ImportError);
        }
      }),
      { numRuns: numRuns(200) },
    );
  });
});

function shuffled<T>(a: T[], seed: number[]): T[] {
  const out = [...a];
  for (let i = out.length - 1; i > 0; i--) {
    const j = (seed[i % seed.length] ?? 0) % (i + 1);
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

const LISTS: Record<ImportFormat, (o: any) => any[]> = {
  sarif: (o) => o.runs[0].results,
  dependabot: (o) => o,
  trivy: (o) => o.Results[0].Vulnerabilities,
  grype: (o) => o.matches,
  snyk: (o) => o.vulnerabilities,
};

describe("determinism", () => {
  for (const f of IMPORT_FORMATS) {
    it(`${f}: input order does not change the output`, () => {
      const base = JSON.stringify(build(f, fixture(f)));
      fc.assert(
        fc.property(fc.array(fc.nat(), { minLength: 1, maxLength: 12 }), (seed) => {
          const o = JSON.parse(fixture(f));
          const list = LISTS[f](o);
          const mixed = shuffled(list, seed);
          list.splice(0, list.length, ...mixed);
          expect(JSON.stringify(build(f, JSON.stringify(o)))).toBe(base);
        }),
        { numRuns: numRuns(50) },
      );
    });
  }
});

describe("vendor severity never changes ranking (failsafe rule 4)", () => {
  const LABELS = ["LOW", "medium", "High", "CRITICAL", "moderate", "bogus", ""];
  it("order, state, score and counts are the same whatever the labels say", () => {
    const base = build("trivy", fixture("trivy"));
    fc.assert(
      fc.property(fc.array(fc.constantFrom(...LABELS), { minLength: 1, maxLength: 8 }), (labels) => {
        const o = JSON.parse(fixture("trivy"));
        o.Results.forEach((r: any) => (r.Vulnerabilities ?? []).forEach((v: any, i: number) => (v.Severity = labels[i % labels.length])));
        const c = build("trivy", JSON.stringify(o));
        const strip = (x: typeof base) => x.limbs.map(({ vendorSeverity: _v, ...r }) => r);
        expect(strip(c)).toEqual(strip(base));
        expect(c.counts).toEqual(base.counts);
      }),
      { numRuns: numRuns(100) },
    );
  });
  it("a CRITICAL label does not outrank a KEV limb", () => {
    const c = build("snyk", fixture("snyk"));
    expect(c.limbs[0]!.name).toBe("jquery");
    expect(c.limbs.find((l) => l.name === "minimist")!.vendorSeverity).toBe("CRITICAL");
    expect(c.limbs.every((l) => l.severity === 0)).toBe(true);
  });
});

describe("purl", () => {
  it("parses npm scoped and pypi purls", () => {
    expect(parsePurl("pkg:npm/%40babel/core@7.0.0?x=1#y")).toEqual({ type: "npm", name: "@babel/core", version: "7.0.0" });
    expect(parsePurl("pkg:pypi/requests@2.0")).toEqual({ type: "pypi", name: "requests", version: "2.0" });
    expect(parsePurl("pkg:npm/left")).toEqual({ type: "npm", name: "left", version: null });
  });
  it("rejects garbage", () => {
    for (const s of ["", "npm/x", "pkg:", "pkg:npm", "pkg:npm/%zz", 5, null]) expect(parsePurl(s)).toBeNull();
  });
});

describe("adapters are pure and browser-safe", () => {
  it("src/import has no fs, network, process or Node imports", () => {
    for (const f of readdirSync("src/import")) {
      const t = readFileSync(join("src/import", f), "utf8");
      expect(t, f).not.toMatch(/from "node:|require\(|\bfetch\(|XMLHttpRequest|process\.|child_process|from "fs"/);
    }
  });
});

describe("exhume --from, end to end", () => {
  const dir = mkdtempSync(join(tmpdir(), "crypt-import-"));
  for (const f of IMPORT_FORMATS) {
    it(`${f}: writes creature.json and raise accepts it`, () => {
      const out = join(dir, `${f}.json`);
      const r = spawnSync("npx", ["tsx", "scripts/exhume.ts", `fixtures/import/${f}.json`, "--from", f, "--feeds", FEEDS, "--offline", "--out", out], { encoding: "utf8" });
      expect(r.status, r.stderr).toBe(0);
      const c = JSON.parse(readFileSync(out, "utf8"));
      expect(c.limbs[0].state).toBe("Possessed");
      const z = spawnSync("npx", ["tsx", "scripts/raise.ts", out, "--out", join(dir, "raised")], { encoding: "utf8" });
      expect(z.status, z.stderr + z.stdout).toBe(0);
    }, 60_000);
  }
  it("an invalid file exits 1 and writes nothing", () => {
    const bad = join(dir, "bad.json");
    writeFileSync(bad, "{nope");
    const out = join(dir, "bad-out.json");
    const r = spawnSync("npx", ["tsx", "scripts/exhume.ts", bad, "--from", "trivy", "--feeds", FEEDS, "--out", out], { encoding: "utf8" });
    expect(r.status).toBe(1);
    expect(existsSync(out)).toBe(false);
  }, 60_000);
  afterAll(() => rmSync(dir, { recursive: true, force: true }));
});
