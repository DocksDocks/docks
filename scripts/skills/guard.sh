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

# Reference hygiene: broken local links, orphan references, missing TOC on
# reference files > 100 lines (Anthropic best-practice). Node-based (no shell
# parsing of markdown); node+yaml is already a guard prerequisite above.
if [ -n "$DIR" ]; then
  node "$SCRIPT_DIR/refs-guard.mjs" "$DIR" || exit $?
else
  node "$SCRIPT_DIR/refs-guard.mjs" || exit $?
fi

echo "Guard PASSED: skills match Codex and Claude conventions"
