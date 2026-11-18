// Trivy JSON (trivy ... -f json). Vulnerabilities carry the package; Packages (with --list-all-pkgs) list clean ones.
import { advisoryIds, asRecord, fromPurl, normalizeSeverity, str, vuln } from "./common.js";
import { ImportError, type RawFinding } from "./types.js";

function purlOf(o: Record<string, unknown> | null) {
  return fromPurl(asRecord(o?.PkgIdentifier)?.PURL ?? asRecord(o?.Identifier)?.PURL);
}

export function adaptTrivy(root: unknown): RawFinding[] {
  const r = asRecord(root);
  if (r === null || !Array.isArray(r.Results)) throw new ImportError("not a Trivy JSON file (needs a Results array)");
  const out: RawFinding[] = [];
  for (const res of r.Results) {
    const x = asRecord(res);
    if (x === null) {
      out.push({ ecosystem: null, name: null, version: null, vulns: [], vulnsOk: false, label: "malformed-result" });
      continue;
    }
    const type = str(x.Type);
    for (const p of Array.isArray(x.Packages) ? x.Packages : []) {
      const q = asRecord(p);
      const purl = purlOf(q);
      out.push({ ecosystem: purl?.ecosystem ?? type, name: purl?.name ?? str(q?.Name), version: purl?.version ?? str(q?.Version), vulns: [], vulnsOk: true, label: "package" });
    }
    for (const vv of Array.isArray(x.Vulnerabilities) ? x.Vulnerabilities : []) {
      const q = asRecord(vv);
      const purl = purlOf(q);
      const id = str(q?.VulnerabilityID);
      const v = vuln(id, advisoryIds(str(q?.Title), str(q?.PrimaryURL)), normalizeSeverity(q?.Severity));
      out.push({
        ecosystem: purl?.ecosystem ?? type,
        name: purl?.name ?? str(q?.PkgName),
        version: purl?.version ?? str(q?.InstalledVersion),
        vulns: v ? [v] : [],
        vulnsOk: v !== null,
        label: id ?? "vulnerability",
      });
    }
  }
  return out;
}
