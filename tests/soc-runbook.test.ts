// docs/SOC.md runs from an empty folder: the documented commands, offline against the bundled fixture, then the OCSF class 2002 shape.
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const ROOT = join(import.meta.dirname, "..");
const BIN = join(ROOT, "bin", "crypt.mjs");
const FIXTURE = join(ROOT, "fixtures", "vulnerable-npm");
const SOC = readFileSync(join(ROOT, "docs", "SOC.md"), "utf8");

let dir = "";
const crypt = (args: string[]) => spawnSync(process.execPath, [BIN, ...args], { cwd: dir, encoding: "utf8", input: "", timeout: 90_000 });

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "crypt-soc-"));
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("docs/SOC.md commands", () => {
  it("names the documented commands", () => {
    expect(SOC).toContain("npx @e-1305/crypt raid https://github.com/e-1305/crypt-demo </dev/null");
    expect(SOC).toContain("npx @e-1305/crypt exhume <dir> && npx @e-1305/crypt alerts --format ocsf");
    expect(SOC).toContain("npx @e-1305/crypt exhume <path-to-package>/fixtures/vulnerable-npm --offline");
    expect(SOC.match(/npx @e-1305\/crypt alerts --format ocsf/g)!.length).toBeGreaterThanOrEqual(3);
    expect(SOC).not.toContain(String.fromCharCode(0x2014));
  });

  it("exhume --offline then alerts --format ocsf works from an empty folder", () => {
    expect(existsSync(join(dir, "out"))).toBe(false);
    const ex = crypt(["exhume", FIXTURE, "--offline"]);
    expect(ex.status, ex.stderr).toBe(0);
    const al = crypt(["alerts", "--format", "ocsf"]);
    expect(al.status, al.stderr).toBe(0);
    expect(existsSync(join(dir, "out", "alerts.ocsf.json"))).toBe(true);
  });

  it("alerts exits non-zero and writes nothing without a creature", () => {
    const empty = mkdtempSync(join(tmpdir(), "crypt-soc-empty-"));
    try {
      const r = spawnSync(process.execPath, [BIN, "alerts", "--format", "ocsf"], { cwd: empty, encoding: "utf8", input: "" });
      expect(r.status).not.toBe(0);
      expect(existsSync(join(empty, "out", "alerts.ocsf.json"))).toBe(false);
    } finally {
      rmSync(empty, { recursive: true, force: true });
    }
  });

  it("every emitted event has the OCSF 1.1 class 2002 required attributes with correct types", () => {
    const events = JSON.parse(readFileSync(join(dir, "out", "alerts.ocsf.json"), "utf8")) as Record<string, any>[];
    expect(Array.isArray(events)).toBe(true);
    expect(events.length).toBeGreaterThan(0);
    for (const e of events) {
      for (const k of ["class_uid", "category_uid", "activity_id", "type_uid", "severity_id", "time"]) expect(Number.isInteger(e[k]), k).toBe(true);
      expect(e.class_uid).toBe(2002);
      expect(e.category_uid).toBe(2);
      expect(e.type_uid).toBe(e.class_uid * 100 + e.activity_id);
      expect(e.severity_id).toBeGreaterThanOrEqual(0);
      expect(e.severity_id).toBeLessThanOrEqual(5);
      expect(e.time).toBeGreaterThan(0);
      expect(typeof e.metadata.version).toBe("string");
      expect(e.metadata.version).toBe("1.1.0");
      expect(typeof e.metadata.product).toBe("object");
      expect(typeof e.metadata.product.name).toBe("string");
      expect(e.metadata.product.name).not.toBe("");
      expect(typeof e.finding_info.uid).toBe("string");
      expect(e.finding_info.uid).not.toBe("");
      expect(typeof e.finding_info.title).toBe("string");
      expect(e.finding_info.title).not.toBe("");
      expect(Array.isArray(e.vulnerabilities)).toBe(true);
      expect(e.vulnerabilities.length).toBeGreaterThan(0);
    }
  });
});

describe("docs/SECURITY-REVIEW.md", () => {
  const doc = readFileSync(join(ROOT, "docs", "SECURITY-REVIEW.md"), "utf8");
  it("covers every review topic and says what is not offered", () => {
    for (const h of ["## Data handled", "## Data stored", "## Network calls", "## Token scopes", "## No merge capability", "## SEAL kill switch", "## Audit log format", "## Supply chain", "## Not offered"]) expect(doc).toContain(h);
    for (const w of ["api.osv.dev", "epss.empiricalsecurity.com", "www.cisa.gov", "--live", "--provenance", "SSO", "Multi-tenancy", "Retention SLA", "Support contract"]) expect(doc).toContain(w);
    expect(doc).not.toContain(String.fromCharCode(0x2014));
  });
  it("names files that exist", () => {
    for (const m of doc.matchAll(/`((?:src|scripts|\.github)\/[A-Za-z0-9_./-]+\.(?:ts|sh|yml))`/g)) expect(existsSync(join(ROOT, m[1]!)), m[1]).toBe(true);
  });
  it("is linked from README and the autopsy report", async () => {
    expect(readFileSync(join(ROOT, "README.md"), "utf8")).toContain("docs/SECURITY-REVIEW.md");
    const { renderAutopsyHtml } = await import("../src/report/html.js");
    const { buildAutopsy } = await import("../src/report/model.js");
    const { SAMPLE_INPUT } = await import("../src/report/sample.js");
    expect(renderAutopsyHtml(buildAutopsy(SAMPLE_INPUT))).toContain("docs/SECURITY-REVIEW.md");
  });
});
