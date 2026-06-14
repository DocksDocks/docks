#!/usr/bin/env node
// Mechanical agent quality scorer (port of score.sh). Max per-file: 15.
// Output: single total, or `<name> <score>` per agent with --per-file.
// Parity-gated against agents/score.sh via tests/parity.mjs.
import fs from 'node:fs';
import path from 'node:path';

const SCRIPT_DIR = path.dirname(new URL(import.meta.url).pathname);
const REPO_DIR = path.resolve(SCRIPT_DIR, '../..');

const args = process.argv.slice(2);
const mode = args.includes('--per-file') ? 'per-file' : 'total';
const dirArg = args.find((a) => !a.startsWith('--'));
const DIR = dirArg || path.join(REPO_DIR, 'plugins/docks/agents');

const countLines = (lines, re) => lines.reduce((n, l) => (re.test(l) ? n + 1 : n), 0);
const anyLine = (lines, re) => lines.some((l) => re.test(l));

function bodyAfterFrontmatter(lines) {
  let c = 0; const out = [];
  for (const l of lines) {
    if (l === '---' && c < 2) { c += 1; continue; }
    if (c === 2) out.push(l);
  }
  return out;
}

// frontmatter (between the first two `---`) contains a top-level `key:`
function hasFmField(lines, key) {
  let c = 0;
  for (const l of lines) {
    if (l === '---') { c += 1; if (c >= 2) break; continue; }
    if (c === 1 && new RegExp(`^${key}:`).test(l)) return true;
  }
  return false;
}

const mdFiles = fs.existsSync(DIR)
  ? fs.readdirSync(DIR).filter((f) => f.endsWith('.md')).sort()
  : [];
if (mdFiles.length === 0) {
  if (mode === 'total') console.log('0');
  process.exit(0);
}

let total = 0;
for (const fname of mdFiles) {
  const name = fname.replace(/\.md$/, '');
  if (['.gitkeep', 'AGENTS', 'CLAUDE'].includes(name)) continue;
  const content = fs.readFileSync(path.join(DIR, fname), 'utf8');
  const lines = (content.endsWith('\n') ? content.slice(0, -1) : content).split('\n');
  let score = 0;

  const descLine = lines.find((l) => /^description:/.test(l)) || '';
  const desc = descLine.replace(/^description:\s*/, '');
  // 1. starts "Use when" (2)
  if (/^use when/i.test(desc)) score += 2;
  // 2. "Not" exclusion clause (1)
  if (/\bnot\b/i.test(desc)) score += 1;
  // 3. tightness 80–500 (1)
  const descLen = [...desc].length;
  if (descLen >= 80 && descLen <= 500) score += 1;
  // 4. <constraint> blocks, max 2
  score += Math.min(2, countLines(lines, /<constraint>/));
  // 5. ## Workflow + ## Success Criteria (1 each)
  if (anyLine(lines, /^## Workflow/)) score += 1;
  if (anyLine(lines, /^## Success Criteria/)) score += 1;
  // 6. body 60–300 lines (1)
  const bodyLines = bodyAfterFrontmatter(lines).length;
  if (bodyLines >= 60 && bodyLines <= 300) score += 1;
  // 7. anti-hallucination checklist (1)
  if (anyLine(lines, /anti-hallucination|file:line refs|verify import paths/i)) score += 1;
  // 8. explicit model (1)
  if (anyLine(lines, /^model:\s*(sonnet|opus|haiku|claude-[a-z0-9-]+)/)) score += 1;
  // 9. tools/disallowedTools declared (1)
  if (hasFmField(lines, 'tools') || hasFmField(lines, 'disallowedTools')) score += 1;
  // 10. slop (max −2)
  let inFence = false; const slopLines = [];
  for (const l of lines) {
    if (/^```/.test(l)) { inFence = !inFence; continue; }
    if (!inFence) slopLines.push(l.replace(/`[^`]*`/g, ''));
  }
  score += Math.max(0, 2 - countLines(slopLines, /\b(comprehensive|robust|elegant|seamless)\b/i));
  // 11. research-gate (1)
  if (anyLine(lines, /(resolve-library-id|query-docs|context7)/i)) score += 1;

  if (mode === 'per-file') console.log(`${name} ${score}`);
  total += score;
}
if (mode === 'total') console.log(total);
