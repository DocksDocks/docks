import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const EXTENSION = path.resolve(import.meta.dirname, '../../../plugins/docks/extensions/verify-gate.ts');
const UNVERIFIED = 'git commit -m "fix: handle empty input"';
const VERIFIED = 'git commit -m "fix: handle empty input" -m "Verified: bun test scripts/tests/unit"';

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

// Drive the tool_call handler once with a bash call. `ctx` replaces the default session context.
async function runGate({
  state,
  mode,
  command,
  cwd = os.tmpdir(),
  inputCwd,
  session = 's1',
  toolName = 'bash',
  ctx = sessionContext(cwd, session),
}) {
  const handler = await toolCallHandler();
  const input = inputCwd === undefined ? { command } : { command, cwd: inputCwd };
  const event = { type: 'tool_call', toolName, toolCallId: 'call_1', input };
  return withEnv({ XDG_STATE_HOME: state, DOCKS_VERIFY_GATE: mode }, () => handler(event, ctx));
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

function assertDenied(result) {
  assert.equal(result?.block, true, `expected a block, got ${JSON.stringify(result)}`);
  assert.match(result.reason, /no Verified: trailer/u);
  assert.match(result.reason, /Verified: <command>/u);
  assert.match(result.reason, /Verified: none - <reason>/u);
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
  assert.equal(fs.statSync(path.join(state, 'docks')).mode & 0o777, 0o700);
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

test('a context without a session manager logs the session id unknown', async (t) => {
  const state = tempDir('no-session', t);
  const cwd = tempDir('no-session-cwd', t);
  assert.equal(await runGate({ state, mode: 'observe', command: UNVERIFIED, ctx: { cwd } }), undefined);
  const lines = logLines(state);
  assert.equal(lines.length, 1);
  assert.equal(lines[0].session_id, 'unknown');
  assert.equal(lines[0].cwd, cwd);
});

test('the gate reads DOCKS_VERIFY_GATE and XDG_STATE_HOME again on each call', async (t) => {
  const first = tempDir('env-first', t);
  const second = tempDir('env-second', t);
  assert.equal(await runGate({ state: first, mode: 'off', command: UNVERIFIED }), undefined);
  assert.equal(fs.existsSync(path.join(first, 'docks')), false);
  assert.equal(await runGate({ state: first, mode: 'observe', command: UNVERIFIED }), undefined);
  assert.equal(logLines(first).length, 1);
  assertDenied(await runGate({ state: second, mode: 'enforce', command: UNVERIFIED }));
  assert.equal(await runGate({ state: second, mode: 'off', command: UNVERIFIED }), undefined);
  await runGate({ state: second, mode: 'observe', command: UNVERIFIED });
  assert.equal(logLines(first).length, 1);
  assert.deepEqual(logLines(second).map((line) => line.mode), ['observe']);
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
