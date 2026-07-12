#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const HARNESS_PATH = 'scripts/tests/plan-review-policy.mjs';
const SUPPORT = [
  'plugins/docks/skills/productivity/plan-review/scripts/review-policy.mjs',
  'scripts/tests/fixtures/plan-review-policy/sample-plan.md',
  HARNESS_PATH,
];
const MUTATIONS = [
  ['docs/plans/AGENTS.md', 'platform_denied', 'platform-denied'],
  ['plugins/docks/skills/productivity/plan-init/references/plans-agents-md-template.md', 'platform_denied', 'platform-denied'],
  ['plugins/docks/skills/productivity/plan-init/SKILL.md', 'strong-default X/S review receipts', 'optional review receipts'],
  ['plugins/docks/skills/productivity/plan-manager/SKILL.md', 'NeedsMainReviewDispatch', 'MissingMainDispatch'],
  ['plugins/docks/skills/productivity/plan-review/SKILL.md', '--skip-git-repo-check', '--require-git-repo'],
  ['plugins/docks/agents/plan-manager.md', 'Never launch X/S', 'Launch X/S'],
  ['plugins/docks/agents/plan-review.md', 'Return evidence only', 'Return prose only'],
  ['.codex/agents/plan-manager.toml', 'Never launch X/S', 'Launch X/S'],
  ['.codex/agents/plan-review.toml', 'Return typed evidence only', 'Return prose only'],
  ['plugins/docks/skills/productivity/plan-init/references/codex-agent-templates.md', 'NeedsMainReviewDispatch', 'MissingMainDispatch'],
  ['docs/scaffold/templates/codex-plan-manager.toml.template', 'Never launch X/S', 'Launch X/S'],
  ['docs/scaffold/templates/codex-plan-review.toml.template', 'Return typed evidence only', 'Return prose only'],
  ['docs/scaffold/templates/root-AGENTS.md.template', 'Review dispatch always returns to main context', 'Review dispatch stays in wrapper'],
  ['AGENTS.md', 'Independent X/S plan review', 'Optional plan review'],
  ['README.md', 'Every plan receives independent X/S review', 'Some plans may receive review'],
  ['plugins/docks/README.md', 'Plan review is a strong availability-aware default', 'Plan review is optional'],
  ['plugins/docks/skills/AGENTS.md', 'independent-review contract', 'optional-review contract'],
  ['plugins/session-relay/skills/productivity/session-relay/SKILL.md', 'rejected as a schema-v1 policy', 'accepted as a schema-v1 policy'],
  ['plugins/docks/skills/productivity/plan-review/scripts/review-policy.mjs', '--skip-git-repo-check', '--require-git-repo'],
];
const REQUIRED_SURFACES = [...new Set([...SUPPORT, ...MUTATIONS.map(([file]) => file)])];

function copyRoot(target) {
  for (const relative of REQUIRED_SURFACES) {
    const source = path.join(ROOT, relative); const dest = path.join(target, relative);
    assert.ok(fs.existsSync(source), `omitted-surface oracle: ${relative}`);
    fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.copyFileSync(source, dest);
  }
}

function runHarness(root) {
  return spawnSync(process.execPath, [path.join(root, HARNESS_PATH)], { cwd: root, encoding: 'utf8' });
}

function mutate(root, relative, before, after) {
  const target = path.join(root, relative); const text = fs.readFileSync(target, 'utf8');
  assert.ok(text.includes(before), `${relative}: mutation anchor missing`);
  fs.writeFileSync(target, text.split(before).join(after));
}

try {
  const self = fs.readFileSync(fileURLToPath(import.meta.url), 'utf8');
  assert.doesNotMatch(self, /from ['"].*review-policy\.mjs['"]/);
  assert.doesNotMatch(self, /from ['"].*plan-review-policy\.mjs['"]/);
  assert.doesNotMatch(self, /spawnSync\([^,]*HELPER/);
  console.log('mutation driver imports no helper/harness/inventory and spawns harness only');

  const baseline = fs.mkdtempSync(path.join(os.tmpdir(), 'review-policy-baseline-'));
  copyRoot(baseline);
  const good = runHarness(baseline); assert.equal(good.status, 0, good.stderr);
  fs.rmSync(baseline, { recursive: true, force: true });
  console.log(`omitted-surface oracle covers ${REQUIRED_SURFACES.length} live/generated/helper surfaces`);

  for (const [relative, before, after] of MUTATIONS) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'review-policy-mutation-'));
    copyRoot(root); mutate(root, relative, before, after);
    const result = runHarness(root);
    assert.notEqual(result.status, 0, `${relative}: mutation unexpectedly passed`);
    fs.rmSync(root, { recursive: true, force: true });
    console.log(`${relative}: mutation failed by name`);
  }

  const malformed = fs.mkdtempSync(path.join(os.tmpdir(), 'review-policy-malformed-'));
  copyRoot(malformed);
  const fixture = path.join(malformed, 'scripts/tests/fixtures/plan-review-policy/sample-plan.md');
  mutate(malformed, 'scripts/tests/fixtures/plan-review-policy/sample-plan.md', 'title: Sample review plan', 'title: Sample review plan\ntitle: duplicate');
  const bad = runHarness(malformed); assert.notEqual(bad.status, 0, 'hard-coded malformed-frontmatter oracle passed');
  assert.ok(fs.existsSync(fixture)); fs.rmSync(malformed, { recursive: true, force: true });
  console.log('hard-coded malformed receipt/frontmatter oracle failed by name');

  console.log('plan-review-policy mutations passed');
} catch (error) {
  console.error(error.stack || error.message); process.exitCode = 1;
}
