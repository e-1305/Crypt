import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import fc from "fast-check";
import { afterEach, describe, expect, it } from "vitest";
import { parseCli } from "../src/cli/parse.js";
import { buildDigest, DAY_MS } from "../src/gazette/digest.js";
import { buildSlackPayload, slackCode } from "../src/gazette/slack.js";
import { buildTeamsPayload } from "../src/gazette/teams.js";
import { spawnSync } from "node:child_process";
import { appendSnapshot, joinHistory, snapshotOf } from "../src/report/history.js";
import { sendGazette, type FetchLike } from "../src/gazette/send.js";
import { SAMPLE_INPUT } from "../src/report/sample.js";
import { DEFAULT_WAR_ROOM, gazetteCommand } from "../scripts/cli/gazette.js";
import { numRuns } from "./runs.js";

const SECRET = "https://hooks.slack.test/SENTINEL-SECRET-123";
const sampleDigest = () => buildDigest({ creature: SAMPLE_INPUT.creature, state: SAMPLE_INPUT.state, history: SAMPLE_INPUT.history, now: SAMPLE_INPUT.now, warRoomUrl: DEFAULT_WAR_ROOM });

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});
function workdir(creature: unknown = SAMPLE_INPUT.creature): string {
  const d = mkdtempSync(join(tmpdir(), "gazette-"));
  dirs.push(d);
  mkdirSync(join(d, "out"));
  writeFileSync(join(d, "out", "creature.json"), JSON.stringify(creature));
  return d;
}
async function run(argv: string[], cwd: string, fetchImpl?: FetchLike, env: Record<string, string | undefined> = { SLACK_WEBHOOK_URL: SECRET, TEAMS_WEBHOOK_URL: SECRET }) {
  let stdout = "";
  const code = await gazetteCommand(parseCli(["gazette", ...argv], env), { cwd, env, fetchImpl, now: () => SAMPLE_INPUT.now, out: (s) => void (stdout += s) });
  return { code, stdout };
}

describe("digest", () => {
  it("builds the sample digest", () => {
    const d = sampleDigest();
    expect(d.healed).toEqual([{ limb: "jquery", by: "e-1305" }, { limb: "minimist", by: "e-1305" }]);
    expect(d.nightsWithoutPossession).toBe(0);
    expect(d.slaAtRisk.map((l) => l.id)).toEqual(["HANDLEBARS"]);
    expect(d.newPossessed).toEqual([]);
  });
  it("counts whole nights since the last possessed raid", () => {
    const creature = { team: { scanStart: 0 }, limbs: [{ id: "A", name: "a", state: "Healthy" }] };
    const history = [{ at: 1000, possessed: 1, rotting: 0, healthy: 1, spawned: 0, healed: 0 }, { at: 1000 + DAY_MS, possessed: 0, rotting: 0, healthy: 2, spawned: 0, healed: 1 }];
    expect(buildDigest({ creature, state: {}, history, now: 1000 + 4.5 * DAY_MS }).nightsWithoutPossession).toBe(4);
  });
  it("names newly possessed limbs only against a snapshot of ids", () => {
    const creature = { limbs: [{ id: "A", name: "a", state: "Possessed" }, { id: "B", name: "b", state: "Possessed" }] };
    const h = [{ at: 1, possessed: 1, rotting: 0, healthy: 0, spawned: 0, healed: 0, possessedIds: ["A"] }];
    expect(buildDigest({ creature, state: {}, history: h, now: 5 }).newPossessed).toEqual(["b"]);
    expect(buildDigest({ creature, state: {}, now: 5 }).newPossessed).toEqual([]);
  });
  it("does not praise limbs already healed in the previous raid", () => {
    const l = { id: "A", name: "a", state: "Healthy", healed: true, healedBy: "x" };
    expect(buildDigest({ creature: { limbs: [l] }, previousCreature: { limbs: [l] }, state: {}, now: 1 }).healed).toEqual([]);
  });
  it("survives junk", () => {
    expect(buildDigest({ creature: 5, state: "x", history: 3, now: NaN }).healed).toEqual([]);
  });
});

describe("payloads", () => {
  it("slack matches the snapshot", () => expect(JSON.stringify(buildSlackPayload(sampleDigest()), null, 2)).toMatchSnapshot());
  it("teams matches the snapshot", () => expect(JSON.stringify(buildTeamsPayload(sampleDigest()), null, 2)).toMatchSnapshot());
  it("slack has a header and the War Room button", () => {
    const b = buildSlackPayload(sampleDigest()).blocks as { type: string; elements?: { text: { text: string } }[] }[];
    expect(b[0]!.type).toBe("header");
    expect(b.at(-1)!.elements![0]!.text.text).toBe("Open the War Room");
  });
  it("teams is an adaptive card 1.4 message", () => {
    const p = buildTeamsPayload(sampleDigest()) as { type: string; attachments: { contentType: string; content: { version: string } }[] };
    expect(p.type).toBe("message");
    expect(p.attachments[0]!.contentType).toBe("application/vnd.microsoft.card.adaptive");
    expect(p.attachments[0]!.content.version).toBe("1.4");
  });
  it("package names with special characters keep both payloads valid JSON", () => {
    fc.assert(
      fc.property(fc.string(), (name) => {
        const d = buildDigest({ creature: { limbs: [{ id: "A", name, state: "Possessed", healed: false }, { id: "B", name, state: "Healthy", healed: true }] }, state: {}, history: [{ at: 1, possessed: 0, rotting: 0, healthy: 0, spawned: 0, healed: 0, possessedIds: [] }], now: 5 });
        for (const p of [buildSlackPayload(d), buildTeamsPayload(d)]) expect(JSON.parse(JSON.stringify(p))).toEqual(p);
        expect(slackCode(name)).toMatch(/^`[^`]*`$/);
        expect(slackCode(name).slice(1, -1)).not.toMatch(/[<>]|&(?!amp;|lt;|gt;)/);
      }),
      { numRuns: numRuns(100) },
    );
  });
});

describe("parse", () => {
  it("accepts the two webhook variable names", () => {
    expect(parseCli(["gazette", "--webhook-env", "SLACK_WEBHOOK_URL"]).flags["webhook-env"]).toBe("SLACK_WEBHOOK_URL");
    expect(parseCli(["gazette", "--webhook-env=TEAMS_WEBHOOK_URL", "--send"]).flags.send).toBe(true);
  });
  it.each([
    [["--webhook-env", "PATH"]],
    [["--send"]],
    [["--send", "--dry-run", "--webhook-env", "SLACK_WEBHOOK_URL"]],
    [["--war-room", "http://x.test"]],
    [["--war-room", "not a url"]],
    [["--format", "email"]],
    [["--format", "teams", "--webhook-env", "SLACK_WEBHOOK_URL"]],
    [["--send", "--sample", "--webhook-env", "SLACK_WEBHOOK_URL"]],
  ])("rejects %j", (argv) => {
    expect(() => parseCli(["gazette", ...argv])).toThrow();
  });
});

describe("gazette command", () => {
  it("prints a Block Kit payload and never the secret", async () => {
    const r = await run(["--sample", "--webhook-env", "SLACK_WEBHOOK_URL"], workdir());
    expect(JSON.parse(r.stdout).blocks).toBeDefined();
    expect(r.stdout).not.toContain("SENTINEL");
  });
  it("prints an Adaptive Card for Teams", async () => {
    const r = await run(["--sample", "--webhook-env", "TEAMS_WEBHOOK_URL"], workdir());
    expect(JSON.parse(r.stdout).attachments[0].content.type).toBe("AdaptiveCard");
    expect(r.stdout).not.toContain("SENTINEL");
  });
  it("posts exactly once to the webhook, and audits without the URL", async () => {
    const d = workdir();
    const calls: string[] = [];
    const f: FetchLike = async (u) => (calls.push(u), { ok: true, status: 200 });
    const r = await run(["--webhook-env", "SLACK_WEBHOOK_URL", "--send"], d, f);
    expect(calls).toEqual([SECRET]);
    expect(r.stdout).not.toContain("SENTINEL");
    const log = readFileSync(join(d, "crypt-audit.log"), "utf8");
    expect(log).toMatch(/\tGAZETTE\t-\tAPI_CALL\t-\n$/);
    expect(log).not.toContain("SENTINEL");
  });
  it("a sealed crypt sends nothing", async () => {
    const d = workdir();
    writeFileSync(join(d, ".crypt-seal"), "");
    let n = 0;
    const r = await run(["--webhook-env", "SLACK_WEBHOOK_URL", "--send"], d, async () => (n++, { ok: true, status: 200 }));
    expect(n).toBe(0);
    expect(r.code).toBe(0);
    expect(readFileSync(join(d, "crypt-audit.log"), "utf8")).toContain("REJECTED_SEALED");
  });
  it("names the missing variable, not a value", async () => {
    await expect(run(["--webhook-env", "SLACK_WEBHOOK_URL", "--send"], workdir(), undefined, {})).rejects.toThrow(/SLACK_WEBHOOK_URL is not set/);
  });
  it("send failures never leak the URL", async () => {
    for (const f of [
      (async () => { throw new Error(`boom ${SECRET}`); }) as FetchLike,
      (async () => ({ ok: false, status: 500 })) as FetchLike,
    ]) {
      const d = workdir();
      const err = await run(["--webhook-env", "SLACK_WEBHOOK_URL", "--send"], d, f).catch((e: Error) => e);
      expect(err).toBeInstanceOf(Error);
      expect((err as Error).message).not.toContain("SENTINEL");
      expect(readFileSync(join(d, "crypt-audit.log"), "utf8")).toContain("\tERROR\t-");
    }
  });
  it("stops without a creature file", async () => {
    const d = workdir();
    rmSync(join(d, "out", "creature.json"));
    await expect(run([], d)).rejects.toThrow(/crypt raid/);
    expect(existsSync(join(d, "crypt-audit.log"))).toBe(false);
  });
});

describe("sendGazette", () => {
  it("rejects non-TLS URLs without calling fetch", async () => {
    let n = 0;
    await expect(sendGazette({ payload: {}, url: "http://x.test/SENTINEL", fetchImpl: async () => (n++, { ok: true, status: 200 }) })).rejects.toThrow(/TLS/);
    expect(n).toBe(0);
  });
  it("times out through the abort signal", async () => {
    const f: FetchLike = (_u, i) => new Promise((_res, rej) => i.signal.addEventListener("abort", () => rej(new Error(SECRET))));
    const err = await sendGazette({ payload: {}, url: SECRET, fetchImpl: f, timeoutMs: 5 }).catch((e: Error) => e);
    expect((err as Error).message).toMatch(/in time/);
    expect((err as Error).message).not.toContain("SENTINEL");
  });
});

it("sendGazette refuses redirects", async () => {
  let seen: unknown;
  await sendGazette({ payload: {}, url: SECRET, fetchImpl: async (_u, i) => ((seen = i.redirect), { ok: true, status: 200 }) });
  expect(seen).toBe("error");
});

describe("raid history kept by the report commands", () => {
  const creature = { counts: { spawned: 2 }, limbs: [{ id: "A", name: "a", state: "Possessed" }, { id: "B", name: "b", state: "Healthy", healed: true }, { id: "C", name: "c", state: "Rotting" }] };
  it("snapshots the creature", () => {
    expect(snapshotOf(creature, Date.UTC(2025, 0, 2))).toMatchObject({ possessed: 1, rotting: 1, healthy: 1, healed: 1, spawned: 2, possessedIds: ["A"] });
    expect(snapshotOf(5, 1)).toBeNull();
  });
  it("keeps one entry per day and drops junk", () => {
    const a = snapshotOf(creature, Date.UTC(2025, 0, 2, 1))!;
    const b = snapshotOf(creature, Date.UTC(2025, 0, 2, 20))!;
    const c = snapshotOf(creature, Date.UTC(2025, 0, 3))!;
    expect(appendSnapshot(appendSnapshot(["junk", { at: "x" }], a), b)).toEqual([b]);
    expect(appendSnapshot([b], c)).toEqual([b, c]);
    expect(joinHistory([1], [2])).toEqual([1, 2]);
  });
  it("gazette builds the history across runs and names newly possessed limbs", async () => {
    const d = workdir(creature);
    await run([], d);
    const next = { limbs: [...creature.limbs, { id: "D", name: "d", state: "Possessed" }] };
    writeFileSync(join(d, "out", "creature.json"), JSON.stringify(next));
    let stdout = "";
    const env = {};
    await gazetteCommand(parseCli(["gazette"], env), { cwd: d, env, now: () => SAMPLE_INPUT.now + 2 * DAY_MS, out: (s) => void (stdout += s) });
    expect(stdout).toContain("d");
    const h = JSON.parse(readFileSync(join(d, "out", "autopsy-history.json"), "utf8")) as unknown[];
    expect(h).toHaveLength(2);
  });
});

describe("crypt gazette through main.ts", () => {
  it("a failed send leaks the URL in neither stdout nor stderr", () => {
    const d = workdir();
    const url = "https://127.0.0.1:9/SENTINEL-SECRET-123";
    const r = spawnSync(process.execPath, [join(process.cwd(), "bin", "crypt.mjs"), "gazette", "--webhook-env", "SLACK_WEBHOOK_URL", "--send"], { cwd: d, env: { ...process.env, SLACK_WEBHOOK_URL: url }, encoding: "utf8", timeout: 60_000 });
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/gazette not sent/);
    expect(r.stdout + r.stderr).not.toContain("SENTINEL");
    expect(readFileSync(join(d, "crypt-audit.log"), "utf8")).not.toContain("SENTINEL");
  });
});
