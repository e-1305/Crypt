// Graveyard model: one tomb per repository. Pure: no fs, clock or network (the caller supplies `now`).
// Never throws on junk input. Failure is attributed to limbs (packages) and counted per repo, never to a person.
// Aggregate safe: no function ranks repositories globally or names a "worst" one. Sorting and filtering are
// views a user chooses; the default order is alphabetical by repository.

export const SCHEMA_VERSION = 1;
export const HOUR_MS = 3_600_000;
export const DAY_MS = 24 * HOUR_MS;
/** sla-policy.md: Possessed (in CISA KEV) = 48 hours. */
export const POSSESSED_WINDOW_MS = 48 * HOUR_MS;
/** sla-policy.md: EPSS >= 0.1 = this sprint (14 days). */
export const SPRINT_WINDOW_MS = 14 * DAY_MS;
export const EPSS_SPRINT_LINE = 0.1;
/** A window is "at risk" once 75% of it is used. */
export const AT_RISK_SHARE = 0.75;
/** Exploitable risk: a limb in CISA KEV counts ten times its EPSS. */
export const KEV_WEIGHT = 10;
/** A finding with no EPSS score still counts a little, so risk is never 0 for an open finding. */
export const EPSS_FLOOR = 0.01;
export const NO_OWNER = "no owner yet";
export const MAX_REPOS = 500;
export const MAX_LIMBS_PER_REPO = 5000;

export type LimbState = "Possessed" | "Rotting" | "Healthy";
export type SlaState = "ok" | "at-risk" | "breached";
export type SizeBucket = "small" | "medium" | "large" | "huge";
export type Glow = 0 | 1 | 2 | 3;
export type Source = "live" | "census" | "cli";

/** One open finding of a repository. `owner` is a CODEOWNERS team ("@org/team") or "unowned". */
export interface LimbRecord {
  name: string;
  state: LimbState;
  kev: boolean;
  epss: number | null;
  owner: string;
}

/** What is stored in graveyard.json for one repository. */
export interface RepoRecord {
  repo: string;
  /** Scan time in ms since the epoch. SLA windows run from here. */
  scannedAt: number;
  /** Every dependency copy that was read, healthy ones included. */
  scannedLimbs: number;
  /** False when the source dropped CODEOWNERS (census snapshots): ghosts are then not counted. */
  ownersKnown: boolean;
  /** Findings only (Possessed or Rotting). */
  limbs: LimbRecord[];
}

export interface GraveyardDoc {
  schemaVersion: 1;
  source: Source;
  /** Organisation login when the file came from `crypt graveyard --org`. */
  org: string;
  repos: RepoRecord[];
}

export interface Tomb {
  repo: string;
  slug: string;
  /** Sum over findings of (KEV ? 10 : 1) x (EPSS, floor 0.01), rounded to 3 decimals. */
  risk: number;
  possessed: number;
  rotting: number;
  findings: number;
  scannedLimbs: number;
  glow: Glow;
  sla: SlaState;
  /** Findings with no CODEOWNERS team. Shown as ghosts around the tomb. 0 when owners are unknown. */
  ghosts: number;
  /** The CODEOWNERS team that owns most findings, or "no owner yet". Never a person. */
  owner: string;
  size: SizeBucket;
  scannedAt: number;
}

const rec = (v: unknown): Record<string, unknown> => (typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

const REPO = /^[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}$/;
const TEAM = /^@[A-Za-z0-9_.-]{1,39}\/[A-Za-z0-9_.-]{1,100}$/;

/** Printable ASCII only, no markup characters, bounded. */
export function safeText(v: unknown, max = 80): string {
  return typeof v === "string" ? v.replace(/[^\x20-\x7e]/g, "").replace(/[<>"'&`]/g, "").trim().slice(0, max) : "";
}

/** "owner/repo" or "" for anything else. */
export function safeRepo(v: unknown): string {
  const s = typeof v === "string" ? v.trim() : "";
  return REPO.test(s) ? s : "";
}

/** A CODEOWNERS team ("@org/team") or "unowned". A single @user could be a person, so it counts as unowned. */
export function safeOwner(v: unknown): string {
  const s = typeof v === "string" ? v.trim() : "";
  return TEAM.test(s) ? s : "unowned";
}

export function ownerLabel(owner: string): string {
  return TEAM.test(owner) ? owner : NO_OWNER;
}

export function slugOf(repo: string): string {
  return repo.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
}

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const epssOf = (v: unknown): number | null => {
  const n = num(v);
  return n === null ? null : Math.min(1, Math.max(0, n));
};

function limbRecord(v: unknown): LimbRecord | null {
  const o = rec(v);
  const state = o.state === "Possessed" || o.state === "Rotting" ? o.state : null;
  if (state === null) return null;
  const name = safeText(o.name, 80);
  if (name === "") return null;
  return { name, state, kev: o.kev === true || state === "Possessed", epss: epssOf(o.epss), owner: safeOwner(o.owner) };
}

function repoRecord(v: unknown): RepoRecord | null {
  const o = rec(v);
  const repo = safeRepo(o.repo);
  const scannedAt = num(o.scannedAt);
  if (repo === "" || scannedAt === null || scannedAt < 0) return null;
  const limbs = arr(o.limbs).map(limbRecord).filter((l): l is LimbRecord => l !== null).slice(0, MAX_LIMBS_PER_REPO);
  const scanned = num(o.scannedLimbs);
  return {
    repo,
    scannedAt: Math.floor(scannedAt),
    scannedLimbs: Math.max(limbs.length, scanned === null ? 0 : Math.min(1_000_000, Math.max(0, Math.floor(scanned)))),
    ownersKnown: o.ownersKnown !== false,
    limbs,
  };
}

/** Limb risk: (KEV ? 10 : 1) x EPSS. Monotonic in EPSS, and a KEV limb always counts ten times a non-KEV one. */
export function limbRisk(l: Pick<LimbRecord, "kev" | "epss">): number {
  return (l.kev ? KEV_WEIGHT : 1) * (l.epss === null ? EPSS_FLOOR : Math.max(EPSS_FLOOR, l.epss));
}

/** sla-policy.md window for one open finding in ms, or null for backlog items (no SLA). */
export function slaWindow(l: Pick<LimbRecord, "state" | "kev" | "epss">): number | null {
  if (l.state === "Possessed" || l.kev) return POSSESSED_WINDOW_MS;
  if (l.epss !== null && l.epss >= EPSS_SPRINT_LINE) return SPRINT_WINDOW_MS;
  return null;
}

/** Worst SLA state over the open findings, counted from the supplied scan time. */
export function slaState(limbs: readonly LimbRecord[], scannedAt: number, now: number): SlaState {
  const elapsed = Number.isFinite(now) && Number.isFinite(scannedAt) ? Math.max(0, now - scannedAt) : 0;
  let worst: SlaState = "ok";
  for (const l of limbs) {
    const w = slaWindow(l);
    if (w === null) continue;
    if (elapsed >= w) return "breached";
    if (elapsed >= w * AT_RISK_SHARE) worst = "at-risk";
  }
  return worst;
}

export function glowOf(possessed: number): Glow {
  return possessed <= 0 ? 0 : possessed === 1 ? 1 : possessed <= 3 ? 2 : 3;
}

export function sizeOf(scannedLimbs: number): SizeBucket {
  return scannedLimbs < 50 ? "small" : scannedLimbs < 200 ? "medium" : scannedLimbs < 800 ? "large" : "huge";
}

/** The team that owns most findings (ties: alphabetical), or "no owner yet". Owners come from CODEOWNERS only. */
export function ownerTeamOf(limbs: readonly LimbRecord[]): string {
  const n = new Map<string, number>();
  for (const l of limbs) if (TEAM.test(l.owner)) n.set(l.owner, (n.get(l.owner) ?? 0) + 1);
  let best = "";
  for (const [t, c] of [...n].sort((a, b) => (a[0] < b[0] ? -1 : 1))) if (best === "" || c > (n.get(best) ?? 0)) best = t;
  return best === "" ? NO_OWNER : best;
}

export function buildTomb(input: unknown, now: number): Tomb | null {
  const r = repoRecord(input);
  if (r === null) return null;
  const possessed = r.limbs.filter((l) => l.state === "Possessed").length;
  const risk = r.limbs.reduce((s, l) => s + limbRisk(l), 0);
  return {
    repo: r.repo,
    slug: slugOf(r.repo),
    risk: Math.round(risk * 1000) / 1000,
    possessed,
    rotting: r.limbs.length - possessed,
    findings: r.limbs.length,
    scannedLimbs: r.scannedLimbs,
    glow: glowOf(possessed),
    sla: slaState(r.limbs, r.scannedAt, now),
    ghosts: r.ownersKnown ? r.limbs.filter((l) => !TEAM.test(l.owner)).length : 0,
    owner: r.ownersKnown ? ownerTeamOf(r.limbs) : NO_OWNER,
    size: sizeOf(r.scannedLimbs),
    scannedAt: r.scannedAt,
  };
}

/** Tombs for every valid record, alphabetical by repository (the default order). Invalid records are dropped. */
export function buildTombs(records: unknown, now: number): Tomb[] {
  const seen = new Set<string>();
  const out: Tomb[] = [];
  for (const r of arr(records).slice(0, MAX_REPOS)) {
    const t = buildTomb(r, now);
    if (t === null || seen.has(t.slug)) continue;
    seen.add(t.slug);
    out.push(t);
  }
  return sortTombs(out, "name");
}

export type SortKey = "name" | "risk" | "sla" | "owner";
const SLA_ORDER: Record<SlaState, number> = { breached: 0, "at-risk": 1, ok: 2 };
const byName = (a: Tomb, b: Tomb): number => (a.repo.toLowerCase() < b.repo.toLowerCase() ? -1 : a.repo.toLowerCase() > b.repo.toLowerCase() ? 1 : a.repo < b.repo ? -1 : a.repo > b.repo ? 1 : 0);

/** A copy in the order the user chose. "name" is the default. Ties always fall back to the alphabetical order. */
export function sortTombs(tombs: readonly Tomb[], by: SortKey = "name"): Tomb[] {
  const cmp: (a: Tomb, b: Tomb) => number =
    by === "risk" ? (a, b) => b.risk - a.risk : by === "sla" ? (a, b) => SLA_ORDER[a.sla] - SLA_ORDER[b.sla] : by === "owner" ? (a, b) => (a.owner < b.owner ? -1 : a.owner > b.owner ? 1 : 0) : () => 0;
  return [...tombs].sort((a, b) => cmp(a, b) || byName(a, b));
}

export interface TombFilter {
  /** Keep only tombs with this SLA state. */
  sla?: SlaState;
  /** Keep only tombs owned by this team label ("no owner yet" for the unowned ones). */
  owner?: string;
}

export function filterTombs(tombs: readonly Tomb[], f: TombFilter): Tomb[] {
  return tombs.filter((t) => (f.sla === undefined || t.sla === f.sla) && (f.owner === undefined || t.owner === f.owner));
}

/** The owner team labels present, alphabetical, for a filter control. */
export function ownerTeams(tombs: readonly Tomb[]): string[] {
  return [...new Set(tombs.map((t) => t.owner))].sort();
}

// ---- graveyard.json -------------------------------------------------------------------------------------------

const SOURCES: readonly Source[] = ["live", "census", "cli"];

export function parseGraveyard(text: string): GraveyardDoc | null {
  let o: unknown;
  try {
    o = JSON.parse(text);
  } catch {
    return null;
  }
  const d = rec(o);
  if (d.schemaVersion !== SCHEMA_VERSION || !Array.isArray(d.repos)) return null;
  const repos = d.repos.slice(0, MAX_REPOS).map(repoRecord).filter((r): r is RepoRecord => r !== null);
  const source = SOURCES.find((s) => s === d.source) ?? "cli";
  return { schemaVersion: 1, source, org: safeText(d.org, 39).replace(/[^A-Za-z0-9_.-]/g, ""), repos: dedupe(repos) };
}

function dedupe(repos: RepoRecord[]): RepoRecord[] {
  const seen = new Set<string>();
  return repos.filter((r) => (seen.has(r.repo) ? false : (seen.add(r.repo), true))).sort((a, b) => (a.repo.toLowerCase() < b.repo.toLowerCase() ? -1 : a.repo.toLowerCase() > b.repo.toLowerCase() ? 1 : a.repo < b.repo ? -1 : 1));
}

/** Stable text for out/graveyard.json: sorted repos, known keys only. Parse of the result gives the same document. */
export function serializeGraveyard(doc: { source: Source; org?: string; repos: readonly unknown[] }): string {
  const repos = dedupe(doc.repos.map(repoRecord).filter((r): r is RepoRecord => r !== null));
  const out: GraveyardDoc = { schemaVersion: 1, source: SOURCES.includes(doc.source) ? doc.source : "cli", org: safeText(doc.org, 39).replace(/[^A-Za-z0-9_.-]/g, ""), repos };
  return JSON.stringify(out, null, 2) + "\n";
}

// ---- builders (Input A and Input B) ---------------------------------------------------------------------------

function toLimbRecords(limbs: unknown): LimbRecord[] {
  return arr(limbs).map(limbRecord).filter((l): l is LimbRecord => l !== null);
}

/** Input A and C: from a liveExhume result or a creature.json (limbs with state, kev, epss, owner). Healthy limbs only add to the count. */
export function fromExhume(input: unknown, scannedAt: number): RepoRecord | null {
  const o = rec(input);
  const all = arr(o.limbs);
  return repoRecord({ repo: o.repo, scannedAt, scannedLimbs: all.length, ownersKnown: true, limbs: toLimbRecords(all) });
}

/** Input B: from a web/gallery-data snapshot. Owners were dropped there, so ghosts and owner teams are not shown. */
export function fromSnapshot(input: unknown, scannedAt: number): RepoRecord | null {
  const o = rec(input);
  const scanned = num(o.scannedLimbs);
  return repoRecord({ repo: o.repo, scannedAt, scannedLimbs: scanned ?? arr(o.limbs).length, ownersKnown: false, limbs: toLimbRecords(o.limbs) });
}

// ---- layout ---------------------------------------------------------------------------------------------------

/** FNV-1a 32 bit hash of the slug. The only source of "randomness" in the layout. */
export function hashSlug(slug: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < slug.length; i++) {
    h ^= slug.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

export interface TombPlace {
  slug: string;
  /** 0..1 across the field. */
  x: number;
  /** 0..1 down the field (rows further down are drawn larger). */
  y: number;
  /** Tilt in degrees, -4..4. */
  tilt: number;
  /** Tomb scale from the size bucket. */
  scale: number;
  col: number;
  row: number;
}

const SCALE: Record<SizeBucket, number> = { small: 0.7, medium: 0.85, large: 1, huge: 1.15 };

/** Deterministic grid placement in the given order, nudged by the slug hash. Same input, same output. */
export function layoutTombs(tombs: readonly Tomb[], cols = 6, seed = 0): TombPlace[] {
  const c = Math.max(1, Math.min(24, Math.floor(Number.isFinite(cols) ? cols : 6)));
  const rows = Math.max(1, Math.ceil(tombs.length / c));
  return tombs.map((t, i) => {
    const col = i % c;
    const row = Math.floor(i / c);
    const h = hashSlug(t.slug) ^ (seed >>> 0);
    const jx = ((h & 0xff) / 255 - 0.5) * 0.4;
    const jy = (((h >>> 8) & 0xff) / 255 - 0.5) * 0.4;
    return {
      slug: t.slug,
      x: Math.round(((col + 0.5 + jx) / c) * 1000) / 1000,
      y: Math.round(((row + 0.5 + jy) / rows) * 1000) / 1000,
      tilt: Math.round((((h >>> 16) & 0xff) / 255 - 0.5) * 8 * 10) / 10,
      scale: SCALE[t.size],
      col,
      row,
    };
  });
}
