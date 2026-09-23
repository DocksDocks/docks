#!/usr/bin/env node
// codex-facts.mjs — pin the Codex platform facts asserted by
// skill-agent-pipeline to hard-coded sets. It does not fetch the Codex docs:
// when the docs change, update codex-agents-builder.md and these sets together.
// Author-side only; skips when absent.
import fs from 'node:fs';
import path from 'node:path';

const SCRIPT_DIR = path.dirname(new URL(import.meta.url).pathname);
const REPO_DIR = path.resolve(SCRIPT_DIR, '../..');
const SAP = path.join(REPO_DIR, 'plugins/docks/skills/productivity/skill-agent-pipeline');
const DOC = path.join(SAP, 'references/codex-agents-builder.md');

if (!fs.existsSync(DOC)) {
  console.log(`Guard SKIPPED: codex-agents-builder.md not present (${DOC})`);
  process.exit(0);
}

const doc = fs.readFileSync(DOC, 'utf8');
let errors = 0;
const fail = (m) => {
  console.error(`FAIL: ${m}`);
  errors += 1;
};

const setsEqual = (a, b) => a.size === b.size && [...a].every((v) => b.has(v));
const show = (s) => [...s].sort().join(', ');

// 1. model ids: every gpt-* token is a current or a retired id; the reference
// lists each set exactly; emitted models (map + TOML example) are current only.
const CURRENT_MODELS = new Set(['gpt-6-sol', 'gpt-6-luna', 'gpt-6-astra']);
const RETIRED_MODELS = new Set(['gpt-5.5', 'gpt-5.4', 'gpt-5.4-mini', 'gpt-5.3-codex', 'gpt-5.2']);
const modelTokens = (text) => new Set(text.match(/\bgpt-\d(?:[A-Za-z0-9._-]*[A-Za-z0-9])?/g) || []);

for (const tok of modelTokens(doc)) {
  if (!CURRENT_MODELS.has(tok) && !RETIRED_MODELS.has(tok))
    fail(`codex-agents-builder.md references unknown Codex model id '${tok}'`);
}

function listedModels(prefix) {
  const lines = doc.split('\n').filter((line) => line.startsWith(prefix));
  if (lines.length !== 1) {
    fail(`codex-agents-builder.md must contain exactly one line starting '${prefix}'`);
    return new Set();
  }
  return new Set([...lines[0].matchAll(/`(gpt-[^`]+)`/g)].map((m) => m[1]));
}
const current = listedModels('Current Codex model IDs:');
if (!setsEqual(current, CURRENT_MODELS))
  fail(`current model list is {${show(current)}}; expected {${show(CURRENT_MODELS)}}`);
const retired = listedModels('Retired or deprecated in Codex');
if (!setsEqual(retired, RETIRED_MODELS))
  fail(`retired model list is {${show(retired)}}; expected {${show(RETIRED_MODELS)}}`);

const emitted = new Set();
for (const line of doc.split('\n')) {
  const cells = line.split('|').map((c) => c.trim());
  if (/^`(opus|sonnet|haiku)`$/.test(cells[1] ?? '')) {
    const m = (cells[2] ?? '').match(/^`(gpt-[^`]+)`$/);
    if (m) emitted.add(m[1]);
  }
  const toml = line.match(/^model = "([^"]+)"/);
  if (toml) emitted.add(toml[1]);
}
if (emitted.size === 0) fail('codex-agents-builder.md model map / example emits no model id');
for (const id of emitted) {
  if (!CURRENT_MODELS.has(id)) fail(`codex-agents-builder.md emits non-current model id '${id}'`);
}

function declaredValues(key) {
  const rows = doc.split('\n').filter((line) => {
    const cells = line
      .split('|')
      .slice(1, -1)
      .map((cell) => cell.trim());
    return cells[0] === `\`${key}\``;
  });
  if (rows.length !== 1) {
    fail(`codex-agents-builder.md must contain exactly one schema declaration for ${key}`);
    return new Set();
  }
  const allowedValues = rows[0].split('|')[4] ?? '';
  return new Set([...allowedValues.matchAll(/"([^"]+)"/g)].map((match) => match[1]));
}

// 2. value sets: the schema row declares exactly the pinned set. A quoted echo
// elsewhere in prose or an example does not document the allowed set.
const REASONING_EFFORTS = new Set(['low', 'medium', 'high', 'xhigh', 'max', 'ultra']);
const efforts = declaredValues('model_reasoning_effort');
if (!setsEqual(efforts, REASONING_EFFORTS))
  fail(`model_reasoning_effort set is {${show(efforts)}}; expected {${show(REASONING_EFFORTS)}}`);

const SANDBOX_MODES = new Set(['read-only', 'workspace-write', 'danger-full-access']);
const sandboxModes = declaredValues('sandbox_mode');
if (!setsEqual(sandboxModes, SANDBOX_MODES))
  fail(`sandbox_mode set is {${show(sandboxModes)}}; expected {${show(SANDBOX_MODES)}}`);

// 3. claims the Codex docs do not support must not return anywhere in the skill:
// undocumented keys, and the "cannot spawn" portability claim.
const BANNED = [
  [/agents\.max_depth/, 'undocumented key agents.max_depth'],
  [/job_max_runtime_seconds/, 'undocumented key agents.job_max_runtime_seconds'],
  [/nickname_candidates/, 'undocumented key nickname_candidates'],
  [/cannot spawn subagents|subagents cannot spawn/i, "unsupported 'cannot spawn subagents' claim"],
];
const stack = [SAP];
while (stack.length) {
  const d = stack.pop();
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const full = path.join(d, e.name);
    if (e.isDirectory()) {
      stack.push(full);
      continue;
    }
    const text = fs.readFileSync(full, 'utf8');
    for (const [re, what] of BANNED) {
      if (re.test(text)) fail(`${path.relative(REPO_DIR, full)} states ${what}`);
    }
  }
}

if (errors > 0) {
  console.error(`Guard FAILED: ${errors} Codex-fact drift error(s) in skill-agent-pipeline`);
  process.exit(1);
}
console.log('Guard PASSED: skill-agent-pipeline Codex facts match canonical sets');
