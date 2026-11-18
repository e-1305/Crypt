// D3: the shareable card layout is pure, deterministic and blameless. The canvas painting (web/card/) is covered by visual QA.
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { CARD_HEIGHT, CARD_WIDTH, SITE_URL, defaultIncludeRepo, layoutCard, linkedInShareUrl, shareText } from "../src/render/card.js";
import { numRuns } from "./runs.js";

const creature = {
  repo: "acme/widgets",
  limbs: [
    { ecosystem: "npm", name: "lodash", version: "4.17.15", state: "Possessed", rank: 1, spawned: true, owner: "@alice", epss: 0.9, kev: true },
    { ecosystem: "npm", name: "minimist", version: "0.0.8", state: "Rotting", rank: 2, spawned: true, owner: "@bob" },
    { ecosystem: "npm", name: "ms", version: "2.1.3", state: "Healed", rank: 3, spawned: true, healed: true, healedBy: "carol" },
    { ecosystem: "npm", name: "mkdirp", version: "0.5.1", state: "Rotting", rank: 4, spawned: false },
    { ecosystem: "npm", name: "left-pad", version: "1.3.0", state: "Healthy", rank: 5, spawned: false },
  ],
};
const raid = { riskRemoved: "3.42", limbsHealed: 2, time: "07:31", rank: "Surgeon" };
const allText = (l: ReturnType<typeof layoutCard>) => l.ops.map((o) => (o.t === "text" ? o.text : "")).join("\n");

describe("layoutCard", () => {
  it("is 1200 by 627 and the same creature gives the same card (snapshot)", () => {
    const a = layoutCard({ variant: "creature", creature, includeRepo: true });
    const b = layoutCard({ variant: "creature", creature: JSON.parse(JSON.stringify(creature)), includeRepo: true });
    expect([a.width, a.height]).toEqual([CARD_WIDTH, CARD_HEIGHT]);
    expect(b).toEqual(a);
    expect(a).toMatchSnapshot();
  });

  it("raid variant snapshot", () => {
    expect(layoutCard({ variant: "raid", creature, includeRepo: false, raid })).toMatchSnapshot();
  });

  it("shows findings, monsters, counts, logo line and the site URL", () => {
    const l = layoutCard({ variant: "creature", creature, includeRepo: false });
    const t = allText(l);
    expect(l.counts).toEqual({ findings: 4, monsters: 3, possessed: 1, rotting: 2, healed: 1 });
    expect(t).toContain("4 findings -> 3 monsters");
    expect(t).toContain("# Possessed 1");
    expect(t).toContain("% Rotting 2");
    expect(t).toContain("Healed this week 1");
    expect(t).toContain("Don't abandon your creature");
    expect(t).toContain(SITE_URL);
    expect(t).toContain("lod~ 4.17.15 - POSSESSED");
  });

  it("raid card adds team score, limbs healed and time; creature card does not", () => {
    const r = allText(layoutCard({ variant: "raid", creature, includeRepo: false, raid }));
    expect(r).toContain("Team risk removed 3.42");
    expect(r).toContain("Limbs healed 2");
    expect(r).toContain("Raid time 07:31");
    expect(allText(layoutCard({ variant: "creature", creature, includeRepo: false, raid }))).not.toContain("Team risk");
  });

  it("names the repo only when includeRepo is true", () => {
    const on = layoutCard({ variant: "creature", creature, includeRepo: true });
    const off = layoutCard({ variant: "creature", creature, includeRepo: false });
    expect(allText(on)).toContain("acme/widgets");
    for (const s of [allText(off), off.alt, off.shareText]) expect(s).not.toContain("widgets");
    expect(off.name).toBe(on.name);
  });

  it("never carries an owner, a login or a commit author", () => {
    for (const includeRepo of [true, false]) {
      const l = layoutCard({ variant: "raid", creature, includeRepo, raid });
      const s = allText(l) + l.alt + l.shareText;
      for (const who of ["alice", "bob", "carol", "@"]) expect(s).not.toContain(who);
    }
  });

  it("property: owner, author and login strings from the input never reach the output", () => {
    fc.assert(
      fc.property(fc.stringMatching(/^[a-z]{8,12}$/), fc.stringMatching(/^[a-z]{8,12}$/), fc.stringMatching(/^[a-z]{8,12}$/), fc.boolean(), fc.constantFrom("creature", "raid"), (owner, author, login, includeRepo, variant) => {
        const c = {
          repo: "o/r",
          limbs: [{ ecosystem: "npm", name: "pkg", version: "1.0.0", state: "Possessed", rank: 1, spawned: true, owner: `@${owner}`, author, commitAuthor: author, healed: true, healedBy: login }],
        };
        const l = layoutCard({ variant: variant as "creature" | "raid", creature: c, includeRepo, raid });
        const s = (allText(l) + l.alt + l.shareText).toLowerCase();
        // 8+ letter random words cannot collide with the fixed card text unless they leaked.
        for (const w of [owner, author, login]) if (!"crypt creature monsters possessed".includes(w)) expect(s).not.toContain(w);
      }),
      { numRuns: numRuns(100) },
    );
  });

  it("survives hostile or empty input", () => {
    for (const bad of [null, undefined, 5, "x", {}, { limbs: "no" }, { limbs: [null, 3, {}] }]) {
      const l = layoutCard({ variant: "creature", creature: bad, includeRepo: true });
      expect(l.ops.length).toBeGreaterThan(0);
      expect(l.counts.findings).toBe(0);
    }
  });

  it("text stays printable ASCII", () => {
    const l = layoutCard({ variant: "creature", creature: { ...creature, repo: "caf\u00e9/\u2014x" }, includeRepo: true });
    expect(allText(l)).toMatch(/^[\x20-\x7e\n]*$/);
  });
});

describe("share helpers", () => {
  it("toggle defaults ON for paste your repo and OFF otherwise", () => {
    expect(defaultIncludeRepo("paste")).toBe(true);
    expect(defaultIncludeRepo("raid")).toBe(false);
    expect(defaultIncludeRepo("")).toBe(false);
  });

  it("LinkedIn URL carries the site link", () => {
    const u = new URL(linkedInShareUrl());
    expect(u.origin + u.pathname).toBe("https://www.linkedin.com/sharing/share-offsite/");
    expect(u.searchParams.get("url")).toBe(SITE_URL);
  });

  it("share text is short, honest and tagged", () => {
    const c = { findings: 12, monsters: 4, possessed: 3, rotting: 9, healed: 0 };
    for (const t of [shareText("creature", c), shareText("raid", c, raid)]) {
      expect(t).toContain("#KiroweenHackathon26");
      expect(t).toContain(SITE_URL);
      expect(t.length).toBeLessThan(300);
      expect(t).not.toContain("\u2014");
    }
  });
});
