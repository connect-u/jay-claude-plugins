---
description: Add one or more new features to the jarness plan. Drives planning conversation, then runs lint→evaluate loop.
allowed-tools: Read, Write, Edit, Grep, Glob, Bash, Agent, AskUserQuestion
---

You drive a feature-addition phase end-to-end. The user is your collaborator.

## Pre-flight

Read `.jarness/project.yaml` and `.jarness/state.yaml`. If not found, tell the user to run `/jarness:init`.

## Plan (you do this — no subagent)

Ask the user what to add, gather context as needed, and design the new feature file(s). Same conversational approach as `/jarness:init` — draft as you learn, ask when ambiguous, never decide silently when paths diverge.

### When to ask the user

Use `AskUserQuestion` by default. Plain text is only for free-form answers.

**Anti-pattern — LLMs default to this. Don't:**

- "Q1 ... / Q2 ..." with numbered options in plain text.
- "1) X 2) Y 3) Z 중 하나 골라주세요" in plain text.
- Plain-text yes/no.

Any discrete choice belongs in `AskUserQuestion`. Group related independent questions; ask dependent ones one at a time.

### Pick feature IDs

Read `features/` to find the highest existing ID. New features take the next IDs in sequence.

### Verification rigor

When writing verification steps in new `features/<id>.yaml`, the same rigor applies as in `/jarness:init`:

- Every step must be **executable** — a literal sequence a human or agent can follow.
- **Concrete expected value applies** → specify exact shape/value/range (e.g. *"POST /todos with `{title:"x"}` → expect 201 with body `{id:<uuid>, title:"x", done:false}`"*).
- **No exact value, but designed behavior** → specify the observable flow (e.g. *"navigate to /todos → click 'Add' → type 'foo' → click Submit → expect 'foo' row appears within 1s, no error toast"*).
- Exercise the actual interface — UI: click/type/navigate; API: real payload + response shape; CLI: command + stdout/exit code.

**Anti-pattern**: *"works correctly"*, *"can submit"*, *"no error"*, *"as expected"* — descriptions, not verifications. They trigger false-pass.

## Hard rules

- Don't touch existing features. Use `/jarness:edit` for modifications.
- New features must be initialized as `pending` in `state.yaml`.

## Lint → Evaluate → User loop

Once new feature file(s) are written:

1. **Delegate to `plan-lint`** — mechanical/structural checks. May auto-fix unambiguous issues. Returns auto-fixes performed and any remaining mechanical issues.

   If `plan-lint` reports `issues-remain`, fix them before continuing.

2. **Delegate to `plan-evaluator`** — re-evaluates the full `.jarness/` (not just the new parts). Show the report to the user.

3. **User decides** via `AskUserQuestion`:
   - **re-run** — address the concerns and repeat the loop.
   - **complete** — accepted. If `.git` exists: append a `## [YYYY-MM-DD] plan | <subject>` line to `.jarness/log.md` (create the file with a one-line header if missing), then stage `.jarness/` (including `log.md`) and commit with a message describing the additions. Output `<promise>ADD COMPLETE</promise>`.
   - **pause** — stop here.
