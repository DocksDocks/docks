import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { onTestFinished } from 'vitest';
import { BUN_RUNTIME } from '../../../../cli/test/lib/cliEntry.ts';
import { EFFORT_LEVELS, PROJECT_CONFIG } from '../scripts/omp.mjs';
import * as prepare from '../scripts/prepare.mjs';
import * as score from '../scripts/score.mjs';
import { blindId, findingsCommand, parseTranscript } from '../scripts/score.mjs';

// The checkout that holds the suite, and the skill folder and the scripts that the suite tests.
export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
export const SKILL_DIR = path.join(REPO_ROOT, '.agents/skills/review-benchmark');
export const SCRIPTS_DIR = path.join(SKILL_DIR, 'scripts');
// The plugin root of the reviewer agents, the self-review skills, and the plan contract in the kit layout (score.mjs
// PLUGIN_LAYOUTS).
export const KIT_ROOT = 'SoT/.omp/plugin';

// Vitest runs the suite on Node, and the scripts run on Bun only: prepare.mjs reads and writes the omp project config
// with Bun.YAML. So a test that reaches that code runs it in a Bun child process: the command line of a script, or
// BUN_DRIVER, which calls one export of a script.
const BUN_DRIVER = path.join(path.dirname(fileURLToPath(import.meta.url)), 'bun-driver.mjs');
// BUN_DRIVER prints the result and the error of the call on lines that start with these marks.
export const DRIVER_RESULT = 'bun-driver result: ';
export const DRIVER_ERROR = 'bun-driver error: ';

// Calls the export `name` of the script `script` (a file name in SCRIPTS_DIR) with `args` (JSON values) in a Bun child
// process with the environment `env`. It gives the result and the console.log lines of the call, and throws an error
// with the message of the error of the call, so a test can use it as it uses the export.
export function onBun(script, name, args, { env = process.env, cwd } = {}) {
  const child = spawnSync(BUN_RUNTIME, [BUN_DRIVER, path.join(SCRIPTS_DIR, script), name, JSON.stringify(args)], {
    cwd,
    env,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  const errorLine = child.stderr.split('\n').find((line) => line.startsWith(DRIVER_ERROR));
  if (errorLine) throw new Error(JSON.parse(errorLine.slice(DRIVER_ERROR.length)));
  assert.equal(child.status, 0, `bun-driver ${script} ${name} failed: ${child.stderr}`);
  const lines = child.stdout.split('\n').filter((line) => line !== '');
  const resultLine = lines.find((line) => line.startsWith(DRIVER_RESULT));
  const result = resultLine === undefined ? undefined : JSON.parse(resultLine.slice(DRIVER_RESULT.length));
  return { result, lines: lines.filter((line) => line !== resultLine), stderr: child.stderr };
}

// The omp release that the fake omp names by default: the `verified` pin of SoT/toolchain.json, so the preflight
// gives no warning.
export const VERIFIED_OMP = prepare.ompPins(REPO_ROOT).verified;

// A fake `omp` command for the preflight of `prepare.mjs agents` and `probe` (see prepare.mjs runOmp), so no test runs
// the omp of the user. It is a Bun script in a new scratch folder and answers like omp 19:
// - `--version`: `omp/<version>`;
// - `models find <model> --json`: one model with the efforts `thinking`;
// - `config get <key> --json`: `{ key, value }`. The tier overrides are the merged `task.agentServiceTierOverrides` of
//   `.omp/settings.json` and `.omp/config.yml` (over it) in the working folder, as omp merges the project files;
//   `loadsConfig: false` leaves config.yml out, as an omp that does not load it. `task.enableEffort` is `enableEffort`
//   and `task.structured` is false.
// The result gives the folder of the command and an environment with the folder first on PATH.
export function fakeOmp({ version = VERIFIED_OMP, thinking = EFFORT_LEVELS, enableEffort = false, loadsConfig = true } = {}) {
  const dir = path.join(scratch(), 'bin');
  const facts = { version, thinking, enableEffort, loadsConfig, projectConfig: PROJECT_CONFIG };
  const source = `#!${BUN_RUNTIME}
import fs from 'node:fs';
const facts = ${JSON.stringify(facts)};
const [command, sub, key] = process.argv.slice(2);
const overrides = (file, parse) =>
  fs.existsSync(file) ? (parse(fs.readFileSync(file, 'utf8'))?.task?.agentServiceTierOverrides ?? {}) : {};
const settings = () => ({
  ...overrides('.omp/settings.json', JSON.parse),
  ...(facts.loadsConfig ? overrides(facts.projectConfig, (text) => Bun.YAML.parse(text)) : {}),
});
const values = { 'task.agentServiceTierOverrides': settings, 'task.enableEffort': () => facts.enableEffort, 'task.structured': () => false };
if (command === '--version') {
  console.log('omp/' + facts.version);
} else if (command === 'models' && sub === 'find') {
  const [provider, ...id] = key.split('/');
  console.log(JSON.stringify({ models: [{ provider, id: id.join('/'), selector: key, thinking: facts.thinking }] }));
} else if (command === 'config' && sub === 'get' && values[key]) {
  console.log(JSON.stringify({ key, value: values[key]() }));
} else {
  console.error('fake omp: no answer for ' + process.argv.slice(2).join(' '));
  process.exit(2);
}
`;
  fs.mkdirSync(dir);
  fs.writeFileSync(path.join(dir, 'omp'), source, { mode: 0o755 });
  return { dir, env: { ...process.env, PATH: `${dir}${path.delimiter}${process.env.PATH}` } };
}

// Runs `prepare.mjs agents` (prepareAgents) with `options` on `repo` on Bun, with a fake omp (see fakeOmp) first on
// PATH. It throws the error of `agents`, and gives the result and the console.log lines (see onBun).
export function agentsOnBun(options, repo, omp = fakeOmp()) {
  return onBun('prepare.mjs', 'prepareAgents', [options, repo], { env: omp.env });
}

// The settings object of the omp project config of `project` (`.omp/config.yml`), parsed by Bun.YAML, or null
// without the file.
export function projectConfig(project) {
  const file = path.join(project, PROJECT_CONFIG);
  if (!fs.existsSync(file)) return null;
  const code = 'console.log(JSON.stringify(Bun.YAML.parse(await Bun.file(process.argv[1]).text())))';
  const child = spawnSync(BUN_RUNTIME, ['-e', code, file], { encoding: 'utf8' });
  assert.equal(child.status, 0, child.stderr);
  return JSON.parse(child.stdout);
}
// The tier overrides of the omp project config of `project`.
export const tierOverrides = (project) => projectConfig(project).task.agentServiceTierOverrides;

// The scripts of the skill import the docks-kit CLI source (cli/src) and read the omp pins (SoT/toolchain.json) of the
// checkout that holds them. A test that runs a copy of the scripts in the git repository `repo` copies the scripts
// `names`, links cli/src of this checkout, and copies SoT/toolchain.json. The link and the pins stay untracked
// (`.git/info/exclude`), so the commits, the snapshots, and the diffs of `repo` hold only the scripts. Bun resolves the
// link, so the CLI source finds the packages of this checkout. The result is the path of the copy of prepare.mjs.
export const COPIED_SCRIPTS = ['prepare.mjs', 'score.mjs', 'omp.mjs'];
export function copyScripts(repo, names = COPIED_SCRIPTS) {
  const scripts = path.join(repo, '.agents/skills/review-benchmark/scripts');
  fs.mkdirSync(scripts, { recursive: true });
  for (const name of names) fs.copyFileSync(path.join(SCRIPTS_DIR, name), path.join(scripts, name));
  fs.mkdirSync(path.join(repo, 'cli'), { recursive: true });
  fs.symlinkSync(path.join(REPO_ROOT, 'cli', 'src'), path.join(repo, 'cli', 'src'));
  put(repo, 'SoT/toolchain.json', readText(path.join(REPO_ROOT, 'SoT', 'toolchain.json')));
  const exclude = path.join(repo, '.git', 'info', 'exclude');
  assert.ok(fs.existsSync(path.join(repo, '.git')), `copyScripts needs a git repository at ${repo}`);
  fs.mkdirSync(path.dirname(exclude), { recursive: true });
  fs.appendFileSync(exclude, '/cli/\n/SoT/toolchain.json\n');
  return path.join(scripts, 'prepare.mjs');
}

export const CORRECTNESS_BLOCK = `### Code review round 1, lens correctness

Code-review: fixes-required

## Standards

- [HIGH] Bug - src/sync.mjs:40-52 - A timeout leaves the lock held, so the next run waits forever - release the lock in a finally block. class: lock leak on an error path
  - same class in src/queue.mjs:12
- [MEDIUM] Performance - \`src/cache.mjs#L7\` - The cache rebuilds its index on every call - build it once.
- [LOW] Bug - Step 3 of the plan - The new flag has no help text - add the help text.

## Spec

None.
`;
// A pass with a HIGH finding reads as fixes-required, the plan helper's severity rule.
export const SPEC_BLOCK = `### Code review round 1, lens spec-and-tests

Code-review: pass

## Standards

- [HIGH] Bug - tests/sync.test.mjs:5 - The check never fails when the lock fix is reverted - assert the release.

## Spec

None.
`;
export const NO_VERDICT_BLOCK = `### Code review round 1, lens text-and-safety

The review stopped before a verdict.
`;
export const FULL_BLOCK = `### Code review round 1

Code-review: fixes-required

## Standards

- [HIGH] Bug - /work/ws/code-7/snapshot/src/sync.mjs:41 - The lock stays held after a timeout - release it.

## Spec

None.
`;
export const PLAN_BLOCK = `### Plan review round 2

Plan-review: repair

- goal_fit - Steps 2; Acceptance a3 - The steps never deliver the export command - add a step.
- research_gap: Research (plan.md:10-14) - The cited interface was removed - cite the current interface.
`;
export const PLAN_PASS_BLOCK = `### Plan review round 1

Plan-review: pass

None.
`;
export const CODE_KNOWN = [
  { id: 'D1', title: 'Lock stays held after a timeout', locator: 'src/sync.mjs:41-45', severity: 'high' },
  { id: 'D2', title: 'Retry drops the last error', locator: 'src/other.mjs:3', severity: 'medium' },
  { id: 'D3', title: 'Flag has no help text', locator: 'Step 3 of the plan', severity: 'low' },
];
export const PLAN_KEY = [
  { id: 'K1', title: 'Steps miss the export command', locator: 'Steps 2' },
  { id: 'K2', title: 'Research cites a removed interface', locator: 'Research (plan.md:10-14)' },
];
export function scratch() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'review-benchmark-test-'));
  onTestFinished(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}
export function put(root, relative, content) {
  const file = path.join(root, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, typeof content === 'string' ? content : `${JSON.stringify(content, null, 2)}\n`);
}
export const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
export const taskMessage = (caseDir) => ({
  role: 'user',
  content: [{ type: 'text', text: `Plan export: ${path.join(caseDir, 'plan.md')}` }],
});
// A workspace as prepare.mjs lays it out, with saved blocks, and the case folder it came from.
export function workspace() {
  const root = scratch();
  const ws = path.join(root, 'ws');
  const cases = path.join(root, 'cases');
  const run = (caseId, arm, k, blocks) => {
    for (const [reviewer, block] of Object.entries(blocks)) {
      put(ws, `${caseId}/${arm}/run-${k}/prompts/${reviewer}.txt`, 'agent: review-bench-candidate-code\n\nReview.\n');
      if (block !== null) put(ws, `${caseId}/${arm}/run-${k}/blocks/${reviewer}.md`, block);
    }
  };
  put(ws, 'code-7/case.json', { id: 'code-7', kind: 'code', split: 'dev' });
  put(ws, 'code-7/snapshot/src/sync.mjs', 'export const lock = 1;\n');
  run('code-7', 'B0', 1, { full: FULL_BLOCK });
  run('code-7', 'C3', 1, {
    correctness: CORRECTNESS_BLOCK,
    'spec-and-tests': SPEC_BLOCK,
    'text-and-safety': NO_VERDICT_BLOCK,
  });
  run('code-7', 'C3', 2, {
    correctness: CORRECTNESS_BLOCK,
    'spec-and-tests': PLAN_PASS_BLOCK,
    'text-and-safety': null,
  });
  put(ws, 'plan-3/case.json', { id: 'plan-3', kind: 'plan', split: 'heldout' });
  run('plan-3', 'P0', 1, { plan: PLAN_BLOCK });
  put(cases, 'dev/code-7.json', { id: 'code-7', kind: 'code', split: 'dev', known: CODE_KNOWN });
  put(cases, 'heldout/plan-3.json', { id: 'plan-3', kind: 'plan', split: 'heldout' });
  put(cases, 'heldout/plan-3.key.json', { known: PLAN_KEY });
  return { ws, cases };
}
// Five C3 runs and one B0 run of a case with three known defects, as findings.json and judgments.json give them. Runs
// 1, 4, and 5 of C3 are valid and differ in recall, ratings, seconds, and tokens, so each summary statistic differs.
export function scoringFixture() {
  const blocks = [];
  const findings = [];
  const add = (arm, run, reviewer, verdict, count) => {
    blocks.push({ case: 'code-7', kind: 'code', arm, run, reviewer, verdict, findings: count });
    return Array.from({ length: count }, (_, index) => {
      const id = `code-7/${arm}/${run}/${reviewer}#${index + 1}`;
      findings.push({ id, blind: blindId(id), case: 'code-7', arm, run, reviewer, n: index + 1 });
      return blindId(id);
    });
  };
  const [r1c1] = add('C3', 'run-1', 'correctness', 'fixes-required', 1);
  const [r1s1] = add('C3', 'run-1', 'spec-and-tests', 'pass', 1);
  const [r1t1] = add('C3', 'run-1', 'text-and-safety', 'pass', 1);
  const [r2c1, r2c2] = add('C3', 'run-2', 'correctness', 'blocked', 2);
  const [r2s1, r2s2] = add('C3', 'run-2', 'spec-and-tests', 'fixes-required', 2);
  const [r2t1] = add('C3', 'run-2', 'text-and-safety', 'pass', 2);
  const [r3c1] = add('C3', 'run-3', 'correctness', 'pass', 1);
  add('C3', 'run-3', 'spec-and-tests', 'pass', 0);
  add('C3', 'run-3', 'text-and-safety', 'missing', 0);
  const [r4c1, r4c2] = add('C3', 'run-4', 'correctness', 'fixes-required', 2);
  const [r4s1] = add('C3', 'run-4', 'spec-and-tests', 'pass', 1);
  add('C3', 'run-4', 'text-and-safety', 'pass', 0);
  const [r5c1, r5c2, r5c3] = add('C3', 'run-5', 'correctness', 'fixes-required', 3);
  const [r5s1, r5s2] = add('C3', 'run-5', 'spec-and-tests', 'fixes-required', 2);
  const [r5t1] = add('C3', 'run-5', 'text-and-safety', 'pass', 1);
  add('B0', 'run-1', 'full', 'pass', 0);
  const match = (finding, known, verdict) => ({ finding, known, verdict, reason: 'Same cause.' });
  const rate = (finding, rating) => ({ finding, rating, reason: 'Read the snapshot.' });
  const judgments = {
    matches: [
      match(r1c1, 'D1', 'match'),
      match(r1c1, 'D3', 'no'),
      match(r1s1, 'D2', 'match'),
      match(r1t1, 'D1', 'match'),
      match(r2c1, 'D1', 'match'),
      match(r2c1, 'D3', 'match'),
      match(r2c2, 'D2', 'match'),
      match(r2s1, 'D2', 'no'),
      match(r3c1, 'D1', 'unknown'),
      match(r4c1, 'D1', 'no'),
      match(r5c1, 'D1', 'match'),
      match(r5c2, 'D3', 'match'),
      match(r5s1, 'D2', 'match'),
    ],
    // r1t1 matched D1, so its rating does not count; the second text-and-safety finding of run-2 has no rating.
    adjudications: [
      rate(r1t1, 'valid'),
      rate(r2s1, 'valid'),
      rate(r2s2, 'wrong'),
      rate(r2t1, 'unknown'),
      rate(r3c1, 'wrong'),
      rate(r4c1, 'valid'),
      rate(r4c2, 'valid'),
      rate(r4s1, 'unknown'),
      rate(r5c3, 'wrong'),
      rate(r5s2, 'valid'),
      rate(r5t1, 'wrong'),
    ],
  };
  const metas = {
    'code-7/C3/run-1': {
      reviewers: {
        correctness: { seconds: 100, tokens: 1000 },
        'spec-and-tests': { seconds: 140.5, tokens: 2000 },
        'text-and-safety': { seconds: 120, tokens: 500 },
      },
    },
    'code-7/C3/run-2': {
      reviewers: {
        correctness: { seconds: 90, tokens: 10 },
        'spec-and-tests': { seconds: 80, tokens: null },
        'text-and-safety': { seconds: 70, tokens: 30 },
      },
    },
    'code-7/C3/run-4': {
      reviewers: {
        correctness: { seconds: 30, tokens: 300 },
        'spec-and-tests': { seconds: 45, tokens: 400 },
        'text-and-safety': { seconds: 20, tokens: 100 },
      },
    },
    'code-7/C3/run-5': {
      reviewers: {
        correctness: { seconds: 300, tokens: 5000 },
        'spec-and-tests': { seconds: 250, tokens: 3000 },
        'text-and-safety': { seconds: 260, tokens: 1000 },
      },
    },
    'code-7/B0/run-1': { reviewers: { full: { seconds: 200, tokens: 9000 } } },
  };
  const pairs = { cases: [{ case: 'code-7', kind: 'code', known: CODE_KNOWN, runs: [] }] };
  return { findings: { blocks, findings }, pairs, judgments, metas };
}
// One C3 arm of code-7 with the given known defects. Each run is a list of findings of one correctness block;
// each finding is `{ matches: { D1: verdict }, rating }`, and a cost is `{ seconds, tokens }`.
export function judgedArm(known, runs, costs = []) {
  const blocks = [];
  const findings = [];
  const judgments = { matches: [], adjudications: [] };
  const metas = {};
  for (const [index, list] of runs.entries()) {
    const run = `run-${index + 1}`;
    blocks.push({
      case: 'code-7',
      kind: 'code',
      arm: 'C3',
      run,
      reviewer: 'correctness',
      verdict: 'pass',
      findings: 0,
    });
    if (costs[index]) metas[`code-7/C3/${run}`] = { reviewers: { correctness: costs[index] } };
    for (const [n, { matches = {}, rating }] of list.entries()) {
      const id = `code-7/C3/${run}/correctness#${n + 1}`;
      const blind = blindId(id);
      findings.push({ id, blind, case: 'code-7', arm: 'C3', run, reviewer: 'correctness', n: n + 1 });
      for (const [knownId, verdict] of Object.entries(matches))
        judgments.matches.push({ finding: blind, known: knownId, verdict, reason: 'Read the snapshot.' });
      if (rating) judgments.adjudications.push({ finding: blind, rating, reason: 'Read the snapshot.' });
    }
  }
  const pairs = { cases: [{ case: 'code-7', kind: 'code', known, runs: [] }] };
  return { findings: { blocks, findings }, pairs, judgments, metas };
}
export const MODEL = 'openai-codex/gpt-6.1-sol';
export const CONFIGS = {
  low: { name: 'low', model: MODEL, effort: 'low', tier: 'default' },
  'low-fast': { name: 'low-fast', model: MODEL, effort: 'low', tier: 'priority' },
  high: { name: 'high', model: MODEL, effort: 'high', tier: 'default' },
  'xhigh-fast': { name: 'xhigh-fast', model: MODEL, effort: 'xhigh', tier: 'priority' },
};
// The fixer setting that `prepare.mjs agents` writes by default.
export const FIXER_SETTING = { model: MODEL, effort: 'high', tier: 'priority' };
// The manager setting that `prepare.mjs agents` writes by default: the fixer setting. `case` records it in each run.
export const MANAGER_SETTING = FIXER_SETTING;
// One reviewer entry of meta.json, as `score.mjs transcripts` writes it for a reviewer that used its configuration.
export const provenCost = (config, seconds, tokens, facts = {}) => ({
  seconds,
  tokens,
  requestedTier: config.tier,
  messages: [{ model: config.model, effort: config.effort, servedTier: config.tier }],
  sideCalls: [],
  ...facts,
});
export const jsonl = (entries) => entries.map((entry) => JSON.stringify(entry)).join('\n');
export const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export const isoAt = (second) => new Date(Date.UTC(2026, 0, 1, 0, 0, second)).toISOString();
// The session header of an omp 19 transcript (session format version 3), with the fields of `fields`.
export const sessionRecord = (fields = {}) => ({ type: 'session', version: 3, timestamp: isoAt(0), ...fields });
// The usage of an assistant message: omp 19 writes each token field (omp.mjs TOKEN_FIELDS), so a field that `usage`
// leaves out is 0.
export const fullUsage = (usage) => ({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0, ...usage });
export const assistantLine = (second, provider, model, serviceTier, usage) => ({
  type: 'message',
  timestamp: isoAt(second),
  message: {
    role: 'assistant',
    provider,
    model,
    ...(serviceTier ? { serviceTier } : {}),
    usage: fullUsage(usage),
    timestamp: Date.parse(isoAt(second)),
  },
});
// A reviewer transcript that asks for xhigh and the priority tier. It has a titling side call of a helper model,
// and its last message comes from a usage fallback to another model.
export const FALLBACK_TRANSCRIPT = [
  sessionRecord(),
  { type: 'model_change', timestamp: isoAt(0), model: MODEL },
  { type: 'thinking_level_change', timestamp: isoAt(0), thinkingLevel: 'high' },
  { type: 'service_tier_change', timestamp: isoAt(0), serviceTier: { openai: 'default' } },
  { type: 'thinking_level_change', timestamp: isoAt(0), thinkingLevel: 'xhigh' },
  { type: 'service_tier_change', timestamp: isoAt(0), serviceTier: { openai: 'priority' } },
  { type: 'message', timestamp: isoAt(1), message: { role: 'user' } },
  assistantLine(5, 'openai-codex', 'gpt-6.1-sol', 'priority', { input: 100, output: 10, cacheRead: 50, cacheWrite: 5 }),
  {
    type: 'model_usage',
    timestamp: isoAt(6),
    purpose: 'title',
    provider: 'openai-codex',
    model: 'gpt-6-luna',
    usage: { input: 300, output: 62 },
  },
  { type: 'message', timestamp: isoAt(7), message: { role: 'toolResult', toolCallId: 'call-1', isError: false } },
  assistantLine(31, 'openai-codex', 'gpt-6.1-sol', 'priority', { input: 200, output: 20, cacheRead: 150 }),
  { type: 'model_change', timestamp: isoAt(32), model: 'anthropic/claude-opus-5-5' },
  assistantLine(91, 'anthropic', 'claude-opus-5-5', null, { input: 1000, output: 100 }),
];
export const PASS_ROUND = '### Code review round 2\n\nCode-review: pass\n\nNone.\n';
// Writes judgments.json with an answer for every candidate pair of pairs.json and a rating for every finding
// without a `match` answer. `verdict(id, known)` and `rating(id)` get the stable finding id; a null rating leaves
// the finding without an adjudication.
export function judgeAll(ws, verdict, rating = () => 'valid') {
  const { findings } = readJson(path.join(ws, 'findings.json'));
  const idOf = new Map(findings.map((finding) => [finding.blind, finding.id]));
  const pairs = readJson(path.join(ws, 'pairs.json')).cases.flatMap((entry) => entry.runs.flatMap((run) => run.pairs));
  const matches = pairs.map((pair) => ({
    ...pair,
    verdict: verdict(idOf.get(pair.finding), pair.known),
    reason: 'Read the snapshot.',
  }));
  const matched = new Set(matches.filter((entry) => entry.verdict === 'match').map((entry) => entry.finding));
  const adjudications = findings
    .filter((finding) => !matched.has(finding.blind) && rating(finding.id) !== null)
    .map((finding) => ({ finding: finding.blind, rating: rating(finding.id), reason: 'Read the snapshot.' }));
  const judgments = { matches, adjudications };
  put(ws, 'judgments.json', judgments);
  return judgments;
}
// The table rows after a heading of the report, up to the first line after the table that is not a table row.
export function tableAfter(report, heading) {
  const lines = report.split('\n');
  const start = lines.indexOf(heading);
  assert.notEqual(start, -1, `the report has no heading ${heading}`);
  const rows = [];
  for (const line of lines.slice(start + 1)) {
    if (line.startsWith('|')) rows.push(line);
    else if (rows.length) break;
  }
  return rows;
}
// A workspace of case code-7 whose runs hold review rounds: `C1-<config>/run-<k>/round-<r>/` with a prompt, a block,
// and a meta.json whose reviewer used its configuration. Each round is [block, seconds, tokens, mode].
export function roundWorkspace(runs) {
  const root = scratch();
  const ws = path.join(root, 'ws');
  const cases = path.join(root, 'cases');
  put(ws, 'code-7/case.json', { id: 'code-7', kind: 'code', split: 'dev' });
  put(ws, 'code-7/snapshot/src/sync.mjs', 'export const lock = 1;\n');
  put(cases, 'dev/code-7.json', { id: 'code-7', kind: 'code', split: 'dev', known: CODE_KNOWN });
  for (const { config, run, rounds } of runs) {
    for (const [index, [block, seconds, tokens, mode]] of rounds.entries()) {
      const dir = `code-7/C1-${config.name}/run-${run}/round-${index + 1}`;
      put(ws, `${dir}/prompts/full.txt`, `agent: review-bench-candidate-code-${config.name}\n\nReview.\n`);
      put(ws, `${dir}/blocks/full.md`, block);
      put(ws, `${dir}/meta.json`, { config, mode, reviewers: { full: provenCost(config, seconds, tokens) } });
    }
  }
  return { ws, cases };
}
// Runs of `<arm>-<config>` arm folders, as scoreRuns gets them. `cases` maps a case id to its split, known ids, kind
// (default `code`), and optional seeded flag, which workspaceScores reads from case.json. Each run is { case, config,
// arm, run, rounds, single }: arm defaults to `C1` and run to 1, so
// without them a fixture has one run per case and config. Each round is [seconds, tokens, mode, fixer seconds,
// answers]. A run has round folders; a run with `single: true` is a single review: its one round has no round folder.
// An answer is a finding: the known id that it matches, or the rating of a finding without a match. Each round of a
// loop before its last round gets the record of its fix step, as `loop` writes it: `fix` with a fix of each matched
// known defect and the valid extras, and `fixAlreadyApplied` with the matched defects that an earlier round of the
// run fixed, whose fix the tree still holds. As `case --loop` and `transcripts` write them, round 1 of a loop gets the
// fixer setting (`fixerConfig`), and a round whose fix step gives valid extras to the fixer gets the transcript facts
// of a fixer that used this setting (`fixer.agents`).
export function gridFixture(cases, runs) {
  const blocks = [];
  const findings = [];
  const judgments = { matches: [], adjudications: [] };
  const metas = {};
  for (const spec of runs) {
    const config = CONFIGS[spec.config];
    const kind = cases[spec.case].kind ?? 'code';
    const arm = `${spec.arm ?? 'C1'}-${config.name}`;
    const run = `run-${spec.run ?? 1}`;
    const fixed = new Set();
    for (const [index, [seconds, tokens, mode, fixer, answers]] of spec.rounds.entries()) {
      const inRound = spec.single ? {} : { round: index + 1 };
      const folder = spec.single ? `${spec.case}/${arm}/${run}` : `${spec.case}/${arm}/${run}/round-${index + 1}`;
      const verdict = answers.length ? 'fixes-required' : 'pass';
      blocks.push({
        case: spec.case,
        kind,
        arm,
        run,
        ...inRound,
        reviewer: 'full',
        verdict,
        findings: answers.length,
      });
      metas[folder] = {
        config,
        mode,
        ...(!spec.single && index === 0 ? { fixerConfig: FIXER_SETTING } : {}),
        ...(fixer ? { fixer: { seconds: fixer } } : {}),
        reviewers: { full: provenCost(config, seconds, tokens) },
      };
      const matched = [];
      const extras = [];
      for (const [n, answer] of answers.entries()) {
        const id = `${folder}/full#${n + 1}`;
        const blind = blindId(id);
        findings.push({ id, blind, case: spec.case, arm, run, ...inRound, reviewer: 'full', n: n + 1 });
        if (['valid', 'wrong', 'unknown'].includes(answer)) {
          judgments.adjudications.push({ finding: blind, rating: answer, reason: 'Read the snapshot.' });
          if (answer === 'valid') extras.push(id);
        } else {
          judgments.matches.push({ finding: blind, known: answer, verdict: 'match', reason: 'Same cause.' });
          if (!matched.includes(answer)) matched.push(answer);
        }
      }
      if (spec.single || index === spec.rounds.length - 1) continue;
      const fixes = matched.map((known) => ({ known, patch: `${spec.case}.${known}.fix.patch` }));
      metas[folder].fix = { fixes, extras, rejections: [] };
      if (extras.length) {
        metas[folder].fixer = { ...metas[folder].fixer, agents: { 'fixer-1': provenCost(FIXER_SETTING, fixer, 0) } };
      }
      const present = matched.filter((known) => fixed.has(known));
      if (present.length) metas[folder].fixAlreadyApplied = present;
      for (const known of matched) fixed.add(known);
    }
  }
  const pairs = {
    cases: Object.entries(cases).map(([id, { split, known, kind = 'code', seeded }]) => ({
      case: id,
      kind,
      split,
      known: known.map((knownId) => ({ id: knownId, title: `Hidden ${knownId}`, locator: 'src/sync.mjs:1' })),
      runs: [],
      ...(seeded === undefined ? {} : { seeded }),
    })),
  };
  return { findings: { blocks, findings }, pairs, judgments, metas };
}
// Each known defect sits in a file of its own, so a finding is a candidate pair only with the defects of its files.
export const fixFile = (id) => `src/${id.toLowerCase()}.mjs`;
export const FIX_KNOWN = [
  { id: 'D1', locator: `${fixFile('D1')}:1`, fix: 'code-7.D1.fix.patch' },
  { id: 'D2', locator: `${fixFile('D2')}:1`, fix: 'code-7.D2.fix.patch', fix_after: ['D3'] },
  { id: 'D3', locator: `${fixFile('D3')}:1`, fix: 'code-7.D3.fix.patch' },
  { id: 'D4', locator: `${fixFile('D4')}:1`, fix: 'code-7.D4.fix.patch', fix_after: ['D1'] },
  { id: 'D5', locator: `${fixFile('D5')}:1`, fix: 'code-7.D5.fix.patch', fix_after: ['D4'] },
];
export const fixId = (round, n) => `code-7/C1-low/run-1/round-${round}/full#${n}`;
// The findings of one round of run code-7/C1-low/run-1, as findings.json gives them, and the judge's answers. Each
// answer is { matches, rating, reason }: `matches` maps known ids to a pair verdict, and `rating` is the adjudication.
// A finding names the files of the known defects in its `matches`, so the judge answered each of its candidate pairs;
// a finding without `matches` names README.md, which no known defect names.
export function judgedRound(round, answers) {
  const findings = [];
  const judgments = { matches: [], adjudications: [] };
  for (const [index, { matches = {}, rating, reason = 'Read the snapshot.' }] of answers.entries()) {
    const id = fixId(round, index + 1);
    const blind = blindId(id);
    const names = Object.keys(matches).length ? Object.keys(matches).map(fixFile) : ['README.md'];
    const files = names.map((file) => ({ file, start: 1, end: 1 }));
    findings.push({
      id,
      blind,
      case: 'code-7',
      arm: 'C1-low',
      run: 'run-1',
      round,
      reviewer: 'full',
      n: index + 1,
      files,
    });
    for (const [known, verdict] of Object.entries(matches)) {
      judgments.matches.push({ finding: blind, known, verdict, reason });
    }
    if (rating) judgments.adjudications.push({ finding: blind, rating, reason });
  }
  return { findings, judgments };
}
export const LOOP_R1 = 'code-7/C1-low/run-1/round-1/full';
export const syncLine = (values, n) => `export const v${n} = ${values[n] ?? n};\n`;
export const syncFile = (values) => Array.from({ length: 12 }, (_, index) => syncLine(values, index + 1)).join('');
// src/sync.mjs at the case head: v5 carries the known defect D1, and v7 the known defect D2.
export const SYNC_HEAD = syncFile({ 5: 0, 7: 0 });
export const SYNC_D1 = syncFile({ 7: 0 });
export const SYNC_FIXED = syncFile({});
// src/extra.mjs at the case head: b carries a defect that no key lists, so the fixer repairs it.
export const EXTRA_HEAD = 'export const a = 1;\nexport const b = 0;\nexport const c = 3;\nexport const d = 4;\n';
export const EXTRA_FIXED = EXTRA_HEAD.replace('b = 0', 'b = 2');
export const README_PLANTED = '# Demo\n\nSee src/sync.mjs.\n';
// Round 1 of the dev loop: a valid extra (#1), a wrong finding (#2), and the known defect D1 (#3).
export const LOOP_ROUND_1 = `### Code review round 1

Code-review: fixes-required

## Standards

- [MEDIUM] Bug - src/extra.mjs:2 - b is 0, and the callers divide by it - set it to 2.
- [LOW] Clarity - README.md:1 - The title does not name the module - rename it.
- [HIGH] Bug - src/sync.mjs:5 - v5 is 0 instead of 5 - set it to 5.

## Spec

None.
`;
export const V7_BLOCK = (round) => `### Code review round ${round}

Code-review: fixes-required

## Standards

- [HIGH] Bug - src/sync.mjs:7 - v7 is 0 instead of 7 - set it to 7.

## Spec

None.
`;
export const LOOP_PASS_3 = '### Code review round 3\n\nCode-review: pass\n\nNone.\n';
// prepare.mjs runs git with the environment of this process, so a git test isolates the process from the user's git
// config, as the release adapter tests do, and restores it afterwards.
export function isolateGit() {
  const isolation = {
    GIT_CONFIG_GLOBAL: os.devNull,
    GIT_CONFIG_SYSTEM: os.devNull,
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_COUNT: '0',
    GIT_TERMINAL_PROMPT: '0',
  };
  const inherited = Object.fromEntries(Object.keys(isolation).map((key) => [key, process.env[key]]));
  Object.assign(process.env, isolation);
  onTestFinished(() => {
    for (const [key, value] of Object.entries(inherited)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
}
export function gitIn(repo, ...args) {
  const identity = ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.com', '-c', 'commit.gpgSign=false'];
  const result = spawnSync('git', [...identity, ...args], { cwd: repo, encoding: 'utf8' });
  assert.equal(result.status, 0, `git ${args.join(' ')} failed: ${result.stderr}`);
  return result.stdout;
}
// prepare.mjs refuses a prompt whose paths contain the word benchmark, so its workspaces get a neutral folder.
export function neutralScratch() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'review-loop-'));
  onTestFinished(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}
export const readText = (file) => fs.readFileSync(file, 'utf8');
// The added and removed lines of a diff file, without its file headers.
export const changedLines = (file) =>
  readText(file)
    .split('\n')
    .filter((line) => /^[-+]/.test(line) && !/^(?:---|\+\+\+) /.test(line));
export const filesUnder = (dir) =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(dir, entry.name);
    return entry.isDirectory() ? filesUnder(file) : [file];
  });
// The diff of `file` from `before` to `after`, which `git apply` applies at the root of `repo`. The work tree and the
// index of `repo` go back to HEAD.
export function filePatch(repo, file, before, after) {
  put(repo, file, before);
  gitIn(repo, 'add', '--', file);
  put(repo, file, after);
  const text = gitIn(repo, 'diff', '--no-color', '--src-prefix=a/', '--dst-prefix=b/', '--', file);
  gitIn(repo, 'reset', '-q', '--hard', 'HEAD');
  return text;
}
// A git repository with the commit `base` (README.md) and the case head `head`, which adds src/sync.mjs (12 lines)
// and src/extra.mjs (4 lines). The patches apply with `git apply`: D1, the fixer patch, and the planted patch (the
// `patch` of a held-out case, which changes README.md) at the head, and D2 only after D1.
export function loopRepo() {
  isolateGit();
  const root = neutralScratch();
  const repo = path.join(root, 'repo');
  fs.mkdirSync(repo);
  gitIn(repo, 'init', '-q', '-b', 'main');
  put(repo, 'README.md', '# Demo\n');
  gitIn(repo, 'add', '-A');
  gitIn(repo, 'commit', '-q', '-m', 'base');
  const base = gitIn(repo, 'rev-parse', 'HEAD').trim();
  put(repo, 'src/sync.mjs', SYNC_HEAD);
  put(repo, 'src/extra.mjs', EXTRA_HEAD);
  gitIn(repo, 'add', '-A');
  gitIn(repo, 'commit', '-q', '-m', 'head');
  const head = gitIn(repo, 'rev-parse', 'HEAD').trim();
  const patches = {
    D1: filePatch(repo, 'src/sync.mjs', SYNC_HEAD, SYNC_D1),
    D2: filePatch(repo, 'src/sync.mjs', SYNC_D1, SYNC_FIXED),
    fixer: filePatch(repo, 'src/extra.mjs', EXTRA_HEAD, EXTRA_FIXED),
    planted: filePatch(repo, 'README.md', '# Demo\n', README_PLANTED),
  };
  return { root, repo, base, head, patches };
}
// Writes judgments.json for loop findings by stable id. Each answer is [id, answer, reason]: a known id gives a
// `match` answer, and `valid`, `wrong`, or `unknown` gives an adjudication. Each other candidate pair of an answered
// finding (score.pairWanted) gets a `no` answer, because `loop` stops on a candidate pair without an answer. `known`
// is the list of known defects; it defaults to the `known` list of the case.json of the finding's case in `ws`.
export function judgeLoop(ws, answers, known) {
  const { findings } = readJson(path.join(ws, 'findings.json'));
  const byId = new Map(findings.map((finding) => [finding.id, finding]));
  const judgments = { matches: [], adjudications: [] };
  const answered = new Map();
  for (const [id, answer, reason = 'Read the snapshot.'] of answers) {
    assert.ok(byId.has(id), `findings.json has no finding ${id}`);
    const finding = byId.get(id);
    answered.set(id, finding);
    if (['valid', 'wrong', 'unknown'].includes(answer)) {
      judgments.adjudications.push({ finding: finding.blind, rating: answer, reason });
    } else {
      judgments.matches.push({ finding: finding.blind, known: answer, verdict: 'match', reason });
    }
  }
  for (const finding of answered.values()) {
    const defects = known ?? readJson(path.join(ws, finding.case, 'case.json')).known;
    assert.ok(Array.isArray(defects), `judgeLoop needs the known defects of ${finding.case}`);
    const given = new Set(
      judgments.matches.filter((entry) => entry.finding === finding.blind).map((entry) => entry.known),
    );
    for (const item of defects) {
      if (given.has(item.id) || !score.pairWanted('code', finding, item)) continue;
      judgments.matches.push({ finding: finding.blind, known: item.id, verdict: 'no', reason: 'Another cause.' });
    }
  }
  put(ws, 'judgments.json', judgments);
}
// Dev case code-7 of the loop repository, with its fix patches next to the case file, and a workspace that holds
// round 1 of run C1-low/run-1 as the reviewer and the judge left it: the prompt, the block, meta.json, findings.json,
// and judgments.json. The fixer patch repairs the valid extra of round 1.
export function devLoop() {
  const fixture = loopRepo();
  const { root, base, head, patches } = fixture;
  const ws = path.join(root, 'ws');
  const cases = path.join(root, 'cases');
  const seeded = { category: 'bug', source: 'seeded' };
  const caseData = {
    id: 'code-7',
    kind: 'code',
    split: 'dev',
    issue: 7,
    round: 1,
    plan: 'code-7-plan.md',
    base,
    head,
    known: [
      { id: 'D1', locator: 'src/sync.mjs:5', ...seeded, summary: 'v5 is 0.', fix: 'code-7.D1.fix.patch' },
      {
        id: 'D2',
        locator: 'src/sync.mjs:7',
        ...seeded,
        summary: 'v7 is 0.',
        fix: 'code-7.D2.fix.patch',
        fix_after: ['D1'],
      },
    ],
  };
  put(cases, 'dev/code-7.json', caseData);
  put(cases, 'dev/code-7-plan.md', '# Plan 7\n');
  put(cases, 'dev/code-7.D1.fix.patch', patches.D1);
  put(cases, 'dev/code-7.D2.fix.patch', patches.D2);
  put(ws, 'code-7/case.json', caseData);
  put(ws, 'code-7/plan.md', '# Plan 7\n');
  const run = path.join(ws, 'code-7', 'C1-low', 'run-1');
  // `case --loop` records the round policy of the arm: C1 runs the full-delta policy.
  put(run, 'meta.json', { policy: 'full-delta' });
  const round1Meta = { config: CONFIGS.low, mode: 'full', reviewers: { full: provenCost(CONFIGS.low, 100, 1000) } };
  put(run, 'round-1/prompts/full.txt', 'agent: review-bench-candidate-code-low\n\nReview.\n');
  put(run, 'round-1/blocks/full.md', LOOP_ROUND_1);
  put(run, 'round-1/meta.json', round1Meta);
  findingsCommand(ws);
  const round1Answers = [
    [`${LOOP_R1}#1`, 'valid'],
    [`${LOOP_R1}#2`, 'wrong', 'README.md:1 names the module.'],
    [`${LOOP_R1}#3`, 'D1'],
  ];
  judgeLoop(ws, round1Answers);
  const fixerPatch = path.join(root, 'fixer.patch');
  fs.writeFileSync(fixerPatch, patches.fixer);
  const round = (r) => path.join(run, `round-${r}`);
  return { ...fixture, ws, cases, run, round, round1Meta, round1Answers, fixerPatch };
}
export const LIVE = '/work/live';
export const LIVE_PLUGIN = `${LIVE}/plugins/plan-lifecycle`;
export const BASELINE_PLUGIN = '/work/baseline-plugin';
export const SCOPE_WS = '/work/ws';
export const SCOPE_CASE = `${SCOPE_WS}/code-7`;
export const reads = (...paths) => paths.map((target) => ({ name: 'read', path: target }));
// The part of a rendered reviewer agent that names the skill of its plugin root.
export const agentText = (root) =>
  `# Code Reviewer\n\nLoad and follow the \`code-reviewer\` skill at\n\`${root}/skills/code-reviewer/SKILL.md\`.\n` +
  `Name each further file of the skill as \`${root}/skills/code-reviewer/<path>\`.\n`;
// A transcript of one agent that runs in the live checkout at the `low` configuration. Its last assistant message
// makes the tool calls, each [name, arguments], and `cwd` is the working directory of its session. `results` maps the
// id `call-<n>` of the n-th call to the details of its tool result; a call without an entry gets no tool result.
// `texts` maps the id of a call to the text of its tool result (`Read.` without an entry). With `isError`, each tool
// result is an error result (`isError: true`), as omp writes it for a call that it did not run.
export function toolTranscript(caseDir, seconds, calls, agent = 'review-bench-candidate-code-low', options = {}) {
  const { cwd = LIVE, results = {}, texts = {}, isError = false } = options;
  const last = assistantLine(seconds, 'openai-codex', 'gpt-6.1-sol', 'default', { input: 90, output: 10 });
  last.message.content = [
    { type: 'text', text: 'Done.' },
    ...calls.map(([name, args], index) => ({ type: 'toolCall', id: `call-${index + 1}`, name, arguments: args })),
  ];
  const toolResults = Object.entries(results).map(([id, details]) => ({
    type: 'message',
    timestamp: isoAt(seconds),
    message: {
      role: 'toolResult',
      toolCallId: id,
      content: [{ type: 'text', text: texts[id] ?? 'Read.' }],
      details,
      isError,
    },
  }));
  return jsonl([
    sessionRecord({ cwd }),
    { type: 'model_change', timestamp: isoAt(0), model: MODEL },
    { type: 'thinking_level_change', timestamp: isoAt(0), thinkingLevel: 'low' },
    { type: 'service_tier_change', timestamp: isoAt(0), serviceTier: { openai: 'default' } },
    {
      type: 'session_init',
      timestamp: isoAt(0),
      agent,
      systemPrompt: ['You are a coding assistant.', agentText(LIVE_PLUGIN)],
      task: taskMessage(caseDir).content[0].text,
    },
    { type: 'message', timestamp: isoAt(0), message: taskMessage(caseDir) },
    last,
    ...toolResults,
  ]);
}
// The `key: value` lines of the frontmatter of an agent file.
export function frontmatter(file) {
  const [, block] = /^---\n([\s\S]*?)\n---\n/.exec(readText(file));
  return Object.fromEntries(
    block.split('\n').map((line) => [line.slice(0, line.indexOf(':')), line.slice(line.indexOf(':') + 1).trim()]),
  );
}
// Runs `agents` for the efforts low and high and the tiers priority and default on a git repository whose head holds
// the reviewer agents that `agents` copies, in the kit layout. The project folder is `projectFolder` in the scratch
// folder, and `options` replaces options of `agents`. It returns the project folder, its omp agent folder, and the
// console.log lines of `agents`.
export function selfReviewAgents(projectFolder = 'project', options = {}) {
  isolateGit();
  const root = neutralScratch();
  const repo = path.join(root, 'repo');
  const project = path.join(root, projectFolder);
  fs.mkdirSync(repo);
  fs.mkdirSync(project);
  gitIn(repo, 'init', '-q', '-b', 'main');
  for (const role of ['code', 'plan']) {
    const agent = `---\nname: ${role}-reviewer\ndescription: Reviews.\ntools: read, glob, grep\n---\n\n# Reviewer\n`;
    put(repo, `${KIT_ROOT}/agents/${role}-reviewer.md`, agent);
  }
  gitIn(repo, 'add', '-A');
  gitIn(repo, 'commit', '-q', '-m', 'agents');
  const agentsOptions = {
    'baseline-ref': 'HEAD',
    model: MODEL,
    efforts: 'low,high',
    tiers: 'priority,default',
    'baseline-dir': path.join(root, 'baseline-plugin'),
    project,
    ...options,
  };
  const { lines } = agentsOnBun(agentsOptions, repo);
  return { root, project, agentDir: path.join(project, '.omp', 'agents'), lines };
}
// The result of `fn` and the lines that it logs with console.log.
export function logged(fn) {
  const lines = [];
  const log = console.log;
  console.log = (...args) => lines.push(args.join(' '));
  try {
    return { result: fn(), lines };
  } finally {
    console.log = log;
  }
}
// The options of `agents` at the effort low and the tier default in the project and scratch folder of
// selfReviewAgents.
export const agentsOptions = ({ root, project }) => ({
  'baseline-ref': 'HEAD',
  model: MODEL,
  efforts: 'low',
  tiers: 'default',
  'baseline-dir': path.join(root, 'baseline-plugin'),
  project,
});
export const POLICY_ARMS = { B0: 'full', B1: 'panel-delta', B3: 'panel-delta', C1: 'full-delta', C3: 'panel-delta' };
export const POLICY_FIXER = { model: MODEL, effort: 'high', tier: 'priority' };
// The block of a round-1 reviewer of a policy loop: the full reviewer and the correctness lens find the known defect
// D1, and the other lenses pass.
export function policyBlock(reviewer) {
  const heading = reviewer === 'full' ? '### Code review round 1' : `### Code review round 1, lens ${reviewer}`;
  const finds = reviewer === 'full' || reviewer === 'correctness';
  const standards = finds ? '- [HIGH] Bug - src/sync.mjs:5 - v5 is 0 instead of 5 - set it to 5.' : 'None.';
  const verdict = finds ? 'fixes-required' : 'pass';
  return `${heading}\n\nCode-review: ${verdict}\n\n## Standards\n\n${standards}\n\n## Spec\n\nNone.\n`;
}
// A prompt file: line 1 names the agent, line 2 is empty, and the prompt follows.
export function promptFileParts(file) {
  const [agent, empty, ...rest] = readText(file).split('\n');
  assert.equal(empty, '');
  return { agent, body: rest.join('\n') };
}
// `case --loop` with `arms` (default: the arms of POLICY_ARMS) at configuration `low`, one run each, for dev case
// code-7. The case head adds src/sync.mjs with `count` lines, so the full diff changes `count` lines. Line 5 carries
// the known defect D1, and its fix patch changes that line only.
export function policyLoops(count, arms = Object.keys(POLICY_ARMS)) {
  isolateGit();
  const root = neutralScratch();
  const repo = path.join(root, 'repo');
  fs.mkdirSync(repo);
  gitIn(repo, 'init', '-q', '-b', 'main');
  put(repo, 'README.md', '# Demo\n');
  gitIn(repo, 'add', '-A');
  gitIn(repo, 'commit', '-q', '-m', 'base');
  const base = gitIn(repo, 'rev-parse', 'HEAD').trim();
  const sync = (values) => Array.from({ length: count }, (_, index) => syncLine(values, index + 1)).join('');
  put(repo, 'src/sync.mjs', sync({ 5: 0 }));
  gitIn(repo, 'add', '-A');
  gitIn(repo, 'commit', '-q', '-m', 'head');
  const head = gitIn(repo, 'rev-parse', 'HEAD').trim();
  const ws = path.join(root, 'ws');
  const cases = path.join(root, 'cases');
  const project = path.join(root, 'project');
  put(project, '.omp/agents/review-bench-configs.json', { configs: [CONFIGS.low], fixer: POLICY_FIXER });
  const seeded = { category: 'bug', source: 'seeded' };
  const caseData = {
    id: 'code-7',
    kind: 'code',
    split: 'dev',
    issue: 7,
    round: 1,
    plan: 'code-7-plan.md',
    base,
    head,
    known: [{ id: 'D1', locator: 'src/sync.mjs:5', ...seeded, summary: 'v5 is 0.', fix: 'code-7.D1.fix.patch' }],
  };
  put(cases, 'dev/code-7.json', caseData);
  put(cases, 'dev/code-7-plan.md', '# Plan 7\n');
  put(cases, 'dev/code-7.D1.fix.patch', filePatch(repo, 'src/sync.mjs', sync({ 5: 0 }), sync({})));
  const options = {
    case: path.join(cases, 'dev', 'code-7.json'),
    arms: arms.join(','),
    runs: '1',
    out: ws,
    configs: 'low',
    project,
    loop: true,
  };
  // Two arms of one side run different loops, so one workspace holds all four arms.
  prepare.prepareCase(options, repo);
  const caseDir = path.join(ws, 'code-7');
  const run = (arm) => path.join(caseDir, `${arm}-low`, 'run-1');
  return { repo, ws, cases, caseData, caseDir, run };
}
// The meta.json reviewer entry of a transcript, as `score.mjs transcripts` writes it for the configured model `model`.
export const transcriptEntry = (text, model = MODEL) => ({
  ...parseTranscript(text, 'reviewer.jsonl', model),
  ...score.transcriptFacts(text, 'reviewer.jsonl'),
});
export const PREPARE_SCRIPT = path.join(SCRIPTS_DIR, 'prepare.mjs');
// The delta reference of the plan-reviewer skill, relative to a plugin root.
export const VARIANT_DELTA = 'skills/plan-reviewer/references/delta.md';
// The plugin root variable of Claude Code that a plugin agent before the native omp packages names.
export const LEGACY_PLUGIN_ROOT = `\${CLAUDE_PLUGIN_ROOT}`;
// The plan-reviewer agent at one ref of the variant repository. As the plugin agent does, it loads its skill with
// `autoload-skills` and names the skill file as a `skill://` URI.
export const variantAgentText = (label) => `---
name: plan-reviewer
description: Reviews plans.
tools: read, glob, grep
autoload-skills: plan-reviewer
---

# Plan Reviewer ${label}

Load and follow
\`skill://plan-reviewer/SKILL.md\`.
`;
// The plan-reviewer agent of a release before the native omp packages: it names its skill under the plugin root
// variable of Claude Code.
export const legacyVariantAgentText = (label) => `---
name: plan-reviewer
description: Reviews plans.
tools: Read, Glob, Grep
---

# Plan Reviewer ${label}

Load and follow
\`${LEGACY_PLUGIN_ROOT}/skills/plan-reviewer/SKILL.md\`.
`;
// A git repository with three tags: `bare` (README.md only), `v16`, and `cand-a`, whose plugin also holds the delta
// reference, all in the legacy layout (plugins/plan-lifecycle). HEAD, the work tree of the candidate agents, moves the
// plugin to the kit layout (KIT_ROOT) and changes it again. Each plugin file names its ref, so a copy shows the ref that
// it came from.
export function variantRepo() {
  isolateGit();
  const root = neutralScratch();
  const repo = path.join(root, 'repo');
  const project = path.join(root, 'project');
  fs.mkdirSync(repo);
  fs.mkdirSync(project);
  gitIn(repo, 'init', '-q', '-b', 'main');
  const commit = (message, files) => {
    for (const [file, content] of Object.entries(files)) put(repo, file, content);
    gitIn(repo, 'add', '-A');
    gitIn(repo, 'commit', '-q', '-m', message);
    return gitIn(repo, 'rev-parse', 'HEAD').trim();
  };
  const files = (label, agent = variantAgentText(label), plugin = 'plugins/plan-lifecycle') => ({
    [`${plugin}/agents/code-reviewer.md`]: `---\nname: code-reviewer\ndescription: Reviews.\n---\n\n# ${label}\n`,
    [`${plugin}/agents/plan-reviewer.md`]: agent,
    [`${plugin}/skills/plan-reviewer/SKILL.md`]: `# Plan reviewer ${label}\n`,
    [`${plugin}/skills/plan-manager/references/plan-contract.md`]: `# Plan contract ${label}\n`,
  });
  const plugin = 'plugins/plan-lifecycle';
  const shas = {
    bare: commit('bare', { 'README.md': '# Demo\n' }),
    v16: commit('0.16.0', files('0.16.0', legacyVariantAgentText('0.16.0'))),
    'cand-a': commit('candidate a', { ...files('A'), [`${plugin}/${VARIANT_DELTA}`]: '# Delta mode A\n' }),
  };
  for (const [tag, sha] of Object.entries(shas)) gitIn(repo, 'tag', tag, sha);
  fs.mkdirSync(path.join(repo, path.dirname(KIT_ROOT)), { recursive: true });
  gitIn(repo, 'mv', plugin, KIT_ROOT);
  commit('live', files('live', variantAgentText('live'), KIT_ROOT));
  return { root, repo, project, agentDir: path.join(project, '.omp', 'agents'), shas };
}
// The options of `agents` for the variants 16 (v16, full only) and a (cand-a), at the efforts low and xhigh with the
// tiers default and priority.
export const variantOptions = ({ root, project }) => ({
  'baseline-ref': 'v16',
  variants: '16=v16,a=cand-a',
  'full-only': '16',
  model: MODEL,
  efforts: 'low,xhigh',
  tiers: 'default,priority',
  'baseline-dir': path.join(root, 'baseline-plugin'),
  project,
});
export const CONTRACT = 'plugins/plan-lifecycle/skills/plan-manager/references/plan-contract.md';
// The plan contract in the kit layout.
export const KIT_CONTRACT = `${KIT_ROOT}/skills/plan-manager/references/plan-contract.md`;
// The forms of the contract path that the messages of the contract overlay name: flat, and in a category folder, under
// the reviewer root of the kit and of the legacy layout.
export const CONTRACT_FORM = [KIT_ROOT, 'plugins/plan-lifecycle']
  .map((root) => `${root}/skills/[<folder>/]plan-manager/references/plan-contract.md`)
  .join(' or ');
// The prompt rule that sends the reviewer to the snapshot root for the plan contract, and the rule of a run with a
// contract overlay, which sends the reviewer to the copy `copy`.
export const SNAPSHOT_CONTRACT_RULE =
  '- Your own instruction files are your agent file and the files of your own skill folder. Read every other file, including the plan contract and other skills, under the snapshot root.';
export const copyContractRule = (copy) =>
  `- Your own instruction files are your agent file and the files of your own skill folder. Read the plan contract at ${copy}. Read every other repository file, including other skills, under the snapshot root.`;
// The refusal of a contract overlay on the snapshot `snapshot`, which has no plan contract.
export const noContract = (snapshot) =>
  `${snapshot} has no ${CONTRACT_FORM}, so the contract overlay has no contract to change`;
// Each file and folder under `dir`, without the .git folders: one key per path relative to `dir`, with the text of a
// file, or '' for a folder, whose key ends with `/`. A refusal leaves this state as it was.
export function treeState(dir) {
  const state = {};
  const walk = (folder) => {
    for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
      if (entry.name === '.git') continue;
      const file = path.join(folder, entry.name);
      const key = path.relative(dir, file).split(path.sep).join('/');
      if (entry.isDirectory()) {
        state[`${key}/`] = '';
        walk(file);
      } else {
        state[key] = readText(file);
      }
    }
  };
  if (fs.existsSync(dir)) walk(dir);
  return state;
}
// The variant repository after `agents` with the variants 16 and a (cand-a, with a contract overlay), and the case
// files of the overlay tests: plan-3 at v16, whose contract the contract change of cand-a applies to; plan-4, a
// plan-delta case at the last commit, whose contract does not hold the text that the change changes; plan-5 at bare,
// which has no contract; and code-7 from bare to v16. `options(id, arms, more)` gives the options of `case` for one run
// at the configuration low.
export function overlayFixture() {
  const fixture = variantRepo();
  const { root, repo, project, shas } = fixture;
  agentsOnBun({ ...variantOptions(fixture), 'contract-overlay': 'a' }, repo);
  const ws = path.join(root, 'ws');
  const cases = path.join(root, 'cases');
  const planCase = (id, repoRef) => ({
    id,
    kind: 'plan',
    split: 'dev',
    issue: 3,
    round: 1,
    plan: `${id}-plan.md`,
    repo_ref: repoRef,
    known: [],
  });
  const caseFiles = [
    planCase('plan-3', shas.v16),
    {
      ...planCase('plan-4', gitIn(repo, 'rev-parse', 'HEAD').trim()),
      kind: 'plan-delta',
      round: 2,
      previous_body: 'plan-4-previous.md',
      previous_review: 'plan-4-review.md',
    },
    planCase('plan-5', shas.bare),
    {
      id: 'code-7',
      kind: 'code',
      split: 'dev',
      issue: 7,
      round: 1,
      plan: 'code-7-plan.md',
      base: shas.bare,
      head: shas.v16,
      known: [],
    },
  ];
  for (const caseData of caseFiles) {
    put(cases, `dev/${caseData.id}.json`, caseData);
    put(cases, `dev/${caseData.plan}`, `# Plan ${caseData.issue}\n\nStep 1 and step 2.\n`);
  }
  put(cases, 'dev/plan-4-previous.md', '# Plan 3\n\nStep 1.\n');
  put(cases, 'dev/plan-4-review.md', PLAN_BLOCK.replace('round 2', 'round 1'));
  const options = (id, arms, more = {}) => ({
    case: path.join(cases, 'dev', `${id}.json`),
    arms,
    runs: '1',
    out: ws,
    configs: 'low',
    project,
    ...more,
  });
  return { root, repo, project, ws, cases, caseFiles, options };
}
// A code-delta case, built with the arm Cd: the base holds AGENTS.md and tools/gen/REVIEW.md, the delta base changes
// src/a.mjs and adds tools/gen/x.mjs, and the head deletes tools/gen/x.mjs again. So only the delta diff has a path in
// tools/.
export function codeDeltaCase() {
  isolateGit();
  const root = neutralScratch();
  const repo = path.join(root, 'repo');
  fs.mkdirSync(repo);
  gitIn(repo, 'init', '-q', '-b', 'main');
  const commit = (message) => {
    gitIn(repo, 'add', '-A');
    gitIn(repo, 'commit', '-q', '-m', message);
    return gitIn(repo, 'rev-parse', 'HEAD').trim();
  };
  put(repo, 'AGENTS.md', '# Root rules\n');
  put(repo, 'src/a.mjs', 'export const a = 1;\n');
  put(repo, 'tools/gen/REVIEW.md', '# Generator rules\n');
  const base = commit('base');
  put(repo, 'src/a.mjs', 'export const a = 2;\n');
  put(repo, 'tools/gen/x.mjs', 'export const x = 1;\n');
  const deltaBase = commit('round 1');
  fs.rmSync(path.join(repo, 'tools', 'gen', 'x.mjs'));
  const head = commit('repair');
  const ws = path.join(root, 'ws');
  const cases = path.join(root, 'cases');
  const project = path.join(root, 'project');
  put(project, '.omp/agents/review-bench-configs.json', { configs: [CONFIGS.low], fixer: FIXER_SETTING });
  const caseData = {
    id: 'code-8',
    kind: 'code-delta',
    split: 'dev',
    issue: 8,
    round: 2,
    plan: 'code-8-plan.md',
    base,
    head,
    delta_base: deltaBase,
    previous_review: 'code-8-review.md',
  };
  put(cases, 'dev/code-8.json', { ...caseData, known: [] });
  put(cases, 'dev/code-8-plan.md', '# Plan 8\n');
  put(cases, 'dev/code-8-review.md', FULL_BLOCK);
  const options = { case: path.join(cases, 'dev/code-8.json'), arms: 'Cd', runs: '1', out: ws, project };
  logged(() => prepare.prepareCase(options, repo));
  return { repo, ws, options, caseDir: path.join(ws, 'code-8') };
}
// Writes the documents of gridFixture to the workspace `ws`, as `findings`, `pairs`, the judge, and `transcripts`
// write them, so that the commands of score.mjs can read them.
export function writeFixture(ws, fixture) {
  put(ws, 'findings.json', fixture.findings);
  put(ws, 'pairs.json', fixture.pairs);
  put(ws, 'judgments.json', fixture.judgments);
  for (const [key, meta] of Object.entries(fixture.metas)) put(ws, `${key}/meta.json`, meta);
}
// The cases code-1 to code-<count> of gridFixture, each with the one known defect D1.
export const oneKnownCases = (count, split = 'dev', first = 1) =>
  Object.fromEntries(Array.from({ length: count }, (_, index) => [`code-${first + index}`, { split, known: ['D1'] }]));
// Single reviews of the arm `arm` at xhigh-fast on the cases code-<first> to code-<first + count - 1>, `runs` runs
// each. `found(index, run)` tells whether the run of the case with the index `index` (from 0) found D1.
export const singleRuns = (arm, count, runs, found, first = 1) =>
  Array.from({ length: count }, (_, index) =>
    Array.from({ length: runs }, (_slot, run) => ({
      case: `code-${first + index}`,
      config: 'xhigh-fast',
      arm,
      run: run + 1,
      single: true,
      rounds: [[60, 600, null, 0, found(index, run + 1) ? ['D1'] : []]],
    })),
  ).flat();
