// The raid (Epic B2): DOM glue around the pure logic in js/theatre/raid.js and card.js.
// One team score, no per-person figures, no leaderboard. The same readout feeds the 2D page and the 3D wall board.
import { RAID_MS, createRaidTimer, formatClock, healedCount, isRaidCommand, nightsWithoutPossession, praiseLines, rankFor, teamScore, countsForScore } from "./js/theatre/raid.js";
import { cardData } from "./js/theatre/card.js";
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

  const scanStart = (() => {
    const t = store.get("crypt.scanStart");
    if (typeof t === "number") return t;
    store.set("crypt.scanStart", now());
    return now();
  })();

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
    setText("raid-nights", "Nights Without Possession: " + nightsWithoutPossession(limbs, now(), scanStart));
    setText("raid-praise", praiseLines(limbs).join("; "));
    const start = $("raid-start");
    if (start) start.disabled = v.status === "running";
    const dl = $("raid-download");
    if (dl) dl.hidden = card === null;
    setText("raid-epitaph", card ? card.epitaph : "");
    setText("raid-card", card ? "Limbs healed: " + card.limbsHealed + ". Risk removed: " + card.riskRemoved + ". Time: " + card.time + "." : "");
    document.documentElement.dataset.raid = v.status;
  }

  function finish() {
    clearInterval(interval);
    interval = 0;
    const v = timer.view();
    const gained = limbs.filter((l) => countsForScore(l) && !baseline.has(keyOf(l)));
    card = cardData(repo, gained, v.elapsedMs);
    onRunning?.(false);
    announce("Raid complete. " + card.limbsHealed + " limbs healed. Risk removed " + card.riskRemoved + ". " + card.epitaph);
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
    announce("Raid started. Fifteen minutes. Heal what you can.");
    clearInterval(interval);
    interval = setInterval(tick, 250);
    onRunning?.(true);
    render();
  }

  $("raid-start")?.addEventListener("click", start);
  $("raid-download")?.addEventListener("click", () => { if (card) downloadCard(card); });
  render();

  return {
    setLimbs(list, name) {
      limbs = remember(Array.isArray(list) ? list : []);
      if (typeof name === "string") repo = name;
      render();
    },
    /** Called with the typed text before it is submitted. Returns true when it was the RAID command. */
    handleCommand(text) {
      if (!isRaidCommand(text)) return false;
      start();
      return true;
    },
    start,
    now,
  };
}
