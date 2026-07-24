import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  acceptance,
  blocker,
  HASHES,
  IDS,
  IMPLEMENTATION_COMMIT,
  planRun,
  REVIEW_INVALID_INPUT_REASONS,
  renderPlan,
  reviewInvalidInput,
  reviewInvalidInputEvent,
  reviewPhase,
  reviewResultEvent,
  SOURCE_BASE,
} from './fixtures/plan-run-v1.mjs';
import { clone, expectThrow, initializeRepository, withTempDirectory, writeFile } from './harness.mjs';

const REPLACEMENT_COMMIT = '6'.repeat(40);
const DIFF_SHA256 = '7'.repeat(64);
const REPLACEMENT_DIFF_SHA256 = '8'.repeat(64);

function reduce(api, state, event) {
  return api.reducePlanRun({ current: state, event });
}

function localDraftState(phase = reviewPhase('not_started')) {
  return {
    status: 'drafting',
    run: planRun({ draft_review: phase }),
  };
}

function sensitiveCompletionState(overrides = {}) {
  return {
    status: 'ongoing',
    run: planRun({
      completion_review: reviewPhase('not_started'),
      draft_review: reviewPhase('passed'),
      execution_parent: SOURCE_BASE,
      requested_effects: ['local', 'production_access'],
      risk: 'sensitive',
      ...overrides,
    }),
  };
}

function reserve(phase, inputSha256 = HASHES.input) {
  return { type: 'reserve_review', phase, input_sha256: inputSha256 };
}

function reserveCompletion(inputSha256, implementationCommit = IMPLEMENTATION_COMMIT) {
  return {
    type: 'reserve_review',
    phase: 'completion_review',
    input_sha256: inputSha256,
    implementation_commit: implementationCommit,
    acceptance: acceptance(),
  };
}

function result(state, type, phase, resultSha256 = HASHES.result, overrides = {}) {
  return reviewResultEvent(state, type, phase, { result_sha256: resultSha256, ...overrides });
}

function differentHex(value) {
  return `${value[0] === '0' ? '1' : '0'}${value.slice(1)}`;
}

function assertPhase(state, phase, expected) {
  assert.deepEqual(state.run[phase], expected);
}

function planReview(binding, overrides = {}) {
  return {
    schema: 1,
    run_id: binding.run_id,
    invocation: binding.invocation,
    plan_sha256: binding.plan_sha256,
    source_sha256: binding.source_sha256,
    verdict: 'pass',
    findings: [],
    ...overrides,
  };
}

function completionReview(binding, overrides = {}) {
  return {
    schema: 1,
    run_id: binding.run_id,
    invocation: binding.invocation,
    implementation_commit: binding.implementation_commit,
    diff_sha256: binding.diff_sha256,
    verdict: 'pass',
    findings: [],
    ...overrides,
  };
}

export function registerReviewBudget(suite, api, reviewer) {
  suite.test('review-budget', 'reserves and persists a permit before a draft result can apply', () => {
    const initial = localDraftState();
    expectThrow(
      () => reduce(api, initial, result(initial, 'review_passed', 'draft_review')),
      /reserved|permit|not_started/i,
    );
    const reserved = reduce(api, initial, reserve('draft_review'));
    assertPhase(reserved, 'draft_review', reviewPhase('reserved'));
    const passed = reduce(api, reserved, result(reserved, 'review_passed', 'draft_review'));
    assertPhase(passed, 'draft_review', reviewPhase('passed'));
  });

  suite.test('review-budget', 'covers every legal ReviewPhaseV1 transition edge', () => {
    const initial = localDraftState();
    const reserved1 = reduce(api, initial, reserve('draft_review'));
    for (const [type, expectedState] of [
      ['review_passed', 'passed'],
      ['review_repair', 'repairing'],
      ['review_blocked', 'blocked'],
      ['review_cancelled', 'cancelled'],
      ['review_transport_failure', 'retryable'],
    ]) {
      const event = result(reserved1, type, 'draft_review');
      if (type === 'review_blocked') event.blocker = blocker('review_failed');
      if (type === 'review_cancelled') event.evidence_sha256 = HASHES.blocker;
      const next = reduce(api, reserved1, event);
      assert.equal(next.run.draft_review.state, expectedState);
    }

    const retryable = reduce(api, reserved1, result(reserved1, 'review_transport_failure', 'draft_review'));
    const reserved2 = reduce(api, retryable, reserve('draft_review'));
    assert.equal(reserved2.run.draft_review.invocations, 2);
    assert.equal(
      reduce(api, reserved2, result(reserved2, 'review_transport_failure', 'draft_review')).run.draft_review.state,
      'degraded',
    );

    const repairing = reduce(api, reserved1, result(reserved1, 'review_repair', 'draft_review'));
    const repairReserved = reduce(api, repairing, reserve('draft_review', HASHES.input2));
    assert.equal(repairReserved.run.draft_review.invocations, 2);
    for (const terminal of ['review_blocked', 'review_cancelled']) {
      const event = result(repairing, terminal, 'draft_review');
      if (terminal === 'review_blocked') event.blocker = blocker('review_failed');
      else event.evidence_sha256 = HASHES.blocker;
      assert.equal(
        reduce(api, repairing, event).run.draft_review.state,
        terminal === 'review_blocked' ? 'blocked' : 'cancelled',
      );
    }
  });

  suite.test('review-budget', 'ReviewInvalidInputV1 accepts every reason and rejects malformed objects', () => {
    for (const reason of REVIEW_INVALID_INPUT_REASONS) {
      const value = reviewInvalidInput(reason);
      assert.deepEqual(api.validateReviewInvalidInput(value), value);
    }

    const complete = reviewInvalidInput();
    const missing = ['schema', 'error', 'reason'].map((field) => {
      const value = clone(complete);
      delete value[field];
      return value;
    });
    const malformed = [
      null,
      [],
      ...missing,
      reviewInvalidInput('bundle_unavailable', { schema: 2 }),
      reviewInvalidInput('bundle_unavailable', { error: 'transport_failure' }),
      reviewInvalidInput('unknown_reason'),
      reviewInvalidInput('bundle_unavailable', { unexpected: true }),
    ];
    for (const value of malformed) {
      expectThrow(
        () => api.validateReviewInvalidInput(value),
        /ReviewInvalidInputV1|object|unknown|missing|schema|error|reason|invalid/i,
      );
    }
  });

  suite.test(
    'review-budget',
    'invalid reviewer input terminal-blocks every reason on either permit without retry, degrade, or repair',
    () => {
      const first = reduce(api, localDraftState(), reserve('draft_review'));
      const retryable = reduce(api, first, result(first, 'review_transport_failure', 'draft_review', HASHES.failure));
      const second = reduce(api, retryable, reserve('draft_review'));

      for (const reason of REVIEW_INVALID_INPUT_REASONS) {
        for (const reserved of [first, second]) {
          const before = clone(reserved);
          const invalidInput = reviewInvalidInput(reason);
          const terminal = reduce(api, reserved, reviewInvalidInputEvent(reserved, 'draft_review', reason));
          const resultSha256 = api.sha256(api.jcs(invalidInput));
          const expected = clone(reserved);
          expected.status = 'blocked';
          expected.run.draft_review = {
            ...expected.run.draft_review,
            state: 'blocked',
            result_sha256: resultSha256,
          };
          expected.run.blocker = {
            kind: 'review_failed',
            evidence_sha256: resultSha256,
          };

          assert.deepEqual(
            terminal,
            expected,
            `${reason} invocation ${reserved.run.draft_review.invocations} changed unrelated state`,
          );
          assert.deepEqual(reserved, before, 'the reducer mutated the reserved input state');
          assert.equal(terminal.run.run_id, reserved.run.run_id);
          assert.equal(terminal.run.draft_review.invocations, reserved.run.draft_review.invocations);
          assert.equal(terminal.run.draft_review.input_sha256, reserved.run.draft_review.input_sha256);
          assert.equal(terminal.run.draft_review.state, 'blocked');
          assert.equal(terminal.run.blocker.kind, 'review_failed');
          expectThrow(() => reduce(api, terminal, reserve('draft_review', HASHES.input2)), /blocked|terminal|permit/i);
          expectThrow(
            () => reduce(api, terminal, result(terminal, 'review_repair', 'draft_review')),
            /blocked|terminal|reserved|stale/i,
          );
        }
      }
    },
  );

  suite.test(
    'review-budget',
    'invalid reviewer input rejects stale or missing bindings, non-reserved phases, and open shapes',
    () => {
      const reserved = reduce(api, localDraftState(), reserve('draft_review'));
      const validEvent = reviewInvalidInputEvent(reserved, 'draft_review', 'bundle_unavailable');
      const rejectedEvents = [];
      for (const field of ['run_id', 'invocation', 'input_sha256']) {
        const missing = clone(validEvent);
        delete missing[field];
        rejectedEvents.push(missing);
      }
      rejectedEvents.push(
        { ...validEvent, run_id: IDS.otherRun },
        { ...validEvent, invocation: validEvent.invocation + 1 },
        { ...validEvent, input_sha256: HASHES.input2 },
        { ...validEvent, result_sha256: HASHES.result },
        {
          ...validEvent,
          result: reviewInvalidInput('bundle_unavailable', { schema: 2 }),
        },
        {
          ...validEvent,
          result: reviewInvalidInput('bundle_unavailable', { error: 'transport_failure' }),
        },
        {
          ...validEvent,
          result: reviewInvalidInput('unknown_reason'),
        },
        {
          ...validEvent,
          result: reviewInvalidInput('bundle_unavailable', { unexpected: true }),
        },
      );

      for (const event of rejectedEvents) {
        const before = clone(reserved);
        expectThrow(() => reduce(api, reserved, event), /unknown|missing|stale|binding|schema|error|reason|invalid/i);
        assert.deepEqual(reserved, before, 'a rejected invalid-input event mutated its reserved phase');
      }

      const wrongPhaseEvent = reviewInvalidInputEvent(reserved, 'completion_review', 'bundle_unavailable');
      expectThrow(() => reduce(api, reserved, wrongPhaseEvent), /matching reserved|reserved|phase|not_required/i);
      for (const state of ['not_started', 'retryable', 'repairing', 'passed', 'degraded']) {
        const nonReserved = localDraftState(reviewPhase(state));
        const before = clone(nonReserved);
        expectThrow(
          () => reduce(api, nonReserved, reviewInvalidInputEvent(nonReserved, 'draft_review', 'bundle_unavailable')),
          /matching reserved|reserved|phase/i,
        );
        assert.deepEqual(nonReserved, before, `rejected ${state} phase was mutated`);
      }
    },
  );

  suite.test('review-budget', 'draft review never opens a third invocation', () => {
    const first = reduce(api, localDraftState(), reserve('draft_review'));
    const retryable = reduce(api, first, result(first, 'review_transport_failure', 'draft_review'));
    const second = reduce(api, retryable, reserve('draft_review'));
    for (const afterSecond of [
      reduce(api, second, result(second, 'review_passed', 'draft_review')),
      reduce(api, second, result(second, 'review_transport_failure', 'draft_review')),
    ]) {
      expectThrow(
        () => reduce(api, afterSecond, reserve('draft_review', HASHES.input2)),
        /terminal|permit|invocation|two/i,
      );
    }
    expectThrow(() => reduce(api, second, reserve('draft_review')), /reserved|live|permit/i);
  });

  suite.test('review-budget', 'sensitive and external draft review cannot degrade after transport failure', () => {
    for (const risk of ['sensitive', 'external']) {
      const initial = localDraftState();
      initial.run.risk = risk;
      initial.run.requested_effects = ['local', risk === 'external' ? 'release' : 'production_access'];
      initial.run.completion_review = reviewPhase('not_started');
      const first = reduce(api, initial, reserve('draft_review'));
      const retryable = reduce(api, first, result(first, 'review_transport_failure', 'draft_review'));
      const second = reduce(api, retryable, reserve('draft_review'));
      const terminal = reduce(api, second, result(second, 'review_transport_failure', 'draft_review'));
      assert.equal(terminal.status, 'blocked');
      assert.equal(terminal.run.draft_review.state, 'blocked');
      assert.equal(terminal.run.blocker.kind, 'review_failed');
    }
  });

  suite.test('review-budget', 'cancellation is terminal and stale reviewer output is discarded', () => {
    const reserved = reduce(api, localDraftState(), reserve('draft_review'));
    const cancelled = reduce(
      api,
      reserved,
      result(reserved, 'review_cancelled', 'draft_review', HASHES.result, {
        evidence_sha256: HASHES.blocker,
      }),
    );
    assert.equal(cancelled.status, 'blocked');
    assert.equal(cancelled.run.draft_review.state, 'cancelled');
    assert.equal(cancelled.run.blocker.kind, 'user_cancelled');
    expectThrow(
      () => reduce(api, cancelled, result(cancelled, 'review_passed', 'draft_review')),
      /cancelled|terminal|stale|reserved/i,
    );
    expectThrow(() => reduce(api, cancelled, reserve('draft_review')), /cancelled|terminal|permit/i);
  });

  suite.test('review-budget', 'cold reserved phase blocks once and never redispatches', () => {
    const reserved = reduce(api, localDraftState(), reserve('draft_review'));
    const blocked = reduce(api, reserved, {
      type: 'cold_entry',
      phase: 'draft_review',
      evidence_sha256: HASHES.blocker,
    });
    assert.equal(blocked.status, 'blocked');
    assert.equal(blocked.run.draft_review.state, 'blocked');
    assert.equal(blocked.run.draft_review.invocations, 1);
    expectThrow(() => reduce(api, blocked, reserve('draft_review')), /terminal|cold|permit|blocked/i);
    expectThrow(
      () => reduce(api, blocked, result(blocked, 'review_passed', 'draft_review')),
      /stale|terminal|reserved|blocked/i,
    );
  });

  suite.test('review-budget', 'completion has an independent exact two-invocation budget', () => {
    const first = reduce(api, sensitiveCompletionState(), reserveCompletion(DIFF_SHA256));
    const repairing = reduce(api, first, result(first, 'review_repair', 'completion_review'));
    const replacement = reduce(api, repairing, {
      type: 'replace_implementation',
      implementation_commit: REPLACEMENT_COMMIT,
      diff_sha256: REPLACEMENT_DIFF_SHA256,
    });
    const second = reduce(api, replacement, reserveCompletion(REPLACEMENT_DIFF_SHA256, REPLACEMENT_COMMIT));
    assert.equal(second.run.completion_review.invocations, 2);
    assert.equal(second.run.implementation_commit, REPLACEMENT_COMMIT);
    const passed = reduce(api, second, result(second, 'review_passed', 'completion_review'));
    assert.equal(passed.run.completion_review.state, 'passed');
    expectThrow(
      () => reduce(api, passed, reserveCompletion(REPLACEMENT_DIFF_SHA256, REPLACEMENT_COMMIT)),
      /terminal|permit|invocation|two/i,
    );
    assert.equal(passed.run.draft_review.invocations, 1, 'completion review never consumes or reopens draft review');
  });

  suite.test(
    'review-budget',
    'blocker fix invalidates the first completion result and exact implementation SHA',
    () => {
      const oldBinding = {
        diff_sha256: DIFF_SHA256,
        implementation_commit: IMPLEMENTATION_COMMIT,
        invocation: 1,
        run_id: IDS.run,
      };
      api.validateCompletionReview(completionReview(oldBinding), oldBinding);
      const replacementBinding = {
        diff_sha256: REPLACEMENT_DIFF_SHA256,
        implementation_commit: REPLACEMENT_COMMIT,
        invocation: 2,
        run_id: IDS.run,
      };
      expectThrow(
        () => api.validateCompletionReview(completionReview(oldBinding), replacementBinding),
        /implementation|diff|invocation|stale|binding/i,
      );
      api.validateCompletionReview(completionReview(replacementBinding), replacementBinding);
    },
  );

  suite.test('review-budget', 'completion review cannot recurse after pass or reopen draft review', () => {
    const reserved = reduce(api, sensitiveCompletionState(), reserveCompletion(DIFF_SHA256));
    const passed = reduce(api, reserved, result(reserved, 'review_passed', 'completion_review'));
    for (const phase of ['completion_review', 'draft_review']) {
      const reservation =
        phase === 'completion_review' ? reserveCompletion(HASHES.input2) : reserve(phase, HASHES.input2);
      expectThrow(() => reduce(api, passed, reservation), /terminal|reopen|permit|phase/i);
    }
  });

  suite.test('review-budget', 'PlanReviewV1 validates exact bindings and closed verdict semantics', () => {
    const binding = {
      invocation: 1,
      plan_sha256: HASHES.plan,
      run_id: IDS.run,
      source_sha256: HASHES.source,
    };
    reviewer.validatePlanReview(planReview(binding), binding);
    reviewer.validatePlanReview(
      planReview(binding, {
        verdict: 'repair',
        findings: [
          {
            id: 'P1',
            kind: 'missing_acceptance',
            locator: 'Acceptance A2',
            defect: 'The required boundary has no executable observation.',
            fix: 'Add the exact command and expected result.',
          },
        ],
      }),
      binding,
    );
    reviewer.validatePlanReview(
      planReview(binding, {
        verdict: 'blocked',
        findings: [
          {
            id: 'P2',
            kind: 'missing_decision',
            locator: 'Open questions',
            defect: 'The repository does not determine the production target.',
            fix: 'Ask the user to choose the target.',
          },
        ],
      }),
      binding,
    );
    reviewer.validatePlanReview(
      planReview(binding, {
        verdict: 'blocked',
        findings: [
          {
            id: 'P3',
            kind: 'unsafe_scope',
            locator: 'Safety authority',
            defect: 'The required safety authority for the destructive production action is absent.',
            fix: 'Obtain explicit safety authority before execution.',
          },
        ],
      }),
      binding,
    );
    expectThrow(
      () =>
        reviewer.validatePlanReview(
          planReview(binding, {
            verdict: 'blocked',
            findings: [
              {
                id: 'P4',
                kind: 'missing_acceptance',
                locator: 'Acceptance A3',
                defect: 'The required boundary has no executable observation.',
                fix: 'Add the exact command and expected result.',
              },
            ],
          }),
          binding,
        ),
      /blocked|decision|authority|repair/i,
    );

    const mutations = [
      { run_id: IDS.otherRun },
      { invocation: 2 },
      { plan_sha256: HASHES.input },
      { source_sha256: HASHES.input },
      { verdict: 'pass', findings: [{ id: 'P1' }] },
      { verdict: 'repair', findings: [] },
      { verdict: 'blocked', findings: [] },
      { unexpected: true },
    ];
    for (const mutation of mutations) {
      expectThrow(
        () => reviewer.validatePlanReview({ ...planReview(binding), ...mutation }, binding),
        /binding|finding|verdict|unknown|invocation|digest|run/i,
      );
    }
  });

  suite.test('review-budget', 'review strings require byte-for-byte compact canonical JCS', () => {
    const planBinding = {
      invocation: 1,
      plan_sha256: HASHES.plan,
      run_id: IDS.run,
      source_sha256: HASHES.source,
    };
    const planValue = planReview(planBinding);
    const canonicalPlanReview = api.jcs(planValue);
    assert.deepEqual(reviewer.validatePlanReview(canonicalPlanReview, planBinding), planValue);
    const noncanonicalPlanReview = JSON.stringify(planValue, null, 2);
    assert.notEqual(noncanonicalPlanReview, canonicalPlanReview);
    assert.deepEqual(JSON.parse(noncanonicalPlanReview), planValue);
    for (const noncanonical of [noncanonicalPlanReview, `${canonicalPlanReview}\n`, `\ufeff${canonicalPlanReview}`]) {
      expectThrow(() => reviewer.validatePlanReview(noncanonical, planBinding), /canonical|JCS|JSON/i);
    }
    const bomPrefixed = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(canonicalPlanReview)]);
    expectThrow(() => reviewer.validatePlanReview(bomPrefixed, planBinding), /canonical|JCS|JSON/i);

    const completionBinding = {
      diff_sha256: DIFF_SHA256,
      implementation_commit: IMPLEMENTATION_COMMIT,
      invocation: 1,
      run_id: IDS.run,
    };
    const completionValue = completionReview(completionBinding);
    const canonicalCompletionReview = api.jcs(completionValue);
    assert.deepEqual(reviewer.validateCompletionReview(canonicalCompletionReview, completionBinding), completionValue);
    const noncanonicalCompletionReview = JSON.stringify(completionValue, null, 2);
    assert.notEqual(noncanonicalCompletionReview, canonicalCompletionReview);
    assert.deepEqual(JSON.parse(noncanonicalCompletionReview), completionValue);
    for (const noncanonical of [
      noncanonicalCompletionReview,
      `${canonicalCompletionReview}\n`,
      `\ufeff${canonicalCompletionReview}`,
    ]) {
      expectThrow(() => reviewer.validateCompletionReview(noncanonical, completionBinding), /canonical|JCS|JSON/i);
    }
  });

  suite.test('review-budget', 'private review bundle is repository-bound, immutable, and prompt-safe', () =>
    withTempDirectory('plan-review-v1-', (root) => {
      const repo = path.join(root, 'repo');
      const sourceBase = initializeRepository(repo);
      const trackedBytes = 'tracked review bytes\n';
      writeFile(repo, 'src/tracked.txt', trackedBytes);
      writeFile(repo, 'src/untracked.txt', 'untracked review bytes\n');
      const paths = ['src/tracked.txt', 'src/untracked.txt'];
      const manifest = api.createAffectedPathManifest({ repo, paths, sourceBase });
      const planBytes = renderPlan({ status: 'drafting' });
      const binding = {
        invocation: 1,
        plan_sha256: api.sha256(api.canonicalPlanView(planBytes)),
        run_id: IDS.run,
        source_sha256: manifest.source_sha256,
      };
      const liveExpectation = { repo, paths, sourceBase };
      const createInput = { binding, manifest, outRoot: root, planBytes, ...liveExpectation };

      for (const key of ['repo', 'paths', 'sourceBase']) {
        const incomplete = { ...createInput };
        delete incomplete[key];
        expectThrow(() => reviewer.createPlanReviewBundle(incomplete), /missing|repository expectation|required/i);
      }

      expectThrow(
        () =>
          reviewer.createPlanReviewBundle({
            ...createInput,
            binding: { ...binding, plan_sha256: differentHex(binding.plan_sha256) },
          }),
        /canonical plan hash|plan_sha256|binding/i,
      );
      expectThrow(
        () =>
          reviewer.createPlanReviewBundle({
            ...createInput,
            binding: { ...binding, source_sha256: differentHex(binding.source_sha256) },
          }),
        /source|manifest|binding/i,
      );
      const changedPlan = Buffer.from(
        planBytes
          .toString()
          .replace('Implement and verify one bounded local change.', 'Implement a different substantive change.'),
      );
      expectThrow(
        () => reviewer.createPlanReviewBundle({ ...createInput, planBytes: changedPlan }),
        /canonical plan hash|plan_sha256|binding/i,
      );

      const inventedManifest = {
        ...manifest,
        paths: manifest.paths.map((entry, index) => (index === 0 ? { ...entry, invented: true } : entry)),
      };
      expectThrow(
        () => reviewer.createPlanReviewBundle({ ...createInput, manifest: inventedManifest }),
        /manifest|unknown|field/i,
      );
      const aliasedManifest = {
        ...manifest,
        paths: manifest.paths.map((entry, index) => (index === 0 ? { ...entry, path: `./${entry.path}` } : entry)),
      };
      expectThrow(
        () => reviewer.createPlanReviewBundle({ ...createInput, manifest: aliasedManifest }),
        /manifest|path|alias|normalized|canonical/i,
      );
      expectThrow(
        () => reviewer.createPlanReviewBundle({ ...createInput, paths: [...paths, './src/tracked.txt'] }),
        /path|alias|normalized|canonical|duplicate/i,
      );
      expectThrow(
        () => reviewer.createPlanReviewBundle({ ...createInput, sourceBase: differentHex(sourceBase) }),
        /source|base|commit|identity/i,
      );

      const trackedPath = path.join(repo, 'src/tracked.txt');
      writeFile(repo, 'src/tracked.txt', 'changed review bytes\n');
      try {
        expectThrow(() => reviewer.createPlanReviewBundle(createInput), /manifest|repository|bytes|source/i);
      } finally {
        writeFile(repo, 'src/tracked.txt', trackedBytes);
      }

      const originalMode = fs.statSync(trackedPath).mode & 0o7777;
      fs.chmodSync(trackedPath, originalMode ^ 0o100);
      try {
        expectThrow(() => reviewer.createPlanReviewBundle(createInput), /manifest|repository|mode|bytes|source/i);
      } finally {
        fs.chmodSync(trackedPath, originalMode);
      }

      fs.rmSync(trackedPath);
      fs.mkdirSync(trackedPath);
      try {
        expectThrow(
          () => reviewer.createPlanReviewBundle(createInput),
          /manifest|repository|kind|regular|file|source/i,
        );
      } finally {
        fs.rmSync(trackedPath, { recursive: true, force: true });
        writeFile(repo, 'src/tracked.txt', trackedBytes);
        fs.chmodSync(trackedPath, originalMode);
      }

      const bundle = reviewer.createPlanReviewBundle(createInput);
      const sealedInput = {
        binding,
        bundlePath: bundle.path,
        expectedSha256: bundle.sha256,
      };
      const sealed = reviewer.verifyPlanReviewBundle(sealedInput);
      const live = reviewer.verifyPlanReviewBundle({ ...sealedInput, ...liveExpectation });
      assert.equal(sealed.sha256, bundle.sha256);
      assert.equal(live.sha256, bundle.sha256);
      expectThrow(() => reviewer.verifyPlanReviewBundle({ ...sealedInput, repo }), /repo|paths|sourceBase|together/i);

      assert.equal(fs.lstatSync(bundle.path).mode & 0o7777, 0o500);
      for (const name of ['binding.json', 'manifest.json', 'plan.md']) {
        assert.equal(fs.lstatSync(path.join(bundle.path, name)).mode & 0o7777, 0o400);
      }

      const livePrompt = reviewer.buildPlanReviewPrompt({ ...sealedInput, ...liveExpectation });

      const arbitraryBundlePath = path.join(root, 'arbitrary');
      fs.mkdirSync(arbitraryBundlePath);
      fs.chmodSync(arbitraryBundlePath, 0o500);
      fs.rmSync(repo, { recursive: true, force: true });

      const prompt = reviewer.buildPlanReviewPrompt(sealedInput);
      assert.equal(prompt, livePrompt);
      assert.match(prompt, new RegExp(bundle.path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
      assert.match(prompt, new RegExp(bundle.sha256));
      assert.match(prompt, new RegExp(binding.plan_sha256));
      assert.match(prompt, new RegExp(binding.source_sha256));
      assert.doesNotMatch(prompt, /Implement and verify one bounded local change/);
      assert.ok(Buffer.byteLength(prompt) < 4 * 1024, 'prompt carries bindings, not the bundle payload');

      for (const invalid of [
        { binding, bundlePath: bundle.path },
        { ...sealedInput, bundlePath: arbitraryBundlePath },
        { ...sealedInput, bundlePath: path.join(root, 'plan-review-v1-ABC123') },
        {
          ...sealedInput,
          bundlePath: `${path.dirname(bundle.path)}${path.sep}.${path.sep}${path.basename(bundle.path)}`,
        },
        { ...sealedInput, expectedSha256: differentHex(bundle.sha256) },
        {
          ...sealedInput,
          binding: { ...binding, plan_sha256: differentHex(binding.plan_sha256) },
        },
        {
          ...sealedInput,
          binding: { ...binding, source_sha256: differentHex(binding.source_sha256) },
        },
      ]) {
        expectThrow(
          () => reviewer.buildPlanReviewPrompt(invalid),
          /bundle|path|exist|canonical|owned|hash|binding|tamper|expected|missing/i,
        );
      }

      fs.chmodSync(bundle.path, 0o700);
      try {
        expectThrow(() => reviewer.buildPlanReviewPrompt(sealedInput), /immutable|private|mode|bundle/i);
      } finally {
        fs.chmodSync(bundle.path, 0o500);
      }

      const bindingPath = path.join(bundle.path, 'binding.json');
      fs.chmodSync(bindingPath, 0o600);
      try {
        expectThrow(() => reviewer.buildPlanReviewPrompt(sealedInput), /immutable|private|mode|bundle/i);
      } finally {
        fs.chmodSync(bindingPath, 0o400);
      }

      const manifestPath = path.join(bundle.path, 'manifest.json');
      const manifestBytes = fs.readFileSync(manifestPath);
      fs.chmodSync(manifestPath, 0o600);
      fs.appendFileSync(manifestPath, ' ');
      fs.chmodSync(manifestPath, 0o400);
      try {
        expectThrow(() => reviewer.verifyPlanReviewBundle(sealedInput), /bundle|hash|manifest|tamper/i);
      } finally {
        fs.chmodSync(manifestPath, 0o600);
        fs.writeFileSync(manifestPath, manifestBytes);
        fs.chmodSync(manifestPath, 0o400);
      }

      expectThrow(
        () =>
          reviewer.cleanupPlanReviewBundle({
            bundlePath: bundle.path,
            expectedSha256: differentHex(bundle.sha256),
          }),
        /bundle|hash|tamper/i,
      );
      assert.equal(fs.existsSync(bundle.path), true);

      reviewer.cleanupPlanReviewBundle({ bundlePath: bundle.path, expectedSha256: bundle.sha256 });
      assert.equal(fs.existsSync(bundle.path), false);
    }),
  );

  suite.test('review-budget', 'review result size is bounded before semantic parsing', () => {
    const binding = {
      invocation: 1,
      plan_sha256: HASHES.plan,
      run_id: IDS.run,
      source_sha256: HASHES.source,
    };
    const oversized = planReview(binding, {
      verdict: 'repair',
      findings: [
        {
          id: 'P1',
          kind: 'contradiction',
          locator: 'Goal',
          defect: 'x'.repeat(33 * 1024),
          fix: 'Resolve the contradiction.',
        },
      ],
    });
    expectThrow(() => reviewer.validatePlanReview(oversized, binding), /32|size|large|bytes/i);
  });
}
