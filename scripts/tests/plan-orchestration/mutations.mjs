import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { legacyPlan, malformedLegacyCatalog } from './fixtures/legacy-plans.mjs';
import {
  acceptance,
  bindPlan,
  HASHES,
  IDS,
  IMPLEMENTATION_COMMIT,
  PLAN_PATH,
  planRun,
  REPOSITORY_ID,
  reviewPhase,
  reviewResultEvent,
  SOURCE_BASE,
  tuple,
} from './fixtures/plan-run-v1.mjs';
import { expectReject, expectThrow, withTempDirectory } from './harness.mjs';

function reduce(api, current, event) {
  return api.reducePlanRun({ current, event });
}

export function registerMutations(suite, api) {
  suite.test('mutations', 'CAS bypass: stale plan bytes fail before overwrite', () =>
    withTempDirectory('plan-run-mutation-cas-', async (root) => {
      const file = path.join(root, 'plan.md');
      const current = bindPlan(api, tuple('drafting'));
      const next = bindPlan(api, tuple('drafting', { draft_review: reviewPhase('reserved') }));
      fs.writeFileSync(file, current.bytes);
      fs.appendFileSync(file, '\nconcurrent-change\n');
      await expectReject(
        () =>
          api.transactPlanRun({
            file,
            identity: { planPath: PLAN_PATH, repositoryId: REPOSITORY_ID, runId: IDS.run },
            expectedBytesSha256: api.sha256(current.bytes),
            nextBytes: next.bytes,
          }),
        /CAS|preimage|stale/i,
      );
      assert.match(fs.readFileSync(file, 'utf8'), /concurrent-change/);
    }),
  );

  suite.test('mutations', 'review-budget overflow: a third reservation is impossible', () => {
    let state = { status: 'drafting', run: planRun() };
    state = reduce(api, state, {
      type: 'reserve_review',
      phase: 'draft_review',
      input_sha256: HASHES.input,
    });
    state = reduce(
      api,
      state,
      reviewResultEvent(state, 'review_transport_failure', 'draft_review', {
        result_sha256: HASHES.failure,
      }),
    );
    state = reduce(api, state, {
      type: 'reserve_review',
      phase: 'draft_review',
      input_sha256: HASHES.input2,
    });
    state = reduce(api, state, reviewResultEvent(state, 'review_passed', 'draft_review'));
    expectThrow(
      () =>
        reduce(api, state, {
          type: 'reserve_review',
          phase: 'draft_review',
          input_sha256: HASHES.input2,
        }),
      /terminal|permit|invocation|two/i,
    );
  });

  suite.test('mutations', 'external-intent widening: prefix and persisted intent grant nothing', () => {
    const authority = {
      scopes: ['release'],
      mode: 'mutate',
      targets: [`${REPOSITORY_ID}#release:prod`],
      source_sha256: HASHES.input,
    };
    for (const mutation of [
      { effect: 'push', target: authority.targets[0] },
      { effect: 'release', target: `${authority.targets[0]}-shadow` },
    ]) {
      expectThrow(
        () =>
          api.authorizeExternalEffect({
            authority,
            liveSourceSha256: HASHES.input,
            mode: 'mutate',
            ...mutation,
          }),
        /authority|scope|target|exact/i,
      );
    }
  });

  suite.test('mutations', 'degraded-sensitive execution: second infrastructure failure blocks', () => {
    let state = {
      status: 'drafting',
      run: planRun({
        completion_review: reviewPhase('not_started'),
        requested_effects: ['local', 'production_access'],
        risk: 'sensitive',
      }),
    };
    const events = [
      () => ({ type: 'reserve_review', phase: 'draft_review', input_sha256: HASHES.input }),
      (current) =>
        reviewResultEvent(current, 'review_transport_failure', 'draft_review', {
          result_sha256: HASHES.failure,
        }),
      () => ({ type: 'reserve_review', phase: 'draft_review', input_sha256: HASHES.input2 }),
      (current) =>
        reviewResultEvent(current, 'review_transport_failure', 'draft_review', {
          result_sha256: HASHES.failure,
        }),
    ];
    for (const event of events) {
      state = reduce(api, state, event(state));
    }
    assert.equal(state.status, 'blocked');
    assert.equal(state.run.draft_review.state, 'blocked');
    assert.notEqual(state.run.draft_review.state, 'degraded');
  });

  suite.test('mutations', 'legacy-global-blockage: quarantine is target-local', () => {
    const quarantined = malformedLegacyCatalog()[0].bytes;
    assert.equal(api.classifyLegacyPlan(quarantined).classification, 'legacy-quarantined');
    const target = legacyPlan();
    const run = planRun({
      draft_review: reviewPhase('passed'),
      plan_sha256: api.sha256(api.canonicalPlanView(target)),
    });
    const migrated = api.migrateLegacyPlan({
      bytes: target,
      nextStatus: 'ongoing',
      run,
      sourceBase: SOURCE_BASE,
    });
    assert.equal(api.validatePlanRun(migrated).run.run_id, IDS.run);
  });

  suite.test('mutations', 'completion-review recursion: passed completion is terminal', () => {
    let state = {
      status: 'ongoing',
      run: planRun({
        completion_review: reviewPhase('not_started'),
        draft_review: reviewPhase('passed'),
        execution_parent: SOURCE_BASE,
        requested_effects: ['local', 'production_access'],
        risk: 'sensitive',
      }),
    };
    state = reduce(api, state, {
      type: 'reserve_review',
      phase: 'completion_review',
      input_sha256: HASHES.input,
      implementation_commit: IMPLEMENTATION_COMMIT,
      acceptance: acceptance(),
    });
    state = reduce(api, state, reviewResultEvent(state, 'review_passed', 'completion_review'));
    expectThrow(
      () =>
        reduce(api, state, {
          type: 'reserve_review',
          phase: 'completion_review',
          input_sha256: HASHES.input2,
          implementation_commit: IMPLEMENTATION_COMMIT,
          acceptance: acceptance(),
        }),
      /terminal|reopen|permit/i,
    );
  });
}
