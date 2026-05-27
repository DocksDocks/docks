#!/bin/bash
# Read per-file score floor from scripts/config/scoring.json.
# Usage:
#   scripts/config/read-floor.sh <kind> <category>   # categorized kinds (skills)
#   scripts/config/read-floor.sh <kind>              # flat kinds (agents, commands)
# Prints the integer per_file_floor on stdout.
# Exits non-zero if the kind/category pair isn't declared.
set -u
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CONFIG="$SCRIPT_DIR/scoring.json"
KIND="${1:?usage: $0 <kind> [<category>]}"
CATEGORY="${2:-}"

[ -f "$CONFIG" ] || { echo "FAIL: $CONFIG not found" >&2; exit 1; }

python3 - "$CONFIG" "$KIND" "$CATEGORY" <<'PY'
import json, sys
cfg_path, kind, category = sys.argv[1], sys.argv[2], sys.argv[3]
with open(cfg_path) as f:
    cfg = json.load(f)
try:
    node = cfg[kind]
    if category:
        node = node[category]
    print(node["per_file_floor"])
except KeyError as e:
    path = f"{kind}" + (f".{category}" if category else "")
    print(f"FAIL: unknown {path} in {cfg_path} (missing key: {e})", file=sys.stderr)
    sys.exit(1)
PY
