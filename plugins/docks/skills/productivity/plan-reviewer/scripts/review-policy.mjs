#!/usr/bin/env node
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { canonicalPlanView, jcs, validateAffectedPathManifest } from '../../plan-manager/scripts/plan-run.mjs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HEX40 = /^[0-9a-f]{40}$/;
const HEX64 = /^[0-9a-f]{64}$/;
const FINDING_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const KIND_TOKEN = /^[a-z][a-z0-9_]{0,63}$/;
export const PLAN_FINDING_CLASSES = Object.freeze({
  missing_decision: Object.freeze(['v1_missing_decision']),
  contradiction: Object.freeze(['v1_contract_contradiction', 'v1_evidence_mismatch', 'v1_unstable_step_reference']),
  unsafe_scope: Object.freeze(['v1_unauthorized_effect', 'v1_missing_safety_boundary', 'v1_affected_paths_incomplete']),
  missing_acceptance: Object.freeze([
    'v1_acceptance_command_not_runnable',
    'v1_acceptance_output_mismatch',
    'v1_acceptance_coverage_incomplete',
    'v1_failure_action_missing',
  ]),
});
const PLAN_FINDING_KINDS = new Set(Object.keys(PLAN_FINDING_CLASSES));
const PLAN_FINDING_CLASS_VOCABULARY = new Set(Object.values(PLAN_FINDING_CLASSES).flat());
const VERDICTS = new Set(['pass', 'repair', 'blocked']);
const MAX_REVIEW_BYTES = 32 * 1024;
const BUNDLE_PREFIX = 'plan-review-v1-';
const BUNDLE_FILES = Object.freeze(['binding.json', 'manifest.json', 'plan.md']);
const MANIFEST_EXPECTATION_KEYS = Object.freeze(['repo', 'paths', 'sourceBase']);
const IMMUTABLE_STAT_FIELDS = Object.freeze(['dev', 'ino', 'mode', 'nlink', 'uid', 'size', 'mtimeNs', 'ctimeNs']);
const UTF8_DECODER = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function assertPlainObject(value, label) {
  if (!isPlainObject(value)) throw new Error(`${label} must be a plain object`);
}

function assertClosed(value, keys, label) {
  assertClosedWithOptional(value, keys, [], label);
}

function assertClosedWithOptional(value, requiredKeys, optionalKeys, label) {
  assertPlainObject(value, label);
  const allowed = new Set([...requiredKeys, ...optionalKeys]);
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string' || !allowed.has(key)) throw new Error(`${label} has unknown field ${String(key)}`);
  }
  for (const key of requiredKeys) {
    if (!Object.hasOwn(value, key)) throw new Error(`${label} is missing ${key}`);
  }
}

function assertJsonValue(value, label, seen = new Set()) {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error(`${label} must contain finite JSON numbers`);
    return;
  }
  if (typeof value !== 'object') throw new Error(`${label} must contain JSON values only`);
  if (seen.has(value)) throw new Error(`${label} must not be cyclic`);
  seen.add(value);
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      if (!Object.hasOwn(value, index)) throw new Error(`${label} must not contain sparse arrays`);
      assertJsonValue(value[index], `${label}[${index}]`, seen);
    }
  } else {
    assertPlainObject(value, label);
    for (const key of Reflect.ownKeys(value)) {
      if (typeof key !== 'string') throw new Error(`${label} must not contain symbol keys`);
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !Object.hasOwn(descriptor, 'value')) throw new Error(`${label} must not contain accessors`);
      assertJsonValue(descriptor.value, `${label}.${key}`, seen);
    }
  }
  seen.delete(value);
}

function compareUtf16(left, right) {
  const a = String(left);
  const b = String(right);
  const length = Math.min(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    const difference = a.charCodeAt(index) - b.charCodeAt(index);
    if (difference !== 0) return difference;
  }
  return a.length - b.length;
}

function nonemptyString(value, label) {
  if (typeof value !== 'string' || value.length === 0) throw new Error(`${label} must be a non-empty string`);
  if (/\p{Cc}/u.test(value)) throw new Error(`${label} must not contain control characters`);
}

function validateUuid(value, label) {
  if (typeof value !== 'string' || !UUID.test(value)) throw new Error(`${label} must be a UUID`);
}

function validateInvocation(value, label) {
  if (value !== 1 && value !== 2) throw new Error(`${label} invocation must be 1 or 2`);
}

function validateDigest(value, label) {
  if (typeof value !== 'string' || !HEX64.test(value)) throw new Error(`${label} must be a lowercase sha256 digest`);
}

function validateCommit(value, label) {
  if (typeof value !== 'string' || !HEX40.test(value)) throw new Error(`${label} must be a lowercase 40-hex commit`);
}

function validatePlanBinding(binding, label = 'plan review binding') {
  assertClosed(binding, ['run_id', 'invocation', 'plan_sha256', 'source_sha256'], label);
  validateUuid(binding.run_id, `${label} run_id`);
  validateInvocation(binding.invocation, label);
  validateDigest(binding.plan_sha256, `${label} plan_sha256`);
  validateDigest(binding.source_sha256, `${label} source_sha256`);
  return binding;
}

function validateCompletionBinding(binding, label = 'completion review binding') {
  assertClosed(binding, ['run_id', 'invocation', 'implementation_commit', 'diff_sha256'], label);
  validateUuid(binding.run_id, `${label} run_id`);
  validateInvocation(binding.invocation, label);
  validateCommit(binding.implementation_commit, `${label} implementation_commit`);
  validateDigest(binding.diff_sha256, `${label} diff_sha256`);
  return binding;
}

function decodeReviewValue(value, label) {
  let parsed;
  let bytes;
  let text = null;
  if (typeof value === 'string') {
    text = value;
    bytes = Buffer.from(value);
    if (bytes.length > MAX_REVIEW_BYTES) throw new Error(`${label} exceeds the 32 KiB output limit`);
  } else if (value instanceof Uint8Array) {
    bytes = Buffer.from(value.buffer, value.byteOffset, value.byteLength);
    if (bytes.length > MAX_REVIEW_BYTES) throw new Error(`${label} exceeds the 32 KiB output limit`);
    try {
      text = UTF8_DECODER.decode(bytes);
    } catch {
      throw new Error(`${label} is not valid UTF-8 JSON`);
    }
  } else {
    assertJsonValue(value, label);
    bytes = Buffer.from(jcs(value));
    if (bytes.length > MAX_REVIEW_BYTES) throw new Error(`${label} exceeds the 32 KiB output limit`);
    parsed = value;
  }

  if (text !== null) {
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new Error(`${label} is not valid JSON`);
    }
    assertJsonValue(parsed, label);
    if (text !== jcs(parsed)) throw new Error(`${label} must be byte-for-byte compact canonical JCS`);
  }
  return parsed;
}

function validateFinding(finding, label, allowedKinds = null, allowedClasses = null) {
  const keys = ['id', 'kind', 'locator', 'defect', 'fix'];
  if (allowedClasses !== null) keys.splice(2, 0, 'class');
  assertClosed(finding, keys, label);
  if (typeof finding.id !== 'string' || !FINDING_ID.test(finding.id)) {
    throw new Error(`${label} id must be a compact identifier`);
  }
  if (typeof finding.kind !== 'string' || !KIND_TOKEN.test(finding.kind)) {
    throw new Error(`${label} kind must be a compact token`);
  }
  if (allowedKinds !== null && !allowedKinds.has(finding.kind)) throw new Error(`${label} kind is unknown`);
  if (allowedClasses !== null) {
    if (typeof finding.class !== 'string') throw new Error(`${label} class must be a string`);
    if (!finding.class.startsWith('v1_')) {
      throw new Error(`${label} class has the wrong vocabulary version; expected v1_`);
    }
    if (!PLAN_FINDING_CLASS_VOCABULARY.has(finding.class)) throw new Error(`${label} class is unknown`);
    if (!allowedClasses[finding.kind].includes(finding.class)) {
      throw new Error(`${label} class is incompatible with kind ${finding.kind}`);
    }
  }
  nonemptyString(finding.locator, `${label} locator`);
  nonemptyString(finding.defect, `${label} defect`);
  nonemptyString(finding.fix, `${label} fix`);
}

function validateReviewEnvelope(review, label, keys, binding, bindingKeys, allowedKinds = null, allowedClasses = null) {
  assertClosed(review, keys, label);
  if (review.schema !== 1) throw new Error(`${label} schema must be 1`);
  validateUuid(review.run_id, `${label} run_id`);
  validateInvocation(review.invocation, label);
  if (!VERDICTS.has(review.verdict)) throw new Error(`${label} verdict is invalid`);
  if (!Array.isArray(review.findings)) throw new Error(`${label} findings must be an array`);
  const ids = new Set();
  for (let index = 0; index < review.findings.length; index += 1) {
    const finding = review.findings[index];
    validateFinding(finding, `${label} finding ${index + 1}`, allowedKinds, allowedClasses);
    if (ids.has(finding.id)) throw new Error(`${label} finding ids must be unique`);
    ids.add(finding.id);
  }
  if (review.verdict === 'pass' && review.findings.length !== 0) {
    throw new Error(`${label} pass verdict requires no findings`);
  }
  if (review.verdict !== 'pass' && review.findings.length === 0) {
    throw new Error(`${label} ${review.verdict} verdict requires findings`);
  }
  for (const key of bindingKeys) {
    if (review[key] !== binding[key]) throw new Error(`${label} ${key} binding mismatch`);
  }
}

export function validatePlanReview(value, expectedBinding) {
  const binding = validatePlanBinding(expectedBinding, 'expected plan review binding');
  const review = decodeReviewValue(value, 'PlanReviewV1');
  validateReviewEnvelope(
    review,
    'PlanReviewV1',
    ['schema', 'run_id', 'invocation', 'plan_sha256', 'source_sha256', 'verdict', 'findings'],
    binding,
    ['run_id', 'invocation', 'plan_sha256', 'source_sha256'],
    PLAN_FINDING_KINDS,
    PLAN_FINDING_CLASSES,
  );
  validateDigest(review.plan_sha256, 'PlanReviewV1 plan_sha256');
  validateDigest(review.source_sha256, 'PlanReviewV1 source_sha256');
  if (review.verdict === 'repair' && review.findings.some(({ kind }) => kind === 'missing_decision')) {
    throw new Error('PlanReviewV1 repair findings must be resolvable from repository facts');
  }
  if (
    review.verdict === 'blocked' &&
    review.findings.some(({ kind }) => kind !== 'missing_decision' && kind !== 'unsafe_scope')
  ) {
    throw new Error('PlanReviewV1 blocked findings must identify a required decision or authority');
  }
  return review;
}

export function validateCompletionReview(value, expectedBinding) {
  const binding = validateCompletionBinding(expectedBinding, 'expected completion review binding');
  const review = decodeReviewValue(value, 'CompletionReviewV1');
  validateReviewEnvelope(
    review,
    'CompletionReviewV1',
    ['schema', 'run_id', 'invocation', 'implementation_commit', 'diff_sha256', 'verdict', 'findings'],
    binding,
    ['run_id', 'invocation', 'implementation_commit', 'diff_sha256'],
  );
  validateCommit(review.implementation_commit, 'CompletionReviewV1 implementation_commit');
  validateDigest(review.diff_sha256, 'CompletionReviewV1 diff_sha256');
  return review;
}

function toBuffer(value, label) {
  if (typeof value === 'string') return Buffer.from(value);
  if (value instanceof Uint8Array) return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
  throw new Error(`${label} must be UTF-8 bytes or a string`);
}

function validatePlanBytes(value, binding, label = 'plan bytes') {
  const plan = toBuffer(value, label);
  if (plan.length === 0) throw new Error(`${label} must not be empty`);
  let planText;
  try {
    planText = UTF8_DECODER.decode(plan);
  } catch {
    throw new Error(`${label} must be valid UTF-8`);
  }
  if (planText.includes('\0')) throw new Error(`${label} must not contain NUL`);
  let canonical;
  try {
    canonical = canonicalPlanView(plan);
  } catch (error) {
    throw new Error(`${label} is not a valid canonical plan: ${error.message}`);
  }
  if (sha256(canonical) !== binding.plan_sha256) {
    throw new Error(`${label} canonical plan hash does not match plan_sha256 binding`);
  }
  return plan;
}

function validateManifestExpectation(input, label, required = false) {
  const supplied = MANIFEST_EXPECTATION_KEYS.filter((key) => Object.hasOwn(input, key));
  if (supplied.length === 0) {
    if (required) throw new Error(`${label} repository expectation is required`);
    return null;
  }
  if (supplied.length !== MANIFEST_EXPECTATION_KEYS.length) {
    throw new Error(`${label} repo, paths, and sourceBase must be supplied together`);
  }
  const { repo, paths, sourceBase } = input;
  nonemptyString(repo, `${label} repository`);
  const canonicalRepo = canonicalDirectory(repo, `${label} repository`);
  if (canonicalRepo !== repo) throw new Error(`${label} repository path must be absolute and canonical`);
  assertJsonValue(paths, `${label} affected paths`);
  if (!Array.isArray(paths) || paths.length === 0) throw new Error(`${label} affected paths must be non-empty`);
  validateCommit(sourceBase, `${label} source base`);
  return { repo: canonicalRepo, paths, sourceBase };
}

function validateManifest(manifest, binding, expectation = null) {
  assertJsonValue(manifest, 'affected-path manifest');
  validateAffectedPathManifest(manifest, expectation ?? {});
  if (manifest.source_sha256 !== binding.source_sha256) {
    throw new Error('affected-path manifest source binding mismatch');
  }
  return manifest;
}

function currentUid() {
  return typeof process.getuid === 'function' ? process.getuid() : null;
}

function assertOwned(stat, label) {
  const uid = currentUid();
  if (uid !== null && stat.uid !== uid) throw new Error(`${label} is not owned by the current user`);
}

function canonicalDirectory(directory, label) {
  nonemptyString(directory, label);
  const resolved = path.resolve(directory);
  let stat;
  try {
    stat = fs.lstatSync(resolved);
  } catch {
    throw new Error(`${label} does not exist`);
  }
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error(`${label} must be a real directory`);
  if (fs.realpathSync(resolved) !== resolved) throw new Error(`${label} must be canonical`);
  assertOwned(stat, label);
  return resolved;
}

function canonicalBundleDirectory(bundlePath) {
  nonemptyString(bundlePath, 'review bundle path');
  if (!path.isAbsolute(bundlePath) || path.resolve(bundlePath) !== bundlePath) {
    throw new Error('review bundle path must be absolute and canonical');
  }
  const root = canonicalDirectory(bundlePath, 'review bundle');
  if (root !== bundlePath) throw new Error('review bundle path must not use an alias');
  const name = path.basename(root);
  const suffix = name.startsWith(BUNDLE_PREFIX) ? name.slice(BUNDLE_PREFIX.length) : '';
  if (!/^[A-Za-z0-9]{6}$/.test(suffix)) throw new Error('review bundle path is not owned by this helper');
  return root;
}

function writeExclusive(file, bytes) {
  const descriptor = fs.openSync(
    file,
    fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY | fs.constants.O_NOFOLLOW,
    0o400,
  );
  try {
    let offset = 0;
    while (offset < bytes.length) offset += fs.writeSync(descriptor, bytes, offset, bytes.length - offset);
    fs.fsyncSync(descriptor);
  } finally {
    fs.closeSync(descriptor);
  }
  fs.chmodSync(file, 0o400);
}

function bundleDescriptor(entries) {
  return {
    schema: 1,
    entries: BUNDLE_FILES.map((name) => ({
      name,
      bytes: entries[name].length,
      sha256: sha256(entries[name]),
    })),
  };
}

function bundleSha256(entries) {
  return sha256(Buffer.from(jcs(bundleDescriptor(entries))));
}

function removeCreatedBundle(bundlePath) {
  try {
    fs.chmodSync(bundlePath, 0o700);
  } catch {
    return;
  }
  for (const name of BUNDLE_FILES) {
    const file = path.join(bundlePath, name);
    try {
      fs.chmodSync(file, 0o600);
      fs.unlinkSync(file);
    } catch {
      // Continue best-effort cleanup of a bundle that was never returned to the caller.
    }
  }
  try {
    fs.rmdirSync(bundlePath);
  } catch {
    // The original creation error is more useful than a cleanup error.
  }
}

export function createPlanReviewBundle(input) {
  assertClosed(
    input,
    ['binding', 'manifest', 'outRoot', 'planBytes', 'repo', 'paths', 'sourceBase'],
    'create plan review bundle input',
  );
  const { binding, manifest, outRoot, planBytes } = input;
  const normalizedBinding = validatePlanBinding(binding);
  const expectation = validateManifestExpectation(input, 'review bundle', true);
  validateManifest(manifest, normalizedBinding, expectation);
  const plan = validatePlanBytes(planBytes, normalizedBinding);

  const root = canonicalDirectory(outRoot, 'bundle output root');
  const manifestBytes = Buffer.from(`${jcs(manifest)}\n`);
  const bindingRecord = {
    schema: 1,
    run_id: normalizedBinding.run_id,
    invocation: normalizedBinding.invocation,
    plan_sha256: normalizedBinding.plan_sha256,
    source_sha256: normalizedBinding.source_sha256,
    plan_bytes_sha256: sha256(plan),
    manifest_sha256: sha256(manifestBytes),
  };
  const entries = {
    'binding.json': Buffer.from(`${jcs(bindingRecord)}\n`),
    'manifest.json': manifestBytes,
    'plan.md': plan,
  };

  const bundlePath = fs.mkdtempSync(path.join(root, BUNDLE_PREFIX));
  fs.chmodSync(bundlePath, 0o700);
  try {
    for (const name of BUNDLE_FILES) writeExclusive(path.join(bundlePath, name), entries[name]);
    const directory = fs.openSync(bundlePath, fs.constants.O_RDONLY | fs.constants.O_DIRECTORY);
    try {
      fs.fsyncSync(directory);
    } finally {
      fs.closeSync(directory);
    }
    fs.chmodSync(bundlePath, 0o500);
    const result = { path: bundlePath, sha256: bundleSha256(entries) };
    verifyPlanReviewBundle({
      binding: normalizedBinding,
      bundlePath: result.path,
      expectedSha256: result.sha256,
      repo: expectation.repo,
      paths: expectation.paths,
      sourceBase: expectation.sourceBase,
    });
    return result;
  } catch (error) {
    removeCreatedBundle(bundlePath);
    throw error;
  }
}

function readImmutableBundle(bundlePath) {
  const root = canonicalBundleDirectory(bundlePath);
  const rootBefore = fs.lstatSync(root, { bigint: true });
  if (!rootBefore.isDirectory() || rootBefore.isSymbolicLink()) {
    throw new Error('review bundle must remain a real directory');
  }
  if ((Number(rootBefore.mode) & 0o7777) !== 0o500) {
    throw new Error('review bundle root is not immutable and private');
  }
  assertOwned({ uid: Number(rootBefore.uid) }, 'review bundle');

  const names = fs.readdirSync(root).sort(compareUtf16);
  const expectedNames = [...BUNDLE_FILES].sort(compareUtf16);
  if (names.length !== expectedNames.length || names.some((name, index) => name !== expectedNames[index])) {
    throw new Error('review bundle has unexpected entries');
  }

  const entries = {};
  const snapshots = {};
  for (const name of BUNDLE_FILES) {
    const file = path.join(root, name);
    const before = fs.lstatSync(file, { bigint: true });
    if (!before.isFile() || before.isSymbolicLink()) throw new Error(`review bundle ${name} is not a regular file`);
    if ((Number(before.mode) & 0o7777) !== 0o400 || before.nlink !== 1n) {
      throw new Error(`review bundle ${name} is not immutable and private`);
    }
    assertOwned({ uid: Number(before.uid) }, `review bundle ${name}`);
    snapshots[name] = before;
    const bytes = fs.readFileSync(file);
    const after = fs.lstatSync(file, { bigint: true });
    for (const field of IMMUTABLE_STAT_FIELDS) {
      if (before[field] !== after[field]) throw new Error(`review bundle ${name} changed while being read`);
    }
    entries[name] = bytes;
  }
  for (const name of BUNDLE_FILES) {
    const final = fs.lstatSync(path.join(root, name), { bigint: true });
    for (const field of IMMUTABLE_STAT_FIELDS) {
      if (snapshots[name][field] !== final[field]) throw new Error(`review bundle ${name} changed while being read`);
    }
  }

  const rootAfter = fs.lstatSync(root, { bigint: true });
  for (const field of IMMUTABLE_STAT_FIELDS) {
    if (rootBefore[field] !== rootAfter[field]) throw new Error('review bundle changed while being read');
  }
  return { entries, path: root };
}

function parseCanonicalJson(bytes, label) {
  let text;
  let value;
  try {
    text = UTF8_DECODER.decode(bytes);
    if (!text.endsWith('\n')) throw new Error('missing terminal newline');
    value = JSON.parse(text);
  } catch {
    throw new Error(`${label} is not canonical JSON`);
  }
  assertJsonValue(value, label);
  if (text !== `${jcs(value)}\n`) throw new Error(`${label} is not canonical JSON`);
  return value;
}

function inspectPlanReviewBundle({ binding, bundlePath, expectedSha256, manifestExpectation = null }) {
  const normalizedBinding = validatePlanBinding(binding);
  validateDigest(expectedSha256, 'expected bundle sha256');
  const bundle = readImmutableBundle(bundlePath);
  const actualSha256 = bundleSha256(bundle.entries);
  if (actualSha256 !== expectedSha256) throw new Error('review bundle hash mismatch or tamper detected');

  const record = parseCanonicalJson(bundle.entries['binding.json'], 'review bundle binding');
  assertClosed(
    record,
    ['schema', 'run_id', 'invocation', 'plan_sha256', 'source_sha256', 'plan_bytes_sha256', 'manifest_sha256'],
    'review bundle binding',
  );
  if (record.schema !== 1) throw new Error('review bundle binding schema must be 1');
  for (const key of ['run_id', 'invocation', 'plan_sha256', 'source_sha256']) {
    if (record[key] !== normalizedBinding[key]) throw new Error(`review bundle ${key} binding mismatch`);
  }
  validateDigest(record.plan_bytes_sha256, 'review bundle plan bytes digest');
  validateDigest(record.manifest_sha256, 'review bundle manifest digest');
  if (record.plan_bytes_sha256 !== sha256(bundle.entries['plan.md']))
    throw new Error('review bundle plan hash mismatch');
  if (record.manifest_sha256 !== sha256(bundle.entries['manifest.json'])) {
    throw new Error('review bundle manifest hash mismatch');
  }
  validatePlanBytes(bundle.entries['plan.md'], normalizedBinding, 'review bundle plan bytes');
  const manifest = parseCanonicalJson(bundle.entries['manifest.json'], 'review bundle manifest');
  validateManifest(manifest, normalizedBinding, manifestExpectation);
  return {
    path: bundle.path,
    sha256: actualSha256,
    binding: Object.freeze({ ...normalizedBinding }),
    manifest,
    planBytes: Buffer.from(bundle.entries['plan.md']),
  };
}

export function verifyPlanReviewBundle(input) {
  assertClosedWithOptional(
    input,
    ['binding', 'bundlePath', 'expectedSha256'],
    MANIFEST_EXPECTATION_KEYS,
    'verify plan review bundle input',
  );
  const { binding, bundlePath, expectedSha256 } = input;
  const manifestExpectation = validateManifestExpectation(input, 'review bundle');
  return inspectPlanReviewBundle({ binding, bundlePath, expectedSha256, manifestExpectation });
}

export function cleanupPlanReviewBundle(input) {
  assertClosed(input, ['bundlePath', 'expectedSha256'], 'cleanup plan review bundle input');
  const { bundlePath, expectedSha256 } = input;
  validateDigest(expectedSha256, 'expected bundle sha256');
  const initial = readImmutableBundle(bundlePath);
  const record = parseCanonicalJson(initial.entries['binding.json'], 'review bundle binding');
  const binding = {
    run_id: record.run_id,
    invocation: record.invocation,
    plan_sha256: record.plan_sha256,
    source_sha256: record.source_sha256,
  };
  const verified = inspectPlanReviewBundle({ binding, bundlePath: initial.path, expectedSha256 });
  fs.chmodSync(verified.path, 0o700);
  for (const name of BUNDLE_FILES) {
    const file = path.join(verified.path, name);
    fs.chmodSync(file, 0o600);
    fs.unlinkSync(file);
  }
  fs.rmdirSync(verified.path);
}

export function buildPlanReviewPrompt(input) {
  assertClosedWithOptional(
    input,
    ['binding', 'bundlePath', 'expectedSha256'],
    MANIFEST_EXPECTATION_KEYS,
    'build plan review prompt input',
  );
  const verified = verifyPlanReviewBundle(input);
  const prompt = [
    'Read the immutable private review bundle at the path below.',
    `bundle_path: ${JSON.stringify(verified.path)}`,
    `bundle_sha256: ${verified.sha256}`,
    `run_id: ${verified.binding.run_id}`,
    `invocation: ${verified.binding.invocation}`,
    `plan_sha256: ${verified.binding.plan_sha256}`,
    `source_sha256: ${verified.binding.source_sha256}`,
    '',
    'Return exactly one compact canonical JCS object matching PlanReviewV1.',
    'Use verdict pass with no findings, repair only for repository-grounded defects,',
    'or blocked only when a required user decision or safety authority is missing.',
    'Each finding has exactly these required keys: id, kind, class, locator, defect, fix.',
    'Allowed finding kind-to-class mapping (closed):',
    ...Object.entries(PLAN_FINDING_CLASSES).map(([kind, classes]) => `- ${kind}: ${classes.join(', ')}`),
    'Do not echo the plan, manifest, bundle, or prompt.',
  ].join('\n');
  if (Buffer.byteLength(prompt) >= 4 * 1024) throw new Error('plan review prompt exceeds 4 KiB');
  return prompt;
}
