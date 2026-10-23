import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { startTask } from '../../lib/ci-background-task.mjs';
import { blockEventLoop, fixture } from './ci-background-task.fixture.mjs';

// An await-shaped duration spans the whole block, so it lands at least MIN_AWAITED_MS - CHILD_MS
// (650 ms) away from the child's own report: well outside the 250 ms tolerance, which still absorbs
// the launcher's startup and the parent's placement of the interval.
const CHILD_MS = 300;
const BLOCK_MS = 1000;
// Timer granularity may shave a little off the nominal block, never more.
const MIN_AWAITED_MS = 950;
const SELF_REPORT_TOLERANCE_MS = 250;

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
      `}, ${CHILD_MS});`,
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

    const blocker = blockEventLoop(BLOCK_MS);
    assert.equal(blocker.status, 0, blocker.stderr);
    assert.equal(await pending, true);
    const awaitedWallMs = Number((process.hrtime.bigint() - wallStartedAt) / 1_000_000n);
    const childSelfMs = JSON.parse(fs.readFileSync(reportPath, 'utf8')).self_ms;

    assert.equal(tasks.length, 1);
    assert.ok(awaitedWallMs >= MIN_AWAITED_MS, `blocking window collapsed: awaited ${awaitedWallMs} ms`);
    assert.ok(
      Math.abs(tasks[0].duration_ms - childSelfMs) <= SELF_REPORT_TOLERANCE_MS,
      `recorded ${tasks[0].duration_ms} ms but the child measured ${Math.round(childSelfMs)} ms`,
    );
    assert.ok(
      tasks[0].duration_ms <= childSelfMs + SELF_REPORT_TOLERANCE_MS,
      `recorded ${tasks[0].duration_ms} ms is await-shaped against a ${Math.round(childSelfMs)} ms child`,
    );
    assert.ok(tasks[0].duration_ms <= awaitedWallMs, `recorded ${tasks[0].duration_ms} ms exceeds the awaited window`);
    assert.equal(commands[0].duration_ms, tasks[0].duration_ms);
  } finally {
    f.cleanup();
  }
});
