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

// A node name made only of these characters goes into the text as it is. Any other name goes in as
// a JSON string, so that a newline or an instruction in a folder name cannot start a new line of
// the added context.
const PLAIN_NAME = /^[A-Za-z0-9._/@+-]+$/u;

const nodeName = (name) => (PLAIN_NAME.test(name) ? name : JSON.stringify(name));

// The nudge text for the absolute paths of the edited files, or null when no file is inside a
// node. Each path finds its own repository root, because an agent can edit files in another
// repository than its session folder `cwd`. A node in the repository of `cwd` is named relative
// to its root; a node in another repository is named by its absolute path, so that the agent
// refreshes the right folder. The text has one line for each root, in the order of the first
// path of each root, and each line lists its nodes once, in the order of the paths. The root of
// each folder is found once for each call, so that many files in one folder start one git call.
export async function nudgeText(files, cwd) {
  const roots = new Map();
  const rootOf = (dir) => {
    if (!roots.has(dir)) roots.set(dir, repositoryRoot(dir));
    return roots.get(dir);
  };
  let sessionRoot;
  const nodesByRoot = new Map();
  for (const file of files) {
    const dir = existingFolder(file);
    const root = await rootOf(dir);
    const node = nearestNode(root, dir);
    if (node === null) continue;
    sessionRoot ??= await rootOf(fs.realpathSync(cwd));
    const name = nodeName(root === sessionRoot ? node : path.join(root, node));
    const nodes = nodesByRoot.get(root) ?? [];
    if (!nodes.includes(name)) nodes.push(name);
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
