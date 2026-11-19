// npm run build:site [-- --out _site]: the static GitHub Pages site. Offline and deterministic: no network at build time.
// Builds the demo creature (crypt-demo, owner @e-1305) from the committed snapshot fixtures/crypt-demo (offline exhume, raise, dry-run grafts) and one creature per
// gallery snapshot in web/gallery-data/. Every URL the page uses is relative, so it works under /Crypt/.
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { defaultPaths } from "../src/common/agent.js";
import { nodeIo } from "../src/common/io.js";
import { plateInput } from "../src/render/plate.js";
import { dryRunClient } from "../src/github/client.js";
import { graft } from "../src/necromancer/index.js";
import { galleryIndex, previewPayload, type GalleryIndexEntry, type GallerySnapshot, type PayloadPreview } from "../src/site/gallery.js";
import { renderManual } from "../src/site/manual.js";
import { renderAutopsyHtml } from "../src/report/html.js";
import { buildAutopsy } from "../src/report/model.js";
import { SAMPLE_INPUT, sampleLimbHistory } from "../src/report/sample.js";
import { fromSnapshot, serializeGraveyard } from "../src/graveyard/model.js";
import { parseEpss, parseKev } from "../src/exhume/feeds.js";
import { serializeFeedSnapshot, SNAPSHOT_MIN_EPSS } from "../src/web/feed-snapshot.js";
import { raiseCreature } from "./compile.js";
import { fixtureAdvisories } from "./osv-advisory.js";

const ROOT = resolve(import.meta.dirname, "..");
const WEB = join(ROOT, "web");
const FIXTURE = join(ROOT, "fixtures", "vulnerable-npm");
/** Fixed scan time of the census graveyard (the census snapshot date), so the build is byte-identical and offline. */
const CENSUS_SCANNED_AT = Date.UTC(2025, 10, 1);
/** The committed snapshot of e-1305/crypt-demo at a pinned commit (SNAPSHOT.json records the SHA). */
const DEMO = join(ROOT, "fixtures", "crypt-demo");

function run(cmd: string, args: string[]): void {
  const r = spawnSync(cmd, args, { cwd: ROOT, stdio: "inherit" });
  if (r.status !== 0) throw new Error(`step failed: ${cmd} ${args.join(" ")}`);
}

type LimbRefs = Record<string, { ecosystem: string; name: string; version: string }>;

/** Writes game/<id>.z8, <id>.json (what the plate reads) and <id>.payloads.json (dry-run PR payloads by limb ID). */
function emit(gameDir: string, id: string, work: string, payloads: (limbs: LimbRefs) => Promise<Record<string, PayloadPreview | unknown>>) {
  return async (creaturePath: string) => {
    const outDir = join(work, id);
    raiseCreature(creaturePath, outDir);
    const creature = JSON.parse(readFileSync(creaturePath, "utf8"));
    const limbs = JSON.parse(readFileSync(join(outDir, "limbs.json"), "utf8")) as LimbRefs;
    cpSync(join(outDir, "creature.z8"), join(gameDir, `${id}.z8`));
    writeFileSync(join(gameDir, `${id}.json`), JSON.stringify(plateInput(creature)));
    writeFileSync(join(gameDir, `${id}.payloads.json`), JSON.stringify(await payloads(limbs)));
  };
}

/** The real necromancer in dry-run mode over the crypt-demo snapshot: the payloads are what `crypt raid --offline` writes. */
async function demoPayloads(work: string, creaturePath: string, limbs: LimbRefs): Promise<Record<string, unknown>> {
  const dir = join(work, "demo-graft");
  const paths = { ...defaultPaths(dir), creaturePath };
  mkdirSync(join(dir, "out"), { recursive: true });
  writeFileSync(paths.limbsPath, JSON.stringify(limbs));
  const creature = JSON.parse(readFileSync(creaturePath, "utf8"));
  // A fixed clock keeps the build byte-identical: the feed snapshot date.
  const stamp = new Date(String(creature.feeds?.epss?.date ?? 0));
  const out: Record<string, unknown> = {};
  for (const id of Object.keys(limbs).sort()) {
    const req = join(dir, `request-${id}.json`);
    writeFileSync(req, JSON.stringify({ limb: id }));
    const ctx = {
      ...paths,
      io: nodeIo,
      client: dryRunClient(nodeIo, paths.prsDir, () => stamp),
      advisories: fixtureAdvisories(join(FIXTURE, "advisories")),
      targetDir: DEMO,
      now: () => stamp,
    };
    const r = await graft(ctx, req);
    if (r.outcome === "DRYRUN_WRITTEN" && r.branch) {
      const file = nodeIo.listDir(paths.prsDir).find((f) => f.includes(id.toLowerCase()));
      if (!file) continue;
      const p = JSON.parse(readFileSync(join(paths.prsDir, file), "utf8"));
      out[id] = { dryRun: true, sent: false, title: p.title, branch: p.branch, body: p.body, files: p.files.map((f: { path: string }) => f.path) };
    }
  }
  return out;
}

/**
 * The KEV and EPSS snapshot the page ranks with. Full feeds from `npm run feeds:update` (data/feeds) when present, else the committed
 * fixture feeds, so the build stays offline. Returns the compact JSON text and its dates.
 */
export function feedSnapshotText(feedDirs: string[] = [join(ROOT, "data", "feeds"), join(FIXTURE, "feeds")]): string {
  for (const dir of feedDirs) {
    try {
      const kev = parseKev(readFileSync(join(dir, "kev.json"), "utf8"));
      const epss = parseEpss(readFileSync(join(dir, "epss.csv"), "utf8"));
      // A small committed fixture keeps every score; the full feed keeps the ones that can matter.
      if (kev && epss) return serializeFeedSnapshot(kev, epss, epss.scores.size > 5000 ? SNAPSHOT_MIN_EPSS : 0);
    } catch {
      // try the next directory
    }
  }
  throw new Error("no valid KEV and EPSS feeds found in data/feeds or fixtures/vulnerable-npm/feeds");
}

export async function buildSite(outDir: string): Promise<void> {
  const work = mkdtempSync(join(tmpdir(), "crypt-site-"));
  try {
    run("npx", ["tsc", "-p", "tsconfig.web.json"]);
    rmSync(outDir, { recursive: true, force: true });
    mkdirSync(join(outDir, "game"), { recursive: true });
    // Every top-level script of the page (app.js, theatre.js, raid.js, ...) plus the page and its style.
    const scripts = readdirSync(WEB).filter((f) => f.endsWith(".js"));
    for (const f of ["index.html", "for-teams.html", "for-teams.css", "style.css", ...scripts]) cpSync(join(WEB, f), join(outDir, f));
    cpSync(join(WEB, "vendor"), join(outDir, "vendor"), { recursive: true });
    cpSync(join(WEB, "js"), join(outDir, "js"), { recursive: true });
    cpSync(join(WEB, "theatre"), join(outDir, "theatre"), { recursive: true });
    cpSync(join(WEB, "card"), join(outDir, "card"), { recursive: true });
    cpSync(join(WEB, "fonts"), join(outDir, "fonts"), { recursive: true });
    // War Room (Epic D4): the page is served as war-room.html, its css and js sit in war-room/ beside it. All URLs are relative.
    cpSync(join(WEB, "war-room", "war-room.html"), join(outDir, "war-room.html"));
    cpSync(join(WEB, "war-room"), join(outDir, "war-room"), { recursive: true, filter: (src) => !src.endsWith(".html") });
    // Real crypt-demo history of 2026-11-18 (docs/PROOF.md), read by the War Room history panel.
    cpSync(join(ROOT, "fixtures", "history", "crypt-demo-2026-11-18.jsonl"), join(outDir, "war-room", "crypt-history-demo.jsonl"));
    writeFileSync(join(outDir, ".nojekyll"), "");
    writeFileSync(join(outDir, "feeds.json"), feedSnapshotText());
    cpSync(join(WEB, "manual.css"), join(outDir, "manual.css"));
    // The user manual, rendered offline. A relative link that is neither a repo file nor a site file fails the build.
    writeFileSync(
      join(outDir, "manual.html"),
      renderManual(readFileSync(join(ROOT, "docs", "USER_MANUAL.md"), "utf8"), {
        sourcePath: "docs/USER_MANUAL.md",
        repoBlobBase: "https://github.com/e-1305/Crypt/blob/main/",
        siteBase: "https://e-1305.github.io/Crypt/",
        repoHas: (p) => existsSync(join(ROOT, p)),
        siteHas: (p) => existsSync(join(outDir, p)),
      }),
    );
    const gameDir = join(outDir, "game");

    // Demo: exhume the crypt-demo snapshot offline with the committed feed snapshot and OSV cache.
    const demoCreature = join(work, "demo-creature.json");
    run("npx", ["tsx", "scripts/exhume.ts", "fixtures/crypt-demo", "--name", "crypt-demo", "--feeds", "fixtures/vulnerable-npm/feeds", "--offline", "--out", demoCreature]);
    await emit(gameDir, "demo", work, (limbs) => demoPayloads(work, demoCreature, limbs))(demoCreature);

    // Gallery: one creature per committed snapshot.
    const snapDir = join(WEB, "gallery-data");
    const index: GalleryIndexEntry[] = [];
    for (const f of readdirSync(snapDir).filter((n) => n.endsWith(".json")).sort()) {
      const snap = JSON.parse(readFileSync(join(snapDir, f), "utf8")) as GallerySnapshot;
      const slug = f.replace(/\.json$/, "");
      index.push({ slug, repo: snap.repo });
      await emit(gameDir, slug, work, async (limbs) => {
        const out: Record<string, PayloadPreview> = {};
        for (const [id, ref] of Object.entries(limbs)) {
          const l = snap.limbs.find((x) => x.ecosystem === ref.ecosystem && x.name === ref.name && x.version === ref.version);
          if (l && l.spawned && l.ecosystem === "npm") out[id] = previewPayload(id, l);
        }
        return out;
      })(join(snapDir, f));
    }
    // The graveyard page (D1) and its offline census data: each repo's own public snapshot, owners dropped, no network.
    cpSync(join(WEB, "graveyard"), join(outDir, "graveyard"), { recursive: true });
    // graveyard/ alone serves the same page, so the directory URL does not 404 on Pages.
    cpSync(join(WEB, "graveyard", "graveyard.html"), join(outDir, "graveyard", "index.html"));
    // The CISO report sample: `crypt autopsy --sample` on the fixed sample clock (deterministic), labelled SAMPLE DATA by the page itself.
    writeFileSync(join(outDir, "autopsy.html"), renderAutopsyHtml(buildAutopsy({ ...SAMPLE_INPUT, limbHistory: sampleLimbHistory(SAMPLE_INPUT) })));
    const records = readdirSync(snapDir)
      .filter((n) => n.endsWith(".json"))
      .sort()
      .map((n) => fromSnapshot(JSON.parse(readFileSync(join(snapDir, n), "utf8")), CENSUS_SCANNED_AT))
      .filter((r) => r !== null);
    writeFileSync(join(outDir, "graveyard", "census.json"), serializeGraveyard({ source: "census", repos: records }));
    writeFileSync(join(gameDir, "index.json"), JSON.stringify(galleryIndex(index)));
    console.log(`site: wrote ${outDir} (demo + ${index.length} gallery creatures)`);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

if (process.argv[1]?.endsWith("build-site.ts")) {
  const i = process.argv.indexOf("--out");
  const out = resolve(ROOT, i > 0 ? (process.argv[i + 1] ?? "_site") : "_site");
  if (!existsSync(join(WEB, "gallery-data"))) {
    console.error("site: web/gallery-data is missing. Run npm run census, then npm run gallery:snapshot.");
    process.exit(1);
  }
  buildSite(out).catch((e) => {
    console.error(`site: ${(e as Error).message}`);
    process.exit(1);
  });
}
