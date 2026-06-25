"use strict";

/**
 * Treaty Chat — light, account-linked, shareable room chat.
 * Pattern aligned with grudge-social worker (room messages + account identity).
 * Persists to DATA_DIR/treaty/ and optional Postgres on server;
 * clients also mirror via Puter KV + IndexedDB when signed in.
 */

const DEFAULT_ROOMS = [
  { id: "general", name: "General", description: "Community hangout for all Grudge builders" },
  { id: "builds", name: "Builds", description: "Share what you're building — games, tools, art" },
  { id: "help", name: "Help", description: "Ask for help, share tips and workflows" },
];

function normalizeRoomId(id) {
  const s = String(id || "general").toLowerCase().replace(/[^a-z0-9_-]/g, "");
  return s || "general";
}

function normalizeSender(body) {
  const b = body || {};
  return {
    grudgeId: String(b.grudgeId || b.uuid || b.fromUuid || "").trim() || null,
    username: String(b.username || b.user || "").trim() || "guest",
    displayName: String(b.displayName || b.user || b.username || "Guest").trim() || "Guest",
  };
}

function makeMessage(roomId, sender, text) {
  return {
    id: `t-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    roomId: normalizeRoomId(roomId),
    from: sender,
    text: String(text || "").trim().slice(0, 4000),
    ts: new Date().toISOString(),
  };
}

function roomFilePath(treatyDir, roomId) {
  const path = require("path");
  return path.join(treatyDir, "rooms", `${normalizeRoomId(roomId)}.json`);
}

function readRoomMessages(fs, treatyDir, roomId) {
  const fp = roomFilePath(treatyDir, roomId);
  try {
    if (!fs.existsSync(fp)) return [];
    const data = JSON.parse(fs.readFileSync(fp, "utf8"));
    return Array.isArray(data.messages) ? data.messages : [];
  } catch {
    return [];
  }
}

function writeRoomMessages(fs, treatyDir, roomId, messages) {
  const path = require("path");
  const dir = path.join(treatyDir, "rooms");
  fs.mkdirSync(dir, { recursive: true });
  const trimmed = messages.slice(-500);
  fs.writeFileSync(
    roomFilePath(treatyDir, roomId),
    JSON.stringify({ roomId: normalizeRoomId(roomId), messages: trimmed, updatedAt: new Date().toISOString() }, null, 2),
    "utf8"
  );
  return trimmed;
}

function appendMessage(fs, treatyDir, roomId, msg) {
  const messages = readRoomMessages(fs, treatyDir, roomId);
  messages.push(msg);
  return writeRoomMessages(fs, treatyDir, roomId, messages);
}

function shareUrl(baseUrl, roomId) {
  const u = new URL(baseUrl || "https://grudaagent.vercel.app/");
  u.searchParams.set("room", normalizeRoomId(roomId));
  return u.toString();
}

module.exports = {
  DEFAULT_ROOMS,
  normalizeRoomId,
  normalizeSender,
  makeMessage,
  readRoomMessages,
  writeRoomMessages,
  appendMessage,
  shareUrl,
};