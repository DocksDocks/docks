import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
// The narrowing lives in the legacy helper and is deliberately not re-exported
// through plan-run.mjs, so depth-0 behaviour is asserted against the helper
// directly. plan-orchestration.mjs owns the suite wiring and is not this plan's
// to edit.
import {
  validateCurrentPolicy,
  withLegacyClassification,
} from '../../../plugins/docks/skills/productivity/plan-manager/scripts/legacy-review-records.mjs';
import { currentPolicy, DRIFTED_SCHEMA6_POLICY, driftedSchema6Receipt } from './fixtures/historical-records.mjs';
import { LEGACY_RECORD_KINDS, legacyPlan, malformedLegacyCatalog } from './fixtures/legacy-plans.mjs';
import { IDS, PLAN_PATH, planRun, REPOSITORY_ID, reviewPhase, SOURCE_BASE } from './fixtures/plan-run-v1.mjs';
import { expectThrow } from './harness.mjs';

const SETTLED_PLAN = 'docs/plans/finished/2026-07-17-single-gpt-plan-review-default.md';
const CROSSED_PLAN_SLUG = 'session-relay-linux-workspace-publication';

// The crossed publication plan was retired out of `active/` under the quarantine
// retirement path, so both locations are legitimate. Resolve it wherever it lives
// rather than pinning one, and require exactly one match so a duplicate archive
// cannot silently change which bytes this case asserts on.
function crossedPlanPath(root) {
  const active = `docs/plans/active/${CROSSED_PLAN_SLUG}.md`;
  if (fs.existsSync(path.join(root, active))) return active;
  const finished = fs
    .readdirSync(path.join(root, 'docs/plans/finished'))
    .filter((name) => new RegExp(`^\\d{4}-\\d{2}-\\d{2}-${CROSSED_PLAN_SLUG}\\.md$`).test(name));
  assert.equal(finished.length, 1, `exactly one crossed ${CROSSED_PLAN_SLUG} plan must be resolvable`);
  return path.join('docs/plans/finished', finished[0]);
}

function classification(api, bytes) {
  return api.classifyLegacyPlan(bytes).classification;
}

function migratableRun(api, bytes, overrides = {}) {
  return planRun({
    draft_review: reviewPhase('passed'),
    plan_sha256: api.sha256(api.canonicalPlanView(bytes)),
    ...overrides,
  });
}
// One unsettled bootstrap family, shared by the launder and retirement cases so
// they provably act on the SAME family. The pair is only meaningful as a pair:
// retirement is the safe alternative to the status flip it is set against, so a
// second copy that could drift independently would silently decouple them.
function bootstrapRecord(api) {
  return `Bootstrap-review-record: ${api.jcs({
    schema: 1,
    kind: 'bootstrap_not_reusable',
    plan_blob_sha256: 'a'.repeat(64),
    plan_path: 'docs/plans/active/legacy-fixture.md',
    reviewed_commit: 'b'.repeat(40),
    X: {
      effort: 'high',
      findings_sha256: 'c'.repeat(64),
      model: 'legacy-reviewer',
      reviewed_at: '2026-07-20T00:00:00Z',
      score: 100,
      tool: 'legacy-tool',
      verdict: 'ready',
    },
    S: {
      attempted: false,
      denial_source: 'legacy fixture',
      reason: 'not authorized',
      result: 'not_authorized',
      reviewed_at: '2026-07-20T00:00:00Z',
      selected: null,
    },
  })}`;
}

export function registerLegacyQuarantine(suite, api, { root }) {
  suite.test('legacy-quarantine', 'record-free and complete settled terminal evidence are distinct', () => {
    assert.equal(classification(api, legacyPlan()), 'record-free');
    const settled = fs.readFileSync(path.join(root, SETTLED_PLAN));
    const result = api.classifyLegacyPlan(settled);
    assert.equal(result.classification, 'settled-terminal');
    assert.ok(result.records.length >= 1);
    assert.ok(result.records.every(({ settled: value }) => value === true));
  });

  suite.test('legacy-quarantine', 'orphan current-run attempt history quarantines instead of migrating', () => {
    const orphan = Buffer.concat([legacyPlan(), Buffer.from('\n## Review\n\nPlan-attempt-history: {"schema":1}\n')]);
    const result = api.classifyLegacyPlan(orphan);
    assert.equal(result.classification, 'legacy-quarantined');
    assert.match(result.reason, /orphan|attempt|current/i);
  });

  suite.test(
    'legacy-quarantine',
    'active, prepared, commitment, cancelled, crossed, and malformed families quarantine',
    () => {
      for (const testCase of malformedLegacyCatalog()) {
        const result = api.classifyLegacyPlan(testCase.bytes);
        assert.equal(result.classification, 'legacy-quarantined', testCase.name);
        assert.match(result.reason, /active|prepared|commitment|cancel|cross|malformed|duplicate|schema|legacy/i);
      }
    },
  );

  suite.test('legacy-quarantine', 'finished status can launder an unsettled legacy family', () => {
    const record = bootstrapRecord(api);
    const records = [record];

    assert.equal(classification(api, legacyPlan(records)), 'legacy-quarantined');
    assert.equal(classification(api, legacyPlan(records, { status: 'finished' })), 'settled-terminal');
  });

  suite.test('legacy-quarantine', 'retirement retains quarantined classification and reason', () => {
    const record = bootstrapRecord(api);
    const before = api.classifyLegacyPlan(legacyPlan([record]));
    const retired = Buffer.concat([
      legacyPlan([record]),
      Buffer.from('\n## Retirement\n\nThe abandoned goal was retired without changing its evidence.\n'),
    ]);
    const after = api.classifyLegacyPlan(retired);

    assert.deepEqual(
      [after.classification, after.reason],
      [before.classification, before.reason],
      'retirement retention case: classification and reason did not change',
    );
    assert.equal(after.classification, 'legacy-quarantined');
  });

  suite.test('legacy-quarantine', 'the named crossed Session Relay publication plan is quarantined read-only', () => {
    const bytes = fs.readFileSync(path.join(root, crossedPlanPath(root)));
    const before = Buffer.from(bytes);
    const result = api.classifyLegacyPlan(bytes);
    assert.equal(result.classification, 'legacy-quarantined');
    assert.match(result.reason, /cross|duplicate|active|receipt|malformed|family/i);
    assert.ok(bytes.equals(before), 'classification never repairs or rewrites the source');
    expectThrow(
      () =>
        api.migrateLegacyPlan({
          bytes,
          nextStatus: 'ongoing',
          run: migratableRun(api, bytes),
          sourceBase: SOURCE_BASE,
        }),
      /quarantine|legacy|cross|migrate/i,
    );
  });

  suite.test(
    'legacy-quarantine',
    'record-free local migration writes one current record and validates target-locally',
    () => {
      const bytes = legacyPlan();
      const before = Buffer.from(bytes);
      const run = migratableRun(api, bytes);
      const sourceRun = structuredClone(run);
      const migrated = api.migrateLegacyPlan({
        bytes,
        nextStatus: 'ongoing',
        run,
        sourceBase: SOURCE_BASE,
      });
      assert.equal((migrated.toString().match(/^Plan-run: /gm) ?? []).length, 1);
      assert.equal(classification(api, migrated), 'current');
      const validated = api.validatePlanRun(migrated, {
        goalId: IDS.goal,
        planPath: PLAN_PATH,
        repositoryId: REPOSITORY_ID,
        runId: IDS.run,
      });
      assert.equal(validated.status, 'ongoing');
      assert.equal(validated.run.run_id, IDS.run);
      assert.equal(validated.run.source_base, SOURCE_BASE);
      assert.equal(validated.run.execution_parent, SOURCE_BASE);
      assert.ok(bytes.equals(before), 'migration leaves source bytes immutable');
      assert.deepEqual(run, sourceRun, 'migration leaves the caller run immutable');
    },
  );

  suite.test(
    'legacy-quarantine',
    'record-free migration preserves an earlier fenced Plan-run placeholder example',
    () => {
      const fencedExample = Buffer.from('```text\nPlan-run: {}\n```');
      const bytes = Buffer.from(
        legacyPlan().toString().replace('\n## Review\n', `\n## Example\n\n${fencedExample.toString()}\n\n## Review\n`),
      );
      assert.equal(classification(api, bytes), 'record-free');

      const migrated = api.migrateLegacyPlan({
        bytes,
        nextStatus: 'ongoing',
        run: migratableRun(api, bytes),
        sourceBase: SOURCE_BASE,
      });
      const migratedText = migrated.toString();
      const fencedOffset = migrated.indexOf(fencedExample);
      assert.notEqual(fencedOffset, -1);
      assert.ok(
        migrated.subarray(fencedOffset, fencedOffset + fencedExample.length).equals(fencedExample),
        'the complete fenced example remains byte-identical',
      );
      assert.equal(migratedText.split('\n').filter((line) => line === 'Plan-run: {}').length, 1);

      const validated = api.validatePlanRun(migrated, {
        goalId: IDS.goal,
        planPath: PLAN_PATH,
        repositoryId: REPOSITORY_ID,
        runId: IDS.run,
      });
      const currentRecord = `Plan-run: ${api.jcs(validated.run)}`;
      assert.equal(migratedText.split('\n').filter((line) => line === currentRecord).length, 1);
      assert.equal(validated.status, 'ongoing');
      assert.equal(validated.run.schema, 1);
      assert.equal(classification(api, migrated), 'current');
    },
  );

  suite.test('legacy-quarantine', 'migration requires an exact sourceBase with compatible run bindings', () => {
    const bytes = legacyPlan();
    const run = migratableRun(api, bytes);
    expectThrow(
      () => api.migrateLegacyPlan({ bytes, nextStatus: 'ongoing', run }),
      /sourceBase.*commit|commit.*sourceBase/i,
    );
    expectThrow(
      () =>
        api.migrateLegacyPlan({
          bytes,
          nextStatus: 'ongoing',
          run: { ...run, source_base: null },
          sourceBase: SOURCE_BASE,
        }),
      /source_base.*sourceBase|sourceBase.*source_base/i,
    );
    expectThrow(
      () =>
        api.migrateLegacyPlan({
          bytes,
          nextStatus: 'ongoing',
          run: { ...run, execution_parent: '6'.repeat(40) },
          sourceBase: SOURCE_BASE,
        }),
      /execution_parent.*sourceBase|sourceBase.*execution_parent/i,
    );
  });

  suite.test(
    'legacy-quarantine',
    'settled-terminal migration cuts over cleanly without crossing or mutating its source',
    () => {
      const bytes = fs.readFileSync(path.join(root, SETTLED_PLAN));
      const before = Buffer.from(bytes);
      const migrated = api.migrateLegacyPlan({
        bytes,
        nextStatus: 'ongoing',
        run: migratableRun(api, bytes),
        sourceBase: SOURCE_BASE,
      });
      const text = migrated.toString();
      assert.equal((text.match(/^Plan-run: /gm) ?? []).length, 1);
      for (const kind of LEGACY_RECORD_KINDS) {
        assert.doesNotMatch(text, new RegExp(`^${kind}:`, 'm'), kind);
      }
      assert.equal(classification(api, migrated), 'current');
      const validated = api.validatePlanRun(migrated);
      assert.equal(validated.run.source_base, SOURCE_BASE);
      assert.equal(validated.run.execution_parent, SOURCE_BASE);
      assert.ok(bytes.equals(before), 'settled source bytes remain immutable');
      assert.equal(classification(api, bytes), 'settled-terminal');
    },
  );

  suite.test('legacy-quarantine', 'unrelated quarantined plans do not globally block a fresh target', () => {
    const unrelated = malformedLegacyCatalog()[2].bytes;
    assert.equal(classification(api, unrelated), 'legacy-quarantined');
    const target = legacyPlan();
    const migrated = api.migrateLegacyPlan({
      bytes: target,
      nextStatus: 'ongoing',
      run: migratableRun(api, target),
      sourceBase: SOURCE_BASE,
    });
    const validated = api.validatePlanRun(migrated);
    assert.equal(validated.run.run_id, IDS.run);
    assert.equal(validated.run.source_base, SOURCE_BASE);
    assert.equal(validated.run.execution_parent, SOURCE_BASE);
    assert.ok(unrelated.equals(malformedLegacyCatalog()[2].bytes), 'unrelated bytes remain untouched');
  });

  suite.test('legacy-quarantine', 'migration never broadens local evidence into external authority', () => {
    const bytes = legacyPlan();
    const external = migratableRun(api, bytes, {
      completion_review: reviewPhase('not_started'),
      requested_effects: ['local', 'release'],
      risk: 'external',
    });
    expectThrow(
      () =>
        api.migrateLegacyPlan({
          bytes,
          nextStatus: 'ongoing',
          run: external,
          sourceBase: SOURCE_BASE,
        }),
      /local|external|authority|migration/i,
    );
  });

  suite.test(
    'legacy-quarantine',
    'quarantined continuation requires a fresh run identity, never old authorization',
    () => {
      const cancelled = malformedLegacyCatalog().find(({ name }) => name.includes('cancelled'))?.bytes;
      assert.ok(cancelled);
      const result = api.classifyLegacyPlan(cancelled);
      assert.equal(result.classification, 'legacy-quarantined');
      assert.equal(result.reusable_authority, false);
      assert.equal(result.resumable, false);
    },
  );

  suite.test(
    'legacy-quarantine',
    'legacy marker inventory is complete and no marker silently becomes record-free',
    () => {
      assert.deepEqual(LEGACY_RECORD_KINDS, [
        'Bootstrap-review-record',
        'Review-receipt',
        'Completion-review-receipt',
        'Review-orchestration-state',
        'Review-orchestration-prepared-request',
        'Review-orchestration-dispatch-commitment',
        'Review-orchestration-controller-abort',
        'Review-orchestration-abandonment',
      ]);
      for (const kind of LEGACY_RECORD_KINDS) {
        const bytes = legacyPlan([`${kind}: {"schema":999}`]);
        assert.notEqual(classification(api, bytes), 'record-free', kind);
      }
    },
  );

  // A schema-6-declared family carrying the schema-5 policy shape is drifted
  // reviewer-selection metadata, not a receipt defect. Only the classification
  // path narrows; every other family check, and every depth-0 caller, is
  // unchanged. Cases (a)-(c) drive the narrowed path, (d)-(e) pin its boundary.
  const driftedPlan = (options) => {
    const { receipt, orchestration } = driftedSchema6Receipt(api, options);
    return legacyPlan(
      [`Review-orchestration-state: ${api.jcs(orchestration)}`, `Review-receipt: ${api.jcs(receipt)}`],
      { status: 'finished' },
    );
  };

  suite.test('legacy-quarantine', 'a drifted schema-6 policy classifies as settled terminal evidence', () => {
    const result = api.classifyLegacyPlan(driftedPlan());
    assert.equal(result.classification, 'settled-terminal');
    assert.equal(result.reason, 'complete settled terminal legacy evidence');
  });

  suite.test('legacy-quarantine', 'a partially drifted schema-6 policy stays quarantined', () => {
    const result = api.classifyLegacyPlan(
      driftedPlan({ policy: { ...currentPolicy(6), fallback: 'availability_only' } }),
    );
    assert.equal(result.classification, 'legacy-quarantined');
    assert.match(result.reason, /schema-6 current policy fallback must be none/);
  });

  suite.test('legacy-quarantine', 'the narrowing cannot smuggle cancelled evidence past the sweep', () => {
    const result = api.classifyLegacyPlan(
      driftedPlan({
        mutateRun: (run) => {
          run.reviewer.raw.attempts[0].reason = 'user_cancelled';
        },
      }),
    );
    assert.equal(result.classification, 'legacy-quarantined');
    assert.match(result.reason, /cancelled historical evidence is quarantine-only/);
  });

  suite.test('legacy-quarantine', 'the drifted policy is still rejected outside a classification scope', () => {
    expectThrow(
      () => validateCurrentPolicy(structuredClone(DRIFTED_SCHEMA6_POLICY)),
      /^Error: schema-6 current policy fallback must be none$/,
    );
    assert.equal(
      withLegacyClassification(() => validateCurrentPolicy(structuredClone(DRIFTED_SCHEMA6_POLICY))).fallback,
      'availability_only',
    );
  });

  suite.test('legacy-quarantine', 'a throwing classification body restores the scope depth', () => {
    expectThrow(
      () =>
        withLegacyClassification(() => {
          throw new Error('body failed');
        }),
      /body failed/,
    );
    expectThrow(
      () => validateCurrentPolicy(structuredClone(DRIFTED_SCHEMA6_POLICY)),
      /^Error: schema-6 current policy fallback must be none$/,
      'depth leaked: the drifted policy is still accepted after a throwing body',
    );
  });
}
