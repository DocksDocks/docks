import { spawnSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const REPO = path.resolve(HERE, '../..');
export const REPOSITORY_ID = 'DocksDocks/docks';
export const PLUGIN = 'session-relay';
export const VERSION = '0.13.0';
export const TAG = `${PLUGIN}--v${VERSION}`;
export const TRANSACTION_REF = `refs/heads/transactions/${PLUGIN}-${VERSION}`;
export const LOCK_REF = `refs/heads/locks/${PLUGIN}-${VERSION}`;
export const SHA256 = /^[0-9a-f]{64}$/;
export const COMMIT = /^[0-9a-f]{40}$/;
export const ASSETS = [
  'session-relay-aarch64-apple-darwin',
  'session-relay-aarch64-unknown-linux-musl',
  'session-relay-x86_64-apple-darwin',
  'session-relay-x86_64-unknown-linux-musl',
  'SHA256SUMS',
];
export const PRERELEASE_BODY =
  'Session Relay 0.13.0 is staged for compatibility validation. Do not install it directly or advertise installation instructions. Wait for the stable release.';
export const STABLE_BODY =
  'Session Relay 0.13.0 is available through docks-kit.\n\n## Install or update\n\n```\ndocks-kit sync\n```';

export class SessionRelayReleaseError extends Error {
  constructor(message, outcome = 'conflict') {
    super(message);
    this.name = 'SessionRelayReleaseError';
    this.outcome = outcome;
  }
}

export const fail = (message, outcome = 'conflict') => {
  throw new SessionRelayReleaseError(message, outcome);
};
export const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

export function canonicalize(value) {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) fail('canonical receipt contains a non-finite number');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  if (typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`)
      .join(',')}}`;
  }
  fail('canonical receipt contains an unsupported value');
}

export function exactKeys(value, keys, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label} must be an object`);
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    fail(`${label} has unknown or missing fields`);
  }
}

export function canonicalPath(input, label, { mustExist = true, absolute = false } = {}) {
  if (typeof input !== 'string' || input.length === 0) fail(`${label} must be a path`);
  if (absolute && !path.isAbsolute(input)) fail(`${label} must be absolute`);
  const resolved = path.resolve(REPO, input);
  const parent = path.dirname(resolved);
  let realParent;
  try {
    realParent = fs.realpathSync.native(parent);
  } catch {
    fail(`${label} parent does not exist`);
  }
  if (realParent !== parent) fail(`${label} parent must be canonical`);
  if (mustExist) {
    let real;
    try {
      real = fs.realpathSync.native(resolved);
    } catch {
      fail(`${label} does not exist`);
    }
    if (real !== resolved || !fs.statSync(resolved).isFile()) fail(`${label} must be a canonical regular file`);
  } else if (path.join(realParent, path.basename(resolved)) !== resolved) {
    fail(`${label} must be canonical`);
  }
  return resolved;
}

export function writeCanonicalExclusive(output, value) {
  const target = canonicalPath(output, '--receipt-out', { mustExist: false });
  try {
    fs.lstatSync(target);
    fail(`output already exists: ${target}`);
  } catch (error) {
    if (error instanceof SessionRelayReleaseError) throw error;
    if (error?.code !== 'ENOENT') throw error;
  }
  const bytes = Buffer.from(canonicalize(value), 'utf8');
  const temporary = path.join(
    path.dirname(target),
    `.${path.basename(target)}.${process.pid}.${randomBytes(12).toString('hex')}.tmp`,
  );
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
    try {
      fs.fsyncSync(directory);
    } finally {
      fs.closeSync(directory);
    }
  } catch (error) {
    if (descriptor !== undefined) fs.closeSync(descriptor);
    try {
      fs.unlinkSync(temporary);
    } catch {}
    if (error?.code === 'EEXIST') fail(`output already exists: ${target}`);
    throw error;
  }
  return { bytes, digest: sha256(bytes), path: target };
}

export function readCanonical(input, digest, type, label) {
  if (!SHA256.test(digest ?? '')) fail(`${label} digest must be 64 lowercase hexadecimal characters`);
  const file = canonicalPath(input, label);
  const bytes = fs.readFileSync(file);
  if (sha256(bytes) !== digest) fail(`${label} digest mismatch`);
  let value;
  try {
    value = JSON.parse(bytes.toString('utf8'));
  } catch {
    fail(`${label} is not JSON`);
  }
  if (Buffer.compare(bytes, Buffer.from(canonicalize(value), 'utf8')) !== 0) fail(`${label} is not canonical JCS`);
  if (value.schema !== 1 || value.type !== type) fail(`${label} has the wrong schema or type`);
  return { value, bytes, digest, path: file };
}

export function command(commandName, args, { inherit = false, input, env } = {}) {
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

export function commandRaw(commandName, args) {
  const result = spawnSync(commandName, args, {
    cwd: REPO,
    encoding: null,
    shell: false,
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: Infinity,
  });
  if (result.error || result.signal || result.status !== 0) {
    const detail =
      result.stderr?.toString('utf8').trim() || result.error?.message || result.signal || `exit ${result.status}`;
    fail(`${commandName} ${args[0] ?? ''} failed: ${detail}`, 'failure');
  }
  return result.stdout ?? Buffer.alloc(0);
}

export const git = (args) => command('git', args);
export const gitRaw = (args) => commandRaw('git', args);
export const ghJson = (endpoint) => JSON.parse(command('gh', ['api', endpoint]));

export function assertReceiptOutputFree(options) {
  if (!options.has('receipt-out')) return;
  const target = canonicalPath(options.get('receipt-out'), '--receipt-out', { mustExist: false });
  try {
    fs.lstatSync(target);
    fail(`output already exists: ${target}`);
  } catch (error) {
    if (error instanceof SessionRelayReleaseError) throw error;
    if (error?.code !== 'ENOENT') throw error;
  }
}

export function noteValue(plan, label) {
  const matches = [...plan.matchAll(new RegExp(`^- ${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}: (.*)$`, 'gm'))];
  if (matches.length !== 1 || matches[0][1] === 'pending') fail(`plan must contain one non-pending ${label}`);
  return matches[0][1];
}

export function embeddedReceipt(plan, label, type) {
  const bytesText = noteValue(plan, `${label} JCS bytes`);
  const expectedDigest = noteValue(plan, `${label} SHA-256`);
  if (!SHA256.test(expectedDigest)) fail(`${label} has an invalid SHA-256`);
  const bytes = Buffer.from(bytesText, 'utf8');
  if (sha256(bytes) !== expectedDigest) fail(`${label} embedded digest mismatch`);
  let value;
  try {
    value = JSON.parse(bytesText);
  } catch {
    fail(`${label} embedded bytes are not JSON`);
  }
  if (canonicalize(value) !== bytesText || value.schema !== 1 || value.type !== type)
    fail(`${label} is not canonical ${type}`);
  return { bytes, value, digest: expectedDigest };
}

export function ensureCleanTree() {
  if (git(['status', '--porcelain=v1', '--untracked-files=all']) !== '')
    fail('working tree dirty — commit or stash first');
}

export function replaceJsonVersion(file, mutate) {
  const original = fs.readFileSync(file);
  const value = JSON.parse(original.toString('utf8'));
  mutate(value);
  return { file, original, changed: Buffer.from(`${JSON.stringify(value, null, 2)}\n`) };
}

export function emitReceipt(options, receipt) {
  const written = writeCanonicalExclusive(options.get('receipt-out'), receipt);
  process.stdout.write(`${written.digest}\n`);
  return { receipt, state: { receipt_sha256: written.digest } };
}
