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
  withStamps,
} from './fixtures/plan-run-v1.mjs';
import { expectReject, expectThrow, git, initializeRepository, withTempDirectory, writeFile } from './harness.mjs';

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

  suite.test('mutations', 'acceptance proof is keyed to the transition, not the side being read', () =>
    withTempDirectory('plan-run-acceptance-install-', async (root) => {
      const file = path.join(root, 'plan.md');
      const identity = { planPath: PLAN_PATH, repositoryId: REPOSITORY_ID, runId: IDS.run };
      const base = tuple('ongoing', {
        risk: 'sensitive',
        draft_review: reviewPhase('passed'),
        execution_parent: SOURCE_BASE,
      });
      const installedState = reduce(api, base, {
        type: 'reserve_review',
        phase: 'completion_review',
        input_sha256: HASHES.input,
        implementation_commit: IMPLEMENTATION_COMMIT,
        acceptance: acceptance(),
      });
      const current = bindPlan(api, base);
      const installed = bindPlan(api, installedState);
      fs.writeFileSync(file, current.bytes);

      // Minting an acceptance is the one moment its proof is provable, so an
      // install without the manifest must fail rather than degrade to recorded.
      await expectReject(
        () =>
          api.transactPlanRun({
            file,
            identity,
            expectedBytesSha256: api.sha256(current.bytes),
            nextBytes: installed.bytes,
          }),
        /manifest/i,
      );

      // `identity` is only asserted to be a plain object, so a weaker proof
      // smuggled through it must not reach the install path.
      await expectReject(
        () =>
          api.transactPlanRun({
            file,
            identity: { ...identity, acceptanceProof: 'recorded' },
            expectedBytesSha256: api.sha256(current.bytes),
            nextBytes: installed.bytes,
          }),
        /manifest/i,
      );
      assert.ok(fs.readFileSync(file).equals(current.bytes), 'a refused install must not write');

      // Carrying that same acceptance forward re-reads bytes the CAS preimage
      // already pinned, so it needs no manifest - this is what unfreezes finish.
      fs.writeFileSync(file, installed.bytes);
      const carried = bindPlan(
        api,
        reduce(api, installedState, reviewResultEvent(installedState, 'review_passed', 'completion_review')),
      );
      assert.equal(api.jcs(carried.run.acceptance), api.jcs(installed.run.acceptance));
      await api.transactPlanRun({
        file,
        identity,
        expectedBytesSha256: api.sha256(installed.bytes),
        nextBytes: carried.bytes,
      });
      const finished = api.validatePlanRun(fs.readFileSync(file), { ...identity, acceptanceProof: 'recorded' });
      assert.equal(finished.run.completion_review.state, 'passed');

      // Draft review F1 observed that `recorded` also skips the
      // `affected_paths` comparison, and concluded a carry-forward could
      // therefore rewrite that set. The mechanism is real; the conclusion is
      // not. `affected_paths` lives inside `canonicalPlanView`, so editing it
      // moves `plan_sha256`, and no ordinary transition may change that. Pin
      // the disproof: this fails if `plan_sha256` ever becomes a permitted
      // changed field, which is exactly when F1 would become exploitable.
      fs.writeFileSync(file, installed.bytes);
      const repathed = carried.bytes.toString().replace('  - src/untracked.txt', '  - src/reviewer-added.txt');
      const rebound = {
        ...carried.run,
        plan_sha256: api.sha256(api.canonicalPlanView(Buffer.from(repathed))),
      };
      const repathedLines = repathed.split('\n');
      const recordIndex = repathedLines.findIndex((line) => line.startsWith('Plan-run:'));
      repathedLines[recordIndex] = `Plan-run: ${api.jcs(rebound)}`;
      const tampered = Buffer.from(repathedLines.join('\n'));
      // Self-consistent standalone, so only a transition rule can reject it.
      api.validatePlanRun(tampered, { ...identity, acceptanceProof: 'recorded' });
      await expectReject(
        () =>
          api.transactPlanRun({
            file,
            identity,
            expectedBytesSha256: api.sha256(installed.bytes),
            nextBytes: tampered,
          }),
        /persisted review event cannot change plan_sha256/,
      );
    }),
  );

  suite.test('mutations', 'a live manifest actually installs an acceptance', () =>
    withTempDirectory('plan-run-acceptance-write-', async (root) => {
      // The negative cases above prove the door is shut without a manifest.
      // This proves it OPENS with one — the transition a completion reservation
      // must make, and the only path by which any run reaches `finished`.
      const repo = path.join(root, 'repo');
      initializeRepository(repo);
      writeFile(repo, 'src/tracked.txt', 'tracked\n');
      git(repo, ['add', '-A']);
      git(repo, ['commit', '-q', '-m', 'fixture']);
      const sourceBase = git(repo, ['rev-parse', 'HEAD']).stdout.trim();

      const paths = ['src/tracked.txt', 'src/untracked.txt'];
      const acceptanceManifest = api.createAffectedPathManifest({ repo, paths, sourceBase });
      const acceptanceManifestExpectation = { repo, paths, sourceBase };

      const base = tuple('ongoing', {
        risk: 'sensitive',
        draft_review: reviewPhase('passed'),
        execution_parent: SOURCE_BASE,
      });
      const installedState = reduce(api, base, {
        type: 'reserve_review',
        phase: 'completion_review',
        input_sha256: HASHES.input,
        implementation_commit: IMPLEMENTATION_COMMIT,
        acceptance: acceptance(),
      });
      const current = bindPlan(api, base, { acceptanceManifest });
      const installed = bindPlan(api, installedState, { acceptanceManifest });
      assert.equal(installed.run.acceptance.source_sha256, acceptanceManifest.source_sha256);

      const file = path.join(root, 'plan.md');
      fs.writeFileSync(file, current.bytes);
      const result = await api.transactPlanRun({
        file,
        identity: { planPath: PLAN_PATH, repositoryId: REPOSITORY_ID, runId: IDS.run },
        expectedBytesSha256: api.sha256(current.bytes),
        nextBytes: installed.bytes,
        acceptanceManifest,
        acceptanceManifestExpectation,
      });
      assert.notEqual(result.run.acceptance, null);
      assert.equal(result.run.completion_review.state, 'reserved');
    }),
  );

  suite.test('mutations', 'persisted transport refund carries a repair sequence through to pass', () =>
    withTempDirectory('plan-run-mutation-refund-', async (root) => {
      const file = path.join(root, 'plan.md');
      const identity = { planPath: PLAN_PATH, repositoryId: REPOSITORY_ID, runId: IDS.run };
      const events = [
        () => ({ type: 'reserve_review', phase: 'draft_review', input_sha256: HASHES.input }),
        (current) =>
          reviewResultEvent(current, 'review_transport_failure', 'draft_review', {
            result_sha256: HASHES.failure,
          }),
        () => ({ type: 'reserve_review', phase: 'draft_review', input_sha256: HASHES.input2 }),
        (current) => reviewResultEvent(current, 'review_repair', 'draft_review'),
        () => ({ type: 'reserve_review', phase: 'draft_review', input_sha256: HASHES.input3 }),
        (current) => reviewResultEvent(current, 'review_passed', 'draft_review'),
      ];
      let state = { status: 'drafting', run: planRun() };
      let fixture = bindPlan(api, state);
      fs.writeFileSync(file, fixture.bytes);

      for (const event of events) {
        const nextState = reduce(api, state, event(state));
        const nextFixture = bindPlan(api, nextState);
        await api.transactPlanRun({
          file,
          identity,
          expectedBytesSha256: api.sha256(fixture.bytes),
          nextBytes: nextFixture.bytes,
        });
        state = nextState;
        fixture = nextFixture;
      }

      const validated = api.validatePlanRun(fs.readFileSync(file), identity);
      assert.equal(validated.run.draft_review.state, 'passed');
      assert.equal(validated.run.draft_review.invocations, 2);
    }),
  );

  suite.test('mutations', 'persisted terminal transport result cannot refund a permit', () =>
    withTempDirectory('plan-run-mutation-terminal-refund-', async (root) => {
      const file = path.join(root, 'plan.md');
      const current = bindPlan(
        api,
        tuple('drafting', {
          draft_review: reviewPhase('transport_retried', { invocations: 2 }),
        }),
      );
      const next = bindPlan(
        api,
        tuple('drafting', {
          draft_review: reviewPhase('degraded', {
            input_sha256: HASHES.input2,
            invocations: 1,
          }),
        }),
      );
      fs.writeFileSync(file, current.bytes);
      await expectReject(
        () =>
          api.transactPlanRun({
            file,
            identity: { planPath: PLAN_PATH, repositoryId: REPOSITORY_ID, runId: IDS.run },
            expectedBytesSha256: api.sha256(current.bytes),
            nextBytes: next.bytes,
          }),
        /invocation|refund|transition/i,
      );
      assert.deepEqual(fs.readFileSync(file), current.bytes);
    }),
  );

  suite.test('mutations', 'terminal verdict cannot reopen after a refunded transport failure', () => {
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

  const chronologyWrite = (root, stamps) => {
    const file = path.join(root, 'plan.md');
    const current = bindPlan(api, tuple('drafting'));
    const next = bindPlan(api, tuple('drafting', { draft_review: reviewPhase('reserved') }));
    fs.writeFileSync(file, current.bytes);
    return {
      current,
      file,
      write: () =>
        api.transactPlanRun({
          file,
          identity: { planPath: PLAN_PATH, repositoryId: REPOSITORY_ID, runId: IDS.run },
          expectedBytesSha256: api.sha256(current.bytes),
          nextBytes: withStamps(next.bytes, ...stamps),
        }),
    };
  };

  suite.test('mutations', 'chronology: a write cannot install finished_at before started_at', () =>
    withTempDirectory('plan-run-chronology-inverted-', async (root) => {
      const { current, file, write } = chronologyWrite(root, ['"2026-07-24T05:00:00Z"', '"2026-07-24T02:00:00Z"']);
      await expectReject(write, /finished_at cannot precede started_at/);
      assert.equal(fs.readFileSync(file, 'utf8'), current.bytes.toString());
    }),
  );

  suite.test('mutations', 'chronology: the same write is accepted once the stamps are ordered', () =>
    withTempDirectory('plan-run-chronology-ordered-', async (root) => {
      const { write } = chronologyWrite(root, ['"2026-07-24T02:00:00Z"', '"2026-07-24T05:00:00Z"']);
      const result = await write();
      assert.equal(result.run.draft_review.state, 'reserved');
    }),
  );

  suite.test('mutations', 'chronology: an unparseable lifecycle stamp is refused', () =>
    withTempDirectory('plan-run-chronology-unparseable-', async (root) => {
      const { write } = chronologyWrite(root, ['"the day before"', 'null']);
      await expectReject(write, /started_at is not a valid instant/);
    }),
  );

  suite.test('mutations', 'chronology: validation stays permissive so an archived inversion still reads', () => {
    const inverted = withStamps(
      bindPlan(api, tuple('drafting')).bytes,
      '"2026-07-24T05:00:00Z"',
      '"2026-07-24T02:00:00Z"',
    );
    const view = api.validatePlanRun(inverted, {
      planPath: PLAN_PATH,
      repositoryId: REPOSITORY_ID,
      runId: IDS.run,
    });
    assert.equal(view.frontmatter.finished_at, '2026-07-24T02:00:00Z');
  });
}
