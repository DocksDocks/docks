#!/bin/bash
# Guard: validate context-tree node pairs (nested AGENTS.md + one-line CLAUDE.md).
# Every folder carrying either context file must be a COMPLETE node:
#   - both AGENTS.md and CLAUDE.md present (no half-pairs)
#   - CLAUDE.md is exactly the one-line `@AGENTS.md` import
#   - AGENTS.md is <= 500 lines (node-body ceiling)
# The repo root is a node too: root CLAUDE.md is the bare `@AGENTS.md` import,
# root AGENTS.md is the cross-tool entry point. See
# plugins/docks/skills/productivity/context-tree.
# Usage: ./guard-tree.sh [repo-root]   (default: inferred from script location)
set -u
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="${1:-$SCRIPT_DIR/..}"
ROOT="$(cd "$ROOT" && pwd)"
errors=0
nodes=0

# Unique directories (excluding .git / node_modules) that contain either context file.
node_dirs=$(find "$ROOT" \( -name .git -o -name node_modules \) -prune -o \
  -type f \( -name AGENTS.md -o -name CLAUDE.md \) -print \
  | xargs -n1 dirname | LC_ALL=C sort -u)

while IFS= read -r dir; do
  [ -n "$dir" ] || continue
  if [ "$dir" = "$ROOT" ]; then rel="(root)"; else rel="${dir#"$ROOT"/}"; fi
  nodes=$((nodes + 1))
  agents="$dir/AGENTS.md"
  claude="$dir/CLAUDE.md"

  if [ ! -f "$agents" ]; then
    echo "FAIL: $rel — CLAUDE.md present but AGENTS.md missing (half-pair)" >&2
    errors=$((errors + 1)); continue
  fi
  if [ ! -f "$claude" ]; then
    echo "FAIL: $rel — AGENTS.md present but CLAUDE.md missing (invisible to Claude Code's walker)" >&2
    errors=$((errors + 1)); continue
  fi

  # CLAUDE.md must be exactly the one-line `@AGENTS.md` import (ignore blank lines + trailing ws)
  claude_body=$(grep -vE '^[[:space:]]*$' "$claude" | sed 's/[[:space:]]*$//')
  if [ "$claude_body" != "@AGENTS.md" ]; then
    echo "FAIL: $rel/CLAUDE.md — must contain only '@AGENTS.md' (move any other content into AGENTS.md)" >&2
    errors=$((errors + 1))
  fi

  # AGENTS.md <= 500 lines (node-body ceiling)
  alines=$(wc -l < "$agents" | tr -d ' ')
  if [ "$alines" -gt 500 ]; then
    echo "FAIL: $rel/AGENTS.md — $alines lines (cap: 500). Split the folder or tighten." >&2
    errors=$((errors + 1))
  fi
done <<EOF
$node_dirs
EOF

if [ "$errors" -gt 0 ]; then
  echo "guard-tree FAILED: $errors error(s) across $nodes node(s)" >&2
  exit 1
fi
echo "guard-tree PASSED: $nodes context-tree node(s) valid"
exit 0
