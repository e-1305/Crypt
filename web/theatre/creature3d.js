// 3D-b: the "Creature 3D" view. Renders src/theatre/creature3d-layout.ts with three.js instanced meshes (one per shape).
// Lazy: this file loads with the page but three.js is requested only when the toggle is first used (#233).
// Fail safe: no WebGL, or any error, keeps the plain 2D plate. Reduced motion draws one still frame.
import { layoutCreature, STATE_COLOR, STATE_SHAPE } from "../js/theatre/creature3d-layout.js";
import { MAX_LIMBS, GUARD_FRAMES, capLimbs, isSlowDevice, moreLabel, shouldRunGuard } from "../js/theatre/caps.js";

const STATES = ["Possessed", "Rotting", "Healed", "Healthy", "Unknown"];
const SHAPE_NAME = { spike: "spike", cube: "cube", ring: "ring", sphere: "sphere", cone: "cone" };

function hasWebgl() {
  try {
    const gl = document.createElement("canvas").getContext("webgl2") || document.createElement("canvas").getContext("webgl");
    return !!gl;
  } catch {
    return false;
  }
}

/** Adds the toggle under the plate. Does nothing when there is no WebGL: the 2D plate stays the only view. */
export function initCreature3d() {
  const plate = document.getElementById("plate");
  const summary = document.getElementById("plate-summary");
  if (!plate || !summary || document.getElementById("creature3d-toggle") || !hasWebgl()) return;

  const btn = document.createElement("button");
  btn.id = "creature3d-toggle";
  btn.type = "button";
  btn.textContent = "Creature 3D";
  btn.setAttribute("aria-pressed", "false");
  const panel = document.createElement("div");
  panel.id = "creature3d-panel";
  panel.hidden = true;
  const note = document.createElement("p");
  note.id = "creature3d-legend";
  note.className = "muted";
  panel.append(note);
  summary.after(panel);
  // The toggle sits in the Bench drawer next to "View the 3D bench"; without that row it follows the plate summary.
  const row = document.querySelector(".view-3d-row");
  if (row) row.after(btn); else summary.after(btn);

  let view = null;
  const reduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const close = () => {
    view?.dispose();
    view = null;
    panel.hidden = true;
    plate.hidden = false;
    btn.setAttribute("aria-pressed", "false");
  };
  const open = async () => {
    try {
      const THREE = await import("../vendor/three.module.min.js");
      const v = mountView(THREE, panel, note, reduced(), close);
      view = v;
      plate.hidden = true;
      panel.hidden = false;
      btn.setAttribute("aria-pressed", "true");
    } catch {
      close(); // the 2D plate stays exactly as it was
    }
  };
  btn.addEventListener("click", () => (view ? close() : open()));
  document.addEventListener("crypt:plate", () => view?.update());
}

function mountView(THREE, panel, legendEl, reduced, onSlow) {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x050403);
  const canvas = renderer.domElement;
  canvas.id = "creature3d-canvas";
  canvas.setAttribute("role", "img");
  canvas.style.cssText = "display:block;width:100%;height:100%";
  const holder = document.createElement("div");
  holder.id = "creature3d-stage";
  holder.append(canvas);
  panel.prepend(holder);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 50);
  camera.position.set(0, 2, 8.5);
  camera.lookAt(0, 1.7, 0);
  scene.add(new THREE.AmbientLight(0xffffff, 1.1));
  const sun = new THREE.DirectionalLight(0xffffff, 2);
  sun.position.set(3, 6, 6);
  scene.add(sun);

  const geos = {
    spike: new THREE.ConeGeometry(0.16, 0.5, 6),
    cube: new THREE.BoxGeometry(0.3, 0.3, 0.3),
    ring: new THREE.TorusGeometry(0.17, 0.05, 8, 20),
    sphere: new THREE.SphereGeometry(0.18, 14, 10),
    cone: new THREE.ConeGeometry(0.2, 0.32, 14),
  };
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.55 });
  let meshes = [];
  const body = new THREE.Group();
  scene.add(body);

  const clear = () => {
    for (const m of meshes) { body.remove(m); m.dispose?.(); }
    meshes = [];
  };
  const build = () => {
    clear();
    const all = layoutCreature(globalThis.__cryptCreature);
    const { shown, more } = capLimbs(all, MAX_LIMBS);
    const dummy = new THREE.Object3D();
    const color = new THREE.Color();
    for (const shape of Object.keys(geos)) {
      const group = shown.filter((l) => l.shape === shape);
      if (group.length === 0) continue;
      const mesh = new THREE.InstancedMesh(geos[shape], mat, group.length);
      group.forEach((l, i) => {
        dummy.position.set(l.x, l.y, l.z);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
        mesh.setColorAt(i, color.set(l.color));
      });
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      body.add(mesh);
      meshes.push(mesh);
    }
    const counts = Object.fromEntries(STATES.map((s) => [s, shown.filter((l) => l.state === s).length]));
    legendEl.textContent = "";
    for (const s of STATES) {
      const item = document.createElement("span");
      item.className = "creature3d-key";
      const sw = document.createElement("i");
      sw.style.background = STATE_COLOR[s];
      item.append(sw, `${s}: ${SHAPE_NAME[STATE_SHAPE[s]]} (${counts[s]})`);
      legendEl.append(item);
    }
    if (more > 0) legendEl.append(` ${moreLabel(more)} limbs`);
    canvas.setAttribute("aria-label", `Creature 3D view: ${shown.length} limbs shown. ` + STATES.map((s) => `${counts[s]} ${s}`).join(", ") + (more > 0 ? `, ${moreLabel(more)}` : "") + ".");
    draw();
  };
  const draw = () => renderer.render(scene, camera);
  const resize = () => {
    const w = holder.clientWidth || 300, h = holder.clientHeight || 260;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    draw();
  };

  let raf = 0, stopped = false, last = -1, spin = 0;
  const deltas = [];
  let guard = !reduced && shouldRunGuard(navigator.webdriver);
  const frame = (now) => {
    if (stopped) return;
    raf = requestAnimationFrame(frame);
    if (last >= 0) {
      deltas.push(now - last);
      if (guard && deltas.length >= GUARD_FRAMES + 1) {
        guard = false;
        if (isSlowDevice(deltas.slice(1))) { onSlow(); return; } // frame guard (#234): back to the 2D plate
      }
    }
    last = now;
    spin += 0.004;
    body.rotation.y = Math.sin(spin) * 0.5;
    draw();
  };
  window.addEventListener("resize", resize);
  resize();
  build();
  // Reduced motion: one still frame, no loop. Hidden tabs stop the loop too.
  if (!reduced) raf = requestAnimationFrame(frame);
  const onVis = () => {
    if (reduced || stopped) return;
    if (document.hidden) { cancelAnimationFrame(raf); raf = 0; } else if (raf === 0) { last = -1; raf = requestAnimationFrame(frame); }
  };
  document.addEventListener("visibilitychange", onVis);
  document.documentElement.dataset.creature3d = reduced ? "static" : "live";

  return {
    update: build,
    dispose() {
      stopped = true;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", onVis);
      clear();
      Object.values(geos).forEach((g) => g.dispose());
      mat.dispose();
      renderer.dispose();
      holder.remove();
      legendEl.textContent = "";
      delete document.documentElement.dataset.creature3d;
    },
  };
}
