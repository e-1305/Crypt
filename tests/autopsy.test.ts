import { mkdtempSync, existsSync, readFileSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { CliError } from "../src/cli/exit.js";
import { parseCli } from "../src/cli/parse.js";
import { buildAutopsy, median, readHistory, LANDED_AT, NOT_ENOUGH_RAIDS } from "../src/report/model.js";
import { esc, renderAutopsyHtml } from "../src/report/html.js";
import { SAMPLE_INPUT, SAMPLE_NOW, SAMPLE_SCAN_START } from "../src/report/sample.js";
import { autopsyCommand } from "../scripts/cli/autopsy.js";
import { numRuns } from "./runs.js";

const H = 3_600_000;
const T0 = Date.UTC(2025, 10, 3, 9);
const iso = (h: number) => new Date(T0 + h * H).toISOString();
const limb = (o: Record<string, unknown>) => ({ id: "A", name: "a", owner: "@x", state: "Rotting", kev: false, epss: 0.02, ...o });
const creature = (limbs: unknown[], counts: Record<string, unknown> = {}) => ({ team: { scanStart: T0 }, counts, limbs });

describe("autopsy metrics", () => {
  it("implementation counts owned finding limbs only", () => {
    const m = buildAutopsy({
      now: T0,
      state: {},
      creature: creature([limb({ id: "A" }), limb({ id: "B", owner: "unowned" }), limb({ id: "C", state: "Healthy" }), limb({ id: "D", state: "Healthy", healed: true })]),
    });
    expect(m.implementation).toEqual({ pct: 66.7, owned: 2, total: 3 });
  });

  it("median handles odd, even and empty", () => {
    expect(median([])).toBeNull();
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
  });

  it("efficiency is the median hours to fix, n/a when nothing healed", () => {
    const healed = (id: string, h: number) => limb({ id, state: "Healthy", healed: true });
    const state = { limbs: { A: { state: "healed", updatedAt: iso(2) }, B: { state: "healed", updatedAt: iso(9), [LANDED_AT]: iso(4) }, C: { state: "healed", updatedAt: iso(12) } } };
    const m = buildAutopsy({ now: T0, state, creature: creature([healed("A", 0), healed("B", 0), healed("C", 0)]) });
    expect(m.efficiency).toEqual({ medianHours: 4, healed: 3 });
    const none = buildAutopsy({ now: T0, state: {}, creature: creature([limb({})]) });
    expect(none.efficiency.medianHours).toBeNull();
    expect(none.impact.epssRemoved).toBeNull();
  });

  it("foundAt overrides scanStart", () => {
    const state = { limbs: { A: { state: "healed", updatedAt: iso(10) } } };
    const m = buildAutopsy({ now: T0, state, creature: creature([limb({ state: "Healthy", healed: true, foundAt: iso(6) })]) });
    expect(m.efficiency.medianHours).toBe(4);
  });

  it("impact sums EPSS of healed KEV or EPSS>=0.1 limbs", () => {
    const state = { limbs: { A: { state: "healed", updatedAt: iso(1) }, B: { state: "healed", updatedAt: iso(1) }, C: { state: "healed", updatedAt: iso(1) } } };
    const m = buildAutopsy({
      now: T0,
      state,
      creature: creature([
        limb({ id: "A", state: "Healthy", healed: true, wasKev: true, epss: 0.5 }),
        limb({ id: "B", state: "Healthy", healed: true, epss: 0.25 }),
        limb({ id: "C", state: "Healthy", healed: true, epss: 0.05 }),
      ]),
    });
    expect(m.impact).toEqual({ epssRemoved: 0.75, limbs: 2 });
  });

  it("SLA windows: 48h for Possessed, 14 days for EPSS>=0.1, at risk from 75%", () => {
    const c = creature([
      limb({ id: "P", state: "Possessed", kev: true, epss: 0.9 }),
      limb({ id: "S", epss: 0.3 }),
      limb({ id: "L", epss: 0.01 }),
    ]);
    const at = (h: number) => buildAutopsy({ now: T0 + h * H, state: {}, creature: c }).sla;
    expect(at(10)).toMatchObject({ inScope: 2, met: 2, pct: 100, breached: [], atRisk: [] });
    expect(at(36).atRisk.map((x) => x.id)).toEqual(["P"]);
    const late = at(49);
    expect(late.breached.map((x) => x.id)).toEqual(["P"]);
    expect(late.pct).toBe(50);
    expect(at(14 * 24 + 1).breached.map((x) => x.id)).toEqual(["P", "S"]);
  });

  it("healed limbs count by the time of the fix", () => {
    const state = { limbs: { A: { state: "healed", updatedAt: iso(47) }, B: { state: "healed", updatedAt: iso(49) } } };
    const m = buildAutopsy({
      now: T0 + 500 * H,
      state,
      creature: creature([limb({ id: "A", state: "Healthy", healed: true, wasKev: true }), limb({ id: "B", state: "Healthy", healed: true, wasKev: true })]),
    });
    expect(m.sla).toMatchObject({ inScope: 2, met: 1, pct: 50 });
    expect(m.sla.breached.map((x) => x.id)).toEqual(["B"]);
  });

  it("trend orders by time, keeps the last N and needs 2 raids", () => {
    const pt = (h: number) => ({ at: iso(h), possessed: 1, rotting: 2, healthy: 3, spawned: 1, healed: 0 });
    const hist = [pt(5), pt(1), pt(3), { at: "junk", possessed: 1 }, null, pt(2), pt(4)];
    expect(readHistory(hist, 3).map((p) => p.at)).toEqual([3, 4, 5].map((h) => T0 + h * H));
    const one = buildAutopsy({ now: T0, state: {}, creature: creature([]), history: [pt(1)] });
    expect(one.trend).toMatchObject({ enough: false, message: NOT_ENOUGH_RAIDS });
    const state = buildAutopsy({ now: T0, state: { history: [pt(2), pt(1)] }, creature: creature([]) });
    expect(state.trend.enough).toBe(true);
    expect(state.trend.points[0]!.at).toBe(T0 + H);
  });

  it("noise exorcised is exorcised over findings", () => {
    expect(buildAutopsy({ now: T0, state: {}, creature: creature([], { exorcised: 3, findings: 5 }) }).noise.pct).toBe(60);
    expect(buildAutopsy({ now: T0, state: {}, creature: creature([], { exorcised: 3, findings: 0 }) }).noise.pct).toBeNull();
  });

  it("sample model has every metric", () => {
    const m = buildAutopsy(SAMPLE_INPUT);
    expect(m.findings).toBe(5);
    expect(m.implementation.pct).toBe(60);
    expect(m.efficiency.medianHours).toBe(8);
    expect(m.impact.epssRemoved).toBe(0.62);
    expect(m.sla).toMatchObject({ pct: 100, inScope: 2 });
    expect(m.sla.atRisk.map((x) => x.id)).toEqual(["HANDLEBARS"]);
    expect(m.trend.enough).toBe(true);
    expect(m.noise.pct).toBe(60);
    expect(SAMPLE_NOW - SAMPLE_SCAN_START).toBe(40 * H);
  });
});

describe("autopsy properties", () => {
  it("never throws on junk and keeps n/a shape", () => {
    fc.assert(
      fc.property(fc.anything(), fc.anything(), fc.anything(), fc.anything(), (creature, state, history, now) => {
        const m = buildAutopsy({ creature, state, history, now: now as number });
        expect(() => renderAutopsyHtml(m)).not.toThrow();
        expect(typeof m.findings).toBe("number");
      }),
      { numRuns: numRuns(200) },
    );
  });

  it("output never holds an unescaped script tag", () => {
    const evil = fc.string().map((s) => `<script>${s}</script>`);
    fc.assert(
      fc.property(evil, evil, (a, b) => {
        const html = renderAutopsyHtml(
          buildAutopsy({
            now: T0,
            state: { limbs: { A: { state: "healed", updatedAt: iso(1), healedBy: a } } },
            creature: { repo: a, team: { scanStart: T0 }, limbs: [limb({ id: a, name: b, state: "Possessed", kev: true })] },
          }),
        );
        expect(html.toLowerCase()).not.toContain("<script");
        expect(esc(a)).not.toContain("<");
      }),
      { numRuns: numRuns(100) },
    );
  });

  it("names a person only in the praise section", () => {
    const login = fc.stringMatching(/^[a-z][a-z0-9]{5,12}$/).map((s) => `zq${s}`);
    fc.assert(
      fc.property(login, login, (owner, by) => {
        fc.pre(owner !== by);
        const html = renderAutopsyHtml(
          buildAutopsy({
            now: T0 + 60 * H,
            state: { limbs: { H: { state: "healed", updatedAt: iso(70), healedBy: by } } },
            creature: creature([
              limb({ id: "P", name: "pkg", owner: `@${owner}`, state: "Possessed", kev: true }),
              limb({ id: "H", name: "fixed", owner: `@${owner}`, state: "Healthy", healed: true, wasKev: true }),
            ]),
          }),
        );
        expect(html).not.toContain(owner);
        const body = html.slice(html.indexOf("<main>"), html.indexOf("</main>"));
        const praise = body.slice(body.indexOf('id="h-praise"'), body.indexOf('id="h-trend"'));
        const outside = body.replace(praise, "");
        expect(outside).not.toContain(by);
        expect(praise).toContain(`healed by @${by}`);
      }),
      { numRuns: numRuns(100) },
    );
  });
});

describe("autopsy page", () => {
  const html = renderAutopsyHtml(buildAutopsy(SAMPLE_INPUT));
  it("is self-contained with every measure and a footnote", () => {
    for (const w of ["Implementation", "Efficiency", "Impact", "SLA compliance", "Trend", "Noise exorcised", "exploitable risk removed", "How computed", "NIST SP 800-55", "Print or save as PDF from your browser", "@media print", "<svg"]) {
      expect(html).toContain(w);
    }
    expect(html).not.toMatch(/<script|https?:\/\/|<link/i);
  });
  it("matches the snapshot", () => {
    expect(html).toMatchSnapshot();
  });
  it("says when the trend has too few raids", () => {
    expect(renderAutopsyHtml(buildAutopsy({ ...SAMPLE_INPUT, history: [] }))).toContain(NOT_ENOUGH_RAIDS);
  });
});

describe("crypt autopsy command", () => {
  it("parses its flags", () => {
    expect(parseCli(["autopsy"]).command).toBe("autopsy");
    const p = parseCli(["autopsy", "--sample", "--out", "/tmp/x.html", "--last", "4"]);
    expect(p.flags).toEqual({ sample: true, out: "/tmp/x.html", last: "4" });
    expect(() => parseCli(["autopsy", "--last", "0"])).toThrow(/--last/);
    expect(() => parseCli(["autopsy", "extra"])).toThrow(/unexpected argument/);
  });

  it("writes the sample and the real report, and refuses without creature.json", () => {
    const dir = mkdtempSync(join(tmpdir(), "autopsy-"));
    try {
      expect(() => autopsyCommand(parseCli(["autopsy"]), dir)).toThrow(CliError);
      expect(() => autopsyCommand(parseCli(["autopsy"]), dir)).toThrow(/Run crypt raid <target> first/);
      expect(existsSync(join(dir, "out", "autopsy.html"))).toBe(false);
      autopsyCommand(parseCli(["autopsy", "--sample", "--out", "s.html"]), dir);
      expect(readFileSync(join(dir, "s.html"), "utf8")).toContain("CRYPT Autopsy Report");
      mkdirSync(join(dir, "out"));
      writeFileSync(join(dir, "out", "creature.json"), JSON.stringify(SAMPLE_INPUT.creature));
      expect(autopsyCommand(parseCli(["autopsy"]), dir, undefined, () => SAMPLE_NOW)).toBe(0);
      expect(readFileSync(join(dir, "out", "autopsy.html"), "utf8")).toContain("e-1305/crypt-demo");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
