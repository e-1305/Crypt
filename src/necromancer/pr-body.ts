// Pure PR body text. No fs, clock or network, so the web bundle can use it.
import { SABOTAGE_BODY_LINE } from "./sabotage.js";

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
}

/** PR body. Built from creature.json only (owners from CODEOWNERS); never from git history. */
export function prBody(f: PrFields): string {
  return [
    `Limb: ${f.limb} (${f.name})`,
    `Version: ${f.from} -> ${f.to}`,
    `CVEs: ${f.cves.length ? f.cves.join(", ") : "none listed"}`,
    `KEV: ${f.kev ? "yes" : "no"}`,
    `EPSS: ${f.epss === null ? "unknown" : f.epss.toFixed(5)}`,
    `Owner: ${f.owner || "unowned"}`,
    `Healed by: (pending)`,
    `Audit ID: ${f.auditId}`,
    ...(f.breaking ? ["breaking: true"] : []),
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
