import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { UsageError } from "../src/cli/exit.js";
import { parseCli } from "../src/cli/parse.js";
import { parseGraveyard } from "../src/graveyard/model.js";
import { graveyardCommand } from "../scripts/cli/graveyard.js";
import type { Fetcher } from "../scripts/github-client.js";

const TOKEN = "ghp_SENTINEL_TOKEN_123456";
const FEEDS = join(process.cwd(), "fixtures", "vulnerable-npm", "feeds");
const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});
const work = (): string => {
  const d = mkdtempSync(join(tmpdir(), "graveyard-"));
  dirs.push(d);
  return d;
};
const b64 = (s: string) => Buffer.from(s).toString("base64");
const LOCK = JSON.stringify({
  name: "x",
  lockfileVersion: 3,
  packages: { "": { name: "x", dependencies: { lodash: "4.17.15" } }, "node_modules/lodash": { version: "4.17.15" } },
});

function fakes(calls: string[] = []) {
  const gh: Fetcher = async (url, init) => {
    calls.push(`${init?.method} ${url}`);
    const path = url.replace("https://api.github.com", "");
    const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body });
    const no = (status: number) => ({ ok: false, status, json: async () => ({}) });
    if (path.startsWith("/orgs/acme/repos")) return ok([{ full_name: "acme/b", archived: false }, { full_name: "acme/a" }, { full_name: "acme/old", archived: true }, { full_name: "acme/nolock" }]);
    if (path === "/repos/acme/a/contents/package-lock.json") return ok({ encoding: "base64", content: b64(LOCK) });
    if (path === "/repos/acme/b/contents/package-lock.json") return ok({ encoding: "none", content: "", sha: "a".repeat(40) });
    if (path === `/repos/acme/b/git/blobs/${"a".repeat(40)}`) return ok({ encoding: "base64", content: b64(LOCK) });
    if (path === "/repos/acme/a/contents/.github/CODEOWNERS") return ok({ encoding: "base64", content: b64("* @acme/platform\n") });
    return no(404);
  };
  const osv: Fetcher = async (url, init) => {
    calls.push(`OSV ${url}`);
    if (init?.headers && JSON.stringify(init.headers).includes(TOKEN)) throw new Error("token sent to OSV");
    const n = init?.body ? (JSON.parse(init.body).queries?.length ?? 0) : 0;
    return { ok: true, status: 200, json: async () => ({ results: Array.from({ length: n }, () => ({ vulns: [] })) }) };
  };
  return { gh, osv };
}

async function run(argv: string[], cwd: string, env: Record<string, string | undefined>, f = fakes()) {
  let stdout = "";
  const code = await graveyardCommand(parseCli(["graveyard", ...argv], env), { cwd, env, fetchImpl: f.gh, osvFetchImpl: f.osv, feedsDir: FEEDS, now: () => 1_000_000_000_000, out: (s) => void (stdout += s) });
  return { code, stdout };
}

const allFiles = (d: string): string[] => readdirSync(d, { recursive: true, withFileTypes: true }).filter((e) => e.isFile()).map((e) => join(e.parentPath, e.name));

describe("graveyard flags", () => {
  it("parses the documented flags", () => {
    const p = parseCli(["graveyard", "--org", "acme", "--token-env", "GITHUB_TOKEN", "--out", "x.json", "--repos", "a/b,c/d"]);
    expect(p.flags).toEqual({ org: "acme", "token-env": "GITHUB_TOKEN", out: "x.json", repos: "a/b,c/d" });
    expect(parseCli(["graveyard", "--sample"]).flags).toEqual({ sample: true });
  });
  it("refuses a token passed as the env name, a bad org, bad repos and mixed sample", () => {
    expect(() => parseCli(["graveyard", "--token-env", "ghp_abc-123"])).toThrow(UsageError);
    expect(() => parseCli(["graveyard", "--org", "a b"])).toThrow(UsageError);
    expect(() => parseCli(["graveyard", "--repos", "nope"])).toThrow(UsageError);
    expect(() => parseCli(["graveyard", "--sample", "--org", "acme"])).toThrow(UsageError);
  });
});

describe("crypt graveyard", () => {
  it("--sample writes a valid file", async () => {
    const cwd = work();
    const r = await run(["--sample"], cwd, {});
    expect(r.code).toBe(0);
    const doc = parseGraveyard(readFileSync(join(cwd, "out", "graveyard.json"), "utf8"))!;
    expect(doc.repos.length).toBeGreaterThan(2);
  });
  it("needs --org and --token-env, and writes nothing", async () => {
    const cwd = work();
    await expect(run([], cwd, { GITHUB_TOKEN: TOKEN })).rejects.toThrow(/--org/);
    await expect(run(["--org", "acme"], cwd, { GITHUB_TOKEN: TOKEN })).rejects.toThrow(/--token-env/);
    await expect(run(["--org", "acme", "--token-env", "GITHUB_TOKEN"], cwd, {})).rejects.toThrow(/GITHUB_TOKEN is not set\. Export/);
    expect(allFiles(cwd)).toEqual([]);
  });
  it("scans the org with GET only, never sends the token to OSV, never writes it", async () => {
    const cwd = work();
    const calls: string[] = [];
    const r = await run(["--org", "acme", "--token-env", "GH_PAT"], cwd, { GH_PAT: TOKEN }, fakes(calls));
    expect(r.code).toBe(0);
    expect(calls.filter((c) => !c.startsWith("OSV")).every((c) => c.startsWith("GET "))).toBe(true);
    expect(calls.some((c) => c.includes("acme/old"))).toBe(false);
    const doc = parseGraveyard(readFileSync(join(cwd, "out", "graveyard.json"), "utf8"))!;
    expect(doc.repos.map((x) => x.repo)).toEqual(["acme/a", "acme/b"]);
    expect(doc.org).toBe("acme");
    expect(doc.repos[0]!.scannedLimbs).toBe(1);
    expect(r.stdout).toMatch(/2 repositories, 1 skipped/);
    for (const f of allFiles(cwd)) expect(readFileSync(f, "utf8")).not.toContain(TOKEN);
    expect(r.stdout).not.toContain(TOKEN);
  });
  it("stops without writing and without the token when GitHub fails", async () => {
    const cwd = work();
    const f = fakes();
    const bad: Fetcher = async (url) => {
      throw Object.assign(new Error(`boom ${TOKEN} ${url}`), { status: 403 });
    };
    let msg = "";
    try {
      await run(["--org", "acme", "--token-env", "GH_PAT"], cwd, { GH_PAT: TOKEN }, { gh: bad, osv: f.osv });
    } catch (e) {
      msg = (e as Error).message;
    }
    expect(msg).toMatch(/nothing was written/);
    expect(msg).toMatch(/rate limiting/);
    expect(msg).not.toContain(TOKEN);
    expect(existsSync(join(cwd, "out", "graveyard.json"))).toBe(false);
  });
});
