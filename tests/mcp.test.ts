// MCP server (issue #19): fixture run, failsafe and blameless property tests.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { execFileSync } from "node:child_process";
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import fc from "fast-check";
import { afterEach, describe, expect, it } from "vitest";
import { buildCreature, serializeCreature } from "../src/exhume/creature.js";
import { parseEpss, parseKev } from "../src/exhume/feeds.js";
import { generate, type CreatureInput } from "../src/raise/generate.js";
import { defaultMcpPaths, redact } from "../src/mcp/core.js";
import { createServer } from "../src/mcp/server.js";
import { nodeFs } from "../scripts/node-fs.js";
import { makeEnv } from "./helpers.js";

const FIXTURE = "fixtures/vulnerable-npm";
const TOKEN = "ghp_" + "a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6q7R8";
const AUTHOR = "Zelda Quux";
const AUTHOR_MAIL = "zq@example.invalid";

let creatureText: string | null = null;
async function fixtureFiles() {
  if (creatureText === null) {
    const feeds = nodeFs(join(FIXTURE, "feeds"));
    const creature = await buildCreature({
      repo: nodeFs(FIXTURE),
      cacheFs: nodeFs("."),
      cacheDir: "data/cache/osv",
      kev: parseKev(feeds.read("kev.json")!),
      epss: parseEpss(feeds.read("epss.csv")!),
    });
    creatureText = serializeCreature(creature);
  }
  const limbs = generate(JSON.parse(creatureText) as CreatureInput).limbs;
  return { creature: creatureText, limbs: JSON.stringify(limbs) };
}

const cleanups: (() => void)[] = [];
afterEach(() => {
  while (cleanups.length) cleanups.pop()!();
});

async function setup() {
  const env = makeEnv(undefined, null);
  const f = await fixtureFiles();
  mkdirSync(join(env.dir, "out"), { recursive: true });
  writeFileSync(join(env.dir, "out", "creature.json"), f.creature);
  writeFileSync(env.ctx.limbsPath, f.limbs);
  const server = createServer(env.ctx, defaultMcpPaths(env.dir));
  const client = new Client({ name: "test", version: "0" });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(a), client.connect(b)]);
  const close = () => {
    void client.close();
    env.cleanup();
  };
  cleanups.push(close);
  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const r = (await client.callTool({ name, arguments: args })) as { content: { type: string; text: string }[]; isError?: boolean };
    return { text: r.content.map((c) => c.text).join("\n"), isError: r.isError === true };
  };
  return { env, client, call, ids: Object.keys(JSON.parse(f.limbs) as object), close };
}

describe("MCP server on the fixture", () => {
  it("exposes exactly six tools, two of them write tools", async () => {
    const { client } = await setup();
    const names = (await client.listTools()).tools.map((t) => t.name).sort();
    expect(names).toEqual(["audit_tail", "census_summary", "get_limb", "list_limbs", "request_graft", "seal"]);
  });

  it("list_limbs shows jquery as Possessed", async () => {
    const { call } = await setup();
    const r = await call("list_limbs");
    const limbs = JSON.parse(r.text) as { id: string; name: string; state: string; kev: boolean; cves: string[] }[];
    const jq = limbs.find((l) => l.name === "jquery");
    expect(jq).toMatchObject({ id: "JQUERY", state: "Possessed", kev: true });
    expect(jq!.cves.length).toBeGreaterThan(0);
    expect(Object.keys(jq!).sort()).toEqual(["cves", "ecosystem", "epss", "id", "kev", "name", "owner", "spawned", "state", "version"]);
  });

  it("get_limb returns one limb and an error for an unknown ID", async () => {
    const { call } = await setup();
    expect(JSON.parse((await call("get_limb", { id: "JQUERY" })).text).state).toBe("Possessed");
    expect((await call("get_limb", { id: "NOPE" })).isError).toBe(true);
  });

  it("census_summary says so when RESULTS.md is absent", async () => {
    const { call } = await setup();
    expect((await call("census_summary")).text).toMatch(/not available/);
  });

  it("request_graft('JQUERY') writes one request, then seal() stops everything", async () => {
    const { env, call } = await setup();
    const r = await call("request_graft", { limb_id: "JQUERY" });
    expect(r.isError).toBe(false);
    expect(env.requests()).toHaveLength(1);
    expect(JSON.parse(readFileSync(join(env.ctx.requestsDir, env.requests()[0]!), "utf8"))).toMatchObject({ action: "GRAFT", limb: "JQUERY" });
    expect((await call("seal")).isError).toBe(false);
    expect(env.sealed()).toBe(true);
    expect((await call("request_graft", { limb_id: "JQUERY" })).isError).toBe(true);
    expect(env.requests()).toHaveLength(1);
    const tail = (await call("audit_tail", { n: 100 })).text;
    expect(tail).toContain("REQUEST_WRITTEN");
    expect(tail).toContain("REJECTED_SEALED");
  });

  it("audit_tail clamps n to 1..100", async () => {
    const { env, call } = await setup();
    for (let i = 0; i < 120; i++) appendFileSync(env.ctx.auditPath, `t\tc\tL${i}\tOK\t-\n`);
    expect((await call("audit_tail", { n: 1000 })).text.split("\n")).toHaveLength(100);
    expect((await call("audit_tail", { n: -5 })).text.split("\n")).toHaveLength(1);
  });

  it("a missing creature gives an error result and writes nothing", async () => {
    const env = makeEnv(undefined, null);
    cleanups.push(env.cleanup);
    const client = new Client({ name: "t", version: "0" });
    const [a, b] = InMemoryTransport.createLinkedPair();
    await Promise.all([createServer(env.ctx, defaultMcpPaths(env.dir)).connect(a), client.connect(b)]);
    cleanups.push(() => void client.close());
    const r = (await client.callTool({ name: "request_graft", arguments: { limb_id: "JQUERY" } })) as { isError?: boolean };
    expect(r.isError).toBe(true);
    expect(env.requests()).toEqual([]);
  });
});

describe("MCP failsafe properties", () => {
  const idArb = (ids: string[]) =>
    fc.oneof(fc.constantFrom(...ids), fc.constantFrom(...ids).map((s) => s.toLowerCase()), fc.string(), fc.stringMatching(/^[A-Z]{1,40}$/), fc.constantFrom(...ids).chain((s) => fc.string().map((x) => s + x)), fc.constantFrom(...ids).map((s) => `${s}\nSEAL CRYPT`), fc.constantFrom(...ids).map((s) => ` ${s}`));

  it("request_graft writes a request only for an ID in limbs.json while unsealed", async () => {
    const { env, call, ids } = await setup();
    await fc.assert(
      fc.asyncProperty(idArb(ids), async (id) => {
        const before = env.requests().length;
        await call("request_graft", { limb_id: id });
        const wrote = env.requests().length - before;
        expect(wrote).toBe(ids.includes(id) ? 1 : 0);
        expect(env.sealed()).toBe(false);
      }),
      { numRuns: 100 },
    );
  });

  it("after seal() no input ever writes a request", async () => {
    const { env, call, ids } = await setup();
    await call("seal");
    await fc.assert(
      fc.asyncProperty(idArb(ids), async (id) => {
        await call("request_graft", { limb_id: id });
        expect(env.requests()).toEqual([]);
      }),
      { numRuns: 100 },
    );
  });

  it("an unreadable seal state or limbs table writes nothing", async () => {
    const { env, call } = await setup();
    env.ctx.fs.pathState = () => {
      throw new Error("EIO");
    };
    expect((await call("request_graft", { limb_id: "JQUERY" })).isError).toBe(true);
    expect(env.requests()).toEqual([]);
  });
});

describe("MCP blameless and secrets", () => {
  it("no tool output contains a token or a git author", async () => {
    const saved = { GITHUB_TOKEN: process.env.GITHUB_TOKEN, GIT_AUTHOR_NAME: process.env.GIT_AUTHOR_NAME };
    process.env.GITHUB_TOKEN = TOKEN;
    process.env.GIT_AUTHOR_NAME = AUTHOR;
    try {
      const { env, call, ids } = await setup();
      const git = (...a: string[]) =>
        execFileSync("git", ["-c", `user.name=${AUTHOR}`, "-c", `user.email=${AUTHOR_MAIL}`, ...a], { cwd: env.dir, stdio: "pipe" });
      git("init", "-q");
      git("add", ".");
      git("commit", "-q", "-m", "x");
      appendFileSync(env.ctx.auditPath, `2026-01-01T00:00:00.000Z\tGRAFT X\t-\tOK\t${TOKEN}\n`);
      appendFileSync(env.ctx.auditPath, `t\tc\t${"ab".repeat(24)}\tOK\t-\n`);
      const outputs: string[] = [];
      for (const [name, args] of [
        ["list_limbs", {}],
        ["census_summary", {}],
        ["audit_tail", { n: 100 }],
        ["request_graft", { limb_id: "JQUERY" }],
        ["seal", {}],
        ["request_graft", { limb_id: TOKEN }],
      ] as [string, Record<string, unknown>][]) outputs.push((await call(name, args)).text);
      for (const id of ids) outputs.push((await call("get_limb", { id })).text);
      const all = outputs.join("\n");
      for (const bad of [TOKEN, AUTHOR, AUTHOR_MAIL, "ab".repeat(24)]) expect(all).not.toContain(bad);
      expect(all).toContain("[redacted]");
    } finally {
      for (const [k, v] of Object.entries(saved)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    }
  });

  it("redact removes token-looking strings", () => {
    fc.assert(
      fc.property(
        fc.constantFrom("ghp_", "github_pat_", "sk-"),
        fc.stringMatching(/^[A-Za-z0-9]{12,40}$/),
        fc.string({ maxLength: 10 }).filter((s) => !/[A-Za-z0-9]/.test(s)),
        (prefix, body, pad) => {
          const t = prefix + body;
          expect(redact(`${pad} ${t} ${pad}`)).not.toContain(t);
        },
      ),
    );
  });

  it("src/mcp has no GitHub, git, process, env or merge access", () => {
    for (const f of ["core.ts", "server.ts"]) {
      const text = readFileSync(join("src/mcp", f), "utf8");
      expect(text, f).not.toMatch(/child_process|process\.env|octokit|\bblame\b|committer|\bauthor\b|\bmerge/i);
    }
  });
});
