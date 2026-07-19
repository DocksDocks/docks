#!/usr/bin/env node
// transform-guard.mjs — curated content-transforming
// skills must carry a preservation <constraint> + a "## Verification" block, so a
// future edit can't silently strip a transforming skill's data-loss guard.
// Usage: transform-guard.mjs [skills-dir]
import fs from 'node:fs';
import path from 'node:path';
import { findSkillByName } from '../lib/skills-walk.mjs';
import { splitLines, bodyAfterFrontmatter } from '../lib/skills-parse.mjs';

const SCRIPT_DIR = path.dirname(new URL(import.meta.url).pathname);
const REPO_DIR = path.resolve(SCRIPT_DIR, '../..');
const DIR = path.resolve(process.argv[2] || path.join(REPO_DIR, 'plugins/docks/skills'));

const TRANSFORMING_SKILLS = ['context-tree', 'multi-tool-bridge', 'skill-agent-pipeline', 'skill-maintenance', 'refactor', 'plan-workspace'];
const PENDING = [];

const PRES_RE = /content loss|no content|preserv|verbatim|net.?shrink|byte.?delta|section presence|drop a section|relocate.{0,12}verbatim/i;
const VERIFY_RE = /^#{2,3} *verification|verify (before|every|each)|verification block/im;

const body = (file) => bodyAfterFrontmatter(splitLines(fs.readFileSync(file, 'utf8'))).join('\n');

let warn = 0; let fail = 0; let missing = 0;
for (const name of TRANSFORMING_SKILLS) {
  const file = findSkillByName(DIR, name);
  if (!file) { console.error(`FAIL: listed transforming skill '${name}' has no SKILL.md under ${DIR}`); missing += 1; continue; }
  const b = body(file);
  if (PRES_RE.test(b) && VERIFY_RE.test(b)) continue;
  let miss = '';
  if (!PRES_RE.test(b)) miss += 'preservation <constraint>; ';
  if (!VERIFY_RE.test(b)) miss += '## Verification block; ';
  if (PENDING.includes(name)) { console.error(`WARN: ${name} lacks: ${miss}(allowlisted — pending rollout)`); warn += 1; }
  else { console.error(`FAIL: ${name} lacks: ${miss}(was hardened — regression?)`); fail += 1; }
}

if (fail + missing > 0) {
  console.error(`transform-guard FAILED: ${fail} unprotected + ${missing} missing of listed transformers; ${warn} pending`);
  process.exit(1);
}
console.log(`transform-guard PASSED: ${warn} pending (allowlisted), ${TRANSFORMING_SKILLS.length - warn} enforced-clean`);
