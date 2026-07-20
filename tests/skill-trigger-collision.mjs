#!/usr/bin/env node
// skill-trigger-collision.mjs — cross-skill trigger-overlap audit.
//
// No mechanical scorer can see two skills claiming the SAME trigger surface —
// the kit's collision discipline (write-skill's near-miss table) is enforced by
// hand. This test mechanizes the cheap half: it flags skill PAIRS whose
// descriptions share enough significant trigger tokens to compete for the same
// prompt, then checks whether at least one of the two routes to the other (names
// the sibling skill, the kit's "Not for… (use X)" idiom). A high-overlap pair
// with NO routing in either direction is a latent collision and FAILS.
//
// Heuristic, not semantic: it catches the obvious overlaps a human review would,
// and stays green on the current suite because the Not-for clauses already route
// the real near-misses. Tune OVERLAP_FAIL only to admit a genuinely-new routed
// pair — never to silence an unrouted collision.
//
// Usage: node tests/skill-trigger-collision.mjs [--report] [skills-root ...]
//   --report  print the full ranked overlap matrix (informational), always exit 0
import fs from 'node:fs';
import path from 'node:path';
import { findSkillFiles } from '../scripts/lib/skills-walk.mjs';

const OVERLAP_FAIL = 5; // shared significant tokens at/above which an UNROUTED pair fails

// Tokens that carry no triggering signal: structural words + cross-cutting kit
// jargon every other skill also uses ("code", "project", "file"…). Removing
// these keeps the overlap score about DOMAIN surface, not boilerplate.
const STOP = new Set([
  'use',
  'when',
  'not',
  'for',
  'the',
  'a',
  'an',
  'or',
  'and',
  'of',
  'to',
  'in',
  'on',
  'with',
  'into',
  'from',
  'via',
  'per',
  'its',
  'it',
  'this',
  'that',
  'these',
  'those',
  'is',
  'are',
  'be',
  'as',
  'at',
  'by',
  'if',
  'then',
  'than',
  'also',
  'each',
  'any',
  'you',
  'your',
  'they',
  'them',
  'their',
  'one',
  'two',
  'three',
  'new',
  'existing',
  'skill',
  'skills',
  'agent',
  'agents',
  'project',
  'projects',
  'code',
  'codebase',
  'file',
  'files',
  'user',
  'users',
  'docks',
  'claude',
  'codex',
  'runtime',
  'tool',
  'tools',
  'work',
  'working',
  'run',
  'runs',
  'running',
  'using',
  'used',
  'uses',
  'over',
  'after',
  'before',
  'every',
  'all',
  'between',
  'across',
  'about',
  'against',
  'set',
  'up',
  'out',
  'no',
  'do',
  'does',
  'doing',
  'done',
  'e',
  'g',
  'eg',
  'ie',
  'page',
  'pages',
  'gaps',
  'gap',
  'incl',
  'etc',
  'multiple',
  'single',
  'list',
]);

function tokens(desc) {
  return new Set(
    desc
      .toLowerCase()
      .replace(/[^a-z0-9/+.-]+/g, ' ')
      .split(/\s+/)
      .map((w) => w.replace(/^[./-]+|[./-]+$/g, ''))
      .filter((w) => w.length >= 3 && !STOP.has(w) && !/^\d+$/.test(w)),
  );
}

// The POSITIVE trigger surface is the part BEFORE the kit's exclusion idiom
// ("… Not for X (use sibling)"). Words inside the Not-clause route a prompt AWAY,
// so counting them as claimed surface is backwards — it's what produced the
// false "code-review ∩ dep-vuln" overlap (shared word was "audits", from both
// exclusion clauses). Overlap is measured on positive tokens; routing detection
// still reads the full description, where the Not-clause lives.
function positiveSurface(desc) {
  const m = desc.match(/\bNot for\b|[.;]\s+Not\s/i);
  return m ? desc.slice(0, m.index) : desc;
}

function readDescription(file) {
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  if (lines[0] !== '---') return null;
  const end = lines.findIndex((l, i) => i > 0 && l === '---');
  if (end === -1) return null;
  // join a possibly multi-line YAML scalar by grabbing everything from
  // `description:` to the next top-level key — good enough for token extraction.
  const fm = lines.slice(1, end);
  const di = fm.findIndex((l) => /^description:/.test(l));
  if (di === -1) return null;
  let raw = fm[di].replace(/^description:\s*/, '');
  for (let i = di + 1; i < fm.length; i += 1) {
    if (/^[a-zA-Z_-]+:/.test(fm[i])) break;
    raw += ` ${fm[i].trim()}`;
  }
  return raw
    .replace(/^["'|>]\s*/, '')
    .replace(/["']\s*$/, '')
    .trim();
}

const args = process.argv.slice(2);
const report = args.includes('--report');
const roots = args.filter((a) => !a.startsWith('--'));
if (roots.length === 0) {
  roots.push(path.resolve('plugins/docks/skills'));
  const local = path.resolve('.agents/skills');
  if (fs.existsSync(local)) roots.push(local);
}

const skills = [];
try {
  for (const root of roots) {
    for (const file of findSkillFiles(root)) {
      const name = path.basename(path.dirname(file));
      const desc = readDescription(file);
      if (desc) skills.push({ name, desc, toks: tokens(positiveSurface(desc)) });
    }
  }
} catch (error) {
  console.error(`FAIL: ${error.message}`);
  process.exit(2);
}

// routing = description A names skill B (or vice-versa). The kit writes
// "Not for X (use other-skill)" and "lives in other-skill" — both name the sibling.
function routes(a, b) {
  const an = a.name.toLowerCase();
  const bn = b.name.toLowerCase();
  return a.desc.toLowerCase().includes(bn) || b.desc.toLowerCase().includes(an);
}

const pairs = [];
for (let i = 0; i < skills.length; i += 1) {
  for (let j = i + 1; j < skills.length; j += 1) {
    const a = skills[i];
    const b = skills[j];
    const shared = [...a.toks].filter((t) => b.toks.has(t));
    if (shared.length === 0) continue;
    pairs.push({ a, b, shared, routed: routes(a, b) });
  }
}
pairs.sort((x, y) => y.shared.length - x.shared.length);

if (report) {
  console.log(`# trigger-overlap matrix (${skills.length} skills, OVERLAP_FAIL=${OVERLAP_FAIL})\n`);
  for (const p of pairs.slice(0, 40)) {
    const flag = p.shared.length >= OVERLAP_FAIL ? (p.routed ? 'routed ' : 'UNROUTED') : '       ';
    console.log(
      `${String(p.shared.length).padStart(2)}  ${flag}  ${p.a.name} ∩ ${p.b.name}  ::  ${p.shared.join(' ')}`,
    );
  }
  process.exit(0);
}

const collisions = pairs.filter((p) => p.shared.length >= OVERLAP_FAIL && !p.routed);
if (collisions.length > 0) {
  for (const p of collisions) {
    console.error(
      `FAIL: ${p.a.name} ∩ ${p.b.name} share ${p.shared.length} trigger tokens [${p.shared.join(' ')}] ` +
        'but neither description routes to the other (add a "Not for… (use <sibling>)" clause).',
    );
  }
  console.error(`\ntrigger-collision FAILED: ${collisions.length} unrouted high-overlap pair(s).`);
  process.exit(1);
}
console.log(
  `trigger-collision PASSED: ${skills.length} skills, ${pairs.filter((p) => p.shared.length >= OVERLAP_FAIL).length} high-overlap pair(s) all routed.`,
);
