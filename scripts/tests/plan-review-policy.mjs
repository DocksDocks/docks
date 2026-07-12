#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  applyLifecycleState, buildReviewerArgv, canonicalPlanView, classifyLeg, extractReviewerOutput, jcs, parsePlan,
  reviewerSchema, sealBundle, sha256, validateDraftReceipt, validatePolicy, validateRequest,
  validateReviewerOutput, validateWaivers,
} from '../../plugins/docks/skills/productivity/plan-review/scripts/review-policy.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const FIXTURE = path.join(ROOT, 'scripts/tests/fixtures/plan-review-policy/sample-plan.md');
const HELPER = path.join(ROOT, 'plugins/docks/skills/productivity/plan-review/scripts/review-policy.mjs');
const POLICY = {
  schema: 1,
  cross_company_consent: 'always',
  zero_reviewer_policy: 'ask',
  orchestrator_preference: 'auto',
  openai_tiers: [{ model: 'gpt-5.6-sol', effort: 'xhigh', transports: ['in_session', 'cli'] }],
  anthropic_tiers: [{ model: 'fable', effort: 'high', transports: ['in_session', 'cli'] }, { model: 'opus', effort: 'max', transports: ['in_session', 'cli'] }],
  provenance: { cross_company_consent: 'runtime_global', zero_reviewer_policy: 'skill_default', orchestrator_preference: 'skill_default', openai_tiers: 'skill_default', anthropic_tiers: 'skill_default' },
};

function request(overrides = {}) {
  return {
    schema: 1,
    request_id: '123e4567-e89b-42d3-a456-426614174000',
    phase: 'draft',
    lifecycle_intent: 'none',
    reviewed_commit_or_head: '0'.repeat(40),
    input_sha256: '1'.repeat(64),
    bundle_sha256: '2'.repeat(64),
    policy: POLICY,
    policy_sha256: sha256(jcs(POLICY)),
    ...overrides,
  };
}

function expectThrow(label, fn, pattern = /./) {
  assert.throws(fn, pattern, `${label} must reject`);
}

function makeWritable(target) {
  const stat = fs.lstatSync(target);
  if (stat.isDirectory()) {
    fs.chmodSync(target, 0o755);
    for (const name of fs.readdirSync(target)) makeWritable(path.join(target, name));
  } else fs.chmodSync(target, 0o644);
}

function treeDigest(root) {
  const rows = [];
  const walk = (dir) => {
    for (const name of fs.readdirSync(dir).sort()) {
      const target = path.join(dir, name); const rel = path.relative(root, target); const stat = fs.lstatSync(target);
      if (stat.isDirectory()) { rows.push(`d ${rel} ${stat.mode & 0o777}`); walk(target); }
      else if (stat.isSymbolicLink()) rows.push(`l ${rel} ${fs.readlinkSync(target)}`);
      else rows.push(`f ${rel} ${stat.mode & 0o777} ${sha256(fs.readFileSync(target))}`);
    }
  };
  walk(root); return sha256(rows.join('\n'));
}

function git(cwd, args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' }); assert.equal(result.status, 0, `${args.join(' ')}: ${result.stderr}`); return result.stdout.trim();
}

function gitBytes(cwd, args) {
  const result = spawnSync('git', args, { cwd }); assert.equal(result.status, 0, `${args.join(' ')}: ${result.stderr}`); return result.stdout;
}

function testCanonical() {
  const raw = fs.readFileSync(FIXTURE);
  const parsed = parsePlan(raw);
  assert.equal(parsed.frontmatter.status, 'planned');
  const view = canonicalPlanView(raw);
  assert.match(view, /Ordinary self-review prose remains canonical/);
  assert.doesNotMatch(view, /Review-receipt:/);
  assert.doesNotMatch(view, /"status"/);
  const lifecycle = Buffer.from(raw.toString().replace('status: planned', 'status: ongoing').replace('updated: "2026-07-12T00:00:00-03:00"', 'updated: "2026-07-12T01:00:00-03:00"'));
  assert.equal(canonicalPlanView(lifecycle), view, 'lifecycle-only mutation is excluded');
  assert.notEqual(canonicalPlanView(Buffer.from(raw.toString().replace('Prove canonical policy behavior.\n\n## Steps', 'Prove changed policy behavior.\n\n## Steps'))), view, 'ordinary prose mutation invalidates');
  expectThrow('BOM', () => canonicalPlanView(Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), raw])), /BOM/);
  expectThrow('duplicate key', () => canonicalPlanView(Buffer.from(raw.toString().replace('title: Sample review plan', 'title: Sample review plan\ntitle: duplicate'))), /duplicate/);
  expectThrow('nested YAML', () => canonicalPlanView(Buffer.from(raw.toString().replace('tags: [review-policy]', 'tags:\n  nested: nope'))), /unsupported/);
  console.log('canonical view goldens passed');
}

function testSchemas() {
  validatePolicy(POLICY);
  const req = request(); validateRequest(req);
  const output = { schema: 1, leg: 'X', request: req, verdict: 'ready', score: 98, findings: [{ id: 'X1', severity: 'low', section: 'Goal', path: null, locator: null, defect: 'Minor ambiguity', fix: 'State it', evidence: 'Plan text' }], confirmations: ['Bundle was read'] };
  validateReviewerOutput(output, req, 'X');
  expectThrow('echo mismatch', () => validateReviewerOutput({ ...output, request: { ...req, request_id: '223e4567-e89b-42d3-a456-426614174000' } }, req, 'X'), /mismatch/);
  expectThrow('unknown reviewer key', () => validateReviewerOutput({ ...output, extra: true }, req, 'X'), /unknown/);
  expectThrow('cross-leg id', () => validateReviewerOutput({ ...output, findings: [{ ...output.findings[0], id: 'S1' }] }, req, 'X'), /finding id/);
  assert.equal(reviewerSchema('X').additionalProperties, false);
  assert.equal(reviewerSchema('X').properties.request.additionalProperties, false);
  validateWaivers([{ phase: 'draft', input_sha256: req.input_sha256, legs: ['S', 'X'], actor: 'user', reason: 'explicit waiver', at: '2026-07-12T00:00:00-03:00' }], 'draft', req.input_sha256);
  expectThrow('duplicate waiver', () => validateWaivers([
    { phase: 'draft', input_sha256: req.input_sha256, legs: ['X'], actor: 'user', reason: 'one', at: '2026-07-12T00:00:00-03:00' },
    { phase: 'draft', input_sha256: req.input_sha256, legs: ['X'], actor: 'user', reason: 'two', at: '2026-07-12T00:00:00-03:00' },
  ], 'draft', req.input_sha256), /duplicate/);
  const raw = (leg) => ({ schema: 1, leg, request: req, result: 'unavailable_auth', attempts: [], selected: null, findings: [], findings_sha256: null, severity_totals: { high: 0, medium: 0, low: 0 }, waiver: null, decision_evidence: null, reason: 'authentication unavailable' });
  const persisted = (leg) => ({ request: req, raw: raw(leg), reconciliation: { accepted: [], rejected: [] } });
  const receipt = { schema: 1, phase: 'draft', request: req, input_sha256: req.input_sha256, reviewed_commit: req.reviewed_commit_or_head, author: { company: 'openai', tool: 'codex', model: 'gpt-5.6-sol', effort: 'xhigh' }, policy: req.policy, policy_sha256: req.policy_sha256, X: persisted('X'), S: persisted('S'), decision_evidence: null, outcome: 'blocked', reviewed_at: '2026-07-12T00:00:00-03:00' };
  validateDraftReceipt(receipt, req.input_sha256);
  expectThrow('malformed receipt extra key', () => validateDraftReceipt({ ...receipt, unauthorized_extra: true }, req.input_sha256), /unknown key/);
  expectThrow('stale receipt input', () => validateDraftReceipt(receipt, 'f'.repeat(64)), /stale/);
  console.log('schema closure goldens passed');
}

function testBundle() {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'review-policy-bundle-'));
  const repo = path.join(temp, 'repo'); const out = path.join(temp, 'bundle');
  fs.mkdirSync(path.join(repo, 'docs/plans/active'), { recursive: true }); fs.mkdirSync(path.join(repo, 'src'));
  fs.copyFileSync(FIXTURE, path.join(repo, 'docs/plans/active/sample.md')); fs.writeFileSync(path.join(repo, 'src/example.js'), 'export const example = true;\n'); fs.symlinkSync('example.js', path.join(repo, 'src/example-link.js'));
  const sealed = sealBundle({ repo, reviewedCommit: '0'.repeat(40), planPath: 'docs/plans/active/sample.md', requestedPaths: ['src', 'missing.txt'], outDir: out });
  assert.match(sealed.bundle_sha256, /^[0-9a-f]{64}$/); assert.equal(sealed.manifest.requested.find((row) => row.path === 'missing.txt').state, 'absent');
  assert.equal(sealed.manifest.files.find((row) => row.path === 'src/example-link.js').mode, '120000');
  assert.equal(fs.statSync(out).mode & 0o222, 0, 'bundle root read-only');
  makeWritable(out); fs.rmSync(temp, { recursive: true, force: true });
  console.log('bundle manifest/hash goldens passed');
}

function testLegs() {
  const req = request();
  const codex = buildReviewerArgv({ tool: 'codex', bundle: '/tmp/bundle', model: 'gpt-5.6-sol', effort: 'xhigh', leg: 'X', request: req });
  assert.deepEqual(codex.slice(0, 6), ['exec', '-C', '/tmp/bundle', '--skip-git-repo-check', '-s', 'read-only']);
  assert.match(codex.at(-1), /REQUEST_JCS_BEGIN\n\{/); assert.match(codex.at(-1), /REQUEST_JCS_END$/);
  const claude = buildReviewerArgv({ tool: 'claude', bundle: '/tmp/bundle', model: 'fable', effort: 'high', leg: 'S', request: req });
  assert.deepEqual(claude.slice(0, 3), ['-p', '--permission-mode', 'plan']); assert.ok(claude.includes('--json-schema'));
  const echoed = { schema: 1, leg: 'S', request: req, verdict: 'ready', score: 100, findings: [], confirmations: ['request copied'] };
  assert.equal(extractReviewerOutput('claude', JSON.stringify({ structured_output: echoed }), req, 'S').score, 100);
  expectThrow('readable request echo mismatch', () => extractReviewerOutput('claude', JSON.stringify({ structured_output: { ...echoed, request: { ...req, bundle_sha256: '3'.repeat(64) } } }), req, 'S'), /mismatch/);
  expectThrow('relay rejection', () => buildReviewerArgv({ tool: 'relay', bundle: '/tmp/bundle', model: 'fable', effort: 'high', leg: 'S', request: req }), /relay is not supported/);
  assert.equal(classifyLeg({ leg: 'X', policy: POLICY, attempts: [{ result: 'passed' }], eligibleTierCount: 1 }), 'passed');
  assert.equal(classifyLeg({ leg: 'X', policy: POLICY, attempts: [{ result: 'platform_denied' }], eligibleTierCount: 1 }), 'platform_denied');
  assert.equal(classifyLeg({ leg: 'S', policy: POLICY, attempts: [{ result: 'model_unavailable' }, { result: 'model_unavailable' }], eligibleTierCount: 2 }), 'unavailable_model');
  expectThrow('tier_count+1 bound', () => classifyLeg({ leg: 'S', policy: POLICY, attempts: [{ result: 'transient_transport' }, { result: 'model_unavailable' }, { result: 'model_unavailable' }, { result: 'nonzero_exit' }], eligibleTierCount: 2 }), /bound/);
  const never = { ...POLICY, cross_company_consent: 'never' };
  assert.equal(classifyLeg({ leg: 'X', policy: never, attempts: [], eligibleTierCount: 1 }), 'not_authorized');
  assert.equal(classifyLeg({ leg: 'S', policy: never, attempts: [{ result: 'passed' }], eligibleTierCount: 2 }), 'passed');
  console.log('legs: direct argv, skip-git, plan mode, JCS echo, attempt bounds, relay rejection, denial and consent separation passed');
}

function testLifecycle() {
  assert.deepEqual(applyLifecycleState({ state: 'planned', intent: 'none', eligible: true }), { state: 'planned', intent_used: false, applied: false });
  assert.deepEqual(applyLifecycleState({ state: 'scheduled', intent: 'none', eligible: false }), { state: 'scheduled', intent_used: false, applied: false });
  assert.equal(applyLifecycleState({ state: 'planned', intent: 'start', eligible: true }).state, 'ongoing');
  assert.equal(applyLifecycleState({ state: 'scheduled', intent: 'schedule_fire', eligible: true }).state, 'ongoing');
  assert.equal(applyLifecycleState({ state: 'scheduled', intent: 'auto_execute', eligible: false }).state, 'scheduled');
  assert.equal(applyLifecycleState({ state: 'planned', intent: 'start', eligible: true, intentUsed: true }).applied, false);
  expectThrow('wrong state start', () => applyLifecycleState({ state: 'scheduled', intent: 'start', eligible: true }), /requires planned/);
  expectThrow('wrong state fire', () => applyLifecycleState({ state: 'planned', intent: 'schedule_fire', eligible: true }), /requires scheduled/);
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'review-policy-lifecycle-')); const original = path.join(temp, 'original'); const verify = path.join(temp, 'verify');
  fs.mkdirSync(original); git(original, ['init', '-q']); git(original, ['config', 'user.email', 'policy@example.test']); git(original, ['config', 'user.name', 'Policy Test']);
  fs.writeFileSync(path.join(original, 'result.txt'), 'original\n'); git(original, ['add', 'result.txt']); git(original, ['commit', '-qm', 'fixture']); const head = git(original, ['rev-parse', 'HEAD']);
  const before = treeDigest(original); git(temp, ['clone', '-q', '--no-local', '--no-checkout', original, verify]); git(verify, ['checkout', '-q', '--detach', head]);
  fs.writeFileSync(path.join(verify, 'ci-artifact.txt'), 'disposable only\n'); fs.writeFileSync(path.join(verify, '.docks-plan-verify-sentinel'), 'owned\n');
  assert.equal(treeDigest(original), before, 'original repo + complete .git digest unchanged');
  assert.ok(fs.existsSync(path.join(verify, '.docks-plan-verify-sentinel')), 'cleanup sentinel'); fs.rmSync(verify, { recursive: true, force: true }); assert.equal(treeDigest(original), before);
  fs.rmSync(temp, { recursive: true, force: true });
  console.log('lifecycle: planned/scheduled preservation, start/fire/auto gating and one-intent consumption passed');
  console.log('lifecycle: git clone --no-local disposable CI and complete original repo+.git digest passed');
}

function testConsumer() {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'review-policy-consumer-'));
  const copy = path.join(temp, 'review-policy.mjs'); fs.copyFileSync(HELPER, copy);
  const schema = spawnSync(process.execPath, [copy, 'schema', 'X'], { cwd: temp, encoding: 'utf8' });
  assert.equal(schema.status, 0, schema.stderr); assert.equal(JSON.parse(schema.stdout).additionalProperties, false);
  assert.equal(fs.existsSync(path.join(temp, 'package.json')), false); assert.equal(fs.existsSync(path.join(temp, 'node_modules')), false);
  fs.rmSync(temp, { recursive: true, force: true });
  console.log('consumer-only Node helper passed without package.json or node_modules');
}

function testContractSurfaces() {
  const contract = fs.readFileSync(path.join(ROOT, 'docs/plans/AGENTS.md'), 'utf8');
  const template = fs.readFileSync(path.join(ROOT, 'plugins/docks/skills/productivity/plan-init/references/plans-agents-md-template.md'), 'utf8');
  for (const marker of ['review_author_company:', 'review_waivers:', '### Strong-default independent review', 'platform_denied', 'prepare(intent)', 'X1…', 'S1…']) {
    assert.match(contract, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `contract missing ${marker}`);
    assert.match(template, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `template missing ${marker}`);
  }
  for (const file of ['AGENTS.md', 'README.md', 'plugins/docks/README.md', 'plugins/docks/skills/AGENTS.md']) {
    assert.match(fs.readFileSync(path.join(ROOT, file), 'utf8'), /strong|Strong|independent X\/S|independent-review/, `${file} missing public review route`);
  }
  assert.match(fs.readFileSync(path.join(ROOT, 'AGENTS.md'), 'utf8'), /Independent X\/S plan review/);
  assert.match(fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8'), /Every plan receives independent X\/S review/);
  assert.match(fs.readFileSync(path.join(ROOT, 'plugins/docks/README.md'), 'utf8'), /Plan review is a strong availability-aware default/);
  assert.match(fs.readFileSync(path.join(ROOT, 'plugins/docks/skills/AGENTS.md'), 'utf8'), /independent-review contract/);
  assert.match(fs.readFileSync(path.join(ROOT, 'plugins/docks/skills/productivity/plan-init/SKILL.md'), 'utf8'), /strong-default X\/S review receipts/);
  console.log('contract/template/public strong-default parity passed');
}

function testReviewRunnerSurfaces() {
  const skill = fs.readFileSync(path.join(ROOT, 'plugins/docks/skills/productivity/plan-review/SKILL.md'), 'utf8');
  assert.match(skill, /user-invocable: false/); assert.match(skill, /NeedsMainReviewDispatch/);
  assert.match(skill, /--skip-git-repo-check/); assert.match(skill, /--permission-mode plan/);
  assert.match(skill, /REQUEST_JCS_BEGIN/); assert.match(skill, /eligible_tier_count \+ 1/);
  assert.match(skill, /git clone --no-local/); assert.match(skill, /Session-relay is not|session-relay in schema v1/i);
  for (const file of ['plugins/docks/agents/plan-review.md', '.codex/agents/plan-review.toml', 'docs/scaffold/templates/codex-plan-review.toml.template', 'plugins/docks/skills/productivity/plan-init/references/codex-agent-templates.md']) {
    const text = fs.readFileSync(path.join(ROOT, file), 'utf8');
    assert.match(text, /evidence/i, `${file} lacks evidence-only route`);
    assert.doesNotMatch(text, /write the idempotent|and write the .*Review|tools:.*Edit/i, `${file} retains writer instructions`);
  }
  assert.match(fs.readFileSync(path.join(ROOT, 'plugins/docks/agents/plan-review.md'), 'utf8'), /Return evidence only/);
  for (const file of ['.codex/agents/plan-review.toml', 'docs/scaffold/templates/codex-plan-review.toml.template', 'plugins/docks/skills/productivity/plan-init/references/codex-agent-templates.md']) assert.match(fs.readFileSync(path.join(ROOT, file), 'utf8'), /Return typed evidence only/);
  assert.match(fs.readFileSync(path.join(ROOT, '.codex/agents/plan-review.toml'), 'utf8'), /sandbox_mode = "read-only"/);
  console.log('plan-review evidence-only live/generated wrapper parity passed');
}

function testManagerSurfaces() {
  const skill = fs.readFileSync(path.join(ROOT, 'plugins/docks/skills/productivity/plan-manager/SKILL.md'), 'utf8');
  for (const marker of ['Review before execution', 'Sole-writer protocol', 'prepare(intent)', 'NeedsMainReviewDispatch', '## `apply`', 'zero_reviewer_policy', 'platform_denied']) assert.match(skill, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  for (const file of ['plugins/docks/agents/plan-manager.md', '.codex/agents/plan-manager.toml', 'docs/scaffold/templates/codex-plan-manager.toml.template', 'plugins/docks/skills/productivity/plan-init/references/codex-agent-templates.md', 'docs/scaffold/templates/root-AGENTS.md.template']) {
    const text = fs.readFileSync(path.join(ROOT, file), 'utf8');
    assert.match(text, /NeedsMainReviewDispatch|sole public reviewer dispatcher/i, `${file} missing main handback`);
    assert.match(text, /Never launch X\/S|Review dispatch always returns to main/i, `${file} permits wrapper dispatch`);
  }
  console.log('plan-manager prepare/dispatch/apply live/generated wrapper parity passed');
}

function testRelayBoundary() {
  const relay = fs.readFileSync(path.join(ROOT, 'plugins/session-relay/skills/productivity/session-relay/SKILL.md'), 'utf8');
  for (const marker of ['not** Docks\' canonical strong-default', 'sealed non-git read-only', 'rejected as a schema-v1 policy', 'future', 'approved release']) assert.match(relay, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
  assert.match(relay, /ordinary collaborative debate/); assert.doesNotMatch(relay, /relay spawn.*canonical.*schema-v1/i);
  console.log('session-relay schema-v1 rejection and future-mode boundary passed');
}

function testSelfDemo(planPath) {
  const absolute = path.resolve(ROOT, planPath); const raw = fs.readFileSync(absolute, 'utf8');
  const match = raw.match(/^Bootstrap-review-record: (\{.*\})$/m); assert.ok(match, 'compact bootstrap record present');
  const record = JSON.parse(match[1]);
  assert.deepEqual(Object.keys(record).sort(), ['S', 'X', 'kind', 'plan_blob_sha256', 'plan_path', 'reviewed_commit', 'schema']);
  assert.equal(record.kind, 'bootstrap_not_reusable'); assert.match(record.reviewed_commit, /^[0-9a-f]{40}$/); assert.match(record.plan_blob_sha256, /^[0-9a-f]{64}$/);
  assert.equal(record.X.verdict, 'ready'); assert.equal(record.S.result, 'platform_denied'); assert.equal(record.S.attempted, false);
  const candidate = gitBytes(ROOT, ['show', `${record.reviewed_commit}:${record.plan_path}`]); assert.equal(sha256(candidate), record.plan_blob_sha256, 'bootstrap plan blob binding');
  assert.equal(record.X.findings_sha256, sha256(jcs([])), 'bootstrap X empty findings hash');
  assert.deepEqual(Object.keys(record.S).sort(), ['attempted', 'denial_source', 'reason', 'result', 'reviewed_at', 'selected']);
  const commits = git(ROOT, ['log', '--reverse', '--format=%H', '--', planPath]).split('\n');
  const recordCommit = commits.find((commit) => gitBytes(ROOT, ['show', `${commit}:${planPath}`]).toString().includes(match[0])); assert.ok(recordCommit, 'record-only commit found');
  const beforeRecord = gitBytes(ROOT, ['show', `${recordCommit}^:${planPath}`]); const afterRecord = gitBytes(ROOT, ['show', `${recordCommit}:${planPath}`]);
  assert.equal(canonicalPlanView(beforeRecord), canonicalPlanView(afterRecord), 'record-only commit preserves canonical input');

  const input = sha256(canonicalPlanView(Buffer.from(raw))); const req = request({ input_sha256: input, reviewed_commit_or_head: git(ROOT, ['rev-parse', 'HEAD']) });
  const rawLeg = (leg) => ({ schema: 1, leg, request: req, result: 'unavailable_auth', attempts: [], selected: null, findings: [], findings_sha256: null, severity_totals: { high: 0, medium: 0, low: 0 }, waiver: null, decision_evidence: null, reason: 'synthetic helper conformance only' });
  const persisted = (leg) => ({ request: req, raw: rawLeg(leg), reconciliation: { accepted: [], rejected: [] } });
  validateDraftReceipt({ schema: 1, phase: 'draft', request: req, input_sha256: input, reviewed_commit: req.reviewed_commit_or_head, author: { company: 'anthropic', tool: 'claude', model: 'unknown', effort: 'unknown' }, policy: req.policy, policy_sha256: req.policy_sha256, X: persisted('X'), S: persisted('S'), decision_evidence: null, outcome: 'blocked', reviewed_at: '2026-07-12T00:00:00-03:00' }, input);
  console.log('self-demo: bootstrap commit/blob/findings/degraded-S and record-only canonical invariant passed');
  console.log('self-demo: new-helper synthetic conformance receipt validates current implementation input and is not pre-gating proof');
}

const args = process.argv.slice(2);
try {
  if (args[0] === '--case' && args[1] === 'legs') testLegs();
  else if (args[0] === '--case' && args[1] === 'lifecycle') testLifecycle();
  else if (args[0] === '--case' && args[1] === 'self-demo') testSelfDemo(args[2]);
  else {
    testCanonical(); testSchemas(); testBundle(); testLegs(); testLifecycle(); testConsumer(); testContractSurfaces(); testReviewRunnerSurfaces(); testManagerSurfaces(); testRelayBoundary();
    console.log('plan-review-policy contract passed');
  }
} catch (error) {
  console.error(error.stack || error.message); process.exitCode = 1;
}
