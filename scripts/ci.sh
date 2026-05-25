#!/bin/bash
# ci.sh — local mirror of .github/workflows/ci.yml. Run this before releasing.
#
# Why two layers?
#   1. Local ci.sh:  catches issues before pushing a tag (no burned tag, no
#      cluttered Actions history, fast feedback).
#   2. Tag-CI on GH: catches issues a contributor's machine missed (different
#      OS, missing tools, dirty checkout) and is the authoritative gate
#      release.sh checks before creating a GitHub Release.
#
# Usage:
#   ./scripts/ci.sh         # run everything
#   ./scripts/ci.sh -q      # quiet on success, only print on failure

set -uo pipefail

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_DIR"

QUIET=0
[ "${1:-}" = "-q" ] && QUIET=1

failures=()
ok()   { [ "$QUIET" -eq 0 ] && printf "\033[1;32m  ✔\033[0m %s\n" "$1"; }
fail() { printf "\033[1;31m  ✘\033[0m %s\n" "$1"; failures+=("$1"); }
section() { [ "$QUIET" -eq 0 ] && printf "\n\033[1m▸ %s\033[0m\n" "$1"; }

# --- preconditions ---
command -v bash >/dev/null    || { echo "bash required"; exit 2; }
command -v jq   >/dev/null    || { echo "jq required";   exit 2; }
command -v python3 >/dev/null || { echo "python3 required (yaml validation)"; exit 2; }

# --- 1. workflow YAML validity (catches the bug that broke 5 runs in a row) ---
# Tries pyyaml first; on Debian/PEP 668 envs where pyyaml isn't installable
# without --break-system-packages, falls back to yamllint, then `yq`. If
# none are present locally, skip with a note — tag-CI on GitHub Actions
# always re-validates so an invalid workflow never makes it to release.
section "workflow YAML"
yaml_check_ok=0
if python3 -c "import yaml; yaml.safe_load(open('.github/workflows/ci.yml'))" 2>/dev/null; then
  ok ".github/workflows/ci.yml parses (pyyaml)"
  yaml_check_ok=1
elif command -v yamllint >/dev/null 2>&1; then
  if yamllint -d "{rules: {document-start: disable, line-length: disable, truthy: disable}}" .github/workflows/ci.yml >/dev/null 2>&1; then
    ok ".github/workflows/ci.yml parses (yamllint)"
    yaml_check_ok=1
  else
    fail ".github/workflows/ci.yml YAML invalid (yamllint)"
  fi
elif command -v yq >/dev/null 2>&1; then
  if yq eval '.' .github/workflows/ci.yml >/dev/null 2>&1; then
    ok ".github/workflows/ci.yml parses (yq)"
    yaml_check_ok=1
  else
    fail ".github/workflows/ci.yml YAML invalid (yq)"
  fi
fi
if [ "$yaml_check_ok" -eq 0 ]; then
  # No YAML validator available locally — distinguish "missing tool" from "invalid YAML".
  # Capture output rather than piping: under `set -o pipefail` the pipeline takes
  # python3's exit code (always 1 when the import fails), so `python | grep` would
  # mis-classify "missing module" as "invalid YAML".
  py_yaml_err=$(python3 -c "import yaml" 2>&1 || true)
  if echo "$py_yaml_err" | grep -q "ModuleNotFoundError"; then
    [ "$QUIET" -eq 0 ] && printf "\033[1;33m  ⚠\033[0m .github/workflows/ci.yml YAML check skipped — install pyyaml/yamllint/yq locally for fast feedback (tag-CI on GitHub validates regardless)\n"
  else
    fail ".github/workflows/ci.yml YAML invalid"
  fi
fi

# --- 2. plugin manifest ---
section "plugin manifest"
if jq empty plugins/docks/.claude-plugin/plugin.json 2>/dev/null; then
  ok "plugin.json JSON valid"
else
  fail "plugin.json JSON invalid"
fi
if jq empty .claude-plugin/marketplace.json 2>/dev/null; then
  ok "marketplace.json JSON valid"
else
  fail "marketplace.json JSON invalid"
fi
PLUGIN_V=$(jq -r '.version' plugins/docks/.claude-plugin/plugin.json 2>/dev/null)
MARKET_V=$(jq -r '(.plugins[] | select(.name == "docks")).version' .claude-plugin/marketplace.json 2>/dev/null)
if [ "$PLUGIN_V" = "$MARKET_V" ] && [ -n "$PLUGIN_V" ]; then
  ok "plugin.json + marketplace.json versions agree ($PLUGIN_V)"
else
  fail "version drift: plugin.json=$PLUGIN_V marketplace.json=$MARKET_V"
fi

if command -v claude >/dev/null 2>&1; then
  if claude plugin validate ./plugins/docks 2>&1 | grep -q "Validation passed"; then
    ok "claude plugin validate ./plugins/docks"
  else
    fail "claude plugin validate ./plugins/docks (run manually for details)"
  fi
else
  fail "claude CLI not found — install Claude Code to run 'claude plugin validate'"
fi

# --- 2b. Codex plugin manifest (parallel to Claude, optional — only enforced if present) ---
section "Codex plugin manifest"
CODEX_PLUGIN="plugins/docks/.codex-plugin/plugin.json"
CODEX_MARKET=".agents/plugins/marketplace.json"
if [ -f "$CODEX_PLUGIN" ]; then
  if jq empty "$CODEX_PLUGIN" 2>/dev/null; then
    ok "$CODEX_PLUGIN JSON valid"
  else
    fail "$CODEX_PLUGIN JSON invalid"
  fi
  CODEX_PLUGIN_V=$(jq -r '.version' "$CODEX_PLUGIN" 2>/dev/null)
  if [ "$CODEX_PLUGIN_V" = "$PLUGIN_V" ]; then
    ok "codex plugin.json version matches claude plugin.json ($PLUGIN_V)"
  else
    fail "version drift: claude=$PLUGIN_V codex=$CODEX_PLUGIN_V"
  fi
  if [ -f "$CODEX_MARKET" ]; then
    if jq empty "$CODEX_MARKET" 2>/dev/null; then
      ok "$CODEX_MARKET JSON valid"
    else
      fail "$CODEX_MARKET JSON invalid"
    fi
  else
    fail "$CODEX_MARKET missing while $CODEX_PLUGIN exists — they should ship together"
  fi
else
  [ "$QUIET" -eq 0 ] && printf "\033[1;33m  ⚠\033[0m %s missing — Codex distribution not configured (optional)\n" "$CODEX_PLUGIN"
fi

# --- 2c. skill category layout sanity ---
# Skills are categorized (plan foundation-categorization-scoring).
# Agents stay flat — plugin manifest doesn't accept an `agents` field, so
# the loader auto-discovers them at depth-1 only.
section "category layout"
manifest_categories=$(jq -r '.skills[]?' plugins/docks/.claude-plugin/plugin.json 2>/dev/null)
layout_ok=1
while IFS= read -r path; do
  [ -z "$path" ] && continue
  clean="${path#./}"
  if [ ! -d "plugins/docks/$clean" ]; then
    fail "plugin.json references missing category dir: $clean"
    layout_ok=0
  fi
done <<< "$manifest_categories"

stray_skills=$(find plugins/docks/skills -mindepth 2 -maxdepth 2 -name SKILL.md 2>/dev/null | wc -l)
if [ "$stray_skills" -gt 0 ]; then
  fail "$stray_skills skill(s) at skills/<name>/SKILL.md (should be skills/<category>/<name>/SKILL.md)"
  layout_ok=0
fi
[ "$layout_ok" -eq 1 ] && ok "skill categories declared in plugin.json all exist; no stray skills outside categories"

# --- 3. structural guards ---
section "structural guards"
for g in guard-skills guard-agents guard-tree; do
  if bash "scripts/$g.sh" >/dev/null 2>&1; then
    ok "$g passed"
  else
    fail "$g failed (run 'bash scripts/$g.sh' for details)"
  fi
done

# --- 4. quality score floors ---
# Per-file floor is the gate; total floor = sum(per_file_floor × count).
# Floors live in scripts/scoring.config.json (one source of truth).
# Skills are per-category (categorization in plan foundation-categorization-scoring).
# Agents + commands are flat — plugin manifest auto-discovers them at depth-1 only.
section "quality score floors"

# Skills (per-category)
for c in engineering productivity; do
  dir="plugins/docks/skills/$c"
  [ -d "$dir" ] || continue
  floor=$(bash scripts/read-floor.sh skills "$c" 2>/dev/null) || { fail "scoring.config.json missing skills.$c"; continue; }
  count=$(find "$dir" -mindepth 1 -maxdepth 1 -type d 2>/dev/null | wc -l)
  [ "$count" -eq 0 ] && continue
  cat_score=$(bash scripts/score-skills.sh --per-file 2>/dev/null \
              | awk -v c="$c" 'index($1, c"/") == 1 {sum += $2} END {print sum+0}')
  cat_floor=$(( count * floor ))
  if [ "$cat_score" -ge "$cat_floor" ]; then
    ok "score-skills/$c: $cat_score (floor $cat_floor = $count × $floor)"
  else
    fail "score-skills/$c: $cat_score below floor $cat_floor ($count × $floor)"
  fi
done

# Flat kinds (agents)
for k in agents; do
  floor=$(bash scripts/read-floor.sh "$k" 2>/dev/null) || { fail "scoring.config.json missing $k"; continue; }
  # Exclude reserved context-tree node files — they're not agent definitions.
  count=$(find "plugins/docks/$k" -mindepth 1 -maxdepth 1 -name '*.md' ! -name AGENTS.md ! -name CLAUDE.md 2>/dev/null | wc -l)
  total_floor=$(( count * floor ))
  score=$(bash "scripts/score-$k.sh" 2>/dev/null)
  if [ -n "$score" ] && [ "$score" -ge "$total_floor" ]; then
    ok "score-$k: $score (floor $total_floor = $count × $floor)"
  else
    fail "score-$k: ${score:-<empty>} below floor $total_floor ($count × $floor)"
  fi
done

# --- 5. per-file score floors ---
section "per-file score floors"

# Skills (per-category). Upstream-vendored skills (those with an `upstream:`
# frontmatter block) are preserved verbatim from their source, so they're
# exempt from the kit-calibrated per-file floor — the same relaxation
# score-skills.sh already applies to their CSO/freshness checks. Structural
# guards (guard-skills.sh) still gate them.
any_under=0
exempt_n=0
while IFS= read -r line; do
  s=$(echo "$line" | awk '{print $NF}')
  catname=$(echo "$line" | awk '{$NF=""; print $0}' | sed 's/[[:space:]]*$//')
  cat=${catname%%/*}
  if grep -qE '^upstream:' "plugins/docks/skills/$catname/SKILL.md" 2>/dev/null; then
    exempt_n=$((exempt_n + 1))
    continue
  fi
  floor=$(bash scripts/read-floor.sh skills "$cat" 2>/dev/null)
  [ -z "$floor" ] && { fail "  skills:$catname no floor for category '$cat'"; any_under=1; continue; }
  if [ "$s" -lt "$floor" ]; then
    fail "  skills:$catname score $s below per-file floor $floor"
    any_under=1
  fi
done < <(bash scripts/score-skills.sh --per-file 2>/dev/null)
[ "$any_under" -eq 0 ] && ok "skills per-file all clear per-category floors ($exempt_n upstream exempt)"

# Flat kinds (agents)
for k in agents; do
  floor=$(bash scripts/read-floor.sh "$k" 2>/dev/null) || continue
  any_under=0
  while IFS= read -r line; do
    s=$(echo "$line" | awk '{print $NF}')
    n=$(echo "$line" | awk '{$NF=""; print $0}' | sed 's/[[:space:]]*$//')
    if [ "$s" -lt "$floor" ]; then
      fail "  $k:$n score $s below per-file floor $floor"
      any_under=1
    fi
  done < <(bash "scripts/score-$k.sh" --per-file 2>/dev/null)
  [ "$any_under" -eq 0 ] && ok "$k per-file all ≥ $floor"
done

# --- 6. skill-maintainer idempotency ---
# Every kit skill's stored metadata.content_hash must match its recomputed hash,
# so re-running the maintainer is a no-op (no metadata.updated churn). Catches a
# skill edited without re-running scripts/skill-content-hash.sh --backfill.
section "skill-maintainer idempotency"
if bash tests/skill-maintainer-idempotency.sh >/dev/null 2>&1; then
  ok "skill content_hash in sync; maintainer re-run is a no-op (upstream excluded)"
else
  fail "skill-maintainer idempotency failed (run: bash tests/skill-maintainer-idempotency.sh)"
fi

# --- summary ---
echo ""
if [ "${#failures[@]}" -eq 0 ]; then
  printf "\033[1;32m✔ All ci.sh checks passed\033[0m — safe to release.\n"
  exit 0
else
  printf "\033[1;31m✘ %d check(s) failed:\033[0m\n" "${#failures[@]}"
  for f in "${failures[@]}"; do
    printf "  - %s\n" "$f"
  done
  echo ""
  echo "Fix locally before pushing. Tag-CI on GitHub will catch this too,"
  echo "but a failed tag burns the version (or forces a tag reset)."
  exit 1
fi
