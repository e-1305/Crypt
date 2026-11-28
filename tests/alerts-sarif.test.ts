import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import AjvModule from "ajv-draft-04";
import { afterEach, describe, expect, it } from "vitest";
import { UsageError } from "../src/cli/exit.js";
import { parseCli } from "../src/cli/parse.js";
import { buildSarif, levelOf } from "../src/alerts/sarif.js";
import { alertsCommand } from "../scripts/cli/alerts.js";

const NOW = new Date("2026-11-18T12:00:00.000Z");
const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

const schema = JSON.parse(readFileSync(join(import.meta.dirname, "fixtures", "sarif-schema-2.1.0.json"), "utf8"));
const Ajv = (AjvModule as unknown as { default?: typeof AjvModule }).default ?? AjvModule;
const validate = new (Ajv as unknown as new (o: object) => { compile: (s: object) => ((d: unknown) => boolean) & { errors?: unknown } })({ allErrors: true, strict: false }).compile(schema);
const check = (log: unknown): void => {
  const ok = validate(log);
  expect(ok, JSON.stringify(validate.errors)).toBe(true);
};

const creature = {
  feeds: { kev: { status: "ok", date: "2026-11-18T19:17:41.0354Z" }, epss: { status: "ok", date: "2026-11-18T12:00:28Z" } },
  limbs: [
    { rank: 2, name: "lodash", version: "4.17.15", ecosystem: "npm", owner: "@acme/web", spawned: true, kev: false, epss: 0.12, vulns: [{ id: "GHSA-B", cves: ["CVE-2020-8203"] }] },
    { rank: 1, name: "jquery", version: "3.4.1", ecosystem: "npm", owner: "@alice", spawned: true, kev: true, epss: 0.85, vulns: [{ id: "GHSA-A", cves: ["CVE-2020-11023"] }, { id: "GHSA-A2", cves: [] }] },
    { rank: 3, name: "minimist", version: "0.0.8", ecosystem: "npm", owner: "@acme/web", spawned: true, kev: false, epss: 0.01, vulns: [{ id: "GHSA-B", cves: [] }] },
    { rank: 4, name: "ms", version: "2.1.3", ecosystem: "npm", owner: "unowned", spawned: false, kev: false, epss: 0.01, vulns: [{ id: "GHSA-Z" }] },
  ],
};

describe("buildSarif", () => {
  const log = buildSarif(creature, NOW);
  const run = log.runs[0]!;

  it("validates against the SARIF 2.1.0 schema", () => {
    check(log);
    expect(log.version).toBe("2.1.0");
    expect(run.tool.driver.name).toBe("CRYPT");
  });

  it("has one result per spawned limb and one rule per advisory", () => {
    expect(run.results).toHaveLength(3);
    expect(run.tool.driver.rules.map((r) => r.id)).toEqual(["GHSA-A", "GHSA-B"]);
    for (const r of run.results) expect(run.tool.driver.rules[r.ruleIndex]!.id).toBe(r.ruleId);
  });

  it("maps KEV to error, EPSS >= 0.1 to warning, else note", () => {
    expect(run.results.map((r) => r.level)).toEqual(["error", "warning", "note"]);
    expect(levelOf(true, null)).toBe("error");
    expect(levelOf(false, 0.1)).toBe("warning");
    expect(levelOf(false, 0.09)).toBe("note");
    expect(levelOf(false, null)).toBe("note");
  });

  it("puts the KEV jquery limb first with kev, epss, owner team and SLA", () => {
    const j = run.results[0]!;
    expect(j.partialFingerprints["crypt/limb/v1"]).toBe("crypt:npm:jquery@3.4.1");
    expect(j.properties).toMatchObject({ kev: true, epss: 0.85, owner_team: "no owner yet", sla: "48 hours", sla_deadline: "2026-11-20T12:00:00.000Z" });
    expect(run.results[1]!.properties).toMatchObject({ kev: false, owner_team: "@acme/web", sla: "this sprint", sla_deadline: null });
  });

  it("never names a person", () => {
    expect(JSON.stringify(log)).not.toContain("alice");
  });

  it("is deterministic", () => {
    expect(JSON.stringify(buildSarif(creature, NOW))).toBe(JSON.stringify(log));
  });

  it("gives a limb without advisories a generic rule and still validates", () => {
    const l = buildSarif({ limbs: [{ name: "x", version: "1", spawned: true }] }, NOW);
    check(l);
    expect(l.runs[0]!.results).toHaveLength(1);
  });

  it("validates an empty result list", () => {
    check(buildSarif({ limbs: [] }, NOW));
  });

  it("throws on an invalid creature or time", () => {
    expect(() => buildSarif({ repo: "x" }, NOW)).toThrow(/no limbs/);
    expect(() => buildSarif(null, NOW)).toThrow();
    expect(() => buildSarif(creature, new Date("nope"))).toThrow(/invalid time/);
  });
});

describe("crypt alerts --format sarif", () => {
  function work(c: unknown): string {
    const d = mkdtempSync(join(tmpdir(), "sarif-"));
    dirs.push(d);
    mkdirSync(join(d, "out"));
    writeFileSync(join(d, "out", "creature.json"), typeof c === "string" ? c : JSON.stringify(c));
    return d;
  }

  it("parses --format sarif, allows --out, refuses --live and --repo", () => {
    expect(parseCli(["alerts", "--format", "sarif"]).flags).toEqual({ format: "sarif" });
    expect(parseCli(["alerts", "--format", "sarif", "--out", "x.sarif"]).flags).toEqual({ format: "sarif", out: "x.sarif" });
    expect(() => parseCli(["alerts", "--format", "sarif", "--live"], { GITHUB_TOKEN: "x" })).toThrow(UsageError);
    expect(() => parseCli(["alerts", "--format", "sarif", "--repo", "a/b"])).toThrow(UsageError);
  });

  it("writes a valid out/alerts.sarif with no network call", async () => {
    const d = work(creature);
    let out = "";
    const code = await alertsCommand(parseCli(["alerts", "--format", "sarif"]), {
      cwd: d,
      now: () => NOW,
      out: (s) => (out += s),
      fetch: () => {
        throw new Error("no network allowed");
      },
    });
    expect(code).toBe(0);
    check(JSON.parse(readFileSync(join(d, "out", "alerts.sarif"), "utf8")));
    expect(out).toMatch(/3 results/);
  });

  it("anchors results to <base>/<manifest> with --base", async () => {
    const d = work(creature);
    await alertsCommand(parseCli(["alerts", "--format", "sarif", "--base", "services/web"]), { cwd: d, now: () => NOW, out: () => {} });
    const l = JSON.parse(readFileSync(join(d, "out", "alerts.sarif"), "utf8")) as ReturnType<typeof buildSarif>;
    for (const r of l.runs[0]!.results) expect(r.locations[0]!.physicalLocation.artifactLocation.uri).toBe("services/web/package-lock.json");
  });

  it("rejects a base that leaves the repository and writes nothing", async () => {
    const d = work(creature);
    await expect(alertsCommand(parseCli(["alerts", "--format", "sarif", "--base", "../x"]), { cwd: d, now: () => NOW, out: () => {} })).rejects.toThrow(/Nothing was written/);
    expect(existsSync(join(d, "out", "alerts.sarif"))).toBe(false);
  });

  it("--base only goes with --format sarif", () => {
    expect(() => parseCli(["alerts", "--format", "ocsf", "--base", "a"])).toThrow(UsageError);
  });

  it("honors --out", async () => {
    const d = work(creature);
    await alertsCommand(parseCli(["alerts", "--format", "sarif", "--out", "out/custom.sarif"]), { cwd: d, now: () => NOW, out: () => {} });
    expect(existsSync(join(d, "out", "custom.sarif"))).toBe(true);
  });

  it("writes nothing and fails when the creature has no limbs", async () => {
    const d = work({ repo: "x" });
    await expect(alertsCommand(parseCli(["alerts", "--format", "sarif"]), { cwd: d, now: () => NOW, out: () => {} })).rejects.toThrow(/Nothing was written/);
    expect(existsSync(join(d, "out", "alerts.sarif"))).toBe(false);
  });
});

describe("action wiring", () => {
  const y = readFileSync(join(import.meta.dirname, "..", "action.yml"), "utf8");
  it("has the upload-sarif input and the codeql upload step", () => {
    expect(y).toMatch(/\n  upload-sarif:\n[\s\S]*?default: "false"\n/);
    expect(y).toContain("INPUT_UPLOAD_SARIF: ${{ inputs.upload-sarif }}");
    expect(y).toContain("uses: github/codeql-action/upload-sarif@915412ff23e8b7659517e607487dbeae018f2934 # v4.39.5");
    expect(y).toContain("inputs.upload-sarif == 'true'");
  });
});
