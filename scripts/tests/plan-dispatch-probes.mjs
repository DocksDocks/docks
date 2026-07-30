#!/usr/bin/env node
// Probes for the crash-safe dispatch driver. Test scaffolding, never payload.
//
// Every probe builds a disposable plan in a disposable git repository outside
// `docs/plans/`, so no probe can touch a real run's permits. Each exits 0 when
// its expectation holds and non-zero when it does not.
//
// Timing is never load-bearing. The stub reviewer blocks until the probe creates
// a "go" file, and the probe advances only after polling the on-disk phase, so
// "inside the dispatch window" is a causal fact rather than a sleep. The one
// remaining ordering requirement - bytes changing after the seal but before the
// reserve transaction - is enforced by holding the per-plan lock, which the
// driver must acquire (plan-run.mjs:1863-1874) before it can read its preimage.
//
// Falsify with --driver=<mutated copy>: every probe accepts an alternate driver,
// so a deleted guard can be shown to make its own probe fail.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { reviewPhase } from './plan-orchestration/fixtures/plan-run-v1.mjs';
import { git, initializeRepository, withTempDirectory } from './plan-orchestration/harness.mjs';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const ROOT = path.resolve(HERE, '../..');
const SHIPPED_DRIVER = path.join(
  ROOT,
  'plugins/docks/skills/productivity/plan-manager/scripts/lifecycle/dispatch-review.mjs',
);
const api = await import(path.join(ROOT, 'plugins/docks/skills/productivity/plan-manager/scripts/plan-run.mjs'));
const policy = await import(
  path.join(ROOT, 'plugins/docks/skills/productivity/plan-reviewer/scripts/review-policy.mjs')
);

const args = process.argv.slice(2);
const flag = (name) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit === undefined ? null : hit.slice(name.length + 3);
};
const DRIVER = flag('driver') ?? SHIPPED_DRIVER;
const PLAN_PATH = 'plans/scratch-dispatch.md';
const LOCK_BUDGET_MS = '60000';

const PASS_REVIEW = (binding) => ({
  schema: 1,
  run_id: binding.run_id,
  invocation: binding.invocation,
  plan_sha256: binding.plan_sha256,
  source_sha256: binding.source_sha256,
  verdict: 'pass',
  findings: [],
});
const REPAIR_REVIEW = (binding) => ({
  ...PASS_REVIEW(binding),
  verdict: 'repair',
  findings: [
    {
      id: 'R1',
      kind: 'contradiction',
      locator: 'Goal',
      defect: 'The scratch fixture declares a goal it never verifies.',
      fix: 'Add one acceptance row that binds the goal to an exit status.',
    },
  ],
});

// --- scratch world ---------------------------------------------------------

function renderPlan({ status, run }) {
  return Buffer.from(
    [
      '---',
      'title: Scratch dispatch fixture',
      'goal: Exercise the dispatch driver against a disposable plan.',
      `status: ${status}`,
      'created: "2026-07-30T00:00:00+00:00"',
      'updated: "2026-07-30T00:00:00+00:00"',
      'started_at: null',
      'finished_at: null',
      'affected_paths:',
      '  - tracked.txt',
      '---',
      '',
      '# Scratch dispatch fixture',
      '',
      '## Goal',
      '',
      'Exercise the dispatch driver against a disposable plan.',
      '',
      '## Steps',
      '',
      '| # | Task | Files | Depends | Effect | Status |',
      '|---|---|---|---|---|---|',
      '| 1 | Touch the tracked fixture | `tracked.txt` | — | local | planned |',
      '',
      '## Acceptance criteria',
      '',
      '| ID | Command | Expected |',
      '|---|---|---|',
      '| A1 | `true` | Exit 0 |',
      '',
      `Plan-run: ${api.jcs(run)}`,
      '',
      '## Verification Results',
      '',
      'Not yet started.',
      '',
      '## Review',
      '',
      '(pending)',
      '',
    ].join('\n'),
  );
}

function buildWorld(root, { risk = 'sensitive' } = {}) {
  const repo = path.join(root, 'repo');
  initializeRepository(repo);
  const head = git(repo, ['rev-parse', 'HEAD']).stdout;
  const manifest = api.createAffectedPathManifest({ repo, sourceBase: head, paths: ['tracked.txt'] });

  const base = {
    schema: 1,
    goal_id: '11111111-2222-4333-8444-555555555555',
    run_id: '66666666-7777-4888-8999-aaaaaaaaaaaa',
    repository_id: 'docks:scratch-dispatch',
    plan_path: PLAN_PATH,
    requested_effects: risk === 'local' ? ['local'] : ['local', 'production_access'],
    risk,
    plan_sha256: '0'.repeat(64),
    source_base: manifest.source_base,
    source_sha256: manifest.source_sha256,
    draft_review: reviewPhase('not_started'),
    execution_parent: null,
    implementation_commit: null,
    completion_review: reviewPhase(risk === 'local' ? 'not_required' : 'not_started'),
    acceptance: null,
    blocker: null,
  };
  // Two-pass bind: plan_sha256 covers the body with the record line excluded.
  const unbound = renderPlan({ status: 'drafting', run: base });
  const run = { ...base, plan_sha256: api.sha256(api.canonicalPlanView(unbound)) };

  const planFile = path.join(repo, PLAN_PATH);
  fs.mkdirSync(path.dirname(planFile), { recursive: true });
  fs.writeFileSync(planFile, renderPlan({ status: 'drafting', run }));

  const identity = { goalId: run.goal_id, planPath: PLAN_PATH, repositoryId: run.repository_id, runId: run.run_id };
  api.validatePlanRun(fs.readFileSync(planFile), identity);
  return { head, identity, outDir: path.join(root, 'out'), planFile, repo, root, run };
}

const phaseOf = (world) => api.validatePlanRun(fs.readFileSync(world.planFile), world.identity).run.draft_review;

function writeStub(world, { reply, goFile, name = 'stub' }) {
  const stub = path.join(world.root, `${name}.mjs`);
  fs.writeFileSync(
    stub,
    [
      "import fs from 'node:fs';",
      `const go = ${JSON.stringify(goFile)};`,
      'if (go !== null) {',
      '  while (!fs.existsSync(go)) await new Promise((r) => setTimeout(r, 10));',
      '}',
      `process.stdout.write(${JSON.stringify(`${JSON.stringify(reply)}\n`)});`,
    ].join('\n'),
  );
  return stub;
}

// The reply is only knowable after the driver seals, because it must bind the
// sealed invocation. Rewriting the stub before releasing it keeps the binding
// honest instead of having the probe recompute what the driver should have done.
function rebindStub(stub, previous, next) {
  const before = fs.readFileSync(stub, 'utf8');
  const from = JSON.stringify(`${JSON.stringify(previous)}\n`);
  const to = JSON.stringify(`${JSON.stringify(next)}\n`);
  assert.equal(before.split(from).length - 1, 1, 'stub must carry exactly one reply literal');
  fs.writeFileSync(stub, before.replace(from, to));
}

function startDriver(world, { body = null, stub, env = {} }) {
  const argv = [DRIVER, world.planFile, `--out-dir=${world.outDir}`, `--repo=${world.repo}`, '--commit'];
  if (body !== null) argv.push(`--body=${body}`);
  const child = spawn(process.execPath, argv, {
    cwd: world.repo,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      DOCKS_PLAN_LOCK_TIMEOUT_MS: LOCK_BUDGET_MS,
      DOCKS_REVIEWER_ARGV: JSON.stringify([process.execPath, stub]),
      ...env,
    },
  });
  const out = [];
  child.stdout.on('data', (d) => out.push(d));
  child.stderr.on('data', (d) => out.push(d));
  const done = new Promise((resolve) => {
    child.on('close', (code, signal) => resolve({ code, output: Buffer.concat(out).toString(), signal }));
  });
  return { child, done };
}

// A sealed bundle is chmod 0o500 by design, so the harness cannot unlink it.
// Relax every directory before teardown rather than weakening the seal itself.
function relaxDirectories(dir) {
  try {
    fs.chmodSync(dir, 0o700);
  } catch {
    // A directory that vanished needs no relaxing.
  }
  let entries = [];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) if (entry.isDirectory()) relaxDirectories(path.join(dir, entry.name));
}

const withScratchRoot = (prefix, operation) =>
  withTempDirectory(prefix, async (root) => {
    try {
      return await operation(root);
    } finally {
      relaxDirectories(root);
    }
  });

async function waitFor(label, predicate, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    let value = false;
    try {
      value = predicate();
    } catch {
      value = false;
    }
    if (value) return value;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error(`timed out waiting for ${label}`);
}

const waitForState = (world, states) =>
  waitFor(`draft_review in {${[...states].join(', ')}}`, () => states.has(phaseOf(world).state) && phaseOf(world));

// Reads the binding the driver actually sealed, so assertions compare against the
// live reservation rather than a value the probe recomputed.
function sealedBinding(world) {
  const dirs = fs
    .readdirSync(world.outDir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => path.join(world.outDir, e.name));
  assert.ok(dirs.length > 0, 'driver sealed no bundle');
  const newest = dirs.sort((a, b) => fs.statSync(a).mtimeMs - fs.statSync(b).mtimeMs).at(-1);
  return JSON.parse(fs.readFileSync(path.join(newest, 'binding.json'), 'utf8'));
}

// --- probes ----------------------------------------------------------------

const probes = {};

// A2: every catchable signal the driver registers must refund, never leave a bare
// `reserved`. Enumerated rather than sampled: a single-signal probe would let a
// driver register SIGTERM alone and still claim the goal.
probes['crash-refund'] = () =>
  withScratchRoot('dispatch-crash-', async (root) => {
    for (const signal of ['SIGTERM', 'SIGINT', 'SIGHUP']) {
      const world = buildWorld(path.join(root, signal));
      const stub = writeStub(world, { goFile: path.join(root, signal, 'never-go'), reply: {} });
      const { child, done } = startDriver(world, { stub });
      await waitForState(world, new Set(['reserved']));
      child.kill(signal);
      const result = await done;

      const phase = phaseOf(world);
      assert.equal(phase.state, 'retryable', `${signal}: expected a refund, found ${phase.state}`);
      assert.equal(phase.invocations, 0, `${signal}: a refund must return the permit`);
      assert.notEqual(result.code, 0, `${signal}: a crashed dispatch must not exit 0`);
      process.stdout.write(`  ok ${signal}: reserved -> retryable, permit refunded\n`);
    }
  });

// A4: the documented control. SIGKILL cannot be handled, so it must leave a bare
// `reserved` for cold entry to block. If this ever agrees with crash-refund, the
// crash probe is measuring nothing.
probes['sigkill-control'] = () =>
  withScratchRoot('dispatch-sigkill-', async (root) => {
    const world = buildWorld(root);
    const stub = writeStub(world, { goFile: path.join(root, 'never-go'), reply: {} });
    const { child, done } = startDriver(world, { stub });
    await waitForState(world, new Set(['reserved']));
    child.kill('SIGKILL');
    await done;

    const phase = phaseOf(world);
    assert.equal(phase.state, 'reserved', 'SIGKILL must leave a bare reserved');
    assert.equal(phase.invocations, 1, 'an unrefunded permit stays consumed');
    process.stdout.write('  ok SIGKILL: bare reserved, permit consumed (control holds)\n');
  });

// A3: the body edit and the reservation are ONE transaction, so bytes changing
// after the seal must refuse on the preimage with no permit spent. Driven with
// --body, because the mutation this row falsifies is moving that edit outside the
// transaction; without --body the mutation would be a no-op.
probes['stale-preimage'] = () =>
  withScratchRoot('dispatch-preimage-', async (root) => {
    const world = buildWorld(root);
    const bodyFile = path.join(root, 'repaired.md');
    fs.writeFileSync(
      bodyFile,
      fs.readFileSync(world.planFile, 'utf8').replace('Touch the tracked fixture', 'Touch the fixture'),
    );
    const stub = writeStub(world, { goFile: null, reply: {} });

    const lock = await api.acquirePlanLock({
      expectedBytesSha256: api.sha256(fs.readFileSync(world.planFile)),
      file: world.planFile,
      lockTimeoutMs: 30_000,
      planPath: PLAN_PATH,
      repositoryId: world.identity.repositoryId,
      runId: world.identity.runId,
    });

    let result;
    let released = false;
    try {
      const { done } = startDriver(world, { body: bodyFile, stub });
      // A sealed bundle proves the driver already read the preimage it will
      // present, and it cannot reach the transaction while this lock is held.
      await waitFor('sealed bundle', () => fs.existsSync(world.outDir) && sealedBinding(world));
      fs.appendFileSync(world.planFile, '\n<!-- concurrent edit -->\n');
      lock.release();
      released = true;
      result = await done;
    } finally {
      if (!released) lock.release();
    }

    assert.match(result.output, /preimage is stale/, 'the reserve must name a stale preimage');
    assert.notEqual(result.code, 0, 'a refused reserve must not exit 0');
    const phase = phaseOf(world);
    assert.equal(phase.state, 'not_started', `no permit may be spent, found ${phase.state}`);
    assert.equal(phase.invocations, 0, 'a refused reserve spends nothing');
    assert.match(fs.readFileSync(world.planFile, 'utf8'), /concurrent edit/, 'the concurrent edit must survive');
    // Deterministic in both interleavings, which no lock can order: the plan lock
    // orders the transaction body, but a mutant's pre-transaction write races the
    // append above. If that write lands first the append survives and all four
    // assertions above still hold - only the body betrays it. A refused reserve
    // must leave the ORIGINAL body on disk.
    assert.match(
      fs.readFileSync(world.planFile, 'utf8'),
      /Touch the tracked fixture/,
      'a refused reserve must not install the repaired body',
    );
    process.stdout.write('  ok stale preimage refused, phase not_started, edit intact, body not installed\n');
  });

// A5: drift after dispatch refunds rather than blocking. Without this row the
// guard is unexercised and a guard-free driver passes every other probe.
//
// The scratch prefix deliberately avoids the word "drift": the driver echoes its
// --out-dir, so a prefix containing "drift" would satisfy a /drift/ assertion
// from the fixture path alone and the row would prove nothing. The assertion
// below matches the guard's exact sentence for the same reason.
probes['head-drift'] = () =>
  withScratchRoot('dispatch-headmove-', async (root) => {
    const world = buildWorld(root);
    const goFile = path.join(root, 'go');
    const stub = writeStub(world, { goFile, reply: {} });
    const { done } = startDriver(world, { stub });

    await waitForState(world, new Set(['reserved']));
    fs.writeFileSync(path.join(world.repo, 'tracked.txt'), 'drifted\n');
    git(world.repo, ['add', 'tracked.txt']);
    git(world.repo, ['commit', '-qm', 'drift inside the dispatch window']);
    assert.notEqual(git(world.repo, ['rev-parse', 'HEAD']).stdout, world.head, 'the probe must move HEAD');
    fs.writeFileSync(goFile, 'go\n');
    const result = await done;

    assert.match(result.output, /HEAD drifted during dispatch/, 'the driver must name the drift it detected');
    const phase = phaseOf(world);
    assert.equal(phase.state, 'retryable', `drift must refund, found ${phase.state}`);
    assert.equal(phase.invocations, 0, 'a refunded permit returns to zero');
    process.stdout.write('  ok HEAD drift refunded to retryable, permit returned\n');
  });

// A6: a dry run reserves nothing and reports the sealed digest. `--help` exiting 0
// observes none of this, which is why it is a separate row.
probes['dry-run'] = () =>
  withScratchRoot('dispatch-dryrun-', async (root) => {
    const world = buildWorld(root);
    const stub = writeStub(world, { goFile: null, reply: {} });
    const before = fs.readFileSync(world.planFile);

    const child = spawn(
      process.execPath,
      [DRIVER, world.planFile, `--out-dir=${world.outDir}`, `--repo=${world.repo}`],
      {
        cwd: world.repo,
        env: { ...process.env, DOCKS_REVIEWER_ARGV: JSON.stringify([process.execPath, stub]) },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    const chunks = [];
    child.stdout.on('data', (d) => chunks.push(d));
    const code = await new Promise((resolve) => child.on('close', resolve));
    const output = Buffer.concat(chunks).toString();

    assert.equal(code, 0, 'a dry run must exit 0');
    assert.ok(fs.readFileSync(world.planFile).equals(before), 'a dry run must not change the plan bytes');
    assert.equal(phaseOf(world).state, 'not_started', 'a dry run must not reserve');
    assert.equal(phaseOf(world).invocations, 0, 'a dry run must spend no permit');

    // A6 requires the REPORTED digest to equal the sealed bundle digest. Asserting
    // only that a hex value appeared - the defect completion review C1 found - passes
    // for any wrong digest. The contract's own verifier recomputes the bundle digest
    // from the entries on disk and rejects a mismatch, so handing it the reported
    // value is exactly that equality, and it also proves the bundle is intact.
    const reported = /bundle_sha256 : ([0-9a-f]{64})\b/.exec(output);
    assert.ok(reported, 'a dry run must report the full sealed bundle digest');
    const bundleLine = /bundle {8}: (\S+)/.exec(output);
    assert.ok(bundleLine, 'a dry run must report the sealed bundle path');
    const sealed = sealedBinding(world);
    assert.equal(sealed.plan_sha256, world.run.plan_sha256, 'the sealed bundle must bind the live plan digest');
    assert.equal(sealed.invocation, 1, 'the sealed bundle must bind the invocation it would consume');
    policy.verifyPlanReviewBundle({
      binding: {
        invocation: sealed.invocation,
        plan_sha256: sealed.plan_sha256,
        run_id: sealed.run_id,
        source_sha256: sealed.source_sha256,
      },
      bundlePath: bundleLine[1],
      expectedSha256: reported[1],
    });
    process.stdout.write('  ok dry run: bytes identical, nothing reserved, reported digest verifies the bundle\n');
  });

// A7: the settlement boundary. `pass` and a closed ReviewInvalidInputV1 settle
// unattended; `repair` must NOT, because `repairing` is for an accepted repair
// verdict only and reviewer prose never mutates state.
probes['settle-binding'] = () =>
  withScratchRoot('dispatch-settle-', async (root) => {
    const placeholder = { __placeholder: true };

    // pass -> settles, and the persisted digest binds the reviewer's own bytes.
    {
      const world = buildWorld(path.join(root, 'pass'));
      const go = path.join(root, 'pass', 'go');
      const stub = writeStub(world, { goFile: go, reply: placeholder });
      const { done } = startDriver(world, { stub });
      await waitForState(world, new Set(['reserved']));
      const sealed = sealedBinding(world);
      const review = PASS_REVIEW(sealed);
      rebindStub(stub, placeholder, review);
      fs.writeFileSync(go, 'go\n');
      const result = await done;

      const phase = phaseOf(world);
      assert.equal(phase.state, 'passed', `a bound pass must settle, found ${phase.state}`);
      assert.equal(phase.invocations, 1, 'a settled pass consumes exactly one permit');
      assert.equal(phase.result_sha256, api.sha256(Buffer.from(api.jcs(review))), 'result must bind reviewer bytes');
      assert.equal(result.code, 0, 'a settled pass exits 0');
      process.stdout.write('  ok pass settled, result_sha256 binds the reviewer bytes\n');
    }

    // repair -> withheld: phase stays reserved and the result lands on disk.
    {
      const world = buildWorld(path.join(root, 'repair'));
      const go = path.join(root, 'repair', 'go');
      const stub = writeStub(world, { goFile: go, reply: placeholder });
      const { done } = startDriver(world, { stub });
      await waitForState(world, new Set(['reserved']));
      rebindStub(stub, placeholder, REPAIR_REVIEW(sealedBinding(world)));
      fs.writeFileSync(go, 'go\n');
      const result = await done;

      const phase = phaseOf(world);
      assert.equal(phase.state, 'reserved', `repair must NOT settle, found ${phase.state}`);
      assert.equal(phase.result_sha256, null, 'an unadjudicated repair persists no result digest');
      assert.match(result.output, /NOT SETTLED/, 'the driver must report that it withheld the verdict');
      assert.equal(
        fs.readdirSync(world.outDir).filter((f) => f.endsWith('-result.json')).length,
        1,
        'the withheld verdict must be written to disk',
      );
      process.stdout.write('  ok repair withheld: phase still reserved, result on disk\n');
    }

    // invalid input -> terminal, never redispatched.
    {
      const world = buildWorld(path.join(root, 'invalid'));
      const go = path.join(root, 'invalid', 'go');
      const stub = writeStub(world, {
        goFile: go,
        reply: { schema: 1, error: 'invalid_input', reason: 'bundle_integrity_failed' },
      });
      const { done } = startDriver(world, { stub });
      await waitForState(world, new Set(['reserved']));
      fs.writeFileSync(go, 'go\n');
      await done;

      const view = api.validatePlanRun(fs.readFileSync(world.planFile), world.identity);
      assert.equal(view.run.draft_review.state, 'blocked', 'invalid input is terminal');
      assert.equal(view.status, 'blocked', 'a blocked review blocks the run');
      assert.ok(view.run.blocker !== null, 'a terminal review records blocker evidence');
      process.stdout.write('  ok invalid input settled terminally with blocker evidence\n');
    }
  });

// A8: the second dispatch cannot refund, because `transport_retried` has no
// `retryable` successor (plan-run.mjs:1523). Both risk branches run, so a driver
// that always blocks fails as surely as one that always refunds.
probes['retry-block'] = () =>
  withScratchRoot('dispatch-retry-', async (root) => {
    for (const [risk, expected] of [
      ['sensitive', 'blocked'],
      ['local', 'degraded'],
    ]) {
      const world = buildWorld(path.join(root, risk), { risk });

      // First dispatch: crash to refund, landing `retryable`.
      const first = startDriver(world, {
        stub: writeStub(world, { goFile: path.join(root, risk, 'never-1'), name: 'stub-1', reply: {} }),
      });
      await waitForState(world, new Set(['reserved']));
      first.child.kill('SIGTERM');
      await first.done;
      assert.equal(phaseOf(world).state, 'retryable', `${risk}: the first crash must refund`);

      // Second dispatch: reserving from `retryable` lands `transport_retried`.
      const second = startDriver(world, {
        stub: writeStub(world, { goFile: path.join(root, risk, 'never-2'), name: 'stub-2', reply: {} }),
      });
      await waitForState(world, new Set(['transport_retried']));
      second.child.kill('SIGTERM');
      await second.done;

      const phase = phaseOf(world);
      assert.equal(phase.state, expected, `${risk}: expected ${expected}, found ${phase.state}`);
      process.stdout.write(`  ok ${risk} risk: transport_retried -> ${expected}\n`);
    }
  });

// --- entry point -----------------------------------------------------------

export const PROBE_NAMES = Object.keys(probes);

const name = args.find((a) => !a.startsWith('-'));
if (name === undefined || !Object.hasOwn(probes, name)) {
  console.error(`usage: node scripts/tests/plan-dispatch-probes.mjs <${PROBE_NAMES.join('|')}> [--driver=<path>]`);
  process.exit(2);
}

try {
  await probes[name]();
  process.stdout.write(`ok - plan-dispatch-probes: ${name}\n`);
} catch (error) {
  process.stderr.write(`not ok - plan-dispatch-probes: ${name}\n`);
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  process.exitCode = 1;
}
