#!/usr/bin/env node

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Writable } from 'node:stream';
import { beginCommand, startTask, summarizeCommands } from '../lib/ci-background-task.mjs';

const COMMAND_KEYS = [
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

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'docks-ci-observability-'));
try {
  const artifactRoot = path.join(root, 'artifacts');
  fs.mkdirSync(artifactRoot);
  const passingChild = path.join(root, 'background-pass.mjs');
  const failingChild = path.join(root, 'background-fail.mjs');
  const blockingChild = path.join(root, 'sync-block.mjs');
  const syncFailure = path.join(root, 'sync-fail.mjs');
  const selfReport = (reportPath, milliseconds, exitCode, extra = '') =>
    [
      "import fs from 'node:fs';",
      'const bootNs = process.hrtime.bigint();',
      extra,
      'setTimeout(() => {',
      `  fs.writeFileSync(${JSON.stringify(reportPath)}, String(Number(process.hrtime.bigint() - bootNs) / 1e6));`,
      `  process.exit(${exitCode});`,
      `}, ${milliseconds});`,
      '',
    ].join('\n');
  const passReport = path.join(root, 'background-pass.self');
  const failReport = path.join(root, 'background-fail.self');
  fs.writeFileSync(passingChild, selfReport(passReport, 700, 0));
  fs.writeFileSync(
    failingChild,
    selfReport(
      failReport,
      500,
      9,
      "process.stdout.write('fixture stdout\\n'); process.stderr.write('fixture stderr\\n');",
    ),
  );
  fs.writeFileSync(blockingChild, 'const until = Date.now() + 1400; while (Date.now() < until) {}\n');
  fs.writeFileSync(syncFailure, "process.stderr.write('sync fixture failure\\n'); process.exit(4);\n");

  let diagnostics = '';
  const errorStream = new Writable({
    write(chunk, _encoding, callback) {
      diagnostics += chunk.toString();
      callback();
    },
  });
  const tasks = [];
  const commands = [];
  const observedAtNs = process.hrtime.bigint();

  const backgroundPass = startTask('background-pass', process.execPath, [passingChild], {
    tasks,
    commands,
    phase: 'fixture',
    artifactRoot,
    errorStream,
  });
  const backgroundFail = startTask('background-fail', process.execPath, [failingChild], {
    tasks,
    commands,
    phase: 'fixture',
    artifactRoot,
    errorStream,
  });

  const blocking = beginCommand(commands, {
    id: 'sync-block',
    kind: 'sync',
    phase: 'fixture',
    argv: [process.execPath, blockingChild],
    cwd: root,
  });
  const blockingResult = spawnSync(process.execPath, [blockingChild], { cwd: root });
  blocking.finish({
    status: blockingResult.status === 0 ? 'passed' : 'failed',
    exit_code: blockingResult.status,
    signal: blockingResult.signal,
  });
  assert.equal(blockingResult.status, 0, blockingResult.stderr?.toString());

  assert.deepEqual(await Promise.all([backgroundPass, backgroundFail]), [true, false]);

  const syncFailed = beginCommand(commands, {
    id: 'sync-fail',
    kind: 'sync',
    phase: 'fixture',
    argv: [process.execPath, syncFailure],
    cwd: root,
  });
  const syncFailureResult = spawnSync(process.execPath, [syncFailure], { cwd: root });
  syncFailed.finish({
    status: syncFailureResult.status === 0 ? 'passed' : 'failed',
    exit_code: syncFailureResult.status,
    signal: syncFailureResult.signal,
  });
  assert.equal(syncFailureResult.status, 4);

  const wallMs = Number((process.hrtime.bigint() - observedAtNs) / 1_000_000n);
  const reconstruction = summarizeCommands(commands, wallMs);
  const expectedIds = ['background-pass', 'background-fail', 'sync-block', 'sync-fail'];
  assert.equal(commands.length, expectedIds.length);
  assert.deepEqual([...commands.map((record) => record.id)].sort(), [...expectedIds].sort());
  for (const id of expectedIds) {
    assert.equal(commands.filter((record) => record.id === id).length, 1, `${id} must be recorded exactly once`);
  }
  for (const record of commands) {
    assert.deepEqual(Object.keys(record), COMMAND_KEYS, `${record.id} must be a closed CommandRecordV1`);
    assert.equal(record.duration_ms, record.ended_ms - record.started_ms);
    if (record.status === 'passed') {
      assert.notEqual(record.ended_ms, record.started_ms, `${record.id} ran but has a zero-length passed record`);
    }
  }
  const passingBackground = commands.find((record) => record.id === 'background-pass');
  const failedBackground = commands.find((record) => record.id === 'background-fail');
  // Each background child reports its own lifetime. A wall-clock bound would be a claim about host
  // scheduling, not about this module: under load a nominal 700 ms child genuinely runs far longer,
  // and that longer number is the correct measurement.
  const selfMeasured = (reportPath) => Number(fs.readFileSync(reportPath, 'utf8'));
  assert.ok(
    Math.abs(passingBackground.duration_ms - selfMeasured(passReport)) <= 250,
    `passing child measured ${Math.round(selfMeasured(passReport))} ms but was recorded as ${passingBackground.duration_ms} ms`,
  );
  assert.ok(
    Math.abs(failedBackground.duration_ms - selfMeasured(failReport)) <= 250,
    `failing child measured ${Math.round(selfMeasured(failReport))} ms but was recorded as ${failedBackground.duration_ms} ms`,
  );
  assert.ok(
    failedBackground.duration_ms <= wallMs,
    'a background duration may never exceed the observed fixture wall time',
  );

  const toleranceMs = Math.max(1000, wallMs * 0.01);
  assert.ok(Math.abs(reconstruction.wall_ms - wallMs) <= toleranceMs);
  assert.ok(
    Math.abs(reconstruction.command_busy_ms - wallMs) <= toleranceMs,
    `busy ${reconstruction.command_busy_ms} ms did not reconstruct observed ${wallMs} ms`,
  );
  assert.ok(reconstruction.command_busy_ms <= reconstruction.wall_ms);
  assert.ok(reconstruction.unaccounted_ms >= 0);
  assert.ok(reconstruction.peak_concurrency >= 2);

  assert.equal(failedBackground.status, 'failed');
  assert.notEqual(failedBackground.retained_output, null);
  assert.ok(fs.existsSync(failedBackground.retained_output.stdout));
  assert.ok(fs.existsSync(failedBackground.retained_output.stderr));
  assert.match(diagnostics, /background-fail output retained:/);

  process.stdout.write(`ci observability: ${commands.length} command records reconstruct ${wallMs} ms\n`);
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
