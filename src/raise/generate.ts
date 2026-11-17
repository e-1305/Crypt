// Pure generator: creature.json -> Inform 6 source plus a lookup table of limb IDs.
// No fs, clock, random or network. Same input gives byte-identical output.
// Markers ("[[CRYPT ...]]") are printed only by the fixed verb routines below; every data string
// goes through sanitize() and is written only inside a quoted Inform literal as game text.
import { sanitize } from "./sanitize.js";

export interface LimbInput {
  rank?: unknown;
  ecosystem?: unknown;
  name?: unknown;
  version?: unknown;
  owner?: unknown;
  state?: unknown;
  spawned?: unknown;
  kev?: unknown;
  epss?: unknown;
  vulns?: unknown;
}

export interface CreatureInput {
  counts?: { unresolved?: unknown } | null;
  limbs?: unknown;
}

export interface LimbRef {
  ecosystem: string;
  name: string;
  version: string;
}

export interface Generated {
  inf: string;
  limbs: Record<string, LimbRef>;
}

export const MAX_ID_BASE = 24;
export const FALLBACK_ID = "LIMB";

/** Words that must never become a limb ID: our verbs, the room, and library verbs and directions. */
const RESERVED = new Set(
  (
    "EXAMINE X GRAFT ASSIGN SEAL CRYPT THE " +
    "LOOK L INVENTORY I TAKE GET DROP GO WALK ENTER EXIT OPEN CLOSE LOCK UNLOCK PUSH PULL TURN WAIT Z " +
    "SAVE RESTORE RESTART QUIT Q VERBOSE BRIEF SCORE UNDO VERSION SCRIPT UNSCRIPT NOTIFY " +
    "ME SELF ALL IT THEM N S E W NE NW SE SW U D NORTH SOUTH EAST WEST UP DOWN IN OUT"
  ).split(" "),
);

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function suffix(k: number): string {
  // k=1 -> B, 25 -> Z, 26 -> BA, 27 -> BB (base 26 with A as zero)
  let s = "";
  for (let n = k; n > 0; n = Math.floor(n / 26)) s = String.fromCharCode(65 + (n % 26)) + s;
  return s;
}

/** Stable, Inform-safe ID from a package name: A-Z only, at most 24 + 3 chars, never reserved or repeated. */
export function limbIds(names: string[]): string[] {
  const used = new Set<string>();
  return names.map((name) => {
    let base = name.toUpperCase().replace(/[^A-Z]/g, "").slice(0, MAX_ID_BASE);
    if (base === "") base = FALLBACK_ID;
    let id = base;
    for (let k = 1; used.has(id) || RESERVED.has(id); k++) id = base + suffix(k);
    used.add(id);
    return id;
  });
}

interface Monster {
  id: string;
  ref: LimbRef;
  possessed: boolean;
  owner: string; // raw, "unowned" when none
  cves: number;
  advisories: number;
  epss: string | null;
}

function toMonster(l: LimbInput, id: string): Monster {
  const vulns = Array.isArray(l.vulns) ? (l.vulns as unknown[]) : [];
  const cves = new Set<string>();
  for (const v of vulns) {
    const list = v && typeof v === "object" ? (v as { cves?: unknown }).cves : null;
    if (Array.isArray(list)) for (const c of list) if (typeof c === "string") cves.add(c);
  }
  const e = l.epss;
  const epss = typeof e === "number" && Number.isFinite(e) && e >= 0 && e <= 1 ? e.toFixed(2) : null;
  const owner = str(l.owner);
  return {
    id,
    ref: { ecosystem: str(l.ecosystem), name: str(l.name), version: str(l.version) },
    possessed: l.state === "Possessed",
    owner: owner === "" ? "unowned" : owner,
    cves: cves.size,
    advisories: vulns.length,
    epss,
  };
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

function lore(m: Monster): string {
  const label = sanitize(`${m.ref.name} ${m.ref.version}`);
  const lines: string[] = [];
  if (m.possessed) {
    lines.push(`${label} is possessed. Attackers use it today (KEV list). It thrashes on the slab.`);
  } else {
    lines.push(`${label} is rotting. It weakens a little more each day.`);
  }
  const count = m.cves > 0 ? plural(m.cves, "CVE", "CVEs") : plural(m.advisories, "advisory", "advisories");
  lines.push(m.epss === null ? `${count}.` : `${count}, top EPSS ${m.epss}.`);
  if (m.owner === "unowned") {
    lines.push("No surgeon of record. Name an owner in CODEOWNERS.");
  } else {
    lines.push(`Surgeon of record: ${sanitize(m.owner)}.`);
  }
  lines.push(`GRAFT ${m.id} to begin the repair.`);
  return lines.join("^");
}

function ownerText(m: Monster): string {
  return m.owner === "unowned" ? "unowned" : sanitize(m.owner);
}

function safeCount(v: unknown): number {
  return typeof v === "number" && Number.isInteger(v) && v >= 0 && v < 1_000_000 ? v : 0;
}

export function generate(creature: CreatureInput): Generated {
  const all: LimbInput[] = Array.isArray(creature?.limbs)
    ? (creature.limbs as unknown[]).filter((x): x is LimbInput => !!x && typeof x === "object")
    : [];
  const findings = all.filter((l) => l.state === "Possessed" || l.state === "Rotting");
  const spawned = all
    .map((l, i) => ({ l, i }))
    .filter(({ l }) => l.spawned === true)
    .sort((a, b) => {
      const ra = typeof a.l.rank === "number" && Number.isFinite(a.l.rank) ? a.l.rank : Infinity;
      const rb = typeof b.l.rank === "number" && Number.isFinite(b.l.rank) ? b.l.rank : Infinity;
      return ra === rb ? a.i - b.i : ra < rb ? -1 : 1;
    })
    .map(({ l }) => l);
  const ids = limbIds(spawned.map((l) => str(l.name)));
  const monsters = spawned.map((l, i) => toMonster(l, ids[i]));
  const exorcised = Math.max(0, findings.length - monsters.length);
  const unresolved = safeCount(creature?.counts?.unresolved);

  const limbs: Record<string, LimbRef> = {};
  for (const m of monsters) limbs[m.id] = m.ref;

  const summary =
    `Crypt: ${findings.length} findings, ${exorcised} exorcised, ${monsters.length} spawned` +
    (unresolved > 0 ? `, ${unresolved} unresolved` : "");
  const quiet =
    exorcised > 0 ? `${plural(exorcised, "lesser finding rests", "lesser findings rest")} below the spawn line.` : "";

  const out: string[] = [];
  out.push("! Generated by CRYPT raise. Do not edit; regenerate from creature.json.");
  out.push('Constant Story "The Crypt";');
  out.push(`Constant Headline "^A creature of ${plural(monsters.length, "limb", "limbs")}.^";`);
  out.push("");
  out.push('Include "Parser";');
  out.push('Include "VerbLib";');
  out.push("");
  out.push("[ Initialise;");
  out.push("    location = Crypt;");
  out.push(`    print "^${summary}.^";`);
  for (const m of monsters) {
    const state = m.possessed ? "possessed" : "rotting";
    const who = m.owner === "unowned" ? "no owner on record, name one in CODEOWNERS" : `owner ${ownerText(m)}`;
    out.push(`    print "${m.id}: ${state}, ${who}.^";`);
  }
  out.push("    rtrue;");
  out.push("];");
  out.push("");
  out.push("! The only code that prints markers. Data strings are plain game text.");
  out.push("Class Limb");
  out.push("  with parse_name [ i len wa;");
  out.push("           len = WordLength(wn);");
  out.push("           wa = WordAddress(wn);");
  out.push("           if (len ~= self.#limbcodes / 2) return 0;");
  out.push("           for (i = 0 : i < len : i++)");
  out.push("               if (wa->i ~= (self.&limbcodes)-->i) return 0;");
  out.push("           return 1;");
  out.push("       ],");
  out.push("       description [;");
  out.push('           print "[[CRYPT EXAMINE "; print (string) self.limbid; print "]]^";');
  out.push("           print (string) self.lore; print \"^\";");
  out.push("           rtrue;");
  out.push("       ],");
  out.push("  has static;");
  out.push("");
  out.push('Object Crypt "The Crypt"');
  out.push(
    `  with description "A cold stone vault. ${monsters.length > 0 ? "Something stitched lies on the slabs." : "The slabs are bare."}${quiet ? "^" + quiet : ""}",`,
  );
  out.push("  has light;");
  monsters.forEach((m, i) => {
    const codes = [...m.id].map((c) => c.toLowerCase().charCodeAt(0)).join(" ");
    out.push("");
    out.push(`Object limb_${i + 1} "${sanitize(`${m.ref.name} ${m.ref.version}`)}" Crypt`);
    out.push("  class Limb");
    out.push(`  with limbid "${m.id}",`);
    out.push(`       limbcodes ${codes},`);
    out.push(`       owner "${ownerText(m)}",`);
    out.push(`       lore "${lore(m)}";`);
  });
  out.push("");
  out.push("[ NoLimb;");
  out.push('    "Nothing here answers to that name. EXAMINE a limb from the list.";');
  out.push("];");
  out.push("");
  out.push("[ GraftSub;");
  out.push("    if (~~(noun ofclass Limb)) return NoLimb();");
  out.push('    print "[[CRYPT GRAFT "; print (string) noun.limbid; print "]]^";');
  out.push('    "The surgeon begins the graft.";');
  out.push("];");
  out.push("");
  out.push("[ AssignSub;");
  out.push("    if (~~(noun ofclass Limb)) return NoLimb();");
  out.push('    print "[[CRYPT ASSIGN "; print (string) noun.limbid; print "]]^";');
  out.push('    print "Owner: "; print (string) noun.owner; print "^";');
  out.push("    rtrue;");
  out.push("];");
  out.push("");
  out.push("[ SealSub;");
  out.push('    print "[[CRYPT SEAL]]^";');
  out.push('    "The crypt falls silent. Every needle rests.";');
  out.push("];");
  out.push("");
  out.push('Include "Grammar";');
  out.push("");
  out.push("Verb 'graft'");
  out.push("    * noun                      -> Graft;");
  out.push("");
  out.push("Verb 'assign'");
  out.push("    * noun                      -> Assign;");
  out.push("");
  out.push("Verb 'seal'");
  out.push("    * 'crypt'                   -> Seal;");
  out.push("");
  return { inf: out.join("\n"), limbs };
}
