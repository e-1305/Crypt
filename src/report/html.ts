// Autopsy page: one self-contained printable HTML string. Every value is escaped. No script, no external request (one link to the vendor security review).
import type { AutopsyModel, HistoryPoint, LimbRef } from "./model.js";
import { durationText, type HistoryAggregate } from "./limb-history.js";
import { FOOTNOTES, PDF_HINT, SAMPLE_BANNER, SAMPLE_NOTE, SECURITY_REVIEW_PATH, SECURITY_REVIEW_URL, STYLE } from "./template.js";

export function esc(v: unknown): string {
  return String(v)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const NA = `<span class="n-a">n/a</span>`;
const orNa = (s: string | null): string => (s === null ? NA : esc(s));
const day = (ms: number): string => {
  const d = new Date(ms);
  return Number.isFinite(d.getTime()) ? d.toISOString().slice(0, 10) : "n/a";
};
const limbList = (xs: readonly LimbRef[]): string => (xs.length === 0 ? "none" : xs.map((x) => `${esc(x.id)} (${esc(x.name)})`).join(", "));

function hoursText(h: number | null): string | null {
  if (h === null) return null;
  return h >= 48 ? `${Math.round((h / 24) * 10) / 10} days` : `${h} hours`;
}

export function sparkline(points: readonly HistoryPoint[]): string {
  const open = points.map((p) => p.possessed + p.rotting);
  const w = 300;
  const h = 70;
  const pad = 8;
  const max = Math.max(1, ...open);
  const x = (i: number) => pad + (i * (w - 2 * pad)) / Math.max(1, open.length - 1);
  const y = (v: number) => h - pad - (v * (h - 2 * pad)) / max;
  const pts = open.map((v, i) => `${Math.round(x(i) * 10) / 10},${Math.round(y(v) * 10) / 10}`);
  const alt = `Open limbs after each of the last ${open.length} raids: ${open.join(", ")}.`;
  return (
    `<svg class="spark" viewBox="0 0 ${w} ${h}" role="img" aria-labelledby="spark-t spark-d">` +
    `<title id="spark-t">Open limbs trend</title><desc id="spark-d">${esc(alt)}</desc>` +
    `<line class="axis" x1="${pad}" y1="${h - pad}" x2="${w - pad}" y2="${h - pad}"/>` +
    `<polyline class="ln" points="${pts.join(" ")}"/>` +
    pts.map((p) => `<circle class="dot" cx="${p.split(",")[0]}" cy="${p.split(",")[1]}" r="3"/>`).join("") +
    `</svg>`
  );
}

const UNKNOWN = `<span class="n-a">unknown</span>`;

/** Open KEV limbs per run as a small SVG line. Needs at least one dated run. */
export function kevSparkline(runs: HistoryAggregate["runs"]): string {
  const vals = runs.map((r) => r.openKev);
  const w = 300;
  const h = 70;
  const pad = 8;
  const max = Math.max(1, ...vals);
  const x = (i: number) => pad + (i * (w - 2 * pad)) / Math.max(1, vals.length - 1);
  const y = (v: number) => h - pad - (v * (h - 2 * pad)) / max;
  const pts = vals.map((v, i) => [Math.round(x(i) * 10) / 10, Math.round(y(v) * 10) / 10] as const);
  const alt = `Open KEV limbs after each of ${vals.length} runs: ${vals.join(", ")}.`;
  return (
    `<svg class="spark" viewBox="0 0 ${w} ${h}" role="img" aria-labelledby="kev-t kev-d">` +
    `<title id="kev-t">Open KEV limbs over time</title><desc id="kev-d">${esc(alt)}</desc>` +
    `<line class="axis" x1="${pad}" y1="${h - pad}" x2="${w - pad}" y2="${h - pad}"/>` +
    `<polyline class="ln" points="${pts.map((p) => p.join(",")).join(" ")}"/>` +
    pts.map((p) => `<circle class="dot" cx="${p[0]}" cy="${p[1]}" r="3"/>`).join("") +
    `</svg>`
  );
}

/** The run history section: open KEV over time, age per limb, deadline breaches, mean time to heal. Null data reads "unknown". */
export function renderLimbHistoryHtml(a: HistoryAggregate | undefined): string {
  if (a === undefined || a.lineCount === 0) {
    return `<section class="card wide" aria-labelledby="h-hist"><h2 id="h-hist">Run history<sup>7</sup></h2>
<span class="big n-a">unknown</span><p class="detail">Run crypt autopsy after each raid to build the history in out/crypt-history.jsonl.</p></section>`;
  }
  const label = a.sources.length === 0 ? "unknown" : a.sources.join(" and ");
  const kev =
    a.runs.length === 0
      ? `<p class="detail">Open KEV limbs over time: ${UNKNOWN} (no run time recorded)</p>`
      : `${kevSparkline(a.runs)}<p class="detail">Open KEV limbs over time, ${esc(a.runs.length)} runs: ${esc(a.runs.map((r) => `${day(Date.parse(r.ts))} ${r.openKev}`).join(", "))}</p>`;
  const ages =
    a.ageByLimb.length === 0
      ? `<p class="detail">Age per limb: none open yet</p>`
      : `<ul>${a.ageByLimb.map((l) => `<li>${esc(l.limb)} ${esc(l.state.toLowerCase())}: ${l.hours === null ? UNKNOWN : esc(durationText(l.hours))}${l.state === "Landed" || l.landHours === null ? "" : ` (to land ${esc(durationText(l.landHours))})`}</li>`).join("")}</ul>`;
  const breaches =
    a.deadlineBreaches.length === 0
      ? `<p class="detail">Deadline breaches: none among ${esc(a.limbsWithDeadline)} limbs with a known deadline</p>`
      : `<p class="detail">Deadline breaches: ${a.deadlineBreaches.map((b) => `${esc(b.limb)} (${b.kind === "open" ? "open past" : "healed after"} ${esc(day(Date.parse(b.deadline)))})`).join(", ")}</p>`;
  const mean =
    a.meanTimeToHealHours === null
      ? UNKNOWN
      : `${esc(durationText(a.meanTimeToHealHours))}`;
  return `<section class="card wide" aria-labelledby="h-hist"><h2 id="h-hist">Run history<sup>7</sup></h2>
<p class="detail">Source: ${esc(label)}. ${esc(a.lineCount)} lines.</p>
${kev}
<h2>Age per limb</h2>
${ages}
${breaches}
<p class="detail">Mean time to heal: <span class="big">${mean}</span> (${esc(a.healTimesKnown)} of ${esc(a.healedLimbs)} healed limbs have a known heal time)</p>
<p class="detail">Mean time to land (fix landed, not healed): ${esc(durationText(a.meanTimeToLandHours))} (${esc(a.landTimesKnown)} limbs)</p>
<p class="detail">Age counts from the first history line, which is not always detection (in the crypt-demo seed it is the fix PR opening).${a.kevLines === 0 ? " This history holds no known KEV limb, so the KEV trend is flat for lack of data, not because none were open." : ""}</p></section>`;
}

export function renderAutopsyHtml(m: AutopsyModel): string {
  const impl = m.implementation;
  const eff = m.efficiency;
  const imp = m.impact;
  const sla = m.sla;
  const trend = m.trend;
  const noise = m.noise;
  const trendBody = trend.enough
    ? `${sparkline(trend.points)}<p class="detail">Open limbs, ${esc(day(trend.points[0]!.at))} to ${esc(day(trend.points[trend.points.length - 1]!.at))}: ${esc(
        trend.points.map((p) => p.possessed + p.rotting).join(", "),
      )}</p>`
    : `<span class="big n-a">${esc(trend.message)}</span><p class="detail">Run more raids to draw the trend.</p>`;
  const praise =
    m.praise.length === 0
      ? `<p class="detail">No landed fixes recorded yet.</p>`
      : `<ul>${m.praise.map((p) => `<li>${esc(p.id)} (${esc(p.name)}) healed by @${esc(p.healedBy)}</li>`).join("")}</ul>`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>CRYPT Autopsy Report${m.sample ? " (sample)" : ""}${m.repo ? ` - ${esc(m.repo)}` : ""}</title>
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:">
<style>${STYLE}</style>
</head>
<body>
${m.sample ? `<div class="wm" aria-hidden="true"><span>${esc(SAMPLE_BANNER)}</span></div>\n` : ""}<div class="page">
<header>
<h1>CRYPT Autopsy Report</h1>
<p class="sub">${m.repo ? `${esc(m.repo)}, ` : ""}${esc(m.findings)} findings, generated ${esc(day(m.generatedAt))}</p>
${m.sample ? `<p class="banner" role="note">${esc(SAMPLE_BANNER)}<span>${esc(SAMPLE_NOTE)}</span></p>\n` : ""}<p class="hint no-print">${esc(PDF_HINT)}</p>
</header>
<main>
<div class="grid">
<section class="card" aria-labelledby="h-impl"><h2 id="h-impl">Implementation<sup>1</sup></h2>
<span class="big">${orNa(impl.pct === null ? null : `${impl.pct}%`)}</span>
<p class="detail">${esc(impl.owned)} of ${esc(impl.total)} finding limbs have an owner</p></section>
<section class="card" aria-labelledby="h-eff"><h2 id="h-eff">Efficiency<sup>2</sup></h2>
<span class="big">${orNa(hoursText(eff.medianHours))}</span>
<p class="detail">median time to fix, ${esc(eff.healed)} healed</p></section>
<section class="card" aria-labelledby="h-imp"><h2 id="h-imp">Impact<sup>3</sup></h2>
<span class="big">${orNa(imp.epssRemoved === null ? null : imp.epssRemoved.toFixed(2))}</span>
<p class="detail">exploitable risk removed (EPSS sum, ${esc(imp.limbs)} limbs)</p></section>
<section class="card" aria-labelledby="h-sla"><h2 id="h-sla">SLA compliance<sup>4</sup></h2>
<span class="big">${orNa(sla.pct === null ? null : `${sla.pct}%`)}</span>
<p class="detail">${esc(sla.met)} of ${esc(sla.inScope)} in-scope limbs inside the window</p></section>
<section class="card" aria-labelledby="h-noise"><h2 id="h-noise">Noise exorcised<sup>6</sup></h2>
<span class="big">${orNa(noise.pct === null ? null : `${noise.pct}%`)}</span>
<p class="detail">${noise.exorcised === null || noise.findings === null ? "no counts in creature.json" : `${esc(noise.exorcised)} of ${esc(noise.findings)} findings below the noise line`}</p></section>
<section class="card" aria-labelledby="h-praise"><h2 id="h-praise">Praise</h2>
${praise}</section>
<section class="card wide" aria-labelledby="h-trend"><h2 id="h-trend">Trend<sup>5</sup></h2>
${trendBody}</section>
${renderLimbHistoryHtml(m.limbHistory)}
<section class="card wide" aria-labelledby="h-act"><h2 id="h-act">Limbs to act on</h2>
<p class="detail">Breached: ${limbList(sla.breached)}</p>
<p class="detail">At risk (75% of the window used): ${limbList(sla.atRisk)}</p></section>
</div>
</main>
<footer>
<h2>How computed</h2>
<ol>
<li>${esc(FOOTNOTES.implementation)}</li>
<li>${esc(FOOTNOTES.efficiency)}</li>
<li>${esc(FOOTNOTES.impact)}</li>
<li>${esc(FOOTNOTES.sla)}</li>
<li>${esc(FOOTNOTES.trend)}</li>
<li>${esc(FOOTNOTES.noise)}</li>
<li>${esc(FOOTNOTES.history)}</li>
</ol>
<p class="detail">Vendor security review: <a href="${SECURITY_REVIEW_URL}">${SECURITY_REVIEW_PATH}</a></p>
</footer>
</div>
</body>
</html>
`;
}
