// The 3D bench: primitives only, no model files. Lamp with a real light, CRT body, glass screen,
// the plate on the wall. Fixed camera with slight mouse parallax.
import { makeCrtMaterial } from "./crt-shader.js";
import { makeScreen } from "./screen.js";
import { makeWall } from "./wall.js";
import { makeDrawer } from "./drawer.js";
import { makeBoard } from "./board.js";
import { TITLE_CARD_TEXT, dollyProgress, shouldShowTitleCard, titleCardVisible } from "../js/theatre/polish.js";

export async function mountStage() {
  const THREE = await import("../vendor/three.module.min.js");
  const transcript = document.getElementById("transcript");
  const cmd = document.getElementById("cmd");
  const plateEl = document.getElementById("plate");
  const summaryEl = document.getElementById("plate-summary");

  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x050403);
  const canvas = renderer.domElement;
  canvas.id = "theatre-canvas";
  canvas.setAttribute("aria-hidden", "true"); // the DOM transcript, plate summary and event log carry the content
  document.body.prepend(canvas);
  document.body.classList.add("theatre");
  addPlainLink();
  addManualLink();

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x050403, 9, 16);
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 40);
  const camBase = new THREE.Vector3(0, 2.3, 7.6);

  const wood = new THREE.MeshStandardMaterial({ color: 0x3a2616, roughness: 0.8 });
  const metal = new THREE.MeshStandardMaterial({ color: 0x6b6558, roughness: 0.45, metalness: 0.7 });
  const plastic = new THREE.MeshStandardMaterial({ color: 0x9a8f72, roughness: 0.6 });
  const stone = new THREE.MeshStandardMaterial({ color: 0x1d1a15, roughness: 0.95 });

  // Room: back wall and floor.
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(22, 12), stone);
  wall.position.set(0, 4, -2.5);
  scene.add(wall);
  const bench = new THREE.Mesh(new THREE.BoxGeometry(9, 0.35, 3.2), wood);
  bench.position.set(0, 0.3, 0);
  scene.add(bench);
  for (const x of [-4.2, 4.2]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.35, 4, 2.8), wood);
    leg.position.set(x, -1.9, 0);
    scene.add(leg);
  }

  // CRT: front case, back tube, bezel, glass.
  const crt = new THREE.Group();
  crt.position.set(1.7, 1.9, 0);
  const front = new THREE.Mesh(new THREE.BoxGeometry(3.2, 2.5, 0.5), plastic);
  const back = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.9, 1.4), plastic);
  back.position.z = -0.95;
  const foot = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.12, 1.2), metal);
  foot.position.y = -1.3;
  const bezel = new THREE.Mesh(new THREE.BoxGeometry(2.7, 2.05, 0.1), new THREE.MeshStandardMaterial({ color: 0x050805, roughness: 0.3 }));
  bezel.position.z = 0.26;
  crt.add(front, back, foot, bezel);
  const screen = makeScreen(transcript, cmd);
  const screenTex = new THREE.CanvasTexture(screen.canvas);
  screenTex.colorSpace = THREE.SRGBColorSpace;
  screenTex.minFilter = THREE.LinearFilter;
  const screenMat = makeCrtMaterial(THREE, screenTex);
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(2.5, 1.875), screenMat);
  glass.position.z = 0.32;
  crt.add(glass);
  const glow = new THREE.PointLight(0x33ff66, 1.2, 6);
  glow.position.set(0, 0, 1.4);
  crt.add(glow);
  scene.add(crt);

  // Lamp: base, two arms, shade, bulb and a warm light.
  const lamp = new THREE.Group();
  lamp.position.set(4.7, 0.48, 0.4);
  lamp.scale.x = -1;
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.55, 0.12, 24), metal);
  const arm1 = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.6, 8), metal);
  arm1.position.set(0, 0.8, 0);
  const arm2 = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.3, 8), metal);
  arm2.position.set(0.55, 1.55, 0);
  arm2.rotation.z = -1.1;
  const shade = new THREE.Mesh(new THREE.ConeGeometry(0.45, 0.55, 24, 1, true), new THREE.MeshStandardMaterial({ color: 0x2f4a2f, side: THREE.DoubleSide, roughness: 0.5 }));
  shade.position.set(1.15, 1.75, 0);
  shade.rotation.z = Math.PI + 0.25;
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.14, 16, 12), new THREE.MeshBasicMaterial({ color: 0xffe2a0 }));
  bulb.position.set(1.12, 1.62, 0);
  const lampLight = new THREE.PointLight(0xffc880, 14, 11, 1.6);
  lampLight.position.set(1.12, 1.55, 0.2);
  lamp.add(base, arm1, arm2, shade, bulb, lampLight);
  scene.add(lamp);
  scene.add(new THREE.AmbientLight(0x1a1a22, 0.9));

  // The plate on the wall.
  const wallPlate = makeWall(plateEl, summaryEl);
  const plateTex = new THREE.CanvasTexture(wallPlate.canvas);
  plateTex.colorSpace = THREE.SRGBColorSpace;
  plateTex.anisotropy = 4;
  const plateMesh = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 4.375), new THREE.MeshBasicMaterial({ map: plateTex }));
  plateMesh.position.set(-2.9, 3.1, -2.45);
  scene.add(plateMesh);

  // Bench drawer: a visible drawer front under the bench top that slides out while the DOM drawer is open.
  const drawerFront = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.22, 0.12), wood);
  drawerFront.position.set(-1.6, 0.25, 1.62);
  scene.add(drawerFront);
  const drawerKnob = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 8), metal);
  drawerKnob.position.set(0, 0, 0.1);
  drawerFront.add(drawerKnob);
  const drawer = makeDrawer();
  let drawerOut = 0;
  // The raid board on the wall, above the lamp.
  const board = makeBoard();
  const boardTex = new THREE.CanvasTexture(board.canvas);
  boardTex.colorSpace = THREE.SRGBColorSpace;
  const boardMesh = new THREE.Mesh(new THREE.PlaneGeometry(2.7, 1.77), new THREE.MeshBasicMaterial({ map: boardTex }));
  boardMesh.position.set(4.3, 4.6, -2.45);
  scene.add(boardMesh);

  // The raid lever on the bench. Pulling it (click) starts the raid, same as the Start button.
  const lever = new THREE.Group();
  lever.position.set(-2.9, 0.48, 0.9);
  const leverBase = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.2, 0.5), metal);
  const leverArm = new THREE.Group();
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.9, 10), metal);
  rod.position.y = 0.45;
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.14, 16, 12), new THREE.MeshStandardMaterial({ color: 0x992222, roughness: 0.4 }));
  knob.position.y = 0.95;
  leverArm.add(rod, knob);
  leverArm.position.y = 0.1;
  leverArm.rotation.z = 0.7;
  lever.add(leverBase, leverArm);
  scene.add(lever);
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const onPointerDown = (e) => {
    ndc.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    if (raycaster.intersectObject(lever, true).length > 0) document.getElementById("raid-start")?.click();
    else focusCmd();
  };

  // Props for the bench.
  const jar = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.7, 16), new THREE.MeshStandardMaterial({ color: 0x4a7a4a, transparent: true, opacity: 0.55, roughness: 0.1 }));
  jar.position.set(-0.9, 0.82, 0.7);
  scene.add(jar);

  // Resize, parallax, focus routing.
  const mouse = { x: 0, y: 0 };
  const onMove = (e) => { mouse.x = (e.clientX / window.innerWidth) * 2 - 1; mouse.y = (e.clientY / window.innerHeight) * 2 - 1; };
  const onResize = () => {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camBase.z = Math.max(7.6, 7.6 * (1.7 / camera.aspect));
    camera.updateProjectionMatrix();
  };
  const focusCmd = () => { if (!cmd.disabled) cmd.focus(); };
  const onKey = (e) => {
    // Typing anywhere reaches the input; the form handles Enter.
    const t = e.target;
    if (t instanceof HTMLElement && t.closest("#bench-drawer")) return;
    if (t === cmd || e.ctrlKey || e.metaKey || e.altKey) return;
    if (t instanceof HTMLElement && (t.tagName === "A" || t.tagName === "BUTTON")) return;
    if (e.key.length === 1 || e.key === "Backspace" || e.key === "Enter") focusCmd();
  };
  // B5.2: the camera moves in on the CRT at the first keystroke in #cmd. Instant under reduced motion.
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let dollyAt = -1;
  const onFirstKey = () => { dollyAt = performance.now(); cmd.removeEventListener("keydown", onFirstKey); };
  cmd.addEventListener("keydown", onFirstKey);
  const lookFrom = new THREE.Vector3(0, 2.3, 0);
  const lookTo = new THREE.Vector3(1.7, 1.9, 0);
  const look = new THREE.Vector3();

  // B5.1: title card on the 3D path only, 3 seconds, any key or click skips it.
  let card = null, cardTimer = 0, skipCard = () => {};
  if (shouldShowTitleCard({ mode3d: true, reducedMotion: reduced })) {
    card = document.createElement("div");
    card.id = "title-card";
    card.setAttribute("aria-hidden", "true");
    card.textContent = TITLE_CARD_TEXT;
    document.body.appendChild(card);
    const shownAt = performance.now();
    let skipped = false;
    const clearCard = () => {
      clearInterval(cardTimer);
      document.removeEventListener("keydown", skipCard, true);
      document.removeEventListener("pointerdown", skipCard, true);
      card?.remove();
      card = null;
    };
    skipCard = () => { skipped = true; clearCard(); };
    document.addEventListener("keydown", skipCard, true);
    document.addEventListener("pointerdown", skipCard, true);
    cardTimer = setInterval(() => { if (!titleCardVisible(performance.now() - shownAt, skipped)) clearCard(); }, 100);
  }
  window.addEventListener("mousemove", onMove);
  window.addEventListener("resize", onResize);
  document.addEventListener("keydown", onKey);
  canvas.addEventListener("pointerdown", onPointerDown);
  onResize();

  // Leaving the 3D path live: turning on reader mode tears the stage down.
  const hcWatch = new MutationObserver(() => { if (document.body.classList.contains("hc")) destroy(); });
  hcWatch.observe(document.body, { attributes: true, attributeFilter: ["class"] });

  // Thunder: a heal flashes the lamp light for a moment. Not under reduced motion.
  let flashAt = -1;
  const onFx = (e) => { if (e.detail && e.detail.kind === "heal" && e.detail.reduced !== true) flashAt = performance.now(); };
  document.addEventListener("crypt:fx", onFx);

  let raf = 0, stopped = false;
  const t0 = performance.now();
  function frame(now) {
    if (stopped) return;
    raf = requestAnimationFrame(frame);
    if (document.hidden) return;
    const t = (now - t0) / 1000;
    const d = dollyProgress(dollyAt < 0 ? 0 : now - dollyAt, reduced && dollyAt >= 0);
    camera.position.set(camBase.x + mouse.x * 0.35 + (1.7 - camBase.x) * 0.6 * d, camBase.y - mouse.y * 0.2 - 0.3 * d, camBase.z * (1 - 0.5 * d));
    look.lerpVectors(lookFrom, lookTo, d);
    camera.lookAt(look);
    const sinceFlash = flashAt < 0 ? 1e9 : now - flashAt;
    const flash = sinceFlash < 700 ? (Math.floor(sinceFlash / 90) % 2 === 0 ? 1 : 0.35) * 90 * (1 - sinceFlash / 700) : 0;
    lampLight.intensity = 14 + Math.sin(t * 31) * 0.25 + Math.sin(t * 5.1) * 0.35 + flash;
    screenMat.uniforms.time.value = t;
    drawerOut += ((drawer.isOpen() ? 0.7 : 0) - drawerOut) * 0.15;
    drawerFront.position.z = 1.62 + drawerOut;
    if (screen.update(now)) screenTex.needsUpdate = true;
    if (wallPlate.update()) plateTex.needsUpdate = true;
    if (board.update()) boardTex.needsUpdate = true;
    const pulled = document.documentElement.dataset.raid === "running";
    leverArm.rotation.z += ((pulled ? -0.7 : 0.7) - leverArm.rotation.z) * 0.15;
    renderer.render(scene, camera);
    frames++;
  }
  let frames = 0;
  raf = requestAnimationFrame(frame);
  // No initial focus: the skip link must be the first Tab stop. Typing still reaches the prompt (keydown handler above).

  function destroy() {
    stopped = true;
    cancelAnimationFrame(raf);
    hcWatch.disconnect();
    clearInterval(cardTimer);
    skipCard();
    cmd.removeEventListener("keydown", onFirstKey);
    window.removeEventListener("mousemove", onMove);
    window.removeEventListener("resize", onResize);
    document.removeEventListener("keydown", onKey);
    document.removeEventListener("crypt:fx", onFx);
    screen.dispose();
    wallPlate.dispose();
    drawer.dispose();
    board.dispose();
    scene.traverse((o) => { o.geometry?.dispose?.(); });
    renderer.dispose();
    canvas.remove();
    document.getElementById("theatre-plain")?.remove();
    document.getElementById("theatre-manual")?.remove();
    document.body.classList.remove("theatre");
    document.documentElement.dataset.theatre = "2d:high-contrast";
  }
  document.documentElement.dataset.theatreReady = "1";
  return { destroy, frameCount: () => frames };
}

function addPlainLink() {
  const a = document.createElement("a");
  a.id = "theatre-plain";
  a.href = "?theatre=off";
  a.textContent = "Plain page";
  document.body.appendChild(a);
}

function addManualLink() {
  const a = document.createElement("a");
  a.id = "theatre-manual";
  a.href = "manual.html";
  a.target = "_blank";
  a.rel = "noopener";
  a.setAttribute("aria-label", "How to play (manual), opens in a new tab");
  a.textContent = "How to play (manual)";
  document.body.appendChild(a);
}
