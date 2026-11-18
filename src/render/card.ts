// Pure layout of the shareable card (D3): a 1200 by 627 draw-operation list for the creature card and the raid result card.
// Deterministic: no DOM, fs, clock, random or network. The browser paints the operations on a canvas (web/card/card.js).
// Blameless: the input passes through plateInput and clean, so owners, authors and "healed by" logins never enter the layout.
// The repo name is drawn only when includeRepo is true.

import { clean, creatureName, layoutPlate, plateInput, type PlateState } from "./plate.js";

export const CARD_WIDTH = 1200;
export const CARD_HEIGHT = 627;
export const SITE_URL = "https://e-1305.github.io/Crypt/";
export const LOGO_LINE = "Don't abandon your creature";
export const HASHTAG = "#KiroweenHackathon26";

export type CardVariant = "creature" | "raid";

export type Op =
  | { t: "rect"; x: number; y: number; w: number; h: number; fill?: string; stroke?: string; lineWidth?: number }
  | { t: "text"; x: number; y: number; size: number; bold: boolean; color: string; text: string };

export interface RaidStats {
  /** Team risk removed, already formatted, e.g. "3.42". */
  riskRemoved: string;
  limbsHealed: number;
  /** Raid time as mm:ss. */
  time: string;
  rank?: string;
}

export interface CardInput {
  variant: CardVariant;
  /** creature.json shaped data: only repo, team and limbs are read, through plateInput. */
  creature: unknown;
  includeRepo: boolean;
  raid?: RaidStats;
  /** Limbs healed this week. Defaults to the number of Healed limbs on the plate. */
  healedThisWeek?: number;
}

export interface CardCounts {
  findings: number;
  monsters: number;
  possessed: number;
  rotting: number;
  healed: number;
}

export interface CardLayout {
  width: number;
  height: number;
  name: string;
  counts: CardCounts;
  ops: Op[];
  /** Text alternative for the preview and the download. */
  alt: string;
  shareText: string;
  shareUrl: string;
}

const COLOR: Record<PlateState, string> = { Possessed: "#ff6a3d", Rotting: "#c8e63c", Healed: "#33ff33", Healthy: "#8c8366" };
const INK = "#d8c590";
const DIM = "#8c8366";
const AMBER = "#ffb000";
const BG = "#14110c";

// Plate geometry: the figure rows of layoutPlate, 80 columns at size 14 (advance 0.6 of the size).
const PLATE_X = 40;
const PLATE_Y = 92;
const PLATE_SIZE = 14;
const ROW_H = 17;
const FIGURE_FIRST_ROW = 6;
const FIGURE_ROWS = 22;
const ADVANCE = 0.6;
const COL_X = 740;

/** The toggle's starting value: ON for a public repo read through paste your repo, OFF for everything else. */
export function defaultIncludeRepo(source: "paste" | "raid" | string): boolean {
  return source === "paste";
}

export function linkedInShareUrl(site: string = SITE_URL): string {
  return `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(site)}`;
}

/** One short honest line. LinkedIn ignores a text parameter, so the page also copies and shows this text. */
export function shareText(variant: CardVariant, counts: CardCounts, raid?: RaidStats): string {
  if (variant === "raid" && raid) {
    return `Our team healed ${raid.limbsHealed} vulnerable ${raid.limbsHealed === 1 ? "limb" : "limbs"} of our dependency creature in ${raid.time} with CRYPT, a game made from real CVE data. ${SITE_URL} ${HASHTAG}`;
  }
  return `My dependencies are a creature: ${counts.findings} findings became ${counts.monsters} monsters. Met it with CRYPT, a game made from real CVE data. ${SITE_URL} ${HASHTAG}`;
}

function countsOf(limbs: Record<string, unknown>[]): CardCounts {
  const c: CardCounts = { findings: 0, monsters: 0, possessed: 0, rotting: 0, healed: 0 };
  for (const l of limbs) {
    const healed = l.state === "Healed" || l.healed === true;
    const possessed = !healed && l.state === "Possessed";
    const rotting = !healed && l.state === "Rotting";
    if (healed) c.healed++;
    if (possessed) c.possessed++;
    if (rotting) c.rotting++;
    if (healed || possessed || rotting) {
      c.findings++;
      if (l.spawned === true) c.monsters++;
    }
  }
  return c;
}

const ascii = (s: string): string => s.replace(/\u2014/g, "-");
const int = (n: unknown): number => (typeof n === "number" && Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0);

export function layoutCard(input: CardInput): CardLayout {
  const data = plateInput(input.creature);
  const repo = clean(data.repo, 40);
  const name = creatureName(repo || "the-crypt");
  const counts = countsOf(data.limbs);
  const week = input.healedThisWeek === undefined ? counts.healed : int(input.healedThisWeek);
  const raid: RaidStats | undefined =
    input.variant === "raid" && input.raid
      ? { riskRemoved: clean(input.raid.riskRemoved, 10) || "0.00", limbsHealed: int(input.raid.limbsHealed), time: clean(input.raid.time, 8) || "00:00", rank: clean(input.raid.rank, 20) }
      : undefined;
  const showRepo = input.includeRepo && repo !== "";

  const ops: Op[] = [];
  const text = (x: number, y: number, size: number, bold: boolean, color: string, t: string) => ops.push({ t: "text", x, y, size, bold, color, text: ascii(t) });
  ops.push({ t: "rect", x: 0, y: 0, w: CARD_WIDTH, h: CARD_HEIGHT, fill: BG });
  ops.push({ t: "rect", x: 10, y: 10, w: CARD_WIDTH - 20, h: CARD_HEIGHT - 20, stroke: "#5a4a2a", lineWidth: 4 });
  text(40, 30, 30, true, AMBER, "CRYPT");
  text(COL_X, 36, 20, false, DIM, input.variant === "raid" ? "RAID RESULT CARD" : "CREATURE CARD");

  // The anatomical plate: figure rows only. The header lines of the page plate carry the repo name, so they are left out.
  const lines = layoutPlate({ ...data, repo: repo || undefined }, { repo: repo || "the-crypt" }).slice(FIGURE_FIRST_ROW, FIGURE_FIRST_ROW + FIGURE_ROWS);
  lines.forEach((line, r) => {
    let col = 0;
    for (const seg of line.segments) {
      const t = ascii(seg.text);
      if (t.trim() !== "") {
        text(round1(PLATE_X + col * PLATE_SIZE * ADVANCE), PLATE_Y + r * ROW_H, PLATE_SIZE, seg.state === "Possessed", seg.state ? COLOR[seg.state] : DIM, t);
      }
      col += t.length;
    }
  });
  text(PLATE_X, PLATE_Y + FIGURE_ROWS * ROW_H + 12, 14, false, DIM, "# POSSESSED   % ROTTING   (clean lines) HEALED   . HEALTHY");

  // Right column.
  let y = 84;
  text(COL_X, y, 36, true, INK, name);
  y += 50;
  if (showRepo) {
    text(COL_X, y, 20, false, DIM, clean(repo, 28));
    y += 36;
  }
  text(COL_X, y, 26, true, COLOR.Possessed, `${counts.findings} findings -> ${counts.monsters} monsters`);
  y += 52;
  text(COL_X, y, 24, false, COLOR.Possessed, `# Possessed ${counts.possessed}`);
  y += 36;
  text(COL_X, y, 24, false, COLOR.Rotting, `% Rotting ${counts.rotting}`);
  y += 36;
  text(COL_X, y, 24, false, COLOR.Healed, `Healed this week ${week}`);
  y += 52;
  if (raid) {
    text(COL_X, y, 24, true, AMBER, `Team risk removed ${raid.riskRemoved}`);
    y += 36;
    text(COL_X, y, 24, false, AMBER, `Limbs healed ${raid.limbsHealed}`);
    y += 36;
    text(COL_X, y, 24, false, AMBER, `Raid time ${raid.time}${raid.rank ? `  ${raid.rank}` : ""}`);
  }

  // Footer.
  ops.push({ t: "rect", x: 40, y: 540, w: CARD_WIDTH - 80, h: 2, fill: "#5a4a2a" });
  text(40, 554, 30, true, AMBER, `CRYPT. ${LOGO_LINE}`);
  text(40, 594, 20, false, INK, SITE_URL);

  const alt =
    `CRYPT ${input.variant === "raid" ? "raid result" : "creature"} card. ${name}${showRepo ? `, from ${repo}` : ""}. ` +
    `${counts.findings} findings became ${counts.monsters} monsters. ${counts.possessed} possessed, ${counts.rotting} rotting, ${week} healed this week.` +
    (raid ? ` Team risk removed ${raid.riskRemoved}, ${raid.limbsHealed} limbs healed in ${raid.time}.` : "") +
    ` ${LOGO_LINE}. ${SITE_URL}`;

  return { width: CARD_WIDTH, height: CARD_HEIGHT, name, counts, ops, alt, shareText: shareText(input.variant, counts, raid), shareUrl: linkedInShareUrl() };
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
