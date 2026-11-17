// Pure helpers for the Pages build: gallery snapshots, the alphabetical index and the dry-run payload preview.
// No fs, clock, random or network. A snapshot holds one repository's own public data and nothing from any other.
import { repoSlug } from "../web/repo-url.js";

export const MAX_GALLERY_LIMBS = 40;

export interface GalleryLimb {
  rank: number;
  ecosystem: string;
  name: string;
  version: string;
  state: string;
  spawned: boolean;
  kev: boolean;
  epss: number | null;
  vulns: { id: string; cves: string[] }[];
}

export interface GallerySnapshot {
  schemaVersion: 1;
  repo: string;
  sha: string;
  /** Packages this repository's scan found, before the cap. */
  scannedLimbs: number;
  counts: { unresolved: number };
  limbs: GalleryLimb[];
}

export interface GalleryIndexEntry {
  slug: string;
  repo: string;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown, d = ""): string => (typeof v === "string" ? v : d);

/** Keeps the limbs that need attention (not Healthy), highest rank first, capped. Owners are dropped. */
export function snapshotCreature(creature: unknown, repo: string, sha: string): GallerySnapshot | null {
  if (!isObj(creature) || creature.schemaVersion !== 1 || !Array.isArray(creature.limbs)) return null;
  const all = creature.limbs.filter(isObj);
  const sick = all
    .filter((l) => l.state !== "Healthy")
    .sort((a, b) => (typeof a.rank === "number" ? a.rank : 1e9) - (typeof b.rank === "number" ? b.rank : 1e9));
  const limbs: GalleryLimb[] = sick.slice(0, MAX_GALLERY_LIMBS).map((l, i) => ({
    rank: i + 1,
    ecosystem: str(l.ecosystem),
    name: str(l.name),
    version: str(l.version),
    state: str(l.state),
    spawned: l.spawned === true,
    kev: l.kev === true,
    epss: typeof l.epss === "number" ? l.epss : null,
    vulns: (Array.isArray(l.vulns) ? l.vulns : []).filter(isObj).map((v) => ({
      id: str(v.id),
      cves: Array.isArray(v.cves) ? v.cves.filter((c): c is string => typeof c === "string") : [],
    })),
  }));
  const unresolved = isObj(creature.counts) && typeof creature.counts.unresolved === "number" ? creature.counts.unresolved : 0;
  return { schemaVersion: 1, repo, sha, scannedLimbs: all.length, counts: { unresolved }, limbs };
}

/** Alphabetical by repository name. Never ordered by findings, severity or size. */
export function galleryIndex(entries: GalleryIndexEntry[]): GalleryIndexEntry[] {
  return [...entries].sort((a, b) => (a.repo.toLowerCase() < b.repo.toLowerCase() ? -1 : a.repo.toLowerCase() > b.repo.toLowerCase() ? 1 : 0));
}

export function slugForRepo(repo: string): string {
  const [owner = "", name = ""] = repo.split("/");
  return repoSlug({ owner, repo: name });
}

export interface PayloadPreview {
  dryRun: true;
  sent: false;
  title: string;
  branch: string;
  body: string;
  files: string[];
}

/** What a graft would propose for a limb, built from the snapshot alone. Nothing is sent. */
export function previewPayload(limbId: string, limb: GalleryLimb): PayloadPreview {
  const cves = [...new Set(limb.vulns.flatMap((v) => v.cves))].sort();
  const body = [
    `Limb: ${limbId} (${limb.name})`,
    `Version: ${limb.version} -> the lowest fixed version, chosen from OSV ranges when you run crypt on your checkout`,
    `CVEs: ${cves.length ? cves.join(", ") : "none listed"}`,
    `KEV: ${limb.kev ? "yes" : "no"}`,
    `EPSS: ${limb.epss === null ? "unknown" : limb.epss.toFixed(5)}`,
    "",
    "One dependency per PR. A human lands this PR after CI is green.",
    "",
  ].join("\n");
  return {
    dryRun: true,
    sent: false,
    title: `fix: graft ${limb.name} ${limb.version} (${limbId})`,
    branch: `crypt/graft-${limbId.toLowerCase()}`,
    body,
    files: ["package.json", "package-lock.json"],
  };
}
