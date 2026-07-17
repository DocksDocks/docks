import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  COMMIT,
  LOCK_REF,
  REPOSITORY_ID,
  TRANSACTION_REF,
  VERSION,
  canonicalize,
  command,
  emitReceipt,
  fail,
  git,
  readCanonical,
  sha256,
} from './session-relay-release-core.mjs';
import { validateProof } from './session-relay-release-preparation.mjs';
import { releaseState } from './session-relay-release-publication.mjs';

function journalEntry(attempt, sequence, phase, prior, immutable, observed = {}) {
  return { schema: 1, type: 'PromotionJournalEntryV1', attempt, sequence, prior_entry_commit: prior, phase, ...immutable, observed, created_at: new Date().toISOString() };
}

function appendJournal(ref, entry, prior) {
  const tree = git(['rev-parse', 'HEAD^{tree}']);
  const args = ['commit-tree', tree, '-m', canonicalize(entry)];
  if (prior) args.push('-p', prior);
  const commit = git(args);
  const destination = prior ? `${prior}:${ref}` : ref;
  command('git', ['push', 'origin', `${commit}:${destination}`]);
  return commit;
}

function remoteRef(ref) {
  const output = command('git', ['ls-remote', 'origin', ref]);
  return output ? output.split(/\s+/)[0] : null;
}

function promotionReceipt(proof, publication, immutable, outcome, attempt, sequence, terminalCommit, priorReceipt = null) {
  return {
    schema: 1, type: 'PromotionReceiptV1', repository_id: REPOSITORY_ID, version: VERSION,
    source_proof_sha256: proof.digest, publication_receipt_sha256: publication.digest,
    tag_commit: proof.value.tag_commit, promoted_commit: proof.value.promoted_commit,
    transaction_ref: TRANSACTION_REF, attempt, terminal_sequence: sequence, terminal_journal_commit: terminalCommit,
    journal_chain_sha256: sha256(Buffer.from(`${terminalCommit}:${attempt}:${sequence}`)), prior_attempt_receipt_sha256: priorReceipt,
    lock_ref: LOCK_REF, lock_nonce: immutable.lock_nonce, expected_origin_main: immutable.expected_origin_main,
    outcome, completed_at: new Date().toISOString(),
  };
}

export function promoteReviewed(options, resume = false) {
  const proof = validateProof(options);
  const publication = readCanonical(options.get('publication'), options.get('publication-sha256'), 'SessionRelayPublicationReceiptV1', '--publication');
  if (publication.value.release_state !== 'prerelease' || publication.value.tag_commit !== proof.value.tag_commit) fail('publication receipt is not the bound prerelease');
  if (!COMMIT.test(options.get('expected-origin-main'))) fail('--expected-origin-main must be 40 lowercase hexadecimal characters');
  if (resume && options.get('transaction-ref') !== TRANSACTION_REF) fail('transaction ref mismatch');
  let priorReceipt = null;
  let attempt = 0;
  if (options.has('retry-failed')) {
    const failed = readCanonical(options.get('retry-failed'), options.get('retry-failed-sha256'), 'PromotionReceiptV1', '--retry-failed');
    if (failed.value.outcome !== 'restored_failure') fail('only a restored_failure receipt is retryable');
    priorReceipt = failed.digest;
    attempt = failed.value.attempt + 1;
    if (attempt !== 1) fail('only one retry attempt is permitted');
  }
  const currentMain = remoteRef('refs/heads/main');
  if (currentMain !== options.get('expected-origin-main')) fail('expected origin/main drift', 'manual_incident');
  let tip = remoteRef(TRANSACTION_REF);
  if (resume && !tip) fail('promotion transaction is absent');
  if (!resume && tip) fail('promotion transaction already exists; use --resume-promotion');
  const immutable = {
    repository_id: REPOSITORY_ID, version: VERSION, source_proof_sha256: proof.digest,
    publication_receipt_sha256: publication.digest, tag_commit: proof.value.tag_commit,
    promoted_commit: proof.value.promoted_commit, expected_origin_main: options.get('expected-origin-main'),
    docks_kit_release: options.get('docks-kit-release'), lock_ref: LOCK_REF,
    lock_nonce: randomBytes(16).toString('hex'), prior_attempt_receipt_sha256: priorReceipt,
  };
  let sequence = 0;
  if (!tip) {
    tip = appendJournal(TRANSACTION_REF, journalEntry(attempt, sequence, 'initialized', null, immutable, { origin_main: currentMain }), null);
  } else {
    const message = command('git', ['show', '-s', '--format=%B', tip]);
    let last;
    try { last = JSON.parse(message); } catch { fail('transaction tip is not a canonical journal entry'); }
    if (canonicalize(last) !== message.trim() || last.type !== 'PromotionJournalEntryV1') fail('transaction journal is invalid');
    if (['terminal_success', 'terminal_failure', 'manual_incident'].includes(last.phase)) fail('transaction is terminal and requires receipt recovery through the fixture/reviewed reconciler');
    sequence = last.sequence;
    Object.assign(immutable, Object.fromEntries(Object.keys(immutable).map((key) => [key, last[key]])));
  }
  if (remoteRef(LOCK_REF) && remoteRef(LOCK_REF) !== tip) fail('promotion lock contention', 'failure');
  if (!remoteRef(LOCK_REF)) command('git', ['push', 'origin', `${tip}:${LOCK_REF}`]);
  sequence += 1;
  tip = appendJournal(TRANSACTION_REF, journalEntry(attempt, sequence, 'locked', tip, immutable, { origin_main: currentMain }), tip);
  const host = process.platform === 'darwin' ? (process.arch === 'arm64' ? 'aarch64-apple-darwin' : 'x86_64-apple-darwin') : (process.arch === 'arm64' ? 'aarch64-unknown-linux-musl' : 'x86_64-unknown-linux-musl');
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'session-relay-promotion-'));
  try {
    command('gh', ['release', 'download', options.get('docks-kit-release'), '--repo', REPOSITORY_ID, '--dir', temporary]);
    const candidates = fs.readdirSync(temporary).filter((name) => name.includes(host) && !name.endsWith('.sha256'));
    if (candidates.length !== 1) fail('released docks-kit host executable is absent or ambiguous');
    const executable = path.join(temporary, candidates[0]);
    fs.chmodSync(executable, 0o755);
    command(executable, ['sync', '--help']);
  } finally { fs.rmSync(temporary, { recursive: true, force: true }); }
  sequence += 1;
  tip = appendJournal(TRANSACTION_REF, journalEntry(attempt, sequence, 'prepush_passed', tip, immutable, { origin_main: currentMain }), tip);
  command('git', ['push', 'origin', `${proof.value.promoted_commit}:refs/heads/main`]);
  sequence += 1;
  tip = appendJournal(TRANSACTION_REF, journalEntry(attempt, sequence, 'main_pushed', tip, immutable, { origin_main: proof.value.promoted_commit }), tip);
  const live = releaseState();
  if (!live.release?.prerelease || live.commit !== proof.value.tag_commit) fail('authoritative release changed after main push', 'manual_incident');
  sequence += 1;
  tip = appendJournal(TRANSACTION_REF, journalEntry(attempt, sequence, 'live_passed', tip, immutable, { origin_main: proof.value.promoted_commit }), tip);
  sequence += 1;
  tip = appendJournal(TRANSACTION_REF, journalEntry(attempt, sequence, 'terminal_success', tip, immutable, { origin_main: proof.value.promoted_commit }), tip);
  return emitReceipt(options, promotionReceipt(proof, publication, immutable, 'success', attempt, sequence, tip, priorReceipt));
}
