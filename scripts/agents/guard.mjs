#!/usr/bin/env bun
// agents/guard.mjs — structural validation of agent
// markdown. Usage: agents/guard.mjs [path-or-file]
import fs from 'node:fs';
import path from 'node:path';
import { bodyAfterFrontmatter, splitLines } from '../lib/skills-parse.mjs';

const SCRIPT_DIR = path.dirname(new URL(import.meta.url).pathname);
const REPO_DIR = path.resolve(SCRIPT_DIR, '../..');
const ARG = process.argv[2] || path.join(REPO_DIR, 'plugins/plan-lifecycle/agents');

let files;
if (fs.existsSync(ARG) && fs.statSync(ARG).isFile()) {
  files = [ARG];
} else if (fs.existsSync(ARG) && fs.statSync(ARG).isDirectory()) {
  files = fs
    .readdirSync(ARG)
    .filter((f) => f.endsWith('.md'))
    .sort()
    .map((f) => path.join(ARG, f));
  if (files.length === 0) {
    console.log(`Guard PASSED: no agent files found in ${ARG}`);
    process.exit(0);
  }
} else {
  console.error(`FAIL: agents path not found: ${ARG}`);
  process.exit(1);
}

let errors = 0;
const fail = (m) => {
  console.error(`FAIL: ${m}`);
  errors += 1;
};

for (const file of files) {
  const name = path.basename(file, '.md');
  if (['.gitkeep', 'AGENTS'].includes(name)) continue;
  const content = fs.readFileSync(file, 'utf8');
  const lines = splitLines(content);

  if (lines[0] !== '---') {
    fail(`${name} — does not start with '---' frontmatter fence`);
    continue;
  }
  if (lines.filter((l) => l === '---').length < 2) {
    fail(`${name} — frontmatter fence not closed (found ${lines.filter((l) => l === '---').length} '---' lines)`);
    continue;
  }

  // omp reads agent fields only from the YAML frontmatter; a body line that
  // looks like a field must not satisfy this structural guard.
  const frontmatterEnd = lines.indexOf('---', 1);
  const getField = (key) => {
    const prefix = `${key}:`;
    for (let index = 1; index < frontmatterEnd; index += 1) {
      const line = lines[index];
      if (line.startsWith(prefix)) return line.slice(prefix.length).trimStart();
    }
    return '';
  };

  const nameField = getField('name');
  if (nameField !== name) fail(`${name} — name field ('${nameField}') does not match filename`);
  if (!/^[a-z][a-z0-9-]{0,63}$/.test(nameField)) fail(`${name} — name not kebab-case or >64 chars ('${nameField}')`);
  // omp refuses an agent named `main` or `sub`; it trims and lowercases the name before the check.
  if (['main', 'sub'].includes(nameField.trim().toLowerCase()))
    fail(`${name} — name '${nameField}' is reserved: omp refuses an agent named main or sub`);

  const desc = getField('description');
  const descLen = [...desc].length;
  if (descLen < 10) fail(`${name} — description missing or too short (${descLen} chars)`);
  else if (descLen > 1024) fail(`${name} — description exceeds 1024 chars (${descLen})`);
  if (!/^use when/i.test(desc)) fail(`${name} — description must start with 'Use when' (CSO)`);
  if (!/\bnot\b/i.test(desc))
    fail(`${name} — description missing 'Not for…' exclusion clause (prevents delegation collisions)`);

  // omp reads a `model` value as a model id. A value that resolves to no model
  // fails the spawn with "No model selected". Without the key, the agent uses
  // the parent session model. A consumer pins a per-agent model in the
  // `task.agentModelOverrides.<agent>` setting, not in the shipped agent file.
  const model = getField('model');
  if (model !== '')
    fail(
      `${name} — remove 'model: ${model}'; plugin agents must omit it (omp reads the value as a model id, and without the key the agent uses the parent session model). Pin per-agent models with task.agentModelOverrides.<agent> instead`,
    );

  const tools = getField('tools');
  if (tools === '') fail(`${name} — tools field missing or empty`);

  const bodyLen = bodyAfterFrontmatter(lines).length;
  if (bodyLen > 500) fail(`${name} — body is ${bodyLen} lines (cap: 500). Extract detail out of the agent prompt`);
  if (!lines.some((l) => l.includes('<constraint>'))) fail(`${name} — no <constraint> block in body`);
  if (!lines.some((l) => /^## Workflow/.test(l))) fail(`${name} — missing '## Workflow' section`);
  if (!lines.some((l) => /^## Success Criteria/.test(l))) fail(`${name} — missing '## Success Criteria' section`);

  // omp sets no plugin root variable in an agent, so a `${...}` stays literal text there. A plugin agent names each
  // file of its skill as `skill://<skill>/<path>`, which omp resolves.
  const variables = [...new Set(content.match(/\$\{[^}\s]*\}/g) ?? [])];
  if (variables.length > 0)
    fail(
      `${name} — remove ${variables.join(', ')}; omp sets no plugin root variable, so name each skill file as skill://<skill>/<path>`,
    );
  const badSkillRefs = lines.filter((l) => /\/SKILL\.md/.test(l) && !/skill:\/\/[a-z0-9-]+\/SKILL\.md/.test(l));
  if (badSkillRefs.length > 0) {
    console.error(`FAIL: ${name} — a bundled SKILL.md must load via skill://<skill>/SKILL.md, not a file path:`);
    for (const l of badSkillRefs) console.error(`    ${l}`);
    errors += 1;
  }
  if (/(^|[, ])Agent([,(]| |$)/.test(tools))
    fail(
      `${name} — 'Agent' is not an omp tool name; remove it, and list the agents that this agent starts in 'spawns'`,
    );
}

if (errors > 0) {
  console.error(`Guard FAILED: ${errors} structural errors`);
  process.exit(1);
}
console.log('Guard PASSED: all agents structurally valid');
