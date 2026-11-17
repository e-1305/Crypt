import { describe, expect, it } from "vitest";
import { githubClient, type Fetcher } from "../scripts/github-client.js";

function fake(failPut: boolean, refExists: boolean) {
  const calls: string[] = [];
  const f: Fetcher = async (url, init) => {
    const method = init?.method ?? "GET";
    const path = url.replace("https://api.github.com/repos/o/r", "");
    calls.push(`${method} ${path}`);
    let status = 200;
    let body: unknown = { default_branch: "main", object: { sha: "s" }, sha: "f" };
    if (method === "POST" && path === "/git/refs" && refExists) status = 422;
    if (method === "PUT" && failPut) status = 500;
    if (method === "GET" && path.startsWith("/pulls?")) body = [];
    return { ok: status < 400, status, json: async () => body };
  };
  return { calls, client: githubClient("o/r", "t", f) };
}
const req = { branch: "crypt/graft-a-1.0.1", message: "m", files: [{ path: "package.json", content: "{}" }] };

describe("github adapter branch handling", () => {
  it("deletes the branch when a file commit fails", async () => {
    const { calls, client } = fake(true, false);
    await expect(client.createBranchWithFiles(req)).rejects.toThrow();
    expect(calls).toContain("DELETE /git/refs/heads/crypt/graft-a-1.0.1");
  });
  it("resets a leftover crypt/ branch instead of failing on 422", async () => {
    const { calls, client } = fake(false, true);
    await client.createBranchWithFiles(req);
    expect(calls).toContain("PATCH /git/refs/heads/crypt/graft-a-1.0.1");
  });
  it("refuses branches outside crypt/", async () => {
    const { calls, client } = fake(false, true);
    await expect(client.createBranchWithFiles({ ...req, branch: "main" })).rejects.toThrow();
    expect(calls.some((c) => c.startsWith("PATCH"))).toBe(false);
  });
});
