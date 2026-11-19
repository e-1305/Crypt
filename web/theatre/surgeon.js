// The surgeon's theatre on the 3D bench (issue #217): specimen jars on a shelf, the creature on the table,
// a tool tray, and one narrator line per step. Everything is driven by DOM signals (the transcript echo lines,
// the simulated CI buttons, crypt:fx, crypt:jar). The DOM stays the source of truth; the text commands still work.
// The narrator line also lives in a visually hidden aria-live element, because the canvas is aria-hidden.
import { MONO, onFontsReady } from "./font.js";
import { MAX_JARS, TOOLS, addJar, cleanLabel, narratorLine, takeDown, toolForCommand } from "../js/theatre/surgeon.js";

const DEMO_REPO = "e-1305/crypt-demo";
const LIFT_MS = 1200;
const START_LINE = "The creature is on the table. Type a command and its tool is lifted.";

function canvasOf(w, h) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

function repoFromName() {
  const t = document.getElementById("creature-name")?.textContent || "";
  const m = /\(([^()\s]+\/[^()\s]+)\)/.exec(t);
  return m ? m[1] : DEMO_REPO;
}

export function makeSurgeon(THREE, scene, { reduced = false } = {}) {
  const wood = new THREE.MeshStandardMaterial({ color: 0x3a2616, roughness: 0.8 });
  const metal = new THREE.MeshStandardMaterial({ color: 0x8a8578, roughness: 0.35, metalness: 0.8 });
  const steel = new THREE.MeshStandardMaterial({ color: 0x9a9a92, roughness: 0.3, metalness: 0.9 });
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x4a7a4a, transparent: true, opacity: 0.45, roughness: 0.1 });
  const root = new THREE.Group();
  scene.add(root);
  const textures = [];
  const track = (tex) => { tex.colorSpace = THREE.SRGBColorSpace; textures.push(tex); return tex; };

  // ---- Table and the creature on it.
  const table = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.12, 1.0), new THREE.MeshStandardMaterial({ color: 0x8c8c84, roughness: 0.5, metalness: 0.4 }));
  table.position.set(-0.9, 0.55, 0.75);
  root.add(table);
  const creature = new THREE.Group();
  const skin = new THREE.MeshStandardMaterial({ color: 0x5f7f55, roughness: 0.7 });
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.3, 16, 12), skin);
  body.scale.set(1.5, 0.6, 0.8);
  body.position.y = 0.2;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 12, 10), skin);
  head.position.set(-0.5, 0.28, 0);
  creature.add(body, head);
  for (const [x, z] of [[-0.25, 0.22], [-0.25, -0.22], [0.3, 0.22], [0.3, -0.22]]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.2, 8), skin);
    leg.position.set(x, 0.1, z);
    creature.add(leg);
  }
  creature.position.set(-1.15, 0.61, 0.75);
  root.add(creature);

  // ---- Shelf with jars. Plank on the bench top, jars stand on it; a jar goes to the table on scan.
  const plank = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.08, 0.6), wood);
  plank.position.set(-2.5, 0.52, -1.2);
  root.add(plank);
  const jarX = (i) => -4.2 + i * 0.7;
  const shelfPos = (i) => new THREE.Vector3(jarX(i), 0.82, -1.2);
  const tablePos = new THREE.Vector3(-0.2, 0.92, 0.9);
  let jars = [];
  const jarMeshes = new Map(); // repo -> { group, target }
  const liveTargets = () => {
    let k = 0;
    for (const j of jars) {
      const m = jarMeshes.get(j.repo);
      if (!m) continue;
      m.target.copy(j.place === "table" ? tablePos : shelfPos(k));
      if (j.place !== "table") k++;
      if (reduced) m.group.position.copy(m.target);
    }
  };
  function makeJar(repo) {
    const group = new THREE.Group();
    group.add(new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.5, 16), glassMat));
    const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.21, 0.05, 16), metal);
    lid.position.y = 0.27;
    group.add(lid);
    const c = canvasOf(256, 64);
    const draw = () => {
      const g = c.getContext("2d");
      g.fillStyle = "#e8dcb0";
      g.fillRect(0, 0, 256, 64);
      g.fillStyle = "#1b160c";
      g.textBaseline = "middle";
      g.textAlign = "center";
      g.font = "bold 26px " + MONO;
      g.fillText(repo, 128, 34, 240);
      tex.needsUpdate = true;
    };
    const tex = track(new THREE.CanvasTexture(c));
    draw();
    onFontsReady(draw);
    const label = new THREE.Mesh(new THREE.CylinderGeometry(0.205, 0.205, 0.17, 16, 1, true, -0.9, 1.8), new THREE.MeshBasicMaterial({ map: tex }));
    label.position.y = -0.02;
    group.add(label);
    root.add(group);
    return group;
  }
  function setJars(next) {
    jars = next;
    for (const j of jars) {
      if (!jarMeshes.has(j.repo)) {
        const group = makeJar(j.repo);
        group.position.copy(shelfPos(MAX_JARS - 1)).add(new THREE.Vector3(0, 0.6, 0));
        jarMeshes.set(j.repo, { group, target: new THREE.Vector3() });
      }
    }
    for (const [repo, m] of [...jarMeshes]) {
      if (!jars.some((j) => j.repo === repo)) { m.group.removeFromParent(); jarMeshes.delete(repo); }
    }
    liveTargets();
  }
  setJars(addJar([], DEMO_REPO));

  // ---- Tool tray: five tools standing in a rack. A label plate under each shows the text command.
  const trayX = 1.5, trayZ = 1.1;
  const tray = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.08, 0.55), wood);
  tray.position.set(trayX, 0.52, trayZ);
  root.add(tray);
  const tools = new Map();
  const mk = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); return m; };
  const makers = {
    scalpel: (g) => { g.add(mk(new THREE.BoxGeometry(0.05, 0.4, 0.03), metal, 0, 0.2, 0), mk(new THREE.BoxGeometry(0.03, 0.2, 0.01), steel, 0, 0.5, 0)); },
    needle: (g) => { g.add(mk(new THREE.CylinderGeometry(0.012, 0.012, 0.6, 6), steel, 0, 0.3, 0), mk(new THREE.TorusGeometry(0.04, 0.01, 6, 12), steel, 0, 0.58, 0)); },
    magnifier: (g) => { g.add(mk(new THREE.CylinderGeometry(0.03, 0.03, 0.3, 8), wood, 0, 0.15, 0), mk(new THREE.TorusGeometry(0.15, 0.025, 8, 20), metal, 0, 0.45, 0)); },
    lamp: (g) => { g.add(mk(new THREE.CylinderGeometry(0.1, 0.12, 0.3, 12), metal, 0, 0.15, 0), mk(new THREE.SphereGeometry(0.08, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffe2a0 }), 0, 0.4, 0)); },
    bell: (g) => { g.add(mk(new THREE.CylinderGeometry(0.06, 0.16, 0.26, 14), new THREE.MeshStandardMaterial({ color: 0xb08a3a, roughness: 0.35, metalness: 0.8 }), 0, 0.13, 0), mk(new THREE.SphereGeometry(0.04, 8, 6), metal, 0, 0.3, 0)); },
  };
  TOOLS.forEach((t, i) => {
    const g = new THREE.Group();
    makers[t.id](g);
    g.position.set(trayX - 1.2 + i * 0.6, 0.56, trayZ);
    root.add(g);
    tools.set(t.id, { group: g, baseY: 0.56, lift: 0 });
  });
  const plateC = canvasOf(1280, 96);
  const plateTex = track(new THREE.CanvasTexture(plateC));
  let active = null;
  function drawPlate() {
    const g = plateC.getContext("2d");
    g.fillStyle = "#14110c";
    g.fillRect(0, 0, 1280, 96);
    g.textAlign = "center";
    g.textBaseline = "middle";
    TOOLS.forEach((t, i) => {
      const cx = i * 256 + 128;
      if (t.id === active) { g.fillStyle = "#33ff33"; g.fillRect(i * 256 + 6, 6, 244, 84); }
      g.fillStyle = t.id === active ? "#0a1a0a" : "#d8c590";
      g.font = "bold 28px " + MONO;
      g.fillText(t.name, cx, 32, 236);
      g.fillStyle = t.id === active ? "#0a1a0a" : "#8c8366";
      g.font = "22px " + MONO;
      g.fillText(t.command, cx, 68, 236);
    });
    plateTex.needsUpdate = true;
  }
  drawPlate();
  onFontsReady(drawPlate);
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 0.24), new THREE.MeshBasicMaterial({ map: plateTex }));
  plate.position.set(trayX, 0.66, trayZ + 0.4);
  root.add(plate);

  // ---- Narrator: one plain line, drawn on the bench front, with a visually hidden live twin in the DOM.
  const twin = document.createElement("p");
  twin.id = "theatre-narrator";
  twin.className = "sr-only";
  twin.setAttribute("aria-live", "polite");
  document.body.appendChild(twin);
  const capC = canvasOf(1024, 96);
  const capTex = track(new THREE.CanvasTexture(capC));
  let line = "";
  function drawCaption() {
    const g = capC.getContext("2d");
    g.fillStyle = "#14110c";
    g.fillRect(0, 0, 1024, 96);
    g.strokeStyle = "#5a4a2a";
    g.lineWidth = 4;
    g.strokeRect(2, 2, 1020, 92);
    g.fillStyle = "#d8c590";
    g.textBaseline = "middle";
    g.font = "26px " + MONO;
    const words = line.split(" ");
    const rows = [""];
    for (const w of words) {
      const cur = rows[rows.length - 1];
      if ((cur + " " + w).trim().length > 60 && rows.length < 2) rows.push(w);
      else rows[rows.length - 1] = (cur + " " + w).trim();
    }
    rows.forEach((r, i) => g.fillText(r, 20, rows.length === 1 ? 48 : 30 + i * 36, 984));
    capTex.needsUpdate = true;
  }
  const caption = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 0.34), new THREE.MeshBasicMaterial({ map: capTex }));
  caption.position.set(2.2, 0.3, 1.64);
  root.add(caption);
  function say(text) {
    line = text;
    twin.textContent = text;
    drawCaption();
  }
  say(START_LINE);
  onFontsReady(drawCaption);

  // ---- Reactions.
  let liftTimer = 0;
  function pick(id) {
    if (!tools.has(id)) return;
    active = id;
    drawPlate();
    for (const [k, t] of tools) t.lift = k === id ? 1 : 0;
    if (reduced) for (const t of tools.values()) t.group.position.y = t.baseY + t.lift * 0.35;
    clearTimeout(liftTimer);
    liftTimer = setTimeout(() => {
      active = null;
      drawPlate();
      for (const t of tools.values()) { t.lift = 0; if (reduced) t.group.position.y = t.baseY; }
    }, LIFT_MS);
  }
  const scan = () => {
    const repo = repoFromName();
    jars = addJar(jars, repo);
    setJars(takeDown(jars, repo));
  };
  const onLine = (text) => {
    const m = /^> (.*)$/.exec(text);
    if (!m) return;
    const cmd = m[1];
    const tool = toolForCommand(cmd);
    if (!tool) return; // off grammar: nothing lifts, nothing changes
    pick(tool);
    const limb = cleanLabel(cmd.split(" ")[1] || "");
    if (cmd === "RAID") { scan(); say(narratorLine("scan")); }
    else if (cmd.startsWith("EXAMINE")) { scan(); say(narratorLine("examine", limb)); }
    else if (cmd.startsWith("GRAFT")) say(narratorLine("graft", limb));
    else if (cmd === "SEAL CRYPT") say(narratorLine("seal"));
  };
  const transcript = document.getElementById("transcript");
  const obs = new MutationObserver((records) => {
    for (const r of records) for (const n of r.addedNodes) {
      if (n instanceof HTMLElement && n.classList.contains("echo")) onLine(n.textContent || "");
    }
  });
  if (transcript) obs.observe(transcript, { childList: true });
  const onClick = (e) => {
    const b = e.target instanceof Element ? e.target.closest("#sim-green, #sim-red") : null;
    if (!b) return;
    pick("magnifier");
    say(narratorLine(b.id === "sim-green" ? "ci-green" : "ci-red"));
  };
  document.addEventListener("click", onClick, true);
  const onFx = (e) => {
    const simulated = document.getElementById("sim-label")?.hidden === false;
    if (e.detail && e.detail.kind === "heal" && simulated) { pick("bell"); say(narratorLine("reraise")); }
  };
  document.addEventListener("crypt:fx", onFx);
  const onJar = (e) => {
    const repo = cleanLabel(e.detail && e.detail.repo);
    const next = addJar(jars, repo);
    if (next.length === jars.length && next.every((j, i) => j.repo === jars[i].repo)) return;
    setJars(next);
    say(narratorLine("jar", repo));
  };
  document.addEventListener("crypt:jar", onJar);

  return {
    update() {
      for (const m of jarMeshes.values()) m.group.position.lerp(m.target, 0.12);
      for (const t of tools.values()) if (!reduced) t.group.position.y += (t.baseY + t.lift * 0.35 - t.group.position.y) * 0.2;
    },
    dispose() {
      clearTimeout(liftTimer);
      obs.disconnect();
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("crypt:fx", onFx);
      document.removeEventListener("crypt:jar", onJar);
      twin.remove();
      textures.forEach((t) => t.dispose());
      root.traverse((o) => { o.geometry?.dispose?.(); });
      root.removeFromParent();
    },
  };
}
