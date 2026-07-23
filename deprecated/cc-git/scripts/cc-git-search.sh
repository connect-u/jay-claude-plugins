#!/usr/bin/env bash
# cc-git-search.sh — Load project memory for a feature/fix session
# Usage: bash cc-git-search.sh <search-term>
# Outputs: INDEX, COMMITS table, matching features, matching commit snippets

set -euo pipefail

QUERY="${1:-}"
BASE=".claude/cc-git"

# --- INDEX ---
echo "===INDEX==="
if [[ -f "$BASE/INDEX.md" ]]; then
  cat "$BASE/INDEX.md"
else
  echo "(no INDEX.md found — run /cc-git:init first)"
fi

# --- COMMITS ---
echo ""
echo "===COMMITS==="
if [[ -f "$BASE/COMMITS.md" ]]; then
  cat "$BASE/COMMITS.md"
else
  echo "(no COMMITS.md yet)"
fi

# --- MATCHING FEATURES ---
echo ""
echo "===MATCHING_FEATURES==="
if [[ -z "$QUERY" ]]; then
  echo "(no search term given)"
else
  found=0
  for f in "$BASE/features/"*.md; do
    [[ -f "$f" ]] || continue
    if grep -qi "$QUERY" "$f" 2>/dev/null; then
      echo "--- $f ---"
      cat "$f"
      found=1
    fi
  done
  if [[ $found -eq 0 ]]; then
    echo "(none matched '$QUERY')"
  fi
fi

# --- MATCHING COMMITS ---
echo ""
echo "===MATCHING_COMMITS==="
if [[ -z "$QUERY" ]]; then
  echo "(no search term given)"
else
  found=0
  for f in "$BASE/commits/"*.md; do
    [[ -f "$f" ]] || continue
    if grep -qi "$QUERY" "$f" 2>/dev/null; then
      echo "--- $f ---"
      # Print first 30 lines of matching commit to keep output lean
      head -30 "$f"
      found=1
    fi
  done
  if [[ $found -eq 0 ]]; then
    echo "(none matched '$QUERY')"
  fi
fi
