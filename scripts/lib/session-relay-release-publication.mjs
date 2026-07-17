import { spawnSync } from 'node:child_process';

import {
  ASSETS,
  PRERELEASE_BODY,
  REPO,
  REPOSITORY_ID,
  SHA256,
  STABLE_BODY,
  TAG,
  VERSION,
  canonicalize,
  command,
  emitReceipt,
  fail,
  ghJson,
  readCanonical,
  sha256,
} from './session-relay-release-core.mjs';
import { validateProof } from './session-relay-release-preparation.mjs';

export function releaseState() {
  let release = null;
  try { release = ghJson(`/repos/${REPOSITORY_ID}/releases/tags/${encodeURIComponent(TAG)}`); } catch {}
  const refResult = spawnSync('git', ['ls-remote', '--tags', 'origin', `refs/tags/${TAG}`, `refs/tags/${TAG}^{}`], { cwd: REPO, encoding: 'utf8', shell: false });
  if (refResult.status !== 0) fail('could not query authoritative tag state', 'failure');
  const refs = refResult.stdout.trim().split('\n').filter(Boolean).map((line) => line.split(/\s+/));
  const commit = refs.find(([, ref]) => ref.endsWith('^{}'))?.[0] ?? refs[0]?.[0] ?? null;
  return { commit, release };
}

export function normalizedAssets(release) {
  return (release.assets ?? []).map((asset) => ({
    name: asset.name, database_id: asset.id, size: asset.size,
    digest: typeof asset.digest === 'string' ? asset.digest.replace(/^sha256:/, '') : null,
  })).sort((a, b) => a.name.localeCompare(b.name));
}

export function assertCompleteAssets(assets) {
  if (assets.length !== ASSETS.length || assets.some((asset, index) => asset.name !== [...ASSETS].sort()[index])) fail('release asset set is absent, partial, or conflicting');
  if (assets.some(({ digest }) => !SHA256.test(digest ?? ''))) fail('release asset digest is missing or invalid');
}

function publicationReceipt(proof, release, transition, releaseStateName) {
  const assets = normalizedAssets(release);
  assertCompleteAssets(assets);
  return {
    schema: 1, type: 'SessionRelayPublicationReceiptV1', repository_id: REPOSITORY_ID, version: VERSION,
    source_proof_sha256: proof.digest, tag: TAG, tag_commit: proof.value.tag_commit,
    workflow: { file: '.github/workflows/build-binaries.yml', workflow_sha: proof.value.tag_commit, run_id: null, attempt: null },
    release_database_id: release.id, release_state: releaseStateName, body_sha256: sha256(Buffer.from(release.body ?? '')),
    assets, transition, created_at: new Date().toISOString(),
  };
}

export function publishReviewed(options) {
  const proof = validateProof(options);
  if (options.has('resume-publication')) readCanonical(options.get('resume-publication'), options.get('resume-publication-sha256'), 'SessionRelayPublicationReceiptV1', '--resume-publication');
  let state = releaseState();
  if (state.commit && state.commit !== proof.value.tag_commit) fail('tag conflict');
  if (state.release && !state.release.prerelease) fail('premature stable release conflict');
  let transition = 'reconciled';
  if (!state.commit) {
    command('git', ['push', 'origin', `${proof.value.tag_commit}:refs/tags/${TAG}`], { inherit: true });
    transition = 'tag_created';
  }
  if (!state.release) {
    const runs = JSON.parse(command('gh', ['run', 'list', '--workflow', 'build-binaries.yml', '--branch', TAG, '--event', 'push', '--json', 'databaseId,headSha,conclusion,status,attempt']));
    const matching = runs.filter((run) => run.headSha === proof.value.tag_commit);
    if (matching.length !== 1) fail('exactly one bound publication workflow run is required');
    command('gh', ['run', 'watch', String(matching[0].databaseId), '--exit-status'], { inherit: true });
    state = releaseState();
    transition = transition === 'tag_created' ? 'tag_and_release_created' : 'release_created';
  }
  if (!state.release || !state.release.prerelease || state.release.body !== PRERELEASE_BODY) fail('prerelease identity or staging body conflict');
  return emitReceipt(options, publicationReceipt(proof, state.release, transition, 'prerelease'));
}

export function finalizeReviewed(options) {
  const proof = validateProof(options);
  const publication = readCanonical(options.get('publication'), options.get('publication-sha256'), 'SessionRelayPublicationReceiptV1', '--publication');
  const promotion = readCanonical(options.get('promotion'), options.get('promotion-sha256'), 'PromotionReceiptV1', '--promotion');
  if (options.has('resume-finalization')) readCanonical(options.get('resume-finalization'), options.get('resume-finalization-sha256'), 'SessionRelayPublicationReceiptV1', '--resume-finalization');
  if (promotion.value.outcome !== 'success' || promotion.value.source_proof_sha256 !== proof.digest || promotion.value.publication_receipt_sha256 !== publication.digest) fail('promotion receipt is not a bound success');
  const state = releaseState();
  if (state.commit !== proof.value.tag_commit || !state.release) fail('release identity conflict');
  const before = normalizedAssets(state.release);
  assertCompleteAssets(before);
  if (canonicalize(before) !== canonicalize(publication.value.assets)) fail('release asset identities changed');
  let transition = 'already_stable';
  if (state.release.prerelease) {
    command('gh', ['release', 'edit', TAG, '--prerelease=false', '--notes', STABLE_BODY]);
    transition = 'finalized';
  } else if (state.release.body !== STABLE_BODY) fail('stable release body conflict');
  const reconciled = releaseState();
  if (reconciled.release?.prerelease || reconciled.release?.body !== STABLE_BODY) fail('stable finalization did not reconcile');
  return emitReceipt(options, publicationReceipt(proof, reconciled.release, transition, 'stable'));
}
