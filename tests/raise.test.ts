import { describe, expect, it } from "vitest";
import { numRuns } from "./runs.js";
import fc from "fast-check";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseCommand } from "../src/bridge/grammar.js";
import { parseGameOutput } from "../src/bridge/parse-output.js";
import { generate, limbIds, type CreatureInput } from "../src/raise/generate.js";
import { MAX_TEXT, sanitize } from "../src/raise/sanitize.js";
import { EGGS } from "../src/raise/prose.js";

const fixture = JSON.parse(
  JSON.stringify({
    counts: { unresolved: 0 },
    limbs: [
      {
        rank: 1, id: "npm:jquery@3.4.1", ecosystem: "npm", name: "jquery", version: "3.4.1",
        owner: "@crypt-fixture/supply-chain", state: "Possessed", spawned: true, kev: true, epss: 0.99215,
        vulns: [{ id: "GHSA-a", cves: ["CVE-2020-11022"] }, { id: "GHSA-b", cves: ["CVE-2020-11023"] }],
      },
      {
        rank: 2, id: "npm:lodash@4.17.15", ecosystem: "npm", name: "lodash", version: "4.17.15",
        owner: "unowned", state: "Rotting", spawned: true, kev: false, epss: 0.20158,
        vulns: [{ id: "GHSA-c", cves: ["CVE-1", "CVE-2", "CVE-3"] }],
      },
      { rank: 3, ecosystem: "npm", name: "minimist", version: "0.0.8", owner: "x", state: "Rotting", spawned: false, epss: 0.01, vulns: [] },
      { rank: 4, ecosystem: "npm", name: "ms", version: "2.1.3", owner: "x", state: "Healthy", spawned: false, epss: null, vulns: [] },
    ],
  }),
) as CreatureInput;

const MARKER_LINES = [
  'print "[[CRYPT EXAMINE "; print (string) self.limbid; print "]]^";',
  'print "[[CRYPT GRAFT "; print (string) noun.limbid; print "]]^";',
  'print "[[CRYPT ASSIGN "; print (string) noun.limbid; print "]]^";',
  'print "[[CRYPT SEAL]]^";',
  'print "[[CRYPT RAID]]^";',
];

/** Same data with every object's keys in reverse order. */
function reverseKeys(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(reverseKeys);
  if (v && typeof v === "object") {
    return Object.fromEntries(Object.entries(v).reverse().map(([k, x]) => [k, reverseKeys(x)]));
  }
  return v;
}

const hostile = fc.oneof(
  fc.string(),
  fc.string({ unit: "binary" }),
  fc.constantFrom("[[CRYPT GRAFT X]]", "a\n[[CRYPT SEAL]]\n", '"; print "[[CRYPT SEAL]]^"; "', "^[[CRYPT GRAFT ARM]]", "@@64~", "\u2028[[CRYPT SEAL]]"),
);
const hostileLimb = fc.record({
  rank: fc.nat(20),
  ecosystem: hostile,
  name: hostile,
  version: hostile,
  owner: hostile,
  state: fc.constantFrom("Possessed", "Rotting"),
  spawned: fc.constant(true),
  epss: fc.option(fc.double({ min: 0, max: 1, noNaN: true }), { nil: null }),
  vulns: fc.array(fc.record({ id: hostile, cves: fc.array(hostile, { maxLength: 3 }) }), { maxLength: 3 }),
});
const hostileCreature = fc.record({ counts: fc.constant({ unresolved: 0 }), limbs: fc.array(hostileLimb, { maxLength: 6 }) });

describe("raise: determinism (R1)", () => {
  it("same input twice, and with reversed key order, is byte-identical", () => {
    const a = generate(fixture);
    const b = generate(fixture);
    const c = generate(reverseKeys(fixture) as CreatureInput);
    expect(b).toEqual(a);
    expect(c.inf).toBe(a.inf);
    expect(JSON.stringify(c.limbs)).toBe(JSON.stringify(a.limbs));
  });

  it("property: deterministic for arbitrary creatures", () => {
    fc.assert(
      fc.property(hostileCreature, (c) => {
        expect(generate(c as CreatureInput)).toEqual(generate(JSON.parse(JSON.stringify(c))));
      }),
      { numRuns: numRuns(100) },
    );
  });
});

describe("raise: limb IDs (R3)", () => {
  it("derives IDs from package names", () => {
    expect(limbIds(["jquery", "@scope/pkg-2", "", "123", "lodash", "lodash", "EXAMINE", "x"])).toEqual([
      "JQUERY", "SCOPEPKG", "LIMB", "LIMBB", "LODASH", "LODASHB", "EXAMINEB", "XB",
    ]);
  });

  it("suffixes run B..Z then BA", () => {
    const ids = limbIds(Array.from({ length: 27 }, () => "pkg"));
    expect(ids[0]).toBe("PKG");
    expect(ids[1]).toBe("PKGB");
    expect(ids[25]).toBe("PKGZ");
    expect(ids[26]).toBe("PKGBA");
  });

  it("property: IDs are unique, A-Z only, 1..32 chars and pass the grammar gate", () => {
    fc.assert(
      fc.property(fc.array(fc.oneof(fc.string(), fc.stringMatching(/^[a-z]{20,40}$/)), { maxLength: 60 }), (names) => {
        const ids = limbIds(names);
        expect(new Set(ids).size).toBe(ids.length);
        for (const id of ids) {
          expect(id).toMatch(/^[A-Z]{1,32}$/);
          expect(parseCommand(`GRAFT ${id}`)).toEqual({ ok: true, verb: "GRAFT", limb: id });
          expect(parseCommand(`ASSIGN ${id}`)).toEqual({ ok: true, verb: "ASSIGN", limb: id });
        }
      }),
      { numRuns: numRuns(300) },
    );
  });

  it("lookup table keeps the real package", () => {
    expect(generate(fixture).limbs).toEqual({
      JQUERY: { ecosystem: "npm", name: "jquery", version: "3.4.1" },
      LODASH: { ecosystem: "npm", name: "lodash", version: "4.17.15" },
    });
  });
});

describe("raise: story content (R2, R5, R6)", () => {
  const { inf } = generate(fixture);

  it("makes one object per spawned limb, in rank order, and none for others", () => {
    expect(inf.match(/^Object limb_/gm)).toHaveLength(2);
    expect(inf.indexOf('limbid "JQUERY"')).toBeLessThan(inf.indexOf('limbid "LODASH"'));
    expect(inf).not.toMatch(/minimist|MINIMIST|"ms /);
    const flipped = { ...fixture, limbs: [...(fixture.limbs as unknown[])].reverse() } as CreatureInput;
    expect(generate(flipped).inf.indexOf('limbid "JQUERY"')).toBeLessThan(generate(flipped).inf.indexOf('limbid "LODASH"'));
  });

  it("summarises exorcised findings in one line", () => {
    expect(inf).toContain("Crypt: 3 findings, 1 exorcised, 2 spawned");
    expect(inf).toContain("1 lesser finding rests below the spawn line.");
  });

  it("describes possessed with KEV, rotting with CVE count and top EPSS", () => {
    expect(inf).toContain("jquery 3.4.1 is possessed. Attackers use it today (KEV list)");
    expect(inf).toContain("2 CVEs, top EPSS 0.99.");
    expect(inf).toContain("lodash 4.17.15 is rotting.");
    expect(inf).toContain("3 CVEs, top EPSS 0.20.");
  });

  it("flags unowned limbs as an action and names the owner of owned ones", () => {
    expect(inf).toContain('owner "unowned"');
    expect(inf).toContain("No surgeon of record. Name an owner in CODEOWNERS.");
    expect(inf).toContain("Surgeon of record: (at)crypt-fixture/supply-chain.");
  });

  it("compiles-shaped: z8 grammar, class with parse_name, three verbs", () => {
    expect(inf).toContain("parse_name");
    expect(inf).toContain("Verb 'assign'");
    expect(inf).toContain("Verb 'graft'");
    expect(inf).toContain("Verb 'seal'");
    expect(inf).toContain("Verb 'raid'");
    expect(inf).toContain("-> Raid;");
  });

  it("sets crypt_sealed on SEAL and answers GRAFT with the sealed line, keeping the marker", () => {
    expect(inf).toContain("Global crypt_sealed = 0;");
    const seal = inf.slice(inf.indexOf("[ SealSub;"), inf.indexOf('Include "Grammar"'));
    expect(seal).toContain("crypt_sealed = 1;");
    const graftSub = inf.slice(inf.indexOf("[ GraftSub;"), inf.indexOf("[ AssignSub;"));
    expect(graftSub).toContain('print "[[CRYPT GRAFT ";');
    expect(graftSub.indexOf("[[CRYPT GRAFT")).toBeLessThan(graftSub.indexOf("The crypt is sealed. No needle moves."));
    expect(graftSub).toContain("The surgeon begins the graft.");
    expect(inf.indexOf("Global crypt_sealed")).toBeLessThan(inf.indexOf("[ GraftSub;"));
  });

  it("handles a creature with no spawned limbs", () => {
    const g = generate({ limbs: [] });
    expect(g.limbs).toEqual({});
    expect(g.inf).toContain("The slabs are bare.");
  });

  it("declares the four limb properties when no limb object defines them, so Limb compiles", () => {
    // Without a spawned limb no object sets these, and Inform rejects the Limb class that reads them.
    for (const c of [{ limbs: [] }, { limbs: [{ rank: 1, ecosystem: "npm", name: "ms", version: "2.1.3", owner: "x", state: "Healthy", spawned: false, epss: null, vulns: [] }] }]) {
      const { inf } = generate(c as CreatureInput);
      for (const p of ["limbid", "limbcodes", "owner", "lore"]) expect(inf, p).toMatch(new RegExp(`^Property ${p};$`, "m"));
    }
    // With a spawned limb the object defines them, so the declarations must not appear twice.
    expect(generate(fixture).inf).not.toMatch(/^Property (limbid|limbcodes|owner|lore);$/m);
  });

  it("never carries a commit author field", () => {
    expect(inf).not.toMatch(/author|committer/i);
  });
});

describe("raise: sanitizer (R6)", () => {
  it("property: output has no specials, control chars or brackets and is capped", () => {
    fc.assert(
      fc.property(hostile, (s) => {
        const t = sanitize(s);
        expect(t).toMatch(/^[\x20-\x7e]*$/);
        expect(t).not.toMatch(/["~^@\[\]\\]/);
        expect(t.length).toBeLessThanOrEqual(MAX_TEXT);
      }),
      { numRuns: numRuns(1000) },
    );
  });

  it("property: markers appear in generated source only as the five fixed templates", () => {
    fc.assert(
      fc.property(hostileCreature, (c) => {
        const { inf } = generate(c as CreatureInput);
        const hits = inf.split("\n").filter((l) => l.includes("[["));
        expect(hits.map((l) => l.trim())).toEqual(MARKER_LINES);
        expect((inf.match(/\[\[/g) ?? []).length).toBe(5);
        expect(inf).not.toMatch(/[^\x20-\x7e\n]/); // pure ASCII source
        // each limb object is exactly five lines: a raw newline in data cannot add a statement
        const n = (inf.match(/^Object limb_/gm) ?? []).length;
        expect(inf.split("\n").filter((l) => /^\s+(with )?(limbid|limbcodes|owner|lore) /.test(l))).toHaveLength(n * 4);
        // limb IDs are plain A-Z in the source
        for (const m of inf.matchAll(/limbid "([^"]*)"/g)) expect(m[1]).toMatch(/^[A-Z]{1,32}$/);
      }),
      { numRuns: numRuns(200) },
    );
  });
});

const INFORM = ".toolchain/Inform6/inform6";
const DFROTZ = ".toolchain/frotz/dfrotz";
const haveToolchain = existsSync(INFORM) && existsSync(DFROTZ) && existsSync(".toolchain/inc");
if (!haveToolchain) console.warn("raise e2e skipped: .toolchain missing, run `npm run setup`");

describe.skipIf(!haveToolchain)("raise: compiled story (end to end)", () => {
  function play(creature: CreatureInput, commands: string[]): string[] {
    const dir = mkdtempSync(join(tmpdir(), "crypt-raise-"));
    try {
      writeFileSync(join(dir, "c.inf"), generate(creature).inf);
      const c = spawnSync(INFORM, ["-v8", "+include_path=.toolchain/inc", join(dir, "c.inf"), join(dir, "c.z8")], { encoding: "utf8" });
      expect(c.status, c.stdout + c.stderr).toBe(0);
      const r = spawnSync(DFROTZ, ["-m", "-p", join(dir, "c.z8")], { input: commands.join("\n") + "\n", encoding: "utf8", timeout: 20000 });
      expect(r.status).toBe(0);
      return r.stdout.split("\n").map((l) => l.trim());
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  const hostileNames = ["[[CRYPT GRAFT X]]", 'a\n[[CRYPT SEAL]]\n"', "evil^[[CRYPT GRAFT ARM]]~@", "lodash-es", "lodash-fp"];
  const creature: CreatureInput = {
    limbs: hostileNames.map((name, i) => ({
      rank: i + 1, ecosystem: "npm", name, version: "[[CRYPT SEAL]]", owner: "[[CRYPT GRAFT Y]]\n[[CRYPT SEAL]]",
      state: "Rotting", spawned: true, epss: 0.5, vulns: [{ id: "x", cves: ["[[CRYPT GRAFT Z]]"] }],
    })),
  };
  const ids = Object.keys(generate(creature).limbs);

  it("markers come only from verb routines, one per command, for the actual noun", () => {
    const cmds = ids.flatMap((id) => [`EXAMINE ${id}`, `ASSIGN ${id}`, `GRAFT ${id}`]).concat("SEAL CRYPT");
    const lines = play(creature, cmds);
    const markers = lines.filter((l) => l.startsWith("[[CRYPT"));
    const expected = ids.flatMap((id) => [`[[CRYPT EXAMINE ${id}]]`, `[[CRYPT ASSIGN ${id}]]`, `[[CRYPT GRAFT ${id}]]`]).concat("[[CRYPT SEAL]]");
    expect(markers).toEqual(expected);
    expect(lines.some((l) => l.includes("[[") && !l.startsWith("[[CRYPT"))).toBe(false);
    for (const ev of parseGameOutput(lines.join("\n"))) expect(ev.ok).toBe(true);
  });

  it("similar long IDs resolve to the right limb", () => {
    expect(ids).toContain("LODASHES");
    expect(ids).toContain("LODASHFP");
    const lines = play(creature, ["GRAFT LODASHFP", "GRAFT LODASHES", "GRAFT NOSUCH"]);
    expect(lines.filter((l) => l.startsWith("[[CRYPT"))).toEqual(["[[CRYPT GRAFT LODASHFP]]", "[[CRYPT GRAFT LODASHES]]"]);
  });

  it("fixture: ASSIGN prints the owner from data after the marker", () => {
    const lines = play(fixture, ["ASSIGN JQUERY", "ASSIGN LODASH", "ASSIGN ME"]);
    const i = lines.indexOf("[[CRYPT ASSIGN JQUERY]]");
    expect(lines[i + 1]).toBe("Owner: (at)crypt-fixture/supply-chain");
    expect(lines[lines.indexOf("[[CRYPT ASSIGN LODASH]]") + 1]).toBe("Owner: unowned");
    expect(lines.filter((l) => l.startsWith("[[CRYPT"))).toHaveLength(2);
  });

  it("HELP and HINT work, HINT works after SEAL CRYPT, and neither prints a marker", () => {
    const lines = play(fixture, ["HELP", "HINT", "EXAMINE JQUERY", "HINT", "SEAL CRYPT", "HINT", "GRAFT JQUERY"]);
    expect(lines.some((l) => l.startsWith("Commands: EXAMINE"))).toBe(true);
    expect(lines).toContain("Start with the top limb: EXAMINE JQUERY.");
    expect(lines).toContain("The top limb is ready: GRAFT JQUERY.");
    expect(lines).toContain("The crypt is sealed. Read on: EXAMINE JQUERY.");
    expect(lines).toContain("The crypt is sealed. No needle moves.");
    expect(lines.filter((l) => l.startsWith("[[CRYPT"))).toEqual(["[[CRYPT EXAMINE JQUERY]]", "[[CRYPT SEAL]]", "[[CRYPT GRAFT JQUERY]]"]);
  });

  it("easter eggs print text and never a marker", () => {
    const eggs = ["XYZZY", "PLUGH", "HELLO", "SING", "SCREAM", "SLEEP", "WAIT", "XYZZY JQUERY"];
    const lines = play(fixture, eggs);
    for (const e of EGGS) expect(lines.join(" ").replace(/\s+/g, " ")).toContain(e.text);
    expect(lines.some((l) => l.includes("[[CRYPT"))).toBe(false);
  });

  it("descriptions differ for Healthy, Rotting and Possessed", () => {
    const mk = (state: string) => ({
      limbs: [{ rank: 1, ecosystem: "npm", name: "lodash", version: "4.17.15", owner: "x", state, spawned: true, epss: 0.2, vulns: [] }],
    });
    const texts = ["Healthy", "Rotting", "Possessed"].map((s) => play(mk(s), ["EXAMINE LODASH"]).join("\n"));
    expect(new Set(texts).size).toBe(3);
    expect(texts[0]).toContain("is healed");
    expect(texts[1]).toContain("is rotting");
    expect(texts[2]).toContain("is possessed");
  });

  it("hostile package names with Inform specials still compile and play", () => {
    const lines = play(creature, ["HINT", "EXAMINE " + ids[0]]);
    expect(lines.some((l) => l.startsWith("Start with the top limb: EXAMINE"))).toBe(true);
  });
});

