---
description: Sync .jarness/ docs with code reality — detect drift between recent work and planned features/.
allowed-tools: Read, Bash, Grep, Glob, AskUserQuestion
---

You detect drift between a jarness project's recent code work and its planned features/. You surface findings; the user decides what to do about them.

Mechanical structural issues (broken refs, missing schema fields) are not your job — those are caught by `plan-lint` inside `/jarness:init`, `/jarness:add`, and `/jarness:edit`. If a manual edit broke `.jarness/` mechanically, running any of those commands re-triggers lint.

## Pre-flight

Verify `.jarness/` exists. If not, exit with an explanation.

## Layer 1 — Drift detection

Read:

- `.jarness/log.md` (last ~30 entries, or all if fewer)
- Recent `git log` (since the last `plan` type entry in log.md, or last 30 commits, whichever is shorter)
- `.jarness/features/` file list with brief descriptions
- `.jarness/state.yaml`

Identify drift signals:

- **Ad-hoc commits** — commits where the subject does **not** reference any feature ID (e.g., `f001`, `f002`) AND that touch code (not just `.jarness/`). The structured path (`feature-developer`) always references feature IDs in subjects, so absence is a signal.
- **Substantive ad-hoc work** — among ad-hoc commits, surface those that look like new capability (new files, sizable additions, new dependencies). Trivial fixes and refactors can be ignored — flagging them is noise.
- **Stale state** — features marked `complete` in `state.yaml` whose verification criteria reference behaviors that no longer exist in the code (best-effort heuristic — read the code, compare).
- **Missing log entries** — commits in git history with no corresponding entry in `log.md`. The chronological record is incomplete; the commit convention was bypassed.

Be conservative. Surface only signals that reasonably warrant user attention. Drift findings are *reports*, never auto-fixes.

## Layer 2 — Report

Show the user:

```
### Ad-hoc work not in features/
- <commit hash> <subject> — <why this looks substantive>
- ...

### Stale or inconsistent state
- [findings, if any]

### Missing log entries
- <commit hash> <subject> — no entry in log.md
- ...
```

If everything is clean, say so plainly and exit.

## Layer 3 — User decides

Use `AskUserQuestion`:

- **add** — promote substantive ad-hoc work as new feature(s). Drop out of `/jarness:sync` so the user can run `/jarness:add` cleanly.
- **edit** — fix stale state or otherwise revise existing features. Drop out so the user can run `/jarness:edit`.
- **acknowledge** — accept current drift as intentional. No artifact changes; the report is for awareness.
- **pause** — exit, the user will handle manually.

## Rules

- This command only reports. Never modify `features/`, `state.yaml`, or any artifact.
- Don't be noisy. A small bug fix is not "drift." Calibrate toward signal.
- If git history is sparse (new project), drift detection has nothing to find — say so and exit gracefully.
