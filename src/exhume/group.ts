// Presentation grouping: every installed copy of one package becomes one entry. Pure, deterministic, no I/O.
// The creature keeps one limb per copy (ranking and the game need that); lists, plates and PRs show one per package.
import type { State } from "./rank.js";
import { type UsageSignal, combineUsage } from "./usage.js";

export interface GroupableLimb {
  ecosystem: string;
  name: string;
  version: string;
  direct: boolean;
  state: State;
  unknown: boolean;
  spawned: boolean;
  kev: boolean;
  epss: number | null;
  owner: string;
  rank: number;
  /** Absent in creatures made before the signal existed: read as unknown. */
  usage?: UsageSignal;
}

export interface PackageGroup<L extends GroupableLimb = GroupableLimb> {
  ecosystem: string;
  name: string;
  /** Distinct installed versions, ascending by plain version order. */
  versions: string[];
  /** Direct when any copy is declared by the root package.json, else transitive. */
  kind: "direct" | "transitive";
  /** Worst state among the copies. */
  state: State;
  unknown: boolean;
  spawned: boolean;
  kev: boolean;
  epss: number | null;
  owner: string;
  /** Best (lowest) rank among the copies. */
  rank: number;
  /** Same precedence as the plate: any copy imported directly, else transitive only, else dev only when all are, else unknown. */
  usage: UsageSignal;
  /** The copies, in the order they were given. */
  members: L[];
}

const STATE_ORDER: Record<State, number> = { Possessed: 0, Rotting: 1, Healthy: 2 };

function versionParts(v: string): (number | string)[] {
  return v.split(/[.+-]/).map((p) => (/^\d+$/.test(p) ? Number(p) : p));
}

export function compareVersionStrings(a: string, b: string): number {
  const x = versionParts(a);
  const y = versionParts(b);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const p = x[i];
    const q = y[i];
    if (p === q) continue;
    if (p === undefined) return -1;
    if (q === undefined) return 1;
    if (typeof p === "number" && typeof q === "number") return p < q ? -1 : 1;
    return String(p) < String(q) ? -1 : 1;
  }
  return 0;
}

/** Groups by ecosystem and name. Groups keep the order in which their first copy appears (ranked input stays ranked). */
export function groupLimbs<L extends GroupableLimb>(limbs: L[]): PackageGroup<L>[] {
  const map = new Map<string, L[]>();
  for (const l of limbs) {
    const k = `${l.ecosystem}:${l.name}`;
    const list = map.get(k);
    if (list) list.push(l);
    else map.set(k, [l]);
  }
  return [...map.values()].map((members) => {
    const first = members[0]!;
    const worst = members.reduce((w, m) => (STATE_ORDER[m.state] < STATE_ORDER[w] ? m.state : w), first.state);
    const epss = members.reduce<number | null>((m, l) => (l.epss === null ? m : m === null ? l.epss : Math.max(m, l.epss)), null);
    return {
      ecosystem: first.ecosystem,
      name: first.name,
      versions: [...new Set(members.map((m) => m.version))].sort(compareVersionStrings),
      kind: members.some((m) => m.direct) ? ("direct" as const) : ("transitive" as const),
      state: worst,
      unknown: members.some((m) => m.unknown),
      spawned: members.some((m) => m.spawned),
      kev: members.some((m) => m.kev),
      epss,
      owner: first.owner,
      rank: Math.min(...members.map((m) => m.rank)),
      usage: combineUsage(members.map((m) => m.usage)),
      members,
    };
  });
}

/** "lodash x4 versions" style text for a group, "lodash 4.17.21" for a single copy. */
export function groupTitle(g: Pick<PackageGroup, "name" | "versions">): string {
  return g.versions.length > 1 ? `${g.name} \u00d7${g.versions.length} versions` : `${g.name} ${g.versions[0] ?? "unknown"}`;
}
