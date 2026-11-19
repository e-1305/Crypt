import type { Usage } from "./usage.js";

/** Plain words for the usage signal, shared by the plate, the paste result, exports and alerts. */
export const USAGE_LABELS: Record<Usage, string> = {
  direct: "imported directly",
  transitive: "only through another package",
  dev: "dev only",
  unknown: "unknown",
};

export const USAGE_FOOTNOTE = "Static check of imports, not a proof that the vulnerable code runs.";

/** Anything that is not a known usage value reads unknown. */
export function usageOf(v: unknown): Usage {
  return v === "direct" || v === "transitive" || v === "dev" ? v : "unknown";
}

export function usageLabel(v: unknown): string {
  return USAGE_LABELS[usageOf(v)];
}

const STRONGEST: Usage[] = ["direct", "transitive", "dev"];

/** One usage for a package with several installed copies: the strongest signal among them. */
export function groupUsage(members: readonly { usage?: unknown }[]): Usage {
  const seen = new Set(members.map((m) => usageOf(m.usage)));
  return STRONGEST.find((u) => seen.has(u)) ?? "unknown";
}
