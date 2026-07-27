import assert from 'node:assert/strict';
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
  renderPlan,
  reviewPhase,
  SOURCE_BASE,
  tuple,
  validTupleCatalog,
} from './fixtures/plan-run-v1.mjs';
import { clone, expectThrow, initializeRepository, withTempDirectory, writeFile } from './harness.mjs';

const PLAN_AFFECTED_PATHS = Object.freeze(['src/tracked.txt', 'src/untracked.txt']);

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
      name: 'local completion review stays not-required',
      value: tuple('finished', {
        draft_review: reviewPhase('passed'),
        execution_parent: SOURCE_BASE,
        completion_review: reviewPhase('passed'),
        acceptance: acceptance(),
      }),
      error: /completion|local|not_required/i,
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
      name: 'local ongoing work has no implementation checkpoint',
      value: tuple('ongoing', {
        draft_review: reviewPhase('passed'),
        execution_parent: SOURCE_BASE,
        implementation_commit: IMPLEMENTATION_COMMIT,
      }),
      error: /implementation|local|commit/i,
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
      name: 'accepted local work may block only for a concurrent change',
      value: tuple('blocked', {
        draft_review: reviewPhase('passed'),
        execution_parent: SOURCE_BASE,
        acceptance: acceptance(),
        blocker: blocker('verification_failed'),
      }),
      error: /concurrent_change|blocker|acceptance/i,
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
    ['retryable second permit', reviewPhase('retryable', { invocations: 2 }), /retryable|invocation/i],
    ['repairing second permit', reviewPhase('repairing', { invocations: 2 }), /repairing|invocation/i],
    ['passed missing result', reviewPhase('passed', { result_sha256: null }), /passed|result/i],
    ['degraded without a permit', reviewPhase('degraded', { invocations: 0 }), /degraded|invocation/i],
    ['terminal missing input', reviewPhase('blocked', { input_sha256: null }), /blocked|input/i],
    ['third invocation', reviewPhase('passed', { invocations: 3 }), /invocation|permit|two/i],
  ];
  return { invalid, valid };
}

export function registerStateMatrix(suite, api) {
  suite.test('state-matrix', 'accepts every documented frontmatter and phase tuple row', () => {
    const catalog = validTupleCatalog();
    assert.ok(catalog.length >= 40, 'fixture must cover the full tuple table, not a happy-path subset');
    for (const entry of catalog) validate(api, entry);
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
      const entry = terminalDraft
        ? tuple('blocked', {
            draft_review: phase,
            blocker: blocker(phase.state === 'cancelled' ? 'user_cancelled' : 'review_failed'),
          })
        : tuple('drafting', {
            draft_review: phase.state === 'not_required' ? reviewPhase('not_started') : phase,
          });
      if (phase.state === 'not_required') {
        entry.run.completion_review = phase;
      }
      validate(api, entry);
      assert.equal(typeof name, 'string');
    }
    for (const [name, phase, error] of invalid) {
      expectThrow(() => validate(api, tuple('drafting', { draft_review: phase })), error, `phase row ${name}`);
    }
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
}
