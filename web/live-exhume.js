// Paste your repo (first 60 seconds): DOM glue around js/web/live-exhume.js. The only network code of the page that
// reaches outside its own files lives here: raw.githubusercontent.com (the lockfile) and api.osv.dev, called by the module.
// Everything is shown with textContent. Nothing is written anywhere: the pull request payloads are dry runs.
// Limbs and owners from CODEOWNERS only, no person is named. Failsafe: any error shows a message and no creature.
import { liveExhume, LiveExhumeError, dryRunLabel } from "./js/web/live-exhume.js";
import { parseFeedSnapshot } from "./js/web/feed-snapshot.js";
import { parseRepoUrl, repoSlug } from "./js/web/repo-url.js";

const $ = (id) => document.getElementById(id);
const MAX_LIMB_ROWS = 12;

function el(tag, text, cls) {
  const e = document.createElement(tag);
  if (text !== undefined) e.textContent = text;
  if (cls) e.className = cls;
  return e;
}

async function loadFeeds(fetchFn) {
  try {
    const res = await fetchFn("feeds.json");
    if (!res.ok) return null;
    return parseFeedSnapshot(await res.text());
  } catch {
    return null;
  }
}

/** Who owns a limb: CODEOWNERS only, else "unowned". */
function ownerText(limb) {
  return limb.owner && limb.owner !== "" ? limb.owner : "unowned";
}

function stateText(limb) {
  if (limb.unknown) return "Unknown (not checked)";
  return limb.state;
}

function renderResult(root, r, gallery) {
  root.textContent = "";
  root.appendChild(el("h2", "Your creature: " + r.repo));
  const plate = el("pre", r.plate, "plate");
  plate.setAttribute("role", "img");
  plate.setAttribute("aria-label", "Plate of " + r.repo + ". " + (r.summary.length ? r.summary.join("; ") : "No limbs spawn."));
  root.appendChild(plate);
  root.appendChild(el("p", r.summary.length === 0 ? "No limbs spawn for this repo." : "Limbs that spawn: " + r.summary.join("; ") + "."));

  root.appendChild(el("h3", "Ranked limbs"));
  const ol = el("ol", undefined, "paste-limbs");
  r.limbs.slice(0, MAX_LIMB_ROWS).forEach((l) => {
    const flags = [l.kev ? "KEV" : "", l.epss !== null && l.epss !== undefined ? "EPSS " + l.epss.toFixed(2) : ""].filter(Boolean).join(", ");
    ol.appendChild(el("li", l.name + " " + l.version + ": " + stateText(l) + (flags ? " (" + flags + ")" : "") + ", owner " + ownerText(l) + (l.spawned ? ", spawned" : "")));
  });
  root.appendChild(ol);
  if (r.limbs.length > MAX_LIMB_ROWS) root.appendChild(el("p", "and " + (r.limbs.length - MAX_LIMB_ROWS) + " more in the lockfile.", "muted"));

  root.appendChild(el("h3", "Owners from CODEOWNERS"));
  const owners = el("ul", undefined, "paste-owners");
  if (r.owners.length === 0) owners.appendChild(el("li", "No manifest found."));
  r.owners.forEach((o) => owners.appendChild(el("li", o.manifest + ": " + o.owner)));
  root.appendChild(owners);

  root.appendChild(el("h3", "Dry-run pull requests"));
  const label = dryRunLabel(r.repo);
  if (r.payloads.length === 0) root.appendChild(el("p", "No limb spawns, so no pull request is drafted."));
  r.payloads.forEach((p) => {
    const box = el("div", undefined, "paste-payload");
    if (p.status === "ready") {
      box.appendChild(el("p", p.limb + ": " + p.title, "paste-payload-title"));
      box.appendChild(el("p", label, "paste-payload-label"));
      box.appendChild(el("pre", "Branch: " + p.branch + "\nFiles: " + p.files.join(", ") + "\n\n" + p.body, "payload"));
    } else {
      box.appendChild(el("p", p.limb + ": no pull request. " + p.reason));
      box.appendChild(el("p", label, "paste-payload-label"));
    }
    root.appendChild(box);
  });
  if (r.payloadsOmitted > 0) root.appendChild(el("p", r.payloadsOmitted + " more spawned limbs wait for the next run, five pull requests at a time.", "muted"));

  root.appendChild(el("h3", "Play"));
  const ref = parseRepoUrl("https://github.com/" + r.repo);
  const hit = ref ? gallery.find((g) => g.slug === repoSlug(ref)) : null;
  const actions = el("p", undefined, "paste-actions");
  const play = el("a", hit ? "Play its crypt" : "Play the demo crypt", "paste-play");
  play.href = hit ? "?creature=" + encodeURIComponent(hit.slug) : "./?theatre=2d";
  actions.appendChild(play);
  root.appendChild(actions);
  if (!hit) {
    root.appendChild(el("p", "To play your own creature, generate its crypt on your machine:", "muted"));
    root.appendChild(el("code", "npx @e-1305/crypt raid https://github.com/" + r.repo, "paste-cmd"));
  }
  root.appendChild(el("p", "Feed date: KEV " + String(r.feeds.kev).slice(0, 10) + ", EPSS " + String(r.feeds.epss).slice(0, 10) + ". The web version reads npm projects only (package-lock.json).", "muted"));
  r.notes.filter((n) => !n.includes("npm projects only")).forEach((n) => root.appendChild(el("p", n, "muted")));
  root.hidden = false;
}

export function initPaste({ announce, gallery = [], fetchFn = (...a) => fetch(...a), navigate = (q) => { location.search = q; } }) {
  const open = $("paste-open");
  const form = $("paste-form");
  const input = $("paste-url");
  const status = $("paste-status");
  const result = $("paste-result");
  if (!open || !form || !input) return { run: async () => {} };
  let busy = false;

  function reveal() {
    form.hidden = false;
    open.setAttribute("aria-expanded", "true");
    input.focus({ preventScroll: true });
  }
  open.addEventListener("click", () => { if (form.hidden) reveal(); else input.focus({ preventScroll: true }); });

  async function run(text) {
    if (busy) return;
    const ref = parseRepoUrl(text);
    if (!ref) {
      status.textContent = "Enter an address like https://github.com/owner/repo.";
      announce(status.textContent);
      return;
    }
    // The 3D bench has no room for results: continue on the plain page, which runs the same code.
    if (document.body.classList.contains("theatre")) {
      navigate("?theatre=2d&repo=" + encodeURIComponent(ref.owner + "/" + ref.repo));
      return;
    }
    busy = true;
    result.hidden = true;
    result.textContent = "";
    $("paste-go").disabled = true;
    status.textContent = "Reading " + ref.owner + "/" + ref.repo + ": lockfile, then OSV and the KEV and EPSS snapshot. Large lockfiles can take 30 seconds or more.";
    announce(status.textContent);
    try {
      const feeds = await loadFeeds(fetchFn);
      const r = await liveExhume(text, { fetch: fetchFn, feeds });
      renderResult(result, r, gallery);
      status.textContent = "Done: " + r.repo + " has " + r.limbs.length + " dependencies and " + r.limbs.filter((l) => l.spawned).length + " spawned limbs.";
      announce(status.textContent);
      result.scrollIntoView?.({ block: "nearest" });
    } catch (err) {
      // Fail safe: no creature is drawn, nothing is shown as healthy.
      result.hidden = true;
      result.textContent = "";
      status.textContent = err instanceof LiveExhumeError ? err.message : "The repo could not be read, so no creature is shown. Check the address and try again in a minute.";
      announce(status.textContent);
    } finally {
      busy = false;
      $("paste-go").disabled = false;
    }
  }

  form.addEventListener("submit", (ev) => { ev.preventDefault(); run(input.value); });

  // ?repo=owner/repo (from the 3D bench or a shared link) runs once on load.
  const wanted = new URLSearchParams(location.search).get("repo");
  if (wanted) {
    reveal();
    input.value = "https://github.com/" + wanted;
    run(input.value);
  }
  return { run };
}
