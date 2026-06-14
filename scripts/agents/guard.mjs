#!/usr/bin/env node
// agents/guard.mjs (port of agents/guard.sh) — structural validation of agent
// markdown. Usage: agents/guard.mjs [path-or-file]
import fs from 'node:fs';
import path from 'node:path';

const SCRIPT_DIR = path.dirname(new URL(import.meta.url).pathname);
const REPO_DIR = path.resolve(SCRIPT_DIR, '../..');
const ARG = process.argv[2] || path.join(REPO_DIR, 'plugins/docks/agents');

let files;
if (fs.existsSync(ARG) && fs.statSync(ARG).isFile()) {
  files = [ARG];
} else if (fs.existsSync(ARG) && fs.statSync(ARG).isDirectory()) {
  files = fs.readdirSync(ARG).filter((f) => f.endsWith('.md')).sort().map((f) => path.join(ARG, f));
  if (files.length === 0) { console.log(`Guard PASSED: no agent files found in ${ARG}`); process.exit(0); }
} else {
  console.error(`FAIL: agents path not found: ${ARG}`);
  process.exit(1);
}

let errors = 0;
const fail = (m) => { console.error(`FAIL: ${m}`); errors += 1; };

function bodyLineCount(lines) {
  let c = 0; let n = 0;
  for (const l of lines) {
    if (l === '---' && c < 2) { c += 1; continue; }
    if (c === 2) n += 1;
  }
  return n;
}

for (const file of files) {
  const name = path.basename(file, '.md');
  if (['.gitkeep', 'AGENTS', 'CLAUDE'].includes(name)) continue;
  const content = fs.readFileSync(file, 'utf8');
  const lines = (content.endsWith('\n') ? content.slice(0, -1) : content).split('\n');

  if (lines[0] !== '---') { fail(`${name} — does not start with '---' frontmatter fence`); continue; }
  if (lines.filter((l) => l === '---').length < 2) {
    fail(`${name} — frontmatter fence not closed (found ${lines.filter((l) => l === '---').length} '---' lines)`); continue;
  }

  const getField = (key) => {
    const l = lines.find((x) => new RegExp(`^${key}:`).test(x));
    return l ? l.replace(new RegExp(`^${key}:\\s*`), '') : '';
  };

  const nameField = getField('name');
  if (nameField !== name) fail(`${name} — name field ('${nameField}') does not match filename`);
  if (!/^[a-z][a-z0-9-]{0,63}$/.test(nameField)) fail(`${name} — name not kebab-case or >64 chars ('${nameField}')`);
  if (/anthropic|claude/i.test(nameField)) fail(`${name} — name must not contain 'anthropic' or 'claude'`);

  const desc = getField('description');
  const descLen = [...desc].length;
  if (descLen < 10) fail(`${name} — description missing or too short (${descLen} chars)`);
  else if (descLen > 1024) fail(`${name} — description exceeds 1024 chars (${descLen})`);
  if (!/^use when/i.test(desc)) fail(`${name} — description must start with 'Use when' (CSO)`);
  if (!/\bnot\b/i.test(desc)) fail(`${name} — description missing 'Not for…' exclusion clause (prevents delegation collisions)`);

  const model = getField('model');
  if (!/^(sonnet|opus|haiku|inherit|claude-[a-z0-9-]+)$/.test(model)) fail(`${name} — model field invalid ('${model}'); expected sonnet|opus|haiku|inherit|claude-*`);

  const tools = getField('tools');
  if (tools === '') fail(`${name} — tools field missing or empty`);

  if (bodyLineCount(lines) > 500) fail(`${name} — body is ${bodyLineCount(lines)} lines (cap: 500). Extract detail out of the agent prompt`);
  if (!lines.some((l) => l.includes('<constraint>'))) fail(`${name} — no <constraint> block in body`);
  if (!lines.some((l) => /^## Workflow/.test(l))) fail(`${name} — missing '## Workflow' section`);
  if (!lines.some((l) => /^## Success Criteria/.test(l))) fail(`${name} — missing '## Success Criteria' section`);

  const badSkillRefs = lines.filter((l) => /\/SKILL\.md/.test(l) && !l.includes('CLAUDE_PLUGIN_ROOT'));
  if (badSkillRefs.length > 0) {
    console.error(`FAIL: ${name} — bundled SKILL.md must load via \${CLAUDE_PLUGIN_ROOT}, not a repo-relative path:`);
    for (const l of badSkillRefs) console.error(`    ${l}`);
    errors += 1;
  }
  if (/(^|[, ])Agent([,(]| |$)/.test(tools)) fail(`${name} — 'Agent' in tools is inert for a plugin subagent (subagents cannot spawn subagents); remove it and dispatch from the main conversation`);
}

if (errors > 0) { console.error(`Guard FAILED: ${errors} structural errors`); process.exit(1); }
console.log('Guard PASSED: all agents structurally valid');
