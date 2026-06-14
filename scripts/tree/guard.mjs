#!/usr/bin/env node
// Guard: validate context-tree node pairs (port of tree/guard.sh).
// Every dir carrying AGENTS.md or CLAUDE.md must be a COMPLETE node:
//   - both present (no half-pairs); CLAUDE.md is exactly the one-line `@AGENTS.md`;
//   - AGENTS.md <= 500 lines. Usage: tree/guard.mjs [repo-root]
import fs from 'node:fs';
import path from 'node:path';

const SCRIPT_DIR = path.dirname(new URL(import.meta.url).pathname);
const ROOT = path.resolve(process.argv[2] || path.join(SCRIPT_DIR, '../..'));

const nodeDirs = new Set();
(function walk(dir) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    if (e.name === '.git' || e.name === 'node_modules') continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full);
    else if (e.name === 'AGENTS.md' || e.name === 'CLAUDE.md') nodeDirs.add(dir);
  }
})(ROOT);

const dirs = [...nodeDirs].sort();
let errors = 0;
const fail = (m) => { console.error(`FAIL: ${m}`); errors += 1; };

for (const dir of dirs) {
  const rel = dir === ROOT ? '(root)' : path.relative(ROOT, dir);
  const agents = path.join(dir, 'AGENTS.md');
  const claude = path.join(dir, 'CLAUDE.md');
  if (!fs.existsSync(agents)) { fail(`${rel} — CLAUDE.md present but AGENTS.md missing (half-pair)`); continue; }
  if (!fs.existsSync(claude)) { fail(`${rel} — AGENTS.md present but CLAUDE.md missing (invisible to Claude Code's walker)`); continue; }
  const claudeBody = fs.readFileSync(claude, 'utf8')
    .split('\n').filter((l) => !/^\s*$/.test(l)).map((l) => l.replace(/\s+$/, '')).join('\n');
  if (claudeBody !== '@AGENTS.md') {
    fail(`${rel}/CLAUDE.md — must contain only '@AGENTS.md' (move any other content into AGENTS.md)`);
  }
  const alines = (fs.readFileSync(agents, 'utf8').match(/\n/g) || []).length;
  if (alines > 500) fail(`${rel}/AGENTS.md — ${alines} lines (cap: 500). Split the folder or tighten.`);
}

if (errors > 0) { console.error(`tree/guard FAILED: ${errors} error(s) across ${dirs.length} node(s)`); process.exit(1); }
console.log(`tree/guard PASSED: ${dirs.length} context-tree node(s) valid`);
