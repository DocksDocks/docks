// rust-bin.mjs — shared helpers for the `rust` plugin capability (see the
// descriptor field in plugins.mjs). ci.mjs uses them to gate the host leg;
// release.mjs uses them to refuse tagging until all target binaries are
// committed with verifying checksums.
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Host target triple, matching the bin/<name> launcher's `uname -sm` mapping.
// Linux maps to the STATIC musl leg — a gnu build would depend on the
// build machine's glibc, which a consumer clone can't assume.
export function rustHostTarget() {
  const arch = { x64: 'x86_64', arm64: 'aarch64' }[process.arch];
  if (!arch) return null;
  if (process.platform === 'linux') return `${arch}-unknown-linux-musl`;
  if (process.platform === 'darwin') return `${arch}-apple-darwin`;
  return null;
}

// cargo from PATH, else the default rustup install location (non-login shells
// often lack ~/.cargo/bin on PATH). null when absent — callers degrade to
// warn-and-skip locally; tag-CI provisions cargo and stays authoritative.
export function findCargo() {
  if (!spawnSync('cargo', ['--version'], { stdio: 'ignore' }).error) return 'cargo';
  const home = path.join(os.homedir(), '.cargo', 'bin', 'cargo');
  return fs.existsSync(home) ? home : null;
}

export const sha256File = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');

// Verify a `shasum -a 256`-format SHA256SUMS file against its own directory.
// Returns { listed, bad } where bad holds "name (missing|checksum mismatch)".
export function verifySha256Sums(binDir) {
  const bad = [];
  let listed = 0;
  for (const line of fs.readFileSync(path.join(binDir, 'SHA256SUMS'), 'utf8').split('\n')) {
    const m = /^([0-9a-f]{64})\s+\*?(.+)$/.exec(line.trim());
    if (!m) continue;
    listed += 1;
    const f = path.join(binDir, m[2]);
    if (!fs.existsSync(f)) { bad.push(`${m[2]} (missing)`); continue; }
    if (crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex') !== m[1]) bad.push(`${m[2]} (checksum mismatch)`);
  }
  return { listed, bad };
}
