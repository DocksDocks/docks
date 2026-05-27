#!/bin/bash
# Guard: validate agent markdown structural correctness for every agent in a directory
# Usage: ./guard.sh [path-or-file]   (default: plugins/docks/agents)
set -u
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
ARG="${1:-$REPO_DIR/plugins/docks/agents}"
errors=0

# Accept either a directory or a single file.
if [ -f "$ARG" ]; then
  FILES=("$ARG")
elif [ -d "$ARG" ]; then
  # Agents stay flat at agents/<name>.md (depth-1). Plugin manifest doesn't
  # accept an `agents` field, so the Claude Code plugin loader auto-discovers
  # agents only at this depth.
  FILES=("$ARG"/*.md)
  if ! compgen -G "$ARG/*.md" > /dev/null; then
    echo "Guard PASSED: no agent files found in $ARG"
    exit 0
  fi
else
  echo "FAIL: agents path not found: $ARG" >&2
  exit 1
fi

for file in "${FILES[@]}"; do
  [ -f "$file" ] || continue
  name_fromfile=$(basename "$file" .md)
  # Skip the .gitkeep sentinel + reserved context-tree node files. AGENTS.md /
  # CLAUDE.md are never agent definitions (uppercase fails the kebab-case name
  # rule anyway); this dir doubles as a context-tree node validated by scripts/tree/guard.sh.
  case "$name_fromfile" in .gitkeep|AGENTS|CLAUDE) continue ;; esac

  # Must open with `---` frontmatter fence on line 1
  first_line=$(head -n 1 "$file")
  if [ "$first_line" != "---" ]; then
    echo "FAIL: $name_fromfile — does not start with '---' frontmatter fence" >&2
    errors=$((errors + 1))
    continue
  fi

  # Must have a closing `---` fence
  fence_count=$(grep -c '^---$' "$file")
  if [ "$fence_count" -lt 2 ]; then
    echo "FAIL: $name_fromfile — frontmatter fence not closed (found $fence_count '---' lines)" >&2
    errors=$((errors + 1))
    continue
  fi

  # name field must match filename
  name_field=$(grep '^name:' "$file" | head -1 | sed 's/^name:[[:space:]]*//')
  if [ "$name_field" != "$name_fromfile" ]; then
    echo "FAIL: $name_fromfile — name field ('$name_field') does not match filename" >&2
    errors=$((errors + 1))
  fi

  # name must be kebab-case, no "anthropic"/"claude", ≤64 chars
  if ! echo "$name_field" | grep -qE '^[a-z][a-z0-9-]{0,63}$'; then
    echo "FAIL: $name_fromfile — name not kebab-case or >64 chars ('$name_field')" >&2
    errors=$((errors + 1))
  fi
  if echo "$name_field" | grep -qiE 'anthropic|claude'; then
    echo "FAIL: $name_fromfile — name must not contain 'anthropic' or 'claude'" >&2
    errors=$((errors + 1))
  fi

  # description: present, 10–1024 chars, starts with "Use when", contains a "Not" clause
  desc=$(grep '^description:' "$file" | head -1 | sed 's/^description:[[:space:]]*//')
  desc_len=${#desc}
  if [ "$desc_len" -lt 10 ]; then
    echo "FAIL: $name_fromfile — description missing or too short ($desc_len chars)" >&2
    errors=$((errors + 1))
  elif [ "$desc_len" -gt 1024 ]; then
    echo "FAIL: $name_fromfile — description exceeds 1024 chars ($desc_len)" >&2
    errors=$((errors + 1))
  fi
  if ! echo "$desc" | grep -qiE '^use when'; then
    echo "FAIL: $name_fromfile — description must start with 'Use when' (CSO)" >&2
    errors=$((errors + 1))
  fi
  if ! echo "$desc" | grep -qiE '\bnot\b'; then
    echo "FAIL: $name_fromfile — description missing 'Not for…' exclusion clause (prevents delegation collisions)" >&2
    errors=$((errors + 1))
  fi

  # model field: sonnet | opus | haiku | inherit | claude-*-*-*
  model=$(grep '^model:' "$file" | head -1 | sed 's/^model:[[:space:]]*//')
  if ! echo "$model" | grep -qE '^(sonnet|opus|haiku|inherit|claude-[a-z0-9-]+)$'; then
    echo "FAIL: $name_fromfile — model field invalid ('$model'); expected sonnet|opus|haiku|inherit|claude-*" >&2
    errors=$((errors + 1))
  fi

  # tools field: present and non-empty
  tools=$(grep '^tools:' "$file" | head -1 | sed 's/^tools:[[:space:]]*//')
  if [ -z "$tools" ]; then
    echo "FAIL: $name_fromfile — tools field missing or empty" >&2
    errors=$((errors + 1))
  fi

  # Body (post-frontmatter) ≤ 500 lines
  # `&& c<2` cap prevents `---` lines inside body code fences (e.g., YAML examples)
  # from being counted as a third frontmatter marker, which would truncate the body.
  body_lines=$(awk '/^---$/ && c<2 {c++; next} c==2 {print}' "$file" | wc -l)
  if [ "$body_lines" -gt 500 ]; then
    echo "FAIL: $name_fromfile — body is $body_lines lines (cap: 500). Extract detail out of the agent prompt" >&2
    errors=$((errors + 1))
  fi

  # Body must include at least one <constraint> block
  if ! grep -q '<constraint>' "$file"; then
    echo "FAIL: $name_fromfile — no <constraint> block in body" >&2
    errors=$((errors + 1))
  fi

  # Body must have `## Workflow` and `## Success Criteria`
  if ! grep -q '^## Workflow' "$file"; then
    echo "FAIL: $name_fromfile — missing '## Workflow' section" >&2
    errors=$((errors + 1))
  fi
  if ! grep -q '^## Success Criteria' "$file"; then
    echo "FAIL: $name_fromfile — missing '## Success Criteria' section" >&2
    errors=$((errors + 1))
  fi

  # Bundled SKILL.md must load via ${CLAUDE_PLUGIN_ROOT} (substituted inline in
  # agent content), never a repo-relative path — that only resolves in the
  # plugin's own source tree, so it 404s in every consumer repo and the agent
  # silently falls back. See plugins-reference §Environment variables.
  bad_skill_refs=$(grep -nE '/SKILL\.md' "$file" | grep -v 'CLAUDE_PLUGIN_ROOT' || true)
  if [ -n "$bad_skill_refs" ]; then
    echo "FAIL: $name_fromfile — bundled SKILL.md must load via \${CLAUDE_PLUGIN_ROOT}, not a repo-relative path:" >&2
    echo "$bad_skill_refs" | sed 's/^/    /' >&2
    errors=$((errors + 1))
  fi

  # Plugin subagents cannot spawn subagents, so `Agent` in their tools list is
  # inert (Agent(agent_type) has no effect in a subagent definition). Flag it so
  # dispatch logic isn't written against a capability the agent doesn't have.
  if echo "$tools" | grep -qE '(^|[, ])Agent([,(]| |$)'; then
    echo "FAIL: $name_fromfile — 'Agent' in tools is inert for a plugin subagent (subagents cannot spawn subagents); remove it and dispatch from the main conversation" >&2
    errors=$((errors + 1))
  fi
done

if [ "$errors" -gt 0 ]; then
  echo "Guard FAILED: $errors structural errors" >&2
  exit 1
fi
echo "Guard PASSED: all agents structurally valid"
exit 0
