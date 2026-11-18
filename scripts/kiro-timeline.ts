/**
 * Timeline image for docs/KIRO.md, drawn from git history so no date is typed by hand.
 *
 *   tsx scripts/kiro-timeline.ts          write docs/img/kiro-timeline.svg
 *   tsx scripts/kiro-timeline.ts --write  same
 *   tsx scripts/kiro-timeline.ts --check  exit 1 when the file is stale
 *
 * One Gantt row per spec: first to last commit (hour precision, UTC) that touches .kiro/specs/<name>/. PR merges are ticks at
 * the time of a landing commit named by prNumbers. The axis ends at the latest git timestamp (HEAD), not the wall clock,
 * so a second run changes nothing.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { prNumbers } from "./kiro-stats.js";

export const OUT = join("docs", "img", "kiro-timeline.svg");

export type Run = (args: string[]) => string | null;

export const gitRunner = (root: string): Run => (args) => {
  try {
    return execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  } catch {
    return null;
  }
};

export interface Spec { name: string; first: string; last: string }
export interface Merge { pr: number; at: string }
export interface Timeline { start: string; end: string; days: number; hours: number; specs: Spec[]; merges: Merge[] }

/** Normalise any git ISO timestamp to UTC, second precision: YYYY-MM-DDTHH:MM:SSZ. */
export const utc = (iso: string): string => new Date(iso).toISOString().replace(/\.\d+Z$/, "Z");
const ms = (iso: string): number => Date.parse(iso);

/** First and last commit time of each spec directory (UTC). A spec with no commit yet is left out. */
export function specDates(root: string, run: Run = gitRunner(root)): Spec[] {
  const dir = join(root, ".kiro", "specs");
  if (!existsSync(dir)) return [];
  const out: Spec[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (!e.isDirectory()) continue;
    const log = run(["log", "--format=%aI", "--", `.kiro/specs/${e.name}`]);
    const times = (log ?? "").split("\n").filter(Boolean).map(utc).sort();
    if (times[0]) out.push({ name: e.name, first: times[0], last: times[times.length - 1]! });
  }
  return out.sort((a, b) => a.first.localeCompare(b.first) || a.name.localeCompare(b.name));
}

/** Landing commits as "ISO time TAB subject" lines, to PR number and time (first line seen for a number wins). */
export function landingDates(lines: string[]): Merge[] {
  const seen = new Map<number, string>();
  for (const line of lines) {
    const [at, ...rest] = line.split("\t");
    for (const pr of prNumbers([rest.join("\t")])) if (at && !seen.has(pr)) seen.set(pr, utc(at));
  }
  return [...seen].map(([pr, at]) => ({ pr, at })).sort((a, b) => a.pr - b.pr);
}

export const dayNumber = (iso: string): number => Math.round(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 86400000);
export const isoOf = (day: number): string => new Date(day * 86400000).toISOString().slice(0, 10);

export function buildTimeline(root: string, run: Run = gitRunner(root)): Timeline | null {
  const specs = specDates(root, run);
  const head = (run(["log", "-1", "--format=%aI"]) ?? "").trim();
  if (!specs.length || !head) return null;
  const merges = landingDates((run(["log", "--format=%aI%x09%s"]) ?? "").split("\n"));
  const start = specs[0]!.first;
  const headUtc = utc(head);
  const lastSpec = specs.reduce((m, s) => (s.last > m ? s.last : m), start);
  const end = [headUtc, lastSpec, ...merges.map((m) => m.at)].reduce((m, t) => (t > m ? t : m), start);
  return { start, end, days: dayNumber(end) - dayNumber(start) + 1, hours: Math.round((ms(end) - ms(start)) / 3600000), specs, merges };
}

export const esc = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");

const STEPS = [1, 2, 3, 6, 12, 24, 48, 72, 168, 336, 720];

export function renderTimeline(t: Timeline): string {
  const W = 1000, R = 960, ROW = 24, TOP = 64, CH = 8;
  const L = Math.min(300, Math.max(120, Math.max(...t.specs.map((s) => s.name.length)) * CH + 24));
  const t0 = ms(t.start), span = Math.max(3600000, ms(t.end) - t0);
  const xOf = (iso: string): number => Math.round(L + ((ms(iso) - t0) / span) * (R - L));
  const prY = TOP + ROW / 2;
  const rows0 = TOP + ROW;
  const axisY = rows0 + t.specs.length * ROW + 6;
  const H = axisY + 62;
  const title = `Kiro timeline: ${t.specs.length} specs and ${t.merges.length} merged PRs in ${t.days} days (${t.hours} hours), ${t.start} to ${t.end}`;
  const o: string[] = [];
  o.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-labelledby="t d">`);
  o.push(`  <title id="t">${esc(title)}</title>`);
  o.push(`  <desc id="d">Gantt chart with one row per .kiro/specs folder, drawn from its first commit to its last commit on an hour axis (UTC). Green ticks in the top row are pull requests merged, placed at the hour of the landing commit. Generated by npm run kiro:timeline from git log.</desc>`);
  o.push(`  <style>
    .bg { fill: #ffffff; } .ax { stroke: #334155; stroke-width: 2; } .grid { stroke: #cbd5e1; stroke-width: 1; }
    .tx { fill: #0f172a; font-family: system-ui, -apple-system, "Segoe UI", sans-serif; font-size: 14px; }
    .h { font-weight: bold; font-size: 16px; } .sm { font-size: 13px; } .bar { fill: #1d4ed8; } .pr { stroke: #047857; stroke-width: 3; }
    @media (prefers-color-scheme: dark) {
      .bg { fill: #0b1220; } .ax { stroke: #cbd5e1; } .grid { stroke: #334155; } .tx { fill: #f1f5f9; } .bar { fill: #60a5fa; } .pr { stroke: #34d399; }
    }
  </style>`);
  o.push(`  <rect class="bg" x="0" y="0" width="${W}" height="${H}"/>`);
  o.push(`  <text class="tx h" x="20" y="28">${esc(`${t.days} days (${t.hours} hours), ${t.specs.length} specs, ${t.merges.length} merged PRs`)}</text>`);
  const step = STEPS.find((s) => span / 3600000 / s <= 7) ?? STEPS[STEPS.length - 1]!;
  const sms = step * 3600000;
  for (let tick = Math.ceil(t0 / sms) * sms; tick <= t0 + span; tick += sms) {
    const x = xOf(new Date(tick).toISOString());
    const iso = new Date(tick).toISOString();
    o.push(`  <line class="grid" x1="${x}" y1="${TOP}" x2="${x}" y2="${axisY}"/>`);
    o.push(`  <text class="tx sm" x="${x}" y="${axisY + 20}" text-anchor="middle">${esc(iso.slice(5, 10))}</text>`);
    o.push(`  <text class="tx sm" x="${x}" y="${axisY + 36}" text-anchor="middle">${esc(iso.slice(11, 13))}:00</text>`);
  }
  o.push(`  <line class="ax" x1="${L}" y1="${axisY}" x2="${R}" y2="${axisY}"/>`);
  o.push(`  <text class="tx sm" x="${L - 8}" y="${prY + 4}" text-anchor="end">merged PRs</text>`);
  for (const m of t.merges) {
    const x = xOf(m.at);
    o.push(`  <line class="pr" x1="${x}" y1="${prY - 8}" x2="${x}" y2="${prY + 8}"/>`);
  }
  t.specs.forEach((s, i) => {
    const y = rows0 + i * ROW, x1 = xOf(s.first), x2 = Math.max(xOf(s.last), x1 + 6);
    o.push(`  <text class="tx sm" x="${L - 8}" y="${y + 16}" text-anchor="end">${esc(s.name)}</text>`);
    o.push(`  <rect class="bar" x="${x1}" y="${y + 5}" width="${x2 - x1}" height="14" rx="3"/>`);
  });
  o.push(`  <text class="tx sm" x="20" y="${H - 8}">Blue bar: first to last commit of a spec. Green tick: PR merged. Hours are UTC.</text>`);
  o.push(`</svg>`);
  return o.join("\n") + "\n";
}

function main(argv: string[]): number {
  const root = resolve(import.meta.dirname, "..");
  const t = buildTimeline(root);
  if (!t) {
    console.error("kiro-timeline: no spec history in git log, cannot draw (is the clone shallow?)");
    return 1;
  }
  const svg = renderTimeline(t);
  const file = join(root, OUT);
  if (argv.includes("--check")) {
    const same = existsSync(file) && readFileSync(file, "utf8") === svg;
    console.log(same ? "kiro-timeline: up to date" : `kiro-timeline: ${OUT} is stale, run npm run kiro:timeline`);
    return same ? 0 : 1;
  }
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, svg);
  console.log(`kiro-timeline: wrote ${OUT} (${t.days} days, ${t.hours} hours, ${t.specs.length} specs, ${t.merges.length} PRs)`);
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === import.meta.filename) process.exit(main(process.argv.slice(2)));
