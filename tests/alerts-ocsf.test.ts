import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { UsageError } from "../src/cli/exit.js";
import { parseCli } from "../src/cli/parse.js";
import { OcsfError, parseCreatureForAlerts, slaFor, toOcsfEvents } from "../src/soc/ocsf.js";
import { alertsCommand } from "../scripts/cli/alerts.js";
import { nodeIo } from "../src/common/io.js";

const FIXTURE = readFileSync(join(process.cwd(), "tests", "fixtures", "soc", "creature.json"), "utf8");
const NOW = Date.UTC(2026, 10, 2, 9, 0, 0);
const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});
function work(creature: string | null): string {
  const d = mkdtempSync(join(tmpdir(), "alerts-"));
  dirs.push(d);
  mkdirSync(join(d, "out"));
  if (creature !== null) writeFileSync(join(d, "out", "creature.json"), creature);
  return d;
}
const events = () => {
  const c = parseCreatureForAlerts(FIXTURE);
  return toOcsfEvents(c.repo, c.limbs, NOW) as any[];
};

describe("OCSF Vulnerability Finding events", () => {
  it("emits one event per spawned limb only", () => {
    const e = events();
    expect(e).toHaveLength(2);
    expect(e.map((x) => x.resources[0].name)).toEqual(["lodash", "minimist"]);
    for (const x of e) expect([x.class_uid, x.category_uid, x.type_uid]).toEqual([2002, 2, 200201]);
  });

  it("carries CVEs, KEV, EPSS, severity, package, version, fixed version, owner and SLA", () => {
    const [lodash, minimist] = events();
    const v = lodash.vulnerabilities[0];
    expect(v.related_cves).toEqual(["CVE-2019-10744", "CVE-2020-8203"]);
    expect(v.is_exploit_available).toBe(true);
    expect(v.cve.epss.score).toBe("0.9");
    expect(lodash.severity_id).toBe(5);
    expect(v.affected_packages[0]).toEqual({ name: "lodash", version: "4.17.15", type: "npm", fixed_in_version: "4.17.21" });
    expect(v.is_fix_available).toBe(true);
    expect(lodash.unmapped).toMatchObject({ kev: true, epss: 0.9, owner: "@acme/platform", sla_policy: "48h", sla_deadline: "2026-11-04T09:00:00.000Z" });
    expect(minimist.unmapped).toMatchObject({ kev: false, owner: "unowned", sla_policy: "sprint", sla_deadline: "2026-11-16T09:00:00.000Z" });
    expect(minimist.vulnerabilities[0].affected_packages[0]).not.toHaveProperty("fixed_in_version");
    expect(minimist.vulnerabilities[0].is_fix_available).toBe(false);
  });

  it("applies sla-policy.md: KEV 48h, EPSS >= 0.1 sprint, else backlog without a deadline", () => {
    expect(slaFor({ state: "Possessed", kev: true, epss: null }, NOW).policy).toBe("48h");
    expect(slaFor({ state: "Rotting", kev: false, epss: 0.1 }, NOW).policy).toBe("sprint");
    expect(slaFor({ state: "Rotting", kev: false, epss: 0.0999 }, NOW)).toEqual({ policy: "backlog", deadline: null });
  });

  it("never contains a person (healedBy login is not emitted)", () => {
    const c = JSON.parse(FIXTURE);
    c.limbs[0].healedBy = "alice-the-healer";
    const p = parseCreatureForAlerts(JSON.stringify(c));
    expect(JSON.stringify(toOcsfEvents(p.repo, p.limbs, NOW))).not.toContain("alice");
  });
});

describe("fail-safe", () => {
  it("rejects an unknown limb field, bad JSON and a wrong schemaVersion", () => {
    const c = JSON.parse(FIXTURE);
    c.limbs[0].author = "bob";
    expect(() => parseCreatureForAlerts(JSON.stringify(c))).toThrow(OcsfError);
    expect(() => parseCreatureForAlerts("{nope")).toThrow(OcsfError);
    expect(() => parseCreatureForAlerts(JSON.stringify({ ...JSON.parse(FIXTURE), schemaVersion: 2 }))).toThrow(OcsfError);
  });

  it("writes the default file from a valid creature", () => {
    const d = work(FIXTURE);
    expect(alertsCommand(parseCli(["alerts", "--format", "ocsf"]), d, nodeIo, () => NOW)).toBe(0);
    const out = JSON.parse(readFileSync(join(d, "out", "alerts.ocsf.json"), "utf8"));
    expect(out).toHaveLength(2);
  });

  it("writes nothing and throws for a missing, unreadable or unknown-field creature", () => {
    const bad = JSON.parse(FIXTURE);
    bad.limbs[1].blame = "carol";
    for (const content of [null, "{nope", JSON.stringify(bad)]) {
      const d = work(content);
      expect(() => alertsCommand(parseCli(["alerts", "--format", "ocsf", "--out", "out/a.json"]), d, nodeIo, () => NOW)).toThrow(/Nothing was written/);
      expect(existsSync(join(d, "out", "a.json"))).toBe(false);
    }
  });
});

describe("parse", () => {
  it("needs --format ocsf", () => {
    expect(() => parseCli(["alerts"])).toThrow(UsageError);
    expect(() => parseCli(["alerts", "--format", "json"])).toThrow(UsageError);
    expect(parseCli(["alerts", "--format", "ocsf", "--out", "x.json"]).flags).toEqual({ format: "ocsf", out: "x.json" });
  });
});
