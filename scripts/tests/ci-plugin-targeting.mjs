#!/usr/bin/env node
import assert from 'node:assert/strict';
import { execFile, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { parseDocument } from 'yaml';
import { startTask } from '../lib/ci-background-task.mjs';
import {
  assertAuthoritativeGateCoversReleasedBytes,
  assertPluginTreesAreRegistered,
  assertPrerequisiteJoinGatesItsEvent,
  assertShardTopologyCoversRegistry,
  CI_LANES,
  extractPrerequisiteAssertion,
  PREREQUISITE_REQUIRED_RESULTS,
  parseReleaseTag,
  REPO_WIDE_LANE,
  releaseCiArgs,
  resolveCiLane,
  resolveCiTargets,
  resolveShardSelection,
  runPrerequisiteAssertion,
  selectedAuthorChecks,
  workflowCiSelection,
} from '../lib/ci-targeting.mjs';
import { createGenericPluginReleaseIo } from '../lib/plugin-release.mjs';
import { PLUGINS, REPO_WIDE_JAVASCRIPT_QUALITY } from '../lib/plugins.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const GENERIC_RELEASE_IO_KEYS = Object.freeze(
  Object.keys(createGenericPluginReleaseIo({ repo: ROOT, plugins: PLUGINS })).sort(),
);
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
const execFileAsync = promisify(execFile);

async function execFileResult(file, fileArgs, options) {
  try {
    const { stdout, stderr } = await execFileAsync(file, fileArgs, options);
    return { status: 0, signal: null, stdout, stderr };
  } catch (error) {
    return {
      status: Number.isInteger(error.code) ? error.code : null,
      signal: error.signal ?? null,
      stdout: error.stdout ?? '',
      stderr: error.stderr ?? error.message,
    };
  }
}

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
  const bunShim = path.join(fixtureRoot, 'bun');
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
      bunShim,
      `#!${process.execPath}
import fs from 'node:fs';
fs.appendFileSync(process.env.DOCKS_BACKGROUND_TASK_LOG, JSON.stringify({ command: 'bun', args: process.argv.slice(2) }) + '\\n');
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
    const bunTask = startTask('bun-shaped task', bunShim, ['run', 'check:js'], options);
    assert.deepEqual(
      tasks.map((task) => task.name),
      ['node-shaped task', 'bun-shaped task'],
    );
    const artifactCount = fs.readdirSync(artifactRoot).length;
    assert.throws(
      () => startTask('node-shaped task', process.execPath, ['-e', 'process.exit(0)'], options),
      /duplicate task name: node-shaped task/,
    );
    assert.equal(fs.readdirSync(artifactRoot).length, artifactCount, 'duplicate rejection must happen before spawn');
    assert.deepEqual(await Promise.all([nodeTask, bunTask]), [true, true]);
    assert.deepEqual(
      tasks.map(({ name, status }) => ({ name, status })),
      [
        { name: 'node-shaped task', status: 'passed' },
        { name: 'bun-shaped task', status: 'passed' },
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
        { command: 'bun', args: ['run', 'check:js'] },
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
      ['node-shaped task', 'bun-shaped task', 'missing command task'],
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
    // The shim passes nested `node` argv through with the real PATH, so a Node child can reach
    // real git outside the call log. Objects are the one write such a child could make that
    // neither status nor refs would show, so the safety claim has to count them too.
    objects: run(['count-objects', '-v']),
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
// Only the three read-only invocations the dry run is allowed to make reach real git, matched
// argument for argument. A looser match keyed on the subcommand alone would let a mutating
// form such as \`hash-object -w\` through the harness that exists to prove nothing mutates.
const readOnlyGit = [
  ['status', '--porcelain'],
  ['hash-object', '--path', null, '--stdin'],
  ['rev-parse', '--quiet', '--verify', null],
];
const passThroughGit =
  tool === 'git' &&
  readOnlyGit.some(
    (shape) =>
      shape.length === args.length && shape.every((token, index) => token === null || token === args[index]),
  ) &&
  !args.includes('-w');
if (tool === 'node' || passThroughGit) {
  const command = tool === 'node' ? process.env.DOCKS_RELEASE_REAL_NODE : tool;
  const child = spawnSync(command, args, {
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
import path from 'node:path';
const tool = ${JSON.stringify(name)};
const args = process.argv.slice(2);
fs.appendFileSync(process.env.DOCKS_CI_PROBE_LOG, JSON.stringify({ tool, args }) + '\\n');
if (tool === 'claude') process.stdout.write('Validation passed\\n');
// The scorer stub must emit a row per scorable skill directory, because gateSkills now
// corroborates the row count against the tree on disk. Enumerated here rather than listed so
// adding a skill cannot silently turn this probe into a short-set failure; the short-set and
// empty-set behaviour of that corroboration is owned by scripts/tests/unit/skill-score-vacuity.test.mjs.
if (tool === 'node' && args[0] === 'plugins/docks/skills/productivity/write-skill/scripts/skill-guard.mjs' && args[1] === 'score') {
  const skillRoot = args.at(-1);
  const rows = [];
  for (const category of fs.readdirSync(skillRoot).sort()) {
    const cp = path.join(skillRoot, category);
    if (!fs.statSync(cp).isDirectory()) continue;
    for (const skill of fs.readdirSync(cp).sort()) {
      const dir = path.join(cp, skill);
      if (!fs.statSync(dir).isDirectory()) continue;
      if (!fs.existsSync(path.join(dir, 'SKILL.md'))) continue;
      rows.push(\`\${category}/\${skill} 14\`);
    }
  }
  if (rows.length) process.stdout.write(\`\${rows.join('\\n')}\\n\`);
}
if (tool === 'node' && args[0] === 'scripts/agents/score.mjs' && args[1] === '--per-file') {
  process.stdout.write('code-reviewer.md 14\\nplan-reviewer.md 14\\n');
}
if (tool === 'node' && args[0] === 'scripts/config/read-floor.mjs') process.stdout.write('10\\n');
process.exit(0);
`;
  fs.writeFileSync(path.join(directory, name), script, { mode: 0o755 });
}

// `check:js` is what the untargeted gate runs, so it is the definition of "every
// JavaScript path this repo format- and lint-checks". Lane mode never runs it: it
// unions per-plugin scoped paths instead, so a path in `check:js` that no lane
// schedules is checked by no pull request. Parsed rather than restated, so a path
// added to the script later is covered here without anyone remembering to add it.
function parseCheckJsBiomeInvocations() {
  const script = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).scripts?.['check:js'];
  assert.equal(typeof script, 'string', 'package.json must declare scripts["check:js"]');
  const invocations = new Map();
  for (const segment of script.split('&&')) {
    const tokens = segment.trim().split(/\s+/).filter(Boolean);
    assert.equal(tokens[0], 'biome', `check:js segment must invoke biome directly: ${segment.trim()}`);
    const [, subcommand, ...paths] = tokens;
    // A flag can silently narrow what a path argument means (`--files-ignore-unknown`,
    // a `--changed` diff scope), and this contract compares path sets. Refuse to guess.
    for (const token of [subcommand, ...paths]) {
      assert.ok(!token.startsWith('-'), `check:js passes unsupported flag ${token}; teach this parser first`);
    }
    assert.ok(paths.length > 0, `check:js biome ${subcommand} checks no paths`);
    const existing = invocations.get(subcommand) ?? new Set();
    for (const value of paths) existing.add(value);
    invocations.set(subcommand, existing);
  }
  assert.ok(invocations.size > 0, 'check:js declares no biome invocations');
  return invocations;
}

// The union of the biome argv every lane actually schedules, keyed by subcommand.
function laneBiomeInvocations(callsByLane) {
  assert.deepEqual(
    [...callsByLane.keys()].sort(),
    [...CI_LANES].sort(),
    'the biome ownership contract must observe every lane, or an unobserved lane could own nothing',
  );
  const invocations = new Map();
  for (const calls of callsByLane.values()) {
    for (const { tool, args: callArgs } of calls) {
      if (tool !== 'bun' || callArgs[0] !== 'run' || callArgs[1] !== 'biome') continue;
      const [, , subcommand, ...paths] = callArgs;
      const existing = invocations.get(subcommand) ?? new Set();
      for (const value of paths) existing.add(value);
      invocations.set(subcommand, existing);
    }
  }
  return invocations;
}

async function testFocusedCiCommandSelection() {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'docks-ci-command-selection-'));

  const probeEnv = { ...process.env };
  delete probeEnv.GITHUB_ACTIONS;
  const run = async (name, ciArgs, { timings = false } = {}) => {
    const scenarioRoot = fs.mkdtempSync(path.join(fixtureRoot, `${name}-`));
    const shimDir = path.join(scenarioRoot, 'bin');
    const callLog = path.join(scenarioRoot, 'calls.jsonl');
    const timingPath = timings ? path.join(scenarioRoot, 'timings.json') : null;
    fs.mkdirSync(shimDir, { mode: 0o700 });
    fs.writeFileSync(callLog, '', { mode: 0o600 });
    for (const tool of ['node', 'bun', 'claude', 'shellcheck']) writeCiProbeShim(shimDir, tool);

    const result = await execFileResult(
      process.execPath,
      ['scripts/ci.mjs', ...ciArgs, ...(timingPath === null ? [] : ['--timings-json', timingPath])],
      {
        cwd: ROOT,
        encoding: 'utf8',
        timeout: 120_000,
        env: {
          ...probeEnv,
          PATH: `${shimDir}${path.delimiter}${process.env.PATH ?? ''}`,
          DOCKS_CI_PROBE_LOG: callLog,
        },
      },
    );
    const contents = fs.readFileSync(callLog, 'utf8').trim();
    return {
      result,
      calls: contents === '' ? [] : contents.split('\n').map((line) => JSON.parse(line)),
      timingPath,
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
  const effectKitBiomeCiArgv = ['run', 'biome', 'ci', 'plugins/effect-kit/test'];
  const coreBiomeCiArgv = [
    'run',
    'biome',
    'ci',
    'scripts',
    'plugins/docks/hooks',
    'plugins/effect-kit/test',
    'plugins/plan-lifecycle/test',
  ];
  const docksBiomeLintArgv = ['run', 'biome', 'lint', 'plugins/docks/skills/productivity/write-skill/scripts'];
  const coreBiomeLintArgv = [
    'run',
    'biome',
    'lint',
    'plugins/docks/skills/productivity/write-skill/scripts',
    'plugins/plan-lifecycle/skills/productivity/plan-manager/scripts',
  ];
  // The repo lane owns exactly the paths no plugin claims. Derived from the registry so
  // this stays a statement about ownership rather than about a pasted argv.
  const repoBiomeCiArgv = ['run', 'biome', 'ci', ...REPO_WIDE_JAVASCRIPT_QUALITY.ci];

  try {
    const [targeted, untargeted, docksTargeted, core, timedCore, repoWide, full] = await Promise.all([
      run('targeted-', ['--plugin', 'effect-kit']),
      run('untargeted-', []),
      run('docks-targeted-', ['--plugin', 'docks']),
      run('core-', ['--lane', 'core']),
      run('timed-core-', ['--lane', 'core'], { timings: true }),
      run('repo-', ['--lane', 'repo'], { timings: true }),
      run('timed-full-', [], { timings: true }),
    ]);
    assert.equal(targeted.result.status, 0, `${targeted.result.stdout}\n${targeted.result.stderr}`);
    for (const script of repoWideCommands) {
      assert.equal(
        invokesNode(targeted.calls, script),
        false,
        `targeted CI must not invoke repo-wide command ${script}`,
      );
    }
    assert.equal(countToolInvocation(targeted.calls, 'bun', effectKitBiomeCiArgv), 1);
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
    assert.equal(countToolInvocation(targeted.calls, 'bun', ['run', 'check:js']), 0);

    const planCliArgv = ['scripts/tests/plan-cli.mjs'];
    const boundedWorkflowArgv = ['scripts/tests/plan-skill-phases.mjs', '--case', 'bounded-workflows'];
    const templateCaseArgv = ['scripts/tests/plan-skill-phases.mjs', '--case', 'plan-workspace-template'];
    const crossPluginCollisionArgv = [
      'tests/skill-trigger-collision.mjs',
      'plugins/docks/skills',
      'plugins/effect-kit/skills',
    ];
    const planLifecycleCollisionArgv = ['tests/skill-trigger-collision.mjs', 'plugins/plan-lifecycle/skills'];

    assert.equal(
      countToolInvocation(targeted.calls, 'node', crossPluginCollisionArgv),
      1,
      'an Effect Kit target must retain the joint Docks/Effect trigger-collision contract',
    );
    assert.equal(countToolInvocation(targeted.calls, 'node', planCliArgv), 0);

    for (const [ciArgs, selected] of [
      [[], untargeted],
      [['--plugin', 'docks'], docksTargeted],
    ]) {
      assert.equal(selected.result.status, 0, `${selected.result.stdout}\n${selected.result.stderr}`);
      assert.equal(
        countToolInvocation(selected.calls, 'node', planCliArgv),
        1,
        `${ciArgs.length === 0 ? 'full' : 'Docks-targeted'} CI must run the plan CLI contract once`,
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
        assert.equal(countToolInvocation(selected.calls, 'bun', ['run', 'check:js']), 1);
      } else {
        assert.equal(countToolInvocation(selected.calls, 'bun', ['run', 'check:js']), 0);
        assert.equal(
          countToolInvocation(selected.calls, 'bun', ['run', 'biome', 'ci', 'scripts', 'plugins/docks/hooks']),
          1,
        );
        assert.equal(countToolInvocation(selected.calls, 'bun', docksBiomeLintArgv), 1);
        assert.match(selected.result.stdout, /javascript quality/);
      }
    }

    assert.equal(core.result.status, 0, `${core.result.stdout}\n${core.result.stderr}`);
    assert.equal(countToolInvocation(core.calls, 'bun', ['run', 'check:js']), 0);
    assert.equal(countToolInvocation(core.calls, 'bun', coreBiomeCiArgv), 1);
    assert.equal(countToolInvocation(core.calls, 'bun', coreBiomeLintArgv), 1);
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
    assert.doesNotMatch(core.result.stdout, /partition passed/);
    assert.equal(countToolInvocation(core.calls, 'node', planCliArgv), 1);
    assert.equal(countToolInvocation(core.calls, 'node', boundedWorkflowArgv), 1);
    assert.equal(countToolInvocation(core.calls, 'node', templateCaseArgv), 1);
    assert.equal(countToolInvocation(core.calls, 'node', crossPluginCollisionArgv), 1);
    assert.equal(countToolInvocation(core.calls, 'node', planLifecycleCollisionArgv), 1);
    assert.equal(countToolInvocation(core.calls, 'node', ['plugins/plan-lifecycle/test/selftest.mjs']), 1);

    assert.equal(timedCore.result.status, 0, `${timedCore.result.stdout}\n${timedCore.result.stderr}`);
    assert.equal(countToolInvocation(timedCore.calls, 'bun', ['run', 'check:js']), 0);
    assert.equal(countToolInvocation(timedCore.calls, 'bun', coreBiomeCiArgv), 1);
    assert.equal(countToolInvocation(timedCore.calls, 'bun', coreBiomeLintArgv), 1);
    assert.equal(countToolInvocation(timedCore.calls, 'node', planCliArgv), 1);
    assert.equal(countToolInvocation(timedCore.calls, 'node', boundedWorkflowArgv), 1);
    const timing = JSON.parse(fs.readFileSync(timedCore.timingPath, 'utf8'));
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

    // The always-on shard. Everything a shard-skipping pull request would otherwise
    // lose lives here, and nothing plugin-scoped does - if a check migrates out of
    // this census it stops running on a pull request that skips both plugin shards.
    assert.equal(repoWide.result.status, 0, `${repoWide.result.stdout}\n${repoWide.result.stderr}`);
    for (const script of repoWideCommands) {
      assert.equal(invokesNode(repoWide.calls, script), true, `repo CI must invoke repo-wide command ${script}`);
    }
    assert.equal(countToolInvocation(repoWide.calls, 'node', ['scripts/plans/no-bespoke-gates.mjs']), 1);
    assert.equal(countToolInvocation(repoWide.calls, 'bun', ['run', 'test:unit']), 1);
    assert.doesNotMatch(repoWide.result.stdout, /plugin: docks|plugin: effect-kit|plugin: plan-lifecycle/);
    assert.equal(countToolInvocation(repoWide.calls, 'bun', ['run', 'check:js']), 0);
    assert.equal(countToolInvocation(repoWide.calls, 'bun', coreBiomeCiArgv), 0);
    // The repo shard used to schedule no biome at all: it selects zero plugins, so the
    // union of plugin-scoped paths was empty and `tests/`, `package.json` and `biome.json`
    // went unchecked on every pull request. It now owns exactly the unowned residue.
    assert.equal(
      countToolInvocation(repoWide.calls, 'bun', repoBiomeCiArgv),
      1,
      `the always-on shard must biome-check the paths no plugin owns (${repoBiomeCiArgv.join(' ')})`,
    );
    const repoLintCalls = repoWide.calls.filter(
      ({ tool, args: callArgs }) => tool === 'bun' && callArgs[1] === 'biome' && callArgs[2] === 'lint',
    );
    assert.equal(
      repoLintCalls.length,
      REPO_WIDE_JAVASCRIPT_QUALITY.lint.length > 0 ? 1 : 0,
      `the repo shard must schedule a biome lint exactly when it owns lint paths: ${JSON.stringify(repoLintCalls)}`,
    );
    assert.equal(countToolInvocation(repoWide.calls, 'node', planCliArgv), 0);
    const repoTiming = JSON.parse(fs.readFileSync(repoWide.timingPath, 'utf8'));
    assertCommandTelemetry(repoTiming);
    assert.deepEqual(repoTiming.mode, { plugin: null, lane: 'repo' });
    assert.deepEqual(
      repoTiming.phases.map(({ name }) => name),
      ['workflow YAML', 'marketplace catalogs', 'repo-wide guards', 'CI targeting contract', 'javascript quality'],
      'the always-on shard must own every cross-plugin check and nothing else',
    );
    assert.ok(
      repoTiming.phases.every(({ status }) => status === 'passed'),
      `repo timing report contains a failed phase: ${JSON.stringify(repoTiming.phases)}`,
    );

    // No shard may drop a PATH the pre-sharding full gate biome-checked. Phase-level
    // ownership above is not enough: every lane can schedule a `javascript quality`
    // phase while their union still omits a path `check:js` covers.
    const declaredBiome = parseCheckJsBiomeInvocations();
    const scheduledBiome = laneBiomeInvocations(
      new Map([
        ['repo', repoWide.calls],
        ['core', core.calls],
      ]),
    );
    for (const [subcommand, declaredPaths] of declaredBiome) {
      const scheduledPaths = scheduledBiome.get(subcommand) ?? new Set();
      const orphans = [...declaredPaths].filter((value) => !scheduledPaths.has(value)).sort();
      assert.deepEqual(
        orphans,
        [],
        `check:js runs \`biome ${subcommand}\` over paths no lane schedules, so a pull request touching them is unchecked: ${orphans.join(', ')} (lanes schedule: ${[...scheduledPaths].sort().join(', ') || 'nothing'})`,
      );
    }
    // No shard may drop a phase the pre-sharding full gate ran.
    const shardedPhases = new Set([repoTiming, timing].flatMap(({ phases }) => phases.map(({ name }) => name)));
    assert.equal(full.result.status, 0, `${full.result.stdout}\n${full.result.stderr}`);
    const fullPhases = JSON.parse(fs.readFileSync(full.timingPath, 'utf8')).phases.map(({ name }) => name);
    assert.deepEqual(
      fullPhases.filter((name) => !shardedPhases.has(name)),
      [],
      'every phase of the untargeted gate must be owned by some shard',
    );
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
}

function genericReleaseIo(repo, options = {}) {
  const calls = [];
  const output = [];
  const relativePath = (file) => path.relative(repo, path.isAbsolute(file) ? file : path.join(repo, file));
  // The fixture stands in for a real tag push: it reports when it pushed, and the tag-CI
  // result it hands back carries the identity of the run that push created.
  const pushedAt = options.pushedAt ?? '2026-08-06T12:00:00.000Z';
  const tagCiResult = Object.hasOwn(options, 'tagCiResult')
    ? options.tagCiResult
    : {
        ok: true,
        runId: '30939989435',
        tag: `${options.tag ?? ''}`,
        commit: 'a'.repeat(40),
        event: 'push',
        createdAt: '2026-08-06T12:00:04Z',
      };
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
      if (typeof tagCiResult === 'object' && tagCiResult !== null && tagCiResult.tag === '') tagCiResult.tag = tag;
      return pushedAt;
    },
    ensureCleanTree() {
      record('ensureCleanTree');
      if (typeof options.cleanTree === 'function') return options.cleanTree();
      return options.cleanTree ?? true;
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
    waitForTagCi(tag, commit, pushed) {
      record('waitForTagCi', [tag, commit, pushed]);
      return tagCiResult;
    },
    wouldStageChange(file, content) {
      const relative = relativePath(file);
      record('wouldStageChange', [relative, content]);
      if (typeof options.wouldStageChange === 'function') return options.wouldStageChange(relative, content);
      return options.wouldStageChange ?? true;
    },
    writeJson(file, value) {
      record('writeJson', [relativePath(file), value]);
    },
  };
  assert.deepEqual(
    Object.keys(io).sort(),
    GENERIC_RELEASE_IO_KEYS,
    'generic release fixture IO must match the production adapter',
  );
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
    const [major, minor, patchVersion] = currentVersion.split('.').map(Number);
    const targetVersion = `${major}.${minor}.${patchVersion + 1}`;
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
    const dryRunOutput = fixture.output.join('\n');
    assert.ok(
      dryRunOutput.includes(
        `  [dry-run] ${plugin.root}/.claude-plugin/plugin.json: would write version → ${targetVersion}`,
      ),
      `${plugin.name} real bump preview must name the target version`,
    );
    assert.ok(
      dryRunOutput.includes(`  [dry-run] git commit -m "chore(release): ${plugin.name} v${targetVersion}"`),
      `${plugin.name} real bump preview must predict the release commit`,
    );
    assert.equal(
      fixture.calls.some(({ tool }) =>
        ['writeJson', 'commit', 'push', 'createTag', 'waitForTagCi', 'createRelease'].includes(tool),
      ),
      false,
      `${plugin.name} dry-run must not invoke write, commit, push, tag, workflow, or GitHub Release IO`,
    );
  }

  const generic = ordinaryPlugins[0];
  const recutPlugin = ordinaryPlugins[2];
  const recutVersion = JSON.parse(
    fs.readFileSync(path.join(ROOT, recutPlugin.root, '.claude-plugin/plugin.json'), 'utf8'),
  ).version;
  const recutManifest = `${recutPlugin.root}/.claude-plugin/plugin.json`;

  const unchangedRecut = genericReleaseIo(ROOT, { wouldStageChange: false });
  await runGenericPluginRelease({
    argv: ['--dry-run', '--plugin', recutPlugin.name, recutVersion],
    repo: ROOT,
    plugins: PLUGINS,
    io: unchangedRecut.io,
  });
  const unchangedRecutOutput = unchangedRecut.output.join('\n');
  assert.ok(
    unchangedRecutOutput.includes(`  [dry-run] ${recutManifest}: unchanged (already at ${recutVersion})`),
    'unchanged re-cut preview must identify a manifest that would not stage',
  );
  assert.ok(
    unchangedRecutOutput.includes('  [dry-run] manifests already at this version — tagging existing HEAD'),
    'unchanged re-cut preview must predict tagging existing HEAD',
  );
  assert.equal(
    unchangedRecut.output.some((line) => line.includes('git commit')),
    false,
    'unchanged re-cut preview must not predict a release commit',
  );

  const formattingOnlyRecut = genericReleaseIo(ROOT, { wouldStageChange: true });
  await runGenericPluginRelease({
    argv: ['--dry-run', '--plugin', recutPlugin.name, recutVersion],
    repo: ROOT,
    plugins: PLUGINS,
    io: formattingOnlyRecut.io,
  });
  const formattingOnlyOutput = formattingOnlyRecut.output.join('\n');
  assert.ok(
    formattingOnlyOutput.includes(
      `  [dry-run] ${recutManifest}: would rewrite formatting only (already at ${recutVersion})`,
    ),
    'formatting-only re-cut preview must distinguish canonicalization from a version bump',
  );
  assert.ok(
    formattingOnlyOutput.includes(`  [dry-run] git commit -m "chore(release): ${recutPlugin.name} v${recutVersion}"`),
    'formatting-only re-cut preview must predict the release commit',
  );
  assert.ok(
    formattingOnlyRecut.calls.some(
      ({ tool, args: callArgs }) =>
        tool === 'wouldStageChange' &&
        callArgs[0] === recutManifest &&
        typeof callArgs[1] === 'string' &&
        callArgs[1].includes(`"version": "${recutVersion}"`),
    ),
    'formatting-only re-cut fixture must record the staged path and candidate content',
  );

  const dirtyTree = genericReleaseIo(ROOT, { cleanTree: false });
  await runGenericPluginRelease({
    argv: ['--dry-run', '--plugin', recutPlugin.name, 'patch'],
    repo: ROOT,
    plugins: PLUGINS,
    io: dirtyTree.io,
  });
  const dirtyTreeOutput = dirtyTree.output.join('\n');
  for (const relative of [
    recutManifest,
    '.claude-plugin/marketplace.json',
    `${recutPlugin.root}/.codex-plugin/plugin.json`,
  ]) {
    assert.ok(
      dirtyTreeOutput.includes(`  [dry-run] ${relative}: not compared (working tree dirty)`),
      `dirty-tree dry-run refusal must decline the per-manifest comparison for ${relative}`,
    );
  }
  assert.equal(
    dirtyTree.calls.some(({ tool }) => tool === 'wouldStageChange'),
    false,
    'dirty-tree dry run must not run a stage comparison it cannot trust',
  );
  assert.ok(
    dirtyTreeOutput.includes('  [dry-run] refused: working tree dirty — commit/stash first'),
    'dirty-tree dry-run refusal must name the clean-tree gate',
  );
  assert.ok(
    dirtyTreeOutput.includes('  [dry-run] no commit, push, tag, or release would run'),
    'dirty-tree dry-run refusal must suppress every landing action',
  );
  assert.ok(
    dirtyTreeOutput.includes('[dry-run] BLOCKED — the release would refuse; no changes written, no tag, no release.'),
    'dirty-tree dry-run refusal must end with the blocked closer',
  );
  // Every line the unblocked tail can print, so moving one above the blocked return is caught
  // rather than passing because the list stopped at the first four.
  const landingForecastFragments = [
    'git add',
    'git commit',
    'git push',
    'plugin tag',
    'wait for tag-CI',
    'gh release create',
    'already at this version',
  ];
  for (const forbidden of landingForecastFragments) {
    assert.equal(
      dirtyTree.output.some((line) => line.includes(forbidden)),
      false,
      `dirty-tree dry-run refusal must not print ${forbidden}`,
    );
  }

  const cleanTreeFailureMessage = 'fixture clean-tree check failed';
  const cleanTreeFailure = genericReleaseIo(ROOT, {
    cleanTree() {
      throw new Error(cleanTreeFailureMessage);
    },
  });
  await assert.rejects(
    runGenericPluginRelease({
      argv: ['--dry-run', '--plugin', generic.name, 'patch'],
      repo: ROOT,
      plugins: PLUGINS,
      io: cleanTreeFailure.io,
    }),
    { message: cleanTreeFailureMessage },
    'clean-tree check failure must surface unchanged',
  );
  assert.equal(
    cleanTreeFailure.output.some((line) => landingForecastFragments.some((fragment) => line.includes(fragment))),
    false,
    'clean-tree check failure must not print a landing forecast',
  );

  const stageProbeFailureMessage = 'fixture staged-content check failed';
  const stageProbeFailure = genericReleaseIo(ROOT, {
    wouldStageChange() {
      throw new Error(stageProbeFailureMessage);
    },
  });
  await assert.rejects(
    runGenericPluginRelease({
      argv: ['--dry-run', '--plugin', generic.name, 'patch'],
      repo: ROOT,
      plugins: PLUGINS,
      io: stageProbeFailure.io,
    }),
    { message: stageProbeFailureMessage },
    'staged-content check failure must surface unchanged',
  );
  assert.ok(
    stageProbeFailure.calls.some(({ tool }) => tool === 'wouldStageChange'),
    'staged-content check failure must reach the stage probe',
  );
  assert.equal(
    stageProbeFailure.output.some((line) => landingForecastFragments.some((fragment) => line.includes(fragment))),
    false,
    'staged-content check failure must not print a landing forecast',
  );

  const missingStageProbe = genericReleaseIo(ROOT);
  const missingStageProbeIo = { ...missingStageProbe.io };
  delete missingStageProbeIo.wouldStageChange;
  await assert.rejects(
    runGenericPluginRelease({
      argv: ['--dry-run', '--plugin', generic.name, 'patch'],
      repo: ROOT,
      plugins: PLUGINS,
      io: missingStageProbeIo,
    }),
    /generic release IO must be the exact closed adapter/i,
    'missing stage probe must fail closed-adapter validation',
  );
  assert.deepEqual(missingStageProbe.calls, [], 'missing stage probe validation must fail before IO');
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
  // Registry validation is global: one malformed descriptor refuses the release of every
  // plugin, not only its own, and it must refuse before any release IO happens.
  const malformedRegistryIo = genericReleaseIo(ROOT);
  await assert.rejects(
    dispatchPluginRelease({
      argv: ['--dry-run', '--plugin', ordinaryNames[1], 'patch'],
      repo: ROOT,
      plugins: PLUGINS.map((plugin) =>
        plugin.name === generic.name
          ? { ...plugin, release: { kind: 'future-release-policy', install: plugin.release.install } }
          : plugin,
      ),
      io: malformedRegistryIo.io,
    }),
    /unknown release policy kind/i,
    'a malformed unrelated descriptor must refuse every release',
  );
  assert.deepEqual(malformedRegistryIo.calls, [], 'registry validation reached production release IO');

  const fixtureIo = genericReleaseIo(ROOT);
  let fixtureDispatchCalls = 0;
  const fixtureResult = await dispatchPluginRelease({
    argv: ['--plugin', generic.name, 'patch'],
    repo: ROOT,
    plugins: PLUGINS,
    io: fixtureIo.io,
    dispatchFixture: async () => {
      fixtureDispatchCalls += 1;
      return true;
    },
  });
  assert.equal(fixtureResult, true);
  assert.equal(fixtureDispatchCalls, 1, 'fixture-only dispatcher did not intercept the simulated release');
  assert.deepEqual(fixtureIo.calls, [], 'generic fixture dispatch reached production release IO');

  for (const [name, argv, expected] of [
    ['unknown default-plugin option in fixture mode', ['--unknown', 'patch'], /unknown.*--unknown/i],
    ['unknown option without plugin selector in fixture mode', ['--prepare', '0.16.1'], /unknown.*--prepare/i],
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
      'unknown option assigned to a generic plugin in fixture mode',
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
    }),
    /generic release IO must be the exact closed adapter/i,
    'a missed fixture interception retained production release capability',
  );
  assert.equal(declinedFixtureCalls, 1);
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

  const greenRun = {
    ok: true,
    runId: '30939989435',
    tag: '',
    commit: 'a'.repeat(40),
    event: 'push',
    createdAt: '2026-08-06T12:00:04Z',
  };
  // Every row is evidence a release must refuse: no result, a malformed one, or - the
  // stale-run cases - a green result belonging to some OTHER run. Deleting and re-pushing
  // a tag is this script's own documented recovery, and it leaves exactly such a run
  // behind: same commit, same event, already complete, already green.
  for (const tagCiResult of [
    undefined,
    null,
    {},
    { ...greenRun, ok: 'true' },
    { ok: true, runId: '30939989435' },
    { ...greenRun, runId: '' },
    { ...greenRun, runId: 'fixture-tag-ci-run' },
    { ...greenRun, extra: true },
    { ...greenRun, tag: 'some-other-plugin--v9.9.9' },
    { ...greenRun, commit: 'b'.repeat(40) },
    { ...greenRun, event: 'workflow_dispatch' },
    { ...greenRun, createdAt: '2026-08-06T11:59:59Z' },
    { ...greenRun, createdAt: 'not a timestamp' },
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
    assert.ok(
      calls.some(({ tool, args: callArgs }) => tool === 'git' && callArgs[0] === 'hash-object'),
      'dry-run fixture must pass the staged-content hash probe through to real git',
    );
    assert.ok(
      calls.some(({ tool, args: callArgs }) => tool === 'git' && callArgs[0] === 'rev-parse'),
      'dry-run fixture must pass the HEAD comparison through to real git',
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
      calls.some(({ tool, args: callArgs }) => tool === 'git' && callArgs.includes('-w')),
      false,
      'dry-run must never ask git to write an object',
    );
    assert.equal(
      calls.some(
        ({ tool, args: callArgs }) =>
          tool === 'git' && ['update-index', 'write-tree', 'update-ref'].includes(callArgs[0]),
      ),
      false,
      'dry-run must never write the index or a ref',
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

assert.deepEqual(names(resolveCiTargets(PLUGINS, null)), ['docks', 'effect-kit', 'plan-lifecycle']);
assert.deepEqual(names(resolveCiTargets(PLUGINS, 'docks')), ['docks']);
assert.throws(() => resolveCiTargets(PLUGINS, 'unknown-plugin'), /unknown plugin.*docks, effect-kit, plan-lifecycle/);
const laneShape = ({ name, targets, repoWide }) => ({
  name,
  targets: names(targets),
  repoWide,
});
assert.deepEqual(CI_LANES, ['repo', 'core']);
assert.ok(Object.isFrozen(CI_LANES));
assert.deepEqual(
  PLUGINS.map(({ name, ciLane }) => ({ name, ciLane })),
  [
    { name: 'docks', ciLane: 'core' },
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
assert.equal(
  [resolveCiLane(PLUGINS, 'repo'), resolveCiLane(PLUGINS, 'core')].filter(({ repoWide }) => repoWide).length,
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
  assert.throws(() => resolveCiLane(PLUGINS, 'core'), /plugin unknown-lane-plugin has unknown ciLane: mutations.*core/);
} finally {
  assert.equal(PLUGINS.pop(), unknownLanePlugin);
}
assert.throws(() => resolveCiLane(PLUGINS, 'unknown'), /unknown CI lane.*repo, core/);
assert.throws(() => resolveCiLane(PLUGINS, 'toString'), /unknown CI lane.*repo, core/);
assert.throws(() => resolveCiLane(PLUGINS, 'constructor'), /unknown CI lane.*repo, core/);
assert.throws(
  () =>
    resolveCiLane(
      PLUGINS.filter(({ name }) => name !== 'effect-kit'),
      'core',
    ),
  /unknown plugin: effect-kit/,
);
await Promise.all(
  [
    [['--lane'], /--lane requires one value/],
    [['--lane', 'core', '--lane', 'repo'], /duplicate argument: --lane/],
    [['--lane', 'core', '--plugin', 'docks'], /--plugin cannot be combined with --lane/],
    [['--list', '--lane', 'core'], /--list cannot be combined with.*--lane/],
    [['--lane', 'unknown'], /unknown CI lane.*repo, core/],
    [['--lane', 'toString'], /unknown CI lane.*repo, core/],
    [['--lane', 'constructor'], /unknown CI lane.*repo, core/],
  ].map(async ([invalidArgs, diagnostic]) => {
    const rejected = await execFileResult(process.execPath, ['scripts/ci.mjs', ...invalidArgs], {
      cwd: ROOT,
      encoding: 'utf8',
    });
    assert.equal(rejected.status, 2, `${invalidArgs.join(' ')}\n${rejected.stdout}\n${rejected.stderr}`);
    assert.match(rejected.stderr, diagnostic);
  }),
);
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
assert.deepEqual(shardsFor(['plugins/docks/skills/productivity/write-skill/scripts/skill-guard.mjs']).lanes, [
  'repo',
  'core',
]);

// A multi-plugin diff selects each implicated shard.
assert.deepEqual(shardsFor(['plugins/plan-lifecycle/test/selftest.mjs', 'plugins/docks/skills/a.md']).lanes, [
  'repo',
  'core',
]);
assert.deepEqual(shardsFor(['plugins/docks/skills/a.md', 'plugins/effect-kit/test/b.mjs']).lanes, ['repo', 'core']);

// Every fail-open path selects everything.
for (const [label, selection] of [
  ['a path outside every plugin root', shardsFor(['scripts/ci.mjs'])],
  ['the plugin root itself with a sibling outside it', shardsFor(['plugins/docks', 'bun.lock'])],
  ['a lockfile-only diff', shardsFor(['bun.lock'])],
  ['a workflow-only diff', shardsFor(['.github/workflows/ci.yml'])],
  ['a quoted or otherwise undecodable path', shardsFor(['"plugins/docks/\\303\\251.md"'])],
  ['an empty diff', shardsFor([])],
  ['a whitespace-only diff', shardsFor(['', '   '])],
  ['an unresolvable base', shardsFor(['plugins/docks/skills/a.md'], { baseResolved: false })],
  ['a missing base', shardsFor(['plugins/docks/skills/a.md'], { baseResolved: undefined })],
  ['a non-pull-request event', shardsFor(['plugins/docks/skills/a.md'], { eventName: 'push' })],
  ['a workflow_dispatch run', shardsFor([], { eventName: 'workflow_dispatch' })],
]) {
  assert.deepEqual(selection.lanes, ['repo', 'core'], `${label} must fail open to every shard`);
  assert.notEqual(selection.reason, 'diff-scoped', `${label} must not report a positive determination`);
}
assert.equal(shardsFor(['plugins/docks-extra/x.md']).reason, 'path-outside-every-plugin-root:plugins/docks-extra/x.md');
assert.equal(shardsFor([], { baseResolved: false }).reason, 'base-sha-unresolved');
assert.equal(shardsFor([]).reason, 'empty-diff');

// The resolver may never hand the matrix a selection that gates nothing: an empty
// `lanes` makes `fromJSON` produce zero matrix instances and GitHub reports the
// shard job as skipped. Every branch, including the diff-scoped one, must carry
// the repo-wide shard.
for (const [label, input] of [
  ['not-a-pull-request', { eventName: 'push', baseResolved: true, changedPaths: [] }],
  ['unresolved-base', { eventName: 'pull_request', baseResolved: false, changedPaths: [] }],
  ['empty-diff', { eventName: 'pull_request', baseResolved: true, changedPaths: [] }],
  ['path-outside-every-root', { eventName: 'pull_request', baseResolved: true, changedPaths: ['scripts/ci.mjs'] }],
  ['diff-scoped', { eventName: 'pull_request', baseResolved: true, changedPaths: ['plugins/docks/skills/a.md'] }],
]) {
  const { lanes } = resolveShardSelection(input);
  assert.notEqual(lanes.length, 0, `resolver branch ${label} must never gate nothing`);
  assert.ok(lanes.includes(REPO_WIDE_LANE), `resolver branch ${label} must always carry the repo-wide shard`);
}

// The registry, not the workflow, decides coverage: a plugin added without a
// usable shard must fail here rather than ride in ungated.
assert.deepEqual(assertShardTopologyCoversRegistry(), ['repo', 'core']);
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

// ===================== disk-to-registry coverage =====================
// The lane checks above close registry->lane and lane->registry. Neither can see a
// `plugins/<new>/` tree that no descriptor mentions: it owns no root, so no shard
// selects it and no gate validates it, and the pull request that added it is green
// having gated none of it. These cases use the REAL `plugins/` directory, because a
// temp-dir mock would prove only that the helper can read some directory.
const pluginTreeRoot = path.join(ROOT, 'plugins');
const withPluginTreeEntry = (name, make, run) => {
  const target = path.join(pluginTreeRoot, name);
  assert.equal(fs.existsSync(target), false, `${name} must not already exist`);
  make(target);
  try {
    run(target);
  } finally {
    fs.rmSync(target, { recursive: true, force: true });
  }
  assert.equal(fs.existsSync(target), false, `${name} must leave no residue`);
};

assert.deepEqual(assertPluginTreesAreRegistered(), ['plugins/docks', 'plugins/effect-kit', 'plugins/plan-lifecycle']);

// The reported defect, and it must reach callers through the wired entry point too.
withPluginTreeEntry(
  'zz-unregistered-probe',
  (target) => fs.mkdirSync(path.join(target, '.claude-plugin'), { recursive: true }),
  () => {
    for (const [label, call] of [
      ['the helper', assertPluginTreesAreRegistered],
      ['the wired topology assertion', assertShardTopologyCoversRegistry],
    ]) {
      assert.throws(
        call,
        /unregistered plugin tree plugins\/zz-unregistered-probe: no shard gates it.*scripts\/lib\/plugins\.mjs/s,
        `${label} must reject an unregistered plugin tree by name and point at the registry`,
      );
    }
  },
);

// A symlink is neither a file nor a directory to `readdir`, so any type-based rule
// would skip it - and skipping is exactly how a tree hides from validation.
withPluginTreeEntry(
  'zz-symlinked-probe',
  (target) => fs.symlinkSync(path.join(ROOT, 'plugins', 'docks'), target),
  () =>
    assert.throws(
      assertPluginTreesAreRegistered,
      /unregistered plugin tree plugins\/zz-symlinked-probe/,
      'a symlinked plugin tree must be validated, never skipped for its type',
    ),
);

// The rule is "git considers it repository content", asked of git at run time - not a
// denylist of incidental names that grows one plausible entry at a time. A globally
// ignored entry cannot appear in a pull-request diff, so it smuggles nothing.
withPluginTreeEntry(
  'node_modules',
  (target) => fs.mkdirSync(path.join(target, 'left-pad'), { recursive: true }),
  () =>
    assert.doesNotThrow(
      assertPluginTreesAreRegistered,
      'a git-ignored entry is not repository content and must not be demanded of the registry',
    ),
);

// The mirror defect: a descriptor outliving its tree. The shard resolver keeps
// routing diffs to a root nothing can validate.
const deletedTreePlugin = { ...byName('effect-kit'), name: 'deleted-tree', root: 'plugins/deleted-tree' };
PLUGINS.push(deletedTreePlugin);
try {
  assert.throws(
    assertPluginTreesAreRegistered,
    /registry plugin deleted-tree declares root plugins\/deleted-tree, which does not exist on disk/,
    'a registry entry whose root is gone must fail as loudly as an unregistered tree',
  );
} finally {
  assert.equal(PLUGINS.pop(), deletedTreePlugin);
}
assert.deepEqual(assertShardTopologyCoversRegistry(), ['repo', 'core']);
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
  assert.deepEqual(shardCli(['--unresolved']), { lanes: ['repo', 'core'], reason: 'base-sha-unresolved' });
  // An unreadable diff file is a resolution failure, not evidence that a shard has
  // nothing to do: the CLI must still exit 0 and select everything.
  assert.deepEqual(shardCli(['--changed-paths', path.join(shardCliTmp, 'absent.txt')]), {
    lanes: ['repo', 'core'],
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
  assert.equal(fs.readFileSync(githubOutput, 'utf8'), 'lanes=["repo","core"]\nreason=base-sha-unresolved\n');
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
await testFocusedCiCommandSelection();
console.log('focused CI command selection passed');

assert.deepEqual(parseReleaseTag('docks--v0.12.8'), { plugin: 'docks', version: '0.12.8' });
assert.deepEqual(parseReleaseTag('effect-kit--v11.2.0'), { plugin: 'effect-kit', version: '11.2.0' });
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
assert.deepEqual(workflowCiSelection('pull_request', ''), { mode: 'full', plugin: null });
assert.deepEqual(workflowCiSelection('workflow_dispatch', ''), { mode: 'full', plugin: null });
assert.deepEqual(workflowCiSelection('push', 'effect-kit--v0.3.1'), { mode: 'targeted', plugin: 'effect-kit' });
assert.throws(() => workflowCiSelection('push', 'bad-tag'), /invalid release tag/);
assert.throws(() => workflowCiSelection('schedule', ''), /unsupported workflow event/);
console.log('release tag and workflow selection passed');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'docks-ci-targeting-'));
try {
  const githubOutput = path.join(tmp, 'github-output');
  const cli = spawnSync(
    'node',
    ['scripts/ci-target.mjs', 'release-tag', 'effect-kit--v0.11.2', '--github-output', githubOutput],
    { cwd: ROOT, encoding: 'utf8' },
  );
  assert.equal(cli.status, 0, cli.stderr);
  assert.equal(cli.stdout, '');
  assert.equal(fs.readFileSync(githubOutput, 'utf8'), 'mode=targeted\nplugin=effect-kit\n');

  const malformed = spawnSync('node', ['scripts/ci-target.mjs', 'release-tag', 'docks--v1.2.3;echo-owned'], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  assert.notEqual(malformed.status, 0);
  assert.match(malformed.stderr, /invalid release tag/);
  console.log('release tag resolver CLI passed');

  if (!unitOnly) {
    const hostFreeRoot = fs.mkdtempSync(path.join(tmp, 'host-free-'));
    const hostedRoot = fs.mkdtempSync(path.join(tmp, 'hosted-'));
    const timingPath = path.join(hostFreeRoot, 'timings.json');
    const hostedTimingPath = path.join(hostedRoot, 'timings.json');
    // The gate records hosted identity whenever GITHUB_ACTIONS is set, and this suite runs unfiltered
    // inside the hosted targeting-contracts job. Inheriting that marker would make the fixture report
    // a non-null `host` and fail the closed assertion below on every pull request, so scrub it here
    // exactly as the focused-selection probe does.
    const hostFreeEnv = { ...process.env };
    delete hostFreeEnv.GITHUB_ACTIONS;
    // `host` is only populated under GitHub Actions, so prove it with an explicit synthetic
    // environment rather than leaving the field unexercised by every fixture.
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
    const [targeted, hosted] = await Promise.all([
      execFileResult('node', ['scripts/ci.mjs', '--plugin', 'effect-kit', '--timings-json', timingPath], {
        cwd: ROOT,
        encoding: 'utf8',
        env: hostFreeEnv,
        timeout: 120_000,
      }),
      execFileResult('node', ['scripts/ci.mjs', '--plugin', 'effect-kit', '--timings-json', hostedTimingPath], {
        cwd: ROOT,
        encoding: 'utf8',
        env: hostedEnv,
        timeout: 120_000,
      }),
    ]);
    assert.equal(targeted.status, 0, `${targeted.stdout}\n${targeted.stderr}`);
    assert.doesNotMatch(targeted.stdout, /skill-maintainer idempotency|plan review policy|plugin: docks/);
    assert.match(targeted.stdout, /plugin: effect-kit/);
    validateTimingReport(timingPath, 'effect-kit', ['javascript quality']);
    console.log('targeted CI timing report passed');

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
const integrityWorkflow = parseWorkflow('.github/workflows/dependency-integrity.yml');
for (const [relativePath, parsed] of [
  ['.github/workflows/ci.yml', validateWorkflow],
  ['.github/workflows/dependency-integrity.yml', integrityWorkflow],
]) {
  assertPinnedActions(parsed.value, relativePath);
}
// Both retired manager names appear literally, because a deny-list assertion has
// to name what it denies. The migration's acceptance grep excludes this one line
// by matching on the identifier below rather than by line number.
const retiredPackageManagerNames = ['pnpm', 'corepack'];
for (const { value: workflow } of [validateWorkflow, integrityWorkflow]) {
  for (const job of Object.values(workflow.jobs)) {
    for (const workflowStep of job.steps) {
      const stepName = workflowStep.name?.toLowerCase() ?? '';
      assert.ok(
        retiredPackageManagerNames.every((retiredName) => !stepName.includes(retiredName)),
        `workflow step name still names a retired package manager: ${workflowStep.name}`,
      );
    }
  }
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
  for (const cacheStep of job.steps.filter(({ name }) => name === 'cache Bun install cache')) {
    assert.equal(cacheStep.id, 'bun-cache');
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
assert.deepEqual(
  shardSteps.map((row) => row.name ?? row.uses),
  [
    'actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd',
    'setup Node 24',
    'setup Bun',
    'start hosted step timing',
    'cache Bun install cache',
    'mark hosted cache restore',
    'install Bun dependencies (--frozen-lockfile; yaml + lockfile-pinned claude-code)',
    'verify registry signatures (non-blocking)',
    'materialize claude-code binary (trustedDependencies denies it by default)',
    'add node_modules/.bin to PATH (so ci.mjs finds the pinned claude)',
    'run validation lane',
    'publish hosted timing artifact',
  ],
);
for (const name of [
  'setup Bun',
  'start hosted step timing',
  'cache Bun install cache',
  'mark hosted cache restore',
  'install Bun dependencies',
  'verify registry signatures',
  'materialize claude-code binary',
  'add node_modules/.bin to PATH',
  'run validation lane',
])
  assert.equal(shardStep(name).if, undefined, `${name} must run on both candidate lanes`);
assert.equal(shardSteps[0].with['persist-credentials'], false);
assert.equal(shardStep('setup Node 24').with['node-version'], '24');
const shardGateRun = shardStep('run validation lane').run;
assert.match(shardGateRun, /^node scripts\/ci\.mjs --lane "\$\{\{ matrix\.lane \}\}" --timings-json /u);

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
    'setup Bun',
    'start hosted step timing',
    'cache Bun install cache',
    'mark hosted cache restore',
    'install Bun dependencies (--frozen-lockfile; yaml + lockfile-pinned claude-code)',
    'verify registry signatures (non-blocking)',
    'materialize claude-code binary (trustedDependencies denies it by default)',
    'add node_modules/.bin to PATH (so ci.mjs finds the pinned claude)',
    'run non-unit plugin-targeting contracts',
    'publish hosted timing artifact',
  ],
);
for (const name of [
  'setup Node 24',
  'setup Bun',
  'cache Bun install cache',
  'mark hosted cache restore',
  'install Bun dependencies',
  'verify registry signatures',
  'materialize claude-code binary',
  'add node_modules/.bin to PATH',
]) {
  assert.deepEqual(targetingStep(name), shardStep(name), `${name}: targeting-contract setup drifted from shard setup`);
}
for (const name of ['start hosted step timing']) {
  assert.ok(shardStep(name), `${name} must exist in validation-shards`);
  assert.ok(targetingStep(name), `${name} must exist in targeting-contracts`);
}
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
    'setup Bun',
    'resolve CI target',
    'start hosted step timing',
    'cache Bun install cache',
    'mark hosted cache restore',
    'install Bun dependencies (--frozen-lockfile; yaml + lockfile-pinned claude-code)',
    'verify registry signatures (non-blocking)',
    'materialize claude-code binary (trustedDependencies denies it by default)',
    'add node_modules/.bin to PATH (so ci.mjs finds the pinned claude)',
    'run the authoritative gate (scripts/ci.mjs)',
    'publish hosted timing artifact',
    'assert successful prerequisite jobs',
  ],
);
const nonPullRequestCondition = "github.event_name != 'pull_request'";
const pushCondition = "github.event_name == 'push'";
const pullRequestCondition = "github.event_name == 'pull_request'";
const hostedTimingPublishCondition = "always() && github.event_name != 'pull_request'";
const validateStepLabel = (row) => row.name ?? 'checkout';
assert.deepEqual(Object.fromEntries(steps.map((row) => [validateStepLabel(row), row.if])), {
  checkout: nonPullRequestCondition,
  'setup Node 24': nonPullRequestCondition,
  'setup Bun': nonPullRequestCondition,
  'resolve CI target': pushCondition,
  'start hosted step timing': nonPullRequestCondition,
  'cache Bun install cache': nonPullRequestCondition,
  'mark hosted cache restore': nonPullRequestCondition,
  'install Bun dependencies (--frozen-lockfile; yaml + lockfile-pinned claude-code)': nonPullRequestCondition,
  'verify registry signatures (non-blocking)': nonPullRequestCondition,
  'materialize claude-code binary (trustedDependencies denies it by default)': nonPullRequestCondition,
  'add node_modules/.bin to PATH (so ci.mjs finds the pinned claude)': nonPullRequestCondition,
  'run the authoritative gate (scripts/ci.mjs)': nonPullRequestCondition,
  'assert successful prerequisite jobs': undefined,
  'publish hosted timing artifact': hostedTimingPublishCondition,
});
function effectiveValidateInventory(eventName) {
  return steps
    .filter((row) => {
      switch (row.if) {
        case nonPullRequestCondition:
          return eventName !== 'pull_request';
        case pushCondition:
          return eventName === 'push';
        case pullRequestCondition:
          return eventName === 'pull_request';
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
  'setup Bun',
  'start hosted step timing',
  'cache Bun install cache',
  'mark hosted cache restore',
  'install Bun dependencies (--frozen-lockfile; yaml + lockfile-pinned claude-code)',
  'verify registry signatures (non-blocking)',
  'materialize claude-code binary (trustedDependencies denies it by default)',
  'add node_modules/.bin to PATH (so ci.mjs finds the pinned claude)',
  'run the authoritative gate (scripts/ci.mjs)',
  'publish hosted timing artifact',
  'assert successful prerequisite jobs',
];
assert.deepEqual(effectiveValidateInventory('pull_request'), ['assert successful prerequisite jobs']);
assert.deepEqual(effectiveValidateInventory('workflow_dispatch'), fullValidateInventory);
assert.deepEqual(effectiveValidateInventory('push'), [
  ...fullValidateInventory.slice(0, 3),
  'resolve CI target',
  ...fullValidateInventory.slice(3),
]);
assert.equal(step('resolve CI target').if, "github.event_name == 'push'");
assert.match(step('resolve CI target').run, /scripts\/ci-target\.mjs release-tag/);
const authoritativeGateRun = step('run the authoritative gate').run;
assert.match(authoritativeGateRun, /if \[ "\$\{\{ github\.event_name \}\}" = "push" \]; then/);
// The push leg is asserted through the shared parser rather than by matching argv text:
// what must hold is that the bytes a release tag publishes get repo-wide validation
// exactly once, with the targeted plugin gate still last. `ci-targeting.mjs` owns the
// assertion so this contract and the release-preparation source-CI pin cannot drift into
// asserting different things.
const gateCoverage = assertAuthoritativeGateCoversReleasedBytes(authoritativeGateRun);
assert.equal(gateCoverage.pushLegs, 1, 'the single release-tag push leg must be covered');
assert.match(authoritativeGateRun, /DOCKS_CI_MEMO=0 node scripts\/ci\.mjs --lane repo/);
assert.match(authoritativeGateRun, /node scripts\/ci\.mjs --plugin "\$\{\{ steps\.target\.outputs\.plugin \}\}"/);
// Each mutation is a way the release path could stop gating the bytes it publishes.
// They run here so the assertion above is proven load-bearing rather than merely present.
const repoLaneCall = 'DOCKS_CI_MEMO=0 node scripts/ci.mjs --lane repo';
const untargetedCall = 'node scripts/ci.mjs --timings-json "$RUNNER_TEMP/docks-ci-timings.json"';
for (const [label, mutated, expected] of [
  [
    'the push leg does not run the repo-wide shard',
    authoritativeGateRun
      .split('\n')
      .filter((line) => !line.includes('--lane repo'))
      .join('\n'),
    /repo-wide shard .* exactly once, found 0/,
  ],
  [
    'the push leg runs it twice',
    authoritativeGateRun.replace(`${repoLaneCall}\n`, `${repoLaneCall}\n${repoLaneCall}\n`),
    /repo-wide shard .* exactly once, found 2/,
  ],
  [
    'the repo-wide shard is only named, not run',
    authoritativeGateRun.replace(repoLaneCall, `printf '${repoLaneCall}\\n'`),
    /does not run it/,
  ],
  [
    'the repo-wide shard may be satisfied by a cached memo',
    authoritativeGateRun.replace(repoLaneCall, 'node scripts/ci.mjs --lane repo'),
    /DOCKS_CI_MEMO=0/,
  ],
  [
    'the repo-wide shard clobbers the timing report',
    authoritativeGateRun.replace(repoLaneCall, `${repoLaneCall} --timings-json "$RUNNER_TEMP/docks-ci-timings.json"`),
    /exactly one release-tag push invocation may write the timing report/,
  ],
  [
    'the targeted plugin gate no longer has the last word',
    authoritativeGateRun.replace(
      /( *)DOCKS_CI_MEMO=0 node scripts\/ci\.mjs --lane repo\n( *)(node scripts\/ci\.mjs --plugin [^\n]*\n)/,
      (_matched, repoIndent, pluginIndent, pluginCall) => `${pluginIndent}${pluginCall}${repoIndent}${repoLaneCall}\n`,
    ),
    /last word/,
  ],
  [
    'the non-push leg is narrowed to one plugin',
    authoritativeGateRun.replace(untargetedCall, 'node scripts/ci.mjs --plugin docks'),
    /must run the untargeted gate/,
  ],
]) {
  assert.notEqual(mutated, authoritativeGateRun, `${label}: mutation did not change the workflow shell`);
  assert.throws(() => assertAuthoritativeGateCoversReleasedBytes(mutated), expected, label);
}
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
const setupBun = step('setup Bun');
assert.equal(setupBun.uses, 'oven-sh/setup-bun@0c5077e51419868618aeaa5fe8019c62421857d6');
assert.equal(setupBun.with, undefined);
assert.ok(steps.indexOf(step('resolve CI target')) < steps.indexOf(step('cache Bun install cache')));
const bunCache = step('cache Bun install cache');
assert.equal(bunCache.id, 'bun-cache');
assert.equal(bunCache.with.path, '~/.bun/install/cache');
assert.equal(
  bunCache.with.key,
  `bun-v1-\${{ runner.os }}-\${{ runner.arch }}-\${{ hashFiles('bun.lock', 'package.json') }}`,
);
assert.equal(bunCache.with['restore-keys'], `bun-v1-\${{ runner.os }}-\${{ runner.arch }}-`);
assert.match(
  step('mark hosted cache restore').run,
  /"bun_cache_hit".*"bun_cache_key".*steps\.bun-cache\.outputs\.cache-hit.*steps\.bun-cache\.outputs\.cache-primary-key/u,
);
assert.match(step('install Bun dependencies').run, /^bun install --frozen-lockfile\n/u);
const withoutIf = (row) => Object.fromEntries(Object.entries(row).filter(([key]) => key !== 'if'));
assert.deepEqual(withoutIf(shardSteps[0]), withoutIf(steps[0]));
assert.deepEqual(withoutIf(shardStep('setup Node 24')), withoutIf(setupNode));
assert.deepEqual(withoutIf(shardStep('setup Bun')), withoutIf(setupBun));
for (const name of [
  'setup Bun',
  'cache Bun install cache',
  'mark hosted cache restore',
  'install Bun dependencies',
  'verify registry signatures',
  'materialize claude-code binary',
  'add node_modules/.bin to PATH',
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
assert.ok(
  prerequisiteAssertion,
  'the validate job must keep a step named `assert successful prerequisite jobs`; without it there is no join gate to execute',
);
assert.deepEqual(Object.keys(prerequisiteAssertion), ['name', 'env', 'run']);

// The join is the only thing standing between a green pull request and a pull
// request that gated none of its own changes, so its shell is EXECUTED here
// against injected job results rather than string-matched. Extraction is shared
// with the release-preparation source-CI pin (`ci-targeting.mjs`) so the two
// cannot drift; env var names come from the workflow, so renaming a key cannot
// silently orphan this test.
const extractedJoin = extractPrerequisiteAssertion(validation);
assert.deepEqual(
  extractedJoin.prerequisites.sort(),
  ['resolve-shards', 'targeting-contracts', 'validation-shards'],
  'every job in the graph except validate must be a prerequisite the join reads',
);
const deviation = (event, overrides) => ({
  event,
  results: { ...PREREQUISITE_REQUIRED_RESULTS[event], ...overrides },
});
const prerequisiteCases = [
  ...Object.keys(PREREQUISITE_REQUIRED_RESULTS).map((event) => [
    deviation(event, {}),
    0,
    `${event}: the required-result row must be accepted`,
  ]),
  [
    deviation('pull_request', { 'validation-shards': 'skipped' }),
    1,
    'THE REPORTED DEFECT: a pull request whose validation-shards job was skipped (empty resolver matrix) must not be green',
  ],
  [
    deviation('pull_request', { 'resolve-shards': 'skipped' }),
    1,
    'a pull request whose resolve-shards job was skipped gated nothing and must not be green',
  ],
  [
    deviation('pull_request', { 'targeting-contracts': 'skipped' }),
    1,
    'a pull request whose targeting-contracts job was skipped must not be green',
  ],
  [
    deviation('workflow_dispatch', { 'targeting-contracts': 'skipped' }),
    1,
    'workflow_dispatch runs targeting-contracts, so a skipped one must not be green',
  ],
  [
    deviation('push', { 'validation-shards': 'success' }),
    1,
    'a shard job that ran on a release tag means the topology drifted and must fail',
  ],
  [
    { event: 'schedule', results: PREREQUISITE_REQUIRED_RESULTS.pull_request },
    1,
    'an unrecognised event must fail loudly rather than fall through to a permissive default',
  ],
  ...['failure', 'cancelled'].flatMap((result) =>
    ['validation-shards', 'targeting-contracts', 'resolve-shards'].map((job) => [
      deviation('pull_request', { [job]: result }),
      1,
      `a ${result} ${job} job must still be rejected`,
    ]),
  ),
];
for (const [injected, expectedFailure, diagnostic] of prerequisiteCases) {
  const outcome = runPrerequisiteAssertion(extractedJoin, injected);
  const failed = outcome.status !== 0;
  assert.equal(
    failed,
    expectedFailure === 1,
    `${diagnostic} (injected ${JSON.stringify(injected)}, exit ${outcome.status}, stderr: ${outcome.stderr.trim()})`,
  );
  if (failed)
    assert.notEqual(outcome.stderr.trim(), '', `${diagnostic}: a rejection must name the offending job on stderr`);
}
// The same property the release-preparation source-CI pin asserts, run against the
// live workflow here so a weakening is caught before a release ever fetches it.
assert.doesNotThrow(() => assertPrerequisiteJoinGatesItsEvent(validation));
console.log(`prerequisite join contract executed across ${prerequisiteCases.length} injected job-result rows`);

const integrity = integrityWorkflow.value;
assert.ok(integrity.on.workflow_dispatch !== undefined);
assert.deepEqual(integrity.on.schedule, [{ cron: '17 7 * * 1' }]);
assert.deepEqual(integrity.permissions, { contents: 'read' });
const integritySteps = integrity.jobs.audit.steps;
const integrityStep = (name) => integritySteps.find((row) => row.name?.startsWith(name));
assert.equal(integrityStep('setup Node 24').with['node-version'], '24');
assert.equal(integrityStep('setup Bun').uses, setupBun.uses);
assert.equal(integrityStep('setup Bun').with, undefined);
assert.equal(integrityStep('cache Bun install cache').uses, bunCache.uses);
assert.equal(integrityStep('cache Bun install cache').with.key, bunCache.with.key);
assert.equal(integrityStep('install Bun dependencies').run, 'bun install --frozen-lockfile');
assert.equal(integrityStep('verify registry signatures').run, 'npm audit signatures');
assert.equal(integrityStep('verify registry signatures')['continue-on-error'], undefined);

console.log('workflow targeting and integrity separation contracts passed');

// The fake-adapter release contracts need neither real git nor a clean checkout, so they
// belong in the default run. Only the shim scenario above requires the gated clean tree.
const releaseModule = await import('../lib/plugin-release.mjs');
await testGenericReleaseModuleContract(
  releaseModule.dispatchPluginRelease,
  releaseModule.runGenericPluginRelease,
  releaseModule.resolveGenericReleaseIo,
);
console.log('generic release module contract and dry-run manifest previews passed');

async function testReleaseAdapterGitContracts(createReleaseIo) {
  const gitEnv = {
    ...process.env,
    GIT_CONFIG_GLOBAL: os.devNull,
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_TERMINAL_PROMPT: '0',
  };
  const runGit = (repo, gitArgs) => {
    const result = spawnSync('git', ['-c', 'commit.gpgSign=false', '-c', `core.hooksPath=${os.devNull}`, ...gitArgs], {
      cwd: repo,
      encoding: 'utf8',
      env: gitEnv,
    });
    if ((result.status ?? 1) !== 0) {
      throw new Error(
        `git ${gitArgs.join(' ')} fixture setup failed: ${result.stderr?.trim() || `exit ${result.status}`}`,
      );
    }
  };
  const configureFixtureRepo = (repo) => {
    runGit(repo, ['config', '--local', 'core.hooksPath', os.devNull]);
    runGit(repo, ['config', '--local', 'core.attributesFile', os.devNull]);
  };

  const notRepository = fs.mkdtempSync(path.join(os.tmpdir(), 'docks-release-adapter-no-git-'));
  try {
    const io = createReleaseIo({ repo: notRepository, plugins: PLUGINS });
    assert.throws(
      () => io.ensureCleanTree(),
      /git status --porcelain failed/,
      'a failed status probe must never be reported as a clean release tree',
    );
  } finally {
    fs.rmSync(notRepository, { recursive: true, force: true });
  }

  const cleanComparison = fs.mkdtempSync(path.join(os.tmpdir(), 'docks-release-adapter-compare-'));
  try {
    const manifest = path.join(cleanComparison, 'manifest.json');
    const committedBytes = '{"version":"1.0.0"}\n';
    runGit(cleanComparison, ['init', '-q']);
    configureFixtureRepo(cleanComparison);
    fs.writeFileSync(manifest, committedBytes);
    runGit(cleanComparison, ['add', 'manifest.json']);
    runGit(cleanComparison, ['-c', 'user.email=a@b', '-c', 'user.name=a', 'commit', '-qm', 'x']);

    const io = createReleaseIo({ repo: cleanComparison, plugins: PLUGINS });
    assert.equal(
      io.wouldStageChange(manifest, committedBytes),
      false,
      'the exact committed bytes must predict no release commit',
    );
    assert.equal(
      io.wouldStageChange(manifest, '{"version":"1.0.1"}\n'),
      true,
      'changed manifest data must predict a release commit',
    );
    assert.equal(
      io.wouldStageChange(manifest, `${JSON.stringify({ version: '1.0.0' }, null, 2)}\n`),
      true,
      'different serialization bytes must predict a release commit',
    );
  } finally {
    fs.rmSync(cleanComparison, { recursive: true, force: true });
  }

  const missingFromHead = fs.mkdtempSync(path.join(os.tmpdir(), 'docks-release-adapter-missing-'));
  try {
    const committed = path.join(missingFromHead, 'manifest.json');
    const absent = path.join(missingFromHead, 'never-committed.json');
    runGit(missingFromHead, ['init', '-q']);
    configureFixtureRepo(missingFromHead);
    fs.writeFileSync(committed, '{"version":"1.0.0"}\n');
    runGit(missingFromHead, ['add', 'manifest.json']);
    runGit(missingFromHead, ['-c', 'user.email=a@b', '-c', 'user.name=a', 'commit', '-qm', 'x']);

    const io = createReleaseIo({ repo: missingFromHead, plugins: PLUGINS });
    assert.throws(
      () => io.wouldStageChange(absent, '{}\n'),
      /missing from HEAD/,
      'an uncommitted path must make the release prediction refuse',
    );
  } finally {
    fs.rmSync(missingFromHead, { recursive: true, force: true });
  }

  const brokenFilter = fs.mkdtempSync(path.join(os.tmpdir(), 'docks-release-adapter-filter-'));
  try {
    const manifest = path.join(brokenFilter, 'manifest.json');
    const committedBytes = '{"version":"1.0.0"}\n';
    runGit(brokenFilter, ['init', '-q']);
    configureFixtureRepo(brokenFilter);
    fs.writeFileSync(manifest, committedBytes);
    runGit(brokenFilter, ['add', 'manifest.json']);
    runGit(brokenFilter, ['-c', 'user.email=a@b', '-c', 'user.name=a', 'commit', '-qm', 'x']);
    fs.writeFileSync(path.join(brokenFilter, '.gitattributes'), '*.json filter=broken\n');
    runGit(brokenFilter, ['config', 'filter.broken.clean', 'exit 3']);
    runGit(brokenFilter, ['config', 'filter.broken.required', 'true']);

    const io = createReleaseIo({ repo: brokenFilter, plugins: PLUGINS });
    // Hashing through --path applies its clean filter; if that fails, the dry run must refuse rather than guess.
    assert.throws(
      () => io.wouldStageChange(manifest, committedBytes),
      /git hash-object failed for /,
      'a required clean-filter failure must make the release prediction refuse',
    );
  } finally {
    fs.rmSync(brokenFilter, { recursive: true, force: true });
  }
}

await testReleaseAdapterGitContracts(releaseModule.createGenericPluginReleaseIo);
console.log('release adapter git predicates refuse to guess');
