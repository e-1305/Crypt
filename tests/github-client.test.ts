import { describe, expect, it } from "vitest";
import { githubClient } from "../scripts/github-client.js";
import { REPO, TOKEN, makeWorld } from "./live-helpers.js";

// Branch handling on the Git Data API is covered in tests/live-graft.test.ts; this file keeps the adapter's basic contract.
describe("github adapter basics", () => {
  const req = { branch: "crypt/graft-a-1.0.1", message: "m", files: [{ path: "package.json", content: "{}" }] };
  it("works with the positional call shape and exposes no landing method", async () => {
    const w = makeWorld();
    const c = githubClient(REPO, TOKEN, w.github);
    await c.createBranchWithFiles(req);
    expect(w.cryptRefs()).toEqual(["refs/heads/crypt/graft-a-1.0.1"]);
    expect(Object.keys(c).filter((k) => /merge/i.test(k))).toEqual([]);
  });
  it("refuses a bad repo name and an empty token", () => {
    expect(() => githubClient("nope", TOKEN)).toThrow(/owner\/name/);
    expect(() => githubClient(REPO, "")).toThrow(/GITHUB_TOKEN/);
  });
  it("reads check runs by commit SHA", async () => {
    const w = makeWorld({ checkRuns: [{ name: "test", status: "completed", conclusion: "success" }] });
    const runs = await githubClient(REPO, TOKEN, w.github).getCheckRuns("a".repeat(40));
    expect(runs).toEqual([{ name: "test", status: "completed", conclusion: "success" }]);
    expect(w.requests[0]!.path).toBe(`/repos/${REPO}/commits/${"a".repeat(40)}/check-runs`);
  });
});
