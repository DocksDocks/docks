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
  console.log('plan-review-policy mutations passed');
} catch (error) {
  console.error(error.stack || error.message); process.exitCode = 1;
}
