#!/usr/bin/env node
// idempotency.mjs — re-running the
// skill-maintainer on unchanged skills is a no-op: the content hash is
// deterministic, and every stored content_hash is in sync (--check-only exits 0).
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const HASH = path.join(ROOT, 'scripts/skills/content-hash.mjs');
const hash = (arg) => spawnSync('node', [HASH, arg], { encoding: 'utf8' });
let fail = 0;

// 1. determinism — same input twice yields the same hash
const skillsRoot = path.join(ROOT, 'plugins/docks/skills');
const cat0 = fs
  .readdirSync(skillsRoot)
  .sort()
  .find((c) => fs.statSync(path.join(skillsRoot, c)).isDirectory());
const skill0 = fs.readdirSync(path.join(skillsRoot, cat0)).sort()[0];
const sample = path.join(skillsRoot, cat0, skill0);
const h1 = hash(sample).stdout.trim();
const h2 = hash(sample).stdout.trim();
if (!h1 || h1 !== h2) {
  console.log(`FAIL: non-deterministic hash for ${sample} ('${h1}' != '${h2}')`);
  fail = 1;
} else console.log(`ok: deterministic hash (${sample})`);

// 2. idempotency — the maintainer would bump nothing
const check = spawnSync('node', [HASH, '--check-only'], { encoding: 'utf8' });
if ((check.status ?? 1) === 0) {
  const unchanged = (check.stdout.match(/^unchanged /gm) || []).length;
  const upstream = fs
    .readdirSync(skillsRoot)
    .flatMap((c) => {
      const cp = path.join(skillsRoot, c);
      return fs.statSync(cp).isDirectory() ? fs.readdirSync(cp).map((s) => path.join(cp, s, 'SKILL.md')) : [];
    })
    .filter((f) => fs.existsSync(f) && /^upstream:/m.test(fs.readFileSync(f, 'utf8'))).length;
  console.log(`ok: all kit skills in sync (${unchanged} unchanged, ${upstream} upstream skipped)`);
} else {
  console.log('FAIL: skills out of sync — maintainer would bump:');
  console.log((check.stdout.match(/^would-bump .*/gm) || []).map((l) => `  ${l}`).join('\n'));
  console.log('  fix: node scripts/skills/content-hash.mjs --backfill  (and bump metadata.updated on changed skills)');
  fail = 1;
}

if (fail === 0) {
  console.log('PASS: skill-maintainer idempotency');
  process.exit(0);
}
process.exit(1);
