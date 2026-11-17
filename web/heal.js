// Live heal glue (Epic B3). The rules live in js/theatre/heal-events.js (compiled from src/theatre/heal-events.ts).
// Two sources feed the same pipeline: the real one (app.js sees a limb turn Healed in game/<id>.json)
// and the simulated one (replays a dry-run style payload, always labelled SIMULATED CI). No network, no token.
// Fail-safe: any error, malformed event or ambiguity leaves the limb as it was.
import { applyHealEvent, demoPayload, simulateFromPayload, SIMULATED_LABEL } from "./js/theatre/heal-events.js";

const reduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function initHeal({ addLine, announce, getLimbs, redraw }) {
  const label = document.getElementById("sim-label");
  const simGreen = document.getElementById("sim-green");
  const simRed = document.getElementById("sim-red");
  let sim = {}; // limb key -> "Healed" for limbs the simulation healed. Kept in memory only and left out of the score.
  let timers = [];

  const keyOf = (l) => l.ecosystem + ":" + l.name;
  function states() {
    const out = {};
    for (const l of getLimbs()) if (l && typeof l.name === "string" && typeof l.ecosystem === "string") out[keyOf(l)] = sim[keyOf(l)] || l.state;
    return out;
  }
  function fx(kind, limb) {
    document.dispatchEvent(new CustomEvent("crypt:fx", { detail: { kind, limb, reduced: reduced() } }));
  }
  const short = (k) => k.split(":").slice(1).join(":");

  /** One raw event from either source. `simulated` only changes wording and what is remembered. */
  function handle(raw, simulated, prior) {
    try {
      const r = applyHealEvent(prior || states(), raw);
      const e = r.effect;
      if (!e) return;
      if (e.kind === "heal") {
        if (simulated) sim[e.limb] = "Healed";
        if (simulated) redraw([e.limb]); // the real plate was already drawn by app.js with the just-healed class
        fx("heal", e.limb);
        if (!simulated) addLine("The creature stirs. " + short(e.limb) + " is healed.");
        announce((simulated ? SIMULATED_LABEL + ". " : "") + "Healed: " + short(e.limb) + ".");
      } else if (e.kind === "convulse") {
        fx("convulse", e.limb);
        redraw([], e.limb);
        if (!simulated) addLine(e.line, "reject");
        announce((simulated ? SIMULATED_LABEL + ". " : "") + e.line);
      } else if (e.kind === "ci-green") {
        announce((simulated ? SIMULATED_LABEL + ". " : "") + "CI is green for " + short(e.limb) + ".");
      }
    } catch { /* leave the limb rotting */ }
  }

  function setLabel(text) {
    if (label) { label.textContent = text; label.hidden = text === ""; }
  }

  function run(verdict) {
    timers.forEach(clearTimeout);
    timers = [];
    sim = {};
    redraw([]);
    const steps = simulateFromPayload(demoPayload(getLimbs()), verdict);
    if (steps.length === 0) { setLabel(SIMULATED_LABEL + ": nothing sick to heal."); announce(SIMULATED_LABEL + ": nothing sick to heal."); return; }
    setLabel(SIMULATED_LABEL + ": replaying a dry-run payload. No token, no network. Nothing real changes.");
    for (const s of steps) {
      timers.push(setTimeout(() => {
        addLine(s.text, s.event && s.event.type === "ci-red" ? "reject" : "");
        if (s.event) handle(s.event, true);
      }, reduced() ? Math.min(s.atMs, 300) : s.atMs));
    }
  }

  simGreen?.addEventListener("click", () => run("green"));
  simRed?.addEventListener("click", () => run("red"));
  const q = new URLSearchParams(location.search).get("simulate");
  return {
    /** Real source: limbs app.js saw turn from sick to Healthy in game/<id>.json (the plate remembers they were sick). */
    real: (keys) => { for (const k of keys) handle({ type: "healed", limb: k }, false, { [k]: "Rotting" }); },
    /** The simulated heal is a view only: applied on top of whatever the page last loaded. */
    overlay: (limbs) => limbs.map((l) => (sim[keyOf(l)] === "Healed" ? { ...l, state: "Healed" } : l)),
    start: () => { if (q === "green" || q === "red") run(q); },
  };
}
