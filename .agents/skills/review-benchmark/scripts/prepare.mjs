#!/usr/bin/env node
// prepare.mjs builds review benchmark workspaces, the reviewer, self-review, and fixer agent files of the
// configurations, and the rounds of review loops.
//
//   node prepare.mjs agents --baseline-ref <git-ref> --model <m>[,<m>...] --efforts <list> [--tiers <list>]
//                           [--variants <name>=<git-ref>[,...] [--full-only <name,...>]]
//                           [--fixer-model <m>] [--fixer-effort <e>] [--fixer-tier <t>]
//                           [--runtime omp|claude] [--project <dir>] (--out <ws> | --baseline-dir <dir>)
//   node prepare.mjs case --case <case.json> --arms <B0,C3,...> --runs <k> --out <ws> [--configs <list>]
//                         [--keys <dir>] [--loop] [--project <dir>]
//   node prepare.mjs loop --run <ws>/<case>/<arm>-<config>/run-<k> --cases <dir> [--keys <dir>]
//                         [--fixer-patch <file>]
//   node prepare.mjs probe --out <ws> [--configs <list>] [--project <dir>]
//   node prepare.mjs clean [--project <dir>]
//
// ../SKILL.md describes the case schema, the configurations, the arms, the workspace layout, and the review loop.
// The script uses Node built-ins, git, and score.mjs only, so it runs on Node and on Bun.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import {
  caseFilePath,
  FIXER_DIR,
  FIXER_NAME,
  fixPlan,
  JUDGE_TREES,
  loadJudgments,
  loopEnds,
  readKnown,
  reviewerPluginRoots,
  runLabel,
  SELF_REVIEW_AGENT_PREFIX,
  unwrapBlock,
} from './score.mjs';

const SCRIPT_PATH = fs.realpathSync(fileURLToPath(import.meta.url));
const SKILL_DIR = path.dirname(path.dirname(SCRIPT_PATH));
const PLUGIN_PATH = 'plugins/plan-lifecycle';
const PLUGIN_ROOT_TOKEN = `\${CLAUDE_PLUGIN_ROOT}`;
// The marker file of a plugin copy (the baseline or a variant) records the commit of the copy.
const PLUGIN_COPY_MARKER = '.review-bench-ref';
const RUNTIME_AGENT_DIRS = { omp: '.omp/agents', claude: '.claude/agents' };
// Every file and setting that `agents` writes starts with this prefix, so `clean` finds them without a record.
const GENERATED_PREFIX = 'review-bench-';
// The list of configurations and the fixer setting that `agents` wrote, `{ configs, fixer }`, in the agent folder of
// the runtime. `case` and `probe` read it; `case --loop` records the fixer setting in each round-1 meta.json.
const CONFIGS_FILE = `${GENERATED_PREFIX}configs.json`;
// omp reads this JSON file and merges `.omp/config.yml` over it, so the script edits its own entries without a
// YAML parser and leaves the user's config files unchanged.
const OMP_SETTINGS = '.omp/settings.json';
// The frontmatter key and the levels that pin the effort of an agent in each runtime.
const RUNTIME_EFFORTS = {
  omp: { key: 'thinking-level', levels: ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'] },
  claude: { key: 'effort', levels: ['low', 'medium', 'high', 'xhigh', 'max'] },
};
// The OpenAI service tiers of omp (`tier.openai`). Only omp sets a tier per agent.
const OMP_TIERS = ['none', 'auto', 'default', 'flex', 'scale', 'priority', 'ultrafast'];
// The part of a configuration name that a tier adds. Every other tier adds `-<tier>`.
const TIER_NAMES = { default: '', priority: '-fast' };
// An omp model selector can carry an effort suffix. The grid takes the effort from --efforts only.
const EFFORT_SUFFIX = /:(off|minimal|low|medium|high|xhigh|max|auto|inherit)$/;
// The probe is a case folder that score.mjs reads like a case: one run per configuration with one short prompt.
const PROBE_CASE = { id: 'probe', kind: 'code' };
const PROBE_ARM = 'C1';
const PROBE_TASK =
  'This message checks the reviewer setup. It is not a review. Read no files, run no tools, and load no skills. Reply with one line: `ready`.';
const MAX_OUTPUT = 512 * 1024 * 1024;
// The fixer agent repairs the findings of a review loop that no fix patch repairs: the valid extra findings, and the
// findings of a known defect whose fix patch does not apply. A round has one fixer, which repairs all these findings
// of the round, as the manager of a production round does. The fixer has one model, effort, and tier for every
// configuration, so that only the reviewer setup varies.
const FIXER_AGENT = `${GENERATED_PREFIX}fixer`;
const FIXER_DEFAULTS = { model: 'openai-codex/gpt-6.1-sol', effort: 'high', tier: 'priority' };
const FIXER_SOURCE = `---
name: ${FIXER_AGENT}
description: Writes the repair of the confirmed review findings of one round in a repository snapshot as one unified diff file. Only for the review loop replays that prepare.mjs sets up.
tools: Read, Glob, Grep, Write, Bash
---

# Review fixer

The task names a repository snapshot root, a plan export, the review findings of one round, and a patch file. Follow the rules of the task: repair each finding that the snapshot still shows and nothing else, write all repairs to the patch file as one unified diff, and reply with the result for each finding.

Do not change files under the snapshot root, dispatch another agent, or ask a question.
`;
// plan-contract.md, Code-review rounds: a round is a panel round when its full diff changes this many lines or more.
const PANEL_LINES = 50;
// A review round completed when every block has one of these verdicts. `loop` refuses a round that did not complete
// and names each reviewer to dispatch again with the reason of its block.
const COMPLETE_VERDICTS = new Set(['pass', 'fixes-required']);
const INCOMPLETE_REASONS = { missing: 'no block', unreadable: 'no verdict line', blocked: 'blocked' };
// The commits of loop rounds get this author and committer, so that `loop` needs no git user config.
const LOOP_IDENTITY = {
  GIT_AUTHOR_NAME: 'Review loop',
  GIT_AUTHOR_EMAIL: 'review-loop@localhost',
  GIT_COMMITTER_NAME: 'Review loop',
  GIT_COMMITTER_EMAIL: 'review-loop@localhost',
};
const RUN_FOLDER = /^run-[1-9]\d*$/;
const ROUND_FOLDER = /^round-([1-9]\d*)$/;
// A variant is a plan-reviewer prompt at a git ref (`agents --variants`). Its name gives its arm `V<name>` and its
// agents, so it holds only lower-case letters and digits; an arm folder name then splits at its first hyphen.
const VARIANT_NAME = /^[a-z0-9]+$/;

export const LENSES = ['correctness', 'spec-and-tests', 'text-and-safety'];

// The reviewers of each code-review round mode. In a loop, the round mode picks the reviewers; the arm gives the side,
// and the meta.json of the run gives the round policy (`policy`, see LOOP_POLICIES).
const MODE_REVIEWERS = { full: ['full'], panel: LENSES, delta: ['delta'] };

// The round policies of a review loop. `panel` tells if the size rule can give a `panel` round, and `delta` tells if a
// later round can be a `delta` round (see roundMode).
// - `panel-delta`: the rules of plan-lifecycle 0.17.1 (plan-contract.md, Code-review rounds). This is the production
//   loop.
// - `full-delta`: the same rules with one full reviewer: a `full` round where these rules give a `panel` round.
// - `full`: the policy of plan-lifecycle 0.16.0, which had no panel round and no delta round. Every round is a `full`
//   round on the full diff.
export const LOOP_POLICIES = {
  'panel-delta': { panel: true, delta: true },
  'full-delta': { panel: false, delta: true },
  full: { panel: false, delta: false },
};

// The self-review of the plan manager before code-review round 1 (#98): one agent on the full diff, or one agent per
// lens. Its reviewer names differ from the reviewer names of the code-review arms.
const SELF_REVIEW = 'self-review';
const SELF_REVIEW_LENSES = LENSES.map((lens) => `${SELF_REVIEW}-${lens}`);
// The lens of a panel reviewer: a code-review lens, or a self-review lens without its prefix.
const lensOf = (reviewer) =>
  reviewer.startsWith(`${SELF_REVIEW}-`) ? reviewer.slice(SELF_REVIEW.length + 1) : reviewer;

// Arms per case kind. `side` selects the released (baseline) or the working-tree (candidate) reviewer agent, or the
// self-review agent. `mode` and `reviewers` give the one review of a run without --loop. With --loop, `policy` is the
// round policy that `case` records in the meta.json of each run. A self-review arm runs one review only, before
// code-review round 1, so it has no policy and takes no --loop. A plan kind also takes the variant arms of the list of
// configurations (see armSpec).
export const ARMS = {
  code: {
    B0: { side: 'baseline', mode: 'full', reviewers: ['full'], policy: 'full' },
    B1: { side: 'baseline', mode: 'panel', reviewers: LENSES, policy: 'panel-delta' },
    C1: { side: 'candidate', mode: 'full', reviewers: ['full'], policy: 'full-delta' },
    C3: { side: 'candidate', mode: 'panel', reviewers: LENSES, policy: 'panel-delta' },
    S1: { side: SELF_REVIEW, mode: 'full', reviewers: [SELF_REVIEW] },
    S3: { side: SELF_REVIEW, mode: 'panel', reviewers: SELF_REVIEW_LENSES },
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

// The candidate skill defines the lenses in its lens references, so a candidate panel prompt only names the lens. A
// panel prompt of the baseline agent or of the self-review agent describes the lens in the dispatch: the 0.16.0
// baseline agent and the self-review agent do not know the lenses. With a 0.17.1 baseline, the arm B1 so has the lens
// text in the dispatch, and the arm C3 has it only in a reference.
const PANEL_RULES = [
  'This round runs three reviewers at the same time, one per lens: correctness, spec-and-tests, and text-and-safety.',
  'Report only findings inside your lens. Write `None.` under an axis that your lens does not cover.',
  'The focus diff holds the changed paths of your lens. Read the full diff for context.',
];
const LENS_SCOPE = {
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

export function agentName(side, role, config) {
  return `${GENERATED_PREFIX}${side}-${role}-${config}`;
}

export function selfReviewAgent(config) {
  return `${SELF_REVIEW_AGENT_PREFIX}${config}`;
}

// The agent of `side` at a configuration: the reviewer agent of the side for the role of the case kind, or the
// self-review agent.
export function armAgent(kind, side, config) {
  if (side === SELF_REVIEW) return selfReviewAgent(config);
  return agentName(side, isPlanKind(kind) ? 'plan' : 'code', config);
}

// The side of the agents of a variant, `variant-<name>`.
const variantSide = (name) => `variant-${name}`;

// The arm `arm` of a case kind, or undefined when the kind has no such arm: an arm of ARMS, or on a plan kind the arm
// `V<name>` of a variant of `variants` (the list that `agents --variants` wrote). A variant arm runs the variant agent
// in full mode. On a plan-delta case, it runs in delta mode, unless the variant has no delta mode (`--full-only`).
function armSpec(kind, arm, variants) {
  if (Object.hasOwn(ARMS[kind], arm)) return ARMS[kind][arm];
  const variant = isPlanKind(kind) ? variants.find((item) => `V${item.name}` === arm) : undefined;
  if (!variant) return undefined;
  const mode = kind === 'plan-delta' && variant.delta ? 'delta' : 'full';
  return { side: variantSide(variant.name), mode, reviewers: ['plan'] };
}

// The folder of an arm at one configuration. Arm names have no hyphen, so the folder name splits at its first one.
export function armFolder(arm, config) {
  return `${arm}-${config}`;
}

// A short model name for configuration names: the last path segment of the selector, in lower case.
export function modelSlug(model) {
  return model
    .split('/')
    .pop()
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// Every model at every effort with every tier. A name is the effort plus the part of the tier (`TIER_NAMES`; a
// runtime without tiers adds nothing). With more than one model, the model slug comes first. The report uses the
// names as column names, so the same lists always give the same names.
export function buildConfigs({ models, efforts, tiers }) {
  const configs = [];
  for (const model of models) {
    let prefix = '';
    if (models.length > 1) {
      const slug = modelSlug(model);
      if (!slug) fail(`model ${model} gives no name for its configurations`);
      prefix = `${slug}-`;
    }
    for (const effort of efforts) {
      for (const tier of tiers) {
        const suffix = tier === null ? '' : (TIER_NAMES[tier] ?? `-${tier}`);
        configs.push({ name: `${prefix}${effort}${suffix}`, model, effort, tier });
      }
    }
  }
  const names = configs.map((config) => config.name);
  const twice = names.find((name, index) => names.indexOf(name) !== index);
  if (twice) fail(`two models give the configuration name ${twice}; give models with different last path segments`);
  return configs;
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
  if (Object.hasOwn(caseData, 'external')) {
    if (!Array.isArray(caseData.external)) fail(`case ${id}: external must be a list of file fields`);
    for (const field of caseData.external) {
      if (!FILE_FIELDS.includes(field) || !Object.hasOwn(caseData, field))
        fail(`case ${id}: external names ${field}, which is not a file field of the case`);
    }
  }
  if (Object.hasOwn(caseData, 'show_benchmark') && typeof caseData.show_benchmark !== 'boolean') {
    fail(`case ${id}: show_benchmark must be true or false`);
  }
  if (split === 'heldout') {
    if (Object.hasOwn(caseData, 'known')) fail(`held-out case ${id} lists known defects; move them to ${id}.key.json`);
  } else if (split === 'dev') {
    if (!Array.isArray(caseData.known)) fail(`dev case ${id} needs a known array (it may be empty)`);
    validateFixFields(id, caseData.known);
  } else {
    fail(`case ${id}: split must be dev or heldout`);
  }
  return caseData;
}

// A known defect of a code case can name its fix patch (`fix`, a file next to the known list) and the known defects
// whose fixes that patch needs first (`fix_after`).
function validateFixFields(id, known) {
  const ids = new Set(known.map((item) => item?.id));
  for (const item of known) {
    const { fix, fix_after: after = [] } = item ?? {};
    if (fix !== undefined && (typeof fix !== 'string' || !fix || path.basename(fix) !== fix))
      fail(`case ${id}: the fix of known defect ${item.id} must name a file in the case folder`);
    if (!Array.isArray(after) || after.some((other) => other === item.id || !ids.has(other)))
      fail(`case ${id}: fix_after of known defect ${item.id} must list other known defects of the case`);
  }
}

// The reviewer inputs in `dir`: a case folder, or a round folder of a loop, whose plan export stays in the case folder.
function reviewPaths(dir, plan, hasRejection) {
  const at = (name) => path.join(dir, name);
  return {
    snapshot: at('snapshot'),
    plan,
    fullDiff: at('full.diff'),
    focus: Object.fromEntries(LENSES.map((lens) => [lens, at(`focus-${lens}.diff`)])),
    deltaDiff: at('delta.diff'),
    planDiff: at('plan.diff'),
    previousReview: at('previous-review.md'),
    rejection: hasRejection ? at('rejection.md') : null,
  };
}

export function workspacePaths(caseDir, caseData) {
  return {
    caseFile: path.join(caseDir, 'case.json'),
    ...reviewPaths(caseDir, path.join(caseDir, 'plan.md'), Boolean(caseData.rejection)),
  };
}

// The opening is the same for every reviewer of a round, so a runtime can reuse the prompt prefix. `round` is the
// round number that the prompt names: the case round, or a later round of a loop.
export function buildOpening(caseData, paths, round = caseData.round) {
  const review = isPlanKind(caseData.kind) ? 'Plan review' : 'Code review';
  return [
    `${review} of plan issue #${caseData.issue}, round ${round}.`,
    '',
    `Plan issue: #${caseData.issue}`,
    `Round: ${round}`,
    `Repository snapshot root: ${paths.snapshot}`,
    `Plan export: ${paths.plan}`,
    '',
    'Rules:',
    '- The snapshot root holds the repository files for this review, without Git history. Take review evidence only from files under the snapshot root and the files that this message names. You may also read your own agent instructions and the skill and reference files that those instructions tell you to load.',
    '- The working directory is not the snapshot, so give every Read, Grep, and Glob call an absolute path under the snapshot root or the absolute path of a file that this message names.',
    '- Your own instruction files are your agent file and the files of your own skill folder. Read every other file, including the plan contract and other skills, under the snapshot root.',
    '- Do not read `skill://code-reviewer` or `skill://plan-reviewer`. These URIs resolve to another version of the reviewer instructions than your own.',
    '- Do not fetch GitHub issues or pull requests. The plan export is the plan issue body.',
    '- Run no commands.',
    '- Make no edits.',
    '- Write each file locator as a path relative to the snapshot root.',
    '- Return exactly one review block in your Output Format.',
  ].join('\n');
}

// The mode's part of the prompt. Candidate skills define the modes and lenses, so a candidate tail only names them. A
// panel tail of another agent describes the lens.
export function buildTail({ caseData, side, mode, round, reviewer, paths }) {
  const lines = [`Round mode: ${mode}.`];
  if (mode === 'full') {
    if (!isPlanKind(caseData.kind)) lines.push(`Full diff: ${paths.fullDiff}`);
  } else if (mode === 'panel') {
    const lens = lensOf(reviewer);
    const describe = side !== 'candidate';
    if (describe) lines.push(...PANEL_RULES);
    lines.push(`Full diff: ${paths.fullDiff}`, `Focus diff: ${paths.focus[lens]}`);
    if (describe) {
      lines.push(...LENS_SCOPE[lens], `Use the heading \`### Code review round ${round}, lens ${lens}\`.`);
    }
    lines.push(`Lens: ${lens}`);
  } else {
    lines.push(
      isPlanKind(caseData.kind) ? `Plan diff: ${paths.planDiff}` : `Delta diff: ${paths.deltaDiff}`,
      `Previous round comment: ${paths.previousReview}`,
    );
    if (paths.rejection) lines.push(`Rejection comment: ${paths.rejection}`);
  }
  return lines.join('\n');
}

// The prompt file of one reviewer. The arm gives the side; `mode` and `round` default to the arm's mode and the case
// round, and a loop round gives its own. `spec` is the arm (see armSpec); it defaults to the arm of ARMS.
export function buildPromptFile({
  caseData,
  arm,
  config,
  reviewer,
  paths,
  spec = ARMS[caseData.kind][arm],
  mode = spec.mode,
  round = caseData.round,
}) {
  const { side } = spec;
  const tail = buildTail({ caseData, side, mode, round, reviewer, paths });
  const prompt = `${buildOpening(caseData, paths, round)}\n\n${tail}\n`;
  const word = FORBIDDEN_PROMPT_WORDS.exec(prompt);
  if (word) {
    fail(`the ${arm} ${reviewer} prompt of case ${caseData.id} contains "${word[0]}"; choose an --out path without it`);
  }
  return `agent: ${armAgent(caseData.kind, side, config)}\n\n${prompt}`;
}

// The mode of a code-review round of a loop with the round policy `policy` (LOOP_POLICIES), by the rules of
// plan-contract.md, Code-review rounds. Sizes count added plus removed lines: fullLines of the full diff of the round's
// reviewed head, deltaLines of the diff from the reviewed head of the previous round. The size rule gives `panel` from
// PANEL_LINES lines, else `full`; a policy without `panel` gives `full`. Round 1 follows the size rule. A later round
// is `delta` only when the policy has `delta`, the previous round completed (every reviewer returned a block with a
// verdict line, and none returned `blocked`), every change since its head repairs one of its findings (repairsOnly),
// the change is not a merge of the default branch, and the delta diff is at most half the full diff. Otherwise the
// size rule decides.
export function roundMode({
  policy,
  round,
  fullLines,
  completed = false,
  repairsOnly = false,
  deltaLines,
  merge = false,
}) {
  const { panel, delta } = LOOP_POLICIES[policy];
  if (delta && round > 1 && completed && repairsOnly && !merge && deltaLines * 2 <= fullLines) return 'delta';
  return panel && fullLines >= PANEL_LINES ? 'panel' : 'full';
}

// Replaces a `git diff --no-index` header, which names absolute paths, with a header for `name`.
export function relabelDiff(diffText, name) {
  const hunk = diffText.indexOf('\n@@');
  if (hunk < 0) throw new Error('the diff has no hunk');
  return `--- a/${name}\n+++ b/${name}${diffText.slice(hunk)}`;
}

// Copies a plugin agent under `name` and pins its model and effort. `effortKey` is the effort key of the runtime.
export function renderAgent(source, { name, model, effortKey, effort, pluginRoot }) {
  const frontmatter = /^---\n([\s\S]*?)\n---\n/.exec(source);
  if (!frontmatter) throw new Error('the agent file has no frontmatter');
  const lines = frontmatter[1].split('\n').filter((line) => !/^(model|thinking-level|thinking|effort):/.test(line));
  const nameAt = lines.findIndex((line) => line.startsWith('name:'));
  if (nameAt < 0) throw new Error('the agent frontmatter has no name');
  const modelValue = /^[A-Za-z0-9][\w./+-]*$/.test(model) ? model : JSON.stringify(model);
  lines.splice(nameAt, 1, `name: ${name}`, `model: ${modelValue}`, `${effortKey}: ${effort}`);
  const body = source.slice(frontmatter[0].length);
  return `---\n${lines.join('\n')}\n---\n${body}`.replaceAll(PLUGIN_ROOT_TOKEN, pluginRoot);
}

// The self-review agent `name` of a configuration, in the agent file `file`. It loads the docks code-review and
// code-clarity skills through `skill://` URIs and has no plugin root, so its text names its own agent file: score.mjs
// finds that file in the system prompt of the transcript and lets the agent read it (see readScope).
function selfReviewSource(name, file) {
  return `---
name: ${name}
description: Reviews a candidate diff with the docks code-review and code-clarity skills, as the plan manager does before code-review round 1, and returns one code-review block. Only for the review replays that prepare.mjs sets up.
tools: Read, Glob, Grep
---

# Self-review

You are the self-review of the plan manager before code-review round 1. Your agent file is \`${file}\`.

1. Load \`skill://code-review\` and \`skill://code-clarity\`. Read these skills and their references only through \`skill://\` URIs.
2. Apply both skills to the candidate diff that the task names. The plan export is the spec of the Spec axis of code-review.
3. Do only the review steps of the skills. Do not write or edit a file, apply a fix, run a command, dispatch another agent, or ask a question.
4. Follow the rules of the task. When the task names a lens, report only the findings of that lens.
5. Return one block in the format below, with no text before or after it.

\`\`\`markdown
### Code review round <N>

Code-review: <pass|fixes-required>

## Standards

- [HIGH] Bug - src/example.mjs:42 - <the defect, the input or scenario that shows it, and the fix>

## Spec

None.
\`\`\`

- Use the heading that the task names. When the task names no heading, use \`### Code review round <N>\` with the round of the task.
- Write the verdict line once, as plain text on its own line. The verdict is \`fixes-required\` when a \`CRITICAL\` or \`HIGH\` finding stands, else \`pass\`.
- Start each finding line with \`- [CRITICAL]\`, \`- [HIGH]\`, \`- [MEDIUM]\`, or \`- [LOW]\`. Then give the category, the locator, and the text, separated by \` - \`. Write a bracketed severity only at the start of a finding line.
- Use the category \`Bug\`, \`Security\`, \`Performance\`, or \`Maintainability\` under \`## Standards\`, and \`Spec\` under \`## Spec\`. A code-clarity finding goes under \`## Standards\`.
- Write \`None.\` under a section that has no findings.
`;
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

// The benchmark skill folder holds the held-out answer keys under `cases/`, so no reviewer input may contain them. The
// snapshot, the changed-path list, and every diff of a case use this one pathspec. It leaves out the whole skill
// folder, or only its `cases/` folder for a case with `show_benchmark`: a case whose plan changes the benchmark, so
// that the reviewer can check the claims of the plan about the scripts. A repository that does not hold the folder
// needs no pathspec.
function hiddenPathspec(repo, caseData) {
  const relative = path.relative(repo, SKILL_DIR);
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) return [];
  const hidden = caseData.show_benchmark ? path.join(relative, 'cases') : relative;
  return [`:(exclude,literal)${hidden.split(path.sep).join('/')}`];
}

function treeDiff(repo, hidden, from, to, paths) {
  const args = ['diff', ...DIFF_FLAGS, from, to, '--', ...hidden];
  if (paths) args.push(...paths.map((file) => `:(literal)${file}`));
  return git(repo, args);
}

function changedPaths(repo, hidden, from, to) {
  const args = ['diff', '--name-only', '-z', '--no-relative', '--no-renames', from, to, '--'];
  return git(repo, [...args, ...hidden])
    .toString()
    .split('\0')
    .filter(Boolean);
}

// The size of the diff from `from` to `to` as plan-contract.md counts it: added plus removed lines, the sums of
// `git diff --numstat`. A binary file adds nothing.
function diffSize(repo, hidden, from, to) {
  const args = ['diff', '--numstat', '--no-ext-diff', '--no-textconv', '--no-relative', '--no-renames', from, to, '--'];
  return git(repo, [...args, ...hidden])
    .toString()
    .split('\n')
    .filter(Boolean)
    .reduce((size, line) => {
      const [added, removed] = line.split('\t');
      return size + (Number(added) || 0) + (Number(removed) || 0);
    }, 0);
}

// Writes one focus diff per lens: the changes of the paths in the scope of the lens, or a copy of the full diff when
// no changed path is in that scope.
function writeFocusDiffs(repo, hidden, base, tree, paths, full) {
  const changed = changedPaths(repo, hidden, base, tree);
  for (const lens of LENSES) {
    const inScope = changed.filter((file) => focusesForPath(file).includes(lens));
    fs.writeFileSync(paths.focus[lens], inScope.length ? treeDiff(repo, hidden, base, tree, inScope) : full);
  }
}

// Writes the files of the index, except the paths that `hidden` leaves out, to `snapshotDir`.
function checkoutSnapshot(repo, hidden, env, snapshotDir) {
  const files = git(repo, ['ls-files', '-z', '--', ...hidden], { env })
    .toString()
    .split('\0')
    .filter(Boolean);
  const input = files.map((file) => `${file}\0`).join('');
  git(repo, ['checkout-index', '-f', `--prefix=${snapshotDir}${path.sep}`, '-z', '--stdin'], { env, input });
}

// Runs `work` with a git index of its own in `dir`, so that the index of the repository stays unchanged.
function withIndex(dir, work) {
  const indexFile = path.join(dir, '.git-index');
  try {
    return work({ GIT_INDEX_FILE: indexFile });
  } finally {
    fs.rmSync(indexFile, { force: true });
  }
}

// Applies a patch to the index of `env`. `label` starts the message when the patch does not apply.
function applyPatch(repo, env, file, label) {
  if (!fs.existsSync(file)) fail(`${label}: ${file} is missing`);
  const applied = runGit(repo, ['apply', '--cached', file], { env });
  if (applied.status !== 0) fail(`${label}: ${applied.stderr.toString().trim()}`);
}

// Applies the fix patch `file` of a known defect to the index of `env` and returns 'applied'. When the patch does not
// apply, the index stays the same, and the result is 'present' when the patch applies in reverse (the index already
// holds its change), else 'conflict'. A missing patch file or a patch that git cannot read stops the command; `label`
// starts the message.
function applyFixPatch(repo, env, file, label) {
  if (!fs.existsSync(file)) fail(`${label}: ${file} is missing`);
  const applied = runGit(repo, ['apply', '--cached', file], { env });
  if (applied.status === 0) return 'applied';
  if (runGit(repo, ['apply', '--cached', '--check', '--reverse', file], { env }).status === 0) return 'present';
  // With --numstat, git reads the patch and applies nothing.
  if (runGit(repo, ['apply', '--numstat', file]).status !== 0) fail(`${label}: ${applied.stderr.toString().trim()}`);
  return 'conflict';
}

function writeTree(repo, env) {
  return git(repo, ['write-tree'], { env }).toString().trim();
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    fail(`cannot read ${file}: ${error.message}`);
  }
}

function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
}

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

// Splits a comma-separated option value. With `allowed`, each entry must be one of its values.
function parseList(value, option, allowed) {
  const items = value.split(',').map((item) => item.trim());
  if (items.includes('')) fail(`${option} has an empty entry: ${value}`);
  const other = allowed && items.find((item) => !allowed.includes(item));
  if (other) fail(`${option} does not take ${other}; use ${allowed.join(', ')}`);
  if (new Set(items).size !== items.length) fail(`${option} lists an entry twice: ${value}`);
  return items;
}

// The arms of --arms. A plan kind also takes the arm `V<name>` of each variant of `variants` (see armSpec).
function parseArms(value, kind, variants) {
  if (!value) fail('case needs --arms, for example --arms B0,C3');
  const arms = parseList(value, '--arms');
  for (const arm of arms) {
    if (!armSpec(kind, arm, variants)) {
      const variantArms = isPlanKind(kind) ? variants.map((variant) => `V${variant.name}`) : [];
      const known = [...Object.keys(ARMS[kind]), ...variantArms];
      fail(`arm ${arm} does not apply to ${kind} cases; use ${known.join(', ')}`);
    }
  }
  return arms;
}

function parseRuns(value) {
  const runs = Number(value);
  if (!Number.isInteger(runs) || runs < 1) fail('case needs --runs <k> with k a positive integer');
  return runs;
}

// Writes the prompts, an empty blocks folder, and the meta.json of each run folder or round folder.
function writeRuns(runs) {
  for (const { dir, meta, prompts } of runs) {
    fs.mkdirSync(path.join(dir, 'prompts'), { recursive: true });
    fs.mkdirSync(path.join(dir, 'blocks'), { recursive: true });
    writeJson(path.join(dir, 'meta.json'), meta);
    for (const { reviewer, text } of prompts) fs.writeFileSync(path.join(dir, 'prompts', `${reviewer}.txt`), text);
  }
}

// The key folder of a case. A case that keeps the files of its `external` fields there cannot run without it.
function keyFolder(caseData, keys) {
  const external = caseData.external ?? [];
  if (external.length && !keys) {
    fail(`case ${caseData.id} keeps ${external.join(', ')} in the key folder; give that folder with --keys <dir>`);
  }
  return keys ? path.resolve(keys) : undefined;
}

// The file of each file field of a case: in the key folder for the `external` fields, else in the case folder.
function caseSources(caseData, caseFolder, keys) {
  const sources = {};
  for (const field of FILE_FIELDS.filter((name) => caseData[name])) {
    const dir = caseData.external?.includes(field) ? keys : caseFolder;
    const file = path.join(dir, caseData[field]);
    if (!fs.existsSync(file)) fail(`case ${caseData.id} names ${caseData[field]}, which is missing from ${dir}`);
    sources[field] = file;
  }
  return sources;
}

// Writes the case files, the snapshot, and the diffs. The workspace gets the inputs under fixed names, so no file of
// the key folder lands there under its own name. For a code case, the result holds the base commit and the reviewed
// tree.
function buildCaseWorkspace({ repo, caseData, casePath, sources, caseDir, paths }) {
  const commits = {};
  for (const field of ['base', 'head', 'delta_base', 'repo_ref']) {
    if (caseData[field]) commits[field] = resolveCommit(repo, caseData[field], `${caseData.id} ${field}`);
  }

  fs.mkdirSync(caseDir, { recursive: true });
  fs.copyFileSync(casePath, paths.caseFile);
  fs.copyFileSync(sources.plan, paths.plan);
  if (sources.previous_review) fs.copyFileSync(sources.previous_review, paths.previousReview);
  if (sources.rejection) fs.copyFileSync(sources.rejection, paths.rejection);

  const hidden = hiddenPathspec(repo, caseData);
  const reviewed = withIndex(caseDir, (env) => {
    git(repo, ['read-tree', commits.head ?? commits.repo_ref], { env });
    if (sources.patch) {
      applyPatch(repo, env, sources.patch, `patch ${caseData.patch} does not apply to ${caseData.head}`);
    }
    let tree = null;
    if (!isPlanKind(caseData.kind)) {
      tree = writeTree(repo, env);
      const full = treeDiff(repo, hidden, commits.base, tree);
      fs.writeFileSync(paths.fullDiff, full);
      writeFocusDiffs(repo, hidden, commits.base, tree, paths, full);
      if (caseData.kind === 'code-delta') {
        fs.writeFileSync(paths.deltaDiff, treeDiff(repo, hidden, commits.delta_base, tree));
      }
    }
    checkoutSnapshot(repo, hidden, env, paths.snapshot);
    return { base: commits.base, tree };
  });

  if (caseData.kind === 'plan-delta') {
    const noIndexFlags = ['--no-color', '--no-ext-diff', '--no-textconv'];
    const result = runGit(repo, ['diff', '--no-index', ...noIndexFlags, sources.previous_body, sources.plan]);
    if (result.status === 0) fail(`case ${caseData.id}: previous_body and plan are identical`);
    if (result.status !== 1) fail(`git diff --no-index failed: ${result.stderr.toString().trim()}`);
    fs.writeFileSync(paths.planDiff, relabelDiff(result.stdout.toString(), 'plan.md'));
  }
  return reviewed;
}

// With --loop, the arm gives the side of the reviewer agent and the round policy of the loop, so two arms of one side
// run different loops. A self-review arm runs one review before code-review round 1, so it has no policy and takes no
// --loop.
function checkLoopArms(kind, arms) {
  const selfReview = arms.filter((arm) => !ARMS[kind][arm].policy);
  if (selfReview.length) fail(`${selfReview.join(', ')} run one self-review before round 1; leave them out of --loop`);
}

// The `case` command. `repo` is the git repository of the case commits. With `loop`, each run starts a review loop
// in `run-<k>/round-1/`, whose mode the round policy of the arm picks, and the meta.json of the run records that
// policy. `prepareLoop` builds the later rounds with the policy that this meta.json records.
export function prepareCase(options, repo) {
  if (!options.case) fail('case needs --case <path to case.json>');
  if (!options.out) fail('case needs --out <workspace dir>');
  const casePath = path.resolve(options.case);
  const caseData = validateCase(readJson(casePath));
  if (path.basename(casePath) !== `${caseData.id}.json`)
    fail(`case file ${casePath} must be named ${caseData.id}.json`);
  const keys = keyFolder(caseData, options.keys);
  if (options.loop && caseData.kind !== 'code') {
    fail(`--loop takes code cases; ${caseData.id} is a ${caseData.kind} case`);
  }
  // The list of configurations names the variants, which give the variant arms of the plan kinds.
  const { configs, fixer, variants, file: configsFile } = selectConfigs(options, repo);
  const arms = parseArms(options.arms, caseData.kind, variants);
  if (options.loop) checkLoopArms(caseData.kind, arms);
  const runs = parseRuns(options.runs);
  // A loop records the fixer setting, so that `score.mjs report` can check the transcript of each fixer against it.
  if (options.loop && !fixer) fail(`${configsFile} has no fixer setting; run prepare.mjs agents again`);
  const caseDir = path.join(path.resolve(options.out), caseData.id);
  if (fs.existsSync(caseDir)) fail(`${caseDir} exists; remove it or choose another --out`);
  const paths = workspacePaths(caseDir, caseData);
  const sources = caseSources(caseData, path.dirname(casePath), keys);

  const runFolders = [];
  const runMetas = [];
  const loopModes = new Map();
  try {
    const { base, tree } = buildCaseWorkspace({ repo, caseData, casePath, sources, caseDir, paths });
    const fullLines = options.loop ? diffSize(repo, hiddenPathspec(repo, caseData), base, tree) : null;
    for (const config of configs) {
      for (const arm of arms) {
        const spec = armSpec(caseData.kind, arm, variants);
        const { policy, mode: armMode, reviewers: armReviewers } = spec;
        const mode = options.loop ? roundMode({ policy, round: 1, fullLines }) : armMode;
        const reviewers = options.loop ? MODE_REVIEWERS[mode] : armReviewers;
        if (options.loop) loopModes.set(arm, mode);
        const prompts = reviewers.map((reviewer) => ({
          reviewer,
          text: buildPromptFile({ caseData, arm, spec, config: config.name, reviewer, paths, mode }),
        }));
        for (let run = 1; run <= runs; run += 1) {
          const runDir = path.join(caseDir, armFolder(arm, config.name), `run-${run}`);
          if (options.loop) {
            runMetas.push({ file: path.join(runDir, 'meta.json'), meta: { policy } });
            const meta = { config, fixerConfig: fixer, mode, fullLines };
            runFolders.push({ dir: path.join(runDir, 'round-1'), meta, prompts });
          } else {
            runFolders.push({ dir: runDir, meta: { config }, prompts });
          }
        }
      }
    }
    writeRuns(runFolders);
    for (const { file, meta } of runMetas) writeJson(file, meta);
  } catch (error) {
    fs.rmSync(caseDir, { recursive: true, force: true });
    throw error;
  }
  const prompts = runFolders.reduce((sum, run) => sum + run.prompts.length, 0);
  const counts = `${arms.join(', ')} x ${configs.length} configurations x ${runs} runs`;
  const loopNote = options.loop
    ? `; round 1 modes: ${[...loopModes].map(([arm, mode]) => `${arm} ${mode}`).join(', ')}`
    : '';
  console.log(`prepared ${caseDir}: ${prompts} prompts for ${counts}${loopNote}`);
}

// score.mjs throws plain errors. The commands of this script report them as usage errors, without a stack trace.
function fromScore(read) {
  try {
    return read();
  } catch (error) {
    fail(error.message);
  }
}

// The number of the last round folder of a run. The round folders start at round-1 and have no gap.
function lastRound(runDir, label) {
  if (!fs.statSync(runDir, { throwIfNoEntry: false })?.isDirectory()) fail(`${runDir} is not a folder`);
  const rounds = fs
    .readdirSync(runDir)
    .map((name) => ROUND_FOLDER.exec(name)?.[1])
    .filter(Boolean)
    .map(Number)
    .sort((a, b) => a - b);
  if (rounds.length === 0) fail(`${label} has no round folder; prepare its case with case --loop`);
  if (rounds.some((round, index) => round !== index + 1))
    fail(`the round folders of ${label} must start at round-1 and have no gap`);
  return rounds.length;
}

// Commits `tree` with one parent and the fixed loop identity. No branch or tag points to the commit.
function commitTree(repo, tree, parent, message) {
  const args = ['commit-tree', '--no-gpg-sign', '-p', parent, '-m', message, tree];
  return git(repo, args, { env: LOOP_IDENTITY }).toString().trim();
}

// A code finding as the reviewer wrote it: `- [<severity>] <category> - <locator> - <text>`.
function findingLine({ severity, category, locator, text }) {
  return `- [${severity}] ${[category, locator, text].filter(Boolean).join(' - ')}`;
}

// The comment of a round, as the manager posts it: the blocks in reviewer order, each without trailing whitespace,
// joined by one empty line.
function roundComment(roundDir, blocks) {
  const texts = blocks
    .map((block) => path.join(roundDir, 'blocks', `${block.reviewer}.md`))
    .filter((file) => fs.existsSync(file))
    .map((file) => unwrapBlock(fs.readFileSync(file, 'utf8')).trimEnd());
  return `${texts.join('\n\n')}\n`;
}

// The rejection comment of plan-contract.md: the first line names the round, and each rejected finding gets the
// judge's reason as its evidence.
function rejectionComment(round, rejections, findingsById) {
  const entries = rejections.flatMap(({ finding, reason }) => [
    findingLine(findingsById.get(finding)),
    `  Evidence: ${reason}`,
  ]);
  return [`Rejected review findings, round ${round}`, '', ...entries, ''].join('\n');
}

// The prompt of the fixer of a round, which lists each finding for the fixer with its id. Like a reviewer prompt,
// line 1 names the agent.
function fixerPrompt({ snapshot, planExport, findings, patch }) {
  return [
    `agent: ${FIXER_AGENT}`,
    '',
    'Repair the review findings of one round.',
    '',
    `Repository snapshot root: ${snapshot}`,
    `Plan export: ${planExport}`,
    `Patch file: ${patch}`,
    ...findings.map((finding) => `Finding ${finding.id}: ${findingLine(finding)}`),
    '',
    'Rules:',
    '- The snapshot root holds the repository files after the other repairs of this round, without Git history. Each finding was a real defect in the reviewed files, but one of these repairs can have repaired it already.',
    '- Repair each listed finding that the snapshot still shows. A finding that the snapshot no longer shows needs no change. Do not repair other defects, refactor, or reformat.',
    '- Do not change, add, or delete files under the snapshot root. Make your changes in copies in a scratch folder outside the snapshot root.',
    '- Write all repairs to the patch file as one unified diff that `git apply` applies at the snapshot root: each file path is relative to the snapshot root and has the prefix `a/` or `b/`. For example, put the original files under `<scratch>/a/` and the changed copies under `<scratch>/b/`, at their paths relative to the snapshot root, and run `git diff --no-index --src-prefix= --dst-prefix= a b > <patch file>` in `<scratch>`.',
    '- When no listed finding needs a change, write an empty patch file.',
    '- Do not fetch GitHub issues or pull requests.',
    '- Reply with one line per finding: the finding id, a colon, and `repaired` or `not present`.',
    '',
  ].join('\n');
}

// Writes what the fixer of a round needs to `fixerDir`: the snapshot of the index of `env` (the reviewed tree of the
// round with the fix patches that apply) and the one fixer prompt, which lists `findings` and names the patch file in
// `fixerDir`. It removes the prompts of an earlier call.
function writeFixerInputs({ repo, hidden, env, fixerDir, planExport, findings }) {
  const snapshot = path.join(fixerDir, 'snapshot');
  fs.rmSync(snapshot, { recursive: true, force: true });
  fs.mkdirSync(fixerDir, { recursive: true });
  for (const name of fs.readdirSync(fixerDir).filter((entry) => entry.endsWith('.txt'))) {
    fs.rmSync(path.join(fixerDir, name));
  }
  checkoutSnapshot(repo, hidden, env, snapshot);
  const patch = path.join(fixerDir, `${FIXER_NAME}.patch`);
  fs.writeFileSync(path.join(fixerDir, `${FIXER_NAME}.txt`), fixerPrompt({ snapshot, planExport, findings, patch }));
}

// The patch files that the earlier design of the fix step wrote, with one fixer per valid extra finding.
const STALE_FIXER_PATCH = /^fixer-(?:[2-9]|[1-9]\d+)\.patch$/;

// The repair of the findings for the fixer of a round: { patch: null } when the round has none (`needed` is false),
// else { patch } with the --fixer-patch file or the patch file of the fixer prompt. The result is null while that
// patch file is missing. A stale patch file of the earlier design in `fixerDir` stops the command.
function fixerRepair(option, needed, fixerDir, roundLabel) {
  if (option) {
    if (!needed) fail(`${roundLabel} has no finding for the fixer, so loop takes no --fixer-patch`);
    return { patch: path.resolve(option) };
  }
  if (!needed) return { patch: null };
  const stale = fs.existsSync(fixerDir) ? fs.readdirSync(fixerDir).filter((name) => STALE_FIXER_PATCH.test(name)) : [];
  if (stale.length) {
    const files = stale.sort().map((name) => path.join(fixerDir, name));
    fail(
      `${roundLabel} has stale fixer patches from the design with one fixer per finding: ${files.join(', ')}; delete the patch files in ${fixerDir} and run loop again`,
    );
  }
  const patch = path.join(fixerDir, `${FIXER_NAME}.patch`);
  return fs.existsSync(patch) ? { patch } : null;
}

// A patch file without a diff: the fixer found that no listed finding needs a change.
const emptyPatch = (file) => fs.existsSync(file) && fs.readFileSync(file, 'utf8').trim() === '';

// Applies the fix patches of a round in plan order to the index of `env`. It returns `applied`, the plan entries whose
// patch applied, and `notApplied`, the ids of the known defects whose patch does not apply after the patches before
// it, by the field of the round meta.json that records them:
// - fixAlreadyApplied: the patch applies in reverse, so the tree already holds the fix.
// - fixedByFixer: a defect that a finding of the round matches. The fixer repairs the findings that match it.
// - fixLeftOut: a pulled-in defect. No finding of the round names it, so the fix step leaves it out, and later rounds
//   do not count it as fixed.
// The result depends only on the reviewed tree and the patches, so each loop call on the round gets the same result.
function applyFixes({ repo, env, fixes, knownDir, roundLabel }) {
  const applied = [];
  const notApplied = { fixAlreadyApplied: [], fixedByFixer: [], fixLeftOut: [] };
  for (const fix of fixes) {
    const label = `the fix patch of ${fix.known} does not apply to ${roundLabel}`;
    const result = applyFixPatch(repo, env, path.join(knownDir, fix.patch), label);
    if (result === 'applied') applied.push(fix);
    else if (result === 'present') notApplied.fixAlreadyApplied.push(fix.known);
    else if (fix.pulled) notApplied.fixLeftOut.push(fix.known);
    else notApplied.fixedByFixer.push(fix.known);
  }
  return { applied, notApplied };
}

// The stable ids of the findings in `findings` that a `match` answer of `judgments` pairs with the known defect `id`.
function findingsOfDefect(findings, judgments, id) {
  const blinds = new Set(
    (judgments.matches ?? [])
      .filter((entry) => entry.verdict === 'match' && entry.known === id)
      .map((entry) => entry.finding),
  );
  return findings.filter((finding) => blinds.has(finding.blind)).map((finding) => finding.id);
}

// The `loop` command. It continues the review loop of one run of a code case after its last round folder, round k:
// it repairs every finding of round k that stands (score.mjs fixPlan), commits the repaired tree as the reviewed
// head of round k + 1, and writes round-<k+1>/ in the mode that roundMode gives for the round policy that the
// meta.json of the run records. It returns that folder, or null when the loop ends. It stops before the fix step when
// round k did not complete or when the judge did not answer a finding of round k. When the fix step repairs no finding
// of round k (no fix patch that is not pulled in applied, and the fixer patch changed nothing), the loop ends after
// round k: the command records the fix step in round-k/meta.json and writes no round folder.
// `repo` is the git repository of the case commits. ../SKILL.md, Review loop, describes the files.
export function prepareLoop(options, repo) {
  if (!options.run) fail('loop needs --run <ws>/<case>/<arm>-<config>/run-<k>');
  if (!options.cases) fail('loop needs --cases <cases dir>');
  const runDir = path.resolve(options.run);
  const armDir = path.dirname(runDir);
  const caseDir = path.dirname(armDir);
  const ws = path.dirname(caseDir);
  const [caseId, armName, runName] = [caseDir, armDir, runDir].map((dir) => path.basename(dir));
  const arm = armName.split('-')[0];
  if (!RUN_FOLDER.test(runName) || !armName.includes('-') || !fs.existsSync(path.join(caseDir, 'case.json')))
    fail(`--run must name a run folder <ws>/<case>/<arm>-<config>/run-<k>, not ${runDir}`);
  const caseData = validateCase(readJson(path.join(caseDir, 'case.json')));
  if (caseData.kind !== 'code' || !ARMS.code[arm]?.policy) {
    const loopArms = Object.keys(ARMS.code).filter((name) => ARMS.code[name].policy);
    fail(
      `loop takes the runs of the code arms ${loopArms.join(', ')}; ${caseId} is a ${caseData.kind} case and ${arm} is its arm`,
    );
  }
  const keys = keyFolder(caseData, options.keys);
  const hidden = hiddenPathspec(repo, caseData);
  const label = `${caseId}/${armName}/${runName}`;
  const k = lastRound(runDir, label);
  // The meta.json of the run records the round policy of the loop, and the later rounds follow it. `case --loop`
  // records the policy of the arm. A loop that `case` built before the arms had round policies has no such record; it
  // continues only after the operator records the policy that its rounds followed.
  const runMetaFile = path.join(runDir, 'meta.json');
  const policy = fs.existsSync(runMetaFile) ? readJson(runMetaFile)?.policy : undefined;
  const policies = Object.keys(LOOP_POLICIES).join(', ');
  if (policy === undefined) {
    fail(
      `${label}/meta.json records no round policy; build the loop again with case --loop, or record the policy that its rounds followed as { "policy": "<policy>" }, with <policy> one of ${policies}`,
    );
  }
  if (!Object.hasOwn(LOOP_POLICIES, policy)) {
    fail(
      `${label}/meta.json records the unknown round policy ${JSON.stringify(policy)}; the round policies are ${policies}`,
    );
  }
  const roundLabel = `${label}/round-${k}`;
  const roundDir = path.join(runDir, `round-${k}`);
  const roundMetaFile = path.join(roundDir, 'meta.json');
  const roundMeta = readJson(roundMetaFile);
  const { config } = roundMeta;
  if (!config?.name) fail(`${roundMetaFile} has no config`);

  const findingsDoc = readJson(path.join(ws, 'findings.json'));
  const inRound = (entry) =>
    entry.case === caseId && entry.arm === armName && entry.run === runName && entry.round === k;
  const blocks = findingsDoc.blocks.filter(inRound);
  if (blocks.length === 0) fail(`findings.json has no block of ${roundLabel}; run score.mjs findings again`);
  // The production loop dispatches a reviewer again before it posts the round when the reviewer returns no block with
  // a verdict line. A round with such a block, or with a `blocked` block, gets no fix step and does not end the loop.
  const incomplete = blocks.filter((block) => !COMPLETE_VERDICTS.has(block.verdict));
  if (incomplete.length) {
    const reviewers = incomplete.map((block) => `${block.reviewer} (${INCOMPLETE_REASONS[block.verdict]})`);
    fail(
      `${roundLabel} did not complete; dispatch these reviewers again, save their blocks, and run score.mjs findings again: ${reviewers.join(', ')}`,
    );
  }
  const findings = findingsDoc.findings.filter(inRound);
  const casesDir = path.resolve(options.cases);
  const { known, dir: knownDir } = fromScore(() => readKnown(casesDir, caseId, caseData.split, keys));
  // The known defects that earlier rounds fixed: each defect of their fix plans, except a pulled-in defect whose patch
  // did not apply (fixLeftOut), because no repair reached it. A later repair can bring a fixed defect back, so the fix
  // plan keeps each defect that a finding of round k matches (see score.mjs fixPlan).
  const applied = [];
  for (let round = 1; round < k; round += 1) {
    const { fix, fixLeftOut = [] } = readJson(path.join(runDir, `round-${round}`, 'meta.json'));
    if (!fix) fail(`${label}/round-${round}/meta.json has no fix; loop writes it when it builds round ${round + 1}`);
    applied.push(...fix.fixes.map((entry) => entry.known).filter((id) => !fixLeftOut.includes(id)));
  }
  const judgments = loadJudgments(ws);
  const plan = fromScore(() => fixPlan({ findings, judgments, known, applied }));
  if (loopEnds(k, plan)) {
    console.log(`the loop of ${label} ends after round ${k}`);
    return null;
  }

  const fixerDir = path.join(roundDir, FIXER_DIR);
  const caseFolder = k === 1 ? path.dirname(fromScore(() => caseFilePath(casesDir, caseId, caseData.split))) : null;
  const sources = k === 1 ? caseSources(caseData, caseFolder, keys) : {};
  const findingsById = new Map(findings.map((finding) => [finding.id, finding]));
  const planExport = path.join(caseDir, 'plan.md');
  // The round that the prompts of round k named, and the round that the prompts of round k + 1 name.
  const promptRound = caseData.round + k - 1;
  const nextRound = k + 1;
  const nextDir = path.join(runDir, `round-${nextRound}`);
  // The judge reads the reviewed tree of the new round under its blind run label, so it opens no arm folder.
  const judgeTree = path.join(ws, JUDGE_TREES, runLabel(caseId, armName, `${runName}/round-${nextRound}`));

  const next = withIndex(runDir, (env) => {
    let parent;
    if (k === 1) {
      parent = resolveCommit(repo, caseData.head, `${caseId} head`);
      git(repo, ['read-tree', parent], { env });
      if (sources.patch) {
        applyPatch(repo, env, sources.patch, `patch ${caseData.patch} does not apply to ${caseData.head}`);
      }
    } else {
      if (!roundMeta.head) fail(`${roundMetaFile} has no head`);
      parent = resolveCommit(repo, roundMeta.head, `${roundLabel} head`);
      git(repo, ['read-tree', parent], { env });
    }
    const reviewedTree = writeTree(repo, env);
    const split = applyFixes({ repo, env, fixes: plan.fixes, knownDir, roundLabel });
    // A matched defect whose fix the tree of round k already holds does not stand, also when an earlier round fixed
    // it. A pulled-in patch repairs no finding of the round.
    const present = split.notApplied.fixAlreadyApplied;
    const standing = plan.fixes.filter((fix) => !fix.pulled && !present.includes(fix.known));
    if (loopEnds(k, { fixes: standing, extras: plan.extras })) return null;
    // The fixer repairs the valid extra findings and the findings of each matched known defect whose fix patch does
    // not apply.
    const defects = split.notApplied.fixedByFixer.map((id) => ({
      id,
      findings: findingsOfDefect(findings, judgments, id),
    }));
    const fixerIds = new Set([...plan.extras, ...defects.flatMap((defect) => defect.findings)]);
    const repair = fixerRepair(options['fixer-patch'], fixerIds.size > 0, fixerDir, roundLabel);
    if (!repair) {
      const fixerFindings = findings.filter((finding) => fixerIds.has(finding.id));
      writeFixerInputs({ repo, hidden, env, fixerDir, planExport, findings: fixerFindings });
      const parts = [];
      if (plan.extras.length) {
        parts.push(`${plan.extras.length} valid extra findings for the fixer: ${plan.extras.join(', ')}`);
      }
      if (defects.length) {
        const found = defects.map((defect) => `${defect.id} (found by ${defect.findings.join(', ')})`);
        parts.push(
          `${defects.length} known defects whose fix patches do not apply, for the fixer: ${found.join(', ')}`,
        );
      }
      const prompt = path.join(fixerDir, `${FIXER_NAME}.txt`);
      fail(
        `${roundLabel} has ${parts.join(' and ')}; give their repair with --fixer-patch <file>, or dispatch the fixer prompt ${prompt} and run loop again`,
      );
    }
    // The tree before the fixer patch, when the round has findings for the fixer.
    const fixedTree = fixerIds.size > 0 ? writeTree(repo, env) : null;
    // An empty patch file changes nothing: no listed finding needed a change.
    if (repair.patch && !emptyPatch(repair.patch)) {
      applyPatch(repo, env, repair.patch, `the fixer patch does not apply to ${roundLabel} after its fix patches`);
    }
    const tree = writeTree(repo, env);
    // A fixer patch that leaves the tree as the fix patches left it repaired no finding. A pulled-in patch repairs no
    // finding of round k either, also when it changed the tree. So when no fix patch that is not pulled in applied and
    // the fixer patch changed nothing, the fix step repaired no finding of round k: production rejects a finding that
    // does not reproduce, so the loop ends after round k, as when no finding stands.
    const fixerChangedNothing = fixedTree !== null && tree === fixedTree;
    const noRepair = {
      fixRepairedNothing: split.applied.every((fix) => fix.pulled) && fixerChangedNothing,
      fixerChangedNothing,
    };
    if (noRepair.fixRepairedNothing) return { notApplied: split.notApplied, noRepair };
    const head = commitTree(repo, tree, parent, `Review loop ${label}, round ${nextRound}`);
    const base = resolveCommit(repo, caseData.base, `${caseId} base`);
    const fullLines = diffSize(repo, hidden, base, tree);
    const deltaLines = diffSize(repo, hidden, reviewedTree, tree);
    // A pulled-in patch that did not apply changed nothing.
    const repairsOnly = split.applied.every((fix) => !fix.pulled);
    // Round k completed, because loop refuses a round that did not complete.
    const nextMode = roundMode({ policy, round: nextRound, fullLines, completed: true, repairsOnly, deltaLines });
    const paths = reviewPaths(nextDir, planExport, plan.rejections.length > 0);
    const prompts = MODE_REVIEWERS[nextMode].map((reviewer) => {
      const prompt = { caseData, arm, config: config.name, reviewer, paths, mode: nextMode, round: promptRound + 1 };
      return { reviewer, text: buildPromptFile(prompt) };
    });
    const meta = { config, mode: nextMode, head, repairsOnly, fullLines, deltaLines };
    fs.mkdirSync(nextDir);
    try {
      checkoutSnapshot(repo, hidden, env, paths.snapshot);
      const full = treeDiff(repo, hidden, base, tree);
      fs.writeFileSync(paths.fullDiff, full);
      if (nextMode === 'panel') writeFocusDiffs(repo, hidden, base, tree, paths, full);
      fs.writeFileSync(paths.deltaDiff, treeDiff(repo, hidden, reviewedTree, tree));
      fs.writeFileSync(paths.previousReview, roundComment(roundDir, blocks));
      if (paths.rejection) {
        fs.writeFileSync(paths.rejection, rejectionComment(promptRound, plan.rejections, findingsById));
      }
      fs.rmSync(judgeTree, { recursive: true, force: true });
      checkoutSnapshot(repo, hidden, env, judgeTree);
      writeRuns([{ dir: nextDir, meta, prompts }]);
    } catch (error) {
      fs.rmSync(nextDir, { recursive: true, force: true });
      fs.rmSync(judgeTree, { recursive: true, force: true });
      throw error;
    }
    return { mode: nextMode, notApplied: split.notApplied, noRepair };
  });
  if (!next) {
    console.log(`the loop of ${label} ends after round ${k}`);
    return null;
  }
  const { mode, notApplied, noRepair } = next;
  // The fix plan, each list of known defects whose fix patch did not apply, and each flag of a fixer patch that changed
  // nothing or a fix step that repaired nothing. An empty list or a false flag removes its field, so a rebuilt round
  // keeps no old value.
  const record = { ...roundMeta, fix: plan };
  for (const [field, ids] of Object.entries(notApplied)) {
    if (ids.length) record[field] = ids;
    else delete record[field];
  }
  for (const [field, flag] of Object.entries(noRepair)) {
    if (flag) record[field] = true;
    else delete record[field];
  }
  writeJson(roundMetaFile, record);
  if (noRepair.fixRepairedNothing) {
    console.log(`the loop of ${label} ends after round ${k}: its fix step repaired no finding`);
    return null;
  }
  console.log(`prepared ${nextDir}: a ${mode} round after ${plan.fixes.length} fixes and ${plan.extras.length} extras`);
  return nextDir;
}

// Extracts plugins/plan-lifecycle at `sha` into `dir`: the baseline copy or the copy of a variant. A marker file
// records the commit, so a later call reuses the copy or replaces a copy of another commit.
function extractPlugin(repo, sha, dir) {
  const marker = path.join(dir, PLUGIN_COPY_MARKER);
  if (fs.existsSync(marker)) {
    if (fs.readFileSync(marker, 'utf8').trim() === sha) return;
    fs.rmSync(dir, { recursive: true, force: true });
  } else if (fs.existsSync(dir) && fs.readdirSync(dir).length) {
    fail(`${dir} exists and is not a plugin copy from this script; remove it, or pass another --out or --baseline-dir`);
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

// omp reads project agents and project settings from the working folder of the session that dispatches the
// reviewers. `--project` names that folder when it is not the repository of this script.
function projectDir(options, repo) {
  if (!options.project) return repo;
  const dir = path.resolve(options.project);
  if (!fs.statSync(dir, { throwIfNoEntry: false })?.isDirectory()) fail(`--project ${dir} is not a folder`);
  return dir;
}

function parseModels(value) {
  if (!value) fail('agents needs --model <selector>[,<selector>...]');
  const models = parseList(value, '--model');
  const suffixed = models.find((model) => EFFORT_SUFFIX.test(model));
  if (suffixed) fail(`--model ${suffixed} has an effort suffix; give the effort with --efforts`);
  return models;
}

function parseTiers(value, runtime) {
  if (runtime === 'claude') {
    if (value) fail('Claude Code sets no service tier per agent; omit --tiers with --runtime claude');
    return [null];
  }
  if (!value) fail('agents needs --tiers <list>, for example --tiers priority,default');
  return parseList(value, '--tiers', OMP_TIERS);
}

// The model, effort, and tier of the fixer agent. The defaults hold for omp; Claude Code needs a model of its own and
// takes no tier.
function parseFixer(options, runtime, levels) {
  const model = options['fixer-model'] ?? (runtime === 'omp' ? FIXER_DEFAULTS.model : null);
  if (!model) fail('Claude Code cannot run the default fixer model; give --fixer-model with --runtime claude');
  if (EFFORT_SUFFIX.test(model)) {
    fail(`--fixer-model ${model} has an effort suffix; give the effort with --fixer-effort`);
  }
  const effort = options['fixer-effort'] ?? FIXER_DEFAULTS.effort;
  if (!levels.includes(effort)) fail(`--fixer-effort does not take ${effort}; use ${levels.join(', ')}`);
  if (runtime === 'claude') {
    if (options['fixer-tier']) {
      fail('Claude Code sets no service tier per agent; omit --fixer-tier with --runtime claude');
    }
    return { model, effort, tier: null };
  }
  const tier = options['fixer-tier'] ?? FIXER_DEFAULTS.tier;
  if (!OMP_TIERS.includes(tier)) fail(`--fixer-tier does not take ${tier}; use ${OMP_TIERS.join(', ')}`);
  return { model, effort, tier };
}

function readSettings(file) {
  const settings = fs.existsSync(file) ? readJson(file) : {};
  const valid =
    isObject(settings) && isObject(settings.task ?? {}) && isObject(settings.task?.agentServiceTierOverrides ?? {});
  if (!valid) fail(`${file} must hold an object, with objects at task and task.agentServiceTierOverrides`);
  return settings;
}

// Adds one service-tier override per agent to the omp project settings and keeps every other setting.
function writeTierOverrides(project, overrides) {
  const file = path.join(project, OMP_SETTINGS);
  const settings = readSettings(file);
  settings.task = {
    ...settings.task,
    agentServiceTierOverrides: { ...settings.task?.agentServiceTierOverrides, ...overrides },
  };
  writeJson(file, settings);
  console.log(`wrote ${Object.keys(overrides).length} tier overrides to ${file}`);
}

// Removes the tier overrides of the generated agents and tells whether it removed any. A settings file that holds no
// other setting goes too.
function removeTierOverrides(project) {
  const file = path.join(project, OMP_SETTINGS);
  if (!fs.existsSync(file)) return false;
  const settings = readSettings(file);
  const overrides = settings.task?.agentServiceTierOverrides ?? {};
  const generated = Object.keys(overrides).filter((name) => name.startsWith(GENERATED_PREFIX));
  if (generated.length === 0) return false;
  for (const name of generated) delete overrides[name];
  if (Object.keys(overrides).length === 0) delete settings.task.agentServiceTierOverrides;
  if (Object.keys(settings.task).length === 0) delete settings.task;
  if (Object.keys(settings).length === 0) fs.rmSync(file);
  else writeJson(file, settings);
  console.log(`removed ${generated.length} tier overrides from ${file}`);
  return true;
}

function removeIfEmpty(dir) {
  if (fs.existsSync(dir) && fs.readdirSync(dir).length === 0) fs.rmdirSync(dir);
}

// Removes every file and setting that `agents` writes for any runtime. A folder that this call empties goes too.
function removeGenerated(project) {
  const changed = new Set();
  if (removeTierOverrides(project)) changed.add(path.dirname(path.join(project, OMP_SETTINGS)));
  for (const dir of Object.values(RUNTIME_AGENT_DIRS)) {
    const agentDir = path.join(project, dir);
    if (!fs.existsSync(agentDir)) continue;
    const generated = fs
      .readdirSync(agentDir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.startsWith(GENERATED_PREFIX));
    if (generated.length === 0) continue;
    for (const entry of generated) fs.rmSync(path.join(agentDir, entry.name));
    console.log(`removed ${generated.length} files from ${agentDir}`);
    removeIfEmpty(agentDir);
    changed.add(path.dirname(agentDir));
  }
  for (const dir of changed) removeIfEmpty(dir);
}

// The configurations that --configs names, in its order, or else every configuration that `agents` wrote; the
// setting of the fixer agent that `agents` wrote (undefined in a file without one); the variants that `agents` wrote
// (none in a file without them); and the file that holds them.
function selectConfigs(options, repo) {
  const project = projectDir(options, repo);
  const files = Object.values(RUNTIME_AGENT_DIRS)
    .map((dir) => path.join(project, dir, CONFIGS_FILE))
    .filter((file) => fs.existsSync(file));
  if (files.length === 0) fail(`${project} has no configurations; run prepare.mjs agents with the same --project`);
  if (files.length > 1) fail(`${files.join(' and ')} both exist; run prepare.mjs clean and then agents`);
  const { configs, fixer, variants = [] } = readJson(files[0]);
  const known = configs.map((config) => config.name);
  const selected = options.configs
    ? parseList(options.configs, '--configs', known).map((name) => configs[known.indexOf(name)])
    : configs;
  return { configs: selected, fixer, variants, file: files[0] };
}

// The variants of --variants, in its order: one { name, ref, sha, delta, dir, text } per `<name>=<git ref>` entry.
// `dir` is the folder of the plugin copy of the variant, next to the baseline copy, and `text` is the plan-reviewer
// agent at the ref. delta is false for a variant of --full-only, which has no delta mode. Every check runs here, before
// `agents` changes a file.
function parseVariants(options, repo, baselineDir) {
  const fullOnly = options['full-only'] ? parseList(options['full-only'], '--full-only') : [];
  if (!options.variants) {
    if (fullOnly.length) fail('--full-only names variants of --variants; give --variants too');
    return [];
  }
  const entries = options.variants.split(',').map((entry) => entry.trim());
  if (entries.includes('')) fail(`--variants has an empty entry: ${options.variants}`);
  const variants = entries.map((entry) => {
    const at = entry.indexOf('=');
    if (at < 1 || at === entry.length - 1) fail(`--variants: ${entry} is not <name>=<git ref>`);
    const name = entry.slice(0, at);
    if (!VARIANT_NAME.test(name)) fail(`--variants: the variant name ${name} has a character other than a-z and 0-9`);
    return { name, ref: entry.slice(at + 1) };
  });
  const names = variants.map((variant) => variant.name);
  const twice = names.find((name, index) => names.indexOf(name) !== index);
  if (twice) fail(`--variants: the variant name ${twice} occurs two times`);
  const other = fullOnly.find((name) => !names.includes(name));
  if (other) fail(`--full-only names ${other}, which is not a variant`);
  const source = `${PLUGIN_PATH}/agents/plan-reviewer.md`;
  return variants.map(({ name, ref }) => {
    const sha = resolveCommit(repo, ref, `variant ${name}: ref`);
    const blob = runGit(repo, ['cat-file', 'blob', `${sha}:${source}`]);
    if (blob.status !== 0) fail(`${source} does not exist at ${ref} (variant ${name})`);
    const text = blob.stdout.toString();
    const dir = path.join(path.dirname(baselineDir), `variant-${name}-plugin`);
    // score.mjs takes the plugin root of a reviewer from the path of its reviewer skill in the agent text. An agent
    // text that names no such path, or another root, would make every run of the variant read outside its inputs.
    const roots = reviewerPluginRoots(text.replaceAll(PLUGIN_ROOT_TOKEN, dir));
    if (roots.length !== 1 || roots[0] !== dir) {
      fail(
        `variant ${name}: ${source} at ${ref} must name its reviewer skill as ${PLUGIN_ROOT_TOKEN}/skills/<folder>/plan-reviewer/SKILL.md and name no other plugin root`,
      );
    }
    return { name, ref, sha, delta: !fullOnly.includes(name), dir, text };
  });
}

export function prepareAgents(options, repo) {
  if (!options['baseline-ref']) fail('agents needs --baseline-ref <git ref of the last release>');
  const runtime = options.runtime ?? 'omp';
  if (!Object.hasOwn(RUNTIME_AGENT_DIRS, runtime)) fail('--runtime must be omp or claude');
  if (!options.efforts) fail('agents needs --efforts <list>, for example --efforts low,medium,high,xhigh');
  const { key: effortKey, levels } = RUNTIME_EFFORTS[runtime];
  const configs = buildConfigs({
    models: parseModels(options.model),
    efforts: parseList(options.efforts, '--efforts', levels),
    tiers: parseTiers(options.tiers, runtime),
  });
  const fixer = parseFixer(options, runtime, levels);
  const project = projectDir(options, repo);
  let baselineDir;
  if (options['baseline-dir']) baselineDir = path.resolve(options['baseline-dir']);
  else if (options.out) baselineDir = path.resolve(options.out, '..', 'baseline-plugin');
  else fail('agents needs --out <workspace dir> or --baseline-dir <dir> for the baseline plugin copy');

  // The checks of the variants come before the first file changes.
  const variants = parseVariants(options, repo, baselineDir);
  const sha = resolveCommit(repo, options['baseline-ref'], '--baseline-ref');
  extractPlugin(repo, sha, baselineDir);
  for (const variant of variants) {
    extractPlugin(repo, variant.sha, variant.dir);
    const modes = variant.delta ? 'full and delta mode' : 'full mode only';
    console.log(`variant ${variant.name}: ${variant.ref} at ${variant.sha.slice(0, 12)}, ${modes}, in ${variant.dir}`);
  }
  const sources = [];
  for (const role of ['code', 'plan']) {
    const source = `${PLUGIN_PATH}/agents/${role}-reviewer.md`;
    const blob = runGit(repo, ['cat-file', 'blob', `${sha}:${source}`]);
    if (blob.status !== 0) fail(`${source} does not exist at ${options['baseline-ref']}`);
    sources.push(
      { side: 'baseline', role, text: blob.stdout.toString(), pluginRoot: baselineDir },
      {
        side: 'candidate',
        role,
        text: fs.readFileSync(path.join(repo, source), 'utf8'),
        pluginRoot: path.join(repo, PLUGIN_PATH),
      },
    );
  }
  for (const { name, text, dir } of variants) {
    sources.push({ side: variantSide(name), role: 'plan', text, pluginRoot: dir });
  }

  removeGenerated(project);
  const agentDir = path.join(project, RUNTIME_AGENT_DIRS[runtime]);
  fs.mkdirSync(agentDir, { recursive: true });
  const overrides = {};
  for (const config of configs) {
    for (const { side, role, text, pluginRoot } of sources) {
      const name = agentName(side, role, config.name);
      const agent = renderAgent(text, { name, model: config.model, effortKey, effort: config.effort, pluginRoot });
      fs.writeFileSync(path.join(agentDir, `${name}.md`), agent);
      if (config.tier !== null) overrides[name] = config.tier;
    }
    // The self-review agent gets the model, effort, and tier of the reviewer agents of its configuration.
    const selfReview = selfReviewAgent(config.name);
    const selfReviewFile = path.join(agentDir, `${selfReview}.md`);
    const selfReviewText = renderAgent(selfReviewSource(selfReview, selfReviewFile), {
      name: selfReview,
      model: config.model,
      effortKey,
      effort: config.effort,
    });
    fs.writeFileSync(selfReviewFile, selfReviewText);
    if (config.tier !== null) overrides[selfReview] = config.tier;
  }
  const fixerAgent = renderAgent(FIXER_SOURCE, {
    name: FIXER_AGENT,
    model: fixer.model,
    effortKey,
    effort: fixer.effort,
  });
  fs.writeFileSync(path.join(agentDir, `${FIXER_AGENT}.md`), fixerAgent);
  if (fixer.tier !== null) overrides[FIXER_AGENT] = fixer.tier;
  const variantList = variants.map(({ name, ref, sha: commit, delta }) => ({ name, ref, sha: commit, delta }));
  writeJson(path.join(agentDir, CONFIGS_FILE), { configs, fixer, variants: variantList });
  const names = configs.map((config) => config.name).join(', ');
  console.log(`wrote ${configs.length * (sources.length + 1)} agent files to ${agentDir} for ${names}`);
  const fixerTier = fixer.tier === null ? '' : `, tier ${fixer.tier}`;
  console.log(`wrote the fixer agent ${FIXER_AGENT}: ${fixer.model}, effort ${fixer.effort}${fixerTier}`);
  if (runtime === 'omp') writeTierOverrides(project, overrides);
}

// One run per configuration: the candidate code agent of the configuration gets a short task, so its transcript
// shows the model, the effort, and the served tier at little cost. The task names the run folder, because
// `score.mjs transcripts` takes only a transcript whose task names a path in the case folder. The probe changes no
// file, so its full.diff is empty: `transcripts` reads full.diff for the read scope of a code run.
function prepareProbe(options, repo) {
  if (!options.out) fail('probe needs --out <workspace dir>');
  const { configs } = selectConfigs(options, repo);
  const caseDir = path.join(path.resolve(options.out), PROBE_CASE.id);
  if (fs.existsSync(caseDir)) fail(`${caseDir} exists; remove it or choose another --out`);
  writeJson(path.join(caseDir, 'case.json'), PROBE_CASE);
  fs.writeFileSync(path.join(caseDir, 'full.diff'), '');
  writeRuns(
    configs.map((config) => {
      const dir = path.join(caseDir, armFolder(PROBE_ARM, config.name), 'run-1');
      const agent = armAgent('code', ARMS.code[PROBE_ARM].side, config.name);
      const text = `agent: ${agent}\n\n${PROBE_TASK}\n\nRun folder: ${dir}\n`;
      return { dir, meta: { config }, prompts: [{ reviewer: 'full', text }] };
    }),
  );
  console.log(`prepared ${caseDir}: one prompt for each of ${configs.map((config) => config.name).join(', ')}`);
}

const PROJECT_OPTION = { project: { type: 'string' } };

const COMMANDS = {
  case: {
    run: prepareCase,
    options: {
      case: { type: 'string' },
      arms: { type: 'string' },
      runs: { type: 'string' },
      out: { type: 'string' },
      configs: { type: 'string' },
      keys: { type: 'string' },
      loop: { type: 'boolean' },
      ...PROJECT_OPTION,
    },
  },
  loop: {
    run: prepareLoop,
    options: {
      run: { type: 'string' },
      cases: { type: 'string' },
      keys: { type: 'string' },
      'fixer-patch': { type: 'string' },
    },
  },
  agents: {
    run: prepareAgents,
    options: {
      'baseline-ref': { type: 'string' },
      model: { type: 'string' },
      efforts: { type: 'string' },
      tiers: { type: 'string' },
      variants: { type: 'string' },
      'full-only': { type: 'string' },
      'fixer-model': { type: 'string' },
      'fixer-effort': { type: 'string' },
      'fixer-tier': { type: 'string' },
      runtime: { type: 'string' },
      out: { type: 'string' },
      'baseline-dir': { type: 'string' },
      ...PROJECT_OPTION,
    },
  },
  probe: {
    run: prepareProbe,
    options: { out: { type: 'string' }, configs: { type: 'string' }, ...PROJECT_OPTION },
  },
  clean: { run: (options, repo) => removeGenerated(projectDir(options, repo)), options: PROJECT_OPTION },
};

const USAGE = `usage:
  prepare.mjs agents --baseline-ref <git-ref> --model <m>[,<m>...] --efforts <list> [--tiers <list>]
                     [--variants <name>=<git-ref>[,...] [--full-only <name,...>]]
                     [--fixer-model <m>] [--fixer-effort <e>] [--fixer-tier <t>]
                     [--runtime omp|claude] [--project <dir>] (--out <ws> | --baseline-dir <dir>)
  prepare.mjs case --case <case.json> --arms <list> --runs <k> --out <ws> [--configs <list>] [--keys <dir>]
                   [--loop] [--project <dir>]
  prepare.mjs loop --run <ws>/<case>/<arm>-<config>/run-<k> --cases <dir> [--keys <dir>] [--fixer-patch <file>]
  prepare.mjs probe --out <ws> [--configs <list>] [--project <dir>]
  prepare.mjs clean [--project <dir>]`;

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
