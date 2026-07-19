#!/usr/bin/env node
// test.mjs — render docs/scaffold/templates with fixed test
// values into a temp dir, assert it's a structurally valid plugin skeleton, then
// materialize a COMPLETE seed and run the seeded scripts/ci.mjs end-to-end
// ("a freshly seeded project starts green"). No-op when there is no scaffold spec.
import childProcess from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseDocument } from 'yaml';

const ROOT = path.resolve(process.argv[2] || path.join(path.dirname(new URL(import.meta.url).pathname), '../..'));
const specPath = path.join(ROOT, 'docs/scaffold/spec.yaml');
if (!fs.existsSync(specPath)) { console.log('scaffold/test: no docs/scaffold/spec.yaml — skipped'); process.exit(0); }

const doc = parseDocument(fs.readFileSync(specPath, 'utf8'), { prettyErrors: true, strict: true, uniqueKeys: true });
if (doc.errors.length > 0) {
  console.error('scaffold/test FAILED:');
  for (const e of doc.errors) console.error(` - spec.yaml does not parse: ${e.message}`);
  process.exit(1);
}
const spec = doc.toJS() || {};
const tdir = path.join(ROOT, 'docs/scaffold/templates');
const vars = { plugin_name: 'acme-tools', plugin_description: 'A test plugin', author_name: 'Test Author', author_email: 'test@example.com', license: 'MIT' };
const subst = (v) => Object.entries(vars).reduce((o, [k, r]) => o.replace(new RegExp(`{{\\s*${k}\\s*}}`, 'g'), r), v);

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'scaffold-test-'));
const errors = [];
const write = (dest, content) => { const f = path.join(tmp, dest); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, content); };
function walk(dir, visit) { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const f = path.join(dir, e.name); if (e.isDirectory()) walk(f, visit); else if (e.isFile()) visit(f); } }

try {
  for (const tf of spec.templated_files || []) {
    const dest = subst(tf.dest);
    write(dest, subst(fs.readFileSync(path.join(tdir, tf.template), 'utf8')));
    if (dest.endsWith('.sh')) fs.chmodSync(path.join(tmp, dest), 0o755);
  }
  for (const node of spec.tree_nodes || []) {
    const nodePath = subst(node.path);
    const body = node.template ? subst(fs.readFileSync(path.join(tdir, node.template), 'utf8')) : `# ${nodePath}\n\nSeeded node.\n`;
    write(path.join(nodePath, 'AGENTS.md'), body);
    write(path.join(nodePath, 'CLAUDE.md'), '@AGENTS.md\n');
  }

  const leftovers = [];
  walk(tmp, (f) => { if (fs.readFileSync(f, 'utf8').includes('{{')) leftovers.push(path.relative(tmp, f)); });
  if (leftovers.length > 0) errors.push(`leftover placeholders:\n${leftovers.join('\n')}`);

  for (const tf of spec.templated_files || []) {
    const dest = subst(tf.dest);
    if (dest.endsWith('.sh') && !(fs.statSync(path.join(tmp, dest)).mode & 0o111)) errors.push(`${dest}: seeded shell entrypoint is not executable (expected +x)`);
  }

  const versions = {};
  for (const tf of spec.templated_files || []) {
    const dest = subst(tf.dest);
    if (!dest.endsWith('.json')) continue;
    let data;
    try { data = JSON.parse(fs.readFileSync(path.join(tmp, dest), 'utf8')); } catch (e) { errors.push(`${dest}: invalid JSON: ${e.message}`); continue; }
    if (dest.endsWith('/.codex-plugin/plugin.json') && data.skills !== './skills/') errors.push(`${dest}: Codex plugin skills must be string './skills/' (got ${JSON.stringify(data.skills)})`);
    let version = data.version;
    if (version === undefined && Array.isArray(data.plugins) && data.plugins.length > 0) version = data.plugins[0].version;
    if (version !== undefined) versions[dest] = version;
  }
  if (new Set(Object.values(versions)).size > 1) errors.push(`version drift across manifests: ${JSON.stringify(versions)}`);

  const gt = childProcess.spawnSync('node', [path.join(ROOT, 'scripts/tree/guard.mjs'), tmp], { encoding: 'utf8' });
  if (gt.status !== 0) errors.push(`scripts/tree/guard.mjs failed on rendered tree:\n${gt.stdout}${gt.stderr}`.trim());

  if (errors.length === 0) {
    for (const b of spec.bundled_skills || []) {
      const rel = b.destination ? subst(b.destination) : `plugins/${vars.plugin_name}/${b.source.replace(/^plugins\/[^/]+\//, '')}`;
      const dest = path.join(tmp, rel);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.cpSync(path.join(ROOT, b.source), dest, { recursive: true });
    }
    for (const s of spec.scripts || []) {
      const dest = path.join(tmp, s.source);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.cpSync(path.join(ROOT, s.source), dest);
    }
    const nm = path.join(ROOT, 'node_modules');
    if (fs.existsSync(nm)) { try { fs.symlinkSync(nm, path.join(tmp, 'node_modules'), 'dir'); } catch { /* exists */ } }
    const seededCi = path.join(tmp, 'scripts/ci.mjs');
    if (!fs.existsSync(seededCi)) errors.push('seed has no scripts/ci.mjs — the spec should render ci.mjs.template into the seed');
    else {
      const ci = childProcess.spawnSync('node', [seededCi, '-q'], { encoding: 'utf8' });
      if (ci.status !== 0) errors.push(`seeded scripts/ci.mjs exited ${ci.status} — a fresh seed is NOT green:\n${ci.stdout}${ci.stderr}`.trim());
    }
  }
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}

if (errors.length > 0) {
  console.log('scaffold/test FAILED:');
  for (const e of errors) console.log(` - ${e}`);
  process.exit(1);
}
console.log('scaffold/test PASSED: templates render to a valid skeleton AND a full seed passes its own ci.mjs');
