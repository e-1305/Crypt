// GitHub Dependabot alerts, REST JSON (GET /repos/{owner}/{repo}/dependabot/alerts): an array of alerts.
// The API does not give the installed version, so every limb is unknown. Fixed alerts are skipped.
import { advisoryIds, asRecord, normalizeSeverity, str, vuln } from "./common.js";
import { ImportError, type RawFinding } from "./types.js";

export function adaptDependabot(root: unknown): RawFinding[] {
  if (!Array.isArray(root)) throw new ImportError("not a Dependabot alerts file (needs a JSON array of alerts)");
  const looksRight = root.some((a) => asRecord(a) !== null && ("security_advisory" in (a as object) || "dependency" in (a as object)));
  if (root.length > 0 && !looksRight) throw new ImportError("not a Dependabot alerts file (no security_advisory or dependency)");
  const out: RawFinding[] = [];
  for (const a of root) {
    const x = asRecord(a);
    if (x === null) {
      out.push({ ecosystem: null, name: null, version: null, vulns: [], vulnsOk: false, label: "malformed-alert" });
      continue;
    }
    if (x.state === "fixed") continue;
    const pkg = asRecord(asRecord(x.dependency)?.package) ?? asRecord(asRecord(x.security_vulnerability)?.package);
    const adv = asRecord(x.security_advisory);
    const ids = Array.isArray(adv?.identifiers)
      ? adv.identifiers.flatMap((i) => {
          const v = str(asRecord(i)?.value);
          return v === null ? [] : [v];
        })
      : [];
    const cve = str(adv?.cve_id);
    const ghsa = str(adv?.ghsa_id);
    const aliases = [...(cve ? [cve] : []), ...ids, ...advisoryIds(ghsa, cve)];
    const v = vuln(ghsa ?? cve, aliases, normalizeSeverity(adv?.severity ?? asRecord(x.security_vulnerability)?.severity));
    out.push({ ecosystem: str(pkg?.ecosystem), name: str(pkg?.name), version: null, vulns: v ? [v] : [], vulnsOk: v !== null, label: ghsa ?? cve ?? "alert" });
  }
  return out;
}
