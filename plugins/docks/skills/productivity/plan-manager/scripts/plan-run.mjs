import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  canonicalPlanView as canonicalLegacyPlanView,
  jcs as legacyJcs,
  validateCompletionReceipt as validateLegacyCompletionReceipt,
  validateDraftReceipt as validateLegacyDraftReceipt,
  validateCanonicalOrchestrationFamily as validateLegacyOrchestrationFamily,
} from './legacy-review-records.mjs';

const HASH = /^[0-9a-f]{64}$/;
const COMMIT = /^[0-9a-f]{40}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PLAN_STATUSES = new Set(['drafting', 'planned', 'scheduled', 'ongoing', 'blocked', 'finished']);
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
const EFFECT_ORDER = Object.freeze(['local', 'probe', 'production_access', 'publish', 'push', 'release', 'deploy']);
const EFFECTS = new Set(EFFECT_ORDER);
const EXTERNAL_EFFECTS = new Set(['probe', 'publish', 'push', 'release', 'deploy']);
const AUTHORITY_SCOPES = new Set(EFFECT_ORDER.slice(1));
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
const LIVE_REVIEW_STATES = new Set(['reserved', 'transport_retried']);
const LEGACY_RECORD_KINDS = Object.freeze([
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
const PLAN_ATTEMPT_KEYS = Object.freeze([
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
const LIFECYCLE_FRONTMATTER = new Set([
  'status',
  'updated',
  'started_at',
  'finished_at',
  'blocked_reason',
  'blocked_since',
  'in_review_since',
  'scheduled_for',
]);
const EXCLUDED_SECTIONS = new Set(['Review', 'Verification Results']);

function fail(message) {
  throw new Error(message);
}

function assertPlainObject(value, label) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    fail(`${label} must be an object`);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) fail(`${label} must be a plain object`);
}

function assertClosed(value, keys, label) {
  assertPlainObject(value, label);
  const allowed = new Set(keys);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) fail(`${label} contains unknown field ${key}`);
  }
  for (const key of keys) {
    if (!Object.hasOwn(value, key)) fail(`${label} is missing ${key}`);
  }
}

function assertUnicodeScalarString(value, label) {
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

function compareUtf16(left, right) {
  const limit = Math.min(left.length, right.length);
  for (let index = 0; index < limit; index += 1) {
    const difference = left.charCodeAt(index) - right.charCodeAt(index);
    if (difference !== 0) return difference;
  }
  return left.length - right.length;
}

function serializeJcs(value, ancestors) {
  if (value === null || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'string') {
    assertUnicodeScalarString(value, 'JCS string');
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) fail('JCS numbers must be finite');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    if (ancestors.has(value)) fail('JCS value must not be cyclic');
    ancestors.add(value);
    const items = [];
    for (let index = 0; index < value.length; index += 1) {
      if (!Object.hasOwn(value, index)) fail('JCS arrays must not be sparse');
      items.push(serializeJcs(value[index], ancestors));
    }
    ancestors.delete(value);
    return `[${items.join(',')}]`;
  }
  if (typeof value === 'object') {
    assertPlainObject(value, 'JCS object');
    if (ancestors.has(value)) fail('JCS value must not be cyclic');
    if (Object.getOwnPropertySymbols(value).length !== 0) fail('JCS objects cannot contain symbol keys');
    ancestors.add(value);
    const keys = Object.keys(value);
    for (const key of keys) assertUnicodeScalarString(key, 'JCS property key');
    keys.sort(compareUtf16);
    const properties = keys.map((key) => `${JSON.stringify(key)}:${serializeJcs(value[key], ancestors)}`);
    ancestors.delete(value);
    return `{${properties.join(',')}}`;
  }
  fail(`unsupported JCS value: ${typeof value}`);
}

export function jcs(value) {
  return serializeJcs(value, new Set());
}

export function sha256(value) {
  if (typeof value !== 'string' && !Buffer.isBuffer(value) && !(value instanceof Uint8Array)) {
    fail('sha256 input must be bytes or a string');
  }
  return createHash('sha256').update(value).digest('hex');
}

function decodeUtf8(bytes) {
  const input = typeof bytes === 'string' ? Buffer.from(bytes) : Buffer.from(bytes);
  if (input.length >= 3 && input[0] === 0xef && input[1] === 0xbb && input[2] === 0xbf) fail('UTF-8 BOM is forbidden');
  let text;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(input);
  } catch {
    fail('plan must be valid UTF-8');
  }
  if (/\r(?!\n)/.test(text)) fail('CR-only newlines are forbidden');
  return text.replace(/\r\n/g, '\n');
}

function parseScalar(raw) {
  const text = raw.trim();
  if (text === 'null') return null;
  if (text === 'true') return true;
  if (text === 'false') return false;
  if (/^-?(?:0|[1-9]\d*)$/.test(text)) {
    const number = Number(text);
    if (!Number.isSafeInteger(number)) fail('frontmatter integer is unsafe');
    return number;
  }
  if (text.startsWith('"')) {
    let value;
    try {
      value = JSON.parse(text);
    } catch {
      fail(`invalid quoted frontmatter scalar: ${text}`);
    }
    if (typeof value !== 'string') fail('quoted frontmatter scalar must be a string');
    assertUnicodeScalarString(value, 'frontmatter scalar');
    return value;
  }
  if (text.startsWith('[')) {
    if (!text.endsWith(']')) fail('frontmatter flow array is unterminated');
    try {
      const value = JSON.parse(text);
      if (Array.isArray(value)) {
        jcs(value);
        return value;
      }
    } catch {
      // YAML flow arrays may contain unquoted plain scalars; parse those below.
    }
    const inner = text.slice(1, -1).trim();
    return inner === '' ? [] : inner.split(',').map((part) => parseScalar(part));
  }
  if (!text || /[:#{}&*!|>'%@`]/.test(text) || /^(?:-|\?)\s/.test(text)) {
    fail(`unsupported frontmatter scalar: ${text}`);
  }
  return text;
}

export function parsePlan(bytes) {
  const text = decodeUtf8(bytes);
  const lines = text.split('\n');
  if (lines[0] !== '---') fail('plan must start with frontmatter');
  const end = lines.indexOf('---', 1);
  if (end < 0) fail('plan frontmatter is unterminated');
  const frontmatter = Object.create(null);
  for (let index = 1; index < end; index += 1) {
    const line = lines[index];
    if (line === '' || line.startsWith('#')) continue;
    if (line.includes('\t')) fail('tabs are forbidden in frontmatter');
    const match = /^([A-Za-z_][A-Za-z0-9_]*):(?:\s*(.*))?$/.exec(line);
    if (!match) fail(`unsupported frontmatter at line ${index + 1}`);
    const [, key, raw = ''] = match;
    if (Object.hasOwn(frontmatter, key)) fail(`duplicate frontmatter key: ${key}`);
    if (raw.trim() !== '') {
      frontmatter[key] = parseScalar(raw);
      continue;
    }
    const values = [];
    while (index + 1 < end && /^ {2}- /.test(lines[index + 1])) {
      index += 1;
      const value = parseScalar(lines[index].slice(4));
      if (typeof value !== 'string') fail(`${key} block array must contain strings`);
      values.push(value);
    }
    frontmatter[key] = values;
  }
  return {
    body: `${lines
      .slice(end + 1)
      .join('\n')
      .replace(/\n*$/, '')}\n`,
    frontmatter,
    frontmatterEnd: end,
    lines,
    text,
  };
}

function fenceAt(line) {
  const match = /^( {0,3})(`{3,}|~{3,})(.*)$/.exec(line);
  return match ? { marker: match[2][0], length: match[2].length, tail: match[3] } : null;
}

function headingAt(line) {
  const match = /^(#{1,6})[ \t]+(.+?)[ \t]*#*[ \t]*$/.exec(line);
  return match ? { level: match[1].length, title: match[2].trim() } : null;
}

function canonicalBody(body) {
  const retained = [];
  const sectionCounts = new Map();
  let excludedSection = null;
  let fence = null;
  let planRunCount = 0;
  for (const line of body.split('\n')) {
    const marker = fenceAt(line);
    if (fence === null && marker !== null) {
      fence = marker;
      if (excludedSection === null) retained.push(line);
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
      if (excludedSection === null) retained.push(line);
      continue;
    }
    if (fence === null) {
      const heading = headingAt(line);
      if (heading !== null) {
        if (heading.level === 2 && EXCLUDED_SECTIONS.has(heading.title)) {
          const count = (sectionCounts.get(heading.title) ?? 0) + 1;
          sectionCounts.set(heading.title, count);
          if (count > 1) fail(`duplicate ${heading.title} section`);
          excludedSection = heading.title;
          continue;
        }
        if (excludedSection !== null && heading.level <= 2) excludedSection = null;
      }
      if (/^Plan-run:/.test(line)) {
        planRunCount += 1;
        if (planRunCount > 1) fail('duplicate Plan-run record');
        continue;
      }
    }
    if (excludedSection === null) retained.push(line);
  }
  if (fence !== null) fail('canonical plan hashing rejects an unclosed Markdown fence');
  return retained.join('\n').replace(/\n*$/, '');
}

export function canonicalPlanView(bytes) {
  const { frontmatter, body } = parsePlan(bytes);
  const kept = Object.create(null);
  for (const [key, value] of Object.entries(frontmatter)) {
    if (!LIFECYCLE_FRONTMATTER.has(key)) kept[key] = value;
  }
  return `${jcs(kept)}\n${canonicalBody(body)}\n`;
}

function canonicalSection(body, title) {
  const lines = body.split('\n');
  const headings = [];
  let fence = null;
  for (let index = 0; index < lines.length; index += 1) {
    const marker = fenceAt(lines[index]);
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
    if (fence === null) {
      const heading = headingAt(lines[index]);
      if (heading !== null) headings.push({ ...heading, index });
    }
  }
  if (fence !== null) fail(`canonical ${title} hashing rejects an unclosed Markdown fence`);
  const matching = headings.filter((heading) => heading.level === 2 && heading.title === title);
  if (matching.length === 0) fail(`missing ${title} section`);
  if (matching.length !== 1) fail(`duplicate ${title} section`);
  const start = matching[0].index;
  const following = headings.find((heading) => heading.index > start && heading.level <= 2);
  const section = lines.slice(start + 1, following?.index ?? lines.length);
  while (section.length > 0 && /^\s*$/.test(section.at(-1))) section.pop();
  if (section.every((line) => /^\s*$/.test(line))) fail(`${title} section must contain observed results`);
  return `## ${title}\n${section.join('\n')}\n`;
}

export function canonicalVerificationResults(bytes) {
  return canonicalSection(parsePlan(bytes).body, 'Verification Results');
}

function normalizeLogicalPaths(values, label = 'path') {
  if (!Array.isArray(values) || values.length === 0) fail(`${label} set must be a non-empty array`);
  const seen = new Set();
  const normalized = [];
  for (const value of values) {
    if (typeof value !== 'string' || value === '' || value.includes('\0') || value.includes('\\')) {
      fail(`${label} must be a normalized relative path`);
    }
    if (path.posix.isAbsolute(value) || value === '.' || path.posix.normalize(value) !== value) {
      fail(`${label} must be normalized and relative without escape`);
    }
    if (value.split('/').some((part) => part === '' || part === '.' || part === '..')) {
      fail(`${label} contains an escape or alias`);
    }
    if (seen.has(value)) fail(`duplicate ${label}: ${value}`);
    seen.add(value);
    normalized.push(value);
  }
  return normalized.sort(compareUtf16);
}

function validateReviewPhaseInternal(phase, phaseName) {
  assertClosed(phase, ['state', 'invocations', 'input_sha256', 'result_sha256'], 'ReviewPhaseV1');
  if (!REVIEW_STATES.has(phase.state)) fail(`unknown ReviewPhaseV1 state: ${phase.state}`);
  if (!Number.isInteger(phase.invocations) || phase.invocations < 0 || phase.invocations > 2) {
    fail('ReviewPhaseV1 invocation permit must be between zero and two');
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
      if (![1, 2].includes(phase.invocations)) {
        fail(`${phase.state} phase requires one or two invocations`);
      }
      requireHash(input, 'input');
      if (result !== null) fail(`${phase.state} phase result must be null`);
      break;
    case 'retryable':
      if (![0, 1].includes(phase.invocations)) fail('retryable phase requires zero or one invocation');
      requireHash(input, 'input');
      requireHash(result, 'result');
      break;
    case 'repairing':
      if (phase.invocations !== 1) fail('repairing phase requires exactly one invocation');
      requireHash(input, 'input');
      requireHash(result, 'result');
      break;
    case 'passed':
    case 'blocked':
    case 'cancelled':
      if (![1, 2].includes(phase.invocations)) fail(`${phase.state} phase requires one or two invocations`);
      requireHash(input, 'input');
      requireHash(result, 'result');
      break;
    case 'degraded':
      if (![1, 2].includes(phase.invocations)) fail('degraded phase requires one or two invocations');
      requireHash(input, 'input');
      requireHash(result, 'result');
      break;
    default:
      fail('unknown review state');
  }
  if (phaseName === 'draft_review' && phase.state === 'not_required') fail('draft review cannot be not_required');
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
  const successfulDraft = draftState === 'passed' || (run.risk === 'local' && draftState === 'degraded');
  const beforeStart = ['drafting', 'planned', 'scheduled'].includes(status);

  if (draftState === 'degraded' && run.risk !== 'local') fail('degraded draft review is local-risk only');
  if (run.risk === 'local' && completionState !== 'not_required') fail('local completion review must be not_required');
  if (run.risk !== 'local' && completionState === 'not_required')
    fail('sensitive/external completion cannot be not_required');
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
    if (!['not_started', 'reserved', 'transport_retried', 'retryable', 'repairing', 'passed', 'degraded'].includes(draftState)) {
      fail(`drafting cannot retain terminal draft state ${draftState}`);
    }
    assertBaselineCompletion(run);
    if (run.implementation_commit !== null || run.acceptance !== null || run.blocker !== null) {
      fail('drafting cannot retain implementation, acceptance, or blocker output');
    }
    return;
  }

  if (status === 'planned' || status === 'scheduled') {
    if (!successfulDraft) fail(`${status} requires a passed draft review`);
    assertBaselineCompletion(run);
    if (run.implementation_commit !== null || run.acceptance !== null || run.blocker !== null) {
      fail(`${status} cannot retain implementation output`);
    }
    return;
  }

  if (status === 'ongoing') {
    if (!successfulDraft) fail('ongoing requires a passed draft review');
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
      if (!['not_started', 'passed', 'degraded', 'blocked', 'cancelled'].includes(draftState)) {
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
      if (!successfulDraft) fail('blocked local work after start requires a passed draft review');
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
      if (!successfulDraft) fail('finished local work requires passed/degraded draft review');
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

function planRunPayload(body) {
  const records = [];
  let fence = null;
  for (const line of body.split('\n')) {
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
    if (fence === null && /^Plan-run:/.test(line)) records.push(line);
  }
  if (fence !== null) fail('Plan-run discovery rejects an unclosed Markdown fence');
  if (records.length === 0) fail('missing unfenced Plan-run record');
  if (records.length !== 1) fail('duplicate Plan-run record');
  const match = /^Plan-run: (\{.*\})$/.exec(records[0]);
  if (!match) fail('Plan-run must be one-line compact JCS');
  return match[1];
}

function planAttemptPayloads(body) {
  const payloads = [];
  let fence = null;
  let section = null;
  for (const line of body.split('\n')) {
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
    const heading = headingAt(line);
    if (heading !== null && heading.level <= 2) section = heading.level === 2 ? heading.title : null;
    if (!/^Plan-attempt-history:/.test(line)) continue;
    if (section !== 'Review') fail('Plan-attempt-history records must be inside the Review section');
    const match = /^Plan-attempt-history: (\{.*\})$/.exec(line);
    if (!match) fail('Plan-attempt-history must be one-line compact JCS');
    payloads.push(match[1]);
  }
  if (fence !== null) fail('Plan-attempt-history discovery rejects an unclosed Markdown fence');
  return payloads;
}

function canReopenExistingRun(run) {
  if (!['user_decision', 'missing_authority'].includes(run.blocker?.kind)) return false;
  return ![run.draft_review.state, run.completion_review.state].some((state) =>
    ['blocked', 'cancelled'].includes(state),
  );
}

function validatePlanAttempt(value) {
  assertClosed(value, PLAN_ATTEMPT_KEYS, 'PlanAttemptHistoryV1');
  if (value.schema !== 1) fail('PlanAttemptHistoryV1 schema must be 1');
  if (
    !HASH.test(value.authorization_source_sha256) ||
    !HASH.test(value.plan_bytes_sha256) ||
    !HASH.test(value.successor_run_sha256)
  ) {
    fail('PlanAttemptHistoryV1 digests must be SHA-256 hashes');
  }
  if (typeof value.replacement_run_id !== 'string' || !UUID.test(value.replacement_run_id)) {
    fail('PlanAttemptHistoryV1 replacement_run_id must be a UUID');
  }
  if (value.status !== 'blocked') fail('PlanAttemptHistoryV1 predecessor status must be blocked');
  validatePlanRunRecord(value.run, { status: value.status });
  if (canReopenExistingRun(value.run)) {
    fail('resumable blockers must reopen their existing run instead of creating attempt history');
  }
  return value;
}

function validatePlanAttemptHistory(body, currentRun) {
  const history = planAttemptPayloads(body).map((payload) => {
    let value;
    try {
      value = JSON.parse(payload);
    } catch {
      fail('Plan-attempt-history must contain strict JSON');
    }
    validatePlanAttempt(value);
    if (jcs(value) !== payload) fail('Plan-attempt-history must use compact JCS');
    return value;
  });
  const runIds = new Set([currentRun.run_id]);
  for (let index = 0; index < history.length; index += 1) {
    const attempt = history[index];
    for (const field of ['goal_id', 'repository_id', 'plan_path']) {
      if (attempt.run[field] !== currentRun[field]) fail(`Plan-attempt-history ${field} identity mismatch`);
    }
    if (runIds.has(attempt.run.run_id)) fail('Plan-attempt-history run_id values must be unique');
    runIds.add(attempt.run.run_id);
    const successorRunId = history[index + 1]?.run.run_id ?? currentRun.run_id;
    if (attempt.replacement_run_id !== successorRunId) {
      fail('Plan-attempt-history replacement chain is broken');
    }
  }
  return history;
}

function validateAcceptedPlanBindings(bytes, frontmatter, run, expected) {
  if (run.acceptance === null) return;
  const verificationSha256 = sha256(canonicalVerificationResults(bytes));
  if (verificationSha256 !== run.acceptance.verification_sha256) {
    fail('acceptance verification_sha256 does not match canonical Verification Results bytes');
  }
  const proof = Object.hasOwn(expected, 'acceptanceProof') ? expected.acceptanceProof : 'live';
  if (proof !== 'live' && proof !== 'recorded') fail('acceptance proof must be live or recorded');
  // `recorded` skips only the live re-snapshot below. That snapshot proves the
  // acceptance digest against the worktree AT THE INSTANT OF ACCEPTANCE; it is
  // not a durable invariant, and re-running it later against a different HEAD
  // can never pass -- every accepted record in this repository fails it today.
  //
  // What it stops checking, stated plainly: in `recorded` mode
  // `run.acceptance.source_sha256` is not verified against anything. That is
  // bounded by the caller, not by trust: `recorded` is only ever used to re-read
  // bytes already pinned by a CAS preimage, and in replacement additionally by
  // `plan_bytes_sha256` inside the attempt record. Minting or changing an
  // acceptance always requires `live`, so the digest is proven exactly once,
  // when it is created.
  if (proof === 'recorded') return;
  if (!Object.hasOwn(expected, 'acceptanceManifest')) {
    fail('accepted PlanRun validation requires the final affected-path manifest');
  }
  if (!Object.hasOwn(expected, 'acceptanceManifestExpectation')) {
    fail('accepted PlanRun validation requires a complete live acceptance manifest expectation');
  }
  const manifestExpectation = expected.acceptanceManifestExpectation;
  assertClosed(manifestExpectation, ['repo', 'paths', 'sourceBase'], 'acceptance manifest expectation');
  if (
    manifestExpectation.repo === undefined ||
    manifestExpectation.paths === undefined ||
    manifestExpectation.sourceBase === undefined
  ) {
    fail('acceptance manifest expectation fields must be defined');
  }
  const affectedPaths = normalizeLogicalPaths(frontmatter.affected_paths, 'frontmatter affected path');
  const expectedPaths = normalizeLogicalPaths(manifestExpectation.paths, 'acceptance expectation path');
  if (
    affectedPaths.length !== expectedPaths.length ||
    affectedPaths.some((logical, index) => logical !== expectedPaths[index])
  ) {
    fail('acceptance manifest expectation paths must exactly match frontmatter affected_paths');
  }
  validateAffectedPathManifest(expected.acceptanceManifest, manifestExpectation);
  if (expected.acceptanceManifest.source_sha256 !== run.acceptance.source_sha256) {
    fail('acceptance source_sha256 does not bind the final affected-path manifest');
  }
}

export function validatePlanRun(bytes, expected = {}) {
  const parsed = parsePlan(bytes);
  const status = parsed.frontmatter.status;
  if (typeof status !== 'string' || !PLAN_STATUSES.has(status)) fail('frontmatter status is invalid');
  const payload = planRunPayload(parsed.body);
  let run;
  try {
    run = JSON.parse(payload);
  } catch {
    fail('Plan-run must contain strict JSON');
  }
  validatePlanRunRecord(run, { status });
  if (jcs(run) !== payload) fail('Plan-run must use compact JCS');
  const identities = [
    ['goalId', 'goal_id', 'goal'],
    ['runId', 'run_id', 'run'],
    ['repositoryId', 'repository_id', 'repository'],
    ['planPath', 'plan_path', 'path'],
  ];
  for (const [option, field, label] of identities) {
    if (expected[option] !== undefined && expected[option] !== run[field]) {
      fail(`PlanRun ${label} identity mismatch`);
    }
  }
  const attemptHistory = validatePlanAttemptHistory(parsed.body, run);
  const digest = sha256(canonicalPlanView(bytes));
  if (digest !== run.plan_sha256) fail('plan_sha256 does not match canonical plan digest');
  validateAcceptedPlanBindings(bytes, parsed.frontmatter, run, expected);
  return { attempt_history: attemptHistory, frontmatter: parsed.frontmatter, run, status };
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
  state.run[phaseName] = { ...phase, state: 'blocked', result_sha256: resultSha256 };
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
    if (phase.invocations >= 2) fail('review invocation permit ceiling is two');
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
    next.run[event.phase] = {
      state: phase.state === 'retryable' ? 'transport_retried' : 'reserved',
      invocations: phase.invocations + 1,
      input_sha256: event.input_sha256,
      result_sha256: null,
    };
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
      next.run[event.phase] = { ...phase, state: 'passed', result_sha256: event.result_sha256 };
    } else if (event.type === 'review_repair') {
      if (phase.invocations === 2) {
        blockReview(next, event.phase, event.result_sha256, {
          kind: 'review_failed',
          evidence_sha256: event.result_sha256,
        });
      } else {
        next.run[event.phase] = { ...phase, state: 'repairing', result_sha256: event.result_sha256 };
      }
    } else if (event.type === 'review_blocked') {
      const blockerValue = event.blocker ?? { kind: 'review_failed', evidence_sha256: event.result_sha256 };
      validateBlocker(blockerValue);
      blockReview(next, event.phase, event.result_sha256, clone(blockerValue));
    } else if (event.type === 'review_cancelled') {
      if (!HASH.test(event.evidence_sha256)) fail('review cancellation requires evidence_sha256');
      next.run[event.phase] = { ...phase, state: 'cancelled', result_sha256: event.result_sha256 };
      next.status = 'blocked';
      next.run.blocker = { kind: 'user_cancelled', evidence_sha256: event.evidence_sha256 };
    } else if (phase.state === 'reserved') {
      next.run[event.phase] = {
        ...phase,
        state: 'retryable',
        invocations: phase.invocations - 1,
        result_sha256: event.result_sha256,
      };
    } else if (event.phase === 'draft_review' && next.run.risk === 'local') {
      next.run[event.phase] = { ...phase, state: 'degraded', result_sha256: event.result_sha256 };
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

function validateFinding(finding, label) {
  assertClosed(finding, ['id', 'kind', 'locator', 'defect', 'fix'], label);
  for (const key of ['id', 'kind', 'locator', 'defect', 'fix']) {
    if (typeof finding[key] !== 'string' || finding[key].trim() === '') fail(`${label} ${key} must be non-empty`);
  }
}

export function validateCompletionReview(value, binding = {}) {
  if (Buffer.byteLength(jcs(value)) > 32 * 1024) fail('CompletionReviewV1 exceeds 32 KiB');
  assertClosed(
    value,
    ['schema', 'run_id', 'invocation', 'implementation_commit', 'diff_sha256', 'verdict', 'findings'],
    'CompletionReviewV1',
  );
  if (value.schema !== 1) fail('CompletionReviewV1 schema must be 1');
  if (!UUID.test(value.run_id)) fail('CompletionReviewV1 run binding is invalid');
  if (![1, 2].includes(value.invocation)) fail('CompletionReviewV1 invocation must be one or two');
  if (!COMMIT.test(value.implementation_commit) || !HASH.test(value.diff_sha256)) {
    fail('CompletionReviewV1 implementation/diff binding is invalid');
  }
  if (!['pass', 'repair', 'blocked'].includes(value.verdict)) fail('CompletionReviewV1 verdict is invalid');
  if (!Array.isArray(value.findings)) fail('CompletionReviewV1 findings must be an array');
  value.findings.forEach((finding) => {
    validateFinding(finding, 'CompletionReviewV1 finding');
  });
  if (value.verdict === 'pass' && value.findings.length !== 0) fail('pass verdict cannot contain findings');
  if (value.verdict !== 'pass' && value.findings.length === 0) fail(`${value.verdict} verdict requires findings`);
  for (const key of ['run_id', 'invocation', 'implementation_commit', 'diff_sha256']) {
    if (binding[key] !== undefined && binding[key] !== value[key]) fail(`stale CompletionReviewV1 ${key} binding`);
  }
  return value;
}

export function validateExternalAuthority(authority, { liveSourceSha256 } = {}) {
  assertClosed(authority, ['scopes', 'mode', 'targets', 'source_sha256'], 'ExternalAuthorityV1');
  if (!Array.isArray(authority.scopes) || authority.scopes.length === 0) {
    fail('ExternalAuthorityV1 scopes must be a non-empty array');
  }
  const scopes = new Set();
  let lastIndex = -1;
  for (const scope of authority.scopes) {
    if (!AUTHORITY_SCOPES.has(scope)) fail(`ExternalAuthorityV1 scope is invalid: ${String(scope)}`);
    if (scopes.has(scope)) fail(`duplicate ExternalAuthorityV1 scope: ${scope}`);
    const index = EFFECT_ORDER.indexOf(scope);
    if (index <= lastIndex) fail('ExternalAuthorityV1 scopes must use canonical order');
    lastIndex = index;
    scopes.add(scope);
  }
  if (!['read', 'mutate'].includes(authority.mode)) fail('ExternalAuthorityV1 mode must be read or mutate');
  if (scopes.has('probe')) {
    if (scopes.size !== 1 || authority.mode !== 'read') fail('probe authority is read-only and cannot widen scope');
  } else if (authority.mode !== 'mutate') {
    fail('non-probe external authority requires mutate mode');
  }
  if (!Array.isArray(authority.targets) || authority.targets.length === 0) {
    fail('ExternalAuthorityV1 targets must be a non-empty array');
  }
  const targets = new Set();
  for (const target of authority.targets) {
    if (typeof target !== 'string' || target.length === 0 || target.trim() !== target || /[\0\r\n]/.test(target)) {
      fail('ExternalAuthorityV1 target must be an exact non-empty identity');
    }
    if (targets.has(target)) fail(`duplicate ExternalAuthorityV1 target: ${target}`);
    targets.add(target);
  }
  if (typeof authority.source_sha256 !== 'string' || !HASH.test(authority.source_sha256)) {
    fail('ExternalAuthorityV1 source must be a current-user SHA-256 digest');
  }
  if (liveSourceSha256 !== undefined) {
    if (typeof liveSourceSha256 !== 'string' || !HASH.test(liveSourceSha256)) {
      fail('live current-user source digest is invalid');
    }
    if (authority.source_sha256 !== liveSourceSha256) {
      fail('ExternalAuthorityV1 source does not match the live current-user source');
    }
  }
  return authority;
}

export function authorizeExternalEffect({ authority, effect, liveSourceSha256, mode, target }) {
  if (effect === 'local') {
    return { authorized: true, effect: 'local', mode, target };
  }
  if (!AUTHORITY_SCOPES.has(effect)) fail(`external effect scope is invalid: ${String(effect)}`);
  if (authority === null || authority === undefined) {
    fail(`live ExternalAuthorityV1 is required for ${effect}; persisted intent grants no authority`);
  }
  if (typeof liveSourceSha256 !== 'string' || !HASH.test(liveSourceSha256)) {
    fail(`live current-user source digest is required to authorize ${effect}`);
  }
  validateExternalAuthority(authority, { liveSourceSha256 });
  if (!authority.scopes.includes(effect)) fail(`ExternalAuthorityV1 does not grant exact scope ${effect}`);
  if (authority.mode !== mode) fail(`ExternalAuthorityV1 mode mismatch for ${effect}`);
  if (effect === 'probe' && mode !== 'read') fail('probe authority is read-only');
  if (effect !== 'probe' && mode !== 'mutate') fail(`${effect} authority requires mutate mode`);
  if (typeof target !== 'string' || !authority.targets.includes(target)) {
    fail('ExternalAuthorityV1 target requires exact membership');
  }
  return {
    authorized: true,
    effect,
    mode,
    target,
    source_sha256: authority.source_sha256,
  };
}

function repositoryRoot(repo) {
  if (typeof repo !== 'string' || repo === '') fail('repository path must be non-empty');
  let root;
  try {
    root = fs.realpathSync(repo);
  } catch {
    fail('repository path does not exist');
  }
  if (!fs.statSync(root).isDirectory()) fail('repository path must be a directory');
  return root;
}

function gitDirectories(repo) {
  const root = repositoryRoot(repo);
  const dotGit = path.join(root, '.git');
  let gitDir;
  let stat;
  try {
    stat = fs.lstatSync(dotGit);
  } catch {
    fail('repository has no .git metadata');
  }
  if (stat.isDirectory()) {
    gitDir = dotGit;
  } else if (stat.isFile()) {
    const match = /^gitdir: (.+)\s*$/.exec(fs.readFileSync(dotGit, 'utf8'));
    if (!match) fail('repository .git indirection is malformed');
    gitDir = path.resolve(root, match[1]);
  } else {
    fail('repository .git metadata is invalid');
  }
  gitDir = fs.realpathSync(gitDir);
  let commonDir = gitDir;
  const commonPath = path.join(gitDir, 'commondir');
  if (fs.existsSync(commonPath))
    commonDir = fs.realpathSync(path.resolve(gitDir, fs.readFileSync(commonPath, 'utf8').trim()));
  return { commonDir, gitDir, root };
}

function readPackedRef(commonDir, ref) {
  const packed = path.join(commonDir, 'packed-refs');
  if (!fs.existsSync(packed)) return null;
  for (const line of fs.readFileSync(packed, 'utf8').split('\n')) {
    if (line.startsWith('#') || line.startsWith('^') || line === '') continue;
    const [commit, name] = line.split(' ');
    if (name === ref && COMMIT.test(commit)) return commit;
  }
  return null;
}

function readHead(repo) {
  const { commonDir, gitDir } = gitDirectories(repo);
  const head = fs.readFileSync(path.join(gitDir, 'HEAD'), 'utf8').trim();
  if (COMMIT.test(head)) return head;
  const match = /^ref: (refs\/.+)$/.exec(head);
  if (!match) fail('repository HEAD is not a full commit identity');
  for (const base of [gitDir, commonDir]) {
    const loose = path.join(base, ...match[1].split('/'));
    if (fs.existsSync(loose)) {
      const commit = fs.readFileSync(loose, 'utf8').trim();
      if (!COMMIT.test(commit)) fail('repository HEAD ref is malformed');
      return commit;
    }
  }
  const packed = readPackedRef(commonDir, match[1]);
  if (packed !== null) return packed;
  fail('repository HEAD ref is unresolved');
}

function assertNoSymlink(root, logical) {
  let cursor = root;
  for (const segment of logical.split('/')) {
    cursor = path.join(cursor, segment);
    try {
      if (fs.lstatSync(cursor).isSymbolicLink()) fail(`path ${logical} contains a symlink alias`);
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return;
      throw error;
    }
  }
}

function snapshotPath(root, logical) {
  assertNoSymlink(root, logical);
  const absolute = path.join(root, ...logical.split('/'));
  let stat;
  try {
    stat = fs.lstatSync(absolute);
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return { path: logical, state: 'missing', kind: null, mode: null, sha256: null };
    }
    throw error;
  }
  if (stat.isSymbolicLink()) fail(`path ${logical} is a symlink alias`);
  if (!stat.isFile()) fail(`path ${logical} must be a regular file or missing`);
  return {
    path: logical,
    state: 'file',
    kind: 'file',
    mode: stat.mode & 0o7777,
    sha256: sha256(fs.readFileSync(absolute)),
  };
}

function manifestDigest(sourceBase, paths) {
  return sha256(jcs({ schema: 1, source_base: sourceBase, paths }));
}

export function createAffectedPathManifest({ repo, paths, sourceBase }) {
  const root = repositoryRoot(repo);
  if (typeof sourceBase !== 'string' || !COMMIT.test(sourceBase) || readHead(root) !== sourceBase) {
    fail('source_base must be the exact current repository commit identity');
  }
  const logicalPaths = normalizeLogicalPaths(paths, 'affected path');
  const entries = logicalPaths.map((logical) => snapshotPath(root, logical));
  return {
    schema: 1,
    source_base: sourceBase,
    source_sha256: manifestDigest(sourceBase, entries),
    paths: entries,
  };
}

export function validateAffectedPathManifest(manifest, { repo, paths, sourceBase } = {}) {
  assertClosed(manifest, ['schema', 'source_base', 'source_sha256', 'paths'], 'affected-path manifest');
  if (manifest.schema !== 1) fail('affected-path manifest schema must be 1');
  if (!COMMIT.test(manifest.source_base) || !HASH.test(manifest.source_sha256))
    fail('manifest source/base digest is invalid');
  if (!Array.isArray(manifest.paths) || manifest.paths.length === 0) fail('manifest paths must be non-empty');
  const logical = normalizeLogicalPaths(
    manifest.paths.map((entry) => entry.path),
    'manifest path',
  );
  if (jcs(logical) !== jcs(manifest.paths.map((entry) => entry.path)))
    fail('manifest paths must use canonical ordering');
  for (const entry of manifest.paths) {
    assertClosed(entry, ['path', 'state', 'kind', 'mode', 'sha256'], 'manifest path entry');
    if (!['file', 'missing'].includes(entry.state)) fail('manifest path state is invalid');
    if (entry.state === 'file') {
      if (entry.kind !== 'file' || !Number.isInteger(entry.mode) || entry.mode < 0 || entry.mode > 0o7777) {
        fail('manifest file kind or mode is invalid');
      }
      if (!HASH.test(entry.sha256)) fail('manifest file content digest is invalid');
    } else if (entry.kind !== null || entry.mode !== null || entry.sha256 !== null) {
      fail('missing manifest path cannot have kind, mode, or content digest');
    }
  }
  if (manifestDigest(manifest.source_base, manifest.paths) !== manifest.source_sha256)
    fail('manifest source_sha256 mismatch');
  if (sourceBase !== undefined && sourceBase !== manifest.source_base) fail('manifest source_base identity mismatch');
  if (paths !== undefined && jcs(normalizeLogicalPaths(paths, 'affected path')) !== jcs(logical)) {
    fail('manifest affected path set mismatch');
  }
  if (repo !== undefined) {
    const current = createAffectedPathManifest({ repo, paths: logical, sourceBase: manifest.source_base });
    if (jcs(current) !== jcs(manifest)) {
      const bound = new Map(manifest.paths.map((entry) => [entry.path, jcs(entry)]));
      const diverged = current.paths.filter((entry) => jcs(entry) !== bound.get(entry.path));
      fail(
        diverged.length === 0
          ? 'affected-path manifest does not match repository bytes'
          : `affected-path manifest does not match repository bytes at ${diverged.map((entry) => entry.path).join(', ')}`,
      );
    }
  }
  return manifest;
}

function indexDigest(repo) {
  const { gitDir } = gitDirectories(repo);
  const index = path.join(gitDir, 'index');
  return fs.existsSync(index) ? sha256(fs.readFileSync(index)) : sha256('missing-index');
}

export function captureRepositoryPreimage({ repo, ownedPaths }) {
  const root = repositoryRoot(repo);
  const logical = normalizeLogicalPaths(ownedPaths, 'owned path');
  const entries = logical.map((item) => snapshotPath(root, item));
  return {
    schema: 1,
    repository: root,
    head: readHead(root),
    index_sha256: indexDigest(root),
    owned_paths: entries,
    owned_paths_sha256: sha256(jcs(entries)),
  };
}

function processAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error instanceof Error && 'code' in error && error.code === 'EPERM';
  }
}

function readLockOwner(lockPath) {
  try {
    return JSON.parse(fs.readFileSync(path.join(lockPath, 'owner.json'), 'utf8'));
  } catch {
    return null;
  }
}

function releaseLock(handle) {
  const owner = readLockOwner(handle.path);
  if (owner !== null && owner.nonce === handle.owner.nonce) fs.rmSync(handle.path, { recursive: true, force: true });
}

function reclaimDeadLock(lockPath, requested, verifyPreimage) {
  const owner = readLockOwner(lockPath);
  if (owner === null) return false;
  if (owner.hostname !== os.hostname()) fail('foreign lock owner blocks reclamation');
  if (processAlive(owner.pid)) return false;
  if (owner.run_id !== requested.run_id || owner.expected_preimage !== requested.expected_preimage) {
    fail('dead lock belongs to a different owner/run or preimage');
  }
  verifyPreimage();
  const tombstone = `${lockPath}.reclaim-${process.pid}-${randomUUID()}`;
  try {
    fs.renameSync(lockPath, tombstone);
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return true;
    throw error;
  }
  fs.rmSync(tombstone, { recursive: true, force: true });
  return true;
}

async function acquireLock({ lockPath, owner, timeoutMs, verifyPreimage }) {
  const started = Date.now();
  fs.mkdirSync(path.dirname(lockPath), { recursive: true, mode: 0o700 });
  while (true) {
    try {
      fs.mkdirSync(lockPath, { mode: 0o700 });
      const ownerPath = path.join(lockPath, 'owner.json');
      const descriptor = fs.openSync(ownerPath, 'wx', 0o600);
      try {
        fs.writeFileSync(descriptor, jcs(owner));
        fs.fsyncSync(descriptor);
      } finally {
        fs.closeSync(descriptor);
      }
      return {
        owner,
        path: lockPath,
        release() {
          releaseLock(this);
        },
      };
    } catch (error) {
      if (!(error instanceof Error) || !('code' in error) || error.code !== 'EEXIST') throw error;
    }
    if (reclaimDeadLock(lockPath, owner, verifyPreimage)) continue;
    if (Date.now() - started >= timeoutMs) fail('lock owner is busy or lock acquisition timed out');
    await new Promise((resolve) => setTimeout(resolve, Math.min(10, timeoutMs)));
  }
}

export async function acquirePlanLock({
  file,
  repositoryId,
  planPath,
  runId,
  expectedBytesSha256,
  lockRoot = path.join(os.tmpdir(), 'docks-plan-run-locks'),
  lockTimeoutMs = 1_000,
}) {
  if (typeof file !== 'string' || file === '') fail('plan lock file is required');
  if (typeof repositoryId !== 'string' || repositoryId === '') fail('plan lock repository identity is required');
  normalizeLogicalPaths([planPath], 'plan path');
  if (!UUID.test(runId) || !HASH.test(expectedBytesSha256)) fail('plan lock run/preimage identity is invalid');
  const absolute = path.resolve(file);
  const verifyPreimage = () => {
    if (!fs.existsSync(absolute) || sha256(fs.readFileSync(absolute)) !== expectedBytesSha256) {
      fail('dead plan lock preimage is stale');
    }
  };
  verifyPreimage();
  const key = sha256(jcs({ file: absolute, plan_path: planPath, repository_id: repositoryId }));
  const owner = {
    schema: 1,
    hostname: os.hostname(),
    pid: process.pid,
    run_id: runId,
    expected_preimage: expectedBytesSha256,
    nonce: randomUUID(),
  };
  return acquireLock({ lockPath: path.join(lockRoot, key), owner, timeoutMs: lockTimeoutMs, verifyPreimage });
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
  ['not_started', new Set(['not_started', 'reserved'])],
  ['reserved', new Set(['reserved', 'passed', 'repairing', 'blocked', 'cancelled', 'retryable'])],
  [
    'transport_retried',
    new Set(['transport_retried', 'passed', 'repairing', 'blocked', 'cancelled', 'degraded']),
  ],
  ['retryable', new Set(['retryable', 'transport_retried', 'blocked', 'cancelled'])],
  ['repairing', new Set(['repairing', 'reserved', 'blocked', 'cancelled'])],
  ['passed', new Set(['passed'])],
  ['degraded', new Set(['degraded'])],
  ['blocked', new Set(['blocked'])],
  ['cancelled', new Set(['cancelled'])],
]);

function assertPersistedReviewTransition(before, after, phaseName, risk) {
  if (!REVIEW_TRANSITIONS.get(before.state)?.has(after.state)) fail(`illegal ${phaseName} transition`);
  if (before.state === after.state) {
    if (jcs(before) !== jcs(after)) fail(`${phaseName} cannot mutate without a state transition`);
    return false;
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
      [1, 2].includes(before.invocations) &&
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
        ![1, 2].includes(before.invocations))
    ) {
      fail('degraded review transition is second-transport local draft only');
    }
  }
  return true;
}

function changedRunFields(current, next) {
  return PLAN_RUN_KEYS.filter((field) => jcs(current.run[field]) !== jcs(next.run[field]));
}

function assertOnlyChanged(changed, allowed, label) {
  for (const field of changed) {
    if (!allowed.has(field)) fail(`${label} cannot change ${field}`);
  }
}

function assertPersistedTransition(current, next) {
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

function validatePlanReplacementAuthority(authority, current, next, liveSourceSha256) {
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

function assertPlanRunReplacement(current, next, currentBytes, authority) {
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

function writePlanBytes(file, expectedBytesSha256, nextBuffer) {
  const directory = path.dirname(file);
  const temporary = path.join(directory, `.${path.basename(file)}.${process.pid}.${randomUUID()}.tmp`);
  try {
    const descriptor = fs.openSync(temporary, 'wx', 0o600);
    try {
      fs.writeFileSync(descriptor, nextBuffer);
      fs.fsyncSync(descriptor);
    } finally {
      fs.closeSync(descriptor);
    }
    if (sha256(fs.readFileSync(file)) !== expectedBytesSha256) fail('plan CAS preimage changed before atomic rename');
    fs.renameSync(temporary, file);
    fsyncDirectory(directory);
    const readback = fs.readFileSync(file);
    if (!readback.equals(nextBuffer)) fail('plan transaction readback mismatch');
    return readback;
  } finally {
    fs.rmSync(temporary, { force: true });
  }
}
function fsyncDirectory(directory) {
  const descriptor = fs.openSync(directory, 'r');
  try {
    fs.fsyncSync(descriptor);
  } finally {
    fs.closeSync(descriptor);
  }
}

export async function transactPlanRun({
  file,
  identity,
  expectedBytesSha256,
  nextBytes,
  lockRoot,
  lockTimeoutMs = 1_000,
  acceptanceManifest,
  acceptanceManifestExpectation,
}) {
  assertPlainObject(identity, 'plan transaction identity');
  if (!HASH.test(expectedBytesSha256)) fail('plan transaction expected preimage must be a SHA-256 digest');
  const lock = await acquirePlanLock({
    file,
    repositoryId: identity.repositoryId,
    planPath: identity.planPath,
    runId: identity.runId,
    expectedBytesSha256,
    ...(lockRoot === undefined ? {} : { lockRoot }),
    lockTimeoutMs,
  });
  try {
    const currentBytes = fs.readFileSync(file);
    if (sha256(currentBytes) !== expectedBytesSha256) fail('plan CAS preimage is stale');
    const current = validatePlanRun(currentBytes, { ...identity, acceptanceProof: 'recorded' });
    const nextBuffer = Buffer.from(nextBytes);
    // Key the proof mode on what the transition DOES, not on which side is read.
    // Minting or changing an acceptance must be proven against live bytes;
    // carrying one forward unchanged only re-reads bytes the CAS preimage above
    // already pinned, and re-proving those is impossible once HEAD has moved.
    const carried = validatePlanRun(nextBuffer, { ...identity, acceptanceProof: 'recorded' });
    const installsAcceptance =
      carried.run.acceptance !== null && jcs(carried.run.acceptance) !== jcs(current.run.acceptance);
    // Pin `live` explicitly rather than relying on the default: `identity` is
    // only asserted to be a plain object, so a caller could otherwise smuggle
    // `acceptanceProof: 'recorded'` through the spread and skip the one proof
    // that matters. Omitting the manifest then fails closed on the existing error.
    const next = installsAcceptance
      ? validatePlanRun(nextBuffer, {
          ...identity,
          acceptanceProof: 'live',
          ...(acceptanceManifest === undefined ? {} : { acceptanceManifest }),
          ...(acceptanceManifestExpectation === undefined ? {} : { acceptanceManifestExpectation }),
        })
      : carried;
    // Draft review F1 observed that `recorded` drops two checks, not one: the
    // live manifest re-snapshot and the `frontmatter.affected_paths` comparison,
    // the only site in this module reading `affected_paths`. Its conclusion — a
    // carry-forward could therefore rewrite the path set — was disproven: the
    // set is inside `canonicalPlanView`, so editing it moves `plan_sha256`, and
    // `assertPersistedTransition` permits no ordinary transition to change that.
    // Verified both ways; an explicit guard here is unreachable. The protection
    // is pinned by test instead of restated as code that can never fire.
    if (jcs(current.attempt_history) !== jcs(next.attempt_history)) {
      fail('ordinary PlanRun transitions cannot mutate attempt history');
    }
    assertPersistedTransition({ status: current.status, run: current.run }, { status: next.status, run: next.run });
    if (
      (current.status === 'finished' || (current.status === 'blocked' && next.status === 'blocked')) &&
      !currentBytes.equals(nextBuffer)
    ) {
      fail(`${current.status} PlanRun bytes are immutable`);
    }
    if (
      jcs({ status: current.status, run: current.run }) === jcs({ status: next.status, run: next.run }) &&
      !currentBytes.equals(nextBuffer)
    ) {
      fail('persisted PlanRun bytes cannot change without a legal state event');
    }
    const readback = writePlanBytes(file, expectedBytesSha256, nextBuffer);
    return {
      attempt_history: next.attempt_history,
      bytes_sha256: sha256(readback),
      run: next.run,
      status: next.status,
    };
  } finally {
    lock.release();
  }
}

export async function replacePlanRunInPlace({
  authority,
  currentIdentity,
  expectedBytesSha256,
  file,
  liveSourceSha256,
  lockRoot,
  lockTimeoutMs = 1_000,
  nextBytes,
}) {
  assertPlainObject(currentIdentity, 'current plan transaction identity');
  if (!HASH.test(expectedBytesSha256)) fail('plan transaction expected preimage must be a SHA-256 digest');
  const lock = await acquirePlanLock({
    file,
    repositoryId: currentIdentity.repositoryId,
    planPath: currentIdentity.planPath,
    runId: currentIdentity.runId,
    expectedBytesSha256,
    ...(lockRoot === undefined ? {} : { lockRoot }),
    lockTimeoutMs,
  });
  try {
    const currentBytes = fs.readFileSync(file);
    if (sha256(currentBytes) !== expectedBytesSha256) fail('plan CAS preimage is stale');
    // The predecessor is immutable, terminal, and about to be recorded rather
    // than consulted: its bytes are pinned here by the CAS preimage and again by
    // `plan_bytes_sha256` in the attempt entry. `assertPlanRunReplacement` also
    // forbids acceptance on the successor, so the next side never needs a mode.
    const current = validatePlanRun(currentBytes, { ...currentIdentity, acceptanceProof: 'recorded' });
    const nextBuffer = Buffer.from(nextBytes);
    const next = validatePlanRun(nextBuffer, {
      goalId: current.run.goal_id,
      planPath: current.run.plan_path,
      repositoryId: current.run.repository_id,
    });
    validatePlanReplacementAuthority(authority, current, next, liveSourceSha256);
    assertPlanRunReplacement(current, next, currentBytes, authority);
    const readback = writePlanBytes(file, expectedBytesSha256, nextBuffer);
    return {
      attempt_history: next.attempt_history,
      bytes_sha256: sha256(readback),
      run: next.run,
      status: next.status,
    };
  } finally {
    lock.release();
  }
}

function validateRepositoryPreimage(value) {
  assertClosed(
    value,
    ['schema', 'repository', 'head', 'index_sha256', 'owned_paths', 'owned_paths_sha256'],
    'repository preimage',
  );
  if (
    value.schema !== 1 ||
    !COMMIT.test(value.head) ||
    !HASH.test(value.index_sha256) ||
    !HASH.test(value.owned_paths_sha256)
  ) {
    fail('repository preimage has invalid schema, HEAD, or digest');
  }
  if (!Array.isArray(value.owned_paths)) fail('repository preimage owned paths must be an array');
  const logical = normalizeLogicalPaths(
    value.owned_paths.map((entry) => entry.path),
    'owned path',
  );
  if (jcs(logical) !== jcs(value.owned_paths.map((entry) => entry.path)))
    fail('repository preimage paths are not canonical');
  for (const entry of value.owned_paths) {
    assertClosed(entry, ['path', 'state', 'kind', 'mode', 'sha256'], 'owned path preimage');
    if (!['file', 'missing'].includes(entry.state)) fail('owned path state is invalid');
    if (entry.state === 'file') {
      if (entry.kind !== 'file' || !Number.isInteger(entry.mode) || entry.mode < 0 || entry.mode > 0o7777) {
        fail('owned file kind or mode is invalid');
      }
      if (!HASH.test(entry.sha256)) fail('owned file content digest is invalid');
    } else if (entry.kind !== null || entry.mode !== null || entry.sha256 !== null) {
      fail('missing owned path cannot have kind, mode, or content digest');
    }
  }
  if (sha256(jcs(value.owned_paths)) !== value.owned_paths_sha256) fail('owned path preimage digest mismatch');
}

export async function withRepositoryTransaction(
  { expected, ownedPaths, repo, runId, lockTimeoutMs = 1_000 },
  operation,
) {
  if (typeof operation !== 'function') fail('repository transaction operation must be a function');
  validateRepositoryPreimage(expected);
  if (!UUID.test(runId)) fail('repository transaction run id must be a UUID');
  const root = repositoryRoot(repo);
  const logical = normalizeLogicalPaths(ownedPaths, 'owned path');
  if (expected.repository !== root || jcs(logical) !== jcs(expected.owned_paths.map((entry) => entry.path))) {
    fail('repository transaction owned path/repository preimage mismatch');
  }
  const { commonDir } = gitDirectories(root);
  const expectedDigest = sha256(jcs(expected));
  const owner = {
    schema: 1,
    hostname: os.hostname(),
    pid: process.pid,
    run_id: runId,
    expected_preimage: expectedDigest,
    nonce: randomUUID(),
  };
  const verifyPreimage = () => {
    const actual = captureRepositoryPreimage({ repo: root, ownedPaths: logical });
    if (jcs(actual) !== jcs(expected)) fail('repository HEAD, index, or owned-path preimage changed concurrently');
  };
  const lockPath = path.join(commonDir, 'docks-plan-run-locks', 'repository');
  const lock = await acquireLock({ lockPath, owner, timeoutMs: lockTimeoutMs, verifyPreimage });
  try {
    verifyPreimage();
    return await operation();
  } finally {
    lock.release();
  }
}

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
    family = validateLegacyRecordFamily(bytes, records);
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
