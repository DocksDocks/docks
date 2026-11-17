import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

// The shipped shell that reads instruction files from the merge base: the base-instructions block of plan-manager
// phase 6 and the base read of code-review. Both must give a symlink the text of its target in the base tree.
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const PLAN_MANAGER = path.join(ROOT, 'plugins/plan-lifecycle/skills/productivity/plan-manager/SKILL.md');
const CODE_REVIEW = path.join(ROOT, 'plugins/docks/skills/engineering/code-review/SKILL.md');
const GIT_ENV = {
  ...process.env,
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_AUTHOR_NAME: 'Base instructions test',
  GIT_AUTHOR_EMAIL: 'base-instructions@example.invalid',
  GIT_COMMITTER_NAME: 'Base instructions test',
  GIT_COMMITTER_EMAIL: 'base-instructions@example.invalid',
  LC_ALL: 'C',
};

function bashBlock(file, marker) {
  const blocks = [...fs.readFileSync(file, 'utf8').matchAll(/^```bash\n([\s\S]*?)^```$/gm)].map(([, code]) => code);
  const found = blocks.filter((code) => code.includes(marker));
  assert.equal(found.length, 1, `${file} has one bash block with ${marker}`);
  return found[0];
}

function sh(cwd, script, env = {}) {
  return spawnSync('bash', ['-c', script], { cwd, env: { ...GIT_ENV, ...env }, encoding: 'utf8' });
}

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

// The base commit holds a root AGENTS.md and a CLAUDE.md link to it, as the benchmark fixture does, and links that
// resolve from the link's folder, a two-link chain, and links that are dangling, outside the tree, absolute, or a
// loop. The working tree changes AGENTS.md and src/a.mjs, commits src/lib/b.mjs, and adds an untracked file.
// deep/ holds a chain of 8 links and a chain of 9 links; no changed path is in deep/.
const SHARED = '# Shared rules\n';
const EXPECTED = new Map([
  ['AGENTS.md', '# Root rules at the base\n'],
  ['CLAUDE.md', '# Root rules at the base\n'],
  ['REVIEW.md', null],
  ['src/AGENTS.md', SHARED],
  ['src/CLAUDE.md', null],
  ['src/REVIEW.md', '# Review rules at the base\n'],
  ['src/lib/AGENTS.md', SHARED],
  ['src/lib/CLAUDE.md', null],
  ['src/lib/REVIEW.md', null],
]);

function newRepo(t) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'base-instructions-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const repo = path.join(root, 'repo');
  fs.mkdirSync(repo);
  git(repo, 'init', '-q', '-b', 'main');
  return { root, repo };
}

function instructionRepo(t) {
  const { root, repo } = newRepo(t);
  put(repo, 'AGENTS.md', '# Root rules at the base\n');
  link(repo, 'CLAUDE.md', 'AGENTS.md');
  link(repo, 'REVIEW.md', 'missing.md');
  put(repo, 'docs/rules.md', SHARED);
  link(repo, 'src/AGENTS.md', '../docs/rules.md');
  link(repo, 'src/CLAUDE.md', '../../outside.md');
  put(repo, 'src/REVIEW.md', '# Review rules at the base\n');
  put(repo, 'src/a.mjs', 'export const a = 1;\n');
  link(repo, 'src/lib/AGENTS.md', '../AGENTS.md');
  link(repo, 'src/lib/CLAUDE.md', '/etc/hosts');
  link(repo, 'src/lib/REVIEW.md', 'REVIEW.md');
  put(repo, 'deep/rules.md', '# Deep rules\n');
  for (let hop = 1; hop <= 8; hop += 1) link(repo, `deep/a${hop}`, hop === 8 ? 'rules.md' : `a${hop + 1}`);
  link(repo, 'deep/AGENTS.md', 'a2');
  link(repo, 'deep/CLAUDE.md', 'a1');
  git(repo, 'add', '-A');
  git(repo, 'commit', '-q', '-m', 'base');
  const base = git(repo, 'rev-parse', 'HEAD').trim();
  put(repo, 'AGENTS.md', '# Root rules of the head\n');
  put(repo, 'src/lib/b.mjs', 'export const b = 1;\n');
  git(repo, 'add', '-A');
  git(repo, 'commit', '-q', '-m', 'head');
  put(repo, 'src/a.mjs', 'export const a = 2;\n');
  put(repo, 'src/lib/new.mjs', 'export const c = 1;\n');
  return { root, repo, base };
}

// The base commit holds links whose targets test the path rules: a root link to `../outside.md`, a folder link to
// `..` (the root folder, whose first entry is a regular AGENTS.md), an empty target, and targets with `./` and `..`
// segments, also in a nested folder. The working tree adds a file in tools/ and in src/lib/.
const EDGE_REVIEW = '# Src review rules\n';
const EDGE_EXPECTED = new Map([
  ['AGENTS.md', '# Edge root rules\n'],
  ['CLAUDE.md', null],
  ['REVIEW.md', null],
  ['src/AGENTS.md', null],
  ['src/CLAUDE.md', null],
  ['src/REVIEW.md', EDGE_REVIEW],
  ['src/lib/AGENTS.md', '# Lib rules\n'],
  ['src/lib/CLAUDE.md', EDGE_REVIEW],
  ['src/lib/REVIEW.md', null],
  ['tools/AGENTS.md', null],
  ['tools/CLAUDE.md', null],
  ['tools/REVIEW.md', EDGE_REVIEW],
]);

function edgeRepo(t) {
  const { root, repo } = newRepo(t);
  put(repo, 'AGENTS.md', '# Edge root rules\n');
  link(repo, 'CLAUDE.md', '../outside.md');
  put(repo, 'src/REVIEW.md', EDGE_REVIEW);
  put(repo, 'src/lib/rules.md', '# Lib rules\n');
  link(repo, 'src/lib/AGENTS.md', './rules.md');
  link(repo, 'src/lib/CLAUDE.md', './../REVIEW.md');
  link(repo, 'tools/AGENTS.md', '..');
  link(repo, 'tools/REVIEW.md', './../src/./REVIEW.md');
  git(repo, 'add', '-A');
  // A file system cannot hold a link with an empty target, so the index gets it directly.
  const empty = spawnSync('git', ['hash-object', '-w', '--stdin'], { cwd: repo, env: GIT_ENV, input: '' });
  assert.equal(empty.status, 0, String(empty.stderr));
  git(repo, 'update-index', '--add', '--cacheinfo', `120000,${String(empty.stdout).trim()},tools/CLAUDE.md`);
  git(repo, 'commit', '-q', '-m', 'base');
  const base = git(repo, 'rev-parse', 'HEAD').trim();
  put(repo, 'tools/x.mjs', 'export const x = 1;\n');
  put(repo, 'src/lib/x.mjs', 'export const x = 1;\n');
  return { root, repo, base };
}

// The deep/ chains are outside every changed folder, so only the code-review read checks them.
const FIXTURES = [
  {
    name: 'links',
    make: instructionRepo,
    expected: EXPECTED,
    extra: [
      ['deep/AGENTS.md', '# Deep rules\n'],
      ['deep/CLAUDE.md', null],
    ],
  },
  { name: 'path edges', make: edgeRepo, expected: EDGE_EXPECTED, extra: [] },
];

// Removes the loose object of `spec` from the repository, so that git cannot read it.
function dropObject(repo, spec) {
  const oid = git(repo, 'rev-parse', spec).trim();
  fs.rmSync(path.join(repo, '.git', 'objects', oid.slice(0, 2), oid.slice(2)));
}

// Runs the plan-manager base-instructions block in `repo` for round 1.
function buildFolder(root, repo, base, env = {}) {
  const block = bashBlock(PLAN_MANAGER, '-base-instructions"').replace(
    'prev="<previous-reviewed-head or empty>"',
    'prev=""',
  );
  assert.ok(block.includes('prev=""'), 'the block sets prev');
  const scratch = path.join(root, 'scratch');
  const result = sh(repo, `scratch='${scratch}'\nbase='${base}'\n${block}`, env);
  return { result, folder: path.join(scratch, 'code-review-<n>-round-<k>-base-instructions') };
}

test('the plan-manager base-instructions block copies the target text of each symlink', (t) => {
  for (const fixture of FIXTURES) {
    const { root, repo, base } = fixture.make(t);
    const { result, folder } = buildFolder(root, repo, base);
    assert.equal(result.status, 0, `${fixture.name}: ${result.stderr}`);
    const manifest = [...fixture.expected]
      .map(([file, text]) => `${text === null ? 'absent' : 'copied'} ${file}\n`)
      .join('');
    assert.equal(fs.readFileSync(path.join(folder, 'MANIFEST'), 'utf8'), manifest, fixture.name);
    for (const [file, text] of fixture.expected) {
      const copy = path.join(folder, ...file.split('/'));
      if (text === null) assert.equal(fs.existsSync(copy), false, `${file} is not copied`);
      else {
        assert.equal(fs.lstatSync(copy).isFile(), true, `${file} is a regular file`);
        assert.equal(fs.readFileSync(copy, 'utf8'), text, `${file} holds the base text of its target`);
      }
    }
  }
});

test('the code-review base read prints the target text of a symlink and exits 1 for a bad link', (t) => {
  const snippet = bashBlock(CODE_REVIEW, 'git merge-base <fixed-point> HEAD');
  for (const fixture of FIXTURES) {
    const { repo, base } = fixture.make(t);
    for (const [file, text] of [...fixture.expected, ...fixture.extra]) {
      const script = snippet.replace('<fixed-point>', base).replaceAll('<path>', file);
      assert.notEqual(script, snippet, 'the snippet names a fixed point and a path');
      const result = sh(repo, script);
      assert.equal(result.status, text === null ? 1 : 0, `${fixture.name} ${file}: ${result.stderr}`);
      assert.equal(result.stdout, text ?? '', `${fixture.name} ${file} gives the base text of its target`);
    }
  }
});

// Each case makes a git command fail: `path` is an instruction file whose read fails. A failed read is not an
// absent file.
const GIT_FAILURES = [
  { name: 'the target blob of a link is missing', path: 'src/AGENTS.md', drop: 'docs/rules.md' },
  { name: 'the blob of a link is missing', path: 'CLAUDE.md', drop: 'CLAUDE.md' },
  { name: 'a tree on the target path is missing', path: 'src/AGENTS.md', drop: 'docs' },
  { name: 'GIT_DIR is not a repository', path: 'AGENTS.md', gitDir: 'not-a-repo' },
];

function failingRepo(t, failure) {
  const { root, repo, base } = instructionRepo(t);
  if (failure.drop) dropObject(repo, `${base}:${failure.drop}`);
  return { root, repo, base, env: failure.gitDir ? { GIT_DIR: path.join(root, failure.gitDir) } : {} };
}

test('a git failure stops the plan-manager block with an error and no MANIFEST', (t) => {
  for (const failure of GIT_FAILURES) {
    const { root, repo, base, env } = failingRepo(t, failure);
    const { result, folder } = buildFolder(root, repo, base, env);
    assert.notEqual(result.status, 0, `${failure.name}: the block fails`);
    assert.match(result.stderr, /base instructions: a git command failed/, `${failure.name}: stderr`);
    assert.equal(fs.existsSync(path.join(folder, 'MANIFEST')), false, `${failure.name}: no MANIFEST`);
  }
});

test('a git failure gives the code-review base read a status other than 0 and 1', (t) => {
  const snippet = bashBlock(CODE_REVIEW, 'git merge-base <fixed-point> HEAD');
  for (const failure of GIT_FAILURES) {
    const { repo, base, env } = failingRepo(t, failure);
    const result = sh(repo, snippet.replace('<fixed-point>', base).replaceAll('<path>', failure.path), env);
    assert.ok(![0, 1].includes(result.status), `${failure.name}: status ${result.status}`);
    assert.equal(result.stdout, '', `${failure.name}: no text`);
  }
});
