import assert from 'node:assert/strict';
import test from 'node:test';
import { startTask } from '../../lib/ci-background-task.mjs';
import { blockEventLoop, fixture } from './ci-background-task.fixture.mjs';

// The 8 MiB writer took at most 190 ms under 4-core load, so an unthrottled run clears the threshold
// about fourfold, while a throttled one is held for the whole block, twice the threshold.
const BLOCK_MS = 1500;
const THROTTLED_THRESHOLD_MS = 750;
const MAX_ATTEMPTS = 3;

// A chatty child must not be throttled by the orchestrator's blocked event loop. When the parent
// relayed the child's output, one pipe buffer of backpressure suspended the child until the join
// point, and the recorded lifetime became the blocking window. The full gate reproduced exactly
// that: `bun run check:js` runs in about one second and was recorded at 356 s.
//
// Best-of-N on purpose, and the reason is a property of what is being measured. "The parent does
// not FORCE serialization" is disproved by a single clean observation, whereas one slow
// observation proves nothing: on a loaded host the kernel can legitimately starve the writer and
// the recorded lifetime approaches the block by scheduling alone. That is what a single sample kept
// reporting while the blocker still busy-looped — 3013 ms against a 3000 ms block — with the same
// bytes passing on the next run. A real regression reintroduces backpressure deterministically and
// is throttled on EVERY attempt, so this still fails closed on the defect it exists to catch while
// no longer failing on the machine's load.
test('a child that outwrites one pipe buffer is not throttled by the blocked parent', async () => {
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

  const attempts = [];
  for (
    let attempt = 0;
    attempt < MAX_ATTEMPTS && (attempts.length === 0 || attempts.at(-1) >= THROTTLED_THRESHOLD_MS);
    attempt += 1
  ) {
    const f = fixture();
    try {
      const tasks = [];
      const commands = [];
      const pending = startTask('chatty child', process.execPath, ['--input-type=module', '--eval', chatty], {
        tasks,
        commands,
        artifactRoot: f.artifactRoot,
        errorStream: f.errorStream,
      });

      const blocker = blockEventLoop(BLOCK_MS);
      assert.equal(blocker.status, 0, blocker.stderr);
      assert.equal(await pending, true);
      assert.equal(commands[0].status, 'passed');
      attempts.push(tasks[0].duration_ms);
    } finally {
      f.cleanup();
    }
  }

  assert.ok(
    attempts.some((duration) => duration < THROTTLED_THRESHOLD_MS),
    `an 8 MiB writer behind a ${BLOCK_MS} ms block was throttled on every attempt (${attempts.join(' ms, ')} ms), ` +
      'so the parent serializes it rather than the host merely being busy',
  );
});
