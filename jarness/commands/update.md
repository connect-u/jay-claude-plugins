---
description: Update the jarness plan. Modify features, criteria, or project config through a collect→architect→evaluate loop.
allowed-tools: Read, Write, Edit, Grep, Glob, Agent, AskUserQuestion
---

Update the existing jarness plan.

## Pre-flight

Read `.jarness/project.yaml` and `.jarness/state.yaml`. If not found, tell the user to run `/jarness:init`.

## Loop

Each iteration:

1. Delegate to `plan-collector`.
   - First iteration: pass the current `.jarness/` state. Collector asks the user what they want to change and gathers additional context.
   - Subsequent iterations: pass the previous evaluation report. Collector re-engages the user only for issues that need new information.

2. Delegate to `plan-architect`.
   - Pass the collector's summary + current `.jarness/` state.
   - Modify only what's needed — do not rewrite unrelated files.
   - Subsequent iterations: address raised issues.

3. Delegate to `plan-evaluator`.
   - Re-evaluates the full `.jarness/` (not just the changed parts).
   - Provides a comprehensive evaluation report.
   - Show the full report to the user.

4. **User decides** — use `AskUserQuestion`:
   - **recycle** — run another pass to address the issues.
   - **pause** — stop here.
   - **complete** — accept. Output `<promise>UPDATE COMPLETE</promise>`.

## Hard Rules

- Preserve progress state in `state.yaml` — completed features stay completed unless the user explicitly says to reset them.
- If a feature's criteria changed and it was already marked complete in `state.yaml`, flag it for re-evaluation.
- New features added to `features/` must also be initialized as `pending` in `state.yaml`.
