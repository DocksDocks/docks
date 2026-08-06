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
//
// The copy MUST live in the driver's own directory. The driver resolves its library
// as `../plan-run.mjs` and the review policy as
// `../../../plan-reviewer/scripts/review-policy.mjs`, both relative to its own file
// (dispatch-review.mjs:120-122), so a copy under /tmp dies with
// ERR_MODULE_NOT_FOUND for `/plan-run.mjs` before reaching any guard - which looks
// exactly like a caught defect and proves nothing. Write the mutant beside the real
// driver under a temporary name, and delete it afterwards.
//
// `--driver=` must also be ABSOLUTE. Probes spawn the driver with `cwd` set to the
// disposable repository, so a repository-relative copy path resolves against that
// temp directory and dies in the module loader instead. Both traps exit non-zero
// for reasons unrelated to the guard under test, so a mutation run that does not
// name the assertion it broke has proven nothing. Measured: a /tmp copy exits 1 at
// `ERR_MODULE_NOT_FOUND`, and `node --check` cannot see it because dynamic
// `import()` is not resolved at parse time.
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
  'plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/lifecycle/dispatch-review.mjs',
);
const api = await import(
  path.join(ROOT, 'plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/plan-run.mjs')
);
const policy = await import(
  path.join(ROOT, 'plugins/plan-lifecycle/skills/productivity/plan-reviewer/scripts/review-policy.mjs')
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
      class: 'v1_contract_contradiction',
      locator: 'Goal',
      defect: 'The scratch fixture declares a goal it never verifies.',
      fix: 'Add one acceptance row that binds the goal to an exit status.',
    },
  ],
});

// --- scratch world ---------------------------------------------------------

function renderPlan({ status, run, recordInReview = false }) {
  const record = `Plan-run: ${api.jcs(run)}`;
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
      '| # | Id | Task | Files | Depends | Effect | Status | Done when / failure action |',
      '|---|---|---|---|---|---|---|---|',
      '| 1 | touch_fixture | Touch the tracked fixture | `tracked.txt` | — | local | planned | Clear |',
      '',
      '## Acceptance criteria',
      '',
      '| ID | Command | Expected |',
      '|---|---|---|',
      '| A1 | `true` | Exit 0 |',
      '',
      ...(recordInReview ? [] : [record, '']),
      '## Verification Results',
      '',
      'Not yet started.',
      '',
      '## Review',
      '',
      ...(recordInReview ? [record, ''] : []),
      '(pending)',
      '',
    ].join('\n'),
  );
}

function buildWorld(
  root,
  { risk = 'sensitive', draftReview = reviewPhase('not_started'), recordInReview = false } = {},
) {
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
    draft_review: draftReview,
    execution_parent: null,
    implementation_commit: null,
    completion_review: reviewPhase(risk === 'local' ? 'not_required' : 'not_started'),
    acceptance: null,
    blocker: null,
  };
  // Two-pass bind: plan_sha256 covers the body with the record line excluded.
  const unbound = renderPlan({ status: 'drafting', run: base, recordInReview });
  const run = { ...base, plan_sha256: api.sha256(api.canonicalPlanView(unbound)) };

  const planFile = path.join(repo, PLAN_PATH);
  fs.mkdirSync(path.dirname(planFile), { recursive: true });
  fs.writeFileSync(planFile, renderPlan({ status: 'drafting', run, recordInReview }));

  const identity = { goalId: run.goal_id, planPath: PLAN_PATH, repositoryId: run.repository_id, runId: run.run_id };
  api.validatePlanRun(fs.readFileSync(planFile), identity);
  return { head, identity, outDir: path.join(root, 'out'), planFile, repo, root, run };
}

const phaseOf = (world) => api.validatePlanRun(fs.readFileSync(world.planFile), world.identity).run.draft_review;

function recordOf(world) {
  const line = fs
    .readFileSync(world.planFile, 'utf8')
    .split('\n')
    .find((candidate) => candidate.startsWith('Plan-run:'));
  assert.ok(line, 'persisted plan must carry a Plan-run record');
  return JSON.parse(line.slice('Plan-run:'.length));
}

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

// `cwd` defaults to the scratch repository, which is also `--repo`. Overriding it is how a
// probe can tell the two apart: the driver must resolve a relative reviewer route against
// `--repo`, because `spawn` chdirs there before the OS resolves the command. With the
// default they coincide and that confusion is invisible.
function startDriver(world, { body = null, cwd = null, driver = DRIVER, stub, env = {} }) {
  const argv = [driver, world.planFile, `--out-dir=${world.outDir}`, `--repo=${world.repo}`, '--commit'];
  if (body !== null) argv.push(`--body=${body}`);
  const child = spawn(process.execPath, argv, {
    cwd: cwd ?? world.repo,
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
  return { child, done, output: () => Buffer.concat(out).toString() };
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
function sealedBundlePath(world) {
  const dirs = fs
    .readdirSync(world.outDir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => path.join(world.outDir, e.name));
  assert.ok(dirs.length > 0, 'driver sealed no bundle');
  return dirs.sort((a, b) => fs.statSync(a).mtimeMs - fs.statSync(b).mtimeMs).at(-1);
}

function sealedBinding(world) {
  return JSON.parse(fs.readFileSync(path.join(sealedBundlePath(world), 'binding.json'), 'utf8'));
}

async function withStaleBundleDriver(operation) {
  const source = fs.readFileSync(DRIVER, 'utf8');
  const needle = 'planBytes: Buffer.from(candidateText),';
  assert.equal(source.split(needle).length - 1, 1, 'driver must have one planBytes bundle input');
  const mutant = path.join(path.dirname(DRIVER), `.dispatch-review-stale-bundle-${process.pid}.mjs`);
  fs.writeFileSync(
    mutant,
    source.replace(needle, "planBytes: Buffer.from(candidateText.replace(record.plan_sha256, '0'.repeat(64))),"),
  );
  try {
    return await operation(mutant);
  } finally {
    fs.unlinkSync(mutant);
  }
}

// --- probes ----------------------------------------------------------------
const probes = {};

// A repair reservation is gated by the reducer alone: reserving from `repairing` requires one
// remaining permit and changed input bytes — no ledger, no per-class clearance. The driver half
// proves a changed --body reaches `reserved`; the reducer half hits the changed-input guard
// directly, because a driver-sealed bundle digest embeds the fresh invocation and so can never
// replay the repairing phase's own input digest.
probes['repair-reserve'] = () =>
  withScratchRoot('dispatch-repair-reserve-', async (root) => {
    {
      // Realistic body: the Plan-run record inside `## Review`, bytes changed against the live
      // plan. The Review-contained record is regression coverage — a rebinding no-op fixture once
      // passed while the realistic shape failed.
      const world = buildWorld(path.join(root, 'changed'), {
        draftReview: reviewPhase('repairing'),
        recordInReview: true,
      });
      const bodyFile = path.join(world.root, 'repaired.md');
      const source = fs.readFileSync(world.planFile, 'utf8');
      const body = source.replace('| A1 | `true` | Exit 0 |', '| A1 | `true` | Exit status 0 |');
      assert.notEqual(body, source, 'the repaired body must change plan-hashed bytes');
      assert.match(
        body,
        /## Verification Results[\s\S]*## Review\n\nPlan-run: /,
        'the realistic body must keep Plan-run inside Review after Verification Results',
      );
      fs.writeFileSync(bodyFile, body);
      const neverGo = path.join(world.root, 'never-go');
      const stub = writeStub(world, { goFile: neverGo, reply: {} });
      const running = startDriver(world, { body: bodyFile, stub });
      const reserved = await waitForState(world, new Set(['reserved']));
      assert.equal(reserved.invocations, 2, 'the repair reservation must consume the second permit');
      assert.equal(
        Object.hasOwn(phaseOf(world), 'accepted_classes'),
        false,
        'no current transition may re-emit accepted_classes',
      );
      assert.ok(
        fs.existsSync(path.join(sealedBundlePath(world), 'binding.json')),
        'the repair reservation must seal a bundle',
      );
      running.child.kill('SIGTERM');
      await running.done;
    }
    {
      const world = buildWorld(path.join(root, 'unchanged'), { draftReview: reviewPhase('repairing') });
      const view = api.validatePlanRun(fs.readFileSync(world.planFile), world.identity);
      assert.throws(
        () =>
          api.reducePlanRun({
            current: { status: view.status, run: view.run },
            event: {
              type: 'reserve_review',
              phase: 'draft_review',
              input_sha256: view.run.draft_review.input_sha256,
            },
          }),
        /repair review requires changed input bytes/,
        'an unchanged-input repair reservation must be refused by the reducer',
      );
    }
    process.stdout.write(
      '  ok repair reserve: changed body reserved without a ledger; unchanged input refused by the reducer\n',
    );
  });

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
    // The committed half of the same guard the uncommitted half (dirty-drift) covers.
    // Both exit non-zero: the permit returns, but no verdict was captured. Asserted here
    // too, so the twins cannot silently diverge on exit status.
    assert.notEqual(result.code, 0, 'a drift refund must not exit 0: no verdict was captured');
    process.stdout.write('  ok HEAD drift refunded to retryable, permit returned\n');
  });

// A6: a dry run reserves nothing and reports the sealed digest. `--help` exiting 0
// observes none of this, which is why it is a separate row.
probes['dry-run'] = () =>
  withScratchRoot('dispatch-dryrun-', async (root) => {
    const world = buildWorld(root);
    const stub = writeStub(world, { goFile: null, reply: {} });
    const bodyFile = path.join(root, 'repaired.md');
    fs.writeFileSync(
      bodyFile,
      fs
        .readFileSync(world.planFile, 'utf8')
        .replace('Exercise the dispatch driver against a disposable plan.', 'Exercise a rebound dry-run plan.'),
    );
    fs.writeFileSync(path.join(world.repo, 'tracked.txt'), 'new reviewed source\n');
    git(world.repo, ['add', 'tracked.txt']);
    git(world.repo, ['commit', '-qm', 'move reviewed source']);
    const before = fs.readFileSync(world.planFile);

    const child = spawn(
      process.execPath,
      [DRIVER, world.planFile, `--body=${bodyFile}`, `--out-dir=${world.outDir}`, `--repo=${world.repo}`],
      {
        cwd: world.repo,
        env: { ...process.env, DOCKS_REVIEWER_ARGV: JSON.stringify([process.execPath, stub]) },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    const chunks = [];
    // stderr too: the driver reports preflight refusals there, and a probe that
    // discards them turns a named failure into a bare exit code.
    child.stdout.on('data', (d) => chunks.push(d));
    child.stderr.on('data', (d) => chunks.push(d));
    const code = await new Promise((resolve) => child.on('close', resolve));
    const output = Buffer.concat(chunks).toString();

    assert.equal(code, 0, `a dry run must exit 0, got ${code}: ${output.trim().slice(-300)}`);
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
    const bundlePath = bundleLine[1];
    const sealedPlan = fs.readFileSync(path.join(bundlePath, 'plan.md'), 'utf8');
    const sealedRecord = JSON.parse(
      sealedPlan
        .split('\n')
        .find((line) => line.startsWith('Plan-run:'))
        .slice('Plan-run:'.length),
    );
    const sealedManifest = JSON.parse(fs.readFileSync(path.join(bundlePath, 'manifest.json'), 'utf8'));
    assert.equal(
      sealedRecord.plan_sha256,
      sealed.plan_sha256,
      'sealed plan record plan_sha256 must equal binding plan_sha256',
    );
    assert.equal(
      sealedRecord.source_sha256,
      sealed.source_sha256,
      'sealed plan record source_sha256 must equal binding source_sha256',
    );
    assert.equal(
      sealedRecord.source_base,
      sealedManifest.source_base,
      'sealed plan record source_base must equal manifest source_base',
    );
    assert.deepEqual(
      sealedRecord.draft_review,
      world.run.draft_review,
      'the sealed plan record must retain the pre-reserve draft_review',
    );
    assert.notEqual(sealed.plan_sha256, world.run.plan_sha256, 'the repaired body must move the reviewed plan digest');
    assert.notEqual(
      sealed.source_sha256,
      world.run.source_sha256,
      'the source commit must move the reviewed source digest',
    );
    assert.notEqual(
      sealedManifest.source_base,
      world.run.source_base,
      'the source commit must move the reviewed source base',
    );
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
    // The C1 preflight must stay BELOW the dry-run exit. Every other case forces
    // `--commit` (`startDriver` :183), so nothing else can catch a re-hoist that makes
    // bare inspection depend on the reviewer binary existing - and the default route
    // is `omp` (`dispatch-review.mjs:46`), absent on most consumer machines. A
    // deliberately unparseable route must therefore change nothing here.
    const blind = await new Promise((resolve) => {
      const proc = spawn(
        process.execPath,
        [DRIVER, world.planFile, `--out-dir=${world.outDir}`, `--repo=${world.repo}`],
        {
          cwd: world.repo,
          env: { ...process.env, DOCKS_REVIEWER_ARGV: 'not json at all' },
          stdio: ['ignore', 'pipe', 'pipe'],
        },
      );
      const seen = [];
      proc.stdout.on('data', (d) => seen.push(d));
      proc.stderr.on('data', (d) => seen.push(d));
      proc.on('close', (exit) => resolve({ exit, text: Buffer.concat(seen).toString() }));
    });
    assert.equal(blind.exit, 0, `a dry run must not evaluate the reviewer route: ${blind.text.slice(-200)}`);
    assert.ok(fs.readFileSync(world.planFile).equals(before), 'the route-blind dry run must not change the bytes');
    assert.equal(phaseOf(world).state, 'not_started', 'the route-blind dry run must not reserve');
    assert.equal(phaseOf(world).invocations, 0, 'the route-blind dry run must spend no permit');

    // One line, no embedded newline: the plan binds Observed cells to the string the
    // probe emits verbatim, and a markdown cell cannot carry a line break.
    process.stdout.write(
      '  ok dry run: bytes identical, nothing reserved, reported digest verifies the bundle, route-blind\n',
    );
  });

// The reserve transaction must persist the same rebound record that was sealed.
// A repaired body plus a moved HEAD makes every source binding in the live record
// stale, so retaining even one predecessor value is observable here.
const assertReservedRebind = () =>
  withScratchRoot('dispatch-reserved-rebind-', async (root) => {
    const world = buildWorld(root);
    const bodyFile = path.join(root, 'repaired.md');
    const repairedBytes = Buffer.from(
      fs
        .readFileSync(world.planFile, 'utf8')
        .replace('Exercise the dispatch driver against a disposable plan.', 'Exercise a persisted rebound plan.'),
    );
    fs.writeFileSync(bodyFile, repairedBytes);

    fs.writeFileSync(path.join(world.repo, 'tracked.txt'), 'rebound reviewed source\n');
    git(world.repo, ['add', 'tracked.txt']);
    git(world.repo, ['commit', '-qm', 'move rebound source']);
    const expectedHead = git(world.repo, ['rev-parse', 'HEAD']).stdout;
    const expectedManifest = api.createAffectedPathManifest({
      repo: world.repo,
      sourceBase: expectedHead,
      paths: ['tracked.txt'],
    });
    const expectedPlanSha256 = api.sha256(api.canonicalPlanView(repairedBytes));

    assert.notEqual(expectedPlanSha256, world.run.plan_sha256, 'probe premise: repaired body must stale plan_sha256');
    assert.notEqual(
      expectedManifest.source_base,
      world.run.source_base,
      'probe premise: moved HEAD must stale source_base',
    );
    assert.notEqual(
      expectedManifest.source_sha256,
      world.run.source_sha256,
      'probe premise: moved source must stale source_sha256',
    );

    const placeholder = { __placeholder: true };
    const go = path.join(root, 'go');
    const stub = writeStub(world, { goFile: go, reply: placeholder });
    const { done, output } = startDriver(world, { body: bodyFile, stub });
    const prematureExit = await Promise.race([
      waitFor('persisted reserved record', () => recordOf(world).draft_review.state === 'reserved').then(() => null),
      done,
    ]);
    if (prematureExit !== null) {
      assert.equal(
        recordOf(world).plan_sha256,
        expectedPlanSha256,
        `driver exited before persisting reserved: plan_sha256 remained stale (${prematureExit.output.slice(-200)})`,
      );
      assert.fail('driver exited before persisting the reserved successor record');
    }
    const bundlePath = sealedBundlePath(world);
    const binding = sealedBinding(world);
    const reportedDigest = await waitFor(
      'reported bundle digest',
      () => /bundle_sha256 : ([0-9a-f]{64})\b/.exec(output())?.[1] ?? false,
    );
    rebindStub(stub, placeholder, REPAIR_REVIEW(binding));

    let result;
    try {
      const persistedBytes = fs.readFileSync(world.planFile);
      const persisted = recordOf(world);
      assert.equal(
        persisted.plan_sha256,
        expectedPlanSha256,
        'persisted reserved plan_sha256 must replace the stale record value',
      );
      assert.equal(
        persisted.source_base,
        expectedManifest.source_base,
        'persisted reserved source_base must replace the stale record value',
      );
      assert.equal(
        persisted.source_sha256,
        expectedManifest.source_sha256,
        'persisted reserved source_sha256 must replace the stale record value',
      );
      assert.deepEqual(
        api.validatePlanRun(persistedBytes, world.identity).run,
        persisted,
        'the persisted rebound successor record must validate',
      );
      assert.equal(persisted.draft_review.state, 'reserved', 'persisted review phase must be reserved');
      assert.equal(persisted.draft_review.invocations, 1, 'persisted reservation must consume invocation one');
      assert.equal(
        persisted.draft_review.input_sha256,
        reportedDigest,
        'persisted reservation input_sha256 must bind the sealed bundle digest',
      );
      assert.equal(
        persisted.draft_review.result_sha256,
        null,
        'a newly persisted reservation must not carry a result digest',
      );
      const sealedPlan = fs.readFileSync(path.join(bundlePath, 'plan.md'));
      const sealed = api.validatePlanRun(sealedPlan, world.identity).run;
      assert.equal(
        sealed.plan_sha256,
        expectedPlanSha256,
        'sealed plan_sha256 must equal the freshly computed repaired-body digest',
      );
      assert.equal(
        sealed.source_base,
        expectedManifest.source_base,
        'sealed source_base must equal the freshly computed source base',
      );
      assert.equal(
        sealed.source_sha256,
        expectedManifest.source_sha256,
        'sealed source_sha256 must equal the freshly computed source digest',
      );
      assert.equal(sealed.plan_sha256, persisted.plan_sha256, 'sealed and persisted plan_sha256 bindings must agree');
      assert.equal(sealed.source_base, persisted.source_base, 'sealed and persisted source_base bindings must agree');
      assert.equal(
        sealed.source_sha256,
        persisted.source_sha256,
        'sealed and persisted source_sha256 bindings must agree',
      );
      assert.deepEqual(
        sealed.draft_review,
        world.run.draft_review,
        'the sealed candidate must retain the pre-reserve review phase',
      );
      assert.ok(
        Buffer.from(api.canonicalPlanView(sealedPlan)).equals(Buffer.from(api.canonicalPlanView(persistedBytes))),
        'sealed and persisted canonical reviewed-body bytes must be identical',
      );
    } finally {
      fs.writeFileSync(go, 'go\n');
      result = await done;
    }

    assert.equal(result.code, 0, `the successful reservation driver must exit 0: ${result.output.slice(-300)}`);
    assert.match(result.output, /NOT SETTLED/, 'the bound repair keeps the successfully persisted reservation live');
    process.stdout.write('  ok reserved successor persisted all rebound fields and matches sealed reviewed bytes\n');
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

// C4: an uncommitted affected-path edit leaves HEAD unchanged, so only a
// freshly derived manifest can detect drift from the sealed source digest.
probes['dirty-drift'] = () =>
  withScratchRoot('dispatch-dirtymove-', async (root) => {
    const world = buildWorld(root);
    const goFile = path.join(root, 'go');
    const stub = writeStub(world, { goFile, reply: {} });
    const { done } = startDriver(world, { stub });

    await waitForState(world, new Set(['reserved']));
    const headBefore = git(world.repo, ['rev-parse', 'HEAD']).stdout;
    assert.equal(headBefore, world.head, 'the probe must start from the sealed HEAD');
    fs.writeFileSync(path.join(world.repo, 'tracked.txt'), 'dirty inside the dispatch window\n');
    const headAfter = git(world.repo, ['rev-parse', 'HEAD']).stdout;
    // Keeping HEAD at the sealed commit makes the source-digest comparison,
    // rather than the pre-existing HEAD guard, the only possible detector.
    assert.equal(headAfter, world.head, 'the uncommitted edit must leave HEAD unchanged');
    assert.equal(headAfter, headBefore, 'HEAD must remain fixed across the dirty edit');
    fs.writeFileSync(goFile, 'go\n');
    const result = await done;

    const phase = phaseOf(world);
    assert.equal(phase.state, 'retryable', `dirty drift must refund, found ${phase.state}`);
    assert.equal(phase.invocations, 0, 'a refunded permit returns to zero');
    // A3 requires the refund to arrive with a non-zero driver exit. The permit returns,
    // so the phase is settled and the finalizer's live-state branch stays quiet - the
    // driver signals it separately, because no verdict was captured and the review still
    // has to happen. Symmetric with the committed half (A11) by construction.
    assert.notEqual(result.code, 0, 'a drift refund must not exit 0: no verdict was captured');
    assert.match(
      result.output,
      /affected paths drifted during dispatch/,
      'the driver must name affected-path manifest divergence',
    );
    process.stdout.write('  ok dirty affected-path drift refunded with HEAD unchanged\n');
  });

// C2: preserve the reviewer's complete transport evidence independently from
// the normalized result, including diagnostics that the parser intentionally ignores.
probes['stdout-persistence'] = () =>
  withScratchRoot('dispatch-stdout-', async (root) => {
    const world = buildWorld(root);
    const goFile = path.join(root, 'go');
    const placeholder = { __placeholder: true };
    const noise = 'reviewer diagnostic: bundle verified; emitting the bound verdict next\n';
    const stub = writeStub(world, { goFile, reply: placeholder });
    const stubBefore = fs.readFileSync(stub, 'utf8');
    const placeholderWrite = `process.stdout.write(${JSON.stringify(`${JSON.stringify(placeholder)}\n`)});`;
    assert.equal(
      stubBefore.split(placeholderWrite).length - 1,
      1,
      'stub must carry exactly one stdout reply statement',
    );
    fs.writeFileSync(
      stub,
      stubBefore.replace(placeholderWrite, `process.stdout.write(${JSON.stringify(noise)});\n${placeholderWrite}`),
    );

    const { done } = startDriver(world, { stub });
    await waitForState(world, new Set(['reserved']));
    const review = PASS_REVIEW(sealedBinding(world));
    rebindStub(stub, placeholder, review);
    const emitted = Buffer.from(`${noise}${JSON.stringify(review)}\n`);
    fs.writeFileSync(goFile, 'go\n');
    const result = await done;

    const rawPath = path.join(world.outDir, 'scratch-dispatch-draft_review-1-stdout.raw');
    const resultPath = path.join(world.outDir, 'scratch-dispatch-draft_review-1-result.json');
    assert.ok(fs.existsSync(rawPath), 'raw stdout artifact must exist');
    const raw = fs.readFileSync(rawPath);
    assert.ok(raw.equals(emitted), 'raw stdout must equal every byte emitted by the reviewer');
    assert.ok(fs.existsSync(resultPath), 'normalized verdict artifact must exist separately');
    const normalized = fs.readFileSync(resultPath);
    assert.ok(!normalized.equals(raw), 'normalized verdict bytes must differ from raw reviewer stdout');
    assert.equal(phaseOf(world).state, 'passed', 'stdout persistence must preserve the passing settlement');
    assert.equal(result.code, 0, `a persisted bound pass must exit 0: ${result.output.slice(-200)}`);
    process.stdout.write('  ok complete stdout persisted byte-for-byte, normalized verdict separate, pass settled\n');
  });

probes['invalid-input-verbatim'] = () =>
  withScratchRoot('dispatch-invalid-verbatim-', async (root) => {
    const malformed = [
      {
        label: 'wrong schema',
        reply: { schema: 2, error: 'invalid_input', reason: 'bundle_unavailable' },
      },
      {
        label: 'missing schema',
        reply: { error: 'invalid_input', reason: 'bundle_unavailable' },
      },
      {
        label: 'unknown extra key',
        reply: { schema: 1, error: 'invalid_input', reason: 'bundle_unavailable', smuggled: 1 },
      },
      {
        label: 'missing reason',
        reply: { schema: 1, error: 'invalid_input' },
      },
      {
        label: 'empty reason',
        reply: { schema: 1, error: 'invalid_input', reason: '' },
      },
      {
        label: 'non-string reason',
        reply: { schema: 1, error: 'invalid_input', reason: 1 },
      },
    ];
    const observations = [];

    for (const [index, testCase] of malformed.entries()) {
      const world = buildWorld(path.join(root, `malformed-${index}`));
      const stub = writeStub(world, { goFile: null, reply: testCase.reply });
      const result = await startDriver(world, { stub }).done;
      const phase = phaseOf(world);
      const resultFile = path.join(world.outDir, 'scratch-dispatch-draft_review-1-result.json');
      observations.push({
        blamedTransport: /TRANSPORT FAILED/.test(result.output),
        hasResult: fs.existsSync(resultFile),
        invocations: phase.invocations,
        label: testCase.label,
        namesInvalidOutput: /INVALID REVIEWER OUTPUT/.test(result.output),
        state: phase.state,
      });
    }

    assert.deepEqual(
      observations.map(({ invocations, label, state }) => ({ invocations, label, state })),
      malformed.map(({ label }) => ({ invocations: 0, label, state: 'retryable' })),
      'every malformed invalid-input reply must refund to retryable without consuming a permit',
    );
    for (const observation of observations) {
      assert.equal(
        observation.namesInvalidOutput,
        true,
        `${observation.label}: the driver must name INVALID REVIEWER OUTPUT`,
      );
      assert.equal(
        observation.blamedTransport,
        false,
        `${observation.label}: malformed reviewer output must not be blamed on transport`,
      );
      assert.equal(observation.hasResult, false, `${observation.label}: malformed output must write no result file`);
    }

    const controlWorld = buildWorld(path.join(root, 'valid-control'));
    const controlReply = { schema: 1, error: 'invalid_input', reason: 'bundle_unavailable' };
    const controlStub = writeStub(controlWorld, { goFile: null, reply: controlReply });
    await startDriver(controlWorld, { stub: controlStub }).done;
    const controlPhase = phaseOf(controlWorld);
    assert.equal(controlPhase.state, 'blocked', 'a valid closed invalid-input reply must remain terminal');
    assert.equal(controlPhase.invocations, 1, 'a terminal invalid-input reply must consume exactly one permit');
    assert.equal(
      fs.existsSync(path.join(controlWorld.outDir, 'scratch-dispatch-draft_review-1-result.json')),
      true,
      'a terminal invalid-input reply must persist its result',
    );

    process.stdout.write('  ok invalid-input replies validated verbatim; malformed refunded, valid blocked\n');
  });

// C1: a refusal the driver can prove before dispatch must not consume the
// permit whose only purpose is to account for a real reviewer invocation.
probes['preflight-before-reserve'] = () =>
  withScratchRoot('dispatch-preflight-', async (root) => {
    const assertRefusedBeforeReserve = async (world, { cwd = null, env, label, name }) => {
      const stub = writeStub(world, { goFile: null, reply: {} });
      const result = await startDriver(world, { cwd, stub, env }).done;
      const phase = phaseOf(world);

      assert.equal(result.code, 2, `${name}: preflight refusal must exit 2`);
      assert.match(result.output, new RegExp(label), `${name}: refusal must name ${label}`);
      assert.equal(phase.state, 'not_started', `${name}: preflight refusal must leave phase not_started`);
      assert.equal(phase.invocations, 0, `${name}: preflight refusal must spend no permit`);
    };

    {
      const world = buildWorld(path.join(root, 'stale-sealed-record'));
      const before = fs.readFileSync(world.planFile);
      const stub = writeStub(world, { goFile: null, reply: {} });
      const result = await withStaleBundleDriver((driver) => startDriver(world, { driver, stub }).done);
      assert.equal(result.code, 2, 'bundle mismatch must be refused before reserve');
      assert.match(
        result.output,
        /sealed plan record plan_sha256 must equal binding plan_sha256/,
        'bundle mismatch refusal must name plan_sha256',
      );
      assert.match(
        result.output,
        /PREFLIGHT FAILED - no permit reserved, no reviewer dispatched\./,
        'bundle mismatch refusal must report the preflight boundary',
      );
      assert.ok(fs.readFileSync(world.planFile).equals(before), 'bundle mismatch must not change plan bytes');
      assert.deepEqual(phaseOf(world), world.run.draft_review, 'bundle mismatch must not change the review phase');
    }

    await assertRefusedBeforeReserve(buildWorld(path.join(root, 'invalid-json')), {
      env: { DOCKS_REVIEWER_ARGV: 'not json' },
      label: 'reviewer route is unusable',
      name: 'invalid JSON route',
    });

    await assertRefusedBeforeReserve(buildWorld(path.join(root, 'non-array')), {
      env: { DOCKS_REVIEWER_ARGV: '{"a":1}' },
      label: 'reviewer route is unusable',
      name: 'non-array route',
    });

    // Both path-form failures matter: existence alone must not be mistaken for
    // an executable route.
    {
      const world = buildWorld(path.join(root, 'unusable-executable'));
      await assertRefusedBeforeReserve(world, {
        env: { DOCKS_REVIEWER_ARGV: JSON.stringify([path.join(world.root, 'missing-reviewer')]) },
        label: 'reviewer route is unusable',
        name: 'missing executable',
      });
      const nonExecutable = path.join(world.root, 'non-executable-reviewer');
      fs.writeFileSync(nonExecutable, '#!/bin/sh\nexit 0\n', { mode: 0o644 });
      fs.chmodSync(nonExecutable, 0o644);
      await assertRefusedBeforeReserve(world, {
        env: { DOCKS_REVIEWER_ARGV: JSON.stringify([nonExecutable]) },
        label: 'reviewer route is unusable',
        name: 'non-executable route',
      });
    }

    // Both passed an access-only check before C1 was repaired: every traversable directory
    // carries X_OK, and an empty command joins to the directory itself. Each then reserved
    // and failed at `spawn`. Measured against that mutant, the spawn failure is caught and
    // refunded - `retryable`/0, driver exit 0 - so the cost is not a cold `reserved` but
    // the run's one refundable transport failure, spent on a local misconfiguration.
    {
      const world = buildWorld(path.join(root, 'directory-route'));
      await assertRefusedBeforeReserve(world, {
        env: { DOCKS_REVIEWER_ARGV: JSON.stringify([world.root]) },
        label: 'reviewer route is unusable',
        name: 'directory as argv[0]',
      });
      await assertRefusedBeforeReserve(buildWorld(path.join(root, 'empty-route')), {
        env: { DOCKS_REVIEWER_ARGV: JSON.stringify(['']) },
        label: 'reviewer route is unusable',
        name: 'empty argv[0]',
      });
    }

    // `spawn` chdirs to `--repo` before the OS resolves a relative command, so the preflight
    // must resolve against REPO too. Launched from a DIFFERENT cwd, these two routes are the
    // discriminator: one exists only beside the launcher, one only inside the repository.
    {
      const world = buildWorld(path.join(root, 'relative-route'));
      const elsewhere = fs.mkdtempSync(path.join(root, 'launcher-'));
      // Exists relative to the LAUNCHER, not to REPO. Checking the wrong base accepts it,
      // and then `spawn` cannot find it - after the reservation.
      const decoy = path.join(elsewhere, 'decoy-reviewer');
      fs.writeFileSync(decoy, '#!/bin/sh\nexit 0\n', { mode: 0o755 });
      await assertRefusedBeforeReserve(world, {
        cwd: elsewhere,
        env: { DOCKS_REVIEWER_ARGV: JSON.stringify(['./decoy-reviewer']) },
        label: 'reviewer route is unusable',
        name: 'relative route resolvable only from the launcher cwd',
      });

      // The converse keeps the check honest: a relative route that DOES resolve against REPO
      // must be accepted even though it does not exist beside the launcher. Without it, a
      // preflight rejecting EVERY relative route would satisfy the decoy half above.
      //
      // argv[0] itself must be the relative token. Passing an absolute interpreter with a
      // relative script leaves argv[0] absolute, `resolveExecutable` never reaches its
      // relative branch, and the pair stops discriminating - which is how this assertion
      // was first written.
      const inRepo = buildWorld(path.join(root, 'relative-ok'));
      const real = path.join(inRepo.repo, 'real-reviewer.sh');
      fs.writeFileSync(real, "#!/bin/sh\nprintf 'no json here'\n", { mode: 0o755 });
      fs.chmodSync(real, 0o755);
      const accepted = await startDriver(inRepo, {
        cwd: elsewhere,
        stub: real,
        env: { DOCKS_REVIEWER_ARGV: JSON.stringify(['./real-reviewer.sh']) },
      }).done;
      assert.match(
        accepted.output,
        /RESERVED/,
        `a relative route resolving against --repo must preflight clean: ${accepted.output.slice(-200)}`,
      );
    }

    {
      const world = buildWorld(path.join(root, 'unwritable-stdout'));
      fs.mkdirSync(world.outDir, { recursive: true });
      const rawStdout = path.join(world.outDir, 'scratch-dispatch-draft_review-1-stdout.raw');
      fs.writeFileSync(rawStdout, '', { mode: 0o400 });
      fs.chmodSync(rawStdout, 0o400);
      assert.throws(
        () => fs.appendFileSync(rawStdout, 'permission premise'),
        /EACCES|EPERM/,
        'raw-stdout permission premise failed: 0o400 mode was not honoured (possibly running as root)',
      );
      await assertRefusedBeforeReserve(world, {
        env: {},
        label: 'raw-stdout target is not writable',
        name: 'unwritable raw-stdout target',
      });
    }

    // A universally failing preflight would make every refusal above vacuous.
    {
      const world = buildWorld(path.join(root, 'valid-control'));
      const stub = writeStub(world, { goFile: null, reply: undefined });
      const result = await startDriver(world, { stub }).done;
      assert.match(result.output, /RESERVED/, 'a valid route must reach RESERVED');
      assert.doesNotMatch(result.output, /PREFLIGHT FAILED/, 'a valid route must not be refused');
      const phase = phaseOf(world);
      assert.equal(phase.state, 'retryable', 'malformed control output must refund after reservation');
      assert.equal(phase.invocations, 0, 'the control refund must return its permit');
    }

    await assertReservedRebind();

    process.stdout.write(
      '  ok nine preflight refusals before reserve; valid and repo-relative routes reached RESERVED\n',
    );
  });

export const PROBE_NAMES = Object.keys(probes);

const name = args.find((a) => !a.startsWith('-'));
if (name !== undefined && !Object.hasOwn(probes, name)) {
  console.error(`usage: node scripts/tests/plan-dispatch-probes.mjs [${PROBE_NAMES.join('|')}] [--driver=<path>]`);
  process.exit(2);
}

for (const probeName of name === undefined ? PROBE_NAMES : [name]) {
  try {
    await probes[probeName]();
    process.stdout.write(`ok - plan-dispatch-probes: ${probeName}\n`);
  } catch (error) {
    process.stderr.write(`not ok - plan-dispatch-probes: ${probeName}\n`);
    process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
    process.exitCode = 1;
    break;
  }
}
