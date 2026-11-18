// Paste your repo (first 60 seconds): DOM glue around js/web/live-exhume.js. The only network code of the page that
// reaches outside its own files lives here: raw.githubusercontent.com (the lockfile) and api.osv.dev, called by the module.
// Everything is shown with textContent. Nothing is written anywhere: the pull request payloads are dry runs.
// Limbs and owners from CODEOWNERS only, no person is named. Failsafe: any error shows a message and no creature.
import { liveExhume, LiveExhumeError, PROGRESS_STEPS, dryRunLabel, ownerLabel } from "./js/web/live-exhume.js";
import { noiseFunnel, funnelText, funnelOwners } from "./js/web/noise-funnel.js";
import { parseFeedSnapshot } from "./js/web/feed-snapshot.js";
import { mountCardPanel } from "./card/panel.js";
import { parseRepoUrl, repoFromQuery, repoSlug } from "./js/web/repo-url.js";

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

/** Who owns a limb: CODEOWNERS only, else "no owner yet". */
function ownerText(limb) {
  return ownerLabel(limb.owner);
}

function stateText(limb) {
  if (limb.unknown) return "Unknown (not checked)";
  return limb.state;
}

/** One list row per package: "lodash x4 versions (2.4.2, 4.17.4, ...)" or "lodash 4.17.21". */
function groupName(g) {
  return g.versions.length > 1 ? g.name + " \u00d7" + g.versions.length + " versions (" + g.versions.join(", ") + ")" : g.name + " " + (g.versions[0] || "unknown");
}

/** The link that reopens this scan: the site root with ?repo=owner/name (the name was validated by parseRepoUrl). */
function shareLink(repo) {
  const u = new URL(location.href);
  u.search = "?repo=" + repo;
  u.hash = "";
  return u.href;
}

function renderResult(root, r, gallery, announce = () => {}) {
  root.textContent = "";
  const isDemo = r.repo.toLowerCase() === "e-1305/crypt-demo";
  const badge = el("p", isDemo ? "This is the example repo (e-1305/crypt-demo), not your own. Paste your repo above to see yours." : "This is the repo you pasted: " + r.repo + ". It is not the demo creature.", "paste-source");
  badge.id = "paste-source";
  root.appendChild(badge);
  root.appendChild(el("h2", "Your creature: " + r.repo));
  const plate = el("pre", r.plate, "plate");
  plate.setAttribute("role", "img");
  plate.setAttribute("aria-label", "Plate of " + r.repo + ". " + (r.summary.length ? r.summary.join("; ") : "No limbs spawn."));
  root.appendChild(plate);
  root.appendChild(el("p", r.summary.length === 0 ? "No limbs spawn for this repo." : "Limbs that spawn: " + r.summary.join("; ") + "."));

  const funnel = noiseFunnel(r.limbs);
  const fp = el("p", funnelText(funnel), "paste-funnel");
  fp.id = "paste-funnel";
  root.appendChild(fp);
  const ownersLine = el("p", "Owners from CODEOWNERS: " + funnelOwners(r.limbs).join(", "), "paste-funnel-owners");
  ownersLine.id = "paste-funnel-owners";
  root.appendChild(ownersLine);

  root.appendChild(el("h3", "Share your creature"));
  const link = shareLink(r.repo);
  const row = el("div", undefined, "paste-share-row");
  const shareBtn = el("button", "Share");
  shareBtn.type = "button";
  shareBtn.id = "paste-share";
  const linkText = el("code", link, "paste-share-link");
  linkText.id = "paste-share-link";
  const shareNote = el("p", "", "muted");
  shareNote.setAttribute("role", "status");
  row.appendChild(shareBtn);
  row.appendChild(linkText);
  root.appendChild(row);
  root.appendChild(shareNote);
  const share = el("div", undefined, "paste-share");
  root.appendChild(share);
  // A public repo read here: the repo toggle starts ON. Only counts and limb names reach the card, never owners.
  mountCardPanel(share, { variant: "creature", source: "paste", creature: r.creature }, { announce });
  shareBtn.addEventListener("click", async () => {
    let copied = false;
    try { await navigator.clipboard.writeText(link); copied = true; } catch { /* the link stays visible next to the button */ }
    shareNote.textContent = (copied ? "Link copied: it reopens this scan. " : "Copy the link shown next to the button. ") + "Download or copy the card below to post it.";
    announce(shareNote.textContent);
    share.scrollIntoView?.({ block: "nearest" });
  });

  root.appendChild(el("h3", "Ranked limbs"));
  const ol = el("ol", undefined, "paste-limbs");
  r.groups.slice(0, MAX_LIMB_ROWS).forEach((g) => {
    const flags = [g.kev ? "KEV" : "", g.epss !== null && g.epss !== undefined ? "EPSS " + g.epss.toFixed(2) : ""].filter(Boolean).join(", ");
    ol.appendChild(el("li", groupName(g) + ": " + stateText(g) + (flags ? " (" + flags + ")" : "") + ", " + g.kind + ", " + ownerText(g) + (g.spawned ? ", spawned" : "")));
  });
  root.appendChild(ol);
  if (r.groups.length > MAX_LIMB_ROWS) root.appendChild(el("p", "and " + (r.groups.length - MAX_LIMB_ROWS) + " more packages in the lockfile.", "muted"));

  root.appendChild(el("h3", "Owners from CODEOWNERS"));
  const owners = el("ul", undefined, "paste-owners");
  if (r.owners.length === 0) owners.appendChild(el("li", "No manifest found."));
  r.owners.forEach((o) => owners.appendChild(el("li", o.manifest + ": " + ownerLabel(o.owner))));
  root.appendChild(owners);

  root.appendChild(el("h3", "Dry-run pull requests"));
  const label = dryRunLabel(r.repo);
  if (r.payloads.length === 0) root.appendChild(el("p", "No limb spawns, so no pull request is drafted."));
  r.payloads.forEach((p) => {
    const box = el("div", undefined, "paste-payload");
    if (p.status === "ready") {
      box.appendChild(el("p", p.limb + ": " + p.title, "paste-payload-title"));
      box.appendChild(el("p", label, "paste-payload-label"));
      box.appendChild(el("pre", "Branch: " + p.branch + "\nFiles: " + p.files.join(", ") + "\nDependency: " + p.kind + (p.kind === "transitive" ? " (overrides)" : "") + "\n\n" + p.body, "payload"));
    } else {
      box.appendChild(el("p", p.limb + ": no pull request. " + p.reason));
      box.appendChild(el("p", label, "paste-payload-label"));
    }
    root.appendChild(box);
  });
  if (r.payloadsOmitted > 0) root.appendChild(el("p", r.payloadsOmitted + " more spawned packages wait for the next run, five pull requests at a time.", "muted"));

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
  const form = $("paste-form");
  const input = $("paste-url");
  const status = $("paste-status");
  const result = $("paste-result");
  if (!form || !input) return { run: async () => {} };
  let busy = false;

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
    status.textContent = "Reading " + ref.owner + "/" + ref.repo + ". Large lockfiles can take 30 seconds or more.";
    announce(status.textContent);
    const onProgress = (step) => {
      status.textContent = step + " (" + (PROGRESS_STEPS.indexOf(step) + 1) + " of " + PROGRESS_STEPS.length + ")...";
      announce(status.textContent);
    };
    try {
      const feeds = await loadFeeds(fetchFn);
      const r = await liveExhume(text, { fetch: fetchFn, feeds, onProgress });
      renderResult(result, r, gallery, announce);
      status.textContent = "Done: " + r.repo + " has " + r.groups.length + " packages (" + r.limbs.length + " installed copies) and " + r.groups.filter((g) => g.spawned).length + " spawned limbs.";
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

  const chip = $("paste-example");
  if (chip) chip.addEventListener("click", () => { input.value = "https://github.com/e-1305/crypt-demo"; run(input.value); });
  form.addEventListener("submit", (ev) => { ev.preventDefault(); run(input.value); });

  // ?repo=owner/repo (from the 3D bench or a shared link) runs once on load.
  // Only an exact owner/name runs; anything else shows a message and nothing is fetched.
  const wanted = new URLSearchParams(location.search).get("repo");
  if (wanted !== null) {
    const ref = repoFromQuery(wanted);
    if (ref) {
      input.value = "https://github.com/" + ref.owner + "/" + ref.repo;
      run(input.value);
    } else {
      status.textContent = "The shared link has no valid owner/name. Paste a GitHub address like https://github.com/owner/repo.";
      announce(status.textContent);
    }
  }
  return { run };
}
