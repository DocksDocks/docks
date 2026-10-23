import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { beginCommand, startTask, summarizeCommands } from '../../lib/ci-background-task.mjs';
import { fixture } from './ci-background-task.fixture.mjs';

function nodeDelay(milliseconds, exitCode = 0) {
  return [
    process.execPath,
    ['--input-type=module', '--eval', `setTimeout(() => process.exit(${exitCode}), ${milliseconds})`],
  ];
}

test('summarizeCommands accounts for concurrent background commands', async () => {
  const f = fixture();
  try {
    const tasks = [];
    const commands = [];
    const durations = [550, 650, 750];
    const pending = durations.map((duration, index) => {
      const [command, args] = nodeDelay(duration);
      return startTask(`overlap ${index}`, command, args, {
        tasks,
        commands,
        artifactRoot: f.artifactRoot,
        errorStream: f.errorStream,
      });
    });
    assert.deepEqual(await Promise.all(pending), [true, true, true]);

    const wallMs = Math.max(...commands.map((record) => record.ended_ms));
    const summary = summarizeCommands(commands, wallMs);
    assert.equal(summary.peak_concurrency, 3);
    assert.ok(summary.command_total_ms > summary.command_busy_ms);
    assert.equal(summary.overlap_ms, summary.command_total_ms - summary.command_busy_ms);
  } finally {
    f.cleanup();
  }
});

test('failed tasks retain private stdout and stderr artifacts', async () => {
  const f = fixture();
  try {
    const tasks = [];
    const commands = [];
    const passed = await startTask(
      'failing output',
      process.execPath,
      [
        '--input-type=module',
        '--eval',
        "process.stdout.write('stdout retained\\n'); process.stderr.write('stderr retained\\n'); process.exit(7)",
      ],
      { tasks, commands, artifactRoot: f.artifactRoot, errorStream: f.errorStream },
    );

    assert.equal(passed, false);
    assert.equal(commands.length, 1);
    const record = commands[0];
    assert.equal(record.status, 'failed');
    assert.equal(record.exit_code, 7);
    assert.notEqual(record.retained_output, null);
    assert.equal(fs.readFileSync(record.retained_output.stdout, 'utf8'), 'stdout retained\n');
    assert.equal(fs.readFileSync(record.retained_output.stderr, 'utf8'), 'stderr retained\n');
    assert.equal(fs.statSync(record.retained_output.stdout).mode & 0o777, 0o600);
    assert.equal(fs.statSync(record.retained_output.stderr).mode & 0o777, 0o600);
    assert.match(f.errors(), new RegExp(record.retained_output.stdout.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.match(f.errors(), new RegExp(record.retained_output.stderr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  } finally {
    f.cleanup();
  }
});

test('beginCommand starts failed and finish stamps a synchronous command result', () => {
  const commands = [];
  const command = beginCommand(commands, {
    id: 'sync child',
    kind: 'sync',
    argv: [process.execPath, '--input-type=module', '--eval', ''],
  });
  assert.equal(commands.length, 1);
  assert.equal(commands[0].status, 'failed');
  assert.equal(commands[0].duration_ms, 0);
  assert.equal(commands[0].ended_ms, commands[0].started_ms);

  const result = spawnSync(process.execPath, [
    '--input-type=module',
    '--eval',
    'const until = Date.now() + 75; while (Date.now() < until) {}',
  ]);
  const record = command.finish({ status: result.status === 0 ? 'passed' : 'failed', exit_code: result.status });
  assert.equal(record, commands[0]);
  assert.equal(record.status, 'passed');
  assert.equal(record.exit_code, 0);
  assert.equal(record.signal, null);
  assert.ok(record.duration_ms > 0);
  assert.equal(record.duration_ms, record.ended_ms - record.started_ms);
});

test('duplicate names reject before artifacts and missing binaries report ENOENT', async () => {
  const f = fixture();
  try {
    const tasks = [{ name: 'already running', duration_ms: 0, status: 'failed' }];
    const before = fs.readdirSync(f.artifactRoot);
    assert.throws(
      () =>
        startTask('already running', process.execPath, ['--version'], {
          tasks,
          artifactRoot: f.artifactRoot,
          errorStream: f.errorStream,
        }),
      { message: 'duplicate task name: already running' },
    );
    assert.deepEqual(fs.readdirSync(f.artifactRoot), before);

    const missing = path.join(f.root, 'binary-that-does-not-exist');
    assert.equal(
      await startTask('missing binary', missing, [], {
        tasks,
        artifactRoot: f.artifactRoot,
        errorStream: f.errorStream,
      }),
      false,
    );
    assert.match(f.errors(), /ENOENT/);
  } finally {
    f.cleanup();
  }
});
