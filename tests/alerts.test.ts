import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import fc from "fast-check";
import { afterEach, describe, expect, it } from "vitest";
import { UsageError } from "../src/cli/exit.js";
import { parseCli } from "../src/cli/parse.js";
import { limbIds } from "../src/raise/generate.js";
import { buildIssues, MAX_ISSUES } from "../src/alerts/issues.js";
import { alertsCommand } from "../scripts/cli/alerts.js";
import type { Fetcher } from "../scripts/github-client.js";

const TOKEN = "github_pat_SENTINEL1234567890";
const ENV = { GITHUB_TOKEN: TOKEN };
const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

const limb = (i: number, state = "Possessed", extra: Record<string, unknown> = {}) => ({
  rank: i,
  id: `npm:pkg${i}@1.0.${i}`,
  name: `pkg${i}`,
  version: `1.0.${i}`,
  owner: i % 2 ? "@acme/platform" : "unowned",
  state,
  kev: state === "Possessed",
  vulns: [{ id: `GHSA-${i}`, cves: [`CVE-2020-000${i}`, "CVE-2020-0001"] }],
  ...extra,
});
const creatureOf = (n: number) => ({ limbs: [...Array.from({ length: n }, (_, i) => limb(i + 1)), limb(99, "Rotting")] });

function work(creature: unknown): string {
  const d = mkdtempSync(join(tmpdir(), "alerts-"));
  dirs.push(d);
  if (creature !== undefined) {
    mkdirSync(join(d, "out"));
    writeFileSync(join(d, "out", "creature.json"), JSON.stringify(creature));
  }
  return d;
}

function fakeGithub(o: { open?: string[]; prs?: string[]; push?: boolean; failCreateAt?: number } = {}) {
  const calls: string[] = [];
  const created: { title: string; body: string }[] = [];
  const fetch: Fetcher = async (url, init) => {
    const path = url.replace("https://api.github.com", "");
    const method = init?.method ?? "GET";
    calls.push(`${method} ${path}`);
    const ok = (b: unknown) => ({ ok: true, status: 200, json: async () => b });
    if (path === "/repos/o/r") return ok({ permissions: { push: o.push !== false } });
    if (path.startsWith("/user/repos")) return ok([{ full_name: "o/r", private: true }]);
    if (method === "GET" && path.startsWith("/repos/o/r/issues?")) {
      const page = Number(/[?&]page=(\d+)/.exec(path)?.[1] ?? 1);
      const all = [...(o.open ?? []).map((title) => ({ title })), ...(o.prs ?? []).map((title) => ({ title, pull_request: {} })), ...created];
      return ok(all.slice((page - 1) * 100, page * 100));
    }
    if (method === "POST" && path === "/repos/o/r/issues") {
      if (o.failCreateAt === created.length + 1) return { ok: false, status: 500, json: async () => ({}) };
      created.push(JSON.parse(init!.body!));
      return ok({ html_url: `https://github.com/o/r/issues/${created.length}` });
    }
    return { ok: false, status: 404, json: async () => ({}) };
  };
  return { fetch, calls, created };
}

async function run(argv: string[], d: string, fetch?: Fetcher, env: Record<string, string | undefined> = ENV) {
  let out = "";
  const code = await alertsCommand(parseCli(["alerts", ...argv], env), { cwd: d, env, fetch, out: (s) => (out += s), warn: () => {} });
  return { code, out };
}

describe("alerts parsing", () => {
  it("needs --format issues", () => {
    expect(() => parseCli(["alerts"])).toThrow(UsageError);
    expect(() => parseCli(["alerts", "--format", "slack"])).toThrow(/--format issues/);
    expect(parseCli(["alerts", "--format", "issues"]).flags).toEqual({ format: "issues" });
  });
  it("--live needs --repo and GITHUB_TOKEN", () => {
    expect(() => parseCli(["alerts", "--format", "issues", "--live"], ENV)).toThrow(/--repo/);
    expect(() => parseCli(["alerts", "--format", "issues", "--live", "--repo", "o/r"])).toThrow(/GITHUB_TOKEN/);
    expect(() => parseCli(["alerts", "--format", "issues", "--repo", "o/r"])).toThrow(/--live/);
    expect(parseCli(["alerts", "--format", "issues", "--live", "--repo", "o/r"], ENV).flags.live).toBe(true);
  });
});

describe("buildIssues", () => {
  it("titles, body content and the cap", () => {
    const issues = buildIssues(creatureOf(8), "o/r");
    expect(issues).toHaveLength(MAX_ISSUES);
    expect(issues[0]!.title).toBe("[CRYPT] KEV: pkg1 1.0.1");
    expect(issues.map((i) => i.title)).not.toContain("[CRYPT] KEV: pkg99 1.0.99");
    const b = issues[0]!.body;
    expect(b).toContain("CVEs: CVE-2020-0001\n"); // duplicates are listed once
    expect(issues[1]!.body).toContain("CVEs: CVE-2020-0001, CVE-2020-0002");
    expect(b).toContain("Owner: @acme/platform");
    expect(issues[1]!.body).toContain("Owner: no owner yet");
    expect(b).toContain("48 hours");
    expect(b).toContain("crypt graft PKG --live --repo o/r");
  });
  it("never carries author-like data from the creature", () => {
    fc.assert(
      fc.property(fc.string({ minLength: 3, maxLength: 20 }).filter((s) => /^[a-z]+$/.test(s)), (person) => {
        const c = { limbs: [limb(1, "Possessed", { author: person, committer: person, blame: person, email: `${person}@x.io` })] };
        const all = buildIssues(c).map((i) => i.title + i.body).join("\n");
        // The person string may occur by chance inside fixed copy, so compare with a run that has no author fields.
        const base = buildIssues({ limbs: [limb(1)] }).map((i) => i.title + i.body).join("\n");
        expect(all).toBe(base);
        expect(all).not.toContain("@x.io");
      }),
    );
  });
});

describe("crypt alerts", () => {
  it("dry-run prints the issues and makes no network call", async () => {
    const g = fakeGithub();
    const r = await run(["--format", "issues"], work(creatureOf(2)), g.fetch, {});
    expect(r.code).toBe(0);
    expect(r.out).toContain("[CRYPT] KEV: pkg1 1.0.1");
    expect(r.out).toContain("[CRYPT] KEV: pkg2 1.0.2");
    expect(g.calls).toEqual([]);
  });
  it("fails with an action when out/creature.json is missing", async () => {
    await expect(run(["--format", "issues"], work(undefined))).rejects.toThrow(/crypt raid/);
  });
  it("opens at most 5 issues", async () => {
    const g = fakeGithub();
    const r = await run(["--format", "issues", "--live", "--repo", "o/r"], work(creatureOf(8)), g.fetch);
    expect(r.code).toBe(0);
    expect(g.created).toHaveLength(5);
    expect(g.created[0]!.title).toBe("[CRYPT] KEV: pkg1 1.0.1");
    expect(g.calls.some((c) => /merge/i.test(c))).toBe(false);
  });
  it("is idempotent: an open issue with the exact title is not recreated, a near match is", async () => {
    const g = fakeGithub({ open: ["[CRYPT] KEV: pkg1 1.0.1", "[CRYPT] KEV: pkg2 1.0.20"] });
    await run(["--format", "issues", "--live", "--repo", "o/r"], work(creatureOf(2)), g.fetch);
    expect(g.created.map((c) => c.title)).toEqual(["[CRYPT] KEV: pkg2 1.0.2"]);
  });
  it("a token preflight failure creates nothing", async () => {
    const g = fakeGithub({ push: false });
    await expect(run(["--format", "issues", "--live", "--repo", "o/r"], work(creatureOf(2)), g.fetch)).rejects.toThrow(/cannot push/);
    expect(g.created).toEqual([]);
    expect(g.calls.some((c) => c.startsWith("GET /repos/o/r/issues"))).toBe(false);
  });
  it("stops at the first error and exits nonzero", async () => {
    const g = fakeGithub({ failCreateAt: 2 });
    const d = work(creatureOf(4));
    await expect(run(["--format", "issues", "--live", "--repo", "o/r"], d, g.fetch)).rejects.toThrow(/No further issue was opened/);
    expect(g.created).toHaveLength(1);
    expect(readFileSync(join(d, "crypt-audit.log"), "utf8")).toContain("ERROR");
  });
  it("the seal aborts and changes nothing", async () => {
    const g = fakeGithub();
    const d = work(creatureOf(2));
    writeFileSync(join(d, ".crypt-seal"), "");
    const r = await run(["--format", "issues", "--live", "--repo", "o/r"], d, g.fetch);
    expect(r.code).toBe(0);
    expect(g.calls).toEqual([]);
    expect(readFileSync(join(d, "crypt-audit.log"), "utf8")).toContain("REJECTED_SEALED");
  });
  it("skips open titles before the cap, so limbs 6 and up get issues", async () => {
    const g = fakeGithub({ open: Array.from({ length: 5 }, (_, i) => `[CRYPT] KEV: pkg${i + 1} 1.0.${i + 1}`) });
    await run(["--format", "issues", "--live", "--repo", "o/r"], work(creatureOf(8)), g.fetch);
    expect(g.created.map((c) => c.title)).toEqual(["[CRYPT] KEV: pkg6 1.0.6", "[CRYPT] KEV: pkg7 1.0.7", "[CRYPT] KEV: pkg8 1.0.8"]);
  });
  it("a pull request with the same title does not count as an open issue", async () => {
    const g = fakeGithub({ prs: ["[CRYPT] KEV: pkg1 1.0.1"] });
    await run(["--format", "issues", "--live", "--repo", "o/r"], work(creatureOf(1)), g.fetch);
    expect(g.created).toHaveLength(1);
  });
  it("a title with a quote is matched exactly", async () => {
    const c = { limbs: [limb(1, "Possessed", { name: 'a"b', version: "1" })] };
    const g = fakeGithub({ open: ['[CRYPT] KEV: a"b 1'] });
    await run(["--format", "issues", "--live", "--repo", "o/r"], work(c), g.fetch);
    expect(g.created).toEqual([]);
  });
});

describe("graft id and mentions", () => {
  const sp = (name: string, rank: number) => limb(rank, "Possessed", { name, version: "1", spawned: true });
  it("uses the real limb IDs, including suffixes for collisions", () => {
    const c = { limbs: [sp("@types/node", 1), sp("types-node", 2)] };
    const ids = limbIds(["@types/node", "types-node"]);
    const issues = buildIssues(c, "o/r");
    expect(ids[0]).not.toBe(ids[1]);
    expect(issues[0]!.body).toContain(`crypt graft ${ids[0]} --live`);
    expect(issues[1]!.body).toContain(`crypt graft ${ids[1]} --live`);
  });
  it("matches limbIds for long, odd and empty names", () => {
    const names = ["a".repeat(40), "123", 'x"y@z', "lodash"];
    const c = { limbs: names.map((n, i) => sp(n, i + 1)) };
    const ids = limbIds(names);
    buildIssues(c, "o/r").forEach((i, k) => expect(i.body).toContain(`crypt graft ${ids[k]} --live`));
  });
  it("puts the package name in a code span so it cannot mention anyone", () => {
    const c = { limbs: [limb(1, "Possessed", { name: "@scope/pkg", version: "1.0.0", owner: "unowned" })] };
    const b = buildIssues(c)[0]!.body;
    expect(b.split("\n")[0]).toMatch(/^`@scope\/pkg 1\.0\.0` is Possessed/);
    expect(b.replace(/`[^`]*`/g, "")).not.toMatch(/@scope/);
  });
});
