// The share panel (D3): preview canvas, repo toggle, Download PNG, Copy image, Share on LinkedIn.
// Everything is drawn in this browser. No upload, no tracking. All text is set with textContent.
import { layoutCard, defaultIncludeRepo } from "../js/render/card.js";
import { ensureFonts } from "../theatre/font.js";
import { paintCard, canvasBlob } from "./card.js";

function el(tag, text, cls) {
  const e = document.createElement(tag);
  if (text !== undefined) e.textContent = text;
  if (cls) e.className = cls;
  return e;
}

/**
 * Mounts the panel in `root`. `model` is { variant, creature, raid?, source } where source is "paste" (public repo read by
 * paste your repo) or "raid". The repo toggle starts ON for paste and OFF otherwise.
 */
export function mountCardPanel(root, model, { announce = () => {} } = {}) {
  root.textContent = "";
  const id = "card-" + model.variant;
  const box = el("div", undefined, "card-panel");
  const label = el("label", undefined, "card-toggle");
  const toggle = el("input");
  toggle.type = "checkbox";
  toggle.id = id + "-repo";
  toggle.checked = defaultIncludeRepo(model.source);
  label.appendChild(toggle);
  label.appendChild(document.createTextNode(" Include the repo name on the card"));
  const canvas = el("canvas", undefined, "card-canvas");
  canvas.id = id + "-canvas";
  canvas.setAttribute("role", "img");
  const actions = el("div", undefined, "card-actions");
  const mk = (suffix, t) => { const b = el("button", t); b.type = "button"; b.id = id + "-" + suffix; actions.appendChild(b); return b; };
  const download = mk("download", "Download PNG");
  const copy = mk("copy", "Copy image");
  const share = mk("linkedin", "Share on LinkedIn");
  const status = el("p", "", "muted");
  status.setAttribute("role", "status");
  const text = el("p", "", "card-text muted");
  for (const c of [label, canvas, actions, status, text]) box.appendChild(c);
  root.appendChild(box);

  let layout = null;
  const say = (t) => { status.textContent = t; announce(t); };

  async function paint() {
    try {
      await ensureFonts();
      layout = layoutCard({ variant: model.variant, creature: model.creature, raid: model.raid, includeRepo: toggle.checked });
      paintCard(layout, canvas);
      canvas.setAttribute("aria-label", layout.alt);
      text.textContent = layout.shareText;
    } catch {
      // Failsafe: no half-drawn card is offered.
      layout = null;
      say("The card could not be drawn. Reload the page and try again.");
    }
  }
  const ready = paint();
  toggle.addEventListener("change", () => { paint(); });

  download.addEventListener("click", async () => {
    try {
      await paint();
      if (!layout) return;
      const blob = await canvasBlob(canvas);
      const url = URL.createObjectURL(blob);
      const a = el("a");
      a.href = url;
      a.download = "crypt-" + model.variant + "-card.png";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      say("Card downloaded as " + a.download + ".");
    } catch {
      say("The card could not be saved. Try a different browser.");
    }
  });

  copy.addEventListener("click", async () => {
    try {
      await paint();
      if (!layout) return;
      if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined") throw new Error("no clipboard");
      await navigator.clipboard.write([new ClipboardItem({ "image/png": canvasBlob(canvas) })]);
      say("Card image copied. Paste it into your post.");
    } catch {
      say("Use Download PNG: this browser does not offer image copy.");
    }
  });

  share.addEventListener("click", async () => {
    await paint();
    if (!layout) return;
    let copied = false;
    try { await navigator.clipboard.writeText(layout.shareText); copied = true; } catch { /* the text stays visible below */ }
    const w = window.open(layout.shareUrl, "_blank", "noopener");
    say((w === null ? "The pop-up was blocked. " : "LinkedIn opened in a new window. ") + (copied ? "The post text is copied: paste it into the post." : "Copy the post text shown below the card."));
  });

  return { ready, toggle, canvas, get layout() { return layout; } };
}
