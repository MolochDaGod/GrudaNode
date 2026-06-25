/**
 * GRUDA Asset Viewer — inline 3D (GLB/FBX) + image preview + lightbox.
 */
(function (global) {
  const THREE_CDN = "https://unpkg.com/three@0.160.0/build/three.module.js";
  const ADDONS = "https://unpkg.com/three@0.160.0/examples/jsm/";

  let modalEl = null;
  let inlineEl = null;
  let threeCtx = null;
  let raf = 0;

  function ensureModal() {
    if (modalEl) return modalEl;
    const wrap = document.createElement("div");
    wrap.id = "gruda-viewer-modal";
    wrap.className = "viewer-modal";
    wrap.innerHTML = `
      <div class="viewer-backdrop"></div>
      <div class="viewer-panel">
        <div class="viewer-head">
          <span class="viewer-title">Preview</span>
          <div class="viewer-actions">
            <button type="button" class="viewer-btn" data-act="env">▶ Environment</button>
            <button type="button" class="viewer-btn" data-act="copy">Copy URL</button>
            <button type="button" class="viewer-btn viewer-close" data-act="close">✕</button>
          </div>
        </div>
        <div class="viewer-body">
          <canvas class="viewer-canvas" style="display:none"></canvas>
          <img class="viewer-image" alt="" style="display:none">
          <div class="viewer-placeholder">Select an asset to preview</div>
        </div>
        <div class="viewer-foot"></div>
      </div>`;
    document.body.appendChild(wrap);
    wrap.querySelector(".viewer-backdrop").onclick = () => close();
    wrap.querySelector('[data-act="close"]').onclick = () => close();
    modalEl = wrap;
    return wrap;
  }

  function dispose3D() {
    cancelAnimationFrame(raf);
    raf = 0;
    if (!threeCtx) return;
    const { renderer, scene, controls } = threeCtx;
    try { controls?.dispose?.(); } catch (_) {}
    if (scene) {
      scene.traverse((o) => {
        if (o.geometry) o.geometry.dispose?.();
        const m = o.material;
        (Array.isArray(m) ? m : [m]).filter(Boolean).forEach((mat) => {
          mat.dispose?.();
          Object.values(mat).forEach((v) => v?.dispose?.());
        });
      });
    }
    renderer?.dispose?.();
    threeCtx = null;
  }

  async function loadThree() {
    const THREE = await import(THREE_CDN);
    const { OrbitControls } = await import(ADDONS + "controls/OrbitControls.js");
    const { GLTFLoader } = await import(ADDONS + "loaders/GLTFLoader.js");
    const { FBXLoader } = await import(ADDONS + "loaders/FBXLoader.js");
    return { THREE, OrbitControls, GLTFLoader, FBXLoader };
  }

  function r2Proxy(url) {
    if (!url) return url;
    try {
      const u = new URL(url, location.origin);
      if (u.hostname === "assets.grudge-studio.com") {
        return location.origin + "/api/r2/" + u.pathname.replace(/^\//, "");
      }
    } catch (_) {}
    return url;
  }

  async function show3D(container, url, name) {
    dispose3D();
    const canvas = container.querySelector(".viewer-canvas");
    const img = container.querySelector(".viewer-image");
    const ph = container.querySelector(".viewer-placeholder");
    canvas.style.display = "block";
    img.style.display = "none";
    if (ph) ph.style.display = "none";

    const { THREE, OrbitControls, GLTFLoader, FBXLoader } = await loadThree();
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    const rect = container.getBoundingClientRect();
    renderer.setSize(rect.width || 480, rect.height || 360, false);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0b0b12);
    const camera = new THREE.PerspectiveCamera(50, (rect.width || 480) / (rect.height || 360), 0.05, 500);
    camera.position.set(2.5, 2, 4);
    const controls = new OrbitControls(camera, canvas);
    controls.enableDamping = true;

    scene.add(new THREE.HemisphereLight(0xffffff, 0x334455, 0.75));
    const key = new THREE.DirectionalLight(0xffffff, 1.1);
    key.position.set(5, 8, 4);
    scene.add(key);
    scene.add(new THREE.GridHelper(12, 12, 0x335588, 0x223344));

    const src = r2Proxy(url);
    const isFbx = /\.fbx$/i.test(src);
    const model = await new Promise((resolve, reject) => {
      const onErr = (e) => reject(e);
      if (isFbx) new FBXLoader().load(src, resolve, undefined, onErr);
      else new GLTFLoader().load(src, (g) => resolve(g.scene), undefined, onErr);
    });

    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z, 0.001);
    model.position.sub(center);
    model.position.y += size.y / 2;
    scene.add(model);
    camera.position.set(maxDim * 1.4, maxDim * 0.9, maxDim * 1.8);
    controls.target.set(0, size.y * 0.35, 0);
    controls.update();

    threeCtx = { THREE, renderer, scene, camera, controls, model, name, url: src };
    const clock = new THREE.Clock();
    function loop() {
      raf = requestAnimationFrame(loop);
      const dt = clock.getDelta();
      if (model) model.rotation.y += dt * 0.35;
      controls.update();
      renderer.render(scene, camera);
    }
    loop();

    const onResize = () => {
      const r = container.getBoundingClientRect();
      const w = r.width || 480;
      const h = r.height || 360;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h, false);
    };
    threeCtx._resize = onResize;
    window.addEventListener("resize", onResize);
  }

  function showImage(container, url, name) {
    dispose3D();
    const canvas = container.querySelector(".viewer-canvas");
    const img = container.querySelector(".viewer-image");
    const ph = container.querySelector(".viewer-placeholder");
    canvas.style.display = "none";
    img.style.display = "block";
    img.src = r2Proxy(url);
    img.alt = name || "asset";
    if (ph) ph.style.display = "none";
    threeCtx = { name, url: img.src, kind: "image" };
  }

  let currentAsset = null;

  function open(opts) {
    const { url, name, kind, r2Key, modal = false } = opts || {};
    currentAsset = { url, name, kind, r2Key };
    const container = modal ? ensureModal() : (inlineEl || ensureModal());
    if (modal) container.classList.add("open");

    const title = container.querySelector(".viewer-title");
    const foot = container.querySelector(".viewer-foot");
    if (title) title.textContent = name || "Preview";
    if (foot) foot.textContent = url ? String(url).slice(0, 120) : "";

    const body = container.querySelector(".viewer-body");
    const isModel = kind === "model" || /\.(glb|gltf|fbx)$/i.test(url || "");
    const isImg = kind === "texture" || kind === "hdri" || kind === "image" || /\.(png|jpe?g|webp|hdr|exr)$/i.test(url || "");

    if (isModel && url) show3D(body, url, name).catch((e) => {
      if (foot) foot.textContent = "3D load failed: " + e.message;
    });
    else if (isImg && url) showImage(body, url, name);
    else if (url) window.open(url, "_blank");
    else if (foot) foot.textContent = "No preview URL";
  }

  function openInline(el, opts) {
    inlineEl = el;
    open({ ...opts, modal: false });
  }

  function close() {
    if (modalEl) modalEl.classList.remove("open");
    if (threeCtx?._resize) window.removeEventListener("resize", threeCtx._resize);
    dispose3D();
  }

  function getCurrent() {
    return currentAsset;
  }

  function bindModalActions(onEnv) {
    const m = ensureModal();
    m.querySelector('[data-act="env"]')?.addEventListener("click", () => {
      if (currentAsset?.r2Key && typeof onEnv === "function") onEnv(currentAsset.r2Key);
      close();
    });
    m.querySelector('[data-act="copy"]')?.addEventListener("click", async () => {
      if (!currentAsset?.url) return;
      try {
        await navigator.clipboard.writeText(currentAsset.url);
        const foot = m.querySelector(".viewer-foot");
        if (foot) foot.textContent = "URL copied";
      } catch (_) {}
    });
  }

  global.GrudaViewer = { open, openInline, close, getCurrent, bindModalActions, r2Proxy };
})(typeof window !== "undefined" ? window : globalThis);