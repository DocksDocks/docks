import { spawnSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../..');
const REPOSITORY_ID = 'DocksDocks/docks';
const PLUGIN = 'session-relay';
const VERSION = '0.12.0';
const TAG = `${PLUGIN}--v${VERSION}`;
const TRANSACTION_REF = `refs/heads/transactions/${PLUGIN}-${VERSION}`;
const LOCK_REF = `refs/heads/locks/${PLUGIN}-${VERSION}`;
const SHA256 = /^[0-9a-f]{64}$/;
const COMMIT = /^[0-9a-f]{40}$/;
const ASSETS = [
  'session-relay-aarch64-apple-darwin',
  'session-relay-aarch64-unknown-linux-musl',
  'session-relay-x86_64-apple-darwin',
  'session-relay-x86_64-unknown-linux-musl',
  'SHA256SUMS',
];
const PRERELEASE_BODY = 'Session Relay 0.12.0 is staged for compatibility validation. Do not install it directly or advertise installation instructions. Wait for the stable release.';
const STABLE_BODY = 'Session Relay 0.12.0 is available through docks-kit.\n\n## Install or update\n\n```\ndocks-kit sync\n```';
const MODE_SPECS = {
  prepare: { required: ['plugin', 'version'], boolean: ['dry-run'] },
  'materialize-tdd-red': { required: ['plugin', 'version', 'plan', 'docks-red-out', 'public-red-out'] },
  'verify-embedded-preparation': { required: ['plugin', 'version', 'plan'] },
  'verify-source-ci': { required: ['plugin', 'version', 'run-id', 'expected-commit', 'receipt-out'] },
  'check-prepared': { required: ['plugin', 'version', 'source-commit', 'docks-red', 'docks-red-sha256', 'public-red', 'public-red-sha256', 'preflight', 'preflight-sha256', 'source-ci', 'source-ci-sha256', 'receipt-out'] },
  'bind-completion': { required: ['plugin', 'version', 'finished-plan', 'embedded-candidate-sha256', 'receipt-out'] },
  'publish-reviewed': { required: ['plugin', 'version', 'source-proof', 'source-proof-sha256', 'receipt-out'], pairs: [['resume-publication', 'resume-publication-sha256']] },
  'promote-reviewed': { required: ['plugin', 'version', 'source-proof', 'source-proof-sha256', 'publication', 'publication-sha256', 'docks-kit-release', 'expected-origin-main', 'receipt-out'], pairs: [['retry-failed', 'retry-failed-sha256']] },
  'resume-promotion': { required: ['plugin', 'version', 'transaction-ref', 'source-proof', 'source-proof-sha256', 'publication', 'publication-sha256', 'docks-kit-release', 'expected-origin-main', 'receipt-out'] },
  'finalize-reviewed': { required: ['plugin', 'version', 'source-proof', 'source-proof-sha256', 'publication', 'publication-sha256', 'promotion', 'promotion-sha256', 'receipt-out'], pairs: [['resume-finalization', 'resume-finalization-sha256']] },
};
const MODE_FLAGS = new Map(Object.keys(MODE_SPECS).map((mode) => [`--${mode}`, mode]));

export class SessionRelayReleaseError extends Error {
  constructor(message, outcome = 'conflict') {
    super(message);
    this.name = 'SessionRelayReleaseError';
    this.outcome = outcome;
  }
}
const fail = (message, outcome = 'conflict') => { throw new SessionRelayReleaseError(message, outcome); };
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

export function canonicalize(value) {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) fail('canonical receipt contains a non-finite number');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  if (typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`).join(',')}}`;
  }
  fail('canonical receipt contains an unsupported value');
}

function exactKeys(value, keys, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label} must be an object`);
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    fail(`${label} has unknown or missing fields`);
  }
}

function canonicalPath(input, label, { mustExist = true, absolute = false } = {}) {
  if (typeof input !== 'string' || input.length === 0) fail(`${label} must be a path`);
  if (absolute && !path.isAbsolute(input)) fail(`${label} must be absolute`);
  const resolved = path.resolve(REPO, input);
  const parent = path.dirname(resolved);
  let realParent;
  try { realParent = fs.realpathSync.native(parent); } catch { fail(`${label} parent does not exist`); }
  if (realParent !== parent) fail(`${label} parent must be canonical`);
  if (mustExist) {
    let real;
    try { real = fs.realpathSync.native(resolved); } catch { fail(`${label} does not exist`); }
    if (real !== resolved || !fs.statSync(resolved).isFile()) fail(`${label} must be a canonical regular file`);
  } else if (path.join(realParent, path.basename(resolved)) !== resolved) {
    fail(`${label} must be canonical`);
  }
  return resolved;
}

export function writeCanonicalExclusive(output, value) {
  const target = canonicalPath(output, '--receipt-out', { mustExist: false });
  try { fs.lstatSync(target); fail(`output already exists: ${target}`); } catch (error) {
    if (error instanceof SessionRelayReleaseError) throw error;
    if (error?.code !== 'ENOENT') throw error;
  }
  const bytes = Buffer.from(canonicalize(value), 'utf8');
  const temporary = path.join(path.dirname(target), `.${path.basename(target)}.${process.pid}.${randomBytes(12).toString('hex')}.tmp`);
  let descriptor;
  try {
    descriptor = fs.openSync(temporary, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL, 0o600);
    fs.fchmodSync(descriptor, 0o600);
    let offset = 0;
    while (offset < bytes.length) offset += fs.writeSync(descriptor, bytes, offset, bytes.length - offset);
    fs.fsyncSync(descriptor);
    fs.closeSync(descriptor);
    descriptor = undefined;
    fs.linkSync(temporary, target);
    fs.unlinkSync(temporary);
    const directory = fs.openSync(path.dirname(target), fs.constants.O_RDONLY);
    try { fs.fsyncSync(directory); } finally { fs.closeSync(directory); }
  } catch (error) {
    if (descriptor !== undefined) fs.closeSync(descriptor);
    try { fs.unlinkSync(temporary); } catch {}
    if (error?.code === 'EEXIST') fail(`output already exists: ${target}`);
    throw error;
  }
  return { bytes, digest: sha256(bytes), path: target };
}

function readCanonical(input, digest, type, label) {
  if (!SHA256.test(digest ?? '')) fail(`${label} digest must be 64 lowercase hexadecimal characters`);
  const file = canonicalPath(input, label);
  const bytes = fs.readFileSync(file);
  if (sha256(bytes) !== digest) fail(`${label} digest mismatch`);
  let value;
  try { value = JSON.parse(bytes.toString('utf8')); } catch { fail(`${label} is not JSON`); }
  if (Buffer.compare(bytes, Buffer.from(canonicalize(value), 'utf8')) !== 0) fail(`${label} is not canonical JCS`);
  if (value.schema !== 1 || value.type !== type) fail(`${label} has the wrong schema or type`);
  return { value, bytes, digest, path: file };
}

function command(commandName, args, { inherit = false, input, env } = {}) {
  const result = spawnSync(commandName, args, {
    cwd: REPO,
    encoding: 'utf8',
    shell: false,
    input,
    env: env ? { ...process.env, ...env } : process.env,
    stdio: inherit ? 'inherit' : ['ignore', 'pipe', 'pipe'],
    maxBuffer: Infinity,
  });
  if (result.error || result.signal || result.status !== 0) {
    const detail = result.stderr?.trim() || result.error?.message || result.signal || `exit ${result.status}`;
    fail(`${commandName} ${args[0] ?? ''} failed: ${detail}`, 'failure');
  }
  return inherit ? '' : result.stdout.trim();
}
const git = (args) => command('git', args);
const ghJson = (endpoint) => JSON.parse(command('gh', ['api', endpoint]));

function parseMode(argv) {
  const present = argv.filter((token) => MODE_FLAGS.has(token));
  if (present.length > 1 || new Set(present).size !== present.length) fail('exactly one release mode is allowed');
  if (present.length === 0) return null;
  const mode = MODE_FLAGS.get(present[0]);
  if (argv[0] !== `--${mode}`) fail('release mode must be the first argument');
  const spec = MODE_SPECS[mode];
  const booleans = new Set(spec.boolean ?? []);
  const allowed = new Set([...spec.required, ...booleans, ...(spec.pairs ?? []).flat()]);
  const options = new Map();
  const positional = [];
  for (let index = 1; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) { positional.push(token); continue; }
    const name = token.slice(2);
    if (!allowed.has(name)) fail(`unknown option for --${mode}: ${token}`);
    if (options.has(name)) fail(`duplicate option: ${token}`);
    if (booleans.has(name)) { options.set(name, true); continue; }
    const value = argv[index + 1];
    if (value === undefined || value.startsWith('--')) fail(`missing value for ${token}`);
    options.set(name, value);
    index += 1;
  }
  if (positional.length !== 1) fail(`--${mode} requires exactly one version argument`);
  options.set('version', positional[0]);
  for (const required of spec.required) if (!options.has(required)) fail(`missing required option: --${required}`);
  for (const [pathName, digestName] of spec.pairs ?? []) {
    if (options.has(pathName) !== options.has(digestName)) fail(`--${pathName} and --${digestName} must be adjacent receipt inputs`);
  }
  if (options.get('plugin') !== PLUGIN || options.get('version') !== VERSION) fail(`--${mode} is only valid for session-relay ${VERSION}`);
  for (const [pathName, digestName] of [...(spec.pairs ?? []), ...receiptPairs(spec.required)]) {
    if (options.has(pathName)) {
      const pathIndex = argv.indexOf(`--${pathName}`);
      if (argv[pathIndex + 2] !== `--${digestName}`) fail(`--${pathName} must be immediately followed by --${digestName}`);
    }
  }
  return { mode, options };
}

function receiptPairs(required) {
  const pairs = [];
  for (const digestName of required.filter((name) => name.endsWith('-sha256'))) {
    const pathName = digestName.slice(0, -'-sha256'.length);
    if (required.includes(pathName)) pairs.push([pathName, digestName]);
  }
  return pairs;
}

function positionalPlugin(argv) {
  const index = argv.indexOf('--plugin');
  return index < 0 ? 'docks' : argv[index + 1];
}

function assertReceiptOutputFree(options) {
  if (!options.has('receipt-out')) return;
  const target = canonicalPath(options.get('receipt-out'), '--receipt-out', { mustExist: false });
  try { fs.lstatSync(target); fail(`output already exists: ${target}`); } catch (error) {
    if (error instanceof SessionRelayReleaseError) throw error;
    if (error?.code !== 'ENOENT') throw error;
  }
}

function noteValue(plan, label) {
  const matches = [...plan.matchAll(new RegExp(`^- ${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}: (.*)$`, 'gm'))];
  if (matches.length !== 1 || matches[0][1] === 'pending') fail(`plan must contain one non-pending ${label}`);
  return matches[0][1];
}

function embeddedReceipt(plan, label, type) {
  const bytesText = noteValue(plan, `${label} JCS bytes`);
  const expectedDigest = noteValue(plan, `${label} SHA-256`);
  if (!SHA256.test(expectedDigest)) fail(`${label} has an invalid SHA-256`);
  const bytes = Buffer.from(bytesText, 'utf8');
  if (sha256(bytes) !== expectedDigest) fail(`${label} embedded digest mismatch`);
  let value;
  try { value = JSON.parse(bytesText); } catch { fail(`${label} embedded bytes are not JSON`); }
  if (canonicalize(value) !== bytesText || value.schema !== 1 || value.type !== type) fail(`${label} is not canonical ${type}`);
  return { bytes, value, digest: expectedDigest };
}

function ensureCleanTree() {
  if (git(['status', '--porcelain=v1', '--untracked-files=all']) !== '') fail('working tree dirty — commit or stash first');
}

function replaceJsonVersion(file, mutate) {
  const original = fs.readFileSync(file);
  const value = JSON.parse(original.toString('utf8'));
  mutate(value);
  return { file, original, changed: Buffer.from(`${JSON.stringify(value, null, 2)}\n`) };
}

function prepare(options, fixtureJournal) {
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

function materialize(options) {
  const planPath = canonicalPath(options.get('plan'), '--plan');
  const plan = fs.readFileSync(planPath, 'utf8');
  const docks = embeddedReceipt(plan, 'Docks TDD-red receipt', 'TddRedReceiptV1');
  const publicReceipt = embeddedReceipt(plan, 'Companion TDD-red receipt', 'TddRedReceiptV1');
  const docksOut = writeCanonicalExclusive(options.get('docks-red-out'), docks.value);
  const publicOut = writeCanonicalExclusive(options.get('public-red-out'), publicReceipt.value);
  process.stdout.write(`${docksOut.digest}\n${publicOut.digest}\n`);
  return { receipt: docks.value, state: { docks_sha256: docksOut.digest, public_sha256: publicOut.digest } };
}

function verifyEmbedded(options) {
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

function verifySourceCi(options) {
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

function checkPrepared(options) {
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

function bindCompletion(options) {
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

function emitReceipt(options, receipt) {
  const written = writeCanonicalExclusive(options.get('receipt-out'), receipt);
  process.stdout.write(`${written.digest}\n`);
  return { receipt, state: { receipt_sha256: written.digest } };
}

function validateProof(options) {
  const proof = readCanonical(options.get('source-proof'), options.get('source-proof-sha256'), 'SourcePreparationProofV1', '--source-proof');
  exactKeys(proof.value, ['schema', 'type', 'repository_id', 'version', 'source_commit', 'tag_commit', 'promoted_commit', 'finished_plan_sha256', 'candidate_sha256', 'completion_review_sha256', 'bound_at'], '--source-proof');
  if (proof.value.repository_id !== REPOSITORY_ID || proof.value.version !== VERSION || proof.value.tag_commit !== proof.value.source_commit) fail('source proof immutable identities mismatch');
  return proof;
}

function releaseState() {
  let release = null;
  try { release = ghJson(`/repos/${REPOSITORY_ID}/releases/tags/${encodeURIComponent(TAG)}`); } catch {}
  const refResult = spawnSync('git', ['ls-remote', '--tags', 'origin', `refs/tags/${TAG}`, `refs/tags/${TAG}^{}`], { cwd: REPO, encoding: 'utf8', shell: false });
  if (refResult.status !== 0) fail('could not query authoritative tag state', 'failure');
  const refs = refResult.stdout.trim().split('\n').filter(Boolean).map((line) => line.split(/\s+/));
  const commit = refs.find(([, ref]) => ref.endsWith('^{}'))?.[0] ?? refs[0]?.[0] ?? null;
  return { commit, release };
}

function normalizedAssets(release) {
  return (release.assets ?? []).map((asset) => ({
    name: asset.name, database_id: asset.id, size: asset.size,
    digest: typeof asset.digest === 'string' ? asset.digest.replace(/^sha256:/, '') : null,
  })).sort((a, b) => a.name.localeCompare(b.name));
}

function assertCompleteAssets(assets) {
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

function publishReviewed(options) {
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

function promoteReviewed(options, resume = false) {
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

function finalizeReviewed(options) {
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

function runFixture(argv, parsed, parseError) {
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
      calls = dry ? [] : [{ argv: ['node', 'scripts/ci.mjs', '--plugin', PLUGIN] }];
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

export async function dispatchSessionRelayRelease(argv = process.argv.slice(2)) {
  const fixture = process.env.SESSION_RELAY_RELEASE_FIXTURE || process.env.SESSION_RELAY_RELEASE_REPORT;
  if (Boolean(process.env.SESSION_RELAY_RELEASE_FIXTURE) !== Boolean(process.env.SESSION_RELAY_RELEASE_REPORT)) fail('fixture and report environment variables must be provided together');
  let parsed;
  let parseError;
  try { parsed = parseMode(argv); } catch (error) { parseError = error; }
  if (fixture) return runFixture(argv, parsed, parseError);
  if (parseError) throw parseError;
  if (!parsed) {
    if (positionalPlugin(argv) === PLUGIN) fail('Session Relay positional release syntax is disabled; use --prepare');
    return null;
  }
  assertReceiptOutputFree(parsed.options);
  let result;
  switch (parsed.mode) {
    case 'prepare': result = prepare(parsed.options, []); break;
    case 'materialize-tdd-red': result = materialize(parsed.options); break;
    case 'verify-embedded-preparation': result = verifyEmbedded(parsed.options); break;
    case 'verify-source-ci': result = verifySourceCi(parsed.options); break;
    case 'check-prepared': result = checkPrepared(parsed.options); break;
    case 'bind-completion': result = bindCompletion(parsed.options); break;
    case 'publish-reviewed': result = publishReviewed(parsed.options); break;
    case 'promote-reviewed': result = promoteReviewed(parsed.options, false); break;
    case 'resume-promotion': result = promoteReviewed(parsed.options, true); break;
    case 'finalize-reviewed': result = finalizeReviewed(parsed.options); break;
    default: fail(`unhandled release mode: ${parsed.mode}`);
  }
  return result ?? true;
}

export const SESSION_RELAY_RELEASE = Object.freeze({
  plugin: PLUGIN, version: VERSION, tag: TAG, transactionRef: TRANSACTION_REF,
  assets: Object.freeze([...ASSETS]), prereleaseBody: PRERELEASE_BODY, stableBody: STABLE_BODY,
});
