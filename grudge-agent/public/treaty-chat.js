/**
 * Treaty Chat — light account-linked shareable rooms.
 * HTTP polling + optional Puter KV mirror; no WebSocket required.
 */
(function (global) {
  const PUTER_KV_PREFIX = "gruda:treaty:room:";
  const POLL_MS = 3500;

  const TreatyChat = {
    roomId: "general",
    pollTimer: null,
    lastSeen: 0,
    onMessage: null,
    onStatus: null,

    rooms() {
      return [
        { id: "general", name: "General" },
        { id: "builds", name: "Builds" },
        { id: "help", name: "Help" },
      ];
    },

    shareUrl(roomId) {
      const u = new URL(location.href);
      u.searchParams.set("room", roomId || this.roomId);
      return u.toString();
    },

    identity() {
      const auth = global.GrudgeAuth?.user;
      return {
        grudgeId: auth?.grudgeId || null,
        username: auth?.username || auth?.puterUuid?.slice(0, 8) || "guest",
        displayName: auth?.username || global.displayName || "Guest",
      };
    },

    async fetchMessages(roomId) {
      const id = roomId || this.roomId;
      try {
        const r = await fetch(`/api/treaty/room/${encodeURIComponent(id)}/messages`);
        if (r.ok) {
          const d = await r.json();
          return d.messages || [];
        }
      } catch {}
      if (global.puter?.kv) {
        try {
          const kv = await puter.kv.get(PUTER_KV_PREFIX + id);
          if (kv?.messages) return kv.messages;
        } catch {}
      }
      return [];
    },

    async send(text) {
      const id = this.roomId;
      const body = { ...this.identity(), text, roomId: id };
      try {
        const r = await fetch(`/api/treaty/room/${encodeURIComponent(id)}/send`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const d = await r.json();
        if (d.message) return d.message;
      } catch (e) {
        console.warn("[treaty] send", e);
      }
      const fallback = {
        id: `local-${Date.now()}`,
        roomId: id,
        from: this.identity(),
        text,
        ts: new Date().toISOString(),
        local: true,
      };
      if (global.puter?.kv) {
        try {
          const key = PUTER_KV_PREFIX + id;
          const kv = (await puter.kv.get(key)) || { messages: [] };
          kv.messages = [...(kv.messages || []), fallback].slice(-500);
          await puter.kv.set(key, kv);
        } catch {}
      }
      return fallback;
    },

    start(roomId, handlers) {
      this.stop();
      this.roomId = roomId || "general";
      this.onMessage = handlers?.onMessage;
      this.onStatus = handlers?.onStatus;
      this.lastSeen = 0;
      const poll = async () => {
        const msgs = await this.fetchMessages(this.roomId);
        if (this.onStatus) this.onStatus(true);
        const fresh = msgs.filter((m) => {
          const t = new Date(m.ts || 0).getTime();
          return t > this.lastSeen;
        });
        if (msgs.length) {
          const last = msgs[msgs.length - 1];
          this.lastSeen = Math.max(this.lastSeen, new Date(last.ts || 0).getTime());
        }
        for (const m of fresh) {
          if (this.onMessage) this.onMessage(m);
        }
      };
      poll();
      this.pollTimer = setInterval(poll, POLL_MS);
    },

    stop() {
      if (this.pollTimer) clearInterval(this.pollTimer);
      this.pollTimer = null;
    },
  };

  global.GrudaTreaty = TreatyChat;
})(typeof window !== "undefined" ? window : globalThis);