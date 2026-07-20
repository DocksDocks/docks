#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { parseDocument } from 'yaml';
import { startTask } from '../lib/ci-background-task.mjs';
import {
  parseReleaseTag,
  releaseCiArgs,
  resolveCiTargets,
  selectedAuthorChecks,
  workflowCiSelection,
} from '../lib/ci-targeting.mjs';
import { PLUGINS } from '../lib/plugins.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2);
const mode = args[0] ?? null;
const validInvocation =
  args.length === 0 ||
  (args.length === 1 &&
    ['--unit', '--background-output', '--dry-run-release-safety', '--timing-write-failure'].includes(mode)) ||
  (args.length === 2 && mode === '--validate-docks-timings');
if (!validInvocation) {
  throw new Error(
    'usage: ci-plugin-targeting.mjs [--unit|--background-output|--dry-run-release-safety|--timing-write-failure|--validate-docks-timings <path>]',
  );
}
const unitOnly = mode === '--unit';

function validateTimingReport(timingPath, plugin, taskNames) {
  const timing = JSON.parse(fs.readFileSync(timingPath, 'utf8'));
  assert.deepEqual(Object.keys(timing), ['schema', 'mode', 'status', 'total_ms', 'phases', 'tasks']);
  assert.equal(timing.schema, 1);
  assert.deepEqual(timing.mode, { plugin });
  assert.equal(timing.status, 'passed');
  assert.ok(Number.isInteger(timing.total_ms) && timing.total_ms >= 0);
  assert.ok(timing.phases.length > 0);
  for (const row of [...timing.phases, ...timing.tasks]) {
    assert.deepEqual(Object.keys(row), ['name', 'duration_ms', 'status']);
    assert.equal(typeof row.name, 'string');
    assert.ok(Number.isInteger(row.duration_ms) && row.duration_ms >= 0);
    assert.ok(['passed', 'failed'].includes(row.status));
  }
  assert.deepEqual(
    timing.tasks.map((task) => task.name),
    taskNames,
  );
  assert.ok(timing.tasks.every((task) => task.status === 'passed'));
}

async function testBackgroundOutputRetention() {
  const artifactRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'docks-ci-background-output-'));
  const tasks = [];
  const errorStream = new PassThrough();
  let diagnostic = '';
  errorStream.setEncoding('utf8');
  errorStream.on('data', (chunk) => {
    diagnostic += chunk;
  });
  try {
    const script =
      "process.stdout.write('retained-prefix\\n'); process.stdout.write('x'.repeat(1024 * 1024 + 4096), () => process.exit(1));";
    const passed = await startTask('large failing task', process.execPath, ['-e', script], {
      cwd: ROOT,
      tasks,
      errorStream,
      artifactRoot,
    });
    assert.equal(passed, false);
    assert.deepEqual(
      tasks.map(({ name, status }) => ({ name, status })),
      [{ name: 'large failing task', status: 'failed' }],
    );
    const artifacts = fs.readdirSync(artifactRoot);
    assert.equal(artifacts.length, 1);
    const outputDirectory = path.join(artifactRoot, artifacts[0]);
    const stdoutPath = path.join(outputDirectory, 'stdout.log');
    const stderrPath = path.join(outputDirectory, 'stderr.log');
    const stdout = fs.readFileSync(stdoutPath);
    assert.equal(stdout.subarray(0, 'retained-prefix\n'.length).toString(), 'retained-prefix\n');
    assert.ok(stdout.length > 1024 * 1024);
    assert.equal(fs.statSync(stdoutPath).mode & 0o777, 0o600);
    assert.equal(fs.statSync(stderrPath).mode & 0o777, 0o600);
    assert.match(diagnostic, new RegExp(`stdout=${stdoutPath.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}`));
    assert.match(diagnostic, new RegExp(`stderr=${stderrPath.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}`));
  } finally {
    fs.rmSync(artifactRoot, { recursive: true, force: true });
  }
}

async function testBackgroundTaskContracts() {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'docks-ci-background-contracts-'));
  const artifactRoot = path.join(fixtureRoot, 'artifacts');
  const callLog = path.join(fixtureRoot, 'calls.jsonl');
  const nodeChild = path.join(fixtureRoot, 'node-child.mjs');
  const pnpmShim = path.join(fixtureRoot, 'pnpm');
  const tasks = [];
  const errorStream = new PassThrough();
  let diagnostic = '';
  errorStream.setEncoding('utf8');
  errorStream.on('data', (chunk) => {
    diagnostic += chunk;
  });
  try {
    fs.mkdirSync(artifactRoot, { mode: 0o700 });
    fs.writeFileSync(callLog, '', { mode: 0o600 });
    fs.writeFileSync(
      nodeChild,
      "import fs from 'node:fs';\n" +
        "fs.appendFileSync(process.env.DOCKS_BACKGROUND_TASK_LOG, JSON.stringify({ command: 'node', args: process.argv.slice(2) }) + '\\n');\n" +
        'setTimeout(() => {}, 150);\n',
    );
    fs.writeFileSync(
      pnpmShim,
      `#!${process.execPath}
import fs from 'node:fs';
fs.appendFileSync(process.env.DOCKS_BACKGROUND_TASK_LOG, JSON.stringify({ command: 'pnpm', args: process.argv.slice(2) }) + '\\n');
`,
      { mode: 0o755 },
    );
    const options = {
      cwd: ROOT,
      tasks,
      errorStream,
      artifactRoot,
      env: { ...process.env, DOCKS_BACKGROUND_TASK_LOG: callLog },
    };
    const nodeTask = startTask('node-shaped task', process.execPath, [nodeChild, 'alpha', 'beta'], options);
    const pnpmTask = startTask('pnpm-shaped task', pnpmShim, ['run', 'check:js'], options);
    assert.deepEqual(
      tasks.map((task) => task.name),
      ['node-shaped task', 'pnpm-shaped task'],
    );
    const artifactCount = fs.readdirSync(artifactRoot).length;
    assert.throws(
      () => startTask('node-shaped task', process.execPath, ['-e', 'process.exit(0)'], options),
      /duplicate task name: node-shaped task/,
    );
    assert.equal(fs.readdirSync(artifactRoot).length, artifactCount, 'duplicate rejection must happen before spawn');
    assert.deepEqual(await Promise.all([nodeTask, pnpmTask]), [true, true]);
    assert.deepEqual(
      tasks.map(({ name, status }) => ({ name, status })),
      [
        { name: 'node-shaped task', status: 'passed' },
        { name: 'pnpm-shaped task', status: 'passed' },
      ],
    );
    assert.ok(tasks[0].duration_ms > tasks[1].duration_ms, 'inverted child durations must not reorder task rows');
    assert.equal(fs.readdirSync(artifactRoot).length, 0);
    const calls = fs
      .readFileSync(callLog, 'utf8')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));
    assert.deepEqual(
      calls.sort((left, right) => left.command.localeCompare(right.command)),
      [
        { command: 'node', args: ['alpha', 'beta'] },
        { command: 'pnpm', args: ['run', 'check:js'] },
      ],
    );

    const missing = await startTask(
      'missing command task',
      path.join(fixtureRoot, 'command-does-not-exist'),
      ['unchanged-arg'],
      options,
    );
    assert.equal(missing, false);
    assert.deepEqual(
      tasks.map((task) => task.name),
      ['node-shaped task', 'pnpm-shaped task', 'missing command task'],
    );
    assert.equal(tasks[2].status, 'failed');
    assert.match(diagnostic, /ENOENT/);
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
}

function gitSnapshot() {
  const run = (gitArgs) => {
    const result = spawnSync('git', gitArgs, { cwd: ROOT, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout;
  };
  const manifests = [
    'plugins/docks/.claude-plugin/plugin.json',
    'plugins/docks/.codex-plugin/plugin.json',
    '.claude-plugin/marketplace.json',
  ];
  return {
    status: run(['status', '--porcelain=v1', '--untracked-files=all']),
    refs: run(['show-ref']),
    manifests: manifests.map((file) => fs.readFileSync(path.join(ROOT, file), 'base64')),
  };
}

function writeReleaseShim(directory, name) {
  const script = `#!${process.execPath}
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
const tool = ${JSON.stringify(name)};
const args = process.argv.slice(2);
fs.appendFileSync(process.env.DOCKS_RELEASE_CALL_LOG, JSON.stringify({ tool, args }) + '\\n');
if (tool === 'node') {
  const child = spawnSync(process.env.DOCKS_RELEASE_REAL_NODE, args, {
    stdio: 'inherit',
    env: { ...process.env, PATH: process.env.DOCKS_RELEASE_REAL_PATH },
  });
  process.exit(child.status ?? 1);
}
process.exit(97);
`;
  fs.writeFileSync(path.join(directory, name), script, { mode: 0o755 });
}

function writeCiProbeShim(directory, name) {
  const script = `#!${process.execPath}
import fs from 'node:fs';
const tool = ${JSON.stringify(name)};
const args = process.argv.slice(2);
fs.appendFileSync(process.env.DOCKS_CI_PROBE_LOG, JSON.stringify({ tool, args }) + '\\n');
if (tool === 'claude') process.stdout.write('Validation passed\\n');
if (tool === 'node' && args[0] === 'plugins/docks/skills/productivity/write-skill/scripts/skill-guard.mjs') {
  const skillRoot = args.at(-1);
  if (skillRoot === 'plugins/docks/skills') process.stdout.write('engineering/security 16\\nproductivity/plan-manager 14\\n');
  else if (skillRoot === 'plugins/session-relay/skills') process.stdout.write('productivity/session-relay 14\\n');
  else if (skillRoot === 'plugins/effect-kit/skills') process.stdout.write('engineering/effect-ts-setup 14\\n');
}
if (tool === 'node' && args[0] === 'scripts/agents/score.mjs' && args[1] === '--per-file') {
  process.stdout.write('plan-manager.md 14\\nplan-reviewer.md 14\\n');
}
if (tool === 'node' && args[0] === 'scripts/config/read-floor.mjs') process.stdout.write('10\\n');
process.exit(0);
`;
  fs.writeFileSync(path.join(directory, name), script, { mode: 0o755 });
}

function testFocusedCiCommandSelection() {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'docks-ci-command-selection-'));
  const shimDir = path.join(fixtureRoot, 'bin');
  const callLog = path.join(fixtureRoot, 'calls.jsonl');
  fs.mkdirSync(shimDir, { mode: 0o700 });
  fs.writeFileSync(callLog, '', { mode: 0o600 });

  const run = (ciArgs) => {
    fs.writeFileSync(callLog, '', { mode: 0o600 });
    const result = spawnSync(process.execPath, ['scripts/ci.mjs', ...ciArgs], {
      cwd: ROOT,
      encoding: 'utf8',
      timeout: 120_000,
      env: {
        ...process.env,
        PATH: `${shimDir}${path.delimiter}${process.env.PATH ?? ''}`,
        DOCKS_CI_PROBE_LOG: callLog,
      },
    });
    const contents = fs.readFileSync(callLog, 'utf8').trim();
    return {
      result,
      calls: contents === '' ? [] : contents.split('\n').map((line) => JSON.parse(line)),
    };
  };
  const invokesNode = (calls, script, expectedArg = null) =>
    calls.some(
      ({ tool, args: callArgs }) =>
        tool === 'node' && callArgs[0] === script && (expectedArg === null || callArgs.includes(expectedArg)),
    );
  const countToolInvocation = (calls, tool, expectedArgs) =>
    calls.filter(
      ({ tool: callTool, args: callArgs }) =>
        callTool === tool &&
        callArgs.length === expectedArgs.length &&
        callArgs.every((arg, index) => arg === expectedArgs[index]),
    ).length;
  const repoWideCommands = [
    'scripts/tree/guard.mjs',
    'scripts/skills/durable-anchors.mjs',
    'scripts/tests/ci-plugin-targeting.mjs',
    'scripts/tests/author-tooling.mjs',
  ];

  try {
    for (const name of ['node', 'pnpm', 'claude', 'shellcheck', 'cargo']) writeCiProbeShim(shimDir, name);

    const targeted = run(['--plugin', 'effect-kit']);
    assert.equal(targeted.result.status, 0, `${targeted.result.stdout}\n${targeted.result.stderr}`);
    for (const script of repoWideCommands) {
      assert.equal(
        invokesNode(targeted.calls, script),
        false,
        `targeted CI must not invoke repo-wide command ${script}`,
      );
    }
    assert.doesNotMatch(
      targeted.result.stdout,
      /workflow YAML|marketplace catalogs|repo-wide guards|CI targeting contract/,
    );
    assert.equal(
      invokesNode(targeted.calls, 'scripts/skills/guard.mjs', 'plugins/effect-kit/skills'),
      true,
      'targeted CI must retain the selected plugin gate',
    );
    assert.equal(countToolInvocation(targeted.calls, 'pnpm', ['run', 'check:js']), 0);
    assert.doesNotMatch(targeted.result.stdout, /javascript quality/);

    const full = run([]);
    assert.equal(full.result.error, undefined);
    for (const script of repoWideCommands) {
      assert.equal(invokesNode(full.calls, script), true, `full CI must invoke repo-wide command ${script}`);
    }
    assert.match(full.result.stdout, /workflow YAML/);
    assert.match(full.result.stdout, /marketplace catalogs/);
    assert.match(full.result.stdout, /repo-wide guards/);
    assert.match(full.result.stdout, /CI targeting contract/);
    assert.equal(
      countToolInvocation(full.calls, 'pnpm', ['run', 'check:js']),
      1,
      'full no-argument CI must launch JavaScript quality exactly once',
    );
    assert.match(full.result.stdout, /javascript quality/);
    const timingPath = path.join(fixtureRoot, 'timings.json');
    const timed = run(['--timings-json', timingPath]);
    assert.equal(timed.result.error, undefined);
    assert.equal(
      countToolInvocation(timed.calls, 'pnpm', ['run', 'check:js']),
      1,
      '--timings-json must not change JavaScript quality gate selection',
    );
    const timing = JSON.parse(fs.readFileSync(timingPath, 'utf8'));
    assert.equal(timing.tasks.filter(({ name }) => name === 'javascript quality').length, 1);
    const observedFloorCalls = full.calls.filter(
      ({ args: callArgs }) => callArgs[0] === 'scripts/config/read-floor.mjs',
    );
    for (const floorArgs of [
      ['scripts/config/read-floor.mjs', 'skills', 'engineering'],
      ['scripts/config/read-floor.mjs', 'skills', 'productivity'],
      ['scripts/config/read-floor.mjs', 'agents'],
    ]) {
      assert.equal(
        countToolInvocation(full.calls, 'node', floorArgs),
        1,
        `full CI must read floor ${floorArgs.slice(1).join('/')} exactly once; observed ${JSON.stringify(observedFloorCalls)}`,
      );
    }
    assert.equal(
      countToolInvocation(full.calls, 'node', ['scripts/agents/score.mjs', '--per-file', 'plugins/docks/agents']),
      1,
      'full CI must launch one per-file agent score command',
    );
    assert.equal(
      countToolInvocation(full.calls, 'node', ['scripts/agents/score.mjs', 'plugins/docks/agents']),
      0,
      'full CI must derive the agent total without a second score command',
    );
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
}

function testDryRunReleaseSafety() {
  const before = gitSnapshot();
  assert.equal(before.status, '', 'dry-run safety requires a clean checkout');
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'docks-release-dry-run-'));
  const shimDir = path.join(fixtureRoot, 'bin');
  const callLog = path.join(fixtureRoot, 'calls.jsonl');
  fs.mkdirSync(shimDir, { mode: 0o700 });
  fs.writeFileSync(callLog, '', { mode: 0o600 });
  try {
    for (const name of ['node', 'git', 'claude', 'gh']) writeReleaseShim(shimDir, name);
    const result = spawnSync(process.execPath, ['scripts/release.mjs', '--dry-run', '--plugin', 'docks', 'patch'], {
      cwd: ROOT,
      encoding: 'utf8',
      timeout: 600_000,
      env: {
        ...process.env,
        PATH: `${shimDir}${path.delimiter}${process.env.PATH ?? ''}`,
        DOCKS_RELEASE_CALL_LOG: callLog,
        DOCKS_RELEASE_REAL_NODE: process.execPath,
        DOCKS_RELEASE_REAL_PATH: process.env.PATH ?? '',
      },
    });
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    assert.match(result.stdout, /\[dry-run\] git push origin HEAD/);
    assert.match(result.stdout, /\[dry-run\] claude plugin tag --push/);
    assert.match(result.stdout, /\[dry-run\] wait for tag-CI .* gh release create/);
    assert.match(result.stdout, /\[dry-run\] OK — no changes written, no tag, no release/);
    const calls = fs
      .readFileSync(callLog, 'utf8')
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line));
    assert.ok(
      calls.some(
        ({ tool, args: callArgs }) =>
          tool === 'node' &&
          callArgs[0] === path.join(ROOT, 'scripts/ci.mjs') &&
          callArgs.slice(1).join(' ') === '-q --plugin docks',
      ),
      'fixture must intercept and preserve the targeted Docks preflight',
    );
    assert.equal(
      calls.some(({ tool, args: callArgs }) => tool === 'git' && callArgs[0] === 'push'),
      false,
      'dry-run must not invoke git push',
    );
    assert.equal(
      calls.some(({ tool, args: callArgs }) => tool === 'claude' && callArgs[0] === 'plugin' && callArgs[1] === 'tag'),
      false,
      'dry-run must not invoke claude plugin tag',
    );
    assert.equal(
      calls.some(({ tool, args: callArgs }) => tool === 'gh' && callArgs[0] === 'release' && callArgs[1] === 'create'),
      false,
      'dry-run must not invoke gh release create',
    );
    assert.deepEqual(gitSnapshot(), before);
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
}

function testTimingWriteFailure() {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'docks-timing-write-'));
  const worktree = path.join(fixtureRoot, 'worktree');
  let worktreeAdded = false;
  const runCi = (cwd, timingPath) =>
    spawnSync(process.execPath, ['scripts/ci.mjs', '--plugin', 'effect-kit', '--timings-json', timingPath], {
      cwd,
      encoding: 'utf8',
      timeout: 600_000,
    });
  try {
    const passedTiming = path.join(fixtureRoot, 'missing-passed', 'timings.json');
    const passed = runCi(ROOT, passedTiming);
    assert.equal(passed.status, 0, `${passed.stdout}\n${passed.stderr}`);
    assert.match(passed.stderr, /cannot write timing report/);
    assert.equal(fs.existsSync(passedTiming), false, 'failed timing output must not leave a report');

    const added = spawnSync('git', ['worktree', 'add', '--detach', worktree, 'HEAD'], { cwd: ROOT, encoding: 'utf8' });
    assert.equal(added.status, 0, added.stderr);
    worktreeAdded = true;
    fs.symlinkSync(path.join(ROOT, 'node_modules'), path.join(worktree, 'node_modules'), 'dir');
    fs.copyFileSync(path.join(ROOT, 'scripts/ci.mjs'), path.join(worktree, 'scripts/ci.mjs'));
    fs.copyFileSync(
      path.join(ROOT, 'scripts/lib/ci-background-task.mjs'),
      path.join(worktree, 'scripts/lib/ci-background-task.mjs'),
    );
    const manifestPath = path.join(worktree, 'plugins/effect-kit/.claude-plugin/plugin.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    manifest.version = '0.0.0';
    fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    const failedTiming = path.join(fixtureRoot, 'missing-failed', 'timings.json');
    const failed = runCi(worktree, failedTiming);
    assert.equal(failed.status, 1, `${failed.stdout}\n${failed.stderr}`);
    assert.match(failed.stderr, /cannot write timing report/);
    assert.match(failed.stdout, /check\(s\) failed/);
    assert.equal(fs.existsSync(failedTiming), false, 'failed timing output must not leave stale evidence');
  } finally {
    if (worktreeAdded) {
      const removed = spawnSync('git', ['worktree', 'remove', '--force', worktree], { cwd: ROOT, encoding: 'utf8' });
      assert.equal(removed.status, 0, removed.stderr);
    }
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
}

if (mode === '--validate-docks-timings') {
  validateTimingReport(path.resolve(args[1]), null, ['plan-review-policy regressions']);
  console.log('full timing report and background regression join passed');
  process.exit(0);
}
if (mode === '--background-output') {
  await testBackgroundOutputRetention();
  await testBackgroundTaskContracts();
  console.log('background task forwarding, ordering, failure retention, and duplicate rejection passed');
  process.exit(0);
}
if (mode === '--dry-run-release-safety') {
  testDryRunReleaseSafety();
  console.log('Docks release dry-run left repository bytes and refs unchanged');
  process.exit(0);
}
if (mode === '--timing-write-failure') {
  testTimingWriteFailure();
  console.log('timing write failures preserve the underlying CI result');
  process.exit(0);
}
const names = (rows) => rows.map((row) => row.name);
const byName = (name) => PLUGINS.find((plugin) => plugin.name === name);

assert.deepEqual(names(resolveCiTargets(PLUGINS, null)), ['docks', 'session-relay', 'effect-kit']);
assert.deepEqual(names(resolveCiTargets(PLUGINS, 'docks')), ['docks']);
assert.throws(() => resolveCiTargets(PLUGINS, 'unknown-plugin'), /unknown plugin.*docks, session-relay, effect-kit/);
assert.deepEqual([...selectedAuthorChecks([byName('docks')])], ['idempotency', 'scaffold', 'plan-reviewer']);
assert.deepEqual([...selectedAuthorChecks([byName('effect-kit')])], []);
assert.deepEqual(releaseCiArgs('docks'), ['-q', '--plugin', 'docks']);
console.log('registry targeting and author-check selection passed');
testFocusedCiCommandSelection();
console.log('focused CI command selection passed');

assert.deepEqual(parseReleaseTag('docks--v0.12.8'), { plugin: 'docks', version: '0.12.8', needsRust: false });
assert.deepEqual(parseReleaseTag('session-relay--v11.2.0'), {
  plugin: 'session-relay',
  version: '11.2.0',
  needsRust: true,
});
for (const invalid of [
  'docks--v01.2.3',
  'docks--v1.02.3',
  'docks--v1.2.03',
  'docks--v1.2',
  'unknown--v1.2.3',
  'docks--v1.2.3;echo-owned',
  'refs/tags/docks--v1.2.3',
])
  assert.throws(() => parseReleaseTag(invalid), /invalid release tag|unknown plugin/);
assert.deepEqual(workflowCiSelection('pull_request', ''), { mode: 'full', plugin: null, needsRust: true });
assert.deepEqual(workflowCiSelection('workflow_dispatch', ''), { mode: 'full', plugin: null, needsRust: true });
assert.deepEqual(workflowCiSelection('push', 'effect-kit--v0.3.1'), {
  mode: 'targeted',
  plugin: 'effect-kit',
  needsRust: false,
});
assert.throws(() => workflowCiSelection('push', 'bad-tag'), /invalid release tag/);
assert.throws(() => workflowCiSelection('schedule', ''), /unsupported workflow event/);
console.log('release tag and workflow selection passed');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'docks-ci-targeting-'));
try {
  const githubOutput = path.join(tmp, 'github-output');
  const cli = spawnSync(
    'node',
    ['scripts/ci-target.mjs', 'release-tag', 'session-relay--v0.11.2', '--github-output', githubOutput],
    { cwd: ROOT, encoding: 'utf8' },
  );
  assert.equal(cli.status, 0, cli.stderr);
  assert.equal(cli.stdout, '');
  assert.equal(fs.readFileSync(githubOutput, 'utf8'), 'mode=targeted\nplugin=session-relay\nneeds_rust=true\n');

  const malformed = spawnSync('node', ['scripts/ci-target.mjs', 'release-tag', 'docks--v1.2.3;echo-owned'], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  assert.notEqual(malformed.status, 0);
  assert.match(malformed.stderr, /invalid release tag/);
  console.log('release tag resolver CLI passed');

  if (!unitOnly) {
    const timingPath = path.join(tmp, 'effect-kit-timings.json');
    const targeted = spawnSync('node', ['scripts/ci.mjs', '--plugin', 'effect-kit', '--timings-json', timingPath], {
      cwd: ROOT,
      encoding: 'utf8',
      timeout: 120_000,
    });
    assert.equal(targeted.status, 0, `${targeted.stdout}\n${targeted.stderr}`);
    assert.doesNotMatch(
      targeted.stdout,
      /skill-maintainer idempotency|plan review policy|plugin: docks|plugin: session-relay/,
    );
    assert.match(targeted.stdout, /plugin: effect-kit/);
    validateTimingReport(timingPath, 'effect-kit', []);
    console.log('targeted CI timing report passed');
  }
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}

function parseWorkflow(relativePath) {
  const text = fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
  const document = parseDocument(text, { prettyErrors: true, strict: true, uniqueKeys: true });
  assert.equal(document.errors.length, 0, `${relativePath}: ${document.errors.join('; ')}`);
  return { text, value: document.toJS() };
}

function assertPinnedActions(workflow, relativePath) {
  for (const job of Object.values(workflow.jobs)) {
    for (const workflowStep of job.steps) {
      if (typeof workflowStep.uses === 'string') {
        assert.match(workflowStep.uses, /^[^@]+@[0-9a-f]{40}$/, `${relativePath}: unpinned ${workflowStep.uses}`);
      }
    }
  }
}

const validateWorkflow = parseWorkflow('.github/workflows/ci.yml');
const binaryWorkflow = parseWorkflow('.github/workflows/build-binaries.yml');
const integrityWorkflow = parseWorkflow('.github/workflows/dependency-integrity.yml');
for (const [relativePath, parsed] of [
  ['.github/workflows/ci.yml', validateWorkflow],
  ['.github/workflows/build-binaries.yml', binaryWorkflow],
  ['.github/workflows/dependency-integrity.yml', integrityWorkflow],
]) {
  assertPinnedActions(parsed.value, relativePath);
}

const steps = validateWorkflow.value.jobs.validate.steps;
const step = (name) => steps.find((row) => row.name?.startsWith(name));
assert.equal(step('resolve CI target').if, "github.event_name == 'push'");
assert.match(step('resolve CI target').run, /scripts\/ci-target\.mjs release-tag/);
assert.equal(
  step('provision Rust 1.85.0 with musl for the session-relay host leg').if,
  "github.event_name != 'push' || steps.target.outputs.needs_rust == 'true'",
);
assert.match(step('run the authoritative gate').run, /if \[ "\$\{\{ github\.event_name \}\}" = "push" \]/);
assert.match(
  step('run the authoritative gate').run,
  /node scripts\/ci\.mjs --plugin "\$\{\{ steps\.target\.outputs\.plugin \}\}"/,
);
assert.match(step('run the authoritative gate').run, /node scripts\/ci\.mjs$/m);
const signatureAudit = step('verify registry signatures (non-blocking)');
assert.equal(signatureAudit.run, 'npm audit signatures');
assert.equal(signatureAudit['continue-on-error'], true);
const setupNode = steps.find((row) => typeof row.uses === 'string' && row.uses.startsWith('actions/setup-node@'));
assert.ok(setupNode);
assert.equal(setupNode.with['node-version'], '24');
assert.ok(steps.indexOf(step('resolve CI target')) < steps.indexOf(step('cache pnpm store')));
const pnpmCache = step('cache pnpm store');
assert.equal(pnpmCache.with.path, '~/.pnpm-store');
assert.match(pnpmCache.with.key, /runner\.os.*runner\.arch.*hashFiles\('pnpm-lock\.yaml', 'package\.json'\)/);
assert.match(pnpmCache.with['restore-keys'], /pnpm-v11-.*runner\.os.*runner\.arch/);
const cargoCache = step('cache Cargo dependencies and target outputs');
assert.equal(cargoCache.if, "github.event_name != 'push' || steps.target.outputs.needs_rust == 'true'");
assert.match(
  cargoCache.with.key,
  /runner\.os.*runner\.arch.*Cargo\.lock.*Cargo\.toml.*rust-toolchain\.toml.*src\/\*\*\/\*\.rs.*build\.rs.*tests\/\*\*\/\*\.rs.*\.cargo\/config/,
);
assert.match(cargoCache.with['restore-keys'], /runner\.os.*runner\.arch.*Cargo\.lock.*rust-toolchain\.toml/);

const integrity = integrityWorkflow.value;
assert.ok(integrity.on.workflow_dispatch !== undefined);
assert.deepEqual(integrity.on.schedule, [{ cron: '17 7 * * 1' }]);
assert.deepEqual(integrity.permissions, { contents: 'read' });
const integritySteps = integrity.jobs.audit.steps;
const integrityStep = (name) => integritySteps.find((row) => row.name?.startsWith(name));
assert.equal(integrityStep('setup Node 24').with['node-version'], '24');
assert.equal(integrityStep('cache pnpm store').uses, pnpmCache.uses);
assert.equal(integrityStep('cache pnpm store').with.key, pnpmCache.with.key);
assert.match(integrityStep('install pnpm dependencies').run, /pnpm install --frozen-lockfile/);
assert.equal(integrityStep('verify registry signatures').run, 'npm audit signatures');
assert.equal(integrityStep('verify registry signatures')['continue-on-error'], undefined);

const binary = binaryWorkflow.value;
const matrix = binary.jobs.build.strategy.matrix.include;
assert.equal(binary.jobs.build.strategy['fail-fast'], false);
assert.equal(matrix.length, 4);
assert.equal(new Set(matrix.map((row) => row.target)).size, 4);
const binaryCache = binary.jobs.build.steps.find((row) => row.name === 'cache Cargo dependencies and target outputs');
assert.equal(binaryCache.uses, pnpmCache.uses);
assert.deepEqual(binaryCache.with.path.split('\n').filter(Boolean), [
  '~/.cargo/registry',
  '~/.cargo/git',
  'plugins/session-relay/rust/target',
]);
assert.match(
  binaryCache.with.key,
  /runner\.os.*runner\.arch.*matrix\.target.*Cargo\.lock.*Cargo\.toml.*rust-toolchain\.toml.*src\/\*\*\/\*\.rs.*build\.rs.*tests\/\*\*\/\*\.rs.*\.cargo\/config/,
);
assert.match(binaryCache.with['restore-keys'], /runner\.os.*runner\.arch.*matrix\.target.*Cargo\.lock/);
assert.deepEqual(binary.jobs.aggregate.needs, ['identity', 'build']);
assert.deepEqual(binary.jobs.publish.needs, ['identity', 'aggregate']);
assert.deepEqual(binary.jobs.publish.permissions, { contents: 'write' });
console.log('workflow targeting, integrity separation, and target-safe cache contracts passed');
