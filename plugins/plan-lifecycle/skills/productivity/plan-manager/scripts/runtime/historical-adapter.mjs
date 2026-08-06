import {
  canonicalPlanView as canonicalLegacyPlanView,
  jcs as legacyJcs,
  validateCompletionReceipt as validateLegacyCompletionReceipt,
  validateDraftReceipt as validateLegacyDraftReceipt,
  validateCanonicalOrchestrationFamily as validateLegacyOrchestrationFamily,
  withLegacyClassification,
} from '../legacy-review-records.mjs';
import {
  canonicalPlanView,
  decodeUtf8,
  fenceAt,
  jcs,
  normalizeLogicalPaths,
  parsePlan,
  sha256,
  validatePlanRun,
} from './current-codec.mjs';
import { assertClosed, COMMIT, fail, HASH, LEGACY_RECORD_KINDS, validatePlanRunRecord } from './plan-state.mjs';

function assertSafeLegacyNumbers(value, label = 'legacy record') {
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || (Number.isInteger(value) && !Number.isSafeInteger(value))) {
      fail(`${label} contains an unsafe JSON number`);
    }
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) assertSafeLegacyNumbers(item, label);
    return;
  }
  if (value !== null && typeof value === 'object') {
    for (const item of Object.values(value)) assertSafeLegacyNumbers(item, label);
  }
}

function legacyRecords(bytes) {
  const text = decodeUtf8(bytes);
  const records = [];
  const counts = new Map();
  let currentCount = 0;
  let attemptCount = 0;
  let fence = null;
  const knownPrefix = new RegExp(`^(${LEGACY_RECORD_KINDS.join('|')})\\s*:`);
  for (const [lineIndex, line] of text.split('\n').entries()) {
    const marker = fenceAt(line);
    if (fence === null && marker !== null) {
      fence = marker;
      continue;
    }
    if (
      fence !== null &&
      marker !== null &&
      marker.marker === fence.marker &&
      marker.length >= fence.length &&
      /^\s*$/.test(marker.tail)
    ) {
      fence = null;
      continue;
    }
    if (fence !== null) continue;
    if (/^Plan-run:/.test(line)) {
      currentCount += 1;
      continue;
    }
    if (/^Plan-attempt-history:/.test(line)) {
      attemptCount += 1;
      continue;
    }
    const prefix = knownPrefix.exec(line);
    if (prefix === null) continue;
    const match =
      /^(Bootstrap-review-record|Review-receipt|Completion-review-receipt|Review-orchestration-state|Review-orchestration-prepared-request|Review-orchestration-dispatch-commitment|Review-orchestration-controller-abort|Review-orchestration-abandonment): (\{.*\})$/.exec(
        line,
      );
    if (match === null) fail(`${prefix[1]} does not use exact canonical historical record grammar`);
    let payload;
    try {
      payload = JSON.parse(match[2]);
    } catch {
      fail(`${match[1]} contains malformed JSON`);
    }
    if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
      fail(`${match[1]} payload must be an object`);
    }
    assertSafeLegacyNumbers(payload, match[1]);
    if (legacyJcs(payload) !== match[2]) fail(`${match[1]} must use compact JCS`);
    const count = (counts.get(match[1]) ?? 0) + 1;
    if (count > 1) fail(`duplicate ${match[1]} legacy record`);
    counts.set(match[1], count);
    records.push({ kind: match[1], line_index: lineIndex, payload });
  }
  if (fence !== null) fail('legacy classification rejects an unclosed Markdown fence');
  return { attemptCount, currentCount, records };
}

function legacyResult(classification, reason, records = []) {
  return {
    classification,
    reason,
    records,
    reusable_authority: false,
    resumable: false,
  };
}

function validateLegacyTimestamp(value, label) {
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value)) || !/^\d{4}-\d{2}-\d{2}T/.test(value)) {
    fail(`${label} must be an ISO timestamp`);
  }
}

function validateBootstrapRecord(record) {
  assertClosed(
    record,
    ['S', 'X', 'kind', 'plan_blob_sha256', 'plan_path', 'reviewed_commit', 'schema'],
    'bootstrap record',
  );
  if (record.schema !== 1 || record.kind !== 'bootstrap_not_reusable') {
    fail('bootstrap record schema/kind is unsupported');
  }
  if (!HASH.test(record.plan_blob_sha256) || !COMMIT.test(record.reviewed_commit)) {
    fail('bootstrap record commit/blob binding is invalid');
  }
  normalizeLogicalPaths([record.plan_path], 'bootstrap plan path');
  assertClosed(
    record.X,
    ['effort', 'findings_sha256', 'model', 'reviewed_at', 'score', 'tool', 'verdict'],
    'bootstrap X',
  );
  if (
    !HASH.test(record.X.findings_sha256) ||
    !Number.isInteger(record.X.score) ||
    record.X.score < 0 ||
    record.X.score > 100 ||
    !['ready', 'not_ready'].includes(record.X.verdict)
  ) {
    fail('bootstrap X result is invalid');
  }
  for (const field of ['effort', 'model', 'tool']) {
    if (typeof record.X[field] !== 'string' || record.X[field] === '') fail(`bootstrap X ${field} is invalid`);
  }
  validateLegacyTimestamp(record.X.reviewed_at, 'bootstrap X reviewed_at');
  assertClosed(record.S, ['attempted', 'denial_source', 'reason', 'result', 'reviewed_at', 'selected'], 'bootstrap S');
  if (
    record.S.attempted !== false ||
    record.S.selected !== null ||
    ![
      'not_authorized',
      'unavailable_auth',
      'unavailable_model',
      'timed_out',
      'platform_denied',
      'failed_unparseable',
      'unavailable_unknown',
    ].includes(record.S.result)
  ) {
    fail('bootstrap S denial result is invalid');
  }
  for (const field of ['denial_source', 'reason']) {
    if (typeof record.S[field] !== 'string' || record.S[field] === '') fail(`bootstrap S ${field} is invalid`);
  }
  validateLegacyTimestamp(record.S.reviewed_at, 'bootstrap S reviewed_at');
}

function containsCancelledLegacyValue(value) {
  if (value === 'cancelled' || value === 'user_cancelled') return true;
  if (Array.isArray(value)) return value.some(containsCancelledLegacyValue);
  return value !== null && typeof value === 'object' && Object.values(value).some(containsCancelledLegacyValue);
}

function validateLegacyRecordFamily(bytes, records) {
  canonicalLegacyPlanView(bytes);
  const map = new Map(records.map(({ kind, payload }) => [kind, payload]));
  const bootstrap = map.get('Bootstrap-review-record');
  if (bootstrap !== undefined) {
    if (records.length !== 1) fail('bootstrap record cannot cross another historical family');
    validateBootstrapRecord(bootstrap);
  }
  const orchestration = map.get('Review-orchestration-state') ?? null;
  validateLegacyOrchestrationFamily(map);
  if (map.has('Review-receipt')) {
    validateLegacyDraftReceipt(map.get('Review-receipt'), null, { orchestration });
  }
  if (map.has('Completion-review-receipt')) {
    validateLegacyCompletionReceipt(map.get('Completion-review-receipt'), {}, { orchestration });
  }
  for (const { payload } of records) {
    if (containsCancelledLegacyValue(payload)) fail('cancelled historical evidence is quarantine-only');
  }
  return map;
}

export function classifyLegacyPlan(bytes) {
  let parsed;
  let inventory;
  try {
    parsed = parsePlan(bytes);
    inventory = legacyRecords(bytes);
  } catch (error) {
    return legacyResult(
      'legacy-quarantined',
      `malformed legacy plan: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  const { attemptCount, currentCount, records } = inventory;
  if (records.length === 0) {
    if (currentCount !== 0) return legacyResult('current', 'PlanRunV1 record present');
    return attemptCount === 0
      ? legacyResult('record-free', 'no legacy machine records')
      : legacyResult('legacy-quarantined', 'orphan Plan-attempt-history without a current PlanRunV1');
  }
  if (currentCount !== 0 || attemptCount !== 0) {
    return legacyResult('legacy-quarantined', 'crossed current and legacy family', records);
  }

  let family;
  try {
    family = withLegacyClassification(() => validateLegacyRecordFamily(bytes, records));
  } catch (error) {
    return legacyResult(
      'legacy-quarantined',
      `malformed or crossed legacy family: ${error instanceof Error ? error.message : String(error)}`,
      records,
    );
  }

  const state = family.get('Review-orchestration-state') ?? null;
  if (state !== null && (state.status === 'active' || (state.status === 'passed' && state.apply_state === 'pending'))) {
    return legacyResult('legacy-quarantined', 'active or prepared legacy orchestration family', records);
  }
  if (state === null && parsed.frontmatter.status !== 'finished') {
    return legacyResult('legacy-quarantined', 'unsettled legacy receipt family', records);
  }
  const settled = records.map((record) => ({ ...record, settled: true }));
  return legacyResult('settled-terminal', 'complete settled terminal legacy evidence', settled);
}

export function migrateLegacyPlan({
  bytes,
  nextStatus,
  run,
  sourceBase,
  acceptanceManifest,
  acceptanceManifestExpectation,
}) {
  const classification = classifyLegacyPlan(bytes);
  if (!['record-free', 'settled-terminal'].includes(classification.classification)) {
    fail(`legacy-quarantined plan cannot migrate: ${classification.reason}`);
  }
  if (nextStatus !== 'ongoing') fail('legacy migration target status must be ongoing');
  if (run.risk !== 'local' || jcs(run.requested_effects) !== jcs(['local'])) {
    fail('legacy migration is local only and grants no external authority');
  }
  if (typeof sourceBase !== 'string' || !COMMIT.test(sourceBase)) {
    fail('legacy migration sourceBase must be an exact full commit identity');
  }
  if (run.source_base !== sourceBase) {
    fail('legacy migration run source_base must match the exact sourceBase identity');
  }
  if (run.execution_parent !== null && run.execution_parent !== sourceBase) {
    fail('legacy migration run execution_parent conflicts with the exact sourceBase identity');
  }

  const parsed = parsePlan(bytes);
  const removedLines = new Set(classification.records.map((record) => record.line_index));
  const lines = parsed.lines.filter((_, index) => !removedLines.has(index));
  let statusCount = 0;
  for (let index = 1; index < parsed.frontmatterEnd; index += 1) {
    if (/^status:/.test(lines[index])) {
      statusCount += 1;
      lines[index] = `status: ${nextStatus}`;
    }
  }
  if (statusCount !== 1) fail('legacy migration requires exactly one frontmatter status');

  let fence = null;
  let reviewIndex = -1;
  for (const [index, line] of lines.entries()) {
    const marker = fenceAt(line);
    if (fence === null && marker !== null) {
      fence = marker;
      continue;
    }
    if (
      fence !== null &&
      marker !== null &&
      marker.marker === fence.marker &&
      marker.length >= fence.length &&
      /^\s*$/.test(marker.tail)
    ) {
      fence = null;
      continue;
    }
    if (fence === null && /^##[ \t]+Review[ \t]*#*[ \t]*$/.test(line)) {
      reviewIndex = index;
      break;
    }
  }
  if (fence !== null) fail('legacy migration rejects an unclosed Markdown fence');
  if (reviewIndex < 0) {
    while (lines.at(-1) === '') lines.pop();
    reviewIndex = lines.length;
  }

  const insertion = [];
  if (reviewIndex > 0 && lines[reviewIndex - 1] !== '') insertion.push('');
  const planRunIndex = reviewIndex + insertion.length;
  insertion.push('Plan-run: {}');
  if (reviewIndex === lines.length || lines[reviewIndex] !== '') insertion.push('');
  lines.splice(reviewIndex, 0, ...insertion);

  const placeholder = Buffer.from(lines.join('\n'));
  const targetPlanSha256 = sha256(canonicalPlanView(placeholder));
  const sourcePlanSha256 = sha256(canonicalPlanView(bytes));
  if (![sourcePlanSha256, targetPlanSha256].includes(run.plan_sha256)) {
    fail('legacy migration plan digest does not bind the source or clean target plan');
  }
  const migratedRun = {
    ...structuredClone(run),
    execution_parent: sourceBase,
    plan_sha256: targetPlanSha256,
    source_base: sourceBase,
  };
  validatePlanRunRecord(migratedRun, { status: nextStatus });
  lines[planRunIndex] = `Plan-run: ${jcs(migratedRun)}`;
  const migrated = Buffer.from(lines.join('\n'));
  const identity = {
    goalId: migratedRun.goal_id,
    planPath: migratedRun.plan_path,
    repositoryId: migratedRun.repository_id,
    runId: migratedRun.run_id,
    ...(acceptanceManifest === undefined ? {} : { acceptanceManifest }),
    ...(acceptanceManifestExpectation === undefined ? {} : { acceptanceManifestExpectation }),
  };
  validatePlanRun(migrated, identity);
  const migratedInventory = legacyRecords(migrated);
  if (
    migratedInventory.records.length !== 0 ||
    migratedInventory.currentCount !== 1 ||
    migratedInventory.attemptCount !== 0
  ) {
    fail('legacy migration must make a clean one-record current cutover');
  }
  return migrated;
}
