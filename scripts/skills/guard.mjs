#!/usr/bin/env node
// guard.mjs — run the skill frontmatter validators
// (codex + claude via validate-skills.mjs), the Codex-fact drift guard, and the
// reference-hygiene guard. Usage: guard.mjs [skills-dir]
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const SCRIPT_DIR = path.dirname(new URL(import.meta.url).pathname);
const REPO_DIR = path.resolve(SCRIPT_DIR, '../..');
const DIR = process.argv[2] || '';

function run(args) {
  const r = spawnSync('node', args, { stdio: 'inherit' });
  if ((r.status ?? 1) !== 0) process.exit(r.status ?? 1);
}

const lib = path.join(REPO_DIR, 'scripts/lib/validate-skills.mjs');
const target = DIR || path.join(REPO_DIR, 'plugins/docks/skills');
run([lib, '--runtime', 'codex', target]);
run([lib, '--runtime', 'claude', target]);
run([path.join(REPO_DIR, 'scripts/skills/codex-facts.mjs')]);
run([path.join(REPO_DIR, 'scripts/skills/refs-guard.mjs'), ...(DIR ? [DIR] : [])]);

console.log('Guard PASSED: skills match Codex and Claude conventions');
