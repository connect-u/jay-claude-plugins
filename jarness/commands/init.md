---
description: Bootstrap jarness for a new project. Drives planning conversation, then runs lint→evaluate loop with user-controlled decisions.
allowed-tools: Read, Write, Edit, Grep, Glob, Bash, Agent, AskUserQuestion
args:
  - name: overview
    description: "Optional brief service description (e.g. 'React + Node todo app'). Used as starting context."
    required: false
---

You drive the planning phase end-to-end. The user is your collaborator, not a downstream consumer of artifacts.

## Pre-flight

If `.jarness/` already exists, ask the user whether to reinitialize (back up to `.jarness.bak/`) or abort.

## Plan (you do this — no subagent)

Gather and design interleaved. Draft as you learn; let drafting surface the next question. Don't batch all questions at the start; don't decide silently when ambiguity exists.

### When to ask the user

Ask when data is missing, logic has a gap, or multiple reasonable paths exist. Stop asking when remaining uncertainty wouldn't derail an autonomous developer.

Use `AskUserQuestion` by default. Plain text is only for free-form answers (project names, descriptions, paths, identifiers that can't be enumerated).

**Anti-pattern — LLMs default to this. Don't:**

- "Q1 ... / Q2 ..." with numbered options in plain text.
- "1) X 2) Y 3) Z 중 하나 골라주세요" in plain text.
- Plain-text yes/no.

Any discrete choice belongs in `AskUserQuestion`. If you catch yourself numbering options in plain text, stop and reissue through the tool. Group related independent questions into a single call; ask dependent ones one at a time.

If the project has existing code or docs, read them before asking redundant questions. If the `overview` arg was provided, use it as starting context — don't re-ask what it answers.

### Who reads your artifacts

Downstream agents consume them in isolation:

- `project.yaml` — loaded by every `feature-developer` / `feature-evaluator` invocation. Orientation doc. Must contain: what the project is, how to run it, conventions, external dependencies, verification tooling.
- `features/<id>.yaml` — loaded alone when that feature is implemented or verified. Self-contained. The developer sees only this file plus `project.yaml`. If a feature depends on another, say so explicitly.
- `state.yaml` — read and written by `/jarness:start` while looping through features. You initialize all features as `pending`.

A downstream agent hitting ambiguity either stalls or guesses. Both are expensive — a bad guess wastes full dev→eval cycles. Your artifacts decide which happens.

### Verification rigor

Every verification step in `features/<id>.yaml` must be **executable** — a sequence a human or agent can literally follow, with what to observe at the end. Two modes, depending on the feature:

- **Concrete expected value applies** — specify the exact shape, value, or range. *"POST /todos with `{title:"x"}` → expect 201 with body `{id:<uuid>, title:"x", done:false}`"*. *"run `mycli count` → expect stdout matching `/^\d+$/`"*.
- **No exact value, but designed behavior** — specify the observable flow. *"navigate to /todos → click 'Add' → type 'foo' → click Submit → expect 'foo' row in list within 1s, no error toast"*. The criterion is not "form works" but the observable sequence.

For UI features, exercise the actual interface (navigate, click, type) — not just "page returns 200". For API features, send real payloads and assert response shape — not just "endpoint responds". For CLI, run the command and check stdout/exit code.

**Anti-pattern — flag and fix if you catch yourself writing these:**

- *"works correctly"*, *"can submit"*, *"can do X"*, *"no error"*, *"as expected"* — descriptions, not verifications. They let the evaluator pass on "didn't crash" without exercising designed behavior. The exact phrase that triggers false-pass.

### Output

Write YAML to `.jarness/`:

```
.jarness/
├── project.yaml
├── features/
│   ├── f001.yaml
│   └── ...
└── state.yaml
```

No fixed schema within files — shape content to what downstream agents need given the environment described above. Feature size should be "one focused development cycle, implementable alone."

## Lint → Evaluate → User loop

Once a draft (or revision) is written:

1. **Delegate to `plan-lint`** — mechanical/structural checks. May auto-fix unambiguous issues (broken refs, missing `state.yaml` entries). Returns auto-fixes performed and any remaining mechanical issues.

   If `plan-lint` reports `issues-remain`, fix them before continuing. Mechanical breakage is not a user decision.

2. **Delegate to `plan-evaluator`** — judgment-side review (specificity, product coherence). Show the full report to the user.

3. **User decides** — use `AskUserQuestion`:
   - **re-run** — address the concerns. Re-engage the user on the points that need new information, revise artifacts, repeat the loop.
   - **complete** — plan accepted. If `.git` exists, stage `.jarness/` and commit with a message describing the plan. Output `<promise>INIT COMPLETE</promise>` followed by a 3–5 sentence summary of what was built and the key decisions made.
   - **pause** — stop here. Resume later with `/jarness:update`.
