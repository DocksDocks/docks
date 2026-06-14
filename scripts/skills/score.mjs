#!/usr/bin/env node
// Mechanical skill quality scorer (port of score.sh). Max per-file: 16.
// Output: single total, or `<category>/<name> <score>` per skill with --per-file.
// Parity-gated against score.sh via tests/parity.mjs — keep them identical.
import fs from 'node:fs';
import path from 'node:path';

const SCRIPT_DIR = path.dirname(new URL(import.meta.url).pathname);
const REPO_DIR = path.resolve(SCRIPT_DIR, '../..');

const args = process.argv.slice(2);
const mode = args.includes('--per-file') ? 'per-file' : 'total';
const dirArg = args.find((a) => !a.startsWith('--'));
const DIR = dirArg || path.join(REPO_DIR, 'plugins/docks/skills');

const today = Math.floor(Date.now() / 1000);

// grep -c '<pat>' counts matching LINES (not occurrences); replicate per-line.
const countLines = (lines, re) => lines.reduce((n, l) => (re.test(l) ? n + 1 : n), 0);
const anyLine = (lines, re) => lines.some((l) => re.test(l));

function bodyAfterFrontmatter(lines) {
  // awk '/^---$/ && c<2 {c++; next} c==2 {print}' — lines after the 2nd `---`.
  let c = 0;
  const out = [];
  for (const l of lines) {
    if (l === '---' && c < 2) { c += 1; continue; }
    if (c === 2) out.push(l);
  }
  return out;
}

function dateToTs(d) {
  // mirror `date -d "YYYY-MM-DD" +%s` in a UTC container: midnight UTC.
  const ts = Date.parse(`${d}T00:00:00Z`);
  return Number.isNaN(ts) ? 0 : Math.floor(ts / 1000);
}

function metaField(lines, blockKey, field) {
  // awk: within the `blockKey:` block (until the next top-level `^[a-z]` key),
  // find the `field:` line; extract the [0-9-]* value (quotes optional).
  let inBlock = false;
  for (const l of lines) {
    if (new RegExp(`^${blockKey}:`).test(l)) { inBlock = true; continue; }
    if (inBlock && /^[a-z]/.test(l)) inBlock = false;
    if (inBlock && new RegExp(`${field}:`).test(l)) {
      const m = l.match(new RegExp(`${field}:\\s*"?([0-9-]*)"?`));
      return m ? m[1] : '';
    }
  }
  return '';
}

function scoreSkill(file) {
  const content = fs.readFileSync(file, 'utf8');
  // strip a single trailing newline so line splitting matches awk/grep records.
  const lines = (content.endsWith('\n') ? content.slice(0, -1) : content).split('\n');
  let score = 0;

  const hasUpstream = countLines(lines, /^upstream:/);

  // 1. description starts with "Use when" (2 pts)
  const descLine = lines.find((l) => /^description:/.test(l)) || '';
  let desc = descLine.replace(/^description:\s*/, '');
  desc = desc.replace(/^"/, '').replace(/"$/, '').replace(/^'/, '').replace(/'$/, '');
  const descLen = [...desc].length; // code points, matching bash ${#var} under UTF-8
  if (hasUpstream > 0) {
    if (/use when/i.test(desc)) score += 2;
  } else if (/^use when/i.test(desc)) score += 2;

  // 2. description tightness (2 pts max)
  if (descLen > 0 && descLen <= 500) score += 2;
  else if (descLen > 0 && descLen <= 1000) score += 1;

  // 3. freshness within 180 days (1 pt)
  let updated = metaField(lines, 'metadata', 'updated');
  if (!updated && hasUpstream > 0) updated = metaField(lines, 'upstream', 'vendored_at');
  if (updated) {
    const ts = dateToTs(updated);
    if (ts > 0) {
      const ageDays = Math.floor((today - ts) / 86400);
      if (ageDays <= 180) score += 1;
    }
  }

  // 4. <constraint> blocks (1 pt each, max 3)
  score += Math.min(3, countLines(lines, /<constraint>/));

  // 5. BAD/GOOD examples (2 pts)
  const hasBad = anyLine(lines, /\bBAD\b|\/\/\s*BAD|#\s*BAD/);
  const hasGood = anyLine(lines, /\bGOOD\b|\/\/\s*GOOD|#\s*GOOD/);
  const wrongFix = anyLine(lines, /wrong fix/i);
  const rightFix = anyLine(lines, /right fix/i);
  if ((hasBad && hasGood) || (wrongFix && rightFix)) score += 2;

  // 6. slop words (2 pts, lose 1 per matching line). Strip fences + inline code.
  let inFence = false;
  const slopLines = [];
  for (const l of lines) {
    if (/^```/.test(l)) { inFence = !inFence; continue; }
    if (!inFence) slopLines.push(l.replace(/`[^`]*`/g, ''));
  }
  const slop = countLines(slopLines, /\b(comprehensive|robust|elegant|seamless)\b/i);
  score += Math.max(0, 2 - slop);

  // 7. markdown table (1 pt)
  if (anyLine(lines, /^\|.*\|/)) score += 1;

  // 8. code fence with language tag (1 pt)
  if (anyLine(lines, /^```[a-z]+/)) score += 1;

  // 9. body 80–310 lines (2 pts)
  const bodyLines = bodyAfterFrontmatter(lines).length;
  if (bodyLines >= 80 && bodyLines <= 310) score += 2;

  return score;
}

let total = 0;
for (const category of fs.readdirSync(DIR).sort()) {
  const catPath = path.join(DIR, category);
  if (!fs.existsSync(catPath) || !fs.statSync(catPath).isDirectory()) continue;
  for (const skill of fs.readdirSync(catPath).sort()) {
    const skillPath = path.join(catPath, skill);
    if (!fs.statSync(skillPath).isDirectory()) continue;
    const file = path.join(skillPath, 'SKILL.md');
    if (!fs.existsSync(file)) continue;
    const s = scoreSkill(file);
    if (mode === 'per-file') console.log(`${category}/${skill} ${s}`);
    total += s;
  }
}
if (mode === 'total') console.log(total);
