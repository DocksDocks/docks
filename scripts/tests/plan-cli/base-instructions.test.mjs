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

function sh(cwd, script) {
  return spawnSync('bash', ['-c', script], { cwd, env: GIT_ENV, encoding: 'utf8' });
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

function instructionRepo(t) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'base-instructions-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const repo = path.join(root, 'repo');
  fs.mkdirSync(repo);
  git(repo, 'init', '-q', '-b', 'main');
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

test('the plan-manager base-instructions block copies the target text of each symlink', (t) => {
  const { root, repo, base } = instructionRepo(t);
  const block = bashBlock(PLAN_MANAGER, '-base-instructions"').replace(
    'prev="<previous-reviewed-head or empty>"',
    'prev=""',
  );
  assert.ok(block.includes('prev=""'), 'the block sets prev');
  const scratch = path.join(root, 'scratch');
  const result = sh(repo, `scratch='${scratch}'\nbase='${base}'\n${block}`);
  assert.equal(result.status, 0, result.stderr);
  const folder = path.join(scratch, 'code-review-<n>-round-<k>-base-instructions');
  const manifest = [...EXPECTED].map(([file, text]) => `${text === null ? 'absent' : 'copied'} ${file}\n`).join('');
  assert.equal(fs.readFileSync(path.join(folder, 'MANIFEST'), 'utf8'), manifest);
  for (const [file, text] of EXPECTED) {
    const copy = path.join(folder, ...file.split('/'));
    if (text === null) assert.equal(fs.existsSync(copy), false, `${file} is not copied`);
    else {
      assert.equal(fs.lstatSync(copy).isFile(), true, `${file} is a regular file`);
      assert.equal(fs.readFileSync(copy, 'utf8'), text, `${file} holds the base text of its target`);
    }
  }
});

test('the code-review base read prints the target text of a symlink and nothing for a bad link', (t) => {
  const { repo, base } = instructionRepo(t);
  const snippet = bashBlock(CODE_REVIEW, 'git merge-base <fixed-point> HEAD');
  for (const [file, text] of EXPECTED) {
    const script = snippet.replace('<fixed-point>', base).replaceAll('<path>', file);
    assert.notEqual(script, snippet, 'the snippet names a fixed point and a path');
    const result = sh(repo, script);
    if (text === null) assert.notEqual(result.status, 0, `${file} has no base rule`);
    else assert.equal(result.status, 0, `${file}: ${result.stderr}`);
    assert.equal(result.stdout, text ?? '', `${file} gives the base text of its target`);
  }
});
