import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildCreature, serializeCreature } from "../src/exhume/creature.js";
import { parseEpss, parseKev } from "../src/exhume/feeds.js";
import { LockfileError, parsePackageLock, parseRequirements } from "../src/exhume/lockfile.js";
import { ownerOf, parseCodeowners } from "../src/exhume/owners.js";
import { cachePath, resolveOsv } from "../src/exhume/osv.js";
import { rankLimbs, scoreOf } from "../src/exhume/rank.js";
import type { ExhumeFs, Limb, OsvVuln } from "../src/exhume/types.js";
import { limbKey } from "../src/exhume/types.js";

function memFs(files: Record<string, string> = {}): ExhumeFs & { files: Map<string, string> } {
  const m = new Map(Object.entries(files));
  return { files: m, read: (p) => m.get(p) ?? null, write: (p, t) => void m.set(p, t) };
}

const limb = (name: string, version = "1.0.0"): Limb => ({
  ecosystem: "npm",
  name,
  version,
  direct: true,
  manifest: "package-lock.json",
});

const feedsOf = (kev: string[], epss: Record<string, number>) => ({
  kev: { date: "2026-01-01T00:00:00Z", cves: new Set(kev) },
  epss: { date: "2026-01-02T00:00:00Z", scores: new Map(Object.entries(epss)) },
});

describe("lockfile parsing (E1)", () => {
  const lock = JSON.stringify({
    lockfileVersion: 3,
    packages: {
      "": { dependencies: { a: "1.0.0" }, devDependencies: { b: "2.0.0" } },
      "node_modules/a": { version: "1.0.0" },
      "node_modules/b": { version: "2.0.0" },
      "node_modules/a/node_modules/c": { version: "3.0.0" },
      "node_modules/c": { version: "3.0.0" },
      "node_modules/@s/d": { version: "4.0.0" },
      "node_modules/linked": { link: true, resolved: "../x" },
      "packages/x": { version: "9.9.9" },
    },
  });
  it("emits one sorted limb per name@version, marks direct, skips root and links", () => {
    const limbs = parsePackageLock(lock, "package-lock.json");
    expect(limbs.map((l) => `${l.name}@${l.version}:${l.direct}`)).toEqual([
      "@s/d@4.0.0:false",
      "a@1.0.0:true",
      "b@2.0.0:true",
      "c@3.0.0:false",
    ]);
  });
  it("rejects lockfileVersion 1 and invalid JSON", () => {
    expect(() => parsePackageLock('{"lockfileVersion":1,"dependencies":{}}', "x")).toThrow(LockfileError);
    expect(() => parsePackageLock("{", "x")).toThrow(LockfileError);
  });
  it("reads only == pins from requirements.txt and never guesses the rest", () => {
    const limbs = parseRequirements(
      ["# c", "", "-r other.txt", "Django==1.11.0", "requests>=2", "flask", "pyyaml==5.*", "Foo_Bar==1.0 ; python_version<'3'", "git+https://x/y.git"].join("\n"),
      "requirements.txt",
    );
    expect(limbs.map((l) => `${l.name}@${l.version}`)).toEqual([
      "django@1.11.0",
      "flask@unknown",
      "foo-bar@1.0",
      "pyyaml@unknown",
      "requests@unknown",
    ]);
  });
});

describe("CODEOWNERS (E6)", () => {
  const rules = parseCodeowners("# x\n* @all\n/package-lock.json @lock # note\ndocs/ @docs\n*.py @py\n");
  it("last matching rule wins, no match is unowned", () => {
    expect(ownerOf(rules, "package-lock.json")).toBe("@lock");
    expect(ownerOf(rules, "requirements.txt")).toBe("@all");
    expect(ownerOf(rules, "docs/a/b.md")).toBe("@docs");
    expect(ownerOf(rules, "src/x.py")).toBe("@py");
    expect(ownerOf(parseCodeowners("/other @o"), "package-lock.json")).toBe("unowned");
    expect(ownerOf([], "package-lock.json")).toBe("unowned");
  });
});

describe("OSV cache (E2)", () => {
  const l = limb("@scope/pkg", "1.2.3");
  const vulns: OsvVuln[] = [{ id: "GHSA-1", aliases: ["CVE-2020-0001"], severity: "HIGH" }];
  it("writes the cache on a miss and serves it with no lookup afterwards", async () => {
    const fs = memFs();
    let calls = 0;
    const lookup = async () => (calls++, new Map([[limbKey(l), vulns]]));
    const a = await resolveOsv([l], { fs, cacheDir: "c", lookup });
    const b = await resolveOsv([l], { fs, cacheDir: "c" });
    expect(calls).toBe(1);
    expect(b.known.get(limbKey(l))).toEqual(a.known.get(limbKey(l)));
    expect(cachePath("c", l)).toBe("c/npm__%40scope%2Fpkg@1.2.3.json");
  });
  it("treats a corrupt cache file as a miss", async () => {
    const fs = memFs({ [cachePath("c", l)]: "{nope" });
    const r = await resolveOsv([l], { fs, cacheDir: "c" });
    expect(r.unknown.has(limbKey(l))).toBe(true);
  });
  it("cache file names never leave the cache directory", () => {
    fc.assert(
      fc.property(fc.string(), fc.string(), (name, version) => {
        const p = cachePath("c", { ecosystem: "npm", name, version });
        expect(p.startsWith("c/npm__")).toBe(true);
        expect(p.slice(2)).not.toContain("/");
      }),
    );
  });
});

describe("feeds (E3)", () => {
  it("reads the KEV and EPSS dates", () => {
    expect(parseKev('{"dateReleased":"d","vulnerabilities":[{"cveID":"cve-1-1"}]}')).toEqual({ date: "d", cves: new Set(["CVE-1-1"]) });
    const e = parseEpss("#model_version:v1,score_date:2026-02-03T00:00:00Z\ncve,epss,percentile\nCVE-1-1,0.5,0.9\nCVE-1-2,7,1\n");
    expect(e?.date).toBe("2026-02-03T00:00:00Z");
    expect([...e!.scores]).toEqual([["CVE-1-1", 0.5]]);
    expect(parseEpss("junk")).toBeNull();
    expect(parseKev("junk")).toBeNull();
  });
});

const arbEpss = fc.integer({ min: 0, max: 100000 }).map((n) => n / 100000);
const arbSev = fc.constantFrom(0, 2, 5, 7.5, 9.5);

describe("ranking properties (sla-policy)", () => {
  it("KEV always outranks non-KEV", () => {
    fc.assert(
      fc.property(arbEpss, arbSev, arbEpss, arbSev, (e1, s1, e2, s2) => {
        expect(scoreOf({ kev: true, epss: e1, severity: s1 })).toBeGreaterThan(scoreOf({ kev: false, epss: e2, severity: s2 }));
      }),
    );
  });
  it("KEV limbs sort before non-KEV limbs in the ranked list", () => {
    fc.assert(
      fc.property(fc.array(fc.tuple(fc.boolean(), arbEpss, arbSev), { minLength: 1, maxLength: 12 }), (rows) => {
        const limbs = rows.map((_, i) => limb(`p${i}`));
        const osv = new Map<string, OsvVuln[]>();
        const kev: string[] = [];
        const epss: Record<string, number> = {};
        rows.forEach(([k, e, s], i) => {
          const cve = `CVE-2020-${1000 + i}`;
          osv.set(limbKey(limbs[i]!), [{ id: `GHSA-${i}`, aliases: [cve], severity: s === 0 ? "LOW" : s === 2 ? "LOW" : s === 5 ? "MODERATE" : s === 7.5 ? "HIGH" : "CRITICAL" }]);
          if (k) kev.push(cve);
          epss[cve] = e;
        });
        const { kev: kf, epss: ef } = feedsOf(kev, epss);
        const ranked = rankLimbs({ limbs, osv, kev: kf, epss: ef, ownerOfManifest: () => "unowned" });
        const firstNonKev = ranked.findIndex((r) => !r.kev);
        if (firstNonKev >= 0) expect(ranked.slice(firstNonKev).some((r) => r.kev)).toBe(false);
        expect(ranked.every((r) => r.kev === (r.state === "Possessed"))).toBe(true);
      }),
    );
  });
  it("score is monotonic in EPSS", () => {
    fc.assert(
      fc.property(fc.boolean(), arbSev, arbEpss, arbEpss, (kev, severity, a, b) => {
        const [lo, hi] = a <= b ? [a, b] : [b, a];
        expect(scoreOf({ kev, epss: hi, severity })).toBeGreaterThanOrEqual(scoreOf({ kev, epss: lo, severity }));
      }),
    );
  });
  it("EPSS dominates severity for different EPSS values", () => {
    fc.assert(
      fc.property(arbEpss, arbEpss, arbSev, arbSev, (a, b, s1, s2) => {
        fc.pre(a > b);
        expect(scoreOf({ kev: false, epss: a, severity: s1 })).toBeGreaterThan(scoreOf({ kev: false, epss: b, severity: s2 }));
      }),
    );
  });
});

const arbScenario = fc.record({
  rows: fc.array(
    fc.record({
      name: fc.stringMatching(/^[a-z]{1,6}$/),
      version: fc.constantFrom("1.0.0", "2.0.0", "unknown"),
      vulns: fc.array(fc.tuple(fc.integer({ min: 0, max: 20 }), fc.constantFrom("LOW", "HIGH", null)), { maxLength: 3 }),
      osvKnown: fc.boolean(),
    }),
    { maxLength: 15 },
  ),
  kev: fc.array(fc.integer({ min: 0, max: 20 }), { maxLength: 6 }),
  epss: fc.dictionary(fc.integer({ min: 0, max: 20 }).map((n) => `CVE-2020-${n}`), arbEpss),
  kevPresent: fc.boolean(),
  epssPresent: fc.boolean(),
});

type Scenario = typeof arbScenario extends fc.Arbitrary<infer T> ? T : never;

async function run(s: Scenario, order: "asc" | "desc" = "asc") {
  const seen = new Set<string>();
  let limbs = s.rows.map((r) => limb(r.name, r.version)).filter((l) => !seen.has(limbKey(l)) && seen.add(limbKey(l)));
  if (order === "desc") limbs = [...limbs].reverse();
  const byKey = new Map(s.rows.map((r) => [limbKey(limb(r.name, r.version)), r]));
  const fs = memFs();
  const lookup = async () => {
    const out = new Map<string, OsvVuln[]>();
    for (const [k, r] of byKey)
      if (r.osvKnown) out.set(k, r.vulns.map(([n, sev]) => ({ id: `GHSA-${n}`, aliases: [`CVE-2020-${n}`], severity: sev })));
    return out;
  };
  const feeds = feedsOf(s.kev.map((n) => `CVE-2020-${n}`), s.epss);
  const osv = await resolveOsv(limbs, { fs, cacheDir: "c", lookup });
  return rankLimbs({
    limbs,
    osv: osv.known,
    kev: s.kevPresent ? feeds.kev : null,
    epss: s.epssPresent ? feeds.epss : null,
    ownerOfManifest: () => "unowned",
  });
}

describe("exhume properties", () => {
  it("is deterministic and independent of input order", async () => {
    await fc.assert(
      fc.asyncProperty(arbScenario, async (s) => {
        const a = await run(s, "asc");
        expect(JSON.stringify(await run(s, "asc"))).toBe(JSON.stringify(a));
        expect(JSON.stringify(await run(s, "desc"))).toBe(JSON.stringify(a));
      }),
    );
  });
  it("spawned is a subset of Possessed plus Rotting with EPSS >= 0.1", async () => {
    await fc.assert(
      fc.asyncProperty(arbScenario, async (s) => {
        for (const l of await run(s)) {
          if (l.spawned) expect(l.state === "Possessed" || (l.state === "Rotting" && l.epss !== null && l.epss >= 0.1)).toBe(true);
          if (l.state === "Possessed") expect(l.spawned).toBe(true);
        }
      }),
    );
  });
  it("missing feed, OSV failure or unpinned version never yields Healthy", async () => {
    await fc.assert(
      fc.asyncProperty(arbScenario, async (s) => {
        for (const l of await run(s)) {
          const r = s.rows.find((x) => x.name === l.name && x.version === l.version)!;
          if (!s.kevPresent || !s.epssPresent || !r.osvKnown || l.version === "unknown") {
            expect(l.state).not.toBe("Healthy");
            expect(l.unknown).toBe(true);
          }
        }
      }),
    );
  });
  it("counts add up: exorcised + spawned = findings", async () => {
    await fc.assert(
      fc.asyncProperty(arbScenario, async (s) => {
        const ranked = await run(s);
        const findings = ranked.filter((l) => l.state !== "Healthy").length;
        const spawned = ranked.filter((l) => l.spawned).length;
        const exorcised = ranked.filter((l) => l.state !== "Healthy" && !l.spawned).length;
        expect(exorcised + spawned).toBe(findings);
      }),
    );
  });
});

describe("creature.json (E7) and blamelessness (E6.3)", () => {
  const lock = JSON.stringify({
    lockfileVersion: 3,
    packages: { "": { dependencies: { a: "1.0.0" } }, "node_modules/a": { version: "1.0.0" }, "node_modules/b": { version: "2.0.0" } },
  });
  const vulnsFor = (k: string): OsvVuln[] | undefined =>
    k === "npm:a@1.0.0" ? [{ id: "GHSA-a", aliases: ["CVE-2020-1"], severity: "HIGH" }] : k === "npm:b@2.0.0" ? [] : undefined;
  const make = async (files: Record<string, string>, offline: boolean) =>
    serializeCreature(
      await buildCreature({
        repo: memFs(files),
        cacheFs: memFs(),
        cacheDir: "c",
        ...feedsOf(["CVE-2020-1"], { "CVE-2020-1": 0.5 }),
        lookup: offline ? undefined : async (ls) => new Map(ls.flatMap((l) => (vulnsFor(limbKey(l)) ? [[limbKey(l), vulnsFor(limbKey(l))!] as const] : []))),
      }),
    );

  it("same input gives byte-identical output", async () => {
    const files = { "package-lock.json": lock, CODEOWNERS: "* @team" };
    expect(await make(files, false)).toBe(await make(files, false));
    const c = JSON.parse(await make(files, false));
    expect(c.counts).toMatchObject({ limbs: 2, findings: 1, spawned: 1, exorcised: 0, healthy: 1 });
    expect(c.limbs[0]).toMatchObject({ id: "npm:a@1.0.0", state: "Possessed", owner: "@team" });
    expect(c.feeds.kev.date).toBe("2026-01-01T00:00:00Z");
  });
  it("OSV failure marks limbs unknown, never Healthy", async () => {
    const c = JSON.parse(await make({ "package-lock.json": lock }, true));
    expect(c.counts.healthy).toBe(0);
    expect(c.limbs.every((l: any) => l.state !== "Healthy" && l.unknown)).toBe(true);
  });
  it("a repository without CODEOWNERS is unowned", async () => {
    expect(JSON.parse(await make({ "package-lock.json": lock }, false)).manifests[0].owner).toBe("unowned");
  });
  it("no output field contains a git author or committer", async () => {
    await fc.assert(
      fc.asyncProperty(fc.stringMatching(/^[A-Z][a-z]{5,9}[A-Z][a-z]{5,9}$/), async (author) => {
        const dir = mkdtempSync(join(tmpdir(), "crypt-git-"));
        writeFileSync(join(dir, "package-lock.json"), lock);
        const git = (...a: string[]) =>
          execFileSync("git", ["-C", dir, ...a], {
            env: { ...process.env, GIT_AUTHOR_NAME: author, GIT_COMMITTER_NAME: author, GIT_AUTHOR_EMAIL: "a@example.invalid", GIT_COMMITTER_EMAIL: "a@example.invalid" },
            stdio: "ignore",
          });
        git("init", "-q");
        git("add", ".");
        git("commit", "-q", "-m", "x");
        const out = await make({ "package-lock.json": readFileSync(join(dir, "package-lock.json"), "utf8") }, false);
        expect(out).not.toContain(author);
        expect(out.toLowerCase()).not.toMatch(/author|committer/);
      }),
      { numRuns: 5 },
    );
  });
  it("src/exhume never touches git or processes", () => {
    for (const f of readdirSync("src/exhume")) {
      expect(readFileSync(join("src/exhume", f), "utf8"), f).not.toMatch(/child_process|\bblame\b|\.git\b|committer|\bauthor\b/i);
    }
  });
});
