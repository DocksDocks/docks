import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const EXTENSION = path.resolve(import.meta.dirname, '../../../plugins/docks/extensions/verify-gate.ts');
const CORE = path.resolve(import.meta.dirname, '../../../plugins/docks/extensions/verify-gate-core.mjs');
const UNVERIFIED = 'git commit -m "fix: handle empty input"';
const VERIFIED = 'git commit -m "fix: handle empty input" -m "Verified: bun test scripts/tests/unit"';
const DENY_REASON =
  'verify-gate: the commit message has no Verified: trailer. Add a last paragraph with ' +
  '`Verified: <command>[; <command>]` or `Verified: none - <reason>`. Name the checks that you ran, or say why none ran.';

// Each test gives its calls their own state folder. This folder holds XDG_STATE_HOME for the whole run, so a call
// without its own folder cannot write into the real user log.
const SUITE_STATE = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'verify-gate-suite-')));
process.env.XDG_STATE_HOME = SUITE_STATE;
process.on('exit', () => fs.rmSync(SUITE_STATE, { recursive: true, force: true }));

// The git file that the PATH of the test process names first.
const REAL_GIT = (process.env.PATH ?? '')
  .split(path.delimiter)
  .map((dir) => path.join(dir, 'git'))
  .find((file) => fs.existsSync(file));

function tempDir(label, t) {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), `verify-gate-${label}-`)));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

// Run the extension factory with a fake `pi` that records each handler, and return the one `tool_call` handler.
async function toolCallHandler() {
  const { default: factory } = await import(EXTENSION);
  assert.equal(typeof factory, 'function', 'the extension must export a default factory');
  const handlers = new Map();
  await factory({ on: (name, handler) => handlers.set(name, [...(handlers.get(name) ?? []), handler]) });
  const list = handlers.get('tool_call') ?? [];
  assert.equal(list.length, 1, 'the extension must register one tool_call handler');
  return list[0];
}

// Set the environment that omp gives the extension for one call, and put the old values back after it.
async function withEnv(values, action) {
  const previous = Object.fromEntries(Object.keys(values).map((key) => [key, process.env[key]]));
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    return await action();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

const sessionContext = (cwd, session) => ({ cwd, sessionManager: { getSessionId: () => session } });

// Drive a tool_call handler once with a bash call. `ctx` replaces the default session context, and `handler`
// replaces a new handler. A call without `state` uses the state folder of the suite.
async function runGate({
  state = SUITE_STATE,
  mode,
  command,
  cwd = os.tmpdir(),
  inputCwd,
  session = 's1',
  toolName = 'bash',
  ctx = sessionContext(cwd, session),
  handler,
}) {
  const toolCall = handler ?? (await toolCallHandler());
  const input = inputCwd === undefined ? { command } : { command, cwd: inputCwd };
  const event = { type: 'tool_call', toolName, toolCallId: 'call_1', input };
  return withEnv({ XDG_STATE_HOME: state, DOCKS_VERIFY_GATE: mode }, () => toolCall(event, ctx));
}

// A git repository with one commit whose message carries the trailer, and a second commit without it.
function gitRepo(label, t) {
  const repo = tempDir(label, t);
  const git = (...args) => execFileSync('git', args, { cwd: repo, encoding: 'utf8' });
  git('init', '-q', '-b', 'main');
  git('config', 'user.email', 'verify-gate@example.test');
  git('config', 'user.name', 'Verify Gate Test');
  git('commit', '-q', '--allow-empty', '-m', 'chore: seed', '-m', 'Verified: none - empty seed commit');
  git('commit', '-q', '--allow-empty', '-m', 'chore: second');
  return repo;
}

function logLines(state) {
  const file = path.join(state, 'docks', 'verify-gate.jsonl');
  if (!fs.existsSync(file)) return [];
  return fs
    .readFileSync(file, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

// A deny gives the unchanged reason text of the old hook.
function assertDenied(result) {
  assert.deepEqual(result, { block: true, reason: DENY_REASON });
}

// Record each write to stdout and stderr and each console call while `action` runs.
async function captureOutput(action) {
  const printed = [];
  const streams = [process.stdout, process.stderr];
  const writes = streams.map((stream) => stream.write);
  const consoleMethods = ['log', 'info', 'warn', 'error', 'debug'];
  const consoleOriginals = consoleMethods.map((name) => console[name]);
  for (const stream of streams) {
    stream.write = (chunk, ...rest) => {
      printed.push(String(chunk));
      const callback = rest.find((value) => typeof value === 'function');
      callback?.();
      return true;
    };
  }
  for (const name of consoleMethods) console[name] = (...args) => printed.push(args.join(' '));
  try {
    return { result: await action(), printed };
  } finally {
    for (const [index, stream] of streams.entries()) stream.write = writes[index];
    for (const [index, name] of consoleMethods.entries()) console[name] = consoleOriginals[index];
  }
}

test('off mode allows a commit without the trailer and writes no log', async (t) => {
  const state = tempDir('off', t);
  assert.equal(await runGate({ state, mode: 'off', command: UNVERIFIED }), undefined);
  assert.equal(fs.existsSync(path.join(state, 'docks')), false);
});

test('observe mode is the default, allows the commit, and appends one log line', async (t) => {
  const state = tempDir('observe', t);
  const cwd = tempDir('observe-cwd', t);
  assert.equal(await runGate({ state, command: UNVERIFIED, cwd }), undefined);
  assert.equal(await runGate({ state, mode: 'observe', command: VERIFIED, cwd }), undefined);
  const lines = logLines(state);
  assert.equal(lines.length, 1);
  assert.deepEqual(Object.keys(lines[0]).sort(), ['cwd', 'message_sources', 'mode', 'session_id', 'time']);
  assert.equal(lines[0].mode, 'observe');
  assert.deepEqual(lines[0].message_sources, ['-m']);
  assert.equal(lines[0].session_id, 's1');
  assert.equal(lines[0].cwd, cwd);
  assert.equal(new Date(lines[0].time).toISOString(), lines[0].time);
  assert.equal(fs.statSync(path.join(state, 'docks')).mode & 0o777, 0o700);
  assert.equal(fs.statSync(path.join(state, 'docks', 'verify-gate.jsonl')).mode & 0o777, 0o600);
});

test('enforce mode denies twice in a session, then allows and logs the third commit', async (t) => {
  const state = tempDir('enforce', t);
  assertDenied(await runGate({ state, mode: 'enforce', command: UNVERIFIED }));
  assertDenied(await runGate({ state, mode: 'enforce', command: UNVERIFIED }));
  // Another session keeps its own count.
  assertDenied(await runGate({ state, mode: 'enforce', command: UNVERIFIED, session: 's2' }));
  assert.equal(logLines(state).length, 0);
  assert.equal(await runGate({ state, mode: 'enforce', command: UNVERIFIED }), undefined);
  const lines = logLines(state);
  assert.equal(lines.length, 1);
  assert.equal(lines[0].session_id, 's1');
  assert.equal(lines[0].mode, 'enforce');
  assert.equal(lines[0].allowed_after_denials, 2);
  assert.deepEqual(Object.keys(lines[0]).sort(), [
    'allowed_after_denials',
    'cwd',
    'message_sources',
    'mode',
    'session_id',
    'time',
  ]);
  // The count starts again after the allowed commit.
  assertDenied(await runGate({ state, mode: 'enforce', command: UNVERIFIED }));
});

test('the log holds no text of the command or the message, so a secret in either stays out', async (t) => {
  const state = tempDir('secret', t);
  const token = 'ghp_TESTTOKEN123';
  const commands = [
    `GH_TOKEN=${token} gh auth status && git commit -m "fix: rotate key" -m "Body names ${token}."`,
    `git commit -m "fix: remove token ${token}"`,
    `git commit -F - <<EOF\nfix: remove token ${token}\nEOF`,
  ];
  for (const [index, command] of commands.entries()) {
    assert.equal(await runGate({ state, mode: 'observe', command }), undefined, command);
    for (let call = 0; call < 3; call += 1) {
      await runGate({ state, mode: 'enforce', command, session: `secret-${index}` });
    }
  }
  const raw = fs.readFileSync(path.join(state, 'docks', 'verify-gate.jsonl'), 'utf8');
  assert.deepEqual(
    logLines(state).map((line) => line.mode),
    ['observe', 'enforce', 'observe', 'enforce', 'observe', 'enforce'],
  );
  assert.equal(raw.includes(token), false, raw);
  assert.equal(raw.includes('gh auth status'), false, raw);
  assert.equal(raw.includes('rotate key'), false, raw);
  assert.equal(raw.includes('remove token'), false, raw);
});

test('the log names each message source kind', async (t) => {
  const state = tempDir('sources', t);
  await runGate({ state, command: 'git commit -m "fix: x"' });
  await runGate({ state, command: 'git commit' });
  await runGate({ state, command: 'git commit -F - --trailer "Reviewed-by=A" <<EOF\nfix: y\nEOF' });
  assert.deepEqual(
    logLines(state).map((line) => line.message_sources),
    [['-m'], ['none'], ['-F', '--trailer']],
  );
});

test('enforce mode allows a commit whose message carries the trailer', async (t) => {
  const state = tempDir('trailer', t);
  assert.equal(await runGate({ state, mode: 'enforce', command: VERIFIED }), undefined);
  const heredoc = [
    `git add -A && git commit -m "$(cat <<'EOF'`,
    'fix: handle (unbalanced input',
    '',
    'Verified: none - documentation only',
    'EOF',
    ')"',
  ].join('\n');
  assert.equal(await runGate({ state, mode: 'enforce', command: heredoc }), undefined);
  assert.equal(
    await runGate({ state, mode: 'enforce', command: 'git commit -m "fix: x" --trailer "Verified=bun test"' }),
    undefined,
  );
  // A bare `none` without a reason and a trailer in the subject line do not count.
  assertDenied(await runGate({ state, mode: 'enforce', command: 'git commit -m "fix: x" -m "Verified: none"' }));
  assertDenied(await runGate({ state, mode: 'enforce', command: 'git commit -m "Verified: bun test"' }));
});

test('a command without a creating git commit is allowed in enforce mode', async (t) => {
  const state = tempDir('non-commit', t);
  for (const command of ['ls -la', 'git status && git log -1', 'echo "git commit -m x"', 'git commit --dry-run -m x']) {
    assert.equal(await runGate({ state, mode: 'enforce', command }), undefined, command);
  }
  assert.equal(logLines(state).length, 0);
});

test('a call of another tool than bash is allowed and logs nothing, also with a commit command', async (t) => {
  const state = tempDir('non-bash', t);
  for (const toolName of ['edit', 'write', 'eval']) {
    assert.equal(await runGate({ state, mode: 'observe', command: UNVERIFIED, toolName }), undefined, toolName);
    for (let call = 0; call < 3; call += 1) {
      assert.equal(await runGate({ state, mode: 'enforce', command: UNVERIFIED, toolName }), undefined, toolName);
    }
  }
  assert.equal(fs.existsSync(path.join(state, 'docks')), false);
});

test('a -F file message is read relative to the command directory', async (t) => {
  const state = tempDir('file', t);
  const cwd = tempDir('file-cwd', t);
  fs.writeFileSync(path.join(cwd, 'verified.txt'), 'fix: x\n\nVerified: bun test\n');
  fs.writeFileSync(path.join(cwd, 'plain.txt'), 'fix: x\n\nBody only.\n');
  assert.equal(await runGate({ state, mode: 'enforce', cwd, command: 'git commit -F verified.txt' }), undefined);
  assert.equal(await runGate({ state, mode: 'enforce', cwd, command: 'git commit --file=verified.txt' }), undefined);
  assertDenied(await runGate({ state, mode: 'enforce', cwd, command: 'git commit -aF plain.txt' }));
  const stdinHeredoc = ['git commit -F - <<EOF', 'fix: x', '', 'Verified: bun test', 'EOF'].join('\n');
  assert.equal(await runGate({ state, mode: 'enforce', cwd, command: stdinHeredoc }), undefined);
});

test('input.cwd of the bash call sets the commit base folder below ctx.cwd', async (t) => {
  const state = tempDir('input-cwd', t);
  const cwd = tempDir('input-cwd-session', t);
  const sub = path.join(cwd, 'sub');
  fs.mkdirSync(sub);
  // The same file name holds no trailer in the session folder and a trailer in sub.
  fs.writeFileSync(path.join(cwd, 'message.txt'), 'fix: x\n\nBody only.\n');
  fs.writeFileSync(path.join(sub, 'message.txt'), 'fix: x\n\nVerified: bun test\n');
  const command = 'git commit -F message.txt';
  assertDenied(await runGate({ state, mode: 'enforce', cwd, command }));
  assert.equal(await runGate({ state, mode: 'enforce', cwd, inputCwd: 'sub', command }), undefined);
  assert.equal(await runGate({ state, mode: 'enforce', cwd, inputCwd: sub, command }), undefined);
  // The log names the resolved base folder, not ctx.cwd.
  await runGate({ state, mode: 'observe', cwd, inputCwd: 'sub', command: UNVERIFIED });
  const lines = logLines(state);
  assert.equal(lines.length, 1);
  assert.equal(lines[0].cwd, sub);
});

test('a context without a session id logs the session id unknown', async (t) => {
  const state = tempDir('no-session', t);
  const cwd = tempDir('no-session-cwd', t);
  const contexts = [
    { cwd },
    { cwd, sessionManager: { getSessionId: () => undefined } },
    { cwd, sessionManager: { getSessionId: () => '' } },
  ];
  for (const ctx of contexts) {
    assert.equal(await runGate({ state, mode: 'observe', command: UNVERIFIED, ctx }), undefined);
  }
  const lines = logLines(state);
  assert.deepEqual(
    lines.map((line) => line.session_id),
    ['unknown', 'unknown', 'unknown'],
  );
  assert.equal(lines[0].cwd, cwd);
});

test('one handler reads DOCKS_VERIFY_GATE and XDG_STATE_HOME again on each call', async (t) => {
  const first = tempDir('env-first', t);
  const second = tempDir('env-second', t);
  // omp keeps one handler for the whole session, so each call goes to the same handler.
  const handler = await toolCallHandler();
  const gate = (state, mode) => runGate({ handler, state, mode, command: UNVERIFIED });
  assert.equal(await gate(first, 'off'), undefined);
  assert.equal(fs.existsSync(path.join(first, 'docks')), false);
  assert.equal(await gate(first, 'observe'), undefined);
  assert.equal(logLines(first).length, 1);
  assertDenied(await gate(second, 'enforce'));
  assert.equal(await gate(second, 'off'), undefined);
  assert.equal(await gate(second, 'observe'), undefined);
  assert.equal(await gate(first, undefined), undefined);
  assert.equal(logLines(first).length, 2);
  assert.deepEqual(
    logLines(second).map((line) => line.mode),
    ['observe'],
  );
});

test('an unknown mode works as observe and prints nothing; a known mode is read without case and space', async (t) => {
  const state = tempDir('unknown-mode', t);
  const { result, printed } = await captureOutput(() => runGate({ state, mode: ' Bogus ', command: UNVERIFIED }));
  assert.equal(result, undefined);
  assert.deepEqual(printed, []);
  assert.deepEqual(
    logLines(state).map((line) => line.mode),
    ['observe'],
  );
  assertDenied(await runGate({ state, mode: ' Enforce ', command: UNVERIFIED }));
  assert.equal(await runGate({ state, mode: 'OFF', command: UNVERIFIED }), undefined);
  assert.equal(logLines(state).length, 1);
});

test('--amend without a new message reads the HEAD message', async (t) => {
  const state = tempDir('amend', t);
  const repo = tempDir('amend-repo', t);
  const git = (...args) => execFileSync('git', args, { cwd: repo, encoding: 'utf8' });
  git('init', '-q', '-b', 'main');
  git('config', 'user.email', 'verify-gate@example.test');
  git('config', 'user.name', 'Verify Gate Test');
  git('commit', '-q', '--allow-empty', '-m', 'chore: seed', '-m', 'Verified: none - empty seed commit');
  const amendNoEdit = 'git commit --amend --no-edit';
  assert.equal(await runGate({ state, mode: 'enforce', cwd: repo, command: amendNoEdit }), undefined);
  git('commit', '-q', '--allow-empty', '-m', 'chore: second');
  assertDenied(await runGate({ state, mode: 'enforce', cwd: repo, command: amendNoEdit }));
  assert.equal(
    await runGate({
      state,
      mode: 'enforce',
      cwd: repo,
      command: `git commit --amend -m "chore: second" -m "Verified: git log"`,
    }),
    undefined,
  );
});

// omp blocks the call when a handler throws, so an internal error must allow the command instead.
test('an internal error allows the command and prints nothing', async (t) => {
  const state = tempDir('error', t);
  const cwd = tempDir('error-cwd', t);
  // A -F file that does not exist makes the message read fail.
  const missingFile = await captureOutput(() =>
    runGate({ state, mode: 'enforce', cwd, command: 'git commit -F missing.txt' }),
  );
  assert.equal(missingFile.result, undefined);
  assert.deepEqual(missingFile.printed, []);
  // A state folder below a regular file cannot be made, so the log write fails.
  const blocker = path.join(state, 'not-a-folder');
  fs.writeFileSync(blocker, '');
  for (const mode of ['observe', 'enforce']) {
    const unwritable = await captureOutput(() => runGate({ state: blocker, mode, cwd, command: UNVERIFIED }));
    assert.equal(unwritable.result, undefined, mode);
    assert.deepEqual(unwritable.printed, [], mode);
  }
  assert.equal(logLines(state).length, 0);
});

test('-F /dev/stdin and -F /dev/fd/0 read the heredoc of the command, not the stdin of omp', async (t) => {
  const state = tempDir('dev-stdin', t);
  for (const name of ['/dev/stdin', '/dev/fd/0']) {
    const heredoc = (body) => [`git commit -F ${name} <<'EOF'`, 'fix: x', '', body, 'EOF'].join('\n');
    assert.equal(await runGate({ state, mode: 'enforce', command: heredoc('Verified: bun test') }), undefined, name);
    assertDenied(await runGate({ state, mode: 'enforce', command: heredoc('Body only.'), session: name }));
  }
});

test('a -F path that is not a regular file allows the command at once and prints nothing', async (t) => {
  const state = tempDir('fifo', t);
  const cwd = tempDir('fifo-cwd', t);
  const fifo = path.join(cwd, 'message.fifo');
  execFileSync('mkfifo', [fifo]);
  // A read that waits for a writer of the FIFO would keep the test process alive. A writer that opens and closes
  // the FIFO ends such a read; without a reader the open fails, and nothing waits.
  t.after(() => {
    try {
      fs.closeSync(fs.openSync(fifo, fs.constants.O_WRONLY | fs.constants.O_NONBLOCK));
    } catch {
      // No reader waits on the FIFO.
    }
  });
  for (const command of ['git commit -F message.fifo', 'git commit --file=.']) {
    const started = Date.now();
    const { result, printed } = await captureOutput(() => runGate({ state, mode: 'enforce', cwd, command }));
    assert.equal(result, undefined, command);
    assert.deepEqual(printed, [], command);
    assert.ok(Date.now() - started < 3000, `${command} took ${Date.now() - started} ms`);
  }
  assert.equal(fs.existsSync(path.join(state, 'docks')), false);
});

test('a check that runs past its deadline rejects, stops its git calls, and writes no state', async (t) => {
  const state = tempDir('deadline', t);
  const bin = tempDir('deadline-bin', t);
  const finished = path.join(bin, 'finished.txt');
  // Each git call takes 400 ms, so each call is quick, but three commits take longer than the deadline.
  fs.writeFileSync(
    path.join(bin, 'git'),
    `#!/bin/sh\nsleep 0.4\necho done >> '${finished}'\nexec '${REAL_GIT}' "$@"\n`,
    { mode: 0o755 },
  );
  const { checkCommand } = await import(CORE);
  const command = [VERIFIED, VERIFIED, UNVERIFIED].join(' && ');
  const started = Date.now();
  await withEnv({ PATH: `${bin}${path.delimiter}${process.env.PATH}` }, () =>
    assert.rejects(
      checkCommand({
        command,
        cwd: state,
        sessionId: 's1',
        env: { XDG_STATE_HOME: state, DOCKS_VERIFY_GATE: 'enforce' },
        deadlineMs: 1000,
      }),
      /the check ran longer than 1000 ms/u,
    ),
  );
  assert.ok(Date.now() - started < 1300, `the check rejected after ${Date.now() - started} ms`);
  // The third git call ends after the deadline unless the deadline stops it, and then it would count a denial.
  await new Promise((resolve) => setTimeout(resolve, 800));
  assert.equal(fs.readFileSync(finished, 'utf8'), 'done\ndone\n');
  assert.equal(fs.existsSync(path.join(state, 'docks')), false);
});

test('a check that passes its deadline during a state write writes no denial and no log line', async (t) => {
  const state = tempDir('state-deadline', t);
  const denials = path.join(state, 'docks', 'verify-gate-denials.json');
  fs.mkdirSync(path.dirname(denials), { recursive: true });
  // Two denials of s1 make this commit the allowed third one, which resets the count and appends a log line.
  const before = JSON.stringify({ s1: { count: 2, time: Date.now() } });
  fs.writeFileSync(denials, before);
  // The core writes the new state to this temporary file first. As a FIFO without a reader, it holds the write
  // in its open until the deadline passes.
  const temp = `${denials}.${process.pid}.tmp`;
  execFileSync('mkfifo', [temp]);
  const { checkCommand } = await import(CORE);
  await assert.rejects(
    checkCommand({
      command: 'git commit',
      cwd: state,
      sessionId: 's1',
      env: { XDG_STATE_HOME: state, DOCKS_VERIFY_GATE: 'enforce' },
      deadlineMs: 500,
    }),
    /the check ran longer than 500 ms/u,
  );
  // A reader lets the held write go on now, after the deadline. Read until the writer closes the FIFO.
  const reader = fs.openSync(temp, fs.constants.O_RDONLY | fs.constants.O_NONBLOCK);
  let received = '';
  for (const until = Date.now() + 3000; Date.now() < until; ) {
    const buffer = Buffer.alloc(4096);
    let bytes = 0;
    try {
      bytes = fs.readSync(reader, buffer);
    } catch (error) {
      if (error.code !== 'EAGAIN') throw error;
    }
    if (bytes > 0) received += buffer.toString('utf8', 0, bytes);
    else if (received !== '') break;
    else await new Promise((resolve) => setTimeout(resolve, 20));
  }
  fs.closeSync(reader);
  assert.match(received, /"s1":\{"count":0/u, 'the write of the new state must have gone on after the deadline');
  // Give a rename and a log append time to run, if the check did not stop.
  await new Promise((resolve) => setTimeout(resolve, 300));
  assert.ok(fs.lstatSync(denials).isFile(), 'the denial file must not be replaced');
  assert.equal(fs.readFileSync(denials, 'utf8'), before);
  assert.deepEqual(logLines(state), []);
});

test('a denial file that is not a regular file allows the command in enforce mode at once', async (t) => {
  const state = tempDir('denial-fifo', t);
  const denials = path.join(state, 'docks', 'verify-gate-denials.json');
  fs.mkdirSync(path.dirname(denials), { recursive: true });
  execFileSync('mkfifo', [denials]);
  // A read that waits for a writer of the FIFO would keep the test process alive. A writer that opens and closes
  // the FIFO ends such a read; without a reader the open fails, and nothing waits.
  t.after(() => {
    try {
      fs.closeSync(fs.openSync(denials, fs.constants.O_WRONLY | fs.constants.O_NONBLOCK));
    } catch {
      // No reader waits on the FIFO.
    }
  });
  const started = Date.now();
  const { result, printed } = await captureOutput(() => runGate({ state, mode: 'enforce', command: UNVERIFIED }));
  assert.equal(result, undefined);
  assert.deepEqual(printed, []);
  assert.ok(Date.now() - started < 3000, `the check took ${Date.now() - started} ms`);
  assert.ok(fs.lstatSync(denials).isFIFO(), 'the check must not replace the FIFO');
  assert.deepEqual(logLines(state), []);
});

test('two checks of one session at the same time count two denials', async (t) => {
  const state = tempDir('concurrent', t);
  const handler = await toolCallHandler();
  // `git commit` without a message source starts no git call, so both checks reach the denial state at once.
  const event = { type: 'tool_call', toolName: 'bash', toolCallId: 'call_1', input: { command: 'git commit' } };
  const ctx = sessionContext(state, 's1');
  const results = await withEnv({ XDG_STATE_HOME: state, DOCKS_VERIFY_GATE: 'enforce' }, () =>
    Promise.all([handler(event, ctx), handler(event, ctx)]),
  );
  for (const result of results) assertDenied(result);
  const saved = JSON.parse(fs.readFileSync(path.join(state, 'docks', 'verify-gate-denials.json'), 'utf8'));
  assert.equal(saved.s1.count, 2);
  // After the two denials, the third commit is allowed.
  assert.equal(await runGate({ state, mode: 'enforce', command: 'git commit', handler }), undefined);
});

test('a denial count older than seven days expires, and the denial file drops it', async (t) => {
  const state = tempDir('expiry', t);
  const denials = path.join(state, 'docks', 'verify-gate-denials.json');
  fs.mkdirSync(path.dirname(denials), { recursive: true });
  const day = 24 * 60 * 60 * 1000;
  const now = Date.now();
  fs.writeFileSync(
    denials,
    JSON.stringify({
      s1: { count: 2, time: now - 8 * day },
      old: { count: 1, time: now - 8 * day },
      recent: { count: 1, time: now - 6 * day },
    }),
  );
  // Two denials of s1 would allow this commit, but they expired, so this is the first denial of a new count.
  assertDenied(await runGate({ state, mode: 'enforce', command: UNVERIFIED }));
  const saved = JSON.parse(fs.readFileSync(denials, 'utf8'));
  assert.deepEqual(Object.keys(saved).sort(), ['recent', 's1']);
  assert.equal(saved.s1.count, 1);
  assert.deepEqual(saved.recent, { count: 1, time: now - 6 * day });
  assert.equal(fs.statSync(denials).mode & 0o777, 0o600);
});

test('a denial file that is not valid JSON counts as empty', async (t) => {
  const state = tempDir('corrupt', t);
  const denials = path.join(state, 'docks', 'verify-gate-denials.json');
  fs.mkdirSync(path.dirname(denials), { recursive: true });
  fs.writeFileSync(denials, '{not json');
  assertDenied(await runGate({ state, mode: 'enforce', command: UNVERIFIED }));
  assert.deepEqual(Object.keys(JSON.parse(fs.readFileSync(denials, 'utf8'))), ['s1']);
});

test('the Verified key has any case, and an empty value or an empty none reason does not count', async (t) => {
  const state = tempDir('trailer-rules', t);
  const gate = (trailer, session) =>
    runGate({ state, mode: 'enforce', command: `git commit -m "fix: x" -m "${trailer}"`, session });
  for (const trailer of ['verified: bun test', 'VERIFIED: none - docs only']) {
    assert.equal(await gate(trailer, 's1'), undefined, trailer);
  }
  for (const trailer of ['Verified:', 'Verified:   ', 'Verified: none - ', 'Verified: none -']) {
    assertDenied(await gate(trailer, trailer));
  }
});

test('-C <rev> and --amend read the message of that commit, and the log names their source', async (t) => {
  const state = tempDir('reuse', t);
  const repo = gitRepo('reuse-repo', t);
  for (const command of ['git commit -C HEAD~1', 'git commit --reuse-message=HEAD~1', 'git commit -c HEAD~1']) {
    assert.equal(await runGate({ state, mode: 'enforce', cwd: repo, command }), undefined, command);
  }
  assertDenied(await runGate({ state, mode: 'enforce', cwd: repo, command: 'git commit -C HEAD' }));
  await runGate({ state, mode: 'observe', cwd: repo, command: 'git commit -C HEAD' });
  await runGate({ state, mode: 'observe', cwd: repo, command: 'git commit --amend --no-edit' });
  assert.deepEqual(
    logLines(state).map((line) => line.message_sources),
    [['-C'], ['--amend']],
  );
});

test('the log names the sources of the first commit without the trailer', async (t) => {
  const state = tempDir('first-unverified', t);
  const command = `${VERIFIED} && git commit -m "fix: a" && git commit -F - <<EOF\nfix: b\nEOF`;
  assert.equal(await runGate({ state, mode: 'observe', command }), undefined);
  assert.deepEqual(
    logLines(state).map((line) => line.message_sources),
    [['-m']],
  );
});

test('the shell parser follows cd and git -C, skips an environment prefix, and sees a git path', async (t) => {
  const state = tempDir('parser', t);
  const cwd = tempDir('parser-cwd', t);
  fs.mkdirSync(path.join(cwd, 'sub'));
  // The same file name holds no trailer in the start folder and a trailer in sub.
  fs.writeFileSync(path.join(cwd, 'message.txt'), 'fix: x\n\nBody only.\n');
  fs.writeFileSync(path.join(cwd, 'sub', 'message.txt'), 'fix: x\n\nVerified: bun test\n');
  for (const command of ['cd sub && git commit -F message.txt', 'git -C sub commit -F message.txt']) {
    assert.equal(await runGate({ state, mode: 'enforce', cwd, command }), undefined, command);
  }
  const unverified = [
    'FOO=1 git commit -m "fix: x"',
    '/usr/bin/git commit -m "fix: x"',
    // `-S` takes the rest of the word as its key, so the `F` is no -F option.
    'git commit -SFkey -m "fix: x"',
  ];
  for (const command of unverified) {
    assertDenied(await runGate({ state, mode: 'enforce', cwd, command, session: command }));
  }
});
