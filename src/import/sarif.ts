// SARIF 2.1.0. SARIF is not package oriented, so the package comes from result properties
// (purl, packageName, packageVersion) or from the "Package:" and "Installed Version:" lines
// that dependency scanners write into the message. Anything else is an unidentified package.
import { advisoryIds, asRecord, fromPurl, requireArray, severityFromScore, str, strings, vuln } from "./common.js";
import { ImportError, type RawFinding } from "./types.js";

const NPM_FILES = ["package-lock.json", "package.json", "yarn.lock", "pnpm-lock.yaml", "npm-shrinkwrap.json"];
const PYPI_FILES = ["requirements.txt", "pipfile.lock", "poetry.lock", "uv.lock"];

function ecosystemOfFile(uri: string | null): string | null {
  const base = (uri ?? "").split("/").pop()?.toLowerCase() ?? "";
  return NPM_FILES.includes(base) ? "npm" : PYPI_FILES.includes(base) ? "pypi" : null;
}

export function adaptSarif(root: unknown): RawFinding[] {
  const r = asRecord(root);
  const version = str(r?.version);
  if (r === null || version === null || !version.startsWith("2.") || !Array.isArray(r.runs)) {
    throw new ImportError("not a SARIF 2.1.0 file (needs version 2.x and a runs array)");
  }
  const out: RawFinding[] = [];
  for (const run of requireArray(r.runs, "runs must be an array")) {
    const run_ = asRecord(run);
    const driver = asRecord(asRecord(run_?.tool)?.driver);
    const rules = Array.isArray(driver?.rules) ? driver.rules : [];
    for (const res of Array.isArray(run_?.results) ? run_.results : []) {
      const x = asRecord(res);
      if (x === null) {
        out.push({ ecosystem: null, name: null, version: null, vulns: [], vulnsOk: false, label: "malformed-result" });
        continue;
      }
      const idx = typeof x.ruleIndex === "number" ? x.ruleIndex : -1;
      const byIndex = asRecord(rules[idx]);
      const ruleId = str(x.ruleId) ?? str(byIndex?.id);
      const rule = byIndex ?? asRecord(rules.find((q) => asRecord(q)?.id === ruleId));
      const props = { ...(asRecord(rule?.properties) ?? {}), ...(asRecord(x.properties) ?? {}) };
      const text = str(asRecord(x.message)?.text) ?? "";
      const purl = fromPurl(props.purl ?? props.packageUrl ?? props.package_url);
      const loc = asRecord(asRecord(asRecord(Array.isArray(x.locations) ? x.locations[0] : null)?.physicalLocation)?.artifactLocation);
      const name = purl?.name ?? str(props.packageName) ?? str(props.package) ?? /Package:\s*(\S+)/.exec(text)?.[1] ?? null;
      const ver =
        purl?.version ?? str(props.packageVersion) ?? str(props.installedVersion) ?? /Installed Version:\s*(\S+)/.exec(text)?.[1] ?? null;
      const eco = purl?.ecosystem ?? str(props.ecosystem) ?? ecosystemOfFile(str(loc?.uri));
      const v = vuln(ruleId, [...strings(props.aliases), ...advisoryIds(text)], severityFromScore(props["security-severity"]));
      out.push({ ecosystem: eco, name, version: ver, vulns: v ? [v] : [], vulnsOk: v !== null, label: ruleId ?? "result" });
    }
  }
  return out;
}
