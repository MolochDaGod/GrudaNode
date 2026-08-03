---
name: env-threejs-rapier
description: >
  GRUDA Environment tab scene generation for three.js / Rapier / Phaser / Node.
  USE FOR: Environment Generate button, sandbox Play scenes, skill-backed
  deployable modules on ai.grudge-studio.com. Loads threejs-production,
  grudge-rapier, world-scale, assets rules into /api/env/scene prompts.
---

# Environment · Three.js + Rapier skills

## API

| Endpoint | Role |
|----------|------|
| `GET /api/env/system-prompt?engine=three\|rapier\|phaser\|node` | Full skill system prompt |
| `POST /api/env/scene` | Generate Play-able module |
| `GET/POST /api/env/scenes` | Save/load per project |

## Skills baked into prompts

1. **threejs-production-best-practices** — one renderer, SI units, no hot-loop alloc, sRGB/ACES when available, dispose  
2. **grudge-rapier** — `await RAPIER.init()`, fixed step, density > 0, fixed trimesh only, SI gravity, no Cannon  
3. **grudge-world-scale** — 1 unit = 1 m, human ~1.8 m  
4. **grudge-warlords-assets** — only `assetUrl()` → assets.grudge-studio.com  

## Output contract

- ESM only (importmap host)  
- `GRUDA.boot(ctx, onFrame)` + `registerPlugin`  
- Complete Play-able scene (not a snippet)  
- No markdown fences  

## Engines

| Select | Imports |
|--------|---------|
| three.js | `three`, `three/addons/...` |
| three.js + rapier | + `@dimforge/rapier3d-compat` |
| phaser | `phaser` |
| node | server script, fleet health fetch OK |

## Related fleet hosts

- Full MMO: grudgewarlords.com (Island3D PhysicsWorld)  
- This sandbox: ai.grudge-studio.com Environment tab  
