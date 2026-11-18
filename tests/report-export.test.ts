import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildCreature } from "../src/exhume/creature.js";
import { parseEpss, parseKev } from "../src/exhume/feeds.js";
import { nodeFs } from "../scripts/node-fs.js";
import { csvCell, slaOf, toCsv, toJson, exportRows, type ExportLimb } from "../src/web/report-export.js";

const FEEDS = "fixtures/vulnerable-npm/feeds";

/** Minimal RFC 4180 parser for the test. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\r") continue;
    else if (c === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; }
    else cell += c;
  }
  return rows;
}

const creature = (dir: string) =>
  buildCreature({
    repo: nodeFs(dir),
    cacheFs: nodeFs("."),
    cacheDir: "data/cache/osv",
    kev: parseKev(readFileSync(join(FEEDS, "kev.json"), "utf8")),
    epss: parseEpss(readFileSync(join(FEEDS, "epss.csv"), "utf8")),
    name: "e-1305/crypt-demo",
  });

const L = (o: Partial<ExportLimb>): ExportLimb => ({ rank: 1, name: "p", version: "1.0.0", state: "Healthy", kev: false, epss: null, severity: 0, owner: "unowned", ...o });

describe("CSV export", () => {
  for (const dir of ["fixtures/crypt-demo", "fixtures/vulnerable-npm"]) {
    it(`${dir}: same package order as crypt exhume`, async () => {
      const c = await creature(dir);
      const rows = parseCsv(toCsv(c.limbs));
      expect(rows[0]).toEqual(["rank", "package", "version", "state", "kev", "epss", "severity", "sla", "owner"]);
      const body = rows.slice(1);
      expect(body.map((r) => r[1])).toEqual(c.limbs.map((l) => l.name));
      expect(body.map((r) => r[0])).toEqual(c.limbs.map((l) => String(l.rank)));
      expect(body.length).toBeGreaterThan(0);
    });
  }

  it("uses the owner from CODEOWNERS or 'no owner'", async () => {
    const c = await creature("fixtures/vulnerable-npm");
    expect([...new Set(parseCsv(toCsv(c.limbs)).slice(1).map((r) => r[8]))]).toEqual(["@crypt-fixture/supply-chain"]);
    expect(exportRows([L({ owner: "unowned" }), L({ owner: null }), L({ owner: undefined })]).map((r) => r.owner)).toEqual(["no owner", "no owner", "no owner"]);
  });

  it("escapes quotes and commas and neutralises formula characters", () => {
    expect(csvCell('a,"b"')).toBe('"a,""b"""');
    for (const s of ["=1+1", "+1", "-1", "@=x()"]) expect(csvCell(s)).toBe("'" + s);
    expect(csvCell(-1)).toBe("-1");
    const rows = parseCsv(toCsv([L({ name: "=cmd,x" })]));
    expect(rows[1]![1]).toBe("'=cmd,x");
  });

  it("holds only package data: no author or git field", async () => {
    const c = await creature("fixtures/vulnerable-npm");
    expect(toCsv(c.limbs).toLowerCase()).not.toMatch(/author|blame|committer|@.*\.com/);
  });
});

describe("SLA per sla-policy.md", () => {
  it("Possessed 48 hours, Rotting EPSS >= 0.1 this sprint, others backlog", () => {
    expect(slaOf({ state: "Possessed", epss: null })).toBe("48 hours");
    expect(slaOf({ state: "Possessed", epss: 0.5 })).toBe("48 hours");
    expect(slaOf({ state: "Rotting", epss: 0.1 })).toBe("this sprint");
    expect(slaOf({ state: "Rotting", epss: 0.09999 })).toBe("backlog");
    expect(slaOf({ state: "Rotting", epss: null })).toBe("backlog");
    expect(slaOf({ state: "Healthy", epss: 0.9 })).toBe("backlog");
  });
});

describe("JSON export", () => {
  it("carries the same rows as the CSV plus the dry-run label", async () => {
    const c = await creature("fixtures/crypt-demo");
    const j = JSON.parse(toJson({ repo: "e-1305/crypt-demo", limbs: c.limbs, feeds: { kev: "k", epss: "e" } }, "Dry run: nothing is sent.")) as { repo: string; dryRun: string; limbs: unknown[] };
    expect(j.repo).toBe("e-1305/crypt-demo");
    expect(j.dryRun).toContain("Dry run");
    expect(j.limbs).toEqual(exportRows(c.limbs));
  });
});
