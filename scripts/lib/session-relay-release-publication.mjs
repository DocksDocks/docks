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
  loadReleaseInstance,
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
// Runner map for the CURRENT three-leg native producer; validateRunBundle sizes
// the live attestation set from it. The retired x86_64-apple-darwin leg only
// survives in RETAINED_LEGACY_ASSETS below for reading frozen 0.13 receipts.
const TARGET_RUNNERS = {
  'aarch64-apple-darwin': { runner_arch: 'ARM64', runner_os: 'macOS' },
  'aarch64-unknown-linux-musl': { runner_arch: 'ARM64', runner_os: 'Linux' },
  'x86_64-unknown-linux-musl': { runner_arch: 'X64', runner_os: 'Linux' },
};

const CURRENT_INSTANCE = loadReleaseInstance(VERSION, { require: ['public_child'] });
const { version: CURRENT_PUBLIC_VERSION, tag: CURRENT_PUBLIC_TAG } = CURRENT_INSTANCE.public_child;
const LEGACY_VERSION = '0.13.0';
const LEGACY = loadReleaseInstance('0.13.0', { require: ['historical_receipts'] });
const LEGACY_TAG = 'session-relay--v0.13.0';
const LEGACY_PRERELEASE_BODY =
  'Session Relay 0.13.0 is staged for compatibility validation. Do not install it directly or advertise installation instructions. Wait for the stable release.';
const LEGACY_STABLE_BODY =
  'Session Relay 0.13.0 is available through docks-kit.\n\n## Install or update\n\n```\ndocks-kit sync\n```';
const HISTORICAL_PUBLICATION_SHA256 = LEGACY.historical_receipts.publication;
// The retained 0.13-generation closed asset set. That generation shipped four
// binaries including x86_64-apple-darwin; its receipts are frozen and must keep
// validating byte-identically, so the legacy validators never read the narrowed
// current ASSETS set.
const RETAINED_LEGACY_ASSETS = Object.freeze([
  'session-relay-aarch64-apple-darwin',
  'session-relay-aarch64-unknown-linux-musl',
  'session-relay-x86_64-apple-darwin',
  'session-relay-x86_64-unknown-linux-musl',
  'SHA256SUMS',
]);
const ORDINARY_ASSETS = ASSETS.filter((name) => name !== 'SHA256SUMS');
const PUBLICATION_V2_KEYS = [
  'schema',
  'type',
  'repository_id',
  'version',
  'source_proof_sha256',
  'source',
  'tag',
  'tag_commit',
  'workflow',
  'release_database_id',
  'release_state',
  'body_sha256',
  'assets',
  'digest_evidence',
  'public_companion',
  'historical_predecessor',
  'transition',
  'created_at',
];
export const PROMOTION_EVIDENCE_REBIND_RECEIPT_DESCRIPTOR = Object.freeze({
  schema: 4,
  type: 'PromotionEvidenceRebindReceiptV1',
});

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

function assertAssetRecord(asset, label, closedSet = ASSETS) {
  exactKeys(asset, ASSET_KEYS, label);
  if (!Number.isInteger(asset.database_id) || asset.database_id <= 0) fail(`${label} database identity is invalid`);
  if (!closedSet.includes(asset.name)) fail(`${label} name is invalid`);
  if (!Number.isInteger(asset.size) || asset.size < 0) fail(`${label} size is invalid`);
  if (!SHA256.test(asset.digest ?? '')) fail(`${label} digest is missing or invalid`);
}

// Closed-set check for one release generation: the CURRENT three-binary set by
// default, or RETAINED_LEGACY_ASSETS when a retained schema-1 0.13 receipt is
// being read.
export function assertCompleteAssets(assets, closedSet = ASSETS) {
  const expected = [...closedSet].sort();
  if (assets.length !== expected.length || assets.some((asset, index) => asset.name !== expected[index])) {
    fail('release asset set is absent, partial, duplicated, or conflicting');
  }
  assets.forEach((asset, index) => {
    assertAssetRecord(asset, `release asset ${index}`, closedSet);
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
function expectedRunInputs(event, commit, tag = TAG) {
  return event === 'push'
    ? { expected_commit: '', expected_tag: '', mode: '' }
    : { expected_commit: commit, expected_tag: tag, mode: 'publish-existing-tag' };
}

function validateRunBundle(bundle, run, commit, version = VERSION) {
  const assets = assertRunAssetSet(bundle.assets);
  if (!Array.isArray(bundle.attestations) || bundle.attestations.length !== Object.keys(TARGET_RUNNERS).length) {
    fail('bound workflow run attestation set is incomplete');
  }
  const expectedInputs = expectedRunInputs(run.event, commit, `session-relay--v${version}`);
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
      attestation.version_stdout !== `session-relay ${version}` ||
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

function validateWorkflowIdentity(value, commit, label, tag = TAG) {
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
    canonicalize(value.inputs) !== canonicalize(expectedRunInputs(value.event, commit, tag)) ||
    value.conclusion !== 'success'
  )
    fail(`${label} identity conflict`);
}

function exactTimestamp(value, label) {
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) ||
    new Date(value).toISOString() !== value
  ) {
    fail(`${label} must be an exact RFC3339 UTC timestamp`);
  }
}

export function normalizedTimestamp(value, label) {
  const instant = Date.parse(value);
  if (!Number.isFinite(instant)) fail(`${label} timestamp is invalid`);
  return new Date(instant).toISOString();
}

function observedReleaseCreatedAt(release) {
  return normalizedTimestamp(release?.created_at, 'live release created_at');
}

function validateCurrentDigestMap(value, label, assets) {
  exactKeys(value, ORDINARY_ASSETS, label);
  for (const name of ORDINARY_ASSETS) {
    if (!SHA256.test(value[name] ?? '')) fail(`${label} ${name} digest is invalid`);
    if (value[name] !== assets.get(name)?.digest) fail(`${label} ${name} digest disagrees with the release asset`);
  }
}

function validateCurrentPublicationReceipt(receipt, proof, label) {
  if (!receipt || typeof receipt !== 'object' || !receipt.value || typeof receipt.value !== 'object') {
    fail(`${label} envelope is invalid`);
  }
  if (!SHA256.test(receipt.digest ?? '')) fail(`${label} digest is invalid`);
  if (receipt.digest !== sha256(Buffer.from(canonicalize(receipt.value)))) fail(`${label} digest mismatch`);
  exactKeys(receipt.value, PUBLICATION_V2_KEYS, label);
  const value = receipt.value;
  const planRunProof = proof.value.schema === 3 && proof.value.type === 'SourcePreparationProofV3';
  const expectedBody = value.release_state === 'stable' ? STABLE_BODY : PRERELEASE_BODY;
  const validTransition =
    (value.release_state === 'prerelease' && value.transition === 'tag_and_release_created') ||
    (value.release_state === 'stable' && ['finalized', 'already_stable'].includes(value.transition));
  if (
    value.schema !== 2 ||
    value.type !== 'SessionRelayPublicationReceiptV2' ||
    value.repository_id !== REPOSITORY_ID ||
    value.version !== VERSION ||
    value.source_proof_sha256 !== proof.digest ||
    value.tag !== TAG ||
    value.tag_commit !== proof.value.tag_commit ||
    value.body_sha256 !== sha256(Buffer.from(expectedBody)) ||
    !Number.isSafeInteger(value.release_database_id) ||
    value.release_database_id <= 0 ||
    !validTransition
  ) {
    fail(`${label} release state, body, or transition identity conflict; the prerelease must precede the public child`);
  }
  if (!SHA256.test(value.source_proof_sha256 ?? '')) fail(`${label} source proof digest is invalid`);
  if (!/^[0-9a-f]{40}$/.test(value.tag_commit ?? '')) fail(`${label} tag commit is invalid`);
  exactTimestamp(value.created_at, `${label} created_at`);

  exactKeys(
    value.source,
    ['reviewed_commit', 'implementation_commit', 'reviewed_ancestry_verified'],
    `${label} source`,
  );
  const sourceBindingMatches = planRunProof
    ? value.source.reviewed_commit === value.tag_commit &&
      value.source.implementation_commit === proof.value.implementation_commit
    : value.source.reviewed_commit === value.source.implementation_commit &&
      value.source.reviewed_commit === value.tag_commit;
  if (
    !/^[0-9a-f]{40}$/.test(value.source.reviewed_commit ?? '') ||
    !/^[0-9a-f]{40}$/.test(value.source.implementation_commit ?? '') ||
    !sourceBindingMatches ||
    value.source.reviewed_ancestry_verified !== true
  ) {
    fail(`${label} reviewed source commit ancestry or tag identity conflict`);
  }
  validateWorkflowIdentity(value.workflow, value.tag_commit, `${label} workflow`);

  if (!Array.isArray(value.assets)) fail(`${label} assets must be an array`);
  const names = value.assets.map(({ name }) => name);
  if (canonicalize(names) !== canonicalize([...ASSETS].sort())) {
    fail(`${label} closed asset set must be exactly three native binaries plus SHA256SUMS and no Windows asset`);
  }
  const assetByName = new Map();
  const databaseIds = new Set();
  for (const [index, asset] of value.assets.entries()) {
    assertAssetRecord(asset, `${label} asset ${index}`);
    if (/windows|win32|\.exe$/i.test(asset.name)) fail(`${label} Windows assets are unsupported`);
    if (assetByName.has(asset.name) || databaseIds.has(asset.database_id)) {
      fail(`${label} asset identities are duplicated`);
    }
    assetByName.set(asset.name, asset);
    databaseIds.add(asset.database_id);
  }

  exactKeys(
    value.digest_evidence,
    ['workflow_run_id', 'workflow_run_attempt', 'artifact_sha256', 'release_download_sha256', 'checksum_rows'],
    `${label} digest evidence`,
  );
  if (
    value.digest_evidence.workflow_run_id !== value.workflow.run_id ||
    value.digest_evidence.workflow_run_attempt !== value.workflow.attempt
  ) {
    fail(`${label} digest evidence has a mixed workflow same-run identity`);
  }
  validateCurrentDigestMap(value.digest_evidence.artifact_sha256, `${label} artifact digests`, assetByName);
  validateCurrentDigestMap(
    value.digest_evidence.release_download_sha256,
    `${label} independent release download digests`,
    assetByName,
  );
  validateCurrentDigestMap(value.digest_evidence.checksum_rows, `${label} SHA256SUMS rows`, assetByName);
  if (
    canonicalize(value.digest_evidence.artifact_sha256) !==
      canonicalize(value.digest_evidence.release_download_sha256) ||
    canonicalize(value.digest_evidence.artifact_sha256) !== canonicalize(value.digest_evidence.checksum_rows)
  ) {
    fail(`${label} independent artifact, download, and checksum digest evidence disagrees`);
  }

  exactKeys(
    value.public_companion,
    ['repository_id', 'version', 'tag', 'package', 'npm_version'],
    `${label} public companion`,
  );
  if (
    value.public_companion.repository_id !== 'DocksDocks/public' ||
    value.public_companion.version !== CURRENT_PUBLIC_VERSION ||
    value.public_companion.tag !== CURRENT_PUBLIC_TAG ||
    value.public_companion.package !== 'docks-kit' ||
    value.public_companion.npm_version !== CURRENT_PUBLIC_VERSION
  ) {
    fail(`${label} public companion docks-kit release identity mismatch`);
  }
  exactKeys(
    value.historical_predecessor,
    ['version', 'tag', 'publication_receipt_sha256'],
    `${label} historical predecessor`,
  );
  if (
    value.historical_predecessor.version !== LEGACY_VERSION ||
    value.historical_predecessor.tag !== LEGACY_TAG ||
    value.historical_predecessor.publication_receipt_sha256 !== HISTORICAL_PUBLICATION_SHA256
  ) {
    fail(`${label} historical Session Relay 0.13 publication receipt identity changed`);
  }
  return receipt;
}

export function validatePublicationReceipt(receipt, proof, label) {
  if (receipt?.value?.schema === 2 || receipt?.value?.type === 'SessionRelayPublicationReceiptV2') {
    return validateCurrentPublicationReceipt(receipt, proof, label);
  }
  exactKeys(receipt.value, PUBLICATION_KEYS, label);
  const legacy = receipt.value.version === LEGACY_VERSION;
  const expectedVersion = legacy ? LEGACY_VERSION : VERSION;
  const expectedTag = legacy ? LEGACY_TAG : TAG;
  const prereleaseBody = legacy ? LEGACY_PRERELEASE_BODY : PRERELEASE_BODY;
  const stableBody = legacy ? LEGACY_STABLE_BODY : STABLE_BODY;
  if (
    receipt.value.schema !== 1 ||
    receipt.value.type !== 'SessionRelayPublicationReceiptV1' ||
    receipt.value.repository_id !== REPOSITORY_ID ||
    receipt.value.version !== expectedVersion ||
    receipt.value.source_proof_sha256 !== proof.digest ||
    receipt.value.tag !== expectedTag ||
    receipt.value.tag_commit !== proof.value.tag_commit ||
    !['prerelease', 'stable'].includes(receipt.value.release_state) ||
    receipt.value.body_sha256 !==
      sha256(Buffer.from(receipt.value.release_state === 'prerelease' ? prereleaseBody : stableBody)) ||
    !Number.isInteger(receipt.value.release_database_id) ||
    receipt.value.release_database_id <= 0 ||
    !TRANSITIONS.has(receipt.value.transition) ||
    typeof receipt.value.created_at !== 'string' ||
    Number.isNaN(Date.parse(receipt.value.created_at))
  )
    fail(`${label} immutable identity conflict`);
  validateWorkflowIdentity(receipt.value.workflow, proof.value.tag_commit, `${label} workflow`, expectedTag);
  if (!Array.isArray(receipt.value.assets)) fail(`${label} assets must be an array`);
  // Retained schema-1 0.13 receipts keep their frozen four-binary closed set;
  // a schema-1 receipt minted for the current version carries the current set.
  assertCompleteAssets(receipt.value.assets, legacy ? RETAINED_LEGACY_ASSETS : ASSETS);
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

function publicationReceipt(proof, release, assets, workflow, transition, releaseStateName, createdAt) {
  const planRunProof = proof.value.schema === 3 && proof.value.type === 'SourcePreparationProofV3';
  const recoverablePrerelease =
    [2, 3].includes(proof.value.schema) &&
    releaseStateName === 'prerelease' &&
    ['tag_and_reconciled', 'reconciled'].includes(transition);
  const receiptTransition = recoverablePrerelease ? 'tag_and_release_created' : transition;
  if ([2, 3].includes(proof.value.schema)) {
    if (releaseStateName === 'prerelease' && receiptTransition !== 'tag_and_release_created') {
      fail(`current Session Relay ${VERSION} publication must atomically stage the reviewed tag and prerelease`);
    }
    if (releaseStateName === 'stable' && !['finalized', 'already_stable'].includes(receiptTransition)) {
      fail(`current Session Relay ${VERSION} stable finalization transition is invalid`);
    }
    const expectedBody = releaseStateName === 'stable' ? STABLE_BODY : PRERELEASE_BODY;
    if (release.body !== expectedBody) fail(`current Session Relay ${releaseStateName} body identity conflict`);
    const byName = new Map(assets.map((asset) => [asset.name, asset]));
    const orderedAssets = [...ASSETS].sort().map((name) => byName.get(name));
    if (orderedAssets.some((asset) => asset === undefined)) {
      fail('current publication is missing one of the exact five staged assets');
    }
    const ordinaryDigests = Object.fromEntries(ORDINARY_ASSETS.map((name) => [name, byName.get(name).digest]));
    return {
      schema: 2,
      type: 'SessionRelayPublicationReceiptV2',
      repository_id: REPOSITORY_ID,
      version: VERSION,
      source_proof_sha256: proof.digest,
      source: {
        reviewed_commit: planRunProof ? proof.value.tag_commit : proof.value.completion_review.reviewed_commit,
        implementation_commit: proof.value.implementation_commit,
        reviewed_ancestry_verified: proof.value.ancestry.implementation_to_reviewed,
      },
      tag: TAG,
      tag_commit: proof.value.tag_commit,
      workflow,
      release_database_id: release.id,
      release_state: releaseStateName,
      body_sha256: sha256(Buffer.from(release.body ?? '')),
      assets: orderedAssets,
      digest_evidence: {
        workflow_run_id: workflow.run_id,
        workflow_run_attempt: workflow.attempt,
        artifact_sha256: ordinaryDigests,
        release_download_sha256: structuredClone(ordinaryDigests),
        checksum_rows: structuredClone(ordinaryDigests),
      },
      public_companion: {
        repository_id: 'DocksDocks/public',
        version: CURRENT_PUBLIC_VERSION,
        tag: CURRENT_PUBLIC_TAG,
        package: 'docks-kit',
        npm_version: CURRENT_PUBLIC_VERSION,
      },
      historical_predecessor: {
        version: LEGACY_VERSION,
        tag: LEGACY_TAG,
        publication_receipt_sha256: HISTORICAL_PUBLICATION_SHA256,
      },
      transition: receiptTransition,
      created_at: createdAt,
    };
  }
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
    created_at: createdAt,
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

function completeLivePublication(release) {
  if (!release) return null;
  const stable = release.prerelease === false;
  assertReleaseShell(release, stable ? 'stable' : 'prerelease');
  if (release.body !== (stable ? STABLE_BODY : PRERELEASE_BODY)) {
    fail(`${stable ? 'stable' : 'prerelease'} body conflict`);
  }
  const assets = normalizedAssets(release);
  const expected = [...ASSETS].sort();
  if (assets.length !== expected.length || assets.some((asset, index) => asset.name !== expected[index])) return null;
  assertCompleteAssets(assets);
  return {
    liveAssets: assets,
    receiptRelease: stable ? { ...release, prerelease: true, body: PRERELEASE_BODY } : release,
  };
}
function completeLivePrerelease(release) {
  if (release?.prerelease !== true) return null;
  return completeLivePublication(release)?.liveAssets ?? null;
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
    // GitHub Release created_at can mirror the tagged commit timestamp.
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
  if (state.commit !== proof.value.tag_commit || !state.release) {
    fail('publication rebind requires a complete matching prerelease or promoted stable release');
  }
  const complete = completeLivePublication(state.release);
  if (!complete) fail('publication rebind requires a complete matching prerelease or promoted stable release');
  const run = selectUniqueUsableRun(taggedRuns(adapter), proof.value.tag_commit);
  if (run?.event !== 'push' || run.status !== 'completed' || run.conclusion !== 'success')
    fail('publication rebind requires one successful bound push workflow run');
  const settled = settledRun(adapter, run, proof.value.tag_commit);
  const requiresBoundArtifacts = Date.parse(state.release.published_at) > Date.parse(settled.updated_at);
  let bundle;
  try {
    bundle = requiresBoundArtifacts ? adapter.downloadRunAssets(settled.id) : null;
    const boundRunAssets = bundle
      ? validateRunBundle(bundle, settled, proof.value.tag_commit, proof.value.version)
      : null;
    const verifiedLiveAssets = validateLiveReleaseProvenance(
      adapter,
      state.release,
      settled,
      complete.liveAssets,
      boundRunAssets,
    );
    return emitReceipt(
      options,
      publicationReceipt(
        proof,
        complete.receiptRelease,
        verifiedLiveAssets,
        workflowIdentity(settled),
        'reconciled',
        'prerelease',
        observedReleaseCreatedAt(state.release),
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
          [
            { schema: 1, type: 'SessionRelayPublicationReceiptV1' },
            { schema: 2, type: 'SessionRelayPublicationReceiptV2' },
          ],
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
  if (rebind) return rebindCompletePublication(options, adapter, proof, state);
  if (state.release && !state.release.prerelease) fail('premature stable release conflict');
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
    const runAssets = validateRunBundle(bundle, run, proof.value.tag_commit, proof.value.version);
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
  const expectedAssets =
    publication.value.schema === 2
      ? [...publication.value.assets].sort((left, right) =>
          left.name < right.name ? -1 : left.name > right.name ? 1 : 0,
        )
      : publication.value.assets;
  if (canonicalize(assets) !== canonicalize(expectedAssets)) fail('release asset identities changed');
  return assets;
}

function finalizeCurrentReviewed(options, adapter, proof, publication, promotion, resumed) {
  verifyPublicationAgainstRun(adapter, publication, proof);
  const state = releaseState(adapter);
  if (state.commit !== proof.value.tag_commit || !state.release) fail('release identity conflict');
  if (state.release.prerelease) {
    fail('current stable finalization requires the promoted stable release; run the reviewed stable promotion first');
  }
  const assets = assertLiveMatchesPublication(state.release, publication, 'stable');
  if (state.release.body !== STABLE_BODY) fail('stable release body conflict');

  const stable = promotion.value.stable_release;
  const stableAssets = structuredClone(stable?.assets ?? []).sort((left, right) =>
    left.name < right.name ? -1 : left.name > right.name ? 1 : 0,
  );
  if (
    stable?.prerelease !== false ||
    state.release.id !== stable.release_database_id ||
    state.commit !== stable.tag_commit ||
    publication.value.workflow.run_id !== stable.workflow_run_id ||
    publication.value.workflow.attempt !== stable.workflow_run_attempt ||
    canonicalize(assets) !== canonicalize(stableAssets)
  ) {
    fail('current stable finalization live release does not byte-match the bound stable promotion snapshot');
  }

  if (resumed !== null) {
    const expected = publicationReceipt(
      proof,
      state.release,
      assets,
      publication.value.workflow,
      resumed.value.transition,
      'stable',
      resumed.value.created_at,
    );
    if (canonicalize(expected) !== canonicalize(resumed.value)) {
      fail('current resume finalization identity conflict');
    }
    return emitReceipt(options, resumed.value);
  }

  const receipt = publicationReceipt(
    proof,
    state.release,
    assets,
    publication.value.workflow,
    'already_stable',
    'stable',
    adapter.now(),
  );
  validatePublicationReceipt(
    { value: receipt, digest: sha256(Buffer.from(canonicalize(receipt))) },
    proof,
    'current stable finalization receipt',
  );
  return emitReceipt(options, receipt);
}

export function finalizeReviewed(options, injectedAdapter, promotionValidator, injectedPromotionAdapter) {
  if (typeof promotionValidator !== 'function') fail('promotion validator must be a function');
  const adapter = checkedAdapter(injectedAdapter);
  const proof = validateProof(options);
  const publication = validatePublicationReceipt(
    readCanonical(
      options.get('publication'),
      options.get('publication-sha256'),
      [
        { schema: 1, type: 'SessionRelayPublicationReceiptV1' },
        { schema: 2, type: 'SessionRelayPublicationReceiptV2' },
      ],
      '--publication',
    ),
    proof,
    '--publication',
  );
  const current =
    [2, 3].includes(proof.value.schema) ||
    ['SourcePreparationProofV2', 'SourcePreparationProofV3'].includes(proof.value.type);
  if (current && (publication.value.schema !== 2 || publication.value.type !== 'SessionRelayPublicationReceiptV2')) {
    fail('current stable finalization requires the exact V2 prerelease publication receipt');
  }
  if (
    publication.value.release_state !== 'prerelease' ||
    publication.value.body_sha256 !== sha256(Buffer.from(PRERELEASE_BODY))
  ) {
    fail('publication receipt is not the exact bound prerelease');
  }
  const promotion = readCanonical(
    options.get('promotion'),
    options.get('promotion-sha256'),
    [
      { schema: 1, type: 'PromotionReceiptV1' },
      { schema: 2, type: 'PromotionReceiptV2' },
      { schema: 3, type: 'PromotionReceiptV3' },
      PROMOTION_EVIDENCE_REBIND_RECEIPT_DESCRIPTOR,
    ],
    '--promotion',
  );
  const promotionGenerationMatches = current
    ? ([2, 3].includes(promotion.value.schema) &&
        ['PromotionReceiptV2', 'PromotionReceiptV3'].includes(promotion.value.type)) ||
      (promotion.value.schema === PROMOTION_EVIDENCE_REBIND_RECEIPT_DESCRIPTOR.schema &&
        promotion.value.type === PROMOTION_EVIDENCE_REBIND_RECEIPT_DESCRIPTOR.type)
    : promotion.value.schema === 1 && promotion.value.type === 'PromotionReceiptV1';
  if (!promotionGenerationMatches) {
    fail('promotion receipt schema does not match the source proof release generation');
  }
  let publicRelease = null;
  if ([2, 3, PROMOTION_EVIDENCE_REBIND_RECEIPT_DESCRIPTOR.schema].includes(promotion.value.schema)) {
    if (!options.has('public-release')) {
      fail('current stable finalization requires the exact public release receipt and SHA-256');
    }
    publicRelease = readCanonical(
      options.get('public-release'),
      options.get('public-release-sha256'),
      [
        promotion.value.schema === 2
          ? { schema: 2, type: 'PublicReleaseReceiptV2' }
          : { schema: 3, type: 'PublicReleaseReceiptV3' },
      ],
      '--public-release',
    );
  }
  promotionValidator(
    promotion.value,
    publicRelease === null ? { proof, publication } : { proof, publication, publicRelease },
    injectedPromotionAdapter,
  );
  const resumed = options.has('resume-finalization')
    ? validatePublicationReceipt(
        readCanonical(
          options.get('resume-finalization'),
          options.get('resume-finalization-sha256'),
          [
            { schema: 1, type: 'SessionRelayPublicationReceiptV1' },
            { schema: 2, type: 'SessionRelayPublicationReceiptV2' },
          ],
          '--resume-finalization',
        ),
        proof,
        '--resume-finalization',
      )
    : null;
  if (
    current &&
    resumed !== null &&
    (resumed.value.schema !== 2 ||
      resumed.value.type !== 'SessionRelayPublicationReceiptV2' ||
      resumed.value.release_state !== 'stable')
  ) {
    fail('current resume finalization requires the exact V2 stable publication receipt');
  }
  if (
    promotion.value.outcome !== 'success' ||
    promotion.value.source_proof_sha256 !== proof.digest ||
    promotion.value.publication_receipt_sha256 !== publication.digest
  ) {
    fail('promotion receipt is not a bound success');
  }
  if (current) {
    return finalizeCurrentReviewed(options, adapter, proof, publication, promotion, resumed);
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
  if (current) {
    validatePublicationReceipt(
      { value: receipt, digest: sha256(Buffer.from(canonicalize(receipt))) },
      proof,
      'current stable finalization receipt',
    );
  }
  if (resumed) {
    if (current) {
      const resumedIdentity = structuredClone(resumed.value);
      const receiptIdentity = structuredClone(receipt);
      delete resumedIdentity.transition;
      delete resumedIdentity.created_at;
      delete receiptIdentity.transition;
      delete receiptIdentity.created_at;
      if (canonicalize(resumedIdentity) !== canonicalize(receiptIdentity)) {
        fail('resume finalization identity conflict');
      }
    } else if (
      resumed.value.release_database_id !== receipt.release_database_id ||
      resumed.value.body_sha256 !== receipt.body_sha256 ||
      canonicalize(resumed.value.workflow) !== canonicalize(receipt.workflow) ||
      canonicalize(resumed.value.assets) !== canonicalize(receipt.assets)
    ) {
      fail('resume finalization identity conflict');
    }
  }
  return emitReceipt(options, receipt);
}
