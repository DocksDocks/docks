#!/usr/bin/env bash
# skill-guard.sh — portable SKILL.md validator + 16-pt scorer, shipped inside
# the write-skill skill so the validation loop works in consumer repos where
# the docks kit's author-side validators don't exist.
#
# Self-contained: bash + grep/awk/sed/wc only (Linux + macOS, bash 3.2-safe).
# Mirrors the kit's frontmatter guard subset and scorer rubric — when the kit
# rubric changes, this mirror changes in the same commit (see the skills
# AGENTS.md node; scripts/ is not content-hashed, bump metadata.updated).
#
# Usage:
#   bash skill-guard.sh [--strict] <skill-dir> [<skill-dir> ...]
#   bash skill-guard.sh [--strict] <skills-root>     # walks for SKILL.md files
#
# FAIL (exit 1) — spec/loader violations every runtime rejects:
#   missing/unfenced frontmatter, non-kebab or dir-mismatched name, empty or
#   >1024-char description, angle brackets in description, unquoted '#'
#   truncation hazard, body >500 lines, nested references/ subdirectory.
# WARN (FAIL with --strict) — docks conventions:
#   no 'Use when' prefix, description >500 chars, missing user-invocable,
#   missing/stale metadata.updated, body outside 80-310, slop words in prose.
#
# Limit: 'description:' must be a single line; YAML block scalars are not
# parsed by this heuristic checker (the kit's Node validator handles those).
set -u

STRICT=0
if [ "${1:-}" = "--strict" ]; then STRICT=1; shift; fi
if [ "$#" -lt 1 ]; then
  echo "usage: skill-guard.sh [--strict] <skill-dir|skills-root> ..." >&2
  exit 2
fi

# Count CHARACTERS, not bytes — em-dash-heavy descriptions inflate 3x under a
# C/POSIX locale and would mis-tier at the 500/1024-char boundaries.
utf8_loc=$(locale -a 2>/dev/null | grep -iEm1 '^(C|en_US)\.(utf-?8)$' || true)
[ -n "$utf8_loc" ] && export LC_ALL="$utf8_loc"

today=$(date +%s)
fails=0
warns=0
checked=0

fail() { echo "  FAIL: $1"; fails=$((fails + 1)); }
warn() {
  if [ "$STRICT" -eq 1 ]; then
    echo "  FAIL(strict): $1"; fails=$((fails + 1))
  else
    echo "  WARN: $1"; warns=$((warns + 1))
  fi
}

check_skill() {
  dir="$1"
  file="$dir/SKILL.md"
  echo "== $dir"
  checked=$((checked + 1))

  # --- frontmatter fences ---
  if [ "$(head -1 "$file")" != "---" ]; then
    fail "SKILL.md must start with YAML frontmatter fence ---"
  elif [ -z "$(awk 'NR>1 && /^---$/{print NR; exit}' "$file")" ]; then
    fail "frontmatter fence is not closed"
  fi

  # --- name: kebab-case, <=64 chars, matches directory, no reserved words ---
  name=$(grep -m1 '^name:' "$file" | sed "s/^name:[[:space:]]*//; s/^\"//; s/\"\$//; s/^'//; s/'\$//")
  dirname_=$(basename "$dir")
  [ -z "$name" ] && name="$dirname_"
  echo "$name" | grep -qE '^[a-z0-9]+(-[a-z0-9]+)*$' || fail "name '$name' must be lowercase hyphen-case"
  [ "${#name}" -le 64 ] || fail "name exceeds 64 chars (${#name})"
  [ "$name" = "$dirname_" ] || fail "name '$name' must match directory '$dirname_'"
  case "$name" in
    *anthropic*|*claude*) fail "name must not contain reserved words anthropic/claude" ;;
  esac

  # --- description: non-empty, <=1024 chars, no <>, no unquoted '#' ---
  desc_raw=$(grep -m1 '^description:' "$file" | sed 's/^description:[[:space:]]*//')
  desc="$desc_raw"
  desc="${desc#\"}"; desc="${desc%\"}"; desc="${desc#\'}"; desc="${desc%\'}"
  has_upstream=$(grep -c '^upstream:' "$file")
  if [ -z "$desc" ]; then
    fail "description must be a non-empty single line"
  else
    [ "${#desc}" -le 1024 ] || fail "description exceeds 1024 chars (${#desc})"
    case "$desc" in
      *'<'*|*'>'*) fail "description cannot contain angle brackets (Codex compatibility)" ;;
    esac
    case "$desc_raw" in
      \"*|\'*|'|'*|'>'*) : ;;  # quoted or block scalar — safe
      *) echo "$desc_raw" | grep -qE '(^|[ 	])#' && fail "unquoted description contains '#' — quote it (YAML comment truncation)" ;;
    esac
    [ "${#desc}" -le 500 ] || warn "description is ${#desc} chars (>500 crowds the aggregate listing budget)"
    if [ "$has_upstream" -gt 0 ]; then
      echo "$desc" | grep -qiE 'use when' || warn "description should contain 'Use when'"
    else
      echo "$desc" | grep -qiE '^use when' || warn "description should start with 'Use when'"
    fi
  fi

  # --- docks conventions: user-invocable + metadata.updated freshness ---
  grep -qE '^user-invocable:[[:space:]]*(true|false)' "$file" || warn "frontmatter 'user-invocable' missing"
  updated=$(awk '/^metadata:/{m=1; next} m && /^[a-z]/{m=0} m && /updated:/{print; exit}' "$file" \
            | sed 's/.*updated:[[:space:]]*"\{0,1\}\([0-9-]*\)"\{0,1\}.*/\1/')
  updated_ts=0
  if [ -z "$updated" ]; then
    [ "$has_upstream" -eq 0 ] && warn "metadata.updated missing (YYYY-MM-DD)"
  else
    updated_ts=$(date -d "$updated" +%s 2>/dev/null || date -j -f "%Y-%m-%d" "$updated" +%s 2>/dev/null || echo 0)  # GNU, then BSD
    if [ "$updated_ts" -gt 0 ]; then
      age_days=$(( (today - updated_ts) / 86400 ))
      [ "$age_days" -le 180 ] || warn "metadata.updated is ${age_days}d old (>180d reads stale)"
    fi
  fi

  # --- body size: 500 hard cap; 80-310 sweet spot (post-compaction window) ---
  body_lines=$(awk '/^---$/ && c<2 {c++; next} c==2 {print}' "$file" | wc -l | tr -d ' ')
  [ "$body_lines" -le 500 ] || fail "body is $body_lines lines (hard cap 500) — extract detail into references/"
  if [ "$body_lines" -lt 80 ] || [ "$body_lines" -gt 310 ]; then
    warn "body is $body_lines lines, outside the 80-310 sweet spot (~310 = post-compaction re-attachment ceiling)"
  fi

  # --- references/ must stay one level deep ---
  if [ -d "$dir/references" ]; then
    find "$dir/references" -mindepth 1 -type d 2>/dev/null | grep -q . \
      && fail "references/ must stay one level deep (agentskills.io: avoid deep reference chains)"
  fi

  # --- slop words in prose (code fences and backtick spans stripped first) ---
  slop=$(awk '/^```/{f=!f; next} !f' "$file" | sed 's/`[^`]*`//g' \
         | grep -ciE '\bcomprehensive\b|\brobust\b|\belegant\b|\bseamless\b')
  [ "$slop" -eq 0 ] || warn "$slop slop word(s) in prose (comprehensive/robust/elegant/seamless)"

  # --- 16-pt rubric score (informational mirror of the docks scorer) ---
  score=0
  if [ "$has_upstream" -gt 0 ]; then
    echo "$desc" | grep -qiE 'use when' && score=$((score + 2))
  else
    echo "$desc" | grep -qiE '^use when' && score=$((score + 2))
  fi
  if [ "${#desc}" -gt 0 ] && [ "${#desc}" -le 500 ]; then
    score=$((score + 2))
  elif [ "${#desc}" -gt 0 ] && [ "${#desc}" -le 1000 ]; then
    score=$((score + 1))
  fi
  if [ "$updated_ts" -gt 0 ] && [ $(( (today - updated_ts) / 86400 )) -le 180 ]; then
    score=$((score + 1))
  fi
  cc=$(grep -c '<constraint>' "$file")
  [ "$cc" -gt 3 ] && cc=3
  score=$((score + cc))
  if { grep -qE '\bBAD\b|//[[:space:]]*BAD|#[[:space:]]*BAD' "$file" && grep -qE '\bGOOD\b|//[[:space:]]*GOOD|#[[:space:]]*GOOD' "$file"; } \
     || { grep -qiE 'wrong fix' "$file" && grep -qiE 'right fix' "$file"; }; then
    score=$((score + 2))
  fi
  slop_pts=$((2 - slop))
  [ "$slop_pts" -lt 0 ] && slop_pts=0
  score=$((score + slop_pts))
  grep -qE '^\|.*\|' "$file" && score=$((score + 1))
  grep -qE '^```[a-z]+' "$file" && score=$((score + 1))
  if [ "$body_lines" -ge 80 ] && [ "$body_lines" -le 310 ]; then
    score=$((score + 2))
  fi
  echo "  score: $score/16 (docks rubric; kit per-file floors: engineering 10, productivity 8; aim 14+)"
}

for a in "$@"; do
  if [ -f "$a/SKILL.md" ]; then
    check_skill "$a"
  elif [ -d "$a" ]; then
    found=0
    while IFS= read -r f; do
      check_skill "$(dirname "$f")"
      found=1
    done < <(find "$a" -maxdepth 4 -name SKILL.md -not -path '*/node_modules/*' 2>/dev/null | sort)
    if [ "$found" -eq 0 ]; then
      echo "FAIL: no SKILL.md found under $a" >&2
      fails=$((fails + 1))
    fi
  else
    echo "FAIL: not a directory: $a" >&2
    fails=$((fails + 1))
  fi
done

if [ "$fails" -gt 0 ]; then
  echo "skill-guard FAILED: $fails failure(s), $warns warning(s) across $checked skill(s)"
  exit 1
fi
echo "skill-guard PASSED: $checked skill(s), $warns warning(s)"
