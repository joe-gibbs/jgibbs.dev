import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

// -----------------------------------------------------------------
// Capability check — bail to the crawlable fallback if no WebGL.
// -----------------------------------------------------------------
function webglAvailable() {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch (e) {
    return false;
  }
}
function showFallback() {
  const fb = document.getElementById("fallback");
  document.body.classList.add("no-custom-cursor");
  document.body.style.overflow = "auto";
  document.getElementById("veil")?.classList.add("is-hidden");
  if (fb) fb.style.display = "block";
}

if (!webglAvailable()) {
  showFallback();
} else {
  boot().catch((e) => {
    console.error(e);
    showFallback();
  });
}

async function boot() {
  const REDUCED = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const FINE_POINTER = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  if (!FINE_POINTER) document.body.classList.add("no-custom-cursor");
  const fallback = document.getElementById("fallback");
  if (fallback) fallback.style.display = "none";

  // safety net: never leave the loading veil stuck, even if something stalls
  const _veil = document.getElementById("veil");
  if (_veil) setTimeout(() => _veil.classList.add("is-hidden"), 6000);

  // ---- data -----------------------------------------------------
  const CATEGORIES = {
    career: { label: "Career", color: 0xd8a44e, hex: "#d8a44e" },
    blog: { label: "Writing", color: 0x74b3b0, hex: "#74b3b0" },
    project: { label: "Project", color: 0xcf8aa0, hex: "#cf8aa0" },
  };

  // `face` = path to a real logo under /assets; items without one
  // fall back to a vector emblem (`icon`).
  const ITEMS = [
    { cat: "career", icon: "megaphone", face: "/assets/pressto-wordmark.png", emblemScale: 1.28, title: "Pressto", year: "2022 —", desc: "AI-powered public relations platform.", href: "https://heypressto.ai" },
    { cat: "career", icon: "calendar", face: "/assets/sen.png", title: "SEN", year: "2021 — 2022", desc: "Internal software & scheduling systems.", href: "https://sen.com.au" },
    { cat: "career", icon: "network", face: "/assets/grouptag.png", title: "Grouptag", year: "2020 — 2021", desc: "A network that connects people by skills, goals and interests.", href: "https://grouptag.cool" },

    { cat: "blog", icon: "sparkle", face: null, title: "Thoughts on GPT-5", year: "12 Aug 2025", desc: "Initial impressions after a few days of use.", href: "/blogs/thoughts-on-gpt-5" },
    { cat: "blog", icon: "robot", face: null, title: "Local LLM NPCs", year: "23 Dec 2023", desc: "Conversational NPCs, entirely local, in Unreal Engine.", href: "/blogs/local-llm-npcs-in-unreal-engine" },
    { cat: "blog", icon: "mountains", face: null, title: "Distant Terrain", year: "27 Aug 2023", desc: "Notes on far terrain for strategy-style worlds.", href: "/blogs/techniques-for-distant-terrain" },

    { cat: "project", icon: "leaderboard", face: null, title: "AdvertBench", year: "June 2026", desc: "Ranks AI-generated image ad sets with Elo voting.", href: "https://advertbench.com" },
    { cat: "project", icon: "document", face: null, title: "Wiki Simulator", year: "2025", desc: "Alt interfaces for LLM-generated content.", href: "https://github.com/joe-gibbs/wiki-simulator" },
    { cat: "project", icon: "play", face: "/assets/channel784.png", title: "Channel 784", year: "2023", desc: "AI-generated news parody, voiced and animated.", href: "https://www.youtube.com/channel/UCn01Em4a29wbsSSyaT0tI4Q" },
    { cat: "project", icon: "crown", face: "/assets/foae.png", emblemScale: 1.2, title: "Fall of an Empire", year: "2020 —", desc: "Unreal Engine strategy game.", href: "https://fallofanempiregame.com" },
    { cat: "project", icon: "pin", face: "/assets/redland.png", title: "Redland", year: "2020", desc: "Procedural, browser-based resource game.", href: "https://redland.jgibbs.dev" },
    { cat: "project", icon: "desert", face: "/assets/desert.png", title: "Forlorn Desert", year: "2019", desc: "A minimal walking simulator in Unreal Engine 4.", href: "https://drive.google.com/uc?export=download&id=1SHCEnrNVDQxR1m7ocVcSVzC0bPZi6OXs" },
    { cat: "project", icon: "receipt", face: "/assets/orderall.png", title: "Orderall", year: "2018 — 2019", desc: "Orders for small restaurants, by web and landline.", href: null },
  ];
  ITEMS.forEach((item) => {
    if (item.title === "Pressto" || item.title === "Fall of an Empire") item.tokenScale = 1.32;
  });

  // Explicit timeline rails: category order and recency both read top to bottom.
  const LAYOUT = {
    career: { x: -8.35, top: 4.85, step: 1.35, z: -3.2, sway: [-0.1, 0.14, -0.1] },
    blog: { x: -2.55, top: 4.9, step: 1.35, z: -3.2, sway: [-0.12, 0.12, -0.12] },
    project: { x: 8.25, top: 4.9, step: 1.08, z: -3.2, sway: [0.18, -0.18, 0.18, -0.18, 0.18, -0.18] },
  };
  const orderedPosition = (cat, index) => {
    const layout = LAYOUT[cat];
    const x = layout.x + layout.sway[index % layout.sway.length];
    const y = layout.top - index * layout.step;
    const z = layout.z + (index % 2 === 0 ? 0.06 : -0.06);
    return new THREE.Vector3(x, y, z);
  };

  // ---- renderer / scene / camera -------------------------------
  const canvas = document.getElementById("webgl");
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setClearColor(0x06070b, 0);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.96;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x06070b, 0.018);

  const camera = new THREE.PerspectiveCamera(52, window.innerWidth / window.innerHeight, 0.1, 200);
  camera.position.set(0, 0.2, 18.5);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.enableRotate = false;
  controls.enablePan = false;
  controls.enableZoom = false;
  controls.minDistance = 7;
  controls.maxDistance = 26;
  controls.minPolarAngle = 0.6;
  controls.maxPolarAngle = Math.PI - 0.6;
  controls.autoRotate = false;
  controls.autoRotateSpeed = 0.28;
  controls.target.set(0, -0.6, 0);

  // ---- image-based lighting: a neutral studio env for the metal -
  try {
    const pmrem = new THREE.PMREMGenerator(renderer);
    const envRT = pmrem.fromScene(new RoomEnvironment(), 0.04);
    scene.environment = envRT.texture;
    scene.environmentIntensity = 0.35;
    pmrem.dispose();
  } catch (e) {
    // without an env map the coins still read via the direct lights below
  }

  // ---- lights: soft and mostly diffuse for front-facing tokens --
  scene.add(new THREE.AmbientLight(0x48505a, 0.62));
  const key = new THREE.DirectionalLight(0xfff2dc, 0.82);
  key.position.set(6, 10, 6);
  scene.add(key);
  const fill = new THREE.PointLight(0x6f86c0, 0.32, 80);
  fill.position.set(-9, -3, 9);
  scene.add(fill);
  const glint = new THREE.PointLight(0xffffff, 0.18, 55);
  glint.position.set(0, 8, 14);
  scene.add(glint);
  const rimLight = new THREE.DirectionalLight(0xb6dcff, 0.34);
  rimLight.position.set(-7, 4, -9);
  scene.add(rimLight);

  // ---- shared textures -----------------------------------------
  const glowTex = makeGlowTexture();

  // ---- starfield (dim pinpricks, not glow) ---------------------
  const STAR_COUNT = 1500;
  const starGeo = new THREE.BufferGeometry();
  const starPos = new Float32Array(STAR_COUNT * 3);
  const starCol = new Float32Array(STAR_COUNT * 3);
  const tmp = new THREE.Color();
  for (let i = 0; i < STAR_COUNT; i++) {
    const r = 34 + Math.random() * 70;
    const t = Math.random() * Math.PI * 2;
    const p = Math.acos(2 * Math.random() - 1);
    starPos[i * 3] = r * Math.sin(p) * Math.cos(t);
    starPos[i * 3 + 1] = r * Math.cos(p);
    starPos[i * 3 + 2] = r * Math.sin(p) * Math.sin(t);
    tmp.setHSL(0.1 + Math.random() * 0.1, 0.2, 0.55 + Math.random() * 0.35);
    starCol[i * 3] = tmp.r; starCol[i * 3 + 1] = tmp.g; starCol[i * 3 + 2] = tmp.b;
  }
  starGeo.setAttribute("position", new THREE.BufferAttribute(starPos, 3));
  starGeo.setAttribute("color", new THREE.BufferAttribute(starCol, 3));
  const stars = new THREE.Points(
    starGeo,
    new THREE.PointsMaterial({ size: 0.1, map: glowTex, vertexColors: true, transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true })
  );
  scene.add(stars);

  // ---- nodes (the work): matte front-facing tokens -------------
  const nodes = [];
  const pickables = [];

  // bake each token face; logos load asynchronously and swap in when ready
  const faceTextures = ITEMS.map((it) => makeFaceTexture(it, CATEGORIES[it.cat]));
  // shared geometries (one shallow disc, reused) + the matte rim material
  const COIN_R = 0.5;
  const COIN_H = 0.045;
  const coinGeo = new THREE.CylinderGeometry(COIN_R, COIN_R, COIN_H, 96);
  const rimMat = new THREE.MeshStandardMaterial({
    color: 0xd8d2c2,
    metalness: 0.0,
    roughness: 0.88,
    envMapIntensity: 0.15,
  });

  const byCat = { career: [], blog: [], project: [] };
  ITEMS.forEach((item, i) => {
    const cat = CATEGORIES[item.cat];

    // Face material is unlit by design: these are UI tokens, not inspectable metal coins.
    const faceMat = new THREE.MeshBasicMaterial({
      map: faceTextures[i],
      color: 0xffffff,
    });
    const coin = new THREE.Mesh(coinGeo, [rimMat, faceMat, faceMat]);
    coin.userData.item = item;
    coin.rotation.x = Math.PI / 2; // stand the disc up so its faces point ±Z

    const group = new THREE.Group();
    group.add(coin);

    const pos = orderedPosition(item.cat, byCat[item.cat].length);
    group.position.copy(pos);

    group.scale.setScalar(0.001); // intro reveal
    scene.add(group);
    pickables.push(coin);

    const node = {
      item, group,
      baseY: pos.y,
      phase: Math.random() * Math.PI * 2,
      bobAmp: 0.035 + Math.random() * 0.045,
      appearAt: 0.35 + i * 0.06,
      hover: 0,
    };
    nodes.push(node);
    byCat[item.cat].push(node);
  });

  // ---- constellation linking lines per category ----------------
  Object.entries(byCat).forEach(([key, arr]) => {
    if (arr.length < 2) return;
    const pts = [];
    const color = CATEGORIES[key].color;
    const coreMat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.78,
      depthWrite: false,
      depthTest: false,
    });
    const glowMat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.26,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
    });
    for (let i = 0; i < arr.length - 1; i++) {
      const a = arr[i].group.position;
      const b = arr[i + 1].group.position;
      pts.push(a.x, a.y, a.z, b.x, b.y, b.z);
      scene.add(makeLinkRod(a, b, 0.012, coreMat));
      scene.add(makeLinkRod(a, b, 0.034, glowMat));
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
    const m = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.68, depthWrite: false, depthTest: false });
    scene.add(new THREE.LineSegments(g, m));
  });

  // ---- intro camera dolly --------------------------------------
  const introFrom = new THREE.Vector3(0, 1.0, 24);
  const introTo = new THREE.Vector3(0, 0.2, 18.5);
  camera.position.copy(REDUCED ? introTo : introFrom);
  let introT = REDUCED ? 1 : 0;

  // ---- interaction state ---------------------------------------
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2(-2, -2);
  let hovered = null;
  let down = null; // {x,y,t}
  let autoTimer = null;

  const tooltip = document.getElementById("tooltip");
  const reticle = document.getElementById("reticle");
  const ttKind = tooltip.querySelector(".tt-kind");
  const ttTitle = tooltip.querySelector(".tt-title");
  const ttYear = tooltip.querySelector(".tt-year");
  const ttDesc = tooltip.querySelector(".tt-desc");
  const ttGo = tooltip.querySelector(".tt-go");
  const veil = document.getElementById("veil");
  const detail = document.getElementById("detail");

  function setPointer(e) {
    const x = (e.clientX / window.innerWidth) * 2 - 1;
    const y = -((e.clientY / window.innerHeight) * 2 - 1);
    pointer.set(x, y);
    if (FINE_POINTER) {
      reticle.style.left = e.clientX + "px";
      reticle.style.top = e.clientY + "px";
    }
  }

  function pick() {
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(pickables, false);
    return hits.length ? hits[0].object.userData.item : null;
  }

  function applyTooltip(item) {
    const cat = CATEGORIES[item.cat];
    ttKind.textContent = cat.label;
    ttKind.style.color = cat.hex;
    ttTitle.textContent = item.title;
    ttYear.textContent = item.year;
    ttDesc.textContent = item.desc;
    ttGo.textContent = item.href ? "open ↗" : "read more";
    ttGo.style.color = cat.hex;
  }

  function showTooltip(item, screen) {
    applyTooltip(item);
    tooltip.style.left = screen.x + "px";
    tooltip.style.top = screen.y + "px";
    tooltip.classList.add("is-visible");
    tooltip.setAttribute("aria-hidden", "false");
  }
  function hideTooltip() {
    tooltip.classList.remove("is-visible");
    tooltip.setAttribute("aria-hidden", "true");
  }

  function activate(item) {
    if (item.href) {
      window.open(item.href, item.href.startsWith("/") ? "_self" : "_blank", "noopener");
    } else {
      openDetail(item);
    }
  }

  function openDetail(item) {
    const cat = CATEGORIES[item.cat];
    detail.querySelector(".detail-kind").textContent = cat.label;
    detail.querySelector(".detail-kind").style.color = cat.hex;
    detail.querySelector(".detail-title").textContent = item.title;
    detail.querySelector(".detail-year").textContent = item.year;
    detail.querySelector(".detail-desc").textContent = item.desc;
    detail.classList.add("is-open");
    detail.setAttribute("aria-hidden", "false");
  }
  function closeDetail() {
    detail.classList.remove("is-open");
    detail.setAttribute("aria-hidden", "true");
  }
  detail.querySelector(".detail-close").addEventListener("click", closeDetail);
  detail.addEventListener("click", (e) => { if (e.target === detail) closeDetail(); });
  window.addEventListener("keydown", (e) => { if (e.key === "Escape") closeDetail(); });

  // ---- events --------------------------------------------------
  window.addEventListener("pointermove", (e) => {
    setPointer(e);
    const item = pick();
    if (item !== hovered) {
      hovered = item;
      if (FINE_POINTER) reticle.classList.toggle("is-hot", !!item);
    }
    if (item) {
      const node = nodes.find((n) => n.item === item);
      const v = node.group.position.clone().project(camera);
      showTooltip(item, { x: (v.x * 0.5 + 0.5) * window.innerWidth, y: (-v.y * 0.5 + 0.5) * window.innerHeight });
    } else {
      hideTooltip();
    }
  });

  renderer.domElement.addEventListener("pointerdown", (e) => {
    down = { x: e.clientX, y: e.clientY, t: performance.now() };
    if (FINE_POINTER) reticle.classList.add("is-down");
  });
  window.addEventListener("pointerup", (e) => {
    if (FINE_POINTER) reticle.classList.remove("is-down");
    if (!down) return;
    const dx = e.clientX - down.x;
    const dy = e.clientY - down.y;
    const moved = Math.hypot(dx, dy);
    const dt = performance.now() - down.t;
    down = null;
    if (moved < 6 && dt < 500) {
      setPointer(e);
      const item = pick();
      if (item) activate(item);
    }
  });

  renderer.domElement.addEventListener("pointerleave", hideTooltip);

  // pause autorotate while the user drives, resume after a beat
  controls.addEventListener("start", () => {
    controls.autoRotate = false;
    if (autoTimer) clearTimeout(autoTimer);
  });
  controls.addEventListener("end", () => {
    if (autoTimer) clearTimeout(autoTimer);
    autoTimer = null;
  });

  window.addEventListener("resize", () => {
    const w = window.innerWidth, h = window.innerHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  });

  // ---- reveal --------------------------------------------------
  requestAnimationFrame(() => veil.classList.add("is-hidden"));

  // ---- animation loop ------------------------------------------
  const clock = new THREE.Clock();
  const _forward = new THREE.Vector3();
  const _right = new THREE.Vector3();
  const _up = new THREE.Vector3();
  const _billboard = new THREE.Matrix4();

  function animate() {
    requestAnimationFrame(animate);
    // Call getDelta() once per frame; it also updates clock.elapsedTime.
    const dt = Math.min(clock.getDelta(), 0.05);
    const t = clock.elapsedTime;

    // camera intro
    if (introT < 1) {
      introT = Math.min(1, introT + dt / 2.2);
      const e = easeOutCubic(introT);
      camera.position.lerpVectors(introFrom, introTo, e);
    }

    // idle star drift
    if (!REDUCED) stars.rotation.y = t * 0.012;

    // nodes
    for (const n of nodes) {
      // appear (staggered)
      const appearProg = REDUCED ? 1 : Math.max(0, Math.min(1, (t - n.appearAt) / 0.8));
      const reveal = appearProg < 1 ? Math.max(0.001, easeOutBack(appearProg)) : 1;
      // bob
      if (!REDUCED) n.group.position.y = n.baseY + Math.sin(t * 0.8 + n.phase) * n.bobAmp;
      // hover lerp
      const target = n.item === hovered ? 1 : 0;
      n.hover += (target - n.hover) * Math.min(1, dt * 10);

      // scale (reveal + hover pop)
      n.group.scale.setScalar((n.item.tokenScale || 1) * reveal * (1 + n.hover * 0.16));

      // Keep the coin artwork facing the camera with a stable visual "up".
      _forward.copy(camera.position).sub(n.group.position).normalize();
      _up.set(0, 1, 0).applyQuaternion(camera.quaternion);
      _up.addScaledVector(_forward, -_up.dot(_forward)).normalize();
      _right.crossVectors(_up, _forward).normalize();
      _up.crossVectors(_forward, _right).normalize();
      _billboard.makeBasis(_right, _up, _forward);
      n.group.quaternion.setFromRotationMatrix(_billboard);
    }

    controls.update();

    // keep tooltip glued to its node
    if (hovered) {
      const node = nodes.find((n) => n.item === hovered);
      const v = node.group.position.clone().project(camera);
      tooltip.style.left = ((v.x * 0.5 + 0.5) * window.innerWidth) + "px";
      tooltip.style.top = ((-v.y * 0.5 + 0.5) * window.innerHeight) + "px";
      // hide if behind camera
      if (v.z > 1) hideTooltip();
    }

    renderer.render(scene, camera);
  }
  animate();
}

// -----------------------------------------------------------------
// helpers
// -----------------------------------------------------------------
function makeGlowTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const ctx = c.getContext("2d");
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.25, "rgba(255,255,255,0.65)");
  g.addColorStop(0.55, "rgba(255,255,255,0.18)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeLinkRod(a, b, radius, material) {
  const delta = new THREE.Vector3().subVectors(b, a);
  const length = delta.length();
  const geo = new THREE.CylinderGeometry(radius, radius, length, 10, 1, true);
  const mesh = new THREE.Mesh(geo, material);
  mesh.position.copy(a).addScaledVector(delta, 0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize());
  mesh.renderOrder = 1;
  return mesh;
}

function makeFaceNormalTexture(cat) {
  const S = 512;
  const height = new Float32Array(S * S);
  const cx = (S - 1) / 2;
  const cy = (S - 1) / 2;
  const ringA = 0.78;
  const ringB = 0.62;

  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const nx = (x - cx) / cx;
      const ny = (y - cy) / cy;
      const r = Math.sqrt(nx * nx + ny * ny);
      const theta = Math.atan2(ny, nx);
      const faceMask = smoothstep(1.0, 0.92, r);
      const enamelRing = ridge(r, ringA, 0.024) * 0.5 + ridge(r, ringB, 0.018) * 0.28;
      const machinedLines = Math.sin(r * 86) * 0.005 + Math.sin(theta * 36) * 0.004;
      const stampedPlate = smoothstep(0.5, 0.16, r) * 0.07;
      const categoryBevel = (cat.color % 17) * 0.0007;
      height[y * S + x] = faceMask * (enamelRing + machinedLines + stampedPlate + categoryBevel);
    }
  }

  return normalTextureFromHeight(height, S, S, 1.25);
}

function makeRimNormalTexture() {
  const W = 512;
  const H = 128;
  const height = new Float32Array(W * H);

  for (let y = 0; y < H; y++) {
    const v = y / (H - 1);
    const edgeBevel = ridge(v, 0.08, 0.05) + ridge(v, 0.92, 0.05);
    for (let x = 0; x < W; x++) {
      const u = x / W;
      const verticalReeding = Math.sin(u * Math.PI * 88) * 0.055;
      const fineBrushing = Math.sin((u + v * 0.18) * Math.PI * 180) * 0.004;
      height[y * W + x] = verticalReeding + fineBrushing + edgeBevel * 0.18;
    }
  }

  const tex = normalTextureFromHeight(height, W, H, 1.35);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

function normalTextureFromHeight(height, width, heightPx, strength) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = heightPx;
  const ctx = canvas.getContext("2d");
  const img = ctx.createImageData(width, heightPx);
  const data = img.data;

  for (let y = 0; y < heightPx; y++) {
    for (let x = 0; x < width; x++) {
      const l = sampleHeight(height, width, heightPx, x - 1, y);
      const r = sampleHeight(height, width, heightPx, x + 1, y);
      const u = sampleHeight(height, width, heightPx, x, y - 1);
      const d = sampleHeight(height, width, heightPx, x, y + 1);
      const dx = (r - l) * strength;
      const dy = (d - u) * strength;
      const invLen = 1 / Math.hypot(dx, dy, 1);
      const i = (y * width + x) * 4;
      data[i] = Math.round((-dx * invLen * 0.5 + 0.5) * 255);
      data[i + 1] = Math.round((-dy * invLen * 0.5 + 0.5) * 255);
      data[i + 2] = Math.round((invLen * 0.5 + 0.5) * 255);
      data[i + 3] = 255;
    }
  }

  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.anisotropy = 8;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  return tex;
}

function sampleHeight(height, width, heightPx, x, y) {
  const sx = Math.max(0, Math.min(width - 1, x));
  const sy = Math.max(0, Math.min(heightPx - 1, y));
  return height[sy * width + sx];
}

function ridge(value, center, width) {
  const d = Math.abs(value - center) / width;
  return Math.max(0, 1 - d * d);
}

function smoothstep(edge0, edge1, x) {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

// distribute `index` of `total` onto a small sphere of `radius`
function fibonacciPoint(index, total, radius, salt) {
  const golden = Math.PI * (3 - Math.sqrt(5));
  const seed = (salt % 3) * 1.7;
  const y = 1 - ((index + 0.5) / total) * 2;
  const r = Math.sqrt(Math.max(0, 1 - y * y)) * radius;
  const theta = golden * index + seed;
  return new THREE.Vector3(Math.cos(theta) * r, y * radius * 0.7, Math.sin(theta) * r);
}

function easeOutCubic(x) { return 1 - Math.pow(1 - x, 3); }
function easeOutBack(x) {
  const c1 = 1.70158, c3 = c1 + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

// -----------------------------------------------------------------
// coin face rendering (canvas → texture): brushed metal + emblem
// -----------------------------------------------------------------
function makeFaceTexture(item, cat) {
  const S = 512;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = S;
  const ctx = canvas.getContext("2d");
  paintFace(ctx, S, cat, item, null); // immediate vector emblem; logo swaps in below
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  if (item.face) {
    // load the real logo without blocking boot; repaint the face when it lands
    loadImage(item.face)
      .then((img) => { paintFace(ctx, S, cat, item, img); tex.needsUpdate = true; })
      .catch(() => { /* keep the vector emblem */ });
  }
  return tex;
}

function paintFace(ctx, S, cat, item, img) {
  const cx = S / 2, cy = S / 2;

  // matte enamel field
  const grd = ctx.createRadialGradient(cx, cy, 8, cx, cy, S / 2);
  grd.addColorStop(0, "#20242d");
  grd.addColorStop(0.72, "#121722");
  grd.addColorStop(1, "#080b10");
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, S, S);

  // category ring + thin inner rule
  ctx.strokeStyle = cat.hex;
  ctx.lineWidth = 14;
  ctx.beginPath(); ctx.arc(cx, cy, S / 2 - 26, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = "rgba(236,230,214,0.26)";
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(cx, cy, S / 2 - 49, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = "rgba(0,0,0,0.5)";
  ctx.lineWidth = 6;
  ctx.beginPath(); ctx.arc(cx, cy, S / 2 - 10, 0, Math.PI * 2); ctx.stroke();

  // emblem: real logo once loaded, otherwise the vector fallback
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(-Math.PI / 2);
  ctx.translate(-cx, -cy);
  if (img) {
    drawImageEmblem(ctx, img, cx, cy, S, item);
  } else {
    drawVectorEmblem(ctx, item, S);
  }
  ctx.restore();
}

function drawImageEmblem(ctx, img, cx, cy, S, item) {
  const aspect = img.width / img.height;
  const isSquareish = aspect > 0.72 && aspect < 1.38;
  const emblemScale = item.emblemScale || 1;

  if (isSquareish) {
    const r = S * 0.31 * emblemScale;
    ctx.save();
    ctx.fillStyle = "rgba(236,230,214,0.06)";
    ctx.beginPath(); ctx.arc(cx, cy, r + 10, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "rgba(236,230,214,0.18)";
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(cx, cy, r + 8, 0, Math.PI * 2); ctx.stroke();

    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.clip();
    const sc = Math.max((r * 2) / img.width, (r * 2) / img.height);
    const w = img.width * sc;
    const h = img.height * sc;
    ctx.drawImage(img, cx - w / 2, cy - h / 2, w, h);
    ctx.restore();
    return;
  }

  const box = S * 0.6 * emblemScale;
  const sc = Math.min(box / img.width, box / img.height);
  const w = img.width * sc;
  const h = img.height * sc;
  ctx.drawImage(img, cx - w / 2, cy - h / 2, w, h);
}

function drawVectorEmblem(ctx, item, S) {
  drawIcon(ctx, item.icon, S / 2, S / 2, S * 0.4, "#e7e3d6");
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawSparkle(ctx, x, y, R, color) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = color;
  const k = 0.22 * R;
  ctx.beginPath();
  ctx.moveTo(0, -R);
  ctx.lineTo(k, -k); ctx.lineTo(R, 0); ctx.lineTo(k, k);
  ctx.lineTo(0, R); ctx.lineTo(-k, k); ctx.lineTo(-R, 0); ctx.lineTo(-k, -k);
  ctx.closePath(); ctx.fill();
  ctx.restore();
}

// vector glyphs for the items that have no logo file
function drawIcon(ctx, id, cx, cy, S, color) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.lineWidth = S * 0.07;

  if (id === "sparkle") {
    drawSparkle(ctx, -0.04 * S, -0.05 * S, 0.28 * S, color);
    drawSparkle(ctx, 0.25 * S, -0.28 * S, 0.09 * S, color);
    drawSparkle(ctx, -0.28 * S, 0.24 * S, 0.07 * S, color);
    ctx.beginPath();
    ctx.arc(0, 0, 0.42 * S, 0.2 * Math.PI, 1.45 * Math.PI);
    ctx.stroke();
  } else if (id === "robot") {
    ctx.beginPath(); ctx.arc(0, -0.02 * S, 0.36 * S, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, -0.38 * S); ctx.lineTo(0, -0.50 * S); ctx.stroke();
    ctx.beginPath(); ctx.arc(0, -0.55 * S, 0.06 * S, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(-0.14 * S, -0.08 * S, 0.07 * S, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(0.14 * S, -0.08 * S, 0.07 * S, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(0, 0.11 * S, 0.14 * S, 0, Math.PI); ctx.stroke();
  } else if (id === "mountains") {
    ctx.globalAlpha = 0.5; ctx.beginPath(); ctx.arc(0.22 * S, -0.12 * S, 0.15 * S, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.moveTo(-0.44 * S, 0.30 * S); ctx.lineTo(-0.10 * S, -0.22 * S); ctx.lineTo(0.06 * S, 0.02 * S);
    ctx.lineTo(0.20 * S, -0.34 * S); ctx.lineTo(0.46 * S, 0.30 * S);
    ctx.closePath();
    ctx.globalAlpha = 0.18; ctx.fill(); ctx.globalAlpha = 1; ctx.stroke();
  } else if (id === "document") {
    ctx.beginPath(); ctx.arc(0, 0, 0.42 * S, 0, Math.PI * 2); ctx.stroke();
    for (let i = 0; i < 3; i++) {
      const y = -0.16 * S + i * 0.16 * S;
      ctx.beginPath();
      ctx.moveTo(-0.24 * S, y);
      ctx.bezierCurveTo(-0.08 * S, y - 0.08 * S, 0.08 * S, y + 0.08 * S, 0.24 * S, y);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(-0.28 * S, 0.24 * S);
    ctx.lineTo(0.28 * S, -0.24 * S);
    ctx.stroke();
  } else if (id === "leaderboard") {
    for (let i = 0; i < 3; i++) {
      const x = (-0.28 + i * 0.28) * S;
      const h = (0.34 + i * 0.12) * S;
      roundRect(ctx, x, 0.28 * S - h, 0.16 * S, h, 0.03 * S);
      ctx.globalAlpha = 0.2;
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(0.28 * S, -0.26 * S, 0.14 * S, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0.38 * S, -0.16 * S);
    ctx.lineTo(0.50 * S, -0.04 * S);
    ctx.stroke();
  }

  ctx.restore();
}
