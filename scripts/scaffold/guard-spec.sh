#!/bin/bash
# Guard: validate docs/scaffold/spec.yaml is coherent — it parses, and every
# template / bundled-skill / script path it references actually resolves in this
# repo. Catches a spec that drifted from the tree (e.g. a renamed skill).
# No-op (pass) when the repo has no scaffold spec.
# Usage: ./guard-spec.sh [repo-root]
set -u
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="${1:-$SCRIPT_DIR/../..}"
ROOT="$(cd "$ROOT" && pwd)"
SPEC="$ROOT/docs/scaffold/spec.yaml"

if [ ! -f "$SPEC" ]; then
  echo "scaffold/guard-spec: no docs/scaffold/spec.yaml — skipped"
  exit 0
fi

# shellcheck source=scripts/lib/skills.sh
source "$ROOT/scripts/lib/skills.sh"
skills_require_node_yaml "$ROOT" || exit $?

node - "$SPEC" "$ROOT" <<'JS'
const fs = require('node:fs');
const path = require('node:path');
const { parseDocument } = require('yaml');

const [specPath, root] = process.argv.slice(2);
const doc = parseDocument(fs.readFileSync(specPath, 'utf8'), {
  prettyErrors: true,
  strict: true,
  uniqueKeys: true,
});
if (doc.errors.length > 0) {
  for (const error of doc.errors) console.error(`FAIL: spec.yaml does not parse: ${error.message}`);
  process.exit(1);
}
const spec = doc.toJS() || {};
let err = 0;
const tdir = path.join(root, 'docs/scaffold/templates');

function fail(message) {
  console.error(`FAIL: ${message}`);
  err = 1;
}

if (spec.version !== 1) fail(`unsupported spec version ${JSON.stringify(spec.version)} (expected 1)`);

for (const tf of spec.templated_files || []) {
  const template = tf.template || '';
  if (!fs.existsSync(path.join(tdir, template))) fail(`templated_files template missing: ${template}`);
  if (!tf.dest) fail(`templated_files entry has no dest: ${JSON.stringify(tf)}`);
}

for (const node of spec.tree_nodes || []) {
  if (!node.path) fail(`tree_node has no path: ${JSON.stringify(node)}`);
  const sources = ['seed_from_skill', 'template', 'seed'].filter((key) => key in node);
  if (sources.length !== 1) {
    fail(`tree_node ${node.path} needs exactly one of seed_from_skill/template/seed`);
  }
  if (node.template && !fs.existsSync(path.join(tdir, node.template))) {
    fail(`tree_node template missing: ${node.template}`);
  }
}

for (const bundled of spec.bundled_skills || []) {
  const source = bundled.source || '';
  if (!fs.existsSync(path.join(root, source))) fail(`bundled_skills source missing: ${source}`);
}

for (const script of spec.scripts || []) {
  const source = script.source || '';
  if (!fs.existsSync(path.join(root, source))) fail(`scripts source missing: ${source}`);
}

const variables = spec.variables || {};
if (Object.keys(variables).length === 0) fail('spec has no variables');
for (const [name, value] of Object.entries(variables)) {
  if (!value || typeof value !== 'object' || !('prompt' in value)) {
    fail(`variable ${JSON.stringify(name)} has no prompt`);
  }
}

process.exit(err);
JS
rc=$?
if [ "$rc" -ne 0 ]; then
  echo "scaffold/guard-spec FAILED" >&2
  exit 1
fi
echo "scaffold/guard-spec PASSED: spec.yaml coherent; all referenced paths resolve"
exit 0
