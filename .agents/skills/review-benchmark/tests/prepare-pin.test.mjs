import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'vitest';
import { BUN_RUNTIME } from '../../../../cli/test/lib/cliEntry.ts';
import * as prepare from '../scripts/prepare.mjs';
import { findingsCommand } from '../scripts/score.mjs';
import {
  changedLines,
  copyScripts,
  CONFIGS,
  escapeRegExp,
  FIXER_SETTING,
  gitIn,
  judgeLoop,
  LOOP_R1,
  LOOP_ROUND_1,
  loopRepo,
  PREPARE_SCRIPT,
  put,
  readJson,
  readText,
  REPO_ROOT,
  SYNC_D1,
  SYNC_HEAD,
} from './helpers.mjs';

// A bare remote whose main branch holds only the base commit of the loop repository and whose refs/pull/7/head holds
// the case head, as GitHub keeps the head of a squash-merged pull request; its refs/pull/8/head holds the base only. The
// clone of the remote lacks the head, and its `origin` is the path of the remote. `caseOptions` writes dev case code-7
// (base, head, and `pull: 7`) with `fields` over it, where an undefined field leaves the field out, and gives the
// options of `case`. `refs` lists the refs of the clone under a prefix with their commits.
function pullFixture() {
  const fixture = loopRepo();
  const { root, repo, base, head, patches } = fixture;
  const remote = path.join(root, 'remote.git');
  gitIn(root, 'init', '-q', '--bare', '-b', 'main', remote);
  gitIn(repo, 'push', '-q', remote, 'main');
  gitIn(remote, 'update-ref', 'refs/pull/7/head', head);
  gitIn(remote, 'update-ref', 'refs/pull/8/head', base);
  gitIn(remote, 'update-ref', 'refs/heads/main', base);
  const clone = path.join(root, 'clone');
  // --no-local copies only the objects that the branches reach, as a clone from GitHub does.
  gitIn(root, 'clone', '-q', '--no-local', remote, clone);
  assert.notEqual(spawnSync('git', ['cat-file', '-e', `${head}^{commit}`], { cwd: clone }).status, 0);
  const ws = path.join(root, 'ws');
  const cases = path.join(root, 'cases');
  const project = path.join(root, 'project');
  put(project, '.omp/agents/review-bench-configs.json', { configs: [CONFIGS.low], fixer: FIXER_SETTING });
  put(cases, 'dev/code-7-plan.md', '# Plan 7\n');
  put(cases, 'dev/code-7.D1.fix.patch', patches.D1);
  const seeded = { category: 'bug', source: 'seeded' };
  const caseData = {
    id: 'code-7',
    kind: 'code',
    split: 'dev',
    issue: 7,
    pull: 7,
    round: 1,
    plan: 'code-7-plan.md',
    base,
    head,
    known: [{ id: 'D1', locator: 'src/sync.mjs:5', ...seeded, summary: 'v5 is 0.', fix: 'code-7.D1.fix.patch' }],
  };
  const caseOptions = (fields = {}) => {
    put(cases, 'dev/code-7.json', { ...caseData, ...fields });
    return { case: path.join(cases, 'dev', 'code-7.json'), arms: 'C1', runs: '1', out: ws, configs: 'low', project };
  };
  const refs = (prefix) => gitIn(clone, 'for-each-ref', '--format=%(refname) %(objectname)', prefix).trim();
  return { ...fixture, remote, clone, ws, cases, caseDir: path.join(ws, 'code-7'), caseOptions, refs };
}
const FORK_NOTE =
  '(case and pin fetch from origin; when origin is a fork, set origin to the remote of DocksDocks/docks-kit)';
// A POSIX shell word that gives `text`, as the stop messages of prepare.mjs quote a path.
const shellQuote = (text) => `'${text.replaceAll("'", "'\\''")}'`;
// The recovery that each stop message of `case` names: the `pin` command of `script` on the case file.
const pinCommand = (caseFile, script = PREPARE_SCRIPT) =>
  `bun ${shellQuote(fs.realpathSync(script))} pin --case ${shellQuote(caseFile)}`;
const missingHead = (head, caseFile, pull, script) =>
  new RegExp(
    escapeRegExp(
      pull
        ? `case code-7: head ${head} is not a commit in this repository, and refs/review-bench/pull/${pull} does not hold it; check that pull names the pull request whose head holds the commit, then fetch that head and pin the case commits: ${pinCommand(caseFile, script)} ${FORK_NOTE}`
        : `case code-7: head ${head} is not a commit in this repository; give the case a pull field that names the pull request whose head holds the commit, then run case again, which fetches that head, or run ${pinCommand(caseFile, script)}, which fetches that head and pins the case commits ${FORK_NOTE}`,
    ),
  );
// Runs the command `bun <script> pin --case <case file>` as a child process.
const runPin = (script, caseFile) =>
  spawnSync(BUN_RUNTIME, [script, 'pin', '--case', caseFile], { encoding: 'utf8' });
// Runs `case`, which must stop with a message that matches `pattern`. Each stop message names the pin command of the
// case file and the fork note, and holds no shell text for the recovery. No command of the message fetches into
// refs/review-bench/pull/, so a stop never leads a person to move the ref that case saves. The result is the message.
const caseStops = (options, clone, pattern) => {
  let message;
  assert.throws(
    () => prepare.prepareCase(options, clone),
    (error) => {
      message = error.message;
      return true;
    },
  );
  assert.match(message, pattern);
  assert.ok(message.includes(pinCommand(options.case)), message);
  assert.ok(message.endsWith(` ${FORK_NOTE}`), message);
  assert.doesNotMatch(message, /&&|\$\(|update-ref|urandom|refs\/review-bench\/kept\//);
  assert.doesNotMatch(message, /:refs\/review-bench\/pull\//);
  return message;
};
// Runs `pin` on the case file of `options`, which must stop. The result is the message.
const pinStops = (options, clone) => {
  let message;
  assert.throws(
    () => prepare.preparePin({ case: options.case }, clone),
    (error) => {
      message = error.message;
      return true;
    },
  );
  return message;
};
test('case fetches the head of the pull request of a missing commit into refs/review-bench/pull/<n> and pins it under refs/review-bench/kept/<sha>', () => {
  const { clone, head, caseDir, caseOptions, refs } = pullFixture();
  prepare.prepareCase(caseOptions(), clone);
  assert.equal(refs('refs/review-bench/pull'), `refs/review-bench/pull/7 ${head}`);
  assert.equal(refs('refs/review-bench/incoming'), '');
  // origin/main reaches the base, so only the fetched head gets a pin.
  assert.equal(refs('refs/review-bench/kept'), `refs/review-bench/kept/${head} ${head}`);
  assert.equal(readText(path.join(caseDir, 'snapshot', 'src', 'sync.mjs')), SYNC_HEAD);
  assert.ok(changedLines(path.join(caseDir, 'full.diff')).includes('+export const v5 = 0;'));
  assert.ok(fs.existsSync(path.join(caseDir, 'C1-low', 'run-1', 'prompts', 'full.txt')));
});
test('case stops on a missing commit of a case without pull, gives the pin command, and writes no case folder', () => {
  const { clone, head, caseDir, caseOptions, refs } = pullFixture();
  const options = caseOptions({ pull: undefined });
  caseStops(options, clone, missingHead(head, options.case));
  assert.equal(fs.existsSync(caseDir), false);
  assert.equal(refs('refs/review-bench'), '');
});
test('case stops when the head of the pull request of pull lacks the commit and writes no case folder', () => {
  const { clone, base, head, caseDir, caseOptions, refs } = pullFixture();
  const options = caseOptions({ pull: 8 });
  caseStops(options, clone, missingHead(head, options.case, 8));
  assert.equal(fs.existsSync(caseDir), false);
  // The run keeps the fetched head and removes its incoming ref.
  assert.equal(refs('refs/review-bench'), `refs/review-bench/pull/8 ${base}`);
});
test('case stops on a failed fetch with the missing commit, the git error, and the pin command, and writes no case folder', () => {
  const { clone, head, caseDir, caseOptions, refs } = pullFixture();
  // The remote has no refs/pull/9/head.
  const failed = escapeRegExp(
    `case code-7: head ${head} is not a commit in this repository, and git fetch --no-tags --no-write-fetch-head origin +refs/pull/9/head:refs/review-bench/incoming/9-${process.pid} failed: `,
  );
  const options = caseOptions({ pull: 9 });
  const recovery = escapeRegExp(
    `; to fetch the head of pull request 9 and pin the case commits, run ${pinCommand(options.case)} ${FORK_NOTE}`,
  );
  caseStops(options, clone, new RegExp(`^${failed}[^;]*refs/pull/9/head${recovery}$`));
  assert.equal(fs.existsSync(caseDir), false);
  assert.equal(refs('refs/review-bench'), '');
});
test('case runs no fetch for a case commit that only a local branch holds and pins it under refs/review-bench/kept/<sha>', () => {
  const { root, clone, head, caseDir, caseOptions, refs } = pullFixture();
  gitIn(clone, 'fetch', '-q', '--no-tags', 'origin', 'refs/pull/7/head:refs/heads/topic');
  // A fetch from the remote would now fail.
  gitIn(clone, 'remote', 'set-url', 'origin', path.join(root, 'missing.git'));
  prepare.prepareCase(caseOptions(), clone);
  assert.equal(readText(path.join(caseDir, 'snapshot', 'src', 'sync.mjs')), SYNC_HEAD);
  const pinned = `refs/review-bench/kept/${head} ${head}`;
  assert.equal(refs('refs/review-bench'), pinned);
  // A second run finds the pin and keeps it as it is.
  prepare.prepareCase({ ...caseOptions(), out: path.join(root, 'ws-2') }, clone);
  assert.equal(refs('refs/review-bench'), pinned);
});
test('case pins its fetched commit under refs/review-bench/kept/ when a parallel run creates refs/review-bench/pull/<n> first', () => {
  const { root, clone, base, head, caseDir, caseOptions, refs } = pullFixture();
  // The hook acts as a parallel run: when this run creates its incoming ref, it saves an older head at
  // refs/review-bench/pull/7, so the create of this run fails.
  const hooks = path.join(root, 'hooks');
  fs.mkdirSync(hooks);
  fs.writeFileSync(
    path.join(hooks, 'reference-transaction'),
    [
      '#!/bin/sh',
      '[ "$1" = committed ] || exit 0',
      'while read -r old new ref; do',
      '  case "$ref" in refs/review-bench/incoming/*)',
      `    case "$new" in *[!0]*) git update-ref refs/review-bench/pull/7 ${base} "" ;; esac ;;`,
      '  esac',
      'done',
      '',
    ].join('\n'),
    { mode: 0o755 },
  );
  gitIn(clone, 'config', 'core.hooksPath', hooks);
  prepare.prepareCase(caseOptions(), clone);
  assert.equal(
    refs('refs/review-bench'),
    [`refs/review-bench/kept/${head} ${head}`, `refs/review-bench/pull/7 ${base}`].join('\n'),
  );
  assert.equal(readText(path.join(caseDir, 'snapshot', 'src', 'sync.mjs')), SYNC_HEAD);
});
// Stops case with the head of pull request 7 missing, while an existing refs/review-bench/pull/7 holds only the base.
const stopOnStalePull = ({ root, remote, clone, base, head, caseDir, caseOptions, refs }) => {
  gitIn(clone, 'update-ref', 'refs/review-bench/pull/7', base);
  // A fetch would fail with a git error instead of the message of the missing commit.
  gitIn(clone, 'remote', 'set-url', 'origin', path.join(root, 'missing.git'));
  const options = caseOptions();
  caseStops(options, clone, missingHead(head, options.case, 7));
  assert.equal(fs.existsSync(caseDir), false);
  assert.equal(refs('refs/review-bench'), `refs/review-bench/pull/7 ${base}`);
  gitIn(clone, 'remote', 'set-url', 'origin', remote);
};
test('case does not fetch again or move an existing refs/review-bench/pull/<n> that lacks the commit of pull, and pin recovers the case', () => {
  const fixture = pullFixture();
  const { root, clone, base, head, caseDir, caseOptions, refs } = fixture;
  stopOnStalePull(fixture);
  // pin pins the head and deletes its temporary ref; it does not move the saved ref.
  prepare.preparePin({ case: caseOptions().case }, clone);
  const pinned = [`refs/review-bench/kept/${head} ${head}`, `refs/review-bench/pull/7 ${base}`].join('\n');
  assert.equal(refs('refs/review-bench'), pinned);
  // case then finds the pin and prepares the workspace with no fetch.
  gitIn(clone, 'remote', 'set-url', 'origin', path.join(root, 'missing.git'));
  prepare.prepareCase(caseOptions(), clone);
  assert.equal(readText(path.join(caseDir, 'snapshot', 'src', 'sync.mjs')), SYNC_HEAD);
  assert.equal(refs('refs/review-bench'), pinned);
});
test('a second run of pin moves no ref', () => {
  const fixture = pullFixture();
  const { clone, base, head, caseOptions, refs } = fixture;
  stopOnStalePull(fixture);
  const pinned = [`refs/review-bench/kept/${head} ${head}`, `refs/review-bench/pull/7 ${base}`].join('\n');
  prepare.preparePin({ case: caseOptions().case }, clone);
  assert.equal(refs('refs/review-bench'), pinned);
  // The pin exists with the same commit, so the second run succeeds and changes no ref.
  prepare.preparePin({ case: caseOptions().case }, clone);
  assert.equal(refs('refs/review-bench'), pinned);
});
test('the pin command exits with a non-zero status on a failed fetch with the git error and leaves no temporary ref', () => {
  const { clone, caseOptions, refs } = pullFixture();
  const script = copyScripts(clone);
  // The remote has no refs/pull/9/head.
  const pin = runPin(script, caseOptions({ pull: 9 }).case);
  assert.equal(pin.status, 1, pin.stderr);
  const fetch = escapeRegExp(
    `prepare.mjs: pin code-7: git fetch --no-tags --no-write-fetch-head origin +refs/pull/9/head:refs/review-bench/incoming/9-${pin.pid}-`,
  );
  assert.match(
    pin.stderr,
    new RegExp(`^${fetch}[0-9a-f]{8} failed: [^;]*refs/pull/9/head[^;]*${escapeRegExp(FORK_NOTE)}\\n$`),
  );
  assert.equal(pin.stdout, '');
  assert.equal(refs('refs/review-bench'), '');
});
test('the pin command exits with a non-zero status on a failed pin with the git error and keeps its temporary ref', () => {
  const { root, clone, head, caseOptions, refs } = pullFixture();
  const script = copyScripts(clone);
  // The hook rejects each transaction that writes a ref under refs/review-bench/kept/.
  const hooks = path.join(root, 'hooks');
  fs.mkdirSync(hooks);
  fs.writeFileSync(
    path.join(hooks, 'reference-transaction'),
    [
      '#!/bin/sh',
      '[ "$1" = prepared ] || exit 0',
      'while read -r old new ref; do',
      '  case "$ref" in refs/review-bench/kept/*) exit 1 ;; esac',
      'done',
      '',
    ].join('\n'),
    { mode: 0o755 },
  );
  gitIn(clone, 'config', 'core.hooksPath', hooks);
  const pin = runPin(script, caseOptions().case);
  assert.equal(pin.status, 1, pin.stderr);
  assert.equal(pin.stdout, '');
  const kept = refs('refs/review-bench');
  const incoming = new RegExp(`^(refs/review-bench/incoming/7-${pin.pid}-[0-9a-f]{8}) ${head}$`);
  assert.match(kept, incoming);
  const temporary = kept.match(incoming)[1];
  assert.match(
    pin.stderr,
    new RegExp(
      `^${escapeRegExp(`prepare.mjs: case code-7: git update-ref refs/review-bench/kept/${head} ${head} failed: `)}.+${escapeRegExp(`; the temporary ref ${temporary} keeps the fetched head ${head}; delete it after a run of pin succeeds`)}\\n$`,
      's',
    ),
  );
});
test('the pin command that case prints runs as printed in sh for a case folder with a space, quotes, and $(, and pin recovers the case', () => {
  const { root, clone, base, head, cases, ws, caseOptions, refs } = pullFixture();
  const script = copyScripts(clone);
  const options = caseOptions();
  // A shell that reads the path without quotes splits it at the spaces, ends a word at a quote, or runs `touch ran`.
  const folder = path.join(root, `case dir "q" $(touch ran) it's`);
  fs.mkdirSync(folder);
  for (const file of ['code-7.json', 'code-7-plan.md', 'code-7.D1.fix.patch']) {
    fs.copyFileSync(path.join(cases, 'dev', file), path.join(folder, file));
  }
  const caseFile = path.join(folder, 'code-7.json');
  // refs/review-bench/pull/7 holds only the base, so case does not fetch and stops with the pin command.
  gitIn(clone, 'update-ref', 'refs/review-bench/pull/7', base);
  const caseArgs = ['--arms', options.arms, '--runs', options.runs, '--out', ws, '--configs', options.configs];
  const build = spawnSync(
    BUN_RUNTIME,
    [script, 'case', '--case', caseFile, ...caseArgs, '--project', options.project],
    { encoding: 'utf8' },
  );
  assert.equal(build.status, 1, build.stderr);
  assert.match(build.stderr, missingHead(head, caseFile, 7, script));
  const start = 'pin the case commits: ';
  const printed = build.stderr.slice(
    build.stderr.indexOf(start) + start.length,
    build.stderr.lastIndexOf(` ${FORK_NOTE}`),
  );
  assert.equal(printed, pinCommand(caseFile, script));
  const pin = spawnSync('sh', ['-c', printed], { cwd: root, encoding: 'utf8' });
  assert.equal(pin.status, 0, pin.stderr);
  assert.equal(pin.stdout, `pin code-7: refs/review-bench/kept/${head}\n`);
  assert.equal(pin.stderr, '');
  // No part of the path ran as a command.
  assert.equal(fs.existsSync(path.join(root, 'ran')), false);
  const pinned = [`refs/review-bench/kept/${head} ${head}`, `refs/review-bench/pull/7 ${base}`].join('\n');
  assert.equal(refs('refs/review-bench'), pinned);
  // case then finds the pin and prepares the workspace with no fetch.
  gitIn(clone, 'remote', 'set-url', 'origin', path.join(root, 'missing.git'));
  prepare.prepareCase({ ...options, case: caseFile }, clone);
  assert.equal(readText(path.join(ws, 'code-7', 'snapshot', 'src', 'sync.mjs')), SYNC_HEAD);
  assert.equal(refs('refs/review-bench'), pinned);
});
test('pin stops and writes no ref when the head of the pull request of pull lacks a case commit', () => {
  const { clone, base, head, caseOptions, refs } = pullFixture();
  // refs/pull/8/head holds the base only.
  const message = pinStops(caseOptions({ pull: 8 }), clone);
  assert.equal(
    message,
    `pin code-7: the head ${base} of pull request 8 does not reach head ${head}, and origin/main does not reach it either; pin wrote no ref; check that pull names the pull request whose head holds the case commits`,
  );
  assert.equal(refs('refs/review-bench'), '');
});
test('validateCase takes pull only as a positive integer, on every kind', () => {
  const code = { id: 'code-7', kind: 'code', split: 'dev', issue: 7, round: 1, plan: 'p.md', base: 'a', head: 'b' };
  const plan = { id: 'plan-3', kind: 'plan', split: 'heldout', issue: 3, round: 1, plan: 'p.md', repo_ref: 'c' };
  for (const caseData of [{ ...code, known: [] }, plan]) {
    assert.equal(prepare.validateCase({ ...caseData, pull: 45 }).pull, 45);
    for (const pull of [0, -1, 1.5, '45', null]) {
      assert.throws(() => prepare.validateCase({ ...caseData, pull }), {
        message: `case ${caseData.id}: pull must be a positive integer`,
      });
    }
  }
});
test('loop round 1 resolves the head that case fetched from the pull request of pull', () => {
  const { root, clone, ws, caseOptions } = pullFixture();
  prepare.prepareCase({ ...caseOptions(), loop: true }, clone);
  // The saved ref keeps the head through git gc, and loop fetches nothing.
  gitIn(clone, 'remote', 'set-url', 'origin', path.join(root, 'missing.git'));
  gitIn(clone, 'gc', '-q', '--prune=now');
  const run = path.join(ws, 'code-7', 'C1-low', 'run-1');
  put(run, 'round-1/blocks/full.md', LOOP_ROUND_1);
  findingsCommand(ws);
  judgeLoop(ws, [
    [`${LOOP_R1}#1`, 'wrong', 'The callers do not divide by b.'],
    [`${LOOP_R1}#2`, 'wrong', 'README.md:1 names the module.'],
    [`${LOOP_R1}#3`, 'D1'],
  ]);
  const round2 = path.join(run, 'round-2');
  assert.equal(prepare.prepareLoop({ run, cases: path.join(root, 'cases') }, clone), round2);
  assert.equal(readText(path.join(round2, 'snapshot', 'src', 'sync.mjs')), SYNC_D1);
});
// A case commit that origin/main does not reach, such as a commit of a squash-merged pull request, is missing from a
// fresh clone, so its case needs `pull`; a `pull` that is not a positive integer counts as missing. The test reads only
// the commit fields, `pull`, and `id` of each case file.
test('every case with a commit that origin/main does not reach names its pull request in pull', () => {
  const live = REPO_ROOT;
  const liveGit = (...args) => spawnSync('git', args, { cwd: live, encoding: 'utf8' });
  assert.notEqual(
    liveGit('rev-parse', '--is-shallow-repository').stdout.trim(),
    'true',
    'the repository is shallow, so the test cannot tell which case commits origin/main reaches; run git fetch --unshallow',
  );
  assert.equal(
    liveGit('rev-parse', '--verify', '--quiet', 'refs/remotes/origin/main^{commit}').status,
    0,
    'the repository has no origin/main, so the test cannot tell which case commits it reaches; run git fetch origin main',
  );
  const reached = new Map();
  const reaches = (commit) => {
    if (!reached.has(commit)) {
      reached.set(commit, liveGit('merge-base', '--is-ancestor', commit, 'refs/remotes/origin/main').status === 0);
    }
    return reached.get(commit);
  };
  const unreached = [];
  for (const split of ['dev', 'heldout']) {
    const dir = path.join(live, '.agents/skills/review-benchmark/cases', split);
    const caseFiles = fs.readdirSync(dir).filter((name) => name.endsWith('.json') && !name.endsWith('.key.json'));
    for (const name of caseFiles.sort()) {
      const { id, base, head, delta_base: deltaBase, repo_ref: repoRef, pull } = readJson(path.join(dir, name));
      const commits = [base, head, deltaBase, repoRef].filter(Boolean);
      const hasPull = Number.isInteger(pull) && pull > 0;
      if (!hasPull && commits.some((commit) => !reaches(commit))) unreached.push(id);
    }
  }
  assert.deepEqual(
    unreached,
    [],
    `these cases name a commit that origin/main does not reach and have no pull field that is a positive integer: ${unreached.join(', ')}`,
  );
});
