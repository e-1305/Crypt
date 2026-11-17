// Page wiring only. Marker logic lives in js/web/output-hook.js (compiled from src/web/output-hook.ts).
// Plate drawing lives in js/render/plate.js (compiled from src/render/plate.ts).
// The only requests this page makes are for its own files: game/spike.z5 and game/creature.json.
import { startPlayer } from "./js/web/player.js";
import { markHealed } from "./js/web/healed.js";
import { layoutPlate, plateSummary } from "./js/render/plate.js";

const transcript = document.getElementById("transcript");
const form = document.getElementById("input-form");
const cmd = document.getElementById("cmd");
const eventLog = document.getElementById("event-log");
const eventEmpty = document.getElementById("event-empty");
const plateEl = document.getElementById("plate");
const plateSummaryEl = document.getElementById("plate-summary");
const announcer = document.getElementById("announcer");
const hcToggle = document.getElementById("hc-toggle");

const store = {
  get(k) {
    try { return JSON.parse(localStorage.getItem(k) || "null"); } catch { return null; }
  },
  set(k, v) {
    try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage unavailable: the page still works */ }
  },
};

// Messages queued in the same tick are spoken together, so none is overwritten.
let pending = [];
function announce(text) {
  if (pending.length === 0) {
    announcer.textContent = "";
    setTimeout(() => {
      announcer.textContent = pending.join(" ");
      pending = [];
    }, 50);
  }
  pending.push(text);
}

// High-contrast / screen-reader mode.
function setHc(on) {
  document.body.classList.toggle("hc", on);
  hcToggle.setAttribute("aria-pressed", String(on));
  store.set("crypt.hc", on);
}
hcToggle.addEventListener("click", () => setHc(!document.body.classList.contains("hc")));
setHc(store.get("crypt.hc") === true);

function addLine(text, cls) {
  const div = document.createElement("div");
  div.className = cls ? "line " + cls : "line";
  div.textContent = text === "" ? "\u00a0" : text;
  transcript.appendChild(div);
  transcript.scrollTop = transcript.scrollHeight;
}

function addEvent(e) {
  const li = document.createElement("li");
  let spoken;
  if (e.ok) {
    li.className = "ok";
    li.textContent = "Line " + e.lineNo + ": Detected: " + e.command + "  [[CRYPT " + (e.command === "SEAL CRYPT" ? "SEAL" : e.command) + "]]";
    spoken = "Command detected: " + e.command + ".";
  } else {
    li.className = "rejected";
    li.textContent = "Line " + e.lineNo + ": " + e.reason;
    spoken = "Command not accepted. " + e.reason;
  }
  eventLog.appendChild(li);
  eventEmpty.hidden = true;
  announce(spoken);
}

function onResult(result) {
  for (const line of result.lines) {
    if (line === ">") continue; // the game's prompt, shown by the input row
    addLine(line, line.startsWith("> ") ? "echo" : "");
  }
  result.events.forEach(addEvent);
}

function drawPlate(creature, fresh) {
  const lines = layoutPlate(creature, { repo: creature.repo });
  plateEl.textContent = "";
  lines.forEach((line, i) => {
    for (const seg of line.segments) {
      if (seg.state === undefined) {
        plateEl.appendChild(document.createTextNode(seg.text));
        continue;
      }
      const span = document.createElement("span");
      span.dataset.state = seg.state;
      if (fresh.includes(seg.limb)) span.className = "just-healed";
      span.textContent = seg.text;
      plateEl.appendChild(span);
    }
    if (i < lines.length - 1) plateEl.appendChild(document.createTextNode("\n"));
  });
  const summary = plateSummary(creature);
  plateSummaryEl.textContent = summary.length === 0 ? "The slab is bare. No limbs are possessed or rotting." : "Limbs: " + summary.join("; ") + ".";
}

async function loadPlate() {
  try {
    const res = await fetch("game/creature.json");
    if (!res.ok) throw new Error("HTTP " + res.status);
    const creature = await res.json();
    if (!creature || !Array.isArray(creature.limbs)) throw new Error("no limbs");
    const fresh = markHealed(creature.limbs, store);
    drawPlate(creature, fresh);
    if (fresh.length > 0) announce("Healed: " + fresh.map((k) => k.split(":").slice(1).join(":")).join(", ") + ".");
  } catch (err) {
    plateEl.textContent = "";
    plateSummaryEl.textContent = "No plate yet. Run npm run exhume, then reload this page.";
  }
}

async function main() {
  const res = await fetch("game/spike.z5");
  if (!res.ok) throw new Error("game/spike.z5 not found (HTTP " + res.status + ")");
  const story = new Uint8Array(await res.arrayBuffer());
  const player = startPlayer(new window.ZVM(), story, {
    onResult,
    onExit: () => { cmd.disabled = true; addLine("The story has ended."); },
    onError: (m) => addLine("Interpreter stopped: " + m),
  });
  cmd.disabled = false;
  cmd.focus();
  form.addEventListener("submit", (ev) => {
    ev.preventDefault();
    const text = cmd.value;
    cmd.value = "";
    player.submit(text);
  });
}

loadPlate();
main().catch((err) => addLine("Story file could not be loaded: " + err.message));
