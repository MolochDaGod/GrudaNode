/**
 * GRUDA Agent — Auto mode picks Chat vs Agent from message intent.
 */
(function (global) {
  const AGENT_RE = new RegExp(
    "\\b(create|build|deploy|fix|implement|write|run|npm|npx|pnpm|git|forge|voxel|game|file|folder|code|debug|test|orchestrat|worker|terminal|shell|mineloader|codex|idea|scene|three\\.js|rapier|phaser)\\b|^\\/|```",
    "i"
  );

  function pick(text, ctx) {
    const t = String(text || "").trim();
    if (!t) return "chat";
    if (AGENT_RE.test(t)) return "agent";
    if (t.length < 60 && !t.includes("?")) return "chat";
    if (ctx?.hasOllama || ctx?.hasGrok) return "agent";
    return "chat";
  }

  function label(mode) {
    if (mode === "auto") return "⚡ Auto";
    if (mode === "agent") return "🤖 Agent";
    return "💬 Chat";
  }

  global.GrudaAutoMode = { pick, label, AGENT_RE };
})(typeof window !== "undefined" ? window : globalThis);