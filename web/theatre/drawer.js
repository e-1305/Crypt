// The bench drawer (Epic B1 + A3). In the 3D theatre the page panes are visually replaced by the canvas,
// so the A3 actions get real, visible, keyboard-reachable controls here: download the playable report and
// exhume (open) a public repo from the gallery. The drawer holds no logic of its own. Each control
// forwards to the page element that app.js already wires, so 2D and 3D behave the same.
import { wireCopy } from "../copy.js";

export function makeDrawer() {
  const downloadBtn = document.getElementById("download");
  const lookupForm = document.getElementById("lookup-form");
  const lookupInput = document.getElementById("lookup");
  const lookupStatus = document.getElementById("lookup-status");
  const nameEl = document.getElementById("creature-name");

  const root = document.createElement("section");
  root.id = "bench-drawer";
  root.setAttribute("aria-labelledby", "bench-drawer-h");
  root.innerHTML =
    '<button id="bench-drawer-toggle" type="button" aria-expanded="false" aria-controls="bench-drawer-body">Bench drawer</button>' +
    '<div id="bench-drawer-body" hidden>' +
    '<h2 id="bench-drawer-h">Bench drawer</h2>' +
    '<p class="drawer-pitch">CRYPT finds security holes that matter in your code's building blocks, opens one fix, and a person approves it.</p>' +
    '<div class="drawer-install"><span>Try it on your own repo:</span><code id="bench-install-cmd">npx @e-1305/crypt raid &lt;path-or-github-url&gt;</code>' +
    '<button id="bench-install-copy" type="button">Copy command</button></div>' +
    '<p><a id="bench-kiro" href="manual.html#how-it-works" target="_blank" rel="noopener">Built with Kiro: specs, steering and hooks (opens in a new tab)</a></p>' +
    '<p><a id="bench-graveyard" href="graveyard/graveyard.html" target="_blank" rel="noopener">The Graveyard (new tab)</a></p>' +
    '<p><a id="bench-war-room" href="war-room.html" target="_blank" rel="noopener">War Room (new tab)</a> <a id="bench-autopsy" href="autopsy.html" target="_blank" rel="noopener">CISO report, sample (new tab)</a></p>' +
    '<p class="muted">On the screen: <span id="bench-drawer-creature"></span>.</p>' +
    '<button id="bench-download" type="button">Download the playable report</button>' +
    '<form id="bench-exhume" autocomplete="off">' +
    '<label for="bench-exhume-url">Exhume a public repo (GitHub address)</label>' +
    '<input id="bench-exhume-url" type="text" spellcheck="false" placeholder="https://github.com/owner/repo">' +
    '<button type="submit">Exhume</button>' +
    "</form>" +
    '<p id="bench-exhume-status" class="muted" role="status"></p>' +
    '<p><a id="bench-demo" href="./">Back to the demo creature</a></p>' +
    "</div>";
  document.body.appendChild(root);

  const toggle = root.querySelector("#bench-drawer-toggle");
  const body = root.querySelector("#bench-drawer-body");
  const dl = root.querySelector("#bench-download");
  const form = root.querySelector("#bench-exhume");
  const url = root.querySelector("#bench-exhume-url");
  const status = root.querySelector("#bench-exhume-status");
  const creature = root.querySelector("#bench-drawer-creature");
  const listeners = [];
  const say = (t) => { const a = document.getElementById("announcer"); if (a) { a.textContent = ""; setTimeout(() => { a.textContent = t; }, 50); } };
  wireCopy(root.querySelector("#bench-install-copy"), root.querySelector("#bench-install-cmd"), say);
  const on = (t, ev, fn) => { t.addEventListener(ev, fn); listeners.push([t, ev, fn]); };

  const setOpen = (open) => {
    toggle.setAttribute("aria-expanded", String(open));
    body.hidden = !open;
    root.classList.toggle("open", open);
    document.body.classList.toggle("drawer-open", open);
    if (open) dl.focus();
    else toggle.focus();
    root.dispatchEvent(new CustomEvent("drawer", { detail: { open } }));
  };
  const sync = () => {
    dl.disabled = downloadBtn.disabled;
    creature.textContent = nameEl.textContent;
    status.textContent = lookupStatus.textContent;
  };
  on(toggle, "click", () => setOpen(body.hidden));
  on(root, "keydown", (e) => { if (e.key === "Escape" && !body.hidden) setOpen(false); });
  on(dl, "click", () => downloadBtn.click());
  on(form, "submit", (e) => {
    e.preventDefault();
    lookupInput.value = url.value;
    lookupForm.requestSubmit();
    sync();
  });
  const obs = new MutationObserver(sync);
  obs.observe(downloadBtn, { attributes: true, attributeFilter: ["disabled"] });
  obs.observe(nameEl, { childList: true, characterData: true, subtree: true });
  obs.observe(lookupStatus, { childList: true, characterData: true, subtree: true });
  sync();

  return {
    root,
    isOpen: () => !body.hidden,
    onChange: (fn) => on(root, "drawer", (e) => fn(e.detail.open)),
    dispose() {
      obs.disconnect();
      document.body.classList.remove("drawer-open");
      for (const [t, ev, fn] of listeners) t.removeEventListener(ev, fn);
      root.remove();
    },
  };
}
