// Paints a card layout (src/render/card.ts, compiled to js/render/card.js) on a canvas. Client side only: nothing is uploaded.
// JetBrains Mono is self-hosted (web/fonts); callers await ensureFonts() before the first paint.
import { MONO } from "../theatre/font.js";

export function paintCard(layout, canvas = document.createElement("canvas")) {
  canvas.width = layout.width;
  canvas.height = layout.height;
  const ctx = canvas.getContext("2d");
  ctx.textBaseline = "top";
  for (const op of layout.ops) {
    if (op.t === "rect") {
      if (op.fill) { ctx.fillStyle = op.fill; ctx.fillRect(op.x, op.y, op.w, op.h); }
      if (op.stroke) { ctx.strokeStyle = op.stroke; ctx.lineWidth = op.lineWidth || 2; ctx.strokeRect(op.x, op.y, op.w, op.h); }
    } else {
      ctx.fillStyle = op.color;
      ctx.font = (op.bold ? "bold " : "") + op.size + "px " + MONO;
      ctx.fillText(op.text, op.x, op.y);
    }
  }
  return canvas;
}

export function canvasBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("no image"))), "image/png");
  });
}
