#!/usr/bin/env node
// codex-facts.mjs — pin the Codex platform facts asserted by
// skill-agent-pipeline. Author-side only; skips when absent.
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

// 1. every gpt-5* token is a real Codex model id
const CODEX_MODELS =
  'gpt-5.6-sol gpt-5.6-terra gpt-5.6-luna gpt-5.5 gpt-5.4 gpt-5.4-mini gpt-5.3-codex gpt-5.3-codex-spark gpt-5.2';
const allowed = new Set(CODEX_MODELS.split(' '));
const toks = [...new Set(doc.match(/gpt-5\.[0-9]+(-[a-z]+)*/g) || [])].sort();
for (const tok of toks) {
  if (!allowed.has(tok))
    fail(`codex-agents-builder.md references unknown Codex model id '${tok}' (allowed: ${CODEX_MODELS})`);
}

// 2. model_reasoning_effort canonical set; `none` left the set and is valid
//    only on plan_mode_reasoning_effort
for (const v of ['minimal', 'low', 'medium', 'high', 'xhigh']) {
  if (!doc.includes(`"${v}"`))
    fail(`codex-agents-builder.md missing model_reasoning_effort value "${v}" (set: minimal/low/medium/high/xhigh)`);
}
for (const line of doc.split('\n')) {
  if (
    line.includes('model_reasoning_effort') &&
    line.includes('"none"') &&
    !line.includes('plan_mode_reasoning_effort')
  ) {
    fail(
      'codex-agents-builder.md lists "none" as a model_reasoning_effort value without re-scoping it to plan_mode_reasoning_effort (the only key where none remains valid)',
    );
  }
}

// 3. sandbox_mode values
for (const v of ['read-only', 'workspace-write', 'danger-full-access']) {
  if (!doc.includes(v)) fail(`codex-agents-builder.md missing sandbox_mode value '${v}'`);
}

// 4. nesting fact + discredited claim must not return
if (!doc.includes('agents.max_depth'))
  fail('codex-agents-builder.md must document the agents.max_depth nesting fact (single-level dispatch ports)');
const sapHas = (() => {
  const re = /cannot spawn subagents|subagents cannot spawn/i;
  const stack = [SAP];
  while (stack.length) {
    const d = stack.pop();
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) stack.push(full);
      else if (re.test(fs.readFileSync(full, 'utf8'))) return true;
    }
  }
  return false;
})();
if (sapHas)
  fail(
    "skill-agent-pipeline revives the discredited 'cannot spawn subagents' claim — Codex allows depth-1 dispatch (agents.max_depth: 1)",
  );

if (errors > 0) {
  console.error(`Guard FAILED: ${errors} Codex-fact drift error(s) in skill-agent-pipeline`);
  process.exit(1);
}
console.log('Guard PASSED: skill-agent-pipeline Codex facts match canonical sets');
