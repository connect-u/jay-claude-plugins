---
description: Sync .jarness/ docs with code reality — absorb ad-hoc work into features/, mark stale state.
allowed-tools: Read, Write, Edit, Bash, Grep, Glob, AskUserQuestion
---

You actively reconcile a jarness project's `.jarness/` docs with code reality. When you find drift, you propose a fix per finding; the user decides yes/skip; on yes, you write the change.

Mechanical structural issues (broken refs, missing schema fields) are not your job — those are caught by `plan-lint` inside `/jarness:init`, `/jarness:add`, and `/jarness:edit`. If a manual edit broke `.jarness/` mechanically, running any of those commands re-triggers lint.

## Pre-flight

Verify `.jarness/` exists. If not, exit with an explanation.

Read the existing feature IDs by listing `.jarness/features/`. The IDs are whatever pattern this project uses — could be `f001`, `auth-flow`, `feat-x`, or anything else. Do not assume a prefix; treat the filenames (without `.yaml`) as the canonical ID set.

## Layer 1 — Detect drift

Read:

- `.jarness/log.md` (last ~30 entries, or all if fewer)
- Recent `git log` (since the last `plan` type entry in log.md, or last 30 commits, whichever is shorter)
- `.jarness/features/` (the file list — the canonical ID set)
- `.jarness/state.yaml`

Build a finding list:

- **Ad-hoc commits** — commits whose corresponding `log.md` entry (or commit subject, if log entry missing) does **not** reference any of the existing feature IDs from `features/`. The structured path always includes the feature ID in the log entry, so absence is the signal. Filter to commits that touch code (not just `.jarness/`) AND look substantive (new files, sizable additions, new dependencies). Trivial fixes/refactors → ignore (noise).
- **Stale state** — features marked `complete` in `state.yaml` whose verification criteria reference behaviors that no longer exist in the code (best-effort heuristic — read code, compare).
- **Missing log entries** — commits in git history with no corresponding entry in `log.md`. The chronological record is incomplete.

Be conservative on what you surface. Each finding will become a user decision, so noise has cost.

## Layer 2 — Per-finding reconciliation

For each finding, propose a concrete action and ask the user via `AskUserQuestion`:

### Ad-hoc commit (substantive)

Propose: *"Absorb commit `<hash> <subject>` as a new feature in this project's ID convention?"*

Options:
- **absorb** — you write a new `features/<new-id>.yaml` with description + verification (derive from the commit content), add the entry to `state.yaml` with status **`complete`** (the work is already done), and append a backfill `log.md` entry tying the commit to the new feature ID. Pick the new ID following the project's existing pattern (read existing IDs to infer).
- **skip** — leave it as ad-hoc. No artifact change.

When absorbing: keep the new feature.yaml minimal — describe what was built and how to verify it (executable steps, two modes per `verification rigor`). Don't fabricate criteria you can't infer; ask the user briefly if needed.

### Stale state

Propose: *"Feature `<id>` is marked `complete` but the criteria reference `<observation>`, which doesn't appear in the current code. Reset to `pending` for re-evaluation?"*

Options:
- **reset** — set state to `pending` so the next `/jarness:run` re-attempts.
- **edit** — drop out so the user can run `/jarness:edit` to update the criteria themselves.
- **skip** — leave as-is.

### Missing log entry

Propose: *"Commit `<hash> <subject>` has no `log.md` entry. Backfill?"*

Options:
- **backfill** — append the entry to `log.md` (using inferred type from the commit). No code change, just record-keeping.
- **skip** — leave the gap.

## Layer 3 — Wrap-up

After all findings handled:

- Summarize what was absorbed / reset / backfilled / skipped.
- If `.jarness/` changed, instruct the user to commit the changes (suggest `/jarness:commit local`).
- If nothing changed, say so plainly and exit.

## Rules

- **Per-finding consent.** Never absorb or modify silently. Each artifact write follows an explicit user yes.
- **Read existing feature IDs from `features/` to learn the project's ID pattern** — never assume a prefix like `f`. Use the same pattern when generating new IDs.
- When absorbing, prefer minimal feature.yaml content over fabricated detail. The work is already done; the spec is a *record* more than a *plan*.
- If git history is sparse (new project), drift detection has nothing to find — say so and exit gracefully.
- Don't be noisy. A small bug fix is not "drift." Calibrate toward signal.
