#!/usr/bin/env node
// Detect the agent-doc state of a repository (Step 0 of agent-first-setup) and run the
// agent-first check C1 to C10 (Step 3). Both commands read only; they write no file. The
// meaning of each line and the reaction to it live in the SKILL.md of agent-first-setup.
//
// Usage (from any folder inside the repository, or from the folder to check outside git):
//   node agent-first-check.mjs detect
//   node agent-first-check.mjs check
//
// Output lines:
//   detect  the repository root (the current folder outside git); then
//           `root AGENTS.md: present|missing`, `.agents/skills: present|missing`,
//           `.claude/skills: present|missing`; one `legacy: <path>` line for each CLAUDE.md
//           and .claude/CLAUDE.md, one `personal: <path>` line for each CLAUDE.local.md, one
//           `node: <path>` line for each AGENTS.md below the root (none under node_modules),
//           one `not-a-symlink: <path>` line for each `.claude/skills` entry that is no
//           symlink; then the lines of `pr-template.mjs detect` and `verify-skill.mjs detect`.
//   check   one `FAIL C<n> ...` (a contract break), `FINDING C<n> ...` (a risk or cleanup
//           item a human judges), or `ERROR C<n> ...` (a check that could not run) line per
//           problem, in the order C1 to C10. No output means every check passed.
//   Paths are relative to the repository root, without a leading `./`. Outside git, the
//   listings walk the folder and skip each .git, node_modules, and vendor folder.
//
// Exit status: 2 after an ERROR line (its cause is on stderr), 1 for a usage error,
// otherwise 0.
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import {
  AGENT_FIRST_PRUNE,
  agentsDocs,
  asciiLower,
  byteOrder,
  CODE_SPAN,
  durableDocScan,
  findEntries,
  isFile,
  isFolder,
  isSymlink,
  listFiles,
  nestedNodes,
  proseLines,
  readTextOrNull,
  repositoryRoot,
  routingGaps,
  SPACE,
  textLines,
} from './agent-docs.mjs';
import { prTemplateLines } from './pr-template.mjs';
import { verifySkillLines } from './verify-skill.mjs';

const USAGE = 'usage: agent-first-check.mjs detect | check';
const ROOT_AGENTS = 'AGENTS.md';
const CLAUDE_SKILLS = '.claude/skills';
const VERIFY_SKILL = '.agents/skills/verify/SKILL.md';
const PR_NONE_LINE = 'pull-request template: none';
const PR_UNUSABLE_PREFIX = 'pull-request template: unusable ';
const VERIFY_UNVERIFIED_PREFIX = 'verify unverified: ';
// Any of these files at the root makes Claude read the CLAUDE.md files instead of AGENTS.md.
const ROOT_CLAUDE_FILES = ['CLAUDE.md', '.claude/CLAUDE.md', 'CLAUDE.local.md'];
const NODE_LINE_LIMIT = 500;
const IMPORTS_AGENTS = '@AGENTS\\.md';
const IMPORTS_PARENT_AGENTS = '@\\.\\./AGENTS\\.md';
const NON_SPACE = new RegExp(`[^${SPACE}]`, 'u');
const STALE_TOLERANCE = /pointers (here )?name concepts/u;
const DESCRIPTION_BLOCK = new RegExp(`^description:[${SPACE}]*[>|][-+]?[${SPACE}]*$`, 'u');
const DESCRIPTION_VALUE = new RegExp(`^description:[${SPACE}]*["']?`, 'u');
// awk's NF counts fields split on spaces, tabs, and newlines only.
const AWK_FIELD = /[^ \t\n]/u;
const LEADING_SPACE = new RegExp(`^[${SPACE}]+`, 'u');
const EAGER_IMPORT = new RegExp(`(^|[${SPACE}(\\[])@[A-Za-z0-9._~/-]*[A-Za-z0-9_-]\\.[A-Za-z0-9]+`, 'u');

// `grep -E pattern file`: true when a line of `text` matches.
const anyLine = (text, pattern) => textLines(text).some((line) => pattern.test(line));

// `grep -qE '(^|[[:space:]])<import>([[:space:]]|$)'`; unreadable text (null) has no import.
function hasImport(text, importPattern) {
  return text !== null && anyLine(text, new RegExp(`(^|[${SPACE}])${importPattern}([${SPACE}]|$)`, 'u'));
}

const fileImports = (file, importPattern) => hasImport(readTextOrNull(file), importPattern);

// A symlink whose target is named AGENTS.md delivers that file.
function linksToAgents(file) {
  return isSymlink(file) && path.basename(fs.readlinkSync(file)) === ROOT_AGENTS;
}

// `wc -l`: the number of newline bytes, or null when the file cannot be read.
function lineCount(file) {
  const text = readTextOrNull(file, 'latin1');
  return text === null ? null : text.split('\n').length - 1;
}

// The listings of one repository: the root and whether git answers for it.
function repositoryListings(repo) {
  const listing = { root: repo.root, prune: AGENT_FIRST_PRUNE, inGit: repo.inGit };
  return {
    tracked: (...pathspecs) => listFiles({ ...listing, pathspecs, excludeStandard: true }),
    // CLAUDE.local.md is usually gitignored, so this listing keeps ignored files.
    personal: () => listFiles({ ...listing, pathspecs: [':(glob)**/CLAUDE.local.md'] }),
    agentsDocs: () => agentsDocs(listing),
    nodes: () => nestedNodes(listing),
    routingGaps: () => routingGaps(listing),
  };
}

// --- detect (Step 0) ---

const presence = (label, present) => `${label}: ${present ? 'present' : 'missing'}`;

function detectLines(repo) {
  const list = repositoryListings(repo);
  const pr = prTemplateLines(repo.inGit ? repo.root : null);
  return [
    presence('root AGENTS.md', isFile(ROOT_AGENTS)),
    presence('.agents/skills', isFolder('.agents/skills')),
    presence('.claude/skills', isFolder(CLAUDE_SKILLS)),
    ...list.tracked(':(glob)**/CLAUDE.md').map((file) => `legacy: ${file}`),
    ...list.personal().map((file) => `personal: ${file}`),
    ...list.nodes().map((node) => `node: ${node}`),
    ...findEntries(CLAUDE_SKILLS)
      .filter((entry) => !entry.isSymbolicLink())
      .map((entry) => `not-a-symlink: ${CLAUDE_SKILLS}/${entry.name}`),
    // The shell wrapper dropped the lines found before a failure and printed only its ERROR line.
    ...(pr.ok ? pr.lines : ['ERROR pull-request template check failed (see the message above)']),
    ...verifySkillLines().lines,
  ];
}

// --- check (Step 3) ---

function rootCommandLines() {
  if (!isFile(ROOT_AGENTS)) return ['FAIL C1 root AGENTS.md missing'];
  const text = asciiLower(readTextOrNull(ROOT_AGENTS) ?? '');
  // `grep -qiw <kind>`: the kind as a whole word, in any ASCII letter case.
  const names = (kind) => anyLine(text, new RegExp(`(^|[^a-z0-9_])${kind}([^a-z0-9_]|$)`, 'u'));
  return ['build', 'test', 'lint']
    .filter((kind) => !names(kind))
    .map(
      (kind) =>
        `FINDING C1 root AGENTS.md names no ${kind} command (add it, or accept: the repo has none or one gate covers it)`,
    );
}

function routingLines(list) {
  const { unroutedNodes, deadRoutes } = list.routingGaps();
  return [
    ...unroutedNodes.map((node) => `FAIL C2 node not routed from root: ${node}`),
    ...deadRoutes.map((route) => `FAIL C2 dead route in root table: ${route}`),
  ];
}

// The C3 line for one CLAUDE.md, .claude/CLAUDE.md, or CLAUDE.local.md. A file that imports
// AGENTS.md still delivers it, so an import stub is a cleanup item, and a file without the
// import makes Claude read it instead of AGENTS.md.
function claudeFileLine(file) {
  const inClaudeFolder = file === '.claude/CLAUDE.md' || file.endsWith('/.claude/CLAUDE.md');
  const importPattern = inClaudeFolder ? IMPORTS_PARENT_AGENTS : IMPORTS_AGENTS;
  if (linksToAgents(file)) return `FINDING C3 redundant symlink to AGENTS.md (content still loads; cleanup): ${file}`;
  const text = readTextOrNull(file);
  if (!hasImport(text, importPattern)) {
    return file.endsWith('CLAUDE.local.md')
      ? `FINDING C3 CLAUDE.local.md without an @AGENTS.md import makes Claude read it instead of AGENTS.md (personal file; user decides): ${file}`
      : `FAIL C3 CLAUDE.md without an @AGENTS.md import makes Claude read it instead of AGENTS.md: ${file}`;
  }
  const importOnly = new RegExp(`^[${SPACE}]*${importPattern}[${SPACE}]*$`, 'u');
  const otherLine = (line) => !importOnly.test(line) && NON_SPACE.test(line);
  if (textLines(text).some(otherLine)) {
    return `FINDING C3 CLAUDE.md imports AGENTS.md and holds other lines (move them, then delete the file): ${file}`;
  }
  return `FINDING C3 redundant import stub (AGENTS.md still loads; cleanup): ${file}`;
}

function claudeFileLines(list) {
  const files = new Set([...list.tracked(':(glob)**/CLAUDE.md'), ...list.personal()]);
  return [...files].sort(byteOrder).map(claudeFileLine);
}

// While the root has a CLAUDE.md file, Claude does not load a nested AGENTS.md by itself;
// only a sibling import stub or symlink delivers it.
function hiddenNodeLines(list) {
  if (!ROOT_CLAUDE_FILES.some((file) => fs.existsSync(file))) return [];
  const delivered = (folder) =>
    linksToAgents(`${folder}/CLAUDE.md`) ||
    fileImports(`${folder}/CLAUDE.md`, IMPORTS_AGENTS) ||
    fileImports(`${folder}/.claude/CLAUDE.md`, IMPORTS_PARENT_AGENTS);
  return list
    .nodes()
    .map((node) => ({ node, folder: node.slice(0, -`/${ROOT_AGENTS}`.length) }))
    .filter(({ folder }) => !delivered(folder))
    .map(
      ({ node, folder }) =>
        `FAIL C3 node hidden from Claude (the root has a CLAUDE.md file and ${folder} has no import stub): ${node}`,
    );
}

// The names that `.claude/skills/*` expands to: no dot names, in byte order, through a
// symlinked `.claude/skills` too.
function skillGlobNames() {
  try {
    return fs
      .readdirSync(CLAUDE_SKILLS)
      .filter((name) => !name.startsWith('.'))
      .sort(byteOrder);
  } catch {
    return [];
  }
}

function skillLinkLines(entry) {
  if (!isSymlink(entry)) return [`FAIL C4 not a symlink: ${entry}`];
  const lines = [];
  if (!fs.readlinkSync(entry).startsWith('../../.agents/skills/')) {
    lines.push(`FAIL C4 target outside .agents/skills: ${entry}`);
  }
  if (!isFile(`${entry}/SKILL.md`)) lines.push(`FAIL C4 broken symlink: ${entry}`);
  return lines;
}

function durableDocLines(list) {
  const docs = list.tracked(
    ':(glob)**/AGENTS.md',
    ':(glob)**/SKILL.md',
    ':(glob)**/skills/**/references/*.md',
    ':(exclude,glob)**/node_modules/**/AGENTS.md',
  );
  const staleLines = list
    .agentsDocs()
    .filter((file) => !STALE_TOLERANCE.test(asciiLower(readTextOrNull(file) ?? '')))
    .map((file) => `FINDING C5 no stale-tolerance line: ${file}`);
  return [...durableDocScan(docs, { findingLabel: 'FINDING C5' }), ...staleLines];
}

// The start of a skill description: the first indented line of a block scalar (`>`, `|`,
// `>-`, `|-`), else the value after `description:` without an opening quote; null when the
// file has no description or cannot be read.
function descriptionStart(text) {
  let inBlock = false;
  for (const line of textLines(text ?? '')) {
    if (DESCRIPTION_BLOCK.test(line)) inBlock = true;
    else if (inBlock && AWK_FIELD.test(line)) return line.replace(LEADING_SPACE, '');
    else if (line.startsWith('description:')) return line.replace(DESCRIPTION_VALUE, '');
  }
  return null;
}

function descriptionLines(list) {
  return list
    .tracked(':(glob)**/SKILL.md')
    .filter((skill) => !descriptionStart(readTextOrNull(skill))?.startsWith('Use when'))
    .map((skill) => `FAIL C6 description does not start with 'Use when': ${skill}`);
}

// The bare `@path` imports of one line outside code spans, each without its `@`.
function eagerImports(line) {
  const imports = [];
  let rest = line.replace(CODE_SPAN, '');
  for (let match = EAGER_IMPORT.exec(rest); match !== null; match = EAGER_IMPORT.exec(rest)) {
    imports.push(match[0].replace(/^[^@]*@/u, ''));
    rest = rest.slice(match.index + match[0].length);
  }
  return imports;
}

// Where Claude looks for an import: absolute, from the home folder, or from the file's folder.
function importTarget(importPath, file) {
  if (importPath.startsWith('/')) return importPath;
  if (importPath.startsWith('~/')) return `${process.env.HOME ?? ''}/${importPath.slice(2)}`;
  return `${path.posix.dirname(file)}/${importPath}`;
}

function eagerImportLine(file, number, importPath) {
  const target = importTarget(importPath, file);
  const at = `FINDING C7 eager import ${file}:${number}: @${importPath}`;
  if (!isFile(target)) return `${at} (no file at ${target})`;
  return `${at} (${target}, ${lineCount(target) ?? ''} lines, loads with this file)`;
}

// Claude expands each bare `@path` in an AGENTS.md into context every time that file loads.
function eagerImportLines(list) {
  return list
    .agentsDocs()
    .flatMap((file) =>
      proseLines(readTextOrNull(file) ?? '').flatMap(([number, line]) =>
        eagerImports(line).map((importPath) => eagerImportLine(file, number, importPath)),
      ),
    );
}

function nodeSizeLines(list) {
  return list
    .agentsDocs()
    .map((file) => ({ file, lines: lineCount(file) }))
    .filter(({ lines }) => lines !== null && lines > NODE_LINE_LIMIT)
    .map(({ file, lines }) => `FINDING C8 over the ${NODE_LINE_LIMIT}-line kit policy: ${file} (${lines} lines)`);
}

// C9 from the verify Detect lines: the skill exists, `.claude/skills/verify` resolves to it,
// and every command of it showed its expected result.
function verifySkillCheckLines() {
  const detect = verifySkillLines();
  if (detect.lines.includes('verify skill: missing')) {
    return [
      'FINDING C9 no .agents/skills/verify/SKILL.md (add it in Step 2b, or accept: the repo has no runnable surface)',
    ];
  }
  const lines = [];
  if (!detect.lines.includes('verify link: present')) {
    lines.push('FAIL C9 .claude/skills/verify does not resolve to .agents/skills/verify');
  }
  for (const line of detect.lines.filter((l) => l.startsWith(VERIFY_UNVERIFIED_PREFIX))) {
    const mark = line.slice(VERIFY_UNVERIFIED_PREFIX.length);
    lines.push(`FAIL C9 unverified command (rerun every command in Step 2b): ${VERIFY_SKILL}:${mark}`);
  }
  if (!detect.ok) lines.push(`ERROR C9 cannot read ${VERIFY_SKILL}`);
  return lines;
}

// An error is not a missing template, so it gets its own line.
function prTemplateCheckLines(repo) {
  const pr = prTemplateLines(repo.inGit ? repo.root : null);
  if (!pr.ok) return ['ERROR C10 pull-request template check failed (see the message above)'];
  const lines = pr.lines
    .filter((line) => line.startsWith(PR_UNUSABLE_PREFIX))
    .map((line) => `FINDING C10 unusable pull-request template: ${line.slice(PR_UNUSABLE_PREFIX.length)}`);
  if (pr.lines.some((line) => line.includes(PR_NONE_LINE))) {
    lines.push('FINDING C10 no usable pull-request template (add it in Step 2c, or accept: the repository wants none)');
  }
  return lines;
}

function checkLines(repo) {
  const list = repositoryListings(repo);
  return [
    ...rootCommandLines(),
    ...routingLines(list),
    ...claudeFileLines(list),
    ...hiddenNodeLines(list),
    ...skillGlobNames().flatMap((name) => skillLinkLines(`${CLAUDE_SKILLS}/${name}`)),
    ...durableDocLines(list),
    ...descriptionLines(list),
    ...eagerImportLines(list),
    ...nodeSizeLines(list),
    ...verifySkillCheckLines(),
    ...prTemplateCheckLines(repo),
  ];
}

function main(args) {
  const [command, ...rest] = args;
  if (!['detect', 'check'].includes(command) || rest.length > 0) {
    process.stderr.write(`${USAGE}\n`);
    return 1;
  }
  const gitRoot = repositoryRoot();
  const repo = { root: gitRoot ?? process.cwd(), inGit: gitRoot !== null };
  // Every check reads paths relative to the root, as the skill runs its blocks from there.
  process.chdir(repo.root);
  const lines = command === 'detect' ? [repo.root, ...detectLines(repo)] : checkLines(repo);
  if (lines.length > 0) process.stdout.write(`${lines.join('\n')}\n`);
  return lines.some((line) => line.startsWith('ERROR')) ? 2 : 0;
}

// Run the CLI only when node started this file (through any symlink), not on import.
if (process.argv[1] && import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1])).href) {
  process.exitCode = main(process.argv.slice(2));
}
