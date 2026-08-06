import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  findJsonObject,
  PLACEHOLDER,
  PROBE_PROMPT,
  probeReviewerRoute,
} from '../../../plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/lifecycle/reviewer-route-preflight.mjs';
import { buildWorld, phaseOf, startDriver, withScratchRoot } from '../plan-dispatch-probes.mjs';

// A fake reviewer executable, never a real model call: the probe's whole job is to
// classify what a route DOES, so each route shape is a script that does exactly that.
function fakeReviewer(label, body) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `reviewer-preflight-${label}-`));
  const file = path.join(root, 'reviewer.mjs');
  fs.writeFileSync(file, `#!/usr/bin/env node\n${body}\n`, { mode: 0o755 });
  return ['node', file, '--prompt', PLACEHOLDER];
}

test('a contract-honouring route is usable', () => {
  const argv = fakeReviewer(
    'ok',
    `const prompt = process.argv[process.argv.indexOf('--prompt') + 1];
console.log(JSON.stringify({ probe: 'ok', received: prompt.length }));`,
  );
  const result = probeReviewerRoute({ argv, timeoutMs: 20_000 });
  assert.equal(result.usable, true, result.reason);
  assert.deepEqual(
    { spawned: result.spawned, exitZero: result.exitZero, jsonFound: result.jsonFound, timedOut: result.timedOut },
    { spawned: true, exitZero: true, jsonFound: true, timedOut: false },
  );
  assert.equal(result.exitCode, 0);
  assert.ok(result.argv.includes(PROBE_PROMPT), 'the placeholder is replaced by the probe prompt');
  assert.ok(!result.argv.includes(PLACEHOLDER));
});

test('a quota-refusing route reports exit-nonzero, not a throw', () => {
  const argv = fakeReviewer(
    'quota',
    `console.error('usage_limit_reached');
process.exit(1);`,
  );
  const result = probeReviewerRoute({ argv, timeoutMs: 20_000 });
  assert.equal(result.usable, false);
  assert.equal(result.spawned, true);
  assert.equal(result.exitZero, false);
  assert.equal(result.exitCode, 1);
  assert.match(result.reason, /usage_limit_reached/);
});

test('an off-contract route spawns and exits 0 but returns no JSON object', () => {
  const argv = fakeReviewer('prose', `console.log('Sure! I will review that plan for you.');`);
  const result = probeReviewerRoute({ argv, timeoutMs: 20_000 });
  assert.equal(result.usable, false);
  assert.equal(result.exitZero, true);
  assert.equal(result.jsonFound, false);
  assert.match(result.reason, /off-contract/);
});

test('JSON wrapped in prose or a fence still counts as a JSON reply', () => {
  const argv = fakeReviewer(
    'fenced',
    `console.log('Here you go:\\n\\u0060\\u0060\\u0060json\\n{"verdict":"approve"}\\n\\u0060\\u0060\\u0060');`,
  );
  const result = probeReviewerRoute({ argv, timeoutMs: 20_000 });
  assert.equal(result.jsonFound, true, result.stdout);
  assert.equal(result.usable, true);
});

test('a route that never spawns is a result, not an exception', () => {
  const result = probeReviewerRoute({
    argv: ['/nonexistent/reviewer-binary', PLACEHOLDER],
    timeoutMs: 5_000,
  });
  assert.equal(result.usable, false);
  assert.equal(result.spawned, false);
  assert.match(result.reason, /did not spawn/);
});

test('a hanging route is bounded by the explicit timeout', () => {
  const argv = fakeReviewer('hang', 'setTimeout(() => {}, 60_000);');
  const startedAt = Date.now();
  const result = probeReviewerRoute({ argv, timeoutMs: 750 });
  assert.equal(result.timedOut, true, result.reason);
  assert.equal(result.usable, false);
  assert.ok(Date.now() - startedAt < 20_000, 'the probe returns near its timeout, not near the route timeout');
});

test('malformed argv is rejected without spawning anything', () => {
  const spawn = () => {
    throw new Error('must not spawn');
  };
  for (const [argv, pattern] of [
    [[], /non-empty array/],
    [['echo', 42], /only strings/],
    [['  ', PLACEHOLDER], /argv\[0\] is empty/],
    [['echo', 'hello'], /no \{\{PROMPT\}\} placeholder/],
  ]) {
    const result = probeReviewerRoute({ argv, spawn });
    assert.equal(result.usable, false);
    assert.match(result.reason, pattern);
  }
  assert.match(probeReviewerRoute({ argv: ['echo', PLACEHOLDER], timeoutMs: 0, spawn }).reason, /positive number/);
});

test('the probe writes nothing and reads no plan record', () => {
  const argv = fakeReviewer('sideeffect', `console.log(JSON.stringify({ probe: 'ok' }));`);
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'reviewer-preflight-cwd-'));
  const before = fs.readdirSync(cwd);
  const result = probeReviewerRoute({ argv, cwd, timeoutMs: 20_000 });
  assert.equal(result.usable, true);
  assert.deepEqual(fs.readdirSync(cwd), before, 'the probe leaves its working directory untouched');
});

test('findJsonObject accepts only objects', () => {
  assert.deepEqual(findJsonObject('noise {"a":1} noise'), { a: 1 });
  assert.deepEqual(findJsonObject('{"a":"}"}'), { a: '}' });
  assert.deepEqual(findJsonObject('{ broken } {"b":2}'), { b: 2 });
  assert.equal(findJsonObject('[1,2,3]'), null);
  assert.equal(findJsonObject('plain text'), null);
  assert.equal(findJsonObject(undefined), null);
});

// --- wiring: the driver must probe the route BEFORE it reserves -------------
//
// Everything above classifies a route in isolation. These cases assert the driver
// actually consults that classification at the one point where it still costs
// nothing to walk away, so a shipped route answering `usage_limit_reached` is
// refused instead of paid for.

// A route that answers the pre-reserve probe one way and the real dispatch another,
// and records every invocation. The log is the evidence: "the probe did not run" is
// a claim about spawns, not about output.
function routeStub(world, { onProbe, name = 'route' }) {
  const log = path.join(world.root, `${name}-spawns.log`);
  const file = path.join(world.root, `${name}-stub.mjs`);
  fs.writeFileSync(
    file,
    [
      "import fs from 'node:fs';",
      `const isProbe = process.argv.includes(${JSON.stringify(PROBE_PROMPT)});`,
      `fs.appendFileSync(${JSON.stringify(log)}, isProbe ? 'probe\\n' : 'dispatch\\n');`,
      'if (isProbe) {',
      `  ${onProbe}`,
      '}',
      // Well-formed JSON that is not a PlanReviewV1, so a dispatch that DOES happen
      // refunds its permit instead of settling a verdict this fixture never earned.
      `process.stdout.write('{"schema":1}\\n');`,
    ].join('\n'),
  );
  return {
    file,
    spawns: () => (fs.existsSync(log) ? fs.readFileSync(log, 'utf8').split('\n').filter(Boolean) : []),
  };
}

const USABLE = `process.stdout.write('{"probe":"ok"}\\n'); process.exit(0);`;
const QUOTA_REFUSAL = `process.stderr.write('usage_limit_reached\\n'); process.exit(1);`;
const OFF_CONTRACT = `process.stdout.write('Certainly! Here is my review, in prose.\\n'); process.exit(0);`;

const digestOf = (file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');

test('a usable route lets the dispatch reach its reservation', async () => {
  await withScratchRoot('preflight-wiring-usable-', async (root) => {
    const world = buildWorld(path.join(root, 'usable'));
    const stub = routeStub(world, { onProbe: USABLE });
    const result = await startDriver(world, { stub: stub.file }).done;

    assert.match(result.output, /route probe {3}: route spawns, exits 0 and returns a JSON object/);
    assert.match(result.output, /RESERVED/, result.output.slice(-400));
    assert.deepEqual(stub.spawns(), ['probe', 'dispatch'], 'the probe runs once, then the real dispatch');
    // The reservation happened and the non-conforming reply refunded it: reaching
    // `retryable` is only possible from `reserved`.
    assert.equal(phaseOf(world).state, 'retryable');
  });
});

test('a quota-refusing route is refused with nothing reserved and no plan byte moved', async () => {
  await withScratchRoot('preflight-wiring-quota-', async (root) => {
    const world = buildWorld(path.join(root, 'quota'));
    const before = digestOf(world.planFile);
    const stub = routeStub(world, { onProbe: QUOTA_REFUSAL });
    const result = await startDriver(world, { stub: stub.file }).done;

    assert.equal(result.code, 2, result.output.slice(-400));
    assert.match(result.output, /route probe {3}: refused/);
    assert.match(result.output, new RegExp(`route         : .*${path.basename(stub.file)} \\{\\{PROMPT\\}\\}`));
    assert.match(result.output, /dispatch-review: reviewer route probe failed: exit 1: usage_limit_reached/);
    assert.match(result.output, /PREFLIGHT FAILED - no permit reserved, no reviewer dispatched\./);
    assert.deepEqual(stub.spawns(), ['probe'], 'a refused route is never dispatched');
    assert.deepEqual(
      { state: phaseOf(world).state, invocations: phaseOf(world).invocations },
      { state: 'not_started', invocations: 0 },
    );
    // Bytes, not inspection: a reservation is a write to this file, so an unchanged
    // digest is the property, and there is nothing to refund or reconcile.
    assert.equal(digestOf(world.planFile), before, 'a refused probe must not move one plan byte');
  });
});

test('an off-contract route is refused for the same reason a quota refusal is', async () => {
  await withScratchRoot('preflight-wiring-offcontract-', async (root) => {
    const world = buildWorld(path.join(root, 'off-contract'));
    const before = digestOf(world.planFile);
    const stub = routeStub(world, { onProbe: OFF_CONTRACT });
    const result = await startDriver(world, { stub: stub.file }).done;

    assert.equal(result.code, 2, result.output.slice(-400));
    assert.match(result.output, /exited 0 but returned no JSON object \(off-contract reply\)/);
    assert.deepEqual(stub.spawns(), ['probe']);
    assert.equal(phaseOf(world).invocations, 0);
    assert.equal(digestOf(world.planFile), before);
  });
});

test('--skip-route-probe dispatches a route the probe would have refused', async () => {
  await withScratchRoot('preflight-wiring-skip-', async (root) => {
    const world = buildWorld(path.join(root, 'skip'));
    const stub = routeStub(world, { onProbe: OFF_CONTRACT });
    const result = await startDriver(world, { stub: stub.file, extraArgs: ['--skip-route-probe'] }).done;

    assert.doesNotMatch(result.output, /route probe {3}:/);
    assert.match(result.output, /RESERVED/, result.output.slice(-400));
    assert.deepEqual(stub.spawns(), ['dispatch'], 'the skip flag must remove the probe spawn, not merely its output');
  });
});

test('a dry run does not probe the route it never reserves against', async () => {
  await withScratchRoot('preflight-wiring-dryrun-', async (root) => {
    const world = buildWorld(path.join(root, 'dry-run'));
    const before = digestOf(world.planFile);
    const stub = routeStub(world, { onProbe: QUOTA_REFUSAL });
    const result = await startDriver(world, { commit: false, stub: stub.file }).done;

    assert.equal(result.code, 0, result.output.slice(-400));
    assert.match(result.output, /DRY RUN - nothing reserved, nothing dispatched, plan untouched\./);
    // A route that would refuse the probe must not make a dry run fail: a dry run
    // reserves nothing, so it has no permit to protect.
    assert.deepEqual(stub.spawns(), [], 'a dry run must spawn the route zero times');
    assert.equal(digestOf(world.planFile), before);
  });
});
