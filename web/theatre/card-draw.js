// Draws the end-of-raid card (card data from js/theatre/card.js) on a canvas and offers it as a PNG.
// The card holds public scan data only.
import { cardLines } from "../js/theatre/card.js";

const W = 800, H = 450;
const MONO = "ui-monospace, 'DejaVu Sans Mono', Menlo, Consolas, monospace";

export function drawCard(data, canvas = document.createElement("canvas")) {
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  const lines = cardLines(data);
  ctx.fillStyle = "#14110c";
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = "#5a4a2a";
  ctx.lineWidth = 8;
  ctx.strokeRect(14, 14, W - 28, H - 28);
  ctx.textBaseline = "top";
  ctx.fillStyle = "#d8c590";
  ctx.font = "bold 40px " + MONO;
  ctx.fillText(lines[0], 48, 44);
  ctx.fillStyle = "#8c8366";
  ctx.font = "24px " + MONO;
  ctx.fillText(lines[1], 48, 100);
  ctx.fillStyle = "#33ff33";
  ctx.font = "bold 30px " + MONO;
  lines.slice(2, 6).forEach((t, i) => ctx.fillText(t, 48, 160 + i * 46));
  ctx.fillStyle = "#d8c590";
  ctx.font = "italic 22px " + MONO;
  ctx.fillText(lines[6], 48, H - 70, W - 96);
  return canvas;
}

export function downloadCard(data) {
  const canvas = drawCard(data);
  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "crypt-raid-card.png";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, "image/png");
}
