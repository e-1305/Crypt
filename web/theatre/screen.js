// Draws the DOM transcript and input line onto an offscreen canvas for the CRT.
// The DOM stays the source of truth: this only mirrors it.
import { tailRows } from "../js/theatre/screen-text.js";
import { MONO, ADVANCE, onFontsReady } from "./font.js";

const W = 1024, H = 768, PAD = 36, FONT_PX = 28, LINE_PX = 34;
const COLS = Math.floor((W - PAD * 2) / (FONT_PX * ADVANCE));
const ROWS = Math.floor((H - PAD * 2) / LINE_PX) - 1; // last row is the input line

export function makeScreen(transcript, cmd) {
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  let dirty = true;
  onFontsReady(() => { dirty = true; });
  let lastPhase = -1;
  const mark = () => { dirty = true; };
  const obs = new MutationObserver(mark);
  obs.observe(transcript, { childList: true, subtree: true, characterData: true });
  cmd.addEventListener("input", mark);
  cmd.addEventListener("focus", mark);
  cmd.addEventListener("blur", mark);

  function draw(now) {
    const lines = Array.from(transcript.querySelectorAll(".line"), (el) => ({ text: el.textContent || "", echo: el.classList.contains("echo") }));
    ctx.fillStyle = "#031003";
    ctx.fillRect(0, 0, W, H);
    ctx.font = FONT_PX + 'px ' + MONO;
    ctx.textBaseline = "top";
    // Wrap with echo flags kept: wrap each source line, then take the tail.
    const rows = [];
    for (const l of lines) for (const r of tailRows([l.text], COLS, 1000)) rows.push({ r, echo: l.echo });
    rows.slice(-ROWS).forEach((row, i) => {
      ctx.fillStyle = row.echo ? "#22b022" : "#33ff33";
      ctx.fillText(row.r, PAD, PAD + i * LINE_PX);
    });
    const y = PAD + ROWS * LINE_PX;
    const value = cmd.disabled ? "" : cmd.value;
    ctx.fillStyle = "#33ff33";
    const prompt = "> " + value.slice(-(COLS - 3));
    ctx.fillText(prompt, PAD, y);
    if (!cmd.disabled && Math.floor(now / 500) % 2 === 0) {
      ctx.fillRect(PAD + prompt.length * FONT_PX * ADVANCE, y + 2, FONT_PX * ADVANCE, FONT_PX);
    }
    dirty = false;
  }
  return {
    canvas,
    /** Redraw when content changed or the cursor phase flipped. Returns true when the texture needs upload. */
    update(now) {
      const phase = Math.floor(now / 500) % 2;
      if (!dirty && phase === lastPhase) return false;
      lastPhase = phase;
      draw(now);
      return true;
    },
    dispose() { obs.disconnect(); cmd.removeEventListener("input", mark); cmd.removeEventListener("focus", mark); cmd.removeEventListener("blur", mark); },
  };
}
