---
description: Commit jarness project changes with a log.md entry. Optionally push or open a PR.
allowed-tools: Read, Write, Edit, Bash, AskUserQuestion
args:
  - name: mode
    description: "local | push | pr. If omitted, asks the user."
    required: false
---

You commit changes in a jarness project, ensuring `.jarness/log.md` has a corresponding entry **in the same commit** — atomic.

## Pre-flight

- Verify `.jarness/` exists. If not, tell the user `/jarness:commit` is for jarness projects and exit.
- Run `git status`. If nothing to commit, say so and exit.
- If only unstaged changes exist (nothing staged), ask via `AskUserQuestion` whether to stage all and proceed, or cancel.
- If both staged and unstaged exist, ask whether to commit only the staged set, or stage everything.

## Mode selection

If the `mode` arg was provided as one of `local`, `push`, `pr`, use it directly. Otherwise ask via `AskUserQuestion` with these three options:

- **local** — commit only
- **push** — commit + push to remote
- **pr** — commit + push + open a GitHub PR

## Compose

Read `git status`, `git diff --staged`, and a few recent entries from `git log` (to match style). Determine:

- **type** for the log entry: `plan` (only `.jarness/` changed), `dev` (only code), `mixed` (both).
- **subject**: concise one-line summary in the project's style.
- **body** (optional): a few lines on *why*, when non-trivial.

Match the project's existing commit message conventions — if recent commits include a `Co-Authored-By` line, follow that pattern; if not, don't add one.

## Update log.md

Append one line to `.jarness/log.md`:

```
## [YYYY-MM-DD] <type> | <subject>
```

Use today's local date (`date +%Y-%m-%d`). Keep entries scannable — one line per commit. The full message lives in the commit itself; log.md is the chronological index.

If `.jarness/log.md` doesn't exist, create it with a one-line header (e.g. `# jarness log`) and add the entry.

## Commit

Stage everything that should be in this commit (existing staged files + `log.md`). Run `git commit` using a HEREDOC for the message. Never use `--no-verify` or skip hooks.

If a pre-commit hook fails: investigate, fix the issue, re-stage, create a NEW commit (do not `--amend`).

## Tail (mode-specific)

- **local** — done. Show the new commit hash.
- **push** — `git push`. If upstream not set, use `git push -u origin <current-branch>`. Show commit hash and push result.
- **pr** — push first (same as above), then `gh pr create --title "<subject>" --body "<body>"`. If a PR for this branch already exists, update its description instead of creating a duplicate. Show the resulting PR URL.

## Rules

- Never stage files that look like secrets (`.env`, `credentials.json`, `keys/`, etc).
- Don't `--amend` existing commits — always create new commits.
- Don't push to `main`/`master` unless the user explicitly asked.
- Match existing project conventions; don't impose new ones.
