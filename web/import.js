// Import a scanner report (SARIF, Dependabot, Trivy, Grype, Snyk) by drag and drop or file input, inside the Bench drawer.
// The file is read with FileReader/Blob.text() and parsed here by js/web/import-glue.js. There is no fetch, XHR or form post
// of the file content anywhere in this file: the only request is feeds.json (the shipped KEV and EPSS snapshot).
// Everything is shown with textContent. No person is named. Failsafe: errors show a message and no creature; a limb
// that was not checked reads "Unknown (not checked)", never Healthy.
import { importInBrowser, ImportWebError, MAX_WEB_IMPORT_BYTES, PRIVACY_LINE } from "./js/web/import-glue.js";
import { parseFeedSnapshot } from "./js/web/feed-snapshot.js";
import { withGhost } from "./js/web/ghost-lines.js";

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

function stateText(g) {
  return g.unknown ? "Unknown (not checked)" : g.state;
}

function groupName(g) {
  return g.versions.length > 1 ? g.name + " \u00d7" + g.versions.length + " versions (" + g.versions.join(", ") + ")" : g.name + " " + (g.versions[0] || "unknown");
}

export function renderImport(root, r) {
  root.textContent = "";
  root.appendChild(el("h3", "Your creature: " + r.name + " (" + r.format + ")"));
  const plate = el("pre", r.plate, "plate");
  plate.setAttribute("role", "img");
  plate.setAttribute("aria-label", "Plate of " + r.name + ". " + (r.summary.length ? r.summary.join("; ") : "No limbs spawn."));
  root.appendChild(plate);
  root.appendChild(el("p", r.summary.length === 0 ? "No limbs spawn for this file." : "Limbs that spawn: " + r.summary.join("; ") + "."));
  root.appendChild(el("h3", "Ranked limbs"));
  const ol = el("ol", undefined, "paste-limbs import-limbs");
  r.groups.slice(0, MAX_LIMB_ROWS).forEach((g) => {
    const flags = [g.kev ? "KEV" : "", g.epss !== null && g.epss !== undefined ? "EPSS " + g.epss.toFixed(2) : ""].filter(Boolean).join(", ");
    ol.appendChild(el("li", groupName(g) + ": " + stateText(g) + (flags ? " (" + flags + ")" : "") + (g.spawned ? ", spawned" : "")));
  });
  root.appendChild(ol);
  if (r.groups.length > MAX_LIMB_ROWS) root.appendChild(el("p", "and " + (r.groups.length - MAX_LIMB_ROWS) + " more packages in the file.", "muted"));
  root.appendChild(el("p", "Feed date: KEV " + String(r.feeds.kev).slice(0, 10) + ", EPSS " + String(r.feeds.epss).slice(0, 10) + ". Ranked by KEV and EPSS, not by the vendor severity.", "muted"));
  root.hidden = false;
}

export function initImport({ announce = () => {}, fetchFn = (...a) => fetch(...a) } = {}) {
  const input = $("import-file");
  const drop = $("import-drop");
  const format = $("import-format");
  const status = $("import-status");
  const result = $("import-result");
  if (!input || !drop || !status || !result) return { run: async () => {} };
  let busy = false;

  function fail(msg) {
    result.hidden = true;
    result.textContent = "";
    status.textContent = msg;
    announce(msg);
  }

  async function run(file) {
    if (busy || !file) return;
    busy = true;
    result.hidden = true;
    result.textContent = "";
    try {
      if (file.size > MAX_WEB_IMPORT_BYTES) throw new ImportWebError("This file is larger than 5 MB, so it was not read. Export a smaller report or use the CLI: npx @e-1305/crypt exhume --from.");
      status.textContent = "Reading " + file.name + ". " + PRIVACY_LINE;
      const text = await file.text();
      const feeds = await loadFeeds(fetchFn);
      const r = importInBrowser({ text, file: file.name, format: format ? format.value : "auto", feeds });
      renderImport(result, r);
      status.textContent = "Done: " + r.groups.length + " packages from " + file.name + ", " + r.groups.filter((g) => g.spawned).length + " spawned. " + PRIVACY_LINE;
      announce(status.textContent);
    } catch (err) {
      fail(withGhost(undefined, err instanceof ImportWebError ? err.message : "The file could not be read, so no creature is shown."));
    } finally {
      busy = false;
    }
  }

  input.addEventListener("change", () => { run(input.files && input.files[0]); });
  ["dragenter", "dragover"].forEach((t) => drop.addEventListener(t, (ev) => { ev.preventDefault(); drop.classList.add("over"); }));
  ["dragleave", "drop"].forEach((t) => drop.addEventListener(t, (ev) => { ev.preventDefault(); drop.classList.remove("over"); }));
  drop.addEventListener("drop", (ev) => { run(ev.dataTransfer && ev.dataTransfer.files && ev.dataTransfer.files[0]); });
  return { run };
}
