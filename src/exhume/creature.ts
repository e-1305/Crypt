import { countsPhrase } from "../common/counts.js";
import { CODEOWNERS_LOCATIONS, ownerLabel, ownerOf, parseCodeowners } from "./owners.js";
import type { EpssFeed, KevFeed } from "./feeds.js";
import { parsePackageLock, parseRequirements } from "./lockfile.js";
import { type OsvLookup, resolveOsv } from "./osv.js";
import { countLimbs, rankLimbs } from "./rank.js";
import { type SourceFile, classifyUsage, scanImports, usageForLimb, usageOf, USAGE_LIMIT_LINE } from "./usage.js";
import { type ExhumeFs, type Limb, compareLimbs } from "./types.js";

export const MANIFESTS = ["package-lock.json", "requirements.txt"] as const;

export interface ExhumeOptions {
  /** Reads files of the target repository, paths relative to its root. */
  repo: Pick<ExhumeFs, "read">;
  /** Cache storage (read and write). */
  cacheFs: ExhumeFs;
  cacheDir: string;
  kev: KevFeed | null;
  epss: EpssFeed | null;
  lookup?: OsvLookup;
  /** Current time in ms, used only for the OSV cache TTL. */
  now?: number;
  /** Repository name written to creature.json as "repo". Omitted when not given. */
  name?: string;
  /**
   * Source files of the target for the "is it used?" scan. Null, empty or a throw means the source could not be read:
   * every npm limb then gets "unknown" (or "dev only" from the lockfile). Absent: same.
   */
  sources?: () => SourceFile[] | null;
}

function readImports(o: ExhumeOptions): Set<string> | null {
  try {
    const files = o.sources?.();
    if (!files || files.length === 0) return null;
    return scanImports(files);
  } catch {
    return null;
  }
}

/** No supported manifest was readable: the run says nothing about the repository. */
export class NoManifestError extends Error {
  constructor() {
    super(
      `no ${MANIFESTS.join(" or ")} found at the repository root (manifests in subdirectories are not read); nothing was exhumed`,
    );
  }
}

export async function buildCreature(o: ExhumeOptions) {
  const manifests: { path: string; ecosystem: "npm" | "PyPI"; owner: string }[] = [];
  const limbs: Limb[] = [];

  let rules: ReturnType<typeof parseCodeowners> = [];
  for (const loc of CODEOWNERS_LOCATIONS) {
    const text = o.repo.read(loc);
    if (text !== null) {
      rules = parseCodeowners(text);
      break;
    }
  }
  const ownerOfManifest = (p: string) => ownerOf(rules, p);

  const lock = o.repo.read("package-lock.json");
  if (lock !== null) {
    limbs.push(...parsePackageLock(lock, "package-lock.json"));
    manifests.push({ path: "package-lock.json", ecosystem: "npm", owner: ownerOfManifest("package-lock.json") });
  }
  const req = o.repo.read("requirements.txt");
  if (req !== null) {
    limbs.push(...parseRequirements(req, "requirements.txt"));
    manifests.push({ path: "requirements.txt", ecosystem: "PyPI", owner: ownerOfManifest("requirements.txt") });
  }
  if (manifests.length === 0) throw new NoManifestError();
  limbs.sort(compareLimbs);

  const osv = await resolveOsv(limbs, { fs: o.cacheFs, cacheDir: o.cacheDir, lookup: o.lookup, now: o.now });
  const ranked = rankLimbs({
    limbs,
    osv: osv.known,
    stale: osv.stale,
    kev: o.kev,
    epss: o.epss,
    ownerOfManifest,
  });
  const usage = lock !== null ? classifyUsage(lock, readImports(o)) : null;
  return {
    schemaVersion: 1,
    ...(o.name ? { repo: o.name } : {}),
    feeds: {
      kev: { status: o.kev ? "ok" : "missing", date: o.kev?.date ?? null },
      epss: { status: o.epss ? "ok" : "missing", date: o.epss?.date ?? null },
    },
    counts: countLimbs(ranked),
    manifests,
    limbs: ranked.map((l) => ({
      rank: l.rank,
      id: l.id,
      ecosystem: l.ecosystem,
      name: l.name,
      version: l.version,
      direct: l.direct,
      manifest: l.manifest,
      owner: l.owner,
      state: l.state,
      unknown: l.unknown,
      unknownReason: l.unknownReason,
      spawned: l.spawned,
      score: l.score,
      kev: l.kev,
      epss: l.epss,
      severity: l.severity,
      vulns: l.vulns,
      usage: usageForLimb(l, usage).signal,
      usageBasis: usageForLimb(l, usage).basis,
    })),
  };
}

export type Creature = Awaited<ReturnType<typeof buildCreature>>;

export function serializeCreature(c: Creature): string {
  return JSON.stringify(c, null, 2) + "\n";
}

export function summarize(c: Creature, top = 5): string {
  const n = c.counts;
  const lines = [
    `CRYPT exhume: ${countsPhrase({ dependencies: n.limbs, findings: n.findings, spawned: n.spawned, noise: n.exorcised, unresolved: n.unresolved })}`,
    `  possessed ${n.possessed}, rotting ${n.rotting}, healthy ${n.healthy}, unknown ${n.unknown}`,
    `  KEV feed: ${c.feeds.kev.status}${c.feeds.kev.date ? ` (${c.feeds.kev.date})` : ""}`,
    `  EPSS feed: ${c.feeds.epss.status}${c.feeds.epss.date ? ` (${c.feeds.epss.date})` : ""}`,
  ];
  for (const l of c.limbs.slice(0, top)) {
    if (l.state === "Healthy") break;
    lines.push(`  #${l.rank} ${l.state}${l.unknown ? " (unknown)" : ""} ${l.id} owner: ${ownerLabel(l.owner)} used: ${usageOf((l as { usage?: unknown }).usage)}`);
  }
  lines.push(`  ${USAGE_LIMIT_LINE}`);
  return lines.join("\n");
}
