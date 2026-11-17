// Page wiring only. Marker logic lives in js/web/output-hook.js (compiled from src/web/output-hook.ts).
// Plate drawing lives in js/render/plate.js (compiled from src/render/plate.ts).
// The only requests this page makes are for its own files under game/: index.json, <id>.z8, <id>.json, <id>.payloads.json.
// Grafts are rehearsals here: GRAFT shows a prebuilt dry-run payload and sends nothing.
import { startPlayer } from "./js/web/player.js";
import { markHealed, markRed } from "./js/web/healed.js";
import { layoutPlate, plateSummary, creatureName } from "./js/render/plate.js";
import { parseRepoUrl, repoSlug } from "./js/web/repo-url.js";
import { initRaid } from "./raid.js";
import { initHeal } from "./heal.js";
import { initSound } from "./theatre/sound.js";
import { countPossessed } from "./js/theatre/audio-plan.js";

const sound = initSound();

const transcript = document.getElementById("transcript");
const form = document.getElementById("input-form");
const cmd = document.getElementById("cmd");
const eventLog = document.getElementById("event-log");
const eventEmpty = document.getElementById("event-empty");
const plateEl = document.getElementById("plate");
const plateSummaryEl = document.getElementById("plate-summary");
const announcer = document.getElementById("announcer");
const hcToggle = document.getElementById("hc-toggle");
const downloadBtn = document.getElementById("download");
const creatureNameEl = document.getElementById("creature-name");
const payloadEl = document.getElementById("payload");
const galleryList = document.getElementById("gallery-list");
const lookupForm = document.getElementById("lookup-form");
const lookupInput = document.getElementById("lookup");
const lookupStatus = document.getElementById("lookup-status");

// Which creature to play: the demo, or a gallery slug from game/index.json. Only listed slugs are used in paths.
let creatureId = "demo";
let payloads = {};
let storyBytes = null;
let downloadName = "crypt-demo.z8";

const store = {
  get(k) {
    try { return JSON.parse(localStorage.getItem(k) || "null"); } catch { return null; }
  },
  set(k, v) {
    try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage unavailable: the page still works */ }
  },
};

function scopedStore() {
  return {
    get: (k) => store.get("crypt." + creatureId + "." + k),
    set: (k, v) => store.set("crypt." + creatureId + "." + k, v),
  };
}

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

// RAID is a client-side command: the game grammar stays strict and never sees it.
let pollTimer = 0;
const raid = initRaid({
  store: scopedStore(), // per creature, like the healed marks, so a gallery creature has its own raid state
  announce,
  onRunning(on) {
    clearInterval(pollTimer);
    pollTimer = on ? setInterval(() => loadPlate(), 5000) : 0;
  },
});

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
  if (e.ok && e.parsed.verb === "GRAFT") showPayload(e.parsed.limb);
  announce(spoken);
}

function showPayload(limb) {
  const p = payloads[limb];
  if (p) {
    payloadEl.textContent = "Dry run. Nothing was sent.\n\n" + JSON.stringify(p, null, 2);
    announce("Dry-run pull request payload for " + limb + " is shown.");
  } else {
    payloadEl.textContent = "No pull request opens for " + limb + " in this rehearsal. Only spawned npm limbs have a payload.";
  }
}

function onResult(result) {
  for (const line of result.lines) {
    if (line === ">") continue; // the game's prompt, shown by the input row
    addLine(line, line.startsWith("> ") ? "echo" : "");
  }
  result.events.forEach(addEvent);
  if (result.events.some((e) => e.ok && e.command && e.command.startsWith("GRAFT"))) sound.graft();
}

let lastCreature = null;
const heal = initHeal({
  addLine,
  announce,
  getLimbs: () => (lastCreature ? lastCreature.limbs : []),
  redraw: (fresh, convulse) => { if (lastCreature) drawPlate(lastCreature, fresh, convulse); },
});

function drawPlate(real, fresh, convulse) {
  lastCreature = real;
  sound.setPossessed(countPossessed(heal.overlay(real.limbs)));
  const creature = { ...real, limbs: heal.overlay(real.limbs) };
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
      span.dataset.limb = seg.limb;
      if (fresh.includes(seg.limb)) span.className = "just-healed";
      else if (convulse && seg.limb === convulse) span.className = "convulsing";
      span.textContent = seg.text;
      plateEl.appendChild(span);
    }
    if (i < lines.length - 1) plateEl.appendChild(document.createTextNode("\n"));
  });
  const summary = plateSummary(creature);
  plateSummaryEl.textContent = summary.length === 0 ? "The slab is bare. No limbs are possessed or rotting." : "Limbs: " + summary.join("; ") + ".";
}

// ?simulate= runs once, not on every raid poll.
let simStarted = false;

async function loadPlate() {
  try {
    const res = await fetch("game/" + creatureId + ".json");
    if (!res.ok) throw new Error("HTTP " + res.status);
    const creature = await res.json();
    if (!creature || !Array.isArray(creature.limbs)) throw new Error("no limbs");
    const fresh = markHealed(creature.limbs, scopedStore());
    const red = markRed(creature.limbs, scopedStore());
    drawPlate(creature, fresh);
    const name = creatureName(creature.repo || "demo");
    creatureNameEl.textContent = name + (creatureId === "demo" ? " (the demo creature)" : " (" + creature.repo + ")");
    downloadName = "crypt-" + name.toLowerCase() + ".z8";
    raid.setLimbs(creature.limbs, creature.repo);
    // Real source: each limb that turned Healed goes through the same fail-safe pipeline as the simulation.
    heal.real(fresh);
    // A red check recorded by the Inquisitor shows the rejection once per PR.
    heal.red(red);
    if (!simStarted) { simStarted = true; heal.start(); }
  } catch (err) {
    plateEl.textContent = "";
    plateSummaryEl.textContent = "The plate could not be loaded. Reload the page to try again.";
  }
}

async function loadIndex() {
  try {
    const res = await fetch("game/index.json");
    if (!res.ok) throw new Error("HTTP " + res.status);
    const list = await res.json();
    if (!Array.isArray(list)) throw new Error("bad index");
    return list.filter((x) => x && typeof x.slug === "string" && typeof x.repo === "string");
  } catch {
    return [];
  }
}

function drawGallery(list) {
  for (const g of list) {
    const li = document.createElement("li");
    const a = document.createElement("a");
    a.href = "?creature=" + encodeURIComponent(g.slug);
    a.textContent = g.repo;
    if (g.slug === creatureId) a.setAttribute("aria-current", "page");
    li.appendChild(a);
    galleryList.appendChild(li);
  }
  lookupForm.addEventListener("submit", (ev) => {
    ev.preventDefault();
    const ref = parseRepoUrl(lookupInput.value);
    if (!ref) {
      lookupStatus.textContent = "Enter an address like https://github.com/owner/repo.";
      return;
    }
    const hit = list.find((g) => g.slug === repoSlug(ref));
    if (!hit) {
      lookupStatus.textContent = ref.owner + "/" + ref.repo + " is not in the gallery. Run crypt raid on your own checkout to meet its creature.";
      return;
    }
    lookupStatus.textContent = "Opening " + hit.repo + ".";
    location.search = "?creature=" + encodeURIComponent(hit.slug);
  });
}

downloadBtn.addEventListener("click", () => {
  if (!storyBytes) return;
  const url = URL.createObjectURL(new Blob([storyBytes], { type: "application/octet-stream" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = downloadName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  announce("Downloaded " + downloadName + ". Open it in any Z-machine interpreter.");
});

async function main() {
  const list = await loadIndex();
  const wanted = new URLSearchParams(location.search).get("creature");
  if (wanted !== null && list.some((g) => g.slug === wanted)) creatureId = wanted;
  drawGallery(list);
  loadPlate();
  try {
    const p = await fetch("game/" + creatureId + ".payloads.json");
    if (p.ok) payloads = await p.json();
  } catch { /* no payloads: GRAFT shows the plain message */ }
  const res = await fetch("game/" + creatureId + ".z8");
  if (!res.ok) throw new Error("game/" + creatureId + ".z8 not found (HTTP " + res.status + ")");
  const story = new Uint8Array(await res.arrayBuffer());
  storyBytes = story;
  downloadBtn.disabled = false;
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
    if (raid.handleCommand(text)) {
      addLine("> " + text.trim(), "echo");
      addLine("The raid begins. Fifteen minutes. Heal what you can.");
      return;
    }
    player.submit(text);
  });
}

main().catch((err) => addLine("Story file could not be loaded: " + err.message));
