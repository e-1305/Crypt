// Static pieces of the autopsy page: styles and "How computed" notes.

export const PDF_HINT = "Print or save as PDF from your browser";

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
} as const;

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
.spark .axis{stroke:#555}.spark .ln{stroke:#0a4d0a}.spark .dot{fill:#0a4d0a}
footer{border-top-color:#555;color:#111}
}
`;
