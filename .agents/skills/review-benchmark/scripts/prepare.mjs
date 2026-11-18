#!/usr/bin/env node
// prepare.mjs builds review benchmark workspaces, the reviewer, self-review, fixer, and manager agent files of the
// configurations, the rounds of review loops, and the manager prompts of review rounds.
//
//   node prepare.mjs agents --baseline-ref <git-ref> --model <m>[,<m>...] --efforts <list> [--tiers <list>]
//                           [--variants <name>=<git-ref>[,...] [--full-only <name,...>]
//                            [--contract-overlay <name,...>]] [--candidate-contract-overlay]
//                           [--self-review-roots <name>=<git-ref>|<name>=worktree[,...]]
//                           [--fixer-model <m>] [--fixer-effort <e>] [--fixer-tier <t>]
//                           [--manager-model <m>] [--manager-effort <e>] [--manager-tier <t>]
//                           [--runtime omp|claude] [--project <dir>] (--out <ws> | --baseline-dir <dir>)
//   node prepare.mjs sequential-plan --cases <case.json,...> --reference <arm>@<config>
//                         --candidates <arm>@<config>[,...] --looks <1,...,k> --out <ws> [--project <dir>]
//   node prepare.mjs case --case <case.json> --arms <B0,C3,...> (--runs <k> | --sequential) --out <ws>
//                         [--configs <list>] [--keys <dir>] [--loop] [--extend] [--project <dir>]
//   node prepare.mjs loop --run <ws>/<case>/<arm>-<config>/run-<k> --cases <dir> [--keys <dir>]
//                         [--fixer-patch <file>]
//   node prepare.mjs manager --ws <ws>
//   node prepare.mjs probe --out <ws> [--configs <list>] [--project <dir>]
//   node prepare.mjs clean [--project <dir>]
//
// ../SKILL.md describes the case schema, the configurations, the arms, the workspace layout, the review loop, and the
// manager stage. The script uses Node built-ins, git, and score.mjs only, so it runs on Node and on Bun. Its one fetch
// is in `case`: the head of the pull request of a case (`pull`) when a case commit is missing (see caseCommits).
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import {
  BASE_INSTRUCTIONS,
  CONTRACT_COPY,
  CONTROL_PREFIX,
  caseFilePath,
  FIXER_DIR,
  FIXER_NAME,
  fixPlan,
  JUDGE_CONTRACTS,
  JUDGE_TREES,
  loadJudgments,
  loopEnds,
  MANAGER_DIR,
  MANAGER_NAME,
  MANAGER_VERDICTS,
  MAX_LOOKS,
  RUN_PLAN,
  readKnown,
  readRunPlan,
  reviewerPluginRoots,
  runLabel,
  SELF_REVIEW_AGENT_PREFIX,
  unwrapBlock,
} from './score.mjs';

const SCRIPT_PATH = fs.realpathSync(fileURLToPath(import.meta.url));
const SKILL_DIR = path.dirname(path.dirname(SCRIPT_PATH));
const PLUGIN_PATH = 'plugins/plan-lifecycle';
// The plugin of the code-review and code-clarity skills that the self-review agent loads.
const SKILLS_PLUGIN_PATH = 'plugins/docks';
// The skills of the self-review agent. A self-review root (`agents --self-review-roots`) holds both.
const SELF_REVIEW_SKILLS = ['code-review', 'code-clarity'];
// The value of `--self-review-roots` that takes the skills of the working tree instead of a git ref.
const WORKTREE_ROOT = 'worktree';
// The instruction files of the merge base that a code reviewer reads (plan-contract.md, Code-review rounds), in the
// order of the MANIFEST lines of the base-instructions folder.
const INSTRUCTION_FILES = ['AGENTS.md', 'CLAUDE.md', 'REVIEW.md'];
// The plan contract of plan-lifecycle. A variant of `agents --contract-overlay` changes it (see writeContractCopy).
const CONTRACT_PATH = `${PLUGIN_PATH}/skills/productivity/plan-manager/references/plan-contract.md`;
// The reader of merge-base instruction files that plan-manager phase 6 and docks code-review run. `case` runs the file
// of the checkout that holds this script, not of the case repository, so a case reads each file with the production
// code.
const BASE_BLOB_SCRIPT = path.join(
  SKILL_DIR,
  '../../..',
  PLUGIN_PATH,
  'skills/productivity/plan-manager/scripts/base-blob.sh',
);
const PLUGIN_ROOT_TOKEN = `\${CLAUDE_PLUGIN_ROOT}`;
// The marker file of a plugin copy (the baseline or a variant) records the commit of the copy.
const PLUGIN_COPY_MARKER = '.review-bench-ref';
const RUNTIME_AGENT_DIRS = { omp: '.omp/agents', claude: '.claude/agents' };
// Every file and setting that `agents` writes starts with this prefix, so `clean` finds them without a record.
const GENERATED_PREFIX = 'review-bench-';
// The list of configurations and the fixer and manager settings that `agents` wrote, `{ configs, fixer, manager }`, in
// the agent folder of the runtime. `case` and `probe` read it; `case --loop` records the fixer setting in each round-1
// meta.json, and `case` records the manager setting in the meta.json of each run (round 1 of a loop).
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
// The manager agent reproduces or rejects each finding of a review round with evidence, as the plan manager of a
// production round does before it repairs. It only measures that stage: its verdicts do not change the fix step of a
// loop. By default it gets the model, effort, and tier of the fixer, and it has one setting for every configuration.
const MANAGER_AGENT = `${GENERATED_PREFIX}manager`;
const MANAGER_SOURCE = `---
name: ${MANAGER_AGENT}
description: Reproduces or rejects each finding of one review round in a repository snapshot and writes one verdict line per finding. Only for the review replays that prepare.mjs sets up.
tools: Read, Glob, Grep, Write, Bash
---

# Review manager

The task names a repository snapshot root, a plan export, the review findings of one round, and a verdict file. Follow the rules of the task: try to reproduce each finding in the snapshot, write one verdict line with evidence per finding to the verdict file, and reply with the same lines.

Do not change files under the snapshot root, repair a finding, dispatch another agent, or ask a question.
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
// A self-review root (`agents --self-review-roots`) gives its arms `S1<name>` and `S3<name>`, so its name follows the
// rule of a variant name.
const SELF_REVIEW_ROOT_ARM = /^S([13])([a-z0-9]+)$/;

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
// self-review agent. `prompt: 'candidate'` gives a baseline arm the prompt of the candidate arm of the same mode (B3,
// Bd), so the arms differ only in the reviewer files (#113); the other baseline arms keep the prompt that the reviewer
// of plan #98 needed. `mode` and `reviewers` give the one review of a run without --loop. With --loop, `policy` is the
// round policy that `case` records in the meta.json of each run. A self-review arm runs one review only, before
// code-review round 1, so it has no policy and takes no --loop. A plan kind also takes the variant arms of the list of
// configurations (see armSpec).
export const ARMS = {
  code: {
    B0: { side: 'baseline', mode: 'full', reviewers: ['full'], policy: 'full' },
    B1: { side: 'baseline', mode: 'panel', reviewers: LENSES, policy: 'panel-delta' },
    B3: { side: 'baseline', prompt: 'candidate', mode: 'panel', reviewers: LENSES, policy: 'panel-delta' },
    C1: { side: 'candidate', mode: 'full', reviewers: ['full'], policy: 'full-delta' },
    C3: { side: 'candidate', mode: 'panel', reviewers: LENSES, policy: 'panel-delta' },
    S1: { side: SELF_REVIEW, mode: 'full', reviewers: [SELF_REVIEW] },
    S3: { side: SELF_REVIEW, mode: 'panel', reviewers: SELF_REVIEW_LENSES },
  },
  'code-delta': {
    B0: { side: 'baseline', mode: 'full', reviewers: ['full'] },
    Bd: { side: 'baseline', prompt: 'candidate', mode: 'delta', reviewers: ['delta'] },
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

// The candidate skill defines the lenses in its lens references, so a candidate panel prompt only names the lens. The
// panel prompt of a baseline arm with the baseline prompt shape (B1) or of the self-review agent describes the lens in
// the dispatch: the 0.16.0 baseline agent and the self-review agent do not know the lenses. With a 0.17.1 baseline, the
// arm B1 so has the lens text in the dispatch, and the arm C3 has it only in a reference. B3 has the prompt of C3.
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

// The self-review agent of a configuration. With `root`, the name of a self-review root, it is the agent that reads
// the code-review and code-clarity skills of that root (see selfReviewSource).
export function selfReviewAgent(config, root) {
  return root ? `${SELF_REVIEW_AGENT_PREFIX}${root}-${config}` : `${SELF_REVIEW_AGENT_PREFIX}${config}`;
}

// The agent of `side` at a configuration: the reviewer agent of the side for the role of the case kind, or the
// self-review agent (of the self-review root `root`, when the arm has one).
export function armAgent(kind, side, config, root) {
  if (side === SELF_REVIEW) return selfReviewAgent(config, root);
  return agentName(side, isPlanKind(kind) ? 'plan' : 'code', config);
}

// The side of the agents of a variant, `variant-<name>`.
const variantSide = (name) => `variant-${name}`;

// The arm `arm` of a case kind, or undefined when the kind has no such arm: an arm of ARMS, on a plan kind the arm
// `V<name>` of a variant of `variants` (the list that `agents --variants` wrote), or on a code case the arm `S1<name>`
// or `S3<name>` of a self-review root of `selfReviewRoots` (the list that `agents --self-review-roots` wrote). A
// variant arm runs the variant agent in full mode. On a plan-delta case, it runs in delta mode, unless the variant has
// no delta mode (`--full-only`). The arm of a variant of `--contract-overlay` also has `contractDiff`, the contract
// change of the variant, and so has a candidate arm (code or plan) when `agents --candidate-contract-overlay`
// recorded `candidateContractDiff`. A self-review root arm is the arm S1 or S3 with `root`, the name of the root. The
// arm `A<arm>` is the A/A control copy of the arm `<arm>` (CONTROL_PREFIX): the same agent, prompt, and policy in an
// arm folder of its own, so that `score.mjs report` can measure the drift of the batch.
function armSpec(kind, arm, lists = {}) {
  const { variants = [], candidateContractDiff, selfReviewRoots = [] } = lists;
  if (arm.startsWith(CONTROL_PREFIX)) {
    const copied = arm.slice(CONTROL_PREFIX.length);
    return copied.startsWith(CONTROL_PREFIX) ? undefined : armSpec(kind, copied, lists);
  }
  if (Object.hasOwn(ARMS[kind], arm)) {
    const spec = ARMS[kind][arm];
    return candidateContractDiff && spec.side === 'candidate' ? { ...spec, contractDiff: candidateContractDiff } : spec;
  }
  const rootArm = kind === 'code' ? SELF_REVIEW_ROOT_ARM.exec(arm) : null;
  if (rootArm) {
    const root = selfReviewRoots.find((item) => item.name === rootArm[2]);
    return root ? { ...ARMS.code[`S${rootArm[1]}`], root: root.name } : undefined;
  }
  const variant = isPlanKind(kind) ? variants.find((item) => `V${item.name}` === arm) : undefined;
  if (!variant) return undefined;
  const mode = kind === 'plan-delta' && variant.delta ? 'delta' : 'full';
  return { side: variantSide(variant.name), mode, reviewers: ['plan'], contractDiff: variant.contractDiff };
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

// omp sets a service tier only for OpenAI models: a model whose provider part, the text of the selector before the
// first `/`, starts with `openai`. The configurations and the fixer use this one test.
function takesServiceTier(model) {
  return model.split('/')[0].startsWith('openai');
}

// Every model at every effort with every tier. A name is the effort plus the part of the tier (`TIER_NAMES`; a
// runtime without tiers adds nothing). With more than one model, the model slug comes first. The report uses the
// names as column names, so the same lists always give the same names. A model that takes no service tier (see
// takesServiceTier) gets the single tier null: no name part, no tier override, and no served-tier check.
export function buildConfigs({ models, efforts, tiers }) {
  const configs = [];
  for (const model of models) {
    let prefix = '';
    if (models.length > 1) {
      const slug = modelSlug(model);
      if (!slug) fail(`model ${model} gives no name for its configurations`);
      prefix = `${slug}-`;
    }
    const modelTiers = takesServiceTier(model) ? tiers : [null];
    for (const effort of efforts) {
      for (const tier of modelTiers) {
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
  // The review cycle of the round, for an escape case whose round number repeats in another cycle of its plan.
  if (Object.hasOwn(caseData, 'cycle') && (!Number.isInteger(caseData.cycle) || caseData.cycle < 1))
    fail(`case ${id}: cycle must be a positive integer`);
  if (Object.hasOwn(caseData, 'seeded')) {
    if (!isPlanKind(kind)) fail(`case ${id}: only plan cases take seeded; code cases use patch`);
    if (typeof caseData.seeded !== 'boolean') fail(`case ${id}: seeded must be true or false`);
  }
  // A control case is a change that landed without a later revert or defect fix. It has no known defect, so the report
  // gives its findings in rows of their own (see score.mjs controlSection).
  if (Object.hasOwn(caseData, 'control') && typeof caseData.control !== 'boolean') {
    fail(`case ${id}: control must be true or false`);
  }
  // The pull request whose head holds a case commit that origin/main does not reach (see caseCommits).
  if (Object.hasOwn(caseData, 'pull') && (!Number.isInteger(caseData.pull) || caseData.pull < 1))
    fail(`case ${id}: pull must be a positive integer`);
  if (split === 'heldout') {
    if (Object.hasOwn(caseData, 'known')) fail(`held-out case ${id} lists known defects; move them to ${id}.key.json`);
    // A reviewer can search the checkout, and the protected decisions show what the case tests, so they stay with the
    // known defects in the key file, which stays outside the repository while reviewers run.
    if (Object.hasOwn(caseData, 'protected'))
      fail(`held-out case ${id} lists protected decisions; move them to ${id}.key.json`);
  } else if (split === 'dev') {
    if (!Array.isArray(caseData.known)) fail(`dev case ${id} needs a known array (it may be empty)`);
    if (caseData.control && caseData.known.length) fail(`control case ${id} must have an empty known array`);
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
    baseInstructions: at(BASE_INSTRUCTIONS),
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
// round number that the prompt names: the case round, or a later round of a loop. `paths.contract` is set only for a
// run of a variant with a contract overlay: it is the copy of the plan contract in the run folder (see
// writeContractCopy), so the rules send the reviewer to that copy for the plan contract and to the snapshot root for
// every other repository file. A code review also names the base-instructions folder of its round (see
// writeBaseInstructions), as the plan manager names it in a production dispatch.
export function buildOpening(caseData, paths, round = caseData.round) {
  const code = !isPlanKind(caseData.kind);
  const review = code ? 'Code review' : 'Plan review';
  const ownFiles = 'Your own instruction files are your agent file and the files of your own skill folder.';
  const readRule = paths.contract
    ? `- ${ownFiles} Read the plan contract at ${paths.contract}. Read every other repository file, including other skills, under the snapshot root.`
    : `- ${ownFiles} Read every other file, including the plan contract and other skills, under the snapshot root.`;
  const baseRule =
    '- The base instructions folder holds the `AGENTS.md`, `CLAUDE.md`, and `REVIEW.md` files of the merge base: the files of the repository root and of each parent folder of a changed path. Its `MANIFEST` file lists each checked path as `copied <path>` or `absent <path>`. Take these instruction files only from that folder.';
  return [
    `${review} of plan issue #${caseData.issue}, round ${round}.`,
    '',
    `Plan issue: #${caseData.issue}`,
    `Round: ${round}`,
    `Repository snapshot root: ${paths.snapshot}`,
    `Plan export: ${paths.plan}`,
    ...(code ? [`Base instructions: ${paths.baseInstructions}`] : []),
    '',
    'Rules:',
    '- The snapshot root holds the repository files for this review, without Git history. Take repository evidence only from files under the snapshot root and the files that this message names. You may read official documentation on the web, but no page of the DocksDocks/docks repository. You may also read your own agent instructions and the skill and reference files that those instructions tell you to load.',
    '- The working directory is not the snapshot, so give every Read, Grep, and Glob call an absolute path under the snapshot root or the absolute path of a file that this message names.',
    readRule,
    ...(code ? [baseRule] : []),
    '- Do not read `skill://code-reviewer` or `skill://plan-reviewer`. These URIs resolve to another version of the reviewer instructions than your own.',
    '- Do not fetch GitHub issues or pull requests. The plan export is the plan issue body.',
    '- Run no commands.',
    '- Make no edits.',
    '- Write each file locator as a path relative to the snapshot root.',
    '- Return exactly one review block in your Output Format.',
  ].join('\n');
}

// The first line of the tail of a reviewer prompt: the round mode. managerInputs reads it back.
const modeLine = (mode) => `Round mode: ${mode}.`;

// The mode's part of the prompt. Candidate skills define the modes and lenses, so a candidate tail only names them. A
// panel tail of another prompt shape describes the lens. `side` is the prompt shape of the arm: its `prompt` field, or
// else its agent side.
export function buildTail({ caseData, side, mode, round, reviewer, paths }) {
  const lines = [modeLine(mode)];
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
// round, and a loop round gives its own. `spec` is the arm (see armSpec); it defaults to the arm of armSpec without
// the lists of `agents`, so a variant arm or a self-review root arm needs its `spec`.
export function buildPromptFile({
  caseData,
  arm,
  config,
  reviewer,
  paths,
  spec = armSpec(caseData.kind, arm),
  mode = spec.mode,
  round = caseData.round,
}) {
  const { side } = spec;
  const tail = buildTail({ caseData, side: spec.prompt ?? side, mode, round, reviewer, paths });
  const prompt = `${buildOpening(caseData, paths, round)}\n\n${tail}\n`;
  const word = FORBIDDEN_PROMPT_WORDS.exec(prompt);
  if (word) {
    fail(`the ${arm} ${reviewer} prompt of case ${caseData.id} contains "${word[0]}"; choose an --out path without it`);
  }
  return `agent: ${armAgent(caseData.kind, side, config, spec.root)}\n\n${prompt}`;
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

// The self-review agent `name` of a configuration, in the agent file `file`. By default it loads the docks
// code-review and code-clarity skills through `skill://` URIs. With `skillFiles`, the SKILL.md file of each skill in a
// self-review root (`agents --self-review-roots`), it reads these files and their folders instead. It has no plugin
// root, so its text names its own agent file: score.mjs finds that file and the skill files in the system prompt of
// the transcript and lets the agent read them (see readScope).
function selfReviewSource(name, file, skillFiles) {
  const load = skillFiles
    ? `1. Read the code-review skill at \`${skillFiles['code-review']}\` and the code-clarity skill at \`${skillFiles['code-clarity']}\`. Read their references only in the folders of these two files. Do not load \`skill://code-review\` or \`skill://code-clarity\`: these URIs resolve to another version of the skills.`
    : '1. Load `skill://code-review` and `skill://code-clarity`. Read these skills and their references only through `skill://` URIs.';
  return `---
name: ${name}
description: Reviews a candidate diff with the docks code-review and code-clarity skills, as the plan manager does before code-review round 1, and returns one code-review block. Only for the review replays that prepare.mjs sets up.
tools: Read, Glob, Grep
---

# Self-review

You are the self-review of the plan manager before code-review round 1. Your agent file is \`${file}\`.

${load}
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

// The commit of `ref`, or null when `ref` names no commit in `repo`.
function commitOf(repo, ref) {
  const result = runGit(repo, ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`]);
  return result.status === 0 ? result.stdout.toString().trim() : null;
}

function resolveCommit(repo, ref, label) {
  const commit = commitOf(repo, ref);
  if (!commit) {
    fail(`${label} ${ref} is not a commit in this repository; fetch it first, for example: git fetch origin ${ref}`);
  }
  return commit;
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

// The text of the file `file` in the commit `commit`, or null when the commit has no blob there. BASE_BLOB_SCRIPT
// resolves each symbolic link on the path, also a folder link; its status 1 means absent. Any other status stops
// `case` with the error of the script, so a git failure is never an absent file.
function baseInstructionText(repo, commit, file) {
  const result = spawnSync('sh', [BASE_BLOB_SCRIPT, commit, file], { cwd: repo, maxBuffer: MAX_OUTPUT });
  if (result.error) fail(`sh ${BASE_BLOB_SCRIPT} did not run: ${result.error.message}`);
  if (result.status === 1) return null;
  if (result.status !== 0) {
    const status = result.status ?? result.signal;
    fail(`base-blob.sh ${commit} ${file} failed with status ${status}: ${result.stderr.toString().trim()}`);
  }
  return git(repo, ['cat-file', 'blob', result.stdout.toString().trim()]);
}

// Writes the base-instructions folder of a review into `dir` (see the base-instructions contract in ../SKILL.md,
// Workspace): for the repository root and each parent folder of a path that changes from `base` to `tree`, or from
// `deltaFrom` to `tree` when the round has a delta, a copy of each instruction file (INSTRUCTION_FILES) that the
// commit `base` holds, under its own path, and the file MANIFEST with one line per checked path, `copied <path>` or
// `absent <path>`. The delta paths matter: a file that the branch added and a later repair deleted is in the delta
// diff but not in the full diff. The changed paths leave out the paths of `hidden`, as the diffs do.
function writeBaseInstructions(repo, hidden, base, tree, dir, deltaFrom = null) {
  const folders = new Set(['']);
  const changed = new Set(changedPaths(repo, hidden, base, tree));
  if (deltaFrom) for (const file of changedPaths(repo, hidden, deltaFrom, tree)) changed.add(file);
  for (const file of changed) {
    const parents = file.split('/').slice(0, -1);
    for (let depth = 1; depth <= parents.length; depth += 1) folders.add(parents.slice(0, depth).join('/'));
  }
  const out = path.join(dir, BASE_INSTRUCTIONS);
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(out, { recursive: true });
  const manifest = [];
  for (const folder of [...folders].sort()) {
    for (const name of INSTRUCTION_FILES) {
      const file = folder ? `${folder}/${name}` : name;
      const text = baseInstructionText(repo, base, file);
      manifest.push(`${text === null ? 'absent' : 'copied'} ${file}`);
      if (text === null) continue;
      fs.mkdirSync(path.join(out, ...folder.split('/')), { recursive: true });
      fs.writeFileSync(path.join(out, ...file.split('/')), text);
    }
  }
  fs.writeFileSync(path.join(out, 'MANIFEST'), `${manifest.join('\n')}\n`);
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

// The arms of --arms. A plan kind also takes the arm `V<name>` of each variant of `lists.variants`, and a code kind
// the arms `S1<name>` and `S3<name>` of each self-review root of `lists.selfReviewRoots` (see armSpec).
function parseArms(value, kind, lists) {
  if (!value) fail('case needs --arms, for example --arms B0,C3');
  const arms = parseList(value, '--arms');
  for (const arm of arms) {
    if (!armSpec(kind, arm, lists)) {
      const variantArms = isPlanKind(kind) ? lists.variants.map((variant) => `V${variant.name}`) : [];
      const rootArms = kind === 'code' ? lists.selfReviewRoots.flatMap(({ name }) => [`S1${name}`, `S3${name}`]) : [];
      const known = [...Object.keys(ARMS[kind]), ...variantArms, ...rootArms];
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

// The case fields that name a commit.
const COMMIT_FIELDS = ['base', 'head', 'delta_base', 'repo_ref'];
// The refs of the benchmark. `case` saves the head of the pull request `<n>` of a case (`pull`) at `${PULL_REF}<n>`,
// and `case` and the recovery command of manualFetchCommand pin a commit at `${KEPT_REF}<sha>`. git fetch --prune
// removes no ref outside the fetch refspecs, git gc keeps every object that a ref reaches, and the script never moves
// a saved ref, so every commit that the refs reach stays in the repository.
const BENCH_REFS = 'refs/review-bench/';
const PULL_REF = `${BENCH_REFS}pull/`;
const KEPT_REF = `${BENCH_REFS}kept/`;
// The refs that one `case` run or one shell of the recovery command fetches into. The process id keeps a parallel run
// from changing what this run saves.
const INCOMING_REF = `${BENCH_REFS}incoming/`;
const MAIN_REF = 'refs/remotes/origin/main';
const FORK_NOTE = 'when origin is a fork, use the remote of DocksDocks/docks instead of origin';

// The commits of the case fields that name one. When a commit of a case with `pull` is missing, the head of that pull
// request holds it: `case` fetches the head once (see fetchPull) and resolves every commit again. A commit that is
// still missing stops the script before it writes a workspace file. A commit that the repository holds needs no fetch,
// whatever holds it: a local branch, a pin of the recovery command, or only an object that a run left when it lost the
// create of the saved ref to a parallel run. `case` then pins each case commit that origin/main does not reach (see
// keepCommit), so git gc keeps every commit that the workspace uses.
function caseCommits(repo, caseData) {
  const fields = COMMIT_FIELDS.filter((field) => caseData[field]);
  const resolve = () => Object.fromEntries(fields.map((field) => [field, commitOf(repo, caseData[field])]));
  let commits = resolve();
  if (caseData.pull && fields.some((field) => !commits[field])) {
    fetchPull(repo, caseData);
    commits = resolve();
  }
  const missing = fields.find((field) => !commits[field]);
  if (missing) fail(missingCommitMessage(caseData, missing));
  for (const commit of new Set(Object.values(commits))) keepCommit(repo, caseData, commit);
  return commits;
}

// Pins `commit` at `${KEPT_REF}<commit>` when origin/main does not reach it. The ref name is the commit itself, so an
// existing pin is the same pin, and `git update-ref` with an empty old value never moves a ref.
function keepCommit(repo, { id }, commit) {
  if (runGit(repo, ['merge-base', '--is-ancestor', commit, MAIN_REF]).status === 0) return;
  const kept = `${KEPT_REF}${commit}`;
  const created = runGit(repo, ['update-ref', kept, commit, '']);
  if (created.status !== 0 && commitOf(repo, kept) !== commit) {
    fail(`case ${id}: git update-ref ${kept} ${commit} failed: ${created.stderr.toString().trim()}`);
  }
}

// Saves the head of the pull request `pull` of a case at refs/review-bench/pull/<pull>, unless that ref exists. The
// fetch goes to a ref of this run only, and `git update-ref` with an empty old value creates the saved ref only when
// it does not exist, so a saved ref never moves. When a parallel run saved the ref first, this run deletes its incoming
// ref; the fetched objects stay, and caseCommits pins the commits that the case uses.
function fetchPull(repo, { id, pull }) {
  const saved = `${PULL_REF}${pull}`;
  if (runGit(repo, ['show-ref', '--verify', '--quiet', saved]).status === 0) return;
  const incoming = `${INCOMING_REF}${pull}-${process.pid}`;
  const fetchArgs = ['fetch', '--no-tags', '--no-write-fetch-head', 'origin', `+refs/pull/${pull}/head:${incoming}`];
  const fetched = runGit(repo, fetchArgs);
  if (fetched.status !== 0) {
    fail(
      `case ${id}: git ${fetchArgs.join(' ')} failed: ${fetched.stderr.toString().trim()}; fetch the head of pull request ${pull} yourself: ${manualFetchCommand(pull)} (${FORK_NOTE})`,
    );
  }
  let created;
  try {
    created = runGit(repo, ['update-ref', saved, git(repo, ['rev-parse', '--verify', incoming]).toString().trim(), '']);
  } finally {
    git(repo, ['update-ref', '-d', incoming]);
  }
  if (created.status !== 0 && !commitOf(repo, saved)) {
    fail(`case ${id}: git update-ref ${saved} failed: ${created.stderr.toString().trim()}`);
  }
}

// The command that fetches the head of the pull request `pull` and pins it at `${KEPT_REF}<sha>`, the ref that
// keepCommit uses. The shell fetches into a ref that only it writes (`$$` is its process id), reads the object id once
// from that ref, and uses that id for the name and the value of the pin. `git update-ref` with an empty old value fails
// when the pin exists, so a second run of the command never moves a ref. The command then deletes its fetch ref.
// `case` then finds the commit present and pinned.
function manualFetchCommand(pull) {
  return `t=${INCOMING_REF}manual-$$ && git fetch --no-tags --no-write-fetch-head origin +refs/pull/${pull}/head:$t && sha=$(git rev-parse "$t") && git update-ref "${KEPT_REF}$sha" "$sha" ""; git update-ref -d "$t"`;
}

// The stop message of a case commit that the repository does not hold.
function missingCommitMessage(caseData, field) {
  const { id, pull } = caseData;
  const head = `case ${id}: ${field} ${caseData[field]} is not a commit in this repository`;
  if (!pull) {
    return `${head}; give the case a pull field that names the pull request whose head holds the commit, so that case fetches it, or fetch that head yourself: ${manualFetchCommand('<n>')} (${FORK_NOTE})`;
  }
  return `${head}, and ${PULL_REF}${pull} does not hold it; check that pull names the pull request whose head holds the commit, or fetch that head yourself: ${manualFetchCommand(pull)} (${FORK_NOTE})`;
}

// Reads the reviewed tree of a case into the index of `env`: the head commit (for a plan kind, the repo_ref commit)
// with the patch of the case.
function readReviewed(repo, env, { caseData, commits, sources }) {
  git(repo, ['read-tree', commits.head ?? commits.repo_ref], { env });
  if (sources.patch) {
    applyPatch(repo, env, sources.patch, `patch ${caseData.patch} does not apply to ${caseData.head}`);
  }
}

// Writes the case files, the snapshot, and the diffs. The workspace gets the inputs under fixed names, so no file of
// the key folder lands there under its own name. A code case also gets its base-instructions folder from the case base
// commit. For a code case, the result is the reviewed tree, else null.
function buildCaseWorkspace({ repo, caseData, commits, hidden, casePath, sources, caseDir, paths }) {
  fs.mkdirSync(caseDir, { recursive: true });
  fs.copyFileSync(casePath, paths.caseFile);
  fs.copyFileSync(sources.plan, paths.plan);
  if (sources.previous_review) fs.copyFileSync(sources.previous_review, paths.previousReview);
  if (sources.rejection) fs.copyFileSync(sources.rejection, paths.rejection);

  const reviewed = withIndex(caseDir, (env) => {
    readReviewed(repo, env, { caseData, commits, sources });
    let tree = null;
    if (!isPlanKind(caseData.kind)) {
      tree = writeTree(repo, env);
      const full = treeDiff(repo, hidden, commits.base, tree);
      fs.writeFileSync(paths.fullDiff, full);
      writeFocusDiffs(repo, hidden, commits.base, tree, paths, full);
      // A code-delta case also takes the parent folders of the paths of its delta diff (commits.delta_base is set only
      // for that kind).
      writeBaseInstructions(repo, hidden, commits.base, tree, caseDir, commits.delta_base);
      if (caseData.kind === 'code-delta') {
        fs.writeFileSync(paths.deltaDiff, treeDiff(repo, hidden, commits.delta_base, tree));
      }
    }
    checkoutSnapshot(repo, hidden, env, paths.snapshot);
    return tree;
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

// The lines that a one-file diff removes, without the blank lines: the text that the diff changes.
function removedText(diffText) {
  return diffText
    .slice(diffText.indexOf('\n@@') + 1)
    .split('\n')
    .filter((line) => line.startsWith('-') && line.slice(1).trim() !== '')
    .map((line) => line.slice(1));
}

// Writes `copy`, the plan contract of the snapshot with the contract change `diff` of a variant of `agents
// --contract-overlay`, and tells whether the change applied. `git apply` patches the copy, so the snapshot stays the
// same. When the change does not apply because the contract of the snapshot holds no line that the change removes
// (blank lines aside), the copy keeps the contract of the snapshot, and the result is 'not applicable'. Every other
// failure of `git apply`, for example a removed line with other context lines, stops the command with the message of
// git and the run folder of the copy.
function writeContractCopy(snapshot, diff, copy) {
  const contract = path.join(snapshot, CONTRACT_PATH);
  if (!fs.existsSync(contract)) {
    fail(`${snapshot} has no ${CONTRACT_PATH}, so the contract overlay has no contract to change`);
  }
  const dir = path.dirname(copy);
  fs.mkdirSync(dir, { recursive: true });
  fs.copyFileSync(contract, copy);
  // Outside a repository, git apply patches the files under its working folder. The ceiling stops git from taking a
  // repository above the run folder, for example when the workspace is in a checkout.
  const env = { GIT_CEILING_DIRECTORIES: path.dirname(dir) };
  const patch = relabelDiff(diff, path.basename(copy));
  const applied = runGit(dir, ['apply', '-'], { env, input: patch });
  if (applied.status === 0) return 'applied';
  const lines = new Set(fs.readFileSync(contract, 'utf8').split('\n'));
  const removed = removedText(patch);
  if (removed.length && !removed.some((line) => lines.has(line))) return 'not applicable';
  fail(`the contract change does not apply to ${contract} for the run ${dir}: ${applied.stderr.toString().trim()}`);
}

// `case --extend` adds arm folders to the case folder that the same case file gave, so the snapshot and the diffs of
// that folder hold for the new arms.
function checkExtend(casePath, caseDir, paths) {
  if (!fs.existsSync(paths.caseFile)) fail(`${caseDir} holds no case folder to extend; run case without --extend`);
  if (!fs.readFileSync(paths.caseFile).equals(fs.readFileSync(casePath))) {
    fail(`${paths.caseFile} differs from ${casePath}; build the changed case in another --out`);
  }
}

// With --loop, the arm gives the side of the reviewer agent and the round policy of the loop, so two arms of one side
// run different loops. A self-review arm runs one review before code-review round 1, so it has no policy and takes no
// --loop. `specOf` gives the arm of a name (see armSpec).
function checkLoopArms(arms, specOf) {
  const selfReview = arms.filter((arm) => !specOf(arm).policy);
  if (selfReview.length) fail(`${selfReview.join(', ')} run one self-review before round 1; leave them out of --loop`);
}

// The runs of the first look of `case --sequential` (see ../SKILL.md, Procedure): one run per case.
const FIRST_LOOK_RUNS = 1;

// The look that `case --sequential` adds to the arm folders `armDirs` of an existing case folder: one more than the
// runs that each of them holds. Each arm folder must exist and hold the runs run-1 to run-<k> of k looks, the same k
// for each, and k must be below MAX_LOOKS.
function nextLook(caseDir, armDirs) {
  const missing = armDirs.find((dir) => !fs.existsSync(dir));
  if (missing) {
    fail(
      `${missing} does not exist; the first look of case --sequential prepares every declared arm folder, so restore the folder or declare a new decision in another workspace`,
    );
  }
  const looks = armDirs.map((dir) => {
    const runs = fs.readdirSync(dir).filter((name) => RUN_FOLDER.test(name));
    const complete = runs.every((_, index) => runs.includes(`run-${index + 1}`));
    if (!complete) fail(`${dir} holds the runs ${runs.join(', ')}, which are not run-1 to run-${runs.length}`);
    return runs.length;
  });
  if (new Set(looks).size > 1)
    fail(`the arm folders of ${caseDir} hold different numbers of runs: ${looks.join(', ')}`);
  if (looks[0] >= MAX_LOOKS) fail(`${caseDir} holds ${MAX_LOOKS} looks, the most that a sequential decision takes`);
  return looks[0] + 1;
}

// The runs of the looks of `sequential-plan --looks`: look k has the run k, so the list is 1 to the last look, at most
// MAX_LOOKS looks.
function parseLooks(value) {
  const runs = parseList(value, '--looks').map(Number);
  const expected = Array.from({ length: runs.length }, (_, index) => index + 1);
  if (runs.join(',') !== expected.join(',') || runs.length > MAX_LOOKS) {
    fail(`sequential-plan --looks takes the runs 1 to k of the looks 1 to k, k at most ${MAX_LOOKS}, not ${value}`);
  }
  return runs;
}

// One arm of `sequential-plan`: `<arm>@<configuration>`, with one configuration for the arm. The same arm can come
// twice with two configurations, for example C3@high and C3@medium for an effort choice.
function parseEntry(text, option) {
  const match = /^([^@\s]+)@([^@\s]+)$/.exec(text);
  if (!match) fail(`${option} takes <arm>@<configuration>, for example C3@high, not ${text}`);
  const [, arm, config] = match;
  return { arm, config, folder: armFolder(arm, config) };
}

// The `sequential-plan` command: it declares the whole grid of a sequential decision once, before any case. It takes
// every case file of the decision (`cases`), the reference arm and the candidate arms, each with its configuration
// (`reference`, `candidates`: `<arm>@<configuration>`; an A/A control copy of the reference is a candidate too), and
// the runs of the looks (`looks`, for example 1,2,3,4). Each configuration must be in the list that `agents` wrote.
// It writes `<out>/run-plan.json` (see score.mjs readRunPlan): the reference, the candidates, the looks, and one key
// for every case, declared arm, and run of every look, with the configuration of the arm. It refuses a file that
// exists. `case --sequential` then prepares the declared arms of a case, and `score.mjs report --sequential` compares
// the reference with each candidate and holds a look until every key of it and the earlier looks has a valid run.
export function sequentialPlan(options, repo) {
  for (const name of ['cases', 'reference', 'candidates', 'looks', 'out']) {
    if (!options[name]) fail(`sequential-plan needs --${name}`);
  }
  const file = path.join(path.resolve(options.out), RUN_PLAN);
  if (fs.existsSync(file)) {
    fail(`${file} exists; a sequential decision declares its plan once, so choose another --out`);
  }
  const reference = parseEntry(options.reference, '--reference');
  const candidates = parseList(options.candidates, '--candidates').map((text) => parseEntry(text, '--candidates'));
  const entries = [reference, ...candidates];
  const folders = entries.map((entry) => entry.folder);
  if (new Set(folders).size !== folders.length) {
    fail(
      `sequential-plan declares the arm folder ${folders.find((folder, index) => folders.indexOf(folder) !== index)} twice`,
    );
  }
  const configNames = [...new Set(entries.map((entry) => entry.config))];
  const lists = selectConfigs({ ...options, configs: configNames.join(',') }, repo);
  const runs = parseLooks(options.looks);
  const cases = parseList(options.cases, '--cases').map((file) => {
    const casePath = path.resolve(file);
    const caseData = validateCase(readJson(casePath));
    if (path.basename(casePath) !== `${caseData.id}.json`) {
      fail(`case file ${casePath} must be named ${caseData.id}.json`);
    }
    parseArms([...new Set(entries.map((entry) => entry.arm))].join(','), caseData.kind, lists);
    return caseData;
  });
  const ids = cases.map((caseData) => caseData.id);
  if (new Set(ids).size !== ids.length) fail(`sequential-plan --cases names a case twice: ${ids.join(', ')}`);
  const keys = cases.flatMap((caseData) =>
    entries.flatMap((entry) =>
      runs.map((run) => ({ case: caseData.id, split: caseData.split ?? null, ...entry, run, look: run })),
    ),
  );
  writeJson(file, { reference, candidates, looks: runs, keys });
  console.log(
    `wrote ${file}: ${cases.length} cases x ${folders.join(', ')} x ${runs.length} looks, ${keys.length} keys`,
  );
}

// The arms of a `case --sequential` call for the case `caseData` in the workspace `ws`: every arm folder that
// `<ws>/run-plan.json` declares for the case, as `{ arm, config }` with the configuration of `lists`, and `runs`, the
// declared run numbers of the case. The declaration, not the options, gives the arms, so each look prepares every
// declared arm of the case. `--arms` and `--configs` may only repeat the declared arms and configurations. The call
// refuses a workspace without the file and a case that the file does not declare.
function declaredEntries(ws, caseData, options, lists) {
  const file = path.join(ws, RUN_PLAN);
  const plan = fromScore(() => readRunPlan(ws));
  if (plan === null) fail(`case --sequential needs ${file}; run prepare.mjs sequential-plan first`);
  const keys = plan.keys.filter((key) => key.case === caseData.id);
  if (keys.length === 0)
    fail(`${file} does not declare ${caseData.id}; case --sequential prepares only declared cases`);
  const folders = [...new Set(keys.map((key) => key.folder))];
  const entries = folders.map((folder) => {
    const key = keys.find((entry) => entry.folder === folder);
    const config = lists.configs.find((entry) => entry.name === key.config);
    if (!config) fail(`${file} declares the configuration ${key.config}, which ${lists.file} does not hold`);
    return { arm: key.arm, config };
  });
  const declaredArms = [...new Set(entries.map((entry) => entry.arm))];
  const declaredConfigs = [...new Set(entries.map((entry) => entry.config.name))];
  const same = (value, declared) =>
    [...new Set(value.split(',').map((item) => item.trim()))].sort().join(',') === [...declared].sort().join(',');
  if (options.arms && !same(options.arms, declaredArms)) {
    fail(
      `${file} declares the arms ${declaredArms.join(', ')} for ${caseData.id}; case --sequential prepares all of them, so leave out --arms ${options.arms}`,
    );
  }
  if (options.configs && !same(options.configs, declaredConfigs)) {
    fail(
      `${file} declares the configurations ${declaredConfigs.join(', ')} for ${caseData.id}; case --sequential prepares all of them, so leave out --configs ${options.configs}`,
    );
  }
  parseArms(declaredArms.join(','), caseData.kind, lists);
  return { entries, runs: [...new Set(keys.map((key) => key.run))] };
}

// The `case` command. `repo` is the git repository of the case commits. With `loop`, each run starts a review loop
// in `run-<k>/round-1/`, whose mode the round policy of the arm picks, and the meta.json of the run records that
// policy. `prepareLoop` builds the later rounds with the policy that this meta.json records. With `extend`, the case
// folder exists: `case` adds the folders of the arms and keeps the snapshot, the diffs, and every other arm folder; it
// writes the base-instructions folder of a code case only when the case folder has none. With `sequential`, `case`
// takes its arms and configurations from run-plan.json (see declaredEntries): it builds the first look of every
// declared arm folder of the case (one run each), or, when the case folder exists, adds the next look: one run to each
// of these folders (see nextLook), up to the last declared look. Each run of an arm with a contract overlay gets its copy of
// the plan contract (see writeContractCopy), and its meta.json records whether the contract change applied
// (`contractOverlay`). The judge gets the same copy as `<ws>/contracts/<run label>.md` (JUDGE_CONTRACTS), so that it
// judges the findings of the run under the contract that the reviewer read. When the list of configurations has a
// manager setting, the meta.json of each run (of round 1 of a loop) records it as `managerConfig`, which marks the run
// for the manager stage.
export function prepareCase(options, repo) {
  if (!options.case) fail('case needs --case <path to case.json>');
  if (!options.out) fail('case needs --out <workspace dir>');
  if (options.sequential && options.runs !== undefined) {
    fail('case --sequential adds one run per case for each look; leave out --runs');
  }
  if (options.sequential && options.extend) {
    fail('case --sequential adds a look to an existing case folder by itself; leave out --extend');
  }
  const casePath = path.resolve(options.case);
  const caseData = validateCase(readJson(casePath));
  if (path.basename(casePath) !== `${caseData.id}.json`)
    fail(`case file ${casePath} must be named ${caseData.id}.json`);
  const keys = keyFolder(caseData, options.keys);
  if (options.loop && caseData.kind !== 'code') {
    fail(`--loop takes code cases; ${caseData.id} is a ${caseData.kind} case`);
  }
  // The list of configurations names the variants and the self-review roots, which give the variant arms of the plan
  // kinds and the self-review root arms of the code kind.
  // A sequential call takes every configuration of the list and keeps the ones that run-plan.json declares.
  const lists = selectConfigs(options.sequential ? { ...options, configs: undefined } : options, repo);
  const { fixer, manager, variants, selfReviewRoots, candidateContractDiff, file: configsFile } = lists;
  const specOf = (arm) => armSpec(caseData.kind, arm, { variants, candidateContractDiff, selfReviewRoots });
  const declared = options.sequential ? declaredEntries(path.resolve(options.out), caseData, options, lists) : null;
  // Each entry is one arm folder: an arm at a configuration.
  const entries =
    declared?.entries ??
    lists.configs.flatMap((config) => parseArms(options.arms, caseData.kind, lists).map((arm) => ({ arm, config })));
  const arms = [...new Set(entries.map((entry) => entry.arm))];
  const configs = [...new Set(entries.map((entry) => entry.config))];
  if (options.loop) checkLoopArms(arms, specOf);
  // A candidate contract overlay reaches only the prompts that case writes; the later rounds of a loop would review
  // without the contract copy, so a loop of a candidate arm cannot measure the change.
  const overlaid = candidateContractDiff ? arms.filter((arm) => specOf(arm).contractDiff) : [];
  if (options.loop && overlaid.length) {
    fail(
      `case --loop does not take a candidate contract overlay (${overlaid.join(', ')}): the later rounds of a loop would review without the contract copy; build single-round runs, or run agents without --candidate-contract-overlay`,
    );
  }
  const runs = options.sequential ? FIRST_LOOK_RUNS : parseRuns(options.runs);
  // A loop records the fixer setting, so that `score.mjs report` can check the transcript of each fixer against it.
  if (options.loop && !fixer) fail(`${configsFile} has no fixer setting; run prepare.mjs agents again`);
  const caseDir = path.join(path.resolve(options.out), caseData.id);
  const paths = workspacePaths(caseDir, caseData);
  const addLook = options.sequential && fs.existsSync(caseDir);
  const extending = options.extend || addLook;
  if (extending) {
    checkExtend(casePath, caseDir, paths);
  } else if (fs.existsSync(caseDir)) {
    fail(`${caseDir} exists; remove it, choose another --out, or add arms with --extend`);
  }
  const armDirs = entries.map(({ arm, config }) => path.join(caseDir, armFolder(arm, config.name)));
  let firstRun = 1;
  if (addLook) {
    firstRun = nextLook(caseDir, armDirs);
  } else {
    const existing = armDirs.find((dir) => fs.existsSync(dir));
    if (existing) fail(`${existing} exists; leave its arm out of --arms`);
  }
  const lastRun = firstRun + runs - 1;
  if (declared && !declared.runs.includes(firstRun)) {
    fail(
      `${path.resolve(options.out, RUN_PLAN)} declares no look ${firstRun} of ${caseData.id}; the decision has ${declared.runs.length} looks`,
    );
  }
  const sources = caseSources(caseData, path.dirname(casePath), keys);
  const commits = caseCommits(repo, caseData);
  const hidden = hiddenPathspec(repo, caseData);

  const runFolders = [];
  const runMetas = [];
  const loopModes = new Map();
  const overlays = new Map();
  const judgeContracts = path.join(path.dirname(caseDir), JUDGE_CONTRACTS);
  const judgeCopies = [];
  const managerConfig = manager ? { managerConfig: manager } : {};
  // With --extend or a new look, a code case folder of an earlier version has no base-instructions folder; this call
  // then writes it and removes it again when it stops.
  const addBase = extending && !isPlanKind(caseData.kind) && !fs.existsSync(paths.baseInstructions);
  try {
    let tree = null;
    if (!extending) {
      tree = buildCaseWorkspace({ repo, caseData, commits, hidden, casePath, sources, caseDir, paths });
    } else if (options.loop || addBase) {
      tree = withIndex(caseDir, (env) => {
        readReviewed(repo, env, { caseData, commits, sources });
        return writeTree(repo, env);
      });
    }
    if (addBase) writeBaseInstructions(repo, hidden, commits.base, tree, caseDir, commits.delta_base);
    const fullLines = options.loop ? diffSize(repo, hidden, commits.base, tree) : null;
    for (const config of configs) {
      for (const arm of arms) {
        // A sequential declaration need not hold every pair of its arms and configurations.
        if (!entries.some((entry) => entry.arm === arm && entry.config === config)) continue;
        const spec = specOf(arm);
        const { policy, mode: armMode, reviewers: armReviewers, contractDiff } = spec;
        const mode = options.loop ? roundMode({ policy, round: 1, fullLines }) : armMode;
        const reviewers = options.loop ? MODE_REVIEWERS[mode] : armReviewers;
        if (options.loop) loopModes.set(arm, mode);
        const promptsFor = (promptPaths) =>
          reviewers.map((reviewer) => ({
            reviewer,
            text: buildPromptFile({ caseData, arm, spec, config: config.name, reviewer, paths: promptPaths, mode }),
          }));
        // The prompt of a run with a contract overlay names the copy of the plan contract in its own run folder.
        const prompts = contractDiff ? null : promptsFor(paths);
        for (let run = firstRun; run <= lastRun; run += 1) {
          const folder = armFolder(arm, config.name);
          const runDir = path.join(caseDir, folder, `run-${run}`);
          if (options.loop) {
            runMetas.push({ file: path.join(runDir, 'meta.json'), meta: { policy } });
            const meta = { config, fixerConfig: fixer, ...managerConfig, mode, fullLines };
            runFolders.push({ dir: path.join(runDir, 'round-1'), meta, prompts });
          } else if (contractDiff) {
            const contract = path.join(runDir, CONTRACT_COPY);
            const contractOverlay = writeContractCopy(paths.snapshot, contractDiff, contract);
            overlays.set(arm, contractOverlay);
            const judgeCopy = path.join(judgeContracts, `${runLabel(caseData.id, folder, `run-${run}`)}.md`);
            fs.mkdirSync(judgeContracts, { recursive: true });
            fs.copyFileSync(contract, judgeCopy);
            judgeCopies.push(judgeCopy);
            const runPrompts = promptsFor({ ...paths, contract });
            runFolders.push({ dir: runDir, meta: { config, ...managerConfig, contractOverlay }, prompts: runPrompts });
          } else {
            runFolders.push({ dir: runDir, meta: { config, ...managerConfig }, prompts });
          }
        }
      }
    }
    writeRuns(runFolders);
    for (const { file, meta } of runMetas) writeJson(file, meta);
  } catch (error) {
    // A failed call removes what it wrote: the case folder, with --extend only the new arm folders and the
    // base-instructions folder that it added, and for a new look only the run folders of that look; and the judge
    // copies of the plan contract.
    const lookDirs = armDirs.flatMap((dir) =>
      Array.from({ length: runs }, (_, index) => path.join(dir, `run-${firstRun + index}`)),
    );
    const added = [...(addLook ? lookDirs : armDirs), ...(addBase ? [paths.baseInstructions] : [])];
    for (const dir of [...(extending ? added : [caseDir]), ...judgeCopies]) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
    removeIfEmpty(judgeContracts);
    throw error;
  }
  const prompts = runFolders.reduce((sum, run) => sum + run.prompts.length, 0);
  const runsNote = addLook ? `run ${firstRun} (look ${firstRun} of at most ${MAX_LOOKS})` : `${runs} runs`;
  const counts = declared
    ? `${armDirs.map((dir) => path.basename(dir)).join(', ')} x ${runsNote}`
    : `${arms.join(', ')} x ${configs.length} configurations x ${runsNote}`;
  const notes = (label, entries) =>
    entries.size ? `; ${label}: ${[...entries].map(([arm, value]) => `${arm} ${value}`).join(', ')}` : '';
  const verb = extending ? 'extended' : 'prepared';
  const summary = `${counts}${notes('round 1 modes', loopModes)}${notes('contract overlay', overlays)}`;
  console.log(`${verb} ${caseDir}: ${prompts} prompts for ${summary}`);
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

// A finding as the reviewer wrote it: `- [<severity>] <category> - <locator> - <text>` for a code finding, and
// `- <kind> - <locator> - <text>` for a plan finding, which has no severity.
function findingLine({ severity, category, locator, text }) {
  const fields = [category, locator, text].filter(Boolean).join(' - ');
  return severity ? `- [${severity}] ${fields}` : `- ${fields}`;
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
  // armSpec also resolves the control copy A<arm> of a loop arm, which runs the loop of its arm.
  const spec = armSpec('code', arm);
  if (!RUN_FOLDER.test(runName) || !armName.includes('-') || !fs.existsSync(path.join(caseDir, 'case.json')))
    fail(`--run must name a run folder <ws>/<case>/<arm>-<config>/run-<k>, not ${runDir}`);
  const caseData = validateCase(readJson(path.join(caseDir, 'case.json')));
  if (caseData.kind !== 'code' || !spec?.policy) {
    const loopArms = Object.keys(ARMS.code).filter((name) => ARMS.code[name].policy);
    fail(
      `loop takes the runs of the code arms ${loopArms.join(', ')} and of their control copies A<arm>; ${caseId} is a ${caseData.kind} case and ${arm} is its arm`,
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
      const round = promptRound + 1;
      const prompt = { caseData, arm, spec, config: config.name, reviewer, paths, mode: nextMode, round };
      return { reviewer, text: buildPromptFile(prompt) };
    });
    const meta = { config, mode: nextMode, head, repairsOnly, fullLines, deltaLines };
    fs.mkdirSync(nextDir);
    try {
      checkoutSnapshot(repo, hidden, env, paths.snapshot);
      const full = treeDiff(repo, hidden, base, tree);
      fs.writeFileSync(paths.fullDiff, full);
      if (nextMode === 'panel') writeFocusDiffs(repo, hidden, base, tree, paths, full);
      writeBaseInstructions(repo, hidden, base, tree, nextDir, reviewedTree);
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

// A block holds a review with one of these verdicts (see score.mjs REVIEW_VERDICTS). The manager stage takes a round
// only when each of its blocks holds a review.
const REVIEWED = new Set(['pass', 'repair', 'fixes-required']);

// The prompt of the manager of one review round, which lists each finding of the round with its id. Like a reviewer
// prompt, line 1 names the agent. `inputs` are the lines that name the reviewed inputs of the round.
function managerPrompt({ round, inputs, findings, verdictFile }) {
  return [
    `agent: ${MANAGER_AGENT}`,
    '',
    `Reproduce or reject each finding of review round ${round}.`,
    '',
    ...inputs,
    `Verdict file: ${verdictFile}`,
    ...findings.map((finding) => `Finding ${finding.id}: ${findingLine(finding)}`),
    '',
    'Rules:',
    '- The snapshot root holds the reviewed repository files, without Git history. Take evidence only from files under the snapshot root, the files that this message names, and official documentation on the web. Do not open any page of the DocksDocks/docks repository.',
    '- For each finding, try to reproduce the claim. Read the code or the plan at its locator and trace the claim. When a command shows the fault, run it in a scratch copy outside the snapshot root.',
    '- Give `reproduced` when the snapshot shows the defect. Give `rejected` when the claim is false in the snapshot, when the plan records the behavior as intended, or when the finding names no defect.',
    '- Give evidence for each verdict: a file and line, a plan section, a command and its output, or a documentation URL.',
    '- Do not change, add, or delete files under the snapshot root. Do not repair a finding.',
    '- Do not fetch GitHub issues or pull requests.',
    '- Write one line per finding to the verdict file, in the order of the list: the finding id, a colon, `reproduced` or `rejected`, a dash, and the evidence. For example: `<finding id>: rejected - src/a.mjs:12 already checks the empty list.`',
    '- Reply with the same lines.',
    '',
  ].join('\n');
}

// The lines of a manager prompt that name the reviewed inputs of a round: the snapshot, the plan export, and the diff
// and the base-instructions folder that the reviewers of the round had. A delta round also names the delta diff (for
// a code kind; a plan kind has its plan diff), the previous round comment, and the rejection comment when the round
// has one, as the delta reviewer had them (see buildTail). Round 1, and a run without round folders, has the inputs
// in the case folder; a later round of a loop has them in its round folder.
function managerInputs(caseDir, kind, dir, round) {
  const inputDir = round > 1 ? dir : caseDir;
  const hasRejection = fs.existsSync(path.join(inputDir, 'rejection.md'));
  const paths = reviewPaths(inputDir, path.join(caseDir, 'plan.md'), hasRejection);
  const lines = [`Repository snapshot root: ${paths.snapshot}`, `Plan export: ${paths.plan}`];
  const diff = isPlanKind(kind) ? path.join(caseDir, 'plan.diff') : paths.fullDiff;
  if (fs.existsSync(diff)) lines.push(`${isPlanKind(kind) ? 'Plan diff' : 'Full diff'}: ${diff}`);
  if (fs.existsSync(paths.baseInstructions)) lines.push(`Base instructions: ${paths.baseInstructions}`);
  if (deltaRound(dir)) {
    if (!isPlanKind(kind)) lines.push(`Delta diff: ${paths.deltaDiff}`);
    lines.push(`Previous round comment: ${paths.previousReview}`);
    if (paths.rejection) lines.push(`Rejection comment: ${paths.rejection}`);
  }
  return lines;
}

// Tells whether the round in `dir` is a delta round: a reviewer prompt of the round gives the delta mode (see
// buildTail). A run without round folders records no mode in its meta.json, so the prompts are the one source for
// every round.
function deltaRound(dir) {
  const promptsDir = path.join(dir, 'prompts');
  if (!fs.existsSync(promptsDir)) return false;
  return fs
    .readdirSync(promptsDir)
    .filter((name) => name.endsWith('.txt'))
    .some((name) => fs.readFileSync(path.join(promptsDir, name), 'utf8').split('\n').includes(modeLine('delta')));
}

// The `manager` command. It writes the manager prompt `manager/manager-1.txt` of each review round of the workspace
// `ws` that has findings in findings.json (a run folder without round folders, or a round folder of a loop): the
// manager stage of ../SKILL.md. It skips a round whose blocks do not all hold a review (dispatch its reviewers again
// first) and a run whose meta.json (or round-1/meta.json) records no manager setting (`managerConfig`, see
// prepareCase), and it names both. A prompt that exists with the same text stays. A prompt whose text changed, for
// example after a reviewer was dispatched again, is written again, and the verdict file of the earlier prompt goes.
export function prepareManager(options) {
  if (!options.ws) fail('manager needs --ws <workspace dir>');
  const ws = path.resolve(options.ws);
  const findingsFile = path.join(ws, 'findings.json');
  if (!fs.existsSync(findingsFile)) fail(`${findingsFile} is missing; run score.mjs findings first`);
  const doc = readJson(findingsFile);
  const rounds = new Map();
  const roundOf = (entry) => {
    const key = `${entry.case}/${entry.arm}/${entry.run}/${entry.round ?? ''}`;
    if (!rounds.has(key)) rounds.set(key, { ...entry, blocks: [], findings: [] });
    return rounds.get(key);
  };
  for (const block of doc.blocks) roundOf(block).blocks.push(block);
  for (const finding of doc.findings) roundOf(finding).findings.push(finding);
  const counts = { written: 0, unchanged: 0 };
  const incomplete = [];
  const unset = new Set();
  for (const entry of rounds.values()) {
    if (entry.findings.length === 0) continue;
    const caseDir = path.join(ws, entry.case);
    const runDir = path.join(caseDir, entry.arm, entry.run);
    const dir = entry.round === undefined ? runDir : path.join(runDir, `round-${entry.round}`);
    const label = path.relative(ws, dir);
    if (entry.blocks.some((block) => !REVIEWED.has(block.verdict))) {
      incomplete.push(label);
      continue;
    }
    const metaOf = (file) => (fs.existsSync(file) ? readJson(file) : {});
    const managed =
      metaOf(path.join(runDir, 'meta.json')).managerConfig ??
      metaOf(path.join(runDir, 'round-1', 'meta.json')).managerConfig;
    if (!managed) {
      unset.add(path.relative(ws, runDir));
      continue;
    }
    const { kind } = readJson(path.join(caseDir, 'case.json'));
    const managerDir = path.join(dir, MANAGER_DIR);
    const promptFile = path.join(managerDir, `${MANAGER_NAME}.txt`);
    const verdictFile = path.join(managerDir, MANAGER_VERDICTS);
    const text = managerPrompt({
      round: entry.round ?? 1,
      inputs: managerInputs(caseDir, kind, dir, entry.round ?? 1),
      findings: entry.findings,
      verdictFile,
    });
    if (fs.existsSync(promptFile) && fs.readFileSync(promptFile, 'utf8') === text) {
      counts.unchanged += 1;
      continue;
    }
    fs.mkdirSync(managerDir, { recursive: true });
    fs.rmSync(verdictFile, { force: true });
    fs.writeFileSync(promptFile, text);
    counts.written += 1;
  }
  console.log(`manager prompts: ${counts.written} written, ${counts.unchanged} unchanged`);
  if (incomplete.length) {
    console.log(`rounds with a block without a review, so no manager prompt: ${incomplete.join(', ')}`);
  }
  if (unset.size) {
    console.log(`runs without a manager setting, so no manager stage: ${[...unset].join(', ')}`);
  }
  return counts;
}

// Extracts the plugin folder `pluginPath` (default plugins/plan-lifecycle) at `sha` into `dir`: the baseline copy,
// the copy of a variant, or the plugins/docks copy of a self-review root. A marker file records the commit, so a later
// call reuses the copy or replaces a copy of another commit.
function extractPlugin(repo, sha, dir, pluginPath = PLUGIN_PATH) {
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
    git(repo, ['read-tree', `${sha}:${pluginPath}`], { env });
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

// An omp model selector names its provider before the first `/`, and takesServiceTier tests that part. A selector
// without it would get the tier null also for an OpenAI model, so its agents would run at the global tier of the
// session.
function requireProvider(option, model) {
  if (model.indexOf('/') < 1) {
    fail(`${option} ${model} has no provider part; give <provider>/<model>, for example ${FIXER_DEFAULTS.model}`);
  }
}

function parseModels(value, runtime) {
  if (!value) fail('agents needs --model <selector>[,<selector>...]');
  const models = parseList(value, '--model');
  const suffixed = models.find((model) => EFFORT_SUFFIX.test(model));
  if (suffixed) fail(`--model ${suffixed} has an effort suffix; give the effort with --efforts`);
  if (runtime === 'omp') for (const model of models) requireProvider('--model', model);
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

// The model, effort, and tier of the helper agent of `role`, `fixer` or `manager`, from the options
// `--<role>-model`, `--<role>-effort`, and `--<role>-tier` and the setting `defaults` ({ model, effort, tier }). The
// fixer defaults hold for omp; Claude Code needs a fixer model of its own and takes no tier. The manager defaults are
// the fixer setting. With omp, a model that takes no service tier (see takesServiceTier) gets the tier null and takes
// no `--<role>-tier`; another model without a tier option takes the default tier, else the tier of FIXER_DEFAULTS.
function parseHelper(options, runtime, levels, role, defaults) {
  const model = options[`${role}-model`] ?? defaults.model;
  if (!model) fail(`Claude Code cannot run the default ${role} model; give --${role}-model with --runtime claude`);
  if (EFFORT_SUFFIX.test(model)) {
    fail(`--${role}-model ${model} has an effort suffix; give the effort with --${role}-effort`);
  }
  const effort = options[`${role}-effort`] ?? defaults.effort;
  if (!levels.includes(effort)) fail(`--${role}-effort does not take ${effort}; use ${levels.join(', ')}`);
  if (runtime === 'claude') {
    if (options[`${role}-tier`]) {
      fail(`Claude Code sets no service tier per agent; omit --${role}-tier with --runtime claude`);
    }
    return { model, effort, tier: null };
  }
  requireProvider(`--${role}-model`, model);
  if (!takesServiceTier(model)) {
    if (options[`${role}-tier`]) {
      fail(
        `--${role}-tier: omp sets no service tier for ${model}, whose provider does not start with openai; omit --${role}-tier`,
      );
    }
    return { model, effort, tier: null };
  }
  const tier = options[`${role}-tier`] ?? defaults.tier ?? FIXER_DEFAULTS.tier;
  if (!OMP_TIERS.includes(tier)) fail(`--${role}-tier does not take ${tier}; use ${OMP_TIERS.join(', ')}`);
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
// settings of the fixer agent and of the manager agent that `agents` wrote (undefined in a file without one); the
// variants and the self-review roots that `agents` wrote (none in a file without them); and the file that holds them.
function selectConfigs(options, repo) {
  const project = projectDir(options, repo);
  const files = Object.values(RUNTIME_AGENT_DIRS)
    .map((dir) => path.join(project, dir, CONFIGS_FILE))
    .filter((file) => fs.existsSync(file));
  if (files.length === 0) fail(`${project} has no configurations; run prepare.mjs agents with the same --project`);
  if (files.length > 1) fail(`${files.join(' and ')} both exist; run prepare.mjs clean and then agents`);
  const { configs, fixer, manager, variants = [], selfReviewRoots = [], candidateContractDiff } = readJson(files[0]);
  const known = configs.map((config) => config.name);
  const selected = options.configs
    ? parseList(options.configs, '--configs', known).map((name) => configs[known.indexOf(name)])
    : configs;
  return { configs: selected, fixer, manager, variants, selfReviewRoots, candidateContractDiff, file: files[0] };
}

// The diff of the plan contract from the baseline commit `sha` (at the ref `ref`) to the working tree: the contract
// change of the candidate code reviewer for `agents --candidate-contract-overlay`.
function candidateContractDiff(repo, sha, ref) {
  const diff = git(repo, ['diff', ...DIFF_FLAGS, sha, '--', `:(literal)${CONTRACT_PATH}`]).toString();
  if (!diff)
    fail(`agents --candidate-contract-overlay: the working tree does not change ${CONTRACT_PATH} against ${ref}`);
  return diff;
}

// The diff of the plan contract from the first parent of the commit `sha` (at the ref `ref`) to the commit: the
// contract change of a variant of --contract-overlay. `label` starts the message when the commit does not change the
// contract.
function contractDiff(repo, sha, ref, label) {
  const diff = git(repo, ['diff', ...DIFF_FLAGS, `${sha}^1`, sha, '--', `:(literal)${CONTRACT_PATH}`]).toString();
  if (!diff) {
    fail(
      `${label}: ${ref} does not change ${CONTRACT_PATH} against its first parent; leave it out of --contract-overlay`,
    );
  }
  return diff;
}

// The variants of --variants, in its order: one { name, ref, sha, delta, dir, text } per `<name>=<git ref>` entry.
// `dir` is the folder of the plugin copy of the variant, next to the baseline copy, and `text` is the plan-reviewer
// agent at the ref. delta is false for a variant of --full-only, which has no delta mode. A variant of
// --contract-overlay also has `contractDiff` (see contractDiff). Every check runs here, before `agents` changes a file.
function parseVariants(options, repo, baselineDir) {
  const variantNames = (option) => (options[option] === undefined ? [] : parseList(options[option], `--${option}`));
  const fullOnly = variantNames('full-only');
  const overlay = variantNames('contract-overlay');
  const named = { '--full-only': fullOnly, '--contract-overlay': overlay };
  if (options.variants === undefined) {
    const option = Object.keys(named).find((key) => named[key].length);
    if (option) fail(`${option} names variants of --variants; give --variants too`);
    return [];
  }
  const entries = options.variants.split(',').map((entry) => entry.trim());
  if (entries.includes('')) fail(`--variants has an empty entry: ${options.variants}`);
  const variants = entries.map((entry) => {
    const at = entry.indexOf('=');
    if (at < 1 || at === entry.length - 1) fail(`--variants: ${entry} is not <name>=<git ref>`);
    const name = entry.slice(0, at);
    if (!VARIANT_NAME.test(name)) fail(`--variants: the variant name ${name} has a character other than a-z and 0-9`);
    return { name, ref: entry.slice(at + 1), dir: path.join(path.dirname(baselineDir), `variant-${name}-plugin`) };
  });
  const names = variants.map((variant) => variant.name);
  const twice = names.find((name, index) => names.indexOf(name) !== index);
  if (twice) fail(`--variants: the variant name ${twice} occurs two times`);
  for (const [option, list] of Object.entries(named)) {
    const other = list.find((name) => !names.includes(name));
    if (other) fail(`${option} names ${other}, which is not a variant`);
  }
  // Each plugin copy needs a folder of its own: a copy in the folder of another copy would replace it, and the agents
  // of the other copy would then load its files.
  const copies = [
    { label: 'the baseline copy', dir: baselineDir },
    ...variants.map(({ name, dir }) => ({ label: `the copy of variant ${name}`, dir })),
  ];
  for (const [index, copy] of copies.entries()) {
    const earlier = copies.slice(0, index).find((other) => other.dir === copy.dir);
    if (earlier) fail(`${earlier.label} and ${copy.label} both go to ${copy.dir}; give another --baseline-dir`);
  }
  const source = `${PLUGIN_PATH}/agents/plan-reviewer.md`;
  return variants.map(({ name, ref, dir }) => {
    const sha = resolveCommit(repo, ref, `variant ${name}: ref`);
    const blob = runGit(repo, ['cat-file', 'blob', `${sha}:${source}`]);
    if (blob.status !== 0) fail(`${source} does not exist at ${ref} (variant ${name})`);
    const text = blob.stdout.toString();
    // score.mjs takes the plugin root of a reviewer from the path of its reviewer skill in the agent text. An agent
    // text that names no such path, or another root, would make every run of the variant read outside its inputs.
    const roots = reviewerPluginRoots(text.replaceAll(PLUGIN_ROOT_TOKEN, dir));
    if (roots.length !== 1 || roots[0] !== dir) {
      fail(
        `variant ${name}: ${source} at ${ref} must name its reviewer skill as ${PLUGIN_ROOT_TOKEN}/skills/<folder>/plan-reviewer/SKILL.md and name no other plugin root`,
      );
    }
    const variant = { name, ref, sha, delta: !fullOnly.includes(name), dir, text };
    if (overlay.includes(name)) variant.contractDiff = contractDiff(repo, sha, ref, `variant ${name}`);
    return variant;
  });
}

// The SKILL.md file of each self-review skill under the plugin folder `files` lists (paths relative to the plugin
// folder), as `{ <skill>: <path relative to the plugin folder> }`. A skill sits in `skills/<skill>/` or in a category
// folder `skills/<folder>/<skill>/`. `label` starts the message when a skill is missing.
function selfReviewSkillFiles(files, label) {
  const found = {};
  for (const skill of SELF_REVIEW_SKILLS) {
    const pattern = new RegExp(`^skills/(?:[^/]+/)?${skill}/SKILL\\.md$`);
    const file = files.find((name) => pattern.test(name));
    if (!file) fail(`${label} has no ${SKILLS_PLUGIN_PATH}/skills/[<folder>/]${skill}/SKILL.md`);
    found[skill] = file;
  }
  return found;
}

// The files under the folder `dir`, as paths relative to it with `/` separators.
function filesBelow(dir, prefix = '') {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const relative = `${prefix}${entry.name}`;
    return entry.isDirectory() ? filesBelow(path.join(dir, entry.name), `${relative}/`) : [relative];
  });
}

// The self-review roots of --self-review-roots, in its order: one { name, source, sha, dir, skills } per entry
// `<name>=<git ref>` or `<name>=worktree`. A ref root is the copy of plugins/docks at the ref in the folder
// `selfreview-<name>-plugin/` next to the baseline copy (`sha` is its commit); the worktree root is plugins/docks of
// the working tree (`sha` is null). `skills` maps each self-review skill to its SKILL.md file under `dir`. A root gives
// the arms S1<name> and S3<name> one self-review agent per configuration, whose name must differ from the name of
// each default self-review agent of `configNames`. Every check runs here, before `agents` changes a file.
function parseSelfReviewRoots(options, repo, { baselineDir, variants, configNames }) {
  const value = options['self-review-roots'];
  if (value === undefined) return [];
  const entries = value.split(',').map((entry) => entry.trim());
  if (entries.includes('')) fail(`--self-review-roots has an empty entry: ${value}`);
  const roots = entries.map((entry) => {
    const at = entry.indexOf('=');
    if (at < 1 || at === entry.length - 1) {
      fail(`--self-review-roots: ${entry} is not <name>=<git ref> or <name>=${WORKTREE_ROOT}`);
    }
    const name = entry.slice(0, at);
    if (!VARIANT_NAME.test(name)) {
      fail(`--self-review-roots: the root name ${name} has a character other than a-z and 0-9`);
    }
    const source = entry.slice(at + 1);
    const dir =
      source === WORKTREE_ROOT
        ? path.join(repo, SKILLS_PLUGIN_PATH)
        : path.join(path.dirname(baselineDir), `selfreview-${name}-plugin`);
    return { name, source, dir };
  });
  const names = roots.map((root) => root.name);
  const twice = names.find((name, index) => names.indexOf(name) !== index);
  if (twice) fail(`--self-review-roots: the root name ${twice} occurs two times`);
  const clash = roots
    .flatMap(({ name }) => configNames.map((config) => `${name}-${config}`))
    .find((agent) => configNames.includes(agent));
  if (clash)
    fail(
      `--self-review-roots: the self-review agent of configuration ${clash} would get the name of a root agent; rename the root`,
    );
  const copies = [
    { label: 'the baseline copy', dir: baselineDir },
    ...variants.map(({ name, dir }) => ({ label: `the copy of variant ${name}`, dir })),
  ];
  for (const root of roots.filter(({ source }) => source !== WORKTREE_ROOT)) {
    const other = copies.find((copy) => copy.dir === root.dir);
    if (other)
      fail(
        `${other.label} and the copy of self-review root ${root.name} both go to ${root.dir}; give another --baseline-dir`,
      );
  }
  return roots.map((root) => {
    const label = `self-review root ${root.name} (${root.source})`;
    let sha = null;
    let files;
    if (root.source === WORKTREE_ROOT) {
      files = filesBelow(path.join(root.dir, 'skills'), 'skills/');
    } else {
      sha = resolveCommit(repo, root.source, `self-review root ${root.name}: ref`);
      const prefix = `${SKILLS_PLUGIN_PATH}/`;
      files = git(repo, ['ls-tree', '-r', '-z', '--name-only', '--full-tree', sha, '--', `${prefix}skills`])
        .toString()
        .split('\0')
        .filter((file) => file.startsWith(prefix))
        .map((file) => file.slice(prefix.length));
    }
    const relative = selfReviewSkillFiles(files, label);
    const skills = Object.fromEntries(
      Object.entries(relative).map(([skill, file]) => [skill, path.join(root.dir, ...file.split('/'))]),
    );
    return { ...root, sha, skills };
  });
}

export function prepareAgents(options, repo) {
  if (!options['baseline-ref']) fail('agents needs --baseline-ref <git ref of the last release>');
  const runtime = options.runtime ?? 'omp';
  if (!Object.hasOwn(RUNTIME_AGENT_DIRS, runtime)) fail('--runtime must be omp or claude');
  if (!options.efforts) fail('agents needs --efforts <list>, for example --efforts low,medium,high,xhigh');
  const { key: effortKey, levels } = RUNTIME_EFFORTS[runtime];
  const models = parseModels(options.model, runtime);
  const efforts = parseList(options.efforts, '--efforts', levels);
  const tiers = parseTiers(options.tiers, runtime);
  const configs = buildConfigs({ models, efforts, tiers });
  const fixer = parseHelper(options, runtime, levels, 'fixer', {
    model: runtime === 'omp' ? FIXER_DEFAULTS.model : null,
    effort: FIXER_DEFAULTS.effort,
    tier: FIXER_DEFAULTS.tier,
  });
  const manager = parseHelper(options, runtime, levels, 'manager', fixer);
  const project = projectDir(options, repo);
  let baselineDir;
  if (options['baseline-dir']) baselineDir = path.resolve(options['baseline-dir']);
  else if (options.out) baselineDir = path.resolve(options.out, '..', 'baseline-plugin');
  else fail('agents needs --out <workspace dir> or --baseline-dir <dir> for the baseline plugin copy');

  // The checks of the variants and the self-review roots come before the first file changes.
  const variants = parseVariants(options, repo, baselineDir);
  const configNames = configs.map((config) => config.name);
  const roots = parseSelfReviewRoots(options, repo, { baselineDir, variants, configNames });
  const sha = resolveCommit(repo, options['baseline-ref'], '--baseline-ref');
  const candidateDiff = options['candidate-contract-overlay']
    ? candidateContractDiff(repo, sha, options['baseline-ref'])
    : undefined;
  extractPlugin(repo, sha, baselineDir);
  for (const variant of variants) {
    extractPlugin(repo, variant.sha, variant.dir);
    const modes = variant.delta ? 'full and delta mode' : 'full mode only';
    const overlay = variant.contractDiff ? ', contract overlay' : '';
    const commit = variant.sha.slice(0, 12);
    console.log(`variant ${variant.name}: ${variant.ref} at ${commit}, ${modes}${overlay}, in ${variant.dir}`);
  }
  for (const root of roots) {
    if (root.sha) extractPlugin(repo, root.sha, root.dir, SKILLS_PLUGIN_PATH);
    const origin = root.sha ? `${root.source} at ${root.sha.slice(0, 12)}` : 'the working tree';
    console.log(`self-review root ${root.name}: ${origin}, in ${root.dir}`);
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
    // Each self-review agent gets the model, effort, and tier of the reviewer agents of its configuration: the default
    // agent, which loads the skills through `skill://` URIs, and one agent per self-review root.
    for (const root of [null, ...roots]) {
      const selfReview = selfReviewAgent(config.name, root?.name);
      const selfReviewFile = path.join(agentDir, `${selfReview}.md`);
      const selfReviewText = renderAgent(selfReviewSource(selfReview, selfReviewFile, root?.skills), {
        name: selfReview,
        model: config.model,
        effortKey,
        effort: config.effort,
      });
      fs.writeFileSync(selfReviewFile, selfReviewText);
      if (config.tier !== null) overrides[selfReview] = config.tier;
    }
  }
  for (const [agentFile, source, setting] of [
    [FIXER_AGENT, FIXER_SOURCE, fixer],
    [MANAGER_AGENT, MANAGER_SOURCE, manager],
  ]) {
    const text = renderAgent(source, { name: agentFile, model: setting.model, effortKey, effort: setting.effort });
    fs.writeFileSync(path.join(agentDir, `${agentFile}.md`), text);
    if (setting.tier !== null) overrides[agentFile] = setting.tier;
  }
  const variantList = variants.map(({ name, ref, sha: commit, delta, contractDiff: diff }) => ({
    name,
    ref,
    sha: commit,
    delta,
    ...(diff && { contractDiff: diff }),
  }));
  writeJson(path.join(agentDir, CONFIGS_FILE), {
    configs,
    fixer,
    manager,
    variants: variantList,
    selfReviewRoots: roots,
    ...(candidateDiff && { candidateContractDiff: candidateDiff }),
  });
  const names = configs.map((config) => config.name).join(', ');
  const perConfig = sources.length + 1 + roots.length;
  console.log(`wrote ${configs.length * perConfig} agent files to ${agentDir} for ${names}`);
  if (runtime === 'omp') {
    // A model that takes no service tier drops the --tiers list. The line makes that visible.
    for (const model of models.filter((item) => !takesServiceTier(item))) {
      const dropped = `--tiers ${tiers.join(',')} does not apply to it`;
      console.log(
        `${model} gets the tier null: omp sets a service tier only for a model whose provider starts with openai, so ${dropped}`,
      );
    }
  }
  for (const [label, agentFile, setting] of [
    ['fixer', FIXER_AGENT, fixer],
    ['manager', MANAGER_AGENT, manager],
  ]) {
    const tier = setting.tier === null ? '' : `, tier ${setting.tier}`;
    console.log(`wrote the ${label} agent ${agentFile}: ${setting.model}, effort ${setting.effort}${tier}`);
  }
  if (runtime === 'omp') writeTierOverrides(project, overrides);
}

// One run per configuration: the candidate code agent of the configuration gets a short task, so its transcript
// shows the model, the effort, and the served tier at little cost. The task names the run folder, because
// `score.mjs transcripts` takes only a transcript whose task names a path in the case folder. The probe changes no
// file, so its full.diff is empty: `transcripts` reads full.diff for the read scope of a code run. The manager has one
// setting for every configuration, so the run of the first configuration also gets one manager prompt with the same
// task, and its meta.json records the manager setting as `managerConfig`.
function prepareProbe(options, repo) {
  if (!options.out) fail('probe needs --out <workspace dir>');
  const { configs, manager } = selectConfigs(options, repo);
  const caseDir = path.join(path.resolve(options.out), PROBE_CASE.id);
  if (fs.existsSync(caseDir)) fail(`${caseDir} exists; remove it or choose another --out`);
  writeJson(path.join(caseDir, 'case.json'), PROBE_CASE);
  fs.writeFileSync(path.join(caseDir, 'full.diff'), '');
  const task = (agent, dir) => `agent: ${agent}\n\n${PROBE_TASK}\n\nRun folder: ${dir}\n`;
  const runDir = (config) => path.join(caseDir, armFolder(PROBE_ARM, config.name), 'run-1');
  writeRuns(
    configs.map((config, index) => {
      const agent = armAgent('code', ARMS.code[PROBE_ARM].side, config.name);
      const meta = index === 0 && manager ? { config, managerConfig: manager } : { config };
      return { dir: runDir(config), meta, prompts: [{ reviewer: 'full', text: task(agent, runDir(config)) }] };
    }),
  );
  if (manager) {
    const managerDir = path.join(runDir(configs[0]), MANAGER_DIR);
    fs.mkdirSync(managerDir, { recursive: true });
    fs.writeFileSync(path.join(managerDir, `${MANAGER_NAME}.txt`), task(MANAGER_AGENT, runDir(configs[0])));
  }
  const managerNote = manager ? `, and one manager prompt in ${armFolder(PROBE_ARM, configs[0].name)}` : '';
  console.log(
    `prepared ${caseDir}: one prompt for each of ${configs.map((config) => config.name).join(', ')}${managerNote}`,
  );
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
      extend: { type: 'boolean' },
      sequential: { type: 'boolean' },
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
      'contract-overlay': { type: 'string' },
      'candidate-contract-overlay': { type: 'boolean' },
      'fixer-model': { type: 'string' },
      'fixer-effort': { type: 'string' },
      'fixer-tier': { type: 'string' },
      'manager-model': { type: 'string' },
      'manager-effort': { type: 'string' },
      'manager-tier': { type: 'string' },
      'self-review-roots': { type: 'string' },
      runtime: { type: 'string' },
      out: { type: 'string' },
      'baseline-dir': { type: 'string' },
      ...PROJECT_OPTION,
    },
  },
  manager: { run: prepareManager, options: { ws: { type: 'string' } } },
  'sequential-plan': {
    run: sequentialPlan,
    options: {
      cases: { type: 'string' },
      reference: { type: 'string' },
      candidates: { type: 'string' },
      looks: { type: 'string' },
      out: { type: 'string' },
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
                     [--variants <name>=<git-ref>[,...] [--full-only <name,...>] [--contract-overlay <name,...>]]
                     [--candidate-contract-overlay] [--self-review-roots <name>=<git-ref>|<name>=worktree[,...]]
                     [--fixer-model <m>] [--fixer-effort <e>] [--fixer-tier <t>]
                     [--manager-model <m>] [--manager-effort <e>] [--manager-tier <t>]
                     [--runtime omp|claude] [--project <dir>] (--out <ws> | --baseline-dir <dir>)
  prepare.mjs sequential-plan --cases <case.json,...> --reference <arm>@<config> --candidates <arm>@<config>[,...]
                   --looks <1,...,k> --out <ws> [--project <dir>]
  prepare.mjs case --case <case.json> --arms <list> (--runs <k> | --sequential) --out <ws> [--configs <list>]
                   [--keys <dir>] [--loop] [--extend] [--project <dir>]
  prepare.mjs loop --run <ws>/<case>/<arm>-<config>/run-<k> --cases <dir> [--keys <dir>] [--fixer-patch <file>]
  prepare.mjs manager --ws <ws>
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
