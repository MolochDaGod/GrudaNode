"use strict";

/**
 * In-app Grudge asset catalog — master-items + asset-registry + grudge6.
 * Used by /api/assets/r2 so the Assets tab never leaves the app.
 */

const INFO_API = "https://info.grudge-studio.com/api/v1";

async function fetchJsonFirst(urls, timeoutMs = 60000) {
  for (const url of urls) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
      if (r.ok) return await r.json();
    } catch {
      /* try next */
    }
  }
  return null;
}

function createAssetCatalog({ r2Cdn, objectStoreApi }) {
  const OS_API = (objectStoreApi || "https://objectstore.grudge-studio.com/api/v1").replace(/\/$/, "");
  let cache = null;
  let cacheAt = 0;
  const TTL = 15 * 60 * 1000;

  function cdnUrl(key) {
    if (!key) return "";
    const k = String(key).replace(/^\//, "");
    if (/^https?:\/\//i.test(k)) {
      try {
        const u = new URL(k);
        if (u.hostname.includes("github.io") && /ObjectStore/i.test(u.pathname)) {
          const p = u.pathname.replace(/^\/[^/]*ObjectStore\/?/i, "").replace(/^\//, "");
          return `${r2Cdn}/${p}`;
        }
        return k;
      } catch {
        return k;
      }
    }
    return `${r2Cdn}/${k}`;
  }

  function kindFromPath(pathOrType = "") {
    const s = String(pathOrType).toLowerCase();
    if (/\.(glb|gltf|fbx)$/.test(s) || s.includes("model") || s === "character") return "model";
    if (/\.(hdr|exr)$/.test(s) || s.includes("hdri")) return "hdri";
    if (/\.(png|jpe?g|webp|gif|svg)$/.test(s) || s.includes("image/") || s.includes("icon") || s.includes("texture")) {
      return "texture";
    }
    return "asset";
  }

  async function load(force = false) {
    if (!force && cache && Date.now() - cacheAt < TTL) return cache;
    const assets = [];
    const categories = new Map();

    const itemsJson = await fetchJsonFirst([
      `${INFO_API}/master-items.json`,
      `${OS_API}/master-items.json`,
    ]);
    if (itemsJson?.items) {
      for (const it of itemsJson.items) {
        const r2 = it.modelR2Key || it.model_key || "";
        const icon = it.iconUrl || it.icon || "";
        const cat = it.category || it.type || "items";
        categories.set(cat, (categories.get(cat) || 0) + 1);
        assets.push({
          id: it.uuid || it.id || it.name,
          name: it.name || it.baseName || "item",
          type: kindFromPath(r2 || icon || it.type),
          category: cat,
          tier: it.tier,
          tierLabel: it.tierLabel,
          url: r2 ? cdnUrl(r2) : icon,
          thumbnail: icon || "",
          r2Key: r2 ? String(r2).replace(/^\//, "") : "",
          source: "master-items",
          path: r2 || icon,
        });
      }
    }

    const reg = await fetchJsonFirst(
      [`${INFO_API}/asset-registry.json`, `${OS_API}/asset-registry.json`],
      120000,
    );
    if (reg?.assets) {
      const map =
        typeof reg.assets === "object" && !Array.isArray(reg.assets)
          ? Object.values(reg.assets)
          : reg.assets;
      for (const a of map) {
        const path = a.path || a.filename || a.key || "";
        const cat = a.category || "registry";
        categories.set(cat, (categories.get(cat) || 0) + 1);
        const abs = a.cdn ? cdnUrl(a.cdn) : cdnUrl(path);
        assets.push({
          id: a.uuid || path,
          name: a.name || path.split("/").pop() || "asset",
          type: kindFromPath(a.type || path),
          category: cat,
          url: abs,
          thumbnail: /\.(png|jpe?g|webp|gif)$/i.test(path) ? abs : "",
          r2Key: String(path).replace(/^\//, ""),
          source: "asset-registry",
          path,
          size: a.size,
        });
      }
    }

    const g6 = await fetchJsonFirst([
      `${INFO_API}/grudge6-characters.json`,
      `${OS_API}/grudge6-characters.json`,
    ]);
    const races = g6?.races || g6?.characters || g6?.kits || [];
    const raceList = Array.isArray(races) ? races : Object.values(races || {});
    for (const r of raceList) {
      const key = r.modelR2Key || r.glb || r.model || r.path || "";
      categories.set("grudge6", (categories.get("grudge6") || 0) + 1);
      assets.push({
        id: r.id || r.raceId || r.name,
        name: r.name || r.id || "race",
        type: "model",
        category: "grudge6",
        url: key ? cdnUrl(key) : "",
        thumbnail: r.thumb || r.icon || "",
        r2Key: key ? String(key).replace(/^\//, "") : "",
        source: "grudge6",
        path: key,
      });
    }

    cache = {
      assets,
      categories: [...categories.entries()]
        .map(([id, count]) => ({ id, count }))
        .sort((a, b) => b.count - a.count || a.id.localeCompare(b.id)),
      total: assets.length,
      loadedAt: Date.now(),
    };
    cacheAt = Date.now();
    return cache;
  }

  function search(opts = {}) {
    return load().then((catalog) => {
      const query = String(opts.q || "").trim().toLowerCase();
      const cat = String(opts.category || opts.type || "").trim();
      const source = String(opts.source || "").trim();
      const offset = Math.max(0, parseInt(opts.offset, 10) || 0);
      const limit = Math.min(Math.max(parseInt(opts.limit, 10) || 48, 1), 120);

      let rows = catalog.assets;
      if (cat && cat !== "all") {
        const c = cat.toLowerCase();
        rows = rows.filter(
          (a) =>
            String(a.category || "").toLowerCase() === c
            || String(a.category || "").toLowerCase().startsWith(c + "/")
            || String(a.type || "").toLowerCase() === c
            || (c === "model" && a.type === "model")
            || (c === "texture" && a.type === "texture")
            || (c === "hdri" && a.type === "hdri")
            || (c === "items" && a.source === "master-items"),
        );
      }
      if (source) rows = rows.filter((a) => a.source === source);
      if (query) {
        rows = rows.filter(
          (a) =>
            String(a.name || "").toLowerCase().includes(query)
            || String(a.category || "").toLowerCase().includes(query)
            || String(a.path || "").toLowerCase().includes(query)
            || String(a.r2Key || "").toLowerCase().includes(query)
            || String(a.id || "").toLowerCase().includes(query),
        );
      }
      const total = rows.length;
      const page = rows.slice(offset, offset + limit).map((a) => ({
        ...a,
        previewUrl: a.r2Key ? `/api/r2/${a.r2Key}` : a.url,
        thumbnail:
          a.thumbnail
          || (a.type === "texture" && a.r2Key ? `/api/r2/${a.r2Key}` : a.thumbnail),
      }));
      return {
        assets: page,
        total,
        offset,
        limit,
        hasMore: offset + page.length < total,
        categories: catalog.categories.slice(0, 100),
        source: "fleet-catalog",
        sources: ["master-items", "asset-registry", "grudge6"],
      };
    });
  }

  return { load, search };
}

module.exports = { createAssetCatalog };
