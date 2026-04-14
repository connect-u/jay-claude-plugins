---
allowed-tools: Read, Write, Bash, Glob
description: Initialize cc-git project memory in .claude/cc-git/
argument-hint: "[optional: brief project description]"
---

Initialize `.claude/cc-git/` project memory. Scan the codebase, generate `features/*.md` per major feature area, then synthesize into `INDEX.md`.

## Output Structure

```
.claude/cc-git/
├── INDEX.md          # Project snapshot — always read first
├── commits/          # Per-commit detail files (created on first /cc-git:commit)
└── features/         # Per-feature context files (generated from codebase scan)
    ├── auth.md
    └── api.md
```

**Do NOT create `COMMITS.md`** — it is created automatically on the first `/cc-git:commit`.

## Steps

### 1. Check existing

If `.claude/cc-git/INDEX.md` exists, ask: reinitialize or abort.

### 2. Read all documentation and config files

```bash
find . -name "*.md" -not -path "*/node_modules/*" -not -path "*/.git/*" -not -path "*/.claude/*"
```

Read every `.md` file found. Also read config files (skip missing):
- `package.json`, `pyproject.toml`, `Cargo.toml`, `go.mod`, `*.config.*`, `.env.example`

If documentation is sparse or unclear, read actual source files as needed to understand how features work.

### 3. Read directory structure

```bash
find . -type d -not -path "*/node_modules/*" -not -path "*/.git/*" -not -path "*/dist/*" -not -path "*/build/*" -not -path "*/__pycache__/*" -not -path "*/.next/*" | sort
```

Browse key source directories (`src/`, `app/`, `lib/`, etc.) to understand how features are organized.

### 4. Create directories

```bash
mkdir -p .claude/cc-git/commits .claude/cc-git/features
```

### 5. Generate features/*.md

Based on full understanding from steps 2-3, identify the major feature areas of this project.
For each, write `features/<name>.md`:

```markdown
# <feature-name>

## Purpose
<one sentence>

## Architecture
<key file:line refs, how it works>

## Key Decisions
(none yet)

## Constraints
(none yet)

## Gotchas
(none yet)
```

Focus on what's already in the code. Leave sections as `(none yet)` if unknown.

### 6. Write INDEX.md

Now synthesize everything — including the features just created — into INDEX.md:

```markdown
# <project-name>

stack: <lang> / <framework> / <db or none>
entry: <main entrypoint file:line if known>
test: <test command>
lint: <lint command>

## Structure
<dir>/   # <one-line purpose>

## Key Files
<path>:<line>  # <what it does>

## Features
| feature | file | status |
|---------|------|--------|
| <name>  | features/<name>.md | active |

## Conventions
- <convention>

## Notes
- <anything non-obvious>
```

### 7. Confirm

Report INDEX.md and features/*.md files created. Tell user: use `/cc-git:commit` after sessions, `/cc-git:feat <name>` or `/cc-git:fix <name>` to start work.
