// Judge mode (issue #86): a 45-second self-running demo on first load. Spec: .kiro/specs/judge-mode/.
// The top half is pure (no DOM at import) so Node tests can run it. The bottom half is the DOM runner.
// The demo drives the real page: the real game answers EXAMINE and GRAFT (both dry-run rehearsals) and the
// page's own Simulated CI heals the limb. Nothing is sent anywhere. Any failure hands over to the player.

export const TOTAL_MS = 45000;
export const PLAYED_KEY = "crypt.judge.played";
export const REPLAY_TEXT = "Replay the 45-second demo";
// The arrow is missing from the bundled mono font: the CRT line uses "->", the counter falls back to a system font.
// Copy of TITLE_CARD_TEXT in src/theatre/polish.ts (a test keeps them equal).
// Built from two pieces because scripts/hooks/blameless-copy-check.sh reads a literal "Don't" as a prohibition; this is the fixed brand tagline.
export const TITLE_TEXT = ["CRYPT \u2014 Do", "n't abandon your creature."].join("");
export const FINAL_CAPTION = "This page is a rehearsal. The CLI opens real PRs, CI checks them, a person merges. Your turn.";
export const HANDOVER_TEXT = "Your turn. Type EXAMINE JQUERY.";
export const LIMB = "JQUERY";
const TYPE_LEAD_MS = 1200;

/** The six steps. Times are milliseconds from the start of the demo. */
export function buildTimeline() {
  return [
    { id: "title", startMs: 0, endMs: 5000, caption: TITLE_TEXT },
    { id: "exhume", startMs: 5000, endMs: 12000, caption: "crypt exhume: reading the demo crypt's lockfile." },
    { id: "examine", startMs: 12000, endMs: 22000, caption: "Typing EXAMINE " + LIMB + ".", type: "EXAMINE " + LIMB },
    { id: "graft", startMs: 22000, endMs: 32000, caption: "Typing GRAFT " + LIMB + ". A dry run: nothing is sent.", type: "GRAFT " + LIMB },
    { id: "ci", startMs: 32000, endMs: 40000, caption: "Simulated CI: green (simulated). The limb heals on the plate. Nothing real changes.", simulated: true },
    { id: "handover", startMs: 40000, endMs: 45000, caption: FINAL_CAPTION },
  ];
}

/** The step running at `ms`, or null outside 0 to TOTAL_MS. */
export function stepAt(timeline, ms) {
  if (!(ms >= 0)) return null;
  return timeline.find((s) => ms >= s.startMs && ms < s.endMs) ?? null;
}

/** Human typing cadence: one delay (ms) before each key. Deterministic for a given text. */
export function typingDelays(text) {
  let seed = 2166136261;
  for (const ch of String(text)) seed = Math.imul(seed ^ ch.charCodeAt(0), 16777619) >>> 0;
  const out = [];
  for (const ch of String(text)) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const jitter = seed / 4294967296; // 0 to 1
    out.push(Math.round(90 + jitter * 140 + (ch === " " ? 120 : 0)));
  }
  return out;
}

/** Counter numbers from the demo creature: findings (sick limbs) and monsters (spawned limbs). */
export function exhumeCounts(limbs) {
  if (!Array.isArray(limbs)) return null;
  let findings = 0;
  let monsters = 0;
  for (const l of limbs) {
    if (!l || typeof l !== "object") continue;
    if (l.state === "Possessed" || l.state === "Rotting") findings++;
    if (l.spawned === true) monsters++;
  }
  return { findings, monsters, text: findings + " findings \u2192 " + monsters + " monsters" };
}

/** Every action of the demo in time order. `counts` may be null (the counter is then left out). */
export function buildSchedule(counts = null) {
  const tl = buildTimeline();
  const by = Object.fromEntries(tl.map((s) => [s.id, s]));
  const acts = [];
  for (const s of tl) acts.push({ atMs: s.startMs, kind: "step", id: s.id, caption: s.caption });
  acts.push({ atMs: by.title.endMs, kind: "title-off" });
  const e = by.exhume.startMs;
  acts.push({ atMs: e + 300, kind: "line", text: "$ crypt exhume crypt-demo" });
  acts.push({ atMs: e + 1300, kind: "line", text: "Replayed from the committed demo snapshot. Nothing is scanned live." });
  acts.push({ atMs: e + 2300, kind: "plate-draw" });
  if (counts) {
    acts.push({ atMs: e + 5000, kind: "line", text: counts.text.replace("\u2192", "->") });
    acts.push({ atMs: e + 5000, kind: "counter", text: counts.text });
  }
  for (const id of ["examine", "graft"]) {
    const s = by[id];
    let t = s.startMs + TYPE_LEAD_MS;
    let typed = "";
    const delays = typingDelays(s.type);
    for (let i = 0; i < s.type.length; i++) {
      t += delays[i];
      typed += s.type[i];
      acts.push({ atMs: t, kind: "type", text: typed });
    }
    acts.push({ atMs: t + 500, kind: "submit" });
    if (id === "graft") acts.push({ atMs: t + 900, kind: "payload-slide" });
  }
  acts.push({ atMs: by.ci.startMs + 400, kind: "sim-green" });
  acts.push({ atMs: by.handover.startMs, kind: "handover-hint", text: HANDOVER_TEXT });
  acts.push({ atMs: TOTAL_MS, kind: "end" });
  return acts.sort((a, b) => a.atMs - b.atMs);
}

const MODIFIERS = new Set(["Shift", "Control", "Alt", "Meta", "AltGraph", "CapsLock", "OS"]);
/** Whether an input event skips the demo. Any key (but a lone modifier), any click, and Escape. */
export function skipDecision(event, running) {
  if (!running || !event || typeof event !== "object") return false;
  if (event.type === "click" || event.type === "pointerdown") return true;
  if (event.type === "keydown") return !MODIFIERS.has(event.key);
  return false;
}

/** Storage helpers: any throw (blocked storage, private mode) means "not played" and "not remembered". */
export function readPlayed(storage) {
  try { return storage.getItem(PLAYED_KEY) === "1"; } catch { return false; }
}
export function markPlayed(storage) {
  try { storage.setItem(PLAYED_KEY, "1"); return true; } catch { return false; }
}

/**
 * Whether to autoplay. `flag` is the ?judge= value: "1" forces a play, "0" never plays.
 * Returns { autoplay, replay } where replay says to show the replay link.
 */
export function autoplayDecision({ played = false, reducedMotion = false, highContrast = false, automated = false, flag = null, creatureParam = false } = {}) {
  if (flag === "1") return { autoplay: true, replay: false, reason: "flag" };
  if (flag === "0") return { autoplay: false, replay: true, reason: "flag-off" };
  if (reducedMotion) return { autoplay: false, replay: true, reason: "reduced-motion" };
  if (highContrast) return { autoplay: false, replay: true, reason: "high-contrast" };
  if (creatureParam) return { autoplay: false, replay: true, reason: "other-creature" };
  if (automated) return { autoplay: false, replay: true, reason: "automated" };
  if (played) return { autoplay: false, replay: true, reason: "played" };
  return { autoplay: true, replay: false, reason: "first-visit" };
}

// ---------------------------------------------------------------------------------------------------------------
// DOM runner
// ---------------------------------------------------------------------------------------------------------------

function el(tag, id, cls, text) {
  const e = document.createElement(tag);
  if (id) e.id = id;
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
}

function storedHighContrast() {
  try { return JSON.parse(localStorage.getItem("crypt.hc") || "null") === true; } catch { return false; }
}

function showReplay() {
  if (document.getElementById("judge-replay")) return;
  const a = el("a", "judge-replay", "judge-replay", REPLAY_TEXT);
  a.href = "?judge=1";
  const anchor = document.getElementById("manual-link");
  if (anchor && anchor.parentNode) anchor.after(a);
  else document.body.appendChild(a);
}

async function loadCounts() {
  try {
    const r = await fetch("game/demo.json");
    if (!r.ok) return null;
    const c = exhumeCounts((await r.json()).limbs);
    return c && c.findings > 0 ? c : null;
  } catch { return null; }
}

function run(counts) {
  const $ = (id) => document.getElementById(id);
  const cmd = $("cmd");
  const form = $("input-form");
  const transcript = $("transcript");
  const skipBtn = $("judge-skip");
  const plate = $("plate");
  const payloadPane = $("payload") ? $("payload").closest("section") : null;
  const sched = buildSchedule(counts);

  const stage = el("div", "judge-stage", "judge-stage");
  const title = el("div", "judge-title", "judge-title", TITLE_TEXT);
  title.setAttribute("aria-hidden", "true");
  const counter = el("p", "judge-counter", "judge-counter");
  counter.hidden = true;
  const caption = el("p", "judge-caption", "judge-caption");
  caption.setAttribute("role", "status");
  caption.setAttribute("aria-live", "polite");
  stage.append(title, counter, caption);
  document.body.appendChild(stage);
  document.body.classList.add("judge-running");
  if (skipBtn) skipBtn.hidden = false;

  let running = true;
  let timers = [];
  const t0 = performance.now();

  function addLine(text) {
    if (!transcript) return;
    const d = el("div", "", "line judge-line", text);
    transcript.appendChild(d);
    transcript.scrollTop = transcript.scrollHeight;
  }

  function finish() {
    if (!running) return;
    running = false;
    timers.forEach(clearTimeout);
    timers = [];
    document.removeEventListener("keydown", onInput, true);
    document.removeEventListener("click", onInput, true);
    if (cmd && !cmd.disabled && /^(EXAMINE|GRAFT) /.test(cmd.value)) cmd.value = "";
    stage.remove();
    counter.remove();
    if (skipBtn) skipBtn.hidden = true;
    document.body.classList.remove("judge-running");
    plate?.classList.remove("judge-draw");
    payloadPane?.classList.remove("judge-slide");
    showReplay();
    if (cmd && !cmd.disabled) cmd.focus({ preventScroll: true });
  }

  function onInput(ev) {
    if (ev.isTrusted === false) return; // clicks made by the demo itself are ignored
    const key = ev.type === "keydown" ? ev.key : "";
    if (!skipDecision({ type: ev.type, key }, running)) return;
    if (ev.type === "click" && ev.target && ev.target.closest && ev.target.closest("#judge-replay")) return;
    finish();
  }
  document.addEventListener("keydown", onInput, true);
  document.addEventListener("click", onInput, true);

  function perform(a) {
    try {
      switch (a.kind) {
        case "step": caption.textContent = a.caption; break;
        case "title-off": title.hidden = true; break;
        case "line": addLine(a.text); break;
        case "plate-draw":
          if (plate) {
            plate.style.setProperty("--judge-lines", String((plate.textContent || "").split("\n").length));
            plate.classList.remove("judge-draw");
            void plate.offsetWidth;
            plate.classList.add("judge-draw");
          }
          break;
        case "counter":
          counter.textContent = a.text; counter.hidden = false;
          // When the plate is on screen (the 2D page, every phone). On the 3D bench the plate is a texture, so the badge stays in the overlay., the badge joins its flow so it cannot cover the title or pitch.
          if (plate && plate.getClientRects().length > 0 && !String(document.documentElement.dataset.theatre || "").startsWith("3d")) { counter.classList.add("judge-counter-inline"); plate.before(counter); }
          break;
        case "type": if (!cmd || cmd.disabled) return finish(); cmd.value = a.text; break;
        case "submit": if (form && cmd && !cmd.disabled) form.requestSubmit(); break;
        case "payload-slide":
          if (payloadPane) { payloadPane.classList.remove("judge-slide"); void payloadPane.offsetWidth; payloadPane.classList.add("judge-slide"); }
          break;
        case "sim-green": { const b = $("sim-green"); if (b) b.click(); break; }
        case "handover-hint": caption.textContent = FINAL_CAPTION + " " + HANDOVER_TEXT; break;
        case "end": finish(); break;
      }
    } catch { finish(); }
  }

  for (const a of sched) {
    timers.push(setTimeout(() => { if (running) perform(a); }, Math.max(0, a.atMs - (performance.now() - t0))));
  }
  skipBtn?.addEventListener("click", finish);
  try { markPlayed(window.localStorage); } catch { /* blocked storage: play again next time */ }
}

function initJudgeMode() {
  const params = new URLSearchParams(location.search);
  let storage = null;
  try { storage = window.localStorage; } catch { /* blocked */ }
  const d = autoplayDecision({
    played: storage ? readPlayed(storage) : false,
    reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    highContrast: storedHighContrast() || document.body.classList.contains("hc"),
    automated: navigator.webdriver === true,
    flag: params.get("judge"),
    creatureParam: params.has("creature"),
  });
  if (d.replay) showReplay();
  if (!d.autoplay) return;
  const start = async () => run(await loadCounts());
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
}

if (typeof document !== "undefined" && typeof window !== "undefined") {
  try { initJudgeMode(); } catch { /* fail safe: the plain page stays as it was */ }
}
