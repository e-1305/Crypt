// The raid (Epic B2): DOM glue around the pure logic in js/theatre/raid.js and card.js.
// One team score, no per-person figures, no leaderboard. The same readout feeds the 2D page and the 3D wall board.
import { RAID_MS, createRaidTimer, formatClock, healedCount, nightsWithoutPossession, praiseLines, rankFor, teamScore, countsForScore } from "./js/theatre/raid.js";
import { cardData } from "./js/theatre/card.js";
import { COMBO_WINDOW_MS, bossLimbs, comboState, rankProgress, styleBonus, trophies, vitals } from "./js/theatre/gamify.js";
import { pressureLabel, pressureWarning, spreadPressure } from "./js/theatre/onboarding.js";
import { downloadCard } from "./theatre/card-draw.js";

const $ = (id) => document.getElementById(id);
const keyOf = (l) => l.ecosystem + ":" + l.name;

export function initRaid({ store, announce, onRunning, now = () => Date.now() }) {
  const timer = createRaidTimer(now);
  let limbs = [];
  let repo = "";
  let baseline = new Set();
  let card = null;
  let interval = 0;
  let warned = false;
  // Game feel (gamify.js). Team-wide: heal times carry no person. Everything shown here also exists as plain text.
  let healTimes = [];
  let counted = null; // keys that counted for the score at the last setLimbs; null until the first list arrives
  let shown = 0; // the value the animated risk counter currently shows
  let lastPop = "";
  const shelfEls = [];
  const reduced = () => document.body?.classList?.contains("hc") === true || window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches === true;
  function pulse(cls, ms) {
    if (reduced()) return;
    const b = document.body;
    if (!b?.classList) return;
    b.classList.toggle(cls, false);
    b.classList.toggle(cls, true);
    setTimeout(() => b.classList.toggle(cls, false), ms);
  }

  // Fallback: this browser's first visit. The team's shared scanStart (creature.json team.scanStart) wins when present.
  const localScanStart = (() => {
    const t = store.get("crypt.scanStart");
    if (typeof t === "number") return t;
    store.set("crypt.scanStart", now());
    return now();
  })();
  let sharedScanStart = null;
  const scanStart = () => (sharedScanStart ?? localScanStart);

  // The reraise step turns a healed limb into a plain Healthy one (no KEV, no vulns). Remember what it was.
  function remember(list) {
    const risk = store.get("crypt.risk") || {};
    const first = store.get("crypt.firstSeen") || {};
    const done = store.get("crypt.resolvedAt") || {};
    const out = list.map((l) => {
      const k = keyOf(l);
      const sick = l.state === "Possessed" || l.state === "Rotting";
      if (sick) {
        risk[k] = { epss: typeof l.epss === "number" ? l.epss : null, kev: l.kev === true };
        if (typeof first[k] !== "number") first[k] = now();
        delete done[k];
        return l;
      }
      if (l.healed === true || l.state === "Healed") {
        if (typeof done[k] !== "number") done[k] = now();
        const r = risk[k] || {};
        return { ...l, epss: r.epss ?? l.epss, kev: r.kev === true, detectedAt: first[k], resolvedAt: done[k] };
      }
      return l;
    });
    store.set("crypt.risk", risk);
    store.set("crypt.firstSeen", first);
    store.set("crypt.resolvedAt", done);
    // KEV limbs still open carry their first-seen time for the counter.
    return out.map((l) => (typeof l.detectedAt === "number" ? l : { ...l, detectedAt: first[keyOf(l)] }));
  }

  function setText(id, text) { const el = $(id); if (el && el.textContent !== text) el.textContent = text; }

  function render() {
    const v = timer.view();
    const score = teamScore(limbs);
    setText("raid-timer", v.status === "idle" ? formatClock(RAID_MS) : formatClock(v.remainingMs));
    setText("raid-state", v.status === "idle" ? "Ready. Start the raid when the team is together." : v.status === "running" ? "Raid in progress." : "Raid complete.");
    setText("raid-score", "Team risk removed: " + score.toFixed(2));
    setText("raid-rank", "Rank: " + rankFor(healedCount(limbs)));
    setText("raid-nights", "Nights Without Possession (counted from " + (sharedScanStart === null ? "this browser's first visit" : "the team's first scan") + "): " + nightsWithoutPossession(limbs, now(), scanStart()));
    setText("raid-praise", praiseLines(limbs).join("; "));
    const start = $("raid-start");
    if (start) start.disabled = v.status === "running";
    const dl = $("raid-download");
    if (dl) dl.hidden = card === null;
    setText("raid-epitaph", card ? card.epitaph : "");
    setText("raid-card", card ? "Limbs healed: " + card.limbsHealed + ". Risk removed: " + card.riskRemoved + ". Time: " + card.time + ". Grade: " + card.grade + "." + (card.trophies.length ? " Trophies: " + card.trophies.join(", ") + "." : "") : "");
    renderGame(v, score);
    renderPressure(v);
    document.documentElement.dataset.raid = v.status;
  }

  function setStyle(id, name, value) { $(id)?.style?.setProperty?.(name, value); }

  // Animated counter: counts up with requestAnimationFrame, or shows the final value at once with reduced motion.
  function countTo(target) {
    const el = $("raid-counter");
    if (!el) return;
    const from = shown;
    shown = target;
    if (reduced() || typeof requestAnimationFrame !== "function" || target <= from) { el.textContent = target.toFixed(2); return; }
    const t0 = typeof performance !== "undefined" ? performance.now() : 0;
    const step = (t) => {
      if (shown !== target) return; // a newer count started
      const p = Math.min(1, (t - t0) / 700);
      el.textContent = (from + (target - from) * p).toFixed(2);
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  function renderGame(v, score) {
    const healed = healedCount(limbs);
    const combo = comboState(healTimes, COMBO_WINDOW_MS, now());
    const vit = vitals(limbs);
    const bosses = bossLimbs(limbs);
    const bonus = styleBonus(score, combo.multiplier);
    setText("raid-vitals", "Creature health " + vit.health + " of 100. Heartbeat " + vit.bpm + " beats per minute.");
    $("raid-health")?.setAttribute("aria-valuenow", String(vit.health));
    setStyle("raid-health", "--pct", vit.health + "%");
    setStyle("raid-heart", "--beat", (60 / vit.bpm).toFixed(2) + "s");
    if (score !== shown) countTo(score);
    const prog = rankProgress(healed);
    setText("raid-next", prog.next ? "Next rank: " + prog.next + " in " + prog.need + (prog.need === 1 ? " heal." : " heals.") : "Top rank reached.");
    setText("raid-combo", combo.chain > 0
      ? "Combo x" + combo.multiplier.toFixed(1) + ", chain of " + combo.chain + ". Style bonus +" + bonus.toFixed(2) + "."
      : "Combo: none. Heal two limbs within 90 seconds to start a chain.");
    const bossText = bosses.length === 0 ? "" : bosses.map((b) => (countsForScore(b) ? "Boss slain: " : "Boss: ") + b.name).join(". ") + ".";
    setText("raid-boss", bossText);
    const bossEl = $("raid-boss");
    if (bossEl) bossEl.hidden = bossText === "";
    const shelf = trophies(limbs, { healed: gainedCount(), elapsedMs: v.elapsedMs, nights: nightsWithoutPossession(limbs, now(), scanStart()), bestChain: combo.best });
    const list = $("raid-trophies");
    if (list) {
      shelf.forEach((t, i) => {
        if (!shelfEls[i]) { shelfEls[i] = document.createElement("li"); list.appendChild(shelfEls[i]); }
        shelfEls[i].textContent = (t.earned ? "Earned: " : "Locked: ") + t.title + ". " + t.description;
        shelfEls[i].dataset.earned = t.earned ? "true" : "false";
      });
    }
    const got = shelf.filter((t) => t.earned).map((t) => t.title);
    setText("raid-shelf", "Trophies " + got.length + " of " + shelf.length + (got.length ? ": " + got.join(", ") : ""));
    setText("raid-pop", lastPop);
    setText("raid-grade", card ? "Grade: " + card.grade : "");
  }

  // Possession pressure (G3): display only, never part of the score. The same facts show as text and a progress bar.
  const openKev = () => limbs.filter((l) => l.kev === true && (l.state === "Possessed" || l.state === "Rotting")).length;
  function renderPressure(v) {
    const level = v.status === "idle" ? 0 : spreadPressure(v.elapsedMs, openKev());
    const pct = Math.round(level * 100);
    setText("raid-pressure-text", pressureLabel(level, openKev()));
    $("raid-pressure")?.setAttribute("aria-valuenow", String(pct));
    setStyle("raid-pressure", "--pct", pct + "%");
    const warn = v.status === "running" ? pressureWarning(v.remainingMs) : null;
    setText("raid-warning", warn ?? "");
    const el = $("raid-warning");
    if (el) el.hidden = warn === null;
    if (warn !== null && warn !== lastWarn) { lastWarn = warn; if (v.remainingMs > 60000) announce(warn); }
  }
  let lastWarn = "";

  function gainedCount() { return limbs.filter((l) => countsForScore(l) && !baseline.has(keyOf(l))).length; }

  // Called when the list changes: one chain entry per limb that newly counts for the score.
  function noteHeals(before) {
    if (before === null) return;
    const fresh = limbs.filter((l) => countsForScore(l) && !before.has(keyOf(l)));
    if (fresh.length === 0) return;
    const bossKeys = new Set(bossLimbs(limbs).map(keyOf));
    for (const l of fresh) {
      healTimes.push(now());
      const gain = teamScore([l]);
      lastPop = "+" + gain.toFixed(2) + " risk removed (" + l.name + ")";
      const combo = comboState(healTimes, COMBO_WINDOW_MS, now());
      const slain = bossKeys.has(keyOf(l));
      if (timer.view().status === "running") {
        announce((slain ? "Boss slain: " + l.name + ". " : "Healed " + l.name + ". ") + "Plus " + gain.toFixed(2) + " risk removed." + (combo.chain > 1 ? " Chain of " + combo.chain + ", multiplier x" + combo.multiplier.toFixed(1) + "." : ""));
      }
      pulse(slain ? "fx-flash" : "fx-pop", slain ? 900 : 500);
      if (slain) pulse("fx-shake", 600);
    }
  }

  function finish() {
    clearInterval(interval);
    interval = 0;
    const v = timer.view();
    const gained = limbs.filter((l) => countsForScore(l) && !baseline.has(keyOf(l)));
    card = cardData(repo, gained, v.elapsedMs, { all: limbs, bestChain: comboState(healTimes).best, nights: nightsWithoutPossession(limbs, now(), scanStart()) });
    onRunning?.(false);
    announce("Raid complete. " + card.limbsHealed + " limbs healed. Risk removed " + card.riskRemoved + ". Grade " + card.grade + ". " + card.epitaph);
    render();
  }

  function tick() {
    const v = timer.view();
    if (v.status === "done") { finish(); return; }
    if (v.remainingMs <= 60000 && !warned) { warned = true; announce("One minute left in the raid."); }
    render();
  }

  function start() {
    if (timer.view().status === "running") return;
    timer.reset();
    card = null;
    baseline = new Set(limbs.filter(countsForScore).map(keyOf));
    timer.start();
    warned = false;
    lastWarn = "";
    healTimes = [];
    lastPop = "";
    const boss = bossLimbs(limbs).find((b) => !countsForScore(b));
    announce("Raid started. Fifteen minutes. Heal what you can." + (boss ? " A boss stirs: " + boss.name + ". Heal it to slay it." : ""));
    clearInterval(interval);
    interval = setInterval(tick, 250);
    onRunning?.(true);
    render();
  }

  $("raid-start")?.addEventListener("click", start);
  $("raid-download")?.addEventListener("click", () => { if (card) downloadCard(card); });
  render();

  return {
    setLimbs(list, name, team) {
      const t = team && typeof team === "object" ? team.scanStart : undefined;
      sharedScanStart = typeof t === "number" && Number.isFinite(t) && t > 0 && t <= now() ? t : null;
      limbs = remember(Array.isArray(list) ? list : []);
      noteHeals(counted);
      counted = new Set(limbs.filter(countsForScore).map(keyOf));
      if (typeof name === "string") repo = name;
      render();
    },
    start,
    now,
  };
}
