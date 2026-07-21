import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { cloneFixture } from '../lib/fixture-clone-pool.mjs';

const ownedRoots = new Set();

function createRoot(label) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `fixture-clone-pool-${label}-`));
  ownedRoots.add(root);
  return root;
}

function makeWritable(target) {
  if (!fs.existsSync(target)) return;
  const stat = fs.lstatSync(target);
  if (stat.isSymbolicLink()) return;
  if (stat.isDirectory()) {
    fs.chmodSync(target, 0o700);
    for (const entry of fs.readdirSync(target)) makeWritable(path.join(target, entry));
  } else {
    fs.chmodSync(target, 0o600);
  }
}

function cleanupRoots() {
  for (const root of ownedRoots) {
    makeWritable(root);
    fs.rmSync(root, { recursive: true, force: true });
  }
  ownedRoots.clear();
}

test.afterEach(cleanupRoots);
test.after(cleanupRoots);

test('synchronous clones do not share writes with siblings or the immutable template', () => {
  const sourceRoot = createRoot('independence-source');
  const firstRoot = createRoot('independence-first');
  const secondRoot = createRoot('independence-second');
  const relativePaths = ['nested/template.txt', 'nested/directory/sibling.txt'];
  for (const relativePath of relativePaths) {
    const sourcePath = path.join(sourceRoot, relativePath);
    fs.mkdirSync(path.dirname(sourcePath), { recursive: true });
    fs.writeFileSync(sourcePath, `${relativePath}\n`);
    fs.chmodSync(sourcePath, 0o400);
  }

  cloneFixture({ sourceRoot, destinationRoot: firstRoot, relativePaths });
  cloneFixture({ sourceRoot, destinationRoot: secondRoot, relativePaths });

  const firstTemplate = path.join(firstRoot, relativePaths[0]);
  fs.writeFileSync(firstTemplate, 'first clone\n');
  assert.equal(fs.readFileSync(path.join(secondRoot, relativePaths[0]), 'utf8'), `${relativePaths[0]}\n`);
  assert.equal(fs.readFileSync(path.join(sourceRoot, relativePaths[0]), 'utf8'), `${relativePaths[0]}\n`);
  assert.equal(fs.readFileSync(path.join(firstRoot, relativePaths[1]), 'utf8'), `${relativePaths[1]}\n`);
  assert.equal(fs.readFileSync(path.join(secondRoot, relativePaths[1]), 'utf8'), `${relativePaths[1]}\n`);
});

test('cloneFixture creates nested directories and normalizes writable modes', () => {
  const sourceRoot = createRoot('modes-source');
  const destinationRoot = createRoot('modes-destination');
  const relativePaths = ['one/two/alpha.txt', 'one/beta.txt'];
  for (const relativePath of relativePaths) {
    const sourcePath = path.join(sourceRoot, relativePath);
    fs.mkdirSync(path.dirname(sourcePath), { recursive: true });
    fs.writeFileSync(sourcePath, `${relativePath}\n`);
    fs.chmodSync(sourcePath, 0o400);
  }
  fs.chmodSync(path.join(sourceRoot, 'one', 'two'), 0o500);
  fs.chmodSync(path.join(sourceRoot, 'one'), 0o500);

  cloneFixture({ sourceRoot, destinationRoot, relativePaths });

  assert.equal(fs.statSync(destinationRoot).mode & 0o777, 0o700);
  assert.equal(fs.statSync(path.join(destinationRoot, 'one')).mode & 0o777, 0o700);
  assert.equal(fs.statSync(path.join(destinationRoot, 'one', 'two')).mode & 0o777, 0o700);
  for (const relativePath of relativePaths) {
    const destinationPath = path.join(destinationRoot, relativePath);
    assert.equal(fs.readFileSync(destinationPath, 'utf8'), `${relativePath}\n`);
    assert.equal(fs.statSync(destinationPath).mode & 0o777, 0o600);
  }
});

test('cloneFixture rejects empty, absolute, and traversal relative paths', () => {
  const sourceRoot = createRoot('invalid-path-source');
  fs.writeFileSync(path.join(sourceRoot, 'file.txt'), 'source\n');
  const invalidPaths = [
    '',
    '/absolute.txt',
    'nested/../escape.txt',
    '../escape.txt',
    'nested\\..\\escape.txt',
    'C:\\absolute.txt',
  ];

  for (const relativePath of invalidPaths) {
    const destinationRoot = createRoot('invalid-path-destination');
    assert.throws(
      () => cloneFixture({ sourceRoot, destinationRoot, relativePaths: [relativePath] }),
      /relative path|absolute|traversal/i,
      relativePath || '<empty>',
    );
  }
});

test('cloneFixture rejects missing sources, source symlinks, and nonempty destinations', () => {
  const sourceRoot = createRoot('invalid-source');
  const outsideRoot = createRoot('invalid-source-outside');
  fs.writeFileSync(path.join(sourceRoot, 'file.txt'), 'source\n');
  fs.writeFileSync(path.join(outsideRoot, 'outside.txt'), 'outside\n');
  fs.symlinkSync(path.join(outsideRoot, 'outside.txt'), path.join(sourceRoot, 'file-link.txt'));
  fs.symlinkSync(outsideRoot, path.join(sourceRoot, 'directory-link'));

  assert.throws(
    () =>
      cloneFixture({
        sourceRoot: path.join(sourceRoot, 'missing-root'),
        destinationRoot: createRoot('missing-root-destination'),
        relativePaths: ['file.txt'],
      }),
    /source root|missing|exist/i,
  );
  assert.throws(
    () =>
      cloneFixture({
        sourceRoot,
        destinationRoot: createRoot('missing-file-destination'),
        relativePaths: ['missing.txt'],
      }),
    /source|missing|exist/i,
  );
  assert.throws(
    () =>
      cloneFixture({
        sourceRoot,
        destinationRoot: createRoot('file-link-destination'),
        relativePaths: ['file-link.txt'],
      }),
    /symbolic link/i,
  );
  assert.throws(
    () =>
      cloneFixture({
        sourceRoot,
        destinationRoot: createRoot('directory-link-destination'),
        relativePaths: ['directory-link/outside.txt'],
      }),
    /symbolic link/i,
  );

  const nonemptyDestination = createRoot('nonempty-destination');
  fs.writeFileSync(path.join(nonemptyDestination, 'sentinel'), 'keep\n');
  assert.throws(
    () => cloneFixture({ sourceRoot, destinationRoot: nonemptyDestination, relativePaths: ['file.txt'] }),
    /destination.*empty/i,
  );
});
