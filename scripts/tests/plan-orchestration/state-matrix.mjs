import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  acceptance,
  bindPlan,
  blocker,
  HASHES,
  IDS,
  IMPLEMENTATION_COMMIT,
  PLAN_PATH,
  planRun,
  REPOSITORY_ID,
  REVIEW_CLASSES,
  renderPlan,
  reviewPhase,
  SOURCE_BASE,
  tuple,
  validTupleCatalog,
  withStamps,
} from './fixtures/plan-run-v1.mjs';
import {
  clone,
  expectReject,
  expectThrow,
  git,
  initializeRepository,
  withTempDirectory,
  writeFile,
} from './harness.mjs';

const PLAN_AFFECTED_PATHS = Object.freeze(['src/tracked.txt', 'src/untracked.txt']);

// The path the implementation actually touched and the plan never declared. It
// sorts between the two declared paths, so a union that merely appends would be
// caught by the canonical-ordering assertions below.
const UNDECLARED_PATH = 'src/undeclared.txt';
const AMENDED_PATHS = Object.freeze([...PLAN_AFFECTED_PATHS, UNDECLARED_PATH].sort());

function ongoingCheckpointTuple() {
  return tuple('ongoing', { draft_review: reviewPhase('passed'), execution_parent: SOURCE_BASE });
}

// The three states in which scope may NOT widen. Each carries a bound
// acceptance, because that is the shape a real run reaches them in.
function boundCheckpointTuple(overrides) {
  return tuple('ongoing', {
    risk: 'sensitive',
    draft_review: reviewPhase('passed'),
    execution_parent: SOURCE_BASE,
    implementation_commit: IMPLEMENTATION_COMMIT,
    acceptance: acceptance(),
    ...overrides,
  });
}

function withCheckpointFixture(api, tupleValue, operation) {
  return withTempDirectory('plan-run-checkpoint-', (root) => {
    const repo = path.join(root, 'repo');
    initializeRepository(repo);
    const fixture = bindPlan(api, tupleValue);
    const planFile = writeFile(repo, PLAN_PATH, fixture.bytes);
    for (const logical of PLAN_AFFECTED_PATHS) writeFile(repo, logical, `${logical} committed bytes\n`);
    git(repo, ['add', '-A']);
    git(repo, ['commit', '-qm', 'plan and declared paths']);
    // The implementation changed a path drafting never predicted.
    writeFile(repo, UNDECLARED_PATH, 'undeclared implementation bytes\n');
    const ownedPaths = [PLAN_PATH, ...PLAN_AFFECTED_PATHS, UNDECLARED_PATH];
    const head = () => git(repo, ['rev-parse', 'HEAD']).stdout;
    const commitContents = () =>
      git(repo, ['show', '--name-only', '--pretty=format:', 'HEAD']).stdout.split('\n').filter(Boolean).sort();
    const calls = [];
    const commit = async ({ paths }) => {
      calls.push(paths);
      git(repo, ['add', '--', ...paths]);
      git(repo, ['commit', '-qm', 'checkpoint']);
      return commitContents();
    };
    return operation({
      baseHead: head(),
      calls,
      commit,
      commitContents,
      fixture,
      head,
      input: {
        changedPaths: [UNDECLARED_PATH],
        expected: api.captureRepositoryPreimage({ repo, ownedPaths }),
        expectedBytesSha256: api.sha256(fixture.bytes),
        file: planFile,
        identity: { planPath: PLAN_PATH, repositoryId: REPOSITORY_ID, runId: IDS.run },
        ownedPaths,
        repo,
      },
      planFile,
      repo,
    });
  });
}

function validateBoundPlan(api, fixture, expected, acceptanceManifestExpectation = null) {
  return api.validatePlanRun(fixture.bytes, {
    goalId: IDS.goal,
    planPath: PLAN_PATH,
    repositoryId: REPOSITORY_ID,
    runId: IDS.run,
    ...(acceptanceManifestExpectation === null
      ? {}
      : { acceptanceManifest: fixture.acceptanceManifest, acceptanceManifestExpectation }),
    ...expected,
  });
}

function validate(api, tupleValue, expected = {}) {
  if (tupleValue.run.acceptance === null) {
    return validateBoundPlan(api, bindPlan(api, tupleValue), expected);
  }
  return withTempDirectory('plan-run-state-accepted-', (root) => {
    const repo = path.join(root, 'repo');
    const sourceBase = initializeRepository(repo);
    for (const logical of PLAN_AFFECTED_PATHS) {
      writeFile(repo, logical, `${logical} acceptance bytes\n`);
    }
    const acceptanceManifestExpectation = {
      repo,
      paths: [...PLAN_AFFECTED_PATHS],
      sourceBase,
    };
    const acceptanceManifest = api.createAffectedPathManifest(acceptanceManifestExpectation);
    const liveTuple = {
      ...tupleValue,
      run: {
        ...tupleValue.run,
        execution_parent:
          tupleValue.run.execution_parent === SOURCE_BASE ? sourceBase : tupleValue.run.execution_parent,
        source_base: tupleValue.run.source_base === SOURCE_BASE ? sourceBase : tupleValue.run.source_base,
      },
    };
    const fixture = bindPlan(api, liveTuple, { acceptanceManifest });
    return validateBoundPlan(api, fixture, expected, acceptanceManifestExpectation);
  });
}

function invalidTupleCases() {
  return [
    {
      name: 'finished requires acceptance',
      value: tuple('finished', {
        draft_review: reviewPhase('passed'),
        execution_parent: SOURCE_BASE,
        acceptance: null,
      }),
      error: /acceptance|finished/i,
    },
    {
      name: 'local finished work cannot skip its completion review',
      value: tuple('finished', {
        draft_review: reviewPhase('not_required'),
        execution_parent: SOURCE_BASE,
        acceptance: acceptance(),
      }),
      error: /finished work requires a passed completion review/,
    },
    {
      name: 'local completion review keeps its single-invocation ceiling',
      value: tuple('ongoing', {
        draft_review: reviewPhase('not_required'),
        execution_parent: SOURCE_BASE,
        implementation_commit: IMPLEMENTATION_COMMIT,
        completion_review: reviewPhase('passed', { invocations: 2 }),
        acceptance: acceptance(),
      }),
      error: /completion ReviewPhaseV1 invocation permit must be between zero and 1/,
    },
    {
      name: 'local completion review has no repair permit',
      value: tuple('ongoing', {
        draft_review: reviewPhase('not_required'),
        execution_parent: SOURCE_BASE,
        implementation_commit: IMPLEMENTATION_COMMIT,
        completion_review: reviewPhase('repairing'),
        acceptance: null,
      }),
      error: /local completion review has no repair permit/,
    },
    {
      name: 'sensitive draft cannot degrade',
      value: tuple('planned', {
        risk: 'sensitive',
        draft_review: reviewPhase('degraded'),
        completion_review: reviewPhase('not_started'),
      }),
      error: /degraded|risk|sensitive/i,
    },
    {
      name: 'planned requires a terminal successful draft review',
      value: tuple('planned', { draft_review: reviewPhase('not_started') }),
      error: /draft|planned|passed/i,
    },
    {
      name: 'local work cannot bind an implementation before completion reservation',
      value: tuple('ongoing', {
        draft_review: reviewPhase('passed'),
        execution_parent: SOURCE_BASE,
        implementation_commit: IMPLEMENTATION_COMMIT,
      }),
      error: /cannot bind implementation or acceptance before completion reservation/,
    },
    {
      name: 'active completion requires implementation and acceptance bindings',
      value: tuple('ongoing', {
        risk: 'sensitive',
        draft_review: reviewPhase('passed'),
        execution_parent: SOURCE_BASE,
        completion_review: reviewPhase('reserved'),
      }),
      error: /implementation|acceptance|completion/i,
    },
    {
      name: 'blocked requires blocker evidence',
      value: tuple('blocked', { draft_review: reviewPhase('blocked'), blocker: null }),
      error: /blocker|blocked/i,
    },
    {
      name: 'accepted local work may block only on authority or concurrency',
      value: tuple('blocked', {
        draft_review: reviewPhase('not_required'),
        execution_parent: SOURCE_BASE,
        implementation_commit: IMPLEMENTATION_COMMIT,
        completion_review: reviewPhase('passed'),
        acceptance: acceptance(),
        blocker: blocker('verification_failed'),
      }),
      error: /missing_authority|concurrent_change|blocker/i,
    },
    {
      name: 'passed sensitive completion may block only on authority or concurrency',
      value: tuple('blocked', {
        risk: 'sensitive',
        draft_review: reviewPhase('passed'),
        execution_parent: SOURCE_BASE,
        implementation_commit: IMPLEMENTATION_COMMIT,
        completion_review: reviewPhase('passed'),
        acceptance: acceptance(),
        blocker: blocker('review_failed'),
      }),
      error: /missing_authority|concurrent_change|blocker/i,
    },
    {
      name: 'drafting cannot retain implementation output',
      value: tuple('drafting', {
        draft_review: reviewPhase('passed'),
        implementation_commit: IMPLEMENTATION_COMMIT,
      }),
      error: /implementation|drafting/i,
    },
    {
      name: 'requested external effects determine external risk',
      value: tuple('planned', {
        risk: 'local',
        requested_effects: ['local', 'release'],
        draft_review: reviewPhase('passed'),
      }),
      error: /risk|requested_effects|release/i,
    },
    {
      name: 'completion review keeps its two-invocation ceiling',
      value: tuple('ongoing', {
        risk: 'sensitive',
        draft_review: reviewPhase('passed'),
        execution_parent: SOURCE_BASE,
        implementation_commit: IMPLEMENTATION_COMMIT,
        completion_review: reviewPhase('passed', { invocations: 3 }),
        acceptance: acceptance(),
      }),
      error: /completion|invocation|permit|two/i,
    },
  ];
}

function phaseTableCases() {
  const valid = [
    ['not_required', reviewPhase('not_required')],
    ['not_started', reviewPhase('not_started')],
    ['reserved first', reviewPhase('reserved')],
    ['reserved second', reviewPhase('reserved', { invocations: 2 })],
    ['transport retried first', reviewPhase('transport_retried')],
    ['transport retried second', reviewPhase('transport_retried', { invocations: 2 })],
    ['retryable after first-round failure', reviewPhase('retryable')],
    ['retryable after second-round failure', reviewPhase('retryable', { invocations: 1 })],
    ['repairing', reviewPhase('repairing')],
    ['passed first', reviewPhase('passed')],
    ['passed second', reviewPhase('passed', { invocations: 2 })],
    ['degraded first', reviewPhase('degraded', { invocations: 1 })],
    ['degraded second', reviewPhase('degraded')],
    ['blocked first', reviewPhase('blocked')],
    ['blocked second', reviewPhase('blocked', { invocations: 2 })],
    ['cancelled first', reviewPhase('cancelled')],
    ['cancelled second', reviewPhase('cancelled', { invocations: 2 })],
  ];
  const invalid = [
    ['not-started permit', reviewPhase('not_started', { invocations: 1 }), /invocation|not_started/i],
    ['reserved result', reviewPhase('reserved', { result_sha256: HASHES.result }), /reserved|result/i],
    [
      'transport retry without reservation',
      reviewPhase('transport_retried', { invocations: 0 }),
      /transport_retried|invocation/i,
    ],
    [
      'transport retry with result',
      reviewPhase('transport_retried', { result_sha256: HASHES.result }),
      /transport_retried|result/i,
    ],
    ['retryable beyond its refunded range', reviewPhase('retryable', { invocations: 2 }), /retryable|invocation|1/i],
    [
      'repairing beyond the single repair verdict',
      reviewPhase('repairing', { invocations: 2 }),
      /repairing|invocation|1/i,
    ],
    ['passed missing result', reviewPhase('passed', { result_sha256: null }), /passed|result/i],
    ['degraded without a permit', reviewPhase('degraded', { invocations: 0 }), /degraded|invocation/i],
    ['terminal missing input', reviewPhase('blocked', { input_sha256: null }), /blocked|input/i],
    ['beyond draft bound', reviewPhase('passed', { invocations: 3 }), /invocation|permit|2/i],
  ];
  return { invalid, valid };
}

const TRANSITION_IDENTITY = Object.freeze({
  planPath: PLAN_PATH,
  repositoryId: REPOSITORY_ID,
  runId: IDS.run,
});

function reviewEdgeFixtures(api, from, to, beforeOverrides = {}, afterOverrides = {}) {
  return {
    current: bindPlan(
      api,
      tuple('drafting', {
        draft_review: reviewPhase(from, beforeOverrides),
      }),
    ),
    next: bindPlan(
      api,
      tuple('drafting', {
        draft_review: reviewPhase(to, afterOverrides),
      }),
    ),
  };
}

function persistedEdgeCases() {
  return [
    {
      name: 'review not_started -> reserved',
      build: (api) => reviewEdgeFixtures(api, 'not_started', 'reserved'),
    },
    {
      name: 'review reserved -> retryable',
      build: (api) => reviewEdgeFixtures(api, 'reserved', 'retryable'),
    },
    {
      name: 'review transport_retried -> degraded',
      build: (api) =>
        reviewEdgeFixtures(api, 'transport_retried', 'degraded', {}, { invocations: 1, input_sha256: HASHES.input2 }),
    },
    {
      name: 'review retryable -> transport_retried',
      build: (api) => reviewEdgeFixtures(api, 'retryable', 'transport_retried'),
    },
    {
      name: 'review repairing -> reserved',
      build: (api) =>
        reviewEdgeFixtures(api, 'repairing', 'reserved', {}, { invocations: 2, input_sha256: HASHES.input2 }),
    },
    {
      name: 'lifecycle drafting -> planned',
      build: (api) => ({
        current: bindPlan(api, tuple('drafting', { draft_review: reviewPhase('passed') })),
        next: bindPlan(api, tuple('planned', { draft_review: reviewPhase('passed') })),
      }),
    },
    {
      name: 'lifecycle ongoing -> blocked',
      build: (api) => {
        const current = bindPlan(
          api,
          tuple('ongoing', {
            draft_review: reviewPhase('passed'),
            execution_parent: SOURCE_BASE,
          }),
        );
        const next = bindPlan(
          api,
          tuple('blocked', {
            draft_review: reviewPhase('passed'),
            execution_parent: SOURCE_BASE,
            blocker: blocker('verification_failed'),
          }),
        );
        return {
          current,
          next,
          currentBytes: withStamps(current.bytes, '"2026-07-24T01:00:00Z"', 'null'),
          nextBytes: withStamps(next.bytes, '"2026-07-24T01:00:00Z"', 'null'),
        };
      },
    },
    {
      name: 'lifecycle blocked -> drafting',
      build: (api) => ({
        current: bindPlan(
          api,
          tuple('blocked', {
            draft_review: reviewPhase('passed'),
            blocker: blocker('user_decision'),
          }),
        ),
        next: bindPlan(
          api,
          tuple('drafting', {
            draft_review: reviewPhase('passed'),
          }),
        ),
      }),
    },
    {
      name: 'lifecycle ongoing -> finished',
      build: (api, root) => {
        const repo = path.join(root, 'repo');
        const sourceBase = initializeRepository(repo);
        for (const logical of PLAN_AFFECTED_PATHS) {
          writeFile(repo, logical, `${logical} acceptance bytes\n`);
        }
        const acceptanceManifestExpectation = {
          repo,
          paths: [...PLAN_AFFECTED_PATHS],
          sourceBase,
        };
        const acceptanceManifest = api.createAffectedPathManifest(acceptanceManifestExpectation);
        // Finishing now follows a passed completion review, so acceptance and the
        // implementation binding are already installed and the edge moves status alone.
        const finishedRun = {
          source_base: sourceBase,
          draft_review: reviewPhase('passed'),
          execution_parent: sourceBase,
          implementation_commit: IMPLEMENTATION_COMMIT,
          completion_review: reviewPhase('passed'),
          acceptance: acceptance(),
        };
        const current = bindPlan(api, tuple('ongoing', finishedRun), { acceptanceManifest });
        const next = bindPlan(api, tuple('finished', finishedRun), { acceptanceManifest });
        return {
          acceptanceManifest,
          acceptanceManifestExpectation,
          current,
          next,
          currentBytes: withStamps(current.bytes, '"2026-07-24T01:00:00Z"', 'null'),
          nextBytes: withStamps(next.bytes, '"2026-07-24T01:00:00Z"', '"2026-07-24T02:00:00Z"'),
        };
      },
    },
    {
      name: 'scope amendment widening affected_paths at ongoing',
      build: (api) => amendScope(api, ongoingLocalTuple()),
    },
  ];
}

function forbiddenReviewEdgeCases() {
  return [
    {
      name: 'review reserved -> transport_retried',
      build: (api) =>
        reviewEdgeFixtures(api, 'reserved', 'transport_retried', {}, { invocations: 2, input_sha256: HASHES.input2 }),
    },
    {
      name: 'review transport_retried -> reserved',
      build: (api) =>
        reviewEdgeFixtures(api, 'transport_retried', 'reserved', {}, { invocations: 2, input_sha256: HASHES.input3 }),
    },
    {
      name: 'review retryable -> reserved',
      build: (api) => reviewEdgeFixtures(api, 'retryable', 'reserved', {}, { input_sha256: HASHES.input2 }),
    },
    {
      name: 'review repairing -> transport_retried',
      build: (api) =>
        reviewEdgeFixtures(api, 'repairing', 'transport_retried', {}, { invocations: 2, input_sha256: HASHES.input2 }),
    },
    {
      name: 'review passed -> reserved',
      build: (api) =>
        reviewEdgeFixtures(api, 'passed', 'reserved', {}, { invocations: 2, input_sha256: HASHES.input2 }),
    },
    {
      name: 'review degraded -> reserved',
      build: (api) =>
        reviewEdgeFixtures(
          api,
          'degraded',
          'reserved',
          { invocations: 1 },
          { invocations: 2, input_sha256: HASHES.input2 },
        ),
    },
  ];
}

async function persistEdge(api, root, edge) {
  const fixture = edge.build(api, root);
  const currentBytes = fixture.currentBytes ?? fixture.current.bytes;
  const nextBytes = fixture.nextBytes ?? fixture.next.bytes;
  const file = path.join(root, 'plan.md');
  fs.writeFileSync(file, currentBytes);
  const result = await api.transactPlanRun({
    file,
    identity: TRANSITION_IDENTITY,
    expectedBytesSha256: api.sha256(currentBytes),
    nextBytes,
    ...(fixture.acceptanceManifest === undefined ? {} : { acceptanceManifest: fixture.acceptanceManifest }),
    ...(fixture.acceptanceManifestExpectation === undefined
      ? {}
      : { acceptanceManifestExpectation: fixture.acceptanceManifestExpectation }),
  });
  assert.equal(result.status, fixture.next.status, `${edge.name} must return its successor status`);
  assert.equal(result.bytes_sha256, api.sha256(nextBytes), `${edge.name} must return its persisted digest`);
  assert.ok(fs.readFileSync(file).equals(nextBytes), `${edge.name} must read back exact successor bytes`);
}

async function rejectEdge(api, root, edge) {
  const fixture = edge.build(api, root);
  const currentBytes = fixture.currentBytes ?? fixture.current.bytes;
  const nextBytes = fixture.nextBytes ?? fixture.next.bytes;
  const file = path.join(root, 'plan.md');
  fs.writeFileSync(file, currentBytes);
  await expectReject(
    () =>
      api.transactPlanRun({
        file,
        identity: TRANSITION_IDENTITY,
        expectedBytesSha256: api.sha256(currentBytes),
        nextBytes,
      }),
    /illegal draft_review transition/i,
    `${edge.name} must remain outside the persisted review edge set`,
  );
  assert.ok(fs.readFileSync(file).equals(currentBytes), `${edge.name} rejection must preserve current bytes`);
}

const AMENDED_SOURCE_SHA256 = '7'.repeat(64);

function widenAffectedPaths(bytes) {
  const text = bytes.toString();
  const widened = text.replace('  - src/untracked.txt\n', '  - src/untracked.txt\n  - src/amended.txt\n');
  assert.notEqual(widened, text, 'scope amendment fixture must widen affected_paths');
  return Buffer.from(widened);
}

// Rebinds `plan_sha256` over widened `affected_paths` the way `bindPlan` binds a
// freshly rendered plan, so the successor is a valid PlanRun in its own right.
function amendScope(api, tupleValue, nextRunOverrides = {}) {
  const current = bindPlan(api, tupleValue);
  const draft = { ...current.run, source_sha256: AMENDED_SOURCE_SHA256, ...nextRunOverrides };
  const unbound = widenAffectedPaths(renderPlan({ status: current.status, run: draft, jcs: api.jcs }));
  const run = { ...draft, plan_sha256: api.sha256(api.canonicalPlanView(unbound)) };
  const next = {
    bytes: widenAffectedPaths(renderPlan({ status: current.status, run, jcs: api.jcs })),
    run,
    status: current.status,
  };
  return {
    current,
    next,
    currentBytes: withStamps(current.bytes, '"2026-07-24T01:00:00Z"', 'null'),
    nextBytes: withStamps(next.bytes, '"2026-07-24T01:00:00Z"', 'null'),
  };
}

function ongoingLocalTuple(overrides = {}) {
  return tuple('ongoing', {
    draft_review: reviewPhase('passed'),
    execution_parent: SOURCE_BASE,
    ...overrides,
  });
}

function ongoingSensitiveTuple(completionState, overrides = {}) {
  return tuple('ongoing', {
    risk: 'sensitive',
    draft_review: reviewPhase('passed'),
    execution_parent: SOURCE_BASE,
    completion_review: reviewPhase(completionState),
    implementation_commit: IMPLEMENTATION_COMMIT,
    ...overrides,
  });
}

function scopeAmendmentRefusals() {
  return [
    {
      name: 'refuses a scope amendment while a review phase is live',
      build: (api) => amendScope(api, ongoingSensitiveTuple('reserved', { acceptance: acceptance() })),
      error: /live completion_review/i,
    },
    {
      name: 'refuses a scope amendment after a passed completion review',
      build: (api) => amendScope(api, ongoingSensitiveTuple('passed', { acceptance: acceptance() })),
      error: /passed completion review/i,
    },
    {
      name: 'refuses a scope amendment that would invalidate a minted acceptance',
      build: (api) => amendScope(api, ongoingSensitiveTuple('retryable', { acceptance: acceptance() })),
      error: /minted acceptance/i,
    },
    {
      name: 'refuses a scope amendment bundled with any other field change',
      build: (api) => amendScope(api, ongoingLocalTuple(), { execution_parent: IMPLEMENTATION_COMMIT }),
      error: /scope amendment cannot change execution_parent/i,
    },
  ];
}

async function refuseScopeAmendment(api, root, testCase) {
  const fixture = testCase.build(api);
  const file = path.join(root, 'plan.md');
  fs.writeFileSync(file, fixture.currentBytes);
  await expectReject(
    () =>
      api.transactPlanRun({
        file,
        identity: TRANSITION_IDENTITY,
        expectedBytesSha256: api.sha256(fixture.currentBytes),
        nextBytes: fixture.nextBytes,
      }),
    testCase.error,
    testCase.name,
  );
  assert.ok(fs.readFileSync(file).equals(fixture.currentBytes), `${testCase.name} must preserve current bytes`);
}

export function registerStateMatrix(suite, api) {
  suite.test('state-matrix', 'accepts every documented frontmatter and phase tuple row', () => {
    const catalog = validTupleCatalog();
    assert.ok(catalog.length >= 40, 'fixture must cover the full tuple table, not a happy-path subset');
    for (const entry of catalog) validate(api, entry);
  });
  for (const edge of persistedEdgeCases()) {
    suite.test('state-matrix', `persists ${edge.name}`, () =>
      withTempDirectory('plan-run-state-edge-', (root) => persistEdge(api, root, edge)),
    );
  }

  for (const testCase of scopeAmendmentRefusals()) {
    suite.test('state-matrix', testCase.name, () =>
      withTempDirectory('plan-run-scope-amendment-', (root) => refuseScopeAmendment(api, root, testCase)),
    );
  }

  suite.test('state-matrix', 'keeps the persisted review edge set closed', async () => {
    for (const edge of forbiddenReviewEdgeCases()) {
      await withTempDirectory('plan-run-state-edge-rejected-', (root) => rejectEdge(api, root, edge));
    }
  });

  suite.test('state-matrix', 'rejects impossible cross-field tuples', () => {
    for (const testCase of invalidTupleCases()) {
      expectThrow(() => validate(api, testCase.value), testCase.error, testCase.name);
    }
  });

  suite.test('state-matrix', 'enforces every ReviewPhaseV1 state row', () => {
    const { invalid, valid } = phaseTableCases();
    for (const [name, phase] of valid) {
      const terminalDraft = phase.state === 'blocked' || phase.state === 'cancelled';
      // `not_required` is now a draft-only state: the local self-check gate is its
      // sole producer and no completion phase may carry it.
      const entry = terminalDraft
        ? tuple('blocked', {
            draft_review: phase,
            blocker: blocker(phase.state === 'cancelled' ? 'user_cancelled' : 'review_failed'),
          })
        : tuple('drafting', { draft_review: phase });
      validate(api, entry);
      assert.equal(typeof name, 'string');
    }
    for (const [name, phase, error] of invalid) {
      expectThrow(() => validate(api, tuple('drafting', { draft_review: phase })), error, `phase row ${name}`);
    }
  });

  suite.test('state-matrix', 'accepted_classes is optional on read and otherwise sorted unique and closed', () => {
    const legacy = tuple('drafting');
    delete legacy.run.draft_review.accepted_classes;
    delete legacy.run.completion_review.accepted_classes;
    validate(api, legacy);

    validate(
      api,
      tuple('drafting', {
        draft_review: reviewPhase('not_started', { accepted_classes: [] }),
        completion_review: reviewPhase('not_started', { accepted_classes: [] }),
      }),
    );

    validate(
      api,
      tuple('drafting', {
        draft_review: reviewPhase('reserved', {
          accepted_classes: [REVIEW_CLASSES.acceptanceCommandNotRunnable, REVIEW_CLASSES.evidenceMismatch],
        }),
      }),
    );

    for (const [name, acceptedClasses, error] of [
      [
        'unsorted',
        [REVIEW_CLASSES.evidenceMismatch, REVIEW_CLASSES.acceptanceCommandNotRunnable],
        /accepted_classes|sorted/i,
      ],
      ['duplicate', [REVIEW_CLASSES.evidenceMismatch, REVIEW_CLASSES.evidenceMismatch], /accepted_classes|duplicate/i],
      ['unknown', ['v1_unknown'], /accepted_classes|unknown|class/i],
    ]) {
      expectThrow(
        () =>
          validate(
            api,
            tuple('drafting', {
              draft_review: reviewPhase('reserved', { accepted_classes: acceptedClasses }),
            }),
          ),
        error,
        name,
      );
    }

    expectThrow(
      () =>
        validate(
          api,
          tuple('ongoing', {
            risk: 'sensitive',
            draft_review: reviewPhase('passed'),
            execution_parent: SOURCE_BASE,
            implementation_commit: IMPLEMENTATION_COMMIT,
            completion_review: reviewPhase('passed', {
              accepted_classes: [REVIEW_CLASSES.evidenceMismatch],
            }),
            acceptance: acceptance(),
          }),
        ),
      /completion|accepted_classes|empty/i,
    );
  });

  suite.test('state-matrix', 'closes PlanRunV1 and both nested record shapes', () => {
    for (const mutate of [
      (run) => {
        run.unexpected = true;
      },
      (run) => {
        run.draft_review.unexpected = true;
      },
      (run) => {
        run.acceptance = { ...acceptance(), unexpected: true };
        run.draft_review = reviewPhase('passed');
      },
      (run) => {
        run.blocker = { ...blocker('review_failed'), unexpected: true };
        run.draft_review = reviewPhase('blocked');
      },
    ]) {
      const entry = tuple('drafting');
      mutate(entry.run);
      expectThrow(() => validate(api, entry), /unknown|unexpected|closed/i);
    }
  });

  suite.test('state-matrix', 'binds repository, path, run, and goal identity independently', () => {
    const entry = tuple('drafting');
    const fixture = bindPlan(api, entry);
    const base = {
      goalId: IDS.goal,
      planPath: PLAN_PATH,
      repositoryId: REPOSITORY_ID,
      runId: IDS.run,
    };
    for (const mismatch of [
      { repositoryId: 'docks:/other' },
      { planPath: 'docs/plans/active/other.md' },
      { runId: IDS.otherRun },
      { goalId: IDS.otherRun },
    ]) {
      expectThrow(
        () => api.validatePlanRun(fixture.bytes, { ...base, ...mismatch }),
        /identity|mismatch|repository|path|run|goal/i,
      );
    }
  });

  suite.test('state-matrix', 'requires exactly one unfenced compact Plan-run record', () => {
    const fixture = bindPlan(api, tuple('drafting'));
    const text = fixture.bytes.toString();
    expectThrow(() => api.validatePlanRun(Buffer.from(text.replace(/\nPlan-run: .*\n/, '\n'))), /Plan-run|missing/i);
    const line = text.match(/^Plan-run: .*$/m)?.[0];
    assert.ok(line);
    expectThrow(() => api.validatePlanRun(Buffer.from(`${text}\n${line}\n`)), /Plan-run|duplicate/i);
    expectThrow(
      () =>
        api.validatePlanRun(
          Buffer.from(text.replace(line, `Plan-run: ${JSON.stringify({ ...fixture.run, schema: 2 })}`)),
        ),
      /schema|PlanRun/i,
    );
  });

  suite.test('state-matrix', 'rejects malformed scalar and enum identities', () => {
    const mutations = [
      ['schema', 2],
      ['goal_id', 'not-a-uuid'],
      ['run_id', 'not-a-uuid'],
      ['repository_id', ''],
      ['plan_path', '../escape.md'],
      ['requested_effects', ['release', 'local']],
      ['risk', 'unknown'],
      ['source_base', 'short'],
      ['source_sha256', 'short'],
    ];
    for (const [field, value] of mutations) {
      const run = clone(planRun());
      run[field] = value;
      expectThrow(
        () => validate(api, { status: 'drafting', run }),
        /schema|uuid|repository|path|effect|risk|digest|hash|commit/i,
      );
    }
  });

  suite.test('state-matrix', 'rejects a plan digest not bound to substantive plan bytes', () => {
    const fixture = bindPlan(api, tuple('drafting'));
    const changed = fixture.bytes
      .toString()
      .replace('Implement and verify one bounded local change.', 'Implement a different substantive change.');
    expectThrow(
      () =>
        api.validatePlanRun(Buffer.from(changed), {
          goalId: IDS.goal,
          planPath: PLAN_PATH,
          repositoryId: REPOSITORY_ID,
          runId: IDS.run,
        }),
      /plan_sha256|plan digest|canonical/i,
    );
  });

  suite.test(
    'state-matrix',
    'record rendering does not accept pretty JSON or a fenced authorization substitute',
    () => {
      const base = planRun({ plan_sha256: HASHES.plan });
      const pretty = renderPlan({ status: 'drafting', run: base, jcs: (value) => JSON.stringify(value, null, 2) });
      expectThrow(() => api.validatePlanRun(pretty), /compact|JCS|Plan-run/i);
      const fenced = renderPlan({ status: 'drafting' })
        .toString()
        .replace(
          '\n## Verification Results',
          `\n\`\`\`text\nPlan-run: ${api.jcs(base)}\n\`\`\`\n\n## Verification Results`,
        );
      expectThrow(() => api.validatePlanRun(Buffer.from(fenced)), /Plan-run|missing/i);
    },
  );

  suite.test('state-matrix', 'checkpoint amends an undeclared changed path instead of refusing', () =>
    withCheckpointFixture(api, ongoingCheckpointTuple(), async (context) => {
      const result = await api.checkpointPlanRun(context.input, context.commit);
      assert.deepEqual(result.amendment.added, [UNDECLARED_PATH]);
      assert.deepEqual(result.affected_paths, AMENDED_PATHS);
      assert.equal(context.calls.length, 1, 'the checkpoint must proceed to its commit');
      // The record on disk - not just the return value - has to carry the path,
      // because the archived plan is the audit surface.
      const persisted = api.parsePlan(fs.readFileSync(context.planFile));
      assert.deepEqual(persisted.frontmatter.affected_paths, AMENDED_PATHS);
      assert.equal(persisted.frontmatter.status, 'ongoing');
      assert.equal(
        api.validatePlanRun(fs.readFileSync(context.planFile), { ...context.input.identity, goalId: IDS.goal }).run
          .plan_sha256,
        result.amendment.plan_sha256,
      );
    }),
  );

  for (const [name, overrides, error] of [
    ['a live review phase', { completion_review: reviewPhase('reserved') }, /live completion_review/i],
    ['a passed completion review', { completion_review: reviewPhase('passed') }, /passed completion review/i],
    ['a minted acceptance', { completion_review: reviewPhase('retryable') }, /minted acceptance/i],
  ]) {
    suite.test('state-matrix', `checkpoint still refuses an undeclared path under ${name}`, () =>
      withCheckpointFixture(api, boundCheckpointTuple(overrides), async (context) => {
        await expectReject(() => api.checkpointPlanRun(context.input, context.commit), error);
        assert.equal(context.calls.length, 0, 'a refused amendment must never reach its commit');
        assert.ok(
          fs.readFileSync(context.planFile).equals(context.fixture.bytes),
          'a refused amendment must leave the record byte-identical',
        );
        assert.equal(context.head(), context.baseHead, 'a refused checkpoint must not move HEAD');
      }),
    );
  }

  suite.test('state-matrix', 'an amended checkpoint commits exactly the paths its record lists', () =>
    withCheckpointFixture(api, ongoingCheckpointTuple(), async (context) => {
      const result = await api.checkpointPlanRun(context.input, context.commit);
      assert.deepEqual(result.committed_paths, context.commitContents(), 'reported and actual commit contents differ');
      const recorded = new Set([
        ...api.parsePlan(fs.readFileSync(context.planFile)).frontmatter.affected_paths,
        PLAN_PATH,
      ]);
      assert.deepEqual(
        result.committed_paths.filter((logical) => !recorded.has(logical)),
        [],
        'no committed path may be absent from the record',
      );
    }),
  );

  // The converse of the case above, and the reason the amendment is not "commit
  // anything": a commit that reaches beyond the recorded set is rejected even
  // though the amendment itself was legal.
  suite.test('state-matrix', 'a commit reaching outside the recorded set is rejected', () =>
    withCheckpointFixture(api, ongoingCheckpointTuple(), async (context) => {
      writeFile(context.repo, 'src/unrecorded.txt', 'bytes no record lists\n');
      await expectReject(
        () =>
          api.checkpointPlanRun(context.input, async ({ paths }) =>
            context.commit({ paths: [...paths, 'src/unrecorded.txt'] }),
          ),
        /commit contents|recorded/i,
      );
    }),
  );
}
