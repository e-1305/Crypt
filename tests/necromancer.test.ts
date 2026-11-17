import { readFileSync } from "node:fs";
import { join } from "node:path";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { numRuns } from "./runs.js";
import { verify } from "../src/inquisitor/index.js";
import { MAX_PRS_PER_RAID, editManifests, graft } from "../src/necromancer/index.js";
import { chooseVersion, compareVersions, parseVersion, type Advisory, type RangeEvent } from "../src/necromancer/version.js";
import { dryRunClient } from "../src/github/client.js";
import { nodeIo } from "../src/common/io.js";
import { makeAgentEnv, mockClient } from "./agent-helpers.js";

describe("version choice", () => {
  const adv = (events: RangeEvent[], name = "p"): Advisory => ({
    id: "A",
    aliases: [],
    affected: [{ package: { ecosystem: "npm", name }, ranges: [{ type: "SEMVER", events }] }],
  });
  it("picks the smallest fixed version of the same major", () => {
    expect(chooseVersion("npm", "p", "3.4.1", [adv([{ introduced: "1.12.0" }, { fixed: "3.5.0" }])])).toEqual({ version: "3.5.0", breaking: false });
  });
  it("needs every vuln fixed", () => {
    const r = chooseVersion("npm", "p", "1.0.0", [adv([{ introduced: "0" }, { fixed: "1.2.0" }]), adv([{ introduced: "0" }, { fixed: "1.5.0" }])]);
    expect(r?.version).toBe("1.5.0");
  });
  it("marks a major bump as breaking when nothing in the same major works", () => {
    const r = chooseVersion("npm", "p", "1.4.0", [adv([{ introduced: "0" }, { fixed: "2.0.0" }])]);
    expect(r).toEqual({ version: "2.0.0", breaking: true });
  });
  it("prefers the same major over a smaller-looking higher candidate", () => {
    const r = chooseVersion("npm", "p", "1.0.0", [adv([{ introduced: "0" }, { fixed: "1.9.0" }, { introduced: "2.0.0" }, { fixed: "2.0.1" }])]);
    expect(r).toEqual({ version: "1.9.0", breaking: false });
  });
  it("uses the successor of last_affected", () => {
    expect(chooseVersion("npm", "p", "1.0.0", [adv([{ introduced: "0" }, { last_affected: "1.2.3" }])])?.version).toBe("1.2.4");
  });
  it("gives nothing when no fix exists, ranges are unclear or the package differs", () => {
    expect(chooseVersion("npm", "p", "1.0.0", [adv([{ introduced: "0" }])])).toBeNull();
    expect(chooseVersion("npm", "p", "1.0.0", [adv([{ introduced: "banana" }, { fixed: "2.0.0" }])])).toBeNull();
    expect(chooseVersion("npm", "p", "1.0.0", [adv([{ introduced: "0" }, { fixed: "2.0.0" }], "other")])).toBeNull();
    expect(chooseVersion("npm", "p", "nope", [adv([{ introduced: "0" }, { fixed: "2.0.0" }])])).toBeNull();
    expect(chooseVersion("npm", "p", "1.0.0", [])).toBeNull();
  });
  it("orders prereleases below releases", () => {
    expect(compareVersions(parseVersion("1.0.0-rc.1")!, parseVersion("1.0.0")!)).toBe(-1);
    expect(compareVersions(parseVersion("1.0.0-rc.2")!, parseVersion("1.0.0-rc.10")!)).toBe(-1);
  });

  // Property (e): >= current, outside every affected range, minimal among candidates, same major preferred.
  it("property: chosen version is above current, outside every range, and the minimum candidate", () => {
    const v = fc.tuple(fc.nat(3), fc.nat(3), fc.nat(3));
    const fmt = ([a, b, c]: number[]) => `${a}.${b}.${c}`;
    const key = ([a, b, c]: number[]) => a * 10000 + b * 100 + c;
    const interval = fc.record({ from: v, to: v, kind: fc.constantFrom("fixed", "last_affected", "open") });
    fc.assert(
      fc.property(v, fc.array(fc.array(interval, { minLength: 1, maxLength: 3 }), { minLength: 1, maxLength: 4 }), (cur, advs) => {
        const advisories = advs.map((ivs, i): Advisory => ({
          id: `A${i}`,
          aliases: [],
          affected: [{
            package: { ecosystem: "npm", name: "p" },
            ranges: ivs.map((iv) => {
              const [lo, hi] = key(iv.from) <= key(iv.to) ? [iv.from, iv.to] : [iv.to, iv.from];
              const events: RangeEvent[] = [{ introduced: fmt(lo) }];
              if (iv.kind === "fixed") events.push({ fixed: fmt(hi) });
              if (iv.kind === "last_affected") events.push({ last_affected: fmt(hi) });
              return { type: "SEMVER", events };
            }),
          }],
        }));
        const affected = (x: number[]) =>
          advs.some((ivs) =>
            ivs.some((iv) => {
              const [lo, hi] = key(iv.from) <= key(iv.to) ? [iv.from, iv.to] : [iv.to, iv.from];
              return key(x) >= key(lo) && (iv.kind === "open" ? true : iv.kind === "fixed" ? key(x) < key(hi) : key(x) <= key(hi));
            }),
          );
        const cands: number[][] = [];
        for (const ivs of advs)
          for (const iv of ivs) {
            const hi = key(iv.from) <= key(iv.to) ? iv.to : iv.from;
            if (iv.kind === "fixed") cands.push(hi);
            if (iv.kind === "last_affected") cands.push([hi[0]!, hi[1]!, hi[2]! + 1]);
          }
        const ok = cands.filter((c) => key(c) > key(cur) && !affected(c)).sort((a, b) => key(a) - key(b));
        const expected = ok.find((c) => c[0] === cur[0]) ?? ok[0];
        const got = chooseVersion("npm", "p", fmt(cur), advisories);
        if (!expected) return got === null;
        if (!got) return false;
        const g = parseVersion(got.version)!;
        const gk = [g.major, g.minor, g.patch];
        return (
          compareVersions(g, parseVersion(fmt(cur))!) >= 0 &&
          !affected(gk) &&
          got.version === fmt(expected) &&
          got.breaking === (g.major > cur[0]!)
        );
      }),
      { numRuns: numRuns(300) },
    );
  });
});

describe("manifest editing", () => {
  it("keeps range prefixes, clears resolved and integrity, touches only one package", () => {
    const pkg = JSON.stringify({ dependencies: { a: "^1.0.0", b: "2.0.0" } }, null, 2);
    const lock = JSON.stringify({ packages: { "": { dependencies: { a: "^1.0.0", b: "2.0.0" } }, "node_modules/a": { version: "1.0.0", resolved: "r", integrity: "i" }, "node_modules/b": { version: "2.0.0", resolved: "r", integrity: "i" } } }, null, 2);
    const r = editManifests(pkg, lock, "a", "1.2.0")!;
    expect(JSON.parse(r.pkg).dependencies).toEqual({ a: "^1.2.0", b: "2.0.0" });
    const l = JSON.parse(r.lock);
    expect(l.packages["node_modules/a"]).toEqual({ version: "1.2.0" });
    expect(l.packages["node_modules/b"]).toEqual({ version: "2.0.0", resolved: "r", integrity: "i" });
  });
  it("returns null when the package is not a direct dependency or not in the lockfile", () => {
    expect(editManifests('{"dependencies":{}}', '{"packages":{}}', "a", "1.0.1")).toBeNull();
    expect(editManifests('{"dependencies":{"a":"1.0.0"}}', '{"packages":{}}', "a", "1.0.1")).toBeNull();
  });
});

describe("necromancer graft", () => {
  it("opens one PR with all required fields and no author", async () => {
    const env = makeAgentEnv();
    const { client, calls } = mockClient();
    const r = await graft(env.ctxFor(client), env.request(env.idOf("alpha")));
    expect(r).toMatchObject({ outcome: "PR_OPENED", branch: "crypt/graft-alpha-1.0.1", breaking: false });
    expect(calls).toEqual(["createBranchWithFiles", "openPullRequest"]);
    expect(env.outcomes()).toEqual(["PR_OPENED"]);
    env.cleanup();
  });
  it("dry run writes the payload and calls nothing", async () => {
    const env = makeAgentEnv();
    const ctx = env.ctxFor(dryRunClient(nodeIo, env.paths.prsDir, env.now));
    const r = await graft(ctx, env.request(env.idOf("alpha")));
    expect(r.outcome).toBe("PR_OPENED");
    expect(env.payloads()).toEqual(["crypt-graft-alpha-1.0.1.json"]);
    const p = env.payload(env.payloads()[0]!);
    expect(p).toMatchObject({ dryRun: true, limb: env.idOf("alpha"), from: "1.0.0", to: "1.0.1", breaking: false });
    for (const need of ["Limb:", "CVE-2020-1000", "KEV: yes", "EPSS: 0.50000", "Owner: @team/owners", "Healed by: (pending)", "Audit ID: AUD-20260101000000-"]) {
      expect(p.body).toContain(need);
    }
    expect(p.body).not.toContain("breaking: true");
    expect(JSON.stringify(p)).not.toMatch(/Mallory|author/i);
    expect(JSON.parse(p.files[0].content).dependencies.alpha).toBe("1.0.1");
    env.cleanup();
  });
  it("sets breaking: true in the body for a major bump", async () => {
    const env = makeAgentEnv([{ name: "alpha", version: "1.4.0", fixed: "2.0.0" }]);
    const ctx = env.ctxFor(dryRunClient(nodeIo, env.paths.prsDir, env.now));
    const r = await graft(ctx, env.request(env.idOf("alpha")));
    expect(r).toMatchObject({ outcome: "PR_OPENED", breaking: true });
    expect(env.payload(env.payloads()[0]!).body).toContain("breaking: true");
    env.cleanup();
  });
  it("refuses non-spawned limbs, missing fixes, transitive dependencies and unavailable advisories", async () => {
    const env = makeAgentEnv([
      { name: "alpha", version: "1.0.0", fixed: "1.0.1", spawned: true },
      { name: "beta", version: "1.0.0" }, // no fixed version
      { name: "gamma", version: "1.0.0", fixed: "1.0.1", dependency: false },
    ]);
    const { client, calls } = mockClient();
    const ctx = env.ctxFor(client);
    expect((await graft(ctx, env.request(env.idOf("beta"), "a.json"))).outcome).toBe("NO_FIX_AVAILABLE");
    expect((await graft(ctx, env.request(env.idOf("gamma"), "b.json"))).outcome).toBe("NO_FIX_AVAILABLE");
    const missing = { ...ctx, advisories: async () => null };
    expect((await graft(missing, env.request(env.idOf("alpha"), "c.json"))).outcome).toBe("ERROR");
    expect(calls).toEqual([]);
    env.cleanup();
  });
  it("refuses a limb that is not spawned in creature.json", async () => {
    const env = makeAgentEnv([{ name: "alpha", version: "1.0.0", fixed: "1.0.1", spawned: false }]);
    // limbs.json normally lists only spawned limbs, so write the entry by hand
    const { writeFileSync } = await import("node:fs");
    writeFileSync(env.paths.limbsPath, JSON.stringify({ ALPHA: { ecosystem: "npm", name: "alpha", version: "1.0.0" } }));
    const { client, calls } = mockClient();
    expect((await graft(env.ctxFor(client), env.request("ALPHA"))).outcome).toBe("REFUSED_NOT_SPAWNED");
    expect(calls).toEqual([]);
    env.cleanup();
  });
  it("does not open a second PR for the same limb", async () => {
    const env = makeAgentEnv();
    const ctx = env.ctxFor(mockClient().client);
    await graft(ctx, env.request(env.idOf("alpha")));
    expect((await graft(ctx, env.request(env.idOf("alpha"), "graft-002.json"))).outcome).toBe("PR_EXISTS");
    expect(env.payloads()).toHaveLength(1);
    env.cleanup();
  });
  it("dry-run payloads do not block a later real run", async () => {
    const env = makeAgentEnv();
    await graft(env.ctxFor(dryRunClient(nodeIo, env.paths.prsDir, env.now)), env.request(env.idOf("alpha")));
    const m = mockClient();
    expect((await graft(env.ctxFor(m.client), env.request(env.idOf("alpha"), "g2.json"))).outcome).toBe("PR_OPENED");
    expect(m.calls).toEqual(["createBranchWithFiles", "openPullRequest"]);
    env.cleanup();
  });
  it("a rejected graft can be retried once its record is archived", async () => {
    const env = makeAgentEnv();
    const limb = env.idOf("alpha");
    env.writeRecord(limb, "alpha", 7);
    const m = mockClient({ checkRuns: () => [{ name: "ci", status: "completed", conclusion: "failure" }] });
    const iq = { ...env.paths, io: nodeIo, client: m.client, now: env.now, sleep: async () => {}, maxAttempts: 2, intervalMs: 1 };
    expect((await verify(iq, limb)).outcome).toBe("GRAFT_REJECTED");
    expect(env.payloads()).toEqual(["rejected"]);
    expect((await graft(env.ctxFor(mockClient().client), env.request(limb))).outcome).toBe("PR_OPENED");
    env.cleanup();
  });
  it("healed PRs do not count toward the cap", async () => {
    const env = makeAgentEnv(["a", "b", "c", "d", "e", "f"].map((s) => ({ name: `pkg${s}`, version: "1.0.0", fixed: "1.0.1" })));
    const ctx = env.ctxFor(mockClient().client);
    const healed: Record<string, unknown> = {};
    let n = 0;
    for (const id of env.ids.slice(0, 5)) {
      await graft(ctx, env.request(id, `g${n++}.json`));
      healed[id] = { state: "healed", pr: "x", updatedAt: "t" };
    }
    expect((await graft(ctx, env.request(env.ids[5]!, "g9.json"))).outcome).toBe("RAID_LIMIT");
    env.writeState(JSON.stringify({ schemaVersion: 1, limbs: healed }));
    expect((await graft(ctx, env.request(env.ids[5]!, "g10.json"))).outcome).toBe("PR_OPENED");
    env.cleanup();
  });
  it("a client error opens nothing and is audited ERROR", async () => {
    const env = makeAgentEnv();
    const { client } = mockClient({ failOn: "openPullRequest" });
    expect((await graft(env.ctxFor(client), env.request(env.idOf("alpha")))).outcome).toBe("ERROR");
    expect(env.outcomes()).toEqual(["ERROR"]);
    expect(env.stateText()).toBeNull();
    env.cleanup();
  });
  it("a sealed or unreadable-seal state aborts with zero calls", async () => {
    const env = makeAgentEnv();
    const { client, calls } = mockClient();
    env.seal();
    expect((await graft(env.ctxFor(client), env.request(env.idOf("alpha")))).outcome).toBe("REJECTED_SEALED");
    const env2 = makeAgentEnv(undefined, { ...nodeIo, pathState: () => { throw new Error("eio"); } });
    const m2 = mockClient();
    expect((await graft(env2.ctxFor(m2.client), env2.request(env2.idOf("alpha")))).outcome).toBe("REJECTED_SEALED");
    expect(calls).toEqual([]);
    expect(m2.calls).toEqual([]);
    expect(env.lookups).toEqual([]);
    env.cleanup();
    env2.cleanup();
  });
});

describe("necromancer properties", () => {
  it("at most 5 PRs per raid, one dependency per PR, no merge-like call", async () => {
    const names = ["a", "b", "c", "d", "e", "f", "g"].map((s) => `pkg${s}`);
    const env = makeAgentEnv(names.map((name) => ({ name, version: "1.0.0", fixed: "1.0.1" })));
    const sent: { files: { path: string; content: string }[] }[] = [];
    const m = mockClient();
    const client = { ...m.client, createBranchWithFiles: async (r: { files: { path: string; content: string }[] }) => void sent.push(r) };
    const ctx = env.ctxFor(client);
    const outcomes: string[] = [];
    let n = 0;
    for (const id of env.ids) outcomes.push((await graft(ctx, env.request(id, `g${n++}.json`))).outcome);
    expect(env.payloads()).toHaveLength(MAX_PRS_PER_RAID);
    expect(outcomes.filter((o) => o === "PR_OPENED")).toHaveLength(5);
    expect(outcomes.filter((o) => o === "RAID_LIMIT")).toHaveLength(2);
    expect(sent).toHaveLength(MAX_PRS_PER_RAID);
    for (const p of sent) {
      const pkg = JSON.parse(p.files.find((x: { path: string }) => x.path === "package.json")!.content).dependencies as Record<string, string>;
      expect(Object.entries(pkg).filter(([, v]) => v !== "1.0.0")).toHaveLength(1);
      const lock = JSON.parse(p.files.find((x: { path: string }) => x.path === "package-lock.json")!.content).packages as Record<string, { version?: string }>;
      expect(Object.entries(lock).filter(([k, v]) => k.startsWith("node_modules/") && v.version !== "1.0.0")).toHaveLength(1);
    }
    env.cleanup();
  });

  it("property: unknown limb IDs never produce a PR, a client call or a lookup; always audited", async () => {
    const env = makeAgentEnv();
    const known = new Set(env.ids);
    const { client, calls } = mockClient();
    const ctx = env.ctxFor(client);
    await fc.assert(
      fc.asyncProperty(fc.oneof(fc.string(), fc.stringMatching(/^[A-Z]{1,12}$/), fc.constantFrom("__proto__", "constructor", "toString", "hasOwnProperty")), async (limb) => {
        fc.pre(!known.has(limb));
        const before = env.audit().length;
        const r = await graft(ctx, env.request(limb));
        return r.outcome === "REJECTED_UNKNOWN_LIMB" && calls.length === 0 && env.lookups.length === 0 && env.payloads().length === 0 && env.audit().length === before + 1;
      }),
      { numRuns: numRuns(150) },
    );
    env.cleanup();
  });

  it("property: after SEAL zero API calls and zero lookups for any input", async () => {
    const env = makeAgentEnv();
    env.seal();
    const { client, calls } = mockClient();
    const ctx = env.ctxFor(client);
    await fc.assert(
      fc.asyncProperty(fc.oneof(fc.string(), fc.constantFrom(...env.ids)), async (limb) => {
        const r = await graft(ctx, env.request(limb));
        return r.outcome === "REJECTED_SEALED" && calls.length === 0 && env.lookups.length === 0 && env.payloads().length === 0;
      }),
      { numRuns: numRuns(100) },
    );
    env.cleanup();
  });

  it("property: the mocked client sees no merge-like call for random inputs, and the source has none", async () => {
    const env = makeAgentEnv();
    const { client, calls } = mockClient();
    const ctx = env.ctxFor(client);
    await fc.assert(
      fc.asyncProperty(fc.oneof(fc.string(), fc.constantFrom(...env.ids)), async (limb) => {
        await graft(ctx, env.request(limb));
        return calls.every((c) => ["createBranchWithFiles", "openPullRequest"].includes(c) && !/merge/i.test(c));
      }),
      { numRuns: numRuns(60) },
    );
    expect(Object.keys(client).filter((k) => /merge/i.test(k))).toEqual([]);
    expect(readFileSync(join("src", "github", "client.ts"), "utf8")).not.toMatch(/merge/i);
    env.cleanup();
  });
});
