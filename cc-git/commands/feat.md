---
allowed-tools: Read, Bash
description: Start a feature development session with relevant project context loaded
argument-hint: "<feature-name>"
---

Load project memory for a feature session. Minimize manual file reading.

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

### 2. Parse output

- **===INDEX===**: project stack, structure, conventions
- **===COMMITS===**: recent history at a glance
- **===MATCHING_FEATURES===**: existing context for this feature area
- **===MATCHING_COMMITS===**: past sessions related to this feature

### 3. Present brief summary (5 lines max)

```
Context loaded for: <feature-name>
Stack: <from INDEX>
Related feature docs: <filenames or "none">
Related past commits: <commit names or "none">
```

### 4. Begin development

Proceed directly using loaded context.

### 5. Suggest commit at end

When work reaches a natural stopping point:
"Run `/cc-git:commit` to save this session."
