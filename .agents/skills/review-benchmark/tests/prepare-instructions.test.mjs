import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'vitest';
import * as prepare from '../scripts/prepare.mjs';
import * as score from '../scripts/score.mjs';
import { findingsCommand, pairsCommand } from '../scripts/score.mjs';
import {
  agentsOnBun,
  tierOverrides,
  codeDeltaCase,
  CONFIGS,
  devLoop,
  FIXER_SETTING,
  frontmatter,
  gitIn,
  isolateGit,
  logged,
  MANAGER_SETTING,
  MODEL,
  neutralScratch,
  put,
  readJson,
  reads,
  readText,
  treeState,
  V7_BLOCK,
  workspace,
} from './helpers.mjs';

// The links of the base commit of instructionRepo: each path, its target, and its MANIFEST line. The benchmark
// builder runs the walk of `docks-kit plan base-blob` of the checkout in its own process, as plan-manager phase 6 and
// code-review run the command: a link resolves from the folder of the link. The four numbered cases are edge cases of
// that reader (cli/src/plan/checkout.ts resolveBaseBlob).
const BASE_LINKS = [
  ['CLAUDE.md', 'AGENTS.md', 'copied'],
  // Case 1: a root link out of the tree is absent, not a git failure.
  ['REVIEW.md', '../outside.md', 'absent'],
  // A loop.
  ['src/CLAUDE.md', 'CLAUDE.md', 'absent'],
  // A path through the folder link docs -> src.
  ['src/lib/CLAUDE.md', '../../docs/REVIEW.md', 'copied'],
  ['src/lib/REVIEW.md', '../../../outside.md', 'absent'],
  // Case 2: a link to the parent folder names a folder, not the first blob of that folder.
  ['tools/CLAUDE.md', '..', 'absent'],
  // Case 4: `.` parts drop, and `..` goes to the parent folder.
  ['tools/REVIEW.md', './../src/./REVIEW.md', 'copied'],
];
// A chain of `count` links from `first` through the files `chain/<prefix><i>` to src/REVIEW.md.
function linkChain(first, prefix, count) {
  const hops = Array.from({ length: count - 1 }, (_, i) => `chain/${prefix}${i + 1}`);
  const names = [first, ...hops];
  return names.map((file, i) => [file, i + 1 < names.length ? path.posix.basename(names[i + 1]) : '../src/REVIEW.md']);
}
// A repository whose base commit holds a root AGENTS.md, src/REVIEW.md, the folder link docs -> src, the links of
// BASE_LINKS, src/AGENTS.md as a link to an absolute path, tools/AGENTS.md as a link with an empty target (case
// 3), chain/AGENTS.md as a chain of 8 links, chain/CLAUDE.md as a chain of 9 links, and chain/REVIEW.md as a
// chain of 41 links. The head changes AGENTS.md and src/a.mjs, makes tools/AGENTS.md a file, and adds src/lib/b.mjs,
// src/lib/AGENTS.md, and chain/n.mjs.
function instructionRepo() {
  isolateGit();
  const root = neutralScratch();
  const repo = path.join(root, 'repo');
  fs.mkdirSync(repo);
  gitIn(repo, 'init', '-q', '-b', 'main');
  put(repo, 'AGENTS.md', '# Root rules at the base\n');
  put(repo, 'src/REVIEW.md', '# Review rules at the base\n');
  put(repo, 'src/a.mjs', 'export const a = 1;\n');
  // The absolute and the outside targets exist on disk, so only the resolution in the tree makes them absent.
  put(root, 'outside.md', '# Rules outside the tree\n');
  fs.symlinkSync('src', path.join(repo, 'docs'));
  const links = [
    ...BASE_LINKS,
    ['src/AGENTS.md', path.join(root, 'outside.md')],
    ...linkChain('chain/AGENTS.md', 'r', 8),
    ...linkChain('chain/CLAUDE.md', 'a', 9),
    // Git and Linux follow at most 40 links.
    ...linkChain('chain/REVIEW.md', 'b', 41),
  ];
  for (const [file, target] of links) {
    const at = path.join(repo, ...file.split('/'));
    fs.mkdirSync(path.dirname(at), { recursive: true });
    fs.symlinkSync(target, at);
  }
  gitIn(repo, 'add', '-A');
  // The file system makes no link with an empty target, so git stores it directly.
  const empty = path.join(root, 'empty-target');
  fs.writeFileSync(empty, '');
  const emptyBlob = gitIn(repo, 'hash-object', '-w', empty).trim();
  gitIn(repo, 'update-index', '--add', '--cacheinfo', `120000,${emptyBlob},tools/AGENTS.md`);
  gitIn(repo, 'commit', '-q', '-m', 'base');
  const base = gitIn(repo, 'rev-parse', 'HEAD').trim();
  put(repo, 'AGENTS.md', '# Root rules of the head\n');
  put(repo, 'src/a.mjs', 'export const a = 2;\n');
  put(repo, 'src/lib/b.mjs', 'export const b = 1;\n');
  put(repo, 'src/lib/AGENTS.md', '# Rules that the head adds\n');
  put(repo, 'tools/AGENTS.md', '# Tools rules of the head\n');
  put(repo, 'chain/n.mjs', 'export const n = 1;\n');
  gitIn(repo, 'add', '-A');
  gitIn(repo, 'commit', '-q', '-m', 'head');
  const head = gitIn(repo, 'rev-parse', 'HEAD').trim();
  return { root, repo, base, head };
}
// Builds the case code-7 of instructionRepo with the arm C1 and gives its options and its case folder.
function instructionCase() {
  const fixture = instructionRepo();
  const { root, base, head } = fixture;
  const ws = path.join(root, 'ws');
  const cases = path.join(root, 'cases');
  const project = path.join(root, 'project');
  put(project, '.omp/agents/review-bench-configs.json', { configs: [CONFIGS.low], fixer: FIXER_SETTING });
  const caseData = { id: 'code-7', kind: 'code', split: 'dev', issue: 7, round: 1, plan: 'code-7-plan.md', base, head };
  put(cases, 'dev/code-7.json', { ...caseData, known: [] });
  put(cases, 'dev/code-7-plan.md', '# Plan 7\n');
  const options = { case: path.join(cases, 'dev/code-7.json'), arms: 'C1', runs: '1', out: ws, project };
  return { ...fixture, options, caseDir: path.join(ws, 'code-7') };
}
test('case writes the base-instructions folder of a code case, and its prompt and read scope name it', () => {
  const { repo, options, caseDir } = instructionCase();
  logged(() => prepare.prepareCase(options, repo));
  const folder = path.join(caseDir, 'base-instructions');
  assert.equal(
    readText(path.join(folder, 'MANIFEST')),
    [
      'copied AGENTS.md',
      'copied CLAUDE.md',
      'absent REVIEW.md',
      'copied chain/AGENTS.md',
      'copied chain/CLAUDE.md',
      'absent chain/REVIEW.md',
      'absent src/AGENTS.md',
      'absent src/CLAUDE.md',
      'copied src/REVIEW.md',
      'absent src/lib/AGENTS.md',
      'copied src/lib/CLAUDE.md',
      'absent src/lib/REVIEW.md',
      'absent tools/AGENTS.md',
      'absent tools/CLAUDE.md',
      'copied tools/REVIEW.md',
      '',
    ].join('\n'),
  );
  // Each copy holds the text of the base commit; a link gives the text of its target, also through a folder link and
  // after 9 links. An absolute link, an empty target, a loop, a link to a folder, a link that leaves the tree, and a
  // chain of 41 links are absent.
  for (const [file, text] of [
    ['AGENTS.md', '# Root rules at the base\n'],
    ['CLAUDE.md', '# Root rules at the base\n'],
    ['src/REVIEW.md', '# Review rules at the base\n'],
    ['src/lib/CLAUDE.md', '# Review rules at the base\n'],
    ['chain/AGENTS.md', '# Review rules at the base\n'],
    ['chain/CLAUDE.md', '# Review rules at the base\n'],
    ['tools/REVIEW.md', '# Review rules at the base\n'],
  ]) {
    assert.equal(readText(path.join(folder, ...file.split('/'))), text, file);
  }
  for (const [file, , outcome] of BASE_LINKS) {
    assert.equal(fs.existsSync(path.join(folder, ...file.split('/'))), outcome === 'copied', file);
  }
  for (const file of ['src/AGENTS.md', 'tools/AGENTS.md', 'chain/REVIEW.md', 'src/lib/AGENTS.md']) {
    assert.equal(fs.existsSync(path.join(folder, ...file.split('/'))), false, file);
  }
  const runDir = path.join(caseDir, 'C1-low', 'run-1');
  const prompt = readText(path.join(runDir, 'prompts', 'full.txt')).split('\n');
  assert.ok(prompt.includes(`Base instructions: ${folder}`));
  assert.ok(
    prompt.some((line) => line.startsWith('- The base instructions folder holds') && line.includes('MANIFEST')),
  );
  // The prompt forbids the pages of the benchmark repository under its current name and its former name.
  assert.ok(
    prompt.some((line) =>
      line.includes('but no page of the DocksDocks/docks-kit repository, formerly DocksDocks/docks. You may also read'),
    ),
  );
  const scope = score.readScope(reads(path.join(folder, 'AGENTS.md'), path.join(folder, 'src')), { runDir });
  assert.deepEqual(scope, { outside: [] });
  // --extend writes the folder for a case folder of an earlier version, which has none.
  fs.rmSync(folder, { recursive: true });
  logged(() => prepare.prepareCase({ ...options, arms: 'C3', extend: true }, repo));
  assert.equal(readText(path.join(folder, 'MANIFEST')).split('\n')[0], 'copied AGENTS.md');
});
test('case stops on a git failure in the base instructions and writes no absent line for it', () => {
  const { repo, base, options, caseDir } = instructionCase();
  // The blob of the link CLAUDE.md is gone, so git cannot read the link target. The diffs do not need it, because the
  // head keeps the link.
  const blob = gitIn(repo, 'rev-parse', `${base}:CLAUDE.md`).trim();
  fs.rmSync(path.join(repo, '.git', 'objects', blob.slice(0, 2), blob.slice(2)));
  assert.throws(
    () => logged(() => prepare.prepareCase(options, repo)),
    new RegExp(`the base-blob reader failed on ${base} CLAUDE\\.md; git printed the cause above`),
  );
  assert.equal(fs.existsSync(caseDir), false);
});
test('loop gives each later round a base-instructions folder for the changed paths of its full diff', () => {
  const { repo, cases, run, round, fixerPatch } = devLoop();
  assert.equal(prepare.prepareLoop({ run, cases, 'fixer-patch': fixerPatch }, repo), round(2));
  const folder = path.join(round(2), 'base-instructions');
  // The base commit of the loop repository holds only README.md, and the full diff changes two files in src/.
  const absent = ['', 'src/'].flatMap((dir) =>
    ['AGENTS.md', 'CLAUDE.md', 'REVIEW.md'].map((name) => `absent ${dir}${name}`),
  );
  assert.equal(readText(path.join(folder, 'MANIFEST')), `${absent.join('\n')}\n`);
  const prompt = readText(path.join(round(2), 'prompts', 'delta.txt')).split('\n');
  assert.ok(prompt.includes(`Base instructions: ${folder}`));
});
test('loop adds the paths of the delta diff to the base-instructions folder of a later round', () => {
  const { repo, ws, cases, run, round, root } = devLoop();
  // The case head also adds tools/gen/x.mjs, and the repair of round 1 deletes it again. The full diff of round 2 then
  // has no path in tools/, but its delta diff does.
  put(repo, 'tools/gen/x.mjs', 'export const x = 1;\n');
  gitIn(repo, 'add', '-A');
  gitIn(repo, 'commit', '-q', '-m', 'head with a generated file');
  const head = gitIn(repo, 'rev-parse', 'HEAD').trim();
  for (const [dir, file] of [
    [cases, 'dev/code-7.json'],
    [ws, 'code-7/case.json'],
  ]) {
    put(dir, file, { ...readJson(path.join(dir, file)), head });
  }
  gitIn(repo, 'rm', '-q', '--', 'tools/gen/x.mjs');
  const deletion = gitIn(repo, 'diff', '--cached', '--no-color', '--src-prefix=a/', '--dst-prefix=b/');
  gitIn(repo, 'reset', '-q', '--hard', 'HEAD');
  const fixerPatch = path.join(root, 'delete.patch');
  fs.writeFileSync(fixerPatch, deletion);
  assert.equal(prepare.prepareLoop({ run, cases, 'fixer-patch': fixerPatch }, repo), round(2));
  assert.equal(readText(path.join(round(2), 'full.diff')).includes('tools/gen/x.mjs'), false);
  assert.ok(readText(path.join(round(2), 'delta.diff')).includes('tools/gen/x.mjs'));
  const names = ['AGENTS.md', 'CLAUDE.md', 'REVIEW.md'];
  const absent = ['', 'src/', 'tools/', 'tools/gen/'].flatMap((dir) => names.map((name) => `absent ${dir}${name}`));
  assert.equal(readText(path.join(round(2), 'base-instructions', 'MANIFEST')), `${absent.join('\n')}\n`);
});
test('case and case --extend add the paths of the delta diff of a code-delta case to its base instructions', () => {
  const { repo, options, caseDir } = codeDeltaCase();
  assert.equal(readText(path.join(caseDir, 'full.diff')).includes('tools/gen/x.mjs'), false);
  assert.ok(readText(path.join(caseDir, 'delta.diff')).includes('tools/gen/x.mjs'));
  const folder = path.join(caseDir, 'base-instructions');
  const names = ['AGENTS.md', 'CLAUDE.md', 'REVIEW.md'];
  const absent = (dir, list) => list.map((name) => `absent ${dir}${name}`);
  const manifest = [
    'copied AGENTS.md',
    ...absent('', names.slice(1)),
    ...absent('src/', names),
    ...absent('tools/', names),
    ...absent('tools/gen/', names.slice(0, 2)),
    'copied tools/gen/REVIEW.md',
    '',
  ].join('\n');
  assert.equal(readText(path.join(folder, 'MANIFEST')), manifest);
  assert.equal(readText(path.join(folder, 'tools', 'gen', 'REVIEW.md')), '# Generator rules\n');
  // --extend writes the same folder for a case folder of an earlier version, which has none.
  fs.rmSync(folder, { recursive: true });
  logged(() => prepare.prepareCase({ ...options, arms: 'Bd', extend: true }, repo));
  assert.equal(readText(path.join(folder, 'MANIFEST')), manifest);
  assert.equal(readText(path.join(folder, 'tools', 'gen', 'REVIEW.md')), '# Generator rules\n');
});
// The lines of a manager prompt that name the delta inputs in `dir`, and a check that the manager prompt `promptFile`
// holds `lines` and names no other delta input.
const deltaInputLines = (dir, rejection) => [
  `Delta diff: ${path.join(dir, 'delta.diff')}`,
  `Previous round comment: ${path.join(dir, 'previous-review.md')}`,
  ...(rejection ? [`Rejection comment: ${path.join(dir, 'rejection.md')}`] : []),
];
const DELTA_INPUT = /^(?:Delta diff|Previous round comment|Rejection comment): /;
function assertManagerInputs(promptFile, lines) {
  const prompt = readText(promptFile).split('\n');
  for (const line of lines) assert.ok(prompt.includes(line), `the manager prompt lacks ${line}`);
  const count = (list) => list.filter((line) => DELTA_INPUT.test(line)).length;
  assert.equal(count(prompt), count(lines));
}
const managerPromptFile = (dir) => path.join(dir, 'manager', 'manager-1.txt');
test('manager names the delta diff, the previous round comment, and the rejection comment of a delta round', () => {
  // Round 2 of a loop is a delta round with a rejection comment, in its round folder. Round 1 is a full round, so its
  // manager gets no delta inputs.
  const { repo, ws, cases, run, round, fixerPatch } = devLoop();
  prepare.prepareLoop({ run, cases, 'fixer-patch': fixerPatch }, repo);
  put(run, 'round-2/blocks/delta.md', V7_BLOCK(2));
  findingsCommand(ws);
  put(round(1), 'meta.json', { ...readJson(path.join(round(1), 'meta.json')), managerConfig: MANAGER_SETTING });
  assert.deepEqual(logged(() => prepare.prepareManager({ ws })).result, { written: 2, unchanged: 0 });
  const round2Inputs = [`Full diff: ${path.join(round(2), 'full.diff')}`, ...deltaInputLines(round(2), true)];
  assertManagerInputs(managerPromptFile(round(2)), round2Inputs);
  assertManagerInputs(managerPromptFile(round(1)), []);
  // A delta round without a rejection comment names none.
  fs.rmSync(path.join(round(2), 'rejection.md'));
  logged(() => prepare.prepareManager({ ws }));
  assertManagerInputs(managerPromptFile(round(2)), deltaInputLines(round(2), false));
});
test('manager names the delta inputs of a code-delta run without round folders in the case folder', () => {
  const delta = codeDeltaCase();
  const runDir = path.join(delta.caseDir, 'Cd-low', 'run-1');
  put(runDir, 'blocks/delta.md', V7_BLOCK(2));
  findingsCommand(delta.ws);
  put(runDir, 'meta.json', { ...readJson(path.join(runDir, 'meta.json')), managerConfig: MANAGER_SETTING });
  assert.deepEqual(logged(() => prepare.prepareManager({ ws: delta.ws })).result, { written: 1, unchanged: 0 });
  assertManagerInputs(managerPromptFile(runDir), deltaInputLines(delta.caseDir, false));
});
// A repository with the reviewer agents and the two docks skills at the tag `rel` (the base) in the legacy layout, a
// head commit that moves them to the kit layout (SoT/.omp/plugin), and a working tree whose code-review skill differs
// from the head.
function skillRootRepo() {
  isolateGit();
  const root = neutralScratch();
  const repo = path.join(root, 'repo');
  const project = path.join(root, 'project');
  fs.mkdirSync(repo);
  fs.mkdirSync(project);
  gitIn(repo, 'init', '-q', '-b', 'main');
  for (const role of ['code', 'plan']) {
    const agent = `---\nname: ${role}-reviewer\ndescription: Reviews.\ntools: read, glob, grep\n---\n\n# Reviewer\n`;
    put(repo, `plugins/plan-lifecycle/agents/${role}-reviewer.md`, agent);
  }
  for (const skill of ['code-review', 'code-clarity']) {
    put(repo, `plugins/docks/skills/${skill}/SKILL.md`, `# ${skill} at the release\n`);
  }
  put(repo, 'src/a.mjs', 'export const a = 1;\n');
  gitIn(repo, 'add', '-A');
  gitIn(repo, 'commit', '-q', '-m', 'release');
  gitIn(repo, 'tag', 'rel');
  const base = gitIn(repo, 'rev-parse', 'HEAD').trim();
  fs.mkdirSync(path.join(repo, 'SoT', '.omp', 'plugin'), { recursive: true });
  gitIn(repo, 'mv', 'plugins/plan-lifecycle/agents', 'SoT/.omp/plugin/agents');
  gitIn(repo, 'mv', 'plugins/docks/skills', 'SoT/.omp/plugin/skills');
  put(repo, 'src/a.mjs', 'export const a = 2;\n');
  gitIn(repo, 'add', '-A');
  gitIn(repo, 'commit', '-q', '-m', 'head');
  const head = gitIn(repo, 'rev-parse', 'HEAD').trim();
  put(repo, 'SoT/.omp/plugin/skills/code-review/SKILL.md', '# code-review of the working tree\n');
  const options = {
    'baseline-ref': 'HEAD',
    model: MODEL,
    efforts: 'low',
    tiers: 'default',
    'baseline-dir': path.join(root, 'baseline-plugin'),
    project,
    'self-review-roots': 'rel=rel,wt=worktree',
  };
  return { root, repo, project, base, head, options };
}
test('agents --self-review-roots writes a self-review agent per root that reads the skills of the root', () => {
  const { root, repo, project, base, head, options } = skillRootRepo();
  agentsOnBun(options, repo);
  const agentDir = path.join(project, '.omp', 'agents');
  const list = readJson(path.join(agentDir, 'review-bench-configs.json'));
  const relDir = path.join(root, 'selfreview-rel-plugin');
  const wtDir = path.join(repo, 'SoT', '.omp', 'plugin');
  const skillFiles = (dir) => ({
    'code-review': path.join(dir, 'skills', 'code-review', 'SKILL.md'),
    'code-clarity': path.join(dir, 'skills', 'code-clarity', 'SKILL.md'),
  });
  assert.deepEqual(list.selfReviewRoots, [
    { name: 'rel', source: 'rel', dir: relDir, sha: base, skills: skillFiles(relDir) },
    { name: 'wt', source: 'worktree', dir: wtDir, sha: null, skills: skillFiles(wtDir) },
  ]);
  // The copy of a ref root holds the skills at the ref, not the working tree.
  assert.equal(readText(skillFiles(relDir)['code-review']), '# code-review at the release\n');
  const overrides = tierOverrides(project);
  for (const [name, dir] of [
    ['rel', relDir],
    ['wt', wtDir],
  ]) {
    const agent = prepare.selfReviewAgent('low', name);
    assert.equal(agent, `review-bench-selfreview-${name}-low`);
    const text = readText(path.join(agentDir, `${agent}.md`));
    assert.deepEqual(score.selfReviewSkillRoots(text), [dir]);
    assert.ok(text.includes(`\`${skillFiles(dir)['code-review']}\``));
    assert.equal(overrides[agent], 'default');
  }
  // The default self-review agent keeps the skill:// URIs and names no root.
  assert.deepEqual(score.selfReviewSkillRoots(readText(path.join(agentDir, 'review-bench-selfreview-low.md'))), []);
  // The manager agent gets the fixer setting by default.
  assert.deepEqual(list.manager, MANAGER_SETTING);
  const manager = frontmatter(path.join(agentDir, 'review-bench-manager.md'));
  assert.deepEqual([manager.model, manager['thinking-level']], [MANAGER_SETTING.model, MANAGER_SETTING.effort]);
  assert.equal(overrides['review-bench-manager'], MANAGER_SETTING.tier);

  // case builds the root arms with the root agents and refuses them with --loop.
  const cases = path.join(root, 'cases');
  const caseData = { id: 'code-7', kind: 'code', split: 'dev', issue: 7, round: 1, plan: 'code-7-plan.md', base, head };
  put(cases, 'dev/code-7.json', { ...caseData, known: [] });
  put(cases, 'dev/code-7-plan.md', '# Plan 7\n');
  const ws = path.join(root, 'ws');
  const caseOptions = { case: path.join(cases, 'dev/code-7.json'), runs: '1', out: ws, project };
  logged(() => prepare.prepareCase({ ...caseOptions, arms: 'S1rel,S3wt' }, repo));
  const firstLine = (arm, reviewer) =>
    readText(path.join(ws, 'code-7', `${arm}-low`, 'run-1', 'prompts', `${reviewer}.txt`)).split('\n')[0];
  assert.equal(firstLine('S1rel', 'self-review'), 'agent: review-bench-selfreview-rel-low');
  assert.equal(firstLine('S3wt', 'self-review-correctness'), 'agent: review-bench-selfreview-wt-low');
  assert.deepEqual(readJson(path.join(ws, 'code-7', 'S1rel-low', 'run-1', 'meta.json')), {
    config: list.configs[0],
    managerConfig: MANAGER_SETTING,
  });
  const other = path.join(root, 'other');
  assert.throws(() => prepare.prepareCase({ ...caseOptions, out: other, arms: 'S3rel', loop: true }, repo), {
    message: 'S3rel run one self-review before round 1; leave them out of --loop',
  });
  assert.throws(() => prepare.prepareCase({ ...caseOptions, out: other, arms: 'S1zz' }, repo), {
    message: 'arm S1zz does not apply to code cases; use B0, B1, B3, C1, C3, S1, S3, S1rel, S3rel, S1wt, S3wt',
  });
});
test('agents refuses bad self-review roots before it writes a file', () => {
  const { root, repo, options } = skillRootRepo();
  const state = treeState(root);
  for (const [roots, message] of [
    ['Rel=rel', '--self-review-roots: the root name Rel has a character other than a-z and 0-9'],
    ['rel', '--self-review-roots: rel is not <name>=<git ref> or <name>=worktree'],
    ['a=rel,a=worktree', '--self-review-roots: the root name a occurs two times'],
  ]) {
    assert.throws(() => agentsOnBun({ ...options, 'self-review-roots': roots }, repo), { message });
    assert.deepEqual(treeState(root), state);
  }
  fs.rmSync(path.join(repo, 'SoT', '.omp', 'plugin', 'skills', 'code-clarity'), { recursive: true });
  assert.throws(() => agentsOnBun({ ...options, 'self-review-roots': 'wt=worktree' }, repo), {
    message: 'self-review root wt (worktree) has no SoT/.omp/plugin/skills/[<folder>/]code-clarity/SKILL.md',
  });
});
test('readScope lets a self-review agent of a root read only the two skills under its root', () => {
  const rootDir = '/work/selfreview-rel-plugin';
  const runDir = '/work/ws/code-7/S1rel-low/run-1';
  const agentFiles = ['/work/project/.omp/agents/review-bench-selfreview-rel-low.md'];
  const skill = (name, rest = 'SKILL.md') => `${rootDir}/skills/${name}/${rest}`;
  const cache = '/home/u/.omp/plugins/cache/plugins/docks___docks___0.21.0/skills/code-review/SKILL.md';
  const calls = reads(
    skill('code-review'),
    skill('code-clarity', 'references/naming.md'),
    skill('refactor'),
    'skill://code-review',
    cache,
    '/work/ws/code-7/base-instructions/AGENTS.md',
  );
  assert.deepEqual(score.readScope(calls, { runDir, agentFiles, skillRoots: [rootDir] }), {
    outside: [skill('refactor'), 'skill://code-review', cache],
  });
  // The default self-review agent reads the installed skills and no root.
  assert.deepEqual(score.readScope(calls, { runDir, agentFiles }), {
    outside: [skill('code-review'), skill('code-clarity', 'references/naming.md'), skill('refactor')],
  });
});
test('a control case takes no known defect, and pairs refuses a control case with one', () => {
  const caseData = {
    id: 'code-9',
    kind: 'code',
    split: 'dev',
    issue: 9,
    round: 1,
    plan: 'code-9-plan.md',
    base: 'a',
    head: 'b',
    known: [],
  };
  assert.equal(prepare.validateCase({ ...caseData, control: true }).control, true);
  assert.throws(() => prepare.validateCase({ ...caseData, control: 'yes' }), {
    message: 'case code-9: control must be true or false',
  });
  assert.throws(() => prepare.validateCase({ ...caseData, control: true, known: [{ id: 'D1' }] }), {
    message: 'control case code-9 must have an empty known array',
  });
  const { ws, cases } = workspace();
  put(ws, 'code-7/case.json', { id: 'code-7', kind: 'code', split: 'dev', control: true });
  findingsCommand(ws);
  assert.throws(() => pairsCommand(ws, cases), { message: 'control case code-7 must have no known defects' });
});
