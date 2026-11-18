import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { numRuns } from "./runs.js";
import { feedSnapshotText } from "../scripts/build-site.js";
import { parseFeedSnapshot } from "../src/web/feed-snapshot.js";
import { LiveExhumeError, PROGRESS_STEPS, liveExhume, type FetchLike, type ProgressStep } from "../src/web/live-exhume.js";
import { LOCKFILE_LIMIT_LINE, exorcisedRows, funnelOwners, funnelText, noiseFunnel } from "../src/web/noise-funnel.js";
import { parseRepoUrl, repoFromQuery } from "../src/web/repo-url.js";
import type { OsvLookup } from "../src/exhume/osv.js";

// R1: scan your own repo. Everything runs on a mocked fetch: no network.
const DEMO = "fixtures/crypt-demo";
const REPO = "https://github.com/acme/widgets";
const RAW = "https://raw.githubusercontent.com/acme/widgets";
const feeds = parseFeedSnapshot(feedSnapshotText(["fixtures/vulnerable-npm/feeds"]));
const lock = readFileSync(join(DEMO, "package-lock.json"), "utf8");

type Route = (url: string) => { status: number; body?: string } | "throw" | undefined;
function mock(route: Route): FetchLike {
  return async (url) => {
    const r = route(url) ?? { status: 404 };
    if (r === "throw") throw new Error("offline");
    return { ok: r.status >= 200 && r.status < 300, status: r.status, text: async () => r.body ?? "", json: async () => JSON.parse(r.body ?? "null") };
  };
}
const lockOk: Route = (u) => (u === `${RAW}/HEAD/package-lock.json` ? { status: 200, body: lock } : undefined);
const run = (f: FetchLike, extra: object = {}) => liveExhume(REPO, { fetch: f, feeds, cacheFs: { read: () => null, write: () => {} }, ...extra });
async function failure(p: Promise<unknown>): Promise<LiveExhumeError> {
  try {
    await p;
  } catch (e) {
    expect(e).toBeInstanceOf(LiveExhumeError);
    return e as LiveExhumeError;
  }
  throw new Error("expected a LiveExhumeError, got a creature");
}

describe("scan progress", () => {
  it("reports the four plain-word steps once each, in order", async () => {
    const osv: OsvLookup = async () => new Map();
    const steps: ProgressStep[] = [];
    await run(mock(lockOk), { osv, onProgress: (s: ProgressStep) => steps.push(s) }).catch(() => {});
    expect(steps).toEqual(["Reading the lockfile", "Asking OSV", "Ranking with KEV and EPSS", "Stitching the creature"]);
    expect([...PROGRESS_STEPS]).toEqual(steps);
  });

  it("still reports every step when the OSV cache answers everything", async () => {
    const steps: string[] = [];
    const osv: OsvLookup = async () => new Map();
    await run(mock(lockOk), { osv, onProgress: (s: string) => steps.push(s) }).catch(() => {});
    expect(steps).toHaveLength(4);
  });

  it("stops reporting at the failing step", async () => {
    const steps: string[] = [];
    await failure(run(mock(() => ({ status: 429 })), { onProgress: (s: string) => steps.push(s) }));
    expect(steps).toEqual(["Reading the lockfile"]);
  });
});

describe("scan error states draw no creature", () => {
  const cases: [string, Route, string][] = [
    ["rate limit 429", () => ({ status: 429 }), "rate-limited"],
    ["rate limit 403", () => ({ status: 403 }), "rate-limited"],
    ["private or missing repo (404)", () => ({ status: 404 }), "not-found"],
    ["yarn.lock only", (u) => (u.endsWith("/yarn.lock") ? { status: 200, body: "# yarn" } : undefined), "no-npm-lockfile"],
    ["pnpm-lock.yaml only", (u) => (u.endsWith("/pnpm-lock.yaml") ? { status: 200, body: "lockfileVersion: 6" } : undefined), "no-npm-lockfile"],
    ["GitHub down (500)", () => ({ status: 500 }), "network"],
    ["offline", () => "throw", "network"],
    ["OSV answers 500", (u) => (u.startsWith("https://api.osv.dev") ? { status: 500 } : lockOk(u)), "osv-unavailable"],
    ["OSV rate limit 429", (u) => (u.startsWith("https://api.osv.dev") ? { status: 429 } : lockOk(u)), "osv-unavailable"],
    ["OSV timeout", (u) => (u.startsWith("https://api.osv.dev") ? "throw" : lockOk(u)), "osv-unavailable"],
  ];
  for (const [name, route, expected] of cases) {
    it(`${name} is ${expected}, with an action and no creature`, async () => {
      const err = await failure(run(mock(route)));
      expect(err.code).toBe(expected);
      expect(err.message.length).toBeGreaterThan(20);
      expect(err.message).not.toMatch(/healthy creature|all clear/i);
    });
  }

  it("a missing feed snapshot stops the scan", async () => {
    const err = await failure(liveExhume(REPO, { fetch: mock(lockOk), feeds: null }));
    expect(err.code).toBe("feed-missing");
  });

  it("a partial OSV outage keeps the unchecked packages unknown (Rotting), never Healthy", async () => {
    const osv: OsvLookup = async (limbs) => new Map(limbs.slice(0, 1).map((l) => [`${l.ecosystem}:${l.name}@${l.version}`, []]));
    const r = await run(mock(lockOk), { osv });
    const unknown = r.limbs.filter((l) => l.unknown);
    expect(unknown.length).toBeGreaterThan(0);
    for (const l of unknown) expect(l.state).not.toBe("Healthy");
    expect(r.notes.join(" ")).toMatch(/could not be checked/);
  });
});

describe("noise funnel", () => {
  it("counts findings, exorcised noise and monsters like the share card", () => {
    const f = noiseFunnel([
      { state: "Possessed", spawned: true },
      { state: "Rotting", spawned: true },
      { state: "Rotting", spawned: false },
      { state: "Rotting", spawned: false },
      { state: "Healthy", spawned: false },
    ]);
    expect(f).toEqual({ findings: 4, noise: 2, monsters: 2 });
    expect(funnelText(f)).toBe("4 findings -> 2 exorcised as noise -> 2 monsters");
  });

  it("N = M + K for any limbs", () => {
    const limb = fc.record({ state: fc.constantFrom("Healthy", "Rotting", "Possessed", "Healed"), spawned: fc.boolean() });
    fc.assert(
      fc.property(fc.array(limb), (limbs) => {
        const f = noiseFunnel(limbs);
        expect(f.findings).toBe(f.noise + f.monsters);
        expect(f.noise).toBeGreaterThanOrEqual(0);
      }),
      { numRuns: numRuns(50) },
    );
  });

  it("matches a real scan of the demo and names owners from CODEOWNERS or no owner", async () => {
    const osv: OsvLookup = async (limbs) => new Map(limbs.map((l) => [`${l.ecosystem}:${l.name}@${l.version}`, []]));
    const r = await run(mock(lockOk), { osv });
    const f = noiseFunnel(r.limbs);
    expect(f.findings).toBe(f.noise + f.monsters);
    expect(funnelOwners(r.limbs)).toEqual(["no owner yet"]);
  });

  it("lists owners only from CODEOWNERS, deduplicated", () => {
    expect(funnelOwners([{ state: "Rotting", spawned: true, owner: "@acme/platform" }, { state: "Rotting", spawned: true, owner: "@acme/platform" }, { state: "Rotting", spawned: false, owner: "@x/y" }])).toEqual(["@acme/platform"]);
  });
});

describe("?repo= link", () => {
  // web/live-exhume.js accepts ?repo= only through repoFromQuery, then runs the same parseRepoUrl path as a pasted URL.
  const fromQuery = (v: string) => repoFromQuery(v);
  it("reopens owner/name", () => {
    expect(fromQuery("acme/widgets")).toEqual({ owner: "acme", repo: "widgets" });
  });
  it("rejects hostile values", () => {
    for (const bad of ["", "acme", "../../etc/passwd", "acme/..", "acme/widgets.git", "https://github.com/acme/widgets", "@evil.example/x", "acme/widgets/../../x", "a b/c", "<script>alert(1)</script>/x", "acme\\widgets", "%2e%2e/x", "javascript:alert(1)/x"]) {
      expect(fromQuery(bad), bad).toBeNull();
    }
  });
  it("any accepted value is a plain owner/name", () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 60 }), (s) => {
        const r = fromQuery(s);
        if (r) {
          expect(`${r.owner}/${r.repo}`).toBe(s);
          expect(parseRepoUrl("https://github.com/" + s)).toEqual(r);
        }
      }),
      { numRuns: numRuns(50) },
    );
  });
});

describe("blameless hero", () => {
  const glue = readFileSync("web/live-exhume.js", "utf8");
  const html = readFileSync("web/index.html", "utf8");
  it("never ranks other repos as worst and never names a person in failure", () => {
    for (const text of [glue, html]) expect(text).not.toMatch(/worst|leaderboard|shame/i);
    expect(glue).not.toMatch(/blame|author|committer/i);
  });
  it("error messages name no person", async () => {
    const err = await failure(run(mock(() => ({ status: 429 }))));
    expect(err.message).not.toMatch(/@\w/);
  });
  it("uses the shipped web build", () => {
    expect(existsSync("src/web/noise-funnel.ts")).toBe(true);
  });
});

describe("paste hint and source label", () => {
  const html = readFileSync("web/index.html", "utf8");
  const js = readFileSync("web/live-exhume.js", "utf8");
  it("says what works and offers the example as a chip", () => {
    expect(html).toContain("package-lock.json at the root (npm)");
    expect(html).toMatch(/id="paste-example"[^>]*>e-1305\/crypt-demo</);
  });
  it("labels whether the result is the pasted repo or the demo", () => {
    expect(js).toContain("This is the repo you pasted");
    expect(js).toContain("not your own");
  });
});

describe("exorcised list", () => {
  const limb = (name: string, state: string, spawned: boolean, extra: object = {}) => ({ name, version: "1.0.0", state, spawned, ...extra });
  it("gives every exorcised row a reason and keeps shown + exorcised = findings", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            state: fc.constantFrom("Healthy", "Rotting", "Possessed"),
            spawned: fc.boolean(),
            unknown: fc.boolean(),
            epss: fc.option(fc.double({ min: 0, max: 0.099, noNaN: true }), { nil: null }),
          }),
          { maxLength: 30 },
        ),
        (specs) => {
          const limbs = specs.map((s, i) => limb("p" + i, s.state, s.spawned, { unknown: s.unknown, epss: s.epss, kev: false }));
          const f = noiseFunnel(limbs);
          const rows = exorcisedRows(limbs);
          expect(rows.length + f.monsters).toBe(f.findings);
          expect(rows.length).toBe(f.noise);
          for (const r of rows) expect(r.reason.trim().length).toBeGreaterThan(0);
        },
      ),
      { numRuns: numRuns(100) },
    );
  });

  it("states the EPSS reason, and keeps unknown limbs unknown", () => {
    const rows = exorcisedRows([
      limb("a", "Rotting", false, { epss: 0.02 }),
      limb("b", "Rotting", false, { unknown: true, unknownReason: "osv-unavailable" }),
      limb("c", "Rotting", true, { epss: 0.5 }),
    ]);
    expect(rows).toHaveLength(2);
    expect(rows[0]!.reason).toBe("EPSS 0.02 is below 0.1, not in KEV");
    expect(rows[1]!.unknown).toBe(true);
    expect(rows[1]!.reason).toMatch(/^Unknown/);
  });

  it("matches a real scan and ships the lockfile limit line", async () => {
    const osv: OsvLookup = async (limbs) => new Map(limbs.map((l) => [`${l.ecosystem}:${l.name}@${l.version}`, []]));
    const r = await run(mock(lockOk), { osv });
    expect(exorcisedRows(r.limbs).length).toBe(noiseFunnel(r.limbs).noise);
    expect(LOCKFILE_LIMIT_LINE).toBe("Lockfile only. A finding means the locked version has an advisory, not that the code runs it.");
    expect(readFileSync("web/live-exhume.js", "utf8")).toContain("LOCKFILE_LIMIT_LINE");
  });
});
