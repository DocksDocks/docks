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

// A memo may be reused only when every executable the gate invokes has the same
// identity. Availability alone is a proxy: changing the executable can change the
// result while leaving the working tree untouched.
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

// Git ignores node_modules, so the worktree digest is only a proxy for dependency
// availability. pnpm's small install record captures that state without walking or
// hashing dependency contents.
function installFingerprint(repo) {
  const installRecord = 'node_modules/.modules.yaml';
  try {
    return sha256(fs.readFileSync(path.join(repo, installRecord)));
  } catch (error) {
    if (error.code === 'ENOENT') return 'absent';
    throw new Error(`cannot digest ${installRecord}: ${error.message}`);
  }
}

/**
 * Digest of everything that decides the gate's outcome.
 * @returns {{key: string, entries: number}|{key: null, reason: string}}
 */
export function computeGateKey({ repo, scope, git = gitReader(repo), entry = (rel) => treeEntry(repo, rel), tools }) {
  let install;
  try {
    install = installFingerprint(repo);
  } catch (error) {
    return { key: null, reason: error.message };
  }
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
    `tools=${(tools ?? toolFingerprint(['cargo', 'claude', 'git', 'node', 'pnpm', 'shellcheck'])).join(',')}`,
    `install=${install}`,
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

// ---------------------------------------------------------------------------
// Gate cost advisory.
//
// The memo above answers "do not re-pay for bytes already gated". This answers the
// question one step earlier: "what did the gate just charge you for, and was a
// cheaper correct invocation available?". An operator once ran the full gate six
// times for a change confined to one plugin, because nothing in the output said
// that 88% of the wall time belonged to a plugin the change never touched.
//
// It renders from the timing record ci.mjs already builds for `--timings-json`
// (`total_ms`, `phases[].name/.duration_ms`, `commands`); there is deliberately no
// second timing mechanism to keep honest.

/** A full run slower than this is worth telling the operator about `--memo`. */
export const MEMO_HINT_MS = 120_000;

const seconds = (ms) => `${(ms / 1000).toFixed(1)}s`;

/**
 * Which plugins the working tree actually touches, so the advice below can name the
 * scope the operator NEEDS rather than the phase that happened to be dearest. The
 * dearest phase is usually the plugin they did not touch, and a copy-pasteable
 * command for the wrong scope is worse advice than none.
 *
 * One `git status` and nothing else - this must never cost gate time. Any git
 * failure returns `null`, and a null scope prints the cost table with no advice at
 * all: an unavailable git must not break the gate or invent a scope.
 *
 * @param {{repo: string, plugins: Array<{name: string, root: string}>, git?: (args: string[]) => string}} input
 * @returns {{plugins: string[], outside: boolean}|null}
 */
export function changedScopes({ repo, plugins, git = gitReader(repo) }) {
  let status;
  try {
    status = git(['status', '--porcelain=v1', '-z', '--untracked-files=all']);
  } catch {
    return null;
  }
  const records = status.split('\0');
  const touched = new Set();
  let outside = false;
  const attribute = (file) => {
    const owner = plugins.find(({ root }) => file === root || file.startsWith(`${root}/`));
    if (owner === undefined) outside = true;
    else touched.add(owner.name);
  };
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    if (record === '') continue;
    attribute(record.slice(3));
    // `R`/`C` records are followed by a bare source path with no status prefix;
    // consume it here so it is never read as a status record with three bytes eaten.
    if (record[0] === 'R' || record[0] === 'C' || record[1] === 'R' || record[1] === 'C') {
      index += 1;
      if (records[index]) attribute(records[index]);
    }
  }
  return { plugins: [...touched].sort(), outside };
}

/**
 * Phase-cost summary for the end of a full gate run.
 *
 * Returns `null` - print nothing - for a targeted run (`--plugin`/`--lane`, already
 * the cheap path, so the advice would be noise) and for a memo hit, which runs no
 * commands and therefore has no costs to report.
 *
 * @param {{mode: {plugin: string|null, lane?: string|null}, status: string, total_ms: number,
 *          phases: Array<{name: string, duration_ms: number}>, commands: Array<unknown>}} report
 * @param {{memoRequested?: boolean, top?: number, scopes?: {plugins: string[], outside: boolean}|null}} options
 * @returns {string|null}
 */
export function renderGateCost(report, { memoRequested = false, top = 3, scopes = null } = {}) {
  if ((report.mode?.plugin ?? null) !== null || (report.mode?.lane ?? null) !== null) return null;
  const phases = report.phases ?? [];
  const commands = report.commands ?? [];
  if (phases.length === 0 || commands.length === 0) return null;
  const total = report.total_ms;
  if (!(total > 0)) return null;

  const share = (ms) => `${((ms / total) * 100).toFixed(1)}%`;
  const ranked = [...phases].sort((a, b) => b.duration_ms - a.duration_ms);
  const lines = [`▣ gate cost — ${seconds(total)} across ${phases.length} phase(s) and ${commands.length} command(s)`];
  for (const phase of ranked.slice(0, top)) {
    lines.push(`    ${share(phase.duration_ms).padStart(6)}  ${seconds(phase.duration_ms).padStart(7)}  ${phase.name}`);
  }

  // The advice is derived from what the working tree CHANGED, never from which phase
  // was dearest: the dearest phase is typically the plugin the operator never touched,
  // and a copy-pasteable command for the wrong scope is worse than silence. A null
  // `scopes` (git unavailable or failing) prints the evidence above and stops.
  const cheapestScope = () => {
    if (scopes === null) return null;
    if (scopes.outside) {
      return '  The full gate is the correct scope: this working tree changes files outside every plugin root.';
    }
    if (scopes.plugins.length === 0) {
      return '  Working tree is clean, so no targeted scope is cheaper; --memo is the only lever left (opt-in: a memo that enables itself can hide a stale pass).';
    }
    if (scopes.plugins.length === 1) {
      return `  Cheaper next time: node scripts/ci.mjs --plugin ${scopes.plugins[0]} — the only plugin this working tree touches.`;
    }
    return `  This working tree touches ${scopes.plugins.length} plugins (${scopes.plugins.join(', ')}); one --plugin run covers one of them, so no single invocation is both cheaper and complete.`;
  };
  const advice = cheapestScope();
  if (advice !== null) lines.push(advice);

  // Only a pass is memoizable, so only a pass may claim the memo would have helped,
  // and the clean-tree advice above already named it.
  const memoAlreadyNamed = advice !== null && advice.includes('--memo');
  if (report.status === 'passed' && !memoRequested && !memoAlreadyNamed && total > MEMO_HINT_MS) {
    lines.push(
      `  --memo would have keyed this ${seconds(total)} pass to the working tree, so an unchanged re-run costs nothing (opt-in only: a memo that enables itself can hide a stale pass).`,
    );
  }
  return lines.join('\n');
}
