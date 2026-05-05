#!/bin/bash
# Guard: validate command markdown structure hasn't been broken.
# Accepts two flavors:
#   - Thin orchestrator:  `subagent_type: foo-bar` references; Success Criteria
#     lives in the corresponding plugins/docks/agents/<name>.md files
#   - Inline single-session:  no subagents (mechanical scaffolders, idempotent
#     workflows); Success Criteria embedded in the command body
#
# The legacy `<task>...</task>` flavor was deprecated in May 2026 — `<task>`
# blocks anywhere in a command file are now a structural error. Single-session
# commands use plain markdown phases with `### Success Criteria` subsections.
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DIR="${1:-$SCRIPT_DIR/../plugins/docks/commands}"
errors=0

for f in "$DIR"/*.md; do
  name=$(basename "$f")

  task_open=$(grep -c '<task>' "$f")
  task_close=$(grep -c '</task>' "$f")
  subagent_refs=$(grep -cE '`subagent_type:|subagent_type: `' "$f")

  # Legacy <task>...</task> blocks are no longer accepted.
  if [ "$task_open" -gt 0 ] || [ "$task_close" -gt 0 ]; then
    echo "FAIL: $name — legacy <task>...</task> blocks no longer accepted; use thin orchestrator (subagent_type: refs) or inline phases with '### Success Criteria' subsections" >&2
    errors=$((errors + 1))
    continue
  fi

  if [ "$subagent_refs" -gt 0 ]; then
    flavor="thin"
  else
    flavor="inline"
  fi

  if [ "$flavor" = "inline" ]; then
    # Inline single-session commands keep Success Criteria in the body
    # (thin orchestrators push it to plugins/docks/agents/<name>.md files).
    if ! grep -q 'Success Criteria' "$f"; then
      echo "FAIL: $name — no Success Criteria found (inline single-session command must keep it in the body)" >&2
      errors=$((errors + 1))
    fi
  fi

  # Must not be empty or suspiciously short (applies to both flavors)
  lines=$(wc -l < "$f")
  if [ "$lines" -lt 50 ]; then
    echo "FAIL: $name — suspiciously short ($lines lines)" >&2
    errors=$((errors + 1))
  fi

  # Thin commands: verify every subagent_type reference resolves to an agent file
  if [ "$flavor" = "thin" ]; then
    AGENTS_DIR="$SCRIPT_DIR/../plugins/docks/agents"
    # Extract agent names from patterns like `subagent_type: foo-bar` or `subagent_type: \`foo-bar\``
    agents=$(grep -oE "subagent_type: \`?[a-z][a-z0-9-]+\`?" "$f" \
             | sed -E 's/subagent_type: `?([a-z0-9-]+)`?/\1/' | sort -u)
    for a in $agents; do
      if [ ! -f "$AGENTS_DIR/${a}.md" ]; then
        echo "FAIL: $name — subagent_type '$a' has no matching $AGENTS_DIR/${a}.md" >&2
        errors=$((errors + 1))
      fi
    done
  fi

  # Must have Phase Transition Protocol if 3+ phases (CLAUDE.md convention)
  phase_count=$(grep -cE '^## Phase [0-9]' "$f")
  if [ "$phase_count" -ge 3 ]; then
    if ! grep -q 'Phase Transition Protocol' "$f"; then
      echo "FAIL: $name — $phase_count phases but no Phase Transition Protocol" >&2
      errors=$((errors + 1))
    fi
  fi

  # If command instructs research via context7/WebFetch, it must also permit WebFetch.
  # Check passes if WebFetch or WebSearch appears in any Allowed-Tools-adjacent context
  # (either a `## Allowed Tools` section or a `<constraint>`-wrapped Allowed Tools block).
  if grep -qE 'resolve-library-id|context7|query-docs' "$f"; then
    if ! grep -qiE 'Allowed Tools|allowed-tools' "$f"; then
      echo "FAIL: $name — research instructed but no Allowed Tools section" >&2
      errors=$((errors + 1))
    elif ! grep -qE 'WebFetch|WebSearch' "$f"; then
      echo "FAIL: $name — research instructed but WebFetch/WebSearch not permitted" >&2
      errors=$((errors + 1))
    fi
  fi
done

if [ "$errors" -gt 0 ]; then
  echo "Guard FAILED: $errors structural errors" >&2
  exit 1
fi
echo "Guard PASSED: all commands structurally valid"
exit 0
