import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

// The shipped checkout-state.sh of plan-manager, which the practice Delegated work runs before and after a dispatch.
// Two listings of the session checkout must differ in the line of each path that changed on disk, and in no other
// line, also when the checkout was dirty before the dispatch.
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const SCRIPT = path.join(ROOT, 'plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/checkout-state.sh');
const GIT_ENV = {
  ...process.env,
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_AUTHOR_NAME: 'Checkout state test',
  GIT_AUTHOR_EMAIL: 'checkout-state@example.invalid',
  GIT_COMMITTER_NAME: 'Checkout state test',
  GIT_COMMITTER_EMAIL: 'checkout-state@example.invalid',
  LC_ALL: 'C',
};

function git(cwd, ...args) {
  const result = spawnSync('git', args, { cwd, env: GIT_ENV, encoding: 'utf8' });
  assert.equal(result.status, 0, `git ${args.join(' ')}: ${result.stderr}`);
  return result.stdout;
}

function put(repo, file, text) {
  fs.mkdirSync(path.dirname(path.join(repo, file)), { recursive: true });
  fs.writeFileSync(path.join(repo, file), text);
}

function link(repo, file, target) {
  fs.mkdirSync(path.dirname(path.join(repo, file)), { recursive: true });
  fs.symlinkSync(target, path.join(repo, file));
}

function commitAll(repo, message) {
  git(repo, 'add', '-A');
  git(repo, 'commit', '-q', '-m', message);
}

function newRoot(t) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'checkout-state-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

function newRepo(root, name = 'repo') {
  const repo = path.join(root, name);
  fs.mkdirSync(repo);
  git(repo, 'init', '-q', '-b', 'main');
  return repo;
}

// A committed repository: a.txt is dirty, b.txt is clean, notes.txt is untracked, and .gitignore ignores *.log.
function dirtyRepo(t) {
  const root = newRoot(t);
  const repo = newRepo(root);
  put(repo, '.gitignore', '*.log\n');
  put(repo, 'a.txt', 'a at the base\n');
  put(repo, 'b.txt', 'b at the base\n');
  put(repo, 'src/c.txt', 'c at the base\n');
  commitAll(repo, 'base');
  put(repo, 'a.txt', 'a of the user\n');
  put(repo, 'notes.txt', 'untracked notes\n');
  return { root, repo };
}

function run(dir, env = {}) {
  return spawnSync('sh', [SCRIPT, dir], { env: { ...GIT_ENV, ...env }, encoding: 'utf8' });
}

function listing(dir) {
  const result = run(dir);
  assert.equal(result.status, 0, result.stderr);
  return result.stdout;
}

function linesOf(text) {
  return text.split('\n').filter((line) => line !== '');
}

// The path of each line that is in one listing only, as `diff` of the two listings names them.
function changedPaths(before, after) {
  const old = new Set(linesOf(before));
  const now = new Set(linesOf(after));
  const changed = [...old].filter((line) => !now.has(line)).concat([...now].filter((line) => !old.has(line)));
  return [...new Set(changed.map((line) => line.split('\t')[0]))].sort();
}

function lineOf(text, file) {
  const found = linesOf(text).filter((line) => line.split('\t')[0] === file);
  assert.equal(found.length, 1, `one line for ${file}`);
  return found[0];
}

function assertFails(result, name) {
  assert.notEqual(result.status, 0, `${name}: status ${result.status}`);
  assert.equal(result.stdout, '', `${name}: no output`);
}

test('two listings of an unchanged dirty checkout are the same, sorted, with raw blob ids', (t) => {
  const { repo } = dirtyRepo(t);
  link(repo, 'to-a', 'a.txt');
  const first = listing(repo);
  assert.equal(listing(repo), first);
  assert.equal(listing(path.join(repo, 'src')), first, 'a folder of the checkout lists the whole checkout');
  const lines = linesOf(first);
  assert.deepEqual(lines, [...lines].sort(), 'the lines are sorted');
  assert.deepEqual(
    lines.map((line) => line.split('\t')[0]),
    ['.gitignore', 'a.txt', 'b.txt', 'notes.txt', 'src/c.txt', 'to-a'],
  );
  assert.equal(lineOf(first, 'a.txt'), `a.txt\t${git(repo, 'hash-object', '--no-filters', 'a.txt').trim()}`);
  assert.equal(lineOf(first, 'to-a'), 'to-a\tlink\ta.txt');
});

test('a change of each kind changes the line of its path only', (t) => {
  const cases = [
    { name: 'a second change of a dirty tracked file', path: 'a.txt', change: (repo) => put(repo, 'a.txt', 'again\n') },
    { name: 'a new untracked file', path: 'new.txt', change: (repo) => put(repo, 'new.txt', 'new\n') },
    { name: 'a change of an untracked file', path: 'notes.txt', change: (repo) => put(repo, 'notes.txt', 'x\n') },
    { name: 'a deleted tracked file', path: 'b.txt', change: (repo) => fs.rmSync(path.join(repo, 'b.txt')) },
    { name: 'chmod +x of a tracked file', path: 'b.txt', change: (repo) => fs.chmodSync(`${repo}/b.txt`, 0o755) },
  ];
  for (const { name, path: file, change } of cases) {
    const { repo } = dirtyRepo(t);
    const before = listing(repo);
    change(repo);
    const after = listing(repo);
    assert.deepEqual(changedPaths(before, after), [file], name);
  }
});

test('a deleted tracked file is missing, and an executable file has the x field', (t) => {
  const { repo } = dirtyRepo(t);
  fs.rmSync(path.join(repo, 'b.txt'));
  fs.chmodSync(path.join(repo, 'src/c.txt'), 0o755);
  const state = listing(repo);
  assert.equal(lineOf(state, 'b.txt'), 'b.txt\tmissing');
  assert.match(lineOf(state, 'src/c.txt'), /^src\/c\.txt\t[0-9a-f]{40,64}\tx$/);
});

// Under `* text=auto`, git status and git diff do not show a change of the line endings only.
test('a line-ending-only change under text=auto changes the line of a tracked and of an untracked file', (t) => {
  const root = newRoot(t);
  const repo = newRepo(root);
  put(repo, '.gitattributes', '* text=auto\n');
  put(repo, 'tracked.txt', 'one\ntwo\n');
  commitAll(repo, 'base');
  put(repo, 'untracked.txt', 'one\ntwo\n');
  const before = listing(repo);
  put(repo, 'tracked.txt', 'one\r\ntwo\r\n');
  put(repo, 'untracked.txt', 'one\r\ntwo\r\n');
  assert.deepEqual(changedPaths(before, listing(repo)), ['tracked.txt', 'untracked.txt']);
});

test('an untracked link pointed at another file with the same content changes its line', (t) => {
  const { repo } = dirtyRepo(t);
  put(repo, 'one.txt', 'same\n');
  put(repo, 'two.txt', 'same\n');
  link(repo, 'pointer', 'one.txt');
  const before = listing(repo);
  fs.rmSync(path.join(repo, 'pointer'));
  link(repo, 'pointer', 'two.txt');
  const after = listing(repo);
  assert.deepEqual(changedPaths(before, after), ['pointer']);
  assert.equal(lineOf(after, 'pointer'), 'pointer\tlink\ttwo.txt');
});

test('a dangling link is listed with its target, with status 0', (t) => {
  const { repo } = dirtyRepo(t);
  link(repo, 'dangling', 'nowhere/at/all');
  assert.equal(lineOf(listing(repo), 'dangling'), 'dangling\tlink\tnowhere/at/all');
});

// The submodule mod holds x.txt, which is clean, and y.txt, which is dirty before the first listing.
function submoduleRepo(t) {
  const { root, repo } = dirtyRepo(t);
  const mod = path.join(repo, 'mod');
  fs.mkdirSync(mod);
  git(mod, 'init', '-q', '-b', 'main');
  put(mod, 'x.txt', 'x at the base\n');
  put(mod, 'y.txt', 'y at the base\n');
  commitAll(mod, 'module base');
  git(repo, '-c', 'advice.addEmbeddedRepo=false', 'add', 'mod');
  git(repo, 'commit', '-q', '-m', 'add mod');
  put(mod, 'y.txt', 'y of the user\n');
  return { root, repo, mod };
}

test('an edit inside a checked-out submodule changes the line of that file', (t) => {
  const { repo, mod } = submoduleRepo(t);
  const before = listing(repo);
  assert.equal(lineOf(before, 'mod'), `mod\tsubmodule\t${git(mod, 'rev-parse', 'HEAD').trim()}`);
  assert.equal(lineOf(before, 'mod/y.txt'), `mod/y.txt\t${git(mod, 'hash-object', '--no-filters', 'y.txt').trim()}`);
  put(mod, 'x.txt', 'x of a subagent\n');
  const after = listing(repo);
  assert.deepEqual(changedPaths(before, after), ['mod/x.txt']);
  put(mod, 'y.txt', 'y of a subagent\n');
  assert.deepEqual(changedPaths(after, listing(repo)), ['mod/y.txt'], 'a second edit of a dirty submodule file');
});

test('a submodule that is not checked out is special', (t) => {
  const root = newRoot(t);
  const repo = newRepo(root);
  put(repo, 'a.txt', 'a\n');
  git(repo, 'add', '-A');
  git(repo, 'update-index', '--add', '--cacheinfo', `160000,${'1'.repeat(40)},mod`);
  git(repo, 'commit', '-q', '-m', 'base');
  fs.mkdirSync(path.join(repo, 'mod'));
  assert.equal(lineOf(listing(repo), 'mod'), 'mod\tspecial');
});

test('an ignored file has no line, and its change changes nothing', (t) => {
  const { repo } = dirtyRepo(t);
  put(repo, 'build.log', 'first\n');
  const before = listing(repo);
  assert.equal(linesOf(before).filter((line) => line.startsWith('build.log\t')).length, 0);
  put(repo, 'build.log', 'second\n');
  assert.equal(listing(repo), before);
});

test('an unmerged path has one line', (t) => {
  const root = newRoot(t);
  const repo = newRepo(root);
  put(repo, 'f.txt', 'base\n');
  commitAll(repo, 'base');
  git(repo, 'switch', '-q', '-c', 'other');
  put(repo, 'f.txt', 'other\n');
  commitAll(repo, 'other');
  git(repo, 'switch', '-q', 'main');
  put(repo, 'f.txt', 'main\n');
  commitAll(repo, 'main');
  const merge = spawnSync('git', ['merge', '-q', 'other'], { cwd: repo, env: GIT_ENV, encoding: 'utf8' });
  assert.notEqual(merge.status, 0, 'the merge stops on a conflict');
  assert.equal(git(repo, 'ls-files', '--cached', 'f.txt').split('\n').filter(Boolean).length, 3);
  lineOf(listing(repo), 'f.txt');
});

test('a newline in a link target or a path, or a tab in a path, stops the script with no output', (t) => {
  const cases = [
    { name: 'a link target with a newline', change: (repo) => link(repo, 'odd-link', 'two\nlines') },
    { name: 'an untracked path with a newline', change: (repo) => put(repo, 'odd\nname.txt', 'x\n') },
    { name: 'an untracked path with a tab', change: (repo) => put(repo, 'odd\tname.txt', 'x\n') },
    { name: 'a newline in a submodule path', submodule: true, change: (repo) => put(repo, 'mod/odd\nname', 'x\n') },
  ];
  for (const { name, submodule, change } of cases) {
    const { repo } = submodule ? submoduleRepo(t) : dirtyRepo(t);
    change(repo);
    assertFails(run(repo), name);
  }
});

test('a folder outside a git checkout and a wrong argument stop the script with no output', (t) => {
  const root = newRoot(t);
  const plain = path.join(root, 'plain');
  fs.mkdirSync(plain);
  put(plain, 'a.txt', 'a\n');
  assertFails(run(plain, { GIT_CEILING_DIRECTORIES: root }), 'a folder outside a checkout');
  assertFails(run(path.join(root, 'absent')), 'a folder that does not exist');
  const none = spawnSync('sh', [SCRIPT], { env: GIT_ENV, encoding: 'utf8' });
  assert.equal(none.status, 2, 'no argument');
  assert.match(none.stderr, /usage: sh checkout-state\.sh <checkout>/);
});

test('a git failure stops the script with no output', (t) => {
  const { repo } = dirtyRepo(t);
  fs.writeFileSync(path.join(repo, '.git', 'index'), 'not an index');
  assertFails(run(repo), 'a broken index');
});
