#!/usr/bin/env node
// prepare.mjs builds review benchmark workspaces and the reviewer agent files of the arms.
//
//   node prepare.mjs case --case <case.json> --arms <B0,C3,...> --runs <k> --out <ws>
//   node prepare.mjs agents --baseline-ref <git-ref> --model <selector> [--runtime omp|claude]
//                           (--out <ws> | --baseline-dir <dir>)
//   node prepare.mjs clean
//
// ../SKILL.md describes the case schema, the arms, and the workspace layout.
// The script uses Node built-ins and git only, so it runs on Node and on Bun.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const SCRIPT_PATH = fs.realpathSync(fileURLToPath(import.meta.url));
const SKILL_DIR = path.dirname(path.dirname(SCRIPT_PATH));
const PLUGIN_PATH = 'plugins/plan-lifecycle';
const PLUGIN_ROOT_TOKEN = `\${CLAUDE_PLUGIN_ROOT}`;
const BASELINE_MARKER = '.review-bench-ref';
const RUNTIME_AGENT_DIRS = { omp: '.omp/agents', claude: '.claude/agents' };
const MAX_OUTPUT = 512 * 1024 * 1024;

export const LENSES = ['correctness', 'spec-and-tests', 'text-and-safety'];

// Arms per case kind. `side` selects the released (baseline) or the working-tree (candidate) agent.
export const ARMS = {
  code: {
    B0: { side: 'baseline', mode: 'full', reviewers: ['full'] },
    B1: { side: 'baseline', mode: 'panel', reviewers: LENSES },
    C1: { side: 'candidate', mode: 'full', reviewers: ['full'] },
    C3: { side: 'candidate', mode: 'panel', reviewers: LENSES },
  },
  'code-delta': {
    B0: { side: 'baseline', mode: 'full', reviewers: ['full'] },
    Cd: { side: 'candidate', mode: 'delta', reviewers: ['delta'] },
  },
  plan: {
    P0: { side: 'baseline', mode: 'full', reviewers: ['plan'] },
    P1: { side: 'candidate', mode: 'full', reviewers: ['plan'] },
  },
  'plan-delta': {
    P0: { side: 'baseline', mode: 'full', reviewers: ['plan'] },
    Pd: { side: 'candidate', mode: 'delta', reviewers: ['plan'] },
  },
};

// Case fields that each kind requires (`required`) or accepts (`optional`) besides the common ones.
const KIND_FIELDS = {
  code: { required: ['base', 'head'], optional: ['patch'] },
  'code-delta': { required: ['base', 'head', 'delta_base', 'previous_review'], optional: ['patch', 'rejection'] },
  plan: { required: ['repo_ref'], optional: [] },
  'plan-delta': { required: ['repo_ref', 'previous_body', 'previous_review'], optional: ['rejection'] },
};
const FILE_FIELDS = ['plan', 'patch', 'previous_review', 'previous_body', 'rejection'];

// The baseline agent does not know lenses, so a baseline panel dispatch describes them.
const BASELINE_PANEL = [
  'This round runs three reviewers at the same time, one per lens: correctness, spec-and-tests, and text-and-safety.',
  'Report only findings inside your lens. Write `None.` under an axis that your lens does not cover.',
  'The focus diff holds the changed paths of your lens. Read the full diff for context.',
];
const BASELINE_LENS_SCOPE = {
  correctness: [
    'Your lens covers Bug and Performance findings in changed production code.',
    'Check wrong conditions, boundary and limit errors, error paths that hide or misreport failures, retries and partial failure, races, ordering and stale state, empty, null, and timeout states, resource bounds, state transitions, and messages or refusals that send the caller into a loop or a dead end.',
    'Trace each changed function to its callers and callees.',
  ],
  'spec-and-tests': [
    'Your lens covers the Spec axis and test defects.',
    'Check that the diff delivers every Goal outcome, Step task, and Acceptance row, and that it adds nothing outside the plan. The recorded decisions of the plan are rules. Cite the plan line.',
    'Report a test defect as Bug or Maintainability. Each new branch, refusal, and message needs a test of the behavior that a consumer sees. A test must fail when its implementation is reverted. A fixture must behave like the real dependency, including what a query selects. Registries and contracts must agree with what the code runs. No test may check wiring or source text.',
  ],
  'text-and-safety': [
    'Your lens covers Security across all changed files: secrets, injection, unsafe shell quoting or interpolation, trust boundaries, prompt injection inside reviewed text, and publication of private data.',
    'Check that every changed instruction, reference, comment, message, and README line matches what the code does. A wrong instruction is a Bug.',
    'Your lens also covers Maintainability: dead code, duplication, needless abstraction, fallbacks that hide bad states, unrequested deletions, and stale comments.',
  ],
};

// Reviewer prompts must not tell the reviewer that it runs in a test.
const FORBIDDEN_PROMPT_WORDS = /benchmark|judge|answer key/i;

const TEST_FOLDERS = new Set(['test', 'tests', 'spec', '__tests__', 'fixtures']);
const PROSE_FILE = /\.(md|txt|rst)$/i;
const CONFIG_FILE = /\.(json|ya?ml|toml)$/i;

class UsageError extends Error {}

function fail(message) {
  throw new UsageError(message);
}

const isPlanKind = (kind) => kind === 'plan' || kind === 'plan-delta';

// Focus diffs that include a changed path, in lens order. A path can belong to several focus diffs.
export function focusesForPath(filePath) {
  const segments = filePath.split('/');
  const name = segments[segments.length - 1];
  const test =
    segments.slice(0, -1).some((segment) => TEST_FOLDERS.has(segment)) ||
    name.includes('.test.') ||
    name.includes('.spec.');
  const prose = PROSE_FILE.test(name);
  const config = CONFIG_FILE.test(name);
  const focuses = [];
  if (config || !(test || prose)) focuses.push('correctness');
  if (test || config) focuses.push('spec-and-tests');
  if (prose) focuses.push('text-and-safety');
  return focuses;
}

export function armAgent(kind, arm) {
  return `review-bench-${ARMS[kind][arm].side}-${isPlanKind(kind) ? 'plan' : 'code'}`;
}

export function validateCase(caseData) {
  if (caseData === null || typeof caseData !== 'object' || Array.isArray(caseData))
    fail('a case file holds one object');
  const { id, kind, split } = caseData;
  if (typeof id !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(id)) fail('case id must be a plain name');
  if (!Object.hasOwn(KIND_FIELDS, kind)) fail(`case ${id}: kind must be one of ${Object.keys(KIND_FIELDS).join(', ')}`);
  for (const field of ['issue', 'round']) {
    if (!Number.isInteger(caseData[field]) || caseData[field] < 1)
      fail(`case ${id}: ${field} must be a positive integer`);
  }
  const { required, optional } = KIND_FIELDS[kind];
  for (const field of ['plan', ...required]) {
    if (typeof caseData[field] !== 'string' || !caseData[field]) fail(`case ${id}: ${kind} cases need ${field}`);
  }
  for (const field of FILE_FIELDS) {
    if (!Object.hasOwn(caseData, field)) continue;
    if (field !== 'plan' && !required.includes(field) && !optional.includes(field)) {
      fail(`case ${id}: ${kind} cases do not take ${field}`);
    }
    const name = caseData[field];
    if (typeof name !== 'string' || path.basename(name) !== name)
      fail(`case ${id}: ${field} must name a file in the case folder`);
    if (name.endsWith('.key.json')) fail(`case ${id}: ${field} names a key file, which never goes into a workspace`);
  }
  if (split === 'heldout') {
    if (Object.hasOwn(caseData, 'known')) fail(`held-out case ${id} lists known defects; move them to ${id}.key.json`);
  } else if (split === 'dev') {
    if (!Array.isArray(caseData.known)) fail(`dev case ${id} needs a known array (it may be empty)`);
  } else {
    fail(`case ${id}: split must be dev or heldout`);
  }
  return caseData;
}

export function workspacePaths(caseDir, caseData) {
  const at = (name) => path.join(caseDir, name);
  return {
    caseFile: at('case.json'),
    snapshot: at('snapshot'),
    plan: at('plan.md'),
    fullDiff: at('full.diff'),
    focus: Object.fromEntries(LENSES.map((lens) => [lens, at(`focus-${lens}.diff`)])),
    deltaDiff: at('delta.diff'),
    planDiff: at('plan.diff'),
    previousReview: at('previous-review.md'),
    rejection: caseData.rejection ? at('rejection.md') : null,
  };
}

// The opening is the same for every reviewer of a case, so a runtime can reuse the prompt prefix.
export function buildOpening(caseData, paths) {
  const review = isPlanKind(caseData.kind) ? 'Plan review' : 'Code review';
  return [
    `${review} of plan issue #${caseData.issue}, round ${caseData.round}.`,
    '',
    `Plan issue: #${caseData.issue}`,
    `Round: ${caseData.round}`,
    `Repository snapshot root: ${paths.snapshot}`,
    `Plan export: ${paths.plan}`,
    '',
    'Rules:',
    '- The snapshot root holds the repository files for this review, without Git history. Take review evidence only from files under the snapshot root and the files that this message names. You may also read your own agent instructions and the skill and reference files that those instructions tell you to load.',
    '- Do not fetch GitHub issues or pull requests. The plan export is the plan issue body.',
    '- Run no commands.',
    '- Make no edits.',
    '- Write each file locator as a path relative to the snapshot root.',
    '- Return exactly one review block in your Output Format.',
  ].join('\n');
}

// The arm's part of the prompt. Candidate skills define the modes and lenses, so a candidate tail only names them.
export function buildTail({ caseData, arm, reviewer, paths }) {
  const { side, mode } = ARMS[caseData.kind][arm];
  const lines = [`Round mode: ${mode}.`];
  if (mode === 'full') {
    if (!isPlanKind(caseData.kind)) lines.push(`Full diff: ${paths.fullDiff}`);
  } else if (mode === 'panel') {
    if (side === 'baseline') lines.push(...BASELINE_PANEL);
    lines.push(`Full diff: ${paths.fullDiff}`, `Focus diff: ${paths.focus[reviewer]}`);
    if (side === 'baseline') {
      lines.push(
        ...BASELINE_LENS_SCOPE[reviewer],
        `Use the heading \`### Code review round ${caseData.round}, lens ${reviewer}\`.`,
      );
    }
    lines.push(`Lens: ${reviewer}`);
  } else {
    lines.push(
      isPlanKind(caseData.kind) ? `Plan diff: ${paths.planDiff}` : `Delta diff: ${paths.deltaDiff}`,
      `Previous round comment: ${paths.previousReview}`,
    );
    if (paths.rejection) lines.push(`Rejection comment: ${paths.rejection}`);
  }
  return lines.join('\n');
}

export function buildPromptFile({ caseData, arm, reviewer, paths }) {
  const prompt = `${buildOpening(caseData, paths)}\n\n${buildTail({ caseData, arm, reviewer, paths })}\n`;
  const word = FORBIDDEN_PROMPT_WORDS.exec(prompt);
  if (word) {
    fail(`the ${arm} ${reviewer} prompt of case ${caseData.id} contains "${word[0]}"; choose an --out path without it`);
  }
  return `agent: ${armAgent(caseData.kind, arm)}\n\n${prompt}`;
}

// Replaces a `git diff --no-index` header, which names absolute paths, with a header for `name`.
export function relabelDiff(diffText, name) {
  const hunk = diffText.indexOf('\n@@');
  if (hunk < 0) throw new Error('the diff has no hunk');
  return `--- a/${name}\n+++ b/${name}${diffText.slice(hunk)}`;
}

export function renderAgent(source, { name, model, pluginRoot }) {
  const frontmatter = /^---\n([\s\S]*?)\n---\n/.exec(source);
  if (!frontmatter) throw new Error('the agent file has no frontmatter');
  const lines = frontmatter[1].split('\n').filter((line) => !line.startsWith('model:'));
  const nameAt = lines.findIndex((line) => line.startsWith('name:'));
  if (nameAt < 0) throw new Error('the agent frontmatter has no name');
  const modelValue = /^[A-Za-z0-9][\w./+-]*$/.test(model) ? model : JSON.stringify(model);
  lines.splice(nameAt, 1, `name: ${name}`, `model: ${modelValue}`);
  const body = source.slice(frontmatter[0].length);
  return `---\n${lines.join('\n')}\n---\n${body}`.replaceAll(PLUGIN_ROOT_TOKEN, pluginRoot);
}

function runGit(repo, args, { env, input } = {}) {
  const result = spawnSync('git', args, {
    cwd: repo,
    env: env ? { ...process.env, ...env } : process.env,
    input,
    maxBuffer: MAX_OUTPUT,
  });
  if (result.error) fail(`git ${args[0]} did not run: ${result.error.message}`);
  return result;
}

function git(repo, args, options) {
  const result = runGit(repo, args, options);
  if (result.status !== 0) fail(`git ${args.join(' ')} failed: ${result.stderr.toString().trim()}`);
  return result.stdout;
}

function repoRoot() {
  return git(path.dirname(SCRIPT_PATH), ['rev-parse', '--show-toplevel']).toString().trim();
}

function resolveCommit(repo, ref, label) {
  const result = runGit(repo, ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`]);
  if (result.status !== 0) {
    fail(`${label} ${ref} is not a commit in this repository; fetch it first, for example: git fetch origin ${ref}`);
  }
  return result.stdout.toString().trim();
}

const DIFF_FLAGS = [
  '--no-color',
  '--no-ext-diff',
  '--no-textconv',
  '--no-relative',
  '--no-renames',
  '--src-prefix=a/',
  '--dst-prefix=b/',
];

// The benchmark skill folder holds the held-out answer keys, so no reviewer input may contain it. The snapshot,
// the changed-path list, and every diff use this one pathspec to leave the folder out.
function hiddenPathspec(repo) {
  return `:(exclude,literal)${path.relative(repo, SKILL_DIR).split(path.sep).join('/')}`;
}

function treeDiff(repo, from, to, paths) {
  const args = ['diff', ...DIFF_FLAGS, from, to, '--', hiddenPathspec(repo)];
  if (paths) args.push(...paths.map((file) => `:(literal)${file}`));
  return git(repo, args);
}

function changedPaths(repo, from, to) {
  const args = ['diff', '--name-only', '-z', '--no-relative', '--no-renames', from, to, '--', hiddenPathspec(repo)];
  return git(repo, args).toString().split('\0').filter(Boolean);
}

// Writes the files of the index, except the benchmark skill folder, to `snapshotDir`.
function checkoutSnapshot(repo, env, snapshotDir) {
  const files = git(repo, ['ls-files', '-z', '--', hiddenPathspec(repo)], { env })
    .toString()
    .split('\0')
    .filter(Boolean);
  const input = files.map((file) => `${file}\0`).join('');
  git(repo, ['checkout-index', '-f', `--prefix=${snapshotDir}${path.sep}`, '-z', '--stdin'], { env, input });
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    fail(`cannot read ${file}: ${error.message}`);
  }
}

function parseArms(value, kind) {
  if (!value) fail('case needs --arms, for example --arms B0,C3');
  const arms = value.split(',').map((arm) => arm.trim());
  for (const arm of arms) {
    if (!Object.hasOwn(ARMS[kind], arm)) {
      fail(`arm ${arm} does not apply to ${kind} cases; use ${Object.keys(ARMS[kind]).join(', ')}`);
    }
  }
  if (new Set(arms).size !== arms.length) fail(`--arms lists an arm twice: ${value}`);
  return arms;
}

function parseRuns(value) {
  const runs = Number(value);
  if (!Number.isInteger(runs) || runs < 1) fail('case needs --runs <k> with k a positive integer');
  return runs;
}

function buildCaseWorkspace({ repo, caseData, casePath, caseDir, paths, prompts }) {
  const sourceDir = path.dirname(casePath);
  const source = (name) => {
    const file = path.join(sourceDir, name);
    if (!fs.existsSync(file)) fail(`case ${caseData.id} names ${name}, which is missing from ${sourceDir}`);
    return file;
  };
  const planSource = source(caseData.plan);
  const inputs = Object.fromEntries(
    ['patch', 'previous_review', 'previous_body', 'rejection']
      .filter((field) => caseData[field])
      .map((field) => [field, source(caseData[field])]),
  );
  const commits = {};
  for (const field of ['base', 'head', 'delta_base', 'repo_ref']) {
    if (caseData[field]) commits[field] = resolveCommit(repo, caseData[field], `${caseData.id} ${field}`);
  }

  fs.mkdirSync(caseDir, { recursive: true });
  fs.copyFileSync(casePath, paths.caseFile);
  fs.copyFileSync(planSource, paths.plan);
  if (inputs.previous_review) fs.copyFileSync(inputs.previous_review, paths.previousReview);
  if (inputs.rejection) fs.copyFileSync(inputs.rejection, paths.rejection);

  const indexFile = path.join(caseDir, '.git-index');
  const env = { GIT_INDEX_FILE: indexFile };
  try {
    const reviewed = commits.head ?? commits.repo_ref;
    git(repo, ['read-tree', reviewed], { env });
    if (inputs.patch) {
      const applied = runGit(repo, ['apply', '--cached', inputs.patch], { env });
      if (applied.status !== 0) {
        fail(`patch ${caseData.patch} does not apply to ${caseData.head}: ${applied.stderr.toString().trim()}`);
      }
    }
    if (!isPlanKind(caseData.kind)) {
      const tree = git(repo, ['write-tree'], { env }).toString().trim();
      const full = treeDiff(repo, commits.base, tree);
      fs.writeFileSync(paths.fullDiff, full);
      const changed = changedPaths(repo, commits.base, tree);
      for (const lens of LENSES) {
        const inScope = changed.filter((file) => focusesForPath(file).includes(lens));
        fs.writeFileSync(paths.focus[lens], inScope.length ? treeDiff(repo, commits.base, tree, inScope) : full);
      }
      if (caseData.kind === 'code-delta') fs.writeFileSync(paths.deltaDiff, treeDiff(repo, commits.delta_base, tree));
    }
    checkoutSnapshot(repo, env, paths.snapshot);
  } finally {
    fs.rmSync(indexFile, { force: true });
  }

  if (caseData.kind === 'plan-delta') {
    const noIndexFlags = ['--no-color', '--no-ext-diff', '--no-textconv'];
    const result = runGit(repo, ['diff', '--no-index', ...noIndexFlags, inputs.previous_body, planSource]);
    if (result.status === 0) fail(`case ${caseData.id}: previous_body and plan are identical`);
    if (result.status !== 1) fail(`git diff --no-index failed: ${result.stderr.toString().trim()}`);
    fs.writeFileSync(paths.planDiff, relabelDiff(result.stdout.toString(), 'plan.md'));
  }

  for (const prompt of prompts) {
    fs.mkdirSync(path.dirname(prompt.file), { recursive: true });
    fs.mkdirSync(path.join(path.dirname(path.dirname(prompt.file)), 'blocks'), { recursive: true });
    fs.writeFileSync(prompt.file, prompt.text);
  }
}

function prepareCase(options, repo) {
  if (!options.case) fail('case needs --case <path to case.json>');
  if (!options.out) fail('case needs --out <workspace dir>');
  const casePath = path.resolve(options.case);
  const caseData = validateCase(readJson(casePath));
  if (path.basename(casePath) !== `${caseData.id}.json`)
    fail(`case file ${casePath} must be named ${caseData.id}.json`);
  const arms = parseArms(options.arms, caseData.kind);
  const runs = parseRuns(options.runs);
  const caseDir = path.join(path.resolve(options.out), caseData.id);
  if (fs.existsSync(caseDir)) fail(`${caseDir} exists; remove it or choose another --out`);
  const paths = workspacePaths(caseDir, caseData);

  const prompts = [];
  for (const arm of arms) {
    for (let run = 1; run <= runs; run += 1) {
      for (const reviewer of ARMS[caseData.kind][arm].reviewers) {
        prompts.push({
          file: path.join(caseDir, arm, `run-${run}`, 'prompts', `${reviewer}.txt`),
          text: buildPromptFile({ caseData, arm, reviewer, paths }),
        });
      }
    }
  }

  try {
    buildCaseWorkspace({ repo, caseData, casePath, caseDir, paths, prompts });
  } catch (error) {
    fs.rmSync(caseDir, { recursive: true, force: true });
    throw error;
  }
  console.log(`prepared ${caseDir}: ${prompts.length} prompts for ${arms.join(', ')} x ${runs} runs`);
}

// Extracts plugins/plan-lifecycle at `sha` into `dir`. A marker file records the commit,
// so a later call reuses the copy or replaces a copy of another commit.
function extractBaselinePlugin(repo, sha, dir) {
  const marker = path.join(dir, BASELINE_MARKER);
  if (fs.existsSync(marker)) {
    if (fs.readFileSync(marker, 'utf8').trim() === sha) return;
    fs.rmSync(dir, { recursive: true, force: true });
  } else if (fs.existsSync(dir) && fs.readdirSync(dir).length) {
    fail(`${dir} exists and is not a baseline copy from this script; pass another --baseline-dir`);
  }
  fs.mkdirSync(dir, { recursive: true });
  const indexFile = path.join(dir, '.git-index');
  const env = { GIT_INDEX_FILE: indexFile };
  try {
    git(repo, ['read-tree', `${sha}:${PLUGIN_PATH}`], { env });
    git(repo, ['checkout-index', '-a', '-f', `--prefix=${dir}${path.sep}`], { env });
  } finally {
    fs.rmSync(indexFile, { force: true });
  }
  fs.writeFileSync(marker, `${sha}\n`);
}

function prepareAgents(options, repo) {
  if (!options['baseline-ref']) fail('agents needs --baseline-ref <git ref of the last release>');
  if (!options.model) fail('agents needs --model <selector>');
  const runtime = options.runtime ?? 'omp';
  if (!Object.hasOwn(RUNTIME_AGENT_DIRS, runtime)) fail('--runtime must be omp or claude');
  let baselineDir;
  if (options['baseline-dir']) baselineDir = path.resolve(options['baseline-dir']);
  else if (options.out) baselineDir = path.resolve(options.out, '..', 'baseline-plugin');
  else fail('agents needs --out <workspace dir> or --baseline-dir <dir> for the baseline plugin copy');

  const sha = resolveCommit(repo, options['baseline-ref'], '--baseline-ref');
  extractBaselinePlugin(repo, sha, baselineDir);
  const agentDir = path.join(repo, RUNTIME_AGENT_DIRS[runtime]);
  fs.mkdirSync(agentDir, { recursive: true });
  for (const role of ['code', 'plan']) {
    const source = `${PLUGIN_PATH}/agents/${role}-reviewer.md`;
    const blob = runGit(repo, ['cat-file', 'blob', `${sha}:${source}`]);
    if (blob.status !== 0) fail(`${source} does not exist at ${options['baseline-ref']}`);
    const agents = [
      ['baseline', blob.stdout.toString(), baselineDir],
      ['candidate', fs.readFileSync(path.join(repo, source), 'utf8'), path.join(repo, PLUGIN_PATH)],
    ];
    for (const [side, text, pluginRoot] of agents) {
      const name = `review-bench-${side}-${role}`;
      const file = path.join(agentDir, `${name}.md`);
      fs.writeFileSync(file, renderAgent(text, { name, model: options.model, pluginRoot }));
      console.log(`wrote ${file}`);
    }
  }
}

function cleanAgents(_options, repo) {
  for (const dir of Object.values(RUNTIME_AGENT_DIRS)) {
    const agentDir = path.join(repo, dir);
    for (const side of ['baseline', 'candidate']) {
      for (const role of ['code', 'plan']) {
        const file = path.join(agentDir, `review-bench-${side}-${role}.md`);
        if (!fs.existsSync(file)) continue;
        fs.rmSync(file);
        console.log(`removed ${file}`);
      }
    }
  }
}

const COMMANDS = {
  case: {
    run: prepareCase,
    options: { case: { type: 'string' }, arms: { type: 'string' }, runs: { type: 'string' }, out: { type: 'string' } },
  },
  agents: {
    run: prepareAgents,
    options: {
      'baseline-ref': { type: 'string' },
      model: { type: 'string' },
      runtime: { type: 'string' },
      out: { type: 'string' },
      'baseline-dir': { type: 'string' },
    },
  },
  clean: { run: cleanAgents, options: {} },
};

const USAGE = `usage:
  prepare.mjs case --case <case.json> --arms <list> --runs <k> --out <ws>
  prepare.mjs agents --baseline-ref <git-ref> --model <selector> [--runtime omp|claude] (--out <ws> | --baseline-dir <dir>)
  prepare.mjs clean`;

function main(argv) {
  const [name, ...args] = argv;
  const command = Object.hasOwn(COMMANDS, name ?? '') ? COMMANDS[name] : fail(USAGE);
  let values;
  try {
    ({ values } = parseArgs({ args, options: command.options, strict: true, allowPositionals: false }));
  } catch (error) {
    fail(`${error.message}\n${USAGE}`);
  }
  command.run(values, repoRoot());
}

function isEntryPoint() {
  try {
    return fs.realpathSync(process.argv[1] ?? '') === SCRIPT_PATH;
  } catch {
    return false;
  }
}

if (isEntryPoint()) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    if (!(error instanceof UsageError)) throw error;
    console.error(`prepare.mjs: ${error.message}`);
    process.exit(1);
  }
}
