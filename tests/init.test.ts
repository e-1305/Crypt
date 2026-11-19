import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { UsageError } from "../src/cli/exit.js";
import { parseCli } from "../src/cli/parse.js";
import { codeownersDraft, manifestPaths, planInit, prBody, PLACEHOLDER_TEAM, WORKFLOW_PATH } from "../src/init/plan.js";
import { initCommand } from "../scripts/cli/init.js";
import type { Fetcher } from "../scripts/github-client.js";

const ENV = { GITHUB_TOKEN: "github_pat_test" };
const SHA = "a".repeat(40);

function fakeGithub(o: { tree?: string[]; openPr?: boolean; failPut?: boolean } = {}) {
  const calls: string[] = [];
  const puts: { path: string; content: string }[] = [];
  const fetch: Fetcher = async (url, init) => {
    const path = url.replace("https://api.github.com", "");
    const method = init?.method ?? "GET";
    calls.push(`${method} ${path}`);
    const ok = (b: unknown) => ({ ok: true, status: 200, json: async () => b });
    if (path === "/repos/o/r") return ok({ permissions: { push: true }, default_branch: "main" });
    if (path.startsWith("/user/repos")) return ok([{ full_name: "o/r", private: true }]);
    if (path === "/repos/o/r/git/ref/heads/main") return ok({ object: { sha: SHA } });
    if (path.startsWith(`/repos/o/r/git/trees/${SHA}`)) return ok({ tree: (o.tree ?? ["package.json", "package-lock.json"]).map((p) => ({ path: p, type: "blob" })) });
    if (method === "GET" && path.startsWith("/repos/o/r/pulls?")) return ok(o.openPr ? [{ html_url: "https://github.com/o/r/pull/9" }] : []);
    if (method === "POST" && path === "/repos/o/r/git/refs") return ok({});
    if (method === "PUT" && path.startsWith("/repos/o/r/contents/")) {
      if (o.failPut) return { ok: false, status: 409, json: async () => ({}) };
      const b = JSON.parse(init!.body!);
      puts.push({ path: decodeURIComponent(path.replace("/repos/o/r/contents/", "")), content: Buffer.from(b.content, "base64").toString("utf8") });
      return ok({});
    }
    if (method === "POST" && path === "/repos/o/r/pulls") return ok({ html_url: "https://github.com/o/r/pull/1" });
    return { ok: false, status: 404, json: async () => ({}) };
  };
  return { fetch, calls, puts };
}

async function run(argv: string[], fetch?: Fetcher) {
  let out = "";
  const code = await initCommand(parseCli(["init", ...argv], ENV), { env: ENV, fetch, out: (s) => (out += s), warn: () => {} });
  return { code, out };
}

describe("planInit", () => {
  it("adds the workflow and a CODEOWNERS draft with team placeholders only", () => {
    const plan = planInit(["package.json", "apps/web/package-lock.json", "node_modules/x/package.json", "tests/fixtures/a/package.json"]);
    expect(plan.files.map((f) => f.path)).toEqual([WORKFLOW_PATH, ".github/CODEOWNERS"]);
    const draft = plan.files[1]!.content;
    expect(draft).toContain(`/apps/web/package-lock.json ${PLACEHOLDER_TEAM}`);
    expect(draft).not.toContain("node_modules");
    expect(draft).not.toContain("fixtures");
  });

  it("leaves an existing CODEOWNERS alone and refuses when already set up", () => {
    expect(planInit(["CODEOWNERS", "package.json"]).files.map((f) => f.path)).toEqual([WORKFLOW_PATH]);
    expect(() => planInit([WORKFLOW_PATH])).toThrow(/already/);
  });

  it("the workflow is read-only and the PR body says a person merges", () => {
    const plan = planInit(["package.json"]);
    expect(plan.files[0]!.content).toContain("contents: read");
    expect(plan.files[0]!.content).toContain("mode: report");
    expect(prBody(plan)).toMatch(/A person reviews it and lands it/);
  });

  it("CODEOWNERS draft never contains a person handle (property)", () => {
    fc.assert(
      fc.property(fc.array(fc.stringMatching(/^[a-z]{1,8}(\/[a-z]{1,8}){0,2}\/package\.json$/), { maxLength: 20 }), (paths) => {
        const owners = codeownersDraft(manifestPaths(paths))
          .split("\n")
          .filter((l) => l && !l.startsWith("#"))
          .map((l) => l.split(" ")[1]);
        return owners.every((o) => o === PLACEHOLDER_TEAM);
      }),
    );
  });
});

describe("crypt init", () => {
  it("parses and requires --repo and a token for --live", () => {
    expect(parseCli(["init"]).command).toBe("init");
    expect(() => parseCli(["init", "--live"], ENV)).toThrow(UsageError);
    expect(() => parseCli(["init", "--live", "--repo", "o/r"], {})).toThrow(/GITHUB_TOKEN/);
  });

  it("dry run prints the plan and calls nothing", async () => {
    const r = await run([], async () => {
      throw new Error("no network");
    });
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/Dry run. Nothing was sent./);
    expect(r.out).toContain(WORKFLOW_PATH);
  });

  it("live opens one branch and one pull request, never a merge", async () => {
    const gh = fakeGithub();
    const r = await run(["--live", "--repo", "o/r"], gh.fetch);
    expect(r.out).toContain("https://github.com/o/r/pull/1");
    expect(gh.puts.map((p) => p.path)).toEqual([WORKFLOW_PATH, ".github/CODEOWNERS"]);
    expect(gh.calls.filter((c) => c.startsWith("POST /repos/o/r/pulls"))).toHaveLength(1);
    expect(gh.calls.some((c) => /merge/i.test(c))).toBe(false);
  });

  it("does nothing when an onboarding PR is already open or the workflow exists", async () => {
    const a = fakeGithub({ openPr: true });
    expect((await run(["--live", "--repo", "o/r"], a.fetch)).out).toMatch(/already open/);
    expect(a.puts).toHaveLength(0);
    const b = fakeGithub({ tree: [WORKFLOW_PATH, "package.json"] });
    expect((await run(["--live", "--repo", "o/r"], b.fetch)).out).toMatch(/already set up/);
    expect(b.calls.some((c) => c.startsWith("POST"))).toBe(false);
  });

  it("stops with a clear message when GitHub refuses a write", async () => {
    await expect(run(["--live", "--repo", "o/r"], fakeGithub({ failPut: true }).fetch)).rejects.toThrow(/crypt init stopped/);
  });
});
