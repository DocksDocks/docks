import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { classifyLegacyPlan } from '../../../plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/plan-run.mjs';
import {
  acceptanceInventoryFixture,
  currentAttempt,
  currentCompletionReceipt,
  currentCompletionRun,
  currentOutput,
  currentPolicy,
  currentRaw,
  currentReceipt,
  currentRequest,
  currentRun,
  currentSeries,
  currentWaiver,
  DRIFTED_SCHEMA6_POLICY,
  driftedSchema6Receipt,
  H1,
  H2,
  legacyCompletionReceipt,
  legacyCompletionRun,
  legacyDraftReceipt,
  legacyDraftRun,
  legacyOutput,
  legacyPolicy,
  legacyRaw,
  legacyRequest,
  legacySeries,
  legacyWaiver,
  workflowRecord,
} from './fixtures/historical-records.mjs';
import { legacyPlan } from './fixtures/legacy-plans.mjs';
import { clone, expectThrow } from './harness.mjs';
import { runHistoricalMalformedCorpus } from './historical-malformed-corpus.mjs';

const RECORD =
  /^(Bootstrap-review-record|Review-receipt|Completion-review-receipt|Review-orchestration-state|Review-orchestration-prepared-request|Review-orchestration-dispatch-commitment|Review-orchestration-controller-abort|Review-orchestration-abandonment): /m;

const DRIFT_EXCEPTION_NAMES = [
  'complete_drifted_settled',
  'partial_drift_fallback',
  'cancelled_drifted_family',
  'outside_classification_scope',
  'throwing_scope_restoration',
];

function sha256Bytes(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function readInventory(root) {
  return JSON.parse(
    fs.readFileSync(path.join(root, 'scripts/tests/plan-orchestration/fixtures/historical-inventory.json'), 'utf8'),
  );
}

function capturedOutcome(operation) {
  try {
    operation();
    return 'accepted';
  } catch {
    return 'rejected';
  }
}

function outcomeMatrix(schemas, operation) {
  return Object.fromEntries(schemas.map((schema) => [String(schema), capturedOutcome(() => operation(schema))]));
}

function legacyPolicyForRecordSchema(schema) {
  if (schema === 1) return 1;
  if (schema === 2) return 3;
  if (schema === 3) return 4;
  throw new Error(`unsupported legacy review record schema ${schema}`);
}

function fixtureOutcomes(api, root) {
  const sample = fs.readFileSync(path.join(root, 'scripts/tests/fixtures/plan-review-policy/sample-plan.md'));
  const legacyRecord = (schema) => {
    const request = legacyRequest(api, legacyPolicyForRecordSchema(schema));
    const output = legacyOutput(request);
    const raw = legacyRaw(api, request);
    assert.equal(output.schema, schema);
    assert.equal(raw.schema, schema);
    api.validateReviewerOutput(output, request, 'S');
    api.validateRawLeg(raw, request, 'S');
  };
  const currentRecord = (schema) => {
    const request = currentRequest(api, schema);
    const output = currentOutput(request);
    const raw = currentRaw(api, request);
    assert.equal(output.schema, schema);
    assert.equal(raw.schema, schema);
    api.validateReviewerOutput(output, request, 'primary');
    api.validateCurrentReviewerOutput(output, request);
    api.validateCurrentAttemptSequence([currentAttempt(request)], request.policy);
    api.validateCurrentRawReview(raw, request);
  };
  const draftResult = (schema) => {
    const result = schema <= 3 ? legacyDraftRun(api, legacyPolicyForRecordSchema(schema)) : currentRun(api, schema);
    assert.equal(result.schema, schema);
    if (schema >= 5) api.validateCurrentReviewRunResult(result);
    api.validateDraftRunResult(result);
  };
  const completionResult = (schema) => {
    const result =
      schema <= 3 ? legacyCompletionRun(api, legacyPolicyForRecordSchema(schema)) : currentCompletionRun(api, schema);
    assert.equal(result.schema, schema);
    if (schema >= 5) api.validateCurrentReviewRunResult(result);
    api.validateCompletionRunResult(result);
  };
  const draftReceipt = (schema) => {
    const fixture =
      schema <= 3
        ? { receipt: legacyDraftReceipt(api, legacyPolicyForRecordSchema(schema)), orchestration: null }
        : currentReceipt(api, schema);
    assert.equal(fixture.receipt.schema, schema);
    if (schema <= 3) {
      api.validateDraftReceipt(fixture.receipt, H1);
      return;
    }
    const options = schema === 6 ? { orchestration: fixture.orchestration } : {};
    api.validateCurrentReviewReceipt(fixture.receipt, H1, options);
    api.validateDraftReceipt(fixture.receipt, H1, options);
  };
  const completionReceipt = (schema) => {
    const fixture =
      schema <= 3
        ? {
            receipt: legacyCompletionReceipt(api, legacyPolicyForRecordSchema(schema)),
            orchestration: null,
          }
        : currentCompletionReceipt(api, schema);
    assert.equal(fixture.receipt.schema, schema);
    if (schema <= 3) {
      api.validateCompletionReceipt(fixture.receipt);
      return;
    }
    const options = schema === 6 ? { orchestration: fixture.orchestration } : {};
    api.validateCurrentReviewReceipt(fixture.receipt, {}, options);
    api.validateCompletionReceipt(fixture.receipt, {}, options);
  };

  const malformedRequest = currentRequest(api, 5);
  const malformedOutput = currentOutput(malformedRequest);
  return {
    parse_canonical: capturedOutcome(() => {
      const parsed = api.parsePlan(sample);
      assert.equal(parsed.frontmatter.status, 'planned');
      api.canonicalPlanView(sample);
      const acceptance = api.acceptanceInventory(sample);
      api.validateAcceptanceInventory(acceptance);
      api.completionStablePlanViewV1(sample);
      assert.equal(api.jcs({ b: 2, a: 1 }), '{"a":1,"b":2}');
      api.sha256(api.jcs(acceptance));
    }),
    workflow_model: outcomeMatrix([1, 2], (schema) => {
      api.validateWorkflowModelRecord(workflowRecord(schema));
    }),
    policy: outcomeMatrix([1, 2, 3, 4, 5, 6], (schema) => {
      const policy = schema <= 4 ? legacyPolicy(schema) : currentPolicy(schema);
      assert.equal(policy.schema, schema);
      api.validatePolicy(policy);
      if (schema >= 5) api.validateCurrentPolicy(policy);
    }),
    request: outcomeMatrix([1, 2, 3, 5, 6], (schema) => {
      const request =
        schema <= 3 ? legacyRequest(api, legacyPolicyForRecordSchema(schema)) : currentRequest(api, schema);
      assert.equal(request.schema, schema);
      api.validateRequest(request);
    }),
    review_record: outcomeMatrix([1, 2, 3, 5, 6], (schema) => {
      if (schema <= 3) legacyRecord(schema);
      else currentRecord(schema);
    }),
    review_series: outcomeMatrix([3, 5, 6], (schema) => {
      const series = schema === 3 ? legacySeries(api) : currentSeries(api, schema);
      assert.equal(series.schema, schema);
      if (schema >= 5) api.validateCurrentReviewSeries(series);
      api.validateReviewSeries(series);
    }),
    draft_result: outcomeMatrix([1, 2, 3, 5, 6], draftResult),
    completion_result: outcomeMatrix([1, 2, 3, 5, 6], completionResult),
    draft_receipt: outcomeMatrix([1, 2, 3, 5, 6], draftReceipt),
    completion_receipt: outcomeMatrix([1, 2, 3, 5, 6], completionReceipt),
    draft_reuse: capturedOutcome(() => {
      api.validateDraftReviewReuse({
        receipt: legacyDraftReceipt(api, 4),
        expectedInput: H1,
        expectedPolicy: legacyPolicy(4),
      });
    }),
    reconciliation: capturedOutcome(() => {
      api.validateReconciliation({ accepted: [], rejected: [] }, []);
    }),
    orchestration_family: capturedOutcome(() => {
      api.validateCanonicalOrchestrationFamily(new Map());
    }),
    waiver: {
      legacy: capturedOutcome(() => api.validateWaivers([legacyWaiver()], 'draft', H1)),
      current: capturedOutcome(() => api.validateCurrentWaivers([currentWaiver()], 'draft', H1)),
    },
    classifiers: {
      completion: api.deriveCompletionVerdict(
        legacyCompletionRun(api, 4).primary,
        acceptanceInventoryFixture(),
        legacyCompletionRun(api, 4).X,
        legacyCompletionRun(api, 4).S,
      ),
      leg: api.classifyLeg({
        leg: 'S',
        policy: legacyPolicy(4),
        attempts: legacyRaw(api, legacyRequest(api, 4), 'S').attempts,
        eligibleTierCount: 1,
      }),
    },
    malformed: {
      workflow_model_unknown_key: capturedOutcome(() => {
        api.validateWorkflowModelRecord({ ...workflowRecord(1), unexpected: true });
      }),
      empty_acceptance_inventory: capturedOutcome(() => {
        api.validateAcceptanceInventory({ schema: 1, criteria: [] });
      }),
      current_output_verdict: capturedOutcome(() => {
        api.validateCurrentReviewerOutput({ ...malformedOutput, verdict: 'repair' }, malformedRequest);
      }),
      current_raw_selection: capturedOutcome(() => {
        api.validateCurrentRawReview({ ...currentRaw(api, malformedRequest), selected: null }, malformedRequest);
      }),
      legacy_series_repair: capturedOutcome(() => {
        api.validateReviewSeries({ ...legacySeries(api), repairs: [{}] });
      }),
      stale_draft_receipt: capturedOutcome(() => {
        api.validateDraftReceipt(legacyDraftReceipt(api, 4), H2);
      }),
    },
  };
}

function markdownFiles(directory) {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...markdownFiles(absolute));
    else if (entry.isFile() && entry.name.endsWith('.md')) files.push(absolute);
  }
  return files.sort();
}

function trackedRecordOutcomes(api, root, inventory) {
  const outcomes = [];
  const quarantined = new Set(inventory.tracked_corpus.known_quarantined);
  for (const relativeRoot of inventory.tracked_corpus.roots) {
    for (const absolute of markdownFiles(path.join(root, relativeRoot))) {
      const bytes = fs.readFileSync(absolute);
      if (!RECORD.test(bytes.toString())) continue;
      const relative = path.relative(root, absolute);
      try {
        api.canonicalPlanView(bytes);
        const result = { path: relative, outcome: 'pass' };
        result.sha256 = sha256Bytes(bytes);
        if (quarantined.has(relative)) {
          result.quarantine = classifyLegacyPlan(bytes).classification;
        }
        outcomes.push(result);
      } catch (error) {
        outcomes.push({
          sha256: sha256Bytes(bytes),
          path: relative,
          outcome: 'fail',
          reason: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }
  return outcomes;
}

function driftedPlanBytes(api, options) {
  const { receipt, orchestration } = driftedSchema6Receipt(api, options);
  return legacyPlan([`Review-orchestration-state: ${api.jcs(orchestration)}`, `Review-receipt: ${api.jcs(receipt)}`], {
    status: 'finished',
  });
}

function driftInputCodec(api, bytes) {
  const text = bytes.toString('utf8');
  if (!Buffer.from(text, 'utf8').equals(bytes)) return 'unknown_bytes';
  if (RECORD.test(text)) return 'legacy_plan_utf8';
  try {
    if (api.jcs(JSON.parse(text)) === text) return 'current_policy_jcs_utf8';
  } catch {
    return 'unknown_utf8';
  }
  return 'unknown_utf8';
}

function driftExceptionOutcomes(api) {
  const complete = driftedPlanBytes(api);
  const partial = driftedPlanBytes(api, {
    policy: { ...currentPolicy(6), fallback: 'availability_only' },
  });
  const cancelled = driftedPlanBytes(api, {
    mutateRun: (run) => {
      run.reviewer.raw.attempts[0].reason = 'user_cancelled';
    },
  });
  const policyBytes = Buffer.from(api.jcs(DRIFTED_SCHEMA6_POLICY), 'utf8');
  const policyClassification = () =>
    capturedOutcome(() => api.validateCurrentPolicy(structuredClone(DRIFTED_SCHEMA6_POLICY)));

  const completeResult = classifyLegacyPlan(complete);
  const partialResult = classifyLegacyPlan(partial);
  const cancelledResult = classifyLegacyPlan(cancelled);
  const outsideClassification = policyClassification();
  try {
    api.withLegacyClassification(() => {
      throw new Error('body failed');
    });
  } catch (error) {
    assert.match(error instanceof Error ? error.message : String(error), /body failed/);
  }

  return [
    {
      name: 'complete_drifted_settled',
      codec: driftInputCodec(api, complete),
      sha256: sha256Bytes(complete),
      classification: completeResult.classification,
    },
    {
      name: 'partial_drift_fallback',
      codec: driftInputCodec(api, partial),
      sha256: sha256Bytes(partial),
      classification: partialResult.classification,
    },
    {
      name: 'cancelled_drifted_family',
      codec: driftInputCodec(api, cancelled),
      sha256: sha256Bytes(cancelled),
      classification: cancelledResult.classification,
    },
    {
      name: 'outside_classification_scope',
      codec: driftInputCodec(api, policyBytes),
      sha256: sha256Bytes(policyBytes),
      classification: outsideClassification,
    },
    {
      name: 'throwing_scope_restoration',
      codec: driftInputCodec(api, policyBytes),
      sha256: sha256Bytes(policyBytes),
      classification: policyClassification(),
    },
  ];
}

export function registerHistoricalCharacterization(suite, api, { root }) {
  const inventory = readInventory(root);

  suite.test('historical', 'legacy helper identity and frozen export inventory are exact', async () => {
    const names = Object.values(inventory.categories).flat();
    assert.equal(new Set(names).size, names.length, 'inventory has no duplicated export ownership');
    const inventoriedApi = await import(pathToFileURL(path.join(root, inventory.helper)).href);
    assert.deepEqual(
      {
        helper: api === inventoriedApi ? inventory.helper : null,
        exports: Object.keys(api).sort(),
      },
      {
        helper: inventory.helper,
        exports: [...names].sort(),
      },
      'loaded helper identity and read-only exports must match the frozen inventory',
    );
    assert.deepEqual(inventory.schema_matrix, {
      policy: [1, 2, 3, 4, 5, 6],
      request: [1, 2, 3, 5, 6],
      review_record: [1, 2, 3, 5, 6],
      workflow_model: [1, 2],
      acceptance_inventory: [1],
      review_series: [3, 5, 6],
    });
  });

  suite.test('historical', 'every retained fixture outcome matches the explicit inventory', () => {
    assert.deepEqual(fixtureOutcomes(api, root), inventory.fixture_outcomes);
  });

  suite.test('historical', 'parse, canonical, and acceptance behavior is retained', () => {
    const sample = fs.readFileSync(path.join(root, 'scripts/tests/fixtures/plan-review-policy/sample-plan.md'));
    const parsed = api.parsePlan(sample);
    assert.equal(parsed.frontmatter.status, 'planned');
    assert.match(api.canonicalPlanView(sample), /Ordinary self-review prose remains canonical/);
    const acceptance = api.acceptanceInventory(sample);
    api.validateAcceptanceInventory(acceptance);
    assert.doesNotMatch(api.completionStablePlanViewV1(sample), /^## Review$/m);
    assert.equal(api.jcs({ b: 2, a: 1 }), '{"a":1,"b":2}');
    expectThrow(() => api.jcs({ invalid: '\ud800' }), /surrogate/i);
  });

  suite.test('historical', 'policy and request schemas one through six retain pass/fail closure', () => {
    for (const schema of [1, 2, 3, 4]) api.validatePolicy(legacyPolicy(schema));
    for (const schema of [5, 6]) {
      api.validatePolicy(currentPolicy(schema));
      api.validateCurrentPolicy(currentPolicy(schema));
    }
    for (const policySchema of [1, 2, 3, 4]) api.validateRequest(legacyRequest(api, policySchema));
    for (const schema of [5, 6]) api.validateRequest(currentRequest(api, schema));
    for (const schema of [1, 2]) api.validateWorkflowModelRecord(workflowRecord(schema));
    expectThrow(() => api.validatePolicy({ ...legacyPolicy(4), unknown: true }), /unknown/i);
    expectThrow(() => api.validateRequest({ ...currentRequest(api, 6), unknown: true }), /unknown/i);
  });

  suite.test('historical', 'reviewer output, raw review, and attempt schemas remain differential fixtures', () => {
    for (const policySchema of [1, 3, 4]) {
      const request = legacyRequest(api, policySchema);
      const output = legacyOutput(request);
      api.validateReviewerOutput(output, request, 'S');
      api.validateRawLeg(legacyRaw(api, request), request, 'S');
    }
    for (const schema of [5, 6]) {
      const request = currentRequest(api, schema);
      const output = currentOutput(request);
      api.validateReviewerOutput(output, request, 'primary');
      api.validateCurrentReviewerOutput(output, request);
      api.validateCurrentAttemptSequence([currentAttempt(request)], request.policy);
      api.validateCurrentRawReview(currentRaw(api, request), request);
    }
    expectThrow(() => {
      const request = currentRequest(api, 5);
      api.validateCurrentAttemptSequence([currentAttempt(request, { timeout_seconds: 601 })], request.policy);
    }, /timeout|600/i);
  });

  suite.test('historical', 'series, reconciliation, and waiver schemas retain exact bounds', () => {
    api.validateReconciliation({ accepted: [], rejected: [] }, []);
    api.validateReviewSeries(legacySeries(api));
    api.validateWaivers([legacyWaiver()], 'draft', H1);
    for (const schema of [5, 6]) {
      const series = currentSeries(api, schema);
      api.validateCurrentReviewSeries(series);
      api.validateReviewSeries(series);
    }
    api.validateCurrentWaivers([currentWaiver()], 'draft', H1);
    expectThrow(() => api.validateWaivers([legacyWaiver(), legacyWaiver()], 'draft', H1), /duplicate/i);
  });

  suite.test('historical', 'run and receipt validators preserve schemas one, two, three, five, and six', () => {
    for (const policySchema of [1, 3, 4]) {
      const draft = legacyDraftRun(api, policySchema);
      const completion = legacyCompletionRun(api, policySchema);
      api.validateDraftRunResult(draft);
      api.validateCompletionRunResult(completion);
      api.validateDraftReceipt(legacyDraftReceipt(api, policySchema), H1);
      api.validateCompletionReceipt(legacyCompletionReceipt(api, policySchema));
    }
    for (const schema of [5, 6]) {
      const draft = currentRun(api, schema);
      const completion = currentCompletionRun(api, schema);
      api.validateCurrentReviewRunResult(draft);
      api.validateCurrentReviewRunResult(completion);
      api.validateDraftRunResult(draft);
      api.validateCompletionRunResult(completion);
      const draftFixture = currentReceipt(api, schema);
      const completionFixture = currentCompletionReceipt(api, schema);
      const options = schema === 6 ? { orchestration: draftFixture.orchestration } : {};
      const completionOptions = schema === 6 ? { orchestration: completionFixture.orchestration } : {};
      api.validateCurrentReviewReceipt(draftFixture.receipt, H1, options);
      api.validateDraftReceipt(draftFixture.receipt, H1, options);
      api.validateCurrentReviewReceipt(completionFixture.receipt, {}, completionOptions);
      api.validateCompletionReceipt(completionFixture.receipt, {}, completionOptions);
    }
    api.validateDraftReviewReuse({
      receipt: legacyDraftReceipt(api, 4),
      expectedInput: H1,
      expectedPolicy: legacyPolicy(4),
    });
    assert.equal(
      api.deriveCompletionVerdict(
        legacyCompletionRun(api, 4).primary,
        acceptanceInventoryFixture(),
        legacyCompletionRun(api, 4).X,
        legacyCompletionRun(api, 4).S,
      ),
      'passed',
    );
  });

  suite.test('historical', 'the five drift exceptions retain closed golden outcomes', () => {
    assert.deepEqual(
      inventory.drift_exceptions.map(({ name }) => name),
      DRIFT_EXCEPTION_NAMES,
      'the named drift-exception golden set must remain closed',
    );
    assert.deepEqual(driftExceptionOutcomes(api), inventory.drift_exceptions);
  });

  suite.test('historical', 'every tracked machine-record result matches the frozen inventory', () => {
    const outcomes = trackedRecordOutcomes(api, root, inventory);
    const expectedByPath = new Map(
      inventory.tracked_corpus.expected_outcomes.map((outcome) => [outcome.path, outcome]),
    );
    for (const outcome of outcomes) {
      const expected = expectedByPath.get(outcome.path);
      assert.ok(expected, `${outcome.path} must have a tracked historical golden`);
      assert.equal(outcome.sha256, expected.sha256, `${outcome.path} exact UTF-8 input SHA-256`);
    }
    assert.deepEqual(outcomes, inventory.tracked_corpus.expected_outcomes);
    assert.deepEqual(
      outcomes.filter((result) => result.quarantine).map((result) => result.path),
      inventory.tracked_corpus.known_quarantined,
    );
  });

  suite.test('historical', 'all frozen malformed mutations are independently detected', async () => {
    const outcomes = await runHistoricalMalformedCorpus();
    assert.equal(outcomes.length, inventory.existing_mutation_catalog.expected_case_count);
    assert.equal(new Set(outcomes.map(({ id }) => id)).size, outcomes.length);
    assert.ok(
      outcomes.every(({ outcome }) => outcome === inventory.existing_mutation_catalog.expected_mutant_outcome),
      'every frozen mutation must trigger its independent malformed-record oracle',
    );
    for (const outcome of outcomes) {
      assert.deepEqual(
        Object.keys(outcome).sort(),
        ['harness', 'id', 'outcome', 'selector'],
        `${outcome.id} malformed outcome shape`,
      );
      assert.equal(typeof outcome.harness, 'string');
      assert.equal(typeof outcome.selector, 'string');
    }
  });

  suite.test('historical', 'malformed records are rejected without mutating their inputs', () => {
    const request = currentRequest(api, 5);
    const cases = [
      {
        value: { ...workflowRecord(1), unexpected: true },
        validate: (value) => api.validateWorkflowModelRecord(value),
      },
      {
        value: { schema: 1, criteria: [] },
        validate: (value) => api.validateAcceptanceInventory(value),
      },
      {
        value: { ...currentOutput(request), verdict: 'repair' },
        validate: (value) => api.validateCurrentReviewerOutput(value, request),
      },
      {
        value: { ...currentRaw(api, request), selected: null },
        validate: (value) => api.validateCurrentRawReview(value, request),
      },
      {
        value: { ...legacySeries(api), repairs: [{}] },
        validate: (value) => api.validateReviewSeries(value),
      },
      {
        value: legacyDraftReceipt(api, 4),
        validate: (value) => api.validateDraftReceipt(value, H2),
      },
    ];
    for (const { value, validate } of cases) {
      const before = clone(value);
      expectThrow(() => validate(value), /./);
      assert.deepEqual(value, before);
    }
  });
}
