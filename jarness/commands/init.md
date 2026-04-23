---
description: Bootstrap jarness for a new project. Runs author→evaluate loop with user-controlled decisions.
allowed-tools: Read, Write, Grep, Glob, Agent, AskUserQuestion
args:
  - name: overview
    description: "Optional brief service description (e.g. 'React + Node todo app'). If provided, passed to the architect as starting context."
    required: false
---

## Pre-flight

If `.jarness/` already exists, ask the user whether to reinitialize (backs up to `.jarness.bak/`) or abort.

## Loop

Each iteration:

1. Delegate to `plan-architect`.
   - First iteration: gather requirements from the user through conversation and produce `.jarness/` artifacts. Pass the `overview` arg if provided.
   - Subsequent iterations: pass the previous evaluation report. Architect re-engages the user only for gaps that need new information, then revises artifacts.

2. Delegate to `plan-evaluator`.
   - Provides a comprehensive evaluation report (strengths, issues, overall assessment).
   - Show the full report to the user.

3. **User decides** — use `AskUserQuestion`:
   - **re-run** — run another author→evaluate pass to address the issues.
   - **complete** — plan is good enough. Output `<promise>INIT COMPLETE</promise>`.
   - **pause** — stop here. Resume later with `/jarness:update`.
