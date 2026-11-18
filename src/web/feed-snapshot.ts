// The KEV and EPSS snapshot shipped with the site as one compact JSON file. Pure: no fs, clock or network.
import type { EpssFeed, KevFeed } from "../exhume/feeds.js";

export interface FeedSnapshot {
  kev: KevFeed;
  epss: EpssFeed;
}

/** EPSS scores below this never spawn a limb (the spawn line is 0.1), so the full feed is trimmed to the scores that matter. */
export const SNAPSHOT_MIN_EPSS = 0.01;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** Serializes the feeds. Output is sorted, so the same feeds give the same bytes. */
export function serializeFeedSnapshot(kev: KevFeed, epss: EpssFeed, minEpss = SNAPSHOT_MIN_EPSS): string {
  const scores: Record<string, number> = {};
  for (const cve of [...epss.scores.keys()].sort()) {
    const n = epss.scores.get(cve)!;
    if (n >= minEpss) scores[cve] = n;
  }
  return JSON.stringify({
    schemaVersion: 1,
    kev: { date: kev.date, cves: [...kev.cves].sort() },
    epss: { date: epss.date, scores },
  });
}

/** Null when the text is not a valid snapshot: the caller must not rank without feeds. */
export function parseFeedSnapshot(text: string): FeedSnapshot | null {
  try {
    const o: unknown = JSON.parse(text);
    if (!isObj(o) || o.schemaVersion !== 1 || !isObj(o.kev) || !isObj(o.epss)) return null;
    const { kev, epss } = o;
    if (typeof kev.date !== "string" || !Array.isArray(kev.cves) || !kev.cves.every((c) => typeof c === "string")) return null;
    if (typeof epss.date !== "string" || !isObj(epss.scores)) return null;
    const scores = new Map<string, number>();
    for (const [cve, n] of Object.entries(epss.scores)) {
      if (typeof n !== "number" || !Number.isFinite(n) || n < 0 || n > 1) return null;
      scores.set(cve.toUpperCase(), n);
    }
    return {
      kev: { date: kev.date, cves: new Set((kev.cves as string[]).map((c) => c.toUpperCase())) },
      epss: { date: epss.date, scores },
    };
  } catch {
    return null;
  }
}
