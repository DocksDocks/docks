#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PLAN_CLI = path.join(ROOT, 'plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/plan.mjs');
// realpath: on macOS os.tmpdir() is a symlink, so a child process cwd would not
// match these paths and both self-reference and concurrency probes would misfire.
const scratch = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'plan-cli-')));
const activeDir = path.join(scratch, 'docs/plans/active');
const finishedDir = path.join(scratch, 'docs/plans/finished');
fs.mkdirSync(activeDir, { recursive: true });
fs.mkdirSync(finishedDir, { recursive: true });

function run(...args) {
  return spawnSync(process.execPath, [PLAN_CLI, ...args], {
    cwd: scratch,
    encoding: 'utf8',
  });
}

function expectSuccess(result, label) {
  assert.equal(result.status, 0, `${label}: ${result.stderr}`);
}

function createPlan(slug, options = {}) {
  const title = options.title ?? `Exercise ${slug}`;
  const goal = options.goal ?? `The ${slug} plan completes its observable contract`;
  expectSuccess(run('new', slug, '--title', title, '--goal', goal), `new ${slug}`);
  const planPath = path.join(activeDir, `${slug}.md`);
  let text = fs.readFileSync(planPath, 'utf8');
  const steps = options.steps ?? [
    '| 1 | implement_contract | Implement the contract | src/example.mjs | — | `local` | `planned` | command exits 0 |',
  ];
  text = text
    .replace('|---:|---|---|---|---|---|---|---|\n', `|---:|---|---|---|---|---|---|---|\n${steps.join('\n')}\n`)
    .replace(
      '| ID | Command | Expected |\n|---|---|---|\n',
      '| ID | Command | Expected |\n|---|---|---|\n| A1 | `node --version` | Exit 0 |\n',
    );
  fs.writeFileSync(planPath, text);
  return planPath;
}

function expectCheckPass(slugOrPath) {
  const result = run('check', slugOrPath);
  expectSuccess(result, `check ${slugOrPath}`);
  const expectedPath =
    slugOrPath.includes('/') || slugOrPath.includes('\\') || slugOrPath.endsWith('.md')
      ? slugOrPath
      : path.join('docs/plans/active', `${slugOrPath}.md`);
  assert.equal(result.stdout.trim(), `plan check passed: ${expectedPath}`);
}

function mutateAndRestore(planPath, checkNumber, mutate) {
  const before = fs.readFileSync(planPath, 'utf8');
  const after = mutate(before);
  assert.notEqual(after, before, `check ${checkNumber} mutation changed no bytes`);
  fs.writeFileSync(planPath, after);
  const failed = run('check', planPath);
  assert.equal(failed.status, 1, `check ${checkNumber} mutation unexpectedly passed`);
  assert.match(failed.stderr, new RegExp(`check ${checkNumber}\\b`));
  fs.writeFileSync(planPath, before);
  expectCheckPass(planPath);
}

try {
  const validPath = createPlan('checks');
  expectCheckPass('checks');

  const mutations = [
    [1, (text) => text.replace('assignee: null', 'unexpected: value\nassignee: null')],
    [2, (text) => text.replace('status: drafting', 'status: unknown')],
    [3, (text) => text.replace('title: Exercise checks', 'title: ')],
    [4, (text) => text.replace(/^updated: "(.*)"$/m, 'updated: $1')],
    [5, (text) => text.replace('## Research', '## Findings')],
    [6, (text) => text.replace('| implement_contract |', '| Implement-contract |')],
    [7, (text) => text.replace('_Not researched yet._', '_Not researched yet._ step:missing')],
    [8, (text) => text.replace('| — | `local` |', '| 2 | `local` |')],
    [
      9,
      (text) =>
        text.replace(
          '| A1 | `node --version` | Exit 0 |',
          '| A1 | `node --version` | Exit 0 |\n| A1 | `node -v` | Exit 0 |',
        ),
    ],
    [10, (text) => text.replace('_Not researched yet._', '_Not researched yet._ /home/alice/private')],
    [11, (text) => text.replace('status: drafting', 'status: planned')],
    [12, (text) => text.replace('src/example.mjs', 'docs/plans/active/checks.md')],
    [13, (text) => text.replace('Mode: plan-and-implement', 'Mode: direct')],
  ];
  for (const [checkNumber, mutate] of mutations) mutateAndRestore(validPath, checkNumber, mutate);

  const beforeReorderedFrontmatter = fs.readFileSync(validPath, 'utf8');
  fs.writeFileSync(validPath, beforeReorderedFrontmatter.replace(/^(created: .+)\n(updated: .+)$/m, '$2\n$1'));
  const reorderedFrontmatter = run('check', validPath);
  assert.equal(reorderedFrontmatter.status, 1);
  assert.match(reorderedFrontmatter.stderr, /check 1: .*frontmatter key updated is out of position/);
  fs.writeFileSync(validPath, beforeReorderedFrontmatter);
  expectCheckPass(validPath);

  const beforeWrongStepsHeader = fs.readFileSync(validPath, 'utf8');
  fs.writeFileSync(validPath, beforeWrongStepsHeader.replace('| # | Id |', '| Number | Id |'));
  const wrongStepsHeader = run('check', validPath);
  assert.equal(wrongStepsHeader.status, 1);
  assert.match(wrongStepsHeader.stderr, /check 6: Steps table header must match the contract/);
  assert.doesNotMatch(wrongStepsHeader.stderr, /eight cells/);
  assert.equal(wrongStepsHeader.stderr.match(/check 6:/g)?.length, 1);
  fs.writeFileSync(validPath, beforeWrongStepsHeader);
  expectCheckPass(validPath);

  const beforeFencedContent = fs.readFileSync(validPath, 'utf8');
  const fencedContent = beforeFencedContent
    .replace(
      '| # | Id | Task | Files | Depends | Effect | Status | Done when |',
      [
        '```text',
        '| # | Id | Task | Files | Depends | Effect | Status | Done when |',
        '|---:|---|---|---|---|---|---|---|',
        '```',
        '| # | Id | Task | Files | Depends | Effect | Status | Done when |',
      ].join('\n'),
    )
    .replace('_Not implemented yet._', ['```text', '## Captured command output', '```'].join('\n'));
  fs.writeFileSync(validPath, fencedContent);
  expectCheckPass(validPath);
  fs.writeFileSync(validPath, beforeFencedContent);

  const statePath = createPlan('state');
  const illegalFinish = run('status', 'state', 'finished');
  assert.equal(illegalFinish.status, 1);
  assert.match(illegalFinish.stderr, /illegal plan status transition/);
  const missingReason = run('status', 'state', 'blocked');
  assert.equal(missingReason.status, 1);
  assert.match(missingReason.stderr, /requires --reason/);
  fs.writeFileSync(
    statePath,
    fs.readFileSync(statePath, 'utf8').replace('_Not researched yet._', 'Repository facts confirmed the durable fix.'),
  );
  expectSuccess(
    run('status', 'state', 'blocked', '--reason', 'waiting on a user decision'),
    'state drafting to blocked',
  );
  expectCheckPass('state');
  assert.match(fs.readFileSync(statePath, 'utf8'), /^status: blocked\nblocked_reason: waiting on a user decision$/m);
  expectSuccess(run('status', 'state', 'planned'), 'state blocked to planned');
  assert.doesNotMatch(fs.readFileSync(statePath, 'utf8'), /^blocked_reason:/m);
  expectCheckPass('state');
  expectSuccess(run('status', 'state', 'drafting'), 'state planned to drafting');
  expectCheckPass('state');
  expectSuccess(run('status', 'state', 'planned'), 'state drafting to planned');
  const prematureStep = run('step', 'state', 'implement_contract', 'done');
  assert.equal(prematureStep.status, 1);
  assert.match(prematureStep.stderr, /plan status is planned/);
  expectSuccess(run('status', 'state', 'ongoing'), 'state planned to ongoing');
  expectSuccess(run('step', 'state', 'implement_contract', 'done'), 'state step done');
  const reopenDone = run('step', 'state', 'implement_contract', 'planned');
  assert.equal(reopenDone.status, 1);
  assert.match(reopenDone.stderr, /illegal step status transition/);

  const archivePath = createPlan('archive');
  expectSuccess(run('status', 'archive', 'planned'), 'archive planned');
  expectSuccess(run('status', 'archive', 'ongoing'), 'archive ongoing');
  const unfinishedArchive = run('archive', 'archive');
  assert.equal(unfinishedArchive.status, 1);
  assert.match(unfinishedArchive.stderr, /non-terminal step/);
  expectSuccess(run('step', 'archive', 'implement_contract', 'done'), 'archive step done');
  const unreviewedArchive = run('archive', 'archive');
  assert.equal(unreviewedArchive.status, 1);
  assert.match(unreviewedArchive.stderr, /Code-review: pass/);
  fs.writeFileSync(archivePath, fs.readFileSync(archivePath, 'utf8').replace('_No review yet._', 'Code-review: pass'));
  const archived = run('archive', 'archive');
  expectSuccess(archived, 'archive reviewed plan');
  const utcDate = new Date().toISOString().slice(0, 10);
  const archivedPath = path.join(finishedDir, `${utcDate}-archive.md`);
  assert.equal(fs.existsSync(archivedPath), true);

  const retiredSource = createPlan('retired');
  fs.writeFileSync(
    retiredSource,
    fs.readFileSync(retiredSource, 'utf8').replace('_Not researched yet._', 'The withdrawal reason was confirmed.'),
  );
  const retired = run('retire', 'retired', '--reason', 'The request was withdrawn');
  expectSuccess(retired, 'retire plan');
  assert.equal(fs.existsSync(retiredSource), false);
  const retiredPath = path.join(finishedDir, `${utcDate}-retired.md`);
  assert.match(fs.readFileSync(retiredPath, 'utf8'), /## Retirement\n\nThe request was withdrawn\n$/);
  expectCheckPass(retiredPath);

  const missingFinishedPath = createPlan('missing-finished');
  expectSuccess(run('status', 'missing-finished', 'planned'), 'missing-finished planned');
  expectSuccess(run('status', 'missing-finished', 'ongoing'), 'missing-finished ongoing');
  expectSuccess(run('step', 'missing-finished', 'implement_contract', 'done'), 'missing-finished step done');
  fs.writeFileSync(
    missingFinishedPath,
    fs.readFileSync(missingFinishedPath, 'utf8').replace('_No review yet._', 'Code-review: pass'),
  );
  const missingFinishedRetirePath = createPlan('missing-finished-retire');
  fs.rmSync(finishedDir, { recursive: true });
  const missingFinishedArchive = run('archive', 'missing-finished');
  assert.equal(missingFinishedArchive.status, 1);
  assert.equal(missingFinishedArchive.stderr.trim(), 'docs/plans/finished/ is absent');
  assert.match(fs.readFileSync(missingFinishedPath, 'utf8'), /^status: ongoing$/m);
  const missingFinishedRetire = run('retire', 'missing-finished-retire', '--reason', 'The destination is unavailable');
  assert.equal(missingFinishedRetire.status, 1);
  assert.equal(missingFinishedRetire.stderr.trim(), 'docs/plans/finished/ is absent');
  assert.match(fs.readFileSync(missingFinishedRetirePath, 'utf8'), /^status: drafting$/m);
  fs.mkdirSync(finishedDir);

  createPlan('dependency', {
    steps: [
      '| 1 | prepare | Prepare the dependency | src/example.mjs | — | `local` | `planned` | command exits 0 |',
      '| 2 | consume | Consume the dependency | src/example.mjs | 1 | `local` | `planned` | command exits 0 |',
    ],
  });
  expectSuccess(run('status', 'dependency', 'planned'), 'dependency planned');
  expectSuccess(run('status', 'dependency', 'ongoing'), 'dependency ongoing');
  const dependencyBlocked = run('step', 'dependency', 'consume', 'in-flight');
  assert.equal(dependencyBlocked.status, 1);
  assert.match(dependencyBlocked.stderr, /unfinished dependency/);

  const concurrentPath = createPlan('concurrent');
  const preloadPath = path.join(scratch, 'rewrite-on-read.cjs');
  fs.writeFileSync(
    preloadPath,
    [
      "const fs = require('node:fs');",
      "const path = require('node:path');",
      'const readFileSync = fs.readFileSync;',
      'let rewritten = false;',
      'fs.readFileSync = function (file, ...args) {',
      '  const value = readFileSync.call(fs, file, ...args);',
      // The ESM loader calls readFileSync with a URL (Node 24.18+), so guard before path.resolve.
      "  if (!rewritten && typeof file === 'string' && path.resolve(file) === process.env.PLAN_CONCURRENT_PATH) {",
      '    rewritten = true;',
      '    fs.writeFileSync(file, value + "\\n");',
      '  }',
      '  return value;',
      '};',
    ].join('\n'),
  );
  const concurrent = spawnSync(process.execPath, [PLAN_CLI, 'status', 'concurrent', 'planned'], {
    cwd: scratch,
    encoding: 'utf8',
    env: {
      ...process.env,
      NODE_OPTIONS: `--require=${preloadPath}`,
      PLAN_CONCURRENT_PATH: concurrentPath,
    },
  });
  assert.equal(concurrent.status, 1);
  assert.equal(concurrent.stderr.trim(), 'plan file changed on disk; re-read and retry');

  const failedCreatePreload = path.join(scratch, 'fail-create-write.cjs');
  fs.writeFileSync(
    failedCreatePreload,
    [
      "const fs = require('node:fs');",
      'const writeFileSync = fs.writeFileSync;',
      'fs.writeFileSync = function (file, ...args) {',
      "  if (typeof file === 'number') throw new Error('injected create write failure');",
      '  return writeFileSync.call(fs, file, ...args);',
      '};',
    ].join('\n'),
  );
  const failedCreate = spawnSync(
    process.execPath,
    [PLAN_CLI, 'new', 'temp-cleanup', '--title', 'Test cleanup', '--goal', 'A failed create leaves no temp file'],
    {
      cwd: scratch,
      encoding: 'utf8',
      env: { ...process.env, NODE_OPTIONS: `--require=${failedCreatePreload}` },
    },
  );
  assert.equal(failedCreate.status, 1);
  assert.match(failedCreate.stderr, /injected create write failure/);
  assert.equal(
    fs.readdirSync(activeDir).some((name) => name.startsWith('temp-cleanup.md.tmp-')),
    false,
  );
  expectSuccess(
    run('new', 'temp-cleanup', '--title', 'Test cleanup', '--goal', 'A failed create leaves no temp file'),
    'retry create after temp cleanup',
  );

  // `list` must render pre-v2 history rather than reporting it as corruption: the real
  // repository archives 120 such records, and reporting each as `unreadable` with a YAML
  // complaint made the command useless and misfiled history as a defect.
  fs.writeFileSync(
    path.join(finishedDir, '2026-01-01-legacy-record.md'),
    '---\ntitle: A legacy record\nstatus: planned\n---\n\nPlan-run: {"schema":1}\n',
  );
  fs.writeFileSync(path.join(activeDir, 'broken.md'), '---\nplan_contract: v2\nnot a mapping line\n---\n\n## Goal\n');
  const activeLegacyPath = path.join(activeDir, 'legacy-active.md');
  fs.writeFileSync(
    activeLegacyPath,
    [
      '---',
      'title: A real legacy record',
      'status: planned',
      'affected_paths:',
      '  - src/example.mjs',
      '---',
      '',
      'Plan-run: {"schema":1}',
      '',
    ].join('\n'),
  );
  const expectedNotV2 = 'not a v2 plan: docs/plans/active/legacy-active.md (no plan_contract: v2)';
  for (const [command, args] of [
    ['status', ['legacy-active', 'ongoing']],
    ['retire', ['legacy-active', '--reason', 'Legacy record']],
    ['step', ['legacy-active', 'legacy_step', 'done']],
  ]) {
    const rejectedLegacy = run(command, ...args);
    assert.equal(rejectedLegacy.status, 1);
    assert.equal(rejectedLegacy.stderr.trim(), expectedNotV2);
  }
  const listed = run('list');
  expectSuccess(listed, 'list');
  const rows = new Map(
    listed.stdout
      .trimEnd()
      .split('\n')
      .map((line) => line.split('\t'))
      .map(([status, slug, title]) => [slug, { status, title }]),
  );
  assert.deepEqual(rows.get('legacy-record'), { status: 'v1', title: 'A legacy record' });
  assert.equal(rows.get('broken').status, 'unreadable');

  // A queue dependency is settled by presence in `finished/`, not by frontmatter: v1
  // history carries no v2 status, so a frontmatter rule strands every row forever.
  createPlan('queued');
  expectSuccess(run('status', 'queued', 'planned'), 'queued planned');
  const plannedOnly = run('list', '--status', 'planned');
  expectSuccess(plannedOnly, 'list planned');
  assert.equal(plannedOnly.stdout.trim(), 'planned\tqueued\tExercise queued');
  const v1Only = run('list', '--status', 'v1');
  expectSuccess(v1Only, 'list v1');
  assert.deepEqual(
    new Set(v1Only.stdout.trimEnd().split('\n')),
    new Set(['v1\tlegacy-active\tA real legacy record', 'v1\tlegacy-record\tA legacy record']),
  );
  const unreadableOnly = run('list', '--status', 'unreadable');
  expectSuccess(unreadableOnly, 'list unreadable');
  assert.match(unreadableOnly.stdout, /^unreadable\tbroken\tinvalid frontmatter line 3$/m);
  fs.writeFileSync(
    path.join(scratch, 'docs/plans/QUEUE.md'),
    '| Stage | Plan | Depends on | Why |\n|---:|---|---|---|\n| 1 | queued | legacy-record | The dependency is archived. |\n',
  );
  const startable = run('next');
  expectSuccess(startable, 'next');
  assert.equal(startable.stdout.trim(), 'queued');
  assert.equal(startable.stderr, '');

  fs.writeFileSync(
    path.join(scratch, 'docs/plans/QUEUE.md'),
    '| Stage | Plan | Depends on | Why |\n|---:|---|---|---|\n| 1 | queued | missing | First declaration. |\n| 2 | queued | - | Duplicate declaration. |\n',
  );
  const duplicateQueue = run('next');
  expectSuccess(duplicateQueue, 'next falls back past duplicate queue rows');
  assert.match(duplicateQueue.stderr, /malformed .*QUEUE\.md: duplicate queue plan queued/);
  assert.equal(duplicateQueue.stdout.trim(), 'queued');

  fs.writeFileSync(path.join(scratch, 'docs/plans/QUEUE.md'), '| Stage | Plan |\n');
  const malformed = run('next');
  expectSuccess(malformed, 'next falls back past a malformed queue');
  assert.match(malformed.stderr, /malformed .*QUEUE\.md/);
  assert.equal(malformed.stdout.trim(), 'queued');

  // Symlinked-root regression: the cwd a child process reports is the resolved
  // path, so an unresolved comparison makes check 12 silently never fire.
  const linkedRoot = path.join(os.tmpdir(), `plan-cli-link-${process.pid}`);
  fs.rmSync(linkedRoot, { recursive: true, force: true });
  fs.symlinkSync(scratch, linkedRoot, 'dir');
  try {
    const selfPath = createPlan('selfref');
    fs.writeFileSync(
      selfPath,
      fs.readFileSync(selfPath, 'utf8').replace('src/example.mjs', 'docs/plans/active/selfref.md'),
    );
    const selfReference = spawnSync(
      process.execPath,
      [PLAN_CLI, 'check', path.join(linkedRoot, 'docs/plans/active/selfref.md')],
      { cwd: linkedRoot, encoding: 'utf8' },
    );
    assert.equal(selfReference.status, 1, 'a symlinked root must still detect the self-reference');
    assert.match(selfReference.stderr, /check 12\b/);
  } finally {
    fs.rmSync(linkedRoot, { recursive: true, force: true });
  }

  console.log(
    'plan CLI contract: 13 checks, lifecycle repairs, fenced content, dependencies, archive/retire guards, list/next filters, temp cleanup, and concurrent writes passed',
  );
} finally {
  fs.rmSync(scratch, { recursive: true, force: true });
}
