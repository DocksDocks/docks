import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseDocument } from 'yaml';

import { canonicalPlanView, parsePlan, validateCompletionReceipt as validatePlanCompletionReceipt } from '../../plugins/docks/skills/productivity/plan-reviewer/scripts/review-policy.mjs';
import {
  COMMIT,
  PLUGIN,
  REPO,
  REPOSITORY_ID,
  SHA256,
  TAG,
  VERSION,
  canonicalPath,
  canonicalize,
  command,
  embeddedReceipt,
  emitReceipt,
  ensureCleanTree,
  exactKeys,
  fail,
  ghJson,
  git,
  gitRaw,
  noteValue,
  readCanonical,
  replaceJsonVersion,
  sha256,
  writeCanonicalExclusive,
} from './session-relay-release-core.mjs';

const PLAN_PATH = 'docs/plans/active/session-relay-prebuilt-cli-distribution.md';
const FINISHED_PLAN = /^docs\/plans\/finished\/\d{4}-\d{2}-\d{2}-session-relay-prebuilt-cli-distribution\.md$/;
const PUBLIC_REPOSITORY_ID = 'DocksDocks/public';
const PUBLIC_REMOTE = 'https://github.com/DocksDocks/public.git';
const SOURCE_CI_WORKFLOW = '.github/workflows/ci.yml';
const BUILD_WORKFLOW = '.github/workflows/build-binaries.yml';
const TARGETS = [
  'x86_64-unknown-linux-musl',
  'aarch64-unknown-linux-musl',
  'x86_64-apple-darwin',
  'aarch64-apple-darwin',
];
const REQUIRED_CI_STEPS = [
  'setup Node 24',
  'enable corepack',
  'install pnpm dependencies (--frozen-lockfile; yaml + lockfile-pinned claude-code)',
  'materialize claude-code binary (allowBuilds denies it by default)',
  'add node_modules/.bin to PATH (so ci.mjs finds the pinned claude)',
  'provision Rust 1.85.0 with musl for the session-relay host leg',
  'run the authoritative gate (scripts/ci.mjs)',
];
const REQUIRED_CI_STEP_NUMBERS = [3, 5, 9, 11, 12, 13, 14];
const EXPECTED_CI_STEP_DEFINITIONS = [
  {
    name: 'setup Node 24',
    uses: 'actions/setup-node@48b55a011bda9f5d6aeb4c2d9c7362e8dae4041e',
    with: { 'node-version': '24' },
  },
  { name: 'enable corepack', run: 'corepack enable' },
  {
    name: 'install pnpm dependencies (--frozen-lockfile; yaml + lockfile-pinned claude-code)',
    run: 'pnpm install --frozen-lockfile',
  },
  {
    name: 'materialize claude-code binary (allowBuilds denies it by default)',
    run: 'node node_modules/@anthropic-ai/claude-code/install.cjs',
  },
  {
    name: 'add node_modules/.bin to PATH (so ci.mjs finds the pinned claude)',
    run: 'echo \"$GITHUB_WORKSPACE/node_modules/.bin\" >> \"$GITHUB_PATH\"',
  },
  {
    name: 'provision Rust 1.85.0 with musl for the session-relay host leg',
    if: "github.event_name != 'push' || steps.target.outputs.needs_rust == 'true'",
    run: 'if [ -f plugins/session-relay/rust/rust-toolchain.toml ]; then\n  sudo apt-get update && sudo apt-get install -y --no-install-recommends musl-tools\n  (cd plugins/session-relay/rust && rustup toolchain install && rustup target add x86_64-unknown-linux-musl)\nfi\n',
  },
  {
    name: 'run the authoritative gate (scripts/ci.mjs)',
    run: 'if [ \"${{ github.event_name }}\" = \"push\" ]; then\n  node scripts/ci.mjs --plugin \"${{ steps.target.outputs.plugin }}\"\nelse\n  node scripts/ci.mjs\nfi\n',
  },
];
function expectedCiJobSteps() {
  return [
    {
      uses: 'actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd',
      with: { ref: '${{ github.sha }}', 'persist-credentials': false },
    },
    EXPECTED_CI_STEP_DEFINITIONS[0],
    {
      name: 'resolve CI target',
      id: 'target',
      if: "github.event_name == 'push'",
      run: 'node scripts/ci-target.mjs release-tag "$GITHUB_REF_NAME" --github-output "$GITHUB_OUTPUT"',
    },
    EXPECTED_CI_STEP_DEFINITIONS[1],
    {
      name: 'configure deterministic pnpm store',
      run: 'pnpm config set store-dir "$HOME/.pnpm-store"',
    },
    {
      name: 'cache pnpm store',
      uses: 'actions/cache@55cc8345863c7cc4c66a329aec7e433d2d1c52a9',
      with: {
        path: '~/.pnpm-store',
        key: "pnpm-v11-${{ runner.os }}-${{ runner.arch }}-${{ hashFiles('pnpm-lock.yaml', 'package.json') }}",
        'restore-keys': 'pnpm-v11-${{ runner.os }}-${{ runner.arch }}-',
      },
    },
    {
      name: 'cache Cargo dependencies and target outputs',
      if: "github.event_name != 'push' || steps.target.outputs.needs_rust == 'true'",
      uses: 'actions/cache@55cc8345863c7cc4c66a329aec7e433d2d1c52a9',
      with: {
        path: '~/.cargo/registry\n~/.cargo/git\nplugins/session-relay/rust/target\n',
        key: "cargo-${{ runner.os }}-${{ runner.arch }}-${{ hashFiles('plugins/session-relay/rust/Cargo.lock', 'plugins/session-relay/rust/Cargo.toml', 'plugins/session-relay/rust/rust-toolchain.toml') }}-${{ hashFiles('plugins/session-relay/rust/src/**/*.rs') }}",
        'restore-keys': "cargo-${{ runner.os }}-${{ runner.arch }}-${{ hashFiles('plugins/session-relay/rust/Cargo.lock', 'plugins/session-relay/rust/Cargo.toml', 'plugins/session-relay/rust/rust-toolchain.toml') }}-",
      },
    },
    EXPECTED_CI_STEP_DEFINITIONS[2],
    {
      name: 'verify registry signatures (non-blocking)',
      'continue-on-error': true,
      run: 'npm audit signatures',
    },
    ...EXPECTED_CI_STEP_DEFINITIONS.slice(3),
  ];
}

function record(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}


function text(value, label) {
  if (typeof value !== 'string' || value.length === 0) fail(`${label} must be a nonempty string`);
  return value;
}

function commit(value, label) {
  if (!COMMIT.test(value ?? '')) fail(`${label} must be 40 lowercase hexadecimal characters`);
  return value;
}

function digest(value, label) {
  if (!SHA256.test(value ?? '')) fail(`${label} must be 64 lowercase hexadecimal characters`);
  return value;
}

function positiveInteger(value, label) {
  if (!Number.isSafeInteger(value) || value <= 0) fail(`${label} must be a positive safe integer`);
  return value;
}

function iso(value, label) {
  text(value, label);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value) || Number.isNaN(Date.parse(value))) fail(`${label} must be a UTC RFC 3339 timestamp`);
  return value;
}

function safeLogical(value, label) {
  text(value, label);
  if (path.isAbsolute(value) || value === '.' || value === '..' || value.includes('\\') || value.split('/').some((part) => part === '' || part === '.' || part === '..')) fail(`${label} must be a safe repository-relative path`);
  return value;
}

function exactArray(value, label) {
  if (!Array.isArray(value)) fail(`${label} must be an array`);
  return value;
}

function exactStringArray(value, label, { nonempty = false } = {}) {
  exactArray(value, label);
  if (nonempty && value.length === 0) fail(`${label} must not be empty`);
  value.forEach((item, index) => text(item, `${label}[${index}]`));
  return value;
}

function exactContext(context, keys, label) {
  const normalized = context ?? {};
  exactKeys(normalized, keys, label);
  return normalized;
}

export function validateTddRedReceipt(value, context = {}) {
  const expected = exactContext(context, ['repositoryId'], 'TDD-red validation context');
  exactKeys(value, ['schema', 'type', 'repository_id', 'pre_production_commit', 'test_paths', 'command', 'exit_code', 'stdout_sha256', 'stderr_sha256', 'captured_at', 'producer'], 'TddRedReceiptV1');
  if (value.schema !== 1 || value.type !== 'TddRedReceiptV1') fail('TDD-red schema or type mismatch');
  text(value.repository_id, 'TDD-red repository_id');
  if (expected.repositoryId !== undefined && value.repository_id !== expected.repositoryId) fail('TDD-red repository identity mismatch');
  commit(value.pre_production_commit, 'TDD-red pre_production_commit');
  exactArray(value.test_paths, 'TDD-red test_paths');
  if (value.test_paths.length === 0) fail('TDD-red test_paths must not be empty');
  let prior = null;
  const paths = new Set();
  for (const [index, entry] of value.test_paths.entries()) {
    exactKeys(entry, ['path', 'blob_id'], `TDD-red test_paths[${index}]`);
    safeLogical(entry.path, `TDD-red test_paths[${index}].path`);
    commit(entry.blob_id, `TDD-red test_paths[${index}].blob_id`);
    if (paths.has(entry.path) || (prior !== null && prior.localeCompare(entry.path) >= 0)) fail('TDD-red test paths must be unique and sorted');
    paths.add(entry.path);
    prior = entry.path;
  }
  exactKeys(value.command, ['cwd', 'argv'], 'TDD-red command');
  if (!path.isAbsolute(text(value.command.cwd, 'TDD-red command.cwd'))) fail('TDD-red command.cwd must be absolute');
  exactStringArray(value.command.argv, 'TDD-red command.argv', { nonempty: true });
  if (!Number.isSafeInteger(value.exit_code) || value.exit_code === 0 || value.exit_code < -2147483648 || value.exit_code > 2147483647) fail('TDD-red exit_code must be a nonzero i32');
  digest(value.stdout_sha256, 'TDD-red stdout_sha256');
  digest(value.stderr_sha256, 'TDD-red stderr_sha256');
  iso(value.captured_at, 'TDD-red captured_at');
  exactKeys(value.producer, ['path', 'blob_id', 'version'], 'TDD-red producer');
  if (value.producer.path !== 'scripts/capture-tdd-red.mjs' || value.producer.version !== '1') fail('TDD-red producer identity mismatch');
  commit(value.producer.blob_id, 'TDD-red producer.blob_id');
  return value;
}

function validateFileIdentity(value, label) {
  exactKeys(value, ['format', 'architecture'], label);
  if (!['elf', 'mach-o'].includes(value.format) || !['x86_64', 'aarch64'].includes(value.architecture)) fail(`${label} is invalid`);
}

export function validateProducerPreflightReceipt(value, context = {}) {
  const expected = exactContext(context, ['sourceCommit'], 'preflight validation context');
  exactKeys(value, ['schema', 'type', 'repository_id', 'source_commit', 'validation_ref', 'workflow', 'artifacts', 'attestations', 'checksum', 'producer', 'created_at'], 'ProducerPreflightReceiptV1');
  if (value.schema !== 1 || value.type !== 'ProducerPreflightReceiptV1' || value.repository_id !== REPOSITORY_ID) fail('preflight receipt identity mismatch');
  commit(value.source_commit, 'preflight source_commit');
  if (expected.sourceCommit !== undefined && value.source_commit !== expected.sourceCommit) fail('preflight source commit mismatch');
  const branch = `preflight/session-relay-${VERSION}-${value.source_commit.slice(0, 12)}`;
  if (value.validation_ref !== `refs/heads/${branch}`) fail('preflight validation ref mismatch');
  exactKeys(value.workflow, ['file', 'file_blob_id', 'run_database_id', 'run_attempt', 'event', 'head_branch', 'head_sha', 'inputs', 'conclusion'], 'preflight workflow');
  if (value.workflow.file !== BUILD_WORKFLOW || value.workflow.event !== 'workflow_dispatch' || value.workflow.head_branch !== branch || value.workflow.head_sha !== value.source_commit || value.workflow.conclusion !== 'success') fail('preflight workflow identity mismatch');
  commit(value.workflow.file_blob_id, 'preflight workflow file_blob_id');
  positiveInteger(value.workflow.run_database_id, 'preflight workflow run_database_id');
  positiveInteger(value.workflow.run_attempt, 'preflight workflow run_attempt');
  exactKeys(value.workflow.inputs, ['mode', 'expected_commit', 'expected_tag'], 'preflight workflow inputs');
  if (value.workflow.inputs.mode !== 'validate-only' || value.workflow.inputs.expected_commit !== value.source_commit || value.workflow.inputs.expected_tag !== '') fail('preflight workflow inputs mismatch');
  exactArray(value.artifacts, 'preflight artifacts');
  exactArray(value.attestations, 'preflight attestations');
  if (value.artifacts.length !== TARGETS.length || value.attestations.length !== TARGETS.length) fail('preflight must contain four binaries and four attestations');
  const artifactByTarget = new Map();
  const ids = new Set();
  for (const artifact of value.artifacts) {
    exactKeys(artifact, ['target', 'artifact_name', 'database_id', 'archive_size', 'archive_digest', 'asset_name', 'sha256', 'size', 'mode', 'file_identity'], 'preflight artifact');
    if (!TARGETS.includes(artifact.target) || artifact.artifact_name !== `session-relay-binary-${artifact.target}` || artifact.asset_name !== `session-relay-${artifact.target}` || artifact.mode !== '0755') fail('preflight artifact identity mismatch');
    if (artifactByTarget.has(artifact.target)) fail('preflight artifact target duplicated');
    artifactByTarget.set(artifact.target, artifact);
    positiveInteger(artifact.database_id, 'preflight artifact database_id');
    if (ids.has(artifact.database_id)) fail('preflight artifact database ID duplicated');
    ids.add(artifact.database_id);
    positiveInteger(artifact.archive_size, 'preflight artifact archive_size');
    if (!/^sha256:[0-9a-f]{64}$/.test(artifact.archive_digest)) fail('preflight artifact archive_digest mismatch');
    digest(artifact.sha256, 'preflight artifact sha256');
    positiveInteger(artifact.size, 'preflight artifact size');
    validateFileIdentity(artifact.file_identity, 'preflight artifact file_identity');
    const expectedFormat = artifact.target.endsWith('linux-musl') ? 'elf' : 'mach-o';
    const expectedArchitecture = artifact.target.startsWith('x86_64') ? 'x86_64' : 'aarch64';
    if (artifact.file_identity.format !== expectedFormat || artifact.file_identity.architecture !== expectedArchitecture) fail('preflight artifact target/file identity mismatch');
  }
  for (const attestation of value.attestations) {
    exactKeys(attestation, ['target', 'artifact_name', 'database_id', 'archive_digest', 'file_name', 'sha256', 'runner_os', 'runner_arch', 'version_stdout'], 'preflight attestation');
    const artifact = artifactByTarget.get(attestation.target);
    if (!artifact || attestation.artifact_name !== artifact.artifact_name || attestation.database_id !== artifact.database_id || attestation.archive_digest !== artifact.archive_digest || attestation.file_name !== `attestation-${attestation.target}.json`) fail('preflight attestation/artifact binding mismatch');
    digest(attestation.sha256, 'preflight attestation sha256');
    const expectedOs = attestation.target.endsWith('linux-musl') ? 'Linux' : 'macOS';
    const expectedArch = attestation.target.startsWith('x86_64') ? 'X64' : 'ARM64';
    if (attestation.runner_os !== expectedOs || attestation.runner_arch !== expectedArch || attestation.version_stdout !== `session-relay ${VERSION}`) fail('preflight native attestation mismatch');
  }
  exactKeys(value.checksum, ['artifact_name', 'database_id', 'archive_size', 'archive_digest', 'file_name', 'sha256', 'size', 'entries'], 'preflight checksum');
  if (value.checksum.artifact_name !== 'session-relay-checksums' || value.checksum.file_name !== 'SHA256SUMS') fail('preflight checksum identity mismatch');
  positiveInteger(value.checksum.database_id, 'preflight checksum database_id');
  if (ids.has(value.checksum.database_id)) fail('preflight checksum database ID duplicated');
  positiveInteger(value.checksum.archive_size, 'preflight checksum archive_size');
  if (!/^sha256:[0-9a-f]{64}$/.test(value.checksum.archive_digest)) fail('preflight checksum archive_digest mismatch');
  digest(value.checksum.sha256, 'preflight checksum sha256');
  positiveInteger(value.checksum.size, 'preflight checksum size');
  exactArray(value.checksum.entries, 'preflight checksum entries');
  if (value.checksum.entries.length !== TARGETS.length) fail('preflight checksum entries mismatch');
  const entries = new Map();
  for (const entry of value.checksum.entries) {
    exactKeys(entry, ['name', 'sha256'], 'preflight checksum entry');
    digest(entry.sha256, 'preflight checksum entry sha256');
    if (entries.has(entry.name)) fail('preflight checksum entry duplicated');
    entries.set(entry.name, entry.sha256);
  }
  for (const artifact of value.artifacts) if (entries.get(artifact.asset_name) !== artifact.sha256) fail('preflight checksum does not bind binary');
  exactKeys(value.producer, ['path', 'version'], 'preflight producer');
  if (value.producer.path !== 'scripts/verify-session-relay-preflight.mjs' || value.producer.version !== '2') fail('preflight producer identity mismatch');
  iso(value.created_at, 'preflight created_at');
  return value;
}

export function validateSourceCiReceipt(value, context = {}) {
  const expected = exactContext(context, ['sourceCommit'], 'source-CI validation context');
  exactKeys(value, ['schema', 'type', 'repository_id', 'source_commit', 'workflow', 'bootstrap', 'required_steps', 'command', 'jobs_sha256', 'logs_sha256', 'started_at', 'completed_at', 'created_at'], 'SourceCiReceiptV1');
  if (value.schema !== 1 || value.type !== 'SourceCiReceiptV1' || value.repository_id !== REPOSITORY_ID) fail('source-CI receipt identity mismatch');
  commit(value.source_commit, 'source-CI source_commit');
  if (expected.sourceCommit !== undefined && value.source_commit !== expected.sourceCommit) fail('source-CI source commit mismatch');
  exactKeys(value.workflow, ['file', 'file_blob_id', 'file_sha256', 'identity_sha256', 'run_database_id', 'run_attempt', 'event', 'head_branch', 'head_sha', 'inputs', 'conclusion'], 'source-CI workflow');
  commit(value.workflow.file_blob_id, 'source-CI workflow file_blob_id');
  digest(value.workflow.file_sha256, 'source-CI workflow file_sha256');
  digest(value.workflow.identity_sha256, 'source-CI workflow identity_sha256');
  const identity = sha256(Buffer.from(canonicalize({ source_commit: value.source_commit, file_blob_id: value.workflow.file_blob_id, file_sha256: value.workflow.file_sha256 })));
  if (value.workflow.identity_sha256 !== identity) fail('source-CI workflow blob identity mismatch');
  const branch = `preflight/session-relay-${VERSION}-${value.source_commit.slice(0, 12)}`;
  if (value.workflow.file !== SOURCE_CI_WORKFLOW || value.workflow.event !== 'workflow_dispatch' || value.workflow.head_branch !== branch || value.workflow.head_sha !== value.source_commit || value.workflow.conclusion !== 'success') fail('source-CI workflow identity mismatch');
  positiveInteger(value.workflow.run_database_id, 'source-CI run_database_id');
  positiveInteger(value.workflow.run_attempt, 'source-CI run_attempt');
  exactKeys(value.workflow.inputs, [], 'source-CI workflow inputs');
  exactKeys(value.bootstrap, ['node', 'pnpm', 'claude', 'rust', 'musl'], 'source-CI bootstrap');
  if (value.bootstrap.node !== '24' || value.bootstrap.pnpm !== '--frozen-lockfile' || value.bootstrap.claude !== 'materialized-on-PATH' || value.bootstrap.rust !== '1.85.0' || value.bootstrap.musl !== true) fail('source-CI bootstrap mismatch');
  exactArray(value.required_steps, 'source-CI required_steps');
  if (value.required_steps.length !== REQUIRED_CI_STEPS.length) fail('source-CI required step count mismatch');
  for (const [index, step] of value.required_steps.entries()) {
    exactKeys(step, ['name', 'number', 'conclusion'], `source-CI required_steps[${index}]`);
    positiveInteger(step.number, `source-CI required_steps[${index}].number`);
    if (step.name !== REQUIRED_CI_STEPS[index] || step.number !== REQUIRED_CI_STEP_NUMBERS[index] || step.conclusion !== 'success') fail('source-CI required step outcome mismatch');
  }
  if (canonicalize(value.command) !== canonicalize(['node', 'scripts/ci.mjs'])) fail('source-CI command mismatch');
  digest(value.jobs_sha256, 'source-CI jobs_sha256');
  digest(value.logs_sha256, 'source-CI logs_sha256');
  iso(value.started_at, 'source-CI started_at');
  iso(value.completed_at, 'source-CI completed_at');
  iso(value.created_at, 'source-CI created_at');
  if (Date.parse(value.completed_at) < Date.parse(value.started_at) || Date.parse(value.created_at) < Date.parse(value.completed_at)) fail('source-CI timestamps are inconsistent');
  return value;
}

function validateCheckEvidence(check, expectedId) {
  exactKeys(check, ['id', 'steps', 'exit_code', 'stdout_sha256', 'stderr_sha256'], `candidate check ${expectedId}`);
  if (check.id !== expectedId) fail(`candidate check ${expectedId} is out of order`);
  exactArray(check.steps, `candidate check ${expectedId} steps`);
  if (check.steps.length === 0) fail(`candidate check ${expectedId} has no steps`);
  for (const step of check.steps) {
    exactKeys(step, ['argv', 'exit_code', 'stdout_sha256', 'stderr_sha256'], `candidate check ${expectedId} step`);
    exactStringArray(step.argv, `candidate check ${expectedId} argv`, { nonempty: true });
    if (!Number.isSafeInteger(step.exit_code)) fail(`candidate check ${expectedId} exit code invalid`);
    digest(step.stdout_sha256, `candidate check ${expectedId} stdout_sha256`);
    digest(step.stderr_sha256, `candidate check ${expectedId} stderr_sha256`);
  }
  if (check.exit_code !== 0 || check.steps.some((step) => step.exit_code !== 0)) fail(`candidate check ${expectedId} did not pass`);
  digest(check.stdout_sha256, `candidate check ${expectedId} stdout_sha256`);
  digest(check.stderr_sha256, `candidate check ${expectedId} stderr_sha256`);
}

export function validateSourcePreparationCandidate(value, context = {}) {
  const expected = exactContext(context, ['sourceCommit'], 'candidate validation context');
  exactKeys(value, ['schema', 'type', 'repository_id', 'version', 'source_commit', 'execution_base_commit', 'plan', 'docks_red', 'companion', 'preflight', 'source_ci', 'checks', 'created_at'], 'SourcePreparationCandidateV1');
  if (value.schema !== 1 || value.type !== 'SourcePreparationCandidateV1' || value.repository_id !== REPOSITORY_ID || value.version !== VERSION) fail('candidate immutable identity mismatch');
  commit(value.source_commit, 'candidate source_commit');
  commit(value.execution_base_commit, 'candidate execution_base_commit');
  if (expected.sourceCommit !== undefined && value.source_commit !== expected.sourceCommit) fail('candidate source commit mismatch');
  exactKeys(value.plan, ['path', 'source_blob_sha256'], 'candidate plan');
  if (value.plan.path !== PLAN_PATH) fail('candidate plan path mismatch');
  digest(value.plan.source_blob_sha256, 'candidate plan source_blob_sha256');
  exactKeys(value.docks_red, ['sha256', 'pre_production_commit', 'test_blobs'], 'candidate docks_red');
  digest(value.docks_red.sha256, 'candidate docks_red sha256');
  commit(value.docks_red.pre_production_commit, 'candidate docks_red pre_production_commit');
  exactArray(value.docks_red.test_blobs, 'candidate docks_red test_blobs');
  for (const item of value.docks_red.test_blobs) { exactKeys(item, ['path', 'blob_id'], 'candidate docks red test blob'); safeLogical(item.path, 'candidate docks red test path'); commit(item.blob_id, 'candidate docks red test blob_id'); }
  exactKeys(value.companion, ['repository_id', 'validation_ref', 'commit', 'plan_path', 'input_sha256', 'execution_base_commit', 'review_receipt_sha256', 'red_receipt_sha256', 'status', 'blocked_reason'], 'candidate companion');
  if (value.companion.repository_id !== PUBLIC_REPOSITORY_ID || !/^refs\/heads\/preflight\/[A-Za-z0-9._/-]+$/.test(value.companion.validation_ref)) fail('candidate companion repository/ref mismatch');
  commit(value.companion.commit, 'candidate companion commit');
  text(value.companion.plan_path, 'candidate companion plan_path');
  digest(value.companion.input_sha256, 'candidate companion input_sha256');
  commit(value.companion.execution_base_commit, 'candidate companion execution_base_commit');
  digest(value.companion.review_receipt_sha256, 'candidate companion review_receipt_sha256');
  digest(value.companion.red_receipt_sha256, 'candidate companion red_receipt_sha256');
  if (value.companion.status !== 'blocked' || value.companion.blocked_reason !== 'Awaiting the four independently hashed `session-relay--v0.12.0` production asset digests.') fail('candidate companion status mismatch');
  for (const [name, workflow] of [['preflight', value.preflight], ['source_ci', value.source_ci]]) {
    exactKeys(workflow, ['sha256', 'workflow_file', 'workflow_blob_id', 'run_database_id', 'run_attempt'], `candidate ${name}`);
    digest(workflow.sha256, `candidate ${name} sha256`);
    commit(workflow.workflow_blob_id, `candidate ${name} workflow_blob_id`);
    positiveInteger(workflow.run_database_id, `candidate ${name} run_database_id`);
    positiveInteger(workflow.run_attempt, `candidate ${name} run_attempt`);
  }
  if (value.preflight.workflow_file !== BUILD_WORKFLOW || value.source_ci.workflow_file !== SOURCE_CI_WORKFLOW) fail('candidate workflow file mismatch');
  exactArray(value.checks, 'candidate checks');
  if (value.checks.length !== 6) fail('candidate must record A1 through A6');
  value.checks.forEach((check, index) => validateCheckEvidence(check, `A${index + 1}`));
  iso(value.created_at, 'candidate created_at');
  return value;
}

export function validateCompletionReceiptClosed(value, expected = {}, waivers = []) {
  exactContext(expected, ['reviewedHead'], 'completion validation context');
  exactArray(waivers, 'completion review waivers');
  try {
    return validatePlanCompletionReceipt(
      value,
      { reviewed_head: expected.reviewedHead, review_status: 'passed' },
      { waivers },
    );
  } catch (error) {
    fail(`completion receipt invalid: ${error.message}`);
  }
}

export function validateSourcePreparationProof(value) {
  exactKeys(value, ['schema', 'type', 'repository_id', 'version', 'source_commit', 'tag_commit', 'evidence_commit', 'shipped_commit', 'promoted_commit', 'candidate', 'candidate_sha256', 'plans', 'completion_review_sha256', 'source_ancestry', 'non_plan_tree_equivalence', 'public_repository_id', 'public_reviewed_commit', 'review_status', 'bound_at'], 'SourcePreparationProofV1');
  if (value.schema !== 1 || value.type !== 'SourcePreparationProofV1' || value.repository_id !== REPOSITORY_ID || value.version !== VERSION) fail('source proof identity mismatch');
  for (const key of ['source_commit', 'tag_commit', 'evidence_commit', 'shipped_commit', 'promoted_commit', 'public_reviewed_commit']) commit(value[key], `source proof ${key}`);
  if (value.tag_commit !== value.source_commit || value.promoted_commit !== value.shipped_commit || value.public_repository_id !== PUBLIC_REPOSITORY_ID) fail('source proof shipped/promoted/public identity mismatch');
  validateSourcePreparationCandidate(value.candidate, { sourceCommit: value.source_commit });
  if (value.candidate.repository_id !== value.repository_id
    || value.candidate.version !== value.version
    || value.candidate.companion.repository_id !== value.public_repository_id
    || value.candidate.companion.commit !== value.public_reviewed_commit) {
    fail('source proof nested candidate identity mismatch');
  }
  digest(value.candidate_sha256, 'source proof candidate_sha256');
  if (value.candidate_sha256 !== sha256(Buffer.from(canonicalize(value.candidate)))) fail('source proof candidate digest mismatch');
  exactKeys(value.plans, ['source_path', 'source_sha256', 'evidence_path', 'evidence_sha256', 'finished_path', 'finished_sha256'], 'source proof plans');
  if (value.plans.source_path !== PLAN_PATH || value.plans.evidence_path !== PLAN_PATH || !FINISHED_PLAN.test(value.plans.finished_path)) fail('source proof plan path mismatch');
  for (const key of ['source_sha256', 'evidence_sha256', 'finished_sha256']) digest(value.plans[key], `source proof plans.${key}`);
  digest(value.completion_review_sha256, 'source proof completion_review_sha256');
  exactKeys(value.source_ancestry, ['source_commit', 'evidence_commit', 'shipped_commit', 'verified'], 'source proof ancestry');
  if (value.source_ancestry.source_commit !== value.source_commit || value.source_ancestry.evidence_commit !== value.evidence_commit || value.source_ancestry.shipped_commit !== value.shipped_commit || value.source_ancestry.verified !== true) fail('source proof ancestry mismatch');
  exactKeys(value.non_plan_tree_equivalence, ['source_commit', 'shipped_commit', 'excluded_paths', 'verified'], 'source proof tree equivalence');
  if (value.non_plan_tree_equivalence.source_commit !== value.source_commit || value.non_plan_tree_equivalence.shipped_commit !== value.shipped_commit || value.non_plan_tree_equivalence.verified !== true || canonicalize(value.non_plan_tree_equivalence.excluded_paths) !== canonicalize([PLAN_PATH, value.plans.finished_path])) fail('source proof non-plan tree equivalence mismatch');
  if (value.review_status !== 'passed') fail('source proof completion review did not pass');
  iso(value.bound_at, 'source proof bound_at');
  return value;
}

export function prepareCiCall() {
  return { argv: ['node', 'scripts/ci.mjs'] };
}
export function runPrepareCi(run = command) {
  const ciCall = prepareCiCall();
  run(ciCall.argv[0], ciCall.argv.slice(1), { inherit: true });
  return ciCall;
}


export function prepare(options, fixtureJournal) {
  const dryRun = options.get('dry-run') === true;
  const files = [
    replaceJsonVersion(path.join(REPO, 'plugins/session-relay/.claude-plugin/plugin.json'), (value) => { value.version = VERSION; }),
    replaceJsonVersion(path.join(REPO, 'plugins/session-relay/.codex-plugin/plugin.json'), (value) => { value.version = VERSION; }),
    replaceJsonVersion(path.join(REPO, '.claude-plugin/marketplace.json'), (value) => {
      const entry = value.plugins.find(({ name }) => name === PLUGIN);
      if (!entry) fail('Session Relay marketplace entry is missing');
      entry.version = VERSION;
    }),
  ];
  for (const relative of ['plugins/session-relay/rust/Cargo.toml', 'plugins/session-relay/rust/Cargo.lock']) {
    const file = path.join(REPO, relative);
    const original = fs.readFileSync(file);
    let contents = original.toString('utf8');
    if (relative.endsWith('Cargo.toml')) contents = contents.replace(/(^\[package\][\s\S]*?^version = ")\d+\.\d+\.\d+("$)/m, `$1${VERSION}$2`);
    else contents = contents.replace(/(^name = "relay"\nversion = ")\d+\.\d+\.\d+("$)/m, `$1${VERSION}$2`);
    if (contents === original.toString('utf8') && !contents.includes(`version = "${VERSION}"`)) fail(`could not locate version in ${relative}`);
    files.push({ file, original, changed: Buffer.from(contents) });
  }
  if (dryRun) {
    for (const item of files) process.stdout.write(`[dry-run] would update ${path.relative(REPO, item.file)} to ${VERSION}\n`);
    process.stdout.write('[dry-run] no files changed; the real release will gate the exact changed tree with scripts/ci.mjs before committing.\n');
    return { outcome: 'success', calls: [], mutations: [], journal: fixtureJournal, receipt: null, state: { version: VERSION, tag: TAG, dry_run: true } };
  }
  ensureCleanTree();
  for (const item of files) fs.writeFileSync(item.file, item.changed);
  let ciCall;
  try { ciCall = runPrepareCi(); }
  catch (error) { for (const item of files) fs.writeFileSync(item.file, item.original); throw error; }
  const relative = files.map(({ file }) => path.relative(REPO, file));
  command('git', ['add', '--', ...relative]);
  command('git', ['commit', '-m', `chore(release): ${PLUGIN} v${VERSION}`], { inherit: true });
  return { outcome: 'success', calls: [ciCall], mutations: relative, journal: fixtureJournal, receipt: null, state: { version: VERSION, tag: TAG, dry_run: false } };
}

export function materialize(options) {
  const planPath = canonicalPath(options.get('plan'), '--plan');
  const plan = fs.readFileSync(planPath, 'utf8');
  const docks = embeddedReceipt(plan, 'Docks TDD-red receipt', 'TddRedReceiptV1');
  const publicReceipt = embeddedReceipt(plan, 'Companion TDD-red receipt', 'TddRedReceiptV1');
  validateTddRedReceipt(docks.value, { repositoryId: REPOSITORY_ID });
  validateTddRedReceipt(publicReceipt.value, { repositoryId: PUBLIC_REPOSITORY_ID });
  const docksOut = writeCanonicalExclusive(options.get('docks-red-out'), docks.value);
  const publicOut = writeCanonicalExclusive(options.get('public-red-out'), publicReceipt.value);
  process.stdout.write(`${docksOut.digest}\n${publicOut.digest}\n`);
  return { receipt: docks.value, state: { docks_sha256: docksOut.digest, public_sha256: publicOut.digest } };
}

function sourceCiDependencies(injected) {
  const value = injected ?? {
    apiJson: (endpoint) => ghJson(`/${endpoint.replace(/^\//, '')}`),
    apiBytes: (endpoint) => {
      const result = spawnSync('gh', ['api', '--method', 'GET', endpoint], { cwd: REPO, encoding: null, shell: false, stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 });
      if (result.error || result.signal || result.status !== 0) fail(`source CI log query failed: ${result.stderr?.toString().trim() || result.error?.message || result.signal || result.status}`);
      return result.stdout;
    },
    now: () => new Date().toISOString(),
  };
  exactKeys(value, ['apiJson', 'apiBytes', 'now'], 'source-CI dependency adapter');
  for (const key of ['apiJson', 'apiBytes', 'now']) if (typeof value[key] !== 'function') fail(`source-CI dependency ${key} must be a function`);
  return value;
}

function gitBlobId(bytes) {
  return createHash('sha1').update(Buffer.from(`blob ${bytes.length}\0`)).update(bytes).digest('hex');
}

function decodeWorkflowFile(file, expectedPath) {
  if (!record(file) || file.type !== 'file' || file.path !== expectedPath || !COMMIT.test(file.sha ?? '') || file.encoding !== 'base64' || typeof file.content !== 'string') fail('source CI workflow file response mismatch');
  let bytes;
  try { bytes = Buffer.from(file.content.replace(/\s/g, ''), 'base64'); } catch { fail('source CI workflow file is not base64'); }
  if (gitBlobId(bytes) !== file.sha) fail('source CI workflow file blob mismatch');
  let workflow;
  try {
    const document = parseDocument(new TextDecoder('utf-8', { fatal: true }).decode(bytes), { uniqueKeys: true });
    if (document.errors.length !== 0) fail(`source CI workflow YAML is invalid: ${document.errors[0].message}`);
    workflow = document.toJS({ maxAliasCount: 0 });
  } catch (error) {
    if (error?.name === 'SessionRelayReleaseError') throw error;
    fail(`source CI workflow YAML is invalid: ${error.message}`);
  }
  exactKeys(workflow, ['name', 'on', 'permissions', 'jobs'], 'source CI workflow');
  if (workflow.name !== 'validate'
    || canonicalize(workflow.on) !== canonicalize({
      pull_request: { branches: ['main'] },
      push: { tags: ['*--v*'] },
      workflow_dispatch: null,
    })
    || canonicalize(workflow.permissions) !== canonicalize({ contents: 'read' })) {
    fail('source CI workflow triggers or permissions mismatch');
  }
  exactKeys(workflow.jobs, ['validate'], 'source CI jobs');
  const job = workflow?.jobs?.validate;
  exactKeys(job, ['name', 'runs-on', 'steps'], 'source CI validate job');
  const expectedSteps = expectedCiJobSteps();
  if (job.name !== 'validate (scripts/ci.mjs)' || job['runs-on'] !== 'ubuntu-latest' || canonicalize(job.steps) !== canonicalize(expectedSteps)) fail('source CI validate job definition mismatch');
  const requiredDefinitions = EXPECTED_CI_STEP_DEFINITIONS.map((expected) => {
    const index = expectedSteps.indexOf(expected);
    if (index < 0) fail(`source CI authoritative step is not in the closed job: ${expected.name}`);
    return { name: expected.name, number: index + 2 };
  });
  return { bytes, blobId: file.sha, requiredDefinitions };
}

function validateSourceCiRun(run, runId, expectedCommit) {
  const inputsAreEmpty = run?.inputs === undefined || (record(run.inputs) && Object.keys(run.inputs).length === 0);
  if (!record(run) || run.id !== runId || run.head_sha !== expectedCommit || run.head_branch !== `preflight/session-relay-${VERSION}-${expectedCommit.slice(0, 12)}` || run.event !== 'workflow_dispatch' || run.status !== 'completed' || run.conclusion !== 'success' || run.path !== SOURCE_CI_WORKFLOW || !inputsAreEmpty || run.repository?.full_name !== REPOSITORY_ID || run.head_repository?.full_name !== REPOSITORY_ID) fail('source CI run identity, inputs, or conclusion mismatch');
  positiveInteger(run.run_attempt, 'source CI run attempt');
  return run;
}

export function verifySourceCi(options, injected) {
  const expectedCommit = options.get('expected-commit');
  commit(expectedCommit, '--expected-commit');
  const deps = sourceCiDependencies(injected);
  const runIdText = options.get('run-id');
  if (!/^[1-9][0-9]*$/.test(runIdText ?? '')) fail('--run-id must be a canonical positive decimal integer');
  const runId = Number(runIdText);
  const run = validateSourceCiRun(deps.apiJson(`repos/${REPOSITORY_ID}/actions/runs/${runId}`), runId, expectedCommit);
  const workflowResponse = deps.apiJson(`repos/${REPOSITORY_ID}/contents/${SOURCE_CI_WORKFLOW}?ref=${encodeURIComponent(expectedCommit)}`);
  const workflow = decodeWorkflowFile(workflowResponse, SOURCE_CI_WORKFLOW);
  const jobsResponse = deps.apiJson(`repos/${REPOSITORY_ID}/actions/runs/${runId}/jobs?per_page=100`);
  if (!record(jobsResponse) || jobsResponse.total_count !== 1 || !Array.isArray(jobsResponse.jobs) || jobsResponse.jobs.length !== 1) fail('source CI must contain exactly one authoritative job');
  const job = jobsResponse.jobs[0];
  if (!record(job) || job.name !== 'validate (scripts/ci.mjs)' || job.status !== 'completed' || job.conclusion !== 'success' || !Array.isArray(job.steps)) fail('source CI authoritative job mismatch');
  positiveInteger(job.id, 'source CI job id');
  if (job.run_attempt !== run.run_attempt || (job.run_id !== undefined && job.run_id !== run.id) || (job.head_sha !== undefined && job.head_sha !== expectedCommit)) fail('source CI job run identity or attempt mismatch');
  const requiredSteps = [];
  for (const definition of workflow.requiredDefinitions) {
    const matches = job.steps.filter((step) => step?.name === definition.name);
    if (matches.length !== 1 || matches[0].number !== definition.number || matches[0].status !== 'completed' || matches[0].conclusion !== 'success') fail(`source CI required step did not complete successfully: ${definition.name}`);
    requiredSteps.push({ name: definition.name, number: definition.number, conclusion: 'success' });
  }
  const logs = deps.apiBytes(`repos/${REPOSITORY_ID}/actions/jobs/${job.id}/logs`);
  if (!Buffer.isBuffer(logs) || logs.length === 0) fail('source CI authoritative job log is empty');
  const finalRun = validateSourceCiRun(deps.apiJson(`repos/${REPOSITORY_ID}/actions/runs/${runId}`), runId, expectedCommit);
  if (finalRun.run_attempt !== run.run_attempt || finalRun.id !== run.id || finalRun.head_sha !== run.head_sha || finalRun.status !== run.status || finalRun.conclusion !== run.conclusion) fail('source CI run identity changed while evidence was collected');
  const jobsText = canonicalize(jobsResponse.jobs);
  const logsText = canonicalize([{ job_database_id: job.id, sha256: sha256(logs) }]);
  const workflowSha = sha256(workflow.bytes);
  const workflowIdentity = sha256(Buffer.from(canonicalize({ source_commit: expectedCommit, file_blob_id: workflow.blobId, file_sha256: workflowSha })));
  const receipt = {
    schema: 1, type: 'SourceCiReceiptV1', repository_id: REPOSITORY_ID, source_commit: expectedCommit,
    workflow: {
      file: SOURCE_CI_WORKFLOW, file_blob_id: workflow.blobId, file_sha256: workflowSha, identity_sha256: workflowIdentity,
      run_database_id: runId, run_attempt: run.run_attempt, event: run.event, head_branch: run.head_branch,
      head_sha: run.head_sha, inputs: {}, conclusion: run.conclusion,
    },
    bootstrap: { node: '24', pnpm: '--frozen-lockfile', claude: 'materialized-on-PATH', rust: '1.85.0', musl: true },
    required_steps: requiredSteps, command: ['node', 'scripts/ci.mjs'],
    jobs_sha256: sha256(Buffer.from(jobsText)), logs_sha256: sha256(Buffer.from(logsText)),
    started_at: run.run_started_at, completed_at: finalRun.updated_at, created_at: deps.now(),
  };
  validateSourceCiReceipt(receipt, { sourceCommit: expectedCommit });
  return emitReceipt(options, receipt);
}

function runIsolatedGit(root, args, { allowAncestorMiss = false, bytes = false } = {}) {
  const result = spawnSync('git', ['-C', root, ...args], {
    encoding: bytes ? null : 'utf8',
    shell: false,
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 64 * 1024 * 1024,
  });
  if (allowAncestorMiss && result.status === 1 && !result.error && !result.signal) return null;
  if (result.error || result.signal || result.status !== 0) {
    const detail = result.stderr?.toString().trim() || result.error?.message || result.signal || `exit ${result.status}`;
    fail(`companion repository verification failed: git ${args[0]}: ${detail}`);
  }
  return bytes ? result.stdout : result.stdout.trim();
}

function inspectPublicRepository(input) {
  exactKeys(input, ['remote', 'ref', 'commit', 'planPath', 'redCommit', 'testPaths'], 'companion inspection request');
  if (input.remote !== PUBLIC_REMOTE || !/^refs\/heads\/[A-Za-z0-9._/-]+$/.test(input.ref)) fail('companion inspection remote/ref mismatch');
  commit(input.commit, 'companion inspection commit');
  commit(input.redCommit, 'companion inspection red commit');
  safeLogical(input.planPath, 'companion inspection plan path');
  exactArray(input.testPaths, 'companion inspection test paths');
  input.testPaths.forEach((item) => safeLogical(item, 'companion inspection test path'));
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'session-relay-public-verify-'));
  fs.chmodSync(root, 0o700);
  const identity = fs.lstatSync(root);
  try {
    runIsolatedGit(root, ['init', '--quiet']);
    runIsolatedGit(root, ['fetch', '--quiet', '--no-tags', input.remote, input.ref]);
    const resolvedCommit = runIsolatedGit(root, ['rev-parse', 'FETCH_HEAD^{commit}']);
    const planBytes = runIsolatedGit(root, ['show', `${input.commit}:${input.planPath}`], { bytes: true });
    const redIsAncestor = runIsolatedGit(root, ['merge-base', '--is-ancestor', input.redCommit, input.commit], { allowAncestorMiss: true }) !== null;
    const testBlobs = input.testPaths.map((testPath) => ({
      path: testPath,
      red_blob_id: runIsolatedGit(root, ['rev-parse', `${input.redCommit}:${testPath}`]),
      implementation_blob_id: runIsolatedGit(root, ['rev-parse', `${input.commit}:${testPath}`]),
    }));
    return {
      resolved_commit: resolvedCommit,
      plan_bytes: planBytes,
      red_is_ancestor: redIsAncestor,
      test_blobs: testBlobs,
    };
  } finally {
    let current;
    try { current = fs.lstatSync(root); } catch { fail('companion verification root disappeared before cleanup'); }
    if (fs.realpathSync.native(root) !== root || !current.isDirectory() || current.isSymbolicLink() || current.dev !== identity.dev || current.ino !== identity.ino) fail('companion verification root identity changed before cleanup');
    fs.rmSync(root, { recursive: true });
  }
}

function evidenceDependencies(injected) {
  const value = injected ?? {
    repoRoot: REPO,
    git: (args) => args[0] === 'show' ? gitRaw(args) : git(args),
    inspectPublic: inspectPublicRepository,
    run: (executable, args, runOptions = {}) => {
      const result = spawnSync(executable, args, {
        cwd: REPO, encoding: null, shell: false, stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: Infinity,
        env: runOptions.env ? { ...process.env, ...runOptions.env } : process.env,
      });
      return { status: result.status ?? 1, stdout: result.stdout ?? Buffer.alloc(0), stderr: result.stderr ?? Buffer.alloc(0) };
    },
    now: () => new Date().toISOString(),
    readFile: (file) => fs.readFileSync(file),
  };
  exactKeys(value, ['repoRoot', 'git', 'inspectPublic', 'run', 'now', 'readFile'], 'preparation dependency adapter');
  if (!path.isAbsolute(value.repoRoot) || fs.realpathSync.native(value.repoRoot) !== value.repoRoot || !fs.lstatSync(value.repoRoot).isDirectory()) fail('preparation dependency repoRoot must be a canonical directory');
  for (const key of ['git', 'inspectPublic', 'run', 'now', 'readFile']) if (typeof value[key] !== 'function') fail(`preparation dependency ${key} must be a function`);
  return value;
}

function gitValue(deps, args) {
  const value = deps.git(args);
  return Buffer.isBuffer(value) ? value.toString('utf8').trim() : String(value).trim();
}

function gitBytes(deps, args) {
  const value = deps.git(args);
  return Buffer.isBuffer(value) ? value : Buffer.from(String(value));
}

function ancestor(deps, older, newer, label) {
  try { deps.git(['merge-base', '--is-ancestor', older, newer]); }
  catch { fail(`${label} ancestry mismatch`); }
}

function parseExecutionBase(plan) {
  const matches = [...plan.matchAll(/^execution_base_commit:\s*([0-9a-f]{40})\s*$/gm)];
  if (matches.length !== 1) fail('plan must contain exactly one execution_base_commit');
  return matches[0][1];
}

function codeNote(plan, label) {
  const value = noteValue(plan, label);
  const code = /^`([^`]+)`\.?$/.exec(value);
  return code ? code[1] : value;
}

function runStep(deps, executable, args, runOptions) {
  const result = deps.run(executable, args, runOptions);
  if (!record(result) || !Number.isSafeInteger(result.status)) fail('preparation run adapter returned an invalid result');
  const stdout = Buffer.isBuffer(result.stdout) ? result.stdout : Buffer.from(result.stdout ?? '');
  const stderr = Buffer.isBuffer(result.stderr) ? result.stderr : Buffer.from(result.stderr ?? '');
  return { argv: [executable, ...args], exit_code: result.status, stdout_sha256: sha256(stdout), stderr_sha256: sha256(stderr), stdout, stderr };
}

function runCheck(deps, id, specifications) {
  const steps = [];
  const stdout = [];
  const stderr = [];
  let exitCode = 0;
  for (const specification of specifications) {
    const step = runStep(deps, specification.executable, specification.args, specification.options);
    stdout.push(step.stdout);
    stderr.push(step.stderr);
    steps.push({ argv: step.argv, exit_code: step.exit_code, stdout_sha256: step.stdout_sha256, stderr_sha256: step.stderr_sha256 });
    if (step.exit_code !== 0) { exitCode = step.exit_code; break; }
  }
  return { id, steps, exit_code: exitCode, stdout_sha256: sha256(Buffer.concat(stdout)), stderr_sha256: sha256(Buffer.concat(stderr)) };
}

function runAcceptanceChecks(deps, plan, sourceCommit, executionBase) {
  const publicRef = noteValue(plan, 'Companion validation ref');
  const publicCommit = noteValue(plan, 'Companion implementation commit');
  const checks = [
    runCheck(deps, 'A1', [{ executable: 'node', args: ['plugins/session-relay/test/companion-distribution-contract.mjs', '--public-remote', PUBLIC_REMOTE, '--public-ref', publicRef, '--public-commit', publicCommit, '--detached-clone'] }]),
    runCheck(deps, 'A2', [
      { executable: 'cargo', args: ['+1.85.0', 'build', '--manifest-path', 'plugins/session-relay/rust/Cargo.toml', '--release', '--locked'] },
      { executable: 'node', args: ['plugins/session-relay/test/selftest.mjs'], options: { env: { SESSION_RELAY_TEST_BIN: path.join(REPO, 'plugins/session-relay/rust/target/release/relay') } } },
    ]),
    runCheck(deps, 'A3', [{ executable: 'git', args: ['ls-files', 'plugins/session-relay/bin'] }]),
    runCheck(deps, 'A4', [{ executable: 'node', args: ['scripts/ci.mjs', '--plugin', PLUGIN] }]),
    runCheck(deps, 'A5', [{ executable: 'node', args: ['scripts/skills/content-hash.mjs', '--check-only', 'plugins/session-relay/skills'] }]),
    runCheck(deps, 'A6', [{ executable: 'git', args: ['diff', '--check', `${executionBase}..HEAD`] }]),
  ];
  if (checks.some((check) => check.exit_code !== 0)) fail('one or more source preparation checks failed', 'failure');
  const tracked = deps.run('git', ['ls-files', 'plugins/session-relay/bin']);
  const trackedOutput = Buffer.isBuffer(tracked.stdout) ? tracked.stdout.toString('utf8') : String(tracked.stdout ?? '');
  if (tracked.status !== 0 || trackedOutput !== 'plugins/session-relay/bin/relay\n') fail('A3 did not prove the launcher-only tracked bin tree');
  if (sourceCommit.length !== 40) fail('source commit changed while running acceptance checks');
  return checks;
}

function verifyRedBlobs(deps, receipt, implementationCommit, label) {
  ancestor(deps, receipt.pre_production_commit, implementationCommit, `${label} red-to-implementation`);
  for (const item of receipt.test_paths) {
    const atRed = gitValue(deps, ['rev-parse', `${receipt.pre_production_commit}:${item.path}`]);
    const atImplementation = gitValue(deps, ['rev-parse', `${implementationCommit}:${item.path}`]);
    if (atRed !== item.blob_id || atImplementation !== item.blob_id) fail(`${label} test blob changed after TDD-red capture`);
  }
  const producerAtRed = gitValue(deps, ['rev-parse', `${receipt.pre_production_commit}:${receipt.producer.path}`]);
  const producerAtImplementation = gitValue(deps, ['rev-parse', `${implementationCommit}:${receipt.producer.path}`]);
  if (producerAtRed !== receipt.producer.blob_id || producerAtImplementation !== receipt.producer.blob_id) fail(`${label} TDD-red producer blob mismatch`);
}

function requireSourceTree(deps, sourceCommit) {
  if (gitValue(deps, ['rev-parse', `${sourceCommit}^{commit}`]) !== sourceCommit) fail('SOURCE_COMMIT does not resolve exactly');
  const head = gitValue(deps, ['rev-parse', 'HEAD^{commit}']);
  ancestor(deps, sourceCommit, head, 'source-to-evidence');
  const nonPlan = gitValue(deps, ['diff', '--name-only', sourceCommit, head, '--', '.', `:(exclude)${PLAN_PATH}`]);
  if (nonPlan !== '') fail('tree differs from SOURCE_COMMIT outside the active plan');
  const status = gitValue(deps, ['status', '--porcelain=v2', '-z', '--untracked-files=all']);
  if (status !== '') {
    const entries = status.split('\0').filter(Boolean);
    if (entries.some((entry) => {
      const fields = entry.split(' ');
      return fields[0] !== '1' || fields.slice(8).join(' ') !== PLAN_PATH;
    })) fail('working tree is not clean except for the active plan');
  }
  return head;
}

function receiptSummary(preflight, sourceCi) {
  return {
    preflight: {
      sha256: preflight.digest, workflow_file: preflight.value.workflow.file,
      workflow_blob_id: preflight.value.workflow.file_blob_id,
      run_database_id: preflight.value.workflow.run_database_id, run_attempt: preflight.value.workflow.run_attempt,
    },
    source_ci: {
      sha256: sourceCi.digest, workflow_file: sourceCi.value.workflow.file,
      workflow_blob_id: sourceCi.value.workflow.file_blob_id,
      run_database_id: sourceCi.value.workflow.run_database_id, run_attempt: sourceCi.value.workflow.run_attempt,
    },
  };
}

function companionPlanPath(value) {
  const prefix = '/home/vagrant/projects/public/';
  if (!value.startsWith(prefix)) fail('companion plan path is not in the fixed public repository');
  return safeLogical(value.slice(prefix.length), 'companion plan path');
}

function companionReviewReceipt(plan) {
  const matches = [...plan.matchAll(/^Review-receipt: (\{.*\})$/gm)];
  if (matches.length !== 1) fail('companion plan must contain exactly one Review-receipt');
  let value;
  try { value = JSON.parse(matches[0][1]); } catch { fail('companion Review-receipt is not JSON'); }
  if (canonicalize(value) !== matches[0][1]) fail('companion Review-receipt is not canonical JCS');
  exactKeys(value, ['input_sha256', 'outcome', 'phase', 'reviewed_commit', 'reviewer', 'schema'], 'companion Review-receipt');
  digest(value.input_sha256, 'companion Review-receipt input_sha256');
  commit(value.reviewed_commit, 'companion Review-receipt reviewed_commit');
  if (value.schema !== 1 || value.phase !== 'draft' || !['single', 'dual'].includes(value.outcome)) fail('companion Review-receipt identity mismatch');
  exactKeys(value.reviewer, ['company', 'mode', 'verdict'], 'companion Review-receipt reviewer');
  if (value.reviewer.verdict !== 'ready') fail('companion Review-receipt is not ready');
  return { bytes: Buffer.from(matches[0][1]), value };
}

function verifyPublicBinding(deps, docksPlan, publicReceipt) {
  const notes = {
    repository_id: noteValue(docksPlan, 'Companion repository ID'),
    validation_ref: noteValue(docksPlan, 'Companion validation ref'),
    commit: noteValue(docksPlan, 'Companion implementation commit'),
    plan_path: codeNote(docksPlan, 'Companion plan'),
    input_sha256: noteValue(docksPlan, 'Companion plan input SHA-256'),
    execution_base_commit: noteValue(docksPlan, 'Companion execution base commit'),
    review_receipt_sha256: noteValue(docksPlan, 'Companion review receipt SHA-256'),
    red_receipt_sha256: publicReceipt.digest,
    status: noteValue(docksPlan, 'Companion status'),
    blocked_reason: noteValue(docksPlan, 'Companion blocked reason'),
  };
  if (notes.repository_id !== PUBLIC_REPOSITORY_ID || noteValue(docksPlan, 'Companion TDD-red receipt SHA-256') !== publicReceipt.digest) fail('companion Notes identity mismatch');
  for (const key of ['input_sha256', 'review_receipt_sha256']) digest(notes[key], `companion ${key}`);
  commit(notes.commit, 'companion commit');
  commit(notes.execution_base_commit, 'companion execution base commit');
  if (publicReceipt.value.pre_production_commit === notes.commit) fail('companion TDD-red commit must predate implementation');
  const planPath = companionPlanPath(notes.plan_path);
  const observed = deps.inspectPublic({
    remote: PUBLIC_REMOTE,
    ref: notes.validation_ref,
    commit: notes.commit,
    planPath,
    redCommit: publicReceipt.value.pre_production_commit,
    testPaths: publicReceipt.value.test_paths.map((item) => item.path),
  });
  exactKeys(observed, ['resolved_commit', 'plan_bytes', 'red_is_ancestor', 'test_blobs'], 'companion inspection result');
  if (observed.resolved_commit !== notes.commit || observed.red_is_ancestor !== true || !Buffer.isBuffer(observed.plan_bytes)) fail('companion ref/commit/red ancestry mismatch');
  const publicPlan = new TextDecoder('utf-8', { fatal: true }).decode(observed.plan_bytes);
  const embedded = embeddedReceipt(publicPlan, 'Companion TDD-red receipt', 'TddRedReceiptV1');
  if (embedded.digest !== publicReceipt.digest || !embedded.bytes.equals(publicReceipt.bytes)) fail('companion plan TDD-red receipt bytes mismatch');
  if (parseExecutionBase(publicPlan) !== notes.execution_base_commit) fail('companion execution base mismatch');
  const review = companionReviewReceipt(publicPlan);
  if (sha256(review.bytes) !== notes.review_receipt_sha256 || review.value.input_sha256 !== notes.input_sha256) fail('companion review receipt/input mismatch');
  if (frontmatterValue(publicPlan, 'status') !== 'blocked' || frontmatterValue(publicPlan, 'review_status') !== 'ready' || frontmatterValue(publicPlan, 'blocked_reason') !== notes.blocked_reason || noteValue(publicPlan, 'Status') !== notes.status || noteValue(publicPlan, 'Blocked reason') !== notes.blocked_reason) fail('companion blocked lifecycle mismatch');
  exactArray(observed.test_blobs, 'companion inspected test blobs');
  if (observed.test_blobs.length !== publicReceipt.value.test_paths.length) fail('companion inspected test blob count mismatch');
  for (const [index, expected] of publicReceipt.value.test_paths.entries()) {
    const actual = observed.test_blobs[index];
    exactKeys(actual, ['path', 'red_blob_id', 'implementation_blob_id'], `companion inspected test blob ${index}`);
    if (actual.path !== expected.path || actual.red_blob_id !== expected.blob_id || actual.implementation_blob_id !== expected.blob_id) fail('companion test blob mismatch');
  }
  return notes;
}

export function checkPrepared(options, injected) {
  const source = commit(options.get('source-commit'), '--source-commit');
  const deps = evidenceDependencies(injected);
  const docks = readCanonical(options.get('docks-red'), options.get('docks-red-sha256'), 'TddRedReceiptV1', '--docks-red');
  const publicReceipt = readCanonical(options.get('public-red'), options.get('public-red-sha256'), 'TddRedReceiptV1', '--public-red');
  const preflight = readCanonical(options.get('preflight'), options.get('preflight-sha256'), 'ProducerPreflightReceiptV1', '--preflight');
  const sourceCi = readCanonical(options.get('source-ci'), options.get('source-ci-sha256'), 'SourceCiReceiptV1', '--source-ci');
  validateTddRedReceipt(docks.value, { repositoryId: REPOSITORY_ID });
  validateTddRedReceipt(publicReceipt.value, { repositoryId: PUBLIC_REPOSITORY_ID });
  if (canonicalize(docks.value.producer) !== canonicalize(publicReceipt.value.producer)) fail('Docks and companion TDD-red producer identities differ');
  validateProducerPreflightReceipt(preflight.value, { sourceCommit: source });
  validateSourceCiReceipt(sourceCi.value, { sourceCommit: source });
  requireSourceTree(deps, source);
  const planBytes = deps.readFile(path.join(REPO, PLAN_PATH));
  const plan = planBytes.toString('utf8');
  const executionBase = parseExecutionBase(plan);
  ancestor(deps, executionBase, source, 'execution-base-to-source');
  verifyRedBlobs(deps, docks.value, source, 'Docks');
  if (preflight.value.workflow.file_blob_id !== gitValue(deps, ['rev-parse', `${source}:${BUILD_WORKFLOW}`])) fail('preflight workflow blob does not belong to SOURCE_COMMIT');
  if (sourceCi.value.workflow.file_blob_id !== gitValue(deps, ['rev-parse', `${source}:${SOURCE_CI_WORKFLOW}`])) fail('source-CI workflow blob does not belong to SOURCE_COMMIT');
  const notes = verifyPublicBinding(deps, plan, publicReceipt);
  const checks = runAcceptanceChecks(deps, plan, source, executionBase);
  const sourcePlanBytes = gitBytes(deps, ['show', `${source}:${PLAN_PATH}`]);
  const summaries = receiptSummary(preflight, sourceCi);
  const receipt = {
    schema: 1, type: 'SourcePreparationCandidateV1', repository_id: REPOSITORY_ID, version: VERSION,
    source_commit: source, execution_base_commit: executionBase,
    plan: { path: PLAN_PATH, source_blob_sha256: sha256(sourcePlanBytes) },
    docks_red: { sha256: docks.digest, pre_production_commit: docks.value.pre_production_commit, test_blobs: docks.value.test_paths },
    companion: notes, preflight: summaries.preflight, source_ci: summaries.source_ci, checks, created_at: deps.now(),
  };
  validateSourcePreparationCandidate(receipt, { sourceCommit: source });
  return emitReceipt(options, receipt);
}

function checkExecutionIdentity(checks) {
  return checks.map(({ id, exit_code, steps }) => ({
    id,
    exit_code,
    steps: steps.map(({ argv, exit_code: stepExit }) => ({ argv, exit_code: stepExit })),
  }));
}

function embeddedEvidence(plan) {
  const docks = embeddedReceipt(plan, 'Docks TDD-red receipt', 'TddRedReceiptV1');
  const publicReceipt = embeddedReceipt(plan, 'Companion TDD-red receipt', 'TddRedReceiptV1');
  const preflight = embeddedReceipt(plan, 'Producer preflight receipt', 'ProducerPreflightReceiptV1');
  const sourceCi = embeddedReceipt(plan, 'Source CI receipt', 'SourceCiReceiptV1');
  const candidate = embeddedReceipt(plan, 'Source preparation candidate', 'SourcePreparationCandidateV1');
  return { docks, publicReceipt, preflight, sourceCi, candidate };
}

export function verifyEmbedded(options, injected) {
  const deps = evidenceDependencies(injected);
  const planPath = injected === undefined ? canonicalPath(options.get('plan'), '--plan') : path.resolve(REPO, options.get('plan'));
  if (path.relative(REPO, planPath) !== PLAN_PATH) fail('--plan must be the fixed active Session Relay plan');
  const planBytes = deps.readFile(planPath);
  const plan = planBytes.toString('utf8');
  const evidence = embeddedEvidence(plan);
  const source = noteValue(plan, 'TAG_COMMIT / SOURCE_COMMIT');
  commit(source, 'embedded SOURCE_COMMIT');
  validateTddRedReceipt(evidence.docks.value, { repositoryId: REPOSITORY_ID });
  validateTddRedReceipt(evidence.publicReceipt.value, { repositoryId: PUBLIC_REPOSITORY_ID });
  if (canonicalize(evidence.docks.value.producer) !== canonicalize(evidence.publicReceipt.value.producer)) fail('embedded TDD-red producer identities differ');
  validateProducerPreflightReceipt(evidence.preflight.value, { sourceCommit: source });
  validateSourceCiReceipt(evidence.sourceCi.value, { sourceCommit: source });
  validateSourcePreparationCandidate(evidence.candidate.value, { sourceCommit: source });
  const companion = verifyPublicBinding(deps, plan, evidence.publicReceipt);
  if (canonicalize(companion) !== canonicalize(evidence.candidate.value.companion)) fail('embedded candidate companion binding mismatch');
  requireSourceTree(deps, source);
  const executionBase = parseExecutionBase(plan);
  if (evidence.candidate.value.execution_base_commit !== executionBase) fail('embedded candidate execution base mismatch');
  ancestor(deps, executionBase, source, 'execution-base-to-source');
  const expectedDocksRed = {
    sha256: evidence.docks.digest,
    pre_production_commit: evidence.docks.value.pre_production_commit,
    test_blobs: evidence.docks.value.test_paths,
  };
  const expectedSummaries = receiptSummary(evidence.preflight, evidence.sourceCi);
  if (canonicalize(evidence.candidate.value.docks_red) !== canonicalize(expectedDocksRed)
    || evidence.candidate.value.companion.red_receipt_sha256 !== evidence.publicReceipt.digest
    || canonicalize(evidence.candidate.value.preflight) !== canonicalize(expectedSummaries.preflight)
    || canonicalize(evidence.candidate.value.source_ci) !== canonicalize(expectedSummaries.source_ci)) {
    fail('embedded candidate copied receipt summary mismatch');
  }
  if (evidence.candidate.value.plan.source_blob_sha256 !== sha256(gitBytes(deps, ['show', `${source}:${PLAN_PATH}`]))) fail('embedded candidate source plan blob mismatch');
  verifyRedBlobs(deps, evidence.docks.value, source, 'Docks');
  if (evidence.preflight.value.workflow.file_blob_id !== gitValue(deps, ['rev-parse', `${source}:${BUILD_WORKFLOW}`]) || evidence.sourceCi.value.workflow.file_blob_id !== gitValue(deps, ['rev-parse', `${source}:${SOURCE_CI_WORKFLOW}`])) fail('embedded producer workflow blob mismatch');
  const checks = runAcceptanceChecks(deps, plan, source, executionBase);
  if (canonicalize(checkExecutionIdentity(checks)) !== canonicalize(checkExecutionIdentity(evidence.candidate.value.checks))) fail('fresh acceptance command/outcome evidence disagrees with candidate');
  return { receipt: evidence.candidate.value, state: { source_commit: source, evidence_commit: gitValue(deps, ['rev-parse', 'HEAD^{commit}']), candidate_sha256: evidence.candidate.digest } };
}

function completionRecord(plan) {
  const matches = [...plan.matchAll(/^Completion-review-receipt: (\{.*\})$/gm)];
  if (matches.length !== 1) fail('finished plan must contain exactly one completion review receipt');
  const bytes = Buffer.from(matches[0][1]);
  let value;
  try { value = JSON.parse(bytes); } catch { fail('completion review receipt is not JSON'); }
  if (canonicalize(value) !== matches[0][1]) fail('completion review receipt is not canonical JCS');
  return { value, bytes, digest: sha256(bytes) };

}
function requireExactChangedPaths(output, expected, label) {
  const actual = output === '' ? [] : output.split('\n');
  if (new Set(actual).size !== actual.length
    || canonicalize([...actual].sort()) !== canonicalize([...expected].sort())) {
    fail(`${label} does not contain exactly the allowed plan lifecycle paths`);
  }
}


function frontmatterValue(plan, key) {
  const matches = [...plan.matchAll(new RegExp(`^${key}:\\s*(.+?)\\s*$`, 'gm'))];
  if (matches.length !== 1) fail(`finished plan must contain one ${key}`);
  return matches[0][1].replace(/^"|"$/g, '');
}

export function bindCompletion(options, injected) {
  digest(options.get('embedded-candidate-sha256'), '--embedded-candidate-sha256');
  const deps = evidenceDependencies(injected);
  const finishedPlanPath = canonicalPath(options.get('finished-plan'), '--finished-plan');
  const finishedRelative = path.relative(deps.repoRoot, finishedPlanPath);
  if (!FINISHED_PLAN.test(finishedRelative)) fail('--finished-plan must be the dated finished Session Relay plan');
  const planBytes = deps.readFile(finishedPlanPath);
  const plan = planBytes.toString('utf8');
  if (frontmatterValue(plan, 'status') !== 'finished' || frontmatterValue(plan, 'review_status') !== 'passed') fail('finished plan has not passed completion review');
  const candidate = embeddedReceipt(plan, 'Source preparation candidate', 'SourcePreparationCandidateV1');
  if (candidate.digest !== options.get('embedded-candidate-sha256')) fail('embedded candidate digest mismatch');
  validateSourcePreparationCandidate(candidate.value, { sourceCommit: candidate.value.source_commit });
  const completion = completionRecord(plan);
  const evidenceCommit = commit(completion.value.reviewed_head, 'completion reviewed_head');
  validateCompletionReceiptClosed(completion.value, { reviewedHead: evidenceCommit }, parsePlan(planBytes).frontmatter.review_waivers ?? []);
  const evidencePlan = gitBytes(deps, ['show', `${evidenceCommit}:${PLAN_PATH}`]);
  if (completion.value.plan_input_sha256 !== sha256(canonicalPlanView(evidencePlan))) fail('completion receipt does not bind the reviewed evidence plan');
  const evidenceCandidate = embeddedReceipt(evidencePlan.toString('utf8'), 'Source preparation candidate', 'SourcePreparationCandidateV1');
  if (evidenceCandidate.digest !== candidate.digest) fail('candidate was not present at the reviewed evidence commit');
  const sourceCommit = candidate.value.source_commit;
  const currentHead = commit(gitValue(deps, ['rev-parse', 'HEAD^{commit}']), 'current release HEAD');
  const shippedCommit = commit(gitValue(deps, ['log', '-n1', '--format=%H', '--', finishedRelative]), 'finished plan archive commit');
  const status = gitValue(deps, ['status', '--porcelain=v1', '--untracked-files=all']);
  if (status !== '') fail('completion binding requires a clean shipped working tree/archive');
  const shippedPlan = gitBytes(deps, ['show', `${shippedCommit}:${finishedRelative}`]);
  if (!shippedPlan.equals(planBytes)) fail('finished plan bytes are not the plan blob at shipped_commit');
  requireExactChangedPaths(
    gitValue(deps, ['diff', '--name-only', sourceCommit, evidenceCommit, '--no-renames', '--', '.']),
    [PLAN_PATH],
    'source-to-evidence diff',
  );
  requireExactChangedPaths(
    gitValue(deps, ['diff', '--name-only', evidenceCommit, shippedCommit, '--no-renames', '--', '.']),
    [PLAN_PATH, finishedRelative],
    'evidence-to-shipped diff',
  );
  ancestor(deps, sourceCommit, evidenceCommit, 'source-to-evidence');
  ancestor(deps, evidenceCommit, shippedCommit, 'evidence-to-shipped');
  ancestor(deps, shippedCommit, currentHead, 'shipped-to-current');
  const nonPlan = gitValue(deps, ['diff', '--name-only', sourceCommit, shippedCommit, '--no-renames', '--', '.', `:(exclude)${PLAN_PATH}`, `:(exclude)${finishedRelative}`]);
  if (nonPlan !== '') fail('source and shipped commits differ outside the plan lifecycle paths');
  const sourcePlan = gitBytes(deps, ['show', `${sourceCommit}:${PLAN_PATH}`]);
  // Candidates sealed before the raw-byte binder repair recorded the hash of
  // the trimmed `git show` adapter output; accept exactly that legacy form or
  // the raw blob hash, and nothing else.
  const legacyTrimmedSha256 = sha256(Buffer.from(sourcePlan.toString('utf8').trim(), 'utf8'));
  if (sha256(sourcePlan) !== candidate.value.plan.source_blob_sha256
    && legacyTrimmedSha256 !== candidate.value.plan.source_blob_sha256) fail('source plan blob no longer matches candidate');
  const receipt = {
    schema: 1, type: 'SourcePreparationProofV1', repository_id: REPOSITORY_ID, version: VERSION,
    source_commit: sourceCommit, tag_commit: sourceCommit, evidence_commit: evidenceCommit,
    shipped_commit: shippedCommit, promoted_commit: shippedCommit, candidate: candidate.value, candidate_sha256: candidate.digest,
    plans: {
      source_path: PLAN_PATH, source_sha256: sha256(sourcePlan), evidence_path: PLAN_PATH,
      evidence_sha256: sha256(evidencePlan), finished_path: finishedRelative, finished_sha256: sha256(planBytes),
    },
    completion_review_sha256: completion.digest,
    source_ancestry: { source_commit: sourceCommit, evidence_commit: evidenceCommit, shipped_commit: shippedCommit, verified: true },
    non_plan_tree_equivalence: { source_commit: sourceCommit, shipped_commit: shippedCommit, excluded_paths: [PLAN_PATH, finishedRelative], verified: true },
    public_repository_id: candidate.value.companion.repository_id,
    public_reviewed_commit: candidate.value.companion.commit,
    review_status: 'passed', bound_at: deps.now(),
  };
  validateSourcePreparationProof(receipt);
  return emitReceipt(options, receipt);
}

export function validateProof(options) {
  const proof = readCanonical(options.get('source-proof'), options.get('source-proof-sha256'), 'SourcePreparationProofV1', '--source-proof');
  validateSourcePreparationProof(proof.value);
  return proof;
}
