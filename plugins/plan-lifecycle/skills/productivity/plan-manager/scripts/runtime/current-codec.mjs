import { createHash } from 'node:crypto';
import path from 'node:path';
import { validateAffectedPathManifest } from './git-preimage.mjs';
import {
  assertClosed,
  assertPlainObject,
  assertUnicodeScalarString,
  compareUtf16,
  EXCLUDED_SECTIONS,
  fail,
  HASH,
  IDENTIFIED_STEP_COLUMNS,
  LEGACY_STEP_COLUMNS,
  LIFECYCLE_FRONTMATTER,
  NORMALIZED_STEP_STATUS,
  PLAN_ATTEMPT_KEYS,
  PLAN_HASH_MODE,
  PLAN_STATUSES,
  STEP_STATUSES,
  UUID,
  validatePlanRunRecord,
} from './plan-state.mjs';

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

export function decodeUtf8(bytes) {
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

export function fenceAt(line) {
  const match = /^( {0,3})(`{3,}|~{3,})(.*)$/.exec(line);
  return match ? { marker: match[2][0], length: match[2].length, tail: match[3] } : null;
}

function headingAt(line) {
  const match = /^(#{1,6})[ \t]+(.+?)[ \t]*#*[ \t]*$/.exec(line);
  return match ? { level: match[1].length, title: match[2].trim() } : null;
}
function markdownTableCells(line) {
  const first = line.search(/\S/);
  if (first < 0 || first > 3 || line[first] !== '|') return null;
  const dividers = [];
  let codeTicks = 0;
  for (let index = first; index < line.length; index += 1) {
    if (line[index] === '`') {
      let end = index + 1;
      while (line[end] === '`') end += 1;
      const length = end - index;
      if (codeTicks === 0) codeTicks = length;
      else if (codeTicks === length) codeTicks = 0;
      index = end - 1;
      continue;
    }
    if (line[index] !== '|' || codeTicks !== 0) continue;
    let escapes = 0;
    for (let cursor = index - 1; cursor >= 0 && line[cursor] === '\\'; cursor -= 1) escapes += 1;
    if (escapes % 2 === 0) dividers.push(index);
  }
  if (codeTicks !== 0 || dividers.length < 2 || !/^\s*$/.test(line.slice(dividers.at(-1) + 1))) return null;
  return dividers.slice(0, -1).map((start, index) => ({
    end: dividers[index + 1],
    raw: line.slice(start + 1, dividers[index + 1]),
    start: start + 1,
  }));
}

function stepStatus(raw) {
  const value = raw.trim();
  const match = /^(?:`([^`]+)`|([^`]+))$/.exec(value);
  const status = match?.[1] ?? match?.[2] ?? null;
  return status !== null && STEP_STATUSES.has(status) ? status : null;
}

export function parseStepsTable(body) {
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
  if (fence !== null) fail('Steps discovery rejects an unclosed Markdown fence');
  const matching = headings.filter((heading) => heading.level === 2 && heading.title === 'Steps');
  if (matching.length === 0) fail('status-excluded-v1 requires one unfenced ## Steps section');
  if (matching.length !== 1) fail('status-excluded-v1 rejects duplicate ## Steps sections');
  const start = matching[0].index;
  const following = headings.find((heading) => heading.index > start && heading.level <= 2);
  const end = following?.index ?? lines.length;
  let headerIndex = start + 1;
  while (headerIndex < end && /^\s*$/.test(lines[headerIndex])) headerIndex += 1;
  const header = markdownTableCells(lines[headerIndex] ?? '');
  const separator = markdownTableCells(lines[headerIndex + 1] ?? '');
  if (header === null || separator === null) fail('## Steps must begin with an exact Markdown table');
  const columns = header.map(({ raw }) => raw.trim());
  const expected = columns.length === IDENTIFIED_STEP_COLUMNS.length ? IDENTIFIED_STEP_COLUMNS : LEGACY_STEP_COLUMNS;
  if (columns.length !== expected.length || columns.some((column, index) => column !== expected[index])) {
    fail('## Steps table columns do not match the canonical schema');
  }
  if (separator.length !== columns.length || separator.some(({ raw }) => !/^:?-{3,}:?$/.test(raw.trim()))) {
    fail('## Steps table separator is invalid');
  }
  const numberIndex = columns.indexOf('#');
  const idIndex = columns.indexOf('Id');
  const statusIndex = columns.indexOf('Status');
  const rows = [];
  const numbers = new Set();
  const ids = new Set();
  for (let index = headerIndex + 2; index < end; index += 1) {
    if (/^\s*$/.test(lines[index])) {
      if (lines.slice(index, end).some((line) => !/^\s*$/.test(line))) {
        fail('## Steps must contain only its canonical table');
      }
      break;
    }
    const cells = markdownTableCells(lines[index]);
    if (cells === null || cells.length !== columns.length) fail('## Steps row does not match its header');
    const number = cells[numberIndex].raw.trim();
    if (!/^[1-9]\d*$/.test(number)) fail('## Steps row number must be a positive integer');
    if (numbers.has(number)) fail(`duplicate ## Steps row number: ${number}`);
    numbers.add(number);
    const id = idIndex < 0 ? null : cells[idIndex].raw.trim();
    if (id !== null && !/^[a-z][a-z0-9_]{0,63}$/.test(id)) fail('## Steps row Id is invalid');
    if (id !== null && ids.has(id)) fail(`duplicate ## Steps row Id: ${id}`);
    if (id !== null) ids.add(id);
    const identity = id === null ? number : `${number}\u0000${id}`;
    const status = stepStatus(cells[statusIndex].raw);
    if (status === null) fail('## Steps row Status is invalid');
    rows.push({
      identity,
      lineIndex: index,
      status,
      statusEnd: cells[statusIndex].end,
      statusStart: cells[statusIndex].start,
    });
  }
  if (rows.length === 0) fail('## Steps table must contain at least one row');
  return { lines, rows };
}

export function bodyWithNormalizedStepStatuses(body, table = parseStepsTable(body)) {
  const lines = [...table.lines];
  for (const row of table.rows) {
    const line = lines[row.lineIndex];
    lines[row.lineIndex] = line.slice(0, row.statusStart) + NORMALIZED_STEP_STATUS + line.slice(row.statusEnd);
  }
  return lines.join('\n');
}

export function canonicalPlanViewFromParsed(frontmatter, body, normalizeStatuses) {
  const kept = Object.create(null);
  for (const [key, value] of Object.entries(frontmatter)) {
    if (!LIFECYCLE_FRONTMATTER.has(key)) kept[key] = value;
  }
  const canonicalInput = normalizeStatuses ? bodyWithNormalizedStepStatuses(body) : body;
  return `${jcs(kept)}\n${canonicalBody(canonicalInput)}\n`;
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
  return canonicalPlanViewFromParsed(frontmatter, body, frontmatter.plan_hash_mode === PLAN_HASH_MODE);
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

export function normalizeLogicalPaths(values, label = 'path') {
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

export function canReopenExistingRun(run) {
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
  const hashMode = parsed.frontmatter.plan_hash_mode;
  if (hashMode !== undefined && hashMode !== PLAN_HASH_MODE) fail('frontmatter plan_hash_mode is invalid');
  let digest = sha256(canonicalPlanViewFromParsed(parsed.frontmatter, parsed.body, false));
  let bootstrapDigest = null;
  if (hashMode === PLAN_HASH_MODE) {
    const steps = parseStepsTable(parsed.body);
    const legacyDigest = digest;
    digest = sha256(
      canonicalPlanViewFromParsed(parsed.frontmatter, bodyWithNormalizedStepStatuses(parsed.body, steps), false),
    );
    if (steps.rows.every((row) => row.status === 'planned')) bootstrapDigest = legacyDigest;
  }
  if (run.plan_sha256 !== digest && run.plan_sha256 !== bootstrapDigest) {
    fail('plan_sha256 does not match canonical plan digest');
  }
  validateAcceptedPlanBindings(bytes, parsed.frontmatter, run, expected);
  return { attempt_history: attemptHistory, frontmatter: parsed.frontmatter, run, status };
}
