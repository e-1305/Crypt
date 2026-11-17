// The raid board on the wall: mirrors the #raid readout (timer, team score, rank, nights counter).
// The DOM stays the source of truth.
const W = 640, H = 420;
const MONO = "ui-monospace, 'DejaVu Sans Mono', Menlo, Consolas, monospace";
const IDS = ["raid-timer", "raid-score", "raid-rank", "raid-nights", "raid-state", "raid-epitaph"];

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
    ctx.fillText(t["raid-score"], 36, 214);
    ctx.fillText(t["raid-rank"], 36, 254);
    ctx.fillText(t["raid-nights"], 36, 294);
    ctx.fillStyle = "#8c8366";
    ctx.font = "italic 20px " + MONO;
    ctx.fillText(t["raid-epitaph"] || t["raid-state"], 36, 350, W - 72);
    dirty = false;
  }
  return {
    canvas,
    update() { if (!dirty) return false; draw(); return true; },
    dispose() { obs.disconnect(); },
  };
}
