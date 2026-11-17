export interface KevFeed {
  date: string;
  cves: Set<string>;
}
export interface EpssFeed {
  date: string;
  scores: Map<string, number>;
}

export function parseKev(text: string): KevFeed | null {
  try {
    const o = JSON.parse(text) as Record<string, unknown>;
    if (typeof o.dateReleased !== "string" || !Array.isArray(o.vulnerabilities)) return null;
    const cves = new Set<string>();
    for (const v of o.vulnerabilities) {
      const id = (v as Record<string, unknown> | null)?.cveID;
      if (typeof id === "string") cves.add(id.toUpperCase());
    }
    return { date: o.dateReleased, cves };
  } catch {
    return null;
  }
}

export function parseEpss(text: string): EpssFeed | null {
  const lines = text.split(/\r?\n/);
  const m = /^#.*\bscore_date:([^,\s]+)/.exec(lines[0] ?? "");
  if (!m || (lines[1] ?? "").trim() !== "cve,epss,percentile") return null;
  const scores = new Map<string, number>();
  for (let i = 2; i < lines.length; i++) {
    const [cve, epss] = lines[i]!.split(",");
    if (!cve || epss === undefined) continue;
    const n = Number(epss);
    if (Number.isFinite(n) && n >= 0 && n <= 1) scores.set(cve.toUpperCase(), n);
  }
  return { date: m[1]!, scores };
}
