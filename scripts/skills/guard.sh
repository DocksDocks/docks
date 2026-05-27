#!/bin/bash
# Guard: validate SKILL.md files against both Codex and Claude conventions.
# Usage: ./guard.sh [path]   (default: plugins/docks/skills)
set -u
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DIR="${1:-}"

if [ -n "$DIR" ]; then
  bash "$SCRIPT_DIR/codex.sh" "$DIR" || exit $?
  bash "$SCRIPT_DIR/claude.sh" "$DIR" || exit $?
else
  bash "$SCRIPT_DIR/codex.sh" || exit $?
  bash "$SCRIPT_DIR/claude.sh" || exit $?
fi

# Codex platform-fact drift guard for the skill-agent-pipeline reference docs
# (path-independent; self-skips when that skill is absent).
bash "$SCRIPT_DIR/codex-facts.sh" || exit $?

echo "Guard PASSED: skills match Codex and Claude conventions"
