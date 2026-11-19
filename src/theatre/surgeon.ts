// Pure model for the surgeon's theatre (issue #217): jars on a shelf, tools on a tray, one narrator line per step.
// The browser glue (web/theatre/surgeon.js) only reads the DOM and draws. Nothing here sends or merges anything.
import { parseCommand } from "../bridge/grammar.js";

export type ToolId = "scalpel" | "needle" | "magnifier" | "lamp" | "bell";

export interface Tool {
  id: ToolId;
  /** Plain name of the tool. */
  name: string;
  /** The text command that stays the real way to act. Shown on the tool's label plate. */
  command: string;
}

/** Tray order, left to right. */
export const TOOLS: readonly Tool[] = [
  { id: "scalpel", name: "Scalpel", command: "EXAMINE <LIMB>" },
  { id: "needle", name: "Needle", command: "GRAFT <LIMB>" },
  { id: "magnifier", name: "Magnifier", command: "Simulate CI" },
  { id: "lamp", name: "Lamp", command: "SEAL CRYPT" },
  { id: "bell", name: "Bell", command: "Reraise" },
];

/** Tool lifted by a typed command. Strict grammar only: anything else lifts nothing. ASSIGN has no tool. */
export function toolForCommand(text: unknown): ToolId | null {
  const p = parseCommand(text);
  if (!p.ok) return null;
  switch (p.verb) {
    case "EXAMINE":
    case "RAID":
      return "scalpel";
    case "GRAFT":
      return "needle";
    case "SEAL":
      return "lamp";
    default:
      return null;
  }
}

export type Step = "scan" | "examine" | "graft" | "ci-green" | "ci-red" | "reraise" | "seal" | "jar";

/** One plain sentence per step. States what happens, labels DRY RUN and SIMULATED, never claims a merge. */
export function narratorLine(step: Step, subject = ""): string {
  const s = cleanLabel(subject, 40);
  switch (step) {
    case "scan": return "The jar is on the table and the creature is being examined.";
    case "examine": return s ? "The scalpel examines " + s + "." : "The scalpel examines the limb.";
    case "graft": return s ? "DRY RUN: the needle prepares a graft for " + s + ". Nothing is sent." : "DRY RUN: the needle prepares a graft. Nothing is sent.";
    case "ci-green": return "SIMULATED: the magnifier checks the graft and CI is green.";
    case "ci-red": return "SIMULATED: the magnifier checks the graft and CI is red, so the limb stays as it was.";
    case "reraise": return "SIMULATED: the bell rings and the creature is raised again with the healed limb.";
    case "seal": return "The lamp is lit and the crypt is sealed. Every agent action stops.";
    case "jar": return s ? "A new jar for " + s + " is on the shelf." : "A new jar is on the shelf.";
  }
}

export const MAX_JARS = 6;
export const MAX_LABEL = 28;

export interface Jar {
  repo: string;
  place: "shelf" | "table";
}

/** owner/repo only: keeps letters, digits, dot, dash, underscore and one slash, bounded in length. */
export function cleanLabel(raw: unknown, max = MAX_LABEL): string {
  if (typeof raw !== "string") return "";
  const s = raw.replace(/[^A-Za-z0-9._\-/ ]/g, "").trim();
  return s.length > max ? s.slice(0, max - 1) + "~" : s;
}

/** Add a jar for a pasted repo. A duplicate or an empty label changes nothing. The shelf holds MAX_JARS, the oldest unused jar makes room. */
export function addJar(jars: readonly Jar[], repo: unknown): Jar[] {
  const label = cleanLabel(repo);
  if (!/^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/.test(label)) return [...jars];
  if (jars.some((j) => j.repo.toLowerCase() === label.toLowerCase())) return [...jars];
  const next = [...jars, { repo: label, place: "shelf" as const }];
  while (next.length > MAX_JARS) {
    const i = next.findIndex((j) => j.place === "shelf" && j.repo !== label);
    next.splice(i < 0 ? 0 : i, 1);
  }
  return next;
}

/** Scan: the named jar goes to the table and every other jar returns to the shelf. An unknown repo changes nothing. */
export function takeDown(jars: readonly Jar[], repo: unknown): Jar[] {
  const label = cleanLabel(repo);
  if (!jars.some((j) => j.repo.toLowerCase() === label.toLowerCase())) return [...jars];
  return jars.map((j) => ({ repo: j.repo, place: j.repo.toLowerCase() === label.toLowerCase() ? "table" : "shelf" }));
}
