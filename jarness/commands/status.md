---
description: Show current jarness project status and progress.
allowed-tools: Read, Grep, Glob
---

Read `.jarness/` and display the current project status.

If `.jarness/` is not found, tell the user to run `/jarness:init`.

## What to read

1. `project.yaml` — project summary
2. `features/` — list all feature files
3. `state.yaml` — per-feature status and progress

## Display

- Project summary (from `project.yaml`)
- Feature progress: complete / in-progress / pending / incomplete counts, with per-feature status
- **In-progress features**: show cycle count and last evaluator feedback summary — the user needs this to decide whether to resume or reset.
- Attention items: blocked features, unresolved evaluator feedback, features that hit max retries

Keep it scannable — a short table or compact list, not a wall of text.

## Next step suggestion

Based on status, suggest one command:
- Has in-progress features → `/jarness:run --id <id>` (resume one) or `/jarness:run` (resume all)
- All features pending → `/jarness:run`
- Specific feature needs retry → `/jarness:run --id <id>`
- Plan needs changes → `/jarness:edit` (modify existing) or `/jarness:add` (add new)
- Drift between code and docs → `/jarness:sync`
- Nothing initialized → `/jarness:init`
