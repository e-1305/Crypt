// Graft quality (spec .kiro/specs/graft-quality): the fixed version clears every advisory of the package,
// majors are flagged, one PR per package, transitive-only packages use npm overrides, blameless owner copy.
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import fc from "fast-check";
import { afterEach, describe, expect, it } from "vitest";
import { numRuns } from "./runs.js";
import { defaultPaths } from "../src/common/agent.js";
import { nodeIo } from "../src/common/io.js";
import { buildCreature } from "../src/exhume/creature.js";
import { groupLimbs } from "../src/exhume/group.js";
import { ownerLabel } from "../src/exhume/owners.js";
import { parseEpss, parseKev } from "../src/exhume/feeds.js";
import type { OsvLookup } from "../src/exhume/osv.js";
import { type OsvVuln, limbKey } from "../src/exhume/types.js";
import { dryRunClient } from "../src/github/client.js";
import { parseAdvisory } from "../src/necromancer/advisory.js";
import { graft, type AdvisoryLookup } from "../src/necromancer/index.js";
import { overrideLockfile } from "../src/necromancer/lockfile.js";
import { fetchPackageAdvisories, type PackageAdvisoryFetch } from "../src/necromancer/package-advisories.js";
import { BREAKING_NOTE, TRANSITIVE_NOTE, prBody, prTitle } from "../src/necromancer/pr-body.js";
import {
  affectedByAny,
  chooseGroupVersion,
  chooseVersion,
  isBreaking,
  parseVersion,
  type Advisory,
  type RangeEvent,
} from "../src/necromancer/version.js";
import { generate } from "../src/raise/generate.js";
import { renderPlate, plateSummary } from "../src/render/plate.js";
import { nodeFs } from "../scripts/node-fs.js";
import { feedSnapshotText } from "../scripts/build-site.js";
import { fixtureAdvisories } from "../scripts/osv-advisory.js";
import { parseFeedSnapshot } from "../src/web/feed-snapshot.js";
import { liveExhume, type FetchLike } from "../src/web/live-exhume.js";

const FQ = "fixtures/graft-quality";
const FEEDS = "fixtures/vulnerable-npm/feeds";
const readAdv = (id: string): Advisory => parseAdvisory(JSON.parse(readFileSync(join(FQ, "advisories", `${id}.json`), "utf8")))!;
const ALL_LODASH = ["GQ-LODASH-1", "GQ-LODASH-2", "GQ-LODASH-3"].map(readAdv);
const ALL_MINIMIST = ["GQ-MINIMIST-1", "GQ-MINIMIST-2"].map(readAdv);

// What OSV answers per installed copy. 4.17.21 is clean for OSV's per-version query here on purpose:
// only the package-wide advisory list shows that it is still affected by GQ-LODASH-3.
const PER_COPY: Record<string, string[]> = {
  "lodash@2.4.2": ["GQ-LODASH-1", "GQ-LODASH-2"],
  "minimist@0.0.8": ["GQ-MINIMIST-1"],
  "minimist@1.2.0": ["GQ-MINIMIST-2"],
};
const osv: OsvLookup = async (limbs) => {
  const out = new Map<string, OsvVuln[]>();
  for (const l of limbs) {
    const ids = PER_COPY[`${l.name}@${l.version}`] ?? [];
    out.set(limbKey(l), ids.map((id) => ({ id, aliases: ["CVE-2020-11023"], severity: "HIGH" })));
  }
  return out;
};

const snapshot = () => parseFeedSnapshot(feedSnapshotText([FEEDS]))!;

/** raw.githubusercontent.com serves the fixture; api.osv.dev answers the package query and single advisories. */
function serve(): { f: FetchLike; queries: string[] } {
  const queries: string[] = [];
  const f: FetchLike = async (url, init) => {
    let status = 404;
    let body: unknown = "";
    const raw = /^https:\/\/raw\.githubusercontent\.com\/[^/]+\/[^/]+\/(?:HEAD|main|master)\/(.+)$/.exec(url);
    if (url === "https://api.osv.dev/v1/query") {
      const q = JSON.parse(init?.body ?? "{}") as { package: { name: string } };
      queries.push(q.package.name);
      const vulns = [...ALL_LODASH, ...ALL_MINIMIST].filter((a) => a.affected.some((x) => x.package.name === q.package.name));
      status = 200;
      body = { vulns };
    } else if (raw && raw[1] === "package-lock.json") {
      status = 200;
      body = readFileSync(join(FQ, "package-lock.json"), "utf8");
    }
    return {
      ok: status === 200,
      status,
      text: async () => (typeof body === "string" ? body : JSON.stringify(body)),
      json: async () => body,
    };
  };
  return { f, queries };
}

describe("1. the fixed version clears every advisory of the package", () => {
  it("the old per-limb choice lands on a still-affected version; the package-wide choice does not", () => {
    const own = [readAdv("GQ-LODASH-1"), readAdv("GQ-LODASH-2")];
    expect(chooseVersion("npm", "lodash", "2.4.2", own)?.version).toBe("4.17.21");
    expect(affectedByAny("npm", "lodash", "4.17.21", ALL_LODASH)).toBe(true);
    const c = chooseGroupVersion("npm", "lodash", ["2.4.2", "4.17.21"], ["2.4.2"], ALL_LODASH)!;
    expect(c.version).toBe("4.17.23");
    expect(c.affected).toEqual(["2.4.2", "4.17.21"]);
    expect(c.from).toBe("2.4.2");
  });

  it("explicit affected `versions` lists count as affected", () => {
    const a: Advisory = {
      id: "V",
      aliases: [],
      affected: [{ package: { ecosystem: "npm", name: "p" }, ranges: [{ type: "SEMVER", events: [{ introduced: "0" }, { fixed: "1.0.1" }] }], versions: ["1.0.1"] }],
    };
    expect(chooseVersion("npm", "p", "1.0.0", [a])).toBeNull();
  });

  it("property: chooseVersion never returns a version that any advisory for the package marks affected", () => {
    const v = fc.tuple(fc.nat(4), fc.nat(4), fc.nat(4));
    const fmt = ([a, b, c]: number[]) => `${a}.${b}.${c}`;
    const key = ([a, b, c]: number[]) => a * 10000 + b * 100 + c;
    const interval = fc.record({ a: v, b: v, kind: fc.constantFrom("fixed", "last_affected", "open") });
    const listed = fc.array(v, { maxLength: 3 });
    fc.assert(
      fc.property(
        v,
        fc.array(fc.record({ ivs: fc.array(interval, { minLength: 1, maxLength: 3 }), listed, other: fc.boolean() }), { minLength: 1, maxLength: 5 }),
        (cur, advs) => {
          const advisories: Advisory[] = advs.map((x, i) => ({
            id: `A${i}`,
            aliases: [],
            affected: [
              {
                package: { ecosystem: "npm", name: x.other ? "other" : "p" },
                ranges: x.ivs.map((iv) => {
                  const [lo, hi] = key(iv.a) <= key(iv.b) ? [iv.a, iv.b] : [iv.b, iv.a];
                  const events: RangeEvent[] = [{ introduced: fmt(lo) }];
                  if (iv.kind === "fixed") events.push({ fixed: fmt(hi) });
                  if (iv.kind === "last_affected") events.push({ last_affected: fmt(hi) });
                  return { type: "SEMVER", events };
                }),
                versions: x.listed.map(fmt),
              },
            ],
          }));
          const got = chooseVersion("npm", "p", fmt(cur), advisories);
          if (!got) return true;
          // Oracle: ask every advisory on its own.
          for (const a of advisories) if (affectedByAny("npm", "p", got.version, [a]) !== false) return false;
          return key([parseVersion(got.version)!.major, parseVersion(got.version)!.minor, parseVersion(got.version)!.patch]) > key(cur);
        },
      ),
      { numRuns: numRuns(300) },
    );
  });

  it("property: a group choice is above every affected copy and outside every advisory", () => {
    const v = fc.tuple(fc.nat(3), fc.nat(3), fc.nat(3)).map(([a, b, c]) => `${a}.${b}.${c}`);
    fc.assert(
      fc.property(fc.array(v, { minLength: 1, maxLength: 4 }), fc.array(fc.tuple(v, v), { minLength: 1, maxLength: 3 }), (installed, ranges) => {
        const advisories: Advisory[] = ranges.map(([x, y], i) => {
          const [lo, hi] = compare(x, y) <= 0 ? [x, y] : [y, x];
          return { id: `A${i}`, aliases: [], affected: [{ package: { ecosystem: "npm", name: "p" }, ranges: [{ type: "SEMVER", events: [{ introduced: lo }, { fixed: hi }] }] }] };
        });
        const got = chooseGroupVersion("npm", "p", installed, [], advisories);
        if (!got) return true;
        const to = parseVersion(got.version)!;
        for (const a of got.affected) if (compareV(parseVersion(a)!, to) >= 0) return false;
        return advisories.every((a) => affectedByAny("npm", "p", got.version, [a]) === false);
      }),
      { numRuns: numRuns(300) },
    );
  });
});

function compare(a: string, b: string): number {
  return compareV(parseVersion(a)!, parseVersion(b)!);
}
function compareV(a: { major: number; minor: number; patch: number }, b: { major: number; minor: number; patch: number }): number {
  return a.major - b.major || a.minor - b.minor || a.patch - b.patch;
}

describe("2. major bumps are flagged", () => {
  const p = (s: string) => parseVersion(s)!;
  it("computes breaking from the semver major and the 0.x minor", () => {
    expect(isBreaking(p("2.4.2"), p("4.17.21"))).toBe(true);
    expect(isBreaking(p("3.4.1"), p("3.5.0"))).toBe(false);
    expect(isBreaking(p("1.2.3"), p("1.2.4"))).toBe(false);
    expect(isBreaking(p("0.5.1"), p("0.6.0"))).toBe(true);
    expect(isBreaking(p("0.5.1"), p("0.5.9"))).toBe(false);
  });

  it("jquery 3.4.1 to 3.5.0 stays correct and non-breaking", () => {
    const a = parseAdvisory(JSON.parse(readFileSync("fixtures/vulnerable-npm/advisories/GHSA-gxr4-xjj5-5px2.json", "utf8")))!;
    const c = chooseVersion("npm", "jquery", "3.4.1", [a]);
    expect(c).toEqual({ version: "3.5.0", breaking: false });
  });

  it("the title and body carry the warning only for breaking grafts", () => {
    const base = { name: "lodash", from: "2.4.2", to: "4.17.23", limb: "LODASH" };
    expect(prTitle({ ...base, breaking: true })).toBe(`fix: graft lodash 2.4.2 to 4.17.23 (LODASH) ${BREAKING_NOTE}`);
    expect(BREAKING_NOTE).toBe("\u26a0 major: review carefully");
    expect(prTitle({ ...base, breaking: false })).toBe("fix: graft lodash 2.4.2 to 4.17.23 (LODASH)");
    const fields = { limb: "LODASH", name: "lodash", from: "2.4.2", to: "4.17.23", cves: [], kev: false, epss: null, owner: "", auditId: "a" };
    expect(prBody({ ...fields, breaking: true })).toContain(BREAKING_NOTE);
    expect(prBody({ ...fields, breaking: false })).not.toContain(BREAKING_NOTE);
  });
});

describe("5. blameless owner copy", () => {
  it("says no owner yet, never unowned", () => {
    expect(ownerLabel("unowned")).toBe("no owner yet");
    expect(ownerLabel("")).toBe("no owner yet");
    expect(ownerLabel("@team/x")).toBe("@team/x");
    const body = prBody({ limb: "A", name: "a", from: "1.0.0", to: "1.0.1", breaking: false, cves: [], kev: false, epss: null, owner: "unowned", auditId: "x" });
    expect(body).toContain("Owner: no owner yet");
    expect(body).not.toMatch(/unowned/);
  });
});

describe("3, 4. the NodeGoat-like fixture in the browser pipeline", () => {
  const run = () => liveExhume("https://github.com/e-1305/nodegoat-like", { fetch: serve().f, feeds: snapshot(), osv, now: 0 });

  it("groups the copies and yields exactly one payload per package", async () => {
    const live = await run();
    const lodashCopies = live.limbs.filter((l) => l.name === "lodash");
    expect(lodashCopies.length).toBe(2);
    const g = live.groups.find((x) => x.name === "lodash")!;
    expect(g.versions).toEqual(["2.4.2", "4.17.21"]);
    expect(g.kind).toBe("direct");
    expect(live.groups.find((x) => x.name === "minimist")!.kind).toBe("transitive");
    expect(live.groups.filter((x) => x.name === "lodash").length).toBe(1);
    const lodash = live.payloads.filter((p) => p.status === "ready" && p.name === "lodash");
    expect(lodash.length).toBe(1);
    expect(new Set(live.payloads.map((p) => p.name)).size).toBe(live.payloads.length);
  });

  it("lodash: the version clears all advisories, the major bump is flagged, direct keeps the version bump", async () => {
    const live = await run();
    const p = live.payloads.find((x) => x.status === "ready" && x.name === "lodash");
    if (!p || p.status !== "ready") throw new Error("no lodash payload");
    expect(p.to).toBe("4.17.23");
    for (const a of ALL_LODASH) expect(affectedByAny("npm", "lodash", p.to, [a])).toBe(false);
    expect(p.breaking).toBe(true);
    expect(p.title).toBe(`fix: graft lodash 2.4.2, 4.17.21 to 4.17.23 (${p.limb}) ${BREAKING_NOTE}`);
    expect(p.kind).toBe("direct");
    expect(p.versions).toEqual(["2.4.2", "4.17.21"]);
    expect(p.body).not.toContain(TRANSITIVE_NOTE);
    expect(p.body).toContain("Dependency: direct");
    expect(p.body).toContain("Owner: no owner yet");
  });

  it("minimist is transitive only: forced via overrides, and the body says so", async () => {
    const live = await run();
    const p = live.payloads.find((x) => x.status === "ready" && x.name === "minimist");
    if (!p || p.status !== "ready") throw new Error("no minimist payload");
    expect(p.kind).toBe("transitive");
    expect(p.to).toBe("1.2.6");
    expect(p.breaking).toBe(true);
    expect(p.body).toContain(TRANSITIVE_NOTE);
    expect(p.body).toContain("Dependency: transitive");
    expect(TRANSITIVE_NOTE).toBe("transitive: forced via overrides; check the parents' compatibility");
  });

  it("the plate and its screen reader summary show one entry per package", async () => {
    const live = await run();
    expect(live.plate.match(/lodash/g)?.length).toBe(1);
    expect(live.plate).toContain("lodash x2");
    expect(plateSummary(live.creature).filter((s) => s.startsWith("lodash")).length).toBe(1);
  });

  it("asks OSV for the whole package, not only the installed version", async () => {
    const s = serve();
    await liveExhume("https://github.com/e-1305/nodegoat-like", { fetch: s.f, feeds: snapshot(), osv, now: 0 });
    expect(s.queries).toContain("lodash");
  });

  it("fails safe: when the package-wide list cannot be read, no payload is built", async () => {
    const good = serve().f;
    const broken: FetchLike = async (url, init) => (url === "https://api.osv.dev/v1/query" ? { ok: false, status: 500, text: async () => "", json: async () => null } : good(url, init));
    const live = await liveExhume("https://github.com/e-1305/nodegoat-like", { fetch: broken, feeds: snapshot(), osv, now: 0 });
    expect(live.payloads.length).toBeGreaterThan(0);
    for (const p of live.payloads) expect(p.status).toBe("no-fix");
  });
});

describe("groupLimbs", () => {
  const mk = (name: string, version: string, direct: boolean, rank: number) => ({
    ecosystem: "npm", name, version, direct, state: "Rotting" as const, unknown: false, spawned: rank === 1, kev: false, epss: null, owner: "unowned", rank,
  });
  it("collapses copies, orders versions, labels direct when any copy is direct", () => {
    const g = groupLimbs([mk("lodash", "4.17.21", false, 1), mk("a", "1.0.0", false, 2), mk("lodash", "2.4.2", true, 3), mk("lodash", "4.17.4", false, 4)]);
    expect(g.map((x) => x.name)).toEqual(["lodash", "a"]);
    expect(g[0]!.versions).toEqual(["2.4.2", "4.17.4", "4.17.21"]);
    expect(g[0]!.kind).toBe("direct");
    expect(g[0]!.rank).toBe(1);
    expect(g[0]!.spawned).toBe(true);
    expect(g[1]!.kind).toBe("transitive");
  });
});

describe("package advisory fetch", () => {
  const reply = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body });
  it("follows page tokens and unions the pages", async () => {
    const pages = [{ vulns: [ALL_LODASH[0]], next_page_token: "t1" }, { vulns: [ALL_LODASH[1]] }];
    let i = 0;
    const f: PackageAdvisoryFetch = async (_u, init) => {
      if (i > 0) expect(JSON.parse(init?.body ?? "{}").page_token).toBe("t1");
      return reply(pages[i++]);
    };
    const r = await fetchPackageAdvisories(f, "npm", "lodash");
    expect(r.ok && r.advisories.map((a) => a.id)).toEqual(["GQ-LODASH-1", "GQ-LODASH-2"]);
  });
  it("fails safe on HTTP errors, rate limits, bad records and endless pages", async () => {
    expect(await fetchPackageAdvisories(async () => reply({}, 500), "npm", "x")).toEqual({ ok: false, rateLimited: false });
    expect(await fetchPackageAdvisories(async () => reply({}, 429), "npm", "x")).toEqual({ ok: false, rateLimited: true });
    expect(await fetchPackageAdvisories(async () => reply({ vulns: [{ nope: 1 }] }), "npm", "x")).toEqual({ ok: false, rateLimited: false });
    expect(await fetchPackageAdvisories(async () => reply({ vulns: [], next_page_token: "again" }), "npm", "x")).toEqual({ ok: false, rateLimited: false });
    expect(await fetchPackageAdvisories(async () => { throw new Error("down"); }, "npm", "x")).toEqual({ ok: false, rateLimited: false });
  });
});

describe("overrideLockfile (transitive graft)", () => {
  const meta = { version: "1.2.6", resolved: "https://registry.npmjs.org/minimist/-/minimist-1.2.6.tgz", integrity: "sha512-AAAA", dependencies: {}, optionalDependencies: {}, peerDependencies: {} };
  const input = () => ({
    pkgText: readFileSync(join(FQ, "package.json"), "utf8"),
    lockText: readFileSync(join(FQ, "package-lock.json"), "utf8"),
    name: "minimist",
    from: "0.0.8",
    meta,
    fixed: "1.2.6",
  });
  it("adds an overrides entry and rewrites every copy below the fixed version", () => {
    const r = overrideLockfile(input());
    if (!r.ok) throw new Error(r.reason);
    const pkg = JSON.parse(r.pkg);
    const lock = JSON.parse(r.lock);
    expect(pkg.overrides).toEqual({ minimist: ">=1.2.6" });
    expect(pkg.dependencies).toEqual({ lodash: "^4.17.21", mkdirp: "^0.5.1" });
    expect(lock.packages["node_modules/minimist"].version).toBe("1.2.6");
    expect(lock.packages["node_modules/mkdirp/node_modules/minimist"].version).toBe("1.2.6");
    expect(lock.packages["node_modules/lodash"].version).toBe("4.17.21");
  });
  it("aborts without changes when a copy would change its dependencies or an override conflicts", () => {
    const withDeps = { ...meta, dependencies: { x: "1.0.0" } };
    expect(overrideLockfile({ ...input(), meta: withDeps })).toEqual({ ok: false, reason: "dependencies-changed" });
    const pkg = JSON.parse(input().pkgText);
    pkg.overrides = { minimist: { a: "1" } };
    expect(overrideLockfile({ ...input(), pkgText: JSON.stringify(pkg) })).toEqual({ ok: false, reason: "overrides-conflict" });
  });
});

describe("Necromancer on the fixture (CLI path): one PR per package, overrides for transitive", () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  });

  async function setup() {
    const dir = mkdtempSync(join(tmpdir(), "crypt-gq-"));
    dirs.push(dir);
    const paths = defaultPaths(dir);
    const kev = parseKev(readFileSync(join(FEEDS, "kev.json"), "utf8"));
    const epss = parseEpss(readFileSync(join(FEEDS, "epss.csv"), "utf8"));
    const creature = await buildCreature({ repo: nodeFs(FQ), cacheFs: nodeFs(dir), cacheDir: "cache", kev, epss, lookup: osv, name: "nodegoat-like" });
    mkdirSync(join(dir, "out"), { recursive: true });
    writeFileSync(paths.creaturePath, JSON.stringify(creature));
    const gen = generate(creature as unknown as Parameters<typeof generate>[0]);
    writeFileSync(paths.limbsPath, JSON.stringify(gen.limbs));
    const advisories: AdvisoryLookup = fixtureAdvisories(join(FQ, "advisories"));
    const ctx = {
      ...paths,
      io: nodeIo,
      client: dryRunClient(nodeIo, paths.prsDir, () => new Date("2026-01-01T00:00:00Z")),
      advisories,
      targetDir: FQ,
      now: () => new Date("2026-01-01T00:00:00Z"),
      registry: {
        async getVersion(name: string, version: string) {
          return { version, resolved: `https://registry.npmjs.org/${name}/-/${name}-${version}.tgz`, integrity: "sha512-BBBB", dependencies: {}, optionalDependencies: {}, peerDependencies: {} };
        },
      },
    };
    const ids = (name: string) => Object.entries(gen.limbs).filter(([, l]) => l.name === name).map(([k]) => k);
    const req = (limb: string) => {
      const p = join(dir, "out", `${limb}.json`);
      writeFileSync(p, JSON.stringify({ version: 1, action: "GRAFT", limb }));
      return p;
    };
    return { ctx, ids, req, paths };
  }

  it("grafts lodash once; a second copy of the same package gets PR_EXISTS only in the live record path", async () => {
    const { ctx, ids, req, paths } = await setup();
    const [first] = ids("lodash");
    const r = await graft(ctx, req(first!));
    expect(r.outcome).toBe("DRYRUN_WRITTEN");
    expect(r.breaking).toBe(true);
    const files = readdirSync(paths.prsDir);
    expect(files.length).toBe(1);
    const pr = JSON.parse(readFileSync(join(paths.prsDir, files[0]!), "utf8"));
    expect(pr.branch).toContain("4.17.23");
    expect(pr.title).toContain(BREAKING_NOTE);
    expect(pr.body).toContain("Installed versions: 2.4.2, 4.17.21");
    const pkg = JSON.parse(pr.files.find((f: { path: string }) => f.path === "package.json").content);
    expect(pkg.dependencies.lodash).toBe("^4.17.23");
    expect(pkg.overrides).toBeUndefined();
  });

  it("transitive-only minimist is forced via overrides and says so", async () => {
    const { ctx, ids, req, paths } = await setup();
    const r = await graft(ctx, req(ids("minimist")[0]!));
    expect(r.outcome).toBe("DRYRUN_WRITTEN");
    const files = readdirSync(paths.prsDir);
    const pr = JSON.parse(readFileSync(join(paths.prsDir, files[0]!), "utf8"));
    expect(pr.body).toContain(TRANSITIVE_NOTE);
    const pkg = JSON.parse(pr.files.find((f: { path: string }) => f.path === "package.json").content);
    expect(pkg.overrides).toEqual({ minimist: ">=1.2.6" });
    expect(pkg.dependencies).toEqual({ lodash: "^4.17.21", mkdirp: "^0.5.1" });
  });

  it("a second graft for another copy of the same package opens nothing (live record exists)", async () => {
    const { ctx, ids, req, paths } = await setup();
    const [a, b] = ids("minimist");
    // Simulate the record the live path writes after a PR opened for the first copy.
    mkdirSync(paths.prsDir, { recursive: true });
    writeFileSync(
      join(paths.prsDir, "rec.json"),
      JSON.stringify({ branch: `crypt/graft-${a!.toLowerCase()}-1.2.6`, limb: a, ecosystem: "npm", name: "minimist", from: "0.0.8", to: "1.2.6", breaking: true, number: 1, url: "u" }),
    );
    expect((await graft(ctx, req(b!))).outcome).toBe("PR_EXISTS");
  });
});

describe("plate", () => {
  it("does not draw one limb per copy", async () => {
    const live = await liveExhume("https://github.com/e-1305/nodegoat-like", { fetch: serve().f, feeds: snapshot(), osv, now: 0 });
    expect(renderPlate(live.creature)).toBe(live.plate);
  });
});
