import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { generate } from "../scripts/compare-dependabot.js";
import { MAX_PRS, compareRows } from "../src/compare/dependabot.js";
import { buildCreature } from "../src/exhume/creature.js";
import { parseEpss, parseKev } from "../src/exhume/feeds.js";
import { nodeFs } from "../scripts/node-fs.js";

const F = "fixtures/vulnerable-npm/feeds";
async function rows() {
  const creature = await buildCreature({
    repo: nodeFs("fixtures/crypt-demo"),
    cacheFs: nodeFs("."),
    cacheDir: "data/cache/osv",
    kev: parseKev(readFileSync(`${F}/kev.json`, "utf8")),
    epss: parseEpss(readFileSync(`${F}/epss.csv`, "utf8")),
  });
  return compareRows(creature);
}

afterEach(() => vi.unstubAllGlobals());

describe("compare:dependabot", () => {
  it("makes no network call", async () => {
    const f = vi.fn(() => Promise.reject(new Error("network used")));
    vi.stubGlobal("fetch", f);
    await rows();
    await generate();
    expect(f).not.toHaveBeenCalled();
  });

  it("has a row for each of the 7 lockfile packages, sorted by name", async () => {
    const r = await rows();
    expect(r.map((x) => x.name)).toEqual(["handlebars", "jquery", "lodash", "minimist", "mkdirp", "ms", "node-fetch"]);
    expect(r.find((x) => x.name === "minimist")!.direct).toBe(false);
  });

  it("ms has no advisories, no Dependabot PR and no spawn", async () => {
    const ms = (await rows()).find((x) => x.name === "ms")!;
    expect(ms.advisories).toEqual([]);
    expect(ms.dependabotPr).toBe(false);
    expect(ms.cryptSpawns).toBe(false);
  });

  it("Dependabot opens one PR per vulnerable package", async () => {
    const r = await rows();
    expect(r.filter((x) => x.dependabotPr).map((x) => x.name)).toEqual(["handlebars", "jquery", "lodash", "minimist", "node-fetch"]);
  });

  it("jquery is KEV, Possessed, rank 1 and spawns; owner comes from CODEOWNERS", async () => {
    const jq = (await rows()).find((x) => x.name === "jquery")!;
    expect(jq.cryptRank).toBe(1);
    expect(jq.cryptState).toBe("Possessed");
    expect(jq.cryptSpawns).toBe(true);
    expect(jq.why).toContain("KEV");
    expect(jq.owner).toBe("@e-1305");
  });

  it("exorcises vulnerable packages under the 0.1 EPSS line and spawns at most 5", async () => {
    const r = await rows();
    expect(r.filter((x) => x.cryptSpawns).map((x) => x.name)).toEqual(["jquery", "lodash"]);
    expect(r.filter((x) => x.cryptSpawns).length).toBeLessThanOrEqual(MAX_PRS);
    const hb = r.find((x) => x.name === "handlebars")!;
    expect(hb.dependabotPr && !hb.cryptSpawns).toBe(true);
    expect(hb.why).toContain("noise line");
  });

  it("docs/VS-DEPENDABOT.md contains exactly the script output", async () => {
    const doc = readFileSync("docs/VS-DEPENDABOT.md", "utf8");
    const m = /<!-- compare:dependabot begin -->([\s\S]*?)<!-- compare:dependabot end -->/.exec(doc);
    expect(m).not.toBeNull();
    expect(m![1]!.trim()).toBe((await generate()).trim());
  });

  it("the doc has no em dash and README links it", () => {
    expect(readFileSync("docs/VS-DEPENDABOT.md", "utf8")).not.toContain("\u2014");
    expect(readFileSync("README.md", "utf8")).toContain("docs/VS-DEPENDABOT.md");
  });
});
