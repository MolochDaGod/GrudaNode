"use strict";

/**
 * Project boilerplates — scaffolded on POST /api/projects { name, template }.
 * Each template returns { id, label, description, files: { relativePath: content } }.
 */

const GRUDA_MD = (name) =>
  `# ${name}\n\nCreated: ${new Date().toISOString()}\n\n## Fleet\n\n- Grudge ID: https://id.grudge-studio.com\n- Assets CDN: https://assets.grudge-studio.com (use \`assetUrl()\` in scenes)\n- ObjectStore: https://objectstore.grudge-studio.com\n\n## Notes\n\n`;

const TEMPLATES = {
  blank: {
    id: "blank",
    label: "Blank",
    description: "gruda.md only — start from scratch",
    files: () => ({}),
  },
  "three-scene": {
    id: "three-scene",
    label: "Three.js Scene",
    description: "Orbit camera + lit cube — open in Environment tab",
    files: (name) => ({
      "scenes/main.js": `import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b0b12);
const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 200);
camera.position.set(4, 3, 7);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

scene.add(new THREE.HemisphereLight(0xffffff, 0x223344, 0.85));
const sun = new THREE.DirectionalLight(0xffffff, 1.1);
sun.position.set(6, 10, 4);
scene.add(sun);
scene.add(new THREE.GridHelper(24, 24, 0x335588, 0x223344));

const mesh = new THREE.Mesh(
  new THREE.BoxGeometry(1.4, 1.4, 1.4),
  new THREE.MeshStandardMaterial({ color: 0xff6b00, roughness: 0.35 })
);
scene.add(mesh);

registerPlugin({ id: 'spin', update: (dt) => { mesh.rotation.y += dt * 0.5; } });

const ctx = { THREE, scene, camera, renderer, assetUrl, clock: new THREE.Clock() };
GRUDA.boot(ctx, () => controls.update());
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
`,
      "README.md": `# ${name}\n\nPaste \`scenes/main.js\` into the **Environment** tab (Three.js engine) and press Play.\n`,
    }),
  },
  "grudge-game": {
    id: "grudge-game",
    label: "Grudge Game (R2 assets)",
    description: "Three.js starter wired to Grudge CDN via assetUrl()",
    files: (name) => ({
      "scenes/grudge-world.js": `import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x08080f);
const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 500);
camera.position.set(0, 4, 10);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 1, 0);
controls.enableDamping = true;

scene.add(new THREE.HemisphereLight(0xfff4e8, 0x1a2030, 0.7));
const key = new THREE.DirectionalLight(0xffffff, 1.2);
key.position.set(8, 12, 6);
key.castShadow = true;
scene.add(key);

const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(40, 40),
  new THREE.MeshStandardMaterial({ color: 0x1a2438, roughness: 0.9 })
);
floor.rotation.x = -Math.PI / 2;
scene.add(floor);

// Swap MODEL_KEY for any R2 path from the Assets tab (Grudge Studio source).
const MODEL_KEY = '/models/props/barrel.glb';
new GLTFLoader().load(assetUrl(MODEL_KEY), (gltf) => {
  const m = gltf.scene;
  m.position.y = 0.5;
  scene.add(m);
  registerPlugin({ id: 'model-spin', update: (dt) => { m.rotation.y += dt * 0.3; } });
});

const ctx = { THREE, scene, camera, renderer, assetUrl, clock: new THREE.Clock() };
GRUDA.boot(ctx, () => controls.update());
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
`,
      "gruda.md": GRUDA_MD(name) + "## Scene\n\nEdit \`scenes/grudge-world.js\` — load models from **Assets → Grudge Studio → ▶ Env**.\n",
    }),
  },
  "node-api": {
    id: "node-api",
    label: "Node API",
    description: "Express server stub — run from IDE or terminal",
    files: (name) => ({
      "package.json": JSON.stringify({
        name: name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
        version: "1.0.0",
        private: true,
        type: "module",
        scripts: { start: "node server.js", dev: "node server.js" },
        dependencies: { express: "^4.18.2" },
      }, null, 2),
      "server.js": `import express from "express";

const app = express();
const PORT = process.env.PORT || 3400;

app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ ok: true, project: ${JSON.stringify(name)}, fleet: "grudge-studio" });
});

app.get("/api/hello", (_req, res) => {
  res.json({ message: "Hello from GRUDA ${name}" });
});

app.listen(PORT, () => console.log(\`[${name}] http://localhost:\${PORT}\`));
`,
      "README.md": `# ${name}\n\n\`\`\`bash\nnpm install\nnpm start\n\`\`\`\n\nOr open \`server.js\` in the IDE tab and use the terminal: \`node server.js\`.\n`,
    }),
  },
  "node-script": {
    id: "node-script",
    label: "Node Script",
    description: "Runnable script — Environment (Node) or IDE Run",
    files: (name) => ({
      "scripts/main.js": `// ${name} — Node script (IDE Run or Environment → Node → Play)
const FLEET = {
  grudgeId: "https://id.grudge-studio.com",
  assets: "https://assets.grudge-studio.com",
  objectStore: "https://objectstore.grudge-studio.com",
};

async function main() {
  console.log("GRUDA Node —", ${JSON.stringify(name)});
  console.log("Fleet endpoints:", FLEET);

  // Example: fetch public health (no secrets in sandbox)
  try {
    const r = await fetch("https://api.grudge-studio.com/health");
    const j = await r.json();
    console.log("api.grudge-studio.com health:", j.status || j.ok || "ok");
  } catch (e) {
    console.log("fetch skipped:", e.message);
  }

  const items = ["sword", "shield", "potion"];
  console.log("inventory:", items.join(", "));
}

main().catch((e) => { console.error(e); process.exit(1); });
`,
    }),
  },
  "static-web": {
    id: "static-web",
    label: "Static Web",
    description: "index.html + CSS — deploy to Puter or Vercel",
    files: (name) => ({
      "index.html": `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${name}</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <main>
    <h1>${name}</h1>
    <p>Built with <a href="https://ai.grudge-studio.com">GRUDA Agent</a>.</p>
    <button id="btn">Fleet ping</button>
    <pre id="out"></pre>
  </main>
  <script>
    document.getElementById("btn").onclick = async () => {
      const out = document.getElementById("out");
      out.textContent = "…";
      try {
        const r = await fetch("https://api.grudge-studio.com/health");
        out.textContent = await r.text();
      } catch (e) { out.textContent = e.message; }
    };
  </script>
</body>
</html>
`,
      "style.css": `:root { --accent: #ff6b00; --bg: #08080f; --text: #e8e8f0; }
* { box-sizing: border-box; margin: 0; }
body { font-family: system-ui, sans-serif; background: var(--bg); color: var(--text); min-height: 100vh; }
main { max-width: 640px; margin: 0 auto; padding: 48px 24px; }
h1 { color: var(--accent); margin-bottom: 12px; }
p { opacity: 0.85; line-height: 1.6; margin-bottom: 20px; }
a { color: var(--accent); }
button { background: var(--accent); color: #000; border: none; padding: 10px 20px; border-radius: 8px; font-weight: 700; cursor: pointer; }
pre { margin-top: 16px; padding: 12px; background: #12121c; border-radius: 8px; font-size: 0.8rem; overflow: auto; }
`,
      "vercel.json": JSON.stringify({ version: 2, builds: [{ src: "index.html", use: "@vercel/static" }] }, null, 2),
    }),
  },
};

function listTemplates() {
  return Object.values(TEMPLATES).map((t) => ({
    id: t.id,
    label: t.label,
    description: t.description,
  }));
}

function getTemplateFiles(templateId, projectName) {
  const t = TEMPLATES[templateId] || TEMPLATES.blank;
  const files = typeof t.files === "function" ? t.files(projectName) : t.files;
  return { template: t.id, files };
}

module.exports = { TEMPLATES, listTemplates, getTemplateFiles, GRUDA_MD };