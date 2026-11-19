#!/usr/bin/env node
// Shared parts of the agent-doc checks of agent-first-setup (agent-first-check.mjs) and
// multi-tool-bridge (bridge-check.mjs): the repository root, the file listing, the routing
// rows of the root AGENTS.md, the nested AGENTS.md nodes, and the durable-doc scan. The
// canonical file is in agent-first-setup; multi-tool-bridge ships a byte-identical copy,
// because a skill folder cannot import from another skill folder.
//
// Each function ports one part of a shell block that the two skills ran before. A port keeps
// the semantics of that block: git pathspecs, POSIX `[[:space:]]`, the leftmost-longest
// matches of awk, and byte order where the block sorted with `sort` or a glob.
//
// This module has no CLI.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

// The folder names that each skill skips when it walks a folder outside git.
export const AGENT_FIRST_PRUNE = ['.git', 'node_modules', 'vendor'];
export const BRIDGE_PRUNE = ['.git', 'node_modules', 'vendor', 'dist', 'build', 'out', 'target', '.next'];

// POSIX `[[:space:]]` in the C locale; JS `\s` would also match Unicode spaces.
export const SPACE = ' \\t\\n\\v\\f\\r';
const ROOT_AGENTS = 'AGENTS.md';
// A package under node_modules is not part of this repository.
export const EXCLUDE_NODE_MODULES = ':(exclude,glob)**/node_modules/**';
const FENCE = new RegExp(`^[${SPACE}]*\`\`\``, 'u');
export const CODE_SPAN = /`[^`]*`/gu;

// awk's tolower and grep -i in the C locale change only ASCII letters; String#toLowerCase
// alone would also fold letters such as the Kelvin sign into `k`.
export const asciiLower = (text) => text.replace(/[A-Z]+/gu, (letters) => letters.toLowerCase());

// `sort` and shell globs in the C locale compare bytes; String#localeCompare and the
// default sort compare UTF-16 code units, which differ above the Basic Multilingual Plane.
export function byteOrder(a, b) {
  return Buffer.compare(Buffer.from(a), Buffer.from(b));
}

// fs.statSync follows symlinks, as `test -e`, `test -f`, and `test -d` do.
function statOrNull(file) {
  try {
    return fs.statSync(file);
  } catch {
    return null;
  }
}

export function isFile(file) {
  return statOrNull(file)?.isFile() ?? false;
}

export function isFolder(file) {
  return statOrNull(file)?.isDirectory() ?? false;
}

// `test -L`: a failed lstat, for example below a file, means no symlink.
export function isSymlink(file) {
  try {
    return fs.lstatSync(file).isSymbolicLink();
  } catch {
    return false;
  }
}

// The entries of `folder` as `find <folder> -mindepth 1 -maxdepth 1` lists them, dot names
// included, sorted by byte order of the name. None when `folder` is a symlink, because find
// does not follow a symlink given as its starting point, or when it cannot be listed.
export function findEntries(folder) {
  if (isSymlink(folder)) return [];
  try {
    return fs.readdirSync(folder, { withFileTypes: true }).sort((a, b) => byteOrder(a.name, b.name));
  } catch {
    return [];
  }
}

// The text of a file, or null when it cannot be read; grep and awk then fail the same way.
// `latin1` gives one character per byte, as awk and grep read in the C locale.
export function readTextOrNull(file, encoding = 'utf8') {
  try {
    return fs.readFileSync(file, encoding);
  } catch {
    return null;
  }
}

// The records that awk and grep read: one per `\n`, and a last line without `\n` counts too.
export function textLines(text) {
  const lines = text.split('\n');
  if (lines.at(-1) === '') lines.pop();
  return lines;
}

// The lines outside fenced blocks as [lineNumber, line], numbered from 1 as awk's NR.
// A line that opens or closes a fence is no prose line.
export function proseLines(text) {
  const prose = [];
  let inFence = false;
  textLines(text).forEach((line, index) => {
    if (FENCE.test(line)) inFence = !inFence;
    else if (!inFence) prose.push([index + 1, line]);
  });
  return prose;
}

// The output of `git rev-parse --show-toplevel`, or null outside git. The skill blocks sent
// git's message to /dev/null here, because outside git is an expected answer, not an error.
export function repositoryRoot() {
  const result = spawnSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' });
  if (result.error || result.status !== 0) return null;
  return result.stdout.replace(/\n+$/u, '');
}

function gitFiles(root, pathspecs, excludeStandard) {
  const args = ['ls-files', '-co', ...(excludeStandard ? ['--exclude-standard'] : []), '--', ...pathspecs];
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  if (result.error) {
    process.stderr.write(`agent-docs: cannot run git ls-files (${result.error.message}); install git and retry\n`);
    return [];
  }
  process.stderr.write(result.stderr);
  return result.stdout === '' ? [] : textLines(result.stdout);
}

// A git glob pattern as a regular expression over the whole path. Supports `**/`, `/**/`,
// `/**`, `*`, and `?`, which are all the forms the two skills use; any other character
// matches itself.
function globPattern(glob) {
  let source = '';
  for (let i = 0; i < glob.length; i += 1) {
    if (glob.startsWith('**/', i) && (i === 0 || glob[i - 1] === '/')) {
      source += '(?:.*/)?';
      i += 2;
    } else if (glob.startsWith('/**', i) && i + 3 === glob.length) {
      source += '/.*';
      i += 2;
    } else if (glob[i] === '*') source += '[^/]*';
    else if (glob[i] === '?') source += '[^/]';
    else source += glob[i].replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  }
  return new RegExp(`^${source}$`, 'u');
}

// A `:(glob)` or `:(exclude,glob)` pathspec as { exclude, pattern }.
function parsePathspec(pathspec) {
  const parts = /^:\(([^)]*)\)(.*)$/u.exec(pathspec);
  const magic = new Set(parts?.[1].split(','));
  if (!parts || !magic.has('glob') || ![...magic].every((word) => word === 'glob' || word === 'exclude')) {
    throw new Error(`agent-docs: the tree walk supports only :(glob) and :(exclude,glob) pathspecs, not ${pathspec}`);
  }
  return { exclude: magic.has('exclude'), pattern: globPattern(parts[2]) };
}

// Every entry below `folder` that is no folder, as a path relative to `root`. A folder named
// in `prune` is skipped at any depth, as `find ... -prune` does; a symlink to a folder is not
// followed, as find does not follow it.
function walkEntries(root, folder, prune, found) {
  let entries;
  try {
    entries = fs.readdirSync(path.join(root, folder), { withFileTypes: true });
  } catch (error) {
    process.stderr.write(
      `agent-docs: cannot list the folder ${folder || '.'} (${error.code ?? error.message}); its files are left out; make it readable and run the check again\n`,
    );
    return;
  }
  for (const entry of entries) {
    const relative = folder === '' ? entry.name : `${folder}/${entry.name}`;
    if (!entry.isDirectory()) found.push(relative);
    else if (!prune.includes(entry.name)) walkEntries(root, relative, prune, found);
  }
}

function walkFiles(root, pathspecs, prune) {
  const specs = pathspecs.map(parsePathspec);
  const includes = specs.filter((spec) => !spec.exclude);
  const excludes = specs.filter((spec) => spec.exclude);
  const found = [];
  walkEntries(root, '', prune, found);
  return found
    .filter((file) => includes.some((spec) => spec.pattern.test(file)))
    .filter((file) => !excludes.some((spec) => spec.pattern.test(file)))
    .sort(byteOrder);
}

// The files that match git `pathspecs`, as paths relative to `root`. Inside git, the lines of
// `git ls-files -co [--exclude-standard] -- <pathspecs>` run in `root`; outside git, a walk
// of `root` that skips each folder named in `prune`, sorted by byte order.
export function listFiles({ root, pathspecs, excludeStandard = false, prune, inGit }) {
  return inGit ? gitFiles(root, pathspecs, excludeStandard) : walkFiles(root, pathspecs, prune);
}

// Every AGENTS.md, the root one included. One under node_modules belongs to a package, not
// to this repository, so it is never a node.
export function agentsDocs({ root, prune, inGit }) {
  const pathspecs = [`:(glob)**/${ROOT_AGENTS}`, EXCLUDE_NODE_MODULES];
  return listFiles({ root, pathspecs, excludeStandard: true, prune, inGit });
}

// Every AGENTS.md below the root: the nodes that the root table must route.
export function nestedNodes({ root, prune, inGit }) {
  return agentsDocs({ root, prune, inGit }).filter((file) => file !== ROOT_AGENTS);
}

const TABLE_LINE = new RegExp(`^[${SPACE}]*\\|`, 'u');
const CELL_SPACE = new RegExp(`^[${SPACE}]+|[${SPACE}]+$`, 'gu');
const ROUTE_CELL = /^`@?[^` ]*AGENTS\.md`$/u;

// The routes of a root AGENTS.md: each table line whose first cell is `<dir>/AGENTS.md` in
// backticks, with a leading `@` and then a leading `./` stripped. Unique, in byte order.
export function routingRows(agentsMdText) {
  const routes = new Set();
  for (const line of textLines(agentsMdText)) {
    if (!TABLE_LINE.test(line)) continue;
    const cell = (line.split('|')[1] ?? '').replace(CELL_SPACE, '');
    if (ROUTE_CELL.test(cell)) routes.add(cell.replaceAll('`', '').replace(/^@/u, '').replace(/^\.\//u, ''));
  }
  return [...routes].sort(byteOrder);
}

// Join without path.join, which would turn `a/../b` into `b`: the shell resolves each part,
// so `test -f a/../b` fails when `a` is missing.
const fromRoot = (root, file) => (path.isAbsolute(file) ? file : `${root}/${file}`);

// The routing gaps of the repository at `root`: each node that no row of the root AGENTS.md
// routes, and each route whose file does not exist.
export function routingGaps({ root, prune, inGit }) {
  const rootText = readTextOrNull(fromRoot(root, ROOT_AGENTS));
  const routes = rootText === null ? [] : routingRows(rootText);
  return {
    unroutedNodes: nestedNodes({ root, prune, inGit }).filter((node) => !routes.includes(node)),
    deadRoutes: routes.filter((route) => !isFile(fromRoot(root, route))),
  };
}

// awk reads bytes, so a curly quote is three characters here, and `[^”]` excludes each
// of the three bytes of `”`, as it does in awk.
const latin1 = (text) => Buffer.from(text, 'utf8').toString('latin1');
const URL_TEXT = /https?:\/\/[^ )>]*/gu;
const QUOTED = new RegExp(`"[^"]*"|${latin1('“')}[^${latin1('”')}]*${latin1('”')}`, 'gu');
const STEP_NUMBER = /(phase|step|tier)[ -]?[0-9]+/gu;
const LINE_ANCHOR = /[A-Za-z0-9_./-]+\.[A-Za-z]+:[0-9]+/u;
const TIME_RELATIVE = /(^|[^a-z])(currently|as of|now has|recently)([^a-z]|$)/u;
const BARE_COUNT = /(^|[^0-9.])[0-9]+ (skills|nodes|files|tests|tables|tabs|commands|agents|plugins|rules)([^a-z]|$)/u;

// The `path:line` anchors of one line, each without its `:line`.
function lineAnchors(text) {
  const anchors = [];
  let rest = text;
  for (let match = LINE_ANCHOR.exec(rest); match !== null; match = LINE_ANCHOR.exec(rest)) {
    anchors.push(match[0].replace(/:[0-9]+$/u, ''));
    rest = rest.slice(match.index + match[0].length);
  }
  return anchors;
}

// A line anchor counts only when its path exists from the repository root (the current
// folder) or from the folder of the file, so a fictional example path passes.
function anchorExists(anchor, file) {
  return fs.existsSync(anchor) || fs.existsSync(`${path.posix.dirname(file)}/${anchor}`);
}

function scanLine(file, number, line, label) {
  const withoutUrls = line.replace(URL_TEXT, '');
  const prose = asciiLower(withoutUrls.replace(CODE_SPAN, '').replace(QUOTED, '')).replace(STEP_NUMBER, '');
  const findings = lineAnchors(withoutUrls)
    .filter((anchor) => anchorExists(anchor, file))
    .map((anchor) => `${label} line-anchor ${file}:${number} (${anchor} exists)`);
  if (TIME_RELATIVE.test(prose)) findings.push(`${label} time-relative ${file}:${number}`);
  if (!prose.includes('verify:') && BARE_COUNT.test(prose)) findings.push(`${label} bare-count ${file}:${number}`);
  return findings;
}

// The durable-doc scan: time-relative phrases, bare counts, and line anchors whose path
// exists. Fenced blocks and URLs are skipped everywhere; code spans and quoted text are
// skipped for the time and count rules only, so a line anchor in backticks still counts.
// `findingLabel` starts each line: `FINDING C5` for agent-first-setup, `VOLATILE` for
// multi-tool-bridge. Paths are relative to the current folder.
export function durableDocScan(files, { findingLabel }) {
  const findings = [];
  for (const file of files) {
    const text = readTextOrNull(file, 'latin1');
    if (text === null) {
      process.stderr.write(
        `agent-docs: cannot read ${file}; the durable-doc scan skips it; make it readable and run the check again\n`,
      );
      continue;
    }
    for (const [number, line] of proseLines(text)) findings.push(...scanLine(file, number, line, findingLabel));
  }
  return findings;
}
