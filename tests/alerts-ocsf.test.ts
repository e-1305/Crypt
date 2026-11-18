import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import fc from "fast-check";
import { afterEach, describe, expect, it } from "vitest";
import { UsageError } from "../src/cli/exit.js";
import { parseCli } from "../src/cli/parse.js";
import { buildOcsf, severityOf, slaClass } from "../src/alerts/ocsf.js";
import { alertsCommand } from "../scripts/cli/alerts.js";

const NOW = new Date("2026-11-18T12:00:00.000Z");
const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

const creature = {
  limbs: [
    { rank: 2, name: "lodash", version: "4.17.15", ecosystem: "npm", owner: "@acme/web", state: "Rotting", spawned: true, kev: false, epss: 0.12, vendorSeverity: "HIGH", vulns: [{ id: "GHSA-B", cves: ["CVE-2020-8203"] }] },
    { rank: 1, name: "jquery", version: "3.4.1", ecosystem: "npm", owner: "@alice", state: "Possessed", spawned: true, kev: true, epss: 0.85, vendorSeverity: "MEDIUM", vulns: [{ id: "GHSA-A", cves: ["CVE-2020-11023", "CVE-2020-11022"] }] },
    { rank: 3, name: "minimist", version: "0.0.8", ecosystem: "npm", owner: "unowned", state: "Rotting", spawned: false, kev: false, epss: 0.01, vulns: [] },
  ],
};

describe("buildOcsf", () => {
  const events = buildOcsf(creature, NOW);

  it("emits one Vulnerability Finding (class 2002) per spawned limb, most urgent first", () => {
    expect(events.map((e) => e.finding_info.uid)).toEqual(["crypt:npm:jquery@3.4.1", "crypt:npm:lodash@4.17.15"]);
    for (const e of events) {
      expect(e.class_uid).toBe(2002);
      expect(e.category_uid).toBe(2);
      expect(e.type_uid).toBe(200201);
      expect(e.metadata.version).toBe("1.1.0");
      expect(e.metadata.product.name).toBe("CRYPT");
      expect(e.time).toBe(NOW.getTime());
    }
  });

  it("carries CVEs, KEV, EPSS, SLA and the team owner", () => {
    const [jq, lo] = events;
    expect(jq!.vulnerabilities.map((v) => v.cve?.uid)).toEqual(["CVE-2020-11022", "CVE-2020-11023"]);
    expect(jq!.vulnerabilities[0]!.is_exploit_available).toBe(true);
    expect(jq!.unmapped).toMatchObject({ kev: true, epss: 0.85, sla: "48 hours", sla_deadline: "2026-11-20T12:00:00.000Z" });
    expect(lo!.unmapped).toMatchObject({ kev: false, sla: "this sprint", sla_deadline: null, owner_team: "@acme/web" });
    expect(lo!.severity_id).toBe(4);
  });

  it("never names a person: an individual @user owner is not printed", () => {
    const text = JSON.stringify(events);
    expect(text).not.toContain("@alice");
  });

  it("is deterministic and fails safe on an invalid creature", () => {
    expect(JSON.stringify(buildOcsf(creature, NOW))).toBe(JSON.stringify(events));
    expect(() => buildOcsf({}, NOW)).toThrow();
    expect(() => buildOcsf(null, NOW)).toThrow();
  });

  it("maps severity and SLA by the policy (property)", () => {
    expect(severityOf("nonsense")).toEqual({ id: 0, name: "Unknown" });
    fc.assert(
      fc.property(fc.boolean(), fc.option(fc.double({ min: 0, max: 1, noNaN: true }), { nil: null }), (kev, epss) => {
        const s = slaClass(kev, epss);
        if (kev) return s === "48 hours";
        return s === (epss !== null && epss >= 0.1 ? "this sprint" : "backlog");
      }),
    );
  });
});

describe("crypt alerts --format ocsf", () => {
  function work(c: unknown): string {
    const d = mkdtempSync(join(tmpdir(), "ocsf-"));
    dirs.push(d);
    mkdirSync(join(d, "out"));
    writeFileSync(join(d, "out", "creature.json"), typeof c === "string" ? c : JSON.stringify(c));
    return d;
  }

  it("parses --format ocsf and refuses --live or --repo with it", () => {
    expect(parseCli(["alerts", "--format", "ocsf"]).flags).toEqual({ format: "ocsf" });
    expect(() => parseCli(["alerts", "--format", "ocsf", "--live"], { GITHUB_TOKEN: "x" })).toThrow(UsageError);
    expect(() => parseCli(["alerts", "--format", "issues", "--out", "x.json"])).toThrow(/--out/);
  });

  it("writes out/alerts.ocsf.json with no network call", async () => {
    const d = work(creature);
    let out = "";
    const code = await alertsCommand(parseCli(["alerts", "--format", "ocsf"]), {
      cwd: d,
      now: () => NOW,
      out: (s) => (out += s),
      fetch: () => {
        throw new Error("no network allowed");
      },
    });
    expect(code).toBe(0);
    const written = JSON.parse(readFileSync(join(d, "out", "alerts.ocsf.json"), "utf8"));
    expect(written).toHaveLength(2);
    expect(out).toMatch(/2 OCSF Vulnerability Finding events/);
  });

  it("writes nothing when the creature has no limbs", async () => {
    const d = work({ repo: "x" });
    await expect(alertsCommand(parseCli(["alerts", "--format", "ocsf"]), { cwd: d, now: () => NOW, out: () => {} })).rejects.toThrow(/Nothing was written/);
    expect(existsSync(join(d, "out", "alerts.ocsf.json"))).toBe(false);
  });
});
