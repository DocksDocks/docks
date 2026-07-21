import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const DRIVER = path.join(ROOT, 'scripts/tests/plan-review-policy-regressions.mjs');
let driverModulePromise = null;

function loadDriver() {
  driverModulePromise ??= import(`${pathToFileURL(DRIVER).href}?unit=${randomUUID()}`);
  return driverModulePromise;
}

async function withPrivateTemp(operation) {
  const container = fs.mkdtempSync(path.join(os.tmpdir(), 'plan-review-policy-regressions-cli-'));
  const temporary = path.join(container, 'tmp');
  fs.mkdirSync(temporary, { mode: 0o700 });
  try {
    return await operation(temporary);
  } finally {
    fs.rmSync(container, { recursive: true, force: true });
  }
}

async function spawnMalformed(argv, expectedStderr) {
  await withPrivateTemp(async (temporary) => {
    const result = spawnSync(process.execPath, [DRIVER, ...argv], {
      cwd: ROOT,
      env: { ...process.env, TMPDIR: temporary, TMP: temporary, TEMP: temporary },
      encoding: 'utf8',
      shell: false,
    });
    assert.equal(result.error, undefined);
    assert.equal(result.signal, null);
    assert.equal(result.status, 2);
    assert.equal(result.stdout, '');
    assert.equal(result.stderr, `${expectedStderr}\n`);
    assert.deepEqual(fs.readdirSync(temporary), [], 'malformed partition argv must not create a fixture');
  });
}

async function spawnGenericRejected(argv, expectedFirstLine) {
  await withPrivateTemp(async (temporary) => {
    const result = spawnSync(process.execPath, [DRIVER, ...argv], {
      cwd: ROOT,
      env: { ...process.env, TMPDIR: temporary, TMP: temporary, TEMP: temporary },
      encoding: 'utf8',
      shell: false,
    });
    assert.equal(result.error, undefined);
    assert.equal(result.signal, null);
    assert.equal(result.status, 1);
    assert.equal(result.stdout, '');
    assert.equal(result.stderr.split(/\r?\n/, 1)[0], expectedFirstLine);
    assert.deepEqual(fs.readdirSync(temporary), [], 'rejected argv must not create a fixture');
  });
}

test('driver import is side-effect free and exports only its callable surface', async () => {
  await withPrivateTemp(async (temporary) => {
    const previous = {
      TMPDIR: process.env.TMPDIR,
      TMP: process.env.TMP,
      TEMP: process.env.TEMP,
    };
    const listeners = {
      SIGINT: process.listenerCount('SIGINT'),
      SIGTERM: process.listenerCount('SIGTERM'),
    };
    process.env.TMPDIR = temporary;
    process.env.TMP = temporary;
    process.env.TEMP = temporary;
    try {
      const driver = await loadDriver();
      assert.deepEqual(Object.keys(driver).sort(), [
        'createCaseTimingReport',
        'main',
        'parseRegressionDriverArgs',
        'resolveRegressionSelection',
      ]);
      assert.equal(typeof driver.createCaseTimingReport, 'function');
      assert.equal(typeof driver.main, 'function');
      assert.equal(typeof driver.parseRegressionDriverArgs, 'function');
      assert.equal(typeof driver.resolveRegressionSelection, 'function');
      assert.equal(process.listenerCount('SIGINT'), listeners.SIGINT);
      assert.equal(process.listenerCount('SIGTERM'), listeners.SIGTERM);
      assert.deepEqual(fs.readdirSync(temporary), []);
    } finally {
      for (const [name, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[name];
        else process.env[name] = value;
      }
    }
  });
});

test('partition parser accepts only the two exact self-test partition values', async () => {
  const { parseRegressionDriverArgs } = await loadDriver();
  const expectedJobs = Math.max(1, Math.min(8, os.availableParallelism()));
  for (const partition of ['baselines', 'mutations']) {
    assert.deepEqual(parseRegressionDriverArgs(['--self-test', '--partition', partition]), {
      caseTimingsJson: null,
      focus: null,
      jobs: expectedJobs,
      mode: 'regressions',
      partition,
    });
  }
});

test('selection resolver pins unqualified and disjoint partition ownership', async () => {
  const { resolveRegressionSelection } = await loadDriver();
  const all = resolveRegressionSelection();
  assert.deepEqual(Object.keys(all), ['ownsGlobalPreflights', 'includeBaselines', 'selectedCatalog']);
  assert.equal(all.ownsGlobalPreflights, true);
  assert.equal(all.includeBaselines, true);
  assert.equal(all.selectedCatalog.length, 143);
  assert.deepEqual(
    all.selectedCatalog.map(({ index }) => index),
    Array.from({ length: 143 }, (_, index) => index),
  );

  const baselines = resolveRegressionSelection({ partition: 'baselines' });
  assert.equal(baselines.ownsGlobalPreflights, false);
  assert.equal(baselines.includeBaselines, true);
  assert.deepEqual(baselines.selectedCatalog, [], 'baseline timing reports have an empty cases array');

  const mutations = resolveRegressionSelection({ partition: 'mutations' });
  assert.equal(mutations.ownsGlobalPreflights, true);
  assert.equal(mutations.includeBaselines, false);
  assert.deepEqual(
    mutations.selectedCatalog,
    all.selectedCatalog,
    'mutation timing reports have all 143 ordered cases',
  );

  assert.throws(() => resolveRegressionSelection({ partition: 'unknown' }), /unknown regression partition/);
});

test('schema-1 timing reports preserve both legal empty partition arrays', async () => {
  const { createCaseTimingReport, resolveRegressionSelection } = await loadDriver();
  const baselines = resolveRegressionSelection({ partition: 'baselines' });
  const baselineReport = createCaseTimingReport('passed', {
    baselines: [
      { name: 'policy baseline', duration_ms: 1, status: 'passed' },
      { name: 'orchestration baseline', duration_ms: 2, status: 'passed' },
      { name: 'convergence baseline', duration_ms: 3, status: 'passed' },
    ],
    cases: baselines.selectedCatalog,
  });
  assert.deepEqual(Object.keys(baselineReport), ['schema', 'status', 'baselines', 'cases']);
  assert.equal(baselineReport.schema, 1);
  assert.equal(baselineReport.status, 'passed');
  assert.equal(baselineReport.baselines.length, 3);
  assert.deepEqual(baselineReport.cases, []);

  const mutations = resolveRegressionSelection({ partition: 'mutations' });
  const mutationReport = createCaseTimingReport('passed', {
    baselines: [],
    cases: mutations.selectedCatalog.map((identity) => ({
      ...identity,
      duration_ms: 1,
      status: 'passed',
    })),
  });
  assert.deepEqual(Object.keys(mutationReport), ['schema', 'status', 'baselines', 'cases']);
  assert.equal(mutationReport.schema, 1);
  assert.equal(mutationReport.status, 'passed');
  assert.deepEqual(mutationReport.baselines, []);
  assert.equal(mutationReport.cases.length, 143);
  assert.deepEqual(
    mutationReport.cases.map(({ index }) => index),
    Array.from({ length: 143 }, (_, index) => index),
  );
});

test('partition grammar rejects malformed values before fixture creation', async () => {
  const cases = [
    [['--self-test', '--partition'], 'Error: invalid partition: <missing>'],
    [['--self-test', '--partition', '--jobs', '1'], 'Error: invalid partition: <missing>'],
    [
      ['--self-test', '--partition', 'baselines', '--partition', 'mutations'],
      'Error: invalid partition: "mutations" (duplicate --partition)',
    ],
    [
      ['--self-test', '--partition=baselines'],
      'Error: invalid partition: "baselines" (--partition must be a separate two-token option)',
    ],
    [
      ['--self-test', '--partition', 'baselines', '--partition=mutations'],
      'Error: invalid partition: "mutations" (--partition must be a separate two-token option)',
    ],
    [
      ['--partition=baselines', '--self-test', '--partition', 'mutations'],
      'Error: invalid partition: "baselines" (--partition must be a separate two-token option)',
    ],
    [['--self-test', '--partition='], 'Error: invalid partition: <missing>'],
    [['--self-test', '--partition', 'unknown'], 'Error: invalid partition: "unknown"'],
    [['--partition', 'baselines'], 'Error: --partition requires explicit --self-test'],
  ];
  for (const [argv, stderr] of cases) await spawnMalformed(argv, stderr);
});

test('retired option forms receive ordinary unknown-argument handling', async () => {
  const cases = [
    [['--self-test', '--shard', 'core'], 'Error: unknown or duplicate regression-driver argument: --shard'],
    [['--self-test', '--shard=core'], 'Error: unknown or duplicate regression-driver argument: --shard=core'],
    [
      ['--self-test', '--partition', 'mutations', '--shard', 'core'],
      'Error: unknown or duplicate regression-driver argument: --shard',
    ],
  ];
  for (const [argv, firstLine] of cases) await spawnGenericRejected(argv, firstLine);
});

test('partition grammar is exclusive with focus and every fixture or catalog mode', async () => {
  const cases = [
    [
      ['--self-test', '--partition', 'mutations', '--focus', 'orchestration signal mapping regression'],
      'Error: --partition "mutations" cannot be combined with --focus "orchestration signal mapping regression"',
    ],
    [
      ['--scheduler-self-test', '--partition', 'baselines'],
      'Error: --partition "baselines" cannot be combined with --scheduler-self-test',
    ],
    [
      ['--partition', 'baselines', '--namespace-isolation-fixture'],
      'Error: --partition "baselines" cannot be combined with --namespace-isolation-fixture',
    ],
    [
      ['--interrupt-fixture', '--partition', 'mutations'],
      'Error: --partition "mutations" cannot be combined with --interrupt-fixture',
    ],
    [
      ['--partition', 'baselines', '--list-focused-labels'],
      'Error: --partition "baselines" cannot be combined with --list-focused-labels',
    ],
    [
      ['--orchestration-oracle', '--partition', 'mutations'],
      'Error: --partition "mutations" cannot be combined with --orchestration-oracle',
    ],
    [
      ['--self-test', '--partition', 'baselines', '--orchestration-oracle'],
      'Error: --partition "baselines" cannot be combined with --orchestration-oracle',
    ],
  ];
  for (const [argv, stderr] of cases) await spawnMalformed(argv, stderr);
});
