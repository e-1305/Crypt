// The full mocked raid: fake GitHub + fake registry + the real Necromancer, Inquisitor and Re-raiser.
// Shared by tests/live-raid.test.ts and scripts/check-live-raid.ts (npm run live-raid:check).
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { nodeIo } from "../src/common/io.js";
import { generate } from "../src/raise/generate.js";
import { renderPlate } from "../src/render/plate.js";
import { reraise } from "../src/reraise/index.js";
import { graft } from "../src/necromancer/index.js";
import { apiAuditHook } from "../scripts/live-audit.js";
import { handleLiveGraft } from "../scripts/cli/live-graft.js";
import { githubClient } from "../scripts/github-client.js";
import { livePreflight } from "../scripts/live-preflight.js";
import { npmRegistryClient } from "../scripts/registry-client.js";
import { makeAgentEnv } from "./agent-helpers.js";
import { REPO, TOKEN, demoFile, makeWorld } from "./live-helpers.js";

const LIMBS = [
  { name: "lodash", version: "4.17.15", fixed: "4.17.21" },
  { name: "jquery", version: "3.4.1", fixed: "3.5.0" },
];

/** Fake CI: runs the `test` check on a PR head by looking at what the commit changed in the smoke test. */
function ciFor(w: ReturnType<typeof makeWorld>, sha: string) {
  const c = w.commits.get(sha);
  const files = Object.fromEntries((w.trees.get(c?.tree ?? "") ?? []).map((t) => [t.path, w.blobs.get(t.sha)!]));
  const green = files["test/smoke.test.js"] === undefined || files["test/smoke.test.js"] === demoFile("smoke.test.js");
  return { name: "test", status: "completed", conclusion: green ? "success" : "failure" };
}

export function setup(sabotage = false) {
  const checkRuns: unknown[] = [];
  const w = makeWorld({ checkRuns });
  const env = makeAgentEnv(LIMBS);
  const audit = apiAuditHook(nodeIo, env.paths.auditPath, env.now);
  const client = githubClient({ repo: REPO, token: TOKEN, fetch: w.github, audit });
  const registry = npmRegistryClient({ fetch: w.registry, audit, secrets: [TOKEN] });
  const ctx = { ...env.ctxFor(client), client, registry, sabotage };
  const stdout: string[] = [];
  const out = { write: (s: string) => void stdout.push(s) };
  const session = { ...env.paths, io: nodeIo, client, now: env.now, sleep: async () => {}, timeoutMs: 40, intervalMs: 10 };
  return { w, env, audit, client, ctx, session, out, stdout, checkRuns };
}
export type Setup = ReturnType<typeof setup>;

/** One GRAFT as the session does it: the Necromancer opens the PR, CI runs, the Inquisitor watches. */
export async function graftAndWatch(s: Setup, limbName: string) {
  const limb = s.env.idOf(limbName);
  const r = await graft(s.ctx, s.env.request(limb, `graft-${limbName}.json`));
  if (!r.branch) return { limb, result: r, pr: undefined };
  const pr = s.w.prs.find((p) => p.head === r.branch)!;
  s.checkRuns.splice(0, s.checkRuns.length, ciFor(s.w, pr.sha));
  await handleLiveGraft(s.session, limb, r.branch, s.out);
  return { limb, result: r, pr };
}

export async function happyRaid() {
  const s = setup();
  await livePreflight({ repo: REPO, token: TOKEN, fetch: s.w.github, audit: s.audit, warn: (m) => s.stdout.push(m + "\n") });
  const lodash = await graftAndWatch(s, "lodash");
  const jquery = await graftAndWatch(s, "jquery");
  const outcomesBeforeMerge = s.env.outcomes();
  const stateBeforeMerge = s.env.stateText();
  s.w.land(lodash.pr!.number); // a person clicks "Merge pull request" on github.com
  s.w.land(jquery.pr!.number);
  const re = await reraise({ ...s.env.paths, io: nodeIo, client: s.client, now: s.env.now });
  const creature = JSON.parse(readFileSync(s.env.paths.creaturePath, "utf8"));
  const plate = renderPlate(creature, { repo: "crypt-demo" });
  return { s, lodash, jquery, outcomesBeforeMerge, stateBeforeMerge, re, creature, plate, generated: generate(creature) };
}

export async function sabotageRaid() {
  const s = setup(true);
  const a = await graftAndWatch(s, "lodash");
  return { s, ...a };
}

export async function sealedRaid() {
  const s = setup();
  s.env.seal();
  const r = await graft(s.ctx, s.env.request(s.env.idOf("lodash")));
  return { s, r };
}

/** Every file under a directory, concatenated. */
export function allText(dir: string): string {
  let t = "";
  const walk = (d: string) => {
    for (const f of readdirSync(d)) {
      const p = join(d, f);
      if (statSync(p).isDirectory()) walk(p);
      else t += readFileSync(p, "utf8");
    }
  };
  if (existsSync(dir)) walk(dir);
  return t;
}

/** The invariants over a recorded request log. Returns the violations. */
export function logViolations(s: Setup): string[] {
  const bad: string[] = [];
  for (const r of s.w.requests) {
    const line = `${r.method} ${r.path}`;
    if (/merge/i.test(r.path)) bad.push(`merge path: ${line}`);
    if (!["GET", "POST", "PATCH", "DELETE"].includes(r.method)) bad.push(`method: ${line}`);
    if (r.method === "PATCH" && !/\/git\/refs\/heads\/crypt\//.test(r.path)) bad.push(`PATCH outside crypt refs: ${line}`);
    if (r.method === "DELETE" && !/\/git\/refs\/heads\/crypt\//.test(r.path)) bad.push(`DELETE outside crypt refs: ${line}`);
    if (r.method === "POST" && !/\/(git\/(blobs|trees|commits|refs)|pulls)$/.test(r.path)) bad.push(`POST: ${line}`);
  }
  if (s.w.outside.length) bad.push(`requests outside the target repo: ${s.w.outside.join(", ")}`);
  const audited = s.env.audit().filter((l) => l.split("\t")[3] === "API_CALL").map((l) => l.split("\t")[4]);
  const sent = s.w.requests.map((r) => `${r.method} ${r.path}`);
  if (JSON.stringify(audited) !== JSON.stringify(sent)) bad.push(`audit log (${audited.length}) differs from requests (${sent.length})`);
  const everything = [s.stdout.join(""), allText(s.env.dir)].join("\n");
  if (everything.includes(TOKEN)) bad.push("the token appears in output, audit log or out files");
  return bad;
}
