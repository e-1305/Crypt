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
      for (const f of ["index.html", "app.js", "style.css", "vendor/zvm.min.js", "vendor/three.module.min.js", "theatre.js", "raid.js", "theatre/stage.js", "theatre/drawer.js", "js/theatre/capability.js", "js/web/player.js", "game/demo.z8", "game/demo.json", "game/demo.payloads.json", "game/index.json"]) {
        expect(existsSync(join(a, f)), f).toBe(true);
      }
      expect(readFileSync(join(a, "game", "demo.z8"))[0]).toBe(8);
      const demo = JSON.parse(readFileSync(join(a, "game", "demo.json"), "utf8"));
      expect(Array.isArray(demo.limbs) && demo.limbs.length > 0).toBe(true);
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

      // Relative URLs only, and the page code opens no connection except to its own files.
      for (const f of ["index.html", "app.js", "style.css", ...files(join(a, "js")).map((x) => x.slice(a.length + 1))]) {
        const text = readFileSync(join(a, f), "utf8");
        expect(text, f).not.toMatch(/https?:\/\/(?!github\.com\/owner\/repo)/);
        expect(text, f).not.toMatch(/\b(XMLHttpRequest|WebSocket|sendBeacon)\b|method:\s*["']POST/);
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
