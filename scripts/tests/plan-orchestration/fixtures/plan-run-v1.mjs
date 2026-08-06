export const HASHES = Object.freeze({
  acceptanceSource: 'a'.repeat(64),
  blocker: 'b'.repeat(64),
  failure: 'c'.repeat(64),
  input: 'd'.repeat(64),
  input2: 'e'.repeat(64),
  input3: '9'.repeat(64),
  plan: 'f'.repeat(64),
  result: '1'.repeat(64),
  source: '2'.repeat(64),
  verification: '3'.repeat(64),
});

export const REVIEW_CLASSES = Object.freeze({
  missingDecision: 'v1_missing_decision',
  contractContradiction: 'v1_contract_contradiction',
  evidenceMismatch: 'v1_evidence_mismatch',
  unstableStepReference: 'v1_unstable_step_reference',
  unauthorizedEffect: 'v1_unauthorized_effect',
  missingSafetyBoundary: 'v1_missing_safety_boundary',
  affectedPathsIncomplete: 'v1_affected_paths_incomplete',
  acceptanceCommandNotRunnable: 'v1_acceptance_command_not_runnable',
  acceptanceOutputMismatch: 'v1_acceptance_output_mismatch',
  acceptanceCoverageIncomplete: 'v1_acceptance_coverage_incomplete',
  failureActionMissing: 'v1_failure_action_missing',
});

export const REVIEW_INPUTS = Object.freeze(['1'.padStart(64, '0'), '2'.padStart(64, '0')]);

export const IDS = Object.freeze({
  goal: '11111111-1111-4111-8111-111111111111',
  run: '22222222-2222-4222-8222-222222222222',
  otherRun: '33333333-3333-4333-8333-333333333333',
});

export const REPOSITORY_ID = 'docks:/fixture/repository';
export const PLAN_PATH = 'docs/plans/active/autonomous-controller.md';
export const IMPLEMENTATION_COMMIT = '4'.repeat(40);
export const SOURCE_BASE = '5'.repeat(40);

export function reviewPhase(state = 'not_started', overrides = {}) {
  const defaults = {
    not_required: { invocations: 0, input_sha256: null, result_sha256: null },
    not_started: { invocations: 0, input_sha256: null, result_sha256: null },
    reserved: { invocations: 1, input_sha256: HASHES.input, result_sha256: null },
    transport_retried: { invocations: 1, input_sha256: HASHES.input2, result_sha256: null },
    retryable: { invocations: 0, input_sha256: HASHES.input, result_sha256: HASHES.failure },
    repairing: { invocations: 1, input_sha256: HASHES.input, result_sha256: HASHES.result },
    passed: { invocations: 1, input_sha256: HASHES.input, result_sha256: HASHES.result },
    degraded: { invocations: 2, input_sha256: HASHES.input, result_sha256: HASHES.failure },
    blocked: { invocations: 1, input_sha256: HASHES.input, result_sha256: HASHES.result },
    cancelled: { invocations: 1, input_sha256: HASHES.input, result_sha256: HASHES.result },
  };
  return { state, ...defaults[state], ...overrides };
}

export function acceptance(overrides = {}) {
  return {
    source_sha256: HASHES.acceptanceSource,
    verification_sha256: HASHES.verification,
    ...overrides,
  };
}

export function blocker(kind = 'verification_failed', overrides = {}) {
  return { kind, evidence_sha256: HASHES.blocker, ...overrides };
}

export function planRun(overrides = {}) {
  return {
    schema: 1,
    goal_id: IDS.goal,
    run_id: IDS.run,
    repository_id: REPOSITORY_ID,
    plan_path: PLAN_PATH,
    requested_effects: ['local'],
    risk: 'local',
    plan_sha256: HASHES.plan,
    source_base: SOURCE_BASE,
    source_sha256: HASHES.source,
    draft_review: reviewPhase('not_started'),
    execution_parent: null,
    implementation_commit: null,
    completion_review: reviewPhase('not_started'),
    acceptance: null,
    blocker: null,
    ...overrides,
  };
}

export const REVIEW_INVALID_INPUT_REASONS = Object.freeze([
  'bundle_unavailable',
  'bundle_integrity_failed',
  'bundle_binding_mismatch',
]);

function reviewEventBindings(current, phase) {
  return {
    run_id: current.run.run_id,
    invocation: current.run[phase].invocations,
    input_sha256: current.run[phase].input_sha256,
  };
}

export function reviewResultEvent(current, type, phase, overrides = {}) {
  return {
    type,
    phase,
    result_sha256: HASHES.result,
    ...reviewEventBindings(current, phase),
    ...overrides,
  };
}

export function reviewInvalidInput(reason = REVIEW_INVALID_INPUT_REASONS[0], overrides = {}) {
  return {
    schema: 1,
    error: 'invalid_input',
    reason,
    ...overrides,
  };
}

export function reviewInvalidInputEvent(current, phase, reason, overrides = {}) {
  return {
    type: 'review_invalid_input',
    phase,
    result: reviewInvalidInput(reason),
    ...reviewEventBindings(current, phase),
    ...overrides,
  };
}

export function tuple(status, overrides = {}) {
  const risk = overrides.risk ?? 'local';
  const runOverrides = { risk, ...overrides };
  delete runOverrides.status;
  if (risk !== 'local' && !Object.hasOwn(runOverrides, 'requested_effects')) {
    runOverrides.requested_effects = ['local', risk === 'external' ? 'release' : 'production_access'];
  }
  return { status, run: planRun(runOverrides) };
}

export function renderPlan({ status = 'drafting', run = null, jcs = JSON.stringify, body = null } = {}) {
  const record = run === null ? '' : `\nPlan-run: ${jcs(run)}\n`;
  const planBody =
    body ??
    `# Autonomous controller fixture\n\n## Goal\n\nImplement and verify one bounded local change.\n\n## Steps\n\n| # | Task | Files | Depends | Effect | Status |\n|---|---|---|---|---|---|\n| 1 | Change fixture | \`src/tracked.txt\` | — | local | planned |\n\n## Acceptance criteria\n\n| ID | Command | Expected |\n|---|---|---|\n| A1 | \`node fixture.mjs\` | Exit 0 |\n${record}\n## Verification Results\n\nManager-written output that is excluded from plan identity.\n\n## Review\n\nFresh reviewer output that is excluded from plan identity.\n`;
  return Buffer.from(
    `---\ntitle: Autonomous controller fixture\ngoal: Implement and verify one bounded local change.\nstatus: ${status}\ncreated: "2026-07-24T00:00:00Z"\nupdated: "2026-07-24T00:00:00Z"\nstarted_at: null\nfinished_at: null\naffected_paths:\n  - src/tracked.txt\n  - src/untracked.txt\n---\n\n${planBody}`,
  );
}

// The lifecycle stamps sit outside `canonicalPlanView`, so setting them moves no
// `plan_sha256` and a bound fixture stays valid.
export function withStamps(bytes, startedAt, finishedAt) {
  return Buffer.from(
    bytes
      .toString()
      .replace('started_at: null', `started_at: ${startedAt}`)
      .replace('finished_at: null', `finished_at: ${finishedAt}`),
  );
}

export function bindPlan(api, tupleValue, { acceptanceManifest: liveAcceptanceManifest } = {}) {
  const unbound = renderPlan({ status: tupleValue.status, run: tupleValue.run, jcs: api.jcs });
  const paths = [{ path: 'src/tracked.txt', state: 'missing', kind: null, mode: null, sha256: null }];
  const acceptanceManifest = liveAcceptanceManifest ?? {
    schema: 1,
    source_base: SOURCE_BASE,
    source_sha256: api.sha256(api.jcs({ schema: 1, source_base: SOURCE_BASE, paths })),
    paths,
  };
  const boundAcceptance =
    tupleValue.run.acceptance === null
      ? null
      : {
          ...tupleValue.run.acceptance,
          source_sha256: acceptanceManifest.source_sha256,
          verification_sha256: api.sha256(api.canonicalVerificationResults(unbound)),
        };
  const bound = {
    ...tupleValue.run,
    acceptance: boundAcceptance,
    plan_sha256: api.sha256(api.canonicalPlanView(unbound)),
  };
  return {
    acceptanceManifest,
    bytes: renderPlan({ status: tupleValue.status, run: bound, jcs: api.jcs }),
    run: bound,
    status: tupleValue.status,
  };
}

export function validTupleCatalog() {
  const localDraftStates = [
    'not_started',
    'reserved',
    'transport_retried',
    'retryable',
    'repairing',
    'passed',
    'degraded',
  ];
  const catalog = localDraftStates.map((state) => tuple('drafting', { draft_review: reviewPhase(state) }));
  for (const risk of ['sensitive', 'external']) {
    for (const state of ['not_started', 'reserved', 'transport_retried', 'retryable', 'repairing', 'passed']) {
      catalog.push(
        tuple('drafting', {
          risk,
          draft_review: reviewPhase(state),
          completion_review: reviewPhase('not_started'),
        }),
      );
    }
  }
  for (const status of ['planned', 'scheduled']) {
    catalog.push(tuple(status, { draft_review: reviewPhase('passed') }));
    catalog.push(tuple(status, { draft_review: reviewPhase('degraded') }));
    for (const risk of ['sensitive', 'external']) {
      catalog.push(
        tuple(status, {
          risk,
          draft_review: reviewPhase('passed'),
          completion_review: reviewPhase('not_started'),
        }),
      );
    }
  }
  catalog.push(
    tuple('ongoing', {
      draft_review: reviewPhase('passed'),
      execution_parent: SOURCE_BASE,
    }),
    tuple('ongoing', {
      draft_review: reviewPhase('degraded'),
      execution_parent: SOURCE_BASE,
    }),
  );
  // Local completion is active exactly as sensitive completion is, minus the
  // repair budget: one substantive permit, so `repairing` never appears.
  for (const state of ['reserved', 'transport_retried', 'retryable', 'passed']) {
    catalog.push(
      tuple('ongoing', {
        draft_review: reviewPhase('not_required'),
        execution_parent: SOURCE_BASE,
        implementation_commit: IMPLEMENTATION_COMMIT,
        completion_review: reviewPhase(state),
        acceptance: acceptance(),
      }),
    );
  }
  for (const risk of ['sensitive', 'external']) {
    catalog.push(
      tuple('ongoing', {
        risk,
        draft_review: reviewPhase('passed'),
        execution_parent: SOURCE_BASE,
        completion_review: reviewPhase('not_started'),
      }),
    );
    for (const state of ['reserved', 'transport_retried', 'retryable', 'repairing', 'passed']) {
      catalog.push(
        tuple('ongoing', {
          risk,
          draft_review: reviewPhase('passed'),
          execution_parent: SOURCE_BASE,
          implementation_commit: IMPLEMENTATION_COMMIT,
          completion_review: reviewPhase(state),
          acceptance: acceptance(),
        }),
      );
    }
  }
  catalog.push(
    tuple('blocked', {
      draft_review: reviewPhase('blocked'),
      blocker: blocker('review_failed'),
    }),
    tuple('blocked', {
      draft_review: reviewPhase('passed'),
      execution_parent: SOURCE_BASE,
      blocker: blocker('verification_failed'),
    }),
    tuple('blocked', {
      draft_review: reviewPhase('not_required'),
      execution_parent: SOURCE_BASE,
      implementation_commit: IMPLEMENTATION_COMMIT,
      completion_review: reviewPhase('passed'),
      acceptance: acceptance(),
      blocker: blocker('concurrent_change'),
    }),
    tuple('blocked', {
      draft_review: reviewPhase('not_required'),
      execution_parent: SOURCE_BASE,
      implementation_commit: IMPLEMENTATION_COMMIT,
      completion_review: reviewPhase('blocked'),
      acceptance: acceptance(),
      blocker: blocker('review_failed'),
    }),
    tuple('blocked', {
      draft_review: reviewPhase('not_required'),
      execution_parent: SOURCE_BASE,
      implementation_commit: IMPLEMENTATION_COMMIT,
      completion_review: reviewPhase('cancelled'),
      acceptance: acceptance(),
      blocker: blocker('user_cancelled'),
    }),
  );
  for (const risk of ['sensitive', 'external']) {
    catalog.push(
      tuple('blocked', {
        risk,
        draft_review: reviewPhase('not_started'),
        completion_review: reviewPhase('not_started'),
        blocker: blocker('user_decision'),
      }),
      tuple('blocked', {
        risk,
        draft_review: reviewPhase('passed'),
        execution_parent: SOURCE_BASE,
        completion_review: reviewPhase('not_started'),
        blocker: blocker('verification_failed'),
      }),
    );
    for (const state of ['blocked', 'cancelled']) {
      catalog.push(
        tuple('blocked', {
          risk,
          draft_review: reviewPhase('passed'),
          execution_parent: SOURCE_BASE,
          implementation_commit: IMPLEMENTATION_COMMIT,
          completion_review: reviewPhase(state),
          acceptance: acceptance(),
          blocker: blocker(state === 'cancelled' ? 'user_cancelled' : 'review_failed'),
        }),
      );
    }
    catalog.push(
      tuple('blocked', {
        risk,
        draft_review: reviewPhase('passed'),
        execution_parent: SOURCE_BASE,
        implementation_commit: IMPLEMENTATION_COMMIT,
        completion_review: reviewPhase('passed'),
        acceptance: acceptance(),
        blocker: blocker('missing_authority'),
      }),
    );
  }
  catalog.push(
    tuple('finished', {
      draft_review: reviewPhase('passed'),
      execution_parent: SOURCE_BASE,
      implementation_commit: IMPLEMENTATION_COMMIT,
      completion_review: reviewPhase('passed'),
      acceptance: acceptance(),
    }),
    tuple('finished', {
      draft_review: reviewPhase('degraded'),
      execution_parent: SOURCE_BASE,
      implementation_commit: IMPLEMENTATION_COMMIT,
      completion_review: reviewPhase('passed'),
      acceptance: acceptance(),
    }),
    tuple('finished', {
      draft_review: reviewPhase('not_required'),
      execution_parent: SOURCE_BASE,
      implementation_commit: IMPLEMENTATION_COMMIT,
      completion_review: reviewPhase('passed'),
      acceptance: acceptance(),
    }),
  );
  for (const risk of ['sensitive', 'external']) {
    catalog.push(
      tuple('finished', {
        risk,
        draft_review: reviewPhase('passed'),
        execution_parent: SOURCE_BASE,
        implementation_commit: IMPLEMENTATION_COMMIT,
        completion_review: reviewPhase('passed'),
        acceptance: acceptance(),
      }),
    );
  }
  return catalog;
}
