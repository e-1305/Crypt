import type { Limb, OsvVuln } from "../exhume/types.js";

export const IMPORT_FORMATS = ["sarif", "dependabot", "trivy", "grype", "snyk"] as const;
export type ImportFormat = (typeof IMPORT_FORMATS)[number];

export function isImportFormat(s: string): s is ImportFormat {
  return (IMPORT_FORMATS as readonly string[]).includes(s);
}

/** The file is not valid JSON, not the named format, or holds no package. Nothing is imported. */
export class ImportError extends Error {}

/** One finding as an adapter read it, before it is mapped to the limb model. */
export interface RawFinding {
  /** Ecosystem as the tool wrote it (npm, pip, pypi, golang, ...), or null when not stated. */
  ecosystem: string | null;
  name: string | null;
  version: string | null;
  /** Vulnerabilities found for this package. Empty for a package listed as clean. */
  vulns: OsvVuln[];
  /** False when a vulnerability entry was malformed (for example no id). The limb is then unknown. */
  vulnsOk: boolean;
  /** Short text used to name an unidentified package, for example the rule id. */
  label: string;
}

export interface ImportedLimb {
  limb: Limb;
  /** Undefined means unknown: the limb is absent from the OSV map handed to rankLimbs. */
  vulns: OsvVuln[] | undefined;
}
