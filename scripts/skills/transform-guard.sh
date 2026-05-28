#!/bin/bash
# transform-guard.sh — style lint for content-preservation safeguards.
#
# A curated set of docks skills perform DESTRUCTIVE CONTENT TRANSFORMS (split /
# relocate / migrate / rewrite existing files). Each MUST carry BOTH:
#   - a preservation <constraint> (mentions preserve / content loss / verbatim /
#     net-shrink / byte-delta / section presence), AND
#   - a "## Verification" block (or "verify before/every/each …").
# so a future edit can't silently strip a transforming skill's data-loss guard.
#
# WHY A CURATED LIST, NOT VERB-DETECTION: a regex over skill bodies both misses
# real transformers (generic skills rarely use the trigger verbs in their own
# voice) and false-positives on advice skills ("split a fat interface"). The
# at-risk set was identified by READING the skills (audit, 2026-05-28); that
# judgment is encoded here as an explicit list.
#
# SCOPE: validates THIS repo's committed skill files — which CI sees. NOT a
# runtime data-loss check (scripts/ is author-side-only and never ships; the
# runtime check lives inline in each skill body). See
# plugins/docks/skills/productivity/write-skill/references/data-preservation.md.
#
# ROLLOUT: skills not yet hardened are in PENDING and only WARN. A listed skill
# NOT in PENDING that lacks a guard FAILS (regression catch). Remove a name from
# PENDING as its safeguard lands; when PENDING is empty every listed transformer
# is enforced.
#
# Usage: ./transform-guard.sh [skills-dir]   (default: plugins/docks/skills)
set -u
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
DIR="${1:-$REPO_DIR/plugins/docks/skills}"

# Curated content-transforming skills (audit output). Add a name here when a new
# skill moves/splits/migrates/rewrites existing content.
TRANSFORMING_SKILLS="context-tree multi-tool-bridge skill-agent-pipeline skill-maintenance refactor"

# Subset not yet hardened — WARN only. Empty: the data-preservation rollout
# (plans: context-tree-loss-guard, kit-wording-rollout) is complete and every
# listed transformer is now fully enforced. Re-add a name only to stage a new
# transforming skill that hasn't yet grown its safeguard.
PENDING=""

PRES_RE='content loss|no content|preserv|verbatim|net.?shrink|byte.?delta|section presence|drop a section|relocate.{0,12}verbatim'
VERIFY_RE='^#{2,3} *verification|verify (before|every|each)|verification block'

warn=0; fail=0; missing=0

for name in $TRANSFORMING_SKILLS; do
  file=$(find "$DIR" -type f -path "*/$name/SKILL.md" | head -1)
  if [ -z "$file" ] || [ ! -f "$file" ]; then
    echo "FAIL: listed transforming skill '$name' has no SKILL.md under $DIR" >&2
    missing=$((missing + 1)); continue
  fi
  body=$(awk '/^---$/ && c<2 {c++; next} c==2 {print}' "$file")

  has_pres=0;   echo "$body" | grep -qiE "$PRES_RE"   && has_pres=1
  has_verify=0; echo "$body" | grep -qiE "$VERIFY_RE" && has_verify=1

  if [ "$has_pres" -eq 1 ] && [ "$has_verify" -eq 1 ]; then
    continue   # protected
  fi

  miss=""
  [ "$has_pres" -eq 0 ]   && miss="${miss}preservation <constraint>; "
  [ "$has_verify" -eq 0 ] && miss="${miss}## Verification block; "

  if printf ' %s ' "$PENDING" | grep -q " $name "; then
    echo "WARN: $name lacks: ${miss}(allowlisted — pending rollout)" >&2
    warn=$((warn + 1))
  else
    echo "FAIL: $name lacks: ${miss}(was hardened — regression?)" >&2
    fail=$((fail + 1))
  fi
done

if [ "$((fail + missing))" -gt 0 ]; then
  echo "transform-guard FAILED: $fail unprotected + $missing missing of listed transformers; $warn pending" >&2
  exit 1
fi
echo "transform-guard PASSED: $warn pending (allowlisted), $((  $(echo $TRANSFORMING_SKILLS | wc -w) - warn )) enforced-clean"
exit 0
