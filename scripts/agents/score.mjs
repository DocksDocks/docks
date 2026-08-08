#!/usr/bin/env node
// Mechanical agent quality scorer. Max per-file: 15.
// Output: single total, or `<name> <score>` per agent with --per-file.
// Parse helpers shared via scripts/lib/skills-parse.mjs.
import fs from 'node:fs';
import path from 'node:path';
import { anyLine, bodyAfterFrontmatter, countLines, slopCount, splitLines } from '../lib/skills-parse.mjs';

const SCRIPT_DIR = path.dirname(new URL(import.meta.url).pathname);
const REPO_DIR = path.resolve(SCRIPT_DIR, '../..');

const args = process.argv.slice(2);
const mode = args.includes('--per-file') ? 'per-file' : 'total';
const dirArg = args.find((a) => !a.startsWith('--'));
const DIR = dirArg || path.join(REPO_DIR, 'plugins/docks/agents');
// Research gate: the agent is told to settle a claim against an authoritative source instead of
// trusting memory. Scoring one vendor's MCP tool names would bake a single harness into a quality
// score — omp ships built-in web search, Claude Code ships its own fetch and search, and other
// runtimes differ again. So match the DISCIPLINE, in two independent forms.
//
// Form 1: a verification verb whose object, in the same sentence, is a source of truth. `against
// actual …` is deliberately open-ended: "against actual callers", "against actual reach" and
// "against actual output" are all the same idiom, namely checking a belief against reality.
const RESEARCH_VERB = String.raw`\b(?:verif|confirm|check|validat|corroborat|cross-check|re-read|trace)`;
const SOURCE_OF_TRUTH = String.raw`(?:${[
  'official\\s+doc',
  'current\\s+doc',
  'upstream\\s+doc',
  'authoritative\\s+(?:doc|source)',
  'release\\s+notes',
  'changelog',
  'current\\s+(?:official|authoritative)',
  'against\\s+actual\\b',
  'the\\s+source\\s+code',
].join('|')})`;
// One sentence must carry both halves, so an unrelated mention of "documentation" earns nothing.
const RESEARCH_DISCIPLINE = new RegExp(`${RESEARCH_VERB}[^.\\n]*${SOURCE_OF_TRUTH}`, 'i');
// Form 2: naming a documentation-lookup tool is itself a concrete expression of the discipline, so
// it earns the point without a verb. Kept so a Context7-targeted agent does not regress.
const RESEARCH_TOOL = /\b(?:resolve-library-id|query-docs|context7)\b/i;
const RESEARCH_GATE = { test: (text) => RESEARCH_DISCIPLINE.test(text) || RESEARCH_TOOL.test(text) };

// frontmatter (between the first two `---`) contains a top-level `key:`
function hasFmField(lines, key) {
  let c = 0;
  for (const l of lines) {
    if (l === '---') {
      c += 1;
      if (c >= 2) break;
      continue;
    }
    if (c === 1 && new RegExp(`^${key}:`).test(l)) return true;
  }
  return false;
}

const mdFiles = fs.existsSync(DIR)
  ? fs
      .readdirSync(DIR)
      .filter((f) => f.endsWith('.md'))
      .sort()
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
  const lines = splitLines(content);
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
  // 8. portable model resolution: no `model:` key (1) — Claude Code defaults to
  // `inherit` and omp falls back to the parent session model, so omitting it is the
  // only spelling both runtimes resolve. Any literal kills the spawn under omp.
  if (!anyLine(lines, /^model:/)) score += 1;
  // 9. tools/disallowedTools declared (1)
  if (hasFmField(lines, 'tools') || hasFmField(lines, 'disallowedTools')) score += 1;
  // 10. slop (max −2)
  score += Math.max(0, 2 - slopCount(lines));
  // 11. research-gate (1)
  if (RESEARCH_GATE.test(content)) score += 1;

  if (mode === 'per-file') console.log(`${name} ${score}`);
  total += score;
}
if (mode === 'total') console.log(total);
