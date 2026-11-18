import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import fc from "fast-check";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CliError } from "../src/cli/exit.js";
import { nodeIo, type Io } from "../src/common/io.js";
import { bumpLockfile } from "../src/necromancer/lockfile.js";
import { graft } from "../src/necromancer/index.js";
import { sabotageSmokeTest } from "../src/necromancer/sabotage.js";
import type { RegistryVersion } from "../src/registry/types.js";
import { apiAuditHook } from "../scripts/live-audit.js";
import { githubClient } from "../scripts/github-client.js";
import { livePreflight } from "../scripts/live-preflight.js";
import { npmRegistryClient } from "../scripts/registry-client.js";
import { makeAgentEnv } from "./agent-helpers.js";
import { REPO, TOKEN, demoFile, makeWorld, registryFixture, type WorldOpts } from "./live-helpers.js";

const LODASH = [{ name: "lodash", version: "4.17.15", fixed: "4.17.21" }];
const meta = (name: string, version: string): RegistryVersion => {
  const j = registryFixture(name, version);
  return { version, resolved: j.dist.tarball, integrity: j.dist.integrity, dependencies: j.dependencies, optionalDependencies: j.optionalDependencies, peerDependencies: j.peerDependencies };
};

/** A live Necromancer context wired to the fake GitHub and the fake registry. */
function liveEnv(w: ReturnType<typeof makeWorld>, o: { io?: Io; sabotage?: boolean; limbs?: Parameters<typeof makeAgentEnv>[0] } = {}) {
  const io = o.io ?? nodeIo;
  const env = makeAgentEnv(o.limbs ?? LODASH, io);
  const audit = apiAuditHook(io, env.paths.auditPath, env.now);
  const client = githubClient({ repo: REPO, token: TOKEN, fetch: w.github, audit });
  const registry = npmRegistryClient({ fetch: w.registry, audit, secrets: [TOKEN] });
  const ctx = { ...env.ctxFor(client), client, registry, sabotage: o.sabotage };
  return { env, ctx, client, registry, request: () => env.request(env.idOf("lodash")) };
}

/** Every file under out/ with its content, for before/after comparison. */
function snapshot(dir: string): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (d: string) => {
    for (const f of readdirSync(d)) {
      const p = join(d, f);
      if (statSync(p).isDirectory()) walk(p);
      else out[p] = readFileSync(p, "utf8");
    }
  };
  try {
    walk(dir);
  } catch {
    /* absent */
  }
  return out;
}

afterEach(() => vi.restoreAllMocks());

describe("bumpLockfile", () => {
  const pkg = demoFile("package.json");
  const lock = demoFile("package-lock.json");
  const input = { pkgText: pkg, lockText: lock, name: "lodash", from: "4.17.15", meta: meta("lodash", "4.17.21"), fixed: "4.17.21" };

  it("adds resolved and integrity for the demo lockfile and changes nothing else", () => {
    const r = bumpLockfile(input);
    if (!r.ok) throw new Error(r.reason);
    const expectedLock = JSON.parse(lock);
    expectedLock.packages["node_modules/lodash"] = { version: "4.17.21", resolved: input.meta.resolved, integrity: input.meta.integrity };
    expectedLock.packages[""].dependencies.lodash = "4.17.21";
    expect(r.lock).toBe(JSON.stringify(expectedLock, null, 2) + "\n");
    expect(JSON.parse(r.lock).packages["node_modules/lodash"].integrity).toBe(registryFixture("lodash", "4.17.21").dist.integrity);
    expect(r.pkg).toBe(pkg.replace('"lodash": "4.17.15"', '"lodash": "4.17.21"'));
    // The root range sits inside packages[""]: it is the only other lock change.
    expect(JSON.parse(r.lock).packages[""].dependencies.lodash).toBe("4.17.21");
  });

  it("keeps ^ and ~ ranges, other fields and key order", () => {
    const l = { lockfileVersion: 3, packages: { "": { dependencies: { lodash: "^4.17.15" } }, "node_modules/lodash": { version: "4.17.15", dev: true, engines: { node: ">=4" } } } };
    const p = { dependencies: { lodash: "~4.17.15" } };
    const r = bumpLockfile({ ...input, pkgText: JSON.stringify(p), lockText: JSON.stringify(l) });
    if (!r.ok) throw new Error(r.reason);
    expect(JSON.parse(r.pkg).dependencies.lodash).toBe("~4.17.21");
    const lk = JSON.parse(r.lock);
    expect(lk.packages[""].dependencies.lodash).toBe("^4.17.21");
    expect(Object.keys(lk.packages["node_modules/lodash"])).toEqual(["version", "resolved", "integrity", "dev", "engines"]);
  });

  it("updates the legacy dependencies block of lockfileVersion 2", () => {
    const l = JSON.parse(lock);
    l.lockfileVersion = 2;
    l.dependencies = { lodash: { version: "4.17.15" }, jquery: { version: "3.4.1" } };
    const r = bumpLockfile({ ...input, lockText: JSON.stringify(l, null, 2) });
    if (!r.ok) throw new Error(r.reason);
    const lk = JSON.parse(r.lock);
    expect(lk.dependencies.lodash).toEqual({ version: "4.17.21", resolved: input.meta.resolved, integrity: input.meta.integrity });
    expect(lk.dependencies.jquery).toEqual({ version: "3.4.1" });
  });

  it("aborts with a reason for every unsafe case", () => {
    const l = JSON.parse(lock);
    const abort = (over: Partial<typeof input>, lockObj: unknown = l) => {
      const r = bumpLockfile({ ...input, lockText: JSON.stringify(lockObj), ...over });
      return r.ok ? "ok" : r.reason;
    };
    expect(abort({}, { ...l, lockfileVersion: 1 })).toBe("lockfile-version");
    expect(abort({}, { ...l, packages: undefined })).toBe("lockfile-version");
    const dup = { ...l, packages: { ...l.packages, "node_modules/a/node_modules/lodash": { version: "4.17.15" } } };
    expect(abort({}, dup)).toBe("lock-entry-count");
    expect(abort({ from: "4.17.14" })).toBe("lock-entry-count");
    expect(abort({ meta: { ...input.meta, integrity: "" } })).toBe("integrity-invalid");
    expect(abort({ meta: { ...input.meta, integrity: "sha1-abc" } })).toBe("integrity-invalid");
    expect(abort({ meta: { ...input.meta, dependencies: { x: "1" } } })).toBe("dependencies-changed");
    expect(abort({ meta: { ...input.meta, peerDependencies: { x: "1" } } })).toBe("dependencies-changed");
    expect(abort({ meta: meta("lodash", "4.17.21"), fixed: "4.18.0" })).toBe("version-below-fixed");
    expect(abort({ name: "left-pad" })).toBe("not-direct-dependency");
    expect(abort({ pkgText: "{" })).toBe("invalid-json");
  });

  it("property: exactly one node_modules entry changes; version >= fixed; integrity equals the registry fixture", () => {
    const names = fc.uniqueArray(fc.stringMatching(/^[a-z][a-z0-9-]{0,8}$/).filter((n) => n !== "lodash"), { minLength: 0, maxLength: 8 });
    const entry = fc.record({ version: fc.constantFrom("1.0.0", "2.3.4", "0.1.0"), resolved: fc.option(fc.constant("https://registry.npmjs.org/x.tgz"), { nil: undefined }), dev: fc.option(fc.constant(true), { nil: undefined }) });
    fc.assert(
      fc.property(names, fc.array(entry, { minLength: 8, maxLength: 8 }), fc.nat(8), fc.constantFrom("", "^", "~"), (ns, entries, at, prefix) => {
        const packages: Record<string, unknown> = { "": { name: "x", dependencies: { lodash: `${prefix}4.17.15` } } };
        const all = [...ns];
        all.splice(Math.min(at, all.length), 0, "lodash");
        all.forEach((n, i) => {
          packages[`node_modules/${n}`] = n === "lodash" ? { version: "4.17.15", dev: true } : JSON.parse(JSON.stringify(entries[i % entries.length]));
        });
        const lockObj = { name: "x", lockfileVersion: 3, packages };
        const m = meta("lodash", "4.17.21");
        const r = bumpLockfile({ pkgText: JSON.stringify({ dependencies: { lodash: `${prefix}4.17.15` } }, null, 2), lockText: JSON.stringify(lockObj, null, 2), name: "lodash", from: "4.17.15", meta: m, fixed: "4.17.21" });
        if (!r.ok) return false;
        const out = JSON.parse(r.lock).packages as Record<string, any>;
        if (JSON.stringify(Object.keys(out)) !== JSON.stringify(Object.keys(packages))) return false;
        const changed = Object.keys(packages).filter((k) => k.startsWith("node_modules/") && JSON.stringify(out[k]) !== JSON.stringify(packages[k]));
        const target = out["node_modules/lodash"];
        const [maj, min, pat] = target.version.split(".").map(Number);
        return (
          changed.length === 1 &&
          changed[0] === "node_modules/lodash" &&
          maj! * 1e6 + min! * 1e3 + pat! >= 4017021 &&
          target.integrity === registryFixture("lodash", "4.17.21").dist.integrity &&
          target.dev === true &&
          JSON.stringify(out[""]) === JSON.stringify({ name: "x", dependencies: { lodash: `${prefix}4.17.21` } })
        );
      }),
      { numRuns: 100 },
    );
  });
});

describe("sabotage change", () => {
  it("appends a labelled failing test and keeps the original text", () => {
    const base = demoFile("smoke.test.js");
    const out = sabotageSmokeTest(base);
    expect(out.startsWith(base)).toBe(true);
    expect(out).toContain("CRYPT DEMO SABOTAGE");
    expect(out).toContain("assert.fail(");
    expect(out.endsWith("\n")).toBe(true);
  });
});

describe("registry client", () => {
  it("reads dist metadata and audits the request", async () => {
    const w = makeWorld();
    const lines: string[] = [];
    const c = npmRegistryClient({ fetch: w.registry, audit: (l) => lines.push(`${l.method} ${l.path}`) });
    expect(await c.getVersion("lodash", "4.17.21")).toEqual(meta("lodash", "4.17.21"));
    expect(lines).toEqual(["GET /lodash/4.17.21"]);
  });
  it("refuses missing integrity, foreign tarball hosts, bad names and wrong answers", async () => {
    const answer = (j: unknown) => npmRegistryClient({ fetch: async () => ({ ok: true, status: 200, json: async () => j }) });
    const good = registryFixture("lodash", "4.17.21");
    await expect(answer({ ...good, dist: { tarball: good.dist.tarball, shasum: "abc" } }).getVersion("lodash", "4.17.21")).rejects.toThrow(/integrity/);
    await expect(answer({ ...good, dist: { ...good.dist, tarball: "https://evil.example/x.tgz" } }).getVersion("lodash", "4.17.21")).rejects.toThrow(/registry host/);
    await expect(answer({ ...good, dist: { ...good.dist, tarball: "http://registry.npmjs.org/x.tgz" } }).getVersion("lodash", "4.17.21")).rejects.toThrow(/https/);
    await expect(answer({ ...good, version: "9.9.9" }).getVersion("lodash", "4.17.21")).rejects.toThrow(/different/);
    await expect(answer(good).getVersion("../etc", "4.17.21")).rejects.toThrow(/invalid/);
  });
  it("encodes scoped names", async () => {
    const seen: string[] = [];
    const c = npmRegistryClient({ fetch: async (u) => (seen.push(u), { ok: false, status: 404, json: async () => ({}) }) });
    await expect(c.getVersion("@scope/pkg", "1.0.0")).rejects.toThrow();
    expect(seen).toEqual(["https://registry.npmjs.org/@scope%2Fpkg/1.0.0"]);
  });
});

describe("github adapter on the Git Data API", () => {
  const req = { branch: "crypt/graft-a-1.0.1", message: "m", files: [{ path: "package.json", content: "{}" }] };
  const client = (w: ReturnType<typeof makeWorld>, audit?: (l: { method: string; path: string }) => void) => githubClient({ repo: REPO, token: TOKEN, fetch: w.github, audit });

  it("creates one commit and one ref, pins the base once and never asks for the base twice", async () => {
    const w = makeWorld();
    const c = client(w);
    expect(await c.readBaseFile("package.json")).toBe(demoFile("package.json"));
    await c.createBranchWithFiles(req);
    const paths = w.requests.map((r) => `${r.method} ${r.path}`);
    expect(paths.filter((p) => p === `GET /repos/${REPO}/git/ref/heads/main`)).toHaveLength(1);
    expect(w.commits.size).toBe(1);
    expect([...w.commits.values()][0]!.parents).toEqual([w.baseCommit]);
    expect(w.cryptRefs()).toEqual(["refs/heads/crypt/graft-a-1.0.1"]);
  });
  it("resets a leftover crypt/ branch instead of failing on 422", async () => {
    const w = makeWorld({ refExists: ["crypt/graft-a-1.0.1"] });
    await client(w).createBranchWithFiles(req);
    expect(w.requests.some((r) => r.method === "PATCH" && r.path.endsWith("/git/refs/heads/crypt/graft-a-1.0.1"))).toBe(true);
    expect(w.filesAt("refs/heads/crypt/graft-a-1.0.1")).toEqual({ "package.json": "{}" });
  });
  it("refuses to write or delete outside crypt/", async () => {
    const w = makeWorld();
    const c = client(w);
    await expect(c.createBranchWithFiles({ ...req, branch: "main" })).rejects.toThrow(/crypt/);
    await expect(c.deleteBranch!("main")).rejects.toThrow(/crypt/);
    expect(w.requests).toEqual([]);
  });
  it("sends nothing when the audit hook throws", async () => {
    const w = makeWorld();
    const c = client(w, () => {
      throw new Error("disk full");
    });
    await expect(c.readBaseFile("package.json")).rejects.toThrow(/disk full/);
    expect(w.requests).toEqual([]);
  });
  it("refuses files over 1 MB", async () => {
    const w = makeWorld({ baseFiles: { big: "x".repeat(1024 * 1024 + 1) } });
    await expect(client(w).readBaseFile("big")).rejects.toThrow(/1 MB/);
  });
  it("redacts the token from thrown errors", async () => {
    const w = makeWorld({ failAt: 1, failMode: "throw" });
    const err = await client(w).readBaseFile("package.json").catch((e: Error) => e);
    expect((err as Error).message).not.toContain("SENTINEL");
    expect((err as Error).message).toContain("[redacted]");
  });
});

describe("full live graft against the fake GitHub", () => {
  it("opens one PR from one commit with two files and a head SHA", async () => {
    const w = makeWorld();
    const { env, ctx, request } = liveEnv(w);
    const r = await graft(ctx, request());
    expect(r).toMatchObject({ outcome: "PR_OPENED", branch: "crypt/graft-" + env.idOf("lodash").toLowerCase() + "-4.17.21" });
    expect(w.commits.size).toBe(1);
    expect(w.cryptRefs()).toHaveLength(1);
    expect(w.prs).toHaveLength(1);
    const files = w.filesAt(w.cryptRefs()[0]!);
    expect(Object.keys(files).sort()).toEqual(["package-lock.json", "package.json"]);
    expect(JSON.parse(files["package-lock.json"]!).packages["node_modules/lodash"]).toEqual({
      version: "4.17.21",
      resolved: registryFixture("lodash", "4.17.21").dist.tarball,
      integrity: registryFixture("lodash", "4.17.21").dist.integrity,
    });
    const rec = env.payload(env.payloads()[0]!);
    expect(rec).toMatchObject({ number: 1, headSha: w.prs[0]!.sha, sabotage: false });
    expect(rec.headSha).toMatch(/^[0-9a-f]{40}$/);
    expect(w.prs[0]!.body).toContain("npm registry metadata");
    expect(w.outside).toEqual([]);
    for (const q of w.requests) {
      expect(`${q.method} ${q.path}`).not.toMatch(/merge/i);
      expect(q.method === "PUT" && /\/pulls/.test(q.path)).toBe(false);
    }
    env.cleanup();
  });

  it("sabotage adds a third file, a -sabotage branch and a labelled PR", async () => {
    const w = makeWorld();
    const { env, ctx, request } = liveEnv(w, { sabotage: true });
    const r = await graft(ctx, request());
    expect(r.outcome).toBe("PR_OPENED");
    expect(r.branch).toMatch(/-4\.17\.21-sabotage$/);
    const files = w.filesAt(w.cryptRefs()[0]!);
    expect(Object.keys(files).sort()).toEqual(["package-lock.json", "package.json", "test/smoke.test.js"]);
    expect(files["test/smoke.test.js"]).toContain("CRYPT DEMO SABOTAGE");
    expect(w.prs[0]!.title.startsWith("[DEMO SABOTAGE] ")).toBe(true);
    expect(w.prs[0]!.body).toContain("DEMO SABOTAGE: this PR is deliberately broken");
    expect(env.payload(env.payloads()[0]!).sabotage).toBe(true);
    env.cleanup();
  });

  it("sabotage with a missing smoke test aborts before any write", async () => {
    const w = makeWorld({ baseFiles: { "package.json": demoFile("package.json"), "package-lock.json": demoFile("package-lock.json") } });
    const { env, ctx, request } = liveEnv(w, { sabotage: true });
    expect((await graft(ctx, request())).outcome).toBe("ERROR");
    expect(w.requests.some((q) => q.method !== "GET")).toBe(false);
    expect(env.payloads()).toEqual([]);
    env.cleanup();
  });

  it("aborts when the new version would change the dependency tree", async () => {
    const w = makeWorld();
    const { env, ctx, request } = liveEnv(w, { limbs: [{ name: "node-fetch", version: "2.6.0", fixed: "2.6.7" }] });
    const lock = JSON.parse(demoFile("package-lock.json"));
    expect(lock.packages["node_modules/node-fetch"]).toBeDefined();
    const id = env.idOf("node-fetch");
    expect((await graft(ctx, env.request(id))).outcome).toBe("ERROR");
    expect(w.requests.some((q) => q.method !== "GET")).toBe(false);
    env.cleanup();
    void request;
  });

  it("a live client without a registry fails before any GitHub request", async () => {
    const w = makeWorld();
    const { env, ctx, request } = liveEnv(w);
    expect((await graft({ ...ctx, registry: undefined }, request())).outcome).toBe("ERROR");
    expect(w.requests).toEqual([]);
    env.cleanup();
  });

  it("sealed: zero requests of any kind", async () => {
    const w = makeWorld();
    const { env, ctx, request } = liveEnv(w);
    env.seal();
    expect((await graft(ctx, request())).outcome).toBe("REJECTED_SEALED");
    expect(w.requests).toEqual([]);
    env.cleanup();
  });

  it("deletes the branch it created when the PR call fails", async () => {
    const w = makeWorld({ failPath: /^POST \/repos\/o\/r\/pulls$/ });
    const { env, ctx, request } = liveEnv(w);
    expect((await graft(ctx, request())).outcome).toBe("ERROR");
    expect(w.cryptRefs()).toEqual([]);
    expect(w.requests.some((q) => q.method === "DELETE")).toBe(true);
    env.cleanup();
  });
});

describe("failure injection", () => {
  async function total(): Promise<number> {
    const w = makeWorld();
    const { env, ctx, request } = liveEnv(w);
    expect((await graft(ctx, request())).outcome).toBe("PR_OPENED");
    env.cleanup();
    return w.requests.length;
  }

  it("property: failing any single request gives ERROR, no PR record, unchanged out/ and no orphan crypt/ ref", async () => {
    const n = await total();
    expect(n).toBeGreaterThan(8);
    for (const mode of ["status", "throw"] as const) {
      for (let k = 1; k <= n; k++) {
        const w = makeWorld({ failAt: k, failMode: mode });
        const { env, ctx, request } = liveEnv(w);
        const req = request();
        const before = snapshot(join(env.dir, "out"));
        const r = await graft(ctx, req);
        const where = `${mode} at ${k}: ${w.requests[k - 1]?.method} ${w.requests[k - 1]?.path}`;
        expect(r.outcome, where).toBe("ERROR");
        expect(snapshot(join(env.dir, "out")), where).toEqual(before);
        expect(env.stateText(), where).toBeNull();
        expect(w.prs.length === 0 || w.requests.length >= k, where).toBe(true);
        expect(w.cryptRefs(), where).toEqual([]);
        env.cleanup();
      }
    }
  });

  it("property: a random single failure never leaks a merge-like request", async () => {
    const n = await total();
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 1, max: n }), fc.constantFrom("status", "throw"), async (k, mode) => {
        const w = makeWorld({ failAt: k, failMode: mode });
        const { env, ctx, request } = liveEnv(w);
        await graft(ctx, request());
        env.cleanup();
        return w.requests.every((q) => !/merge/i.test(q.path) && !(q.method === "PUT" && /\/pulls/.test(q.path)));
      }),
      { numRuns: 20 },
    );
  });
});

describe("audit of live API calls", () => {
  it("writes exactly one API_CALL line per request, in order, with method and path only", async () => {
    const w = makeWorld();
    const { env, ctx, request } = liveEnv(w);
    await graft(ctx, request());
    const lines = env.audit().filter((l) => l.split("\t")[3] === "API_CALL");
    expect(lines.map((l) => l.split("\t")[4])).toEqual(w.requests.map((q) => `${q.method} ${q.path}`));
    expect(lines.every((l) => l.split("\t")[1] === "live-api")).toBe(true);
    expect(env.audit().some((l) => l.includes("PR_OPENED"))).toBe(true);
    env.cleanup();
  });

  it("does not send a request when the audit write fails", async () => {
    const w = makeWorld();
    const io: Io = { ...nodeIo, appendLine: (p, l) => (l.includes("API_CALL") ? (() => { throw new Error("EIO"); })() : nodeIo.appendLine(p, l)) };
    const { env, ctx, request } = liveEnv(w, { io });
    expect((await graft(ctx, request())).outcome).toBe("ERROR");
    expect(w.requests).toEqual([]);
    env.cleanup();
  });
});

describe("token secrecy", () => {
  it("never appears in output, audit log, out/ files or error text, for every injected failure", async () => {
    const out: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation(((s: unknown) => (out.push(String(s)), true)) as never);
    vi.spyOn(process.stderr, "write").mockImplementation(((s: unknown) => (out.push(String(s)), true)) as never);
    const probe = makeWorld();
    const p = liveEnv(probe);
    await graft(p.ctx, p.request());
    p.env.cleanup();
    const n = probe.requests.length;
    for (let k = 0; k <= n; k++) {
      for (const mode of ["status", "throw"] as const) {
        const w = makeWorld({ failAt: k || undefined, failMode: mode });
        const { env, ctx, request } = liveEnv(w);
        await graft(ctx, request());
        const files = [...Object.values(snapshot(join(env.dir, "out"))), ...env.audit()];
        expect(files.join("\n")).not.toContain("SENTINEL1234567890");
        env.cleanup();
      }
    }
    expect(out.join("")).not.toContain("SENTINEL1234567890");
    if (n > 0) expect(out.join("")).toContain("necromancer:"); // the error path was exercised and printed
  });
});

describe("live preflight", () => {
  const run = (o: Partial<Parameters<typeof livePreflight>[0]> & WorldOpts, token = TOKEN) => {
    const w = makeWorld(o);
    const warnings: string[] = [];
    const p = livePreflight({ repo: REPO, token, fetch: w.github, warn: (m) => warnings.push(m), ...o });
    return { w, warnings, p };
  };
  it("passes for a token limited to the target", async () => {
    const { p, warnings } = run({});
    await expect(p).resolves.toBeUndefined();
    expect(warnings).toEqual([]);
  });
  it("refuses a missing token, classic tokens and no requests are sent", async () => {
    for (const t of ["", "ghp_abcdef", "gho_abcdef"]) {
      const { p, w } = run({}, t);
      await expect(p).rejects.toBeInstanceOf(CliError);
      expect(w.requests).toEqual([]);
    }
  });
  it("refuses a token that can see another private repository", async () => {
    await expect(run({ userRepos: [REPO, "o/other"] }).p).rejects.toThrow(/1 other private repository/);
  });

  it("accepts public repositories in the listing (every token reads public repos) and warns", async () => {
    const { p, warnings } = run({ publicRepos: ["o/pub1", "o/pub2"] });
    await expect(p).resolves.toBeUndefined();
    expect(warnings.join("\n")).toMatch(/2 public repositories/);
  });
  it("warns once and continues when the listing is unavailable", async () => {
    for (const status of [403, 404]) {
      const { p, warnings } = run({ userReposStatus: status });
      await expect(p).resolves.toBeUndefined();
      expect(warnings).toHaveLength(1);
    }
  });
  it("refuses a token without push permission or without read access", async () => {
    await expect(run({ push: false }).p).rejects.toThrow(/cannot push/);
    await expect(run({ failAt: 1 }).p).rejects.toThrow(/not readable/);
  });
  it("never leaks the token", async () => {
    const err = await run({ failAt: 1, failMode: "throw" }).p.catch((e: Error) => e);
    expect((err as Error).message).not.toContain("SENTINEL");
  });
});

