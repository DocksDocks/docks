import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { findJsonObject, PLACEHOLDER, PROBE_PROMPT, probeReviewerRoute } from '../../lib/reviewer-route-preflight.mjs';

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
