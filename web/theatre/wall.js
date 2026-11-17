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
      if (text !== "") lines[lines.length - 1].push({ text, state });
    });
  }
  return lines;
}

export function makeWall(plateEl, summaryEl) {
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  let dirty = true;
  const obs = new MutationObserver(() => { dirty = true; });
  obs.observe(plateEl, { childList: true, subtree: true, characterData: true });
  function draw() {
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
        ctx.fillStyle = seg.state ? COLOR[seg.state] || "#d8c590" : "#8c8366";
        ctx.fillText(seg.text, x, 84 + row * LINE_PX);
        x += seg.text.length * cw;
      }
    });
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
    update() { if (!dirty) return false; draw(); return true; },
    dispose() { obs.disconnect(); },
  };
}
