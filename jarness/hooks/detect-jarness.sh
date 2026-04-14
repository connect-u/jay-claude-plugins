#!/bin/bash
# Detect .jarness/ in the working directory and output a brief status hint.

if [ -d ".jarness" ] && [ -f ".jarness/project.yaml" ]; then
  echo "jarness project detected. Run /jarness:status to see progress, or /jarness:start to resume development."
fi
