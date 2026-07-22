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
  CI_LANES,
  parseReleaseTag,
  releaseCiArgs,
  resolveCiLane,
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

    const regressionScript = 'scripts/tests/plan-review-policy-regressions.mjs';
    const regressionJobs = String(Math.min(4, os.availableParallelism()));
    const unqualifiedRegressionArgv = [regressionScript, '--self-test'];
    const coreRegressionArgv = [regressionScript, '--self-test', '--jobs', regressionJobs, '--partition', 'baselines'];
    const relayRegressionArgv = [regressionScript, '--self-test', '--jobs', regressionJobs, '--partition', 'mutations'];

    for (const ciArgs of [[], ['--plugin', 'docks']]) {
      const unqualified = run(ciArgs);
      assert.equal(unqualified.result.status, 0, `${unqualified.result.stdout}\n${unqualified.result.stderr}`);
      assert.equal(
        countToolInvocation(unqualified.calls, 'node', unqualifiedRegressionArgv),
        1,
        `${ciArgs.length === 0 ? 'full' : 'plugin'} CI must keep the regression driver unqualified`,
      );
      assert.equal(
        unqualified.calls.filter(({ tool, args: callArgs }) => tool === 'node' && callArgs[0] === regressionScript)
          .length,
        1,
        `${ciArgs.length === 0 ? 'full' : 'plugin'} CI must launch exactly one regression driver invocation`,
      );
    }

    const core = run(['--lane', 'core']);
    assert.equal(core.result.status, 0, `${core.result.stdout}\n${core.result.stderr}`);
    for (const script of repoWideCommands) {
      assert.equal(invokesNode(core.calls, script), true, `core CI must invoke repo-wide command ${script}`);
    }
    assert.match(core.result.stdout, /workflow YAML/);
    assert.match(core.result.stdout, /marketplace catalogs/);
    assert.match(core.result.stdout, /repo-wide guards/);
    assert.match(core.result.stdout, /CI targeting contract/);
    assert.match(core.result.stdout, /plugin: docks/);
    assert.match(core.result.stdout, /plugin: effect-kit/);
    assert.doesNotMatch(core.result.stdout, /plugin: session-relay/);
    assert.match(core.result.stdout, /plan-review-policy baselines partition passed/);
    assert.equal(
      countToolInvocation(core.calls, 'pnpm', ['run', 'check:js']),
      1,
      'core CI must launch JavaScript quality exactly once',
    );
    assert.match(core.result.stdout, /javascript quality/);
    assert.equal(
      countToolInvocation(core.calls, 'node', coreRegressionArgv),
      1,
      'core CI must launch the baselines regression partition through the PATH node shim exactly once',
    );
    assert.equal(
      core.calls.filter(({ tool, args: callArgs }) => tool === 'node' && callArgs[0] === regressionScript).length,
      1,
      'core CI must launch exactly one regression driver invocation',
    );
    const timingPath = path.join(fixtureRoot, 'timings.json');
    const timedCore = run(['--lane', 'core', '--timings-json', timingPath]);
    assert.equal(timedCore.result.status, 0, `${timedCore.result.stdout}\n${timedCore.result.stderr}`);
    assert.equal(
      countToolInvocation(timedCore.calls, 'pnpm', ['run', 'check:js']),
      1,
      '--lane core --timings-json must not change JavaScript quality gate selection',
    );
    assert.equal(
      countToolInvocation(timedCore.calls, 'node', coreRegressionArgv),
      1,
      '--lane core --timings-json must launch the baselines regression partition through the PATH node shim exactly once',
    );
    const timing = JSON.parse(fs.readFileSync(timingPath, 'utf8'));
    assert.equal(timing.schema, 2);
    assert.deepEqual(timing.mode, { plugin: null, lane: 'core' });
    assert.equal(timing.status, 'passed', JSON.stringify(timing));
    assert.ok(
      timing.phases.every(({ status }) => status === 'passed'),
      `timing report contains a failed phase: ${JSON.stringify(timing.phases)}`,
    );
    assert.ok(
      timing.tasks.every(({ status }) => status === 'passed'),
      `timing report contains a failed task: ${JSON.stringify(timing.tasks)}`,
    );
    assert.deepEqual(
      timing.tasks.map(({ name }) => name),
      ['plan-review-policy regressions', 'javascript quality'],
      'core CI must publish exactly the regression and JavaScript quality tasks',
    );
    assert.deepEqual(
      timing.phases.map(({ name }) => name),
      [
        'workflow YAML',
        'marketplace catalogs',
        'repo-wide guards',
        'CI targeting contract',
        'skill-maintainer idempotency',
        'shell lint',
        'scaffold',
        'plugin: docks',
        'plugin: effect-kit',
        'plan review policy',
        'javascript quality',
      ],
      'core CI timing phases must retain the exact repo-wide, plugin, policy, and quality inventory',
    );
    const observedFloorCalls = core.calls.filter(
      ({ args: callArgs }) => callArgs[0] === 'scripts/config/read-floor.mjs',
    );
    for (const floorArgs of [
      ['scripts/config/read-floor.mjs', 'skills', 'engineering'],
      ['scripts/config/read-floor.mjs', 'skills', 'productivity'],
      ['scripts/config/read-floor.mjs', 'agents'],
    ]) {
      assert.equal(
        countToolInvocation(core.calls, 'node', floorArgs),
        1,
        `core CI must read floor ${floorArgs.slice(1).join('/')} exactly once; observed ${JSON.stringify(observedFloorCalls)}`,
      );
    }
    assert.equal(
      countToolInvocation(core.calls, 'node', ['scripts/agents/score.mjs', '--per-file', 'plugins/docks/agents']),
      1,
      'core CI must launch one per-file agent score command',
    );
    assert.equal(
      countToolInvocation(core.calls, 'node', ['scripts/agents/score.mjs', 'plugins/docks/agents']),
      0,
      'core CI must derive the agent total without a second score command',
    );

    const relayTimingPath = path.join(fixtureRoot, 'relay-timings.json');
    const relay = run(['--lane', 'relay', '--timings-json', relayTimingPath]);
    assert.equal(relay.result.status, 0, `${relay.result.stdout}\n${relay.result.stderr}`);
    assert.match(relay.result.stdout, /plugin: session-relay/);
    assert.doesNotMatch(relay.result.stdout, /plugin: docks/);
    assert.doesNotMatch(relay.result.stdout, /plugin: effect-kit/);
    assert.match(relay.result.stdout, /plan-review-policy mutations partition passed/);
    for (const script of repoWideCommands) {
      assert.equal(invokesNode(relay.calls, script), false, `Relay CI must not invoke repo-wide command ${script}`);
    }
    assert.equal(
      countToolInvocation(relay.calls, 'node', relayRegressionArgv),
      1,
      'Relay CI must launch the mutations regression partition through the PATH node shim exactly once',
    );
    assert.equal(
      relay.calls.filter(({ tool, args: callArgs }) => tool === 'node' && callArgs[0] === regressionScript).length,
      1,
      'Relay CI must launch exactly one regression driver invocation',
    );
    assert.equal(
      countToolInvocation(relay.calls, 'pnpm', ['run', 'check:js']),
      0,
      'Relay CI must not launch JavaScript quality',
    );
    const relayTiming = JSON.parse(fs.readFileSync(relayTimingPath, 'utf8'));
    assert.equal(relayTiming.schema, 2);
    assert.deepEqual(relayTiming.mode, { plugin: null, lane: 'relay' });
    assert.equal(relayTiming.status, 'passed', JSON.stringify(relayTiming));
    assert.deepEqual(
      relayTiming.tasks.map(({ name }) => name),
      ['plan-review-policy regressions'],
      'Relay CI must publish exactly one mutations regression task',
    );
    assert.deepEqual(
      relayTiming.phases.map(({ name }) => name),
      ['shell lint', 'plan review policy', 'plugin: session-relay'],
      'Relay CI timing phases must serialize its mutation partition before the native plugin gate',
    );
    assert.ok(
      relayTiming.phases.every(({ status }) => status === 'passed'),
      `Relay timing report contains a failed phase: ${JSON.stringify(relayTiming.phases)}`,
    );
    assert.ok(
      relayTiming.tasks.every(({ status }) => status === 'passed'),
      `Relay timing report contains a failed task: ${JSON.stringify(relayTiming.tasks)}`,
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
const laneShape = ({ name, targets, repoWide, planPolicy, regressionPartition, regressionJobsCap }) => ({
  name,
  targets: names(targets),
  repoWide,
  planPolicy,
  regressionPartition,
  regressionJobsCap,
});
assert.deepEqual(CI_LANES, ['core', 'relay']);
assert.ok(Object.isFrozen(CI_LANES));
assert.deepEqual(
  PLUGINS.map(({ name, ciLane }) => ({ name, ciLane })),
  [
    { name: 'docks', ciLane: 'core' },
    { name: 'session-relay', ciLane: 'relay' },
    { name: 'effect-kit', ciLane: 'core' },
  ],
);
assert.deepEqual(laneShape(resolveCiLane(PLUGINS, 'core')), {
  name: 'core',
  targets: ['docks', 'effect-kit'],
  repoWide: true,
  planPolicy: true,
  regressionPartition: 'baselines',
  regressionJobsCap: 4,
});
assert.deepEqual(laneShape(resolveCiLane(PLUGINS, 'relay')), {
  name: 'relay',
  targets: ['session-relay'],
  repoWide: false,
  planPolicy: false,
  regressionPartition: 'mutations',
  regressionJobsCap: 4,
});
const syntheticCorePlugin = {
  ...byName('effect-kit'),
  name: 'synthetic-core-plugin',
  root: 'plugins/synthetic-core-plugin',
  ciLane: 'core',
};
PLUGINS.push(syntheticCorePlugin);
try {
  assert.deepEqual(names(resolveCiLane(PLUGINS, 'core').targets), ['docks', 'effect-kit', 'synthetic-core-plugin']);
} finally {
  assert.equal(PLUGINS.pop(), syntheticCorePlugin);
}
const missingLanePlugin = { ...syntheticCorePlugin, name: 'missing-lane-plugin' };
delete missingLanePlugin.ciLane;
PLUGINS.push(missingLanePlugin);
try {
  assert.throws(() => resolveCiLane(PLUGINS, 'core'), /plugin missing-lane-plugin is missing required ciLane/);
} finally {
  assert.equal(PLUGINS.pop(), missingLanePlugin);
}
const unknownLanePlugin = { ...syntheticCorePlugin, name: 'unknown-lane-plugin', ciLane: 'mutations' };
PLUGINS.push(unknownLanePlugin);
try {
  assert.throws(
    () => resolveCiLane(PLUGINS, 'core'),
    /plugin unknown-lane-plugin has unknown ciLane: mutations.*core, relay/,
  );
} finally {
  assert.equal(PLUGINS.pop(), unknownLanePlugin);
}
assert.throws(() => resolveCiLane(PLUGINS, 'unknown'), /unknown CI lane.*core, relay/);
assert.throws(() => resolveCiLane(PLUGINS, 'toString'), /unknown CI lane.*core, relay/);
assert.throws(() => resolveCiLane(PLUGINS, 'constructor'), /unknown CI lane.*core, relay/);
assert.throws(
  () =>
    resolveCiLane(
      PLUGINS.filter(({ name }) => name !== 'effect-kit'),
      'core',
    ),
  /unknown plugin: effect-kit/,
);
for (const [invalidArgs, diagnostic] of [
  [['--lane'], /--lane requires one value/],
  [['--lane', 'core', '--lane', 'relay'], /duplicate argument: --lane/],
  [['--lane', 'core', '--plugin', 'docks'], /--plugin cannot be combined with --lane/],
  [['--list', '--lane', 'core'], /--list cannot be combined with.*--lane/],
  [['--lane', 'unknown'], /unknown CI lane.*core, relay/],
  [['--lane', 'toString'], /unknown CI lane.*core, relay/],
  [['--lane', 'constructor'], /unknown CI lane.*core, relay/],
]) {
  const rejected = spawnSync(process.execPath, ['scripts/ci.mjs', ...invalidArgs], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  assert.equal(rejected.status, 2, `${invalidArgs.join(' ')}\n${rejected.stdout}\n${rejected.stderr}`);
  assert.match(rejected.stderr, diagnostic);
}
console.log('closed CI lane resolver and argument parser passed');
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

const validation = validateWorkflow.value;
assert.deepEqual(Object.keys(validation.jobs), ['validation-shards', 'validate']);
assert.deepEqual(validation.permissions, { contents: 'read' });
assert.deepEqual(validation.on.pull_request, { branches: ['main'] });
assert.deepEqual(validation.on.push, { tags: ['*--v*'] });
assert.ok(validation.on.workflow_dispatch !== undefined);
assert.doesNotMatch(validateWorkflow.text, /(?:contents:\s*write|actions\/upload-artifact@)/);

const shardJob = validation.jobs['validation-shards'];
assert.deepEqual(Object.keys(shardJob), ['name', 'if', 'permissions', 'runs-on', 'strategy', 'steps']);
assert.equal(shardJob.name, `validation shard (\${{ matrix.lane }})`);
assert.equal(shardJob.if, "github.event_name == 'pull_request'");
assert.deepEqual(shardJob.permissions, { contents: 'read' });
assert.equal(shardJob['runs-on'], 'ubuntu-latest');
assert.deepEqual(shardJob.strategy, {
  'fail-fast': false,
  matrix: { lane: ['core', 'relay'] },
});
const shardSteps = shardJob.steps;
const shardStep = (name) => shardSteps.find((row) => row.name?.startsWith(name));
assert.deepEqual(
  shardSteps.map((row) => row.name ?? row.uses),
  [
    'actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd',
    'setup Node 24',
    'enable corepack',
    'configure deterministic pnpm store',
    'cache pnpm store',
    'cache Cargo dependencies and target outputs',
    'install pnpm dependencies (--frozen-lockfile; yaml + lockfile-pinned claude-code)',
    'verify registry signatures (non-blocking)',
    'materialize claude-code binary (allowBuilds denies it by default)',
    'add node_modules/.bin to PATH (so ci.mjs finds the pinned claude)',
    'provision Rust 1.85.0 with musl for the session-relay host leg',
    'run validation lane',
  ],
);
for (const name of [
  'enable corepack',
  'configure deterministic pnpm store',
  'cache pnpm store',
  'install pnpm dependencies',
  'verify registry signatures',
  'materialize claude-code binary',
  'add node_modules/.bin to PATH',
])
  assert.equal(shardStep(name).if, undefined, `${name} must run on both candidate lanes`);
for (const name of ['cache Cargo dependencies', 'provision Rust 1.85.0 with musl'])
  assert.equal(shardStep(name).if, "matrix.lane == 'relay'");
const shardStepsForLane = (lane) =>
  shardSteps
    .filter((row) => row.if === undefined || (row.if === "matrix.lane == 'relay'" && lane === 'relay'))
    .map((row) => row.name ?? 'checkout');
assert.deepEqual(shardStepsForLane('core'), [
  'checkout',
  'setup Node 24',
  'enable corepack',
  'configure deterministic pnpm store',
  'cache pnpm store',
  'install pnpm dependencies (--frozen-lockfile; yaml + lockfile-pinned claude-code)',
  'verify registry signatures (non-blocking)',
  'materialize claude-code binary (allowBuilds denies it by default)',
  'add node_modules/.bin to PATH (so ci.mjs finds the pinned claude)',
  'run validation lane',
]);
assert.deepEqual(shardStepsForLane('relay'), [
  'checkout',
  'setup Node 24',
  'enable corepack',
  'configure deterministic pnpm store',
  'cache pnpm store',
  'cache Cargo dependencies and target outputs',
  'install pnpm dependencies (--frozen-lockfile; yaml + lockfile-pinned claude-code)',
  'verify registry signatures (non-blocking)',
  'materialize claude-code binary (allowBuilds denies it by default)',
  'add node_modules/.bin to PATH (so ci.mjs finds the pinned claude)',
  'provision Rust 1.85.0 with musl for the session-relay host leg',
  'run validation lane',
]);
assert.equal(shardSteps[0].with['persist-credentials'], false);
assert.equal(shardStep('setup Node 24').with['node-version'], '24');
assert.equal(shardStep('run validation lane').run, `node scripts/ci.mjs --lane "\${{ matrix.lane }}"`);

const validateJob = validation.jobs.validate;
assert.deepEqual(Object.keys(validateJob), ['name', 'runs-on', 'needs', 'if', 'steps']);
assert.equal(validateJob.name, 'validate (scripts/ci.mjs)');
assert.equal(validateJob.needs, 'validation-shards');
assert.equal(validateJob.if, 'always()');
const steps = validateWorkflow.value.jobs.validate.steps;
const step = (name) => steps.find((row) => row.name?.startsWith(name));
assert.deepEqual(
  steps.map((row) => row.name ?? row.uses),
  [
    'actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd',
    'setup Node 24',
    'resolve CI target',
    'enable corepack',
    'configure deterministic pnpm store',
    'cache pnpm store',
    'cache Cargo dependencies and target outputs',
    'install pnpm dependencies (--frozen-lockfile; yaml + lockfile-pinned claude-code)',
    'verify registry signatures (non-blocking)',
    'materialize claude-code binary (allowBuilds denies it by default)',
    'add node_modules/.bin to PATH (so ci.mjs finds the pinned claude)',
    'provision Rust 1.85.0 with musl for the session-relay host leg',
    'run the authoritative gate (scripts/ci.mjs)',
    'assert successful validation shards',
  ],
);
const nonPullRequestCondition = "github.event_name != 'pull_request'";
const pushCondition = "github.event_name == 'push'";
const pullRequestCondition = "github.event_name == 'pull_request'";
const nonPullRequestRustCondition =
  "github.event_name != 'pull_request' && (github.event_name != 'push' || steps.target.outputs.needs_rust == 'true')";
const validateStepLabel = (row) => row.name ?? 'checkout';
assert.deepEqual(Object.fromEntries(steps.map((row) => [validateStepLabel(row), row.if])), {
  checkout: nonPullRequestCondition,
  'setup Node 24': nonPullRequestCondition,
  'resolve CI target': pushCondition,
  'enable corepack': nonPullRequestCondition,
  'configure deterministic pnpm store': nonPullRequestCondition,
  'cache pnpm store': nonPullRequestCondition,
  'cache Cargo dependencies and target outputs': nonPullRequestRustCondition,
  'install pnpm dependencies (--frozen-lockfile; yaml + lockfile-pinned claude-code)': nonPullRequestCondition,
  'verify registry signatures (non-blocking)': nonPullRequestCondition,
  'materialize claude-code binary (allowBuilds denies it by default)': nonPullRequestCondition,
  'add node_modules/.bin to PATH (so ci.mjs finds the pinned claude)': nonPullRequestCondition,
  'provision Rust 1.85.0 with musl for the session-relay host leg': nonPullRequestRustCondition,
  'run the authoritative gate (scripts/ci.mjs)': nonPullRequestCondition,
  'assert successful validation shards': pullRequestCondition,
});
function effectiveValidateInventory(eventName, needsRust = false) {
  return steps
    .filter((row) => {
      switch (row.if) {
        case nonPullRequestCondition:
          return eventName !== 'pull_request';
        case pushCondition:
          return eventName === 'push';
        case pullRequestCondition:
          return eventName === 'pull_request';
        case nonPullRequestRustCondition:
          return eventName !== 'pull_request' && (eventName !== 'push' || needsRust);
        default:
          throw new Error(`unexpected validate condition for ${validateStepLabel(row)}: ${row.if}`);
      }
    })
    .map(validateStepLabel);
}
const fullValidateInventory = [
  'checkout',
  'setup Node 24',
  'enable corepack',
  'configure deterministic pnpm store',
  'cache pnpm store',
  'cache Cargo dependencies and target outputs',
  'install pnpm dependencies (--frozen-lockfile; yaml + lockfile-pinned claude-code)',
  'verify registry signatures (non-blocking)',
  'materialize claude-code binary (allowBuilds denies it by default)',
  'add node_modules/.bin to PATH (so ci.mjs finds the pinned claude)',
  'provision Rust 1.85.0 with musl for the session-relay host leg',
  'run the authoritative gate (scripts/ci.mjs)',
];
assert.deepEqual(effectiveValidateInventory('pull_request'), ['assert successful validation shards']);
assert.deepEqual(effectiveValidateInventory('workflow_dispatch'), fullValidateInventory);
assert.deepEqual(effectiveValidateInventory('push', true), [
  'checkout',
  'setup Node 24',
  'resolve CI target',
  ...fullValidateInventory.slice(2),
]);
assert.deepEqual(effectiveValidateInventory('push', false), [
  'checkout',
  'setup Node 24',
  'resolve CI target',
  'enable corepack',
  'configure deterministic pnpm store',
  'cache pnpm store',
  'install pnpm dependencies (--frozen-lockfile; yaml + lockfile-pinned claude-code)',
  'verify registry signatures (non-blocking)',
  'materialize claude-code binary (allowBuilds denies it by default)',
  'add node_modules/.bin to PATH (so ci.mjs finds the pinned claude)',
  'run the authoritative gate (scripts/ci.mjs)',
]);
assert.equal(step('resolve CI target').if, "github.event_name == 'push'");
assert.match(step('resolve CI target').run, /scripts\/ci-target\.mjs release-tag/);
assert.equal(step('provision Rust 1.85.0 with musl for the session-relay host leg').if, nonPullRequestRustCondition);
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
assert.equal(cargoCache.if, nonPullRequestRustCondition);
assert.match(
  cargoCache.with.key,
  /runner\.os.*runner\.arch.*Cargo\.lock.*Cargo\.toml.*rust-toolchain\.toml.*src\/\*\*\/\*\.rs.*build\.rs.*tests\/\*\*\/\*\.rs.*\.cargo\/config/,
);
assert.match(cargoCache.with['restore-keys'], /runner\.os.*runner\.arch.*Cargo\.lock.*rust-toolchain\.toml/);
const withoutIf = (row) => Object.fromEntries(Object.entries(row).filter(([key]) => key !== 'if'));
assert.deepEqual(withoutIf(shardSteps[0]), withoutIf(steps[0]));
assert.deepEqual(withoutIf(shardStep('setup Node 24')), withoutIf(setupNode));
for (const name of [
  'enable corepack',
  'configure deterministic pnpm store',
  'cache pnpm store',
  'cache Cargo dependencies and target outputs',
  'install pnpm dependencies',
  'verify registry signatures',
  'materialize claude-code binary',
  'add node_modules/.bin to PATH',
  'provision Rust 1.85.0 with musl',
]) {
  assert.deepEqual(
    withoutIf(shardStep(name)),
    withoutIf(step(name)),
    `${name}: shard setup drifted from authoritative setup`,
  );
}
const authoritativeGate = step('run the authoritative gate');
const shardAssertion = step('assert successful validation shards');
assert.equal(steps.at(-2), authoritativeGate);
assert.equal(steps.at(-1), shardAssertion);
assert.deepEqual(Object.keys(shardAssertion), ['name', 'if', 'env', 'run']);
assert.equal(shardAssertion.if, "github.event_name == 'pull_request'");
assert.deepEqual(shardAssertion.env, {
  VALIDATION_SHARDS_RESULT: `\${{ needs.validation-shards.result }}`,
});
assert.equal(
  shardAssertion.run,
  'if [ "$VALIDATION_SHARDS_RESULT" != "success" ]; then\n' +
    '  echo "validation shards result: $VALIDATION_SHARDS_RESULT" >&2\n' +
    '  exit 1\n' +
    'fi\n',
);

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
