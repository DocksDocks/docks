import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  canonicalPlanView,
  canonicalVerificationResults,
  parsePlan,
  validatePlanRunRecord,
} from '../../plugins/docks/skills/productivity/plan-manager/scripts/plan-run.mjs';
import {
  ASSETS,
  COMMIT,
  LOCK_REF as CURRENT_LOCK_REF,
  PRERELEASE_BODY as CURRENT_PRERELEASE_BODY,
  STABLE_BODY as CURRENT_STABLE_BODY,
  TAG as CURRENT_TAG,
  TRANSACTION_REF as CURRENT_TRANSACTION_REF,
  VERSION as CURRENT_VERSION,
  canonicalize,
  canonicalPath,
  command,
  commandRaw,
  emitReceipt,
  exactKeys,
  fail,
  ghJson,
  git,
  REPO,
  REPOSITORY_ID,
  readCanonical,
  SHA256,
  sha256,
  writeCanonicalExclusive,
} from './session-relay-release-core.mjs';
import {
  validateCompletionReceiptClosed,
  validateProof,
  validateSourcePreparationProof,
  validateTddRedReceipt,
} from './session-relay-release-preparation.mjs';
import {
  productionAdapter as currentPublicationAdapter,
  normalizedAssets,
  releaseState,
  validatePublicationReceipt,
} from './session-relay-release-publication.mjs';

const PUBLIC_REPOSITORY_ID = 'DocksDocks/public';
const PUBLIC_VERSION = '0.12.0';
const PUBLIC_TAG = `cli-v${PUBLIC_VERSION}`;
const PUBLIC_WORKFLOW = '.github/workflows/release-cli.yml';
const LEGACY_PUBLIC_FINISHED_PLAN_PATH =
  /^docs\/plans\/finished\/\d{4}-\d{2}-\d{2}-session-relay-cli-0\.13\.0-production-release\.md$/;
const LEGACY_COMPANION_BASE_COMMIT = '6c07f9bc02ef7a0a26b8ffb539c16c42a87a3172';
const LEGACY_PUBLIC_VERSION = '0.10.2';
const LEGACY_PUBLIC_TAG = `cli-v${LEGACY_PUBLIC_VERSION}`;
const LEGACY_DOCKS_KIT_RELEASE = LEGACY_PUBLIC_TAG;
const LEGACY_TRANSACTION_REF = 'refs/heads/transactions/session-relay-0.13.0';
const LEGACY_LOCK_REF = 'refs/heads/locks/session-relay-0.13.0';
const LEGACY_PRERELEASE_BODY =
  'Session Relay 0.13.0 is staged for compatibility validation. Do not install it directly or advertise installation instructions. Wait for the stable release.';
const PUBLIC_ASSET_TARGETS = [
  'x86_64-unknown-linux-musl',
  'aarch64-unknown-linux-musl',
  'x86_64-apple-darwin',
  'aarch64-apple-darwin',
];
const PUBLIC_RELEASE_ASSET_NAMES = [
  'SHA256SUMS',
  'docks-kit-darwin-arm64',
  'docks-kit-darwin-x64',
  'docks-kit-linux-arm64',
  'docks-kit-linux-x64',
];
const PUBLICATION_TRANSITIONS = new Set([
  'assets_reconciled',
  'reconciled',
  'release_created',
  'tag_and_assets_reconciled',
  'tag_and_reconciled',
  'tag_and_release_created',
]);
const CURRENT_DOCKS_KIT_RELEASE = 'cli-v0.12.0';
const CURRENT_GOAL_ID = '8b89aabf-7336-4352-bc11-225bab67f9aa';
const CURRENT_DOCKS_RUN_ID = '88732ba0-ef06-411b-a31c-93705ccefb27';
const CURRENT_DOCKS_PLAN_PATH = 'docs/plans/active/session-relay-correlated-results-release-remediation-v4.md';
const PLANRUN_DOCKS_RUN_ID = 'e61586f3-78ce-46c2-b324-fa6b753864da';
const PLANRUN_DOCKS_PLAN_PATH = 'docs/plans/active/session-relay-correlated-results-release-remediation-v9.md';
const PLANRUN_RELEASE_TAG_COMMIT = '7d9cbbbdf82210d396de744372eadb6c26655601';
const CURRENT_PUBLIC_RUN_ID = '1f801952-705e-4c7e-a533-91026c013383';
const CURRENT_PUBLIC_PLAN_BASENAME = 'session-relay-0.14.0-docks-kit-0.12.0-release';
const CURRENT_PUBLIC_FINISHED_PLAN_PATH =
  /^docs\/plans\/finished\/\d{4}-\d{2}-\d{2}-session-relay-0\.14\.0-docks-kit-0\.12\.0-release\.md$/;
const HISTORICAL_RELAY_VERSION = '0.13.0';
const HISTORICAL_RELAY_TAG = 'session-relay--v0.13.0';
const HISTORICAL_PUBLICATION_SHA256 = '31d096d31702b66d7e97085a82d8b7da1b75155f828b1d2382a0ac8427ba7ea2';
const HISTORICAL_PUBLIC_REQUEST_SHA256 = '7cf02781a2ed3c75423321492fb2cd4c4944f6da6d6d41290e26a5f3ca0cf902';
const LEGACY_PROMOTION_VERSION = HISTORICAL_RELAY_VERSION;
const LEGACY_PROMOTION_TAG = HISTORICAL_RELAY_TAG;
const LEGACY_PROMOTION_TRANSACTION_REF = LEGACY_TRANSACTION_REF;
const LEGACY_PROMOTION_LOCK_REF = LEGACY_LOCK_REF;
const LEGACY_PROMOTION_DOCKS_KIT_RELEASE = LEGACY_DOCKS_KIT_RELEASE;
const EMPTY_SHA256 = sha256(Buffer.alloc(0));
const PREPUSH_REPAIR_PATHS = [
  'plugins/session-relay/test/release-promotion-contract.mjs',
  'scripts/lib/session-relay-release-cli.mjs',
  'scripts/lib/session-relay-release-promotion.mjs',
];
const PREPUSH_REPAIR_KEYS = [
  'base_commit',
  'commit',
  'paths',
  'full_ci_exit',
  'full_ci_stdout_sha256',
  'full_ci_stderr_sha256',
];
const JOURNAL_TYPE = 'PromotionJournalEntryV1';
const RECEIPT_TYPE = 'PromotionReceiptV1';
const TERMINAL_PHASES = new Set(['terminal_success', 'terminal_failure', 'manual_incident']);
const PHASES = new Set([
  'initialized',
  'locked',
  'prepush_passed',
  'main_pushed',
  'live_passed',
  'restore_pushed',
  'reapply_pushed',
  ...TERMINAL_PHASES,
]);
const JOURNAL_KEYS = [
  'schema',
  'type',
  'transaction_ref',
  'attempt',
  'sequence',
  'prior_entry_commit',
  'phase',
  'immutable',
  'state',
  'receipt_projection',
  'created_at',
];
const IMMUTABLE_KEYS = [
  'repository_id',
  'version',
  'source_proof_sha256',
  'publication_receipt_sha256',
  'tag_commit',
  'promoted_commit',
  'expected_origin_main',
  'docks_kit_repository',
  'docks_kit_release',
  'transaction_ref',
  'lock_ref',
  'lock_nonce',
  'lock_commit',
  'publication_release_id',
  'publication_assets_sha256',
  'public_repository_id',
  'public_reviewed_commit',
  'public_release_commit',
  'public_release_receipt_sha256',
  'prior_attempt_receipt_sha256',
  'prepush_repair',
];
const STATE_KEYS = [
  'origin_main',
  'observed_lock',
  'observed_release',
  'pushed_commit',
  'restore_commit',
  'reapply_commit',
  'compatibility',
  'prepush_smoke',
  'live_smoke',
  'post_restore',
  'failure',
];
const COMPATIBILITY_KEYS = ['paths', 'before', 'promoted', 'restored', 'reapplied', 'current', 'unexpected_paths'];
const ASSET_KEYS = ['name', 'database_id', 'size', 'digest'];
const COMPATIBILITY_BLOB_KEYS = ['before', 'promoted', 'restored', 'reapplied'];
const DOCKS_KIT_KEYS = ['repository_id', 'release', 'release_database_id', 'target_commit', 'asset'];
const POST_RESTORE_KEYS = ['manifest_catalog', 'full_ci_exit', 'full_ci_stdout_sha256', 'full_ci_stderr_sha256'];
const SMOKE_KEYS = [
  'kind',
  'isolation_root_sha256',
  'sync_argv',
  'stdout_sha256',
  'stderr_sha256',
  'ordering_log_sha256',
  'installed_binary_sha256',
  'session_relay_asset_name',
  'installed_version',
  'launcher_sha256',
  'launcher_version',
  'docks_kit_target_commit',
  'docks_kit_release_database_id',
  'docks_kit_asset',
];
const LIVE_RELEASE_KEYS = ['repository_id', 'tag', 'commit', 'release_database_id', 'prerelease', 'assets'];
const RECEIPT_KEYS = [
  'schema',
  'type',
  'repository_id',
  'version',
  'source_proof_sha256',
  'publication_receipt_sha256',
  'tag_commit',
  'promoted_commit',
  'source_ancestry',
  'non_plan_tree_equivalence',
  'transaction_ref',
  'attempt',
  'terminal_key',
  'terminal_journal_commit',
  'journal_chain_sha256',
  'prior_attempt_receipt_sha256',
  'lock_ref',
  'lock_nonce',
  'lock_commit',
  'expected_origin_main',
  'observed_origin_main',
  'prepush_commit',
  'pushed_commit',
  'restore_commit',
  'reapply_commit',
  'compatibility_paths',
  'compatibility_blobs',
  'public_repository_id',
  'public_reviewed_commit',
  'public_release_commit',
  'public_release_receipt_sha256',
  'public_tag_commit',
  'publication_release_id',
  'docks_kit',
  'session_relay_assets',
  'exact_source_smoke',
  'live_smoke',
  'post_restore',
  'outcome',
  'retryable',
  'created_at',
];
const MUTATION_KEYS = [
  'schema',
  'type',
  'kind',
  'parent_commit',
  'source_commit',
  'compatibility_paths',
  'live_smoke',
  'post_restore',
  'failure',
];
const PROJECTION_KEYS = RECEIPT_KEYS.filter(
  (key) => !['schema', 'type', 'terminal_journal_commit', 'journal_chain_sha256'].includes(key),
);
const OUTCOMES = new Set(['success', 'restored_failure', 'failure', 'manual_incident']);
const PUBLICATION_RECEIPT_KEYS = [
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
const PUBLICATION_WORKFLOW_KEYS = [
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
const PUBLIC_REQUEST_KEYS = [
  'schema',
  'type',
  'repository_id',
  'tag',
  'version',
  'companion_base_commit',
  'session_relay',
  'assets',
  'created_at',
];
const PUBLIC_SESSION_RELAY_KEYS = ['repository_id', 'tag', 'version', 'tag_commit', 'publication_receipt_sha256'];
const PUBLIC_RELEASE_RECEIPT_KEYS = [
  'schema',
  'type',
  'request_sha256',
  'repository_id',
  'tag',
  'version',
  'release_commit',
  'companion_base_commit',
  'ancestry_verified',
  'workflow',
  'release',
  'npm',
  'pinned_assets',
  'public_plan',
  'created_at',
];
const PUBLIC_RELEASE_WORKFLOW_KEYS = ['file', 'run_database_id', 'run_attempt', 'conclusion'];
const PUBLIC_RELEASE_KEYS = ['database_id', 'assets', 'checksums_sha256'];
const PUBLIC_RELEASE_ASSET_KEYS = ['name', 'size', 'digest'];
const PUBLIC_NPM_KEYS = ['state'];
const PUBLIC_PLAN_KEYS = ['path', 'commit', 'completion_receipt_sha256'];
const PUBLIC_REQUEST_ADAPTER_KEYS = ['now'];
const PUBLIC_RELEASE_V2_KEYS = [
  'schema',
  'type',
  'request_sha256',
  'repository_id',
  'tag',
  'version',
  'release_commit',
  'companion_base_commit',
  'ancestry',
  'workflow',
  'release',
  'npm',
  'pinned_assets',
  'public_plan',
  'created_at',
];
const PUBLIC_ANCESTRY_V2_KEYS = [
  'execution_parent',
  'red_pre_production_commit',
  'implementation_commit',
  'reviewed_commit',
  'release_commit',
  'archive_commit',
  'red_captured_at',
  'implementation_reviewed_at',
  'red_to_implementation',
  'execution_parent_to_implementation',
  'implementation_to_release',
  'release_to_archive',
];
const PUBLIC_PLAN_V2_KEYS = [
  'schema',
  'repository_id',
  'goal_id',
  'run_id',
  'path',
  'status',
  'implementation_commit',
  'release_commit',
  'archive_commit',
  'red_receipt_sha256',
  'red_pre_production_commit',
  'red_evidence',
  'completion_review_sha256',
  'acceptance_sha256',
  'verification_sha256',
  'remote_read_back',
  'finished_at',
];
const PUBLIC_RELEASE_EVIDENCE_KEYS = ['schema', 'type', 'ancestry', 'public_plan'];
const PUBLIC_ANCESTRY_V3_KEYS = [
  'execution_parent',
  'implementation_commit',
  'release_commit',
  'archive_commit',
  'execution_parent_to_implementation',
  'implementation_to_release',
  'release_to_archive',
];
const PUBLIC_PLAN_V3_KEYS = [
  'plan_run',
  'active_path',
  'finished_path',
  'release_commit',
  'archive_commit',
  'remote_read_back',
  'finished_at',
];
const PROMOTION_V2_KEYS = [
  'schema',
  'type',
  'repository_id',
  'version',
  'tag',
  'source_proof_sha256',
  'reviewed_source_commit',
  'reviewed_source_ancestry',
  'docks_plan',
  'publication_receipt_sha256',
  'public_release_receipt_sha256',
  'public_child',
  'staged_release',
  'stable_release',
  'byte_identical_promotion',
  'historical_receipts',
  'outcome',
  'completed_at',
];
export const PUBLIC_RELEASE_ADAPTER_KEYS = Object.freeze([
  'now',
  'getTagCommit',
  'isAncestor',
  'getFinishedPlan',
  'listWorkflowRuns',
  'getRelease',
  'downloadReleaseAsset',
  'getPinnedAssets',
  'getNpmState',
]);

export const PROMOTION_ADAPTER_KEYS = Object.freeze([
  'now',
  'nonce',
  'loadProof',
  'loadPublication',
  'loadPublicRelease',
  'loadRetryReceipt',
  'remoteRef',
  'isAncestor',
  'isPublicAncestor',
  'readJournal',
  'validatePrepushRepair',
  'createLockCommit',
  'appendJournal',
  'createLock',
  'pushMain',
  'releaseState',
  'compatibilityState',
  'validateCommitTransition',
  'runPrepushSmoke',
  'runLiveSmoke',
  'restoreCompatibility',
  'reapplyCompatibility',
  'assertReceiptOutputAvailable',
  'writeReceipt',
]);

export const CURRENT_PROMOTION_ADAPTER_KEYS = Object.freeze([
  'now',
  'loadProof',
  'loadPublication',
  'loadPublicRelease',
  'remoteRef',
  'isAncestor',
  'isPublicAncestor',
  'currentReleaseState',
  'promoteStable',
  'assertReceiptOutputAvailable',
  'writeReceipt',
]);

function record(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function clone(value) {
  return structuredClone(value);
}

function assertCommit(value, label, nullable = false) {
  if (nullable && value === null) return;
  if (!COMMIT.test(value ?? '')) fail(`${label} must be a 40-character lowercase commit`);
}

function assertDigest(value, label, nullable = false) {
  if (nullable && value === null) return;
  if (!SHA256.test(value ?? '')) fail(`${label} must be a 64-character lowercase SHA-256`);
}

function assertTimestamp(value, label) {
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) ||
    new Date(value).toISOString() !== value
  )
    fail(`${label} must be an exact RFC3339 UTC timestamp`);
}

function assertBlobMap(value, label, nullable = false) {
  if (nullable && value === null) return;
  if (!record(value)) fail(`${label} must be an object`);
  for (const [key, blob] of Object.entries(value)) {
    if (typeof key !== 'string' || key === '' || (blob !== null && !COMMIT.test(blob)))
      fail(`${label} contains an invalid path or Git blob identity`);
  }
}

function validateAssets(assets, label, requireSessionRelaySet = false, allowMissingDigest = false) {
  if (!Array.isArray(assets)) fail(`${label} must be an array`);
  for (const asset of assets) {
    exactKeys(asset, ASSET_KEYS, `${label} asset`);
    if (typeof asset.name !== 'string' || asset.name === '') fail(`${label} asset name is invalid`);
    if (!Number.isInteger(asset.database_id) || asset.database_id <= 0) fail(`${label} asset database ID is invalid`);
    if (!Number.isInteger(asset.size) || asset.size < 0) fail(`${label} asset size is invalid`);
    if (asset.digest !== null || !allowMissingDigest) assertDigest(asset.digest, `${label} asset digest`);
  }
  const names = assets.map(({ name }) => name);
  if (new Set(names).size !== names.length || canonicalize(names) !== canonicalize([...names].sort()))
    fail(`${label} assets must be unique and sorted`);
  if (requireSessionRelaySet && canonicalize(names) !== canonicalize([...ASSETS].sort()))
    fail(`${label} has the wrong closed asset set`);
}

function checkedOperations(adapter, keys, label) {
  if (!record(adapter)) fail(`${label} must be an object`);
  exactKeys(adapter, keys, label);
  for (const key of keys) {
    if (typeof adapter[key] !== 'function') fail(`${label} ${key} must be a function`);
  }
  return adapter;
}

function validateCurrentPromotionAdapter(adapter) {
  return checkedOperations(adapter, CURRENT_PROMOTION_ADAPTER_KEYS, 'current promotion dependency adapter');
}

function publicationAssetPins(publication) {
  const assets = new Map(publication.value.assets.map((asset) => [asset.name, asset]));
  return Object.fromEntries(
    PUBLIC_ASSET_TARGETS.map((target) => {
      const asset = assets.get(`session-relay-${target}`);
      if (!asset) fail(`publication receipt is missing executable asset ${target}`);
      assertDigest(asset.digest, `publication executable asset ${target}`);
      return [target, asset.digest];
    }),
  );
}

function validateStandalonePublication(publication, label) {
  if (!record(publication) || !record(publication.value)) fail(`${label} is invalid`);
  assertDigest(publication.digest, `${label} digest`);
  if (publication.value.schema === 2 || publication.value.type === 'SessionRelayPublicationReceiptV2') {
    return validatePublicationReceipt(
      publication,
      {
        digest: publication.value.source_proof_sha256,
        value: { tag_commit: publication.value.tag_commit },
      },
      label,
    );
  }
  const value = publication.value;
  exactKeys(value, PUBLICATION_RECEIPT_KEYS, label);
  if (
    value.schema !== 1 ||
    value.type !== 'SessionRelayPublicationReceiptV1' ||
    value.repository_id !== REPOSITORY_ID ||
    value.version !== HISTORICAL_RELAY_VERSION ||
    value.tag !== HISTORICAL_RELAY_TAG ||
    value.release_state !== 'prerelease' ||
    value.body_sha256 !== sha256(Buffer.from(LEGACY_PRERELEASE_BODY)) ||
    !Number.isInteger(value.release_database_id) ||
    value.release_database_id <= 0 ||
    !PUBLICATION_TRANSITIONS.has(value.transition)
  )
    fail(`${label} is not the exact staged Session Relay publication`);
  assertDigest(value.source_proof_sha256, `${label} source proof digest`);
  assertCommit(value.tag_commit, `${label} tag commit`);
  assertTimestamp(value.created_at, `${label} creation time`);
  exactKeys(value.workflow, PUBLICATION_WORKFLOW_KEYS, `${label} workflow`);
  exactKeys(value.workflow.inputs, ['expected_commit', 'expected_tag', 'mode'], `${label} workflow inputs`);
  const expectedWorkflowInputs =
    value.workflow.event === 'push'
      ? { expected_commit: '', expected_tag: '', mode: '' }
      : { expected_commit: value.tag_commit, expected_tag: HISTORICAL_RELAY_TAG, mode: 'publish-existing-tag' };
  if (
    value.workflow.file !== '.github/workflows/build-binaries.yml' ||
    value.workflow.workflow_sha !== value.tag_commit ||
    value.workflow.head_sha !== value.tag_commit ||
    value.workflow.path !== '.github/workflows/build-binaries.yml' ||
    !['push', 'workflow_dispatch'].includes(value.workflow.event) ||
    canonicalize(value.workflow.inputs) !== canonicalize(expectedWorkflowInputs) ||
    value.workflow.conclusion !== 'success' ||
    !Number.isInteger(value.workflow.run_id) ||
    value.workflow.run_id <= 0 ||
    !Number.isInteger(value.workflow.attempt) ||
    value.workflow.attempt <= 0
  )
    fail(`${label} workflow identity is invalid`);
  validateAssets(value.assets, label, true);
  if (new Set(value.assets.map(({ database_id: databaseId }) => databaseId)).size !== value.assets.length) {
    fail(`${label} asset database identities are duplicated`);
  }
  publicationAssetPins(publication);
  return publication;
}

function validatePublicAssetPins(value, label) {
  exactKeys(value, PUBLIC_ASSET_TARGETS, label);
  for (const target of PUBLIC_ASSET_TARGETS) assertDigest(value[target], `${label} ${target}`);
  return value;
}
function normalizedRelayDigestPins(value, label) {
  if (!record(value)) fail(`${label} must be an object`);
  const keys = Object.keys(value).sort();
  const targets = [...PUBLIC_ASSET_TARGETS].sort();
  if (canonicalize(keys) === canonicalize(targets)) {
    validatePublicAssetPins(value, label);
    return value;
  }
  const assetNames = PUBLIC_ASSET_TARGETS.map((target) => `session-relay-${target}`).sort();
  exactKeys(value, assetNames, label);
  return Object.fromEntries(
    PUBLIC_ASSET_TARGETS.map((target) => {
      const digestValue = value[`session-relay-${target}`];
      assertDigest(digestValue, `${label} ${target}`);
      return [target, digestValue];
    }),
  );
}

function validatePublicRequest(request, publication, expectedCompanionBase = LEGACY_COMPANION_BASE_COMMIT) {
  if (!record(request) || !record(request.value)) fail('public release request is invalid');
  assertDigest(request.digest, 'public release request digest');
  const value = request.value;
  const current = publication.value.schema === 2;
  const expectedPublicVersion = current ? PUBLIC_VERSION : LEGACY_PUBLIC_VERSION;
  const expectedPublicTag = current ? PUBLIC_TAG : LEGACY_PUBLIC_TAG;
  const expectedRelayVersion = current ? CURRENT_VERSION : HISTORICAL_RELAY_VERSION;
  const expectedRelayTag = current ? CURRENT_TAG : HISTORICAL_RELAY_TAG;
  exactKeys(value, PUBLIC_REQUEST_KEYS, 'public release request');
  exactKeys(value.session_relay, PUBLIC_SESSION_RELAY_KEYS, 'public release request Session Relay identity');
  if (
    value.schema !== 1 ||
    value.type !== 'PublicReleaseRequestV1' ||
    value.repository_id !== PUBLIC_REPOSITORY_ID ||
    value.tag !== expectedPublicTag ||
    value.version !== expectedPublicVersion ||
    (expectedCompanionBase !== null && value.companion_base_commit !== expectedCompanionBase) ||
    value.session_relay.repository_id !== REPOSITORY_ID ||
    value.session_relay.tag !== expectedRelayTag ||
    value.session_relay.version !== expectedRelayVersion ||
    value.session_relay.tag_commit !== publication.value.tag_commit ||
    value.session_relay.publication_receipt_sha256 !== publication.digest
  )
    fail('public release request immutable identity conflict');
  assertCommit(value.companion_base_commit, 'public release request companion execution parent');
  assertTimestamp(value.created_at, 'public release request creation time');
  validatePublicAssetPins(value.assets, 'public release request assets');
  if (canonicalize(value.assets) !== canonicalize(publicationAssetPins(publication))) {
    fail('public release request asset digests do not match the publication receipt');
  }
  return request;
}

export function emitPublicRequest(options, injectedAdapter = undefined) {
  const adapter = checkedOperations(
    injectedAdapter ?? { now: () => new Date().toISOString() },
    PUBLIC_REQUEST_ADAPTER_KEYS,
    'public request dependency adapter',
  );
  const publication = validateStandalonePublication(
    readCanonical(
      options.get('publication'),
      options.get('publication-sha256'),
      [
        { schema: 1, type: 'SessionRelayPublicationReceiptV1' },
        { schema: 2, type: 'SessionRelayPublicationReceiptV2' },
      ],
      '--publication',
    ),
    'publication receipt',
  );
  const current = publication.value.schema === 2;
  const companionBaseCommit = current ? options.get('public-execution-parent') : LEGACY_COMPANION_BASE_COMMIT;
  if (current) assertCommit(companionBaseCommit, '--public-execution-parent');
  const publicVersion = current ? PUBLIC_VERSION : LEGACY_PUBLIC_VERSION;
  const publicTag = current ? PUBLIC_TAG : LEGACY_PUBLIC_TAG;
  const relayVersion = current ? CURRENT_VERSION : HISTORICAL_RELAY_VERSION;
  const relayTag = current ? CURRENT_TAG : HISTORICAL_RELAY_TAG;
  const receipt = {
    schema: 1,
    type: 'PublicReleaseRequestV1',
    repository_id: PUBLIC_REPOSITORY_ID,
    tag: publicTag,
    version: publicVersion,
    companion_base_commit: companionBaseCommit,
    session_relay: {
      repository_id: REPOSITORY_ID,
      tag: relayTag,
      version: relayVersion,
      tag_commit: publication.value.tag_commit,
      publication_receipt_sha256: publication.digest,
    },
    assets: publicationAssetPins(publication),
    created_at: adapter.now(),
  };
  validatePublicRequest(
    { value: receipt, digest: sha256(Buffer.from(canonicalize(receipt))) },
    publication,
    companionBaseCommit,
  );
  return emitReceipt(options, receipt);
}

function finishedPlanCompletion(planBytes, expectedDigest, reviewedHead) {
  if (!Buffer.isBuffer(planBytes)) fail('public finished plan observation must be bytes');
  const plan = planBytes.toString('utf8');
  const frontmatter = /^---\n([\s\S]*?)\n---(?:\n|$)/.exec(plan);
  if (!frontmatter) fail('public finished plan frontmatter is absent');
  const reviewStatuses = [...frontmatter[1].matchAll(/^review_status:\s*(?:"([^"]+)"|'([^']+)'|([^\s#]+))\s*$/gm)].map(
    (match) => match[1] ?? match[2] ?? match[3],
  );
  if (reviewStatuses.length !== 1 || reviewStatuses[0] !== 'passed') {
    fail('public finished plan review_status is not passed');
  }
  const matches = [...plan.matchAll(/^Completion-review-receipt: (.+)$/gm)];
  if (matches.length !== 1) fail('public finished plan must contain one Completion-review-receipt line');
  const receiptText = matches[0][1];
  if (sha256(Buffer.from(receiptText)) !== expectedDigest) fail('public completion receipt line hash mismatch');
  let receipt;
  try {
    receipt = JSON.parse(receiptText);
  } catch {
    fail('public completion receipt line is not JSON');
  }
  if (canonicalize(receipt) !== receiptText) fail('public completion receipt line is not canonical JCS');
  validateCompletionReceiptClosed(receipt, { reviewedHead });
  if (receipt.phase !== 'completion' || receipt.outcome !== 'passed' || receipt.completion_verdict !== 'passed') {
    fail('public completion receipt must record a passed completion review');
  }
  return expectedDigest;
}

function currentPublicReleaseEvidence(planBytes) {
  if (!Buffer.isBuffer(planBytes)) fail('current public finished plan observation must be bytes');
  const evidenceLines = [];
  let fence = null;
  for (const line of planBytes.toString('utf8').split('\n')) {
    const fenceMatch = /^\s*(`{3,}|~{3,})/.exec(line);
    if (fenceMatch) {
      const marker = fenceMatch[1];
      if (fence === null) {
        fence = { character: marker[0], length: marker.length };
      } else if (marker[0] === fence.character && marker.length >= fence.length) {
        fence = null;
      }
      continue;
    }
    if (!line.startsWith('Public-release-evidence: ')) continue;
    if (fence !== null) fail('current public release evidence line must be unfenced');
    evidenceLines.push(line.slice('Public-release-evidence: '.length));
  }
  if (evidenceLines.length !== 1) {
    fail('current public finished plan must contain exactly one Public-release-evidence line');
  }
  const evidenceText = evidenceLines[0];
  let evidence;
  try {
    evidence = JSON.parse(evidenceText);
  } catch {
    fail('current public release evidence line is not JSON');
  }
  if (!record(evidence) || canonicalize(evidence) !== evidenceText) {
    fail('current public release evidence line is not canonical JCS');
  }
  exactKeys(evidence, PUBLIC_RELEASE_EVIDENCE_KEYS, 'current public release evidence');
  if (evidence.schema !== 1 || evidence.type !== 'PublicReleaseEvidenceV1') {
    fail('current public release evidence schema or type is invalid');
  }
  if (!record(evidence.ancestry) || !record(evidence.public_plan)) {
    fail('current public release evidence ancestry or public plan is invalid');
  }
  exactKeys(evidence.ancestry, PUBLIC_ANCESTRY_V2_KEYS, 'current public release evidence ancestry');
  exactKeys(evidence.public_plan, PUBLIC_PLAN_V2_KEYS, 'current public release evidence public plan');
  return evidence;
}

function verifyCurrentPublicEvidenceBindings(
  adapter,
  evidence,
  { companionBaseCommit, completionDigest, finishedPlanPath, planCommit, releaseCommit },
) {
  const { ancestry, public_plan: publicPlan } = evidence;
  for (const [label, commit] of [
    ['execution parent', ancestry.execution_parent],
    ['red pre-production commit', ancestry.red_pre_production_commit],
    ['implementation commit', ancestry.implementation_commit],
    ['reviewed commit', ancestry.reviewed_commit],
    ['release commit', ancestry.release_commit],
    ['archive commit', ancestry.archive_commit],
    ['plan implementation commit', publicPlan.implementation_commit],
    ['plan release commit', publicPlan.release_commit],
    ['plan archive commit', publicPlan.archive_commit],
    ['plan red pre-production commit', publicPlan.red_pre_production_commit],
  ]) {
    assertCommit(commit, `current public release evidence ${label}`);
  }
  assertDigest(publicPlan.completion_review_sha256, 'current public release evidence completion review digest');
  if (
    ancestry.execution_parent !== companionBaseCommit ||
    ancestry.reviewed_commit !== ancestry.implementation_commit ||
    ancestry.release_commit !== releaseCommit ||
    ancestry.archive_commit !== planCommit ||
    publicPlan.path !== finishedPlanPath ||
    publicPlan.status !== 'finished' ||
    publicPlan.implementation_commit !== ancestry.implementation_commit ||
    publicPlan.release_commit !== releaseCommit ||
    publicPlan.archive_commit !== planCommit ||
    publicPlan.red_pre_production_commit !== ancestry.red_pre_production_commit ||
    publicPlan.completion_review_sha256 !== completionDigest ||
    publicPlan.remote_read_back !== true
  ) {
    fail('current public release evidence plan identity, commit binding, or completion hash mismatch');
  }
  for (const [flag, ancestor, descendant, label] of [
    [
      'red_to_implementation',
      ancestry.red_pre_production_commit,
      ancestry.implementation_commit,
      'red-to-implementation',
    ],
    [
      'execution_parent_to_implementation',
      ancestry.execution_parent,
      ancestry.implementation_commit,
      'execution-parent-to-implementation',
    ],
    ['implementation_to_release', ancestry.implementation_commit, ancestry.release_commit, 'implementation-to-release'],
    ['release_to_archive', ancestry.release_commit, ancestry.archive_commit, 'release-to-archive'],
  ]) {
    if (ancestry[flag] !== true || adapter.isAncestor(ancestor, descendant) !== true) {
      fail(`current public release ${label} ancestry/order was not independently observed`);
    }
  }
  return evidence;
}
function parsedPublicPlanRun(parsed) {
  const records = [];
  let fence = null;
  for (const line of parsed.body.split('\n')) {
    const fenceMatch = /^\s*(`{3,}|~{3,})/.exec(line);
    if (fenceMatch) {
      const marker = fenceMatch[1];
      if (fence === null) {
        fence = { character: marker[0], length: marker.length };
      } else if (marker[0] === fence.character && marker.length >= fence.length) {
        fence = null;
      }
      continue;
    }
    if (fence === null && line.startsWith('Plan-run: ')) records.push(line.slice('Plan-run: '.length));
  }
  if (fence !== null || records.length !== 1) {
    fail('current public finished plan must contain exactly one unfenced PlanRunV1 record');
  }
  let run;
  try {
    run = JSON.parse(records[0]);
  } catch {
    fail('current public finished PlanRunV1 record is not strict JSON');
  }
  if (canonicalize(run) !== records[0]) fail('current public finished PlanRunV1 record is not compact JCS');
  return run;
}

function publicPlanRunManifestDigest(adapter, implementationCommit, affectedPaths, mode) {
  const paths = affectedPaths.map((filePath) => {
    const bytes = adapter.getFinishedPlan(implementationCommit, filePath);
    if (!Buffer.isBuffer(bytes)) fail(`current public implementation path observation must be bytes: ${filePath}`);
    return {
      path: filePath,
      state: 'file',
      kind: 'file',
      mode,
      sha256: sha256(bytes),
    };
  });
  return sha256(
    Buffer.from(
      canonicalize({
        schema: 1,
        source_base: implementationCommit,
        paths,
      }),
    ),
  );
}

function verifyCurrentPublicPlanRun(
  adapter,
  planBytes,
  { companionBaseCommit, completionDigest, finishedPlanPath, planCommit, releaseCommit },
) {
  let parsed;
  try {
    parsed = parsePlan(planBytes);
  } catch {
    fail('current public finished plan is not a valid canonical PlanRunV1 document');
  }
  const run = parsedPublicPlanRun(parsed);
  try {
    validatePlanRunRecord(run, { status: parsed.frontmatter.status });
  } catch {
    fail('current public finished PlanRunV1 lifecycle tuple or record shape is invalid');
  }
  if (run.plan_sha256 !== sha256(canonicalPlanView(planBytes))) {
    fail('current public finished PlanRunV1 plan digest mismatch');
  }
  const { frontmatter } = parsed;
  const expectedActivePath = `docs/plans/active/${CURRENT_PUBLIC_PLAN_BASENAME}.md`;
  if (
    frontmatter.status !== 'finished' ||
    run.plan_path !== expectedActivePath ||
    !CURRENT_PUBLIC_FINISHED_PLAN_PATH.test(finishedPlanPath) ||
    run.repository_id !== PUBLIC_REPOSITORY_ID ||
    run.goal_id !== CURRENT_GOAL_ID ||
    run.run_id !== CURRENT_PUBLIC_RUN_ID ||
    run.risk !== 'external' ||
    canonicalize(run.requested_effects) !== canonicalize(['local', 'probe', 'push', 'release']) ||
    run.source_base !== companionBaseCommit ||
    run.execution_parent !== companionBaseCommit ||
    run.implementation_commit === null ||
    run.acceptance === null ||
    run.draft_review.state !== 'passed' ||
    run.completion_review.state !== 'passed' ||
    run.completion_review.result_sha256 !== completionDigest ||
    frontmatter.finished_at === null
  ) {
    fail('current public finished PlanRunV1 lifecycle, identity, effect, or completion binding is invalid');
  }
  assertTimestamp(frontmatter.finished_at, 'current public finished PlanRunV1 time');
  if (run.acceptance.verification_sha256 !== sha256(canonicalVerificationResults(planBytes))) {
    fail('current public finished PlanRunV1 Verification Results digest mismatch');
  }
  const manifestDigests = [0o644, 0o664].map((mode) =>
    publicPlanRunManifestDigest(adapter, run.implementation_commit, frontmatter.affected_paths, mode),
  );
  if (!manifestDigests.includes(run.acceptance.source_sha256)) {
    fail('current public finished PlanRunV1 affected-path source manifest mismatch');
  }
  const ancestry = {
    execution_parent: run.execution_parent,
    implementation_commit: run.implementation_commit,
    release_commit: releaseCommit,
    archive_commit: planCommit,
    execution_parent_to_implementation: true,
    implementation_to_release: true,
    release_to_archive: true,
  };
  for (const [ancestor, descendant, label] of [
    [ancestry.execution_parent, ancestry.implementation_commit, 'execution-parent-to-implementation'],
    [ancestry.implementation_commit, ancestry.release_commit, 'implementation-to-release'],
    [ancestry.release_commit, ancestry.archive_commit, 'release-to-archive'],
  ]) {
    if (adapter.isAncestor(ancestor, descendant) !== true) {
      fail(`current public PlanRunV1 ${label} ancestry was not independently observed`);
    }
  }
  return {
    ancestry,
    public_plan: {
      plan_run: structuredClone(run),
      active_path: run.plan_path,
      finished_path: finishedPlanPath,
      release_commit: releaseCommit,
      archive_commit: planCommit,
      remote_read_back: true,
      finished_at: frontmatter.finished_at,
    },
  };
}

function currentPublicReleaseTimestamp(release) {
  const publishedAt = release?.published_at;
  if (
    typeof publishedAt !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(publishedAt) ||
    Number.isNaN(Date.parse(publishedAt))
  ) {
    fail('current public GitHub Release published_at identity is invalid');
  }
  return new Date(publishedAt).toISOString();
}

function successfulPublicWorkflowRun(runs, releaseCommit, publicTag = PUBLIC_TAG) {
  if (!Array.isArray(runs)) fail('public workflow run observation is invalid');
  const successful = runs.filter(
    (run) =>
      run?.path === PUBLIC_WORKFLOW &&
      run.head_branch === publicTag &&
      run.event === 'push' &&
      run.status === 'completed' &&
      run.conclusion === 'success',
  );
  if (successful.length !== 1) fail('public release requires exactly one successful release-cli.yml workflow run');
  const run = successful[0];
  if (run.head_sha !== releaseCommit) fail('public release workflow run commit mismatch');
  if (!Number.isInteger(run.id) || run.id <= 0 || !Number.isInteger(run.run_attempt) || run.run_attempt <= 0) {
    fail('public release workflow run identity is invalid');
  }
  return run;
}

function downloadedPublicRelease(adapter, release, publicTag = PUBLIC_TAG) {
  if (
    !record(release) ||
    release.tag_name !== publicTag ||
    release.draft !== false ||
    release.prerelease !== false ||
    !Number.isInteger(release.id) ||
    release.id <= 0 ||
    !Array.isArray(release.assets)
  )
    fail('public GitHub Release identity is invalid');
  const sorted = [...release.assets].sort((left, right) =>
    left.name < right.name ? -1 : left.name > right.name ? 1 : 0,
  );
  const names = sorted.map(({ name }) => name);
  if (canonicalize(names) !== canonicalize(PUBLIC_RELEASE_ASSET_NAMES)) {
    fail('public GitHub Release has the wrong closed five-asset set');
  }
  const downloaded = new Map();
  const receiptAssets = sorted.map((asset) => {
    if (!Number.isInteger(asset.id) || asset.id <= 0 || !Number.isInteger(asset.size) || asset.size < 0) {
      fail('public GitHub Release asset identity is invalid');
    }
    const bytes = adapter.downloadReleaseAsset(asset.id);
    if (!Buffer.isBuffer(bytes)) fail('public GitHub Release asset download must return bytes');
    const digest = sha256(bytes);
    if (bytes.length !== asset.size) fail(`public GitHub Release asset size mismatch for ${asset.name}`);
    if (typeof asset.digest === 'string' && asset.digest.replace(/^sha256:/, '') !== digest) {
      fail(`public GitHub Release asset digest mismatch for ${asset.name}`);
    }
    downloaded.set(asset.name, bytes);
    return { name: asset.name, size: bytes.length, digest };
  });
  const checksumBytes = downloaded.get('SHA256SUMS');
  const binaryAssets = new Map(
    receiptAssets.filter(({ name }) => name !== 'SHA256SUMS').map((asset) => [asset.name, asset.digest]),
  );
  const rows = checksumBytes.toString('utf8').split('\n').filter(Boolean);
  if (rows.length !== binaryAssets.size) fail('public checksum manifest has the wrong closed row set');
  const seen = new Set();
  for (const row of rows) {
    const match = /^([0-9a-f]{64}) {2}([A-Za-z0-9._-]+)$/.exec(row);
    if (!match || seen.has(match[2]) || binaryAssets.get(match[2]) !== match[1]) {
      fail('public SHA256SUMS digest or row identity conflict');
    }
    seen.add(match[2]);
  }
  return {
    database_id: release.id,
    assets: receiptAssets,
    checksums_sha256: sha256(checksumBytes),
  };
}

function validatePublicRedEvidence(value, ancestry, plan) {
  exactKeys(
    value,
    ['schema', 'type', 'receipt_sha256', 'expected_failure_signature', 'ordered_before_implementation', 'receipt'],
    'public red-first evidence',
  );
  if (
    value.schema !== 1 ||
    value.type !== 'PublicRedFirstEvidenceV1' ||
    value.ordered_before_implementation !== true ||
    typeof value.expected_failure_signature !== 'string' ||
    value.expected_failure_signature.length === 0
  ) {
    fail('public red-first evidence identity or implementation order is invalid');
  }
  assertDigest(value.receipt_sha256, 'public red-first receipt digest');
  validateTddRedReceipt(value.receipt, { repositoryId: PUBLIC_REPOSITORY_ID });
  if (value.receipt.exit_code !== 1 || value.receipt.test_paths.length !== 2) {
    fail('public red-first evidence must record the two frozen contract tests failing with exit code 1');
  }
  if (
    value.receipt_sha256 !== sha256(Buffer.from(canonicalize(value.receipt))) ||
    value.receipt_sha256 !== plan.red_receipt_sha256 ||
    value.receipt.pre_production_commit !== ancestry.red_pre_production_commit ||
    value.receipt.pre_production_commit !== plan.red_pre_production_commit ||
    value.receipt.captured_at !== ancestry.red_captured_at ||
    Date.parse(value.receipt.captured_at) >= Date.parse(ancestry.implementation_reviewed_at)
  ) {
    fail('public red receipt commit, digest, or order does not match release ancestry');
  }
}

function validateCurrentPublicReleaseReceipt(receipt, { publication = null, requestDigest = null } = {}) {
  if (!record(receipt) || !record(receipt.value)) fail('current public release receipt is invalid');
  assertDigest(receipt.digest, 'current public release receipt digest');
  if (receipt.digest !== sha256(Buffer.from(canonicalize(receipt.value)))) {
    fail('current public release receipt digest mismatch');
  }
  const value = receipt.value;
  const planRunReceipt = value.schema === 3 && value.type === 'PublicReleaseReceiptV3';
  const evidenceReceipt = value.schema === 2 && value.type === 'PublicReleaseReceiptV2';
  exactKeys(value, PUBLIC_RELEASE_V2_KEYS, 'current public release receipt');
  if (
    (!planRunReceipt && !evidenceReceipt) ||
    value.repository_id !== PUBLIC_REPOSITORY_ID ||
    value.tag !== PUBLIC_TAG ||
    value.version !== PUBLIC_VERSION
  ) {
    fail('current public release receipt immutable docks-kit identity conflict');
  }
  assertDigest(value.request_sha256, 'current public release request digest');
  assertCommit(value.release_commit, 'current public release commit');
  assertCommit(value.companion_base_commit, 'current public execution parent');
  assertTimestamp(value.created_at, 'current public release receipt creation time');
  if (requestDigest !== null && value.request_sha256 !== requestDigest) {
    fail('current public release request digest mismatch');
  }

  exactKeys(
    value.ancestry,
    planRunReceipt ? PUBLIC_ANCESTRY_V3_KEYS : PUBLIC_ANCESTRY_V2_KEYS,
    'current public release ancestry',
  );
  const ancestryCommits = planRunReceipt
    ? ['execution_parent', 'implementation_commit', 'release_commit', 'archive_commit']
    : [
        'execution_parent',
        'red_pre_production_commit',
        'implementation_commit',
        'reviewed_commit',
        'release_commit',
        'archive_commit',
      ];
  for (const key of ancestryCommits) {
    assertCommit(value.ancestry[key], `current public release ancestry ${key}`);
  }
  if (planRunReceipt) {
    if (
      value.ancestry.execution_parent !== value.companion_base_commit ||
      value.ancestry.release_commit !== value.release_commit ||
      value.ancestry.execution_parent_to_implementation !== true ||
      value.ancestry.implementation_to_release !== true ||
      value.ancestry.release_to_archive !== true
    ) {
      fail('current public PlanRunV1 implementation, release, and archive ancestry is incomplete');
    }
  } else {
    assertTimestamp(value.ancestry.red_captured_at, 'current public red capture time');
    assertTimestamp(value.ancestry.implementation_reviewed_at, 'current public implementation review time');
    if (
      value.ancestry.execution_parent !== value.companion_base_commit ||
      value.ancestry.reviewed_commit !== value.ancestry.implementation_commit ||
      value.ancestry.release_commit !== value.release_commit ||
      value.ancestry.red_to_implementation !== true ||
      value.ancestry.execution_parent_to_implementation !== true ||
      value.ancestry.implementation_to_release !== true ||
      value.ancestry.release_to_archive !== true ||
      Date.parse(value.ancestry.red_captured_at) >= Date.parse(value.ancestry.implementation_reviewed_at)
    ) {
      fail('current public red, implementation, release, and archive ancestry is incomplete');
    }
  }

  exactKeys(value.workflow, PUBLIC_RELEASE_WORKFLOW_KEYS, 'current public release workflow');
  if (
    value.workflow.file !== PUBLIC_WORKFLOW ||
    !Number.isSafeInteger(value.workflow.run_database_id) ||
    value.workflow.run_database_id <= 0 ||
    !Number.isSafeInteger(value.workflow.run_attempt) ||
    value.workflow.run_attempt <= 0 ||
    value.workflow.conclusion !== 'success'
  ) {
    fail('current public release workflow identity is invalid');
  }
  exactKeys(value.release, PUBLIC_RELEASE_KEYS, 'current public GitHub release');
  if (!Number.isSafeInteger(value.release.database_id) || value.release.database_id <= 0) {
    fail('current public GitHub release database identity is invalid');
  }
  assertDigest(value.release.checksums_sha256, 'current public checksum asset digest');
  if (!Array.isArray(value.release.assets)) fail('current public release assets must be an array');
  for (const asset of value.release.assets) {
    exactKeys(asset, PUBLIC_RELEASE_ASSET_KEYS, 'current public release asset');
    if (
      !PUBLIC_RELEASE_ASSET_NAMES.includes(asset.name) ||
      !Number.isSafeInteger(asset.size) ||
      asset.size < 0 ||
      /windows|win32|\.exe$/i.test(asset.name)
    ) {
      fail('current public release has an invalid or unsupported Windows asset identity');
    }
    assertDigest(asset.digest, `current public release asset ${asset.name} digest`);
  }
  if (
    canonicalize(value.release.assets.map(({ name }) => name)) !== canonicalize(PUBLIC_RELEASE_ASSET_NAMES) ||
    value.release.assets[0].name !== 'SHA256SUMS' ||
    value.release.assets[0].digest !== value.release.checksums_sha256
  ) {
    fail('current public release must contain the exact closed five-asset set and checksum identity');
  }
  exactKeys(value.npm, ['package', 'state', 'version'], 'current public npm receipt');
  if (value.npm.package !== 'docks-kit' || value.npm.state !== 'published' || value.npm.version !== PUBLIC_VERSION) {
    fail('current public npm docks-kit publication identity is invalid');
  }
  validatePublicAssetPins(value.pinned_assets, 'current public pinned Session Relay assets');

  const plan = value.public_plan;
  exactKeys(plan, planRunReceipt ? PUBLIC_PLAN_V3_KEYS : PUBLIC_PLAN_V2_KEYS, 'current public finished PlanRunV1');
  if (planRunReceipt) {
    const run = plan.plan_run;
    try {
      validatePlanRunRecord(run, { status: 'finished' });
    } catch {
      fail('current public release receipt PlanRunV1 lifecycle tuple or record shape is invalid');
    }
    if (
      run.repository_id !== PUBLIC_REPOSITORY_ID ||
      run.goal_id !== CURRENT_GOAL_ID ||
      run.run_id !== CURRENT_PUBLIC_RUN_ID ||
      run.risk !== 'external' ||
      canonicalize(run.requested_effects) !== canonicalize(['local', 'probe', 'push', 'release']) ||
      plan.active_path !== run.plan_path ||
      plan.active_path !== `docs/plans/active/${CURRENT_PUBLIC_PLAN_BASENAME}.md` ||
      !CURRENT_PUBLIC_FINISHED_PLAN_PATH.test(plan.finished_path) ||
      run.implementation_commit !== value.ancestry.implementation_commit ||
      plan.release_commit !== value.release_commit ||
      plan.archive_commit !== value.ancestry.archive_commit ||
      plan.remote_read_back !== true
    ) {
      fail('current public finished archive PlanRunV1 identity or remote read-back is invalid');
    }
  } else {
    if (
      plan.schema !== 1 ||
      plan.repository_id !== PUBLIC_REPOSITORY_ID ||
      plan.goal_id !== CURRENT_GOAL_ID ||
      plan.run_id !== CURRENT_PUBLIC_RUN_ID ||
      !CURRENT_PUBLIC_FINISHED_PLAN_PATH.test(plan.path) ||
      plan.status !== 'finished' ||
      plan.implementation_commit !== value.ancestry.implementation_commit ||
      plan.release_commit !== value.release_commit ||
      plan.archive_commit !== value.ancestry.archive_commit ||
      plan.red_pre_production_commit !== value.ancestry.red_pre_production_commit ||
      plan.remote_read_back !== true
    ) {
      fail('current public finished archive plan identity or remote read-back is invalid');
    }
    for (const key of ['implementation_commit', 'release_commit', 'archive_commit', 'red_pre_production_commit']) {
      assertCommit(plan[key], `current public plan ${key}`);
    }
    for (const key of ['red_receipt_sha256', 'completion_review_sha256', 'acceptance_sha256', 'verification_sha256']) {
      assertDigest(plan[key], `current public plan ${key}`);
    }
    validatePublicRedEvidence(plan.red_evidence, value.ancestry, plan);
  }
  assertTimestamp(plan.finished_at, 'current public finished plan time');
  if (Date.parse(value.created_at) >= Date.parse(plan.finished_at)) {
    fail('current public release must precede the finished archived public child');
  }

  if (publication !== null) {
    if (!record(publication) || !record(publication.value)) fail('current Session Relay publication is invalid');
    assertDigest(publication.digest, 'current Session Relay publication digest');
    if (publication.digest !== sha256(Buffer.from(canonicalize(publication.value)))) {
      fail('current Session Relay publication digest mismatch');
    }
    const staged = publication.value;
    if (
      staged.schema !== 2 ||
      staged.type !== 'SessionRelayPublicationReceiptV2' ||
      staged.repository_id !== REPOSITORY_ID ||
      staged.version !== CURRENT_VERSION ||
      staged.tag !== CURRENT_TAG ||
      staged.release_state !== 'prerelease' ||
      Date.parse(staged.created_at) >= Date.parse(value.created_at)
    ) {
      fail('current Session Relay publication is not the exact earlier staged prerelease');
    }
    const artifactPins = normalizedRelayDigestPins(
      staged.digest_evidence?.artifact_sha256,
      'current staged Relay artifact digests',
    );
    const downloadPins = normalizedRelayDigestPins(
      staged.digest_evidence?.release_download_sha256,
      'current staged Relay download digests',
    );
    const checksumPins = normalizedRelayDigestPins(
      staged.digest_evidence?.checksum_rows,
      'current staged Relay checksum rows',
    );
    if (
      canonicalize(artifactPins) !== canonicalize(downloadPins) ||
      canonicalize(artifactPins) !== canonicalize(checksumPins) ||
      canonicalize(value.pinned_assets) !== canonicalize(artifactPins)
    ) {
      fail('current public Session Relay pins disagree with independently verified staged digests');
    }
  }
  return receipt;
}

export function validatePublicReleaseReceipt(receipt, { publication = null, requestDigest = null } = {}) {
  if (
    [2, 3].includes(receipt?.value?.schema) ||
    ['PublicReleaseReceiptV2', 'PublicReleaseReceiptV3'].includes(receipt?.value?.type)
  ) {
    return validateCurrentPublicReleaseReceipt(receipt, { publication, requestDigest });
  }
  if (!record(receipt) || !record(receipt.value)) fail('public release receipt is invalid');
  assertDigest(receipt.digest, 'public release receipt digest');
  const value = receipt.value;
  exactKeys(value, PUBLIC_RELEASE_RECEIPT_KEYS, 'public release receipt');
  if (
    value.schema !== 1 ||
    value.type !== 'PublicReleaseReceiptV1' ||
    value.repository_id !== PUBLIC_REPOSITORY_ID ||
    value.tag !== LEGACY_PUBLIC_TAG ||
    value.version !== LEGACY_PUBLIC_VERSION ||
    value.companion_base_commit !== LEGACY_COMPANION_BASE_COMMIT ||
    value.ancestry_verified !== true
  )
    fail('public release receipt immutable identity conflict');
  assertDigest(value.request_sha256, 'public release receipt request digest');
  assertCommit(value.release_commit, 'public release receipt release commit');
  assertTimestamp(value.created_at, 'public release receipt creation time');
  exactKeys(value.workflow, PUBLIC_RELEASE_WORKFLOW_KEYS, 'public release receipt workflow');
  if (
    value.workflow.file !== PUBLIC_WORKFLOW ||
    value.workflow.conclusion !== 'success' ||
    !Number.isInteger(value.workflow.run_database_id) ||
    value.workflow.run_database_id <= 0 ||
    !Number.isInteger(value.workflow.run_attempt) ||
    value.workflow.run_attempt <= 0
  )
    fail('public release receipt workflow identity is invalid');
  exactKeys(value.release, PUBLIC_RELEASE_KEYS, 'public release receipt Release');
  if (!Number.isInteger(value.release.database_id) || value.release.database_id <= 0) {
    fail('public release receipt Release database identity is invalid');
  }
  assertDigest(value.release.checksums_sha256, 'public release receipt checksum digest');
  if (!Array.isArray(value.release.assets)) fail('public release receipt assets must be an array');
  for (const asset of value.release.assets) {
    exactKeys(asset, PUBLIC_RELEASE_ASSET_KEYS, 'public release receipt asset');
    if (!PUBLIC_RELEASE_ASSET_NAMES.includes(asset.name) || !Number.isInteger(asset.size) || asset.size < 0) {
      fail('public release receipt asset identity is invalid');
    }
    assertDigest(asset.digest, `public release receipt asset ${asset.name} digest`);
  }
  if (canonicalize(value.release.assets.map(({ name }) => name)) !== canonicalize(PUBLIC_RELEASE_ASSET_NAMES)) {
    fail('public release receipt has the wrong closed five-asset set');
  }
  if (
    value.release.assets[0].name !== 'SHA256SUMS' ||
    value.release.assets[0].digest !== value.release.checksums_sha256
  ) {
    fail('public release receipt checksum asset digest conflict');
  }
  exactKeys(value.npm, PUBLIC_NPM_KEYS, 'public release receipt npm');
  if (!['published', 'oidc_warning'].includes(value.npm.state)) fail('public release receipt npm state is invalid');
  validatePublicAssetPins(value.pinned_assets, 'public release receipt pinned assets');
  exactKeys(value.public_plan, PUBLIC_PLAN_KEYS, 'public release receipt public plan');
  if (!LEGACY_PUBLIC_FINISHED_PLAN_PATH.test(value.public_plan.path))
    fail('public release receipt finished plan path is invalid');
  assertCommit(value.public_plan.commit, 'public release receipt plan commit');
  assertDigest(value.public_plan.completion_receipt_sha256, 'public release receipt completion digest');
  if (requestDigest !== null && value.request_sha256 !== requestDigest)
    fail('public release receipt request digest mismatch');
  if (publication !== null && canonicalize(value.pinned_assets) !== canonicalize(publicationAssetPins(publication))) {
    fail('public release receipt pinned assets do not match the publication receipt');
  }
  return receipt;
}

function publicFileAtCommit(commit, file) {
  const encoded = file.split('/').map(encodeURIComponent).join('/');
  const response = ghJson(`/repos/${PUBLIC_REPOSITORY_ID}/contents/${encoded}?ref=${encodeURIComponent(commit)}`);
  if (response?.encoding !== 'base64' || typeof response.content !== 'string') {
    fail(`public repository file observation is invalid: ${file}`, 'failure');
  }
  return Buffer.from(response.content.replace(/\s/g, ''), 'base64');
}

function isPublicAncestor(ancestor, descendant) {
  const comparison = ghJson(`/repos/${PUBLIC_REPOSITORY_ID}/compare/${ancestor}...${descendant}`);
  return ['ahead', 'identical'].includes(comparison?.status);
}

const PUBLIC_RELEASE_ADAPTER = Object.freeze({
  now: () => new Date().toISOString(),
  getTagCommit: () => publicTagCommit(PUBLIC_TAG),
  isAncestor: isPublicAncestor,
  getFinishedPlan: (commit, planPath) => publicFileAtCommit(commit, planPath),
  listWorkflowRuns: () => {
    const response = ghJson(
      `/repos/${PUBLIC_REPOSITORY_ID}/actions/workflows/${encodeURIComponent('release-cli.yml')}/runs?branch=${encodeURIComponent(PUBLIC_TAG)}&per_page=100`,
    );
    if (!Array.isArray(response.workflow_runs) || response.total_count !== response.workflow_runs.length) {
      fail('public workflow run discovery is incomplete', 'failure');
    }
    return response.workflow_runs;
  },
  getRelease: () => ghJson(`/repos/${PUBLIC_REPOSITORY_ID}/releases/tags/${encodeURIComponent(PUBLIC_TAG)}`),
  downloadReleaseAsset: (assetId) =>
    commandRaw('gh', [
      'api',
      '-H',
      'Accept: application/octet-stream',
      `/repos/${PUBLIC_REPOSITORY_ID}/releases/assets/${assetId}`,
    ]),
  getPinnedAssets: (commit) => {
    let manifest;
    try {
      manifest = JSON.parse(publicFileAtCommit(commit, 'SoT/toolchain.json').toString('utf8'));
    } catch {
      fail('public release commit SoT/toolchain.json is not JSON');
    }
    return manifest?.tools?.['session-relay']?.assets;
  },
  getNpmState: (workflowRun) => {
    try {
      const observed = JSON.parse(command('npm', ['view', `docks-kit@${PUBLIC_VERSION}`, 'version', '--json']));
      if (observed === PUBLIC_VERSION) return 'published';
    } catch (error) {
      const logs = command('gh', ['run', 'view', String(workflowRun.id), '--repo', PUBLIC_REPOSITORY_ID, '--log']);
      if (logs.includes("::warning::npm publish failed — if the trusted publisher isn't configured yet")) {
        return 'oidc_warning';
      }
      throw error;
    }
    fail('public npm version state does not match docks-kit release');
  },
});

export function verifyPublicRelease(options, injectedAdapter = undefined) {
  const adapter = checkedOperations(
    injectedAdapter ?? PUBLIC_RELEASE_ADAPTER,
    PUBLIC_RELEASE_ADAPTER_KEYS,
    'public release dependency adapter',
  );
  const publication = validateStandalonePublication(
    readCanonical(
      options.get('publication'),
      options.get('publication-sha256'),
      [
        { schema: 1, type: 'SessionRelayPublicationReceiptV1' },
        { schema: 2, type: 'SessionRelayPublicationReceiptV2' },
      ],
      '--publication',
    ),
    'publication receipt',
  );
  const request = validatePublicRequest(
    readCanonical(options.get('request'), options.get('request-sha256'), 'PublicReleaseRequestV1', '--request'),
    publication,
    null,
  );
  const releaseCommit = options.get('public-release-commit');
  assertCommit(releaseCommit, '--public-release-commit');
  const completionDigest = options.get('public-completion-sha256');
  assertDigest(completionDigest, '--public-completion-sha256');
  const planCommit = options.get('public-plan-commit');
  assertCommit(planCommit, '--public-plan-commit');
  const finishedPlanPath = options.get('public-finished-plan');
  const currentPublication = publication.value.schema === 2;
  const finishedPlanPattern = currentPublication ? CURRENT_PUBLIC_FINISHED_PLAN_PATH : LEGACY_PUBLIC_FINISHED_PLAN_PATH;
  if (!finishedPlanPattern.test(finishedPlanPath ?? '')) {
    const planName = currentPublication ? CURRENT_PUBLIC_PLAN_BASENAME : 'session-relay-cli-0.13.0-production-release';
    fail(`--public-finished-plan must be the dated ${planName} finished-plan path`);
  }
  if (adapter.getTagCommit() !== releaseCommit) fail('public tag commit does not match --public-release-commit');

  let planBytes;
  let evidence = null;
  if (currentPublication) {
    planBytes = adapter.getFinishedPlan(planCommit, finishedPlanPath);
    if (/^Plan-run: /m.test(planBytes.toString('utf8'))) {
      evidence = verifyCurrentPublicPlanRun(adapter, planBytes, {
        companionBaseCommit: request.value.companion_base_commit,
        completionDigest,
        finishedPlanPath,
        planCommit,
        releaseCommit,
      });
    } else {
      evidence = verifyCurrentPublicEvidenceBindings(adapter, currentPublicReleaseEvidence(planBytes), {
        companionBaseCommit: request.value.companion_base_commit,
        completionDigest,
        finishedPlanPath,
        planCommit,
        releaseCommit,
      });
      finishedPlanCompletion(planBytes, completionDigest, evidence.public_plan.implementation_commit);
    }
  } else {
    if (!adapter.isAncestor(request.value.companion_base_commit, releaseCommit)) {
      fail('public release commit fails companion base ancestry');
    }
    if (!adapter.isAncestor(releaseCommit, planCommit)) {
      fail('public finished-plan commit fails release commit ancestry');
    }
    planBytes = adapter.getFinishedPlan(planCommit, finishedPlanPath);
    finishedPlanCompletion(planBytes, completionDigest, releaseCommit);
  }

  const publicTag = currentPublication ? PUBLIC_TAG : LEGACY_PUBLIC_TAG;
  const publicVersion = currentPublication ? PUBLIC_VERSION : LEGACY_PUBLIC_VERSION;
  const run = successfulPublicWorkflowRun(adapter.listWorkflowRuns(), releaseCommit, publicTag);
  const releaseObservation = adapter.getRelease();
  const release = downloadedPublicRelease(adapter, releaseObservation, publicTag);
  const pinnedAssets = adapter.getPinnedAssets(releaseCommit);
  validatePublicAssetPins(pinnedAssets, 'public release commit pinned assets');
  if (canonicalize(pinnedAssets) !== canonicalize(request.value.assets)) {
    fail('public release commit pinned asset digest mismatch');
  }
  const npmState = adapter.getNpmState(run);
  const planRunReceipt = currentPublication && evidence.public_plan.plan_run !== undefined;
  const receipt = currentPublication
    ? {
        schema: planRunReceipt ? 3 : 2,
        type: planRunReceipt ? 'PublicReleaseReceiptV3' : 'PublicReleaseReceiptV2',
        request_sha256: request.digest,
        repository_id: PUBLIC_REPOSITORY_ID,
        tag: publicTag,
        version: publicVersion,
        release_commit: releaseCommit,
        companion_base_commit: request.value.companion_base_commit,
        ancestry: evidence.ancestry,
        workflow: {
          file: PUBLIC_WORKFLOW,
          run_database_id: run.id,
          run_attempt: run.run_attempt,
          conclusion: 'success',
        },
        release,
        npm: { package: 'docks-kit', state: npmState, version: publicVersion },
        pinned_assets: pinnedAssets,
        public_plan: evidence.public_plan,
        created_at: currentPublicReleaseTimestamp(releaseObservation),
      }
    : {
        schema: 1,
        type: 'PublicReleaseReceiptV1',
        request_sha256: request.digest,
        repository_id: PUBLIC_REPOSITORY_ID,
        tag: publicTag,
        version: publicVersion,
        release_commit: releaseCommit,
        companion_base_commit: request.value.companion_base_commit,
        ancestry_verified: true,
        workflow: {
          file: PUBLIC_WORKFLOW,
          run_database_id: run.id,
          run_attempt: run.run_attempt,
          conclusion: 'success',
        },
        release,
        npm: { state: npmState },
        pinned_assets: pinnedAssets,
        public_plan: {
          path: finishedPlanPath,
          commit: planCommit,
          completion_receipt_sha256: completionDigest,
        },
        created_at: adapter.now(),
      };
  validatePublicReleaseReceipt(
    { value: receipt, digest: sha256(Buffer.from(canonicalize(receipt))) },
    { publication, requestDigest: request.digest },
  );
  return emitReceipt(options, receipt);
}

function validatePublication(publication, proof) {
  if (!record(publication) || !record(publication.value)) fail('publication receipt is invalid');
  assertDigest(publication.digest, 'publication receipt digest');
  validatePublicationReceipt(publication, proof, 'publication receipt');
  if (publication.value.release_state !== 'prerelease') fail('publication receipt is not the bound prerelease');
  assertTimestamp(publication.value.created_at, 'publication receipt creation time');
}
function validateProofBinding(proof) {
  if (!record(proof) || !record(proof.value)) fail('source proof is invalid');
  assertDigest(proof.digest, 'source proof digest');
  if (
    [2, 3].includes(proof.value.schema) ||
    ['SourcePreparationProofV2', 'SourcePreparationProofV3'].includes(proof.value.type)
  ) {
    validateSourcePreparationProof(proof.value);
    return;
  }
  assertCommit(proof.value.tag_commit, 'TAG_COMMIT');
  assertCommit(proof.value.shipped_commit, 'SHIPPED_COMMIT');
  assertCommit(proof.value.promoted_commit, 'PROMOTED_COMMIT');
  exactKeys(
    proof.value.source_ancestry,
    ['source_commit', 'evidence_commit', 'shipped_commit', 'verified'],
    'source ancestry proof',
  );
  if (
    proof.value.source_ancestry.source_commit !== proof.value.tag_commit ||
    proof.value.source_ancestry.shipped_commit !== proof.value.shipped_commit ||
    proof.value.source_ancestry.verified !== true
  )
    fail('source ancestry proof is absent');
  exactKeys(
    proof.value.non_plan_tree_equivalence,
    ['source_commit', 'shipped_commit', 'excluded_paths', 'verified'],
    'non-plan tree-equivalence proof',
  );
  const excludedPaths = proof.value.non_plan_tree_equivalence.excluded_paths;
  if (
    proof.value.non_plan_tree_equivalence.source_commit !== proof.value.tag_commit ||
    proof.value.non_plan_tree_equivalence.shipped_commit !== proof.value.shipped_commit ||
    proof.value.non_plan_tree_equivalence.verified !== true ||
    !Array.isArray(excludedPaths) ||
    excludedPaths.some((item) => typeof item !== 'string' || item === '') ||
    new Set(excludedPaths).size !== excludedPaths.length ||
    canonicalize(excludedPaths) !== canonicalize([...excludedPaths].sort())
  )
    fail('non-plan tree-equivalence proof is absent');
  if (proof.value.public_repository_id !== PUBLIC_REPOSITORY_ID) fail('public repository identity mismatch');
  assertCommit(proof.value.public_reviewed_commit, 'public reviewed commit');
}

function validatePromotionPublicRelease(publicRelease, proof, publication, adapter) {
  validatePublicReleaseReceipt(publicRelease, { publication });
  if ([2, 3].includes(publicRelease.value.schema)) {
    const publicPlan =
      publicRelease.value.schema === 3 ? publicRelease.value.public_plan.plan_run : publicRelease.value.public_plan;
    if (
      publicRelease.value.repository_id !== proof.value.companion.repository_id ||
      publicPlan.goal_id !== proof.value.companion.goal_id ||
      publicPlan.run_id !== proof.value.companion.run_id ||
      publicPlan.implementation_commit !== publicRelease.value.ancestry.implementation_commit
    ) {
      fail('current public release receipt does not bind the reviewed companion PlanRunV1 identity');
    }
    if (!adapter.isPublicAncestor(publicRelease.value.companion_base_commit, publicRelease.value.release_commit)) {
      fail('current public release commit has no reviewed execution-parent ancestor');
    }
    return publicRelease;
  }
  if (
    publicRelease.value.repository_id !== proof.value.public_repository_id ||
    publicRelease.value.companion_base_commit !== proof.value.public_reviewed_commit
  )
    fail('public release receipt does not bind the reviewed companion identity');
  if (!adapter.isPublicAncestor(proof.value.public_reviewed_commit, publicRelease.value.release_commit)) {
    fail('public release commit has no reviewed companion ancestor');
  }
  return publicRelease;
}

function isCurrentSourceProof(proof) {
  return (
    [2, 3].includes(proof?.value?.schema) ||
    ['SourcePreparationProofV2', 'SourcePreparationProofV3'].includes(proof?.value?.type)
  );
}

function assertCurrentPromotionRefsAbsent(adapter) {
  for (const ref of [CURRENT_TRANSACTION_REF, CURRENT_LOCK_REF]) {
    if (adapter.remoteRef(ref) !== null) {
      fail(`current stable promotion conflicts with existing authority ref ${ref}; retries are not permitted`);
    }
  }
}

function validateCurrentRemoteAuthority(adapter, proof, publicRelease, options) {
  const expectedMain = options.get('expected-origin-main');
  assertCommit(expectedMain, '--expected-origin-main');
  if (expectedMain !== proof.value.implementation_commit) {
    fail('current expected origin/main is not the reviewed implementation commit');
  }
  if (adapter.remoteRef('refs/heads/main') !== expectedMain) {
    fail('current authoritative origin/main does not match the reviewed implementation commit');
  }

  const sourceAncestry =
    proof.value.schema === 3
      ? [
          [proof.value.tag_commit, proof.value.source_commit, 'tag-to-source'],
          [proof.value.source_commit, proof.value.implementation_commit, 'source-to-implementation'],
        ]
      : [
          [proof.value.source_commit, proof.value.tdd_red.pre_production_commit, 'source-to-red'],
          [proof.value.tdd_red.pre_production_commit, proof.value.implementation_commit, 'red-to-implementation'],
          [proof.value.implementation_commit, proof.value.tag_commit, 'reviewed-implementation-to-tag'],
        ];
  for (const [ancestor, descendant, label] of sourceAncestry) {
    if (adapter.isAncestor(ancestor, descendant) !== true) {
      fail(`current ${label} ancestry was not independently observed`);
    }
  }

  const ancestry = publicRelease.value.ancestry;
  const publicAncestry =
    publicRelease.value.schema === 3
      ? [
          [ancestry.execution_parent, ancestry.implementation_commit, 'public-execution-parent-to-implementation'],
          [ancestry.implementation_commit, ancestry.release_commit, 'public-implementation-to-release'],
          [ancestry.release_commit, ancestry.archive_commit, 'public-release-to-archive'],
        ]
      : [
          [ancestry.red_pre_production_commit, ancestry.implementation_commit, 'public-red-to-implementation'],
          [ancestry.execution_parent, ancestry.implementation_commit, 'public-execution-parent-to-implementation'],
          [ancestry.implementation_commit, ancestry.release_commit, 'public-implementation-to-release'],
          [ancestry.release_commit, ancestry.archive_commit, 'public-release-to-archive'],
        ];
  for (const [ancestor, descendant, label] of publicAncestry) {
    if (adapter.isPublicAncestor(ancestor, descendant) !== true) {
      fail(`current ${label} ancestry was not independently observed`);
    }
  }

  assertCurrentPromotionRefsAbsent(adapter);
  return expectedMain;
}

function sortedPromotionAssets(assets) {
  return structuredClone(assets).sort((left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0));
}

function currentReleaseSnapshot(state, publication, expectedPrerelease, label) {
  if (!record(state) || !record(state.release)) fail(`${label} observation is invalid`);
  const release = state.release;
  const expectedBody = expectedPrerelease ? CURRENT_PRERELEASE_BODY : CURRENT_STABLE_BODY;
  if (
    state.commit !== publication.value.tag_commit ||
    release.tag_name !== CURRENT_TAG ||
    release.draft !== false ||
    release.prerelease !== expectedPrerelease ||
    release.id !== publication.value.release_database_id ||
    release.body !== expectedBody
  ) {
    fail(`${label} tag, database ID, state, or body conflicts with the exact reviewed release`);
  }
  const assets = normalizedAssets(release);
  validateAssets(assets, `${label} assets`, true);
  const publicationAssets = sortedPromotionAssets(publication.value.assets);
  if (canonicalize(assets) !== canonicalize(publicationAssets)) {
    fail(`${label} asset IDs, sizes, or digests drifted from the staged publication`);
  }
  return {
    release_database_id: release.id,
    tag_commit: state.commit,
    workflow_run_id: publication.value.workflow.run_id,
    workflow_run_attempt: publication.value.workflow.attempt,
    prerelease: expectedPrerelease,
    assets,
  };
}

function currentPromotionReceipt(proof, publication, publicRelease, stagedRelease, stableRelease, completedAt) {
  const planRunReceipt = publicRelease.value.schema === 3;
  const publicPlan = planRunReceipt ? publicRelease.value.public_plan.plan_run : publicRelease.value.public_plan;
  const publicChild = {
    repository_id: publicRelease.value.repository_id,
    goal_id: publicPlan.goal_id,
    run_id: publicPlan.run_id,
    version: publicRelease.value.version,
    tag: publicRelease.value.tag,
    npm_package: publicRelease.value.npm.package,
    npm_version: publicRelease.value.npm.version,
    plan_path: planRunReceipt ? publicRelease.value.public_plan.finished_path : publicPlan.path,
    status: planRunReceipt ? 'finished' : publicPlan.status,
    ...(planRunReceipt
      ? { planrun_verified: true }
      : { red_first_verified: publicPlan.red_evidence.ordered_before_implementation }),
    finished_at: planRunReceipt ? publicRelease.value.public_plan.finished_at : publicPlan.finished_at,
  };
  return {
    schema: planRunReceipt ? 3 : 2,
    type: planRunReceipt ? 'PromotionReceiptV3' : 'PromotionReceiptV2',
    repository_id: REPOSITORY_ID,
    version: CURRENT_VERSION,
    tag: CURRENT_TAG,
    source_proof_sha256: proof.digest,
    reviewed_source_commit: proof.value.implementation_commit,
    reviewed_source_ancestry: true,
    docks_plan: {
      repository_id: proof.value.plan_run.repository_id,
      goal_id: proof.value.plan_run.goal_id,
      run_id: proof.value.plan_run.run_id,
      plan_path: proof.value.plan_run.plan_path,
      implementation_commit: proof.value.plan_run.implementation_commit,
      completion_review_sha256: proof.value.completion_review.result_sha256,
      status: proof.value.plan_run.status,
    },
    publication_receipt_sha256: publication.digest,
    public_release_receipt_sha256: publicRelease.digest,
    public_child: publicChild,
    staged_release: stagedRelease,
    stable_release: stableRelease,
    byte_identical_promotion: true,
    historical_receipts: {
      version: HISTORICAL_RELAY_VERSION,
      tag: HISTORICAL_RELAY_TAG,
      publication_sha256: HISTORICAL_PUBLICATION_SHA256,
      public_request_sha256: HISTORICAL_PUBLIC_REQUEST_SHA256,
    },
    outcome: 'success',
    completed_at: completedAt,
  };
}

function promoteCurrentReviewed(options, resume, adapter, proof) {
  if (
    resume ||
    options.has('transaction-ref') ||
    options.has('retry-failed') ||
    options.has('retry-failed-sha256') ||
    options.get('repair-prepush') === true ||
    options.has('repair-implementation-commit')
  ) {
    fail('current stable promotion is single-shot and cannot resume, retry, or repair a legacy journal');
  }
  if (options.get('docks-kit-release') !== CURRENT_DOCKS_KIT_RELEASE) {
    fail(`--docks-kit-release must be ${CURRENT_DOCKS_KIT_RELEASE}`);
  }
  if (proof.digest !== sha256(Buffer.from(canonicalize(proof.value)))) {
    fail('current source proof digest mismatch');
  }
  validateProofBinding(proof);

  const publication = adapter.loadPublication(options);
  validatePublication(publication, proof);
  if (publication.value.schema !== 2 || publication.value.type !== 'SessionRelayPublicationReceiptV2') {
    fail('current stable promotion requires the exact V2 prerelease publication receipt');
  }
  const publicRelease = adapter.loadPublicRelease(options);
  validatePromotionPublicRelease(publicRelease, proof, publication, adapter);
  if (
    ![2, 3].includes(publicRelease.value.schema) ||
    !['PublicReleaseReceiptV2', 'PublicReleaseReceiptV3'].includes(publicRelease.value.type)
  ) {
    fail('current stable promotion requires a current public release receipt');
  }

  const expectedMain = validateCurrentRemoteAuthority(adapter, proof, publicRelease, options);
  adapter.assertReceiptOutputAvailable({ path: options.get('receipt-out') });
  const stagedRelease = currentReleaseSnapshot(
    adapter.currentReleaseState(),
    publication,
    true,
    'current staged prerelease',
  );

  adapter.promoteStable({
    tag: CURRENT_TAG,
    releaseDatabaseId: stagedRelease.release_database_id,
    body: CURRENT_STABLE_BODY,
  });

  if (adapter.remoteRef('refs/heads/main') !== expectedMain) {
    fail('current authoritative origin/main changed during stable promotion');
  }
  assertCurrentPromotionRefsAbsent(adapter);
  const stableRelease = currentReleaseSnapshot(
    adapter.currentReleaseState(),
    publication,
    false,
    'current stable release',
  );
  const receipt = currentPromotionReceipt(
    proof,
    publication,
    publicRelease,
    stagedRelease,
    stableRelease,
    adapter.now(),
  );
  validateCurrentPromotionReceipt(receipt);
  return invocationResult(adapter, options, receipt, false);
}

function validateCompatibility(value, label) {
  exactKeys(value, COMPATIBILITY_KEYS, label);
  if (
    !Array.isArray(value.paths) ||
    value.paths.length === 0 ||
    canonicalize(value.paths) !== canonicalize([...value.paths].sort())
  )
    fail(`${label} paths must be a nonempty sorted array`);
  if (
    new Set(value.paths).size !== value.paths.length ||
    value.paths.some((item) => typeof item !== 'string' || item === '')
  )
    fail(`${label} paths must be unique strings`);
  assertBlobMap(value.before, `${label} before`);
  assertBlobMap(value.promoted, `${label} promoted`);
  assertBlobMap(value.current, `${label} current`);
  assertBlobMap(value.restored, `${label} restored`, true);
  assertBlobMap(value.reapplied, `${label} reapplied`, true);
  if (
    !Array.isArray(value.unexpected_paths) ||
    canonicalize(value.unexpected_paths) !== canonicalize([...value.unexpected_paths].sort()) ||
    new Set(value.unexpected_paths).size !== value.unexpected_paths.length ||
    value.unexpected_paths.some((item) => typeof item !== 'string' || item === '' || value.paths.includes(item))
  ) {
    fail(`${label} unexpected paths are invalid`);
  }
  for (const name of ['before', 'promoted', 'current']) {
    if (canonicalize(Object.keys(value[name]).sort()) !== canonicalize(value.paths))
      fail(`${label} ${name} map does not match its paths`);
  }
  for (const name of ['restored', 'reapplied']) {
    if (value[name] !== null && canonicalize(Object.keys(value[name]).sort()) !== canonicalize(value.paths))
      fail(`${label} ${name} map does not match its paths`);
  }
}

function validatePostRestore(value, label) {
  if (value === null) return;
  exactKeys(value, POST_RESTORE_KEYS, label);
  if (value.manifest_catalog !== true || !Number.isInteger(value.full_ci_exit) || value.full_ci_exit !== 0)
    fail(`${label} parity or CI result is invalid`);
  assertDigest(value.full_ci_stdout_sha256, `${label} stdout digest`);
  assertDigest(value.full_ci_stderr_sha256, `${label} stderr digest`);
}

function validateSmoke(value, label) {
  if (value === null) return;
  exactKeys(value, SMOKE_KEYS, label);
  if (!['exact_source', 'live'].includes(value.kind)) fail(`${label} kind is invalid`);
  for (const key of [
    'isolation_root_sha256',
    'stdout_sha256',
    'stderr_sha256',
    'ordering_log_sha256',
    'installed_binary_sha256',
    'launcher_sha256',
  ]) {
    assertDigest(value[key], `${label} ${key}`);
  }
  if (!Array.isArray(value.sync_argv) || value.sync_argv.some((item) => typeof item !== 'string'))
    fail(`${label} sync argv is invalid`);
  if (value.kind === 'live' && canonicalize(value.sync_argv) !== canonicalize(['sync']))
    fail(`${label} live sync argv is invalid`);
  const exactSourceArgv =
    canonicalize(value.sync_argv) === canonicalize(['sync']) ||
    (value.sync_argv.length === 3 &&
      value.sync_argv[0] === 'sync' &&
      value.sync_argv[1] === '--release-test-source' &&
      COMMIT.test(value.sync_argv[2]));
  if (value.kind === 'exact_source' && !exactSourceArgv) fail(`${label} exact-source sync argv is invalid`);
  if (typeof value.session_relay_asset_name !== 'string' || value.session_relay_asset_name === '')
    fail(`${label} Session Relay asset name is invalid`);
  if (typeof value.installed_version !== 'string' || typeof value.launcher_version !== 'string')
    fail(`${label} version evidence is invalid`);
  assertCommit(value.docks_kit_target_commit, `${label} docks-kit target commit`);
  if (!Number.isInteger(value.docks_kit_release_database_id) || value.docks_kit_release_database_id <= 0)
    fail(`${label} docks-kit release ID is invalid`);
  validateAssets([value.docks_kit_asset], `${label} docks-kit`);
}

function validateState(value, label) {
  exactKeys(value, STATE_KEYS, label);
  assertCommit(value.origin_main, `${label} origin_main`, true);
  for (const key of ['pushed_commit', 'restore_commit', 'reapply_commit'])
    assertCommit(value[key], `${label} ${key}`, true);
  assertCommit(value.observed_lock, `${label} observed lock`, true);
  if (value.observed_release !== null) {
    exactKeys(value.observed_release, LIVE_RELEASE_KEYS, `${label} observed Release`);
    if (value.observed_release.repository_id !== REPOSITORY_ID || value.observed_release.tag !== LEGACY_PROMOTION_TAG)
      fail(`${label} observed Release repository or tag identity is invalid`);
    assertCommit(value.observed_release.commit, `${label} observed Release commit`, true);
    const absent =
      value.observed_release.release_database_id === null &&
      value.observed_release.prerelease === null &&
      Array.isArray(value.observed_release.assets) &&
      value.observed_release.assets.length === 0;
    const present =
      Number.isInteger(value.observed_release.release_database_id) &&
      value.observed_release.release_database_id > 0 &&
      typeof value.observed_release.prerelease === 'boolean';
    if (!absent && !present) fail(`${label} observed Release state is invalid`);
    validateAssets(value.observed_release.assets, `${label} observed Release assets`, false, true);
  }
  validateCompatibility(value.compatibility, `${label} compatibility`);
  validateSmoke(value.prepush_smoke, `${label} prepush smoke`);
  validateSmoke(value.live_smoke, `${label} live smoke`);
  validatePostRestore(value.post_restore, `${label} post-restore`);
  if (value.failure !== null && (typeof value.failure !== 'string' || value.failure === ''))
    fail(`${label} failure must be a nonempty string or null`);
}

function validatePrepushRepair(value, label) {
  if (value === null) return;
  exactKeys(value, PREPUSH_REPAIR_KEYS, label);
  assertCommit(value.base_commit, `${label} base commit`);
  assertCommit(value.commit, `${label} commit`);
  if (
    !Array.isArray(value.paths) ||
    value.paths.some((item) => typeof item !== 'string') ||
    canonicalize(value.paths) !== canonicalize(PREPUSH_REPAIR_PATHS)
  )
    fail(`${label} paths are invalid`);
  if (value.full_ci_exit !== 0) fail(`${label} full CI did not pass`);
  assertDigest(value.full_ci_stdout_sha256, `${label} full CI stdout digest`);
  assertDigest(value.full_ci_stderr_sha256, `${label} full CI stderr digest`);
}

function sameImmutable(left, right, allowPriorReceiptChange = false, allowRepairChange = false) {
  const leftCopy = { prepush_repair: null, ...clone(left) };
  const rightCopy = { prepush_repair: null, ...clone(right) };
  if (allowPriorReceiptChange) {
    delete leftCopy.prior_attempt_receipt_sha256;
    delete rightCopy.prior_attempt_receipt_sha256;
  }
  if (allowRepairChange) {
    delete leftCopy.prepush_repair;
    delete rightCopy.prepush_repair;
  }
  return canonicalize(leftCopy) === canonicalize(rightCopy);
}

function legalTransition(attempt, previous, next, immutable) {
  if (next === 'manual_incident') return !TERMINAL_PHASES.has(previous);
  if (next === 'terminal_failure') return !TERMINAL_PHASES.has(previous) && previous !== 'live_passed';
  const primary = attempt === 0 || (immutable.prepush_repair ?? null) !== null;
  const allowed = primary
    ? {
        initialized: ['locked'],
        locked: ['prepush_passed'],
        prepush_passed: ['main_pushed'],
        main_pushed: ['live_passed', 'restore_pushed'],
        live_passed: ['terminal_success'],
        restore_pushed: ['terminal_failure'],
      }
    : {
        initialized: ['locked'],
        locked: ['reapply_pushed'],
        reapply_pushed: ['terminal_success', 'restore_pushed'],
        restore_pushed: ['terminal_failure'],
      };
  return (allowed[previous] ?? []).includes(next);
}

function validateImmutable(value) {
  exactKeys(
    value,
    Object.hasOwn(value, 'prepush_repair') ? IMMUTABLE_KEYS : IMMUTABLE_KEYS.filter((key) => key !== 'prepush_repair'),
    'journal immutable identities',
  );
  if (
    value.repository_id !== REPOSITORY_ID ||
    value.version !== LEGACY_PROMOTION_VERSION ||
    value.transaction_ref !== LEGACY_PROMOTION_TRANSACTION_REF ||
    value.lock_ref !== LEGACY_PROMOTION_LOCK_REF ||
    value.docks_kit_repository !== PUBLIC_REPOSITORY_ID ||
    value.docks_kit_release !== LEGACY_PROMOTION_DOCKS_KIT_RELEASE
  ) {
    fail('journal immutable fixed identity mismatch');
  }
  for (const key of [
    'source_proof_sha256',
    'publication_receipt_sha256',
    'publication_assets_sha256',
    'public_release_receipt_sha256',
  ]) {
    assertDigest(value[key], `journal immutable ${key}`);
  }
  for (const key of [
    'tag_commit',
    'promoted_commit',
    'expected_origin_main',
    'lock_commit',
    'public_reviewed_commit',
    'public_release_commit',
  ]) {
    assertCommit(value[key], `journal immutable ${key}`);
  }
  if (value.public_repository_id !== PUBLIC_REPOSITORY_ID)
    fail('journal immutable public repository identity mismatch');
  if (!/^[0-9a-f]{32}$/.test(value.lock_nonce ?? '')) fail('journal immutable lock nonce is invalid');
  if (!Number.isInteger(value.publication_release_id) || value.publication_release_id <= 0)
    fail('journal immutable publication release ID is invalid');
  assertDigest(value.prior_attempt_receipt_sha256, 'journal immutable prior receipt digest', true);
  if (
    value.prepush_repair !== undefined &&
    value.prepush_repair !== null &&
    value.prepush_repair.base_commit !== value.expected_origin_main
  )
    fail('journal immutable pre-push repair base does not match expected origin/main');
  validatePrepushRepair(value.prepush_repair ?? null, 'journal immutable pre-push repair');
}

function validateProjection(value, label) {
  exactKeys(value, PROJECTION_KEYS, label);
  if (!OUTCOMES.has(value.outcome) || typeof value.retryable !== 'boolean') fail(`${label} outcome is invalid`);
  exactKeys(value.terminal_key, ['attempt', 'sequence'], `${label} terminal key`);
  if (
    !Number.isInteger(value.attempt) ||
    value.attempt < 0 ||
    value.attempt > 1 ||
    !Number.isInteger(value.terminal_key.attempt) ||
    !Number.isInteger(value.terminal_key.sequence) ||
    value.terminal_key.attempt !== value.attempt
  )
    fail(`${label} terminal key is invalid`);
  for (const key of ['source_proof_sha256', 'publication_receipt_sha256', 'public_release_receipt_sha256']) {
    assertDigest(value[key], `${label} ${key}`);
  }
  for (const key of [
    'tag_commit',
    'promoted_commit',
    'lock_commit',
    'expected_origin_main',
    'public_reviewed_commit',
    'public_release_commit',
    'public_tag_commit',
  ]) {
    assertCommit(value[key], `${label} ${key}`);
  }
  assertCommit(value.observed_origin_main, `${label} observed_origin_main`, value.outcome === 'manual_incident');
  for (const key of ['prepush_commit', 'pushed_commit', 'restore_commit', 'reapply_commit'])
    assertCommit(value[key], `${label} ${key}`, true);
  assertDigest(value.prior_attempt_receipt_sha256, `${label} prior receipt digest`, true);
  if (
    value.repository_id !== REPOSITORY_ID ||
    value.version !== LEGACY_PROMOTION_VERSION ||
    value.transaction_ref !== LEGACY_PROMOTION_TRANSACTION_REF ||
    value.lock_ref !== LEGACY_PROMOTION_LOCK_REF ||
    value.public_repository_id !== PUBLIC_REPOSITORY_ID ||
    !/^[0-9a-f]{32}$/.test(value.lock_nonce ?? '') ||
    !Number.isInteger(value.publication_release_id) ||
    value.publication_release_id <= 0
  )
    fail(`${label} fixed identity is invalid`);
  exactKeys(
    value.source_ancestry,
    ['source_commit', 'evidence_commit', 'shipped_commit', 'verified'],
    `${label} source ancestry`,
  );
  for (const key of ['source_commit', 'evidence_commit', 'shipped_commit'])
    assertCommit(value.source_ancestry[key], `${label} source ancestry ${key}`);
  if (value.source_ancestry.source_commit !== value.tag_commit || value.source_ancestry.verified !== true)
    fail(`${label} source ancestry identity is invalid`);
  exactKeys(
    value.non_plan_tree_equivalence,
    ['source_commit', 'shipped_commit', 'excluded_paths', 'verified'],
    `${label} tree equivalence`,
  );
  const excludedPaths = value.non_plan_tree_equivalence.excluded_paths;
  if (
    value.non_plan_tree_equivalence.source_commit !== value.tag_commit ||
    value.non_plan_tree_equivalence.shipped_commit !== value.source_ancestry.shipped_commit ||
    value.non_plan_tree_equivalence.verified !== true ||
    !Array.isArray(excludedPaths) ||
    excludedPaths.some((item) => typeof item !== 'string' || item === '') ||
    new Set(excludedPaths).size !== excludedPaths.length ||
    canonicalize(excludedPaths) !== canonicalize([...excludedPaths].sort())
  )
    fail(`${label} tree equivalence identity is invalid`);
  if (
    !Array.isArray(value.compatibility_paths) ||
    canonicalize(value.compatibility_paths) !== canonicalize([...value.compatibility_paths].sort()) ||
    new Set(value.compatibility_paths).size !== value.compatibility_paths.length
  )
    fail(`${label} compatibility paths are invalid`);
  exactKeys(value.compatibility_blobs, COMPATIBILITY_BLOB_KEYS, `${label} compatibility blobs`);
  for (const key of COMPATIBILITY_BLOB_KEYS) {
    assertBlobMap(
      value.compatibility_blobs[key],
      `${label} compatibility ${key}`,
      ['restored', 'reapplied'].includes(key),
    );
    if (
      value.compatibility_blobs[key] !== null &&
      canonicalize(Object.keys(value.compatibility_blobs[key]).sort()) !== canonicalize(value.compatibility_paths)
    )
      fail(`${label} compatibility ${key} paths mismatch`);
  }
  exactKeys(value.docks_kit, DOCKS_KIT_KEYS, `${label} docks-kit`);
  if (
    value.docks_kit.repository_id !== PUBLIC_REPOSITORY_ID ||
    value.docks_kit.release !== LEGACY_PROMOTION_DOCKS_KIT_RELEASE ||
    value.docks_kit.target_commit !== value.public_release_commit ||
    value.public_tag_commit !== value.public_release_commit
  )
    fail(`${label} docks-kit or public release identity is invalid`);
  assertCommit(value.docks_kit.target_commit, `${label} docks-kit target commit`);
  if (
    value.docks_kit.release_database_id !== null &&
    (!Number.isInteger(value.docks_kit.release_database_id) || value.docks_kit.release_database_id <= 0)
  )
    fail(`${label} docks-kit release ID is invalid`);
  if ((value.docks_kit.release_database_id === null) !== (value.docks_kit.asset === null))
    fail(`${label} docks-kit evidence nullability is invalid`);
  if (value.docks_kit.asset !== null) validateAssets([value.docks_kit.asset], `${label} docks-kit`);
  validateAssets(value.session_relay_assets, `${label} Session Relay`, true);
  validateSmoke(value.exact_source_smoke, `${label} exact-source smoke`);
  validateSmoke(value.live_smoke, `${label} live smoke`);
  if (value.exact_source_smoke !== null) {
    const legacyExactSource =
      value.exact_source_smoke.sync_argv.length === 3 && value.exact_source_smoke.sync_argv[2] === value.tag_commit;
    const repairedExactSource = canonicalize(value.exact_source_smoke.sync_argv) === canonicalize(['sync']);
    if (
      value.exact_source_smoke.kind !== 'exact_source' ||
      (!legacyExactSource && !repairedExactSource) ||
      value.exact_source_smoke.docks_kit_target_commit !== value.public_release_commit
    )
      fail(`${label} exact-source smoke binding is invalid`);
    if (value.outcome === 'success' && !repairedExactSource && value.attempt !== 1)
      fail(`${label} successful exact-source smoke must use the URL-rewrite sync binding`);
    if (['success', 'restored_failure'].includes(value.outcome)) {
      const hostAsset = value.session_relay_assets.find(
        ({ name }) => name === value.exact_source_smoke.session_relay_asset_name,
      );
      if (
        !hostAsset ||
        value.exact_source_smoke.installed_binary_sha256 !== hostAsset.digest ||
        canonicalize(value.exact_source_smoke.docks_kit_asset) !== canonicalize(value.docks_kit.asset) ||
        value.exact_source_smoke.installed_version !== `session-relay ${LEGACY_PROMOTION_VERSION}` ||
        value.exact_source_smoke.launcher_version !== `session-relay ${LEGACY_PROMOTION_VERSION}`
      )
        fail(`${label} exact-source installed identity is not the bound reviewed asset`);
    }
  }
  if (value.live_smoke !== null) {
    const hostAsset = value.session_relay_assets.find(({ name }) => name === value.live_smoke.session_relay_asset_name);
    if (value.live_smoke.kind !== 'live' || value.live_smoke.docks_kit_target_commit !== value.public_release_commit)
      fail(`${label} live smoke binding is invalid`);
    const liveDocksKitMatches = canonicalize(value.live_smoke.docks_kit_asset) === canonicalize(value.docks_kit.asset);
    const exactLauncherMatches =
      value.exact_source_smoke !== null &&
      value.live_smoke.launcher_sha256 === value.exact_source_smoke.launcher_sha256 &&
      value.live_smoke.launcher_version === value.exact_source_smoke.launcher_version;
    if (
      value.outcome === 'success' &&
      (!hostAsset ||
        value.live_smoke.installed_binary_sha256 !== hostAsset.digest ||
        !exactLauncherMatches ||
        !liveDocksKitMatches)
    )
      fail(`${label} live launcher, docks-kit, or installed binary identity is invalid`);
  }
  validatePostRestore(value.post_restore, `${label} post-restore`);
  if (
    ['success', 'restored_failure'].includes(value.outcome) &&
    (value.exact_source_smoke === null || value.live_smoke === null || value.docks_kit.asset === null)
  )
    fail(`${label} terminal evidence is incomplete`);
  if (
    value.outcome === 'restored_failure' &&
    (value.restore_commit === null || value.compatibility_blobs.restored === null || value.post_restore === null)
  )
    fail(`${label} restored failure evidence is incomplete`);
  if (value.retryable !== (value.outcome === 'restored_failure' && value.attempt === 0))
    fail(`${label} retryability is invalid`);
  assertTimestamp(value.created_at, `${label} creation time`);
}

function knownLegacyPrepushFailure(projection, state) {
  const smoke = projection?.exact_source_smoke;
  return (
    projection?.outcome === 'failure' &&
    projection.retryable === false &&
    projection.pushed_commit === null &&
    projection.restore_commit === null &&
    projection.reapply_commit === null &&
    projection.live_smoke === null &&
    smoke !== null &&
    canonicalize(smoke?.sync_argv) === canonicalize(['sync', '--release-test-source', projection.tag_commit]) &&
    smoke.installed_binary_sha256 === EMPTY_SHA256 &&
    smoke.launcher_sha256 === EMPTY_SHA256 &&
    smoke.installed_version === '' &&
    smoke.launcher_version === '' &&
    state.pushed_commit === null &&
    state.restore_commit === null &&
    state.reapply_commit === null &&
    state.live_smoke === null &&
    canonicalize(state.compatibility.current) === canonicalize(state.compatibility.before) &&
    /Unknown sync target.*--release-test-source/.test(state.failure ?? '')
  );
}

function validateEntry(item, index, previous) {
  if (!record(item)) fail('journal chain item must be an object');
  exactKeys(item, ['commit', 'parent', 'entry'], 'journal chain item');
  assertCommit(item.commit, 'journal commit');
  assertCommit(item.parent, 'journal parent', true);
  const entry = item.entry;
  exactKeys(entry, JOURNAL_KEYS, 'journal entry');
  if (entry.schema !== 1 || entry.type !== JOURNAL_TYPE || entry.transaction_ref !== LEGACY_PROMOTION_TRANSACTION_REF)
    fail('journal entry schema or transaction identity mismatch');
  if (
    !Number.isInteger(entry.attempt) ||
    entry.attempt < 0 ||
    entry.attempt > 1 ||
    !Number.isInteger(entry.sequence) ||
    entry.sequence < 0
  )
    fail('journal attempt or sequence is invalid');
  if (!PHASES.has(entry.phase)) fail('journal phase is invalid');
  if (entry.prior_entry_commit !== item.parent) fail('journal prior-entry identity does not match its parent');
  validateImmutable(entry.immutable);
  validateState(entry.state, 'journal state');
  assertTimestamp(entry.created_at, 'journal creation time');
  if (TERMINAL_PHASES.has(entry.phase)) {
    if (!record(entry.receipt_projection)) fail('terminal journal entry lacks its receipt projection');
    validateProjection(entry.receipt_projection, 'terminal receipt projection');
    if (
      entry.receipt_projection.terminal_key.attempt !== entry.attempt ||
      entry.receipt_projection.terminal_key.sequence !== entry.sequence ||
      entry.receipt_projection.attempt !== entry.attempt ||
      entry.receipt_projection.prior_attempt_receipt_sha256 !== entry.immutable.prior_attempt_receipt_sha256 ||
      entry.receipt_projection.created_at !== entry.created_at
    ) {
      fail('terminal receipt projection is not derived from its journal entry');
    }
    const repairSuccessUsesUrlRewrite =
      (entry.immutable.prepush_repair ?? null) === null ||
      canonicalize(entry.receipt_projection.exact_source_smoke?.sync_argv) === canonicalize(['sync']);
    if (entry.phase === 'terminal_success' && !repairSuccessUsesUrlRewrite) {
      fail('terminal repair success must use the URL-rewrite exact-source binding');
    }
    const expectedOutcome =
      entry.phase === 'terminal_success'
        ? 'success'
        : entry.phase === 'manual_incident'
          ? 'manual_incident'
          : entry.state.restore_commit !== null && entry.state.compatibility.restored !== null
            ? 'restored_failure'
            : 'failure';
    if (entry.receipt_projection.outcome !== expectedOutcome)
      fail('terminal journal phase and receipt outcome conflict');
  } else if (entry.receipt_projection !== null) {
    fail('nonterminal journal entry has a receipt projection');
  }
  if (entry.phase === 'manual_incident') {
    if (entry.state.observed_release === null) fail('manual incident lacks its authoritative Release snapshot');
  } else {
    assertCommit(entry.state.origin_main, 'non-incident journal origin_main');
    if (entry.state.observed_lock !== null || entry.state.observed_release !== null)
      fail('non-incident journal entry contains conflict authority snapshots');
  }
  if (index === 0) {
    if (
      item.parent !== null ||
      entry.prior_entry_commit !== null ||
      entry.attempt !== 0 ||
      entry.sequence !== 0 ||
      entry.phase !== 'initialized'
    )
      fail('journal must begin at attempt 0 sequence 0 initialized');
    if (entry.immutable.prior_attempt_receipt_sha256 !== null) fail('attempt 0 cannot bind a prior receipt');
    if ((entry.immutable.prepush_repair ?? null) !== null) fail('attempt 0 cannot bind pre-push repair evidence');
    return;
  }
  if (item.parent !== previous.commit) fail('journal first-parent chain is broken');
  const prior = previous.entry;
  if (entry.attempt === prior.attempt) {
    if (entry.sequence !== prior.sequence + 1) fail('journal sequence is not contiguous');
    if (!sameImmutable(entry.immutable, prior.immutable))
      fail('journal immutable identities changed within an attempt');
    if (!legalTransition(entry.attempt, prior.phase, entry.phase, entry.immutable))
      fail('journal phase transition is illegal');
  } else {
    if (
      prior.attempt !== 0 ||
      entry.attempt !== 1 ||
      entry.sequence !== 0 ||
      entry.phase !== 'initialized' ||
      prior.phase !== 'terminal_failure'
    )
      fail('journal retry attempt ordering is invalid');
    const restoredRetry =
      prior.receipt_projection?.outcome === 'restored_failure' && prior.receipt_projection.retryable === true;
    const repairRetry =
      (entry.immutable.prepush_repair ?? null) !== null &&
      knownLegacyPrepushFailure(prior.receipt_projection, prior.state);
    if (!restoredRetry && !repairRetry)
      fail('journal retry lacks a retryable restored_failure or valid pre-push repair authorization');
    if (!sameImmutable(entry.immutable, prior.immutable, true, repairRetry))
      fail('journal immutable identities changed across retry');
    assertDigest(entry.immutable.prior_attempt_receipt_sha256, 'retry prior receipt digest');
  }
}

export function validatePromotionJournal(chain, authoritativeTip) {
  if (!Array.isArray(chain) || chain.length === 0) fail('promotion journal is absent');
  let previous = null;
  for (let index = 0; index < chain.length; index += 1) {
    validateEntry(chain[index], index, previous);
    previous = chain[index];
    if (chain[index].entry.attempt === 1 && chain[index].entry.sequence === 0) {
      const prefix = chain.slice(0, index);
      const prefixReceipt = receiptFromTerminal({
        chain: prefix,
        tip: prefix.at(-1),
        chain_sha256: sha256(Buffer.from(canonicalize(prefix), 'utf8')),
      });
      if (
        chain[index].entry.immutable.prior_attempt_receipt_sha256 !==
        sha256(Buffer.from(canonicalize(prefixReceipt), 'utf8'))
      )
        fail('journal retry prior receipt digest does not match the canonical attempt 0 terminal receipt');
    }
  }
  if (previous.commit !== authoritativeTip) fail('journal does not end at the authoritative transaction tip');
  return { chain, tip: previous, chain_sha256: sha256(Buffer.from(canonicalize(chain), 'utf8')) };
}

function validateLiveRelease(live, publication, proof) {
  exactKeys(live, LIVE_RELEASE_KEYS, 'authoritative release state');
  if (
    live.repository_id !== REPOSITORY_ID ||
    live.tag !== LEGACY_PROMOTION_TAG ||
    live.commit !== proof.value.tag_commit
  )
    fail('authoritative release identity changed', 'manual_incident');
  if (live.release_database_id !== publication.value.release_database_id || live.prerelease !== true)
    fail('authoritative prerelease identity changed', 'manual_incident');
  validateAssets(live.assets, 'authoritative release', true);
  if (canonicalize(live.assets) !== canonicalize(publication.value.assets))
    fail('authoritative release assets changed', 'manual_incident');
}

function validateAdapter(adapter) {
  if (!record(adapter)) fail('promotion adapter must be an object');
  const actual = Object.keys(adapter).sort();
  const expected = [...PROMOTION_ADAPTER_KEYS].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index]))
    fail('promotion adapter has unknown or missing operations');
  for (const key of expected)
    if (typeof adapter[key] !== 'function') fail(`promotion adapter operation ${key} is not callable`);
  return adapter;
}

function initialState(compatibility, originMain) {
  return {
    origin_main: originMain,
    observed_lock: null,
    observed_release: null,
    pushed_commit: null,
    restore_commit: null,
    reapply_commit: null,
    compatibility: {
      paths: clone(compatibility.paths),
      before: clone(compatibility.before),
      promoted: clone(compatibility.promoted),
      restored: null,
      reapplied: null,
      current: clone(compatibility.current),
      unexpected_paths: clone(compatibility.unexpected_paths),
    },
    prepush_smoke: null,
    live_smoke: null,
    post_restore: null,
    failure: null,
  };
}

function journalEntry(attempt, sequence, phase, prior, immutable, state, createdAt, receiptProjection = null) {
  return {
    schema: 1,
    type: JOURNAL_TYPE,
    transaction_ref: LEGACY_PROMOTION_TRANSACTION_REF,
    attempt,
    sequence,
    prior_entry_commit: prior,
    phase,
    immutable: clone(immutable),
    state: clone(state),
    receipt_projection: receiptProjection === null ? null : clone(receiptProjection),
    created_at: createdAt,
  };
}

function receiptProjection(proof, publication, entry, outcome, retryable) {
  const { immutable, state, attempt, sequence, created_at: createdAt } = entry;
  return {
    repository_id: REPOSITORY_ID,
    version: LEGACY_PROMOTION_VERSION,
    source_proof_sha256: immutable.source_proof_sha256,
    publication_receipt_sha256: immutable.publication_receipt_sha256,
    tag_commit: immutable.tag_commit,
    promoted_commit: immutable.promoted_commit,
    source_ancestry: clone(proof.value.source_ancestry),
    non_plan_tree_equivalence: clone(proof.value.non_plan_tree_equivalence),
    transaction_ref: LEGACY_PROMOTION_TRANSACTION_REF,
    attempt,
    terminal_key: { attempt, sequence },
    prior_attempt_receipt_sha256: immutable.prior_attempt_receipt_sha256,
    lock_ref: immutable.lock_ref,
    lock_nonce: immutable.lock_nonce,
    lock_commit: immutable.lock_commit,
    expected_origin_main: immutable.expected_origin_main,
    observed_origin_main: state.origin_main,
    prepush_commit: state.prepush_smoke === null ? null : immutable.tag_commit,
    pushed_commit: state.pushed_commit,
    restore_commit: state.restore_commit,
    reapply_commit: state.reapply_commit,
    compatibility_paths: clone(state.compatibility.paths),
    compatibility_blobs: {
      before: clone(state.compatibility.before),
      promoted: clone(state.compatibility.promoted),
      restored: clone(state.compatibility.restored),
      reapplied: clone(state.compatibility.reapplied),
    },
    public_repository_id: immutable.public_repository_id,
    public_reviewed_commit: immutable.public_reviewed_commit,
    public_release_commit: immutable.public_release_commit,
    public_release_receipt_sha256: immutable.public_release_receipt_sha256,
    public_tag_commit: immutable.public_release_commit,
    publication_release_id: publication.value.release_database_id,
    docks_kit: {
      repository_id: immutable.docks_kit_repository,
      release: immutable.docks_kit_release,
      release_database_id: state.prepush_smoke?.docks_kit_release_database_id ?? null,
      target_commit: immutable.public_release_commit,
      asset: state.prepush_smoke?.docks_kit_asset ?? null,
    },
    session_relay_assets: clone(publication.value.assets),
    exact_source_smoke: clone(state.prepush_smoke),
    live_smoke: clone(state.live_smoke),
    post_restore: clone(state.post_restore),
    outcome,
    retryable,
    created_at: createdAt,
  };
}

function receiptFromTerminal(validated) {
  const { tip, chain_sha256: chainDigest } = validated;
  const projection = tip.entry.receipt_projection;
  validateProjection(projection, 'terminal receipt projection');
  const receipt = {
    schema: 1,
    type: RECEIPT_TYPE,
    ...clone(projection),
    terminal_journal_commit: tip.commit,
    journal_chain_sha256: chainDigest,
  };
  validatePromotionReceipt(receipt);
  return receipt;
}

function validateCurrentReleaseState(value, label, expectedPrerelease) {
  exactKeys(
    value,
    ['release_database_id', 'tag_commit', 'workflow_run_id', 'workflow_run_attempt', 'prerelease', 'assets'],
    label,
  );
  if (
    !Number.isSafeInteger(value.release_database_id) ||
    value.release_database_id <= 0 ||
    !Number.isSafeInteger(value.workflow_run_id) ||
    value.workflow_run_id <= 0 ||
    !Number.isSafeInteger(value.workflow_run_attempt) ||
    value.workflow_run_attempt <= 0 ||
    value.prerelease !== expectedPrerelease
  ) {
    fail(`${label} release/workflow identity or prerelease state is invalid`);
  }
  assertCommit(value.tag_commit, `${label} tag commit`);
  validateAssets(value.assets, label, true);
  if (value.assets.some(({ name }) => /windows|win32|\.exe$/i.test(name))) {
    fail(`${label} contains an unsupported Windows asset`);
  }
}

function validateCurrentPromotionReceipt(receipt) {
  const planRunReceipt = receipt.schema === 3 && receipt.type === 'PromotionReceiptV3';
  const planRunDocksReceipt = receipt.docks_plan?.run_id === PLANRUN_DOCKS_RUN_ID;
  exactKeys(receipt, PROMOTION_V2_KEYS, 'current promotion receipt');
  if (
    (!planRunReceipt && (receipt.schema !== 2 || receipt.type !== 'PromotionReceiptV2')) ||
    receipt.repository_id !== REPOSITORY_ID ||
    receipt.version !== CURRENT_VERSION ||
    receipt.tag !== CURRENT_TAG ||
    receipt.reviewed_source_ancestry !== true ||
    receipt.byte_identical_promotion !== true ||
    receipt.outcome !== 'success'
  ) {
    fail('current promotion receipt reviewed source, byte identity, or outcome is invalid');
  }
  assertDigest(receipt.source_proof_sha256, 'current promotion source proof digest');
  assertDigest(receipt.publication_receipt_sha256, 'current promotion publication receipt digest');
  assertDigest(receipt.public_release_receipt_sha256, 'current promotion public release receipt digest');
  assertCommit(receipt.reviewed_source_commit, 'current promotion reviewed source commit');
  assertTimestamp(receipt.completed_at, 'current promotion completion time');

  exactKeys(
    receipt.docks_plan,
    ['repository_id', 'goal_id', 'run_id', 'plan_path', 'implementation_commit', 'completion_review_sha256', 'status'],
    'current promotion Docks plan',
  );
  if (
    receipt.docks_plan.repository_id !== REPOSITORY_ID ||
    receipt.docks_plan.goal_id !== CURRENT_GOAL_ID ||
    (!planRunReceipt && planRunDocksReceipt) ||
    receipt.docks_plan.run_id !== (planRunDocksReceipt ? PLANRUN_DOCKS_RUN_ID : CURRENT_DOCKS_RUN_ID) ||
    receipt.docks_plan.plan_path !== (planRunDocksReceipt ? PLANRUN_DOCKS_PLAN_PATH : CURRENT_DOCKS_PLAN_PATH) ||
    receipt.docks_plan.implementation_commit !== receipt.reviewed_source_commit ||
    receipt.docks_plan.status !== 'ongoing'
  ) {
    fail('current promotion Docks PlanRunV1 identity mismatch');
  }
  assertCommit(receipt.docks_plan.implementation_commit, 'current promotion Docks implementation commit');
  assertDigest(receipt.docks_plan.completion_review_sha256, 'current promotion completion review digest');

  const publicChildKeys = [
    'repository_id',
    'goal_id',
    'run_id',
    'version',
    'tag',
    'npm_package',
    'npm_version',
    'plan_path',
    'status',
    planRunReceipt ? 'planrun_verified' : 'red_first_verified',
    'finished_at',
  ];
  exactKeys(receipt.public_child, publicChildKeys, 'current promotion public child');
  if (
    receipt.public_child.repository_id !== PUBLIC_REPOSITORY_ID ||
    receipt.public_child.goal_id !== CURRENT_GOAL_ID ||
    receipt.public_child.run_id !== CURRENT_PUBLIC_RUN_ID ||
    receipt.public_child.version !== PUBLIC_VERSION ||
    receipt.public_child.tag !== PUBLIC_TAG ||
    receipt.public_child.npm_package !== 'docks-kit' ||
    receipt.public_child.npm_version !== PUBLIC_VERSION ||
    !CURRENT_PUBLIC_FINISHED_PLAN_PATH.test(receipt.public_child.plan_path) ||
    receipt.public_child.status !== 'finished' ||
    (planRunReceipt ? receipt.public_child.planrun_verified !== true : receipt.public_child.red_first_verified !== true)
  ) {
    fail(`current promotion requires the exact finished ${CURRENT_PUBLIC_PLAN_BASENAME} validated public child`);
  }
  assertTimestamp(receipt.public_child.finished_at, 'current promotion public child finished time');
  if (Date.parse(receipt.public_child.finished_at) >= Date.parse(receipt.completed_at)) {
    fail('current promotion public child must finish before stable promotion');
  }

  validateCurrentReleaseState(receipt.staged_release, 'current staged prerelease', true);
  validateCurrentReleaseState(receipt.stable_release, 'current stable release', false);
  if (
    receipt.staged_release.release_database_id !== receipt.stable_release.release_database_id ||
    receipt.staged_release.tag_commit !== receipt.stable_release.tag_commit ||
    receipt.staged_release.workflow_run_id !== receipt.stable_release.workflow_run_id ||
    receipt.staged_release.workflow_run_attempt !== receipt.stable_release.workflow_run_attempt ||
    canonicalize(receipt.staged_release.assets) !== canonicalize(receipt.stable_release.assets)
  ) {
    fail('current stable promotion changed an asset digest or another byte-identical release identity');
  }
  const expectedTagCommit =
    planRunReceipt && planRunDocksReceipt ? PLANRUN_RELEASE_TAG_COMMIT : receipt.reviewed_source_commit;
  if (receipt.staged_release.tag_commit !== expectedTagCommit) {
    fail('current promotion staged tag commit is not the bound immutable release commit');
  }

  exactKeys(
    receipt.historical_receipts,
    ['version', 'tag', 'publication_sha256', 'public_request_sha256'],
    'current promotion historical receipts',
  );
  if (
    receipt.historical_receipts.version !== HISTORICAL_RELAY_VERSION ||
    receipt.historical_receipts.tag !== HISTORICAL_RELAY_TAG ||
    receipt.historical_receipts.publication_sha256 !== HISTORICAL_PUBLICATION_SHA256 ||
    receipt.historical_receipts.public_request_sha256 !== HISTORICAL_PUBLIC_REQUEST_SHA256
  ) {
    fail('current promotion historical Session Relay 0.13 receipt identity changed');
  }
  return receipt;
}

export function validatePromotionReceipt(receipt) {
  if ([2, 3].includes(receipt?.schema) || ['PromotionReceiptV2', 'PromotionReceiptV3'].includes(receipt?.type)) {
    return validateCurrentPromotionReceipt(receipt);
  }
  exactKeys(receipt, RECEIPT_KEYS, 'promotion receipt');
  if (
    receipt.schema !== 1 ||
    receipt.type !== RECEIPT_TYPE ||
    receipt.repository_id !== REPOSITORY_ID ||
    receipt.version !== LEGACY_PROMOTION_VERSION
  )
    fail('promotion receipt identity is invalid');
  validateProjection(Object.fromEntries(PROJECTION_KEYS.map((key) => [key, receipt[key]])), 'promotion receipt');
  if (!OUTCOMES.has(receipt.outcome) || typeof receipt.retryable !== 'boolean')
    fail('promotion receipt outcome is invalid');
  if (receipt.retryable !== (receipt.outcome === 'restored_failure' && receipt.attempt === 0))
    fail('promotion receipt retryability is invalid');
  assertCommit(receipt.terminal_journal_commit, 'promotion terminal journal commit');
  assertDigest(receipt.journal_chain_sha256, 'promotion journal-chain digest');
  assertTimestamp(receipt.created_at, 'promotion receipt creation time');
  return receipt;
}

function makeTerminalEntry(
  proof,
  publication,
  current,
  phase,
  outcome,
  retryable,
  adapter,
  state = current.entry.state,
) {
  const draft = journalEntry(
    current.entry.attempt,
    current.entry.sequence + 1,
    phase,
    current.commit,
    current.entry.immutable,
    state,
    adapter.now(),
  );
  draft.receipt_projection = receiptProjection(proof, publication, draft, outcome, retryable);
  return draft;
}

function currentCompatibility(adapter, expected) {
  const value = adapter.compatibilityState(expected);
  if (!record(value)) fail('compatibility state is invalid');
  const normalized = {
    paths: clone(value.paths),
    before: clone(value.before),
    promoted: clone(value.promoted),
    restored: null,
    reapplied: null,
    current: clone(value.current),
    unexpected_paths: clone(value.unexpected_paths),
  };
  validateCompatibility(normalized, 'authoritative compatibility state');
  return normalized;
}
function simulatedCrash(error) {
  return error?.code === 'SIMULATED_CRASH';
}

function mapsEqual(left, right) {
  return canonicalize(left) === canonicalize(right);
}

function invocationResult(adapter, options, receipt, allowExisting) {
  const written = adapter.writeReceipt({ path: options.get('receipt-out'), receipt, allowExisting });
  return { receipt, state: { receipt_sha256: written.digest } };
}

function normalizeCompatibilityBlobs(paths, blobs, label) {
  if (!record(blobs)) fail(`${label} must be an object`);
  const unexpected = Object.keys(blobs).filter((item) => !paths.includes(item));
  if (unexpected.length !== 0) fail(`${label} contains paths outside the closed compatibility set`);
  return Object.fromEntries(paths.map((item) => [item, blobs[item] ?? null]));
}

function failedLiveSmoke(error, state) {
  const exact = state.prepush_smoke;
  if (exact === null) fail('live smoke exception occurred without exact-source smoke evidence');
  const empty = sha256(Buffer.alloc(0));
  const message = error instanceof Error ? error.message : String(error);
  return {
    kind: 'live',
    isolation_root_sha256: sha256(
      Buffer.from(canonicalize({ kind: 'live', home_mode: '0700', source_commit: null, sync_argv: ['sync'] })),
    ),
    sync_argv: ['sync'],
    stdout_sha256: empty,
    stderr_sha256: sha256(Buffer.from(message)),
    ordering_log_sha256: sha256(Buffer.from(message)),
    installed_binary_sha256: empty,
    session_relay_asset_name: exact.session_relay_asset_name,
    installed_version: '',
    launcher_sha256: empty,
    launcher_version: '',
    docks_kit_target_commit: exact.docks_kit_target_commit,
    docks_kit_release_database_id: exact.docks_kit_release_database_id,
    docks_kit_asset: clone(exact.docks_kit_asset),
  };
}
function smokeSuccessError(evidence, kind, exact = null) {
  try {
    validateSmoke(evidence, `${kind} successful smoke`);
    if (
      evidence === null ||
      evidence.kind !== kind ||
      evidence.installed_version !== `session-relay ${LEGACY_PROMOTION_VERSION}` ||
      evidence.launcher_version !== `session-relay ${LEGACY_PROMOTION_VERSION}`
    )
      return `${kind} smoke version identity mismatch`;
    if (
      kind === 'live' &&
      (exact === null ||
        evidence.launcher_sha256 !== exact.launcher_sha256 ||
        canonicalize(evidence.docks_kit_asset) !== canonicalize(exact.docks_kit_asset) ||
        evidence.docks_kit_target_commit !== exact.docks_kit_target_commit)
    )
      return 'live smoke does not match exact-source launcher or docks-kit identity';
    return null;
  } catch (error) {
    return error.message;
  }
}

export function fetchPromotionAuthoritativeRef(ref, expected, namespace, repo = REPO) {
  if (!COMMIT.test(expected)) fail(`authoritative ${ref} expected tip is invalid`);
  let target = expected;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const fetched = commandAt(repo, 'git', ['fetch', '--no-tags', 'origin', `+${ref}:${namespace}`]);
    if (!fetched.ok) fail(`could not fetch authoritative ${ref}: ${fetched.stderr}`, 'failure');
    const resolved = commandAt(repo, 'git', ['rev-parse', namespace]);
    if (!resolved.ok || !COMMIT.test(resolved.stdout.trim()))
      fail(`could not resolve fetched authoritative ${ref}`, 'failure');
    const queried = commandAt(repo, 'git', ['ls-remote', 'origin', ref]);
    if (!queried.ok) fail(`could not query authoritative ${ref}: ${queried.stderr}`, 'failure');
    const observed = queried.stdout.trim() === '' ? null : queried.stdout.trim().split(/\s+/)[0];
    if (observed === null) fail(`authoritative ${ref} was deleted during object fetch`, 'manual_incident');
    if (resolved.stdout.trim() === target && observed === target) return target;
    target = observed;
  }
  fail(`authoritative ${ref} moved repeatedly during object fetch`, 'manual_incident');
}

function commandAt(cwd, commandName, args, env = undefined) {
  const result = spawnSync(commandName, args, {
    cwd,
    encoding: 'utf8',
    shell: false,
    env: env ? { ...process.env, ...env } : process.env,
    maxBuffer: Infinity,
  });
  if (result.error || result.signal || result.status !== 0) {
    return {
      ok: false,
      stdout: result.stdout ?? '',
      stderr: result.stderr ?? result.error?.message ?? result.signal ?? `exit ${result.status}`,
      status: result.status,
    };
  }
  return { ok: true, stdout: result.stdout ?? '', stderr: result.stderr ?? '', status: 0 };
}

function remoteRef(ref) {
  const output = command('git', ['ls-remote', 'origin', ref]);
  return output === '' ? null : output.split(/\s+/)[0];
}

export function readPromotionJournalFromRepository(_ref, tip, repo = REPO) {
  const authoritativeTip = fetchPromotionAuthoritativeRef(_ref, tip, 'refs/session-relay-release/transaction', repo);
  const run = (args, label) => {
    const result = commandAt(repo, 'git', args);
    if (!result.ok) fail(`could not ${label}: ${result.stderr}`, 'failure');
    return result.stdout.trim();
  };
  const commits = run(['rev-list', '--first-parent', '--reverse', authoritativeTip], 'read promotion journal history')
    .split('\n')
    .filter(Boolean);
  return commits.map((commit) => {
    const parents = run(['show', '-s', '--format=%P', commit], 'read promotion journal parents')
      .split(/\s+/)
      .filter(Boolean);
    if (parents.length > 1) fail('promotion journal commit has more than one parent');
    const message = run(['show', '-s', '--format=%B', commit], 'read promotion journal entry');
    let entry;
    try {
      entry = JSON.parse(message);
    } catch {
      fail('promotion journal commit message is not JSON');
    }
    if (canonicalize(entry) !== message) fail('promotion journal commit message is not canonical JCS');
    return { commit, parent: parents[0] ?? null, entry };
  });
}

function readJournal(_ref, tip) {
  return readPromotionJournalFromRepository(_ref, tip);
}

function createCommit(message, parent = null, treeish = 'HEAD') {
  const tree = git(['rev-parse', `${treeish}^{tree}`]);
  const args = ['commit-tree', tree, '-m', message];
  if (parent !== null) args.push('-p', parent);
  return git(args);
}

function appendJournal({ ref, entry, prior }) {
  const commit = createCommit(canonicalize(entry), prior);
  command('git', ['push', 'origin', `--force-with-lease=${ref}:${prior ?? ''}`, `${commit}:${ref}`]);
  return commit;
}

function createLock({ ref, commit, prior }) {
  if (prior !== null) fail('promotion lock can only be created with an absence lease');
  command('git', ['push', 'origin', `--force-with-lease=${ref}:`, `${commit}:${ref}`]);
}

function gitBlobMap(commit) {
  assertCommit(commit, 'compatibility commit');
  const output = git(['ls-tree', '-r', commit, '--', 'plugins/session-relay', '.claude-plugin/marketplace.json']);
  const map = {};
  for (const line of output.split('\n').filter(Boolean)) {
    const match = /^(\d{6}) blob ([0-9a-f]{40})\t(.+)$/.exec(line);
    if (!match) fail('compatibility tree contains a non-blob entry');
    map[match[3]] = match[2];
  }
  return map;
}

function rawBlobMap(commit) {
  const output = git(['ls-tree', '-r', commit, '--', 'plugins/session-relay', '.claude-plugin/marketplace.json']);
  const map = new Map();
  for (const line of output.split('\n').filter(Boolean)) {
    const match = /^(\d{6}) blob ([0-9a-f]{40})\t(.+)$/.exec(line);
    if (!match) fail('compatibility tree contains a non-blob entry');
    map.set(match[3], { mode: match[1], blob: match[2] });
  }
  return map;
}

function compatibilityState({ expectedOriginMain, promotedCommit }) {
  const current = remoteRef('refs/heads/main');
  if (current === null) fail('origin/main is absent');
  if (fetchPromotionAuthoritativeRef('refs/heads/main', current, 'refs/session-relay-release/main') !== current)
    fail('authoritative origin/main moved during compatibility object fetch', 'manual_incident');
  const before = gitBlobMap(expectedOriginMain);
  const promoted = gitBlobMap(promotedCommit);
  const paths = [...new Set([...Object.keys(before), ...Object.keys(promoted)])].sort();
  if (
    !paths.includes('.claude-plugin/marketplace.json') ||
    !paths.some((item) => item.startsWith('plugins/session-relay/'))
  )
    fail('closed compatibility set is incomplete');
  const fill = (map) => Object.fromEntries(paths.map((item) => [item, map[item] ?? null]));
  const currentMap = gitBlobMap(current);
  const unexpectedPaths = Object.keys(currentMap)
    .filter((item) => !paths.includes(item))
    .sort();
  return {
    paths,
    before: fill(before),
    promoted: fill(promoted),
    current: fill(currentMap),
    unexpected_paths: unexpectedPaths,
  };
}

function readMutationMetadata(commit, expected) {
  const message = git(['show', '-s', '--format=%B', commit]).trim();
  let value;
  try {
    value = JSON.parse(message);
  } catch {
    fail('compatibility mutation commit message is not JSON');
  }
  if (canonicalize(value) !== message) fail('compatibility mutation commit message is not canonical JCS');
  exactKeys(value, MUTATION_KEYS, 'compatibility mutation commit');
  if (
    value.schema !== 1 ||
    value.type !== 'PromotionCompatibilityMutationV1' ||
    value.kind !== expected.kind ||
    value.parent_commit !== expected.parent ||
    value.source_commit !== expected.source ||
    canonicalize(value.compatibility_paths) !== canonicalize(expected.paths)
  )
    fail('compatibility mutation identity is invalid');
  if (expected.kind === 'restore') {
    validateSmoke(value.live_smoke, 'compatibility restore live smoke');
    validatePostRestore(value.post_restore, 'compatibility restore parity');
    if (
      value.live_smoke === null ||
      value.post_restore === null ||
      typeof value.failure !== 'string' ||
      value.failure === ''
    )
      fail('compatibility restore evidence is incomplete');
  } else if (value.live_smoke !== null || value.post_restore !== null || value.failure !== null) {
    fail('compatibility reapply evidence is invalid');
  }
  return value;
}

function validateCommitTransition({ kind, commit, parent, source, paths }) {
  try {
    assertCommit(commit, `${kind} commit`);
    assertCommit(parent, `${kind} parent`);
    assertCommit(source, `${kind} source`);
    const parents = git(['show', '-s', '--format=%P', commit]).split(/\s+/).filter(Boolean);
    if (parents.length !== 1 || parents[0] !== parent) return { valid: false, parity: null, live_smoke: null };
    const metadata = readMutationMetadata(commit, { kind, parent, source, paths });
    const changed = git(['diff', '--name-only', parent, commit]).split('\n').filter(Boolean);
    if (changed.some((item) => !paths.includes(item))) return { valid: false, parity: null, live_smoke: null };
    const actual = gitBlobMap(commit);
    const desired = gitBlobMap(source);
    const project = (map) => Object.fromEntries(paths.map((item) => [item, map[item] ?? null]));
    if (!mapsEqual(project(actual), project(desired))) return { valid: false, parity: null, live_smoke: null };
    if (Object.keys(actual).some((item) => !paths.includes(item)))
      return { valid: false, parity: null, live_smoke: null };
    const verification = kind === 'restore' ? verifyCommitInWorktree(commit) : { ok: true, parity: null };
    if (!verification.ok)
      return {
        valid: false,
        recorded_parity: metadata.post_restore,
        parity: verification.parity ?? null,
        verification_ok: false,
        live_smoke: metadata.live_smoke,
      };
    return {
      valid: true,
      recorded_parity: metadata.post_restore,
      parity: verification.parity ?? null,
      verification_ok: true,
      live_smoke: metadata.live_smoke,
    };
  } catch {
    return { valid: false, recorded_parity: null, parity: null, verification_ok: false, live_smoke: null };
  }
}

function buildCompatibilityCommit(base, source, message) {
  const index = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'session-relay-index-')), 'index');
  const env = { GIT_INDEX_FILE: index };
  try {
    command('git', ['read-tree', base], { env });
    const baseMap = rawBlobMap(base);
    const sourceMap = rawBlobMap(source);
    const paths = [...new Set([...baseMap.keys(), ...sourceMap.keys()])].sort();
    for (const item of paths) {
      const desired = sourceMap.get(item);
      if (desired === undefined) command('git', ['update-index', '--force-remove', '--', item], { env });
      else command('git', ['update-index', '--add', '--cacheinfo', `${desired.mode},${desired.blob},${item}`], { env });
    }
    const tree = command('git', ['write-tree'], { env });
    return git(['commit-tree', tree, '-p', base, '-m', message]);
  } finally {
    fs.rmSync(path.dirname(index), { recursive: true, force: true });
  }
}

function verifyCommitInWorktree(commit) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'session-relay-restore-'));
  try {
    const add = commandAt(REPO, 'git', ['worktree', 'add', '--detach', root, commit]);
    if (!add.ok) return { ok: false, error: add.stderr };
    const result = commandAt(root, process.execPath, ['scripts/ci.mjs']);
    return {
      ok: result.ok,
      error: result.ok ? null : result.stderr,
      parity: {
        manifest_catalog: result.ok,
        full_ci_exit: result.status ?? 1,
        full_ci_stdout_sha256: sha256(Buffer.from(result.stdout)),
        full_ci_stderr_sha256: sha256(Buffer.from(result.stderr)),
      },
    };
  } finally {
    commandAt(REPO, 'git', ['worktree', 'remove', '--force', root]);
    fs.rmSync(root, { recursive: true, force: true });
  }
}
function restoreCompatibility({ expected, promoted, liveSmoke, failure }) {
  if (remoteRef('refs/heads/main') !== promoted)
    return { ok: false, definitive: false, error: 'origin/main moved before compatibility restore' };
  validateSmoke(liveSmoke, 'compatibility restore live smoke');
  if (liveSmoke === null || typeof failure !== 'string' || failure === '')
    fail('compatibility restore requires durable failure evidence');
  const paths = compatibilityState({ expectedOriginMain: expected, promotedCommit: promoted }).paths;
  const candidate = buildCompatibilityCommit(
    promoted,
    expected,
    'chore(release): verify Session Relay compatibility restore',
  );
  const verification = verifyCommitInWorktree(candidate);
  if (!verification.ok) {
    if (remoteRef('refs/heads/main') !== promoted)
      return {
        ok: false,
        definitive: false,
        error: 'origin/main moved while compatibility restore CI ran',
        parity: verification.parity,
      };
    return { ok: false, definitive: true, commit: candidate, error: verification.error, parity: verification.parity };
  }
  const metadata = {
    schema: 1,
    type: 'PromotionCompatibilityMutationV1',
    kind: 'restore',
    parent_commit: promoted,
    source_commit: expected,
    compatibility_paths: paths,
    live_smoke: clone(liveSmoke),
    post_restore: clone(verification.parity),
    failure,
  };
  const commit = createCommit(canonicalize(metadata), promoted, candidate);
  command('git', ['push', 'origin', `--force-with-lease=refs/heads/main:${promoted}`, `${commit}:refs/heads/main`]);
  return { ok: true, commit, blobs: { restored: gitBlobMap(commit) }, parity: verification.parity };
}

function reapplyCompatibility({ expected, promoted }) {
  if (remoteRef('refs/heads/main') !== expected)
    return { ok: false, definitive: false, error: 'origin/main moved before compatibility reapply' };
  const paths = compatibilityState({ expectedOriginMain: expected, promotedCommit: promoted }).paths;
  const candidate = buildCompatibilityCommit(
    expected,
    promoted,
    'chore(release): verify Session Relay compatibility reapply',
  );
  const metadata = {
    schema: 1,
    type: 'PromotionCompatibilityMutationV1',
    kind: 'reapply',
    parent_commit: expected,
    source_commit: promoted,
    compatibility_paths: paths,
    live_smoke: null,
    post_restore: null,
    failure: null,
  };
  const commit = createCommit(canonicalize(metadata), expected, candidate);
  command('git', ['push', 'origin', `--force-with-lease=refs/heads/main:${expected}`, `${commit}:refs/heads/main`]);
  return { ok: true, commit, blobs: { reapplied: gitBlobMap(commit) } };
}

function sessionRelayHostAssetName() {
  if (process.platform === 'darwin')
    return process.arch === 'arm64' ? 'session-relay-aarch64-apple-darwin' : 'session-relay-x86_64-apple-darwin';
  if (process.platform === 'linux')
    return process.arch === 'arm64'
      ? 'session-relay-aarch64-unknown-linux-musl'
      : 'session-relay-x86_64-unknown-linux-musl';
  fail('Session Relay promotion smoke does not support this host');
}

function hostAssetName() {
  if (process.platform === 'darwin')
    return process.arch === 'arm64' ? 'docks-kit-darwin-arm64' : 'docks-kit-darwin-x64';
  if (process.platform === 'linux') return process.arch === 'arm64' ? 'docks-kit-linux-arm64' : 'docks-kit-linux-x64';
  fail('docks-kit promotion smoke does not support this host');
}

function publicTagCommit(release) {
  let object = JSON.parse(
    command('gh', ['api', `/repos/${PUBLIC_REPOSITORY_ID}/git/ref/tags/${encodeURIComponent(release)}`]),
  ).object;
  for (let depth = 0; object?.type === 'tag' && depth < 4; depth += 1) {
    object = JSON.parse(command('gh', ['api', `/repos/${PUBLIC_REPOSITORY_ID}/git/tags/${object.sha}`])).object;
  }
  if (object?.type !== 'commit' || !COMMIT.test(object.sha ?? ''))
    fail('docks-kit tag does not resolve to one immutable commit');
  return object.sha;
}

function downloadDocksKit(root, release) {
  if (release !== LEGACY_PROMOTION_DOCKS_KIT_RELEASE)
    fail(`docks-kit release must be ${LEGACY_PROMOTION_DOCKS_KIT_RELEASE}`);
  const metadata = JSON.parse(
    command('gh', ['api', `/repos/${PUBLIC_REPOSITORY_ID}/releases/tags/${encodeURIComponent(release)}`]),
  );
  if (metadata.tag_name !== release || metadata.draft || metadata.prerelease || !Number.isInteger(metadata.id))
    fail('docks-kit release is not the exact live stable release');
  command('gh', ['release', 'download', release, '--repo', PUBLIC_REPOSITORY_ID, '--dir', root]);
  const name = hostAssetName();
  const checksum = fs.readFileSync(path.join(root, 'SHA256SUMS'), 'utf8');
  const rows = checksum.split('\n').filter((line) => line.endsWith(`  ${name}`));
  if (rows.length !== 1 || !/^[0-9a-f]{64} {2}docks-kit-[a-z0-9-]+$/.test(rows[0]))
    fail('docks-kit checksum row is absent or ambiguous');
  const executable = path.join(root, name);
  const digest = sha256(fs.readFileSync(executable));
  if (digest !== rows[0].slice(0, 64)) fail('docks-kit executable digest does not match SHA256SUMS');
  const asset = (metadata.assets ?? []).find((candidate) => candidate.name === name);
  if (!asset || (typeof asset.digest === 'string' && asset.digest.replace(/^sha256:/, '') !== digest))
    fail('docks-kit release asset identity or digest mismatch');
  fs.chmodSync(executable, 0o755);
  return {
    executable,
    targetCommit: publicTagCommit(release),
    releaseDatabaseId: metadata.id,
    asset: { name, database_id: asset.id, size: asset.size, digest },
  };
}

function findInstalledLaunchers(root) {
  const found = [];
  const walk = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(entryPath);
      else if (
        entry.isFile() &&
        entry.name === 'relay' &&
        entryPath.includes(`${path.sep}session-relay${path.sep}`) &&
        entryPath.endsWith(`${path.sep}bin${path.sep}relay`)
      )
        found.push(entryPath);
    }
  };
  walk(root);
  if (found.length === 0) fail('installed Session Relay plugin launcher is absent');
  return found.sort();
}

function runSmoke({ sourceCommit = null, docksKitRelease, exactSource, sessionRelayAssets, publicReleaseCommit }) {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), exactSource ? 'session-relay-exact-source-' : 'session-relay-live-'),
  );
  const home = path.join(root, 'home');
  fs.mkdirSync(home, { recursive: true, mode: 0o700 });
  let checkout = null;
  try {
    const kit = downloadDocksKit(root, docksKitRelease);
    if (kit.targetCommit !== publicReleaseCommit)
      fail('docks-kit release tag does not match the verified public release commit');
    const argv = ['sync'];
    const environment = { HOME: home, AGENTS_DIR: path.join(home, '.agents') };
    if (exactSource) {
      checkout = path.join(root, 'reviewed-docks');
      const add = commandAt(REPO, 'git', ['worktree', 'add', '--detach', checkout, sourceCommit]);
      if (!add.ok) return { ok: false, definitive: true, error: add.stderr, evidence: null };
      const sourceRepository = path.join(root, 'reviewed-source.git');
      const setupCommands = [
        [root, 'git', ['init', '--bare', sourceRepository], undefined],
        [REPO, 'git', ['push', sourceRepository, `${sourceCommit}:refs/heads/main`], undefined],
        [
          root,
          'git',
          ['config', '--global', `url.file://${sourceRepository}.insteadOf`, 'https://github.com/DocksDocks/docks.git'],
          environment,
        ],
      ];
      for (const [cwd, executable, args, env] of setupCommands) {
        const setup = commandAt(cwd, executable, args, env);
        if (!setup.ok) return { ok: false, definitive: true, error: setup.stderr, evidence: null };
      }
    }
    const normalizedArgv = [...argv];
    const result = commandAt(root, kit.executable, argv, environment);
    const installed = path.join(home, '.local', 'bin', 'session-relay');
    const version = result.ok
      ? commandAt(root, installed, ['--version'], environment)
      : { ok: false, stdout: '', stderr: '' };
    const installedLaunchers = result.ok ? findInstalledLaunchers(home) : [];
    const launcher = result.ok
      ? exactSource
        ? path.join(checkout, 'plugins', 'session-relay', 'bin', 'relay')
        : installedLaunchers[0]
      : null;
    const launcherVersion =
      launcher === null
        ? { ok: false, stdout: '', stderr: '' }
        : commandAt(root, launcher, ['--version'], { ...environment, SESSION_RELAY_BIN: installed });
    const launcherDigest =
      launcher !== null && fs.existsSync(launcher) ? sha256(fs.readFileSync(launcher)) : sha256(Buffer.alloc(0));
    const installedLaunchersMatch =
      installedLaunchers.length > 0 &&
      installedLaunchers.every((candidate) => sha256(fs.readFileSync(candidate)) === launcherDigest);
    const installedDigest =
      result.ok && fs.existsSync(installed) ? sha256(fs.readFileSync(installed)) : sha256(Buffer.alloc(0));
    const hostAsset = sessionRelayAssets.find(({ name }) => name === sessionRelayHostAssetName());
    const descriptor = {
      kind: exactSource ? 'exact_source' : 'live',
      home_mode: '0700',
      source_commit: exactSource ? sourceCommit : null,
      sync_argv: normalizedArgv,
    };
    const evidence = {
      kind: descriptor.kind,
      isolation_root_sha256: sha256(Buffer.from(canonicalize(descriptor))),
      sync_argv: normalizedArgv,
      stdout_sha256: sha256(Buffer.from(result.stdout)),
      stderr_sha256: sha256(Buffer.from(result.stderr)),
      ordering_log_sha256: sha256(Buffer.from(`${result.stdout}${result.stderr}`)),
      installed_binary_sha256: installedDigest,
      session_relay_asset_name: sessionRelayHostAssetName(),
      installed_version: version.stdout.trim(),
      launcher_sha256: launcherDigest,
      launcher_version: launcherVersion.stdout.trim(),
      docks_kit_asset: kit.asset,
      docks_kit_target_commit: kit.targetCommit,
      docks_kit_release_database_id: kit.releaseDatabaseId,
    };
    const ok =
      result.ok &&
      version.ok &&
      launcherVersion.ok &&
      installedLaunchersMatch &&
      version.stdout.trim() === `session-relay ${LEGACY_PROMOTION_VERSION}` &&
      launcherVersion.stdout.trim() === `session-relay ${LEGACY_PROMOTION_VERSION}` &&
      hostAsset !== undefined &&
      installedDigest === hostAsset.digest;
    return {
      ok,
      definitive: true,
      evidence,
      error: ok ? null : result.stderr || version.stderr || launcherVersion.stderr || 'smoke identity mismatch',
    };
  } finally {
    if (checkout !== null) commandAt(REPO, 'git', ['worktree', 'remove', '--force', checkout]);
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function productionReleaseState() {
  const state = releaseState();
  return {
    repository_id: REPOSITORY_ID,
    tag: LEGACY_PROMOTION_TAG,
    commit: state.commit,
    release_database_id: state.release?.id ?? null,
    prerelease: state.release?.prerelease ?? null,
    assets: state.release ? normalizedAssets(state.release) : [],
  };
}
function assertReceiptOutputAvailable({ path: output }) {
  const target = canonicalPath(output, '--receipt-out', { mustExist: false });
  if (fs.existsSync(target)) fail(`receipt output already exists: ${target}`);
}

function writeReceipt({ path: output, receipt, allowExisting }) {
  const target = canonicalPath(output, '--receipt-out', { mustExist: false });
  const expected = Buffer.from(canonicalize(receipt), 'utf8');
  if (allowExisting && fs.existsSync(target)) {
    const stat = fs.lstatSync(target);
    if (!stat.isFile() || (stat.mode & 0o777) !== 0o600)
      fail('existing promotion receipt is not a mode-0600 regular file');
    const bytes = fs.readFileSync(target);
    if (Buffer.compare(bytes, expected) !== 0)
      fail('existing promotion receipt conflicts with terminal journal recovery');
    const digest = sha256(bytes);
    process.stdout.write(`${digest}\n`);
    return { bytes, digest, path: target };
  }
  const written = writeCanonicalExclusive(output, receipt);
  process.stdout.write(`${written.digest}\n`);
  return written;
}

function isAncestor(ancestor, descendant) {
  const result = commandAt(REPO, 'git', ['merge-base', '--is-ancestor', ancestor, descendant]);
  if (result.ok) return true;
  if (result.status === 1) return false;
  fail(`could not validate Git ancestry: ${result.stderr}`);
}

function validatePrepushRepairCommit({ baseCommit, repairCommit }) {
  if (!COMMIT.test(baseCommit) || !COMMIT.test(repairCommit)) fail('pre-push repair commit identity is invalid');
  if (!isAncestor(baseCommit, repairCommit)) fail('pre-push repair commit is not descended from expected origin/main');
  const diff = commandAt(REPO, 'git', [
    'diff',
    '--name-only',
    '--diff-filter=ACDMRTUXB',
    `${baseCommit}..${repairCommit}`,
  ]);
  if (!diff.ok) fail(`could not inspect pre-push repair paths: ${diff.stderr}`);
  const paths = diff.stdout.trim().split('\n').filter(Boolean).sort();
  if (canonicalize(paths) !== canonicalize(PREPUSH_REPAIR_PATHS))
    fail('pre-push repair commit paths are outside the exact allowlist');

  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'session-relay-promotion-repair-'));
  const checkout = path.join(root, 'checkout');
  try {
    const added = commandAt(REPO, 'git', ['worktree', 'add', '--detach', checkout, repairCommit]);
    if (!added.ok) fail(`could not create pre-push repair verification worktree: ${added.stderr}`);
    const nodeModules = path.join(REPO, 'node_modules');
    if (fs.existsSync(nodeModules)) fs.symlinkSync(nodeModules, path.join(checkout, 'node_modules'), 'dir');
    const ci = commandAt(checkout, process.execPath, ['scripts/ci.mjs']);
    if (!ci.ok) fail(`pre-push repair full CI failed: ${ci.stderr || ci.stdout}`);
    return {
      base_commit: baseCommit,
      commit: repairCommit,
      paths,
      full_ci_exit: 0,
      full_ci_stdout_sha256: sha256(Buffer.from(ci.stdout)),
      full_ci_stderr_sha256: sha256(Buffer.from(ci.stderr)),
    };
  } finally {
    if (fs.existsSync(checkout)) commandAt(REPO, 'git', ['worktree', 'remove', '--force', checkout]);
    fs.rmSync(root, { recursive: true, force: true });
  }
}

const PRODUCTION_ADAPTER = Object.freeze({
  now: () => new Date().toISOString(),
  nonce: () => randomBytes(16).toString('hex'),
  loadProof: (options) => validateProof(options),
  loadPublication: (options) =>
    readCanonical(
      options.get('publication'),
      options.get('publication-sha256'),
      [
        { schema: 1, type: 'SessionRelayPublicationReceiptV1' },
        { schema: 2, type: 'SessionRelayPublicationReceiptV2' },
      ],
      '--publication',
    ),
  loadPublicRelease: (options) =>
    readCanonical(
      options.get('public-release'),
      options.get('public-release-sha256'),
      [
        { schema: 1, type: 'PublicReleaseReceiptV1' },
        { schema: 2, type: 'PublicReleaseReceiptV2' },
        { schema: 3, type: 'PublicReleaseReceiptV3' },
      ],
      '--public-release',
    ),
  loadRetryReceipt: (options) =>
    readCanonical(options.get('retry-failed'), options.get('retry-failed-sha256'), RECEIPT_TYPE, '--retry-failed'),
  remoteRef,
  isAncestor,
  isPublicAncestor,
  readJournal,
  validatePrepushRepair: validatePrepushRepairCommit,
  createLockCommit: ({ nonce }) =>
    createCommit(
      canonicalize({
        schema: 1,
        type: 'PromotionLockV1',
        transaction_ref: LEGACY_PROMOTION_TRANSACTION_REF,
        lock_ref: LEGACY_PROMOTION_LOCK_REF,
        nonce,
      }),
      null,
    ),
  appendJournal,
  createLock,
  pushMain: ({ commit, expected }) =>
    command('git', ['push', 'origin', `--force-with-lease=refs/heads/main:${expected}`, `${commit}:refs/heads/main`]),
  releaseState: productionReleaseState,
  compatibilityState,
  validateCommitTransition,
  runPrepushSmoke: ({ docksKitRelease, sourceCommit, sessionRelayAssets, publicReleaseCommit }) =>
    runSmoke({ docksKitRelease, sourceCommit, exactSource: true, sessionRelayAssets, publicReleaseCommit }),
  runLiveSmoke: ({ docksKitRelease, sessionRelayAssets, publicReleaseCommit }) =>
    runSmoke({ docksKitRelease, exactSource: false, sessionRelayAssets, publicReleaseCommit }),
  restoreCompatibility,
  reapplyCompatibility,
  assertReceiptOutputAvailable,
  writeReceipt,
});

export const CURRENT_PRODUCTION_ADAPTER = Object.freeze({
  now: () => new Date().toISOString(),
  loadProof: (options) => validateProof(options),
  loadPublication: (options) =>
    readCanonical(
      options.get('publication'),
      options.get('publication-sha256'),
      { schema: 2, type: 'SessionRelayPublicationReceiptV2' },
      '--publication',
    ),
  loadPublicRelease: (options) =>
    readCanonical(
      options.get('public-release'),
      options.get('public-release-sha256'),
      [
        { schema: 2, type: 'PublicReleaseReceiptV2' },
        { schema: 3, type: 'PublicReleaseReceiptV3' },
      ],
      '--public-release',
    ),
  remoteRef,
  isAncestor,
  isPublicAncestor,
  currentReleaseState: () => releaseState(currentPublicationAdapter),
  promoteStable({ tag, releaseDatabaseId, body }) {
    if (
      tag !== CURRENT_TAG ||
      !Number.isSafeInteger(releaseDatabaseId) ||
      releaseDatabaseId <= 0 ||
      body !== CURRENT_STABLE_BODY
    ) {
      fail('current stable promotion mutation identity is invalid');
    }
    currentPublicationAdapter.editStable();
  },
  assertReceiptOutputAvailable,
  writeReceipt,
});
export function validatePromotionReceiptForFinalization(receipt, context, injectedAdapter = PRODUCTION_ADAPTER) {
  validatePromotionReceipt(receipt);
  const current = [2, 3].includes(receipt.schema);
  exactKeys(
    context,
    current ? ['proof', 'publication', 'publicRelease'] : ['proof', 'publication'],
    'promotion finalization validation context',
  );
  const { proof, publication, publicRelease = null } = context;
  if (current) {
    if (!record(proof) || !record(proof.value)) fail('current source proof is invalid');
    assertDigest(proof.digest, 'current source proof digest');
    validateSourcePreparationProof(proof.value);
    validatePublicationReceipt(publication, proof, 'current staged publication');
    validatePublicReleaseReceipt(publicRelease, { publication });
    const publicPlan =
      publicRelease.value.schema === 3 ? publicRelease.value.public_plan.plan_run : publicRelease.value.public_plan;
    const publicPlanPath =
      publicRelease.value.schema === 3 ? publicRelease.value.public_plan.finished_path : publicPlan.path;
    const publicPlanStatus = publicRelease.value.schema === 3 ? 'finished' : publicPlan.status;
    const publicFinishedAt =
      publicRelease.value.schema === 3 ? publicRelease.value.public_plan.finished_at : publicPlan.finished_at;
    if (
      receipt.public_release_receipt_sha256 !== publicRelease.digest ||
      receipt.public_child.repository_id !== publicRelease.value.repository_id ||
      receipt.public_child.goal_id !== publicPlan.goal_id ||
      receipt.public_child.run_id !== publicPlan.run_id ||
      receipt.public_child.version !== publicRelease.value.version ||
      receipt.public_child.tag !== publicRelease.value.tag ||
      receipt.public_child.npm_package !== publicRelease.value.npm.package ||
      receipt.public_child.npm_version !== publicRelease.value.npm.version ||
      receipt.public_child.plan_path !== publicPlanPath ||
      receipt.public_child.status !== publicPlanStatus ||
      receipt.public_child.finished_at !== publicFinishedAt
    ) {
      fail('current stable finalization public receipt binding does not match the exact finished companion');
    }
    const publicationAssets = [...publication.value.assets].sort((left, right) => left.name.localeCompare(right.name));
    const stagedAssets = [...receipt.staged_release.assets].sort((left, right) => left.name.localeCompare(right.name));
    if (
      receipt.source_proof_sha256 !== proof.digest ||
      receipt.reviewed_source_commit !== proof.value.implementation_commit ||
      receipt.docks_plan.implementation_commit !== proof.value.implementation_commit ||
      receipt.docks_plan.completion_review_sha256 !== proof.value.completion_review.result_sha256 ||
      receipt.publication_receipt_sha256 !== publication.digest ||
      receipt.staged_release.release_database_id !== publication.value.release_database_id ||
      receipt.staged_release.tag_commit !== publication.value.tag_commit ||
      receipt.staged_release.workflow_run_id !== publication.value.workflow.run_id ||
      receipt.staged_release.workflow_run_attempt !== publication.value.workflow.attempt ||
      canonicalize(stagedAssets) !== canonicalize(publicationAssets)
    ) {
      fail('current promotion receipt does not match its reviewed proof or exact staged publication');
    }
    if (
      Date.parse(publication.value.created_at) >= Date.parse(receipt.public_child.finished_at) ||
      Date.parse(receipt.public_child.finished_at) >= Date.parse(receipt.completed_at)
    ) {
      fail('current stable finalization requires prerelease, then finished public child, then promotion');
    }
    return receipt;
  }
  validateProofBinding(proof);
  validatePublication(publication, proof);
  if (
    receipt.source_proof_sha256 !== proof.digest ||
    receipt.publication_receipt_sha256 !== publication.digest ||
    receipt.tag_commit !== proof.value.tag_commit ||
    receipt.promoted_commit !== proof.value.promoted_commit ||
    canonicalize(receipt.source_ancestry) !== canonicalize(proof.value.source_ancestry) ||
    canonicalize(receipt.non_plan_tree_equivalence) !== canonicalize(proof.value.non_plan_tree_equivalence) ||
    receipt.public_repository_id !== proof.value.public_repository_id ||
    receipt.public_reviewed_commit !== proof.value.public_reviewed_commit ||
    receipt.public_tag_commit !== receipt.public_release_commit ||
    receipt.publication_release_id !== publication.value.release_database_id ||
    canonicalize(receipt.session_relay_assets) !== canonicalize(publication.value.assets)
  ) {
    fail('promotion receipt does not match its finalization proof/publication context');
  }
  const adapter = validateAdapter(injectedAdapter);
  if (!adapter.isPublicAncestor(proof.value.public_reviewed_commit, receipt.public_release_commit)) {
    fail('promotion public release commit has no reviewed companion ancestor');
  }
  for (const commit of [proof.value.source_commit, proof.value.tag_commit, proof.value.promoted_commit]) {
    if (!adapter.isAncestor(commit, receipt.expected_origin_main))
      fail('expected origin/main is not descended from the promotion receipt lineage');
  }
  const tip = adapter.remoteRef(LEGACY_PROMOTION_TRANSACTION_REF);
  if (tip !== receipt.terminal_journal_commit) fail('promotion receipt terminal journal tip is not authoritative');
  const validated = validatePromotionJournal(adapter.readJournal(LEGACY_PROMOTION_TRANSACTION_REF, tip), tip);
  const reconstructed = receiptFromTerminal(validated);
  if (canonicalize(reconstructed) !== canonicalize(receipt))
    fail('promotion receipt does not canonically reconstruct from the authoritative journal');
  validateTerminalAuthority(adapter, validated, receipt, true);
  return receipt;
}

function append(adapter, chain, entry) {
  const prior = chain.length === 0 ? null : chain.at(-1).commit;
  if (entry.prior_entry_commit !== prior) fail('journal append prior does not match the validated tip');
  const prospectiveCommit = '0'.repeat(40);
  validatePromotionJournal(
    [...chain, { commit: prospectiveCommit, parent: prior, entry: clone(entry) }],
    prospectiveCommit,
  );
  const commit = adapter.appendJournal({ ref: LEGACY_PROMOTION_TRANSACTION_REF, entry, prior });
  assertCommit(commit, 'appended journal commit');
  const item = { commit, parent: prior, entry: clone(entry) };
  const next = [...chain, item];
  validatePromotionJournal(next, commit);
  return next;
}

function appendOrdinary(adapter, chain, phase, state) {
  const current = chain.at(-1);
  const entry = journalEntry(
    current.entry.attempt,
    current.entry.sequence + 1,
    phase,
    current.commit,
    current.entry.immutable,
    state,
    adapter.now(),
  );
  return append(adapter, chain, entry);
}

function appendTerminal(
  adapter,
  chain,
  proof,
  publication,
  phase,
  outcome,
  retryable,
  state = chain.at(-1).entry.state,
) {
  const entry = makeTerminalEntry(proof, publication, chain.at(-1), phase, outcome, retryable, adapter, state);
  return append(adapter, chain, entry);
}

function reconcileInputs(validated, proof, publication, publicRelease, options) {
  const immutable = validated.tip.entry.immutable;
  const expected = {
    repository_id: REPOSITORY_ID,
    version: LEGACY_PROMOTION_VERSION,
    source_proof_sha256: proof.digest,
    publication_receipt_sha256: publication.digest,
    tag_commit: proof.value.tag_commit,
    promoted_commit: proof.value.promoted_commit,
    expected_origin_main: options.get('expected-origin-main'),
    docks_kit_repository: PUBLIC_REPOSITORY_ID,
    docks_kit_release: options.get('docks-kit-release'),
    transaction_ref: LEGACY_PROMOTION_TRANSACTION_REF,
    lock_ref: LEGACY_PROMOTION_LOCK_REF,
    publication_release_id: publication.value.release_database_id,
    publication_assets_sha256: sha256(Buffer.from(canonicalize(publication.value.assets))),
    public_repository_id: proof.value.public_repository_id,
    public_reviewed_commit: proof.value.public_reviewed_commit,
    public_release_commit: publicRelease.value.release_commit,
    public_release_receipt_sha256: publicRelease.digest,
  };
  for (const [key, value] of Object.entries(expected))
    if (canonicalize(immutable[key]) !== canonicalize(value)) fail(`promotion immutable identity mismatch: ${key}`);
}
function validateTerminalAuthority(
  adapter,
  validated,
  receipt = receiptFromTerminal(validated),
  allowStableSuccess = false,
) {
  const live = adapter.releaseState();
  const main = adapter.remoteRef('refs/heads/main');
  const lock = adapter.remoteRef(LEGACY_PROMOTION_LOCK_REF);
  if (receipt.outcome === 'manual_incident') {
    const observed = validated.tip.entry.state;
    if (
      canonicalize(live) !== canonicalize(observed.observed_release) ||
      main !== observed.origin_main ||
      lock !== observed.observed_lock
    )
      fail('terminal manual incident authority snapshot changed');
    if (main !== null) {
      const compatibility = currentCompatibility(adapter, {
        expectedOriginMain: receipt.expected_origin_main,
        promotedCommit: receipt.promoted_commit,
      });
      if (!mapsEqual(compatibility.current, observed.compatibility.current))
        fail('terminal manual incident compatibility-set conflict');
    }
    return receipt;
  }
  const releaseStateAllowed =
    live.prerelease === true || (allowStableSuccess && receipt.outcome === 'success' && live.prerelease === false);
  if (
    live.repository_id !== REPOSITORY_ID ||
    live.tag !== LEGACY_PROMOTION_TAG ||
    live.commit !== receipt.tag_commit ||
    live.release_database_id !== receipt.publication_release_id ||
    !releaseStateAllowed
  )
    fail('terminal receipt recovery release identity conflict');
  validateAssets(live.assets, 'terminal recovery authoritative Release', true);
  if (canonicalize(live.assets) !== canonicalize(receipt.session_relay_assets))
    fail('terminal receipt recovery Release asset conflict');
  if (main !== receipt.observed_origin_main) fail('terminal receipt recovery origin/main conflict');
  if (lock !== receipt.lock_commit) fail('terminal receipt recovery lock contention');
  const compatibility = currentCompatibility(adapter, {
    expectedOriginMain: receipt.expected_origin_main,
    promotedCommit: receipt.promoted_commit,
  });
  const expectedCurrent =
    receipt.outcome === 'restored_failure'
      ? receipt.compatibility_blobs.restored
      : receipt.outcome === 'success'
        ? (receipt.compatibility_blobs.reapplied ?? receipt.compatibility_blobs.promoted)
        : validated.tip.entry.state.compatibility.current;
  if (!mapsEqual(compatibility.current, expectedCurrent)) fail('terminal receipt recovery compatibility-set conflict');
  return receipt;
}

function recover(adapter, options, validated, allowExisting) {
  const receipt = validateTerminalAuthority(adapter, validated);
  return invocationResult(adapter, options, receipt, allowExisting);
}
function refreshStateAuthority(adapter, immutable, state) {
  const main = adapter.remoteRef('refs/heads/main');
  state.origin_main = main;
  if (main !== null) {
    const compatibility = currentCompatibility(adapter, {
      expectedOriginMain: immutable.expected_origin_main,
      promotedCommit: immutable.promoted_commit,
    });
    state.compatibility.current = clone(compatibility.current);
    state.compatibility.unexpected_paths = clone(compatibility.unexpected_paths);
  }
  return main;
}

function terminalIncident(adapter, chain, proof, publication, failure, currentMain) {
  const state = clone(chain.at(-1).entry.state);
  const immutable = chain.at(-1).entry.immutable;
  const observedMain = refreshStateAuthority(adapter, immutable, state);
  state.observed_lock = adapter.remoteRef(LEGACY_PROMOTION_LOCK_REF);
  state.observed_release = clone(adapter.releaseState());
  if (currentMain !== undefined && observedMain !== currentMain)
    state.failure = `${failure}; origin/main changed again during incident capture`;
  else state.failure = failure;
  return appendTerminal(adapter, chain, proof, publication, 'manual_incident', 'manual_incident', false, state);
}

export function promoteReviewed(options, resume = false, injectedAdapter = undefined) {
  let preloadedProof = null;
  if (injectedAdapter === undefined) {
    const currentAdapter = validateCurrentPromotionAdapter(CURRENT_PRODUCTION_ADAPTER);
    preloadedProof = currentAdapter.loadProof(options);
    if (isCurrentSourceProof(preloadedProof)) {
      return promoteCurrentReviewed(options, resume, currentAdapter, preloadedProof);
    }
  } else if (
    typeof injectedAdapter?.currentReleaseState === 'function' ||
    typeof injectedAdapter?.promoteStable === 'function'
  ) {
    const currentAdapter = validateCurrentPromotionAdapter(injectedAdapter);
    preloadedProof = currentAdapter.loadProof(options);
    if (isCurrentSourceProof(preloadedProof)) {
      return promoteCurrentReviewed(options, resume, currentAdapter, preloadedProof);
    }
  }

  const adapter = validateAdapter(injectedAdapter ?? PRODUCTION_ADAPTER);
  const proof = preloadedProof ?? adapter.loadProof(options);
  validateProofBinding(proof);
  const publication = adapter.loadPublication(options);
  validatePublication(publication, proof);
  const publicRelease = adapter.loadPublicRelease(options);
  validatePromotionPublicRelease(publicRelease, proof, publication, adapter);
  if (!COMMIT.test(options.get('expected-origin-main') ?? ''))
    fail('--expected-origin-main must be 40 lowercase hexadecimal characters');
  if (options.get('docks-kit-release') !== LEGACY_PROMOTION_DOCKS_KIT_RELEASE)
    fail(`--docks-kit-release must be ${LEGACY_PROMOTION_DOCKS_KIT_RELEASE}`);
  if (resume && options.get('transaction-ref') !== LEGACY_PROMOTION_TRANSACTION_REF) fail('transaction ref mismatch');

  let tip = adapter.remoteRef(LEGACY_PROMOTION_TRANSACTION_REF);
  let chain = [];
  let validated = null;
  if (tip !== null) {
    chain = adapter.readJournal(LEGACY_PROMOTION_TRANSACTION_REF, tip);
    tip = chain.at(-1)?.commit ?? null;
    if (tip === null) fail('authoritative promotion transaction is empty');
    validated = validatePromotionJournal(chain, tip);
    reconcileInputs(validated, proof, publication, publicRelease, options);
  }

  const repairRequested = options.get('repair-prepush') === true;
  const retryRequested = options.has('retry-failed');
  if (repairRequested && !retryRequested) fail('--repair-prepush requires the prior --retry-failed receipt pair');
  if (resume && tip === null) fail('promotion transaction is absent');
  if (!resume && !retryRequested && tip !== null) fail('promotion transaction already exists; use --resume-promotion');
  if (resume && retryRequested) fail('resume promotion cannot start a retry');
  if (resume && validated !== null && !TERMINAL_PHASES.has(validated.tip.entry.phase)) {
    adapter.assertReceiptOutputAvailable({ path: options.get('receipt-out') });
  }

  if (retryRequested) {
    if (validated === null || validated.tip.entry.phase !== 'terminal_failure' || validated.tip.entry.attempt !== 0)
      fail('retry requires a terminal attempt 0 tip');
    if (adapter.remoteRef(LEGACY_PROMOTION_LOCK_REF) !== validated.tip.entry.immutable.lock_commit)
      fail('promotion lock contention before retry', 'manual_incident');
    const prior = adapter.loadRetryReceipt(options);
    assertDigest(prior.digest, 'retry receipt digest');
    if (prior.digest !== options.get('retry-failed-sha256')) fail('retry receipt digest mismatch');
    validatePromotionReceipt(prior.value);
    const reconstructed = receiptFromTerminal(validated);
    if (canonicalize(prior.value) !== canonicalize(reconstructed))
      fail('retry receipt is not the fully validated terminal attempt');

    let immutable;
    let state;
    if (repairRequested) {
      if (!knownLegacyPrepushFailure(prior.value, validated.tip.entry.state)) {
        fail('repair-prepush is restricted to the known immutable legacy sync-target failure');
      }
      validateLiveRelease(adapter.releaseState(), publication, proof);
      if (adapter.remoteRef('refs/heads/main') !== prior.value.expected_origin_main)
        fail('repair-prepush origin/main changed', 'manual_incident');
      const compatibility = currentCompatibility(adapter, {
        expectedOriginMain: prior.value.expected_origin_main,
        promotedCommit: prior.value.promoted_commit,
      });
      if (
        compatibility.unexpected_paths.length !== 0 ||
        !mapsEqual(compatibility.current, prior.value.compatibility_blobs.before)
      )
        fail('repair-prepush compatibility authority changed');
      const repairCommit = options.get('repair-implementation-commit');
      if (!COMMIT.test(repairCommit ?? ''))
        fail('--repair-implementation-commit must be 40 lowercase hexadecimal characters');
      const repair = adapter.validatePrepushRepair({
        baseCommit: prior.value.expected_origin_main,
        repairCommit,
      });
      validatePrepushRepair(repair, 'pre-push repair evidence');
      if (repair.base_commit !== prior.value.expected_origin_main || repair.commit !== repairCommit)
        fail('pre-push repair evidence identity mismatch');
      if (adapter.remoteRef(LEGACY_PROMOTION_LOCK_REF) !== validated.tip.entry.immutable.lock_commit)
        fail('promotion lock changed during pre-push repair verification', 'manual_incident');
      validateLiveRelease(adapter.releaseState(), publication, proof);
      if (adapter.remoteRef('refs/heads/main') !== prior.value.expected_origin_main)
        fail('repair-prepush origin/main changed during verification', 'manual_incident');
      const postRepairCompatibility = currentCompatibility(adapter, {
        expectedOriginMain: prior.value.expected_origin_main,
        promotedCommit: prior.value.promoted_commit,
      });
      if (
        postRepairCompatibility.unexpected_paths.length !== 0 ||
        !mapsEqual(postRepairCompatibility.current, prior.value.compatibility_blobs.before)
      ) {
        fail('repair-prepush compatibility authority changed during verification');
      }
      immutable = {
        ...clone(validated.tip.entry.immutable),
        prior_attempt_receipt_sha256: prior.digest,
        prepush_repair: clone(repair),
      };
      state = initialState(postRepairCompatibility, prior.value.expected_origin_main);
    } else {
      if (prior.value.outcome !== 'restored_failure' || prior.value.retryable !== true)
        fail(
          'retry receipt is not the fully validated terminal restored_failure; use --repair-prepush only for an eligible pre-push failure',
        );
      if (adapter.remoteRef('refs/heads/main') !== prior.value.restore_commit) fail('retry restore head mismatch');
      const compatibility = currentCompatibility(adapter, {
        expectedOriginMain: prior.value.expected_origin_main,
        promotedCommit: prior.value.promoted_commit,
      });
      if (!mapsEqual(compatibility.current, prior.value.compatibility_blobs.restored))
        fail('retry restored compatibility set changed');
      immutable = { ...clone(validated.tip.entry.immutable), prior_attempt_receipt_sha256: prior.digest };
      state = initialState(compatibility, prior.value.restore_commit);
      state.restore_commit = prior.value.restore_commit;
      state.compatibility.restored = clone(prior.value.compatibility_blobs.restored);
      state.prepush_smoke = clone(prior.value.exact_source_smoke);
    }
    const entry = journalEntry(1, 0, 'initialized', validated.tip.commit, immutable, state, adapter.now());
    chain = append(adapter, chain, entry);
    validated = validatePromotionJournal(chain, chain.at(-1).commit);
  } else if (tip === null) {
    const currentMain = adapter.remoteRef('refs/heads/main');
    if (currentMain !== options.get('expected-origin-main')) fail('expected origin/main drift', 'manual_incident');
    if (
      !adapter.isAncestor(proof.value.tag_commit, currentMain) ||
      !adapter.isAncestor(proof.value.promoted_commit, currentMain)
    )
      fail('expected origin/main is not descended from the reviewed promotion lineage', 'manual_incident');
    validateLiveRelease(adapter.releaseState(), publication, proof);
    const compatibility = currentCompatibility(adapter, {
      expectedOriginMain: currentMain,
      promotedCommit: proof.value.promoted_commit,
    });
    if (!mapsEqual(compatibility.current, compatibility.before))
      fail('initial compatibility set does not match expected origin/main');
    const nonce = adapter.nonce();
    if (!/^[0-9a-f]{32}$/.test(nonce)) fail('promotion lock nonce is invalid');
    const lockCommit = adapter.createLockCommit({ nonce });
    assertCommit(lockCommit, 'promotion lock commit');
    const immutable = {
      repository_id: REPOSITORY_ID,
      version: LEGACY_PROMOTION_VERSION,
      source_proof_sha256: proof.digest,
      publication_receipt_sha256: publication.digest,
      tag_commit: proof.value.tag_commit,
      promoted_commit: proof.value.promoted_commit,
      expected_origin_main: currentMain,
      docks_kit_repository: PUBLIC_REPOSITORY_ID,
      docks_kit_release: LEGACY_PROMOTION_DOCKS_KIT_RELEASE,
      transaction_ref: LEGACY_PROMOTION_TRANSACTION_REF,
      lock_ref: LEGACY_PROMOTION_LOCK_REF,
      lock_nonce: nonce,
      lock_commit: lockCommit,
      publication_release_id: publication.value.release_database_id,
      publication_assets_sha256: sha256(Buffer.from(canonicalize(publication.value.assets))),
      public_repository_id: proof.value.public_repository_id,
      public_reviewed_commit: proof.value.public_reviewed_commit,
      public_release_commit: publicRelease.value.release_commit,
      public_release_receipt_sha256: publicRelease.digest,
      prior_attempt_receipt_sha256: null,
      prepush_repair: null,
    };
    chain = append(
      adapter,
      [],
      journalEntry(0, 0, 'initialized', null, immutable, initialState(compatibility, currentMain), adapter.now()),
    );
    validated = validatePromotionJournal(chain, chain.at(-1).commit);
  }
  if (validated === null) fail('promotion transaction could not be initialized');
  if (TERMINAL_PHASES.has(validated.tip.entry.phase)) return recover(adapter, options, validated, resume);

  for (;;) {
    const current = chain.at(-1);
    const { entry } = current;
    const immutable = entry.immutable;
    const primaryAttempt = entry.attempt === 0 || (immutable.prepush_repair ?? null) !== null;
    const state = clone(entry.state);
    const main = adapter.remoteRef('refs/heads/main');
    const lock = adapter.remoteRef(LEGACY_PROMOTION_LOCK_REF);
    if (entry.phase === 'initialized') {
      if (lock === null && entry.attempt === 0) {
        try {
          adapter.createLock({ ref: LEGACY_PROMOTION_LOCK_REF, commit: immutable.lock_commit, prior: null });
          chain = appendOrdinary(adapter, chain, 'locked', state);
          continue;
        } catch (error) {
          if (simulatedCrash(error)) throw error;
          if (adapter.remoteRef(LEGACY_PROMOTION_LOCK_REF) !== immutable.lock_commit) {
            chain = terminalIncident(
              adapter,
              chain,
              proof,
              publication,
              `promotion lock acquisition failed: ${error.message}`,
              main,
            );
            return recover(adapter, options, validatePromotionJournal(chain, chain.at(-1).commit), resume);
          }
        }
      }
      if (lock !== immutable.lock_commit && adapter.remoteRef(LEGACY_PROMOTION_LOCK_REF) !== immutable.lock_commit) {
        chain = terminalIncident(adapter, chain, proof, publication, 'promotion lock contention', main);
        return recover(adapter, options, validatePromotionJournal(chain, chain.at(-1).commit), resume);
      }
      chain = appendOrdinary(adapter, chain, 'locked', state);
      continue;
    }
    if (lock !== immutable.lock_commit) {
      chain = terminalIncident(adapter, chain, proof, publication, 'promotion lock contention', main);
      return recover(adapter, options, validatePromotionJournal(chain, chain.at(-1).commit), resume);
    }
    try {
      validateLiveRelease(adapter.releaseState(), publication, proof);
    } catch (error) {
      chain = terminalIncident(
        adapter,
        chain,
        proof,
        publication,
        `authoritative release conflict: ${error.message}`,
        main,
      );
      return recover(adapter, options, validatePromotionJournal(chain, chain.at(-1).commit), resume);
    }

    if (primaryAttempt && entry.phase === 'locked') {
      if (![immutable.expected_origin_main, immutable.promoted_commit].includes(main)) {
        chain = terminalIncident(adapter, chain, proof, publication, 'origin/main changed before pre-push smoke', main);
        return recover(adapter, options, validatePromotionJournal(chain, chain.at(-1).commit), resume);
      }
      let result;
      try {
        result = adapter.runPrepushSmoke({
          docksKitRepository: PUBLIC_REPOSITORY_ID,
          docksKitRelease: immutable.docks_kit_release,
          sourceCommit: immutable.tag_commit,
          sessionRelayAssets: publication.value.assets,
          publicReleaseCommit: immutable.public_release_commit,
        });
      } catch (error) {
        result = { ok: false, evidence: null, error: error.message };
      }
      const prepushBindingError = result.ok ? smokeSuccessError(result.evidence, 'exact_source') : null;
      if (prepushBindingError !== null) result = { ...result, ok: false, error: prepushBindingError };
      state.prepush_smoke = clone(result.evidence);
      if (!result.ok) {
        state.failure = result.error ?? 'exact-source pre-push smoke failed';
        chain = appendTerminal(adapter, chain, proof, publication, 'terminal_failure', 'failure', false, state);
        return recover(adapter, options, validatePromotionJournal(chain, chain.at(-1).commit), resume);
      }
      chain = appendOrdinary(adapter, chain, 'prepush_passed', state);
      continue;
    }

    if (primaryAttempt && entry.phase === 'prepush_passed') {
      if (main === immutable.expected_origin_main && main !== immutable.promoted_commit) {
        try {
          adapter.pushMain({ commit: immutable.promoted_commit, expected: immutable.expected_origin_main });
        } catch (error) {
          if (simulatedCrash(error)) throw error;
          const afterFailure = adapter.remoteRef('refs/heads/main');
          if (afterFailure === immutable.expected_origin_main) {
            state.failure = `main CAS push failed: ${error.message}`;
            chain = appendTerminal(adapter, chain, proof, publication, 'terminal_failure', 'failure', false, state);
            return recover(adapter, options, validatePromotionJournal(chain, chain.at(-1).commit), resume);
          }
          if (afterFailure !== immutable.promoted_commit) {
            chain = terminalIncident(
              adapter,
              chain,
              proof,
              publication,
              `main CAS push conflicted: ${error.message}`,
              afterFailure,
            );
            return recover(adapter, options, validatePromotionJournal(chain, chain.at(-1).commit), resume);
          }
        }
      }
      const observed = adapter.remoteRef('refs/heads/main');
      if (observed !== immutable.promoted_commit) {
        chain = terminalIncident(
          adapter,
          chain,
          proof,
          publication,
          'origin/main is neither expected nor PROMOTED_COMMIT',
          observed,
        );
        return recover(adapter, options, validatePromotionJournal(chain, chain.at(-1).commit), resume);
      }
      const compatibility = currentCompatibility(adapter, {
        expectedOriginMain: immutable.expected_origin_main,
        promotedCommit: immutable.promoted_commit,
      });
      if (compatibility.unexpected_paths.length !== 0 || !mapsEqual(compatibility.current, compatibility.promoted)) {
        chain = terminalIncident(
          adapter,
          chain,
          proof,
          publication,
          'promoted compatibility set does not match PROMOTED_COMMIT',
          observed,
        );
        return recover(adapter, options, validatePromotionJournal(chain, chain.at(-1).commit), resume);
      }
      state.origin_main = observed;
      state.pushed_commit = immutable.promoted_commit;
      state.compatibility.current = clone(compatibility.current);
      state.compatibility.unexpected_paths = [];
      chain = appendOrdinary(adapter, chain, 'main_pushed', state);
      continue;
    }

    if (primaryAttempt && entry.phase === 'main_pushed') {
      if (main === null) {
        chain = terminalIncident(
          adapter,
          chain,
          proof,
          publication,
          'origin/main was deleted after promotion push',
          null,
        );
        return recover(adapter, options, validatePromotionJournal(chain, chain.at(-1).commit), resume);
      }
      const compatibility = currentCompatibility(adapter, {
        expectedOriginMain: immutable.expected_origin_main,
        promotedCommit: immutable.promoted_commit,
      });
      if (main !== immutable.promoted_commit) {
        const transition = adapter.validateCommitTransition({
          kind: 'restore',
          commit: main,
          parent: immutable.promoted_commit,
          source: immutable.expected_origin_main,
          paths: compatibility.paths,
        });
        if (
          transition.valid &&
          transition.verification_ok &&
          compatibility.unexpected_paths.length === 0 &&
          mapsEqual(compatibility.current, compatibility.before)
        ) {
          state.origin_main = main;
          state.restore_commit = main;
          state.compatibility.current = clone(compatibility.current);
          state.compatibility.unexpected_paths = [];
          state.compatibility.restored = clone(compatibility.current);
          state.post_restore = clone(transition.recorded_parity);
          state.live_smoke = clone(transition.live_smoke);
          chain = appendOrdinary(adapter, chain, 'restore_pushed', state);
          continue;
        }
        chain = terminalIncident(
          adapter,
          chain,
          proof,
          publication,
          'origin/main is not the uniquely validated restore commit',
          main,
        );
        return recover(adapter, options, validatePromotionJournal(chain, chain.at(-1).commit), resume);
      }
      let liveResult;
      try {
        liveResult = adapter.runLiveSmoke({
          docksKitRepository: PUBLIC_REPOSITORY_ID,
          docksKitRelease: immutable.docks_kit_release,
          sessionRelayAssets: publication.value.assets,
          publicReleaseCommit: immutable.public_release_commit,
        });
      } catch (error) {
        liveResult = { ok: false, definitive: true, evidence: failedLiveSmoke(error, state), error: error.message };
      }
      const liveBindingError = liveResult.ok
        ? smokeSuccessError(liveResult.evidence, 'live', state.prepush_smoke)
        : null;
      if (liveBindingError !== null)
        liveResult = { ...liveResult, ok: false, definitive: true, error: liveBindingError };
      state.live_smoke = clone(liveResult.evidence);
      if (liveResult.ok) {
        chain = appendOrdinary(adapter, chain, 'live_passed', state);
        continue;
      }
      state.failure = liveResult.error ?? 'live install/sync smoke failed';
      if (!liveResult.definitive) {
        chain = appendTerminal(adapter, chain, proof, publication, 'manual_incident', 'manual_incident', false, state);
        return recover(adapter, options, validatePromotionJournal(chain, chain.at(-1).commit), resume);
      }
      let restored;
      try {
        restored = adapter.restoreCompatibility({
          expected: immutable.expected_origin_main,
          promoted: immutable.promoted_commit,
          liveSmoke: state.live_smoke,
          failure: state.failure,
        });
      } catch (error) {
        if (simulatedCrash(error)) throw error;
        chain = terminalIncident(
          adapter,
          chain,
          proof,
          publication,
          `compatibility restore mutation failed: ${error.message}`,
        );
        return recover(adapter, options, validatePromotionJournal(chain, chain.at(-1).commit), resume);
      }
      if (!restored.ok) {
        state.failure = restored.error ?? 'compatibility restore failed';
        if (!restored.definitive) {
          chain = terminalIncident(adapter, chain, proof, publication, state.failure);
          return recover(adapter, options, validatePromotionJournal(chain, chain.at(-1).commit), resume);
        }
        if (adapter.remoteRef('refs/heads/main') !== immutable.promoted_commit) {
          chain = terminalIncident(
            adapter,
            chain,
            proof,
            publication,
            'origin/main moved while compatibility restore verification ran',
          );
          return recover(adapter, options, validatePromotionJournal(chain, chain.at(-1).commit), resume);
        }
        refreshStateAuthority(adapter, immutable, state);
        state.restore_commit = null;
        state.compatibility.restored = null;
        state.post_restore = null;
        chain = appendTerminal(adapter, chain, proof, publication, 'terminal_failure', 'failure', false, state);
        return recover(adapter, options, validatePromotionJournal(chain, chain.at(-1).commit), resume);
      }
      const transition = adapter.validateCommitTransition({
        kind: 'restore',
        commit: restored.commit,
        parent: immutable.promoted_commit,
        source: immutable.expected_origin_main,
        paths: state.compatibility.paths,
      });
      if (
        !transition.valid ||
        !transition.verification_ok ||
        adapter.remoteRef('refs/heads/main') !== restored.commit
      ) {
        chain = terminalIncident(
          adapter,
          chain,
          proof,
          publication,
          'compatibility restore commit failed authoritative validation',
          adapter.remoteRef('refs/heads/main'),
        );
        return recover(adapter, options, validatePromotionJournal(chain, chain.at(-1).commit), resume);
      }
      const restoredBlobs = normalizeCompatibilityBlobs(
        state.compatibility.paths,
        restored.blobs.restored,
        'compatibility restore blobs',
      );
      state.origin_main = restored.commit;
      state.restore_commit = restored.commit;
      state.compatibility.current = clone(restoredBlobs);
      state.compatibility.unexpected_paths = [];
      state.compatibility.restored = clone(restoredBlobs);
      state.post_restore = clone(transition.recorded_parity ?? restored.parity);
      chain = appendOrdinary(adapter, chain, 'restore_pushed', state);
      continue;
    }

    if (primaryAttempt && entry.phase === 'live_passed') {
      chain = appendTerminal(adapter, chain, proof, publication, 'terminal_success', 'success', false);
      return recover(adapter, options, validatePromotionJournal(chain, chain.at(-1).commit), resume);
    }

    if (entry.phase === 'restore_pushed') {
      const retryable = entry.attempt === 0;
      chain = appendTerminal(adapter, chain, proof, publication, 'terminal_failure', 'restored_failure', retryable);
      return recover(adapter, options, validatePromotionJournal(chain, chain.at(-1).commit), resume);
    }

    if (entry.attempt === 1 && (immutable.prepush_repair ?? null) === null && entry.phase === 'locked') {
      if (main === null) {
        chain = terminalIncident(
          adapter,
          chain,
          proof,
          publication,
          'origin/main was deleted before compatibility reapply',
          null,
        );
        return recover(adapter, options, validatePromotionJournal(chain, chain.at(-1).commit), resume);
      }
      const compatibility = currentCompatibility(adapter, {
        expectedOriginMain: immutable.expected_origin_main,
        promotedCommit: immutable.promoted_commit,
      });
      if (main !== entry.state.origin_main) {
        const transition = adapter.validateCommitTransition({
          kind: 'reapply',
          commit: main,
          parent: entry.state.origin_main,
          source: immutable.promoted_commit,
          paths: compatibility.paths,
        });
        if (
          transition.valid &&
          transition.verification_ok &&
          compatibility.unexpected_paths.length === 0 &&
          mapsEqual(compatibility.current, compatibility.promoted)
        ) {
          state.origin_main = main;
          state.reapply_commit = main;
          state.compatibility.current = clone(compatibility.current);
          state.compatibility.unexpected_paths = [];
          state.compatibility.reapplied = clone(compatibility.current);
          chain = appendOrdinary(adapter, chain, 'reapply_pushed', state);
          continue;
        }
        chain = terminalIncident(
          adapter,
          chain,
          proof,
          publication,
          'retry head is not the uniquely validated reapply commit',
          main,
        );
        return recover(adapter, options, validatePromotionJournal(chain, chain.at(-1).commit), resume);
      }
      if (
        compatibility.unexpected_paths.length !== 0 ||
        !mapsEqual(compatibility.current, entry.state.compatibility.restored)
      ) {
        chain = terminalIncident(
          adapter,
          chain,
          proof,
          publication,
          'retry restore head or compatibility set changed',
          main,
        );
        return recover(adapter, options, validatePromotionJournal(chain, chain.at(-1).commit), resume);
      }
      let reapplied;
      try {
        reapplied = adapter.reapplyCompatibility({ expected: main, promoted: immutable.promoted_commit });
      } catch (error) {
        if (simulatedCrash(error)) throw error;
        chain = terminalIncident(
          adapter,
          chain,
          proof,
          publication,
          `compatibility reapply mutation failed: ${error.message}`,
        );
        return recover(adapter, options, validatePromotionJournal(chain, chain.at(-1).commit), resume);
      }
      if (!reapplied.ok) {
        state.failure = reapplied.error ?? 'compatibility reapply failed';
        if (!reapplied.definitive) {
          chain = terminalIncident(adapter, chain, proof, publication, state.failure);
          return recover(adapter, options, validatePromotionJournal(chain, chain.at(-1).commit), resume);
        }
        refreshStateAuthority(adapter, immutable, state);
        state.restore_commit = null;
        state.compatibility.restored = null;
        state.post_restore = null;
        chain = appendTerminal(adapter, chain, proof, publication, 'terminal_failure', 'failure', false, state);
        return recover(adapter, options, validatePromotionJournal(chain, chain.at(-1).commit), resume);
      }
      const transition = adapter.validateCommitTransition({
        kind: 'reapply',
        commit: reapplied.commit,
        parent: main,
        source: immutable.promoted_commit,
        paths: compatibility.paths,
      });
      if (
        !transition.valid ||
        !transition.verification_ok ||
        adapter.remoteRef('refs/heads/main') !== reapplied.commit
      ) {
        chain = terminalIncident(
          adapter,
          chain,
          proof,
          publication,
          'compatibility reapply commit failed authoritative validation',
          adapter.remoteRef('refs/heads/main'),
        );
        return recover(adapter, options, validatePromotionJournal(chain, chain.at(-1).commit), resume);
      }
      const reappliedBlobs = normalizeCompatibilityBlobs(
        state.compatibility.paths,
        reapplied.blobs.reapplied,
        'compatibility reapply blobs',
      );
      state.origin_main = reapplied.commit;
      state.reapply_commit = reapplied.commit;
      state.compatibility.current = clone(reappliedBlobs);
      state.compatibility.unexpected_paths = [];
      state.compatibility.reapplied = clone(reappliedBlobs);
      chain = appendOrdinary(adapter, chain, 'reapply_pushed', state);
      continue;
    }

    if (entry.attempt === 1 && (immutable.prepush_repair ?? null) === null && entry.phase === 'reapply_pushed') {
      if (main === null) {
        chain = terminalIncident(
          adapter,
          chain,
          proof,
          publication,
          'origin/main was deleted after compatibility reapply',
          null,
        );
        return recover(adapter, options, validatePromotionJournal(chain, chain.at(-1).commit), resume);
      }
      if (main !== entry.state.reapply_commit) {
        const compatibility = currentCompatibility(adapter, {
          expectedOriginMain: immutable.expected_origin_main,
          promotedCommit: immutable.promoted_commit,
        });
        const transition = adapter.validateCommitTransition({
          kind: 'restore',
          commit: main,
          parent: entry.state.reapply_commit,
          source: immutable.expected_origin_main,
          paths: compatibility.paths,
        });
        if (
          transition.valid &&
          transition.verification_ok &&
          compatibility.unexpected_paths.length === 0 &&
          mapsEqual(compatibility.current, compatibility.before)
        ) {
          state.origin_main = main;
          state.restore_commit = main;
          state.compatibility.current = clone(compatibility.current);
          state.compatibility.unexpected_paths = [];
          state.compatibility.restored = clone(compatibility.current);
          state.post_restore = clone(transition.recorded_parity);
          state.live_smoke = clone(transition.live_smoke);
          chain = appendOrdinary(adapter, chain, 'restore_pushed', state);
          continue;
        }
        chain = terminalIncident(
          adapter,
          chain,
          proof,
          publication,
          'origin/main is not the uniquely validated post-reapply restore commit',
          main,
        );
        return recover(adapter, options, validatePromotionJournal(chain, chain.at(-1).commit), resume);
      }
      let liveResult;
      try {
        liveResult = adapter.runLiveSmoke({
          docksKitRepository: PUBLIC_REPOSITORY_ID,
          docksKitRelease: immutable.docks_kit_release,
          sessionRelayAssets: publication.value.assets,
          publicReleaseCommit: immutable.public_release_commit,
        });
      } catch (error) {
        liveResult = { ok: false, definitive: true, evidence: failedLiveSmoke(error, state), error: error.message };
      }
      const liveBindingError = liveResult.ok
        ? smokeSuccessError(liveResult.evidence, 'live', state.prepush_smoke)
        : null;
      if (liveBindingError !== null)
        liveResult = { ...liveResult, ok: false, definitive: true, error: liveBindingError };
      state.live_smoke = clone(liveResult.evidence);
      if (liveResult.ok) {
        chain = appendTerminal(adapter, chain, proof, publication, 'terminal_success', 'success', false, state);
        return recover(adapter, options, validatePromotionJournal(chain, chain.at(-1).commit), resume);
      }
      state.failure = liveResult.error ?? 'post-reapply live install/sync smoke failed';
      if (!liveResult.definitive) {
        chain = appendTerminal(adapter, chain, proof, publication, 'manual_incident', 'manual_incident', false, state);
        return recover(adapter, options, validatePromotionJournal(chain, chain.at(-1).commit), resume);
      }
      let restored;
      try {
        restored = adapter.restoreCompatibility({
          expected: immutable.expected_origin_main,
          promoted: main,
          liveSmoke: state.live_smoke,
          failure: state.failure,
        });
      } catch (error) {
        if (simulatedCrash(error)) throw error;
        chain = terminalIncident(
          adapter,
          chain,
          proof,
          publication,
          `post-reapply restore mutation failed: ${error.message}`,
        );
        return recover(adapter, options, validatePromotionJournal(chain, chain.at(-1).commit), resume);
      }
      if (!restored.ok) {
        state.failure = restored.error ?? 'post-reapply restore failed';
        if (!restored.definitive) {
          chain = terminalIncident(adapter, chain, proof, publication, state.failure);
          return recover(adapter, options, validatePromotionJournal(chain, chain.at(-1).commit), resume);
        }
        if (adapter.remoteRef('refs/heads/main') !== main) {
          chain = terminalIncident(
            adapter,
            chain,
            proof,
            publication,
            'origin/main moved while post-reapply restore verification ran',
          );
          return recover(adapter, options, validatePromotionJournal(chain, chain.at(-1).commit), resume);
        }
        refreshStateAuthority(adapter, immutable, state);
        state.restore_commit = null;
        state.compatibility.restored = null;
        state.post_restore = null;
        chain = appendTerminal(adapter, chain, proof, publication, 'terminal_failure', 'failure', false, state);
        return recover(adapter, options, validatePromotionJournal(chain, chain.at(-1).commit), resume);
      }
      const transition = adapter.validateCommitTransition({
        kind: 'restore',
        commit: restored.commit,
        parent: main,
        source: immutable.expected_origin_main,
        paths: state.compatibility.paths,
      });
      if (
        !transition.valid ||
        !transition.verification_ok ||
        adapter.remoteRef('refs/heads/main') !== restored.commit
      ) {
        chain = terminalIncident(
          adapter,
          chain,
          proof,
          publication,
          'post-reapply restore failed authoritative validation',
          adapter.remoteRef('refs/heads/main'),
        );
        return recover(adapter, options, validatePromotionJournal(chain, chain.at(-1).commit), resume);
      }
      const restoredBlobs = normalizeCompatibilityBlobs(
        state.compatibility.paths,
        restored.blobs.restored,
        'post-reapply restore blobs',
      );
      state.origin_main = restored.commit;
      state.restore_commit = restored.commit;
      state.compatibility.current = clone(restoredBlobs);
      state.compatibility.unexpected_paths = [];
      state.compatibility.restored = clone(restoredBlobs);
      state.post_restore = clone(transition.recorded_parity ?? restored.parity);
      chain = appendOrdinary(adapter, chain, 'restore_pushed', state);
      continue;
    }

    fail(`promotion journal has no handler for attempt ${entry.attempt} phase ${entry.phase}`);
  }
}
