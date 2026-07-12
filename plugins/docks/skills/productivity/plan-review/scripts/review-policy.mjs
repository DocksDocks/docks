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
]);
const MACHINE_RECORD = /^(?:Bootstrap-review-record|Review-receipt|Completion-review-receipt): /;
const LEG_RESULTS = new Set(['passed', 'waived', 'not_authorized', 'unavailable_auth', 'unavailable_model', 'timed_out', 'platform_denied', 'failed_unparseable', 'unavailable_unknown']);
const ATTEMPT_RESULTS = new Set(['passed', 'auth_failed', 'model_unavailable', 'deadline_exceeded', 'platform_denied', 'transient_transport', 'nonzero_exit', 'signaled', 'unparseable']);
const SOURCES = new Set(['current_user', 'runtime_global', 'skill_default']);

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
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value)) throw new Error('JCS accepts safe integers only');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(jcs).join(',')}]`;
  if (typeof value === 'object') {
    const keys = Object.keys(value).sort(compareUtf16);
    return `{${keys.map((key) => `${JSON.stringify(key)}:${jcs(value[key])}`).join(',')}}`;
  }
  throw new Error(`unsupported JCS value: ${typeof value}`);
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
  let machineRecords = 0;
  const retained = body.split('\n').filter((line) => {
    if (!MACHINE_RECORD.test(line)) return true;
    machineRecords += 1;
    if (line.includes('\n')) throw new Error('multiline machine record');
    return false;
  });
  if (machineRecords > 3) throw new Error('duplicate machine records');
  return `${jcs(kept)}\n${retained.join('\n').replace(/\n*$/, '')}\n`;
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
  assertClosed(request, ['schema', 'request_id', 'phase', 'lifecycle_intent', 'reviewed_commit_or_head', 'input_sha256', 'bundle_sha256', 'policy', 'policy_sha256'], 'request');
  if (request.schema !== 1 || !UUID.test(request.request_id)) throw new Error('request identity');
  oneOf(request.phase, new Set(['draft', 'completion']), 'phase');
  oneOf(request.lifecycle_intent, new Set(['none', 'start', 'schedule_fire', 'auto_execute']), 'lifecycle_intent');
  if (!HEX40.test(request.reviewed_commit_or_head)) throw new Error('reviewed commit');
  digest(request.input_sha256, 'input_sha256'); digest(request.bundle_sha256, 'bundle_sha256'); digest(request.policy_sha256, 'policy_sha256');
  validatePolicy(request.policy);
  if (sha256(jcs(request.policy)) !== request.policy_sha256) throw new Error('policy hash mismatch');
  return request;
}

export function reviewerSchema(leg) {
  oneOf(leg, new Set(['X', 'S']), 'leg');
  const closed = (properties, required = Object.keys(properties)) => ({ type: 'object', additionalProperties: false, properties, required });
  const str = { type: 'string', minLength: 1 };
  const request = closed({
    schema: { const: 1 }, request_id: { type: 'string', pattern: UUID.source }, phase: { enum: ['draft', 'completion'] },
    lifecycle_intent: { enum: ['none', 'start', 'schedule_fire', 'auto_execute'] }, reviewed_commit_or_head: { type: 'string', pattern: HEX40.source },
    input_sha256: { type: 'string', pattern: HEX64.source }, bundle_sha256: { type: 'string', pattern: HEX64.source }, policy: { type: 'object' }, policy_sha256: { type: 'string', pattern: HEX64.source },
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

export function validateReviewerOutput(output, request, leg) {
  assertClosed(output, ['schema', 'leg', 'request', 'verdict', 'score', 'findings', 'confirmations'], 'reviewer output');
  if (output.schema !== 1 || output.leg !== leg || jcs(output.request) !== jcs(request)) throw new Error('reviewer envelope mismatch');
  validateRequest(output.request); oneOf(output.verdict, new Set(['ready', 'not_ready']), 'verdict');
  if (!Number.isInteger(output.score) || output.score < 0 || output.score > 100) throw new Error('score');
  if (!Array.isArray(output.findings) || !Array.isArray(output.confirmations)) throw new Error('reviewer arrays');
  const ids = new Set(); output.findings.forEach((finding) => validateFinding(finding, leg, ids)); output.confirmations.forEach((v) => string(v, 'confirmation'));
  return output;
}

export function extractReviewerOutput(tool, stdout, request, leg) {
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
  return validateReviewerOutput(output, request, leg);
}

export function validateWaivers(waivers, phase, inputSha) {
  if (!Array.isArray(waivers)) throw new Error('waivers must be array');
  const claimed = new Set();
  return waivers.map((waiver) => {
    assertClosed(waiver, ['phase', 'input_sha256', 'legs', 'actor', 'reason', 'at'], 'waiver');
    if (waiver.phase !== phase || waiver.input_sha256 !== inputSha) throw new Error('stale waiver');
    if (!Array.isArray(waiver.legs) || waiver.legs.length === 0 || new Set(waiver.legs).size !== waiver.legs.length) throw new Error('waiver legs');
    const legs = [...waiver.legs].sort(); legs.forEach((leg) => { oneOf(leg, new Set(['X', 'S']), 'waiver leg'); const key = `${phase}:${inputSha}:${leg}`; if (claimed.has(key)) throw new Error('duplicate waiver'); claimed.add(key); });
    string(waiver.actor, 'waiver actor'); string(waiver.reason, 'waiver reason'); iso(waiver.at, 'waiver at');
    return { ...waiver, legs };
  });
}

function statMode(stat) { return (stat.mode & 0o170000).toString(8).padStart(6, '0'); }
function inside(root, candidate) { const rel = path.relative(root, candidate); return rel && !rel.startsWith('..') && !path.isAbsolute(rel); }
function flattenPath(repo, logical, files) {
  const absolute = path.resolve(repo, logical);
  if (!inside(repo, absolute)) throw new Error(`path escapes repo: ${logical}`);
  if (!fs.existsSync(absolute)) return { path: logical, state: 'absent' };
  const stat = fs.lstatSync(absolute);
  if (stat.isSymbolicLink()) { files.push({ path: logical, mode: '120000', bytes: Buffer.from(fs.readlinkSync(absolute)) }); return { path: logical, state: 'file' }; }
  if (stat.isFile()) { files.push({ path: logical, mode: statMode(stat), bytes: fs.readFileSync(absolute) }); return { path: logical, state: 'file' }; }
  if (!stat.isDirectory()) throw new Error(`unsupported file type: ${logical}`);
  const walk = (dir) => {
    for (const name of fs.readdirSync(dir).sort(compareUtf16)) {
      const child = path.join(dir, name); const rel = path.relative(repo, child).split(path.sep).join('/'); const childStat = fs.lstatSync(child);
      if (childStat.isDirectory()) walk(child);
      else if (childStat.isSymbolicLink()) files.push({ path: rel, mode: '120000', bytes: Buffer.from(fs.readlinkSync(child)) });
      else if (childStat.isFile()) files.push({ path: rel, mode: statMode(childStat), bytes: fs.readFileSync(child) });
      else throw new Error(`unsupported file type: ${rel}`);
    }
  };
  walk(absolute); return { path: logical, state: 'directory' };
}

export function sealBundle({ repo, reviewedCommit, planPath, requestedPaths, outDir }) {
  if (!HEX40.test(reviewedCommit)) throw new Error('reviewedCommit');
  const logicalPlan = path.resolve(repo, planPath); if (!inside(repo, logicalPlan) || !fs.statSync(logicalPlan).isFile()) throw new Error('logical plan missing');
  if (fs.existsSync(outDir)) throw new Error('bundle already exists');
  fs.mkdirSync(outDir, { recursive: true, mode: 0o700 });
  const canonical = Buffer.from(canonicalPlanView(fs.readFileSync(logicalPlan)));
  const entries = []; const requested = [];
  const unique = [...new Set(requestedPaths)].sort(compareUtf16);
  if (unique.length !== requestedPaths.length) throw new Error('duplicate requested path');
  for (const logical of unique) requested.push(flattenPath(repo, logical, entries));
  entries.push({ path: 'plan.review.md', mode: '100444', bytes: canonical });
  const schemaBytes = Buffer.from(`${jcs(reviewerSchema('X'))}\n`); entries.push({ path: 'reviewer-output.schema.json', mode: '100444', bytes: schemaBytes });
  entries.sort((a, b) => compareUtf16(a.path, b.path));
  const seen = new Set();
  for (const entry of entries) {
    if (seen.has(entry.path)) throw new Error(`duplicate bundle path: ${entry.path}`); seen.add(entry.path);
    const dest = path.join(outDir, entry.path); if (!inside(outDir, dest)) throw new Error('bundle path escape');
    fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.writeFileSync(dest, entry.bytes, { mode: 0o444 });
  }
  const manifest = {
    schema: 1, plan_path: planPath, plan_view: 'plan.review.md', reviewed_commit: reviewedCommit,
    input_sha256: sha256(canonical), requested,
    files: entries.map((entry) => ({ path: entry.path, mode: entry.mode, sha256: sha256(entry.bytes) })),
  };
  const manifestBytes = Buffer.from(`${jcs(manifest)}\n`); fs.writeFileSync(path.join(outDir, 'manifest.json'), manifestBytes, { mode: 0o444 });
  const hash = createHash('sha256'); hash.update(Buffer.from(String(manifestBytes.length))); hash.update(Buffer.from([0])); hash.update(manifestBytes);
  for (const entry of entries) { hash.update(Buffer.from(String(entry.bytes.length))); hash.update(Buffer.from([0])); hash.update(entry.bytes); }
  for (const directory of [...new Set(entries.map((entry) => path.dirname(path.join(outDir, entry.path))))].sort((a, b) => b.length - a.length)) fs.chmodSync(directory, 0o555);
  fs.chmodSync(outDir, 0o555);
  return { request_id: randomUUID(), input_sha256: manifest.input_sha256, bundle_sha256: hash.digest('hex'), manifest };
}

export function buildReviewerArgv({ tool, bundle, model, effort, leg, request }) {
  validateRequest(request); oneOf(leg, new Set(['X', 'S']), 'leg'); string(model, 'model'); string(effort, 'effort');
  const prompt = `You are the ${leg} independent plan reviewer. Read only the sealed bundle. Return findings only. Copy the request object into ReviewerOutput.request.\nREQUEST_JCS_BEGIN\n${jcs(request)}\nREQUEST_JCS_END`;
  if (tool === 'codex') return ['exec', '-C', bundle, '--skip-git-repo-check', '-s', 'read-only', '-m', model, '-c', `model_reasoning_effort=${effort}`, '--output-schema', path.join(bundle, 'reviewer-output.schema.json'), '--', prompt];
  if (tool === 'claude') return ['-p', '--permission-mode', 'plan', '--model', model, '--effort', effort, '--json-schema', jcs(reviewerSchema(leg)), '--output-format', 'json', '--', prompt];
  throw new Error('schema v1 supports codex or claude CLI only; relay is not supported');
}

export function classifyLeg({ leg, policy, waiver = null, decision = null, attempts = [], eligibleTierCount }) {
  oneOf(leg, new Set(['X', 'S']), 'leg'); validatePolicy(policy);
  if (waiver) return 'waived';
  if (leg === 'X' && (policy.cross_company_consent === 'never' || decision?.decision === 'deny')) return 'not_authorized';
  if (attempts.length > eligibleTierCount + 1) throw new Error('attempt bound exceeded');
  if (attempts.some((attempt) => attempt.result === 'platform_denied')) return 'platform_denied';
  if (attempts.length === 0 || attempts.some((attempt) => attempt.result === 'auth_failed')) return 'unavailable_auth';
  if (attempts.every((attempt) => attempt.result === 'model_unavailable')) return 'unavailable_model';
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

export function run(argv = process.argv.slice(2)) {
  const [command, ...args] = argv;
  if (command === 'canonical-plan') { process.stdout.write(canonicalPlanView(fs.readFileSync(args[0]))); return; }
  if (command === 'schema') { process.stdout.write(`${jcs(reviewerSchema(args[0]))}\n`); return; }
  if (command === 'validate-reviewer') {
    const output = JSON.parse(fs.readFileSync(args[0], 'utf8')); const request = JSON.parse(fs.readFileSync(args[1], 'utf8'));
    validateReviewerOutput(output, request, args[2]); process.stdout.write('valid reviewer output\n'); return;
  }
  if (command === 'bundle') {
    const [repo, commit, plan, out, ...paths] = args; process.stdout.write(`${jcs(sealBundle({ repo: path.resolve(repo), reviewedCommit: commit, planPath: plan, requestedPaths: paths, outDir: path.resolve(out) }))}\n`); return;
  }
  if (command === 'probe') {
    const [tool] = args; const result = spawnSync(tool, tool === 'codex' ? ['login', 'status'] : ['auth', 'status'], { encoding: 'utf8' });
    process.stdout.write(`${jcs({ available: !result.error && result.status === 0, exit_code: result.status ?? null })}\n`); return;
  }
  throw new Error('usage: review-policy.mjs canonical-plan|schema|validate-reviewer|bundle|probe ...');
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try { run(); } catch (error) { console.error(`review-policy: ${error.message}`); process.exitCode = 1; }
}
