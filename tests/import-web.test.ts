// Browser import (issue #101): the glue in src/web/import-glue.ts and the DOM code in web/import.js.
import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { feedSnapshotText } from "../scripts/build-site.js";
import { parseFeedSnapshot, type FeedSnapshot } from "../src/web/feed-snapshot.js";
import { ImportWebError, MAX_WEB_IMPORT_BYTES, detectFormats, importInBrowser, nameFromFile } from "../src/web/import-glue.js";
import { IMPORT_FORMATS } from "../src/import/index.js";

const ROOT = resolve(import.meta.dirname, "..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");
const feeds = (): FeedSnapshot => {
  const s = parseFeedSnapshot(feedSnapshotText(["fixtures/vulnerable-npm/feeds"]));
  if (!s) throw new Error("snapshot");
  return s;
};
const FILES: Record<string, string> = { sarif: "sarif.json", dependabot: "dependabot.json", trivy: "trivy.json", grype: "grype.json", snyk: "snyk.json" };

afterEach(() => vi.unstubAllGlobals());

describe("import in the browser", () => {
  it.each(IMPORT_FORMATS)("%s fixture: result shape, one format detected", (format) => {
    const text = read(`fixtures/import/${FILES[format]}`);
    expect(detectFormats(text)).toEqual([format]);
    const r = importInBrowser({ text, file: FILES[format]!, format: "auto", feeds: feeds() });
    expect(r.format).toBe(format);
    expect(r.groups.length).toBeGreaterThan(0);
    expect(r.limbs.length).toBeGreaterThanOrEqual(r.groups.length);
    expect(r.plate.length).toBeGreaterThan(0);
    expect(r.creature.import).toEqual({ format, file: FILES[format] });
    expect(importInBrowser({ text, file: FILES[format]!, format, feeds: feeds() }).plate).toBe(r.plate);
  });

  it("makes no network call while importing", () => {
    const f = vi.fn(() => {
      throw new Error("network used");
    });
    vi.stubGlobal("fetch", f);
    vi.stubGlobal("XMLHttpRequest", f);
    for (const format of IMPORT_FORMATS) importInBrowser({ text: read(`fixtures/import/${FILES[format]}`), file: "x.json", format, feeds: feeds() });
    expect(f).not.toHaveBeenCalled();
  });

  it("never shows an unchecked limb as Healthy", () => {
    for (const format of IMPORT_FORMATS) {
      const r = importInBrowser({ text: read(`fixtures/import/${FILES[format]}`), file: "x.json", format, feeds: feeds() });
      for (const l of r.limbs) if (l.unknown) expect(l.state).not.toBe("Healthy");
      for (const g of r.groups) if (g.unknown) expect(g.state).not.toBe("Healthy");
    }
  });

  it("fails safe: no creature for bad input", () => {
    const f = feeds();
    const bad = (text: string, format: "auto" | "trivy" = "auto", fs: FeedSnapshot | null = f) => () => importInBrowser({ text, file: "a.json", format, feeds: fs });
    expect(bad("not json")).toThrow(ImportWebError);
    expect(bad("{}")).toThrow(ImportWebError);
    expect(bad("[]", "trivy")).toThrow(ImportWebError);
    expect(bad(read("fixtures/import/trivy.json"), "auto", null)).toThrow(/snapshot/);
    expect(bad(" ".repeat(MAX_WEB_IMPORT_BYTES + 1))).toThrow(/5 MB/);
  });

  it("names no person and ranks no people", () => {
    const r = importInBrowser({ text: read("fixtures/import/trivy.json"), file: "trivy.json", format: "auto", feeds: feeds() });
    const shown = JSON.stringify([r.plate, r.summary, r.groups.map((g) => [g.name, g.state, g.owner])]);
    expect(shown).not.toMatch(/leaderboard|\bblame|culprit|introduced by|committed by|authored by/i);
    expect(nameFromFile("My Report (1).json")).toBe("My-Report-1");
  });
});

describe("web/import.js", () => {
  const src = read("web/import.js");
  it("never sends the file anywhere", () => {
    expect(src).not.toMatch(/XMLHttpRequest|FormData|sendBeacon|WebSocket|\.innerHTML|insertAdjacentHTML/);
    const fetches = src.match(/fetchFn\([^)]*\)/g) ?? [];
    expect(fetches).toEqual(['fetchFn("feeds.json")']);
    expect(src).not.toMatch(/\bfetch\(["'`]/);
  });
  it("shows Unknown limbs as Unknown (not checked)", () => {
    expect(src).toContain("Unknown (not checked)");
  });
  it("the page says the file stays in the browser, inside the Bench", () => {
    const html = read("web/index.html");
    const bench = html.slice(html.indexOf('id="bench-body"'));
    expect(bench).toContain("Parsed in your browser. The file stays on your device and is not uploaded.");
    expect(bench).toContain('id="import-drop"');
    expect(html.match(/id="import-drop"/g)).toHaveLength(1);
  });
});
