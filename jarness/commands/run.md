---
description: Run jarness development. Iterates through pending features, developing and evaluating each.
allowed-tools: Read, Write, Edit, Grep, Glob, Agent, AskUserQuestion
args:
  - name: id
    description: "Feature ID to develop (e.g. f003). If provided, develops only that feature."
    required: false
params:
  features:
    type: number
    default: 3
    description: Number of pending features to process. Ignored if --id is provided.
  cycles:
    type: number
    default: 7
    description: Max dev→eval cycles per feature.
---

Run jarness development.

## Pre-flight

Read `.jarness/` to load project state. If not found, tell the user to run `/jarness:init` first.

If no args given, use `AskUserQuestion` to confirm defaults before starting.

## Feature selection

- If `--id` is provided: target that single feature only. Ignore `--features`.
- Otherwise: collect the next `{{features}}` pending or in-progress features in order.

Skip features already marked `complete`.

## Execution

For each target feature:

### Resume check

Check the feature's status in `state.yaml`:
- `complete` → skip.
- `in-progress` → resume from last cycle. Load stored evaluator feedback from `state.yaml`. Remaining cycles = {{cycles}} minus already-completed cycles.
- `pending` or not found → start fresh from cycle 1 with no prior feedback.

### Dev→eval loop (max remaining cycles)

1. Delegate to `feature-developer` agent.
   - Pass: feature spec (`features/<id>.yaml`), project context (`project.yaml`), and evaluator feedback if present.

2. Delegate to `feature-evaluator` agent.
   - Pass: feature spec (`features/<id>.yaml`) and project context (`project.yaml`).
   - `complete` → update `state.yaml` (status: complete), move to next feature.
   - `needs-improvement` or `redo` → store feedback in `state.yaml` (status: in-progress, cycle count, feedback summary), continue loop.

3. **Persist state after every cycle.**

On cycles exhausted: mark as `incomplete` in `state.yaml`. Persist last evaluator feedback. Log summary of remaining issues.

## After all target features are processed

Summarize the run from this conversation's context:

```
# Jarness Run Report

## Summary
X features complete, Y incomplete, Z pending — N total cycles used

## Features
- ✅ f001: <title> (N cycles)
- ❌ f002: <title> (N cycles) — <last evaluator feedback, one line>
- ⏳ f003: <title> — pending

## Notes
<Only if something stands out. Skip if nothing notable.>
```

Then output `<promise>RUN COMPLETE</promise>`.

## Hard Rules

- Proceed autonomously without asking for confirmation after the initial start.
- Never skip a feature's evaluation — every dev cycle must be followed by an eval cycle.
- If a feature exhausts its cycles, log it as incomplete and move on to the next feature.
