import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { computeGateKey, lookupMemo, memoRoot, pruneMemos, recordMemo } from '../../lib/gate-memo.mjs';

const TOOLS = ['cargo=absent'];

function fixtureRepo(label) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), `gate-memo-${label}-`)));
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' });
  git('init', '-q', '-b', 'main');
  git('config', 'user.email', 'gate@example.test');
  git('config', 'user.name', 'Gate Memo Test');
  fs.writeFileSync(path.join(root, 'a.txt'), 'alpha\n');
  fs.mkdirSync(path.join(root, 'src'));
  fs.writeFileSync(path.join(root, 'src', 'b.mjs'), 'export const b = 1;\n');
  fs.writeFileSync(path.join(root, '.gitignore'), 'ignored/\n');
  git('add', '-A');
  git('commit', '-qm', 'seed');
  return { root, git, key: () => computeGateKey({ repo: root, scope: { plugin: null, lane: null }, tools: TOOLS }) };
}

test('gate key is stable when nothing changes', () => {
  const repo = fixtureRepo('stable');
  const first = repo.key();
  assert.equal(typeof first.key, 'string');
  assert.equal(repo.key().key, first.key);
});

test('a changed byte in a tracked file misses the memo', () => {
  const repo = fixtureRepo('changed-byte');
  const before = repo.key().key;
  fs.writeFileSync(path.join(repo.root, 'src', 'b.mjs'), 'export const b = 2;\n');
  const after = repo.key().key;
  assert.notEqual(after, before, 'an uncommitted one-byte edit must change the key');

  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gate-memo-store-'));
  recordMemo(before, { scope: { plugin: null, lane: null } }, root);
  assert.equal(lookupMemo(after, root), null, 'the changed tree must MISS');
  assert.ok(lookupMemo(before, root), 'the recorded tree still HITS');
});

test('the key follows the working tree, not HEAD', () => {
  const repo = fixtureRepo('worktree');
  const dirty = path.join(repo.root, 'a.txt');
  fs.writeFileSync(dirty, 'alpha modified\n');
  const dirtyKey = repo.key().key;
  const headBefore = repo.git('rev-parse', 'HEAD').trim();

  repo.git('add', '-A');
  repo.git('commit', '-qm', 'commit the same bytes');
  const committedKey = repo.key().key;
  assert.notEqual(repo.git('rev-parse', 'HEAD').trim(), headBefore);
  assert.equal(committedKey, dirtyKey, 'identical worktree bytes key identically across a commit');

  fs.writeFileSync(dirty, 'alpha\n');
  assert.notEqual(repo.key().key, committedKey, 'reverting the worktree changes the key again');
});

test('a new untracked file changes the key; an ignored one does not', () => {
  const repo = fixtureRepo('untracked');
  const base = repo.key().key;
  fs.mkdirSync(path.join(repo.root, 'ignored'));
  fs.writeFileSync(path.join(repo.root, 'ignored', 'noise.txt'), 'noise\n');
  assert.equal(repo.key().key, base, 'gitignored bytes are not gate inputs');

  fs.writeFileSync(path.join(repo.root, 'src', 'c.mjs'), 'export const c = 3;\n');
  assert.notEqual(repo.key().key, base, 'an untracked source file is a gate input');
});

test('a deleted file changes the key', () => {
  const repo = fixtureRepo('deleted');
  const base = repo.key().key;
  fs.rmSync(path.join(repo.root, 'a.txt'));
  assert.notEqual(repo.key().key, base);
});

test('scope and tool availability are part of the key', () => {
  const repo = fixtureRepo('scope');
  const full = computeGateKey({ repo: repo.root, scope: { plugin: null, lane: null }, tools: TOOLS }).key;
  const scoped = computeGateKey({ repo: repo.root, scope: { plugin: 'docks', lane: null }, tools: TOOLS }).key;
  const withCargo = computeGateKey({ repo: repo.root, scope: { plugin: null, lane: null }, tools: ['cargo=abc'] }).key;
  assert.notEqual(scoped, full, '--plugin gates a different set of checks');
  assert.notEqual(withCargo, full, 'installing a tool changes which checks run');
});

test('an undescribable working tree misses instead of guessing', () => {
  const repo = fixtureRepo('undescribable');
  const unmerged = computeGateKey({
    repo: repo.root,
    scope: {},
    tools: TOOLS,
    git: (args) => (args[0] === 'ls-files' ? '' : 'UU src/b.mjs\0'),
  });
  assert.equal(unmerged.key, null);
  assert.match(unmerged.reason, /undescribable status 'UU'/);

  const renamed = computeGateKey({
    repo: repo.root,
    scope: {},
    tools: TOOLS,
    git: (args) => (args[0] === 'ls-files' ? '' : 'R  new.txt\0old.txt\0'),
  });
  assert.equal(renamed.key, null, 'a rename record carries a second path this key does not read');

  const unreadable = computeGateKey({
    repo: repo.root,
    scope: {},
    tools: TOOLS,
    git: (args) => (args[0] === 'ls-files' ? '' : ' M sub\0'),
    entry: () => {
      throw new Error('not a regular file: sub');
    },
  });
  assert.equal(unreadable.key, null);
  assert.match(unreadable.reason, /cannot digest sub/);

  const broken = computeGateKey({
    repo: repo.root,
    scope: {},
    tools: TOOLS,
    git: () => {
      throw new Error('fatal: not a git repository');
    },
  });
  assert.equal(broken.key, null);
  assert.match(broken.reason, /git failed/);
  assert.equal(lookupMemo(null, memoRoot()), null, 'a null key can never hit');
});

test('a real merge conflict misses instead of guessing', () => {
  const repo = fixtureRepo('conflict');
  assert.equal(typeof repo.key().key, 'string');
  repo.git('checkout', '-q', '-b', 'other');
  fs.writeFileSync(path.join(repo.root, 'a.txt'), 'other\n');
  repo.git('commit', '-qam', 'other');
  repo.git('checkout', '-q', 'main');
  fs.writeFileSync(path.join(repo.root, 'a.txt'), 'main\n');
  repo.git('commit', '-qam', 'main');
  try {
    repo.git('merge', 'other');
  } catch {
    // The conflict is the point.
  }
  const conflicted = repo.key();
  assert.equal(conflicted.key, null, 'an unmerged working tree is not describable');
  assert.match(conflicted.reason, /unmerged|undescribable/);
});

test('memo store lives under XDG_STATE_HOME/docks with mode 0700', () => {
  const state = fs.mkdtempSync(path.join(os.tmpdir(), 'gate-memo-xdg-'));
  const root = memoRoot({ XDG_STATE_HOME: state });
  assert.equal(root, path.join(state, 'docks', 'ci-memo'));

  const file = recordMemo('deadbeef', { scope: {}, duration_ms: 12 }, root);
  assert.equal(fs.statSync(root).mode & 0o777, 0o700);
  assert.equal(fs.statSync(file).mode & 0o777, 0o600);
  const record = lookupMemo('deadbeef', root);
  assert.equal(record.status, 'passed');
  assert.equal(record.duration_ms, 12);
  assert.ok(Date.parse(record.recorded_at) > 0);
});

test('a record that is not a recorded pass never hits', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gate-memo-bad-'));
  fs.writeFileSync(path.join(root, 'k1.json'), JSON.stringify({ schema: 1, key: 'k1', status: 'failed' }));
  fs.writeFileSync(path.join(root, 'k2.json'), JSON.stringify({ schema: 99, key: 'k2', status: 'passed' }));
  fs.writeFileSync(path.join(root, 'k3.json'), 'not json');
  assert.equal(lookupMemo('k1', root), null);
  assert.equal(lookupMemo('k2', root), null);
  assert.equal(lookupMemo('k3', root), null);
  assert.equal(lookupMemo('absent', root), null);
});

test('the memo store is bounded', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gate-memo-prune-'));
  for (let index = 0; index < 8; index += 1) {
    fs.writeFileSync(path.join(root, `k${index}.json`), '{}');
    fs.utimesSync(path.join(root, `k${index}.json`), 1000 + index, 1000 + index);
  }
  pruneMemos(root, 3);
  assert.deepEqual(fs.readdirSync(root).sort(), ['k5.json', 'k6.json', 'k7.json']);
});
