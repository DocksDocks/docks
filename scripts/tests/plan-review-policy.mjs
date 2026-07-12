#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  applyLifecycleState, buildReviewerArgv, canonicalPlanView, classifyLeg, deriveCompletionVerdict, extractReviewerOutput, jcs, parsePlan,
  reviewerSchema, sealBundle, sha256, validateCompletionReceipt, validateCompletionRunResult,
  validateDraftReceipt, validateDraftRunResult, validatePolicy, validateRawLeg, validateRequest,
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
  const policy = overrides.policy || POLICY;
  return {
    schema: 1,
    request_id: '123e4567-e89b-42d3-a456-426614174000',
    phase: 'draft',
    lifecycle_intent: 'none',
    reviewed_commit_or_head: '0'.repeat(40),
    input_sha256: '1'.repeat(64),
    bundle_sha256: '2'.repeat(64),
    author: { company: 'openai', tool: 'codex', model: 'gpt-5.6-sol', effort: 'xhigh' },
    policy,
    policy_sha256: sha256(jcs(policy)),
    ...overrides,
  };
}

function zeroDecision(req, decision = 'block') {
  return { schema: 1, kind: 'zero_reviewer', decision, actor: 'test orchestrator', reason: 'explicit test decision', at: '2026-07-12T00:00:00-03:00', request_id: req.request_id, input_sha256: req.input_sha256 };
}

const H0 = '0'.repeat(64); const H1 = '1'.repeat(64);
function attempt(overrides = {}) {
  return { schema: 1, model: 'gpt-5.6-sol', effort: 'xhigh', transport: 'cli', started: true, output_started: true, result: 'passed', exit_code: 0, signal: null, child_id: 'child-1', denial_source: null, retry_cause: null, timeout_mode: 'orchestrator_tool', timeout_seconds: 600, reason: 'completed', stdout_sha256: H0, stderr_sha256: H1, ...overrides };
}
function consentDecision(req, decision = 'allow') {
  return { schema: 1, kind: 'x_consent', decision, actor: 'test user', reason: 'explicit test consent', at: '2026-07-12T00:00:00-03:00', request_id: req.request_id, input_sha256: req.input_sha256 };
}
function rawPassed(req, leg, attempts = null, findings = [], reviewer = {}) {
  const company = leg === 'S' ? req.author.company : (req.author.company === 'openai' ? 'anthropic' : 'openai'); const tier = req.policy[`${company}_tiers`][0];
  const ledger = attempts || [attempt({ model: tier.model, effort: tier.effort })]; const last = ledger.at(-1);
  const structured = { schema: 1, leg, request: req, verdict: reviewer.verdict || 'ready', score: reviewer.score ?? 100, findings, confirmations: reviewer.confirmations || ['fixture reviewer completed'] };
  const reviewerOutput = { verdict: structured.verdict, score: structured.score, confirmations: structured.confirmations, structured_output_sha256: sha256(jcs(structured)) };
  return { schema: 1, leg, request: req, result: 'passed', attempts: ledger, selected: { model: last.model, effort: last.effort, transport: last.transport }, reviewer_output: reviewerOutput, findings, findings_sha256: sha256(jcs([...findings].sort((a, b) => a.id.localeCompare(b.id)))), severity_totals: { high: findings.filter((f) => f.severity === 'high').length, medium: findings.filter((f) => f.severity === 'medium').length, low: findings.filter((f) => f.severity === 'low').length }, waiver: null, waiver_sha256: null, decision_evidence: leg === 'X' && req.policy.cross_company_consent === 'ask' ? consentDecision(req) : null, reason: null };
}
function rawAuth(req, leg) {
  return { schema: 1, leg, request: req, result: 'unavailable_auth', attempts: [], selected: null, reviewer_output: null, findings: [], findings_sha256: null, severity_totals: { high: 0, medium: 0, low: 0 }, waiver: null, waiver_sha256: null, decision_evidence: leg === 'X' && req.policy.cross_company_consent === 'ask' ? consentDecision(req) : null, reason: 'authentication unavailable' };
}
function persisted(raw, accepted = []) {
  return { request: raw.request, raw, reconciliation: { accepted, rejected: raw.findings.filter((finding) => !accepted.includes(finding.id)).map((finding) => ({ id: finding.id, reason: 'not accepted in fixture' })) } };
}
function primaryEvidence() {
  return { goal_met: 'yes', findings: [], acceptance: [{ criterion_id: 'A1', command: 'node --test', expected: 'exit 0', exit_code: 0, actual_sha256: H0, met: true }], ci: { command: 'node --test', exit_code: 0, first_failure: null, output_sha256: H1 }, regressions: [], followups: [] };
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

function git(cwd, args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' }); assert.equal(result.status, 0, `${args.join(' ')}: ${result.stderr}`); return result.stdout.trim();
}

function gitBytes(cwd, args) {
  const result = spawnSync('git', args, { cwd }); assert.equal(result.status, 0, `${args.join(' ')}: ${result.stderr}`); return result.stdout;
}

function helper(cwd, args) {
  return spawnSync(process.execPath, [HELPER, ...args], { cwd, encoding: 'utf8' });
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
  const fenced = Buffer.from(raw.toString().replace('Ordinary self-review prose remains canonical.', '```text\nReview-receipt: {not-json}\n```\nOrdinary self-review prose remains canonical.'));
  assert.match(canonicalPlanView(fenced), /Review-receipt: \{not-json\}/, 'fenced machine-looking record retained');
  const fencedInfoLine = Buffer.from(raw.toString().replace('Ordinary self-review prose remains canonical.', '````text\n```not-a-close\nReview-receipt: {still-not-json}\n````\nOrdinary self-review prose remains canonical.'));
  assert.match(canonicalPlanView(fencedInfoLine), /Review-receipt: \{still-not-json\}/, 'same-marker info line inside longer fence does not close it');
  expectThrow('duplicate record kind', () => canonicalPlanView(Buffer.from(raw.toString().replace('Review-receipt: {"schema":1}', 'Review-receipt: {"schema":1}\nReview-receipt: {"schema":2}'))), /duplicate Review-receipt/);
  expectThrow('non-JCS record', () => canonicalPlanView(Buffer.from(raw.toString().replace('Review-receipt: {"schema":1}', 'Review-receipt: { "schema": 1 }'))), /compact JCS/);
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
  assert.equal(reviewerSchema('X').properties.request.properties.policy.additionalProperties, false);
  assert.equal(reviewerSchema('X').properties.request.properties.author.additionalProperties, false);
  validateWaivers([{ phase: 'draft', input_sha256: req.input_sha256, legs: ['S', 'X'], actor: 'user', reason: 'explicit waiver', at: '2026-07-12T00:00:00-03:00' }], 'draft', req.input_sha256);
  expectThrow('duplicate waiver', () => validateWaivers([
    { phase: 'draft', input_sha256: req.input_sha256, legs: ['X'], actor: 'user', reason: 'one', at: '2026-07-12T00:00:00-03:00' },
    { phase: 'draft', input_sha256: req.input_sha256, legs: ['X'], actor: 'user', reason: 'two', at: '2026-07-12T00:00:00-03:00' },
  ], 'draft', req.input_sha256), /duplicate/);
  const raw = (leg) => ({ schema: 1, leg, request: req, result: 'unavailable_auth', attempts: [], selected: null, reviewer_output: null, findings: [], findings_sha256: null, severity_totals: { high: 0, medium: 0, low: 0 }, waiver: null, waiver_sha256: null, decision_evidence: null, reason: 'authentication unavailable' });
  const persisted = (leg) => ({ request: req, raw: raw(leg), reconciliation: { accepted: [], rejected: [] } });
  const receipt = { schema: 1, phase: 'draft', request: req, input_sha256: req.input_sha256, reviewed_commit: req.reviewed_commit_or_head, author: req.author, policy: req.policy, policy_sha256: req.policy_sha256, X: persisted('X'), S: persisted('S'), reproduced: [], decision_evidence: zeroDecision(req), outcome: 'blocked', pre_execution_eligible: false, reviewed_at: '2026-07-12T00:00:00-03:00' };
  validateDraftReceipt(receipt, req.input_sha256);
  expectThrow('malformed receipt extra key', () => validateDraftReceipt({ ...receipt, unauthorized_extra: true }, req.input_sha256), /unknown key/);
  expectThrow('stale receipt input', () => validateDraftReceipt(receipt, 'f'.repeat(64)), /stale/);
  console.log('schema closure goldens passed');
}

function testAdversarialValidators() {
  const req = request(); const X = rawPassed(req, 'X'); const S = rawPassed(req, 'S');
  validateRawLeg(X, req, 'X'); validateRawLeg(S, req, 'S');
  assert.equal(X.findings_sha256, sha256(jcs([])), 'passed empty findings hash is SHA(JCS([]))');

  const fallback = rawPassed(req, 'X', [
    attempt({ model: 'fable', effort: 'high', output_started: false, result: 'model_unavailable', exit_code: 1, reason: 'not entitled' }),
    attempt({ model: 'opus', effort: 'max', child_id: 'child-2' }),
  ]); validateRawLeg(fallback, req, 'X');
  const retry = rawPassed(req, 'S', [
    attempt({ output_started: false, result: 'transient_transport', exit_code: null, retry_cause: 'transport_ECONNRESET', reason: 'connection reset' }),
    attempt({ child_id: 'child-2' }),
  ]); validateRawLeg(retry, req, 'S');
  const transportPolicy = { ...POLICY, anthropic_tiers: [
    { model: 'fable', effort: 'high', transports: ['cli'] },
    { model: 'opus', effort: 'max', transports: ['in_session'] },
  ] };
  const transportReq = request({ policy: transportPolicy });
  const transportExhausted = { ...rawAuth(transportReq, 'X'), result: 'unavailable_model', attempts: [attempt({ model: 'fable', effort: 'high', output_started: false, result: 'model_unavailable', exit_code: 1, reason: 'not entitled' })], reason: 'all CLI tiers exhausted' };
  validateRawLeg(transportExhausted, transportReq, 'X');
  const platform = { ...rawAuth(req, 'X'), result: 'platform_denied', attempts: [attempt({ model: 'fable', effort: 'high', started: false, output_started: false, result: 'platform_denied', exit_code: null, child_id: null, denial_source: 'sandbox', timeout_mode: null, reason: 'host denied export', stdout_sha256: null, stderr_sha256: null })], reason: 'host denied export' }; validateRawLeg(platform, req, 'X');

  const dual = { schema: 1, kind: 'draft', request: req, X, S, reproduced: [], decision_evidence: null, outcome: 'dual', pre_execution_eligible: true }; validateDraftRunResult(dual);
  const single = { ...dual, S: rawAuth(req, 'S'), outcome: 'single' }; validateDraftRunResult(single);
  const proceedPolicy = { ...POLICY, zero_reviewer_policy: 'proceed' }; const proceedReq = request({ policy: proceedPolicy });
  validateDraftRunResult({ schema: 1, kind: 'draft', request: proceedReq, X: rawAuth(proceedReq, 'X'), S: rawAuth(proceedReq, 'S'), reproduced: [], decision_evidence: null, outcome: 'zero_degraded', pre_execution_eligible: true });
  const blockPolicy = { ...POLICY, zero_reviewer_policy: 'block' }; const blockReq = request({ policy: blockPolicy });
  validateDraftRunResult({ schema: 1, kind: 'draft', request: blockReq, X: rawAuth(blockReq, 'X'), S: rawAuth(blockReq, 'S'), reproduced: [], decision_evidence: null, outcome: 'blocked', pre_execution_eligible: false });
  validateDraftRunResult({ schema: 1, kind: 'draft', request: req, X: rawAuth(req, 'X'), S: rawAuth(req, 'S'), reproduced: [], decision_evidence: zeroDecision(req, 'proceed'), outcome: 'zero_degraded', pre_execution_eligible: true });
  validateDraftRunResult({ schema: 1, kind: 'draft', request: req, X: rawAuth(req, 'X'), S: rawAuth(req, 'S'), reproduced: [], decision_evidence: zeroDecision(req, 'block'), outcome: 'blocked', pre_execution_eligible: false });

  const neverPolicy = { ...POLICY, cross_company_consent: 'never' }; const neverReq = request({ policy: neverPolicy });
  const notAuthorized = { ...rawAuth(neverReq, 'X'), result: 'not_authorized', reason: null };
  validateDraftRunResult({ schema: 1, kind: 'draft', request: neverReq, X: notAuthorized, S: rawPassed(neverReq, 'S'), reproduced: [], decision_evidence: null, outcome: 'single', pre_execution_eligible: true });
  const askPolicy = { ...POLICY, cross_company_consent: 'ask' }; const askReq = request({ policy: askPolicy });
  const denied = { ...rawAuth(askReq, 'X'), result: 'not_authorized', decision_evidence: consentDecision(askReq, 'deny'), reason: null };
  validateDraftRunResult({ schema: 1, kind: 'draft', request: askReq, X: denied, S: rawPassed(askReq, 'S'), reproduced: [], decision_evidence: null, outcome: 'single', pre_execution_eligible: true });

  const waiver = { phase: 'draft', input_sha256: req.input_sha256, legs: ['X', 'S'], actor: 'test user', reason: 'explicit scoped waiver', at: '2026-07-12T00:00:00-03:00' };
  const waived = (leg) => ({ schema: 1, leg, request: req, result: 'waived', attempts: [], selected: null, reviewer_output: null, findings: [], findings_sha256: null, severity_totals: { high: 0, medium: 0, low: 0 }, waiver, waiver_sha256: sha256(jcs(waiver)), decision_evidence: null, reason: null });
  validateDraftRunResult({ schema: 1, kind: 'draft', request: req, X: waived('X'), S: waived('S'), reproduced: [], decision_evidence: zeroDecision(req), outcome: 'blocked', pre_execution_eligible: false }, { waivers: [waiver] });

  const completionReq = request({ phase: 'completion', lifecycle_intent: 'none' }); const completionX = rawPassed(completionReq, 'X'); const completionS = rawPassed(completionReq, 'S');
  const completion = { schema: 1, kind: 'completion', request: completionReq, plan_input_sha256: completionReq.input_sha256, diff_sha256: H0, X: completionX, S: completionS, reproduced: [], decision_evidence: null, outcome: 'dual', primary: primaryEvidence(), completion_verdict: 'passed' };
  validateCompletionRunResult(completion);
  const receipt = { schema: 1, phase: 'completion', request: completionReq, planned_at_commit: '3'.repeat(40), reviewed_head: completionReq.reviewed_commit_or_head, diff_sha256: H0, plan_input_sha256: completionReq.input_sha256, author: completionReq.author, policy: completionReq.policy, policy_sha256: completionReq.policy_sha256, X: persisted(completionX), S: persisted(completionS), reproduced: [], decision_evidence: null, primary: completion.primary, completion_verdict: 'passed', outcome: 'dual', reviewed_at: '2026-07-12T00:00:00-03:00' };
  validateCompletionReceipt(receipt, { reviewed_head: completionReq.reviewed_commit_or_head, diff_sha256: H0, plan_input_sha256: completionReq.input_sha256, review_status: 'passed' });

  expectThrow('unstarted passed attempt', () => validateRawLeg({ ...X, attempts: [{ ...X.attempts[0], started: false, child_id: null, stdout_sha256: null, stderr_sha256: null }] }, req, 'X'), /unstarted|passed attempt/);
  expectThrow('started missing timeout', () => validateRawLeg({ ...X, attempts: [{ ...X.attempts[0], timeout_mode: null }] }, req, 'X'), /timeout mode/);
  expectThrow('passed exit and signal contradiction', () => validateRawLeg({ ...X, attempts: [{ ...X.attempts[0], exit_code: 9, signal: 'SIGKILL' }] }, req, 'X'), /passed attempt/);
  expectThrow('transient after output', () => validateRawLeg({ ...retry, attempts: [{ ...retry.attempts[0], output_started: true }, retry.attempts[1]] }, req, 'S'), /transient attempt/);
  expectThrow('platform without denial source', () => validateRawLeg({ ...platform, attempts: [{ ...platform.attempts[0], denial_source: null }] }, req, 'X'), /platform denial/);
  expectThrow('wrong company tier', () => validateRawLeg({ ...S, attempts: [{ ...S.attempts[0], model: 'fable', effort: 'high' }], selected: { model: 'fable', effort: 'high', transport: 'cli' } }, req, 'S'), /tier order/);
  expectThrow('transport switch', () => validateRawLeg({ ...fallback, attempts: [fallback.attempts[0], { ...fallback.attempts[1], transport: 'in_session' }], selected: { ...fallback.selected, transport: 'in_session' } }, req, 'X'), /transport changed/);
  expectThrow('tier skip', () => validateRawLeg({ ...fallback, attempts: [{ ...fallback.attempts[0], model: 'opus', effort: 'max' }, fallback.attempts[1]] }, req, 'X'), /tier order/);
  expectThrow('retry changed tuple', () => validateRawLeg({ ...retry, attempts: [retry.attempts[0], { ...retry.attempts[1], model: 'fable', effort: 'high' }], selected: { ...retry.selected, model: 'fable', effort: 'high' } }, req, 'S'), /tier order/);
  expectThrow('second transient retry', () => validateRawLeg({ ...retry, attempts: [retry.attempts[0], { ...retry.attempts[0], child_id: 'child-2' }, retry.attempts[1]] }, req, 'S'), /attempt bound|invalid transient retry/);
  expectThrow('attempt after terminal', () => validateRawLeg({ ...X, attempts: [...X.attempts, X.attempts[0]] }, req, 'X'), /attempt bound|terminal/);
  expectThrow('selected mismatch', () => validateRawLeg({ ...X, selected: { ...X.selected, model: 'wrong' } }, req, 'X'), /invalid passed leg/);
  expectThrow('raw result mismatch', () => validateRawLeg({ ...X, result: 'timed_out', selected: null, findings_sha256: null, reason: 'claimed timeout' }, req, 'X'), /non-passed leg carries findings|non-passed leg cannot select reviewer output|leg result mismatch/);
  expectThrow('S not authorized', () => validateRawLeg({ ...rawAuth(req, 'S'), result: 'not_authorized', reason: null }, req, 'S'), /invalid not_authorized/);
  expectThrow('always not authorized', () => validateRawLeg({ ...rawAuth(req, 'X'), result: 'not_authorized', reason: null }, req, 'X'), /standing consent/);
  expectThrow('ask X attempt without allow', () => validateRawLeg({ ...rawPassed(askReq, 'X'), decision_evidence: null }, askReq, 'X'), /decision must|Cannot read|requires allow|must be an object/);
  expectThrow('never X attempt', () => validateRawLeg(rawPassed(neverReq, 'X'), neverReq, 'X'), /cannot run/);
  const earlyUnavailable = { ...rawAuth(req, 'X'), result: 'unavailable_model', attempts: [attempt({ model: 'fable', effort: 'high', output_started: false, result: 'model_unavailable', exit_code: 1, reason: 'not entitled' })], reason: 'claimed exhausted' };
  expectThrow('unavailable model before tier exhaustion', () => validateRawLeg(earlyUnavailable, req, 'X'), /leg result mismatch/);
  expectThrow('stale waiver snapshot', () => validateDraftRunResult({ schema: 1, kind: 'draft', request: req, X: waived('X'), S: waived('S'), reproduced: [], decision_evidence: zeroDecision(req), outcome: 'blocked', pre_execution_eligible: false }, { waivers: [] }), /exact current snapshot/);
  expectThrow('waiver hash mismatch', () => validateDraftRunResult({ schema: 1, kind: 'draft', request: req, X: { ...waived('X'), waiver_sha256: H0 }, S: waived('S'), reproduced: [], decision_evidence: zeroDecision(req), outcome: 'blocked', pre_execution_eligible: false }, { waivers: [waiver] }), /waiver hash/);
  expectThrow('dual with one pass', () => validateDraftRunResult({ ...dual, S: rawAuth(req, 'S') }), /outcome mismatch/);
  expectThrow('zero decision on dual', () => validateDraftRunResult({ ...dual, decision_evidence: zeroDecision(req) }), /cannot carry/);
  expectThrow('opposite eligibility', () => validateDraftRunResult({ ...dual, pre_execution_eligible: false }), /eligible mismatch/);
  const notReadyX = rawPassed(req, 'X', null, [], { verdict: 'not_ready', score: 0, confirmations: ['blocking verdict'] });
  expectThrow('not-ready reviewer cannot authorize execution', () => validateDraftRunResult({ ...dual, X: notReadyX }), /eligible mismatch/);
  expectThrow('structured reviewer output hash mismatch', () => validateRawLeg({ ...X, reviewer_output: { ...X.reviewer_output, structured_output_sha256: H0 } }, req, 'X'), /structured output hash/);
  expectThrow('draft kind mismatch', () => validateDraftRunResult({ ...dual, kind: 'completion' }), /draft run kind/);
  expectThrow('X and S swapped', () => validateDraftRunResult({ ...dual, X: S, S: X }), /raw leg request mismatch/);
  const invented = { id: 'X99', source: 'X', severity: 'high', path: null, locator: null, defect: 'invented', fix: 'none', reproduction: { method: 'read', command: null, exit_code: null, evidence_sha256: H0 } };
  expectThrow('invented reproduced id', () => validateDraftRunResult({ ...dual, reproduced: [invented] }), /not present/);
  expectThrow('completion plan hash mismatch', () => validateCompletionRunResult({ ...completion, plan_input_sha256: H0 }), /plan input mismatch/);
  expectThrow('passing CI failure line', () => validateCompletionRunResult({ ...completion, primary: { ...completion.primary, ci: { ...completion.primary.ci, first_failure: 'should be null' } } }), /passing CI/);
  const failingPrimary = { ...primaryEvidence(), goal_met: 'no', acceptance: [{ ...primaryEvidence().acceptance[0], exit_code: 1, met: false }], ci: { ...primaryEvidence().ci, exit_code: 1, first_failure: 'test failed' }, regressions: ['blocking regression'] };
  assert.equal(deriveCompletionVerdict(failingPrimary), 'regressed');
  expectThrow('failing primary cannot claim passed completion verdict', () => validateCompletionReceipt({ ...receipt, primary: failingPrimary }, { review_status: 'passed' }), /completion verdict mismatch/);
  const regressedReceipt = { ...receipt, primary: failingPrimary, completion_verdict: 'regressed' };
  expectThrow('regressed receipt cannot match passed review_status', () => validateCompletionReceipt(regressedReceipt, { review_status: 'passed' }), /review_status mismatch/);
  expectThrow('stale completion receipt', () => validateCompletionReceipt(receipt, { diff_sha256: H1 }), /stale completion/);
  expectThrow('completion author mismatch', () => validateCompletionReceipt({ ...receipt, author: { ...receipt.author, company: 'anthropic' } }), /author mismatch/);
  expectThrow('completion receipt extra key', () => validateCompletionReceipt({ ...receipt, extra: true }), /unknown key/);

  const finding = { id: 'X1', severity: 'high', section: 'Goal', path: 'src/a.js', locator: 'symbol', defect: 'broken', fix: 'repair', evidence: 'source' };
  const XFinding = rawPassed(req, 'X', null, [finding]); const accepted = persisted(XFinding, ['X1']);
  const acceptedReceipt = { schema: 1, phase: 'draft', request: req, input_sha256: req.input_sha256, reviewed_commit: req.reviewed_commit_or_head, author: req.author, policy: req.policy, policy_sha256: req.policy_sha256, X: accepted, S: persisted(S), reproduced: [], decision_evidence: null, outcome: 'dual', pre_execution_eligible: true, reviewed_at: '2026-07-12T00:00:00-03:00' };
  expectThrow('accepted unreproduced finding', () => validateDraftReceipt(acceptedReceipt, req.input_sha256), /not reproduced/);
  console.log('semantic: not_ready verdict and structured-output hash cannot authorize execution');
  console.log('semantic: derived completion verdict rejects failing primary evidence and mismatched review_status');
  console.log('semantic adversarial attempt, ledger, consent, outcome, run, reproduction, and receipt validators passed');
}

function testBundle() {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'review-policy-bundle-'));
  const repo = path.join(temp, 'repo'); const out = path.join(temp, 'bundle');
  fs.mkdirSync(path.join(repo, 'docs/plans/active'), { recursive: true }); fs.mkdirSync(path.join(repo, 'src'));
  fs.copyFileSync(FIXTURE, path.join(repo, 'docs/plans/active/sample.md')); fs.writeFileSync(path.join(repo, 'src/example.js'), 'export const example = true;\n'); fs.symlinkSync('example.js', path.join(repo, 'src/example-link.js'));
  git(repo, ['init', '-q']); git(repo, ['config', 'user.email', 'policy@example.test']); git(repo, ['config', 'user.name', 'Policy Test']); git(repo, ['add', '.']); git(repo, ['commit', '-qm', 'fixture']); const head = git(repo, ['rev-parse', 'HEAD']);
  fs.writeFileSync(path.join(repo, 'src/example.js'), 'uncommitted moving bytes\n');
  const sealed = sealBundle({ repo, reviewedCommit: head, planPath: 'docs/plans/active/sample.md', requestedPaths: ['src', 'missing.txt'], outDir: out });
  assert.match(sealed.bundle_sha256, /^[0-9a-f]{64}$/); assert.equal(sealed.manifest.requested.find((row) => row.path === 'missing.txt').state, 'absent');
  assert.equal(sealed.manifest.files.find((row) => row.path === 'src/example-link.js').mode, '120000');
  assert.equal(fs.readFileSync(path.join(out, 'src/example.js'), 'utf8'), 'export const example = true;\n', 'bundle reads reviewed commit, not moving worktree');
  assert.ok(fs.existsSync(path.join(out, 'reviewer-output.X.schema.json'))); assert.ok(fs.existsSync(path.join(out, 'reviewer-output.S.schema.json')));
  assert.match(fs.readFileSync(path.join(out, 'reviewer-output.S.schema.json'), 'utf8'), /\^S/);
  expectThrow('nonexistent reviewed commit', () => sealBundle({ repo, reviewedCommit: 'f'.repeat(40), planPath: 'docs/plans/active/sample.md', requestedPaths: [], outDir: path.join(temp, 'bad') }), /git rev-parse/);
  git(repo, ['update-index', '--add', '--cacheinfo', `160000,${head},vendor/sub`]); git(repo, ['commit', '-qm', 'submodule fixture']); const submoduleHead = git(repo, ['rev-parse', 'HEAD']);
  expectThrow('submodule tree entry', () => sealBundle({ repo, reviewedCommit: submoduleHead, planPath: 'docs/plans/active/sample.md', requestedPaths: ['vendor'], outDir: path.join(temp, 'submodule-bundle') }), /submodule is unsupported/);
  assert.equal(fs.existsSync(path.join(temp, 'submodule-bundle')), false, 'failed seal leaves no partial bundle');
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
  const openAiAuthorS = buildReviewerArgv({ tool: 'codex', bundle: '/tmp/bundle', model: 'gpt-5.6-sol', effort: 'xhigh', leg: 'S', request: req });
  assert.equal(openAiAuthorS[openAiAuthorS.indexOf('--output-schema') + 1], '/tmp/bundle/reviewer-output.S.schema.json', 'OpenAI-author S Codex uses S schema');
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
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'review-policy-lifecycle-')); const original = path.join(temp, 'original'); const verifyRoot = '/tmp/docks-plan-verify'; const requestId = randomUUID();
  fs.mkdirSync(original); git(original, ['init', '-q']); git(original, ['config', 'user.email', 'policy@example.test']); git(original, ['config', 'user.name', 'Policy Test']);
  fs.writeFileSync(path.join(original, '.gitignore'), 'ignored-cache\n'); fs.writeFileSync(path.join(original, 'result.txt'), 'original\n'); fs.writeFileSync(path.join(original, 'ignored-cache'), 'ignored original\n');
  git(original, ['add', '.gitignore', 'result.txt']); git(original, ['commit', '-qm', 'fixture']); const head = git(original, ['rev-parse', 'HEAD']);
  const arbitraryPrepare = helper(temp, ['completion-prepare', original, head, path.join(temp, 'arbitrary-root'), requestId]); assert.notEqual(arbitraryPrepare.status, 0); assert.match(arbitraryPrepare.stderr, /accepts repo reviewedHead requestId only/);
  const prepareResult = helper(temp, ['completion-prepare', original, head, requestId]); assert.equal(prepareResult.status, 0, prepareResult.stderr); const prepared = JSON.parse(prepareResult.stdout);
  assert.equal(prepared.checkout, path.join(verifyRoot, requestId)); assert.equal(git(prepared.checkout, ['rev-parse', 'HEAD']), head);
  fs.writeFileSync(path.join(prepared.checkout, 'ci-artifact.txt'), 'disposable only\n');
  const sentinel = path.join(prepared.checkout, '.docks-plan-verify-sentinel'); const sentinelBytes = fs.readFileSync(sentinel); fs.rmSync(sentinel);
  const preparedPath = path.join(temp, 'prepared.json'); fs.writeFileSync(preparedPath, JSON.stringify(prepared));
  const missingSentinel = helper(temp, ['completion-cleanup', original, requestId, preparedPath]); assert.notEqual(missingSentinel.status, 0); assert.match(missingSentinel.stderr, /sentinel missing/);
  fs.writeFileSync(sentinel, sentinelBytes); fs.writeFileSync(path.join(original, 'ignored-cache'), 'mutated ignored content\n');
  const ignoredMutation = helper(temp, ['completion-cleanup', original, requestId, preparedPath]); assert.notEqual(ignoredMutation.status, 0); assert.match(ignoredMutation.stderr, /original repository changed/);
  fs.writeFileSync(path.join(original, 'ignored-cache'), 'ignored original\n');
  const forged = { ...prepared, cleanup_token: H0 }; const forgedPath = path.join(temp, 'forged.json'); fs.writeFileSync(forgedPath, JSON.stringify(forged));
  const forgedCleanup = helper(temp, ['completion-cleanup', original, requestId, forgedPath]); assert.notEqual(forgedCleanup.status, 0); assert.match(forgedCleanup.stderr, /sentinel mismatch/);
  const cleanupResult = helper(temp, ['completion-cleanup', original, requestId, preparedPath]); assert.equal(cleanupResult.status, 0, cleanupResult.stderr); const cleaned = JSON.parse(cleanupResult.stdout);
  assert.equal(cleaned.removed, true); assert.equal(fs.existsSync(prepared.checkout), false);
  const escaped = helper(temp, ['completion-cleanup', original, '../escape', preparedPath]); assert.notEqual(escaped.status, 0); assert.match(escaped.stderr, /prepared completion identity mismatch|request id/);
  fs.rmSync(temp, { recursive: true, force: true });
  console.log('lifecycle: planned/scheduled preservation, start/fire/auto gating and one-intent consumption passed');
  console.log('lifecycle: git clone --no-local disposable CI and complete original repo+.git digest passed');
  console.log('cleanup: canonical root and prepare identity reject arbitrary roots and forged tokens');
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
  for (const marker of ['Publishing a plan as a GitHub issue', '--issues', 'gh auth status', 'gh repo view --json visibility', 'gh issue create']) assert.match(skill, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `plan-manager lost publishing operation: ${marker}`);
  for (const file of ['plugins/docks/agents/plan-manager.md', '.codex/agents/plan-manager.toml', 'docs/scaffold/templates/codex-plan-manager.toml.template', 'plugins/docks/skills/productivity/plan-init/references/codex-agent-templates.md', 'docs/scaffold/templates/root-AGENTS.md.template']) {
    const text = fs.readFileSync(path.join(ROOT, file), 'utf8');
    assert.match(text, /NeedsMainReviewDispatch|sole public reviewer dispatcher/i, `${file} missing main handback`);
    assert.match(text, /Never launch X\/S|Review dispatch always returns to main/i, `${file} permits wrapper dispatch`);
  }
  console.log('plan-manager GitHub issue publishing operation preservation passed');
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
  const rawLeg = (leg) => ({ schema: 1, leg, request: req, result: 'unavailable_auth', attempts: [], selected: null, reviewer_output: null, findings: [], findings_sha256: null, severity_totals: { high: 0, medium: 0, low: 0 }, waiver: null, waiver_sha256: null, decision_evidence: null, reason: 'synthetic helper conformance only' });
  const persisted = (leg) => ({ request: req, raw: rawLeg(leg), reconciliation: { accepted: [], rejected: [] } });
  validateDraftReceipt({ schema: 1, phase: 'draft', request: req, input_sha256: input, reviewed_commit: req.reviewed_commit_or_head, author: req.author, policy: req.policy, policy_sha256: req.policy_sha256, X: persisted('X'), S: persisted('S'), reproduced: [], decision_evidence: zeroDecision(req), outcome: 'blocked', pre_execution_eligible: false, reviewed_at: '2026-07-12T00:00:00-03:00' }, input);
  console.log('self-demo: bootstrap commit/blob/findings/degraded-S and record-only canonical invariant passed');
  console.log('self-demo: new-helper synthetic conformance receipt validates current implementation input and is not pre-gating proof');
}

const args = process.argv.slice(2);
try {
  if (args[0] === '--case' && args[1] === 'legs') testLegs();
  else if (args[0] === '--case' && args[1] === 'lifecycle') testLifecycle();
  else if (args[0] === '--case' && args[1] === 'self-demo') testSelfDemo(args[2]);
  else if (args[0] === '--case' && args[1] === 'adversarial') testAdversarialValidators();
  else {
    testCanonical(); testSchemas(); testAdversarialValidators(); testBundle(); testLegs(); testLifecycle(); testConsumer(); testContractSurfaces(); testReviewRunnerSurfaces(); testManagerSurfaces(); testRelayBoundary();
    console.log('plan-review-policy contract passed');
  }
} catch (error) {
  console.error(error.stack || error.message); process.exitCode = 1;
}
