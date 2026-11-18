// Pure PR body text. No fs, clock or network, so the web bundle can use it.
import { ownerLabel } from "../exhume/owners.js";
import { SABOTAGE_BODY_LINE } from "./sabotage.js";
import { BREAKING_NOTE } from "./version.js";

export { BREAKING_NOTE };
export const TRANSITIVE_NOTE = "transitive: forced via overrides; check the parents' compatibility";
export const NESTED_NOTE = "direct: the dependency in package.json is bumped. Copies nested under other packages follow their parents; check them after this PR lands.";

export interface PrFields {
  limb: string;
  name: string;
  from: string;
  to: string;
  breaking: boolean;
  cves: string[];
  kev: boolean;
  epss: number | null;
  owner: string;
  auditId: string;
  /** True when `resolved` and `integrity` come from registry metadata. */
  fromRegistry?: boolean;
  sabotage?: boolean;
  /** Direct dependency (version bump) or transitive only (npm overrides). Omitted: direct. */
  kind?: "direct" | "transitive";
  /** Every installed version of the package that this graft replaces. Omitted: just `from`. */
  versions?: string[];
}

/** PR title. One PR per package: a package with several installed versions names them all. */
export function prTitle(f: { name: string; from: string; versions?: string[]; to: string; limb: string; breaking: boolean }): string {
  const from = f.versions && f.versions.length > 1 ? f.versions.join(", ") : f.from;
  return `fix: graft ${f.name} ${from} to ${f.to} (${f.limb})${f.breaking ? ` ${BREAKING_NOTE}` : ""}`;
}

/** PR body. Built from creature.json only (owners from CODEOWNERS); never from git history. */
export function prBody(f: PrFields): string {
  return [
    `Limb: ${f.limb} (${f.name})`,
    `Version: ${f.from} -> ${f.to}`,
    ...(f.versions && f.versions.length > 1 ? [`Installed versions: ${f.versions.join(", ")}`] : []),
    `Dependency: ${f.kind ?? "direct"}`,
    `CVEs: ${f.cves.length ? f.cves.join(", ") : "none listed"}`,
    `KEV: ${f.kev ? "yes" : "no"}`,
    `EPSS: ${f.epss === null ? "unknown" : f.epss.toFixed(5)}`,
    `Owner: ${ownerLabel(f.owner)}`,
    `Healed by: (pending)`,
    `Audit ID: ${f.auditId}`,
    ...(f.breaking ? ["breaking: true", BREAKING_NOTE] : []),
    ...(f.kind === "transitive" ? [TRANSITIVE_NOTE] : []),
    ...(f.kind !== "transitive" && f.versions && f.versions.length > 1 ? [NESTED_NOTE] : []),
    "",
    ...(f.sabotage ? [SABOTAGE_BODY_LINE, ""] : []),
    f.fromRegistry
      ? "One dependency per PR. package-lock.json: `version`, `resolved` and `integrity` for this package come from the npm registry metadata. Nothing was installed or run."
      : "One dependency per PR. package-lock.json: `resolved` and `integrity` for this package were removed and refresh on the next `npm install`.",
    "A human lands this PR after CI is green.",
    "",
  ].join("\n");
}

export function auditIdFor(now: Date, limb: string): string {
  return `AUD-${now.toISOString().replace(/\D/g, "").slice(0, 14)}-${limb}`;
}
