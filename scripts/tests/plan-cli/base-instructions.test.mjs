import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

// The shipped shell that reads instruction files from the merge base: the base-instructions block of plan-manager
// phase 6 and the base read of code-review. Both call the base-blob.sh of their skill, and both must give a symlink
// the text of its target in the base tree.
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const PLAN_MANAGER_DIR = path.join(ROOT, 'plugins/plan-lifecycle/skills/productivity/plan-manager');
const CODE_REVIEW_DIR = path.join(ROOT, 'plugins/docks/skills/engineering/code-review');
const PLAN_MANAGER = path.join(PLAN_MANAGER_DIR, 'SKILL.md');
const CODE_REVIEW = path.join(CODE_REVIEW_DIR, 'SKILL.md');
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
// deep/ holds a chain of 8 links and a chain of 9 links, which both resolve; no changed path is in deep/.
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

// The longest chain that git and Linux follow is 40 links.
const MAX_LINKS = 40;

// Links chain/<first> -> <prefix>1 -> ... -> <prefix><count - 1> -> ../src/REVIEW.md, a chain of `count` links.
function linkChain(repo, first, prefix, count) {
  const names = [first, ...Array.from({ length: count - 1 }, (_, i) => `${prefix}${i + 1}`)];
  for (const [i, name] of names.entries()) {
    link(repo, `chain/${name}`, i + 1 < names.length ? names[i + 1] : '../src/REVIEW.md');
  }
}

// The base commit holds the folder links docs -> src and lnk -> src/lib, the folder links la -> lb and lb -> la (a
// loop), the gitlink mod, and chains of 40 and 41 links. The working tree adds a file in tools/ and in chain/.
const FOLDER_REVIEW = '# Src review rules\n';
const FOLDER_LIB = '# Lib rules\n';
const FOLDER_EXPECTED = new Map([
  ['AGENTS.md', '# Folder root rules\n'],
  // docs/REVIEW.md: a path through the folder link docs -> src.
  ['CLAUDE.md', FOLDER_REVIEW],
  // mod/REVIEW.md: a path through a gitlink.
  ['REVIEW.md', null],
  // 40 links.
  ['chain/AGENTS.md', FOLDER_REVIEW],
  // 41 links.
  ['chain/CLAUDE.md', null],
  // ../src/REVIEW.md/x: a file used as a folder.
  ['chain/REVIEW.md', null],
  // ../docs/lib/rules.md: a folder link in the target of a link.
  ['tools/AGENTS.md', FOLDER_LIB],
  // ../lnk/../REVIEW.md: `..` after the folder link lnk -> src/lib goes to src, not to the root.
  ['tools/CLAUDE.md', FOLDER_REVIEW],
  // ../la/REVIEW.md: a loop through folder links.
  ['tools/REVIEW.md', null],
]);

function folderRepo(t) {
  const { root, repo } = newRepo(t);
  put(repo, 'AGENTS.md', '# Folder root rules\n');
  put(repo, 'src/REVIEW.md', FOLDER_REVIEW);
  put(repo, 'src/lib/rules.md', FOLDER_LIB);
  link(repo, 'docs', 'src');
  link(repo, 'lnk', 'src/lib');
  link(repo, 'la', 'lb');
  link(repo, 'lb', 'la');
  link(repo, 'CLAUDE.md', 'docs/REVIEW.md');
  link(repo, 'REVIEW.md', 'mod/REVIEW.md');
  linkChain(repo, 'AGENTS.md', 'c', MAX_LINKS);
  linkChain(repo, 'CLAUDE.md', 'd', MAX_LINKS + 1);
  link(repo, 'chain/REVIEW.md', '../src/REVIEW.md/x');
  link(repo, 'tools/AGENTS.md', '../docs/lib/rules.md');
  link(repo, 'tools/CLAUDE.md', '../lnk/../REVIEW.md');
  link(repo, 'tools/REVIEW.md', '../la/REVIEW.md');
  git(repo, 'add', '-A');
  // A gitlink names a commit of another repository; an empty folder stands for a submodule that is not checked out.
  fs.mkdirSync(path.join(repo, 'mod'));
  git(repo, 'update-index', '--add', '--cacheinfo', `160000,${'1'.repeat(40)},mod`);
  git(repo, 'commit', '-q', '-m', 'base');
  const base = git(repo, 'rev-parse', 'HEAD').trim();
  put(repo, 'tools/x.mjs', 'export const x = 1;\n');
  put(repo, 'chain/n.mjs', 'export const n = 1;\n');
  return { root, repo, base };
}

// Names that end in a newline. Each pair of names, with and without the newline, holds different rules, so a read
// that drops the newline gives the wrong rules. AGENTS.md links to `rules.md\n`, the folder link docs links to the
// folder `src\n`, and CLAUDE.md links to docs/REVIEW.md. The working tree adds a file in the folder `lib\n`.
const NEWLINE_RULES = '# Rules of the name that ends in a newline\n';
const PLAIN_RULES = '# Rules of the name without the newline\n';
const NEWLINE_EXPECTED = new Map([
  ['AGENTS.md', NEWLINE_RULES],
  ['CLAUDE.md', NEWLINE_RULES],
  ['REVIEW.md', null],
  ['lib\n/AGENTS.md', NEWLINE_RULES],
  ['lib\n/CLAUDE.md', null],
  ['lib\n/REVIEW.md', null],
]);

function newlineRepo(t) {
  const { root, repo } = newRepo(t);
  for (const [plain, newline] of [
    ['rules.md', 'rules.md\n'],
    ['src/REVIEW.md', 'src\n/REVIEW.md'],
    ['lib/AGENTS.md', 'lib\n/AGENTS.md'],
  ]) {
    put(repo, plain, PLAIN_RULES);
    put(repo, newline, NEWLINE_RULES);
  }
  link(repo, 'AGENTS.md', 'rules.md\n');
  link(repo, 'docs', 'src\n');
  link(repo, 'CLAUDE.md', 'docs/REVIEW.md');
  git(repo, 'add', '-A');
  git(repo, 'commit', '-q', '-m', 'base');
  const base = git(repo, 'rev-parse', 'HEAD').trim();
  put(repo, 'lib\n/x.mjs', 'export const x = 1;\n');
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
      ['deep/CLAUDE.md', '# Deep rules\n'],
    ],
  },
  { name: 'path edges', make: edgeRepo, expected: EDGE_EXPECTED, extra: [] },
  {
    name: 'folder links',
    make: folderRepo,
    expected: FOLDER_EXPECTED,
    extra: [
      ['docs/REVIEW.md', FOLDER_REVIEW],
      ['lnk/../REVIEW.md', FOLDER_REVIEW],
      ['la/AGENTS.md', null],
      ['mod', null],
      ['docs', null],
    ],
  },
  {
    name: 'names that end in a newline',
    make: newlineRepo,
    expected: NEWLINE_EXPECTED,
    extra: [
      ['docs/REVIEW.md', NEWLINE_RULES],
      ['src/REVIEW.md', PLAIN_RULES],
      ['rules.md', PLAIN_RULES],
    ],
  },
];

// Removes the loose object of `spec` from the repository, so that git cannot read it.
function dropObject(repo, spec) {
  const oid = git(repo, 'rev-parse', spec).trim();
  fs.rmSync(path.join(repo, '.git', 'objects', oid.slice(0, 2), oid.slice(2)));
}

// Runs the plan-manager base-instructions block in `repo` for round 1, with `skillDir` as the folder of the skill.
function buildFolder(root, repo, base, env = {}, skillDir = PLAN_MANAGER_DIR) {
  const block = bashBlock(PLAN_MANAGER, '-base-instructions"')
    .replace('prev="<previous-reviewed-head or empty>"', 'prev=""')
    .replaceAll('<skill-dir>', skillDir);
  assert.ok(block.includes('prev=""'), 'the block sets prev');
  const scratch = path.join(root, 'scratch');
  const result = sh(repo, `scratch='${scratch}'\nbase='${base}'\n${block}`, env);
  return { result, folder: path.join(scratch, 'code-review-<n>-round-<k>-base-instructions') };
}

// The code-review base read of `file` at the fixed point `base`, with `skillDir` as the folder of the skill.
function baseRead(base, file, skillDir = CODE_REVIEW_DIR) {
  const snippet = bashBlock(CODE_REVIEW, 'git merge-base <fixed-point> HEAD');
  const script = snippet.replace('<fixed-point>', base).replaceAll('<path>', file).replaceAll('<skill-dir>', skillDir);
  assert.doesNotMatch(script, /<[a-z-]+>/, 'the snippet names a fixed point, a path, and the skill folder');
  return script;
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
  for (const fixture of FIXTURES) {
    const { repo, base } = fixture.make(t);
    for (const [file, text] of [...fixture.expected, ...fixture.extra]) {
      const result = sh(repo, baseRead(base, file));
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
  { name: 'the blob of a folder link is missing', make: folderRepo, path: 'CLAUDE.md', drop: 'docs' },
  { name: 'GIT_DIR is not a repository', path: 'AGENTS.md', gitDir: 'not-a-repo' },
];

function failingRepo(t, failure) {
  const { root, repo, base } = (failure.make ?? instructionRepo)(t);
  if (failure.drop) dropObject(repo, `${base}:${failure.drop}`);
  return { root, repo, base, env: failure.gitDir ? { GIT_DIR: path.join(root, failure.gitDir) } : {} };
}

test('a git failure stops the plan-manager block with an error and no MANIFEST', (t) => {
  for (const failure of GIT_FAILURES) {
    const { root, repo, base, env } = failingRepo(t, failure);
    const { result, folder } = buildFolder(root, repo, base, env);
    assert.notEqual(result.status, 0, `${failure.name}: the block fails`);
    assert.match(result.stderr, /base instructions: a read failed/, `${failure.name}: stderr`);
    assert.equal(fs.existsSync(path.join(folder, 'MANIFEST')), false, `${failure.name}: no MANIFEST`);
  }
});

test('a git failure gives the code-review base read a status other than 0 and 1', (t) => {
  for (const failure of GIT_FAILURES) {
    const { repo, base, env } = failingRepo(t, failure);
    const result = sh(repo, baseRead(base, failure.path), env);
    assert.ok(![0, 1].includes(result.status), `${failure.name}: status ${result.status}`);
    assert.equal(result.stdout, '', `${failure.name}: no text`);
  }
});

// A skill folder without scripts/base-blob.sh: `sh` cannot open the script, and that is a failure, not an absent file.
test('a missing base-blob.sh stops both reads with a status other than 0 and 1', (t) => {
  const { root, repo, base } = instructionRepo(t);
  const missing = path.join(root, 'skill-without-scripts');
  const { result, folder } = buildFolder(root, repo, base, {}, missing);
  assert.notEqual(result.status, 0, 'the block fails');
  assert.match(result.stderr, /base instructions: a read failed/);
  assert.equal(fs.existsSync(path.join(folder, 'MANIFEST')), false, 'no MANIFEST');
  const read = sh(repo, baseRead(base, 'AGENTS.md', missing));
  assert.ok(![0, 1].includes(read.status), `status ${read.status}`);
  assert.equal(read.stdout, '');
});
