import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const HOOK = path.resolve(import.meta.dirname, '../../../plugins/docks/hooks/verify-gate.mjs');
const UNVERIFIED = 'git commit -m "fix: handle empty input"';
const VERIFIED = 'git commit -m "fix: handle empty input" -m "Verified: bun test scripts/tests/unit"';

function tempDir(label, t) {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), `verify-gate-${label}-`)));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

// Run the hook once. `input` is the raw stdin; by default a Bash PreToolUse payload.
function runHook({ state, mode, command, cwd = os.tmpdir(), session = 's1', input }) {
  const env = { ...process.env, XDG_STATE_HOME: state };
  delete env.DOCKS_VERIFY_GATE;
  if (mode !== undefined) env.DOCKS_VERIFY_GATE = mode;
  const stdin =
    input ??
    JSON.stringify({
      session_id: session,
      cwd,
      hook_event_name: 'PreToolUse',
      tool_name: 'Bash',
      tool_input: { command },
    });
  const result = spawnSync('node', [HOOK], { input: stdin, env, encoding: 'utf8' });
  assert.equal(result.status, 0, `hook exit status; stderr: ${result.stderr}`);
  const decision = result.stdout.trim() === '' ? null : JSON.parse(result.stdout);
  return { decision, stderr: result.stderr };
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

function assertDenied(decision) {
  assert.equal(decision?.hookSpecificOutput?.hookEventName, 'PreToolUse');
  assert.equal(decision.hookSpecificOutput.permissionDecision, 'deny');
  assert.match(decision.hookSpecificOutput.permissionDecisionReason, /Verified: <command>/u);
  assert.match(decision.hookSpecificOutput.permissionDecisionReason, /Verified: none - <reason>/u);
}

test('off mode allows a commit without the trailer and writes no log', (t) => {
  const state = tempDir('off', t);
  const { decision } = runHook({ state, mode: 'off', command: UNVERIFIED });
  assert.equal(decision, null);
  assert.equal(fs.existsSync(path.join(state, 'docks')), false);
});

test('observe mode is the default, allows the commit, and appends one log line', (t) => {
  const state = tempDir('observe', t);
  const cwd = tempDir('observe-cwd', t);
  assert.equal(runHook({ state, command: UNVERIFIED, cwd }).decision, null);
  assert.equal(runHook({ state, mode: 'observe', command: VERIFIED, cwd }).decision, null);
  const lines = logLines(state);
  assert.equal(lines.length, 1);
  assert.deepEqual(Object.keys(lines[0]).sort(), ['cwd', 'message_sources', 'mode', 'session_id', 'time']);
  assert.equal(lines[0].mode, 'observe');
  assert.deepEqual(lines[0].message_sources, ['-m']);
  assert.equal(lines[0].session_id, 's1');
  assert.equal(lines[0].cwd, cwd);
  assert.equal(fs.statSync(path.join(state, 'docks')).mode & 0o777, 0o700);
});

test('enforce mode denies twice in a session, then allows and logs the third commit', (t) => {
  const state = tempDir('enforce', t);
  assertDenied(runHook({ state, mode: 'enforce', command: UNVERIFIED }).decision);
  assertDenied(runHook({ state, mode: 'enforce', command: UNVERIFIED }).decision);
  // Another session keeps its own count.
  assertDenied(runHook({ state, mode: 'enforce', command: UNVERIFIED, session: 's2' }).decision);
  assert.equal(logLines(state).length, 0);
  assert.equal(runHook({ state, mode: 'enforce', command: UNVERIFIED }).decision, null);
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
  assertDenied(runHook({ state, mode: 'enforce', command: UNVERIFIED }).decision);
});

test('the log holds no text of the command or the message, so a secret in either stays out', (t) => {
  const state = tempDir('secret', t);
  const token = 'ghp_TESTTOKEN123';
  const commands = [
    `GH_TOKEN=${token} gh auth status && git commit -m "fix: rotate key" -m "Body names ${token}."`,
    `git commit -m "fix: remove token ${token}"`,
    `git commit -F - <<EOF\nfix: remove token ${token}\nEOF`,
  ];
  for (const [index, command] of commands.entries()) {
    assert.equal(runHook({ state, mode: 'observe', command }).decision, null, command);
    for (let call = 0; call < 3; call += 1) runHook({ state, mode: 'enforce', command, session: `secret-${index}` });
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

test('the log names each message source kind', (t) => {
  const state = tempDir('sources', t);
  runHook({ state, command: 'git commit -m "fix: x"' });
  runHook({ state, command: 'git commit' });
  runHook({ state, command: 'git commit -F - --trailer "Reviewed-by=A" <<EOF\nfix: y\nEOF' });
  assert.deepEqual(
    logLines(state).map((line) => line.message_sources),
    [['-m'], ['none'], ['-F', '--trailer']],
  );
});

test('enforce mode allows a commit whose message carries the trailer', (t) => {
  const state = tempDir('trailer', t);
  assert.equal(runHook({ state, mode: 'enforce', command: VERIFIED }).decision, null);
  const heredoc = [
    `git add -A && git commit -m "$(cat <<'EOF'`,
    'fix: handle (unbalanced input',
    '',
    'Verified: none - documentation only',
    'EOF',
    ')"',
  ].join('\n');
  assert.equal(runHook({ state, mode: 'enforce', command: heredoc }).decision, null);
  assert.equal(
    runHook({ state, mode: 'enforce', command: 'git commit -m "fix: x" --trailer "Verified=bun test"' }).decision,
    null,
  );
  // A bare `none` without a reason and a trailer in the subject line do not count.
  assertDenied(runHook({ state, mode: 'enforce', command: 'git commit -m "fix: x" -m "Verified: none"' }).decision);
  assertDenied(runHook({ state, mode: 'enforce', command: 'git commit -m "Verified: bun test"' }).decision);
});

test('a command without a creating git commit is allowed in enforce mode', (t) => {
  const state = tempDir('non-commit', t);
  for (const command of ['ls -la', 'git status && git log -1', 'echo "git commit -m x"', 'git commit --dry-run -m x']) {
    assert.equal(runHook({ state, mode: 'enforce', command }).decision, null, command);
  }
  const other = JSON.stringify({ session_id: 's1', tool_name: 'Write', tool_input: { file_path: '/tmp/x' } });
  assert.equal(runHook({ state, mode: 'enforce', input: other }).decision, null);
  assert.equal(logLines(state).length, 0);
});

test('a -F file message is read relative to the command directory', (t) => {
  const state = tempDir('file', t);
  const cwd = tempDir('file-cwd', t);
  fs.writeFileSync(path.join(cwd, 'verified.txt'), 'fix: x\n\nVerified: bun test\n');
  fs.writeFileSync(path.join(cwd, 'plain.txt'), 'fix: x\n\nBody only.\n');
  assert.equal(runHook({ state, mode: 'enforce', cwd, command: 'git commit -F verified.txt' }).decision, null);
  assert.equal(runHook({ state, mode: 'enforce', cwd, command: 'git commit --file=verified.txt' }).decision, null);
  assertDenied(runHook({ state, mode: 'enforce', cwd, command: 'git commit -aF plain.txt' }).decision);
  const stdinHeredoc = ['git commit -F - <<EOF', 'fix: x', '', 'Verified: bun test', 'EOF'].join('\n');
  assert.equal(runHook({ state, mode: 'enforce', cwd, command: stdinHeredoc }).decision, null);
});

test('--amend without a new message reads the HEAD message', (t) => {
  const state = tempDir('amend', t);
  const repo = tempDir('amend-repo', t);
  const git = (...args) => execFileSync('git', args, { cwd: repo, encoding: 'utf8' });
  git('init', '-q', '-b', 'main');
  git('config', 'user.email', 'verify-gate@example.test');
  git('config', 'user.name', 'Verify Gate Test');
  git('commit', '-q', '--allow-empty', '-m', 'chore: seed', '-m', 'Verified: none - empty seed commit');
  assert.equal(runHook({ state, mode: 'enforce', cwd: repo, command: 'git commit --amend --no-edit' }).decision, null);
  git('commit', '-q', '--allow-empty', '-m', 'chore: second');
  assertDenied(runHook({ state, mode: 'enforce', cwd: repo, command: 'git commit --amend --no-edit' }).decision);
  assert.equal(
    runHook({
      state,
      mode: 'enforce',
      cwd: repo,
      command: `git commit --amend -m "chore: second" -m "Verified: git log"`,
    }).decision,
    null,
  );
});

test('malformed stdin fails open with a stderr note', (t) => {
  const state = tempDir('malformed', t);
  const { decision, stderr } = runHook({ state, mode: 'enforce', input: '{not json' });
  assert.equal(decision, null);
  assert.match(stderr, /verify-gate: internal error/u);
});
