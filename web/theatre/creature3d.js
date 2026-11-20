// 3D-b: the "Creature 3D" view. Renders src/theatre/creature3d-layout.ts with three.js instanced meshes (one per shape).
// Lazy: this file loads with the page but three.js is requested only when the toggle is first used (#233).
// Fail safe: no WebGL, or any error, keeps the plain 2D plate. Reduced motion draws one still frame.
import { layoutCreature, layoutBounds, anchorOf, hasLabel, labelText, labelSide, LABEL_GAP_PX, CAMERA_FOV, CAMERA_FILL, BODY, STATE_COLOR, STATE_SHAPE } from "../js/theatre/creature3d-layout.js";
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
  const labelLayer = document.createElement("div");
  labelLayer.id = "creature3d-labels";
  labelLayer.style.cssText = "position:absolute;inset:0;pointer-events:none;overflow:hidden";
  labelLayer.setAttribute("aria-hidden", "true");
  holder.style.position = "relative";
  holder.append(canvas, labelLayer);
  panel.prepend(holder);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(CAMERA_FOV, 1, 0.1, 50);
  camera.position.set(0, 2, 8.5);
  camera.lookAt(0, 1.7, 0);
  let bounds = layoutBounds([]);
  // Auto-frame (3D-c): back the camera off along z so the layout box fills about 70% of the canvas, whichever side is tighter.
  const FILL = CAMERA_FILL;
  const frameCamera = () => {
    const b = bounds;
    const tanV = Math.tan((camera.fov * Math.PI) / 360);
    const tanH = tanV * camera.aspect;
    const depth = (b.maxZ - b.minZ) / 2;
    const dist = Math.max(b.height / 2 / (FILL * tanV), b.width / 2 / (FILL * tanH)) + depth;
    camera.position.set(b.center.x, b.center.y, b.center.z + dist);
    camera.near = 0.1;
    camera.far = dist + b.radius * 4 + 10;
    camera.lookAt(b.center.x, b.center.y, b.center.z);
    camera.updateProjectionMatrix();
  };
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
  // Simple body: head sphere, torso capsule, thin bones from each limb to its anchor. Labels for Possessed and Rotting only.
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x3a3426, roughness: 0.9 });
  const boneMat = new THREE.LineBasicMaterial({ color: 0x6b6246 });
  const headGeo = new THREE.SphereGeometry(BODY.head.r, 20, 14);
  const torsoGeo = THREE.CapsuleGeometry
    ? new THREE.CapsuleGeometry(BODY.torso.r, BODY.torso.half * 2 - BODY.torso.r * 2 + 0.4, 4, 12)
    : new THREE.CylinderGeometry(BODY.torso.r, BODY.torso.r, BODY.torso.half * 2 + 0.4, 12);
  const head = new THREE.Mesh(headGeo, bodyMat);
  head.position.set(0, BODY.head.y, 0);
  const torso = new THREE.Mesh(torsoGeo, bodyMat);
  torso.position.set(0, BODY.torso.y, 0);
  body.add(head, torso);
  let bones = null;
  let labels = []; // { el, pos: Vector3 }
  const placeLabels = () => {
    const w = holder.clientWidth || 300, h = holder.clientHeight || 260;
    body.updateMatrixWorld(true);
    for (const { el, pos, side, lift } of labels) {
      const p = pos.clone().applyMatrix4(body.matrixWorld).project(camera);
      const x = ((p.x + 1) / 2) * w, y = (1 - p.y) / 2 * h;
      // Labels sit outward from the body: left of left limbs, right of right limbs, above head limbs.
      if (side === "top") {
        el.style.left = `${x}px`; el.style.top = `${y - lift * h / 2 / (camera.position.distanceTo(pos) * Math.tan((camera.fov * Math.PI) / 360))}px`;
        el.style.transform = "translate(-50%,-100%)";
      } else {
        el.style.left = `${side === "left" ? x - LABEL_GAP_PX : x + LABEL_GAP_PX}px`; el.style.top = `${y}px`;
        el.style.transform = side === "left" ? "translate(-100%,-50%)" : "translateY(-50%)";
      }
    }
  };

  const clear = () => {
    for (const m of meshes) { body.remove(m); m.dispose?.(); }
    meshes = [];
    if (bones) { body.remove(bones); bones.geometry.dispose(); bones = null; }
    labelLayer.textContent = "";
    labels = [];
  };
  const build = () => {
    clear();
    const all = layoutCreature(globalThis.__cryptCreature);
    const { shown, more } = capLimbs(all, MAX_LIMBS);
    bounds = layoutBounds(shown);
    frameCamera();
    const pts = [];
    for (const l of shown) {
      const a = anchorOf(l);
      pts.push(new THREE.Vector3(a.x, a.y, a.z), new THREE.Vector3(l.x, l.y, l.z));
      if (hasLabel(l) && (l.state === "Possessed" || l.state === "Rotting")) {
        const el = document.createElement("span");
        el.className = "creature3d-label";
        el.textContent = labelText(l);
        el.style.cssText = `position:absolute;font:11px monospace;white-space:nowrap;color:${l.color};text-shadow:0 0 3px #000`;
        labelLayer.append(el);
        labels.push({ el, pos: new THREE.Vector3(l.x, l.y, l.z), side: labelSide(l), lift: 0.3 * l.scale });
      }
    }
    if (pts.length) {
      bones = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), boneMat);
      body.add(bones);
    }
    const dummy = new THREE.Object3D();
    const color = new THREE.Color();
    for (const shape of Object.keys(geos)) {
      const group = shown.filter((l) => l.shape === shape);
      if (group.length === 0) continue;
      const mesh = new THREE.InstancedMesh(geos[shape], mat, group.length);
      group.forEach((l, i) => {
        dummy.position.set(l.x, l.y, l.z);
        dummy.scale.setScalar(l.scale);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
        mesh.setColorAt(i, color.set(l.color));
      });
      mesh.userData.group = group;
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
  // Possessed limbs pulse (scale 1 to 1.15 around their layout size). Never called under reduced motion: that draws one still frame.
  const pulseDummy = new THREE.Object3D();
  const pulse = (t) => {
    const k = 1 + 0.15 * (0.5 + 0.5 * Math.sin(t / 300));
    for (const mesh of meshes) {
      const group = mesh.userData.group;
      let touched = false;
      group.forEach((l, i) => {
        if (l.state !== "Possessed") return;
        pulseDummy.position.set(l.x, l.y, l.z);
        pulseDummy.scale.setScalar(l.scale * k);
        pulseDummy.updateMatrix();
        mesh.setMatrixAt(i, pulseDummy.matrix);
        touched = true;
      });
      if (touched) mesh.instanceMatrix.needsUpdate = true;
    }
  };
  const draw = () => { renderer.render(scene, camera); placeLabels(); };
  const resize = () => {
    const w = holder.clientWidth || 300, h = holder.clientHeight || 260;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    frameCamera();
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
    if (!reduced) pulse(now);
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
      bodyMat.dispose(); boneMat.dispose(); headGeo.dispose(); torsoGeo.dispose();
      renderer.dispose();
      holder.remove();
      legendEl.textContent = "";
      delete document.documentElement.dataset.creature3d;
    },
  };
}
