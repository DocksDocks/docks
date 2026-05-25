#!/bin/bash
# Smoke test: render docs/scaffold/templates with fixed test values into a temp
# dir and assert the result is a structurally valid plugin skeleton —
#   - no '{{ }}' placeholder leaks through
#   - every rendered .json manifest parses
#   - the versioned manifests agree on version
#   - every context-tree node is a valid pair (via guard-tree.sh)
# Skills aren't shell-invocable, so this tests the TEMPLATES + spec render path,
# not the skill's interactive flow. No-op (pass) when there is no scaffold spec.
# Usage: ./test-scaffold.sh [repo-root]
set -u
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="${1:-$SCRIPT_DIR/..}"
ROOT="$(cd "$ROOT" && pwd)"
SPEC="$ROOT/docs/scaffold/spec.yaml"

if [ ! -f "$SPEC" ]; then
  echo "test-scaffold: no docs/scaffold/spec.yaml — skipped"
  exit 0
fi
command -v python3 >/dev/null 2>&1 || { echo "FAIL: python3 required" >&2; exit 2; }

python3 - "$ROOT" <<'PY'
import os, sys, re, json, tempfile, subprocess, shutil
try:
    import yaml
except ModuleNotFoundError:
    print("test-scaffold: pyyaml not installed — skipped (tag-CI validates)")
    sys.exit(0)

root = sys.argv[1]
spec = yaml.safe_load(open(os.path.join(root, "docs/scaffold/spec.yaml")))
tdir = os.path.join(root, "docs/scaffold/templates")
vars = {
    "plugin_name": "acme-tools",
    "plugin_description": "A test plugin",
    "author_name": "Test Author",
    "author_email": "test@example.com",
    "license": "MIT",
}
def subst(s):
    for k, v in vars.items():
        s = re.sub(r"{{\s*" + k + r"\s*}}", v, s)
    return s

tmp = tempfile.mkdtemp(prefix="scaffold-test-")
err = []
def write(dest, content):
    p = os.path.join(tmp, dest)
    os.makedirs(os.path.dirname(p) or tmp, exist_ok=True)
    open(p, "w").write(content)

try:
    # 1. templated_files
    for tf in spec.get("templated_files", []) or []:
        src = open(os.path.join(tdir, tf["template"])).read()
        write(subst(tf["dest"]), subst(src))
    # root node needs its CLAUDE.md pair
    if os.path.isfile(os.path.join(tmp, "AGENTS.md")):
        write("CLAUDE.md", "@AGENTS.md\n")
    # 2. tree_nodes — every node is a pair
    for n in spec.get("tree_nodes", []) or []:
        path = subst(n["path"])
        if n.get("template"):
            body = subst(open(os.path.join(tdir, n["template"])).read())
        else:
            body = "# " + path + "\n\nSeeded node.\n"
        write(os.path.join(path, "AGENTS.md"), body)
        write(os.path.join(path, "CLAUDE.md"), "@AGENTS.md\n")

    # assert: no leftover placeholders
    leftover = subprocess.run(["grep", "-rn", "{{", tmp], capture_output=True, text=True).stdout
    if leftover.strip():
        err.append("leftover placeholders:\n" + leftover.strip())

    # assert: JSON parses + versions agree
    versions = {}
    for tf in spec.get("templated_files", []) or []:
        dest = subst(tf["dest"])
        if not dest.endswith(".json"):
            continue
        try:
            data = json.load(open(os.path.join(tmp, dest)))
        except Exception as e:
            err.append(f"{dest}: invalid JSON: {e}"); continue
        v = data.get("version")
        if v is None and isinstance(data.get("plugins"), list) and data["plugins"]:
            v = data["plugins"][0].get("version")
        if v is not None:
            versions[dest] = v
    if len(set(versions.values())) > 1:
        err.append(f"version drift across manifests: {versions}")

    # assert: context-tree node pairs valid
    gt = subprocess.run(["bash", os.path.join(root, "scripts/guard-tree.sh"), tmp],
                        capture_output=True, text=True)
    if gt.returncode != 0:
        err.append("guard-tree failed on rendered tree:\n" + (gt.stdout + gt.stderr).strip())
finally:
    shutil.rmtree(tmp, ignore_errors=True)

if err:
    print("test-scaffold FAILED:")
    for e in err:
        print(" - " + e)
    sys.exit(1)
print("test-scaffold PASSED: templates render to a valid skeleton (JSON ok, versions agree, nodes valid, no stray placeholders)")
PY
exit $?
