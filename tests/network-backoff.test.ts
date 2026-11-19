import { describe, expect, it } from "vitest";
import { osvLookup, type Fetcher } from "../src/exhume/osv-client.js";
import { makeCall } from "../scripts/github-client.js";
import { limbKey, type Limb } from "../src/exhume/types.js";

const limb = (name: string): Limb => ({ ecosystem: "npm", name, version: "1.0.0" }) as Limb;
const res = (status: number, body: unknown = {}, headers: Record<string, string> = {}) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: { get: (n: string) => headers[n.toLowerCase()] ?? null },
  json: async () => body,
});
const noSleep = async () => {};

describe("osv backoff", () => {
  it("retries then succeeds, sleeping with doubling delays", async () => {
    const delays: number[] = [];
    let n = 0;
    const f: Fetcher = async (url) => {
      if (url.endsWith("querybatch") && n++ < 2) return res(503);
      return url.endsWith("querybatch") ? res(200, { results: [{}] }) : res(200);
    };
    const out = await osvLookup(f, { sleep: async (ms) => void delays.push(ms), baseDelayMs: 100 })([limb("a")]);
    expect(out.get(limbKey(limb("a")))).toEqual([]);
    expect(delays).toEqual([100, 200]);
  });

  it("gives up and leaves the limb Unknown", async () => {
    let calls = 0;
    const f: Fetcher = async () => {
      calls++;
      throw new Error("down");
    };
    const out = await osvLookup(f, { sleep: noSleep, retries: 2 })([limb("a")]);
    expect(out.size).toBe(0);
    expect(calls).toBe(3);
  });

  it("does not retry a 404", async () => {
    let calls = 0;
    const f: Fetcher = async () => (calls++, res(404));
    expect((await osvLookup(f, { sleep: noSleep })([limb("a")])).size).toBe(0);
    expect(calls).toBe(1);
  });

  it("honors Retry-After from OSV", async () => {
    const delays: number[] = [];
    let n = 0;
    const f: Fetcher = async () => (n++ === 0 ? res(429, {}, { "retry-after": "3" }) : res(200, { results: [{}] }));
    await osvLookup(f, { sleep: async (ms) => void delays.push(ms) })([limb("a")]);
    expect(delays).toEqual([3000]);
  });

  it("never exceeds the concurrency cap", async () => {
    let active = 0;
    let peak = 0;
    const f: Fetcher = async (url) => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 1));
      active--;
      if (url.endsWith("querybatch")) return res(200, { results: [{ vulns: Array.from({ length: 12 }, (_, i) => ({ id: `V-${i}` })) }] });
      return res(200, { aliases: [] });
    };
    const out = await osvLookup(f, { concurrency: 3, sleep: noSleep })([limb("a")]);
    expect(out.get(limbKey(limb("a")))).toHaveLength(12);
    expect(peak).toBeLessThanOrEqual(3);
    expect(peak).toBeGreaterThan(1);
  });

  it("shares detail cache across lookups", async () => {
    const urls: string[] = [];
    const f: Fetcher = async (url) => {
      urls.push(url);
      return url.endsWith("querybatch") ? res(200, { results: [{ vulns: [{ id: "V-1" }] }] }) : res(200, { aliases: ["CVE-1"] });
    };
    const lookup = osvLookup(f, { sleep: noSleep });
    await lookup([limb("a")]);
    await lookup([limb("b")]);
    expect(urls.filter((u) => u.includes("/vulns/"))).toHaveLength(1);
  });
});

describe("github rate limits", () => {
  const make = (responses: ReturnType<typeof res>[], delays: number[], extra = {}) => {
    let i = 0;
    const call = makeCall({
      token: "t",
      fetch: async () => responses[Math.min(i++, responses.length - 1)]!,
      sleep: async (ms) => void delays.push(ms),
      ...extra,
    });
    return { call, count: () => i };
  };

  it("waits Retry-After on a secondary rate limit then succeeds", async () => {
    const delays: number[] = [];
    const { call } = make([res(403, {}, { "retry-after": "7" }), res(200, { ok: 1 })], delays);
    expect(await call("GET", "/x")).toEqual({ ok: 1 });
    expect(delays).toEqual([7000]);
  });

  it("is bounded by maxRetries and then throws", async () => {
    const delays: number[] = [];
    const { call, count } = make([res(429, {}, { "retry-after": "1" })], delays);
    await expect(call("GET", "/x")).rejects.toMatchObject({ status: 429 });
    expect(count()).toBe(3);
  });

  it("does not retry a plain 403 or a 500", async () => {
    for (const s of [403, 500]) {
      const { call, count } = make([res(s)], []);
      await expect(call("POST", "/x", {})).rejects.toMatchObject({ status: s });
      expect(count()).toBe(1);
    }
  });
});
