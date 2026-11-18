import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { numRuns } from "./runs.js";
import { parseRepoUrl, repoSlug } from "../src/web/repo-url.js";
import { MAX_GALLERY_LIMBS, galleryIndex, previewPayload, slugForRepo, snapshotCreature } from "../src/site/gallery.js";
import { parseRepos } from "../scripts/census/aggregate.js";
import { buildSite } from "../scripts/build-site.js";
import { generate, type CreatureInput } from "../src/raise/generate.js";
import { renderManual } from "../src/site/manual.js";
import { parseCommand } from "../src/bridge/grammar.js";
import { inform6Path } from "../scripts/toolchain-dir.js";

const ROOT = resolve(import.meta.dirname, "..");
const GALLERY = join(ROOT, "web", "gallery-data");
const repos = parseRepos(readFileSync(join(ROOT, "docs", "census", "repos.md"), "utf8"));
const snapshots = () => readdirSync(GALLERY).filter((f) => f.endsWith(".json")).sort().map((f) => ({ f, s: JSON.parse(readFileSync(join(GALLERY, f), "utf8")) }));

describe("parseRepoUrl", () => {
  it("accepts github.com https addresses", () => {
    expect(parseRepoUrl("https://github.com/axios/axios")).toEqual({ owner: "axios", repo: "axios" });
    expect(parseRepoUrl(" https://github.com/mrdoob/three.js.git ")).toEqual({ owner: "mrdoob", repo: "three.js" });
    expect(parseRepoUrl("https://github.com/npm/cli/tree/latest/docs")).toEqual({ owner: "npm", repo: "cli" });
  });
  it("rejects every other address", () => {
    for (const bad of [
      "http://github.com/a/b", "https://gitlab.com/a/b", "https://github.com.evil.example/a/b", "https://evil.example/github.com/a/b",
      "https://user@github.com/a/b", "https://github.com:8443/a/b", "https://github.com/a", "https://github.com/a/..", "github.com/a/b",
      "javascript:alert(1)", "", "ftp://github.com/a/b", "https://github.com/a b/c",
    ]) expect(parseRepoUrl(bad), bad).toBeNull();
  });
  it("never throws on any input, and accepts only https github.com URLs", () => {
    fc.assert(
      fc.property(fc.oneof(fc.string(), fc.webUrl(), fc.string({ unit: "binary" }), fc.anything().map((x) => x as unknown)), (input) => {
        const r = parseRepoUrl(input);
        if (r !== null) {
          const u = new URL(String(input).trim());
          expect(u.protocol).toBe("https:");
          expect(u.hostname).toBe("github.com");
          expect(r.owner).toMatch(/^[A-Za-z0-9-]+$/);
        }
      }),
      { numRuns: numRuns(300) },
    );
  });
  it("slugs match the committed gallery files", () => {
    const [owner, repo] = repos[0]!.repo.split("/");
    expect(repoSlug({ owner: owner!, repo: repo! })).toBe(slugForRepo(repos[0]!.repo));
  });
});

describe("gallery data is aggregate-safe and blameless", () => {
  it("holds one snapshot per census repository, nothing else", () => {
    expect(snapshots().map((x) => x.f)).toEqual(repos.map((r) => `${slugForRepo(r.repo)}.json`).sort());
    for (const { s } of snapshots()) expect(repos.map((r) => r.repo)).toContain(s.repo);
  });
  it("rebuilt stories declare the native raid verb for every gallery creature", () => {
    for (const { f, s } of snapshots()) {
      const { inf } = generate(s as CreatureInput);
      expect(inf, f).toContain("Verb 'raid'");
      expect(inf, f).toContain("-> Raid;");
      expect(inf, f).toContain("[ RaidSub;");
      expect(inf, f).toContain('print "[[CRYPT RAID]]^";');
    }
  });
  it("snapshots carry no owner, no author and no total across repositories", () => {
    const banned = /owner|author|email|committer|blame|total|aggregate|median|percent/i;
    for (const { f, s } of snapshots()) {
      expect(Object.keys(s).sort(), f).toEqual(["counts", "limbs", "repo", "scannedLimbs", "schemaVersion", "sha"]);
      expect(JSON.stringify(Object.keys(s)) + JSON.stringify(s.limbs.flatMap((l: object) => Object.keys(l))), f).not.toMatch(banned);
      expect(s.limbs.length).toBeLessThanOrEqual(MAX_GALLERY_LIMBS);
    }
  });
  it("lists the gallery alphabetically for any input order", () => {
    fc.assert(
      fc.property(fc.array(fc.string(), { maxLength: 20 }), (names) => {
        const out = galleryIndex(names.map((repo) => ({ slug: repo, repo }))).map((e) => e.repo.toLowerCase());
        expect(out).toEqual([...out].sort());
      }),
      { numRuns: numRuns(100) },
    );
  });
  it("snapshotCreature keeps the repository's own data only and drops owners", () => {
    fc.assert(
      fc.property(
        fc.array(fc.record({ name: fc.string(), owner: fc.string(), state: fc.constantFrom("Healthy", "Rotting", "Possessed"), rank: fc.nat(100) }), { maxLength: 80 }),
        (limbs) => {
          const s = snapshotCreature({ schemaVersion: 1, limbs }, "a/b", "0".repeat(40))!;
          expect(JSON.stringify(s)).not.toContain('"owner"');
          expect(s.limbs.every((l) => l.state !== "Healthy")).toBe(true);
          expect(s.limbs.length).toBeLessThanOrEqual(MAX_GALLERY_LIMBS);
          expect(s.repo).toBe("a/b");
        },
      ),
      { numRuns: numRuns(100) },
    );
  });
  it("the payload preview names no person and sends nothing", () => {
    const p = previewPayload("LODASH", { rank: 1, ecosystem: "npm", name: "lodash", version: "4.17.15", state: "Rotting", spawned: true, kev: false, epss: 0.2, vulns: [{ id: "GHSA-x", cves: ["CVE-1"] }] });
    expect(p.dryRun).toBe(true);
    expect(p.sent).toBe(false);
    expect(JSON.stringify(p)).not.toMatch(/owner|@|author|blame/i);
  });
  it("page copy passes the blameless copy check", () => {
    const r = spawnSync("bash", ["scripts/hooks/blameless-copy-check.sh", "web/index.html", "web/app.js", "web/style.css"], { cwd: ROOT, encoding: "utf8" });
    expect(r.status, r.stderr).toBe(0);
  });
});

const manualOpts = (over: Partial<Parameters<typeof renderManual>[1]> = {}) => ({
  sourcePath: "docs/USER_MANUAL.md",
  repoBlobBase: "https://github.com/e-1305/Crypt/blob/main/",
  repoHas: (p: string) => existsSync(join(ROOT, p)),
  siteHas: () => false,
  siteBase: "https://e-1305.github.io/Crypt/",
  ...over,
});
const manualMd = readFileSync(join(ROOT, "docs", "USER_MANUAL.md"), "utf8");

describe("renderManual", () => {
  it("escapes HTML and renders tables, code fences, headings with ids and inline code", () => {
    const html = renderManual("# T\n\nintro <script>alert(1)</script> **b** `<x>`\n\n## 1. Two words\n\n| A | B |\n|---|---|\n| `x` | y |\n\n```bash\nnpm <ci>\n```\n\n- one\n- two\n", manualOpts());
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).toContain("<strong>b</strong>");
    expect(html).toContain("<code>&lt;x&gt;</code>");
    expect(html).toContain('<h2 id="1-two-words">');
    expect(html).toContain('<th scope="col">A</th>');
    expect(html).toContain("<td><code>x</code></td>");
    expect(html).toContain("<pre tabindex=\"0\"><code>npm &lt;ci&gt;</code></pre>");
    expect(html).toContain("<ul><li>one</li><li>two</li></ul>");
    expect(html).toContain('lang="en"');
    expect(html).toContain('href="./"');
  });
  it("rewrites repo links to GitHub and the live site to a relative link, and throws on dead links", () => {
    const html = renderManual("# T\n\n[a](../README.md) [b](DEMO.md#x) [c](../.kiro/steering/failsafe.md) [d](https://e-1305.github.io/Crypt/) [e](#t)", manualOpts());
    expect(html).toContain('href="https://github.com/e-1305/Crypt/blob/main/README.md"');
    expect(html).toContain('href="https://github.com/e-1305/Crypt/blob/main/docs/DEMO.md#x"');
    expect(html).toContain('href="https://github.com/e-1305/Crypt/blob/main/.kiro/steering/failsafe.md"');
    expect(html).toContain('href="./"');
    expect(html).toContain('href="#t"');
    expect(() => renderManual("# T\n\n[x](NOPE.md)", manualOpts())).toThrow(/neither/);
    expect(() => renderManual("# T\n\n[x](#missing)", manualOpts())).toThrow(/missing heading/);
    expect(() => renderManual("# T\n\n[x](javascript:alert(1))", manualOpts())).toThrow();
  });
  it("renders the real manual with Quick start for testers as its first section", () => {
    const html = renderManual(manualMd, manualOpts());
    expect(html.match(/<h2 id="[^"]*">/)![0]).toBe('<h2 id="quick-start-for-testers">');
    expect(html).not.toMatch(/href="(\.\.\/|[^"#:]*\.md)/);
    expect(html).not.toContain("\u2014");
    expect(html).not.toContain("<script");
  });
  it("accepts every command in the Quick start code spans", () => {
    const section = manualMd.slice(manualMd.indexOf("## Quick start for testers"), manualMd.indexOf("## 1. Install"));
    const cmds = [...section.matchAll(/`((?:EXAMINE|GRAFT|ASSIGN) [A-Z]+|RAID|SEAL CRYPT)`/g)].map((m) => m[1]!);
    expect(cmds).toEqual(expect.arrayContaining(["EXAMINE JQUERY", "GRAFT JQUERY", "RAID", "SEAL CRYPT"]));
    for (const c of cmds) expect(parseCommand(c).ok, c).toBe(true);
  });
  it("is linked from the 2D page and from the 3D bench", () => {
    expect(readFileSync(join(ROOT, "web", "index.html"), "utf8")).toContain('href="manual.html"');
    const stage = readFileSync(join(ROOT, "web", "theatre", "stage.js"), "utf8");
    expect(stage).toContain("manual.html");
    expect(stage).toContain("theatre-manual");
  });
  it("opens the manual in a new tab with noopener and a label that says so, on both pages", () => {
    const stage = readFileSync(join(ROOT, "web", "theatre", "stage.js"), "utf8");
    const fn = stage.slice(stage.indexOf("function addManualLink"));
    expect(fn).toContain('a.target = "_blank"');
    expect(fn).toContain('a.rel = "noopener"');
    expect(fn).toContain("opens in a new tab");
    const tag = /<a [^>]*id="manual-link"[^>]*>/.exec(readFileSync(join(ROOT, "web", "index.html"), "utf8"))?.[0] ?? "";
    expect(tag).toContain('target="_blank"');
    expect(tag).toContain('rel="noopener"');
    expect(tag).toContain("opens in a new tab");
  });
  it("renders italics and level 4 headings, and refuses syntax it cannot render", () => {
    const html = renderManual("# T\n\nintro *one* and _two_ snake_case 2*3*4\n\n#### Deep\n\n- a\n  continued\n", manualOpts());
    expect(html).toContain("<em>one</em>");
    expect(html).toContain("<em>two</em>");
    expect(html).toContain("snake_case");
    expect(html).toContain('<h4 id="deep">Deep</h4>');
    expect(() => renderManual("# T\n\n- a\n  - nested\n", manualOpts())).toThrow(/nested/);
    expect(() => renderManual("# T\n\n> quote\n", manualOpts())).toThrow(/unsupported/);
    expect(() => renderManual("# T\n\n![x](a.png)\n", manualOpts())).toThrow(/unsupported/);
  });
  it("keeps a relative link to a site file relative", () => {
    const html = renderManual("# T\n\n[m](manual.css)", manualOpts({ siteHas: (p) => p === "manual.css", repoHas: () => false }));
    expect(html).toContain('href="manual.css"');
  });
});

const haveToolchain = existsSync(inform6Path());
if (!haveToolchain) console.warn("site build skipped: toolchain missing, run `npm run setup`");

describe.skipIf(!haveToolchain)("build:site output", () => {
  const dirs: string[] = [];
  const build = async () => {
    const d = mkdtempSync(join(tmpdir(), "crypt-site-test-"));
    dirs.push(d);
    await buildSite(d);
    return d;
  };
  const files = (d: string): string[] => readdirSync(d, { recursive: true, withFileTypes: true }).filter((e) => e.isFile()).map((e) => join(e.parentPath, e.name));

  it("is a complete, offline, deterministic static site", async () => {
    const a = await build();
    try {
      for (const f of ["index.html", "manual.html", "manual.css", "app.js", "style.css", "vendor/zvm.min.js", "vendor/three.module.min.js", "theatre.js", "raid.js", "theatre/stage.js", "theatre/drawer.js", "js/theatre/capability.js", "js/web/player.js", "game/demo.z8", "game/demo.json", "game/demo.payloads.json", "game/index.json"]) {
        expect(existsSync(join(a, f)), f).toBe(true);
      }
      expect(readFileSync(join(a, "game", "demo.z8"))[0]).toBe(8);
      const demo = JSON.parse(readFileSync(join(a, "game", "demo.json"), "utf8"));
      expect(Array.isArray(demo.limbs) && demo.limbs.length > 0).toBe(true);
      // Visual QA 1: the default demo is the crypt-demo snapshot, owned by @e-1305, with its commit SHA recorded.
      expect(demo.repo).toBe("crypt-demo");
      const snap = JSON.parse(readFileSync(join(import.meta.dirname, "..", "fixtures", "crypt-demo", "SNAPSHOT.json"), "utf8"));
      expect(snap.commit).toMatch(/^[0-9a-f]{40}$/);
      expect(snap.owner).toBe("@e-1305");
      expect(JSON.stringify(JSON.parse(readFileSync(join(a, "game", "demo.payloads.json"), "utf8")))).toContain("@e-1305");
      const payloads = JSON.parse(readFileSync(join(a, "game", "demo.payloads.json"), "utf8"));
      expect(Object.keys(payloads).length).toBeGreaterThan(0);
      for (const p of Object.values(payloads) as { dryRun: boolean; sent: boolean }[]) expect([p.dryRun, p.sent]).toEqual([true, false]);

      const index = JSON.parse(readFileSync(join(a, "game", "index.json"), "utf8")) as { slug: string; repo: string }[];
      expect(index).toHaveLength(20);
      expect(index.map((e) => e.repo.toLowerCase())).toEqual(index.map((e) => e.repo.toLowerCase()).sort());
      for (const e of index) {
        expect(readFileSync(join(a, "game", `${e.slug}.z8`))[0], e.slug).toBe(8);
        expect(Object.keys(JSON.parse(readFileSync(join(a, "game", `${e.slug}.json`), "utf8"))).sort()).toEqual(["limbs", "repo"]);
      }

      const manual = readFileSync(join(a, "manual.html"), "utf8");
      expect(manual).toContain("Quick start for testers");
      expect(manual).toContain("<main");
      expect(manual).toContain('lang="en"');
      expect(manual).toContain('href="./"');
      expect(manual).not.toContain("<script");
      expect(manual).not.toContain("\u2014");
      expect(manual).not.toMatch(/href="(\.\.\/|[^"#:]*\.md)/);
      const ids = new Set([...manual.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));
      for (const m of manual.matchAll(/\b(?:href|src)="([^"]+)"/g)) {
        const u = m[1]!;
        if (u.startsWith("#")) expect(ids.has(u.slice(1)), u).toBe(true);
        else if (!/^https:/.test(u)) expect(existsSync(join(a, u.split("#")[0] || ".")), u).toBe(true);
      }
      expect(readFileSync(join(a, "index.html"), "utf8")).toContain('href="manual.html"');

      // Relative URLs only, and the page code opens no connection except to its own files.
      for (const f of ["index.html", "app.js", "style.css", ...files(join(a, "js")).map((x) => x.slice(a.length + 1))]) {
        const text = readFileSync(join(a, f), "utf8");
        // The live exhume modules (paste your repo) read raw.githubusercontent.com and api.osv.dev, and nothing else.
        const live = f === "js/web/live-exhume.js" || f === "js/exhume/osv-client.js" || f === "js/necromancer/package-advisories.js" || f === "js/render/card.js";
        const allowed = f === "index.html" ? "(?!github\\.com\\/owner\\/repo|github\\.com\\/e-1305\\/)" : live ? "(?!github\\.com\\/owner\\/repo|raw\\.githubusercontent\\.com|api\\.osv\\.dev|e-1305\\.github\\.io|www\\.linkedin\\.com|github\\.com\\/e-1305\\/)" : "(?!github\\.com\\/owner\\/repo)";
        expect(text, f).not.toMatch(new RegExp(`https?:\\/\\/${allowed}`));
        if (!live) expect(text, f).not.toMatch(/\b(XMLHttpRequest|WebSocket|sendBeacon)\b|method:\s*["']POST/);
        else expect(text, f).not.toMatch(/\b(XMLHttpRequest|WebSocket|sendBeacon)\b/);
      }
      expect(readFileSync(join(a, "app.js"), "utf8").match(/fetch\(([^)]*)\)/g)!.every((c) => /"game\//.test(c))).toBe(true);

      const b = await build();
      for (const f of ["game/demo.z8", "game/demo.json", "game/demo.payloads.json", "game/index.json"]) {
        expect(readFileSync(join(b, f)).equals(readFileSync(join(a, f))), f).toBe(true);
      }
    } finally {
      for (const d of dirs) rmSync(d, { recursive: true, force: true });
    }
  }, 240_000);
});
