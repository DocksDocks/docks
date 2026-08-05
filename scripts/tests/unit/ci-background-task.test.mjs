import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Writable } from 'node:stream';
import test from 'node:test';
import { beginCommand, startTask, summarizeCommands } from '../../lib/ci-background-task.mjs';

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ci-background-task-test-'));
  const artifactRoot = path.join(root, 'artifacts');
  fs.mkdirSync(artifactRoot);
  let errors = '';
  const errorStream = new Writable({
    write(chunk, _encoding, callback) {
      errors += chunk.toString();
      callback();
    },
  });
  return {
    root,
    artifactRoot,
    errorStream,
    errors: () => errors,
    cleanup: () => fs.rmSync(root, { recursive: true, force: true }),
  };
}

function nodeDelay(milliseconds, exitCode = 0) {
  return [
    process.execPath,
    ['--input-type=module', '--eval', `setTimeout(() => process.exit(${exitCode}), ${milliseconds})`],
  ];
}

// The child reports its own lifetime, and the recorded duration must match that report. A wall-clock
// constant would be wrong here: under load this host has been observed running a nominal one-second
// child for 2.5 s, which is a true measurement, not a defect. Matching the child's self-report still
// fails hard against await-lifetime accounting, because that reports the blocking window instead.
test('background duration follows the child lifetime while the main thread is blocked', async () => {
  const f = fixture();
  try {
    const tasks = [];
    const commands = [];
    const reportPath = path.join(f.root, 'child-lifetime.json');
    const childSource = [
      "import fs from 'node:fs';",
      'const bootNs = process.hrtime.bigint();',
      'setTimeout(() => {',
      '  const selfMs = Number(process.hrtime.bigint() - bootNs) / 1e6;',
      '  fs.writeFileSync(process.argv[1], JSON.stringify({ self_ms: selfMs }));',
      '  process.exit(0);',
      '}, 1000);',
    ].join('\n');
    const wallStartedAt = process.hrtime.bigint();
    const pending = startTask(
      'timed child',
      process.execPath,
      ['--input-type=module', '--eval', childSource, '--', reportPath],
      {
        tasks,
        commands,
        artifactRoot: f.artifactRoot,
        errorStream: f.errorStream,
      },
    );

    const blocker = spawnSync(
      process.execPath,
      ['--input-type=module', '--eval', 'const until = Date.now() + 2500; while (Date.now() < until) {}'],
      { encoding: 'utf8' },
    );
    assert.equal(blocker.status, 0, blocker.stderr);
    assert.equal(await pending, true);
    const awaitedWallMs = Number((process.hrtime.bigint() - wallStartedAt) / 1_000_000n);
    const childSelfMs = JSON.parse(fs.readFileSync(reportPath, 'utf8')).self_ms;

    assert.equal(tasks.length, 1);
    assert.ok(awaitedWallMs >= 2400, `blocking window collapsed: awaited ${awaitedWallMs} ms`);
    assert.ok(
      Math.abs(tasks[0].duration_ms - childSelfMs) <= 250,
      `recorded ${tasks[0].duration_ms} ms but the child measured ${Math.round(childSelfMs)} ms`,
    );
    assert.ok(
      tasks[0].duration_ms <= childSelfMs + 250,
      `recorded ${tasks[0].duration_ms} ms is await-shaped against a ${Math.round(childSelfMs)} ms child`,
    );
    assert.ok(tasks[0].duration_ms <= awaitedWallMs, `recorded ${tasks[0].duration_ms} ms exceeds the awaited window`);
    assert.equal(commands[0].duration_ms, tasks[0].duration_ms);
  } finally {
    f.cleanup();
  }
});

// A chatty child must not be throttled by the orchestrator's blocked event loop. When the parent
// relayed the child's output, one pipe buffer of backpressure suspended the child until the join
// point, and the recorded lifetime became the blocking window. The full gate reproduced exactly
// that: `pnpm run check:js` runs in about one second and was recorded at 356 s.
test('a child that outwrites one pipe buffer is not throttled by the blocked parent', async () => {
  const f = fixture();
  try {
    const tasks = [];
    const commands = [];
    const chatty = [
      'let written = 0;',
      'const tick = () => {',
      '  while (written < 8 * 1024) {',
      '    written += 1;',
      "    if (!process.stdout.write('x'.repeat(1024))) {",
      "      process.stdout.once('drain', tick);",
      '      return;',
      '    }',
      '  }',
      '  process.exit(0);',
      '};',
      'tick();',
    ].join('\n');
    const pending = startTask('chatty child', process.execPath, ['--input-type=module', '--eval', chatty], {
      tasks,
      commands,
      artifactRoot: f.artifactRoot,
      errorStream: f.errorStream,
    });

    const blocker = spawnSync(
      process.execPath,
      ['--input-type=module', '--eval', 'const until = Date.now() + 3000; while (Date.now() < until) {}'],
      { encoding: 'utf8' },
    );
    assert.equal(blocker.status, 0, blocker.stderr);
    assert.equal(await pending, true);

    assert.ok(
      tasks[0].duration_ms < 1500,
      `an 8 MiB writer behind a 3 s block recorded ${tasks[0].duration_ms} ms, so the parent throttled it`,
    );
    assert.equal(commands[0].status, 'passed');
  } finally {
    f.cleanup();
  }
});

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
