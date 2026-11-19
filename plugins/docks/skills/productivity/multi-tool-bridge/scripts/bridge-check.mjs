#!/usr/bin/env node
// Audit the agent-doc layout before multi-tool-bridge writes (Step 2), and verify the
// bridge after the writes (Step 6). Both commands read only; they write no file. The
// meaning of each line and the reaction to it live in the SKILL.md of multi-tool-bridge.
//
// Usage (from any folder inside the repository, or from the project folder outside git):
//   node bridge-check.mjs audit
//   node bridge-check.mjs verify [--expect <path>]...
//
// Output lines:
//   audit   nine `EXISTS <entry>` or `MISSING <entry>` lines, in the order AGENTS.md,
//           CLAUDE.md (root), .claude/CLAUDE.md, CLAUDE.local.md, .agents/skills/,
//           .claude/skills/, .claude/agents/, .claude/rules/, .claude/rules/claude-code.md;
//           then one `legacy: <path>` line for each CLAUDE.md and .claude/CLAUDE.md, root
//           and nested, and one `personal: <path>` line for each CLAUDE.local.md.
//   verify  `BROKEN: <path>` for each `.claude/skills` entry that does not resolve;
//           `BROKEN: AGENTS.md missing`; `BROKEN: legacy CLAUDE.md still present: <path>`;
//           `BROKEN: <path> missing` for each --expect path that is no file;
//           `HANDOFF context-tree: unrouted node <path>`; `HANDOFF context-tree: dead route
//           <path>`; `VOLATILE time-relative|bare-count <file>:<line>` and
//           `VOLATILE line-anchor <file>:<line> (<path> exists)` for every AGENTS.md.
//           No output means the bridge is complete. `HANDOFF` and `VOLATILE` lines are
//           report items, not failures.
//   Either command prints `ERROR <part>: file listing failed (see the message above)` for a
//   listing that fails, and `ERROR <part>: cannot read <file>` for a file that is there but
//   cannot be read, in place of the lines of that part (`skills`, `legacy`, `personal`,
//   `routing`, or `volatile`). The cause is on stderr.
//   Paths are relative to the repository root, without a leading `./`. No listing enters
//   node_modules. The CLAUDE.local.md listing, and every listing outside git, walks the
//   folder, keeps only regular files, as `find -type f` does, and skips each .git,
//   node_modules, vendor, dist, build, out, target, and .next folder.
//
// Exit status: 2 after an ERROR line, 1 for a usage error, otherwise 0.
import fs from 'node:fs';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import {
  agentsDocs,
  BRIDGE_PRUNE,
  durableDocScan,
  EXCLUDE_NODE_MODULES,
  findEntries,
  guarded,
  isFile,
  isFolder,
  listFiles,
  repositoryRoot,
  routingGaps,
} from './agent-docs.mjs';

const USAGE = 'usage: bridge-check.mjs audit | verify [--expect <path>]...';
const CLAUDE_SKILLS = '.claude/skills';
// The Step 2 entries in output order: [label, path, kind of entry].
const AUDIT_ENTRIES = [
  ['AGENTS.md', 'AGENTS.md', 'file'],
  ['CLAUDE.md (root)', 'CLAUDE.md', 'file'],
  ['.claude/CLAUDE.md', '.claude/CLAUDE.md', 'file'],
  ['CLAUDE.local.md', 'CLAUDE.local.md', 'file'],
  ['.agents/skills/', '.agents/skills', 'folder'],
  ['.claude/skills/', '.claude/skills', 'folder'],
  ['.claude/agents/', '.claude/agents', 'folder'],
  ['.claude/rules/', '.claude/rules', 'folder'],
  ['.claude/rules/claude-code.md', '.claude/rules/claude-code.md', 'file'],
];

// The listing arguments of one repository: the root and whether git answers for it.
const listing = (repo) => ({ root: repo.root, prune: BRIDGE_PRUNE, inGit: repo.inGit });

// Every CLAUDE.md and .claude/CLAUDE.md, root and nested; gitignored build output is skipped. The
// Step 2 `find` commands listed regular files only; the node listings of Step 6 keep symlinks.
function legacyFiles(repo) {
  const pathspecs = [':(glob)**/CLAUDE.md', EXCLUDE_NODE_MODULES];
  return listFiles({ ...listing(repo), pathspecs, excludeStandard: true, filesOnly: true });
}

// CLAUDE.local.md is usually gitignored, so the walk finds it also inside git.
function personalFiles(repo) {
  return listFiles({ ...listing(repo), pathspecs: [':(glob)**/CLAUDE.local.md'], inGit: false, filesOnly: true });
}

function auditLines(repo) {
  const exists = (file, kind) => (kind === 'file' ? isFile(file) : isFolder(file));
  return [
    ...AUDIT_ENTRIES.map(([label, file, kind]) => `${exists(file, kind) ? 'EXISTS' : 'MISSING'} ${label}`),
    ...guarded('legacy:', () => legacyFiles(repo).map((file) => `legacy: ${file}`)),
    ...guarded('personal:', () => personalFiles(repo).map((file) => `personal: ${file}`)),
  ];
}

// Each `.claude/skills` entry that is a link or a folder must resolve.
function brokenSkillLines() {
  return findEntries(CLAUDE_SKILLS)
    .filter((entry) => entry.isSymbolicLink() || entry.isDirectory())
    .map((entry) => `${CLAUDE_SKILLS}/${entry.name}`)
    .filter((entry) => !fs.existsSync(entry))
    .map((entry) => `BROKEN: ${entry}`);
}

// The root routing belongs to context-tree; this skill only reports it.
function routingLines(repo) {
  const { unroutedNodes, deadRoutes } = routingGaps(listing(repo));
  return [
    ...unroutedNodes.map((node) => `HANDOFF context-tree: unrouted node ${node}`),
    ...deadRoutes.map((route) => `HANDOFF context-tree: dead route ${route}`),
  ];
}

function verifyLines(repo, expectedFiles) {
  return [
    ...guarded('skills:', brokenSkillLines),
    ...(isFile('AGENTS.md') ? [] : ['BROKEN: AGENTS.md missing']),
    ...guarded('legacy:', () => legacyFiles(repo).map((file) => `BROKEN: legacy CLAUDE.md still present: ${file}`)),
    ...expectedFiles.filter((file) => !isFile(file)).map((file) => `BROKEN: ${file} missing`),
    ...guarded('routing:', () => routingLines(repo)),
    ...guarded('volatile:', () =>
      durableDocScan(agentsDocs(listing(repo)), { findingLabel: 'VOLATILE', errorLabel: 'volatile:' }),
    ),
  ];
}

// The paths of `--expect <path>` pairs, or null when an argument is no such pair.
function parseExpectedFiles(args) {
  const files = [];
  for (let i = 0; i < args.length; i += 2) {
    if (args[i] !== '--expect' || !args[i + 1]) return null;
    files.push(args[i + 1]);
  }
  return files;
}

// { command, expectedFiles }, or null for a usage error.
function parseArguments(args) {
  const [command, ...rest] = args;
  if (command === 'audit' && rest.length === 0) return { command, expectedFiles: [] };
  const expectedFiles = command === 'verify' ? parseExpectedFiles(rest) : null;
  return expectedFiles === null ? null : { command, expectedFiles };
}

function main(args) {
  const parsed = parseArguments(args);
  if (parsed === null) {
    process.stderr.write(`${USAGE}\n`);
    return 1;
  }
  const gitRoot = repositoryRoot();
  const repo = { root: gitRoot ?? process.cwd(), inGit: gitRoot !== null };
  // Every check reads paths relative to the root, as the skill runs its blocks from there.
  process.chdir(repo.root);
  const lines = parsed.command === 'audit' ? auditLines(repo) : verifyLines(repo, parsed.expectedFiles);
  if (lines.length > 0) process.stdout.write(`${lines.join('\n')}\n`);
  return lines.some((line) => line.startsWith('ERROR')) ? 2 : 0;
}

// Run the CLI only when node started this file (through any symlink), not on import.
if (process.argv[1] && import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1])).href) {
  process.exitCode = main(process.argv.slice(2));
}
