#!/bin/bash
# Smoke test: render docs/scaffold/templates with fixed test values into a temp
# dir and assert the result is a structurally valid plugin skeleton —
#   - no '{{ }}' placeholder leaks through
#   - every rendered .json manifest parses
#   - the versioned manifests agree on version
#   - every context-tree node is a valid pair (via scripts/tree/guard.sh)
# Skills aren't shell-invocable, so this tests the TEMPLATES + spec render path,
# not the skill's interactive flow. No-op (pass) when there is no scaffold spec.
# Usage: ./test.sh [repo-root]
set -u
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="${1:-$SCRIPT_DIR/../..}"
ROOT="$(cd "$ROOT" && pwd)"
SPEC="$ROOT/docs/scaffold/spec.yaml"

if [ ! -f "$SPEC" ]; then
  echo "scaffold/test: no docs/scaffold/spec.yaml — skipped"
  exit 0
fi
# shellcheck source=scripts/lib/skills.sh
source "$ROOT/scripts/lib/skills.sh"
skills_require_node_yaml "$ROOT" || exit $?

node - "$ROOT" <<'JS'
const childProcess = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { parseDocument } = require('yaml');

const root = process.argv[2];
const specPath = path.join(root, 'docs/scaffold/spec.yaml');
const doc = parseDocument(fs.readFileSync(specPath, 'utf8'), {
  prettyErrors: true,
  strict: true,
  uniqueKeys: true,
});
if (doc.errors.length > 0) {
  console.error('scaffold/test FAILED:');
  for (const error of doc.errors) console.error(` - spec.yaml does not parse: ${error.message}`);
  process.exit(1);
}

const spec = doc.toJS() || {};
const tdir = path.join(root, 'docs/scaffold/templates');
const vars = {
  plugin_name: 'acme-tools',
  plugin_description: 'A test plugin',
  author_name: 'Test Author',
  author_email: 'test@example.com',
  license: 'MIT',
};

function subst(value) {
  let output = value;
  for (const [key, replacement] of Object.entries(vars)) {
    output = output.replace(new RegExp(`{{\\s*${key}\\s*}}`, 'g'), replacement);
  }
  return output;
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'scaffold-test-'));
const errors = [];

function write(dest, content) {
  const file = path.join(tmp, dest);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

function walk(dir, visitor) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, visitor);
    else if (entry.isFile()) visitor(full);
  }
}

try {
  for (const tf of spec.templated_files || []) {
    const src = fs.readFileSync(path.join(tdir, tf.template), 'utf8');
    write(subst(tf.dest), subst(src));
  }
  if (fs.existsSync(path.join(tmp, 'AGENTS.md'))) write('CLAUDE.md', '@AGENTS.md\n');

  for (const node of spec.tree_nodes || []) {
    const nodePath = subst(node.path);
    const body = node.template
      ? subst(fs.readFileSync(path.join(tdir, node.template), 'utf8'))
      : `# ${nodePath}\n\nSeeded node.\n`;
    write(path.join(nodePath, 'AGENTS.md'), body);
    write(path.join(nodePath, 'CLAUDE.md'), '@AGENTS.md\n');
  }

  const leftovers = [];
  walk(tmp, (file) => {
    const content = fs.readFileSync(file, 'utf8');
    if (content.includes('{{')) leftovers.push(path.relative(tmp, file));
  });
  if (leftovers.length > 0) errors.push(`leftover placeholders:\n${leftovers.join('\n')}`);

  const versions = {};
  for (const tf of spec.templated_files || []) {
    const dest = subst(tf.dest);
    if (!dest.endsWith('.json')) continue;
    let data;
    try {
      data = JSON.parse(fs.readFileSync(path.join(tmp, dest), 'utf8'));
    } catch (error) {
      errors.push(`${dest}: invalid JSON: ${error.message}`);
      continue;
    }
    if (dest.endsWith('/.codex-plugin/plugin.json') && data.skills !== './skills/') {
      errors.push(`${dest}: Codex plugin skills must be string './skills/' (got ${JSON.stringify(data.skills)})`);
    }
    let version = data.version;
    if (version === undefined && Array.isArray(data.plugins) && data.plugins.length > 0) {
      version = data.plugins[0].version;
    }
    if (version !== undefined) versions[dest] = version;
  }
  if (new Set(Object.values(versions)).size > 1) {
    errors.push(`version drift across manifests: ${JSON.stringify(versions)}`);
  }

  const gt = childProcess.spawnSync('bash', [path.join(root, 'scripts/tree/guard.sh'), tmp], {
    encoding: 'utf8',
  });
  if (gt.status !== 0) errors.push(`scripts/tree/guard.sh failed on rendered tree:\n${gt.stdout}${gt.stderr}`.trim());
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}

if (errors.length > 0) {
  console.log('scaffold/test FAILED:');
  for (const error of errors) console.log(` - ${error}`);
  process.exit(1);
}
console.log('scaffold/test PASSED: templates render to a valid skeleton (JSON ok, versions agree, nodes valid, no stray placeholders)');
JS
exit $?
