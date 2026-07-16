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
  return execFileSync('git', args, { cwd: repo, encoding: 'utf8' }).trim();
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

function testRepairArtifacts() {
  assert.equal(typeof policy.buildRepairTransition, 'function', 'buildRepairTransition must be exported');
  const fixture = initializeFixture();
  try {
    const target = reproducedTarget();
    const transition = policy.buildRepairTransition({
      fromRoundIndex: 1,
      previousInputSha256: policy.sha256(fixture.previousPlan),
      currentInputSha256: policy.sha256(fixture.currentPlan),
      targets: [target],
    });
    const bundle = path.join(fixture.root, 'bundle');
    const sealed = policy.sealBundle({
      repo: fixture.repo,
      reviewedCommit: fixture.currentCommit,
      planPath: 'docs/plans/active/repair.md',
      requestedPaths: ['src/example.txt'],
      outDir: bundle,
      repair: { previousPlan: fixture.previousPlan, transition },
    });
    assert.equal(sealed.manifest.schema, 2);
    assert.equal(fs.readFileSync(path.join(bundle, 'previous-plan.review.md'), 'utf8'), fixture.previousPlan);
    assert.equal(JSON.parse(fs.readFileSync(path.join(bundle, 'repair-targets.json'), 'utf8')).repair_targets_sha256, transition.repair_targets_sha256);
    assert.equal(policy.verifyBundle({ bundle, expectedSha256: sealed.bundle_sha256 }).bundle_sha256, sealed.bundle_sha256);
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
    targets: [reproduced],
  });
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
  assert.throws(
    () => policy.validateReviewSeries({ ...series, repairs: [{ ...transition, repair_targets_sha256: H0 }] }),
    /repair.*target|target.*hash/i,
  );
  const manager = fs.readFileSync('plugins/docks/skills/productivity/plan-manager/SKILL.md', 'utf8');
  assert.doesNotMatch(manager, /fresh request over the unchanged input/i);
  assert.match(manager, /below-floor.*no reproducible finding.*convergence-exhausted/is);
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

const cases = new Map([
  ['repair-artifacts', testRepairArtifacts],
  ['repair-series', testRepairSeries],
  ['reviewer-workdir', testReviewerWorkdir],
  ['cli-transport', testCliTransport],
]);
const args = process.argv.slice(2);
if (args.length !== 2 || args[0] !== '--case' || !cases.has(args[1])) {
  console.error(`usage: ${path.basename(process.argv[1])} --case ${[...cases.keys()].join('|')}`);
  process.exit(2);
}
cases.get(args[1])();
