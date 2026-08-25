// The release script publishes a GitHub Release on one piece of evidence: a green CI run
// for the tag it just pushed. Identifying that run by commit and event alone is not enough
// - deleting and re-pushing a tag, which the script itself advises as the recovery path,
// leaves an older completed run at the same commit with the same event. These tests drive
// the real adapter against a stubbed `gh` and pin that only the run THIS push created can
// authorize a release.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createGenericPluginReleaseIo } from '../../lib/plugin-release.mjs';
import { PLUGINS } from '../../lib/plugins.mjs';

const REPO = path.resolve(import.meta.dirname, '../../..');
const TAG = 'docks--v9.9.9';
const COMMIT = 'c'.repeat(40);
const PUSHED_AT = '2026-08-06T12:00:00.400Z';

const stubRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'docks-tag-ci-'));
const binDir = path.join(stubRoot, 'bin');
const runsFile = path.join(stubRoot, 'runs.json');
const watchedFile = path.join(stubRoot, 'watched');
fs.mkdirSync(binDir, { mode: 0o700 });
// `gh run list` answers from a file the test rewrites per case; `gh run watch` records the
// run id it was asked to watch, which is the whole point of the identity check. `--jq` is
// honoured the way real `gh` honours it, so a selection expression pushed into the CLI is
// simulated as faithfully as one evaluated in JavaScript.
fs.writeFileSync(
  path.join(binDir, 'gh'),
  `#!/bin/sh
if [ "$1" = "run" ] && [ "$2" = "list" ]; then
  if [ -n "$GH_LIST_FAILS" ]; then echo "gh: rate limited" >&2; exit 1; fi
  while [ $# -gt 0 ]; do
    if [ "$1" = "--jq" ]; then jq -r "$2" "${runsFile}"; exit 0; fi
    shift
  done
  cat "${runsFile}"
  exit 0
fi
if [ "$1" = "run" ] && [ "$2" = "watch" ]; then
  printf '%s' "$3" > "${watchedFile}"
  exit "\${GH_WATCH_STATUS:-0}"
fi
exit 64
`,
  { mode: 0o755 },
);
// The poll sleeps between attempts; a no-op keeps the 30-attempt exhaustion case fast.
fs.writeFileSync(path.join(binDir, 'sleep'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
process.env.PATH = `${binDir}${path.delimiter}${process.env.PATH ?? ''}`;
process.on('exit', () => fs.rmSync(stubRoot, { recursive: true, force: true }));

const io = createGenericPluginReleaseIo({ repo: REPO, plugins: PLUGINS });
const run = (overrides) => ({
  databaseId: 1,
  headSha: COMMIT,
  headBranch: TAG,
  event: 'push',
  createdAt: '2026-08-06T12:00:04Z',
  ...overrides,
});
const listRuns = (rows) => {
  fs.writeFileSync(runsFile, JSON.stringify(rows));
  fs.rmSync(watchedFile, { force: true });
};
const watched = () => (fs.existsSync(watchedFile) ? fs.readFileSync(watchedFile, 'utf8') : null);

// The stale run is complete and green, so `gh run watch` on it would exit 0 and the release
// would be published on CI the new tag never produced.
const staleRun = run({ databaseId: 30847502750, createdAt: '2026-08-03T19:50:18Z' });
const currentRun = run({ databaseId: 30939989435, createdAt: '2026-08-06T12:00:04Z' });

test('the run created by this push is the one watched, not the stale one beside it', () => {
  listRuns([currentRun, staleRun]);
  const result = io.waitForTagCi(TAG, COMMIT, PUSHED_AT);
  assert.equal(watched(), '30939989435');
  assert.deepEqual(result, {
    ok: true,
    runId: '30939989435',
    tag: TAG,
    commit: COMMIT,
    event: 'push',
    createdAt: '2026-08-06T12:00:04Z',
  });
});

test('a stale run alone is never accepted, however green it is', () => {
  listRuns([staleRun]);
  assert.throws(() => io.waitForTagCi(TAG, COMMIT, PUSHED_AT), /no CI run appeared/);
  assert.equal(watched(), null, 'a run created before this push must never be watched');
});

test('ambiguity fails loudly instead of picking', () => {
  listRuns([currentRun, run({ databaseId: 30939989999, createdAt: '2026-08-06T12:00:09Z' })]);
  assert.throws(() => io.waitForTagCi(TAG, COMMIT, PUSHED_AT), /2 CI runs match/);
  assert.equal(watched(), null);
});

test('another tag at the same commit is not this tag', () => {
  listRuns([run({ headBranch: 'plan-lifecycle--v0.4.0' })]);
  assert.throws(() => io.waitForTagCi(TAG, COMMIT, PUSHED_AT), /no CI run appeared/);
});

test('a non-push run at the same commit is not the tag run', () => {
  listRuns([run({ event: 'workflow_dispatch' })]);
  assert.throws(() => io.waitForTagCi(TAG, COMMIT, PUSHED_AT), /no CI run appeared/);
});

test('a run created in the same whole second as the push still counts', () => {
  // GitHub reports creation to the second, so a run created 0.1s after a push at
  // 12:00:00.400 reports 12:00:00Z. Comparing raw milliseconds would reject it forever.
  listRuns([run({ databaseId: 42, createdAt: '2026-08-06T12:00:00Z' })]);
  assert.equal(io.waitForTagCi(TAG, COMMIT, PUSHED_AT).runId, '42');
});

test('a red run is reported red rather than thrown away', () => {
  listRuns([currentRun]);
  process.env.GH_WATCH_STATUS = '1';
  try {
    assert.equal(io.waitForTagCi(TAG, COMMIT, PUSHED_AT).ok, false);
  } finally {
    process.env.GH_WATCH_STATUS = '0';
  }
});

test('an unusable listing fails closed instead of polling into a timeout', () => {
  listRuns([currentRun]);
  process.env.GH_LIST_FAILS = '1';
  try {
    assert.throws(() => io.waitForTagCi(TAG, COMMIT, PUSHED_AT), /gh run list failed/);
  } finally {
    process.env.GH_LIST_FAILS = '';
  }
  fs.writeFileSync(runsFile, 'not json');
  assert.throws(() => io.waitForTagCi(TAG, COMMIT, PUSHED_AT), /returned no run list/);
  fs.writeFileSync(runsFile, '{"databaseId":1}');
  assert.throws(() => io.waitForTagCi(TAG, COMMIT, PUSHED_AT), /returned no run list/);
});

test('a wait with no push timestamp cannot bind a run to anything', () => {
  listRuns([currentRun]);
  for (const pushedAt of [undefined, null, '', 'whenever', 42]) {
    assert.throws(() => io.waitForTagCi(TAG, COMMIT, pushedAt), /no usable push timestamp/);
  }
  assert.equal(watched(), null);
});
