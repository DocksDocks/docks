#!/usr/bin/env node
// Guard: validate context-tree nodes.
// A node is a directory carrying AGENTS.md; AGENTS.md must stay <= 500 lines.
// Any CLAUDE.md (incl. .claude/CLAUDE.md) fails: this repo keeps one home for instructions,
// and a CLAUDE.md without an `@AGENTS.md` import makes Claude read it instead of AGENTS.md.
// The root AGENTS.md routing table (rows naming `<dir>/AGENTS.md`, or `@<dir>/AGENTS.md`)
// must name every nested node, and every row must resolve. Every backticked repo pointer in
// a node must resolve, and scripts/AGENTS.md's validator table must match scripts on disk.
// Usage: tree/guard.mjs [repo-root]
import { spawnSync } from 'node:child_process';
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
    // A symlinked CLAUDE.md is a CLAUDE.md too, so check it before skipping links.
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
    `${path.relative(ROOT, file)} — legacy CLAUDE.md: keep one home for instructions (a CLAUDE.md without an @AGENTS.md import makes Claude read it instead of AGENTS.md); move content to AGENTS.md or .claude/rules/ and delete it`,
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
    for (const m of line.matchAll(/`@?([^`\s]*AGENTS\.md)`/g)) routed.add(m[1]);
  }
  const nested = dirs.filter((d) => d !== ROOT).map((d) => path.relative(ROOT, path.join(d, 'AGENTS.md')));
  for (const rel of nested) if (!routed.has(rel)) fail(`${rel} — node not routed from the root AGENTS.md table`);
  for (const rel of routed)
    if (!fs.existsSync(path.join(ROOT, rel))) fail(`AGENTS.md table row \`${rel}\` — dead route (file missing)`);
}

// Top-level directories a pointer may start with: git-tracked ones in a git repo root,
// else the directories present at ROOT.
function topLevelDirs() {
  const top = spawnSync('git', ['-C', ROOT, 'rev-parse', '--show-toplevel'], { encoding: 'utf8' });
  if (top.status === 0 && fs.realpathSync(top.stdout.trim()) === fs.realpathSync(ROOT)) {
    const files = spawnSync('git', ['-C', ROOT, 'ls-files', '-z'], { encoding: 'utf8', maxBuffer: 1 << 28 });
    if (files.status === 0) {
      return new Set(
        files.stdout
          .split('\0')
          .filter((f) => f.includes('/'))
          .map((f) => f.slice(0, f.indexOf('/'))),
      );
    }
  }
  return new Set(
    fs
      .readdirSync(ROOT, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name),
  );
}

// Backticked spans outside fenced code blocks. A span opened by N backticks closes at the
// next run of exactly N backticks (CommonMark), so `` `a` — `b` `` stays one span.
function backtickedTokens(text) {
  const tokens = [];
  let fenced = false;
  for (const line of text.split('\n')) {
    if (/^\s*(```|~~~)/.test(line)) {
      fenced = !fenced;
      continue;
    }
    if (fenced) continue;
    for (const m of line.matchAll(/(?<!`)(`+)(?!`)(.+?)(?<!`)\1(?!`)/g)) tokens.push(m[2].trim());
  }
  return tokens;
}

// A pointer names a repo path: it holds '/', is not an `@/` import alias, holds no
// placeholder, glob, variable, quote, or whitespace, and starts at a tracked top-level dir.
const topDirs = topLevelDirs();
for (const dir of dirs) {
  const node = path.relative(ROOT, path.join(dir, 'AGENTS.md'));
  for (const token of backtickedTokens(readTreeFile(path.join(dir, 'AGENTS.md')))) {
    if (!token.includes('/') || token.startsWith('@/') || /[<>*{}$"'\s]/.test(token)) continue;
    const target = token.replace(/[,.;:)]+$/, '').replace(/:\d+(-\d+)?$/, '');
    if (!topDirs.has(target.split('/')[0])) continue;
    if (fs.existsSync(path.join(dir, target)) || fs.existsSync(path.join(ROOT, target))) continue;
    fail(`${node} — dead pointer \`${token}\``);
  }
}

// scripts/AGENTS.md validator table: every validator script has a row, every row resolves.
// lib/ holds shared modules (a lib validator may still have a row); tests/unit/ runs as one
// suite; the allowlist names entry points that are not validators.
const NON_VALIDATOR_SCRIPTS = new Set(['release.mjs', 'ci-target.mjs', 'capture-tdd-red.mjs']);
const scriptsDir = path.join(ROOT, 'scripts');
const scriptsAgents = path.join(scriptsDir, 'AGENTS.md');
if (fs.existsSync(scriptsAgents)) {
  const rows = new Set();
  for (const line of readTreeFile(scriptsAgents).split('\n')) {
    const first = line.match(/^\|\s*`([^`\s]+\.mjs)`\s*\|/);
    if (first) rows.add(first[1]);
  }
  const onDisk = [];
  (function walkScripts(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      const rel = path.relative(scriptsDir, full).split(path.sep).join('/');
      if (e.isDirectory()) {
        if (e.name !== 'node_modules' && rel !== 'lib' && rel !== 'tests/unit') walkScripts(full);
      } else if (e.isFile() && e.name.endsWith('.mjs') && !NON_VALIDATOR_SCRIPTS.has(rel)) onDisk.push(rel);
    }
  })(scriptsDir);
  for (const rel of onDisk.sort())
    if (!rows.has(rel)) fail(`scripts/${rel} — script missing from the scripts/AGENTS.md validator table`);
  for (const rel of rows)
    if (!fs.existsSync(path.join(scriptsDir, rel)) && !fs.existsSync(path.join(ROOT, rel)))
      fail(`scripts/AGENTS.md table row \`${rel}\` — dead row (script missing)`);
}

if (errors > 0) {
  console.error(`tree/guard FAILED: ${errors} error(s) across ${dirs.length} node(s)`);
  process.exit(1);
}
console.log(`tree/guard PASSED: ${dirs.length} context-tree node(s) valid`);
