import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { EXPECTED_LABELS as FOLLOW_DOCTOR_MAILBOX_LABELS } from '../../../plugins/session-relay/test/scenario-follow-doctor-mailbox.mjs';
import { EXPECTED_LABELS as SPAWN_WAKE_SUPERVISOR_LABELS } from '../../../plugins/session-relay/test/scenario-spawn-wake-supervisor.mjs';
import {
  PRE_SPLIT_STDOUT_SHA256,
  PRODUCTION_OUTPUT_LABELS,
  parseScenarioJobs,
  runScenarioScheduler,
  SCENARIOS,
  validateScenarioResult,
} from '../../../plugins/session-relay/test/selftest.mjs';
import { createFixture } from '../../../plugins/session-relay/test/selftest-fixture.mjs';

const EXPECTED_ORDER = [
  'core',
  'discovery-hardening',
  'hooks-identity',
  'appserver',
  'gc',
  'spawn-wake-supervisor',
  'follow-doctor-mailbox',
];

function payloadFor(scenario) {
  return {
    schema: 1,
    scenario: scenario.name,
    status: 'passed',
    count: scenario.expectedLabels.length,
    labels: [...scenario.expectedLabels],
  };
}

function expectedOutput(scenarios) {
  return scenarios
    .flatMap(({ expectedLabels }) => expectedLabels)
    .map((label) => `  ok: ${label}\n`)
    .join('');
}

function makeScenarios(count = 4) {
  return Array.from({ length: count }, (_, index) => ({
    name: `scenario-${index}`,
    modulePath: `/unused/scenario-${index}.mjs`,
    expectedLabels: [`label-${index}-a`, `label-${index}-b`],
  }));
}

function deferred() {
  let resolve;
  const promise = new Promise((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

function makeDeferredLauncher({ infrastructureFailureIndex = -1 } = {}) {
  const handles = new Map();
  const specs = new Map();
  const launched = [];
  const terminated = [];

  return {
    handles,
    specs,
    launched,
    terminated,
    launch(spec) {
      specs.set(spec.index, spec);
      launched.push(spec.index);
      if (spec.index === infrastructureFailureIndex) throw new Error(`launcher failed at ${spec.index}`);
      fs.mkdirSync(spec.home, { mode: 0o700 });
      const completion = deferred();
      let done = false;
      const settle = (outcome) => {
        if (done) return;
        done = true;
        completion.resolve(outcome);
      };
      const handle = {
        completion: completion.promise,
        settle,
        async terminate() {
          terminated.push(spec.index);
          settle({ code: null, signal: 'SIGTERM', stdout: '', stderr: '' });
        },
      };
      handles.set(spec.index, handle);
      return handle;
    },
  };
}

function failingOutcome(index) {
  return {
    code: index + 1,
    signal: null,
    stdout: `retained stdout ${index}\n`,
    stderr: `retained stderr ${index}\n`,
  };
}

function successfulOutcome(scenario) {
  return {
    code: 0,
    signal: null,
    stdout: expectedOutput([scenario]),
    stderr: '',
  };
}

function nextTurn() {
  return new Promise((resolve) => setImmediate(resolve));
}

function observeSettlement(promise) {
  const observation = { settled: false };
  observation.result = promise.then(
    (value) => {
      observation.settled = true;
      return { value };
    },
    (error) => {
      observation.settled = true;
      return { error };
    },
  );
  return observation;
}

function makeMemoryLauncher({ delays = [], observe } = {}) {
  let active = 0;
  return (spec) => {
    fs.mkdirSync(spec.home, { mode: 0o700 });
    active += 1;
    observe?.(active, spec);
    let settled = false;
    let resolveCompletion;
    const completion = new Promise((resolve) => {
      resolveCompletion = resolve;
    });
    const finish = (outcome) => {
      if (settled) return;
      settled = true;
      active -= 1;
      resolveCompletion(outcome);
    };
    const timer = setTimeout(() => {
      fs.writeFileSync(spec.resultPath, JSON.stringify(payloadFor(spec.scenario)), { mode: 0o600 });
      assert.equal(fs.statSync(spec.resultPath).mode & 0o077, 0);
      finish({
        code: 0,
        signal: null,
        stdout: expectedOutput([spec.scenario]),
        stderr: '',
      });
    }, delays[spec.index] ?? 15);
    return {
      completion,
      async terminate() {
        clearTimeout(timer);
        finish({ code: null, signal: 'SIGTERM', stdout: '', stderr: '' });
      },
    };
  };
}

function writeStub(file, body) {
  fs.writeFileSync(file, `import fs from 'node:fs';\n${body}\n`, { mode: 0o700 });
}

test('scenario catalog has the fixed seven-scenario split and immutable 133-label production order', () => {
  assert.deepEqual(
    SCENARIOS.map(({ name }) => name),
    EXPECTED_ORDER,
  );
  assert.equal(SPAWN_WAKE_SUPERVISOR_LABELS.length, 24);
  assert.equal(FOLLOW_DOCTOR_MAILBOX_LABELS.length, 6);
  assert.equal(
    SPAWN_WAKE_SUPERVISOR_LABELS.at(-1),
    'detached lifecycle supervisor preserves PTY and flood-disconnect custody',
  );

  const labels = SCENARIOS.flatMap(({ expectedLabels }) => expectedLabels);
  assert.equal(labels.length, 133);
  assert.equal(new Set(labels).size, 133);

  const prefix = SCENARIOS.slice(0, 5).flatMap(({ expectedLabels }) => expectedLabels);
  assert.deepEqual(PRODUCTION_OUTPUT_LABELS, [
    ...prefix,
    ...SPAWN_WAKE_SUPERVISOR_LABELS.slice(0, -1),
    ...FOLLOW_DOCTOR_MAILBOX_LABELS,
    SPAWN_WAKE_SUPERVISOR_LABELS.at(-1),
  ]);
  const rendered = PRODUCTION_OUTPUT_LABELS.map((label) => `  ok: ${label}\n`).join('');
  assert.equal(createHash('sha256').update(rendered).digest('hex'), PRE_SPLIT_STDOUT_SHA256);
});

test('SESSION_RELAY_TEST_JOBS accepts only canonical integers within the available cap', () => {
  assert.equal(parseScenarioJobs(undefined, 16), 4);
  assert.equal(parseScenarioJobs(undefined, 2), 2);
  assert.equal(parseScenarioJobs('1', 16), 1);
  assert.equal(parseScenarioJobs('4', 16), 4);
  for (const value of ['', '0', '5', '01', '+1', '1.0', ' 1', '1 ', '1e0', 1, null]) {
    assert.throws(() => parseScenarioJobs(value, 16), /SESSION_RELAY_TEST_JOBS.*integer.*1\.\.4/i);
  }
  assert.throws(() => parseScenarioJobs('3', 2), /SESSION_RELAY_TEST_JOBS.*1\.\.2/i);
});

test('fixture environments scrub every inherited wake-stub control', async () => {
  const keys = [
    'WAKE_STUB_FILE',
    'WAKE_STUB_STDOUT',
    'WAKE_STUB_STDERR',
    'WAKE_STUB_STATUS',
    'WAKE_STUB_DELAY_MS',
    'WAKE_STUB_RECORD',
  ];
  const inherited = new Map(keys.map((key) => [key, process.env[key]]));
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'relay-selftest-env-'));
  const home = path.join(fixtureRoot, 'home');
  let fixture;
  try {
    for (const key of keys) process.env[key] = `host-${key}`;
    fixture = createFixture({ bin: process.execPath, home });
    const env = fixture.envFor();
    for (const key of keys) assert.equal(Object.hasOwn(env, key), false, `${key} is scrubbed`);
    assert.equal(fixture.envFor({ WAKE_STUB_STATUS: '7' }).WAKE_STUB_STATUS, '7');
  } finally {
    await fixture?.cleanup();
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
    for (const [key, value] of inherited) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test('fixture cleanup removes its home and rejects when a tracked child cannot close', async () => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'relay-selftest-cleanup-failure-'));
  const home = path.join(fixtureRoot, 'home');
  const fixture = createFixture({ bin: process.execPath, home });
  const child = new EventEmitter();
  child.exitCode = null;
  child.signalCode = null;
  child.pid = undefined;
  child.kill = () => true;
  fixture.trackChild(child);

  try {
    await assert.rejects(fixture.cleanup(), /tracked child did not close after SIGKILL: <unknown>/);
    assert.equal(fs.existsSync(home), false, 'cleanup removes the owned home after reporting termination failure');
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('result validation is closed and rejects malformed, wrong, and duplicate label payloads', () => {
  const scenario = makeScenarios(1)[0];
  const valid = payloadFor(scenario);
  assert.deepEqual(validateScenarioResult(valid, scenario), valid);

  const invalid = [
    null,
    { ...valid, schema: 2 },
    { ...valid, scenario: 'wrong' },
    { ...valid, status: 'failed' },
    { ...valid, count: 1 },
    { ...valid, labels: [...valid.labels].reverse() },
    { ...valid, labels: [valid.labels[0], valid.labels[0]] },
    { ...valid, unexpected: true },
  ];
  for (const payload of invalid) assert.throws(() => validateScenarioResult(payload, scenario));
});

test('outputLabels rejects malformed or non-exact orders before root creation or launch', async () => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'relay-selftest-output-labels-'));
  const scenarios = makeScenarios(2);
  const labels = scenarios.flatMap(({ expectedLabels }) => expectedLabels);
  let roots = 0;
  let launches = 0;
  const invalidOrders = [
    null,
    {},
    [],
    [''],
    [labels[0], labels[0], ...labels.slice(2)],
    labels.slice(0, -1),
    [...labels, 'extra-label'],
  ];

  try {
    for (const outputLabels of invalidOrders) {
      await assert.rejects(
        runScenarioScheduler({
          scenarios,
          jobs: 2,
          bin: process.execPath,
          rootParent: fixtureRoot,
          outputLabels,
          launchScenario() {
            launches += 1;
            throw new Error('must not launch');
          },
          onOwnedRoot() {
            roots += 1;
          },
        }),
        /outputLabels/i,
      );
    }
    assert.equal(roots, 0);
    assert.equal(launches, 0);
    assert.deepEqual(fs.readdirSync(fixtureRoot), []);
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('jobs >= 2 overlap with distinct private homes/results while records remain declaration ordered', async () => {
  const scenarios = makeScenarios(4);
  const specs = [];
  let maximumActive = 0;
  const result = await runScenarioScheduler({
    scenarios,
    jobs: 2,
    bin: process.execPath,
    launchScenario: makeMemoryLauncher({
      delays: [80, 80, 10, 10],
      observe(active, spec) {
        maximumActive = Math.max(maximumActive, active);
        specs.push(spec);
        assert.equal(fs.statSync(spec.home).mode & 0o077, 0);
      },
    }),
  });
  assert.equal(maximumActive, 2);
  assert.equal(new Set(specs.map(({ home }) => home)).size, scenarios.length);
  assert.equal(new Set(specs.map(({ resultPath }) => resultPath)).size, scenarios.length);
  assert.ok(specs.every(({ home, resultPath }) => path.dirname(home) !== path.dirname(resultPath)));
  assert.deepEqual(
    result.records.map(({ scenario }) => scenario),
    scenarios.map(({ name }) => name),
  );
});

test('jobs 1 and jobs 4 produce byte-identical stdout in explicit outputLabels order', async () => {
  const scenarios = makeScenarios(4);
  const outputLabels = scenarios.flatMap(({ expectedLabels }) => expectedLabels).reverse();
  let maximumActive = 0;
  const serial = await runScenarioScheduler({
    scenarios,
    jobs: 1,
    bin: process.execPath,
    outputLabels,
    launchScenario: makeMemoryLauncher({ delays: [40, 30, 20, 10] }),
  });
  const parallel = await runScenarioScheduler({
    scenarios,
    jobs: 4,
    bin: process.execPath,
    outputLabels,
    launchScenario: makeMemoryLauncher({
      delays: [40, 30, 20, 10],
      observe(active) {
        maximumActive = Math.max(maximumActive, active);
      },
    }),
  });
  assert.equal(maximumActive, 4);
  const expected = outputLabels.map((label) => `  ok: ${label}\n`).join('');
  assert.deepEqual(serial.labels, outputLabels);
  assert.equal(serial.stdout, expected);
  assert.equal(parallel.stdout, serial.stdout);
  assert.deepEqual(
    parallel.records.map(({ scenario }) => scenario),
    scenarios.map(({ name }) => name),
  );
});

test('missing, malformed, wrong, stale, non-private, linked, and duplicate result artifacts fail closed', async () => {
  const scenario = makeScenarios(1)[0];
  const cases = [
    () => {},
    ({ resultPath }) => fs.writeFileSync(resultPath, '{', { mode: 0o600 }),
    ({ resultPath }) =>
      fs.writeFileSync(resultPath, JSON.stringify({ ...payloadFor(scenario), scenario: 'wrong' }), { mode: 0o600 }),
    ({ resultPath }) => {
      fs.writeFileSync(resultPath, JSON.stringify(payloadFor(scenario)), { mode: 0o600 });
      fs.utimesSync(resultPath, new Date(0), new Date(0));
    },
    ({ resultPath }) => {
      fs.writeFileSync(resultPath, JSON.stringify(payloadFor(scenario)), { mode: 0o600 });
      fs.chmodSync(resultPath, 0o644);
    },
    ({ resultPath }) => {
      fs.writeFileSync(resultPath, JSON.stringify(payloadFor(scenario)), { mode: 0o600 });
      fs.linkSync(resultPath, `${resultPath}.hardlink`);
    },
    ({ resultPath }) => {
      fs.writeFileSync(resultPath, JSON.stringify(payloadFor(scenario)), { mode: 0o600 });
      fs.writeFileSync(`${resultPath}.duplicate`, JSON.stringify(payloadFor(scenario)), { mode: 0o600 });
    },
  ];

  for (const arrange of cases) {
    await assert.rejects(
      runScenarioScheduler({
        scenarios: [scenario],
        jobs: 1,
        bin: process.execPath,
        launchScenario(spec) {
          fs.mkdirSync(spec.home, { mode: 0o700 });
          arrange(spec);
          return {
            completion: Promise.resolve({
              code: 0,
              signal: null,
              stdout: expectedOutput([scenario]),
              stderr: '',
            }),
            async terminate() {},
          };
        },
      }),
      /result|artifact|JSON|stale|unexpected/i,
    );
  }

  await assert.rejects(
    runScenarioScheduler({
      scenarios: [scenario, { ...scenario }],
      jobs: 1,
      bin: process.execPath,
      launchScenario: makeMemoryLauncher(),
    }),
    /duplicate.*scenario/i,
  );
});

test('ordinary failures stop pending launches, await active peers, and retain failures in catalog order', async () => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'relay-selftest-unit-'));
  const scenarios = makeScenarios(4);
  const controlled = makeDeferredLauncher();
  let ownedRoot;

  try {
    const observation = observeSettlement(
      runScenarioScheduler({
        scenarios,
        jobs: 2,
        bin: process.execPath,
        rootParent: fixtureRoot,
        launchScenario: controlled.launch,
        onOwnedRoot(root) {
          ownedRoot = root;
        },
      }),
    );

    assert.deepEqual(controlled.launched, [0, 1]);
    assert.equal(fs.existsSync(ownedRoot), true);

    controlled.handles.get(1).settle(failingOutcome(1));
    await nextTurn();

    assert.deepEqual(controlled.launched, [0, 1]);
    assert.deepEqual(controlled.terminated, []);
    assert.equal(observation.settled, false);
    assert.equal(fs.existsSync(ownedRoot), true);

    controlled.handles.get(0).settle(failingOutcome(0));
    const { error } = await observation.result;

    assert.ok(error instanceof Error);
    assert.deepEqual(
      error.failures.map(({ scenario }) => scenario),
      ['scenario-0', 'scenario-1'],
    );
    assert.deepEqual(
      error.failures.map(({ scenarioIndex }) => scenarioIndex),
      [0, 1],
    );
    assert.deepEqual(
      error.failures.map(({ stdout }) => stdout),
      ['retained stdout 0\n', 'retained stdout 1\n'],
    );
    assert.deepEqual(
      error.failures.map(({ stderr }) => stderr),
      ['retained stderr 0\n', 'retained stderr 1\n'],
    );
    assert.deepEqual(
      error.failures.map(({ infrastructure }) => infrastructure),
      [false, false],
    );
    assert.deepEqual(controlled.terminated, []);
    assert.equal(fs.existsSync(ownedRoot), false);
    assert.equal(fs.existsSync(fixtureRoot), true);
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('a real ordinary failure drains a finite active peer without terminating it or launching pending work', async () => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'relay-selftest-real-ordinary-'));
  const failingScript = path.join(fixtureRoot, 'failing.mjs');
  const peerScript = path.join(fixtureRoot, 'peer.mjs');
  const pendingScript = path.join(fixtureRoot, 'pending.mjs');
  const failingPid = path.join(fixtureRoot, 'failing.pid');
  const peerPid = path.join(fixtureRoot, 'peer.pid');
  const pendingPid = path.join(fixtureRoot, 'pending.pid');
  const peerCompleted = path.join(fixtureRoot, 'peer-completed');
  const scenarios = makeScenarios(3).map((scenario, index) => ({
    ...scenario,
    modulePath: [failingScript, peerScript, pendingScript][index],
    env: {
      PID_FILE: [failingPid, peerPid, pendingPid][index],
      ...(index === 1 ? { PEER_COMPLETED: peerCompleted } : {}),
    },
  }));
  let ownedRoot;

  writeStub(
    failingScript,
    'fs.writeFileSync(process.env.PID_FILE, String(process.pid)); fs.mkdirSync(process.env.SESSION_RELAY_SCENARIO_HOME, { mode: 0o700 }); await new Promise((resolve) => setTimeout(resolve, 40)); process.exitCode = 7;',
  );
  writeStub(
    peerScript,
    `fs.writeFileSync(process.env.PID_FILE, String(process.pid)); fs.mkdirSync(process.env.SESSION_RELAY_SCENARIO_HOME, { mode: 0o700 }); await new Promise((resolve) => setTimeout(resolve, 250)); fs.writeFileSync(process.env.SESSION_RELAY_SCENARIO_RESULT, ${JSON.stringify(JSON.stringify(payloadFor(scenarios[1])))}, { mode: 0o600 }); fs.writeFileSync(process.env.PEER_COMPLETED, 'completed'); process.stdout.write(${JSON.stringify(expectedOutput([scenarios[1]]))});`,
  );
  writeStub(
    pendingScript,
    'fs.writeFileSync(process.env.PID_FILE, String(process.pid)); fs.mkdirSync(process.env.SESSION_RELAY_SCENARIO_HOME, { mode: 0o700 });',
  );

  const isLive = (pid) => {
    try {
      process.kill(pid, 0);
      return true;
    } catch (error) {
      if (error?.code === 'ESRCH') return false;
      throw error;
    }
  };

  try {
    const failure = await runScenarioScheduler({
      scenarios,
      jobs: 2,
      bin: process.execPath,
      rootParent: fixtureRoot,
      onOwnedRoot(root) {
        ownedRoot = root;
      },
    }).then(
      () => undefined,
      (error) => error,
    );

    assert.ok(failure instanceof Error);
    assert.equal(failure.failures[0].scenario, scenarios[0].name);
    assert.equal(failure.failures[0].infrastructure, false);
    assert.equal(fs.existsSync(failingPid), true);
    assert.equal(fs.existsSync(peerPid), true);
    assert.equal(fs.existsSync(peerCompleted), true, 'finite peer completed naturally instead of being terminated');
    assert.equal(fs.existsSync(pendingPid), false, 'pending scenario never launched');
    assert.equal(isLive(Number(fs.readFileSync(failingPid, 'utf8'))), false);
    assert.equal(isLive(Number(fs.readFileSync(peerPid, 'utf8'))), false);
    assert.equal(fs.existsSync(ownedRoot), false);
    assert.equal(fs.existsSync(fixtureRoot), true);
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('launcher failures terminate every active handle and remove only the owned root', async () => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'relay-selftest-infrastructure-'));
  const scenarios = makeScenarios(5);
  const controlled = makeDeferredLauncher({ infrastructureFailureIndex: 2 });
  let ownedRoot;

  try {
    const failure = await runScenarioScheduler({
      scenarios,
      jobs: 3,
      bin: process.execPath,
      rootParent: fixtureRoot,
      launchScenario: controlled.launch,
      onOwnedRoot(root) {
        ownedRoot = root;
      },
    }).then(
      () => undefined,
      (error) => error,
    );

    assert.ok(failure instanceof Error);
    assert.deepEqual(controlled.launched, [0, 1, 2]);
    assert.deepEqual(controlled.terminated, [0, 1]);
    assert.deepEqual(
      failure.failures.map(({ scenario, scenarioIndex, infrastructure }) => ({
        scenario,
        scenarioIndex,
        infrastructure,
      })),
      [{ scenario: 'scenario-2', scenarioIndex: 2, infrastructure: true }],
    );
    assert.equal(fs.existsSync(ownedRoot), false);
    assert.equal(fs.existsSync(fixtureRoot), true);
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('output and result protocol failures terminate an active peer as infrastructure failures', async (t) => {
  const cases = [
    {
      name: 'bounded output overflow',
      maxOutputBytes: 8,
      message: /output limit/i,
      prepare() {
        return {
          outcome: { code: 0, signal: null, stdout: 'ABCDEFGHIJK', stderr: '' },
          retainedStdout: 'ABCDEFGH',
        };
      },
    },
    {
      name: 'missing result artifact',
      maxOutputBytes: 1024,
      message: /result artifact is missing/i,
      prepare({ scenario }) {
        return { outcome: successfulOutcome(scenario), retainedStdout: expectedOutput([scenario]) };
      },
    },
    {
      name: 'malformed result artifact',
      maxOutputBytes: 1024,
      message: /malformed JSON/i,
      prepare({ scenario, spec }) {
        fs.writeFileSync(spec.resultPath, '{', { mode: 0o600 });
        return { outcome: successfulOutcome(scenario), retainedStdout: expectedOutput([scenario]) };
      },
    },
  ];

  for (const fixture of cases) {
    await t.test(fixture.name, async () => {
      const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'relay-selftest-protocol-'));
      const scenarios = makeScenarios(3);
      const controlled = makeDeferredLauncher();
      let ownedRoot;

      try {
        const scheduled = runScenarioScheduler({
          scenarios,
          jobs: 2,
          bin: process.execPath,
          rootParent: fixtureRoot,
          maxOutputBytes: fixture.maxOutputBytes,
          launchScenario: controlled.launch,
          onOwnedRoot(root) {
            ownedRoot = root;
          },
        });
        assert.deepEqual(controlled.launched, [0, 1]);

        const prepared = fixture.prepare({
          scenario: scenarios[1],
          spec: controlled.specs.get(1),
        });
        controlled.handles.get(1).settle(prepared.outcome);
        const failure = await scheduled.then(
          () => undefined,
          (error) => error,
        );

        assert.ok(failure instanceof Error);
        assert.deepEqual(controlled.launched, [0, 1]);
        assert.deepEqual(controlled.terminated, [0, 1]);
        assert.equal(failure.failures.length, 1);
        assert.equal(failure.failures[0].scenario, 'scenario-1');
        assert.equal(failure.failures[0].scenarioIndex, 1);
        assert.equal(failure.failures[0].infrastructure, true);
        assert.match(failure.failures[0].message, fixture.message);
        assert.equal(failure.failures[0].stdout, prepared.retainedStdout);
        assert.equal(failure.failures[0].stderr, '');
        assert.equal(fs.existsSync(ownedRoot), false);
        assert.equal(fs.existsSync(fixtureRoot), true);
      } finally {
        fs.rmSync(fixtureRoot, { recursive: true, force: true });
      }
    });
  }
});

test('captured stdout is bounded and overflow diagnostics are deterministic', async () => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'relay-selftest-output-'));
  const floodScript = path.join(fixtureRoot, 'flood.mjs');
  writeStub(
    floodScript,
    "fs.mkdirSync(process.env.SESSION_RELAY_SCENARIO_HOME, { mode: 0o700 }); process.stdout.write('A'.repeat(4096)); setInterval(() => {}, 1000);",
  );
  const scenario = { name: 'flood', modulePath: floodScript, expectedLabels: ['never'] };
  try {
    const failures = [];
    for (let attempt = 0; attempt < 2; attempt += 1) {
      failures.push(
        await runScenarioScheduler({ scenarios: [scenario], jobs: 1, bin: process.execPath, maxOutputBytes: 128 }).then(
          () => undefined,
          (error) => error,
        ),
      );
    }
    for (const failure of failures) {
      assert.ok(failure instanceof Error);
      assert.match(failure.message, /output.*128|128.*output/i);
      assert.equal(Buffer.byteLength(failure.stdout), 128);
      assert.equal(failure.stdout, 'A'.repeat(128));
      assert.equal(failure.stderr, '');
    }
    assert.equal(failures[0].message, failures[1].message);
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('decoded overflow diagnostics remain within their UTF-8 byte bound', async () => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'relay-selftest-utf8-output-'));
  const floodScript = path.join(fixtureRoot, 'multibyte-flood.mjs');
  writeStub(
    floodScript,
    "fs.mkdirSync(process.env.SESSION_RELAY_SCENARIO_HOME, { mode: 0o700 }); process.stdout.write('é'); setInterval(() => {}, 1000);",
  );
  const scenario = { name: 'multibyte-flood', modulePath: floodScript, expectedLabels: ['never'] };
  try {
    const failure = await runScenarioScheduler({
      scenarios: [scenario],
      jobs: 1,
      bin: process.execPath,
      maxOutputBytes: 1,
    }).then(
      () => undefined,
      (error) => error,
    );
    assert.ok(failure instanceof Error);
    assert.match(failure.message, /output.*1|1.*output/i);
    assert.ok(Buffer.byteLength(failure.stdout) + Buffer.byteLength(failure.stderr) <= 1);
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('dual-stream overflow retains deterministic descriptor-ordered diagnostics', async () => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'relay-selftest-dual-output-'));
  const floodScript = path.join(fixtureRoot, 'dual-flood.mjs');
  writeStub(
    floodScript,
    "fs.mkdirSync(process.env.SESSION_RELAY_SCENARIO_HOME, { mode: 0o700 }); const stdoutFirst = process.env.DUAL_STREAM_ORDER === 'stdout-first'; const first = stdoutFirst ? process.stdout : process.stderr; const second = stdoutFirst ? process.stderr : process.stdout; first.write((stdoutFirst ? 'A' : 'B').repeat(4096)); second.write((stdoutFirst ? 'B' : 'A').repeat(4096)); setInterval(() => {}, 1000);",
  );
  const scenario = { name: 'dual-flood', modulePath: floodScript, expectedLabels: ['never'] };
  try {
    const diagnostics = [];
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const failure = await runScenarioScheduler({
        scenarios: [{ ...scenario, env: { DUAL_STREAM_ORDER: attempt % 2 === 0 ? 'stderr-first' : 'stdout-first' } }],
        jobs: 1,
        bin: process.execPath,
        maxOutputBytes: 6144,
      }).then(
        () => undefined,
        (error) => error,
      );
      assert.ok(failure instanceof Error);
      assert.match(failure.message, /output.*6144|6144.*output/i);
      assert.equal(Buffer.byteLength(failure.stdout) + Buffer.byteLength(failure.stderr), 6144);
      diagnostics.push({ stdout: failure.stdout, stderr: failure.stderr });
    }
    assert.deepEqual(diagnostics, Array(5).fill({ stdout: 'A'.repeat(4096), stderr: 'B'.repeat(2048) }));
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});
