// /for-teams.html: live ROI estimate. The formula lives in js/web/roi.js (compiled from src/web/roi.ts). No network.
import { estimateRoi, ROI_DEFAULTS } from "./js/web/roi.js";

const $ = (id) => document.getElementById(id);
const read = (id, fallback) => { const v = Number($(id).value); return $(id).value.trim() === "" || !Number.isFinite(v) ? fallback : v; };

function render() {
  const r = estimateRoi({
    repos: read("roi-repos", 0),
    findingsPerRepo: read("roi-findings", 0),
    noiseShare: read("roi-noise", 0) / 100,
    triageMinutes: read("roi-minutes", 0),
  });
  const n = (v) => Math.round(v).toLocaleString("en-US");
  $("roi-result").textContent = `ESTIMATE: ${n(r.findings)} findings, ${n(r.filtered)} filtered as noise, about ${n(r.hoursSaved)} hours saved per month.`;
}

$("roi-repos").value = String(ROI_DEFAULTS.repos);
$("roi-findings").value = String(ROI_DEFAULTS.findingsPerRepo);
$("roi-noise").value = String(ROI_DEFAULTS.noiseShare * 100);
$("roi-minutes").value = String(ROI_DEFAULTS.triageMinutes);
for (const id of ["roi-repos", "roi-findings", "roi-noise", "roi-minutes"]) $(id).addEventListener("input", render);
render();
