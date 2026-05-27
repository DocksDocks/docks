#!/bin/bash
# Guard: validate SKILL.md files against Claude skill authoring conventions.
# Usage: ./claude.sh [path]   (default: plugins/docks/skills)
set -u
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
DIR="${1:-$REPO_DIR/plugins/docks/skills}"

# shellcheck source=scripts/lib/skills.sh
source "$REPO_DIR/scripts/lib/skills.sh"

skills_require_node_yaml "$REPO_DIR" || exit $?
node "$REPO_DIR/scripts/lib/validate-skills.mjs" --runtime claude "$DIR"
