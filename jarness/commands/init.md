---
description: Bootstrap jarness for a new project. Runs collect→architect→evaluate loop with user-controlled decisions.
allowed-tools: Read, Write, Grep, Glob, Agent, AskUserQuestion
args:
  - name: overview
    description: "Optional brief service description (e.g. 'React + Node 투두앱'). If provided, collector uses it as starting context."
    required: false
---

## Pre-flight

If `.jarness/` already exists, ask the user whether to reinitialize (backs up to `.jarness.bak/`) or abort.

## Loop

Each iteration:

1. Delegate to `plan-collector`.
   - First iteration: collect project context from the user through conversation.
   - Subsequent iterations: pass the previous evaluation report. Collector re-engages the user only for issues that need new information.

2. Delegate to `plan-architect`.
   - First iteration: produce `.jarness/` artifacts from the collector's summary.
   - Subsequent iterations: pass the collector's summary + evaluation report. Address raised issues.

3. Delegate to `plan-evaluator`.
   - Provides a comprehensive evaluation report (strengths, issues, overall assessment).
   - Show the full report to the user.

4. **User decides** — use `AskUserQuestion`:
   - **re-run** — run another collect→architect→evaluate pass to address the issues.
   - **complete** — plan is good enough. Output `<promise>INIT COMPLETE</promise>`.
   - **pause** — stop here. Resume later with `/jarness:update`.
