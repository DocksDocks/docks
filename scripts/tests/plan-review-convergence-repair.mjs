#!/usr/bin/env node
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as policy from '../../plugins/docks/skills/productivity/plan-review/scripts/review-policy.mjs';

const HELPER = path.resolve('plugins/docks/skills/productivity/plan-review/scripts/review-policy.mjs');
const H0 = '0'.repeat(64);
const H1 = '1'.repeat(64);
const H2 = '2'.repeat(64);
const HISTORICAL_BUNDLE_SHA256 = '0cd3fbd300adc5b7c217bfd7c2cc8d841c8a15d3311e256d919b1f0817e7c0d7';
const HISTORICAL_MANIFEST_SHA256 = 'e08efd85f52f731a4d6038b0ed27f415fa051880f2239638a3e805c6f507b8b2';
const POLICY = {
  schema: 4,
  cross_company_consent: 'always',
  zero_reviewer_policy: 'proceed',
  orchestrator_preference: 'auto',
  minimum_score: 90,
  max_rounds: 5,
  openai_tiers: [{ model: 'gpt-5.6-sol', effort: 'high', service_tier: 'default', transports: ['cli'] }],
  anthropic_tiers: [{ model: 'fable', effort: 'high', transports: ['cli'] }],
  provenance: {
    cross_company_consent: 'current_user',
    zero_reviewer_policy: 'current_user',
    orchestrator_preference: 'skill_default',
    minimum_score: 'runtime_global',
    max_rounds: 'current_user',
    openai_tiers: 'runtime_global',
    anthropic_tiers: 'runtime_global',
  },
};

function git(repo, args) {
  return execFileSync('git', args, {
    cwd: repo,
    encoding: 'utf8',
    env: {
      ...process.env,
      GIT_AUTHOR_DATE: '2026-01-01T00:00:00Z',
      GIT_COMMITTER_DATE: '2026-01-01T00:00:00Z',
    },
  }).trim();
}

function makeWritable(entry) {
  if (!fs.existsSync(entry)) return;
  const stat = fs.lstatSync(entry);
  if (stat.isDirectory()) {
    fs.chmodSync(entry, 0o700);
    for (const name of fs.readdirSync(entry)) makeWritable(path.join(entry, name));
  } else fs.chmodSync(entry, 0o600);
}

function plan(version) {
  return `---
title: Repair fixture
goal: Verify repair evidence
status: planned
created: "2026-07-16T00:00:00-03:00"
updated: "2026-07-16T00:00:00-03:00"
assignee: codex
review_author_company: openai
review_author_tool: codex
review_author_model: gpt-5.6-sol
review_author_effort: high
review_waivers: []
tags: [test]
affected_paths:
  - src/example.txt
related_plans: []
review_status: null
planned_at_commit: null
execution_base_commit: null
---

# Repair fixture

## Goal

Version ${version}.

## Steps

| # | Task | Files | Depends | Status | Done condition |
|---|---|---|---|---|---|
| 1 | Verify repair | src/example.txt | — | planned | Repair is exact. |

## Acceptance criteria

| ID | Command | Expected |
|---|---|---|
| A1 | \`node --version\` | Exits 0. |

## Review

(filled by plan-review on completion)
`;
}

function initializeFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'plan-review-repair-test-'));
  const repo = path.join(root, 'repo');
  fs.mkdirSync(path.join(repo, 'docs/plans/active'), { recursive: true });
  fs.mkdirSync(path.join(repo, 'src'), { recursive: true });
  git(repo, ['init', '-q']);
  git(repo, ['config', 'user.email', 'test@example.com']);
  git(repo, ['config', 'user.name', 'Test']);
  fs.writeFileSync(path.join(repo, 'src/example.txt'), 'example\n');
  fs.writeFileSync(path.join(repo, 'docs/plans/active/repair.md'), plan(1));
  git(repo, ['add', '.']);
  git(repo, ['commit', '-qm', 'previous']);
  const previousCommit = git(repo, ['rev-parse', 'HEAD']);
  const previousPlan = policy.canonicalPlanView(Buffer.from(plan(1)));
  fs.writeFileSync(path.join(repo, 'docs/plans/active/repair.md'), plan(2));
  git(repo, ['add', '.']);
  git(repo, ['commit', '-qm', 'current']);
  return {
    root,
    repo,
    previousCommit,
    currentCommit: git(repo, ['rev-parse', 'HEAD']),
    previousPlan,
    currentPlan: policy.canonicalPlanView(Buffer.from(plan(2))),
  };
}

function request(overrides = {}) {
  return {
    schema: 3,
    request_id: '123e4567-e89b-42d3-a456-426614174000',
    phase: 'draft',
    lifecycle_intent: 'none',
    reviewed_commit_or_head: '0'.repeat(40),
    planned_at_commit: null,
    execution_base_commit: null,
    diff_sha256: null,
    acceptance_inventory_sha256: null,
    input_sha256: H1,
    bundle_sha256: H2,
    author: { company: 'openai', tool: 'codex', model: 'gpt-5.6-sol', effort: 'high' },
    policy: POLICY,
    policy_sha256: policy.sha256(policy.jcs(POLICY)),
    review_mode: 'full',
    round_index: 1,
    previous_input_sha256: null,
    repair_targets_sha256: null,
    ...overrides,
  };
}

function finding() {
  return {
    id: 'S1',
    severity: 'high',
    section: 'Acceptance criteria',
    path: 'src/example.txt',
    locator: 'A1',
    defect: 'The repair target is not bound.',
    fix: 'Bind the exact reproduced target.',
    evidence: 'Fixture evidence.',
    priority: 0,
    confidence: 1,
    blocking: true,
    requirement: 'Repair targets are exact.',
  };
}

function attempt() {
  return {
    schema: 3,
    model: 'gpt-5.6-sol',
    effort: 'high',
    service_tier: 'default',
    transport: 'cli',
    started: true,
    output_started: true,
    result: 'passed',
    exit_code: 0,
    signal: null,
    child_id: 'child-s',
    denial_source: null,
    retry_cause: null,
    timeout_mode: 'orchestrator_tool',
    timeout_seconds: 600,
    reason: 'completed',
    stdout_sha256: H0,
    stderr_sha256: H1,
  };
}

function unavailable(req, leg) {
  return {
    schema: 3,
    leg,
    request: req,
    result: 'unavailable_auth',
    attempts: [],
    selected: null,
    reviewer_output: null,
    findings: [],
    findings_sha256: null,
    severity_totals: { high: 0, medium: 0, low: 0 },
    waiver: null,
    waiver_sha256: null,
    decision_evidence: null,
    reason: 'authentication unavailable',
  };
}

function passed(req, leg, findings, verdict, score) {
  const rubric = score === 100
    ? { standalone_executability: 22, actionability: 16, dependency_order: 12, evidence_reverify: 10, goal_coverage: 12, executable_acceptance: 12, failure_mode: 10, assumption_to_question: 6 }
    : { standalone_executability: 12, actionability: 14, dependency_order: 10, evidence_reverify: 7, goal_coverage: 5, executable_acceptance: 6, failure_mode: 4, assumption_to_question: 5 };
  const structured = { schema: 3, leg, request: req, verdict, score, rubric, findings, confirmations: ['reviewed'] };
  return {
    schema: 3,
    leg,
    request: req,
    result: 'passed',
    attempts: [attempt()],
    selected: { model: 'gpt-5.6-sol', effort: 'high', service_tier: 'default', transport: 'cli' },
    reviewer_output: { verdict, score, rubric, confirmations: ['reviewed'], structured_output_sha256: policy.sha256(policy.jcs(structured)) },
    findings,
    findings_sha256: policy.sha256(policy.jcs(findings)),
    severity_totals: {
      high: findings.filter((row) => row.severity === 'high').length,
      medium: 0,
      low: 0,
    },
    waiver: null,
    waiver_sha256: null,
    decision_evidence: null,
    reason: null,
  };
}

function reproducedTarget() {
  const source = finding();
  return {
    id: source.id,
    source: 'S',
    severity: source.severity,
    path: source.path,
    locator: source.locator,
    defect: source.defect,
    fix: source.fix,
    reproduction: { method: 'read', command: null, exit_code: null, evidence_sha256: H0 },
  };
}

function reconciliation({ accepted = ['S1'], rejected = [] } = {}) {
  return {
    X: { accepted: [], rejected: [] },
    S: { accepted, rejected },
  };
}

function sealRepairBundle(fixture, name, previousPlan, transition) {
  const bundle = path.join(fixture.root, name);
  const sealed = policy.sealBundle({
    repo: fixture.repo,
    reviewedCommit: fixture.currentCommit,
    planPath: 'docs/plans/active/repair.md',
    requestedPaths: ['src/example.txt'],
    outDir: bundle,
    repair: { previousPlan, transition },
  });
  return { bundle, sealed };
}

function removeSealedFile(bundle, relative) {
  fs.chmodSync(bundle, 0o755);
  fs.unlinkSync(path.join(bundle, relative));
  fs.chmodSync(bundle, 0o555);
}

function testRepairArtifacts() {
  assert.equal(typeof policy.buildRepairTransition, 'function', 'buildRepairTransition must be exported');
  const fixture = initializeFixture();
  try {
    const target = reproducedTarget();
    const transition = policy.buildRepairTransition({
      fromRoundIndex: 1,
      previousInputSha256: policy.sha256(fixture.previousPlan),
      currentInputSha256: policy.sha256(fixture.currentPlan),
      reconciliation: reconciliation(),
      targets: [target],
    });
    const { bundle, sealed } = sealRepairBundle(fixture, 'bundle', fixture.previousPlan, transition);
    const repairRequest = request({
      reviewed_commit_or_head: fixture.currentCommit,
      input_sha256: sealed.input_sha256,
      bundle_sha256: sealed.bundle_sha256,
      review_mode: 'repair',
      round_index: 2,
      previous_input_sha256: transition.previous_input_sha256,
      repair_targets_sha256: transition.repair_targets_sha256,
    });
    assert.equal(sealed.manifest.schema, 2);
    assert.equal(fs.readFileSync(path.join(bundle, 'previous-plan.review.md'), 'utf8'), fixture.previousPlan);
    assert.equal(JSON.parse(fs.readFileSync(path.join(bundle, 'repair-targets.json'), 'utf8')).repair_targets_sha256, transition.repair_targets_sha256);
    assert.equal(policy.verifyBundle({ bundle, expectedSha256: sealed.bundle_sha256 }).bundle_sha256, sealed.bundle_sha256);
    assert.doesNotThrow(() => policy.buildReviewerArgv({
      tool: 'claude',
      bundle,
      model: 'fable',
      effort: 'high',
      leg: 'X',
      request: repairRequest,
    }));

    const ordinaryBundle = path.join(fixture.root, 'ordinary-bundle');
    const ordinary = policy.sealBundle({
      repo: fixture.repo,
      reviewedCommit: fixture.currentCommit,
      planPath: 'docs/plans/active/repair.md',
      requestedPaths: ['src/example.txt'],
      outDir: ordinaryBundle,
    });
    assert.throws(() => policy.buildReviewerArgv({
      tool: 'claude',
      bundle: ordinaryBundle,
      model: 'fable',
      effort: 'high',
      leg: 'X',
      request: { ...repairRequest, bundle_sha256: ordinary.bundle_sha256 },
    }), /request and bundle repair mismatch/i);

    const alternatePreviousPlan = policy.canonicalPlanView(Buffer.from(plan(0)));
    const alternateTransition = policy.buildRepairTransition({
      fromRoundIndex: 1,
      previousInputSha256: policy.sha256(alternatePreviousPlan),
      currentInputSha256: policy.sha256(fixture.currentPlan),
      reconciliation: reconciliation(),
      targets: [target],
    });
    const alternate = sealRepairBundle(fixture, 'alternate-bundle', alternatePreviousPlan, alternateTransition);
    assert.equal(policy.verifyBundle({
      bundle: alternate.bundle,
      expectedSha256: alternate.sealed.bundle_sha256,
    }).bundle_sha256, alternate.sealed.bundle_sha256);
    assert.throws(() => policy.buildReviewerArgv({
      tool: 'claude',
      bundle: alternate.bundle,
      model: 'fable',
      effort: 'high',
      leg: 'X',
      request: { ...repairRequest, bundle_sha256: alternate.sealed.bundle_sha256 },
    }), /request and bundle repair mismatch/i);
    assert.throws(() => policy.buildReviewerArgv({
      tool: 'claude',
      bundle,
      model: 'fable',
      effort: 'high',
      leg: 'X',
      request: { ...repairRequest, repair_targets_sha256: H0 },
    }), /request and bundle repair mismatch/i);

    const missingPrevious = sealRepairBundle(fixture, 'missing-previous', fixture.previousPlan, transition);
    removeSealedFile(missingPrevious.bundle, 'previous-plan.review.md');
    assert.throws(() => policy.verifyBundle({
      bundle: missingPrevious.bundle,
      expectedSha256: missingPrevious.sealed.bundle_sha256,
    }), /missing|bundle|repair/i);
    const missingTargets = sealRepairBundle(fixture, 'missing-targets', fixture.previousPlan, transition);
    removeSealedFile(missingTargets.bundle, 'repair-targets.json');
    assert.throws(() => policy.verifyBundle({
      bundle: missingTargets.bundle,
      expectedSha256: missingTargets.sealed.bundle_sha256,
    }), /missing|bundle|repair/i);

    fs.chmodSync(path.join(bundle, 'repair-targets.json'), 0o644);
    fs.writeFileSync(path.join(bundle, 'repair-targets.json'), '{}\n');
    fs.chmodSync(path.join(bundle, 'repair-targets.json'), 0o444);
    assert.throws(() => policy.verifyBundle({ bundle, expectedSha256: sealed.bundle_sha256 }), /repair|hash|bundle/i);
  } finally {
    makeWritable(fixture.root);
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
  console.log('repair artifacts are sealed and substitution fails closed');
}

function testRepairSeries() {
  assert.equal(typeof policy.buildRepairTransition, 'function', 'buildRepairTransition must be exported');
  const first = request();
  const source = finding();
  const reproduced = reproducedTarget();
  const roundOne = {
    schema: 3,
    kind: 'draft',
    request: first,
    X: unavailable(first, 'X'),
    S: passed(first, 'S', [source], 'not_ready', 63),
    reproduced: [reproduced],
    decision_evidence: null,
    outcome: 'single',
    pre_execution_eligible: false,
  };
  const transition = policy.buildRepairTransition({
    fromRoundIndex: 1,
    previousInputSha256: first.input_sha256,
    currentInputSha256: H2,
    reconciliation: reconciliation(),
    targets: [reproduced],
  });
  assert.deepEqual(transition.reconciliation, reconciliation());
  const second = request({
    request_id: '223e4567-e89b-42d3-a456-426614174000',
    review_mode: 'repair',
    round_index: 2,
    previous_input_sha256: first.input_sha256,
    input_sha256: H2,
    repair_targets_sha256: transition.repair_targets_sha256,
  });
  const roundTwo = {
    schema: 3,
    kind: 'draft',
    request: second,
    X: unavailable(second, 'X'),
    S: passed(second, 'S', [], 'ready', 100),
    reproduced: [],
    decision_evidence: null,
    outcome: 'single',
    pre_execution_eligible: true,
  };
  const series = {
    schema: 3,
    policy_sha256: first.policy_sha256,
    initial_input_sha256: first.input_sha256,
    current_input_sha256: second.input_sha256,
    rounds: [roundOne, roundTwo],
    repairs: [transition],
  };
  policy.validateReviewSeries(series);
  assert.throws(() => policy.buildRepairTransition({
    fromRoundIndex: 1,
    previousInputSha256: first.input_sha256,
    currentInputSha256: H2,
    reconciliation: reconciliation({
      accepted: [],
      rejected: [{ id: 'S1', reason: 'Main context rejected this reproduced finding.' }],
    }),
    targets: [reproduced],
  }), /accepted|rejected|reconciliation|target/i);
  assert.throws(
    () => policy.validateReviewSeries({ ...series, repairs: [{ ...transition, repair_targets_sha256: H0 }] }),
    /repair.*target|target.*hash/i,
  );
  const incompleteReconciliation = {
    ...transition,
    reconciliation: { X: { accepted: [], rejected: [] }, S: { accepted: [], rejected: [] } },
  };
  incompleteReconciliation.repair_targets_sha256 = policy.sha256(policy.jcs({
    schema: 1,
    reconciliation: incompleteReconciliation.reconciliation,
    targets: incompleteReconciliation.targets,
  }));
  assert.throws(
    () => policy.validateReviewSeries({ ...series, repairs: [incompleteReconciliation] }),
    /partition|reconciliation|accepted/i,
  );
  const manager = fs.readFileSync('plugins/docks/skills/productivity/plan-manager/SKILL.md', 'utf8');
  assert.doesNotMatch(manager, /fresh request over the unchanged input/i);
  assert.match(manager, /blocking_gap.*run `not_ready`.*rejected.*reconciliation/is);
  console.log('repair series recomputes targets and no-change review terminates');
}

function testReviewerWorkdir() {
  assert.equal(typeof policy.prepareReviewerWorkspace, 'function', 'prepareReviewerWorkspace must be exported');
  assert.equal(typeof policy.cleanupReviewerWorkspace, 'function', 'cleanupReviewerWorkspace must be exported');
  const fixture = initializeFixture();
  let prepared;
  try {
    const bundle = path.join(fixture.root, 'bundle');
    const sealed = policy.sealBundle({
      repo: fixture.repo,
      reviewedCommit: fixture.currentCommit,
      planPath: 'docs/plans/active/repair.md',
      requestedPaths: ['src/example.txt'],
      outDir: bundle,
    });
    const req = request({
      reviewed_commit_or_head: fixture.currentCommit,
      input_sha256: sealed.input_sha256,
      bundle_sha256: sealed.bundle_sha256,
    });
    assert.throws(() => policy.buildReviewerArgv({
      tool: 'codex',
      bundle,
      model: 'gpt-5.6-sol',
      effort: 'high',
      serviceTier: 'default',
      leg: 'S',
      request: req,
    }), /reviewer workspace.*required/i);
    prepared = policy.prepareReviewerWorkspace({ requestId: req.request_id, leg: 'S' });
    const argv = policy.buildReviewerArgv({
      tool: 'codex',
      bundle,
      reviewerWorkspace: prepared,
      model: 'gpt-5.6-sol',
      effort: 'high',
      serviceTier: 'default',
      leg: 'S',
      request: req,
    });
    assert.equal(argv[argv.indexOf('-C') + 1], prepared.workspace);
    assert.notEqual(prepared.workspace, bundle);
    assert.ok(argv.includes('--ephemeral'));
    assert.ok(argv.includes('--ignore-user-config'));
    assert.match(argv.at(-1), new RegExp(`sealed bundle: ${bundle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i'));
    fs.mkdirSync(path.join(prepared.workspace, '.git'));
    fs.mkdirSync(path.join(prepared.workspace, '.agents'));
    assert.equal(policy.verifyBundle({ bundle, expectedSha256: sealed.bundle_sha256 }).bundle_sha256, sealed.bundle_sha256);
    assert.equal(policy.cleanupReviewerWorkspace({ requestId: req.request_id, leg: 'S', prepared }).removed, true);
    prepared = null;
  } finally {
    if (prepared?.workspace && fs.existsSync(prepared.workspace)) fs.rmSync(prepared.workspace, { recursive: true, force: true });
    makeWritable(fixture.root);
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
  console.log('reviewer workdir isolates Codex bootstrap writes from the sealed bundle');
}

function testReviewerLive() {
  assert.equal(process.env.DOCKS_LIVE_CODEX_REVIEW, '1', 'set DOCKS_LIVE_CODEX_REVIEW=1 to run the credentialed live acceptance');
  const fixture = initializeFixture();
  let prepared;
  try {
    const bundle = path.join(fixture.root, 'live-bundle');
    const sealed = policy.sealBundle({
      repo: fixture.repo,
      reviewedCommit: fixture.currentCommit,
      planPath: 'docs/plans/active/repair.md',
      requestedPaths: ['src/example.txt'],
      outDir: bundle,
    });
    const req = request({
      request_id: randomUUID(),
      reviewed_commit_or_head: fixture.currentCommit,
      input_sha256: sealed.input_sha256,
      bundle_sha256: sealed.bundle_sha256,
    });
    prepared = policy.prepareReviewerWorkspace({ requestId: req.request_id, leg: 'S' });
    const argv = policy.buildReviewerArgv({
      tool: 'codex',
      bundle,
      reviewerWorkspace: prepared,
      model: 'gpt-5.6-sol',
      effort: 'high',
      serviceTier: 'default',
      leg: 'S',
      request: req,
    });
    assert.deepEqual(
      argv.filter((value, index) => argv[index - 1] === '-c'),
      ['model_reasoning_effort=high', 'service_tier="default"'],
    );
    const before = policy.verifyBundle({ bundle, expectedSha256: sealed.bundle_sha256 }).bundle_sha256;
    const stdout = execFileSync('codex', argv, {
      encoding: 'utf8',
      timeout: 600_000,
      maxBuffer: 16 * 1024 * 1024,
    });
    policy.extractReviewerOutput('codex', stdout, req, 'S', bundle);
    assert.equal(policy.verifyBundle({ bundle, expectedSha256: sealed.bundle_sha256 }).bundle_sha256, before);
    assert.equal(policy.cleanupReviewerWorkspace({
      requestId: req.request_id,
      leg: 'S',
      prepared,
    }).removed, true);
    prepared = null;
  } finally {
    if (prepared?.workspace && fs.existsSync(prepared.workspace)) {
      policy.cleanupReviewerWorkspace({ requestId: prepared.request_id, leg: prepared.leg, prepared });
    }
    makeWritable(fixture.root);
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
  console.log('live Codex reviewer preserves explicit Standard tier, typed output, sealed bundle, and workspace cleanup');
}

function testCliTransport() {
  const fixture = initializeFixture();
  const requestId = randomUUID();
  const preparedPath = path.join(fixture.root, 'prepared-workspace.json');
  let prepared = null;
  try {
    prepared = JSON.parse(execFileSync('node', [HELPER, 'reviewer-workspace-prepare', requestId, 'S'], { encoding: 'utf8' }));
    assert.equal(prepared.workspace, `/tmp/docks-plan-review-run/${requestId}-S`);
    fs.writeFileSync(preparedPath, `${policy.jcs(prepared)}\n`);
    const cleaned = JSON.parse(execFileSync('node', [HELPER, 'reviewer-workspace-cleanup', requestId, 'S', preparedPath], { encoding: 'utf8' }));
    assert.equal(cleaned.removed, true);
    prepared = null;

    const transition = policy.buildRepairTransition({
      fromRoundIndex: 1,
      previousInputSha256: policy.sha256(fixture.previousPlan),
      currentInputSha256: policy.sha256(fixture.currentPlan),
      reconciliation: reconciliation(),
      targets: [reproducedTarget()],
    });
    const previousPlanPath = path.join(fixture.root, 'previous-plan.review.md');
    const transitionPath = path.join(fixture.root, 'repair-transition.json');
    const bundle = path.join(fixture.root, 'repair-bundle');
    fs.writeFileSync(previousPlanPath, fixture.previousPlan);
    fs.writeFileSync(transitionPath, `${policy.jcs(transition)}\n`);
    const sealed = JSON.parse(execFileSync('node', [
      HELPER, 'bundle-repair', fixture.repo, fixture.currentCommit,
      'docs/plans/active/repair.md', bundle, previousPlanPath, transitionPath,
      '-', '-', 'src/example.txt',
    ], { encoding: 'utf8' }));
    assert.equal(sealed.manifest.schema, 2);
    assert.equal(policy.verifyBundle({ bundle, expectedSha256: sealed.bundle_sha256 }).manifest.repair.repair_targets_sha256, transition.repair_targets_sha256);
    console.log('CLI transports preserve repair bundles and reviewer workspaces');
  } finally {
    if (prepared !== null) {
      fs.writeFileSync(preparedPath, `${policy.jcs(prepared)}\n`);
      execFileSync('node', [HELPER, 'reviewer-workspace-cleanup', requestId, 'S', preparedPath]);
    }
    makeWritable(fixture.root);
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
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
  provenance: { role: 'skill_default', fallback: 'skill_default', max_rounds: 'skill_default', candidates: 'skill_default' },
};

function currentRequest(overrides = {}) {
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
    input_sha256: H1,
    bundle_sha256: H2,
    author: { company: 'openai', tool: 'codex', model: 'gpt-5.6-sol', effort: 'high' },
    policy: CURRENT_POLICY,
    policy_sha256: policy.sha256(policy.jcs(CURRENT_POLICY)),
    review_mode: 'full',
    round_index: 1,
    previous_input_sha256: null,
    repair_targets_sha256: null,
    ...overrides,
  };
}

function currentChecklist(executableStatus = 'pass') {
  const criteria = [
    'standalone_executability', 'actionability', 'dependency_order', 'evidence_reverification',
    'goal_coverage', 'executable_acceptance', 'failure_modes', 'open_questions',
  ];
  return Object.fromEntries(criteria.map((criterion) => [
    criterion,
    { status: criterion === 'executable_acceptance' ? executableStatus : 'pass', evidence: `${criterion} evidence` },
  ]));
}

function currentFinding(status = 'blocking_gap') {
  return {
    id: 'P1',
    criterion: 'executable_acceptance',
    status,
    section: 'Acceptance criteria',
    path: 'src/example.txt',
    locator: 'A1',
    defect: 'The repair target is not bound.',
    fix: 'Bind the exact reproduced target.',
    evidence: 'The sealed plan lacks the required binding.',
  };
}

function currentOutput(req, status = 'pass') {
  return {
    schema: 5,
    role: 'primary',
    request: req,
    verdict: status,
    checklist: currentChecklist(status === 'pass' ? 'pass' : status),
    findings: status === 'pass' ? [] : [currentFinding(status)],
  };
}

function currentRaw(req, status = 'pass') {
  const output = currentOutput(req, status);
  return {
    schema: 5,
    role: 'primary',
    request: req,
    result: 'passed',
    attempts: [{
      schema: 5,
      candidate: CURRENT_POLICY.candidates[0],
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
    }],
    selected: CURRENT_POLICY.candidates[0],
    reviewer_output: output,
    findings_sha256: policy.sha256(policy.jcs(output.findings)),
    waiver: null,
    waiver_sha256: null,
    reason: null,
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

function currentPrimary(inventory) {
  return {
    goal_met: 'yes',
    findings: [],
    acceptance: inventory.criteria.map((criterion) => ({
      criterion_id: criterion.id,
      command: criterion.command,
      expected: criterion.expected,
      exit_code: 0,
      actual_sha256: H0,
      met: true,
    })),
    ci: { command: 'node --test', exit_code: 0, first_failure: null, output_sha256: H1 },
    regressions: [],
    followups: [],
  };
}

function currentCompletionRun(req, inventory) {
  const raw = currentRaw(req);
  return {
    schema: 5,
    kind: 'completion',
    request: req,
    plan_input_sha256: req.input_sha256,
    diff_sha256: req.diff_sha256,
    acceptance_inventory: inventory,
    acceptance_inventory_sha256: req.acceptance_inventory_sha256,
    reviewer: { raw, accepted_finding_ids: [], rejected: [] },
    reproduced: [],
    outcome: 'passed',
    primary: currentPrimary(inventory),
    completion_verdict: 'passed',
  };
}

function currentRun(req, status = 'pass') {
  const raw = currentRaw(req, status);
  const accepted = status === 'blocking_gap' ? ['P1'] : [];
  const reproduced = status === 'blocking_gap'
    ? [{ id: 'P1', reproduction: { method: 'read', command: null, exit_code: null, evidence_sha256: H0 } }]
    : [];
  return {
    schema: 5,
    kind: 'draft',
    request: req,
    reviewer: { raw, accepted_finding_ids: accepted, rejected: [] },
    reproduced,
    outcome: status === 'blocking_gap' ? 'not_ready' : 'passed',
    pre_execution_eligible: status !== 'blocking_gap',
  };
}

function currentRepairTarget(status = 'blocking_gap') {
  const source = currentFinding(status);
  return {
    source: 'primary',
    id: source.id,
    criterion: source.criterion,
    status: source.status,
    section: source.section,
    path: source.path,
    locator: source.locator,
    defect: source.defect,
    fix: source.fix,
    evidence: source.evidence,
    reproduction: { method: 'read', command: null, exit_code: null, evidence_sha256: H0 },
  };
}

function testSingleRepair() {
  const first = currentRequest();
  const roundOne = currentRun(first, 'blocking_gap');
  const transition = policy.buildCurrentRepairTransition({
    fromRoundIndex: 1,
    previousInputSha256: first.input_sha256,
    currentInputSha256: H2,
    acceptedFindingIds: ['P1'],
    targets: [currentRepairTarget()],
  });
  const second = currentRequest({
    request_id: '623e4567-e89b-42d3-a456-426614174000',
    review_mode: 'repair',
    round_index: 2,
    previous_input_sha256: first.input_sha256,
    input_sha256: H2,
    bundle_sha256: H0,
    repair_targets_sha256: transition.repair_targets_sha256,
  });
  const roundTwo = currentRun(second);
  const series = {
    schema: 5,
    policy_sha256: first.policy_sha256,
    initial_input_sha256: first.input_sha256,
    current_input_sha256: second.input_sha256,
    rounds: [roundOne, roundTwo],
    repairs: [transition],
  };
  policy.validateCurrentReviewSeries(series);
  const completeTarget = currentRepairTarget();
  for (const key of ['source', 'section', 'path', 'locator', 'evidence']) {
    const missing = structuredClone(completeTarget);
    delete missing[key];
    assert.throws(() => policy.buildCurrentRepairTransition({
      fromRoundIndex: 1,
      previousInputSha256: first.input_sha256,
      currentInputSha256: H2,
      acceptedFindingIds: ['P1'],
      targets: [missing],
    }), new RegExp(`${key}|missing|repair target`, 'i'));
  }
  for (const [key, value] of [
    ['section', 'Different section'],
    ['path', 'src/other.txt'],
    ['locator', 'A9'],
    ['evidence', 'Different evidence'],
  ]) {
    const changedTarget = { ...completeTarget, [key]: value };
    const changedTransition = policy.buildCurrentRepairTransition({
      fromRoundIndex: 1,
      previousInputSha256: first.input_sha256,
      currentInputSha256: H2,
      acceptedFindingIds: ['P1'],
      targets: [changedTarget],
    });
    assert.throws(() => policy.validateCurrentReviewSeries({
      ...series,
      repairs: [changedTransition],
      rounds: [roundOne, currentRun({
        ...second,
        repair_targets_sha256: changedTransition.repair_targets_sha256,
      })],
    }), new RegExp(`${key}|exact|reproduced`, 'i'));
  }
  assert.throws(() => policy.buildCurrentRepairTransition({
    fromRoundIndex: 1,
    previousInputSha256: first.input_sha256,
    currentInputSha256: H2,
    acceptedFindingIds: ['P1'],
    targets: [{ ...completeTarget, source: 'secondary' }],
  }), /source|primary/i);

  assert.throws(() => policy.buildCurrentRepairTransition({
    fromRoundIndex: 1,
    previousInputSha256: first.input_sha256,
    currentInputSha256: H2,
    acceptedFindingIds: ['P1'],
    targets: [currentRepairTarget('non_blocking_gap')],
  }), /blocking|repair target/i);
  assert.throws(() => policy.buildCurrentRepairTransition({
    fromRoundIndex: 1,
    previousInputSha256: first.input_sha256,
    currentInputSha256: first.input_sha256,
    acceptedFindingIds: ['P1'],
    targets: [currentRepairTarget()],
  }), /changed input/i);
  assert.throws(() => policy.buildCurrentRepairTransition({
    fromRoundIndex: 2,
    previousInputSha256: first.input_sha256,
    currentInputSha256: H2,
    acceptedFindingIds: ['P1'],
    targets: [currentRepairTarget()],
  }), /round one|one repair/i);
  assert.throws(() => policy.validateCurrentReviewSeries({
    ...series,
    rounds: [roundOne, { ...roundTwo, request: { ...second, review_mode: 'full', previous_input_sha256: null, repair_targets_sha256: null } }],
  }), /repair|reset|round two/i);
  assert.throws(() => policy.validateCurrentReviewSeries({
    ...series,
    rounds: [roundOne, roundTwo, { ...roundTwo, request: { ...second, round_index: 3 } }],
    repairs: [transition, transition],
  }), /round|two|repair/i);
  assert.throws(() => policy.validateCurrentReviewSeries({
    ...series,
    rounds: [{ ...roundOne, reproduced: [] }, roundTwo],
  }), /reproduced|target/i);
  assert.throws(() => policy.validateCurrentReviewSeries({
    ...series,
    rounds: [{
      ...roundOne,
      reviewer: { ...roundOne.reviewer, accepted_finding_ids: [] },
    }, roundTwo],
  }), /accepted|target/i);

  const secondBlockingFinding = { ...currentFinding(), id: 'P2', locator: 'A2' };
  const rejectedBlockingOutput = {
    ...roundOne.reviewer.raw.reviewer_output,
    findings: [currentFinding(), secondBlockingFinding],
  };
  const rejectedBlockingRaw = {
    ...roundOne.reviewer.raw,
    reviewer_output: rejectedBlockingOutput,
    findings_sha256: policy.sha256(policy.jcs(rejectedBlockingOutput.findings)),
  };
  const rejectedBlockingRoundOne = {
    ...roundOne,
    reviewer: {
      raw: rejectedBlockingRaw,
      accepted_finding_ids: ['P1'],
      rejected: [{ id: 'P2', reason: 'plan-manager rejected the blocker' }],
    },
    reproduced: [
      ...roundOne.reproduced,
      { id: 'P2', reproduction: { method: 'read', command: null, exit_code: null, evidence_sha256: H1 } },
    ],
  };
  assert.throws(() => policy.validateCurrentReviewSeries({
    ...series,
    rounds: [rejectedBlockingRoundOne, roundTwo],
  }), /rejected.*blocking|blocking.*rejected/i);

  const lifecycleDrift = currentRequest({
    ...second,
    lifecycle_intent: 'start',
  });
  assert.throws(() => policy.validateCurrentReviewSeries({
    ...series,
    rounds: [roundOne, currentRun(lifecycleDrift)],
  }), /lifecycle.*drift/i);

  const inventory = policy.acceptanceInventory(Buffer.from(plan(2)));
  const phaseDrift = currentRequest({
    ...second,
    phase: 'completion',
    lifecycle_intent: 'none',
    planned_at_commit: '3'.repeat(40),
    execution_base_commit: '4'.repeat(40),
    diff_sha256: H0,
    acceptance_inventory_sha256: policy.sha256(policy.jcs(inventory)),
  });
  assert.throws(() => policy.validateCurrentReviewSeries({
    ...series,
    rounds: [roundOne, currentCompletionRun(phaseDrift, inventory)],
  }), /phase.*drift|kind.*drift/i);

  const completionFirst = currentRequest({
    ...first,
    phase: 'completion',
    lifecycle_intent: 'none',
    planned_at_commit: '3'.repeat(40),
    execution_base_commit: '4'.repeat(40),
    diff_sha256: H0,
    acceptance_inventory_sha256: policy.sha256(policy.jcs(inventory)),
  });
  const completionBlockingRaw = currentRaw(completionFirst, 'blocking_gap');
  const completionRoundOne = {
    ...currentCompletionRun(completionFirst, inventory),
    reviewer: { raw: completionBlockingRaw, accepted_finding_ids: ['P1'], rejected: [] },
    reproduced: [{ id: 'P1', reproduction: { method: 'read', command: null, exit_code: null, evidence_sha256: H0 } }],
    outcome: 'not_ready',
    completion_verdict: 'regressed',
  };
  const completionSecond = currentRequest({
    ...second,
    phase: 'completion',
    lifecycle_intent: 'none',
    planned_at_commit: completionFirst.planned_at_commit,
    execution_base_commit: '5'.repeat(40),
    diff_sha256: H1,
    acceptance_inventory_sha256: policy.sha256(policy.jcs(inventory)),
  });
  assert.throws(() => policy.validateCurrentReviewSeries({
    ...series,
    rounds: [completionRoundOne, currentCompletionRun(completionSecond, inventory)],
  }), /execution.*drift|execution_base_commit|completion.*identity/i);

  assert.throws(() => policy.validateCurrentReviewSeries({
    ...series,
    rounds: [roundOne, { ...roundTwo, kind: 'completion' }],
  }), /kind.*drift|run kind/i);
  console.log('single repair requires every raw blocker accepted and reproduced, changed input, and exactly two rounds');
}

function testCurrentBundles() {
  const fixture = initializeFixture();
  const directBundles = [];
  try {
    const historicalDefault = policy.sealBundle({
      repo: fixture.repo,
      reviewedCommit: fixture.currentCommit,
      planPath: 'docs/plans/active/repair.md',
      requestedPaths: ['src/example.txt'],
      outDir: path.join(fixture.root, 'historical-default'),
    });
    const historicalExplicit = policy.sealBundle({
      repo: fixture.repo,
      reviewedCommit: fixture.currentCommit,
      planPath: 'docs/plans/active/repair.md',
      requestedPaths: ['src/example.txt'],
      outDir: path.join(fixture.root, 'historical-explicit'),
      reviewSchema: 3,
    });
    assert.equal(historicalExplicit.bundle_sha256, historicalDefault.bundle_sha256, 'explicit historical review schema remains byte-compatible');
    assert.equal(historicalDefault.manifest.schema, 1);
    assert.equal(Object.hasOwn(historicalDefault.manifest, 'review_schema'), false);
    assert.deepEqual(historicalDefault.manifest.reviewer_schemas, {
      X: 'reviewer-output.X.schema.json',
      S: 'reviewer-output.S.schema.json',
    });
    assert.equal(historicalDefault.manifest.files.some(({ path: entry }) => entry === 'reviewer-output.primary.v5.schema.json'), false);
    assert.deepEqual(historicalExplicit.manifest, historicalDefault.manifest, 'historical/default manifest remains unchanged');
    assert.equal(historicalDefault.bundle_sha256, HISTORICAL_BUNDLE_SHA256, 'historical bundle bytes match the fixed pre-schema-5 golden');
    assert.equal(policy.sha256(policy.jcs(historicalDefault.manifest)), HISTORICAL_MANIFEST_SHA256, 'historical manifest bytes match the fixed pre-schema-5 golden');

    const currentBundle = policy.sealBundle({
      repo: fixture.repo,
      reviewedCommit: fixture.currentCommit,
      planPath: 'docs/plans/active/repair.md',
      requestedPaths: ['src/example.txt'],
      outDir: path.join(fixture.root, 'current-bundle'),
      reviewSchema: 5,
    });
    assert.equal(currentBundle.manifest.schema, 3);
    assert.equal(currentBundle.manifest.review_schema, 5);
    assert.deepEqual(currentBundle.manifest.reviewer_schemas, {
      primary: 'reviewer-output.primary.v5.schema.json',
    });
    assert.equal(fs.existsSync(path.join(fixture.root, 'current-bundle/reviewer-output.primary.v5.schema.json')), true);
    assert.equal(currentBundle.manifest.files.some(({ path: entry }) => /^reviewer-output\.[XS](?:\.v[23])?\.schema\.json$/.test(entry)), false);
    policy.verifyBundle({ bundle: path.join(fixture.root, 'current-bundle'), expectedSha256: currentBundle.bundle_sha256 });
    fs.mkdirSync('/tmp/docks-plan-review', { recursive: true, mode: 0o700 });
    const directFullPath = path.join('/tmp/docks-plan-review', randomUUID());
    directBundles.push(directFullPath);
    const directFull = policy.sealBundle({
      repo: fixture.repo,
      reviewedCommit: fixture.currentCommit,
      planPath: 'docs/plans/active/repair.md',
      requestedPaths: ['src/example.txt'],
      outDir: directFullPath,
      reviewSchema: 5,
    });
    assert.deepEqual(policy.destroyBundle({ bundle: directFullPath, expectedSha256: directFull.bundle_sha256 }), {
      schema: 1,
      bundle_sha256: directFull.bundle_sha256,
      removed: true,
    });

    const transition = policy.buildCurrentRepairTransition({
      fromRoundIndex: 1,
      previousInputSha256: policy.sha256(fixture.previousPlan),
      currentInputSha256: policy.sha256(fixture.currentPlan),
      acceptedFindingIds: ['P1'],
      targets: [currentRepairTarget()],
    });
    const repaired = policy.sealBundle({
      repo: fixture.repo,
      reviewedCommit: fixture.currentCommit,
      planPath: 'docs/plans/active/repair.md',
      requestedPaths: ['src/example.txt'],
      outDir: path.join(fixture.root, 'current-repair-bundle'),
      reviewSchema: 5,
      repair: { previousPlan: fixture.previousPlan, transition },
    });
    assert.equal(repaired.manifest.schema, 4);
    const directRepairPath = path.join('/tmp/docks-plan-review', randomUUID());
    directBundles.push(directRepairPath);
    const directRepair = policy.sealBundle({
      repo: fixture.repo,
      reviewedCommit: fixture.currentCommit,
      planPath: 'docs/plans/active/repair.md',
      requestedPaths: ['src/example.txt'],
      outDir: directRepairPath,
      reviewSchema: 5,
      repair: { previousPlan: fixture.previousPlan, transition },
    });
    assert.deepEqual(policy.destroyBundle({ bundle: directRepairPath, expectedSha256: directRepair.bundle_sha256 }), {
      schema: 1,
      bundle_sha256: directRepair.bundle_sha256,
      removed: true,
    });

    assert.throws(() => policy.sealBundle({
      repo: fixture.repo,
      reviewedCommit: fixture.currentCommit,
      planPath: 'docs/plans/active/repair.md',
      requestedPaths: [],
      outDir: path.join(fixture.root, 'untyped-current-repair'),
      repair: { previousPlan: fixture.previousPlan, transition },
    }), /reviewSchema|review schema|schema-5 repair/i);
    console.log('current bundle carries primary v5 identity while historical bundles remain byte-compatible');
  } finally {
    for (const directBundle of directBundles) {
      if (!fs.existsSync(directBundle)) continue;
      makeWritable(directBundle);
      fs.rmSync(directBundle, { recursive: true, force: true });
    }
    makeWritable(fixture.root);
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
}

function testCurrentReviewerArgv() {
  const fixture = initializeFixture();
  let prepared = null;
  try {
    const bundle = path.join(fixture.root, 'current-argv-bundle');
    const sealed = policy.sealBundle({
      repo: fixture.repo,
      reviewedCommit: fixture.currentCommit,
      planPath: 'docs/plans/active/repair.md',
      requestedPaths: ['src/example.txt'],
      outDir: bundle,
      reviewSchema: 5,
    });
    const req = currentRequest({
      request_id: randomUUID(),
      reviewed_commit_or_head: fixture.currentCommit,
      input_sha256: sealed.input_sha256,
      bundle_sha256: sealed.bundle_sha256,
    });
    prepared = policy.prepareReviewerWorkspace({ requestId: req.request_id, leg: 'primary' });
    const gpt = CURRENT_POLICY.candidates[0];
    const correct = {
      tool: gpt.tool,
      bundle,
      reviewerWorkspace: prepared,
      model: gpt.model,
      effort: gpt.effort,
      serviceTier: gpt.service_tier,
      leg: 'primary',
      request: req,
      priorAttempts: [],
    };
    const argv = policy.buildReviewerArgv(correct);
    const modelAt = argv.indexOf('-m');
    assert.equal(argv[modelAt + 1], 'gpt-5.6-sol');
    assert.deepEqual(argv.slice(modelAt + 2, modelAt + 6), ['-c', 'model_reasoning_effort=high', '-c', 'service_tier="default"']);
    assert.equal(argv.includes('features.fast_mode=true'), false);
    assert.equal(argv[argv.indexOf('--output-schema') + 1], path.join(bundle, 'reviewer-output.primary.v5.schema.json'));

    for (const [label, overrides, pattern] of [
      ['wrong tool', { tool: 'claude' }, /candidate.*tool|tool.*candidate/i],
      ['wrong model', { model: 'gpt-5.5' }, /candidate.*model|model.*candidate/i],
      ['wrong effort', { effort: 'xhigh' }, /candidate.*effort|effort.*candidate/i],
      ['fast service tier', { serviceTier: 'fast' }, /service.*tier|candidate/i],
      ['candidate order', {
        tool: 'claude',
        model: 'fable',
        effort: 'high',
        serviceTier: null,
        priorAttempts: [],
      }, /candidate.*order|next candidate/i],
    ]) assert.throws(() => policy.buildReviewerArgv({ ...correct, ...overrides }), pattern, label);
    const unavailableGpt = currentAttempt(gpt, {
      output_started: false,
      result: 'model_unavailable',
      exit_code: 1,
      reason: 'the requested model is unavailable',
    });
    const fable = CURRENT_POLICY.candidates[1];
    const fallbackArgv = policy.buildReviewerArgv({
      ...correct,
      tool: fable.tool,
      model: fable.model,
      effort: fable.effort,
      serviceTier: null,
      priorAttempts: [unavailableGpt],
    });
    assert.equal(fallbackArgv[fallbackArgv.indexOf('--model') + 1], 'fable');

    const wrongFirstAttempt = currentAttempt(fable, {
      started: false,
      output_started: false,
      child_id: null,
      timeout_mode: null,
      timeout_seconds: null,
      result: 'tool_unavailable',
      exit_code: null,
      reason: 'Claude is not installed',
      stdout_sha256: null,
      stderr_sha256: null,
    });
    assert.throws(() => policy.buildReviewerArgv({
      ...correct,
      tool: fable.tool,
      model: fable.model,
      effort: fable.effort,
      serviceTier: null,
      priorAttempts: [wrongFirstAttempt],
    }), /candidate.*order|attempt.*order/i);
    console.log('schema-5 reviewer argv binds prior attempts and the exact next policy candidate');
  } finally {
    if (prepared !== null && fs.existsSync(prepared.workspace)) {
      policy.cleanupReviewerWorkspace({ requestId: prepared.request_id, leg: prepared.leg, prepared });
    }
    makeWritable(fixture.root);
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
}

const cases = new Map([
  ['repair-artifacts', testRepairArtifacts],
  ['repair-series', testRepairSeries],
  ['reviewer-workdir', testReviewerWorkdir],
  ['reviewer-live', testReviewerLive],
  ['single-repair', testSingleRepair],
  ['current-bundle', testCurrentBundles],
  ['current-argv', testCurrentReviewerArgv],
  ['cli-transport', testCliTransport],
]);
const args = process.argv.slice(2);
if (args.length !== 2 || args[0] !== '--case' || !cases.has(args[1])) {
  console.error(`usage: ${path.basename(process.argv[1])} --case ${[...cases.keys()].join('|')}`);
  process.exit(2);
}
cases.get(args[1])();
