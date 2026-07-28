import { createHash } from 'node:crypto';
import path from 'node:path';

const HEX40 = /^[0-9a-f]{40}$/;
const HEX64 = /^[0-9a-f]{64}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
const EXCLUDED_FRONTMATTER = new Set([
  'updated',
  'status',
  'started_at',
  'in_review_since',
  'blocked_reason',
  'blocked_since',
  'assignee',
  'review_status',
  'ship_commit',
  'review_waivers',
  'execution_base_commit',
]);
const MACHINE_RECORD =
  /^(Bootstrap-review-record|Review-receipt|Completion-review-receipt|Review-orchestration-state|Review-orchestration-prepared-request|Review-orchestration-dispatch-commitment|Review-orchestration-controller-abort|Review-orchestration-abandonment): (\{.*\})$/;
const LEG_RESULTS = new Set([
  'passed',
  'waived',
  'not_authorized',
  'unavailable_auth',
  'unavailable_model',
  'timed_out',
  'platform_denied',
  'failed_unparseable',
  'unavailable_unknown',
]);
const ATTEMPT_RESULTS = new Set([
  'passed',
  'auth_failed',
  'model_unavailable',
  'deadline_exceeded',
  'platform_denied',
  'transient_transport',
  'nonzero_exit',
  'signaled',
  'unparseable',
]);
const SOURCES = new Set(['current_user', 'runtime_global', 'skill_default']);
const REVIEW_WORK_ROOT = '/tmp/docks-plan-review-run';

export function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function compareUtf16(a, b) {
  const aa = String(a);
  const bb = String(b);
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
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf)
    throw new Error('BOM is forbidden');
  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  if (/\r(?!\n)/.test(text)) throw new Error('CR-only newline is forbidden');
  if (/\uD800(?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(text))
    throw new Error('lone surrogate is forbidden');
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
    try {
      value = JSON.parse(text);
    } catch {
      throw new Error(`invalid quoted scalar: ${text}`);
    }
    if (typeof value !== 'string') throw new Error('quoted scalar must be a string');
    return value;
  }
  if (text.startsWith('[')) {
    let value;
    try {
      if (!text.endsWith(']')) throw new Error('unterminated');
      const inner = text.slice(1, -1).trim();
      value = inner === '' ? [] : inner.split(',').map((item) => parseScalar(item.trim()));
    } catch {
      throw new Error(`invalid flow array: ${text}`);
    }
    if (!Array.isArray(value) || value.some((v) => !['string', 'boolean', 'number'].includes(typeof v) && v !== null))
      throw new Error('flow arrays contain scalars only');
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
        try {
          parsed = JSON.parse(raw);
        } catch {
          throw new Error('review_waivers must be one-line strict JSON');
        }
        if (!Array.isArray(parsed) || jcs(parsed) !== raw.trim())
          throw new Error('review_waivers must be canonical JCS');
        frontmatter[key] = parsed;
      } else frontmatter[key] = parseScalar(raw);
      continue;
    }
    const values = [];
    while (i + 1 < end && /^ {2}- /.test(lines[i + 1])) {
      i += 1;
      values.push(parseScalar(lines[i].slice(4)));
    }
    if (values.some((v) => typeof v !== 'string')) throw new Error(`${key} block array must contain strings`);
    frontmatter[key] = values;
  }
  return {
    frontmatter,
    body: `${lines
      .slice(end + 1)
      .join('\n')
      .replace(/\n*$/, '')}\n`,
  };
}

export function canonicalPlanView(bytes) {
  const { frontmatter, body } = parsePlan(bytes);
  const kept = Object.fromEntries(Object.entries(frontmatter).filter(([key]) => !EXCLUDED_FRONTMATTER.has(key)));
  const counts = new Map();
  const records = new Map();
  let fence = null;
  const retained = [];
  for (const line of body.split('\n')) {
    const fenceMatch = /^( {0,3})(`{3,}|~{3,})(.*)$/.exec(line);
    if (fence === null && fenceMatch) {
      fence = { marker: fenceMatch[2][0], length: fenceMatch[2].length };
      retained.push(line);
      continue;
    }
    if (
      fence !== null &&
      fenceMatch &&
      fenceMatch[2][0] === fence.marker &&
      fenceMatch[2].length >= fence.length &&
      /^\s*$/.test(fenceMatch[3])
    ) {
      fence = null;
      retained.push(line);
      continue;
    }
    const record = fence === null ? MACHINE_RECORD.exec(line) : null;
    if (!record) {
      retained.push(line);
      continue;
    }
    const [, kind, payload] = record;
    const count = (counts.get(kind) || 0) + 1;
    counts.set(kind, count);
    if (count > 1) throw new Error(`duplicate ${kind}`);
    let parsed;
    try {
      parsed = JSON.parse(payload);
    } catch {
      throw new Error(`${kind} must be one-line JSON`);
    }
    if (jcs(parsed) !== payload) throw new Error(`${kind} must be compact JCS`);
    records.set(kind, parsed);
    if (kind === 'Review-orchestration-state') validateReviewOrchestrationState(parsed);
  }
  validateCanonicalOrchestrationFamily(records);
  return `${jcs(kept)}\n${retained.join('\n').replace(/\n*$/, '')}\n`;
}

function tableCells(line) {
  const text = line.trim();
  if (!text.startsWith('|') || !text.endsWith('|')) return null;
  const cells = [];
  let cell = '';
  let escaped = false;
  for (const ch of text.slice(1, -1)) {
    if (escaped) {
      cell += ch;
      escaped = false;
      continue;
    }
    if (ch === '\\') {
      escaped = true;
      continue;
    }
    if (ch === '|') {
      cells.push(cell.trim());
      cell = '';
    } else cell += ch;
  }
  if (escaped) cell += '\\';
  cells.push(cell.trim());
  return cells;
}

function uncode(value) {
  const text = value.trim();
  return text.startsWith('`') && text.endsWith('`') && text.length >= 2 ? text.slice(1, -1) : text;
}

export function acceptanceInventory(bytes) {
  const { body } = parsePlan(bytes);
  const lines = body.split('\n');
  const start = lines.findIndex((line) => /^## Acceptance criteria\s*$/.test(line));
  if (start < 0) throw new Error('acceptance criteria section missing');
  const section = lines.slice(
    start + 1,
    lines.findIndex((line, index) => index > start && /^## /.test(line)) < 0
      ? lines.length
      : lines.findIndex((line, index) => index > start && /^## /.test(line)),
  );
  const rows = section.map(tableCells).filter(Boolean);
  if (rows.length < 3) throw new Error('acceptance criteria must be a table');
  const header = rows[0].map((cell) => cell.toLowerCase());
  const idAt = header.indexOf('id');
  const commandAt = header.indexOf('command');
  const expectedAt = header.indexOf('expected');
  if (idAt < 0 || commandAt < 0 || expectedAt < 0 || !rows[1].every((cell) => /^:?-{3,}:?$/.test(cell)))
    throw new Error('acceptance table header');
  const criteria = [];
  const ids = new Set();
  for (const row of rows.slice(2)) {
    if (row.length !== header.length) throw new Error('acceptance table column mismatch');
    const id = uncode(row[idAt]);
    const command = uncode(row[commandAt]);
    const expected = uncode(row[expectedAt]);
    if (!/^A[1-9][0-9]*$/.test(id) || ids.has(id)) throw new Error('acceptance criterion id');
    string(command, 'acceptance criterion command');
    string(expected, 'acceptance criterion expected');
    ids.add(id);
    criteria.push({ id, command, expected });
  }
  if (criteria.length === 0) throw new Error('acceptance inventory must be nonempty');
  return { schema: 1, criteria };
}

function assertClosed(object, keys, label) {
  if (!object || typeof object !== 'object' || Array.isArray(object)) throw new Error(`${label} must be an object`);
  for (const key of Object.keys(object)) if (!keys.includes(key)) throw new Error(`${label} has unknown key ${key}`);
  for (const key of keys) if (!Object.hasOwn(object, key)) throw new Error(`${label} missing ${key}`);
}
function string(value, label) {
  if (typeof value !== 'string' || value.length === 0) throw new Error(`${label} must be non-empty`);
}
function oneOf(value, allowed, label) {
  if (!allowed.has(value)) throw new Error(`${label} is invalid`);
}
function digest(value, label) {
  if (!HEX64.test(value)) throw new Error(`${label} must be sha256`);
}
function iso(value, label) {
  if (!ISO.test(value) || Number.isNaN(Date.parse(value))) throw new Error(`${label} must be ISO datetime`);
}

function workflowCandidate(candidate, schema, label) {
  const base = ['company', 'tool', 'model', 'effort'];
  const keys = schema === 2 ? [...base, 'service_tier'] : base;
  const present = schema === 2 && Object.hasOwn(candidate ?? {}, 'service_tier') ? keys : base;
  assertClosed(candidate, present, label);
  oneOf(candidate.company, new Set(['openai', 'anthropic']), `${label} company`);
  oneOf(candidate.tool, new Set(['codex', 'claude']), `${label} tool`);
  if ((candidate.company === 'openai') !== (candidate.tool === 'codex'))
    throw new Error(`${label} company/tool mismatch`);
  string(candidate.model, `${label} model`);
  string(candidate.effort, `${label} effort`);
  if (Object.hasOwn(candidate, 'service_tier')) {
    if (schema !== 2 || candidate.tool !== 'codex' || candidate.service_tier !== 'fast')
      throw new Error(`${label} service_tier is invalid`);
  }
  return candidate.tool === 'codex'
    ? { ...candidate, service_tier: candidate.service_tier ?? 'default' }
    : { ...candidate };
}

function workflowSelector(candidate) {
  return `${candidate.tool}:${candidate.model}@${candidate.effort}${candidate.service_tier === 'fast' ? '+fast' : ''}`;
}

export function validateWorkflowModelRecord(record) {
  assertClosed(record, ['schema', 'orchestrator', 'reviewer', 'implementer', 'review'], 'workflow model record');
  if (![1, 2].includes(record.schema)) throw new Error('workflow model record schema');
  assertClosed(record.review, ['max_rounds', 'minimum_score'], 'workflow review');
  if (
    !Number.isInteger(record.review.minimum_score) ||
    record.review.minimum_score < 0 ||
    record.review.minimum_score > 100
  )
    throw new Error('workflow minimum_score');
  if (!Number.isInteger(record.review.max_rounds) || record.review.max_rounds < 1 || record.review.max_rounds > 10)
    throw new Error('workflow max_rounds');
  let fastCandidates = 0;
  const validated = { schema: record.schema, review: { ...record.review } };
  for (const role of ['orchestrator', 'reviewer', 'implementer']) {
    const value = record[role];
    assertClosed(value, ['candidates', 'selector'], `workflow ${role}`);
    if (!Array.isArray(value.candidates) || value.candidates.length === 0)
      throw new Error(`workflow ${role} candidates`);
    string(value.selector, `workflow ${role} selector`);
    const candidates = value.candidates.map((candidate, index) =>
      workflowCandidate(candidate, record.schema, `${role} candidate ${index + 1}`),
    );
    const identities = candidates.map(workflowSelector);
    if (new Set(identities).size !== identities.length) throw new Error(`duplicate ${role} candidate`);
    fastCandidates += candidates.filter((candidate) => candidate.service_tier === 'fast').length;
    let selected;
    if (value.selector.startsWith('profile:')) {
      if (!/^profile:[a-z0-9][a-z0-9-]*$/.test(value.selector)) throw new Error(`${role} selector is invalid`);
      selected = candidates[0];
    } else {
      if (!/^[a-z0-9-]+:[^@+]+@[a-z0-9-]+(?:\+fast)?$/.test(value.selector))
        throw new Error(`${role} selector is invalid`);
      const matches = candidates.filter((candidate) => workflowSelector(candidate) === value.selector);
      if (matches.length !== 1) throw new Error(`${role} selector does not identify exactly one candidate`);
      selected = matches[0];
    }
    validated[role] = {
      candidates: value.candidates.map((candidate) => ({ ...candidate })),
      selector: value.selector,
      selected,
    };
  }
  if (record.schema === 2 && fastCandidates === 0)
    throw new Error('workflow schema 2 requires at least one Fast candidate');
  return validated;
}

function reviewRecordSchema(request) {
  if ([5, 6].includes(request.policy?.schema)) return request.policy.schema;
  if (request.policy?.schema === 4) return 3;
  return request.policy?.schema === 3 ? 2 : 1;
}

export function validatePolicy(policy) {
  if ([5, 6].includes(policy?.schema)) return validateCurrentPolicy(policy);
  const baseKeys = ['schema', 'cross_company_consent', 'zero_reviewer_policy', 'orchestrator_preference'];
  const tierKeys = ['openai_tiers', 'anthropic_tiers'];
  if (policy?.schema === 1) assertClosed(policy, [...baseKeys, ...tierKeys, 'provenance'], 'policy');
  else if ([2, 3, 4].includes(policy?.schema))
    assertClosed(policy, [...baseKeys, 'minimum_score', 'max_rounds', ...tierKeys, 'provenance'], 'policy');
  else throw new Error('policy schema');
  oneOf(policy.cross_company_consent, new Set(['always', 'ask', 'never']), 'cross_company_consent');
  oneOf(policy.zero_reviewer_policy, new Set(['ask', 'proceed', 'block']), 'zero_reviewer_policy');
  oneOf(policy.orchestrator_preference, new Set(['auto', 'in_session', 'cli']), 'orchestrator_preference');
  if (policy.schema >= 2) {
    if (!Number.isInteger(policy.minimum_score) || policy.minimum_score < 0 || policy.minimum_score > 100)
      throw new Error('minimum_score');
    if (!Number.isInteger(policy.max_rounds) || policy.max_rounds < 1 || policy.max_rounds > 10)
      throw new Error('max_rounds');
  }
  for (const company of ['openai', 'anthropic']) {
    const tiers = policy[`${company}_tiers`];
    if (!Array.isArray(tiers) || tiers.length === 0 || (policy.schema >= 2 && tiers.length > 3))
      throw new Error(`${company}_tiers`);
    const candidates = new Set();
    for (const tier of tiers) {
      const tierFields =
        policy.schema >= 3 && company === 'openai'
          ? ['model', 'effort', 'service_tier', 'transports']
          : ['model', 'effort', 'transports'];
      assertClosed(tier, tierFields, 'tier');
      string(tier.model, 'model');
      string(tier.effort, 'effort');
      if (policy.schema >= 3 && company === 'openai')
        oneOf(tier.service_tier, new Set(['default', 'fast']), 'service_tier');
      if (
        !Array.isArray(tier.transports) ||
        tier.transports.length === 0 ||
        new Set(tier.transports).size !== tier.transports.length
      )
        throw new Error('tier transports');
      tier.transports.forEach((v) => {
        oneOf(v, new Set(['in_session', 'cli']), 'transport');
      });
      if (policy.schema >= 3 && company === 'openai' && tier.transports.some((transport) => transport !== 'cli'))
        throw new Error('tier-controlled OpenAI service tiers require cli transport');
      const candidate = `${tier.model}\0${tier.effort}\0${tier.service_tier ?? ''}`;
      if (policy.schema >= 2 && candidates.has(candidate)) throw new Error(`duplicate ${company}_tiers candidate`);
      candidates.add(candidate);
    }
  }
  const provenanceKeys = [
    ...baseKeys.slice(1),
    ...(policy.schema >= 2 ? ['minimum_score', 'max_rounds'] : []),
    ...tierKeys,
  ];
  assertClosed(policy.provenance, provenanceKeys, 'provenance');
  Object.values(policy.provenance).forEach((value) => {
    oneOf(value, SOURCES, 'provenance source');
  });
  return policy;
}

export function validateRequest(request) {
  const baseKeys = [
    'schema',
    'request_id',
    'phase',
    'lifecycle_intent',
    'reviewed_commit_or_head',
    'planned_at_commit',
    'execution_base_commit',
    'diff_sha256',
    'acceptance_inventory_sha256',
    'input_sha256',
    'bundle_sha256',
    'author',
    'policy',
    'policy_sha256',
  ];
  const convergenceKeys = ['review_mode', 'round_index', 'previous_input_sha256', 'repair_targets_sha256'];
  const orchestrationKeys = ['orchestration_series_id', 'orchestration_state_sha256'];
  assertClosed(
    request,
    [3, 5, 6].includes(request?.schema)
      ? [...baseKeys, ...convergenceKeys, ...(request.schema === 6 ? orchestrationKeys : [])]
      : baseKeys,
    'request',
  );
  if (request.schema !== reviewRecordSchema(request) || !UUID.test(request.request_id))
    throw new Error('request identity');
  oneOf(request.phase, new Set(['draft', 'completion']), 'phase');
  oneOf(request.lifecycle_intent, new Set(['none', 'start', 'schedule_fire', 'auto_execute']), 'lifecycle_intent');
  if (!HEX40.test(request.reviewed_commit_or_head)) throw new Error('reviewed commit');
  if (request.phase === 'completion') {
    for (const key of ['planned_at_commit', 'execution_base_commit'])
      if (!HEX40.test(request[key])) throw new Error(`completion request ${key}`);
    digest(request.diff_sha256, 'completion request diff');
    digest(request.acceptance_inventory_sha256, 'completion request acceptance inventory');
  } else if (
    request.planned_at_commit !== null ||
    request.execution_base_commit !== null ||
    request.diff_sha256 !== null ||
    request.acceptance_inventory_sha256 !== null
  )
    throw new Error('draft request carries completion identity');
  digest(request.input_sha256, 'input_sha256');
  digest(request.bundle_sha256, 'bundle_sha256');
  digest(request.policy_sha256, 'policy_sha256');
  assertClosed(request.author, ['company', 'tool', 'model', 'effort'], 'request author');
  oneOf(request.author.company, new Set(['openai', 'anthropic']), 'request author company');
  for (const key of ['tool', 'model', 'effort']) string(request.author[key], `request author ${key}`);
  validatePolicy(request.policy);
  if (sha256(jcs(request.policy)) !== request.policy_sha256) throw new Error('policy hash mismatch');
  if (request.schema === 6) {
    const candidate = request.policy.candidates[0];
    const candidateIdentity = {
      company: candidate.company,
      tool: candidate.tool,
      model: candidate.model,
      effort: candidate.effort,
    };
    if (jcs(candidateIdentity) !== jcs(request.author))
      throw new Error('schema-6 policy candidate must equal request author');
  }
  if ([3, 5, 6].includes(request.schema)) {
    oneOf(request.review_mode, new Set(['full', 'repair']), 'review_mode');
    const maximumRound = [5, 6].includes(request.schema) ? 2 : 10;
    if (!Number.isInteger(request.round_index) || request.round_index < 1 || request.round_index > maximumRound)
      throw new Error('round_index');
    if (request.review_mode === 'full') {
      if (request.round_index !== 1 || request.previous_input_sha256 !== null || request.repair_targets_sha256 !== null)
        throw new Error('full review must be round one without repair identity');
    } else {
      if ([5, 6].includes(request.schema) ? request.round_index !== 2 : request.round_index <= 1)
        throw new Error(
          [5, 6].includes(request.schema) ? 'repair review must be round two' : 'repair review requires a later round',
        );
      digest(request.previous_input_sha256, 'repair previous input');
      digest(request.repair_targets_sha256, 'repair targets');
      if (request.input_sha256 === request.previous_input_sha256)
        throw new Error('repair review requires changed input');
    }
  }
  if (request.schema === 6) {
    if (!UUID.test(request.orchestration_series_id)) throw new Error('request orchestration series identity');
    digest(request.orchestration_state_sha256, 'request orchestration state');
  }
  return request;
}

function validateFinding(finding, leg, ids, recordSchema = 1) {
  const baseKeys = ['id', 'severity', 'section', 'path', 'locator', 'defect', 'fix', 'evidence'];
  const convergenceKeys = ['priority', 'confidence', 'blocking', 'requirement'];
  assertClosed(finding, recordSchema === 3 ? [...baseKeys, ...convergenceKeys] : baseKeys, 'finding');
  if (!new RegExp(`^${leg}[1-9][0-9]*$`).test(finding.id) || ids.has(finding.id)) throw new Error('finding id');
  ids.add(finding.id);
  oneOf(finding.severity, new Set(['high', 'medium', 'low']), 'severity');
  for (const key of ['section', 'defect', 'fix', 'evidence']) string(finding[key], key);
  for (const key of ['path', 'locator'])
    if (finding[key] !== null && typeof finding[key] !== 'string') throw new Error(key);
  if (recordSchema === 3) {
    if (!Number.isInteger(finding.priority) || finding.priority < 0 || finding.priority > 3)
      throw new Error('finding priority');
    if (!Number.isInteger(finding.confidence) || finding.confidence < 0 || finding.confidence > 1)
      throw new Error('finding confidence');
    if (typeof finding.blocking !== 'boolean') throw new Error('finding blocking');
    string(finding.requirement, 'finding requirement');
    if ((finding.priority >= 2 || finding.confidence === 0) && finding.blocking)
      throw new Error('low-priority or low-confidence finding cannot block');
  }
}

function validateDecision(decision, request, expectedKind = null) {
  if (decision === null) return;
  const common = ['schema', 'kind', 'decision', 'actor', 'reason', 'at', 'request_id', 'input_sha256'];
  assertClosed(decision, common, 'decision');
  if (
    decision.schema !== 1 ||
    decision.request_id !== request.request_id ||
    decision.input_sha256 !== request.input_sha256
  )
    throw new Error('decision request mismatch');
  oneOf(decision.kind, new Set(['x_consent', 'zero_reviewer']), 'decision kind');
  if (expectedKind && decision.kind !== expectedKind) throw new Error(`decision must be ${expectedKind}`);
  oneOf(
    decision.decision,
    decision.kind === 'x_consent' ? new Set(['allow', 'deny']) : new Set(['proceed', 'block']),
    'decision',
  );
  string(decision.actor, 'decision actor');
  string(decision.reason, 'decision reason');
  iso(decision.at, 'decision at');
}

function validateAttempt(attempt, recordSchema = 1, company = null) {
  const keys = [
    'schema',
    'model',
    'effort',
    ...(recordSchema >= 2 && company === 'openai' ? ['service_tier'] : []),
    'transport',
    'started',
    'output_started',
    'result',
    'exit_code',
    'signal',
    'child_id',
    'denial_source',
    'retry_cause',
    'timeout_mode',
    'timeout_seconds',
    'reason',
    'stdout_sha256',
    'stderr_sha256',
  ];
  assertClosed(attempt, keys, 'attempt');
  if (attempt.schema !== recordSchema) throw new Error('attempt schema');
  string(attempt.model, 'attempt model');
  string(attempt.effort, 'attempt effort');
  oneOf(attempt.transport, new Set(['in_session', 'cli']), 'attempt transport');
  if (recordSchema >= 2 && company === 'openai')
    oneOf(attempt.service_tier, new Set(['default', 'fast']), 'attempt service_tier');
  if (typeof attempt.started !== 'boolean' || typeof attempt.output_started !== 'boolean')
    throw new Error('attempt booleans');
  oneOf(attempt.result, ATTEMPT_RESULTS, 'attempt result');
  if (
    attempt.exit_code !== null &&
    (!Number.isInteger(attempt.exit_code) || attempt.exit_code < -2147483648 || attempt.exit_code > 2147483647)
  )
    throw new Error('attempt exit code');
  for (const key of ['signal', 'child_id'])
    if (typeof attempt[key] !== 'string' && attempt[key] !== null) throw new Error(`attempt ${key}`);
  string(attempt.reason, 'attempt reason');
  if (attempt.denial_source !== null)
    oneOf(attempt.denial_source, new Set(['sandbox', 'managed_policy', 'runtime_policy']), 'denial source');
  if (attempt.retry_cause !== null)
    oneOf(
      attempt.retry_cause,
      new Set(['transport_EAGAIN', 'transport_ETIMEDOUT', 'transport_ECONNRESET']),
      'retry cause',
    );
  if (attempt.timeout_mode !== null)
    oneOf(attempt.timeout_mode, new Set(['gnu_timeout', 'orchestrator_tool']), 'timeout mode');
  if (attempt.timeout_seconds !== 600) throw new Error('timeout seconds');
  for (const key of ['stdout_sha256', 'stderr_sha256']) if (attempt[key] !== null) digest(attempt[key], key);
  if (attempt.started && (!attempt.child_id || attempt.timeout_mode === null))
    throw new Error('started attempt requires child_id and timeout mode');
  if (
    !attempt.started &&
    (attempt.child_id !== null ||
      attempt.output_started ||
      attempt.exit_code !== null ||
      attempt.signal !== null ||
      attempt.timeout_mode !== null ||
      attempt.stdout_sha256 !== null ||
      attempt.stderr_sha256 !== null)
  )
    throw new Error('unstarted attempt carries process evidence');
  if (!attempt.started && !['platform_denied', 'auth_failed', 'model_unavailable'].includes(attempt.result))
    throw new Error('invalid unstarted attempt result');
  if (attempt.started && (attempt.stdout_sha256 === null || attempt.stderr_sha256 === null))
    throw new Error('started attempt requires output hashes');
  if (
    attempt.result === 'passed' &&
    (!attempt.started ||
      !attempt.output_started ||
      attempt.exit_code !== 0 ||
      attempt.signal !== null ||
      attempt.denial_source !== null ||
      attempt.retry_cause !== null ||
      attempt.timeout_mode === null)
  )
    throw new Error('invalid passed attempt');
  if (
    attempt.result === 'platform_denied' &&
    (attempt.output_started ||
      attempt.denial_source === null ||
      attempt.retry_cause !== null ||
      (attempt.exit_code !== null && attempt.signal !== null))
  )
    throw new Error('invalid platform denial attempt');
  if (
    attempt.result === 'transient_transport' &&
    (!attempt.started ||
      attempt.output_started ||
      attempt.retry_cause === null ||
      attempt.denial_source !== null ||
      attempt.exit_code !== null ||
      attempt.signal !== null)
  )
    throw new Error('invalid transient attempt');
  if (
    attempt.result === 'deadline_exceeded' &&
    (!attempt.started || attempt.timeout_mode === null || attempt.retry_cause !== null)
  )
    throw new Error('invalid deadline attempt');
  if (
    attempt.result === 'nonzero_exit' &&
    (!attempt.started || attempt.exit_code === null || attempt.exit_code === 0 || attempt.signal !== null)
  )
    throw new Error('invalid nonzero attempt');
  if (attempt.result === 'signaled' && (!attempt.started || !attempt.signal || attempt.exit_code !== null))
    throw new Error('invalid signaled attempt');
  if (
    attempt.result === 'unparseable' &&
    (!attempt.started || !attempt.output_started || attempt.exit_code !== 0 || attempt.signal !== null)
  )
    throw new Error('invalid unparseable attempt');
  if (
    ['auth_failed', 'model_unavailable'].includes(attempt.result) &&
    attempt.started &&
    (attempt.exit_code === null || attempt.exit_code === 0 || attempt.signal !== null)
  )
    throw new Error(`invalid ${attempt.result} attempt`);
  if (attempt.result === 'deadline_exceeded' && (attempt.exit_code === null) === (attempt.signal === null))
    throw new Error('deadline attempt requires exactly one exit or signal');
  if (!['platform_denied', 'transient_transport'].includes(attempt.result) && attempt.denial_source !== null)
    throw new Error('unexpected denial source');
  if (attempt.result !== 'transient_transport' && attempt.retry_cause !== null)
    throw new Error('unexpected retry cause');
}

function companyForLeg(authorCompany, leg) {
  oneOf(authorCompany, new Set(['openai', 'anthropic']), 'review author company');
  return leg === 'S' ? authorCompany : authorCompany === 'openai' ? 'anthropic' : 'openai';
}

function validateAttemptSequence(attempts, policy, company) {
  if (attempts.length === 0) return 0;
  const transport = attempts[0].transport;
  if (policy.orchestrator_preference !== 'auto' && transport !== policy.orchestrator_preference)
    throw new Error('attempt transport violates orchestrator preference');
  if (attempts.some((attempt) => attempt.transport !== transport))
    throw new Error('attempt transport changed within leg');
  const tiers = policy[`${company}_tiers`].filter((tier) => tier.transports.includes(transport));
  const attemptLimit = tiers.length + (policy.schema === 1 ? 1 : 0);
  if (tiers.length === 0 || attempts.length > attemptLimit) throw new Error('raw leg attempt bound');
  const recordSchema = policy.schema === 4 ? 3 : policy.schema === 3 ? 2 : 1;
  if (policy.schema >= 2) {
    let tier = 0;
    for (let i = 0; i < attempts.length; i += 1) {
      const attempt = attempts[i];
      validateAttempt(attempt, recordSchema, company);
      if (
        !tiers[tier] ||
        attempt.model !== tiers[tier].model ||
        attempt.effort !== tiers[tier].effort ||
        (policy.schema >= 3 && company === 'openai' && attempt.service_tier !== tiers[tier].service_tier)
      )
        throw new Error('attempt tier order mismatch');
      if (attempt.result === 'model_unavailable') {
        tier += 1;
        if (i < attempts.length - 1 && !tiers[tier]) throw new Error('attempt continued past tier list');
      } else if (i !== attempts.length - 1) throw new Error('attempt after terminal result');
    }
    return tiers.length;
  }
  let tier = 0;
  let retryUsed = false;
  let expectRetry = false;
  for (let i = 0; i < attempts.length; i += 1) {
    const attempt = attempts[i];
    validateAttempt(attempt, recordSchema, company);
    if (!tiers[tier] || attempt.model !== tiers[tier].model || attempt.effort !== tiers[tier].effort)
      throw new Error('attempt tier order mismatch');
    if (expectRetry) expectRetry = false;
    if (attempt.result === 'transient_transport') {
      if (retryUsed || i === attempts.length - 1) throw new Error('invalid transient retry order');
      retryUsed = true;
      expectRetry = true;
      continue;
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
  if (!Array.isArray(waiver.legs) || waiver.legs.length === 0 || new Set(waiver.legs).size !== waiver.legs.length)
    throw new Error('waiver legs');
  const normalized = [...waiver.legs].sort((a, b) => ['X', 'S'].indexOf(a) - ['X', 'S'].indexOf(b));
  normalized.forEach((leg) => {
    oneOf(leg, new Set(['X', 'S']), 'waiver leg');
  });
  if (jcs(waiver.legs) !== jcs(normalized)) throw new Error('waiver legs must be normalized');
  string(waiver.actor, 'waiver actor');
  string(waiver.reason, 'waiver reason');
  iso(waiver.at, 'waiver at');
  return waiver;
}

export function validateRawLeg(raw, request, leg, { expectedWaiver = null } = {}) {
  const keys = [
    'schema',
    'leg',
    'request',
    'result',
    'attempts',
    'selected',
    'reviewer_output',
    'findings',
    'findings_sha256',
    'severity_totals',
    'waiver',
    'waiver_sha256',
    'decision_evidence',
    'reason',
  ];
  const recordSchema = reviewRecordSchema(request);
  assertClosed(raw, keys, 'raw leg');
  if (raw.schema !== recordSchema || raw.leg !== leg || jcs(raw.request) !== jcs(request))
    throw new Error('raw leg request mismatch');
  oneOf(raw.result, LEG_RESULTS, 'leg result');
  if (!Array.isArray(raw.attempts)) throw new Error('raw leg attempts');
  const company = companyForLeg(request.author.company, leg);
  const eligibleTierCount = validateAttemptSequence(raw.attempts, request.policy, company);
  const selectedKeys =
    recordSchema >= 2 && company === 'openai'
      ? ['model', 'effort', 'service_tier', 'transport']
      : ['model', 'effort', 'transport'];
  if (raw.selected !== null) {
    assertClosed(raw.selected, selectedKeys, 'selected');
    string(raw.selected.model, 'selected model');
    string(raw.selected.effort, 'selected effort');
    if (selectedKeys.includes('service_tier'))
      oneOf(raw.selected.service_tier, new Set(['default', 'fast']), 'selected service_tier');
    oneOf(raw.selected.transport, new Set(['in_session', 'cli']), 'selected transport');
  }
  if (!Array.isArray(raw.findings)) throw new Error('raw findings');
  const ids = new Set();
  raw.findings.forEach((finding) => {
    validateFinding(finding, leg, ids, recordSchema);
  });
  if (raw.reviewer_output !== null) {
    const reviewerOutputKeys = [
      'verdict',
      'score',
      ...(recordSchema === 3 ? ['rubric'] : []),
      'confirmations',
      'structured_output_sha256',
    ];
    assertClosed(raw.reviewer_output, reviewerOutputKeys, 'raw reviewer output');
    oneOf(raw.reviewer_output.verdict, new Set(['ready', 'not_ready']), 'raw reviewer verdict');
    if (
      !Number.isInteger(raw.reviewer_output.score) ||
      raw.reviewer_output.score < 0 ||
      raw.reviewer_output.score > 100
    )
      throw new Error('raw reviewer score');
    if (!Array.isArray(raw.reviewer_output.confirmations)) throw new Error('raw reviewer confirmations');
    raw.reviewer_output.confirmations.forEach((value) => {
      string(value, 'raw reviewer confirmation');
    });
    digest(raw.reviewer_output.structured_output_sha256, 'structured output hash');
    const structured = {
      schema: recordSchema,
      leg,
      request,
      verdict: raw.reviewer_output.verdict,
      score: raw.reviewer_output.score,
      ...(recordSchema === 3 ? { rubric: raw.reviewer_output.rubric } : {}),
      findings: raw.findings,
      confirmations: raw.reviewer_output.confirmations,
    };
    validateReviewerOutput(structured, request, leg);
    if (raw.reviewer_output.structured_output_sha256 !== sha256(jcs(structured)))
      throw new Error('structured output hash mismatch');
  }
  assertClosed(raw.severity_totals, ['high', 'medium', 'low'], 'severity totals');
  for (const value of Object.values(raw.severity_totals))
    if (!Number.isInteger(value) || value < 0) throw new Error('severity total');
  const totals = { high: 0, medium: 0, low: 0 };
  raw.findings.forEach((finding) => {
    totals[finding.severity] += 1;
  });
  if (jcs(totals) !== jcs(raw.severity_totals)) throw new Error('severity totals mismatch');
  if (raw.result === 'passed') {
    digest(raw.findings_sha256, 'findings hash');
    if (raw.findings_sha256 !== sha256(jcs([...raw.findings].sort((a, b) => compareUtf16(a.id, b.id)))))
      throw new Error('findings hash mismatch');
  } else if (raw.findings.length || raw.findings_sha256 !== null) throw new Error('non-passed leg carries findings');
  if (leg === 'S' && raw.decision_evidence !== null) throw new Error('S leg cannot carry consent decision');
  if (leg === 'X') {
    if (request.policy.cross_company_consent === 'always' && raw.decision_evidence !== null)
      throw new Error('standing consent requires null decision evidence');
    if (request.policy.cross_company_consent === 'never' && raw.result !== 'not_authorized' && raw.result !== 'waived')
      throw new Error('X cannot run when consent is never');
    if (request.policy.cross_company_consent === 'ask' && raw.result !== 'waived') {
      validateDecision(raw.decision_evidence, request, 'x_consent');
      if (raw.result === 'not_authorized' && raw.decision_evidence?.decision !== 'deny')
        throw new Error('not_authorized requires deny evidence');
      if (raw.result !== 'not_authorized' && raw.decision_evidence?.decision !== 'allow')
        throw new Error('X attempt requires allow evidence');
    }
  }
  if (raw.result === 'passed') {
    const last = raw.attempts.at(-1);
    const expectedSelected = {
      model: last?.model,
      effort: last?.effort,
      ...(selectedKeys.includes('service_tier') ? { service_tier: last?.service_tier } : {}),
      transport: last?.transport,
    };
    if (
      raw.selected === null ||
      raw.reviewer_output === null ||
      last?.result !== 'passed' ||
      jcs(raw.selected) !== jcs(expectedSelected) ||
      raw.reason !== null ||
      raw.waiver !== null
    )
      throw new Error('invalid passed leg');
  } else if (raw.selected !== null || raw.reviewer_output !== null)
    throw new Error('non-passed leg cannot select reviewer output');
  if (raw.result === 'waived') {
    if (
      raw.waiver === null ||
      raw.attempts.length ||
      raw.findings.length ||
      raw.reason !== null ||
      raw.decision_evidence !== null
    )
      throw new Error('invalid waived leg');
    validateWaiverObject(raw.waiver, request.phase, request.input_sha256);
    digest(raw.waiver_sha256, 'waiver_sha256');
    if (raw.waiver_sha256 !== sha256(jcs(raw.waiver))) throw new Error('waiver hash mismatch');
    if (!raw.waiver.legs.includes(leg)) throw new Error('waiver does not cover leg');
    if (expectedWaiver === null || jcs(raw.waiver) !== jcs(expectedWaiver))
      throw new Error('waiver is not the exact current snapshot');
  } else if (raw.waiver !== null || raw.waiver_sha256 !== null) throw new Error('non-waived leg carries waiver');
  if (raw.result === 'not_authorized') {
    if (leg !== 'X' || raw.attempts.length || raw.findings.length || raw.reason !== null)
      throw new Error('invalid not_authorized leg');
    if (request.policy.cross_company_consent === 'always') throw new Error('standing consent cannot be not_authorized');
    if (request.policy.cross_company_consent === 'never' && raw.decision_evidence !== null)
      throw new Error('configured never requires null decision evidence');
  }
  if (!['passed', 'waived', 'not_authorized'].includes(raw.result)) {
    string(raw.reason, 'terminal leg reason');
    const classified = classifyLeg({
      leg,
      policy: request.policy,
      decision: raw.decision_evidence,
      attempts: raw.attempts,
      eligibleTierCount,
    });
    if (classified !== raw.result) throw new Error(`leg result mismatch: expected ${classified}`);
  } else if (raw.result !== 'waived' && raw.reason !== null)
    throw new Error('successful/authorization leg reason must be null');
  return raw;
}

export function validateReconciliation(reconciliation, findings) {
  assertClosed(reconciliation, ['accepted', 'rejected'], 'reconciliation');
  if (!Array.isArray(reconciliation.accepted) || !Array.isArray(reconciliation.rejected))
    throw new Error('reconciliation arrays');
  const known = new Set(findings.map((finding) => finding.id));
  const used = new Set();
  for (const id of reconciliation.accepted) {
    if (!known.has(id) || used.has(id)) throw new Error('accepted finding id');
    used.add(id);
  }
  for (const row of reconciliation.rejected) {
    assertClosed(row, ['id', 'reason'], 'rejected finding');
    if (!known.has(row.id) || used.has(row.id)) throw new Error('rejected finding id');
    string(row.reason, 'rejection reason');
    used.add(row.id);
  }
  if (used.size !== known.size) throw new Error('reconciliation is not an exact partition');
  return reconciliation;
}

function validateFindingEvidence(finding, rawByLeg, allowPrimary) {
  assertClosed(
    finding,
    ['id', 'source', 'severity', 'path', 'locator', 'defect', 'fix', 'reproduction'],
    'finding evidence',
  );
  string(finding.id, 'finding evidence id');
  oneOf(finding.source, new Set(['X', 'S', 'primary']), 'finding source');
  if (finding.source === 'primary' && !allowPrimary) throw new Error('draft reproduction cannot use primary source');
  oneOf(finding.severity, new Set(['high', 'medium', 'low']), 'finding evidence severity');
  for (const key of ['path', 'locator'])
    if (finding[key] !== null && typeof finding[key] !== 'string') throw new Error(`finding evidence ${key}`);
  string(finding.defect, 'finding defect');
  string(finding.fix, 'finding fix');
  assertClosed(finding.reproduction, ['method', 'command', 'exit_code', 'evidence_sha256'], 'reproduction');
  oneOf(finding.reproduction.method, new Set(['read', 'command']), 'reproduction method');
  digest(finding.reproduction.evidence_sha256, 'reproduction evidence');
  if (
    finding.reproduction.method === 'read' &&
    (finding.reproduction.command !== null || finding.reproduction.exit_code !== null)
  )
    throw new Error('read reproduction carries command evidence');
  if (finding.reproduction.method === 'command') {
    string(finding.reproduction.command, 'reproduction command');
    if (!Number.isInteger(finding.reproduction.exit_code)) throw new Error('command reproduction exit code');
  }
  if (finding.source !== 'primary') {
    const raw = rawByLeg[finding.source];
    const source = raw.findings.find((candidate) => candidate.id === finding.id);
    if (!source) throw new Error('reproduced id not present in raw leg');
    for (const key of ['severity', 'path', 'locator', 'defect', 'fix'])
      if (jcs(finding[key]) !== jcs(source[key])) throw new Error(`reproduced ${key} mismatch`);
  }
}

function validateReproduced(reproduced, X, S, allowPrimary) {
  if (!Array.isArray(reproduced)) throw new Error('reproduced must be array');
  const ids = new Set();
  for (const finding of reproduced) {
    validateFindingEvidence(finding, { X, S }, allowPrimary);
    if (ids.has(finding.id)) throw new Error('duplicate reproduced id');
    ids.add(finding.id);
  }
  return reproduced;
}

function validateAcceptedReproduced(X, S, reproduced) {
  const ids = new Set(reproduced.map((finding) => finding.id));
  for (const persisted of [X, S])
    for (const id of persisted.reconciliation.accepted)
      if (!ids.has(id)) throw new Error('accepted finding was not reproduced');
}

function validateAcceptance(value) {
  assertClosed(
    value,
    ['criterion_id', 'command', 'expected', 'exit_code', 'actual_sha256', 'met'],
    'acceptance evidence',
  );
  string(value.criterion_id, 'criterion id');
  string(value.command, 'acceptance command');
  string(value.expected, 'acceptance expected');
  if (!Number.isInteger(value.exit_code) || typeof value.met !== 'boolean') throw new Error('acceptance result');
  digest(value.actual_sha256, 'acceptance output hash');
}

export function validateAcceptanceInventory(value) {
  assertClosed(value, ['schema', 'criteria'], 'acceptance inventory');
  if (value.schema !== 1 || !Array.isArray(value.criteria) || value.criteria.length === 0)
    throw new Error('acceptance inventory must be nonempty');
  const ids = new Set();
  for (const criterion of value.criteria) {
    assertClosed(criterion, ['id', 'command', 'expected'], 'acceptance inventory criterion');
    if (!/^A[1-9][0-9]*$/.test(criterion.id) || ids.has(criterion.id))
      throw new Error('acceptance inventory criterion id');
    string(criterion.command, 'acceptance inventory command');
    string(criterion.expected, 'acceptance inventory expected');
    ids.add(criterion.id);
  }
  return value;
}

function validateAcceptanceEvidence(evidence, inventory) {
  validateAcceptanceInventory(inventory);
  if (!Array.isArray(evidence) || evidence.length !== inventory.criteria.length)
    throw new Error('acceptance evidence must exactly cover inventory');
  evidence.forEach((row, index) => {
    validateAcceptance(row);
    const criterion = inventory.criteria[index];
    if (row.criterion_id !== criterion.id || row.command !== criterion.command || row.expected !== criterion.expected)
      throw new Error('acceptance evidence order or criterion mismatch');
  });
}

function validateCi(value) {
  assertClosed(value, ['command', 'exit_code', 'first_failure', 'output_sha256'], 'CI evidence');
  string(value.command, 'CI command');
  if (!Number.isInteger(value.exit_code)) throw new Error('CI exit code');
  digest(value.output_sha256, 'CI output hash');
  if (value.exit_code === 0 && value.first_failure !== null) throw new Error('passing CI carries failure');
  if (value.exit_code !== 0) string(value.first_failure, 'CI first failure');
}

function reviewerMeetsPolicy(raw, policy) {
  return (
    raw.reviewer_output?.verdict === 'ready' &&
    (policy.schema === 1 || raw.reviewer_output.score >= policy.minimum_score)
  );
}

export function deriveCompletionVerdict(primary, inventory, X, S) {
  validatePrimary(primary, inventory);
  if ([X, S].some((leg) => leg?.result === 'passed' && !reviewerMeetsPolicy(leg, leg.request.policy)))
    return 'regressed';
  if (
    primary.ci.exit_code !== 0 ||
    primary.regressions.length > 0 ||
    primary.findings.some((finding) => finding.severity === 'high')
  )
    return 'regressed';
  if (primary.goal_met === 'yes' && primary.acceptance.every((criterion) => criterion.met)) return 'passed';
  return 'partial';
}

function validatePrimary(value, inventory) {
  assertClosed(
    value,
    ['goal_met', 'findings', 'acceptance', 'ci', 'regressions', 'followups'],
    'primary completion evidence',
  );
  oneOf(value.goal_met, new Set(['yes', 'partial', 'no']), 'goal_met');
  if (
    !Array.isArray(value.findings) ||
    !Array.isArray(value.acceptance) ||
    !Array.isArray(value.regressions) ||
    !Array.isArray(value.followups)
  )
    throw new Error('primary arrays');
  const empty = { findings: [] };
  const ids = new Set();
  for (const finding of value.findings) {
    validateFindingEvidence(finding, { X: empty, S: empty }, true);
    if (finding.source !== 'primary' || ids.has(finding.id)) throw new Error('primary finding id/source');
    ids.add(finding.id);
  }
  validateAcceptanceEvidence(value.acceptance, inventory);
  validateCi(value.ci);
  value.regressions.forEach((item) => {
    string(item, 'regression');
  });
  value.followups.forEach((item) => {
    string(item, 'followup');
  });
  return value;
}

function validatePersistedLeg(value, request, leg, context) {
  assertClosed(value, ['request', 'raw', 'reconciliation'], 'persisted leg');
  if (jcs(value.request) !== jcs(request)) throw new Error('persisted request mismatch');
  validateRawLeg(value.raw, request, leg, context);
  validateReconciliation(value.reconciliation, value.raw.findings);
}

function validateOutcome(X, S, policy, decisionEvidence, outcome, eligible = null) {
  const passed = [X, S].filter((leg) => leg.result === 'passed').length;
  let expected;
  let shouldBeEligible;
  const ready = [X, S].filter((leg) => leg.result === 'passed').every((leg) => reviewerMeetsPolicy(leg, policy));
  if (passed === 2) {
    expected = 'dual';
    shouldBeEligible = ready;
    if (decisionEvidence !== null) throw new Error('dual outcome cannot carry zero-review decision');
  } else if (passed === 1) {
    expected = 'single';
    shouldBeEligible = ready;
    if (decisionEvidence !== null) throw new Error('single outcome cannot carry zero-review decision');
  } else if (policy.zero_reviewer_policy === 'proceed') {
    expected = 'zero_degraded';
    shouldBeEligible = true;
    if (decisionEvidence !== null) throw new Error('configured proceed requires null decision');
  } else if (policy.zero_reviewer_policy === 'block') {
    expected = 'blocked';
    shouldBeEligible = false;
    if (decisionEvidence !== null) throw new Error('configured block requires null decision');
  } else {
    if (decisionEvidence === null) throw new Error('zero-review ask requires decision evidence');
    validateDecision(decisionEvidence, X.request, 'zero_reviewer');
    expected = decisionEvidence.decision === 'proceed' ? 'zero_degraded' : 'blocked';
    shouldBeEligible = decisionEvidence.decision === 'proceed';
  }
  if (outcome !== expected) throw new Error(`outcome mismatch: expected ${expected}`);
  if (eligible !== null && eligible !== shouldBeEligible) throw new Error('pre_execution_eligible mismatch');
}

export function validateDraftRunResult(result, { waivers = [] } = {}) {
  if (result?.schema === 6) return validateCurrentReviewRunResult(result, { waivers });
  if (result?.schema === 5) return validateCurrentReviewRunResult(result, { waivers });
  assertClosed(
    result,
    ['schema', 'kind', 'request', 'X', 'S', 'reproduced', 'decision_evidence', 'outcome', 'pre_execution_eligible'],
    'draft run result',
  );
  if (result.schema !== reviewRecordSchema(result.request) || result.kind !== 'draft')
    throw new Error('draft run kind');
  validateRequest(result.request);
  if (result.request.phase !== 'draft') throw new Error('draft run phase');
  const normalized = validateWaivers(waivers, 'draft', result.request.input_sha256);
  const waiverFor = (leg) => normalized.find((waiver) => waiver.legs.includes(leg)) || null;
  validateRawLeg(result.X, result.request, 'X', { expectedWaiver: waiverFor('X') });
  validateRawLeg(result.S, result.request, 'S', { expectedWaiver: waiverFor('S') });
  validateReproduced(result.reproduced, result.X, result.S, false);
  validateOutcome(
    result.X,
    result.S,
    result.request.policy,
    result.decision_evidence,
    result.outcome,
    result.pre_execution_eligible,
  );
  return result;
}

function validateRepairTarget(target) {
  assertClosed(target, ['id', 'source', 'defect', 'fix', 'reproduction'], 'repair target');
  string(target.id, 'repair target id');
  oneOf(target.source, new Set(['X', 'S']), 'repair target source');
  string(target.defect, 'repair target defect');
  string(target.fix, 'repair target fix');
  assertClosed(
    target.reproduction,
    ['method', 'command', 'exit_code', 'evidence_sha256'],
    'repair target reproduction',
  );
  oneOf(target.reproduction.method, new Set(['read', 'command']), 'repair target reproduction method');
  digest(target.reproduction.evidence_sha256, 'repair target reproduction evidence');
  if (
    target.reproduction.method === 'read' &&
    (target.reproduction.command !== null || target.reproduction.exit_code !== null)
  )
    throw new Error('read repair target carries command evidence');
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
    if (!Array.isArray(value.accepted) || !Array.isArray(value.rejected))
      throw new Error('repair reconciliation arrays');
    const used = new Set();
    let previousAccepted = null;
    for (const id of value.accepted) {
      string(id, 'repair accepted finding id');
      if (used.has(id) || accepted.has(id) || (previousAccepted !== null && compareUtf16(previousAccepted, id) >= 0))
        throw new Error('repair accepted finding ids must be unique and sorted');
      used.add(id);
      accepted.set(id, leg);
      previousAccepted = id;
    }
    let previousRejected = null;
    for (const row of value.rejected) {
      assertClosed(row, ['id', 'reason'], 'repair rejected finding');
      string(row.id, 'repair rejected finding id');
      string(row.reason, 'repair rejection reason');
      if (
        used.has(row.id) ||
        accepted.has(row.id) ||
        (previousRejected !== null && compareUtf16(previousRejected, row.id) >= 0)
      )
        throw new Error('repair rejected finding ids must be unique and sorted');
      used.add(row.id);
      previousRejected = row.id;
    }
  }
  return accepted;
}

function validateRepairTransition(transition) {
  assertClosed(
    transition,
    [
      'schema',
      'from_round_index',
      'previous_input_sha256',
      'current_input_sha256',
      'reconciliation',
      'targets',
      'repair_targets_sha256',
    ],
    'repair transition',
  );
  if (
    transition.schema !== 1 ||
    !Number.isInteger(transition.from_round_index) ||
    transition.from_round_index < 1 ||
    transition.from_round_index >= 10
  )
    throw new Error('repair transition identity');
  digest(transition.previous_input_sha256, 'repair previous input');
  digest(transition.current_input_sha256, 'repair current input');
  if (transition.previous_input_sha256 === transition.current_input_sha256)
    throw new Error('repair transition requires changed input');
  const accepted = validateRepairReconciliation(transition.reconciliation);
  if (!Array.isArray(transition.targets) || transition.targets.length === 0)
    throw new Error('repair targets must be nonempty');
  const ids = new Set();
  let previous = null;
  for (const target of transition.targets) {
    validateRepairTarget(target);
    if (ids.has(target.id) || (previous !== null && compareUtf16(previous, target.id) >= 0))
      throw new Error('repair targets must be unique and sorted');
    if (accepted.get(target.id) !== target.source) throw new Error('repair target is not accepted by its source leg');
    ids.add(target.id);
    previous = target.id;
  }
  if (ids.size !== accepted.size || [...accepted.keys()].some((id) => !ids.has(id)))
    throw new Error('repair targets must equal accepted finding ids');
  digest(transition.repair_targets_sha256, 'repair targets hash');
  const expected = sha256(jcs({ schema: 1, reconciliation: transition.reconciliation, targets: transition.targets }));
  if (transition.repair_targets_sha256 !== expected) throw new Error('repair target hash mismatch');
  return transition;
}

export function validateReviewSeries(series, { waivers = [] } = {}) {
  if (series?.schema === 6) return validateCurrentReviewSeries(series, { waivers });
  if (series?.schema === 5) return validateCurrentReviewSeries(series, { waivers });
  assertClosed(
    series,
    ['schema', 'policy_sha256', 'initial_input_sha256', 'current_input_sha256', 'rounds', 'repairs'],
    'review series',
  );
  if (series.schema !== 3 || !Array.isArray(series.rounds) || series.rounds.length === 0)
    throw new Error('review series identity');
  digest(series.policy_sha256, 'review series policy');
  digest(series.initial_input_sha256, 'review series initial input');
  digest(series.current_input_sha256, 'review series current input');
  const policy = series.rounds[0]?.request?.policy;
  const kind = series.rounds[0]?.kind;
  oneOf(kind, new Set(['draft', 'completion']), 'review series run kind');
  const validateRound = kind === 'draft' ? validateDraftRunResult : validateCompletionRunResult;
  validatePolicy(policy);
  if (policy.schema !== 4 || series.policy_sha256 !== sha256(jcs(policy)))
    throw new Error('review series policy mismatch');
  if (series.rounds.length > policy.max_rounds) throw new Error('review series exceeds lifetime max_rounds');
  if (!Array.isArray(series.repairs) || series.repairs.length !== series.rounds.length - 1)
    throw new Error('review series repair count mismatch');
  let previousInput = null;
  for (let index = 0; index < series.rounds.length; index += 1) {
    const round = series.rounds[index];
    const expectedIndex = index + 1;
    if (round?.request?.round_index !== expectedIndex) throw new Error('review series rounds must be contiguous');
    if (expectedIndex === 1) {
      if (round.request.review_mode !== 'full') throw new Error('review series round one must be full');
    } else {
      if (round.request.review_mode !== 'repair') throw new Error('review series later rounds must be repair');
      if (round.request.previous_input_sha256 !== previousInput)
        throw new Error('review series previous input mismatch');
      const transition = validateRepairTransition(series.repairs[index - 1]);
      if (
        transition.from_round_index !== expectedIndex - 1 ||
        transition.previous_input_sha256 !== previousInput ||
        transition.current_input_sha256 !== round.request.input_sha256 ||
        transition.repair_targets_sha256 !== round.request.repair_targets_sha256
      )
        throw new Error('review series repair transition mismatch');
      const prior = series.rounds[index - 1];
      const reproduced = new Map(prior.reproduced.map((finding) => [finding.id, repairTargetFromEvidence(finding)]));
      for (const leg of ['X', 'S']) validateReconciliation(transition.reconciliation[leg], prior[leg].findings);
      for (const target of transition.targets) {
        const source = reproduced.get(target.id);
        if (!source || jcs(source) !== jcs(target))
          throw new Error('repair target was not exactly reproduced in the prior round');
      }
    }
    if (round.request.policy_sha256 !== series.policy_sha256 || jcs(round.request.policy) !== jcs(policy))
      throw new Error('review series policy drift');
    if (round.kind !== kind) throw new Error('review series run kind drift');
    validateRound(round);
    previousInput = round.request.input_sha256;
  }
  if (
    series.rounds[0].request.input_sha256 !== series.initial_input_sha256 ||
    previousInput !== series.current_input_sha256
  )
    throw new Error('review series input identity mismatch');
  return series;
}

export function validateCompletionRunResult(result, { waivers = [] } = {}) {
  if (result?.schema === 6) return validateCurrentReviewRunResult(result, { waivers });
  if (result?.schema === 5) return validateCurrentReviewRunResult(result, { waivers });
  assertClosed(
    result,
    [
      'schema',
      'kind',
      'request',
      'plan_input_sha256',
      'diff_sha256',
      'acceptance_inventory',
      'acceptance_inventory_sha256',
      'X',
      'S',
      'reproduced',
      'decision_evidence',
      'outcome',
      'primary',
      'completion_verdict',
    ],
    'completion run result',
  );
  if (result.schema !== reviewRecordSchema(result.request) || result.kind !== 'completion')
    throw new Error('completion run kind');
  validateRequest(result.request);
  if (result.request.phase !== 'completion' || result.request.lifecycle_intent !== 'none')
    throw new Error('completion request phase/intent');
  if (result.plan_input_sha256 !== result.request.input_sha256 || result.diff_sha256 !== result.request.diff_sha256)
    throw new Error('completion plan or diff input mismatch');
  digest(result.diff_sha256, 'completion diff');
  validateAcceptanceInventory(result.acceptance_inventory);
  if (
    result.acceptance_inventory_sha256 !== sha256(jcs(result.acceptance_inventory)) ||
    result.acceptance_inventory_sha256 !== result.request.acceptance_inventory_sha256
  )
    throw new Error('completion acceptance inventory mismatch');
  const normalized = validateWaivers(waivers, 'completion', result.request.input_sha256);
  const waiverFor = (leg) => normalized.find((waiver) => waiver.legs.includes(leg)) || null;
  validateRawLeg(result.X, result.request, 'X', { expectedWaiver: waiverFor('X') });
  validateRawLeg(result.S, result.request, 'S', { expectedWaiver: waiverFor('S') });
  validateReproduced(result.reproduced, result.X, result.S, true);
  validatePrimary(result.primary, result.acceptance_inventory);
  validateOutcome(result.X, result.S, result.request.policy, result.decision_evidence, result.outcome);
  if (
    result.completion_verdict !==
    deriveCompletionVerdict(result.primary, result.acceptance_inventory, result.X, result.S)
  )
    throw new Error('completion verdict mismatch');
  return result;
}

function validateExpectedPolicy(receipt, expectedPolicy) {
  if (expectedPolicy === null) return;
  validatePolicy(expectedPolicy);
  if (jcs(receipt.policy) !== jcs(expectedPolicy) || receipt.policy_sha256 !== sha256(jcs(expectedPolicy)))
    throw new Error('receipt resolved policy mismatch');
}

export function validateDraftReceipt(
  receipt,
  expectedInput = null,
  { waivers = [], expectedPolicy = null, orchestration = null } = {},
) {
  if (receipt?.schema === 6)
    return validateCurrentReviewReceipt(receipt, expectedInput, { waivers, expectedPolicy, orchestration });
  if (receipt?.schema === 5) return validateCurrentReviewReceipt(receipt, expectedInput, { waivers, expectedPolicy });
  const keys = [
    'schema',
    'phase',
    'request',
    'input_sha256',
    'reviewed_commit',
    'author',
    'policy',
    'policy_sha256',
    'X',
    'S',
    'reproduced',
    'decision_evidence',
    'outcome',
    'pre_execution_eligible',
    'reviewed_at',
  ];
  assertClosed(receipt, keys, 'draft receipt');
  if (receipt.schema !== reviewRecordSchema(receipt.request) || receipt.phase !== 'draft')
    throw new Error('draft receipt phase');
  validateRequest(receipt.request);
  if (
    receipt.input_sha256 !== receipt.request.input_sha256 ||
    receipt.reviewed_commit !== receipt.request.reviewed_commit_or_head
  )
    throw new Error('draft receipt input mismatch');
  if (expectedInput && receipt.input_sha256 !== expectedInput) throw new Error('stale draft receipt');
  assertClosed(receipt.author, ['company', 'tool', 'model', 'effort'], 'author');
  oneOf(receipt.author.company, new Set(['openai', 'anthropic']), 'author company');
  for (const key of ['tool', 'model', 'effort']) string(receipt.author[key], `author ${key}`);
  if (jcs(receipt.author) !== jcs(receipt.request.author)) throw new Error('receipt author mismatch');
  if (jcs(receipt.policy) !== jcs(receipt.request.policy) || receipt.policy_sha256 !== receipt.request.policy_sha256)
    throw new Error('receipt policy mismatch');
  validateExpectedPolicy(receipt, expectedPolicy);
  const normalizedWaivers = validateWaivers(waivers, receipt.request.phase, receipt.request.input_sha256);
  const waiverFor = (leg) => normalizedWaivers.find((waiver) => waiver.legs.includes(leg)) || null;
  validatePersistedLeg(receipt.X, receipt.request, 'X', { expectedWaiver: waiverFor('X') });
  validatePersistedLeg(receipt.S, receipt.request, 'S', { expectedWaiver: waiverFor('S') });
  validateReproduced(receipt.reproduced, receipt.X.raw, receipt.S.raw, false);
  validateAcceptedReproduced(receipt.X, receipt.S, receipt.reproduced);
  validateOutcome(
    receipt.X.raw,
    receipt.S.raw,
    receipt.policy,
    receipt.decision_evidence,
    receipt.outcome,
    receipt.pre_execution_eligible,
  );
  iso(receipt.reviewed_at, 'reviewed_at');
  return receipt;
}

export function validateDraftReviewReuse(input) {
  const normalized = { waivers: [], orchestration: null, ...input };
  assertClosed(
    normalized,
    ['receipt', 'expectedInput', 'expectedPolicy', 'waivers', 'orchestration'],
    'draft review reuse',
  );
  digest(normalized.expectedInput, 'draft review reuse input');
  validatePolicy(normalized.expectedPolicy);
  if (normalized.receipt?.schema === 6)
    return validateDraftReceipt(normalized.receipt, normalized.expectedInput, {
      expectedPolicy: normalized.expectedPolicy,
      waivers: normalized.waivers,
      orchestration: normalized.orchestration,
    });
  return validateDraftReceipt(normalized.receipt, normalized.expectedInput, {
    expectedPolicy: normalized.expectedPolicy,
    waivers: normalized.waivers,
  });
}

export function validateCompletionReceipt(
  receipt,
  expected = {},
  { waivers = [], expectedPolicy = null, orchestration = null } = {},
) {
  if (receipt?.schema === 6)
    return validateCurrentReviewReceipt(receipt, expected, { waivers, expectedPolicy, orchestration });
  if (receipt?.schema === 5) return validateCurrentReviewReceipt(receipt, expected, { waivers, expectedPolicy });
  const keys = [
    'schema',
    'phase',
    'request',
    'planned_at_commit',
    'execution_base_commit',
    'reviewed_head',
    'diff_sha256',
    'plan_input_sha256',
    'acceptance_inventory',
    'acceptance_inventory_sha256',
    'author',
    'policy',
    'policy_sha256',
    'X',
    'S',
    'reproduced',
    'decision_evidence',
    'primary',
    'completion_verdict',
    'outcome',
    'reviewed_at',
  ];
  assertClosed(receipt, keys, 'completion receipt');
  if (receipt.schema !== reviewRecordSchema(receipt.request) || receipt.phase !== 'completion')
    throw new Error('completion receipt phase');
  validateRequest(receipt.request);
  if (
    receipt.request.phase !== 'completion' ||
    receipt.request.lifecycle_intent !== 'none' ||
    receipt.reviewed_head !== receipt.request.reviewed_commit_or_head ||
    receipt.plan_input_sha256 !== receipt.request.input_sha256 ||
    receipt.planned_at_commit !== receipt.request.planned_at_commit ||
    receipt.execution_base_commit !== receipt.request.execution_base_commit ||
    receipt.diff_sha256 !== receipt.request.diff_sha256
  )
    throw new Error('completion receipt request mismatch');
  if (
    !HEX40.test(receipt.planned_at_commit) ||
    !HEX40.test(receipt.execution_base_commit) ||
    !HEX40.test(receipt.reviewed_head)
  )
    throw new Error('completion commit');
  digest(receipt.diff_sha256, 'completion receipt diff');
  validateAcceptanceInventory(receipt.acceptance_inventory);
  if (
    receipt.acceptance_inventory_sha256 !== sha256(jcs(receipt.acceptance_inventory)) ||
    receipt.acceptance_inventory_sha256 !== receipt.request.acceptance_inventory_sha256
  )
    throw new Error('completion acceptance inventory mismatch');
  if (jcs(receipt.author) !== jcs(receipt.request.author)) throw new Error('completion author mismatch');
  if (jcs(receipt.policy) !== jcs(receipt.request.policy) || receipt.policy_sha256 !== receipt.request.policy_sha256)
    throw new Error('completion policy mismatch');
  validateExpectedPolicy(receipt, expectedPolicy);
  for (const [key, value] of Object.entries(expected))
    if (key !== 'review_status' && value !== undefined && jcs(receipt[key]) !== jcs(value))
      throw new Error(`stale completion receipt ${key}`);
  const normalized = validateWaivers(waivers, 'completion', receipt.request.input_sha256);
  const waiverFor = (leg) => normalized.find((waiver) => waiver.legs.includes(leg)) || null;
  validatePersistedLeg(receipt.X, receipt.request, 'X', { expectedWaiver: waiverFor('X') });
  validatePersistedLeg(receipt.S, receipt.request, 'S', { expectedWaiver: waiverFor('S') });
  validateReproduced(receipt.reproduced, receipt.X.raw, receipt.S.raw, true);
  validateAcceptedReproduced(receipt.X, receipt.S, receipt.reproduced);
  validatePrimary(receipt.primary, receipt.acceptance_inventory);
  validateOutcome(receipt.X.raw, receipt.S.raw, receipt.policy, receipt.decision_evidence, receipt.outcome);
  if (
    receipt.completion_verdict !==
    deriveCompletionVerdict(receipt.primary, receipt.acceptance_inventory, receipt.X.raw, receipt.S.raw)
  )
    throw new Error('completion verdict mismatch');
  if (expected.review_status !== undefined && expected.review_status !== receipt.completion_verdict)
    throw new Error('completion review_status mismatch');
  iso(receipt.reviewed_at, 'completion reviewed_at');
  return receipt;
}

export function validateReviewerOutput(output, request, leg) {
  if (request?.schema === 6) {
    if (leg !== 'primary') throw new Error('current reviewer role must be primary');
    return validateCurrentReviewerOutput(output, request);
  }
  if (request?.schema === 5) {
    if (leg !== 'primary') throw new Error('current reviewer role must be primary');
    return validateCurrentReviewerOutput(output, request);
  }
  const recordSchema = reviewRecordSchema(request);
  assertClosed(
    output,
    [
      'schema',
      'leg',
      'request',
      'verdict',
      'score',
      ...(recordSchema === 3 ? ['rubric'] : []),
      'findings',
      'confirmations',
    ],
    'reviewer output',
  );
  if (output.schema !== recordSchema || output.leg !== leg || jcs(output.request) !== jcs(request))
    throw new Error('reviewer envelope mismatch');
  validateRequest(output.request);
  oneOf(output.verdict, new Set(['ready', 'not_ready']), 'verdict');
  if (!Number.isInteger(output.score) || output.score < 0 || output.score > 100) throw new Error('score');
  if (!Array.isArray(output.findings) || !Array.isArray(output.confirmations)) throw new Error('reviewer arrays');
  const ids = new Set();
  output.findings.forEach((finding) => {
    validateFinding(finding, leg, ids, recordSchema);
  });
  output.confirmations.forEach((v) => {
    string(v, 'confirmation');
  });
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

export function validateWaivers(waivers, phase, inputSha) {
  if (!Array.isArray(waivers)) throw new Error('waivers must be array');
  const claimed = new Set();
  const normalized = waivers.map((waiver) => {
    assertClosed(waiver, ['phase', 'input_sha256', 'legs', 'actor', 'reason', 'at'], 'waiver');
    oneOf(waiver.phase, new Set(['draft', 'completion']), 'waiver phase');
    digest(waiver.input_sha256, 'waiver input');
    if (!Array.isArray(waiver.legs) || waiver.legs.length === 0 || new Set(waiver.legs).size !== waiver.legs.length)
      throw new Error('waiver legs');
    const legs = [...waiver.legs].sort((a, b) => ['X', 'S'].indexOf(a) - ['X', 'S'].indexOf(b));
    legs.forEach((leg) => {
      oneOf(leg, new Set(['X', 'S']), 'waiver leg');
      const key = `${waiver.phase}:${waiver.input_sha256}:${leg}`;
      if (claimed.has(key)) throw new Error('duplicate waiver');
      claimed.add(key);
    });
    string(waiver.actor, 'waiver actor');
    string(waiver.reason, 'waiver reason');
    iso(waiver.at, 'waiver at');
    return { ...waiver, legs };
  });
  return phase && inputSha
    ? normalized.filter((waiver) => waiver.phase === phase && waiver.input_sha256 === inputSha)
    : normalized;
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

// Legacy classification context.
//
// Five plan records on disk declare `schema: 6` while carrying the schema-5
// policy shape: `fallback: 'availability_only'`, the three-entry default
// candidate chain, and all-four-`skill_default` provenance. That is drifted
// reviewer-selection metadata, not a receipt defect, and it should not force the
// whole family to quarantine.
//
// The narrowing is dynamically scoped rather than threaded: `validateCurrentPolicy`
// is reached from 17 call sites in this module, and `validateLegacyOrchestrationFamily`
// runs before both receipt validators with no options bag, so an options
// parameter reclassifies nothing. Only code running inside
// `withLegacyClassification` sees the narrowing; every ordinary caller, including
// the release binder, keeps the unmodified rule.
//
// The accepted chain is its own frozen literal, deliberately NOT
// `CURRENT_CANDIDATES`. For a schema-6 policy the schema-5 branch below is
// skipped entirely, so `validateCurrentCandidate` never runs on these entries and
// this constant is the only thing binding them. Reusing the live roster would
// silently re-quarantine every affected record the moment a model is swapped.
const LEGACY_DRIFTED_SCHEMA6_CANDIDATES = Object.freeze([
  Object.freeze({ company: 'openai', tool: 'codex', model: 'gpt-5.6-sol', effort: 'high', service_tier: 'default' }),
  Object.freeze({ company: 'anthropic', tool: 'claude', model: 'fable', effort: 'high' }),
  Object.freeze({ company: 'anthropic', tool: 'claude', model: 'opus', effort: 'xhigh' }),
]);
const LEGACY_DRIFTED_SCHEMA6_PROVENANCE = Object.freeze({
  role: 'skill_default',
  fallback: 'skill_default',
  max_rounds: 'skill_default',
  candidates: 'skill_default',
});

let legacyClassificationDepth = 0;

export function withLegacyClassification(fn) {
  legacyClassificationDepth += 1;
  try {
    return fn();
  } finally {
    legacyClassificationDepth -= 1;
  }
}

function isDriftedLegacySchema6Policy(policy) {
  return (
    policy?.fallback === 'availability_only' &&
    Array.isArray(policy.candidates) &&
    jcs(policy.candidates) === jcs(LEGACY_DRIFTED_SCHEMA6_CANDIDATES) &&
    jcs(policy.provenance) === jcs(LEGACY_DRIFTED_SCHEMA6_PROVENANCE)
  );
}

function validateCurrentCandidate(candidate, label = 'current candidate') {
  const keys =
    candidate?.tool === 'codex'
      ? ['company', 'tool', 'model', 'effort', 'service_tier']
      : ['company', 'tool', 'model', 'effort'];
  assertClosed(candidate, keys, label);
  oneOf(candidate.company, new Set(['openai', 'anthropic']), `${label} company`);
  oneOf(candidate.tool, new Set(['codex', 'claude']), `${label} tool`);
  if ((candidate.company === 'openai') !== (candidate.tool === 'codex'))
    throw new Error(`${label} company/tool mismatch`);
  string(candidate.model, `${label} model`);
  string(candidate.effort, `${label} effort`);
  if (candidate.tool === 'codex' && candidate.service_tier !== 'default') throw new Error(`${label} service_tier`);
  return candidate;
}

export function validateCurrentPolicy(policy) {
  assertClosed(policy, ['schema', 'role', 'fallback', 'max_rounds', 'candidates', 'provenance'], 'current policy');
  if (![5, 6].includes(policy.schema)) throw new Error('current policy schema');
  if (policy.role !== 'primary') throw new Error('current policy role');
  if (policy.max_rounds !== 2) throw new Error('current policy max_rounds must be exactly 2');
  assertClosed(policy.provenance, ['role', 'fallback', 'max_rounds', 'candidates'], 'current policy provenance');
  Object.values(policy.provenance).forEach((value) => {
    oneOf(value, SOURCES, 'current policy provenance source');
  });
  if (policy.schema === 5) {
    if (policy.fallback !== 'availability_only') throw new Error('current policy fallback');
    if (!Array.isArray(policy.candidates) || ![1, 3].includes(policy.candidates.length))
      throw new Error('current policy candidates must be the default chain or one pinned candidate');
    policy.candidates.forEach((candidate, index) => {
      validateCurrentCandidate(candidate, `current candidate ${index + 1}`);
      if (!CURRENT_CANDIDATES.some((allowed) => jcs(allowed) === jcs(candidate)))
        throw new Error('current policy candidate is not eligible');
    });
    if (policy.candidates.length === 3 && jcs(policy.candidates) !== jcs(CURRENT_CANDIDATES))
      throw new Error('current policy candidate order mismatch');
    if (policy.candidates.length === 1 && policy.provenance.candidates !== 'current_user')
      throw new Error('a pinned current candidate requires current_user provenance');
    return policy;
  }
  if (legacyClassificationDepth > 0 && isDriftedLegacySchema6Policy(policy)) return policy;
  if (policy.fallback !== 'none') throw new Error('schema-6 current policy fallback must be none');
  if (!Array.isArray(policy.candidates) || policy.candidates.length !== 1)
    throw new Error('schema-6 current policy requires exactly one runtime candidate');
  validateCurrentCandidate(policy.candidates[0], 'schema-6 current candidate');
  const expectedProvenance = {
    role: 'skill_default',
    fallback: 'skill_default',
    max_rounds: 'skill_default',
    candidates: 'runtime_global',
  };
  if (jcs(policy.provenance) !== jcs(expectedProvenance)) throw new Error('schema-6 current policy provenance');
  return policy;
}

function validateCurrentFinding(finding, ids) {
  assertClosed(
    finding,
    ['id', 'criterion', 'status', 'section', 'path', 'locator', 'defect', 'fix', 'evidence'],
    'current finding',
  );
  if (!/^P[1-9][0-9]*$/.test(finding.id) || ids.has(finding.id)) throw new Error('current finding id');
  ids.add(finding.id);
  oneOf(finding.criterion, new Set(CURRENT_CRITERIA), 'current finding criterion');
  oneOf(finding.status, CURRENT_GAP_STATUSES, 'current finding status');
  for (const key of ['section', 'defect', 'fix', 'evidence']) string(finding[key], `current finding ${key}`);
  for (const key of ['path', 'locator'])
    if (finding[key] !== null && typeof finding[key] !== 'string') throw new Error(`current finding ${key}`);
  return finding;
}

export function validateCurrentReviewerOutput(output, request) {
  assertClosed(output, ['schema', 'role', 'request', 'verdict', 'checklist', 'findings'], 'current reviewer output');
  if (
    output.schema !== request?.schema ||
    ![5, 6].includes(output.schema) ||
    output.role !== 'primary' ||
    jcs(output.request) !== jcs(request)
  )
    throw new Error('current reviewer envelope mismatch');
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
  output.findings.forEach((finding) => {
    validateCurrentFinding(finding, ids);
  });
  for (const criterion of CURRENT_CRITERIA) {
    const status = output.checklist[criterion].status;
    const matching = output.findings.filter((finding) => finding.criterion === criterion);
    if (status === 'pass' && matching.length !== 0)
      throw new Error(`pass criterion ${criterion} cannot carry findings`);
    if (status !== 'pass' && !matching.some((finding) => finding.status === status))
      throw new Error(`current finding status missing for gap criterion ${criterion}`);
    if (matching.some((finding) => finding.status !== status))
      throw new Error(`current finding status does not match checklist ${criterion}`);
  }
  if (output.verdict === 'pass' && output.findings.length !== 0)
    throw new Error('pass reviewer output cannot carry findings');
  return output;
}

function validateCurrentAttempt(attempt, schema = 5) {
  assertClosed(
    attempt,
    [
      'schema',
      'candidate',
      'started',
      'output_started',
      'child_id',
      'timeout_mode',
      'timeout_seconds',
      'result',
      'exit_code',
      'signal',
      'denial_source',
      'reason',
      'stdout_sha256',
      'stderr_sha256',
    ],
    'current attempt',
  );
  if (attempt.schema !== schema || ![5, 6].includes(schema)) throw new Error('current attempt schema');
  validateCurrentCandidate(attempt.candidate, 'current attempt candidate');
  if (typeof attempt.started !== 'boolean' || typeof attempt.output_started !== 'boolean')
    throw new Error('current attempt booleans');
  oneOf(attempt.result, CURRENT_ATTEMPT_RESULTS, 'current attempt result');
  if (attempt.child_id !== null) string(attempt.child_id, 'current attempt child id');
  if (attempt.timeout_mode !== null)
    oneOf(attempt.timeout_mode, new Set(['gnu_timeout', 'orchestrator_tool']), 'current attempt timeout mode');
  if (attempt.timeout_seconds !== null && !Number.isInteger(attempt.timeout_seconds))
    throw new Error('current attempt timeout seconds');
  if (attempt.exit_code !== null && !Number.isInteger(attempt.exit_code)) throw new Error('current attempt exit code');
  if (attempt.signal !== null) string(attempt.signal, 'current attempt signal');
  if (attempt.denial_source !== null)
    oneOf(
      attempt.denial_source,
      new Set(['sandbox', 'managed_policy', 'runtime_policy']),
      'current attempt denial source',
    );
  string(attempt.reason, 'current attempt reason');
  for (const key of ['stdout_sha256', 'stderr_sha256'])
    if (attempt[key] !== null) digest(attempt[key], `current attempt ${key}`);
  if (
    !attempt.started &&
    (attempt.output_started ||
      attempt.child_id !== null ||
      attempt.timeout_mode !== null ||
      attempt.timeout_seconds !== null ||
      attempt.exit_code !== null ||
      attempt.signal !== null ||
      attempt.stdout_sha256 !== null ||
      attempt.stderr_sha256 !== null)
  )
    throw new Error('unstarted current attempt carries launch or process evidence');
  if (
    attempt.started &&
    (attempt.child_id === null ||
      attempt.timeout_mode === null ||
      attempt.timeout_seconds !== 600 ||
      attempt.stdout_sha256 === null ||
      attempt.stderr_sha256 === null)
  )
    throw new Error('started current attempt requires child id, timeout mode, 600-second deadline, and output hashes');
  if (CURRENT_FALLBACK_RESULTS.has(attempt.result) && attempt.output_started)
    throw new Error('availability fallback cannot follow substantive output');
  if (
    attempt.result === 'passed' &&
    (!attempt.started ||
      !attempt.output_started ||
      attempt.exit_code !== 0 ||
      attempt.signal !== null ||
      attempt.denial_source !== null)
  )
    throw new Error('invalid passed current attempt');
  if (attempt.result === 'platform_denied' && (attempt.output_started || attempt.denial_source === null))
    throw new Error('invalid current platform denial');
  if (attempt.result !== 'platform_denied' && attempt.denial_source !== null)
    throw new Error('unexpected current denial source');
  if (attempt.result === 'model_unavailable' && !attempt.started)
    throw new Error('model_unavailable requires a started real launch');
  if (
    ['auth_failed', 'model_unavailable'].includes(attempt.result) &&
    attempt.started &&
    (attempt.exit_code === null || attempt.exit_code === 0 || attempt.signal !== null)
  )
    throw new Error(`invalid current ${attempt.result}`);
  if (
    attempt.result === 'tool_unavailable' &&
    attempt.started &&
    (attempt.exit_code === null || attempt.exit_code === 0 || attempt.signal !== null)
  )
    throw new Error('invalid current tool_unavailable');
  if (
    attempt.result === 'deadline_exceeded' &&
    (!attempt.started || (attempt.exit_code === null) === (attempt.signal === null))
  )
    throw new Error('invalid current deadline: exactly one exit code or signal is required');
  if (
    attempt.result === 'transient_transport' &&
    (!attempt.started || attempt.output_started || attempt.exit_code !== null || attempt.signal !== null)
  )
    throw new Error('invalid current transient transport');
  if (
    attempt.result === 'nonzero_exit' &&
    (!attempt.started || attempt.exit_code === null || attempt.exit_code === 0 || attempt.signal !== null)
  )
    throw new Error('invalid current nonzero exit');
  if (attempt.result === 'signaled' && (!attempt.started || !attempt.signal || attempt.exit_code !== null))
    throw new Error('invalid current signal');
  if (attempt.result === 'output_invalid' && (!attempt.started || !attempt.output_started))
    throw new Error('invalid current output failure');
  return attempt;
}

export function validateCurrentAttemptSequence(attempts, policy) {
  validateCurrentPolicy(policy);
  if (!Array.isArray(attempts) || attempts.length === 0 || attempts.length > policy.candidates.length)
    throw new Error('current attempt sequence bound');
  for (let index = 0; index < attempts.length; index += 1) {
    const attempt = validateCurrentAttempt(attempts[index], policy.schema);
    if (jcs(attempt.candidate) !== jcs(policy.candidates[index]))
      throw new Error('current attempt candidate order mismatch');
    if (index < attempts.length - 1 && !CURRENT_FALLBACK_RESULTS.has(attempt.result))
      throw new Error(`current attempt continued after terminal ${attempt.result}`);
    if (index < attempts.length - 1 && attempt.output_started)
      throw new Error('current attempt fallback after output is terminal');
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
    if (!Array.isArray(waiver.roles) || jcs(waiver.roles) !== jcs(['primary']))
      throw new Error('current waiver roles must equal [primary]');
    const key = `${waiver.phase}:${waiver.input_sha256}:primary`;
    if (claimed.has(key)) throw new Error('duplicate current waiver');
    claimed.add(key);
    string(waiver.actor, 'current waiver actor');
    string(waiver.reason, 'current waiver reason');
    iso(waiver.at, 'current waiver at');
    return waiver;
  });
  return phase && inputSha
    ? normalized.filter((waiver) => waiver.phase === phase && waiver.input_sha256 === inputSha)
    : normalized;
}

function validateCurrentReproduction(value) {
  assertClosed(value, ['id', 'reproduction'], 'current reproduced finding');
  string(value.id, 'current reproduced finding id');
  assertClosed(value.reproduction, ['method', 'command', 'exit_code', 'evidence_sha256'], 'current reproduction');
  oneOf(value.reproduction.method, new Set(['read', 'command']), 'current reproduction method');
  digest(value.reproduction.evidence_sha256, 'current reproduction evidence');
  if (
    value.reproduction.method === 'read' &&
    (value.reproduction.command !== null || value.reproduction.exit_code !== null)
  )
    throw new Error('current read reproduction carries command evidence');
  if (value.reproduction.method === 'command') {
    string(value.reproduction.command, 'current reproduction command');
    if (!Number.isInteger(value.reproduction.exit_code)) throw new Error('current reproduction exit code');
  }
  return value;
}

export function validateCurrentRawReview(raw, request, { expectedWaiver = null } = {}) {
  assertClosed(
    raw,
    [
      'schema',
      'role',
      'request',
      'result',
      'attempts',
      'selected',
      'reviewer_output',
      'findings_sha256',
      'waiver',
      'waiver_sha256',
      'reason',
    ],
    'current raw review',
  );
  if (
    raw.schema !== request?.schema ||
    ![5, 6].includes(raw.schema) ||
    raw.role !== 'primary' ||
    jcs(raw.request) !== jcs(request)
  )
    throw new Error('current raw review request mismatch');
  validateRequest(request);
  oneOf(raw.result, new Set(['passed', 'unavailable', 'failed', 'waived']), 'current raw review result');
  if (!Array.isArray(raw.attempts)) throw new Error('current raw attempts');
  if (raw.result === 'waived') {
    if (
      raw.attempts.length ||
      raw.selected !== null ||
      raw.reviewer_output !== null ||
      raw.findings_sha256 !== null ||
      raw.reason !== null
    )
      throw new Error('invalid current waived review');
    if (raw.waiver === null || raw.waiver_sha256 !== sha256(jcs(raw.waiver)))
      throw new Error('current waiver hash mismatch');
    validateCurrentWaivers([raw.waiver], request.phase, request.input_sha256);
    if (expectedWaiver === null || jcs(raw.waiver) !== jcs(expectedWaiver))
      throw new Error('current waiver is not the exact snapshot');
    return raw;
  }
  if (raw.waiver !== null || raw.waiver_sha256 !== null) throw new Error('non-waived current review carries waiver');
  const sequence = validateCurrentAttemptSequence(raw.attempts, request.policy);
  const last = raw.attempts.at(-1);
  if (raw.result === 'passed') {
    if (
      last.result !== 'passed' ||
      sequence.selected_index === null ||
      raw.selected === null ||
      jcs(raw.selected) !== jcs(last.candidate) ||
      raw.reviewer_output === null ||
      raw.reason !== null
    )
      throw new Error('invalid current passed review');
    validateCurrentReviewerOutput(raw.reviewer_output, request);
    digest(raw.findings_sha256, 'current findings hash');
    if (raw.findings_sha256 !== sha256(jcs(raw.reviewer_output.findings)))
      throw new Error('current findings hash mismatch');
  } else {
    if (raw.selected !== null || raw.reviewer_output !== null || raw.findings_sha256 !== null)
      throw new Error('non-passed current review carries reviewer result');
    string(raw.reason, 'current terminal reason');
    if (raw.result === 'unavailable' && !sequence.exhausted)
      throw new Error('current unavailable review requires exhausted availability candidates');
    if (raw.result === 'failed' && (!sequence.terminal || sequence.selected_index !== null))
      throw new Error('current failed review cannot discard a passed attempt');
  }
  return raw;
}

function validateCurrentReviewerRecord(reviewer, request, reproduced, context) {
  assertClosed(reviewer, ['raw', 'accepted_finding_ids', 'rejected'], 'current reviewer record');
  validateCurrentRawReview(reviewer.raw, request, context);
  if (!Array.isArray(reviewer.accepted_finding_ids) || !Array.isArray(reviewer.rejected))
    throw new Error('current reviewer reconciliation arrays');
  const findings = reviewer.raw.reviewer_output?.findings || [];
  const findingsById = new Map(findings.map((finding) => [finding.id, finding]));
  const known = new Set(findingsById.keys());
  const used = new Set();
  for (const id of reviewer.accepted_finding_ids) {
    if (!known.has(id) || used.has(id)) throw new Error('current accepted finding id');
    if (request.schema === 6 && findingsById.get(id).status !== 'blocking_gap')
      throw new Error('schema-6 accepted finding must be blocking_gap');
    used.add(id);
  }
  const schema6RejectionReasons = new Set([
    'not_plan_blocking',
    'not_reproduced',
    'defer_to_implementation_verification',
  ]);
  for (const row of reviewer.rejected) {
    assertClosed(row, ['id', 'reason'], 'current rejected finding');
    if (!known.has(row.id) || used.has(row.id)) throw new Error('current rejected finding id');
    string(row.reason, 'current rejection reason');
    if (request.schema === 6 && !schema6RejectionReasons.has(row.reason))
      throw new Error(
        'schema-6 rejection reason must be not_plan_blocking, not_reproduced, or defer_to_implementation_verification',
      );
    used.add(row.id);
  }
  if (used.size !== known.size)
    throw new Error('current reviewer accepted/rejected reconciliation is not an exact partition');
  if (!Array.isArray(reproduced)) throw new Error('current reproduced must be an array');
  const reproducedIds = new Set();
  for (const value of reproduced) {
    validateCurrentReproduction(value);
    if (!known.has(value.id) || reproducedIds.has(value.id)) throw new Error('current reproduced finding id');
    reproducedIds.add(value.id);
  }
  for (const id of reviewer.accepted_finding_ids)
    if (!reproducedIds.has(id)) throw new Error('current accepted finding was not reproduced');
  if (request.schema === 6) {
    for (const row of reviewer.rejected) {
      if (row.reason === 'not_reproduced' && reproducedIds.has(row.id))
        throw new Error('schema-6 not_reproduced finding cannot carry reproduced evidence');
    }
  } else if (reproducedIds.size !== known.size) {
    throw new Error('every current finding must have independent reproduction evidence');
  }
}

function currentBlockingFindings(reviewer) {
  return (reviewer.raw.reviewer_output?.findings || []).filter((finding) => finding.status === 'blocking_gap');
}

function currentAcceptedBlockingFindings(reviewer) {
  const findings = new Map((reviewer.raw.reviewer_output?.findings || []).map((finding) => [finding.id, finding]));
  return reviewer.accepted_finding_ids.filter((id) => findings.get(id)?.status === 'blocking_gap');
}

function currentOutcome(reviewer, request) {
  const raw = reviewer.raw;
  if (raw.result === 'waived') return { outcome: 'waived', eligible: true };
  if (raw.result === 'unavailable') return { outcome: 'unavailable', eligible: false };
  if (raw.result === 'failed') return { outcome: 'not_ready', eligible: false };
  const blocking = request.schema === 6 ? currentAcceptedBlockingFindings(reviewer) : currentBlockingFindings(reviewer);
  if (blocking.length > 0) return { outcome: 'not_ready', eligible: false };
  return { outcome: 'passed', eligible: true };
}

function deriveCurrentCompletionVerdict(primary, inventory, reviewer, request) {
  validatePrimary(primary, inventory);
  const reviewOutcome = currentOutcome(reviewer, request);
  if (
    reviewOutcome.outcome === 'unavailable' ||
    reviewOutcome.outcome === 'not_ready' ||
    primary.ci.exit_code !== 0 ||
    primary.regressions.length > 0 ||
    primary.findings.some((finding) => finding.severity === 'high') ||
    currentAcceptedBlockingFindings(reviewer).length > 0
  )
    return 'regressed';
  if (primary.goal_met === 'yes' && primary.acceptance.every((criterion) => criterion.met)) return 'passed';
  return 'partial';
}

export function validateCurrentReviewRunResult(result, { waivers = [] } = {}) {
  const completion = result?.request?.phase === 'completion';
  const keys = completion
    ? [
        'schema',
        'kind',
        'request',
        'plan_input_sha256',
        'diff_sha256',
        'acceptance_inventory',
        'acceptance_inventory_sha256',
        'reviewer',
        'reproduced',
        'outcome',
        'primary',
        'completion_verdict',
      ]
    : ['schema', 'kind', 'request', 'reviewer', 'reproduced', 'outcome', 'pre_execution_eligible'];
  assertClosed(result, keys, 'current review run');
  if (
    result.schema !== result.request?.schema ||
    ![5, 6].includes(result.schema) ||
    result.kind !== result.request?.phase
  )
    throw new Error('current review run kind');
  validateRequest(result.request);
  const normalized = validateCurrentWaivers(waivers, result.request.phase, result.request.input_sha256);
  const expectedWaiver = normalized.find((waiver) => waiver.roles.includes('primary')) || null;
  validateCurrentReviewerRecord(result.reviewer, result.request, result.reproduced, { expectedWaiver });
  const expected = currentOutcome(result.reviewer, result.request);
  if (result.outcome !== expected.outcome) throw new Error(`current outcome mismatch: expected ${expected.outcome}`);
  if (!completion) {
    if (result.pre_execution_eligible !== expected.eligible) throw new Error('current pre_execution_eligible mismatch');
    return result;
  }
  if (
    result.request.lifecycle_intent !== 'none' ||
    result.plan_input_sha256 !== result.request.input_sha256 ||
    result.diff_sha256 !== result.request.diff_sha256 ||
    !HEX40.test(result.request.planned_at_commit) ||
    !HEX40.test(result.request.execution_base_commit)
  )
    throw new Error('current completion request identity mismatch');
  digest(result.diff_sha256, 'current completion diff');
  validateAcceptanceInventory(result.acceptance_inventory);
  if (
    result.acceptance_inventory_sha256 !== sha256(jcs(result.acceptance_inventory)) ||
    result.acceptance_inventory_sha256 !== result.request.acceptance_inventory_sha256
  )
    throw new Error('current completion acceptance inventory mismatch');
  const verdict = deriveCurrentCompletionVerdict(
    result.primary,
    result.acceptance_inventory,
    result.reviewer,
    result.request,
  );
  if (result.completion_verdict !== verdict) throw new Error('current completion verdict mismatch');
  return result;
}

export function validateCurrentReviewReceipt(
  receipt,
  expected = null,
  { waivers = [], expectedPolicy = null, orchestration = null } = {},
) {
  const completion = receipt?.phase === 'completion';
  const orchestrationKeys = receipt?.schema === 6 ? ['settled_orchestration_state_sha256'] : [];
  const keys = completion
    ? [
        'schema',
        'phase',
        'request',
        'planned_at_commit',
        'execution_base_commit',
        'reviewed_head',
        'diff_sha256',
        'plan_input_sha256',
        'acceptance_inventory',
        'acceptance_inventory_sha256',
        'policy',
        'policy_sha256',
        'reviewer',
        'reproduced',
        'outcome',
        'primary',
        'completion_verdict',
        'series',
        ...orchestrationKeys,
        'reviewed_at',
      ]
    : [
        'schema',
        'phase',
        'request',
        'input_sha256',
        'reviewed_commit',
        'policy',
        'policy_sha256',
        'reviewer',
        'reproduced',
        'outcome',
        'pre_execution_eligible',
        'series',
        ...orchestrationKeys,
        'reviewed_at',
      ];
  assertClosed(receipt, keys, 'current review receipt');
  if (
    receipt.schema !== receipt.request?.schema ||
    ![5, 6].includes(receipt.schema) ||
    receipt.phase !== receipt.request?.phase
  )
    throw new Error('current review receipt phase');
  validateRequest(receipt.request);
  if (jcs(receipt.policy) !== jcs(receipt.request.policy) || receipt.policy_sha256 !== receipt.request.policy_sha256)
    throw new Error('current review receipt policy mismatch');
  validateExpectedPolicy(receipt, expectedPolicy);
  const expectedObject = expected && typeof expected === 'object' ? expected : {};
  const expectedInput =
    typeof expected === 'string' ? expected : (expectedObject.input_sha256 ?? expectedObject.plan_input_sha256 ?? null);
  let run;
  if (!completion) {
    if (
      receipt.input_sha256 !== receipt.request.input_sha256 ||
      receipt.reviewed_commit !== receipt.request.reviewed_commit_or_head
    )
      throw new Error('current draft receipt input mismatch');
    if (expectedInput !== null && receipt.input_sha256 !== expectedInput)
      throw new Error('stale current draft receipt');
    run = {
      schema: receipt.schema,
      kind: 'draft',
      request: receipt.request,
      reviewer: receipt.reviewer,
      reproduced: receipt.reproduced,
      outcome: receipt.outcome,
      pre_execution_eligible: receipt.pre_execution_eligible,
    };
  } else {
    if (
      receipt.request.lifecycle_intent !== 'none' ||
      receipt.reviewed_head !== receipt.request.reviewed_commit_or_head ||
      receipt.plan_input_sha256 !== receipt.request.input_sha256 ||
      receipt.planned_at_commit !== receipt.request.planned_at_commit ||
      receipt.execution_base_commit !== receipt.request.execution_base_commit ||
      receipt.diff_sha256 !== receipt.request.diff_sha256 ||
      !HEX40.test(receipt.planned_at_commit) ||
      !HEX40.test(receipt.execution_base_commit) ||
      !HEX40.test(receipt.reviewed_head)
    )
      throw new Error('current completion receipt request mismatch');
    run = {
      schema: receipt.schema,
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
  if (receipt.schema === 6) {
    digest(receipt.settled_orchestration_state_sha256, 'settled orchestration state');
    if (orchestration === null) throw new Error('schema-6 receipt requires settled orchestration state');
    validateReviewOrchestrationState(orchestration);
    const requestIds = series.rounds.map((round) => round.request.request_id);
    if (
      !['passed', 'stopped', 'stuck'].includes(orchestration.status) ||
      orchestration.series_sha256 !== sha256(jcs(series)) ||
      receipt.settled_orchestration_state_sha256 !== orchestration.state_sha256 ||
      orchestration.series_id !== series.orchestration_series_id ||
      orchestration.initial_input_sha256 !== series.initial_input_sha256 ||
      orchestration.current_input_sha256 !== series.current_input_sha256 ||
      orchestration.phase !== series.rounds.at(-1).request.phase ||
      orchestration.lifecycle_intent !== series.rounds.at(-1).request.lifecycle_intent ||
      orchestration.round_index !== series.rounds.length ||
      jcs(orchestration.request_ids) !== jcs(requestIds)
    )
      throw new Error('schema-6 receipt settled orchestration mismatch');
  }
  if (completion && expectedInput !== null && receipt.plan_input_sha256 !== expectedInput)
    throw new Error('stale current completion receipt input');
  for (const [key, value] of Object.entries(expectedObject)) {
    if (key === 'review_status') continue;
    if (value !== undefined && jcs(receipt[key]) !== jcs(value))
      throw new Error(`stale current completion receipt ${key}`);
  }
  if (
    completion &&
    expectedObject.review_status !== undefined &&
    expectedObject.review_status !== receipt.completion_verdict
  )
    throw new Error('current completion review_status mismatch');
  iso(receipt.reviewed_at, 'current reviewed_at');
  return receipt;
}

function validateCurrentRepairTarget(target) {
  assertClosed(
    target,
    ['id', 'source', 'criterion', 'status', 'section', 'path', 'locator', 'defect', 'fix', 'evidence', 'reproduction'],
    'current repair target',
  );
  string(target.id, 'current repair target id');
  if (target.source !== 'primary') throw new Error('current repair target source must be primary');
  oneOf(target.criterion, new Set(CURRENT_CRITERIA), 'current repair target criterion');
  if (target.status !== 'blocking_gap') throw new Error('current repair target must be blocking_gap');
  for (const key of ['section', 'defect', 'fix', 'evidence']) string(target[key], `current repair target ${key}`);
  for (const key of ['path', 'locator'])
    if (target[key] !== null && typeof target[key] !== 'string') throw new Error(`current repair target ${key}`);
  validateCurrentReproduction({ id: target.id, reproduction: target.reproduction });
  return target;
}

function validateCurrentRepairTransition(transition) {
  const schema = transition?.schema;
  const orchestrationKeys =
    schema === 6
      ? ['orchestration_series_id', 'previous_orchestration_state_sha256', 'current_orchestration_state_sha256']
      : [];
  assertClosed(
    transition,
    [
      'schema',
      'from_round_index',
      'previous_input_sha256',
      'current_input_sha256',
      ...orchestrationKeys,
      'accepted_finding_ids',
      'targets',
      'repair_targets_sha256',
    ],
    'current repair transition',
  );
  if (![5, 6].includes(schema) || transition.from_round_index !== 1)
    throw new Error('current repair transition allows one repair after round one');
  digest(transition.previous_input_sha256, 'current repair previous input');
  digest(transition.current_input_sha256, 'current repair current input');
  if (transition.previous_input_sha256 === transition.current_input_sha256)
    throw new Error('current repair requires changed input');
  if (schema === 6) {
    if (!UUID.test(transition.orchestration_series_id)) throw new Error('current repair orchestration series identity');
    digest(transition.previous_orchestration_state_sha256, 'current repair previous orchestration state');
    digest(transition.current_orchestration_state_sha256, 'current repair current orchestration state');
    if (transition.previous_orchestration_state_sha256 === transition.current_orchestration_state_sha256)
      throw new Error('current repair orchestration state must change');
  }
  if (
    !Array.isArray(transition.accepted_finding_ids) ||
    !Array.isArray(transition.targets) ||
    transition.targets.length === 0
  )
    throw new Error('current repair targets must be nonempty');
  const accepted = [...transition.accepted_finding_ids];
  if (new Set(accepted).size !== accepted.length || jcs(accepted) !== jcs([...accepted].sort(compareUtf16)))
    throw new Error('current accepted finding ids must be unique and sorted');
  const ids = [];
  for (const target of transition.targets) {
    validateCurrentRepairTarget(target);
    ids.push(target.id);
  }
  if (new Set(ids).size !== ids.length || jcs(ids) !== jcs([...ids].sort(compareUtf16)) || jcs(ids) !== jcs(accepted))
    throw new Error('current repair targets must equal accepted finding ids');
  digest(transition.repair_targets_sha256, 'current repair targets hash');
  const expected = sha256(jcs({ schema, accepted_finding_ids: accepted, targets: transition.targets }));
  if (transition.repair_targets_sha256 !== expected) throw new Error('current repair target hash mismatch');
  return transition;
}

export function validateCurrentReviewSeries(series, { waivers = [] } = {}) {
  const schema = series?.schema;
  const orchestrationKeys = schema === 6 ? ['orchestration_series_id'] : [];
  assertClosed(
    series,
    [
      'schema',
      ...orchestrationKeys,
      'policy_sha256',
      'initial_input_sha256',
      'current_input_sha256',
      'rounds',
      'repairs',
    ],
    'current review series',
  );
  if (![5, 6].includes(schema) || !Array.isArray(series.rounds) || series.rounds.length < 1 || series.rounds.length > 2)
    throw new Error('current review series permits at most two rounds');
  if (schema === 6 && !UUID.test(series.orchestration_series_id))
    throw new Error('current review series orchestration identity');
  if (!Array.isArray(series.repairs) || series.repairs.length !== series.rounds.length - 1)
    throw new Error('current review series repair count');
  digest(series.policy_sha256, 'current review series policy');
  digest(series.initial_input_sha256, 'current review series initial input');
  digest(series.current_input_sha256, 'current review series current input');
  const first = series.rounds[0];
  validateCurrentReviewRunResult(first, { waivers });
  validateCurrentPolicy(first.request.policy);
  if (first.request.review_mode !== 'full' || first.request.round_index !== 1)
    throw new Error('current review series round one must be full');
  if (
    series.policy_sha256 !== first.request.policy_sha256 ||
    series.policy_sha256 !== sha256(jcs(first.request.policy))
  )
    throw new Error('current review series policy mismatch');
  if (first.request.input_sha256 !== series.initial_input_sha256)
    throw new Error('current review series initial input mismatch');
  const phase = first.request.phase;
  const kind = first.kind;
  const lifecycleIntent = first.request.lifecycle_intent;
  const orchestrationStateHashes = new Set();
  for (const round of series.rounds) {
    validateCurrentReviewRunResult(round, { waivers });
    if (round.schema !== schema || round.request.schema !== schema)
      throw new Error('current review series schema drift');
    if (round.request.phase !== phase || round.kind !== kind || round.request.lifecycle_intent !== lifecycleIntent)
      throw new Error('current review series phase, kind, or lifecycle drift');
    if (
      phase === 'completion' &&
      (round.request.planned_at_commit !== first.request.planned_at_commit ||
        round.request.execution_base_commit !== first.request.execution_base_commit)
    )
      throw new Error('current completion series execution identity drift');
    if (schema === 6) {
      if (round.request.orchestration_series_id !== series.orchestration_series_id)
        throw new Error('current review series orchestration series drift');
      if (orchestrationStateHashes.has(round.request.orchestration_state_sha256))
        throw new Error('current review series orchestration state hash must advance');
      orchestrationStateHashes.add(round.request.orchestration_state_sha256);
    }
  }
  if (series.rounds.length === 2) {
    const second = series.rounds[1];
    if (second.request.review_mode !== 'repair' || second.request.round_index !== 2)
      throw new Error('current review series round two must be repair without reset');
    const transition = validateCurrentRepairTransition(series.repairs[0]);
    if (transition.schema !== schema) throw new Error('current review series repair schema mismatch');
    if (
      second.request.previous_input_sha256 !== first.request.input_sha256 ||
      second.request.input_sha256 === first.request.input_sha256
    )
      throw new Error('current review series repair requires changed input');
    if (
      transition.previous_input_sha256 !== first.request.input_sha256 ||
      transition.current_input_sha256 !== second.request.input_sha256 ||
      transition.repair_targets_sha256 !== second.request.repair_targets_sha256
    )
      throw new Error('current review series repair transition mismatch');
    if (
      schema === 6 &&
      (transition.orchestration_series_id !== series.orchestration_series_id ||
        transition.previous_orchestration_state_sha256 !== first.request.orchestration_state_sha256 ||
        transition.current_orchestration_state_sha256 !== second.request.orchestration_state_sha256)
    )
      throw new Error('current review series repair orchestration state hash mismatch');
    if (
      second.request.policy_sha256 !== series.policy_sha256 ||
      jcs(second.request.policy) !== jcs(first.request.policy)
    )
      throw new Error('current review series policy drift');
    const findings = new Map(
      (first.reviewer.raw.reviewer_output?.findings || []).map((finding) => [finding.id, finding]),
    );
    const reproduced = new Map(first.reproduced.map((value) => [value.id, value.reproduction]));
    const acceptedBlocking = first.reviewer.accepted_finding_ids
      .filter((id) => findings.get(id)?.status === 'blocking_gap')
      .sort(compareUtf16);
    const rejectedBlocking = currentBlockingFindings(first.reviewer).filter(
      (finding) => !first.reviewer.accepted_finding_ids.includes(finding.id),
    );
    if (schema === 5 && rejectedBlocking.length > 0)
      throw new Error('current repair series cannot leave a rejected blocking finding outside repair');
    if (jcs(transition.accepted_finding_ids) !== jcs(acceptedBlocking))
      throw new Error('current repair targets must equal accepted blocking findings');
    for (const target of transition.targets) {
      const finding = findings.get(target.id);
      const reproduction = reproduced.get(target.id);
      const findingFields = ['criterion', 'status', 'section', 'path', 'locator', 'defect', 'fix', 'evidence'];
      if (
        !finding ||
        !reproduction ||
        target.source !== 'primary' ||
        findingFields.some((key) => target[key] !== finding[key]) ||
        jcs(target.reproduction) !== jcs(reproduction)
      )
        throw new Error('current repair target was not exactly reproduced');
    }
  }
  if (series.rounds.at(-1).request.input_sha256 !== series.current_input_sha256)
    throw new Error('current review series current input mismatch');
  return series;
}

const ORCHESTRATION_STATE_V1_KEYS = [
  'schema',
  'plan_path',
  'phase',
  'lifecycle_intent',
  'initial_input_sha256',
  'current_input_sha256',
  'orchestration_attempt',
  'series_id',
  'request_ids',
  'round_index',
  'status',
  'stop_reason',
  'series_sha256',
  'apply_state',
  'transitioned_from_state_sha256',
  'retry_authorization',
  'state_sha256',
];
const ORCHESTRATION_STATE_V2_KEYS = [
  ...ORCHESTRATION_STATE_V1_KEYS.filter((key) => !['schema', 'state_sha256'].includes(key)),
  'schema',
  'terminal_evidence_sha256',
  'terminated_from_state_sha256',
  'terminated_from_state',
  'state_sha256',
];
const ORCHESTRATION_RETRY_AUTHORIZATION_KEYS = [
  'schema',
  'authorization_id',
  'actor',
  'authorized_at',
  'plan_path',
  'phase',
  'intent_group',
  'input_sha256',
  'stopped_state_sha256',
  'source_text_sha256',
];
const ORCHESTRATION_STOP_REASONS = new Set([
  'unavailable_auth',
  'unavailable_model',
  'timed_out',
  'unavailable_unknown',
  'failed_unparseable',
  'platform_denied',
  'stale_input',
  'cannot_repair',
  'not_ready',
  'apply_rejected',
]);
const ORCHESTRATION_TERMINAL_REASONS = new Set(['controller_contract_failure', 'authorized_abandonment']);
const ORCHESTRATION_NONRETRYABLE_REASONS = new Set([
  'platform_denied',
  'stale_input',
  'cannot_repair',
  'not_ready',
  'apply_rejected',
  ...ORCHESTRATION_TERMINAL_REASONS,
]);

function orchestrationIntentGroup(phase, lifecycleIntent) {
  if (phase === 'completion') return 'completion';
  if (['schedule_fire', 'auto_execute'].includes(lifecycleIntent)) return 'scheduled_execution';
  return lifecycleIntent;
}

function validateReviewRetryAuthorization(authorization, previousState = null, sourceText = undefined) {
  assertClosed(authorization, ORCHESTRATION_RETRY_AUTHORIZATION_KEYS, 'review retry authorization');
  if (authorization.schema !== 1 || !UUID.test(authorization.authorization_id) || authorization.actor !== 'user')
    throw new Error('review retry authorization identity or actor');
  iso(authorization.authorized_at, 'review retry authorization time');
  string(authorization.plan_path, 'review retry authorization plan path');
  oneOf(authorization.phase, new Set(['draft', 'completion']), 'review retry authorization phase');
  oneOf(
    authorization.intent_group,
    new Set(['none', 'start', 'scheduled_execution', 'completion']),
    'review retry authorization intent group',
  );
  digest(authorization.input_sha256, 'review retry authorization input');
  digest(authorization.stopped_state_sha256, 'review retry authorization stopped state');
  digest(authorization.source_text_sha256, 'review retry authorization source text');
  if (previousState !== null) {
    validateReviewOrchestrationState(previousState);
    if (
      previousState.status !== 'stopped' ||
      previousState.orchestration_attempt !== 1 ||
      ORCHESTRATION_NONRETRYABLE_REASONS.has(previousState.stop_reason) ||
      authorization.plan_path !== previousState.plan_path ||
      authorization.phase !== previousState.phase ||
      authorization.intent_group !== orchestrationIntentGroup(previousState.phase, previousState.lifecycle_intent) ||
      authorization.input_sha256 !== previousState.current_input_sha256 ||
      authorization.stopped_state_sha256 !== previousState.state_sha256
    )
      throw new Error('review retry authorization does not match the retryable stopped state');
    if (typeof sourceText !== 'string' && !(sourceText instanceof Uint8Array))
      throw new Error('review retry authorization requires exact current-user source text');
    if (
      sha256(typeof sourceText === 'string' ? Buffer.from(sourceText, 'utf8') : sourceText) !==
      authorization.source_text_sha256
    )
      throw new Error('review retry authorization source text mismatch');
  }
  return authorization;
}

function validateReviewOrchestrationState(state) {
  const schema = state?.schema;
  assertClosed(
    state,
    schema === 2 ? ORCHESTRATION_STATE_V2_KEYS : ORCHESTRATION_STATE_V1_KEYS,
    'review orchestration state',
  );
  if (![1, 2].includes(schema)) throw new Error('review orchestration state schema');
  string(state.plan_path, 'review orchestration plan path');
  oneOf(state.phase, new Set(['draft', 'completion']), 'review orchestration phase');
  oneOf(
    state.lifecycle_intent,
    new Set(['none', 'start', 'schedule_fire', 'auto_execute']),
    'review orchestration lifecycle intent',
  );
  digest(state.initial_input_sha256, 'review orchestration initial input');
  digest(state.current_input_sha256, 'review orchestration current input');
  if (![1, 2].includes(state.orchestration_attempt)) throw new Error('review orchestration attempt must be 1 or 2');
  if (!UUID.test(state.series_id)) throw new Error('review orchestration series id');
  if (
    !Array.isArray(state.request_ids) ||
    ![1, 2].includes(state.round_index) ||
    state.request_ids.length !== state.round_index ||
    new Set(state.request_ids).size !== state.request_ids.length ||
    state.request_ids.some((id) => !UUID.test(id))
  )
    throw new Error('review orchestration request ids or round');
  oneOf(state.status, new Set(['active', 'passed', 'stopped', 'stuck']), 'review orchestration status');
  oneOf(state.apply_state, new Set(['none', 'pending', 'consumed']), 'review orchestration apply state');
  const terminalReason = schema === 2 && ORCHESTRATION_TERMINAL_REASONS.has(state.stop_reason);
  if (state.stop_reason !== null)
    oneOf(
      state.stop_reason,
      terminalReason ? ORCHESTRATION_TERMINAL_REASONS : ORCHESTRATION_STOP_REASONS,
      'review orchestration stop reason',
    );
  if (state.series_sha256 !== null) digest(state.series_sha256, 'review orchestration series');
  if (state.transitioned_from_state_sha256 !== null)
    digest(state.transitioned_from_state_sha256, 'review orchestration transition');
  if (state.retry_authorization !== null) validateReviewRetryAuthorization(state.retry_authorization);
  if (state.orchestration_attempt === 1 && state.retry_authorization !== null)
    throw new Error('review orchestration attempt one cannot carry retry authorization');
  if (state.orchestration_attempt === 2 && state.retry_authorization === null)
    throw new Error('review orchestration attempt two requires retry authorization');

  if (schema === 2) {
    const terminalFields = [
      state.terminal_evidence_sha256,
      state.terminated_from_state_sha256,
      state.terminated_from_state,
    ];
    const allNull = terminalFields.every((value) => value === null);
    const allPresent = terminalFields.every((value) => value !== null);
    if (!allNull && !allPresent)
      throw new Error('review orchestration terminal fields must be all null or all present');
    if (terminalReason !== allPresent)
      throw new Error('review orchestration terminal evidence and stop reason mismatch');
    if (allPresent) {
      digest(state.terminal_evidence_sha256, 'review orchestration terminal evidence');
      digest(state.terminated_from_state_sha256, 'review orchestration terminal source');
      const source = validateReviewOrchestrationState(state.terminated_from_state);
      if (source.status !== 'active' || (source.schema === 2 && source.terminal_evidence_sha256 !== null))
        throw new Error('review orchestration terminal source must be active and nonterminal');
      if (source.state_sha256 !== state.terminated_from_state_sha256)
        throw new Error('review orchestration terminal source hash mismatch');
      const preserved = [
        'plan_path',
        'phase',
        'lifecycle_intent',
        'initial_input_sha256',
        'current_input_sha256',
        'orchestration_attempt',
        'series_id',
        'request_ids',
        'round_index',
        'transitioned_from_state_sha256',
        'retry_authorization',
      ];
      if (preserved.some((key) => jcs(state[key]) !== jcs(source[key])))
        throw new Error('review orchestration terminal source lineage mismatch');
      if (state.status !== 'stuck' || state.series_sha256 !== null || state.apply_state !== 'none')
        throw new Error('review orchestration administrative terminal tuple');
    }
  }

  if (!terminalReason) {
    if (state.status === 'active') {
      if (
        state.stop_reason !== null ||
        state.series_sha256 !== null ||
        state.apply_state !== 'none' ||
        state.transitioned_from_state_sha256 !== null
      )
        throw new Error('active review orchestration state is not clean');
    } else if (state.status === 'passed') {
      if (state.stop_reason !== null || state.series_sha256 === null)
        throw new Error('passed review orchestration state is incomplete');
      if (state.apply_state === 'none' && state.lifecycle_intent !== 'none')
        throw new Error('executing passed orchestration must be pending or consumed');
      if (state.apply_state === 'pending' && state.lifecycle_intent === 'none')
        throw new Error('non-executing orchestration cannot be pending');
      if ((state.apply_state === 'consumed') !== (state.transitioned_from_state_sha256 !== null))
        throw new Error('consumed review orchestration transition mismatch');
    } else {
      if (state.stop_reason === null || state.apply_state !== 'none')
        throw new Error('stopped review orchestration state is incomplete');
      if (state.series_sha256 === null && state.stop_reason !== 'cannot_repair')
        throw new Error('cannot_repair is the only terminal review orchestration state without a series hash');
      if ((state.stop_reason === 'apply_rejected') !== (state.transitioned_from_state_sha256 !== null))
        throw new Error('apply_rejected review orchestration transition mismatch');
    }
  }
  digest(state.state_sha256, 'review orchestration state hash');
  const { state_sha256: stateSha256, ...preimage } = state;
  if (stateSha256 !== sha256(jcs(preimage))) throw new Error('review orchestration state hash mismatch');
  return state;
}

const PREPARED_REQUEST_KIND = 'Review-orchestration-prepared-request';
const DISPATCH_COMMITMENT_KIND = 'Review-orchestration-dispatch-commitment';
const CONTROLLER_ABORT_KIND = 'Review-orchestration-controller-abort';
const ABANDONMENT_KIND = 'Review-orchestration-abandonment';
const ORCHESTRATION_STATE_KIND = 'Review-orchestration-state';
const REVIEW_RECEIPT_KINDS = new Set(['Review-receipt', 'Completion-review-receipt']);
const PREPARED_REQUEST_KEYS = [
  'schema',
  'type',
  'plan_path',
  'phase',
  'lifecycle_intent',
  'orchestration_series_id',
  'orchestration_state_sha256',
  'request_ids',
  'request',
  'request_sha256',
  'prepared_at',
];
const DISPATCH_COMMITMENT_KEYS = [
  'schema',
  'type',
  'plan_path',
  'orchestration_state_sha256',
  'prepared_request_sha256',
  'candidate_index',
  'candidate',
  'prior_attempts',
  'prior_attempts_sha256',
  'bundle_path',
  'bundle_sha256',
  'reviewer_workspace',
  'reviewer_workspace_sha256',
  'argv',
  'argv_sha256',
  'controller_config',
  'committed_at',
];
const PROPOSED_CONTROLLER_CONFIG_KEYS = ['candidate_index', 'timeout_mode', 'timeout_seconds', 'argv', 'argv_sha256'];
const CONTROLLER_ABORT_KEYS = [
  'schema',
  'type',
  'plan_path',
  'phase',
  'lifecycle_intent',
  'orchestration_series_id',
  'source_state_sha256',
  'source_plan_blob_sha256',
  'request_ids',
  'prepared_request_sha256',
  'proposed_controller_config',
  'dispatch_status',
  'reason',
  'validation_error',
  'recorded_at',
];
const ABANDONMENT_AUTHORIZATION_KEYS = [
  'schema',
  'authorization_id',
  'actor',
  'decision',
  'authorized_at',
  'plan_path',
  'phase',
  'lifecycle_intent',
  'input_sha256',
  'orchestration_series_id',
  'source_state_sha256',
  'request_ids',
  'source_text_utf8_base64',
  'source_text_sha256',
];
const ABANDONMENT_KEYS = [
  'schema',
  'type',
  'plan_path',
  'phase',
  'lifecycle_intent',
  'orchestration_series_id',
  'source_state_sha256',
  'source_plan_blob_sha256',
  'request_ids',
  'current_input_sha256',
  'round_index',
  'outcome',
  'reason',
  'authorization',
  'recorded_at',
];

function activePlanPath(planPath, label) {
  string(planPath, label);
  const logical = safeLogical(planPath);
  if (logical.split('/').includes('.') || !logical.startsWith('docs/plans/active/') || !logical.endsWith('.md'))
    throw new Error(`${label} must be an active plan path; finished archives are immutable`);
  return logical;
}

function validateRequestIds(requestIds, label) {
  if (
    !Array.isArray(requestIds) ||
    ![1, 2].includes(requestIds.length) ||
    new Set(requestIds).size !== requestIds.length ||
    requestIds.some((id) => !UUID.test(id))
  )
    throw new Error(`${label} request lineage`);
}

function validatePreparedRequest(preparedRequest, state = null) {
  assertClosed(preparedRequest, PREPARED_REQUEST_KEYS, 'prepared review request');
  if (preparedRequest.schema !== 1 || preparedRequest.type !== 'ReviewPreparedRequestV1')
    throw new Error('prepared review request schema or type');
  activePlanPath(preparedRequest.plan_path, 'prepared review request plan path');
  oneOf(preparedRequest.phase, new Set(['draft', 'completion']), 'prepared review request phase');
  oneOf(
    preparedRequest.lifecycle_intent,
    new Set(['none', 'start', 'schedule_fire', 'auto_execute']),
    'prepared review request lifecycle intent',
  );
  if (!UUID.test(preparedRequest.orchestration_series_id))
    throw new Error('prepared review request orchestration series');
  digest(preparedRequest.orchestration_state_sha256, 'prepared review request orchestration state');
  validateRequestIds(preparedRequest.request_ids, 'prepared review request');
  validateRequest(preparedRequest.request);
  if (preparedRequest.request.schema !== 6) throw new Error('prepared review request requires schema-6 request');
  digest(preparedRequest.request_sha256, 'prepared review request digest');
  if (preparedRequest.request_sha256 !== sha256(jcs(preparedRequest.request)))
    throw new Error('prepared review request digest mismatch');
  iso(preparedRequest.prepared_at, 'prepared review request time');
  const request = preparedRequest.request;
  if (
    request.phase !== preparedRequest.phase ||
    request.lifecycle_intent !== preparedRequest.lifecycle_intent ||
    request.orchestration_series_id !== preparedRequest.orchestration_series_id ||
    request.orchestration_state_sha256 !== preparedRequest.orchestration_state_sha256 ||
    request.request_id !== preparedRequest.request_ids.at(-1) ||
    request.round_index !== preparedRequest.request_ids.length
  )
    throw new Error('prepared review request identity mismatch');
  if (state !== null) {
    validateReviewOrchestrationState(state);
    if (
      state.status !== 'active' ||
      state.plan_path !== preparedRequest.plan_path ||
      state.phase !== preparedRequest.phase ||
      state.lifecycle_intent !== preparedRequest.lifecycle_intent ||
      state.series_id !== preparedRequest.orchestration_series_id ||
      state.state_sha256 !== preparedRequest.orchestration_state_sha256 ||
      jcs(state.request_ids) !== jcs(preparedRequest.request_ids) ||
      state.round_index !== request.round_index ||
      state.current_input_sha256 !== request.input_sha256 ||
      (state.round_index === 2 && request.previous_input_sha256 !== state.initial_input_sha256)
    )
      throw new Error('prepared review request does not match active orchestration state');
  }
  return preparedRequest;
}

function validateArgv(argv, label) {
  if (
    !Array.isArray(argv) ||
    argv.length === 0 ||
    argv.some((value) => typeof value !== 'string' || value.length === 0)
  )
    throw new Error(`${label} must be a nonempty string array`);
}

function validateCommittedBundlePath(bundlePath) {
  string(bundlePath, 'review dispatch commitment bundle path');
  if (!path.isAbsolute(bundlePath) || path.resolve(bundlePath) !== bundlePath || bundlePath.includes('\0'))
    throw new Error('review dispatch commitment bundle path must be absolute and normalized');
  return bundlePath;
}

function committedLaunchContext(argv, candidate, request) {
  validateArgv(argv, 'committed reviewer argv');
  if (candidate.tool === 'codex') {
    const workdirIndex = argv.indexOf('-C');
    const bundleIndex = argv.indexOf('--add-dir');
    if (
      workdirIndex < 0 ||
      bundleIndex < 0 ||
      workdirIndex + 1 >= argv.length ||
      bundleIndex + 1 >= argv.length ||
      argv.indexOf('-C', workdirIndex + 1) >= 0 ||
      argv.indexOf('--add-dir', bundleIndex + 1) >= 0
    )
      throw new Error('committed Codex argv lacks one workspace and bundle');
    const workspacePath = argv[workdirIndex + 1];
    if (workspacePath !== reviewerWorkspacePath(request.request_id, 'primary'))
      throw new Error('committed Codex argv reviewer workspace mismatch');
    return { bundle: argv[bundleIndex + 1], workspacePath };
  }
  const prompt = argv.at(-1);
  const prefix = 'Sealed bundle: ';
  const suffix = '. Copy the request object exactly into ReviewerOutput.request.';
  const start = prompt.indexOf(prefix);
  const end = prompt.indexOf(suffix, start + prefix.length);
  if (start < 0 || end < 0) throw new Error('committed Claude argv lacks sealed bundle binding');
  return { bundle: prompt.slice(start + prefix.length, end), workspacePath: null };
}

function validateCommittedPriorAttempts(priorAttempts, request, candidateIndex) {
  if (!Array.isArray(priorAttempts) || priorAttempts.length !== candidateIndex)
    throw new Error('dispatch commitment candidate index must equal prior attempts length');
  if (candidateIndex === 0) return priorAttempts;
  validateCurrentAttemptSequence(priorAttempts, request.policy);
  if (priorAttempts.some((attempt) => !CURRENT_FALLBACK_RESULTS.has(attempt.result) || attempt.output_started))
    throw new Error('dispatch commitment prior attempts must be availability-only evidence');
  return priorAttempts;
}

function validateDispatchCommitment(commitment, preparedRequest) {
  assertClosed(commitment, DISPATCH_COMMITMENT_KEYS, 'review dispatch commitment');
  if (commitment.schema !== 1 || commitment.type !== 'ReviewDispatchCommitmentV1')
    throw new Error('review dispatch commitment schema or type');
  string(commitment.plan_path, 'review dispatch commitment plan path');
  digest(commitment.orchestration_state_sha256, 'review dispatch commitment orchestration state');
  digest(commitment.prepared_request_sha256, 'review dispatch commitment prepared request');
  if (!Number.isInteger(commitment.candidate_index) || commitment.candidate_index < 0)
    throw new Error('review dispatch commitment candidate index');
  validateCurrentCandidate(commitment.candidate, 'review dispatch commitment candidate');
  validateCommittedPriorAttempts(commitment.prior_attempts, preparedRequest.request, commitment.candidate_index);
  digest(commitment.prior_attempts_sha256, 'review dispatch commitment prior attempts');
  if (commitment.prior_attempts_sha256 !== sha256(jcs(commitment.prior_attempts)))
    throw new Error('review dispatch commitment prior attempts hash mismatch');
  validateCommittedBundlePath(commitment.bundle_path);
  digest(commitment.bundle_sha256, 'review dispatch commitment bundle');
  if (commitment.bundle_sha256 !== preparedRequest.request.bundle_sha256)
    throw new Error('review dispatch commitment bundle digest does not match prepared request');
  const candidateTool = preparedRequest.request.policy.candidates[commitment.candidate_index]?.tool;
  if (candidateTool === 'codex')
    validateReviewerWorkspaceRecord(commitment.reviewer_workspace, preparedRequest.request.request_id, 'primary');
  else if (candidateTool === 'claude' && commitment.reviewer_workspace !== null)
    throw new Error('Claude dispatch commitment requires null reviewer workspace');
  digest(commitment.reviewer_workspace_sha256, 'review dispatch commitment reviewer workspace');
  if (commitment.reviewer_workspace_sha256 !== sha256(jcs(commitment.reviewer_workspace)))
    throw new Error('review dispatch commitment reviewer workspace hash mismatch');
  validateArgv(commitment.argv, 'review dispatch commitment argv');
  digest(commitment.argv_sha256, 'review dispatch commitment argv');
  if (commitment.argv_sha256 !== sha256(jcs(commitment.argv)))
    throw new Error('review dispatch commitment argv hash mismatch');
  const launch = committedLaunchContext(commitment.argv, commitment.candidate, preparedRequest.request);
  if (
    launch.bundle !== commitment.bundle_path ||
    launch.workspacePath !== (commitment.reviewer_workspace?.workspace ?? null)
  )
    throw new Error('review dispatch commitment argv identity mismatch');
  assertClosed(
    commitment.controller_config,
    ['timeout_mode', 'timeout_seconds'],
    'review dispatch commitment controller config',
  );
  if (
    commitment.controller_config.timeout_mode !== 'orchestrator_tool' ||
    commitment.controller_config.timeout_seconds !== 600
  )
    throw new Error('review dispatch commitment requires orchestrator_tool and exactly 600 seconds');
  iso(commitment.committed_at, 'review dispatch commitment time');
  validatePreparedRequest(preparedRequest);
  const expectedCandidate = preparedRequest.request.policy.candidates[commitment.candidate_index];
  if (
    commitment.plan_path !== preparedRequest.plan_path ||
    commitment.orchestration_state_sha256 !== preparedRequest.orchestration_state_sha256 ||
    commitment.prepared_request_sha256 !== sha256(jcs(preparedRequest)) ||
    expectedCandidate === undefined ||
    jcs(commitment.candidate) !== jcs(expectedCandidate)
  )
    throw new Error('review dispatch commitment prepared request or candidate position mismatch');
  return commitment;
}

function validateProposedControllerConfigShape(config) {
  assertClosed(config, PROPOSED_CONTROLLER_CONFIG_KEYS, 'proposed controller config');
  if (!Number.isInteger(config.candidate_index) || config.candidate_index < 0)
    throw new Error('proposed controller config candidate index');
  string(config.timeout_mode, 'proposed controller config timeout mode');
  if (!Number.isInteger(config.timeout_seconds)) throw new Error('proposed controller config timeout seconds');
  validateArgv(config.argv, 'proposed controller config argv');
  digest(config.argv_sha256, 'proposed controller config argv');
  if (config.argv_sha256 !== sha256(jcs(config.argv))) throw new Error('proposed controller config argv hash mismatch');
  return config;
}

function bindProposedControllerConfig(config, preparedRequest) {
  validateProposedControllerConfigShape(config);
  const candidate = preparedRequest.request.policy.candidates[config.candidate_index];
  if (candidate === undefined) throw new Error('proposed controller config candidate position');
  committedLaunchContext(config.argv, candidate, preparedRequest.request);
  return config;
}

function controllerContractValidationError(config) {
  if (config.timeout_mode !== 'orchestrator_tool') return 'controller timeout_mode must equal orchestrator_tool';
  if (config.timeout_seconds !== 600) return 'controller timeout_seconds must equal exactly 600';
  return null;
}

function validateControllerAbortRecord(abort, state, preparedRequest) {
  assertClosed(abort, CONTROLLER_ABORT_KEYS, 'review controller config abort');
  if (abort.schema !== 1 || abort.type !== 'ReviewControllerConfigAbortV1')
    throw new Error('review controller config abort schema or type');
  string(abort.plan_path, 'review controller config abort plan path');
  oneOf(abort.phase, new Set(['draft', 'completion']), 'review controller config abort phase');
  oneOf(
    abort.lifecycle_intent,
    new Set(['none', 'start', 'schedule_fire', 'auto_execute']),
    'review controller config abort lifecycle intent',
  );
  if (!UUID.test(abort.orchestration_series_id)) throw new Error('review controller config abort series');
  digest(abort.source_state_sha256, 'review controller config abort source state');
  digest(abort.source_plan_blob_sha256, 'review controller config abort source plan');
  validateRequestIds(abort.request_ids, 'review controller config abort');
  digest(abort.prepared_request_sha256, 'review controller config abort prepared request');
  bindProposedControllerConfig(abort.proposed_controller_config, preparedRequest);
  if (abort.dispatch_status !== 'not_dispatched' || abort.reason !== 'controller_contract_failure')
    throw new Error('review controller config abort outcome');
  string(abort.validation_error, 'review controller config abort validation error');
  iso(abort.recorded_at, 'review controller config abort time');
  const expectedError = controllerContractValidationError(abort.proposed_controller_config);
  if (expectedError === null) throw new Error('valid exact-600 controller config cannot abort');
  if (abort.validation_error !== expectedError)
    throw new Error('review controller config abort validation error mismatch');
  if (
    abort.plan_path !== state.plan_path ||
    abort.phase !== state.phase ||
    abort.lifecycle_intent !== state.lifecycle_intent ||
    abort.orchestration_series_id !== state.series_id ||
    abort.source_state_sha256 !== state.state_sha256 ||
    jcs(abort.request_ids) !== jcs(state.request_ids) ||
    abort.prepared_request_sha256 !== sha256(jcs(preparedRequest))
  )
    throw new Error('review controller config abort source identity mismatch');
  return abort;
}

function exactAuthorizationSourceBytes(authorization) {
  string(authorization.source_text_utf8_base64, 'review abandonment authorization source base64');
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(authorization.source_text_utf8_base64))
    throw new Error('review abandonment authorization source base64 is invalid');
  const bytes = Buffer.from(authorization.source_text_utf8_base64, 'base64');
  if (bytes.toString('base64') !== authorization.source_text_utf8_base64)
    throw new Error('review abandonment authorization source base64 is noncanonical');
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new Error('review abandonment authorization source is invalid UTF-8');
  }
  if (sha256(bytes) !== authorization.source_text_sha256)
    throw new Error('review abandonment authorization source digest mismatch');
  return bytes;
}

function validateAbandonmentAuthorization(authorization, state = null, sourceTextBytes = null) {
  assertClosed(authorization, ABANDONMENT_AUTHORIZATION_KEYS, 'review abandonment authorization');
  if (
    authorization.schema !== 1 ||
    !UUID.test(authorization.authorization_id) ||
    authorization.actor !== 'user' ||
    authorization.decision !== 'abandon_review_orchestration'
  )
    throw new Error('review abandonment authorization identity, actor, or decision');
  iso(authorization.authorized_at, 'review abandonment authorization time');
  string(authorization.plan_path, 'review abandonment authorization plan path');
  oneOf(authorization.phase, new Set(['draft', 'completion']), 'review abandonment authorization phase');
  oneOf(
    authorization.lifecycle_intent,
    new Set(['none', 'start', 'schedule_fire', 'auto_execute']),
    'review abandonment authorization lifecycle intent',
  );
  digest(authorization.input_sha256, 'review abandonment authorization input');
  if (!UUID.test(authorization.orchestration_series_id)) throw new Error('review abandonment authorization series');
  digest(authorization.source_state_sha256, 'review abandonment authorization source state');
  validateRequestIds(authorization.request_ids, 'review abandonment authorization');
  digest(authorization.source_text_sha256, 'review abandonment authorization source text');
  const persistedBytes = exactAuthorizationSourceBytes(authorization);
  if (sourceTextBytes !== null) {
    if (!(sourceTextBytes instanceof Uint8Array))
      throw new Error('review abandonment requires exact current-user UTF-8 bytes');
    const supplied = Buffer.from(sourceTextBytes);
    try {
      new TextDecoder('utf-8', { fatal: true }).decode(supplied);
    } catch {
      throw new Error('review abandonment source is invalid UTF-8');
    }
    if (!supplied.equals(persistedBytes)) throw new Error('review abandonment authorization source bytes mismatch');
  }
  if (
    state !== null &&
    (authorization.plan_path !== state.plan_path ||
      authorization.phase !== state.phase ||
      authorization.lifecycle_intent !== state.lifecycle_intent ||
      authorization.input_sha256 !== state.current_input_sha256 ||
      authorization.orchestration_series_id !== state.series_id ||
      authorization.source_state_sha256 !== state.state_sha256 ||
      jcs(authorization.request_ids) !== jcs(state.request_ids))
  )
    throw new Error('review abandonment authorization does not match source state identity');
  return authorization;
}

function validateAbandonmentRecord(abandonment, state) {
  assertClosed(abandonment, ABANDONMENT_KEYS, 'review orchestration abandonment');
  if (abandonment.schema !== 1 || abandonment.type !== 'ReviewOrchestrationAbandonmentV1')
    throw new Error('review orchestration abandonment schema or type');
  activePlanPath(abandonment.plan_path, 'review orchestration abandonment plan path');
  oneOf(abandonment.phase, new Set(['draft', 'completion']), 'review orchestration abandonment phase');
  oneOf(
    abandonment.lifecycle_intent,
    new Set(['none', 'start', 'schedule_fire', 'auto_execute']),
    'review orchestration abandonment lifecycle intent',
  );
  if (!UUID.test(abandonment.orchestration_series_id)) throw new Error('review orchestration abandonment series');
  digest(abandonment.source_state_sha256, 'review orchestration abandonment source state');
  digest(abandonment.source_plan_blob_sha256, 'review orchestration abandonment source plan');
  validateRequestIds(abandonment.request_ids, 'review orchestration abandonment');
  digest(abandonment.current_input_sha256, 'review orchestration abandonment current input');
  if (
    ![1, 2].includes(abandonment.round_index) ||
    abandonment.outcome !== 'abandoned' ||
    abandonment.reason !== 'dispatch_provenance_unavailable'
  )
    throw new Error('review orchestration abandonment outcome or round');
  validateAbandonmentAuthorization(abandonment.authorization, state);
  iso(abandonment.recorded_at, 'review orchestration abandonment time');
  if (
    abandonment.plan_path !== state.plan_path ||
    abandonment.phase !== state.phase ||
    abandonment.lifecycle_intent !== state.lifecycle_intent ||
    abandonment.orchestration_series_id !== state.series_id ||
    abandonment.source_state_sha256 !== state.state_sha256 ||
    jcs(abandonment.request_ids) !== jcs(state.request_ids) ||
    abandonment.current_input_sha256 !== state.current_input_sha256 ||
    abandonment.round_index !== state.round_index
  )
    throw new Error('review orchestration abandonment source identity mismatch');
  return abandonment;
}

export function validateCanonicalOrchestrationFamily(records) {
  const state = records.get(ORCHESTRATION_STATE_KIND) ?? null;
  const preparedRequest = records.get(PREPARED_REQUEST_KIND) ?? null;
  const commitment = records.get(DISPATCH_COMMITMENT_KIND) ?? null;
  const abort = records.get(CONTROLLER_ABORT_KIND) ?? null;
  const abandonment = records.get(ABANDONMENT_KIND) ?? null;
  const hasReceipt = [...REVIEW_RECEIPT_KINDS].some((kind) => records.has(kind));
  const hasRecoveryRecord = preparedRequest !== null || commitment !== null || abort !== null || abandonment !== null;
  if (state === null) {
    if (hasRecoveryRecord) throw new Error('review orchestration recovery record family is missing state');
    return null;
  }
  validateReviewOrchestrationState(state);
  if (preparedRequest !== null) validatePreparedRequest(preparedRequest, state.terminated_from_state ?? state);
  if (commitment !== null) {
    if (preparedRequest === null) throw new Error('review dispatch commitment is orphaned from prepared request');
    if (state.status !== 'active') throw new Error('review dispatch commitment requires active family');
    validateDispatchCommitment(commitment, preparedRequest);
  }
  if (abort !== null && abandonment !== null) throw new Error('crossed review terminal families are forbidden');
  if (abort !== null || abandonment !== null) {
    if (hasReceipt) throw new Error('review terminal family cannot coexist with a receipt');
    if (commitment !== null) throw new Error('review terminal family cannot coexist with a dispatch commitment');
    if (state.schema !== 2 || state.status !== 'stuck' || state.series_sha256 !== null)
      throw new Error('review terminal family requires seriesless stuck StateV2');
    const source = state.terminated_from_state;
    if (abort !== null) {
      if (preparedRequest === null || state.stop_reason !== 'controller_contract_failure')
        throw new Error('controller abort terminal family requires prepared request and matching reason');
      validateControllerAbortRecord(abort, source, preparedRequest);
      if (state.terminal_evidence_sha256 !== sha256(jcs(abort)))
        throw new Error('controller abort terminal evidence hash mismatch');
    } else {
      if (preparedRequest !== null || state.stop_reason !== 'authorized_abandonment')
        throw new Error('abandonment terminal family cannot carry prepared request');
      validateAbandonmentRecord(abandonment, source);
      if (state.terminal_evidence_sha256 !== sha256(jcs(abandonment)))
        throw new Error('abandonment terminal evidence hash mismatch');
    }
  } else if (state.schema === 2 && state.terminal_evidence_sha256 !== null) {
    throw new Error('review orchestration terminal state is orphaned from terminal record');
  } else if (hasRecoveryRecord && state.status !== 'active') {
    throw new Error('prepared review records require active state unless paired with controller abort');
  }
  return { state, preparedRequest, commitment, abort, abandonment, hasReceipt };
}

function safeLogical(logical) {
  if (
    typeof logical !== 'string' ||
    !logical ||
    logical.includes('\\') ||
    logical.includes('\0') ||
    path.isAbsolute(logical)
  )
    throw new Error(`path escapes repo: ${logical}`);
  const segments = logical.split('/');
  if (segments.some((segment) => segment === '' || segment === '.' || segment === '..') || segments[0] === '.git')
    throw new Error(`path escapes repo: ${logical}`);
  return logical;
}

function reviewerWorkspacePath(requestId, leg) {
  if (!UUID.test(requestId)) throw new Error('reviewer workspace request id');
  oneOf(leg, new Set(['X', 'S', 'primary']), 'reviewer workspace role');
  return path.join(REVIEW_WORK_ROOT, `${requestId}-${leg}`);
}

function validateReviewerWorkspaceRecord(prepared, requestId, leg) {
  assertClosed(prepared, ['schema', 'request_id', 'leg', 'workspace', 'cleanup_token'], 'prepared reviewer workspace');
  const workspace = reviewerWorkspacePath(requestId, leg);
  if (
    prepared.schema !== 1 ||
    prepared.request_id !== requestId ||
    prepared.leg !== leg ||
    prepared.workspace !== workspace ||
    !path.isAbsolute(prepared.workspace)
  )
    throw new Error('reviewer workspace identity mismatch');
  digest(prepared.cleanup_token, 'reviewer workspace cleanup token');
  return prepared;
}

function exactUtf8(bytes, label) {
  const raw = bytes instanceof Uint8Array ? Buffer.from(bytes) : Buffer.from(bytes);
  const text = decodeUtf8(raw);
  if (!raw.equals(Buffer.from(text))) throw new Error(`${label} must use LF UTF-8 bytes`);
  return text;
}

function withoutCompletionReview(bytes) {
  const text = exactUtf8(bytes, 'plan');
  const firstLf = text.indexOf('\n');
  const frontmatterEnd = text.indexOf('\n---\n', firstLf);
  if (firstLf !== 3 || frontmatterEnd < 0 || !text.endsWith('\n')) {
    throw new Error('plan frontmatter or body boundary');
  }
  parsePlan(Buffer.from(text));
  const bodyAt = frontmatterEnd + 5;
  const prefix = text.slice(0, bodyAt);
  const body = text.slice(bodyAt);
  const headings = [];
  let offset = 0;
  let fence = null;
  for (const match of body.matchAll(/([^\n]*)\n/g)) {
    const line = match[1];
    const fenceMatch = /^( {0,3})(`{3,}|~{3,})(.*)$/.exec(line);
    if (fence === null && fenceMatch) {
      fence = { marker: fenceMatch[2][0], length: fenceMatch[2].length };
    } else if (
      fence !== null &&
      fenceMatch &&
      fenceMatch[2][0] === fence.marker &&
      fenceMatch[2].length >= fence.length &&
      /^\s*$/.test(fenceMatch[3])
    ) {
      fence = null;
    } else if (fence === null) {
      const heading = /^## ([^\n]+)$/.exec(line);
      if (heading) headings.push({ name: heading[1], start: offset });
    }
    offset += match[0].length;
  }
  if (offset !== body.length) throw new Error('plan body row boundary');
  const names = new Set();
  for (const heading of headings) {
    if (names.has(heading.name)) throw new Error('execution compatibility duplicate body heading');
    names.add(heading.name);
  }
  const reviewIndex = headings.findIndex(({ name }) => name === 'Review');
  if (reviewIndex < 0) throw new Error('plan must contain one unfenced ## Review section');
  const review = headings[reviewIndex];
  const end = headings[reviewIndex + 1]?.start ?? body.length;
  return Buffer.from(`${prefix}${body.slice(0, review.start)}${body.slice(end)}`);
}

export function completionStablePlanViewV1(bytes) {
  return canonicalPlanView(withoutCompletionReview(bytes));
}

export function classifyLeg({ leg, policy, waiver = null, decision = null, attempts = [], eligibleTierCount }) {
  oneOf(leg, new Set(['X', 'S']), 'leg');
  validatePolicy(policy);
  if (waiver) return 'waived';
  if (leg === 'X' && (policy.cross_company_consent === 'never' || decision?.decision === 'deny'))
    return 'not_authorized';
  if (attempts.length > eligibleTierCount + (policy.schema === 1 ? 1 : 0)) {
    throw new Error('attempt bound exceeded');
  }
  if (attempts.some((attempt) => attempt.result === 'platform_denied')) return 'platform_denied';
  if (attempts.length === 0 || attempts.at(-1)?.result === 'auth_failed') return 'unavailable_auth';
  const tierFailures = attempts.filter((attempt) => attempt.result !== 'transient_transport');
  if (
    tierFailures.length === eligibleTierCount &&
    tierFailures.every((attempt) => attempt.result === 'model_unavailable')
  )
    return 'unavailable_model';
  if (attempts.some((attempt) => attempt.result === 'deadline_exceeded')) return 'timed_out';
  if (attempts.at(-1)?.result === 'unparseable') return 'failed_unparseable';
  if (attempts.at(-1)?.result === 'passed') return 'passed';
  return 'unavailable_unknown';
}
