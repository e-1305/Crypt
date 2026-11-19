// Static pieces of the autopsy page: styles and "How computed" notes.

export const PDF_HINT = "Print or save as PDF from your browser";

export const SECURITY_REVIEW_PATH = "docs/SECURITY-REVIEW.md";
export const SECURITY_REVIEW_URL = "https://github.com/e-1305/Crypt/blob/main/docs/SECURITY-REVIEW.md";

export const FOOTNOTES = {
  implementation:
    "Implementation (NIST SP 800-55 measure): finding limbs with a CODEOWNERS owner, divided by all finding limbs (not Healthy, or healed). Owners are counted, not listed.",
  efficiency:
    "Efficiency (NIST SP 800-55 measure): median hours from the finding (limb foundAt, else the scan start) to the fix (the landing time in out/state.json, else updatedAt), over healed limbs.",
  impact:
    "Impact (NIST SP 800-55 measure): sum of EPSS over healed limbs that were in CISA KEV or had EPSS of 0.1 or more. It reads as exploitable risk removed.",
  sla: "SLA compliance: in-scope limbs are Possessed (48 hours) and EPSS of 0.1 or more (14-day sprint), counted from the team scan start, or from a limb's own found time when the creature records one. A limb counts when it was healed inside its window or is still open inside it. At risk means 75% of the window is used.",
  trend: "Trend: open limbs (possessed plus rotting) after each of the last raids, read from the history that crypt autopsy and crypt gazette keep in out/autopsy-history.json (one entry per day they run), plus any history in out/state.json.",
  noise: "Noise exorcised: findings below the noise line (counts.exorcised) divided by all findings (counts.findings).",
  history:
    "Run history: one line per limb per run in out/crypt-history.jsonl (time, limb, state, KEV, EPSS, owner team, deadline). Age runs from the first history line (not always detection) to now, or to the time of a Healed line. A deadline is the SLA window of the policy (48 hours for KEV, 14 days for EPSS of 0.1 or more) counted from the limb's found time when the creature has one, else from the first history line. Mean time to heal uses only Healed lines that carry their own time. Landing time is shown apart as time to land. A value the history does not hold reads unknown. Each line carries a source label: real or sample.",
} as const;

export const SAMPLE_BANNER = "SAMPLE DATA";
export const SAMPLE_NOTE = "Made-up numbers from crypt autopsy --sample. This is not a real team's history.";

export const STYLE = `
:root{--fg:#33ff33;--dim:#22b022;--bg:#050805;--warn:#ffb000;--hot:#ff6a3d;--line:#22b022;--text:#c9f7c9}
*{box-sizing:border-box}
html,body{margin:0;background:var(--bg);color:var(--text);font-family:"JetBrains Mono",ui-monospace,"Cascadia Mono",Menlo,Consolas,"DejaVu Sans Mono","Courier New",monospace;font-size:14px;line-height:1.4}
.page{max-width:210mm;margin:0 auto;padding:12mm 10mm}
h1,h2{margin:0;letter-spacing:.15em;text-transform:uppercase;color:var(--fg)}
h1{font-size:20px}
h2{font-size:12px;color:var(--dim)}
.sub{margin:.25rem 0 0;color:var(--text)}
.hint{margin:.75rem 0;padding:.4rem .6rem;border:1px solid var(--warn);color:var(--warn)}
.banner{margin:.6rem 0 0;padding:.35rem .6rem;border:2px solid var(--warn);color:var(--warn);font-weight:700;letter-spacing:.2em}
.banner span{font-weight:400;letter-spacing:0;margin-left:.6rem}
.wm{position:fixed;top:0;left:0;width:100%;height:100%;overflow:hidden;pointer-events:none;z-index:0;display:flex;align-items:center;justify-content:center}
.wm span{display:block;transform:rotate(-30deg);white-space:nowrap;font-size:min(14vw,110px);font-weight:700;letter-spacing:.15em;color:rgba(255,176,0,.16)}
.page{position:relative;z-index:1}
.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:12px 0}
.card{border:1px solid var(--line);padding:8px 10px;min-width:0}
.card .big{display:block;font-size:24px;color:var(--fg);font-weight:700;margin:.2rem 0}
.card .detail{margin:0;color:var(--text);font-size:12px}
.card sup{color:var(--warn)}
.wide{grid-column:span 3}
.n-a{color:var(--warn)}
ul{margin:.25rem 0;padding-left:1.1rem}
li{margin:.1rem 0}
.spark{width:100%;height:auto;display:block}
.spark .axis{stroke:var(--line);stroke-width:1}
.spark .ln{fill:none;stroke:var(--fg);stroke-width:2}
.spark .dot{fill:var(--fg)}
footer{margin-top:10px;border-top:1px solid var(--line);padding-top:6px;font-size:11px;color:var(--text)}
footer ol{margin:.25rem 0;padding-left:1.4rem}
a{color:var(--fg)}
@page{size:A4;margin:10mm}
@media print{
html,body{background:#fff;color:#111;font-size:11px}
.page{max-width:none;padding:0}
h1,h2,.card .big{color:#0a4d0a}
.card{border-color:#555;break-inside:avoid}
.card sup,.n-a{color:#7a4a00}
.hint,.no-print{display:none}
.banner{color:#7a4a00;border-color:#7a4a00}
.wm span{color:rgba(122,74,0,.14)}
.spark{height:9mm;width:100%}
.card.wide ul{columns:3;margin:.1rem 0}
.card .detail{font-size:10px}
footer{font-size:9px;margin-top:6px}
footer ol{margin:.1rem 0}
footer li{margin:0}
.card.wide .detail{margin:.1rem 0}
.grid{gap:4px;margin:6px 0}
.card{padding:4px 8px}
.spark .axis{stroke:#555}.spark .ln{stroke:#0a4d0a}.spark .dot{fill:#0a4d0a}
footer{border-top-color:#555;color:#111}
}
`;
