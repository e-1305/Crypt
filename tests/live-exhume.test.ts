import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { numRuns } from "./runs.js";
import { buildCreature } from "../src/exhume/creature.js";
import { CODEOWNERS_LOCATIONS } from "../src/exhume/owners.js";
import { parseEpss, parseKev } from "../src/exhume/feeds.js";
import type { OsvLookup } from "../src/exhume/osv.js";
import { renderPlate, plateSummary } from "../src/render/plate.js";
import { nodeFs } from "../scripts/node-fs.js";
import { feedSnapshotText } from "../scripts/build-site.js";
import { parseFeedSnapshot, serializeFeedSnapshot, type FeedSnapshot } from "../src/web/feed-snapshot.js";
import { LockfileError, MAX_LOCKFILE_PACKAGES, parsePackageLock } from "../src/exhume/lockfile.js";
import { LiveExhumeError, MAX_CODEOWNERS_CHARS, MAX_PAYLOADS, MAX_RAW_CHARS, liveExhume, type FetchLike } from "../src/web/live-exhume.js";

const VULN = "fixtures/vulnerable-npm";
const DEMO = "fixtures/crypt-demo";
const FEEDS = `${VULN}/feeds`;
const offline: OsvLookup = async () => new Map();

const snapshot = (): FeedSnapshot => {
  const s = parseFeedSnapshot(feedSnapshotText([FEEDS]));
  if (!s) throw new Error("snapshot");
  return s;
};

type Res = { status: number; body?: string };
/** A fetch that serves a fixture directory as raw.githubusercontent.com and advisories as api.osv.dev. Records every URL. */
function serve(dir: string | null, extra: Record<string, Res> = {}) {
  const urls: string[] = [];
  const f: FetchLike = async (url, init) => {
    urls.push(url);
    let r: Res = { status: 404 };
    if (url in extra) r = extra[url]!;
    else if (dir !== null) {
      const raw = /^https:\/\/raw\.githubusercontent\.com\/[^/]+\/[^/]+\/(?:HEAD|main|master)\/(.+)$/.exec(url);
      const adv = /^https:\/\/api\.osv\.dev\/v1\/vulns\/(.+)$/.exec(url);
      if (url === "https://api.osv.dev/v1/query" && init?.method === "POST") {
        // Every advisory in the fixture folder that names the queried package, as OSV answers a package-only query.
        const q = JSON.parse(init.body ?? "{}") as { package?: { name?: string } };
        const dirA = join(VULN, "advisories");
        const vulns = readdirSync(dirA)
          .map((n) => JSON.parse(readFileSync(join(dirA, n), "utf8")) as { affected?: { package?: { name?: string } }[] })
          .filter((a) => (a.affected ?? []).some((x) => x.package?.name === q.package?.name));
        r = { status: 200, body: JSON.stringify({ vulns }) };
      } else if (raw) {
        const p = join(dir, raw[1]!);
        if (existsSync(p)) r = { status: 200, body: readFileSync(p, "utf8") };
      } else if (adv) {
        const p = join(VULN, "advisories", `${decodeURIComponent(adv[1]!)}.json`);
        if (existsSync(p)) r = { status: 200, body: readFileSync(p, "utf8") };
      }
    }
    return {
      ok: r.status >= 200 && r.status < 300,
      status: r.status,
      text: async () => r.body ?? "",
      json: async () => JSON.parse(r.body ?? "null"),
    };
  };
  return { f, urls };
}

async function cliCreature(dir: string, name: string) {
  const kev = parseKev(readFileSync(join(FEEDS, "kev.json"), "utf8"));
  const epss = parseEpss(readFileSync(join(FEEDS, "epss.csv"), "utf8"));
  return buildCreature({ repo: nodeFs(dir), cacheFs: nodeFs("."), cacheDir: "data/cache/osv", kev, epss, name });
}

const opts = (f: FetchLike) => ({ fetch: f, feeds: snapshot(), osv: offline, cacheFs: nodeFs("."), cacheDir: "data/cache/osv" });
const REPO_URL = "https://github.com/e-1305/crypt-demo";

async function code(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    if (e instanceof LiveExhumeError) return e.code;
    throw e;
  }
  return "no error";
}

describe("live exhume matches the CLI", () => {
  for (const [dir, name] of [
    [VULN, "e-1305/crypt-demo"],
    [DEMO, "e-1305/crypt-demo"],
  ] as const) {
    it(`${dir}: identical ranking, counts, owners and plate`, async () => {
      const { f } = serve(dir);
      const live = await liveExhume(REPO_URL, opts(f));
      const cli = await cliCreature(dir, name);
      expect(live.creature).toEqual(cli);
      expect(live.limbs.map((l) => l.id)).toEqual(cli.limbs.map((l) => l.id));
      expect(live.plate).toBe(renderPlate(cli));
      expect(live.summary).toEqual(plateSummary(cli));
      expect(live.creature.counts).toEqual(cli.counts);
      expect(live.owners).toEqual(cli.manifests.map((m) => ({ manifest: m.path, owner: m.owner })));
    });
  }

  it("reads owners from CODEOWNERS only", async () => {
    const { f } = serve(VULN);
    const live = await liveExhume(REPO_URL, opts(f));
    expect(live.owners).toEqual([{ manifest: "package-lock.json", owner: "@crypt-fixture/supply-chain" }]);
    expect(live.limbs.every((l) => l.owner === "@crypt-fixture/supply-chain")).toBe(true);
  });

  it("shows unowned without a CODEOWNERS file", async () => {
    const lock = readFileSync(join(VULN, "package-lock.json"), "utf8");
    const { f } = serve(null, { "https://raw.githubusercontent.com/e-1305/crypt-demo/HEAD/package-lock.json": { status: 200, body: lock } });
    const live = await liveExhume(REPO_URL, opts(f));
    expect(live.owners[0]!.owner).toBe("unowned");
  });

  it("reports the feed dates", async () => {
    const live = await liveExhume(REPO_URL, opts(serve(VULN).f));
    expect(live.feeds).toEqual({ kev: "2026-11-13T20:24:18.3008Z", epss: "2026-11-16T12:03:16Z" });
  });

  it("falls back from HEAD to main to master", async () => {
    const lock = readFileSync(join(VULN, "package-lock.json"), "utf8");
    const { f, urls } = serve(null, { "https://raw.githubusercontent.com/e-1305/crypt-demo/master/package-lock.json": { status: 200, body: lock } });
    const live = await liveExhume(REPO_URL, opts(f));
    expect(live.ref).toBe("master");
    expect(urls.slice(0, 3).map((u) => u.split("/")[5])).toEqual(["HEAD", "main", "master"]);
  });

  it("uses raw.githubusercontent.com and api.osv.dev only, with no git history", async () => {
    const { f, urls } = serve(DEMO);
    await liveExhume(REPO_URL, { ...opts(f) });
    expect(urls.length).toBeGreaterThan(0);
    for (const u of urls) expect(new URL(u).hostname).toMatch(/^(raw\.githubusercontent\.com|api\.osv\.dev)$/);
    expect(urls.join("\n")).not.toMatch(/commits|blame|\/git\//);
  });
});

describe("fail-safe error paths", () => {
  const LOCK = "https://raw.githubusercontent.com/e-1305/crypt-demo/HEAD/package-lock.json";

  it("rejects a URL that is not a GitHub repository without any request", async () => {
    const { f, urls } = serve(VULN);
    for (const bad of ["", "not a url", "http://github.com/a/b", "https://evil.example/a/b", "https://github.com/a"]) {
      expect(await code(liveExhume(bad, opts(f)))).toBe("bad-url");
    }
    expect(urls).toEqual([]);
  });

  it("404 everywhere is not-found", async () => {
    expect(await code(liveExhume(REPO_URL, opts(serve(null).f)))).toBe("not-found");
  });

  it("a repository with other manifests is no-npm-lockfile", async () => {
    const { f } = serve(null, { "https://raw.githubusercontent.com/e-1305/crypt-demo/HEAD/requirements.txt": { status: 200, body: "flask==2.0.0\n" } });
    const err = await liveExhume(REPO_URL, opts(f)).catch((e: unknown) => e);
    expect((err as LiveExhumeError).code).toBe("no-npm-lockfile");
    expect((err as Error).message).toMatch(/npm projects only/);
  });

  it("403 and 429 are rate-limited and stop at once", async () => {
    for (const status of [403, 429]) {
      const { f, urls } = serve(null, { [LOCK]: { status } });
      expect(await code(liveExhume(REPO_URL, opts(f)))).toBe("rate-limited");
      expect(urls).toEqual([LOCK]);
    }
  });

  it("a server error and a thrown fetch are network errors", async () => {
    expect(await code(liveExhume(REPO_URL, opts(serve(null, { [LOCK]: { status: 500 } }).f)))).toBe("network");
    const boom: FetchLike = async () => {
      throw new Error("offline");
    };
    expect(await code(liveExhume(REPO_URL, opts(boom)))).toBe("network");
  });

  it("malformed lockfile JSON", async () => {
    const { f } = serve(null, { [LOCK]: { status: 200, body: "{ nope" } });
    expect(await code(liveExhume(REPO_URL, opts(f)))).toBe("malformed-lockfile");
  });

  it("lockfile v1 or without packages is unsupported-lockfile", async () => {
    for (const body of [JSON.stringify({ lockfileVersion: 1, dependencies: {} }), JSON.stringify({ lockfileVersion: 3 })]) {
      const { f } = serve(null, { [LOCK]: { status: 200, body } });
      expect(await code(liveExhume(REPO_URL, opts(f)))).toBe("unsupported-lockfile");
    }
  });

  it("an OSV outage is osv-unavailable and no limb is Healthy", async () => {
    const { f } = serve(VULN);
    const o = { fetch: f, feeds: snapshot() };
    // The default lookup hits api.osv.dev, which the stub answers 404 for batch queries: every limb stays unknown.
    const err = await liveExhume(REPO_URL, o).catch((e: unknown) => e);
    expect((err as LiveExhumeError).code).toBe("osv-unavailable");
  });

  it("a partial OSV answer keeps unanswered limbs Rotting and unknown", async () => {
    const full = await cliCreature(VULN, "x");
    const first = full.limbs[0]!;
    const partial: OsvLookup = async (limbs) => {
      const out = new Map();
      for (const l of limbs) if (l.name === first.name && l.version === first.version) out.set(`${l.ecosystem}:${l.name}@${l.version}`, []);
      return out;
    };
    const live = await liveExhume(REPO_URL, { fetch: serve(VULN).f, feeds: snapshot(), osv: partial });
    const unknown = live.limbs.filter((l) => l.unknown);
    expect(unknown.length).toBeGreaterThan(0);
    for (const l of unknown) expect(l.state).not.toBe("Healthy");
    expect(live.notes.join(" ")).toMatch(/never Healthy/);
  });

  it("a missing feed snapshot stops the run before any request", async () => {
    const { f, urls } = serve(VULN);
    for (const feeds of [null, undefined]) expect(await code(liveExhume(REPO_URL, { fetch: f, feeds }))).toBe("feed-missing");
    expect(urls).toEqual([]);
  });

  it("an invalid snapshot does not parse", () => {
    for (const t of ["", "{}", "[]", JSON.stringify({ schemaVersion: 1, kev: { date: "d", cves: [1] }, epss: { date: "d", scores: {} } }), JSON.stringify({ schemaVersion: 1, kev: { date: "d", cves: [] }, epss: { date: "d", scores: { "CVE-1": 7 } } })]) {
      expect(parseFeedSnapshot(t)).toBeNull();
    }
  });

  it("property: any failing status gives an error, never a result", () =>
    fc.assert(
      fc.asyncProperty(fc.constantFrom(401, 403, 429, 451, 500, 502, 503), async (status) => {
        const { f } = serve(null, { [LOCK]: { status } });
        const c = await code(liveExhume(REPO_URL, opts(f)));
        expect(["rate-limited", "network"]).toContain(c);
      }),
      { numRuns: numRuns(25) },
    ));
});

describe("dry-run payloads", () => {
  it("builds the Necromancer payload for spawned limbs, labelled as a dry run", async () => {
    const live = await liveExhume(REPO_URL, opts(serve(VULN).f));
    const ready = live.payloads.filter((p) => p.status === "ready");
    expect(ready.length).toBeGreaterThan(0);
    for (const p of ready) {
      if (p.status !== "ready") continue;
      expect(p.dryRun).toBe(true);
      expect(p.sent).toBe(false);
      expect(p.label).toBe("dry run: run `npx @e-1305/crypt raid e-1305/crypt-demo --live` to open it for real");
      expect(p.title).toBe(`fix: graft ${p.name} ${p.from} to ${p.to} (${p.limb})`);
      expect(p.branch).toBe(`crypt/graft-${p.limb.toLowerCase()}-${p.to}`);
      expect(p.body).toContain(`Version: ${p.from} -> ${p.to}`);
      expect(p.body).toContain("Owner: @crypt-fixture/supply-chain");
      expect(p.body).toContain("A human lands this PR after CI is green.");
      expect(p.files).toEqual(["package.json", "package-lock.json"]);
    }
  });

  it("is deterministic", async () => {
    const a = await liveExhume(REPO_URL, opts(serve(VULN).f));
    const b = await liveExhume(REPO_URL, opts(serve(VULN).f));
    expect(a.payloads).toEqual(b.payloads);
  });

  it("matches the chosen version of the fixture advisories for the demo crypt", async () => {
    const live = await liveExhume(REPO_URL, opts(serve(DEMO).f));
    const ids = live.payloads.map((p) => p.limb);
    expect(ids).toContain("JQUERY");
    expect(ids).toContain("LODASH");
  });

  it("opens at most 5 payloads", async () => {
    const n = 8;
    const packages: Record<string, unknown> = { "": { dependencies: {} } };
    const deps: Record<string, string> = {};
    for (let i = 0; i < n; i++) {
      deps[`pkg${String.fromCharCode(97 + i)}`] = "1.0.0";
      packages[`node_modules/pkg${String.fromCharCode(97 + i)}`] = { version: "1.0.0" };
    }
    (packages[""] as { dependencies: unknown }).dependencies = deps;
    const lock = JSON.stringify({ lockfileVersion: 3, packages });
    const kev = { date: "2026-11-13T00:00:00Z", cves: new Set(["CVE-2099-0001"]) };
    const feeds = { kev, epss: { date: "2026-11-16T00:00:00Z", scores: new Map<string, number>() } };
    const lookup: OsvLookup = async (limbs) => new Map(limbs.map((l) => [`npm:${l.name}@${l.version}`, [{ id: "CVE-2099-0001", aliases: [], severity: "HIGH" }]]));
    const live = await liveExhume(REPO_URL, {
      fetch: serve(null, { "https://raw.githubusercontent.com/e-1305/crypt-demo/HEAD/package-lock.json": { status: 200, body: lock } }).f,
      feeds,
      osv: lookup,
    });
    expect(live.limbs.filter((l) => l.spawned)).toHaveLength(n);
    expect(live.payloads.length).toBe(MAX_PAYLOADS);
    expect(live.payloadsOmitted).toBe(n - MAX_PAYLOADS);
    // The advisory is not served, so no version is invented.
    for (const p of live.payloads) expect(p.status).toBe("no-fix");
  });

  it("never carries commit author data", async () => {
    const live = await liveExhume(REPO_URL, opts(serve(DEMO).f));
    const text = JSON.stringify(live);
    expect(text).not.toMatch(/author|committer|co-authored-by|signed-off-by|\bblame\b/i);
    expect(text).not.toMatch(/[\w.+-]+@[A-Za-z-]+\.[A-Za-z]{2,}/); // no e-mail address
  });
});

describe("feed snapshot", () => {
  it("round-trips the fixture feeds and keeps the date", () => {
    const kev = parseKev(readFileSync(join(FEEDS, "kev.json"), "utf8"))!;
    const epss = parseEpss(readFileSync(join(FEEDS, "epss.csv"), "utf8"))!;
    const back = parseFeedSnapshot(serializeFeedSnapshot(kev, epss, 0))!;
    expect(back.kev).toEqual(kev);
    expect(back.epss).toEqual(epss);
  });

  it("drops only scores below the minimum and is stable", () => {
    const kev = { date: "d", cves: new Set(["CVE-2-1", "CVE-1-1"]) };
    const epss = { date: "e", scores: new Map([["CVE-1-1", 0.5], ["CVE-3-1", 0.005]]) };
    const text = serializeFeedSnapshot(kev, epss);
    expect(text).toBe(serializeFeedSnapshot(kev, epss));
    const back = parseFeedSnapshot(text)!;
    expect([...back.epss.scores.keys()]).toEqual(["CVE-1-1"]);
    expect([...back.kev.cves].sort()).toEqual(["CVE-1-1", "CVE-2-1"]);
  });
});

describe("browser safety", () => {
  /** Follows relative imports from the live exhume entry point. */
  function graph(entry: string, seen = new Set<string>()): Set<string> {
    if (seen.has(entry)) return seen;
    seen.add(entry);
    const text = readFileSync(entry, "utf8");
    for (const m of text.matchAll(/(?:from|import)\s*\(?\s*"(\.[^"]+)"/g)) {
      graph(resolve(dirname(entry), m[1]!.replace(/\.js$/, ".ts")), seen);
    }
    return seen;
  }

  it("the module graph has no node: imports or node globals", () => {
    const files = [...graph(resolve("src/web/live-exhume.ts")), ...graph(resolve("src/web/feed-snapshot.ts"))];
    expect(files.length).toBeGreaterThan(8);
    for (const file of files) {
      const text = readFileSync(file, "utf8");
      expect(text, file).not.toMatch(/from\s+"node:|require\(|\bprocess\./);
    }
  });

  it("only exhume, necromancer and common modules without node: are pulled in", () => {
    for (const file of graph(resolve("src/web/live-exhume.ts"))) expect(file).not.toMatch(/src\/(github|registry|mcp|cli)\//);
  });
});

describe("compiled web output", () => {
  it("web/js has no node: import when built", () => {
    const dir = "web/js";
    if (!existsSync(dir)) return;
    const walk = (d: string): string[] =>
      readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(d, e.name)) : e.name.endsWith(".js") ? [join(d, e.name)] : []));
    for (const f of walk(dir)) expect(readFileSync(f, "utf8"), f).not.toMatch(/from\s+"node:/);
  });
});

it("CODEOWNERS locations are the CLI ones", () => {
  expect(CODEOWNERS_LOCATIONS).toEqual([".github/CODEOWNERS", "CODEOWNERS", "docs/CODEOWNERS"]);
});

describe("FIX-13 size caps", () => {
  const big = (n: number) => "x".repeat(n);
  it("rejects a lockfile above the character cap, with nothing drawn", async () => {
    const { f } = serve(null, { [`https://raw.githubusercontent.com/e-1305/crypt-demo/HEAD/package-lock.json`]: { status: 200, body: big(MAX_RAW_CHARS + 1) } });
    expect(await code(liveExhume(REPO_URL, opts(f)))).toBe("too-large");
  });
  it("rejects on Content-Length before reading the body", async () => {
    let read = false;
    const f: FetchLike = async () => ({ ok: true, status: 200, headers: { get: () => String(MAX_RAW_CHARS + 1) }, text: async () => ((read = true), ""), json: async () => null });
    expect(await code(liveExhume(REPO_URL, opts(f)))).toBe("too-large");
    expect(read).toBe(false);
  });
  it("rejects a lockfile with more than the package cap", () => {
    const packages: Record<string, unknown> = { "": {} };
    for (let i = 0; i <= MAX_LOCKFILE_PACKAGES; i++) packages[`node_modules/p${i}`] = { version: "1.0.0" };
    expect(() => parsePackageLock(JSON.stringify({ lockfileVersion: 3, packages }), "package-lock.json")).toThrow(LockfileError);
  });
  it("keeps the repo readable when CODEOWNERS is too large, owners unknown", async () => {
    const { f } = serve(DEMO, { [`https://raw.githubusercontent.com/e-1305/crypt-demo/HEAD/${CODEOWNERS_LOCATIONS[0]}`]: { status: 200, body: big(MAX_CODEOWNERS_CHARS + 1) } });
    const r = await liveExhume(REPO_URL, opts(f));
    expect(r.notes.join(" ")).toContain("CODEOWNERS could not be read");
  });
});
