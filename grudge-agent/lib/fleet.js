"use strict";

/**
 * Grudge Studio fleet URLs — mirrors GrudgeBuilder shared/fleet/manifest.ts (ONE TRUTH).
 * Import here instead of hardcoding hosts in server.js, templates, or scripts.
 */

const FLEET_URLS = {
  auth: "https://id.grudge-studio.com",
  identityApi: "https://grudge-studio.com",
  gameData: "https://grudge-api-production-0d46.up.railway.app",
  assets: "https://assets.grudge-studio.com",
  objectStore: "https://objectstore.grudge-studio.com",
  objectStoreApi: "https://objectstore.grudge-studio.com/api/v1",
  ai: "https://ai.grudge-studio.com",
};

/** @deprecated Legacy CF tunnel — do not use in new code */
const DEPRECATED_HOSTS = ["api.grudge-studio.com", "assets-api.grudge-studio.com"];

function stripTrailingSlash(url) {
  return String(url || "").replace(/\/$/, "");
}

function fleetUrl(key, envVar, fallbackKey) {
  const fromEnv = process.env[envVar];
  if (fromEnv) return stripTrailingSlash(fromEnv);
  return FLEET_URLS[fallbackKey || key];
}

module.exports = {
  FLEET_URLS,
  DEPRECATED_HOSTS,
  fleetUrl,
  GRUDGE_AUTH_URL: fleetUrl("auth", "GRUDGE_AUTH_URL", "auth"),
  GRUDGE_GAME_DATA_URL: fleetUrl("gameData", "GAME_API_URL", "gameData"),
  GRUDGE_R2_CDN: fleetUrl("assets", "GRUDGE_R2_CDN", "assets"),
  GRUDGE_OBJECTSTORE_URL: fleetUrl("objectStore", "GRUDGE_OBJECTSTORE_URL", "objectStore"),
  GRUDGE_OBJECTSTORE_API: fleetUrl("objectStoreApi", "GRUDGE_OBJECTSTORE_API", "objectStoreApi"),
  /** ObjectStore asset registry search (replaces legacy api.grudge-studio.com/assets) */
  GRUDGE_ASSET_API: fleetUrl("objectStore", "GRUDGE_ASSET_API", "objectStore"),
};