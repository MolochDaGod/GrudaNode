---
name: design
description: Run design-doc writer/reviewer loop for system design, architecture docs, and technical specs. Use when asked to design, write a design doc, or /design.
---

# Design Skill (GRUDA Agent)

When the user asks to **design**, **architect**, or **write a spec**:

1. Clarify scope in one question if ambiguous.
2. Draft a design doc structure: Problem → Goals → Architecture → Data/API → Risks → PR plan.
3. Save the draft to `gruda.md` under `## Design: <topic>` via update_memory.
4. Self-review: list open questions and trade-offs before implementation.
5. Propose an ordered PR plan (small, mergeable steps).

Do not implement code in design mode unless the user explicitly asks to proceed.