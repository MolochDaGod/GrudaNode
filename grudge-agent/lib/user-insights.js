"use strict";

/**
 * User insight files — structured memory that grows from onboarding + sessions.
 * Stored under DATA_DIR/insights/ (server) and mirrored in browser IndexedDB (Vercel).
 */

const INSIGHT_SLUGS = ["profile", "goals", "projects", "preferences", "growth"];

const INSIGHT_FILES = {
  profile: "user-profile.md",
  goals: "user-goals.md",
  projects: "user-projects.md",
  preferences: "user-preferences.md",
  growth: "user-insights.md",
};

function slugToFile(slug) {
  return INSIGHT_FILES[slug] || `${slug}.md`;
}

function normalizeAnswers(answers) {
  if (!answers || typeof answers !== "object") return {};
  return {
    name: String(answers.name || answers.userName || "Friend").trim() || "Friend",
    role: String(answers.role || "").trim(),
    goals: String(answers.goals || "").trim(),
    projects: String(answers.projects || "").trim(),
    preferences: String(answers.preferences || "").trim(),
  };
}

function buildInsightFilesFromAnswers(answers, opts = {}) {
  const a = normalizeAnswers(answers);
  const aiName = opts.aiName || "GRUDA";
  const ts = opts.createdAt || new Date().toISOString();

  const files = {
    profile: [
      `# User Profile`,
      ``,
      `> Source: onboarding · ${ts}`,
      ``,
      `- **Name:** ${a.name}`,
      a.role ? `- **Role / craft:** ${a.role}` : null,
      `- **AI assistant:** ${aiName}`,
    ].filter(Boolean).join("\n"),

    goals: [
      `# Goals & Intent`,
      ``,
      `> Source: onboarding · ${ts}`,
      ``,
      a.goals ? a.goals : "_No goals captured yet._",
    ].join("\n"),

    projects: [
      `# Typical Projects`,
      ``,
      `> Source: onboarding · ${ts}`,
      ``,
      a.projects ? a.projects : "_No project context captured yet._",
    ].join("\n"),

    preferences: [
      `# Work Style & Preferences`,
      ``,
      `> Source: onboarding · ${ts}`,
      ``,
      a.preferences ? a.preferences : "_No preferences captured yet._",
    ].join("\n"),

    growth: [
      `# Growing User Insights`,
      ``,
      `> This file grows over time from your sessions with GRUDA Agent.`,
      `> Last updated: ${ts}`,
      ``,
      `## Onboarding snapshot`,
      ``,
      `- **${a.name}** — ${a.role || "role not specified"}`,
      a.goals ? `- Goals: ${a.goals.slice(0, 300)}` : null,
      a.projects ? `- Projects: ${a.projects.slice(0, 300)}` : null,
      a.preferences ? `- Preferences: ${a.preferences.slice(0, 300)}` : null,
      ``,
      `## Session learnings`,
      ``,
      `_Insights from conversations will be appended here._`,
    ].filter(Boolean).join("\n"),
  };

  return { files, answers: a };
}

function appendGrowthInsight(existing, block) {
  const stamp = new Date().toISOString();
  const entry = `### ${stamp}\n${String(block || "").trim()}`;
  const base = String(existing || "").trim()
    .replace(/_Insights from conversations will be appended here\._\n?/, "");
  if (!base) {
    return `# Growing User Insights\n\n> Last updated: ${stamp}\n\n## Session learnings\n\n${entry}\n`;
  }
  return `${base}\n\n${entry}\n`;
}

function buildGrowthPrompt(messages, existingGrowth) {
  const transcript = (messages || [])
    .slice(-12)
    .map(m => `${m.role}: ${String(m.content || "").slice(0, 800)}`)
    .join("\n\n");
  return (
    `Extract 2-5 durable facts about this user from the conversation below.\n` +
    `Focus on: goals, tools, preferences, recurring topics, decisions, blockers.\n` +
    `Skip greetings and one-off trivia. Use short bullet points. No preamble.\n\n` +
    (existingGrowth ? `Existing insights (do not repeat):\n${existingGrowth.slice(-1200)}\n\n` : "") +
    `Conversation:\n${transcript}`
  );
}

function compileInsightsForPrompt(insightMap) {
  if (!insightMap || typeof insightMap !== "object") return "";
  const parts = [];
  for (const slug of INSIGHT_SLUGS) {
    const text = insightMap[slug];
    if (text && String(text).trim()) {
      parts.push(`### ${slug}\n${String(text).slice(0, 2000)}`);
    }
  }
  return parts.join("\n\n");
}

module.exports = {
  INSIGHT_SLUGS,
  INSIGHT_FILES,
  slugToFile,
  normalizeAnswers,
  buildInsightFilesFromAnswers,
  appendGrowthInsight,
  buildGrowthPrompt,
  compileInsightsForPrompt,
};