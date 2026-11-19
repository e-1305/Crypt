// creature.json from an imported scanner file. Same shape as buildCreature (schemaVersion 1), no OSV call.
import type { EpssFeed, KevFeed } from "../exhume/feeds.js";
import { ownerOf, parseCodeowners } from "../exhume/owners.js";
import { countLimbs, rankLimbs, severityNumber } from "../exhume/rank.js";
import { limbKey } from "../exhume/types.js";
import type { OsvVuln } from "../exhume/types.js";
import { type ImportFormat, parseImport } from "./index.js";

export interface ImportOptions {
  format: ImportFormat;
  text: string;
  /** File name shown as the manifest of every limb. */
  file: string;
  /** Repository name written to creature.json as "repo". Omitted when empty. */
  name?: string;
  kev: KevFeed | null;
  epss: EpssFeed | null;
  /** CODEOWNERS text. Without it every limb has the default owner (unowned). */
  codeowners?: string;
}

/**
 * Ranking uses only KEV and EPSS: the vendor severity is stripped before rankLimbs and
 * reported as the display field vendorSeverity (highest label of the limb, or null).
 */
export function buildImportedCreature(o: ImportOptions) {
  const parsed = parseImport(o.format, o.text, o.file);
  const rules = o.codeowners === undefined ? [] : parseCodeowners(o.codeowners);
  const ownerOfManifest = (p: string) => ownerOf(rules, p);
  const osv = new Map<string, OsvVuln[]>();
  const vendor = new Map<string, string | null>();
  for (const { limb, vulns } of parsed) {
    const k = limbKey(limb);
    if (vulns === undefined) continue; // absent from the map: unknown, never Healthy
    osv.set(k, vulns.map((v) => ({ ...v, severity: null })));
    const top = vulns.reduce<string | null>((m, v) => (severityNumber(v.severity) > severityNumber(m) ? v.severity : m), null);
    vendor.set(k, top);
  }
  const ranked = rankLimbs({ limbs: parsed.map((p) => p.limb), osv, kev: o.kev, epss: o.epss, ownerOfManifest });
  const ecosystems = [...new Set(ranked.map((l) => l.ecosystem))].sort();
  return {
    schemaVersion: 1,
    ...(o.name ? { repo: o.name } : {}),
    import: { format: o.format, file: o.file },
    feeds: {
      kev: { status: o.kev ? "ok" : "missing", date: o.kev?.date ?? null },
      epss: { status: o.epss ? "ok" : "missing", date: o.epss?.date ?? null },
    },
    counts: countLimbs(ranked),
    manifests: ecosystems.map((ecosystem) => ({ path: o.file, ecosystem, owner: ownerOfManifest(o.file) })),
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
      vendorSeverity: vendor.get(l.id) ?? null,
      vulns: l.vulns,
      usage: "unknown" as const,
      usageBasis: "imported scanner file, source not read",
    })),
  };
}
