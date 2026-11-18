// The raid board on the wall: mirrors the #raid readout (timer, team score, rank, nights counter).
// The DOM stays the source of truth.
const W = 640, H = 420;
const LEFT_W = 380, RIGHT_W = 174; // right column: x 430 to 604, inside the frame
const MONO = "ui-monospace, 'DejaVu Sans Mono', Menlo, Consolas, monospace";
const IDS = ["raid-timer", "raid-score", "raid-rank", "raid-nights", "raid-state", "raid-epitaph", "raid-combo", "raid-shelf", "raid-vitals"];

export function makeBoard() {
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  let dirty = true;
  const obs = new MutationObserver(() => { dirty = true; });
  const root = document.getElementById("raid");
  if (root) obs.observe(root, { childList: true, subtree: true, characterData: true });
  const text = (id) => document.getElementById(id)?.textContent || "";
  function draw() {
    const t = Object.fromEntries(IDS.map((id) => [id, text(id)]));
    ctx.fillStyle = "#14110c";
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = "#5a4a2a";
    ctx.lineWidth = 8;
    ctx.strokeRect(8, 8, W - 16, H - 16);
    ctx.textBaseline = "top";
    ctx.fillStyle = "#d8c590";
    ctx.font = "bold 26px " + MONO;
    ctx.fillText("THE RAID", 36, 28);
    ctx.fillStyle = "#33ff33";
    ctx.font = "bold 120px " + MONO;
    ctx.fillText(t["raid-timer"], 36, 68);
    ctx.fillStyle = "#d8c590";
    ctx.font = "26px " + MONO;
    // Left column is 380 px wide so it never reaches the right column that starts at x=430.
    ctx.fillText(t["raid-score"], 36, 214, LEFT_W);
    ctx.fillText(t["raid-rank"], 36, 254, LEFT_W);
    ctx.fillStyle = "#ffb000";
    ctx.font = "18px " + MONO;
    ctx.fillText((t["raid-combo"].split(".")[0] || "").slice(0, 22), 430, 214, RIGHT_W);
    ctx.fillText(t["raid-shelf"].split(":")[0], 430, 254, RIGHT_W);
    const health = Number((t["raid-vitals"].match(/health (\d+)/) || [])[1]);
    if (Number.isFinite(health)) {
      ctx.strokeStyle = "#8c8366";
      ctx.lineWidth = 2;
      ctx.strokeRect(430, 294, 170, 18);
      ctx.fillStyle = "#33ff33";
      ctx.fillRect(432, 296, 166 * Math.min(100, health) / 100, 14);
      ctx.fillStyle = "#d8c590";
      ctx.fillText("Health " + health, 430, 318, RIGHT_W);
    }
    // Nights line: full width and 28 px on the canvas (about 12 px on screen at 1280x720). The DOM text keeps the "counted from" note.
    ctx.fillStyle = "#d8c590";
    ctx.font = "28px " + MONO;
    ctx.fillText(t["raid-nights"].replace(/\s*\(.*?\)/, ""), 36, 344, W - 72);
    ctx.fillStyle = "#8c8366";
    ctx.font = "italic 20px " + MONO;
    ctx.fillText(t["raid-epitaph"] || t["raid-state"], 36, 380, W - 72);
    dirty = false;
  }
  return {
    canvas,
    update() { if (!dirty) return false; draw(); return true; },
    dispose() { obs.disconnect(); },
  };
}
