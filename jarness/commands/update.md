---
description: Update the jarness plan. Modify features, criteria, or project config through an author→evaluate loop.
allowed-tools: Read, Write, Edit, Grep, Glob, Agent, AskUserQuestion
---

Update the existing jarness plan.

## Pre-flight

Read `.jarness/project.yaml` and `.jarness/state.yaml`. If not found, tell the user to run `/jarness:init`.

## Loop

Each iteration:

1. Delegate to `plan-architect`.
   - First iteration: pass the current `.jarness/` state. Architect asks the user what to change, gathers additional context, and modifies affected artifacts.
   - Subsequent iterations: pass the previous evaluation report. Architect re-engages the user only for gaps that need new information.

2. Delegate to `plan-evaluator`.
   - Re-evaluates the full `.jarness/` (not just the changed parts).
   - Provides a comprehensive evaluation report.
   - Show the full report to the user.

3. **User decides** — use `AskUserQuestion`:
   - **re-run** — run another author→evaluate pass to address the issues.
   - **complete** — accept. Output `<promise>UPDATE COMPLETE</promise>`.
   - **pause** — stop here.

## Hard Rules

- Preserve progress state in `state.yaml` — completed features stay completed unless the user explicitly says to reset them.
- If a feature's criteria changed and it was already marked complete in `state.yaml`, flag it for re-evaluation.
- New features added to `features/` must also be initialized as `pending` in `state.yaml`.
