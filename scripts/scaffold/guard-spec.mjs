#!/usr/bin/env node
// guard-spec.mjs — validate docs/scaffold/spec.yaml is
// coherent: it parses, and every template / bundled-skill / script path resolves.
// No-op when the repo has no scaffold spec. Usage: guard-spec.mjs [repo-root]
import fs from 'node:fs';
import path from 'node:path';
import { parseDocument } from 'yaml';

const SCRIPT_DIR = path.dirname(new URL(import.meta.url).pathname);
const ROOT = path.resolve(process.argv[2] || path.join(SCRIPT_DIR, '../..'));
const SPEC = path.join(ROOT, 'docs/scaffold/spec.yaml');

if (!fs.existsSync(SPEC)) {
  console.log('scaffold/guard-spec: no docs/scaffold/spec.yaml — skipped');
  process.exit(0);
}

const doc = parseDocument(fs.readFileSync(SPEC, 'utf8'), { prettyErrors: true, strict: true, uniqueKeys: true });
if (doc.errors.length > 0) {
  for (const error of doc.errors) console.error(`FAIL: spec.yaml does not parse: ${error.message}`);
  console.error('scaffold/guard-spec FAILED');
  process.exit(1);
}
const spec = doc.toJS() || {};
let err = 0;
const tdir = path.join(ROOT, 'docs/scaffold/templates');
const fail = (m) => { console.error(`FAIL: ${m}`); err = 1; };

if (spec.version !== 1) fail(`unsupported spec version ${JSON.stringify(spec.version)} (expected 1)`);

for (const tf of spec.templated_files || []) {
  if (!fs.existsSync(path.join(tdir, tf.template || ''))) fail(`templated_files template missing: ${tf.template || ''}`);
  if (!tf.dest) fail(`templated_files entry has no dest: ${JSON.stringify(tf)}`);
}
for (const node of spec.tree_nodes || []) {
  if (!node.path) fail(`tree_node has no path: ${JSON.stringify(node)}`);
  const sources = ['seed_from_skill', 'template', 'seed'].filter((k) => k in node);
  if (sources.length !== 1) fail(`tree_node ${node.path} needs exactly one of seed_from_skill/template/seed`);
  if (node.template && !fs.existsSync(path.join(tdir, node.template))) fail(`tree_node template missing: ${node.template}`);
}
for (const bundled of spec.bundled_skills || []) {
  if (!fs.existsSync(path.join(ROOT, bundled.source || ''))) fail(`bundled_skills source missing: ${bundled.source || ''}`);
}
for (const script of spec.scripts || []) {
  if (!fs.existsSync(path.join(ROOT, script.source || ''))) fail(`scripts source missing: ${script.source || ''}`);
}
const variables = spec.variables || {};
if (Object.keys(variables).length === 0) fail('spec has no variables');
for (const [name, value] of Object.entries(variables)) {
  if (!value || typeof value !== 'object' || !('prompt' in value)) fail(`variable ${JSON.stringify(name)} has no prompt`);
}

if (err) { console.error('scaffold/guard-spec FAILED'); process.exit(1); }
console.log('scaffold/guard-spec PASSED: spec.yaml coherent; all referenced paths resolve');
