import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  changedScopes,
  computeGateKey,
  lookupMemo,
  MEMO_HINT_MS,
  memoRoot,
  pruneMemos,
  recordMemo,
  renderGateCost,
} from '../../lib/gate-memo.mjs';

const TOOLS = ['cargo=absent'];

function fixtureRepo(label, t, { installEntries = [], storeLinks = [], rootLinks = [], binLinks = [] } = {}) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), `gate-memo-${label}-`)));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' });
  git('init', '-q', '-b', 'main');
  git('config', 'user.email', 'gate@example.test');
  git('config', 'user.name', 'Gate Memo Test');
  fs.writeFileSync(path.join(root, 'a.txt'), 'alpha\n');
  fs.mkdirSync(path.join(root, 'src'));
  fs.writeFileSync(path.join(root, 'src', 'b.mjs'), 'export const b = 1;\n');
  fs.writeFileSync(path.join(root, '.gitignore'), 'ignored/\nnode_modules/\n');
  git('add', '-A');
  git('commit', '-qm', 'seed');
  const installStore = path.join(root, 'node_modules', '.bun');
  for (const entry of installEntries) fs.mkdirSync(path.join(installStore, entry, 'node_modules'), { recursive: true });
  for (const [entry, name, target] of storeLinks) {
    const link = path.join(installStore, entry, 'node_modules', name);
    fs.mkdirSync(path.dirname(link), { recursive: true });
    fs.symlinkSync(target, link);
  }
  for (const [name, target] of rootLinks) {
    const link = path.join(root, 'node_modules', name);
    fs.mkdirSync(path.dirname(link), { recursive: true });
    fs.symlinkSync(target, link);
  }
  for (const [name, target] of binLinks) {
    const bin = path.join(root, 'node_modules', '.bin');
    fs.mkdirSync(bin, { recursive: true });
    fs.symlinkSync(target, path.join(bin, name));
  }
  return { root, git, key: () => computeGateKey({ repo: root, scope: { plugin: null, lane: null }, tools: TOOLS }) };
}

test('gate key is stable when nothing changes', (t) => {
  const repo = fixtureRepo('stable', t);
  const first = repo.key();
  assert.equal(typeof first.key, 'string');
  assert.equal(repo.key().key, first.key);
});

test('isolated Bun install entries are part of the gate key', (t) => {
  const repo = fixtureRepo('install-fingerprint', t, {
    installEntries: ['@biomejs+biome@2.5.4', 'yaml@2.9.0'],
  });
  const installed = repo.key().key;
  assert.equal(typeof installed, 'string');

  const installStore = path.join(repo.root, 'node_modules', '.bun');
  fs.renameSync(path.join(installStore, 'yaml@2.9.0'), path.join(installStore, 'yaml@2.10.0'));
  const versionChanged = repo.key().key;
  assert.notEqual(versionChanged, installed, 'changing an installed package version must change the key');

  fs.rmSync(path.join(repo.root, 'node_modules'), { recursive: true });
  const absent = repo.key().key;
  assert.notEqual(absent, installed, 'removing node_modules must change the installed key');
  assert.notEqual(absent, versionChanged, 'an absent install must have its own key');
});

test('nested isolated-store dependency links are part of the gate key', (t) => {
  const dependency = 'node_modules/.bun/@biomejs+biome@2.5.4/node_modules/@biomejs/cli-linux-x64';
  const repo = fixtureRepo('store-link-fingerprint', t, {
    installEntries: ['@biomejs+biome@2.5.4', '@biomejs+cli-linux-x64@2.5.4'],
    storeLinks: [
      [
        '@biomejs+biome@2.5.4',
        '@biomejs/cli-linux-x64',
        '../../../@biomejs+cli-linux-x64@2.5.4/node_modules/@biomejs/cli-linux-x64',
      ],
    ],
  });
  const installed = repo.key().key;
  fs.unlinkSync(path.join(repo.root, dependency));
  assert.notEqual(repo.key().key, installed, 'removing a nested store dependency link must change the key');
});

test('nested isolated-store dependency targets are part of the gate key', (t) => {
  const dependency = 'node_modules/.bun/@biomejs+biome@2.5.4/node_modules/@biomejs/cli-linux-x64';
  const repo = fixtureRepo('store-target-fingerprint', t, {
    installEntries: ['@biomejs+biome@2.5.4', '@biomejs+cli-linux-x64@2.5.4'],
    storeLinks: [
      [
        '@biomejs+biome@2.5.4',
        '@biomejs/cli-linux-x64',
        '../../../@biomejs+cli-linux-x64@2.5.4/node_modules/@biomejs/cli-linux-x64',
      ],
    ],
  });
  const installed = repo.key().key;
  fs.unlinkSync(path.join(repo.root, dependency));
  fs.symlinkSync('../../../different/cli-linux-x64', path.join(repo.root, dependency));
  assert.notEqual(repo.key().key, installed, 'repointing a nested store dependency link must change the key');
});

test('root dependency links are part of the gate key', (t) => {
  const repo = fixtureRepo('root-link-fingerprint', t, {
    installEntries: ['yaml@2.9.0'],
    rootLinks: [['yaml', '.bun/yaml@2.9.0/node_modules/yaml']],
  });
  const installed = repo.key().key;
  fs.unlinkSync(path.join(repo.root, 'node_modules', 'yaml'));
  assert.notEqual(repo.key().key, installed, 'removing a root dependency link must change the key');
});

test('scoped dependency links are part of the gate key', (t) => {
  const dependency = 'node_modules/@anthropic-ai/claude-code';
  const repo = fixtureRepo('scoped-link-fingerprint', t, {
    installEntries: ['@anthropic-ai+claude-code@1.0.0'],
    rootLinks: [
      ['@anthropic-ai/claude-code', '../.bun/@anthropic-ai+claude-code@1.0.0/node_modules/@anthropic-ai/claude-code'],
    ],
  });
  const installed = repo.key().key;
  fs.unlinkSync(path.join(repo.root, dependency));
  assert.notEqual(repo.key().key, installed, 'removing a scoped dependency link must change the key');
});

test('scoped dependency link targets are part of the gate key', (t) => {
  const dependency = 'node_modules/@anthropic-ai/claude-code';
  const repo = fixtureRepo('scoped-target-fingerprint', t, {
    installEntries: ['@anthropic-ai+claude-code@1.0.0'],
    rootLinks: [
      ['@anthropic-ai/claude-code', '../.bun/@anthropic-ai+claude-code@1.0.0/node_modules/@anthropic-ai/claude-code'],
    ],
  });
  const installed = repo.key().key;
  fs.unlinkSync(path.join(repo.root, dependency));
  fs.symlinkSync('../different/claude-code', path.join(repo.root, dependency));
  assert.notEqual(repo.key().key, installed, 'repointing a scoped dependency link must change the key');
});

test('Bun binary links are part of the gate key', (t) => {
  const repo = fixtureRepo('bin-link-fingerprint', t, {
    installEntries: ['@biomejs+biome@2.5.4'],
    binLinks: [['biome', '../.bun/@biomejs+biome@2.5.4/node_modules/@biomejs/biome/bin/biome']],
  });
  const installed = repo.key().key;
  fs.unlinkSync(path.join(repo.root, 'node_modules', '.bin', 'biome'));
  assert.notEqual(repo.key().key, installed, 'removing a binary link must change the key');
});

test('Bun binary link targets are part of the gate key', (t) => {
  const bin = 'node_modules/.bin/biome';
  const repo = fixtureRepo('bin-target-fingerprint', t, {
    installEntries: ['@biomejs+biome@2.5.4'],
    binLinks: [['biome', '../.bun/@biomejs+biome@2.5.4/node_modules/@biomejs/biome/bin/biome']],
  });
  const installed = repo.key().key;
  fs.unlinkSync(path.join(repo.root, bin));
  fs.symlinkSync('../different/biome', path.join(repo.root, bin));
  assert.notEqual(repo.key().key, installed, 'repointing a binary link must change the key');
});

test('a changed byte in a tracked file misses the memo', (t) => {
  const repo = fixtureRepo('changed-byte', t);
  const before = repo.key().key;
  fs.writeFileSync(path.join(repo.root, 'src', 'b.mjs'), 'export const b = 2;\n');
  const after = repo.key().key;
  assert.notEqual(after, before, 'an uncommitted one-byte edit must change the key');

  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gate-memo-store-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  recordMemo(before, { scope: { plugin: null, lane: null } }, root);
  assert.equal(lookupMemo(after, root), null, 'the changed tree must MISS');
  assert.ok(lookupMemo(before, root), 'the recorded tree still HITS');
});

test('the key follows the working tree, not HEAD', (t) => {
  const repo = fixtureRepo('worktree', t);
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

test('a new untracked file changes the key; an ignored one does not', (t) => {
  const repo = fixtureRepo('untracked', t);
  const base = repo.key().key;
  fs.mkdirSync(path.join(repo.root, 'ignored'));
  fs.writeFileSync(path.join(repo.root, 'ignored', 'noise.txt'), 'noise\n');
  assert.equal(repo.key().key, base, 'gitignored bytes are not gate inputs');

  fs.writeFileSync(path.join(repo.root, 'src', 'c.mjs'), 'export const c = 3;\n');
  assert.notEqual(repo.key().key, base, 'an untracked source file is a gate input');
});

test('a deleted file changes the key', (t) => {
  const repo = fixtureRepo('deleted', t);
  const base = repo.key().key;
  fs.rmSync(path.join(repo.root, 'a.txt'));
  assert.notEqual(repo.key().key, base);
});

test('scope and tool availability are part of the key', (t) => {
  const repo = fixtureRepo('scope', t);
  const full = computeGateKey({ repo: repo.root, scope: { plugin: null, lane: null }, tools: TOOLS }).key;
  const scoped = computeGateKey({ repo: repo.root, scope: { plugin: 'docks', lane: null }, tools: TOOLS }).key;
  const withCargo = computeGateKey({ repo: repo.root, scope: { plugin: null, lane: null }, tools: ['cargo=abc'] }).key;
  assert.notEqual(scoped, full, '--plugin gates a different set of checks');
  assert.notEqual(withCargo, full, 'installing a tool changes which checks run');
});

test('an undescribable working tree misses instead of guessing', (t) => {
  const repo = fixtureRepo('undescribable', t);
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

test('a real merge conflict misses instead of guessing', (t) => {
  const repo = fixtureRepo('conflict', t);
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

test('memo store lives under XDG_STATE_HOME/docks with mode 0700', (t) => {
  const state = fs.mkdtempSync(path.join(os.tmpdir(), 'gate-memo-xdg-'));
  t.after(() => fs.rmSync(state, { recursive: true, force: true }));
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

test('a record that is not a recorded pass never hits', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gate-memo-bad-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.writeFileSync(path.join(root, 'k1.json'), JSON.stringify({ schema: 1, key: 'k1', status: 'failed' }));
  fs.writeFileSync(path.join(root, 'k2.json'), JSON.stringify({ schema: 99, key: 'k2', status: 'passed' }));
  fs.writeFileSync(path.join(root, 'k3.json'), 'not json');
  assert.equal(lookupMemo('k1', root), null);
  assert.equal(lookupMemo('k2', root), null);
  assert.equal(lookupMemo('k3', root), null);
  assert.equal(lookupMemo('absent', root), null);
});

test('the memo store is bounded', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gate-memo-prune-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (let index = 0; index < 8; index += 1) {
    fs.writeFileSync(path.join(root, `k${index}.json`), '{}');
    fs.utimesSync(path.join(root, `k${index}.json`), 1000 + index, 1000 + index);
  }
  pruneMemos(root, 3);
  assert.deepEqual(fs.readdirSync(root).sort(), ['k5.json', 'k6.json', 'k7.json']);
});

// A memo recorded by `--plugin X` describes a run that gated a fraction of the
// checks. Handing it back to a full run would be a false green - the worst outcome
// this module can produce - so the scope is mixed into the key in both directions.
test('a scoped pass never satisfies a full run, and a full pass never satisfies a scoped one', (t) => {
  const repo = fixtureRepo('cross-scope', t);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gate-memo-cross-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const keyFor = (scope) => computeGateKey({ repo: repo.root, scope, tools: TOOLS }).key;
  const full = keyFor({ plugin: null, lane: null });
  const scoped = keyFor({ plugin: 'docks', lane: null });
  const laned = keyFor({ plugin: null, lane: 'plan' });
  assert.equal(new Set([full, scoped, laned]).size, 3, 'each scope keys its own memo');

  recordMemo(scoped, { scope: { plugin: 'docks', lane: null } }, root);
  assert.equal(lookupMemo(full, root), null, 'a --plugin pass must not satisfy a later full run');
  assert.equal(lookupMemo(laned, root), null, 'a --plugin pass must not satisfy a later --lane run');
  assert.equal(lookupMemo(scoped, root).status, 'passed', 'the same scope still hits');

  fs.rmSync(path.join(root, `${scoped}.json`));
  recordMemo(full, { scope: { plugin: null, lane: null } }, root);
  assert.equal(lookupMemo(scoped, root), null, 'a full pass must not satisfy a later --plugin run');
  assert.equal(lookupMemo(full, root).status, 'passed');
});

// The measured shape of a real full gate run: one plugin dominates at 88% and
// everything else is noise beside it.
const FULL_RUN = {
  mode: { plugin: null },
  status: 'passed',
  total_ms: 364_600,
  phases: [
    { name: 'workflow YAML', duration_ms: 900 },
    { name: 'plan orchestration', duration_ms: 23_800 },
    { name: 'plugin: effect-kit', duration_ms: 320_500 },
    { name: 'plugin: plan-lifecycle', duration_ms: 4_200 },
    { name: 'plugin: docks', duration_ms: 1_100 },
  ],
  commands: Array.from({ length: 70 }, (_, index) => ({ id: `c${index}` })),
};

const CHANGED_ONE = { plugins: ['plan-lifecycle'], outside: false };

test('the cost summary ranks the full run and names the scope the tree actually needs', () => {
  assert.equal(
    renderGateCost(FULL_RUN, { memoRequested: true, scopes: CHANGED_ONE }),
    [
      '▣ gate cost — 364.6s across 5 phase(s) and 70 command(s)',
      '     87.9%   320.5s  plugin: effect-kit',
      '      6.5%    23.8s  plan orchestration',
      '      1.2%     4.2s  plugin: plan-lifecycle',
      '  Cheaper next time: node scripts/ci.mjs --plugin plan-lifecycle — the only plugin this working tree touches.',
    ].join('\n'),
  );
  // A failing gate still gets the cost breakdown: the operator about to re-run is
  // exactly the one who needs to know what a re-run costs.
  assert.match(renderGateCost({ ...FULL_RUN, status: 'failed' }, { scopes: CHANGED_ONE }), /^▣ gate cost — 364.6s/);
});

// The dearest phase is effect-kit in every one of these runs. Naming it would be
// exactly the wrong advice: it is the plugin these trees did not touch.
test('the advice follows the changed paths, never the dearest phase', () => {
  const advise = (scopes) => renderGateCost(FULL_RUN, { memoRequested: true, scopes }).split('\n').at(-1);
  assert.equal(
    advise(CHANGED_ONE),
    '  Cheaper next time: node scripts/ci.mjs --plugin plan-lifecycle — the only plugin this working tree touches.',
  );
  assert.doesNotMatch(advise(CHANGED_ONE), /effect-kit/, 'never hand over a command for the untouched plugin');

  // Several plugins: name them, but offer no command, because no single --plugin run
  // would be both cheaper and complete.
  const many = advise({ plugins: ['docks', 'plan-lifecycle'], outside: false });
  assert.equal(
    many,
    '  This working tree touches 2 plugins (docks, plan-lifecycle); one --plugin run covers one of them, so no single invocation is both cheaper and complete.',
  );
  assert.doesNotMatch(many, /node scripts\/ci\.mjs --plugin/, 'no copy-pasteable half-scope');

  // A change outside every plugin root: the full gate IS the right scope, and the
  // line must not push anyone off a gate they need.
  assert.equal(
    advise({ plugins: ['docks'], outside: true }),
    '  The full gate is the correct scope: this working tree changes files outside every plugin root.',
  );

  // A clean tree has no cheaper scope at all; the memo is the only remaining lever,
  // and it is named once rather than twice.
  const clean = renderGateCost(FULL_RUN, { scopes: { plugins: [], outside: false } });
  assert.equal(
    clean.split('\n').at(-1),
    '  Working tree is clean, so no targeted scope is cheaper; --memo is the only lever left (opt-in: a memo that enables itself can hide a stale pass).',
  );
  assert.doesNotMatch(clean, /would have keyed this/, 'the clean-tree advice already named --memo');

  // git could not say: print the evidence, advise nothing, and never break the gate.
  const blind = renderGateCost(FULL_RUN, { memoRequested: true, scopes: null });
  assert.equal(blind.split('\n').at(-1), '      1.2%     4.2s  plugin: plan-lifecycle');
});

test('changed scopes are attributed from git status, and a git failure advises nothing', () => {
  const plugins = [
    { name: 'docks', root: 'plugins/docks' },
    { name: 'plan-lifecycle', root: 'plugins/plan-lifecycle' },
  ];
  const from = (status) => changedScopes({ repo: '.', plugins, git: () => status });
  assert.deepEqual(from(''), { plugins: [], outside: false });
  assert.deepEqual(from(' M plugins/docks/hooks/a.mjs\0?? plugins/docks/b.mjs\0'), {
    plugins: ['docks'],
    outside: false,
  });
  assert.deepEqual(from(' M plugins/plan-lifecycle/x.mjs\0 M scripts/ci.mjs\0'), {
    plugins: ['plan-lifecycle'],
    outside: true,
  });
  // `R`/`C` records carry a NUL-terminated source path with no status prefix. Both
  // ends are attributed, and the source is never re-read as a status record.
  assert.deepEqual(from('R  plugins/docks/new.mjs\0plugins/plan-lifecycle/old.mjs\0'), {
    plugins: ['docks', 'plan-lifecycle'],
    outside: false,
  });
  assert.equal(
    changedScopes({
      repo: '.',
      plugins,
      git: () => {
        throw new Error('git: command not found');
      },
    }),
    null,
  );
});

test('the cost summary is silent for a targeted run and for a memo hit', () => {
  assert.equal(renderGateCost({ ...FULL_RUN, mode: { plugin: 'plan-lifecycle' } }, {}), null);
  assert.equal(renderGateCost({ ...FULL_RUN, mode: { plugin: null, lane: 'plan' } }, {}), null);
  // A memo hit exits before any phase or command runs, so there is no cost to report.
  assert.equal(renderGateCost({ ...FULL_RUN, phases: [], commands: [], total_ms: 40 }, {}), null);
  assert.equal(renderGateCost({ ...FULL_RUN, commands: [] }, {}), null);
});

test('the memo hint appears only above the threshold and only when nobody asked for --memo', () => {
  const hint = /--memo would have keyed this/;
  const at = (total_ms, options) => renderGateCost({ ...FULL_RUN, total_ms }, options);
  assert.doesNotMatch(at(MEMO_HINT_MS, {}), hint, 'at the threshold the gate is not slow enough to nag');
  assert.match(at(MEMO_HINT_MS + 1, {}), hint);
  assert.doesNotMatch(at(MEMO_HINT_MS + 1, { memoRequested: true }), hint, '--memo was already passed');
  assert.doesNotMatch(
    renderGateCost({ ...FULL_RUN, status: 'failed' }, {}),
    hint,
    'a failing gate is never recorded, so the memo would not have helped',
  );
});
