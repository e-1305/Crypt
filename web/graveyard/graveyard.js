// The graveyard page (Epic D1). One tomb per repository, drawn on a 2D canvas, with a list view and a screen reader table.
// Inputs: A (repositories scanned here, queued, cached in sessionStorage), B (census.json built with the site, the offline
// default), C (a graveyard.json file or ?src=). Everything runs in this browser; nothing is uploaded.
// All text goes in with textContent. Owners are CODEOWNERS teams only, no person is named. Views are user chosen and never
// rank one repo against another: the default order is alphabetical.
import { buildTombs, sortTombs, filterTombs, ownerTeams, layoutTombs, fromExhume, parseGraveyard, slugOf, ownerLabel as teamLabel, NO_OWNER } from "../js/graveyard/model.js";
import { createQueue, parseRepoList, estimateRequests, readCache, writeCache, MAX_REPOS_PER_RUN, HOURLY_LIMIT } from "../js/graveyard/queue.js";
import { liveExhume, LiveExhumeError, dryRunLabel } from "../js/web/live-exhume.js";
import { parseFeedSnapshot } from "../js/web/feed-snapshot.js";

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const MAX_DRAWN = 120;
const MAX_LIMB_ROWS = 12;
const MAX_FILE_BYTES = 5_000_000;
const COLOR = { ok: "#33ff33", "at-risk": "#ffb000", breached: "#ff6a3d" };
const SLA_TEXT = { ok: "within SLA", "at-risk": "SLA at risk", breached: "SLA breached" };
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

const S = {
  records: [], // RepoRecord[] of the current data set
  now: Date.now(),
  tombs: [], // tombs in view order after sort and filter
  all: [], // every tomb of the data set, alphabetical
  places: [],
  rects: [], // CSS pixel hit boxes, same order as tombs
  live: new Map(), // slug -> panel data from a live scan
  hover: -1,
  record: false,
  list: false,
  dirty: true,
  queue: null,
  feeds: null,
  opener: null,
};

function el(tag, text, cls) {
  const e = document.createElement(tag);
  if (text !== undefined) e.textContent = text;
  if (cls) e.className = cls;
  return e;
}

function store() {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

const say = (t) => { $("status").textContent = t; };

// ---- numbers shown for each tomb: its own data only ------------------------------------------------------------

/** Absolute buckets of one repo's own score. Not a comparison with other repos. */
function riskBucket(risk) {
  return risk < 0.5 ? "low" : risk < 3 ? "medium" : "high";
}

function tombSummary(t) {
  const parts = [SLA_TEXT[t.sla], "exploitable risk " + riskBucket(t.risk) + " (" + t.risk.toFixed(2) + ")", t.possessed + " possessed", t.rotting + " rotting"];
  if (t.ghosts > 0) parts.push(t.ghosts + " unowned");
  parts.push("owner " + t.owner);
  return parts.join(", ");
}

// ---- data set ---------------------------------------------------------------------------------------------------

function setRecords(records, now) {
  S.records = records;
  S.now = now;
  S.all = buildTombs(records, now);
  const sel = $("filter-owner");
  const keep = sel.value;
  sel.textContent = "";
  const all = el("option", "All");
  all.value = "";
  sel.appendChild(all);
  for (const o of ownerTeams(S.all)) {
    const op = el("option", o);
    op.value = o;
    sel.appendChild(op);
  }
  sel.value = ownerTeams(S.all).includes(keep) ? keep : "";
  applyView();
}

function applyView() {
  const f = {};
  if ($("filter-sla").value) f.sla = $("filter-sla").value;
  if ($("filter-owner").value) f.owner = $("filter-owner").value;
  S.tombs = sortTombs(filterTombs(S.all, f), S.record ? "name" : $("sort").value);
  renderTable();
  renderCards();
  layout();
  if (S.all.length === 0) say("No repositories to show yet.");
  else say(S.tombs.length + " of " + S.all.length + " repositories shown. Views of each repo's own data.");
}

// ---- screen reader table and cards -----------------------------------------------------------------------------

function renderTable() {
  const body = $("sr-body");
  body.textContent = "";
  for (const t of S.tombs) {
    const tr = document.createElement("tr");
    const th = el("th", t.repo);
    th.scope = "row";
    tr.appendChild(th);
    [SLA_TEXT[t.sla], riskBucket(t.risk) + " (" + t.risk.toFixed(2) + ")", String(t.possessed), String(t.rotting), String(t.ghosts), t.owner].forEach((v) => tr.appendChild(el("td", v)));
    body.appendChild(tr);
  }
}

function renderCards() {
  const ul = $("cards");
  ul.textContent = "";
  for (const t of S.tombs) {
    const li = el("li", undefined, "gy-card sla-" + t.sla);
    const b = el("button", t.repo);
    b.type = "button";
    b.setAttribute("aria-label", t.repo + ". " + tombSummary(t) + ". Open details.");
    b.addEventListener("click", () => openPanel(t, b));
    li.appendChild(b);
    li.appendChild(el("p", SLA_TEXT[t.sla] + " | exploitable risk " + riskBucket(t.risk)));
    li.appendChild(el("p", t.possessed + " possessed, " + t.rotting + " rotting, " + t.ghosts + " unowned"));
    li.appendChild(el("p", "Owner: " + t.owner));
    ul.appendChild(li);
  }
}

// ---- scene ------------------------------------------------------------------------------------------------------

const canvas = $("scene");
const ctx = canvas.getContext ? canvas.getContext("2d") : null;
let W = 0;
let H = 0;

function colsFor(w) {
  return Math.max(2, Math.min(8, Math.floor(w / (S.record ? 190 : 150))));
}

function layout() {
  const stage = $("scene-wrap");
  W = Math.max(280, stage.clientWidth || 280);
  const drawn = S.tombs.slice(0, MAX_DRAWN);
  const cols = colsFor(W);
  const rows = Math.max(1, Math.ceil(drawn.length / cols));
  const rowH = S.record ? Math.max(150, Math.floor((innerHeight - 120) / rows)) : 150;
  H = Math.max(S.record ? innerHeight - 70 : 360, 110 + rows * rowH);
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.style.height = H + "px";
  canvas.width = Math.floor(W * dpr);
  canvas.height = Math.floor(H * dpr);
  if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  S.places = layoutTombs(drawn, cols, 0);
  S.geo = drawn.map((t, i) => geometry(t, S.places[i]));
  buildButtons(drawn);
  S.dirty = true;
}

/** Drawing numbers for one tomb. Size follows the repo's own risk, glow its possessed limbs. */
function geometry(t, p) {
  const k = (S.record ? 1.3 : 1) * (0.7 + 0.5 * Math.min(1, t.risk / 5));
  const top = 100;
  const cx = p.x * W;
  const base = top + 40 + p.y * (H - top - 70);
  const tw = 38 * k;
  const th = 50 * k;
  const ch = 18 + Math.min(34, (t.possessed + t.rotting) * 4) * k;
  return { cx, base, tw, th, ch, tilt: p.tilt };
}

function buildButtons(drawn) {
  const ul = $("tombs");
  ul.textContent = "";
  S.rects = [];
  drawn.forEach((t, i) => {
    const g = S.geo[i];
    const w = Math.max(48, g.tw + 20);
    const x = Math.max(0, Math.min(W - w, g.cx - w / 2));
    const y = g.base - g.th - g.ch - 6;
    const h = Math.max(48, g.th + g.ch + 30);
    S.rects.push({ x, y, w, h });
    const li = el("li");
    li.style.left = x + "px";
    li.style.top = y + "px";
    li.style.width = w + "px";
    li.style.height = h + "px";
    const b = el("button");
    b.type = "button";
    b.setAttribute("aria-label", t.repo + ". " + tombSummary(t) + ". Open details.");
    b.addEventListener("click", () => openPanel(t, b));
    b.addEventListener("mouseenter", () => showTip(i));
    b.addEventListener("focus", () => showTip(i));
    b.addEventListener("mouseleave", hideTip);
    b.addEventListener("blur", hideTip);
    li.appendChild(b);
    ul.appendChild(li);
  });
}

function showTip(i) {
  const t = S.tombs[i];
  const r = S.rects[i];
  if (!t || !r) return;
  const tip = $("tip");
  tip.textContent = t.repo + ": " + tombSummary(t) + ".";
  tip.hidden = false;
  tip.style.left = Math.max(4, Math.min(W - 290, r.x + r.w / 2 - 120)) + "px";
  tip.style.top = Math.max(4, r.y - tip.offsetHeight - 6) + "px";
  S.hover = i;
  S.dirty = true;
}

function hideTip() {
  $("tip").hidden = true;
  S.hover = -1;
  S.dirty = true;
}

function tombPath(c, g) {
  const x = -g.tw / 2;
  const r = g.tw / 2;
  c.beginPath();
  c.moveTo(x, 0);
  c.lineTo(x, -g.th + r);
  c.arc(0, -g.th + r, r, Math.PI, 0);
  c.lineTo(g.tw / 2, 0);
  c.closePath();
}

/** Shape cue for the SLA state, so colour is never the only signal: ring = ok, triangle = at risk, cross = breached. */
function slaGlyph(c, sla, size) {
  c.beginPath();
  if (sla === "ok") c.arc(0, 0, size, 0, Math.PI * 2);
  else if (sla === "at-risk") {
    c.moveTo(0, -size);
    c.lineTo(size, size * 0.8);
    c.lineTo(-size, size * 0.8);
    c.closePath();
  } else {
    c.moveTo(-size, -size);
    c.lineTo(size, size);
    c.moveTo(size, -size);
    c.lineTo(-size, size);
  }
  c.stroke();
}

function drawGhost(c, x, y, s) {
  c.beginPath();
  c.arc(x, y, s, Math.PI, 0);
  c.lineTo(x + s, y + s);
  c.lineTo(x + s / 2, y + s * 0.6);
  c.lineTo(x, y + s);
  c.lineTo(x - s / 2, y + s * 0.6);
  c.lineTo(x - s, y + s);
  c.closePath();
  c.fill();
}

function draw(time) {
  if (!ctx) return;
  const c = ctx;
  const sky = c.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, "#02040a");
  sky.addColorStop(0.7, "#08140d");
  sky.addColorStop(1, "#0a1a0c");
  c.fillStyle = sky;
  c.fillRect(0, 0, W, H);
  // stars (fixed positions, slow twinkle)
  c.fillStyle = "#cfe8d0";
  for (let i = 0; i < 70; i++) {
    const x = (i * 7919) % Math.max(1, Math.floor(W));
    const y = (i * 104729) % 90;
    c.globalAlpha = 0.35 + 0.25 * Math.sin(time * 0.0007 + i);
    c.fillRect(x, y, 1.5, 1.5);
  }
  c.globalAlpha = 1;
  // moon
  const mx = W - 70;
  const halo = c.createRadialGradient(mx, 52, 6, mx, 52, 60);
  halo.addColorStop(0, "rgba(220,255,220,.55)");
  halo.addColorStop(1, "rgba(220,255,220,0)");
  c.fillStyle = halo;
  c.fillRect(mx - 62, 0, 124, 114);
  c.fillStyle = "#e8ffe8";
  c.beginPath();
  c.arc(mx, 52, 20, 0, Math.PI * 2);
  c.fill();
  // ground
  c.fillStyle = "#06100a";
  c.fillRect(0, 130, W, H - 130);

  S.tombs.slice(0, MAX_DRAWN).forEach((t, i) => {
    const g = S.geo[i];
    if (!g) return;
    const color = COLOR[t.sla];
    c.save();
    c.translate(g.cx, g.base);
    c.rotate((g.tilt * Math.PI) / 180);
    // creature rising: one tendril per finding, sway slowly
    c.strokeStyle = color;
    c.lineWidth = 2;
    c.globalAlpha = 0.85;
    const n = Math.max(1, Math.min(6, t.possessed + t.rotting));
    for (let k = 0; k < n; k++) {
      const off = (k - (n - 1) / 2) * (g.tw / Math.max(2, n));
      const sway = Math.sin(time * 0.0012 + i + k) * 5;
      c.beginPath();
      c.moveTo(off, -g.th + 4);
      c.bezierCurveTo(off + sway, -g.th - g.ch * 0.4, off - sway, -g.th - g.ch * 0.7, off + sway * 1.5, -g.th - g.ch);
      c.stroke();
    }
    c.globalAlpha = 1;
    // glow: possessed limbs
    c.shadowColor = t.glow === 0 ? "rgba(0,0,0,0)" : "#ff6a3d";
    c.shadowBlur = t.glow * 9 + (S.hover === i ? 8 : 0);
    c.fillStyle = "#101c14";
    c.strokeStyle = S.hover === i ? "#ffffff" : color;
    c.lineWidth = 2;
    tombPath(c, g);
    c.fill();
    c.shadowBlur = 0;
    c.stroke();
    // state glyph on the face
    c.save();
    c.translate(0, -g.th * 0.45);
    c.lineWidth = 2;
    slaGlyph(c, t.sla, g.tw * 0.18);
    c.restore();
    c.restore();
    // ghosts: unowned limbs, small sprites and a count
    if (t.ghosts > 0) {
      c.fillStyle = "rgba(220,255,220,.8)";
      const gy = g.base - g.th - g.ch * 0.6 + Math.sin(time * 0.001 + i) * 3;
      drawGhost(c, g.cx + g.tw / 2 + 12, gy, 6);
      c.font = "bold " + (S.record ? 16 : 11) + "px JetBrains Mono, monospace";
      c.textAlign = "left";
      c.fillText("x" + t.ghosts, g.cx + g.tw / 2 + 21, gy + 4);
    }
    // name
    c.fillStyle = "#33ff33";
    c.font = (S.record ? 15 : 11) + "px JetBrains Mono, monospace";
    c.textAlign = "center";
    const maxChars = Math.floor((W / colsFor(W) - 8) / (S.record ? 9 : 6.6));
    const name = t.repo.length > maxChars ? t.repo.slice(0, Math.max(3, maxChars - 1)) + "\u2026" : t.repo;
    c.fillText(name, g.cx, g.base + 16);
  });
  // fog: soft drifting bands
  for (let f = 0; f < 3; f++) {
    const drift = Math.sin(time * (S.record ? 0.00006 : 0.00015) + f * 2) * 40;
    const fy = 150 + f * (H / 4);
    const gr = c.createLinearGradient(0, fy - 40, 0, fy + 40);
    gr.addColorStop(0, "rgba(120,200,140,0)");
    gr.addColorStop(0.5, "rgba(120,200,140,.07)");
    gr.addColorStop(1, "rgba(120,200,140,0)");
    c.fillStyle = gr;
    c.fillRect(drift - 40, fy - 40, W + 80, 80);
  }
  if (S.tombs.length > MAX_DRAWN) {
    c.fillStyle = "#22b022";
    c.font = "12px JetBrains Mono, monospace";
    c.textAlign = "left";
    c.fillText("Scene shows the first " + MAX_DRAWN + " of " + S.tombs.length + ". The list view shows all.", 10, H - 8);
  }
}

function frame(time) {
  if (!S.list && (S.dirty || !reduced)) {
    draw(reduced ? 0 : time);
    S.dirty = false;
  }
  requestAnimationFrame(frame);
}

canvas.addEventListener("mousemove", (ev) => {
  const b = canvas.getBoundingClientRect();
  const x = ev.clientX - b.left;
  const y = ev.clientY - b.top;
  const i = S.rects.findIndex((r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h);
  if (i !== S.hover) (i < 0 ? hideTip : showTip)(i);
});

// ---- panel ------------------------------------------------------------------------------------------------------

function rankedLimbs(rec) {
  const order = { Possessed: 0, Rotting: 1 };
  return [...rec.limbs].sort((a, b) => order[a.state] - order[b.state] || (b.epss ?? 0) - (a.epss ?? 0) || (a.name < b.name ? -1 : 1));
}

function renderLimbs(root, rec) {
  root.appendChild(el("h3", "Ranked limbs"));
  if (rec.limbs.length === 0) {
    root.appendChild(el("p", "No limbs spawn for this repo."));
    return;
  }
  const ol = el("ol");
  rankedLimbs(rec).slice(0, MAX_LIMB_ROWS).forEach((l) => {
    const flags = [l.kev ? "KEV" : "", l.epss !== null ? "EPSS " + l.epss.toFixed(2) : ""].filter(Boolean).join(", ");
    ol.appendChild(el("li", l.name + ": " + l.state + (flags ? " (" + flags + ")" : "") + ", " + (rec.ownersKnown ? teamLabel(l.owner) : NO_OWNER)));
  });
  root.appendChild(ol);
  if (rec.limbs.length > MAX_LIMB_ROWS) root.appendChild(el("p", "and " + (rec.limbs.length - MAX_LIMB_ROWS) + " more limbs.", "gy-muted"));
}

function renderPayloads(root, repo, payloads, omitted) {
  root.appendChild(el("h3", "Dry-run grafts"));
  const label = dryRunLabel(repo);
  if (payloads.length === 0) root.appendChild(el("p", "No limb spawns, so no graft is drafted."));
  payloads.forEach((p) => {
    const box = el("div");
    if (p.status === "ready") {
      box.appendChild(el("p", p.limb + ": " + p.title));
      box.appendChild(el("p", label, "gy-dry"));
      box.appendChild(el("pre", "Branch: " + p.branch + "\nFiles: " + p.files.join(", ") + "\nDependency: " + p.kind + "\n\n" + p.body));
    } else {
      box.appendChild(el("p", p.limb + ": no graft. " + p.reason));
      box.appendChild(el("p", label, "gy-dry"));
    }
    root.appendChild(box);
  });
  if (omitted > 0) root.appendChild(el("p", omitted + " more spawned packages wait for the next run, five grafts at a time.", "gy-muted"));
}

function compactLive(r) {
  return {
    plate: r.plate,
    summary: r.summary,
    omitted: r.payloadsOmitted,
    payloads: r.payloads.slice(0, 5).map((p) => (p.status === "ready" ? { status: "ready", limb: p.limb, title: p.title, branch: p.branch, files: p.files, kind: p.kind, body: String(p.body).slice(0, 1500) } : { status: "no-fix", limb: p.limb, reason: p.reason })),
  };
}

function openPanel(t, opener) {
  S.opener = opener || null;
  const rec = S.records.find((r) => r.repo === t.repo);
  const body = $("panel-body");
  body.textContent = "";
  $("panel-title").textContent = t.repo;
  body.appendChild(el("p", tombSummary(t) + "."));
  const live = S.live.get(t.slug);
  if (live) {
    const plate = el("pre", live.plate);
    plate.setAttribute("role", "img");
    plate.setAttribute("aria-label", "Plate of " + t.repo + ". " + (live.summary.length ? live.summary.join("; ") : "No limbs spawn."));
    body.appendChild(el("h3", "Plate"));
    body.appendChild(plate);
  } else {
    body.appendChild(el("p", t.findings === 0 ? "No limbs spawn for this repo." : "Limbs that spawn: " + t.possessed + " possessed and " + t.rotting + " rotting."));
  }
  if (rec) renderLimbs(body, rec);
  if (live) renderPayloads(body, t.repo, live.payloads, live.omitted);
  else {
    body.appendChild(el("h3", "Dry-run grafts"));
    body.appendChild(el("p", "Read this repo in your browser to draft grafts. Only npm repos with a package-lock.json are read. Nothing is written or sent.", "gy-muted"));
    const go = el("button", "Read " + t.repo + " for dry-run grafts");
    go.type = "button";
    go.disabled = S.record;
    go.addEventListener("click", () => readOne(t, go));
    body.appendChild(go);
  }
  $("panel").hidden = false;
  $("panel-title").focus();
}

function closePanel() {
  $("panel").hidden = true;
  if (S.opener && S.opener.isConnected) S.opener.focus();
  S.opener = null;
}

async function readOne(t, btn) {
  btn.disabled = true;
  say("Reading " + t.repo + ": lockfile, then OSV and the KEV and EPSS snapshot.");
  try {
    const r = await scanRepo(t.repo);
    S.live.set(t.slug, r.panel);
    say("Done: " + t.repo + ".");
    openPanel(t, S.opener);
  } catch (err) {
    btn.disabled = false;
    say(err instanceof LiveExhumeError ? err.message : "The repo could not be read, so nothing is drawn for it. Check the address and try again in a minute.");
  }
}

// ---- Input A: scan in the browser -------------------------------------------------------------------------------

async function getFeeds() {
  if (S.feeds) return S.feeds;
  try {
    const res = await fetch("../feeds.json");
    if (res.ok) S.feeds = parseFeedSnapshot(await res.text());
  } catch {
    S.feeds = null;
  }
  return S.feeds;
}

async function scanRepo(repo) {
  const feeds = await getFeeds();
  const r = await liveExhume("https://github.com/" + repo, { fetch: (...a) => fetch(...a), feeds });
  const record = fromExhume(r, Date.now());
  if (!record) throw new Error("The result for " + repo + " could not be read.");
  const out = { record, panel: compactLive(r) };
  writeCache(store(), repo, out);
  S.live.set(slugOf(record.repo), out.panel);
  return out;
}

function cachedRepo(repo) {
  const v = readCache(store(), repo, (x) => (x && typeof x === "object" && x.record && x.panel ? x : null));
  return v || null;
}

function startScan(text) {
  if (S.record) return;
  const list = parseRepoList(text, MAX_REPOS_PER_RUN);
  if (list.repos.length === 0) {
    say("Enter public GitHub addresses like owner/repo or https://github.com/owner/repo.");
    return;
  }
  const uncached = list.repos.filter((r) => cachedRepo(r) === null).length;
  const est = estimateRequests(uncached);
  const notes = [];
  if (list.rejected > 0) notes.push(list.rejected + " entries are not GitHub repository addresses and were skipped.");
  if (list.capped > 0) notes.push(list.capped + " more than " + MAX_REPOS_PER_RUN + " per run wait for the next run.");
  notes.push("Up to " + est.requests + " GitHub requests of " + HOURLY_LIMIT + " per hour" + (est.fits ? "." : ", so the run pauses and offers Resume."));
  $("estimate").textContent = notes.join(" ");
  const got = [];
  const bar = $("progress");
  bar.hidden = false;
  bar.setAttribute("aria-valuemax", String(list.repos.length));
  $("scan").disabled = true;
  $("resume").hidden = true;
  setView("scan");
  S.queue = createQueue({
    repos: list.repos,
    scan: async (repo) => (await scanRepo(repo)),
    cached: (repo) => {
      const c = cachedRepo(repo);
      if (c) S.live.set(slugOf(c.record.repo), c.panel);
      return c;
    },
    onResult: (_repo, r) => {
      got.push(r.record);
      setRecords([...got], Date.now());
    },
    onState: (s) => {
      bar.setAttribute("aria-valuenow", String(s.done));
      bar.setAttribute("aria-valuetext", s.done + " of " + s.total + " repositories");
      $("bar").style.width = (s.total === 0 ? 0 : Math.round((s.done / s.total) * 100)) + "%";
      renderNotScanned(s.failed);
      say(s.status === "running" ? "Reading " + s.done + " of " + s.total + ". " + s.message : s.message);
      $("resume").hidden = s.status !== "paused";
      $("scan").disabled = s.status === "running";
    },
  });
  S.queue.start().catch(() => {
    $("scan").disabled = false;
    say("The scan stopped unexpectedly. Check the addresses and choose Scan again. Finished repositories are kept in this tab.");
  });
}

/** Repos that could not be read are listed as "not scanned", never drawn as healthy. */
function renderNotScanned(failed) {
  const box = $("not-scanned");
  const ul = $("not-scanned-list");
  ul.textContent = "";
  for (const f of failed) ul.appendChild(el("li", f.repo + ": not scanned. " + f.message));
  box.hidden = failed.length === 0;
}

// ---- Input B and C ----------------------------------------------------------------------------------------------

function useDoc(doc, label, kind) {
  // Census data is judged as of its own scan time, so the demo does not age into breaches.
  const now = doc.source === "census" ? doc.repos.reduce((m, r) => Math.max(m, r.scannedAt), 0) : Date.now();
  S.live.clear();
  setRecords(doc.repos, now);
  setView(kind);
  say(label + ": " + doc.repos.length + " repositories. " + (doc.source === "census" ? "Public data of each repo as of its scan. " : "") + "Views of each repo's own data.");
}

async function loadCensus() {
  try {
    const res = await fetch("census.json");
    if (!res.ok) throw new Error("missing");
    const doc = parseGraveyard(await res.text());
    if (!doc) throw new Error("invalid");
    useDoc(doc, "Census graveyard", "census");
  } catch {
    setRecords([], Date.now());
    say("The census data is not part of this copy of the page. Load a graveyard.json or scan repositories instead.");
  }
}

async function loadSrc(src) {
  let u;
  try {
    u = new URL(src, location.href);
  } catch {
    say("That graveyard address is not valid.");
    return;
  }
  if (u.origin !== location.origin || !u.pathname.endsWith(".json")) {
    say("Only a graveyard.json next to this page can be loaded with ?src=. Use the file button for your own file.");
    return;
  }
  try {
    const res = await fetch(u.href);
    const doc = res.ok ? parseGraveyard(await res.text()) : null;
    if (!doc) throw new Error("invalid");
    useDoc(doc, "Graveyard file", "file");
  } catch {
    say("That file is not a graveyard.json this page can read. Create one with: crypt graveyard --org <org> --token-env GITHUB_TOKEN");
  }
}

function loadFile(file) {
  if (!file) return;
  if (file.size > MAX_FILE_BYTES) {
    say("That file is larger than 5 MB, so it is not a graveyard.json. Create one with: crypt graveyard --org <org> --token-env GITHUB_TOKEN");
    return;
  }
  const rd = new FileReader();
  rd.onload = () => {
    const doc = parseGraveyard(String(rd.result));
    if (!doc) say("That file is not a graveyard.json (schemaVersion 1). Create one with: crypt graveyard --org <org> --token-env GITHUB_TOKEN");
    else useDoc(doc, "Graveyard file " + file.name.slice(0, 60), "file");
  };
  rd.onerror = () => say("The file could not be read. Choose it again.");
  rd.readAsText(file);
}

// ---- controls, views, recording mode ---------------------------------------------------------------------------

function setView(kind) {
  $("load-census").setAttribute("aria-pressed", String(kind === "census"));
}

function setList(on) {
  S.list = on;
  $("scene-wrap").hidden = on;
  $("list-wrap").hidden = !on;
  $("view-toggle").textContent = on ? "Scene view" : "List view";
  $("view-toggle").setAttribute("aria-pressed", String(on));
  S.dirty = true;
}

function setRecord(on) {
  S.record = on;
  document.body.classList.toggle("record", on);
  $("record-on").setAttribute("aria-pressed", String(on));
  if (on) {
    if (S.list) setList(false);
    if (S.queue) S.queue = null;
  }
  applyView();
}

$("scan-form").addEventListener("submit", (ev) => {
  ev.preventDefault();
  startScan($("repos").value);
});
$("resume").addEventListener("click", () => {
  $("resume").hidden = true;
  if (S.queue) S.queue.resume();
});
$("load-census").addEventListener("click", () => { loadCensus(); });
$("file").addEventListener("change", (ev) => loadFile(ev.target.files && ev.target.files[0]));
$("view-toggle").addEventListener("click", () => setList(!S.list));
$("record-on").addEventListener("click", () => setRecord(!S.record));
$("sort").addEventListener("change", applyView);
$("filter-sla").addEventListener("change", applyView);
$("filter-owner").addEventListener("change", applyView);
$("panel-close").addEventListener("click", closePanel);
document.addEventListener("keydown", (ev) => {
  if (ev.key !== "Escape") return;
  if (!$("panel").hidden) closePanel();
  else if (S.record) setRecord(false);
});
let resizeTimer = 0;
window.addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(layout, 100);
});

// ---- start ------------------------------------------------------------------------------------------------------

if (!ctx) setList(true);
requestAnimationFrame(frame);
if (params.get("record") === "1") setRecord(true);
const wantedSrc = params.get("src");
const wantedRepos = params.get("repos");
if (wantedSrc) loadSrc(wantedSrc);
else if (wantedRepos && !S.record) {
  $("repos").value = wantedRepos.replace(/,/g, "\n");
  startScan(wantedRepos);
} else loadCensus();
