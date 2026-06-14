#!/usr/bin/env node
// content-hash.mjs — deterministic skill content hash.
// The hash covers a skill's MEANING: normalized frontmatter (excluding the
// `updated:` + `content_hash:` bookkeeping lines) + body + sorted references/*.md.
// The normalization here is load-bearing: change it and every stored
// content_hash invalidates, so keep it byte-stable.
//
// Usage:
//   content-hash.mjs <skill-dir>            print the content hash of one skill
//   content-hash.mjs --backfill [root]      write/refresh content_hash on every kit skill
//   content-hash.mjs --check-only [root]    report unchanged | would-bump; exit 1 if any would-bump
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { eachSkillDir } from '../lib/skills-walk.mjs';

const SCRIPT_DIR = path.dirname(new URL(import.meta.url).pathname);
const REPO_DIR = path.resolve(SCRIPT_DIR, '../..');
const DEFAULT_ROOT = path.join(REPO_DIR, 'plugins/docks/skills');

const sha256 = (s) => crypto.createHash('sha256').update(s, 'utf8').digest('hex');

// normalize: strip trailing whitespace per line, drop CR, collapse blank-line runs
// (sed 's/[[:space:]]*$//' | tr -d '\r' | cat -s).
function normalize(text) {
  let lines = text.split('\n').map((l) => l.replace(/[ \t\r\f\v]*$/, '').replace(/\r/g, ''));
  const out = [];
  let prevBlank = false;
  for (const l of lines) {
    const blank = l === '';
    if (blank && prevBlank) continue;
    out.push(l);
    prevBlank = blank;
  }
  return out.join('\n');
}

const isUpstream = (dir) => {
  const f = path.join(dir, 'SKILL.md');
  return fs.existsSync(f) && /^upstream:/m.test(fs.readFileSync(f, 'utf8'));
};

// awk: keep frontmatter line 1 `---`, drop `^\s*updated:` / `^\s*content_hash:`
// inside the frontmatter, keep everything else. Each kept line + '\n'.
function strippedSkillMd(content) {
  const records = content.endsWith('\n') ? content.slice(0, -1).split('\n') : content.split('\n');
  let fm = 0;
  const kept = [];
  records.forEach((line, i) => {
    if (i === 0 && line === '---') { fm = 1; kept.push(line); return; }
    if (fm === 1 && line === '---') { fm = 0; kept.push(line); return; }
    if (fm === 1 && /^[ \t]*updated:/.test(line)) return;
    if (fm === 1 && /^[ \t]*content_hash:/.test(line)) return;
    kept.push(line);
  });
  return kept.map((l) => `${l}\n`).join('');
}

function hashSkill(dir) {
  const file = path.join(dir, 'SKILL.md');
  if (!fs.existsSync(file)) throw new Error(`${file} not found`);
  let assembled = strippedSkillMd(fs.readFileSync(file, 'utf8'));
  const refDir = path.join(dir, 'references');
  if (fs.existsSync(refDir) && fs.statSync(refDir).isDirectory()) {
    const refs = fs.readdirSync(refDir).filter((f) => f.endsWith('.md')).sort();
    for (const r of refs) {
      const rp = path.join(refDir, r);
      if (fs.statSync(rp).isFile()) assembled += fs.readFileSync(rp, 'utf8');
    }
  }
  return sha256(normalize(assembled));
}

const storedHash = (dir) => {
  const m = fs.readFileSync(path.join(dir, 'SKILL.md'), 'utf8')
    .split('\n').find((l) => /^[ \t]*content_hash:/.test(l));
  return m ? (m.split('"')[1] ?? '') : '';
};

function writeHash(dir, h) {
  const file = path.join(dir, 'SKILL.md');
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  const out = [];
  let fm = 0; let inMeta = false; let done = false;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (i === 0 && line === '---') { fm = 1; out.push(line); continue; }
    if (fm === 1 && line === '---') {
      if (inMeta && !done) { out.push(`  content_hash: "${h}"`); done = true; }
      fm = 0; inMeta = false; out.push(line); continue;
    }
    if (fm === 1 && /^metadata:/.test(line)) { inMeta = true; out.push(line); continue; }
    if (fm === 1 && inMeta && /^[ \t]*content_hash:/.test(line)) {
      out.push(`  content_hash: "${h}"`); done = true; continue;
    }
    if (fm === 1 && inMeta && /^[^ \t]/.test(line)) {
      if (!done) { out.push(`  content_hash: "${h}"`); done = true; }
      inMeta = false; out.push(line); continue;
    }
    out.push(line);
  }
  fs.writeFileSync(file, out.join('\n'));
}

const mode = process.argv[2];
if (mode === '--backfill' || mode === '--check-only') {
  const root = process.argv[3] || DEFAULT_ROOT;
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
    console.error(`ERROR: skills root not found: ${root}`);
    process.exit(2);
  }
  let anyWouldBump = 0;
  for (const { dir, name, category: cat } of eachSkillDir(root)) {
    if (isUpstream(dir)) continue;
    const fresh = hashSkill(dir);
    const stored = storedHash(dir);
    if (mode === '--check-only') {
      if (!stored) { console.log(`would-bump ${cat}/${name} (no content_hash)`); anyWouldBump = 1; }
      else if (stored !== fresh) { console.log(`would-bump ${cat}/${name} (content changed)`); anyWouldBump = 1; }
      else console.log(`unchanged ${cat}/${name}`);
    } else if (stored !== fresh) {
      writeHash(dir, fresh);
      console.log(`wrote ${cat}/${name}`);
    }
  }
  process.exit(mode === '--check-only' && anyWouldBump ? 1 : 0);
} else if (mode) {
  console.log(hashSkill(mode));
} else {
  console.error('usage: content-hash.mjs <skill-dir> | --backfill [root] | --check-only [root]');
  process.exit(2);
}
