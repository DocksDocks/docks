import fs from 'node:fs';

import {
  LOCK_REF,
  PLUGIN,
  PRERELEASE_BODY,
  REPO,
  STABLE_BODY,
  TAG,
  TRANSACTION_REF,
  VERSION,
  canonicalPath,
  canonicalize,
  exactKeys,
  fail,
  sha256,
  writeCanonicalExclusive,
} from './session-relay-release-core.mjs';

export function positionalPlugin(argv) {
  const index = argv.indexOf('--plugin');
  return index < 0 ? 'docks' : argv[index + 1];
}

function fixtureReceipt(mode, fixture, outcome) {
  const baseTime = '2026-01-01T00:00:00.000Z';
  if (mode === 'materialize-tdd-red') return { schema: 1, type: 'TddRedReceiptV1', repository_id: fixture.repository_id, pre_production_commit: fixture.source_commit, test_paths: [], command: { cwd: REPO, argv: ['node', 'fixture'] }, exit_code: 1, stdout_sha256: '0'.repeat(64), stderr_sha256: '0'.repeat(64), captured_at: baseTime, producer: { path: 'scripts/capture-tdd-red.mjs', blob_id: fixture.source_commit, version: '1' } };
  if (mode === 'verify-source-ci') return { schema: 1, type: 'SourceCiReceiptV1', repository_id: fixture.repository_id, source_commit: fixture.source_commit, workflow: {}, bootstrap: {}, command: ['node', 'scripts/ci.mjs'], jobs_sha256: '0'.repeat(64), started_at: baseTime, completed_at: baseTime };
  if (mode === 'check-prepared') return { schema: 1, type: 'SourcePreparationCandidateV1', repository_id: fixture.repository_id, version: VERSION, source_commit: fixture.source_commit, execution_base_commit: fixture.source_commit, input_receipts: {}, checks: [], plan_path: 'docs/plans/active/session-relay-prebuilt-cli-distribution.md', plan_sha256: '0'.repeat(64), created_at: baseTime };
  if (mode === 'bind-completion') return { schema: 1, type: 'SourcePreparationProofV1', repository_id: fixture.repository_id, version: VERSION, source_commit: fixture.source_commit, tag_commit: fixture.source_commit, promoted_commit: fixture.promoted_commit, finished_plan_sha256: '0'.repeat(64), candidate_sha256: 'e'.repeat(64), completion_review_sha256: 'f'.repeat(64), bound_at: baseTime };
  if (mode === 'publish-reviewed' || mode === 'finalize-reviewed') {
    const stable = mode === 'finalize-reviewed';
    return { schema: 1, type: 'SessionRelayPublicationReceiptV1', repository_id: fixture.repository_id, version: VERSION, source_proof_sha256: 'a'.repeat(64), tag: fixture.tag, tag_commit: fixture.source_commit, workflow: { file: '.github/workflows/build-binaries.yml', workflow_sha: fixture.source_commit, run_id: 1, attempt: 1 }, release_database_id: 10, release_state: stable ? 'stable' : 'prerelease', body_sha256: sha256(Buffer.from(stable ? STABLE_BODY : PRERELEASE_BODY)), assets: fixture.assets.map((asset) => ({ ...asset, size: 1 })).sort((a, b) => a.name.localeCompare(b.name)), transition: stable ? 'finalized' : 'reconciled', created_at: baseTime };
  }
  if (mode === 'promote-reviewed' || mode === 'resume-promotion') return { schema: 1, type: 'PromotionReceiptV1', repository_id: fixture.repository_id, version: VERSION, source_proof_sha256: 'a'.repeat(64), publication_receipt_sha256: 'b'.repeat(64), tag_commit: fixture.source_commit, promoted_commit: fixture.promoted_commit, transaction_ref: TRANSACTION_REF, attempt: fixture.scenario.startsWith('retry-') ? 1 : 0, terminal_sequence: 5, terminal_journal_commit: fixture.source_commit, journal_chain_sha256: '9'.repeat(64), prior_attempt_receipt_sha256: fixture.scenario.startsWith('retry-') ? 'c'.repeat(64) : null, lock_ref: LOCK_REF, lock_nonce: 'fixture-lock', expected_origin_main: fixture.expected_origin_main, outcome, completed_at: baseTime };
  return null;
}

function fixtureJournal(fixture, outcome) {
  if (!fixture.scenario || !['success', 'conflict', 'failure', 'manual_incident', 'restored_failure'].includes(outcome)) return [];
  const attempt = fixture.scenario.startsWith('retry-') ? 1 : 0;
  let phases;
  if (outcome === 'success') phases = ['initialized', 'locked', 'prepush_passed', 'main_pushed', 'live_passed', 'terminal_success'];
  else if (outcome === 'restored_failure') phases = ['initialized', 'locked', 'prepush_passed', 'main_pushed', 'restore_pushed', 'terminal_failure'];
  else if (outcome === 'manual_incident') phases = ['initialized', 'manual_incident'];
  else if (outcome === 'failure') phases = ['initialized', 'terminal_failure'];
  else phases = [];
  return phases.map((phase, sequence) => ({ attempt, sequence, phase }));
}

function fixtureMutations(mode, fixture, outcome) {
  if (outcome === 'conflict' || fixture.scenario.includes('-recover') || fixture.scenario.startsWith('recover-')) return [];
  if (mode === 'publish-reviewed') {
    if (fixture.scenario === 'complete-prerelease') return [];
    return ['reconcile-tag', 'reconcile-workflow', 'reconcile-prerelease'];
  }
  if (mode === 'finalize-reviewed') return fixture.scenario === 'finalize-already-stable' ? [] : ['finalize-release'];
  if (mode === 'promote-reviewed' || mode === 'resume-promotion') return fixtureJournal(fixture, outcome).map(({ phase }) => phase);
  return [];
}

function writeFixtureReport(reportPath, report) {
  const target = canonicalPath(reportPath, 'SESSION_RELAY_RELEASE_REPORT', { mustExist: false, absolute: true });
  fs.writeFileSync(target, canonicalize(report), { mode: 0o600, flag: 'wx' });
}

export function runFixture(argv, parsed, parseError) {
  const fixturePath = canonicalPath(process.env.SESSION_RELAY_RELEASE_FIXTURE, 'SESSION_RELAY_RELEASE_FIXTURE', { absolute: true });
  const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
  exactKeys(fixture, ['schema', 'type', 'scenario', 'repository_id', 'source_commit', 'promoted_commit', 'expected_origin_main', 'tag', 'assets', 'expected_outcome'], 'release fixture');
  if (fixture.schema !== 1 || fixture.type !== 'SessionRelayReleaseFixtureV1') fail('release fixture schema mismatch');
  const mode = parsed?.mode ?? (['docks', 'effect-kit'].includes(positionalPlugin(argv)) ? 'legacy-release' : 'grammar');
  const outcome = fixture.expected_outcome;
  let receipt = null;
  let calls = [];
  let mutations = [];
  let journal = [];
  let state = { version: VERSION, tag: TAG };
  const forcedConflict = outcome === 'conflict' || mode === 'grammar' || parseError || fixture.scenario === 'session-relay-positional';
  if (!forcedConflict) {
    receipt = fixtureReceipt(mode, fixture, outcome);
    journal = fixtureJournal(fixture, outcome);
    mutations = fixtureMutations(mode, fixture, outcome);
    if (mode === 'legacy-release') {
      const plugin = positionalPlugin(argv);
      const bump = argv.filter((token, index) => token !== '--plugin' && argv[index - 1] !== '--plugin' && token !== '--dry-run')[0];
      const version = /^\d+\.\d+\.\d+$/.test(bump) ? bump : bump === 'major' ? '1.0.0' : bump === 'minor' ? '0.13.0' : '0.12.1';
      state = { version, tag: `${plugin}--v${version}` };
      calls = [{ argv: ['node', 'scripts/ci.mjs', '--plugin', plugin] }, { argv: ['claude', 'plugin', 'tag'] }];
      mutations = ['commit', 'push', 'tag', 'release'];
    } else if (mode === 'prepare') {
      const dry = parsed.options.get('dry-run') === true;
      state = { version: VERSION, tag: TAG, dry_run: dry, message: dry ? 'The real release will gate the exact changed tree.' : 'prepared' };
      calls = dry ? [] : [{ argv: ['node', 'scripts/ci.mjs'] }];
      mutations = dry ? [] : ['manifests', 'cargo', 'commit'];
    } else {
      calls = [{ argv: ['fixture', mode, fixture.scenario] }];
      state = mode === 'publish-reviewed' ? { tag: fixture.tag, version: VERSION, release: { prerelease: true, body: PRERELEASE_BODY } }
        : mode === 'finalize-reviewed' ? { tag: fixture.tag, version: VERSION, release: { prerelease: false, body: STABLE_BODY } }
          : { tag: fixture.tag, version: VERSION };
    }
    if (receipt && parsed?.options.has('receipt-out')) {
      const written = writeCanonicalExclusive(parsed.options.get('receipt-out'), receipt);
      process.stdout.write(`${written.digest}\n`);
    }
    if (mode === 'materialize-tdd-red') {
      for (const name of ['docks-red-out', 'public-red-out']) writeCanonicalExclusive(parsed.options.get(name), receipt);
    }
  }
  const report = { schema: 1, type: 'SessionRelayReleaseFixtureReportV1', scenario: fixture.scenario, outcome, calls, mutations, journal, receipt, state };
  writeFixtureReport(process.env.SESSION_RELAY_RELEASE_REPORT, report);
  return outcome === 'success' || outcome === 'prerelease' || outcome === 'stable';
}
