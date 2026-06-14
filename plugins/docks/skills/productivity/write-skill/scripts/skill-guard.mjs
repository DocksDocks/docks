#!/usr/bin/env node
// skill-guard.mjs — portable SKILL.md validator + the single source of the 16-pt
// scorer rubric. Shipped inside write-skill so the validation loop works in
// consumer repos, AND called by this kit's own CI for scoring — one rubric, no
// author-side-vs-mirror sync contract. Self-contained: Node core only (no `yaml`
// dependency), so it runs anywhere Node does.
//
// Usage:
//   skill-guard.mjs validate [--strict] <skill-dir|skills-root> ...
//   skill-guard.mjs score [--per-file] [skills-root]   # machine output, == kit scorer
import fs from 'node:fs';
import path from 'node:path';

const today = Math.floor(Date.now() / 1000);
const countLines = (lines, re) => lines.reduce((n, l) => (re.test(l) ? n + 1 : n), 0);
const anyLine = (lines, re) => lines.some((l) => re.test(l));

function splitLines(content) {
  return (content.endsWith('\n') ? content.slice(0, -1) : content).split('\n');
}
function bodyAfter(lines) {
  let c = 0; const out = [];
  for (const l of lines) { if (l === '---' && c < 2) { c += 1; continue; } if (c === 2) out.push(l); }
  return out;
}
function dateToTs(d) { const t = Date.parse(`${d}T00:00:00Z`); return Number.isNaN(t) ? 0 : Math.floor(t / 1000); }
function metaUpdated(lines) {
  let inMeta = false;
  for (const l of lines) {
    if (/^metadata:/.test(l)) { inMeta = true; continue; }
    if (inMeta && /^[a-z]/.test(l)) inMeta = false;
    if (inMeta && /updated:/.test(l)) { const m = l.match(/updated:\s*"?([0-9-]*)"?/); return m ? m[1] : ''; }
  }
  return '';
}

// ---- the 16-pt scorer (single source of the docks rubric) ----
function scoreSkill(file) {
  const lines = splitLines(fs.readFileSync(file, 'utf8'));
  let score = 0;
  const hasUpstream = countLines(lines, /^upstream:/);
  const descLine = lines.find((l) => /^description:/.test(l)) || '';
  let desc = descLine.replace(/^description:\s*/, '');
  desc = desc.replace(/^"/, '').replace(/"$/, '').replace(/^'/, '').replace(/'$/, '');
  const descLen = [...desc].length;
  if (hasUpstream > 0) { if (/use when/i.test(desc)) score += 2; } else if (/^use when/i.test(desc)) score += 2;
  if (descLen > 0 && descLen <= 500) score += 2; else if (descLen > 0 && descLen <= 1000) score += 1;
  const updated = metaUpdated(lines) || (hasUpstream > 0 ? upstreamVendored(lines) : '');
  if (updated) { const ts = dateToTs(updated); if (ts > 0 && Math.floor((today - ts) / 86400) <= 180) score += 1; }
  score += Math.min(3, countLines(lines, /<constraint>/));
  const bad = anyLine(lines, /\bBAD\b|\/\/\s*BAD|#\s*BAD/);
  const good = anyLine(lines, /\bGOOD\b|\/\/\s*GOOD|#\s*GOOD/);
  if ((bad && good) || (anyLine(lines, /wrong fix/i) && anyLine(lines, /right fix/i))) score += 2;
  score += Math.max(0, 2 - slopCount(lines));
  if (anyLine(lines, /^\|.*\|/)) score += 1;
  if (anyLine(lines, /^```[a-z]+/)) score += 1;
  const bl = bodyAfter(lines).length;
  if (bl >= 80 && bl <= 310) score += 2;
  return score;
}
function upstreamVendored(lines) {
  let inUp = false;
  for (const l of lines) {
    if (/^upstream:/.test(l)) { inUp = true; continue; }
    if (inUp && /^[a-z]/.test(l)) inUp = false;
    if (inUp && /vendored_at:/.test(l)) { const m = l.match(/vendored_at:\s*"?([0-9-]*)"?/); return m ? m[1] : ''; }
  }
  return '';
}
function slopCount(lines) {
  let inFence = false; const sl = [];
  for (const l of lines) { if (/^```/.test(l)) { inFence = !inFence; continue; } if (!inFence) sl.push(l.replace(/`[^`]*`/g, '')); }
  return countLines(sl, /\b(comprehensive|robust|elegant|seamless)\b/i);
}

function findSkillFiles(root) {
  const out = [];
  (function walk(d) {
    let entries; try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (e.name === 'node_modules') continue;
      const full = path.join(d, e.name);
      if (e.isDirectory()) walk(full); else if (e.name === 'SKILL.md') out.push(full);
    }
  })(root);
  return out.sort();
}

// ---- consumer validator: frontmatter + structure checks ----
function validate(dirs, strict) {
  let fails = 0; let warns = 0; let checked = 0;
  const fail = (m) => { console.log(`  FAIL: ${m}`); fails += 1; };
  const warn = (m) => { if (strict) { console.log(`  FAIL(strict): ${m}`); fails += 1; } else { console.log(`  WARN: ${m}`); warns += 1; } };

  function check(dir) {
    const file = path.join(dir, 'SKILL.md');
    console.log(`== ${dir}`);
    checked += 1;
    const content = fs.readFileSync(file, 'utf8');
    const lines = splitLines(content);
    if (lines[0] !== '---') fail('SKILL.md must start with YAML frontmatter fence ---');
    else if (!lines.slice(1).some((l) => l === '---')) fail('frontmatter fence is not closed');

    const dirname = path.basename(dir);
    let name = (lines.find((l) => /^name:/.test(l)) || '').replace(/^name:\s*/, '').replace(/^["']|["']$/g, '');
    if (!name) name = dirname;
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(name)) fail(`name '${name}' must be lowercase hyphen-case`);
    if ([...name].length > 64) fail(`name exceeds 64 chars (${[...name].length})`);
    if (name !== dirname) fail(`name '${name}' must match directory '${dirname}'`);
    if (/anthropic|claude/.test(name)) fail('name must not contain reserved words anthropic/claude');

    const descRaw = (lines.find((l) => /^description:/.test(l)) || '').replace(/^description:\s*/, '');
    let desc = descRaw.replace(/^"/, '').replace(/"$/, '').replace(/^'/, '').replace(/'$/, '');
    const hasUpstream = countLines(lines, /^upstream:/);
    if (!desc) fail('description must be a non-empty single line');
    else {
      if ([...desc].length > 1024) fail(`description exceeds 1024 chars (${[...desc].length})`);
      if (desc.includes('<') || desc.includes('>')) fail('description cannot contain angle brackets (Codex compatibility)');
      if (!/^["'|>]/.test(descRaw) && /(^|[ \t])#/.test(descRaw)) fail("unquoted description contains '#' — quote it (YAML comment truncation)");
      if ([...desc].length > 500) warn(`description is ${[...desc].length} chars (>500 crowds the aggregate listing budget)`);
      if (hasUpstream > 0) { if (!/use when/i.test(desc)) warn("description should contain 'Use when'"); }
      else if (!/^use when/i.test(desc)) warn("description should start with 'Use when'");
    }
    if (!anyLine(lines, /^user-invocable:\s*(true|false)/)) warn("frontmatter 'user-invocable' missing");
    const updated = metaUpdated(lines);
    if (!updated) { if (hasUpstream === 0) warn('metadata.updated missing (YYYY-MM-DD)'); }
    else { const ts = dateToTs(updated); if (ts > 0) { const age = Math.floor((today - ts) / 86400); if (age > 180) warn(`metadata.updated is ${age}d old (>180d reads stale)`); } }

    const bl = bodyAfter(lines).length;
    if (bl > 500) fail(`body is ${bl} lines (hard cap 500) — extract detail into references/`);
    if (bl < 80 || bl > 310) warn(`body is ${bl} lines, outside the 80-310 sweet spot (~310 = post-compaction re-attachment ceiling)`);

    const refDir = path.join(dir, 'references');
    if (fs.existsSync(refDir) && fs.statSync(refDir).isDirectory()) {
      if (fs.readdirSync(refDir, { withFileTypes: true }).some((e) => e.isDirectory())) {
        fail('references/ must stay one level deep (agentskills.io: avoid deep reference chains)');
      }
    }
    const slop = slopCount(lines);
    if (slop > 0) warn(`${slop} slop word(s) in prose (comprehensive/robust/elegant/seamless)`);
    console.log(`  score: ${scoreSkill(file)}/16 (docks rubric; per-file floor set by the project's scoring.json; aim 14+)`);
  }

  for (const a of dirs) {
    if (fs.existsSync(path.join(a, 'SKILL.md'))) check(a);
    else if (fs.existsSync(a) && fs.statSync(a).isDirectory()) {
      const files = findSkillFiles(a);
      if (files.length === 0) { console.error(`FAIL: no SKILL.md found under ${a}`); fails += 1; }
      for (const f of files) check(path.dirname(f));
    } else { console.error(`FAIL: not a directory: ${a}`); fails += 1; }
  }
  if (fails > 0) { console.log(`skill-guard FAILED: ${fails} failure(s), ${warns} warning(s) across ${checked} skill(s)`); process.exit(1); }
  console.log(`skill-guard PASSED: ${checked} skill(s), ${warns} warning(s)`);
}

// ---- score mode: `<category>/<name> <score>` or total ----
function score(args) {
  const perFile = args.includes('--per-file');
  const root = args.find((a) => !a.startsWith('--')) || path.join(process.cwd(), 'plugins/docks/skills');
  let total = 0;
  for (const cat of fs.readdirSync(root).sort()) {
    const cp = path.join(root, cat);
    if (!fs.existsSync(cp) || !fs.statSync(cp).isDirectory()) continue;
    for (const skill of fs.readdirSync(cp).sort()) {
      const sp = path.join(cp, skill);
      if (!fs.statSync(sp).isDirectory()) continue;
      const file = path.join(sp, 'SKILL.md');
      if (!fs.existsSync(file)) continue;
      const s = scoreSkill(file);
      if (perFile) console.log(`${cat}/${skill} ${s}`);
      total += s;
    }
  }
  if (!perFile) console.log(total);
}

const [cmd, ...rest] = process.argv.slice(2);
if (cmd === 'score') score(rest);
else if (cmd === 'validate') {
  const strict = rest.includes('--strict');
  const dirs = rest.filter((a) => a !== '--strict');
  if (dirs.length === 0) { console.error('usage: skill-guard.mjs validate [--strict] <skill-dir|skills-root> ...'); process.exit(2); }
  validate(dirs, strict);
} else { console.error('usage: skill-guard.mjs validate [--strict] <dir>... | score [--per-file] [root]'); process.exit(2); }
