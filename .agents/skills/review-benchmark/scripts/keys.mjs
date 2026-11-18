#!/usr/bin/env node
// Encrypted off-machine copies of the held-out keys folder (see Cases, Key backup). A backup needs only the public key;
// a restore needs an export of the secret key. No plaintext ever goes into the vault checkout.
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { frozenJson } from './escapes.mjs';

// The case folders of this skill.
const SKILL_CASES = fileURLToPath(new URL('../cases/', import.meta.url));
const MAX_OUTPUT = 1024 * 1024 * 1024;
const MANIFEST = 'MANIFEST.sha256';
const MANIFEST_LINE = /^([0-9a-f]{64}) {2}(.+)$/;
const FINGERPRINT_LINE = /^Fingerprint:\s*([0-9A-Fa-f][0-9A-Fa-f ]*)$/gm;
// GNU tar options that make the same folder give the same bytes: name order, no times, no owners, no pax times, and
// each hard link as a regular file member with its own bytes.
const REPRODUCIBLE_TAR = [
  '--format=posix',
  '--sort=name',
  '--mtime=@0',
  '--owner=0',
  '--group=0',
  '--numeric-owner',
  '--hard-dereference',
  '--pax-option=exthdr.name=%d/PaxHeaders/%f,delete=atime,delete=ctime',
];
// The type characters of a `tar -tv` line that restore accepts: a regular file and a folder.
const RESTORE_TYPES = new Set(['-', 'd']);
// The command that GNU tar runs for each regular file member, with the bytes of the member on its stdin. It writes the
// name and the size of the member, each with a NUL byte after it, and then the bytes of the member.
const MEMBER_COMMAND = 'printf "%s\\0%s\\0" "$TAR_FILENAME" "$TAR_SIZE" && exec cat';
// The two hashes of the frozen part of `cases/escape-draw.md`, and the keys-folder file of each.
const CHECKS = [
  {
    field: 'Source snapshot SHA-256',
    file: 'escape-draw-source.json',
    hash: (bytes) => sha256(bytes),
  },
  {
    field: 'Restricted frozen record SHA-256',
    file: 'escape-draw.json',
    hash: (bytes) => sha256(frozenJson(JSON.parse(bytes.toString('utf8')).frozen)),
  },
];
const USAGE = [
  'usage: keys.mjs <backup|restore|check> [options]',
  '  backup --keys <dir> --out <vault checkout>',
  '      Encrypts the keys folder to the public key in $XDG_STATE_HOME/docks/review-bench/backup-recipient.asc',
  '      (default ~/.local/state) and writes <out>/keys-<UTC time>.tar.gpg. The key must have the fingerprint',
  '      of the "Fingerprint: <hex>" line of <out>/README.md, and <out> must be the root folder of a git checkout.',
  '  restore --archive <file> --key <secret-key export> --out <new dir>',
  '      Imports the key into a new private GnuPG home (never GNUPGHOME), decrypts there into a new mode-0700',
  '      folder outside every git checkout, and verifies every file against the manifest of the archive. For a',
  '      passphrase-protected key, gpg asks for the passphrase in the terminal; when the stdin is no terminal, such a',
  '      key stops the restore with the gpg error. The private home goes at the end.',
  '  check --keys <dir> [--cases <cases dir>]',
  '      Compares the source snapshot and the frozen record of the folder with cases/escape-draw.md.',
].join('\n');

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

function fail(message) {
  throw new Error(message);
}

// Runs a command to completion and gives its stdout as bytes; a start error or a non-zero exit stops.
function run(command, args, { input, env = process.env, cwd } = {}) {
  const result = spawnSync(command, args, { input, env, cwd, maxBuffer: MAX_OUTPUT });
  if (result.error) fail(`${command} failed: ${result.error.message}`);
  const text = result.stderr.toString('utf8').trim();
  if (result.status !== 0)
    fail(text ? `${command} failed: ${text}` : `${command} failed with exit code ${result.status}`);
  return result.stdout;
}

// Tells whether `child` is `parent` or a path below it.
function isInside(child, parent) {
  const relative = path.relative(parent, child);
  return relative === '' || !(relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative));
}

// The D4 public-key file of the state folder.
export function recipientFile(env = process.env) {
  const state = path.isAbsolute(env.XDG_STATE_HOME ?? '')
    ? env.XDG_STATE_HOME
    : path.join(env.HOME || os.homedir(), '.local', 'state');
  return path.join(state, 'docks', 'review-bench', 'backup-recipient.asc');
}

// The primary fingerprint of the one public key in `file`.
export function fingerprintOf(file, env = process.env) {
  const lines = run('gpg', ['--no-options', '--with-colons', '--show-keys', file], { env })
    .toString('utf8')
    .split('\n');
  const primaries = lines.flatMap((line, index) =>
    line.startsWith('pub:') && lines[index + 1]?.startsWith('fpr:') ? [lines[index + 1].split(':')[9]] : [],
  );
  if (primaries.length !== 1) fail(`the recipient file ${file} must hold exactly one public key`);
  return primaries[0].toUpperCase();
}

// The fingerprint that the vault README names.
function vaultFingerprint(out) {
  const readme = path.join(out, 'README.md');
  if (!fs.existsSync(readme)) fail(`${out} is no vault: it has no README.md`);
  const found = [...fs.readFileSync(readme, 'utf8').matchAll(FINGERPRINT_LINE)].map((match) =>
    match[1].replaceAll(' ', '').toUpperCase(),
  );
  if (found.length !== 1) fail(`the README.md of ${out} must have exactly one "Fingerprint: <hex>" line`);
  return found[0];
}

// The regular files of `root` as sorted relative paths; a link or another special file stops.
function filesOf(root) {
  const files = [];
  const walk = (relative) => {
    for (const entry of fs.readdirSync(path.join(root, relative), { withFileTypes: true })) {
      const name = relative ? `${relative}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(name);
      else if (entry.isFile()) files.push(name);
      else fail(`${name} is neither a file nor a folder`);
    }
  };
  walk('');
  return files.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

// `MANIFEST.sha256` of a keys folder: the SHA-256 and the relative path of every file, in path order.
export function manifestOf(keys) {
  return filesOf(keys)
    .map((name) => {
      if (name.includes('\n')) fail(`the file name ${JSON.stringify(name)} has a line break`);
      return `${sha256(fs.readFileSync(path.join(keys, name)))}  ${name}\n`;
    })
    .join('');
}

// The SHA-256 of each path of the manifest text `text`. An error names the line number only, never the text of the
// line.
function parseManifest(text) {
  const expected = new Map();
  text.split('\n').forEach((line, index) => {
    if (!line) return;
    const match = line.match(MANIFEST_LINE);
    if (!match) fail(`${MANIFEST} has a bad line ${index + 1}`);
    expected.set(match[2], match[1]);
  });
  return expected;
}

// The differences between the manifest `expected` and the files `found`, where `hashOf(name)` gives the SHA-256 of a
// found file: one `missing file`, `extra file`, or `changed file` entry for each file that differs.
function mismatches(expected, found, hashOf) {
  return [
    ...[...expected.keys()].filter((name) => !found.includes(name)).map((name) => `missing file ${name}`),
    ...found.filter((name) => !expected.has(name)).map((name) => `extra file ${name}`),
    ...found
      .filter((name) => expected.has(name) && expected.get(name) !== hashOf(name))
      .map((name) => `changed file ${name}`),
  ];
}

// The reproducible tar of `keys` with `manifest` as its first member. The manifest goes through a private temporary
// folder, so the keys folder itself stays unchanged.
export function tarBytes(keys, manifest) {
  const names = fs.readdirSync(keys).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  if (names.includes(MANIFEST)) fail(`the keys folder must not hold a file named ${MANIFEST}`);
  const staging = fs.mkdtempSync(path.join(os.tmpdir(), 'keys-manifest-'));
  try {
    const file = path.join(staging, MANIFEST);
    fs.writeFileSync(file, manifest, { mode: 0o600 });
    fs.chmodSync(file, 0o600);
    const members = ['-C', staging, MANIFEST, '-C', keys, ...names.map((name) => `--add-file=${name}`)];
    return run('tar', ['-c', '-f', '-', ...REPRODUCIBLE_TAR, ...members], { env: { ...process.env, LC_ALL: 'C' } });
  } finally {
    fs.rmSync(staging, { recursive: true, force: true });
  }
}

// The name and the bytes of each regular file member of the tar `bytes`, in tar order, from one tar run.
function membersOf(bytes) {
  const output = run('tar', ['-x', '-f', '-', `--to-command=${MEMBER_COMMAND}`], {
    input: bytes,
    env: { ...process.env, LC_ALL: 'C' },
  });
  const members = [];
  let at = 0;
  const field = () => {
    const end = output.indexOf(0, at);
    if (end < 0) fail('tar gave a member field without a NUL byte');
    const value = output.subarray(at, end).toString('utf8');
    at = end + 1;
    return value;
  };
  while (at < output.length) {
    const name = field();
    const size = field();
    if (!/^\d+$/.test(size) || at + Number(size) > output.length) fail(`tar gave a bad size for the member ${name}`);
    members.push({ name, bytes: output.subarray(at, at + Number(size)) });
    at += Number(size);
  }
  return members;
}

// Checks the members of the tar `bytes` against `manifest`: the manifest member must equal `manifest`, and the bytes of
// each other file member, read from the tar itself, must have the SHA-256 of the manifest. So a file that changes
// between the manifest and the tar stops the backup.
function verifyTar(bytes, manifest) {
  const members = membersOf(bytes);
  const hashes = new Map(members.map((member) => [member.name, sha256(member.bytes)]));
  const problems = mismatches(
    parseManifest(manifest),
    members.map((member) => member.name).filter((name) => name !== MANIFEST),
    (name) => hashes.get(name),
  );
  const own = members.find((member) => member.name === MANIFEST);
  if (!own?.bytes.equals(Buffer.from(manifest))) problems.unshift(`changed file ${MANIFEST}`);
  if (problems.length) fail(`the tar does not match ${MANIFEST}: ${problems.join('; ')}`);
}

// The verified tar of a keys folder with its own manifest. `beforeTar`, a test seam, runs between the manifest and the
// tar.
export function archiveBytes(keys, { beforeTar } = {}) {
  const manifest = manifestOf(keys);
  beforeTar?.();
  const bytes = tarBytes(keys, manifest);
  verifyTar(bytes, manifest);
  return bytes;
}

// Encrypts `bytes` to the one key of `keyFile` into `output`. No options file, no default key, and no `encrypt-to`
// can add a recipient.
export function encrypt(bytes, keyFile, output, env = process.env) {
  if (fs.existsSync(output)) fail(`${output} exists`);
  try {
    run(
      'gpg',
      [
        '--no-options',
        '--no-encrypt-to',
        '--batch',
        '--yes',
        '--trust-model',
        'always',
        '--recipient-file',
        keyFile,
        '--encrypt',
        '--output',
        output,
      ],
      { input: bytes, env },
    );
  } catch (error) {
    fs.rmSync(output, { force: true });
    throw error;
  }
}

// `keys-<UTC yyyymmddThhmmssZ>.tar.gpg`.
function archiveName(now) {
  return `keys-${now
    .toISOString()
    .replace(/\.\d+Z$/, 'Z')
    .replaceAll('-', '')
    .replaceAll(':', '')}.tar.gpg`;
}

// Writes one encrypted copy of `keys` into the vault checkout `out` and gives its path. `out` must be the root folder
// of a git checkout. `beforeTar` is the test seam of `archiveBytes`.
export function backup({ keys, out, env = process.env, now = new Date(), beforeTar }) {
  if (!keys || !out) fail('backup needs --keys <dir> --out <vault checkout>');
  const keysDir = fs.realpathSync(keys);
  const vault = fs.realpathSync(out);
  if (!fs.statSync(keysDir).isDirectory()) fail(`${keys} is no folder`);
  if (!fs.statSync(vault).isDirectory()) fail(`${out} is no folder`);
  if (isInside(vault, keysDir) || isInside(keysDir, vault))
    fail('the vault and the keys folder must not hold each other');
  const top = revParse(vault, ['--show-toplevel'], env);
  if (!top) fail(`${out} is no git checkout; --out must be the root folder of the vault clone`);
  if (fs.realpathSync(top[0]) !== vault)
    fail(`${out} is inside the git checkout ${top[0]}; --out must be the root folder of the vault clone`);
  const key = recipientFile(env);
  if (!fs.existsSync(key)) fail(`the recipient key file ${key} is missing`);
  const expected = vaultFingerprint(vault);
  const actual = fingerprintOf(key, env);
  if (actual !== expected)
    fail(`the recipient key ${actual} differs from the fingerprint ${expected} of the vault README.md`);
  const output = path.join(vault, archiveName(now));
  encrypt(archiveBytes(keysDir, { beforeTar }), key, output, env);
  return output;
}

// Stops unless each member of the tar `bytes` is a regular file or a folder, so no link and no special file of a
// changed archive gets to the disk. GNU tar lists the members two times in the same order: `-t` gives the name of each
// member, and the first character of each `-tv` line gives its type.
function checkMemberTypes(bytes) {
  const list = (args) =>
    run('tar', [...args, '--quoting-style=escape', '-f', '-'], { input: bytes, env: { ...process.env, LC_ALL: 'C' } })
      .toString('utf8')
      .split('\n')
      .filter(Boolean);
  const names = list(['-t']);
  const types = list(['-t', '-v']).map((line) => line[0]);
  if (names.length !== types.length) fail('tar gave a different number of members for the names and the types');
  const refused = names.filter((_, index) => !RESTORE_TYPES.has(types[index]));
  if (refused.length) fail(`the archive has a member that is neither a file nor a folder: ${refused.join('; ')}`);
}

// Checks a restored folder against its `MANIFEST.sha256` and removes the manifest, so the folder equals the keys
// folder. The manifest must be a regular file, so a link never makes the restore read a file outside the folder.
function verifyRestore(dir) {
  const manifestFile = path.join(dir, MANIFEST);
  const stat = fs.lstatSync(manifestFile, { throwIfNoEntry: false });
  if (!stat) fail(`the archive has no ${MANIFEST}`);
  if (!stat.isFile()) fail(`the ${MANIFEST} of the archive is not a regular file`);
  const problems = mismatches(
    parseManifest(fs.readFileSync(manifestFile, 'utf8')),
    filesOf(dir).filter((name) => name !== MANIFEST),
    (name) => sha256(fs.readFileSync(path.join(dir, name))),
  );
  if (problems.length) fail(`the restore does not match ${MANIFEST}: ${problems.join('; ')}`);
  fs.rmSync(manifestFile);
}

// The output lines of `git rev-parse <args>` in `dir`, an existing folder, or undefined when `dir` is in no git
// repository. Every other git failure, for example a repository of another owner, stops with the folder and the git
// error, so a caller never takes a failed check for "no checkout".
function revParse(dir, args, env) {
  const gitEnv = { ...env, LC_ALL: 'C' };
  for (const name of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_CEILING_DIRECTORIES', 'LANGUAGE']) delete gitEnv[name];
  const result = spawnSync('git', ['rev-parse', ...args], { cwd: dir, env: gitEnv, encoding: 'utf8' });
  if (result.error) fail(`git failed in ${dir}: ${result.error.message}`);
  if (result.status === 0) return result.stdout.split('\n').filter(Boolean);
  const error = result.stderr.trim();
  if (/^fatal: not a git repository\b/m.test(error)) return undefined;
  fail(`git cannot check the folder ${dir}: ${error}`);
}

// Tells whether `dir`, an existing folder, is inside a git work tree or git folder.
function insideGit(dir, env) {
  return (revParse(dir, ['--is-inside-work-tree', '--is-inside-git-dir'], env) ?? []).includes('true');
}

// The line that a failed decrypt gets with libgcrypt 1.12.0. Its bug T8094 makes the agent fail at random, by memory
// layout (for example the length of the home path or the size of the environment), when it first uses an imported
// ECC key, such as the cv25519 subkey of a default GnuPG key. Plan #162 saw it with GnuPG 2.4.8; an RSA key did not
// fail. When the stderr of gpg is the terminal, gpg writes its error there, so the exit code alone also gets the line.
const T8094_NOTE =
  'libgcrypt 1.12.0 has the bug T8094 (https://dev.gnupg.org/T8094), which can give "Bad secret key" or "Bad ' +
  'passphrase" for an ECC key; libgcrypt 1.12.1 or later fixes it. A new run uses a new GnuPG home and can pass, ' +
  'most of all with another TMPDIR, which gives the home path another length.';

// The signals that stop a restore while its private GnuPG home exists. The exit code for each is 128 plus the number
// of the signal, as in a shell: 129 for SIGHUP, 130 for SIGINT, and 143 for SIGTERM.
const STOP_SIGNALS = ['SIGHUP', 'SIGINT', 'SIGTERM'];

// Runs a command as a child process and gives its stdout as bytes, as `run` does, but without a block of the event
// loop, so a signal handler can stop the child. `track` gets the child when it starts. `stdio` sets the stdin and the
// stderr of the child; `input` goes to a piped stdin. A start error, a non-zero exit, or a signal stops.
function runChild(command, args, { input, env, stdio = ['pipe', 'pipe', 'pipe'] }, track) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { env, stdio });
    track(child);
    const stdout = [];
    const stderr = [];
    let settled = false;
    const settle = (error) => {
      if (settled) return;
      settled = true;
      if (error) reject(error);
      else resolve(Buffer.concat(stdout));
    };
    child.stdout.on('data', (chunk) => stdout.push(chunk));
    child.stderr?.on('data', (chunk) => stderr.push(chunk));
    child.on('error', (error) => settle(new Error(`${command} failed: ${error.message}`)));
    child.on('close', (code, signal) => {
      const text = Buffer.concat(stderr).toString('utf8').trim();
      if (signal) settle(new Error(`${command} stopped by ${signal}`));
      else if (code !== 0)
        settle(new Error(text ? `${command} failed: ${text}` : `${command} failed with exit code ${code}`));
      else settle();
    });
    if (child.stdin) {
      // A child that exits before it reads all of its stdin closes the pipe; its exit code tells the result.
      child.stdin.on('error', () => {});
      child.stdin.end(input);
    }
  });
}

// The pids of the running gpg-agent processes of the GnuPG home `home`, from the `--homedir <home>` argument that gpg
// gives to the agent that it starts, or the reason why `ps` cannot tell.
function agentPids(home) {
  const ps = spawnSync('ps', ['-e', '-o', 'pid=,args='], { encoding: 'utf8' });
  if (ps.error || ps.status !== 0) return { reason: ps.error?.message ?? ps.stderr.trim() };
  const pids = ps.stdout.split('\n').flatMap((line) => {
    const match = line.match(/^\s*(\d+)\s+(.*)$/);
    return match && /\bgpg-agent\b/.test(match[2]) && `${match[2]} `.includes(`--homedir ${home} `) ? [match[1]] : [];
  });
  return { pids };
}

// Stops the agent of the private GnuPG home `home`, removes the socket folder of the home, and removes the home. It
// does each step also when a step before it fails, and gives one line for each step that fails. When the agent does
// not stop, the home goes all the same, because that is the safer choice: the imported secret key leaves the disk at
// once, and on Linux, gpg-agent stops itself when its home goes (GnuPG 2.4 watches the home with inotify). A kept home
// keeps the key on the disk until a person removes it. After the home goes, `gpgconf --homedir <home> --kill
// gpg-agent` cannot find the agent, so the line names the pid that `ps` shows for the agent of the home, for `kill`.
function removeHome(home, env) {
  const problems = [];
  const gpgconf = (...args) => {
    const result = spawnSync('gpgconf', ['--homedir', home, ...args], { env, encoding: 'utf8' });
    if (result.error) return { reason: result.error.message };
    if (result.status !== 0) return { reason: result.stderr.trim() || `exit code ${result.status}` };
    return { stdout: result.stdout.trim() };
  };
  const kill = gpgconf('--kill', 'gpg-agent');
  if (kill.reason) {
    const { pids, reason } = agentPids(home);
    const stop = pids?.length
      ? `stop it with \`kill ${pids.join(' ')}\``
      : pids
        ? '`ps` shows no gpg-agent of the home'
        : `\`ps\` cannot find the agent: ${reason}`;
    problems.push(
      `the gpg-agent of the private GnuPG home ${home} did not stop: \`gpgconf --homedir ${home} --kill gpg-agent\` ` +
        `failed: ${kill.reason}. The home is removed all the same, so that command cannot stop the agent now; ${stop}`,
    );
  }
  const sockets = gpgconf('--remove-socketdir');
  if (sockets.reason) {
    const dir = gpgconf('--list-dirs', 'socketdir').stdout;
    problems.push(
      `\`gpgconf --homedir ${home} --remove-socketdir\` failed: ${sockets.reason}; ` +
        `remove the socket folder ${dir || 'of the home'} by hand`,
    );
  }
  try {
    fs.rmSync(home, { recursive: true, force: true });
  } catch (error) {
    problems.push(`cannot remove the private GnuPG home ${home}: ${error.message}; remove it by hand`);
  }
  return problems;
}

// The decrypted bytes of `archive`, with the secret key of the export `keyBytes` imported into a new private GnuPG
// home (`mkdtemp` gives it mode 0700). gpg gets `--homedir` and no GNUPGHOME, so it never reads the key ring or the
// agent of the caller. GPG_TTY names the terminal of the stdin of the caller, or is removed when the stdin is not a
// terminal, so a wrong GPG_TTY of the caller never gets to the agent. The import has `--batch`, so it never asks for a
// passphrase, and a protected key stays protected. The decrypt uses the loopback mode, so no pinentry window opens.
// When the stdin of the caller is a terminal, the decrypt has no `--batch`, so gpg asks for the passphrase of a
// protected key itself in the terminal, also over SSH. Else the decrypt has `--batch`, because without it the
// loopback prompt of gpg can open `/dev/tty` also when its stdin is not a terminal; so a protected key stops the
// decrypt at once with the gpg error, and a key without a passphrase decrypts all the same. The decrypt runs at once
// with the agent of the import, and the agent stops only at the end. In every case, the agent stops and the home and
// its socket folder go (see `removeHome`); a failed step of that adds a line to the error, or gives the error when the
// decrypt passed. SIGHUP, SIGINT (for example Ctrl-C at the passphrase prompt), and SIGTERM stop the gpg child; then
// the home goes, and the error has the exit code of the signal. The handlers exist only while the home exists.
async function decryptWithKey(archive, keyBytes, env) {
  const gpgEnv = { ...env };
  delete gpgEnv.GNUPGHOME;
  delete gpgEnv.GPG_TTY;
  if (process.stdin.isTTY) {
    const tty = spawnSync('tty', { stdio: ['inherit', 'pipe', 'ignore'], encoding: 'utf8' });
    if (tty.status === 0) gpgEnv.GPG_TTY = tty.stdout.trim();
  }
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'keys-restore-gnupg-'));
  const gpg = ['--homedir', home, '--pinentry-mode', 'loopback'];
  let child;
  let signal;
  const stop = (name) => {
    signal ??= name;
    child?.kill('SIGTERM');
  };
  for (const name of STOP_SIGNALS) process.on(name, stop);
  const gpgChild = (args, options) => {
    if (signal) fail(`stopped by ${signal}`);
    return runChild('gpg', args, { env: gpgEnv, ...options }, (started) => {
      child = started;
    });
  };
  let bytes;
  let failure;
  try {
    await gpgChild([...gpg, '--batch', '--import'], { input: keyBytes });
    // The stdin of the decrypt is the terminal when the stdin of the caller is one, also when the stderr of the
    // caller goes to a file or a pipe, because the terminal input does not depend on the place of the messages. Its
    // stderr is the terminal only when the stderr of the caller is one, so the messages of gpg show there; else the
    // stderr is captured, so the error has the gpg text. The stdout always stays bytes.
    const stdio = [process.stdin.isTTY ? 'inherit' : 'ignore', 'pipe', process.stderr.isTTY ? 'inherit' : 'pipe'];
    try {
      const batch = process.stdin.isTTY ? [] : ['--batch'];
      bytes = await gpgChild([...gpg, ...batch, '--decrypt', archive], { stdio });
    } catch (error) {
      const version = () => spawnSync('gpg', ['--version'], { env: gpgEnv, encoding: 'utf8' }).stdout ?? '';
      const bad = /Bad secret key|Bad passphrase|exit code/.test(error.message);
      if (!signal && bad && /^libgcrypt 1\.12\.0$/m.test(version())) error.message += `\n${T8094_NOTE}`;
      throw error;
    }
  } catch (error) {
    failure = error;
  }
  const problems = removeHome(home, gpgEnv);
  for (const name of STOP_SIGNALS) process.off(name, stop);
  if (signal) {
    failure = new Error(`restore stopped by ${signal} before it wrote the folder`);
    failure.exitCode = 128 + os.constants.signals[signal];
  }
  if (problems.length) {
    failure ??= new Error('restore stopped before it wrote the folder');
    failure.message += `\n${problems.join('\n')}`;
  }
  if (failure) throw failure;
  return bytes;
}

// Decrypts `archive` with the secret-key export `key` into the new folder `out` (mode 0700) and verifies it. A missing
// or unreadable key file stops the restore before it writes anything, and so does an archive member that is not a
// regular file or a folder. A failure leaves no folder.
export async function restore({ archive, key, out, env = process.env }) {
  if (!archive || !key || !out) fail('restore needs --archive <file> --key <secret-key export> --out <new dir>');
  const target = path.resolve(out);
  if (fs.existsSync(target) || isSymlink(target)) fail(`${out} exists; restore needs a new folder`);
  let parent = path.dirname(target);
  while (!fs.existsSync(parent)) parent = path.dirname(parent);
  if (insideGit(parent, env)) fail(`${out} is inside a git checkout; restore outside every checkout`);
  let keyBytes;
  try {
    keyBytes = fs.readFileSync(path.resolve(key));
  } catch (error) {
    fail(`cannot read the key file ${key}: ${error.message}`);
  }
  const bytes = await decryptWithKey(path.resolve(archive), keyBytes, env);
  checkMemberTypes(bytes);
  const created = fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
  fs.mkdirSync(target, { mode: 0o700 });
  try {
    fs.chmodSync(target, 0o700);
    run('tar', ['-x', '-p', '--no-same-owner', '-f', '-', '-C', target], { input: bytes });
    fs.chmodSync(target, 0o700);
    verifyRestore(target);
  } catch (error) {
    fs.rmSync(created ?? target, { recursive: true, force: true });
    throw error;
  }
  return target;
}

function isSymlink(file) {
  try {
    return fs.lstatSync(file).isSymbolicLink();
  } catch {
    return false;
  }
}

// Compares the source snapshot and the frozen record of `keys` with the hashes of `<cases>/escape-draw.md`.
export function check({ keys, cases = SKILL_CASES }) {
  if (!keys) fail('check needs --keys <dir> [--cases <cases dir>]');
  const manifest = fs.readFileSync(path.join(cases, 'escape-draw.md'), 'utf8');
  const differs = CHECKS.filter(({ field, file, hash }) => {
    const line = manifest.match(new RegExp(`^- ${field}: ([0-9a-f]{64})$`, 'm'));
    try {
      return !line || hash(fs.readFileSync(path.join(keys, file))) !== line[1];
    } catch {
      return true;
    }
  }).map(({ field }) => field);
  if (differs.length) fail(`the keys folder differs from escape-draw.md in: ${differs.join(', ')}`);
  return `check: ${CHECKS.map(({ field }) => field).join(' and ')} match escape-draw.md\n`;
}

export async function main(argv, env = process.env) {
  const [command, ...args] = argv;
  const options = {
    backup: { keys: { type: 'string' }, out: { type: 'string' } },
    restore: { archive: { type: 'string' }, key: { type: 'string' }, out: { type: 'string' } },
    check: { keys: { type: 'string' }, cases: { type: 'string' } },
  }[command];
  if (!options) fail(USAGE);
  const { values } = parseArgs({ args, options, strict: true });
  if (command === 'backup') return `backup: wrote ${backup({ keys: values.keys, out: values.out, env })}\n`;
  if (command === 'restore') {
    const restored = await restore({ archive: values.archive, key: values.key, out: values.out, env });
    return `restore: verified every file in ${restored}\n`;
  }
  return check({ keys: values.keys, ...(values.cases ? { cases: path.resolve(values.cases) } : {}) });
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  // An error of a signal has the exit code of the signal; every other error has exit code 1.
  main(process.argv.slice(2)).then(
    (text) => process.stdout.write(text),
    (error) => {
      console.error(`keys.mjs: ${error.message}`);
      process.exitCode = error.exitCode ?? 1;
    },
  );
}
