---
name: implement
description: Implement features with implement-review-fix discipline. Use when asked to implement, build, add feature, fix bug, or /implement.
---

# Implement Skill (GRUDA Agent)

When the user asks to **implement**, **build**, or **fix**:

1. Read relevant files first (search_files, read_file).
2. Plan minimal changes — match existing code style.
3. Implement with write_file; run_command for tests when available.
4. Self-review: correctness, edge cases, no scope creep.
5. Update gruda.md with what changed and any follow-ups.

Tool discipline: every file change uses write_file. Never claim changes without tools.