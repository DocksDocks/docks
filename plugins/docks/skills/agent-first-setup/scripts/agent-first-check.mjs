#!/usr/bin/env node
// Detect the agent-doc state of a repository (Step 0 of agent-first-setup), run the
// agent-first check C1 to C10 (Step 3), and convert one Claude Code agent file to the omp
// form (the .claude cleanup of Step 2a). Each command reads only; none writes a file. The
// meaning of each line and the reaction to it live in the SKILL.md of agent-first-setup.
//
// Usage (from any folder inside the repository, or from the folder to check outside git):
//   node agent-first-check.mjs detect
//   node agent-first-check.mjs check
//   node agent-first-check.mjs convert-agent <path>
//
// Output lines:
//   detect  the repository root (the current folder outside git); then
//           `root AGENTS.md: present|missing`, `.agents/skills: present|missing`;
//           `legacy skills: .claude/skills` when that folder is there, one
//           `legacy agents: <path>` line for each `.claude/agents/*.md` file, one
//           `legacy settings: <path>` line for each `.claude/settings.json` and
//           `.claude/settings.local.json`; one `legacy: <path>` line for each CLAUDE.md
//           and .claude/CLAUDE.md, one `personal: <path>` line for each CLAUDE.local.md, one
//           `node: <path>` line for each AGENTS.md below the root (none under node_modules),
//           one `not-a-symlink: <path>` line for each `.claude/skills` entry that is no
//           symlink; then the lines of `pr-template.mjs detect` and `verify-skill.mjs detect`.
//           A listing that fails prints `ERROR <label>: file listing failed (see the message
//           above)` in place of the lines of that label.
//   check   one `FAIL C<n> ...` (a contract break), `FINDING C<n> ...` (a risk or cleanup
//           item a human judges), or `ERROR C<n> ...` (a check that could not run) line per
//           problem, in the order C1 to C10. A failed listing gives `ERROR C<n> file listing
//           failed (see the message above)`, and a file that is there but cannot be read gives
//           `ERROR C<n> cannot read <file>`. No output means every check passed.
//   convert-agent
//           the omp agent text of the Claude agent file at <path> (relative to the current
//           folder): `name`, `description`, and `tools` with omp tool names, then the body.
//           The dropped `model`, `color`, and `effort` fields are named on stderr. An agent
//           that has no exact omp form gives one `ERROR convert-agent <path>: <reason>; port
//           it by hand` line and no agent text.
//   Paths are relative to the repository root, without a leading `./`. Outside git, the
//   listings walk the folder and skip each .git, node_modules, and vendor folder.
//
// Exit status: 2 after an ERROR line (its cause is on stderr, or in the line for a refused
// agent), 1 for a usage error, otherwise 0.
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
  guarded,
  isFile,
  isFolder,
  legacyClaudeEntries,
  legacyClaudeLines,
  listFiles,
  nestedNodes,
  proseLines,
  readFolder,
  readText,
  repositoryRoot,
  routingGaps,
  SPACE,
  textLines,
} from './agent-docs.mjs';
import { prTemplateLines } from './pr-template.mjs';
import { verifySkillLines } from './verify-skill.mjs';

const USAGE = 'usage: agent-first-check.mjs detect | check | convert-agent <path>';
const ROOT_AGENTS = 'AGENTS.md';
const CLAUDE_SKILLS = '.claude/skills';
const VERIFY_SKILL = '.agents/skills/verify/SKILL.md';
const PR_NONE_LINE = 'pull-request template: none';
const PR_UNUSABLE_PREFIX = 'pull-request template: unusable ';
const VERIFY_UNVERIFIED_PREFIX = 'verify unverified: ';
const NODE_LINE_LIMIT = 500;
const STALE_TOLERANCE = /pointers (here )?name concepts/u;
const DESCRIPTION_BLOCK = new RegExp(`^description:[${SPACE}]*[>|][-+]?[${SPACE}]*$`, 'u');
const DESCRIPTION_VALUE = new RegExp(`^description:[${SPACE}]*["']?`, 'u');
// awk's NF counts fields split on spaces, tabs, and newlines only.
const AWK_FIELD = /[^ \t\n]/u;
const LEADING_SPACE = new RegExp(`^[${SPACE}]+`, 'u');
const EAGER_IMPORT = new RegExp(`(^|[${SPACE}(\\[])@[A-Za-z0-9._~/-]*[A-Za-z0-9_-]\\.[A-Za-z0-9]+`, 'u');

// `grep -E pattern file`: true when a line of `text` matches.
const anyLine = (text, pattern) => textLines(text).some((line) => pattern.test(line));

// `wc -l`: the number of newline bytes, or null when no file is there.
function lineCount(file) {
  const text = readText(file, 'latin1');
  return text === null ? null : text.split('\n').length - 1;
}

// The lines of `check` for each item; an item that cannot be read gives its ERROR line.
const eachGuarded = (check, items, lines) => items.flatMap((item) => guarded(check, () => lines(item)));

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
    ...guarded('legacy agents:', legacyClaudeLines),
    ...guarded('legacy:', () => list.tracked(':(glob)**/CLAUDE.md').map((file) => `legacy: ${file}`)),
    ...guarded('personal:', () => list.personal().map((file) => `personal: ${file}`)),
    ...guarded('node:', () => list.nodes().map((node) => `node: ${node}`)),
    ...guarded('not-a-symlink:', () =>
      findEntries(CLAUDE_SKILLS)
        .filter((entry) => !entry.isSymbolicLink())
        .map((entry) => `not-a-symlink: ${CLAUDE_SKILLS}/${entry.name}`),
    ),
    // The shell wrapper dropped the lines found before a failure and printed only its ERROR line.
    ...(pr.ok ? pr.lines : ['ERROR pull-request template check failed (see the message above)']),
    ...verifySkillLines().lines,
  ];
}

// --- check (Step 3) ---

function rootCommandLines() {
  if (!isFile(ROOT_AGENTS)) return ['FAIL C1 root AGENTS.md missing'];
  const text = asciiLower(readText(ROOT_AGENTS) ?? '');
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

const MIGRATE = 'migrate it with claude-md-migration';

// The C3 line for one CLAUDE.md, .claude/CLAUDE.md, or CLAUDE.local.md, as omp loads it: a
// .claude/CLAUDE.md wins over the AGENTS.md of the folder where a session starts, a CLAUDE.md
// next to an AGENTS.md is ignored, a CLAUDE.md alone at its depth loads, and omp does not load
// a CLAUDE.local.md.
function claudeFileLine(file) {
  const folder = path.posix.dirname(file);
  if (path.posix.basename(file) === 'CLAUDE.local.md') {
    return `FINDING C3 CLAUDE.local.md that omp does not load (personal file; the user decides: list it in contextFiles.extra, move it to ~/.omp/agent/AGENTS.md, or keep it): ${file}`;
  }
  if (path.posix.basename(folder) === '.claude') {
    return `FAIL C3 .claude/CLAUDE.md (omp loads it instead of the AGENTS.md of that folder when a session starts there; ${MIGRATE}): ${file}`;
  }
  if (isFile(folder === '.' ? ROOT_AGENTS : `${folder}/${ROOT_AGENTS}`)) {
    return `FAIL C3 CLAUDE.md next to an AGENTS.md (omp ignores it; ${MIGRATE}): ${file}`;
  }
  return `FINDING C3 CLAUDE.md without an AGENTS.md next to it (it loads, but AGENTS.md is the convention; ${MIGRATE}): ${file}`;
}

function claudeFileLines(list) {
  const files = new Set([...list.tracked(':(glob)**/CLAUDE.md'), ...list.personal()]);
  return eachGuarded('C3', [...files].sort(byteOrder), (file) => [claudeFileLine(file)]);
}

// The names that `.claude/skills/*` expands to: no dot names, in byte order, through a
// symlinked `.claude/skills` too.
function skillGlobNames() {
  return readFolder(CLAUDE_SKILLS)
    .map((entry) => entry.name)
    .filter((name) => !name.startsWith('.'))
    .sort(byteOrder);
}

// C4: each `.claude/skills` entry, each Claude agent file, and each Claude settings file is a
// legacy entry that the cleanup of agent-first-setup handles.
function legacyEntryLines() {
  const { agents, settings } = legacyClaudeEntries();
  const skills = skillGlobNames().map((name) => `${CLAUDE_SKILLS}/${name}`);
  return [...skills, ...agents, ...settings].map(
    (entry) => `FINDING C4 legacy .claude entry (agent-first-setup cleans it up): ${entry}`,
  );
}

function durableDocLines(list) {
  const docs = list.tracked(
    ':(glob)**/AGENTS.md',
    ':(glob)**/SKILL.md',
    ':(glob)**/skills/**/references/*.md',
    ':(exclude,glob)**/node_modules/**/AGENTS.md',
  );
  const staleLines = eachGuarded('C5', list.agentsDocs(), (file) =>
    STALE_TOLERANCE.test(asciiLower(readText(file) ?? '')) ? [] : [`FINDING C5 no stale-tolerance line: ${file}`],
  );
  const scanLines = durableDocScan(docs, { findingLabel: 'FINDING C5', errorLabel: 'C5' });
  // A file that cannot be read gives one ERROR line, not one for each part of C5.
  return [...scanLines, ...staleLines.filter((line) => !(line.startsWith('ERROR') && scanLines.includes(line)))];
}

// The start of a skill description: the first indented line of a block scalar (`>`, `|`,
// `>-`, `|-`), else the value after `description:` without an opening quote; null when the
// file has no description or no file is there.
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
  return eachGuarded('C6', list.tracked(':(glob)**/SKILL.md'), (skill) =>
    descriptionStart(readText(skill))?.startsWith('Use when')
      ? []
      : [`FAIL C6 description does not start with 'Use when': ${skill}`],
  );
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

// Where an import points: absolute, from the home folder, or from the file's folder.
function importTarget(importPath, file) {
  if (importPath.startsWith('/')) return importPath;
  if (importPath.startsWith('~/')) return `${process.env.HOME ?? ''}/${importPath.slice(2)}`;
  return `${path.posix.dirname(file)}/${importPath}`;
}

function eagerImportLine(file, number, importPath) {
  const target = importTarget(importPath, file);
  const at = `FINDING C7 eager import ${file}:${number}: @${importPath}`;
  if (!isFile(target)) return `${at} (no file at ${target})`;
  return `${at} (${target}, ${lineCount(target) ?? ''} lines, omp expands it when this file loads)`;
}

// omp expands each bare `@path` in an AGENTS.md into context every time that file loads.
function eagerImportLines(list) {
  return eachGuarded('C7', list.agentsDocs(), (file) =>
    proseLines(readText(file) ?? '').flatMap(([number, line]) =>
      eachGuarded('C7', eagerImports(line), (importPath) => [eagerImportLine(file, number, importPath)]),
    ),
  );
}

function nodeSizeLines(list) {
  return eachGuarded('C8', list.agentsDocs(), (file) => {
    const lines = lineCount(file);
    if (lines === null || lines <= NODE_LINE_LIMIT) return [];
    return [`FINDING C8 over the ${NODE_LINE_LIMIT}-line kit policy: ${file} (${lines} lines)`];
  });
}

// C9 from the verify Detect lines: the skill exists, and every command of it showed its
// expected result.
function verifySkillCheckLines() {
  const detect = verifySkillLines();
  if (detect.lines.includes('verify skill: missing')) {
    return [
      'FINDING C9 no .agents/skills/verify/SKILL.md (add it in Step 2b, or accept: the repo has no runnable surface)',
    ];
  }
  const lines = [];
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
    ...guarded('C1', rootCommandLines),
    ...guarded('C2', () => routingLines(list)),
    ...guarded('C3', () => claudeFileLines(list)),
    ...guarded('C4', legacyEntryLines),
    ...guarded('C5', () => durableDocLines(list)),
    ...guarded('C6', () => descriptionLines(list)),
    ...guarded('C7', () => eagerImportLines(list)),
    ...guarded('C8', () => nodeSizeLines(list)),
    ...verifySkillCheckLines(),
    ...prTemplateCheckLines(repo),
  ];
}

// --- convert-agent (the .claude cleanup of Step 2a) ---

const FRONTMATTER_FENCE = '---';
const AGENT_FIELD = /^([A-Za-z_][A-Za-z0-9_-]*):(.*)$/u;
const CONTINUATION = /^([ \t]|-[ \t]|$)/u;
const QUOTED_VALUE = /^(["'])(.*)\1$/u;
// The Claude agent fields that convert: the first three stay, the others are dropped, because
// omp would misread them (a Claude model alias fails in omp).
const KEPT_AGENT_FIELDS = ['name', 'description', 'tools'];
const DROPPED_AGENT_FIELDS = ['model', 'color', 'effort'];
// Each Claude Code tool that has one omp tool for the same work.
const OMP_TOOL_NAMES = new Map([
  ['Read', 'read'],
  ['Grep', 'grep'],
  ['Glob', 'glob'],
  ['Bash', 'bash'],
  ['Edit', 'edit'],
  ['Write', 'write'],
  ['WebSearch', 'web_search'],
]);

// A Claude agent that has no exact omp form; the user ports it by hand.
class Refusal extends Error {}

// The frontmatter fields of an agent file, each as its field line and its continuation lines
// (indented lines, list items, and blank lines), and the body after the closing fence.
function agentParts(text) {
  const lines = text.replace(/\r\n/gu, '\n').split('\n');
  const close = lines.indexOf(FRONTMATTER_FENCE, 1);
  if (lines[0] !== FRONTMATTER_FENCE || close === -1) throw new Refusal('no frontmatter');
  const fields = new Map();
  let current = null;
  for (const line of lines.slice(1, close)) {
    const field = AGENT_FIELD.exec(line);
    if (field !== null) {
      current = [line];
      fields.set(field[1], current);
    } else if (current !== null && CONTINUATION.test(line)) current.push(line);
    else if (!line.startsWith('#')) throw new Refusal(`frontmatter line "${line}" is no field`);
  }
  // A blank line between two fields belongs to neither.
  for (const fieldLines of fields.values()) while (fieldLines.at(-1)?.trim() === '') fieldLines.pop();
  return { fields, body: lines.slice(close + 1).join('\n') };
}

// Split a tool list at each comma outside parentheses, so `Bash(a, b)` stays one tool.
function splitTools(text) {
  const tools = [''];
  let depth = 0;
  for (const char of text) {
    if (char === '(') depth += 1;
    else if (char === ')') depth = Math.max(0, depth - 1);
    if (char === ',' && depth === 0) tools.push('');
    else tools[tools.length - 1] += char;
  }
  return tools;
}

// The tool names of a `tools` field: a comma list, a flow list `[a, b]`, or a block list of
// `- a` items.
function toolNames(fieldLines) {
  const value = fieldLines[0].replace(AGENT_FIELD, '$2').trim();
  const rest = fieldLines.slice(1).map((line) => line.trim());
  let tools;
  if (value === '') tools = rest.map((line) => line.replace(/^-[ \t]*/u, ''));
  else {
    const list = [value, ...rest].join(' ');
    tools = splitTools(list.startsWith('[') && list.endsWith(']') ? list.slice(1, -1) : list);
  }
  return tools.map((tool) => tool.trim().replace(QUOTED_VALUE, '$2')).filter((tool) => tool !== '');
}

// The omp tool name of one Claude tool, or a Refusal.
function ompToolName(tool) {
  if (tool.includes('(')) throw new Refusal(`tool ${tool} has a pattern`);
  const name = OMP_TOOL_NAMES.get(tool);
  if (name === undefined) throw new Refusal(`tool ${tool} has no omp name`);
  return name;
}

// The omp agent text of one Claude agent, and the names of the dropped fields. Only the
// simple case converts, because omp adds its MCP, extension, and custom tools to every
// explicit tools list, and a Claude denial has no omp form.
function ompAgent(text) {
  const { fields, body } = agentParts(text);
  if (fields.has('disallowedTools')) throw new Refusal('disallowedTools has no omp form');
  for (const name of fields.keys()) {
    if (!KEPT_AGENT_FIELDS.includes(name) && !DROPPED_AGENT_FIELDS.includes(name)) {
      throw new Refusal(`field ${name} has no omp form`);
    }
  }
  for (const name of ['name', 'description']) if (!fields.has(name)) throw new Refusal(`no ${name} field`);
  const tools = fields.has('tools') ? toolNames(fields.get('tools')) : [];
  if (tools.length === 0) throw new Refusal('no tools list');
  const header = [
    FRONTMATTER_FENCE,
    ...fields.get('name'),
    ...fields.get('description'),
    `tools: ${tools.map(ompToolName).join(', ')}`,
    FRONTMATTER_FENCE,
  ];
  return { agent: `${header.join('\n')}\n${body}`, dropped: DROPPED_AGENT_FIELDS.filter((name) => fields.has(name)) };
}

// Print the omp agent text of one Claude agent file on stdout; write no file.
function convertAgent(file) {
  const errorLine = (reason) => {
    process.stdout.write(`ERROR convert-agent ${file}: ${reason}\n`);
    return 2;
  };
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (error) {
    process.stderr.write(`agent-first-check: cannot read ${file} (${error.code ?? error.message})\n`);
    return errorLine('cannot read the file');
  }
  let result;
  try {
    result = ompAgent(text);
  } catch (error) {
    if (!(error instanceof Refusal)) throw error;
    return errorLine(`${error.message}; port it by hand`);
  }
  if (result.dropped.length > 0) {
    process.stderr.write(
      `convert-agent: dropped ${result.dropped.join(', ')} of ${file}; omp does not read these Claude values (a Claude model alias fails in omp)\n`,
    );
  }
  process.stdout.write(result.agent);
  return 0;
}

function main(args) {
  const [command, ...rest] = args;
  if (command === 'convert-agent' && rest.length === 1) return convertAgent(rest[0]);
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
