// gate-memo.mjs — content-keyed memo for the full local gate (scripts/ci.mjs).
//
// The gate takes 6-12 minutes. A session that runs it repeatedly re-verifies bytes
// that have not changed since the previous green, which is the whole cost and none
// of the information. This module makes that repeat cheap WITHOUT making a cached
// PASS indistinguishable from a fresh one: the memo is opt-in, and a hit is printed
// with the key and the moment it was recorded.
//
// Three properties are load-bearing:
//
//  1. The key describes the WORKING TREE, never the commit id. This repository
//     routinely gates uncommitted implementations, so a HEAD-keyed memo would hand
//     back a stale PASS for bytes the gate never saw. The key mixes the index
//     listing (`git ls-files -s`: mode + blob oid + path) with a content digest of
//     every path `git status --porcelain` reports as differing from that listing,
//     plus the untracked-but-not-ignored files the gate would also read.
//
//  2. Anything the key cannot honestly describe MISSES. Unmerged stages, renames,
//     submodule-dirty entries, unreadable files and a failing `git` all return
//     `{ key: null, reason }`, and the caller falls open to a full run. A memo that
//     guesses is worse than no memo.
//
//  3. Only a PASS is ever recorded, and it is recorded outside the repository under
//     $XDG_STATE_HOME/docks/ (default ~/.local/state/docks/) with mode 0700.
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const MEMO_SCHEMA = 1;
const MEMO_KEEP = 20;

// Porcelain v1 status letters this key can describe exactly. `R`/`C` (rename/copy)
// carry a second path the digest below does not read, `U`/`AA`/`DD` are unmerged
// stages with no single content, and anything unknown is by definition undescribed.
const DESCRIBABLE = new Set([' ', 'M', 'A', 'D', 'T', '?']);

export function memoRoot(env = process.env) {
  const base = env.XDG_STATE_HOME?.trim() ? env.XDG_STATE_HOME : path.join(env.HOME ?? os.homedir(), '.local', 'state');
  return path.join(base, 'docks', 'ci-memo');
}

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

export const gitReader = (repo) => (args) =>
  execFileSync('git', args, { cwd: repo, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

// A path as the tree would store it: `<mode> <git-blob-oid>`. Using git's own blob
// hash (sha1 over `blob <len>\0<bytes>`) rather than a private digest is what makes
// the key a pure function of CONTENT: an uncommitted edit and the commit that later
// records those exact bytes produce the same entry, so committing without editing
// still hits. Directories (a dirty submodule) and unreadable files throw, and a
// throw is a MISS.
export function treeEntry(repo, relative) {
  const absolute = path.join(repo, relative);
  const stats = fs.lstatSync(absolute);
  if (stats.isSymbolicLink()) return `120000 ${blobId(Buffer.from(fs.readlinkSync(absolute)))}`;
  if (!stats.isFile()) throw new Error(`not a regular file: ${relative}`);
  return `${stats.mode & 0o111 ? '100755' : '100644'} ${blobId(fs.readFileSync(absolute))}`;
}

function blobId(bytes) {
  return crypto.createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
}

// Tool availability decides which checks the gate runs at all (a rust lane self-skips
// without cargo, shell lint self-skips without shellcheck). Installing one of those
// between runs changes the gate's meaning, so it changes the key.
export function toolFingerprint(
  names,
  // stderr is discarded: a misconfigured toolchain (`rustup` with no default) writes a
  // help banner here, and the key must not turn that into gate output.
  run = (name) => execFileSync(name, ['--version'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }),
) {
  return names.map((name) => {
    try {
      return `${name}=${sha256(run(name))}`;
    } catch {
      return `${name}=absent`;
    }
  });
}

/**
 * Digest of everything that decides the gate's outcome.
 * @returns {{key: string, entries: number}|{key: null, reason: string}}
 */
export function computeGateKey({ repo, scope, git = gitReader(repo), entry = (rel) => treeEntry(repo, rel), tools }) {
  let indexListing;
  let status;
  try {
    indexListing = git(['ls-files', '-s', '-z']);
    status = git(['status', '--porcelain=v1', '-z', '--untracked-files=all']);
  } catch (error) {
    return { key: null, reason: `git failed: ${error.message.split('\n')[0]}` };
  }

  // Start from the index listing (`<mode> <oid> <stage>\tpath`), then overwrite every
  // path git reports as differing from it with what is actually on disk. The result
  // describes the WORKING TREE - never HEAD, which would hand back a stale PASS for
  // the uncommitted implementations this repository routinely gates.
  const tree = new Map();
  for (const record of indexListing.split('\0')) {
    if (record === '') continue;
    const separator = record.indexOf('\t');
    const [mode, oid, stage] = record.slice(0, separator).split(' ');
    const file = record.slice(separator + 1);
    if (stage !== '0') return { key: null, reason: `unmerged index stage ${stage} for ${file}` };
    tree.set(file, `${mode} ${oid}`);
  }

  // -z porcelain records are NUL-terminated; `R`/`C` add a second NUL-terminated
  // path, which this parser refuses rather than mis-consuming.
  for (const record of status.split('\0')) {
    if (record === '') continue;
    const x = record[0];
    const y = record[1];
    const file = record.slice(3);
    if (!DESCRIBABLE.has(x) || !DESCRIBABLE.has(y)) {
      return { key: null, reason: `undescribable status '${x}${y}' for ${file}` };
    }
    if (y === 'D' || (x === 'D' && y === ' ')) {
      tree.delete(file);
      continue;
    }
    try {
      tree.set(file, entry(file));
    } catch (error) {
      return { key: null, reason: `cannot digest ${file}: ${error.message}` };
    }
  }

  const listing = [...tree.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([file, value]) => `${value} ${file}`);
  const parts = [
    `schema=${MEMO_SCHEMA}`,
    `scope=${JSON.stringify(scope)}`,
    `node=${process.version}`,
    `platform=${process.platform}/${process.arch}`,
    `tools=${(tools ?? toolFingerprint(['cargo', 'shellcheck', 'pnpm'])).join(',')}`,
    `worktree=${sha256(listing.join('\n'))}`,
  ];
  return { key: sha256(parts.join('\n')), entries: listing.length };
}

const memoFile = (root, key) => path.join(root, `${key}.json`);

export function lookupMemo(key, root = memoRoot()) {
  if (key === null) return null;
  try {
    const record = JSON.parse(fs.readFileSync(memoFile(root, key), 'utf8'));
    return record.schema === MEMO_SCHEMA && record.key === key && record.status === 'passed' ? record : null;
  } catch {
    return null;
  }
}

/** Records a PASS. A failing gate is never memoized - callers must not call this on failure. */
export function recordMemo(key, entry, root = memoRoot()) {
  if (key === null) return null;
  fs.mkdirSync(root, { recursive: true, mode: 0o700 });
  fs.chmodSync(root, 0o700);
  const file = memoFile(root, key);
  const record = { schema: MEMO_SCHEMA, key, status: 'passed', recorded_at: new Date().toISOString(), ...entry };
  fs.writeFileSync(file, `${JSON.stringify(record)}\n`, { encoding: 'utf8', mode: 0o600 });
  pruneMemos(root);
  return file;
}

export function pruneMemos(root = memoRoot(), keep = MEMO_KEEP) {
  let files;
  try {
    files = fs.readdirSync(root).filter((name) => name.endsWith('.json'));
  } catch {
    return;
  }
  if (files.length <= keep) return;
  const ordered = files
    .map((name) => {
      const full = path.join(root, name);
      try {
        return { full, mtime: fs.statSync(full).mtimeMs };
      } catch {
        return { full, mtime: 0 };
      }
    })
    .sort((a, b) => b.mtime - a.mtime);
  for (const { full } of ordered.slice(keep)) {
    try {
      fs.rmSync(full, { force: true });
    } catch {}
  }
}
