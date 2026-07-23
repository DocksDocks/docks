import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  ASSETS,
  canonicalize,
  command,
  emitReceipt,
  exactKeys,
  fail,
  ghJson,
  PRERELEASE_BODY,
  REPO,
  REPOSITORY_ID,
  readCanonical,
  SHA256,
  STABLE_BODY,
  sha256,
  TAG,
  VERSION,
} from './session-relay-release-core.mjs';
import { validateProof } from './session-relay-release-preparation.mjs';

const WORKFLOW_PATH = '.github/workflows/build-binaries.yml';
const POLL_ATTEMPTS = 12;
const POLL_DELAY_MS = 5_000;
const ADAPTER_KEYS = [
  'cleanupRunAssets',
  'createPrerelease',
  'dispatchRecovery',
  'downloadRunAssets',
  'downloadReleaseAssets',
  'editStable',
  'getRelease',
  'getRun',
  'getTagCommit',
  'getPublisherIdentity',
  'listRuns',
  'now',
  'pushTag',
  'sleep',
  'uploadReleaseAsset',
  'watchRun',
];
const WORKFLOW_KEYS = [
  'file',
  'workflow_sha',
  'run_id',
  'attempt',
  'head_sha',
  'path',
  'event',
  'inputs',
  'conclusion',
];
const PUBLICATION_KEYS = [
  'schema',
  'type',
  'repository_id',
  'version',
  'source_proof_sha256',
  'tag',
  'tag_commit',
  'workflow',
  'release_database_id',
  'release_state',
  'body_sha256',
  'assets',
  'transition',
  'created_at',
];
const TRANSITIONS = new Set([
  'already_stable',
  'assets_reconciled',
  'finalized',
  'reconciled',
  'release_created',
  'tag_and_assets_reconciled',
  'tag_and_reconciled',
  'tag_and_release_created',
]);
const ASSET_KEYS = ['database_id', 'name', 'size', 'digest'];
const ATTESTATION_KEYS = [
  'asset_name',
  'inputs',
  'runner_arch',
  'runner_os',
  'schema',
  'sha256',
  'source_commit',
  'target',
  'version_stdout',
  'workflow_run_attempt',
  'workflow_run_id',
];
const INPUT_KEYS = ['expected_commit', 'expected_tag', 'mode'];
const TARGET_RUNNERS = {
  'aarch64-apple-darwin': { runner_arch: 'ARM64', runner_os: 'macOS' },
  'aarch64-unknown-linux-musl': { runner_arch: 'ARM64', runner_os: 'Linux' },
  'x86_64-apple-darwin': { runner_arch: 'X64', runner_os: 'macOS' },
  'x86_64-unknown-linux-musl': { runner_arch: 'X64', runner_os: 'Linux' },
};

function remoteTagCommit() {
  const result = spawnSync('git', ['ls-remote', '--tags', 'origin', `refs/tags/${TAG}`, `refs/tags/${TAG}^{}`], {
    cwd: REPO,
    encoding: 'utf8',
    shell: false,
  });
  if (result.error || result.signal || result.status !== 0) fail('could not query authoritative tag state', 'failure');
  const refs = result.stdout
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => line.split(/\s+/));
  return refs.find(([, ref]) => ref.endsWith('^{}'))?.[0] ?? refs[0]?.[0] ?? null;
}

function walkFiles(directory, found = []) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) walkFiles(entryPath, found);
    else if (entry.isFile()) found.push(entryPath);
  }
  return found;
}

function validateChecksumManifest(assets) {
  const checksum = assets.find(({ name }) => name === 'SHA256SUMS');
  const binaries = assets.filter(({ name }) => name !== 'SHA256SUMS');
  const lines = fs.readFileSync(checksum.path, 'utf8').split('\n').filter(Boolean);
  if (lines.length !== binaries.length) fail('same-run SHA256SUMS has an invalid closed asset set');
  const entries = new Map();
  for (const line of lines) {
    const match = line.match(/^([0-9a-f]{64}) {2}([A-Za-z0-9._-]+)$/);
    if (!match || entries.has(match[2])) fail('same-run SHA256SUMS is malformed or duplicated');
    entries.set(match[2], match[1]);
  }
  for (const asset of binaries) {
    if (entries.get(asset.name) !== asset.digest) fail(`same-run SHA256SUMS digest conflict for ${asset.name}`);
  }
  return [...entries]
    .map(([name, digest]) => ({ name, digest }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

function downloadRunAssets(runId) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'session-relay-publication-'));
  try {
    command('gh', ['run', 'download', String(runId), '--dir', directory]);
    const candidates = walkFiles(directory);
    const assets = [...ASSETS].sort().map((name) => {
      const matches = candidates.filter((candidate) => path.basename(candidate) === name);
      if (matches.length !== 1) fail(`bound workflow run must contain exactly one ${name}`);
      const bytes = fs.readFileSync(matches[0]);
      return { name, size: bytes.length, digest: sha256(bytes), path: matches[0] };
    });
    const checksumEntries = validateChecksumManifest(assets);
    const attestations = Object.keys(TARGET_RUNNERS)
      .sort()
      .map((target) => {
        const name = `attestation-${target}.json`;
        const matches = candidates.filter((candidate) => path.basename(candidate) === name);
        if (matches.length !== 1) fail(`bound workflow run must contain exactly one ${name}`);
        const raw = fs.readFileSync(matches[0], 'utf8');
        let value;
        try {
          value = JSON.parse(raw);
        } catch {
          fail(`${name} is not JSON`);
        }
        if (raw !== JSON.stringify(value)) fail(`${name} is not canonical JSON`);
        return value;
      });
    return { directory, assets, attestations, checksumEntries };
  } catch (error) {
    fs.rmSync(directory, { recursive: true, force: true });
    throw error;
  }
}
function downloadReleaseAssets(releaseId, releaseAssets) {
  if (!Number.isInteger(releaseId) || releaseId <= 0 || !Array.isArray(releaseAssets))
    fail('live release download identity is invalid');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), `session-relay-live-release-${releaseId}-`));
  try {
    const assets = [...releaseAssets]
      .sort((left, right) => left.name.localeCompare(right.name))
      .map((asset) => {
        if (!Number.isInteger(asset.id) || asset.id <= 0 || !ASSETS.includes(asset.name))
          fail('live release asset database identity is invalid');
        const endpoint = `/repos/${REPOSITORY_ID}/releases/assets/${asset.id}`;
        const result = spawnSync('gh', ['api', '-H', 'Accept: application/octet-stream', endpoint], {
          cwd: REPO,
          shell: false,
          env: process.env,
          maxBuffer: Infinity,
        });
        if (result.error || result.signal || result.status !== 0) {
          const detail =
            result.stderr?.toString().trim() || result.error?.message || result.signal || `exit ${result.status}`;
          fail(`could not download live release asset ${asset.id}: ${detail}`, 'failure');
        }
        const bytes = Buffer.from(result.stdout);
        const assetPath = path.join(directory, asset.name);
        fs.writeFileSync(assetPath, bytes, { flag: 'wx', mode: 0o600 });
        return { name: asset.name, size: bytes.length, digest: sha256(bytes), path: assetPath };
      });
    const checksumEntries = validateChecksumManifest(assets);
    return { directory, assets, checksumEntries };
  } catch (error) {
    fs.rmSync(directory, { recursive: true, force: true });
    throw error;
  }
}

function queryRelease() {
  const endpoint = `/repos/${REPOSITORY_ID}/releases/tags/${encodeURIComponent(TAG)}`;
  const result = spawnSync('gh', ['api', endpoint], {
    cwd: REPO,
    encoding: 'utf8',
    shell: false,
    env: process.env,
    maxBuffer: Infinity,
  });
  if (!result.error && !result.signal && result.status === 0) {
    try {
      return JSON.parse(result.stdout);
    } catch {
      fail('authoritative release query returned invalid JSON', 'failure');
    }
  }
  if (result.status !== 0 && /HTTP 404|status code 404/i.test(result.stderr ?? '')) return null;
  const detail = result.stderr?.trim() || result.error?.message || result.signal || `exit ${result.status}`;
  fail(`could not query authoritative release state: ${detail}`, 'failure');
}

export const productionAdapter = Object.freeze({
  getTagCommit: remoteTagCommit,
  pushTag(commit) {
    command('git', ['push', 'origin', `${commit}:refs/tags/${TAG}`], { inherit: true });
  },
  getRelease: queryRelease,
  listRuns() {
    const endpoint = `/repos/${REPOSITORY_ID}/actions/workflows/${encodeURIComponent('build-binaries.yml')}/runs?branch=${encodeURIComponent(TAG)}&per_page=100`;
    const result = ghJson(endpoint);
    if (!Array.isArray(result.workflow_runs) || result.total_count !== result.workflow_runs.length) {
      fail('workflow run discovery is incomplete or invalid', 'failure');
    }
    return result.workflow_runs;
  },
  dispatchRecovery(commit) {
    command('gh', [
      'workflow',
      'run',
      'build-binaries.yml',
      '--ref',
      TAG,
      '-f',
      'mode=publish-existing-tag',
      '-f',
      `expected_commit=${commit}`,
      '-f',
      `expected_tag=${TAG}`,
    ]);
  },
  watchRun(id) {
    command('gh', ['run', 'watch', String(id)], { inherit: true });
  },
  getRun(id) {
    return ghJson(`/repos/${REPOSITORY_ID}/actions/runs/${encodeURIComponent(id)}`);
  },
  getPublisherIdentity() {
    return ghJson(`/users/${encodeURIComponent('github-actions[bot]')}`);
  },
  downloadRunAssets,
  downloadReleaseAssets,
  createPrerelease(bundle) {
    command('gh', [
      'release',
      'create',
      TAG,
      ...bundle.assets.map(({ path: assetPath }) => assetPath),
      '--verify-tag',
      '--prerelease',
      '--title',
      `Session Relay ${VERSION}`,
      '--notes',
      PRERELEASE_BODY,
    ]);
  },
  uploadReleaseAsset(asset) {
    command('gh', ['release', 'upload', TAG, asset.path]);
  },
  editStable() {
    command('gh', ['release', 'edit', TAG, '--prerelease=false', '--notes', STABLE_BODY]);
  },
  sleep(milliseconds) {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
  },
  now() {
    return new Date().toISOString();
  },
  cleanupRunAssets(bundle) {
    fs.rmSync(bundle.directory, { recursive: true, force: true });
  },
});

function checkedAdapter(adapter) {
  const selected = adapter ?? productionAdapter;
  exactKeys(selected, ADAPTER_KEYS, 'publication dependency adapter');
  for (const key of ADAPTER_KEYS) {
    if (typeof selected[key] !== 'function') fail(`publication dependency adapter ${key} must be a function`);
  }
  return selected;
}

export function releaseState(adapter = productionAdapter) {
  const selected = checkedAdapter(adapter);
  return { commit: selected.getTagCommit(), release: selected.getRelease() };
}

export function normalizedAssets(release) {
  return (release.assets ?? [])
    .map((asset) => ({
      name: asset.name,
      database_id: asset.id,
      size: asset.size,
      digest: typeof asset.digest === 'string' ? asset.digest.replace(/^sha256:/, '') : null,
    }))
    .sort((left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0));
}

function assertAssetRecord(asset, label) {
  exactKeys(asset, ASSET_KEYS, label);
  if (!Number.isInteger(asset.database_id) || asset.database_id <= 0) fail(`${label} database identity is invalid`);
  if (!ASSETS.includes(asset.name)) fail(`${label} name is invalid`);
  if (!Number.isInteger(asset.size) || asset.size < 0) fail(`${label} size is invalid`);
  if (!SHA256.test(asset.digest ?? '')) fail(`${label} digest is missing or invalid`);
}

export function assertCompleteAssets(assets) {
  const expected = [...ASSETS].sort();
  if (assets.length !== expected.length || assets.some((asset, index) => asset.name !== expected[index])) {
    fail('release asset set is absent, partial, duplicated, or conflicting');
  }
  assets.forEach((asset, index) => {
    assertAssetRecord(asset, `release asset ${index}`);
  });
}

function assertRunAssetSet(assets) {
  const expected = [...ASSETS].sort();
  if (!Array.isArray(assets) || assets.length !== expected.length) fail('bound workflow run asset set is incomplete');
  const sorted = [...assets].sort((left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0));
  for (let index = 0; index < sorted.length; index += 1) {
    const asset = sorted[index];
    if (
      asset.name !== expected[index] ||
      !Number.isInteger(asset.size) ||
      asset.size < 0 ||
      !SHA256.test(asset.digest ?? '') ||
      typeof asset.path !== 'string'
    ) {
      fail('bound workflow run asset set conflict: identity is invalid');
    }
  }
  return sorted;
}
function expectedRunInputs(event, commit) {
  return event === 'push'
    ? { expected_commit: '', expected_tag: '', mode: '' }
    : { expected_commit: commit, expected_tag: TAG, mode: 'publish-existing-tag' };
}

function validateRunBundle(bundle, run, commit) {
  const assets = assertRunAssetSet(bundle.assets);
  if (!Array.isArray(bundle.attestations) || bundle.attestations.length !== Object.keys(TARGET_RUNNERS).length) {
    fail('bound workflow run attestation set is incomplete');
  }
  const expectedInputs = expectedRunInputs(run.event, commit);
  const assetsByName = new Map(assets.map((asset) => [asset.name, asset]));
  const seen = new Set();
  for (const attestation of bundle.attestations) {
    exactKeys(attestation, ATTESTATION_KEYS, 'binary attestation');
    exactKeys(attestation.inputs, INPUT_KEYS, 'binary attestation inputs');
    const runner = TARGET_RUNNERS[attestation.target];
    const asset = assetsByName.get(attestation.asset_name);
    if (
      !runner ||
      seen.has(attestation.target) ||
      !asset ||
      attestation.asset_name !== `session-relay-${attestation.target}` ||
      canonicalize(attestation.inputs) !== canonicalize(expectedInputs) ||
      attestation.runner_arch !== runner.runner_arch ||
      attestation.runner_os !== runner.runner_os ||
      attestation.schema !== 'SessionRelayBinaryAttestationV1' ||
      attestation.sha256 !== asset.digest ||
      attestation.source_commit !== commit ||
      attestation.version_stdout !== `session-relay ${VERSION}` ||
      attestation.workflow_run_attempt !== run.run_attempt ||
      attestation.workflow_run_id !== run.id
    )
      fail('binary attestation input or workflow identity conflict');
    seen.add(attestation.target);
  }
  return assets;
}

function runIdentityConflict(run, commit) {
  return (
    !run || run.head_sha !== commit || run.path !== WORKFLOW_PATH || !['push', 'workflow_dispatch'].includes(run.event)
  );
}

function taggedRuns(adapter) {
  const runs = adapter.listRuns();
  if (!Array.isArray(runs)) fail('workflow run discovery returned an invalid result', 'failure');
  return runs;
}

function selectUniqueRun(runs, commit, { event, excluded = new Set() } = {}) {
  const candidates = runs.filter((candidate) => !excluded.has(candidate.id));
  if (candidates.some((candidate) => runIdentityConflict(candidate, commit))) fail('workflow run identity conflict');
  if (event !== undefined && candidates.some((candidate) => candidate.event !== event))
    fail('workflow run event identity conflict');
  if (candidates.length > 1) fail('multiple duplicate publication workflow runs conflict');
  return candidates[0] ?? null;
}
function selectUniqueUsableRun(runs, commit, ignored = new Set()) {
  if (runs.some((candidate) => runIdentityConflict(candidate, commit))) fail('workflow run identity conflict');
  const usable = runs.filter(
    (candidate) =>
      !ignored.has(candidate.id) && (candidate.status !== 'completed' || candidate.conclusion === 'success'),
  );
  if (usable.length > 1) fail('multiple duplicate usable publication workflow runs conflict');
  return usable[0] ?? null;
}

function pollUniqueRun(adapter, commit, { event, excluded = new Set(), label }) {
  for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt += 1) {
    const selected = selectUniqueRun(taggedRuns(adapter), commit, { event, excluded });
    if (selected) return selected;
    if (attempt + 1 < POLL_ATTEMPTS) adapter.sleep(POLL_DELAY_MS);
  }
  fail(`bounded polling found no unique ${label} workflow run`, 'failure');
}
function pollReleaseState(adapter, commit) {
  for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt += 1) {
    const state = releaseState(adapter);
    if (state.commit !== commit) fail('tag identity changed during publication');
    if (state.release) return state;
    if (attempt + 1 < POLL_ATTEMPTS) adapter.sleep(POLL_DELAY_MS);
  }
  return { commit, release: null };
}

function settledRun(adapter, discovered, commit) {
  let run = adapter.getRun(discovered.id);
  if (runIdentityConflict(run, commit) || run.id !== discovered.id) fail('workflow run identity conflict');
  if (run.status !== 'completed') {
    adapter.watchRun(run.id);
    run = adapter.getRun(run.id);
  }
  if (runIdentityConflict(run, commit) || run.id !== discovered.id || run.status !== 'completed') {
    fail('bound publication workflow run did not reach a terminal state', 'failure');
  }
  if (!Number.isInteger(run.run_attempt) || run.run_attempt <= 0) fail('workflow run attempt identity is invalid');
  return run;
}

function workflowIdentity(run) {
  return {
    file: WORKFLOW_PATH,
    workflow_sha: run.head_sha,
    run_id: run.id,
    attempt: run.run_attempt,
    head_sha: run.head_sha,
    path: run.path,
    event: run.event,
    inputs: expectedRunInputs(run.event, run.head_sha),
    conclusion: run.conclusion,
  };
}

function validateWorkflowIdentity(value, commit, label) {
  exactKeys(value, WORKFLOW_KEYS, label);
  exactKeys(value.inputs, INPUT_KEYS, `${label} inputs`);
  if (
    value.file !== WORKFLOW_PATH ||
    value.workflow_sha !== commit ||
    value.head_sha !== commit ||
    value.path !== WORKFLOW_PATH ||
    !Number.isInteger(value.run_id) ||
    value.run_id <= 0 ||
    !Number.isInteger(value.attempt) ||
    value.attempt <= 0 ||
    !['push', 'workflow_dispatch'].includes(value.event) ||
    canonicalize(value.inputs) !== canonicalize(expectedRunInputs(value.event, commit)) ||
    value.conclusion !== 'success'
  )
    fail(`${label} identity conflict`);
}

export function validatePublicationReceipt(receipt, proof, label) {
  exactKeys(receipt.value, PUBLICATION_KEYS, label);
  if (
    receipt.value.repository_id !== REPOSITORY_ID ||
    receipt.value.version !== VERSION ||
    receipt.value.source_proof_sha256 !== proof.digest ||
    receipt.value.tag !== TAG ||
    receipt.value.tag_commit !== proof.value.tag_commit ||
    !['prerelease', 'stable'].includes(receipt.value.release_state) ||
    receipt.value.body_sha256 !==
      sha256(Buffer.from(receipt.value.release_state === 'prerelease' ? PRERELEASE_BODY : STABLE_BODY)) ||
    !Number.isInteger(receipt.value.release_database_id) ||
    receipt.value.release_database_id <= 0 ||
    !TRANSITIONS.has(receipt.value.transition) ||
    typeof receipt.value.created_at !== 'string' ||
    Number.isNaN(Date.parse(receipt.value.created_at))
  )
    fail(`${label} immutable identity conflict`);
  validateWorkflowIdentity(receipt.value.workflow, proof.value.tag_commit, `${label} workflow`);
  if (!Array.isArray(receipt.value.assets)) fail(`${label} assets must be an array`);
  assertCompleteAssets(receipt.value.assets);
  return receipt;
}

function assertReleaseShell(release, expectedState) {
  if (
    !release ||
    release.tag_name !== TAG ||
    release.draft !== false ||
    !Number.isInteger(release.id) ||
    release.id <= 0 ||
    release.prerelease !== (expectedState === 'prerelease')
  )
    fail('release identity conflict');
}

function expectedByName(runAssets) {
  return new Map(runAssets.map((asset) => [asset.name, asset]));
}

function assertExistingAssetSubset(release, runAssets) {
  const expected = expectedByName(runAssets);
  const seen = new Set();
  for (const asset of normalizedAssets(release)) {
    if (seen.has(asset.name)) fail('release asset set is duplicated or conflicting');
    seen.add(asset.name);
    const bound = expected.get(asset.name);
    if (!bound) fail('release asset name conflict');
    if (asset.size !== bound.size) fail(`release asset size conflict for ${asset.name}`);
    if (asset.digest !== bound.digest) fail(`release asset digest conflict for ${asset.name}`);
    if (!Number.isInteger(asset.database_id) || asset.database_id <= 0)
      fail(`release asset database identity conflict for ${asset.name}`);
  }
  return seen;
}

function assertExactReleaseAssets(release, runAssets) {
  const existing = normalizedAssets(release);
  assertCompleteAssets(existing);
  assertExistingAssetSubset(release, runAssets);
  return existing;
}

function reconcilePrerelease(adapter, release, bundle) {
  const runAssets = assertRunAssetSet(bundle.assets);
  let transition = 'reconciled';
  if (release) {
    assertReleaseShell(release, 'prerelease');
    if (release.body !== PRERELEASE_BODY) fail('prerelease body conflict');
    const existingNames = assertExistingAssetSubset(release, runAssets);
    const missing = runAssets.filter(({ name }) => !existingNames.has(name));
    for (const asset of missing) adapter.uploadReleaseAsset(asset);
    if (missing.length > 0) transition = 'assets_reconciled';
  } else {
    adapter.createPrerelease({ ...bundle, assets: runAssets });
    transition = 'release_created';
  }
  const reconciled = adapter.getRelease();
  assertReleaseShell(reconciled, 'prerelease');
  if (reconciled.body !== PRERELEASE_BODY) fail('prerelease identity or staging body conflict');
  const assets = assertExactReleaseAssets(reconciled, runAssets);
  return { release: reconciled, assets, transition };
}

function publicationReceipt(proof, release, assets, workflow, transition, releaseStateName, now) {
  return {
    schema: 1,
    type: 'SessionRelayPublicationReceiptV1',
    repository_id: REPOSITORY_ID,
    version: VERSION,
    source_proof_sha256: proof.digest,
    tag: TAG,
    tag_commit: proof.value.tag_commit,
    workflow,
    release_database_id: release.id,
    release_state: releaseStateName,
    body_sha256: sha256(Buffer.from(release.body ?? '')),
    assets,
    transition,
    created_at: now,
  };
}
function receiptBoundRun(runs, receipt, commit, label) {
  if (runs.some((candidate) => runIdentityConflict(candidate, commit))) fail(`${label} workflow run identity conflict`);
  const selected = runs.filter(({ id }) => id === receipt.value.workflow.run_id);
  if (selected.length !== 1) fail(`${label} workflow run identity conflict`);
  const competing = runs.filter(({ id }) => id !== receipt.value.workflow.run_id);
  if (competing.some((candidate) => candidate.status !== 'completed' || candidate.conclusion === 'success')) {
    fail(`${label} has a conflicting successful workflow run`);
  }
  return selected[0];
}

function exactResumedPrerelease(release, resume) {
  assertReleaseShell(release, 'prerelease');
  if (
    release.id !== resume.value.release_database_id ||
    release.body !== PRERELEASE_BODY ||
    sha256(Buffer.from(release.body)) !== resume.value.body_sha256
  )
    fail('resume publication release identity conflict');
  const expected = new Map(resume.value.assets.map((asset) => [asset.name, asset]));
  const live = normalizedAssets(release);
  const seen = new Set();
  for (const asset of live) {
    if (seen.has(asset.name)) fail('resume publication release asset duplicate conflict');
    seen.add(asset.name);
    const bound = expected.get(asset.name);
    if (!bound || canonicalize(bound) !== canonicalize(asset))
      fail('resume publication release asset identity conflict');
  }
  if (live.length !== resume.value.assets.length) fail('resume publication release asset set conflict');
  return live;
}

function discoverPublicationRun(adapter, commit, { tagCreated, release, resume }) {
  if (resume) {
    return {
      candidate: receiptBoundRun(taggedRuns(adapter), resume, commit, 'resume publication'),
      recoveryDispatched: false,
    };
  }
  if (tagCreated) {
    return {
      candidate: pollUniqueRun(adapter, commit, { event: 'push', label: 'tag-push' }),
      recoveryDispatched: false,
    };
  }
  const before = taggedRuns(adapter);
  const existing = selectUniqueUsableRun(before, commit);
  if (existing) return { candidate: existing, recoveryDispatched: false };
  if (release && before.length === 0) fail('release exists without a bound publication workflow run');
  const snapshot = new Set(before.map(({ id }) => id));
  adapter.dispatchRecovery(commit);
  return {
    candidate: pollUniqueRun(adapter, commit, { event: 'workflow_dispatch', excluded: snapshot, label: 'recovery' }),
    recoveryDispatched: true,
  };
}

function dispatchRecoveryRun(adapter, commit, priorRun) {
  const before = taggedRuns(adapter);
  if (!before.some(({ id }) => id === priorRun.id)) fail('prior publication workflow run identity changed');
  if (selectUniqueUsableRun(before, commit, new Set([priorRun.id]))) {
    fail('conflicting usable publication workflow run exists');
  }
  const snapshot = new Set(before.map(({ id }) => id));
  adapter.dispatchRecovery(commit);
  const discovered = pollUniqueRun(adapter, commit, {
    event: 'workflow_dispatch',
    excluded: snapshot,
    label: 'recovery',
  });
  const recovery = settledRun(adapter, discovered, commit);
  if (recovery.conclusion !== 'success') fail('publish-existing-tag recovery workflow failed', 'failure');
  return recovery;
}

function successfulRunOrRecovery(adapter, discovered, commit, resume, recoveryDispatched) {
  const run = settledRun(adapter, discovered, commit);
  if (run.conclusion === 'success') return run;
  if (resume || recoveryDispatched) fail('bound publication workflow run did not complete successfully', 'failure');
  return dispatchRecoveryRun(adapter, commit, run);
}

function downloadBoundBundle(adapter, run) {
  return { run, bundle: adapter.downloadRunAssets(run.id) };
}

function completeLivePrerelease(release) {
  if (!release) return null;
  assertReleaseShell(release, 'prerelease');
  if (release.body !== PRERELEASE_BODY) fail('prerelease body conflict');
  const assets = normalizedAssets(release);
  const expected = [...ASSETS].sort();
  if (assets.length !== expected.length || assets.some((asset, index) => asset.name !== expected[index])) return null;
  assertCompleteAssets(assets);
  return assets;
}
function timestampInRunWindow(value, start, end, label) {
  const instant = Date.parse(value);
  if (!Number.isFinite(instant) || instant < start || instant > end)
    fail(`${label} timestamp is outside the bound workflow run window`);
  return instant;
}
function actorIdentity(actor) {
  return { id: actor?.id, login: actor?.login, type: actor?.type };
}
function sameActor(left, right) {
  return left?.id === right?.id && left?.login === right?.login && left?.type === right?.type;
}

function releaseProvenanceProjection(release) {
  return {
    id: release?.id,
    tag_name: release?.tag_name,
    prerelease: release?.prerelease,
    draft: release?.draft,
    body: release?.body,
    created_at: release?.created_at,
    published_at: release?.published_at,
    author: actorIdentity(release?.author),
    assets: [...(release?.assets ?? [])]
      .map((asset) => ({
        id: asset.id,
        name: asset.name,
        size: asset.size,
        digest: asset.digest,
        created_at: asset.created_at,
        updated_at: asset.updated_at,
        uploader: actorIdentity(asset.uploader),
      }))
      .sort((left, right) => left.name.localeCompare(right.name)),
  };
}

function assertBoundRunMatchesRelease(boundRunAssets, liveAssets) {
  const liveByName = new Map(liveAssets.map((asset) => [asset.name, asset]));
  if (!Array.isArray(boundRunAssets) || boundRunAssets.length !== liveAssets.length) {
    fail('bound run artifact set conflicts with live release assets');
  }
  for (const asset of boundRunAssets) {
    const live = liveByName.get(asset.name);
    if (!live || live.size !== asset.size || live.digest !== asset.digest) {
      fail(`bound run artifact conflicts with live release asset ${asset.name}`);
    }
  }
}

function validActor(actor) {
  return (
    Number.isInteger(actor?.id) &&
    actor.id > 0 &&
    typeof actor.login === 'string' &&
    actor.login.length > 0 &&
    typeof actor.type === 'string' &&
    actor.type.length > 0
  );
}

function validateLiveReleaseProvenance(adapter, release, run, liveAssets, boundRunAssets = null) {
  const start = Date.parse(run.run_started_at);
  const end = Date.parse(run.updated_at);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start)
    fail('bound workflow run timestamp window is invalid');
  const releaseCreated = Date.parse(release.created_at);
  const releasePublished = Date.parse(release.published_at);
  if (!Number.isFinite(releaseCreated) || !Number.isFinite(releasePublished) || releasePublished < releaseCreated) {
    fail('live release timestamps are invalid');
  }
  const reconciledAfterRun = releasePublished > end;
  let authoritativePublisher;
  if (reconciledAfterRun) {
    if (!boundRunAssets) fail('post-run release reconciliation requires bound run artifact verification');
    if (!validActor(run.actor)) fail('bound workflow run actor identity is invalid');
    authoritativePublisher = run.actor;
  } else {
    timestampInRunWindow(release.created_at, start, end, 'release created_at');
    timestampInRunWindow(release.published_at, start, end, 'release published_at');
    authoritativePublisher = adapter.getPublisherIdentity();
    if (
      authoritativePublisher?.login !== 'github-actions[bot]' ||
      authoritativePublisher?.type !== 'Bot' ||
      !Number.isInteger(authoritativePublisher.id) ||
      authoritativePublisher.id <= 0
    )
      fail('authoritative GitHub Actions publisher identity is invalid');
  }
  if (!sameActor(release.author, authoritativePublisher)) fail('live release publisher identity conflict');
  if (!Array.isArray(release.assets) || release.assets.length !== ASSETS.length)
    fail('live release asset timestamp set is incomplete');
  const assetDatabaseIds = new Set();
  for (const asset of release.assets) {
    if (!Number.isInteger(asset.id) || asset.id <= 0 || assetDatabaseIds.has(asset.id)) {
      fail('live release asset database identity is duplicate or invalid');
    }
    assetDatabaseIds.add(asset.id);
    const created = reconciledAfterRun
      ? Date.parse(asset.created_at)
      : timestampInRunWindow(asset.created_at, start, end, `${asset.name} created_at`);
    const updated = reconciledAfterRun
      ? Date.parse(asset.updated_at)
      : timestampInRunWindow(asset.updated_at, start, end, `${asset.name} updated_at`);
    if (
      !Number.isFinite(created) ||
      !Number.isFinite(updated) ||
      updated < created ||
      (reconciledAfterRun && created < end)
    )
      fail(`${asset.name} asset timestamps are inconsistent`);
    if (!sameActor(asset.uploader, authoritativePublisher)) fail(`${asset.name} publisher identity conflict`);
  }
  if (boundRunAssets) assertBoundRunMatchesRelease(boundRunAssets, liveAssets);
  let bundle;
  try {
    bundle = adapter.downloadReleaseAssets(release.id, release.assets);
    const downloaded = assertRunAssetSet(bundle.assets);
    const liveByName = new Map(liveAssets.map((asset) => [asset.name, asset]));
    for (const asset of downloaded) {
      const authoritative = liveByName.get(asset.name);
      if (!authoritative || authoritative.size !== asset.size || authoritative.digest !== asset.digest) {
        fail(`live release asset digest conflict for ${asset.name}`);
      }
    }
    if (!Array.isArray(bundle.checksumEntries) || bundle.checksumEntries.length !== ASSETS.length - 1) {
      fail('live release checksum manifest is incomplete');
    }
    const binaries = new Map(
      downloaded.filter(({ name }) => name !== 'SHA256SUMS').map((asset) => [asset.name, asset.digest]),
    );
    const seen = new Set();
    for (const entry of bundle.checksumEntries) {
      exactKeys(entry, ['name', 'digest'], 'live release checksum entry');
      if (seen.has(entry.name) || binaries.get(entry.name) !== entry.digest)
        fail('live release checksum digest conflict');
      seen.add(entry.name);
    }
    const reconciled = adapter.getRelease();
    if (
      adapter.getTagCommit() !== run.head_sha ||
      canonicalize(releaseProvenanceProjection(reconciled)) !== canonicalize(releaseProvenanceProjection(release))
    )
      fail('live release identity drifted during provenance verification');
    return liveAssets;
  } finally {
    if (bundle) adapter.cleanupRunAssets(bundle);
  }
}

function rebindCompletePublication(options, adapter, proof, state) {
  if (state.commit !== proof.value.tag_commit || !state.release || state.release.prerelease !== true)
    fail('publication rebind requires a complete matching prerelease');
  const liveAssets = completeLivePrerelease(state.release);
  if (!liveAssets) fail('publication rebind requires a complete matching prerelease');
  const run = selectUniqueUsableRun(taggedRuns(adapter), proof.value.tag_commit);
  if (run?.event !== 'push' || run.status !== 'completed' || run.conclusion !== 'success')
    fail('publication rebind requires one successful bound push workflow run');
  const settled = settledRun(adapter, run, proof.value.tag_commit);
  const requiresBoundArtifacts = Date.parse(state.release.published_at) > Date.parse(settled.updated_at);
  let bundle;
  try {
    bundle = requiresBoundArtifacts ? adapter.downloadRunAssets(settled.id) : null;
    const boundRunAssets = bundle ? validateRunBundle(bundle, settled, proof.value.tag_commit) : null;
    const verifiedLiveAssets = validateLiveReleaseProvenance(
      adapter,
      state.release,
      settled,
      liveAssets,
      boundRunAssets,
    );
    return emitReceipt(
      options,
      publicationReceipt(
        proof,
        state.release,
        verifiedLiveAssets,
        workflowIdentity(settled),
        'reconciled',
        'prerelease',
        adapter.now(),
      ),
    );
  } finally {
    if (bundle) adapter.cleanupRunAssets(bundle);
  }
}

export function publishReviewed(options, injectedAdapter) {
  const adapter = checkedAdapter(injectedAdapter);
  const proof = validateProof(options);
  const rebind = options.has('rebind-complete-publication');
  const resume = options.has('resume-publication')
    ? validatePublicationReceipt(
        readCanonical(
          options.get('resume-publication'),
          options.get('resume-publication-sha256'),
          'SessionRelayPublicationReceiptV1',
          '--resume-publication',
        ),
        proof,
        '--resume-publication',
      )
    : null;
  if (rebind && resume) fail('publication rebind cannot be combined with a captured publication receipt');
  if (resume && resume.value.release_state !== 'prerelease') fail('resume publication is not a prerelease receipt');
  let state = releaseState(adapter);
  if (state.commit && state.commit !== proof.value.tag_commit) fail('tag conflict');
  if (state.release && !state.release.prerelease) fail('premature stable release conflict');
  if (rebind) return rebindCompletePublication(options, adapter, proof, state);
  let tagCreated = false;
  if (!state.commit) {
    adapter.pushTag(proof.value.tag_commit);
    tagCreated = true;
    state = releaseState(adapter);
    if (state.commit !== proof.value.tag_commit) fail('created tag did not reconcile');
  }
  const discovery = discoverPublicationRun(adapter, proof.value.tag_commit, {
    tagCreated,
    release: state.release,
    resume,
  });
  let run = successfulRunOrRecovery(
    adapter,
    discovery.candidate,
    proof.value.tag_commit,
    resume,
    discovery.recoveryDispatched,
  );
  if (resume && canonicalize(workflowIdentity(run)) !== canonicalize(resume.value.workflow)) {
    fail('resume publication workflow identity conflict');
  }
  if (resume) {
    state = releaseState(adapter);
    if (state.commit !== proof.value.tag_commit || !state.release) fail('resume publication release identity conflict');
    const complete = exactResumedPrerelease(state.release, resume);
    if (complete) {
      return emitReceipt(
        options,
        publicationReceipt(
          proof,
          state.release,
          complete,
          resume.value.workflow,
          'reconciled',
          'prerelease',
          adapter.now(),
        ),
      );
    }
  }
  state = pollReleaseState(adapter, proof.value.tag_commit);
  if (state.release && !state.release.prerelease) fail('premature stable release conflict');
  const liveAssets = completeLivePrerelease(state.release);
  if (liveAssets && run.event === 'push' && !tagCreated && !resume) {
    fail('complete matching prerelease without a captured receipt requires explicit --rebind-complete-publication');
  }
  if (liveAssets && run.event === 'push') {
    const verifiedLiveAssets = validateLiveReleaseProvenance(adapter, state.release, run, liveAssets);
    const transition = tagCreated ? 'tag_and_reconciled' : 'reconciled';
    return emitReceipt(
      options,
      publicationReceipt(
        proof,
        state.release,
        verifiedLiveAssets,
        workflowIdentity(run),
        transition,
        'prerelease',
        adapter.now(),
      ),
    );
  }
  let bundle;
  try {
    ({ run, bundle } = downloadBoundBundle(adapter, run));
    const runAssets = validateRunBundle(bundle, run, proof.value.tag_commit);
    state = pollReleaseState(adapter, proof.value.tag_commit);
    if (state.release && !state.release.prerelease) fail('premature stable release conflict');
    const reconciled = reconcilePrerelease(adapter, state.release, { ...bundle, assets: runAssets });
    if (resume) {
      if (
        resume.value.release_database_id !== reconciled.release.id ||
        resume.value.body_sha256 !== sha256(Buffer.from(reconciled.release.body)) ||
        canonicalize(resume.value.assets) !== canonicalize(reconciled.assets)
      )
        fail('resume publication release identity conflict');
    }
    const transition = resume ? 'reconciled' : tagCreated ? `tag_and_${reconciled.transition}` : reconciled.transition;
    return emitReceipt(
      options,
      publicationReceipt(
        proof,
        reconciled.release,
        reconciled.assets,
        workflowIdentity(run),
        transition,
        'prerelease',
        adapter.now(),
      ),
    );
  } finally {
    if (bundle) adapter.cleanupRunAssets(bundle);
  }
}

function verifyPublicationAgainstRun(adapter, publication, proof) {
  const listed = taggedRuns(adapter);
  if (listed.some((candidate) => runIdentityConflict(candidate, proof.value.tag_commit)))
    fail('publication workflow run identity conflict');
  const selected = listed.filter(({ id }) => id === publication.value.workflow.run_id);
  if (selected.length !== 1) fail('publication workflow run identity conflict');
  const competing = listed.filter(({ id }) => id !== publication.value.workflow.run_id);
  if (competing.some((candidate) => candidate.status !== 'completed' || candidate.conclusion === 'success')) {
    fail('multiple usable publication workflow runs conflict');
  }
  const run = settledRun(adapter, selected[0], proof.value.tag_commit);
  if (run.conclusion !== 'success') fail('bound publication workflow run is not successful', 'failure');
  if (canonicalize(workflowIdentity(run)) !== canonicalize(publication.value.workflow))
    fail('publication workflow identity conflict');
  return run;
}

function assertLiveMatchesPublication(release, publication, expectedState) {
  assertReleaseShell(release, expectedState);
  if (release.id !== publication.value.release_database_id) fail('release database identity conflict');
  const assets = normalizedAssets(release);
  assertCompleteAssets(assets);
  if (canonicalize(assets) !== canonicalize(publication.value.assets)) fail('release asset identities changed');
  return assets;
}

export function finalizeReviewed(options, injectedAdapter, promotionValidator, injectedPromotionAdapter) {
  if (typeof promotionValidator !== 'function') fail('promotion validator must be a function');
  const adapter = checkedAdapter(injectedAdapter);
  const proof = validateProof(options);
  const publication = validatePublicationReceipt(
    readCanonical(
      options.get('publication'),
      options.get('publication-sha256'),
      'SessionRelayPublicationReceiptV1',
      '--publication',
    ),
    proof,
    '--publication',
  );
  if (
    publication.value.release_state !== 'prerelease' ||
    publication.value.body_sha256 !== sha256(Buffer.from(PRERELEASE_BODY))
  ) {
    fail('publication receipt is not the exact bound prerelease');
  }
  const promotion = readCanonical(
    options.get('promotion'),
    options.get('promotion-sha256'),
    'PromotionReceiptV1',
    '--promotion',
  );
  promotionValidator(promotion.value, { proof, publication }, injectedPromotionAdapter);
  const resumed = options.has('resume-finalization')
    ? validatePublicationReceipt(
        readCanonical(
          options.get('resume-finalization'),
          options.get('resume-finalization-sha256'),
          'SessionRelayPublicationReceiptV1',
          '--resume-finalization',
        ),
        proof,
        '--resume-finalization',
      )
    : null;
  if (
    promotion.value.outcome !== 'success' ||
    promotion.value.source_proof_sha256 !== proof.digest ||
    promotion.value.publication_receipt_sha256 !== publication.digest
  ) {
    fail('promotion receipt is not a bound success');
  }
  const state = releaseState(adapter);
  if (state.commit !== proof.value.tag_commit || !state.release) fail('release identity conflict');
  if (resumed && (resumed.value.release_state !== 'stable' || state.release.prerelease)) {
    fail('resume finalization is not the reconciled stable release');
  }
  verifyPublicationAgainstRun(adapter, publication, proof);
  let transition = 'already_stable';
  if (state.release.prerelease) {
    assertLiveMatchesPublication(state.release, publication, 'prerelease');
    if (
      state.release.body !== PRERELEASE_BODY ||
      sha256(Buffer.from(state.release.body)) !== publication.value.body_sha256
    ) {
      fail('prerelease body conflict');
    }
    adapter.editStable();
    transition = 'finalized';
  } else {
    assertLiveMatchesPublication(state.release, publication, 'stable');
    if (state.release.body !== STABLE_BODY) fail('stable release body conflict');
  }
  const reconciled = releaseState(adapter);
  if (reconciled.commit !== proof.value.tag_commit) fail('tag identity changed during finalization');
  const assets = assertLiveMatchesPublication(reconciled.release, publication, 'stable');
  if (reconciled.release.body !== STABLE_BODY) fail('stable finalization did not reconcile');
  const receipt = publicationReceipt(
    proof,
    reconciled.release,
    assets,
    publication.value.workflow,
    transition,
    'stable',
    adapter.now(),
  );
  if (
    resumed &&
    (resumed.value.release_database_id !== receipt.release_database_id ||
      resumed.value.body_sha256 !== receipt.body_sha256 ||
      canonicalize(resumed.value.workflow) !== canonicalize(receipt.workflow) ||
      canonicalize(resumed.value.assets) !== canonicalize(receipt.assets))
  )
    fail('resume finalization identity conflict');
  return emitReceipt(options, receipt);
}
