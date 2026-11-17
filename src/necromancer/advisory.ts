// Validates untrusted OSV advisory JSON into the small shape the version chooser uses.
import type { Advisory, OsvRange } from "./version.js";

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** Null when the record is not a usable advisory (fail-safe: the caller opens no PR). */
export function parseAdvisory(raw: unknown): Advisory | null {
  if (!isObj(raw) || typeof raw.id !== "string" || !Array.isArray(raw.affected)) return null;
  const affected = [];
  for (const a of raw.affected) {
    if (!isObj(a) || !isObj(a.package)) return null;
    const { ecosystem, name } = a.package;
    if (typeof ecosystem !== "string" || typeof name !== "string") return null;
    const ranges: OsvRange[] = [];
    for (const r of Array.isArray(a.ranges) ? a.ranges : []) {
      if (!isObj(r) || typeof r.type !== "string" || !Array.isArray(r.events)) return null;
      const events = [];
      for (const e of r.events) {
        if (!isObj(e)) return null;
        const ev: Record<string, string> = {};
        for (const k of ["introduced", "fixed", "last_affected"]) if (typeof e[k] === "string") ev[k] = e[k] as string;
        events.push(ev);
      }
      ranges.push({ type: r.type, events });
    }
    affected.push({ package: { ecosystem, name }, ranges });
  }
  const aliases = Array.isArray(raw.aliases) ? raw.aliases.filter((x): x is string => typeof x === "string") : [];
  return { id: raw.id, aliases, affected };
}
