#!/bin/bash
# skill-maintainer idempotency test
#
# Guarantees that re-running the skill-maintainer on unchanged skills is a no-op:
#   1. the content hash is deterministic (same skill hashed twice → same hash)
#   2. every kit skill's stored metadata.content_hash is in sync with its content,
#      so the maintainer would bump NOTHING (`--check-only` exits 0)
#
# If this fails, a skill was edited without re-running
# `scripts/skills/content-hash.sh --backfill` (and bumping metadata.updated).
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
HASH=scripts/skills/content-hash.sh
fail=0

# 1. determinism — same input twice yields the same hash
sample=$(find plugins/docks/skills -mindepth 2 -maxdepth 2 -type d | LC_ALL=C sort | head -1)
h1=$(bash "$HASH" "$sample")
h2=$(bash "$HASH" "$sample")
if [ -z "$h1" ] || [ "$h1" != "$h2" ]; then
  echo "FAIL: non-deterministic hash for $sample ('$h1' != '$h2')"
  fail=1
else
  echo "ok: deterministic hash ($sample)"
fi

# 2. idempotency — the maintainer would bump nothing
if check=$(bash "$HASH" --check-only); then
  upstream_n=$(grep -R -l '^upstream:' plugins/docks/skills/*/*/SKILL.md 2>/dev/null | wc -l | tr -d ' ')
  echo "ok: all kit skills in sync ($(echo "$check" | grep -c '^unchanged') unchanged, $upstream_n upstream skipped)"
else
  echo "FAIL: skills out of sync — maintainer would bump:"
  echo "$check" | grep '^would-bump' | sed 's/^/  /'
  echo "  fix: bash scripts/skills/content-hash.sh --backfill  (and bump metadata.updated on changed skills)"
  fail=1
fi

if [ "$fail" -eq 0 ]; then
  echo "PASS: skill-maintainer idempotency"
  exit 0
fi
exit 1
