// Import adapters: pure functions from a tool's JSON text to limbs with vulnerabilities.
import { combineOsvAnswers } from "../exhume/rank.js";
import { type Limb, type OsvVuln, compareLimbs, limbKey } from "../exhume/types.js";
import { toImported } from "./common.js";
import { adaptDependabot } from "./dependabot.js";
import { adaptGrype } from "./grype.js";
import { adaptSarif } from "./sarif.js";
import { adaptSnyk } from "./snyk.js";
import { adaptTrivy } from "./trivy.js";
import { IMPORT_FORMATS, type ImportFormat, ImportError, type ImportedLimb, type RawFinding } from "./types.js";

export { IMPORT_FORMATS, ImportError, isImportFormat } from "./types.js";
export type { ImportFormat, ImportedLimb } from "./types.js";

const ADAPTERS: Record<ImportFormat, (root: unknown) => RawFinding[]> = {
  sarif: adaptSarif,
  dependabot: adaptDependabot,
  trivy: adaptTrivy,
  grype: adaptGrype,
  snyk: adaptSnyk,
};

/** Hard cap on the input, so a huge file cannot freeze the page or the CLI. */
export const MAX_IMPORT_BYTES = 50_000_000;

/**
 * Parses one tool's JSON into deduplicated limbs, sorted by ecosystem, name and version.
 * Throws ImportError for invalid JSON, a file of another format or a file without packages.
 * The result does not depend on the order of the findings in the file.
 */
export function parseImport(format: ImportFormat, text: string, manifest = "import"): { limb: Limb; vulns: OsvVuln[] | undefined }[] {
  if (!(IMPORT_FORMATS as readonly string[]).includes(format)) throw new ImportError(`unknown format '${String(format).slice(0, 20)}'`);
  if (text.length > MAX_IMPORT_BYTES) throw new ImportError("file is too large to import");
  let root: unknown;
  try {
    root = JSON.parse(text);
  } catch {
    throw new ImportError(`not valid JSON (expected ${format})`);
  }
  const imported: ImportedLimb[] = ADAPTERS[format](root).map((f) => toImported(f, manifest));
  if (imported.length === 0) throw new ImportError(`no packages found in the ${format} file; nothing was imported`);
  const byKey = new Map<string, { limb: Limb; answers: (OsvVuln[] | undefined)[] }>();
  for (const i of imported) {
    const k = limbKey(i.limb);
    const e = byKey.get(k);
    if (e) e.answers.push(i.vulns);
    else byKey.set(k, { limb: i.limb, answers: [i.vulns] });
  }
  return [...byKey.values()].sort((a, b) => compareLimbs(a.limb, b.limb)).map((e) => ({ limb: e.limb, vulns: combineOsvAnswers(e.answers) }));
}
