---
allowed-tools: Read, Write, Bash
description: Save current session snapshot to cc-git project memory
argument-hint: "[optional: commit title]"
---

Save current session to project memory. Write one detailed commit file + update metadata + patch INDEX/features if needed.

## Steps

### 1. Determine commit number and name

If `.claude/cc-git/COMMITS.md` does not exist, create it first:
```markdown
# Commits

| # | name | summary | date |
|---|------|---------|------|
```

Then count existing data rows:
```bash
grep -c "^|" .claude/cc-git/COMMITS.md 2>/dev/null || echo 0
```

Next number = (count - 1), zero-padded to 3 digits. Name: use argument if given, otherwise derive short kebab-case name from session content.

### 2. Write commits/NNN-name.md

```markdown
# NNN name

date: YYYY-MM-DD
summary: <one sentence>

## Changes
- `<file>:<line>` — <what changed and why it matters>

## Decisions
- <decision>: <reasoning> (alternatives: <alt1>, <alt2>)

## Next
- <concrete next action>
```

**Changes**: specific file paths + line numbers where meaningful.
**Decisions**: capture *why*, not just *what*. Most valuable section.
**Next**: actionable items only.

### 3. Update COMMITS.md

Append one row:
```
| NNN | name | <summary> | YYYY-MM-DD |
```

### 4. Update INDEX.md if needed

Patch only if: new dirs/key files added, new feature introduced, stack changed. Use Edit (not full rewrite).

### 5. Update features/ if needed

If session significantly changed a feature's architecture:
- If `features/<name>.md` exists → patch it
- If not → ask: "Create `features/<name>.md`?"

features/ file format:
```markdown
# <feature-name>

## Purpose
<one sentence>

## Architecture
<key file:line refs>

## Key Decisions
- <decision>: <why>

## Constraints
- <invariant to preserve>

## Gotchas
- <non-obvious behavior>
```

### 6. Confirm

Print: commit file path, COMMITS.md row added, files patched.
