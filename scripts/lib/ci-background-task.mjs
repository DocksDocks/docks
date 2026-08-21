import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const COMMAND_RECORD_SCHEMA = 1;
export const RUN_ORIGIN_NS = process.hrtime.bigint();

// A background child outlives the orchestrator's attention: `ci.mjs` blocks its own event loop in
// `spawnSync` for minutes at a time, so the parent observes `close` only at the join point. Measuring
// there reports the await window, not the process lifetime. Neither a parent listener nor a worker
// thread fixes that: a worker's loop was observed stalled for the whole blocking window on 10-30% of
// runs, which is the same defect with a smaller error bar. The launcher below is a separate OS
// process, so the kernel schedules it independently of this loop. It measures its own child with one
// monotonic clock and reports the lifetime; the parent only has to place that interval on its own
// timeline. Verify: run a 1 s child behind a 2.5 s blocking `spawnSync` and read the recorded
// duration (`node --test scripts/tests/unit/ci-background-task.test.mjs`).
const LAUNCHER_SOURCE = [
  "import { spawn } from 'node:child_process';",
  "import fs from 'node:fs';",
  'const [stampPath, stdoutPath, stderrPath, command, ...args] = process.argv.slice(1);',
  "const stdoutFile = fs.createWriteStream(stdoutPath, { flags: 'wx', mode: 0o600 });",
  "const stderrFile = fs.createWriteStream(stderrPath, { flags: 'wx', mode: 0o600 });",
  'let failure = null;',
  'const noteStreamError = (error) => { failure ||= error.message; };',
  "stdoutFile.on('error', noteStreamError);",
  "stderrFile.on('error', noteStreamError);",
  'let child = null;',
  'const spawnedAtNs = process.hrtime.bigint();',
  'const spawnedAtEpochMs = Date.now();',
  'try {',
  "  child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });",
  '} catch (error) {',
  '  failure = error.message;',
  '}',
  'const flushed = (stream) => new Promise((resolve) => { if (stream.closed) resolve(); else stream.end(resolve); });',
  'const report = async (code, signal) => {',
  '  const lifetimeNs = process.hrtime.bigint() - spawnedAtNs;',
  '  await Promise.all([flushed(stdoutFile), flushed(stderrFile)]);',
  '  fs.writeFileSync(',
  '    stampPath,',
  '    JSON.stringify({',
  '      spawned_at_epoch_ms: spawnedAtEpochMs,',
  '      lifetime_ns: lifetimeNs.toString(),',
  '      code,',
  '      signal,',
  '      error: failure,',
  '    }),',
  '    { mode: 0o600 },',
  '  );',
  '  process.exit(failure === null && signal === null && code === 0 ? 0 : 1);',
  '};',
  'if (child === null) report(null, null);',
  'else {',
  '  child.stdout.pipe(stdoutFile);',
  '  child.stderr.pipe(stderrFile);',
  "  child.on('error', (error) => {",
  '    failure ||= error.message;',
  '  });',
  "  child.on('close', report);",
  '}',
].join('\n');

export function elapsedMs(atNs = process.hrtime.bigint()) {
  if (atNs <= RUN_ORIGIN_NS) return 0;
  return Number((atNs - RUN_ORIGIN_NS) / 1_000_000n);
}

function commandRecord({
  id,
  kind,
  phase,
  argv,
  cwd,
  startedMs,
  endedMs = startedMs,
  status = 'failed',
  exitCode = null,
  signal = null,
  retainedOutput = null,
  cache = null,
}) {
  return {
    schema: COMMAND_RECORD_SCHEMA,
    id,
    kind,
    phase,
    argv,
    cwd,
    started_ms: startedMs,
    ended_ms: endedMs,
    duration_ms: endedMs - startedMs,
    status,
    exit_code: exitCode,
    signal,
    overlap_ms: 0,
    retained_output: retainedOutput,
    cache,
  };
}

export function beginCommand(commands, { id, kind, argv, cwd = null, phase = null }) {
  const record = commandRecord({ id, kind, phase, argv, cwd, startedMs: elapsedMs() });
  commands.push(record);

  return {
    finish({ status, exit_code = null, signal = null, retained_output = null, cache = null }) {
      record.ended_ms = Math.max(record.started_ms, elapsedMs());
      record.duration_ms = record.ended_ms - record.started_ms;
      record.status = status;
      record.exit_code = exit_code;
      record.signal = signal;
      record.retained_output = retained_output;
      record.cache = cache;
      return record;
    },
  };
}

export function startTask(name, command, args, options = {}) {
  const {
    cwd,
    tasks,
    commands = null,
    phase = null,
    errorStream = process.stderr,
    artifactRoot = os.tmpdir(),
    env = process.env,
  } = options;
  if (tasks.some((task) => task.name === name)) throw new Error(`duplicate task name: ${name}`);

  const artifactDirectory = fs.mkdtempSync(path.join(artifactRoot, 'docks-ci-task-'));
  fs.chmodSync(artifactDirectory, 0o700);
  const stdoutPath = path.join(artifactDirectory, 'stdout.log');
  const stderrPath = path.join(artifactDirectory, 'stderr.log');
  const stampPath = path.join(artifactDirectory, 'stamp.json');
  // The launcher owns both log files. Routing the child's output through this process would make the
  // gate's own blocked event loop the child's backpressure limit: a task that writes more than one
  // pipe buffer would stall until the join point and then report the whole blocking window as its
  // lifetime, which is the exact defect this module exists to remove.
  const task = { name, duration_ms: 0, status: 'failed' };
  tasks.push(task);

  const parentSpawnNs = process.hrtime.bigint();
  const parentSpawnEpochMs = Date.now();

  // The launcher reports its child's lifetime on its own monotonic clock plus the wall-clock instant
  // it started that child. The parent turns those two facts into one interval on its own monotonic
  // timeline: the wall-clock delta only places the interval (tens of milliseconds of process boot),
  // while the duration itself never leaves a single monotonic clock.
  const placeInterval = (stamp) => {
    const lifetimeMs = Math.max(0, Math.round(Number(BigInt(stamp.lifetime_ns)) / 1e6));
    const bootMs = stamp.spawned_at_epoch_ms - parentSpawnEpochMs;
    const offsetMs = Number.isFinite(bootMs) && bootMs >= 0 && bootMs <= 60_000 ? Math.round(bootMs) : 0;
    const startedMs = elapsedMs(parentSpawnNs) + offsetMs;
    return { startedMs, endedMs: startedMs + lifetimeMs };
  };

  return new Promise((resolve) => {
    let settled = false;

    const finishTask = ({ startedMs, endedMs, code = null, signal = null, error = null }) => {
      if (settled) return;
      settled = true;

      const passed = error === null && signal === null && code === 0;
      task.duration_ms = Math.max(0, endedMs - startedMs);
      task.status = passed ? 'passed' : 'failed';
      const retainedOutput = passed ? null : { stdout: path.resolve(stdoutPath), stderr: path.resolve(stderrPath) };

      if (commands) {
        commands.push(
          commandRecord({
            id: name,
            kind: 'background',
            phase,
            argv: [command, ...args],
            cwd: cwd ?? null,
            startedMs,
            endedMs: Math.max(startedMs, endedMs),
            status: task.status,
            exitCode: code,
            signal,
            retainedOutput,
          }),
        );
      }

      if (passed) {
        fs.rmSync(artifactDirectory, { recursive: true });
      } else {
        errorStream.write(`${name} output retained: stdout=${stdoutPath} stderr=${stderrPath}\n`);
        if (error) errorStream.write(`${error}\n`);
        else if (signal) errorStream.write(`${name} terminated by ${signal}\n`);
      }
      resolve(passed);
    };

    const observed = (error) => ({
      startedMs: elapsedMs(parentSpawnNs),
      endedMs: elapsedMs(),
      error,
    });

    let launcher;
    try {
      launcher = spawn(
        process.execPath,
        ['--input-type=module', '--eval', LAUNCHER_SOURCE, '--', stampPath, stdoutPath, stderrPath, command, ...args],
        { cwd, env, stdio: ['ignore', 'ignore', 'ignore'] },
      );
    } catch (error) {
      finishTask(observed(error.message));
      return;
    }

    let launcherError = null;
    launcher.on('error', (error) => {
      launcherError ||= error;
    });
    launcher.on('close', (code, signal) => {
      if (launcherError !== null) {
        finishTask(observed(launcherError.message));
        return;
      }
      if (signal !== null) {
        finishTask({ ...observed(null), signal, code: null });
        return;
      }
      let stamp;
      try {
        stamp = JSON.parse(fs.readFileSync(stampPath, 'utf8'));
      } catch (error) {
        finishTask(observed(`${name} launcher reported no timing stamp: ${error.message}`));
        return;
      }
      fs.rmSync(stampPath, { force: true });
      const { startedMs, endedMs } = placeInterval(stamp);
      finishTask({
        startedMs,
        endedMs,
        code: stamp.error === null && stamp.signal === null ? stamp.code : code,
        signal: stamp.signal,
        error: stamp.error,
      });
    });
  });
}

export function summarizeCommands(commands, totalMs) {
  for (const record of commands) record.overlap_ms = 0;

  const events = new Map();
  let commandTotalMs = 0;
  for (const [index, record] of commands.entries()) {
    const duration = Math.max(0, Math.trunc(record.duration_ms));
    commandTotalMs += duration;
    if (duration === 0) continue;
    const started = Math.max(0, Math.trunc(record.started_ms));
    const ended = started + duration;
    const startEvent = events.get(started) ?? { starts: [], ends: [] };
    startEvent.starts.push(index);
    events.set(started, startEvent);
    const endEvent = events.get(ended) ?? { starts: [], ends: [] };
    endEvent.ends.push(index);
    events.set(ended, endEvent);
  }

  const active = new Set();
  let previousAt = null;
  let commandBusyMs = 0;
  let peakConcurrency = 0;
  for (const at of [...events.keys()].sort((left, right) => left - right)) {
    if (previousAt !== null && active.size > 0) {
      const width = at - previousAt;
      commandBusyMs += width;
      if (active.size > 1) {
        for (const index of active) commands[index].overlap_ms += width;
      }
    }
    const event = events.get(at);
    for (const index of event.ends) active.delete(index);
    for (const index of event.starts) active.add(index);
    peakConcurrency = Math.max(peakConcurrency, active.size);
    previousAt = at;
  }

  const wallMs = Math.max(0, Math.trunc(totalMs));
  const overlapMs = Math.max(0, commandTotalMs - commandBusyMs);
  return {
    wall_ms: wallMs,
    command_busy_ms: commandBusyMs,
    command_total_ms: commandTotalMs,
    overlap_ms: overlapMs,
    unaccounted_ms: Math.max(0, wallMs - commandBusyMs),
    peak_concurrency: peakConcurrency,
  };
}
