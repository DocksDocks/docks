import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

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
  noteValue,
  readCanonical,
  replaceJsonVersion,
  sha256,
  writeCanonicalExclusive,
} from './session-relay-release-core.mjs';

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
    let text = original.toString('utf8');
    if (relative.endsWith('Cargo.toml')) {
      text = text.replace(/(^\[package\][\s\S]*?^version = ")\d+\.\d+\.\d+("$)/m, `$1${VERSION}$2`);
    } else {
      text = text.replace(/(^name = "relay"\nversion = ")\d+\.\d+\.\d+("$)/m, `$1${VERSION}$2`);
    }
    if (text === original.toString('utf8') && !text.includes(`version = "${VERSION}"`)) fail(`could not locate version in ${relative}`);
    files.push({ file, original, changed: Buffer.from(text) });
  }
  if (dryRun) {
    for (const item of files) process.stdout.write(`[dry-run] would update ${path.relative(REPO, item.file)} to ${VERSION}\n`);
    process.stdout.write('[dry-run] no files changed; the real release will gate the exact changed tree with scripts/ci.mjs before committing.\n');
    return { outcome: 'success', calls: [], mutations: [], journal: fixtureJournal, receipt: null, state: { version: VERSION, tag: TAG, dry_run: true } };
  }
  ensureCleanTree();
  for (const item of files) fs.writeFileSync(item.file, item.changed);
  try {
    command('node', [path.join(REPO, 'scripts/ci.mjs'), '--plugin', PLUGIN], { inherit: true });
  } catch (error) {
    for (const item of files) fs.writeFileSync(item.file, item.original);
    throw error;
  }
  const relative = files.map(({ file }) => path.relative(REPO, file));
  command('git', ['add', '--', ...relative]);
  command('git', ['commit', '-m', `chore(release): ${PLUGIN} v${VERSION}`], { inherit: true });
  return { outcome: 'success', calls: [{ argv: ['node', 'scripts/ci.mjs', '--plugin', PLUGIN] }], mutations: relative, journal: fixtureJournal, receipt: null, state: { version: VERSION, tag: TAG, dry_run: false } };
}

export function materialize(options) {
  const planPath = canonicalPath(options.get('plan'), '--plan');
  const plan = fs.readFileSync(planPath, 'utf8');
  const docks = embeddedReceipt(plan, 'Docks TDD-red receipt', 'TddRedReceiptV1');
  const publicReceipt = embeddedReceipt(plan, 'Companion TDD-red receipt', 'TddRedReceiptV1');
  const docksOut = writeCanonicalExclusive(options.get('docks-red-out'), docks.value);
  const publicOut = writeCanonicalExclusive(options.get('public-red-out'), publicReceipt.value);
  process.stdout.write(`${docksOut.digest}\n${publicOut.digest}\n`);
  return { receipt: docks.value, state: { docks_sha256: docksOut.digest, public_sha256: publicOut.digest } };
}

export function verifyEmbedded(options) {
  const plan = fs.readFileSync(canonicalPath(options.get('plan'), '--plan'), 'utf8');
  for (const [label, type] of [
    ['Docks TDD-red receipt', 'TddRedReceiptV1'],
    ['Companion TDD-red receipt', 'TddRedReceiptV1'],
    ['Producer preflight receipt', 'ProducerPreflightReceiptV1'],
    ['Source CI receipt', 'SourceCiReceiptV1'],
    ['Source preparation candidate', 'SourcePreparationCandidateV1'],
  ]) embeddedReceipt(plan, label, type);
  const sourceCommit = noteValue(plan, 'TAG_COMMIT / SOURCE_COMMIT');
  if (!COMMIT.test(sourceCommit) || git(['rev-parse', `${sourceCommit}^{commit}`]) !== sourceCommit) fail('invalid embedded SOURCE_COMMIT');
  const changed = git(['diff', '--name-only', sourceCommit, '--', '.', ':(exclude)docs/plans/active/session-relay-prebuilt-cli-distribution.md']);
  if (changed !== '') fail('release-owned tree differs from SOURCE_COMMIT');
  return { receipt: null, state: { source_commit: sourceCommit } };
}

export function verifySourceCi(options) {
  if (!COMMIT.test(options.get('expected-commit'))) fail('--expected-commit must be 40 lowercase hexadecimal characters');
  const run = ghJson(`/repos/${REPOSITORY_ID}/actions/runs/${encodeURIComponent(options.get('run-id'))}`);
  if (run.head_sha !== options.get('expected-commit') || run.event !== 'workflow_dispatch' || run.conclusion !== 'success') fail('source CI run identity or conclusion mismatch');
  if (run.path !== '.github/workflows/ci.yml') fail('source CI used an unexpected workflow');
  const jobs = ghJson(`/repos/${REPOSITORY_ID}/actions/runs/${run.id}/jobs?per_page=100`).jobs;
  const jobText = canonicalize(jobs);
  for (const required of ['24', '--frozen-lockfile', '1.85.0', 'musl', 'scripts/ci.mjs']) if (!jobText.includes(required)) fail(`source CI evidence is missing ${required}`);
  const receipt = {
    schema: 1, type: 'SourceCiReceiptV1', repository_id: REPOSITORY_ID, source_commit: run.head_sha,
    workflow: { file: run.path, run_id: run.id, attempt: run.run_attempt, event: run.event, conclusion: run.conclusion, workflow_sha: run.head_sha },
    bootstrap: { node: '24', pnpm: '--frozen-lockfile', claude: 'materialized-on-PATH', rust: '1.85.0', musl: true },
    command: ['node', 'scripts/ci.mjs'], jobs_sha256: sha256(Buffer.from(jobText)), started_at: run.run_started_at, completed_at: run.updated_at,
  };
  return emitReceipt(options, receipt);
}

function runEvidence(commandName, args) {
  const result = spawnSync(commandName, args, { cwd: REPO, encoding: 'utf8', shell: false, stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: Infinity });
  return { argv: [commandName, ...args], exit_code: result.status ?? 1, stdout_sha256: sha256(result.stdout ?? ''), stderr_sha256: sha256(result.stderr ?? '') };
}

export function checkPrepared(options) {
  if (!COMMIT.test(options.get('source-commit'))) fail('--source-commit must be 40 lowercase hexadecimal characters');
  const inputs = [
    ['docks-red', 'TddRedReceiptV1'], ['public-red', 'TddRedReceiptV1'],
    ['preflight', 'ProducerPreflightReceiptV1'], ['source-ci', 'SourceCiReceiptV1'],
  ].map(([name, type]) => [name, readCanonical(options.get(name), options.get(`${name}-sha256`), type, `--${name}`)]);
  const source = options.get('source-commit');
  if (git(['rev-parse', `${source}^{commit}`]) !== source) fail('SOURCE_COMMIT does not resolve exactly');
  const checks = [
    runEvidence('node', ['plugins/session-relay/test/distribution-contract.mjs']),
    runEvidence('cargo', ['build', '--manifest-path', 'plugins/session-relay/rust/Cargo.toml', '--release', '--locked']),
    runEvidence('node', ['scripts/ci.mjs', '--plugin', PLUGIN]),
    runEvidence('git', ['diff', '--check', `${source}..HEAD`]),
  ];
  if (checks.some(({ exit_code }) => exit_code !== 0)) fail('one or more source preparation checks failed', 'failure');
  const receipt = {
    schema: 1, type: 'SourcePreparationCandidateV1', repository_id: REPOSITORY_ID, version: VERSION,
    source_commit: source, execution_base_commit: git(['merge-base', source, 'HEAD']),
    input_receipts: Object.fromEntries(inputs.map(([name, input]) => [name.replaceAll('-', '_'), input.digest])),
    checks, plan_path: 'docs/plans/active/session-relay-prebuilt-cli-distribution.md',
    plan_sha256: sha256(fs.readFileSync(path.join(REPO, 'docs/plans/active/session-relay-prebuilt-cli-distribution.md'))),
    created_at: new Date().toISOString(),
  };
  return emitReceipt(options, receipt);
}

export function bindCompletion(options) {
  if (!SHA256.test(options.get('embedded-candidate-sha256'))) fail('--embedded-candidate-sha256 must be a SHA-256');
  const finishedPlanPath = canonicalPath(options.get('finished-plan'), '--finished-plan');
  const planBytes = fs.readFileSync(finishedPlanPath);
  const plan = planBytes.toString('utf8');
  const candidate = embeddedReceipt(plan, 'Source preparation candidate', 'SourcePreparationCandidateV1');
  if (candidate.digest !== options.get('embedded-candidate-sha256')) fail('embedded candidate digest mismatch');
  const completionText = noteValue(plan, 'Completion review receipt JCS bytes');
  const completionDigest = noteValue(plan, 'Completion review receipt SHA-256');
  if (sha256(Buffer.from(completionText)) !== completionDigest) fail('completion review receipt digest mismatch');
  const completion = JSON.parse(completionText);
  if (canonicalize(completion) !== completionText || completion.outcome !== 'passed') fail('completion review did not pass');
  const sourceCommit = candidate.value.source_commit;
  const promotedCommit = git(['rev-parse', 'HEAD^{commit}']);
  const receipt = {
    schema: 1, type: 'SourcePreparationProofV1', repository_id: REPOSITORY_ID, version: VERSION,
    source_commit: sourceCommit, tag_commit: sourceCommit, promoted_commit: promotedCommit,
    finished_plan_sha256: sha256(planBytes), candidate_sha256: candidate.digest,
    completion_review_sha256: completionDigest, bound_at: new Date().toISOString(),
  };
  return emitReceipt(options, receipt);
}

export function validateProof(options) {
  const proof = readCanonical(options.get('source-proof'), options.get('source-proof-sha256'), 'SourcePreparationProofV1', '--source-proof');
  exactKeys(proof.value, ['schema', 'type', 'repository_id', 'version', 'source_commit', 'tag_commit', 'promoted_commit', 'finished_plan_sha256', 'candidate_sha256', 'completion_review_sha256', 'bound_at'], '--source-proof');
  if (proof.value.repository_id !== REPOSITORY_ID || proof.value.version !== VERSION || proof.value.tag_commit !== proof.value.source_commit) fail('source proof immutable identities mismatch');
  return proof;
}
