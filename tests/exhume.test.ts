import { describe, expect, it } from "vitest";
import { numRuns } from "./runs.js";
import fc from "fast-check";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NoManifestError, buildCreature, serializeCreature } from "../src/exhume/creature.js";
import { parseEpss, parseKev } from "../src/exhume/feeds.js";
import { LockfileError, parsePackageLock, parseRequirements } from "../src/exhume/lockfile.js";
import { ownerOf, parseCodeowners } from "../src/exhume/owners.js";
import { OSV_TTL_MS, cachePath, resolveOsv } from "../src/exhume/osv.js";
import { countLimbs, combineOsvAnswers, rankLimbs, scoreOf } from "../src/exhume/rank.js";
import type { ExhumeFs, Limb, OsvVuln } from "../src/exhume/types.js";
import { limbKey } from "../src/exhume/types.js";
import { nodeFs } from "../scripts/node-fs.js";
import { creatureRepoName, packageJsonName } from "../src/exhume/name.js";
import { osvLookup, type Fetcher } from "../scripts/osv-client.js";

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
  it("refreshes an expired entry, and a clean answer does not stay clean forever", async () => {
    const t0 = Date.UTC(2026, 0, 1);
    const fs = memFs();
    await resolveOsv([l], { fs, cacheDir: "c", now: t0, lookup: async () => new Map([[limbKey(l), []]]) });
    expect(JSON.parse(fs.files.get(cachePath("c", l))!).fetchedAt).toBe(new Date(t0).toISOString());
    let calls = 0;
    const lookup = async () => (calls++, new Map([[limbKey(l), vulns]]));
    await resolveOsv([l], { fs, cacheDir: "c", now: t0 + OSV_TTL_MS - 1, lookup });
    expect(calls).toBe(0);
    const r = await resolveOsv([l], { fs, cacheDir: "c", now: t0 + OSV_TTL_MS + 1, lookup });
    expect(calls).toBe(1);
    expect(r.known.get(limbKey(l))).toEqual(vulns);
    expect(r.stale.size).toBe(0);
  });
  it("an expired entry whose refresh fails is stale and ranks unknown, never Healthy", async () => {
    const t0 = Date.UTC(2026, 0, 1);
    const fs = memFs();
    await resolveOsv([l], { fs, cacheDir: "c", now: t0, lookup: async () => new Map([[limbKey(l), []]]) });
    const r = await resolveOsv([l], { fs, cacheDir: "c", now: t0 + OSV_TTL_MS * 2, lookup: async () => new Map() });
    expect(r.stale.has(limbKey(l))).toBe(true);
    const [ranked] = rankLimbs({ limbs: [l], osv: r.known, stale: r.stale, ...feedsOf([], {}), ownerOfManifest: () => "unowned" });
    expect(ranked).toMatchObject({ state: "Rotting", unknown: true, unknownReason: "osv-stale" });
  });
  it("offline use (no lookup) accepts old entries without checking age", async () => {
    const fs = memFs();
    await resolveOsv([l], { fs, cacheDir: "c", now: 0, lookup: async () => new Map([[limbKey(l), []]]) });
    const r = await resolveOsv([l], { fs, cacheDir: "c", now: Date.UTC(2030, 0, 1) });
    expect(r.known.has(limbKey(l))).toBe(true);
    expect(r.stale.size).toBe(0);
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

// Enough runs to catch rare collisions (two rows with the same name@version).
// fast-check prints the seed and path of any failure; replay with { seed, path }.
fc.configureGlobal({ numRuns: numRuns(1000) });

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
type Row = Scenario["rows"][number];

const answerOf = (r: Row): OsvVuln[] | undefined =>
  r.osvKnown ? r.vulns.map(([n, sev]) => ({ id: `GHSA-${n}`, aliases: [`CVE-2020-${n}`], severity: sev })) : undefined;

/** Rows grouped by limb key; worst-case OSV answer per key. */
function mergedAnswers(rows: Row[]): Map<string, OsvVuln[] | undefined> {
  const groups = new Map<string, Row[]>();
  for (const r of rows) {
    const k = limbKey(limb(r.name, r.version));
    groups.set(k, [...(groups.get(k) ?? []), r]);
  }
  return new Map([...groups].map(([k, g]) => [k, combineOsvAnswers(g.map(answerOf))]));
}

async function run(s: Scenario, order: "asc" | "desc" = "asc") {
  const seen = new Set<string>();
  let limbs = s.rows.map((r) => limb(r.name, r.version)).filter((l) => !seen.has(limbKey(l)) && seen.add(limbKey(l)));
  if (order === "desc") limbs = [...limbs].reverse();
  const merged = mergedAnswers(s.rows);
  const fs = memFs();
  const lookup = async () => {
    const out = new Map<string, OsvVuln[]>();
    for (const [k, v] of merged) if (v !== undefined) out.set(k, v);
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
          const group = s.rows.filter((x) => x.name === l.name && x.version === l.version);
          if (!s.kevPresent || !s.epssPresent || group.some((x) => !x.osvKnown) || l.version === "unknown") {
            expect(l.state).not.toBe("Healthy");
            expect(l.unknown).toBe(true);
          }
        }
      }),
    );
  });
  it("regression: unknown row and known-clean row for one limb is never Healthy (seed -2062331921)", async () => {
    const s: Scenario = {
      rows: [
        { name: "q", version: "1.0.0", vulns: [], osvKnown: false },
        { name: "q", version: "1.0.0", vulns: [], osvKnown: true },
      ],
      kev: [],
      epss: {},
      kevPresent: true,
      epssPresent: true,
    };
    for (const rows of [s.rows, [...s.rows].reverse()]) {
      const ranked = await run({ ...s, rows });
      expect(ranked).toHaveLength(1);
      expect(ranked[0]!.state).not.toBe("Healthy");
      expect(ranked[0]!.unknown).toBe(true);
    }
  });
  it("merging rows of one limb is order-independent and worst-case", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            name: fc.constant("q"),
            version: fc.constant("1.0.0"),
            vulns: fc.array(fc.tuple(fc.integer({ min: 0, max: 20 }), fc.constantFrom("LOW", "HIGH", null)), { maxLength: 3 }),
            osvKnown: fc.boolean(),
          }),
          { minLength: 1, maxLength: 6 },
        ),
        fc.infiniteStream(fc.nat()),
        (rows, stream) => {
          const keyed = rows.map((r) => ({ r, k: stream.next().value as number }));
          const shuffled = keyed.sort((x, y) => x.k - y.k).map((x) => x.r);
          const a = combineOsvAnswers(rows.map(answerOf));
          const b = combineOsvAnswers(shuffled.map(answerOf));
          expect(JSON.stringify(b)).toBe(JSON.stringify(a));
          if (rows.some((r) => !r.osvKnown)) expect(a).toBeUndefined();
          else for (const r of rows) for (const [n] of r.vulns) expect(a!.some((v) => v.id === `GHSA-${n}`)).toBe(true);
        },
      ),
    );
  });
  it("counts add up: exorcised + spawned + unresolved = findings", async () => {
    await fc.assert(
      fc.asyncProperty(arbScenario, async (s) => {
        const ranked = await run(s);
        const findings = ranked.filter((l) => l.state !== "Healthy").length;
        const spawned = ranked.filter((l) => l.spawned).length;
        const exorcised = ranked.filter((l) => l.state !== "Healthy" && !l.spawned && !l.unknown).length;
        const unresolved = ranked.filter((l) => l.unknown && !l.spawned).length;
        expect(exorcised + spawned + unresolved).toBe(findings);
        expect(countLimbs(ranked)).toMatchObject({ findings, exorcised, spawned, unresolved });
        // unknown limbs are never dropped as noise
        for (const l of ranked) if (l.unknown) expect(l.state).not.toBe("Healthy");
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
    expect(c.counts).toMatchObject({ limbs: 2, findings: 1, spawned: 1, exorcised: 0, unresolved: 0, healthy: 1 });
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
  it("no output field contains a git author or committer, with a real git repo read through the CLI filesystem", async () => {
    const author = "Zelda Quimby";
    const dir = mkdtempSync(join(tmpdir(), "crypt-git-"));
    writeFileSync(join(dir, "package-lock.json"), lock);
    const git = (...a: string[]) =>
      execFileSync("git", ["-C", dir, ...a], {
        env: { ...process.env, GIT_AUTHOR_NAME: author, GIT_COMMITTER_NAME: author, GIT_AUTHOR_EMAIL: "zq@example.invalid", GIT_COMMITTER_EMAIL: "zq@example.invalid" },
        stdio: "ignore",
      });
    git("init", "-q");
    git("add", ".");
    git("commit", "-q", "-m", "x");
    const out = serializeCreature(
      await buildCreature({ repo: nodeFs(dir), cacheFs: memFs(), cacheDir: "c", ...feedsOf(["CVE-2020-1"], {}), lookup: async () => new Map() }),
    );
    expect(out).not.toContain("Zelda");
    expect(out).not.toContain("zq@example.invalid");
    expect(out.toLowerCase()).not.toMatch(/author|committer/);
  });
  it("a repository without a readable manifest fails instead of reporting a clean run", async () => {
    await expect(buildCreature({ repo: memFs({ CODEOWNERS: "* @t" }), cacheFs: memFs(), cacheDir: "c", ...feedsOf([], {}) })).rejects.toBeInstanceOf(NoManifestError);
    const dir = mkdtempSync(join(tmpdir(), "crypt-empty-"));
    await expect(buildCreature({ repo: nodeFs(dir), cacheFs: memFs(), cacheDir: "c", ...feedsOf([], {}) })).rejects.toBeInstanceOf(NoManifestError);
  });
  it("src/exhume never touches git or processes", () => {
    for (const f of readdirSync("src/exhume")) {
      expect(readFileSync(join("src/exhume", f), "utf8"), f).not.toMatch(/child_process|\bblame\b|\.git\b|committer|\bauthor\b/i);
    }
  });
});

describe("OSV client (osvLookup) fail-safe", () => {
  const a = limb("a", "1.0.0");
  const b = limb("b", "2.0.0");
  const reply = (body: unknown, ok = true) => async () => ({ ok, json: async () => body });
  const fake = (routes: { batch: unknown; details?: Record<string, unknown | null> }): Fetcher => async (url) => {
    if (url.endsWith("/querybatch")) return { ok: true, json: async () => routes.batch };
    const id = decodeURIComponent(url.split("/vulns/")[1]!);
    const d = routes.details?.[id];
    return d == null ? { ok: false, json: async () => ({}) } : { ok: true, json: async () => d };
  };
  it("returns aliases and severity for a complete answer, and [] for a clean limb", async () => {
    const f = fake({
      batch: { results: [{ vulns: [{ id: "GHSA-1" }] }, {}] },
      details: { "GHSA-1": { aliases: ["CVE-1"], database_specific: { severity: "HIGH" } } },
    });
    const r = await osvLookup(f)([a, b]);
    expect(r.get(limbKey(a))).toEqual([{ id: "GHSA-1", aliases: ["CVE-1"], severity: "HIGH" }]);
    expect(r.get(limbKey(b))).toEqual([]);
  });
  it("leaves every limb out when the batch fails, is not ok or has a length mismatch", async () => {
    expect((await osvLookup(reply({}, false))([a, b])).size).toBe(0);
    expect((await osvLookup(reply({ results: [{}] }))([a, b])).size).toBe(0);
    expect((await osvLookup(async () => { throw new Error("offline"); })([a])).size).toBe(0);
  });
  it("leaves limbs out on an incomplete page (next_page_token)", async () => {
    expect((await osvLookup(reply({ results: [{ next_page_token: "t" }, {}] }))([a, b])).size).toBe(0);
  });
  it("leaves only the limb with a failed detail fetch out, never reporting it clean", async () => {
    const f = fake({ batch: { results: [{ vulns: [{ id: "GHSA-9" }] }, {}] }, details: { "GHSA-9": null } });
    const r = await osvLookup(f)([a, b]);
    expect(r.has(limbKey(a))).toBe(false);
    expect(r.get(limbKey(b))).toEqual([]);
  });
});

describe("CLI (scripts/exhume.ts)", () => {
  const cli = (...args: string[]) =>
    spawnSync(process.execPath, ["--import", "tsx", "scripts/exhume.ts", ...args], { encoding: "utf8" });
  it("exits non-zero without a target and for a directory with no manifest", () => {
    expect(cli().status).toBe(1);
    const dir = mkdtempSync(join(tmpdir(), "crypt-cli-"));
    const r = cli(dir, "--offline", "--out", join(dir, "o.json"));
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("nothing was exhumed");
  });
  it("ignores feeds shipped inside the scanned repository", () => {
    const dir = mkdtempSync(join(tmpdir(), "crypt-cli-"));
    writeFileSync(join(dir, "package-lock.json"), JSON.stringify({ lockfileVersion: 3, packages: { "node_modules/a": { version: "1.0.0" } } }));
    mkdirSync(join(dir, "feeds"));
    writeFileSync(join(dir, "feeds", "kev.json"), JSON.stringify({ dateReleased: "2026-01-01", vulnerabilities: [] }));
    const out = join(dir, "o.json");
    const r = cli(dir, "--offline", "--feeds", join(dir, "nofeeds"), "--cache", join(dir, "cache"), "--out", out);
    expect(r.status).toBe(0);
    expect(JSON.parse(readFileSync(out, "utf8")).feeds.kev.status).toBe("missing");
  });
});

describe("creature repo name", () => {
  const none = () => null;
  it("takes the repo name from a GitHub URL, without .git", () => {
    expect(creatureRepoName("https://github.com/e-1305/Crypt", none)).toBe("Crypt");
    expect(creatureRepoName("https://github.com/e-1305/Crypt.git", none)).toBe("Crypt");
    expect(creatureRepoName("https://github.com/e-1305/Crypt/", none)).toBe("Crypt");
  });
  it("takes the package.json name, stripping a scope", () => {
    expect(creatureRepoName("/x/dir", () => "left-pad")).toBe("left-pad");
    expect(creatureRepoName("/x/dir", () => "@scope/pkg")).toBe("pkg");
  });
  it("falls back to the directory name", () => {
    expect(creatureRepoName("/x/some-dir", none)).toBe("some-dir");
    expect(creatureRepoName("/x/some-dir", () => packageJsonName("not json"))).toBe("some-dir");
    expect(creatureRepoName("/x/some-dir", () => packageJsonName('{"name":3}'))).toBe("some-dir");
  });
  it("writes repo after schemaVersion only when a name is given", async () => {
    const repo = { read: (p: string) => (p === "package-lock.json" ? JSON.stringify({ lockfileVersion: 3, packages: { "node_modules/a": { version: "1.0.0" } } }) : null) };
    const base = { repo, cacheFs: memFs(), cacheDir: "c", kev: null, epss: null };
    const named = await buildCreature({ ...base, name: "demo" });
    expect(Object.keys(named).slice(0, 2)).toEqual(["schemaVersion", "repo"]);
    expect(named.repo).toBe("demo");
    expect("repo" in (await buildCreature(base))).toBe(false);
  });
  it("exhume of fixtures/vulnerable-npm writes repo 'vulnerable-npm-fixture', whatever the cwd", () => {
    const cwd = mkdtempSync(join(tmpdir(), "crypt-name-"));
    const root = join(__dirname, "..");
    const out = join(cwd, "c.json");
    const r = spawnSync(
      process.execPath,
      ["--import", join(root, "node_modules/tsx/dist/loader.mjs"), join(root, "scripts/exhume.ts"), join(root, "fixtures/vulnerable-npm"), "--offline", "--feeds", join(root, "fixtures/vulnerable-npm/feeds"), "--cache", join(root, "data/cache/osv"), "--out", out],
      { encoding: "utf8", cwd },
    );
    expect(r.status).toBe(0);
    expect(JSON.parse(readFileSync(out, "utf8")).repo).toBe("vulnerable-npm-fixture");
  });
});
