#!/usr/bin/env node
import { createHash, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HEX40 = /^[0-9a-f]{40}$/;
const HEX64 = /^[0-9a-f]{64}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
const EXCLUDED_FRONTMATTER = new Set([
  'updated', 'status', 'started_at', 'in_review_since', 'blocked_reason',
  'blocked_since', 'assignee', 'review_status', 'ship_commit', 'review_waivers',
  'execution_base_commit',
]);
const MACHINE_RECORD = /^(Bootstrap-review-record|Review-receipt|Completion-review-receipt): (\{.*\})$/;
const LEG_RESULTS = new Set(['passed', 'waived', 'not_authorized', 'unavailable_auth', 'unavailable_model', 'timed_out', 'platform_denied', 'failed_unparseable', 'unavailable_unknown']);
const ATTEMPT_RESULTS = new Set(['passed', 'auth_failed', 'model_unavailable', 'deadline_exceeded', 'platform_denied', 'transient_transport', 'nonzero_exit', 'signaled', 'unparseable']);
const SOURCES = new Set(['current_user', 'runtime_global', 'skill_default']);
const COMPLETION_ROOT = '/tmp/docks-plan-verify';

export function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function compareUtf16(a, b) {
  const aa = String(a); const bb = String(b);
  const n = Math.min(aa.length, bb.length);
  for (let i = 0; i < n; i += 1) {
    const d = aa.charCodeAt(i) - bb.charCodeAt(i);
    if (d) return d;
  }
  return aa.length - bb.length;
}

export function jcs(value) {
  if (value === null || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'string') {
    assertUnicodeScalarString(value, 'JCS string');
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value)) throw new Error('JCS accepts safe integers only');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(jcs).join(',')}]`;
  if (typeof value === 'object') {
    const keys = Object.keys(value);
    for (const key of keys) assertUnicodeScalarString(key, 'JCS property key');
    keys.sort(compareUtf16);
    return `{${keys.map((key) => `${JSON.stringify(key)}:${jcs(value[key])}`).join(',')}}`;
  }
  throw new Error(`unsupported JCS value: ${typeof value}`);
}

function assertUnicodeScalarString(value, label) {
  for (let i = 0; i < value.length; i += 1) {
    const unit = value.charCodeAt(i);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(i + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) throw new Error(`${label} contains a lone surrogate`);
      i += 1;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) throw new Error(`${label} contains a lone surrogate`);
  }
}

function decodeUtf8(bytes) {
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) throw new Error('BOM is forbidden');
  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  if (/\r(?!\n)/.test(text)) throw new Error('CR-only newline is forbidden');
  if (/\uD800(?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(text)) throw new Error('lone surrogate is forbidden');
  return text.replace(/\r\n/g, '\n');
}

function parseScalar(raw) {
  const text = raw.trim();
  if (text === 'null') return null;
  if (text === 'true') return true;
  if (text === 'false') return false;
  if (/^-?(?:0|[1-9]\d*)$/.test(text)) {
    const value = Number(text);
    if (!Number.isSafeInteger(value)) throw new Error('unsafe integer');
    return value;
  }
  if (text.startsWith('"')) {
    let value;
    try { value = JSON.parse(text); } catch { throw new Error(`invalid quoted scalar: ${text}`); }
    if (typeof value !== 'string') throw new Error('quoted scalar must be a string');
    return value;
  }
  if (text.startsWith('[')) {
    let value;
    try {
      if (!text.endsWith(']')) throw new Error('unterminated');
      const inner = text.slice(1, -1).trim();
      value = inner === '' ? [] : inner.split(',').map((item) => parseScalar(item.trim()));
    } catch { throw new Error(`invalid flow array: ${text}`); }
    if (!Array.isArray(value) || value.some((v) => !['string', 'boolean', 'number'].includes(typeof v) && v !== null)) throw new Error('flow arrays contain scalars only');
    return value;
  }
  if (!text || /[:#{}&*!|>'%@`]|^(?:[-?]\s)/.test(text)) throw new Error(`unsupported plain scalar: ${text}`);
  return text;
}

export function parsePlan(bytes) {
  const text = decodeUtf8(bytes instanceof Uint8Array ? bytes : Buffer.from(bytes));
  const lines = text.split('\n');
  if (lines[0] !== '---') throw new Error('plan must start with frontmatter');
  const end = lines.indexOf('---', 1);
  if (end < 0) throw new Error('unterminated frontmatter');
  const frontmatter = {};
  for (let i = 1; i < end; i += 1) {
    const line = lines[i];
    if (!line || line.startsWith('#')) continue;
    if (line.includes('\t')) throw new Error('tabs are forbidden');
    const top = /^([a-zA-Z_][a-zA-Z0-9_]*):(?:\s*(.*))?$/.exec(line);
    if (!top) throw new Error(`unsupported frontmatter at line ${i + 1}`);
    const [, key, raw = ''] = top;
    if (Object.hasOwn(frontmatter, key)) throw new Error(`duplicate frontmatter key: ${key}`);
    if (raw.trim() !== '') {
      if (key === 'review_waivers') {
        let parsed;
        try { parsed = JSON.parse(raw); } catch { throw new Error('review_waivers must be one-line strict JSON'); }
        if (!Array.isArray(parsed) || jcs(parsed) !== raw.trim()) throw new Error('review_waivers must be canonical JCS');
        frontmatter[key] = parsed;
      } else frontmatter[key] = parseScalar(raw);
      continue;
    }
    const values = [];
    while (i + 1 < end && /^  - /.test(lines[i + 1])) {
      i += 1;
      values.push(parseScalar(lines[i].slice(4)));
    }
    if (values.some((v) => typeof v !== 'string')) throw new Error(`${key} block array must contain strings`);
    frontmatter[key] = values;
  }
  return { frontmatter, body: `${lines.slice(end + 1).join('\n').replace(/\n*$/, '')}\n` };
}

export function canonicalPlanView(bytes) {
  const { frontmatter, body } = parsePlan(bytes);
  const kept = Object.fromEntries(Object.entries(frontmatter).filter(([key]) => !EXCLUDED_FRONTMATTER.has(key)));
  const counts = new Map(); let fence = null; const retained = [];
  for (const line of body.split('\n')) {
    const fenceMatch = /^( {0,3})(`{3,}|~{3,})(.*)$/.exec(line);
    if (fence === null && fenceMatch) {
      fence = { marker: fenceMatch[2][0], length: fenceMatch[2].length };
      retained.push(line); continue;
    }
    if (fence !== null && fenceMatch && fenceMatch[2][0] === fence.marker && fenceMatch[2].length >= fence.length && /^\s*$/.test(fenceMatch[3])) {
      fence = null; retained.push(line); continue;
    }
    const record = fence === null ? MACHINE_RECORD.exec(line) : null;
    if (!record) { retained.push(line); continue; }
    const [, kind, payload] = record; const count = (counts.get(kind) || 0) + 1; counts.set(kind, count);
    if (count > 1) throw new Error(`duplicate ${kind}`);
    let parsed; try { parsed = JSON.parse(payload); } catch { throw new Error(`${kind} must be one-line JSON`); }
    if (jcs(parsed) !== payload) throw new Error(`${kind} must be compact JCS`);
  }
  return `${jcs(kept)}\n${retained.join('\n').replace(/\n*$/, '')}\n`;
}

function tableCells(line) {
  const text = line.trim(); if (!text.startsWith('|') || !text.endsWith('|')) return null;
  const cells = []; let cell = ''; let escaped = false;
  for (const ch of text.slice(1, -1)) {
    if (escaped) { cell += ch; escaped = false; continue; }
    if (ch === '\\') { escaped = true; continue; }
    if (ch === '|') { cells.push(cell.trim()); cell = ''; } else cell += ch;
  }
  if (escaped) cell += '\\'; cells.push(cell.trim()); return cells;
}

function uncode(value) {
  const text = value.trim(); return text.startsWith('`') && text.endsWith('`') && text.length >= 2 ? text.slice(1, -1) : text;
}

export function acceptanceInventory(bytes) {
  const { body } = parsePlan(bytes); const lines = body.split('\n');
  const start = lines.findIndex((line) => /^## Acceptance criteria\s*$/.test(line));
  if (start < 0) throw new Error('acceptance criteria section missing');
  const section = lines.slice(start + 1, lines.findIndex((line, index) => index > start && /^## /.test(line)) < 0 ? lines.length : lines.findIndex((line, index) => index > start && /^## /.test(line)));
  const rows = section.map(tableCells).filter(Boolean); if (rows.length < 3) throw new Error('acceptance criteria must be a table');
  const header = rows[0].map((cell) => cell.toLowerCase()); const idAt = header.indexOf('id'); const commandAt = header.indexOf('command'); const expectedAt = header.indexOf('expected');
  if (idAt < 0 || commandAt < 0 || expectedAt < 0 || !rows[1].every((cell) => /^:?-{3,}:?$/.test(cell))) throw new Error('acceptance table header');
  const criteria = []; const ids = new Set();
  for (const row of rows.slice(2)) {
    if (row.length !== header.length) throw new Error('acceptance table column mismatch');
    const id = uncode(row[idAt]); const command = uncode(row[commandAt]); const expected = uncode(row[expectedAt]);
    if (!/^A[1-9][0-9]*$/.test(id) || ids.has(id)) throw new Error('acceptance criterion id');
    string(command, 'acceptance criterion command'); string(expected, 'acceptance criterion expected'); ids.add(id); criteria.push({ id, command, expected });
  }
  if (criteria.length === 0) throw new Error('acceptance inventory must be nonempty');
  return { schema: 1, criteria };
}

function assertClosed(object, keys, label) {
  if (!object || typeof object !== 'object' || Array.isArray(object)) throw new Error(`${label} must be an object`);
  for (const key of Object.keys(object)) if (!keys.includes(key)) throw new Error(`${label} has unknown key ${key}`);
  for (const key of keys) if (!Object.hasOwn(object, key)) throw new Error(`${label} missing ${key}`);
}
function string(value, label) { if (typeof value !== 'string' || value.length === 0) throw new Error(`${label} must be non-empty`); }
function oneOf(value, allowed, label) { if (!allowed.has(value)) throw new Error(`${label} is invalid`); }
function digest(value, label) { if (!HEX64.test(value)) throw new Error(`${label} must be sha256`); }
function iso(value, label) { if (!ISO.test(value) || Number.isNaN(Date.parse(value))) throw new Error(`${label} must be ISO datetime`); }

export function validatePolicy(policy) {
  assertClosed(policy, ['schema', 'cross_company_consent', 'zero_reviewer_policy', 'orchestrator_preference', 'openai_tiers', 'anthropic_tiers', 'provenance'], 'policy');
  if (policy.schema !== 1) throw new Error('policy schema');
  oneOf(policy.cross_company_consent, new Set(['always', 'ask', 'never']), 'cross_company_consent');
  oneOf(policy.zero_reviewer_policy, new Set(['ask', 'proceed', 'block']), 'zero_reviewer_policy');
  oneOf(policy.orchestrator_preference, new Set(['auto', 'in_session', 'cli']), 'orchestrator_preference');
  for (const company of ['openai', 'anthropic']) {
    const tiers = policy[`${company}_tiers`];
    if (!Array.isArray(tiers) || tiers.length === 0) throw new Error(`${company}_tiers`);
    for (const tier of tiers) {
      assertClosed(tier, ['model', 'effort', 'transports'], 'tier'); string(tier.model, 'model'); string(tier.effort, 'effort');
      if (!Array.isArray(tier.transports) || tier.transports.length === 0 || new Set(tier.transports).size !== tier.transports.length) throw new Error('tier transports');
      tier.transports.forEach((v) => oneOf(v, new Set(['in_session', 'cli']), 'transport'));
    }
  }
  assertClosed(policy.provenance, ['cross_company_consent', 'zero_reviewer_policy', 'orchestrator_preference', 'openai_tiers', 'anthropic_tiers'], 'provenance');
  Object.values(policy.provenance).forEach((value) => oneOf(value, SOURCES, 'provenance source'));
  return policy;
}

export function validateRequest(request) {
  assertClosed(request, ['schema', 'request_id', 'phase', 'lifecycle_intent', 'reviewed_commit_or_head', 'planned_at_commit', 'execution_base_commit', 'diff_sha256', 'acceptance_inventory_sha256', 'input_sha256', 'bundle_sha256', 'author', 'policy', 'policy_sha256'], 'request');
  if (request.schema !== 1 || !UUID.test(request.request_id)) throw new Error('request identity');
  oneOf(request.phase, new Set(['draft', 'completion']), 'phase');
  oneOf(request.lifecycle_intent, new Set(['none', 'start', 'schedule_fire', 'auto_execute']), 'lifecycle_intent');
  if (!HEX40.test(request.reviewed_commit_or_head)) throw new Error('reviewed commit');
  if (request.phase === 'completion') {
    for (const key of ['planned_at_commit', 'execution_base_commit']) if (!HEX40.test(request[key])) throw new Error(`completion request ${key}`);
    digest(request.diff_sha256, 'completion request diff'); digest(request.acceptance_inventory_sha256, 'completion request acceptance inventory');
  } else if (request.planned_at_commit !== null || request.execution_base_commit !== null || request.diff_sha256 !== null || request.acceptance_inventory_sha256 !== null) throw new Error('draft request carries completion identity');
  digest(request.input_sha256, 'input_sha256'); digest(request.bundle_sha256, 'bundle_sha256'); digest(request.policy_sha256, 'policy_sha256');
  assertClosed(request.author, ['company', 'tool', 'model', 'effort'], 'request author'); oneOf(request.author.company, new Set(['openai', 'anthropic']), 'request author company'); for (const key of ['tool', 'model', 'effort']) string(request.author[key], `request author ${key}`);
  validatePolicy(request.policy);
  if (sha256(jcs(request.policy)) !== request.policy_sha256) throw new Error('policy hash mismatch');
  return request;
}

export function reviewerSchema(leg) {
  oneOf(leg, new Set(['X', 'S']), 'leg');
  const closed = (properties, required = Object.keys(properties)) => ({ type: 'object', additionalProperties: false, properties, required });
  const str = { type: 'string', minLength: 1 };
  const tier = closed({ model: str, effort: str, transports: { type: 'array', minItems: 1, uniqueItems: true, items: { enum: ['in_session', 'cli'] } } });
  const provenance = closed({ cross_company_consent: { enum: [...SOURCES] }, zero_reviewer_policy: { enum: [...SOURCES] }, orchestrator_preference: { enum: [...SOURCES] }, openai_tiers: { enum: [...SOURCES] }, anthropic_tiers: { enum: [...SOURCES] } });
  const policy = closed({ schema: { const: 1 }, cross_company_consent: { enum: ['always', 'ask', 'never'] }, zero_reviewer_policy: { enum: ['ask', 'proceed', 'block'] }, orchestrator_preference: { enum: ['auto', 'in_session', 'cli'] }, openai_tiers: { type: 'array', minItems: 1, items: tier }, anthropic_tiers: { type: 'array', minItems: 1, items: tier }, provenance });
  const request = closed({
    schema: { const: 1 }, request_id: { type: 'string', pattern: UUID.source }, phase: { enum: ['draft', 'completion'] },
    lifecycle_intent: { enum: ['none', 'start', 'schedule_fire', 'auto_execute'] }, reviewed_commit_or_head: { type: 'string', pattern: HEX40.source },
    planned_at_commit: { type: ['string', 'null'], pattern: HEX40.source }, execution_base_commit: { type: ['string', 'null'], pattern: HEX40.source },
    diff_sha256: { type: ['string', 'null'], pattern: HEX64.source }, acceptance_inventory_sha256: { type: ['string', 'null'], pattern: HEX64.source },
    input_sha256: { type: 'string', pattern: HEX64.source }, bundle_sha256: { type: 'string', pattern: HEX64.source },
    author: closed({ company: { enum: ['openai', 'anthropic'] }, tool: str, model: str, effort: str }),
    policy, policy_sha256: { type: 'string', pattern: HEX64.source },
  });
  const finding = closed({ id: { type: 'string', pattern: `^${leg}[1-9][0-9]*$` }, severity: { enum: ['high', 'medium', 'low'] }, section: str, path: { type: ['string', 'null'] }, locator: { type: ['string', 'null'] }, defect: str, fix: str, evidence: str });
  return closed({ schema: { const: 1 }, leg: { const: leg }, request, verdict: { enum: ['ready', 'not_ready'] }, score: { type: 'integer', minimum: 0, maximum: 100 }, findings: { type: 'array', items: finding }, confirmations: { type: 'array', items: str } });
}

function validateFinding(finding, leg, ids) {
  assertClosed(finding, ['id', 'severity', 'section', 'path', 'locator', 'defect', 'fix', 'evidence'], 'finding');
  if (!new RegExp(`^${leg}[1-9][0-9]*$`).test(finding.id) || ids.has(finding.id)) throw new Error('finding id');
  ids.add(finding.id); oneOf(finding.severity, new Set(['high', 'medium', 'low']), 'severity');
  for (const key of ['section', 'defect', 'fix', 'evidence']) string(finding[key], key);
  for (const key of ['path', 'locator']) if (finding[key] !== null && typeof finding[key] !== 'string') throw new Error(key);
}

function validateDecision(decision, request, expectedKind = null) {
  if (decision === null) return;
  const common = ['schema', 'kind', 'decision', 'actor', 'reason', 'at', 'request_id', 'input_sha256'];
  assertClosed(decision, common, 'decision');
  if (decision.schema !== 1 || decision.request_id !== request.request_id || decision.input_sha256 !== request.input_sha256) throw new Error('decision request mismatch');
  oneOf(decision.kind, new Set(['x_consent', 'zero_reviewer']), 'decision kind');
  if (expectedKind && decision.kind !== expectedKind) throw new Error(`decision must be ${expectedKind}`);
  oneOf(decision.decision, decision.kind === 'x_consent' ? new Set(['allow', 'deny']) : new Set(['proceed', 'block']), 'decision');
  string(decision.actor, 'decision actor'); string(decision.reason, 'decision reason'); iso(decision.at, 'decision at');
}

function validateAttempt(attempt) {
  const keys = ['schema', 'model', 'effort', 'transport', 'started', 'output_started', 'result', 'exit_code', 'signal', 'child_id', 'denial_source', 'retry_cause', 'timeout_mode', 'timeout_seconds', 'reason', 'stdout_sha256', 'stderr_sha256'];
  assertClosed(attempt, keys, 'attempt'); if (attempt.schema !== 1) throw new Error('attempt schema');
  string(attempt.model, 'attempt model'); string(attempt.effort, 'attempt effort'); oneOf(attempt.transport, new Set(['in_session', 'cli']), 'attempt transport');
  if (typeof attempt.started !== 'boolean' || typeof attempt.output_started !== 'boolean') throw new Error('attempt booleans');
  oneOf(attempt.result, ATTEMPT_RESULTS, 'attempt result');
  if (attempt.exit_code !== null && (!Number.isInteger(attempt.exit_code) || attempt.exit_code < -2147483648 || attempt.exit_code > 2147483647)) throw new Error('attempt exit code');
  for (const key of ['signal', 'child_id']) if (typeof attempt[key] !== 'string' && attempt[key] !== null) throw new Error(`attempt ${key}`);
  string(attempt.reason, 'attempt reason');
  if (attempt.denial_source !== null) oneOf(attempt.denial_source, new Set(['sandbox', 'managed_policy', 'runtime_policy']), 'denial source');
  if (attempt.retry_cause !== null) oneOf(attempt.retry_cause, new Set(['transport_EAGAIN', 'transport_ETIMEDOUT', 'transport_ECONNRESET']), 'retry cause');
  if (attempt.timeout_mode !== null) oneOf(attempt.timeout_mode, new Set(['gnu_timeout', 'orchestrator_tool']), 'timeout mode');
  if (attempt.timeout_seconds !== 600) throw new Error('timeout seconds');
  for (const key of ['stdout_sha256', 'stderr_sha256']) if (attempt[key] !== null) digest(attempt[key], key);
  if (attempt.started && (!attempt.child_id || attempt.timeout_mode === null)) throw new Error('started attempt requires child_id and timeout mode');
  if (!attempt.started && (attempt.child_id !== null || attempt.output_started || attempt.exit_code !== null || attempt.signal !== null || attempt.timeout_mode !== null || attempt.stdout_sha256 !== null || attempt.stderr_sha256 !== null)) throw new Error('unstarted attempt carries process evidence');
  if (!attempt.started && !['platform_denied', 'auth_failed', 'model_unavailable'].includes(attempt.result)) throw new Error('invalid unstarted attempt result');
  if (attempt.started && (attempt.stdout_sha256 === null || attempt.stderr_sha256 === null)) throw new Error('started attempt requires output hashes');
  if (attempt.result === 'passed' && (!attempt.started || !attempt.output_started || attempt.exit_code !== 0 || attempt.signal !== null || attempt.denial_source !== null || attempt.retry_cause !== null || attempt.timeout_mode === null)) throw new Error('invalid passed attempt');
  if (attempt.result === 'platform_denied' && (attempt.output_started || attempt.denial_source === null || attempt.retry_cause !== null || (attempt.exit_code !== null && attempt.signal !== null))) throw new Error('invalid platform denial attempt');
  if (attempt.result === 'transient_transport' && (!attempt.started || attempt.output_started || attempt.retry_cause === null || attempt.denial_source !== null || attempt.exit_code !== null || attempt.signal !== null)) throw new Error('invalid transient attempt');
  if (attempt.result === 'deadline_exceeded' && (!attempt.started || attempt.timeout_mode === null || attempt.retry_cause !== null)) throw new Error('invalid deadline attempt');
  if (attempt.result === 'nonzero_exit' && (!attempt.started || attempt.exit_code === null || attempt.exit_code === 0 || attempt.signal !== null)) throw new Error('invalid nonzero attempt');
  if (attempt.result === 'signaled' && (!attempt.started || !attempt.signal || attempt.exit_code !== null)) throw new Error('invalid signaled attempt');
  if (attempt.result === 'unparseable' && (!attempt.started || !attempt.output_started || attempt.exit_code !== 0 || attempt.signal !== null)) throw new Error('invalid unparseable attempt');
  if (['auth_failed', 'model_unavailable'].includes(attempt.result) && attempt.started && (attempt.exit_code === null || attempt.exit_code === 0 || attempt.signal !== null)) throw new Error(`invalid ${attempt.result} attempt`);
  if (attempt.result === 'deadline_exceeded' && ((attempt.exit_code === null) === (attempt.signal === null))) throw new Error('deadline attempt requires exactly one exit or signal');
  if (!['platform_denied', 'transient_transport'].includes(attempt.result) && attempt.denial_source !== null) throw new Error('unexpected denial source');
  if (attempt.result !== 'transient_transport' && attempt.retry_cause !== null) throw new Error('unexpected retry cause');
}

function companyForLeg(authorCompany, leg) {
  oneOf(authorCompany, new Set(['openai', 'anthropic']), 'review author company');
  return leg === 'S' ? authorCompany : (authorCompany === 'openai' ? 'anthropic' : 'openai');
}

function validateAttemptSequence(attempts, policy, company) {
  if (attempts.length === 0) return 0;
  const transport = attempts[0].transport;
  if (policy.orchestrator_preference !== 'auto' && transport !== policy.orchestrator_preference) throw new Error('attempt transport violates orchestrator preference');
  if (attempts.some((attempt) => attempt.transport !== transport)) throw new Error('attempt transport changed within leg');
  const tiers = policy[`${company}_tiers`].filter((tier) => tier.transports.includes(transport));
  if (tiers.length === 0 || attempts.length > tiers.length + 1) throw new Error('raw leg attempt bound');
  let tier = 0; let retryUsed = false; let expectRetry = false;
  for (let i = 0; i < attempts.length; i += 1) {
    const attempt = attempts[i]; validateAttempt(attempt);
    if (!tiers[tier] || attempt.model !== tiers[tier].model || attempt.effort !== tiers[tier].effort) throw new Error('attempt tier order mismatch');
    if (expectRetry) expectRetry = false;
    if (attempt.result === 'transient_transport') {
      if (retryUsed || i === attempts.length - 1) throw new Error('invalid transient retry order');
      retryUsed = true; expectRetry = true; continue;
    }
    if (attempt.result === 'model_unavailable') {
      tier += 1;
      if (i < attempts.length - 1 && !tiers[tier]) throw new Error('attempt continued past tier list');
      continue;
    }
    if (i !== attempts.length - 1) throw new Error('attempt after terminal result');
  }
  if (expectRetry) throw new Error('missing transient retry');
  return tiers.length;
}

function validateWaiverObject(waiver, phase, inputSha) {
  assertClosed(waiver, ['phase', 'input_sha256', 'legs', 'actor', 'reason', 'at'], 'waiver');
  if (waiver.phase !== phase || waiver.input_sha256 !== inputSha) throw new Error('stale waiver');
  if (!Array.isArray(waiver.legs) || waiver.legs.length === 0 || new Set(waiver.legs).size !== waiver.legs.length) throw new Error('waiver legs');
  const normalized = [...waiver.legs].sort((a, b) => ['X', 'S'].indexOf(a) - ['X', 'S'].indexOf(b)); normalized.forEach((leg) => oneOf(leg, new Set(['X', 'S']), 'waiver leg'));
  if (jcs(waiver.legs) !== jcs(normalized)) throw new Error('waiver legs must be normalized');
  string(waiver.actor, 'waiver actor'); string(waiver.reason, 'waiver reason'); iso(waiver.at, 'waiver at'); return waiver;
}

export function validateRawLeg(raw, request, leg, { expectedWaiver = null } = {}) {
  const keys = ['schema', 'leg', 'request', 'result', 'attempts', 'selected', 'reviewer_output', 'findings', 'findings_sha256', 'severity_totals', 'waiver', 'waiver_sha256', 'decision_evidence', 'reason'];
  assertClosed(raw, keys, 'raw leg'); if (raw.schema !== 1 || raw.leg !== leg || jcs(raw.request) !== jcs(request)) throw new Error('raw leg request mismatch');
  oneOf(raw.result, LEG_RESULTS, 'leg result'); if (!Array.isArray(raw.attempts)) throw new Error('raw leg attempts');
  const company = companyForLeg(request.author.company, leg); const eligibleTierCount = validateAttemptSequence(raw.attempts, request.policy, company);
  if (raw.selected !== null) { assertClosed(raw.selected, ['model', 'effort', 'transport'], 'selected'); string(raw.selected.model, 'selected model'); string(raw.selected.effort, 'selected effort'); oneOf(raw.selected.transport, new Set(['in_session', 'cli']), 'selected transport'); }
  if (!Array.isArray(raw.findings)) throw new Error('raw findings'); const ids = new Set(); raw.findings.forEach((finding) => validateFinding(finding, leg, ids));
  if (raw.reviewer_output !== null) {
    assertClosed(raw.reviewer_output, ['verdict', 'score', 'confirmations', 'structured_output_sha256'], 'raw reviewer output');
    oneOf(raw.reviewer_output.verdict, new Set(['ready', 'not_ready']), 'raw reviewer verdict');
    if (!Number.isInteger(raw.reviewer_output.score) || raw.reviewer_output.score < 0 || raw.reviewer_output.score > 100) throw new Error('raw reviewer score');
    if (!Array.isArray(raw.reviewer_output.confirmations)) throw new Error('raw reviewer confirmations');
    raw.reviewer_output.confirmations.forEach((value) => string(value, 'raw reviewer confirmation'));
    digest(raw.reviewer_output.structured_output_sha256, 'structured output hash');
    const structured = { schema: 1, leg, request, verdict: raw.reviewer_output.verdict, score: raw.reviewer_output.score, findings: raw.findings, confirmations: raw.reviewer_output.confirmations };
    validateReviewerOutput(structured, request, leg);
    if (raw.reviewer_output.structured_output_sha256 !== sha256(jcs(structured))) throw new Error('structured output hash mismatch');
  }
  assertClosed(raw.severity_totals, ['high', 'medium', 'low'], 'severity totals'); for (const value of Object.values(raw.severity_totals)) if (!Number.isInteger(value) || value < 0) throw new Error('severity total');
  const totals = { high: 0, medium: 0, low: 0 }; raw.findings.forEach((finding) => { totals[finding.severity] += 1; }); if (jcs(totals) !== jcs(raw.severity_totals)) throw new Error('severity totals mismatch');
  if (raw.result === 'passed') { digest(raw.findings_sha256, 'findings hash'); if (raw.findings_sha256 !== sha256(jcs([...raw.findings].sort((a, b) => compareUtf16(a.id, b.id))))) throw new Error('findings hash mismatch'); }
  else if (raw.findings.length || raw.findings_sha256 !== null) throw new Error('non-passed leg carries findings');
  if (leg === 'S' && raw.decision_evidence !== null) throw new Error('S leg cannot carry consent decision');
  if (leg === 'X') {
    if (request.policy.cross_company_consent === 'always' && raw.decision_evidence !== null) throw new Error('standing consent requires null decision evidence');
    if (request.policy.cross_company_consent === 'never' && raw.result !== 'not_authorized' && raw.result !== 'waived') throw new Error('X cannot run when consent is never');
    if (request.policy.cross_company_consent === 'ask' && raw.result !== 'waived') {
      validateDecision(raw.decision_evidence, request, 'x_consent');
      if (raw.result === 'not_authorized' && raw.decision_evidence?.decision !== 'deny') throw new Error('not_authorized requires deny evidence');
      if (raw.result !== 'not_authorized' && raw.decision_evidence?.decision !== 'allow') throw new Error('X attempt requires allow evidence');
    }
  }
  if (raw.result === 'passed') {
    const last = raw.attempts.at(-1);
    if (raw.selected === null || raw.reviewer_output === null || last?.result !== 'passed' || jcs(raw.selected) !== jcs({ model: last.model, effort: last.effort, transport: last.transport }) || raw.reason !== null || raw.waiver !== null) throw new Error('invalid passed leg');
  } else if (raw.selected !== null || raw.reviewer_output !== null) throw new Error('non-passed leg cannot select reviewer output');
  if (raw.result === 'waived') {
    if (raw.waiver === null || raw.attempts.length || raw.findings.length || raw.reason !== null || raw.decision_evidence !== null) throw new Error('invalid waived leg');
    validateWaiverObject(raw.waiver, request.phase, request.input_sha256); digest(raw.waiver_sha256, 'waiver_sha256'); if (raw.waiver_sha256 !== sha256(jcs(raw.waiver))) throw new Error('waiver hash mismatch'); if (!raw.waiver.legs.includes(leg)) throw new Error('waiver does not cover leg');
    if (expectedWaiver === null || jcs(raw.waiver) !== jcs(expectedWaiver)) throw new Error('waiver is not the exact current snapshot');
  } else if (raw.waiver !== null || raw.waiver_sha256 !== null) throw new Error('non-waived leg carries waiver');
  if (raw.result === 'not_authorized') {
    if (leg !== 'X' || raw.attempts.length || raw.findings.length || raw.reason !== null) throw new Error('invalid not_authorized leg');
    if (request.policy.cross_company_consent === 'always') throw new Error('standing consent cannot be not_authorized');
    if (request.policy.cross_company_consent === 'never' && raw.decision_evidence !== null) throw new Error('configured never requires null decision evidence');
  }
  if (!['passed', 'waived', 'not_authorized'].includes(raw.result)) {
    string(raw.reason, 'terminal leg reason'); const classified = classifyLeg({ leg, policy: request.policy, decision: raw.decision_evidence, attempts: raw.attempts, eligibleTierCount });
    if (classified !== raw.result) throw new Error(`leg result mismatch: expected ${classified}`);
  } else if (raw.result !== 'waived' && raw.reason !== null) throw new Error('successful/authorization leg reason must be null');
  return raw;
}

export function validateReconciliation(reconciliation, findings) {
  assertClosed(reconciliation, ['accepted', 'rejected'], 'reconciliation');
  if (!Array.isArray(reconciliation.accepted) || !Array.isArray(reconciliation.rejected)) throw new Error('reconciliation arrays');
  const known = new Set(findings.map((finding) => finding.id)); const used = new Set();
  for (const id of reconciliation.accepted) { if (!known.has(id) || used.has(id)) throw new Error('accepted finding id'); used.add(id); }
  for (const row of reconciliation.rejected) { assertClosed(row, ['id', 'reason'], 'rejected finding'); if (!known.has(row.id) || used.has(row.id)) throw new Error('rejected finding id'); string(row.reason, 'rejection reason'); used.add(row.id); }
  if (used.size !== known.size) throw new Error('reconciliation is not an exact partition');
  return reconciliation;
}

function validateFindingEvidence(finding, rawByLeg, allowPrimary) {
  assertClosed(finding, ['id', 'source', 'severity', 'path', 'locator', 'defect', 'fix', 'reproduction'], 'finding evidence');
  string(finding.id, 'finding evidence id'); oneOf(finding.source, new Set(['X', 'S', 'primary']), 'finding source');
  if (finding.source === 'primary' && !allowPrimary) throw new Error('draft reproduction cannot use primary source');
  oneOf(finding.severity, new Set(['high', 'medium', 'low']), 'finding evidence severity');
  for (const key of ['path', 'locator']) if (finding[key] !== null && typeof finding[key] !== 'string') throw new Error(`finding evidence ${key}`);
  string(finding.defect, 'finding defect'); string(finding.fix, 'finding fix');
  assertClosed(finding.reproduction, ['method', 'command', 'exit_code', 'evidence_sha256'], 'reproduction'); oneOf(finding.reproduction.method, new Set(['read', 'command']), 'reproduction method'); digest(finding.reproduction.evidence_sha256, 'reproduction evidence');
  if (finding.reproduction.method === 'read' && (finding.reproduction.command !== null || finding.reproduction.exit_code !== null)) throw new Error('read reproduction carries command evidence');
  if (finding.reproduction.method === 'command') { string(finding.reproduction.command, 'reproduction command'); if (!Number.isInteger(finding.reproduction.exit_code)) throw new Error('command reproduction exit code'); }
  if (finding.source !== 'primary') {
    const raw = rawByLeg[finding.source]; const source = raw.findings.find((candidate) => candidate.id === finding.id); if (!source) throw new Error('reproduced id not present in raw leg');
    for (const key of ['severity', 'path', 'locator', 'defect', 'fix']) if (jcs(finding[key]) !== jcs(source[key])) throw new Error(`reproduced ${key} mismatch`);
  }
}

function validateReproduced(reproduced, X, S, allowPrimary) {
  if (!Array.isArray(reproduced)) throw new Error('reproduced must be array'); const ids = new Set();
  for (const finding of reproduced) { validateFindingEvidence(finding, { X, S }, allowPrimary); if (ids.has(finding.id)) throw new Error('duplicate reproduced id'); ids.add(finding.id); }
  return reproduced;
}

function validateAcceptedReproduced(X, S, reproduced) {
  const ids = new Set(reproduced.map((finding) => finding.id));
  for (const persisted of [X, S]) for (const id of persisted.reconciliation.accepted) if (!ids.has(id)) throw new Error('accepted finding was not reproduced');
}

function validateAcceptance(value) {
  assertClosed(value, ['criterion_id', 'command', 'expected', 'exit_code', 'actual_sha256', 'met'], 'acceptance evidence');
  string(value.criterion_id, 'criterion id'); string(value.command, 'acceptance command'); string(value.expected, 'acceptance expected'); if (!Number.isInteger(value.exit_code) || typeof value.met !== 'boolean') throw new Error('acceptance result'); digest(value.actual_sha256, 'acceptance output hash');
}

export function validateAcceptanceInventory(value) {
  assertClosed(value, ['schema', 'criteria'], 'acceptance inventory');
  if (value.schema !== 1 || !Array.isArray(value.criteria) || value.criteria.length === 0) throw new Error('acceptance inventory must be nonempty');
  const ids = new Set();
  for (const criterion of value.criteria) {
    assertClosed(criterion, ['id', 'command', 'expected'], 'acceptance inventory criterion');
    if (!/^A[1-9][0-9]*$/.test(criterion.id) || ids.has(criterion.id)) throw new Error('acceptance inventory criterion id');
    string(criterion.command, 'acceptance inventory command'); string(criterion.expected, 'acceptance inventory expected'); ids.add(criterion.id);
  }
  return value;
}

function validateAcceptanceEvidence(evidence, inventory) {
  validateAcceptanceInventory(inventory);
  if (!Array.isArray(evidence) || evidence.length !== inventory.criteria.length) throw new Error('acceptance evidence must exactly cover inventory');
  evidence.forEach((row, index) => {
    validateAcceptance(row); const criterion = inventory.criteria[index];
    if (row.criterion_id !== criterion.id || row.command !== criterion.command || row.expected !== criterion.expected) throw new Error('acceptance evidence order or criterion mismatch');
  });
}

function validateCi(value) {
  assertClosed(value, ['command', 'exit_code', 'first_failure', 'output_sha256'], 'CI evidence'); string(value.command, 'CI command'); if (!Number.isInteger(value.exit_code)) throw new Error('CI exit code'); digest(value.output_sha256, 'CI output hash');
  if (value.exit_code === 0 && value.first_failure !== null) throw new Error('passing CI carries failure'); if (value.exit_code !== 0) string(value.first_failure, 'CI first failure');
}

export function deriveCompletionVerdict(primary, inventory, X, S) {
  validatePrimary(primary, inventory);
  if ([X, S].some((leg) => leg?.result === 'passed' && leg.reviewer_output?.verdict === 'not_ready')) return 'regressed';
  if (primary.ci.exit_code !== 0 || primary.regressions.length > 0 || primary.findings.some((finding) => finding.severity === 'high')) return 'regressed';
  if (primary.goal_met === 'yes' && primary.acceptance.every((criterion) => criterion.met)) return 'passed';
  return 'partial';
}

function validatePrimary(value, inventory) {
  assertClosed(value, ['goal_met', 'findings', 'acceptance', 'ci', 'regressions', 'followups'], 'primary completion evidence'); oneOf(value.goal_met, new Set(['yes', 'partial', 'no']), 'goal_met');
  if (!Array.isArray(value.findings) || !Array.isArray(value.acceptance) || !Array.isArray(value.regressions) || !Array.isArray(value.followups)) throw new Error('primary arrays');
  const empty = { findings: [] }; const ids = new Set(); for (const finding of value.findings) { validateFindingEvidence(finding, { X: empty, S: empty }, true); if (finding.source !== 'primary' || ids.has(finding.id)) throw new Error('primary finding id/source'); ids.add(finding.id); }
  validateAcceptanceEvidence(value.acceptance, inventory); validateCi(value.ci); value.regressions.forEach((item) => string(item, 'regression')); value.followups.forEach((item) => string(item, 'followup')); return value;
}

function validatePersistedLeg(value, request, leg, context) {
  assertClosed(value, ['request', 'raw', 'reconciliation'], 'persisted leg'); if (jcs(value.request) !== jcs(request)) throw new Error('persisted request mismatch');
  validateRawLeg(value.raw, request, leg, context); validateReconciliation(value.reconciliation, value.raw.findings);
}

function validateOutcome(X, S, policy, decisionEvidence, outcome, eligible = null) {
  const passed = [X, S].filter((leg) => leg.result === 'passed').length; let expected; let shouldBeEligible;
  const ready = [X, S].filter((leg) => leg.result === 'passed').every((leg) => leg.reviewer_output.verdict === 'ready');
  if (passed === 2) { expected = 'dual'; shouldBeEligible = ready; if (decisionEvidence !== null) throw new Error('dual outcome cannot carry zero-review decision'); }
  else if (passed === 1) { expected = 'single'; shouldBeEligible = ready; if (decisionEvidence !== null) throw new Error('single outcome cannot carry zero-review decision'); }
  else if (policy.zero_reviewer_policy === 'proceed') { expected = 'zero_degraded'; shouldBeEligible = true; if (decisionEvidence !== null) throw new Error('configured proceed requires null decision'); }
  else if (policy.zero_reviewer_policy === 'block') { expected = 'blocked'; shouldBeEligible = false; if (decisionEvidence !== null) throw new Error('configured block requires null decision'); }
  else {
    if (decisionEvidence === null) throw new Error('zero-review ask requires decision evidence');
    validateDecision(decisionEvidence, X.request, 'zero_reviewer'); expected = decisionEvidence.decision === 'proceed' ? 'zero_degraded' : 'blocked'; shouldBeEligible = decisionEvidence.decision === 'proceed';
  }
  if (outcome !== expected) throw new Error(`outcome mismatch: expected ${expected}`);
  if (eligible !== null && eligible !== shouldBeEligible) throw new Error('pre_execution_eligible mismatch');
}

export function validateDraftRunResult(result, { waivers = [] } = {}) {
  assertClosed(result, ['schema', 'kind', 'request', 'X', 'S', 'reproduced', 'decision_evidence', 'outcome', 'pre_execution_eligible'], 'draft run result');
  if (result.schema !== 1 || result.kind !== 'draft') throw new Error('draft run kind'); validateRequest(result.request); if (result.request.phase !== 'draft') throw new Error('draft run phase');
  const normalized = validateWaivers(waivers, 'draft', result.request.input_sha256); const waiverFor = (leg) => normalized.find((waiver) => waiver.legs.includes(leg)) || null;
  validateRawLeg(result.X, result.request, 'X', { expectedWaiver: waiverFor('X') }); validateRawLeg(result.S, result.request, 'S', { expectedWaiver: waiverFor('S') });
  validateReproduced(result.reproduced, result.X, result.S, false); validateOutcome(result.X, result.S, result.request.policy, result.decision_evidence, result.outcome, result.pre_execution_eligible); return result;
}

export function validateCompletionRunResult(result, { waivers = [] } = {}) {
  assertClosed(result, ['schema', 'kind', 'request', 'plan_input_sha256', 'diff_sha256', 'acceptance_inventory', 'acceptance_inventory_sha256', 'X', 'S', 'reproduced', 'decision_evidence', 'outcome', 'primary', 'completion_verdict'], 'completion run result');
  if (result.schema !== 1 || result.kind !== 'completion') throw new Error('completion run kind'); validateRequest(result.request); if (result.request.phase !== 'completion' || result.request.lifecycle_intent !== 'none') throw new Error('completion request phase/intent');
  if (result.plan_input_sha256 !== result.request.input_sha256 || result.diff_sha256 !== result.request.diff_sha256) throw new Error('completion plan or diff input mismatch'); digest(result.diff_sha256, 'completion diff');
  validateAcceptanceInventory(result.acceptance_inventory); if (result.acceptance_inventory_sha256 !== sha256(jcs(result.acceptance_inventory)) || result.acceptance_inventory_sha256 !== result.request.acceptance_inventory_sha256) throw new Error('completion acceptance inventory mismatch');
  const normalized = validateWaivers(waivers, 'completion', result.request.input_sha256); const waiverFor = (leg) => normalized.find((waiver) => waiver.legs.includes(leg)) || null;
  validateRawLeg(result.X, result.request, 'X', { expectedWaiver: waiverFor('X') }); validateRawLeg(result.S, result.request, 'S', { expectedWaiver: waiverFor('S') }); validateReproduced(result.reproduced, result.X, result.S, true); validatePrimary(result.primary, result.acceptance_inventory);
  validateOutcome(result.X, result.S, result.request.policy, result.decision_evidence, result.outcome); if (result.completion_verdict !== deriveCompletionVerdict(result.primary, result.acceptance_inventory, result.X, result.S)) throw new Error('completion verdict mismatch'); return result;
}

export function validateDraftReceipt(receipt, expectedInput = null, { waivers = [] } = {}) {
  const keys = ['schema', 'phase', 'request', 'input_sha256', 'reviewed_commit', 'author', 'policy', 'policy_sha256', 'X', 'S', 'reproduced', 'decision_evidence', 'outcome', 'pre_execution_eligible', 'reviewed_at'];
  assertClosed(receipt, keys, 'draft receipt'); if (receipt.schema !== 1 || receipt.phase !== 'draft') throw new Error('draft receipt phase'); validateRequest(receipt.request);
  if (receipt.input_sha256 !== receipt.request.input_sha256 || receipt.reviewed_commit !== receipt.request.reviewed_commit_or_head) throw new Error('draft receipt input mismatch'); if (expectedInput && receipt.input_sha256 !== expectedInput) throw new Error('stale draft receipt');
  assertClosed(receipt.author, ['company', 'tool', 'model', 'effort'], 'author'); oneOf(receipt.author.company, new Set(['openai', 'anthropic']), 'author company'); for (const key of ['tool', 'model', 'effort']) string(receipt.author[key], `author ${key}`); if (jcs(receipt.author) !== jcs(receipt.request.author)) throw new Error('receipt author mismatch');
  if (jcs(receipt.policy) !== jcs(receipt.request.policy) || receipt.policy_sha256 !== receipt.request.policy_sha256) throw new Error('receipt policy mismatch');
  const normalizedWaivers = validateWaivers(waivers, receipt.request.phase, receipt.request.input_sha256); const waiverFor = (leg) => normalizedWaivers.find((waiver) => waiver.legs.includes(leg)) || null;
  validatePersistedLeg(receipt.X, receipt.request, 'X', { expectedWaiver: waiverFor('X') }); validatePersistedLeg(receipt.S, receipt.request, 'S', { expectedWaiver: waiverFor('S') });
  validateReproduced(receipt.reproduced, receipt.X.raw, receipt.S.raw, false); validateAcceptedReproduced(receipt.X, receipt.S, receipt.reproduced);
  validateOutcome(receipt.X.raw, receipt.S.raw, receipt.policy, receipt.decision_evidence, receipt.outcome, receipt.pre_execution_eligible); iso(receipt.reviewed_at, 'reviewed_at'); return receipt;
}

export function validateCompletionReceipt(receipt, expected = {}, { waivers = [] } = {}) {
  const keys = ['schema', 'phase', 'request', 'planned_at_commit', 'execution_base_commit', 'reviewed_head', 'diff_sha256', 'plan_input_sha256', 'acceptance_inventory', 'acceptance_inventory_sha256', 'author', 'policy', 'policy_sha256', 'X', 'S', 'reproduced', 'decision_evidence', 'primary', 'completion_verdict', 'outcome', 'reviewed_at'];
  assertClosed(receipt, keys, 'completion receipt'); if (receipt.schema !== 1 || receipt.phase !== 'completion') throw new Error('completion receipt phase'); validateRequest(receipt.request);
  if (receipt.request.phase !== 'completion' || receipt.request.lifecycle_intent !== 'none' || receipt.reviewed_head !== receipt.request.reviewed_commit_or_head || receipt.plan_input_sha256 !== receipt.request.input_sha256 || receipt.planned_at_commit !== receipt.request.planned_at_commit || receipt.execution_base_commit !== receipt.request.execution_base_commit || receipt.diff_sha256 !== receipt.request.diff_sha256) throw new Error('completion receipt request mismatch');
  if (!HEX40.test(receipt.planned_at_commit) || !HEX40.test(receipt.execution_base_commit) || !HEX40.test(receipt.reviewed_head)) throw new Error('completion commit'); digest(receipt.diff_sha256, 'completion receipt diff');
  validateAcceptanceInventory(receipt.acceptance_inventory); if (receipt.acceptance_inventory_sha256 !== sha256(jcs(receipt.acceptance_inventory)) || receipt.acceptance_inventory_sha256 !== receipt.request.acceptance_inventory_sha256) throw new Error('completion acceptance inventory mismatch');
  if (jcs(receipt.author) !== jcs(receipt.request.author)) throw new Error('completion author mismatch'); if (jcs(receipt.policy) !== jcs(receipt.request.policy) || receipt.policy_sha256 !== receipt.request.policy_sha256) throw new Error('completion policy mismatch');
  for (const [key, value] of Object.entries(expected)) if (key !== 'review_status' && value !== undefined && jcs(receipt[key]) !== jcs(value)) throw new Error(`stale completion receipt ${key}`);
  const normalized = validateWaivers(waivers, 'completion', receipt.request.input_sha256); const waiverFor = (leg) => normalized.find((waiver) => waiver.legs.includes(leg)) || null;
  validatePersistedLeg(receipt.X, receipt.request, 'X', { expectedWaiver: waiverFor('X') }); validatePersistedLeg(receipt.S, receipt.request, 'S', { expectedWaiver: waiverFor('S') }); validateReproduced(receipt.reproduced, receipt.X.raw, receipt.S.raw, true); validateAcceptedReproduced(receipt.X, receipt.S, receipt.reproduced); validatePrimary(receipt.primary, receipt.acceptance_inventory);
  validateOutcome(receipt.X.raw, receipt.S.raw, receipt.policy, receipt.decision_evidence, receipt.outcome); if (receipt.completion_verdict !== deriveCompletionVerdict(receipt.primary, receipt.acceptance_inventory, receipt.X.raw, receipt.S.raw)) throw new Error('completion verdict mismatch');
  if (expected.review_status !== undefined && expected.review_status !== receipt.completion_verdict) throw new Error('completion review_status mismatch');
  iso(receipt.reviewed_at, 'completion reviewed_at'); return receipt;
}

export function validateReviewerOutput(output, request, leg) {
  assertClosed(output, ['schema', 'leg', 'request', 'verdict', 'score', 'findings', 'confirmations'], 'reviewer output');
  if (output.schema !== 1 || output.leg !== leg || jcs(output.request) !== jcs(request)) throw new Error('reviewer envelope mismatch');
  validateRequest(output.request); oneOf(output.verdict, new Set(['ready', 'not_ready']), 'verdict');
  if (!Number.isInteger(output.score) || output.score < 0 || output.score > 100) throw new Error('score');
  if (!Array.isArray(output.findings) || !Array.isArray(output.confirmations)) throw new Error('reviewer arrays');
  const ids = new Set(); output.findings.forEach((finding) => validateFinding(finding, leg, ids)); output.confirmations.forEach((v) => string(v, 'confirmation'));
  return output;
}

export function extractReviewerOutput(tool, stdout, request, leg, bundle) {
  let parsed;
  try { parsed = JSON.parse(stdout); } catch {
    if (tool !== 'codex') throw new Error('reviewer output is not JSON');
    const lines = stdout.trim().split('\n').filter(Boolean);
    for (let i = lines.length - 1; i >= 0; i -= 1) {
      try { parsed = JSON.parse(lines[i]); break; } catch { /* continue */ }
    }
    if (parsed === undefined) throw new Error('Codex output contains no JSON object');
  }
  const output = tool === 'claude' ? parsed?.structured_output : parsed;
  if (!output) throw new Error('structured reviewer output missing');
  const validated = validateReviewerOutput(output, request, leg); validateRequestBundle(request, verifyBundle({ bundle, expectedSha256: request.bundle_sha256 })); return validated;
}

export function validateWaivers(waivers, phase, inputSha) {
  if (!Array.isArray(waivers)) throw new Error('waivers must be array');
  const claimed = new Set();
  const normalized = waivers.map((waiver) => {
    assertClosed(waiver, ['phase', 'input_sha256', 'legs', 'actor', 'reason', 'at'], 'waiver'); oneOf(waiver.phase, new Set(['draft', 'completion']), 'waiver phase'); digest(waiver.input_sha256, 'waiver input');
    if (!Array.isArray(waiver.legs) || waiver.legs.length === 0 || new Set(waiver.legs).size !== waiver.legs.length) throw new Error('waiver legs');
    const legs = [...waiver.legs].sort((a, b) => ['X', 'S'].indexOf(a) - ['X', 'S'].indexOf(b)); legs.forEach((leg) => { oneOf(leg, new Set(['X', 'S']), 'waiver leg'); const key = `${waiver.phase}:${waiver.input_sha256}:${leg}`; if (claimed.has(key)) throw new Error('duplicate waiver'); claimed.add(key); });
    string(waiver.actor, 'waiver actor'); string(waiver.reason, 'waiver reason'); iso(waiver.at, 'waiver at'); return { ...waiver, legs };
  });
  return phase && inputSha ? normalized.filter((waiver) => waiver.phase === phase && waiver.input_sha256 === inputSha) : normalized;
}

function inside(root, candidate) { const rel = path.relative(root, candidate); return rel && !rel.startsWith('..') && !path.isAbsolute(rel); }

function git(repo, args, encoding = 'utf8') {
  const result = spawnSync('git', args, { cwd: repo, encoding });
  if (result.error || result.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${encoding ? result.stderr.trim() : result.stderr.toString().trim()}`);
  return result.stdout;
}

function exactCommit(repo, commit, label) {
  if (!HEX40.test(commit)) throw new Error(`${label} must be a full commit`);
  const resolved = git(repo, ['rev-parse', '--verify', `${commit}^{commit}`]).trim(); if (resolved !== commit) throw new Error(`${label} does not resolve exactly`); return commit;
}

function ancestor(repo, older, newer) {
  const result = spawnSync('git', ['merge-base', '--is-ancestor', older, newer], { cwd: repo, encoding: 'utf8' });
  if (result.status === 0) return true; if (result.status === 1) return false; throw new Error(`git merge-base failed: ${result.stderr.trim()}`);
}

export function validateExecutionRange({ repo, planPath, plannedAtCommit, executionBaseCommit, reviewedHead }) {
  const logical = safeLogical(planPath); exactCommit(repo, plannedAtCommit, 'planned_at_commit'); exactCommit(repo, executionBaseCommit, 'execution_base_commit'); exactCommit(repo, reviewedHead, 'reviewed_head');
  if (!ancestor(repo, plannedAtCommit, executionBaseCommit) || !ancestor(repo, executionBaseCommit, reviewedHead)) throw new Error('execution base ancestry mismatch');
  const parentRow = git(repo, ['rev-list', '--parents', '-n', '1', executionBaseCommit]).trim().split(/\s+/); if (parentRow.length !== 2) throw new Error('execution base must be a single-parent start transition');
  const changed = git(repo, ['diff-tree', '--no-commit-id', '--name-only', '-r', executionBaseCommit]).trim().split('\n').filter(Boolean);
  if (changed.length !== 1 || changed[0] !== logical) throw new Error('execution base must change only the plan');
  const atBaseBytes = git(repo, ['show', `${executionBaseCommit}:${logical}`], null); const beforeBytes = git(repo, ['show', `${parentRow[1]}:${logical}`], null); const atHeadBytes = git(repo, ['show', `${reviewedHead}:${logical}`], null);
  const atBase = parsePlan(atBaseBytes).frontmatter; const before = parsePlan(beforeBytes).frontmatter; const atHead = parsePlan(atHeadBytes).frontmatter;
  if (atBase.status !== 'ongoing' || atBase.started_at === null || !['planned', 'scheduled'].includes(before.status) || before.started_at !== null || canonicalPlanView(atBaseBytes) !== canonicalPlanView(beforeBytes)) throw new Error('execution base is not the plan-only first-start transition');
  if (atBase.planned_at_commit !== plannedAtCommit || atHead.planned_at_commit !== plannedAtCommit || atHead.execution_base_commit !== executionBaseCommit) throw new Error('plan execution identity mismatch');
  return { schema: 1, planned_at_commit: plannedAtCommit, execution_base_commit: executionBaseCommit, reviewed_head: reviewedHead, execution_parent: parentRow[1] };
}

function completionDiff(repo, executionBaseCommit, reviewedHead) {
  return git(repo, ['diff', '--binary', '--full-index', '--find-renames', '--no-ext-diff', '--no-textconv', '--no-color', executionBaseCommit, reviewedHead, '--'], null);
}

function safeLogical(logical) {
  if (typeof logical !== 'string' || !logical || path.isAbsolute(logical) || logical.split('/').includes('..') || logical === '.git' || logical.startsWith('.git/')) throw new Error(`path escapes repo: ${logical}`);
  return logical.split(path.sep).join('/');
}

function sameOrAncestor(ancestorPath, descendantPath) {
  const prefix = ancestorPath.endsWith('/') ? ancestorPath.slice(0, -1) : ancestorPath;
  return prefix === descendantPath || descendantPath.startsWith(`${prefix}/`);
}

function parseTreeRecord(record) {
  const tab = record.indexOf('\t'); if (tab < 0) throw new Error('malformed git tree record');
  const [mode, type, oid] = record.slice(0, tab).split(' '); const logical = record.slice(tab + 1);
  if (!/^[0-9]{6}$/.test(mode) || !HEX40.test(oid) || !['blob', 'tree', 'commit'].includes(type)) throw new Error('malformed git tree metadata');
  if (mode === '160000' || type === 'commit') throw new Error(`submodule is unsupported: ${logical}`);
  return { mode, type, oid, path: logical };
}

function commitPath(repo, commit, logical, files) {
  const safe = safeLogical(logical);
  const topRaw = git(repo, ['ls-tree', '-z', commit, '--', safe]);
  const topRows = topRaw.split('\0').filter(Boolean).map(parseTreeRecord);
  const exact = topRows.find((row) => row.path === safe);
  if (!exact) return { path: safe, state: 'absent' };
  if (exact.type === 'blob') {
    files.push({ path: safe, mode: exact.mode, bytes: git(repo, ['cat-file', 'blob', exact.oid], null) });
    return { path: safe, state: 'file' };
  }
  const rows = git(repo, ['ls-tree', '-rz', commit, '--', safe]).split('\0').filter(Boolean).map(parseTreeRecord);
  for (const row of rows) if (row.type === 'blob') files.push({ path: row.path, mode: row.mode, bytes: git(repo, ['cat-file', 'blob', row.oid], null) });
  return { path: safe, state: 'directory' };
}

function bundleHash(manifestBytes, entries) {
  const hash = createHash('sha256'); hash.update(Buffer.from(String(manifestBytes.length))); hash.update(Buffer.from([0])); hash.update(manifestBytes);
  for (const entry of entries) { hash.update(Buffer.from(String(entry.bytes.length))); hash.update(Buffer.from([0])); hash.update(entry.bytes); }
  return hash.digest('hex');
}

export function sealBundle({ repo, reviewedCommit, planPath, requestedPaths, outDir, plannedAtCommit = null, executionBaseCommit = null }) {
  if (!HEX40.test(reviewedCommit)) throw new Error('reviewedCommit');
  const resolved = git(repo, ['rev-parse', '--verify', `${reviewedCommit}^{commit}`]).trim();
  if (resolved !== reviewedCommit) throw new Error('reviewedCommit does not resolve exactly');
  const safePlan = safeLogical(planPath);
  if (fs.existsSync(outDir)) throw new Error('bundle already exists');
  const entries = []; const requested = [];
  const normalized = requestedPaths.map(safeLogical); const unique = [...new Set(normalized)].sort(compareUtf16);
  if (unique.length !== requestedPaths.length) throw new Error('duplicate requested path');
  if (unique.some((logical) => sameOrAncestor(logical, safePlan))) throw new Error('raw plan path or ancestor is forbidden in requested paths');
  if ((plannedAtCommit === null) !== (executionBaseCommit === null)) throw new Error('completion bundle identity must be all-or-none');
  const planEntries = []; const planState = commitPath(repo, reviewedCommit, safePlan, planEntries);
  if (planState.state !== 'file' || planEntries.length !== 1 || !['100644', '100755'].includes(planEntries[0].mode)) throw new Error('logical plan missing or not a regular file at reviewedCommit');
  const canonical = Buffer.from(canonicalPlanView(planEntries[0].bytes));
  for (const logical of unique) {
    const start = entries.length; requested.push(commitPath(repo, reviewedCommit, logical, entries));
    if (entries.slice(start).some((entry) => entry.path === safePlan)) throw new Error('raw plan path was emitted by requested path expansion');
  }
  entries.push({ path: 'plan.review.md', mode: '100444', bytes: canonical });
  for (const leg of ['X', 'S']) entries.push({ path: `reviewer-output.${leg}.schema.json`, mode: '100444', bytes: Buffer.from(`${jcs(reviewerSchema(leg))}\n`) });
  let completion = null;
  if (plannedAtCommit !== null) {
    validateExecutionRange({ repo, planPath: safePlan, plannedAtCommit, executionBaseCommit, reviewedHead: reviewedCommit });
    const inventory = acceptanceInventory(planEntries[0].bytes); validateAcceptanceInventory(inventory);
    const inventoryBytes = Buffer.from(`${jcs(inventory)}\n`); const diffBytes = completionDiff(repo, executionBaseCommit, reviewedCommit);
    entries.push({ path: 'acceptance-inventory.json', mode: '100444', bytes: inventoryBytes }, { path: 'completion.diff', mode: '100444', bytes: diffBytes });
    completion = {
      planned_at_commit: plannedAtCommit, execution_base_commit: executionBaseCommit, reviewed_head: reviewedCommit,
      diff_path: 'completion.diff', diff_sha256: sha256(diffBytes), acceptance_inventory_path: 'acceptance-inventory.json', acceptance_inventory_sha256: sha256(jcs(inventory)),
    };
  }
  entries.sort((a, b) => compareUtf16(a.path, b.path));
  const seen = new Set(); for (const entry of entries) { if (seen.has(entry.path)) throw new Error(`duplicate bundle path: ${entry.path}`); seen.add(entry.path); }
  fs.mkdirSync(outDir, { recursive: true, mode: 0o700 });
  for (const entry of entries) {
    const dest = path.join(outDir, entry.path); if (!inside(outDir, dest)) throw new Error('bundle path escape');
    fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.writeFileSync(dest, entry.bytes, { mode: 0o444 });
  }
  const manifest = {
    schema: 1, plan_path: safePlan, plan_view: 'plan.review.md', reviewer_schemas: { X: 'reviewer-output.X.schema.json', S: 'reviewer-output.S.schema.json' }, reviewed_commit: reviewedCommit,
    input_sha256: sha256(canonical), completion, requested,
    files: entries.map((entry) => ({ path: entry.path, mode: entry.mode, sha256: sha256(entry.bytes) })),
  };
  const manifestBytes = Buffer.from(`${jcs(manifest)}\n`); fs.writeFileSync(path.join(outDir, 'manifest.json'), manifestBytes, { mode: 0o444 });
  for (const directory of [...new Set(entries.map((entry) => path.dirname(path.join(outDir, entry.path))))].sort((a, b) => b.length - a.length)) fs.chmodSync(directory, 0o555);
  fs.chmodSync(outDir, 0o555);
  return { request_id: randomUUID(), input_sha256: manifest.input_sha256, bundle_sha256: bundleHash(manifestBytes, entries), completion, manifest };
}

export function verifyBundle({ bundle, expectedSha256 = null }) {
  const root = path.resolve(bundle); const rootStat = fs.lstatSync(root);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink() || fs.realpathSync(root) !== root || (rootStat.mode & 0o777) !== 0o555) throw new Error('bundle root is not sealed read-only');
  const manifestPath = path.join(root, 'manifest.json'); const manifestStat = fs.lstatSync(manifestPath);
  if (!manifestStat.isFile() || manifestStat.isSymbolicLink() || (manifestStat.mode & 0o777) !== 0o444) throw new Error('bundle manifest is not sealed read-only');
  const manifestBytes = fs.readFileSync(manifestPath); let manifest;
  try { manifest = JSON.parse(manifestBytes); } catch { throw new Error('bundle manifest is not JSON'); }
  if (!manifest || manifestBytes.toString() !== `${jcs(manifest)}\n`) throw new Error('bundle manifest must be compact JCS');
  assertClosed(manifest, ['schema', 'plan_path', 'plan_view', 'reviewer_schemas', 'reviewed_commit', 'input_sha256', 'completion', 'requested', 'files'], 'bundle manifest');
  if (manifest.schema !== 1 || !HEX40.test(manifest.reviewed_commit) || !Array.isArray(manifest.requested) || !Array.isArray(manifest.files)) throw new Error('bundle manifest identity');
  const planPath = safeLogical(manifest.plan_path);
  if (planPath !== manifest.plan_path || manifest.plan_view !== 'plan.review.md') throw new Error('bundle plan identity');
  assertClosed(manifest.reviewer_schemas, ['X', 'S'], 'bundle reviewer schemas');
  if (manifest.reviewer_schemas.X !== 'reviewer-output.X.schema.json' || manifest.reviewer_schemas.S !== 'reviewer-output.S.schema.json') throw new Error('bundle reviewer schema paths');
  digest(manifest.input_sha256, 'bundle input');
  const expectedFiles = new Set(['manifest.json']); const entries = []; const fileRows = new Map(); let previousFile = null;
  for (const row of manifest.files) {
    assertClosed(row, ['path', 'mode', 'sha256'], 'bundle file'); const logical = safeLogical(row.path);
    if (logical !== row.path || expectedFiles.has(logical) || !/^(100444|100644|100755|120000)$/.test(row.mode)) throw new Error('duplicate or invalid bundle file');
    if (previousFile !== null && compareUtf16(previousFile, logical) >= 0) throw new Error('bundle files are not canonically ordered');
    previousFile = logical; digest(row.sha256, 'bundle file'); expectedFiles.add(logical);
    const absolute = path.join(root, logical); if (!inside(root, absolute)) throw new Error('bundle file escape'); const stat = fs.lstatSync(absolute);
    if (!stat.isFile() || stat.isSymbolicLink() || (stat.mode & 0o777) !== 0o444) throw new Error(`bundle file is not sealed read-only: ${logical}`);
    const bytes = fs.readFileSync(absolute); if (sha256(bytes) !== row.sha256) throw new Error(`bundle file hash mismatch: ${logical}`); entries.push({ bytes }); fileRows.set(logical, { ...row, bytes });
  }
  const actualFiles = new Set();
  const visit = (directory) => {
    const stat = fs.lstatSync(directory); if (!stat.isDirectory() || stat.isSymbolicLink() || (stat.mode & 0o777) !== 0o555) throw new Error('bundle directory is not sealed read-only');
    for (const name of fs.readdirSync(directory)) { const absolute = path.join(directory, name); const relative = path.relative(root, absolute).split(path.sep).join('/'); const child = fs.lstatSync(absolute); if (child.isDirectory()) visit(absolute); else { if (!child.isFile() || child.isSymbolicLink()) throw new Error(`unsupported bundle entry: ${relative}`); actualFiles.add(relative); } }
  };
  visit(root); if (actualFiles.size !== expectedFiles.size || [...actualFiles].some((file) => !expectedFiles.has(file))) throw new Error('bundle contains missing or extra files');
  const planView = fileRows.get('plan.review.md');
  if (!planView || planView.mode !== '100444' || sha256(planView.bytes) !== manifest.input_sha256) throw new Error('bundle plan view input hash mismatch');
  for (const leg of ['X', 'S']) {
    const schemaPath = `reviewer-output.${leg}.schema.json`; const schema = fileRows.get(schemaPath); const expected = `${jcs(reviewerSchema(leg))}\n`;
    if (!schema || schema.mode !== '100444' || schema.bytes.toString() !== expected) throw new Error(`bundle reviewer schema mismatch: ${leg}`);
  }
  const reserved = new Set(['plan.review.md', 'reviewer-output.X.schema.json', 'reviewer-output.S.schema.json']);
  if (manifest.completion !== null) {
    assertClosed(manifest.completion, ['planned_at_commit', 'execution_base_commit', 'reviewed_head', 'diff_path', 'diff_sha256', 'acceptance_inventory_path', 'acceptance_inventory_sha256'], 'bundle completion');
    if (manifest.completion.reviewed_head !== manifest.reviewed_commit) throw new Error('bundle completion head mismatch');
    for (const key of ['planned_at_commit', 'execution_base_commit', 'reviewed_head']) if (!HEX40.test(manifest.completion[key])) throw new Error('bundle completion commit');
    digest(manifest.completion.diff_sha256, 'bundle completion diff'); digest(manifest.completion.acceptance_inventory_sha256, 'bundle completion inventory');
    if (manifest.completion.diff_path !== 'completion.diff' || manifest.completion.acceptance_inventory_path !== 'acceptance-inventory.json') throw new Error('bundle completion paths');
    const diffRow = fileRows.get('completion.diff'); const inventoryRow = fileRows.get('acceptance-inventory.json');
    if (!diffRow || diffRow.mode !== '100444' || !inventoryRow || inventoryRow.mode !== '100444') throw new Error('bundle completion files');
    reserved.add('completion.diff'); reserved.add('acceptance-inventory.json');
    const diff = diffRow.bytes; if (sha256(diff) !== manifest.completion.diff_sha256) throw new Error('bundle completion diff mismatch');
    const inventoryBytes = inventoryRow.bytes; let inventory;
    try { inventory = JSON.parse(inventoryBytes); } catch { throw new Error('bundle acceptance inventory is not JSON'); }
    if (inventoryBytes.toString() !== `${jcs(inventory)}\n` || sha256(jcs(validateAcceptanceInventory(inventory))) !== manifest.completion.acceptance_inventory_sha256) throw new Error('bundle acceptance inventory mismatch');
  }
  const evidencePaths = [...fileRows.keys()].filter((logical) => !reserved.has(logical)); const coverage = new Map(evidencePaths.map((logical) => [logical, 0])); const requestedPaths = new Set(); let previousRequested = null;
  for (const row of manifest.requested) {
    assertClosed(row, ['path', 'state'], 'bundle requested path'); const logical = safeLogical(row.path);
    if (logical !== row.path || requestedPaths.has(logical) || !['absent', 'file', 'directory'].includes(row.state)) throw new Error('bundle requested path identity');
    if (previousRequested !== null && compareUtf16(previousRequested, logical) >= 0) throw new Error('bundle requested paths are not canonically ordered');
    previousRequested = logical; requestedPaths.add(logical);
    if (sameOrAncestor(logical, planPath)) throw new Error('bundle requested path exposes raw plan');
    const matches = evidencePaths.filter((candidate) => candidate === logical || candidate.startsWith(`${logical}/`));
    if (row.state === 'absent' && matches.length !== 0) throw new Error('absent requested path has bundle files');
    if (row.state === 'file' && (matches.length !== 1 || matches[0] !== logical)) throw new Error('file requested path coverage mismatch');
    if (row.state === 'directory' && (matches.length === 0 || matches.some((candidate) => candidate === logical))) throw new Error('directory requested path coverage mismatch');
    for (const candidate of matches) coverage.set(candidate, coverage.get(candidate) + 1);
  }
  if (evidencePaths.includes(planPath) || [...coverage.values()].some((count) => count !== 1)) throw new Error('bundle requested file coverage or raw plan leak');
  const bundleSha256 = bundleHash(manifestBytes, entries); if (expectedSha256 !== null && bundleSha256 !== expectedSha256) throw new Error('bundle hash mismatch');
  return { schema: 1, bundle_sha256: bundleSha256, manifest };
}

function validateRequestBundle(request, verified) {
  const manifest = verified.manifest;
  if (manifest.reviewed_commit !== request.reviewed_commit_or_head || manifest.input_sha256 !== request.input_sha256) throw new Error('request and bundle identity mismatch');
  if (request.phase === 'draft') { if (manifest.completion !== null) throw new Error('draft request carries completion bundle'); }
  else {
    if (manifest.completion === null) throw new Error('completion request lacks completion bundle');
    const expected = { planned_at_commit: request.planned_at_commit, execution_base_commit: request.execution_base_commit, reviewed_head: request.reviewed_commit_or_head, diff_sha256: request.diff_sha256, acceptance_inventory_sha256: request.acceptance_inventory_sha256 };
    for (const [key, value] of Object.entries(expected)) if (manifest.completion[key] !== value) throw new Error(`request and bundle completion mismatch: ${key}`);
  }
}

export function buildReviewerArgv({ tool, bundle, model, effort, leg, request }) {
  validateRequest(request); validateRequestBundle(request, verifyBundle({ bundle, expectedSha256: request.bundle_sha256 })); oneOf(leg, new Set(['X', 'S']), 'leg'); string(model, 'model'); string(effort, 'effort');
  const prompt = `You are the ${leg} independent plan reviewer. Read only the sealed bundle. Return findings only. Copy the request object into ReviewerOutput.request.\nREQUEST_JCS_BEGIN\n${jcs(request)}\nREQUEST_JCS_END`;
  if (tool === 'codex') return ['exec', '-C', bundle, '--skip-git-repo-check', '-s', 'read-only', '-m', model, '-c', `model_reasoning_effort=${effort}`, '--output-schema', path.join(bundle, `reviewer-output.${leg}.schema.json`), '--', prompt];
  if (tool === 'claude') return ['-p', '--permission-mode', 'plan', '--model', model, '--effort', effort, '--json-schema', jcs(reviewerSchema(leg)), '--output-format', 'json', '--', prompt];
  throw new Error('schema v1 supports codex or claude CLI only; relay is not supported');
}

export function classifyLeg({ leg, policy, waiver = null, decision = null, attempts = [], eligibleTierCount }) {
  oneOf(leg, new Set(['X', 'S']), 'leg'); validatePolicy(policy);
  if (waiver) return 'waived';
  if (leg === 'X' && (policy.cross_company_consent === 'never' || decision?.decision === 'deny')) return 'not_authorized';
  if (attempts.length > eligibleTierCount + 1) throw new Error('attempt bound exceeded');
  if (attempts.some((attempt) => attempt.result === 'platform_denied')) return 'platform_denied';
  if (attempts.length === 0 || attempts.at(-1)?.result === 'auth_failed') return 'unavailable_auth';
  const tierFailures = attempts.filter((attempt) => attempt.result !== 'transient_transport');
  if (tierFailures.length === eligibleTierCount && tierFailures.every((attempt) => attempt.result === 'model_unavailable')) return 'unavailable_model';
  if (attempts.some((attempt) => attempt.result === 'deadline_exceeded')) return 'timed_out';
  if (attempts.at(-1)?.result === 'unparseable') return 'failed_unparseable';
  if (attempts.at(-1)?.result === 'passed') return 'passed';
  return 'unavailable_unknown';
}

export function applyLifecycleState({ state, intent, eligible, intentUsed = false }) {
  oneOf(state, new Set(['planned', 'scheduled', 'ongoing', 'in_review']), 'state');
  oneOf(intent, new Set(['none', 'start', 'schedule_fire', 'auto_execute']), 'intent');
  if (intentUsed || intent === 'none' || !eligible) return { state, intent_used: intentUsed, applied: false };
  if (intent === 'start' && state !== 'planned') throw new Error('start requires planned');
  if ((intent === 'schedule_fire' || intent === 'auto_execute') && state !== 'scheduled') throw new Error(`${intent} requires scheduled`);
  return { state: 'ongoing', intent_used: true, applied: true };
}

function digestFilesystem(root, paths = null, excludedTopLevel = new Set()) {
  const rows = [];
  const visit = (absolute, relative) => {
    if (!fs.existsSync(absolute)) { rows.push(`absent\0${relative}`); return; }
    const stat = fs.lstatSync(absolute); const mode = (stat.mode & 0o177777).toString(8);
    if (stat.isDirectory()) {
      rows.push(`dir\0${relative}\0${mode}`);
      for (const name of fs.readdirSync(absolute).sort(compareUtf16)) {
        if (relative === '' && excludedTopLevel.has(name)) continue;
        visit(path.join(absolute, name), relative ? `${relative}/${name}` : name);
      }
    } else if (stat.isSymbolicLink()) rows.push(`link\0${relative}\0${mode}\0${fs.readlinkSync(absolute)}`);
    else if (stat.isFile()) rows.push(`file\0${relative}\0${mode}\0${sha256(fs.readFileSync(absolute))}`);
    else throw new Error(`unsupported snapshot file type: ${relative}`);
  };
  if (paths === null) visit(root, ''); else for (const relative of [...paths].sort(compareUtf16)) visit(path.join(root, relative), relative);
  return sha256(rows.join('\n'));
}

export function snapshotRepository(repo) {
  const root = fs.realpathSync(repo); const top = fs.realpathSync(git(root, ['rev-parse', '--show-toplevel']).trim());
  if (root !== top) throw new Error('completion repo must be its worktree root');
  const status = git(root, ['status', '--porcelain=v1', '-z', '--untracked-files=all']);
  const gitDirRaw = git(root, ['rev-parse', '--git-dir']).trim(); const gitDir = fs.realpathSync(path.resolve(root, gitDirRaw));
  const commonRaw = git(root, ['rev-parse', '--git-common-dir']).trim(); const gitCommon = fs.realpathSync(path.resolve(root, commonRaw));
  return {
    schema: 1, repo_realpath: root, head: git(root, ['rev-parse', 'HEAD']).trim(), clean: status.length === 0,
    worktree_sha256: digestFilesystem(root, null, new Set(['.git'])), git_dir_realpath: gitDir, git_metadata_sha256: digestFilesystem(gitDir),
    git_common_dir_realpath: gitCommon, git_common_metadata_sha256: gitCommon === gitDir ? digestFilesystem(gitDir) : digestFilesystem(gitCommon),
  };
}

function validateRepositorySnapshot(snapshot) {
  assertClosed(snapshot, ['schema', 'repo_realpath', 'head', 'clean', 'worktree_sha256', 'git_dir_realpath', 'git_metadata_sha256', 'git_common_dir_realpath', 'git_common_metadata_sha256'], 'repository snapshot');
  if (snapshot.schema !== 1 || typeof snapshot.clean !== 'boolean' || !path.isAbsolute(snapshot.repo_realpath) || !path.isAbsolute(snapshot.git_dir_realpath) || !path.isAbsolute(snapshot.git_common_dir_realpath) || !HEX40.test(snapshot.head)) throw new Error('repository snapshot identity');
  for (const key of ['worktree_sha256', 'git_metadata_sha256', 'git_common_metadata_sha256']) digest(snapshot[key], `repository snapshot ${key}`); return snapshot;
}

function completionPath(requestId) {
  if (!UUID.test(requestId)) throw new Error('completion request id');
  const root = path.resolve(COMPLETION_ROOT);
  if (!fs.existsSync(root)) fs.mkdirSync(root, { recursive: false, mode: 0o700 });
  const stat = fs.lstatSync(root); if (!stat.isDirectory() || stat.isSymbolicLink() || fs.realpathSync(root) !== root) throw new Error('completion root is not canonical');
  if ((stat.mode & 0o777) !== 0o700 || (typeof process.getuid === 'function' && stat.uid !== process.getuid())) throw new Error('completion root ownership or mode is unsafe');
  const out = path.resolve(root, requestId);
  if (path.dirname(out) !== root || !inside(root, out)) throw new Error('completion path escape');
  return { root, out };
}

export function prepareCompletionCheckout({ repo, reviewedHead, requestId, planPath, plannedAtCommit, executionBaseCommit }) {
  if (!HEX40.test(reviewedHead)) throw new Error('reviewedHead');
  const before = snapshotRepository(repo); if (!before.clean) throw new Error('original repository is not clean');
  if (before.head !== reviewedHead) throw new Error('reviewedHead does not match original HEAD');
  const execution = validateExecutionRange({ repo, planPath, plannedAtCommit, executionBaseCommit, reviewedHead });
  const { root, out } = completionPath(requestId);
  if (fs.existsSync(out)) throw new Error('completion checkout already exists');
  try {
    git(root, ['clone', '--no-local', '--no-checkout', before.repo_realpath, out]);
    git(out, ['checkout', '--detach', reviewedHead]);
    const tempHead = git(out, ['rev-parse', 'HEAD']).trim(); const sourceTree = git(before.repo_realpath, ['rev-parse', `${reviewedHead}^{tree}`]).trim(); const tempTree = git(out, ['rev-parse', 'HEAD^{tree}']).trim();
    if (tempHead !== reviewedHead || tempTree !== sourceTree) throw new Error('completion checkout head/tree mismatch');
    const cleanupToken = createHash('sha256').update(randomUUID()).update(randomUUID()).digest('hex');
    const sentinel = { schema: 1, request_id: requestId, original_repo: before.repo_realpath, plan_path: safeLogical(planPath), planned_at_commit: plannedAtCommit, execution_base_commit: executionBaseCommit, reviewed_head: reviewedHead, source_tree: sourceTree, cleanup_token: cleanupToken };
    fs.writeFileSync(path.join(out, '.docks-plan-verify-sentinel'), `${jcs(sentinel)}\n`, { mode: 0o600 });
    const after = snapshotRepository(repo); if (jcs(after) !== jcs(before)) throw new Error('original repository changed during completion checkout');
    return { schema: 1, request_id: requestId, checkout: out, plan_path: safeLogical(planPath), planned_at_commit: plannedAtCommit, execution_base_commit: executionBaseCommit, reviewed_head: reviewedHead, source_tree: sourceTree, cleanup_token: cleanupToken, execution, original_snapshot: before };
  } catch (error) {
    if (fs.existsSync(out)) fs.rmSync(out, { recursive: true, force: false });
    throw error;
  }
}

export function cleanupCompletionCheckout({ repo, requestId, prepared }) {
  assertClosed(prepared, ['schema', 'request_id', 'checkout', 'plan_path', 'planned_at_commit', 'execution_base_commit', 'reviewed_head', 'source_tree', 'cleanup_token', 'execution', 'original_snapshot'], 'prepared completion identity');
  if (prepared.schema !== 1 || prepared.request_id !== requestId || !HEX40.test(prepared.reviewed_head) || !HEX40.test(prepared.source_tree)) throw new Error('prepared completion identity mismatch');
  if (jcs(prepared.execution) !== jcs(validateExecutionRange({ repo, planPath: prepared.plan_path, plannedAtCommit: prepared.planned_at_commit, executionBaseCommit: prepared.execution_base_commit, reviewedHead: prepared.reviewed_head }))) throw new Error('prepared execution range mismatch');
  digest(prepared.cleanup_token, 'cleanup token'); validateRepositorySnapshot(prepared.original_snapshot);
  if (prepared.original_snapshot.head !== prepared.reviewed_head) throw new Error('prepared head does not match original snapshot');
  const { out } = completionPath(requestId); if (prepared.checkout !== out) throw new Error('prepared checkout is not canonical');
  const sentinelPath = path.join(out, '.docks-plan-verify-sentinel');
  if (!fs.existsSync(sentinelPath)) throw new Error('completion cleanup sentinel missing');
  const sentinelText = fs.readFileSync(sentinelPath, 'utf8'); let sentinel; try { sentinel = JSON.parse(sentinelText); } catch { throw new Error('completion cleanup sentinel invalid'); }
  assertClosed(sentinel, ['schema', 'request_id', 'original_repo', 'plan_path', 'planned_at_commit', 'execution_base_commit', 'reviewed_head', 'source_tree', 'cleanup_token'], 'completion sentinel');
  if (sentinelText !== `${jcs(sentinel)}\n`) throw new Error('completion cleanup sentinel must be compact JCS');
  const expectedSentinel = { schema: 1, request_id: requestId, original_repo: prepared.original_snapshot.repo_realpath, plan_path: prepared.plan_path, planned_at_commit: prepared.planned_at_commit, execution_base_commit: prepared.execution_base_commit, reviewed_head: prepared.reviewed_head, source_tree: prepared.source_tree, cleanup_token: prepared.cleanup_token };
  if (jcs(sentinel) !== jcs(expectedSentinel) || fs.realpathSync(repo) !== sentinel.original_repo) throw new Error('completion cleanup sentinel mismatch');
  if (git(repo, ['rev-parse', `${prepared.reviewed_head}^{tree}`]).trim() !== prepared.source_tree) throw new Error('prepared source tree mismatch');
  const current = snapshotRepository(repo); if (jcs(current) !== jcs(prepared.original_snapshot)) throw new Error('original repository changed during completion verification');
  fs.rmSync(out, { recursive: true, force: false });
  const final = snapshotRepository(repo); if (jcs(final) !== jcs(prepared.original_snapshot)) throw new Error('original repository changed during completion cleanup');
  return { schema: 1, request_id: requestId, removed: true, original_snapshot: final };
}

export function run(argv = process.argv.slice(2)) {
  const [command, ...args] = argv;
  if (command === 'canonical-plan') { process.stdout.write(canonicalPlanView(fs.readFileSync(args[0]))); return; }
  if (command === 'schema') { process.stdout.write(`${jcs(reviewerSchema(args[0]))}\n`); return; }
  if (command === 'validate-reviewer') {
    const output = JSON.parse(fs.readFileSync(args[0], 'utf8')); const request = JSON.parse(fs.readFileSync(args[1], 'utf8'));
    validateReviewerOutput(output, request, args[2]); process.stdout.write('valid reviewer output\n'); return;
  }
  if (command === 'bundle') {
    const [repo, commit, plan, out, plannedAtCommit, executionBaseCommit, ...paths] = args; const completion = plannedAtCommit === '-' && executionBaseCommit === '-' ? {} : { plannedAtCommit, executionBaseCommit };
    process.stdout.write(`${jcs(sealBundle({ repo: path.resolve(repo), reviewedCommit: commit, planPath: plan, requestedPaths: paths, outDir: path.resolve(out), ...completion }))}\n`); return;
  }
  if (command === 'verify-bundle') {
    const [bundle, expectedSha256 = null] = args; if (args.length < 1 || args.length > 2) throw new Error('verify-bundle accepts bundle [expectedSha256]'); process.stdout.write(`${jcs(verifyBundle({ bundle: path.resolve(bundle), expectedSha256 }))}\n`); return;
  }
  if (command === 'completion-prepare') {
    const [repo, reviewedHead, requestId, planPath, plannedAtCommit, executionBaseCommit] = args; if (args.length !== 6) throw new Error('completion-prepare accepts repo reviewedHead requestId planPath plannedAtCommit executionBaseCommit only'); process.stdout.write(`${jcs(prepareCompletionCheckout({ repo: path.resolve(repo), reviewedHead, requestId, planPath, plannedAtCommit, executionBaseCommit }))}\n`); return;
  }
  if (command === 'completion-cleanup') {
    const [repo, requestId, preparedPath] = args; if (args.length !== 3) throw new Error('completion-cleanup accepts repo requestId preparedPath only'); const prepared = JSON.parse(fs.readFileSync(preparedPath, 'utf8'));
    process.stdout.write(`${jcs(cleanupCompletionCheckout({ repo: path.resolve(repo), requestId, prepared }))}\n`); return;
  }
  if (command === 'probe') {
    const [tool] = args; const result = spawnSync(tool, tool === 'codex' ? ['login', 'status'] : ['auth', 'status'], { encoding: 'utf8' });
    process.stdout.write(`${jcs({ available: !result.error && result.status === 0, exit_code: result.status ?? null })}\n`); return;
  }
  throw new Error('usage: review-policy.mjs canonical-plan|schema|validate-reviewer|bundle|verify-bundle|completion-prepare|completion-cleanup|probe ...');
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try { run(); } catch (error) { console.error(`review-policy: ${error.message}`); process.exitCode = 1; }
}
