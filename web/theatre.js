// The operating theatre (Epic B1). Decides between the 3D bench and the plain 2D page.
// The 2D page is the default: when anything blocks the 3D path this file does nothing and
// three.js is never requested. Only the 3D path dynamically imports ./vendor/three.module.min.js.
import { decideTheatre } from "./js/theatre/capability.js";

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
});
document.documentElement.dataset.theatre = decision.mode + ":" + decision.reason;

if (decision.mode === "3d") {
  import("./theatre/stage.js")
    .then((m) => m.mountStage())
    .catch(() => {
      // Fail safe: any error leaves the plain page exactly as it was.
      document.body.classList.remove("theatre");
      document.documentElement.dataset.theatre = "2d:error";
    });
}
