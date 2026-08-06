#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as queueApi from '../../plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/plan-queue.mjs';
import {
  canonicalPlanView,
  canonicalVerificationResults,
  jcs,
} from '../../plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/plan-run.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const QUEUE_MODULE = path.join(ROOT, 'plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/plan-queue.mjs');
const HASH = '1'.repeat(64);
const COMMIT = '2'.repeat(40);
const GOALS = Object.freeze({
  root: '11111111-1111-4111-8111-111111111111',
  queue: '22222222-2222-4222-8222-222222222222',
  alpha: '33333333-3333-4333-8333-333333333333',
  beta: '44444444-4444-4444-8444-444444444444',
  gamma: '55555555-5555-4555-8555-555555555555',
  extra: '77777777-7777-4777-8777-777777777777',
});
const LABELS = Object.freeze({
  [GOALS.root]: 'Finished prerequisite',
  [GOALS.queue]: 'Plan execution queue contract',
  [GOALS.alpha]: 'Alpha plan',
  [GOALS.beta]: 'Beta plan',
  [GOALS.gamma]: 'Gamma plan',
  [GOALS.extra]: 'Unrelated plan',
});
const cases = [];

function test(name, run) {
  cases.push({ name, run });
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function workspace() {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'plan-queue-'));
  fs.mkdirSync(path.join(repo, 'docs/plans/active'), { recursive: true });
  fs.mkdirSync(path.join(repo, 'docs/plans/finished'), { recursive: true });
  return repo;
}

function reviewPhase(state) {
  if (state === 'not_required' || state === 'not_started') {
    return { state, invocations: 0, input_sha256: null, result_sha256: null };
  }
  return { state, invocations: 1, input_sha256: HASH, result_sha256: HASH };
}

function planBytes({ goalId, label, logicalPath, status }) {
  const finished = status === 'finished';
  const started = status === 'ongoing' || finished;
  const blocked = status === 'blocked';
  const run = {
    schema: 1,
    goal_id: goalId,
    run_id: randomUUID(),
    repository_id: 'fixture/plan-queue',
    plan_path: logicalPath,
    requested_effects: ['local'],
    risk: 'local',
    plan_sha256: HASH,
    source_base: COMMIT,
    source_sha256: HASH,
    draft_review: reviewPhase('passed'),
    execution_parent: started ? COMMIT : null,
    implementation_commit: null,
    completion_review: reviewPhase('not_required'),
    acceptance: finished ? { source_sha256: HASH, verification_sha256: HASH } : null,
    blocker: blocked ? { kind: 'user_decision', evidence_sha256: HASH } : null,
  };
  const render = (record) =>
    Buffer.from(
      [
        '---',
        `title: ${label}`,
        `status: ${status}`,
        '---',
        '',
        `# ${label}`,
        '',
        `Plan-run: ${jcs(record)}`,
        '',
        '## Verification Results',
        '',
        'Synthetic queue fixture proof.',
        '',
      ].join('\n'),
    );
  const draft = render(run);
  run.plan_sha256 = sha256(canonicalPlanView(draft));
  if (finished) run.acceptance.verification_sha256 = sha256(canonicalVerificationResults(draft));
  return render(run);
}

function writePlan(repo, { goalId, label = LABELS[goalId], status = 'planned', location = 'active', name }) {
  const filename = name ?? `${goalId}.md`;
  const logicalPath = `docs/plans/${location}/${filename}`;
  const file = path.join(repo, logicalPath);
  const bytes = planBytes({ goalId, label, logicalPath, status });
  fs.writeFileSync(file, bytes);
  return { bytes, file, logicalPath };
}

function row(stage, goalId, dependsOn = [], why = 'Required by the fixture', label = LABELS[goalId]) {
  return { stage, goal_id: goalId, label, depends_on: dependsOn, why };
}

function queueBytes(rows, { marker = true } = {}) {
  const lines = ['# Plan execution queue', ''];
  if (marker) lines.push(queueApi.QUEUE_MARKER, '');
  lines.push('| Stage | Goal ID | Plan | Depends on | Why |', '|---:|---|---|---|---|');
  for (const item of rows) {
    const dependencies = item.depends_on.length === 0 ? '—' : item.depends_on.join(', ');
    lines.push(`| ${item.stage} | ${item.goal_id} | \`${item.label}\` | ${dependencies} | ${item.why} |`);
  }
  lines.push('');
  return Buffer.from(lines.join('\n'));
}

function writeQueue(repo, rows) {
  const file = path.join(repo, 'docs/plans/QUEUE.md');
  const bytes = queueBytes(rows);
  fs.writeFileSync(file, bytes);
  return { bytes, file };
}

function assertRejects(action, pattern, message) {
  assert.throws(action, pattern, message);
}

async function assertRejectsAsync(action, pattern, message) {
  await assert.rejects(action, pattern, message);
}

function planSnapshot(repo) {
  const snapshot = new Map();
  const visit = (directory) => {
    for (const entry of fs
      .readdirSync(directory, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name))) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        visit(file);
      } else {
        const relative = path.relative(repo, file);
        if (relative !== 'docs/plans/QUEUE.md') snapshot.set(relative, fs.readFileSync(file));
      }
    }
  };
  visit(repo);
  return snapshot;
}

function assertPlanSnapshot(repo, expected) {
  const actual = planSnapshot(repo);
  assert.deepEqual([...actual.keys()], [...expected.keys()]);
  for (const [relative, bytes] of expected) {
    assert.ok(actual.get(relative).equals(bytes), `${relative} changed during a queue-only operation`);
  }
}

function withRepo(run) {
  const repo = workspace();
  try {
    return run(repo);
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
}

function withRepoAsync(run) {
  const repo = workspace();
  return Promise.resolve()
    .then(() => run(repo))
    .finally(() => fs.rmSync(repo, { recursive: true, force: true }));
}

test('parses a valid queue', () =>
  withRepo((repo) => {
    writePlan(repo, { goalId: GOALS.alpha });
    const bytes = queueBytes([row(1, GOALS.alpha)]);
    const parsed = queueApi.parseQueue(bytes);
    assert.equal(parsed.marker, queueApi.QUEUE_MARKER);
    assert.equal(parsed.headerIndex >= 0, true);
    assert.deepEqual(parsed.rows, [row(1, GOALS.alpha)]);
    assert.equal(queueApi.validateQueue(bytes, { repo }).rows[0].path, `docs/plans/active/${GOALS.alpha}.md`);
  }));

test('rejects a missing marker', () =>
  withRepo((repo) => {
    writePlan(repo, { goalId: GOALS.alpha });
    const bytes = queueBytes([row(1, GOALS.alpha)], { marker: false });
    assertRejects(() => queueApi.validateQueue(bytes, { repo }), /marker/i);
  }));

test('rejects a duplicated marker', () =>
  withRepo((repo) => {
    const bytes = Buffer.from(`${queueBytes([])}${queueApi.QUEUE_MARKER}\n`);
    assertRejects(() => queueApi.validateQueue(bytes, { repo }), /marker/i);
  }));

// Bootstrap may seed an empty queue, so the zero-row shape is a shipped promise in both the
// workspace skill and the schema reference. It also exercises two paths no populated fixture
// reaches: the parse loop taking zero iterations, and the first `add` splicing into an empty body.
test('an empty bootstrapped queue is valid and accepts its first row', async () =>
  withRepoAsync(async (repo) => {
    writePlan(repo, { goalId: GOALS.alpha });
    const empty = queueBytes([]);
    assert.deepEqual(queueApi.parseQueue(empty).rows, []);
    assert.deepEqual(queueApi.validateQueue(empty, { repo }).rows, []);
    assert.deepEqual(queueApi.nextQueue(empty, { repo }), { eligible: [], blocked: [] });

    const { bytes, file } = writeQueue(repo, []);
    const plans = planSnapshot(repo);
    const result = await queueApi.addQueueRow({
      file,
      repo,
      expectedBytesSha256: sha256(bytes),
      row: row(1, GOALS.alpha),
      lockRoot: path.join(repo, '.locks'),
      lockTimeoutMs: 250,
    });
    assert.deepEqual(
      result.rows.map((item) => item.goal_id),
      [GOALS.alpha],
    );
    assert.deepEqual(queueApi.validateQueue(fs.readFileSync(file), { repo }).rows.length, 1);
    assertPlanSnapshot(repo, plans);
  }));

test('rejects a missing table', () =>
  withRepo((repo) => {
    const bytes = Buffer.from(`${queueApi.QUEUE_MARKER}\n`);
    assertRejects(() => queueApi.validateQueue(bytes, { repo }), /table/i);
  }));

test('rejects a duplicated table', () =>
  withRepo((repo) => {
    const table = '| Stage | Goal ID | Plan | Depends on | Why |\n|---:|---|---|---|---|\n';
    const bytes = Buffer.from(`${queueApi.QUEUE_MARKER}\n${table}\n${table}`);
    assertRejects(() => queueApi.validateQueue(bytes, { repo }), /table/i);
  }));

test('rejects a malformed row', () =>
  withRepo((repo) => {
    const bytes = Buffer.from(
      `${queueApi.QUEUE_MARKER}\n\n| Stage | Goal ID | Plan | Depends on | Why |\n` +
        '|---:|---|---|---|---|\n| 1 | too few | cells |\n',
    );
    assertRejects(() => queueApi.validateQueue(bytes, { repo }), /row/i);
  }));

test('rejects a non-positive stage', () =>
  withRepo((repo) => {
    writePlan(repo, { goalId: GOALS.alpha });
    assertRejects(() => queueApi.validateQueue(queueBytes([row(0, GOALS.alpha)]), { repo }), /stage/i);
  }));

test('rejects a non-integer stage', () =>
  withRepo((repo) => {
    writePlan(repo, { goalId: GOALS.alpha });
    assertRejects(() => queueApi.validateQueue(queueBytes([row('1.5', GOALS.alpha)]), { repo }), /stage/i);
  }));

test('rejects a non-UUID goal id', () =>
  withRepo((repo) => {
    const bytes = queueBytes([row(1, 'not-a-uuid', [], 'Reason', 'Bad')]);
    assertRejects(() => queueApi.validateQueue(bytes, { repo }), /UUID/i);
  }));

test('rejects a duplicated goal id', () =>
  withRepo((repo) => {
    writePlan(repo, { goalId: GOALS.alpha });
    const bytes = queueBytes([row(1, GOALS.alpha), row(2, GOALS.alpha)]);
    assertRejects(() => queueApi.validateQueue(bytes, { repo }), /duplicate.*goal/i);
  }));

test('rejects an empty reason', () =>
  withRepo((repo) => {
    writePlan(repo, { goalId: GOALS.alpha });
    assertRejects(() => queueApi.validateQueue(queueBytes([row(1, GOALS.alpha, [], '')]), { repo }), /reason/i);
  }));

test('rejects a dangling dependency', () =>
  withRepo((repo) => {
    writePlan(repo, { goalId: GOALS.alpha });
    const bytes = queueBytes([row(2, GOALS.alpha, [GOALS.root])]);
    assertRejects(() => queueApi.validateQueue(bytes, { repo }), /unqueued|dangling/i);
  }));

test('rejects a same-stage dependency', () =>
  withRepo((repo) => {
    writePlan(repo, { goalId: GOALS.alpha });
    writePlan(repo, { goalId: GOALS.beta });
    const rows = [row(1, GOALS.alpha), row(1, GOALS.beta, [GOALS.alpha])];
    assertRejects(() => queueApi.validateQueue(queueBytes(rows), { repo }), /same.*stage|lower stage/i);
  }));

test('rejects a later-stage dependency', () =>
  withRepo((repo) => {
    writePlan(repo, { goalId: GOALS.alpha });
    writePlan(repo, { goalId: GOALS.beta });
    const rows = [row(1, GOALS.beta, [GOALS.alpha]), row(2, GOALS.alpha)];
    assertRejects(() => queueApi.validateQueue(queueBytes(rows), { repo }), /later.*stage|lower stage/i);
  }));

test('rejects a dependency cycle', () =>
  withRepo((repo) => {
    writePlan(repo, { goalId: GOALS.alpha });
    writePlan(repo, { goalId: GOALS.beta });
    const rows = [row(1, GOALS.alpha, [GOALS.beta]), row(2, GOALS.beta, [GOALS.alpha])];
    assertRejects(() => queueApi.validateQueue(queueBytes(rows), { repo }), /cycle/i);
  }));

test('rejects a stale Plan label and names both exact labels', () =>
  withRepo((repo) => {
    const title = LABELS[GOALS.alpha];
    const stale = `${title}!`;
    writePlan(repo, { goalId: GOALS.alpha, label: title });
    let failure;
    try {
      queueApi.validateQueue(queueBytes([row(1, GOALS.alpha, [], 'Reason', stale)]), { repo });
    } catch (error) {
      failure = error;
    }
    assert.ok(failure instanceof Error, 'stale Plan label must fail validation');
    assert.ok(failure.message.includes(stale), `stale-label error must name queued label exactly: ${stale}`);
    assert.ok(failure.message.includes(title), `stale-label error must name resolved title exactly: ${title}`);
  }));

test('returns every startable row in stage-then-table priority order', () =>
  withRepo((repo) => {
    writePlan(repo, { goalId: GOALS.root, status: 'finished', location: 'finished' });
    for (const goalId of [GOALS.beta, GOALS.alpha, GOALS.gamma]) writePlan(repo, { goalId });
    const rows = [
      row(1, GOALS.root),
      row(2, GOALS.beta, [GOALS.root]),
      row(2, GOALS.alpha, [GOALS.root]),
      row(3, GOALS.gamma, [GOALS.root]),
    ];
    const result = queueApi.nextQueue(queueBytes(rows), { repo });
    // Several plans may run at once, so `next` reports the whole startable set rather than one
    // winner. Stage is priority, not a gate: the stage-3 row is startable because its own closure
    // is finished, and it must not be hidden merely because stage-2 rows are also startable.
    assert.deepEqual(
      result.eligible.map((item) => item.goal_id),
      [GOALS.beta, GOALS.alpha, GOALS.gamma],
    );
    assert.deepEqual(
      result.eligible.map((item) => item.stage),
      [2, 2, 3],
    );
    assert.deepEqual(result.blocked, []);
  }));

test('blocks a row whose transitive dependency is ongoing', () =>
  withRepo((repo) => {
    writePlan(repo, { goalId: GOALS.root, status: 'finished', location: 'finished' });
    writePlan(repo, { goalId: GOALS.alpha, status: 'ongoing' });
    writePlan(repo, { goalId: GOALS.beta });
    writePlan(repo, { goalId: GOALS.gamma });
    // Gamma sits two levels below the unfinished goal, so its report is the one that distinguishes a
    // transitive closure from a direct-only one: direct-only yields [beta], transitive yields
    // [alpha, beta]. Asserting only beta's report would pass under either implementation.
    const rows = [
      row(1, GOALS.root),
      row(2, GOALS.alpha, [GOALS.root]),
      row(3, GOALS.beta, [GOALS.alpha]),
      row(4, GOALS.gamma, [GOALS.beta]),
    ];
    const result = queueApi.nextQueue(queueBytes(rows), { repo });
    assert.equal(
      result.eligible.some((item) => item.goal_id === GOALS.beta || item.goal_id === GOALS.gamma),
      false,
    );
    const blocked = result.blocked.find(({ row: item }) => item.goal_id === GOALS.beta);
    assert.ok(blocked, 'transitively blocked row must be reported');
    assert.deepEqual(blocked.waiting_on, [GOALS.alpha]);
    const deep = result.blocked.find(({ row: item }) => item.goal_id === GOALS.gamma);
    assert.ok(deep, 'a row two levels below the unfinished goal must be reported');
    assert.deepEqual(deep.waiting_on, [GOALS.alpha, GOALS.beta]);
  }));

test('rejects a dependency state that contradicts resolved PlanRun status', () =>
  withRepo((repo) => {
    // A finished row cannot depend on unfinished work, because eligibility is inductive over the
    // graph. Without this rejection a single mislabelled record would license the whole subtree.
    writePlan(repo, { goalId: GOALS.root, status: 'planned' });
    writePlan(repo, { goalId: GOALS.alpha, status: 'finished', location: 'finished' });
    const bytes = queueBytes([row(1, GOALS.root), row(2, GOALS.alpha, [GOALS.root])]);
    assertRejects(() => queueApi.validateQueue(bytes, { repo }), /contradict/i);
  }));

test('allows an independent higher-stage row past unrelated unfinished work', () =>
  withRepo((repo) => {
    writePlan(repo, { goalId: GOALS.root, status: 'finished', location: 'finished' });
    writePlan(repo, { goalId: GOALS.alpha, status: 'ongoing' });
    writePlan(repo, { goalId: GOALS.beta });
    const rows = [row(1, GOALS.root), row(2, GOALS.alpha, [GOALS.root]), row(4, GOALS.beta, [GOALS.root])];
    const result = queueApi.nextQueue(queueBytes(rows), { repo });
    assert.deepEqual(
      result.eligible.map((item) => item.goal_id),
      [GOALS.beta],
    );
  }));

test('waits for the queued queue-contract prerequisite to finish', () =>
  withRepo((repo) => {
    writePlan(repo, { goalId: GOALS.root, status: 'finished', location: 'finished' });
    const queuePlan = writePlan(repo, { goalId: GOALS.queue, status: 'ongoing' });
    writePlan(repo, { goalId: GOALS.alpha });
    const rows = [row(1, GOALS.root), row(2, GOALS.queue, [GOALS.root]), row(3, GOALS.alpha, [GOALS.queue])];
    const bytes = queueBytes(rows);
    assert.equal(
      queueApi.nextQueue(bytes, { repo }).eligible.some((item) => item.goal_id === GOALS.alpha),
      false,
    );
    const finished = planBytes({
      goalId: GOALS.queue,
      label: LABELS[GOALS.queue],
      logicalPath: queuePlan.logicalPath,
      status: 'finished',
    });
    fs.writeFileSync(queuePlan.file, finished);
    assert.deepEqual(
      queueApi.nextQueue(bytes, { repo }).eligible.map((item) => item.goal_id),
      [GOALS.alpha],
    );
  }));

test('resolves a queued goal after it moves from active to finished', () =>
  withRepo((repo) => {
    const active = writePlan(repo, { goalId: GOALS.alpha });
    const bytes = queueBytes([row(1, GOALS.alpha)]);
    assert.equal(queueApi.validateQueue(bytes, { repo }).rows[0].status, 'planned');
    fs.rmSync(active.file);
    writePlan(repo, { goalId: GOALS.alpha, status: 'finished', location: 'finished' });
    const resolved = queueApi.validateQueue(bytes, { repo }).rows[0];
    assert.equal(resolved.status, 'finished');
    assert.match(resolved.path, /^docs\/plans\/finished\//);
  }));

test('ignores unrelated workspace growth outside the queue subset', () =>
  withRepo((repo) => {
    writePlan(repo, { goalId: GOALS.alpha });
    const bytes = queueBytes([row(1, GOALS.alpha)]);
    assert.equal(queueApi.validateQueue(bytes, { repo }).rows.length, 1);
    writePlan(repo, { goalId: GOALS.extra });
    assert.equal(queueApi.validateQueue(bytes, { repo }).rows.length, 1);
  }));

test('rejects ambiguous queued goal resolution', () =>
  withRepo((repo) => {
    writePlan(repo, { goalId: GOALS.alpha, name: 'first.md' });
    writePlan(repo, { goalId: GOALS.alpha, name: 'second.md', location: 'finished', status: 'finished' });
    assertRejects(() => queueApi.validateQueue(queueBytes([row(1, GOALS.alpha)]), { repo }), /multiple|ambiguous/i);
  }));

test('rejects dangling queued goal resolution', () =>
  withRepo((repo) => {
    const bytes = queueBytes([row(1, GOALS.alpha)]);
    assertRejects(() => queueApi.validateQueue(bytes, { repo }), /zero|missing|no.*record/i);
  }));

test('skips legacy files that are not valid PlanRunV1 records', () =>
  withRepo((repo) => {
    writePlan(repo, { goalId: GOALS.alpha });
    fs.writeFileSync(path.join(repo, 'docs/plans/finished/legacy.md'), '# Historical schema without Plan-run\n');
    assert.equal(queueApi.validateQueue(queueBytes([row(1, GOALS.alpha)]), { repo }).rows.length, 1);
  }));

test('add succeeds, rejects stale preimages, and changes only queue bytes', async () =>
  withRepoAsync(async (repo) => {
    writePlan(repo, { goalId: GOALS.root, status: 'finished', location: 'finished' });
    writePlan(repo, { goalId: GOALS.alpha });
    writePlan(repo, { goalId: GOALS.beta });
    writePlan(repo, { goalId: GOALS.gamma });
    const { bytes, file } = writeQueue(repo, [row(1, GOALS.root), row(2, GOALS.alpha, [GOALS.root])]);
    const plans = planSnapshot(repo);
    const result = await queueApi.addQueueRow({
      file,
      repo,
      expectedBytesSha256: sha256(bytes),
      row: row(2, GOALS.beta, [GOALS.root]),
      lockRoot: path.join(repo, '.locks'),
      lockTimeoutMs: 250,
    });
    assert.deepEqual(
      result.rows.map((item) => item.goal_id),
      [GOALS.root, GOALS.alpha, GOALS.beta],
    );
    assertPlanSnapshot(repo, plans);
    const after = fs.readFileSync(file);
    await assertRejectsAsync(
      () =>
        queueApi.addQueueRow({
          file,
          repo,
          expectedBytesSha256: '0'.repeat(64),
          row: row(3, GOALS.gamma, [GOALS.root]),
          lockRoot: path.join(repo, '.locks'),
          lockTimeoutMs: 250,
        }),
      /stale|preimage/i,
    );
    assert.ok(fs.readFileSync(file).equals(after));
    assertPlanSnapshot(repo, plans);
  }));

// Step 6 enumerates concurrency fixtures, and STOP condition 7 names exclusive locking. Nothing
// above contends for the lock, so every setter case takes the uncontended first-try branch and the
// whole lock could be deleted without a red test. These cases enter the held, foreign, and
// dead-owner branches, and they also pin the pre-write successor validation that rejects a bad
// mutation before any byte moves.
function queueLockPath(repo, file) {
  return path.join(repo, '.locks', `${sha256(Buffer.from(fs.realpathSync(file)))}.lock`);
}

function writeForeignLock(lockPath, owner) {
  fs.mkdirSync(path.dirname(lockPath), { recursive: true, mode: 0o700 });
  fs.writeFileSync(lockPath, jcs({ schema: 1, ...owner }), { mode: 0o600 });
}

function deadPid() {
  for (let candidate = 40_000; candidate < 60_000; candidate += 1) {
    try {
      process.kill(candidate, 0);
    } catch (error) {
      if (error.code === 'ESRCH') return candidate;
    }
  }
  throw new Error('no dead pid available for the stale-lock fixture');
}

test('a live lock holder blocks a setter and leaves both files untouched', async () =>
  withRepoAsync(async (repo) => {
    writePlan(repo, { goalId: GOALS.root, status: 'finished', location: 'finished' });
    writePlan(repo, { goalId: GOALS.alpha });
    const { bytes, file } = writeQueue(repo, [row(1, GOALS.root)]);
    const digest = sha256(bytes);
    const lockPath = queueLockPath(repo, file);
    writeForeignLock(lockPath, {
      hostname: os.hostname(),
      pid: process.pid,
      expected_preimage: digest,
      nonce: randomUUID(),
    });
    const lockBefore = fs.readFileSync(lockPath);
    await assertRejectsAsync(
      () =>
        queueApi.addQueueRow({
          file,
          repo,
          expectedBytesSha256: digest,
          row: row(2, GOALS.alpha, [GOALS.root]),
          lockRoot: path.join(repo, '.locks'),
          lockTimeoutMs: 20,
        }),
      /held|timed out/i,
    );
    assert.ok(fs.readFileSync(file).equals(bytes), 'a blocked setter must not change queue bytes');
    assert.ok(fs.readFileSync(lockPath).equals(lockBefore), 'release must not remove a lock it does not own');
    assert.deepEqual(
      fs.readdirSync(path.join(repo, 'docs/plans')).filter((name) => name.includes('.tmp')),
      [],
    );
  }));

test('a foreign-host lock is refused rather than reclaimed', async () =>
  withRepoAsync(async (repo) => {
    writePlan(repo, { goalId: GOALS.root, status: 'finished', location: 'finished' });
    writePlan(repo, { goalId: GOALS.alpha });
    const { bytes, file } = writeQueue(repo, [row(1, GOALS.root)]);
    const digest = sha256(bytes);
    const lockPath = queueLockPath(repo, file);
    writeForeignLock(lockPath, {
      hostname: `${os.hostname()}-not-this-host`,
      pid: deadPid(),
      expected_preimage: digest,
      nonce: randomUUID(),
    });
    await assertRejectsAsync(
      () =>
        queueApi.addQueueRow({
          file,
          repo,
          expectedBytesSha256: digest,
          row: row(2, GOALS.alpha, [GOALS.root]),
          lockRoot: path.join(repo, '.locks'),
          lockTimeoutMs: 20,
        }),
      /foreign/i,
    );
    assert.ok(fs.readFileSync(file).equals(bytes));
    assert.ok(fs.existsSync(lockPath), 'a foreign lock must survive the refusal');
  }));

test('a same-host dead owner is reclaimed and the lock is released afterwards', async () =>
  withRepoAsync(async (repo) => {
    writePlan(repo, { goalId: GOALS.root, status: 'finished', location: 'finished' });
    writePlan(repo, { goalId: GOALS.alpha });
    const { bytes, file } = writeQueue(repo, [row(1, GOALS.root)]);
    const digest = sha256(bytes);
    const lockPath = queueLockPath(repo, file);
    writeForeignLock(lockPath, {
      hostname: os.hostname(),
      pid: deadPid(),
      expected_preimage: digest,
      nonce: randomUUID(),
    });
    const result = await queueApi.addQueueRow({
      file,
      repo,
      expectedBytesSha256: digest,
      row: row(2, GOALS.alpha, [GOALS.root]),
      lockRoot: path.join(repo, '.locks'),
      lockTimeoutMs: 250,
    });
    assert.deepEqual(
      result.rows.map((item) => item.goal_id),
      [GOALS.root, GOALS.alpha],
    );
    assert.equal(fs.existsSync(lockPath), false, 'a completed setter must leave no lock behind');
    assert.deepEqual(
      fs.readdirSync(path.join(repo, 'docs/plans')).filter((name) => name.includes('.tmp')),
      [],
    );
  }));

test('a successor that would not validate is rejected before any byte moves', async () =>
  withRepoAsync(async (repo) => {
    writePlan(repo, { goalId: GOALS.root, status: 'finished', location: 'finished' });
    writePlan(repo, { goalId: GOALS.alpha });
    const { bytes, file } = writeQueue(repo, [row(1, GOALS.root), row(2, GOALS.alpha, [GOALS.root])]);
    const digest = sha256(bytes);
    await assertRejectsAsync(
      () =>
        queueApi.addQueueRow({
          file,
          repo,
          expectedBytesSha256: digest,
          // A duplicate goal id can only be caught by validating the successor bytes.
          row: row(3, GOALS.alpha, [GOALS.root]),
          lockRoot: path.join(repo, '.locks'),
          lockTimeoutMs: 250,
        }),
      /duplicate|unique/i,
    );
    assert.ok(fs.readFileSync(file).equals(bytes));
    assert.equal(fs.existsSync(queueLockPath(repo, file)), false, 'a refused setter must leave no lock behind');
    assert.deepEqual(
      fs.readdirSync(path.join(repo, 'docs/plans')).filter((name) => name.includes('.tmp')),
      [],
    );
  }));

// A duplicate goal id is caught by the mutate step itself, so it does not pin the successor
// validation. These two mutations are locally legal and only the whole-successor validation can
// reject them: removing a depended-upon row leaves a dangling reference, and restaging a
// dependency below its dependent inverts the strictly-earlier rule.
test('removing a depended-upon row is rejected by successor validation', async () =>
  withRepoAsync(async (repo) => {
    writePlan(repo, { goalId: GOALS.root, status: 'finished', location: 'finished' });
    writePlan(repo, { goalId: GOALS.alpha });
    const { bytes, file } = writeQueue(repo, [row(1, GOALS.root), row(2, GOALS.alpha, [GOALS.root])]);
    await assertRejectsAsync(
      () =>
        queueApi.removeQueueRow({
          file,
          repo,
          expectedBytesSha256: sha256(bytes),
          goal_id: GOALS.root,
          lockRoot: path.join(repo, '.locks'),
          lockTimeoutMs: 250,
        }),
      /dangling|unqueued|depend/i,
    );
    assert.ok(fs.readFileSync(file).equals(bytes));
  }));

test('restaging a dependency below its dependent is rejected by successor validation', async () =>
  withRepoAsync(async (repo) => {
    writePlan(repo, { goalId: GOALS.root, status: 'finished', location: 'finished' });
    writePlan(repo, { goalId: GOALS.alpha });
    const { bytes, file } = writeQueue(repo, [row(1, GOALS.root), row(2, GOALS.alpha, [GOALS.root])]);
    await assertRejectsAsync(
      () =>
        queueApi.moveQueueRow({
          depends_on: [],
          why: 'Restaged by the fixture',
          file,
          repo,
          expectedBytesSha256: sha256(bytes),
          goal_id: GOALS.root,
          stage: 3,
          lockRoot: path.join(repo, '.locks'),
          lockTimeoutMs: 250,
        }),
      /earlier stage|stage/i,
    );
    assert.ok(fs.readFileSync(file).equals(bytes));
  }));

test('move succeeds, rejects stale preimages, and changes only queue bytes', async () =>
  withRepoAsync(async (repo) => {
    writePlan(repo, { goalId: GOALS.root, status: 'finished', location: 'finished' });
    writePlan(repo, { goalId: GOALS.alpha });
    const { bytes, file } = writeQueue(repo, [row(1, GOALS.root), row(2, GOALS.alpha, [GOALS.root])]);
    const plans = planSnapshot(repo);
    const result = await queueApi.moveQueueRow({
      file,
      repo,
      expectedBytesSha256: sha256(bytes),
      goal_id: GOALS.alpha,
      stage: 3,
      depends_on: [GOALS.root],
      why: 'Priority changed explicitly',
      lockRoot: path.join(repo, '.locks'),
      lockTimeoutMs: 250,
    });
    assert.equal(result.rows.find((item) => item.goal_id === GOALS.alpha).stage, 3);
    assertPlanSnapshot(repo, plans);
    const after = fs.readFileSync(file);
    await assertRejectsAsync(
      () =>
        queueApi.moveQueueRow({
          file,
          repo,
          expectedBytesSha256: '0'.repeat(64),
          goal_id: GOALS.alpha,
          stage: 4,
          depends_on: [GOALS.root],
          why: 'Stale move',
          lockRoot: path.join(repo, '.locks'),
          lockTimeoutMs: 250,
        }),
      /stale|preimage/i,
    );
    assert.ok(fs.readFileSync(file).equals(after));
    assertPlanSnapshot(repo, plans);
  }));

test('remove succeeds, rejects stale preimages, and changes only queue bytes', async () =>
  withRepoAsync(async (repo) => {
    writePlan(repo, { goalId: GOALS.root, status: 'finished', location: 'finished' });
    writePlan(repo, { goalId: GOALS.alpha });
    writePlan(repo, { goalId: GOALS.beta });
    const { bytes, file } = writeQueue(repo, [
      row(1, GOALS.root),
      row(2, GOALS.alpha, [GOALS.root]),
      row(2, GOALS.beta, [GOALS.root]),
    ]);
    const plans = planSnapshot(repo);
    const result = await queueApi.removeQueueRow({
      file,
      repo,
      expectedBytesSha256: sha256(bytes),
      goal_id: GOALS.beta,
      lockRoot: path.join(repo, '.locks'),
      lockTimeoutMs: 250,
    });
    assert.deepEqual(
      result.rows.map((item) => item.goal_id),
      [GOALS.root, GOALS.alpha],
    );
    assertPlanSnapshot(repo, plans);
    const after = fs.readFileSync(file);
    await assertRejectsAsync(
      () =>
        queueApi.removeQueueRow({
          file,
          repo,
          expectedBytesSha256: '0'.repeat(64),
          goal_id: GOALS.alpha,
          lockRoot: path.join(repo, '.locks'),
          lockTimeoutMs: 250,
        }),
      /stale|preimage/i,
    );
    assert.ok(fs.readFileSync(file).equals(after));
    assertPlanSnapshot(repo, plans);
  }));

test('exports no queue-derived lifecycle or PlanRun authority', () => {
  assert.deepEqual(Object.keys(queueApi).sort(), [
    'QUEUE_MARKER',
    'addQueueRow',
    'moveQueueRow',
    'nextQueue',
    'parseQueue',
    'removeQueueRow',
    'resolvePlanRecords',
    'showQueue',
    'validateQueue',
  ]);
});

test('a live-compatible workspace without QUEUE.md reports no queue', () =>
  withRepo((repo) => {
    const missing = path.join(repo, 'docs/plans/QUEUE.md');
    const result = spawnSync(process.execPath, [QUEUE_MODULE, 'next', missing, '--repo', ROOT], {
      cwd: repo,
      encoding: 'utf8',
    });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /no queue/i);
    assert.equal(fs.existsSync(missing), false, 'read-only next must not create an optional queue');
  }));

let passed = 0;
for (const item of cases) {
  try {
    await item.run();
    passed += 1;
  } catch (error) {
    error.message = `${item.name}: ${error.message}`;
    throw error;
  }
}
console.log(`plan queue contracts passed (${passed} cases)`);
