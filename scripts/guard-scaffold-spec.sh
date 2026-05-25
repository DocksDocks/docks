#!/bin/bash
# Guard: validate docs/scaffold/spec.yaml is coherent — it parses, and every
# template / bundled-skill / script path it references actually resolves in this
# repo. Catches a spec that drifted from the tree (e.g. a renamed skill).
# No-op (pass) when the repo has no scaffold spec.
# Usage: ./guard-scaffold-spec.sh [repo-root]
set -u
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="${1:-$SCRIPT_DIR/..}"
ROOT="$(cd "$ROOT" && pwd)"
SPEC="$ROOT/docs/scaffold/spec.yaml"

if [ ! -f "$SPEC" ]; then
  echo "guard-scaffold-spec: no docs/scaffold/spec.yaml — skipped"
  exit 0
fi

command -v python3 >/dev/null 2>&1 || { echo "FAIL: python3 required to parse spec.yaml" >&2; exit 2; }

python3 - "$SPEC" "$ROOT" <<'PY'
import sys, os
try:
    import yaml
except ModuleNotFoundError:
    print("guard-scaffold-spec: pyyaml not installed — skipped (tag-CI validates)", flush=True)
    sys.exit(0)

spec_path, root = sys.argv[1], sys.argv[2]
try:
    spec = yaml.safe_load(open(spec_path))
except Exception as e:
    print(f"FAIL: spec.yaml does not parse: {e}", file=sys.stderr); sys.exit(1)

err = 0
tdir = os.path.join(root, "docs/scaffold/templates")

if spec.get("version") != 1:
    print(f"FAIL: unsupported spec version {spec.get('version')!r} (expected 1)", file=sys.stderr); err = 1

for tf in spec.get("templated_files", []) or []:
    p = os.path.join(tdir, tf.get("template", ""))
    if not os.path.isfile(p):
        print(f"FAIL: templated_files template missing: {tf.get('template')}", file=sys.stderr); err = 1
    if not tf.get("dest"):
        print(f"FAIL: templated_files entry has no dest: {tf}", file=sys.stderr); err = 1

for n in spec.get("tree_nodes", []) or []:
    if not n.get("path"):
        print(f"FAIL: tree_node has no path: {n}", file=sys.stderr); err = 1
    sources = [k for k in ("seed_from_skill", "template", "seed") if k in n]
    if len(sources) != 1:
        print(f"FAIL: tree_node {n.get('path')} needs exactly one of seed_from_skill/template/seed", file=sys.stderr); err = 1
    if n.get("template") and not os.path.isfile(os.path.join(tdir, n["template"])):
        print(f"FAIL: tree_node template missing: {n['template']}", file=sys.stderr); err = 1

for b in spec.get("bundled_skills", []) or []:
    src = b.get("source", "")
    if not os.path.isdir(os.path.join(root, src)):
        print(f"FAIL: bundled_skills source missing: {src}", file=sys.stderr); err = 1

for s in spec.get("scripts", []) or []:
    src = s.get("source", "")
    if not os.path.isfile(os.path.join(root, src)):
        print(f"FAIL: scripts source missing: {src}", file=sys.stderr); err = 1

variables = spec.get("variables", {}) or {}
if not variables:
    print("FAIL: spec has no variables", file=sys.stderr); err = 1
for name, v in variables.items():
    if not isinstance(v, dict) or "prompt" not in v:
        print(f"FAIL: variable {name!r} has no prompt", file=sys.stderr); err = 1

sys.exit(1 if err else 0)
PY
rc=$?
if [ "$rc" -ne 0 ]; then
  echo "guard-scaffold-spec FAILED" >&2
  exit 1
fi
echo "guard-scaffold-spec PASSED: spec.yaml coherent; all referenced paths resolve"
exit 0
