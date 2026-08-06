import { canReopenExistingRun, jcs, normalizeLogicalPaths, sha256 } from './current-codec.mjs';

export const HASH = /^[0-9a-f]{64}$/;
export const COMMIT = /^[0-9a-f]{40}$/;
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const PLAN_STATUSES = new Set(['drafting', 'planned', 'scheduled', 'ongoing', 'blocked', 'finished']);
const REVIEW_STATES = new Set([
  'not_required',
  'not_started',
  'reserved',
  'transport_retried',
  'retryable',
  'repairing',
  'passed',
  'degraded',
  'blocked',
  'cancelled',
]);
const PLAN_FINDING_CLASSES = new Set([
  'v1_missing_decision',
  'v1_contract_contradiction',
  'v1_evidence_mismatch',
  'v1_unstable_step_reference',
  'v1_unauthorized_effect',
  'v1_missing_safety_boundary',
  'v1_affected_paths_incomplete',
  'v1_acceptance_command_not_runnable',
  'v1_acceptance_output_mismatch',
  'v1_acceptance_coverage_incomplete',
  'v1_failure_action_missing',
]);
const DRAFT_REVIEW_INVOCATION_LIMIT = 2;
export const EFFECT_ORDER = Object.freeze([
  'local',
  'probe',
  'production_access',
  'publish',
  'push',
  'release',
  'deploy',
]);
const EFFECTS = new Set(EFFECT_ORDER);
const EXTERNAL_EFFECTS = new Set(['probe', 'publish', 'push', 'release', 'deploy']);
export const AUTHORITY_SCOPES = new Set(EFFECT_ORDER.slice(1));
const RISKS = new Set(['local', 'sensitive', 'external']);
const BLOCKER_KINDS = new Set([
  'user_decision',
  'missing_authority',
  'concurrent_change',
  'user_cancelled',
  'verification_failed',
  'review_failed',
  'legacy_invalid',
]);
const PHASE_FIELDS = new Set(['draft_review', 'completion_review']);
export const LIVE_REVIEW_STATES = new Set(['reserved', 'transport_retried']);
const SCOPE_DIGEST_FIELDS = Object.freeze(['plan_sha256', 'source_base', 'source_sha256']);
export const LEGACY_RECORD_KINDS = Object.freeze([
  'Bootstrap-review-record',
  'Review-receipt',
  'Completion-review-receipt',
  'Review-orchestration-state',
  'Review-orchestration-prepared-request',
  'Review-orchestration-dispatch-commitment',
  'Review-orchestration-controller-abort',
  'Review-orchestration-abandonment',
]);
const PLAN_RUN_KEYS = Object.freeze([
  'schema',
  'goal_id',
  'run_id',
  'repository_id',
  'plan_path',
  'requested_effects',
  'risk',
  'plan_sha256',
  'source_base',
  'source_sha256',
  'draft_review',
  'execution_parent',
  'implementation_commit',
  'completion_review',
  'acceptance',
  'blocker',
]);
export const PLAN_ATTEMPT_KEYS = Object.freeze([
  'schema',
  'authorization_source_sha256',
  'plan_bytes_sha256',
  'replacement_run_id',
  'successor_run_sha256',
  'run',
  'status',
]);
const PLAN_REPLACEMENT_AUTHORITY_KEYS = Object.freeze([
  'schema',
  'goal_id',
  'repository_id',
  'plan_path',
  'run_id',
  'successor_run_sha256',
  'source_sha256',
]);
export const LIFECYCLE_FRONTMATTER = new Set([
  'status',
  'updated',
  'started_at',
  'finished_at',
  'blocked_reason',
  'blocked_since',
  'in_review_since',
  'scheduled_for',
]);
export const EXCLUDED_SECTIONS = new Set(['Review', 'Verification Results', 'Proposed repair']);
export const PLAN_HASH_MODE = 'status-excluded-v1';
export const STEP_STATUSES = new Set(['planned', 'in-flight', 'done', 'blocked', 'skipped']);
export const STEP_STATUS_TRANSITIONS = new Map([
  ['planned', new Set(['in-flight', 'done', 'blocked', 'skipped'])],
  ['in-flight', new Set(['done', 'blocked', 'skipped'])],
  ['blocked', new Set(['in-flight', 'done', 'skipped'])],
  ['done', new Set()],
  ['skipped', new Set()],
]);
export const LEGACY_STEP_COLUMNS = Object.freeze([
  '#',
  'Task',
  'Files',
  'Depends',
  'Effect',
  'Status',
  'Done when / failure action',
]);
export const IDENTIFIED_STEP_COLUMNS = Object.freeze([
  '#',
  'Id',
  'Task',
  'Files',
  'Depends',
  'Effect',
  'Status',
  'Done when / failure action',
]);
export const NORMALIZED_STEP_STATUS = ' status-excluded-v1 ';

export function fail(message) {
  throw new Error(message);
}

export function assertPlainObject(value, label) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    fail(`${label} must be an object`);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) fail(`${label} must be a plain object`);
}

export function assertClosed(value, keys, label) {
  assertClosedWithOptional(value, keys, [], label);
}

function assertClosedWithOptional(value, requiredKeys, optionalKeys, label) {
  assertPlainObject(value, label);
  const allowed = new Set([...requiredKeys, ...optionalKeys]);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) fail(`${label} contains unknown field ${key}`);
  }
  for (const key of requiredKeys) {
    if (!Object.hasOwn(value, key)) fail(`${label} is missing ${key}`);
  }
}

export function assertUnicodeScalarString(value, label) {
  if (typeof value !== 'string') fail(`${label} must be a string`);
  for (let index = 0; index < value.length; index += 1) {
    const unit = value.charCodeAt(index);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) fail(`${label} contains a lone surrogate`);
      index += 1;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) {
      fail(`${label} contains a lone surrogate`);
    }
  }
}

export function compareUtf16(left, right) {
  const limit = Math.min(left.length, right.length);
  for (let index = 0; index < limit; index += 1) {
    const difference = left.charCodeAt(index) - right.charCodeAt(index);
    if (difference !== 0) return difference;
  }
  return left.length - right.length;
}
function validateReviewPhaseInternal(phase, phaseName) {
  assertClosedWithOptional(
    phase,
    ['state', 'invocations', 'input_sha256', 'result_sha256'],
    ['accepted_classes'],
    'ReviewPhaseV1',
  );
  if (!REVIEW_STATES.has(phase.state)) fail(`unknown ReviewPhaseV1 state: ${phase.state}`);
  const invocationLimit = phaseName === 'completion_review' ? 2 : DRAFT_REVIEW_INVOCATION_LIMIT;
  if (!Number.isInteger(phase.invocations) || phase.invocations < 0 || phase.invocations > invocationLimit) {
    fail(
      phaseName === 'completion_review'
        ? 'completion ReviewPhaseV1 invocation permit must be between zero and two'
        : `draft ReviewPhaseV1 invocation permit must be between zero and ${DRAFT_REVIEW_INVOCATION_LIMIT}`,
    );
  }
  const acceptedClasses = phase.accepted_classes ?? [];
  if (!Array.isArray(acceptedClasses)) fail('ReviewPhaseV1 accepted_classes must be an array');
  const sortedAcceptedClasses = [...acceptedClasses].sort(compareUtf16);
  const seenClasses = new Set();
  for (const findingClass of acceptedClasses) {
    if (typeof findingClass !== 'string' || !PLAN_FINDING_CLASSES.has(findingClass)) {
      fail(`ReviewPhaseV1 accepted_classes contains unknown class ${String(findingClass)}`);
    }
    if (seenClasses.has(findingClass)) fail(`ReviewPhaseV1 accepted_classes contains duplicate class ${findingClass}`);
    seenClasses.add(findingClass);
  }
  if (acceptedClasses.some((findingClass, index) => findingClass !== sortedAcceptedClasses[index])) {
    fail('ReviewPhaseV1 accepted_classes must be sorted');
  }
  if (phaseName === 'completion_review' && acceptedClasses.length !== 0) {
    fail('completion ReviewPhaseV1 accepted_classes must remain empty');
  }
  if (['not_required', 'not_started'].includes(phase.state) && acceptedClasses.length !== 0) {
    fail(`${phase.state} phase cannot carry accepted draft finding classes`);
  }
  const input = phase.input_sha256;
  const result = phase.result_sha256;
  const requireHash = (value, field) => {
    if (typeof value !== 'string' || !HASH.test(value)) fail(`${phase.state} ${field} must be a SHA-256 digest`);
  };
  switch (phase.state) {
    case 'not_required':
    case 'not_started':
      if (phase.invocations !== 0 || input !== null || result !== null) {
        fail(`${phase.state} phase cannot consume an invocation or carry input/result hashes`);
      }
      break;
    case 'reserved':
    case 'transport_retried':
      if (phase.invocations < 1 || phase.invocations > invocationLimit) {
        fail(`${phase.state} phase requires between one and ${invocationLimit} invocations`);
      }
      requireHash(input, 'input');
      if (result !== null) fail(`${phase.state} phase result must be null`);
      break;
    case 'retryable':
      if (phase.invocations < 0 || phase.invocations >= invocationLimit) {
        fail(`retryable phase requires between zero and ${invocationLimit - 1} invocations`);
      }
      requireHash(input, 'input');
      requireHash(result, 'result');
      break;
    case 'repairing':
      if (phase.invocations < 1 || phase.invocations >= invocationLimit) {
        fail(`repairing phase requires between one and ${invocationLimit - 1} invocations`);
      }
      requireHash(input, 'input');
      requireHash(result, 'result');
      break;
    case 'passed':
    case 'blocked':
    case 'cancelled':
      if (phase.invocations < 1 || phase.invocations > invocationLimit) {
        fail(`${phase.state} phase requires between one and ${invocationLimit} invocations`);
      }
      requireHash(input, 'input');
      requireHash(result, 'result');
      break;
    case 'degraded':
      if (phase.invocations < 1 || phase.invocations > invocationLimit) {
        fail(`degraded phase requires between one and ${invocationLimit} invocations`);
      }
      requireHash(input, 'input');
      requireHash(result, 'result');
      break;
    default:
      fail('unknown review state');
  }
  // `draft_review: not_required` is the local-risk self-check gate. The phase carries
  // no permit, input, or result; validateTuple refuses it above local risk.
  return phase;
}

export function validateReviewPhase(value, { phase: phaseName = null } = {}) {
  return validateReviewPhaseInternal(value, phaseName);
}

function validateAcceptance(value) {
  if (value === null) return;
  assertClosed(value, ['source_sha256', 'verification_sha256'], 'acceptance');
  if (!HASH.test(value.source_sha256) || !HASH.test(value.verification_sha256)) {
    fail('acceptance source and verification values must be SHA-256 digests');
  }
}

function validateBlocker(value) {
  if (value === null) return;
  assertClosed(value, ['kind', 'evidence_sha256'], 'blocker');
  if (!BLOCKER_KINDS.has(value.kind)) fail(`unknown blocker kind: ${value.kind}`);
  if (!HASH.test(value.evidence_sha256)) fail('blocker evidence must be a SHA-256 digest');
}

function assertBaselineCompletion(run) {
  const expected = run.risk === 'local' ? 'not_required' : 'not_started';
  if (run.completion_review.state !== expected) {
    fail(`${run.risk} completion review must be ${expected}`);
  }
}

function validateEffectsAndRisk(run) {
  if (!Array.isArray(run.requested_effects) || run.requested_effects.length === 0) {
    fail('requested_effects must be a non-empty array');
  }
  const indexes = [];
  const seen = new Set();
  for (const effect of run.requested_effects) {
    if (!EFFECTS.has(effect)) fail(`unknown requested effect: ${effect}`);
    if (seen.has(effect)) fail(`duplicate requested effect: ${effect}`);
    seen.add(effect);
    indexes.push(EFFECT_ORDER.indexOf(effect));
  }
  if (
    run.requested_effects[0] !== 'local' ||
    indexes.some((value, index) => index > 0 && value <= indexes[index - 1])
  ) {
    fail('requested_effects must begin with local and use canonical effect order');
  }
  if (!RISKS.has(run.risk)) fail(`unknown PlanRun risk: ${run.risk}`);
  const hasExternal = run.requested_effects.some((effect) => EXTERNAL_EFFECTS.has(effect));
  const hasProduction = seen.has('production_access');
  if (hasExternal && run.risk !== 'external') fail('external requested_effects require external risk');
  if (hasProduction && run.risk === 'local') fail('production_access requested effect cannot use local risk');
  if (run.risk === 'external' && !hasExternal && !hasProduction)
    fail('external risk requires an external requested effect');
  if (run.risk === 'local' && run.requested_effects.length !== 1) fail('local risk permits only the local effect');
}

function validateTuple(status, run) {
  const draftState = run.draft_review.state;
  const completionState = run.completion_review.state;
  const successfulDraft =
    draftState === 'passed' || (run.risk === 'local' && ['degraded', 'not_required'].includes(draftState));
  const beforeStart = ['drafting', 'planned', 'scheduled'].includes(status);

  if (draftState === 'degraded' && run.risk !== 'local') fail('degraded draft review is local-risk only');
  if (run.risk === 'local' && completionState !== 'not_required') fail('local completion review must be not_required');
  if (run.risk !== 'local' && completionState === 'not_required')
    fail('sensitive/external completion cannot be not_required');
  if (draftState === 'not_required' && run.risk !== 'local')
    fail('sensitive/external draft review cannot be not_required');
  if (run.risk === 'local' && run.implementation_commit !== null)
    fail('local work cannot carry an implementation commit');
  if (status !== 'blocked' && run.blocker !== null) fail(`${status} plan cannot carry blocker evidence`);
  if (draftState !== 'not_started' && run.source_base === null) {
    fail('source_base is required once draft review has started');
  }
  if (beforeStart && run.execution_parent !== null) {
    fail(`${status} precedes implementation and cannot carry execution_parent`);
  }

  if (status === 'drafting') {
    if (
      ![
        'not_required',
        'not_started',
        'reserved',
        'transport_retried',
        'retryable',
        'repairing',
        'passed',
        'degraded',
      ].includes(draftState)
    ) {
      fail(`drafting cannot retain terminal draft state ${draftState}`);
    }
    assertBaselineCompletion(run);
    if (run.implementation_commit !== null || run.acceptance !== null || run.blocker !== null) {
      fail('drafting cannot retain implementation, acceptance, or blocker output');
    }
    return;
  }

  if (status === 'planned' || status === 'scheduled') {
    if (!successfulDraft) fail(`${status} requires a passed draft review or the local self-check gate`);
    assertBaselineCompletion(run);
    if (run.implementation_commit !== null || run.acceptance !== null || run.blocker !== null) {
      fail(`${status} cannot retain implementation output`);
    }
    return;
  }

  if (status === 'ongoing') {
    if (!successfulDraft) fail('ongoing requires a passed draft review or the local self-check gate');
    if (run.execution_parent === null) fail('ongoing requires the exact execution_parent captured at start');
    if (run.risk === 'local') {
      if (run.acceptance !== null) fail('ongoing local work cannot retain acceptance');
      return;
    }
    if (completionState === 'not_started') {
      if (run.implementation_commit !== null || run.acceptance !== null) {
        fail('nonlocal work cannot bind implementation or acceptance before completion reservation');
      }
      return;
    }
    if (!['reserved', 'transport_retried', 'retryable', 'repairing', 'passed'].includes(completionState)) {
      fail(`ongoing completion review cannot be ${completionState}`);
    }
    if (run.implementation_commit === null) fail('active completion requires an implementation binding');
    if (run.acceptance === null && completionState !== 'repairing') {
      fail('active completion requires an acceptance binding');
    }
    return;
  }

  if (status === 'blocked') {
    if (run.blocker === null) fail('blocked status requires blocker evidence');
    if (draftState === 'cancelled' || completionState === 'cancelled') {
      if (run.blocker.kind !== 'user_cancelled') fail('cancelled review requires a user_cancelled blocker');
    }

    if (run.execution_parent === null) {
      if (!['not_required', 'not_started', 'passed', 'degraded', 'blocked', 'cancelled'].includes(draftState)) {
        fail('blocked before start cannot retain an active draft review');
      }
      assertBaselineCompletion(run);
      if (run.blocker.kind === 'verification_failed') {
        fail('verification_failed is post-start and requires execution_parent');
      }
      if (run.implementation_commit !== null || run.acceptance !== null) {
        fail('blocked before start has no implementation output');
      }
      return;
    }

    if (run.risk === 'local') {
      if (!successfulDraft) fail('blocked local work after start requires a settled local draft gate');
      if (run.acceptance !== null && run.blocker.kind !== 'concurrent_change') {
        fail('accepted local work may block only for concurrent_change');
      }
      return;
    }

    if (draftState !== 'passed') fail('blocked sensitive/external work requires passed draft review');
    if (completionState === 'not_started') {
      if (run.implementation_commit !== null || run.acceptance !== null) {
        fail('blocked before completion reservation has no implementation output');
      }
      return;
    }
    if (completionState === 'blocked' || completionState === 'cancelled') {
      if (run.implementation_commit === null || run.acceptance === null) {
        fail('blocked completion requires implementation and acceptance');
      }
      return;
    }
    if (completionState === 'passed') {
      if (run.implementation_commit === null || run.acceptance === null) {
        fail('passed completion requires implementation and acceptance');
      }
      if (!['missing_authority', 'concurrent_change'].includes(run.blocker.kind)) {
        fail('passed completion may block only for missing_authority or concurrent_change');
      }
      return;
    }
    fail(`blocked plan cannot retain active completion state ${completionState}`);
  }

  if (status === 'finished') {
    if (run.execution_parent === null) fail('finished plan requires the execution_parent captured at start');
    if (run.blocker !== null || run.acceptance === null) fail('finished plan requires acceptance and no blocker');
    if (run.risk === 'local') {
      if (!successfulDraft) fail('finished local work requires a settled local draft gate');
      return;
    }
    if (draftState !== 'passed' || completionState !== 'passed' || run.implementation_commit === null) {
      fail('finished sensitive/external work requires passed reviews and implementation commit');
    }
  }
}

export function validatePlanRunRecord(run, { status } = {}) {
  assertClosed(run, PLAN_RUN_KEYS, 'PlanRunV1');
  if (run.schema !== 1) fail('PlanRunV1 schema must be 1');
  if (typeof run.goal_id !== 'string' || !UUID.test(run.goal_id)) fail('PlanRun goal_id must be a UUID');
  if (typeof run.run_id !== 'string' || !UUID.test(run.run_id)) fail('PlanRun run_id must be a UUID');
  if (
    typeof run.repository_id !== 'string' ||
    run.repository_id.trim() !== run.repository_id ||
    run.repository_id.length === 0
  ) {
    fail('PlanRun repository identity must be non-empty');
  }
  normalizeLogicalPaths([run.plan_path], 'plan path');
  validateEffectsAndRisk(run);
  if (!HASH.test(run.plan_sha256) || !HASH.test(run.source_sha256)) fail('PlanRun digests must be SHA-256 hashes');
  if (run.source_base !== null && !COMMIT.test(run.source_base)) fail('source_base must be a full commit identity');
  if (run.execution_parent !== null && !COMMIT.test(run.execution_parent))
    fail('execution_parent must be a full commit identity');
  if (run.implementation_commit !== null && !COMMIT.test(run.implementation_commit)) {
    fail('implementation_commit must be a full commit identity');
  }
  validateReviewPhaseInternal(run.draft_review, 'draft_review');
  validateReviewPhaseInternal(run.completion_review, 'completion_review');
  validateAcceptance(run.acceptance);
  validateBlocker(run.blocker);
  if (status !== undefined) {
    if (!PLAN_STATUSES.has(status)) fail(`unknown plan frontmatter status: ${status}`);
    validateTuple(status, run);
  }
  return run;
}
function clone(value) {
  return structuredClone(value);
}

function validateStateObject(state) {
  assertClosed(state, ['status', 'run'], 'PlanRun state');
  if (!PLAN_STATUSES.has(state.status)) fail('PlanRun state has invalid status');
  validatePlanRunRecord(state.run, { status: state.status });
}

function eventKeys(event, allowed) {
  assertPlainObject(event, 'PlanRun event');
  for (const key of Object.keys(event)) {
    if (!allowed.has(key)) fail(`PlanRun event contains unknown field ${key}`);
  }
}

function selectedPhase(state, event) {
  if (!PHASE_FIELDS.has(event.phase)) fail('review event phase must be draft_review or completion_review');
  return state.run[event.phase];
}

function persistedPhase(phase, overrides = {}) {
  const current = { ...phase, ...overrides };
  delete current.accepted_classes;
  return current;
}

function resultBindingMatches(state, event, phase) {
  for (const field of ['run_id', 'invocation', 'input_sha256']) {
    if (!Object.hasOwn(event, field)) fail(`review result is missing exact ${field} binding`);
  }
  if (event.run_id !== state.run.run_id) fail('stale review run binding');
  if (!Number.isInteger(event.invocation) || event.invocation !== phase.invocations) {
    fail('stale review invocation binding');
  }
  if (typeof event.input_sha256 !== 'string' || event.input_sha256 !== phase.input_sha256) {
    fail('stale review input binding');
  }
}

function blockReview(state, phaseName, resultSha256, blockerValue) {
  const phase = state.run[phaseName];
  state.run[phaseName] = persistedPhase(phase, {
    state: 'blocked',
    result_sha256: resultSha256,
  });
  state.status = 'blocked';
  state.run.blocker = blockerValue;
}

export function validateReviewInvalidInput(value) {
  assertClosed(value, ['schema', 'error', 'reason'], 'ReviewInvalidInputV1');
  if (value.schema !== 1 || value.error !== 'invalid_input') {
    fail('ReviewInvalidInputV1 schema/error is invalid');
  }
  if (!['bundle_unavailable', 'bundle_integrity_failed', 'bundle_binding_mismatch'].includes(value.reason)) {
    fail('ReviewInvalidInputV1 reason is invalid');
  }
  return value;
}

export function reducePlanRun({ current, event }) {
  validateStateObject(current);
  assertPlainObject(event, 'PlanRun event');
  const next = clone(current);
  const resultTypes = new Set([
    'review_passed',
    'review_repair',
    'review_blocked',
    'review_cancelled',
    'review_transport_failure',
  ]);

  if (event.type === 'reserve_review') {
    const completionReservation = event.phase === 'completion_review';
    eventKeys(
      event,
      new Set([
        'type',
        'phase',
        'input_sha256',
        ...(completionReservation ? ['implementation_commit', 'acceptance'] : []),
      ]),
    );
    if (!HASH.test(event.input_sha256)) fail('review reservation input must be a SHA-256 digest');
    const phase = selectedPhase(next, event);
    if (!['not_started', 'retryable', 'repairing'].includes(phase.state)) {
      fail(`review phase ${phase.state} is terminal, live, or has no remaining permit`);
    }
    const invocationLimit = completionReservation ? 2 : DRAFT_REVIEW_INVOCATION_LIMIT;
    if (phase.invocations >= invocationLimit) {
      fail(
        completionReservation
          ? 'completion review invocation permit ceiling is two'
          : `draft review invocation permit ceiling is ${DRAFT_REVIEW_INVOCATION_LIMIT}`,
      );
    }
    if (phase.state === 'retryable' && event.input_sha256 === phase.input_sha256) {
      fail('transport retry requires a fresh invocation-bound input');
    }
    if (phase.state === 'repairing' && event.input_sha256 === phase.input_sha256) {
      fail('repair review requires changed input bytes');
    }
    if (event.phase === 'draft_review' && next.status !== 'drafting') fail('draft review cannot reopen after drafting');
    if (completionReservation) {
      if (next.status !== 'ongoing' || next.run.risk === 'local') {
        fail('completion review is not required for this phase/risk');
      }
      if (!COMMIT.test(event.implementation_commit) || event.acceptance === null) {
        fail('completion reservation requires implementation and acceptance bindings');
      }
      validateAcceptance(event.acceptance);
      if (phase.state === 'not_started') {
        if (next.run.implementation_commit !== null || next.run.acceptance !== null) {
          fail('initial completion reservation must atomically install new bindings');
        }
      } else if (phase.state === 'retryable') {
        if (
          event.implementation_commit !== next.run.implementation_commit ||
          jcs(event.acceptance) !== jcs(next.run.acceptance)
        ) {
          fail('completion transport retry must preserve implementation and acceptance bindings');
        }
      } else if (
        next.run.implementation_commit === null ||
        event.implementation_commit !== next.run.implementation_commit ||
        next.run.acceptance !== null
      ) {
        fail('completion repair reservation requires replaced implementation and cleared acceptance');
      }
      next.run.implementation_commit = event.implementation_commit;
      next.run.acceptance = clone(event.acceptance);
    }
    next.run[event.phase] = persistedPhase(phase, {
      state: phase.state === 'retryable' ? 'transport_retried' : 'reserved',
      invocations: phase.invocations + 1,
      input_sha256: event.input_sha256,
      result_sha256: null,
    });
  } else if (event.type === 'self_check_gate') {
    eventKeys(event, new Set(['type']));
    if (next.status !== 'drafting') fail('the draft self-check gate closes only while drafting');
    if (next.run.risk !== 'local') fail('sensitive/external risk requires a substantive draft review');
    const phase = next.run.draft_review;
    if (phase.state !== 'not_started') fail(`the draft self-check gate cannot close a ${phase.state} draft review`);
    next.run.draft_review = persistedPhase(phase, { state: 'not_required' });
  } else if (event.type === 'review_invalid_input') {
    eventKeys(event, new Set(['type', 'phase', 'result', 'run_id', 'invocation', 'input_sha256']));
    const phase = selectedPhase(next, event);
    if (!LIVE_REVIEW_STATES.has(phase.state)) {
      fail(`invalid reviewer input requires a matching reserved phase, not ${phase.state}`);
    }
    resultBindingMatches(next, event, phase);
    validateReviewInvalidInput(event.result);
    const resultSha256 = sha256(jcs(event.result));
    blockReview(next, event.phase, resultSha256, {
      kind: 'review_failed',
      evidence_sha256: resultSha256,
    });
  } else if (resultTypes.has(event.type)) {
    eventKeys(
      event,
      new Set(['type', 'phase', 'result_sha256', 'evidence_sha256', 'blocker', 'run_id', 'invocation', 'input_sha256']),
    );
    if (!HASH.test(event.result_sha256)) fail('review result must be a SHA-256 digest');
    const phase = selectedPhase(next, event);
    const mayTerminateRepair =
      phase.state === 'repairing' && ['review_blocked', 'review_cancelled'].includes(event.type);
    if (!LIVE_REVIEW_STATES.has(phase.state) && !mayTerminateRepair)
      fail(`stale review result requires a matching reserved phase, not ${phase.state}`);
    resultBindingMatches(next, event, phase);
    if (event.type === 'review_passed') {
      next.run[event.phase] = persistedPhase(phase, {
        state: 'passed',
        result_sha256: event.result_sha256,
      });
    } else if (event.type === 'review_repair') {
      if (event.phase === 'completion_review') {
        if (phase.invocations === 2) {
          blockReview(next, event.phase, event.result_sha256, {
            kind: 'review_failed',
            evidence_sha256: event.result_sha256,
          });
        } else {
          next.run[event.phase] = persistedPhase(phase, {
            state: 'repairing',
            result_sha256: event.result_sha256,
          });
        }
      } else {
        if (phase.invocations >= DRAFT_REVIEW_INVOCATION_LIMIT) {
          blockReview(next, event.phase, event.result_sha256, {
            kind: 'review_failed',
            evidence_sha256: event.result_sha256,
          });
        } else {
          next.run[event.phase] = persistedPhase(phase, {
            state: 'repairing',
            result_sha256: event.result_sha256,
          });
        }
      }
    } else if (event.type === 'review_blocked') {
      const blockerValue = event.blocker ?? { kind: 'review_failed', evidence_sha256: event.result_sha256 };
      validateBlocker(blockerValue);
      blockReview(next, event.phase, event.result_sha256, clone(blockerValue));
    } else if (event.type === 'review_cancelled') {
      if (!HASH.test(event.evidence_sha256)) fail('review cancellation requires evidence_sha256');
      next.run[event.phase] = persistedPhase(phase, {
        state: 'cancelled',
        result_sha256: event.result_sha256,
      });
      next.status = 'blocked';
      next.run.blocker = { kind: 'user_cancelled', evidence_sha256: event.evidence_sha256 };
    } else if (phase.state === 'reserved') {
      next.run[event.phase] = persistedPhase(phase, {
        state: 'retryable',
        invocations: phase.invocations - 1,
        result_sha256: event.result_sha256,
      });
    } else if (event.phase === 'draft_review' && next.run.risk === 'local') {
      next.run[event.phase] = persistedPhase(phase, {
        state: 'degraded',
        result_sha256: event.result_sha256,
      });
    } else {
      blockReview(next, event.phase, event.result_sha256, {
        kind: 'review_failed',
        evidence_sha256: event.result_sha256,
      });
    }
  } else if (event.type === 'cold_entry') {
    eventKeys(event, new Set(['type', 'phase', 'evidence_sha256']));
    if (!HASH.test(event.evidence_sha256)) fail('cold entry requires dangling-launch evidence digest');
    const phase = selectedPhase(next, event);
    if (!LIVE_REVIEW_STATES.has(phase.state)) fail(`cold entry cannot redispatch terminal ${phase.state} phase`);
    blockReview(next, event.phase, event.evidence_sha256, {
      kind: 'review_failed',
      evidence_sha256: event.evidence_sha256,
    });
  } else if (event.type === 'replace_implementation') {
    eventKeys(event, new Set(['type', 'implementation_commit', 'diff_sha256']));
    if (!COMMIT.test(event.implementation_commit) || !HASH.test(event.diff_sha256)) {
      fail('replacement implementation and diff bindings are invalid');
    }
    if (
      next.status !== 'ongoing' ||
      next.run.risk === 'local' ||
      next.run.completion_review.state !== 'repairing' ||
      next.run.completion_review.invocations !== 1
    ) {
      fail('implementation replacement requires first completion repair state');
    }
    if (event.implementation_commit === next.run.implementation_commit)
      fail('replacement implementation commit must change');
    next.run.implementation_commit = event.implementation_commit;
    next.run.acceptance = null;
  } else {
    fail(`unknown PlanRun reducer event: ${String(event.type)}`);
  }
  validateStateObject(next);
  return next;
}
const LIFECYCLE_TRANSITIONS = new Map([
  ['drafting', new Set(['drafting', 'planned', 'scheduled', 'ongoing', 'blocked'])],
  ['planned', new Set(['planned', 'scheduled', 'ongoing', 'blocked'])],
  ['scheduled', new Set(['scheduled', 'planned', 'ongoing', 'blocked'])],
  ['ongoing', new Set(['ongoing', 'finished', 'blocked'])],
  ['blocked', new Set(['blocked', 'drafting', 'ongoing'])],
  ['finished', new Set(['finished'])],
]);
const REVIEW_TRANSITIONS = new Map([
  ['not_required', new Set(['not_required'])],
  ['not_started', new Set(['not_started', 'not_required', 'reserved'])],
  ['reserved', new Set(['reserved', 'passed', 'repairing', 'blocked', 'cancelled', 'retryable'])],
  ['transport_retried', new Set(['transport_retried', 'passed', 'repairing', 'blocked', 'cancelled', 'degraded'])],
  ['retryable', new Set(['retryable', 'transport_retried', 'blocked', 'cancelled'])],
  ['repairing', new Set(['repairing', 'reserved', 'blocked', 'cancelled'])],
  ['passed', new Set(['passed'])],
  ['degraded', new Set(['degraded'])],
  ['blocked', new Set(['blocked'])],
  ['cancelled', new Set(['cancelled'])],
]);

function assertPersistedReviewTransition(before, after, phaseName, risk) {
  const invocationLimit = phaseName === 'completion_review' ? 2 : DRAFT_REVIEW_INVOCATION_LIMIT;
  if (!REVIEW_TRANSITIONS.get(before.state)?.has(after.state)) fail(`illegal ${phaseName} transition`);
  if (before.state === after.state) {
    if (jcs(before) !== jcs(after)) fail(`${phaseName} cannot mutate without a state transition`);
    return false;
  }
  if (after.state === 'not_required') {
    // The local-risk self-check gate closes the draft phase without spending a
    // permit. REVIEW_TRANSITIONS admits it only from `not_started`, and
    // validateTuple rejects it above local risk.
    if (phaseName !== 'draft_review' || risk !== 'local') fail('not_required is draft-only at local risk');
    if (after.invocations !== 0 || after.input_sha256 !== null || after.result_sha256 !== null) {
      fail('the draft self-check gate spends no permit and binds no digests');
    }
    return true;
  }
  if (LIVE_REVIEW_STATES.has(after.state)) {
    if (after.invocations !== before.invocations + 1 || after.result_sha256 !== null) {
      fail(`${phaseName} reservation must consume exactly one permit and clear its result`);
    }
    if (before.state === 'retryable' && after.input_sha256 === before.input_sha256) {
      fail(`${phaseName} transport retry requires a fresh invocation-bound input`);
    }
    if (before.state === 'repairing' && after.input_sha256 === before.input_sha256) {
      fail(`${phaseName} repair retry requires changed input bytes`);
    }
  } else {
    if (after.input_sha256 !== before.input_sha256) {
      fail(`${phaseName} result cannot change input bindings`);
    }
    const refundedTransportFailure =
      after.state === 'retryable' &&
      before.state === 'reserved' &&
      before.invocations >= 1 &&
      before.invocations <= invocationLimit &&
      after.invocations === before.invocations - 1;
    // A failed first transport is the sole result transition allowed to refund a reserved permit.
    if (after.invocations !== before.invocations && !refundedTransportFailure) {
      fail(`${phaseName} result cannot change invocation bindings`);
    }
    if (!HASH.test(after.result_sha256)) fail(`${phaseName} result transition requires a digest`);
    if (after.state === 'retryable' && !refundedTransportFailure) {
      fail(`${phaseName} retryable transition must refund one reserved invocation`);
    }
    if (
      after.state === 'degraded' &&
      (before.state !== 'transport_retried' ||
        phaseName !== 'draft_review' ||
        risk !== 'local' ||
        before.invocations < 1 ||
        before.invocations > invocationLimit)
    ) {
      fail('degraded review transition is second-transport local draft only');
    }
  }
  return true;
}

export function changedRunFields(current, next) {
  return PLAN_RUN_KEYS.filter((field) => jcs(current.run[field]) !== jcs(next.run[field]));
}

export function assertOnlyChanged(changed, allowed, label) {
  for (const field of changed) {
    if (!allowed.has(field)) fail(`${label} cannot change ${field}`);
  }
}

export function assertPersistedTransition(current, next) {
  const identityFields = ['schema', 'goal_id', 'run_id', 'repository_id', 'plan_path', 'requested_effects', 'risk'];
  for (const field of identityFields) {
    if (jcs(current.run[field]) !== jcs(next.run[field])) fail(`PlanRun transition cannot change ${field} identity`);
  }
  if (!LIFECYCLE_TRANSITIONS.get(current.status)?.has(next.status)) fail('illegal lifecycle status transition');

  if (current.status === 'finished') {
    if (jcs(current) !== jcs(next)) fail('finished PlanRun state is immutable');
    return;
  }

  const changedPhases = [];
  for (const phaseName of PHASE_FIELDS) {
    if (assertPersistedReviewTransition(current.run[phaseName], next.run[phaseName], phaseName, current.run.risk)) {
      changedPhases.push(phaseName);
    }
  }
  if (changedPhases.length > 1) fail('one persisted transition cannot mutate both review phases');

  const changed = changedRunFields(current, next);
  const allowed = new Set(identityFields);
  for (const phaseName of changedPhases) allowed.add(phaseName);

  if (current.status === 'blocked') {
    if (next.status === 'blocked') {
      if (jcs(current) !== jcs(next)) fail('blocked PlanRun state is immutable without a permitted reopen');
      return;
    }
    if (!['user_decision', 'missing_authority'].includes(current.run.blocker?.kind)) {
      fail('only a current-user decision/authority blocker may reopen');
    }
    if (changedPhases.length !== 0 || next.run.blocker !== null) {
      fail('blocked reopen preserves review permits and only clears blocker evidence');
    }
    const expectedStatus = current.run.execution_parent === null ? 'drafting' : 'ongoing';
    if (next.status !== expectedStatus) fail(`blocked reopen must return to ${expectedStatus}`);
    allowed.add('blocker');
    assertOnlyChanged(changed, allowed, 'blocked reopen');
    return;
  }

  if (changedPhases.length === 1) {
    const phaseName = changedPhases[0];
    const before = current.run[phaseName];
    const after = next.run[phaseName];
    if (phaseName === 'draft_review') {
      if (current.status !== 'drafting') fail('persisted draft review transition requires drafting status');
      if (LIVE_REVIEW_STATES.has(after.state) && before.state !== 'retryable') {
        allowed.add('plan_sha256');
        allowed.add('source_base');
        allowed.add('source_sha256');
      }
    } else {
      if (current.status !== 'ongoing') fail('persisted completion review transition requires ongoing status');
      if (LIVE_REVIEW_STATES.has(after.state)) {
        if (before.state === 'not_started') allowed.add('implementation_commit');
        allowed.add('acceptance');
      }
    }
    if (next.status === 'blocked') {
      allowed.add('blocker');
    } else if (next.status !== current.status) {
      fail('review result may change lifecycle status only to blocked');
    }
    assertOnlyChanged(changed, allowed, 'persisted review event');
    return;
  }

  if (current.status === 'drafting' && next.status === 'drafting') {
    if (!['not_started', 'repairing'].includes(current.run.draft_review.state)) {
      fail(`draft content cannot mutate while review is ${current.run.draft_review.state}`);
    }
    allowed.add('plan_sha256');
    allowed.add('source_base');
    allowed.add('source_sha256');
    assertOnlyChanged(changed, allowed, 'draft preparation');
    return;
  }

  if (
    current.status === 'ongoing' &&
    next.status === 'ongoing' &&
    SCOPE_DIGEST_FIELDS.some((field) => changed.includes(field)) &&
    jcs(current.run.implementation_commit) === jcs(next.run.implementation_commit)
  ) {
    for (const phaseName of PHASE_FIELDS) {
      if (LIVE_REVIEW_STATES.has(current.run[phaseName].state)) {
        fail(`scope amendment cannot move bytes held by a live ${phaseName}`);
      }
    }
    if (current.run.completion_review.state === 'passed') {
      fail('scope amendment cannot follow a passed completion review');
    }
    if (current.run.acceptance !== null || next.run.acceptance !== null) {
      fail('scope amendment cannot invalidate a minted acceptance');
    }
    for (const field of SCOPE_DIGEST_FIELDS) allowed.add(field);
    assertOnlyChanged(changed, allowed, 'scope amendment');
    return;
  }

  if (
    current.status === 'ongoing' &&
    next.status === 'ongoing' &&
    current.run.completion_review.state === 'repairing'
  ) {
    allowed.add('implementation_commit');
    allowed.add('acceptance');
    if (
      current.run.implementation_commit === next.run.implementation_commit ||
      current.run.acceptance === null ||
      next.run.acceptance !== null
    ) {
      fail('implementation replacement must change its commit and clear stale acceptance');
    }
    assertOnlyChanged(changed, allowed, 'implementation replacement');
    return;
  }

  if (next.status === 'blocked') {
    allowed.add('blocker');
    assertOnlyChanged(changed, allowed, 'administrative block');
    return;
  }

  if (next.status === 'ongoing' && current.status !== 'ongoing') {
    allowed.add('execution_parent');
    if (current.run.execution_parent !== null || next.run.execution_parent === null) {
      fail('start transition must capture execution_parent exactly once');
    }
  } else if (next.status === 'finished' && current.status === 'ongoing') {
    allowed.add('acceptance');
  } else if (
    !(
      (current.status === 'drafting' && ['planned', 'scheduled'].includes(next.status)) ||
      (current.status === 'planned' && next.status === 'scheduled') ||
      (current.status === 'scheduled' && next.status === 'planned') ||
      current.status === next.status
    )
  ) {
    fail('persisted lifecycle transition has no legal event shape');
  }
  assertOnlyChanged(changed, allowed, 'persisted lifecycle event');
}

export function validatePlanReplacementAuthority(authority, current, next, liveSourceSha256) {
  assertClosed(authority, PLAN_REPLACEMENT_AUTHORITY_KEYS, 'PlanRunReplacementAuthorityV1');
  if (authority.schema !== 1) fail('PlanRunReplacementAuthorityV1 schema must be 1');
  if (
    !HASH.test(liveSourceSha256) ||
    !HASH.test(authority.source_sha256) ||
    !HASH.test(authority.successor_run_sha256)
  ) {
    fail('same-file replacement requires current-user and successor-run digests');
  }
  if (authority.source_sha256 !== liveSourceSha256) {
    fail('PlanRunReplacementAuthorityV1 does not match the live current-user source');
  }
  if (authority.successor_run_sha256 !== sha256(jcs(next.run))) {
    fail('PlanRunReplacementAuthorityV1 does not bind the exact successor run');
  }
  for (const field of ['goal_id', 'repository_id', 'plan_path', 'run_id']) {
    if (authority[field] !== current.run[field]) {
      fail(`PlanRunReplacementAuthorityV1 ${field} does not match the terminal run`);
    }
  }
  return authority;
}

export function assertPlanRunReplacement(current, next, currentBytes, authority) {
  if (current.status !== 'blocked') fail('same-file replacement requires a terminal blocked run');
  if (canReopenExistingRun(current.run)) fail('resumable blockers must reopen their existing run');
  if (next.status !== 'drafting') fail('same-file replacement must restart at drafting');
  for (const field of ['goal_id', 'repository_id', 'plan_path']) {
    if (next.run[field] !== current.run[field]) fail(`same-file replacement cannot change ${field}`);
  }
  if (next.run.run_id === current.run.run_id) fail('same-file replacement requires a fresh run_id');
  if (
    next.run.draft_review.state !== 'not_started' ||
    next.run.draft_review.invocations !== 0 ||
    next.run.draft_review.input_sha256 !== null ||
    next.run.draft_review.result_sha256 !== null
  ) {
    fail('same-file replacement must start with a fresh draft-review budget');
  }
  const expectedCompletionState = next.run.risk === 'local' ? 'not_required' : 'not_started';
  if (
    next.run.completion_review.state !== expectedCompletionState ||
    next.run.completion_review.invocations !== 0 ||
    next.run.completion_review.input_sha256 !== null ||
    next.run.completion_review.result_sha256 !== null
  ) {
    fail('same-file replacement must start with a fresh completion-review baseline');
  }
  if (
    next.run.execution_parent !== null ||
    next.run.implementation_commit !== null ||
    next.run.acceptance !== null ||
    next.run.blocker !== null
  ) {
    fail('same-file replacement cannot retain predecessor execution or blocker state');
  }
  const expectedAttempt = {
    schema: 1,
    authorization_source_sha256: authority.source_sha256,
    plan_bytes_sha256: sha256(currentBytes),
    replacement_run_id: next.run.run_id,
    successor_run_sha256: authority.successor_run_sha256,
    run: current.run,
    status: current.status,
  };
  if (next.attempt_history.length !== current.attempt_history.length + 1) {
    fail('same-file replacement must append exactly one attempt-history record');
  }
  if (jcs(next.attempt_history.slice(0, -1)) !== jcs(current.attempt_history)) {
    fail('same-file replacement attempt history must be append-only');
  }
  if (jcs(next.attempt_history.at(-1)) !== jcs(expectedAttempt)) {
    fail('same-file replacement history does not bind the terminal predecessor');
  }
}
