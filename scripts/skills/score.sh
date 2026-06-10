#!/bin/bash
# Mechanical skill quality scorer
# Scores each SKILL.md against agentskills.io + project conventions.
# Max per-file: 16.
#
# Provenance:
#  - "docs"    — Anthropic-documented (code.claude.com/docs/en/skills, agentskills.io)
#  - "project" — kit-specific convention (see CLAUDE.md "Authoring skills, commands & agents")
#
# Output: single total, or `<name> <score>` per skill with --per-file

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
MODE="total"
DIR=""
for arg in "$@"; do
  case "$arg" in
    --per-file) MODE="per-file" ;;
    *) DIR="$arg" ;;
  esac
done
DIR="${DIR:-$REPO_DIR/plugins/docks/skills}"
total=0
today=$(date +%s)

# ${#var} must count CHARACTERS, not bytes — em-dash-heavy descriptions inflate
# 3× under a C/POSIX locale and would mis-tier at the 500-char boundary.
utf8_loc=$(locale -a 2>/dev/null | grep -iEm1 '^(C|en_US)\.(utf-?8)$' || true)
[ -n "$utf8_loc" ] && export LC_ALL="$utf8_loc"

for skill_dir in "$DIR"/*/*/; do
  [ -d "$skill_dir" ] || continue
  skill_name=$(basename "$skill_dir")
  category=$(basename "$(dirname "$skill_dir")")
  file="$skill_dir/SKILL.md"
  [ -f "$file" ] || continue
  score=0

  # Third-party vendored skills opt into relaxed scoring via `upstream:` frontmatter block
  has_upstream=$(grep -c '^upstream:' "$file")

  # 1. [docs-example] Description starts with "Use when" (2 pts) — matches every
  #    Anthropic doc example; upstream: skills accept "Use when" anywhere
  desc=$(grep '^description:' "$file" | head -1 | sed 's/^description:[[:space:]]*//')
  # Strip surrounding YAML quotes so the prefix check works for both quoted + unquoted styles
  desc_clean="${desc#\"}"; desc_clean="${desc_clean%\"}"
  desc_clean="${desc_clean#\'}"; desc_clean="${desc_clean%\'}"
  desc_len=${#desc_clean}
  if [ "$has_upstream" -gt 0 ]; then
    echo "$desc_clean" | grep -qiE 'use when' && score=$((score + 2))
  else
    echo "$desc_clean" | grep -qiE '^use when' && score=$((score + 2))
  fi

  # 2. [docs+project] Description tightness — tiered (2 pts max).
  #    Two ceilings interact: (a) per-skill agentskills.io spec truncates at 1,536
  #    chars combined description+when_to_use; (b) Claude Code's
  #    skillListingBudgetFraction (default 1% of context) drops descriptions when
  #    the AGGREGATE listing overruns. The guard already enforces a hard ≤1,024
  #    cap on description; this scorer rewards staying tight enough to share the
  #    aggregate budget cleanly with peer skills. Tier on raw description length
  #    (the listing text users + Claude both see):
  #      ≤500 chars: 2 pts (CSO-tight, fits aggregate budget)
  #      ≤1000 chars: 1 pt (under guard cap but crowds the listing)
  #      >1000 chars: 0 pts (likely contributes to listing truncation)
  if [ "$desc_len" -gt 0 ] && [ "$desc_len" -le 500 ]; then
    score=$((score + 2))
  elif [ "$desc_len" -gt 0 ] && [ "$desc_len" -le 1000 ]; then
    score=$((score + 1))
  fi

  # 3. [project] Freshness within last 180 days (1 pt) — metadata.updated for kit
  #    skills; fall back to upstream.vendored_at for upstream: skills
  updated=$(awk '/^metadata:/{in_meta=1; next} in_meta && /^[a-z]/{in_meta=0} in_meta && /updated:/{print; exit}' "$file" \
            | sed 's/.*updated:[[:space:]]*"\{0,1\}\([0-9-]*\)"\{0,1\}.*/\1/')
  if [ -z "$updated" ] && [ "$has_upstream" -gt 0 ]; then
    updated=$(awk '/^upstream:/{in_up=1; next} in_up && /^[a-z]/{in_up=0} in_up && /vendored_at:/{print; exit}' "$file" \
              | sed 's/.*vendored_at:[[:space:]]*"\{0,1\}\([0-9-]*\)"\{0,1\}.*/\1/')
  fi
  if [ -n "$updated" ]; then
    updated_ts=$(date -d "$updated" +%s 2>/dev/null || date -j -f "%Y-%m-%d" "$updated" +%s 2>/dev/null || echo 0)  # GNU, then BSD
    if [ "$updated_ts" -gt 0 ]; then
      age_days=$(( (today - updated_ts) / 86400 ))
      [ "$age_days" -le 180 ] && score=$((score + 1))
    fi
  fi

  # 4. [project] <constraint> blocks for non-negotiable rules (1 pt each, max 3)
  constraint_count=$(grep -c '<constraint>' "$file")
  cc=$constraint_count
  [ "$cc" -gt 3 ] && cc=3
  score=$((score + cc))

  # 5. [project] BAD/GOOD examples present (2 pts) — accept "BAD"/"GOOD" or
  #    "Wrong"/"Right" idioms
  if { grep -qE '\bBAD\b|//\s*BAD|#\s*BAD' "$file" && grep -qE '\bGOOD\b|//\s*GOOD|#\s*GOOD' "$file"; } \
     || { grep -qiE 'wrong fix' "$file" && grep -qiE 'right fix' "$file"; }; then
    score=$((score + 2))
  fi

  # 6. [project] No slop words (2 pts, lose 1 per hit). Fenced code blocks and
  #    backtick code spans are stripped first: QUOTING a banned word (write-skill's
  #    ban list, a BAD example inside a fence) is not prose slop — only running
  #    text is penalized.
  slop=$(awk '/^```/{infence=!infence; next} !infence' "$file" | sed 's/`[^`]*`//g' | grep -ciE '\bcomprehensive\b|\brobust\b|\belegant\b|\bseamless\b')
  slop_score=$((2 - slop))
  [ "$slop_score" -lt 0 ] && slop_score=0
  score=$((score + slop_score))

  # 7. [project] At least one markdown table for rule summaries (1 pt)
  grep -qE '^\|.*\|' "$file" && score=$((score + 1))

  # 8. [project] Code fences with language tags (1 pt)
  grep -qE '^```[a-z]+' "$file" && score=$((score + 1))

  # 9. [docs-aligned] Body size in sweet spot 80–310 lines (2 pts).
  #    Anthropic tip: keep SKILL.md under 500 lines. Separate hard cap: Claude
  #    Code's compaction logic re-attaches only the first 5,000 tokens of each
  #    invoked skill post-summary (25K shared across all re-attached skills) —
  #    content beyond that is silently dropped. Measured ~12 tokens/line in this
  #    kit's skills at 4.6 density; Opus 4.7's tokenizer runs ~1.35× higher
  #    (~16 tok/line), so 5,000 tokens ÷ 16 ≈ 310 lines is the 4.7-safe ceiling.
  #    Anything past 310 risks post-compact truncation; anything past ~500 hits
  #    Anthropic's soft tip — move detail into references/ files instead.
  body_lines=$(awk '/^---$/ && c<2 {c++; next} c==2 {print}' "$file" | wc -l)
  if [ "$body_lines" -ge 80 ] && [ "$body_lines" -le 310 ]; then
    score=$((score + 2))
  fi

  if [ "$MODE" = "per-file" ]; then
    echo "$category/$skill_name $score"
  fi
  total=$((total + score))
done

if [ "$MODE" = "total" ]; then
  echo "$total"
fi
