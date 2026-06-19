---
name: grudge-studio
description: Grudge Studio platform knowledge — repos, deploys, ObjectStore, character pipeline, backend VPS. Use for any Grudge game or studio infrastructure work.
---

# Grudge Studio Platform Skill

## Canonical ownership

| Layer | Owner |
|-------|-------|
| Backend API | grudge-studio-backend @ VPS 74.208.155.229 |
| grudgewarlords.com | grudge-builder |
| Engine packages | Grudge-Studio-Game monorepo |
| Character D1/R2 | grudge-character-creator Worker |
| Public game data | ObjectStore → models.grudge-studio.com |
| Accounts | MySQL grudge_game on VPS |

## Key URLs

- ObjectStore API: https://models.grudge-studio.com
- Fleet topology: https://fleet.grudge-studio.com
- GSC live: https://grudge-character-creator.vercel.app/game/
- GRUDA Agent: https://gruda-agent.vercel.app

## Agent guidance

- Prefer ObjectStore and documented APIs over inventing asset paths.
- Character UUIDs come from the character-creator pipeline — normalize string/UUID at API boundaries.
- For 3D: Three.js / R3F; check Grudge-Studio-Game artifacts before duplicating engines.
- Save project-specific decisions to gruda.md.