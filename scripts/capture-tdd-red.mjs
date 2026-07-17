#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PRODUCER_PATH = 'scripts/capture-tdd-red.mjs';
const fail = (message) => {
  process.stderr.write(`capture-tdd-red: ${message}\n`);
  process.exit(2);
};
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const git = (cwd, args) => {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8', shell: false, stdio: ['ignore', 'pipe', 'pipe'] });
  if (result.error || result.signal || result.status !== 0) {
    fail(`git ${args[0]} failed${result.stderr ? `: ${result.stderr.trim()}` : ''}`);
  }
  return result.stdout.trim();
};

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

function jcs(value) {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) fail('receipt contains a non-finite number');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(jcs).join(',')}]`;
  if (typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${jcs(value[key])}`).join(',')}}`;
  }
  fail('receipt contains an unsupported value');
}

function parseArgs(argv) {
  const separator = argv.indexOf('--');
  if (separator < 0) fail('missing required -- command separator');
  const command = argv.slice(separator + 1);
  if (command.length === 0 || command[0].length === 0) fail('command argv must not be empty');

  const values = new Map();
  const tests = [];
  const options = argv.slice(0, separator);
  for (let index = 0; index < options.length; index += 1) {
    const option = options[index];
    if (!['--repo', '--repository-id', '--pre-production-commit', '--test', '--receipt-out'].includes(option)) {
      fail(`unknown option: ${option}`);
    }
    const value = options[index + 1];
    if (value === undefined || value.startsWith('--') || value.length === 0) fail(`missing value for ${option}`);
    index += 1;
    if (option === '--test') tests.push(value);
    else {
      if (values.has(option)) fail(`duplicate option: ${option}`);
      values.set(option, value);
    }
  }
  for (const required of ['--repo', '--repository-id', '--pre-production-commit', '--receipt-out']) {
    if (!values.has(required)) fail(`missing required option: ${required}`);
  }
  if (tests.length === 0) fail('at least one --test is required');
  return {
    repo: values.get('--repo'),
    repositoryId: values.get('--repository-id'),
    commit: values.get('--pre-production-commit'),
    tests,
    receiptOut: values.get('--receipt-out'),
    command,
  };
}

function canonicalTestPath(value) {
  assertUnicode(value, '--test');
  if (value.includes('\\') || path.posix.isAbsolute(value) || value === '.' || value === '..'
      || path.posix.normalize(value) !== value || value.startsWith('../') || value.endsWith('/')) {
    fail(`noncanonical test path: ${value}`);
  }
  return value;
}

function trackedBlob(repo, commit, relativePath, label) {
  const absolute = path.join(repo, ...relativePath.split('/'));
  let stat;
  try { stat = fs.lstatSync(absolute); } catch { fail(`${label} is not a tracked regular file: ${relativePath}`); }
  if (!stat.isFile()) fail(`${label} is not a regular file: ${relativePath}`);
  const stage = git(repo, ['ls-files', '--stage', '--', relativePath]).split(/\s+/);
  if (stage.length < 4 || !/^100(?:644|755)$/.test(stage[0]) || !/^[0-9a-f]{40,64}$/.test(stage[1])) {
    fail(`${label} is untracked or non-regular: ${relativePath}`);
  }
  const type = git(repo, ['cat-file', '-t', `${commit}:${relativePath}`]);
  if (type !== 'blob') fail(`${label} is not a blob at the pre-production commit: ${relativePath}`);
  const blob = git(repo, ['rev-parse', `${commit}:${relativePath}`]);
  const workingBlob = git(repo, ['hash-object', '--', relativePath]);
  if (stage[1] !== blob || workingBlob !== blob) fail(`${label} bytes are not frozen at the pre-production commit: ${relativePath}`);
  return blob;
}

function producerBlob() {
  const producerFile = fileURLToPath(import.meta.url);
  const producerRepo = fs.realpathSync.native(path.resolve(path.dirname(producerFile), '..'));
  if (path.join(producerRepo, ...PRODUCER_PATH.split('/')) !== producerFile) {
    fail(`producer must be located at ${PRODUCER_PATH}`);
  }
  const head = git(producerRepo, ['rev-parse', 'HEAD^{commit}']);
  return trackedBlob(producerRepo, head, PRODUCER_PATH, 'producer');
}

function writeReceipt(receiptOut, bytes) {
  assertUnicode(receiptOut, '--receipt-out');
  if (!path.isAbsolute(receiptOut)) fail('--receipt-out must be absolute');
  const parentInput = path.dirname(receiptOut);
  let parent;
  try { parent = fs.realpathSync.native(parentInput); } catch { fail('receipt parent directory does not exist'); }
  if (parent !== parentInput || path.join(parent, path.basename(receiptOut)) !== receiptOut) {
    fail('--receipt-out must be canonical');
  }
  try { fs.lstatSync(receiptOut); fail('--receipt-out already exists'); } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }

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
    fs.linkSync(temporary, receiptOut);
    fs.unlinkSync(temporary);
    const directory = fs.openSync(parent, fs.constants.O_RDONLY);
    try { fs.fsyncSync(directory); } finally { fs.closeSync(directory); }
  } catch (error) {
    if (descriptor !== undefined) fs.closeSync(descriptor);
    try { fs.unlinkSync(temporary); } catch {}
    throw error;
  }
}

const parsed = parseArgs(process.argv.slice(2));
assertUnicode(parsed.repo, '--repo');
assertUnicode(parsed.repositoryId, '--repository-id');
for (const [index, token] of parsed.command.entries()) assertUnicode(token, `command argv[${index}]`);
if (!path.isAbsolute(parsed.repo)) fail('--repo must be absolute');
let repo;
try { repo = fs.realpathSync.native(parsed.repo); } catch { fail('--repo does not exist'); }
if (repo !== parsed.repo || !fs.statSync(repo).isDirectory()) fail('--repo must be an absolute canonical repository root');
if (git(repo, ['rev-parse', '--show-toplevel']) !== repo) fail('--repo must be the repository root');
if (!/^[A-Za-z0-9](?:[A-Za-z0-9_.-]*[A-Za-z0-9])?\/[A-Za-z0-9](?:[A-Za-z0-9_.-]*[A-Za-z0-9])?$/.test(parsed.repositoryId)) {
  fail('invalid --repository-id (expected owner/name)');
}
if (!/^[0-9a-f]{40}$/.test(parsed.commit)) fail('--pre-production-commit must be 40 lowercase hex');
if (git(repo, ['rev-parse', `${parsed.commit}^{commit}`]) !== parsed.commit) fail('invalid --pre-production-commit');

const testPaths = parsed.tests.map(canonicalTestPath);
if (new Set(testPaths).size !== testPaths.length) fail('duplicate --test path');
const boundTests = testPaths.map((testPath) => ({
  path: testPath,
  blob_id: trackedBlob(repo, parsed.commit, testPath, 'test'),
})).sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0);
const boundProducer = producerBlob();

const result = spawnSync(parsed.command[0], parsed.command.slice(1), {
  cwd: repo,
  shell: false,
  stdio: ['ignore', 'pipe', 'pipe'],
  maxBuffer: Infinity,
});
if (result.error) fail(`command could not be executed: ${result.error.message}`);
if (result.signal !== null) fail(`command terminated by signal ${result.signal}`);
if (!Number.isInteger(result.status)) fail('command did not return a numeric exit code');
if (result.status === 0) fail('command must exit nonzero for a TDD-red receipt');

const receipt = {
  schema: 1,
  type: 'TddRedReceiptV1',
  repository_id: parsed.repositoryId,
  pre_production_commit: parsed.commit,
  test_paths: boundTests,
  command: { cwd: repo, argv: parsed.command },
  exit_code: result.status,
  stdout_sha256: sha256(result.stdout),
  stderr_sha256: sha256(result.stderr),
  captured_at: new Date().toISOString(),
  producer: { path: PRODUCER_PATH, blob_id: boundProducer, version: '1' },
};
const bytes = Buffer.from(jcs(receipt), 'utf8');
writeReceipt(parsed.receiptOut, bytes);
process.stdout.write(`${sha256(bytes)}\n`);
