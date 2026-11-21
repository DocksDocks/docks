import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { onTestFinished, test } from 'vitest';
import { BUN_RUNTIME } from '../../../../cli/test/lib/cliEntry.ts';
import * as escapes from '../scripts/escapes.mjs';
import * as keyBackup from '../scripts/keys.mjs';
import {
  escapeRegExp,
  put,
  readJson,
  scratch,
  SCRIPTS_DIR,
  SKILL_DIR,
} from './helpers.mjs';

// A throwaway GnuPG home with one key pair (no passphrase) for each user id, so no test touches the key ring of the
// user. Each key has its public key in `file` and an export of its secret key in `secret`; a test gives `file` to
// `backup` as the recipient, so no test encrypts to the committed key unless it says so. The keys are RSA keys: with
// libgcrypt 1.12.0, the bug T8094 makes the first use of an imported ECC key fail at random (plan #162).
function gpgHome(...names) {
  const version = spawnSync('gpg', ['--version'], { encoding: 'utf8' });
  if (version.error || version.status !== 0) assert.fail('gpg is missing: the key backup tests need GnuPG 2 on PATH');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'keys-test-'));
  const home = path.join(root, 'gnupg');
  fs.mkdirSync(home, { mode: 0o700 });
  const env = { ...process.env, GNUPGHOME: home };
  onTestFinished(() => {
    spawnSync('gpgconf', ['--kill', 'gpg-agent'], { env });
    spawnSync('gpgconf', ['--remove-socketdir'], { env });
    fs.rmSync(root, { recursive: true, force: true });
  });
  const gpg = (args) => {
    const result = spawnSync('gpg', args, { env, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout;
  };
  const keys = {};
  const batch = ['--batch', '--pinentry-mode', 'loopback', '--passphrase', ''];
  for (const name of names) {
    gpg([...batch, '--quick-generate-key', name, 'rsa3072', 'cert,sign', 'never']);
    const fingerprint = gpg(['--with-colons', '--list-keys', `=${name}`])
      .split('\n')
      .find((line) => line.startsWith('fpr:'))
      .split(':')[9];
    gpg([...batch, '--quick-add-key', fingerprint, 'rsa3072', 'encr', 'never']);
    const colons = gpg(['--with-colons', '--list-keys', fingerprint]).split('\n');
    const file = path.join(root, `${name.replaceAll(' ', '-')}.asc`);
    fs.writeFileSync(file, gpg(['--armor', '--export', fingerprint]));
    const secret = path.join(root, `${name.replaceAll(' ', '-')}-secret.asc`);
    fs.writeFileSync(
      secret,
      gpg(['--batch', '--pinentry-mode', 'loopback', '--armor', '--export-secret-keys', fingerprint]),
    );
    keys[name] = { fingerprint, subkey: colons.find((line) => line.startsWith('sub:')).split(':')[4], file, secret };
  }
  return { root, env, gpg, keys };
}
// A fake keys folder: a source snapshot, a restricted record, a held-out key with its fix patch, and a note whose name
// has spaces and quotes.
function keysFixture(root, name = 'keys') {
  const keys = path.join(root, name);
  put(keys, 'escape-draw-source.json', { version: 1, cutoff: '2026-01-01T00:00:00.000Z' });
  put(keys, 'escape-draw.json', escapes.frozenJson({ frozen: { version: 1, units: [] }, outcomes: [] }));
  put(keys, 'heldout/code-1.key.json', [{ id: 'K1', title: 'Hidden' }]);
  put(keys, 'heldout/code-1-K1.patch', 'diff --git a/x b/x\n');
  put(keys, `heldout/note "it's" here.txt`, 'a note\n');
  fs.chmodSync(keys, 0o700);
  fs.chmodSync(path.join(keys, 'heldout/code-1.key.json'), 0o600);
  return keys;
}
// Every entry under `root` with its mode and, for a file, its bytes.
function treeOf(root) {
  const entries = {};
  const walk = (relative) => {
    for (const name of fs.readdirSync(path.join(root, relative)).sort()) {
      const item = path.join(relative, name);
      const stat = fs.lstatSync(path.join(root, item));
      entries[item] = stat.isDirectory()
        ? { mode: stat.mode & 0o7777 }
        : { mode: stat.mode & 0o7777, bytes: fs.readFileSync(path.join(root, item)).toString('base64') };
      if (stat.isDirectory()) walk(item);
    }
  };
  walk('');
  return entries;
}
// A vault checkout (the root folder of a new git repository) whose README names `fingerprint`.
function vaultFor(gnupg, fingerprint) {
  const vault = path.join(gnupg.root, 'vault');
  put(vault, 'README.md', `# Held-out keys vault\n\nFingerprint: ${fingerprint}\n`);
  assert.equal(spawnSync('git', ['init', '-q', vault]).status, 0);
  return vault;
}
// The key ids of the public-key packets of an encrypted file: one per recipient.
function recipientsOf(gnupg, file) {
  const result = spawnSync('gpg', ['--batch', '--list-packets', file], { env: gnupg.env, encoding: 'utf8' });
  const ids = [...result.stdout.matchAll(/^:pubkey enc packet: .*keyid ([0-9A-F]{16})$/gm)].map((match) => match[1]);
  assert.ok(ids.length > 0, result.stderr);
  return ids;
}
test('key backup writes only an encrypted copy to the vault, and restore gives a byte-identical 0700 folder', async () => {
  const gnupg = gpgHome('bench test');
  const { fingerprint, file, secret } = gnupg.keys['bench test'];
  const keys = keysFixture(gnupg.root);
  const before = treeOf(keys);
  const vault = vaultFor(gnupg, fingerprint);
  const output = await keyBackup.main(['backup', '--keys', keys, '--out', vault, '--recipient', file], gnupg.env);
  const names = fs.readdirSync(vault).sort();
  assert.equal(names.length, 3);
  assert.deepEqual(names.slice(0, 2), ['.git', 'README.md']);
  assert.match(names[2], /^keys-\d{8}T\d{6}Z\.tar\.gpg$/);
  assert.equal(output, `backup: wrote ${path.join(fs.realpathSync(vault), names[2])}\n`);
  assert.ok(!fs.readFileSync(path.join(vault, names[2])).includes('escape-draw-source.json'));
  // The backup leaves the keys folder as it was: the manifest goes only into the archive.
  assert.deepEqual(treeOf(keys), before);
  const restored = path.join(gnupg.root, 'restored', 'keys');
  assert.equal(
    await keyBackup.main(
      ['restore', '--archive', path.join(vault, names[2]), '--key', secret, '--out', restored],
      gnupg.env,
    ),
    `restore: verified every file in ${restored}\n`,
  );
  assert.equal(fs.statSync(restored).mode & 0o777, 0o700);
  assert.deepEqual(treeOf(restored), before);
  // Two copies in one second would get one name; the second backup refuses and keeps the first copy.
  const now = new Date('2030-01-01T00:00:00.000Z');
  const first = keyBackup.backup({ keys, out: vault, recipient: file, env: gnupg.env, now });
  assert.equal(path.basename(first), 'keys-20300101T000000Z.tar.gpg');
  const bytes = fs.readFileSync(first);
  assert.throws(() => keyBackup.backup({ keys, out: vault, recipient: file, env: gnupg.env, now }), {
    message: /exists/,
  });
  assert.ok(fs.readFileSync(first).equals(bytes));
  assert.throws(() => keyBackup.backup({ keys, out: keys, recipient: file, env: gnupg.env }), {
    message: 'the vault and the keys folder must not hold each other',
  });
});
test('the tar step gives the same bytes for the same folder, whatever the file times and creation order', () => {
  const root = scratch();
  const keys = keysFixture(root);
  const first = keyBackup.archiveBytes(keys);
  assert.ok(keyBackup.archiveBytes(keys).equals(first));
  // The same files, made in the reverse order and with other times, give the same bytes.
  const other = path.join(root, 'other');
  for (const name of Object.keys(treeOf(keys)).reverse()) {
    const source = path.join(keys, name);
    const target = path.join(other, name);
    if (fs.statSync(source).isDirectory()) fs.mkdirSync(target, { recursive: true });
    else put(other, name, fs.readFileSync(source, 'utf8'));
    fs.chmodSync(target, fs.statSync(source).mode & 0o7777);
    fs.utimesSync(target, 1234, 5678);
  }
  fs.chmodSync(other, 0o700);
  assert.ok(keyBackup.archiveBytes(other).equals(first));
  // The manifest holds the SHA-256 and the path of every file, and a changed file changes the bytes.
  assert.equal(
    keyBackup
      .manifestOf(keys)
      .split('\n')
      .filter(Boolean)
      .map((line) => line.slice(66))
      .join(','),
    `escape-draw-source.json,escape-draw.json,heldout/code-1-K1.patch,heldout/code-1.key.json,heldout/note "it's" here.txt`,
  );
  fs.writeFileSync(path.join(other, 'heldout/code-1-K1.patch'), 'diff --git a/y b/y\n');
  assert.ok(!keyBackup.archiveBytes(other).equals(first));
});
test('restore refuses an existing folder and a folder inside a git checkout, and writes nothing', async () => {
  const gnupg = gpgHome('bench test');
  const { fingerprint, file } = gnupg.keys['bench test'];
  const archive = keyBackup.backup({
    keys: keysFixture(gnupg.root),
    out: vaultFor(gnupg, fingerprint),
    recipient: file,
    env: gnupg.env,
  });
  const existing = path.join(gnupg.root, 'existing');
  put(existing, 'mine.txt', 'kept\n');
  const key = gnupg.keys['bench test'].secret;
  await assert.rejects(keyBackup.restore({ archive, key, out: existing, env: gnupg.env }), {
    message: `${existing} exists; restore needs a new folder`,
  });
  assert.deepEqual(fs.readdirSync(existing), ['mine.txt']);
  const repository = path.join(gnupg.root, 'checkout');
  fs.mkdirSync(repository);
  assert.equal(spawnSync('git', ['init', '-q', repository]).status, 0);
  const inside = path.join(repository, 'sub', 'restored');
  await assert.rejects(keyBackup.restore({ archive, key, out: inside, env: gnupg.env }), {
    message: `${inside} is inside a git checkout; restore outside every checkout`,
  });
  assert.ok(!fs.existsSync(path.join(repository, 'sub')));
});
test('restore and backup stop with the folder and the git error when git cannot check the folder', async () => {
  const root = scratch();
  const repository = path.join(root, 'checkout');
  assert.equal(spawnSync('git', ['init', '-q', repository]).status, 0);
  // Git takes the repository for one of another owner. No safe.directory line of a user or system config can allow it.
  const env = {
    ...process.env,
    GIT_TEST_ASSUME_DIFFERENT_OWNER: '1',
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_CONFIG_NOSYSTEM: '1',
  };
  const out = path.join(repository, 'sub', 'restored');
  const archive = path.join(root, 'none.tar.gpg');
  await assert.rejects(keyBackup.restore({ archive, key: path.join(root, 'none.asc'), out, env }), {
    message: new RegExp(`^git cannot check the folder ${escapeRegExp(repository)}: fatal: detected dubious ownership`),
  });
  assert.ok(!fs.existsSync(path.join(repository, 'sub')));
  assert.throws(() => keyBackup.backup({ keys: keysFixture(root), out: repository, env }), {
    message: new RegExp(
      `^git cannot check the folder ${escapeRegExp(fs.realpathSync(repository))}: fatal: detected dubious ownership`,
    ),
  });
  assert.deepEqual(fs.readdirSync(repository), ['.git']);
});
test('restore names each file that does not match the manifest of the archive and leaves no folder', async () => {
  const gnupg = gpgHome('bench test');
  const keys = keysFixture(gnupg.root);
  const archive = path.join(gnupg.root, 'tampered.tar.gpg');
  const manifest = keyBackup
    .manifestOf(keys)
    .split('\n')
    .filter((line) => line && !line.endsWith('  heldout/code-1-K1.patch'))
    .map((line) => (line.endsWith('  heldout/code-1.key.json') ? `${'0'.repeat(64)}${line.slice(64)}` : line))
    .concat(`${'1'.repeat(64)}  heldout/gone.json`, '')
    .join('\n');
  keyBackup.encrypt(keyBackup.tarBytes(keys, manifest), gnupg.keys['bench test'].file, archive, gnupg.env);
  const out = path.join(gnupg.root, 'bad', 'restored');
  await assert.rejects(keyBackup.restore({ archive, key: gnupg.keys['bench test'].secret, out, env: gnupg.env }), {
    message:
      'the restore does not match MANIFEST.sha256: missing file heldout/gone.json; ' +
      'extra file heldout/code-1-K1.patch; changed file heldout/code-1.key.json',
  });
  assert.ok(!fs.existsSync(path.join(gnupg.root, 'bad')));
});
const KEYS_SCRIPT = path.join(SCRIPTS_DIR, 'keys.mjs');
// Encrypts a plain GNU tar of the entries of `dir`, in name order and with no link changes, into `archive`: an archive
// that `backup` did not make.
function encryptTree(gnupg, dir, archive) {
  const tar = spawnSync('tar', ['-c', '-f', '-', '--format=posix', '--sort=name', '-C', dir, ...fs.readdirSync(dir)]);
  assert.equal(tar.status, 0, tar.stderr?.toString());
  keyBackup.encrypt(tar.stdout, gnupg.keys['bench test'].file, archive, gnupg.env);
}
test('restore refuses a MANIFEST.sha256 that is a link or a folder, shows no manifest text, and leaves no folder', async () => {
  const gnupg = gpgHome('bench test');
  const secret = 'outside-secret-text-4711';
  put(gnupg.root, 'secret.txt', `${secret}\n`);
  // An archive whose MANIFEST.sha256 is a symbolic link to a file outside the folder.
  const linked = keysFixture(gnupg.root, 'linked');
  fs.symlinkSync(path.join(gnupg.root, 'secret.txt'), path.join(linked, 'MANIFEST.sha256'));
  const archive = path.join(gnupg.root, 'linked.tar.gpg');
  encryptTree(gnupg, linked, archive);
  const out = path.join(gnupg.root, 'bad', 'restored');
  const key = gnupg.keys['bench test'].secret;
  const cli = spawnSync(BUN_RUNTIME, [KEYS_SCRIPT, 'restore', '--archive', archive, '--key', key, '--out', out], {
    env: gnupg.env,
    encoding: 'utf8',
  });
  assert.equal(cli.status, 1);
  assert.equal(cli.stdout, '');
  assert.equal(cli.stderr, 'keys.mjs: the archive has a member that is neither a file nor a folder: MANIFEST.sha256\n');
  assert.ok(!`${cli.stdout}${cli.stderr}`.includes(secret));
  assert.ok(!fs.existsSync(path.join(gnupg.root, 'bad')));
  // A MANIFEST.sha256 folder passes the member check, but restore reads only a regular manifest file.
  const folder = keysFixture(gnupg.root, 'folder');
  put(folder, 'MANIFEST.sha256/inner.txt', 'inner\n');
  const folderArchive = path.join(gnupg.root, 'folder.tar.gpg');
  encryptTree(gnupg, folder, folderArchive);
  await assert.rejects(keyBackup.restore({ archive: folderArchive, key, out, env: gnupg.env }), {
    message: 'the MANIFEST.sha256 of the archive is not a regular file',
  });
  assert.ok(!fs.existsSync(path.join(gnupg.root, 'bad')));
  // A bad manifest line stops with its line number and without its text.
  const badLine = keysFixture(gnupg.root, 'bad-line');
  put(badLine, 'MANIFEST.sha256', `${keyBackup.manifestOf(badLine).split('\n')[0]}\n${secret}\n`);
  const badLineArchive = path.join(gnupg.root, 'bad-line.tar.gpg');
  encryptTree(gnupg, badLine, badLineArchive);
  await assert.rejects(keyBackup.restore({ archive: badLineArchive, key, out, env: gnupg.env }), {
    message: 'MANIFEST.sha256 has a bad line 2',
  });
  assert.ok(!fs.existsSync(path.join(gnupg.root, 'bad')));
});
test('restore refuses an archive with a symbolic link or a hard link member, names each member, and writes nothing', async () => {
  const gnupg = gpgHome('bench test');
  const keys = keysFixture(gnupg.root);
  put(keys, 'MANIFEST.sha256', keyBackup.manifestOf(keys));
  fs.symlinkSync('../escape-draw.json', path.join(keys, 'heldout/link'));
  fs.linkSync(path.join(keys, 'heldout/code-1-K1.patch'), path.join(keys, 'heldout/copy'));
  const archive = path.join(gnupg.root, 'links.tar.gpg');
  encryptTree(gnupg, keys, archive);
  const out = path.join(gnupg.root, 'bad', 'restored');
  await assert.rejects(keyBackup.restore({ archive, key: gnupg.keys['bench test'].secret, out, env: gnupg.env }), {
    message: 'the archive has a member that is neither a file nor a folder: heldout/copy; heldout/link',
  });
  assert.ok(!fs.existsSync(path.join(gnupg.root, 'bad')));
});
// The path of the first executable file `name` on PATH, so a shim can give a call to the real command.
function realCommand(name) {
  const found = process.env.PATH.split(path.delimiter)
    .filter((dir) => path.isAbsolute(dir))
    .map((dir) => path.join(dir, name))
    .find((candidate) => {
      try {
        fs.accessSync(candidate, fs.constants.X_OK);
        return fs.statSync(candidate).isFile();
      } catch {
        return false;
      }
    });
  assert.ok(found && !found.includes("'"), `no usable ${name} on PATH: ${found}`);
  return found;
}
// Writes the shell script `lines` as the command `name` into the shim folder of `gnupg`, and gives a PATH with the
// shim folder first. A script can put paths of `gnupg.root` into single quotes.
function shimPath(gnupg, name, lines) {
  assert.ok(!gnupg.root.includes("'"), `the test folder ${gnupg.root} has a quote`);
  const shim = path.join(gnupg.root, 'shim');
  fs.mkdirSync(shim, { recursive: true });
  fs.writeFileSync(path.join(shim, name), ['#!/bin/sh', ...lines, ''].join('\n'), { mode: 0o755 });
  return `${shim}${path.delimiter}${process.env.PATH}`;
}
// Runs `keys.mjs restore` in a child process with a `gpg` shim first on PATH. The shim prints a version text with
// `libgcrypt <libgcrypt>` for `--version`, fails each `--decrypt` with "Bad secret key", and gives every other call to
// the real gpg, so the import is real. TMPDIR is a new folder, so the test sees the temporary GnuPG home of restore.
function restoreWithGpgShim(libgcrypt) {
  const gnupg = gpgHome('bench test');
  const { file, secret } = gnupg.keys['bench test'];
  const keys = keysFixture(gnupg.root);
  const archive = path.join(gnupg.root, 'keys.tar.gpg');
  keyBackup.encrypt(keyBackup.tarBytes(keys, keyBackup.manifestOf(keys)), file, archive, gnupg.env);
  const PATH = shimPath(gnupg, 'gpg', [
    'if [ "$1" = --version ]; then',
    `  printf '%s\\n' 'gpg (GnuPG) 2.4.8' 'libgcrypt ${libgcrypt}' 'Home: ~/.gnupg'`,
    '  exit 0',
    'fi',
    'for arg in "$@"; do',
    '  if [ "$arg" = --decrypt ]; then',
    "    echo 'gpg: decryption failed: Bad secret key' >&2",
    '    exit 2',
    '  fi',
    'done',
    `exec '${realCommand('gpg')}' "$@"`,
  ]);
  const out = path.join(gnupg.root, 'bad', 'restored');
  const cli = restoreCli(gnupg, ['--archive', archive, '--key', secret, '--out', out], { ...gnupg.env, PATH });
  assert.equal(cli.status, 1, cli.stderr);
  assert.equal(cli.stdout, '');
  assert.ok(!fs.existsSync(path.join(gnupg.root, 'bad')));
  assert.deepEqual(restoreLeftovers(gnupg), { homes: [], processes: [] });
  return cli.stderr;
}
test('restore adds the T8094 line to a failed decrypt with libgcrypt 1.12.0 and leaves no folder or GnuPG home', () => {
  const stderr = restoreWithGpgShim('1.12.0');
  const [first, note, ...rest] = stderr.split('\n');
  assert.equal(first, 'keys.mjs: gpg failed: gpg: decryption failed: Bad secret key');
  assert.match(note, /bug T8094 \(https:\/\/dev\.gnupg\.org\/T8094\)/);
  assert.match(note, /libgcrypt 1\.12\.1 or later fixes it/);
  assert.deepEqual(rest, ['']);
});
test('restore gives no T8094 line for a failed decrypt with libgcrypt 1.12.1', () => {
  assert.equal(restoreWithGpgShim('1.12.1'), 'keys.mjs: gpg failed: gpg: decryption failed: Bad secret key\n');
});
test('backup stores each hard-linked file as a regular member, and restore gives byte-identical files', async () => {
  const gnupg = gpgHome('bench test');
  const { fingerprint, file, secret } = gnupg.keys['bench test'];
  const keys = keysFixture(gnupg.root);
  const patch = path.join(keys, 'heldout/code-1-K1.patch');
  fs.linkSync(patch, path.join(keys, 'heldout/code-1-K1 copy.patch'));
  const before = treeOf(keys);
  // Two separate copies of the file give the same tar bytes, so the tar has no hard link member.
  const copies = keysFixture(gnupg.root, 'copies');
  put(copies, 'heldout/code-1-K1 copy.patch', fs.readFileSync(patch, 'utf8'));
  assert.ok(keyBackup.archiveBytes(keys).equals(keyBackup.archiveBytes(copies)));
  const archive = keyBackup.backup({ keys, out: vaultFor(gnupg, fingerprint), recipient: file, env: gnupg.env });
  const restored = path.join(gnupg.root, 'restored', 'keys');
  assert.equal(await keyBackup.restore({ archive, key: secret, out: restored, env: gnupg.env }), restored);
  assert.deepEqual(treeOf(restored), before);
  assert.equal(fs.statSync(path.join(restored, 'heldout/code-1-K1 copy.patch')).nlink, 1);
});
// Runs `keys.mjs restore` with `args` in a new process whose TMPDIR is the folder `tmp` of `gnupg`, so the test sees
// each private GnuPG home that the run leaves. The process has no terminal, so the gpg errors go to its stderr.
function restoreCli(gnupg, args, env = gnupg.env) {
  const tmp = path.join(gnupg.root, 'tmp');
  fs.mkdirSync(tmp, { recursive: true });
  return spawnSync(BUN_RUNTIME, [KEYS_SCRIPT, 'restore', ...args], {
    env: { ...env, TMPDIR: tmp },
    encoding: 'utf8',
  });
}
// The entries of the `tmp` folder of `gnupg` and the command lines of the running processes that name it, for example
// the gpg-agent of a private GnuPG home of `restore`.
function restoreLeftovers(gnupg) {
  const tmp = path.join(gnupg.root, 'tmp');
  const ps = spawnSync('ps', ['-e', '-o', 'args='], { encoding: 'utf8' });
  assert.equal(ps.status, 0, ps.stderr);
  return { homes: fs.readdirSync(tmp), processes: ps.stdout.split('\n').filter((line) => line.includes(tmp)) };
}
// Writes a `gpg` shim that adds one line for each call to the log `log` and gives the call to the real gpg, and gives a
// PATH with the shim first. The line names the operation (`import`, `decrypt`, or `other`), tells whether the stdin is
// a terminal (`[ -t 0 ]`) and whether `--batch` is an argument, and gives GPG_TTY, or `unset`.
function gpgCallLog(gnupg, log) {
  return shimPath(gnupg, 'gpg', [
    'op=other',
    'batch=no',
    'for arg in "$@"; do',
    '  case "$arg" in',
    '    --import) op=import ;;',
    '    --decrypt) op=decrypt ;;',
    '    --batch) batch=yes ;;',
    '  esac',
    'done',
    'if [ -t 0 ]; then stdin=tty; else stdin=notty; fi',
    `printf '%s stdin=%s batch=%s GPG_TTY=%s\\n' "$op" "$stdin" "$batch" "\${GPG_TTY-unset}" >> '${log}'`,
    `exec '${realCommand('gpg')}' "$@"`,
  ]);
}
// The lines of the log of `gpgCallLog`.
function gpgCalls(log) {
  return fs.readFileSync(log, 'utf8').split('\n').filter(Boolean);
}
// Ten runs take about 0.5 s each and more on a loaded runner, so the 5 s default timeout of bun is too short.
test('restore --key gives the same folder on each of 10 runs, whatever GNUPGHOME and GPG_TTY of the caller say', {
  timeout: 60_000,
}, () => {
  const gnupg = gpgHome('bench test');
  const { fingerprint, file, secret } = gnupg.keys['bench test'];
  const keys = keysFixture(gnupg.root);
  const before = treeOf(keys);
  const archive = keyBackup.backup({ keys, out: vaultFor(gnupg, fingerprint), recipient: file, env: gnupg.env });
  // Each run has the wrong GPG_TTY `not a tty` of a shell without a terminal; the restore removes it. On each second
  // run, GNUPGHOME also names a folder that does not exist. The restore never reads it, so the result stays the same,
  // and gpg does not make the folder. A `gpg` shim logs each call and gives it to the real gpg.
  const log = path.join(gnupg.root, 'gpg-calls.log');
  const PATH = gpgCallLog(gnupg, log);
  const missing = path.join(gnupg.root, 'no-gnupg');
  for (let index = 0; index < 10; index += 1) {
    const out = path.join(gnupg.root, `restored-${index}`, 'keys');
    const env = { ...gnupg.env, PATH, GPG_TTY: 'not a tty', ...(index % 2 ? { GNUPGHOME: missing } : {}) };
    const cli = restoreCli(gnupg, ['--archive', archive, '--key', secret, '--out', out], env);
    assert.equal(cli.status, 0, cli.stderr);
    assert.equal(cli.stdout, `restore: verified every file in ${out}\n`);
    assert.equal(cli.stderr, '');
    assert.equal(fs.statSync(out).mode & 0o777, 0o700);
    assert.deepEqual(treeOf(out), before);
    assert.deepEqual(restoreLeftovers(gnupg), { homes: [], processes: [] });
  }
  assert.ok(!fs.existsSync(missing));
  // The shim saw the import and the decrypt of each run. The stdin of the test has no terminal, so no call got a GPG_TTY
  // or a terminal stdin, and no call saw `not a tty`. The decrypt has `--batch`, so gpg never opens /dev/tty for the
  // loopback prompt.
  const importCall = 'import stdin=notty batch=yes GPG_TTY=unset';
  const decryptCall = 'decrypt stdin=notty batch=yes GPG_TTY=unset';
  assert.deepEqual(gpgCalls(log), Array.from({ length: 10 }, () => [importCall, decryptCall]).flat());
});
// The test of a restore with a terminal runs the command under a new pseudo-terminal with the `script` command of
// util-linux. The BSD `script` of macOS takes other options, so the test runs only where `script --version` names
// util-linux.
const UTIL_LINUX_SCRIPT = /util-linux/.test(spawnSync('script', ['--version'], { encoding: 'utf8' }).stdout ?? '');
test.skipIf(!UTIL_LINUX_SCRIPT)('restore with a terminal on stdin decrypts without --batch, with the terminal as stdin and as GPG_TTY', () => {
  const gnupg = gpgHome('bench test');
  const { fingerprint, file, secret } = gnupg.keys['bench test'];
  const keys = keysFixture(gnupg.root);
  const before = treeOf(keys);
  const archive = keyBackup.backup({ keys, out: vaultFor(gnupg, fingerprint), recipient: file, env: gnupg.env });
  const log = path.join(gnupg.root, 'gpg-calls.log');
  const PATH = gpgCallLog(gnupg, log);
  const out = path.join(gnupg.root, 'restored', 'keys');
  const tmp = path.join(gnupg.root, 'tmp');
  fs.mkdirSync(tmp, { recursive: true });
  // `script -qec` runs the command under a new pseudo-terminal, so the stdin of the restore is a terminal. The command
  // writes the name of that terminal, and the stdout and the stderr of the restore go to files, so the stderr of the
  // restore is no terminal.
  const files = Object.fromEntries(['tty', 'stdout', 'stderr'].map((name) => [name, path.join(gnupg.root, name)]));
  const quote = (text) => {
    assert.ok(!text.includes("'"), `the path ${text} has a quote`);
    return `'${text}'`;
  };
  const restore = [BUN_RUNTIME, KEYS_SCRIPT, 'restore', '--archive', archive, '--key', secret, '--out', out];
  const redirect = `> ${quote(files.stdout)} 2> ${quote(files.stderr)}`;
  const command = `tty > ${quote(files.tty)} && exec ${restore.map(quote).join(' ')} ${redirect}`;
  const cli = spawnSync('script', ['-qec', command, '/dev/null'], {
    env: { ...gnupg.env, PATH, TMPDIR: tmp, SHELL: '/bin/sh', GPG_TTY: 'not a tty' },
    stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'utf8',
    timeout: 30_000,
  });
  const stderr = fs.existsSync(files.stderr) ? fs.readFileSync(files.stderr, 'utf8') : '';
  assert.equal(cli.status, 0, `${cli.error?.message ?? ''}${cli.stderr}${stderr}`);
  assert.equal(stderr, '');
  assert.equal(fs.readFileSync(files.stdout, 'utf8'), `restore: verified every file in ${out}\n`);
  assert.deepEqual(treeOf(out), before);
  assert.deepEqual(restoreLeftovers(gnupg), { homes: [], processes: [] });
  const pty = fs.readFileSync(files.tty, 'utf8').trim();
  assert.match(pty, /^\/dev\/pts\/\d+$/);
  // The import reads the export from a pipe and has `--batch`; the decrypt has the terminal as stdin and no `--batch`,
  // so gpg can ask for a passphrase there. Both calls get the terminal as GPG_TTY, not the `not a tty` of the caller.
  assert.deepEqual(gpgCalls(log), [
    `import stdin=notty batch=yes GPG_TTY=${pty}`,
    `decrypt stdin=tty batch=no GPG_TTY=${pty}`,
  ]);
});
// Stops the process `pid` when `ps` shows that it is still a gpg-agent of the `tmp` folder of `gnupg`, and waits until
// no process names that folder.
async function stopAgent(gnupg, pid) {
  const ps = spawnSync('ps', ['-p', pid, '-o', 'args='], { encoding: 'utf8' });
  if (ps.status === 0 && ps.stdout.includes('gpg-agent') && ps.stdout.includes(path.join(gnupg.root, 'tmp')))
    process.kill(Number(pid));
  for (let wait = 0; wait < 100 && restoreLeftovers(gnupg).processes.length; wait += 1) await sleep(50);
}
test('restore removes the private GnuPG home when gpgconf cannot stop its agent, and names the pid of the agent', {
  timeout: 30_000,
}, async () => {
  const gnupg = gpgHome('bench test', 'bench other');
  const { fingerprint, file, secret } = gnupg.keys['bench test'];
  const archive = keyBackup.backup({
    keys: keysFixture(gnupg.root),
    out: vaultFor(gnupg, fingerprint),
    recipient: file,
    env: gnupg.env,
  });
  // The `gpgconf` shim fails each `--kill`, after it asks the agent for its pid; it gives every other call to the real
  // gpgconf.
  const pidFile = path.join(gnupg.root, 'agent-pid');
  const PATH = shimPath(gnupg, 'gpgconf', [
    'if [ "$3" = --kill ]; then',
    `  gpg-connect-agent --homedir "$2" --no-autostart 'getinfo pid' /bye > '${pidFile}'`,
    "  echo 'gpgconf: cannot stop the agent' >&2",
    '  exit 1',
    'fi',
    `exec '${realCommand('gpgconf')}' "$@"`,
  ]);
  const tmp = path.join(gnupg.root, 'tmp');
  // A good key gives only the line of the agent; the key of another pair keeps the gpg error first.
  for (const [key, first] of [
    [secret, /^keys\.mjs: restore stopped before it wrote the folder\n/],
    [gnupg.keys['bench other'].secret, /^keys\.mjs: gpg failed: gpg: [\s\S]*\ngpg: decryption failed: No secret key\n/],
  ]) {
    const out = path.join(gnupg.root, 'bad', 'restored');
    const cli = restoreCli(gnupg, ['--archive', archive, '--key', key, '--out', out], { ...gnupg.env, PATH });
    const pid = fs.readFileSync(pidFile, 'utf8').match(/^D (\d+)$/m)?.[1];
    assert.ok(pid, 'the shim got no pid from the agent');
    assert.equal(cli.status, 1, cli.stderr);
    assert.equal(cli.stdout, '');
    const home = `${escapeRegExp(tmp)}/keys-restore-gnupg-[^ /]+`;
    const agent = new RegExp(
      `\\nthe gpg-agent of the private GnuPG home (${home}) did not stop: \`gpgconf --homedir \\1 --kill gpg-agent\` ` +
        'failed: gpgconf: cannot stop the agent\\. The home is removed all the same, so that command cannot stop the ' +
        `agent now; stop it with \`kill ${pid}\`\\n$`,
    );
    assert.match(cli.stderr, first);
    assert.match(cli.stderr, agent);
    assert.equal(cli.stderr.split('\n').filter((line) => line.startsWith('the gpg-agent')).length, 1);
    assert.ok(!fs.existsSync(path.join(gnupg.root, 'bad')));
    assert.deepEqual(fs.readdirSync(tmp), []);
    await stopAgent(gnupg, pid);
    assert.deepEqual(restoreLeftovers(gnupg), { homes: [], processes: [] });
  }
});
test('restore stops at SIGHUP, SIGINT, and SIGTERM during the decrypt with the exit code of the signal and leaves nothing', {
  timeout: 30_000,
}, async () => {
  const gnupg = gpgHome('bench test');
  const { fingerprint, file, secret } = gnupg.keys['bench test'];
  const archive = keyBackup.backup({
    keys: keysFixture(gnupg.root),
    out: vaultFor(gnupg, fingerprint),
    recipient: file,
    env: gnupg.env,
  });
  // The `gpg` shim marks the start of each `--decrypt` and then sleeps, as gpg does at the passphrase prompt; it gives
  // every other call to the real gpg, so the import is real and starts the agent of the private home.
  const mark = path.join(gnupg.root, 'decrypting');
  const PATH = shimPath(gnupg, 'gpg', [
    'for arg in "$@"; do',
    '  if [ "$arg" = --decrypt ]; then',
    `    : > '${mark}'`,
    '    exec sleep 30',
    '  fi',
    'done',
    `exec '${realCommand('gpg')}' "$@"`,
  ]);
  const tmp = path.join(gnupg.root, 'tmp');
  fs.mkdirSync(tmp);
  for (const [signal, code] of [
    ['SIGHUP', 129],
    ['SIGINT', 130],
    ['SIGTERM', 143],
  ]) {
    fs.rmSync(mark, { force: true });
    const out = path.join(gnupg.root, 'bad', 'restored');
    const child = spawn(
      BUN_RUNTIME,
      [KEYS_SCRIPT, 'restore', '--archive', archive, '--key', secret, '--out', out],
      {
        env: { ...gnupg.env, PATH, TMPDIR: tmp },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    const output = { stdout: '', stderr: '' };
    child.stdout.on('data', (chunk) => (output.stdout += chunk));
    child.stderr.on('data', (chunk) => (output.stderr += chunk));
    const exit = new Promise((resolve) => child.on('close', (status, killed) => resolve({ status, killed })));
    for (let wait = 0; wait < 200 && !fs.existsSync(mark); wait += 1) await sleep(50);
    assert.ok(fs.existsSync(mark), `the decrypt did not start: ${output.stderr}`);
    // The decrypt waits, and the private home and its agent exist.
    const during = restoreLeftovers(gnupg);
    assert.equal(during.homes.length, 1);
    assert.ok(
      during.processes.some((line) => line.startsWith('gpg-agent')),
      `no agent: ${during.processes}`,
    );
    child.kill(signal);
    assert.deepEqual(await exit, { status: code, killed: null });
    assert.equal(output.stdout, '');
    assert.equal(output.stderr, `keys.mjs: restore stopped by ${signal} before it wrote the folder\n`);
    assert.ok(!fs.existsSync(path.join(gnupg.root, 'bad')));
    assert.deepEqual(restoreLeftovers(gnupg), { homes: [], processes: [] });
  }
});
test('restore without --key or with a key file that it cannot read stops before it writes anything', async () => {
  const gnupg = gpgHome('bench test');
  const { fingerprint, file } = gnupg.keys['bench test'];
  const archive = keyBackup.backup({
    keys: keysFixture(gnupg.root),
    out: vaultFor(gnupg, fingerprint),
    recipient: file,
    env: gnupg.env,
  });
  const out = path.join(gnupg.root, 'bad', 'restored');
  const usage = 'keys.mjs: restore needs --archive <file> --key <secret-key export> --out <new dir>\n';
  const missing = path.join(gnupg.root, 'none.asc');
  for (const [args, stderr] of [
    [[], usage],
    [['--key', missing], new RegExp(`^keys\\.mjs: cannot read the key file ${escapeRegExp(missing)}: ENOENT\\b`)],
    [['--key', gnupg.root], new RegExp(`^keys\\.mjs: cannot read the key file ${escapeRegExp(gnupg.root)}: EISDIR\\b`)],
  ]) {
    const cli = restoreCli(gnupg, ['--archive', archive, ...args, '--out', out]);
    assert.equal(cli.status, 1);
    assert.equal(cli.stdout, '');
    if (typeof stderr === 'string') assert.equal(cli.stderr, stderr);
    else assert.match(cli.stderr, stderr);
    assert.ok(!fs.existsSync(path.join(gnupg.root, 'bad')));
    assert.deepEqual(restoreLeftovers(gnupg), { homes: [], processes: [] });
  }
  await assert.rejects(keyBackup.restore({ archive, out, env: gnupg.env }), {
    message: 'restore needs --archive <file> --key <secret-key export> --out <new dir>',
  });
});
test('restore with the secret key of another key pair stops with the gpg error and writes nothing', () => {
  const gnupg = gpgHome('bench test', 'bench other');
  const { fingerprint, file } = gnupg.keys['bench test'];
  const archive = keyBackup.backup({
    keys: keysFixture(gnupg.root),
    out: vaultFor(gnupg, fingerprint),
    recipient: file,
    env: gnupg.env,
  });
  const out = path.join(gnupg.root, 'bad', 'restored');
  const cli = restoreCli(gnupg, ['--archive', archive, '--key', gnupg.keys['bench other'].secret, '--out', out]);
  assert.equal(cli.status, 1);
  assert.equal(cli.stdout, '');
  assert.match(cli.stderr, /^keys\.mjs: gpg failed: gpg: .*\ngpg: decryption failed: No secret key\n$/s);
  assert.ok(!fs.existsSync(path.join(gnupg.root, 'bad')));
  assert.deepEqual(restoreLeftovers(gnupg), { homes: [], processes: [] });
});
test('backup refuses a recipient key that the vault README does not name, and writes nothing', () => {
  const gnupg = gpgHome('bench test', 'bench other');
  const keys = keysFixture(gnupg.root);
  const { fingerprint } = gnupg.keys['bench test'];
  const other = gnupg.keys['bench other'];
  const vault = vaultFor(gnupg, fingerprint);
  assert.throws(() => keyBackup.backup({ keys, out: vault, recipient: other.file, env: gnupg.env }), {
    message: `the recipient key ${other.fingerprint} differs from the fingerprint ${fingerprint} of the vault README.md`,
  });
  fs.writeFileSync(path.join(vault, 'README.md'), '# Held-out keys vault\n');
  assert.throws(() => keyBackup.backup({ keys, out: vault, recipient: other.file, env: gnupg.env }), {
    message: `the README.md of ${fs.realpathSync(vault)} must have exactly one "Fingerprint: <hex>" line`,
  });
  assert.deepEqual(fs.readdirSync(vault).sort(), ['.git', 'README.md']);
});
// The committed public key of the backup, and its primary fingerprint and encryption subkey id from
// `gpg --show-keys`.
function committedKey(gnupg) {
  const file = path.join(SKILL_DIR, 'backup-key.asc');
  const lines = gnupg.gpg(['--no-options', '--with-colons', '--show-keys', file]).split('\n');
  assert.equal(lines.filter((line) => line.startsWith('pub:')).length, 1);
  const fingerprint = lines[lines.findIndex((line) => line.startsWith('pub:')) + 1].split(':')[9];
  const subkey = lines.find((line) => line.startsWith('sub:') && line.split(':')[11].includes('e')).split(':')[4];
  return { file, fingerprint, subkey };
}
test('backup without --recipient encrypts to the committed backup-key.asc that the vault README names', async () => {
  const gnupg = gpgHome();
  const committed = committedKey(gnupg);
  const keys = keysFixture(gnupg.root);
  const vault = vaultFor(gnupg, committed.fingerprint);
  const output = await keyBackup.main(['backup', '--keys', keys, '--out', vault], gnupg.env);
  const names = fs.readdirSync(vault).sort();
  assert.equal(names.length, 3);
  assert.match(names[2], /^keys-\d{8}T\d{6}Z\.tar\.gpg$/);
  assert.equal(output, `backup: wrote ${path.join(fs.realpathSync(vault), names[2])}\n`);
  assert.deepEqual(recipientsOf(gnupg, path.join(vault, names[2])), [committed.subkey]);
});
test('backup without --recipient refuses the committed backup-key.asc when the vault README names another key', () => {
  const gnupg = gpgHome('bench test');
  const committed = committedKey(gnupg);
  const { fingerprint } = gnupg.keys['bench test'];
  const vault = vaultFor(gnupg, fingerprint);
  const cli = spawnSync(BUN_RUNTIME, [KEYS_SCRIPT, 'backup', '--keys', keysFixture(gnupg.root), '--out', vault], {
    env: gnupg.env,
    encoding: 'utf8',
  });
  assert.equal(cli.status, 1);
  assert.equal(cli.stdout, '');
  assert.equal(
    cli.stderr,
    `keys.mjs: the recipient key ${committed.fingerprint} differs from the fingerprint ${fingerprint} ` +
      'of the vault README.md\n',
  );
  assert.deepEqual(fs.readdirSync(vault).sort(), ['.git', 'README.md']);
});
test('backup --recipient with a missing file or a folder stops before it writes anything and names the file', () => {
  const gnupg = gpgHome('bench test');
  const keys = keysFixture(gnupg.root);
  const vault = vaultFor(gnupg, gnupg.keys['bench test'].fingerprint);
  const missing = path.join(gnupg.root, 'none.asc');
  for (const [recipient, stderr] of [
    [missing, new RegExp(`^keys\\.mjs: cannot read the recipient key file ${escapeRegExp(missing)}: ENOENT\\b.*\n$`)],
    [gnupg.root, `keys.mjs: the recipient key file ${gnupg.root} is no file\n`],
  ]) {
    const args = ['backup', '--keys', keys, '--out', vault, '--recipient', recipient];
    const cli = spawnSync(BUN_RUNTIME, [KEYS_SCRIPT, ...args], { env: gnupg.env, encoding: 'utf8' });
    assert.equal(cli.status, 1);
    assert.equal(cli.stdout, '');
    if (typeof stderr === 'string') assert.equal(cli.stderr, stderr);
    else assert.match(cli.stderr, stderr);
    assert.deepEqual(fs.readdirSync(vault).sort(), ['.git', 'README.md']);
  }
});
test('backup refuses an --out that is no git checkout or that is inside another checkout, and writes nothing', () => {
  const root = scratch();
  const keys = keysFixture(root);
  const plain = path.join(root, 'plain');
  put(plain, 'README.md', '# Held-out keys vault\n');
  assert.throws(() => keyBackup.backup({ keys, out: plain }), {
    message: `${plain} is no git checkout; --out must be the root folder of the vault clone`,
  });
  assert.deepEqual(fs.readdirSync(plain), ['README.md']);
  const checkout = path.join(root, 'checkout');
  assert.equal(spawnSync('git', ['init', '-q', checkout]).status, 0);
  const inner = path.join(checkout, 'vault');
  put(inner, 'README.md', '# Held-out keys vault\n');
  const inside = `${inner} is inside the git checkout ${fs.realpathSync(checkout)}`;
  assert.throws(() => keyBackup.backup({ keys, out: inner }), {
    message: `${inside}; --out must be the root folder of the vault clone`,
  });
  assert.deepEqual(fs.readdirSync(inner), ['README.md']);
});
test('backup stops and writes nothing when a file changes between the manifest and the tar', () => {
  const gnupg = gpgHome('bench test');
  const { fingerprint, file } = gnupg.keys['bench test'];
  const keys = keysFixture(gnupg.root);
  const vault = vaultFor(gnupg, fingerprint);
  const beforeTar = () => fs.writeFileSync(path.join(keys, 'heldout/code-1-K1.patch'), 'diff --git a/y b/y\n');
  assert.throws(() => keyBackup.backup({ keys, out: vault, recipient: file, env: gnupg.env, beforeTar }), {
    message: 'the tar does not match MANIFEST.sha256: changed file heldout/code-1-K1.patch',
  });
  assert.deepEqual(fs.readdirSync(vault).sort(), ['.git', 'README.md']);
  // The tar check also finds a changed file whose name has spaces and quotes.
  const note = `heldout/note "it's" here.txt`;
  const changeNote = () => fs.writeFileSync(path.join(keys, note), 'another note\n');
  assert.throws(() => keyBackup.backup({ keys, out: vault, recipient: file, env: gnupg.env, beforeTar: changeNote }), {
    message: `the tar does not match MANIFEST.sha256: changed file ${note}`,
  });
  assert.deepEqual(fs.readdirSync(vault).sort(), ['.git', 'README.md']);
});
test('an encrypt-to line of the gpg options file adds no recipient to a backup', () => {
  const gnupg = gpgHome('bench test', 'bench other');
  const { fingerprint, file, subkey } = gnupg.keys['bench test'];
  fs.writeFileSync(path.join(gnupg.env.GNUPGHOME, 'gpg.conf'), `encrypt-to ${gnupg.keys['bench other'].fingerprint}\n`);
  // Without --no-options, the line adds the other key, so the check below can see a second recipient.
  const plain = path.join(gnupg.root, 'plain.gpg');
  gnupg.gpg(['--batch', '--trust-model', 'always', '--recipient-file', file, '--output', plain, '--encrypt', file]);
  assert.deepEqual(recipientsOf(gnupg, plain).sort(), [subkey, gnupg.keys['bench other'].subkey].sort());
  const archive = keyBackup.backup({
    keys: keysFixture(gnupg.root),
    out: vaultFor(gnupg, fingerprint),
    recipient: file,
    env: gnupg.env,
  });
  assert.deepEqual(recipientsOf(gnupg, archive), [subkey]);
});
test('keys check passes for a folder that matches escape-draw.md and names each field that differs', async () => {
  const root = scratch();
  const keys = keysFixture(root);
  const cases = path.join(root, 'cases');
  const hash = (text) => createHash('sha256').update(text).digest('hex');
  const source = hash(fs.readFileSync(path.join(keys, 'escape-draw-source.json')));
  const frozen = hash(escapes.frozenJson(readJson(path.join(keys, 'escape-draw.json')).frozen));
  const manifest = (snapshot, record) =>
    `# Escape draw\n\n## Frozen\n\n- Source snapshot SHA-256: ${snapshot}\n` +
    `- Restricted frozen record SHA-256: ${record}\n`;
  put(cases, 'escape-draw.md', manifest(source, frozen));
  const passed = 'check: Source snapshot SHA-256 and Restricted frozen record SHA-256 match escape-draw.md\n';
  assert.equal(await keyBackup.main(['check', '--keys', keys, '--cases', cases]), passed);
  // Outcomes are no part of the frozen hash, so a record with outcomes still passes.
  put(keys, 'escape-draw.json', escapes.frozenJson({ frozen: { version: 1, units: [] }, outcomes: [{ unit: 'u1' }] }));
  assert.equal(keyBackup.check({ keys, cases }), passed);
  put(cases, 'escape-draw.md', manifest('0'.repeat(64), frozen));
  assert.throws(() => keyBackup.check({ keys, cases }), {
    message: 'the keys folder differs from escape-draw.md in: Source snapshot SHA-256',
  });
  put(cases, 'escape-draw.md', manifest(source, frozen));
  put(keys, 'escape-draw.json', escapes.frozenJson({ frozen: { version: 2, units: [] }, outcomes: [] }));
  assert.throws(() => keyBackup.check({ keys, cases }), {
    message: 'the keys folder differs from escape-draw.md in: Restricted frozen record SHA-256',
  });
  fs.rmSync(path.join(keys, 'escape-draw-source.json'));
  assert.throws(() => keyBackup.check({ keys, cases }), {
    message:
      'the keys folder differs from escape-draw.md in: Source snapshot SHA-256, Restricted frozen record SHA-256',
  });
});
// A PATH whose first folder holds a fake `tar` that prints the version line of the BSD tar of macOS, and so has none of
// the GNU tar options of backup and restore.
function bsdTarEnv(root) {
  const bin = path.join(root, 'bsd-bin');
  put(bin, 'tar', '#!/bin/sh\necho "bsdtar 3.5.3 - libarchive 3.5.3 zlib/1.2.12 liblzma/5.0.5 bz2lib/1.0.8"\n');
  fs.chmodSync(path.join(bin, 'tar'), 0o755);
  return { ...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH}` };
}
const BSD_TAR_REFUSAL =
  'backup and restore need GNU tar, but the first line of tar --version is "bsdtar 3.5.3 - libarchive 3.5.3 zlib/1.2.12 liblzma/5.0.5 bz2lib/1.0.8"; put GNU tar first on PATH (on macOS: brew install gnu-tar, then put its gnubin folder first)';
test('backup and restore refuse a tar that is not GNU tar before they read or write anything', async () => {
  const root = scratch();
  const keys = keysFixture(root);
  const vault = path.join(root, 'vault');
  assert.equal(spawnSync('git', ['init', '-q', vault]).status, 0);
  put(vault, 'README.md', '# Held-out keys vault\n');
  const env = bsdTarEnv(root);
  assert.throws(() => keyBackup.backup({ keys, out: vault, env }), { message: BSD_TAR_REFUSAL });
  assert.deepEqual(fs.readdirSync(vault).sort(), ['.git', 'README.md']);
  const out = path.join(root, 'restored');
  const archive = path.join(root, 'keys.tar.gpg');
  await assert.rejects(keyBackup.restore({ archive, key: path.join(root, 'secret.asc'), out, env }), {
    message: BSD_TAR_REFUSAL,
  });
  assert.equal(fs.existsSync(out), false);
  const cli = spawnSync(BUN_RUNTIME, [path.join(SCRIPTS_DIR, 'keys.mjs'), 'backup', '--keys', keys, '--out', vault], {
    env,
    encoding: 'utf8',
  });
  assert.equal(cli.status, 1);
  assert.equal(cli.stderr, `keys.mjs: ${BSD_TAR_REFUSAL}\n`);
});
test('the GNU tar check accepts the GNU tar on PATH', () => {
  const version = spawnSync('tar', ['--version'], { encoding: 'utf8' });
  assert.match(version.stdout.split('\n')[0], /GNU tar/, 'the key backup tests need GNU tar on PATH');
  assert.doesNotThrow(() => keyBackup.requireGnuTar(process.env));
});
