// Grype JSON (grype ... -o json): matches[] with the vulnerability and the matched artifact.
import { advisoryIds, asRecord, fromPurl, normalizeSeverity, str, vuln } from "./common.js";
import { ImportError, type RawFinding } from "./types.js";

export function adaptGrype(root: unknown): RawFinding[] {
  const r = asRecord(root);
  if (r === null || !Array.isArray(r.matches)) throw new ImportError("not a Grype JSON file (needs a matches array)");
  const out: RawFinding[] = [];
  for (const m of r.matches) {
    const x = asRecord(m);
    const art = asRecord(x?.artifact);
    const vl = asRecord(x?.vulnerability);
    const related = [...(Array.isArray(vl?.relatedVulnerabilities) ? vl.relatedVulnerabilities : []), ...(Array.isArray(x?.relatedVulnerabilities) ? x.relatedVulnerabilities : [])];
    const aliases = related.flatMap((q) => {
      const id = str(asRecord(q)?.id);
      return id === null ? [] : [id];
    });
    const id = str(vl?.id);
    const v = vuln(id, [...aliases, ...advisoryIds(id)], normalizeSeverity(vl?.severity));
    const purl = fromPurl(art?.purl);
    out.push({
      ecosystem: purl?.ecosystem ?? str(art?.type) ?? str(art?.language),
      name: purl?.name ?? str(art?.name),
      version: purl?.version ?? str(art?.version),
      vulns: v ? [v] : [],
      vulnsOk: v !== null,
      label: id ?? "match",
    });
  }
  return out;
}
