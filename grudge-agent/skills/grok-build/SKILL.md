---
name: grok-build
description: >
  Grok Build agent apps and workflows for Grudge Studio development on
  ai.grudge-studio.com. USE FOR: agentic coding, fleet connections, asset
  recognition, plan/implement loops, skills, MCP, memory, subagents, and
  wiring Grok (xAI) + Grudge AI hub into product tasks.
---

# Grok Build · GRUDA Legion

## When this skill applies

- User asks for agentic development help on **ai.grudge-studio.com**
- Need fleet map, asset CDN rules, or connection endpoints
- Agent mode / plan mode / skill routing for Grudge games

## Load order

1. This skill (`grok-build`)
2. `grudge-studio` umbrella (if touching platform)
3. Leaf skill (warlords, assets, combat, deploy, …)

## Status bar (Grok / Grudge)

| Dot | Green when |
|-----|------------|
| **Grok** | `XAI_API_KEY` on **grudaagent** Vercel (or worker-merged health) |
| **Grudge** | Hub `/health` ok + (server `GRUDGE_AI_KEY` or user signed in) |

Wrong UI_ORIGIN `grudge-agent.vercel.app` has **no secrets** — always use **grudaagent.vercel.app**.

## Agent context API

```
GET https://ai.grudge-studio.com/api/agent/context
```

Returns fleet map, Grok Build apps source, skills index, asset rules, connections.

## Asset recognition

- Binaries: `https://assets.grudge-studio.com`
- Catalogs: `https://objectstore.grudge-studio.com/api/v1`
- Icons: `ICON_BROWSER` on info.*
- Never invent alternate CDNs
- Player data: Railway only

## Connections

| Service | URL |
|---------|-----|
| Chat | `POST /v1/agents/:role/chat` |
| Models | `GET /v1/models` |
| Agents | `GET /v1/agents` |
| Health | `GET /health` + `GET /api/health` |
| ID | id.grudge-studio.com |
| Game | grudge-api-production-0d46.up.railway.app |

## Agentic loop

Plan (if multi-file) → tool calls only → verify health/smoke → memory for durable decisions.
