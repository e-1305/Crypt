import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  HOUR_MS,
  KEV_WEIGHT,
  buildTomb,
  buildTombs,
  filterTombs,
  fromExhume,
  fromSnapshot,
  glowOf,
  layoutTombs,
  limbRisk,
  ownerTeams,
  parseGraveyard,
  serializeGraveyard,
  sizeOf,
  slaState,
  sortTombs,
  type LimbRecord,
  type RepoRecord,
} from "../src/graveyard/model.js";
import { SAMPLE_NOW, SAMPLE_REPOS, SAMPLE_SCANNED_AT } from "../src/graveyard/sample.js";
import { numRuns } from "./runs.js";

const T0 = 1_000_000_000_000;
const limb = (o: Partial<LimbRecord> = {}): LimbRecord => ({ name: "lodash", state: "Rotting", kev: false, epss: 0.02, owner: "@o/team", ...o });
const repo = (o: Partial<RepoRecord> = {}): RepoRecord => ({ repo: "o/a", scannedAt: T0, scannedLimbs: 10, ownersKnown: true, limbs: [], ...o });

describe("risk, glow, size", () => {
  it("KEV outranks non-KEV and risk is monotonic in EPSS", () => {
    expect(limbRisk({ kev: true, epss: 0.5 })).toBe(KEV_WEIGHT * 0.5);
    expect(limbRisk({ kev: true, epss: 0.02 })).toBeGreaterThan(limbRisk({ kev: false, epss: 0.02 }));
    fc.assert(
      fc.property(fc.double({ min: 0, max: 1, noNaN: true }), fc.double({ min: 0, max: 1, noNaN: true }), fc.boolean(), (a, b, kev) => {
        const [lo, hi] = a <= b ? [a, b] : [b, a];
        return limbRisk({ kev, epss: lo }) <= limbRisk({ kev, epss: hi });
      }),
      { numRuns: numRuns(200) },
    );
  });
  it("maps possessed count to glow and limb count to size", () => {
    expect([0, 1, 2, 3, 4, 50].map(glowOf)).toEqual([0, 1, 2, 2, 3, 3]);
    expect([0, 49, 50, 199, 200, 799, 800].map(sizeOf)).toEqual(["small", "small", "medium", "medium", "large", "large", "huge"]);
  });
});

describe("SLA states (sla-policy.md)", () => {
  const possessed = [limb({ state: "Possessed", kev: true, epss: 0.9 })];
  const sprint = [limb({ epss: 0.2 })];
  it("Possessed has 48 hours, at risk from 75%", () => {
    expect(slaState(possessed, T0, T0 + 35 * HOUR_MS)).toBe("ok");
    expect(slaState(possessed, T0, T0 + 36 * HOUR_MS)).toBe("at-risk");
    expect(slaState(possessed, T0, T0 + 48 * HOUR_MS)).toBe("breached");
  });
  it("EPSS >= 0.1 has 14 days", () => {
    expect(slaState(sprint, T0, T0 + 10 * 24 * HOUR_MS)).toBe("ok");
    expect(slaState(sprint, T0, T0 + 11 * 24 * HOUR_MS)).toBe("at-risk");
    expect(slaState(sprint, T0, T0 + 14 * 24 * HOUR_MS)).toBe("breached");
  });
  it("backlog findings have no SLA", () => {
    expect(slaState([limb({ epss: 0.099 })], T0, T0 + 900 * 24 * HOUR_MS)).toBe("ok");
  });
  it("junk times never throw", () => {
    expect(slaState(possessed, NaN, Infinity)).toBe("ok");
  });
});

describe("tomb", () => {
  it("counts ghosts, picks a team owner, never a person", () => {
    const t = buildTomb(repo({ limbs: [limb({ owner: "@o/team" }), limb({ owner: "@o/team" }), limb({ owner: "@alice" }), limb({ owner: "unowned" })] }), T0)!;
    expect(t.ghosts).toBe(2);
    expect(t.owner).toBe("@o/team");
    expect(JSON.stringify(t)).not.toContain("alice");
  });
  it("shows 'no owner yet' without a CODEOWNERS team", () => {
    expect(buildTomb(repo({ limbs: [limb({ owner: "unowned" })] }), T0)!.owner).toBe("no owner yet");
  });
  it("counts possessed and rotting and sums risk", () => {
    const t = buildTomb(repo({ limbs: [limb({ state: "Possessed", kev: true, epss: 0.5 }), limb({ epss: 0.04 })] }), T0)!;
    expect([t.possessed, t.rotting, t.findings, t.glow]).toEqual([1, 1, 2, 1]);
    expect(t.risk).toBe(5.04);
  });
  it("snapshots carry no owners, so no ghosts", () => {
    const r = fromSnapshot({ repo: "a/b", scannedLimbs: 300, limbs: [{ name: "x", state: "Rotting", kev: false, epss: 0.3 }, { name: "y", state: "Healthy" }] }, T0)!;
    expect(r.ownersKnown).toBe(false);
    expect(r.limbs).toHaveLength(1);
    const t = buildTomb(r, T0)!;
    expect([t.ghosts, t.owner, t.size]).toEqual([0, "no owner yet", "large"]);
  });
  it("builds from an exhume result and counts healthy copies", () => {
    const r = fromExhume({ repo: "a/b", limbs: [{ name: "x", state: "Possessed", owner: "@a/t", kev: true, epss: 0.9 }, { name: "y", state: "Healthy", owner: "unowned" }] }, T0)!;
    expect([r.scannedLimbs, r.limbs.length, r.limbs[0]!.owner]).toEqual([2, 1, "@a/t"]);
  });
});

describe("sorting and filtering", () => {
  const tombs = buildTombs(SAMPLE_REPOS, SAMPLE_NOW);
  it("default order is alphabetical", () => {
    expect(tombs.map((t) => t.repo)).toEqual(["example-org/api", "example-org/docs", "example-org/mobile", "example-org/web"]);
  });
  it("sorts by the key the user picks without changing the input", () => {
    const copy = [...tombs];
    expect(sortTombs(tombs, "risk")[0]!.repo).toBe("example-org/web");
    expect(sortTombs(tombs, "sla")[0]!.sla).toBe("at-risk");
    expect(sortTombs(tombs, "owner").map((t) => t.owner)).toEqual([...tombs.map((t) => t.owner)].sort());
    expect(tombs).toEqual(copy);
  });
  it("filters by SLA state and owner team", () => {
    expect(filterTombs(tombs, { sla: "ok" }).map((t) => t.repo)).toEqual(["example-org/docs", "example-org/mobile"]);
    expect(filterTombs(tombs, { owner: "no owner yet" })).toHaveLength(1);
    expect(ownerTeams(tombs)).toEqual(["@example-org/mobile", "@example-org/platform", "@example-org/web", "no owner yet"]);
  });
  it("exports no ranking label", async () => {
    const m = await import("../src/graveyard/model.js");
    expect(Object.keys(m).filter((k) => /worst|rank|top/i.test(k))).toEqual([]);
  });
});

describe("graveyard.json", () => {
  it("round trips", () => {
    const text = serializeGraveyard({ source: "cli", org: "example-org", repos: SAMPLE_REPOS });
    const doc = parseGraveyard(text)!;
    expect(doc.repos).toHaveLength(4);
    expect(serializeGraveyard(doc)).toBe(text);
  });
  it("drops unknown keys and invalid records", () => {
    const doc = parseGraveyard(JSON.stringify({ schemaVersion: 1, secret: "x", repos: [{ ...repo(), author: "bob", limbs: [{ ...limb(), committer: "bob" }, { name: "" }] }, { repo: "bad" }, 5] }))!;
    expect(doc.repos).toHaveLength(1);
    expect(JSON.stringify(doc)).not.toMatch(/bob|secret/);
  });
  it("refuses other versions and junk", () => {
    expect(parseGraveyard("{")).toBeNull();
    expect(parseGraveyard(JSON.stringify({ schemaVersion: 2, repos: [] }))).toBeNull();
    expect(parseGraveyard(JSON.stringify({ schemaVersion: 1 }))).toBeNull();
  });
});

describe("layout", () => {
  const tombs = buildTombs(SAMPLE_REPOS, SAMPLE_NOW);
  it("is deterministic and inside the field", () => {
    const a = layoutTombs(tombs, 3);
    expect(layoutTombs(tombs, 3)).toEqual(a);
    for (const p of a) {
      expect(p.x).toBeGreaterThan(0);
      expect(p.x).toBeLessThan(1);
      expect(p.y).toBeGreaterThan(0);
      expect(p.y).toBeLessThan(1);
    }
  });
  it("a tomb keeps its jitter when others change", () => {
    const [a] = layoutTombs(tombs.slice(0, 1), 3);
    const [b] = layoutTombs(tombs.slice(0, 2), 3);
    expect(a).toEqual(b);
  });
});

describe("properties", () => {
  const person = fc.stringMatching(/^[a-z]{6,12}$/).filter((s) => !["lodash", "unowned", "repos"].includes(s));
  it("never throws on junk, is alphabetical by default, and says nothing about a worst repo or a person", () => {
    fc.assert(
      fc.property(fc.array(fc.jsonValue(), { maxLength: 8 }), (junk) => {
        const tombs = buildTombs(junk, 0);
        return Array.isArray(tombs);
      }),
      { numRuns: numRuns(200) },
    );
    fc.assert(
      fc.property(
        fc.array(fc.tuple(fc.stringMatching(/^[a-z]{1,8}$/), fc.stringMatching(/^[a-z]{1,8}$/), fc.double({ min: 0, max: 1, noNaN: true }), fc.boolean(), person), { maxLength: 12 }),
        (rows) => {
          const records = rows.map(([o, n, epss, kev, who]) => repo({ repo: `${o}/${n}`, limbs: [limb({ epss, kev, state: kev ? "Possessed" : "Rotting", owner: `@${who}` })] }));
          const tombs = buildTombs(records, T0 + 40 * HOUR_MS);
          const names = tombs.map((t) => t.repo.toLowerCase());
          const sorted = [...names].sort();
          const text = JSON.stringify([tombs, sortTombs(tombs, "risk"), layoutTombs(tombs), serializeGraveyard({ source: "cli", repos: records })]);
          const sortedOk = JSON.stringify(names) === JSON.stringify(sorted);
          const noPerson = rows.every(([, , , , who]) => !JSON.stringify(tombs).includes(`@${who}`));
          return sortedOk && noPerson && !/worst/i.test(JSON.stringify([tombs, layoutTombs(tombs)])) && text.length > 0;
        },
      ),
      { numRuns: numRuns(200) },
    );
  });
  it("sample scan time stays at the documented 40 hours", () => {
    expect(SAMPLE_NOW - SAMPLE_SCANNED_AT).toBe(40 * HOUR_MS);
  });
});
