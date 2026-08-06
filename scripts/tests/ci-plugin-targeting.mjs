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
  assertShardTopologyCoversRegistry,
  CI_LANES,
  parseReleaseTag,
  REPO_WIDE_LANE,
  releaseCiArgs,
  resolveCiLane,
  resolveCiTargets,
  resolveShardSelection,
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

const TIMING_REPORT_KEYS = [
  'schema',
  'mode',
  'status',
  'total_ms',
  'phases',
  'tasks',
  'commands',
  'reconstruction',
  'host',
];
const COMMAND_RECORD_KEYS = [
  'schema',
  'id',
  'kind',
  'phase',
  'argv',
  'cwd',
  'started_ms',
  'ended_ms',
  'duration_ms',
  'status',
  'exit_code',
  'signal',
  'overlap_ms',
  'retained_output',
  'cache',
];
const RECONSTRUCTION_KEYS = [
  'wall_ms',
  'command_busy_ms',
  'command_total_ms',
  'overlap_ms',
  'unaccounted_ms',
  'peak_concurrency',
];

function assertCommandTelemetry(timing) {
  assert.deepEqual(Object.keys(timing), TIMING_REPORT_KEYS);
  assert.ok(timing.commands.length > 0, 'timing report must contain observed commands');
  for (const command of timing.commands) {
    assert.deepEqual(Object.keys(command), COMMAND_RECORD_KEYS);
    assert.equal(command.schema, 1);
    assert.ok(['background', 'sync'].includes(command.kind));
    assert.ok(['passed', 'failed'].includes(command.status));
    for (const field of ['started_ms', 'ended_ms', 'duration_ms', 'overlap_ms']) {
      assert.ok(Number.isInteger(command[field]) && command[field] >= 0, `${command.id}.${field} must be a duration`);
    }
    assert.equal(command.duration_ms, command.ended_ms - command.started_ms);
  }
  assert.deepEqual(Object.keys(timing.reconstruction), RECONSTRUCTION_KEYS);
  for (const field of RECONSTRUCTION_KEYS) {
    assert.ok(
      Number.isInteger(timing.reconstruction[field]) && timing.reconstruction[field] >= 0,
      `reconstruction.${field} must be a duration`,
    );
  }
  assert.equal(
    timing.reconstruction.overlap_ms,
    timing.reconstruction.command_total_ms - timing.reconstruction.command_busy_ms,
  );
  assert.equal(timing.reconstruction.wall_ms, timing.total_ms);
  assert.equal(timing.host, null);
  const backgroundIds = new Set(timing.commands.filter(({ kind }) => kind === 'background').map(({ id }) => id));
  for (const task of timing.tasks) {
    assert.ok(backgroundIds.has(task.name), `task ${task.name} must have a background command record`);
  }
}

function validateTimingReport(timingPath, plugin, taskNames) {
  const timing = JSON.parse(fs.readFileSync(timingPath, 'utf8'));
  assertCommandTelemetry(timing);
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
  if (skillRoot === 'plugins/docks/skills') process.stdout.write('engineering/security 16\\nproductivity/write-skill 14\\n');
  else if (skillRoot === 'plugins/session-relay/skills') process.stdout.write('productivity/session-relay 14\\n');
  else if (skillRoot === 'plugins/effect-kit/skills') process.stdout.write('engineering/effect-ts-setup 14\\n');
  else if (skillRoot === 'plugins/plan-lifecycle/skills') process.stdout.write('productivity/plan-manager 14\\n');
}
if (tool === 'node' && args[0] === 'scripts/agents/score.mjs' && args[1] === '--per-file') {
  process.stdout.write('plan-reviewer.md 14\\n');
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
  const relayBinary = path.resolve(ROOT, PLUGINS.find(({ name }) => name === 'session-relay').rust.source.builtBinary);
  const relayBinaryDirectory = path.dirname(relayBinary);
  const relayBinaryExisted = fs.existsSync(relayBinary);
  const relayBinaryDirectoryExisted = fs.existsSync(relayBinaryDirectory);
  fs.mkdirSync(shimDir, { mode: 0o700 });
  fs.writeFileSync(callLog, '', { mode: 0o600 });

  const probeEnv = { ...process.env };
  // This probe stubs the descriptor binary; an inherited target dir would make gateRust look elsewhere.
  delete probeEnv.CARGO_TARGET_DIR;
  delete probeEnv.GITHUB_ACTIONS;
  delete probeEnv.SESSION_RELAY_TEST_CGROUP_ROOT;
  const run = (ciArgs) => {
    fs.writeFileSync(callLog, '', { mode: 0o600 });
    const result = spawnSync(process.execPath, ['scripts/ci.mjs', ...ciArgs], {
      cwd: ROOT,
      encoding: 'utf8',
      timeout: 120_000,
      env: {
        ...probeEnv,
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
    'scripts/tests/ci-observability.mjs',
    'scripts/tests/test-contracts.mjs',
  ];
  const effectKitBiomeCiArgv = ['exec', 'biome', 'ci', 'plugins/effect-kit/test'];
  const sessionRelayBiomeCiArgv = ['exec', 'biome', 'ci', 'scripts', 'plugins/session-relay/test'];
  const coreBiomeCiArgv = [
    'exec',
    'biome',
    'ci',
    'scripts',
    'plugins/docks/hooks',
    'plugins/effect-kit/test',
    'plugins/plan-lifecycle/test',
  ];
  const docksBiomeLintArgv = ['exec', 'biome', 'lint', 'plugins/docks/skills/productivity/write-skill/scripts'];
  const coreBiomeLintArgv = [
    'exec',
    'biome',
    'lint',
    'plugins/docks/skills/productivity/write-skill/scripts',
    'plugins/plan-lifecycle/skills/productivity/plan-reviewer/scripts',
  ];

  try {
    if (!relayBinaryExisted) {
      fs.mkdirSync(relayBinaryDirectory, { recursive: true });
      fs.writeFileSync(relayBinary, '#!/bin/sh\nexit 0\n', { mode: 0o755 });
    }
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
    assert.equal(countToolInvocation(targeted.calls, 'pnpm', effectKitBiomeCiArgv), 1);
    assert.match(targeted.result.stdout, /javascript quality/);
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

    const orchestrationArgv = ['scripts/tests/plan-orchestration.mjs'];
    const boundedWorkflowArgv = ['scripts/tests/plan-skill-phases.mjs', '--case', 'bounded-workflows'];
    const crossPluginCollisionArgv = [
      'tests/skill-trigger-collision.mjs',
      'plugins/docks/skills',
      'plugins/effect-kit/skills',
    ];
    const sessionRelayCollisionArgv = ['tests/skill-trigger-collision.mjs', 'plugins/session-relay/skills'];
    const planLifecycleCollisionArgv = ['tests/skill-trigger-collision.mjs', 'plugins/plan-lifecycle/skills'];

    assert.equal(
      countToolInvocation(targeted.calls, 'node', crossPluginCollisionArgv),
      1,
      'an Effect Kit target must retain the joint Docks/Effect trigger-collision contract',
    );
    assert.equal(countToolInvocation(targeted.calls, 'node', orchestrationArgv), 0);

    for (const ciArgs of [[], ['--plugin', 'docks']]) {
      const selected = run(ciArgs);
      assert.equal(selected.result.status, 0, `${selected.result.stdout}\n${selected.result.stderr}`);
      assert.equal(
        countToolInvocation(selected.calls, 'node', orchestrationArgv),
        1,
        `${ciArgs.length === 0 ? 'full' : 'Docks-targeted'} CI must run the focused orchestration driver once`,
      );
      assert.equal(
        countToolInvocation(selected.calls, 'node', boundedWorkflowArgv),
        1,
        `${ciArgs.length === 0 ? 'full' : 'Docks-targeted'} CI must run the bounded workflow contract once`,
      );
      assert.equal(
        countToolInvocation(selected.calls, 'node', crossPluginCollisionArgv),
        1,
        `${ciArgs.length === 0 ? 'full' : 'Docks-targeted'} CI must audit Docks and Effect Kit together once`,
      );
      if (ciArgs.length === 0) {
        assert.equal(countToolInvocation(selected.calls, 'pnpm', ['run', 'check:js']), 1);
      } else {
        assert.equal(countToolInvocation(selected.calls, 'pnpm', ['run', 'check:js']), 0);
        assert.equal(
          countToolInvocation(selected.calls, 'pnpm', ['exec', 'biome', 'ci', 'scripts', 'plugins/docks/hooks']),
          1,
        );
        assert.equal(countToolInvocation(selected.calls, 'pnpm', docksBiomeLintArgv), 1);
        assert.match(selected.result.stdout, /javascript quality/);
      }
    }

    const core = run(['--lane', 'core']);
    assert.equal(core.result.status, 0, `${core.result.stdout}\n${core.result.stderr}`);
    assert.equal(countToolInvocation(core.calls, 'pnpm', ['run', 'check:js']), 0);
    assert.equal(countToolInvocation(core.calls, 'pnpm', coreBiomeCiArgv), 1);
    assert.equal(countToolInvocation(core.calls, 'pnpm', coreBiomeLintArgv), 1);
    assert.match(core.result.stdout, /javascript quality/);
    // `core` is now a pure plugin shard: the repo-wide checks moved to the always-on
    // `repo` shard so a pull request that skips `core` does not lose them.
    assert.doesNotMatch(
      core.result.stdout,
      /workflow YAML|marketplace catalogs|repo-wide guards|CI targeting contract/,
    );
    for (const script of repoWideCommands) {
      assert.equal(invokesNode(core.calls, script), false, `core CI must not invoke repo-wide command ${script}`);
    }
    assert.match(core.result.stdout, /plan orchestration/);
    assert.match(core.result.stdout, /plugin: docks/);
    assert.match(core.result.stdout, /plugin: effect-kit/);
    assert.match(core.result.stdout, /plugin: plan-lifecycle/);
    assert.doesNotMatch(core.result.stdout, /plugin: session-relay|partition passed/);
    assert.equal(countToolInvocation(core.calls, 'node', orchestrationArgv), 1);
    assert.equal(countToolInvocation(core.calls, 'node', boundedWorkflowArgv), 1);
    assert.equal(countToolInvocation(core.calls, 'node', crossPluginCollisionArgv), 1);
    assert.equal(countToolInvocation(core.calls, 'node', planLifecycleCollisionArgv), 1);
    assert.equal(countToolInvocation(core.calls, 'node', ['plugins/plan-lifecycle/test/selftest.mjs']), 1);

    const timingPath = path.join(fixtureRoot, 'timings.json');
    const timedCore = run(['--lane', 'core', '--timings-json', timingPath]);
    assert.equal(timedCore.result.status, 0, `${timedCore.result.stdout}\n${timedCore.result.stderr}`);
    assert.equal(countToolInvocation(timedCore.calls, 'pnpm', ['run', 'check:js']), 0);
    assert.equal(countToolInvocation(timedCore.calls, 'pnpm', coreBiomeCiArgv), 1);
    assert.equal(countToolInvocation(timedCore.calls, 'pnpm', coreBiomeLintArgv), 1);
    assert.equal(countToolInvocation(timedCore.calls, 'node', orchestrationArgv), 1);
    assert.equal(countToolInvocation(timedCore.calls, 'node', boundedWorkflowArgv), 1);
    const timing = JSON.parse(fs.readFileSync(timingPath, 'utf8'));
    assertCommandTelemetry(timing);
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
      ['javascript quality', 'javascript quality lint'],
      'core CI must publish the concurrent JavaScript-quality tasks',
    );
    assert.deepEqual(
      timing.phases.map(({ name }) => name),
      [
        'skill-maintainer idempotency',
        'shell lint',
        'skill trigger collisions',
        'plan orchestration',
        'plugin: docks',
        'plugin: effect-kit',
        'plugin: plan-lifecycle',
        'javascript quality',
      ],
      'core CI timing phases must own its three plugins and nothing repo-wide',
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
      countToolInvocation(core.calls, 'node', [
        'scripts/agents/score.mjs',
        '--per-file',
        'plugins/plan-lifecycle/agents',
      ]),
      1,
      'core CI must launch one per-file agent score command',
    );
    assert.equal(
      countToolInvocation(core.calls, 'node', ['scripts/agents/score.mjs', 'plugins/plan-lifecycle/agents']),
      0,
      'core CI must derive the agent total without a second score command',
    );
    assert.equal(
      countToolInvocation(core.calls, 'node', ['scripts/agents/score.mjs', '--per-file', 'plugins/docks/agents']),
      0,
      'docks no longer ships agents, so core CI must not score a docks agents dir',
    );

    const relayTimingPath = path.join(fixtureRoot, 'relay-timings.json');
    const relay = run(['--lane', 'relay', '--timings-json', relayTimingPath]);
    assert.equal(relay.result.status, 0, `${relay.result.stdout}\n${relay.result.stderr}`);
    assert.match(relay.result.stdout, /plugin: session-relay/);
    assert.doesNotMatch(relay.result.stdout, /plugin: docks|plugin: effect-kit|plan orchestration|partition passed/);
    for (const script of repoWideCommands) {
      assert.equal(invokesNode(relay.calls, script), false, `Relay CI must not invoke repo-wide command ${script}`);
    }
    assert.equal(countToolInvocation(relay.calls, 'node', sessionRelayCollisionArgv), 1);
    assert.equal(countToolInvocation(relay.calls, 'node', orchestrationArgv), 0);
    assert.equal(countToolInvocation(relay.calls, 'node', boundedWorkflowArgv), 0);
    assert.equal(countToolInvocation(relay.calls, 'pnpm', ['run', 'check:js']), 0);
    assert.equal(countToolInvocation(relay.calls, 'pnpm', sessionRelayBiomeCiArgv), 1);
    assert.match(relay.result.stdout, /javascript quality/);
    const relayTiming = JSON.parse(fs.readFileSync(relayTimingPath, 'utf8'));
    assertCommandTelemetry(relayTiming);
    assert.equal(relayTiming.schema, 2);
    assert.deepEqual(
      relayTiming.tasks.map(({ name }) => name),
      ['javascript quality'],
    );
    assert.deepEqual(
      relayTiming.phases.map(({ name }) => name),
      ['shell lint', 'skill trigger collisions', 'plugin: session-relay', 'javascript quality'],
      'Relay CI must own only its shell, trigger, plugin, and quality gates',
    );
    assert.ok(
      relayTiming.phases.every(({ status }) => status === 'passed'),
      `Relay timing report contains a failed phase: ${JSON.stringify(relayTiming.phases)}`,
    );

    // The always-on shard. Everything a shard-skipping pull request would otherwise
    // lose lives here, and nothing plugin-scoped does - if a check migrates out of
    // this census it stops running on a pull request that skips both plugin shards.
    const repoTimingPath = path.join(fixtureRoot, 'repo-timings.json');
    const repoWide = run(['--lane', 'repo', '--timings-json', repoTimingPath]);
    assert.equal(repoWide.result.status, 0, `${repoWide.result.stdout}\n${repoWide.result.stderr}`);
    for (const script of repoWideCommands) {
      assert.equal(invokesNode(repoWide.calls, script), true, `repo CI must invoke repo-wide command ${script}`);
    }
    assert.equal(countToolInvocation(repoWide.calls, 'node', ['scripts/plans/no-bespoke-gates.mjs']), 1);
    assert.equal(countToolInvocation(repoWide.calls, 'pnpm', ['run', 'test:unit']), 1);
    assert.doesNotMatch(
      repoWide.result.stdout,
      /plugin: docks|plugin: session-relay|plugin: effect-kit|plugin: plan-lifecycle/,
    );
    assert.equal(countToolInvocation(repoWide.calls, 'pnpm', ['run', 'check:js']), 0);
    assert.equal(countToolInvocation(repoWide.calls, 'pnpm', coreBiomeCiArgv), 0);
    assert.equal(countToolInvocation(repoWide.calls, 'node', orchestrationArgv), 0);
    const repoTiming = JSON.parse(fs.readFileSync(repoTimingPath, 'utf8'));
    assertCommandTelemetry(repoTiming);
    assert.deepEqual(repoTiming.mode, { plugin: null, lane: 'repo' });
    assert.deepEqual(
      repoTiming.phases.map(({ name }) => name),
      ['workflow YAML', 'marketplace catalogs', 'repo-wide guards', 'CI targeting contract'],
      'the always-on shard must own every cross-plugin check and nothing else',
    );
    assert.ok(
      repoTiming.phases.every(({ status }) => status === 'passed'),
      `repo timing report contains a failed phase: ${JSON.stringify(repoTiming.phases)}`,
    );
    // No shard may drop a phase the pre-sharding full gate ran.
    const shardedPhases = new Set(
      [repoTiming, timing, relayTiming].flatMap(({ phases }) => phases.map(({ name }) => name)),
    );
    const fullTimingPath = path.join(fixtureRoot, 'full-timings.json');
    const full = run(['--timings-json', fullTimingPath]);
    assert.equal(full.result.status, 0, `${full.result.stdout}\n${full.result.stderr}`);
    const fullPhases = JSON.parse(fs.readFileSync(fullTimingPath, 'utf8')).phases.map(({ name }) => name);
    assert.deepEqual(
      fullPhases.filter((name) => !shardedPhases.has(name)),
      [],
      'every phase of the untargeted gate must be owned by some shard',
    );
  } finally {
    if (!relayBinaryExisted) fs.rmSync(relayBinary, { force: true });
    if (!relayBinaryDirectoryExisted) fs.rmSync(relayBinaryDirectory, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
}

const GENERIC_RELEASE_IO_KEYS = Object.freeze([
  'commit',
  'createRelease',
  'createTag',
  'ensureCleanTree',
  'ensureTool',
  'fileExists',
  'log',
  'push',
  'readJson',
  'readReleaseNotes',
  'resolveTagCommit',
  'runSelectedCi',
  'waitForTagCi',
  'writeJson',
]);

function genericReleaseIo(repo, options = {}) {
  const calls = [];
  const output = [];
  const relativePath = (file) => path.relative(repo, path.isAbsolute(file) ? file : path.join(repo, file));
  const tagCiResult = Object.hasOwn(options, 'tagCiResult')
    ? options.tagCiResult
    : { ok: true, runId: 'fixture-tag-ci-run' };
  const record = (tool, args = []) => calls.push({ tool, args });
  const io = {
    commit(files, message) {
      record('commit', [files, message]);
    },
    createRelease(release) {
      record('createRelease', [release]);
    },
    createTag(tag) {
      record('createTag', [tag]);
    },
    ensureCleanTree() {
      record('ensureCleanTree');
      return true;
    },
    ensureTool(tool) {
      record('ensureTool', [tool]);
      return true;
    },
    fileExists(file) {
      const relative = relativePath(file);
      record('fileExists', [relative]);
      return fs.existsSync(path.join(repo, relative));
    },
    log(message) {
      output.push(message);
      record('log', [message]);
    },
    push() {
      record('push');
    },
    readJson(file) {
      const relative = relativePath(file);
      record('readJson', [relative]);
      return JSON.parse(fs.readFileSync(path.join(repo, relative), 'utf8'));
    },
    readReleaseNotes(plugin) {
      record('readReleaseNotes', [plugin]);
      return 'fixture release notes';
    },
    resolveTagCommit(tag) {
      record('resolveTagCommit', [tag]);
      return 'a'.repeat(40);
    },
    runSelectedCi(plugin, ciArgs) {
      record('node', [path.join(repo, 'scripts/ci.mjs'), ...ciArgs]);
      assert.equal(plugin.name, ciArgs.at(-1));
      return { status: 0, stdout: '', stderr: '' };
    },
    waitForTagCi(tag, commit) {
      record('waitForTagCi', [tag, commit]);
      return tagCiResult;
    },
    writeJson(file, value) {
      record('writeJson', [relativePath(file), value]);
    },
  };
  assert.deepEqual(Object.keys(io).sort(), [...GENERIC_RELEASE_IO_KEYS].sort());
  return { calls, io: Object.freeze(io), output };
}

async function expectReleasePolicyRefusal(runGenericPluginRelease, plugin, release, expected) {
  const calls = [];
  const io = new Proxy(
    {},
    {
      get(_target, operation) {
        calls.push(String(operation));
        return () => {
          throw new Error(`release policy reached IO operation ${String(operation)}`);
        };
      },
    },
  );
  await assert.rejects(
    Promise.resolve().then(() =>
      runGenericPluginRelease({
        argv: ['--dry-run', '--plugin', plugin.name, 'patch'],
        repo: ROOT,
        plugins: PLUGINS.map((candidate) => (candidate.name === plugin.name ? { ...candidate, release } : candidate)),
        io,
      }),
    ),
    expected,
  );
  assert.deepEqual(calls, [], 'invalid release policy must fail before IO');
}

async function testGenericReleaseModuleContract(
  dispatchPluginRelease,
  runGenericPluginRelease,
  resolveGenericReleaseIo,
) {
  const ordinaryNames = ['docks', 'effect-kit', 'plan-lifecycle'];
  const ordinaryPlugins = ordinaryNames.map((name) => PLUGINS.find((plugin) => plugin.name === name));
  for (const plugin of ordinaryPlugins) {
    assert.ok(plugin, `missing ordinary plugin descriptor: ${plugin?.name}`);
    assert.deepEqual(Object.keys(plugin.release).sort(), ['install', 'kind']);
    assert.equal(plugin.release.kind, 'generic');
    assert.match(plugin.release.install, /\S/);
    assert.equal('install' in plugin, false, `${plugin.name} install text belongs only to its release policy`);

    const currentVersion = JSON.parse(
      fs.readFileSync(path.join(ROOT, plugin.root, '.claude-plugin/plugin.json'), 'utf8'),
    ).version;
    const fixture = genericReleaseIo(ROOT);
    await runGenericPluginRelease({
      argv: ['--dry-run', '--plugin', plugin.name, 'patch'],
      repo: ROOT,
      plugins: PLUGINS,
      io: fixture.io,
    });
    assert.ok(
      fixture.calls.some(
        ({ tool, args: callArgs }) =>
          tool === 'readJson' && callArgs[0] === `${plugin.root}/.claude-plugin/plugin.json`,
      ),
      `${plugin.name} must derive its current version from its own Claude manifest`,
    );
    assert.ok(
      fixture.calls.some(
        ({ tool, args: callArgs }) =>
          tool === 'node' &&
          callArgs[0] === path.join(ROOT, 'scripts/ci.mjs') &&
          callArgs.slice(1).join(' ') === `-q --plugin ${plugin.name}`,
      ),
      `${plugin.name} must run its selected plugin gate`,
    );
    assert.match(
      fixture.output.join('\n'),
      new RegExp(`Bumping ${plugin.name}: ${currentVersion.replaceAll('.', '\\.')} →`),
    );
    assert.equal(
      fixture.calls.some(({ tool }) =>
        ['writeJson', 'commit', 'push', 'createTag', 'waitForTagCi', 'createRelease'].includes(tool),
      ),
      false,
      `${plugin.name} dry-run must not invoke write, commit, push, tag, workflow, or GitHub Release IO`,
    );
  }

  const relay = PLUGINS.find(({ name }) => name === 'session-relay');
  assert.ok(relay, 'missing Session Relay descriptor');
  assert.deepEqual(Object.keys(relay.release).sort(), ['assets', 'install', 'kind', 'prereleaseBody']);
  assert.equal(relay.release.kind, 'reviewed-session-relay');
  assert.equal('install' in relay, false, 'Session Relay install text belongs only to its reviewed policy');

  const generic = ordinaryPlugins[0];
  await expectReleasePolicyRefusal(
    runGenericPluginRelease,
    generic,
    { kind: 'future-release-policy', install: generic.release.install },
    /unknown release policy kind/i,
  );
  await expectReleasePolicyRefusal(
    runGenericPluginRelease,
    generic,
    { ...generic.release, prepare() {} },
    /closed release policy|unexpected release policy field|executable callback/i,
  );
  await expectReleasePolicyRefusal(
    runGenericPluginRelease,
    generic,
    { ...generic.release, command: 'git push origin HEAD' },
    /closed release policy|unexpected release policy field|shell command/i,
  );
  await expectReleasePolicyRefusal(
    runGenericPluginRelease,
    generic,
    { kind: 'generic' },
    /install.*non-empty|missing.*install/i,
  );
  await expectReleasePolicyRefusal(
    runGenericPluginRelease,
    relay,
    relay.release,
    /Session Relay.*reviewed|positional.*Session Relay/i,
  );

  for (const { name, plugins, expected, argv = ['--prepare', '--plugin', relay.name, '0.16.1', '--dry-run'] } of [
    {
      name: 'malformed reviewed descriptor',
      plugins: PLUGINS.map((plugin) =>
        plugin.name === relay.name ? { ...plugin, release: { ...plugin.release, prepare() {} } } : plugin,
      ),
      expected: /closed release policy|unexpected release policy field/i,
    },
    {
      name: 'malformed unrelated descriptor',
      plugins: PLUGINS.map((plugin) =>
        plugin.name === generic.name
          ? { ...plugin, release: { kind: 'future-release-policy', install: plugin.release.install } }
          : plugin,
      ),
      expected: /unknown release policy kind/i,
    },
    {
      name: 'reviewed plugin assigned a generic policy',
      plugins: PLUGINS.map((plugin) =>
        plugin.name === relay.name
          ? { ...plugin, release: { kind: 'generic', install: plugin.release.install } }
          : plugin,
      ),
      expected: /unknown generic release option.*--prepare/i,
    },
    {
      name: 'duplicate plugin option hides a reviewed flag',
      plugins: PLUGINS.map((plugin) =>
        plugin.name === relay.name
          ? { ...plugin, release: { kind: 'generic', install: plugin.release.install } }
          : plugin,
      ),
      expected: /duplicate generic release option.*--plugin/i,
      argv: ['--plugin', relay.name, '--plugin', '--prepare', '0.16.1'],
    },
  ]) {
    let reviewedDispatchCalls = 0;
    await assert.rejects(
      dispatchPluginRelease({
        argv,
        repo: ROOT,
        plugins,
        io: genericReleaseIo(ROOT).io,
        dispatchReviewed: async () => {
          reviewedDispatchCalls += 1;
          return true;
        },
      }),
      expected,
      name,
    );
    assert.equal(reviewedDispatchCalls, 0, `${name} reached reviewed release dispatch`);
  }

  const fixtureIo = genericReleaseIo(ROOT);
  let fixtureDispatchCalls = 0;
  let reviewedDispatchCalls = 0;
  const fixtureResult = await dispatchPluginRelease({
    argv: ['--plugin', generic.name, 'patch'],
    repo: ROOT,
    plugins: PLUGINS,
    io: fixtureIo.io,
    dispatchFixture: async () => {
      fixtureDispatchCalls += 1;
      return true;
    },
    dispatchReviewed: async () => {
      reviewedDispatchCalls += 1;
      return true;
    },
  });
  assert.equal(fixtureResult, true);
  assert.equal(fixtureDispatchCalls, 1, 'fixture-only dispatcher did not intercept the simulated release');
  assert.equal(reviewedDispatchCalls, 0, 'generic fixture dispatch reached the reviewed dispatcher');
  assert.deepEqual(fixtureIo.calls, [], 'generic fixture dispatch reached production release IO');

  for (const [name, argv, expected] of [
    ['unknown default-plugin option in fixture mode', ['--unknown', 'patch'], /unknown.*--unknown/i],
    ['reviewed option without plugin selector in fixture mode', ['--prepare', '0.16.1'], /unknown.*--prepare/i],
    [
      'duplicate generic plugin option in fixture mode',
      ['--plugin', generic.name, '--plugin', ordinaryNames[1], 'patch'],
      /duplicate generic release option.*--plugin/i,
    ],
    ['unknown generic option in fixture mode', ['--plugin', generic.name, '--unknown', 'patch'], /unknown.*--unknown/i],
    ['missing generic version in fixture mode', ['--plugin', generic.name], /missing version/i],
    ['invalid generic version in fixture mode', ['--plugin', generic.name, 'nonsense'], /version must be/i],
    [
      'duplicate generic dry-run option in fixture mode',
      ['--dry-run', '--dry-run', '--plugin', generic.name, 'patch'],
      /duplicate generic release option.*--dry-run/i,
    ],
    [
      'reviewed option assigned to generic plugin in fixture mode',
      ['--prepare', '--plugin', generic.name, 'patch'],
      /unknown generic release option.*--prepare/i,
    ],
  ]) {
    const malformedFixtureIo = genericReleaseIo(ROOT);
    let malformedFixtureCalls = 0;
    await assert.rejects(
      dispatchPluginRelease({
        argv,
        repo: ROOT,
        plugins: PLUGINS,
        io: malformedFixtureIo.io,
        dispatchFixture: async () => {
          malformedFixtureCalls += 1;
          return true;
        },
        dispatchReviewed: async () => true,
      }),
      expected,
      name,
    );
    assert.equal(malformedFixtureCalls, 0, `${name} reached fixture dispatch`);
    assert.deepEqual(malformedFixtureIo.calls, [], `${name} reached production release IO`);

    const malformedDirectIo = genericReleaseIo(ROOT);
    await assert.rejects(
      runGenericPluginRelease({ argv, repo: ROOT, plugins: PLUGINS, io: malformedDirectIo.io }),
      expected,
      `${name} through direct generic dispatch`,
    );
    assert.deepEqual(malformedDirectIo.calls, [], `${name} reached direct generic release IO`);
  }

  let createdGenericIo = 0;
  const noFixtureIo = resolveGenericReleaseIo({
    fixtureConfigured: true,
    createIo: () => {
      createdGenericIo += 1;
      return fixtureIo.io;
    },
  });
  assert.equal(noFixtureIo, undefined, 'fixture mode retained a production generic IO adapter');
  assert.equal(createdGenericIo, 0, 'fixture mode constructed a production generic IO adapter');

  let declinedFixtureCalls = 0;
  let declinedReviewedCalls = 0;
  await assert.rejects(
    dispatchPluginRelease({
      argv: ['--plugin', generic.name, 'patch'],
      repo: ROOT,
      plugins: PLUGINS,
      io: noFixtureIo,
      dispatchFixture: async () => {
        declinedFixtureCalls += 1;
        return null;
      },
      dispatchReviewed: async () => {
        declinedReviewedCalls += 1;
        return true;
      },
    }),
    /generic release IO must be the exact closed adapter/i,
    'a missed fixture interception retained production release capability',
  );
  assert.equal(declinedFixtureCalls, 1);
  assert.equal(declinedReviewedCalls, 0);
  assert.equal(createdGenericIo, 0, 'a missed fixture interception reached production release IO');

  const successfulRelease = genericReleaseIo(ROOT);
  await runGenericPluginRelease({
    argv: ['--plugin', generic.name, 'patch'],
    repo: ROOT,
    plugins: PLUGINS,
    io: successfulRelease.io,
  });
  assert.ok(
    successfulRelease.calls.some(({ tool }) => tool === 'createRelease'),
    'an explicit green tag-CI result must authorize stable release creation',
  );

  for (const tagCiResult of [
    undefined,
    null,
    {},
    { ok: 'true', runId: 'fixture-tag-ci-run' },
    { ok: true },
    { ok: true, runId: '' },
    { ok: true, runId: 'fixture-tag-ci-run', extra: true },
  ]) {
    const malformed = genericReleaseIo(ROOT, { tagCiResult });
    await assert.rejects(
      runGenericPluginRelease({
        argv: ['--plugin', generic.name, 'patch'],
        repo: ROOT,
        plugins: PLUGINS,
        io: malformed.io,
      }),
      /tag CI.*explicit green|tag CI result.*malformed/i,
    );
    assert.ok(
      malformed.calls.some(({ tool }) => tool === 'waitForTagCi'),
      'the malformed-result case must reach the tag-CI gate',
    );
    assert.equal(
      malformed.calls.some(({ tool }) => ['readReleaseNotes', 'createRelease'].includes(tool)),
      false,
      'absent or malformed tag-CI results must refuse before release publication',
    );
  }
}

async function testDryRunReleaseSafety() {
  const {
    dispatchPluginRelease,
    resolveGenericReleaseIo,
    resolveReleaseFixtureConfiguration,
    runGenericPluginRelease,
  } = await import('../lib/plugin-release.mjs');
  assert.equal(typeof dispatchPluginRelease, 'function');
  assert.equal(typeof resolveGenericReleaseIo, 'function');
  assert.equal(typeof resolveReleaseFixtureConfiguration, 'function');
  assert.equal(typeof runGenericPluginRelease, 'function');
  assert.equal(resolveReleaseFixtureConfiguration({ fixturePath: undefined, reportPath: undefined }), false);
  assert.equal(resolveReleaseFixtureConfiguration({ fixturePath: '/fixture.json', reportPath: '/report.json' }), true);
  for (const [fixturePath, reportPath] of [
    ['', ''],
    ['', '/report.json'],
    ['/fixture.json', ''],
    [undefined, '/report.json'],
    ['/fixture.json', undefined],
  ]) {
    assert.throws(
      () => resolveReleaseFixtureConfiguration({ fixturePath, reportPath }),
      /fixture and report environment variables must both be non-empty/i,
    );
  }
  await testGenericReleaseModuleContract(dispatchPluginRelease, runGenericPluginRelease, resolveGenericReleaseIo);
  const emptyFixtureResult = spawnSync(
    process.execPath,
    ['scripts/release.mjs', '--prepare', '--plugin', 'session-relay', '0.16.0', '--dry-run'],
    {
      cwd: ROOT,
      encoding: 'utf8',
      env: {
        ...process.env,
        SESSION_RELAY_RELEASE_FIXTURE: '',
        SESSION_RELAY_RELEASE_REPORT: '',
      },
    },
  );
  assert.equal(emptyFixtureResult.status, 1, 'empty fixture capability reached a release lane');
  assert.match(emptyFixtureResult.stderr, /fixture and report environment variables must both be non-empty/i);
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
    assert.equal(
      calls.some(
        ({ tool, args: callArgs }) =>
          (tool === 'git' && ['add', 'commit', 'push', 'tag'].includes(callArgs[0])) ||
          (tool === 'claude' && callArgs[0] === 'plugin' && callArgs[1] === 'tag') ||
          (tool === 'gh' &&
            ((callArgs[0] === 'workflow' && callArgs[1] === 'run') ||
              (callArgs[0] === 'release' && ['create', 'edit', 'upload', 'delete'].includes(callArgs[1])))),
      ),
      false,
      'Docks dry-run must not invoke write, commit, push, tag, workflow, or GitHub Release mutation',
    );
    assert.deepEqual(gitSnapshot(), before);
    const ordinaryReleaseBytes = ['effect-kit', 'plan-lifecycle']
      .flatMap((name) => [`plugins/${name}/.claude-plugin/plugin.json`, `plugins/${name}/.codex-plugin/plugin.json`])
      .map((file) => fs.readFileSync(path.join(ROOT, file), 'base64'));
    for (const pluginName of ['effect-kit', 'plan-lifecycle']) {
      fs.writeFileSync(callLog, '', { mode: 0o600 });
      const pluginResult = spawnSync(
        process.execPath,
        ['scripts/release.mjs', '--dry-run', '--plugin', pluginName, 'patch'],
        {
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
        },
      );
      assert.equal(pluginResult.status, 0, `${pluginResult.stdout}\n${pluginResult.stderr}`);
      const pluginCalls = fs
        .readFileSync(callLog, 'utf8')
        .trim()
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line));
      assert.ok(
        pluginCalls.some(
          ({ tool, args: callArgs }) =>
            tool === 'node' &&
            callArgs[0] === path.join(ROOT, 'scripts/ci.mjs') &&
            callArgs.slice(1).join(' ') === `-q --plugin ${pluginName}`,
        ),
        `fixture must intercept and preserve the targeted ${pluginName} preflight`,
      );
      assert.equal(
        pluginCalls.some(
          ({ tool, args: callArgs }) =>
            (tool === 'git' && ['add', 'commit', 'push', 'tag'].includes(callArgs[0])) ||
            (tool === 'claude' && callArgs[0] === 'plugin' && callArgs[1] === 'tag') ||
            (tool === 'gh' &&
              ((callArgs[0] === 'workflow' && callArgs[1] === 'run') ||
                (callArgs[0] === 'release' && ['create', 'edit', 'upload', 'delete'].includes(callArgs[1])))),
        ),
        false,
        `${pluginName} dry-run must not invoke write, commit, push, tag, workflow, or GitHub Release mutation`,
      );
    }
    assert.deepEqual(
      ['effect-kit', 'plan-lifecycle']
        .flatMap((name) => [`plugins/${name}/.claude-plugin/plugin.json`, `plugins/${name}/.codex-plugin/plugin.json`])
        .map((file) => fs.readFileSync(path.join(ROOT, file), 'base64')),
      ordinaryReleaseBytes,
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
  validateTimingReport(path.resolve(args[1]), null, ['javascript quality']);
  console.log('full timing report and JavaScript-quality join passed');
  process.exit(0);
}
if (mode === '--background-output') {
  await testBackgroundOutputRetention();
  await testBackgroundTaskContracts();
  console.log('background task forwarding, ordering, failure retention, and duplicate rejection passed');
  process.exit(0);
}
if (mode === '--dry-run-release-safety') {
  await testDryRunReleaseSafety();
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

assert.deepEqual(names(resolveCiTargets(PLUGINS, null)), ['docks', 'session-relay', 'effect-kit', 'plan-lifecycle']);
assert.deepEqual(names(resolveCiTargets(PLUGINS, 'docks')), ['docks']);
assert.throws(
  () => resolveCiTargets(PLUGINS, 'unknown-plugin'),
  /unknown plugin.*docks, session-relay, effect-kit, plan-lifecycle/,
);
const laneShape = ({ name, targets, repoWide }) => ({
  name,
  targets: names(targets),
  repoWide,
});
assert.deepEqual(CI_LANES, ['repo', 'core', 'relay']);
assert.ok(Object.isFrozen(CI_LANES));
assert.deepEqual(
  PLUGINS.map(({ name, ciLane }) => ({ name, ciLane })),
  [
    { name: 'docks', ciLane: 'core' },
    { name: 'session-relay', ciLane: 'relay' },
    { name: 'effect-kit', ciLane: 'core' },
    { name: 'plan-lifecycle', ciLane: 'core' },
  ],
);
assert.deepEqual(laneShape(resolveCiLane(PLUGINS, 'repo')), {
  name: 'repo',
  targets: [],
  repoWide: true,
});
assert.deepEqual(laneShape(resolveCiLane(PLUGINS, 'core')), {
  name: 'core',
  targets: ['docks', 'effect-kit', 'plan-lifecycle'],
  repoWide: false,
});
assert.deepEqual(laneShape(resolveCiLane(PLUGINS, 'relay')), {
  name: 'relay',
  targets: ['session-relay'],
  repoWide: false,
});
assert.equal(
  [resolveCiLane(PLUGINS, 'repo'), resolveCiLane(PLUGINS, 'core'), resolveCiLane(PLUGINS, 'relay')].filter(
    ({ repoWide }) => repoWide,
  ).length,
  1,
  'exactly one shard may own the repo-wide checks, and it must be the always-on one',
);
const syntheticCorePlugin = {
  ...byName('effect-kit'),
  name: 'synthetic-core-plugin',
  root: 'plugins/synthetic-core-plugin',
  ciLane: 'core',
};
PLUGINS.push(syntheticCorePlugin);
try {
  assert.deepEqual(names(resolveCiLane(PLUGINS, 'core').targets), [
    'docks',
    'effect-kit',
    'plan-lifecycle',
    'synthetic-core-plugin',
  ]);
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
assert.throws(() => resolveCiLane(PLUGINS, 'unknown'), /unknown CI lane.*repo, core, relay/);
assert.throws(() => resolveCiLane(PLUGINS, 'toString'), /unknown CI lane.*repo, core, relay/);
assert.throws(() => resolveCiLane(PLUGINS, 'constructor'), /unknown CI lane.*repo, core, relay/);
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
  [['--lane', 'unknown'], /unknown CI lane.*repo, core, relay/],
  [['--lane', 'toString'], /unknown CI lane.*repo, core, relay/],
  [['--lane', 'constructor'], /unknown CI lane.*repo, core, relay/],
]) {
  const rejected = spawnSync(process.execPath, ['scripts/ci.mjs', ...invalidArgs], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  assert.equal(rejected.status, 2, `${invalidArgs.join(' ')}\n${rejected.stdout}\n${rejected.stderr}`);
  assert.match(rejected.stderr, diagnostic);
}
console.log('closed CI lane resolver and argument parser passed');

// ===================== pull-request shard selection =====================
// A pull request must run the shards its diff implicates plus the always-on
// repo-wide shard, and must fail OPEN to every shard whenever the diff could not
// be trusted to prove otherwise.
const shardsFor = (changedPaths, overrides = {}) =>
  resolveShardSelection({ eventName: 'pull_request', baseResolved: true, changedPaths, ...overrides });

// A single-plugin diff selects that plugin's shard plus repo-wide - and nothing
// else. Derived from the registry so a fifth plugin is covered without editing
// this list; the `deepEqual` is what makes a future edit that skips a changed
// plugin's shard fail here instead of on a release.
for (const plugin of PLUGINS) {
  const { lanes, reason } = shardsFor([`${plugin.root}/probe.txt`]);
  assert.equal(reason, 'diff-scoped', `${plugin.name}: a resolvable single-plugin diff must be scoped`);
  assert.deepEqual(
    lanes,
    CI_LANES.filter((lane) => lane === REPO_WIDE_LANE || lane === plugin.ciLane),
    `${plugin.name}: a diff touching only this plugin must select its shard plus repo-wide`,
  );
  assert.ok(lanes.includes(plugin.ciLane), `${plugin.name}: the shard that gates it must run`);
  assert.ok(lanes.includes(REPO_WIDE_LANE), `${plugin.name}: the repo-wide shard is unconditional`);
}
assert.deepEqual(shardsFor(['plugins/plan-lifecycle/test/selftest.mjs']).lanes, ['repo', 'core']);
assert.deepEqual(shardsFor(['plugins/session-relay/rust/src/main.rs']).lanes, ['repo', 'relay']);

// A multi-plugin diff selects each implicated shard.
assert.deepEqual(
  shardsFor(['plugins/plan-lifecycle/test/selftest.mjs', 'plugins/session-relay/rust/src/main.rs']).lanes,
  ['repo', 'core', 'relay'],
);
assert.deepEqual(shardsFor(['plugins/docks/skills/a.md', 'plugins/effect-kit/test/b.mjs']).lanes, ['repo', 'core']);

// Every fail-open path selects everything.
for (const [label, selection] of [
  ['a path outside every plugin root', shardsFor(['scripts/ci.mjs'])],
  ['the plugin root itself with a sibling outside it', shardsFor(['plugins/docks', 'pnpm-lock.yaml'])],
  ['a lockfile-only diff', shardsFor(['pnpm-lock.yaml'])],
  ['a workflow-only diff', shardsFor(['.github/workflows/ci.yml'])],
  ['a quoted or otherwise undecodable path', shardsFor(['"plugins/docks/\\303\\251.md"'])],
  ['an empty diff', shardsFor([])],
  ['a whitespace-only diff', shardsFor(['', '   '])],
  ['an unresolvable base', shardsFor(['plugins/docks/skills/a.md'], { baseResolved: false })],
  ['a missing base', shardsFor(['plugins/docks/skills/a.md'], { baseResolved: undefined })],
  ['a non-pull-request event', shardsFor(['plugins/docks/skills/a.md'], { eventName: 'push' })],
  ['a workflow_dispatch run', shardsFor([], { eventName: 'workflow_dispatch' })],
]) {
  assert.deepEqual(selection.lanes, ['repo', 'core', 'relay'], `${label} must fail open to every shard`);
  assert.notEqual(selection.reason, 'diff-scoped', `${label} must not report a positive determination`);
}
assert.equal(shardsFor(['plugins/docks-extra/x.md']).reason, 'path-outside-every-plugin-root:plugins/docks-extra/x.md');
assert.equal(shardsFor([], { baseResolved: false }).reason, 'base-sha-unresolved');
assert.equal(shardsFor([]).reason, 'empty-diff');

// The registry, not the workflow, decides coverage: a plugin added without a
// usable shard must fail here rather than ride in ungated.
assert.deepEqual(assertShardTopologyCoversRegistry(), ['repo', 'core', 'relay']);
for (const [label, broken] of [
  ['a plugin with no ciLane', { ...byName('effect-kit'), name: 'no-lane', root: 'plugins/no-lane', ciLane: undefined }],
  [
    'a plugin claiming the repo-wide shard',
    { ...byName('effect-kit'), name: 'greedy', root: 'plugins/greedy', ciLane: 'repo' },
  ],
  [
    'a plugin on an unknown shard',
    { ...byName('effect-kit'), name: 'stray', root: 'plugins/stray', ciLane: 'mutations' },
  ],
]) {
  if (broken.ciLane === undefined) delete broken.ciLane;
  PLUGINS.push(broken);
  try {
    assert.throws(() => assertShardTopologyCoversRegistry(), /ciLane|shard/, `${label} must break shard coverage`);
  } finally {
    assert.equal(PLUGINS.pop(), broken);
  }
}
console.log('pull-request shard selection and registry coverage passed');

// The resolver CLI is the only thing the workflow calls, so prove the fail-open
// property end to end through the CLI rather than through the library alone.
const shardCli = (cliArgs) => {
  const result = spawnSync(process.execPath, ['scripts/ci-target.mjs', 'shards', ...cliArgs], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  return JSON.parse(result.stdout);
};
const shardCliTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'docks-ci-shards-'));
try {
  const diffFile = path.join(shardCliTmp, 'changed.txt');
  fs.writeFileSync(diffFile, 'plugins/plan-lifecycle/test/selftest.mjs\n');
  assert.deepEqual(shardCli(['--changed-paths', diffFile]), { lanes: ['repo', 'core'], reason: 'diff-scoped' });
  assert.deepEqual(shardCli(['--unresolved']), { lanes: ['repo', 'core', 'relay'], reason: 'base-sha-unresolved' });
  // An unreadable diff file is a resolution failure, not evidence that a shard has
  // nothing to do: the CLI must still exit 0 and select everything.
  assert.deepEqual(shardCli(['--changed-paths', path.join(shardCliTmp, 'absent.txt')]), {
    lanes: ['repo', 'core', 'relay'],
    reason: 'resolution-error',
  });
  const githubOutput = path.join(shardCliTmp, 'github-output');
  const emitted = spawnSync(
    process.execPath,
    ['scripts/ci-target.mjs', 'shards', '--unresolved', '--github-output', githubOutput],
    { cwd: ROOT, encoding: 'utf8' },
  );
  assert.equal(emitted.status, 0, emitted.stderr);
  assert.equal(emitted.stdout, '');
  assert.equal(fs.readFileSync(githubOutput, 'utf8'), 'lanes=["repo","core","relay"]\nreason=base-sha-unresolved\n');
  for (const invalid of [[], ['--unresolved', '--changed-paths', diffFile], ['--changed-paths'], ['--bogus', 'x']]) {
    const rejected = spawnSync(process.execPath, ['scripts/ci-target.mjs', 'shards', ...invalid], {
      cwd: ROOT,
      encoding: 'utf8',
    });
    assert.equal(rejected.status, 2, `${invalid.join(' ')} must be rejected`);
  }
} finally {
  fs.rmSync(shardCliTmp, { recursive: true, force: true });
}
console.log('shard resolver CLI fail-open behaviour passed');
assert.deepEqual([...selectedAuthorChecks([byName('docks')])], ['idempotency', 'plan-reviewer']);
assert.deepEqual([...selectedAuthorChecks([byName('effect-kit')])], []);
assert.deepEqual([...selectedAuthorChecks([byName('plan-lifecycle')])], ['plan-reviewer']);
assert.deepEqual(
  [...selectedAuthorChecks([byName('docks'), byName('plan-lifecycle')])],
  ['idempotency', 'plan-reviewer'],
  'shared plan-reviewer ownership must dedupe on a joint selection',
);
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
    // The gate records hosted identity whenever GITHUB_ACTIONS is set, and this suite runs unfiltered
    // inside the hosted targeting-contracts job. Inheriting that marker would make the fixture report
    // a non-null `host` and fail the closed assertion below on every pull request, so scrub it here
    // exactly as the focused-selection probe does.
    const hostFreeEnv = { ...process.env };
    delete hostFreeEnv.GITHUB_ACTIONS;
    const targeted = spawnSync('node', ['scripts/ci.mjs', '--plugin', 'effect-kit', '--timings-json', timingPath], {
      cwd: ROOT,
      encoding: 'utf8',
      env: hostFreeEnv,
      timeout: 120_000,
    });
    assert.equal(targeted.status, 0, `${targeted.stdout}\n${targeted.stderr}`);
    assert.doesNotMatch(
      targeted.stdout,
      /skill-maintainer idempotency|plan review policy|plugin: docks|plugin: session-relay/,
    );
    assert.match(targeted.stdout, /plugin: effect-kit/);
    validateTimingReport(timingPath, 'effect-kit', ['javascript quality']);
    console.log('targeted CI timing report passed');

    // `host` is only populated under GitHub Actions, so prove it with an explicit synthetic
    // environment rather than leaving the field unexercised by every fixture.
    const hostedTimingPath = path.join(tmp, 'effect-kit-hosted-timings.json');
    const hostedEnv = {
      ...hostFreeEnv,
      GITHUB_ACTIONS: 'true',
      GITHUB_RUN_ID: '424242',
      GITHUB_RUN_ATTEMPT: '2',
      GITHUB_JOB: 'targeting-contracts',
      GITHUB_WORKFLOW: 'validate',
      RUNNER_OS: 'Linux',
      RUNNER_ARCH: 'X64',
    };
    const hosted = spawnSync('node', ['scripts/ci.mjs', '--plugin', 'effect-kit', '--timings-json', hostedTimingPath], {
      cwd: ROOT,
      encoding: 'utf8',
      env: hostedEnv,
      timeout: 120_000,
    });
    assert.equal(hosted.status, 0, `${hosted.stdout}\n${hosted.stderr}`);
    const hostedTiming = JSON.parse(fs.readFileSync(hostedTimingPath, 'utf8'));
    assert.deepEqual(hostedTiming.host, {
      run_id: '424242',
      run_attempt: '2',
      job: 'targeting-contracts',
      workflow: 'validate',
      runner_os: 'Linux',
      runner_arch: 'X64',
    });
    console.log('hosted CI timing identity passed');
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
assert.deepEqual(Object.keys(validation.jobs), [
  'resolve-shards',
  'validation-shards',
  'targeting-contracts',
  'validate',
]);
assert.deepEqual(validation.permissions, { contents: 'read' });
assert.deepEqual(validation.on.pull_request, { branches: ['main'] });
assert.deepEqual(validation.on.push, { tags: ['*--v*'] });
assert.ok(validation.on.workflow_dispatch !== undefined);
assert.doesNotMatch(validateWorkflow.text, /contents:\s*write/);
const HOSTED_TIMING_UPLOAD_ACTION = 'actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a';
assert.doesNotMatch(validateWorkflow.text.replaceAll(HOSTED_TIMING_UPLOAD_ACTION, ''), /actions\/[^\s]*artifact[^\s]*/);
for (const [jobName, job] of Object.entries(validation.jobs)) {
  const uploadSteps = job.steps.filter(({ uses }) => uses?.startsWith('actions/upload-artifact@'));
  assert.equal(uploadSteps.length, 1, `${jobName} must publish exactly one timing artifact`);
  const [uploadStep] = uploadSteps;
  assert.equal(uploadStep.name, 'publish hosted timing artifact');
  assert.equal(uploadStep.uses, HOSTED_TIMING_UPLOAD_ACTION);
  assert.match(uploadStep.if, /always\(\)/);
  assert.deepEqual(
    uploadStep.with.path
      .split('\n')
      .map((entry) => entry.trim())
      .filter(Boolean),
    ['${{ runner.temp }}/docks-hosted-timings.jsonl', '${{ runner.temp }}/docks-ci-timings.json'],
  );
}
for (const job of Object.values(validation.jobs)) {
  for (const cacheStep of job.steps.filter(({ name }) => name === 'cache pnpm store')) {
    assert.equal(cacheStep.id, 'pnpm-cache');
  }
  for (const cacheStep of job.steps.filter(({ name }) => name === 'cache Cargo dependencies and target outputs')) {
    assert.equal(cacheStep.id, 'cargo-cache');
  }
}

const shardJob = validation.jobs['validation-shards'];
assert.deepEqual(Object.keys(shardJob), ['name', 'if', 'needs', 'permissions', 'runs-on', 'strategy', 'steps']);
assert.equal(shardJob.name, `validation shard (\${{ matrix.lane }})`);
assert.equal(shardJob.if, "github.event_name == 'pull_request'");
assert.deepEqual(shardJob.needs, ['resolve-shards']);
assert.deepEqual(shardJob.permissions, { contents: 'read' });
assert.equal(shardJob['runs-on'], 'ubuntu-latest');
// The matrix must come from the resolver, never from a lane list written here: a
// static list is how a shard silently stops covering a plugin the registry added.
assert.deepEqual(shardJob.strategy, {
  'fail-fast': false,
  matrix: { lane: '${{ fromJSON(needs.resolve-shards.outputs.lanes) }}' },
});

// The resolver job. It owns the fail-open decision, so its shape is asserted here
// rather than left to the shard job that consumes it.
const resolverJob = validation.jobs['resolve-shards'];
assert.deepEqual(Object.keys(resolverJob), [
  'name',
  'if',
  'permissions',
  'runs-on',
  'timeout-minutes',
  'outputs',
  'steps',
]);
assert.equal(resolverJob.if, "github.event_name == 'pull_request'");
assert.deepEqual(resolverJob.permissions, { contents: 'read' });
assert.deepEqual(resolverJob.outputs, { lanes: '${{ steps.shards.outputs.lanes }}' });
const resolverStep = resolverJob.steps.find(({ id }) => id === 'shards');
assert.ok(resolverStep, 'the resolver job must expose a step whose outputs feed the matrix');
assert.deepEqual(resolverStep.env, {
  BASE_SHA: '${{ github.event.pull_request.base.sha }}',
  HEAD_SHA: '${{ github.sha }}',
});
// Both halves of the decision: a resolvable base narrows the matrix from the real
// diff, and every other path runs every shard.
assert.match(
  resolverStep.run,
  /git -c core\.quotePath=false diff --name-only "\$BASE_SHA\.\.\.\$HEAD_SHA" > "\$CHANGED"; then\n {2}node scripts\/ci-target\.mjs shards --event pull_request --changed-paths "\$CHANGED" --github-output "\$GITHUB_OUTPUT"\nelse\n {2}node scripts\/ci-target\.mjs shards --unresolved --github-output "\$GITHUB_OUTPUT"\nfi/,
);
assert.match(resolverStep.run, /FAIL OPEN TO THE FULL GATE, NEVER TO NOTHING/);
// checkout must reach the base commit, or every pull request fails open and the
// whole mechanism is dead weight.
assert.equal(resolverJob.steps[0].with['fetch-depth'], 0);
assert.equal(resolverJob.steps[0].with['persist-credentials'], false);
// The resolver runs no gate, so it must not carry the gate's setup cost.
assert.deepEqual(
  resolverJob.steps.map((row) => row.name ?? row.uses),
  [
    'actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd',
    'setup Node 24',
    'start hosted step timing',
    'resolve validation shards from the pull request diff',
    'publish hosted timing artifact',
  ],
);
const shardSteps = shardJob.steps;
const shardStep = (name) => shardSteps.find((row) => row.name?.startsWith(name));
function assertDelegatedCgroupRun(run) {
  assert.match(
    run,
    /CURRENT_CGROUP=[\s\S]*done < \/proc\/self\/cgroup[\s\S]*CGROUP="\/sys\/fs\/cgroup\$\{CURRENT_CGROUP%\/\}\/session-relay-test-/,
  );
  assert.match(
    run,
    /sudo -n mkdir "\$CGROUP"[\s\S]*trap cleanup EXIT[\s\S]*sudo -n chown "\$\(id -u\):\$\(id -g\)" "\$CGROUP"[\s\S]*cgroup\.procs" "\$CGROUP\/cgroup\.threads" "\$CGROUP\/cgroup\.subtree_control"/,
  );
  assert.match(
    run,
    /test_pid=\$BASHPID[\s\S]*tee "\$CGROUP\/cgroup\.procs"[\s\S]*SESSION_RELAY_TEST_CGROUP_ROOT="\$CGROUP"/,
  );
  assert.match(
    run,
    /cleanup\(\)[\s\S]*for _ in \{1\.\.100\}[\s\S]*if ! grep -qx 'populated 0' "\$CGROUP\/cgroup\.events"[\s\S]*leaked live processes[\s\S]*status=1[\s\S]*cgroup\.kill[\s\S]*if ! grep -qx 'populated 0' "\$CGROUP\/cgroup\.events" \|\| ! sudo -n rmdir "\$CGROUP"[\s\S]*status=1/,
  );
}
assert.deepEqual(
  shardSteps.map((row) => row.name ?? row.uses),
  [
    'actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd',
    'setup Node 24',
    'start hosted step timing',
    'enable corepack',
    'configure deterministic pnpm store',
    'cache pnpm store',
    'cache Cargo dependencies and target outputs',
    'mark hosted cache restore',
    'install pnpm dependencies (--frozen-lockfile; yaml + lockfile-pinned claude-code)',
    'verify registry signatures (non-blocking)',
    'materialize claude-code binary (allowBuilds denies it by default)',
    'add node_modules/.bin to PATH (so ci.mjs finds the pinned claude)',
    'provision Rust 1.85.0 with musl for the session-relay host leg',
    'run validation lane',
    'publish hosted timing artifact',
  ],
);
for (const name of [
  'enable corepack',
  'start hosted step timing',
  'configure deterministic pnpm store',
  'cache pnpm store',
  'mark hosted cache restore',
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
    .filter(
      (row) =>
        row.if === undefined || row.if === 'always()' || (row.if === "matrix.lane == 'relay'" && lane === 'relay'),
    )
    .map((row) => row.name ?? 'checkout');
assert.deepEqual(shardStepsForLane('core'), [
  'checkout',
  'setup Node 24',
  'start hosted step timing',
  'enable corepack',
  'configure deterministic pnpm store',
  'cache pnpm store',
  'mark hosted cache restore',
  'install pnpm dependencies (--frozen-lockfile; yaml + lockfile-pinned claude-code)',
  'verify registry signatures (non-blocking)',
  'materialize claude-code binary (allowBuilds denies it by default)',
  'add node_modules/.bin to PATH (so ci.mjs finds the pinned claude)',
  'run validation lane',
  'publish hosted timing artifact',
]);
assert.deepEqual(shardStepsForLane('relay'), [
  'checkout',
  'setup Node 24',
  'start hosted step timing',
  'enable corepack',
  'configure deterministic pnpm store',
  'cache pnpm store',
  'cache Cargo dependencies and target outputs',
  'mark hosted cache restore',
  'install pnpm dependencies (--frozen-lockfile; yaml + lockfile-pinned claude-code)',
  'verify registry signatures (non-blocking)',
  'materialize claude-code binary (allowBuilds denies it by default)',
  'add node_modules/.bin to PATH (so ci.mjs finds the pinned claude)',
  'provision Rust 1.85.0 with musl for the session-relay host leg',
  'run validation lane',
  'publish hosted timing artifact',
]);
assert.equal(shardSteps[0].with['persist-credentials'], false);
assert.equal(shardStep('setup Node 24').with['node-version'], '24');
const shardGateRun = shardStep('run validation lane').run;
assert.match(
  shardGateRun,
  /if \[ "\$\{\{ matrix\.lane \}\}" != "relay" \]; then[\s\S]*node scripts\/ci\.mjs --lane "\$\{\{ matrix\.lane \}\}"[\s\S]*exit/,
);
assertDelegatedCgroupRun(shardGateRun);
assert.match(
  shardGateRun,
  /SESSION_RELAY_TEST_CGROUP_ROOT="\$CGROUP" node scripts\/ci\.mjs --lane "\$\{\{ matrix\.lane \}\}"/,
);

const targetingJob = validation.jobs['targeting-contracts'];
assert.deepEqual(Object.keys(targetingJob), ['name', 'if', 'permissions', 'runs-on', 'timeout-minutes', 'steps']);
assert.equal(targetingJob.name, 'CI plugin-targeting contracts');
assert.equal(targetingJob.if, "github.event_name != 'push'");
assert.deepEqual(targetingJob.permissions, { contents: 'read' });
assert.equal(targetingJob['runs-on'], 'ubuntu-latest');
assert.equal(targetingJob['timeout-minutes'], 10);
const targetingSteps = targetingJob.steps;
const targetingStep = (name) => targetingSteps.find((row) => row.name?.startsWith(name));
assert.deepEqual(
  targetingSteps.map((row) => row.name ?? row.uses),
  [
    'actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd',
    'setup Node 24',
    'start hosted step timing',
    'enable corepack',
    'configure deterministic pnpm store',
    'cache pnpm store',
    'mark hosted cache restore',
    'install pnpm dependencies (--frozen-lockfile; yaml + lockfile-pinned claude-code)',
    'verify registry signatures (non-blocking)',
    'materialize claude-code binary (allowBuilds denies it by default)',
    'add node_modules/.bin to PATH (so ci.mjs finds the pinned claude)',
    'run non-unit plugin-targeting contracts',
    'publish hosted timing artifact',
  ],
);
for (const name of [
  'setup Node 24',
  'enable corepack',
  'configure deterministic pnpm store',
  'cache pnpm store',
  'install pnpm dependencies',
  'verify registry signatures',
  'materialize claude-code binary',
  'add node_modules/.bin to PATH',
]) {
  assert.deepEqual(targetingStep(name), shardStep(name), `${name}: targeting-contract setup drifted from shard setup`);
}
for (const name of ['start hosted step timing', 'mark hosted cache restore']) {
  assert.ok(shardStep(name), `${name} must exist in validation-shards`);
  assert.ok(targetingStep(name), `${name} must exist in targeting-contracts`);
}
assert.match(shardStep('mark hosted cache restore').run, /steps\.cargo-cache\.outputs\.cache-hit/);
assert.doesNotMatch(targetingStep('mark hosted cache restore').run, /steps\.cargo-cache\.outputs\.cache-hit/);
assert.deepEqual(targetingSteps[0], shardSteps[0]);
assert.deepEqual(targetingStep('run non-unit plugin-targeting contracts'), {
  name: 'run non-unit plugin-targeting contracts',
  run:
    `node scripts/tests/ci-plugin-targeting.mjs\n` +
    `printf '{"step":"run non-unit plugin-targeting contracts","at_ms":%s}\\n'` +
    ` "$(date +%s%3N)" >> "$RUNNER_TEMP/docks-hosted-timings.jsonl"\n`,
});

const validateJob = validation.jobs.validate;
assert.deepEqual(Object.keys(validateJob), ['name', 'runs-on', 'needs', 'if', 'steps']);
assert.equal(validateJob.name, 'validate (scripts/ci.mjs)');
assert.deepEqual(validateJob.needs, ['validation-shards', 'targeting-contracts', 'resolve-shards']);
assert.equal(validateJob.if, 'always()');
const steps = validateWorkflow.value.jobs.validate.steps;
const step = (name) => steps.find((row) => row.name?.startsWith(name));
assert.deepEqual(
  steps.map((row) => row.name ?? row.uses),
  [
    'actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd',
    'setup Node 24',
    'resolve CI target',
    'start hosted step timing',
    'enable corepack',
    'configure deterministic pnpm store',
    'cache pnpm store',
    'cache Cargo dependencies and target outputs',
    'mark hosted cache restore',
    'install pnpm dependencies (--frozen-lockfile; yaml + lockfile-pinned claude-code)',
    'verify registry signatures (non-blocking)',
    'materialize claude-code binary (allowBuilds denies it by default)',
    'add node_modules/.bin to PATH (so ci.mjs finds the pinned claude)',
    'provision Rust 1.85.0 with musl for the session-relay host leg',
    'run the authoritative gate (scripts/ci.mjs)',
    'publish hosted timing artifact',
    'assert successful prerequisite jobs',
  ],
);
const nonPullRequestCondition = "github.event_name != 'pull_request'";
const pushCondition = "github.event_name == 'push'";
const pullRequestCondition = "github.event_name == 'pull_request'";
const nonPullRequestRustCondition =
  "github.event_name != 'pull_request' && (github.event_name != 'push' || steps.target.outputs.needs_rust == 'true')";
const hostedTimingPublishCondition = "always() && github.event_name != 'pull_request'";
const validateStepLabel = (row) => row.name ?? 'checkout';
assert.deepEqual(Object.fromEntries(steps.map((row) => [validateStepLabel(row), row.if])), {
  checkout: nonPullRequestCondition,
  'setup Node 24': nonPullRequestCondition,
  'resolve CI target': pushCondition,
  'start hosted step timing': nonPullRequestCondition,
  'enable corepack': nonPullRequestCondition,
  'configure deterministic pnpm store': nonPullRequestCondition,
  'cache pnpm store': nonPullRequestCondition,
  'cache Cargo dependencies and target outputs': nonPullRequestRustCondition,
  'mark hosted cache restore': nonPullRequestCondition,
  'install pnpm dependencies (--frozen-lockfile; yaml + lockfile-pinned claude-code)': nonPullRequestCondition,
  'verify registry signatures (non-blocking)': nonPullRequestCondition,
  'materialize claude-code binary (allowBuilds denies it by default)': nonPullRequestCondition,
  'add node_modules/.bin to PATH (so ci.mjs finds the pinned claude)': nonPullRequestCondition,
  'provision Rust 1.85.0 with musl for the session-relay host leg': nonPullRequestRustCondition,
  'run the authoritative gate (scripts/ci.mjs)': nonPullRequestCondition,
  'assert successful prerequisite jobs': undefined,
  'publish hosted timing artifact': hostedTimingPublishCondition,
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
        case hostedTimingPublishCondition:
          return eventName !== 'pull_request';
        case undefined:
          return true;
        default:
          throw new Error(`unexpected validate condition for ${validateStepLabel(row)}: ${row.if}`);
      }
    })
    .map(validateStepLabel);
}
const fullValidateInventory = [
  'checkout',
  'setup Node 24',
  'start hosted step timing',
  'enable corepack',
  'configure deterministic pnpm store',
  'cache pnpm store',
  'cache Cargo dependencies and target outputs',
  'mark hosted cache restore',
  'install pnpm dependencies (--frozen-lockfile; yaml + lockfile-pinned claude-code)',
  'verify registry signatures (non-blocking)',
  'materialize claude-code binary (allowBuilds denies it by default)',
  'add node_modules/.bin to PATH (so ci.mjs finds the pinned claude)',
  'provision Rust 1.85.0 with musl for the session-relay host leg',
  'run the authoritative gate (scripts/ci.mjs)',
  'publish hosted timing artifact',
  'assert successful prerequisite jobs',
];
assert.deepEqual(effectiveValidateInventory('pull_request'), ['assert successful prerequisite jobs']);
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
  'start hosted step timing',
  'enable corepack',
  'configure deterministic pnpm store',
  'cache pnpm store',
  'mark hosted cache restore',
  'install pnpm dependencies (--frozen-lockfile; yaml + lockfile-pinned claude-code)',
  'verify registry signatures (non-blocking)',
  'materialize claude-code binary (allowBuilds denies it by default)',
  'add node_modules/.bin to PATH (so ci.mjs finds the pinned claude)',
  'run the authoritative gate (scripts/ci.mjs)',
  'publish hosted timing artifact',
  'assert successful prerequisite jobs',
]);
assert.equal(step('resolve CI target').if, "github.event_name == 'push'");
assert.match(step('resolve CI target').run, /scripts\/ci-target\.mjs release-tag/);
assert.equal(step('provision Rust 1.85.0 with musl for the session-relay host leg').if, nonPullRequestRustCondition);
const authoritativeGateRun = step('run the authoritative gate').run;
assert.match(
  authoritativeGateRun,
  /if \[ "\$\{\{ github\.event_name \}\}" = "push" \] && \[ "\$\{\{ steps\.target\.outputs\.needs_rust \}\}" != "true" \]; then/,
);
assertDelegatedCgroupRun(authoritativeGateRun);
assert.match(
  authoritativeGateRun,
  /SESSION_RELAY_TEST_CGROUP_ROOT="\$CGROUP"[\s\\]*node scripts\/ci\.mjs --plugin "\$\{\{ steps\.target\.outputs\.plugin \}\}"/,
);
assert.match(
  authoritativeGateRun,
  /SESSION_RELAY_TEST_CGROUP_ROOT="\$CGROUP"[\s\\]*node scripts\/ci\.mjs[\s\\]*--timings-json "\$RUNNER_TEMP\/docks-ci-timings\.json"/,
);
const signatureAudit = step('verify registry signatures (non-blocking)');
assert.deepEqual(
  signatureAudit.run,
  `status=0\n` +
    `npm audit signatures || status=$?\n` +
    `printf '{"step":"verify registry signatures (non-blocking)","at_ms":%s}\\n'` +
    ` "$(date +%s%3N)" >> "$RUNNER_TEMP/docks-hosted-timings.jsonl"\n` +
    `exit "$status"\n`,
);
assert.equal(signatureAudit['continue-on-error'], true);
const setupNode = steps.find((row) => typeof row.uses === 'string' && row.uses.startsWith('actions/setup-node@'));
assert.ok(setupNode);
assert.equal(setupNode.with['node-version'], '24');
assert.ok(steps.indexOf(step('resolve CI target')) < steps.indexOf(step('cache pnpm store')));
const pnpmCache = step('cache pnpm store');
assert.equal(pnpmCache.id, 'pnpm-cache');
assert.equal(pnpmCache.with.path, '~/.pnpm-store');
assert.match(pnpmCache.with.key, /runner\.os.*runner\.arch.*hashFiles\('pnpm-lock\.yaml', 'package\.json'\)/);
assert.match(pnpmCache.with['restore-keys'], /pnpm-v11-.*runner\.os.*runner\.arch/);
const cargoCache = step('cache Cargo dependencies and target outputs');
assert.equal(cargoCache.id, 'cargo-cache');
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
const prerequisiteAssertion = step('assert successful prerequisite jobs');
assert.equal(steps.at(-3), authoritativeGate);
assert.equal(steps.at(-2).name, 'publish hosted timing artifact');
assert.equal(steps.at(-1), prerequisiteAssertion);
assert.deepEqual(Object.keys(prerequisiteAssertion), ['name', 'env', 'run']);
assert.deepEqual(prerequisiteAssertion.env, {
  VALIDATION_SHARDS_RESULT: `\${{ needs.validation-shards.result }}`,
  TARGETING_CONTRACTS_RESULT: `\${{ needs.targeting-contracts.result }}`,
  RESOLVE_SHARDS_RESULT: `\${{ needs.resolve-shards.result }}`,
});
assert.equal(
  prerequisiteAssertion.run,
  'status=0\n' +
    'if [ "$VALIDATION_SHARDS_RESULT" = "failure" ] || [ "$VALIDATION_SHARDS_RESULT" = "cancelled" ]; then\n' +
    '  echo "validation shards result: $VALIDATION_SHARDS_RESULT" >&2\n' +
    '  status=1\n' +
    'fi\n' +
    'if [ "$TARGETING_CONTRACTS_RESULT" = "failure" ] || [ "$TARGETING_CONTRACTS_RESULT" = "cancelled" ]; then\n' +
    '  echo "targeting contracts result: $TARGETING_CONTRACTS_RESULT" >&2\n' +
    '  status=1\n' +
    'fi\n' +
    'if [ "$RESOLVE_SHARDS_RESULT" = "failure" ] || [ "$RESOLVE_SHARDS_RESULT" = "cancelled" ]; then\n' +
    '  echo "shard resolution result: $RESOLVE_SHARDS_RESULT" >&2\n' +
    '  status=1\n' +
    'fi\n' +
    'exit "$status"\n',
);
const prerequisiteResultsPass = (...results) => results.every((result) => !['failure', 'cancelled'].includes(result));
assert.equal(prerequisiteResultsPass('success', 'success', 'success'), true);
assert.equal(prerequisiteResultsPass('skipped', 'success', 'skipped'), true);
assert.equal(prerequisiteResultsPass('skipped', 'skipped', 'skipped'), true);
assert.equal(prerequisiteResultsPass('success', 'failure', 'success'), false);
assert.equal(prerequisiteResultsPass('cancelled', 'success', 'success'), false);
// The hole this branch closes: a resolver that failed skips every shard, and a
// skipped shard job on its own reads as a pass.
assert.equal(prerequisiteResultsPass('skipped', 'success', 'failure'), false);

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
// Three legs as of Session Relay 0.16.0: `x86_64-apple-darwin` was retired from the current
// release lane, so the matrix and this census move together. A retained historical receipt still
// names four targets; that capability lives in the release validators, not in this workflow scan.
assert.equal(matrix.length, 3);
assert.equal(new Set(matrix.map((row) => row.target)).size, 3);
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
