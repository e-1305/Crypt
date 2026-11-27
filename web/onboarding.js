// First 30 seconds (G3): DOM glue around js/theatre/onboarding.js. A tutorial strip, an idle hint and the daily banner.
// The strip only shows text for the player to type. It never submits a command: the player types GRAFT.
// Everything is plain text, so reduced motion, high contrast and the 2D page all keep every feature.
import { dailyEvent, nextHint, stepText, tutorialCommand, tutorialSteps } from "./js/theatre/onboarding.js";

const $ = (id) => document.getElementById(id);

// The ghost's line before each getting-started step (same voice as src/web/ghost-lines.ts: wry, never blames, 70 characters max).
// Plain text only. The instruction after it is unchanged.
export const STEP_GHOST_LINES = {
  look: "Take a slow look. The rot is easy to spot from here.",
  graft: "Your turn. The ghost keeps its hands in its sheet.",
  ci: "One last rite: the Bench wants a green light.",
};

export function initOnboarding({ store, announce, now = () => Date.now() }) {
  const n = tutorialSteps.length;
  let done = Array.isArray(store.get("crypt.tutorial.done")) ? tutorialSteps.map((_, i) => store.get("crypt.tutorial.done")[i] === true) : tutorialSteps.map(() => false);
  let limb = "";
  let lastInput = now();
  let timer = 0;

  const banner = $("daily-banner");
  if (banner) banner.textContent = "Today in the crypt: " + dailyEvent(new Date(now()).toISOString().slice(0, 10));

  const strip = $("tutorial");
  const hidden = () => store.get("crypt.tutorial.hidden") === true || store.get("crypt.tutorial.skipped") === true || done.every(Boolean);

  function setText(id, text) { const el = $(id); if (el && el.textContent !== text) el.textContent = text; }

  function render() {
    if (!strip) return;
    const off = hidden();
    strip.hidden = off;
    if (off) { setText("tutorial-hint", ""); clearInterval(timer); timer = 0; return; }
    if (timer === 0) timer = setInterval(() => { if (!document.hidden) hint(); }, 1000);
    const i = done.findIndex((d) => !d);
    const step = tutorialSteps[i];
    setText("tutorial-progress", "Getting started, step " + (i + 1) + " of " + n);
    setText("tutorial-step", (STEP_GHOST_LINES[step.id] ? STEP_GHOST_LINES[step.id] + " " : "") + stepText(step, limb));
    const cmd = tutorialCommand(step, limb);
    setText("tutorial-command", cmd === null ? "" : "Type: " + cmd);
    const next = $("tutorial-next");
    if (next) next.hidden = step.verb !== null || step.event !== undefined;
    hint();
  }

  function hint() {
    if (hidden()) return;
    setText("tutorial-hint", nextHint(done, now() - lastInput, limb) ?? "");
  }

  // A page event that arrives ahead of the strip (green CI before "Got it") finishes the steps before it too, so the strip
  // moves on. Typed verbs still finish only the step the strip waits for: EXAMINE and ASSIGN are taught in order.
  function finishStep(i) {
    if (done[i]) return;
    for (let k = 0; k <= i; k++) done[k] = true;
    store.set("crypt.tutorial.done", done);
    lastInput = now();
    if (done.every(Boolean)) announce("Getting started complete. Heal the rest of the creature at your own pace.");
    else announce("Step done. Next: " + stepText(tutorialSteps[done.findIndex((d) => !d)], limb));
    render();
  }

  $("tutorial-next")?.addEventListener("click", () => {
    const i = done.findIndex((d) => !d);
    if (i >= 0 && tutorialSteps[i].verb === null) finishStep(i);
  });
  $("tutorial-skip")?.addEventListener("click", () => { store.set("crypt.tutorial.skipped", true); announce("Getting started closed."); render(); });
  $("tutorial-hide")?.addEventListener("click", () => { store.set("crypt.tutorial.hidden", true); announce("Getting started is hidden on later visits."); render(); });
  $("cmd")?.addEventListener("input", () => { lastInput = now(); hint(); });
  // Escape closes the strip like Skip (remembered). It never touches the command line's text.
  document.addEventListener("keydown", (ev) => {
    if (ev.key !== "Escape" || !strip || strip.hidden) return;
    store.set("crypt.tutorial.skipped", true);
    announce("Getting started closed.");
    render();
  });
  // Hidden tab: no idle hint work (the hint only matters when someone is looking).
  render(); // starts the hint timer when the strip is on

  return {
    /** The limb id to suggest (a limb that has a rehearsal pull request). */
    setLimb(id) { if (typeof id === "string" && id !== limb) { limb = id; render(); } },
    /** Events the game accepted. A verb finishes its step when it is the one the strip is waiting for. */
    note(events) {
      lastInput = now();
      for (const e of events) {
        const i = done.findIndex((d) => !d);
        if (i >= 0 && e?.ok && e.parsed && tutorialSteps[i].verb === e.parsed.verb) finishStep(i);
      }
      render();
    },
    /** A page event (simulated CI green, a graft refused by the seal) finishes the step that waits for it. */
    signal(name) {
      const i = tutorialSteps.findIndex((s, k) => !done[k] && s.event === name);
      if (i >= 0) finishStep(i);
    },
    stop() { clearInterval(timer); },
  };
}
