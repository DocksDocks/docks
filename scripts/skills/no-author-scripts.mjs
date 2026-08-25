#!/usr/bin/env node
// no-author-scripts.mjs — shipped skill/agent
// bodies must not name docks plugin-author scripts as steps a consumer runs.
// Scope: SKILL.md + references/*.md + agents/*.md. Allowlist: tooling-authoring
// skills whose subject IS the docks tooling.
import fs from 'node:fs';
import path from 'node:path';

const SCRIPT_DIR = path.dirname(new URL(import.meta.url).pathname);
const REPO_DIR = path.resolve(SCRIPT_DIR, '../..');
// Default scans docks; pass a skills dir (+ optional agents dir) to scope to
// another plugin. In explicit-scope mode agents are scanned ONLY when given, so
// `<plugin>/skills` alone never falls back to docks agents.
const argSkills = process.argv[2];
const SKILLS_DIR = path.resolve(argSkills || path.join(REPO_DIR, 'plugins/docks/skills'));
const AGENTS_DIR = argSkills
  ? process.argv[3]
    ? path.resolve(process.argv[3])
    : null
  : path.join(REPO_DIR, 'plugins/docks/agents');
const ALLOWLIST = ['scaffold', 'write-skill'];

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const scriptEntries = fs.readdirSync(path.join(REPO_DIR, 'scripts'), { withFileTypes: true });
const topLevelScriptTails = scriptEntries
  .filter((entry) => entry.isFile() && entry.name.endsWith('.mjs'))
  .map((entry) => escapeRegex(entry.name))
  .sort();
const firstLevelScriptDirs = scriptEntries
  .filter((entry) => entry.isDirectory())
  .map((entry) => escapeRegex(entry.name))
  .sort();
const authorScriptTails = [...topLevelScriptTails, `(?:${firstLevelScriptDirs.join('|')})/` + '[^\\s`]+\\.mjs'];
// The tails come from the real author-side scripts/ inventory, so bundled
// plugin-internal paths (write-skill/scripts/skill-guard.mjs, plan-lifecycle's
// scripts/plan.mjs) never match: their filenames are not author tails. Any
// prefix - bare, ./, ../, variables, substitutions, alternate clone roots -
// of a real author tail is therefore a violation, with no exemption logic.
const PATTERN = new RegExp(
  `scripts/(?:${authorScriptTails.join('|')})\\b|tree/guard\\.sh|content-hash\\.sh|transform-guard\\.sh|no-author-scripts\\.sh|codex-facts\\.sh|guard-spec\\.sh`,
);

function namesAuthorScript(line) {
  return PATTERN.test(line);
}

function walk(dir, filter, out = []) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, filter, out);
    else if (filter(full)) out.push(full);
  }
  return out;
}

const files = [
  ...walk(SKILLS_DIR, (f) => f.endsWith('SKILL.md') || (f.includes('/references/') && f.endsWith('.md'))),
  ...(AGENTS_DIR ? walk(AGENTS_DIR, (f) => f.endsWith('.md')) : []),
];

const report = [];
for (const f of files) {
  const m = f.match(new RegExp(`^${SKILLS_DIR.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/[^/]+/([^/]+)/`));
  const skill = m ? m[1] : f;
  if (ALLOWLIST.includes(skill)) continue;
  const lines = fs.readFileSync(f, 'utf8').split('\n');
  lines.forEach((line, i) => {
    if (namesAuthorScript(line)) report.push(`${path.relative(REPO_DIR, f)}:${i + 1}:${line}`);
  });
}

if (report.length > 0) {
  for (const r of report) console.error(`FAIL: ${r}`);
  console.error(
    `no-author-scripts FAILED: ${report.length} reference(s) to docks author scripts in shipped skills/agents.`,
  );
  console.error(
    `Use a self-contained inline check or 'the project's CI/validators, if present' — not a docks script path. Tooling-authoring allowlist: ${ALLOWLIST.join(' ')}`,
  );
  process.exit(1);
}
console.log(
  `no-author-scripts PASSED: no shipped skill/agent names docks author tooling (allowlist: ${ALLOWLIST.join(' ')})`,
);
