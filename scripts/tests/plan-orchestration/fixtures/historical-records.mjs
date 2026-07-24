export const H0 = '0'.repeat(64);
export const H1 = '1'.repeat(64);
export const H2 = '2'.repeat(64);
export const H3 = '3'.repeat(64);
export const C0 = '0'.repeat(40);
export const C1 = '1'.repeat(40);
export const UUID1 = '123e4567-e89b-42d3-a456-426614174000';
export const UUID2 = '223e4567-e89b-42d3-a456-426614174000';

const LEGACY_BASE = {
  cross_company_consent: 'always',
  zero_reviewer_policy: 'ask',
  orchestrator_preference: 'auto',
};

function provenance(schema) {
  return {
    cross_company_consent: 'skill_default',
    zero_reviewer_policy: 'skill_default',
    orchestrator_preference: 'skill_default',
    ...(schema >= 2 ? { minimum_score: 'skill_default', max_rounds: 'skill_default' } : {}),
    openai_tiers: 'skill_default',
    anthropic_tiers: 'skill_default',
  };
}

export function legacyPolicy(schema) {
  const tiered = schema >= 3;
  return {
    schema,
    ...LEGACY_BASE,
    ...(schema >= 2 ? { minimum_score: 90, max_rounds: schema === 4 ? 5 : 3 } : {}),
    openai_tiers: [
      {
        model: 'gpt-5.6-sol',
        effort: 'high',
        ...(tiered ? { service_tier: 'default' } : {}),
        transports: [tiered ? 'cli' : 'in_session', ...(tiered ? [] : ['cli'])],
      },
    ],
    anthropic_tiers: [{ model: 'fable', effort: 'high', transports: ['in_session', 'cli'] }],
    provenance: provenance(schema),
  };
}

function recordSchemaForPolicy(schema) {
  if (schema === 4) return 3;
  if (schema === 3) return 2;
  return 1;
}

export function legacyRequest(api, policySchema, overrides = {}) {
  const policy = legacyPolicy(policySchema);
  const requestSchema = policySchema <= 2 ? 1 : policySchema === 3 ? 2 : 3;
  return {
    schema: requestSchema,
    request_id: UUID1,
    phase: 'draft',
    lifecycle_intent: 'none',
    reviewed_commit_or_head: C0,
    planned_at_commit: null,
    execution_base_commit: null,
    diff_sha256: null,
    acceptance_inventory_sha256: null,
    input_sha256: H1,
    bundle_sha256: H2,
    author: { company: 'openai', tool: 'codex', model: 'gpt-5.6-sol', effort: 'high' },
    policy,
    policy_sha256: api.sha256(api.jcs(policy)),
    ...(requestSchema === 3
      ? {
          review_mode: 'full',
          round_index: 1,
          previous_input_sha256: null,
          repair_targets_sha256: null,
        }
      : {}),
    ...overrides,
  };
}

function legacyAttempt(recordSchema, candidate) {
  return {
    schema: recordSchema,
    model: candidate.model,
    effort: candidate.effort,
    ...(recordSchema >= 2 && Object.hasOwn(candidate, 'service_tier') ? { service_tier: candidate.service_tier } : {}),
    transport: Object.hasOwn(candidate, 'service_tier') ? 'cli' : 'in_session',
    started: true,
    output_started: true,
    result: 'passed',
    exit_code: 0,
    signal: null,
    child_id: `legacy-${recordSchema}`,
    denial_source: null,
    retry_cause: null,
    timeout_mode: 'orchestrator_tool',
    timeout_seconds: 600,
    reason: 'fixture review completed',
    stdout_sha256: H0,
    stderr_sha256: H1,
  };
}

function rubric() {
  return {
    standalone_executability: 22,
    actionability: 16,
    dependency_order: 12,
    evidence_reverify: 10,
    goal_coverage: 12,
    executable_acceptance: 12,
    failure_mode: 10,
    assumption_to_question: 6,
  };
}

export function legacyOutput(request, leg = 'S', overrides = {}) {
  const schema = recordSchemaForPolicy(request.policy.schema);
  return {
    schema,
    leg,
    request,
    verdict: 'ready',
    score: 100,
    ...(schema === 3 ? { rubric: rubric() } : {}),
    findings: [],
    confirmations: ['historical fixture reviewed'],
    ...overrides,
  };
}

function reviewerProjection(api, output) {
  return {
    verdict: output.verdict,
    score: output.score,
    ...(Object.hasOwn(output, 'rubric') ? { rubric: output.rubric } : {}),
    confirmations: output.confirmations,
    structured_output_sha256: api.sha256(api.jcs(output)),
  };
}

export function legacyRaw(api, request, leg = 'S') {
  const schema = recordSchemaForPolicy(request.policy.schema);
  const company = leg === 'S' ? request.author.company : 'anthropic';
  const candidate = request.policy[`${company}_tiers`][0];
  const output = legacyOutput(request, leg);
  const attempt = legacyAttempt(schema, candidate);
  return {
    schema,
    leg,
    request,
    result: 'passed',
    attempts: [attempt],
    selected: {
      model: candidate.model,
      effort: candidate.effort,
      ...(Object.hasOwn(candidate, 'service_tier') ? { service_tier: candidate.service_tier } : {}),
      transport: attempt.transport,
    },
    reviewer_output: reviewerProjection(api, output),
    findings: [],
    findings_sha256: api.sha256(api.jcs([])),
    severity_totals: { high: 0, medium: 0, low: 0 },
    waiver: null,
    waiver_sha256: null,
    decision_evidence: null,
    reason: null,
  };
}

export function persisted(raw) {
  return {
    request: raw.request,
    raw,
    reconciliation: { accepted: [], rejected: [] },
  };
}

export function acceptanceInventoryFixture() {
  return {
    schema: 1,
    criteria: [{ id: 'A1', command: 'node fixture.mjs', expected: 'Exit 0' }],
  };
}

export function primaryEvidence() {
  const inventory = acceptanceInventoryFixture();
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
    ci: { command: 'node fixture.mjs', exit_code: 0, first_failure: null, output_sha256: H1 },
    regressions: [],
    followups: [],
  };
}

export function legacyDraftRun(api, policySchema = 4) {
  const request = legacyRequest(api, policySchema);
  const X = legacyRaw(api, request, 'X');
  const S = legacyRaw(api, request, 'S');
  return {
    schema: recordSchemaForPolicy(policySchema),
    kind: 'draft',
    request,
    X,
    S,
    reproduced: [],
    decision_evidence: null,
    outcome: 'dual',
    pre_execution_eligible: true,
  };
}

export function legacyCompletionRun(api, policySchema = 4) {
  const inventory = acceptanceInventoryFixture();
  const request = legacyRequest(api, policySchema, {
    phase: 'completion',
    reviewed_commit_or_head: C1,
    planned_at_commit: C0,
    execution_base_commit: C0,
    diff_sha256: H3,
    acceptance_inventory_sha256: api.sha256(api.jcs(inventory)),
  });
  const X = legacyRaw(api, request, 'X');
  const S = legacyRaw(api, request, 'S');
  return {
    schema: recordSchemaForPolicy(policySchema),
    kind: 'completion',
    request,
    plan_input_sha256: request.input_sha256,
    diff_sha256: request.diff_sha256,
    acceptance_inventory: inventory,
    acceptance_inventory_sha256: request.acceptance_inventory_sha256,
    X,
    S,
    reproduced: [],
    decision_evidence: null,
    outcome: 'dual',
    primary: primaryEvidence(),
    completion_verdict: 'passed',
  };
}

export function legacyDraftReceipt(api, policySchema = 4) {
  const run = legacyDraftRun(api, policySchema);
  return {
    schema: run.schema,
    phase: 'draft',
    request: run.request,
    input_sha256: run.request.input_sha256,
    reviewed_commit: run.request.reviewed_commit_or_head,
    author: run.request.author,
    policy: run.request.policy,
    policy_sha256: run.request.policy_sha256,
    X: persisted(run.X),
    S: persisted(run.S),
    reproduced: run.reproduced,
    decision_evidence: run.decision_evidence,
    outcome: run.outcome,
    pre_execution_eligible: run.pre_execution_eligible,
    reviewed_at: '2026-07-20T00:00:00Z',
  };
}

export function legacyCompletionReceipt(api, policySchema = 4) {
  const run = legacyCompletionRun(api, policySchema);
  return {
    schema: run.schema,
    phase: 'completion',
    request: run.request,
    planned_at_commit: run.request.planned_at_commit,
    execution_base_commit: run.request.execution_base_commit,
    reviewed_head: run.request.reviewed_commit_or_head,
    diff_sha256: run.diff_sha256,
    plan_input_sha256: run.plan_input_sha256,
    acceptance_inventory: run.acceptance_inventory,
    acceptance_inventory_sha256: run.acceptance_inventory_sha256,
    author: run.request.author,
    policy: run.request.policy,
    policy_sha256: run.request.policy_sha256,
    X: persisted(run.X),
    S: persisted(run.S),
    reproduced: run.reproduced,
    decision_evidence: run.decision_evidence,
    primary: run.primary,
    completion_verdict: run.completion_verdict,
    outcome: run.outcome,
    reviewed_at: '2026-07-20T00:00:00Z',
  };
}

export function legacySeries(api) {
  const run = legacyDraftRun(api, 4);
  return {
    schema: 3,
    policy_sha256: run.request.policy_sha256,
    initial_input_sha256: run.request.input_sha256,
    current_input_sha256: run.request.input_sha256,
    rounds: [run],
    repairs: [],
  };
}

export function legacyWaiver() {
  return {
    phase: 'draft',
    input_sha256: H1,
    legs: ['X', 'S'],
    actor: 'fixture owner',
    reason: 'historical characterization only',
    at: '2026-07-20T00:00:00Z',
  };
}

export function currentPolicy(schema) {
  const candidate = {
    company: 'openai',
    tool: 'codex',
    model: 'gpt-5.6-sol',
    effort: 'high',
    service_tier: 'default',
  };
  return {
    schema,
    role: 'primary',
    fallback: schema === 6 ? 'none' : 'availability_only',
    max_rounds: 2,
    candidates: [candidate],
    provenance: {
      role: 'skill_default',
      fallback: 'skill_default',
      max_rounds: 'skill_default',
      candidates: schema === 6 ? 'runtime_global' : 'current_user',
    },
  };
}

export function currentRequest(api, schema, overrides = {}) {
  const policy = currentPolicy(schema);
  return {
    schema,
    request_id: UUID1,
    phase: 'draft',
    lifecycle_intent: 'none',
    reviewed_commit_or_head: C1,
    planned_at_commit: null,
    execution_base_commit: null,
    diff_sha256: null,
    acceptance_inventory_sha256: null,
    input_sha256: H1,
    bundle_sha256: H2,
    author: { company: 'openai', tool: 'codex', model: 'gpt-5.6-sol', effort: 'high' },
    policy,
    policy_sha256: api.sha256(api.jcs(policy)),
    review_mode: 'full',
    round_index: 1,
    previous_input_sha256: null,
    repair_targets_sha256: null,
    ...(schema === 6 ? { orchestration_series_id: UUID2, orchestration_state_sha256: H3 } : {}),
    ...overrides,
  };
}

const CURRENT_CRITERIA = [
  'standalone_executability',
  'actionability',
  'dependency_order',
  'evidence_reverification',
  'goal_coverage',
  'executable_acceptance',
  'failure_modes',
  'open_questions',
];

export function currentOutput(request, overrides = {}) {
  return {
    schema: request.schema,
    role: 'primary',
    request,
    verdict: 'pass',
    checklist: Object.fromEntries(
      CURRENT_CRITERIA.map((criterion) => [
        criterion,
        { status: 'pass', evidence: `${criterion} is grounded in the fixture` },
      ]),
    ),
    findings: [],
    ...overrides,
  };
}

export function currentAttempt(request, overrides = {}) {
  return {
    schema: request.schema,
    candidate: request.policy.candidates[0],
    started: true,
    output_started: true,
    child_id: `current-${request.schema}`,
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

export function currentRaw(api, request) {
  const output = currentOutput(request);
  return {
    schema: request.schema,
    role: 'primary',
    request,
    result: 'passed',
    attempts: [currentAttempt(request)],
    selected: request.policy.candidates[0],
    reviewer_output: output,
    findings_sha256: api.sha256(api.jcs(output.findings)),
    waiver: null,
    waiver_sha256: null,
    reason: null,
  };
}

export function currentRun(api, schema, overrides = {}) {
  const request = overrides.request ?? currentRequest(api, schema);
  const raw = currentRaw(api, request);
  return {
    schema,
    kind: 'draft',
    request,
    reviewer: { raw, accepted_finding_ids: [], rejected: [] },
    reproduced: [],
    outcome: 'passed',
    pre_execution_eligible: true,
    ...overrides,
  };
}

export function currentCompletionRun(api, schema) {
  const inventory = acceptanceInventoryFixture();
  const request = currentRequest(api, schema, {
    phase: 'completion',
    reviewed_commit_or_head: C1,
    planned_at_commit: C0,
    execution_base_commit: C0,
    diff_sha256: H3,
    acceptance_inventory_sha256: api.sha256(api.jcs(inventory)),
  });
  const raw = currentRaw(api, request);
  return {
    schema,
    kind: 'completion',
    request,
    plan_input_sha256: request.input_sha256,
    diff_sha256: request.diff_sha256,
    acceptance_inventory: inventory,
    acceptance_inventory_sha256: request.acceptance_inventory_sha256,
    reviewer: { raw, accepted_finding_ids: [], rejected: [] },
    reproduced: [],
    outcome: 'passed',
    primary: primaryEvidence(),
    completion_verdict: 'passed',
  };
}

export function currentCompletionSeries(api, schema) {
  const run = currentCompletionRun(api, schema);
  return {
    schema,
    ...(schema === 6 ? { orchestration_series_id: run.request.orchestration_series_id } : {}),
    policy_sha256: run.request.policy_sha256,
    initial_input_sha256: run.request.input_sha256,
    current_input_sha256: run.request.input_sha256,
    rounds: [run],
    repairs: [],
  };
}

export function currentSeries(api, schema) {
  const run = currentRun(api, schema);
  return {
    schema,
    ...(schema === 6 ? { orchestration_series_id: run.request.orchestration_series_id } : {}),
    policy_sha256: run.request.policy_sha256,
    initial_input_sha256: run.request.input_sha256,
    current_input_sha256: run.request.input_sha256,
    rounds: [run],
    repairs: [],
  };
}

export function settledOrchestration(api, series) {
  const run = series.rounds.at(-1);
  const fields = {
    schema: 2,
    plan_path: 'docs/plans/active/historical-fixture.md',
    phase: run.request.phase,
    lifecycle_intent: run.request.lifecycle_intent,
    initial_input_sha256: series.initial_input_sha256,
    current_input_sha256: series.current_input_sha256,
    orchestration_attempt: 1,
    series_id: series.orchestration_series_id,
    request_ids: series.rounds.map((round) => round.request.request_id),
    round_index: series.rounds.length,
    status: 'passed',
    stop_reason: null,
    series_sha256: api.sha256(api.jcs(series)),
    apply_state: 'none',
    transitioned_from_state_sha256: null,
    retry_authorization: null,
    terminal_evidence_sha256: null,
    terminated_from_state_sha256: null,
    terminated_from_state: null,
  };
  return { ...fields, state_sha256: api.sha256(api.jcs(fields)) };
}

export function currentReceipt(api, schema) {
  const series = currentSeries(api, schema);
  const run = series.rounds[0];
  const orchestration = schema === 6 ? settledOrchestration(api, series) : null;
  return {
    receipt: {
      schema,
      phase: 'draft',
      request: run.request,
      input_sha256: run.request.input_sha256,
      reviewed_commit: run.request.reviewed_commit_or_head,
      policy: run.request.policy,
      policy_sha256: run.request.policy_sha256,
      reviewer: run.reviewer,
      reproduced: run.reproduced,
      outcome: run.outcome,
      pre_execution_eligible: run.pre_execution_eligible,
      series,
      ...(schema === 6 ? { settled_orchestration_state_sha256: orchestration.state_sha256 } : {}),
      reviewed_at: '2026-07-20T00:00:00Z',
    },
    orchestration,
  };
}

export function currentCompletionReceipt(api, schema) {
  const series = currentCompletionSeries(api, schema);
  const run = series.rounds[0];
  const orchestration = schema === 6 ? settledOrchestration(api, series) : null;
  return {
    receipt: {
      schema,
      phase: 'completion',
      request: run.request,
      planned_at_commit: run.request.planned_at_commit,
      execution_base_commit: run.request.execution_base_commit,
      reviewed_head: run.request.reviewed_commit_or_head,
      diff_sha256: run.diff_sha256,
      plan_input_sha256: run.plan_input_sha256,
      acceptance_inventory: run.acceptance_inventory,
      acceptance_inventory_sha256: run.acceptance_inventory_sha256,
      policy: run.request.policy,
      policy_sha256: run.request.policy_sha256,
      reviewer: run.reviewer,
      reproduced: run.reproduced,
      outcome: run.outcome,
      primary: run.primary,
      completion_verdict: run.completion_verdict,
      series,
      ...(schema === 6 ? { settled_orchestration_state_sha256: orchestration.state_sha256 } : {}),
      reviewed_at: '2026-07-20T00:00:00Z',
    },
    orchestration,
  };
}

export function currentWaiver() {
  return {
    phase: 'draft',
    input_sha256: H1,
    roles: ['primary'],
    actor: 'fixture owner',
    reason: 'historical characterization only',
    at: '2026-07-20T00:00:00Z',
  };
}

export function workflowRecord(schema) {
  const codex = {
    company: 'openai',
    tool: 'codex',
    model: 'gpt-5.6-sol',
    effort: 'high',
    ...(schema === 2 ? { service_tier: 'fast' } : {}),
  };
  const claude = { company: 'anthropic', tool: 'claude', model: 'fable', effort: 'high' };
  const role = (candidate) => ({
    candidates: [candidate],
    selector:
      candidate.tool === 'codex'
        ? `codex:${candidate.model}@${candidate.effort}${candidate.service_tier === 'fast' ? '+fast' : ''}`
        : `claude:${candidate.model}@${candidate.effort}`,
  });
  return {
    schema,
    orchestrator: role(codex),
    reviewer: role(claude),
    implementer: role(codex),
    review: { max_rounds: 2, minimum_score: 90 },
  };
}
