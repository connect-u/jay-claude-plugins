#!/bin/bash
# Detect .jarness/ in the working directory and output a brief status + commit convention.

if [ -d ".jarness" ] && [ -f ".jarness/project.yaml" ]; then
  echo "jarness project detected. Run /jarness:status to see progress, or /jarness:run to resume development."
  echo ""
  echo "Commit convention: prefer /jarness:commit (modes: local | push | pr). It appends a one-line entry to .jarness/log.md and includes it in the same commit. If committing some other way, manually append '## [YYYY-MM-DD] <type> | <subject>' to .jarness/log.md and stage it with the commit so the chronological record stays in sync."
fi
