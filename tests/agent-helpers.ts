import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defaultPaths } from "../src/common/agent.js";
import { nodeIo, type Io } from "../src/common/io.js";
import type { CheckRun, GithubClient, PrState } from "../src/github/client.js";
import type { NecromancerCtx } from "../src/necromancer/index.js";
import type { RegistryClient } from "../src/registry/types.js";
import type { Advisory } from "../src/necromancer/version.js";
import { generate } from "../src/raise/generate.js";

export interface TestLimb {
  name: string;
  version: string;
  fixed?: string; // advisory range [0, fixed)
  spawned?: boolean;
  dependency?: boolean; // present in package.json (default true)
}

export interface MockOpts {
  checkRuns?: () => CheckRun[] | Promise<CheckRun[]>;
  prState?: (ref: { number: number; branch: string }) => PrState | Promise<PrState>;
  failOn?: string; // method name that throws
}

/** A GithubClient that records every call. It has no merge method; the recorder would catch one anyway. */
export function mockClient(o: MockOpts = {}) {
  const calls: string[] = [];
  const rec = async <T>(name: string, f: () => T | Promise<T>): Promise<T> => {
    calls.push(name);
    if (o.failOn === name) throw new Error(`mock ${name} failed`);
    return f();
  };
  const client: GithubClient = {
    dryRun: false,
    readBaseFile: async () => {
      throw new Error("mockClient has no remote files; env.ctxFor supplies them from the target directory");
    },
    createBranchWithFiles: (r) => rec("createBranchWithFiles", () => void r),
    openPullRequest: (r) => rec("openPullRequest", () => ({ number: 100 + calls.length, url: `https://example.invalid/pr/${r.branch}`, headSha: "a".repeat(40) })),
    getCheckRuns: () => rec("getCheckRuns", () => o.checkRuns?.() ?? []),
    getPullRequestState: (ref) => rec("getPullRequestState", () => o.prState?.(ref) ?? { open: true, landed: false }),
  };
  return { client, calls };
}

export function makeAgentEnv(limbs: TestLimb[] = [{ name: "alpha", version: "1.0.0", fixed: "1.0.1" }], io: Io = nodeIo) {
  const dir = mkdtempSync(join(tmpdir(), "crypt-agent-"));
  const paths = defaultPaths(dir);
  const creature = {
    schemaVersion: 1,
    counts: { spawned: limbs.length, healthy: 0, rotting: limbs.length, possessed: 0 },
    limbs: limbs.map((l, i) => ({
      rank: i + 1,
      id: `npm:${l.name}@${l.version}`,
      ecosystem: "npm",
      name: l.name,
      version: l.version,
      owner: "@team/owners",
      state: "Rotting",
      spawned: l.spawned !== false,
      kev: i === 0,
      epss: 0.5,
      author: "Mallory Author", // must never reach a PR
      vulns: [{ id: `V-${l.name}`, cves: [`CVE-2020-${1000 + i}`] }],
    })),
  };
  mkdirSync(join(dir, "out"), { recursive: true });
  writeFileSync(paths.creaturePath, JSON.stringify(creature, null, 2));
  const gen = generate(creature as Parameters<typeof generate>[0]);
  writeFileSync(paths.limbsPath, JSON.stringify(gen.limbs));
  const target = join(dir, "target");
  mkdirSync(target);
  const deps = Object.fromEntries(limbs.filter((l) => l.dependency !== false).map((l) => [l.name, l.version]));
  writeFileSync(join(target, "package.json"), JSON.stringify({ name: "t", version: "1.0.0", dependencies: deps }, null, 2) + "\n");
  const lock = {
    name: "t",
    lockfileVersion: 3,
    packages: {
      "": { name: "t", dependencies: deps },
      ...Object.fromEntries(limbs.map((l) => [`node_modules/${l.name}`, { version: l.version, resolved: "https://x/y.tgz", integrity: "sha512-zzz" }])),
    },
  };
  writeFileSync(join(target, "package-lock.json"), JSON.stringify(lock, null, 2) + "\n");
  const advisories = new Map<string, Advisory>(
    limbs.map((l) => [
      `V-${l.name}`,
      {
        id: `V-${l.name}`,
        aliases: [],
        affected: [{ package: { ecosystem: "npm", name: l.name }, ranges: [{ type: "SEMVER", events: [{ introduced: "0" }, ...(l.fixed ? [{ fixed: l.fixed }] : [])] }] }],
      },
    ]),
  );
  const lookups: string[] = [];
  const now = () => new Date("2026-01-01T00:00:00.000Z");
  const ids = Object.keys(gen.limbs);
  const idOf = (name: string) => ids.find((k) => gen.limbs[k]!.name === name)!;
  /** Registry that answers for any version: no dependencies, integrity derived from the name and version. */
  const registry: RegistryClient = {
    async getVersion(name, version) {
      return {
        version,
        resolved: `https://registry.npmjs.org/${name}/-/${name}-${version}.tgz`,
        integrity: `sha512-${Buffer.from(`${name}@${version}`).toString("base64")}`,
        dependencies: {},
        optionalDependencies: {},
        peerDependencies: {},
      };
    },
  };
  /** Live clients read the base branch; here that is the target directory. Dry-run clients read it directly. */
  const ctxFor = (client: GithubClient): NecromancerCtx => ({
    ...paths,
    io,
    client: client.dryRun ? client : { ...client, readBaseFile: async (p: string) => readFileSync(join(target, p), "utf8") },
    registry,
    advisories: async (id) => {
      lookups.push(id);
      return advisories.get(id) ?? null;
    },
    targetDir: target,
    now,
  });
  const request = (limb: string, file = "graft-001.json") => {
    mkdirSync(join(dir, "out", "requests"), { recursive: true });
    const p = join(dir, "out", "requests", file);
    writeFileSync(p, JSON.stringify({ version: 1, action: "GRAFT", limb }));
    return p;
  };
  return {
    dir,
    paths,
    target,
    ids,
    idOf,
    lookups,
    now,
    ctxFor,
    request,
    seal: () => writeFileSync(paths.sealPath, "x\n"),
    payloads: () => (existsSync(paths.prsDir) ? readdirSync(paths.prsDir) : []),
    payload: (f: string) => JSON.parse(readFileSync(join(paths.prsDir, f), "utf8")),
    audit: () => (existsSync(paths.auditPath) ? readFileSync(paths.auditPath, "utf8").split("\n").filter(Boolean) : []),
    outcomes: () => (existsSync(paths.auditPath) ? readFileSync(paths.auditPath, "utf8").split("\n").filter(Boolean).map((l) => l.split("\t")[3]) : []),
    stateText: () => (existsSync(paths.statePath) ? readFileSync(paths.statePath, "utf8") : null),
    writeState: (text: string) => writeFileSync(paths.statePath, text),
    /** Writes a PR record as the Necromancer does in real mode. */
    writeRecord: (limb: string, name: string, number: number, to = "1.0.1") => {
      mkdirSync(paths.prsDir, { recursive: true });
      const branch = `crypt/graft-${limb.toLowerCase()}-${to}`;
      writeFileSync(
        join(paths.prsDir, branch.replace(/\//g, "-") + ".json"),
        JSON.stringify({ branch, limb, ecosystem: "npm", name, from: "1.0.0", to, breaking: false, number, url: `https://example.invalid/pr/${number}` }),
      );
      return branch;
    },
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}
