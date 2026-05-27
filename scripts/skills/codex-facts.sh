#!/bin/bash
# Guard: pin the Codex platform facts the skill-agent-pipeline reference docs assert.
# CI cannot lint prose, and these facts drifted once already (the agents.max_depth
# nesting correction + an incomplete model_reasoning_effort list, fixed 2026-05-27).
# Fails if the reference doc names a model id / sandbox value / reasoning-effort
# outside the canonical Codex sets, drops a required value, or revives the discredited
# "subagents cannot spawn subagents" claim.
# Sources (confirmed 2026-05-27): developers.openai.com/codex {subagents, sandbox,
#   models, config-reference}. Author-side only; skips cleanly when the doc is absent.
set -u
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
SAP="$REPO_DIR/plugins/docks/skills/productivity/skill-agent-pipeline"
DOC="$SAP/references/codex-agents-builder.md"
errors=0

if [ ! -f "$DOC" ]; then
  echo "Guard SKIPPED: codex-agents-builder.md not present ($DOC)"
  exit 0
fi

# 1. Every gpt-5* model token must be a real, current Codex model id.
CODEX_MODELS="gpt-5.5 gpt-5.4 gpt-5.4-mini gpt-5.3-codex gpt-5.3-codex-spark gpt-5.2"
while read -r tok; do
  [ -z "$tok" ] && continue
  case " $CODEX_MODELS " in
    *" $tok "*) ;;
    *) echo "FAIL: codex-agents-builder.md references unknown Codex model id '$tok' (allowed: $CODEX_MODELS)" >&2
       errors=$((errors + 1)) ;;
  esac
done < <(grep -oE 'gpt-5\.[0-9]+(-[a-z]+)*' "$DOC" | sort -u)

# 2. model_reasoning_effort: the full canonical set must be documented (it was once incomplete).
for v in minimal low medium high xhigh; do
  grep -qE "\"$v\"" "$DOC" || {
    echo "FAIL: codex-agents-builder.md missing model_reasoning_effort value \"$v\" (set: minimal/low/medium/high/xhigh)" >&2
    errors=$((errors + 1))
  }
done

# 3. sandbox_mode: all three canonical values must be present.
for v in read-only workspace-write danger-full-access; do
  grep -q "$v" "$DOC" || {
    echo "FAIL: codex-agents-builder.md missing sandbox_mode value '$v'" >&2
    errors=$((errors + 1))
  }
done

# 4. Nesting fact: agents.max_depth must be documented; the discredited claim must not return.
grep -q 'agents.max_depth' "$DOC" || {
  echo "FAIL: codex-agents-builder.md must document the agents.max_depth nesting fact (single-level dispatch ports)" >&2
  errors=$((errors + 1))
}
if grep -rniE 'cannot spawn subagents|subagents cannot spawn' "$SAP" >/dev/null 2>&1; then
  echo "FAIL: skill-agent-pipeline revives the discredited 'cannot spawn subagents' claim — Codex allows depth-1 dispatch (agents.max_depth: 1)" >&2
  errors=$((errors + 1))
fi

if [ "$errors" -gt 0 ]; then
  echo "Guard FAILED: $errors Codex-fact drift error(s) in skill-agent-pipeline reference docs" >&2
  exit 1
fi
echo "Guard PASSED: skill-agent-pipeline Codex facts match canonical sets"
exit 0
