#!/bin/bash
# Smoke test: render docs/scaffold/templates with fixed test values into a temp
# dir and assert the result is a structurally valid plugin skeleton —
#   - no '{{ }}' placeholder leaks through the rendered files
#   - every rendered .json manifest parses
#   - the versioned manifests agree on version
#   - every context-tree node is a valid pair (via scripts/tree/guard.sh)
# Then materialize a COMPLETE seed (bundled skills + validator scripts + a
# node_modules symlink) and run the seeded scripts/ci.sh end-to-end, asserting
# it exits 0 — i.e. "a freshly seeded project starts green". That last step is
# what catches a missing root CLAUDE.md, an unbundled validator dependency, or a
# broken ci.sh template — gaps a templates-only render would miss.
# No-op (pass) when there is no scaffold spec.
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
  // --- render the seed's templated_files + context-tree nodes ---
  // Root CLAUDE.md is a real templated_file in the spec now — NOT faked here, so
  // this test genuinely fails if the spec stops emitting it.
  for (const tf of spec.templated_files || []) {
    const src = fs.readFileSync(path.join(tdir, tf.template), 'utf8');
    write(subst(tf.dest), subst(src));
  }
  for (const node of spec.tree_nodes || []) {
    const nodePath = subst(node.path);
    const body = node.template
      ? subst(fs.readFileSync(path.join(tdir, node.template), 'utf8'))
      : `# ${nodePath}\n\nSeeded node.\n`;
    write(path.join(nodePath, 'AGENTS.md'), body);
    write(path.join(nodePath, 'CLAUDE.md'), '@AGENTS.md\n');
  }

  // --- assertions on the RENDERED tree only ---
  // (bundled skills are copied in the next stage; some legitimately carry their
  //  own {{ISO_DATE}}-style placeholders in docs, so the leak check runs first.)
  const leftovers = [];
  walk(tmp, (file) => {
    if (fs.readFileSync(file, 'utf8').includes('{{')) leftovers.push(path.relative(tmp, file));
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

  // --- materialize a COMPLETE seed and run its ci.sh ("seeds start green") ---
  // Only worth doing if the render is already sane; otherwise the errors above
  // are the actionable signal.
  if (errors.length === 0) {
    // bundled skills (verbatim) → plugins/<name>/<category-path>
    for (const b of spec.bundled_skills || []) {
      const rel = b.destination
        ? subst(b.destination)
        : `plugins/${vars.plugin_name}/${b.source.replace(/^plugins\/[^/]+\//, '')}`;
      const dest = path.join(tmp, rel);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.cpSync(path.join(root, b.source), dest, { recursive: true });
    }
    // validator scripts (verbatim) → same relative path
    for (const s of spec.scripts || []) {
      const dest = path.join(tmp, s.source);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.cpSync(path.join(root, s.source), dest);
    }
    // node_modules so the seeded skill guards can require('yaml')
    const nm = path.join(root, 'node_modules');
    if (fs.existsSync(nm)) {
      try { fs.symlinkSync(nm, path.join(tmp, 'node_modules'), 'dir'); } catch { /* exists */ }
    }
    // run the seeded gate end-to-end
    const seededCi = path.join(tmp, 'scripts/ci.sh');
    if (!fs.existsSync(seededCi)) {
      errors.push('seed has no scripts/ci.sh — the spec should render ci.sh.template into the seed');
    } else {
      const ci = childProcess.spawnSync('bash', [seededCi, '-q'], { encoding: 'utf8' });
      if (ci.status !== 0) {
        errors.push(`seeded scripts/ci.sh exited ${ci.status} — a fresh seed is NOT green:\n${ci.stdout}${ci.stderr}`.trim());
      }
    }
  }
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}

if (errors.length > 0) {
  console.log('scaffold/test FAILED:');
  for (const error of errors) console.log(` - ${error}`);
  process.exit(1);
}
console.log('scaffold/test PASSED: templates render to a valid skeleton AND a full seed passes its own ci.sh');
JS
exit $?
