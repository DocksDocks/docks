#!/bin/bash
# PostToolUse hook (Claude Code + Codex): after a file edit inside a
# context-tree node, nudge the agent to refresh that node. Deterministic,
# cheap, no LLM call. Cross-tool by reading both payload shapes:
#   - Claude Code Edit/Write -> tool_input.file_path (absolute path)
#   - Codex apply_patch       -> `*** Add|Update|Delete File: <path>` headers
#                                inside tool_input.command (repo-relative)
# Emits hookSpecificOutput.additionalContext only when an edited path is inside
# a node (a non-root folder with AGENTS.md + CLAUDE.md). Always exits 0 — a hook
# must never break the session.
set -u

input=$(cat 2>/dev/null || true)
[ -n "$input" ] || exit 0

# Repo root: Claude provides CLAUDE_PROJECT_DIR; Codex does not, so fall back to git.
repo_root="${CLAUDE_PROJECT_DIR:-}"
[ -n "$repo_root" ] || repo_root=$(git rev-parse --show-toplevel 2>/dev/null || true)
[ -n "$repo_root" ] || exit 0

# Collect candidate edited paths from both payload shapes.
# (1) Claude Edit/Write: "file_path":"/abs/path" (paths carry no double-quote)
fp_paths=$(printf '%s' "$input" \
  | grep -oE '"file_path"[[:space:]]*:[[:space:]]*"[^"]*"' \
  | sed 's/.*:[[:space:]]*"//; s/"$//')
# (2) Codex apply_patch: file headers inside the (escaped) command string;
#     the path runs until the next backslash (the \n escape) or quote.
patch_paths=$(printf '%s' "$input" \
  | grep -oE '\*\*\* (Add|Update|Delete) File: [^"\]+' \
  | sed 's/^\*\*\* [A-Za-z]* File: //; s/[[:space:]]*$//')
all_paths=$(printf '%s\n%s\n' "$fp_paths" "$patch_paths")

# Resolve each path to its nearest node; collect distinct node rel-paths.
nodes=""
while IFS= read -r p; do
  [ -n "$p" ] || continue
  case "$p" in
    /*) abs="$p" ;;            # absolute (Claude Edit/Write)
    *)  abs="$repo_root/$p" ;; # repo-relative (Codex apply_patch)
  esac
  dir=$(dirname "$abs")
  while [ -n "$dir" ] && [ "$dir" != "/" ]; do
    [ "$dir" = "$repo_root" ] && break          # nudge sub-folder nodes only, not root
    if [ -f "$dir/AGENTS.md" ] && [ -f "$dir/CLAUDE.md" ]; then
      rel="${dir#"$repo_root"/}"
      case " $nodes " in *" $rel "*) : ;; *) nodes="$nodes $rel" ;; esac
      break
    fi
    parent=$(dirname "$dir")
    [ "$parent" = "$dir" ] && break
    dir="$parent"
  done
done <<EOF
$all_paths
EOF

nodes=$(printf '%s' "$nodes" | sed 's/^ *//; s/ *$//')
[ -n "$nodes" ] || exit 0

node_list=$(printf '%s' "$nodes" | tr ' ' ',' | sed 's/,/, /g')
printf '{"hookSpecificOutput":{"hookEventName":"PostToolUse","additionalContext":"Edited files inside context-tree node(s): %s. If conventions in a listed folder changed, run context-tree refresh on it (no-op when nothing semantic changed)."}}\n' "$node_list"
exit 0
