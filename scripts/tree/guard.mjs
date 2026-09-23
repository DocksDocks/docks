#!/usr/bin/env node
// Guard: validate context-tree nodes.
// A node is a directory carrying AGENTS.md; AGENTS.md must stay <= 500 lines.
// Any CLAUDE.md (incl. .claude/CLAUDE.md) fails: it suppresses Claude Code's native
// AGENTS.md loading. The root AGENTS.md routing table (rows naming `<dir>/AGENTS.md`)
// must name every nested node, and every row must resolve. Usage: tree/guard.mjs [repo-root]
import fs from 'node:fs';
import path from 'node:path';

const SCRIPT_DIR = path.dirname(new URL(import.meta.url).pathname);
const ROOT = path.resolve(process.argv[2] || path.join(SCRIPT_DIR, '../..'));
try {
  if (!fs.statSync(ROOT).isDirectory()) throw new Error('not a directory');
  fs.accessSync(ROOT, fs.constants.R_OK);
} catch {
  console.error(`FAIL: tree root not found or unreadable: ${ROOT}`);
  process.exit(2);
}

const nodeDirs = new Set();
const legacyClaude = [];
(function walk(dir) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (error) {
    console.error(`FAIL: cannot read tree directory ${path.resolve(dir)}: ${error.message}`);
    process.exit(2);
  }
  for (const e of entries) {
    if (e.name === '.git' || e.name === 'node_modules') continue;
    const full = path.join(dir, e.name);
    // A symlinked CLAUDE.md suppresses AGENTS.md loading too, so check it before skipping links.
    if (e.name === 'CLAUDE.md') legacyClaude.push(full);
    else if (e.isSymbolicLink()) continue;
    else if (e.isDirectory()) walk(full);
    else if (e.name === 'AGENTS.md') nodeDirs.add(dir);
  }
})(ROOT);

const dirs = [...nodeDirs].sort();
let errors = 0;
const fail = (m) => {
  console.error(`FAIL: ${m}`);
  errors += 1;
};

function readTreeFile(file) {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch (error) {
    console.error(`FAIL: cannot read tree file ${path.resolve(file)}: ${error.message}`);
    process.exit(2);
  }
}

for (const file of legacyClaude.sort()) {
  fail(
    `${path.relative(ROOT, file)} — legacy CLAUDE.md suppresses native AGENTS.md loading in Claude Code; move content to AGENTS.md or .claude/rules/ and delete it`,
  );
}

for (const dir of dirs) {
  const rel = dir === ROOT ? '(root)' : path.relative(ROOT, dir);
  const agents = path.join(dir, 'AGENTS.md');
  const alines = (readTreeFile(agents).match(/\n/g) || []).length;
  if (alines > 500) fail(`${rel}/AGENTS.md — ${alines} lines (cap: 500). Split the folder or tighten.`);
}

// Routing table: a hand-kept list is durable only while a check compares it with disk.
const rootAgents = path.join(ROOT, 'AGENTS.md');
if (fs.existsSync(rootAgents)) {
  const routed = new Set();
  for (const line of readTreeFile(rootAgents).split('\n')) {
    if (!line.startsWith('|')) continue;
    for (const m of line.matchAll(/`([^`\s]*AGENTS\.md)`/g)) routed.add(m[1]);
  }
  const nested = dirs.filter((d) => d !== ROOT).map((d) => path.relative(ROOT, path.join(d, 'AGENTS.md')));
  for (const rel of nested) if (!routed.has(rel)) fail(`${rel} — node not routed from the root AGENTS.md table`);
  for (const rel of routed)
    if (!fs.existsSync(path.join(ROOT, rel))) fail(`AGENTS.md table row \`${rel}\` — dead route (file missing)`);
}

if (errors > 0) {
  console.error(`tree/guard FAILED: ${errors} error(s) across ${dirs.length} node(s)`);
  process.exit(1);
}
console.log(`tree/guard PASSED: ${dirs.length} context-tree node(s) valid`);
