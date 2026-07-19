#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as reviewPolicy from '../../plugins/docks/skills/productivity/plan-reviewer/scripts/review-policy.mjs';
import {
  acceptanceInventory, applyCompletionReviewBlock, applyLifecycleState,
  buildExecutionBaseCompatibilityApplication, buildImplementerRelayArgv, buildReviewerArgv,
  canonicalPlanView, classifyLeg, completionReviewBlockV1, completionStablePlanViewV1, deriveCompletionVerdict,
  extractReviewerOutput, jcs, LEGACY_START_TRANSITION_COMPATIBILITY_POLICY, LEGACY_START_TRANSITION_COMPATIBILITY_POLICY_SHA256, parsePlan,
  renderCompatibilityReviewAttribution, renderCompletionReviewBlock, reviewerSchema, sealBundle, sha256,
  validateCompletionReceipt, validateCompletionReviewReuse, validateCompletionRunResult,
  validateDraftReceipt, validateDraftReviewReuse, validateDraftRunResult, validatePolicy, validateRawLeg, validateRequest,
  validateExecutionRange, validateExecutionScope, validateReviewerOutput, validateWaivers,
  validateWorkflowModelRecord, verifyBundle,
} from '../../plugins/docks/skills/productivity/plan-reviewer/scripts/review-policy.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const HARNESS = fileURLToPath(import.meta.url);
const FIXTURE = path.join(ROOT, 'scripts/tests/fixtures/plan-review-policy/sample-plan.md');
const HELPER = path.join(ROOT, 'plugins/docks/skills/productivity/plan-reviewer/scripts/review-policy.mjs');
const POLICY = {
  schema: 1,
  cross_company_consent: 'always',
  zero_reviewer_policy: 'ask',
  orchestrator_preference: 'auto',
  openai_tiers: [{ model: 'gpt-5.6-sol', effort: 'xhigh', transports: ['in_session', 'cli'] }],
  anthropic_tiers: [{ model: 'fable', effort: 'high', transports: ['in_session', 'cli'] }, { model: 'opus', effort: 'max', transports: ['in_session', 'cli'] }],
  provenance: { cross_company_consent: 'runtime_global', zero_reviewer_policy: 'skill_default', orchestrator_preference: 'skill_default', openai_tiers: 'skill_default', anthropic_tiers: 'skill_default' },
};
const POLICY_V2 = {
  schema: 2,
  cross_company_consent: 'always',
  zero_reviewer_policy: 'ask',
  orchestrator_preference: 'auto',
  minimum_score: 90,
  max_rounds: 3,
  openai_tiers: [{ model: 'gpt-5.6-sol', effort: 'xhigh', transports: ['in_session', 'cli'] }],
  anthropic_tiers: [{ model: 'fable', effort: 'high', transports: ['in_session', 'cli'] }, { model: 'opus', effort: 'xhigh', transports: ['in_session', 'cli'] }],
  provenance: { cross_company_consent: 'runtime_global', zero_reviewer_policy: 'skill_default', orchestrator_preference: 'skill_default', minimum_score: 'runtime_global', max_rounds: 'runtime_global', openai_tiers: 'runtime_global', anthropic_tiers: 'runtime_global' },
};
const POLICY_V3 = {
  schema: 3,
  cross_company_consent: 'always',
  zero_reviewer_policy: 'ask',
  orchestrator_preference: 'auto',
  minimum_score: 90,
  max_rounds: 3,
  openai_tiers: [
    { model: 'gpt-5.6-sol', effort: 'high', service_tier: 'fast', transports: ['cli'] },
    { model: 'gpt-5.6-sol', effort: 'high', service_tier: 'default', transports: ['cli'] },
  ],
  anthropic_tiers: [{ model: 'fable', effort: 'high', transports: ['in_session', 'cli'] }],
  provenance: { cross_company_consent: 'runtime_global', zero_reviewer_policy: 'skill_default', orchestrator_preference: 'skill_default', minimum_score: 'runtime_global', max_rounds: 'runtime_global', openai_tiers: 'runtime_global', anthropic_tiers: 'runtime_global' },
};
const POLICY_V4 = {
  schema: 4,
  cross_company_consent: 'always',
  zero_reviewer_policy: 'ask',
  orchestrator_preference: 'auto',
  minimum_score: 90,
  max_rounds: 5,
  openai_tiers: [{ model: 'gpt-5.6-sol', effort: 'high', service_tier: 'default', transports: ['cli'] }],
  anthropic_tiers: [{ model: 'fable', effort: 'high', transports: ['in_session', 'cli'] }],
  provenance: { cross_company_consent: 'runtime_global', zero_reviewer_policy: 'skill_default', orchestrator_preference: 'skill_default', minimum_score: 'runtime_global', max_rounds: 'skill_default', openai_tiers: 'runtime_global', anthropic_tiers: 'runtime_global' },
};

function request(overrides = {}) {
  const policy = overrides.policy || POLICY;
  return {
    schema: 1,
    request_id: '123e4567-e89b-42d3-a456-426614174000',
    phase: 'draft',
    lifecycle_intent: 'none',
    reviewed_commit_or_head: '0'.repeat(40),
    planned_at_commit: null,
    execution_base_commit: null,
    diff_sha256: null,
    acceptance_inventory_sha256: null,
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
function requestV3(overrides = {}) {
  const policy = overrides.policy || POLICY_V4;
  return request({
    schema: 3,
    policy,
    policy_sha256: sha256(jcs(policy)),
    review_mode: 'full',
    round_index: 1,
    previous_input_sha256: null,
    repair_targets_sha256: null,
    ...overrides,
  });
}
function unavailableV3(req, leg) {
  return {
    schema: 3, leg, request: req, result: 'unavailable_auth', attempts: [], selected: null, reviewer_output: null,
    findings: [], findings_sha256: null, severity_totals: { high: 0, medium: 0, low: 0 },
    waiver: null, waiver_sha256: null, decision_evidence: null, reason: 'authentication unavailable',
  };
}
function passedV3(req, leg, findings, verdict = 'not_ready', score = 63) {
  const rubric = score === 100
    ? { standalone_executability: 22, actionability: 16, dependency_order: 12, evidence_reverify: 10, goal_coverage: 12, executable_acceptance: 12, failure_mode: 10, assumption_to_question: 6 }
    : { standalone_executability: 12, actionability: 14, dependency_order: 10, evidence_reverify: 7, goal_coverage: 5, executable_acceptance: 6, failure_mode: 4, assumption_to_question: 5 };
  const tier = req.policy.openai_tiers[0];
  const ledger = [attempt({ schema: 3, model: tier.model, effort: tier.effort, service_tier: tier.service_tier })];
  const structured = { schema: 3, leg, request: req, verdict, score, rubric, findings, confirmations: ['fixture reviewer completed'] };
  return {
    schema: 3, leg, request: req, result: 'passed', attempts: ledger,
    selected: { model: tier.model, effort: tier.effort, service_tier: tier.service_tier, transport: 'cli' },
    reviewer_output: { verdict, score, rubric, confirmations: structured.confirmations, structured_output_sha256: sha256(jcs(structured)) },
    findings, findings_sha256: sha256(jcs(findings)), severity_totals: { high: findings.filter((f) => f.severity === 'high').length, medium: findings.filter((f) => f.severity === 'medium').length, low: findings.filter((f) => f.severity === 'low').length },
    waiver: null, waiver_sha256: null, decision_evidence: null, reason: null,
  };
}
function draftRunV3(req) {
  return {
    schema: 3, kind: 'draft', request: req, X: unavailableV3(req, 'X'), S: unavailableV3(req, 'S'),
    reproduced: [], decision_evidence: zeroDecision(req, 'proceed'), outcome: 'zero_degraded', pre_execution_eligible: true,
  };
}
function assertConstrainedScalarsTyped(schema, label = '$') {
  if (!schema || typeof schema !== 'object') return;
  if (Object.hasOwn(schema, 'const')) assert.ok(Object.hasOwn(schema, 'type'), `${label} const requires type`);
  if (Object.hasOwn(schema, 'enum')) assert.ok(Object.hasOwn(schema, 'type'), `${label} enum requires type`);
  for (const [key, value] of Object.entries(schema)) {
    if (Array.isArray(value)) value.forEach((item, index) => assertConstrainedScalarsTyped(item, `${label}.${key}[${index}]`));
    else if (value && typeof value === 'object') assertConstrainedScalarsTyped(value, `${label}.${key}`);
  }
}
function validateReviewSeries(series) {
  assert.equal(typeof reviewPolicy.validateReviewSeries, 'function', 'review-series validator must be exported');
  return reviewPolicy.validateReviewSeries(series);
}
const INVENTORY = acceptanceInventory(fs.readFileSync(FIXTURE));
function primaryEvidence(inventory = INVENTORY) {
  return { goal_met: 'yes', findings: [], acceptance: inventory.criteria.map((criterion) => ({ criterion_id: criterion.id, command: criterion.command, expected: criterion.expected, exit_code: 0, actual_sha256: H0, met: true })), ci: { command: 'node --test', exit_code: 0, first_failure: null, output_sha256: H1 }, regressions: [], followups: [] };
}

const COMPATIBILITY_AUTHORIZATION_ID = 'owner-2026-07-13-remodel-and-review-plan';
const COMPATIBILITY_AUTHORIZATION_SHA256 = '1979e51b8ae33cd1de3af5e820200e1988d56363a9b7af1cae9523c7c20ddc96';
const PRODUCTION_COMPATIBILITY_PLANNED_AT = '12cf2ead208fe932084890b8e3fbd5c72591f3db';
const PRODUCTION_COMPATIBILITY_EXECUTION_BASE = 'de925e9bc046645a72f59bcd493da44d53adaf5a';
const PRODUCTION_COMPATIBILITY_AUTHORIZATION_SCOPE_SHA256 = '1c5cb608957a4589a4ac2bba05f4df29a6255c45034f9b59ecfda36a73327e10';
const RELEASE_AUTHORIZATION_ID = 'owner-2026-07-13-four-release-order-docks-prerequisite';
const RELEASE_AUTHORIZATION_SHA256 = 'f8f38319a72f258dd66d9b31f620cd13ec1968f1d1d169d94e3ebc6b55dde77a';
const TARGET_PLAN = 'docs/plans/active/relay-worker-lifecycle-primitives.md';
const ACTIVE_COMPATIBILITY_PLAN = 'docs/plans/active/legacy-start-transition-compatibility.md';
const FINISHED_COMPATIBILITY_PLAN = 'docs/plans/finished/2026-07-13-legacy-start-transition-compatibility.md';
const POLICY_PATH = 'plugins/docks/skills/productivity/plan-review/scripts/review-policy.mjs';
const RELEASE_VERSION = '1.2.4';
const RELEASE_TAG = `docks--v${RELEASE_VERSION}`;
const PREREQUISITE_MARKER = 'Pending until exact Step-P E/R/B and Docks release/cache verification. In Q, plan-manager replaces only this sentence with one fenced, one-line compact-JCS `DocksCompatibilityPrerequisiteReceiptV1`, changes Step P `planned` to `done`, bumps `updated`, validates the resulting blob, and commits plan-only before final ordinary review F.\n';
const PREREQUISITE_STEP_PLANNED = '| P | Complete the exact Docks-only compatibility prerequisite before any implementation worker resumes: finish/archive the compatibility plan, release/install/cache-verify Docks under the recorded authorization, commit contiguous E/R/B, commit prerequisite closure Q with P `done`, then obtain findings-free final ordinary review F and revalidate the range. | Plan-manager-returned `docs/plans/finished/<date>-legacy-start-transition-compatibility.md` (read-only), `docs/plans/active/relay-worker-lifecycle-primitives.md` (plan-manager-only E/R/B/Q/F writes), `$HOME/.codex/plugins/cache/docks/docks/$RELEASE_VERSION/skills/productivity/plan-review/scripts/review-policy.mjs` (read-only), `$HOME/.claude/plugins/cache/docks/docks/$RELEASE_VERSION/skills/productivity/plan-review/scripts/review-policy.mjs` (read-only) | 1, 3b | planned | The exact Step-P block above passes. Q embeds one valid `DocksCompatibilityPrerequisiteReceiptV1` and changes only its pending sentence, P status, and `updated`; F\'s findings-free `dual|single` receipt reviews Q. The current plan retains exact E material/receipt, immutable R review, B binding, Q prerequisite evidence, and F receipt. Both released cache helpers emit byte-identical schema-1 `LegacyExecutionRangeValidationV1`; only F becomes `PLAN_COMMIT`/`PLAN_BLOB`. Effect Kit and Session Relay versions are unchanged. Any other outcome, stale cache, absent release, E/R/B/Q/F gap, non-plan delta, or authorization mismatch is STOP. P appends no acceptance event or implementation-range receipt. |\n';
const PREREQUISITE_STEP_DONE = PREREQUISITE_STEP_PLANNED.replace(' | planned | The exact Step-P block', ' | done | The exact Step-P block');
const STRICT_CASES = [
  'strict-success', 'path-escape', 'planned-short', 'planned-missing', 'execution-short', 'execution-missing', 'reviewed-short', 'reviewed-missing',
  'planned-to-base-ancestry', 'base-to-head-ancestry', 'base-multi-parent', 'base-extra-path', 'base-plan-missing', 'parent-plan-missing', 'head-plan-missing',
  'base-status', 'base-started-at', 'parent-status', 'parent-started-at', 'canonical-start-drift', 'base-planned-at-identity', 'head-planned-at-identity', 'head-execution-base-identity',
];
const STRICT_CORPUS_SHA256 = 'd87c62456967c5bd54dd0f3b7d564881164dd1fd5217fa00720d6c234bc01fd9';

function replaceOnce(text, before, after, label = before) {
  assert.equal(text.split(before).length - 1, 1, `${label} must occur exactly once`);
  return text.replace(before, after);
}

function fixturePlan({ plannedAt = '0'.repeat(40), executionBase = null, cleanReceipt = false } = {}) {
  let text = fs.readFileSync(FIXTURE, 'utf8');
  text = replaceOnce(text, 'planned_at_commit: "0000000000000000000000000000000000000000"', `planned_at_commit: "${plannedAt}"`, 'fixture planned identity');
  if (executionBase !== null) text = replaceOnce(text, 'execution_base_commit: null', `execution_base_commit: "${executionBase}"`, 'fixture execution identity');
  if (cleanReceipt) text = replaceOnce(text, 'Review-receipt: {"schema":1}\n\n', '', 'fixture placeholder receipt');
  return text;
}

function writeLogical(repo, logical, bytes) {
  const absolute = path.join(repo, logical); fs.mkdirSync(path.dirname(absolute), { recursive: true }); fs.writeFileSync(absolute, bytes);
}

function commitAll(repo, message) {
  git(repo, ['add', '-A']); git(repo, ['commit', '-qm', message]); return git(repo, ['rev-parse', 'HEAD']);
}

function insertBeforeReviewForTest(bytes, markdown) {
  const text = Buffer.from(bytes).toString(); const needle = '\n## Review\n'; const at = text.lastIndexOf(needle); assert.ok(at >= 0, 'Review insertion point');
  return Buffer.from(`${text.slice(0, at + 1)}${markdown}${text.slice(at + 1)}`);
}

function insertOrReplaceDraftReceiptForTest(bytes, receipt, replace = false) {
  let text = Buffer.from(bytes).toString(); const line = `Review-receipt: ${jcs(receipt)}\n`;
  if (replace) text = text.replace(/^Review-receipt: .*\n/m, line);
  else {
    const heading = '\n## Self-review\n'; const at = text.lastIndexOf(heading); assert.ok(at >= 0, 'Self-review receipt insertion');
    text = `${text.slice(0, at + heading.length)}${line}${text.slice(at + heading.length)}`;
  }
  const selfHeading = '\n## Self-review\n'; const selfAt = text.lastIndexOf(selfHeading); const start = selfAt + 1; const end = text.indexOf('\n## Cold-handoff checklist\n', start);
  assert.ok(start >= 0 && end > start, 'Self-review partition boundaries');
  const section = text.slice(start, end + 1); assert.ok(section.endsWith('\n\n'), 'Self-review section ends in two LF');
  const attribution = renderCompatibilityReviewAttribution(receipt);
  return Buffer.from(`${text.slice(0, start)}${section.slice(0, -1)}${attribution}\n${text.slice(end + 1)}`);
}

function findingsFreeDraftReceipt(reviewedCommit, bytes, outcome = 'dual', reviewedAt = '2026-07-13T12:00:00.000Z') {
  const input = sha256(canonicalPlanView(bytes)); const req = request({ reviewed_commit_or_head: reviewedCommit, input_sha256: input });
  const X = rawPassed(req, 'X'); const S = outcome === 'dual' ? rawPassed(req, 'S') : rawAuth(req, 'S');
  return {
    schema: 1, phase: 'draft', request: req, input_sha256: input, reviewed_commit: reviewedCommit,
    author: req.author, policy: req.policy, policy_sha256: req.policy_sha256,
    X: persisted(X), S: persisted(S), reproduced: [], decision_evidence: null,
    outcome, pre_execution_eligible: true, reviewed_at: reviewedAt,
  };
}

function draftReceiptVariant(reviewedCommit, bytes, { verdict = 'ready', findings = [] } = {}) {
  const input = sha256(canonicalPlanView(bytes)); const req = request({ reviewed_commit_or_head: reviewedCommit, input_sha256: input });
  const X = rawPassed(req, 'X', null, findings, { verdict }); const S = rawAuth(req, 'S');
  return {
    schema: 1, phase: 'draft', request: req, input_sha256: input, reviewed_commit: reviewedCommit,
    author: req.author, policy: req.policy, policy_sha256: req.policy_sha256,
    X: persisted(X), S: persisted(S), reproduced: [], decision_evidence: null,
    outcome: 'single', pre_execution_eligible: verdict === 'ready', reviewed_at: '2026-07-13T12:30:00.000Z',
  };
}

function completionReceiptFor(reviewedHead, bytes, { X = null, S = null, reproduced = [], primary = null, verdict = 'passed', outcome = 'dual', reviewedAt = '2026-07-13T13:00:00.000Z', policy = POLICY } = {}) {
  const inventory = acceptanceInventory(bytes); const input = sha256(canonicalPlanView(bytes));
  const req = request({ policy, phase: 'completion', reviewed_commit_or_head: reviewedHead, planned_at_commit: reviewedHead, execution_base_commit: reviewedHead, diff_sha256: H0, acceptance_inventory_sha256: sha256(jcs(inventory)), input_sha256: input });
  const rawX = X ?? rawPassed(req, 'X'); const rawS = S ?? (outcome === 'dual' ? rawPassed(req, 'S') : rawAuth(req, 'S'));
  return {
    schema: 1, phase: 'completion', request: req, planned_at_commit: req.planned_at_commit, execution_base_commit: req.execution_base_commit,
    reviewed_head: reviewedHead, diff_sha256: H0, plan_input_sha256: input, acceptance_inventory: inventory,
    acceptance_inventory_sha256: req.acceptance_inventory_sha256, author: req.author, policy: req.policy, policy_sha256: req.policy_sha256,
    X: persisted(rawX), S: persisted(rawS), reproduced, decision_evidence: null,
    primary: primary ?? primaryEvidence(inventory), completion_verdict: verdict, outcome, reviewed_at: reviewedAt,
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

function makeReadOnly(target) {
  const stat = fs.lstatSync(target);
  if (stat.isDirectory()) {
    for (const name of fs.readdirSync(target)) makeReadOnly(path.join(target, name));
    fs.chmodSync(target, 0o555);
  } else fs.chmodSync(target, 0o444);
}

function testBundleHash(root, manifestBytes, manifest) {
  const hash = createHash('sha256'); hash.update(Buffer.from(String(manifestBytes.length))); hash.update(Buffer.from([0])); hash.update(manifestBytes);
  for (const row of manifest.files) {
    const bytes = fs.readFileSync(path.join(root, row.path)); hash.update(Buffer.from(String(bytes.length))); hash.update(Buffer.from([0])); hash.update(bytes);
  }
  return hash.digest('hex');
}

function copiedResealedBundle(source, target, applyChange) {
  fs.cpSync(source, target, { recursive: true }); makeWritable(target);
  const manifestPath = path.join(target, 'manifest.json'); const manifest = JSON.parse(fs.readFileSync(manifestPath)); applyChange(manifest, target);
  const manifestBytes = Buffer.from(`${jcs(manifest)}\n`); fs.writeFileSync(manifestPath, manifestBytes); makeReadOnly(target);
  return { manifest, bundle_sha256: testBundleHash(target, manifestBytes, manifest) };
}

function testBundleDestruction({ repo, reviewedCommit, outsideBundle, outsideBundleSha256 }) {
  const reviewRoot = '/tmp/docks-plan-review'; const ownedPaths = new Set();
  if (!fs.existsSync(reviewRoot)) fs.mkdirSync(reviewRoot, { mode: 0o700 });
  const rootStat = fs.lstatSync(reviewRoot);
  assert.equal(rootStat.isDirectory() && !rootStat.isSymbolicLink() && fs.realpathSync(reviewRoot) === reviewRoot, true, 'review root is a real directory');
  assert.equal(rootStat.mode & 0o777, 0o700, 'review root is owner-only');
  if (typeof process.getuid === 'function') assert.equal(rootStat.uid, process.getuid(), 'review root is user-owned');
  const seal = () => {
    const bundle = path.join(reviewRoot, randomUUID()); ownedPaths.add(bundle);
    return { bundle, sealed: sealBundle({ repo, reviewedCommit, planPath: 'docs/plans/active/sample.md', requestedPaths: ['src'], outDir: bundle }) };
  };
  const reject = (label, args, pattern) => {
    const result = helper(ROOT, ['destroy-bundle', ...args]);
    assert.notEqual(result.status, 0, `${label} must fail`); assert.match(result.stderr, pattern, label);
  };

  try {
    const witness = path.join(reviewRoot, `${randomUUID()}.adjacent`); ownedPaths.add(witness); fs.writeFileSync(witness, 'keep\n', { mode: 0o600 });
    const valid = seal(); const removed = helper(ROOT, ['destroy-bundle', valid.bundle, valid.sealed.bundle_sha256]);
    assert.equal(removed.status, 0, removed.stderr); assert.deepEqual(JSON.parse(removed.stdout), { schema: 1, bundle_sha256: valid.sealed.bundle_sha256, removed: true });
    assert.equal(fs.existsSync(valid.bundle), false, 'verified bundle removed'); assert.equal(fs.readFileSync(witness, 'utf8'), 'keep\n', 'adjacent file preserved');

    const wrongHash = seal(); reject('expected hash mismatch', [wrongHash.bundle, 'f'.repeat(64)], /bundle hash mismatch/); assert.equal(fs.existsSync(wrongHash.bundle), true, 'hash mismatch preserves bundle');
    fs.chmodSync(path.join(wrongHash.bundle, 'plan.review.md'), 0o644); fs.appendFileSync(path.join(wrongHash.bundle, 'plan.review.md'), 'tamper\n'); fs.chmodSync(path.join(wrongHash.bundle, 'plan.review.md'), 0o444);
    reject('mutated bundle', [wrongHash.bundle, wrongHash.sealed.bundle_sha256], /file hash mismatch|bundle hash mismatch/); assert.equal(fs.existsSync(wrongHash.bundle), true, 'mutation preserves bundle');

    const symlinkTarget = seal(); const symlink = path.join(reviewRoot, randomUUID()); ownedPaths.add(symlink); fs.symlinkSync(symlinkTarget.bundle, symlink);
    reject('symlink bundle', [symlink, symlinkTarget.sealed.bundle_sha256], /symlink|canonical|review bundle path/); assert.equal(fs.existsSync(symlinkTarget.bundle), true, 'symlink rejection preserves target');
    reject('outside review root', [outsideBundle, outsideBundleSha256], /supported temporary review root/); assert.equal(fs.existsSync(outsideBundle), true, 'outside bundle preserved');

    const nonBundle = path.join(reviewRoot, randomUUID()); ownedPaths.add(nonBundle); fs.mkdirSync(nonBundle, { mode: 0o700 }); fs.chmodSync(nonBundle, 0o555);
    reject('non-bundle', [nonBundle, '0'.repeat(64)], /manifest|bundle/); assert.equal(fs.existsSync(nonBundle), true, 'non-bundle preserved');
    reject('review root target', [reviewRoot, '0'.repeat(64)], /root|review bundle path/); reject('filesystem root target', ['/', '0'.repeat(64)], /root|supported temporary review root/);
    reject('home target', [os.homedir(), '0'.repeat(64)], /home|supported temporary review root/);

    if (typeof process.getuid === 'function') {
      const ownership = seal(); const probe = `process.getuid=()=>${process.getuid() + 1};const m=await import(${JSON.stringify(pathToFileURL(HELPER).href)});m.destroyBundle({bundle:process.argv[1],expectedSha256:process.argv[2]});`;
      const result = spawnSync(process.execPath, ['--input-type=module', '--eval', probe, ownership.bundle, ownership.sealed.bundle_sha256], { encoding: 'utf8' });
      assert.notEqual(result.status, 0, 'ownership mismatch must fail'); assert.match(result.stderr, /ownership mismatch/, 'ownership mismatch is explicit'); assert.equal(fs.existsSync(ownership.bundle), true, 'ownership mismatch preserves bundle');
    }
  } finally {
    for (const target of [...ownedPaths].reverse()) {
      let stat; try { stat = fs.lstatSync(target); } catch (error) { if (error.code === 'ENOENT') continue; throw error; }
      if (stat.isSymbolicLink()) fs.unlinkSync(target);
      else { makeWritable(target); fs.rmSync(target, { recursive: true, force: true }); }
    }
  }
}

function git(cwd, args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' }); assert.equal(result.status, 0, `${args.join(' ')}: ${result.stderr}`); return result.stdout.trim();
}

function gitBytes(cwd, args) {
  const result = spawnSync('git', args, { cwd }); assert.equal(result.status, 0, `${args.join(' ')}: ${result.stderr}`); return result.stdout;
}

function helper(cwd, args, helperPath = HELPER) {
  return spawnSync(process.execPath, [helperPath, ...args], { cwd, encoding: 'utf8' });
}

function compatibilityHelperVariant(root, plannedAtCommit, executionBaseCommit) {
  let source = fs.readFileSync(HELPER, 'utf8');
  source = replaceOnce(source, `planned_at_commit: '${PRODUCTION_COMPATIBILITY_PLANNED_AT}'`, `planned_at_commit: '${plannedAtCommit}'`, 'compatibility authorization planned target');
  source = replaceOnce(source, `execution_base_commit: '${PRODUCTION_COMPATIBILITY_EXECUTION_BASE}'`, `execution_base_commit: '${executionBaseCommit}'`, 'compatibility authorization execution target');
  const scope = {
    schema: 1, kind: 'legacy_start_transition_authorization', authorization_id: COMPATIBILITY_AUTHORIZATION_ID,
    decision: 'allow', source: 'current_user', source_text_sha256: COMPATIBILITY_AUTHORIZATION_SHA256,
    target: { schema: 1, plan_path: TARGET_PLAN, planned_at_commit: plannedAtCommit, execution_base_commit: executionBaseCommit },
  };
  source = replaceOnce(source, `const COMPATIBILITY_AUTHORIZATION_SCOPE_SHA256 = '${PRODUCTION_COMPATIBILITY_AUTHORIZATION_SCOPE_SHA256}';`, `const COMPATIBILITY_AUTHORIZATION_SCOPE_SHA256 = '${sha256(jcs(scope))}';`, 'compatibility authorization scope digest');
  const helperPath = path.join(root, 'review-policy-target-variant.mjs'); fs.writeFileSync(helperPath, source);
  return helperPath;
}

function compatibilityHelperJson(helperPath, cwd, args) {
  const result = helper(cwd, args, helperPath);
  if (result.status !== 0) throw new Error(result.stderr.trim());
  assert.equal(result.stderr, '');
  return JSON.parse(result.stdout);
}

function compatibilityEvidence(helperPath, { repo, reviewedHead, planPath, plannedAtCommit, executionBaseCommit, authorizationId = COMPATIBILITY_AUTHORIZATION_ID, ownerMessageSha256 = COMPATIBILITY_AUTHORIZATION_SHA256 }) {
  return compatibilityHelperJson(helperPath, repo, ['compatibility-evidence', repo, reviewedHead, planPath, plannedAtCommit, executionBaseCommit, authorizationId, ownerMessageSha256]);
}

function compatibilityBinding(helperPath, { repo, planPath, evidenceCommit, reviewCommit }) {
  return compatibilityHelperJson(helperPath, repo, ['compatibility-binding', repo, planPath, evidenceCommit, reviewCommit]);
}

function compatibilityRange(helperPath, { repo, planPath, plannedAtCommit, executionBaseCommit, reviewedHead }) {
  return compatibilityHelperJson(helperPath, repo, ['execution-range', repo, reviewedHead, planPath, plannedAtCommit, executionBaseCommit]);
}

function initializeRepository(repo) {
  fs.mkdirSync(repo, { recursive: true }); git(repo, ['init', '-q']); git(repo, ['config', 'user.email', 'policy@example.test']); git(repo, ['config', 'user.name', 'Policy Test']);
}

function versionedJson(name, version) { return `${JSON.stringify({ name, version }, null, 2)}\n`; }

async function buildCompatibilityRepository() {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'review-policy-compatibility-')); const repo = path.join(temp, 'repo'); initializeRepository(repo);
  writeLogical(repo, POLICY_PATH, fs.readFileSync(HELPER));
  writeLogical(repo, 'plugins/docks/.claude-plugin/plugin.json', versionedJson('docks', '1.2.3'));
  writeLogical(repo, 'plugins/docks/.codex-plugin/plugin.json', versionedJson('docks', '1.2.3'));
  writeLogical(repo, 'plugins/effect-kit/.claude-plugin/plugin.json', versionedJson('effect-kit', '0.3.0'));
  writeLogical(repo, 'plugins/effect-kit/.codex-plugin/plugin.json', versionedJson('effect-kit', '0.3.0'));
  writeLogical(repo, 'plugins/session-relay/.claude-plugin/plugin.json', versionedJson('session-relay', '0.10.0'));
  writeLogical(repo, 'plugins/session-relay/.codex-plugin/plugin.json', versionedJson('session-relay', '0.10.0'));
  const marketplace = (version) => `${JSON.stringify({ name: 'docks', plugins: [{ name: 'docks', version }, { name: 'session-relay', version: '0.10.0' }, { name: 'effect-kit', version: '0.3.0' }] }, null, 2)}\n`;
  writeLogical(repo, '.claude-plugin/marketplace.json', marketplace('1.2.3'));
  let activeCompatibility = fixturePlan({ cleanReceipt: true });
  activeCompatibility = replaceOnce(activeCompatibility, 'title: Sample review plan', 'title: Compatibility source plan');
  activeCompatibility = replaceOnce(activeCompatibility, '# Sample review plan', '# Compatibility source plan');
  activeCompatibility = replaceOnce(activeCompatibility, 'status: planned', 'status: in_review');
  activeCompatibility = replaceOnce(activeCompatibility, 'started_at: null', 'started_at: "2026-07-13T08:00:00.000Z"');
  writeLogical(repo, ACTIVE_COMPATIBILITY_PLAN, activeCompatibility);
  const plannedAt = commitAll(repo, 'fixture planned base');

  const legacy = plannedAt.slice(0, 7); let target = fixturePlan({ plannedAt: legacy, cleanReceipt: true });
  target = replaceOnce(target, 'title: Sample review plan', 'title: Relay lifecycle plan'); target = replaceOnce(target, '# Sample review plan', '# Relay lifecycle plan');
  writeLogical(repo, TARGET_PLAN, target); const creationCommit = commitAll(repo, 'create lifecycle plan');

  target = replaceOnce(target, 'status: planned', 'status: ongoing');
  target = replaceOnce(target, 'updated: "2026-07-12T00:00:00-03:00"', 'updated: "2026-07-13T08:10:00.000Z"');
  target = replaceOnce(target, 'started_at: null', 'started_at: "2026-07-13T08:10:00.000Z"');
  target = replaceOnce(target, 'Threat model scope is unresolved.', 'Threat model scope is owner-approved.');
  target = replaceOnce(target, 'Run the fixture before owner resolution.', 'Run the fixture after owner resolution.');
  target = replaceOnce(target, '- `threat-model-scope`: owner decision pending.', '- `threat-model-scope`: owner approved the bounded route.');
  writeLogical(repo, TARGET_PLAN, target); const executionBaseCommit = commitAll(repo, 'start lifecycle plan');

  target = replaceOnce(target, `planned_at_commit: "${legacy}"`, `planned_at_commit: "${plannedAt}"`);
  target = replaceOnce(target, 'execution_base_commit: null', `execution_base_commit: "${executionBaseCommit}"`);
  writeLogical(repo, TARGET_PLAN, target); const identityCommit = commitAll(repo, 'record lifecycle identities');
  const compatibilityHelper = compatibilityHelperVariant(temp, plannedAt, executionBaseCommit);

  const activeBytes = fs.readFileSync(path.join(repo, ACTIVE_COMPATIBILITY_PLAN)); const archiveReceipt = completionReceiptFor(identityCommit, activeBytes);
  validateCompletionReceipt(archiveReceipt, { reviewed_head: identityCommit, plan_input_sha256: sha256(canonicalPlanView(activeBytes)), review_status: 'passed' });
  let archived = applyCompletionReviewBlock(activeBytes, archiveReceipt).toString();
  archived = replaceOnce(archived, 'status: in_review', 'status: finished'); archived = replaceOnce(archived, 'review_status: null', 'review_status: passed');
  fs.rmSync(path.join(repo, ACTIVE_COMPATIBILITY_PLAN)); writeLogical(repo, FINISHED_COMPATIBILITY_PLAN, archived);
  const finishedPlanCommit = commitAll(repo, 'finish compatibility source plan');

  writeLogical(repo, 'plugins/docks/.claude-plugin/plugin.json', versionedJson('docks', RELEASE_VERSION));
  writeLogical(repo, 'plugins/docks/.codex-plugin/plugin.json', versionedJson('docks', RELEASE_VERSION));
  writeLogical(repo, '.claude-plugin/marketplace.json', marketplace(RELEASE_VERSION));
  const releaseCommit = commitAll(repo, 'release docks patch'); git(repo, ['tag', RELEASE_TAG, releaseCommit]);

  const evidenceApplication = compatibilityEvidence(compatibilityHelper, { repo, reviewedHead: releaseCommit, planPath: TARGET_PLAN, plannedAtCommit: plannedAt, executionBaseCommit });
  const evidenceBytes = insertBeforeReviewForTest(fs.readFileSync(path.join(repo, TARGET_PLAN)), evidenceApplication.markdown); writeLogical(repo, TARGET_PLAN, evidenceBytes);
  const evidenceCommit = commitAll(repo, 'apply compatibility evidence');

  const reviewReceipt = findingsFreeDraftReceipt(evidenceCommit, evidenceBytes, 'dual'); const reviewBytes = insertOrReplaceDraftReceiptForTest(evidenceBytes, reviewReceipt);
  writeLogical(repo, TARGET_PLAN, reviewBytes); const compatibilityReviewCommit = commitAll(repo, 'record compatibility review');

  const bindingApplication = compatibilityBinding(compatibilityHelper, { repo, planPath: TARGET_PLAN, evidenceCommit, reviewCommit: compatibilityReviewCommit });
  const bindingBytes = insertBeforeReviewForTest(reviewBytes, bindingApplication.markdown); writeLogical(repo, TARGET_PLAN, bindingBytes);
  const bindingCommit = commitAll(repo, 'bind compatibility review');

  const compatibilityPolicy = await import(`${pathToFileURL(compatibilityHelper).href}?target=${plannedAt}`);
  return {
    temp, repo, plannedAt, creationCommit, executionBaseCommit, identityCommit, finishedPlanCommit, releaseCommit, compatibilityHelper,
    compatibilityPolicy,
    evidenceApplication, evidenceCommit, reviewReceipt, compatibilityReviewCommit, bindingApplication, bindingBytes, bindingCommit,
  };
}

function childResult(stdout = Buffer.alloc(0), stderr = Buffer.alloc(0), overrides = {}) {
  return { status: 0, signal: null, error: null, stdout: Buffer.from(stdout), stderr: Buffer.from(stderr), ...overrides };
}

function prerequisiteDependencies(fixture, { stderrAt = null, tagMode = 'annotated', resultVariant = null, wrongCwd = false, now = '2026-07-13T14:00:00.000Z', home = '/tmp/docks-prerequisite-home', fileVariant = null } = {}) {
  const calls = []; const observationOrder = [];
  const releaseRef = `refs/tags/${RELEASE_TAG}`; const tagObject = 'a'.repeat(40);
  const outputs = {
    remote_main: Buffer.from(`${fixture.releaseCommit}\trefs/heads/main\n`),
    remote_tag: Buffer.from(tagMode === 'lightweight' ? `${fixture.releaseCommit}\t${releaseRef}\n` : `${tagObject}\t${releaseRef}\n${fixture.releaseCommit}\t${releaseRef}^{}\n`),
    github_release: Buffer.from(`${JSON.stringify({ isDraft: false, isPrerelease: false, tagName: RELEASE_TAG, url: `https://github.com/DocksDocks/docks/releases/tag/${RELEASE_TAG}` })}\n`),
    codex_plugin: Buffer.from(`${JSON.stringify({ installed: [{ pluginId: 'other@market', version: '9.9.9' }, { pluginId: 'docks@docks', name: 'docks', marketplaceName: 'docks', version: RELEASE_VERSION, installed: true, enabled: true, source: { source: 'git-subdir', url: 'https://github.com/DocksDocks/docks.git', path: 'plugins/docks', ref: 'main' }, volatile: 'ignored' }] })}\n`),
    claude_plugin: Buffer.from(`${JSON.stringify([{ id: 'other@market' }, { id: 'docks@docks', version: RELEASE_VERSION, scope: 'user', enabled: true, installPath: path.join(home, '.claude/plugins/cache/docks/docks', RELEASE_VERSION), volatile: 'ignored' }])}\n`),
  };
  const classify = (argv) => {
    if (jcs(argv) === jcs(['git', 'ls-remote', '--exit-code', '--branches', 'https://github.com/DocksDocks/docks.git', 'refs/heads/main'])) return 'remote_main';
    if (argv[0] === 'git' && argv[1] === 'ls-remote' && argv[3] === '--tags') return 'remote_tag';
    if (argv[0] === 'gh') return 'github_release'; if (argv[0] === 'codex') return 'codex_plugin'; if (argv[0] === 'claude') return 'claude_plugin'; return null;
  };
  const sourceBytes = gitBytes(fixture.repo, ['show', `${fixture.releaseCommit}:${POLICY_PATH}`]);
  const dependencies = {
    runChild(argv, options) {
      calls.push({ argv: argv.slice(), options: { ...options } });
      if (wrongCwd || jcs(options) !== jcs({ cwd: path.resolve(fixture.repo) })) throw new Error('fixture observed wrong child cwd');
      const label = classify(argv); let result;
      if (label !== null) {
        observationOrder.push(label); result = childResult(outputs[label], stderrAt === label ? Buffer.from(`stderr:${label}\n`) : Buffer.alloc(0));
      } else {
        const child = spawnSync(argv[0], argv.slice(1), { cwd: options.cwd, encoding: 'buffer', shell: false, stdio: ['ignore', 'pipe', 'pipe'], timeout: 30000, killSignal: 'SIGTERM', maxBuffer: 1048576, windowsHide: true });
        result = { status: child.status, signal: child.signal, error: child.error ? { code: child.error.code === undefined ? null : String(child.error.code), message: String(child.error.message) } : null, stdout: Buffer.from(child.stdout ?? ''), stderr: Buffer.from(child.stderr ?? '') };
      }
      return resultVariant ? resultVariant({ argv, label, result, calls, outputs }) : result;
    },
    now: () => now,
    homedir: () => home,
    lstat: (absolutePath) => fileVariant?.lstat ? fileVariant.lstat(absolutePath) : ({ kind: 'file', symbolicLink: false }),
    realpath: (absolutePath) => fileVariant?.realpath ? fileVariant.realpath(absolutePath) : absolutePath,
    readFile: (absolutePath) => fileVariant?.readFile ? fileVariant.readFile(absolutePath, sourceBytes) : Buffer.from(sourceBytes),
  };
  return { dependencies, calls, observationOrder, outputs, sourceBytes, home };
}

function prerequisiteInput(fixture) {
  return {
    repo: fixture.repo, planPath: TARGET_PLAN, finishedPlanPath: FINISHED_COMPATIBILITY_PLAN, finishedPlanCommit: fixture.finishedPlanCommit,
    releaseVersion: RELEASE_VERSION, evidenceCommit: fixture.evidenceCommit, compatibilityReviewCommit: fixture.compatibilityReviewCommit,
    bindingCommit: fixture.bindingCommit, authorizationId: RELEASE_AUTHORIZATION_ID, authorizationSha256: RELEASE_AUTHORIZATION_SHA256,
  };
}

function prerequisiteReceiptFromApplication(application) {
  const match = application.markdown.match(/^```json\n(\{.*\})\n```\n$/s); assert.ok(match, 'prerequisite application fence'); return JSON.parse(match[1]);
}

function legacyShapeCandidate(options = {}) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'review-policy-legacy-shape-')); const repo = path.join(temp, 'repo'); initializeRepository(repo);
  if (options.pathExisted) writeLogical(repo, TARGET_PLAN, fixturePlan({ cleanReceipt: true })); else writeLogical(repo, 'seed.txt', 'seed\n');
  const plannedAt = commitAll(repo, 'legacy planned base');
  if (options.creationParentDrift) { writeLogical(repo, 'intermediate.txt', 'intermediate\n'); commitAll(repo, 'intermediate creation parent'); }
  const legacy = options.fullLegacy ? plannedAt : plannedAt.slice(0, options.shortLength ?? 7); let plan = fixturePlan({ plannedAt: legacy, cleanReceipt: true });
  if (options.duplicateHeadings) plan = replaceOnce(plan, '## Threat model\n', '## Threat model\n\nDuplicate one.\n\n## Threat model\n');
  writeLogical(repo, TARGET_PLAN, plan); if (options.creationExtra) writeLogical(repo, 'creation-extra.txt', 'extra\n'); commitAll(repo, 'legacy plan creation');
  plan = replaceOnce(plan, 'status: planned', 'status: ongoing'); plan = replaceOnce(plan, 'started_at: null', 'started_at: "2026-07-13T08:10:00.000Z"');
  if (!options.noBodyChange) {
    plan = replaceOnce(plan, 'Threat model scope is unresolved.', 'Threat model scope is owner-approved.');
    plan = replaceOnce(plan, 'Run the fixture before owner resolution.', 'Run the fixture after owner resolution.');
    plan = replaceOnce(plan, '- `threat-model-scope`: owner decision pending.', '- `threat-model-scope`: owner approved the bounded route.');
  }
  if (options.protectedChange) plan = replaceOnce(plan, 'Prove canonical policy behavior.\n\n## Interfaces', 'Protected goal changed.\n\n## Interfaces');
  if (options.headingAdded) plan = replaceOnce(plan, '## Self-review\n', '## Added at start\n\nAdded.\n\n## Self-review\n');
  if (options.preambleChange) plan = replaceOnce(plan, '# Sample review plan\n', '# Changed sample review plan\n');
  writeLogical(repo, TARGET_PLAN, plan); if (options.startExtra) writeLogical(repo, 'start-extra.txt', 'extra\n'); const executionBaseCommit = commitAll(repo, 'legacy start');
  if (options.unequalLegacy) plan = replaceOnce(plan, `planned_at_commit: "${legacy}"`, `planned_at_commit: "${plannedAt.slice(0, 8)}"`);
  else plan = replaceOnce(plan, `planned_at_commit: "${legacy}"`, `planned_at_commit: "${plannedAt}"`);
  plan = replaceOnce(plan, 'execution_base_commit: null', `execution_base_commit: "${executionBaseCommit}"`); writeLogical(repo, TARGET_PLAN, plan); const head = commitAll(repo, 'legacy identities');
  const compatibilityHelper = compatibilityHelperVariant(temp, plannedAt, executionBaseCommit);
  return { temp, repo, plannedAt, executionBaseCommit, head, compatibilityHelper };
}

function testLegacyShapeNegatives() {
  for (const [label, options, pattern] of [
    ['planned path already existed', { pathExisted: true }, /path existed|creation/],
    ['creation parent drift', { creationParentDrift: true }, /creation parent/],
    ['creation extra path', { creationExtra: true }, /creation must be plan-only/],
    ['start extra path', { startExtra: true }, /start must change only the plan/],
    ['legacy abbreviation too short', { shortLength: 6 }, /abbreviation/],
    ['legacy full identity', { fullLegacy: true }, /abbreviation/],
    ['legacy identities unequal', { unequalLegacy: true }, /identity/],
    ['protected section changed', { protectedChange: true }, /protected section/],
    ['heading vector changed', { headingAdded: true }, /heading vector/],
    ['duplicate headings', { duplicateHeadings: true }, /duplicate body heading/],
    ['preamble changed', { preambleChange: true }, /preamble/],
    ['changed section set empty', { noBodyChange: true }, /changed sections missing/],
  ]) {
    const fixture = legacyShapeCandidate(options);
    expectThrow(label, () => compatibilityEvidence(fixture.compatibilityHelper, { repo: fixture.repo, reviewedHead: fixture.head, planPath: TARGET_PLAN, plannedAtCommit: fixture.plannedAt, executionBaseCommit: fixture.executionBaseCommit }), pattern);
    fs.rmSync(fixture.temp, { recursive: true, force: true });
  }
}

function applyPrerequisiteForTest(bytes, application) {
  let text = Buffer.from(bytes).toString(); text = replaceOnce(text, PREREQUISITE_MARKER, application.markdown, 'prerequisite marker');
  text = replaceOnce(text, PREREQUISITE_STEP_PLANNED, PREREQUISITE_STEP_DONE, 'Step-P row'); return Buffer.from(text);
}

function rehashedPrerequisiteApplication(application, applyChange) {
  return variantPrerequisiteApplication(application, applyChange, { observations: true, receipt: true, application: true });
}

function variantPrerequisiteApplication(application, applyChange, rehash = {}) {
  const receipt = structuredClone(prerequisiteReceiptFromApplication(application)); applyChange(receipt);
  if (rehash.observations) { const observationPreimage = { ...receipt.observations }; delete observationPreimage.observations_sha256; receipt.observations.observations_sha256 = sha256(jcs(observationPreimage)); }
  if (rehash.receipt) { const receiptPreimage = { ...receipt }; delete receiptPreimage.receipt_sha256; receipt.receipt_sha256 = sha256(jcs(receiptPreimage)); }
  const result = { schema: 1, markdown: `\`\`\`json\n${jcs(receipt)}\n\`\`\`\n`, receipt_sha256: receipt.receipt_sha256, observations_sha256: receipt.observations.observations_sha256 };
  if (!rehash.application) return { ...application, ...result };
  result.application_sha256 = sha256(jcs(result)); return result;
}

function commitPrerequisiteVariant(fixture, application, label) {
  git(fixture.repo, ['checkout', '-q', '--detach', fixture.bindingCommit]); const qBytes = applyPrerequisiteForTest(fixture.bindingBytes, application); writeLogical(fixture.repo, TARGET_PLAN, qBytes); const q = commitAll(fixture.repo, `${label} Q`);
  const finalReceipt = findingsFreeDraftReceipt(q, qBytes, 'single'); const finalBytes = insertOrReplaceDraftReceiptForTest(qBytes, finalReceipt, true); writeLogical(fixture.repo, TARGET_PLAN, finalBytes); const f = commitAll(fixture.repo, `${label} F`);
  return { q, f, qBytes, finalBytes };
}

function commitQFVariant(fixture, prerequisiteApplication, label, qVariant = (bytes) => bytes, { qExtraPath = false, fVariant = (bytes) => bytes, interveningBeforeF = false } = {}) {
  git(fixture.repo, ['checkout', '-q', '--detach', fixture.bindingCommit]);
  const validQ = applyPrerequisiteForTest(fixture.bindingBytes, prerequisiteApplication); const qBytes = Buffer.from(qVariant(validQ)); writeLogical(fixture.repo, TARGET_PLAN, qBytes);
  if (qExtraPath) writeLogical(fixture.repo, 'unexpected-q.txt', 'outside Q\n');
  const q = commitAll(fixture.repo, `${label} Q`); const finalReceipt = findingsFreeDraftReceipt(q, qBytes, 'single'); let finalBytes = insertOrReplaceDraftReceiptForTest(qBytes, finalReceipt, true);
  if (interveningBeforeF) git(fixture.repo, ['commit', '--allow-empty', '-qm', `${label} intervening`]);
  finalBytes = Buffer.from(fVariant(finalBytes)); writeLogical(fixture.repo, TARGET_PLAN, finalBytes); const f = commitAll(fixture.repo, `${label} F`);
  return { q, f, qBytes, finalBytes, finalReceipt };
}

function testCompatibilityChainNegatives(fixture, prerequisiteApplication) {
  const evidenceBytes = gitBytes(fixture.repo, ['show', `${fixture.evidenceCommit}:${TARGET_PLAN}`]); const reviewBytes = gitBytes(fixture.repo, ['show', `${fixture.compatibilityReviewCommit}:${TARGET_PLAN}`]);

  const materialMatch = fixture.evidenceApplication.markdown.match(/^Compatibility-review-material: (\{.*\})$/m); const receiptMatch = fixture.evidenceApplication.markdown.match(/^Execution-base-compatibility-receipt: (\{.*\})$/m); const diffMatch = fixture.evidenceApplication.markdown.match(/^(`{3,})diff\n([\s\S]*?)^\1$/m); assert.ok(materialMatch && receiptMatch && diffMatch);
  const alteredMaterial = JSON.parse(materialMatch[1]); const alteredReceipt = JSON.parse(receiptMatch[1]); alteredMaterial.plan_creation_commit = fixture.identityCommit; alteredReceipt.plan_creation_commit = fixture.identityCommit;
  delete alteredMaterial.review_material_sha256; alteredMaterial.review_material_sha256 = sha256(jcs({ schema: 1, material: alteredMaterial, transition_diff: diffMatch[2] }));
  alteredReceipt.review_material_sha256 = alteredMaterial.review_material_sha256; delete alteredReceipt.receipt_sha256; alteredReceipt.receipt_sha256 = sha256(jcs(alteredReceipt));
  const alteredApplicationMarkdown = `Compatibility-review-material: ${jcs(alteredMaterial)}\n${diffMatch[1]}diff\n${diffMatch[2]}${diffMatch[1]}\nExecution-base-compatibility-receipt: ${jcs(alteredReceipt)}\n`;
  git(fixture.repo, ['checkout', '-q', '--detach', fixture.releaseCommit]); const alteredEvidenceBytes = insertBeforeReviewForTest(gitBytes(fixture.repo, ['show', `${fixture.releaseCommit}:${TARGET_PLAN}`]), alteredApplicationMarkdown); writeLogical(fixture.repo, TARGET_PLAN, alteredEvidenceBytes); const alteredE = commitAll(fixture.repo, 'historically false E');
  const alteredEReceipt = findingsFreeDraftReceipt(alteredE, alteredEvidenceBytes, 'single'); writeLogical(fixture.repo, TARGET_PLAN, insertOrReplaceDraftReceiptForTest(alteredEvidenceBytes, alteredEReceipt)); const alteredEReview = commitAll(fixture.repo, 'review historically false E');
  let alteredBindingApplication = null; let alteredBindingError = null;
  try { alteredBindingApplication = compatibilityBinding(fixture.compatibilityHelper, { repo: fixture.repo, planPath: TARGET_PLAN, evidenceCommit: alteredE, reviewCommit: alteredEReview }); } catch (error) { alteredBindingError = error; }
  if (alteredBindingError !== null) assert.match(alteredBindingError.message, /application mismatch/, 'real binding builder rejects self-consistent false E before B');
  else {
    const alteredReviewBytes = gitBytes(fixture.repo, ['show', `${alteredEReview}:${TARGET_PLAN}`]); const alteredBindingBytes = insertBeforeReviewForTest(alteredReviewBytes, alteredBindingApplication.markdown); writeLogical(fixture.repo, TARGET_PLAN, alteredBindingBytes); const alteredB = commitAll(fixture.repo, 'bind historically false E');
    const falseFixture = { ...fixture, evidenceCommit: alteredE, compatibilityReviewCommit: alteredEReview, bindingCommit: alteredB }; const fake = prerequisiteDependencies(falseFixture); let prerequisiteError = null;
    try { falseFixture.compatibilityPolicy.buildDocksCompatibilityPrerequisiteApplication(prerequisiteInput(falseFixture), fake.dependencies); } catch (error) { prerequisiteError = error; }
    if (prerequisiteError !== null) { assert.match(prerequisiteError.message, /historical application mismatch/); assert.deepEqual(fake.observationOrder, [], 'false E rejects before remote observations'); }
    else assert.fail(`E historical reconstruction must reject before observations; observed ${fake.observationOrder.join(',')}`);
  }

  git(fixture.repo, ['checkout', '-q', '--detach', fixture.releaseCommit]); git(fixture.repo, ['commit', '--allow-empty', '-qm', 'intervening before E']); writeLogical(fixture.repo, TARGET_PLAN, evidenceBytes); const nonAdjacentE = commitAll(fixture.repo, 'non-adjacent E');
  const nonAdjacentEReceipt = findingsFreeDraftReceipt(nonAdjacentE, evidenceBytes, 'single'); writeLogical(fixture.repo, TARGET_PLAN, insertOrReplaceDraftReceiptForTest(evidenceBytes, nonAdjacentEReceipt)); const nonAdjacentR = commitAll(fixture.repo, 'review non-adjacent E');
  expectThrow('E adjacency', () => compatibilityBinding(fixture.compatibilityHelper, { repo: fixture.repo, planPath: TARGET_PLAN, evidenceCommit: nonAdjacentE, reviewCommit: nonAdjacentR }), /evidence commit parent mismatch/);

  git(fixture.repo, ['checkout', '-q', '--detach', fixture.evidenceCommit]); git(fixture.repo, ['commit', '--allow-empty', '-qm', 'intervening before R']); writeLogical(fixture.repo, TARGET_PLAN, reviewBytes); const nonAdjacentRCommit = commitAll(fixture.repo, 'non-adjacent R');
  expectThrow('R adjacency', () => compatibilityBinding(fixture.compatibilityHelper, { repo: fixture.repo, planPath: TARGET_PLAN, evidenceCommit: fixture.evidenceCommit, reviewCommit: nonAdjacentRCommit }), /review commit parent mismatch/);

  git(fixture.repo, ['checkout', '-q', '--detach', fixture.evidenceCommit]); const alteredAttribution = Buffer.from(replaceOnce(reviewBytes.toString(), 'independently verified none', 'independently verified altered'));
  writeLogical(fixture.repo, TARGET_PLAN, alteredAttribution); const alteredR = commitAll(fixture.repo, 'alter R attribution');
  expectThrow('R attribution bytes', () => compatibilityBinding(fixture.compatibilityHelper, { repo: fixture.repo, planPath: TARGET_PLAN, evidenceCommit: fixture.evidenceCommit, reviewCommit: alteredR }), /compatibility review delta mismatch/);

  const finding = { id: 'X1', severity: 'low', section: 'Threat model', path: null, locator: null, defect: 'finding retained', fix: 'resolve it', evidence: 'fixture' };
  expectThrow('R not_ready', () => renderCompatibilityReviewAttribution(draftReceiptVariant(fixture.evidenceCommit, evidenceBytes, { verdict: 'not_ready' })), /outcome is ineligible|findings-free ready/);
  expectThrow('R finding', () => renderCompatibilityReviewAttribution(draftReceiptVariant(fixture.evidenceCommit, evidenceBytes, { findings: [finding] })), /findings-free ready|waiver\/finding/);

  git(fixture.repo, ['checkout', '-q', '--detach', fixture.compatibilityReviewCommit]); writeLogical(fixture.repo, TARGET_PLAN, fixture.bindingBytes); writeLogical(fixture.repo, 'unexpected-b.txt', 'outside B\n'); const extraB = commitAll(fixture.repo, 'B extra path');
  expectThrow('B extra path', () => fixture.compatibilityPolicy.buildDocksCompatibilityPrerequisiteApplication({ ...prerequisiteInput(fixture), bindingCommit: extraB }, prerequisiteDependencies(fixture).dependencies), /binding commit must change only the plan/);
  git(fixture.repo, ['checkout', '-q', '--detach', fixture.compatibilityReviewCommit]); const bindingMatch = fixture.bindingBytes.toString().match(/^Execution-base-compatibility-binding: (\{.*\})$/m); assert.ok(bindingMatch); const alteredBindingRecord = JSON.parse(bindingMatch[1]); alteredBindingRecord.binding_sha256 = 'f'.repeat(64);
  const alteredBinding = Buffer.from(replaceOnce(fixture.bindingBytes.toString(), bindingMatch[0], `Execution-base-compatibility-binding: ${jcs(alteredBindingRecord)}`)); writeLogical(fixture.repo, TARGET_PLAN, alteredBinding); const alteredB = commitAll(fixture.repo, 'B altered binding');
  expectThrow('B binding record', () => fixture.compatibilityPolicy.buildDocksCompatibilityPrerequisiteApplication({ ...prerequisiteInput(fixture), bindingCommit: alteredB }, prerequisiteDependencies(fixture).dependencies), /binding application mismatch|binding hash|binding mismatch/);

  for (const [label, qVariant, options, pattern] of [
    ['Q pending marker retained', (bytes) => Buffer.from(replaceOnce(bytes.toString(), prerequisiteApplication.markdown, `${PREREQUISITE_MARKER}${prerequisiteApplication.markdown}`)), {}, /closure delta mismatch/],
    ['Q Step-P remains planned', (bytes) => Buffer.from(replaceOnce(bytes.toString(), PREREQUISITE_STEP_DONE, PREREQUISITE_STEP_PLANNED)), {}, /closure delta mismatch/],
    ['Q non-JCS receipt', (bytes) => Buffer.from(replaceOnce(bytes.toString(), prerequisiteApplication.markdown, prerequisiteApplication.markdown.replace('```json\n{', '```json\n{ '))), {}, /compact JCS/],
    ['Q wrong fence', (bytes) => Buffer.from(replaceOnce(bytes.toString(), prerequisiteApplication.markdown, prerequisiteApplication.markdown.replace('```json\n', '````json\n').replace('\n```\n', '\n````\n'))), {}, /receipt fence count|closure delta/],
    ['Q extra prose', (bytes) => insertBeforeReviewForTest(bytes, 'Unexpected Q prose.\n'), {}, /closure delta mismatch/],
    ['Q extra path', (bytes) => bytes, { qExtraPath: true }, /must change only the plan/],
    ['Q adjacency', (bytes) => bytes, { interveningBeforeF: true }, /execution review commit|must change only the plan|delta mismatch/],
    ['F extra prose', (bytes) => bytes, { fVariant: (bytes) => insertBeforeReviewForTest(bytes, 'Unexpected F prose.\n') }, /final review delta mismatch/],
    ['F attribution', (bytes) => bytes, { fVariant: (bytes) => { const text = bytes.toString(); const needle = 'independently verified none'; const at = text.lastIndexOf(needle); assert.ok(at >= 0); return Buffer.from(`${text.slice(0, at)}independently verified altered${text.slice(at + needle.length)}`); } }, /final review delta mismatch/],
  ]) {
    const chain = commitQFVariant(fixture, prerequisiteApplication, label, qVariant, options);
    expectThrow(label, () => compatibilityRange(fixture.compatibilityHelper, { repo: fixture.repo, planPath: TARGET_PLAN, plannedAtCommit: fixture.plannedAt, executionBaseCommit: fixture.executionBaseCommit, reviewedHead: chain.f }), pattern);
  }
}

function draftBundle() {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'review-policy-leg-bundle-')); const repo = path.join(temp, 'repo'); const bundle = path.join(temp, 'bundle');
  fs.mkdirSync(path.join(repo, 'docs/plans/active'), { recursive: true }); fs.copyFileSync(FIXTURE, path.join(repo, 'docs/plans/active/sample.md'));
  git(repo, ['init', '-q']); git(repo, ['config', 'user.email', 'policy@example.test']); git(repo, ['config', 'user.name', 'Policy Test']); git(repo, ['add', '.']); git(repo, ['commit', '-qm', 'fixture']); const head = git(repo, ['rev-parse', 'HEAD']);
  const sealed = sealBundle({ repo, reviewedCommit: head, planPath: 'docs/plans/active/sample.md', requestedPaths: [], outDir: bundle }); return { temp, repo, bundle, head, sealed };
}

function testCanonical() {
  const raw = fs.readFileSync(FIXTURE);
  const parsed = parsePlan(raw);
  assert.equal(parsed.frontmatter.status, 'planned');
  const view = canonicalPlanView(raw);
  assert.equal(jcs({ emoji: '\ud83d\ude80' }), '{"emoji":"🚀"}', 'valid surrogate pair has stable JCS');
  expectThrow('JCS lone-surrogate value', () => jcs({ invalid: '\ud800' }), /lone surrogate/);
  expectThrow('JCS lone-surrogate property key', () => jcs({ ['\udc00']: 'invalid' }), /lone surrogate/);
  assert.match(view, /Ordinary self-review prose remains canonical/);
  assert.doesNotMatch(view, /Review-receipt:/);
  assert.doesNotMatch(view, /"status"/);
  const lifecycle = Buffer.from(raw.toString().replace('status: planned', 'status: ongoing').replace('updated: "2026-07-12T00:00:00-03:00"', 'updated: "2026-07-12T01:00:00-03:00"'));
  assert.equal(canonicalPlanView(lifecycle), view, 'lifecycle-only change is excluded');
  assert.notEqual(canonicalPlanView(Buffer.from(raw.toString().replace('Prove canonical policy behavior.\n\n## Interfaces', 'Prove changed policy behavior.\n\n## Interfaces'))), view, 'ordinary prose change invalidates');
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
  validatePolicy(POLICY_V2);
  validatePolicy(POLICY_V4);
  validatePolicy({ ...POLICY_V2, minimum_score: 0, max_rounds: 1 });
  validatePolicy({ ...POLICY_V2, minimum_score: 100, max_rounds: 10 });
  expectThrow('policy v2 minimum score below range', () => validatePolicy({ ...POLICY_V2, minimum_score: -1 }), /minimum_score/);
  expectThrow('policy v2 minimum score above range', () => validatePolicy({ ...POLICY_V2, minimum_score: 101 }), /minimum_score/);
  expectThrow('policy v2 minimum score integer', () => validatePolicy({ ...POLICY_V2, minimum_score: 89.5 }), /minimum_score/);
  expectThrow('policy v2 max rounds below range', () => validatePolicy({ ...POLICY_V2, max_rounds: 0 }), /max_rounds/);
  expectThrow('policy v2 max rounds above range', () => validatePolicy({ ...POLICY_V2, max_rounds: 11 }), /max_rounds/);
  expectThrow('policy v2 max rounds integer', () => validatePolicy({ ...POLICY_V2, max_rounds: 2.5 }), /max_rounds/);
  expectThrow('policy v2 caps ordered candidates', () => validatePolicy({ ...POLICY_V2, anthropic_tiers: [...POLICY_V2.anthropic_tiers, { model: 'sonnet', effort: 'high', transports: ['cli'] }, { model: 'haiku', effort: 'medium', transports: ['cli'] }] }), /anthropic_tiers/);
  expectThrow('policy v2 rejects duplicate candidates', () => validatePolicy({ ...POLICY_V2, anthropic_tiers: [POLICY_V2.anthropic_tiers[0], { ...POLICY_V2.anthropic_tiers[0], transports: ['cli'] }] }), /duplicate.*candidate|anthropic_tiers/);
  expectThrow('policy v1 remains closed', () => validatePolicy({ ...POLICY, minimum_score: 90 }), /unknown key/);
  expectThrow('policy v2 remains closed', () => validatePolicy({ ...POLICY_V2, unexpected: true }), /unknown key/);
  expectThrow('policy v4 remains closed', () => validatePolicy({ ...POLICY_V4, continuation_batches: true }), /unknown key/);
  const missingV2Provenance = { ...POLICY_V2, provenance: { ...POLICY_V2.provenance } }; delete missingV2Provenance.provenance.minimum_score;
  expectThrow('policy v2 requires score provenance', () => validatePolicy(missingV2Provenance), /missing minimum_score/);
  const req = request(); validateRequest(req);
  const output = { schema: 1, leg: 'X', request: req, verdict: 'ready', score: 98, findings: [{ id: 'X1', severity: 'low', section: 'Goal', path: null, locator: null, defect: 'Minor ambiguity', fix: 'State it', evidence: 'Plan text' }], confirmations: ['Bundle was read'] };
  validateReviewerOutput(output, req, 'X');
  expectThrow('echo mismatch', () => validateReviewerOutput({ ...output, request: { ...req, request_id: '223e4567-e89b-42d3-a456-426614174000' } }, req, 'X'), /mismatch/);
  expectThrow('unknown reviewer key', () => validateReviewerOutput({ ...output, extra: true }, req, 'X'), /unknown/);
  expectThrow('cross-leg id', () => validateReviewerOutput({ ...output, findings: [{ ...output.findings[0], id: 'S1' }] }, req, 'X'), /finding id/);
  assert.equal(reviewerSchema('X').additionalProperties, false);
  assert.equal(reviewerSchema('X').properties.request.additionalProperties, false);
  const policySchemas = reviewerSchema('X').properties.request.properties.policy.oneOf;
  assert.equal(policySchemas.length, 2); assert.ok(policySchemas.every((schema) => schema.additionalProperties === false));
  assert.equal(policySchemas.find((schema) => schema.properties.schema.const === 2).properties.minimum_score.maximum, 100);
  assert.equal(policySchemas.find((schema) => schema.properties.schema.const === 2).properties.max_rounds.maximum, 10);
  assert.equal(reviewerSchema('X').properties.request.properties.author.additionalProperties, false);
  for (const version of [1, 2, 3]) assertConstrainedScalarsTyped(reviewerSchema('X', version), `reviewer schema v${version}`);

  const reqV3 = requestV3();
  validateRequest(reqV3);
  const rubric = {
    standalone_executability: 22,
    actionability: 16,
    dependency_order: 12,
    evidence_reverify: 10,
    goal_coverage: 12,
    executable_acceptance: 12,
    failure_mode: 10,
    assumption_to_question: 6,
  };
  const followup = {
    id: 'S1', severity: 'low', section: 'Notes', path: null, locator: null,
    defect: 'Optional wording can be clearer', fix: 'Clarify the sentence', evidence: 'Current plan text',
    priority: 3, confidence: 1, blocking: false, requirement: 'Non-blocking documentation quality',
  };
  const blocking = {
    ...followup, id: 'S2', severity: 'high', section: 'Acceptance criteria',
    defect: 'Required behavior has no executable proof', fix: 'Add an exact command and expected result',
    priority: 0, blocking: true, requirement: 'User-required executable acceptance',
  };
  const readyV3 = { schema: 3, leg: 'S', request: reqV3, verdict: 'ready', score: 100, rubric, findings: [followup], confirmations: ['full review completed'] };
  validateReviewerOutput(readyV3, reqV3, 'S');
  validateReviewerOutput({ ...readyV3, verdict: 'not_ready', findings: [blocking] }, reqV3, 'S');
  expectThrow('schema-3 score must equal rubric sum', () => validateReviewerOutput({ ...readyV3, score: 99 }, reqV3, 'S'), /rubric|score|sum/);
  expectThrow('schema-3 ready cannot carry blocking finding', () => validateReviewerOutput({ ...readyV3, findings: [blocking] }, reqV3, 'S'), /blocking|verdict/);
  expectThrow('schema-3 not_ready requires blocking finding', () => validateReviewerOutput({ ...readyV3, verdict: 'not_ready' }, reqV3, 'S'), /blocking|verdict/);
  expectThrow('schema-3 finding priority is closed', () => validateReviewerOutput({ ...readyV3, findings: [{ ...followup, priority: 4 }] }, reqV3, 'S'), /priority/);
  expectThrow('schema-3 finding confidence is bounded', () => validateReviewerOutput({ ...readyV3, findings: [{ ...followup, confidence: 2 }] }, reqV3, 'S'), /confidence/);
  expectThrow('schema-3 finding requires attribution', () => validateReviewerOutput({ ...readyV3, findings: [{ ...followup, requirement: '' }] }, reqV3, 'S'), /requirement/);
  expectThrow('schema-3 full review rejects previous identity', () => validateRequest({ ...reqV3, previous_input_sha256: H0 }), /full|previous|repair/);
  expectThrow('schema-3 first round must be full', () => validateRequest({ ...reqV3, review_mode: 'repair' }), /round|full|repair/);
  const reproducedBlocking = {
    id: blocking.id, source: 'S', severity: blocking.severity, path: blocking.path, locator: blocking.locator,
    defect: blocking.defect, fix: blocking.fix,
    reproduction: { method: 'read', command: null, exit_code: null, evidence_sha256: H0 },
  };
  const transition = reviewPolicy.buildRepairTransition({
    fromRoundIndex: 1,
    previousInputSha256: reqV3.input_sha256,
    currentInputSha256: '2'.repeat(64),
    reconciliation: {
      X: { accepted: [], rejected: [] },
      S: { accepted: ['S2'], rejected: [] },
    },
    targets: [reproducedBlocking],
  });
  assert.deepEqual(transition.reconciliation, {
    X: { accepted: [], rejected: [] },
    S: { accepted: ['S2'], rejected: [] },
  });
  const repairRequest = requestV3({
    request_id: '223e4567-e89b-42d3-a456-426614174000',
    review_mode: 'repair',
    round_index: 2,
    input_sha256: '2'.repeat(64),
    bundle_sha256: '3'.repeat(64),
    previous_input_sha256: reqV3.input_sha256,
    repair_targets_sha256: transition.repair_targets_sha256,
  });
  validateRequest(repairRequest);
  expectThrow('schema-3 repair requires changed input', () => validateRequest({ ...repairRequest, input_sha256: repairRequest.previous_input_sha256 }), /changed|input/);
  expectThrow('schema-3 repair requires targets', () => validateRequest({ ...repairRequest, repair_targets_sha256: null }), /repair.*target|target.*repair/);

  const roundOne = {
    ...draftRunV3(reqV3),
    S: passedV3(reqV3, 'S', [blocking]),
    reproduced: [reproducedBlocking],
    decision_evidence: null,
    outcome: 'single',
    pre_execution_eligible: false,
  };
  const roundTwo = draftRunV3(repairRequest);
  const series = {
    schema: 3,
    policy_sha256: reqV3.policy_sha256,
    initial_input_sha256: reqV3.input_sha256,
    current_input_sha256: repairRequest.input_sha256,
    rounds: [roundOne, roundTwo],
    repairs: [transition],
  };
  validateReviewSeries(series);
  const completionSeriesRequest = requestV3({
    request_id: '323e4567-e89b-42d3-a456-426614174000',
    phase: 'completion',
    lifecycle_intent: 'none',
    planned_at_commit: '3'.repeat(40),
    execution_base_commit: '4'.repeat(40),
    diff_sha256: H0,
    acceptance_inventory_sha256: sha256(jcs(INVENTORY)),
  });
  const completionSeriesRound = {
    schema: 3,
    kind: 'completion',
    request: completionSeriesRequest,
    plan_input_sha256: completionSeriesRequest.input_sha256,
    diff_sha256: H0,
    acceptance_inventory: INVENTORY,
    acceptance_inventory_sha256: completionSeriesRequest.acceptance_inventory_sha256,
    X: unavailableV3(completionSeriesRequest, 'X'),
    S: unavailableV3(completionSeriesRequest, 'S'),
    reproduced: [],
    decision_evidence: zeroDecision(completionSeriesRequest, 'proceed'),
    outcome: 'zero_degraded',
    primary: primaryEvidence(),
    completion_verdict: 'passed',
  };
  validateCompletionRunResult(completionSeriesRound);
  validateReviewSeries({
    schema: 3,
    policy_sha256: completionSeriesRequest.policy_sha256,
    initial_input_sha256: completionSeriesRequest.input_sha256,
    current_input_sha256: completionSeriesRequest.input_sha256,
    rounds: [completionSeriesRound],
    repairs: [],
  });
  expectThrow('schema-3 review series rejects an invalid initial run kind', () => validateReviewSeries({
    ...series,
    current_input_sha256: reqV3.input_sha256,
    rounds: [{ ...roundOne, kind: 'invalid' }],
    repairs: [],
  }), /review series run kind/);
  expectThrow('schema-3 review series rejects run kind drift', () => validateReviewSeries({
    ...series,
    rounds: [roundOne, { ...roundTwo, kind: 'completion' }],
  }), /review series run kind drift/);
  expectThrow('schema-3 review series requires repair after round one', () => validateReviewSeries({ ...series, rounds: [roundOne, { ...roundTwo, request: { ...repairRequest, review_mode: 'full', previous_input_sha256: null, repair_targets_sha256: null } }] }), /repair|round/);
  expectThrow('schema-3 review series requires contiguous rounds', () => validateReviewSeries({ ...series, rounds: [roundOne, { ...roundTwo, request: { ...repairRequest, round_index: 3 } }] }), /contiguous|round/);
  const sixRounds = Array.from({ length: 6 }, (_, index) => {
    const round = index + 1; const input = String(round).repeat(64); const previous = round === 1 ? null : String(round - 1).repeat(64);
    return draftRunV3(requestV3({
      request_id: `00000000-0000-4000-8000-00000000000${round}`,
      review_mode: round === 1 ? 'full' : 'repair',
      round_index: round,
      input_sha256: input,
      bundle_sha256: String(9 - index).repeat(64),
      previous_input_sha256: previous,
      repair_targets_sha256: round === 1 ? null : 'a'.repeat(64),
    }));
  });
  expectThrow('schema-3 review series lifetime cap is not renewable', () => validateReviewSeries({
    schema: 3, policy_sha256: reqV3.policy_sha256, initial_input_sha256: '1'.repeat(64), current_input_sha256: '6'.repeat(64), rounds: sixRounds, repairs: [],
  }), /max_rounds|lifetime|round/);

  validateWaivers([{ phase: 'draft', input_sha256: req.input_sha256, legs: ['S', 'X'], actor: 'user', reason: 'explicit waiver', at: '2026-07-12T00:00:00-03:00' }], 'draft', req.input_sha256);
  expectThrow('duplicate waiver', () => validateWaivers([
    { phase: 'draft', input_sha256: req.input_sha256, legs: ['X'], actor: 'user', reason: 'one', at: '2026-07-12T00:00:00-03:00' },
    { phase: 'draft', input_sha256: req.input_sha256, legs: ['X'], actor: 'user', reason: 'two', at: '2026-07-12T00:00:00-03:00' },
  ], 'draft', req.input_sha256), /duplicate/);
  const raw = (leg) => ({ schema: 1, leg, request: req, result: 'unavailable_auth', attempts: [], selected: null, reviewer_output: null, findings: [], findings_sha256: null, severity_totals: { high: 0, medium: 0, low: 0 }, waiver: null, waiver_sha256: null, decision_evidence: null, reason: 'authentication unavailable' });
  const persisted = (leg) => ({ request: req, raw: raw(leg), reconciliation: { accepted: [], rejected: [] } });
  const receipt = { schema: 1, phase: 'draft', request: req, input_sha256: req.input_sha256, reviewed_commit: req.reviewed_commit_or_head, author: req.author, policy: req.policy, policy_sha256: req.policy_sha256, X: persisted('X'), S: persisted('S'), reproduced: [], decision_evidence: zeroDecision(req), outcome: 'blocked', pre_execution_eligible: false, reviewed_at: '2026-07-12T00:00:00-03:00' };
  validateDraftReceipt(receipt, req.input_sha256);
  validateDraftReviewReuse({ receipt, expectedInput: req.input_sha256, expectedPolicy: POLICY });
  expectThrow('policy v1 receipt is not reusable under policy v2', () => validateDraftReviewReuse({ receipt, expectedInput: req.input_sha256, expectedPolicy: POLICY_V2 }), /resolved policy|policy.*mismatch|stale/);
  expectThrow('current draft reuse requires resolved policy', () => validateDraftReviewReuse({ receipt, expectedInput: req.input_sha256 }), /expectedPolicy|policy/);
  expectThrow('malformed receipt extra key', () => validateDraftReceipt({ ...receipt, unauthorized_extra: true }, req.input_sha256), /unknown key/);
  expectThrow('stale receipt input', () => validateDraftReceipt(receipt, 'f'.repeat(64)), /stale/);
  console.log('schema closure, typed structured output, rubric, repair identity, and lifetime convergence goldens passed');
}

function testValidationMatrix() {
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
  const v2Req = request({ policy: POLICY_V2 });
  const v2AtThresholdX = rawPassed(v2Req, 'X', null, [], { score: 90 });
  const v2ReadyS = rawPassed(v2Req, 'S', null, [], { score: 100 });
  validateDraftRunResult({ schema: 1, kind: 'draft', request: v2Req, X: v2AtThresholdX, S: v2ReadyS, reproduced: [], decision_evidence: null, outcome: 'dual', pre_execution_eligible: true });
  const v2BelowThresholdX = rawPassed(v2Req, 'X', null, [], { score: 89 });
  validateDraftRunResult({ schema: 1, kind: 'draft', request: v2Req, X: v2BelowThresholdX, S: v2ReadyS, reproduced: [], decision_evidence: null, outcome: 'dual', pre_execution_eligible: false });
  expectThrow('policy v2 score 89 cannot authorize execution', () => validateDraftRunResult({ schema: 1, kind: 'draft', request: v2Req, X: v2BelowThresholdX, S: v2ReadyS, reproduced: [], decision_evidence: null, outcome: 'dual', pre_execution_eligible: true }), /pre_execution_eligible/);
  validateDraftRunResult({ schema: 1, kind: 'draft', request: v2Req, X: v2AtThresholdX, S: rawAuth(v2Req, 'S'), reproduced: [], decision_evidence: null, outcome: 'single', pre_execution_eligible: true });
  validateDraftRunResult({ schema: 1, kind: 'draft', request: v2Req, X: v2BelowThresholdX, S: rawAuth(v2Req, 'S'), reproduced: [], decision_evidence: null, outcome: 'single', pre_execution_eligible: false });
  const v1LowReady = rawPassed(req, 'X', null, [], { score: 1 });
  validateDraftRunResult({ schema: 1, kind: 'draft', request: req, X: v1LowReady, S: rawAuth(req, 'S'), reproduced: [], decision_evidence: null, outcome: 'single', pre_execution_eligible: true });
  const v2ZeroPolicy = { ...POLICY_V2, minimum_score: 0, provenance: { ...POLICY_V2.provenance, minimum_score: 'current_user' } }; const v2ZeroReq = request({ policy: v2ZeroPolicy });
  validateDraftRunResult({ schema: 1, kind: 'draft', request: v2ZeroReq, X: rawPassed(v2ZeroReq, 'X', null, [], { score: 0 }), S: rawAuth(v2ZeroReq, 'S'), reproduced: [], decision_evidence: null, outcome: 'single', pre_execution_eligible: true });
  validateDraftRunResult({ schema: 1, kind: 'draft', request: v2ZeroReq, X: rawPassed(v2ZeroReq, 'X', null, [], { verdict: 'not_ready', score: 100 }), S: rawAuth(v2ZeroReq, 'S'), reproduced: [], decision_evidence: null, outcome: 'single', pre_execution_eligible: false });

  const v2Fallback = rawPassed(v2Req, 'X', [
    attempt({ model: 'fable', effort: 'high', output_started: false, result: 'model_unavailable', exit_code: 1, reason: 'candidate not entitled' }),
    attempt({ model: 'opus', effort: 'xhigh', child_id: 'child-2' }),
  ]); validateRawLeg(v2Fallback, v2Req, 'X');
  const v2TransientRetry = rawPassed(v2Req, 'X', [
    attempt({ model: 'fable', effort: 'high', output_started: false, result: 'transient_transport', exit_code: null, retry_cause: 'transport_ECONNRESET', reason: 'connection reset' }),
    attempt({ model: 'fable', effort: 'high', child_id: 'child-2' }),
  ]);
  expectThrow('policy v2 attempts each candidate at most once', () => validateRawLeg(v2TransientRetry, v2Req, 'X'), /attempt|retry|order/);
  const providerWideStop = { ...rawAuth(v2Req, 'X'), result: 'unavailable_unknown', attempts: [attempt({ model: 'fable', effort: 'high', output_started: false, result: 'nonzero_exit', exit_code: 1, reason: 'shared weekly limit' })], reason: 'provider-wide failure stops candidate rotation' };
  validateRawLeg(providerWideStop, v2Req, 'X');
  expectThrow('provider-wide failure cannot rotate to next candidate', () => validateRawLeg({ ...providerWideStop, attempts: [...providerWideStop.attempts, attempt({ model: 'opus', effort: 'xhigh', child_id: 'child-2' })] }, v2Req, 'X'), /attempt after terminal result/);
  const v2TransientStop = { ...rawAuth(v2Req, 'S'), result: 'unavailable_unknown', attempts: [attempt({ output_started: false, result: 'transient_transport', exit_code: null, retry_cause: 'transport_ECONNRESET', reason: 'connection reset' })], reason: 'transport failure stops candidate rotation' };
  validateRawLeg(v2TransientStop, v2Req, 'S');
  const allCandidatesUnavailable = { ...rawAuth(v2Req, 'X'), result: 'unavailable_model', attempts: [
    attempt({ model: 'fable', effort: 'high', output_started: false, result: 'model_unavailable', exit_code: 1, reason: 'candidate unavailable' }),
    attempt({ model: 'opus', effort: 'xhigh', output_started: false, result: 'model_unavailable', exit_code: 1, reason: 'candidate unavailable' }),
  ], reason: 'all candidates unavailable' };
  validateRawLeg(allCandidatesUnavailable, v2Req, 'X');
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

  const completionReq = request({ phase: 'completion', lifecycle_intent: 'none', planned_at_commit: '3'.repeat(40), execution_base_commit: '4'.repeat(40), diff_sha256: H0, acceptance_inventory_sha256: sha256(jcs(INVENTORY)) }); const completionX = rawPassed(completionReq, 'X'); const completionS = rawPassed(completionReq, 'S');
  const completion = { schema: 1, kind: 'completion', request: completionReq, plan_input_sha256: completionReq.input_sha256, diff_sha256: H0, acceptance_inventory: INVENTORY, acceptance_inventory_sha256: completionReq.acceptance_inventory_sha256, X: completionX, S: completionS, reproduced: [], decision_evidence: null, outcome: 'dual', primary: primaryEvidence(), completion_verdict: 'passed' };
  validateCompletionRunResult(completion);
  const receipt = { schema: 1, phase: 'completion', request: completionReq, planned_at_commit: completionReq.planned_at_commit, execution_base_commit: completionReq.execution_base_commit, reviewed_head: completionReq.reviewed_commit_or_head, diff_sha256: H0, plan_input_sha256: completionReq.input_sha256, acceptance_inventory: INVENTORY, acceptance_inventory_sha256: completionReq.acceptance_inventory_sha256, author: completionReq.author, policy: completionReq.policy, policy_sha256: completionReq.policy_sha256, X: persisted(completionX), S: persisted(completionS), reproduced: [], decision_evidence: null, primary: completion.primary, completion_verdict: 'passed', outcome: 'dual', reviewed_at: '2026-07-12T00:00:00-03:00' };
  validateCompletionReceipt(receipt, { reviewed_head: completionReq.reviewed_commit_or_head, diff_sha256: H0, plan_input_sha256: completionReq.input_sha256, review_status: 'passed' });
  const completionV2Req = request({ policy: POLICY_V2, phase: 'completion', lifecycle_intent: 'none', planned_at_commit: '3'.repeat(40), execution_base_commit: '4'.repeat(40), diff_sha256: H0, acceptance_inventory_sha256: sha256(jcs(INVENTORY)) });
  const completionV2LowX = rawPassed(completionV2Req, 'X', null, [], { score: 89 }); const completionV2S = rawPassed(completionV2Req, 'S', null, [], { score: 100 });
  const completionV2 = { schema: 1, kind: 'completion', request: completionV2Req, plan_input_sha256: completionV2Req.input_sha256, diff_sha256: H0, acceptance_inventory: INVENTORY, acceptance_inventory_sha256: completionV2Req.acceptance_inventory_sha256, X: completionV2LowX, S: completionV2S, reproduced: [], decision_evidence: null, outcome: 'dual', primary: primaryEvidence(), completion_verdict: 'regressed' };
  assert.equal(deriveCompletionVerdict(completionV2.primary, INVENTORY, completionV2LowX, completionV2S), 'regressed');
  assert.equal(deriveCompletionVerdict(completionV2.primary, INVENTORY, { ...completionV2LowX, reviewer_output: null }, completionV2S), 'regressed', 'missing reviewer output fails closed');
  validateCompletionRunResult(completionV2);
  expectThrow('policy v2 low score cannot pass completion', () => validateCompletionRunResult({ ...completionV2, completion_verdict: 'passed' }), /completion verdict mismatch/);

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
  expectThrow('completion plan hash mismatch', () => validateCompletionRunResult({ ...completion, plan_input_sha256: H0 }), /plan or diff input mismatch/);
  expectThrow('passing CI failure line', () => validateCompletionRunResult({ ...completion, primary: { ...completion.primary, ci: { ...completion.primary.ci, first_failure: 'should be null' } } }), /passing CI/);
  const failingPrimary = { ...primaryEvidence(), goal_met: 'no', acceptance: primaryEvidence().acceptance.map((row, index) => index === 0 ? { ...row, exit_code: 1, met: false } : row), ci: { ...primaryEvidence().ci, exit_code: 1, first_failure: 'test failed' }, regressions: ['blocking regression'] };
  assert.equal(deriveCompletionVerdict(failingPrimary, INVENTORY, completionX, completionS), 'regressed');
  expectThrow('failing primary cannot claim passed completion verdict', () => validateCompletionReceipt({ ...receipt, primary: failingPrimary }, { review_status: 'passed' }), /completion verdict mismatch/);
  const regressedReceipt = { ...receipt, primary: failingPrimary, completion_verdict: 'regressed' };
  expectThrow('regressed receipt cannot match passed review_status', () => validateCompletionReceipt(regressedReceipt, { review_status: 'passed' }), /review_status mismatch/);
  expectThrow('stale completion receipt', () => validateCompletionReceipt(receipt, { diff_sha256: H1 }), /stale completion/);
  expectThrow('completion author mismatch', () => validateCompletionReceipt({ ...receipt, author: { ...receipt.author, company: 'anthropic' } }), /author mismatch/);
  expectThrow('completion receipt extra key', () => validateCompletionReceipt({ ...receipt, extra: true }), /unknown key/);
  for (const [label, acceptance] of [
    ['empty acceptance ledger', []],
    ['missing acceptance row', completion.primary.acceptance.slice(0, -1)],
    ['extra acceptance row', [...completion.primary.acceptance, { ...completion.primary.acceptance[0], criterion_id: 'A9' }]],
    ['reordered acceptance rows', [...completion.primary.acceptance].reverse()],
    ['altered acceptance command', completion.primary.acceptance.map((row, index) => index === 0 ? { ...row, command: 'true' } : row)],
  ]) expectThrow(label, () => validateCompletionRunResult({ ...completion, primary: { ...completion.primary, acceptance } }), /acceptance evidence/);
  const emptyInventory = { schema: 1, criteria: [] }; const emptyReq = { ...completionReq, acceptance_inventory_sha256: sha256(jcs(emptyInventory)) };
  const emptyX = rawPassed(emptyReq, 'X'); const emptyS = rawPassed(emptyReq, 'S');
  expectThrow('empty canonical acceptance inventory', () => validateCompletionRunResult({ ...completion, request: emptyReq, acceptance_inventory: emptyInventory, acceptance_inventory_sha256: emptyReq.acceptance_inventory_sha256, X: emptyX, S: emptyS, primary: { ...completion.primary, acceptance: [] } }), /acceptance inventory must be nonempty/);
  const completionNotReadyX = rawPassed(completionReq, 'X', null, [], { verdict: 'not_ready', score: 40 });
  const notReadyCompletion = { ...completion, X: completionNotReadyX, completion_verdict: 'regressed' }; validateCompletionRunResult(notReadyCompletion);
  expectThrow('not_ready reviewer cannot claim passed completion', () => validateCompletionRunResult({ ...notReadyCompletion, completion_verdict: 'passed' }), /completion verdict mismatch/);
  const notReadyReceipt = { ...receipt, X: persisted(completionNotReadyX), completion_verdict: 'regressed' }; validateCompletionReceipt(notReadyReceipt, { review_status: 'regressed' });

  const finding = { id: 'X1', severity: 'high', section: 'Goal', path: 'src/a.js', locator: 'symbol', defect: 'broken', fix: 'repair', evidence: 'source' };
  const XFinding = rawPassed(req, 'X', null, [finding]); const accepted = persisted(XFinding, ['X1']);
  const acceptedReceipt = { schema: 1, phase: 'draft', request: req, input_sha256: req.input_sha256, reviewed_commit: req.reviewed_commit_or_head, author: req.author, policy: req.policy, policy_sha256: req.policy_sha256, X: accepted, S: persisted(S), reproduced: [], decision_evidence: null, outcome: 'dual', pre_execution_eligible: true, reviewed_at: '2026-07-12T00:00:00-03:00' };
  expectThrow('accepted unreproduced finding', () => validateDraftReceipt(acceptedReceipt, req.input_sha256), /not reproduced/);
  console.log('semantic: not_ready verdict and structured-output hash cannot authorize execution');
  console.log('semantic: derived completion verdict rejects failing primary evidence and mismatched review_status');
  console.log('semantic validation matrix passed');
}

function testBundle() {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'review-policy-bundle-'));
  const repo = path.join(temp, 'repo'); const out = path.join(temp, 'bundle');
  fs.mkdirSync(path.join(repo, 'docs/plans/active'), { recursive: true }); fs.mkdirSync(path.join(repo, 'src')); fs.mkdirSync(path.join(repo, 'evidence/level-one/level-two'), { recursive: true });
  fs.copyFileSync(FIXTURE, path.join(repo, 'docs/plans/active/sample.md')); fs.writeFileSync(path.join(repo, 'src/example.js'), 'export const example = true;\n'); fs.symlinkSync('example.js', path.join(repo, 'src/example-link.js')); fs.writeFileSync(path.join(repo, 'evidence/level-one/level-two/nested.txt'), 'nested evidence\n');
  git(repo, ['init', '-q']); git(repo, ['config', 'user.email', 'policy@example.test']); git(repo, ['config', 'user.name', 'Policy Test']); git(repo, ['add', '.']); git(repo, ['commit', '-qm', 'fixture']); const head = git(repo, ['rev-parse', 'HEAD']);
  fs.writeFileSync(path.join(repo, 'src/example.js'), 'uncommitted moving bytes\n');
  const sealed = sealBundle({ repo, reviewedCommit: head, planPath: 'docs/plans/active/sample.md', requestedPaths: ['src', 'evidence/level-one/level-two/nested.txt', 'missing.txt'], outDir: out });
  assert.match(sealed.bundle_sha256, /^[0-9a-f]{64}$/); assert.equal(sealed.manifest.requested.find((row) => row.path === 'missing.txt').state, 'absent');
  assert.equal(sealed.manifest.files.find((row) => row.path === 'src/example-link.js').mode, '120000');
  assert.equal(fs.readFileSync(path.join(out, 'src/example.js'), 'utf8'), 'export const example = true;\n', 'bundle reads reviewed commit, not moving worktree');
  assert.ok(fs.existsSync(path.join(out, 'reviewer-output.X.schema.json'))); assert.ok(fs.existsSync(path.join(out, 'reviewer-output.S.schema.json')));
  assert.ok(fs.existsSync(path.join(out, 'reviewer-output.X.v3.schema.json'))); assert.ok(fs.existsSync(path.join(out, 'reviewer-output.S.v3.schema.json')));
  assert.match(fs.readFileSync(path.join(out, 'reviewer-output.S.schema.json'), 'utf8'), /\^S/);
  assertConstrainedScalarsTyped(JSON.parse(fs.readFileSync(path.join(out, 'reviewer-output.S.v3.schema.json'), 'utf8')), 'sealed reviewer schema v3');
  assert.equal(verifyBundle({ bundle: out, expectedSha256: sealed.bundle_sha256 }).bundle_sha256, sealed.bundle_sha256);
  testBundleDestruction({ repo, reviewedCommit: head, outsideBundle: out, outsideBundleSha256: sealed.bundle_sha256 });
  for (const directory of ['evidence', 'evidence/level-one', 'evidence/level-one/level-two']) assert.equal(fs.statSync(path.join(out, directory)).mode & 0o777, 0o555, `${directory} ancestor is sealed read-only`);
  expectThrow('raw plan requested path', () => sealBundle({ repo, reviewedCommit: head, planPath: 'docs/plans/active/sample.md', requestedPaths: ['docs/plans/active/sample.md'], outDir: path.join(temp, 'raw-plan') }), /raw plan path/);
  expectThrow('raw plan requested ancestor', () => sealBundle({ repo, reviewedCommit: head, planPath: 'docs/plans/active/sample.md', requestedPaths: ['docs/plans/active'], outDir: path.join(temp, 'raw-plan-ancestor') }), /raw plan path or ancestor|emitted/);

  const substitutedPath = path.join(temp, 'substituted-bundle');
  const substituted = copiedResealedBundle(out, substitutedPath, (manifest, root) => {
    const bytes = Buffer.from('unrelated plan B\n'); fs.writeFileSync(path.join(root, 'plan.review.md'), bytes);
    manifest.files.find((row) => row.path === 'plan.review.md').sha256 = sha256(bytes);
  });
  const substitutedRequest = request({ reviewed_commit_or_head: head, input_sha256: sealed.input_sha256, bundle_sha256: substituted.bundle_sha256 });
  expectThrow('self-consistently resealed plan-B substitution', () => buildReviewerArgv({ tool: 'codex', bundle: substitutedPath, model: 'gpt-5.6-sol', effort: 'xhigh', leg: 'X', request: substitutedRequest }), /plan view input hash mismatch/);

  const schemaPath = path.join(temp, 'schema-substitution');
  const schemaSubstitution = copiedResealedBundle(out, schemaPath, (manifest, root) => {
    const bytes = Buffer.from(`${jcs(reviewerSchema('X'))}\n`); fs.writeFileSync(path.join(root, 'reviewer-output.S.schema.json'), bytes);
    manifest.files.find((row) => row.path === 'reviewer-output.S.schema.json').sha256 = sha256(bytes);
  });
  expectThrow('self-consistently resealed reviewer schema substitution', () => verifyBundle({ bundle: schemaPath, expectedSha256: schemaSubstitution.bundle_sha256 }), /reviewer schema mismatch/);

  const requestedPath = path.join(temp, 'requested-state-substitution');
  const requestedSubstitution = copiedResealedBundle(out, requestedPath, (manifest) => { manifest.requested.find((row) => row.path === 'src').state = 'file'; });
  expectThrow('self-consistently resealed requested-state substitution', () => verifyBundle({ bundle: requestedPath, expectedSha256: requestedSubstitution.bundle_sha256 }), /requested path coverage/);

  const leakedPath = path.join(temp, 'raw-plan-leak');
  const leaked = copiedResealedBundle(out, leakedPath, (manifest, root) => {
    const logical = 'docs/plans/active/sample.md'; const bytes = fs.readFileSync(FIXTURE); const absolute = path.join(root, logical);
    fs.mkdirSync(path.dirname(absolute), { recursive: true }); fs.writeFileSync(absolute, bytes);
    manifest.requested.push({ path: 'docs/plans/active', state: 'directory' }); manifest.requested.sort((a, b) => a.path.localeCompare(b.path));
    manifest.files.push({ path: logical, mode: '100644', sha256: sha256(bytes) }); manifest.files.sort((a, b) => a.path.localeCompare(b.path));
  });
  expectThrow('self-consistently resealed raw-plan leak', () => verifyBundle({ bundle: leakedPath, expectedSha256: leaked.bundle_sha256 }), /exposes raw plan|raw plan leak/);
  fs.chmodSync(path.join(out, 'plan.review.md'), 0o644); expectThrow('post-seal writable mode', () => verifyBundle({ bundle: out, expectedSha256: sealed.bundle_sha256 }), /not sealed read-only/); fs.chmodSync(path.join(out, 'plan.review.md'), 0o444);
  fs.chmodSync(path.join(out, 'plan.review.md'), 0o644); fs.appendFileSync(path.join(out, 'plan.review.md'), 'tamper\n'); fs.chmodSync(path.join(out, 'plan.review.md'), 0o444);
  expectThrow('post-seal file change without caller hash', () => verifyBundle({ bundle: out }), /file hash mismatch/);
  expectThrow('post-seal bundle change', () => verifyBundle({ bundle: out, expectedSha256: sealed.bundle_sha256 }), /hash mismatch/);
  expectThrow('nonexistent reviewed commit', () => sealBundle({ repo, reviewedCommit: 'f'.repeat(40), planPath: 'docs/plans/active/sample.md', requestedPaths: [], outDir: path.join(temp, 'bad') }), /git rev-parse/);
  git(repo, ['update-index', '--add', '--cacheinfo', `160000,${head},vendor/sub`]); git(repo, ['commit', '-qm', 'submodule fixture']); const submoduleHead = git(repo, ['rev-parse', 'HEAD']);
  expectThrow('submodule tree entry', () => sealBundle({ repo, reviewedCommit: submoduleHead, planPath: 'docs/plans/active/sample.md', requestedPaths: ['vendor'], outDir: path.join(temp, 'submodule-bundle') }), /submodule is unsupported/);
  assert.equal(fs.existsSync(path.join(temp, 'submodule-bundle')), false, 'failed seal leaves no partial bundle');
  assert.equal(fs.statSync(out).mode & 0o222, 0, 'bundle root read-only');
  makeWritable(temp); fs.rmSync(temp, { recursive: true, force: true });
  console.log('bundle manifest/hash goldens passed');
}

function testLegs() {
  const fixture = draftBundle(); const req = request({ reviewed_commit_or_head: fixture.head, input_sha256: fixture.sealed.input_sha256, bundle_sha256: fixture.sealed.bundle_sha256 });
  const codex = buildReviewerArgv({ tool: 'codex', bundle: fixture.bundle, model: 'gpt-5.6-sol', effort: 'xhigh', leg: 'X', request: req });
  assert.deepEqual(codex.slice(0, 6), ['exec', '-C', fixture.bundle, '--skip-git-repo-check', '-s', 'read-only']);
  assert.deepEqual(codex.filter((value, index) => codex[index - 1] === '-c'), ['model_reasoning_effort=xhigh', 'service_tier="default"']);
  assert.match(codex.at(-1), /REQUEST_JCS_BEGIN\n\{/); assert.match(codex.at(-1), /REQUEST_JCS_END$/);
  const claude = buildReviewerArgv({ tool: 'claude', bundle: fixture.bundle, model: 'fable', effort: 'high', leg: 'S', request: req });
  assert.deepEqual(claude.slice(0, 3), ['-p', '--permission-mode', 'plan']); assert.ok(claude.includes('--json-schema'));
  const echoed = { schema: 1, leg: 'S', request: req, verdict: 'ready', score: 100, findings: [], confirmations: ['request copied'] };
  assert.equal(extractReviewerOutput('claude', JSON.stringify({ structured_output: echoed }), req, 'S', fixture.bundle).score, 100);
  expectThrow('readable request echo mismatch', () => extractReviewerOutput('claude', JSON.stringify({ structured_output: { ...echoed, request: { ...req, bundle_sha256: '3'.repeat(64) } } }), req, 'S', fixture.bundle), /mismatch/);
  expectThrow('relay rejection', () => buildReviewerArgv({ tool: 'relay', bundle: fixture.bundle, model: 'fable', effort: 'high', leg: 'S', request: req }), /relay is not supported/);
  const openAiAuthorS = buildReviewerArgv({ tool: 'codex', bundle: fixture.bundle, model: 'gpt-5.6-sol', effort: 'xhigh', leg: 'S', request: req });
  assert.equal(openAiAuthorS[openAiAuthorS.indexOf('--output-schema') + 1], path.join(fixture.bundle, 'reviewer-output.S.schema.json'), 'OpenAI-author S Codex uses S schema');
  const fullV3 = requestV3({
    request_id: randomUUID(),
    reviewed_commit_or_head: fixture.head,
    input_sha256: fixture.sealed.input_sha256,
    bundle_sha256: fixture.sealed.bundle_sha256,
  });
  const fullV3Workspace = reviewPolicy.prepareReviewerWorkspace({ requestId: fullV3.request_id, leg: 'S' });
  const fullV3Argv = buildReviewerArgv({ tool: 'codex', bundle: fixture.bundle, reviewerWorkspace: fullV3Workspace, model: 'gpt-5.6-sol', effort: 'high', serviceTier: 'default', leg: 'S', request: fullV3 });
  assert.equal(fullV3Argv[fullV3Argv.indexOf('--output-schema') + 1], path.join(fixture.bundle, 'reviewer-output.S.v3.schema.json'));
  for (const marker of [
    'provable, actionable, unintentional defects',
    'no unstated assumptions',
    'proportionate rigor',
    'exact user requirement, safety property, or execution step',
    'at most five findings',
    'exact weighted rubric sum',
  ]) assert.match(fullV3Argv.at(-1), new RegExp(marker, 'i'), `full reviewer prompt missing ${marker}`);
  reviewPolicy.cleanupReviewerWorkspace({ requestId: fullV3.request_id, leg: 'S', prepared: fullV3Workspace });
  const previousPlan = 'previous canonical plan\n';
  const transition = reviewPolicy.buildRepairTransition({
    fromRoundIndex: 1,
    previousInputSha256: sha256(previousPlan),
    currentInputSha256: fixture.sealed.input_sha256,
    reconciliation: {
      X: { accepted: [], rejected: [] },
      S: { accepted: ['S1'], rejected: [] },
    },
    targets: [{
      id: 'S1', source: 'S', severity: 'high', path: null, locator: null,
      defect: 'The previous repair target was not bound.', fix: 'Bind the exact target.',
      reproduction: { method: 'read', command: null, exit_code: null, evidence_sha256: H0 },
    }],
  });
  const repairBundle = path.join(fixture.temp, 'repair-bundle');
  const repairSealed = sealBundle({
    repo: fixture.repo,
    reviewedCommit: fixture.head,
    planPath: 'docs/plans/active/sample.md',
    requestedPaths: [],
    outDir: repairBundle,
    repair: { previousPlan, transition },
  });
  const repairV3 = requestV3({
    request_id: '323e4567-e89b-42d3-a456-426614174000',
    reviewed_commit_or_head: fixture.head,
    input_sha256: repairSealed.input_sha256,
    bundle_sha256: repairSealed.bundle_sha256,
    review_mode: 'repair',
    round_index: 2,
    previous_input_sha256: transition.previous_input_sha256,
    repair_targets_sha256: transition.repair_targets_sha256,
  });
  const repairV3Argv = buildReviewerArgv({ tool: 'claude', bundle: repairBundle, model: 'fable', effort: 'high', leg: 'X', request: repairV3 });
  assert.match(repairV3Argv.at(-1), /at most three findings/i);
  assert.match(repairV3Argv.at(-1), /accepted repair targets/i);
  assert.match(repairV3Argv.at(-1), /may not reopen unrelated previously accepted design decisions/i);
  assert.equal(classifyLeg({ leg: 'X', policy: POLICY, attempts: [{ result: 'passed' }], eligibleTierCount: 1 }), 'passed');
  assert.equal(classifyLeg({ leg: 'X', policy: POLICY, attempts: [{ result: 'platform_denied' }], eligibleTierCount: 1 }), 'platform_denied');
  assert.equal(classifyLeg({ leg: 'S', policy: POLICY, attempts: [{ result: 'model_unavailable' }, { result: 'model_unavailable' }], eligibleTierCount: 2 }), 'unavailable_model');
  expectThrow('tier_count+1 bound', () => classifyLeg({ leg: 'S', policy: POLICY, attempts: [{ result: 'transient_transport' }, { result: 'model_unavailable' }, { result: 'model_unavailable' }, { result: 'nonzero_exit' }], eligibleTierCount: 2 }), /bound/);
  const never = { ...POLICY, cross_company_consent: 'never' };
  assert.equal(classifyLeg({ leg: 'X', policy: never, attempts: [], eligibleTierCount: 1 }), 'not_authorized');
  assert.equal(classifyLeg({ leg: 'S', policy: never, attempts: [{ result: 'passed' }], eligibleTierCount: 2 }), 'passed');
  fs.chmodSync(path.join(fixture.bundle, 'plan.review.md'), 0o644); fs.appendFileSync(path.join(fixture.bundle, 'plan.review.md'), 'post-leg tamper\n'); fs.chmodSync(path.join(fixture.bundle, 'plan.review.md'), 0o444);
  expectThrow('post-leg bundle change', () => extractReviewerOutput('claude', JSON.stringify({ structured_output: echoed }), req, 'S', fixture.bundle), /hash mismatch/);
  makeWritable(fixture.temp); fs.rmSync(fixture.temp, { recursive: true, force: true });
  console.log('legs: direct argv, versioned full/repair prompts, skip-git, plan mode, JCS echo, attempt bounds, relay rejection, denial and consent separation passed');
}

function testServiceTiers() {
  const schema1 = {
    schema: 1,
    reviewer: { candidates: [{ company: 'openai', tool: 'codex', model: 'gpt-5.6-sol', effort: 'high' }], selector: 'codex:gpt-5.6-sol@high' },
    implementer: { candidates: [{ company: 'openai', tool: 'codex', model: 'gpt-5.6-sol', effort: 'high' }], selector: 'codex:gpt-5.6-sol@high' },
    orchestrator: { candidates: [{ company: 'anthropic', tool: 'claude', model: 'fable', effort: 'high' }], selector: 'profile:claude-best' },
    review: { minimum_score: 90, max_rounds: 3 },
  };
  const schema2 = {
    ...structuredClone(schema1),
    schema: 2,
    reviewer: { candidates: [{ company: 'openai', tool: 'codex', model: 'gpt-5.6-sol', effort: 'high', service_tier: 'fast' }], selector: 'codex:gpt-5.6-sol@high+fast' },
  };

  assert.equal(validateWorkflowModelRecord(schema1).reviewer.selected.service_tier, 'default');
  const validated = validateWorkflowModelRecord(schema2);
  assert.equal(validated.reviewer.selected.service_tier, 'fast');
  assert.equal(validated.implementer.selected.service_tier, 'default', 'one Fast role cannot affect an unsuffixed role');
  assert.equal(validated.reviewer.selector, 'codex:gpt-5.6-sol@high+fast', 'selector attribution is preserved');

  const standardRelay = buildImplementerRelayArgv({ repo: '/repo', invokerSession: 'parent', candidate: validated.implementer.selected, task: 'implement standard' });
  assert.deepEqual(standardRelay, ['spawn', '/repo', '--fanout', '--from', 'parent', '--tool', 'codex', '--model', 'gpt-5.6-sol', '--effort', 'high', '--service-tier', 'default', '--', 'implement standard']);
  const fastRelay = buildImplementerRelayArgv({ repo: '/repo', invokerSession: 'parent', candidate: validated.reviewer.selected, task: 'implement fast' });
  assert.deepEqual(fastRelay, ['spawn', '/repo', '--fanout', '--from', 'parent', '--tool', 'codex', '--model', 'gpt-5.6-sol', '--effort', 'high', '--service-tier', 'fast', '--', 'implement fast']);
  expectThrow('Claude implementer explicit default tier', () => buildImplementerRelayArgv({ repo: '/repo', invokerSession: 'parent', candidate: { company: 'anthropic', tool: 'claude', model: 'fable', effort: 'high', service_tier: 'default' }, task: 'must reject ignored tier' }), /service tier.*Codex-only/i);

  const fixture = draftBundle();
  const req = request({ reviewed_commit_or_head: fixture.head, input_sha256: fixture.sealed.input_sha256, bundle_sha256: fixture.sealed.bundle_sha256 });
  const standardReviewer = buildReviewerArgv({ tool: 'codex', bundle: fixture.bundle, model: 'gpt-5.6-sol', effort: 'high', serviceTier: 'default', leg: 'S', request: req });
  assert.deepEqual(standardReviewer.filter((value, index) => standardReviewer[index - 1] === '-c'), ['model_reasoning_effort=high', 'service_tier="default"']);
  const fastReviewer = buildReviewerArgv({ tool: 'codex', bundle: fixture.bundle, model: 'gpt-5.6-sol', effort: 'high', serviceTier: 'fast', leg: 'S', request: req });
  assert.deepEqual(fastReviewer.filter((value, index) => fastReviewer[index - 1] === '-c'), ['model_reasoning_effort=high', 'features.fast_mode=true', 'service_tier="fast"']);
  expectThrow('Claude reviewer service tier', () => buildReviewerArgv({ tool: 'claude', bundle: fixture.bundle, model: 'fable', effort: 'high', serviceTier: 'fast', leg: 'S', request: req }), /service tier.*Codex-only/i);
  makeWritable(fixture.bundle); fs.rmSync(fixture.temp, { recursive: true, force: true });

  validatePolicy(POLICY_V3);
  expectThrow('schema 3 Claude tier', () => validatePolicy({ ...POLICY_V3, anthropic_tiers: [{ model: 'fable', effort: 'high', service_tier: 'fast', transports: ['cli'] }] }), /service_tier|unknown field/);
  expectThrow('schema 3 unknown Codex tier', () => validatePolicy({ ...POLICY_V3, openai_tiers: [{ model: 'gpt-5.6-sol', effort: 'high', service_tier: 'turbo', transports: ['cli'] }] }), /service_tier/);
  expectThrow('schema 3 in-session Codex tier', () => validatePolicy({ ...POLICY_V3, openai_tiers: [{ model: 'gpt-5.6-sol', effort: 'high', service_tier: 'fast', transports: ['in_session'] }] }), /cli|transport/);

  const requestV2 = request({ schema: 2, policy: POLICY_V3, policy_sha256: sha256(jcs(POLICY_V3)) });
  validateRequest(requestV2);
  assert.equal(reviewerSchema('S', 2).properties.schema.const, 2, 'schema-2 reviewer output is versioned');
  const attemptV2 = attempt({ schema: 2, effort: 'high', service_tier: 'fast' });
  const structuredV2 = { schema: 2, leg: 'S', request: requestV2, verdict: 'ready', score: 100, findings: [], confirmations: ['tier recorded'] };
  const rawV2 = {
    schema: 2,
    leg: 'S',
    request: requestV2,
    result: 'passed',
    attempts: [attemptV2],
    selected: { model: attemptV2.model, effort: attemptV2.effort, service_tier: 'fast', transport: 'cli' },
    reviewer_output: { verdict: 'ready', score: 100, confirmations: ['tier recorded'], structured_output_sha256: sha256(jcs(structuredV2)) },
    findings: [],
    findings_sha256: sha256(jcs([])),
    severity_totals: { high: 0, medium: 0, low: 0 },
    waiver: null,
    waiver_sha256: null,
    decision_evidence: null,
    reason: null,
  };
  validateReviewerOutput(structuredV2, requestV2, 'S');
  validateRawLeg(rawV2, requestV2, 'S');
  expectThrow('schema-2 attempt missing tier', () => validateRawLeg({ ...rawV2, attempts: [{ ...attemptV2, service_tier: undefined }] }, requestV2, 'S'), /service_tier|unknown key|missing/);
  expectThrow('schema-1 attempt tier mutation', () => validateRawLeg({ ...rawV2, schema: 1, request: request(), attempts: [attempt({ service_tier: 'fast' })] }, request(), 'S'), /schema|service_tier|unknown key/);

  for (const [label, record] of [
    ['schema 1 tier field', { ...schema1, reviewer: { candidates: [{ ...schema1.reviewer.candidates[0], service_tier: 'fast' }], selector: 'codex:gpt-5.6-sol@high+fast' } }],
    ['schema 2 without Fast', { ...structuredClone(schema1), schema: 2 }],
    ['Claude tier field', { ...schema2, reviewer: { candidates: [{ company: 'anthropic', tool: 'claude', model: 'fable', effort: 'high', service_tier: 'fast' }], selector: 'claude:fable@high+fast' } }],
    ['unknown tier', { ...schema2, reviewer: { candidates: [{ ...schema2.reviewer.candidates[0], service_tier: 'turbo' }], selector: 'codex:gpt-5.6-sol@high+fast' } }],
    ['explicit default field', { ...schema2, reviewer: { candidates: [{ ...schema2.reviewer.candidates[0], service_tier: 'default' }], selector: 'codex:gpt-5.6-sol@high' } }],
    ['open candidate', { ...schema2, reviewer: { candidates: [{ ...schema2.reviewer.candidates[0], extra: true }], selector: 'codex:gpt-5.6-sol@high+fast' } }],
    ['duplicate suffix', { ...schema2, reviewer: { ...schema2.reviewer, selector: 'codex:gpt-5.6-sol@high+fast+fast' } }],
    ['unknown suffix', { ...schema2, reviewer: { ...schema2.reviewer, selector: 'codex:gpt-5.6-sol@high+turbo' } }],
    ['tier ignored by selector', { ...schema2, reviewer: { ...schema2.reviewer, selector: 'codex:gpt-5.6-sol@high' } }],
    ['duplicate candidate', { ...schema2, reviewer: { candidates: [schema2.reviewer.candidates[0], schema2.reviewer.candidates[0]], selector: 'codex:gpt-5.6-sol@high+fast' } }],
  ]) expectThrow(label, () => validateWorkflowModelRecord(record), /schema|service.tier|selector|candidate|duplicate|unknown/i);

  const restored = validateWorkflowModelRecord(schema1);
  const restoredArgv = buildImplementerRelayArgv({ repo: '/repo', invokerSession: 'parent', candidate: restored.reviewer.selected, task: 'restored standard' });
  assert.ok(restoredArgv.includes('default'));
  assert.ok(!restoredArgv.includes('fast'));
  console.log('service tiers: closed workflow schemas, role isolation, exact reviewer and Relay argv, policy v3, and Standard restoration passed');
}

function productionPrerequisiteProbe(fixture) {
  const root = path.join(fixture.temp, 'production-probe'); const bin = path.join(root, 'bin'); const home = path.join(root, 'home'); fs.mkdirSync(bin, { recursive: true });
  const log = path.join(root, 'remote-git.jsonl'); const realGit = spawnSync('which', ['git'], { encoding: 'utf8' }).stdout.trim(); assert.ok(path.isAbsolute(realGit), 'real git path');
  const gitShim = `#!/usr/bin/env node
import { spawnSync } from 'node:child_process'; import fs from 'node:fs';
const args=process.argv.slice(2); const remote=args[0]==='ls-remote';
if(remote){fs.appendFileSync(process.env.PROBE_LOG,JSON.stringify({args,env:process.env})+'\\n'); const ref=process.env.RELEASE_TAG; if(args.includes('--branches')) process.stdout.write(process.env.RELEASE_COMMIT+'\\trefs/heads/main\\n'); else process.stdout.write(process.env.TAG_OBJECT+'\\trefs/tags/'+ref+'\\n'+process.env.RELEASE_COMMIT+'\\trefs/tags/'+ref+'^{}\\n'); process.exit(0);}
const env={...process.env}; for(const key of Object.keys(env)) if(['GIT_CONFIG','GIT_CONFIG_PARAMETERS','GIT_COMMON_DIR','GIT_WORK_TREE','GIT_DIR'].includes(key)||/^GIT_CONFIG_(KEY|VALUE)_[0-9]+$/.test(key)) delete env[key]; env.GIT_CONFIG_COUNT='0'; delete env.GIT_CONFIG_GLOBAL; delete env.GIT_CONFIG_SYSTEM; delete env.GIT_CONFIG_NOSYSTEM;
const result=spawnSync(process.env.REAL_GIT,args,{encoding:'buffer',env}); if(result.stdout) fs.writeSync(1,result.stdout); if(result.stderr) fs.writeSync(2,result.stderr); process.exit(result.status??1);
`;
  const commandShim = `#!/usr/bin/env node
import path from 'node:path'; const name=path.basename(process.argv[1]); const tag=process.env.RELEASE_TAG; const version=process.env.RELEASE_VERSION; const home=process.env.HOME;
if(name==='gh') process.stdout.write(JSON.stringify({isDraft:false,isPrerelease:false,tagName:tag,url:'https://github.com/DocksDocks/docks/releases/tag/'+tag})+'\\n');
else if(name==='codex') process.stdout.write(JSON.stringify({installed:[{pluginId:'docks@docks',name:'docks',marketplaceName:'docks',version,installed:true,enabled:true,source:{source:'git-subdir',url:'https://github.com/DocksDocks/docks.git',path:'plugins/docks',ref:'main'}}]})+'\\n');
else process.stdout.write(JSON.stringify([{id:'docks@docks',version,scope:'user',enabled:true,installPath:path.join(home,'.claude/plugins/cache/docks/docks',version)}])+'\\n');
`;
  fs.writeFileSync(path.join(bin, 'git'), gitShim, { mode: 0o755 }); for (const name of ['gh', 'codex', 'claude']) fs.writeFileSync(path.join(bin, name), commandShim, { mode: 0o755 });
  const source = gitBytes(fixture.repo, ['show', `${fixture.releaseCommit}:${POLICY_PATH}`]);
  for (const runtime of ['.codex', '.claude']) writeLogical(home, `${runtime}/plugins/cache/docks/docks/${RELEASE_VERSION}/skills/productivity/plan-review/scripts/review-policy.mjs`, source);
  const globalConfig = path.join(root, 'global.gitconfig'); const systemConfig = path.join(root, 'system.gitconfig'); const explicitConfig = path.join(root, 'explicit.gitconfig');
  for (const file of [globalConfig, systemConfig, explicitConfig]) fs.writeFileSync(file, '[url "file:///ambient-redirect"]\n\tinsteadOf = https://github.com/DocksDocks/docks.git\n');
  git(fixture.repo, ['config', 'url.file:///repository-redirect.insteadOf', 'https://github.com/DocksDocks/docks.git']);
  const env = {
    ...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH}`, HOME: home, REAL_GIT: realGit, PROBE_LOG: log,
    RELEASE_COMMIT: fixture.releaseCommit, RELEASE_TAG, RELEASE_VERSION, TAG_OBJECT: 'b'.repeat(40),
    GIT_CONFIG: explicitConfig, GIT_CONFIG_PARAMETERS: "'url.file:///parameter-redirect.insteadOf'='https://github.com/DocksDocks/docks.git'",
    GIT_COMMON_DIR: path.join(root, 'wrong-common'), GIT_WORK_TREE: path.join(root, 'wrong-worktree'), GIT_DIR: path.join(root, 'wrong-gitdir'),
    GIT_CONFIG_GLOBAL: globalConfig, GIT_CONFIG_SYSTEM: systemConfig, GIT_CONFIG_NOSYSTEM: '0', GIT_CONFIG_COUNT: '1',
    GIT_CONFIG_KEY_0: 'url.file:///count-redirect.insteadOf', GIT_CONFIG_VALUE_0: 'https://github.com/DocksDocks/docks.git',
  };
  const input = prerequisiteInput(fixture); const args = ['compatibility-prerequisite', input.repo, input.planPath, input.finishedPlanPath, input.finishedPlanCommit, input.releaseVersion, input.evidenceCommit, input.compatibilityReviewCommit, input.bindingCommit, input.authorizationId, input.authorizationSha256];
  const result = spawnSync(process.execPath, [fixture.compatibilityHelper, ...args], { cwd: fixture.repo, env, encoding: 'utf8' }); assert.equal(result.status, 0, result.stderr); assert.equal(result.stderr, '');
  const application = JSON.parse(result.stdout); assert.match(application.application_sha256, /^[0-9a-f]{64}$/);
  const rows = fs.readFileSync(log, 'utf8').trim().split('\n').map(JSON.parse); assert.equal(rows.length, 2, 'exactly two canonical remote children');
  assert.deepEqual(rows[0].args, ['ls-remote', '--exit-code', '--branches', 'https://github.com/DocksDocks/docks.git', 'refs/heads/main']);
  assert.deepEqual(rows[1].args, ['ls-remote', '--exit-code', '--tags', 'https://github.com/DocksDocks/docks.git', `refs/tags/${RELEASE_TAG}`, `refs/tags/${RELEASE_TAG}^{}`]);
  for (const row of rows) {
    assert.equal(row.env.GIT_DIR, os.devNull); assert.equal(row.env.GIT_CONFIG_GLOBAL, os.devNull); assert.equal(row.env.GIT_CONFIG_SYSTEM, os.devNull);
    assert.equal(row.env.GIT_CONFIG_NOSYSTEM, '1'); assert.equal(row.env.GIT_CONFIG_COUNT, '0');
    for (const key of ['GIT_CONFIG', 'GIT_CONFIG_PARAMETERS', 'GIT_COMMON_DIR', 'GIT_WORK_TREE', 'GIT_CONFIG_KEY_0', 'GIT_CONFIG_VALUE_0']) assert.equal(row.env[key], undefined, `${key} removed from canonical remote child`);
  }
  return application;
}

function testStrictCompletionReuse() {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'review-policy-strict-reuse-')); const repo = path.join(temp, 'repo'); initializeRepository(repo);
  writeLogical(repo, 'seed.txt', 'seed\n'); const plannedAt = commitAll(repo, 'seed');
  const planPath = 'docs/plans/active/strict.md'; let plan = fixturePlan({ plannedAt, cleanReceipt: true }); writeLogical(repo, planPath, plan); commitAll(repo, 'add strict plan');
  plan = replaceOnce(plan, 'status: planned', 'status: ongoing'); plan = replaceOnce(plan, 'started_at: null', 'started_at: "2026-07-13T12:00:00.000Z"'); writeLogical(repo, planPath, plan); const executionBase = commitAll(repo, 'start strict plan');
  plan = replaceOnce(plan, 'execution_base_commit: null', `execution_base_commit: "${executionBase}"`); writeLogical(repo, planPath, plan); const head = commitAll(repo, 'record strict identity');
  assert.deepEqual(validateExecutionRange({ repo, planPath, plannedAtCommit: plannedAt, executionBaseCommit: executionBase, reviewedHead: head }), { schema: 1, planned_at_commit: plannedAt, execution_base_commit: executionBase, reviewed_head: head, execution_parent: git(repo, ['rev-parse', `${executionBase}^`]) });
  const receipt = completionReceiptFor(head, Buffer.from(plan)); let completed = applyCompletionReviewBlock(Buffer.from(plan), receipt).toString(); completed = replaceOnce(completed, 'review_status: null', 'review_status: passed'); writeLogical(repo, planPath, completed); const completionCommit = commitAll(repo, 'complete strict plan');
  validateCompletionReviewReuse({ repo, planPath, reviewedHead: head, completionCommit, receipt, expectedPolicy: receipt.policy });
  expectThrow('completion reuse requires current policy', () => validateCompletionReviewReuse({ repo, planPath, reviewedHead: head, completionCommit, receipt }), /policy schema/);
  expectThrow('policy v1 completion is not reusable under policy v2', () => validateCompletionReviewReuse({ repo, planPath, reviewedHead: head, completionCommit, receipt, expectedPolicy: POLICY_V2 }), /resolved policy mismatch/);
  for (const [label, applyChange] of [
    ['Review heading', (value) => replaceOnce(value, '## Review\n', '## Reviews\n')],
    ['Review label', (value) => replaceOnce(value, '**Goal met:**', '**Goal status:**')],
    ['Review punctuation', (value) => replaceOnce(value, '**CI:**', '**CI**:')],
    ['Review extra prose', (value) => replaceOnce(value, '## Review\n', '## Review\nUnexpected prose.\n')],
    ['Review receipt byte', (value) => replaceOnce(value, 'Completion-review-receipt: {', 'Completion-review-receipt: {"extra":true,')],
    ['Review CRLF', (value) => value.replaceAll('\n', '\r\n')],
    ['Review separator', (value) => replaceOnce(value, '\n## Review\n', '## Review\n')],
    ['Review final LF', (value) => value.slice(0, -1)],
  ]) {
    git(repo, ['checkout', '-q', '--detach', head]); writeLogical(repo, planPath, applyChange(completed)); const candidate = commitAll(repo, `mutated completion ${label}`);
    expectThrow(`completion reuse ${label}`, () => validateCompletionReviewReuse({ repo, planPath, reviewedHead: head, completionCommit: candidate, receipt, expectedPolicy: receipt.policy }), /completion|Review|delta|LF|receipt|plan/i);
  }
  git(repo, ['checkout', '-q', '--detach', head]);
  const v2Receipt = completionReceiptFor(head, Buffer.from(plan), { policy: POLICY_V2 });
  let v2Completed = applyCompletionReviewBlock(Buffer.from(plan), v2Receipt).toString();
  v2Completed = replaceOnce(v2Completed, 'review_status: null', 'review_status: passed');
  writeLogical(repo, planPath, v2Completed); const v2CompletionCommit = commitAll(repo, 'complete strict plan with policy v2');
  validateCompletionReviewReuse({ repo, planPath, reviewedHead: head, completionCommit: v2CompletionCommit, receipt: v2Receipt, expectedPolicy: POLICY_V2 });
  const lowerThreshold = { ...POLICY_V2, minimum_score: 80, provenance: { ...POLICY_V2.provenance, minimum_score: 'current_user' } };
  expectThrow('policy v2 threshold change invalidates completion reuse', () => validateCompletionReviewReuse({ repo, planPath, reviewedHead: head, completionCommit: v2CompletionCommit, receipt: v2Receipt, expectedPolicy: lowerThreshold }), /resolved policy mismatch/);
  const provenanceChange = { ...POLICY_V2, provenance: { ...POLICY_V2.provenance, max_rounds: 'current_user' } };
  expectThrow('policy v2 provenance change invalidates completion reuse', () => validateCompletionReviewReuse({ repo, planPath, reviewedHead: head, completionCommit: v2CompletionCommit, receipt: v2Receipt, expectedPolicy: provenanceChange }), /resolved policy mismatch/);
  git(repo, ['checkout', '-q', '--detach', head]);
  const currentInventory = acceptanceInventory(Buffer.from(plan));
  const currentReq = currentRequest({
    phase: 'completion',
    reviewed_commit_or_head: head,
    planned_at_commit: plannedAt,
    execution_base_commit: executionBase,
    diff_sha256: H0,
    acceptance_inventory_sha256: sha256(jcs(currentInventory)),
    input_sha256: sha256(canonicalPlanView(Buffer.from(plan))),
  });
  const currentRunResult = currentRun(currentReq, currentRaw(currentReq), { primary: primaryEvidence(currentInventory) });
  const currentReceiptValue = currentReceipt(currentReq, currentRunResult);
  let currentCompleted = applyCompletionReviewBlock(Buffer.from(plan), currentReceiptValue).toString();
  currentCompleted = replaceOnce(currentCompleted, 'review_status: null', 'review_status: passed');
  writeLogical(repo, planPath, currentCompleted);
  const currentCompletionCommit = commitAll(repo, 'complete strict plan with schema-5 primary review');
  validateCompletionReviewReuse({
    repo,
    planPath,
    reviewedHead: head,
    completionCommit: currentCompletionCommit,
    receipt: currentReceiptValue,
    expectedPolicy: CURRENT_POLICY,
  });
  for (const [label, sourcePlan] of [
    ['plain', plan],
    ['compatibility records', replaceOnce(
      plan,
      '## Review\n',
      'Compatibility-review-material: {}\n```diff\nunchanged\n```\nExecution-base-compatibility-receipt: {}\nExecution-base-compatibility-binding: {}\n\n## Review\n',
    )],
  ]) {
    git(repo, ['checkout', '-q', '--detach', head]);
    const withoutFinalLf = sourcePlan.slice(0, -1);
    writeLogical(repo, planPath, withoutFinalLf);
    const reviewedWithoutFinalLf = commitAll(repo, `review ${label} without final LF`);
    const inventoryWithoutFinalLf = acceptanceInventory(Buffer.from(withoutFinalLf));
    const requestWithoutFinalLf = currentRequest({
      phase: 'completion',
      reviewed_commit_or_head: reviewedWithoutFinalLf,
      planned_at_commit: plannedAt,
      execution_base_commit: executionBase,
      diff_sha256: H0,
      acceptance_inventory_sha256: sha256(jcs(inventoryWithoutFinalLf)),
      input_sha256: sha256(canonicalPlanView(Buffer.from(withoutFinalLf))),
    });
    const runWithoutFinalLf = currentRun(requestWithoutFinalLf, currentRaw(requestWithoutFinalLf), {
      primary: primaryEvidence(inventoryWithoutFinalLf),
    });
    const receiptWithoutFinalLf = currentReceipt(requestWithoutFinalLf, runWithoutFinalLf);
    let completedWithoutFinalLf = applyCompletionReviewBlock(Buffer.from(`${withoutFinalLf}\n`), receiptWithoutFinalLf).toString();
    completedWithoutFinalLf = replaceOnce(completedWithoutFinalLf, 'review_status: null', 'review_status: passed');
    writeLogical(repo, planPath, completedWithoutFinalLf);
    const completionWithoutFinalLf = commitAll(repo, `complete ${label} without final LF`);
    validateCompletionReviewReuse({
      repo,
      planPath,
      reviewedHead: reviewedWithoutFinalLf,
      completionCommit: completionWithoutFinalLf,
      receipt: receiptWithoutFinalLf,
      expectedPolicy: CURRENT_POLICY,
    });
  }
  git(repo, ['checkout', '-q', '--detach', head]);
  const currentWaiver = {
    phase: 'completion',
    input_sha256: currentReq.input_sha256,
    roles: ['primary'],
    actor: 'test user',
    reason: 'explicit completion waiver',
    at: '2026-07-17T00:00:00-03:00',
  };
  const waivedRaw = currentRaw(currentReq, null, {
    result: 'waived',
    attempts: [],
    selected: null,
    reviewer_output: null,
    findings_sha256: null,
    waiver: currentWaiver,
    waiver_sha256: sha256(jcs(currentWaiver)),
    reason: null,
  });
  const waivedRun = currentRun(currentReq, waivedRaw, { primary: primaryEvidence(currentInventory) });
  const waivedReceipt = currentReceipt(currentReq, waivedRun);
  let waivedCompleted = applyCompletionReviewBlock(Buffer.from(plan), waivedReceipt, { waivers: [currentWaiver] }).toString();
  waivedCompleted = replaceOnce(waivedCompleted, 'review_status: null', 'review_status: passed');
  writeLogical(repo, planPath, waivedCompleted);
  const waivedCompletionCommit = commitAll(repo, 'complete strict plan with schema-5 waiver');
  expectThrow('completion waiver reuse requires the exact waiver', () => validateCompletionReviewReuse({
    repo,
    planPath,
    reviewedHead: head,
    completionCommit: waivedCompletionCommit,
    receipt: waivedReceipt,
    expectedPolicy: CURRENT_POLICY,
  }), /waiver.*snapshot/i);
  validateCompletionReviewReuse({
    repo,
    planPath,
    reviewedHead: head,
    completionCommit: waivedCompletionCommit,
    receipt: waivedReceipt,
    expectedPolicy: CURRENT_POLICY,
    waivers: [currentWaiver],
  });
  fs.rmSync(temp, { recursive: true, force: true });
}

function testCompletionReviewRenderer() {
  const plan = Buffer.from(fixturePlan({ cleanReceipt: true })); const head = 'c'.repeat(40); const receipt = completionReceiptFor(head, plan);
  const receiptKeys = Object.keys(receipt); const block = completionReviewBlockV1(receipt);
  assert.deepEqual(Object.keys(block), ['schema', 'goal_met', 'regressions', 'ci', 'followups', 'filed_by', 'cross_check']);
  assert.deepEqual(Object.keys(block.cross_check), ['date', 'X', 'S', 'reproduced_ids', 'orchestrator']);
  assert.deepEqual(Object.keys(block.cross_check.X), ['company', 'model', 'effort', 'result', 'finding_count', 'accepted', 'rejected']);
  const rendered = renderCompletionReviewBlock(receipt); assert.ok(rendered.endsWith(`Completion-review-receipt: ${jcs(receipt)}\n`)); assert.deepEqual(Object.keys(receipt), receiptKeys, 'renderer leaves receipt keys unchanged');
  const applied = applyCompletionReviewBlock(plan, receipt); assert.equal(applyCompletionReviewBlock(applied, receipt).toString(), applied.toString(), 'same receipt apply is idempotent');
  assert.equal(completionStablePlanViewV1(plan), completionStablePlanViewV1(applied));
  const following = Buffer.from(replaceOnce(plan.toString(), '## Review\n\n*(filled by plan-review on completion)*\n', '## Review\n\n*(filled by plan-review on completion)*\n\n## Following section\n\nFollowing bytes.\n'));
  const followingApplied = applyCompletionReviewBlock(following, receipt).toString(); assert.match(followingApplied, /Completion-review-receipt: .*\n\n## Following section\n/);
  expectThrow('duplicate Review heading', () => applyCompletionReviewBlock(Buffer.from(`${plan}\n## Review\n`), receipt), /duplicate body heading|one unfenced ## Review/);
  expectThrow('CRLF Review input', () => applyCompletionReviewBlock(Buffer.from(plan.toString().replaceAll('\n', '\r\n')), receipt), /LF UTF-8/);

  const specialCharacterPrimary = {
    ...receipt.primary, goal_met: 'no', ci: { ...receipt.primary.ci, command: 'node\n## injected\n```', exit_code: 1, first_failure: 'fail\r\n</review>\u202e🚀' },
    regressions: ['line\n## Review\n```\u2028'], followups: ['<script>\u2029🚀'],
  };
  const specialCharacters = { ...receipt, primary: specialCharacterPrimary, completion_verdict: 'regressed' }; const specialCharacterRendering = renderCompletionReviewBlock(specialCharacters);
  assert.doesNotMatch(specialCharacterRendering, /\n## injected\n|\n<script>/); assert.match(specialCharacterRendering, /\\u000a|\\u2028|\\ud83d\\ude80/);

  const inventory = acceptanceInventory(plan); const req = request({ phase: 'completion', reviewed_commit_or_head: head, planned_at_commit: head, execution_base_commit: head, diff_sha256: H0, acceptance_inventory_sha256: sha256(jcs(inventory)), input_sha256: sha256(canonicalPlanView(plan)) });
  const finding = (id, severity = 'low') => ({ id, severity, section: 'Review', path: null, locator: null, defect: `defect ${id}`, fix: `fix ${id}`, evidence: `evidence ${id}` });
  const Xraw = rawPassed(req, 'X', null, [finding('X2'), finding('X1')]); const Sraw = rawPassed(req, 'S', null, [finding('S2'), finding('S1')]);
  const reproduced = ['X2', 'X1'].map((id) => { const source = Xraw.findings.find((row) => row.id === id); return { id, source: 'X', severity: source.severity, path: source.path, locator: source.locator, defect: source.defect, fix: source.fix, reproduction: { method: 'read', command: null, exit_code: null, evidence_sha256: H0 } }; });
  const orderedReceipt = {
    schema: 1, phase: 'completion', request: req, planned_at_commit: head, execution_base_commit: head, reviewed_head: head, diff_sha256: H0,
    plan_input_sha256: req.input_sha256, acceptance_inventory: inventory, acceptance_inventory_sha256: req.acceptance_inventory_sha256,
    author: req.author, policy: req.policy, policy_sha256: req.policy_sha256,
    X: { request: req, raw: Xraw, reconciliation: { accepted: ['X2', 'X1'], rejected: [] } },
    S: { request: req, raw: Sraw, reconciliation: { accepted: [], rejected: [{ id: 'S2', reason: 'two' }, { id: 'S1', reason: 'one' }] } },
    reproduced, decision_evidence: null, primary: primaryEvidence(inventory), completion_verdict: 'passed', outcome: 'dual', reviewed_at: '2026-07-13T13:00:00.000Z',
  };
  const ordered = renderCompletionReviewBlock(orderedReceipt); assert.match(ordered, /accepted X1,X2/); assert.match(ordered, /rejected S1="one",S2="two"/); assert.match(ordered, /verified X1,X2/);
  const singleReq = request({ ...req }); const Xauth = rawAuth(singleReq, 'X'); const Spass = rawPassed(singleReq, 'S');
  const noX = { ...orderedReceipt, request: singleReq, X: persisted(Xauth), S: persisted(Spass), reproduced: [], outcome: 'single' };
  assert.equal(completionReviewBlockV1(noX).cross_check, null, 'unavailable X omits cross-check');
}

function testExecutionScopeLedger() {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'review-policy-scope-ledger-')); const repo = path.join(temp, 'repo'); initializeRepository(repo);
  const planPath = 'docs/plans/active/scope.md'; let plan = fixturePlan({ cleanReceipt: true }); writeLogical(repo, planPath, plan); writeLogical(repo, 'src/example.js', 'one\n'); const base = commitAll(repo, 'scope base');
  writeLogical(repo, 'src/example.js', 'two\n'); const sourceCommit = commitAll(repo, 'allowed source change');
  git(repo, ['commit', '--allow-empty', '-qm', 'intentional empty scope event']); const emptyCommit = git(repo, ['rev-parse', 'HEAD']);
  plan = replaceOnce(plan, 'updated: "2026-07-12T00:00:00-03:00"', 'updated: "2026-07-13T16:00:00.000Z"'); writeLogical(repo, planPath, plan); const head = commitAll(repo, 'allowed plan change');
  const allowedPreimage = { schema: 1, paths: [planPath, 'src/example.js'] };
  const expectedAllowedPathsSha256 = sha256(jcs(allowedPreimage));
  const result = validateExecutionScope({ repo, base, head, planPath, expectedAllowedPathsSha256 }); assert.equal(result.commit_count, 3);
  const ledgerPreimage = { schema: 1, base, head, commits: [
    { ordinal: 1, commit: sourceCommit, parent: base, paths: ['src/example.js'] },
    { ordinal: 2, commit: emptyCommit, parent: sourceCommit, paths: [] },
    { ordinal: 3, commit: head, parent: emptyCommit, paths: [planPath] },
  ] };
  assert.equal(result.allowed_paths_sha256, expectedAllowedPathsSha256, 'scope allowed paths are exact UTF-16 sorted JCS'); assert.equal(result.changed_paths_sha256, sha256(jcs(ledgerPreimage)), 'scope ledger retains chronological order and empty commits');
  const resultPreimage = { schema: 1, base, head, commit_count: 3, allowed_paths_sha256: result.allowed_paths_sha256, changed_paths_sha256: result.changed_paths_sha256 };
  assert.equal(result.result_sha256, sha256(jcs(resultPreimage)), 'scope result self-hash');
  const cli = helper(repo, ['execution-scope', repo, base, head, planPath, expectedAllowedPathsSha256]); assert.equal(cli.status, 0, cli.stderr); assert.deepEqual(JSON.parse(cli.stdout), result, 'execution-scope CLI requires and preserves the reviewer-sealed allowed-path hash');
  for (const args of [
    ['execution-scope', repo, base, head, planPath],
    ['execution-scope', repo, base, head, planPath, expectedAllowedPathsSha256, 'extra'],
  ]) { const closed = helper(repo, args); assert.notEqual(closed.status, 0); assert.match(closed.stderr, /accepts .* only/); }
  writeLogical(repo, 'outside.txt', 'outside\n'); const outside = commitAll(repo, 'outside scope'); expectThrow('per-commit outside scope', () => validateExecutionScope({ repo, base, head: outside, planPath, expectedAllowedPathsSha256 }), /execution scope path is not allowed/);
  git(repo, ['checkout', '-q', '--detach', head]); const broadened = replaceOnce(plan, '  - src/example.js\n', '  - src/example.js\n  - outside.txt\n'); writeLogical(repo, planPath, broadened); commitAll(repo, 'self-broaden scope manifest'); writeLogical(repo, 'outside.txt', 'newly admitted\n'); const selfBroadenedHead = commitAll(repo, 'change self-admitted path');
  expectThrow('self-broadened scope manifest', () => validateExecutionScope({ repo, base, head: selfBroadenedHead, planPath, expectedAllowedPathsSha256 }), /sealed allowed paths hash mismatch/);
  git(repo, ['checkout', '-q', '--detach', head]); let duplicate = replaceOnce(plan, '  - src/example.js\n', '  - src/example.js\n  - src/example.js\n'); writeLogical(repo, planPath, duplicate); const duplicateHead = commitAll(repo, 'duplicate scope entry');
  expectThrow('duplicate scope manifest', () => validateExecutionScope({ repo, base, head: duplicateHead, planPath, expectedAllowedPathsSha256 }), /duplicates/);
  git(repo, ['checkout', '-q', '--detach', head]); git(repo, ['checkout', '-qb', 'scope-side']); writeLogical(repo, 'src/example.js', 'side\n'); commitAll(repo, 'scope side');
  git(repo, ['checkout', '-q', '--detach', head]); writeLogical(repo, planPath, replaceOnce(plan, 'updated: "2026-07-13T16:00:00.000Z"', 'updated: "2026-07-13T16:01:00.000Z"')); commitAll(repo, 'scope first parent'); git(repo, ['merge', '--no-ff', '-qm', 'scope merge', 'scope-side']); const merge = git(repo, ['rev-parse', 'HEAD']);
  expectThrow('scope merge', () => validateExecutionScope({ repo, base, head: merge, planPath, expectedAllowedPathsSha256 }), /single-parent/); fs.rmSync(temp, { recursive: true, force: true });
}

function testClosedSelectors() {
  for (const malformed of [
    ['--case'], ['--case', 'unknown'], ['--case', 'execution-compatibility', 'extra'],
    ['--case', 'strict-differential'], ['--baseline', '0'.repeat(40), '--case', 'strict-differential'],
    ['--case', 'strict-differential', '--baseline', '0'.repeat(40), 'extra'],
  ]) {
    const result = spawnSync(process.execPath, [HARNESS, ...malformed], { cwd: ROOT, encoding: 'utf8' }); assert.notEqual(result.status, 0, `selector ${malformed.join(' ')}`); assert.equal(result.stdout, ''); assert.match(result.stderr, /unknown or malformed/);
  }
}

function testStrictCorpusContract() {
  assert.equal(STRICT_CASES.length, 23, 'strict corpus case count'); assert.equal(new Set(STRICT_CASES).size, STRICT_CASES.length, 'strict corpus cases are unique');
  assert.equal(sha256(jcs({ schema: 1, cases: STRICT_CASES })), STRICT_CORPUS_SHA256, 'strict corpus identity');
  const source = fs.readFileSync(HARNESS, 'utf8');
  for (const comparison of ['assert.equal(newResult.status, oldResult.status', 'assert.deepEqual(newResult.stdout, oldResult.stdout', 'assert.deepEqual(newResult.stderr, oldResult.stderr']) assert.equal(source.split(comparison).length - 1, 2, `strict differential retains raw comparison: ${comparison}`);
}

async function testExecutionCompatibility() {
  assert.equal(sha256(jcs(LEGACY_START_TRANSITION_COMPATIBILITY_POLICY)), LEGACY_START_TRANSITION_COMPATIBILITY_POLICY_SHA256);
  testLegacyShapeNegatives();
  const fixture = await buildCompatibilityRepository(); const input = prerequisiteInput(fixture);
  expectThrow('legacy shape without evidence', () => compatibilityRange(fixture.compatibilityHelper, { repo: fixture.repo, planPath: TARGET_PLAN, plannedAtCommit: fixture.plannedAt, executionBaseCommit: fixture.executionBaseCommit, reviewedHead: fixture.releaseCommit }), /execution compatibility evidence missing/);
  const authorizedEvidenceInput = { repo: fixture.repo, reviewedHead: fixture.releaseCommit, planPath: TARGET_PLAN, plannedAtCommit: fixture.plannedAt, executionBaseCommit: fixture.executionBaseCommit };
  for (const [label, override, pattern] of [
    ['authorization id', { authorizationId: 'wrong' }, /owner confirmation source mismatch/],
    ['authorization plan path', { planPath: 'docs/plans/active/relay-worker-lifecycle-primitives-replay.md' }, /owner confirmation plan target mismatch/],
    ['authorization planned commit', { plannedAtCommit: 'f'.repeat(40) }, /owner confirmation planned target mismatch/],
    ['authorization execution-base commit', { executionBaseCommit: 'e'.repeat(40) }, /owner confirmation execution target mismatch/],
  ]) expectThrow(label, () => compatibilityEvidence(fixture.compatibilityHelper, { ...authorizedEvidenceInput, ...override }), pattern);
  const replayPlanPath = 'docs/plans/active/relay-worker-lifecycle-primitives-replay.md'; const replayBytes = gitBytes(fixture.repo, ['show', `${fixture.releaseCommit}:${TARGET_PLAN}`]);
  git(fixture.repo, ['checkout', '-q', '--detach', fixture.releaseCommit]); writeLogical(fixture.repo, replayPlanPath, replayBytes); const replayHead = commitAll(fixture.repo, 'add exact-shape replay target');
  assert.deepEqual(gitBytes(fixture.repo, ['show', `${replayHead}:${replayPlanPath}`]), replayBytes, 'authorization replay target has the exact authorized plan shape');
  expectThrow('alternate exact-shape plan authorization replay', () => buildExecutionBaseCompatibilityApplication({ repo: fixture.repo, reviewedHead: replayHead, planPath: replayPlanPath, plannedAtCommit: PRODUCTION_COMPATIBILITY_PLANNED_AT, executionBaseCommit: PRODUCTION_COMPATIBILITY_EXECUTION_BASE, authorizationId: COMPATIBILITY_AUTHORIZATION_ID, ownerMessageSha256: COMPATIBILITY_AUTHORIZATION_SHA256 }), /owner confirmation plan target mismatch/);
  git(fixture.repo, ['checkout', '-q', '--detach', fixture.bindingCommit]);
  const evidenceReceipt = JSON.parse(fixture.evidenceApplication.markdown.match(/Execution-base-compatibility-receipt: (\{.*\})\n/)[1]);
  const storedDigestReceipt = structuredClone(evidenceReceipt); storedDigestReceipt.owner_confirmation.authorization_scope_sha256 = 'f'.repeat(64); delete storedDigestReceipt.receipt_sha256; storedDigestReceipt.receipt_sha256 = sha256(jcs(storedDigestReceipt));
  const storedDigestMarkdown = replaceOnce(fixture.evidenceApplication.markdown, `Execution-base-compatibility-receipt: ${jcs(evidenceReceipt)}\n`, `Execution-base-compatibility-receipt: ${jcs(storedDigestReceipt)}\n`, 'stored authorization scope digest record');
  git(fixture.repo, ['checkout', '-q', '--detach', fixture.releaseCommit]); const storedDigestBytes = insertBeforeReviewForTest(gitBytes(fixture.repo, ['show', `${fixture.releaseCommit}:${TARGET_PLAN}`]), storedDigestMarkdown); writeLogical(fixture.repo, TARGET_PLAN, storedDigestBytes); const storedDigestE = commitAll(fixture.repo, 'alter stored authorization scope digest');
  const storedDigestReview = findingsFreeDraftReceipt(storedDigestE, storedDigestBytes, 'single'); writeLogical(fixture.repo, TARGET_PLAN, insertOrReplaceDraftReceiptForTest(storedDigestBytes, storedDigestReview)); const storedDigestR = commitAll(fixture.repo, 'review altered authorization scope digest');
  expectThrow('stored authorization scope digest', () => compatibilityBinding(fixture.compatibilityHelper, { repo: fixture.repo, planPath: TARGET_PLAN, evidenceCommit: storedDigestE, reviewCommit: storedDigestR }), /stored authorization scope digest mismatch/);
  git(fixture.repo, ['checkout', '-q', '--detach', fixture.bindingCommit]);
  assert.deepEqual(evidenceReceipt.changed_sections.map((row) => row.name), ['Environment & how-to-run', 'Open questions', 'Threat model']);
  assert.equal(evidenceReceipt.plan_creation_commit, fixture.creationCommit); assert.equal(evidenceReceipt.evidence_input_commit, fixture.releaseCommit);
  const material = JSON.parse(fixture.evidenceApplication.markdown.match(/^Compatibility-review-material: (\{.*\})$/m)[1]);
  const opening = fixture.evidenceApplication.markdown.match(/^(`{3,})diff$/m)[1]; const diffStart = fixture.evidenceApplication.markdown.indexOf(`${opening}diff\n`) + opening.length + 5; const diffEnd = fixture.evidenceApplication.markdown.indexOf(`${opening}\nExecution-base-compatibility-receipt:`, diffStart); const recordedDiff = fixture.evidenceApplication.markdown.slice(diffStart, diffEnd);
  const diffEnv = { ...process.env }; delete diffEnv.GIT_DIFF_OPTS;
  const expectedLegacyDiffArgs = [
    '--no-pager', '-c', 'diff.algorithm=myers', '-c', 'diff.context=3', '-c', 'diff.interHunkContext=0', '-c', 'diff.suppressBlankEmpty=false', '-c', 'diff.indentHeuristic=false', '-c', 'diff.renames=false',
    'diff', '--text', '--binary', '--full-index', '--no-renames', '--diff-algorithm=myers', '--unified=3', '--inter-hunk-context=0', '--no-indent-heuristic', '--no-ext-diff', '--no-textconv', '--no-color', '--src-prefix=a/', '--dst-prefix=b/',
    evidenceReceipt.execution_parent, evidenceReceipt.execution_base_commit, '--', TARGET_PLAN,
  ];
  const expectedTransitionDiffArgs = [
    '--no-pager', '-c', 'diff.algorithm=myers', '-c', 'diff.context=3', '-c', 'diff.interHunkContext=0', '-c', 'diff.suppressBlankEmpty=false', '-c', 'diff.indentHeuristic=false', '-c', 'diff.renames=false',
    'diff', '--no-index', '--text', '--binary', '--full-index', '--no-renames', '--diff-algorithm=myers', '--unified=3', '--inter-hunk-context=0', '--no-indent-heuristic', '--no-ext-diff', '--no-textconv', '--no-color', '--no-prefix',
    '--', `a/${TARGET_PLAN}`, `b/${TARGET_PLAN}`,
  ];
  const directDiff = spawnSync('git', expectedLegacyDiffArgs, { cwd: fixture.repo, encoding: 'utf8', env: diffEnv });
  assert.equal(directDiff.status, 0, directDiff.stderr); assert.equal(recordedDiff, directDiff.stdout, 'transition diff is byte-exact canonical Git output');
  assert.match(recordedDiff, /^diff --git /); assert.doesNotMatch(recordedDiff, /^GIT binary patch$/m, 'transition material remains textual');
  const rebuildEvidence = () => compatibilityEvidence(fixture.compatibilityHelper, { repo: fixture.repo, reviewedHead: fixture.releaseCommit, planPath: TARGET_PLAN, plannedAtCommit: fixture.plannedAt, executionBaseCommit: fixture.executionBaseCommit });
  const rebuildBinding = () => compatibilityBinding(fixture.compatibilityHelper, { repo: fixture.repo, planPath: TARGET_PLAN, evidenceCommit: fixture.evidenceCommit, reviewCommit: fixture.compatibilityReviewCommit });
  const captureBin = path.join(fixture.temp, 'capture-bin'); const captureLog = path.join(fixture.temp, 'captured-git.jsonl'); fs.mkdirSync(captureBin);
  const captureGit = `#!/usr/bin/env node
import { spawnSync } from 'node:child_process'; import fs from 'node:fs';
const args=process.argv.slice(2); const cwd=process.cwd(); const noIndex=args.includes('--no-index'); const artifacts=noIndex?args.slice(-2):[];
const row={args,cwd,artifact_modes:artifacts.map((file)=>fs.statSync(file).mode&0o777),attributes:fs.existsSync('.git/info/attributes')?fs.readFileSync('.git/info/attributes','utf8'):null,env:{GIT_CONFIG_GLOBAL:process.env.GIT_CONFIG_GLOBAL,GIT_CONFIG_SYSTEM:process.env.GIT_CONFIG_SYSTEM,GIT_CONFIG_NOSYSTEM:process.env.GIT_CONFIG_NOSYSTEM,GIT_CONFIG_COUNT:process.env.GIT_CONFIG_COUNT,GIT_ATTR_NOSYSTEM:process.env.GIT_ATTR_NOSYSTEM,GIT_ATTR_SOURCE:process.env.GIT_ATTR_SOURCE,GIT_CONFIG:process.env.GIT_CONFIG,GIT_CONFIG_PARAMETERS:process.env.GIT_CONFIG_PARAMETERS,GIT_DIFF_OPTS:process.env.GIT_DIFF_OPTS,GIT_DIR:process.env.GIT_DIR,GIT_EXTERNAL_DIFF:process.env.GIT_EXTERNAL_DIFF}};
fs.appendFileSync(process.env.TRANSITION_GIT_LOG,JSON.stringify(row)+'\\n');
if(noIndex&&process.env.GIT_ATTR_NOSYSTEM!=='1'){fs.writeSync(2,Buffer.from('ambient attribute source was not isolated\\n'));process.exit(97);}
const result=spawnSync(process.env.TRANSITION_REAL_GIT,args,{encoding:'buffer',env:process.env}); if(result.stdout) fs.writeSync(1,result.stdout); if(result.stderr) fs.writeSync(2,result.stderr); process.exit(result.status??1);
`;
  fs.writeFileSync(path.join(captureBin, 'git'), captureGit, { mode: 0o755 });
  const priorPath = process.env.PATH; const priorRealGit = process.env.TRANSITION_REAL_GIT; const priorGitLog = process.env.TRANSITION_GIT_LOG; const priorAttrNoSystem = process.env.GIT_ATTR_NOSYSTEM;
  process.env.PATH = `${captureBin}${path.delimiter}${priorPath}`; process.env.TRANSITION_REAL_GIT = spawnSync('which', ['git'], { env: { ...process.env, PATH: priorPath }, encoding: 'utf8' }).stdout.trim(); process.env.TRANSITION_GIT_LOG = captureLog; process.env.GIT_ATTR_NOSYSTEM = '0';
  try { assert.deepEqual(rebuildEvidence(), fixture.evidenceApplication, 'captured transition command preserves byte-identical material'); } finally {
    process.env.PATH = priorPath;
    if (priorRealGit === undefined) delete process.env.TRANSITION_REAL_GIT; else process.env.TRANSITION_REAL_GIT = priorRealGit;
    if (priorGitLog === undefined) delete process.env.TRANSITION_GIT_LOG; else process.env.TRANSITION_GIT_LOG = priorGitLog;
    if (priorAttrNoSystem === undefined) delete process.env.GIT_ATTR_NOSYSTEM; else process.env.GIT_ATTR_NOSYSTEM = priorAttrNoSystem;
  }
  const transitionCalls = fs.readFileSync(captureLog, 'utf8').trim().split('\n').map(JSON.parse).filter((row) => path.basename(row.cwd).startsWith('docks-transition-diff-'));
  assert.deepEqual(transitionCalls.map((row) => row.args), [['init', '-q', '--template='], expectedTransitionDiffArgs], 'transition producer initializes once and uses the exact deterministic argv once');
  assert.equal(transitionCalls[0].cwd, transitionCalls[1].cwd, 'transition children share one private repository');
  assert.equal(fs.existsSync(transitionCalls[0].cwd), false, 'private transition repository is removed after success');
  assert.deepEqual(transitionCalls[1].artifact_modes, [0o600, 0o600], 'copied transition artifacts are owner-only');
  assert.equal(transitionCalls[1].attributes, `a/${TARGET_PLAN} !diff\nb/${TARGET_PLAN} !diff\n`, 'private highest-precedence attributes neutralize named diff drivers');
  for (const row of transitionCalls) {
    assert.equal(row.env.GIT_CONFIG_GLOBAL, os.devNull); assert.equal(row.env.GIT_CONFIG_SYSTEM, os.devNull);
    assert.equal(row.env.GIT_CONFIG_NOSYSTEM, '1'); assert.equal(row.env.GIT_CONFIG_COUNT, '0'); assert.equal(row.env.GIT_ATTR_NOSYSTEM, '1', 'transition child behavior requires the GIT_ATTR_NOSYSTEM isolation invariant');
    for (const key of ['GIT_ATTR_SOURCE', 'GIT_CONFIG', 'GIT_CONFIG_PARAMETERS', 'GIT_DIFF_OPTS', 'GIT_DIR', 'GIT_EXTERNAL_DIFF']) assert.equal(row.env[key], undefined, `${key} removed from canonical transition child`);
  }
  writeLogical(fixture.repo, '.git/info/attributes', `${TARGET_PLAN} binary\n`);
  assert.deepEqual(rebuildEvidence(), fixture.evidenceApplication, 'repository-local binary attributes preserve byte-identical textual transition material');
  assert.deepEqual(rebuildBinding(), fixture.bindingApplication, 'repository-local binary attributes preserve byte-identical historical reconstruction');
  fs.rmSync(path.join(fixture.repo, '.git/info/attributes'));
  git(fixture.repo, ['config', 'diff.custom.xfuncname', '^## .*']); writeLogical(fixture.repo, '.git/info/attributes', `${TARGET_PLAN} diff=custom\n`);
  const localNamedDiff = spawnSync('git', expectedLegacyDiffArgs, { cwd: fixture.repo, encoding: 'utf8', env: diffEnv }); assert.equal(localNamedDiff.status, 0, localNamedDiff.stderr);
  assert.notEqual(localNamedDiff.stdout, recordedDiff, 'repository-local named diff driver fixture changes the legacy producer');
  assert.deepEqual(rebuildEvidence(), fixture.evidenceApplication, 'repository-local named diff driver preserves byte-identical textual transition material');
  assert.deepEqual(rebuildBinding(), fixture.bindingApplication, 'repository-local named diff driver preserves byte-identical historical reconstruction');
  fs.rmSync(path.join(fixture.repo, '.git/info/attributes'));
  writeLogical(fixture.repo, '.gitattributes', `${TARGET_PLAN} diff=custom\n`); const committedAttributes = commitAll(fixture.repo, 'commit custom transition attributes');
  assert.equal(git(fixture.repo, ['show', `${committedAttributes}:.gitattributes`]), `${TARGET_PLAN} diff=custom`, 'committed named diff driver fixture is stored in the repository');
  const committedNamedDiff = spawnSync('git', expectedLegacyDiffArgs, { cwd: fixture.repo, encoding: 'utf8', env: diffEnv }); assert.equal(committedNamedDiff.status, 0, committedNamedDiff.stderr);
  assert.notEqual(committedNamedDiff.stdout, recordedDiff, 'committed named diff driver fixture changes the legacy producer');
  assert.deepEqual(rebuildEvidence(), fixture.evidenceApplication, 'committed named diff driver preserves byte-identical textual transition material');
  assert.deepEqual(rebuildBinding(), fixture.bindingApplication, 'committed named diff driver preserves byte-identical historical reconstruction');
  git(fixture.repo, ['checkout', '-q', '--detach', fixture.bindingCommit]); git(fixture.repo, ['config', '--unset', 'diff.custom.xfuncname']);
  const globalAttributes = path.join(fixture.temp, 'global.attributes'); const globalConfig = path.join(fixture.temp, 'global.gitconfig');
  fs.writeFileSync(globalAttributes, `${TARGET_PLAN} -diff\n`); git(fixture.repo, ['config', '--file', globalConfig, 'core.attributesFile', globalAttributes]);
  const priorGlobalConfig = process.env.GIT_CONFIG_GLOBAL; process.env.GIT_CONFIG_GLOBAL = globalConfig;
  try {
    assert.deepEqual(rebuildEvidence(), fixture.evidenceApplication, 'global core.attributesFile -diff rule preserves byte-identical textual transition material');
    assert.deepEqual(rebuildBinding(), fixture.bindingApplication, 'global core.attributesFile -diff rule preserves byte-identical historical reconstruction');
  } finally {
    if (priorGlobalConfig === undefined) delete process.env.GIT_CONFIG_GLOBAL; else process.env.GIT_CONFIG_GLOBAL = priorGlobalConfig;
  }
  fs.writeFileSync(globalAttributes, `${TARGET_PLAN} diff=custom\n`); git(fixture.repo, ['config', '--file', globalConfig, 'diff.custom.xfuncname', '^## .*']); process.env.GIT_CONFIG_GLOBAL = globalConfig;
  try {
    const globalNamedDiff = spawnSync('git', expectedLegacyDiffArgs, { cwd: fixture.repo, encoding: 'utf8', env: { ...diffEnv, GIT_CONFIG_GLOBAL: globalConfig } }); assert.equal(globalNamedDiff.status, 0, globalNamedDiff.stderr);
    assert.notEqual(globalNamedDiff.stdout, recordedDiff, 'global named diff driver fixture changes the legacy producer');
    assert.deepEqual(rebuildEvidence(), fixture.evidenceApplication, 'global named diff driver preserves byte-identical textual transition material');
    assert.deepEqual(rebuildBinding(), fixture.bindingApplication, 'global named diff driver preserves byte-identical historical reconstruction');
  } finally {
    if (priorGlobalConfig === undefined) delete process.env.GIT_CONFIG_GLOBAL; else process.env.GIT_CONFIG_GLOBAL = priorGlobalConfig;
  }
  const { review_material_sha256: recordedMaterialSha, ...materialPreimage } = material;
  assert.equal(material.transition_diff_sha256, sha256(recordedDiff)); assert.equal(material.policy_sha256, LEGACY_START_TRANSITION_COMPATIBILITY_POLICY_SHA256); assert.equal(recordedMaterialSha, sha256(jcs({ schema: 1, material: materialPreimage, transition_diff: recordedDiff })));
  validateDraftReceipt(findingsFreeDraftReceipt(fixture.evidenceCommit, gitBytes(fixture.repo, ['show', `${fixture.evidenceCommit}:${TARGET_PLAN}`]), 'single'));

  const recorded = ['remote_main', 'remote_tag', 'github_release', 'codex_plugin', 'claude_plugin']; let prerequisiteApplication = null;
  for (const stderrAt of recorded) {
    const fake = prerequisiteDependencies(fixture, { stderrAt }); const application = fixture.compatibilityPolicy.buildDocksCompatibilityPrerequisiteApplication(input, fake.dependencies); const receipt = prerequisiteReceiptFromApplication(application);
    assert.deepEqual(fake.observationOrder, recorded, 'fixed observation order');
    for (const label of recorded) assert.equal(receipt.observations[label].stderr_sha256, sha256(label === stderrAt ? `stderr:${label}\n` : Buffer.alloc(0)), `${label} stderr hash`);
    prerequisiteApplication ??= application;
  }
  const light = prerequisiteDependencies(fixture, { tagMode: 'lightweight' }); const lightApplication = fixture.compatibilityPolicy.buildDocksCompatibilityPrerequisiteApplication(input, light.dependencies);
  assert.equal(prerequisiteReceiptFromApplication(lightApplication).observations.remote_tag.projection.annotated, false);
  assert.equal(prerequisiteReceiptFromApplication(prerequisiteApplication).observations.remote_tag.projection.annotated, true);
  const reorderedInput = Object.fromEntries(Object.entries(input).reverse()); const reorderedDependencies = Object.fromEntries(Object.entries(prerequisiteDependencies(fixture).dependencies).reverse());
  assert.equal(jcs(fixture.compatibilityPolicy.buildDocksCompatibilityPrerequisiteApplication(reorderedInput, reorderedDependencies)), jcs(fixture.compatibilityPolicy.buildDocksCompatibilityPrerequisiteApplication(input, prerequisiteDependencies(fixture).dependencies)), 'closed object key order canonicalizes identically');
  expectThrow('missing prerequisite input key', () => { const value = { ...input }; delete value.releaseVersion; fixture.compatibilityPolicy.buildDocksCompatibilityPrerequisiteApplication(value, prerequisiteDependencies(fixture).dependencies); }, /unknown key|must contain|releaseVersion/);
  expectThrow('extra prerequisite input key', () => fixture.compatibilityPolicy.buildDocksCompatibilityPrerequisiteApplication({ ...input, observations: {} }, prerequisiteDependencies(fixture).dependencies), /unknown key/);
  expectThrow('swapped prerequisite input values', () => fixture.compatibilityPolicy.buildDocksCompatibilityPrerequisiteApplication({ ...input, evidenceCommit: input.bindingCommit, bindingCommit: input.evidenceCommit }, prerequisiteDependencies(fixture).dependencies), /contiguous|parent|commit/);
  expectThrow('missing prerequisite dependency', () => { const value = { ...prerequisiteDependencies(fixture).dependencies }; delete value.now; fixture.compatibilityPolicy.buildDocksCompatibilityPrerequisiteApplication(input, value); }, /missing now/);
  expectThrow('extra prerequisite dependency', () => fixture.compatibilityPolicy.buildDocksCompatibilityPrerequisiteApplication(input, { ...prerequisiteDependencies(fixture).dependencies, observations: () => ({}) }), /unknown key/);
  expectThrow('wrong child cwd', () => fixture.compatibilityPolicy.buildDocksCompatibilityPrerequisiteApplication(input, prerequisiteDependencies(fixture, { wrongCwd: true }).dependencies), /wrong child cwd/);
  expectThrow('invalid observed time', () => fixture.compatibilityPolicy.buildDocksCompatibilityPrerequisiteApplication(input, prerequisiteDependencies(fixture, { now: '2026-07-13 14:00:00' }).dependencies), /ISO/);
  expectThrow('relative homedir', () => fixture.compatibilityPolicy.buildDocksCompatibilityPrerequisiteApplication(input, prerequisiteDependencies(fixture, { home: 'relative-home' }).dependencies), /homedir/);
  for (const [label, resultVariant, pattern] of [
    ['missing child result field', ({ result, label: row }) => row === 'remote_main' ? (() => { const copy = { ...result }; delete copy.stderr; return copy; })() : result, /child result.*missing stderr/],
    ['extra child result field', ({ result, label: row }) => row === 'remote_main' ? { ...result, extra: true } : result, /child result.*unknown key/],
    ['noninteger child status', ({ result, label: row }) => row === 'remote_main' ? { ...result, status: '0' } : result, /child status/],
    ['nonzero child status', ({ result, label: row }) => row === 'remote_main' ? { ...result, status: 1 } : result, /child failed/],
    ['signaled child', ({ result, label: row }) => row === 'remote_main' ? { ...result, signal: 'SIGTERM' } : result, /child failed/],
    ['nonstring child signal', ({ result, label: row }) => row === 'remote_main' ? { ...result, signal: 9 } : result, /child signal/],
    ['missing child error field', ({ result, label: row }) => row === 'remote_main' ? { ...result, error: { code: 'EIO' } } : result, /child error.*missing message/],
    ['extra child error field', ({ result, label: row }) => row === 'remote_main' ? { ...result, error: { code: 'EIO', message: 'failed', extra: true } } : result, /child error.*unknown key/],
    ['nonstring child error code', ({ result, label: row }) => row === 'remote_main' ? { ...result, error: { code: 5, message: 'failed' } } : result, /child error code/],
    ['valid child error', ({ result, label: row }) => row === 'remote_main' ? { ...result, error: { code: 'EIO', message: 'failed' } } : result, /child failed/],
    ['nonbuffer child stdout', ({ result, label: row }) => row === 'remote_main' ? { ...result, stdout: result.stdout.toString() } : result, /Buffer/],
    ['nonbuffer child stderr', ({ result, label: row }) => row === 'remote_main' ? { ...result, stderr: result.stderr.toString() } : result, /Buffer/],
    ['unrecorded child stderr', ({ result, label: row, argv }) => row === null && argv[1] === 'rev-parse' ? { ...result, stderr: Buffer.from('unexpected\n') } : result, /stderr must be empty/],
  ]) expectThrow(label, () => fixture.compatibilityPolicy.buildDocksCompatibilityPrerequisiteApplication(input, prerequisiteDependencies(fixture, { resultVariant }).dependencies), pattern);
  for (const [label, fileVariant, pattern] of [
    ['cache symlink', { lstat: () => ({ kind: 'file', symbolicLink: true }) }, /non-symlink file/],
    ['cache directory', { lstat: () => ({ kind: 'directory', symbolicLink: false }) }, /non-symlink file/],
    ['cache realpath', { realpath: (value) => value === path.resolve(fixture.repo) ? value : `${value}.other` }, /non-symlink file/],
    ['cache nonbuffer read', { readFile: () => 'not-buffer' }, /Buffer/],
    ['cache wrong hash', { readFile: () => Buffer.from('different policy') }, /policies differ/],
  ]) expectThrow(label, () => fixture.compatibilityPolicy.buildDocksCompatibilityPrerequisiteApplication(input, prerequisiteDependencies(fixture, { fileVariant }).dependencies), pattern);
  for (const [label, resultVariant, pattern] of [
    ['remote main extra row', ({ result, label: row }) => row === 'remote_main' ? { ...result, stdout: Buffer.concat([result.stdout, result.stdout]) } : result, /remote main stdout mismatch/],
    ['remote tag row order', ({ result, label: row }) => row === 'remote_tag' ? { ...result, stdout: Buffer.from(result.stdout.toString().trim().split('\n').reverse().join('\n') + '\n') } : result, /remote tag stdout mismatch/],
    ['remote tag unpeeled', ({ result, label: row }) => row === 'remote_tag' ? { ...result, stdout: Buffer.from(`${'a'.repeat(40)}\trefs/tags/${RELEASE_TAG}\n`) } : result, /remote tag stdout mismatch/],
    ['release draft', ({ result, label: row }) => row === 'github_release' ? { ...result, stdout: Buffer.from(JSON.stringify({ isDraft: true, isPrerelease: false, tagName: RELEASE_TAG, url: `https://github.com/DocksDocks/docks/releases/tag/${RELEASE_TAG}` })) } : result, /Release projection mismatch/],
    ['duplicate Codex plugin', ({ result, label: row, outputs }) => row === 'codex_plugin' ? { ...result, stdout: Buffer.from(JSON.stringify({ installed: [JSON.parse(outputs.codex_plugin).installed[1], JSON.parse(outputs.codex_plugin).installed[1]] })) } : result, /selection must be unique/],
    ['missing Claude plugin', ({ result, label: row }) => row === 'claude_plugin' ? { ...result, stdout: Buffer.from('[]') } : result, /selection must be unique/],
  ]) expectThrow(label, () => fixture.compatibilityPolicy.buildDocksCompatibilityPrerequisiteApplication(input, prerequisiteDependencies(fixture, { resultVariant }).dependencies), pattern);

  for (const extra of ['dependencies', 'time', 'home', 'raw-observations', 'parsed-observations', 'cache-path']) {
    const args = ['compatibility-prerequisite', input.repo, input.planPath, input.finishedPlanPath, input.finishedPlanCommit, input.releaseVersion, input.evidenceCommit, input.compatibilityReviewCommit, input.bindingCommit, input.authorizationId, input.authorizationSha256, extra];
    const result = helper(fixture.repo, args); assert.notEqual(result.status, 0); assert.match(result.stderr, /accepts .* only/);
  }
  const productionApplication = productionPrerequisiteProbe(fixture); assert.equal(prerequisiteReceiptFromApplication(productionApplication).release_commit, fixture.releaseCommit);
  testCompatibilityChainNegatives(fixture, prerequisiteApplication);

  const changeStoredStderr = (receipt) => { receipt.observations.remote_main.stderr_sha256 = 'f'.repeat(64); };
  const staleStderr = variantPrerequisiteApplication(prerequisiteApplication, changeStoredStderr); const staleChain = commitPrerequisiteVariant(fixture, staleStderr, 'stale stored stderr hash');
  expectThrow('stale stored stderr substitution', () => compatibilityRange(fixture.compatibilityHelper, { repo: fixture.repo, planPath: TARGET_PLAN, plannedAtCommit: fixture.plannedAt, executionBaseCommit: fixture.executionBaseCommit, reviewedHead: staleChain.f }), /observations hash mismatch/);
  const partialStderr = variantPrerequisiteApplication(prerequisiteApplication, changeStoredStderr, { observations: true }); const partialChain = commitPrerequisiteVariant(fixture, partialStderr, 'partially rehashed stored stderr hash');
  expectThrow('partially rehashed stored stderr substitution', () => compatibilityRange(fixture.compatibilityHelper, { repo: fixture.repo, planPath: TARGET_PLAN, plannedAtCommit: fixture.plannedAt, executionBaseCommit: fixture.executionBaseCommit, reviewedHead: partialChain.f }), /receipt hash mismatch/);
  const rehashedStderr = rehashedPrerequisiteApplication(prerequisiteApplication, changeStoredStderr); const rehashedChain = commitPrerequisiteVariant(fixture, rehashedStderr, 'fully rehashed opaque stderr provenance');
  assert.equal(compatibilityRange(fixture.compatibilityHelper, { repo: fixture.repo, planPath: TARGET_PLAN, plannedAtCommit: fixture.plannedAt, executionBaseCommit: fixture.executionBaseCommit, reviewedHead: rehashedChain.f }).mode, 'legacy_compatibility', 'fully rehashed opaque digest documents trusted constructor/Q/F provenance boundary');
  const reorderedReceipt = rehashedPrerequisiteApplication(prerequisiteApplication, (receipt) => {
    receipt.observations = Object.fromEntries(Object.entries(receipt.observations).reverse());
    receipt.observations.remote_main = Object.fromEntries(Object.entries(receipt.observations.remote_main).reverse());
  });
  assert.equal(jcs(reorderedReceipt), jcs(prerequisiteApplication), 'reordered closed stored objects are canonical-identical');
  for (const [label, applyChange, pattern] of [
    ['stored observation missing field', (receipt) => { delete receipt.observations.remote_main.exit_code; }, /missing exit_code/],
    ['stored observation extra field', (receipt) => { receipt.observations.remote_main.extra = true; }, /unknown key/],
    ['stored main projection', (receipt) => { receipt.observations.remote_main.projection.commit = 'f'.repeat(40); }, /stored remote main projection/],
    ['stored tag projection', (receipt) => { receipt.observations.remote_tag.projection.peeled_commit = 'f'.repeat(40); }, /stored remote tag projection/],
    ['stored argv order', (receipt) => { receipt.observations.remote_main.argv.reverse(); }, /observation identity/],
    ['stored exit code', (receipt) => { receipt.observations.remote_main.exit_code = 1; }, /observation identity/],
    ['stored observed time', (receipt) => { receipt.observations.observed_at = '2026-07-13 14:00:00'; }, /ISO/],
    ['stored source identity', (receipt) => { receipt.observations.source_policy.git_spec = 'HEAD:wrong'; }, /source policy observation identity/],
    ['stored cache relative path', (receipt) => { receipt.observations.codex_cache.home_relative_path = '.codex/wrong'; }, /cache relative path/],
  ]) {
    const application = rehashedPrerequisiteApplication(prerequisiteApplication, applyChange); const chain = commitPrerequisiteVariant(fixture, application, label);
    expectThrow(label, () => compatibilityRange(fixture.compatibilityHelper, { repo: fixture.repo, planPath: TARGET_PLAN, plannedAtCommit: fixture.plannedAt, executionBaseCommit: fixture.executionBaseCommit, reviewedHead: chain.f }), pattern);
  }
  git(fixture.repo, ['checkout', '-q', '--detach', fixture.bindingCommit]);

  const prerequisiteBytes = applyPrerequisiteForTest(fixture.bindingBytes, prerequisiteApplication); writeLogical(fixture.repo, TARGET_PLAN, prerequisiteBytes); const prerequisiteCommit = commitAll(fixture.repo, 'close Docks prerequisite');
  const finalReceipt = findingsFreeDraftReceipt(prerequisiteCommit, prerequisiteBytes, 'single', '2026-07-13T15:00:00.000Z'); const finalBytes = insertOrReplaceDraftReceiptForTest(prerequisiteBytes, finalReceipt, true);
  writeLogical(fixture.repo, TARGET_PLAN, finalBytes); const finalReviewCommit = commitAll(fixture.repo, 'record final execution review');
  const validation = compatibilityRange(fixture.compatibilityHelper, { repo: fixture.repo, planPath: TARGET_PLAN, plannedAtCommit: fixture.plannedAt, executionBaseCommit: fixture.executionBaseCommit, reviewedHead: finalReviewCommit });
  assert.equal(validation.mode, 'legacy_compatibility'); assert.equal(validation.prerequisite_commit, prerequisiteCommit); assert.equal(validation.execution_review_commit, finalReviewCommit);
  assert.equal(validation.prerequisite_receipt_sha256, prerequisiteReceiptFromApplication(prerequisiteApplication).receipt_sha256);
  const completionReceipt = completionReceiptFor(finalReviewCommit, finalBytes); let completionBytes = applyCompletionReviewBlock(finalBytes, completionReceipt).toString(); completionBytes = replaceOnce(completionBytes, 'review_status: null', 'review_status: passed');
  writeLogical(fixture.repo, TARGET_PLAN, completionBytes); const completionCommit = commitAll(fixture.repo, 'complete compatibility consumer plan');
  validateCompletionReviewReuse({ repo: fixture.repo, planPath: TARGET_PLAN, reviewedHead: finalReviewCommit, completionCommit, receipt: completionReceipt, expectedPolicy: completionReceipt.policy });
  assert.equal(compatibilityRange(fixture.compatibilityHelper, { repo: fixture.repo, planPath: TARGET_PLAN, plannedAtCommit: fixture.plannedAt, executionBaseCommit: fixture.executionBaseCommit, reviewedHead: completionCommit }).execution_review_commit, finalReviewCommit);
  testStrictCompletionReuse(); testCompletionReviewRenderer(); testExecutionScopeLedger();
  makeWritable(fixture.temp); fs.rmSync(fixture.temp, { recursive: true, force: true });
  console.log('execution compatibility: strict-first evidence/review/binding/prerequisite/final-review and reuse passed');
}

function strictDifferentialFixture(caseName) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), `review-policy-strict-${caseName}-`)); const repo = path.join(temp, 'repo'); initializeRepository(repo);
  writeLogical(repo, 'seed.txt', 'planned base\n'); const plannedAt = commitAll(repo, 'planned base');
  writeLogical(repo, 'wrong.txt', 'wrong identity source\n'); const wrongCommit = commitAll(repo, 'wrong identity source');
  const planPath = 'docs/plans/active/strict.md'; let parentPlan = fixturePlan({ plannedAt, cleanReceipt: true });
  if (caseName === 'base-planned-at-identity') parentPlan = replaceOnce(parentPlan, `planned_at_commit: "${plannedAt}"`, `planned_at_commit: "${wrongCommit}"`);
  if (caseName === 'parent-status') parentPlan = replaceOnce(parentPlan, 'status: planned', 'status: ongoing');
  if (caseName === 'parent-started-at') parentPlan = replaceOnce(parentPlan, 'started_at: null', 'started_at: "2026-07-13T10:00:00.000Z"');
  if (caseName !== 'parent-plan-missing') writeLogical(repo, planPath, parentPlan); else writeLogical(repo, 'parent-only.txt', 'plan absent\n');
  const parent = commitAll(repo, 'strict parent');

  let basePlan = parentPlan;
  if (caseName !== 'base-plan-missing') {
    if (caseName !== 'parent-status') basePlan = replaceOnce(basePlan, 'status: planned', caseName === 'base-status' ? 'status: planned' : 'status: ongoing');
    if (caseName !== 'base-started-at' && caseName !== 'parent-started-at') basePlan = replaceOnce(basePlan, 'started_at: null', 'started_at: "2026-07-13T10:10:00.000Z"');
    if (caseName === 'canonical-start-drift') basePlan = replaceOnce(basePlan, 'Prove canonical policy behavior.\n\n## Interfaces', 'Prove changed canonical policy behavior.\n\n## Interfaces');
  }
  let executionBaseCommit;
  if (caseName === 'base-multi-parent') {
    const branch = git(repo, ['branch', '--show-current']); git(repo, ['checkout', '-qb', 'strict-side', parent]); writeLogical(repo, 'side.txt', 'side\n'); commitAll(repo, 'strict side');
    git(repo, ['checkout', '-q', branch]); writeLogical(repo, planPath, basePlan); commitAll(repo, 'strict start first parent'); git(repo, ['merge', '--no-ff', '-qm', 'strict merge base', 'strict-side']); executionBaseCommit = git(repo, ['rev-parse', 'HEAD']);
  } else {
    if (caseName === 'base-plan-missing') fs.rmSync(path.join(repo, planPath)); else writeLogical(repo, planPath, basePlan);
    if (caseName === 'base-extra-path') writeLogical(repo, 'unexpected.txt', 'extra base path\n');
    executionBaseCommit = commitAll(repo, 'strict execution base');
  }

  let headPlan = basePlan;
  if (caseName !== 'base-plan-missing') {
    if (caseName === 'base-planned-at-identity') headPlan = replaceOnce(headPlan, `planned_at_commit: "${wrongCommit}"`, `planned_at_commit: "${plannedAt}"`);
    const headExecution = caseName === 'head-execution-base-identity' ? wrongCommit : executionBaseCommit;
    headPlan = replaceOnce(headPlan, 'execution_base_commit: null', `execution_base_commit: "${headExecution}"`);
    if (caseName === 'head-planned-at-identity') headPlan = replaceOnce(headPlan, `planned_at_commit: "${plannedAt}"`, `planned_at_commit: "${wrongCommit}"`);
    writeLogical(repo, planPath, headPlan);
  } else writeLogical(repo, 'after-delete.txt', 'head without plan\n');
  let reviewedHead = commitAll(repo, 'strict reviewed head');
  if (caseName === 'head-plan-missing') { fs.rmSync(path.join(repo, planPath)); reviewedHead = commitAll(repo, 'delete head plan'); }

  let selectedPlan = plannedAt; let selectedBase = executionBaseCommit; let selectedHead = reviewedHead; let selectedPath = planPath;
  if (caseName === 'path-escape') selectedPath = '../strict.md';
  if (caseName === 'planned-short') selectedPlan = plannedAt.slice(0, 7);
  if (caseName === 'planned-missing') selectedPlan = 'f'.repeat(40);
  if (caseName === 'execution-short') selectedBase = executionBaseCommit.slice(0, 7);
  if (caseName === 'execution-missing') selectedBase = 'e'.repeat(40);
  if (caseName === 'reviewed-short') selectedHead = reviewedHead.slice(0, 7);
  if (caseName === 'reviewed-missing') selectedHead = 'd'.repeat(40);
  if (caseName === 'base-to-head-ancestry') selectedHead = parent;
  if (caseName === 'planned-to-base-ancestry') {
    const branch = git(repo, ['branch', '--show-current']); git(repo, ['checkout', '-qb', 'unrelated-planned', plannedAt]); writeLogical(repo, 'unrelated.txt', 'not ancestor\n'); selectedPlan = commitAll(repo, 'unrelated planned'); git(repo, ['checkout', '-q', branch]);
  }
  return { temp, repo, args: ['execution-range', repo, selectedHead, selectedPath, selectedPlan, selectedBase] };
}

function testStrictDifferential(baseline) {
  assert.match(baseline, /^[0-9a-f]{40}$/); testStrictCorpusContract();
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'review-policy-baseline-helper-')); const baselineHelper = path.join(temp, 'review-policy-baseline.mjs'); const runner = path.join(temp, 'runner.mjs');
  fs.writeFileSync(baselineHelper, gitBytes(ROOT, ['show', `${baseline}:${path.relative(ROOT, HELPER)}`]));
  fs.writeFileSync(runner, `import path from 'node:path'; import { pathToFileURL } from 'node:url';
const [helper,repo,reviewedHead,planPath,plannedAtCommit,executionBaseCommit]=process.argv.slice(2); const policy=await import(pathToFileURL(path.resolve(helper)));
try { process.stdout.write(policy.jcs(policy.validateExecutionRange({repo,reviewedHead,planPath,plannedAtCommit,executionBaseCommit}))+'\\n'); } catch(error) { process.stderr.write('review-policy: '+error.message+'\\n'); process.exitCode=1; }
`);
  for (const caseName of STRICT_CASES) {
    const fixture = strictDifferentialFixture(caseName); const call = fixture.args.slice(1); const oldResult = spawnSync(process.execPath, [runner, baselineHelper, ...call], { cwd: fixture.repo }); const newResult = spawnSync(process.execPath, [runner, HELPER, ...call], { cwd: fixture.repo });
    assert.equal(newResult.status, oldResult.status, `${caseName} exit`); assert.deepEqual(newResult.stdout, oldResult.stdout, `${caseName} stdout`); assert.deepEqual(newResult.stderr, oldResult.stderr, `${caseName} stderr`);
    fs.rmSync(fixture.temp, { recursive: true, force: true });
  }
  fs.rmSync(temp, { recursive: true, force: true }); console.log(`execution compatibility: strict differential passed cases=${STRICT_CASES.length}`);
}

function testLifecycle() {
  const settledPassed = (lifecycleIntent) => orchestrationStateV1({
    lifecycle_intent: lifecycleIntent,
    status: 'passed',
    series_sha256: H0,
    apply_state: lifecycleIntent === 'none' ? 'none' : 'pending',
  });
  const transitioned = (orchestration, overrides) => {
    const { state_sha256: priorStateSha256, ...unhashed } = orchestration;
    return stateWithHash({
      ...unhashed,
      ...overrides,
      transitioned_from_state_sha256: priorStateSha256,
    });
  };
  const none = settledPassed('none');
  assert.deepEqual(
    applyLifecycleState({ state: 'planned', intent: 'none', eligible: true, orchestration: none }),
    { kind: 'applied', state: 'planned', orchestration: none },
  );
  assert.deepEqual(
    applyLifecycleState({ state: 'scheduled', intent: 'none', eligible: false, orchestration: none }),
    { kind: 'applied', state: 'scheduled', orchestration: none },
  );

  const start = settledPassed('start');
  assert.deepEqual(
    applyLifecycleState({ state: 'planned', intent: 'start', eligible: true, orchestration: start }),
    { kind: 'applied', state: 'ongoing', orchestration: transitioned(start, { apply_state: 'consumed' }) },
  );
  const scheduleFire = settledPassed('schedule_fire');
  assert.deepEqual(
    applyLifecycleState({ state: 'scheduled', intent: 'schedule_fire', eligible: true, orchestration: scheduleFire }),
    { kind: 'applied', state: 'ongoing', orchestration: transitioned(scheduleFire, { apply_state: 'consumed' }) },
  );
  const autoExecute = settledPassed('auto_execute');
  assert.deepEqual(
    applyLifecycleState({ state: 'scheduled', intent: 'auto_execute', eligible: false, orchestration: autoExecute }),
    {
      kind: 'rejected',
      state: 'scheduled',
      orchestration: transitioned(autoExecute, { status: 'stuck', stop_reason: 'apply_rejected', apply_state: 'none' }),
    },
  );
  assert.deepEqual(
    applyLifecycleState({ state: 'scheduled', intent: 'start', eligible: true, orchestration: start }),
    {
      kind: 'rejected',
      state: 'scheduled',
      orchestration: transitioned(start, { status: 'stuck', stop_reason: 'apply_rejected', apply_state: 'none' }),
    },
  );
  assert.deepEqual(
    applyLifecycleState({ state: 'planned', intent: 'schedule_fire', eligible: true, orchestration: scheduleFire }),
    {
      kind: 'rejected',
      state: 'planned',
      orchestration: transitioned(scheduleFire, { status: 'stuck', stop_reason: 'apply_rejected', apply_state: 'none' }),
    },
  );
  expectThrow('legacy intentUsed lifecycle input', () => applyLifecycleState({
    state: 'planned',
    intent: 'start',
    eligible: true,
    orchestration: start,
    intentUsed: false,
  }), /unknown key|intentUsed/i);
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'review-policy-lifecycle-')); const original = path.join(temp, 'original'); const verifyRoot = '/tmp/docks-plan-verify'; const requestId = randomUUID();
  const planPath = 'docs/plans/active/sample.md'; fs.mkdirSync(path.join(original, 'docs/plans/active'), { recursive: true }); git(original, ['init', '-q']); git(original, ['config', 'user.email', 'policy@example.test']); git(original, ['config', 'user.name', 'Policy Test']);
  fs.writeFileSync(path.join(original, '.gitignore'), 'ignored-cache\n'); fs.writeFileSync(path.join(original, 'result.txt'), 'original\n'); fs.writeFileSync(path.join(original, 'ignored-cache'), 'ignored original\n');
  git(original, ['add', '.gitignore', 'result.txt']); git(original, ['commit', '-qm', 'fixture']); const plannedAt = git(original, ['rev-parse', 'HEAD']);
  const plannedPlan = fs.readFileSync(FIXTURE, 'utf8').replace('"0000000000000000000000000000000000000000"', `"${plannedAt}"`).replace('started_at: null\n', ''); fs.writeFileSync(path.join(original, planPath), plannedPlan); fs.writeFileSync(path.join(original, 'result.txt'), 'pre-start concurrent work\n'); git(original, ['add', planPath, 'result.txt']); git(original, ['commit', '-qm', 'plan fixture']);
  const largeBinary = Buffer.alloc(2 * 1024 * 1024);
  for (let offset = 0, block = 0; offset < largeBinary.length; block += 1) {
    const bytes = createHash('sha256').update(`completion-diff-${block}`).digest();
    offset += bytes.copy(largeBinary, offset);
  }
  fs.writeFileSync(path.join(original, 'retired-binary'), largeBinary); git(original, ['add', 'retired-binary']); git(original, ['commit', '-qm', 'pre-start binary fixture']);
  fs.writeFileSync(path.join(original, planPath), plannedPlan.replace('status: planned', 'status: ongoing\nstarted_at: "2026-07-12T00:30:00-03:00"')); git(original, ['add', planPath]); git(original, ['commit', '-qm', 'start plan']); const executionBase = git(original, ['rev-parse', 'HEAD']);
  fs.rmSync(path.join(original, 'retired-binary')); fs.writeFileSync(path.join(original, planPath), fs.readFileSync(path.join(original, planPath), 'utf8').replace('execution_base_commit: null', `execution_base_commit: "${executionBase}"`)); git(original, ['add', '-A']); git(original, ['commit', '-qm', 'record execution base']); const head = git(original, ['rev-parse', 'HEAD']);
  const completionBundle = path.join(temp, 'completion-bundle'); const sealedCompletion = sealBundle({ repo: original, reviewedCommit: head, planPath, requestedPaths: ['result.txt'], outDir: completionBundle, plannedAtCommit: plannedAt, executionBaseCommit: executionBase });
  assert.ok(fs.statSync(path.join(completionBundle, 'completion.diff')).size > 1024 * 1024, 'completion bundle preserves diffs larger than spawnSync default maxBuffer');
  assert.equal(sealedCompletion.completion.execution_base_commit, executionBase); assert.equal(sealedCompletion.completion.acceptance_inventory_sha256, sha256(jcs(INVENTORY)));
  assert.doesNotMatch(fs.readFileSync(path.join(completionBundle, 'completion.diff'), 'utf8'), /pre-start concurrent work/, 'execution diff excludes concurrent pre-start changes');
  assert.match(fs.readFileSync(path.join(completionBundle, 'completion.diff'), 'utf8'), /execution_base_commit/, 'execution diff includes post-start identity commit');
  verifyBundle({ bundle: completionBundle, expectedSha256: sealedCompletion.bundle_sha256 });
  expectThrow('non-start execution base', () => sealBundle({ repo: original, reviewedCommit: head, planPath, requestedPaths: [], outDir: path.join(temp, 'bad-execution'), plannedAtCommit: plannedAt, executionBaseCommit: head }), /execution base|ancestry/);
  const arbitraryPrepare = helper(temp, ['completion-prepare', original, head, requestId, planPath, plannedAt]); assert.notEqual(arbitraryPrepare.status, 0); assert.match(arbitraryPrepare.stderr, /accepts repo reviewedHead requestId planPath plannedAtCommit executionBaseCommit only/);
  const prepareResult = helper(temp, ['completion-prepare', original, head, requestId, planPath, plannedAt, executionBase]); assert.equal(prepareResult.status, 0, prepareResult.stderr); const prepared = JSON.parse(prepareResult.stdout);
  assert.equal(prepared.checkout, path.join(verifyRoot, requestId)); assert.equal(git(prepared.checkout, ['rev-parse', 'HEAD']), head);
  assert.equal(git(prepared.checkout, ['status', '--porcelain=v1', '--untracked-files=all']), '', 'prepared checkout must be clean');
  const checkoutStat = fs.lstatSync(prepared.checkout); assert.equal(checkoutStat.isDirectory(), true); assert.equal(checkoutStat.isSymbolicLink(), false); assert.equal(fs.realpathSync(prepared.checkout), prepared.checkout);
  if (typeof process.getuid === 'function') assert.equal(checkoutStat.uid, process.getuid());
  const rootSentinel = path.join(prepared.checkout, '.docks-plan-verify-sentinel'); assert.equal(fs.existsSync(rootSentinel), false, 'sentinel must be absent from worktree root');
  const privateGitDir = path.join(prepared.checkout, '.git'); const gitDirStat = fs.lstatSync(privateGitDir);
  assert.equal(gitDirStat.isDirectory(), true); assert.equal(gitDirStat.isSymbolicLink(), false); assert.equal(fs.realpathSync(privateGitDir), privateGitDir);
  if (typeof process.getuid === 'function') assert.equal(gitDirStat.uid, process.getuid());
  const sentinel = path.join(privateGitDir, '.docks-plan-verify-sentinel'); const sentinelStat = fs.lstatSync(sentinel);
  assert.equal(sentinelStat.isFile(), true); assert.equal(sentinelStat.isSymbolicLink(), false); assert.equal(sentinelStat.mode & 0o777, 0o600);
  if (typeof process.getuid === 'function') assert.equal(sentinelStat.uid, process.getuid());
  const sentinelBytes = fs.readFileSync(sentinel); const parsedSentinel = JSON.parse(sentinelBytes.toString('utf8'));
  assert.equal(sentinelBytes.toString('utf8'), `${jcs(parsedSentinel)}\n`, 'private sentinel must be compact JCS plus LF');
  assert.equal(parsedSentinel.request_id, requestId); assert.equal(parsedSentinel.cleanup_token, prepared.cleanup_token);
  const restoreSentinel = () => {
    try { fs.rmSync(sentinel, { force: false }); } catch (error) { if (error?.code !== 'ENOENT') throw error; }
    fs.writeFileSync(sentinel, sentinelBytes, { flag: 'wx', mode: 0o600 });
  };
  fs.writeFileSync(path.join(prepared.checkout, 'ci-artifact.txt'), 'disposable only\n');
  const preparedPath = path.join(temp, 'prepared.json'); fs.writeFileSync(preparedPath, JSON.stringify(prepared));
  fs.rmSync(sentinel); fs.writeFileSync(rootSentinel, sentinelBytes, { flag: 'wx', mode: 0o600 });
  const misplacedSentinel = helper(temp, ['completion-cleanup', original, requestId, preparedPath]); assert.notEqual(misplacedSentinel.status, 0); assert.match(misplacedSentinel.stderr, /sentinel missing/);
  fs.rmSync(rootSentinel); restoreSentinel();
  fs.chmodSync(sentinel, 0o644);
  const wrongMode = helper(temp, ['completion-cleanup', original, requestId, preparedPath]); assert.notEqual(wrongMode.status, 0); assert.match(wrongMode.stderr, /ownership or mode is unsafe/);
  fs.chmodSync(sentinel, 0o600);
  const sentinelTarget = path.join(privateGitDir, '.docks-plan-verify-sentinel-target'); fs.writeFileSync(sentinelTarget, sentinelBytes, { flag: 'wx', mode: 0o600 }); fs.rmSync(sentinel); fs.symlinkSync(path.basename(sentinelTarget), sentinel);
  const symlinkSentinel = helper(temp, ['completion-cleanup', original, requestId, preparedPath]); assert.notEqual(symlinkSentinel.status, 0); assert.match(symlinkSentinel.stderr, /not a regular file/);
  fs.rmSync(sentinel); fs.rmSync(sentinelTarget); restoreSentinel();
  fs.rmSync(sentinel);
  const missingSentinel = helper(temp, ['completion-cleanup', original, requestId, preparedPath]); assert.notEqual(missingSentinel.status, 0); assert.match(missingSentinel.stderr, /sentinel missing/);
  restoreSentinel(); fs.writeFileSync(path.join(original, 'ignored-cache'), 'mutated ignored content\n');
  const ignoredChange = helper(temp, ['completion-cleanup', original, requestId, preparedPath]); assert.notEqual(ignoredChange.status, 0); assert.match(ignoredChange.stderr, /original repository changed/);
  fs.writeFileSync(path.join(original, 'ignored-cache'), 'ignored original\n');
  const forged = { ...prepared, cleanup_token: H0 }; const forgedPath = path.join(temp, 'forged.json'); fs.writeFileSync(forgedPath, JSON.stringify(forged));
  const forgedCleanup = helper(temp, ['completion-cleanup', original, requestId, forgedPath]); assert.notEqual(forgedCleanup.status, 0); assert.match(forgedCleanup.stderr, /sentinel mismatch/);
  const cleanupResult = helper(temp, ['completion-cleanup', original, requestId, preparedPath]); assert.equal(cleanupResult.status, 0, cleanupResult.stderr); const cleaned = JSON.parse(cleanupResult.stdout);
  assert.equal(cleaned.removed, true); assert.equal(fs.existsSync(prepared.checkout), false);
  const escaped = helper(temp, ['completion-cleanup', original, '../escape', preparedPath]); assert.notEqual(escaped.status, 0); assert.match(escaped.stderr, /prepared completion identity mismatch|request id/);
  makeWritable(completionBundle); fs.rmSync(temp, { recursive: true, force: true });
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
  const contractPath = 'docs/plans/AGENTS.md';
  const templatePath = 'plugins/docks/skills/productivity/plan-workspace/references/plans-agents-md-template.md';
  const managerPath = 'plugins/docks/skills/productivity/plan-manager/SKILL.md';
  const reviewPath = 'plugins/docks/skills/productivity/plan-reviewer/SKILL.md';
  const repairerPath = 'plugins/docks/skills/productivity/plan-repairer/SKILL.md';
  const contract = fs.readFileSync(path.join(ROOT, contractPath), 'utf8');
  const template = fs.readFileSync(path.join(ROOT, templatePath), 'utf8');
  for (const marker of ['review_author_company:', 'review_waivers:', 'execution_base_commit:', '## Current schema-6 review orchestration', 'Review-orchestration-state:', 'plan-reviewer', 'plan-repairer']) {
    assert.match(contract, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `contract missing ${marker}`);
    assert.match(template, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `template missing ${marker}`);
  }
  const contractMarkers = [
    /schema 6/i,
    /historical schemas 1–5/i,
    /one full round plus at most one changed-input repair/i,
    /attempt 2 requires explicit\s+current-user retry/i,
    /standalone_executability/,
    /actionability/,
    /dependency_order/,
    /evidence_reverification/,
    /goal_coverage/,
    /executable_acceptance/,
    /failure_modes/,
    /open_questions/,
    /cannot_repair/,
  ];
  for (const file of [contractPath, templatePath]) {
    const text = fs.readFileSync(path.join(ROOT, file), 'utf8');
    for (const marker of contractMarkers) assert.match(text, marker, `${file} missing current workflow marker ${marker}`);
  }
  const policyMarkers = [
    /schema[- ]6/i,
    /role:?\s*[`"']?primary|role `primary`/i,
    /fallback:?\s*[`"']?availability_only|availability-only fallback/i,
    /max_rounds:?\s*[`"']?2/,
    /service_tier:?\s*[`"']?default/,
  ];
  for (const file of [managerPath, reviewPath]) {
    const text = fs.readFileSync(path.join(ROOT, file), 'utf8');
    for (const marker of policyMarkers) assert.match(text, marker, `${file} missing current workflow marker ${marker}`);
    assert.match(text, /historical schemas 1–5|historical validation|persisted historical evidence/i, `${file} must preserve historical review semantics explicitly`);
    assert.match(text, /no round\s+3|round\s+3[^.\n]*reject|reject[^.\n]*round\s+3|one changed-input repair round is the maximum/i, `${file} must close the current series after one repair`);
  }
  const reviewer = fs.readFileSync(path.join(ROOT, reviewPath), 'utf8');
  assert.match(reviewer, /non_blocking_gap/);
  assert.match(reviewer, /blocking_gap/);
  const repairer = fs.readFileSync(path.join(ROOT, repairerPath), 'utf8');
  for (const marker of ['user-invocable: false', 'blocking_gap', 'independently reproduced', 'cannot_repair', 'validates and applies any returned patch']) assert.match(repairer, new RegExp(marker, 'i'), `plan-repairer missing ${marker}`);
  assert.match(repairer, /Never write the plan[\s\S]*write a receipt[\s\S]*change status/i, 'plan-repairer must explicitly reject review and lifecycle ownership');
  const workspace = fs.readFileSync(path.join(ROOT, 'plugins/docks/skills/productivity/plan-workspace/SKILL.md'), 'utf8');
  for (const marker of ['STALE', 'explicitly refresh', 'explicit current-turn refresh', '.codex/agents/plan-reviewer.toml', 'current schema 6', 'historical schemas 1–5']) assert.match(workspace, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), `plan-workspace missing refresh marker ${marker}`);
  const ci = fs.readFileSync(path.join(ROOT, 'scripts/ci.mjs'), 'utf8');
  const focusedCall = "nodeOk(['scripts/tests/plan-review-policy.mjs', '--case', 'surfaces'])";
  assert.equal((ci.match(/nodeOk\(\[\s*['"]scripts\/tests\/plan-review-policy\.mjs['"]\s*,\s*['"]--case['"]\s*,\s*['"]surfaces['"]\s*\]\)/g) || []).length, 1, 'CI must contain exactly one focused --case surfaces call');
  assert.equal((ci.match(/startNodeTask\(\s*['"]plan-review-policy regressions['"]\s*,\s*\[\s*['"]scripts\/tests\/plan-review-policy-regressions\.mjs['"]\s*,\s*['"]--self-test['"]\s*\]\s*,\s*\{\s*cwd:\s*REPO,\s*tasks\s*\}\s*\)/g) || []).length, 1, 'CI must contain exactly one background regression-driver --self-test task with explicit spool ownership');
  assert.equal((ci.match(/import\s*\{\s*startNodeTask\s*\}\s*from\s*['"]\.\/lib\/ci-background-task\.mjs['"]/g) || []).length, 1, 'CI must import the complete-output background task helper exactly once');
  assert.equal((ci.match(/nodeOk\(\[\s*['"]scripts\/tests\/plan-review-policy-regressions\.mjs['"]\s*,\s*['"]--self-test['"]\s*\]\)/g) || []).length, 0, 'CI must not synchronously rerun the regression driver');
  assert.equal((ci.match(/nodeOk\(\[\s*['"]scripts\/tests\/plan-review-policy\.mjs['"]\s*\]\)/g) || []).length, 0, 'CI must contain zero no-argument full policy-harness calls');
  assert.ok(ci.indexOf("startNodeTask('plan-review-policy regressions'") < ci.indexOf("section('workflow YAML')"), 'CI must start the regression driver before independent shared checks');
  assert.ok(ci.indexOf(focusedCall) < ci.indexOf('await planPolicyRegressionTask'), 'CI must join the regression driver after focused Docks checks');
  for (const file of ['AGENTS.md', 'README.md', 'plugins/docks/README.md', 'plugins/docks/skills/AGENTS.md']) {
    const text = fs.readFileSync(path.join(ROOT, file), 'utf8');
    assert.match(text, /plan-reviewer/, `${file} missing reviewer route`);
    assert.match(text, /schema[- ]6/i, `${file} missing current schema`);
    assert.match(text, /historical/i, `${file} missing historical validation boundary`);
    assert.doesNotMatch(text, /Every plan receives independent X\/S review/, `${file} must not advertise historical X/S as current`);
  }
  assert.match(fs.readFileSync(path.join(ROOT, 'plugins/docks/skills/productivity/plan-workspace/SKILL.md'), 'utf8'), /schema 6[\s\S]*historical schemas 1–5/i);
  console.log('CI composition and task-specific acceptance/repair parity passed');
  console.log('contract/template/public single-primary schema-6 parity passed');
}

function testReviewRunnerSurfaces() {
  const skill = fs.readFileSync(path.join(ROOT, 'plugins/docks/skills/productivity/plan-reviewer/SKILL.md'), 'utf8');
  assert.match(skill, /user-invocable: false/);
  for (const marker of [
    'Evidence only', 'One sealed input', 'schema 6', 'role `primary`', 'availability-only fallback',
    'max_rounds:2', '--review-schema=6', 'reviewer-output.primary.v6.schema.json',
    'REQUEST_JCS_BEGIN', 'GPT-5.6-sol/high', 'Fable/high', 'Opus/xhigh',
    'output_started:false', 'blocking_gap', 'repair_targets_sha256',
  ]) assert.match(skill, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), `plan-reviewer missing workflow marker ${marker}`);
  assert.match(skill, /Session Relay as review\s+evidence/i);
  assert.match(fs.readFileSync(path.join(ROOT, 'docs/plans/finished/2026-07-16-plan-review-convergence-and-improver.md'), 'utf8'), /confidence: integer 0 \| 1/);
  for (const marker of ['destroy-bundle <bundle-path> <expected-bundle-sha256>', 'reviewer never changes permissions or performs cleanup']) assert.match(skill, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), `plan-reviewer missing safe cleanup marker ${marker}`);
  for (const file of ['plugins/docks/agents/plan-reviewer.md', '.codex/agents/plan-reviewer.toml', 'docs/scaffold/templates/codex-plan-reviewer.toml.template', 'plugins/docks/skills/productivity/plan-workspace/references/codex-agent-templates.md']) {
    const text = fs.readFileSync(path.join(ROOT, file), 'utf8');
    assert.match(text, /evidence/i, `${file} lacks evidence-only route`);
    assert.match(text, /primary/i, `${file} lacks current primary role`);
    assert.doesNotMatch(text, /write the idempotent|and write the .*Review|tools:.*(?:Bash|Edit|Write)/i, `${file} retains write-capable reviewer tools or writer instructions`);
    assert.match(text, /Never run or claim CI, acceptance, clone, cleanup,[^\n]*(?:lifecycle|receipt)/i, `${file} lacks explicit read-only work boundary`);
  }
  const claudeWrapper = fs.readFileSync(path.join(ROOT, 'plugins/docks/agents/plan-reviewer.md'), 'utf8');
  assert.match(claudeWrapper, /^tools: Read, Glob, Grep$/m); assert.match(claudeWrapper, /Return typed evidence only/);
  for (const file of ['.codex/agents/plan-reviewer.toml', 'docs/scaffold/templates/codex-plan-reviewer.toml.template', 'plugins/docks/skills/productivity/plan-workspace/references/codex-agent-templates.md']) assert.match(fs.readFileSync(path.join(ROOT, file), 'utf8'), /Return typed evidence only/);
  assert.match(fs.readFileSync(path.join(ROOT, '.codex/agents/plan-reviewer.toml'), 'utf8'), /sandbox_mode = "read-only"/);
  console.log('plan-reviewer evidence-only live/generated wrapper parity passed');
}

function testManagerSurfaces() {
  const skill = fs.readFileSync(path.join(ROOT, 'plugins/docks/skills/productivity/plan-manager/SKILL.md'), 'utf8');
  for (const marker of [
    'Sole-writer orchestration', 'No renewable review loop', 'Review-orchestration-state:',
    'NeedsUserAction', 'NeedsMainReviewDispatch', 'beginReviewOrchestration',
    'advanceReviewOrchestrationRepair', 'settleReviewOrchestration', 'consumeReviewIntent',
    'review_schema:6', 'plan-repairer', 'cannot_repair', 'No round 3',
    'execution-base..head binary diff', 'acceptance inventory', 'schemas 1–5 are validation-only',
  ]) assert.match(skill, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), `plan-manager missing schema-6 marker ${marker}`);

  for (const file of [
    'plugins/docks/agents/plan-manager.md',
    '.codex/agents/plan-manager.toml',
    'docs/scaffold/templates/codex-plan-manager.toml.template',
    'plugins/docks/skills/productivity/plan-workspace/references/codex-agent-templates.md',
  ]) {
    const text = fs.readFileSync(path.join(ROOT, file), 'utf8');
    assert.match(text, /NeedsMainReviewDispatch/i, `${file} missing main handback`);
    assert.match(text, /Never launch (?:the )?(?:reviewer|plan-reviewer)|do not dispatch/i, `${file} permits wrapper dispatch`);
    assert.match(text, /schema-6/i, `${file} missing current schema`);
  }
  const rootTemplate = fs.readFileSync(path.join(ROOT, 'docs/scaffold/templates/root-AGENTS.md.template'), 'utf8');
  for (const owner of ['plan-workspace', 'plan-creator', 'plan-manager', 'plan-reviewer', 'plan-repairer']) assert.match(rootTemplate, new RegExp(owner));
  console.log('plan-manager schema-6 prepare/dispatch/apply live/generated wrapper parity passed');
}

function testRelayBoundary() {
  const relay = fs.readFileSync(path.join(ROOT, 'plugins/session-relay/skills/productivity/session-relay/SKILL.md'), 'utf8');
  for (const marker of [
    'Canonical Docks plan review with sealed input and closed structured evidence',
    'resumable bus output is not the canonical receipt boundary',
    'rejected as canonical review transport',
    'plan-manager', 'plan-reviewer', 'future', 'approved release',
  ]) assert.match(relay, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
  assert.doesNotMatch(relay, /relay spawn.*canonical.*reviewer mode/i);
  console.log('session-relay canonical Docks review boundary passed');
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

const CURRENT_POLICY = {
  schema: 5,
  role: 'primary',
  fallback: 'availability_only',
  max_rounds: 2,
  candidates: [
    { company: 'openai', tool: 'codex', model: 'gpt-5.6-sol', effort: 'high', service_tier: 'default' },
    { company: 'anthropic', tool: 'claude', model: 'fable', effort: 'high' },
    { company: 'anthropic', tool: 'claude', model: 'opus', effort: 'xhigh' },
  ],
  provenance: {
    role: 'skill_default',
    fallback: 'skill_default',
    max_rounds: 'skill_default',
    candidates: 'skill_default',
  },
};

function currentRequest(overrides = {}) {
  const resolvedPolicy = overrides.policy || CURRENT_POLICY;
  return {
    schema: 5,
    request_id: '523e4567-e89b-42d3-a456-426614174000',
    phase: 'draft',
    lifecycle_intent: 'none',
    reviewed_commit_or_head: '5'.repeat(40),
    planned_at_commit: null,
    execution_base_commit: null,
    diff_sha256: null,
    acceptance_inventory_sha256: null,
    input_sha256: '6'.repeat(64),
    bundle_sha256: '7'.repeat(64),
    author: { company: 'openai', tool: 'codex', model: 'gpt-5.6-sol', effort: 'high' },
    policy: resolvedPolicy,
    policy_sha256: sha256(jcs(resolvedPolicy)),
    review_mode: 'full',
    round_index: 1,
    previous_input_sha256: null,
    repair_targets_sha256: null,
    ...overrides,
  };
}

const CURRENT_CRITERIA = [
  'standalone_executability', 'actionability', 'dependency_order', 'evidence_reverification',
  'goal_coverage', 'executable_acceptance', 'failure_modes', 'open_questions',
];

function currentChecklist(overrides = {}) {
  return Object.fromEntries(CURRENT_CRITERIA.map((criterion) => [
    criterion,
    overrides[criterion] || { status: 'pass', evidence: `${criterion} checked against the sealed plan` },
  ]));
}

function currentFinding(overrides = {}) {
  return {
    id: 'P1',
    criterion: 'executable_acceptance',
    status: 'blocking_gap',
    section: 'Acceptance criteria',
    path: null,
    locator: 'A1',
    defect: 'The required behavior has no executable proof.',
    fix: 'Add an exact command and expected result.',
    evidence: 'The sealed plan has no command for the required behavior.',
    ...overrides,
  };
}

function currentOutput(req, overrides = {}) {
  return {
    schema: 5,
    role: 'primary',
    request: req,
    verdict: 'pass',
    checklist: currentChecklist(),
    findings: [],
    ...overrides,
  };
}

function currentAttempt(candidate, overrides = {}) {
  return {
    schema: 5,
    candidate,
    started: true,
    output_started: true,
    child_id: 'child-1',
    timeout_mode: 'orchestrator_tool',
    timeout_seconds: 600,
    result: 'passed',
    exit_code: 0,
    signal: null,
    denial_source: null,
    reason: 'review completed',
    stdout_sha256: H0,
    stderr_sha256: H1,
    ...overrides,
  };
}

function currentRaw(req, output = currentOutput(req), overrides = {}) {
  const candidate = req.policy.candidates[0];
  return {
    schema: 5,
    role: 'primary',
    request: req,
    result: 'passed',
    attempts: [currentAttempt(candidate)],
    selected: candidate,
    reviewer_output: output,
    findings_sha256: output === null ? null : sha256(jcs(output.findings)),
    waiver: null,
    waiver_sha256: null,
    reason: null,
    ...overrides,
  };
}

function currentReproduction(id = 'P1') {
  return {
    id,
    reproduction: { method: 'read', command: null, exit_code: null, evidence_sha256: H0 },
  };
}

function currentRun(req, raw = currentRaw(req), overrides = {}) {
  const findings = raw.reviewer_output?.findings || [];
  const reviewer = overrides.reviewer || {
    raw,
    accepted_finding_ids: [],
    rejected: findings.map(({ id }) => ({ id, reason: 'independently checked and rejected' })),
  };
  const reproduced = overrides.reproduced || findings.map(({ id }) => currentReproduction(id));
  const hasBlocking = findings.some((finding) => finding.status === 'blocking_gap');
  const reviewOutcome = raw.result === 'waived' ? 'waived'
    : raw.result === 'unavailable' ? 'unavailable'
      : raw.result === 'failed' || hasBlocking ? 'not_ready' : 'passed';
  if (req.phase === 'completion') {
    const primary = overrides.primary || primaryEvidence(INVENTORY);
    const completionVerdict = primary.ci.exit_code !== 0
      || primary.regressions.length > 0
      || primary.findings.some((finding) => finding.severity === 'high')
      || hasBlocking
      ? 'regressed'
      : primary.goal_met === 'yes' && primary.acceptance.every((criterion) => criterion.met)
        ? 'passed'
        : 'partial';
    return {
      schema: 5,
      kind: 'completion',
      request: req,
      plan_input_sha256: req.input_sha256,
      diff_sha256: req.diff_sha256,
      acceptance_inventory: INVENTORY,
      acceptance_inventory_sha256: req.acceptance_inventory_sha256,
      reviewer,
      reproduced,
      outcome: reviewOutcome,
      primary,
      completion_verdict: completionVerdict,
      ...overrides,
    };
  }
  return {
    schema: 5,
    kind: 'draft',
    request: req,
    reviewer,
    reproduced,
    outcome: reviewOutcome,
    pre_execution_eligible: reviewOutcome === 'passed' || reviewOutcome === 'waived',
    ...overrides,
  };
}

function currentReceipt(req, run = currentRun(req), overrides = {}) {
  if (req.phase === 'completion') {
    return {
      schema: 5,
      phase: 'completion',
      request: req,
      planned_at_commit: req.planned_at_commit,
      execution_base_commit: req.execution_base_commit,
      reviewed_head: req.reviewed_commit_or_head,
      diff_sha256: req.diff_sha256,
      plan_input_sha256: req.input_sha256,
      acceptance_inventory: run.acceptance_inventory,
      acceptance_inventory_sha256: run.acceptance_inventory_sha256,
      policy: req.policy,
      policy_sha256: req.policy_sha256,
      reviewer: run.reviewer,
      reproduced: run.reproduced,
      outcome: run.outcome,
      primary: run.primary,
      completion_verdict: run.completion_verdict,
      series: overrides.series || {
        schema: 5,
        policy_sha256: req.policy_sha256,
        initial_input_sha256: req.input_sha256,
        current_input_sha256: req.input_sha256,
        rounds: [run],
        repairs: [],
      },
      reviewed_at: '2026-07-17T00:00:00-03:00',
      ...overrides,
    };
  }
  return {
    schema: 5,
    phase: 'draft',
    request: req,
    input_sha256: req.input_sha256,
    reviewed_commit: req.reviewed_commit_or_head,
    policy: req.policy,
    policy_sha256: req.policy_sha256,
    reviewer: run.reviewer,
    reproduced: run.reproduced,
    outcome: run.outcome,
    pre_execution_eligible: run.pre_execution_eligible,
    series: overrides.series || {
      schema: 5,
      policy_sha256: req.policy_sha256,
      initial_input_sha256: req.input_sha256,
      current_input_sha256: req.input_sha256,
      rounds: [run],
      repairs: [],
    },
    reviewed_at: '2026-07-17T00:00:00-03:00',
    ...overrides,
  };
}

const ORCHESTRATION_STATE_KEYS = [
  'schema', 'plan_path', 'phase', 'lifecycle_intent', 'initial_input_sha256',
  'current_input_sha256', 'orchestration_attempt', 'series_id', 'request_ids',
  'round_index', 'status', 'stop_reason', 'series_sha256', 'apply_state',
  'transitioned_from_state_sha256', 'retry_authorization', 'state_sha256',
];
const RETRY_AUTHORIZATION_KEYS = [
  'schema', 'authorization_id', 'actor', 'authorized_at', 'plan_path', 'phase',
  'intent_group', 'input_sha256', 'stopped_state_sha256', 'source_text_sha256',
];

function stateWithHash(fields) {
  return { ...fields, state_sha256: createHash('sha256').update(jcs(fields)).digest('hex') };
}

function orchestrationStateV1(overrides = {}) {
  return stateWithHash({
    schema: 1,
    plan_path: 'docs/plans/active/sample.md',
    phase: 'draft',
    lifecycle_intent: 'none',
    initial_input_sha256: H1,
    current_input_sha256: H1,
    orchestration_attempt: 1,
    series_id: '123e4567-e89b-42d3-a456-426614174000',
    request_ids: ['223e4567-e89b-42d3-a456-426614174000'],
    round_index: 1,
    status: 'active',
    stop_reason: null,
    series_sha256: null,
    apply_state: 'none',
    transitioned_from_state_sha256: null,
    retry_authorization: null,
    ...overrides,
  });
}

const RETRY_SOURCE_TEXT = 'schema-6 retry authorization source';

function retryAuthorizationV1(overrides = {}) {
  return {
    schema: 1,
    authorization_id: '323e4567-e89b-42d3-a456-426614174000',
    actor: 'user',
    authorized_at: '2026-07-19T10:00:00-03:00',
    plan_path: 'docs/plans/active/sample.md',
    phase: 'draft',
    intent_group: 'none',
    input_sha256: H1,
    stopped_state_sha256: H0,
    source_text_sha256: sha256(RETRY_SOURCE_TEXT),
    ...overrides,
  };
}

function schema6Policy() {
  return { ...structuredClone(CURRENT_POLICY), schema: 6 };
}

function schema6Request(sealed, state, overrides = {}) {
  const policy = schema6Policy();
  return currentRequest({
    schema: 6,
    request_id: state.request_ids.at(-1),
    reviewed_commit_or_head: sealed.manifest.reviewed_commit,
    input_sha256: state.current_input_sha256,
    bundle_sha256: sealed.bundle_sha256,
    policy,
    policy_sha256: sha256(jcs(policy)),
    review_mode: state.round_index === 1 ? 'full' : 'repair',
    round_index: state.round_index,
    previous_input_sha256: state.round_index === 1 ? null : state.initial_input_sha256,
    orchestration_series_id: state.series_id,
    orchestration_state_sha256: state.state_sha256,
    ...overrides,
  });
}

function schema6Series(req, run, repairs = []) {
  return {
    schema: 6,
    orchestration_series_id: req.orchestration_series_id,
    policy_sha256: req.policy_sha256,
    initial_input_sha256: req.previous_input_sha256 ?? req.input_sha256,
    current_input_sha256: req.input_sha256,
    rounds: [run],
    repairs,
  };
}

function schema6Receipt(req, run, series, settledState, overrides = {}) {
  return currentReceipt(req, run, {
    schema: 6,
    series,
    settled_orchestration_state_sha256: settledState.state_sha256,
    ...overrides,
  });
}

function reviewBundleRepository() {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'review-policy-schema6-surfaces-'));
  const repo = path.join(temp, 'repo');
  const planPath = 'docs/plans/active/sample.md';
  fs.mkdirSync(path.join(repo, path.dirname(planPath)), { recursive: true });
  fs.copyFileSync(FIXTURE, path.join(repo, planPath));
  initializeRepository(repo);
  const previousCommit = commitAll(repo, 'previous plan');
  const previousPlan = canonicalPlanView(fs.readFileSync(path.join(repo, planPath)));
  const changed = replaceOnce(
    fs.readFileSync(path.join(repo, planPath), 'utf8'),
    '## Goal\n\nProve canonical policy behavior.',
    '## Goal\n\nProve canonical policy behavior with a schema-six surface.',
    'schema-six plan change',
  );
  fs.writeFileSync(path.join(repo, planPath), changed);
  const reviewedCommit = commitAll(repo, 'current plan');
  const currentPlan = canonicalPlanView(fs.readFileSync(path.join(repo, planPath)));
  return { temp, repo, planPath, previousCommit, reviewedCommit, previousPlan, currentPlan };
}

function currentRepairTarget() {
  return {
    ...currentFinding(),
    source: 'primary',
    reproduction: currentReproduction().reproduction,
  };
}

function assertManifestRow(sealed, expected) {
  assert.equal(sealed.manifest.schema, expected.manifestSchema);
  assert.equal(sealed.manifest.review_schema, expected.reviewSchema);
  assert.deepEqual(sealed.manifest.reviewer_schemas, { primary: expected.schemaFile });
  assert.equal(sealed.manifest.files.filter(({ path: file }) => file === expected.schemaFile).length, 1);
  assert.equal(Object.hasOwn(sealed.manifest, 'repair'), expected.repair);
}

async function testSchema6PolicySurfaces() {
  const fixture = reviewBundleRepository();
  const bundles = [];
  const preparedWorkspaces = [];
  try {
    const target = currentRepairTarget();
    const v5Transition = reviewPolicy.buildCurrentRepairTransition({
      fromRoundIndex: 1,
      previousInputSha256: sha256(fixture.previousPlan),
      currentInputSha256: sha256(fixture.currentPlan),
      acceptedFindingIds: ['P1'],
      targets: [target],
    });
    const explicitV5Transition = reviewPolicy.buildCurrentRepairTransition({
      schema: 5,
      fromRoundIndex: 1,
      previousInputSha256: sha256(fixture.previousPlan),
      currentInputSha256: sha256(fixture.currentPlan),
      acceptedFindingIds: ['P1'],
      targets: [target],
    });
    assert.equal(jcs(explicitV5Transition), jcs(v5Transition), 'explicit schema 5 must preserve repair-transition bytes');

    const v5FullDir = path.join(fixture.temp, 'v5-full');
    const v5RepairDir = path.join(fixture.temp, 'v5-repair');
    const v5Full = sealBundle({
      repo: fixture.repo,
      reviewedCommit: fixture.reviewedCommit,
      planPath: fixture.planPath,
      requestedPaths: [],
      outDir: v5FullDir,
      reviewSchema: 5,
    });
    const v5Repair = sealBundle({
      repo: fixture.repo,
      reviewedCommit: fixture.reviewedCommit,
      planPath: fixture.planPath,
      requestedPaths: [],
      outDir: v5RepairDir,
      reviewSchema: 5,
      repair: { previousPlan: fixture.previousPlan, transition: v5Transition },
    });
    bundles.push(v5FullDir, v5RepairDir);
    assertManifestRow(v5Full, {
      manifestSchema: 3, reviewSchema: 5, schemaFile: 'reviewer-output.primary.v5.schema.json', repair: false,
    });
    assertManifestRow(v5Repair, {
      manifestSchema: 4, reviewSchema: 5, schemaFile: 'reviewer-output.primary.v5.schema.json', repair: true,
    });
    assert.equal(
      fs.readFileSync(path.join(v5FullDir, 'reviewer-output.primary.v5.schema.json'), 'utf8'),
      `${jcs(reviewPolicy.currentReviewerSchema())}\n`,
      'schema-5 bundled reviewer schema bytes remain unchanged',
    );
    verifyBundle({ bundle: v5FullDir, expectedSha256: v5Full.bundle_sha256 });
    verifyBundle({ bundle: v5RepairDir, expectedSha256: v5Repair.bundle_sha256 });
    const v5CliDir = path.join(fixture.temp, 'v5-cli-full');
    const v5CliResult = helper(fixture.repo, [
      'bundle', '--review-schema=5', fixture.repo, fixture.reviewedCommit, fixture.planPath, v5CliDir, '-', '-',
    ]);
    assert.equal(v5CliResult.status, 0, v5CliResult.stderr);
    assert.equal(v5CliResult.stderr, '');
    const v5CliFull = JSON.parse(v5CliResult.stdout);
    bundles.push(v5CliDir);
    assertManifestRow(v5CliFull, {
      manifestSchema: 3, reviewSchema: 5, schemaFile: 'reviewer-output.primary.v5.schema.json', repair: false,
    });
    verifyBundle({ bundle: v5CliDir, expectedSha256: v5CliFull.bundle_sha256 });
    const v5PreviousPlanPath = path.join(fixture.temp, 'v5-previous-plan.review.md');
    const v5TransitionPath = path.join(fixture.temp, 'schema-5-repair-transition.json');
    fs.writeFileSync(v5PreviousPlanPath, fixture.previousPlan);
    fs.writeFileSync(v5TransitionPath, `${jcs(v5Transition)}\n`);
    const v5CliRepairDir = path.join(fixture.temp, 'v5-cli-repair');
    const v5CliRepairResult = helper(fixture.repo, [
      'bundle-repair', '--review-schema=5', fixture.repo, fixture.reviewedCommit, fixture.planPath,
      v5CliRepairDir, v5PreviousPlanPath, v5TransitionPath, '-', '-',
    ]);
    assert.equal(v5CliRepairResult.status, 0, v5CliRepairResult.stderr);
    assert.equal(v5CliRepairResult.stderr, '');
    const v5CliRepair = JSON.parse(v5CliRepairResult.stdout);
    bundles.push(v5CliRepairDir);
    assertManifestRow(v5CliRepair, {
      manifestSchema: 4, reviewSchema: 5, schemaFile: 'reviewer-output.primary.v5.schema.json', repair: true,
    });
    verifyBundle({ bundle: v5CliRepairDir, expectedSha256: v5CliRepair.bundle_sha256 });
    const v5WorkspaceRequestId = randomUUID();
    const v5WorkspaceResult = helper(fixture.repo, [
      'reviewer-workspace-prepare', '--review-schema=5', v5WorkspaceRequestId, 'primary',
    ]);
    assert.equal(v5WorkspaceResult.status, 0, v5WorkspaceResult.stderr);
    assert.equal(v5WorkspaceResult.stderr, '');
    const v5PreparedWorkspace = JSON.parse(v5WorkspaceResult.stdout);
    preparedWorkspaces.push({ requestId: v5WorkspaceRequestId, prepared: v5PreparedWorkspace });
    const v5WorkspaceSchemaPath = path.join(v5PreparedWorkspace.workspace, 'reviewer-output.primary.v5.schema.json');
    assert.equal(fs.existsSync(v5WorkspaceSchemaPath), true, 'schema-5 CLI workspace selector remains supported');
    assert.equal(JSON.parse(fs.readFileSync(v5WorkspaceSchemaPath, 'utf8')).properties.schema.const, 5);

    for (const exportName of [
      'beginReviewOrchestration',
      'advanceReviewOrchestrationRepair',
      'settleReviewOrchestration',
      'consumeReviewIntent',
    ]) {
      assert.equal(typeof reviewPolicy[exportName], 'function', `missing schema-6 export ${exportName}`);
    }

    const fixedState = orchestrationStateV1();
    const compactState = '{"apply_state":"none","current_input_sha256":"1111111111111111111111111111111111111111111111111111111111111111","initial_input_sha256":"1111111111111111111111111111111111111111111111111111111111111111","lifecycle_intent":"none","orchestration_attempt":1,"phase":"draft","plan_path":"docs/plans/active/sample.md","request_ids":["223e4567-e89b-42d3-a456-426614174000"],"retry_authorization":null,"round_index":1,"schema":1,"series_id":"123e4567-e89b-42d3-a456-426614174000","series_sha256":null,"status":"active","stop_reason":null,"transitioned_from_state_sha256":null}';
    const { state_sha256: fixedHash, ...fixedUnhashed } = fixedState;
    assert.equal(jcs(fixedUnhashed), compactState, 'orchestration hash preimage is compact JCS');
    assert.equal(fixedHash, createHash('sha256').update(compactState).digest('hex'), 'orchestration state hash binds compact JCS without state_sha256');

    const active = reviewPolicy.beginReviewOrchestration({
      planPath: fixedState.plan_path,
      phase: fixedState.phase,
      lifecycleIntent: fixedState.lifecycle_intent,
      inputSha256: fixedState.current_input_sha256,
      seriesId: fixedState.series_id,
      requestId: fixedState.request_ids[0],
      orchestrationAttempt: 1,
      retryAuthorization: null,
      previousState: null,
      sourceText: null,
    });
    assert.deepEqual([...Object.keys(active)].sort(), [...ORCHESTRATION_STATE_KEYS].sort(), 'ReviewOrchestrationStateV1 is closed');
    assert.deepEqual(active, fixedState);

    const retryPreviousState = orchestrationStateV1({
      status: 'stopped',
      stop_reason: 'unavailable_auth',
      series_sha256: '3'.repeat(64),
    });

    const retryAuthorization = retryAuthorizationV1({ stopped_state_sha256: retryPreviousState.state_sha256 });
    assert.deepEqual([...Object.keys(retryAuthorization)].sort(), [...RETRY_AUTHORIZATION_KEYS].sort(), 'ReviewRetryAuthorizationV1 fixture is closed');
    const retryState = reviewPolicy.beginReviewOrchestration({
      planPath: retryAuthorization.plan_path,
      phase: retryAuthorization.phase,
      lifecycleIntent: 'none',
      inputSha256: retryAuthorization.input_sha256,
      seriesId: '423e4567-e89b-42d3-a456-426614174000',
      requestId: '523e4567-e89b-42d3-a456-426614174000',
      orchestrationAttempt: 2,
      retryAuthorization,
      previousState: retryPreviousState,
      sourceText: RETRY_SOURCE_TEXT,
    });
    assert.deepEqual([...Object.keys(retryState.retry_authorization)].sort(), [...RETRY_AUTHORIZATION_KEYS].sort(), 'embedded retry authorization is closed');
    expectThrow('retry authorization unknown key', () => reviewPolicy.beginReviewOrchestration({
      planPath: retryAuthorization.plan_path,
      phase: retryAuthorization.phase,
      lifecycleIntent: 'none',
      inputSha256: retryAuthorization.input_sha256,
      seriesId: '623e4567-e89b-42d3-a456-426614174000',
      requestId: '723e4567-e89b-42d3-a456-426614174000',
      orchestrationAttempt: 2,
      retryAuthorization: { ...retryAuthorization, intentUsed: false },
      previousState: retryPreviousState,
      sourceText: RETRY_SOURCE_TEXT,
    }), /unknown key|intentUsed/i);

    const fullState = reviewPolicy.beginReviewOrchestration({
      planPath: fixture.planPath,
      phase: 'draft',
      lifecycleIntent: 'none',
      inputSha256: sha256(fixture.currentPlan),
      seriesId: '823e4567-e89b-42d3-a456-426614174000',
      requestId: '923e4567-e89b-42d3-a456-426614174000',
      orchestrationAttempt: 1,
      retryAuthorization: null,
      previousState: null,
      sourceText: null,
    });
    const previousState = reviewPolicy.beginReviewOrchestration({
      planPath: fixture.planPath,
      phase: 'draft',
      lifecycleIntent: 'none',
      inputSha256: sha256(fixture.previousPlan),
      seriesId: 'a23e4567-e89b-42d3-a456-426614174000',
      requestId: 'b23e4567-e89b-42d3-a456-426614174000',
      orchestrationAttempt: 1,
      retryAuthorization: null,
      previousState: null,
      sourceText: null,
    });
    const repairState = reviewPolicy.advanceReviewOrchestrationRepair({
      state: previousState,
      requestId: 'c23e4567-e89b-42d3-a456-426614174000',
      currentInputSha256: sha256(fixture.currentPlan),
    });
    const v6Transition = reviewPolicy.buildCurrentRepairTransition({
      schema: 6,
      fromRoundIndex: 1,
      previousInputSha256: sha256(fixture.previousPlan),
      currentInputSha256: sha256(fixture.currentPlan),
      acceptedFindingIds: ['P1'],
      targets: [target],
      orchestrationSeriesId: repairState.series_id,
      previousOrchestrationStateSha256: previousState.state_sha256,
      currentOrchestrationStateSha256: repairState.state_sha256,
    });

    const v6FullDir = path.join(fixture.temp, 'v6-full');
    const v6RepairDir = path.join(fixture.temp, 'v6-repair');
    const v6Full = sealBundle({
      repo: fixture.repo,
      reviewedCommit: fixture.reviewedCommit,
      planPath: fixture.planPath,
      requestedPaths: [],
      outDir: v6FullDir,
      reviewSchema: 6,
    });
    const v6Repair = sealBundle({
      repo: fixture.repo,
      reviewedCommit: fixture.reviewedCommit,
      planPath: fixture.planPath,
      requestedPaths: [],
      outDir: v6RepairDir,
      reviewSchema: 6,
      repair: { previousPlan: fixture.previousPlan, transition: v6Transition },
    });
    bundles.push(v6FullDir, v6RepairDir);
    assertManifestRow(v6Full, {
      manifestSchema: 5, reviewSchema: 6, schemaFile: 'reviewer-output.primary.v6.schema.json', repair: false,
    });
    assertManifestRow(v6Repair, {
      manifestSchema: 6, reviewSchema: 6, schemaFile: 'reviewer-output.primary.v6.schema.json', repair: true,
    });
    verifyBundle({ bundle: v6FullDir, expectedSha256: v6Full.bundle_sha256 });
    verifyBundle({ bundle: v6RepairDir, expectedSha256: v6Repair.bundle_sha256 });
    assert.equal(reviewPolicy.reviewerSchema('primary', 5).properties.schema.const, 5);
    assert.equal(reviewPolicy.reviewerSchema('primary', 6).properties.schema.const, 6);
    const previousPlanPath = path.join(fixture.temp, 'previous-plan.review.md');
    const transitionPath = path.join(fixture.temp, 'schema-6-repair-transition.json');
    fs.writeFileSync(previousPlanPath, fixture.previousPlan);
    fs.writeFileSync(transitionPath, `${jcs(v6Transition)}\n`);

    const v6CliFullDir = path.join(fixture.temp, 'v6-cli-full');
    const v6CliFullResult = helper(fixture.repo, [
      'bundle', '--review-schema=6', fixture.repo, fixture.reviewedCommit, fixture.planPath, v6CliFullDir, '-', '-',
    ]);
    assert.equal(v6CliFullResult.status, 0, v6CliFullResult.stderr);
    assert.equal(v6CliFullResult.stderr, '');
    const v6CliFull = JSON.parse(v6CliFullResult.stdout);
    bundles.push(v6CliFullDir);
    assertManifestRow(v6CliFull, {
      manifestSchema: 5, reviewSchema: 6, schemaFile: 'reviewer-output.primary.v6.schema.json', repair: false,
    });
    verifyBundle({ bundle: v6CliFullDir, expectedSha256: v6CliFull.bundle_sha256 });

    const v6CliRepairDir = path.join(fixture.temp, 'v6-cli-repair');
    const v6CliRepairResult = helper(fixture.repo, [
      'bundle-repair', '--review-schema=6', fixture.repo, fixture.reviewedCommit, fixture.planPath,
      v6CliRepairDir, previousPlanPath, transitionPath, '-', '-',
    ]);
    assert.equal(v6CliRepairResult.status, 0, v6CliRepairResult.stderr);
    assert.equal(v6CliRepairResult.stderr, '');
    const v6CliRepair = JSON.parse(v6CliRepairResult.stdout);
    bundles.push(v6CliRepairDir);
    assertManifestRow(v6CliRepair, {
      manifestSchema: 6, reviewSchema: 6, schemaFile: 'reviewer-output.primary.v6.schema.json', repair: true,
    });
    verifyBundle({ bundle: v6CliRepairDir, expectedSha256: v6CliRepair.bundle_sha256 });

    for (const command of ['bundle', 'bundle-repair', 'reviewer-workspace-prepare']) {
      for (const selector of ['--review-schema=7', '--review-schema=06']) {
        const invalidSelector = helper(fixture.repo, [command, selector]);
        assert.notEqual(invalidSelector.status, 0, `${command} must reject unsupported review schema selector ${selector}`);
        assert.equal(invalidSelector.stdout, '');
        assert.match(invalidSelector.stderr, /review schema selector.*--review-schema=5\|6/i);
      }
    }
    const usage = helper(fixture.repo, ['not-a-command']);
    assert.notEqual(usage.status, 0);
    assert.match(usage.stderr, /bundle \[--review-schema=5\|6\]/);
    assert.match(usage.stderr, /reviewer-workspace-prepare \[--review-schema=5\|6\]/);

    const workspaceRequestId = randomUUID();
    const workspaceResult = helper(fixture.repo, [
      'reviewer-workspace-prepare', '--review-schema=6', workspaceRequestId, 'primary',
    ]);
    assert.equal(workspaceResult.status, 0, workspaceResult.stderr);
    assert.equal(workspaceResult.stderr, '');
    const preparedWorkspace = JSON.parse(workspaceResult.stdout);
    preparedWorkspaces.push({ requestId: workspaceRequestId, prepared: preparedWorkspace });
    const workspaceSchemaPath = path.join(preparedWorkspace.workspace, 'reviewer-output.primary.v6.schema.json');
    assert.equal(fs.existsSync(workspaceSchemaPath), true, 'schema-6 CLI workspace writes the primary v6 schema file');
    assert.equal(JSON.parse(fs.readFileSync(workspaceSchemaPath, 'utf8')).properties.schema.const, 6);

    const extraArgumentRequestId = randomUUID();
    const extraWorkspaceArgument = helper(fixture.repo, [
      'reviewer-workspace-prepare', '--review-schema=6', extraArgumentRequestId, 'primary', 'extra',
    ]);
    assert.notEqual(extraWorkspaceArgument.status, 0, 'reviewer workspace prepare must reject extra arguments');
    assert.equal(extraWorkspaceArgument.stdout, '');
    assert.match(extraWorkspaceArgument.stderr, /accepts \[--review-schema=5\|6\] requestId leg only/);

    const matrix = [
      { label: 'full', sealed: v6Full, bundle: v6FullDir, state: fullState },
      { label: 'repair', sealed: v6Repair, bundle: v6RepairDir, state: repairState },
    ];
    for (const row of matrix) {
      const req = schema6Request(row.sealed, row.state, row.label === 'repair' ? {
        repair_targets_sha256: v6Transition.repair_targets_sha256,
      } : {});
      validatePolicy(req.policy);
      validateRequest(req);
      const output = currentOutput(req, { schema: 6 });
      validateReviewerOutput(output, req, 'primary');
      reviewPolicy.validateCurrentReviewerOutput(output, req);

      const prepared = reviewPolicy.prepareReviewerWorkspace({
        requestId: req.request_id,
        leg: 'primary',
        reviewSchema: 6,
      });
      preparedWorkspaces.push({ requestId: req.request_id, prepared });
      const codexArgv = buildReviewerArgv({
        tool: 'codex',
        bundle: row.bundle,
        reviewerWorkspace: prepared,
        model: 'gpt-5.6-sol',
        effort: 'high',
        serviceTier: 'default',
        leg: 'primary',
        request: req,
      });
      assert.equal(codexArgv[codexArgv.indexOf('--output-schema') + 1], path.join(row.bundle, 'reviewer-output.primary.v6.schema.json'), `schema-6 ${row.label} Codex schema path`);
      assert.deepEqual(extractReviewerOutput('codex', `${JSON.stringify(output)}\n`, req, 'primary', row.bundle), output);

      const unavailableCodex = currentAttempt(req.policy.candidates[0], {
        schema: 6,
        started: false,
        output_started: false,
        result: 'tool_unavailable',
        exit_code: null,
        child_id: null,
        timeout_mode: null,
        timeout_seconds: null,
        reason: 'Codex unavailable for Claude path fixture',
        stdout_sha256: null,
        stderr_sha256: null,
      });
      const claudeArgv = buildReviewerArgv({
        tool: 'claude',
        bundle: row.bundle,
        model: 'fable',
        effort: 'high',
        leg: 'primary',
        request: req,
        priorAttempts: [unavailableCodex],
      });
      const claudeSchema = JSON.parse(claudeArgv[claudeArgv.indexOf('--json-schema') + 1]);
      assert.equal(claudeSchema.properties.schema.const, 6, `schema-6 ${row.label} Claude schema envelope`);
      assert.deepEqual(extractReviewerOutput('claude', JSON.stringify({ structured_output: output }), req, 'primary', row.bundle), output);
    }

    const req = schema6Request(v6Full, fullState);
    const raw = currentRaw(req, currentOutput(req, { schema: 6 }), {
      schema: 6,
      attempts: [currentAttempt(req.policy.candidates[0], { schema: 6 })],
    });
    const run = currentRun(req, raw, { schema: 6 });
    const series = schema6Series(req, run);
    reviewPolicy.validateCurrentRawReview(raw, req);
    reviewPolicy.validateCurrentReviewRunResult(run);
    reviewPolicy.validateReviewSeries(series);
    const settled = reviewPolicy.settleReviewOrchestration({ state: fullState, series });
    assert.equal(settled.series_sha256, sha256(jcs(series)));
    const receipt = schema6Receipt(req, run, series, settled);
    reviewPolicy.validateCurrentReviewReceipt(receipt, req.input_sha256, { orchestration: settled });
    validateDraftReceipt(receipt, req.input_sha256, { expectedPolicy: req.policy, orchestration: settled });
    validateDraftReviewReuse({
      receipt,
      expectedInput: req.input_sha256,
      expectedPolicy: req.policy,
      waivers: [],
      orchestration: settled,
    });
    expectThrow('schema-6 receipt settled-state substitution', () => validateDraftReviewReuse({
      receipt: { ...receipt, settled_orchestration_state_sha256: H0 },
      expectedInput: req.input_sha256,
      expectedPolicy: req.policy,
      waivers: [],
      orchestration: settled,
    }), /orchestration|settled|state/i);

    expectThrow('old intentUsed lifecycle input', () => applyLifecycleState({
      state: 'planned',
      intent: 'start',
      eligible: true,
      orchestration: settled,
      intentUsed: false,
    }), /unknown key|intentUsed/i);
    console.log('schema-6 orchestration, bundle, collector, receipt, and lifecycle surfaces passed');
  } finally {
    for (const workspace of preparedWorkspaces.reverse()) {
      reviewPolicy.cleanupReviewerWorkspace({
        requestId: workspace.requestId,
        leg: 'primary',
        prepared: workspace.prepared,
      });
    }
    makeWritable(fixture.temp);
    fs.rmSync(fixture.temp, { recursive: true, force: true });
  }
}

function testCurrentSingleLane() {
  validatePolicy(CURRENT_POLICY);
  const req = currentRequest();
  validateRequest(req);
  const schema = reviewPolicy.currentReviewerSchema();
  assert.equal(schema.additionalProperties, false);
  assert.equal(schema.properties.schema.const, 5);
  assert.equal(schema.properties.role.const, 'primary');
  assert.equal(Object.hasOwn(schema.properties, 'score'), false);
  assert.equal(Object.hasOwn(schema.properties, 'rubric'), false);
  assert.deepEqual(Object.keys(schema.properties.checklist.properties), CURRENT_CRITERIA);

  const [gpt, fable, opus] = CURRENT_POLICY.candidates;
  const fallback = [
    currentAttempt(gpt, { started: false, output_started: false, result: 'tool_unavailable', child_id: null, timeout_mode: null, timeout_seconds: null, exit_code: null, reason: 'Codex is not installed', stdout_sha256: null, stderr_sha256: null }),
    currentAttempt(fable, { output_started: false, result: 'auth_failed', exit_code: 1, reason: 'Claude auth is unavailable' }),
    currentAttempt(opus),
  ];
  assert.equal(reviewPolicy.validateCurrentAttemptSequence(fallback, CURRENT_POLICY).selected_index, 2);
  for (const [label, attempts, pattern] of [
    ['candidate reorder', [fallback[1], fallback[2]], /candidate order/],
    ['fallback after platform denial', [currentAttempt(gpt, { output_started: false, result: 'platform_denied', exit_code: null, denial_source: 'managed_policy' }), currentAttempt(fable)], /terminal|platform/],
    ['fallback after output', [currentAttempt(gpt, { result: 'model_unavailable', exit_code: 1 }), currentAttempt(fable)], /output|terminal/],
    ['fallback after timeout', [currentAttempt(gpt, { output_started: false, result: 'deadline_exceeded', exit_code: null, signal: 'SIGKILL' }), currentAttempt(fable)], /terminal|deadline/],
    ['fallback after transport failure', [currentAttempt(gpt, { output_started: false, result: 'transient_transport', exit_code: null }), currentAttempt(fable)], /terminal|transport/],
    ['fallback after substantive result', [currentAttempt(gpt), currentAttempt(fable)], /terminal|passed/],
  ]) expectThrow(label, () => reviewPolicy.validateCurrentAttemptSequence(attempts, CURRENT_POLICY), pattern);
  for (const [label, attempt, pattern] of [
    ['started attempt requires child id', currentAttempt(gpt, { child_id: null }), /child/i],
    ['started attempt requires timeout mode', currentAttempt(gpt, { timeout_mode: null }), /timeout/i],
    ['started attempt requires 600-second timeout', currentAttempt(gpt, { timeout_seconds: 599 }), /600|timeout/i],
    ['unstarted attempt rejects launch evidence', currentAttempt(gpt, { started: false, output_started: false, result: 'tool_unavailable', exit_code: null, child_id: 'not-launched', timeout_mode: null, timeout_seconds: null, stdout_sha256: null, stderr_sha256: null }), /unstarted|child|launch/i],
    ['deadline requires exactly one exit or signal', currentAttempt(gpt, { output_started: false, result: 'deadline_exceeded', exit_code: 124, signal: 'SIGTERM' }), /deadline|exit|signal/i],
  ]) expectThrow(label, () => reviewPolicy.validateCurrentAttemptSequence([attempt], CURRENT_POLICY), pattern);
  expectThrow('unstarted model_unavailable is not a real launch', () => reviewPolicy.validateCurrentAttemptSequence([
    currentAttempt(gpt, {
      started: false,
      output_started: false,
      result: 'model_unavailable',
      exit_code: null,
      reason: 'model probe was never launched',
      child_id: null,
      timeout_mode: null,
      timeout_seconds: null,
      stdout_sha256: null,
      stderr_sha256: null,
    }),
  ], CURRENT_POLICY), /model_unavailable.*started|started.*model_unavailable/i);

  for (const [label, invalid, pattern] of [
    ['current role', { ...CURRENT_POLICY, role: 'X' }, /role/],
    ['current fallback', { ...CURRENT_POLICY, fallback: 'any_failure' }, /fallback/],
    ['current rounds', { ...CURRENT_POLICY, max_rounds: 3 }, /max_rounds/],
    ['candidate order', { ...CURRENT_POLICY, candidates: [fable, gpt, opus] }, /candidate/],
    ['relay candidate', { ...CURRENT_POLICY, candidates: [{ ...gpt, tool: 'relay' }] }, /candidate|tool/],
    ['numeric gate', { ...CURRENT_POLICY, minimum_score: 90 }, /unknown key/],
    ['cross-company consent', { ...CURRENT_POLICY, cross_company_consent: 'always' }, /unknown key/],
  ]) expectThrow(label, () => validatePolicy(invalid), pattern);
  console.log('current single-lane policy, schema, and availability-only fallback passed');
}

function testCurrentReceipts() {
  const req = currentRequest();
  const pass = currentOutput(req);
  reviewPolicy.validateCurrentReviewerOutput(pass, req);
  const gapFinding = currentFinding({ status: 'non_blocking_gap' });
  const advisory = currentOutput(req, {
    verdict: 'non_blocking_gap',
    checklist: currentChecklist({ executable_acceptance: { status: 'non_blocking_gap', evidence: 'The command is useful but not required.' } }),
    findings: [gapFinding],
  });
  reviewPolicy.validateCurrentReviewerOutput(advisory, req);
  const blocking = currentOutput(req, {
    verdict: 'blocking_gap',
    checklist: currentChecklist({ executable_acceptance: { status: 'blocking_gap', evidence: 'A required command is absent.' } }),
    findings: [currentFinding()],
  });
  reviewPolicy.validateCurrentReviewerOutput(blocking, req);

  for (const [label, output, pattern] of [
    ['current score rejected', { ...pass, score: 100 }, /unknown key|score/],
    ['current numeric rubric rejected', { ...pass, rubric: { standalone_executability: 22 } }, /unknown key|rubric/],
    ['current X leg rejected', { ...pass, X: {} }, /unknown key|X/],
    ['checklist evidence required', { ...pass, checklist: currentChecklist({ actionability: { status: 'pass', evidence: '' } }) }, /evidence/],
    ['verdict strongest status', { ...blocking, verdict: 'pass' }, /verdict|strongest/],
    ['gap finding required', { ...blocking, findings: [] }, /finding|gap/],
    ['finding criterion status', { ...blocking, findings: [currentFinding({ status: 'non_blocking_gap' })] }, /finding.*status|status.*finding/],
    ['pass has no findings', { ...pass, findings: [currentFinding({ status: 'non_blocking_gap' })] }, /pass|finding/],
  ]) expectThrow(label, () => reviewPolicy.validateCurrentReviewerOutput(output, req), pattern);

  const raw = currentRaw(req, advisory);
  reviewPolicy.validateCurrentRawReview(raw, req);
  const run = currentRun(req, raw);
  reviewPolicy.validateCurrentReviewRunResult(run);
  reviewPolicy.validateCurrentReviewReceipt(currentReceipt(req, run), req.input_sha256);
  expectThrow('every current finding must be reproduced', () => reviewPolicy.validateCurrentReviewRunResult({ ...run, reproduced: [] }), /reproduced|finding/);
  expectThrow('current run rejects X/S', () => reviewPolicy.validateCurrentReviewRunResult({ ...run, X: null }), /unknown key|X/);
  expectThrow('current receipt rejects author duplication', () => reviewPolicy.validateCurrentReviewReceipt({ ...currentReceipt(req, run), author: req.author }), /unknown key|author/);
  expectThrow('current draft receipt requires the complete review series', () => reviewPolicy.validateCurrentReviewReceipt({
    ...currentReceipt(req, run),
    series: undefined,
  }, req.input_sha256), /series/i);

  const blockedRaw = currentRaw(req, blocking);
  const blockedRun = currentRun(req, blockedRaw, {
    reviewer: { raw: blockedRaw, accepted_finding_ids: ['P1'], rejected: [] },
    reproduced: [currentReproduction()],
  });
  assert.equal(blockedRun.outcome, 'not_ready');
  assert.equal(blockedRun.pre_execution_eligible, false);
  reviewPolicy.validateCurrentReviewRunResult(blockedRun);

  const rejectedBlockingRun = currentRun(req, blockedRaw);
  assert.deepEqual(rejectedBlockingRun.reviewer.accepted_finding_ids, []);
  assert.deepEqual(rejectedBlockingRun.reviewer.rejected.map(({ id }) => id), ['P1']);
  assert.equal(rejectedBlockingRun.outcome, 'not_ready', 'a blocking_gap is terminal even when rejected');
  assert.equal(rejectedBlockingRun.pre_execution_eligible, false, 'a rejected blocking_gap cannot become execution-eligible');
  reviewPolicy.validateCurrentReviewRunResult(rejectedBlockingRun);

  const contradictoryFailedRaw = currentRaw(req, null, {
    result: 'failed',
    selected: null,
    reviewer_output: null,
    findings_sha256: null,
    reason: 'discarded successful reviewer output',
  });
  expectThrow('current failed review cannot discard a passed attempt', () => reviewPolicy.validateCurrentReviewRunResult(currentRun(req, contradictoryFailedRaw)), /passed attempt|selected.*passed|failed.*passed/i);

  const waiver = { phase: 'draft', input_sha256: req.input_sha256, roles: ['primary'], actor: 'test user', reason: 'explicit current waiver', at: '2026-07-17T00:00:00-03:00' };
  reviewPolicy.validateCurrentWaivers([waiver], 'draft', req.input_sha256);
  expectThrow('current waiver rejects historical legs', () => reviewPolicy.validateCurrentWaivers([{ ...waiver, roles: undefined, legs: ['X', 'S'] }], 'draft', req.input_sha256), /unknown key|roles/);
  const waivedRaw = currentRaw(req, null, {
    result: 'waived', attempts: [], selected: null, reviewer_output: null, findings_sha256: null,
    waiver, waiver_sha256: sha256(jcs(waiver)), reason: null,
  });
  const waivedRun = currentRun(req, waivedRaw, {
    reviewer: { raw: waivedRaw, accepted_finding_ids: [], rejected: [] },
    reproduced: [],
  });
  assert.equal(waivedRun.pre_execution_eligible, true);
  reviewPolicy.validateCurrentReviewRunResult(waivedRun, { waivers: [waiver] });
  reviewPolicy.validateCurrentReviewReceipt(currentReceipt(req, waivedRun), req.input_sha256, { waivers: [waiver] });
  const waivedReceipt = currentReceipt(req, waivedRun);
  expectThrow('generic current series requires the exact waiver', () => reviewPolicy.validateReviewSeries(waivedReceipt.series), /waiver.*snapshot/i);
  reviewPolicy.validateReviewSeries(waivedReceipt.series, { waivers: [waiver] });
  expectThrow('current draft receipt reuse requires the exact waiver', () => validateDraftReceipt(
    waivedReceipt,
    req.input_sha256,
    { expectedPolicy: CURRENT_POLICY },
  ), /waiver.*snapshot/i);
  expectThrow('current draft reuse requires the exact waiver', () => validateDraftReviewReuse({
    receipt: waivedReceipt,
    expectedInput: req.input_sha256,
    expectedPolicy: CURRENT_POLICY,
  }), /waiver.*snapshot/i);
  validateDraftReviewReuse({
    receipt: waivedReceipt,
    expectedInput: req.input_sha256,
    expectedPolicy: CURRENT_POLICY,
    waivers: [waiver],
  });

  const completionReq = currentRequest({
    phase: 'completion',
    planned_at_commit: '3'.repeat(40),
    execution_base_commit: '4'.repeat(40),
    diff_sha256: H0,
    acceptance_inventory_sha256: sha256(jcs(INVENTORY)),
  });
  const completionRaw = currentRaw(completionReq, currentOutput(completionReq));
  const completionRun = currentRun(completionReq, completionRaw);
  reviewPolicy.validateCurrentReviewRunResult(completionRun);
  validateCompletionRunResult(completionRun);
  const completionReceipt = currentReceipt(completionReq, completionRun);
  reviewPolicy.validateCurrentReviewReceipt(completionReceipt, completionReq.input_sha256);
  validateCompletionReceipt(completionReceipt, {
    reviewed_head: completionReq.reviewed_commit_or_head,
    diff_sha256: H0,
    plan_input_sha256: completionReq.input_sha256,
    review_status: 'passed',
  });
  expectThrow('current completion requires inventory evidence', () => validateCompletionRunResult({ ...completionRun, acceptance_inventory: undefined }), /unknown key|inventory/);
  expectThrow('current completion receipt rejects draft eligibility', () => reviewPolicy.validateCurrentReviewReceipt({ ...completionReceipt, pre_execution_eligible: true }), /unknown key|pre_execution/);
  const receiptOnlyPrimary = { ...completionReceipt.primary, followups: ['receipt-only follow-up'] };
  expectThrow('current completion receipt final run must equal its validated series final round', () => reviewPolicy.validateCurrentReviewReceipt({
    ...completionReceipt,
    primary: receiptOnlyPrimary,
  }, completionReq.input_sha256), /series.*final|final.*series|receipt.*series/i);
  expectThrow('current completion receipt requires the complete review series', () => reviewPolicy.validateCurrentReviewReceipt({
    ...completionReceipt,
    series: undefined,
  }, completionReq.input_sha256), /series/i);

  const highPrimary = {
    ...primaryEvidence(INVENTORY),
    findings: [{ id: 'C1', source: 'primary', severity: 'high', path: null, locator: null, defect: 'Regression', fix: 'Repair it', reproduction: { method: 'read', command: null, exit_code: null, evidence_sha256: H0 } }],
  };
  const highRun = currentRun(completionReq, completionRaw, { primary: highPrimary });
  assert.equal(highRun.completion_verdict, 'regressed');
  validateCompletionRunResult(highRun);
  expectThrow('current high completion finding cannot pass', () => validateCompletionRunResult({ ...highRun, completion_verdict: 'passed' }), /completion verdict/);

  const completionBlockedRaw = currentRaw(completionReq, currentOutput(completionReq, {
    verdict: 'blocking_gap',
    checklist: currentChecklist({ executable_acceptance: { status: 'blocking_gap', evidence: 'A required command is absent.' } }),
    findings: [currentFinding()],
  }));
  const completionBlocked = currentRun(completionReq, completionBlockedRaw, {
    reviewer: { raw: completionBlockedRaw, accepted_finding_ids: ['P1'], rejected: [] },
    reproduced: [currentReproduction()],
  });
  assert.equal(completionBlocked.completion_verdict, 'regressed');
  validateCompletionRunResult(completionBlocked);

  const completionRejectedBlocking = currentRun(completionReq, completionBlockedRaw);
  assert.deepEqual(completionRejectedBlocking.reviewer.accepted_finding_ids, []);
  assert.equal(completionRejectedBlocking.outcome, 'not_ready', 'rejected completion blocking_gap remains not_ready');
  assert.equal(completionRejectedBlocking.completion_verdict, 'regressed', 'rejected completion blocking_gap remains regressed');
  validateCompletionRunResult(completionRejectedBlocking);
  console.log('current checklist, draft/completion receipts, waivers, and verdict closure passed');
}

function testCurrentCompletionRenderer() {
  const plan = Buffer.from(fixturePlan({ cleanReceipt: true }));
  const reviewedHead = 'c'.repeat(40);
  const inventory = acceptanceInventory(plan);
  const req = currentRequest({
    phase: 'completion',
    reviewed_commit_or_head: reviewedHead,
    planned_at_commit: 'a'.repeat(40),
    execution_base_commit: 'b'.repeat(40),
    diff_sha256: H0,
    acceptance_inventory_sha256: sha256(jcs(inventory)),
    input_sha256: sha256(canonicalPlanView(plan)),
  });
  const run = currentRun(req);
  const receipt = currentReceipt(req, run);
  const receiptKeys = Object.keys(receipt);
  assert.equal(Object.hasOwn(receipt, 'X'), false);
  assert.equal(Object.hasOwn(receipt, 'S'), false);

  const rendered = renderCompletionReviewBlock(receipt);
  assert.ok(rendered.endsWith(`Completion-review-receipt: ${jcs(receipt)}\n`));
  assert.doesNotMatch(rendered, /Cross-check:|\[X:|\[S:|"X":|"S":/, 'schema-5 completion rendering is primary-only');
  assert.deepEqual(Object.keys(receipt), receiptKeys, 'schema-5 renderer leaves receipt keys unchanged');

  const applied = applyCompletionReviewBlock(plan, receipt);
  assert.equal(applyCompletionReviewBlock(applied, receipt).toString(), applied.toString(), 'schema-5 completion apply is idempotent');
  assert.equal(completionStablePlanViewV1(plan), completionStablePlanViewV1(applied));

  const waiver = { phase: 'completion', input_sha256: req.input_sha256, roles: ['primary'], actor: 'test user', reason: 'explicit completion waiver', at: '2026-07-17T00:00:00-03:00' };
  const waivedRaw = currentRaw(req, null, {
    result: 'waived', attempts: [], selected: null, reviewer_output: null, findings_sha256: null,
    waiver, waiver_sha256: sha256(jcs(waiver)), reason: null,
  });
  const waivedRun = currentRun(req, waivedRaw, {
    reviewer: { raw: waivedRaw, accepted_finding_ids: [], rejected: [] },
    reproduced: [],
  });
  const waivedReceipt = currentReceipt(req, waivedRun);
  assert.match(renderCompletionReviewBlock(waivedReceipt, { waivers: [waiver] }), /Primary review:/);
  applyCompletionReviewBlock(plan, waivedReceipt, { waivers: [waiver] });
  console.log('schema-5 primary-only completion render and idempotent apply passed');
}

function testHistoricalSchemas() {
  for (const historical of [POLICY, POLICY_V2, POLICY_V3, POLICY_V4]) validatePolicy(historical);
  validateRequest(request());
  validateRequest(request({ schema: 2, policy: POLICY_V3, policy_sha256: sha256(jcs(POLICY_V3)) }));
  const reqV3 = requestV3();
  validateRequest(reqV3);
  const rubric = {
    standalone_executability: 22, actionability: 16, dependency_order: 12, evidence_reverify: 10,
    goal_coverage: 12, executable_acceptance: 12, failure_mode: 10, assumption_to_question: 6,
  };
  validateReviewerOutput({ schema: 3, leg: 'S', request: reqV3, verdict: 'ready', score: 100, rubric, findings: [], confirmations: ['historical fixture'] }, reqV3, 'S');
  validateDraftRunResult(draftRunV3(reqV3));
  validateWaivers([{ phase: 'draft', input_sha256: reqV3.input_sha256, legs: ['X', 'S'], actor: 'historical user', reason: 'historical waiver shape', at: '2026-07-17T00:00:00-03:00' }], 'draft', reqV3.input_sha256);
  expectThrow('historical policy remains closed', () => validatePolicy({ ...POLICY_V4, role: 'primary' }), /unknown key/);
  expectThrow('historical output remains numeric', () => validateReviewerOutput({ schema: 3, role: 'primary', request: reqV3, verdict: 'pass', checklist: currentChecklist(), findings: [] }, reqV3, 'S'), /unknown key|leg/);
  console.log('historical policy v1-v4 and record schema 1-3 validation results preserved');
}

const args = process.argv.slice(2);
try {
  if (args.length === 0) {
    testClosedSelectors(); testStrictCorpusContract(); testCanonical(); testSchemas(); testValidationMatrix(); testBundle(); testLegs(); testServiceTiers(); await testExecutionCompatibility(); testLifecycle(); testConsumer(); testContractSurfaces(); testReviewRunnerSurfaces(); testManagerSurfaces(); testRelayBoundary();
    console.log('plan-review-policy contract passed');
  } else if (args.length === 2 && args[0] === '--case' && args[1] === 'legs') testLegs();
  else if (args.length === 2 && args[0] === '--case' && args[1] === 'service-tiers') testServiceTiers();
  else if (args.length === 2 && args[0] === '--case' && args[1] === 'lifecycle') testLifecycle();
  else if (args.length === 3 && args[0] === '--case' && args[1] === 'self-demo') testSelfDemo(args[2]);
  else if (args.length === 2 && args[0] === '--case' && args[1] === 'bundle') testBundle();
  else if (args.length === 2 && args[0] === '--case' && args[1] === 'canonical') testCanonical();
  else if (args.length === 2 && args[0] === '--case' && args[1] === 'selectors') testClosedSelectors();
  else if (args.length === 2 && args[0] === '--case' && args[1] === 'strict-contract') testStrictCorpusContract();
  else if (args.length === 2 && args[0] === '--case' && args[1] === 'schemas') testSchemas();
  else if (args.length === 2 && args[0] === '--case' && args[1] === 'completion-reuse') testStrictCompletionReuse();
  else if (args.length === 2 && args[0] === '--case' && args[1] === 'surfaces') {
    testSchemas();
    testHistoricalSchemas();
    testCurrentSingleLane();
    testCurrentReceipts();
    testContractSurfaces();
    testReviewRunnerSurfaces();
    testManagerSurfaces();
    testRelayBoundary();
    await testSchema6PolicySurfaces();
  }
  else if (args.length === 2 && args[0] === '--case' && args[1] === 'validation-matrix') testValidationMatrix();
  else if (args.length === 2 && args[0] === '--case' && args[1] === 'current-single-lane') testCurrentSingleLane();
  else if (args.length === 2 && args[0] === '--case' && args[1] === 'current-receipts') testCurrentReceipts();
  else if (args.length === 2 && args[0] === '--case' && args[1] === 'current-completion-renderer') testCurrentCompletionRenderer();
  else if (args.length === 2 && args[0] === '--case' && args[1] === 'historical-schemas') testHistoricalSchemas();
  else if (args.length === 2 && args[0] === '--case' && args[1] === 'execution-compatibility') await testExecutionCompatibility();
  else if (args.length === 4 && args[0] === '--case' && args[1] === 'strict-differential' && args[2] === '--baseline') testStrictDifferential(args[3]);
  else throw new Error('unknown or malformed plan-review-policy test selector');
} catch (error) {
  console.error(error.stack || error.message); process.exitCode = 1;
}
