// War Room page (Epic D4). Thin DOM layer: the rules live in js/warroom/*.js (compiled from src/warroom/).
// Modes: SIMULATED (default, scripted on the crypt-demo creature, every row labelled) and LIVE (?repo=owner/name, GET only).
// The token lives in one JS variable. It is cleared when the page hides and it is never stored or put in a URL.
import { layoutPlate } from "../js/render/plate.js";
import { sceneFrom, limbKeyOf } from "../js/warroom/state.js";
import { simulatedTimeline } from "../js/warroom/simulated.js";
import { badgesFor } from "../js/warroom/badges.js";
import { recapFor } from "../js/warroom/recap.js";
import { eventsFromPull, eventsFromCheckRuns, pollPlan, checkRunsRequest, rateLimitDecision } from "../js/warroom/github-events.js";
import { drawCard, downloadCard } from "../theatre/card-draw.js";
import { ensureFonts } from "../theatre/font.js";

const API = "https://api.github.com";
const TICK_MS = 250;
const FRESH_MS = 2500;
const $ = (id) => document.getElementById(id);
const reduceMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const el = {
  banner: $("mode-banner"), plate: $("plate"), flash: $("flash"), rejection: $("rejection"), bossList: $("boss-list"),
  score: $("score-value"), clock: $("clock"), pollNote: $("poll-note"), combo: $("combo-value"), comboNote: $("combo-note"),
  feed: $("feed"), badges: $("badges"), status: $("status"), recap: $("recap"), recapCanvas: $("recap-canvas"),
  sound: $("sound-toggle"), repoInput: $("repo-input"), tokenInput: $("token-input"),
};

const run = {
  mode: "simulated", // "simulated" | "live"
  repoId: "crypt-demo",
  repos: [],
  limbs: [],
  creature: { repo: "crypt-demo", limbs: [] },
  t0: Date.now(),
  scanStart: Date.now(),
  events: [],
  seen: new Set(),
  sigs: {},
  soundOn: false,
  audio: null,
  token: "", // memory only
  timer: null,
  pollTimer: null,
  gen: 0, // bumped on every mode change; a poll that started under an older value drops its result
  nextPollAt: 0,
  quota: null,
  done: false,
};

function say(text) { el.status.textContent = text; }

function setBanner() {
  if (run.mode === "simulated") {
    el.banner.textContent = "SIMULATED: a scripted raid on the crypt-demo creature. Nothing here is real.";
    el.banner.classList.remove("live");
  } else {
    el.banner.textContent = "LIVE: watching " + run.repos.join(", ") + " (read only).";
    el.banner.classList.add("live");
  }
  document.body.dataset.mode = run.mode;
}

async function loadCreature(id) {
  const res = await fetch("game/" + id + ".json");
  if (!res.ok) throw new Error("HTTP " + res.status);
  const c = await res.json();
  if (!c || !Array.isArray(c.limbs)) throw new Error("bad creature");
  return c;
}

// ---- sound: only after a click, never with reduced motion --------------------------------------------------------------
function thunder() {
  if (!run.soundOn || reduceMotion()) return;
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    run.audio = run.audio || new AC();
    const ctx = run.audio;
    const len = Math.floor(ctx.sampleRate * 1.2);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    let seed = 12345;
    for (let i = 0; i < len; i++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      data[i] = ((seed / 4294967296) * 2 - 1) * Math.pow(1 - i / len, 2);
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 400;
    src.connect(lp).connect(ctx.destination);
    src.start();
  } catch { /* sound is optional */ }
}

function flash() {
  if (reduceMotion()) return;
  el.flash.classList.remove("thunder");
  void el.flash.offsetWidth;
  el.flash.classList.add("thunder");
}

// ---- rendering -------------------------------------------------------------------------------------------------------
function changed(name, sig) {
  if (run.sigs[name] === sig) return false;
  run.sigs[name] = sig;
  return true;
}

function drawPlate(scene, now) {
  const phase = new Map(scene.limbs.map((l) => [l.key, l.phase]));
  const fresh = new Set(scene.effects.filter((e) => e.kind === "heal" && now - e.at < FRESH_MS && e.at <= now).map((e) => e.limb));
  const shake = new Set(scene.effects.filter((e) => e.kind === "convulse" && now - e.at < FRESH_MS && phase.get(e.limb) === "ci-red").map((e) => e.limb));
  const limbs = run.creature.limbs.map((l) => (phase.get(limbKeyOf(l)) === "healed" ? { ...l, state: "Healed" } : l));
  const sig = JSON.stringify([limbs.map((l) => l.state), [...fresh], [...shake]]);
  if (!changed("plate", sig)) return;
  const lines = layoutPlate({ ...run.creature, limbs }, { repo: run.creature.repo });
  el.plate.textContent = "";
  lines.forEach((line, i) => {
    for (const seg of line.segments) {
      if (seg.state === undefined) { el.plate.appendChild(document.createTextNode(seg.text)); continue; }
      const span = document.createElement("span");
      span.dataset.state = seg.state;
      span.dataset.limb = seg.limb;
      if (fresh.has(seg.limb)) span.className = "just-healed";
      else if (shake.has(seg.limb)) span.className = "convulsing";
      span.textContent = seg.text;
      el.plate.appendChild(span);
    }
    if (i < lines.length - 1) el.plate.appendChild(document.createTextNode("\n"));
  });
}

function drawBosses(scene) {
  const sig = JSON.stringify(scene.bosses.map((b) => [b.key, Math.round(b.hp * 1000), b.healed]));
  if (!changed("bosses", sig)) return;
  el.bossList.textContent = "";
  if (scene.bosses.length === 0) {
    const li = document.createElement("li");
    li.className = "muted";
    li.textContent = "No possessed limbs on the slab.";
    el.bossList.appendChild(li);
    return;
  }
  for (const b of scene.bosses) {
    const li = document.createElement("li");
    const row = document.createElement("div");
    row.className = "boss-name";
    const name = document.createElement("span");
    name.textContent = b.name;
    const hp = document.createElement("span");
    hp.textContent = b.healed ? "HEALED" : "HP " + Math.round(b.hp * 100);
    row.append(name, hp);
    const bar = document.createElement("div");
    bar.className = "bar" + (b.healed ? " healed" : "");
    bar.setAttribute("role", "progressbar");
    bar.setAttribute("aria-label", b.name + " boss HP");
    bar.setAttribute("aria-valuemin", "0");
    bar.setAttribute("aria-valuemax", "100");
    bar.setAttribute("aria-valuenow", String(Math.round(b.hp * 100)));
    const fill = document.createElement("span");
    fill.style.width = Math.round(b.hp * 100) + "%";
    bar.appendChild(fill);
    li.append(row, bar);
    el.bossList.appendChild(li);
  }
}

function drawFeed(scene) {
  if (!changed("feed", JSON.stringify(scene.feed))) return;
  el.feed.textContent = "";
  for (const text of scene.feed) {
    const li = document.createElement("li");
    li.textContent = text;
    if (text.includes("rejected")) li.className = "rejected";
    else if (text.includes(" healed")) li.className = "healed";
    el.feed.appendChild(li);
  }
  if (scene.feed.length === 0) {
    const li = document.createElement("li");
    li.className = "muted";
    li.textContent = run.mode === "simulated" ? "The scripted raid starts in a few seconds." : "Waiting for the first crypt/ pull request.";
    el.feed.appendChild(li);
  }
}

function drawBadges(scene, now) {
  const list = badgesFor(scene, run.limbs, now, run.scanStart);
  if (!changed("badges", JSON.stringify(list))) return;
  el.badges.textContent = "";
  for (const b of list) {
    const li = document.createElement("li");
    li.dataset.earned = String(b.earned);
    li.textContent = (b.earned ? "EARNED  " : "OPEN    ") + b.title;
    el.badges.appendChild(li);
  }
}

function recapData(scene) { return recapFor(scene, run.limbs, run.creature.repo || run.repoId); }

async function showRecap(scene) {
  await ensureFonts();
  drawCard(recapData(scene), el.recapCanvas);
  el.recap.hidden = false;
}

function render(now) {
  const visible = run.mode === "simulated" ? run.events.filter((e) => e.at <= now) : run.events;
  const scene = sceneFrom(visible, run.limbs, now, { raidStart: run.t0 });
  run.scene = scene;
  // New effects: thunder and flash once per heal, the rejection line while a limb stays red.
  for (const fx of scene.effects) {
    const id = fx.kind + ":" + fx.limb + ":" + fx.at;
    if (run.seen.has(id)) continue;
    run.seen.add(id);
    if (fx.kind === "heal" && now - fx.at < FRESH_MS) { flash(); thunder(); }
  }
  const red = scene.limbs.some((l) => l.phase === "ci-red");
  el.rejection.textContent = red ? scene.effects.find((e) => e.kind === "convulse")?.line ?? "" : "";
  drawPlate(scene, now);
  drawBosses(scene);
  el.score.textContent = String(Math.round(scene.score * 10) / 10);
  el.clock.textContent = scene.clock;
  el.combo.textContent = "x" + scene.combo.multiplier + (scene.combo.chain > 1 ? " streak " + scene.combo.chain : "");
  el.comboNote.textContent = scene.combo.chain > 1 ? "healing together keeps the multiplier" : "heal limbs close together to build a streak";
  drawFeed(scene);
  drawBadges(scene, now);
  if (!run.done && scene.remainingMs <= 0) { run.done = true; showRecap(scene); }
}

// ---- simulated mode --------------------------------------------------------------------------------------------------
function startSimulated() {
  stopLive();
  run.mode = "simulated";
  run.t0 = Date.now();
  run.events = simulatedTimeline(run.limbs, run.t0);
  resetView();
  setBanner();
  el.pollNote.textContent = "weekly 15-minute raid (scripted)";
  if (!el.status.textContent) say("Replaying the scripted raid. Add a GitHub repo below to watch a real one.");
  startTicker();
}

function resetView() {
  run.seen = new Set();
  run.sigs = {};
  run.done = false;
  run.scene = null;
  el.recap.hidden = true;
}

function startTicker() {
  clearInterval(run.timer);
  render(Date.now());
  run.timer = setInterval(() => render(Date.now()), TICK_MS);
}

// ---- live mode: GET only, rate limit aware ---------------------------------------------------------------------------
function stopLive() { run.gen++; clearTimeout(run.pollTimer); run.pollTimer = null; }

async function getJson(req) {
  const res = await fetch(API + req.url, { method: "GET", headers: req.headers });
  return { res, body: res.ok ? await res.json() : null };
}

async function pollOnce() {
  const gen = run.gen;
  const now = Date.now();
  let decision = rateLimitDecision({}, now, run.token !== "");
  try {
    const events = [];
    for (const repo of run.repos) {
      const [req] = pollPlan(repo, run.token);
      if (!req) continue;
      const { res, body } = await getJson(req);
      if (gen !== run.gen) return;
      decision = rateLimitDecision(res.headers, Date.now(), run.token !== "");
      run.quota = res.headers.get("x-ratelimit-remaining");
      if (!res.ok || !Array.isArray(body)) {
        say(res.status === 404 ? "GitHub did not find " + repo + ". Check the name, or add a token for a private repo." : "GitHub answered HTTP " + res.status + ". Keeping the last known state; the next poll is scheduled.");
        throw new Error("poll");
      }
      for (const pull of body) {
        // Merges from before this page opened are not raid progress: skip them.
        const mergedAt = Date.parse(pull?.merged_at ?? "");
        if (Number.isFinite(mergedAt) && mergedAt < run.t0) continue;
        const evs = eventsFromPull(pull, run.limbs);
        events.push(...evs);
        const opened = evs.find((e) => e.type === "pr-opened");
        const sha = pull?.head?.sha;
        if (opened && !evs.some((e) => e.type === "human-merged") && pull.state === "open") {
          const cr = checkRunsRequest(repo, sha, run.token);
          if (!cr) continue;
          const r = await getJson(cr);
          if (gen !== run.gen) return;
          decision = rateLimitDecision(r.res.headers, Date.now(), run.token !== "");
          run.quota = r.res.headers.get("x-ratelimit-remaining");
          if (r.body) events.push(...eventsFromCheckRuns(r.body, opened.limb, opened.pr, Date.now()));
        }
      }
    }
    if (gen !== run.gen) return;
    run.events = events;
    say("Live. Quota left: " + (run.quota ?? "unknown") + ". Read only: a human merges.");
  } catch (e) {
    if (gen !== run.gen) return;
    if (e instanceof Error && e.message !== "poll") say("The network did not answer. Keeping the last known state; the next poll is scheduled.");
  }
  run.nextPollAt = Date.now() + decision.delayMs;
  if (decision.limited) say("GitHub rate limit reached. Polling resumes at " + new Date(run.nextPollAt).toLocaleTimeString() + ".");
  el.pollNote.textContent = "next poll in " + Math.round(decision.delayMs / 1000) + " s, quota " + (run.quota ?? "unknown");
  run.pollTimer = setTimeout(pollOnce, decision.delayMs);
}

async function startLive(repos) {
  const ids = [];
  const creatures = [];
  try {
    const index = await (await fetch("game/index.json")).json();
    for (const repo of repos) {
      const slug = repo.toLowerCase().replace("/", "__");
      const known = repo.toLowerCase() === "e-1305/crypt-demo" ? "demo" : Array.isArray(index) && index.some((e) => e.slug === slug) ? slug : null;
      if (!known) { say("No scanned creature for " + repo + " yet. Run crypt raid on it first, or pick e-1305/crypt-demo."); return; }
      ids.push(known);
      creatures.push(await loadCreature(known));
    }
  } catch {
    say("The creature could not be loaded. Reload the page to try again.");
    return;
  }
  stopLive();
  run.mode = "live";
  run.repos = repos;
  run.creature = creatures[0];
  run.limbs = creatures[0].limbs; // one repo per live raid: limb keys carry no repo, so a second repo could heal the wrong limb
  run.t0 = Date.now();
  run.events = [];
  resetView();
  setBanner();
  say("Connecting to GitHub (read only).");
  startTicker();
  pollOnce();
}

function parseRepos(text) {
  const out = [];
  for (const part of String(text).split(",")) {
    const r = part.trim();
    if (/^[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}$/.test(r) && !r.startsWith(".") && !r.includes("..")) out.push(r);
    else if (r !== "") return null;
  }
  return out.length === 1 ? out : null;
}

// ---- wiring ----------------------------------------------------------------------------------------------------------
el.sound.addEventListener("click", () => {
  run.soundOn = !run.soundOn;
  el.sound.setAttribute("aria-pressed", String(run.soundOn));
  el.sound.textContent = run.soundOn ? "Turn thunder sound off" : "Turn thunder sound on";
  if (run.soundOn && reduceMotion()) say("Reduced motion is on, so thunder stays silent.");
});
$("recap-open").addEventListener("click", () => { if (run.scene) showRecap(run.scene); });
$("recap-download").addEventListener("click", () => { if (run.scene) downloadCard(recapData(run.scene)); });
$("replay").addEventListener("click", () => { if (run.limbs.length) { say(""); startSimulated(); } });
$("live-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const repos = parseRepos(el.repoInput.value);
  if (!repos) { say("Enter one repo as owner/name."); return; }
  run.token = el.tokenInput.value.trim();
  el.tokenInput.value = "";
  startLive(repos);
});
window.addEventListener("pagehide", () => { run.token = ""; el.tokenInput.value = ""; });

async function boot() {
  try {
    run.creature = await loadCreature("demo");
  } catch {
    say("The demo creature could not be loaded. Reload the page to try again.");
    return;
  }
  run.limbs = run.creature.limbs;
  const wanted = new URLSearchParams(location.search).get("repo");
  if (wanted) {
    const repos = parseRepos(wanted);
    if (repos) { el.repoInput.value = repos.join(","); await startLive(repos); if (run.mode === "live") return; }
    else say("The repo in the address is not owner/name. Enter it below.");
  }
  startSimulated();
}

boot();
