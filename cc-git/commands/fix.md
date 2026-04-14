---
allowed-tools: Read, Bash
description: Start a bug fix session with relevant project context loaded, emphasizing recent commit history
argument-hint: "<bug-or-issue-name>"
---

Load project memory for a bug fix session. Prioritizes recent commits — most bugs come from recent changes.

## Steps

### 1. Run search

```bash
BASE=".claude/cc-git"
QUERY="$ARGUMENTS"
echo "===INDEX==="; cat "$BASE/INDEX.md" 2>/dev/null || echo "(not found — run /cc-git:init first)"
echo ""
echo "===COMMITS==="; cat "$BASE/COMMITS.md" 2>/dev/null || echo "(none yet)"
echo ""
echo "===MATCHING_FEATURES==="
matched=0
for f in "$BASE/features/"*.md; do
  [[ -f "$f" ]] || continue
  grep -qi "$QUERY" "$f" 2>/dev/null && { echo "--- $f ---"; cat "$f"; matched=1; }
done
[[ $matched -eq 0 ]] && echo "(none matched)"
echo ""
echo "===MATCHING_COMMITS==="
matched=0
for f in "$BASE/commits/"*.md; do
  [[ -f "$f" ]] || continue
  grep -qi "$QUERY" "$f" 2>/dev/null && { echo "--- $f ---"; head -30 "$f"; matched=1; }
done
[[ $matched -eq 0 ]] && echo "(none matched)"
```

### 2. Parse output — focus on recency

- **===COMMITS===**: scan most recent 3-5 rows first — look for changes related to the bug
- **===MATCHING_COMMITS===**: read closely for decisions/changes that could explain the bug
- **===MATCHING_FEATURES===**: understand intended behavior to distinguish bug from design
- **===INDEX===**: architecture constraints for the fix

If a recent commit clearly touches the bug area, read that full commit file:
```bash
cat .claude/cc-git/commits/<NNN-name>.md
```

### 3. Present brief summary (5 lines max)

```
Context loaded for fix: <bug-name>
Stack: <from INDEX>
Possibly related commits: <recent or matching commit names>
Relevant feature docs: <filenames or "none">
```

### 4. Begin investigation

Use loaded context to understand: what changed recently, intended behavior, architectural constraints.

### 5. Suggest commit at end

"Run `/cc-git:commit` to record what was changed and why."
