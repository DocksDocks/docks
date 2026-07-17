#!/usr/bin/env node
import { createHash, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
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
const REVIEW_ROOT = '/tmp/docks-plan-review';
const REVIEW_WORK_ROOT = '/tmp/docks-plan-review-run';
const COMPLETION_ROOT = '/tmp/docks-plan-verify';
const LEGACY_HEX = /^[0-9a-f]{7,39}$/;
const CORE_SEMVER = /^[0-9]+\.[0-9]+\.[0-9]+$/;
const FINISHED_COMPATIBILITY_PATH = /^docs\/plans\/finished\/[0-9]{4}-[0-9]{2}-[0-9]{2}-legacy-start-transition-compatibility\.md$/;
const IDENTITY_TOKEN = /^[a-z0-9][a-z0-9._/-]*$/;
const COMPATIBILITY_ACTIVE_PLAN = 'docs/plans/active/legacy-start-transition-compatibility.md';
const COMPATIBILITY_POLICY_PATH = 'plugins/docks/skills/productivity/plan-review/scripts/review-policy.mjs';
const CANONICAL_REPOSITORY_URL = 'https://github.com/DocksDocks/docks.git';
const CANONICAL_REMOTE_MAIN_ARGV = Object.freeze(['git', 'ls-remote', '--exit-code', '--branches', CANONICAL_REPOSITORY_URL, 'refs/heads/main']);
const COMPATIBILITY_AUTHORIZATION_ID = 'owner-2026-07-13-remodel-and-review-plan';
const COMPATIBILITY_AUTHORIZATION_SHA256 = '1979e51b8ae33cd1de3af5e820200e1988d56363a9b7af1cae9523c7c20ddc96';
const COMPATIBILITY_AUTHORIZATION_SCOPE = Object.freeze({
  schema: 1,
  kind: 'legacy_start_transition_authorization',
  authorization_id: COMPATIBILITY_AUTHORIZATION_ID,
  decision: 'allow',
  source: 'current_user',
  source_text_sha256: COMPATIBILITY_AUTHORIZATION_SHA256,
  target: Object.freeze({
    schema: 1,
    plan_path: 'docs/plans/active/relay-worker-lifecycle-primitives.md',
    planned_at_commit: '12cf2ead208fe932084890b8e3fbd5c72591f3db',
    execution_base_commit: 'de925e9bc046645a72f59bcd493da44d53adaf5a',
  }),
});
const COMPATIBILITY_AUTHORIZATION_SCOPE_SHA256 = '1c5cb608957a4589a4ac2bba05f4df29a6255c45034f9b59ecfda36a73327e10';
const RELEASE_AUTHORIZATION = {
  schema: 1,
  authorization_id: 'owner-2026-07-13-four-release-order-docks-prerequisite',
  decision: 'allow',
  operations: ['non_force_push_main', 'docks_patch_release_after_compatibility_completion', 'codex_plugin_refresh', 'claude_plugin_refresh'],
  plan_path: COMPATIBILITY_ACTIVE_PLAN,
  recorded_at: '2026-07-13T06:44:36-03:00',
  repository: 'DocksDocks/docks',
  source: 'repository-owner-current-conversation',
  source_text_sha256: '2bb31558648994b7d4fbba15abf3ed981c556c91e5ead91712f281d18acbac92',
};
const RELEASE_AUTHORIZATION_SHA256 = 'f8f38319a72f258dd66d9b31f620cd13ec1968f1d1d169d94e3ebc6b55dde77a';
const PREREQUISITE_PENDING_MARKER = 'Pending until exact Step-P E/R/B and Docks release/cache verification. In Q, plan-manager replaces only this sentence with one fenced, one-line compact-JCS `DocksCompatibilityPrerequisiteReceiptV1`, changes Step P `planned` to `done`, bumps `updated`, validates the resulting blob, and commits plan-only before final ordinary review F.\n';
const PREREQUISITE_PENDING_MARKER_SHA256 = 'b5474a78577308a6f844557778dd02a513b8f5bee404c46a88235d18fcb73ced';
const PREREQUISITE_STEP_PLANNED = '| P | Complete the exact Docks-only compatibility prerequisite before any implementation worker resumes: finish/archive the compatibility plan, release/install/cache-verify Docks under the recorded authorization, commit contiguous E/R/B, commit prerequisite closure Q with P `done`, then obtain findings-free final ordinary review F and revalidate the range. | Plan-manager-returned `docs/plans/finished/<date>-legacy-start-transition-compatibility.md` (read-only), `docs/plans/active/relay-worker-lifecycle-primitives.md` (plan-manager-only E/R/B/Q/F writes), `$HOME/.codex/plugins/cache/docks/docks/$RELEASE_VERSION/skills/productivity/plan-review/scripts/review-policy.mjs` (read-only), `$HOME/.claude/plugins/cache/docks/docks/$RELEASE_VERSION/skills/productivity/plan-review/scripts/review-policy.mjs` (read-only) | 1, 3b | planned | The exact Step-P block above passes. Q embeds one valid `DocksCompatibilityPrerequisiteReceiptV1` and changes only its pending sentence, P status, and `updated`; F\'s findings-free `dual|single` receipt reviews Q. The current plan retains exact E material/receipt, immutable R review, B binding, Q prerequisite evidence, and F receipt. Both released cache helpers emit byte-identical schema-1 `LegacyExecutionRangeValidationV1`; only F becomes `PLAN_COMMIT`/`PLAN_BLOB`. Effect Kit and Session Relay versions are unchanged. Any other outcome, stale cache, absent release, E/R/B/Q/F gap, non-plan delta, or authorization mismatch is STOP. P appends no acceptance event or implementation-range receipt. |\n';
const PREREQUISITE_STEP_DONE = PREREQUISITE_STEP_PLANNED.replace(' | planned | ', ' | done | ');

export const LEGACY_START_TRANSITION_COMPATIBILITY_POLICY = Object.freeze({
  body: {
    changed_sections_receipt_bound: true,
    duplicate_headings_forbidden: true,
    heading_set_and_order_identical: true,
    preamble_name: '__preamble__',
    protected_sections: ['Acceptance criteria', 'Cold-handoff checklist', 'Goal', 'Interfaces & data shapes', 'Out of scope / do-NOT-touch', 'STOP conditions', 'Steps'],
    section_add_delete_forbidden: true,
  },
  creation: {
    must_be_ancestor_of_execution_parent: true,
    path_absent_at_planned_at_commit: true,
    plan_only_add: true,
    single_parent_equals_planned_at_commit: true,
  },
  legacy_planned_at: { min_hex_length: 7, must_equal_before_and_at_base: true, must_uniquely_resolve_to_full: true },
  review: { minimum_passed_legs: 1, passed_legs_must_be_ready: true, passed_legs_must_have_zero_findings: true, waivers_forbidden: true, zero_reviewer_forbidden: true },
  schema: 1,
  start: {
    allowed_frontmatter_changes: ['started_at', 'status', 'updated'],
    base_single_parent: true,
    changed_path_only_plan: true,
    from_started_at: null,
    from_status: ['planned', 'scheduled'],
    to_started_at: 'non-null',
    to_status: 'ongoing',
  },
});
export const LEGACY_START_TRANSITION_COMPATIBILITY_POLICY_SHA256 = 'b224d8fc3f8ba6921aec38e834ec2f812954aff79859734e988fb03caf9f1253';

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

function workflowCandidate(candidate, schema, label) {
  const base = ['company', 'tool', 'model', 'effort'];
  const keys = schema === 2 ? [...base, 'service_tier'] : base;
  const present = schema === 2 && Object.hasOwn(candidate ?? {}, 'service_tier') ? keys : base;
  assertClosed(candidate, present, label);
  oneOf(candidate.company, new Set(['openai', 'anthropic']), `${label} company`);
  oneOf(candidate.tool, new Set(['codex', 'claude']), `${label} tool`);
  if ((candidate.company === 'openai') !== (candidate.tool === 'codex')) throw new Error(`${label} company/tool mismatch`);
  string(candidate.model, `${label} model`); string(candidate.effort, `${label} effort`);
  if (Object.hasOwn(candidate, 'service_tier')) {
    if (schema !== 2 || candidate.tool !== 'codex' || candidate.service_tier !== 'fast') throw new Error(`${label} service_tier is invalid`);
  }
  return candidate.tool === 'codex' ? { ...candidate, service_tier: candidate.service_tier ?? 'default' } : { ...candidate };
}

function workflowSelector(candidate) {
  return `${candidate.tool}:${candidate.model}@${candidate.effort}${candidate.service_tier === 'fast' ? '+fast' : ''}`;
}

export function validateWorkflowModelRecord(record) {
  assertClosed(record, ['schema', 'orchestrator', 'reviewer', 'implementer', 'review'], 'workflow model record');
  if (![1, 2].includes(record.schema)) throw new Error('workflow model record schema');
  assertClosed(record.review, ['max_rounds', 'minimum_score'], 'workflow review');
  if (!Number.isInteger(record.review.minimum_score) || record.review.minimum_score < 0 || record.review.minimum_score > 100) throw new Error('workflow minimum_score');
  if (!Number.isInteger(record.review.max_rounds) || record.review.max_rounds < 1 || record.review.max_rounds > 10) throw new Error('workflow max_rounds');
  let fastCandidates = 0;
  const validated = { schema: record.schema, review: { ...record.review } };
  for (const role of ['orchestrator', 'reviewer', 'implementer']) {
    const value = record[role]; assertClosed(value, ['candidates', 'selector'], `workflow ${role}`);
    if (!Array.isArray(value.candidates) || value.candidates.length === 0) throw new Error(`workflow ${role} candidates`);
    string(value.selector, `workflow ${role} selector`);
    const candidates = value.candidates.map((candidate, index) => workflowCandidate(candidate, record.schema, `${role} candidate ${index + 1}`));
    const identities = candidates.map(workflowSelector);
    if (new Set(identities).size !== identities.length) throw new Error(`duplicate ${role} candidate`);
    fastCandidates += candidates.filter((candidate) => candidate.service_tier === 'fast').length;
    let selected;
    if (value.selector.startsWith('profile:')) {
      if (!/^profile:[a-z0-9][a-z0-9-]*$/.test(value.selector)) throw new Error(`${role} selector is invalid`);
      selected = candidates[0];
    } else {
      if (!/^[a-z0-9-]+:[^@+]+@[a-z0-9-]+(?:\+fast)?$/.test(value.selector)) throw new Error(`${role} selector is invalid`);
      const matches = candidates.filter((candidate) => workflowSelector(candidate) === value.selector);
      if (matches.length !== 1) throw new Error(`${role} selector does not identify exactly one candidate`);
      selected = matches[0];
    }
    validated[role] = { candidates: value.candidates.map((candidate) => ({ ...candidate })), selector: value.selector, selected };
  }
  if (record.schema === 2 && fastCandidates === 0) throw new Error('workflow schema 2 requires at least one Fast candidate');
  return validated;
}

export function buildImplementerRelayArgv({ repo, invokerSession, candidate, task }) {
  string(repo, 'implementer repo'); string(invokerSession, 'implementer invoker session'); string(task, 'implementer task');
  const fields = Object.hasOwn(candidate ?? {}, 'service_tier') ? ['company', 'tool', 'model', 'effort', 'service_tier'] : ['company', 'tool', 'model', 'effort'];
  assertClosed(candidate, fields, 'implementer');
  oneOf(candidate.company, new Set(['openai', 'anthropic']), 'implementer company'); oneOf(candidate.tool, new Set(['codex', 'claude']), 'implementer tool');
  if ((candidate.company === 'openai') !== (candidate.tool === 'codex')) throw new Error('implementer company/tool mismatch');
  string(candidate.model, 'implementer model'); string(candidate.effort, 'implementer effort');
  const serviceTier = candidate.service_tier ?? 'default'; oneOf(serviceTier, new Set(['default', 'fast']), 'implementer service tier');
  if (candidate.tool !== 'codex' && Object.hasOwn(candidate, 'service_tier')) throw new Error('implementer service tier is Codex-only');
  const normalized = { ...candidate, service_tier: serviceTier };
  const argv = ['spawn', repo, '--fanout', '--from', invokerSession, '--tool', normalized.tool, '--model', normalized.model, '--effort', normalized.effort];
  if (normalized.tool === 'codex') argv.push('--service-tier', normalized.service_tier);
  argv.push('--', task);
  return argv;
}

function reviewRecordSchema(request) {
  if (request.policy?.schema === 5) return 5;
  if (request.policy?.schema === 4) return 3;
  return request.policy?.schema === 3 ? 2 : 1;
}

export function validatePolicy(policy) {
  if (policy?.schema === 5) return validateCurrentPolicy(policy);
  const baseKeys = ['schema', 'cross_company_consent', 'zero_reviewer_policy', 'orchestrator_preference'];
  const tierKeys = ['openai_tiers', 'anthropic_tiers'];
  if (policy?.schema === 1) assertClosed(policy, [...baseKeys, ...tierKeys, 'provenance'], 'policy');
  else if ([2, 3, 4].includes(policy?.schema)) assertClosed(policy, [...baseKeys, 'minimum_score', 'max_rounds', ...tierKeys, 'provenance'], 'policy');
  else throw new Error('policy schema');
  oneOf(policy.cross_company_consent, new Set(['always', 'ask', 'never']), 'cross_company_consent');
  oneOf(policy.zero_reviewer_policy, new Set(['ask', 'proceed', 'block']), 'zero_reviewer_policy');
  oneOf(policy.orchestrator_preference, new Set(['auto', 'in_session', 'cli']), 'orchestrator_preference');
  if (policy.schema >= 2) {
    if (!Number.isInteger(policy.minimum_score) || policy.minimum_score < 0 || policy.minimum_score > 100) throw new Error('minimum_score');
    if (!Number.isInteger(policy.max_rounds) || policy.max_rounds < 1 || policy.max_rounds > 10) throw new Error('max_rounds');
  }
  for (const company of ['openai', 'anthropic']) {
    const tiers = policy[`${company}_tiers`];
    if (!Array.isArray(tiers) || tiers.length === 0 || (policy.schema >= 2 && tiers.length > 3)) throw new Error(`${company}_tiers`);
    const candidates = new Set();
    for (const tier of tiers) {
      const tierFields = policy.schema >= 3 && company === 'openai' ? ['model', 'effort', 'service_tier', 'transports'] : ['model', 'effort', 'transports'];
      assertClosed(tier, tierFields, 'tier'); string(tier.model, 'model'); string(tier.effort, 'effort');
      if (policy.schema >= 3 && company === 'openai') oneOf(tier.service_tier, new Set(['default', 'fast']), 'service_tier');
      if (!Array.isArray(tier.transports) || tier.transports.length === 0 || new Set(tier.transports).size !== tier.transports.length) throw new Error('tier transports');
      tier.transports.forEach((v) => oneOf(v, new Set(['in_session', 'cli']), 'transport'));
      if (policy.schema >= 3 && company === 'openai' && tier.transports.some((transport) => transport !== 'cli')) throw new Error('tier-controlled OpenAI service tiers require cli transport');
      const candidate = `${tier.model}\0${tier.effort}\0${tier.service_tier ?? ''}`;
      if (policy.schema >= 2 && candidates.has(candidate)) throw new Error(`duplicate ${company}_tiers candidate`);
      candidates.add(candidate);
    }
  }
  const provenanceKeys = [...baseKeys.slice(1), ...(policy.schema >= 2 ? ['minimum_score', 'max_rounds'] : []), ...tierKeys];
  assertClosed(policy.provenance, provenanceKeys, 'provenance');
  Object.values(policy.provenance).forEach((value) => oneOf(value, SOURCES, 'provenance source'));
  return policy;
}

export function validateRequest(request) {
  const baseKeys = ['schema', 'request_id', 'phase', 'lifecycle_intent', 'reviewed_commit_or_head', 'planned_at_commit', 'execution_base_commit', 'diff_sha256', 'acceptance_inventory_sha256', 'input_sha256', 'bundle_sha256', 'author', 'policy', 'policy_sha256'];
  const convergenceKeys = ['review_mode', 'round_index', 'previous_input_sha256', 'repair_targets_sha256'];
  assertClosed(request, [3, 5].includes(request?.schema) ? [...baseKeys, ...convergenceKeys] : baseKeys, 'request');
  if (request.schema !== reviewRecordSchema(request) || !UUID.test(request.request_id)) throw new Error('request identity');
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
  if ([3, 5].includes(request.schema)) {
    oneOf(request.review_mode, new Set(['full', 'repair']), 'review_mode');
    const maximumRound = request.schema === 5 ? 2 : 10;
    if (!Number.isInteger(request.round_index) || request.round_index < 1 || request.round_index > maximumRound) throw new Error('round_index');
    if (request.review_mode === 'full') {
      if (request.round_index !== 1 || request.previous_input_sha256 !== null || request.repair_targets_sha256 !== null) throw new Error('full review must be round one without repair identity');
    } else {
      if (request.schema === 5 ? request.round_index !== 2 : request.round_index <= 1) throw new Error(request.schema === 5 ? 'repair review must be round two' : 'repair review requires a later round');
      digest(request.previous_input_sha256, 'repair previous input'); digest(request.repair_targets_sha256, 'repair targets');
      if (request.input_sha256 === request.previous_input_sha256) throw new Error('repair review requires changed input');
    }
  }
  return request;
}

export function reviewerSchema(leg, outputSchema = 1) {
  if (outputSchema === 5) {
    oneOf(leg, new Set(['primary']), 'role');
    return currentReviewerSchema();
  }
  oneOf(leg, new Set(['X', 'S']), 'leg');
  oneOf(outputSchema, new Set([1, 2, 3]), 'reviewer output schema');
  const closed = (properties, required = Object.keys(properties)) => ({ type: 'object', additionalProperties: false, properties, required });
  const str = { type: 'string', minLength: 1 };
  const typedConst = (type, value) => ({ type, const: value });
  const typedEnum = (type, values) => ({ type, enum: values });
  const tier = closed({ model: str, effort: str, transports: { type: 'array', minItems: 1, items: typedEnum('string', ['in_session', 'cli']) } });
  const openaiTierV3 = closed({ model: str, effort: str, service_tier: typedEnum('string', ['default', 'fast']), transports: { type: 'array', minItems: 1, items: typedConst('string', 'cli') } });
  const provenanceV1 = closed({ cross_company_consent: typedEnum('string', [...SOURCES]), zero_reviewer_policy: typedEnum('string', [...SOURCES]), orchestrator_preference: typedEnum('string', [...SOURCES]), openai_tiers: typedEnum('string', [...SOURCES]), anthropic_tiers: typedEnum('string', [...SOURCES]) });
  const provenanceV2 = closed({ cross_company_consent: typedEnum('string', [...SOURCES]), zero_reviewer_policy: typedEnum('string', [...SOURCES]), orchestrator_preference: typedEnum('string', [...SOURCES]), minimum_score: typedEnum('string', [...SOURCES]), max_rounds: typedEnum('string', [...SOURCES]), openai_tiers: typedEnum('string', [...SOURCES]), anthropic_tiers: typedEnum('string', [...SOURCES]) });
  const commonPolicy = { cross_company_consent: typedEnum('string', ['always', 'ask', 'never']), zero_reviewer_policy: typedEnum('string', ['ask', 'proceed', 'block']), orchestrator_preference: typedEnum('string', ['auto', 'in_session', 'cli']) };
  const policyV1 = closed({ schema: typedConst('integer', 1), ...commonPolicy, openai_tiers: { type: 'array', minItems: 1, items: tier }, anthropic_tiers: { type: 'array', minItems: 1, items: tier }, provenance: provenanceV1 });
  const policyV2 = closed({ schema: typedConst('integer', 2), ...commonPolicy, minimum_score: { type: 'integer', minimum: 0, maximum: 100 }, max_rounds: { type: 'integer', minimum: 1, maximum: 10 }, openai_tiers: { type: 'array', minItems: 1, maxItems: 3, items: tier }, anthropic_tiers: { type: 'array', minItems: 1, maxItems: 3, items: tier }, provenance: provenanceV2 });
  const policyV3 = closed({ schema: typedConst('integer', 3), ...commonPolicy, minimum_score: { type: 'integer', minimum: 0, maximum: 100 }, max_rounds: { type: 'integer', minimum: 1, maximum: 10 }, openai_tiers: { type: 'array', minItems: 1, maxItems: 3, items: openaiTierV3 }, anthropic_tiers: { type: 'array', minItems: 1, maxItems: 3, items: tier }, provenance: provenanceV2 });
  const policyV4 = closed({ schema: typedConst('integer', 4), ...commonPolicy, minimum_score: { type: 'integer', minimum: 0, maximum: 100 }, max_rounds: { type: 'integer', minimum: 1, maximum: 10 }, openai_tiers: { type: 'array', minItems: 1, maxItems: 3, items: openaiTierV3 }, anthropic_tiers: { type: 'array', minItems: 1, maxItems: 3, items: tier }, provenance: provenanceV2 });
  const policy = outputSchema === 1 ? { oneOf: [policyV1, policyV2] } : outputSchema === 2 ? policyV3 : policyV4;
  const requestProperties = {
    schema: typedConst('integer', outputSchema), request_id: { type: 'string', pattern: UUID.source }, phase: typedEnum('string', ['draft', 'completion']),
    lifecycle_intent: typedEnum('string', ['none', 'start', 'schedule_fire', 'auto_execute']), reviewed_commit_or_head: { type: 'string', pattern: HEX40.source },
    planned_at_commit: { type: ['string', 'null'], pattern: HEX40.source }, execution_base_commit: { type: ['string', 'null'], pattern: HEX40.source },
    diff_sha256: { type: ['string', 'null'], pattern: HEX64.source }, acceptance_inventory_sha256: { type: ['string', 'null'], pattern: HEX64.source },
    input_sha256: { type: 'string', pattern: HEX64.source }, bundle_sha256: { type: 'string', pattern: HEX64.source },
    author: closed({ company: typedEnum('string', ['openai', 'anthropic']), tool: str, model: str, effort: str }),
    policy, policy_sha256: { type: 'string', pattern: HEX64.source },
  };
  if (outputSchema === 3) Object.assign(requestProperties, {
    review_mode: typedEnum('string', ['full', 'repair']),
    round_index: { type: 'integer', minimum: 1, maximum: 10 },
    previous_input_sha256: { type: ['string', 'null'], pattern: HEX64.source },
    repair_targets_sha256: { type: ['string', 'null'], pattern: HEX64.source },
  });
  const request = closed(requestProperties);
  const findingProperties = { id: { type: 'string', pattern: `^${leg}[1-9][0-9]*$` }, severity: typedEnum('string', ['high', 'medium', 'low']), section: str, path: { type: ['string', 'null'] }, locator: { type: ['string', 'null'] }, defect: str, fix: str, evidence: str };
  if (outputSchema === 3) Object.assign(findingProperties, {
    priority: { type: 'integer', minimum: 0, maximum: 3 },
    confidence: { type: 'integer', minimum: 0, maximum: 1 },
    blocking: { type: 'boolean' },
    requirement: str,
  });
  const finding = closed(findingProperties);
  const findingsSchema = { type: 'array', items: finding };
  if (outputSchema === 3) findingsSchema.maxItems = 5;
  const outputProperties = {
    schema: typedConst('integer', outputSchema), leg: typedConst('string', leg), request,
    verdict: typedEnum('string', ['ready', 'not_ready']), score: { type: 'integer', minimum: 0, maximum: 100 },
    findings: findingsSchema, confirmations: { type: 'array', items: str },
  };
  if (outputSchema === 3) outputProperties.rubric = closed({
    standalone_executability: { type: 'integer', minimum: 0, maximum: 22 },
    actionability: { type: 'integer', minimum: 0, maximum: 16 },
    dependency_order: { type: 'integer', minimum: 0, maximum: 12 },
    evidence_reverify: { type: 'integer', minimum: 0, maximum: 10 },
    goal_coverage: { type: 'integer', minimum: 0, maximum: 12 },
    executable_acceptance: { type: 'integer', minimum: 0, maximum: 12 },
    failure_mode: { type: 'integer', minimum: 0, maximum: 10 },
    assumption_to_question: { type: 'integer', minimum: 0, maximum: 6 },
  });
  return closed(outputProperties);
}

function validateFinding(finding, leg, ids, recordSchema = 1) {
  const baseKeys = ['id', 'severity', 'section', 'path', 'locator', 'defect', 'fix', 'evidence'];
  const convergenceKeys = ['priority', 'confidence', 'blocking', 'requirement'];
  assertClosed(finding, recordSchema === 3 ? [...baseKeys, ...convergenceKeys] : baseKeys, 'finding');
  if (!new RegExp(`^${leg}[1-9][0-9]*$`).test(finding.id) || ids.has(finding.id)) throw new Error('finding id');
  ids.add(finding.id); oneOf(finding.severity, new Set(['high', 'medium', 'low']), 'severity');
  for (const key of ['section', 'defect', 'fix', 'evidence']) string(finding[key], key);
  for (const key of ['path', 'locator']) if (finding[key] !== null && typeof finding[key] !== 'string') throw new Error(key);
  if (recordSchema === 3) {
    if (!Number.isInteger(finding.priority) || finding.priority < 0 || finding.priority > 3) throw new Error('finding priority');
    if (!Number.isInteger(finding.confidence) || finding.confidence < 0 || finding.confidence > 1) throw new Error('finding confidence');
    if (typeof finding.blocking !== 'boolean') throw new Error('finding blocking');
    string(finding.requirement, 'finding requirement');
    if ((finding.priority >= 2 || finding.confidence === 0) && finding.blocking) throw new Error('low-priority or low-confidence finding cannot block');
  }
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

function validateAttempt(attempt, recordSchema = 1, company = null) {
  const keys = ['schema', 'model', 'effort', ...(recordSchema >= 2 && company === 'openai' ? ['service_tier'] : []), 'transport', 'started', 'output_started', 'result', 'exit_code', 'signal', 'child_id', 'denial_source', 'retry_cause', 'timeout_mode', 'timeout_seconds', 'reason', 'stdout_sha256', 'stderr_sha256'];
  assertClosed(attempt, keys, 'attempt'); if (attempt.schema !== recordSchema) throw new Error('attempt schema');
  string(attempt.model, 'attempt model'); string(attempt.effort, 'attempt effort'); oneOf(attempt.transport, new Set(['in_session', 'cli']), 'attempt transport');
  if (recordSchema >= 2 && company === 'openai') oneOf(attempt.service_tier, new Set(['default', 'fast']), 'attempt service_tier');
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
  const attemptLimit = tiers.length + (policy.schema === 1 ? 1 : 0);
  if (tiers.length === 0 || attempts.length > attemptLimit) throw new Error('raw leg attempt bound');
  const recordSchema = policy.schema === 4 ? 3 : policy.schema === 3 ? 2 : 1;
  if (policy.schema >= 2) {
    let tier = 0;
    for (let i = 0; i < attempts.length; i += 1) {
      const attempt = attempts[i]; validateAttempt(attempt, recordSchema, company);
      if (!tiers[tier] || attempt.model !== tiers[tier].model || attempt.effort !== tiers[tier].effort || (policy.schema >= 3 && company === 'openai' && attempt.service_tier !== tiers[tier].service_tier)) throw new Error('attempt tier order mismatch');
      if (attempt.result === 'model_unavailable') {
        tier += 1;
        if (i < attempts.length - 1 && !tiers[tier]) throw new Error('attempt continued past tier list');
      } else if (i !== attempts.length - 1) throw new Error('attempt after terminal result');
    }
    return tiers.length;
  }
  let tier = 0; let retryUsed = false; let expectRetry = false;
  for (let i = 0; i < attempts.length; i += 1) {
    const attempt = attempts[i]; validateAttempt(attempt, recordSchema, company);
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
  const recordSchema = reviewRecordSchema(request);
  assertClosed(raw, keys, 'raw leg'); if (raw.schema !== recordSchema || raw.leg !== leg || jcs(raw.request) !== jcs(request)) throw new Error('raw leg request mismatch');
  oneOf(raw.result, LEG_RESULTS, 'leg result'); if (!Array.isArray(raw.attempts)) throw new Error('raw leg attempts');
  const company = companyForLeg(request.author.company, leg); const eligibleTierCount = validateAttemptSequence(raw.attempts, request.policy, company);
  const selectedKeys = recordSchema >= 2 && company === 'openai' ? ['model', 'effort', 'service_tier', 'transport'] : ['model', 'effort', 'transport'];
  if (raw.selected !== null) { assertClosed(raw.selected, selectedKeys, 'selected'); string(raw.selected.model, 'selected model'); string(raw.selected.effort, 'selected effort'); if (selectedKeys.includes('service_tier')) oneOf(raw.selected.service_tier, new Set(['default', 'fast']), 'selected service_tier'); oneOf(raw.selected.transport, new Set(['in_session', 'cli']), 'selected transport'); }
  if (!Array.isArray(raw.findings)) throw new Error('raw findings'); const ids = new Set(); raw.findings.forEach((finding) => validateFinding(finding, leg, ids, recordSchema));
  if (raw.reviewer_output !== null) {
    const reviewerOutputKeys = ['verdict', 'score', ...(recordSchema === 3 ? ['rubric'] : []), 'confirmations', 'structured_output_sha256'];
    assertClosed(raw.reviewer_output, reviewerOutputKeys, 'raw reviewer output');
    oneOf(raw.reviewer_output.verdict, new Set(['ready', 'not_ready']), 'raw reviewer verdict');
    if (!Number.isInteger(raw.reviewer_output.score) || raw.reviewer_output.score < 0 || raw.reviewer_output.score > 100) throw new Error('raw reviewer score');
    if (!Array.isArray(raw.reviewer_output.confirmations)) throw new Error('raw reviewer confirmations');
    raw.reviewer_output.confirmations.forEach((value) => string(value, 'raw reviewer confirmation'));
    digest(raw.reviewer_output.structured_output_sha256, 'structured output hash');
    const structured = { schema: recordSchema, leg, request, verdict: raw.reviewer_output.verdict, score: raw.reviewer_output.score, ...(recordSchema === 3 ? { rubric: raw.reviewer_output.rubric } : {}), findings: raw.findings, confirmations: raw.reviewer_output.confirmations };
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
    const expectedSelected = { model: last?.model, effort: last?.effort, ...(selectedKeys.includes('service_tier') ? { service_tier: last?.service_tier } : {}), transport: last?.transport };
    if (raw.selected === null || raw.reviewer_output === null || last?.result !== 'passed' || jcs(raw.selected) !== jcs(expectedSelected) || raw.reason !== null || raw.waiver !== null) throw new Error('invalid passed leg');
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

function reviewerMeetsPolicy(raw, policy) { return raw.reviewer_output?.verdict === 'ready' && (policy.schema === 1 || raw.reviewer_output.score >= policy.minimum_score); }

export function deriveCompletionVerdict(primary, inventory, X, S) {
  validatePrimary(primary, inventory);
  if ([X, S].some((leg) => leg?.result === 'passed' && !reviewerMeetsPolicy(leg, leg.request.policy))) return 'regressed';
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
  const ready = [X, S].filter((leg) => leg.result === 'passed').every((leg) => reviewerMeetsPolicy(leg, policy));
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
  if (result?.schema === 5) return validateCurrentReviewRunResult(result, { waivers });
  assertClosed(result, ['schema', 'kind', 'request', 'X', 'S', 'reproduced', 'decision_evidence', 'outcome', 'pre_execution_eligible'], 'draft run result');
  if (result.schema !== reviewRecordSchema(result.request) || result.kind !== 'draft') throw new Error('draft run kind'); validateRequest(result.request); if (result.request.phase !== 'draft') throw new Error('draft run phase');
  const normalized = validateWaivers(waivers, 'draft', result.request.input_sha256); const waiverFor = (leg) => normalized.find((waiver) => waiver.legs.includes(leg)) || null;
  validateRawLeg(result.X, result.request, 'X', { expectedWaiver: waiverFor('X') }); validateRawLeg(result.S, result.request, 'S', { expectedWaiver: waiverFor('S') });
  validateReproduced(result.reproduced, result.X, result.S, false); validateOutcome(result.X, result.S, result.request.policy, result.decision_evidence, result.outcome, result.pre_execution_eligible); return result;
}

function validateRepairTarget(target) {
  assertClosed(target, ['id', 'source', 'defect', 'fix', 'reproduction'], 'repair target');
  string(target.id, 'repair target id'); oneOf(target.source, new Set(['X', 'S']), 'repair target source');
  string(target.defect, 'repair target defect'); string(target.fix, 'repair target fix');
  assertClosed(target.reproduction, ['method', 'command', 'exit_code', 'evidence_sha256'], 'repair target reproduction');
  oneOf(target.reproduction.method, new Set(['read', 'command']), 'repair target reproduction method');
  digest(target.reproduction.evidence_sha256, 'repair target reproduction evidence');
  if (target.reproduction.method === 'read' && (target.reproduction.command !== null || target.reproduction.exit_code !== null)) throw new Error('read repair target carries command evidence');
  if (target.reproduction.method === 'command') {
    string(target.reproduction.command, 'repair target command');
    if (!Number.isInteger(target.reproduction.exit_code)) throw new Error('repair target command exit code');
  }
  return target;
}

function repairTargetFromEvidence(finding) {
  return {
    id: finding.id,
    source: finding.source,
    defect: finding.defect,
    fix: finding.fix,
    reproduction: finding.reproduction,
  };
}

function validateRepairReconciliation(reconciliation) {
  assertClosed(reconciliation, ['X', 'S'], 'repair reconciliation');
  const accepted = new Map();
  for (const leg of ['X', 'S']) {
    const value = reconciliation[leg];
    assertClosed(value, ['accepted', 'rejected'], `repair reconciliation ${leg}`);
    if (!Array.isArray(value.accepted) || !Array.isArray(value.rejected)) throw new Error('repair reconciliation arrays');
    const used = new Set(); let previousAccepted = null;
    for (const id of value.accepted) {
      string(id, 'repair accepted finding id');
      if (used.has(id) || accepted.has(id) || (previousAccepted !== null && compareUtf16(previousAccepted, id) >= 0)) throw new Error('repair accepted finding ids must be unique and sorted');
      used.add(id); accepted.set(id, leg); previousAccepted = id;
    }
    let previousRejected = null;
    for (const row of value.rejected) {
      assertClosed(row, ['id', 'reason'], 'repair rejected finding');
      string(row.id, 'repair rejected finding id'); string(row.reason, 'repair rejection reason');
      if (used.has(row.id) || accepted.has(row.id) || (previousRejected !== null && compareUtf16(previousRejected, row.id) >= 0)) throw new Error('repair rejected finding ids must be unique and sorted');
      used.add(row.id); previousRejected = row.id;
    }
  }
  return accepted;
}

function validateRepairTransition(transition) {
  assertClosed(transition, ['schema', 'from_round_index', 'previous_input_sha256', 'current_input_sha256', 'reconciliation', 'targets', 'repair_targets_sha256'], 'repair transition');
  if (transition.schema !== 1 || !Number.isInteger(transition.from_round_index) || transition.from_round_index < 1 || transition.from_round_index >= 10) throw new Error('repair transition identity');
  digest(transition.previous_input_sha256, 'repair previous input'); digest(transition.current_input_sha256, 'repair current input');
  if (transition.previous_input_sha256 === transition.current_input_sha256) throw new Error('repair transition requires changed input');
  const accepted = validateRepairReconciliation(transition.reconciliation);
  if (!Array.isArray(transition.targets) || transition.targets.length === 0) throw new Error('repair targets must be nonempty');
  const ids = new Set(); let previous = null;
  for (const target of transition.targets) {
    validateRepairTarget(target);
    if (ids.has(target.id) || (previous !== null && compareUtf16(previous, target.id) >= 0)) throw new Error('repair targets must be unique and sorted');
    if (accepted.get(target.id) !== target.source) throw new Error('repair target is not accepted by its source leg');
    ids.add(target.id); previous = target.id;
  }
  if (ids.size !== accepted.size || [...accepted.keys()].some((id) => !ids.has(id))) throw new Error('repair targets must equal accepted finding ids');
  digest(transition.repair_targets_sha256, 'repair targets hash');
  const expected = sha256(jcs({ schema: 1, reconciliation: transition.reconciliation, targets: transition.targets }));
  if (transition.repair_targets_sha256 !== expected) throw new Error('repair target hash mismatch');
  return transition;
}

export function buildRepairTransition({ fromRoundIndex, previousInputSha256, currentInputSha256, reconciliation, targets }) {
  if (!Array.isArray(targets)) throw new Error('repair targets');
  assertClosed(reconciliation, ['X', 'S'], 'repair reconciliation');
  const normalizedReconciliation = {};
  for (const leg of ['X', 'S']) {
    const value = reconciliation[leg];
    assertClosed(value, ['accepted', 'rejected'], `repair reconciliation ${leg}`);
    if (!Array.isArray(value.accepted) || !Array.isArray(value.rejected)) throw new Error('repair reconciliation arrays');
    normalizedReconciliation[leg] = {
      accepted: [...value.accepted].sort(compareUtf16),
      rejected: value.rejected.map((row) => {
        assertClosed(row, ['id', 'reason'], 'repair rejected finding');
        string(row.id, 'repair rejected finding id'); string(row.reason, 'repair rejection reason');
        return { id: row.id, reason: row.reason };
      }).sort((a, b) => compareUtf16(a.id, b.id)),
    };
  }
  const normalized = targets.map((target) => {
    assertClosed(target, ['id', 'source', 'severity', 'path', 'locator', 'defect', 'fix', 'reproduction'], 'repair finding evidence');
    string(target.id, 'repair finding id'); oneOf(target.source, new Set(['X', 'S']), 'repair finding source');
    oneOf(target.severity, new Set(['high', 'medium', 'low']), 'repair finding severity');
    for (const key of ['path', 'locator']) if (target[key] !== null && typeof target[key] !== 'string') throw new Error(`repair finding ${key}`);
    string(target.defect, 'repair finding defect'); string(target.fix, 'repair finding fix');
    validateRepairTarget(repairTargetFromEvidence(target));
    return repairTargetFromEvidence(target);
  }).sort((a, b) => compareUtf16(a.id, b.id));
  const transition = {
    schema: 1,
    from_round_index: fromRoundIndex,
    previous_input_sha256: previousInputSha256,
    current_input_sha256: currentInputSha256,
    reconciliation: normalizedReconciliation,
    targets: normalized,
    repair_targets_sha256: sha256(jcs({ schema: 1, reconciliation: normalizedReconciliation, targets: normalized })),
  };
  return validateRepairTransition(transition);
}

export function validateReviewSeries(series, { waivers = [] } = {}) {
  if (series?.schema === 5) return validateCurrentReviewSeries(series, { waivers });
  assertClosed(series, ['schema', 'policy_sha256', 'initial_input_sha256', 'current_input_sha256', 'rounds', 'repairs'], 'review series');
  if (series.schema !== 3 || !Array.isArray(series.rounds) || series.rounds.length === 0) throw new Error('review series identity');
  digest(series.policy_sha256, 'review series policy'); digest(series.initial_input_sha256, 'review series initial input'); digest(series.current_input_sha256, 'review series current input');
  const policy = series.rounds[0]?.request?.policy;
  const kind = series.rounds[0]?.kind;
  oneOf(kind, new Set(['draft', 'completion']), 'review series run kind');
  const validateRound = kind === 'draft' ? validateDraftRunResult : validateCompletionRunResult;
  validatePolicy(policy);
  if (policy.schema !== 4 || series.policy_sha256 !== sha256(jcs(policy))) throw new Error('review series policy mismatch');
  if (series.rounds.length > policy.max_rounds) throw new Error('review series exceeds lifetime max_rounds');
  if (!Array.isArray(series.repairs) || series.repairs.length !== series.rounds.length - 1) throw new Error('review series repair count mismatch');
  let previousInput = null;
  for (let index = 0; index < series.rounds.length; index += 1) {
    const round = series.rounds[index]; const expectedIndex = index + 1;
    if (round?.request?.round_index !== expectedIndex) throw new Error('review series rounds must be contiguous');
    if (expectedIndex === 1) {
      if (round.request.review_mode !== 'full') throw new Error('review series round one must be full');
    } else {
      if (round.request.review_mode !== 'repair') throw new Error('review series later rounds must be repair');
      if (round.request.previous_input_sha256 !== previousInput) throw new Error('review series previous input mismatch');
      const transition = validateRepairTransition(series.repairs[index - 1]);
      if (transition.from_round_index !== expectedIndex - 1 || transition.previous_input_sha256 !== previousInput || transition.current_input_sha256 !== round.request.input_sha256 || transition.repair_targets_sha256 !== round.request.repair_targets_sha256) throw new Error('review series repair transition mismatch');
      const prior = series.rounds[index - 1]; const reproduced = new Map(prior.reproduced.map((finding) => [finding.id, repairTargetFromEvidence(finding)]));
      for (const leg of ['X', 'S']) validateReconciliation(transition.reconciliation[leg], prior[leg].findings);
      for (const target of transition.targets) {
        const source = reproduced.get(target.id);
        if (!source || jcs(source) !== jcs(target)) throw new Error('repair target was not exactly reproduced in the prior round');
      }
    }
    if (round.request.policy_sha256 !== series.policy_sha256 || jcs(round.request.policy) !== jcs(policy)) throw new Error('review series policy drift');
    if (round.kind !== kind) throw new Error('review series run kind drift');
    validateRound(round);
    previousInput = round.request.input_sha256;
  }
  if (series.rounds[0].request.input_sha256 !== series.initial_input_sha256 || previousInput !== series.current_input_sha256) throw new Error('review series input identity mismatch');
  return series;
}

export function validateCompletionRunResult(result, { waivers = [] } = {}) {
  if (result?.schema === 5) return validateCurrentReviewRunResult(result, { waivers });
  assertClosed(result, ['schema', 'kind', 'request', 'plan_input_sha256', 'diff_sha256', 'acceptance_inventory', 'acceptance_inventory_sha256', 'X', 'S', 'reproduced', 'decision_evidence', 'outcome', 'primary', 'completion_verdict'], 'completion run result');
  if (result.schema !== reviewRecordSchema(result.request) || result.kind !== 'completion') throw new Error('completion run kind'); validateRequest(result.request); if (result.request.phase !== 'completion' || result.request.lifecycle_intent !== 'none') throw new Error('completion request phase/intent');
  if (result.plan_input_sha256 !== result.request.input_sha256 || result.diff_sha256 !== result.request.diff_sha256) throw new Error('completion plan or diff input mismatch'); digest(result.diff_sha256, 'completion diff');
  validateAcceptanceInventory(result.acceptance_inventory); if (result.acceptance_inventory_sha256 !== sha256(jcs(result.acceptance_inventory)) || result.acceptance_inventory_sha256 !== result.request.acceptance_inventory_sha256) throw new Error('completion acceptance inventory mismatch');
  const normalized = validateWaivers(waivers, 'completion', result.request.input_sha256); const waiverFor = (leg) => normalized.find((waiver) => waiver.legs.includes(leg)) || null;
  validateRawLeg(result.X, result.request, 'X', { expectedWaiver: waiverFor('X') }); validateRawLeg(result.S, result.request, 'S', { expectedWaiver: waiverFor('S') }); validateReproduced(result.reproduced, result.X, result.S, true); validatePrimary(result.primary, result.acceptance_inventory);
  validateOutcome(result.X, result.S, result.request.policy, result.decision_evidence, result.outcome); if (result.completion_verdict !== deriveCompletionVerdict(result.primary, result.acceptance_inventory, result.X, result.S)) throw new Error('completion verdict mismatch'); return result;
}

function validateExpectedPolicy(receipt, expectedPolicy) {
  if (expectedPolicy === null) return;
  validatePolicy(expectedPolicy);
  if (jcs(receipt.policy) !== jcs(expectedPolicy) || receipt.policy_sha256 !== sha256(jcs(expectedPolicy))) throw new Error('receipt resolved policy mismatch');
}

export function validateDraftReceipt(receipt, expectedInput = null, { waivers = [], expectedPolicy = null } = {}) {
  if (receipt?.schema === 5) return validateCurrentReviewReceipt(receipt, expectedInput, { waivers, expectedPolicy });
  const keys = ['schema', 'phase', 'request', 'input_sha256', 'reviewed_commit', 'author', 'policy', 'policy_sha256', 'X', 'S', 'reproduced', 'decision_evidence', 'outcome', 'pre_execution_eligible', 'reviewed_at'];
  assertClosed(receipt, keys, 'draft receipt'); if (receipt.schema !== reviewRecordSchema(receipt.request) || receipt.phase !== 'draft') throw new Error('draft receipt phase'); validateRequest(receipt.request);
  if (receipt.input_sha256 !== receipt.request.input_sha256 || receipt.reviewed_commit !== receipt.request.reviewed_commit_or_head) throw new Error('draft receipt input mismatch'); if (expectedInput && receipt.input_sha256 !== expectedInput) throw new Error('stale draft receipt');
  assertClosed(receipt.author, ['company', 'tool', 'model', 'effort'], 'author'); oneOf(receipt.author.company, new Set(['openai', 'anthropic']), 'author company'); for (const key of ['tool', 'model', 'effort']) string(receipt.author[key], `author ${key}`); if (jcs(receipt.author) !== jcs(receipt.request.author)) throw new Error('receipt author mismatch');
  if (jcs(receipt.policy) !== jcs(receipt.request.policy) || receipt.policy_sha256 !== receipt.request.policy_sha256) throw new Error('receipt policy mismatch');
  validateExpectedPolicy(receipt, expectedPolicy);
  const normalizedWaivers = validateWaivers(waivers, receipt.request.phase, receipt.request.input_sha256); const waiverFor = (leg) => normalizedWaivers.find((waiver) => waiver.legs.includes(leg)) || null;
  validatePersistedLeg(receipt.X, receipt.request, 'X', { expectedWaiver: waiverFor('X') }); validatePersistedLeg(receipt.S, receipt.request, 'S', { expectedWaiver: waiverFor('S') });
  validateReproduced(receipt.reproduced, receipt.X.raw, receipt.S.raw, false); validateAcceptedReproduced(receipt.X, receipt.S, receipt.reproduced);
  validateOutcome(receipt.X.raw, receipt.S.raw, receipt.policy, receipt.decision_evidence, receipt.outcome, receipt.pre_execution_eligible); iso(receipt.reviewed_at, 'reviewed_at'); return receipt;
}

export function validateDraftReviewReuse(input) {
  const normalized = { waivers: [], ...input };
  assertClosed(normalized, ['receipt', 'expectedInput', 'expectedPolicy', 'waivers'], 'draft review reuse');
  digest(normalized.expectedInput, 'draft review reuse input'); validatePolicy(normalized.expectedPolicy);
  return validateDraftReceipt(normalized.receipt, normalized.expectedInput, { expectedPolicy: normalized.expectedPolicy, waivers: normalized.waivers });
}

export function validateCompletionReceipt(receipt, expected = {}, { waivers = [], expectedPolicy = null } = {}) {
  if (receipt?.schema === 5) return validateCurrentReviewReceipt(receipt, expected, { waivers, expectedPolicy });
  const keys = ['schema', 'phase', 'request', 'planned_at_commit', 'execution_base_commit', 'reviewed_head', 'diff_sha256', 'plan_input_sha256', 'acceptance_inventory', 'acceptance_inventory_sha256', 'author', 'policy', 'policy_sha256', 'X', 'S', 'reproduced', 'decision_evidence', 'primary', 'completion_verdict', 'outcome', 'reviewed_at'];
  assertClosed(receipt, keys, 'completion receipt'); if (receipt.schema !== reviewRecordSchema(receipt.request) || receipt.phase !== 'completion') throw new Error('completion receipt phase'); validateRequest(receipt.request);
  if (receipt.request.phase !== 'completion' || receipt.request.lifecycle_intent !== 'none' || receipt.reviewed_head !== receipt.request.reviewed_commit_or_head || receipt.plan_input_sha256 !== receipt.request.input_sha256 || receipt.planned_at_commit !== receipt.request.planned_at_commit || receipt.execution_base_commit !== receipt.request.execution_base_commit || receipt.diff_sha256 !== receipt.request.diff_sha256) throw new Error('completion receipt request mismatch');
  if (!HEX40.test(receipt.planned_at_commit) || !HEX40.test(receipt.execution_base_commit) || !HEX40.test(receipt.reviewed_head)) throw new Error('completion commit'); digest(receipt.diff_sha256, 'completion receipt diff');
  validateAcceptanceInventory(receipt.acceptance_inventory); if (receipt.acceptance_inventory_sha256 !== sha256(jcs(receipt.acceptance_inventory)) || receipt.acceptance_inventory_sha256 !== receipt.request.acceptance_inventory_sha256) throw new Error('completion acceptance inventory mismatch');
  if (jcs(receipt.author) !== jcs(receipt.request.author)) throw new Error('completion author mismatch'); if (jcs(receipt.policy) !== jcs(receipt.request.policy) || receipt.policy_sha256 !== receipt.request.policy_sha256) throw new Error('completion policy mismatch');
  validateExpectedPolicy(receipt, expectedPolicy);
  for (const [key, value] of Object.entries(expected)) if (key !== 'review_status' && value !== undefined && jcs(receipt[key]) !== jcs(value)) throw new Error(`stale completion receipt ${key}`);
  const normalized = validateWaivers(waivers, 'completion', receipt.request.input_sha256); const waiverFor = (leg) => normalized.find((waiver) => waiver.legs.includes(leg)) || null;
  validatePersistedLeg(receipt.X, receipt.request, 'X', { expectedWaiver: waiverFor('X') }); validatePersistedLeg(receipt.S, receipt.request, 'S', { expectedWaiver: waiverFor('S') }); validateReproduced(receipt.reproduced, receipt.X.raw, receipt.S.raw, true); validateAcceptedReproduced(receipt.X, receipt.S, receipt.reproduced); validatePrimary(receipt.primary, receipt.acceptance_inventory);
  validateOutcome(receipt.X.raw, receipt.S.raw, receipt.policy, receipt.decision_evidence, receipt.outcome); if (receipt.completion_verdict !== deriveCompletionVerdict(receipt.primary, receipt.acceptance_inventory, receipt.X.raw, receipt.S.raw)) throw new Error('completion verdict mismatch');
  if (expected.review_status !== undefined && expected.review_status !== receipt.completion_verdict) throw new Error('completion review_status mismatch');
  iso(receipt.reviewed_at, 'completion reviewed_at'); return receipt;
}

export function validateReviewerOutput(output, request, leg) {
  if (request?.schema === 5) {
    if (leg !== 'primary') throw new Error('current reviewer role must be primary');
    return validateCurrentReviewerOutput(output, request);
  }
  const recordSchema = reviewRecordSchema(request);
  assertClosed(output, ['schema', 'leg', 'request', 'verdict', 'score', ...(recordSchema === 3 ? ['rubric'] : []), 'findings', 'confirmations'], 'reviewer output');
  if (output.schema !== recordSchema || output.leg !== leg || jcs(output.request) !== jcs(request)) throw new Error('reviewer envelope mismatch');
  validateRequest(output.request); oneOf(output.verdict, new Set(['ready', 'not_ready']), 'verdict');
  if (!Number.isInteger(output.score) || output.score < 0 || output.score > 100) throw new Error('score');
  if (!Array.isArray(output.findings) || !Array.isArray(output.confirmations)) throw new Error('reviewer arrays');
  const ids = new Set(); output.findings.forEach((finding) => validateFinding(finding, leg, ids, recordSchema)); output.confirmations.forEach((v) => string(v, 'confirmation'));
  if (recordSchema === 3) {
    const rubricMaximums = {
      standalone_executability: 22,
      actionability: 16,
      dependency_order: 12,
      evidence_reverify: 10,
      goal_coverage: 12,
      executable_acceptance: 12,
      failure_mode: 10,
      assumption_to_question: 6,
    };
    assertClosed(output.rubric, Object.keys(rubricMaximums), 'reviewer rubric');
    let rubricScore = 0;
    for (const [key, maximum] of Object.entries(rubricMaximums)) {
      const value = output.rubric[key];
      if (!Number.isInteger(value) || value < 0 || value > maximum) throw new Error(`reviewer rubric ${key}`);
      rubricScore += value;
    }
    if (rubricScore !== output.score) throw new Error('reviewer rubric score sum mismatch');
    const hasBlocking = output.findings.some((finding) => finding.blocking);
    if ((output.verdict === 'not_ready') !== hasBlocking) throw new Error('reviewer blocking verdict mismatch');
    const findingLimit = request.review_mode === 'full' ? 5 : 3;
    if (output.findings.length > findingLimit) throw new Error('reviewer finding limit exceeded');
  }
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

const CURRENT_REVIEW_STATUSES = new Set(['pass', 'non_blocking_gap', 'blocking_gap']);
const CURRENT_GAP_STATUSES = new Set(['non_blocking_gap', 'blocking_gap']);
const CURRENT_CRITERIA = Object.freeze([
  'standalone_executability',
  'actionability',
  'dependency_order',
  'evidence_reverification',
  'goal_coverage',
  'executable_acceptance',
  'failure_modes',
  'open_questions',
]);
const CURRENT_FALLBACK_RESULTS = new Set(['tool_unavailable', 'auth_failed', 'model_unavailable']);
const CURRENT_ATTEMPT_RESULTS = new Set([
  ...CURRENT_FALLBACK_RESULTS,
  'passed',
  'platform_denied',
  'deadline_exceeded',
  'transient_transport',
  'nonzero_exit',
  'signaled',
  'output_invalid',
]);
const CURRENT_CANDIDATES = Object.freeze([
  Object.freeze({ company: 'openai', tool: 'codex', model: 'gpt-5.6-sol', effort: 'high', service_tier: 'default' }),
  Object.freeze({ company: 'anthropic', tool: 'claude', model: 'fable', effort: 'high' }),
  Object.freeze({ company: 'anthropic', tool: 'claude', model: 'opus', effort: 'xhigh' }),
]);

function validateCurrentCandidate(candidate, label = 'current candidate') {
  const keys = candidate?.tool === 'codex'
    ? ['company', 'tool', 'model', 'effort', 'service_tier']
    : ['company', 'tool', 'model', 'effort'];
  assertClosed(candidate, keys, label);
  oneOf(candidate.company, new Set(['openai', 'anthropic']), `${label} company`);
  oneOf(candidate.tool, new Set(['codex', 'claude']), `${label} tool`);
  if ((candidate.company === 'openai') !== (candidate.tool === 'codex')) throw new Error(`${label} company/tool mismatch`);
  string(candidate.model, `${label} model`);
  string(candidate.effort, `${label} effort`);
  if (candidate.tool === 'codex' && candidate.service_tier !== 'default') throw new Error(`${label} service_tier`);
  return candidate;
}

export function validateCurrentPolicy(policy) {
  assertClosed(policy, ['schema', 'role', 'fallback', 'max_rounds', 'candidates', 'provenance'], 'current policy');
  if (policy.schema !== 5) throw new Error('current policy schema');
  if (policy.role !== 'primary') throw new Error('current policy role');
  if (policy.fallback !== 'availability_only') throw new Error('current policy fallback');
  if (policy.max_rounds !== 2) throw new Error('current policy max_rounds must be exactly 2');
  if (!Array.isArray(policy.candidates) || ![1, 3].includes(policy.candidates.length)) throw new Error('current policy candidates must be the default chain or one pinned candidate');
  policy.candidates.forEach((candidate, index) => {
    validateCurrentCandidate(candidate, `current candidate ${index + 1}`);
    if (!CURRENT_CANDIDATES.some((allowed) => jcs(allowed) === jcs(candidate))) throw new Error('current policy candidate is not eligible');
  });
  if (policy.candidates.length === 3 && jcs(policy.candidates) !== jcs(CURRENT_CANDIDATES)) throw new Error('current policy candidate order mismatch');
  if (policy.candidates.length === 1 && policy.provenance?.candidates !== 'current_user') throw new Error('a pinned current candidate requires current_user provenance');
  assertClosed(policy.provenance, ['role', 'fallback', 'max_rounds', 'candidates'], 'current policy provenance');
  Object.values(policy.provenance).forEach((value) => oneOf(value, SOURCES, 'current policy provenance source'));
  return policy;
}

function currentSchemaHelpers() {
  const closed = (properties, required = Object.keys(properties)) => ({ type: 'object', additionalProperties: false, properties, required });
  const str = { type: 'string', minLength: 1 };
  const typedConst = (type, value) => ({ type, const: value });
  const typedEnum = (type, values) => ({ type, enum: values });
  return { closed, str, typedConst, typedEnum };
}

export function currentReviewerSchema() {
  const { closed, str, typedConst, typedEnum } = currentSchemaHelpers();
  const candidateSchemas = CURRENT_CANDIDATES.map((candidate) => closed(Object.fromEntries(
    Object.entries(candidate).map(([key, value]) => [key, typedConst('string', value)]),
  )));
  const source = typedEnum('string', [...SOURCES]);
  const policy = closed({
    schema: typedConst('integer', 5),
    role: typedConst('string', 'primary'),
    fallback: typedConst('string', 'availability_only'),
    max_rounds: typedConst('integer', 2),
    candidates: { type: 'array', minItems: 1, maxItems: 3, items: { oneOf: candidateSchemas } },
    provenance: closed({ role: source, fallback: source, max_rounds: source, candidates: source }),
  });
  const request = closed({
    schema: typedConst('integer', 5),
    request_id: { type: 'string', pattern: UUID.source },
    phase: typedEnum('string', ['draft', 'completion']),
    lifecycle_intent: typedEnum('string', ['none', 'start', 'schedule_fire', 'auto_execute']),
    reviewed_commit_or_head: { type: 'string', pattern: HEX40.source },
    planned_at_commit: { type: ['string', 'null'], pattern: HEX40.source },
    execution_base_commit: { type: ['string', 'null'], pattern: HEX40.source },
    diff_sha256: { type: ['string', 'null'], pattern: HEX64.source },
    acceptance_inventory_sha256: { type: ['string', 'null'], pattern: HEX64.source },
    input_sha256: { type: 'string', pattern: HEX64.source },
    bundle_sha256: { type: 'string', pattern: HEX64.source },
    author: closed({ company: typedEnum('string', ['openai', 'anthropic']), tool: str, model: str, effort: str }),
    policy,
    policy_sha256: { type: 'string', pattern: HEX64.source },
    review_mode: typedEnum('string', ['full', 'repair']),
    round_index: { type: 'integer', minimum: 1, maximum: 2 },
    previous_input_sha256: { type: ['string', 'null'], pattern: HEX64.source },
    repair_targets_sha256: { type: ['string', 'null'], pattern: HEX64.source },
  });
  const checklistEntry = closed({ status: typedEnum('string', [...CURRENT_REVIEW_STATUSES]), evidence: str });
  const checklist = closed(Object.fromEntries(CURRENT_CRITERIA.map((criterion) => [criterion, checklistEntry])));
  const finding = closed({
    id: { type: 'string', pattern: '^P[1-9][0-9]*$' },
    criterion: typedEnum('string', CURRENT_CRITERIA),
    status: typedEnum('string', [...CURRENT_GAP_STATUSES]),
    section: str,
    path: { type: ['string', 'null'] },
    locator: { type: ['string', 'null'] },
    defect: str,
    fix: str,
    evidence: str,
  });
  return closed({
    schema: typedConst('integer', 5),
    role: typedConst('string', 'primary'),
    request,
    verdict: typedEnum('string', [...CURRENT_REVIEW_STATUSES]),
    checklist,
    findings: { type: 'array', items: finding },
  });
}

function validateCurrentFinding(finding, ids) {
  assertClosed(finding, ['id', 'criterion', 'status', 'section', 'path', 'locator', 'defect', 'fix', 'evidence'], 'current finding');
  if (!/^P[1-9][0-9]*$/.test(finding.id) || ids.has(finding.id)) throw new Error('current finding id');
  ids.add(finding.id);
  oneOf(finding.criterion, new Set(CURRENT_CRITERIA), 'current finding criterion');
  oneOf(finding.status, CURRENT_GAP_STATUSES, 'current finding status');
  for (const key of ['section', 'defect', 'fix', 'evidence']) string(finding[key], `current finding ${key}`);
  for (const key of ['path', 'locator']) if (finding[key] !== null && typeof finding[key] !== 'string') throw new Error(`current finding ${key}`);
  return finding;
}

export function validateCurrentReviewerOutput(output, request) {
  assertClosed(output, ['schema', 'role', 'request', 'verdict', 'checklist', 'findings'], 'current reviewer output');
  if (output.schema !== 5 || output.role !== 'primary' || jcs(output.request) !== jcs(request)) throw new Error('current reviewer envelope mismatch');
  validateRequest(output.request);
  oneOf(output.verdict, CURRENT_REVIEW_STATUSES, 'current reviewer verdict');
  assertClosed(output.checklist, CURRENT_CRITERIA, 'current reviewer checklist');
  const rank = { pass: 0, non_blocking_gap: 1, blocking_gap: 2 };
  let strongest = 'pass';
  for (const criterion of CURRENT_CRITERIA) {
    const entry = output.checklist[criterion];
    assertClosed(entry, ['status', 'evidence'], `current checklist ${criterion}`);
    oneOf(entry.status, CURRENT_REVIEW_STATUSES, `current checklist ${criterion} status`);
    string(entry.evidence, `current checklist ${criterion} evidence`);
    if (rank[entry.status] > rank[strongest]) strongest = entry.status;
  }
  if (output.verdict !== strongest) throw new Error('current reviewer verdict must equal strongest checklist status');
  if (!Array.isArray(output.findings)) throw new Error('current reviewer findings must be an array');
  const ids = new Set();
  output.findings.forEach((finding) => validateCurrentFinding(finding, ids));
  for (const criterion of CURRENT_CRITERIA) {
    const status = output.checklist[criterion].status;
    const matching = output.findings.filter((finding) => finding.criterion === criterion);
    if (status === 'pass' && matching.length !== 0) throw new Error(`pass criterion ${criterion} cannot carry findings`);
    if (status !== 'pass' && !matching.some((finding) => finding.status === status)) throw new Error(`current finding status missing for gap criterion ${criterion}`);
    if (matching.some((finding) => finding.status !== status)) throw new Error(`current finding status does not match checklist ${criterion}`);
  }
  if (output.verdict === 'pass' && output.findings.length !== 0) throw new Error('pass reviewer output cannot carry findings');
  return output;
}

function validateCurrentAttempt(attempt) {
  assertClosed(attempt, ['schema', 'candidate', 'started', 'output_started', 'result', 'exit_code', 'signal', 'denial_source', 'reason', 'stdout_sha256', 'stderr_sha256'], 'current attempt');
  if (attempt.schema !== 5) throw new Error('current attempt schema');
  validateCurrentCandidate(attempt.candidate, 'current attempt candidate');
  if (typeof attempt.started !== 'boolean' || typeof attempt.output_started !== 'boolean') throw new Error('current attempt booleans');
  oneOf(attempt.result, CURRENT_ATTEMPT_RESULTS, 'current attempt result');
  if (attempt.exit_code !== null && !Number.isInteger(attempt.exit_code)) throw new Error('current attempt exit code');
  if (attempt.signal !== null) string(attempt.signal, 'current attempt signal');
  if (attempt.denial_source !== null) oneOf(attempt.denial_source, new Set(['sandbox', 'managed_policy', 'runtime_policy']), 'current attempt denial source');
  string(attempt.reason, 'current attempt reason');
  for (const key of ['stdout_sha256', 'stderr_sha256']) if (attempt[key] !== null) digest(attempt[key], `current attempt ${key}`);
  if (!attempt.started && (attempt.output_started || attempt.exit_code !== null || attempt.signal !== null || attempt.stdout_sha256 !== null || attempt.stderr_sha256 !== null)) throw new Error('unstarted current attempt carries process evidence');
  if (attempt.started && (attempt.stdout_sha256 === null || attempt.stderr_sha256 === null)) throw new Error('started current attempt requires output hashes');
  if (CURRENT_FALLBACK_RESULTS.has(attempt.result) && attempt.output_started) throw new Error('availability fallback cannot follow substantive output');
  if (attempt.result === 'passed' && (!attempt.started || !attempt.output_started || attempt.exit_code !== 0 || attempt.signal !== null || attempt.denial_source !== null)) throw new Error('invalid passed current attempt');
  if (attempt.result === 'platform_denied' && (attempt.output_started || attempt.denial_source === null)) throw new Error('invalid current platform denial');
  if (attempt.result !== 'platform_denied' && attempt.denial_source !== null) throw new Error('unexpected current denial source');
  if (attempt.result === 'model_unavailable' && !attempt.started) throw new Error('model_unavailable requires a started real launch');
  if (['auth_failed', 'model_unavailable'].includes(attempt.result) && attempt.started && (attempt.exit_code === null || attempt.exit_code === 0 || attempt.signal !== null)) throw new Error(`invalid current ${attempt.result}`);
  if (attempt.result === 'tool_unavailable' && attempt.started && (attempt.exit_code === null || attempt.exit_code === 0 || attempt.signal !== null)) throw new Error('invalid current tool_unavailable');
  if (attempt.result === 'deadline_exceeded' && (!attempt.started || (attempt.exit_code === null && attempt.signal === null))) throw new Error('invalid current deadline');
  if (attempt.result === 'transient_transport' && (!attempt.started || attempt.output_started || attempt.exit_code !== null || attempt.signal !== null)) throw new Error('invalid current transient transport');
  if (attempt.result === 'nonzero_exit' && (!attempt.started || attempt.exit_code === null || attempt.exit_code === 0 || attempt.signal !== null)) throw new Error('invalid current nonzero exit');
  if (attempt.result === 'signaled' && (!attempt.started || !attempt.signal || attempt.exit_code !== null)) throw new Error('invalid current signal');
  if (attempt.result === 'output_invalid' && (!attempt.started || !attempt.output_started)) throw new Error('invalid current output failure');
  return attempt;
}

export function validateCurrentAttemptSequence(attempts, policy) {
  validateCurrentPolicy(policy);
  if (!Array.isArray(attempts) || attempts.length === 0 || attempts.length > policy.candidates.length) throw new Error('current attempt sequence bound');
  for (let index = 0; index < attempts.length; index += 1) {
    const attempt = validateCurrentAttempt(attempts[index]);
    if (jcs(attempt.candidate) !== jcs(policy.candidates[index])) throw new Error('current attempt candidate order mismatch');
    if (index < attempts.length - 1 && !CURRENT_FALLBACK_RESULTS.has(attempt.result)) throw new Error(`current attempt continued after terminal ${attempt.result}`);
    if (index < attempts.length - 1 && attempt.output_started) throw new Error('current attempt fallback after output is terminal');
  }
  const last = attempts.at(-1);
  return {
    selected_index: last.result === 'passed' ? attempts.length - 1 : null,
    exhausted: attempts.length === policy.candidates.length && CURRENT_FALLBACK_RESULTS.has(last.result),
    terminal: !CURRENT_FALLBACK_RESULTS.has(last.result),
  };
}

export function validateCurrentWaivers(waivers, phase = null, inputSha = null) {
  if (!Array.isArray(waivers)) throw new Error('current waivers must be an array');
  const claimed = new Set();
  const normalized = waivers.map((waiver) => {
    assertClosed(waiver, ['phase', 'input_sha256', 'roles', 'actor', 'reason', 'at'], 'current waiver');
    oneOf(waiver.phase, new Set(['draft', 'completion']), 'current waiver phase');
    digest(waiver.input_sha256, 'current waiver input');
    if (!Array.isArray(waiver.roles) || jcs(waiver.roles) !== jcs(['primary'])) throw new Error('current waiver roles must equal [primary]');
    const key = `${waiver.phase}:${waiver.input_sha256}:primary`;
    if (claimed.has(key)) throw new Error('duplicate current waiver');
    claimed.add(key);
    string(waiver.actor, 'current waiver actor');
    string(waiver.reason, 'current waiver reason');
    iso(waiver.at, 'current waiver at');
    return waiver;
  });
  return phase && inputSha ? normalized.filter((waiver) => waiver.phase === phase && waiver.input_sha256 === inputSha) : normalized;
}

function validateCurrentReproduction(value) {
  assertClosed(value, ['id', 'reproduction'], 'current reproduced finding');
  string(value.id, 'current reproduced finding id');
  assertClosed(value.reproduction, ['method', 'command', 'exit_code', 'evidence_sha256'], 'current reproduction');
  oneOf(value.reproduction.method, new Set(['read', 'command']), 'current reproduction method');
  digest(value.reproduction.evidence_sha256, 'current reproduction evidence');
  if (value.reproduction.method === 'read' && (value.reproduction.command !== null || value.reproduction.exit_code !== null)) throw new Error('current read reproduction carries command evidence');
  if (value.reproduction.method === 'command') {
    string(value.reproduction.command, 'current reproduction command');
    if (!Number.isInteger(value.reproduction.exit_code)) throw new Error('current reproduction exit code');
  }
  return value;
}

export function validateCurrentRawReview(raw, request, { expectedWaiver = null } = {}) {
  assertClosed(raw, ['schema', 'role', 'request', 'result', 'attempts', 'selected', 'reviewer_output', 'findings_sha256', 'waiver', 'waiver_sha256', 'reason'], 'current raw review');
  if (raw.schema !== 5 || raw.role !== 'primary' || jcs(raw.request) !== jcs(request)) throw new Error('current raw review request mismatch');
  validateRequest(request);
  oneOf(raw.result, new Set(['passed', 'unavailable', 'failed', 'waived']), 'current raw review result');
  if (!Array.isArray(raw.attempts)) throw new Error('current raw attempts');
  if (raw.result === 'waived') {
    if (raw.attempts.length || raw.selected !== null || raw.reviewer_output !== null || raw.findings_sha256 !== null || raw.reason !== null) throw new Error('invalid current waived review');
    if (raw.waiver === null || raw.waiver_sha256 !== sha256(jcs(raw.waiver))) throw new Error('current waiver hash mismatch');
    validateCurrentWaivers([raw.waiver], request.phase, request.input_sha256);
    if (expectedWaiver === null || jcs(raw.waiver) !== jcs(expectedWaiver)) throw new Error('current waiver is not the exact snapshot');
    return raw;
  }
  if (raw.waiver !== null || raw.waiver_sha256 !== null) throw new Error('non-waived current review carries waiver');
  const sequence = validateCurrentAttemptSequence(raw.attempts, request.policy);
  const last = raw.attempts.at(-1);
  if (raw.result === 'passed') {
    if (last.result !== 'passed' || sequence.selected_index === null || raw.selected === null || jcs(raw.selected) !== jcs(last.candidate) || raw.reviewer_output === null || raw.reason !== null) throw new Error('invalid current passed review');
    validateCurrentReviewerOutput(raw.reviewer_output, request);
    digest(raw.findings_sha256, 'current findings hash');
    if (raw.findings_sha256 !== sha256(jcs(raw.reviewer_output.findings))) throw new Error('current findings hash mismatch');
  } else {
    if (raw.selected !== null || raw.reviewer_output !== null || raw.findings_sha256 !== null) throw new Error('non-passed current review carries reviewer result');
    string(raw.reason, 'current terminal reason');
    if (raw.result === 'unavailable' && !sequence.exhausted) throw new Error('current unavailable review requires exhausted availability candidates');
    if (raw.result === 'failed' && (!sequence.terminal || sequence.selected_index !== null)) throw new Error('current failed review cannot discard a passed attempt');
  }
  return raw;
}

function validateCurrentReviewerRecord(reviewer, request, reproduced, context) {
  assertClosed(reviewer, ['raw', 'accepted_finding_ids', 'rejected'], 'current reviewer record');
  validateCurrentRawReview(reviewer.raw, request, context);
  if (!Array.isArray(reviewer.accepted_finding_ids) || !Array.isArray(reviewer.rejected)) throw new Error('current reviewer reconciliation arrays');
  const findings = reviewer.raw.reviewer_output?.findings || [];
  const known = new Set(findings.map((finding) => finding.id));
  const used = new Set();
  for (const id of reviewer.accepted_finding_ids) {
    if (!known.has(id) || used.has(id)) throw new Error('current accepted finding id');
    used.add(id);
  }
  for (const row of reviewer.rejected) {
    assertClosed(row, ['id', 'reason'], 'current rejected finding');
    if (!known.has(row.id) || used.has(row.id)) throw new Error('current rejected finding id');
    string(row.reason, 'current rejection reason');
    used.add(row.id);
  }
  if (used.size !== known.size) throw new Error('current reviewer accepted/rejected reconciliation is not an exact partition');
  if (!Array.isArray(reproduced)) throw new Error('current reproduced must be an array');
  const reproducedIds = new Set();
  for (const value of reproduced) {
    validateCurrentReproduction(value);
    if (!known.has(value.id) || reproducedIds.has(value.id)) throw new Error('current reproduced finding id');
    reproducedIds.add(value.id);
  }
  for (const id of reviewer.accepted_finding_ids) if (!reproducedIds.has(id)) throw new Error('current accepted finding was not reproduced');
  if (reproducedIds.size !== known.size) throw new Error('every current finding must have independent reproduction evidence');
}

function currentBlockingFindings(reviewer) {
  return (reviewer.raw.reviewer_output?.findings || []).filter((finding) => finding.status === 'blocking_gap');
}

function currentAcceptedBlockingFindings(reviewer) {
  const findings = new Map((reviewer.raw.reviewer_output?.findings || []).map((finding) => [finding.id, finding]));
  return reviewer.accepted_finding_ids.filter((id) => findings.get(id)?.status === 'blocking_gap');
}

function currentOutcome(reviewer) {
  const raw = reviewer.raw;
  if (raw.result === 'waived') return { outcome: 'waived', eligible: true };
  if (raw.result === 'unavailable') return { outcome: 'unavailable', eligible: false };
  if (raw.result === 'failed') return { outcome: 'not_ready', eligible: false };
  if (currentBlockingFindings(reviewer).length > 0) return { outcome: 'not_ready', eligible: false };
  return { outcome: 'passed', eligible: true };
}

function deriveCurrentCompletionVerdict(primary, inventory, reviewer) {
  validatePrimary(primary, inventory);
  const reviewOutcome = currentOutcome(reviewer);
  if (
    reviewOutcome.outcome === 'unavailable'
    || reviewOutcome.outcome === 'not_ready'
    || primary.ci.exit_code !== 0
    || primary.regressions.length > 0
    || primary.findings.some((finding) => finding.severity === 'high')
    || currentAcceptedBlockingFindings(reviewer).length > 0
  ) return 'regressed';
  if (primary.goal_met === 'yes' && primary.acceptance.every((criterion) => criterion.met)) return 'passed';
  return 'partial';
}

export function validateCurrentReviewRunResult(result, { waivers = [] } = {}) {
  const completion = result?.request?.phase === 'completion';
  const keys = completion
    ? ['schema', 'kind', 'request', 'plan_input_sha256', 'diff_sha256', 'acceptance_inventory', 'acceptance_inventory_sha256', 'reviewer', 'reproduced', 'outcome', 'primary', 'completion_verdict']
    : ['schema', 'kind', 'request', 'reviewer', 'reproduced', 'outcome', 'pre_execution_eligible'];
  assertClosed(result, keys, 'current review run');
  if (result.schema !== 5 || result.kind !== result.request?.phase) throw new Error('current review run kind');
  validateRequest(result.request);
  const normalized = validateCurrentWaivers(waivers, result.request.phase, result.request.input_sha256);
  const expectedWaiver = normalized.find((waiver) => waiver.roles.includes('primary')) || null;
  validateCurrentReviewerRecord(result.reviewer, result.request, result.reproduced, { expectedWaiver });
  const expected = currentOutcome(result.reviewer);
  if (result.outcome !== expected.outcome) throw new Error(`current outcome mismatch: expected ${expected.outcome}`);
  if (!completion) {
    if (result.pre_execution_eligible !== expected.eligible) throw new Error('current pre_execution_eligible mismatch');
    return result;
  }
  if (
    result.request.lifecycle_intent !== 'none'
    || result.plan_input_sha256 !== result.request.input_sha256
    || result.diff_sha256 !== result.request.diff_sha256
    || !HEX40.test(result.request.planned_at_commit)
    || !HEX40.test(result.request.execution_base_commit)
  ) throw new Error('current completion request identity mismatch');
  digest(result.diff_sha256, 'current completion diff');
  validateAcceptanceInventory(result.acceptance_inventory);
  if (
    result.acceptance_inventory_sha256 !== sha256(jcs(result.acceptance_inventory))
    || result.acceptance_inventory_sha256 !== result.request.acceptance_inventory_sha256
  ) throw new Error('current completion acceptance inventory mismatch');
  const verdict = deriveCurrentCompletionVerdict(result.primary, result.acceptance_inventory, result.reviewer);
  if (result.completion_verdict !== verdict) throw new Error('current completion verdict mismatch');
  return result;
}

export function validateCurrentReviewReceipt(receipt, expected = null, { waivers = [], expectedPolicy = null } = {}) {
  const completion = receipt?.phase === 'completion';
  const keys = completion
    ? ['schema', 'phase', 'request', 'planned_at_commit', 'execution_base_commit', 'reviewed_head', 'diff_sha256', 'plan_input_sha256', 'acceptance_inventory', 'acceptance_inventory_sha256', 'policy', 'policy_sha256', 'reviewer', 'reproduced', 'outcome', 'primary', 'completion_verdict', 'series', 'reviewed_at']
    : ['schema', 'phase', 'request', 'input_sha256', 'reviewed_commit', 'policy', 'policy_sha256', 'reviewer', 'reproduced', 'outcome', 'pre_execution_eligible', 'series', 'reviewed_at'];
  assertClosed(receipt, keys, 'current review receipt');
  if (receipt.schema !== 5 || receipt.phase !== receipt.request?.phase) throw new Error('current review receipt phase');
  validateRequest(receipt.request);
  if (jcs(receipt.policy) !== jcs(receipt.request.policy) || receipt.policy_sha256 !== receipt.request.policy_sha256) throw new Error('current review receipt policy mismatch');
  validateExpectedPolicy(receipt, expectedPolicy);
  const expectedObject = expected && typeof expected === 'object' ? expected : {};
  const expectedInput = typeof expected === 'string' ? expected : expectedObject.input_sha256 ?? expectedObject.plan_input_sha256 ?? null;
  let run;
  if (!completion) {
    if (receipt.input_sha256 !== receipt.request.input_sha256 || receipt.reviewed_commit !== receipt.request.reviewed_commit_or_head) throw new Error('current draft receipt input mismatch');
    if (expectedInput !== null && receipt.input_sha256 !== expectedInput) throw new Error('stale current draft receipt');
    run = {
      schema: 5,
      kind: 'draft',
      request: receipt.request,
      reviewer: receipt.reviewer,
      reproduced: receipt.reproduced,
      outcome: receipt.outcome,
      pre_execution_eligible: receipt.pre_execution_eligible,
    };
  } else {
    if (
      receipt.request.lifecycle_intent !== 'none'
      || receipt.reviewed_head !== receipt.request.reviewed_commit_or_head
      || receipt.plan_input_sha256 !== receipt.request.input_sha256
      || receipt.planned_at_commit !== receipt.request.planned_at_commit
      || receipt.execution_base_commit !== receipt.request.execution_base_commit
      || receipt.diff_sha256 !== receipt.request.diff_sha256
      || !HEX40.test(receipt.planned_at_commit)
      || !HEX40.test(receipt.execution_base_commit)
      || !HEX40.test(receipt.reviewed_head)
    ) throw new Error('current completion receipt request mismatch');
    run = {
      schema: 5,
      kind: 'completion',
      request: receipt.request,
      plan_input_sha256: receipt.plan_input_sha256,
      diff_sha256: receipt.diff_sha256,
      acceptance_inventory: receipt.acceptance_inventory,
      acceptance_inventory_sha256: receipt.acceptance_inventory_sha256,
      reviewer: receipt.reviewer,
      reproduced: receipt.reproduced,
      outcome: receipt.outcome,
      primary: receipt.primary,
      completion_verdict: receipt.completion_verdict,
    };
  }
  validateCurrentReviewRunResult(run, { waivers });
  const series = validateCurrentReviewSeries(receipt.series, { waivers });
  if (jcs(series.rounds.at(-1)) !== jcs(run)) throw new Error('current completion receipt series final run mismatch');
  if (completion && expectedInput !== null && receipt.plan_input_sha256 !== expectedInput) throw new Error('stale current completion receipt input');
  for (const [key, value] of Object.entries(expectedObject)) {
    if (key === 'review_status') continue;
    if (value !== undefined && jcs(receipt[key]) !== jcs(value)) throw new Error(`stale current completion receipt ${key}`);
  }
  if (completion && expectedObject.review_status !== undefined && expectedObject.review_status !== receipt.completion_verdict) throw new Error('current completion review_status mismatch');
  iso(receipt.reviewed_at, 'current reviewed_at');
  return receipt;
}

function validateCurrentRepairTarget(target) {
  assertClosed(target, ['id', 'criterion', 'status', 'defect', 'fix', 'reproduction'], 'current repair target');
  string(target.id, 'current repair target id');
  oneOf(target.criterion, new Set(CURRENT_CRITERIA), 'current repair target criterion');
  if (target.status !== 'blocking_gap') throw new Error('current repair target must be blocking_gap');
  string(target.defect, 'current repair target defect');
  string(target.fix, 'current repair target fix');
  validateCurrentReproduction({ id: target.id, reproduction: target.reproduction });
  return target;
}

function validateCurrentRepairTransition(transition) {
  assertClosed(transition, ['schema', 'from_round_index', 'previous_input_sha256', 'current_input_sha256', 'accepted_finding_ids', 'targets', 'repair_targets_sha256'], 'current repair transition');
  if (transition.schema !== 5 || transition.from_round_index !== 1) throw new Error('current repair transition allows one repair after round one');
  digest(transition.previous_input_sha256, 'current repair previous input');
  digest(transition.current_input_sha256, 'current repair current input');
  if (transition.previous_input_sha256 === transition.current_input_sha256) throw new Error('current repair requires changed input');
  if (!Array.isArray(transition.accepted_finding_ids) || !Array.isArray(transition.targets) || transition.targets.length === 0) throw new Error('current repair targets must be nonempty');
  const accepted = [...transition.accepted_finding_ids];
  if (new Set(accepted).size !== accepted.length || jcs(accepted) !== jcs([...accepted].sort(compareUtf16))) throw new Error('current accepted finding ids must be unique and sorted');
  const ids = [];
  for (const target of transition.targets) {
    validateCurrentRepairTarget(target);
    ids.push(target.id);
  }
  if (new Set(ids).size !== ids.length || jcs(ids) !== jcs([...ids].sort(compareUtf16)) || jcs(ids) !== jcs(accepted)) throw new Error('current repair targets must equal accepted finding ids');
  digest(transition.repair_targets_sha256, 'current repair targets hash');
  const expected = sha256(jcs({ schema: 5, accepted_finding_ids: accepted, targets: transition.targets }));
  if (transition.repair_targets_sha256 !== expected) throw new Error('current repair target hash mismatch');
  return transition;
}

export function buildCurrentRepairTransition({ fromRoundIndex, previousInputSha256, currentInputSha256, acceptedFindingIds, targets }) {
  if (!Array.isArray(acceptedFindingIds) || !Array.isArray(targets)) throw new Error('current repair target arrays');
  const accepted = [...acceptedFindingIds].sort(compareUtf16);
  const normalizedTargets = targets.map((target) => {
    validateCurrentRepairTarget(target);
    return structuredClone(target);
  }).sort((a, b) => compareUtf16(a.id, b.id));
  const transition = {
    schema: 5,
    from_round_index: fromRoundIndex,
    previous_input_sha256: previousInputSha256,
    current_input_sha256: currentInputSha256,
    accepted_finding_ids: accepted,
    targets: normalizedTargets,
    repair_targets_sha256: sha256(jcs({ schema: 5, accepted_finding_ids: accepted, targets: normalizedTargets })),
  };
  return validateCurrentRepairTransition(transition);
}

export function validateCurrentReviewSeries(series, { waivers = [] } = {}) {
  assertClosed(series, ['schema', 'policy_sha256', 'initial_input_sha256', 'current_input_sha256', 'rounds', 'repairs'], 'current review series');
  if (series.schema !== 5 || !Array.isArray(series.rounds) || series.rounds.length < 1 || series.rounds.length > 2) throw new Error('current review series permits at most two rounds');
  if (!Array.isArray(series.repairs) || series.repairs.length !== series.rounds.length - 1) throw new Error('current review series repair count');
  digest(series.policy_sha256, 'current review series policy');
  digest(series.initial_input_sha256, 'current review series initial input');
  digest(series.current_input_sha256, 'current review series current input');
  const first = series.rounds[0];
  validateCurrentReviewRunResult(first, { waivers });
  validateCurrentPolicy(first.request.policy);
  if (first.request.review_mode !== 'full' || first.request.round_index !== 1) throw new Error('current review series round one must be full');
  if (series.policy_sha256 !== first.request.policy_sha256 || series.policy_sha256 !== sha256(jcs(first.request.policy))) throw new Error('current review series policy mismatch');
  if (first.request.input_sha256 !== series.initial_input_sha256) throw new Error('current review series initial input mismatch');
  const phase = first.request.phase;
  const kind = first.kind;
  const lifecycleIntent = first.request.lifecycle_intent;
  for (const round of series.rounds) {
    validateCurrentReviewRunResult(round, { waivers });
    if (round.request.phase !== phase || round.kind !== kind || round.request.lifecycle_intent !== lifecycleIntent) throw new Error('current review series phase, kind, or lifecycle drift');
    if (phase === 'completion' && (round.request.planned_at_commit !== first.request.planned_at_commit || round.request.execution_base_commit !== first.request.execution_base_commit)) throw new Error('current completion series execution identity drift');
  }
  if (series.rounds.length === 2) {
    const second = series.rounds[1];
    if (second.request.review_mode !== 'repair' || second.request.round_index !== 2) throw new Error('current review series round two must be repair without reset');
    const transition = validateCurrentRepairTransition(series.repairs[0]);
    if (second.request.previous_input_sha256 !== first.request.input_sha256 || second.request.input_sha256 === first.request.input_sha256) throw new Error('current review series repair requires changed input');
    if (transition.previous_input_sha256 !== first.request.input_sha256 || transition.current_input_sha256 !== second.request.input_sha256 || transition.repair_targets_sha256 !== second.request.repair_targets_sha256) throw new Error('current review series repair transition mismatch');
    if (second.request.policy_sha256 !== series.policy_sha256 || jcs(second.request.policy) !== jcs(first.request.policy)) throw new Error('current review series policy drift');
    const findings = new Map((first.reviewer.raw.reviewer_output?.findings || []).map((finding) => [finding.id, finding]));
    const reproduced = new Map(first.reproduced.map((value) => [value.id, value.reproduction]));
    const acceptedBlocking = first.reviewer.accepted_finding_ids.filter((id) => findings.get(id)?.status === 'blocking_gap').sort(compareUtf16);
    const rejectedBlocking = currentBlockingFindings(first.reviewer).filter((finding) => !first.reviewer.accepted_finding_ids.includes(finding.id));
    if (rejectedBlocking.length > 0) throw new Error('current repair series cannot leave a rejected blocking finding outside repair');
    if (jcs(transition.accepted_finding_ids) !== jcs(acceptedBlocking)) throw new Error('current repair targets must equal accepted blocking findings');
    for (const target of transition.targets) {
      const finding = findings.get(target.id);
      const reproduction = reproduced.get(target.id);
      if (!finding || !reproduction || target.criterion !== finding.criterion || target.status !== finding.status || target.defect !== finding.defect || target.fix !== finding.fix || jcs(target.reproduction) !== jcs(reproduction)) throw new Error('current repair target was not exactly reproduced');
    }
  }
  if (series.rounds.at(-1).request.input_sha256 !== series.current_input_sha256) throw new Error('current review series current input mismatch');
  return series;
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

function validateStrictExecutionRange({ repo, planPath, plannedAtCommit, executionBaseCommit, reviewedHead }) {
  const logical = safeLogical(planPath); exactCommit(repo, plannedAtCommit, 'planned_at_commit'); exactCommit(repo, executionBaseCommit, 'execution_base_commit'); exactCommit(repo, reviewedHead, 'reviewed_head');
  if (!ancestor(repo, plannedAtCommit, executionBaseCommit) || !ancestor(repo, executionBaseCommit, reviewedHead)) throw new Error('execution base ancestry mismatch');
  const parentRow = git(repo, ['rev-list', '--parents', '-n', '1', executionBaseCommit]).trim().split(/\s+/); if (parentRow.length !== 2) throw new Error('execution base must be a single-parent start transition');
  const changed = git(repo, ['diff-tree', '--no-commit-id', '--name-only', '-r', executionBaseCommit]).trim().split('\n').filter(Boolean);
  if (changed.length !== 1 || changed[0] !== logical) throw new Error('execution base must change only the plan');
  const atBaseBytes = git(repo, ['show', `${executionBaseCommit}:${logical}`], null); const beforeBytes = git(repo, ['show', `${parentRow[1]}:${logical}`], null); const atHeadBytes = git(repo, ['show', `${reviewedHead}:${logical}`], null);
  const atBase = parsePlan(atBaseBytes).frontmatter; const before = parsePlan(beforeBytes).frontmatter; const atHead = parsePlan(atHeadBytes).frontmatter;
  if (atBase.status !== 'ongoing' || atBase.started_at === null || atBase.started_at === undefined || !['planned', 'scheduled'].includes(before.status) || (before.started_at !== null && before.started_at !== undefined) || canonicalPlanView(atBaseBytes) !== canonicalPlanView(beforeBytes)) throw new Error('execution base is not the plan-only first-start transition');
  if (atBase.planned_at_commit !== plannedAtCommit || atHead.planned_at_commit !== plannedAtCommit || atHead.execution_base_commit !== executionBaseCommit) throw new Error('plan execution identity mismatch');
  return { schema: 1, planned_at_commit: plannedAtCommit, execution_base_commit: executionBaseCommit, reviewed_head: reviewedHead, execution_parent: parentRow[1] };
}

export function validateExecutionRange(input) {
  try { return validateStrictExecutionRange(input); } catch (error) {
    if (!(error instanceof Error) || error.message !== 'execution base is not the plan-only first-start transition') throw error;
    let historical;
    try { historical = legacyHistoricalContext(input); } catch { throw error; }
    const headBytes = git(input.repo, ['show', `${input.reviewedHead}:${historical.plan_path}`], null);
    const application = extractCompatibilityApplication(headBytes, { required: false });
    if (application === null) throw new Error('execution compatibility evidence missing');
    return validateLegacyCompatibilityRange({ ...input, historical, application, headBytes });
  }
}

function completionDiff(repo, executionBaseCommit, reviewedHead) {
  return git(repo, ['diff', '--binary', '--full-index', '--find-renames', '--no-ext-diff', '--no-textconv', '--no-color', executionBaseCommit, reviewedHead, '--'], null);
}

function safeLogical(logical) {
  if (typeof logical !== 'string' || !logical || path.isAbsolute(logical) || logical.split('/').includes('..') || logical === '.git' || logical.startsWith('.git/')) throw new Error(`path escapes repo: ${logical}`);
  return logical.split(path.sep).join('/');
}

function exactUtf8(bytes, label) {
  const raw = bytes instanceof Uint8Array ? Buffer.from(bytes) : Buffer.from(bytes);
  const text = decodeUtf8(raw);
  if (!raw.equals(Buffer.from(text))) throw new Error(`${label} must use LF UTF-8 bytes`);
  return text;
}

function splitPlanText(bytes) {
  const text = exactUtf8(bytes, 'plan');
  const firstLf = text.indexOf('\n');
  const end = text.indexOf('\n---\n', firstLf);
  if (firstLf !== 3 || end < 0) throw new Error('plan frontmatter boundary');
  const bodyAt = end + 5;
  parsePlan(Buffer.from(text));
  return { text, prefix: text.slice(0, bodyAt), body: text.slice(bodyAt) };
}

function bodyRows(body) {
  if (!body.endsWith('\n')) throw new Error('plan body must end in LF');
  const rows = []; let offset = 0;
  for (const match of body.matchAll(/([^\n]*)\n/g)) {
    rows.push({ line: match[1], start: offset, end: offset + match[0].length });
    offset += match[0].length;
  }
  if (offset !== body.length) throw new Error('plan body row boundary');
  return rows;
}

function scanBody(body) {
  const rows = bodyRows(body); const headings = []; const unfenced = []; let fence = null;
  for (const row of rows) {
    const fenceMatch = /^( {0,3})(`{3,}|~{3,})(.*)$/.exec(row.line);
    if (fence === null && fenceMatch) {
      fence = { marker: fenceMatch[2][0], length: fenceMatch[2].length };
      continue;
    }
    if (fence !== null && fenceMatch && fenceMatch[2][0] === fence.marker && fenceMatch[2].length >= fence.length && /^\s*$/.test(fenceMatch[3])) {
      fence = null; continue;
    }
    if (fence !== null) continue;
    unfenced.push(row);
    const heading = /^## ([^\n]+)$/.exec(row.line);
    if (heading) headings.push({ name: heading[1], start: row.start, line_end: row.end });
  }
  return { rows, headings, unfenced };
}

function partitionBody(body) {
  const { headings } = scanBody(body);
  if (headings.length === 0) throw new Error('execution compatibility body headings missing');
  const names = new Set();
  for (const heading of headings) {
    if (names.has(heading.name)) throw new Error('execution compatibility duplicate body heading');
    names.add(heading.name);
  }
  const partitions = [{ ordinal: 0, name: '__preamble__', bytes: body.slice(0, headings[0].start) }];
  headings.forEach((heading, index) => partitions.push({ ordinal: index + 1, name: heading.name, bytes: body.slice(heading.start, headings[index + 1]?.start ?? body.length), start: heading.start, end: headings[index + 1]?.start ?? body.length, line_end: heading.line_end }));
  return partitions;
}

function uniquePartition(body, name) {
  const matches = partitionBody(body).filter((row) => row.name === name);
  if (matches.length !== 1) throw new Error(`plan must contain one unfenced ## ${name} section`);
  return matches[0];
}

function insertBeforeReview(bytes, markdown) {
  const plan = splitPlanText(bytes); const review = uniquePartition(plan.body, 'Review');
  return Buffer.from(`${plan.prefix}${plan.body.slice(0, review.start)}${markdown}${plan.body.slice(review.start)}`);
}

function replacePlanBody(bytes, body) {
  const plan = splitPlanText(bytes);
  return Buffer.from(`${plan.prefix}${body}`);
}

function normalizeAllowedFrontmatter(bytes, allowed) {
  const text = exactUtf8(bytes, 'plan'); const lines = text.split('\n'); const end = lines.indexOf('---', 1);
  if (lines[0] !== '---' || end < 0) throw new Error('plan frontmatter boundary');
  for (const key of allowed) {
    const indexes = [];
    for (let i = 1; i < end; i += 1) if (lines[i].startsWith(`${key}:`)) indexes.push(i);
    if (indexes.length > 1) throw new Error(`duplicate frontmatter key: ${key}`);
    if (indexes.length === 1) lines[indexes[0]] = `${key}: <allowed>`;
  }
  return lines.join('\n');
}

function requirePlanDelta(beforeBytes, afterBytes, expectedBytes, label, allowed = ['updated']) {
  parsePlan(beforeBytes); parsePlan(afterBytes); parsePlan(expectedBytes);
  if (normalizeAllowedFrontmatter(afterBytes, allowed) !== normalizeAllowedFrontmatter(expectedBytes, allowed)) throw new Error(`${label} delta mismatch`);
}

function gitResult(repo, args, encoding = 'buffer', extra = {}) {
  const result = spawnSync('git', args, { cwd: repo, encoding, ...extra });
  if (result.error || result.signal !== null || result.status !== 0) {
    const stderr = Buffer.isBuffer(result.stderr) ? result.stderr.toString() : String(result.stderr ?? '');
    throw new Error(`git ${args.join(' ')} failed: ${stderr.trim()}`);
  }
  return result.stdout;
}

function gitObject(repo, spec, label) {
  const oid = git(repo, ['rev-parse', '--verify', spec]).trim();
  if (!HEX40.test(oid)) throw new Error(`${label} object id`);
  return oid;
}

function planBlob(repo, commit, planPath) {
  return git(repo, ['show', `${commit}:${planPath}`], null);
}

function changedPaths(repo, parent, commit) {
  const bytes = git(repo, ['diff-tree', '--no-commit-id', '--name-only', '-r', '-z', '--no-renames', parent, commit, '--'], null);
  const text = exactUtf8(bytes, 'git changed paths');
  if (text !== '' && !text.endsWith('\0')) throw new Error('git changed paths must be NUL terminated');
  const rows = text === '' ? [] : text.slice(0, -1).split('\0').map(safeLogical);
  if (new Set(rows).size !== rows.length) throw new Error('git changed paths contain duplicates');
  return rows;
}

function commitParent(repo, commit, label) {
  exactCommit(repo, commit, label);
  const row = git(repo, ['rev-list', '--parents', '-n', '1', commit]).trim().split(/\s+/);
  if (row.length !== 2 || row[0] !== commit || !HEX40.test(row[1])) throw new Error(`${label} must be single-parent`);
  return row[1];
}

function requirePlanOnlyChild(repo, commit, parent, planPath, label) {
  if (commitParent(repo, commit, label) !== parent) throw new Error(`${label} parent mismatch`);
  const paths = changedPaths(repo, parent, commit);
  if (paths.length !== 1 || paths[0] !== planPath) throw new Error(`${label} must change only the plan`);
}

function nextCommit(repo, parent, head, label) {
  if (!ancestor(repo, parent, head) || parent === head) throw new Error(`${label} is absent from history`);
  const rows = git(repo, ['rev-list', '--parents', '--reverse', '--ancestry-path', `${parent}..${head}`]).trim().split('\n').filter(Boolean);
  if (rows.length === 0) throw new Error(`${label} is absent from history`);
  const first = rows[0].split(/\s+/);
  if (first.length !== 2 || first[1] !== parent) throw new Error(`${label} is not contiguous`);
  return first[0];
}

function assertCompatibilityConstants() {
  if (sha256(jcs(LEGACY_START_TRANSITION_COMPATIBILITY_POLICY)) !== LEGACY_START_TRANSITION_COMPATIBILITY_POLICY_SHA256) throw new Error('execution compatibility policy constant mismatch');
  if (sha256(jcs(COMPATIBILITY_AUTHORIZATION_SCOPE)) !== COMPATIBILITY_AUTHORIZATION_SCOPE_SHA256) throw new Error('execution compatibility authorization scope constant mismatch');
  if (sha256(jcs(RELEASE_AUTHORIZATION)) !== RELEASE_AUTHORIZATION_SHA256) throw new Error('Docks release authorization constant mismatch');
  if (sha256(PREREQUISITE_PENDING_MARKER) !== PREREQUISITE_PENDING_MARKER_SHA256) throw new Error('Docks prerequisite marker constant mismatch');
  if (sha256(PREREQUISITE_STEP_PLANNED) !== 'cd9a017792436c305c5c7c3a8b3b62a9325c9d5951d2e571084e72942cb17174' || sha256(PREREQUISITE_STEP_DONE) !== '1319228f952ab08c95122d98907a7654bf18ba31db7e6d21b015178cd7675aae') throw new Error('Docks prerequisite Step-P constant mismatch');
}

function legacyPlannedResolution(repo, value) {
  if (!LEGACY_HEX.test(value)) throw new Error('legacy planned_at_commit abbreviation');
  const result = spawnSync('git', ['rev-parse', '--verify', `${value}^{commit}`], { cwd: repo, encoding: 'utf8' });
  if (result.error || result.signal !== null || result.status !== 0 || result.stderr !== '') throw new Error('legacy planned_at_commit does not resolve uniquely');
  const resolved = result.stdout.trim();
  if (!HEX40.test(resolved)) throw new Error('legacy planned_at_commit resolution');
  return resolved;
}

function validateLegacyFrontmatter(before, atBase) {
  const beforeKeys = Object.keys(before).sort(compareUtf16); const baseKeys = Object.keys(atBase).sort(compareUtf16);
  if (jcs(beforeKeys) !== jcs(baseKeys)) throw new Error('legacy start frontmatter key drift');
  const allowed = new Set(LEGACY_START_TRANSITION_COMPATIBILITY_POLICY.start.allowed_frontmatter_changes);
  for (const key of beforeKeys) if (jcs(before[key]) !== jcs(atBase[key]) && !allowed.has(key)) throw new Error(`legacy start frontmatter changed ${key}`);
  if (!LEGACY_START_TRANSITION_COMPATIBILITY_POLICY.start.from_status.includes(before.status) || (before.started_at !== null && before.started_at !== undefined) || atBase.status !== 'ongoing' || atBase.started_at === null || atBase.started_at === undefined) throw new Error('legacy start lifecycle mismatch');
}

function pathExistsAt(repo, commit, logical) {
  const result = spawnSync('git', ['cat-file', '-e', `${commit}:${logical}`], { cwd: repo, encoding: 'utf8' });
  if (result.error || result.signal !== null) throw new Error('git path existence check failed');
  if (result.status === 0) return true;
  if (result.status === 128) return false;
  throw new Error(`git path existence check failed: ${result.stderr.trim()}`);
}

function legacyHistoricalContext({ repo, planPath, plannedAtCommit, executionBaseCommit, reviewedHead }) {
  assertCompatibilityConstants();
  const plan_path = safeLogical(planPath);
  exactCommit(repo, plannedAtCommit, 'planned_at_commit'); exactCommit(repo, executionBaseCommit, 'execution_base_commit'); exactCommit(repo, reviewedHead, 'reviewed_head');
  if (!ancestor(repo, plannedAtCommit, executionBaseCommit) || !ancestor(repo, executionBaseCommit, reviewedHead)) throw new Error('execution base ancestry mismatch');
  const execution_parent = commitParent(repo, executionBaseCommit, 'execution_base_commit');
  const startPaths = changedPaths(repo, execution_parent, executionBaseCommit);
  if (startPaths.length !== 1 || startPaths[0] !== plan_path) throw new Error('legacy start must change only the plan');
  const parentBytes = planBlob(repo, execution_parent, plan_path); const baseBytes = planBlob(repo, executionBaseCommit, plan_path); const headBytes = planBlob(repo, reviewedHead, plan_path);
  const parentPlan = parsePlan(parentBytes); const basePlan = parsePlan(baseBytes); const headPlan = parsePlan(headBytes);
  const legacy = parentPlan.frontmatter.planned_at_commit;
  if (basePlan.frontmatter.planned_at_commit !== legacy || legacyPlannedResolution(repo, legacy) !== plannedAtCommit) throw new Error('legacy planned_at_commit identity mismatch');
  validateLegacyFrontmatter(parentPlan.frontmatter, basePlan.frontmatter);
  if (headPlan.frontmatter.planned_at_commit !== plannedAtCommit || headPlan.frontmatter.execution_base_commit !== executionBaseCommit) throw new Error('plan execution identity mismatch');
  const parentPartitions = partitionBody(parentPlan.body); const basePartitions = partitionBody(basePlan.body);
  if (jcs(parentPartitions.map((row) => row.name)) !== jcs(basePartitions.map((row) => row.name))) throw new Error('execution compatibility heading vector changed');
  const protectedNames = new Set(LEGACY_START_TRANSITION_COMPATIBILITY_POLICY.body.protected_sections);
  const partitions = parentPartitions.map((before, index) => {
    const after = basePartitions[index]; const before_sha256 = sha256(before.bytes); const after_sha256 = sha256(after.bytes);
    return { ordinal: before.ordinal, name: before.name, before_sha256, after_sha256, changed: before_sha256 !== after_sha256 };
  });
  if (partitions[0].changed) throw new Error('execution compatibility preamble changed');
  for (const row of partitions) if (row.changed && protectedNames.has(row.name)) throw new Error(`execution compatibility protected section changed: ${row.name}`);
  const changed = partitions.filter((row) => row.changed);
  if (changed.length === 0) throw new Error('execution compatibility changed sections missing');
  const protectedSections = partitions.filter((row) => protectedNames.has(row.name)).map((row) => ({ ordinal: row.ordinal, name: row.name, sha256: row.before_sha256 }));
  if (protectedSections.length !== protectedNames.size) throw new Error('execution compatibility protected section missing');
  if (pathExistsAt(repo, plannedAtCommit, plan_path)) throw new Error('plan path existed at planned_at_commit');
  const creationRows = git(repo, ['rev-list', '--reverse', '--ancestry-path', `${plannedAtCommit}..${execution_parent}`, '--', plan_path]).trim().split('\n').filter(Boolean);
  if (creationRows.length === 0) throw new Error('plan creation commit missing');
  const plan_creation_commit = creationRows[0];
  if (commitParent(repo, plan_creation_commit, 'plan creation commit') !== plannedAtCommit) throw new Error('plan creation parent mismatch');
  const creationPaths = changedPaths(repo, plannedAtCommit, plan_creation_commit);
  if (creationPaths.length !== 1 || creationPaths[0] !== plan_path) throw new Error('plan creation must be plan-only');
  const creationStatus = git(repo, ['diff-tree', '--no-commit-id', '--name-status', '-r', '--no-renames', plannedAtCommit, plan_creation_commit, '--', plan_path]).trim();
  if (creationStatus !== `A\t${plan_path}` || !ancestor(repo, plan_creation_commit, execution_parent)) throw new Error('plan creation add/ancestry mismatch');
  const partitionManifest = { schema: 1, partitions };
  const protectedPreimage = { schema: 1, sections: protectedSections };
  return {
    repo, plan_path, planned_at_commit: plannedAtCommit, plan_creation_commit, plan_creation_parent: plannedAtCommit,
    execution_parent, execution_base_commit: executionBaseCommit, legacy_planned_at_value: legacy,
    evidence_input_commit: reviewedHead,
    evidence_input_plan_blob: gitObject(repo, `${reviewedHead}:${plan_path}`, 'evidence input plan blob'),
    parent_plan_blob: gitObject(repo, `${execution_parent}:${plan_path}`, 'parent plan blob'),
    base_plan_blob: gitObject(repo, `${executionBaseCommit}:${plan_path}`, 'base plan blob'),
    parentBytes, baseBytes, headBytes, partitions,
    partition_manifest_sha256: sha256(jcs(partitionManifest)),
    protected_sections_sha256: sha256(jcs(protectedPreimage)),
    changed_sections: changed.map((row) => ({
      name: row.name,
      before_sha256: row.before_sha256,
      after_sha256: row.after_sha256,
      transition_sha256: sha256(jcs({ schema: 1, name: row.name, before_sha256: row.before_sha256, after_sha256: row.after_sha256 })),
    })).sort((a, b) => compareUtf16(a.name, b.name)),
  };
}

function transitionDiffArgs(context) {
  return [
    '--no-pager', '-c', 'diff.algorithm=myers', '-c', 'diff.context=3', '-c', 'diff.interHunkContext=0', '-c', 'diff.suppressBlankEmpty=false', '-c', 'diff.indentHeuristic=false', '-c', 'diff.renames=false',
    'diff', '--no-index', '--text', '--binary', '--full-index', '--no-renames', '--diff-algorithm=myers', '--unified=3', '--inter-hunk-context=0', '--no-indent-heuristic', '--no-ext-diff', '--no-textconv', '--no-color', '--no-prefix',
    '--', `a/${context.plan_path}`, `b/${context.plan_path}`,
  ];
}

function transitionDiffText(bytes) {
  const text = exactUtf8(bytes, 'execution compatibility transition diff');
  if (!text.endsWith('\n') || text.endsWith('\n\n')) throw new Error('execution compatibility transition diff must end in one LF');
  return text;
}

function canonicalTransitionDiffEnv(source) {
  const env = { ...source };
  for (const key of Object.keys(env)) {
    if (['GIT_ATTR_SOURCE', 'GIT_COMMON_DIR', 'GIT_CONFIG', 'GIT_CONFIG_PARAMETERS', 'GIT_DIFF_OPTS', 'GIT_DIR', 'GIT_EXTERNAL_DIFF', 'GIT_INDEX_FILE', 'GIT_OBJECT_DIRECTORY', 'GIT_WORK_TREE'].includes(key) || /^GIT_CONFIG_(KEY|VALUE)_[0-9]+$/.test(key)) delete env[key];
  }
  env.GIT_CONFIG_GLOBAL = os.devNull;
  env.GIT_CONFIG_SYSTEM = os.devNull;
  env.GIT_CONFIG_NOSYSTEM = '1';
  env.GIT_CONFIG_COUNT = '0';
  env.GIT_ATTR_NOSYSTEM = '1';
  return env;
}

function transitionDiffChild(cwd, args, env, expectedStatus, label) {
  const result = spawnSync('git', args, { cwd, encoding: 'buffer', env, shell: false, stdio: ['ignore', 'pipe', 'pipe'], timeout: 30000, killSignal: 'SIGTERM', maxBuffer: 1048576, windowsHide: true });
  if (result.error || result.signal !== null || result.status !== expectedStatus || Buffer.from(result.stderr ?? '').length !== 0) {
    const stderr = Buffer.from(result.stderr ?? '').toString().trim();
    throw new Error(`${label} failed: ${stderr}`);
  }
  return Buffer.from(result.stdout ?? '');
}

function transitionDiff(context) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'docks-transition-diff-'));
  try {
    const env = canonicalTransitionDiffEnv(process.env);
    const initOutput = transitionDiffChild(root, ['init', '-q', '--template='], env, 0, 'execution compatibility diff repository init');
    if (initOutput.length !== 0) throw new Error('execution compatibility diff repository init produced stdout');
    for (const [side, bytes] of [['a', context.parentBytes], ['b', context.baseBytes]]) {
      const target = path.join(root, side, context.plan_path); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, bytes, { mode: 0o600, flag: 'wx' });
    }
    const attributes = `a/${context.plan_path} !diff\nb/${context.plan_path} !diff\n`;
    fs.mkdirSync(path.join(root, '.git/info'), { recursive: true });
    fs.writeFileSync(path.join(root, '.git/info/attributes'), attributes, { mode: 0o600, flag: 'wx' });
    return transitionDiffText(transitionDiffChild(root, transitionDiffArgs(context), env, 1, 'execution compatibility transition diff'));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function compatibilityFence(diff) {
  let longest = 0;
  for (const match of diff.matchAll(/`+/g)) longest = Math.max(longest, match[0].length);
  return '`'.repeat(Math.max(3, longest + 1));
}

function compatibilityMaterial(context, diff) {
  const material = {
    schema: 1,
    plan_path: context.plan_path,
    planned_at_commit: context.planned_at_commit,
    plan_creation_commit: context.plan_creation_commit,
    execution_parent: context.execution_parent,
    execution_base_commit: context.execution_base_commit,
    parent_plan_blob: context.parent_plan_blob,
    base_plan_blob: context.base_plan_blob,
    policy_sha256: LEGACY_START_TRANSITION_COMPATIBILITY_POLICY_SHA256,
    partition_manifest_sha256: context.partition_manifest_sha256,
    transition_diff_sha256: sha256(diff),
  };
  material.review_material_sha256 = sha256(jcs({ schema: 1, material, transition_diff: diff }));
  return material;
}

export function buildExecutionBaseCompatibilityApplication({ repo, reviewedHead, planPath, plannedAtCommit, executionBaseCommit, authorizationId, ownerMessageSha256 }) {
  compatibilityOwnerConfirmation({ planPath, plannedAtCommit, executionBaseCommit, authorizationId, ownerMessageSha256 });
  const context = legacyHistoricalContext({ repo: path.resolve(repo), planPath, plannedAtCommit, executionBaseCommit, reviewedHead });
  return compatibilityApplication(context, transitionDiff(context), authorizationId, ownerMessageSha256).application;
}

function compatibilityOwnerConfirmation({ planPath, plannedAtCommit, executionBaseCommit, authorizationId, ownerMessageSha256 }) {
  const plan_path = safeLogical(planPath);
  if (authorizationId !== COMPATIBILITY_AUTHORIZATION_SCOPE.authorization_id || ownerMessageSha256 !== COMPATIBILITY_AUTHORIZATION_SCOPE.source_text_sha256) throw new Error('execution compatibility owner confirmation source mismatch');
  if (plan_path !== COMPATIBILITY_AUTHORIZATION_SCOPE.target.plan_path) throw new Error('execution compatibility owner confirmation plan target mismatch');
  if (plannedAtCommit !== COMPATIBILITY_AUTHORIZATION_SCOPE.target.planned_at_commit) throw new Error('execution compatibility owner confirmation planned target mismatch');
  if (executionBaseCommit !== COMPATIBILITY_AUTHORIZATION_SCOPE.target.execution_base_commit) throw new Error('execution compatibility owner confirmation execution target mismatch');
  const scope = {
    schema: 1,
    kind: 'legacy_start_transition_authorization',
    authorization_id: authorizationId,
    decision: 'allow',
    source: 'current_user',
    source_text_sha256: ownerMessageSha256,
    target: { schema: 1, plan_path, planned_at_commit: plannedAtCommit, execution_base_commit: executionBaseCommit },
  };
  return { ...scope, authorization_scope_sha256: COMPATIBILITY_AUTHORIZATION_SCOPE_SHA256 };
}

function validateCompatibilityOwnerConfirmation(ownerConfirmation, identity) {
  assertClosed(ownerConfirmation, ['schema', 'kind', 'authorization_id', 'authorization_scope_sha256', 'decision', 'source', 'source_text_sha256', 'target'], 'execution compatibility owner confirmation');
  assertClosed(ownerConfirmation?.target, ['schema', 'plan_path', 'planned_at_commit', 'execution_base_commit'], 'execution compatibility owner confirmation target');
  const expected = compatibilityOwnerConfirmation({
    planPath: identity.plan_path,
    plannedAtCommit: identity.planned_at_commit,
    executionBaseCommit: identity.execution_base_commit,
    authorizationId: ownerConfirmation.authorization_id,
    ownerMessageSha256: ownerConfirmation.source_text_sha256,
  });
  if (ownerConfirmation.authorization_scope_sha256 !== COMPATIBILITY_AUTHORIZATION_SCOPE_SHA256) throw new Error('execution compatibility owner confirmation stored authorization scope digest mismatch');
  const { authorization_scope_sha256: actualDigest, ...actualScope } = ownerConfirmation;
  const { authorization_scope_sha256: expectedDigest, ...expectedScope } = expected;
  void actualDigest; void expectedDigest;
  if (jcs(actualScope) !== jcs(expectedScope)) throw new Error('execution compatibility owner confirmation mismatch');
  return expected;
}

function compatibilityApplication(context, diff, authorizationId, ownerMessageSha256) {
  const ownerConfirmation = compatibilityOwnerConfirmation({ planPath: context.plan_path, plannedAtCommit: context.planned_at_commit, executionBaseCommit: context.execution_base_commit, authorizationId, ownerMessageSha256 });
  const material = compatibilityMaterial(context, diff);
  const receipt = {
    schema: 1,
    kind: 'legacy_start_transition',
    policy_sha256: LEGACY_START_TRANSITION_COMPATIBILITY_POLICY_SHA256,
    plan_path: context.plan_path,
    planned_at_commit: context.planned_at_commit,
    plan_creation_commit: context.plan_creation_commit,
    plan_creation_parent: context.plan_creation_parent,
    execution_parent: context.execution_parent,
    execution_base_commit: context.execution_base_commit,
    legacy_planned_at_value: context.legacy_planned_at_value,
    evidence_input_commit: context.evidence_input_commit,
    evidence_input_plan_blob: context.evidence_input_plan_blob,
    parent_plan_blob: context.parent_plan_blob,
    base_plan_blob: context.base_plan_blob,
    transition_diff_sha256: material.transition_diff_sha256,
    partition_manifest_sha256: context.partition_manifest_sha256,
    changed_sections: context.changed_sections,
    protected_sections_sha256: context.protected_sections_sha256,
    review_material_sha256: material.review_material_sha256,
    owner_confirmation: ownerConfirmation,
  };
  receipt.receipt_sha256 = sha256(jcs(receipt));
  const fence = compatibilityFence(diff);
  const markdown = `Compatibility-review-material: ${jcs(material)}\n${fence}diff\n${diff}${fence}\nExecution-base-compatibility-receipt: ${jcs(receipt)}\n`;
  const application = { schema: 1, markdown, receipt_sha256: receipt.receipt_sha256, review_material_sha256: material.review_material_sha256 };
  application.application_sha256 = sha256(jcs(application));
  return { application, receipt };
}

function extractCompatibilityApplication(bytes, { required = true } = {}) {
  const { body } = splitPlanText(bytes); const rows = bodyRows(body); const scanned = scanBody(body);
  const materialRows = scanned.unfenced.filter((row) => row.line.startsWith('Compatibility-review-material: '));
  if (materialRows.length === 0 && !required) return null;
  if (materialRows.length !== 1) throw new Error('execution compatibility material record count');
  const materialIndex = rows.findIndex((row) => row.start === materialRows[0].start); const materialPayload = rows[materialIndex].line.slice('Compatibility-review-material: '.length);
  let material; try { material = JSON.parse(materialPayload); } catch { throw new Error('execution compatibility material must be JSON'); }
  if (jcs(material) !== materialPayload) throw new Error('execution compatibility material must be compact JCS');
  const opening = /^(`{3,})diff$/.exec(rows[materialIndex + 1]?.line ?? '');
  if (!opening) throw new Error('execution compatibility diff fence opening');
  let close = materialIndex + 2;
  while (close < rows.length && rows[close].line !== opening[1]) close += 1;
  if (close >= rows.length) throw new Error('execution compatibility diff fence closing');
  const diff = body.slice(rows[materialIndex + 1].end, rows[close].start);
  if (compatibilityFence(diff) !== opening[1]) throw new Error('execution compatibility diff fence is not minimal');
  const receiptRow = rows[close + 1];
  if (!receiptRow?.line.startsWith('Execution-base-compatibility-receipt: ')) throw new Error('execution compatibility receipt placement');
  const receiptPayload = receiptRow.line.slice('Execution-base-compatibility-receipt: '.length); let receipt;
  try { receipt = JSON.parse(receiptPayload); } catch { throw new Error('execution compatibility receipt must be JSON'); }
  if (jcs(receipt) !== receiptPayload) throw new Error('execution compatibility receipt must be compact JCS');
  const markdown = body.slice(rows[materialIndex].start, receiptRow.end);
  return { material, receipt, diff, markdown, start: rows[materialIndex].start, end: receiptRow.end };
}

function validateCompatibilityApplication(application, expected = {}) {
  const receipt = application.receipt;
  assertClosed(receipt, ['schema', 'kind', 'policy_sha256', 'plan_path', 'planned_at_commit', 'plan_creation_commit', 'plan_creation_parent', 'execution_parent', 'execution_base_commit', 'legacy_planned_at_value', 'evidence_input_commit', 'evidence_input_plan_blob', 'parent_plan_blob', 'base_plan_blob', 'transition_diff_sha256', 'partition_manifest_sha256', 'changed_sections', 'protected_sections_sha256', 'review_material_sha256', 'owner_confirmation', 'receipt_sha256'], 'execution compatibility receipt');
  if (receipt.schema !== 1 || receipt.kind !== 'legacy_start_transition' || receipt.policy_sha256 !== LEGACY_START_TRANSITION_COMPATIBILITY_POLICY_SHA256) throw new Error('execution compatibility receipt identity');
  validateCompatibilityOwnerConfirmation(receipt.owner_confirmation, receipt);
  const expectedApplication = buildExecutionBaseCompatibilityApplication({ repo: expected.repo, reviewedHead: receipt.evidence_input_commit, planPath: receipt.plan_path, plannedAtCommit: receipt.planned_at_commit, executionBaseCommit: receipt.execution_base_commit, authorizationId: receipt.owner_confirmation?.authorization_id, ownerMessageSha256: receipt.owner_confirmation?.source_text_sha256 });
  if (application.markdown !== expectedApplication.markdown || receipt.receipt_sha256 !== expectedApplication.receipt_sha256) throw new Error('execution compatibility application mismatch');
  if (expected.planPath !== undefined && receipt.plan_path !== safeLogical(expected.planPath)) throw new Error('execution compatibility plan mismatch');
  if (expected.plannedAtCommit !== undefined && receipt.planned_at_commit !== expected.plannedAtCommit) throw new Error('execution compatibility planned identity mismatch');
  if (expected.executionBaseCommit !== undefined && receipt.execution_base_commit !== expected.executionBaseCommit) throw new Error('execution compatibility base identity mismatch');
  return { ...application, receipt, application: expectedApplication };
}

function extractMachineRecord(bytes, kind, { required = true } = {}) {
  const { body } = splitPlanText(bytes); const prefix = `${kind}: `;
  const rows = scanBody(body).unfenced.filter((row) => row.line.startsWith(prefix));
  if (rows.length === 0 && !required) return null;
  if (rows.length !== 1) throw new Error(`${kind} record count`);
  const payload = rows[0].line.slice(prefix.length); let value;
  try { value = JSON.parse(payload); } catch { throw new Error(`${kind} must be one-line JSON`); }
  if (jcs(value) !== payload) throw new Error(`${kind} must be compact JCS`);
  return { value, payload, line: rows[0].line, start: rows[0].start, end: rows[0].end };
}

function reviewLegIdentity(receipt, leg) {
  const raw = receipt[leg].raw; const attempt = raw.attempts.at(-1);
  return {
    company: companyForLeg(receipt.author.company, leg),
    model: raw.selected?.model ?? attempt?.model ?? 'none',
    effort: raw.selected?.effort ?? attempt?.effort ?? 'none',
    result: raw.result,
  };
}

function requireIdentityToken(value, label) {
  if (typeof value !== 'string' || !IDENTITY_TOKEN.test(value)) throw new Error(`${label} is not an identity token`);
  return value;
}

function validateFindingsFreeCompatibilityReceipt(receipt, expectedInput, reviewedCommit) {
  validateDraftReceipt(receipt, expectedInput, { waivers: [] });
  if (receipt.reviewed_commit !== reviewedCommit || receipt.request.lifecycle_intent !== 'none') throw new Error('execution compatibility review identity mismatch');
  if (!['dual', 'single'].includes(receipt.outcome) || receipt.pre_execution_eligible !== true) throw new Error('execution compatibility review outcome is ineligible');
  if (receipt.reproduced.length !== 0 || receipt.decision_evidence !== null) throw new Error('execution compatibility review carries reconciliation evidence');
  const passed = [receipt.X.raw, receipt.S.raw].filter((raw) => raw.result === 'passed');
  if (passed.length < 1 || passed.some((raw) => raw.reviewer_output?.verdict !== 'ready' || raw.findings.length !== 0)) throw new Error('execution compatibility review must be findings-free ready');
  for (const leg of [receipt.X, receipt.S]) {
    if (leg.raw.result === 'waived' || leg.raw.waiver !== null || leg.raw.findings.length !== 0 || leg.reconciliation.accepted.length !== 0 || leg.reconciliation.rejected.length !== 0) throw new Error('execution compatibility review waiver/finding is forbidden');
  }
  return receipt;
}

export function renderCompatibilityReviewAttribution(receipt) {
  validateFindingsFreeCompatibilityReceipt(receipt, receipt.input_sha256, receipt.reviewed_commit);
  const date = receipt.reviewed_at.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('execution compatibility review date');
  const X = reviewLegIdentity(receipt, 'X'); const S = reviewLegIdentity(receipt, 'S');
  for (const [label, value] of Object.entries({
    'X company': X.company, 'X model': X.model, 'X effort': X.effort, 'X result': X.result,
    'S company': S.company, 'S model': S.model, 'S effort': S.effort, 'S result': S.result,
    'author company': receipt.author.company, 'author tool': receipt.author.tool, 'author model': receipt.author.model, 'author effort': receipt.author.effort,
  })) requireIdentityToken(value, label);
  return `Cross-check (${date}): [X: ${X.company} ${X.model} ${X.effort}; result=${X.result}] 0 findings — accepted none / rejected none (none); [S: ${S.company} ${S.model} ${S.effort}; result=${S.result}] 0 findings — accepted none / rejected none (none); [orchestrator: ${receipt.author.company} ${receipt.author.tool} ${receipt.author.model} ${receipt.author.effort}] independently verified none against source before accepting.\n`;
}

function appendSelfReviewAttribution(bytes, attribution) {
  const plan = splitPlanText(bytes); const section = uniquePartition(plan.body, 'Self-review');
  if (!section.bytes.endsWith('\n\n')) throw new Error('Self-review partition must end in two LF bytes');
  const replacement = `${section.bytes.slice(0, -1)}${attribution}\n`;
  return replacePlanBody(bytes, `${plan.body.slice(0, section.start)}${replacement}${plan.body.slice(section.end)}`);
}

function insertDraftReceipt(bytes, receipt) {
  if (extractMachineRecord(bytes, 'Review-receipt', { required: false }) !== null) throw new Error('Review-receipt already exists');
  const plan = splitPlanText(bytes); const section = uniquePartition(plan.body, 'Self-review');
  const line = `Review-receipt: ${jcs(receipt)}\n`;
  return replacePlanBody(bytes, `${plan.body.slice(0, section.line_end)}${line}${plan.body.slice(section.line_end)}`);
}

function replaceDraftReceipt(bytes, receipt) {
  const plan = splitPlanText(bytes); const record = extractMachineRecord(bytes, 'Review-receipt');
  const line = `Review-receipt: ${jcs(receipt)}\n`;
  return replacePlanBody(bytes, `${plan.body.slice(0, record.start)}${line}${plan.body.slice(record.end)}`);
}

function validateEvidenceAndReview({ repo, planPath, evidenceCommit, reviewCommit, reviewedHead = reviewCommit }) {
  const logical = safeLogical(planPath); exactCommit(repo, evidenceCommit, 'compatibility evidence commit'); exactCommit(repo, reviewCommit, 'compatibility review commit'); exactCommit(repo, reviewedHead, 'reviewed head');
  if (!ancestor(repo, reviewCommit, reviewedHead)) throw new Error('compatibility review is not an ancestor of head');
  const evidenceBytes = planBlob(repo, evidenceCommit, logical); const application = extractCompatibilityApplication(evidenceBytes);
  const validatedApplication = validateCompatibilityApplication(application, { repo, planPath: logical });
  const evidenceParent = validatedApplication.receipt.evidence_input_commit;
  requirePlanOnlyChild(repo, evidenceCommit, evidenceParent, logical, 'compatibility evidence commit');
  const parentBytes = planBlob(repo, evidenceParent, logical);
  if (extractCompatibilityApplication(parentBytes, { required: false }) !== null || extractMachineRecord(parentBytes, 'Execution-base-compatibility-binding', { required: false }) !== null) throw new Error('compatibility evidence already existed at E0');
  const expectedEvidence = insertBeforeReview(parentBytes, validatedApplication.application.markdown);
  requirePlanDelta(parentBytes, evidenceBytes, expectedEvidence, 'compatibility evidence');
  requirePlanOnlyChild(repo, reviewCommit, evidenceCommit, logical, 'compatibility review commit');
  const reviewBytes = planBlob(repo, reviewCommit, logical); const record = extractMachineRecord(reviewBytes, 'Review-receipt');
  const reviewReceipt = validateFindingsFreeCompatibilityReceipt(record.value, sha256(canonicalPlanView(evidenceBytes)), evidenceCommit);
  const attribution = renderCompatibilityReviewAttribution(reviewReceipt);
  let expectedReview = insertDraftReceipt(evidenceBytes, reviewReceipt);
  expectedReview = appendSelfReviewAttribution(expectedReview, attribution);
  requirePlanDelta(evidenceBytes, reviewBytes, expectedReview, 'compatibility review');
  return {
    application: validatedApplication.application,
    receipt: validatedApplication.receipt,
    evidenceCommit,
    evidenceBytes,
    reviewCommit,
    reviewBytes,
    reviewReceipt,
    review_receipt_sha256: sha256(record.payload),
    attribution,
    review_attribution_sha256: sha256(attribution),
  };
}

export function buildExecutionBaseCompatibilityBindingApplication({ repo, planPath, evidenceCommit, reviewCommit }) {
  const root = path.resolve(repo); const chain = validateEvidenceAndReview({ repo: root, planPath, evidenceCommit, reviewCommit });
  const binding = {
    schema: 1,
    compatibility_receipt_sha256: chain.receipt.receipt_sha256,
    compatibility_evidence_commit: evidenceCommit,
    reviewed_commit: evidenceCommit,
    review_commit: reviewCommit,
    review_receipt_sha256: chain.review_receipt_sha256,
    review_attribution_sha256: chain.review_attribution_sha256,
    binding_parent: reviewCommit,
  };
  binding.binding_sha256 = sha256(jcs(binding));
  const markdown = `Execution-base-compatibility-binding: ${jcs(binding)}\n`;
  const application = { schema: 1, markdown, binding_sha256: binding.binding_sha256 };
  application.application_sha256 = sha256(jcs(application));
  return application;
}

function extractCompatibilityBinding(bytes, { required = true } = {}) {
  const record = extractMachineRecord(bytes, 'Execution-base-compatibility-binding', { required });
  return record === null ? null : { binding: record.value, markdown: `${record.line}\n`, start: record.start, end: record.end };
}

function validateBindingCommit({ repo, planPath, evidenceCommit, reviewCommit, bindingCommit, reviewedHead = bindingCommit }) {
  const logical = safeLogical(planPath); const expected = buildExecutionBaseCompatibilityBindingApplication({ repo, planPath: logical, evidenceCommit, reviewCommit });
  requirePlanOnlyChild(repo, bindingCommit, reviewCommit, logical, 'compatibility binding commit');
  if (!ancestor(repo, bindingCommit, reviewedHead)) throw new Error('compatibility binding is not an ancestor of head');
  const reviewBytes = planBlob(repo, reviewCommit, logical); const bindingBytes = planBlob(repo, bindingCommit, logical);
  const extracted = extractCompatibilityBinding(bindingBytes);
  if (extracted.markdown !== expected.markdown) throw new Error('execution compatibility binding mismatch');
  const binding = extracted.binding;
  assertClosed(binding, ['schema', 'compatibility_receipt_sha256', 'compatibility_evidence_commit', 'reviewed_commit', 'review_commit', 'review_receipt_sha256', 'review_attribution_sha256', 'binding_parent', 'binding_sha256'], 'execution compatibility binding');
  const preimage = { ...binding }; delete preimage.binding_sha256;
  if (binding.schema !== 1 || binding.binding_sha256 !== sha256(jcs(preimage)) || binding.binding_sha256 !== expected.binding_sha256) throw new Error('execution compatibility binding hash mismatch');
  const expectedBytes = insertBeforeReview(reviewBytes, expected.markdown);
  requirePlanDelta(reviewBytes, bindingBytes, expectedBytes, 'compatibility binding');
  return { binding, bindingBytes, application: expected };
}

function reviewQuote(value) {
  assertUnicodeScalarString(value, 'CompletionReviewBlock string');
  let rendered = '"';
  for (let index = 0; index < value.length; index += 1) {
    const first = value.charCodeAt(index);
    if ((first >= 0x30 && first <= 0x39) || (first >= 0x41 && first <= 0x5a) || (first >= 0x61 && first <= 0x7a) || first === 0x20) rendered += value[index];
    else if (first >= 0xd800 && first <= 0xdbff) {
      const second = value.charCodeAt(index + 1); rendered += `\\u${first.toString(16).padStart(4, '0')}\\u${second.toString(16).padStart(4, '0')}`; index += 1;
    } else rendered += `\\u${first.toString(16).padStart(4, '0')}`;
  }
  return `${rendered}"`;
}

function reviewQuoteArray(values) {
  return `[${values.map(reviewQuote).join(',')}]`;
}

function completionReviewLeg(receipt, leg) {
  const raw = receipt[leg].raw; const identity = reviewLegIdentity(receipt, leg);
  return {
    company: identity.company,
    model: identity.model,
    effort: identity.effort,
    result: raw.result,
    finding_count: raw.findings.length,
    accepted: receipt[leg].reconciliation.accepted.slice().sort(compareUtf16),
    rejected: receipt[leg].reconciliation.rejected.map(({ id, reason }) => ({ id, reason })).sort((a, b) => compareUtf16(a.id, b.id)),
  };
}

export function completionReviewBlockV1(receipt, { waivers = [] } = {}) {
  validateCompletionReceipt(receipt, {}, { waivers });
  const cross_check = receipt.X.raw.result === 'passed' ? {
    date: receipt.reviewed_at.slice(0, 10),
    X: completionReviewLeg(receipt, 'X'),
    S: completionReviewLeg(receipt, 'S'),
    reproduced_ids: receipt.reproduced.filter((row) => row.source === 'X' || row.source === 'S').map((row) => row.id).sort(compareUtf16),
    orchestrator: receipt.author,
  } : null;
  return {
    schema: 1,
    goal_met: receipt.primary.goal_met,
    regressions: receipt.primary.regressions,
    ci: receipt.primary.ci,
    followups: receipt.primary.followups,
    filed_by: { role: 'plan-manager', receipt_author: receipt.author, reviewed_at: receipt.reviewed_at },
    cross_check,
  };
}

export function completionReviewBlockV5(receipt, { waivers = [] } = {}) {
  validateCurrentReviewReceipt(receipt, null, { waivers });
  const raw = receipt.reviewer.raw;
  return {
    schema: 5,
    goal_met: receipt.primary.goal_met,
    regressions: receipt.primary.regressions,
    ci: receipt.primary.ci,
    followups: receipt.primary.followups,
    filed_by: { role: 'plan-manager', receipt_author: receipt.request.author, reviewed_at: receipt.reviewed_at },
    primary_review: {
      date: receipt.reviewed_at.slice(0, 10),
      selected: raw.selected,
      result: raw.result,
      verdict: raw.reviewer_output?.verdict ?? null,
      finding_count: raw.reviewer_output?.findings.length ?? 0,
      accepted: receipt.reviewer.accepted_finding_ids.slice().sort(compareUtf16),
      rejected: receipt.reviewer.rejected.map(({ id, reason }) => ({ id, reason })).sort((a, b) => compareUtf16(a.id, b.id)),
      reproduced_ids: receipt.reproduced.map((row) => row.id).sort(compareUtf16),
      orchestrator: receipt.request.author,
    },
  };
}

function reviewIds(ids) { return ids.length === 0 ? 'none' : ids.join(','); }
function reviewRejections(rows) { return rows.length === 0 ? 'none' : rows.map((row) => `${row.id}=${reviewQuote(row.reason)}`).join(','); }

export function renderCompletionReviewBlock(receipt, { waivers = [] } = {}) {
  const block = receipt.schema === 5 ? completionReviewBlockV5(receipt, { waivers }) : completionReviewBlockV1(receipt, { waivers }); const author = block.filed_by.receipt_author;
  const lines = [
    '## Review',
    '',
    `- **Goal met:** ${block.goal_met}`,
    `- **Regressions:** ${reviewQuoteArray(block.regressions)}`,
    `- **CI:** {"command":${reviewQuote(block.ci.command)},"exit_code":${String(block.ci.exit_code)},"first_failure":${block.ci.first_failure === null ? 'null' : reviewQuote(block.ci.first_failure)},"output_sha256":"${block.ci.output_sha256}"}`,
    `- **Follow-ups:** ${reviewQuoteArray(block.followups)}`,
    `- **Filed by:** {"role":"plan-manager","receipt_author":{"company":"${author.company}","tool":${reviewQuote(author.tool)},"model":${reviewQuote(author.model)},"effort":${reviewQuote(author.effort)}},"reviewed_at":${reviewQuote(block.filed_by.reviewed_at)}}`,
  ];
  if (block.cross_check !== undefined && block.cross_check !== null) {
    const { X, S, orchestrator } = block.cross_check;
    lines.push(`- **Cross-check:** (${block.cross_check.date}) [X: ${X.company} ${reviewQuote(X.model)} ${reviewQuote(X.effort)}; result=${X.result}] ${X.finding_count} findings — accepted ${reviewIds(X.accepted)} / rejected ${reviewRejections(X.rejected)}; [S: ${S.company} ${reviewQuote(S.model)} ${reviewQuote(S.effort)}; result=${S.result}] ${S.finding_count} findings — accepted ${reviewIds(S.accepted)} / rejected ${reviewRejections(S.rejected)}; [orchestrator: ${orchestrator.company} ${reviewQuote(orchestrator.tool)} ${reviewQuote(orchestrator.model)} ${reviewQuote(orchestrator.effort)}] independently verified ${reviewIds(block.cross_check.reproduced_ids)} against source before accepting.`);
  }
  if (block.primary_review !== undefined) {
    lines.push(`- **Primary review:** ${jcs(block.primary_review)}`);
  }
  lines.push('', `Completion-review-receipt: ${jcs(receipt)}`);
  return `${lines.join('\n')}\n`;
}

export function applyCompletionReviewBlock(bytes, receipt, { waivers = [] } = {}) {
  const plan = splitPlanText(bytes); const review = uniquePartition(plan.body, 'Review'); const core = renderCompletionReviewBlock(receipt, { waivers });
  const replacement = review.end < plan.body.length ? `${core}\n` : core;
  return replacePlanBody(bytes, `${plan.body.slice(0, review.start)}${replacement}${plan.body.slice(review.end)}`);
}

export function completionStablePlanViewV1(bytes) {
  const plan = splitPlanText(bytes); const review = uniquePartition(plan.body, 'Review');
  const withoutReview = replacePlanBody(bytes, `${plan.body.slice(0, review.start)}${plan.body.slice(review.end)}`);
  return canonicalPlanView(withoutReview);
}

export function validateCompletionReviewReuse({ repo, planPath, reviewedHead, completionCommit, receipt, expectedPolicy, waivers = [] }) {
  const logical = safeLogical(planPath); exactCommit(repo, reviewedHead, 'completion reviewed head'); exactCommit(repo, completionCommit, 'completion receipt commit');
  validatePolicy(expectedPolicy);
  requirePlanOnlyChild(repo, completionCommit, reviewedHead, logical, 'completion receipt commit');
  const beforeBytes = planBlob(repo, reviewedHead, logical); const afterBytes = planBlob(repo, completionCommit, logical);
  const afterPlan = parsePlan(afterBytes);
  validateCompletionReceipt(receipt, { reviewed_head: reviewedHead, plan_input_sha256: sha256(canonicalPlanView(beforeBytes)), review_status: afterPlan.frontmatter.review_status }, { expectedPolicy, waivers });
  const record = extractMachineRecord(afterBytes, 'Completion-review-receipt');
  if (record.payload !== jcs(receipt)) throw new Error('completion Review receipt payload mismatch');
  if (completionStablePlanViewV1(beforeBytes) !== completionStablePlanViewV1(afterBytes)) throw new Error('completion stable plan view mismatch');
  const expected = applyCompletionReviewBlock(beforeBytes, receipt, { waivers });
  requirePlanDelta(beforeBytes, afterBytes, expected, 'completion Review apply', ['updated', 'review_status']);
  const beforeApplication = extractCompatibilityApplication(beforeBytes, { required: false }); const afterApplication = extractCompatibilityApplication(afterBytes, { required: false });
  if ((beforeApplication === null) !== (afterApplication === null) || (beforeApplication && beforeApplication.markdown !== afterApplication.markdown)) throw new Error('completion compatibility application changed');
  const beforeBinding = extractCompatibilityBinding(beforeBytes, { required: false }); const afterBinding = extractCompatibilityBinding(afterBytes, { required: false });
  if ((beforeBinding === null) !== (afterBinding === null) || (beforeBinding && beforeBinding.markdown !== afterBinding.markdown)) throw new Error('completion compatibility binding changed');
  return { schema: 1, reviewed_head: reviewedHead, completion_commit: completionCommit, completion_receipt_sha256: sha256(jcs(receipt)) };
}

function validatePrerequisiteInput(input) {
  assertClosed(input, ['repo', 'planPath', 'finishedPlanPath', 'finishedPlanCommit', 'releaseVersion', 'evidenceCommit', 'compatibilityReviewCommit', 'bindingCommit', 'authorizationId', 'authorizationSha256'], 'Docks compatibility prerequisite input');
  string(input.repo, 'prerequisite repo'); const normalized = { ...input, planPath: safeLogical(input.planPath), finishedPlanPath: safeLogical(input.finishedPlanPath) };
  if (!FINISHED_COMPATIBILITY_PATH.test(normalized.finishedPlanPath)) throw new Error('finished compatibility plan path');
  for (const key of ['finishedPlanCommit', 'evidenceCommit', 'compatibilityReviewCommit', 'bindingCommit']) if (!HEX40.test(input[key])) throw new Error(`prerequisite ${key} must be a full commit`);
  if (!CORE_SEMVER.test(input.releaseVersion)) throw new Error('prerequisite releaseVersion must be core semver');
  string(input.authorizationId, 'prerequisite authorization id'); digest(input.authorizationSha256, 'prerequisite authorization');
  if (input.authorizationId !== RELEASE_AUTHORIZATION.authorization_id || input.authorizationSha256 !== RELEASE_AUTHORIZATION_SHA256 || sha256(jcs(RELEASE_AUTHORIZATION)) !== input.authorizationSha256) throw new Error('Docks release authorization mismatch');
  return normalized;
}

function canonicalRemoteTagArgv(releaseTag) {
  const ref = `refs/tags/${releaseTag}`;
  return ['git', 'ls-remote', '--exit-code', '--tags', CANONICAL_REPOSITORY_URL, ref, `${ref}^{}`];
}

function isCanonicalRemoteGitChild(argv) {
  if (jcs(argv) === jcs(CANONICAL_REMOTE_MAIN_ARGV)) return true;
  if (argv.length !== 7 || argv[0] !== 'git' || argv[1] !== 'ls-remote' || argv[2] !== '--exit-code' || argv[3] !== '--tags' || argv[4] !== CANONICAL_REPOSITORY_URL) return false;
  const match = /^refs\/tags\/(docks--v[0-9]+\.[0-9]+\.[0-9]+)$/.exec(argv[5]);
  return match !== null && argv[6] === `${argv[5]}^{}`;
}

function canonicalRemoteGitEnv(source) {
  const env = { ...source };
  for (const key of Object.keys(env)) {
    if (['GIT_CONFIG', 'GIT_CONFIG_PARAMETERS', 'GIT_COMMON_DIR', 'GIT_WORK_TREE'].includes(key) || /^GIT_CONFIG_(KEY|VALUE)_[0-9]+$/.test(key)) delete env[key];
  }
  env.GIT_DIR = os.devNull;
  env.GIT_CONFIG_GLOBAL = os.devNull;
  env.GIT_CONFIG_SYSTEM = os.devNull;
  env.GIT_CONFIG_NOSYSTEM = '1';
  env.GIT_CONFIG_COUNT = '0';
  return env;
}

const PRODUCTION_PREREQUISITE_DEPENDENCIES = Object.freeze({
  runChild(argv, options) {
    const spawnOptions = {
      cwd: options.cwd,
      encoding: 'buffer',
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 30000,
      killSignal: 'SIGTERM',
      maxBuffer: 1048576,
      windowsHide: true,
    };
    if (isCanonicalRemoteGitChild(argv)) spawnOptions.env = canonicalRemoteGitEnv(process.env);
    const result = spawnSync(argv[0], argv.slice(1), spawnOptions);
    return {
      status: result.status,
      signal: result.signal,
      error: result.error ? { code: result.error.code === undefined ? null : String(result.error.code), message: String(result.error.message) } : null,
      stdout: Buffer.isBuffer(result.stdout) ? result.stdout : Buffer.from(result.stdout ?? ''),
      stderr: Buffer.isBuffer(result.stderr) ? result.stderr : Buffer.from(result.stderr ?? ''),
    };
  },
  now: () => new Date().toISOString(),
  homedir: () => os.homedir(),
  lstat(absolutePath) {
    const stat = fs.lstatSync(absolutePath);
    return { kind: stat.isFile() ? 'file' : stat.isDirectory() ? 'directory' : 'other', symbolicLink: stat.isSymbolicLink() };
  },
  realpath: (absolutePath) => fs.realpathSync(absolutePath),
  readFile: (absolutePath) => fs.readFileSync(absolutePath),
});

function validatePrerequisiteDependencies(dependencies) {
  assertClosed(dependencies, ['runChild', 'now', 'homedir', 'lstat', 'realpath', 'readFile'], 'Docks compatibility prerequisite dependencies');
  for (const key of ['runChild', 'now', 'homedir', 'lstat', 'realpath', 'readFile']) if (typeof dependencies[key] !== 'function') throw new Error(`prerequisite dependency ${key} must be a function`);
  return dependencies;
}

function prerequisiteChild(dependencies, repoRoot, argv, { recorded = false, label = argv.join(' ') } = {}) {
  if (!Array.isArray(argv) || argv.length === 0 || argv.some((value) => typeof value !== 'string')) throw new Error(`${label} argv`);
  const result = dependencies.runChild(argv.slice(), { cwd: repoRoot });
  assertClosed(result, ['status', 'signal', 'error', 'stdout', 'stderr'], `${label} child result`);
  if (result.error !== null) {
    assertClosed(result.error, ['code', 'message'], `${label} child error`);
    if (result.error.code !== null && typeof result.error.code !== 'string') throw new Error(`${label} child error code`);
    string(result.error.message, `${label} child error message`);
  }
  if (!Number.isInteger(result.status) && result.status !== null) throw new Error(`${label} child status`);
  if (typeof result.signal !== 'string' && result.signal !== null) throw new Error(`${label} child signal`);
  if (!Buffer.isBuffer(result.stdout) || !Buffer.isBuffer(result.stderr)) throw new Error(`${label} child output must be Buffer`);
  if (result.error !== null || result.signal !== null || result.status !== 0) throw new Error(`${label} child failed`);
  if (!recorded && result.stderr.length !== 0) throw new Error(`${label} child stderr must be empty`);
  return result;
}

function prerequisiteRepository(dependencies, repoRoot) {
  const run = (args, label) => prerequisiteChild(dependencies, repoRoot, ['git', ...args], { label });
  const text = (args, label) => exactUtf8(run(args, label).stdout, label);
  const exact = (commit, label) => {
    if (!HEX40.test(commit)) throw new Error(`${label} must be a full commit`);
    if (text(['rev-parse', '--verify', `${commit}^{commit}`], label).trim() !== commit) throw new Error(`${label} does not resolve exactly`);
    return commit;
  };
  const parent = (commit, label) => {
    exact(commit, label); const row = text(['rev-list', '--parents', '-n', '1', commit], `${label} parent`).trim().split(/\s+/);
    if (row.length !== 2 || row[0] !== commit || !HEX40.test(row[1])) throw new Error(`${label} must be single-parent`);
    return row[1];
  };
  const paths = (parentCommit, commit, label) => {
    const raw = run(['diff-tree', '--no-commit-id', '--name-only', '-r', '-z', '--no-renames', parentCommit, commit, '--'], label).stdout;
    const value = exactUtf8(raw, label); if (value !== '' && !value.endsWith('\0')) throw new Error(`${label} paths must be NUL terminated`);
    const rows = value === '' ? [] : value.slice(0, -1).split('\0').map(safeLogical);
    if (new Set(rows).size !== rows.length) throw new Error(`${label} paths contain duplicates`);
    return rows;
  };
  const blob = (commit, logical, label) => run(['show', `${commit}:${logical}`], label).stdout;
  const object = (spec, label) => {
    const oid = text(['rev-parse', '--verify', spec], label).trim(); if (!HEX40.test(oid)) throw new Error(`${label} object id`); return oid;
  };
  const isAncestor = (older, newer, label) => text(['merge-base', older, newer], label).trim() === older;
  const treeNames = (commit, logicals, label) => {
    const value = exactUtf8(run(['ls-tree', '-z', '--name-only', commit, '--', ...logicals], label).stdout, label);
    if (value !== '' && !value.endsWith('\0')) throw new Error(`${label} tree names must be NUL terminated`);
    return value === '' ? [] : value.slice(0, -1).split('\0').map(safeLogical);
  };
  return { run, text, exact, parent, paths, blob, object, isAncestor, treeNames };
}

function legacyHistoricalContextWithRepository({ repository, planPath, plannedAtCommit, executionBaseCommit, reviewedHead }) {
  assertCompatibilityConstants();
  const plan_path = safeLogical(planPath);
  repository.exact(plannedAtCommit, 'planned_at_commit'); repository.exact(executionBaseCommit, 'execution_base_commit'); repository.exact(reviewedHead, 'reviewed_head');
  if (!repository.isAncestor(plannedAtCommit, executionBaseCommit, 'planned-to-start ancestry') || !repository.isAncestor(executionBaseCommit, reviewedHead, 'start-to-evidence ancestry')) throw new Error('execution base ancestry mismatch');
  const execution_parent = repository.parent(executionBaseCommit, 'execution_base_commit');
  const startPaths = repository.paths(execution_parent, executionBaseCommit, 'legacy start paths');
  if (startPaths.length !== 1 || startPaths[0] !== plan_path) throw new Error('legacy start must change only the plan');
  const parentBytes = repository.blob(execution_parent, plan_path, 'legacy start parent plan');
  const baseBytes = repository.blob(executionBaseCommit, plan_path, 'legacy start base plan');
  const headBytes = repository.blob(reviewedHead, plan_path, 'compatibility evidence input plan');
  const parentPlan = parsePlan(parentBytes); const basePlan = parsePlan(baseBytes); const headPlan = parsePlan(headBytes);
  const legacy = parentPlan.frontmatter.planned_at_commit;
  if (!LEGACY_HEX.test(legacy) || basePlan.frontmatter.planned_at_commit !== legacy || repository.object(`${legacy}^{commit}`, 'legacy planned_at_commit') !== plannedAtCommit) throw new Error('legacy planned_at_commit identity mismatch');
  validateLegacyFrontmatter(parentPlan.frontmatter, basePlan.frontmatter);
  if (headPlan.frontmatter.planned_at_commit !== plannedAtCommit || headPlan.frontmatter.execution_base_commit !== executionBaseCommit) throw new Error('plan execution identity mismatch');
  const parentPartitions = partitionBody(parentPlan.body); const basePartitions = partitionBody(basePlan.body);
  if (jcs(parentPartitions.map((row) => row.name)) !== jcs(basePartitions.map((row) => row.name))) throw new Error('execution compatibility heading vector changed');
  const protectedNames = new Set(LEGACY_START_TRANSITION_COMPATIBILITY_POLICY.body.protected_sections);
  const partitions = parentPartitions.map((before, index) => {
    const after = basePartitions[index]; const before_sha256 = sha256(before.bytes); const after_sha256 = sha256(after.bytes);
    return { ordinal: before.ordinal, name: before.name, before_sha256, after_sha256, changed: before_sha256 !== after_sha256 };
  });
  if (partitions[0].changed) throw new Error('execution compatibility preamble changed');
  for (const row of partitions) if (row.changed && protectedNames.has(row.name)) throw new Error(`execution compatibility protected section changed: ${row.name}`);
  const changed = partitions.filter((row) => row.changed);
  if (changed.length === 0) throw new Error('execution compatibility changed sections missing');
  const protectedSections = partitions.filter((row) => protectedNames.has(row.name)).map((row) => ({ ordinal: row.ordinal, name: row.name, sha256: row.before_sha256 }));
  if (protectedSections.length !== protectedNames.size) throw new Error('execution compatibility protected section missing');
  if (repository.treeNames(plannedAtCommit, [plan_path], 'planned base plan path').length !== 0) throw new Error('plan path existed at planned_at_commit');
  const creationRows = repository.text(['rev-list', '--reverse', '--ancestry-path', `${plannedAtCommit}..${execution_parent}`, '--', plan_path], 'plan creation history').trim().split('\n').filter(Boolean);
  if (creationRows.length === 0) throw new Error('plan creation commit missing');
  const plan_creation_commit = creationRows[0];
  if (repository.parent(plan_creation_commit, 'plan creation commit') !== plannedAtCommit) throw new Error('plan creation parent mismatch');
  const creationPaths = repository.paths(plannedAtCommit, plan_creation_commit, 'plan creation paths');
  if (creationPaths.length !== 1 || creationPaths[0] !== plan_path) throw new Error('plan creation must be plan-only');
  const creationStatus = repository.text(['diff-tree', '--no-commit-id', '--name-status', '-r', '--no-renames', plannedAtCommit, plan_creation_commit, '--', plan_path], 'plan creation status').trim();
  if (creationStatus !== `A\t${plan_path}` || !repository.isAncestor(plan_creation_commit, execution_parent, 'plan creation ancestry')) throw new Error('plan creation add/ancestry mismatch');
  const partitionManifest = { schema: 1, partitions };
  const protectedPreimage = { schema: 1, sections: protectedSections };
  return {
    plan_path, planned_at_commit: plannedAtCommit, plan_creation_commit, plan_creation_parent: plannedAtCommit,
    execution_parent, execution_base_commit: executionBaseCommit, legacy_planned_at_value: legacy,
    evidence_input_commit: reviewedHead,
    evidence_input_plan_blob: repository.object(`${reviewedHead}:${plan_path}`, 'evidence input plan blob'),
    parent_plan_blob: repository.object(`${execution_parent}:${plan_path}`, 'parent plan blob'),
    base_plan_blob: repository.object(`${executionBaseCommit}:${plan_path}`, 'base plan blob'),
    parentBytes, baseBytes, headBytes, partitions,
    partition_manifest_sha256: sha256(jcs(partitionManifest)),
    protected_sections_sha256: sha256(jcs(protectedPreimage)),
    changed_sections: changed.map((row) => ({
      name: row.name,
      before_sha256: row.before_sha256,
      after_sha256: row.after_sha256,
      transition_sha256: sha256(jcs({ schema: 1, name: row.name, before_sha256: row.before_sha256, after_sha256: row.after_sha256 })),
    })).sort((a, b) => compareUtf16(a.name, b.name)),
  };
}

function requirePrerequisitePlanOnly(repository, commit, parent, planPath, label) {
  if (repository.parent(commit, label) !== parent) throw new Error(`${label} parent mismatch`);
  const paths = repository.paths(parent, commit, `${label} paths`);
  if (paths.length !== 1 || paths[0] !== planPath) throw new Error(`${label} must change only the plan`);
}

function storedCompatibilityPayload(application) {
  const { material, receipt, diff } = application;
  assertClosed(material, ['schema', 'plan_path', 'planned_at_commit', 'plan_creation_commit', 'execution_parent', 'execution_base_commit', 'parent_plan_blob', 'base_plan_blob', 'policy_sha256', 'partition_manifest_sha256', 'transition_diff_sha256', 'review_material_sha256'], 'stored compatibility material');
  assertClosed(receipt, ['schema', 'kind', 'policy_sha256', 'plan_path', 'planned_at_commit', 'plan_creation_commit', 'plan_creation_parent', 'execution_parent', 'execution_base_commit', 'legacy_planned_at_value', 'evidence_input_commit', 'evidence_input_plan_blob', 'parent_plan_blob', 'base_plan_blob', 'transition_diff_sha256', 'partition_manifest_sha256', 'changed_sections', 'protected_sections_sha256', 'review_material_sha256', 'owner_confirmation', 'receipt_sha256'], 'stored compatibility receipt');
  if (material.schema !== 1 || receipt.schema !== 1 || receipt.kind !== 'legacy_start_transition' || material.policy_sha256 !== LEGACY_START_TRANSITION_COMPATIBILITY_POLICY_SHA256 || receipt.policy_sha256 !== LEGACY_START_TRANSITION_COMPATIBILITY_POLICY_SHA256) throw new Error('stored compatibility policy mismatch');
  for (const key of ['plan_path', 'planned_at_commit', 'plan_creation_commit', 'execution_parent', 'execution_base_commit', 'parent_plan_blob', 'base_plan_blob', 'partition_manifest_sha256', 'transition_diff_sha256', 'review_material_sha256']) if (material[key] !== receipt[key]) throw new Error(`stored compatibility ${key} mismatch`);
  if (sha256(diff) !== material.transition_diff_sha256) throw new Error('stored compatibility diff hash mismatch');
  const withoutReviewHash = { ...material }; delete withoutReviewHash.review_material_sha256;
  if (material.review_material_sha256 !== sha256(jcs({ schema: 1, material: withoutReviewHash, transition_diff: diff }))) throw new Error('stored compatibility material hash mismatch');
  const receiptPreimage = { ...receipt }; delete receiptPreimage.receipt_sha256;
  if (receipt.receipt_sha256 !== sha256(jcs(receiptPreimage))) throw new Error('stored compatibility receipt hash mismatch');
  validateCompatibilityOwnerConfirmation(receipt.owner_confirmation, receipt);
  if (!Array.isArray(receipt.changed_sections) || receipt.changed_sections.length === 0) throw new Error('stored compatibility changed sections');
  let previous = null;
  for (const row of receipt.changed_sections) {
    assertClosed(row, ['name', 'before_sha256', 'after_sha256', 'transition_sha256'], 'stored changed section');
    string(row.name, 'stored changed section name'); digest(row.before_sha256, 'stored changed section before'); digest(row.after_sha256, 'stored changed section after'); digest(row.transition_sha256, 'stored changed section transition');
    if (previous !== null && compareUtf16(previous, row.name) >= 0) throw new Error('stored changed sections are not sorted');
    if (row.transition_sha256 !== sha256(jcs({ schema: 1, name: row.name, before_sha256: row.before_sha256, after_sha256: row.after_sha256 }))) throw new Error('stored changed section transition mismatch');
    previous = row.name;
  }
  return receipt;
}

function validateBindingWithRepository({ repository, planPath, evidenceCommit, reviewCommit, bindingCommit }) {
  const evidenceParent = repository.parent(evidenceCommit, 'compatibility evidence commit');
  requirePrerequisitePlanOnly(repository, evidenceCommit, evidenceParent, planPath, 'compatibility evidence commit');
  const evidenceBytes = repository.blob(evidenceCommit, planPath, 'compatibility evidence plan'); const application = extractCompatibilityApplication(evidenceBytes);
  if (application.receipt?.plan_path !== planPath) throw new Error('compatibility evidence plan path mismatch');
  if (application.receipt.evidence_input_commit !== evidenceParent) throw new Error('compatibility evidence parent mismatch');
  validateCompatibilityOwnerConfirmation(application.receipt.owner_confirmation, application.receipt);
  const context = legacyHistoricalContextWithRepository({
    repository,
    planPath,
    plannedAtCommit: application.receipt.planned_at_commit,
    executionBaseCommit: application.receipt.execution_base_commit,
    reviewedHead: evidenceParent,
  });
  const diff = transitionDiff(context);
  const reconstructed = compatibilityApplication(context, diff, application.receipt.owner_confirmation?.authorization_id, application.receipt.owner_confirmation?.source_text_sha256).application;
  if (application.markdown !== reconstructed.markdown) throw new Error('compatibility evidence historical application mismatch');
  const compatibilityReceipt = storedCompatibilityPayload(application);
  const evidenceParentBytes = repository.blob(compatibilityReceipt.evidence_input_commit, planPath, 'compatibility evidence parent plan');
  const expectedEvidence = insertBeforeReview(evidenceParentBytes, application.markdown); requirePlanDelta(evidenceParentBytes, evidenceBytes, expectedEvidence, 'compatibility evidence');
  requirePrerequisitePlanOnly(repository, reviewCommit, evidenceCommit, planPath, 'compatibility review commit');
  const reviewBytes = repository.blob(reviewCommit, planPath, 'compatibility review plan'); const reviewRecord = extractMachineRecord(reviewBytes, 'Review-receipt');
  const reviewReceipt = validateFindingsFreeCompatibilityReceipt(reviewRecord.value, sha256(canonicalPlanView(evidenceBytes)), evidenceCommit); const attribution = renderCompatibilityReviewAttribution(reviewReceipt);
  let expectedReview = insertDraftReceipt(evidenceBytes, reviewReceipt); expectedReview = appendSelfReviewAttribution(expectedReview, attribution); requirePlanDelta(evidenceBytes, reviewBytes, expectedReview, 'compatibility review');
  const binding = {
    schema: 1,
    compatibility_receipt_sha256: compatibilityReceipt.receipt_sha256,
    compatibility_evidence_commit: evidenceCommit,
    reviewed_commit: evidenceCommit,
    review_commit: reviewCommit,
    review_receipt_sha256: sha256(reviewRecord.payload),
    review_attribution_sha256: sha256(attribution),
    binding_parent: reviewCommit,
  };
  binding.binding_sha256 = sha256(jcs(binding));
  requirePrerequisitePlanOnly(repository, bindingCommit, reviewCommit, planPath, 'compatibility binding commit');
  const bindingBytes = repository.blob(bindingCommit, planPath, 'compatibility binding plan'); const extracted = extractCompatibilityBinding(bindingBytes);
  if (extracted.markdown !== `Execution-base-compatibility-binding: ${jcs(binding)}\n`) throw new Error('compatibility binding application mismatch');
  const expectedBinding = insertBeforeReview(reviewBytes, extracted.markdown); requirePlanDelta(reviewBytes, bindingBytes, expectedBinding, 'compatibility binding');
  return { compatibilityReceipt, binding, bindingBytes };
}

function parseJsonBytes(bytes, label) {
  const text = exactUtf8(bytes, label); let value;
  try { value = JSON.parse(text); } catch { throw new Error(`${label} must be JSON`); }
  return value;
}

function objectWithout(object, key) { const copy = { ...object }; delete copy[key]; return copy; }

function validateArchivedCompatibilityPlan(repository, input) {
  repository.exact(input.finishedPlanCommit, 'finished compatibility plan commit');
  const names = repository.treeNames(input.finishedPlanCommit, [input.finishedPlanPath, COMPATIBILITY_ACTIVE_PLAN], 'finished compatibility plan tree');
  if (jcs(names) !== jcs([input.finishedPlanPath])) throw new Error('finished compatibility plan archive identity');
  const bytes = repository.blob(input.finishedPlanCommit, input.finishedPlanPath, 'finished compatibility plan'); const plan = parsePlan(bytes);
  if (plan.frontmatter.status !== 'finished' || plan.frontmatter.review_status !== 'passed') throw new Error('finished compatibility plan status');
  const record = extractMachineRecord(bytes, 'Completion-review-receipt'); const receipt = validateCompletionReceipt(record.value, { review_status: 'passed' });
  const reviewedBytes = repository.blob(receipt.reviewed_head, COMPATIBILITY_ACTIVE_PLAN, 'reviewed compatibility plan');
  validateCompletionReceipt(receipt, { reviewed_head: receipt.reviewed_head, plan_input_sha256: sha256(canonicalPlanView(reviewedBytes)), review_status: 'passed' });
  if (completionStablePlanViewV1(reviewedBytes) !== completionStablePlanViewV1(bytes)) throw new Error('finished compatibility plan stable view mismatch');
  const review = uniquePartition(plan.body, 'Review'); const expectedReview = review.end < plan.body.length ? `${renderCompletionReviewBlock(receipt)}\n` : renderCompletionReviewBlock(receipt);
  if (review.bytes !== expectedReview) throw new Error('finished compatibility plan Review block mismatch');
  return { bytes, receipt };
}

function validateReleaseCommit(repository, input, releaseCommit) {
  if (repository.parent(releaseCommit, 'Docks release commit') !== input.finishedPlanCommit) throw new Error('Docks release commit is not the direct child of finished plan');
  const expectedPaths = ['.claude-plugin/marketplace.json', 'plugins/docks/.claude-plugin/plugin.json', 'plugins/docks/.codex-plugin/plugin.json'];
  const paths = repository.paths(input.finishedPlanCommit, releaseCommit, 'Docks release paths').sort(compareUtf16);
  if (jcs(paths) !== jcs(expectedPaths.slice().sort(compareUtf16))) throw new Error('Docks release changed unexpected paths');
  const claudePath = 'plugins/docks/.claude-plugin/plugin.json'; const codexPath = 'plugins/docks/.codex-plugin/plugin.json'; const marketPath = '.claude-plugin/marketplace.json';
  const beforeClaude = parseJsonBytes(repository.blob(input.finishedPlanCommit, claudePath, 'parent Claude manifest'), 'parent Claude manifest'); const afterClaude = parseJsonBytes(repository.blob(releaseCommit, claudePath, 'release Claude manifest'), 'release Claude manifest');
  const beforeCodex = parseJsonBytes(repository.blob(input.finishedPlanCommit, codexPath, 'parent Codex manifest'), 'parent Codex manifest'); const afterCodex = parseJsonBytes(repository.blob(releaseCommit, codexPath, 'release Codex manifest'), 'release Codex manifest');
  if (jcs(objectWithout(beforeClaude, 'version')) !== jcs(objectWithout(afterClaude, 'version')) || jcs(objectWithout(beforeCodex, 'version')) !== jcs(objectWithout(afterCodex, 'version'))) throw new Error('Docks release manifest changed beyond version');
  const beforeMarket = parseJsonBytes(repository.blob(input.finishedPlanCommit, marketPath, 'parent marketplace'), 'parent marketplace'); const afterMarket = parseJsonBytes(repository.blob(releaseCommit, marketPath, 'release marketplace'), 'release marketplace');
  const beforeRows = beforeMarket.plugins?.filter((row) => row.name === 'docks') ?? []; const afterRows = afterMarket.plugins?.filter((row) => row.name === 'docks') ?? [];
  if (beforeRows.length !== 1 || afterRows.length !== 1) throw new Error('Docks marketplace entry count');
  const normalizedMarket = (market) => ({ ...market, plugins: market.plugins.map((row) => row.name === 'docks' ? objectWithout(row, 'version') : row) });
  if (jcs(normalizedMarket(beforeMarket)) !== jcs(normalizedMarket(afterMarket))) throw new Error('Docks marketplace changed beyond version');
  if (beforeClaude.version !== beforeCodex.version || beforeClaude.version !== beforeRows[0].version || afterClaude.version !== afterCodex.version || afterClaude.version !== afterRows[0].version || afterClaude.version !== input.releaseVersion) throw new Error('Docks release versions disagree');
  const before = beforeClaude.version?.split('.').map(Number); const after = input.releaseVersion.split('.').map(Number);
  if (!before || before.length !== 3 || before.some((value) => !Number.isSafeInteger(value)) || after[0] !== before[0] || after[1] !== before[1] || after[2] !== before[2] + 1) throw new Error('Docks release is not a patch successor');
  for (const plugin of ['effect-kit', 'session-relay']) for (const runtime of ['.claude-plugin', '.codex-plugin']) {
    const logical = `plugins/${plugin}/${runtime}/plugin.json`;
    if (!repository.blob(input.finishedPlanCommit, logical, `${plugin} parent manifest`).equals(repository.blob(releaseCommit, logical, `${plugin} release manifest`))) throw new Error(`${plugin} manifest changed in Docks release`);
  }
}

function remoteMainProjection(stdout, releaseCommit) {
  const expected = `${releaseCommit}\trefs/heads/main\n`; const text = exactUtf8(stdout, 'remote main stdout');
  if (text !== expected) throw new Error('remote main stdout mismatch');
  return { commit: releaseCommit, ref: 'refs/heads/main' };
}

function remoteTagProjection(stdout, releaseTag, releaseCommit) {
  const text = exactUtf8(stdout, 'remote tag stdout'); const ref = `refs/tags/${releaseTag}`;
  const rows = text.split('\n').filter((row) => row !== '').map((row) => row.split('\t'));
  if (rows.length === 1 && rows[0].length === 2 && rows[0][0] === releaseCommit && rows[0][1] === ref && text === `${releaseCommit}\t${ref}\n`) return { ref, annotated: false, tag_object: releaseCommit, peeled_commit: releaseCommit };
  if (rows.length === 2 && rows.every((row) => row.length === 2) && HEX40.test(rows[0][0]) && rows[0][0] !== releaseCommit && rows[0][1] === ref && rows[1][0] === releaseCommit && rows[1][1] === `${ref}^{}` && text === `${rows[0][0]}\t${ref}\n${releaseCommit}\t${ref}^{}\n`) return { ref, annotated: true, tag_object: rows[0][0], peeled_commit: releaseCommit };
  throw new Error('remote tag stdout mismatch');
}

function githubReleaseProjection(stdout, releaseTag, releaseUrl) {
  const parsed = parseJsonBytes(stdout, 'GitHub Release stdout');
  assertClosed(parsed, ['isDraft', 'isPrerelease', 'tagName', 'url'], 'GitHub Release projection');
  const expected = { isDraft: false, isPrerelease: false, tagName: releaseTag, url: releaseUrl };
  if (jcs(parsed) !== jcs(expected)) throw new Error('GitHub Release projection mismatch');
  return expected;
}

function codexPluginProjection(stdout, releaseVersion) {
  const parsed = parseJsonBytes(stdout, 'Codex plugin stdout');
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || !Array.isArray(parsed.installed)) throw new Error('Codex plugin installed list missing');
  const matches = parsed.installed.filter((row) => row?.pluginId === 'docks@docks');
  if (matches.length !== 1) throw new Error('Codex plugin selection must be unique');
  const row = matches[0];
  const projection = {
    pluginId: row.pluginId,
    name: row.name,
    marketplaceName: row.marketplaceName,
    version: row.version,
    installed: row.installed,
    enabled: row.enabled,
    source: row.source && { source: row.source.source, url: row.source.url, path: row.source.path, ref: row.source.ref },
  };
  const expected = { pluginId: 'docks@docks', name: 'docks', marketplaceName: 'docks', version: releaseVersion, installed: true, enabled: true, source: { source: 'git-subdir', url: CANONICAL_REPOSITORY_URL, path: 'plugins/docks', ref: 'main' } };
  if (jcs(projection) !== jcs(expected)) throw new Error('Codex plugin projection mismatch');
  return expected;
}

function claudePluginProjection(stdout, releaseVersion, cacheRoot) {
  const parsed = parseJsonBytes(stdout, 'Claude plugin stdout');
  if (!Array.isArray(parsed)) throw new Error('Claude plugin list must be an array');
  const matches = parsed.filter((row) => row?.id === 'docks@docks');
  if (matches.length !== 1) throw new Error('Claude plugin selection must be unique');
  const row = matches[0]; const projection = { id: row.id, version: row.version, scope: row.scope, enabled: row.enabled, installPath: row.installPath };
  const expected = { id: 'docks@docks', version: releaseVersion, scope: 'user', enabled: true, installPath: cacheRoot };
  if (jcs(projection) !== jcs(expected)) throw new Error('Claude plugin projection mismatch');
  return expected;
}

function validatedCacheFile(dependencies, absolutePath, label) {
  const stat = dependencies.lstat(absolutePath);
  assertClosed(stat, ['kind', 'symbolicLink'], `${label} lstat`);
  if (!['file', 'directory', 'other'].includes(stat.kind) || typeof stat.symbolicLink !== 'boolean') throw new Error(`${label} lstat shape`);
  if (stat.kind !== 'file' || stat.symbolicLink || dependencies.realpath(absolutePath) !== absolutePath) throw new Error(`${label} must be a canonical non-symlink file`);
  const bytes = dependencies.readFile(absolutePath);
  if (!Buffer.isBuffer(bytes)) throw new Error(`${label} readFile must return Buffer`);
  return bytes;
}

function validateObservationRow(row, expectedArgv, label) {
  assertClosed(row, ['schema', 'argv', 'exit_code', 'stdout_sha256', 'stderr_sha256', 'projection'], label);
  if (row.schema !== 1 || row.exit_code !== 0 || jcs(row.argv) !== jcs(expectedArgv)) throw new Error(`${label} identity mismatch`);
  digest(row.stdout_sha256, `${label} stdout`); digest(row.stderr_sha256, `${label} stderr`);
}

function validatePrerequisiteObservations(observations, receipt) {
  assertClosed(observations, ['schema', 'observed_at', 'remote_main', 'remote_tag', 'github_release', 'codex_plugin', 'claude_plugin', 'source_policy', 'codex_cache', 'claude_cache', 'observations_sha256'], 'Docks prerequisite observations');
  if (observations.schema !== 1) throw new Error('Docks prerequisite observations schema');
  iso(observations.observed_at, 'Docks prerequisite observed_at');
  if (new Date(observations.observed_at).toISOString() !== observations.observed_at) throw new Error('Docks prerequisite observed_at must be canonical ISO');
  const mainArgv = [...CANONICAL_REMOTE_MAIN_ARGV];
  const tagArgv = canonicalRemoteTagArgv(receipt.release_tag);
  const ghArgv = ['gh', 'release', 'view', receipt.release_tag, '--repo', 'DocksDocks/docks', '--json', 'isDraft,isPrerelease,tagName,url'];
  const codexArgv = ['codex', 'plugin', 'list', '--marketplace', 'docks', '--json']; const claudeArgv = ['claude', 'plugin', 'list', '--json'];
  validateObservationRow(observations.remote_main, mainArgv, 'remote main observation');
  validateObservationRow(observations.remote_tag, tagArgv, 'remote tag observation');
  validateObservationRow(observations.github_release, ghArgv, 'GitHub Release observation');
  validateObservationRow(observations.codex_plugin, codexArgv, 'Codex plugin observation');
  validateObservationRow(observations.claude_plugin, claudeArgv, 'Claude plugin observation');
  if (jcs(observations.remote_main.projection) !== jcs({ commit: receipt.release_commit, ref: 'refs/heads/main' })) throw new Error('stored remote main projection mismatch');
  assertClosed(observations.remote_tag.projection, ['ref', 'annotated', 'tag_object', 'peeled_commit'], 'stored remote tag projection');
  if (observations.remote_tag.projection.ref !== `refs/tags/${receipt.release_tag}` || typeof observations.remote_tag.projection.annotated !== 'boolean' || !HEX40.test(observations.remote_tag.projection.tag_object) || observations.remote_tag.projection.peeled_commit !== receipt.release_commit || (!observations.remote_tag.projection.annotated && observations.remote_tag.projection.tag_object !== receipt.release_commit) || (observations.remote_tag.projection.annotated && observations.remote_tag.projection.tag_object === receipt.release_commit)) throw new Error('stored remote tag projection mismatch');
  if (jcs(observations.github_release.projection) !== jcs({ isDraft: false, isPrerelease: false, tagName: receipt.release_tag, url: receipt.release_url })) throw new Error('stored GitHub Release projection mismatch');
  const codexExpected = { pluginId: 'docks@docks', name: 'docks', marketplaceName: 'docks', version: receipt.release_version, installed: true, enabled: true, source: { source: 'git-subdir', url: CANONICAL_REPOSITORY_URL, path: 'plugins/docks', ref: 'main' } };
  if (jcs(observations.codex_plugin.projection) !== jcs(codexExpected)) throw new Error('stored Codex plugin projection mismatch');
  assertClosed(observations.claude_plugin.projection, ['id', 'version', 'scope', 'enabled', 'installPath'], 'stored Claude plugin projection');
  if (observations.claude_plugin.projection.id !== 'docks@docks' || observations.claude_plugin.projection.version !== receipt.release_version || observations.claude_plugin.projection.scope !== 'user' || observations.claude_plugin.projection.enabled !== true) throw new Error('stored Claude plugin projection mismatch');
  assertClosed(observations.source_policy, ['schema', 'git_spec', 'sha256'], 'source policy observation');
  for (const [key, row] of [['codex_cache', observations.codex_cache], ['claude_cache', observations.claude_cache]]) {
    assertClosed(row, ['schema', 'home_relative_path', 'absolute_path', 'sha256'], `${key} observation`);
    if (row.schema !== 1 || !path.isAbsolute(row.absolute_path)) throw new Error(`${key} observation identity`); digest(row.sha256, `${key} hash`);
  }
  if (observations.source_policy.schema !== 1 || observations.source_policy.git_spec !== `${receipt.release_commit}:${COMPATIBILITY_POLICY_PATH}`) throw new Error('source policy observation identity');
  digest(observations.source_policy.sha256, 'source policy hash');
  if (observations.source_policy.sha256 !== receipt.source_policy_sha256 || observations.codex_cache.sha256 !== receipt.codex_policy_sha256 || observations.claude_cache.sha256 !== receipt.claude_policy_sha256 || receipt.source_policy_sha256 !== receipt.codex_policy_sha256 || receipt.source_policy_sha256 !== receipt.claude_policy_sha256) throw new Error('Docks prerequisite policy hashes disagree');
  const preimage = { ...observations }; delete preimage.observations_sha256;
  if (observations.observations_sha256 !== sha256(jcs(preimage))) throw new Error('Docks prerequisite observations hash mismatch');
  return observations;
}

function validatePrerequisiteReceipt(receipt, expected = {}) {
  assertClosed(receipt, ['schema', 'authorization_id', 'authorization_sha256', 'finished_plan_path', 'finished_plan_commit', 'release_version', 'release_tag', 'release_commit', 'release_url', 'source_policy_sha256', 'codex_policy_sha256', 'claude_policy_sha256', 'observations', 'evidence_commit', 'compatibility_review_commit', 'binding_commit', 'binding_sha256', 'receipt_sha256'], 'Docks compatibility prerequisite receipt');
  if (receipt.schema !== 1 || receipt.authorization_id !== RELEASE_AUTHORIZATION.authorization_id || receipt.authorization_sha256 !== RELEASE_AUTHORIZATION_SHA256 || sha256(jcs(RELEASE_AUTHORIZATION)) !== receipt.authorization_sha256) throw new Error('Docks prerequisite receipt authorization mismatch');
  if (!FINISHED_COMPATIBILITY_PATH.test(receipt.finished_plan_path) || !CORE_SEMVER.test(receipt.release_version)) throw new Error('Docks prerequisite receipt path/version');
  for (const key of ['finished_plan_commit', 'release_commit', 'evidence_commit', 'compatibility_review_commit', 'binding_commit']) if (!HEX40.test(receipt[key])) throw new Error(`Docks prerequisite receipt ${key}`);
  for (const key of ['source_policy_sha256', 'codex_policy_sha256', 'claude_policy_sha256', 'binding_sha256', 'receipt_sha256']) digest(receipt[key], `Docks prerequisite receipt ${key}`);
  if (receipt.release_tag !== `docks--v${receipt.release_version}` || receipt.release_url !== `https://github.com/DocksDocks/docks/releases/tag/${receipt.release_tag}`) throw new Error('Docks prerequisite release identity mismatch');
  validatePrerequisiteObservations(receipt.observations, receipt);
  const preimage = { ...receipt }; delete preimage.receipt_sha256;
  if (receipt.receipt_sha256 !== sha256(jcs(preimage))) throw new Error('Docks prerequisite receipt hash mismatch');
  for (const [key, value] of Object.entries(expected)) if (value !== undefined && receipt[key] !== value) throw new Error(`Docks prerequisite receipt ${key} mismatch`);
  return receipt;
}

export function buildDocksCompatibilityPrerequisiteApplication(input, dependencies = PRODUCTION_PREREQUISITE_DEPENDENCIES) {
  assertCompatibilityConstants(); input = validatePrerequisiteInput(input); validatePrerequisiteDependencies(dependencies);
  const repoRoot = path.resolve(input.repo);
  if (dependencies.realpath(repoRoot) !== repoRoot) throw new Error('prerequisite repo must be canonical');
  const observedAt = dependencies.now(); iso(observedAt, 'Docks prerequisite observed_at');
  if (new Date(observedAt).toISOString() !== observedAt) throw new Error('Docks prerequisite observed_at must be canonical ISO');
  const repository = prerequisiteRepository(dependencies, repoRoot);
  if (repository.text(['rev-parse', '--show-toplevel'], 'prerequisite repository root').trim() !== repoRoot) throw new Error('prerequisite repo is not the worktree root');
  for (const [commit, label] of [[input.finishedPlanCommit, 'finished plan commit'], [input.evidenceCommit, 'evidence commit'], [input.compatibilityReviewCommit, 'compatibility review commit'], [input.bindingCommit, 'binding commit']]) repository.exact(commit, label);
  validateArchivedCompatibilityPlan(repository, input);
  const releaseCommit = repository.parent(input.evidenceCommit, 'compatibility evidence commit');
  validateReleaseCommit(repository, input, releaseCommit);
  const releaseTag = `docks--v${input.releaseVersion}`; const releaseUrl = `https://github.com/DocksDocks/docks/releases/tag/${releaseTag}`;
  if (repository.object(`refs/tags/${releaseTag}^{commit}`, 'local Docks release tag') !== releaseCommit) throw new Error('local Docks release tag mismatch');
  if (repository.parent(input.compatibilityReviewCommit, 'compatibility review commit') !== input.evidenceCommit || repository.parent(input.bindingCommit, 'binding commit') !== input.compatibilityReviewCommit) throw new Error('compatibility E/R/B commits are not contiguous');
  const bindingState = validateBindingWithRepository({ repository, planPath: input.planPath, evidenceCommit: input.evidenceCommit, reviewCommit: input.compatibilityReviewCommit, bindingCommit: input.bindingCommit });

  const remoteMainArgv = [...CANONICAL_REMOTE_MAIN_ARGV];
  const remoteMainResult = prerequisiteChild(dependencies, repoRoot, remoteMainArgv, { recorded: true, label: 'remote main observation' });
  const remoteMain = { schema: 1, argv: remoteMainArgv, exit_code: 0, stdout_sha256: sha256(remoteMainResult.stdout), stderr_sha256: sha256(remoteMainResult.stderr), projection: remoteMainProjection(remoteMainResult.stdout, releaseCommit) };
  const remoteTagArgv = canonicalRemoteTagArgv(releaseTag);
  const remoteTagResult = prerequisiteChild(dependencies, repoRoot, remoteTagArgv, { recorded: true, label: 'remote tag observation' });
  const remoteTag = { schema: 1, argv: remoteTagArgv, exit_code: 0, stdout_sha256: sha256(remoteTagResult.stdout), stderr_sha256: sha256(remoteTagResult.stderr), projection: remoteTagProjection(remoteTagResult.stdout, releaseTag, releaseCommit) };
  const ghArgv = ['gh', 'release', 'view', releaseTag, '--repo', 'DocksDocks/docks', '--json', 'isDraft,isPrerelease,tagName,url'];
  const ghResult = prerequisiteChild(dependencies, repoRoot, ghArgv, { recorded: true, label: 'GitHub Release observation' });
  const githubRelease = { schema: 1, argv: ghArgv, exit_code: 0, stdout_sha256: sha256(ghResult.stdout), stderr_sha256: sha256(ghResult.stderr), projection: githubReleaseProjection(ghResult.stdout, releaseTag, releaseUrl) };
  const codexArgv = ['codex', 'plugin', 'list', '--marketplace', 'docks', '--json']; const codexResult = prerequisiteChild(dependencies, repoRoot, codexArgv, { recorded: true, label: 'Codex plugin observation' });
  const codexPlugin = { schema: 1, argv: codexArgv, exit_code: 0, stdout_sha256: sha256(codexResult.stdout), stderr_sha256: sha256(codexResult.stderr), projection: codexPluginProjection(codexResult.stdout, input.releaseVersion) };
  const home = dependencies.homedir(); if (typeof home !== 'string' || !path.isAbsolute(home)) throw new Error('prerequisite homedir must be absolute');
  const claudeCacheRoot = path.join(home, '.claude/plugins/cache/docks/docks', input.releaseVersion);
  const claudeArgv = ['claude', 'plugin', 'list', '--json']; const claudeResult = prerequisiteChild(dependencies, repoRoot, claudeArgv, { recorded: true, label: 'Claude plugin observation' });
  const claudePlugin = { schema: 1, argv: claudeArgv, exit_code: 0, stdout_sha256: sha256(claudeResult.stdout), stderr_sha256: sha256(claudeResult.stderr), projection: claudePluginProjection(claudeResult.stdout, input.releaseVersion, claudeCacheRoot) };

  const sourceBytes = repository.blob(releaseCommit, COMPATIBILITY_POLICY_PATH, 'released compatibility policy'); const sourceSha = sha256(sourceBytes);
  const codexRelative = `.codex/plugins/cache/docks/docks/${input.releaseVersion}/skills/productivity/plan-review/scripts/review-policy.mjs`;
  const claudeRelative = `.claude/plugins/cache/docks/docks/${input.releaseVersion}/skills/productivity/plan-review/scripts/review-policy.mjs`;
  const codexAbsolute = path.join(home, codexRelative); const claudeAbsolute = path.join(home, claudeRelative);
  const codexSha = sha256(validatedCacheFile(dependencies, codexAbsolute, 'Codex policy cache')); const claudeSha = sha256(validatedCacheFile(dependencies, claudeAbsolute, 'Claude policy cache'));
  if (sourceSha !== codexSha || sourceSha !== claudeSha) throw new Error('released and cached compatibility policies differ');
  const observations = {
    schema: 1,
    observed_at: observedAt,
    remote_main: remoteMain,
    remote_tag: remoteTag,
    github_release: githubRelease,
    codex_plugin: codexPlugin,
    claude_plugin: claudePlugin,
    source_policy: { schema: 1, git_spec: `${releaseCommit}:${COMPATIBILITY_POLICY_PATH}`, sha256: sourceSha },
    codex_cache: { schema: 1, home_relative_path: codexRelative, absolute_path: codexAbsolute, sha256: codexSha },
    claude_cache: { schema: 1, home_relative_path: claudeRelative, absolute_path: claudeAbsolute, sha256: claudeSha },
  };
  observations.observations_sha256 = sha256(jcs(observations));
  const receipt = {
    schema: 1,
    authorization_id: input.authorizationId,
    authorization_sha256: input.authorizationSha256,
    finished_plan_path: input.finishedPlanPath,
    finished_plan_commit: input.finishedPlanCommit,
    release_version: input.releaseVersion,
    release_tag: releaseTag,
    release_commit: releaseCommit,
    release_url: releaseUrl,
    source_policy_sha256: sourceSha,
    codex_policy_sha256: codexSha,
    claude_policy_sha256: claudeSha,
    observations,
    evidence_commit: input.evidenceCommit,
    compatibility_review_commit: input.compatibilityReviewCommit,
    binding_commit: input.bindingCommit,
    binding_sha256: bindingState.binding.binding_sha256,
  };
  receipt.receipt_sha256 = sha256(jcs(receipt)); validatePrerequisiteReceipt(receipt);
  const markdown = `\`\`\`json\n${jcs(receipt)}\n\`\`\`\n`;
  const application = { schema: 1, markdown, receipt_sha256: receipt.receipt_sha256, observations_sha256: observations.observations_sha256 };
  application.application_sha256 = sha256(jcs(application));
  return application;
}

function extractPrerequisiteReceipt(bytes, { required = true } = {}) {
  const { body } = splitPlanText(bytes); const rows = bodyRows(body); const candidates = []; let fence = null;
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index]; const fenceMatch = /^( {0,3})(`{3,}|~{3,})(.*)$/.exec(row.line);
    if (fence === null) {
      if (!fenceMatch) continue;
      if (row.line === '```json' && rows[index + 1] && rows[index + 2]?.line === '```') {
        let value;
        try { value = JSON.parse(rows[index + 1].line); } catch { value = null; }
        if (value?.authorization_id === RELEASE_AUTHORIZATION.authorization_id) candidates.push({ value, payload: rows[index + 1].line, markdown: body.slice(row.start, rows[index + 2].end), start: row.start, end: rows[index + 2].end });
      }
      fence = { marker: fenceMatch[2][0], length: fenceMatch[2].length };
    } else if (fenceMatch && fenceMatch[2][0] === fence.marker && fenceMatch[2].length >= fence.length && /^\s*$/.test(fenceMatch[3])) fence = null;
  }
  if (candidates.length === 0 && !required) return null;
  if (candidates.length !== 1) throw new Error('Docks prerequisite receipt fence count');
  const candidate = candidates[0];
  if (candidate.payload !== jcs(candidate.value)) throw new Error('Docks prerequisite receipt must be compact JCS');
  validatePrerequisiteReceipt(candidate.value);
  if (candidate.markdown !== `\`\`\`json\n${candidate.payload}\n\`\`\`\n`) throw new Error('Docks prerequisite receipt fence bytes');
  return candidate;
}

function applyPrerequisiteClosure(bytes, markdown) {
  const text = exactUtf8(bytes, 'binding plan');
  const markerCount = text.split(PREREQUISITE_PENDING_MARKER).length - 1; const plannedCount = text.split(PREREQUISITE_STEP_PLANNED).length - 1; const doneCount = text.split(PREREQUISITE_STEP_DONE).length - 1;
  if (markerCount !== 1 || plannedCount !== 1 || doneCount !== 0) throw new Error('Docks prerequisite marker or Step-P row mismatch');
  return Buffer.from(text.replace(PREREQUISITE_PENDING_MARKER, markdown).replace(PREREQUISITE_STEP_PLANNED, PREREQUISITE_STEP_DONE));
}

function directPrerequisiteRepository(repo) {
  return {
    exact: (commit, label) => exactCommit(repo, commit, label),
    parent: (commit, label) => commitParent(repo, commit, label),
    paths: (parent, commit) => changedPaths(repo, parent, commit),
    blob: (commit, logical) => planBlob(repo, commit, logical),
    object: (spec, label) => gitObject(repo, spec, label),
    isAncestor: (older, newer) => ancestor(repo, older, newer),
    treeNames(commit, logicals) {
      const bytes = git(repo, ['ls-tree', '-z', '--name-only', commit, '--', ...logicals], null); const text = exactUtf8(bytes, 'git tree names');
      if (text !== '' && !text.endsWith('\0')) throw new Error('git tree names must be NUL terminated');
      return text === '' ? [] : text.slice(0, -1).split('\0').map(safeLogical);
    },
  };
}

function validateImmutablePrerequisite({ repo, planPath, receipt, binding }) {
  validatePrerequisiteReceipt(receipt, {
    evidence_commit: binding.compatibility_evidence_commit,
    compatibility_review_commit: binding.review_commit,
    binding_sha256: binding.binding_sha256,
  });
  const repository = directPrerequisiteRepository(repo);
  validateArchivedCompatibilityPlan(repository, {
    finishedPlanCommit: receipt.finished_plan_commit,
    finishedPlanPath: receipt.finished_plan_path,
  });
  if (repository.parent(receipt.evidence_commit, 'compatibility evidence commit') !== receipt.release_commit || repository.parent(receipt.compatibility_review_commit, 'compatibility review commit') !== receipt.evidence_commit || repository.parent(receipt.binding_commit, 'compatibility binding commit') !== receipt.compatibility_review_commit) throw new Error('stored Docks prerequisite E/R/B chain mismatch');
  validateReleaseCommit(repository, { finishedPlanCommit: receipt.finished_plan_commit, releaseVersion: receipt.release_version }, receipt.release_commit);
  if (repository.object(`refs/tags/${receipt.release_tag}^{commit}`, 'stored local Docks release tag') !== receipt.release_commit) throw new Error('stored local Docks release tag mismatch');
  const sourceSha = sha256(repository.blob(receipt.release_commit, COMPATIBILITY_POLICY_PATH, 'stored released policy'));
  if (sourceSha !== receipt.source_policy_sha256) throw new Error('stored released policy hash mismatch');
  const codexRelative = `.codex/plugins/cache/docks/docks/${receipt.release_version}/skills/productivity/plan-review/scripts/review-policy.mjs`; const claudeRelative = `.claude/plugins/cache/docks/docks/${receipt.release_version}/skills/productivity/plan-review/scripts/review-policy.mjs`;
  if (receipt.observations.codex_cache.home_relative_path !== codexRelative || receipt.observations.claude_cache.home_relative_path !== claudeRelative) throw new Error('stored Docks cache relative path mismatch');
  const codexSuffix = `${path.sep}${codexRelative.split('/').join(path.sep)}`; const claudeSuffix = `${path.sep}${claudeRelative.split('/').join(path.sep)}`;
  if (!receipt.observations.codex_cache.absolute_path.endsWith(codexSuffix) || !receipt.observations.claude_cache.absolute_path.endsWith(claudeSuffix)) throw new Error('stored Docks cache absolute path mismatch');
  const codexHome = receipt.observations.codex_cache.absolute_path.slice(0, -codexSuffix.length); const claudeHome = receipt.observations.claude_cache.absolute_path.slice(0, -claudeSuffix.length);
  if (codexHome !== claudeHome || receipt.observations.claude_plugin.projection.installPath !== path.join(claudeHome, '.claude/plugins/cache/docks/docks', receipt.release_version)) throw new Error('stored Docks cache home/install path mismatch');
  if (receipt.binding_commit !== nextCommit(repo, receipt.compatibility_review_commit, receipt.binding_commit, 'compatibility binding commit')) throw new Error('stored compatibility binding adjacency mismatch');
  const bindingState = validateBindingCommit({ repo, planPath, evidenceCommit: receipt.evidence_commit, reviewCommit: receipt.compatibility_review_commit, bindingCommit: receipt.binding_commit });
  if (bindingState.binding.binding_sha256 !== receipt.binding_sha256) throw new Error('stored compatibility binding hash mismatch');
  return receipt;
}

function validateLegacyCompatibilityRange({ repo, planPath, plannedAtCommit, executionBaseCommit, reviewedHead, application, headBytes }) {
  const logical = safeLogical(planPath); const validatedApplication = validateCompatibilityApplication(application, { repo, planPath: logical, plannedAtCommit, executionBaseCommit });
  const evidenceParent = validatedApplication.receipt.evidence_input_commit; const evidenceCommit = nextCommit(repo, evidenceParent, reviewedHead, 'compatibility evidence commit');
  const headBinding = extractCompatibilityBinding(headBytes); const binding = headBinding.binding;
  assertClosed(binding, ['schema', 'compatibility_receipt_sha256', 'compatibility_evidence_commit', 'reviewed_commit', 'review_commit', 'review_receipt_sha256', 'review_attribution_sha256', 'binding_parent', 'binding_sha256'], 'execution compatibility binding');
  if (binding.schema !== 1 || binding.compatibility_evidence_commit !== evidenceCommit || binding.reviewed_commit !== evidenceCommit || binding.compatibility_receipt_sha256 !== validatedApplication.receipt.receipt_sha256) throw new Error('execution compatibility binding identity mismatch');
  const reviewCommit = binding.review_commit; const bindingCommit = nextCommit(repo, reviewCommit, reviewedHead, 'compatibility binding commit');
  const bindingState = validateBindingCommit({ repo, planPath: logical, evidenceCommit, reviewCommit, bindingCommit, reviewedHead });
  if (bindingState.application.markdown !== headBinding.markdown) throw new Error('execution compatibility binding was not retained');
  const prerequisite = extractPrerequisiteReceipt(headBytes); const prerequisiteReceipt = validateImmutablePrerequisite({ repo, planPath: logical, receipt: prerequisite.value, binding: bindingState.binding });
  if (prerequisiteReceipt.evidence_commit !== evidenceCommit || prerequisiteReceipt.compatibility_review_commit !== reviewCommit || prerequisiteReceipt.binding_commit !== bindingCommit) throw new Error('Docks prerequisite receipt E/R/B mismatch');
  const prerequisiteCommit = nextCommit(repo, bindingCommit, reviewedHead, 'Docks prerequisite commit');
  requirePlanOnlyChild(repo, prerequisiteCommit, bindingCommit, logical, 'Docks prerequisite commit');
  const prerequisiteBytes = planBlob(repo, prerequisiteCommit, logical); const expectedPrerequisite = applyPrerequisiteClosure(bindingState.bindingBytes, prerequisite.markdown);
  requirePlanDelta(bindingState.bindingBytes, prerequisiteBytes, expectedPrerequisite, 'Docks prerequisite closure');
  const committedPrerequisite = extractPrerequisiteReceipt(prerequisiteBytes);
  if (committedPrerequisite.markdown !== prerequisite.markdown) throw new Error('Docks prerequisite receipt was not retained');
  const finalReview = extractMachineRecord(headBytes, 'Review-receipt'); const finalReceipt = validateFindingsFreeCompatibilityReceipt(finalReview.value, sha256(canonicalPlanView(prerequisiteBytes)), prerequisiteCommit);
  const executionReviewCommit = nextCommit(repo, prerequisiteCommit, reviewedHead, 'execution review commit');
  requirePlanOnlyChild(repo, executionReviewCommit, prerequisiteCommit, logical, 'execution review commit');
  const executionReviewBytes = planBlob(repo, executionReviewCommit, logical); const committedFinal = extractMachineRecord(executionReviewBytes, 'Review-receipt');
  if (committedFinal.payload !== finalReview.payload) throw new Error('execution review receipt was not retained');
  const finalAttribution = renderCompatibilityReviewAttribution(finalReceipt);
  let expectedFinal = replaceDraftReceipt(prerequisiteBytes, finalReceipt); expectedFinal = appendSelfReviewAttribution(expectedFinal, finalAttribution);
  requirePlanDelta(prerequisiteBytes, executionReviewBytes, expectedFinal, 'execution final review');
  const evidenceBytes = planBlob(repo, evidenceCommit, logical); const evidenceApplication = extractCompatibilityApplication(evidenceBytes);
  if (evidenceApplication.markdown !== application.markdown) throw new Error('execution compatibility application was not retained');
  const executionApplication = extractCompatibilityApplication(executionReviewBytes); const executionBinding = extractCompatibilityBinding(executionReviewBytes); const executionPrerequisite = extractPrerequisiteReceipt(executionReviewBytes);
  if (executionApplication.markdown !== application.markdown || executionBinding.markdown !== headBinding.markdown || executionPrerequisite.markdown !== prerequisite.markdown) throw new Error('execution compatibility records changed before final review');
  return {
    schema: 1,
    mode: 'legacy_compatibility',
    planned_at_commit: plannedAtCommit,
    execution_base_commit: executionBaseCommit,
    reviewed_head: reviewedHead,
    execution_parent: validatedApplication.receipt.execution_parent,
    compatibility_receipt_sha256: validatedApplication.receipt.receipt_sha256,
    compatibility_evidence_commit: evidenceCommit,
    compatibility_review_commit: reviewCommit,
    compatibility_binding_commit: bindingCommit,
    compatibility_binding_sha256: binding.binding_sha256,
    prerequisite_commit: prerequisiteCommit,
    prerequisite_receipt_sha256: prerequisiteReceipt.receipt_sha256,
    execution_review_input_commit: prerequisiteCommit,
    execution_review_commit: executionReviewCommit,
    execution_review_receipt_sha256: sha256(finalReview.payload),
    execution_review_attribution_sha256: sha256(finalAttribution),
  };
}

export function validateExecutionScope({ repo, base, head, planPath, expectedAllowedPathsSha256 }) {
  const logical = safeLogical(planPath); digest(expectedAllowedPathsSha256, 'execution scope expected allowed paths');
  exactCommit(repo, base, 'execution scope base'); exactCommit(repo, head, 'execution scope head');
  const headPlan = parsePlan(planBlob(repo, head, logical)); const affected = headPlan.frontmatter.affected_paths;
  if (!Array.isArray(affected)) throw new Error('execution scope affected_paths missing');
  const unsorted = [logical, ...affected.map(safeLogical)];
  if (new Set(unsorted).size !== unsorted.length) throw new Error('execution scope allowed paths contain duplicates');
  const paths = unsorted.slice().sort(compareUtf16); const allowed = new Set(paths);
  const allowedPathsSha256 = sha256(jcs({ schema: 1, paths }));
  if (allowedPathsSha256 !== expectedAllowedPathsSha256) throw new Error('execution scope sealed allowed paths hash mismatch');
  if (!ancestor(repo, base, head)) throw new Error('execution scope base is not an ancestor of head');
  const newestFirst = []; let cursor = head; const seen = new Set();
  while (cursor !== base) {
    if (seen.has(cursor)) throw new Error('execution scope parent cycle'); seen.add(cursor);
    const parent = commitParent(repo, cursor, 'execution scope commit'); newestFirst.push({ commit: cursor, parent }); cursor = parent;
    if (newestFirst.length > 100000) throw new Error('execution scope commit bound exceeded');
  }
  const commits = newestFirst.reverse();
  const ledger = commits.map((row, index) => {
    const changed = changedPaths(repo, row.parent, row.commit).slice().sort(compareUtf16);
    for (const changedPath of changed) if (!allowed.has(changedPath)) throw new Error(`execution scope path is not allowed: ${changedPath}`);
    return { ordinal: index + 1, commit: row.commit, parent: row.parent, paths: changed };
  });
  const changedPathsSha256 = sha256(jcs({ schema: 1, base, head, commits: ledger }));
  const result = { schema: 1, base, head, commit_count: ledger.length, allowed_paths_sha256: allowedPathsSha256, changed_paths_sha256: changedPathsSha256 };
  result.result_sha256 = sha256(jcs(result));
  return result;
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

export function sealBundle({ repo, reviewedCommit, planPath, requestedPaths, outDir, plannedAtCommit = null, executionBaseCommit = null, repair = null, reviewSchema = 3 }) {
  if (!HEX40.test(reviewedCommit)) throw new Error('reviewedCommit');
  oneOf(reviewSchema, new Set([3, 5]), 'bundle reviewSchema');
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
  const reviewerSchemas = reviewSchema === 5 ? { primary: 'reviewer-output.primary.v5.schema.json' } : { X: 'reviewer-output.X.schema.json', S: 'reviewer-output.S.schema.json' };
  if (reviewSchema === 5) {
    entries.push({ path: reviewerSchemas.primary, mode: '100444', bytes: Buffer.from(`${jcs(currentReviewerSchema())}\n`) });
  } else {
    for (const leg of ['X', 'S']) {
      entries.push({ path: `reviewer-output.${leg}.schema.json`, mode: '100444', bytes: Buffer.from(`${jcs(reviewerSchema(leg))}\n`) });
      entries.push({ path: `reviewer-output.${leg}.v2.schema.json`, mode: '100444', bytes: Buffer.from(`${jcs(reviewerSchema(leg, 2))}\n`) });
      entries.push({ path: `reviewer-output.${leg}.v3.schema.json`, mode: '100444', bytes: Buffer.from(`${jcs(reviewerSchema(leg, 3))}\n`) });
    }
  }
  let repairManifest = null;
  if (repair !== null) {
    assertClosed(repair, ['previousPlan', 'transition'], 'bundle repair');
    if (typeof repair.previousPlan !== 'string' || repair.previousPlan.length === 0 || !repair.previousPlan.endsWith('\n')) throw new Error('bundle previous plan');
    if ((repair.transition?.schema === 5) !== (reviewSchema === 5)) throw new Error('schema-5 repair requires reviewSchema 5 and historical repair requires reviewSchema 3');
    const transition = repair.transition?.schema === 5 ? validateCurrentRepairTransition(repair.transition) : validateRepairTransition(repair.transition);
    const previousPlanBytes = Buffer.from(repair.previousPlan); const targetBytes = Buffer.from(`${jcs(transition)}\n`);
    if (sha256(previousPlanBytes) !== transition.previous_input_sha256 || sha256(canonical) !== transition.current_input_sha256) throw new Error('bundle repair input mismatch');
    entries.push(
      { path: 'previous-plan.review.md', mode: '100444', bytes: previousPlanBytes },
      { path: 'repair-targets.json', mode: '100444', bytes: targetBytes },
    );
    repairManifest = {
      from_round_index: transition.from_round_index,
      previous_plan_path: 'previous-plan.review.md',
      previous_input_sha256: transition.previous_input_sha256,
      current_input_sha256: transition.current_input_sha256,
      targets_path: 'repair-targets.json',
      repair_targets_sha256: transition.repair_targets_sha256,
    };
  }
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
  const directories = new Set();
  for (const entry of entries) {
    const dest = path.join(outDir, entry.path); if (!inside(outDir, dest)) throw new Error('bundle path escape');
    fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.writeFileSync(dest, entry.bytes, { mode: 0o444 });
    for (let directory = path.dirname(dest); inside(outDir, directory); directory = path.dirname(directory)) directories.add(directory);
  }
  const manifestSchema = reviewSchema === 5 ? (repairManifest === null ? 3 : 4) : (repairManifest === null ? 1 : 2);
  const manifest = {
    schema: manifestSchema, ...(reviewSchema === 5 ? { review_schema: 5 } : {}), plan_path: safePlan, plan_view: 'plan.review.md', reviewer_schemas: reviewerSchemas, reviewed_commit: reviewedCommit,
    input_sha256: sha256(canonical), completion, ...(repairManifest === null ? {} : { repair: repairManifest }), requested,
    files: entries.map((entry) => ({ path: entry.path, mode: entry.mode, sha256: sha256(entry.bytes) })),
  };
  const manifestBytes = Buffer.from(`${jcs(manifest)}\n`); fs.writeFileSync(path.join(outDir, 'manifest.json'), manifestBytes, { mode: 0o444 });
  for (const directory of [...directories].sort((a, b) => path.relative(outDir, b).split(path.sep).length - path.relative(outDir, a).split(path.sep).length)) fs.chmodSync(directory, 0o555);
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
  const currentBundle = [3, 4].includes(manifest?.schema);
  const repairBundle = [2, 4].includes(manifest?.schema);
  const manifestKeys = ['schema', ...(currentBundle ? ['review_schema'] : []), 'plan_path', 'plan_view', 'reviewer_schemas', 'reviewed_commit', 'input_sha256', 'completion', ...(repairBundle ? ['repair'] : []), 'requested', 'files'];
  assertClosed(manifest, manifestKeys, 'bundle manifest');
  if (![1, 2, 3, 4].includes(manifest.schema) || !HEX40.test(manifest.reviewed_commit) || !Array.isArray(manifest.requested) || !Array.isArray(manifest.files)) throw new Error('bundle manifest identity');
  if (currentBundle && manifest.review_schema !== 5) throw new Error('current bundle reviewer schema identity');
  const planPath = safeLogical(manifest.plan_path);
  if (planPath !== manifest.plan_path || manifest.plan_view !== 'plan.review.md') throw new Error('bundle plan identity');
  assertClosed(manifest.reviewer_schemas, currentBundle ? ['primary'] : ['X', 'S'], 'bundle reviewer schemas');
  if (currentBundle ? manifest.reviewer_schemas.primary !== 'reviewer-output.primary.v5.schema.json' : manifest.reviewer_schemas.X !== 'reviewer-output.X.schema.json' || manifest.reviewer_schemas.S !== 'reviewer-output.S.schema.json') throw new Error('bundle reviewer schema paths');
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
  let reserved;
  if (currentBundle) {
    const schemaPath = manifest.reviewer_schemas.primary;
    const schema = fileRows.get(schemaPath);
    if (!schema || schema.mode !== '100444' || schema.bytes.toString() !== `${jcs(currentReviewerSchema())}\n`) throw new Error('bundle reviewer schema mismatch: primary v5');
    reserved = new Set(['plan.review.md', schemaPath]);
  } else {
    for (const leg of ['X', 'S']) {
      for (const version of [1, 2, 3]) {
        const suffix = version === 1 ? '' : `.v${version}`; const schemaPath = `reviewer-output.${leg}${suffix}.schema.json`; const schema = fileRows.get(schemaPath); const expected = `${jcs(reviewerSchema(leg, version))}\n`;
        if (!schema || schema.mode !== '100444' || schema.bytes.toString() !== expected) throw new Error(`bundle reviewer schema mismatch: ${leg} v${version}`);
      }
    }
    reserved = new Set(['plan.review.md', 'reviewer-output.X.schema.json', 'reviewer-output.S.schema.json', 'reviewer-output.X.v2.schema.json', 'reviewer-output.S.v2.schema.json', 'reviewer-output.X.v3.schema.json', 'reviewer-output.S.v3.schema.json']);
  }
  if (repairBundle) {
    assertClosed(manifest.repair, ['from_round_index', 'previous_plan_path', 'previous_input_sha256', 'current_input_sha256', 'targets_path', 'repair_targets_sha256'], 'bundle repair manifest');
    if (!Number.isInteger(manifest.repair.from_round_index) || manifest.repair.from_round_index < 1 || manifest.repair.previous_plan_path !== 'previous-plan.review.md' || manifest.repair.targets_path !== 'repair-targets.json') throw new Error('bundle repair manifest identity');
    digest(manifest.repair.previous_input_sha256, 'bundle repair previous input'); digest(manifest.repair.current_input_sha256, 'bundle repair current input'); digest(manifest.repair.repair_targets_sha256, 'bundle repair targets');
    const previousPlan = fileRows.get(manifest.repair.previous_plan_path); const targets = fileRows.get(manifest.repair.targets_path);
    if (!previousPlan || !targets || previousPlan.mode !== '100444' || targets.mode !== '100444') throw new Error('bundle repair artifacts');
    let transition; try { transition = JSON.parse(targets.bytes); } catch { throw new Error('bundle repair targets are not JSON'); }
    if (transition?.schema === 5) validateCurrentRepairTransition(transition); else validateRepairTransition(transition);
    if ((transition?.schema === 5) !== currentBundle) throw new Error('bundle repair and reviewer schema identity mismatch');
    if (targets.bytes.toString() !== `${jcs(transition)}\n` || sha256(previousPlan.bytes) !== manifest.repair.previous_input_sha256 || transition.previous_input_sha256 !== manifest.repair.previous_input_sha256 || transition.current_input_sha256 !== manifest.repair.current_input_sha256 || transition.repair_targets_sha256 !== manifest.repair.repair_targets_sha256 || manifest.input_sha256 !== manifest.repair.current_input_sha256) throw new Error('bundle repair artifact mismatch');
    reserved.add(manifest.repair.previous_plan_path); reserved.add(manifest.repair.targets_path);
  } else if (Object.hasOwn(manifest, 'repair')) throw new Error('non-repair bundle carries repair metadata');
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
  return { schema: manifest.schema, bundle_sha256: bundleSha256, manifest };
}

function validateReviewBundleTarget(bundle) {
  const root = path.resolve(REVIEW_ROOT); const candidate = path.resolve(bundle);
  if (candidate === path.parse(candidate).root) throw new Error('filesystem root cannot be a review bundle target');
  if (candidate === path.resolve(os.homedir())) throw new Error('home cannot be a review bundle target');
  if (candidate === root) throw new Error('review root cannot be a review bundle target');
  if (bundle !== candidate || path.dirname(candidate) !== root || !inside(root, candidate) || !UUID.test(path.basename(candidate))) throw new Error('review bundle path is outside the supported temporary review root');
  const rootStat = fs.lstatSync(root);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink() || fs.realpathSync(root) !== root || (rootStat.mode & 0o777) !== 0o700) throw new Error('review root is not a canonical owner-only directory');
  if (typeof process.getuid === 'function' && rootStat.uid !== process.getuid()) throw new Error('review root ownership mismatch');
  const bundleStat = fs.lstatSync(candidate);
  if (!bundleStat.isDirectory() || bundleStat.isSymbolicLink() || fs.realpathSync(candidate) !== candidate) throw new Error('review bundle path is not a canonical real directory');
  return { root: candidate, identity: { dev: bundleStat.dev, ino: bundleStat.ino } };
}

function validateReviewBundleOwnership(root) {
  const visit = (entry) => {
    const stat = fs.lstatSync(entry);
    if (stat.isSymbolicLink() || (!stat.isDirectory() && !stat.isFile())) throw new Error('review bundle contains an unsafe entry');
    if (typeof process.getuid === 'function' && stat.uid !== process.getuid()) throw new Error('review bundle ownership mismatch');
    if (stat.isDirectory()) for (const name of fs.readdirSync(entry)) visit(path.join(entry, name));
  };
  visit(root);
}

function restoreReviewBundleOwnerWrite(root) {
  const visit = (entry) => {
    const stat = fs.lstatSync(entry);
    if (stat.isSymbolicLink() || (!stat.isDirectory() && !stat.isFile())) throw new Error('review bundle changed before removal');
    if (typeof process.getuid === 'function' && stat.uid !== process.getuid()) throw new Error('review bundle ownership mismatch');
    if (stat.isDirectory()) {
      fs.chmodSync(entry, 0o700);
      for (const name of fs.readdirSync(entry)) visit(path.join(entry, name));
    } else fs.chmodSync(entry, 0o600);
  };
  visit(root);
}

export function destroyBundle({ bundle, expectedSha256 }) {
  digest(expectedSha256, 'expected bundle hash');
  const target = validateReviewBundleTarget(bundle);
  const verified = verifyBundle({ bundle: target.root, expectedSha256 });
  validateReviewBundleOwnership(target.root);
  const current = fs.lstatSync(target.root);
  if (current.dev !== target.identity.dev || current.ino !== target.identity.ino) throw new Error('review bundle changed during verification');
  restoreReviewBundleOwnerWrite(target.root);
  fs.rmSync(target.root, { recursive: true, force: false });
  if (fs.existsSync(target.root)) throw new Error('review bundle removal failed');
  return { schema: 1, bundle_sha256: verified.bundle_sha256, removed: true };
}

function validateRequestBundle(request, verified) {
  const manifest = verified.manifest;
  if (manifest.reviewed_commit !== request.reviewed_commit_or_head || manifest.input_sha256 !== request.input_sha256) throw new Error('request and bundle identity mismatch');
  const repairRequest = [3, 5].includes(request.schema) && request.review_mode === 'repair';
  const expectedManifestSchema = request.schema === 5 ? (repairRequest ? 4 : 3) : (repairRequest ? 2 : 1);
  if (manifest.schema !== expectedManifestSchema) throw new Error(repairRequest ? 'request and bundle repair mismatch' : 'non-repair request carries repair bundle');
  if (request.schema === 5 && manifest.review_schema !== 5) throw new Error('current request requires current reviewer schema bundle');
  if (repairRequest && (manifest.repair?.previous_input_sha256 !== request.previous_input_sha256 || manifest.repair?.current_input_sha256 !== request.input_sha256 || manifest.repair?.repair_targets_sha256 !== request.repair_targets_sha256 || manifest.repair?.from_round_index !== request.round_index - 1)) throw new Error('request and bundle repair mismatch');
  if (request.phase === 'draft') { if (manifest.completion !== null) throw new Error('draft request carries completion bundle'); }
  else {
    if (manifest.completion === null) throw new Error('completion request lacks completion bundle');
    const expected = { planned_at_commit: request.planned_at_commit, execution_base_commit: request.execution_base_commit, reviewed_head: request.reviewed_commit_or_head, diff_sha256: request.diff_sha256, acceptance_inventory_sha256: request.acceptance_inventory_sha256 };
    for (const [key, value] of Object.entries(expected)) if (manifest.completion[key] !== value) throw new Error(`request and bundle completion mismatch: ${key}`);
  }
}

function reviewerWorkspacePath(requestId, leg) {
  if (!UUID.test(requestId)) throw new Error('reviewer workspace request id');
  oneOf(leg, new Set(['X', 'S', 'primary']), 'reviewer workspace role');
  return path.join(REVIEW_WORK_ROOT, `${requestId}-${leg}`);
}

export function prepareReviewerWorkspace({ requestId, leg }) {
  const workspace = reviewerWorkspacePath(requestId, leg);
  if (!fs.existsSync(REVIEW_WORK_ROOT)) fs.mkdirSync(REVIEW_WORK_ROOT, { recursive: false, mode: 0o700 });
  const root = fs.lstatSync(REVIEW_WORK_ROOT);
  if (!root.isDirectory() || root.isSymbolicLink() || fs.realpathSync(REVIEW_WORK_ROOT) !== REVIEW_WORK_ROOT || (root.mode & 0o777) !== 0o700 || (typeof process.getuid === 'function' && root.uid !== process.getuid())) throw new Error('reviewer workspace root is unsafe');
  if (fs.existsSync(workspace)) throw new Error('reviewer workspace already exists');
  fs.mkdirSync(workspace, { mode: 0o700 });
  const cleanupToken = sha256(`${randomUUID()}\0${randomUUID()}`);
  const sentinel = { schema: 1, request_id: requestId, leg, cleanup_token: cleanupToken };
  fs.writeFileSync(path.join(workspace, '.docks-reviewer-workspace'), `${jcs(sentinel)}\n`, { flag: 'wx', mode: 0o600 });
  if (leg === 'primary') fs.writeFileSync(path.join(workspace, 'reviewer-output.primary.v5.schema.json'), `${jcs(currentReviewerSchema())}\n`, { flag: 'wx', mode: 0o444 });
  return { schema: 1, request_id: requestId, leg, workspace, cleanup_token: cleanupToken };
}

export function cleanupReviewerWorkspace({ requestId, leg, prepared }) {
  assertClosed(prepared, ['schema', 'request_id', 'leg', 'workspace', 'cleanup_token'], 'prepared reviewer workspace');
  const workspace = reviewerWorkspacePath(requestId, leg);
  if (prepared.schema !== 1 || prepared.request_id !== requestId || prepared.leg !== leg || prepared.workspace !== workspace) throw new Error('reviewer workspace identity mismatch');
  digest(prepared.cleanup_token, 'reviewer workspace cleanup token');
  const stat = fs.lstatSync(workspace);
  if (!stat.isDirectory() || stat.isSymbolicLink() || fs.realpathSync(workspace) !== workspace || (typeof process.getuid === 'function' && stat.uid !== process.getuid())) throw new Error('reviewer workspace is unsafe');
  const sentinelPath = path.join(workspace, '.docks-reviewer-workspace'); const sentinelStat = fs.lstatSync(sentinelPath);
  if (!sentinelStat.isFile() || sentinelStat.isSymbolicLink() || (sentinelStat.mode & 0o777) !== 0o600 || (typeof process.getuid === 'function' && sentinelStat.uid !== process.getuid())) throw new Error('reviewer workspace sentinel is unsafe');
  const sentinelText = fs.readFileSync(sentinelPath, 'utf8'); let sentinel; try { sentinel = JSON.parse(sentinelText); } catch { throw new Error('reviewer workspace sentinel is invalid'); }
  const expected = { schema: 1, request_id: requestId, leg, cleanup_token: prepared.cleanup_token };
  if (sentinelText !== `${jcs(sentinel)}\n` || jcs(sentinel) !== jcs(expected)) throw new Error('reviewer workspace sentinel mismatch');
  fs.rmSync(workspace, { recursive: true, force: false });
  return { schema: 1, request_id: requestId, leg, removed: true };
}

function reviewerPrompt(leg, request, bundle) {
  const requestBlock = `REQUEST_JCS_BEGIN\n${jcs(request)}\nREQUEST_JCS_END`;
  if (request.schema === 5) {
    const modeRules = request.review_mode === 'full'
      ? 'This is the full round-one review.'
      : 'This is the only repair review. Inspect only accepted repair targets and blocking regressions introduced by their repair; do not reopen unrelated decisions.';
    return `You are the single primary plan reviewer. Read only the sealed bundle and return typed evidence. Sealed bundle: ${path.resolve(bundle)}. Copy the request object exactly into ReviewerOutput.request.
Evaluate exactly these criteria: ${CURRENT_CRITERIA.join(', ')}. Each criterion needs pass, non_blocking_gap, or blocking_gap plus nonempty evidence. The verdict equals the strongest status. Every gap needs a matching finding; pass has no findings.
A blocking finding must name the exact user requirement, safety property, or execution step that would fail. Do not emit a numeric score or rubric.
${modeRules}
${requestBlock}`;
  }
  if (request.schema !== 3) return `You are the ${leg} independent plan reviewer. Read only the sealed bundle. Return findings only. Copy the request object into ReviewerOutput.request.\n${requestBlock}`;
  const modeRules = request.review_mode === 'full'
    ? 'This is a full review. Return at most five findings.'
    : 'This is a repair review. Inspect the accepted repair targets and their current-plan delta, plus blocking regressions introduced by those repairs. Return at most three findings. You may not reopen unrelated previously accepted design decisions.';
  return `You are the ${leg} independent plan reviewer. Read only the sealed bundle and return typed findings only. Sealed bundle: ${path.resolve(bundle)}. Copy the request object into ReviewerOutput.request.
Report only provable, actionable, unintentional defects with no unstated assumptions and proportionate rigor.
A blocking finding must identify the exact user requirement, safety property, or execution step that would otherwise fail.
Priority 2/3 or low-confidence findings are non-blocking follow-ups. verdict=not_ready requires at least one blocking finding.
Score is the exact weighted rubric sum: standalone executability 22, actionability 16, dependency order 12, evidence re-verification 10, goal coverage 12, executable acceptance 12, failure mode 10, assumption-to-question 6.
${modeRules}
${requestBlock}`;
}

export function buildReviewerArgv({ tool, bundle, reviewerWorkspace = null, model, effort, serviceTier = null, leg, request, priorAttempts = [] }) {
  validateRequest(request); validateRequestBundle(request, verifyBundle({ bundle, expectedSha256: request.bundle_sha256 }));
  oneOf(leg, request.schema === 5 ? new Set(['primary']) : new Set(['X', 'S']), request.schema === 5 ? 'role' : 'leg'); string(model, 'model'); string(effort, 'effort');
  if (request.schema === 5) {
    if (!Array.isArray(priorAttempts) || priorAttempts.length >= request.policy.candidates.length) throw new Error('reviewer candidate order is exhausted');
    if (priorAttempts.length > 0) {
      validateCurrentAttemptSequence(priorAttempts, request.policy);
      if (!CURRENT_FALLBACK_RESULTS.has(priorAttempts.at(-1).result) || priorAttempts.at(-1).output_started) throw new Error('next candidate requires an availability-only prior result');
    }
    const candidate = request.policy.candidates[priorAttempts.length];
    const launchServiceTier = tool === 'codex' ? (serviceTier ?? 'default') : null;
    if (request.policy.candidates.slice(priorAttempts.length + 1).some((later) => later.tool === tool && later.model === model && later.effort === effort && (later.service_tier ?? null) === launchServiceTier)) throw new Error('reviewer launch skipped the next candidate order');
    if (candidate.tool !== tool) throw new Error('reviewer launch does not match the candidate tool');
    if (candidate.model !== model) throw new Error('reviewer launch does not match the candidate model');
    if (candidate.effort !== effort) throw new Error('reviewer launch does not match the candidate effort');
    if (tool === 'codex' && candidate.service_tier !== (serviceTier ?? 'default')) throw new Error('reviewer service tier does not match the selected policy candidate');
  }
  const prompt = reviewerPrompt(leg, request, bundle);
  if (tool === 'codex') {
    const tier = serviceTier ?? 'default'; oneOf(tier, new Set(['default', 'fast']), 'reviewer service tier');
    const config = ['-c', `model_reasoning_effort=${effort}`, ...(tier === 'fast' ? ['-c', 'features.fast_mode=true', '-c', 'service_tier="fast"'] : ['-c', 'service_tier="default"'])];
    const suffix = request.schema === 1 ? '' : `.v${request.schema}`;
    let workdir = bundle; const isolation = [];
    if ([3, 5].includes(request.schema)) {
      if (reviewerWorkspace === null) throw new Error(`schema-${request.schema} Codex reviewer workspace is required`);
      assertClosed(reviewerWorkspace, ['schema', 'request_id', 'leg', 'workspace', 'cleanup_token'], 'reviewer workspace');
      if (reviewerWorkspace.schema !== 1 || reviewerWorkspace.request_id !== request.request_id || reviewerWorkspace.leg !== leg || reviewerWorkspace.workspace !== reviewerWorkspacePath(request.request_id, leg)) throw new Error('reviewer workspace mismatch');
      workdir = reviewerWorkspace.workspace;
      isolation.push('--ephemeral', '--ignore-user-config');
    }
    const schemaPath = request.schema === 5 ? path.join(bundle, 'reviewer-output.primary.v5.schema.json') : path.join(bundle, `reviewer-output.${leg}${suffix}.schema.json`);
    return ['exec', '-C', workdir, '--skip-git-repo-check', ...isolation, '-s', 'read-only', '-m', model, ...config, '--output-schema', schemaPath, '--', prompt];
  }
  if (tool === 'claude') {
    if (serviceTier !== null) throw new Error('reviewer service tier is Codex-only');
    return ['-p', '--permission-mode', 'plan', '--model', model, '--effort', effort, '--json-schema', jcs(request.schema === 5 ? currentReviewerSchema() : reviewerSchema(leg, request.schema)), '--output-format', 'json', '--', prompt];
  }
  throw new Error('reviewer tool must be codex or claude; relay is not supported');
}

export function classifyLeg({ leg, policy, waiver = null, decision = null, attempts = [], eligibleTierCount }) {
  oneOf(leg, new Set(['X', 'S']), 'leg'); validatePolicy(policy);
  if (waiver) return 'waived';
  if (leg === 'X' && (policy.cross_company_consent === 'never' || decision?.decision === 'deny')) return 'not_authorized';
  if (attempts.length > eligibleTierCount + (policy.schema === 1 ? 1 : 0)) throw new Error('attempt bound exceeded');
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

function validateOwnedRealDirectory(directory, label) {
  if (path.resolve(directory) !== directory) throw new Error(`${label} is not canonical`);
  const stat = fs.lstatSync(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink() || fs.realpathSync(directory) !== directory) throw new Error(`${label} is not a canonical real directory`);
  if (typeof process.getuid === 'function' && stat.uid !== process.getuid()) throw new Error(`${label} is not owned by the current user`);
  return directory;
}

function validateCompletionSentinelFile(sentinelPath) {
  let stat;
  try { stat = fs.lstatSync(sentinelPath); } catch (error) {
    if (error?.code === 'ENOENT') throw new Error('completion cleanup sentinel missing');
    throw error;
  }
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('completion cleanup sentinel is not a regular file');
  if ((stat.mode & 0o777) !== 0o600 || (typeof process.getuid === 'function' && stat.uid !== process.getuid())) throw new Error('completion cleanup sentinel ownership or mode is unsafe');
  return stat;
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
    validateOwnedRealDirectory(out, 'completion checkout');
    const privateGitDir = validateOwnedRealDirectory(path.join(out, '.git'), 'completion checkout Git directory');
    const tempHead = git(out, ['rev-parse', 'HEAD']).trim(); const sourceTree = git(before.repo_realpath, ['rev-parse', `${reviewedHead}^{tree}`]).trim(); const tempTree = git(out, ['rev-parse', 'HEAD^{tree}']).trim();
    if (tempHead !== reviewedHead || tempTree !== sourceTree) throw new Error('completion checkout head/tree mismatch');
    const cleanupToken = createHash('sha256').update(randomUUID()).update(randomUUID()).digest('hex');
    const sentinel = { schema: 1, request_id: requestId, original_repo: before.repo_realpath, plan_path: safeLogical(planPath), planned_at_commit: plannedAtCommit, execution_base_commit: executionBaseCommit, reviewed_head: reviewedHead, source_tree: sourceTree, cleanup_token: cleanupToken };
    const sentinelPath = path.join(privateGitDir, '.docks-plan-verify-sentinel');
    fs.writeFileSync(sentinelPath, `${jcs(sentinel)}\n`, { flag: 'wx', mode: 0o600 });
    validateCompletionSentinelFile(sentinelPath);
    if (git(out, ['status', '--porcelain=v1', '-z', '--untracked-files=all']).length !== 0) throw new Error('completion checkout is not clean after prepare');
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
  validateOwnedRealDirectory(out, 'completion checkout');
  const privateGitDir = validateOwnedRealDirectory(path.join(out, '.git'), 'completion checkout Git directory');
  const sentinelPath = path.join(privateGitDir, '.docks-plan-verify-sentinel');
  validateCompletionSentinelFile(sentinelPath);
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
  if (command === 'compatibility-evidence') {
    if (args.length !== 7) throw new Error('compatibility-evidence accepts repo reviewed-head plan-path planned-at execution-base authorization-id owner-message-sha256 only');
    const [repo, reviewedHead, planPath, plannedAtCommit, executionBaseCommit, authorizationId, ownerMessageSha256] = args;
    process.stdout.write(`${jcs(buildExecutionBaseCompatibilityApplication({ repo: path.resolve(repo), reviewedHead, planPath, plannedAtCommit, executionBaseCommit, authorizationId, ownerMessageSha256 }))}\n`); return;
  }
  if (command === 'compatibility-binding') {
    if (args.length !== 4) throw new Error('compatibility-binding accepts repo plan-path evidence-commit review-commit only');
    const [repo, planPath, evidenceCommit, reviewCommit] = args;
    process.stdout.write(`${jcs(buildExecutionBaseCompatibilityBindingApplication({ repo: path.resolve(repo), planPath, evidenceCommit, reviewCommit }))}\n`); return;
  }
  if (command === 'compatibility-prerequisite') {
    if (args.length !== 10) throw new Error('compatibility-prerequisite accepts repo plan-path finished-plan-path finished-plan-commit release-version evidence-commit compatibility-review-commit binding-commit authorization-id authorization-sha256 only');
    const [repo, planPath, finishedPlanPath, finishedPlanCommit, releaseVersion, evidenceCommit, compatibilityReviewCommit, bindingCommit, authorizationId, authorizationSha256] = args;
    process.stdout.write(`${jcs(buildDocksCompatibilityPrerequisiteApplication({ repo: path.resolve(repo), planPath, finishedPlanPath, finishedPlanCommit, releaseVersion, evidenceCommit, compatibilityReviewCommit, bindingCommit, authorizationId, authorizationSha256 }))}\n`); return;
  }
  if (command === 'execution-range') {
    if (args.length !== 5) throw new Error('execution-range accepts repo reviewed-head plan-path planned-at execution-base only');
    const [repo, reviewedHead, planPath, plannedAtCommit, executionBaseCommit] = args;
    process.stdout.write(`${jcs(validateExecutionRange({ repo: path.resolve(repo), reviewedHead, planPath, plannedAtCommit, executionBaseCommit }))}\n`); return;
  }
  if (command === 'execution-scope') {
    if (args.length !== 5) throw new Error('execution-scope accepts repo base head plan-path expected-allowed-paths-sha256 only');
    const [repo, base, head, planPath, expectedAllowedPathsSha256] = args;
    process.stdout.write(`${jcs(validateExecutionScope({ repo: path.resolve(repo), base, head, planPath, expectedAllowedPathsSha256 }))}\n`); return;
  }
  if (command === 'canonical-plan') { process.stdout.write(canonicalPlanView(fs.readFileSync(args[0]))); return; }
  if (command === 'schema') { process.stdout.write(`${jcs(reviewerSchema(args[0]))}\n`); return; }
  if (command === 'validate-reviewer') {
    const output = JSON.parse(fs.readFileSync(args[0], 'utf8')); const request = JSON.parse(fs.readFileSync(args[1], 'utf8'));
    validateReviewerOutput(output, request, args[2]); process.stdout.write('valid reviewer output\n'); return;
  }
  if (command === 'bundle') {
    const reviewSchema = args[0] === '--review-schema=5' ? (args.shift(), 5) : 3;
    const [repo, commit, plan, out, plannedAtCommit, executionBaseCommit, ...paths] = args; const completion = plannedAtCommit === '-' && executionBaseCommit === '-' ? {} : { plannedAtCommit, executionBaseCommit };
    process.stdout.write(`${jcs(sealBundle({ repo: path.resolve(repo), reviewedCommit: commit, planPath: plan, requestedPaths: paths, outDir: path.resolve(out), reviewSchema, ...completion }))}\n`); return;
  }
  if (command === 'bundle-repair') {
    const reviewSchema = args[0] === '--review-schema=5' ? (args.shift(), 5) : 3;
    if (args.length < 8) throw new Error('bundle-repair accepts [--review-schema=5] repo commit plan out previous-plan-file transition-file planned-at execution-base [paths...]');
    const [repo, commit, plan, out, previousPlanPath, transitionPath, plannedAtCommit, executionBaseCommit, ...paths] = args;
    const completion = plannedAtCommit === '-' && executionBaseCommit === '-' ? {} : { plannedAtCommit, executionBaseCommit };
    if ((plannedAtCommit === '-') !== (executionBaseCommit === '-')) throw new Error('bundle-repair completion identity must be all-or-none');
    const previousPlan = fs.readFileSync(previousPlanPath, 'utf8'); const transition = JSON.parse(fs.readFileSync(transitionPath, 'utf8'));
    process.stdout.write(`${jcs(sealBundle({ repo: path.resolve(repo), reviewedCommit: commit, planPath: plan, requestedPaths: paths, outDir: path.resolve(out), repair: { previousPlan, transition }, reviewSchema, ...completion }))}\n`); return;
  }
  if (command === 'verify-bundle') {
    const [bundle, expectedSha256 = null] = args; if (args.length < 1 || args.length > 2) throw new Error('verify-bundle accepts bundle [expectedSha256]'); process.stdout.write(`${jcs(verifyBundle({ bundle: path.resolve(bundle), expectedSha256 }))}\n`); return;
  }
  if (command === 'destroy-bundle') {
    const [bundle, expectedSha256] = args; if (args.length !== 2) throw new Error('destroy-bundle accepts bundle expectedSha256 only'); process.stdout.write(`${jcs(destroyBundle({ bundle, expectedSha256 }))}\n`); return;
  }
  if (command === 'completion-prepare') {
    const [repo, reviewedHead, requestId, planPath, plannedAtCommit, executionBaseCommit] = args; if (args.length !== 6) throw new Error('completion-prepare accepts repo reviewedHead requestId planPath plannedAtCommit executionBaseCommit only'); process.stdout.write(`${jcs(prepareCompletionCheckout({ repo: path.resolve(repo), reviewedHead, requestId, planPath, plannedAtCommit, executionBaseCommit }))}\n`); return;
  }
  if (command === 'completion-cleanup') {
    const [repo, requestId, preparedPath] = args; if (args.length !== 3) throw new Error('completion-cleanup accepts repo requestId preparedPath only'); const prepared = JSON.parse(fs.readFileSync(preparedPath, 'utf8'));
    process.stdout.write(`${jcs(cleanupCompletionCheckout({ repo: path.resolve(repo), requestId, prepared }))}\n`); return;
  }
  if (command === 'reviewer-workspace-prepare') {
    const [requestId, leg] = args; if (args.length !== 2) throw new Error('reviewer-workspace-prepare accepts requestId leg only');
    process.stdout.write(`${jcs(prepareReviewerWorkspace({ requestId, leg }))}\n`); return;
  }
  if (command === 'reviewer-workspace-cleanup') {
    const [requestId, leg, preparedPath] = args; if (args.length !== 3) throw new Error('reviewer-workspace-cleanup accepts requestId leg preparedPath only');
    const prepared = JSON.parse(fs.readFileSync(preparedPath, 'utf8'));
    process.stdout.write(`${jcs(cleanupReviewerWorkspace({ requestId, leg, prepared }))}\n`); return;
  }
  if (command === 'probe') {
    const [tool] = args; const result = spawnSync(tool, tool === 'codex' ? ['login', 'status'] : ['auth', 'status'], { encoding: 'utf8' });
    process.stdout.write(`${jcs({ available: !result.error && result.status === 0, exit_code: result.status ?? null })}\n`); return;
  }
  throw new Error('usage: review-policy.mjs compatibility-evidence|compatibility-binding|compatibility-prerequisite|execution-range|execution-scope|canonical-plan|schema|validate-reviewer|bundle|bundle-repair|verify-bundle|destroy-bundle|completion-prepare|completion-cleanup|reviewer-workspace-prepare|reviewer-workspace-cleanup|probe ...');
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try { run(); } catch (error) { console.error(`review-policy: ${error.message}`); process.exitCode = 1; }
}
