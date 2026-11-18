// `snyk test --json`: one project object, or an array of them for multi-project runs.
import { advisoryIds, asRecord, normalizeSeverity, str, strings, vuln } from "./common.js";
import { ImportError, type RawFinding } from "./types.js";

export function adaptSnyk(root: unknown): RawFinding[] {
  const projects = Array.isArray(root) ? root : [root];
  const out: RawFinding[] = [];
  let seen = false;
  for (const p of projects) {
    const r = asRecord(p);
    if (r === null || !Array.isArray(r.vulnerabilities)) continue;
    seen = true;
    const manager = str(r.packageManager);
    for (const e of r.vulnerabilities) {
      const x = asRecord(e);
      const ident = asRecord(x?.identifiers);
      const id = str(x?.id);
      const v = vuln(id, [...strings(ident?.CVE), ...strings(ident?.GHSA), ...advisoryIds(id)], normalizeSeverity(x?.severity));
      out.push({
        ecosystem: str(x?.packageManager) ?? manager,
        name: str(x?.packageName) ?? str(x?.name),
        version: str(x?.version),
        vulns: v ? [v] : [],
        vulnsOk: v !== null,
        label: id ?? "vulnerability",
      });
    }
  }
  if (!seen) throw new ImportError("not a Snyk JSON file (needs a vulnerabilities array)");
  return out;
}
