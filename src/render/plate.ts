// Pure renderer: creature.json data -> anatomical-plate ASCII. Deterministic, no fs, clock, random or network.
// Every data string is cleaned to printable ASCII. Owners are never shown: rot belongs to the limb.

export type PlateState = "Possessed" | "Rotting" | "Healed" | "Healthy";

export interface PlateSegment {
  text: string;
  state?: PlateState;
  /** Stable limb key `ecosystem:name`, used by the web page to animate one limb. */
  limb?: string;
}
export interface PlateLine {
  segments: PlateSegment[];
}
export interface PlateOptions {
  repo?: string;
}

export const MAX_COLS = 80;
const FIG_COL = 27;
const RIGHT_LABEL_COL = 56;
const LABEL_MAX = 24;
const OVERFLOW_MAX = 8;
const STITCH_MAX = 40;

const MARK: Record<PlateState, string> = { Possessed: "#", Rotting: "%", Healed: " ", Healthy: "." };

// Slot letters: H head, T chest, A left arm, B right arm, V belly, C left leg, D right leg, E left foot, F right foot.
const FIGURE = [
  "         .-----.          ",
  "        / HHHHH \\         ",
  "        | HHHHH |         ",
  "        \\ HHHHH /         ",
  "         `-. .-'          ",
  "   .------' '------.      ",
  "  / AAAA |TTTTT| BBBB \\   ",
  " |  AAAA |TTTTT| BBBB  |  ",
  " |  AAAA |TTTTT| BBBB  |  ",
  "  \\_AAAA_|TTTTT|_BBBB_/   ",
  "         |TTTTT|          ",
  "         |-----|          ",
  "         |VVVVV|          ",
  "         |VVVVV|          ",
  "         `-+-+-'          ",
  "         |CC|DD|          ",
  "         |CC|DD|          ",
  "         |CC|DD|          ",
  "         |CC|DD|          ",
  "         |EE|FF|          ",
  "        _|EE|FF|_         ",
  "       (___)  (___)       ",
];
const SLOTS = ["H", "T", "A", "B", "V", "C", "D", "E", "F"];
// Row of the figure where each slot's leader line attaches. Chosen so no leader crosses another body part.
const ANCHOR_ROW: Record<string, number> = { H: 2, T: 10, A: 8, B: 8, V: 12, C: 16, D: 16, E: 19, F: 19 };
const LEFT_SIDE = new Set(["A", "C", "E"]);

const FIRST = ["Wretch", "Mourn", "Gaunt", "Hollow", "Pallor", "Cinder", "Sorrow", "Thorn", "Ashen", "Lament", "Marrow", "Vesper"];

function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** Printable ASCII only, no brackets, bounded length. */
export function clean(input: unknown, max = 60): string {
  const s = typeof input === "string" ? input : "";
  let out = "";
  for (const ch of s) {
    const c = ch.codePointAt(0) as number;
    if (c < 32 || c === 127) continue;
    out += c > 126 ? "?" : ch;
  }
  out = out.trim();
  return out.length > max ? out.slice(0, max - 3).trimEnd() + "..." : out;
}

/** Same repo name, same creature name, e.g. "Wretch-7". */
export function creatureName(repo: string): string {
  const h = fnv1a(clean(repo, 200));
  return `${FIRST[h % FIRST.length]}-${((h >>> 8) % 99) + 1}`;
}

interface Item {
  key: string;
  name: string;
  version: string;
  state: PlateState;
  spawned: boolean;
}

function stateOf(l: Record<string, unknown>): PlateState {
  if (l.state === "Healed" || l.healed === true) return "Healed";
  if (l.state === "Possessed") return "Possessed";
  if (l.state === "Rotting") return "Rotting";
  return "Healthy";
}

function items(creature: unknown): Item[] {
  const raw = (creature as { limbs?: unknown } | null)?.limbs;
  const list = Array.isArray(raw) ? raw : [];
  const out: { it: Item; rank: number; i: number }[] = [];
  list.forEach((x, i) => {
    if (!x || typeof x !== "object") return;
    const l = x as Record<string, unknown>;
    const state = stateOf(l);
    const rank = typeof l.rank === "number" && Number.isFinite(l.rank) ? l.rank : Infinity;
    const name = clean(l.name, 40) || "unnamed";
    out.push({
      it: {
        key: `${clean(l.ecosystem, 12)}:${name}`,
        name,
        version: clean(l.version, 12) || "unknown",
        state,
        spawned: l.spawned === true,
      },
      rank,
      i,
    });
  });
  out.sort((a, b) => (a.rank === b.rank ? a.i - b.i : a.rank < b.rank ? -1 : 1));
  return out.map((o) => o.it);
}

function label(it: Item): string {
  const tail = ` \u2014 ${it.state.toUpperCase()}`;
  const ver = it.version.length > 10 ? it.version.slice(0, 9) + "~" : it.version;
  const room = LABEL_MAX - tail.length - ver.length - 1;
  const name = it.name.length > room ? it.name.slice(0, room - 1) + "~" : it.name;
  return `${name} ${ver}${tail}`;
}

function fit(text: string): string {
  return text.length > MAX_COLS ? text.slice(0, MAX_COLS) : text;
}

const plain = (text: string): PlateLine => ({ segments: [{ text: fit(text) }] });

export function layoutPlate(creature: unknown, options: PlateOptions = {}): PlateLine[] {
  const repoRaw = options.repo ?? (creature as { repo?: unknown } | null)?.repo;
  const repo = clean(repoRaw, 30) || "the-crypt";
  const all = items(creature);
  const figureItems = [...all.filter((i) => i.spawned && i.state !== "Healed"), ...all.filter((i) => i.state === "Healed")];
  const placed = figureItems.slice(0, SLOTS.length);
  const overflow = figureItems.slice(SLOTS.length);
  const bySlot = new Map<string, Item>();
  placed.forEach((it, i) => bySlot.set(SLOTS[i]!, it));

  const lines: PlateLine[] = [];
  const rule = "=".repeat(MAX_COLS);
  lines.push(plain(rule));
  lines.push(plain(`PLATE I. \u2014 THE CREATURE OF ${repo}`));
  lines.push(plain(`The Creature of ${repo}, called ${creatureName(repo)}`));
  lines.push(plain("Fig. 1. Corpus ex dependentiis consutum."));
  lines.push(plain(rule));
  lines.push(plain(""));

  const anchor = new Map(Object.entries(ANCHOR_ROW));

  FIGURE.forEach((row, r) => {
    const cells = [...row.padEnd(26)].map((ch) => {
      const it = bySlot.get(ch);
      if (SLOTS.includes(ch)) return { ch: it ? MARK[it.state] : ".", it, slot: ch };
      return { ch, it: undefined, slot: "" };
    });
    // Slot with no limb stays faint stitches; mark as Healthy so the page can dim it.
    const segs: PlateSegment[] = [];
    const push = (text: string, state?: PlateState, limb?: string) => {
      if (text === "") return;
      const last = segs[segs.length - 1];
      if (last && last.state === state && last.limb === limb) last.text += text;
      else segs.push({ text, state, limb });
    };
    const first = cells.findIndex((c) => c.ch !== " ");
    let last = -1;
    cells.forEach((c, i) => {
      if (c.ch !== " ") last = i;
    });
    const leftSlot = SLOTS.find((s) => LEFT_SIDE.has(s) && anchor.get(s) === r && bySlot.has(s));
    const rightSlot = SLOTS.find((s) => !LEFT_SIDE.has(s) && anchor.get(s) === r && bySlot.has(s));
    if (leftSlot) {
      const it = bySlot.get(leftSlot)!;
      const text = label(it);
      push(text, it.state, it.key);
      const dashes = FIG_COL + first - 1 - text.length - 1;
      push(" " + "-".repeat(Math.max(0, dashes)) + ">");
    } else {
      push(" ".repeat(FIG_COL + first));
    }
    for (let i = first; i <= last; i++) {
      const c = cells[i]!;
      if (c.slot) push(c.ch, c.it ? c.it.state : "Healthy", c.it?.key);
      else push(c.ch);
    }
    if (rightSlot) {
      const it = bySlot.get(rightSlot)!;
      const end = FIG_COL + last + 1;
      push("<" + "-".repeat(Math.max(0, RIGHT_LABEL_COL - 1 - end - 1)) + " ");
      push(label(it), it.state, it.key);
    }
    lines.push({ segments: segs });
  });

  lines.push(plain(""));
  if (overflow.length > 0) {
    lines.push(plain("ALSO ON THE SLAB:"));
    for (const it of overflow.slice(0, OVERFLOW_MAX)) {
      lines.push({
        segments: [
          { text: "  " },
          { text: `${MARK[it.state].trim() || "~"} ${label(it)}`, state: it.state, limb: it.key },
        ],
      });
    }
    if (overflow.length > OVERFLOW_MAX) lines.push(plain(`  ... and ${overflow.length - OVERFLOW_MAX} more`));
    lines.push(plain(""));
  }

  const stitched = all.filter((i) => !figureItems.includes(i));
  const stitches = Array.from({ length: Math.min(stitched.length, STITCH_MAX) }, () => ".").join(" ");
  lines.push(plain(`STITCHES: ${stitches === "" ? "none" : stitches}${stitched.length > STITCH_MAX ? " ..." : ""}`));
  lines.push(plain("# POSSESSED   % ROTTING   (clean lines) HEALED   . HEALTHY"));
  lines.push(plain(rule));
  const n = (s: PlateState) => all.filter((i) => i.state === s).length;
  lines.push(
    plain(`LIMBS ${all.length}  POSSESSED ${n("Possessed")}  ROTTING ${n("Rotting")}  HEALED ${n("Healed")}  HEALTHY ${n("Healthy")}`),
  );
  lines.push(plain(rule));
  return lines;
}

export function plateText(lines: PlateLine[]): string {
  return lines.map((l) => l.segments.map((s) => s.text).join("")).join("\n");
}

export function renderPlate(creature: unknown, options: PlateOptions = {}): string {
  return plateText(layoutPlate(creature, options)) + "\n";
}

/** One sentence per limb for screen readers: name, version, state. */
export function plateSummary(creature: unknown): string[] {
  return items(creature)
    .filter((i) => i.spawned || i.state === "Healed")
    .map((i) => `${i.name} ${i.version}: ${i.state}`);
}
