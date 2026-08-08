import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const REPO = path.resolve(HERE, '../../..');
const GUARD = path.join(REPO, 'scripts/plans/no-bespoke-gates.mjs');
const FIXTURES = path.join(HERE, 'fixtures/no-bespoke-gate');

// The reconstruction is materialised into a throwaway root, never into the repository: the
// repo-wide run of this guard must never meet a vacuous gate as live code. Fixture bodies
// carry a `.fixture` suffix for the same reason.
const fixture = (name) => fs.readFileSync(path.join(FIXTURES, `${name}.mjs.fixture`), 'utf8');

const LIFECYCLE = 'plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/lifecycle';
const GATE_PATH = `${LIFECYCLE}/plan-self-check.mjs`;
const PLAN_PATH = 'docs/plans/finished/2026-08-03-step-ids-and-class-budget.md';

const CONSUMER = `import * as selfCheck from './plan-self-check.mjs';

export function reviewDispatchProblems(ledger, planText, acceptedClasses) {
  return selfCheck.validateAcceptedClassSweep(ledger, planText, { acceptedClasses });
}
`;

const PLAN_BODY = `# Step identifiers and a closed finding-class budget

## Steps

|id|action|
|---|---|
|S1|Add \`createAcceptedClassSweep\` and \`validateAcceptedClassSweep\` to the self-check|
`;

function buildRoot(label, files, t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `no-bespoke-gate-${label}-`));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const [rel, content] of Object.entries(files)) {
    const full = path.join(root, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  }
  return root;
}

function runGuard(root) {
  const result = spawnSync(process.execPath, [GUARD, root], { encoding: 'utf8' });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

test('the current tree carries no bespoke per-plan gate', () => {
  const result = runGuard(REPO);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /^plans\/no-bespoke-gates PASSED: \d+ shipped module\(s\), \d+ plan body\(ies\)$/m);
});

test('the reconstructed accepted-class sweep is reported', (t) => {
  const root = buildRoot(
    'vacuous',
    {
      [GATE_PATH]: fixture('vacuous-sweep'),
      [`${LIFECYCLE}/dispatch-review.mjs`]: CONSUMER,
      [PLAN_PATH]: PLAN_BODY,
    },
    t,
  );
  const result = runGuard(root);
  assert.equal(result.status, 1);
  assert.match(
    result.stderr,
    /FAIL: .*plan-self-check\.mjs — validateAcceptedClassSweep is a bespoke per-plan gate over its own AcceptedClassSweepV1 artifact/,
  );
  assert.match(result.stderr, /expectedClasses/);
  assert.match(result.stderr, /an empty set clears it while it certifies nothing/);
  assert.match(result.stderr, /Shipped consumers: .*dispatch-review\.mjs/);
  assert.match(result.stderr, new RegExp(`Named by plan ${PLAN_PATH.replace(/[.]/g, '\\.')}`));
  assert.match(result.stderr, /^plans\/no-bespoke-gates FAILED: 1 error\(s\)/m);
});

test('requiring the certified set to be non-empty clears the gate', (t) => {
  const root = buildRoot(
    'repaired',
    {
      [GATE_PATH]: fixture('repaired-sweep'),
      [`${LIFECYCLE}/dispatch-review.mjs`]: CONSUMER,
      [PLAN_PATH]: PLAN_BODY,
    },
    t,
  );
  const result = runGuard(root);
  assert.equal(result.status, 0, result.stderr);
});

// Near-miss. A guard with no near-miss case is a guard that the first false positive disables:
// the byte-identical vacuous body is left in place and only the consumer count changes, so a
// pass here can only mean the shared-infrastructure exemption did the work.
test('a shared gate with two consumers is not a per-plan gate', (t) => {
  const root = buildRoot(
    'shared',
    {
      [GATE_PATH]: fixture('vacuous-sweep'),
      [`${LIFECYCLE}/dispatch-review.mjs`]: CONSUMER,
      [`${LIFECYCLE}/plan-measurements.mjs`]: CONSUMER.replace('reviewDispatchProblems', 'measurementProblems'),
    },
    t,
  );
  const result = runGuard(root);
  assert.equal(result.status, 0, result.stderr);
});

test('a single-consumer gate no plan body names is not a per-plan gate', (t) => {
  const root = buildRoot(
    'unnamed',
    {
      [GATE_PATH]: fixture('vacuous-sweep'),
      [`${LIFECYCLE}/dispatch-review.mjs`]: CONSUMER,
      [PLAN_PATH]: PLAN_BODY.replace(/AcceptedClassSweep/g, 'somethingElse'),
    },
    t,
  );
  const result = runGuard(root);
  assert.equal(result.status, 0, result.stderr);
});

// Near-miss. The sweep's ledger schema is what made it an artifact of its own; a validator
// that only judges values its callers already own mints no format and is not this shape.
test('a plan-named validator that mints no artifact of its own is not a per-plan gate', (t) => {
  const root = buildRoot(
    'no-artifact',
    {
      [GATE_PATH]: fixture('vacuous-sweep').replaceAll("'AcceptedClassSweepV1'", "'accepted-class sweep'"),
      [`${LIFECYCLE}/dispatch-review.mjs`]: CONSUMER,
      [PLAN_PATH]: PLAN_BODY,
    },
    t,
  );
  const result = runGuard(root);
  assert.equal(result.status, 0, result.stderr);
});

// Tests and fixtures are outside the scanned set by construction; if that ever stops being
// true this repository's own test tree becomes a permanent red.
test('a vacuous gate under a test or fixture directory is not scanned', (t) => {
  const root = buildRoot(
    'excluded',
    {
      'scripts/tests/unit/fixtures/plan-self-check.mjs': fixture('vacuous-sweep'),
      [`${LIFECYCLE}/dispatch-review.mjs`]: CONSUMER,
      [PLAN_PATH]: PLAN_BODY,
    },
    t,
  );
  const result = runGuard(root);
  assert.equal(result.status, 0, result.stderr);
});

test('an unreadable root is an operator error, not a verdict', () => {
  const result = spawnSync(process.execPath, [GUARD, path.join(os.tmpdir(), 'no-bespoke-gate-absent')], {
    encoding: 'utf8',
  });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /^FAIL: repository root not found or unreadable: /m);
});
