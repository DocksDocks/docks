import fs from 'node:fs';
import path from 'node:path';

const DIRECTORY_MODE = 0o700;
const FILE_MODE = 0o600;
const UNSUPPORTED_CLONE_ERROR_CODES = new Set(['EINVAL', 'ENOSYS', 'ENOTSUP', 'ENOTTY', 'EOPNOTSUPP', 'EXDEV']);

function errorWithContext(message, cause) {
  return new Error(message, cause === undefined ? undefined : { cause });
}

function validateRoot(root, label) {
  if (typeof root !== 'string' || root.length === 0) throw new TypeError(`${label} must be a nonempty path`);
  return path.resolve(root);
}

function requireDirectory(root, label) {
  let stat;
  try {
    stat = fs.lstatSync(root);
  } catch (error) {
    if (error?.code === 'ENOENT') throw errorWithContext(`${label} does not exist: ${root}`, error);
    throw error;
  }
  if (stat.isSymbolicLink()) throw new Error(`${label} must not be a symbolic link: ${root}`);
  if (!stat.isDirectory()) throw new Error(`${label} must be a directory: ${root}`);
}

function validateRelativePath(relativePath) {
  if (typeof relativePath !== 'string' || relativePath.length === 0)
    throw new TypeError('fixture relative path must be a nonempty string');
  if (path.isAbsolute(relativePath) || path.win32.isAbsolute(relativePath))
    throw new Error(`fixture relative path must not be absolute: ${relativePath}`);

  const rawSegments = relativePath.split(/[\\/]+/u);
  if (rawSegments.includes('..')) throw new Error(`fixture relative path must not contain traversal: ${relativePath}`);
  const segments = rawSegments.filter((segment) => segment !== '' && segment !== '.');
  if (segments.length === 0) throw new Error(`fixture relative path must not be empty: ${relativePath}`);
  return segments;
}

function validateRelativePaths(relativePaths) {
  if (!Array.isArray(relativePaths)) throw new TypeError('relativePaths must be an array');
  return relativePaths.map(validateRelativePath);
}

function requireEmptyDestination(destinationRoot) {
  requireDirectory(destinationRoot, 'fixture destination root');
  if (fs.readdirSync(destinationRoot).length !== 0)
    throw new Error(`fixture destination root must be empty: ${destinationRoot}`);
}

function requireSourceComponents(sourceRoot, segments, relativePath) {
  let current = sourceRoot;
  for (const segment of segments) {
    current = path.join(current, segment);
    let stat;
    try {
      stat = fs.lstatSync(current);
    } catch (error) {
      if (error?.code === 'ENOENT') throw errorWithContext(`fixture source does not exist: ${relativePath}`, error);
      throw error;
    }
    if (stat.isSymbolicLink()) throw new Error(`fixture source must not contain a symbolic link: ${relativePath}`);
  }
}

function collectSourceEntries(sourcePath, destinationSegments, entries) {
  const stat = fs.lstatSync(sourcePath);
  if (stat.isSymbolicLink())
    throw new Error(`fixture source must not contain a symbolic link: ${destinationSegments.join('/')}`);
  if (stat.isDirectory()) {
    entries.push({ type: 'directory', sourcePath, destinationSegments });
    for (const name of fs.readdirSync(sourcePath).sort())
      collectSourceEntries(path.join(sourcePath, name), [...destinationSegments, name], entries);
    return;
  }
  if (!stat.isFile()) throw new Error(`fixture source must be a regular file: ${destinationSegments.join('/')}`);
  entries.push({ type: 'file', sourcePath, destinationSegments });
}

function ensureDestinationDirectory(destinationRoot, segments) {
  let current = destinationRoot;
  for (const segment of segments) {
    current = path.join(current, segment);
    if (!fs.existsSync(current)) fs.mkdirSync(current, { mode: DIRECTORY_MODE });
    const stat = fs.lstatSync(current);
    if (stat.isSymbolicLink() || !stat.isDirectory())
      throw new Error(`fixture destination path must remain a directory: ${current}`);
    fs.chmodSync(current, DIRECTORY_MODE);
  }
  return current;
}

function cloneFile(sourcePath, destinationPath) {
  try {
    fs.copyFileSync(sourcePath, destinationPath, fs.constants.COPYFILE_FICLONE);
  } catch (error) {
    if (!UNSUPPORTED_CLONE_ERROR_CODES.has(error?.code)) throw error;
    fs.rmSync(destinationPath, { force: true });
    fs.copyFileSync(sourcePath, destinationPath);
  }
  fs.chmodSync(destinationPath, FILE_MODE);
}

export function cloneFixture({ sourceRoot, destinationRoot, relativePaths }) {
  const absoluteSourceRoot = validateRoot(sourceRoot, 'fixture source root');
  const absoluteDestinationRoot = validateRoot(destinationRoot, 'fixture destination root');
  const normalizedPaths = validateRelativePaths(relativePaths);

  requireDirectory(absoluteSourceRoot, 'fixture source root');
  requireEmptyDestination(absoluteDestinationRoot);

  const entries = [];
  for (const segments of normalizedPaths) {
    const relativePath = segments.join('/');
    requireSourceComponents(absoluteSourceRoot, segments, relativePath);
    collectSourceEntries(path.join(absoluteSourceRoot, ...segments), segments, entries);
  }

  fs.chmodSync(absoluteDestinationRoot, DIRECTORY_MODE);
  for (const entry of entries) {
    if (entry.type === 'directory') {
      ensureDestinationDirectory(absoluteDestinationRoot, entry.destinationSegments);
      continue;
    }
    const parentSegments = entry.destinationSegments.slice(0, -1);
    const destinationDirectory = ensureDestinationDirectory(absoluteDestinationRoot, parentSegments);
    cloneFile(entry.sourcePath, path.join(destinationDirectory, entry.destinationSegments.at(-1)));
  }
}
