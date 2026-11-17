// Draws the plate (layoutPlate output) on a canvas for the wall. It reads the DOM #plate that
// web/app.js already builds, so healed state and live updates come for free.
// State is shown by glyph and word as well as color. A legend lists all four states.
const W = 960, H = 1000, FONT_PX = 17, LINE_PX = 19;
const COLOR = { Possessed: "#ff6a3d", Rotting: "#c8e63c", Healed: "#33ff33", Healthy: "#22b022" };
const LEGEND = [["Possessed", "#", "POSSESSED"], ["Rotting", "%", "ROTTING"], ["Healed", "+", "HEALED"], ["Healthy", ".", "HEALTHY"]];

function readLines(plateEl) {
  const lines = [[]];
  for (const node of plateEl.childNodes) {
    const state = node.nodeType === 1 ? node.dataset.state : undefined;
    const parts = (node.textContent || "").split("\n");
    parts.forEach((text, i) => {
      if (i > 0) lines.push([]);
      if (text !== "") lines[lines.length - 1].push({ text, state, limb: node.nodeType === 1 ? node.dataset.limb : undefined });
    });
  }
  return lines;
}

const FX_MS = 1600;
const hex = (n) => Math.round(n).toString(16).padStart(2, "0");
function mix(a, b, t) {
  const p = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
  const [x, y] = [p(a), p(b)];
  return "#" + x.map((v, i) => hex(v + (y[i] - v) * t)).join("");
}

export function makeWall(plateEl, summaryEl) {
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  let dirty = true;
  // Live heal effects (web/heal.js dispatches crypt:fx). Heal: rot color fades to green and the stitches glow.
  // Convulse: the limb shakes. With reduced motion the new state is simply shown, no animation.
  const fx = new Map();
  const onFx = (e) => {
    const d = e.detail || {};
    if (typeof d.limb !== "string" || d.reduced === true) { dirty = true; return; }
    if (d.kind === "heal" || d.kind === "convulse") fx.set(d.limb, { kind: d.kind, t0: performance.now() });
    dirty = true;
  };
  document.addEventListener("crypt:fx", onFx);
  const obs = new MutationObserver(() => { dirty = true; });
  obs.observe(plateEl, { childList: true, subtree: true, characterData: true });
  const simEl = document.getElementById("sim-label");
  if (simEl) obs.observe(simEl, { childList: true, subtree: true, characterData: true, attributes: true });
  function draw() {
    const now = performance.now();
    for (const [k, v] of fx) if (now - v.t0 > FX_MS) fx.delete(k);
    ctx.fillStyle = "#14110c";
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = "#5a4a2a";
    ctx.lineWidth = 8;
    ctx.strokeRect(10, 10, W - 20, H - 20);
    ctx.font = "bold 26px ui-monospace, 'DejaVu Sans Mono', Menlo, Consolas, monospace";
    ctx.textBaseline = "top";
    ctx.fillStyle = "#d8c590";
    ctx.fillText("PLATE I: THE CREATURE", 48, 36);
    ctx.font = FONT_PX + "px ui-monospace, 'DejaVu Sans Mono', Menlo, Consolas, monospace";
    const cw = FONT_PX * 0.6;
    readLines(plateEl).forEach((segs, row) => {
      let x = 48;
      for (const seg of segs) {
        let color = seg.state ? COLOR[seg.state] || "#d8c590" : "#8c8366";
        let dx = 0, dy = 0, glow = 0;
        const f = seg.limb ? fx.get(seg.limb) : undefined;
        if (f) {
          const p = Math.min(1, (now - f.t0) / FX_MS);
          if (f.kind === "heal") { color = mix(COLOR.Rotting, COLOR.Healed, p); glow = 18 * (1 - p); }
          else { color = "#ff4d4d"; dx = Math.sin(p * 90) * 4 * (1 - p); dy = Math.cos(p * 70) * 2 * (1 - p); }
        }
        ctx.fillStyle = color;
        ctx.shadowColor = "#ffffff";
        ctx.shadowBlur = glow;
        ctx.fillText(seg.text, x + dx, 84 + row * LINE_PX + dy);
        ctx.shadowBlur = 0;
        x += seg.text.length * cw;
      }
    });
    const sim = document.getElementById("sim-label");
    if (sim && !sim.hidden && sim.textContent) {
      ctx.font = "bold 20px " + "ui-monospace, 'DejaVu Sans Mono', Menlo, Consolas, monospace";
      ctx.fillStyle = "#ff6a3d";
      ctx.fillText(sim.textContent.slice(0, 64), 48, H - 120);
    }
    // Legend: color chip + glyph + word, so no state depends on color alone.
    ctx.font = "bold 22px ui-monospace, 'DejaVu Sans Mono', Menlo, Consolas, monospace";
    LEGEND.forEach(([state, glyph, word], i) => {
      const x = 40 + i * 228, y = H - 70;
      ctx.fillStyle = COLOR[state];
      ctx.fillRect(x, y, 22, 22);
      ctx.fillText(glyph + " " + word, x + 34, y);
    });
    dirty = false;
  }
  return {
    canvas,
    update() { if (!dirty && fx.size === 0) return false; draw(); return true; },
    dispose() { obs.disconnect(); document.removeEventListener("crypt:fx", onFx); },
  };
}
