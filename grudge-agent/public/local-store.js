/**
 * GRUDA Agent — browser-local persistence (IndexedDB).
 * Primary store on Vercel / cloud hosts where server FS is ephemeral.
 */
(function (global) {
  const DB_NAME = "gruda-agent-local";
  const DB_VER = 2;
  const STORES = ["config", "projects", "memory", "insights", "history", "meta", "agentRuns"];

  let dbPromise = null;

  function openDb() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      if (!global.indexedDB) return reject(new Error("IndexedDB unavailable"));
      const req = global.indexedDB.open(DB_NAME, DB_VER);
      req.onupgradeneeded = () => {
        const db = req.result;
        for (const s of STORES) {
          if (!db.objectStoreNames.contains(s)) db.createObjectStore(s);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error("IndexedDB open failed"));
    });
    return dbPromise;
  }

  async function idbGet(store, key) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, "readonly");
      const req = tx.objectStore(store).get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function idbSet(store, key, value) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, "readwrite");
      tx.objectStore(store).put(value, key);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    });
  }

  async function idbGetAll(store) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, "readonly");
      const req = tx.objectStore(store).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }

  async function idbKeys(store) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, "readonly");
      const req = tx.objectStore(store).getAllKeys();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }

  const LocalStore = {
    available() {
      return !!global.indexedDB;
    },

    async getConfig() {
      return (await idbGet("config", "main")) || {};
    },

    async saveConfig(cfg) {
      await idbSet("config", "main", { ...cfg, _savedAt: Date.now() });
      return cfg;
    },

    async listProjects() {
      const keys = await idbKeys("projects");
      const out = [];
      for (const name of keys) {
        const p = await idbGet("projects", name);
        if (p) out.push(p);
      }
      return out;
    },

    async saveProject(project) {
      if (!project || !project.name) return;
      await idbSet("projects", project.name, { ...project, updatedAt: Date.now() });
    },

    async getMemory(projectName) {
      const row = await idbGet("memory", projectName);
      return row ? row.content || "" : "";
    },

    async saveMemory(projectName, content) {
      await idbSet("memory", projectName, { content: content || "", updatedAt: Date.now() });
    },

    async getInsight(slug) {
      const row = await idbGet("insights", slug);
      return row ? row.content || "" : "";
    },

    async saveInsight(slug, content) {
      await idbSet("insights", slug, { slug, content: content || "", updatedAt: Date.now() });
    },

    async getAllInsights() {
      const keys = await idbKeys("insights");
      const out = {};
      for (const slug of keys) {
        const row = await idbGet("insights", slug);
        if (row) out[slug] = row.content || "";
      }
      return out;
    },

    async saveInsightsMap(map) {
      if (!map || typeof map !== "object") return;
      for (const [slug, content] of Object.entries(map)) {
        await LocalStore.saveInsight(slug, content);
      }
    },

    async listHistory() {
      const rows = await idbGetAll("history");
      return rows.sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
    },

    async appendHistory(session) {
      const id = session.id || `s-${Date.now()}`;
      await idbSet("history", id, { ...session, id, savedAt: session.savedAt || Date.now() });
      const keys = await idbKeys("history");
      if (keys.length > 50) {
        const all = await LocalStore.listHistory();
        const drop = all.slice(50);
        const db = await openDb();
        const tx = db.transaction("history", "readwrite");
        for (const s of drop) tx.objectStore("history").delete(s.id);
      }
    },

    async appendAgentRun(run) {
      const id = run.id || `run-${Date.now()}`;
      const row = { ...run, id, savedAt: run.savedAt || Date.now() };
      await idbSet("agentRuns", id, row);
      const all = await LocalStore.listAgentRuns(100);
      if (all.length > 80) {
        const drop = all.slice(80);
        const db = await openDb();
        const tx = db.transaction("agentRuns", "readwrite");
        for (const r of drop) tx.objectStore("agentRuns").delete(r.id);
      }
      return row;
    },

    async listAgentRuns(limit = 30) {
      const rows = await idbGetAll("agentRuns");
      return rows
        .sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0))
        .slice(0, limit);
    },

    async getMeta(key) {
      return await idbGet("meta", key);
    },

    async setMeta(key, value) {
      await idbSet("meta", key, value);
    },

    /** Export everything as a portable JSON blob (for backup / desktop sync). */
    async exportAll() {
      return {
        version: 2,
        exportedAt: new Date().toISOString(),
        config: await LocalStore.getConfig(),
        projects: await LocalStore.listProjects(),
        insights: await LocalStore.getAllInsights(),
        history: await LocalStore.listHistory(),
        agentRuns: await LocalStore.listAgentRuns(80),
        memory: Object.fromEntries(
          await Promise.all(
            (await idbKeys("memory")).map(async (k) => [k, await LocalStore.getMemory(k)])
          )
        ),
      };
    },

    async importAll(blob) {
      if (!blob || typeof blob !== "object") return false;
      if (blob.config) await LocalStore.saveConfig(blob.config);
      for (const p of blob.projects || []) await LocalStore.saveProject(p);
      if (blob.insights) await LocalStore.saveInsightsMap(blob.insights);
      if (blob.memory) {
        for (const [name, content] of Object.entries(blob.memory)) {
          await LocalStore.saveMemory(name, content);
        }
      }
      for (const s of blob.history || []) await LocalStore.appendHistory(s);
      for (const r of blob.agentRuns || []) await LocalStore.appendAgentRun(r);
      return true;
    },
  };

  global.GrudaLocalStore = LocalStore;
})(typeof window !== "undefined" ? window : globalThis);