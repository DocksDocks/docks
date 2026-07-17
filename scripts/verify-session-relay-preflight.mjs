#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  detectRustFileIdentity,
  expectedRustFileIdentity,
  formatSha256Sums,
  parseSha256Sums,
  rustAssetName,
  rustHostTarget,
  rustReleaseAssetNames,
} from './lib/rust-bin.mjs';

const REPOSITORY_ID = 'DocksDocks/docks';
const WORKFLOW_FILE = '.github/workflows/build-binaries.yml';
const EXPECTED_VERSION_STDOUT = 'session-relay 0.12.0';
const PRODUCER_PATH = 'scripts/verify-session-relay-preflight.mjs';
const PRODUCER_VERSION = '1';
const CHECKSUM_ARTIFACT = 'session-relay-checksums';
const CHECKSUM_FILE = 'SHA256SUMS';

const TARGETS = [
  { target: rustHostTarget('linux', 'x64'), runner_os: 'Linux', runner_arch: 'X64' },
  { target: rustHostTarget('linux', 'arm64'), runner_os: 'Linux', runner_arch: 'ARM64' },
  { target: rustHostTarget('darwin', 'x64'), runner_os: 'macOS', runner_arch: 'X64' },
  { target: rustHostTarget('darwin', 'arm64'), runner_os: 'macOS', runner_arch: 'ARM64' },
];

class VerificationError extends Error {}

function fail(message) {
  throw new VerificationError(message);
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function requireRecord(value, label) {
  if (!isRecord(value)) fail(`${label} must be an object`);
  return value;
}

function requireString(value, label) {
  if (typeof value !== 'string' || value.length === 0) fail(`${label} must be a nonempty string`);
  assertUnicode(value, label);
  return value;
}

function requirePositiveInteger(value, label) {
  if (!Number.isSafeInteger(value) || value <= 0) fail(`${label} must be a positive safe integer`);
  return value;
}

function exactKeys(value, expected, label) {
  const actual = Object.keys(requireRecord(value, label)).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    fail(`${label} has unknown or missing fields`);
  }
}

function assertUnicode(value, label) {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) fail(`${label} contains invalid Unicode`);
      index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      fail(`${label} contains invalid Unicode`);
    }
  }
}

function assertJsonUnicode(value, label = 'JSON') {
  if (typeof value === 'string') {
    assertUnicode(value, label);
  } else if (Array.isArray(value)) {
    for (const item of value) assertJsonUnicode(item, label);
  } else if (isRecord(value)) {
    for (const [key, item] of Object.entries(value)) {
      assertUnicode(key, label);
      assertJsonUnicode(item, label);
    }
  }
}

function jcs(value) {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) fail('receipt contains a non-finite number');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(jcs).join(',')}]`;
  if (isRecord(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${jcs(value[key])}`).join(',')}}`;
  }
  fail('receipt contains an unsupported value');
}

function parseArgs(argv) {
  const allowed = new Set(['--run-id', '--expected-commit', '--artifacts', '--receipt-out']);
  const values = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const option = argv[index];
    if (!allowed.has(option)) fail(`unknown option: ${option}`);
    if (values.has(option)) fail(`duplicate option: ${option}`);
    const value = argv[index + 1];
    if (value === undefined || value.length === 0 || value.startsWith('--')) fail(`missing value for ${option}`);
    assertUnicode(value, option);
    values.set(option, value);
    index += 1;
  }
  for (const option of allowed) {
    if (!values.has(option)) fail(`missing required option: ${option}`);
  }

  const runIdText = values.get('--run-id');
  if (!/^[1-9][0-9]*$/.test(runIdText)) fail('--run-id must be a canonical positive decimal integer');
  const runId = Number(runIdText);
  requirePositiveInteger(runId, '--run-id');

  const expectedCommit = values.get('--expected-commit');
  if (!/^[0-9a-f]{40}$/.test(expectedCommit)) fail('--expected-commit must be 40 lowercase hex');

  return {
    runId,
    expectedCommit,
    artifacts: canonicalExistingDirectory(values.get('--artifacts'), '--artifacts'),
    receiptOut: canonicalNewFile(values.get('--receipt-out'), '--receipt-out'),
  };
}

function canonicalExistingDirectory(input, label) {
  if (!path.isAbsolute(input)) fail(`${label} must be absolute`);
  let resolved;
  let stat;
  try {
    resolved = fs.realpathSync.native(input);
    stat = fs.lstatSync(input);
  } catch {
    fail(`${label} does not exist`);
  }
  if (resolved !== input || !stat.isDirectory() || stat.isSymbolicLink()) {
    fail(`${label} must be a canonical non-symlink directory`);
  }
  return resolved;
}

function canonicalNewFile(input, label) {
  if (!path.isAbsolute(input)) fail(`${label} must be absolute`);
  const parentInput = path.dirname(input);
  let parent;
  let parentStat;
  try {
    parent = fs.realpathSync.native(parentInput);
    parentStat = fs.lstatSync(parentInput);
  } catch {
    fail(`${label} parent directory does not exist`);
  }
  if (parent !== parentInput || !parentStat.isDirectory() || parentStat.isSymbolicLink()
      || path.join(parent, path.basename(input)) !== input) {
    fail(`${label} must be a canonical path in a non-symlink directory`);
  }
  try {
    fs.lstatSync(input);
    fail(`${label} already exists`);
  } catch (error) {
    if (error instanceof VerificationError) throw error;
    if (error?.code !== 'ENOENT') fail(`${label} could not be inspected`);
  }
  return input;
}

function runGhApi(endpoint, label) {
  const result = spawnSync('gh', [
    'api', '--method', 'GET',
    '-H', 'Accept: application/vnd.github+json',
    '-H', 'X-GitHub-Api-Version: 2022-11-28',
    endpoint,
  ], {
    encoding: 'utf8',
    shell: false,
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.error) fail(`${label} query could not execute gh: ${result.error.message}`);
  if (result.signal !== null) fail(`${label} query terminated by signal ${result.signal}`);
  if (result.status !== 0) fail(`${label} query failed${result.stderr ? `: ${result.stderr.trim()}` : ''}`);
  try {
    const parsed = JSON.parse(result.stdout);
    assertJsonUnicode(parsed, label);
    return parsed;
  } catch (error) {
    if (error instanceof VerificationError) throw error;
    fail(`${label} query returned invalid JSON`);
  }
}

function requireEqual(actual, expected, label) {
  if (actual !== expected) fail(`${label} mismatch`);
}

function validateRun(run, parsed) {
  requireRecord(run, 'workflow run');
  requireEqual(requirePositiveInteger(run.id, 'workflow run id'), parsed.runId, 'workflow run id');
  requireEqual(requireString(run.event, 'workflow run event'), 'workflow_dispatch', 'workflow run event');
  requireEqual(requireString(run.status, 'workflow run status'), 'completed', 'workflow run status');
  requireEqual(requireString(run.conclusion, 'workflow run conclusion'), 'success', 'workflow run conclusion');
  requireEqual(requireString(run.head_sha, 'workflow run head_sha'), parsed.expectedCommit, 'workflow run head_sha');

  const branch = `preflight/session-relay-0.12.0-${parsed.expectedCommit.slice(0, 12)}`;
  requireEqual(requireString(run.head_branch, 'workflow run head_branch'), branch, 'workflow run head_branch');
  requireEqual(requireString(run.path, 'workflow run path'), WORKFLOW_FILE, 'workflow run path');
  const attempt = requirePositiveInteger(run.run_attempt, 'workflow run attempt');
  const workflowId = requirePositiveInteger(run.workflow_id, 'workflow id');

  const repository = requireRecord(run.repository, 'workflow run repository');
  requireEqual(requireString(repository.full_name, 'workflow run repository full_name'), REPOSITORY_ID, 'workflow run repository');
  const repositoryDatabaseId = requirePositiveInteger(repository.id, 'workflow run repository id');
  const headRepository = requireRecord(run.head_repository, 'workflow run head_repository');
  requireEqual(requireString(headRepository.full_name, 'workflow run head_repository full_name'), REPOSITORY_ID, 'workflow run head_repository');
  requireEqual(requirePositiveInteger(headRepository.id, 'workflow run head_repository id'), repositoryDatabaseId, 'workflow run repository id');

  return {
    branch,
    validationRef: `refs/heads/${branch}`,
    attempt,
    workflowId,
    repositoryDatabaseId,
  };
}

function validateWorkflow(workflow, workflowId) {
  requireRecord(workflow, 'workflow');
  requireEqual(requirePositiveInteger(workflow.id, 'workflow id'), workflowId, 'workflow id');
  requireEqual(requireString(workflow.path, 'workflow path'), WORKFLOW_FILE, 'workflow path');
  requireEqual(requireString(workflow.state, 'workflow state'), 'active', 'workflow state');
}

function validateWorkflowFile(file) {
  requireRecord(file, 'workflow file');
  requireEqual(requireString(file.type, 'workflow file type'), 'file', 'workflow file type');
  requireEqual(requireString(file.path, 'workflow file path'), WORKFLOW_FILE, 'workflow file path');
  const blobId = requireString(file.sha, 'workflow file blob id');
  if (!/^[0-9a-f]{40}$/.test(blobId)) fail('workflow file blob id must be 40 lowercase hex');
  return blobId;
}

function validateArtifactApi(response, run, runIdentity, expectedNames) {
  requireRecord(response, 'artifact response');
  requireEqual(requirePositiveInteger(response.total_count, 'artifact total_count'), expectedNames.length, 'artifact count');
  if (!Array.isArray(response.artifacts) || response.artifacts.length !== expectedNames.length) {
    fail('artifact response must contain exactly the expected artifacts');
  }

  const expected = new Set(expectedNames);
  const byName = new Map();
  const databaseIds = new Set();
  for (const artifact of response.artifacts) {
    requireRecord(artifact, 'artifact');
    const name = requireString(artifact.name, 'artifact name');
    if (!expected.has(name)) fail(`unexpected artifact: ${name}`);
    if (byName.has(name)) fail(`duplicate artifact: ${name}`);
    const databaseId = requirePositiveInteger(artifact.id, `artifact ${name} id`);
    if (databaseIds.has(databaseId)) fail(`duplicate artifact database id: ${databaseId}`);
    databaseIds.add(databaseId);
    requireEqual(artifact.expired, false, `artifact ${name} expired state`);
    if (!Number.isSafeInteger(artifact.size_in_bytes) || artifact.size_in_bytes <= 0) {
      fail(`artifact ${name} size must be a positive safe integer`);
    }
    const workflowRun = requireRecord(artifact.workflow_run, `artifact ${name} workflow_run`);
    requireEqual(requirePositiveInteger(workflowRun.id, `artifact ${name} run id`), run.id, `artifact ${name} run id`);
    requireEqual(requirePositiveInteger(workflowRun.repository_id, `artifact ${name} repository id`), runIdentity.repositoryDatabaseId, `artifact ${name} repository id`);
    requireEqual(requirePositiveInteger(workflowRun.head_repository_id, `artifact ${name} head repository id`), runIdentity.repositoryDatabaseId, `artifact ${name} head repository id`);
    requireEqual(requireString(workflowRun.head_branch, `artifact ${name} head branch`), runIdentity.branch, `artifact ${name} head branch`);
    requireEqual(requireString(workflowRun.head_sha, `artifact ${name} head SHA`), run.head_sha, `artifact ${name} head SHA`);
    byName.set(name, { databaseId, archiveSize: artifact.size_in_bytes });
  }
  return byName;
}

function exactDirectoryEntries(directory, expectedNames, label) {
  const expected = [...expectedNames].sort();
  let entries;
  try {
    entries = fs.readdirSync(directory, { withFileTypes: true });
  } catch {
    fail(`${label} could not be read`);
  }
  const actual = entries.map((entry) => entry.name).sort();
  if (actual.length !== expected.length || actual.some((name, index) => name !== expected[index])) {
    fail(`${label} has unknown or missing entries`);
  }
  for (const entry of entries) {
    if (!entry.isDirectory() && !entry.isFile()) fail(`${label} contains a non-regular entry: ${entry.name}`);
  }
  return entries;
}

function requireRegularFile(file, label) {
  let stat;
  try {
    stat = fs.lstatSync(file);
  } catch {
    fail(`${label} does not exist`);
  }
  if (!stat.isFile() || stat.isSymbolicLink()) fail(`${label} must be a non-symlink regular file`);
  if (stat.size <= 0) fail(`${label} must not be empty`);
  return stat;
}

function parseCanonicalAttestation(file, label) {
  const bytes = fs.readFileSync(file);
  let text;
  let value;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    value = JSON.parse(text);
  } catch {
    fail(`${label} must be UTF-8 JSON`);
  }
  assertJsonUnicode(value, label);
  if (text !== jcs(value)) fail(`${label} must be canonical JCS with no trailing bytes`);
  return requireRecord(value, label);
}

function stageAndInspect(source, destination, target) {
  try {
    fs.copyFileSync(source, destination, fs.constants.COPYFILE_EXCL);
    fs.chmodSync(destination, 0o755);
  } catch (error) {
    fail(`could not stage ${path.basename(source)}: ${error.message}`);
  }
  const stat = requireRegularFile(destination, `staged ${path.basename(source)}`);
  if ((stat.mode & 0o777) !== 0o755) fail(`staged ${path.basename(source)} mode is not 0755`);
  const bytes = fs.readFileSync(destination);
  const detected = detectRustFileIdentity(bytes);
  const expected = expectedRustFileIdentity(target);
  if (expected === null || detected === null
      || detected.format !== expected.format || detected.architecture !== expected.architecture) {
    fail(`${path.basename(source)} file format or architecture mismatch for ${target}`);
  }
  return { bytes, stat, identity: detected };
}

function validateAttestation(attestation, expected, runIdentity, parsed, digest) {
  exactKeys(attestation, [
    'schema', 'asset_name', 'inputs', 'runner_arch', 'runner_os', 'sha256', 'source_commit',
    'target', 'version_stdout', 'workflow_run_attempt', 'workflow_run_id',
  ], `attestation ${expected.target}`);
  requireEqual(attestation.schema, 'SessionRelayBinaryAttestationV1', `attestation ${expected.target} schema`);
  requireEqual(attestation.target, expected.target, `attestation ${expected.target} target`);
  requireEqual(attestation.asset_name, expected.assetName, `attestation ${expected.target} asset_name`);
  requireEqual(attestation.sha256, digest, `attestation ${expected.target} sha256`);
  requireEqual(attestation.source_commit, parsed.expectedCommit, `attestation ${expected.target} source_commit`);
  exactKeys(attestation.inputs, ['mode', 'expected_commit', 'expected_tag'], `attestation ${expected.target} inputs`);
  requireEqual(attestation.inputs.mode, 'validate-only', `attestation ${expected.target} input mode`);
  requireEqual(attestation.inputs.expected_commit, parsed.expectedCommit, `attestation ${expected.target} input expected_commit`);
  requireEqual(attestation.inputs.expected_tag, '', `attestation ${expected.target} input expected_tag`);
  requireEqual(attestation.runner_os, expected.runner_os, `attestation ${expected.target} runner_os`);
  requireEqual(attestation.runner_arch, expected.runner_arch, `attestation ${expected.target} runner_arch`);
  requireEqual(attestation.version_stdout, EXPECTED_VERSION_STDOUT, `attestation ${expected.target} version_stdout`);
  requireEqual(attestation.workflow_run_id, parsed.runId, `attestation ${expected.target} workflow_run_id`);
  requireEqual(attestation.workflow_run_attempt, runIdentity.attempt, `attestation ${expected.target} workflow_run_attempt`);
}

function validateDownloadedArtifacts(parsed, runIdentity, artifactApi) {
  const targetDescriptors = TARGETS.map((entry) => {
    if (entry.target === null) fail('supported host mapping unexpectedly returned null');
    return {
      ...entry,
      assetName: rustAssetName('session-relay', entry.target),
      artifactName: `session-relay-binary-${entry.target}`,
      attestationName: `attestation-${entry.target}.json`,
    };
  });
  const releaseNames = rustReleaseAssetNames('session-relay', targetDescriptors.map(({ target }) => target), CHECKSUM_FILE);
  const expectedReleaseNames = [...targetDescriptors.map(({ assetName }) => assetName), CHECKSUM_FILE];
  if (releaseNames.length !== expectedReleaseNames.length
      || releaseNames.some((name, index) => name !== expectedReleaseNames[index])) {
    fail('Rust release asset helper returned a noncanonical asset set');
  }
  const expectedArtifactNames = [...targetDescriptors.map(({ artifactName }) => artifactName), CHECKSUM_ARTIFACT];
  exactDirectoryEntries(parsed.artifacts, expectedArtifactNames, 'artifact directory');

  const stage = fs.mkdtempSync(path.join(os.tmpdir(), 'session-relay-preflight-stage-'));
  fs.chmodSync(stage, 0o700);
  try {
    const artifacts = [];
    const attestations = [];
    const digests = new Map();

    for (const descriptor of targetDescriptors) {
      const directory = path.join(parsed.artifacts, descriptor.artifactName);
      const directoryStat = fs.lstatSync(directory);
      if (!directoryStat.isDirectory() || directoryStat.isSymbolicLink()) {
        fail(`artifact ${descriptor.artifactName} must be a non-symlink directory`);
      }
      exactDirectoryEntries(directory, [descriptor.assetName, descriptor.attestationName], `artifact ${descriptor.artifactName}`);
      const source = path.join(directory, descriptor.assetName);
      const attestationFile = path.join(directory, descriptor.attestationName);
      requireRegularFile(source, descriptor.assetName);
      requireRegularFile(attestationFile, descriptor.attestationName);

      const staged = stageAndInspect(source, path.join(stage, descriptor.assetName), descriptor.target);
      const digest = sha256(staged.bytes);
      const attestation = parseCanonicalAttestation(attestationFile, `attestation ${descriptor.target}`);
      validateAttestation(attestation, descriptor, runIdentity, parsed, digest);
      digests.set(descriptor.assetName, digest);

      const apiIdentity = artifactApi.get(descriptor.artifactName);
      if (!apiIdentity) fail(`artifact API identity missing for ${descriptor.artifactName}`);
      artifacts.push({
        target: descriptor.target,
        artifact_name: descriptor.artifactName,
        database_id: apiIdentity.databaseId,
        archive_size: apiIdentity.archiveSize,
        asset_name: descriptor.assetName,
        sha256: digest,
        size: staged.stat.size,
        mode: '0755',
        file_identity: staged.identity,
      });
      attestations.push({
        target: descriptor.target,
        artifact_name: descriptor.artifactName,
        database_id: apiIdentity.databaseId,
        file_name: descriptor.attestationName,
        sha256: sha256(fs.readFileSync(attestationFile)),
        runner_os: descriptor.runner_os,
        runner_arch: descriptor.runner_arch,
        version_stdout: EXPECTED_VERSION_STDOUT,
      });
    }

    const checksumDirectory = path.join(parsed.artifacts, CHECKSUM_ARTIFACT);
    const checksumDirectoryStat = fs.lstatSync(checksumDirectory);
    if (!checksumDirectoryStat.isDirectory() || checksumDirectoryStat.isSymbolicLink()) {
      fail(`artifact ${CHECKSUM_ARTIFACT} must be a non-symlink directory`);
    }
    exactDirectoryEntries(checksumDirectory, [CHECKSUM_FILE], `artifact ${CHECKSUM_ARTIFACT}`);
    const checksumFile = path.join(checksumDirectory, CHECKSUM_FILE);
    const checksumStat = requireRegularFile(checksumFile, CHECKSUM_FILE);
    const checksumBytes = fs.readFileSync(checksumFile);
    let manifest;
    try {
      manifest = parseSha256Sums(checksumBytes);
    } catch (error) {
      fail(`invalid ${CHECKSUM_FILE}: ${error.message}`);
    }
    if (manifest.size !== digests.size) fail(`${CHECKSUM_FILE} must contain exactly four entries`);
    for (const [assetName, digest] of digests) {
      requireEqual(manifest.get(assetName), digest, `${CHECKSUM_FILE} digest for ${assetName}`);
    }
    for (const name of manifest.keys()) {
      if (!digests.has(name)) fail(`${CHECKSUM_FILE} contains unexpected asset ${name}`);
    }
    if (new TextDecoder('utf-8', { fatal: true }).decode(checksumBytes) !== formatSha256Sums(manifest)) {
      fail(`${CHECKSUM_FILE} is not in canonical sorted format`);
    }

    const checksumApi = artifactApi.get(CHECKSUM_ARTIFACT);
    if (!checksumApi) fail(`artifact API identity missing for ${CHECKSUM_ARTIFACT}`);
    return {
      artifacts,
      attestations,
      checksum: {
        artifact_name: CHECKSUM_ARTIFACT,
        database_id: checksumApi.databaseId,
        archive_size: checksumApi.archiveSize,
        file_name: CHECKSUM_FILE,
        sha256: sha256(checksumBytes),
        size: checksumStat.size,
        entries: [...manifest].map(([name, digest]) => ({ name, sha256: digest })),
      },
    };
  } finally {
    fs.rmSync(stage, { recursive: true, force: true });
  }
}

function writeReceipt(receiptOut, bytes) {
  const parent = path.dirname(receiptOut);
  const temporary = path.join(parent, `.${path.basename(receiptOut)}.${process.pid}.${randomBytes(12).toString('hex')}.tmp`);
  let descriptor;
  try {
    descriptor = fs.openSync(temporary, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL, 0o600);
    fs.fchmodSync(descriptor, 0o600);
    let offset = 0;
    while (offset < bytes.length) offset += fs.writeSync(descriptor, bytes, offset, bytes.length - offset);
    fs.fsyncSync(descriptor);
    fs.closeSync(descriptor);
    descriptor = undefined;
    try {
      fs.lstatSync(receiptOut);
      fail('--receipt-out already exists');
    } catch (error) {
      if (error instanceof VerificationError) throw error;
      if (error?.code !== 'ENOENT') fail('--receipt-out could not be inspected');
    }
    fs.renameSync(temporary, receiptOut);
    const directory = fs.openSync(parent, fs.constants.O_RDONLY);
    try {
      fs.fsyncSync(directory);
    } finally {
      fs.closeSync(directory);
    }
  } catch (error) {
    if (descriptor !== undefined) fs.closeSync(descriptor);
    try { fs.unlinkSync(temporary); } catch {}
    throw error;
  }
}

function main() {
  const parsed = parseArgs(process.argv.slice(2));
  const run = runGhApi(`repos/${REPOSITORY_ID}/actions/runs/${parsed.runId}`, 'workflow run');
  const runIdentity = validateRun(run, parsed);
  const workflow = runGhApi(`repos/${REPOSITORY_ID}/actions/workflows/${runIdentity.workflowId}`, 'workflow');
  validateWorkflow(workflow, runIdentity.workflowId);
  const workflowFile = runGhApi(
    `repos/${REPOSITORY_ID}/contents/${WORKFLOW_FILE}?ref=${encodeURIComponent(parsed.expectedCommit)}`,
    'workflow file',
  );
  const workflowBlobId = validateWorkflowFile(workflowFile);

  const expectedArtifactNames = [
    ...TARGETS.map(({ target }) => {
      if (target === null) fail('supported host mapping unexpectedly returned null');
      return `session-relay-binary-${target}`;
    }),
    CHECKSUM_ARTIFACT,
  ];
  const artifactResponse = runGhApi(
    `repos/${REPOSITORY_ID}/actions/runs/${parsed.runId}/artifacts?per_page=100`,
    'artifacts',
  );
  const artifactApi = validateArtifactApi(artifactResponse, run, runIdentity, expectedArtifactNames);
  const verified = validateDownloadedArtifacts(parsed, runIdentity, artifactApi);

  const receipt = {
    schema: 1,
    type: 'ProducerPreflightReceiptV1',
    repository_id: REPOSITORY_ID,
    source_commit: parsed.expectedCommit,
    validation_ref: runIdentity.validationRef,
    workflow: {
      file: WORKFLOW_FILE,
      file_blob_id: workflowBlobId,
      run_database_id: parsed.runId,
      run_attempt: runIdentity.attempt,
      event: 'workflow_dispatch',
      head_branch: runIdentity.branch,
      head_sha: parsed.expectedCommit,
      inputs: {
        mode: 'validate-only',
        expected_commit: parsed.expectedCommit,
        expected_tag: '',
      },
      conclusion: 'success',
    },
    artifacts: verified.artifacts,
    attestations: verified.attestations,
    checksum: verified.checksum,
    producer: { path: PRODUCER_PATH, version: PRODUCER_VERSION },
    created_at: new Date().toISOString(),
  };
  assertJsonUnicode(receipt, 'receipt');
  const bytes = Buffer.from(jcs(receipt), 'utf8');
  writeReceipt(parsed.receiptOut, bytes);
  process.stdout.write(`${sha256(bytes)}\n`);
}

try {
  main();
} catch (error) {
  const message = error instanceof VerificationError ? error.message : `unexpected error: ${error.message}`;
  process.stderr.write(`verify-session-relay-preflight: ${message}\n`);
  process.exitCode = 2;
}
