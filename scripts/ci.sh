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

# --- 3. structural guards ---
section "structural guards"
for g in guard-skills guard-commands guard-agents; do
  if bash "scripts/$g.sh" >/dev/null 2>&1; then
    ok "$g passed"
  else
    fail "$g failed (run 'bash scripts/$g.sh' for details)"
  fi
done

# --- 4. quality score floors (count-derived; tracks content size automatically) ---
# Total floor = artifact_count × per-file_floor.
# Hardcoded floors went stale every time the inventory changed; deriving from
# count means a deletion / addition bumps the floor automatically. Per-file
# floors come from PER_FILE_FLOORS below, which is also the GH workflow's truth.
section "quality score floors"
declare -A PER_FILE_FLOORS=([skills]=8 [commands]=21 [agents]=14)
count_skills=$(find plugins/docks/skills -mindepth 1 -maxdepth 1 -type d 2>/dev/null | wc -l)
count_commands=$(find plugins/docks/commands -mindepth 1 -maxdepth 1 -name '*.md' 2>/dev/null | wc -l)
count_agents=$(find plugins/docks/agents -mindepth 1 -maxdepth 1 -name '*.md' 2>/dev/null | wc -l)
declare -A COUNTS=([skills]=$count_skills [commands]=$count_commands [agents]=$count_agents)
for k in skills commands agents; do
  floor=$(( COUNTS[$k] * PER_FILE_FLOORS[$k] ))
  score=$(bash "scripts/score-$k.sh" 2>/dev/null)
  if [ -n "$score" ] && [ "$score" -ge "$floor" ]; then
    ok "score-$k: $score (floor ${floor} = ${COUNTS[$k]} × ${PER_FILE_FLOORS[$k]})"
  else
    fail "score-$k: ${score:-<empty>} below floor ${floor} (${COUNTS[$k]} × ${PER_FILE_FLOORS[$k]})"
  fi
done

# --- 5. per-file score floors ---
section "per-file score floors"
declare -A PER_FILE_FLOORS=([skills]=8 [commands]=21 [agents]=14)
for k in skills commands agents; do
  any_under=0
  while IFS= read -r line; do
    s=$(echo "$line" | awk '{print $NF}')
    n=$(echo "$line" | awk '{$NF=""; print $0}' | sed 's/[[:space:]]*$//')
    if [ "$s" -lt "${PER_FILE_FLOORS[$k]}" ]; then
      fail "  $k:$n score $s below per-file floor ${PER_FILE_FLOORS[$k]}"
      any_under=1
    fi
  done < <(bash "scripts/score-$k.sh" --per-file 2>/dev/null)
  [ "$any_under" -eq 0 ] && ok "$k per-file all ≥ ${PER_FILE_FLOORS[$k]}"
done

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
