// npm run build:site [-- --out _site]: the static GitHub Pages site. Offline and deterministic: no network at build time.
// Builds the demo creature from fixtures/vulnerable-npm (offline exhume, raise, dry-run grafts) and one creature per
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
import { raiseCreature } from "./compile.js";
import { fixtureAdvisories } from "./osv-advisory.js";

const ROOT = resolve(import.meta.dirname, "..");
const WEB = join(ROOT, "web");
const FIXTURE = join(ROOT, "fixtures", "vulnerable-npm");

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

/** The real necromancer in dry-run mode over the fixture: the payloads are what `crypt raid --offline` writes. */
async function demoPayloads(work: string, creaturePath: string, limbs: LimbRefs): Promise<Record<string, unknown>> {
  const dir = join(work, "demo-graft");
  const paths = { ...defaultPaths(dir), creaturePath };
  mkdirSync(join(dir, "out"), { recursive: true });
  writeFileSync(paths.limbsPath, JSON.stringify(limbs));
  const creature = JSON.parse(readFileSync(creaturePath, "utf8"));
  // A fixed clock keeps the build byte-identical: the feed snapshot date of the fixture.
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
      targetDir: FIXTURE,
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

export async function buildSite(outDir: string): Promise<void> {
  const work = mkdtempSync(join(tmpdir(), "crypt-site-"));
  try {
    run("npx", ["tsc", "-p", "tsconfig.web.json"]);
    rmSync(outDir, { recursive: true, force: true });
    mkdirSync(join(outDir, "game"), { recursive: true });
    // Every top-level script of the page (app.js, theatre.js, raid.js, ...) plus the page and its style.
    const scripts = readdirSync(WEB).filter((f) => f.endsWith(".js"));
    for (const f of ["index.html", "style.css", ...scripts]) cpSync(join(WEB, f), join(outDir, f));
    cpSync(join(WEB, "vendor"), join(outDir, "vendor"), { recursive: true });
    cpSync(join(WEB, "js"), join(outDir, "js"), { recursive: true });
    cpSync(join(WEB, "theatre"), join(outDir, "theatre"), { recursive: true });
    writeFileSync(join(outDir, ".nojekyll"), "");
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

    // Demo: exhume the fixture offline with its own feed snapshot.
    const demoCreature = join(work, "demo-creature.json");
    run("npx", ["tsx", "scripts/exhume.ts", "fixtures/vulnerable-npm", "--feeds", "fixtures/vulnerable-npm/feeds", "--offline", "--out", demoCreature]);
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
