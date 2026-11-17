#!/usr/bin/env node
// PreToolUse hook (Claude Code + Codex): check that each `git commit` that the
// agent runs carries a `Verified:` git trailer, the record of how the commit was
// verified. Format: `Verified: <command>[; <command>]` or `Verified: none - <reason>`.
//
// Mode comes from DOCKS_VERIFY_GATE:
//   off      allow every commit and write nothing.
//   observe  (default) allow every commit; append one JSON line for each commit
//            without the trailer to ${XDG_STATE_HOME:-~/.local/state}/docks/verify-gate.jsonl.
//   enforce  deny a commit without the trailer. After two denials in one session,
//            allow the next commit, log it, and start the count again.
//
// The hook reads the PreToolUse JSON from stdin. Claude Code filters with
// `if: "Bash(git commit*)"`; Codex ignores `if` and runs the hook for every Bash
// call, so the hook finds the commit itself. An allow exits 0 with no output; a
// deny prints the hookSpecificOutput shape that both runtimes accept. Any internal
// error allows the command and writes a note to stderr: a hook must never break
// the session.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const MODES = new Set(['off', 'observe', 'enforce']);
const DENIALS_BEFORE_ALLOW = 2;
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const TRAILER_FORMAT = '`Verified: <command>[; <command>]` or `Verified: none - <reason>`';

// ---------- shell tokenizer ----------

// Split a shell command into simple commands. Each command is { words, stdin }.
// Words keep quotes removed; `$(...)` stays as raw text. `stdin` holds
// the body of a heredoc or a here-string on that command, when one exists.
function parseShell(src) {
  const commands = [];
  let words = [];
  let word = null;
  let stdin = null;
  const pendingHeredocs = [];
  let i = 0;

  const pushWord = () => {
    if (word !== null) words.push(word);
    word = null;
  };
  const endCommand = () => {
    pushWord();
    if (words.length > 0) commands.push({ words, stdin });
    words = [];
    stdin = null;
  };
  const readHeredocBodies = () => {
    // i points just after a newline.
    for (const doc of pendingHeredocs.splice(0)) {
      const lines = [];
      while (i < src.length) {
        const end = src.indexOf('\n', i);
        const rawLine = end === -1 ? src.slice(i) : src.slice(i, end);
        i = end === -1 ? src.length : end + 1;
        const line = doc.stripTabs ? rawLine.replace(/^\t+/u, '') : rawLine;
        if (line === doc.delimiter) break;
        lines.push(line);
      }
      doc.target.stdin = lines.length > 0 ? `${lines.join('\n')}\n` : '';
    }
  };

  while (i < src.length) {
    const c = src[i];
    if (c === '\n') {
      endCommand();
      i += 1;
      if (pendingHeredocs.length > 0) readHeredocBodies();
      continue;
    }
    if (c === ' ' || c === '\t') {
      pushWord();
      i += 1;
      continue;
    }
    if (c === '#' && word === null) {
      while (i < src.length && src[i] !== '\n') i += 1;
      continue;
    }
    if (c === ';' || c === '&' || c === '|' || c === '(' || c === ')') {
      endCommand();
      i += 1;
      continue;
    }
    if (c === '<' && src.startsWith('<<<', i)) {
      pushWord();
      i += 3;
      while (src[i] === ' ' || src[i] === '\t') i += 1;
      const { value, next } = readWord(src, i);
      i = next;
      stdin = `${value}\n`;
      continue;
    }
    if (c === '<' && src[i + 1] === '<') {
      pushWord();
      i += 2;
      const stripTabs = src[i] === '-';
      if (stripTabs) i += 1;
      while (src[i] === ' ' || src[i] === '\t') i += 1;
      const { value, next } = readWord(src, i);
      i = next;
      // The heredoc belongs to the command that is open now; endCommand copies `stdin`.
      const target = { stdin: '' };
      pendingHeredocs.push({ delimiter: value, stripTabs, target });
      stdin = target;
      continue;
    }
    if (c === '>' || c === '<') {
      // Other redirections: drop the operator and its target word.
      pushWord();
      i += 1;
      while (src[i] === '>' || src[i] === '&') i += 1;
      while (src[i] === ' ' || src[i] === '\t') i += 1;
      i = readWord(src, i).next;
      continue;
    }
    const { value, next } = readWord(src, i);
    word = (word ?? '') + value;
    i = next;
  }
  endCommand();
  // Resolve heredoc targets to their text.
  for (const command of commands) {
    if (command.stdin && typeof command.stdin === 'object') command.stdin = command.stdin.stdin;
  }
  return commands;
}

// Read one word starting at i. Stops at an unquoted space, operator, or newline.
function readWord(src, start) {
  let i = start;
  let value = '';
  while (i < src.length) {
    const c = src[i];
    if (' \t\n;&|()<>'.includes(c)) break;
    if (c === '\\') {
      if (src[i + 1] === '\n') {
        i += 2;
        continue;
      }
      value += src[i + 1] ?? '';
      i += 2;
      continue;
    }
    if (c === "'") {
      const end = src.indexOf("'", i + 1);
      const stop = end === -1 ? src.length : end;
      value += src.slice(i + 1, stop);
      i = stop + 1;
      continue;
    }
    if (c === '"') {
      i += 1;
      while (i < src.length && src[i] !== '"') {
        if (src[i] === '\\' && '$`"\\\n'.includes(src[i + 1])) {
          if (src[i + 1] !== '\n') value += src[i + 1];
          i += 2;
          continue;
        }
        if (src[i] === '$' && src[i + 1] === '(') {
          const end = substitutionEnd(src, i + 2);
          value += src.slice(i, end);
          i = end;
          continue;
        }
        value += src[i];
        i += 1;
      }
      i += 1;
      continue;
    }
    if (c === '$' && src[i + 1] === '(') {
      const end = substitutionEnd(src, i + 2);
      value += src.slice(i, end);
      i = end;
      continue;
    }
    value += c;
    i += 1;
  }
  return { value, next: i };
}

// Return the index just after the `)` that closes a `$(` whose body starts at i.
// Skips quoted text and heredoc bodies, because a commit message in a heredoc can
// hold unbalanced parentheses.
function substitutionEnd(src, start) {
  let depth = 1;
  let i = start;
  const heredocs = [];
  while (i < src.length) {
    const c = src[i];
    if (c === '\\') {
      i += 2;
      continue;
    }
    if (c === "'") {
      const end = src.indexOf("'", i + 1);
      i = end === -1 ? src.length : end + 1;
      continue;
    }
    if (c === '"') {
      i += 1;
      while (i < src.length && src[i] !== '"') i += src[i] === '\\' ? 2 : 1;
      i += 1;
      continue;
    }
    if (c === '<' && src[i + 1] === '<' && src[i + 2] !== '<') {
      i += 2;
      const stripTabs = src[i] === '-';
      if (stripTabs) i += 1;
      while (src[i] === ' ' || src[i] === '\t') i += 1;
      const { value, next } = readWord(src, i);
      heredocs.push({ delimiter: value, stripTabs });
      i = next;
      continue;
    }
    if (c === '\n' && heredocs.length > 0) {
      i += 1;
      for (const doc of heredocs.splice(0)) {
        while (i < src.length) {
          const end = src.indexOf('\n', i);
          const rawLine = end === -1 ? src.slice(i) : src.slice(i, end);
          i = end === -1 ? src.length : end + 1;
          const line = doc.stripTabs ? rawLine.replace(/^\t+/u, '') : rawLine;
          if (line.trim() === doc.delimiter) break;
        }
      }
      continue;
    }
    if (c === '(') depth += 1;
    if (c === ')') {
      depth -= 1;
      if (depth === 0) return i + 1;
    }
    i += 1;
  }
  return src.length;
}

// Turn `$(cat <<'EOF' ... EOF)` into its heredoc body. Other text stays as it is.
function expandCatHeredocs(text) {
  return text.replace(
    /\$\(\s*cat\s*<<-?\s*(['"]?)([A-Za-z_][\w-]*)\1[^\n]*\n([\s\S]*?)\n[ \t]*\2[ \t]*\n?\s*\)/gu,
    (_match, _quote, _delimiter, body) => body,
  );
}

// ---------- git commit detection ----------

const GIT_GLOBAL_WITH_VALUE = new Set([
  '-C',
  '-c',
  '--git-dir',
  '--work-tree',
  '--namespace',
  '--exec-path',
  '--config-env',
]);
const COMMIT_SHORT_WITH_VALUE = new Set(['m', 'F', 'c', 'C', 't']);
const COMMIT_SHORT_ATTACHED = new Set(['S', 'u']);
const COMMIT_LONG_WITH_VALUE = new Set([
  '--message',
  '--file',
  '--reuse-message',
  '--reedit-message',
  '--template',
  '--author',
  '--date',
  '--cleanup',
  '--fixup',
  '--squash',
  '--trailer',
  '--pathspec-from-file',
]);

// Find each `git commit` in the command. Returns [{ cwd, args, stdin }].
function findCommits(command, baseCwd) {
  const found = [];
  let cwd = baseCwd;
  for (const { words, stdin } of parseShell(command)) {
    let k = 0;
    while (k < words.length && /^[A-Za-z_][A-Za-z0-9_]*=/u.test(words[k])) k += 1;
    const head = words[k];
    if (head === 'cd' && words[k + 1]) {
      cwd = path.resolve(cwd, words[k + 1]);
      continue;
    }
    if (head !== 'git' && !(head ?? '').endsWith('/git')) continue;
    let gitCwd = cwd;
    let j = k + 1;
    while (j < words.length && words[j].startsWith('-')) {
      const option = words[j];
      if (option === '-C') gitCwd = path.resolve(gitCwd, words[j + 1] ?? '.');
      j += GIT_GLOBAL_WITH_VALUE.has(option) ? 2 : 1;
    }
    if (words[j] !== 'commit') continue;
    found.push({ cwd: gitCwd, args: words.slice(j + 1), stdin });
  }
  return found;
}

// Read the options of one `git commit` call.
function parseCommitArgs(args) {
  const options = { messages: [], files: [], trailers: [], reuse: null, amend: false, dryRun: false };
  const take = (name, value) => {
    if (name === 'm' || name === '--message') options.messages.push(value);
    else if (name === 'F' || name === '--file') options.files.push(value);
    else if (name === '--trailer') options.trailers.push(value.replace(/^([^:=]+)=/u, '$1: '));
    else if (name === 'C' || name === 'c' || name === '--reuse-message' || name === '--reedit-message')
      options.reuse = value;
  };
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--') break;
    if (arg === '--amend') options.amend = true;
    else if (arg === '--dry-run') options.dryRun = true;
    else if (arg.startsWith('--')) {
      const eq = arg.indexOf('=');
      if (eq !== -1) take(arg.slice(0, eq), arg.slice(eq + 1));
      else if (COMMIT_LONG_WITH_VALUE.has(arg)) {
        take(arg, args[i + 1] ?? '');
        i += 1;
      }
    } else if (arg.startsWith('-') && arg.length > 1) {
      // A cluster such as `-am msg` or `-mmsg`.
      for (let p = 1; p < arg.length; p += 1) {
        const flag = arg[p];
        // `-S<keyid>` and `-u<mode>` take only an attached value: the rest is not flags.
        if (COMMIT_SHORT_ATTACHED.has(flag)) break;
        if (!COMMIT_SHORT_WITH_VALUE.has(flag)) continue;
        if (p + 1 < arg.length) take(flag, arg.slice(p + 1));
        else {
          take(flag, args[i + 1] ?? '');
          i += 1;
        }
        break;
      }
    }
  }
  return options;
}

function git(cwd, args, input) {
  const result = spawnSync('git', args, { cwd, input, encoding: 'utf8', timeout: 5000 });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${result.stderr.trim()}`);
  return result.stdout;
}

// Build the message that the commit records. Returns null when it has no source,
// which means git would open an editor.
function commitMessage(commit, options) {
  const parts = options.messages.map(expandCatHeredocs);
  for (const file of options.files) {
    if (file === '-') parts.push(commit.stdin ?? '');
    else parts.push(fs.readFileSync(path.resolve(commit.cwd, file), 'utf8'));
  }
  let base = null;
  if (parts.length > 0) base = parts.join('\n\n');
  else if (options.reuse) base = git(commit.cwd, ['log', '-1', '--format=%B', options.reuse, '--']);
  else if (options.amend) base = git(commit.cwd, ['log', '-1', '--format=%B']);
  if (options.trailers.length === 0) return base;
  return `${base ?? ''}\n\n${options.trailers.join('\n')}\n`;
}

// True when the message ends with a valid `Verified:` git trailer.
function hasVerifiedTrailer(message, cwd) {
  const trailers = git(cwd, ['interpret-trailers', '--parse'], message);
  return trailers.split('\n').some((line) => {
    const match = /^Verified:\s*(.*)$/iu.exec(line);
    if (!match) return false;
    const value = match[1].trim();
    if (value === '') return false;
    return /^none\b/iu.exec(value) ? /^none - \S/iu.exec(value) !== null : true;
  });
}

// ---------- state ----------

function stateDir() {
  const base = process.env.XDG_STATE_HOME || path.join(os.homedir(), '.local', 'state');
  const dir = path.join(base, 'docks');
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  return dir;
}

function appendLog(entry) {
  fs.appendFileSync(path.join(stateDir(), 'verify-gate.jsonl'), `${JSON.stringify(entry)}\n`, { mode: 0o600 });
}

// Record one denial for the session and return the count of earlier denials.
// After DENIALS_BEFORE_ALLOW denials the count starts again at zero.
function countDenial(sessionId) {
  const file = path.join(stateDir(), 'verify-gate-denials.json');
  let state = {};
  try {
    state = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    state = {};
  }
  const now = Date.now();
  for (const [id, entry] of Object.entries(state)) {
    if (!entry || now - entry.time > SESSION_TTL_MS) delete state[id];
  }
  const previous = state[sessionId]?.count ?? 0;
  state[sessionId] = previous >= DENIALS_BEFORE_ALLOW ? { count: 0, time: now } : { count: previous + 1, time: now };
  const temp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(state), { mode: 0o600 });
  fs.renameSync(temp, file);
  return previous;
}

// ---------- main ----------

function deny(reason) {
  process.stdout.write(
    `${JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: reason,
      },
    })}\n`,
  );
}

function run() {
  const rawMode = (process.env.DOCKS_VERIFY_GATE || 'observe').trim().toLowerCase();
  if (rawMode === 'off') return;
  if (!MODES.has(rawMode)) process.stderr.write(`verify-gate: unknown DOCKS_VERIFY_GATE "${rawMode}"; using observe\n`);
  const mode = MODES.has(rawMode) ? rawMode : 'observe';

  const payload = JSON.parse(fs.readFileSync(0, 'utf8'));
  if (payload.tool_name !== undefined && payload.tool_name !== 'Bash') return;
  const command = payload.tool_input?.command;
  if (typeof command !== 'string') return;
  const baseCwd = typeof payload.cwd === 'string' && payload.cwd ? payload.cwd : process.cwd();

  const unverified = findCommits(command, baseCwd).some((commit) => {
    const options = parseCommitArgs(commit.args);
    if (options.dryRun) return false;
    const message = commitMessage(commit, options);
    return message === null || !hasVerifiedTrailer(message, commit.cwd);
  });
  if (!unverified) return;

  const sessionId = typeof payload.session_id === 'string' && payload.session_id ? payload.session_id : 'unknown';
  const entry = { time: new Date().toISOString(), session_id: sessionId, cwd: baseCwd, command };
  if (mode === 'observe') {
    appendLog(entry);
    return;
  }
  const previous = countDenial(sessionId);
  if (previous >= DENIALS_BEFORE_ALLOW) {
    appendLog({ ...entry, mode: 'enforce', allowed_after_denials: previous });
    return;
  }
  deny(
    `verify-gate: the commit message has no Verified: trailer. ` +
      `Add a last paragraph with ${TRAILER_FORMAT}. ` +
      `Name the checks that you ran, or say why none ran.`,
  );
}

try {
  run();
} catch (error) {
  process.stderr.write(`verify-gate: internal error, allowing the command: ${error?.message ?? error}\n`);
}
process.exitCode = 0;
