import fs from 'node:fs';
import path from 'node:path';
import { jcs, normalizeLogicalPaths, sha256 } from './current-codec.mjs';
import { assertClosed, COMMIT, fail, HASH } from './plan-state.mjs';

export function repositoryRoot(repo) {
  if (typeof repo !== 'string' || repo === '') fail('repository path must be non-empty');
  let root;
  try {
    root = fs.realpathSync(repo);
  } catch {
    fail('repository path does not exist');
  }
  if (!fs.statSync(root).isDirectory()) fail('repository path must be a directory');
  return root;
}

export function gitDirectories(repo) {
  const root = repositoryRoot(repo);
  const dotGit = path.join(root, '.git');
  let gitDir;
  let stat;
  try {
    stat = fs.lstatSync(dotGit);
  } catch {
    fail('repository has no .git metadata');
  }
  if (stat.isDirectory()) {
    gitDir = dotGit;
  } else if (stat.isFile()) {
    const match = /^gitdir: (.+)\s*$/.exec(fs.readFileSync(dotGit, 'utf8'));
    if (!match) fail('repository .git indirection is malformed');
    gitDir = path.resolve(root, match[1]);
  } else {
    fail('repository .git metadata is invalid');
  }
  gitDir = fs.realpathSync(gitDir);
  let commonDir = gitDir;
  const commonPath = path.join(gitDir, 'commondir');
  if (fs.existsSync(commonPath))
    commonDir = fs.realpathSync(path.resolve(gitDir, fs.readFileSync(commonPath, 'utf8').trim()));
  return { commonDir, gitDir, root };
}

function readPackedRef(commonDir, ref) {
  const packed = path.join(commonDir, 'packed-refs');
  if (!fs.existsSync(packed)) return null;
  for (const line of fs.readFileSync(packed, 'utf8').split('\n')) {
    if (line.startsWith('#') || line.startsWith('^') || line === '') continue;
    const [commit, name] = line.split(' ');
    if (name === ref && COMMIT.test(commit)) return commit;
  }
  return null;
}

function readHead(repo) {
  const { commonDir, gitDir } = gitDirectories(repo);
  const head = fs.readFileSync(path.join(gitDir, 'HEAD'), 'utf8').trim();
  if (COMMIT.test(head)) return head;
  const match = /^ref: (refs\/.+)$/.exec(head);
  if (!match) fail('repository HEAD is not a full commit identity');
  for (const base of [gitDir, commonDir]) {
    const loose = path.join(base, ...match[1].split('/'));
    if (fs.existsSync(loose)) {
      const commit = fs.readFileSync(loose, 'utf8').trim();
      if (!COMMIT.test(commit)) fail('repository HEAD ref is malformed');
      return commit;
    }
  }
  const packed = readPackedRef(commonDir, match[1]);
  if (packed !== null) return packed;
  fail('repository HEAD ref is unresolved');
}

function assertNoSymlink(root, logical) {
  let cursor = root;
  for (const segment of logical.split('/')) {
    cursor = path.join(cursor, segment);
    try {
      if (fs.lstatSync(cursor).isSymbolicLink()) fail(`path ${logical} contains a symlink alias`);
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return;
      throw error;
    }
  }
}

function snapshotPath(root, logical) {
  assertNoSymlink(root, logical);
  const absolute = path.join(root, ...logical.split('/'));
  let stat;
  try {
    stat = fs.lstatSync(absolute);
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return { path: logical, state: 'missing', kind: null, mode: null, sha256: null };
    }
    throw error;
  }
  if (stat.isSymbolicLink()) fail(`path ${logical} is a symlink alias`);
  if (!stat.isFile()) fail(`path ${logical} must be a regular file or missing`);
  return {
    path: logical,
    state: 'file',
    kind: 'file',
    mode: stat.mode & 0o7777,
    sha256: sha256(fs.readFileSync(absolute)),
  };
}

function manifestDigest(sourceBase, paths) {
  return sha256(jcs({ schema: 1, source_base: sourceBase, paths }));
}

export function createAffectedPathManifest({ repo, paths, sourceBase }) {
  const root = repositoryRoot(repo);
  if (typeof sourceBase !== 'string' || !COMMIT.test(sourceBase) || readHead(root) !== sourceBase) {
    fail('source_base must be the exact current repository commit identity');
  }
  const logicalPaths = normalizeLogicalPaths(paths, 'affected path');
  const entries = logicalPaths.map((logical) => snapshotPath(root, logical));
  return {
    schema: 1,
    source_base: sourceBase,
    source_sha256: manifestDigest(sourceBase, entries),
    paths: entries,
  };
}

export function validateAffectedPathManifest(manifest, { repo, paths, sourceBase } = {}) {
  assertClosed(manifest, ['schema', 'source_base', 'source_sha256', 'paths'], 'affected-path manifest');
  if (manifest.schema !== 1) fail('affected-path manifest schema must be 1');
  if (!COMMIT.test(manifest.source_base) || !HASH.test(manifest.source_sha256))
    fail('manifest source/base digest is invalid');
  if (!Array.isArray(manifest.paths) || manifest.paths.length === 0) fail('manifest paths must be non-empty');
  const logical = normalizeLogicalPaths(
    manifest.paths.map((entry) => entry.path),
    'manifest path',
  );
  if (jcs(logical) !== jcs(manifest.paths.map((entry) => entry.path)))
    fail('manifest paths must use canonical ordering');
  for (const entry of manifest.paths) {
    assertClosed(entry, ['path', 'state', 'kind', 'mode', 'sha256'], 'manifest path entry');
    if (!['file', 'missing'].includes(entry.state)) fail('manifest path state is invalid');
    if (entry.state === 'file') {
      if (entry.kind !== 'file' || !Number.isInteger(entry.mode) || entry.mode < 0 || entry.mode > 0o7777) {
        fail('manifest file kind or mode is invalid');
      }
      if (!HASH.test(entry.sha256)) fail('manifest file content digest is invalid');
    } else if (entry.kind !== null || entry.mode !== null || entry.sha256 !== null) {
      fail('missing manifest path cannot have kind, mode, or content digest');
    }
  }
  if (manifestDigest(manifest.source_base, manifest.paths) !== manifest.source_sha256)
    fail('manifest source_sha256 mismatch');
  if (sourceBase !== undefined && sourceBase !== manifest.source_base) fail('manifest source_base identity mismatch');
  if (paths !== undefined && jcs(normalizeLogicalPaths(paths, 'affected path')) !== jcs(logical)) {
    fail('manifest affected path set mismatch');
  }
  if (repo !== undefined) {
    const current = createAffectedPathManifest({ repo, paths: logical, sourceBase: manifest.source_base });
    if (jcs(current) !== jcs(manifest)) {
      const bound = new Map(manifest.paths.map((entry) => [entry.path, jcs(entry)]));
      const diverged = current.paths.filter((entry) => jcs(entry) !== bound.get(entry.path));
      fail(
        diverged.length === 0
          ? 'affected-path manifest does not match repository bytes'
          : `affected-path manifest does not match repository bytes at ${diverged.map((entry) => entry.path).join(', ')}`,
      );
    }
  }
  return manifest;
}

function indexDigest(repo) {
  const { gitDir } = gitDirectories(repo);
  const index = path.join(gitDir, 'index');
  return fs.existsSync(index) ? sha256(fs.readFileSync(index)) : sha256('missing-index');
}

export function captureRepositoryPreimage({ repo, ownedPaths }) {
  const root = repositoryRoot(repo);
  const logical = normalizeLogicalPaths(ownedPaths, 'owned path');
  const entries = logical.map((item) => snapshotPath(root, item));
  return {
    schema: 1,
    repository: root,
    head: readHead(root),
    index_sha256: indexDigest(root),
    owned_paths: entries,
    owned_paths_sha256: sha256(jcs(entries)),
  };
}
export function validateRepositoryPreimage(value) {
  assertClosed(
    value,
    ['schema', 'repository', 'head', 'index_sha256', 'owned_paths', 'owned_paths_sha256'],
    'repository preimage',
  );
  if (
    value.schema !== 1 ||
    !COMMIT.test(value.head) ||
    !HASH.test(value.index_sha256) ||
    !HASH.test(value.owned_paths_sha256)
  ) {
    fail('repository preimage has invalid schema, HEAD, or digest');
  }
  if (!Array.isArray(value.owned_paths)) fail('repository preimage owned paths must be an array');
  const logical = normalizeLogicalPaths(
    value.owned_paths.map((entry) => entry.path),
    'owned path',
  );
  if (jcs(logical) !== jcs(value.owned_paths.map((entry) => entry.path)))
    fail('repository preimage paths are not canonical');
  for (const entry of value.owned_paths) {
    assertClosed(entry, ['path', 'state', 'kind', 'mode', 'sha256'], 'owned path preimage');
    if (!['file', 'missing'].includes(entry.state)) fail('owned path state is invalid');
    if (entry.state === 'file') {
      if (entry.kind !== 'file' || !Number.isInteger(entry.mode) || entry.mode < 0 || entry.mode > 0o7777) {
        fail('owned file kind or mode is invalid');
      }
      if (!HASH.test(entry.sha256)) fail('owned file content digest is invalid');
    } else if (entry.kind !== null || entry.mode !== null || entry.sha256 !== null) {
      fail('missing owned path cannot have kind, mode, or content digest');
    }
  }
  if (sha256(jcs(value.owned_paths)) !== value.owned_paths_sha256) fail('owned path preimage digest mismatch');
}
