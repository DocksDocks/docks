// The host-neutral core of the context-tree-nudge omp extension (`context-tree-nudge.ts`):
// after a file edit inside a context-tree node, name the node, so that the agent can refresh
// it. A node is a folder below the repository root that holds an AGENTS.md. The core uses
// git and the file system only: no model call. Its git calls are asynchronous, so a check
// does not hold the event loop of omp.
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

// Each git call stops after this time.
const GIT_TIMEOUT_MS = 5000;

// The root of the git repository that holds `dir`. Outside a repository `dir` itself counts as
// the root, so that no folder is a node below it.
function repositoryRoot(dir) {
  return new Promise((resolve) => {
    execFile(
      'git',
      ['rev-parse', '--show-toplevel'],
      { cwd: dir, encoding: 'utf8', timeout: GIT_TIMEOUT_MS },
      (error, stdout) => resolve(error ? dir : stdout.trim()),
    );
  });
}

// The nearest folder of `file` that exists, with symbolic links resolved, so that it compares
// with the root that git gives. A deleted file or a moved file can have a folder that does not
// exist now. The walk stops at the file system root at the latest, because that root exists.
function existingFolder(file) {
  let dir = path.dirname(file);
  while (!fs.existsSync(dir)) dir = path.dirname(dir);
  return fs.realpathSync(dir);
}

// The nearest node of `dir`, as a path relative to `root`, or null when the nearest AGENTS.md
// is the one at the root: the nudge names sub-folder nodes only. The walk runs only in folders
// below `root`, so it also stops when `dir` is not below `root`.
function nearestNode(root, dir) {
  for (let current = dir; current.startsWith(`${root}${path.sep}`); current = path.dirname(current)) {
    if (fs.existsSync(path.join(current, 'AGENTS.md'))) return path.relative(root, current);
  }
  return null;
}

// The nudge text for the absolute paths of the edited files, or null when no file is inside a
// node. Each path finds its own repository root, because an agent can edit files in another
// repository than its session folder. The text has one sentence for each root, and each
// sentence lists its nodes once, in the order of the paths.
export async function nudgeText(files) {
  const nodesByRoot = new Map();
  for (const file of files) {
    const dir = existingFolder(file);
    const root = await repositoryRoot(dir);
    const node = nearestNode(root, dir);
    if (node === null) continue;
    const nodes = nodesByRoot.get(root) ?? [];
    if (!nodes.includes(node)) nodes.push(node);
    nodesByRoot.set(root, nodes);
  }
  if (nodesByRoot.size === 0) return null;
  return [...nodesByRoot.values()]
    .map(
      (nodes) =>
        `Edited files inside context-tree node(s): ${nodes.join(', ')}. If conventions in a listed folder changed, ` +
        'run context-tree refresh on it (no-op when nothing semantic changed).',
    )
    .join('\n');
}
