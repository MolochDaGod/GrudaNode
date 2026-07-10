/**
 * Grudge Studio npm / toolchain panel — deps, clone recipes, terminal helpers.
 */
(function (global) {
  const RECIPES = [
    {
      id: "agent-local",
      title: "GRUDA Agent (local)",
      desc: "Run this workspace with terminal + file access on your machine.",
      cmds: [
        "git clone https://github.com/MolochDaGod/GrudaNode.git",
        "cd GrudaNode/grudge-agent",
        "npm install",
        "npm start",
      ],
    },
    {
      id: "three-vite",
      title: "Three.js game scaffold",
      desc: "Minimal Vite + Three matching Grudge engine pin (r160).",
      cmds: [
        "npm create vite@latest my-grudge-game -- --template vanilla",
        "cd my-grudge-game",
        "npm install three@0.160.0",
        "npm install -D vite",
        "npm run dev",
      ],
    },
    {
      id: "rapier",
      title: "Three + Rapier physics",
      desc: "Same stack as Environment tab (R3F-ready packages).",
      cmds: [
        "npm install three@0.160.0 @dimforge/rapier3d-compat@0.12.0",
        "npm install -D vite typescript",
      ],
    },
    {
      id: "builder",
      title: "GrudgeBuilder (Warlords monorepo)",
      desc: "Full studio client — characters, islands, fleet rewrites.",
      cmds: [
        "git clone https://github.com/MolochDaGod/GrudgeBuilder.git",
        "cd GrudgeBuilder",
        "npm install",
        "npm run dev",
      ],
    },
    {
      id: "objectstore",
      title: "ObjectStore definitions",
      desc: "JSON catalogs (items, recipes) + R2 asset pipeline.",
      cmds: [
        "git clone https://github.com/MolochDaGod/ObjectStore.git",
        "cd ObjectStore",
        "npm install",
      ],
    },
    {
      id: "fleet-js",
      title: "Fleet client JS (CDN)",
      desc: "No install — load SSOT helpers from assets CDN.",
      cmds: [
        '# In HTML:',
        '<script src="https://assets.grudge-studio.com/js/grudge-fleet.js"></script>',
      ],
    },
  ];

  const VSCODE_LINKS = [
    {
      name: "VS Code (Microsoft, OSS)",
      url: "https://github.com/microsoft/vscode",
      note: "Editor source — MIT licensed core",
    },
    {
      name: "Monaco Editor",
      url: "https://github.com/microsoft/monaco-editor",
      note: "In-browser editor used in the IDE tab",
    },
    {
      name: "OpenVSCode Server",
      url: "https://github.com/gitpod-io/openvscode-server",
      note: "Self-hosted VS Code in the browser",
    },
    {
      name: "Grudge Coder",
      url: "https://coder.grudge-studio.com",
      note: "Fleet cloud IDE (GrudachainCode)",
    },
  ];

  const FLEET_ENDPOINTS = [
    { label: "AI Hub", url: "https://ai.grudge-studio.com" },
    { label: "Assets CDN", url: "https://assets.grudge-studio.com" },
    { label: "ObjectStore", url: "https://objectstore.grudge-studio.com/api/v1" },
    { label: "Grudge ID", url: "https://id.grudge-studio.com" },
    { label: "Character Studio", url: "https://character.grudge-studio.com" },
    { label: "Warlords", url: "https://grudgewarlords.com" },
  ];

  function el(id) {
    return document.getElementById(id);
  }

  function esc(s) {
    return String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function render() {
    const recipes = el("studio-npm-recipes");
    if (recipes) {
      recipes.innerHTML = RECIPES.map(
        (r) => `
        <div class="studio-recipe-card">
          <div class="studio-recipe-title">${esc(r.title)}</div>
          <div class="studio-recipe-desc">${esc(r.desc)}</div>
          <pre class="studio-recipe-cmds">${r.cmds.map(esc).join("\n")}</pre>
          <div class="studio-recipe-actions">
            <button type="button" class="asset-dl-btn" data-copy="${esc(r.id)}">Copy commands</button>
            <button type="button" class="asset-dl-btn" style="background:var(--surface2);color:var(--text)" data-run="${esc(r.id)}">Run in terminal</button>
          </div>
        </div>`
      ).join("");
      recipes.querySelectorAll("[data-copy]").forEach((btn) => {
        btn.onclick = () => {
          const r = RECIPES.find((x) => x.id === btn.getAttribute("data-copy"));
          if (!r) return;
          navigator.clipboard?.writeText(r.cmds.join("\n"));
          btn.textContent = "Copied";
          setTimeout(() => (btn.textContent = "Copy commands"), 1200);
        };
      });
      recipes.querySelectorAll("[data-run]").forEach((btn) => {
        btn.onclick = () => {
          const r = RECIPES.find((x) => x.id === btn.getAttribute("data-run"));
          if (!r) return;
          runInTerminal(r.cmds.filter((c) => !c.startsWith("#") && !c.startsWith("<")));
        };
      });
    }

    const vsc = el("studio-vscode-links");
    if (vsc) {
      vsc.innerHTML = VSCODE_LINKS.map(
        (l) => `
        <a class="studio-link-card" href="${esc(l.url)}" target="_blank" rel="noreferrer">
          <div class="studio-link-name">${esc(l.name)}</div>
          <div class="studio-link-note">${esc(l.note)}</div>
        </a>`
      ).join("");
    }

    const fleet = el("studio-fleet-endpoints");
    if (fleet) {
      fleet.innerHTML = FLEET_ENDPOINTS.map(
        (e) =>
          `<a href="${esc(e.url)}" target="_blank" rel="noreferrer" class="orch-tool-chip">${esc(e.label)}</a>`
      ).join("");
    }

    const pkg = el("studio-package-json");
    if (pkg) {
      pkg.textContent = JSON.stringify(
        {
          name: "my-grudge-studio-app",
          private: true,
          type: "module",
          engines: { node: ">=18" },
          scripts: {
            dev: "vite",
            build: "vite build",
            preview: "vite preview",
          },
          dependencies: {
            three: "0.160.0",
            "@dimforge/rapier3d-compat": "0.12.0",
          },
          devDependencies: {
            vite: "^5.4.0",
            typescript: "^5.6.0",
          },
        },
        null,
        2
      );
    }
  }

  async function runInTerminal(cmds) {
    if (typeof global.showTab === "function") global.showTab("ide");
    if (global.GrudaTerminal?.showTab) global.GrudaTerminal.showTab("terminal");
    await new Promise((r) => setTimeout(r, 200));
    for (const cmd of cmds) {
      if (global.GrudaTerminal?.exec) {
        await global.GrudaTerminal.exec(cmd);
      } else {
        // fallback: fill input
        const input = el("terminal-input");
        if (input) {
          input.value = cmd;
          input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
        }
      }
    }
  }

  function init() {
    render();
    el("studio-open-ide")?.addEventListener("click", () => global.showTab?.("ide"));
    el("studio-open-assets")?.addEventListener("click", () => {
      global.setAssetSource?.("grudge");
      global.showTab?.("assets");
    });
    el("studio-open-legion")?.addEventListener("click", () => global.showTab?.("legion"));
    el("studio-copy-pkg")?.addEventListener("click", () => {
      const t = el("studio-package-json")?.textContent || "";
      navigator.clipboard?.writeText(t);
    });
  }

  global.GrudaStudioNpm = { init, render, RECIPES, runInTerminal };
})(typeof window !== "undefined" ? window : globalThis);
