#!/usr/bin/env node
// transform-guard.mjs — curated content-transforming
// skills must carry a preservation <constraint> + a "## Verification" block, so a
// future edit can't silently strip a transforming skill's data-loss guard.
// Usage: transform-guard.mjs [skills-dir]
import fs from 'node:fs';
import path from 'node:path';
import { PLUGINS } from '../lib/plugins.mjs';
import { bodyAfterFrontmatter, splitLines } from '../lib/skills-parse.mjs';
import { findSkillByName } from '../lib/skills-walk.mjs';

const SCRIPT_DIR = path.dirname(new URL(import.meta.url).pathname);
const REPO_DIR = path.resolve(SCRIPT_DIR, '../..');
// An explicit argument scans exactly that one root (targeted invocation). The
// bare default is registry-derived: the curated list below is repo-wide while
// the transforming skills it names are distributed across plugin skill roots,
// so a single hardcoded root silently loses a skill after a cross-plugin move.
const DIRS = process.argv[2]
  ? [path.resolve(process.argv[2])]
  : PLUGINS.filter((p) => p.skills)
      .map((p) => path.resolve(REPO_DIR, p.skills))
      .filter((dir) => fs.existsSync(dir));

const TRANSFORMING_SKILLS = [
  'context-tree',
  'multi-tool-bridge',
  'skill-agent-pipeline',
  'skill-maintenance',
  'refactor',
  'plan-workspace',
];
const PENDING = [];

const PRES_RE =
  /content loss|no content|preserv|verbatim|net.?shrink|byte.?delta|section presence|drop a section|relocate.{0,12}verbatim/i;
const VERIFY_RE = /^#{2,3} *verification|verify (before|every|each)|verification block/im;

const body = (file) => bodyAfterFrontmatter(splitLines(fs.readFileSync(file, 'utf8'))).join('\n');

let warn = 0;
let fail = 0;
let missing = 0;
try {
  for (const name of TRANSFORMING_SKILLS) {
    let file = null;
    for (const dir of DIRS) {
      file = findSkillByName(dir, name);
      if (file) break;
    }
    if (!file) {
      console.error(`FAIL: listed transforming skill '${name}' has no SKILL.md under ${DIRS.join(', ')}`);
      missing += 1;
      continue;
    }
    const b = body(file);
    if (PRES_RE.test(b) && VERIFY_RE.test(b)) continue;
    let miss = '';
    if (!PRES_RE.test(b)) miss += 'preservation <constraint>; ';
    if (!VERIFY_RE.test(b)) miss += '## Verification block; ';
    if (PENDING.includes(name)) {
      console.error(`WARN: ${name} lacks: ${miss}(allowlisted — pending rollout)`);
      warn += 1;
    } else {
      console.error(`FAIL: ${name} lacks: ${miss}(was hardened — regression?)`);
      fail += 1;
    }
  }
} catch (error) {
  console.error(`FAIL: ${error.message}`);
  process.exit(2);
}

if (fail + missing > 0) {
  console.error(
    `transform-guard FAILED: ${fail} unprotected + ${missing} missing of listed transformers; ${warn} pending`,
  );
  process.exit(1);
}
console.log(
  `transform-guard PASSED: ${warn} pending (allowlisted), ${TRANSFORMING_SKILLS.length - warn} enforced-clean`,
);
