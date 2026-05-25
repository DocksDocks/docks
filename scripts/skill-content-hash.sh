#!/bin/bash
# skill-content-hash.sh — deterministic content hash for skills, so the
# skill-maintainer can bump `metadata.updated` ONLY on a real content change.
#
# Semantic-change predicate: the hash covers a skill's MEANING —
#   normalized frontmatter (EXCLUDING the `updated:` and `content_hash:` lines,
#   which are bookkeeping) + body + sorted+concatenated references/*.md bodies.
# Editing only `updated:` therefore does NOT change the hash, so re-running the
# maintainer on an otherwise-unchanged skill is a no-op (no file write).
#
# Normalize = strip trailing whitespace per line, drop CR, collapse blank-line
# runs. Output = lowercase hex SHA-256.
#
# Upstream-vendored skills (those carrying an `upstream:` frontmatter block) are
# preserved verbatim and EXCLUDED — they have no `metadata.updated` to protect
# and must not be rewritten (same policy as the per-file score-floor exemption).
#
# Usage:
#   skill-content-hash.sh <skill-dir>          print the content hash of one skill
#   skill-content-hash.sh --backfill [root]    write/refresh content_hash on every
#                                              kit skill under root (never touches updated)
#   skill-content-hash.sh --check-only [root]  report per skill: unchanged | would-bump;
#                                              exit non-zero if any would-bump (CI gate)
#
# Default root: plugins/docks/skills
set -uo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DEFAULT_ROOT="$SCRIPT_DIR/../plugins/docks/skills"

sha256() {
  if command -v shasum >/dev/null 2>&1; then shasum -a 256 | awk '{print $1}'
  elif command -v sha256sum >/dev/null 2>&1; then sha256sum | awk '{print $1}'
  else echo "ERROR: no sha256 tool (need shasum or sha256sum)" >&2; exit 3; fi
}

# strip trailing whitespace, drop CR, collapse consecutive blank lines
normalize() { sed 's/[[:space:]]*$//' | tr -d '\r' | cat -s; }

is_upstream() { grep -qE '^upstream:' "$1/SKILL.md" 2>/dev/null; }

# Compute the content hash for one skill directory.
hash_skill() {
  local dir="${1%/}"
  local file="$dir/SKILL.md"
  [ -f "$file" ] || { echo "ERROR: $file not found" >&2; return 1; }
  {
    # SKILL.md with the two bookkeeping frontmatter lines removed
    awk '
      NR==1 && $0=="---" { fm=1; print; next }
      fm==1 && $0=="---" { fm=0; print; next }
      fm==1 && /^[[:space:]]*updated:/ { next }
      fm==1 && /^[[:space:]]*content_hash:/ { next }
      { print }
    ' "$file"
    # references, deterministic order
    if [ -d "$dir/references" ]; then
      while IFS= read -r ref; do
        [ -f "$ref" ] && cat "$ref"
      done < <(find "$dir/references" -maxdepth 1 -name '*.md' | LC_ALL=C sort)
    fi
  } | normalize | sha256
}

# Read the stored content_hash from a skill's frontmatter (empty if absent).
stored_hash() {
  awk -F'"' '/^[[:space:]]*content_hash:/{print $2; exit}' "$1/SKILL.md"
}

# Insert or replace `  content_hash: "<hash>"` inside the metadata block.
write_hash() {
  local dir="${1%/}" h="$2"
  local file="$dir/SKILL.md"
  awk -v h="$h" '
    NR==1 && $0=="---" { fm=1; print; next }
    fm==1 && $0=="---" {
      if (inmeta && !done) { print "  content_hash: \"" h "\""; done=1 }
      fm=0; inmeta=0; print; next
    }
    fm==1 && /^metadata:/ { inmeta=1; print; next }
    fm==1 && inmeta && /^[[:space:]]*content_hash:/ { print "  content_hash: \"" h "\""; done=1; next }
    fm==1 && inmeta && /^[^[:space:]]/ {
      if (!done) { print "  content_hash: \"" h "\""; done=1 }
      inmeta=0; print; next
    }
    { print }
  ' "$file" > "$file.tmp" && mv "$file.tmp" "$file"
}

mode="${1:-}"
case "$mode" in
  --backfill|--check-only)
    root="${2:-$DEFAULT_ROOT}"
    [ -d "$root" ] || { echo "ERROR: skills root not found: $root" >&2; exit 2; }
    any_would_bump=0
    while IFS= read -r dir; do
      [ -f "$dir/SKILL.md" ] || continue
      is_upstream "$dir" && continue
      name=$(basename "$dir")
      cat=$(basename "$(dirname "$dir")")
      new=$(hash_skill "$dir") || continue
      stored=$(stored_hash "$dir")
      if [ "$mode" = "--check-only" ]; then
        if [ -z "$stored" ]; then
          echo "would-bump $cat/$name (no content_hash)"; any_would_bump=1
        elif [ "$stored" != "$new" ]; then
          echo "would-bump $cat/$name (content changed)"; any_would_bump=1
        else
          echo "unchanged $cat/$name"
        fi
      else
        if [ "$stored" != "$new" ]; then
          write_hash "$dir" "$new"
          echo "wrote $cat/$name"
        fi
      fi
    done < <(find "$root" -mindepth 2 -maxdepth 2 -type d | LC_ALL=C sort)
    if [ "$mode" = "--check-only" ] && [ "$any_would_bump" -ne 0 ]; then
      exit 1
    fi
    exit 0
    ;;
  "")
    echo "usage: skill-content-hash.sh <skill-dir> | --backfill [root] | --check-only [root]" >&2
    exit 2
    ;;
  *)
    hash_skill "$mode"
    ;;
esac
