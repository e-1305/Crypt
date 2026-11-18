// War Room core (Epic D4). The key property: a limb is healed only when a human merge is in the log.
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { readFileSync, readdirSync } from "node:fs";
import { numRuns } from "./runs.js";
import { REJECTION_LINE } from "../src/theatre/heal-events.js";
import { RAID_MS } from "../src/theatre/raid.js";
import { WAR_EVENT_TYPES, parseWarEvent, type WarEvent } from "../src/warroom/events.js";
import { bossHp, bossOrder, detailsFromPayloads, formatSla, reduce, reduceAll, sceneFrom, EMPTY_STATE, type WarLimb } from "../src/warroom/state.js";
import { badgesFor } from "../src/warroom/badges.js";
import { pollCycle, type HttpResult } from "../src/warroom/poll.js";
import { eventsFromCheckRuns, eventsFromPull, limbForBranch, pollPlan, rateLimitDecision } from "../src/warroom/github-events.js";
import { simulatedTimeline } from "../src/warroom/simulated.js";
import { recapFor } from "../src/warroom/recap.js";

const runs = numRuns(200);
const LIMBS: WarLimb[] = [
  { ecosystem: "npm", name: "jquery", state: "Possessed", kev: true, epss: 0.9 },
  { ecosystem: "npm", name: "lodash", state: "Rotting", kev: false, epss: 0.2 },
  { ecosystem: "npm", name: "minimist", state: "Rotting", kev: false, epss: 0.05 },
];
const KEYS = ["npm:jquery", "npm:lodash", "npm:minimist"];
const ev = fc.record(
  {
    type: fc.constantFrom(...WAR_EVENT_TYPES),
    limb: fc.constantFrom(...KEYS),
    pr: fc.integer({ min: 1, max: 3 }),
    at: fc.integer({ min: 0, max: 100_000 }),
    healedBy: fc.constantFrom("Maya", "Ola"),
  },
  { requiredKeys: ["type", "limb", "at"] },
) as fc.Arbitrary<WarEvent>;
const evs = fc.array(ev, { maxLength: 25 });
const healedKeys = (events: WarEvent[]) => sceneFrom(events, LIMBS, 200_000).limbs.filter((l) => l.phase === "healed").map((l) => l.key).sort();
const mergedKeys = (events: WarEvent[]) => [...new Set(events.filter((e) => e.type === "human-merged").map((e) => e.limb))].sort();

describe("healed means a human merged", () => {
  it("property: healed iff a human-merged event exists, for any order, duplicates and interleaving", () => {
    fc.assert(fc.property(evs, fc.nat(5), (events, dup) => {
      const messy = [...events, ...events.slice(0, dup)].reverse();
      expect(healedKeys(messy)).toEqual(mergedKeys(events));
    }), { numRuns: runs });
  });
  it("property: without human-merged events nothing is healed", () => {
    fc.assert(fc.property(evs, (events) => {
      expect(healedKeys(events.filter((e) => e.type !== "human-merged"))).toEqual([]);
    }), { numRuns: runs });
  });
  it("ci-green alone never heals, and ci-red after a merge does not un-heal", () => {
    const green = { type: "ci-green", limb: "npm:jquery", pr: 1, at: 5 };
    expect(healedKeys([green as WarEvent])).toEqual([]);
    const merged = { type: "human-merged", limb: "npm:jquery", pr: 1, at: 6 };
    const red = { type: "ci-red", limb: "npm:jquery", pr: 1, at: 9 };
    expect(healedKeys([green, merged, red] as WarEvent[])).toEqual(["npm:jquery"]);
  });
});

describe("reduce", () => {
  it("property: order-insensitive and idempotent under duplicates", () => {
    fc.assert(fc.property(evs, (events) => {
      const a = reduceAll(events);
      expect(reduceAll([...events].reverse())).toEqual(a);
      expect(reduceAll([...events, ...events], a)).toEqual(a);
      expect(sceneFrom(a, LIMBS, 1e6)).toEqual(sceneFrom([...events, ...events].reverse(), LIMBS, 1e6));
    }), { numRuns: runs });
  });
  it("red CI convulses with the rejection line and the limb stays not healed", () => {
    const s = sceneFrom([{ type: "ci-red", limb: "npm:lodash", pr: 2, at: 10 }], LIMBS, 20);
    expect(s.effects).toEqual([{ kind: "convulse", limb: "npm:lodash", at: 10, line: REJECTION_LINE }]);
    expect(s.limbs.find((l) => l.key === "npm:lodash")?.phase).toBe("ci-red");
    expect(s.feed[0]).toContain(REJECTION_LINE);
  });
  it("a human merge heals with thunder, scores the risk and starts a combo", () => {
    const s = sceneFrom([{ type: "human-merged", limb: "npm:jquery", pr: 1, at: 10, healedBy: "Maya" }], LIMBS, 20);
    expect(s.effects[0]).toMatchObject({ kind: "heal", thunder: true });
    expect(s.score).toBeCloseTo(0.9 * 3);
    expect(s.combo.chain).toBe(1);
    expect(s.feed[0]).toBe("jquery healed by Maya (PR #1).");
  });
  it("countdown runs from 15:00 and never below zero", () => {
    expect(sceneFrom([], LIMBS, 5, { raidStart: 5 }).clock).toBe("15:00");
    const late = sceneFrom([], LIMBS, RAID_MS * 3, { raidStart: 0 });
    expect(late.remainingMs).toBe(0);
    expect(late.clock).toBe("00:00");
  });
});

describe("boss bars", () => {
  it("property: HP is clamped to 0..1 and monotonic in EPSS", () => {
    fc.assert(fc.property(fc.double({ noNaN: true, noDefaultInfinity: true }), fc.double({ noNaN: true, noDefaultInfinity: true }), fc.double({ noNaN: true, noDefaultInfinity: true }), (a, b, x) => {
      const lo = Math.min(a, b), hi = Math.max(a, b);
      expect(bossHp(lo, x)).toBeLessThanOrEqual(bossHp(hi, x));
      const h = bossHp(a, x);
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThanOrEqual(1);
    }), { numRuns: runs });
  });
  it("missing or invalid inputs are full HP", () => {
    expect(bossHp(undefined, undefined)).toBe(1);
    expect(bossHp("x", NaN)).toBe(1);
  });
  it("property: KEV outranks non-KEV in the boss order", () => {
    const l = fc.record({ ecosystem: fc.constant("npm"), name: fc.stringMatching(/^[a-z]{1,6}$/), kev: fc.boolean(), epss: fc.double({ min: 0, max: 1, noNaN: true }) });
    fc.assert(fc.property(fc.array(l, { maxLength: 10 }), (limbs) => {
      const kinds = bossOrder(limbs).map((x) => x.kev);
      const firstPlain = kinds.indexOf(false);
      if (firstPlain >= 0) expect(kinds.slice(firstPlain).every((k) => !k)).toBe(true);
    }), { numRuns: runs });
  });
  it("a healed boss has 0 HP", () => {
    const s = sceneFrom([{ type: "human-merged", limb: "npm:jquery", at: 1 }], LIMBS, 2);
    expect(s.bosses).toEqual([{ key: "npm:jquery", name: "jquery", hp: 0, healed: true }]);
  });
});

describe("malformed events", () => {
  it("property: anything that is not a well-formed event changes nothing", () => {
    fc.assert(fc.property(fc.anything(), (raw) => {
      if (parseWarEvent(raw) === null) expect(reduce(EMPTY_STATE, raw)).toBe(EMPTY_STATE);
    }), { numRuns: runs });
  });
  it("rejects bad type, bad limb, bad time, bad pr", () => {
    for (const bad of [null, 3, [], {}, { type: "healed", limb: "npm:a", at: 1 }, { type: "ci-green", limb: "nope", at: 1 },
      { type: "ci-green", limb: "npm:a", at: -1 }, { type: "ci-green", limb: "npm:a", at: NaN }, { type: "ci-green", limb: "npm:a", at: 1, pr: 0 }]) {
      expect(parseWarEvent(bad)).toBeNull();
    }
  });
  it("healedBy is kept only on human-merged", () => {
    expect(parseWarEvent({ type: "ci-green", limb: "npm:a", at: 1, healedBy: "Maya" })).not.toHaveProperty("healedBy");
    expect(parseWarEvent({ type: "human-merged", limb: "npm:a", at: 1, healedBy: "Maya" })).toHaveProperty("healedBy", "Maya");
  });
});

describe("blameless", () => {
  it("property: only 'healed by' lines carry a name and the scene has no per-person fields", () => {
    fc.assert(fc.property(evs, (events) => {
      const s = sceneFrom(events, LIMBS, 1e6);
      for (const line of s.feed) {
        if (/Maya|Ola/.test(line)) expect(line).toMatch(/ healed by (Maya|Ola)/);
      }
      expect(s.effects.every((e) => !/Maya|Ola/.test(JSON.stringify(e)))).toBe(true);
      expect(Object.keys(s).sort()).toEqual(["bosses", "cards", "clock", "combo", "effects", "feed", "healTimes", "healedCount", "limbs", "nights", "possessedOpen", "rejections", "remainingMs", "score", "simulated"]);
    }), { numRuns: runs });
  });
});

describe("badges and recap", () => {
  it("First Blood needs a healed KEV limb, Night Shift needs 3 heals", () => {
    const none = sceneFrom([], LIMBS, 10);
    expect(badgesFor(none, LIMBS, 10, 0).map((b) => b.earned).slice(0, 2)).toEqual([false, false]);
    const all = sceneFrom(KEYS.map((limb, i) => ({ type: "human-merged", limb, at: i + 1 })), LIMBS, 10);
    expect(badgesFor(all, LIMBS, 10, 0).map((b) => b.earned).slice(0, 2)).toEqual([true, true]);
  });
  it("Nights Without Possession: 7 after a week without a breach", () => {
    const week = 7 * 86400000;
    const s = sceneFrom([], LIMBS, week + 1);
    expect(badgesFor(s, [{ ...LIMBS[1] }], week + 1, 0)[2].earned).toBe(true);
    expect(badgesFor(s, [{ ...LIMBS[0], detectedAt: 0 }], week + 1, 0)[2].earned).toBe(false);
  });
  it("recap reuses the raid card", () => {
    const s = sceneFrom([{ type: "human-merged", limb: "npm:jquery", at: 1 }], LIMBS, 60_001, { raidStart: 1 });
    const c = recapFor(s, LIMBS, "crypt-demo");
    expect(c).toMatchObject({ title: "CRYPT RAID", repo: "crypt-demo", limbsHealed: 1, time: "01:00" });
  });
});

describe("github adapter", () => {
  const pull = { number: 7, created_at: "2025-11-20T10:00:00Z", merged_at: "2025-11-20T11:00:00Z", merged_by: { login: "maya" }, head: { ref: "crypt/graft-jquery-3.5.0", sha: "abc1234" } };
  it("maps a merged pull request to pr-opened and human-merged", () => {
    const e = eventsFromPull(pull, LIMBS);
    expect(e.map((x) => x.type)).toEqual(["pr-opened", "human-merged"]);
    expect(e[1]).toMatchObject({ limb: "npm:jquery", pr: 7, healedBy: "maya", source: "live" });
  });
  it("ignores other branches and junk", () => {
    expect(eventsFromPull({ ...pull, head: { ref: "feature/x" } }, LIMBS)).toEqual([]);
    expect(eventsFromPull(null, LIMBS)).toEqual([]);
    expect(eventsFromPull({ ...pull, number: "7" }, LIMBS)).toEqual([]);
    expect(limbForBranch("crypt/graft-unknown-1.0.0", LIMBS)).toBeNull();
  });
  it("a merge by a bot account does not heal", () => {
    const e = eventsFromPull({ ...pull, merged_by: { login: "dependabot[bot]", type: "Bot" } }, LIMBS);
    expect(e.map((x) => x.type)).toEqual(["pr-opened"]);
    expect(healedKeys(e)).toEqual([]);
  });
  it("a merge with no merged_by (list payload shape) does not heal", () => {
    const { merged_by: _drop, ...listShaped } = pull;
    const e = eventsFromPull(listShaped, LIMBS);
    expect(e.map((x) => x.type)).toEqual(["pr-opened"]);
    expect(eventsFromPull({ ...pull, merged_by: { login: "ci[bot]" } }, LIMBS).map((x) => x.type)).toEqual(["pr-opened"]);
    expect(eventsFromPull({ ...pull, merged_by: null }, LIMBS).map((x) => x.type)).toEqual(["pr-opened"]);
  });
  it("an open pull request alone never heals", () => {
    const e = eventsFromPull({ ...pull, merged_at: null }, LIMBS);
    expect(healedKeys(e)).toEqual([]);
  });
  it("check runs: any failure is red, unfinished is running, all success is green", () => {
    const t = (runs: unknown[]) => eventsFromCheckRuns({ check_runs: runs }, "npm:jquery", 7, 5).map((e) => e.type);
    expect(t([{ status: "completed", conclusion: "success" }])).toEqual(["ci-green"]);
    expect(t([{ status: "completed", conclusion: "success" }, { status: "completed", conclusion: "failure" }])).toEqual(["ci-red"]);
    expect(t([{ status: "in_progress", conclusion: null }])).toEqual(["ci-running"]);
    expect(t([])).toEqual([]);
  });
  it("property: with remaining 0 the delay never ends before the reset time", () => {
    fc.assert(fc.property(fc.integer({ min: 0, max: 1e9 }), fc.integer({ min: 0, max: 1e5 }), fc.boolean(), (now, ahead, authed) => {
      const reset = Math.floor(now / 1000) + ahead;
      const d = rateLimitDecision({ "x-ratelimit-remaining": "0", "x-ratelimit-reset": String(reset) }, now, authed);
      expect(now + d.delayMs).toBeGreaterThanOrEqual(reset * 1000);
      expect(d.limited).toBe(true);
    }), { numRuns: runs });
  });
  it("honours retry-after, backs off without headers and polls anonymous slower", () => {
    expect(rateLimitDecision({ "retry-after": "120" }, 0, true).delayMs).toBeGreaterThanOrEqual(120_000);
    expect(rateLimitDecision({}, 0, true).delayMs).toBeGreaterThanOrEqual(70_000);
    expect(rateLimitDecision(new Headers({ "x-ratelimit-remaining": "50" }), 0, false).delayMs).toBeGreaterThanOrEqual(70_000);
    expect(rateLimitDecision(new Headers({ "x-ratelimit-remaining": "50" }), 0, true).delayMs).toBeLessThan(70_000);
  });
  it("property: every planned request is a GET to a /repos/ path", () => {
    fc.assert(fc.property(fc.string(), fc.option(fc.string(), { nil: undefined }), (repo, token) => {
      for (const r of pollPlan(repo, token)) {
        expect(r.method).toBe("GET");
        expect(r.url.startsWith("/repos/")).toBe(true);
        expect(r.url).not.toContain("..");
      }
    }), { numRuns: runs });
    expect(pollPlan("e-1305/crypt-demo", "tok")[0].headers.authorization).toBe("Bearer tok");
    expect(pollPlan("../etc")).toEqual([]);
  });
});

describe("simulated mode", () => {
  const t = simulatedTimeline(LIMBS, 1000);
  it("is deterministic, tagged simulated, with one red CI and one human merge", () => {
    expect(simulatedTimeline(LIMBS, 1000)).toEqual(t);
    expect(t.every((e) => e.source === "simulated")).toBe(true);
    expect(t.filter((e) => e.type === "ci-red")).toHaveLength(1);
    expect(t.filter((e) => e.type === "human-merged")).toHaveLength(1);
    const s = sceneFrom(t, LIMBS, 1000 + 60_000);
    expect(s.simulated).toBe(true);
    expect(s.feed.every((l) => l.startsWith("[SIMULATED CI]"))).toBe(true);
    expect(s.limbs.map((l) => l.phase)).toEqual(["healed", "ci-red", "rotting"]);
  });
  it("yields nothing on a bad start time", () => {
    expect(simulatedTimeline(LIMBS, NaN)).toEqual([]);
  });
});

describe("static: src/warroom", () => {
  const dir = new URL("../src/warroom/", import.meta.url);
  const files = readdirSync(dir).filter((f) => f.endsWith(".ts"));
  const text = files.map((f) => readFileSync(new URL(f, dir), "utf8")).join("\n");
  it("has files to scan", () => expect(files.length).toBeGreaterThanOrEqual(6));
  it("has no merge call or endpoint and no non-GET method", () => {
    expect(text).not.toMatch(/\bmerge\w*\s*\(/i);
    expect(text).not.toMatch(/\/merge\b|auto[-_ ]?merge|merge_method/i);
    expect(text).not.toMatch(/["'`](POST|PUT|PATCH|DELETE)["'`]/);
    expect(text).not.toMatch(/method\s*:\s*["'](?!GET)/);
    expect(text).not.toMatch(/\bgit blame\b|\bblame\b/i);
  });
  it("never touches storage or the network", () => {
    expect(text).not.toMatch(/localStorage|sessionStorage|document\.cookie|\bcookie\b|XMLHttpRequest|\bfetch\s*\(|node:fs|Date\.now|Math\.random|new Date\(\)/);
  });
});

describe("poll cycle", () => {
  const T0 = Date.parse("2025-11-20T09:00:00Z");
  // Shaped like GET /repos/{o}/{r}/pulls items: merged_at but no merged_by.
  const listItem = (n: number, ref: string, mergedAt: string | null, state = "closed") => ({ number: n, state, created_at: "2025-11-20T10:00:00Z", merged_at: mergedAt, head: { ref, sha: "abc1234" } });
  const ok = (body: unknown): HttpResult => ({ ok: true, status: 200, headers: { "x-ratelimit-remaining": "50", "x-ratelimit-reset": "9999999999" }, body });
  const fake = (routes: Record<string, HttpResult>, stale: () => boolean = () => false) => {
    const urls: string[] = [];
    return {
      urls,
      deps: {
        getJson: async (req: { method: string; url: string }) => { urls.push(req.method + " " + req.url); return routes[req.url] ?? { ok: false, status: 404, headers: {}, body: null }; },
        isStale: stale,
        now: () => T0,
      },
    };
  };
  const input = { repos: ["o/r"], limbs: LIMBS, token: "", t0: T0 };
  const LIST = "/repos/o/r/pulls?state=all&per_page=30&sort=updated";

  it("heals only after the single-pull response names a human merger", async () => {
    const f = fake({ [LIST]: ok([listItem(7, "crypt/graft-jquery-3.5.0", "2025-11-20T11:00:00Z")]), "/repos/o/r/pulls/7": ok({ merged_by: { login: "maya", type: "User" } }) });
    const r = await pollCycle(input, f.deps);
    if (r.stale) throw new Error("stale");
    expect(healedKeys(r.events)).toEqual(["npm:jquery"]);
    expect(f.urls.every((u) => u.startsWith("GET "))).toBe(true);
  });
  it("a bot merge, a failed detail request or no detail leaves the limb unhealed", async () => {
    const list = ok([listItem(7, "crypt/graft-jquery-3.5.0", "2025-11-20T11:00:00Z")]);
    for (const detail of [ok({ merged_by: { login: "dependabot[bot]", type: "Bot" } }), ok({}), { ok: false, status: 500, headers: {}, body: null }]) {
      const r = await pollCycle(input, fake({ [LIST]: list, "/repos/o/r/pulls/7": detail }).deps);
      if (r.stale) throw new Error("stale");
      expect(healedKeys(r.events)).toEqual([]);
      expect(r.events.map((e) => e.type)).toEqual(["pr-opened"]);
    }
  });
  it("skips pull requests merged before the raid started", async () => {
    const f = fake({ [LIST]: ok([listItem(7, "crypt/graft-jquery-3.5.0", "2025-11-20T08:00:00Z")]) });
    const r = await pollCycle(input, f.deps);
    if (r.stale) throw new Error("stale");
    expect(r.events).toEqual([]);
  });
  it("drops the result when a mode switch happens during any request", async () => {
    const routes = { [LIST]: ok([listItem(7, "crypt/graft-jquery-3.5.0", "2025-11-20T11:00:00Z"), listItem(8, "crypt/graft-lodash-4.17.21", null, "open")]), "/repos/o/r/pulls/7": ok({ merged_by: { login: "maya" } }) };
    for (let flipAt = 1; flipAt <= 2; flipAt++) {
      let calls = 0;
      const f = fake(routes);
      const deps = { ...f.deps, getJson: async (req: { method: string; url: string }) => { calls++; return f.deps.getJson(req); }, isStale: () => calls >= flipAt };
      expect(await pollCycle(input, deps)).toEqual({ stale: true });
    }
  });
  it("reports an http error without events", async () => {
    const r = await pollCycle(input, fake({}).deps);
    expect(r).toMatchObject({ stale: false, events: [], error: { repo: "o/r", status: 404 } });
  });
});

describe("rejection belongs to its limb", () => {
  const red = { type: "ci-red", limb: "npm:lodash", pr: 2, at: 10 } as const;
  const active = (events: unknown[], now = 100) => sceneFrom(events, LIMBS, now).rejections;
  it("is active while the limb has no later event and nothing healed after it", () => {
    expect(active([red])).toEqual([{ limb: "npm:lodash", name: "lodash", at: 10, line: REJECTION_LINE }]);
    expect(active([red, { type: "human-merged", limb: "npm:jquery", at: 5 }])).toHaveLength(1);
  });
  it("clears on the same limb's next event", () => {
    for (const type of ["pr-opened", "ci-running", "ci-green", "human-merged"]) expect(active([red, { type, limb: "npm:lodash", at: 20 }])).toEqual([]);
  });
  it("clears after a heal elsewhere, and the feed keeps the history", () => {
    const s = sceneFrom([red, { type: "human-merged", limb: "npm:jquery", at: 20 }], LIMBS, 100);
    expect(s.rejections).toEqual([]);
    expect(s.feed.some((l) => l.includes(REJECTION_LINE))).toBe(true);
    expect(s.effects.some((e) => e.kind === "convulse")).toBe(true);
  });
  it("property: active rejections never depend on arrival order and never outlive their limb's red phase", () => {
    fc.assert(fc.property(evs, (events) => {
      const a = sceneFrom(events, LIMBS, 1e6);
      expect(sceneFrom([...events].reverse(), LIMBS, 1e6).rejections).toEqual(a.rejections);
      for (const r of a.rejections) expect(a.limbs.find((l) => l.key === r.limb)?.phase).toBe("ci-red");
    }), { numRuns: runs });
  });
});

describe("boss arena cards", () => {
  const T0 = 1_000_000;
  const rich: WarLimb[] = [
    { ecosystem: "npm", name: "jquery", state: "Possessed", kev: true, epss: 0.99215, owner: "@e-1305", vulns: [{ id: "GHSA-1", cves: ["CVE-1", "CVE-2"] }, { id: "GHSA-2", cves: ["CVE-2"] }, { id: "GHSA-3", cves: [] }] },
    { ecosystem: "npm", name: "lodash", state: "Rotting", kev: false, epss: 0.2 },
  ];
  it("lists only Possessed limbs with the card fields", () => {
    const s = sceneFrom([], rich, T0 + 1000, { slaStart: T0 });
    expect(s.cards).toHaveLength(1);
    expect(s.cards[0]).toMatchObject({ key: "npm:jquery", name: "jquery", cveCount: 3, kev: true, epss: 0.99215, owner: "@e-1305", healed: false, breached: false });
    expect(s.cards[0]!.hp).toBeCloseTo(0.99215);
    expect(s.possessedOpen).toBe(1);
  });
  it("counts down the 48h SLA from detectedAt or slaStart and stops at breached", () => {
    const h = 3600_000;
    expect(sceneFrom([], rich, T0 + 1000, { slaStart: T0 }).cards[0]!.sla).toBe("47:59:59");
    expect(sceneFrom([], [{ ...rich[0]!, detectedAt: T0 - 24 * h }], T0, { slaStart: T0 }).cards[0]!.sla).toBe("24:00:00");
    const late = sceneFrom([], rich, T0 + 49 * h, { slaStart: T0 }).cards[0]!;
    expect(late).toMatchObject({ slaMs: 0, sla: "SLA breached", breached: true });
    expect(formatSla(48 * h)).toBe("48:00:00");
  });
  it("falls back to unowned and unknown CVEs, and takes details from payload bodies", () => {
    const bare = sceneFrom([], LIMBS, 10).cards[0]!;
    expect(bare).toMatchObject({ cveCount: null, owner: "unowned" });
    const details = detailsFromPayloads({ JQUERY: { body: "Limb: JQUERY (jquery)\nCVEs: CVE-2020-1, CVE-2020-2\nOwner: @team-a\n" } });
    expect(sceneFrom([], LIMBS, 10, { details }).cards[0]).toMatchObject({ cveCount: 2, owner: "@team-a" });
    expect(detailsFromPayloads(null)).toEqual({});
  });
  it("heals the card, shows the empty state and counts nights", () => {
    const day = 86400000;
    const s = sceneFrom([{ type: "human-merged", limb: "npm:jquery", at: T0 + 5 }], rich, T0 + 3 * day, { slaStart: T0 });
    expect(s.cards[0]).toMatchObject({ healed: true, hp: 0, sla: "HEALED" });
    expect(s.possessedOpen).toBe(0);
    expect(s.nights).toBe(3);
    expect(sceneFrom([], [rich[1]!], T0 + 2 * day, { slaStart: T0 })).toMatchObject({ cards: [], possessedOpen: 0, nights: 2 });
  });
  it("an open KEV limb past its SLA resets the nights to 0", () => {
    expect(sceneFrom([], rich, T0 + 5 * 86400000, { slaStart: T0 }).nights).toBe(0);
  });
  it("property: cards are order independent and carry no per-person field", () => {
    fc.assert(fc.property(evs, (events) => {
      const a = sceneFrom(events, rich, 1e6, { slaStart: 0 });
      expect(sceneFrom([...events].reverse(), rich, 1e6, { slaStart: 0 }).cards).toEqual(a.cards);
      expect(JSON.stringify(a.cards)).not.toMatch(/Maya|Ola|healedBy/);
    }), { numRuns: runs });
  });
});
