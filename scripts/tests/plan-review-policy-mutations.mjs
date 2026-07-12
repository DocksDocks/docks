#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const HELPER = path.join(ROOT, 'plugins/docks/skills/productivity/plan-review/scripts/review-policy.mjs');
const HARNESS = path.join(ROOT, 'scripts/tests/plan-review-policy.mjs');
const REQUIRED_SURFACES = [
  'docs/plans/AGENTS.md',
  'plugins/docks/skills/productivity/plan-init/references/plans-agents-md-template.md',
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
];

function run(file, args = [], cwd = ROOT) { return spawnSync(process.execPath, [file, ...args], { cwd, encoding: 'utf8' }); }
function mustFail(label, result, pattern) {
  assert.notEqual(result.status, 0, `${label}: mutation unexpectedly passed`);
  assert.match(`${result.stdout}${result.stderr}`, pattern, `${label}: named failure missing`);
  console.log(`${label} mutation failed by name`);
}

try {
  const self = fs.readFileSync(fileURLToPath(import.meta.url), 'utf8');
  assert.doesNotMatch(self, /from ['"].*review-policy\.mjs['"]/);
  assert.doesNotMatch(self, /from ['"].*plan-review-policy\.mjs['"]/);
  console.log('mutation driver has no helper/harness/shared-inventory imports');

  for (const surface of REQUIRED_SURFACES) assert.ok(fs.existsSync(path.join(ROOT, surface)), `omitted-surface oracle: ${surface}`);
  console.log(`omitted-surface oracle covers ${REQUIRED_SURFACES.length} live/generated surfaces`);

  const harness = run(HARNESS);
  assert.equal(harness.status, 0, harness.stderr); assert.match(harness.stdout, /plan-review-policy contract passed/);

  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'review-policy-mutations-'));
  const malformedPlan = path.join(temp, 'malformed.md');
  fs.writeFileSync(malformedPlan, '---\ntitle: one\ntitle: two\n---\n# malformed\n');
  mustFail('duplicate-frontmatter', run(HELPER, ['canonical-plan', malformedPlan], temp), /duplicate frontmatter key/);

  const requestPath = path.join(temp, 'request.json'); const outputPath = path.join(temp, 'output.json');
  const policy = { schema: 1, cross_company_consent: 'always', zero_reviewer_policy: 'ask', orchestrator_preference: 'auto', openai_tiers: [{ model: 'gpt-5.6-sol', effort: 'xhigh', transports: ['cli'] }], anthropic_tiers: [{ model: 'fable', effort: 'high', transports: ['cli'] }], provenance: { cross_company_consent: 'current_user', zero_reviewer_policy: 'skill_default', orchestrator_preference: 'skill_default', openai_tiers: 'skill_default', anthropic_tiers: 'skill_default' } };
  const canonicalPolicy = JSON.stringify(policy, Object.keys(policy).sort());
  const hash = (await import('node:crypto')).createHash('sha256').update(canonicalPolicy).digest('hex');
  const request = { schema: 1, request_id: '123e4567-e89b-42d3-a456-426614174000', phase: 'draft', lifecycle_intent: 'none', reviewed_commit_or_head: '0'.repeat(40), input_sha256: '1'.repeat(64), bundle_sha256: '2'.repeat(64), policy, policy_sha256: hash };
  fs.writeFileSync(requestPath, JSON.stringify(request));
  fs.writeFileSync(outputPath, JSON.stringify({ schema: 1, leg: 'X', request, verdict: 'ready', score: 100, findings: [], confirmations: [], unauthorized_extra: true }));
  mustFail('malformed-receipt', run(HELPER, ['validate-reviewer', outputPath, requestPath, 'X'], temp), /unknown key|policy hash mismatch/);
  fs.rmSync(temp, { recursive: true, force: true });

  console.log('canonical view/bundle/schema and hard-coded malformed-receipt oracles passed');
  console.log('plan-review-policy mutations passed');
} catch (error) {
  console.error(error.stack || error.message); process.exitCode = 1;
}
