import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  aggregate,
  appendLines,
  durationText,
  HISTORY_BRANCH,
  HISTORY_STATES,
  historyBranchAllowed,
  linesFromCreature,
  parseHistoryJsonl,
  parseHistoryLine,
  serializeHistoryJsonl,
  type HistoryLine,
} from "../src/report/limb-history.js";
import { buildAutopsy } from "../src/report/model.js";
import { renderAutopsyHtml, renderLimbHistoryHtml } from "../src/report/html.js";
import { SAMPLE_INPUT, sampleLimbHistory } from "../src/report/sample.js";

const ROOT = resolve(import.meta.dirname, "..");
const SEED = readFileSync(join(ROOT, "fixtures", "history", "crypt-demo-2026-11-18.jsonl"), "utf8");
const T0 = Date.UTC(2026, 10, 18, 18, 0, 0);
const H = 3_600_000;

const lineArb: fc.Arbitrary<HistoryLine> = fc.record({
  ts: fc.option(fc.integer({ min: 0, max: 40 }).map((h) => new Date(T0 + h * H).toISOString()), { nil: null }),
  limb: fc.constantFrom("A", "B", "C", "D", "E"),
  state: fc.constantFrom(...HISTORY_STATES),
  kev: fc.option(fc.boolean(), { nil: null }),
  epss: fc.option(fc.double({ min: 0, max: 1, noNaN: true }), { nil: null }),
  ownerTeam: fc.option(fc.constantFrom("@org/a", "@org/b"), { nil: null }),
  deadline: fc.option(fc.integer({ min: 0, max: 80 }).map((h) => new Date(T0 + h * H).toISOString()), { nil: null }),
  source: fc.constantFrom("real" as const, "sample" as const),
});

describe("aggregate: counts are consistent (property)", () => {
  it("per run, the state counts sum to the lines of that run, and the run lines plus undated equal the line count", () => {
    fc.assert(
      fc.property(fc.array(lineArb, { maxLength: 40 }), (lines) => {
        const a = aggregate(lines, T0 + 50 * H);
        for (const r of a.runs) {
          expect(r.possessed + r.rotting + r.healthy + r.landed + r.healed).toBe(r.lines);
          expect(r.open).toBe(r.possessed + r.rotting);
          expect(r.openKev).toBeLessThanOrEqual(r.open);
        }
        expect(a.runs.reduce((s, r) => s + r.lines, 0) + a.undated).toBe(a.lineCount);
        expect(a.lineCount).toBeLessThanOrEqual(lines.length);
      }),
    );
  });

  it("breaches are at most the limbs with a deadline, and open and healed limbs stay within the limb count", () => {
    fc.assert(
      fc.property(fc.array(lineArb, { maxLength: 40 }), (lines) => {
        const a = aggregate(lines, T0 + 50 * H);
        expect(a.deadlineBreaches.length).toBeLessThanOrEqual(a.limbsWithDeadline);
        expect(new Set(a.deadlineBreaches.map((b) => b.limb)).size).toBe(a.deadlineBreaches.length);
        const limbs = new Set(lines.map((l) => l.limb)).size;
        expect(a.healedLimbs + a.openLimbs).toBeLessThanOrEqual(limbs);
        expect(a.limbsWithDeadline).toBeLessThanOrEqual(limbs);
      }),
    );
  });

  it("mean time to heal is null iff no healed limb has known times", () => {
    fc.assert(
      fc.property(fc.array(lineArb, { maxLength: 40 }), (lines) => {
        const a = aggregate(lines, T0 + 50 * H);
        const healed = a.ageByLimb.filter((l) => l.state === "Healed").length;
        expect(a.healedLimbs).toBeGreaterThanOrEqual(healed);
        expect(a.healTimesKnown).toBeLessThanOrEqual(a.healedLimbs);
        expect(a.meanTimeToHealHours === null).toBe(a.healTimesKnown === 0);
        if (a.meanTimeToHealHours !== null) expect(a.meanTimeToHealHours).toBeGreaterThanOrEqual(0);
      }),
    );
  });

  it("with one line per limb the healed count is exactly the Healed lines", () => {
    fc.assert(
      fc.property(fc.array(lineArb, { maxLength: 5 }), (lines) => {
        const one = [...new Map(lines.map((l) => [l.limb, l])).values()];
        const a = aggregate(one, T0 + 50 * H);
        expect(a.healedLimbs).toBe(one.filter((l) => l.state === "Healed").length);
        expect(a.openLimbs).toBe(one.filter((l) => l.state === "Possessed" || l.state === "Rotting").length);
      }),
    );
  });

  it("is order independent", () => {
    fc.assert(
      fc.property(fc.array(lineArb, { maxLength: 30 }), fc.integer(), (lines, seed) => {
        const shuffled = [...lines].sort((a, b) => ((JSON.stringify(a).length * 31 + seed) % 7) - ((JSON.stringify(b).length * 17 + seed) % 7));
        const reversed = [...lines].reverse();
        const base = aggregate(lines, T0 + 50 * H);
        expect(aggregate(reversed, T0 + 50 * H)).toEqual(base);
        expect(aggregate(shuffled, T0 + 50 * H)).toEqual(base);
      }),
    );
  });

  it("junk input never throws", () => {
    fc.assert(
      fc.property(fc.array(fc.anything(), { maxLength: 20 }), fc.anything(), (junk, now) => {
        expect(() => aggregate(junk, now as number)).not.toThrow();
        expect(() => parseHistoryLine(junk)).not.toThrow();
      }),
    );
    fc.assert(
      fc.property(fc.string(), (text) => {
        expect(() => parseHistoryJsonl(text)).not.toThrow();
        expect(() => linesFromCreature(text, 0)).not.toThrow();
      }),
    );
    expect(aggregate(undefined as unknown as unknown[], NaN).lineCount).toBe(0);
  });

  it("round trips through JSONL", () => {
    fc.assert(
      fc.property(fc.array(lineArb, { maxLength: 20 }), (lines) => {
        const parsed = parseHistoryJsonl(serializeHistoryJsonl(lines));
        expect(parsed.length).toBe(lines.length);
        expect(aggregate(parsed, T0)).toEqual(aggregate(lines, T0));
      }),
    );
  });
});

describe("history lines", () => {
  it("keep exactly the fields ts, limb, state, kev, epss, ownerTeam, deadline and a source label", () => {
    const l = linesFromCreature({ limbs: [{ id: "LODASH", state: "Rotting", epss: 0.5, owner: "@org/platform" }] }, T0);
    expect(Object.keys(l[0]!)).toEqual(["ts", "limb", "state", "kev", "epss", "ownerTeam", "deadline", "source"]);
    expect(l[0]).toMatchObject({ limb: "LODASH", state: "Rotting", kev: null, epss: 0.5, ownerTeam: "@org/platform", source: "real" });
  });

  it("set the deadline from the SLA policy: KEV 48 hours, EPSS of 0.1 or more 14 days, else none", () => {
    const [kev, sprint, backlog, healthy] = linesFromCreature(
      { limbs: [{ id: "K", state: "Possessed" }, { id: "S", state: "Rotting", epss: 0.1 }, { id: "B", state: "Rotting", epss: 0.09 }, { id: "H", state: "Healthy" }] },
      T0,
    );
    expect(Date.parse(kev!.deadline!) - T0).toBe(48 * H);
    expect(Date.parse(sprint!.deadline!) - T0).toBe(14 * 24 * H);
    expect(backlog!.deadline).toBeNull();
    expect(healthy!.deadline).toBeNull();
  });

  it("keep the first deadline on later runs", () => {
    const creature = { limbs: [{ id: "K", state: "Possessed" }] };
    const first = linesFromCreature(creature, T0);
    const second = linesFromCreature(creature, T0 + 10 * H, "real", first);
    expect(second[0]!.deadline).toBe(first[0]!.deadline);
  });

  it("name a team only, never a person, and leave unknown values null", () => {
    fc.assert(
      fc.property(fc.string(), (owner) => {
        const [l] = linesFromCreature({ limbs: [{ id: "X", state: "Rotting", owner }] }, T0);
        expect(l!.ownerTeam === null || /^@[^/]+\/[^/]+$/.test(l!.ownerTeam)).toBe(true);
      }),
    );
    const [l] = linesFromCreature({ limbs: [{ id: "X", state: "Rotting", owner: "@some-person", author: "Jane Doe" }] }, T0);
    expect(l!.ownerTeam).toBeNull();
    expect(JSON.stringify(l)).not.toContain("Jane");
    expect(l!.kev).toBeNull();
    expect(l!.epss).toBeNull();
  });

  it("do not add the same run and limb twice", () => {
    const creature = { limbs: [{ id: "K", state: "Possessed" }] };
    const once = linesFromCreature(creature, T0);
    expect(appendLines(appendLines([], once), once)).toHaveLength(1);
  });
});

describe("crypt-demo seed of 2026-11-18 (docs/PROOF.md)", () => {
  const lines = parseHistoryJsonl(SEED);
  const a = aggregate(lines, Date.parse("2026-11-19T00:00:00Z"));

  it("holds only real lines and no jquery", () => {
    expect(lines).toHaveLength(3);
    expect(lines.every((l) => l.source === "real")).toBe(true);
    expect(lines.every((l) => l.limb === "LODASH")).toBe(true);
    expect(a.sources).toEqual(["real"]);
  });

  it("uses the PROOF.md times and records none for the reraise", () => {
    expect(lines.map((l) => l.ts)).toEqual(["2026-11-18T18:23:40.000Z", "2026-11-18T18:26:40.000Z", null]);
  });

  it("shows the lodash heal, with the mean time from the real times and everything else unknown", () => {
    expect(a.healedLimbs).toBe(1);
    expect(a.meanTimeToHealHours).toBeNull();
    expect(a.healTimesKnown).toBe(0);
    expect(a.meanTimeToLandHours).toBe(0.05);
    expect(a.landTimesKnown).toBe(1);
    expect(a.kevLines).toBe(0);
    expect(a.ageByLimb).toEqual([{ limb: "LODASH", state: "Healed", hours: null, landHours: 0.05 }]);
    expect(a.deadlineBreaches).toEqual([]);
    expect(a.limbsWithDeadline).toBe(0);
    expect(a.undated).toBe(1);
    expect(lines[0]!.epss).toBeNull();
    expect(lines[0]!.ownerTeam).toBeNull();
    expect(a.runs.map((r) => r.openKev)).toEqual([0, 0]);
  });

  it("reads unknown when the heal has no known time", () => {
    const b = aggregate(lines.filter((l) => l.state !== "Landed"), T0);
    expect(b.healedLimbs).toBe(1);
    expect(b.meanTimeToHealHours).toBeNull();
    expect(b.meanTimeToLandHours).toBeNull();
    expect(b.ageByLimb[0]!.hours).toBeNull();
    const c = aggregate([...lines.slice(0, 2), { ...lines[2]!, ts: "2026-11-18T19:23:40.000Z" }], T0);
    expect(c.meanTimeToHealHours).toBe(1);
  });
});

describe("breaches and age", () => {
  const mk = (limb: string, state: HistoryLine["state"], h: number | null, deadlineH: number | null, kev: boolean | null = true): HistoryLine => ({
    ts: h === null ? null : new Date(T0 + h * H).toISOString(),
    limb,
    state,
    kev,
    epss: null,
    ownerTeam: null,
    deadline: deadlineH === null ? null : new Date(T0 + deadlineH * H).toISOString(),
    source: "sample",
  });

  it("flags an open limb past its deadline and a late heal, and not a limb with no deadline", () => {
    const a = aggregate(
      [mk("A", "Possessed", 0, 48), mk("B", "Possessed", 0, 48), mk("B", "Healed", 60, 48), mk("C", "Possessed", 0, 48), mk("C", "Healed", 10, 48), mk("D", "Rotting", 0, null)],
      T0 + 100 * H,
    );
    expect(a.deadlineBreaches.map((b) => [b.limb, b.kind])).toEqual([["A", "open"], ["B", "late"]]);
    expect(a.ageByLimb.find((l) => l.limb === "A")!.hours).toBe(100);
    expect(a.ageByLimb.find((l) => l.limb === "D")!.hours).toBe(100);
    expect(a.meanTimeToHealHours).toBe(35);
  });

  it("counts open KEV per run and leaves unknown KEV out", () => {
    const a = aggregate([mk("A", "Possessed", 0, 48), mk("B", "Rotting", 0, null, null), mk("A", "Healed", 5, 48)], T0 + 10 * H);
    expect(a.runs.map((r) => [r.open, r.openKev])).toEqual([[2, 1], [0, 0]]);
  });

  it("leaves age unknown when the first sighting has no time", () => {
    const a = aggregate([mk("A", "Rotting", null, null)], T0);
    expect(a.ageByLimb[0]!.hours).toBeNull();
  });
});

describe("one run, one point", () => {
  const creature = { limbs: [{ id: "LODASH", state: "Rotting", kev: true, foundAt: "2026-11-01T00:00:00Z" }] };
  it("treats autopsy and gazette readings seconds apart as one run", () => {
    const a = linesFromCreature(creature, T0);
    const b = linesFromCreature(creature, T0 + 20_000);
    expect(appendLines(a, b)).toHaveLength(1);
    expect(appendLines(a, linesFromCreature(creature, T0 + 10 * 60_000))).toHaveLength(2);
  });
  it("starts the deadline at the found time when the creature has one", () => {
    const t = Date.parse("2026-11-10T00:00:00Z");
    expect(linesFromCreature(creature, t)[0]!.deadline).toBe("2026-11-03T00:00:00.000Z");
    expect(linesFromCreature({ limbs: [{ id: "X", state: "Rotting", kev: true }] }, t)[0]!.deadline).toBe("2026-11-12T00:00:00.000Z");
  });
});

describe("history branch push and pull", () => {
  const script = join(ROOT, "scripts", "ci", "history-branch.sh");
  const sh = (args: string[], cwd?: string) => spawnSync("bash", [script, ...args], { encoding: "utf8", cwd });
  const git = (cwd: string, ...a: string[]) => spawnSync("git", a, { cwd, encoding: "utf8" });
  const clone = (remote: string, root: string, name: string): string => {
    const d = join(root, name);
    expect(spawnSync("git", ["clone", "--quiet", remote, d], { encoding: "utf8" }).status).toBe(0);
    return d;
  };

  it("pushes to crypt-history only, pulls it back, and leaves main untouched", () => {
    const root = mkdtempSync(join(tmpdir(), "crypt-hb-"));
    const remote = join(root, "remote.git");
    spawnSync("git", ["init", "--quiet", "--bare", "-b", "main", remote]);
    const seed = clone(remote, root, "seed");
    git(seed, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "--allow-empty", "-m", "init", "--quiet");
    git(seed, "push", "--quiet", "origin", "HEAD:refs/heads/main");
    const a = clone(remote, root, "a");
    const fileA = join(a, "out", "crypt-history.jsonl");
    mkdirSync(join(a, "out"));
    writeFileSync(fileA, "line-one\n");
    expect(sh(["pull", "crypt-history", "main", fileA, a]).status).toBe(0);
    expect(existsSync(fileA)).toBe(true); // no branch yet: the file is left as it is
    expect(sh(["push", "crypt-history", "main", fileA, a]).status).toBe(0);
    expect(git(remote, "show", "crypt-history:crypt-history.jsonl").stdout).toBe("line-one\n");
    expect(git(remote, "rev-parse", "main").stdout).toBe(git(seed, "rev-parse", "HEAD").stdout);

    const b = clone(remote, root, "b");
    const fileB = join(b, "out", "crypt-history.jsonl");
    expect(sh(["pull", "crypt-history", "main", fileB, b]).status).toBe(0);
    expect(readFileSync(fileB, "utf8")).toBe("line-one\n");
    writeFileSync(fileB, "line-one\nline-two\n");
    expect(sh(["push", "crypt-history", "main", fileB, b]).status).toBe(0);
    expect(git(remote, "rev-list", "--count", "crypt-history").stdout.trim()).toBe("2");

    // a stale clone (pulled before b pushed) is rejected as non-fast-forward: warning, exit 0, remote unchanged
    writeFileSync(fileA, "stale\n");
    const r = sh(["push", "crypt-history", "main", fileA, a]);
    expect(r.status).toBe(0);
    expect(r.stderr).toContain("push failed");
    expect(git(remote, "show", "crypt-history:crypt-history.jsonl").stdout).toBe("line-one\nline-two\n");

    // the default branch name is refused and nothing is pushed
    expect(sh(["push", "main", "main", fileA, a]).stderr).toContain("refused");
    rmSync(root, { recursive: true, force: true });
  });
});

describe("history branch guard (property)", () => {
  it("refuses the default branch for every default branch name and accepts only crypt-history", () => {
    fc.assert(
      fc.property(fc.string(), fc.string(), (branch, def) => {
        if (historyBranchAllowed(branch, def)) {
          expect(branch.trim()).toBe(HISTORY_BRANCH);
          expect(def.trim()).not.toBe(branch.trim());
          expect(def.trim()).not.toBe("");
        }
        expect(historyBranchAllowed(branch, branch)).toBe(false);
      }),
    );
    expect(historyBranchAllowed("crypt-history", "main")).toBe(true);
    expect(historyBranchAllowed("crypt-history", "crypt-history")).toBe(false);
    expect(historyBranchAllowed("crypt-history", "")).toBe(false);
    expect(historyBranchAllowed("", "main")).toBe(false);
    expect(historyBranchAllowed("main", "main")).toBe(false);
  });

  const script = join(ROOT, "scripts", "ci", "history-branch.sh");
  const check = (branch: string, def: string) => spawnSync("bash", [script, "check", branch, def], { encoding: "utf8" }).status;

  it("the shell guard agrees with the TypeScript guard", () => {
    fc.assert(
      fc.property(fc.constantFrom("main", "master", "crypt-history", "", "develop", "x y", "crypt-history ", "refs/heads/main"), fc.constantFrom("main", "crypt-history", "", "master"), (b, d) => {
        expect(check(b, d) === 0).toBe(b === HISTORY_BRANCH && d !== "" && d !== b);
      }),
      { numRuns: 25 },
    );
  });

  it("a push to the default branch name does nothing", () => {
    const r = spawnSync("bash", [script, "push", "main", "main", "/nonexistent", "/nonexistent"], { encoding: "utf8" });
    expect(r.status).toBe(0);
    expect(r.stderr).toContain("refused");
  });
});

describe("pages", () => {
  const now = Date.parse("2026-11-19T00:00:00Z");

  it("the autopsy page shows the four measures, the real label and unknown for nulls", () => {
    const html = renderAutopsyHtml(buildAutopsy({ creature: { repo: "e-1305/crypt-demo", limbs: [] }, state: {}, now, limbHistory: aggregate(parseHistoryJsonl(SEED), now) }));
    expect(html).toContain("Open KEV limbs over time");
    expect(html).toContain("Age per limb");
    expect(html).toContain("Deadline breaches");
    expect(html).toContain("Mean time to heal");
    expect(html).toContain("Source: real");
    expect(html).toContain("LODASH healed: <span class=\"n-a\">unknown</span> (to land 3 minutes)");
    expect(html).toContain("holds no known KEV limb");
  });

  it("renders unknown when there is no history or no time", () => {
    expect(renderLimbHistoryHtml(undefined)).toContain("unknown");
    const undated = aggregate(parseHistoryJsonl(SEED).filter((l) => l.ts === null), now);
    const html = renderLimbHistoryHtml(undated);
    expect(html).toContain(">unknown<");
    expect(html).not.toContain("0 minutes");
    expect(durationText(null)).toBe("unknown");
  });

  it("the sample page labels its lines sample and names no person", () => {
    const html = renderAutopsyHtml(buildAutopsy({ ...SAMPLE_INPUT, limbHistory: sampleLimbHistory(SAMPLE_INPUT) }));
    expect(html).toContain("Source: sample");
    const section = html.slice(html.indexOf('id="h-hist"'), html.indexOf('id="h-act"'));
    expect(section).not.toMatch(/@[A-Za-z0-9-]+(?!\/)\b/);
    expect(section).not.toContain("\u2014");
  });

  it("the War Room page has the four panels, a relative history URL and the same labels", () => {
    const html = readFileSync(join(ROOT, "web/war-room/war-room.html"), "utf8");
    const js = readFileSync(join(ROOT, "web/war-room/war-room.js"), "utf8");
    for (const t of ["Open KEV limbs over time", "Age per limb", "Deadline breaches", "Mean time to heal"]) expect(html).toContain(t);
    expect(js).toContain('const HISTORY_URL = "war-room/crypt-history-demo.jsonl"');
    expect(js).toContain("unknown");
    expect(js).toContain("a.sources.join");
    expect(js).not.toContain('fetch("/');
    expect(readFileSync(join(ROOT, "scripts/build-site.ts"), "utf8")).toContain("crypt-demo-2026-11-18.jsonl");
  });
});
