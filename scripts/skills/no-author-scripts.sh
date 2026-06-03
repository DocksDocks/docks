#!/usr/bin/env bash
# no-author-scripts.sh — shipped skills/agents must not name docks plugin-author
# scripts as steps a consumer runs.
#
# scripts/ is author-side tooling (see scripts/AGENTS.md) — it never ships into a
# consumer's project. A shipped SKILL.md/agent body that says "run scripts/ci.sh"
# or "bash scripts/tree/guard.sh" is broken the moment the skill runs anywhere but
# this repo (the context-tree audit hit exactly this). Verification inside a
# shipped skill must be SELF-CONTAINED (an inline check) or refer GENERICALLY to
# "the project's CI / validators, if present" — never a docks script path.
#
# Scope: shipped skill bodies (SKILL.md + references/*.md) and agent bodies
# (agents/*.md). NOT the author-side AGENTS.md/CLAUDE.md nodes — those describe
# this repo's own tooling and may name scripts freely.
#
# Allowlist: tooling-authoring skills whose subject IS the docks tooling — they
# legitimately seed (scaffold) or document (write-skill) what they name. Keep it
# tiny; a general-purpose skill never belongs here.
set -u
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
SKILLS_DIR="$REPO_DIR/plugins/docks/skills"
AGENTS_DIR="$REPO_DIR/plugins/docks/agents"

ALLOWLIST="scaffold write-skill"

# Real docks author-script paths only. Deliberately NOT bare "scripts/" so generic
# examples a skill tells a consumer to create (scripts/install-hooks.sh,
# scripts/hitl-loop.sh) and node files (scripts/AGENTS.md) do not trip it.
PATTERN='scripts/(ci|release)\.sh|scripts/(skills|agents|tree|scaffold|config|lib)/'

files=$(
  find "$SKILLS_DIR" -type f \( -name SKILL.md -o \( -path '*/references/*' -a -name '*.md' \) \) 2>/dev/null
  find "$AGENTS_DIR" -type f -name '*.md' 2>/dev/null
)

report=""
while IFS= read -r f; do
  [ -n "$f" ] || continue
  skill=$(printf '%s' "$f" | sed -E "s#^$SKILLS_DIR/[^/]+/([^/]+)/.*#\1#")
  case " $ALLOWLIST " in *" $skill "*) continue ;; esac
  hits=$(grep -nE "$PATTERN" "$f" 2>/dev/null) || true
  [ -n "$hits" ] && report="$report"$'\n'"$(printf '%s\n' "$hits" | sed "s#^#${f#"$REPO_DIR"/}:#")"
done <<< "$files"

report=$(printf '%s' "$report" | sed '/^$/d')

if [ -n "$report" ]; then
  printf '%s\n' "$report" | sed 's/^/FAIL: /' >&2
  n=$(printf '%s\n' "$report" | grep -c .)
  echo "no-author-scripts FAILED: $n reference(s) to docks author scripts in shipped skills/agents." >&2
  echo "Use a self-contained inline check or 'the project's CI/validators, if present' — not a docks script path. Tooling-authoring allowlist: $ALLOWLIST" >&2
  exit 1
fi

echo "no-author-scripts PASSED: no shipped skill/agent names docks author tooling (allowlist: $ALLOWLIST)"
exit 0
