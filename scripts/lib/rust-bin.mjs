// rust-bin.mjs — pure Rust release-identity helpers plus the small filesystem
// adapters shared by author-side CI and release tooling.
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const HOST_ARCHITECTURES = {
  x64: 'x86_64',
  arm64: 'aarch64',
};

const TARGET_IDENTITIES = {
  'x86_64-unknown-linux-musl': { format: 'elf', architecture: 'x86_64' },
  'aarch64-unknown-linux-musl': { format: 'elf', architecture: 'aarch64' },
  'x86_64-apple-darwin': { format: 'mach-o', architecture: 'x86_64' },
  'aarch64-apple-darwin': { format: 'mach-o', architecture: 'aarch64' },
};

// Host target triple matching the supported prebuilt release targets.
export function rustHostTarget(platform = process.platform, arch = process.arch) {
  const targetArch = HOST_ARCHITECTURES[arch];
  if (!targetArch) return null;
  if (platform === 'linux') return `${targetArch}-unknown-linux-musl`;
  if (platform === 'darwin') return `${targetArch}-apple-darwin`;
  return null;
}

export function rustAssetName(prefix, target) {
  if (typeof prefix !== 'string' || prefix.length === 0) throw new TypeError('asset prefix must be nonempty');
  if (!Object.hasOwn(TARGET_IDENTITIES, target)) throw new TypeError(`unsupported Rust target: ${target}`);
  return `${prefix}-${target}`;
}

// Accept either a prebuilt descriptor or the individual descriptor fields.
export function rustReleaseAssetNames(prefixOrDescriptor, targets, checksumAsset = 'SHA256SUMS') {
  let prefix = prefixOrDescriptor;
  if (prefixOrDescriptor && typeof prefixOrDescriptor === 'object') {
    prefix = prefixOrDescriptor.assetPrefix;
    targets = prefixOrDescriptor.targets;
    checksumAsset = prefixOrDescriptor.checksumAsset;
  }
  if (!Array.isArray(targets)) throw new TypeError('Rust release targets must be an array');
  if (typeof checksumAsset !== 'string' || checksumAsset.length === 0) {
    throw new TypeError('checksum asset must be nonempty');
  }
  return [...targets.map((target) => rustAssetName(prefix, target)), checksumAsset];
}

// Parse the standard "<sha256><two spaces><name>" manifest format.
export function parseSha256Sums(contents) {
  const text = typeof contents === 'string' ? contents : new TextDecoder('utf-8', { fatal: true }).decode(contents);
  const entries = new Map();
  const lines = text.split('\n');
  if (lines.at(-1) === '') lines.pop();
  for (const [index, line] of lines.entries()) {
    const match = /^([0-9a-f]{64}) {2}([^/\0][^\0]*)$/.exec(line);
    if (!match) throw new Error(`invalid SHA256SUMS line ${index + 1}`);
    const [, digest, name] = match;
    if (name === '.' || name === '..' || name.includes('/') || name.includes('\\')) {
      throw new Error(`invalid SHA256SUMS asset name on line ${index + 1}`);
    }
    if (entries.has(name)) throw new Error(`duplicate SHA256SUMS asset: ${name}`);
    entries.set(name, digest);
  }
  return entries;
}

export function formatSha256Sums(entries) {
  const pairs =
    entries instanceof Map
      ? [...entries]
      : entries.map((entry) => (Array.isArray(entry) ? entry : [entry.name, entry.sha256]));
  const seen = new Set();
  for (const [name, digest] of pairs) {
    if (typeof name !== 'string' || name.length === 0 || name.includes('/') || name.includes('\\')) {
      throw new TypeError(`invalid checksum asset name: ${name}`);
    }
    if (!/^[0-9a-f]{64}$/.test(digest)) throw new TypeError(`invalid SHA-256 for ${name}`);
    if (seen.has(name)) throw new Error(`duplicate checksum asset: ${name}`);
    seen.add(name);
  }
  return pairs
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([name, digest]) => `${digest}  ${name}\n`)
    .join('');
}

export function expectedRustFileIdentity(target) {
  const identity = TARGET_IDENTITIES[target];
  return identity ? { ...identity } : null;
}

export function detectRustFileIdentity(bytes) {
  const buffer = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  if (
    buffer.length >= 20 &&
    buffer[0] === 0x7f &&
    buffer[1] === 0x45 &&
    buffer[2] === 0x4c &&
    buffer[3] === 0x46 &&
    buffer[4] === 2 &&
    buffer[6] === 1
  ) {
    const littleEndian = buffer[5] === 1;
    const bigEndian = buffer[5] === 2;
    if (!littleEndian && !bigEndian) return null;
    const machine = littleEndian ? buffer.readUInt16LE(18) : buffer.readUInt16BE(18);
    const architecture = { 62: 'x86_64', 183: 'aarch64' }[machine];
    return architecture ? { format: 'elf', architecture } : null;
  }

  if (buffer.length >= 8) {
    const littleMagic = buffer.readUInt32LE(0);
    const bigMagic = buffer.readUInt32BE(0);
    let cpuType;
    if (littleMagic === 0xfeedfacf) cpuType = buffer.readUInt32LE(4);
    else if (bigMagic === 0xfeedfacf) cpuType = buffer.readUInt32BE(4);
    if (cpuType !== undefined) {
      const architecture = {
        16777223: 'x86_64',
        16777228: 'aarch64',
      }[cpuType];
      return architecture ? { format: 'mach-o', architecture } : null;
    }
  }
  return null;
}

// cargo from PATH, else the default rustup install location.
export function findCargo() {
  if (!spawnSync('cargo', ['--version'], { stdio: 'ignore' }).error) return 'cargo';
  const home = path.join(os.homedir(), '.cargo', 'bin', 'cargo');
  return fs.existsSync(home) ? home : null;
}

export const sha256File = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

// Compatibility filesystem adapter for legacy release paths.
export function verifySha256Sums(binDir) {
  const bad = [];
  let entries;
  try {
    entries = parseSha256Sums(fs.readFileSync(path.join(binDir, 'SHA256SUMS'), 'utf8'));
  } catch (error) {
    return { listed: 0, bad: [error.message] };
  }
  for (const [name, expected] of entries) {
    const file = path.join(binDir, name);
    if (!fs.existsSync(file)) {
      bad.push(`${name} (missing)`);
    } else if (sha256File(file) !== expected) {
      bad.push(`${name} (checksum mismatch)`);
    }
  }
  return { listed: entries.size, bad };
}
