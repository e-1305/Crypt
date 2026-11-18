// Import in the browser: one scanner file (SARIF, Dependabot, Trivy, Grype, Snyk) to the same result shape as live-exhume.
// Pure: no fetch, no XHR, no clock, no upload. The file text never leaves the caller. Fail-safe: any problem throws
// ImportWebError and returns no creature; a limb without an answer stays Unknown, never Healthy.
import { groupLimbs, type PackageGroup } from "../exhume/group.js";
import { buildImportedCreature } from "../import/build.js";
import { IMPORT_FORMATS, ImportError, parseImport, type ImportFormat } from "../import/index.js";
import { plateSummary, renderPlate } from "../render/plate.js";
import type { FeedSnapshot } from "./feed-snapshot.js";

/** Browser size cap: far below the CLI cap, so a large file cannot freeze the page. */
export const MAX_WEB_IMPORT_BYTES = 5_000_000;
export const PRIVACY_LINE = "Parsed in your browser. The file stays on your device and is not uploaded.";

export class ImportWebError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImportWebError";
  }
}

type Built = ReturnType<typeof buildImportedCreature>;

export interface ImportWebResult {
  /** Display name: the file name without its extension. */
  name: string;
  file: string;
  format: ImportFormat;
  creature: Built;
  limbs: Built["limbs"];
  groups: PackageGroup<Built["limbs"][number]>[];
  plate: string;
  summary: string[];
  feeds: { kev: string; epss: string };
}

/** The formats whose adapter accepts this text. Exactly one means detected; none or several means the user must choose. */
export function detectFormats(text: string, file = "import"): ImportFormat[] {
  return IMPORT_FORMATS.filter((f) => {
    try {
      parseImport(f, text, file);
      return true;
    } catch {
      return false;
    }
  });
}

/** Display name for the plate: the file name without extension, reduced to safe characters. */
export function nameFromFile(file: string): string {
  const base = file.replace(/\.[^.]*$/, "").replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return (base || "import").slice(0, 40);
}

export function importInBrowser(o: { text: string; file: string; format: ImportFormat | "auto"; feeds: FeedSnapshot | null | undefined }): ImportWebResult {
  if (!o.feeds) throw new ImportWebError("The KEV and EPSS snapshot did not load, so nothing can be ranked. Reload the page, then try again.");
  if (o.text.length > MAX_WEB_IMPORT_BYTES) throw new ImportWebError("This file is larger than 5 MB, so it was not read. Export a smaller report or use the CLI: npx @e-1305/crypt exhume --from.");
  let format: ImportFormat;
  if (o.format === "auto") {
    const found = detectFormats(o.text, o.file);
    if (found.length === 0) throw new ImportWebError("This file is not a SARIF, Dependabot, Trivy, Grype or Snyk report with packages, so no creature is shown. Pick the format if you know it.");
    if (found.length > 1) throw new ImportWebError(`This file could be ${found.join(" or ")}. Pick the format, so nothing is guessed.`);
    format = found[0]!;
  } else format = o.format;
  const name = nameFromFile(o.file);
  let creature: Built;
  try {
    creature = buildImportedCreature({ format, text: o.text, file: o.file, name, kev: o.feeds.kev, epss: o.feeds.epss });
  } catch (e) {
    if (e instanceof ImportError) throw new ImportWebError(`${e.message}. No creature is shown.`);
    throw new ImportWebError("The file could not be imported, so no creature is shown.");
  }
  return {
    name,
    file: o.file,
    format,
    creature,
    limbs: creature.limbs,
    groups: groupLimbs(creature.limbs),
    plate: renderPlate(creature),
    summary: plateSummary(creature),
    feeds: { kev: creature.feeds.kev.date ?? "", epss: creature.feeds.epss.date ?? "" },
  };
}
