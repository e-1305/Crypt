import { describe, expect, it } from "vitest";
import { collectTraction, renderTraction, NPM_URL, REPO_URL } from "../scripts/traction.js";
import type { Fetcher } from "../scripts/github-client.js";

const reply = (status: number, body: unknown) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

function fake(routes: Record<string, () => ReturnType<typeof reply>>): Fetcher {
  return async (url) => {
    const k = Object.keys(routes).find((r) => url.startsWith(r));
    if (!k) throw new Error("unexpected url " + url);
    return routes[k]!();
  };
}

describe("collectTraction", () => {
  it("reads npm downloads, stars and forks from the responses", async () => {
    const rows = await collectTraction({
      fetch: fake({ [NPM_URL]: () => reply(200, { downloads: 42 }), [REPO_URL]: () => reply(200, { stargazers_count: 7, forks_count: 3 }) }),
    });
    const v = Object.fromEntries(rows.map((r) => [r.measure, r.value]));
    expect(v["npm downloads, last week (@e-1305/crypt)"]).toBe("42");
    expect(v["GitHub stars (e-1305/Crypt)"]).toBe("7");
    expect(v["GitHub forks (e-1305/Crypt)"]).toBe("3");
    expect(v["Public repos using the Action"]).toMatch(/^not discoverable/);
  });

  it("reports an unpublished package as 'not published', never 0", async () => {
    const rows = await collectTraction({
      fetch: fake({ [NPM_URL]: () => reply(404, { error: "package @e-1305/crypt not found" }), [REPO_URL]: () => reply(200, { stargazers_count: 0, forks_count: 0 }) }),
    });
    expect(rows[0]!.value).toBe("not published");
  });

  it("prints 'unavailable' on HTTP errors, network errors and malformed bodies", async () => {
    const rows = await collectTraction({
      fetch: fake({
        [NPM_URL]: () => {
          throw new Error("network down");
        },
        [REPO_URL]: () => reply(403, { message: "rate limited" }),
      }),
    });
    expect(rows.slice(0, 3).map((r) => r.value)).toEqual(["unavailable", "unavailable", "unavailable"]);
    const bad = await collectTraction({ fetch: fake({ [NPM_URL]: () => reply(200, { downloads: "lots" }), [REPO_URL]: () => reply(200, {}) }) });
    expect(bad.slice(0, 3).map((r) => r.value)).toEqual(["unavailable", "unavailable", "unavailable"]);
  });

  it("uses code search only with a token, dedupes by repository and excludes the org", async () => {
    const seen: { url: string; auth?: string | undefined }[] = [];
    const f: Fetcher = async (url, init) => {
      seen.push({ url, auth: init?.headers?.authorization });
      if (url.startsWith(NPM_URL)) return reply(200, { downloads: 1 });
      if (url.startsWith(REPO_URL)) return reply(200, { stargazers_count: 1, forks_count: 1 });
      return reply(200, {
        total_count: 3,
        items: [{ repository: { full_name: "a/x" } }, { repository: { full_name: "A/x" } }, { repository: { full_name: "b/y" } }],
      });
    };
    const rows = await collectTraction({ token: "t", fetch: f });
    expect(rows[3]!.value).toBe("2 repositories (outside e-1305)");
    const search = seen.find((s) => s.url.startsWith("https://api.github.com/search/code"))!;
    expect(decodeURIComponent(search.url)).toContain("-org:e-1305");
    expect(search.auth).toBe("Bearer t");
    expect(seen.find((s) => s.url.startsWith(NPM_URL))!.auth).toBeUndefined();
    const noTok = await collectTraction({ fetch: f });
    expect(noTok[3]!.value).toMatch(/^not discoverable/);
  });

  it("labels a truncated code search as a lower bound and reports failures as unavailable", async () => {
    const base = { [NPM_URL]: () => reply(200, { downloads: 1 }), [REPO_URL]: () => reply(200, { stargazers_count: 1, forks_count: 1 }) };
    const more = await collectTraction({ token: "t", fetch: fake({ ...base, "https://api.github.com/search/code": () => reply(200, { total_count: 500, items: [{ repository: { full_name: "a/x" } }] }) }) });
    expect(more[3]!.value).toBe("at least 1 repositories (outside e-1305)");
    const bad = await collectTraction({ token: "t", fetch: fake({ ...base, "https://api.github.com/search/code": () => reply(403, { message: "rate" }) }) });
    expect(bad[3]!.value).toBe("unavailable");
  });

  it("renders a table whose digits all come from the input", async () => {
    const rows = await collectTraction({ fetch: fake({ [NPM_URL]: () => reply(404, { error: "package not found" }), [REPO_URL]: () => reply(500, {}) }) });
    const out = renderTraction(rows, "2030-01-02");
    expect(out).toContain("| Measure | Value | Source |");
    expect(out.replace("2030-01-02", "").replace(/@e-1305|e-1305/g, "")).not.toMatch(/\d/);
  });
});
