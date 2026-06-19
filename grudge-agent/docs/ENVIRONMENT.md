<p align="center"><img src="../public/gruda-king.png" alt="GRUDA Agent" width="120"></p>

# GRUDA Environment — Coding Rules & Plugin Guide
The **Environment** tab is an agentic, multi-engine studio: write or AI-generate a scene, press **Play**, and it runs in a sandboxed preview. It supports **Three.js**, **Three.js + Rapier** (physics), **Phaser** (2D), and **Node** (server-run scripts) — with no build step.
This document is the canonical coding standard for scenes and the contract for the plugin system. It distills the `threejs-*` and `three-js-engine` skills into the rules that actually apply inside the sandbox.
## How the runtime works
- **Sandboxed iframe.** Each Play builds a self-contained HTML document and assigns it to the preview `<iframe srcdoc>` (`sandbox="allow-scripts allow-pointer-lock"`). Stop tears the document down — there is no shared state between runs.
- **ESM importmap (no bundler).** Bare imports resolve from CDNs:
  - `three` → `https://unpkg.com/three@0.160.0/build/three.module.js`
  - `three/addons/` → `https://unpkg.com/three@0.160.0/examples/jsm/`
  - `@dimforge/rapier3d-compat` → `https://esm.sh/@dimforge/rapier3d-compat@0.12.0`
  - `phaser` → `https://esm.sh/phaser@3.80.1`
  Three is pinned to **0.160** (matches the Grudge engine) and loaded from unpkg so add-ons share a **single** three instance via the importmap (avoids the "multiple instances of three" bug).
- **Your code is an ES module.** Write module-level code (top-level `await` is allowed — Rapier uses it). Do **not** emit `<html>`/`<script>` wrappers; the runtime adds them.
- **Globals the runtime injects** (no import needed):
  - `assetUrl(path)` — resolves a Grudge asset to the CORS-safe R2 proxy. `assetUrl('/models/x.glb')` → `/api/r2/models/x.glb` → `assets.grudge-studio.com/models/x.glb`.
  - `registerPlugin(plugin)` — register a behavior (see below).
  - `GRUDA.boot(ctx, onFrame)` — standard setup + render loop (runs plugins, calls `onFrame(dt)`, renders).
- **Node engine** does not use the iframe; it runs server-side via `POST /api/ide/run` (works on Railway/local). The browser engines run everywhere, including Vercel.
## Core coding rules
1. **One renderer, one loop.** Create a single `WebGLRenderer` and drive everything from one rAF loop. Prefer `GRUDA.boot(ctx, onFrame)` so the loop, plugins, and teardown are consistent.
2. **Pixel ratio cap.** `renderer.setPixelRatio(Math.min(devicePixelRatio, 2))` — never uncapped (kills perf on HiDPI).
3. **Handle resize.** Update `camera.aspect`, call `camera.updateProjectionMatrix()`, and `renderer.setSize(innerWidth, innerHeight)` on `resize`.
4. **Load assets from the CDN, always via `assetUrl()`.** Never hardcode `assets.grudge-studio.com` — go through `assetUrl()` so the request is CORS-safe inside the sandbox.
5. **grudge6 race models are FBX, not GLB** (GLB conversion strips material colors). Use `FBXLoader` for race characters; `GLTFLoader` for everything else.
6. **Dispose on teardown.** Geometries, materials, textures, and the renderer must be disposable. If you allocate them in a plugin, free them in `dispose()`. Stop discards the iframe, but clean code still disposes (and matters if you reuse objects).
7. **Fixed-step physics (Rapier).** `await RAPIER.init()` before use; call `world.step()` once per frame; sync mesh transforms from `rigidBody.translation()/rotation()`. Don't scale physics by frame `dt` — Rapier integrates at a fixed 60 Hz by default.
8. **Postprocessing.** Prefer an `EffectComposer`; set `ctx.composer` and `GRUDA.boot` will render it instead of the bare scene. Keep effects in a single pass where possible.
9. **Perf budget.** Use `InstancedMesh` for repeated meshes, `THREE.LOD` for distance tiers, merge static geometry, and keep draw calls low. Cap lights and shadow maps.
10. **No secrets, no network beyond CDN + `/api/r2`.** The sandbox has no app credentials; treat it as untrusted.
## Plugin system
A plugin is a small object that adds a self-contained behavior. Register any number before `GRUDA.boot` runs.
```js
registerPlugin({
  id: 'unique-id',          // required
  name: 'Human readable',   // optional
  setup(ctx) { /* add objects to ctx.scene, allocate resources */ },
  update(dt, ctx) { /* per-frame; dt is seconds */ },
  dispose() { /* free geometries/materials/textures you created */ },
});
```
`ctx` is what you pass to `GRUDA.boot(ctx, onFrame)` and typically contains:
`{ THREE, RAPIER?, world?, scene, camera, renderer, composer?, assetUrl, clock }`.
Lifecycle: `GRUDA.boot` calls every plugin's `setup(ctx)` once, then each frame calls your `onFrame(dt)` followed by every plugin's `update(dt, ctx)`, then renders (`ctx.composer` if set, else `renderer.render(scene, camera)`). On Stop, `dispose()` is called.
### Example plugin: R2 model loader
```js
registerPlugin({
  id: 'r2-model', name: 'R2 Model',
  setup(ctx) {
    import('three/addons/loaders/GLTFLoader.js').then(({ GLTFLoader }) => {
      new GLTFLoader().load(assetUrl('/models/props/barrel.glb'), (gltf) => {
        this.model = gltf.scene;
        ctx.scene.add(this.model);
      });
    });
  },
  update(dt) { if (this.model) this.model.rotation.y += dt * 0.5; },
  dispose() {
    if (!this.model) return;
    this.model.traverse(o => { o.geometry?.dispose?.(); const m = o.material; (Array.isArray(m) ? m : [m]).forEach(x => x?.dispose?.()); });
  },
});
```
### Example plugin: bloom post-processing
```js
registerPlugin({
  id: 'bloom', name: 'Bloom',
  async setup(ctx) {
    const { EffectComposer } = await import('three/addons/postprocessing/EffectComposer.js');
    const { RenderPass }     = await import('three/addons/postprocessing/RenderPass.js');
    const { UnrealBloomPass }= await import('three/addons/postprocessing/UnrealBloomPass.js');
    const composer = new EffectComposer(ctx.renderer);
    composer.addPass(new RenderPass(ctx.scene, ctx.camera));
    composer.addPass(new ctx.THREE.Vector2 ? new UnrealBloomPass(new ctx.THREE.Vector2(innerWidth, innerHeight), 0.6, 0.4, 0.85) : new UnrealBloomPass());
    ctx.composer = composer;                 // boot will render the composer
  },
});
```
## Scene generation (AI)
**🤖 Generate** sends your prompt + an engine-aware system prompt to the selected model:
- **Local Ollama** model → `POST /api/env/scene` (server calls Ollama).
- **Puter (free cloud)** model → generated in-browser via `puter.ai.chat` (no server key).
The system prompt enforces these rules (module output, `assetUrl()`, cleanup, `GRUDA.boot`/`registerPlugin`). The orchestrator's `art3d` worker can also produce scenes that paste straight into the editor.
## Save / load
Scenes persist per project at `<project>/.gruda/scenes/<id>.json` via `GET/POST /api/env/scenes(/:id)` and reload from the toolbar dropdown. A dedicated `grudge-scenes` R2 bucket is planned but not required today.
## Vendored UI kit (reachable)
A fantasy game-UI kit is vendored at `public/ui-kit/` and served at **`/ui-kit/`** on both Railway and Vercel:
- `/ui-kit/kit.css` + `/ui-kit/theme.css` — structural styles + the `--gk-*` fantasy tokens (`.gk-root[data-gk-theme="fantasy"]`).
- `/ui-kit/manifest.json` — tokens, 9-slice frame metadata, skill-set + icon manifest, control scheme.
- `/ui-kit/vanilla-js/gameui.js` — dependency-free ESM helpers (`root, panel, bar, slotGrid, button`) that build `.gk-*` widgets.
- `/ui-kit/assets/...` — icon and skill-set PNGs.
CSS and images load cross-origin into the sandbox without CORS; to use the JS helpers inside a scene, load them with a same-origin fetch from the app shell (a dedicated Game-UI overlay option for the Environment tab is a planned follow-up).
## References
- Coding patterns: the `three-js-engine`, `threejs-fundamentals`, `threejs-materials`, `threejs-animation`, `threejs-postprocessing`, and `three-mesh-bvh-pathfinding` skills.
- Asset/data layer: `docs/ORGANIZATION.md`, and the `grudge-d1-r2` skill (R2 CDN + asset-api).
