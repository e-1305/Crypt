// The operating theatre (Epic B1). Decides between the 3D bench and the plain 2D page.
// The 2D page is the default: when anything blocks the 3D path this file does nothing and
// three.js is never requested. Only the 3D path dynamically imports ./vendor/three.module.min.js.
import { decideTheatre } from "./js/theatre/capability.js";
import { parseRecordFlag, recordModeAfterKey } from "./js/theatre/polish.js";

function hasWebgl2() {
  try {
    const c = document.createElement("canvas");
    const gl = c.getContext("webgl2");
    if (!gl) return false;
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return true;
  } catch {
    return false;
  }
}

function storedHighContrast() {
  try { return JSON.parse(localStorage.getItem("crypt.hc") || "null") === true; } catch { return false; }
}

const decision = decideTheatre({
  webgl2: hasWebgl2(),
  reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  highContrast: storedHighContrast() || document.body.classList.contains("hc"),
  flag: new URLSearchParams(location.search).get("theatre"),
  viewportWidth: window.innerWidth,
  coarsePointer: window.matchMedia("(pointer: coarse)").matches,
});
document.documentElement.dataset.theatre = decision.mode + ":" + decision.reason;

// Small screens get the 2D page; offer the 3D bench when the device can run it.
const view3d = document.getElementById("view-3d");
if (view3d && decision.reason === "small-screen") view3d.hidden = false;

if (decision.mode === "3d") {
  import("./theatre/stage.js")
    .then((m) => m.mountStage())
    .catch(() => {
      // Fail safe: any error leaves the plain page exactly as it was.
      document.body.classList.remove("theatre");
      document.documentElement.dataset.theatre = "2d:error";
    });
}

// Creature 3D view toggle (3D-b). This file has no three.js import; three loads on the first click.
import("./theatre/creature3d.js").then((m) => m.initCreature3d()).catch(() => { /* the 2D plate stays */ });

// Recording mode (B5.3): hides UI chrome for screen capture, keeps the CRT and the plate.
// Works on the 3D bench and the 2D page. Reversible: Escape, or the visually hidden button (keyboard focus shows it).
const recordBtn = document.getElementById("record-toggle");
function setRecord(on) {
  document.body.classList.toggle("record", on);
  if (recordBtn) {
    recordBtn.setAttribute("aria-pressed", String(on));
    recordBtn.textContent = on ? "Exit recording mode" : "Recording mode";
    recordBtn.setAttribute("aria-label", on ? "Exit recording mode: show the page controls again" : "Recording mode: hide the page controls for screen capture");
  }
}
setRecord(parseRecordFlag(location.search));
recordBtn?.addEventListener("click", () => setRecord(!document.body.classList.contains("record")));
document.addEventListener("keydown", (e) => {
  const now = document.body.classList.contains("record");
  const next = recordModeAfterKey(now, e.key);
  if (next !== now) setRecord(next);
});
