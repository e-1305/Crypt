import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { numRuns } from "./runs.js";
import { feedSnapshotText } from "../scripts/build-site.js";
import { parseFeedSnapshot } from "../src/web/feed-snapshot.js";
import { liveExhume, type FetchLike } from "../src/web/live-exhume.js";
import { CACHE_PREFIX, HOURLY_LIMIT, MAX_REPOS_PER_RUN, REQUESTS_PER_REPO, createQueue, estimateRequests, parseRepoList, readCache, writeCache, type StoreLike } from "../src/graveyard/queue.js";

const feeds = parseFeedSnapshot(feedSnapshotText(["fixtures/vulnerable-npm/feeds"]));
const res = (status: number, body = "") => ({ ok: status >= 200 && status < 300, status, text: async () => body, json: async () => JSON.parse(body || "null") });

describe("parseRepoList", () => {
  it("accepts owner/repo and github urls, drops duplicates and junk, caps the run", () => {
    const l = parseRepoList("a/b, https://github.com/c/d.git\nA/B  junk http://evil.example/x/y");
    expect(l.repos).toEqual(["a/b", "c/d"]);
    expect(l.rejected).toBe(2);
    const many = parseRepoList(Array.from({ length: 30 }, (_, i) => `o/r${i}`).join(","));
    expect(many.repos).toHaveLength(MAX_REPOS_PER_RUN);
    expect(many.capped).toBe(10);
  });
  it("never throws and only returns owner/repo", () => {
    fc.assert(
      fc.property(fc.anything(), (v) => {
        for (const r of parseRepoList(v).repos) expect(r).toMatch(/^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/);
      }),
      { numRuns: numRuns(200) },
    );
    expect(parseRepoList("../etc/passwd").repos).toEqual([]);
  });
});

describe("estimateRequests", () => {
  it("counts the worst case against 60 per hour", () => {
    expect(estimateRequests(0)).toEqual({ requests: 0, fits: true, hoursNeeded: 0 });
    expect(estimateRequests(HOURLY_LIMIT / REQUESTS_PER_REPO).fits).toBe(true);
    expect(estimateRequests(HOURLY_LIMIT / REQUESTS_PER_REPO + 1)).toMatchObject({ fits: false, hoursNeeded: 2 });
    expect(estimateRequests(Number.NaN).requests).toBe(0);
  });
});

describe("scan queue", () => {
  it("a 403 from GitHub pauses the queue, keeps finished repos and Resume continues", async () => {
    let limited = true;
    const f: FetchLike = async (url) => {
      if (limited && url.includes("/b/")) return res(403);
      return res(404);
    };
    const done: string[] = [];
    const states: string[] = [];
    const q = createQueue({
      repos: ["a/a", "b/b", "c/c"],
      scan: async (repo) => {
        try {
          return await liveExhume(`https://github.com/${repo}`, { fetch: f, feeds });
        } catch (e) {
          // a/a has no lockfile: a normal failure. b/b is rate limited.
          throw e;
        }
      },
      onResult: (repo) => done.push(repo),
      onState: (s) => states.push(s.status),
    });
    const paused = await q.start();
    expect(paused.status).toBe("paused");
    expect(paused.pause).toBe("rate-limited");
    expect(paused.message).toMatch(/Resume/);
    expect(paused.failed.map((x) => x.repo)).toEqual(["a/a"]);
    expect(paused.pending).toEqual(["b/b", "c/c"]);
    limited = false;
    const end = await q.resume();
    expect(end.status).toBe("finished");
    expect(end.pending).toEqual([]);
    expect(end.failed.map((x) => x.repo)).toEqual(["a/a", "b/b", "c/c"]);
    expect(states).toContain("paused");
  });

  it("a 429 pauses too, and a scan that returns is kept", async () => {
    let n = 0;
    const got: string[] = [];
    const q = createQueue<string>({
      repos: ["a/a", "b/b"],
      scan: async (repo) => {
        if (++n === 2) throw Object.assign(new Error("slow down"), { code: "rate-limited" });
        return repo;
      },
      onResult: (r) => got.push(r),
    });
    expect((await q.start()).status).toBe("paused");
    expect(got).toEqual(["a/a"]);
    expect((await q.resume()).status).toBe("finished");
    expect(got).toEqual(["a/a", "b/b"]);
  });

  it("cache hits cost no request and stay under the hourly budget", async () => {
    const seen: [string, boolean][] = [];
    let scans = 0;
    const repos = Array.from({ length: 20 }, (_, i) => `o/r${i}`);
    const q = createQueue<number>({
      repos,
      scan: async () => ++scans,
      cached: (r) => (r === "o/r0" ? 0 : null),
      onResult: (r, _v, c) => seen.push([r, c]),
    });
    const s = await q.start();
    expect(seen[0]).toEqual(["o/r0", true]);
    expect(s.status).toBe("paused");
    expect(s.pause).toBe("budget");
    expect(s.requests).toBeLessThanOrEqual(HOURLY_LIMIT);
    expect(scans).toBe(HOURLY_LIMIT / REQUESTS_PER_REPO);
    const end = await q.resume();
    expect(end.status).toBe("finished");
    expect(scans).toBe(19);
  });
});

describe("session cache", () => {
  it("round trips, versions the key, and survives broken storage", () => {
    const mem = new Map<string, string>();
    const store: StoreLike = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => void mem.set(k, v) };
    expect(writeCache(store, "A/B", { x: 1 })).toBe(true);
    expect([...mem.keys()]).toEqual([CACHE_PREFIX + "a/b"]);
    expect(readCache(store, "a/b", (v) => v)).toEqual({ x: 1 });
    mem.set(CACHE_PREFIX + "a/b", "{junk");
    expect(readCache(store, "a/b", (v) => v)).toBeNull();
    const broken: StoreLike = { getItem: () => { throw new Error("denied"); }, setItem: () => { throw new Error("full"); } };
    expect(writeCache(broken, "a/b", 1)).toBe(false);
    expect(readCache(broken, "a/b", (v) => v)).toBeNull();
    expect(writeCache(null, "a/b", 1)).toBe(false);
  });
});
