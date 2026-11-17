// Pure, deterministic story prose for the generated game. No fs, clock, random or network.
// Fixed phrases below are plain ASCII with no Inform specials. The only dynamic text is the limb
// label, and it always passes through sanitize(). Rot is told about the limb, never about a person.
import { sanitize } from "./sanitize.js";

export type RotLevel = "Healthy" | "Rotting" | "Possessed";

export interface Personality {
  id: string;
  title: string;
  /** One line of voice, shown when the limb is examined. */
  voice: string;
}

/** FNV-1a, 32 bit, over UTF-16 code units. Same input gives the same hash everywhere. */
export function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

export const PERSONALITIES: readonly Personality[] = [
  { id: "elder", title: "grumpy elder", voice: "It mutters that things were sturdier in the old days." },
  { id: "intern", title: "nervous intern", voice: "It twitches and asks if it did the update right." },
  { id: "showoff", title: "show-off", voice: "It flexes and points out how many projects lean on it." },
  { id: "hoarder", title: "hoarder", voice: "It clutches a pile of transitive friends and will not share." },
  { id: "poet", title: "gloomy poet", voice: "It sighs a verse about semver and the passing of patch releases." },
  { id: "sprinter", title: "restless sprinter", voice: "It bounces on the slab and asks when the next release ships." },
  { id: "sage", title: "quiet sage", voice: "It watches you calmly, as if it has seen a thousand lockfiles." },
  { id: "joker", title: "gallows joker", voice: "It grins and says it has been a bit under the weather." },
];

export function personalityFor(ecosystem: string, name: string): Personality {
  return PERSONALITIES[fnv1a(`${ecosystem}:${name}`) % PERSONALITIES.length];
}

export interface LimbView {
  ecosystem: string;
  name: string;
  version: string;
  /** Top EPSS in 0..1, or null when unknown. */
  epss: number | null;
}

const HIGH_EPSS = 0.5;

/** Description text for one limb. Differs for each rot level, and gets a worse line for high EPSS. */
export function describeLimb(limb: LimbView, rot: RotLevel): string {
  const label = sanitize(`${limb.name} ${limb.version}`);
  const who = personalityFor(limb.ecosystem, limb.name);
  const lines: string[] = [];
  if (rot === "Possessed") {
    lines.push(`${label} is possessed. Attackers use it today (KEV list). It thrashes on the slab.`);
    lines.push("Its eyes glow a sickly green and the straps creak.");
  } else if (rot === "Rotting") {
    lines.push(`${label} is rotting. It weakens a little more each day.`);
    lines.push("Grey flesh flakes from its edges and the air smells of old cellars.");
  } else {
    lines.push(`${label} is healed. Its stitches hold and its colour is good.`);
    lines.push("It rests easy on the slab and hums a tune.");
  }
  if (rot !== "Healthy" && limb.epss !== null && limb.epss >= HIGH_EPSS) {
    lines.push("Its exploit odds are high, and the whole vault feels colder near it.");
  }
  lines.push(`It is a ${who.title}. ${who.voice}`);
  return lines.join("^");
}

/** Room text that follows the worst rot level among the spawned limbs. */
export function describeRoom(rots: readonly RotLevel[], quiet: string): string {
  let text: string;
  if (rots.length === 0) text = "A cold stone vault. The slabs are bare.";
  else if (rots.includes("Possessed")) {
    text = "A cold stone vault. Something stitched lies on the slabs and its straps strain. The torches burn green.";
  } else if (rots.includes("Rotting")) {
    text = "A cold stone vault. Something stitched lies on the slabs. A sour smell hangs in the damp air.";
  } else {
    text = "A cold stone vault. Something stitched lies on the slabs, calm and whole. The torches burn warm.";
  }
  return quiet ? `${text}^${quiet}` : text;
}

const EVENTS: readonly string[] = [
  "The lights flicker.",
  "A limb twitches.",
  "Somewhere a chain rattles.",
  "A drop of water lands on the slab.",
  "The torches gutter and recover.",
  "A distant bell tolls once.",
  "Something skitters behind the wall.",
  "The air turns cold for a moment.",
];

/** Atmosphere line for a seed and turn. Same seed and turn always give the same line. */
export function randomEvent(seed: number, turn: number): string {
  const n = Number.isFinite(seed) ? Math.trunc(seed) : 0;
  const t = Number.isFinite(turn) ? Math.trunc(turn) : 0;
  return EVENTS[fnv1a(`${n}:${t}`) % EVENTS.length];
}

export const EVENT_SLOTS = 8;

export const HELP_TEXT = [
  "Commands: EXAMINE <LIMB>, ASSIGN <LIMB>, GRAFT <LIMB>, SEAL CRYPT, RAID, HINT, HELP.",
  "A limb name is the package name in capitals, for example JQUERY.",
  "HINT names the limb to work on next. Other words may stir the crypt, so try a few.",
].join("^");

export const EGGS: ReadonlyArray<{ verb: string; text: string }> = [
  { verb: "xyzzy", text: "A hollow voice says: wrong cave. This one has dependencies." },
  { verb: "plugh", text: "Nothing happens, and the lockfile stays exactly as it was." },
  { verb: "hello", text: "The limbs turn their heads and murmur hello. One of them waves a loose thread." },
  { verb: "sing", text: "You hum a lullaby. The creature sways and the torches steady for a moment." },
  { verb: "scream", text: "The vault returns your scream three times, a little late each time." },
  { verb: "sleep", text: "You doze on a cold slab and dream of green builds. A limb nudges you awake." },
  { verb: "wait", text: "Time passes. The stitches creak and the creature breathes." },
];
