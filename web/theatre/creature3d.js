// 3D-b: the "Creature 3D" view. Renders src/theatre/creature3d-layout.ts with three.js instanced meshes (one per shape).
// Lazy: this file loads with the page but three.js is requested only when the toggle is first used (#233).
// Fail safe: no WebGL, or any error, keeps the plain 2D plate. Reduced motion draws one still frame.
import { layoutCreature, layoutBounds, anchorOf, glowOf, droopOf, BODY, STATE_COLOR, STATE_SHAPE } from "../js/theatre/creature3d-layout.js";
import { MAX_LIMBS, GUARD_FRAMES, capLimbs, isSlowDevice, moreLabel, shouldRunGuard } from "../js/theatre/caps.js";

const STATES = ["Possessed", "Rotting", "Healed", "Healthy", "Unknown"];
// Fan guard: the loop draws at most 30 fps, sleeps after 8 s without input, data or a burst, and the pixel ratio stops at 1.5.
const FRAME_MS = 1000 / 30;
const IDLE_MS = 8000;
const MAX_DPR = 1.5;
const SHAPE_NAME = { spike: "spike", cube: "cube", ring: "ring", sphere: "sphere", cone: "cone" };

/** Lines of the limb card. Unknown data says "not recorded", never "no". Text only. */
export function limbCardLines(l) {
  const pct = (x) => (x * 100).toFixed(x < 0.1 ? 1 : 0) + "%";
  const cmd = String(l.name || "").toUpperCase();
  return [
    `${l.name}${l.version ? "@" + l.version : ""}`,
    `State: ${l.state}`,
    `Exploited (CISA KEV): ${l.kev === true ? "yes" : l.kev === false ? "no" : "not recorded"}`,
    `EPSS: ${l.epssKnown ? pct(l.epss) : "not recorded"}`,
    `Owner: ${l.owner || "not recorded"}`,
    `Type: EXAMINE ${cmd}`,
  ];
}

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
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, MAX_DPR));
  renderer.setClearColor(0x050403);
  const canvas = renderer.domElement;
  canvas.id = "creature3d-canvas";
  canvas.tabIndex = 0; // keyboard: arrow keys cycle limbs, Enter sends EXAMINE to the command line
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
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 50);
  camera.position.set(0, 2, 8.5);
  camera.lookAt(0, 1.7, 0);
  let bounds = layoutBounds([]);
  // Auto-frame (3D-c): back the camera off along z so the layout box fills about 70% of the canvas, whichever side is tighter.
  const FILL = 0.7;
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
  // Lab lighting: a warm key lamp, a cold green rim from behind, a dim sky/ground fill, and fog for depth.
  scene.fog = new THREE.Fog(0x050403, 9, 26);
  scene.add(new THREE.HemisphereLight(0x9fb08a, 0x140e06, 0.9));
  const sun = new THREE.DirectionalLight(0xffe2b0, 2.4);
  sun.position.set(3, 6, 6);
  scene.add(sun);
  const rim = new THREE.DirectionalLight(0x33ff88, 1.6);
  rim.position.set(-4, 3, -6);
  scene.add(rim);

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
  // Body (flesh pass): a stitched, sculpted torso (lathe), neck with bolts, a skull with a brow and glowing eyes.
  // Limbs are flesh tubes from the shoulder or hip to the package token, tinted by state. Labels for Possessed and Rotting only.
  const SKIN = 0x7d8a64;
  const bodyMat = new THREE.MeshStandardMaterial({ color: SKIN, roughness: 0.78, metalness: 0.02 });
  const boneMat = new THREE.MeshStandardMaterial({ color: SKIN, roughness: 0.8 });
  const stitchMat = new THREE.LineBasicMaterial({ color: 0x1a120a });
  const boltMat = new THREE.MeshStandardMaterial({ color: 0x8a8f96, roughness: 0.35, metalness: 0.85 });
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0xffb000 });
  const ty = BODY.torso.y, th = BODY.torso.half, hr = BODY.head.r, hy = BODY.head.y;
  const profile = [[0, ty - th - 0.25], [0.3, ty - th - 0.2], [0.36, ty - th], [0.31, ty - 0.25], [0.4, ty + 0.1], [0.5, ty + th - 0.05], [0.47, ty + th + 0.18], [0.24, ty + th + 0.32], [0.11, ty + th + 0.36], [0, ty + th + 0.36]]
    .map(([x, y]) => new THREE.Vector2(x, y));
  const torsoGeo = new THREE.LatheGeometry(profile, 28);
  const torso = new THREE.Mesh(torsoGeo, bodyMat);
  torso.scale.set(1, 1, 0.72); // flatter front to back, like a chest
  const neckGeo = new THREE.CylinderGeometry(0.11, 0.13, hy - hr - (ty + th + 0.3) + 0.12, 12);
  const neck = new THREE.Mesh(neckGeo, bodyMat);
  neck.position.set(0, (hy - hr + ty + th + 0.3) / 2, 0);
  const headGeo = new THREE.SphereGeometry(hr, 24, 18);
  const head = new THREE.Mesh(headGeo, bodyMat);
  head.position.set(0, hy, 0);
  head.scale.set(0.9, 1.08, 0.92);
  const browGeo = new THREE.BoxGeometry(hr * 1.6, hr * 0.22, hr * 0.5);
  const brow = new THREE.Mesh(browGeo, bodyMat);
  brow.position.set(0, hy + hr * 0.28, hr * 0.62);
  const flatGeo = new THREE.CylinderGeometry(hr * 0.86, hr * 0.9, hr * 0.32, 20);
  const flatTop = new THREE.Mesh(flatGeo, bodyMat); // the flat-topped skull of the classic monster
  flatTop.position.set(0, hy + hr * 0.8, 0);
  const eyeGeo = new THREE.SphereGeometry(hr * 0.11, 10, 8);
  const eyes = [-1, 1].map((sx) => { const e = new THREE.Mesh(eyeGeo, eyeMat); e.position.set(sx * hr * 0.33, hy + hr * 0.08, hr * 0.84); return e; });
  const boltGeo = new THREE.CylinderGeometry(0.035, 0.035, 0.42, 10);
  boltGeo.rotateZ(Math.PI / 2);
  const bolt = new THREE.Mesh(boltGeo, boltMat);
  bolt.position.copy(neck.position);
  // Stitches: a seam down the chest and one across the belly, short cross-stitches on each.
  const seams = [];
  const seam = (a, b, n) => { for (let i = 0; i <= n; i++) { const t = i / n; const p = a.clone().lerp(b, t); seams.push(p.clone().add(new THREE.Vector3(-0.05, 0.03, 0)), p.clone().add(new THREE.Vector3(0.05, -0.03, 0))); } seams.push(a, b); };
  seam(new THREE.Vector3(0, ty + th + 0.1, 0.36), new THREE.Vector3(0, ty - 0.2, 0.3), 7);
  seam(new THREE.Vector3(-0.27, ty - 0.12, 0.25), new THREE.Vector3(0.27, ty - 0.12, 0.25), 5);
  const stitchGeo = new THREE.BufferGeometry().setFromPoints(seams);
  const stitches = new THREE.LineSegments(stitchGeo, stitchMat);
  const shadowGeo = new THREE.CircleGeometry(1.4, 32);
  const shadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.45, depthWrite: false });
  const shadow = new THREE.Mesh(shadowGeo, shadowMat);
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = -0.4;
  body.add(torso, neck, head, brow, flatTop, ...eyes, bolt, stitches, shadow);
  const boneGeos = [];
  let bones = null;
  let labels = []; // { el, pos: Vector3 }
  let kbLimbs = []; // limbs in rank order, for keyboard cycling of the limb card
  // State cues on the limb itself (shape stays the primary cue; colour never carries state alone).
  // Possessed: glow follows EPSS and a few small droplets fall (motion only). Rotting: desaturated and drooping.
  // Healed: a stitched bandage ring, plus a short green flash on the tube at heal time. Healthy: pale skin.
  const PALE = 0xcfc9ae;
  const MAX_DRIP_LIMBS = 8, DRIPS_PER_LIMB = 3, DRIP_MS = 1600;
  const dripGeo = new THREE.SphereGeometry(0.03, 6, 5);
  const dripMat = new THREE.MeshBasicMaterial({ color: 0xff6a3d });
  const wrapGeo = new THREE.TorusGeometry(0.1, 0.03, 6, 14);
  const stitchRingGeo = new THREE.TorusGeometry(0.1, 0.008, 4, 14);
  const wrapMat = new THREE.MeshStandardMaterial({ color: 0xe8e0c8, roughness: 0.9 });
  const wrapStitchMat = new THREE.MeshBasicMaterial({ color: 0x1a120a });
  let drips = null, dripSrc = [];
  let flashes = []; // { mesh, t0 }
  // Heal burst: a limb that turns Healed (real or SIMULATED) flashes green, a light pulses and "HEALED" floats up.
  const prevState = new Map();
  let bursts = []; // { mesh, light, el, pos, t0 }
  const burstGeo = new THREE.SphereGeometry(0.3, 18, 12);
  const BURST_MS = 1400;
  const startBurst = (l) => {
    const m = new THREE.Mesh(burstGeo, new THREE.MeshBasicMaterial({ color: 0x33ff33, transparent: true, opacity: 0.9, depthWrite: false }));
    m.position.set(l.x, l.y, l.z);
    const light = new THREE.PointLight(0x33ff33, 8, 4);
    light.position.copy(m.position);
    body.add(m, light);
    const el = document.createElement("span");
    el.className = "creature3d-healed";
    el.textContent = "HEALED";
    el.style.cssText = "position:absolute;font:bold 13px monospace;color:#33ff33;text-shadow:0 0 6px #33ff33;pointer-events:none";
    labelLayer.append(el);
    bursts.push({ mesh: m, light, el, pos: new THREE.Vector3(l.x, l.y, l.z), t0: performance.now() });
  };
  const endBurst = (b) => { body.remove(b.mesh, b.light); b.mesh.material.dispose(); b.el.remove(); };
  const stepBursts = (now) => {
    if (bursts.length === 0) return;
    const w = holder.clientWidth || 300, h = holder.clientHeight || 260;
    bursts = bursts.filter((b) => {
      const t = (now - b.t0) / BURST_MS;
      if (t >= 1) { endBurst(b); return false; }
      b.mesh.scale.setScalar(0.3 + 3.2 * t);
      b.mesh.material.opacity = 0.9 * (1 - t);
      b.light.intensity = 8 * (1 - t);
      const p = b.pos.clone().applyMatrix4(body.matrixWorld).project(camera);
      b.el.style.left = `${((p.x + 1) / 2) * w - 24}px`;
      b.el.style.top = `${((1 - p.y) / 2) * h - 28 - 30 * t}px`;
      b.el.style.opacity = String(t < 0.7 ? 1 : (1 - t) / 0.3);
      return true;
    });
  };
  const placeLabels = () => {
    const w = holder.clientWidth || 300, h = holder.clientHeight || 260;
    body.updateMatrixWorld(true);
    // Labels sit on the outer side of their limb (left half: to the left) and never stack: same-side labels keep 14 px apart.
    const placed = labels.map(({ el, pos }) => {
      const p = pos.clone().applyMatrix4(body.matrixWorld).project(camera);
      return { el, x: ((p.x + 1) / 2) * w, y: ((1 - p.y) / 2) * h - 7, left: p.x < 0 };
    }).sort((a, b) => a.y - b.y);
    const lastY = { true: -Infinity, false: -Infinity };
    for (const q of placed) {
      const y = Math.max(q.y, lastY[q.left] + 14);
      lastY[q.left] = y;
      q.el.style.top = `${y}px`;
      if (q.left) { q.el.style.left = ""; q.el.style.right = `${w - q.x + 10}px`; }
      else { q.el.style.right = ""; q.el.style.left = `${q.x + 10}px`; }
    }
  };

  const dripDummy = new THREE.Object3D();
  const stepDrips = (now) => {
    let n = 0;
    for (const d of dripSrc) {
      for (let k = 0; k < DRIPS_PER_LIMB; k++, n++) {
        const t = ((now / DRIP_MS) + k / DRIPS_PER_LIMB + d.i * 0.37) % 1;
        dripDummy.position.set(d.x + (k - 1) * 0.04, d.y - 0.15 - 0.5 * t * t, d.z);
        dripDummy.scale.setScalar(1 - 0.6 * t);
        dripDummy.updateMatrix();
        drips.setMatrixAt(n, dripDummy.matrix);
      }
    }
    drips.instanceMatrix.needsUpdate = true;
  };
  const stepFlashes = (now) => {
    flashes = flashes.filter((f) => {
      const t = (now - f.t0) / BURST_MS;
      f.mesh.material.emissiveIntensity = t >= 1 ? 0 : 0.9 * (1 - t);
      return t < 1;
    });
  };
  const clear = () => {
    for (const m of meshes) { body.remove(m); m.dispose?.(); }
    meshes = [];
    if (drips) { body.remove(drips); drips.dispose?.(); drips = null; }
    dripSrc = [];
    flashes = [];
    if (bones) { body.remove(bones); bones.children.forEach((m) => m.material.dispose()); bones = null; }
    boneGeos.splice(0).forEach((g) => g.dispose());
    labelLayer.textContent = "";
    labels = [];
  };
  const build = () => {
    clear();
    const all = layoutCreature(globalThis.__cryptCreature);
    const { shown, more } = capLimbs(all, MAX_LIMBS);
    kbLimbs = shown;
    const healedNow = shown.filter((l) => l.state === "Healed" && (prevState.get(l.id) === "Possessed" || prevState.get(l.id) === "Rotting"));
    prevState.clear();
    for (const l of all) prevState.set(l.id, l.state);
    bounds = layoutBounds(shown);
    frameCamera();
    bones = new THREE.Group();
    const tint = new THREE.Color();
    for (const l of shown) {
      const a = anchorOf(l);
      const from = new THREE.Vector3(a.x, a.y, a.z), to = new THREE.Vector3(l.x, l.y, l.z);
      // A gently bent limb: the elbow or knee sags outward and down, so limbs hang instead of poking out straight.
      // Rotting limbs sag further (droopOf).
      const mid = from.clone().lerp(to, 0.5).add(new THREE.Vector3((to.x - from.x) * 0.08, -0.18 - droopOf(l.state), 0.06));
      const curve = new THREE.QuadraticBezierCurve3(from, mid, to);
      const geo = new THREE.TubeGeometry(curve, 10, l.region === "arms" || l.region === "legs" ? 0.075 : 0.05, 7, false);
      boneGeos.push(geo);
      const m = new THREE.Mesh(geo, boneMat.clone());
      m.material.color.set(SKIN).lerp(tint.set(l.color), l.state === "Healthy" ? 0.1 : 0.35);
      if (l.state === "Healthy") m.material.color.lerp(tint.set(PALE), 0.45);
      if (l.state === "Rotting") { const hsl = {}; m.material.color.getHSL(hsl); m.material.color.setHSL(hsl.h, hsl.s * 0.4, hsl.l * 0.85); }
      if (l.state === "Possessed") {
        m.material.emissive = new THREE.Color(0xff3a10);
        m.userData.glow = glowOf(l.epss); // 0.3 to 1.0 with EPSS
        m.material.emissiveIntensity = m.userData.glow;
        m.userData.pulse = true;
        if (!reduced && dripSrc.length < MAX_DRIP_LIMBS) dripSrc.push({ x: l.x, y: l.y, z: l.z, i: dripSrc.length });
      }
      bones.add(m);
      if (l.state === "Healed") {
        const p = curve.getPoint(0.6), q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), curve.getTangent(0.6).normalize());
        const wm = new THREE.Mesh(wrapGeo, wrapMat), sm = new THREE.Mesh(stitchRingGeo, wrapStitchMat);
        for (const x of [wm, sm]) { x.position.copy(p); x.quaternion.copy(q); }
        sm.translateZ(0.045); // a dark stitch line beside the cloth
        bones.add(wm, sm);
        if (healedNow.includes(l) && !reduced) { m.material.emissive = new THREE.Color(0x33ff33); m.material.emissiveIntensity = 0.9; flashes.push({ mesh: m, t0: performance.now() }); }
      }
      if (l.state === "Possessed" || l.state === "Rotting") {
        const el = document.createElement("span");
        el.className = "creature3d-label";
        const name = l.label.split(" · ")[0].replace(/ \S*$/, "");
        el.textContent = name.length > 18 ? name.slice(0, 17) + "…" : name;
        el.style.cssText = `position:absolute;font:11px monospace;white-space:nowrap;color:${l.color};text-shadow:0 0 3px #000`;
        labelLayer.append(el);
        labels.push({ el, pos: new THREE.Vector3(l.x, l.y, l.z) });
      }
    }
    body.add(bones);
    if (dripSrc.length > 0) {
      drips = new THREE.InstancedMesh(dripGeo, dripMat, dripSrc.length * DRIPS_PER_LIMB);
      body.add(drips);
    }
    // Eyes: amber while something is possessed, green once nothing is.
    eyeMat.color.set(shown.some((l) => l.state === "Possessed") ? 0xff5a1a : 0x33ff66);
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
      mesh.userData.limbs = group; // instanceId -> limb, for the limb card
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
    if (!reduced) for (const l of healedNow) startBurst(l);
    canvas.setAttribute("aria-label", `Creature 3D view: ${shown.length} limbs shown. ` + STATES.map((s) => `${counts[s]} ${s}`).join(", ") + (more > 0 ? `, ${moreLabel(more)}` : "") + ".");
    draw();
    wakeLoop();
  };
  let wakeLoop = () => {};
  const draw = () => { renderer.render(scene, camera); placeLabels(); };
  const resize = () => {
    const w = holder.clientWidth || 300, h = holder.clientHeight || 260;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    frameCamera();
    draw();
  };

  // Life cues (#309): eyes follow the pointer over the canvas, the body flinches on a graft (or a red-CI convulse), the head lifts
  // and the torso exhales on a heal. Event driven, off under reduced motion. The cue only moves meshes; no state changes.
  const FLINCH_MS = 300, SIGH_MS = 900;
  const headParts = [head, brow, flatTop, ...eyes].map((m) => ({ m, y: m.position.y }));
  const eyeBase = eyes.map((e) => e.position.x);
  const look = { x: 0, y: 0 };
  let cue = null; // { kind: "flinch" | "sigh", t0 }
  const onFx = (e) => {
    const d = e && e.detail;
    if (!d || d.reduced === true || reduced) return;
    if (d.kind === "graft" || d.kind === "convulse") cue = { kind: "flinch", t0: performance.now() };
    else if (d.kind === "heal") cue = { kind: "sigh", t0: performance.now() };
    else return;
    wake(); // idle rule: a cue after the loop paused must restart it
  };
  const stepLife = (now) => {
    eyes.forEach((e, i) => { e.position.x = eyeBase[i] + look.x * hr * 0.07; });
    let lift = 0, shake = 0, exhale = 0;
    if (cue) {
      const t = (now - cue.t0) / (cue.kind === "flinch" ? FLINCH_MS : SIGH_MS);
      if (t >= 1) cue = null;
      else if (cue.kind === "flinch") shake = Math.sin(t * Math.PI) * (1 - t);
      else { lift = Math.sin(t * Math.PI); exhale = lift; }
    }
    headParts.forEach((h, i) => { h.m.position.y = h.y + lift * 0.1 + (i >= 3 ? look.y * hr * 0.05 : 0); });
    body.position.z = -0.25 * shake;
    body.rotation.x = -0.12 * shake;
    torso.scale.x *= 1 + 0.05 * exhale;
    torso.scale.y *= 1 - 0.04 * exhale;
  };
  if (!reduced) document.addEventListener("crypt:fx", onFx);

  let raf = 0, stopped = false, last = -1, spin = 0;
  let lastActive = performance.now(), hovering = false, onScreen = true, ready = false;
  const deltas = [];
  let guard = !reduced && shouldRunGuard(navigator.webdriver);
  const frame = (now) => {
    if (stopped) return;
    if (bursts.length === 0 && !hovering && now - lastActive > IDLE_MS) { raf = 0; last = -1; return; } // idle: the last frame stays on screen
    raf = requestAnimationFrame(frame);
    if (last >= 0 && now - last < FRAME_MS - 1) return; // 30 fps cap
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
    // Breathing, and a slow throb on possessed limbs.
    torso.scale.set(1 + Math.sin(spin * 6) * 0.012, 1 + Math.sin(spin * 6) * 0.018, 0.72);
    stepLife(now);
    if (bones) for (const m of bones.children) if (m.userData.pulse) m.material.emissiveIntensity = Math.min(1, m.userData.glow * (0.85 + 0.15 * Math.sin(spin * 20)));
    if (drips) stepDrips(now);
    if (flashes.length) stepFlashes(now);
    draw();
    stepBursts(now);
  };
  window.addEventListener("resize", resize);
  resize();
  build();
  // Reduced motion: one still frame, no loop. Hidden tabs stop the loop too.
  if (!reduced) raf = requestAnimationFrame(frame);
  // Idle rule: any pointer move over the canvas, plate update or burst restarts the loop. Off screen or hidden pauses it.
  const pause = () => { cancelAnimationFrame(raf); raf = 0; last = -1; };
  const wake = () => {
    lastActive = performance.now();
    if (!ready || reduced || stopped || !onScreen || document.hidden || raf !== 0) return;
    raf = requestAnimationFrame(frame);
  };
  wakeLoop = wake;
  // Limb card: hover or tap a limb to see what it is and the command to type. Text only, inside the label layer.
  const card = document.createElement("div");
  card.id = "creature3d-card";
  card.className = "creature3d-card";
  card.setAttribute("role", "status");
  card.hidden = true;
  holder.append(card);
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  let cardFor = "";
  const fillCard = (l, x, y, w) => {
    if (cardFor !== l.id) {
      cardFor = l.id;
      card.textContent = "";
      for (const line of limbCardLines(l)) { const p = document.createElement("div"); p.textContent = line; card.append(p); }
    }
    card.style.left = `${Math.max(4, Math.min(x + 14, w - 230))}px`;
    card.style.top = `${Math.max(4, y - 20)}px`;
    card.hidden = false;
  };
  // Keyboard: arrow keys cycle limbs in rank order and show the same card; Enter puts EXAMINE <NAME> on the command line.
  let kbIndex = -1;
  const showKeyCard = () => {
    const l = kbLimbs[kbIndex];
    if (!l) return;
    const w = holder.clientWidth || 300, h = holder.clientHeight || 260;
    const p = new THREE.Vector3(l.x, l.y, l.z).applyMatrix4(body.matrixWorld).project(camera);
    fillCard(l, ((p.x + 1) / 2) * w, ((1 - p.y) / 2) * h, w);
  };
  const onKey = (e) => {
    if (kbLimbs.length === 0) return;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") kbIndex = (kbIndex + 1) % kbLimbs.length;
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") kbIndex = (kbIndex - 1 + kbLimbs.length) % kbLimbs.length;
    else if (e.key === "Enter" && kbIndex >= 0) {
      const cmd = document.getElementById("cmd");
      if (cmd) { cmd.value = "EXAMINE " + String(kbLimbs[kbIndex].name || "").toUpperCase(); cmd.focus(); }
      e.preventDefault();
      return;
    } else if (e.key === "Escape") { card.hidden = true; cardFor = ""; kbIndex = -1; return; }
    else return;
    e.preventDefault();
    try { showKeyCard(); } catch { card.hidden = true; }
    if (reduced) draw();
  };
  canvas.addEventListener("keydown", onKey);
  canvas.addEventListener("blur", () => { if (kbIndex >= 0) { card.hidden = true; cardFor = ""; kbIndex = -1; } });
  const showCard = (e) => {
    const r = canvas.getBoundingClientRect();
    if (!r.width || !r.height) return;
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -(((e.clientY - r.top) / r.height) * 2 - 1));
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObjects(meshes, false).find((h) => h.instanceId !== undefined);
    const l = hit ? hit.object.userData.limbs?.[hit.instanceId] : null;
    if (!l) { card.hidden = true; cardFor = ""; return; }
    fillCard(l, e.clientX - r.left, e.clientY - r.top, r.width);
  };
  const onMove = (e) => {
    hovering = true;
    try { showCard(e); } catch { card.hidden = true; }
    const r = canvas.getBoundingClientRect();
    if (r.width && r.height) {
      look.x = Math.max(-1, Math.min(1, ((e.clientX - r.left) / r.width) * 2 - 1));
      look.y = Math.max(-1, Math.min(1, 1 - ((e.clientY - r.top) / r.height) * 2));
    }
    wake();
  };
  const onLeave = () => { card.hidden = true; cardFor = ""; hovering = false; look.x = 0; look.y = 0; lastActive = performance.now(); };
  const onVis = () => {
    if (reduced || stopped) return;
    if (document.hidden) pause(); else wake();
  };
  const io = !reduced && typeof IntersectionObserver === "function"
    ? new IntersectionObserver((entries) => {
      onScreen = entries[entries.length - 1].isIntersecting;
      if (onScreen) wake(); else pause();
    })
    : null;
  // Tap shows the card everywhere, also under reduced motion (it is information, not animation).
  const onTap = (e) => { try { showCard(e); } catch { card.hidden = true; } if (reduced) draw(); };
  canvas.addEventListener("pointerdown", onTap);
  if (!reduced) { canvas.addEventListener("pointermove", onMove); canvas.addEventListener("pointerleave", onLeave); }
  io?.observe(holder);
  ready = true;
  document.addEventListener("visibilitychange", onVis);
  document.documentElement.dataset.creature3d = reduced ? "static" : "live";

  return {
    update: build,
    dispose() {
      stopped = true;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", onVis);
      canvas.removeEventListener("pointermove", onMove); canvas.removeEventListener("pointerleave", onLeave);
      canvas.removeEventListener("pointerdown", onTap); canvas.removeEventListener("keydown", onKey); card.remove();
      document.removeEventListener("crypt:fx", onFx);
      io?.disconnect();
      clear();
      bursts.forEach(endBurst); bursts = []; burstGeo.dispose();
      Object.values(geos).forEach((g) => g.dispose());
      mat.dispose();
      [dripGeo, wrapGeo, stitchRingGeo].forEach((g) => g.dispose());
      [dripMat, wrapMat, wrapStitchMat].forEach((x) => x.dispose());
      bodyMat.dispose(); boneMat.dispose(); stitchMat.dispose(); boltMat.dispose(); eyeMat.dispose(); shadowMat.dispose();
      [headGeo, torsoGeo, neckGeo, browGeo, flatGeo, eyeGeo, boltGeo, stitchGeo, shadowGeo].forEach((g) => g.dispose());
      renderer.dispose();
      // Release the WebGL context now; Chrome keeps at most 16 and warns after that (#343).
      renderer.forceContextLoss();
      holder.remove();
      legendEl.textContent = "";
      delete document.documentElement.dataset.creature3d;
    },
  };
}
