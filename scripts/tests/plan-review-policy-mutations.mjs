#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const HARNESS = 'scripts/tests/plan-review-policy.mjs';
const REQUIRED_SURFACES = [
  'docs/plans/AGENTS.md',
  'plugins/docks/skills/productivity/plan-init/references/plans-agents-md-template.md',
  'plugins/docks/skills/productivity/plan-init/SKILL.md',
  'plugins/docks/skills/productivity/plan-manager/SKILL.md',
  'plugins/docks/skills/productivity/plan-review/SKILL.md',
  'plugins/docks/agents/plan-manager.md',
  'plugins/docks/agents/plan-review.md',
  '.codex/agents/plan-manager.toml',
  '.codex/agents/plan-review.toml',
  'plugins/docks/skills/productivity/plan-init/references/codex-agent-templates.md',
  'docs/scaffold/templates/codex-plan-manager.toml.template',
  'docs/scaffold/templates/codex-plan-review.toml.template',
  'docs/scaffold/templates/root-AGENTS.md.template',
  'AGENTS.md', 'README.md', 'plugins/docks/README.md', 'plugins/docks/skills/AGENTS.md',
  'plugins/session-relay/skills/productivity/session-relay/SKILL.md',
  'plugins/docks/skills/productivity/plan-review/scripts/review-policy.mjs',
  'scripts/tests/fixtures/plan-review-policy/sample-plan.md',
  HARNESS,
];

function copyRoot(target) {
  for (const relative of REQUIRED_SURFACES) {
    const source = path.join(ROOT, relative); const dest = path.join(target, relative);
    assert.ok(fs.existsSync(source), `omitted-surface oracle: ${relative}`);
    fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.copyFileSync(source, dest);
  }
}

function run(root, args) {
  return spawnSync(process.execPath, [path.join(root, HARNESS), ...args], { cwd: root, encoding: 'utf8' });
}

function requirePass(label, result, pattern) {
  assert.equal(result.status, 0, `${label}: ${result.stderr}`); assert.match(result.stdout, pattern, `${label}: named proof missing`); console.log(`${label} passed`);
}

function mutate(relative, before, after) {
  return (root) => {
    const file = path.join(root, relative); const text = fs.readFileSync(file, 'utf8');
    assert.equal(text.split(before).length - 1, 1, `mutation anchor must be unique: ${relative}`);
    fs.writeFileSync(file, text.replace(before, after));
  };
}

function combine(...mutations) {
  return (root) => { for (const apply of mutations) apply(root); };
}

const MUTATIONS = [
  ['passed not_ready bypass', ['--case', 'adversarial'], /not_ready|completion verdict|Assertion/, mutate(
    'plugins/docks/skills/productivity/plan-review/scripts/review-policy.mjs',
    "if ([X, S].some((leg) => leg?.result === 'passed' && leg.reviewer_output?.verdict === 'not_ready')) return 'regressed';",
    "if (false) return 'regressed';",
  )],
  ['vacuous acceptance inventory', ['--case', 'adversarial'], /acceptance inventory|must reject|Assertion/, mutate(
    'plugins/docks/skills/productivity/plan-review/scripts/review-policy.mjs',
    "if (value.schema !== 1 || !Array.isArray(value.criteria) || value.criteria.length === 0) throw new Error('acceptance inventory must be nonempty');",
    "if (value.schema !== 1 || !Array.isArray(value.criteria)) throw new Error('acceptance inventory must be nonempty');",
  )],
  ['acceptance command substitution', ['--case', 'adversarial'], /altered acceptance command|must reject|Assertion/, mutate(
    'plugins/docks/skills/productivity/plan-review/scripts/review-policy.mjs',
    "if (row.criterion_id !== criterion.id || row.command !== criterion.command || row.expected !== criterion.expected) throw new Error('acceptance evidence order or criterion mismatch');",
    "if (row.criterion_id !== criterion.id || row.expected !== criterion.expected) throw new Error('acceptance evidence order or criterion mismatch');",
  )],
  ['raw source plan ancestor defenses', [], /raw plan requested ancestor|must reject|Assertion/, combine(
    mutate(
      'plugins/docks/skills/productivity/plan-review/scripts/review-policy.mjs',
      "if (unique.some((logical) => sameOrAncestor(logical, safePlan))) throw new Error('raw plan path or ancestor is forbidden in requested paths');",
      "if (false) throw new Error('raw plan path or ancestor is forbidden in requested paths');",
    ),
    mutate(
      'plugins/docks/skills/productivity/plan-review/scripts/review-policy.mjs',
      "if (entries.slice(start).some((entry) => entry.path === safePlan)) throw new Error('raw plan path was emitted by requested path expansion');",
      "if (false) throw new Error('raw plan path was emitted by requested path expansion');",
    ),
  )],
  ['sealed plan-view semantic binding', [], /plan-B substitution|must reject|Assertion/, mutate(
    'plugins/docks/skills/productivity/plan-review/scripts/review-policy.mjs',
    "if (!planView || planView.mode !== '100444' || sha256(planView.bytes) !== manifest.input_sha256) throw new Error('bundle plan view input hash mismatch');",
    "if (!planView || planView.mode !== '100444') throw new Error('bundle plan view input hash mismatch');",
  )],
  ['sealed reviewer-schema semantic binding', [], /reviewer schema substitution|must reject|Assertion/, mutate(
    'plugins/docks/skills/productivity/plan-review/scripts/review-policy.mjs',
    "if (!schema || schema.mode !== '100444' || schema.bytes.toString() !== expected) throw new Error(`bundle reviewer schema mismatch: ${leg}`);",
    "if (!schema || schema.mode !== '100444') throw new Error(`bundle reviewer schema mismatch: ${leg}`);",
  )],
  ['requested-row coverage binding', [], /requested-state substitution|must reject|Assertion/, mutate(
    'plugins/docks/skills/productivity/plan-review/scripts/review-policy.mjs',
    "if (row.state === 'file' && (matches.length !== 1 || matches[0] !== logical)) throw new Error('file requested path coverage mismatch');",
    "if (false) throw new Error('file requested path coverage mismatch');",
  )],
  ['sealed file hash bypass', [], /post-seal bundle mutation|must reject|Assertion/, mutate(
    'plugins/docks/skills/productivity/plan-review/scripts/review-policy.mjs',
    "if (sha256(bytes) !== row.sha256) throw new Error(`bundle file hash mismatch: ${logical}`);",
    "if (false) throw new Error(`bundle file hash mismatch: ${logical}`);",
  )],
  ['execution range validator bypass', ['--case', 'lifecycle'], /non-start execution base|must reject|Assertion/, mutate(
    'plugins/docks/skills/productivity/plan-review/scripts/review-policy.mjs',
    'validateExecutionRange({ repo, planPath: safePlan, plannedAtCommit, executionBaseCommit, reviewedHead: reviewedCommit });',
    '({ repo, planPath: safePlan, plannedAtCommit, executionBaseCommit, reviewedHead: reviewedCommit });',
  )],
  ['planned-base completion diff regression', ['--case', 'lifecycle'], /pre-start concurrent work|Assertion/, mutate(
    'plugins/docks/skills/productivity/plan-review/scripts/review-policy.mjs',
    'const diffBytes = completionDiff(repo, executionBaseCommit, reviewedCommit);',
    'const diffBytes = completionDiff(repo, plannedAtCommit, reviewedCommit);',
  )],
  ['read-only wrapper claims primary writes', [], /primary work|write boundary|Assertion/, mutate(
    '.codex/agents/plan-review.toml',
    '- Never run or claim CI, acceptance, clone, cleanup, or lifecycle work.',
    '- CI/acceptance claims require fresh disposable-checkout command evidence.',
  )],
  ['Claude evidence wrapper regains Bash', [], /mutation-capable reviewer tools|Assertion/, mutate(
    'plugins/docks/agents/plan-review.md',
    'tools: Read, Glob, Grep',
    'tools: Read, Glob, Grep, Bash',
  )],
  ['JCS lone-surrogate value bypass', [], /lone-surrogate value|must reject|Assertion/, mutate(
    'plugins/docks/skills/productivity/plan-review/scripts/review-policy.mjs',
    "assertUnicodeScalarString(value, 'JCS string');",
    "void value; // weakened string validation",
  )],
  ['JCS lone-surrogate key bypass', [], /lone-surrogate property key|must reject|Assertion/, mutate(
    'plugins/docks/skills/productivity/plan-review/scripts/review-policy.mjs',
    "for (const key of keys) assertUnicodeScalarString(key, 'JCS property key');",
    "for (const key of keys) void key; // weakened property-key validation",
  )],
  ['GitHub publishing contract loss', [], /publishing operation|Assertion/, mutate(
    'plugins/docks/skills/productivity/plan-manager/SKILL.md',
    '## Publishing a plan as a GitHub issue (`--issues`)',
    '## Removed external operation',
  )],
  ['malformed acceptance source table', [], /acceptance inventory|criterion id|Assertion/, mutate(
    'scripts/tests/fixtures/plan-review-policy/sample-plan.md',
    '| A2 | `node --check fixture.js` | exit 0 |',
    '| A1 | `node --check fixture.js` | exit 0 |',
  )],
];

try {
  const self = fs.readFileSync(fileURLToPath(import.meta.url), 'utf8');
  assert.doesNotMatch(self, /from ['"].*review-policy\.mjs['"]/);
  assert.doesNotMatch(self, /from ['"].*plan-review-policy\.mjs['"]/);
  assert.equal((self.match(/spawnSync\(/g) || []).length, 1, 'driver has one black-box spawn site');
  console.log('mutation driver imports no helper/harness/inventory and spawns only the copied harness');

  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'review-policy-black-box-')); copyRoot(temp);
  console.log(`omitted-surface oracle copied ${REQUIRED_SURFACES.length} live/generated/helper surfaces`);
  const semantic = run(temp, ['--case', 'adversarial']);
  requirePass('semantic attempt/ledger/raw/run/receipt adversarial matrix', semantic, /semantic adversarial .* validators passed/);
  assert.match(semantic.stdout, /not_ready verdict and structured-output hash cannot authorize execution/);
  assert.match(semantic.stdout, /derived completion verdict rejects failing primary evidence and mismatched review_status/);
  requirePass('distinct X\/S schema and request leg matrix', run(temp, ['--case', 'legs']), /direct argv.*consent separation passed/);
  const lifecycle = run(temp, ['--case', 'lifecycle']);
  requirePass('shipped completion clone\/snapshot\/cleanup matrix', lifecycle, /git clone --no-local.*digest passed/);
  assert.match(lifecycle.stdout, /canonical root and prepare identity reject arbitrary roots and forged tokens/);
  const full = run(temp, []);
  requirePass('canonical bundle, fence, consumer, and surface matrix', full, /plan-review-policy contract passed/);
  assert.match(full.stdout, /GitHub issue publishing operation preservation passed/);
  fs.rmSync(temp, { recursive: true, force: true });
  for (const [label, args, pattern, apply] of MUTATIONS) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'review-policy-mutation-')); copyRoot(root); apply(root);
    const result = run(root, args); assert.notEqual(result.status, 0, `${label}: weakened copied artifact unexpectedly passed`);
    assert.match(`${result.stdout}\n${result.stderr}`, pattern, `${label}: independent failure oracle did not fire`);
    fs.rmSync(root, { recursive: true, force: true }); console.log(`external mutation rejected: ${label}`);
  }
  console.log('plan-review-policy mutations passed');
} catch (error) {
  console.error(error.stack || error.message); process.exitCode = 1;
}
