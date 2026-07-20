#!/usr/bin/env node
// guard.mjs — run the combined skill frontmatter validator, the Codex-fact
// drift guard, and the reference-hygiene guard. Usage: guard.mjs [skills-dir]
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const SCRIPT_DIR = path.dirname(new URL(import.meta.url).pathname);
const REPO_DIR = path.resolve(SCRIPT_DIR, '../..');
const DIR = process.argv[2] || '';

function run(args) {
  const result = spawnSync('node', args, { stdio: 'inherit' });
  const command = `node ${args.join(' ')}`;
  if (result.error) {
    console.error(`FAIL: ${command} could not start: ${result.error.message}`);
    process.exit(1);
  }
  if (result.signal !== null || result.status === null) {
    console.error(`FAIL: ${command} terminated by ${result.signal ?? 'unknown signal'}`);
    process.exit(1);
  }
  if (result.status !== 0) process.exit(result.status);
}

const lib = path.join(REPO_DIR, 'scripts/lib/validate-skills.mjs');
const target = DIR || path.join(REPO_DIR, 'plugins/docks/skills');
run([lib, '--runtime', 'all', target]);
run([path.join(REPO_DIR, 'scripts/skills/codex-facts.mjs')]);
run([path.join(REPO_DIR, 'scripts/skills/refs-guard.mjs'), ...(DIR ? [DIR] : [])]);

console.log('Guard PASSED: skills match Codex and Claude conventions');
