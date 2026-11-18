#!/usr/bin/env node
// Encrypted off-machine copies of the held-out keys folder (see Cases, Key backup). A backup needs only the public key;
// a restore needs the secret key. No plaintext ever goes into the vault checkout.
import { spawnSync } from 'node:child_process';
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
// GNU tar options that make the same folder give the same bytes: name order, no times, no owners, no pax times.
const REPRODUCIBLE_TAR = [
  '--format=posix',
  '--sort=name',
  '--mtime=@0',
  '--owner=0',
  '--group=0',
  '--numeric-owner',
  '--pax-option=exthdr.name=%d/PaxHeaders/%f,delete=atime,delete=ctime',
];
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
  '      of the "Fingerprint: <hex>" line of <out>/README.md.',
  '  restore --archive <file> --out <new dir>',
  '      Decrypts with the key ring of GNUPGHOME (or the default key ring) into a new mode-0700 folder outside',
  '      every git checkout, and verifies every file against the manifest of the archive.',
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
  if (result.status !== 0) fail(`${command} failed: ${result.stderr.toString('utf8').trim()}`);
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

// The tar of a keys folder with its own manifest.
export function archiveBytes(keys) {
  return tarBytes(keys, manifestOf(keys));
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

// Writes one encrypted copy of `keys` into the vault checkout `out` and gives its path.
export function backup({ keys, out, env = process.env, now = new Date() }) {
  if (!keys || !out) fail('backup needs --keys <dir> --out <vault checkout>');
  const keysDir = fs.realpathSync(keys);
  const vault = fs.realpathSync(out);
  if (!fs.statSync(keysDir).isDirectory()) fail(`${keys} is no folder`);
  if (!fs.statSync(vault).isDirectory()) fail(`${out} is no folder`);
  if (isInside(vault, keysDir) || isInside(keysDir, vault))
    fail('the vault and the keys folder must not hold each other');
  const key = recipientFile(env);
  if (!fs.existsSync(key)) fail(`the recipient key file ${key} is missing`);
  const expected = vaultFingerprint(vault);
  const actual = fingerprintOf(key, env);
  if (actual !== expected)
    fail(`the recipient key ${actual} differs from the fingerprint ${expected} of the vault README.md`);
  const output = path.join(vault, archiveName(now));
  encrypt(archiveBytes(keysDir), key, output, env);
  return output;
}

// Checks a restored folder against its `MANIFEST.sha256` and removes the manifest, so the folder equals the keys
// folder.
function verifyRestore(dir) {
  const manifestFile = path.join(dir, MANIFEST);
  if (!fs.existsSync(manifestFile)) fail(`the archive has no ${MANIFEST}`);
  const expected = new Map();
  for (const line of fs.readFileSync(manifestFile, 'utf8').split('\n').filter(Boolean)) {
    const match = line.match(MANIFEST_LINE);
    if (!match) fail(`${MANIFEST} has a bad line: ${JSON.stringify(line)}`);
    expected.set(match[2], match[1]);
  }
  const found = filesOf(dir).filter((name) => name !== MANIFEST);
  const problems = [
    ...[...expected.keys()].filter((name) => !found.includes(name)).map((name) => `missing file ${name}`),
    ...found.filter((name) => !expected.has(name)).map((name) => `extra file ${name}`),
    ...found
      .filter((name) => expected.has(name) && expected.get(name) !== sha256(fs.readFileSync(path.join(dir, name))))
      .map((name) => `changed file ${name}`),
  ];
  if (problems.length) fail(`the restore does not match ${MANIFEST}: ${problems.join('; ')}`);
  fs.rmSync(manifestFile);
}

// Tells whether `dir`, an existing folder, is inside a git work tree or git folder.
function insideGit(dir) {
  const env = { ...process.env };
  for (const name of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_CEILING_DIRECTORIES']) delete env[name];
  const result = spawnSync('git', ['rev-parse', '--is-inside-work-tree', '--is-inside-git-dir'], {
    cwd: dir,
    env,
    encoding: 'utf8',
  });
  if (result.error) fail(`git failed: ${result.error.message}`);
  return result.status === 0 && result.stdout.split('\n').includes('true');
}

// Decrypts `archive` into the new folder `out` (mode 0700) and verifies it. A failure leaves no folder.
export function restore({ archive, out, env = process.env }) {
  if (!archive || !out) fail('restore needs --archive <file> --out <new dir>');
  const target = path.resolve(out);
  if (fs.existsSync(target) || isSymlink(target)) fail(`${out} exists; restore needs a new folder`);
  let parent = path.dirname(target);
  while (!fs.existsSync(parent)) parent = path.dirname(parent);
  if (insideGit(parent)) fail(`${out} is inside a git checkout; restore outside every checkout`);
  const bytes = run('gpg', ['--batch', '--decrypt', path.resolve(archive)], { env });
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

export function main(argv, env = process.env) {
  const [command, ...args] = argv;
  const options = {
    backup: { keys: { type: 'string' }, out: { type: 'string' } },
    restore: { archive: { type: 'string' }, out: { type: 'string' } },
    check: { keys: { type: 'string' }, cases: { type: 'string' } },
  }[command];
  if (!options) fail(USAGE);
  const { values } = parseArgs({ args, options, strict: true });
  if (command === 'backup') return `backup: wrote ${backup({ keys: values.keys, out: values.out, env })}\n`;
  if (command === 'restore')
    return `restore: verified every file in ${restore({ archive: values.archive, out: values.out, env })}\n`;
  return check({ keys: values.keys, ...(values.cases ? { cases: path.resolve(values.cases) } : {}) });
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.stdout.write(main(process.argv.slice(2)));
  } catch (error) {
    console.error(`keys.mjs: ${error.message}`);
    process.exitCode = 1;
  }
}
