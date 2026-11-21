import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'vitest';
import { BUN_RUNTIME } from '../../../../cli/test/lib/cliEntry.ts';
import * as prepare from '../scripts/prepare.mjs';
import * as score from '../scripts/score.mjs';
import { findingsCommand, namesCommand, renderReport, scoreRuns, transcriptsCommand } from '../scripts/score.mjs';
import {
  agentsOnBun,
  agentsOptions,
  assistantLine,
  BASELINE_PLUGIN,
  CODE_KNOWN,
  CONFIGS,
  FIXER_SETTING,
  frontmatter,
  gridFixture,
  isoAt,
  jsonl,
  judgedArm,
  judgeLoop,
  LIVE,
  LIVE_PLUGIN,
  loopRepo,
  MODEL,
  POLICY_ARMS,
  policyBlock,
  policyLoops,
  promptFileParts,
  provenCost,
  put,
  readJson,
  reads,
  readText,
  SCOPE_CASE,
  SCRIPTS_DIR,
  selfReviewAgents,
  toolTranscript,
  transcriptEntry,
  tierOverrides,
  treeState,
} from './helpers.mjs';

// Plan #100 step 6: API note for the self-review tests below (#98).
//
// New exports of prepare.mjs:
// - prepareAgents(options, repo): the `agents` command. options holds the flags by long name, as parseArgs gives them.
//   For each configuration it also writes the agent selfReviewAgent(<config>) = `review-bench-selfreview-<config>`,
//   with the model, the effort, and the tier override of the reviewer agents of that configuration. Its agent text
//   names the absolute path of its own agent file.
// - selfReviewAgent(config) -> `review-bench-selfreview-<config>`.
//
// Changed exports:
// - ARMS.code has S1 (reviewer `self-review`, a full-mode prompt) and S3 (reviewers `self-review-<lens>`, the panel
//   prompt of the lens, with the lens description of a baseline lens). Both dispatch the self-review agent and take
//   no --loop.
// - readScope takes `agentFiles`, a list of absolute paths that the reviewer may read. transcriptsCommand gives the
//   paths `<dir>/.omp/agents/review-bench-selfreview-<x>.md` that the system prompt of the `session_init` entry names.
//   A path in `<dir>/.claude/agents/` is no self-review agent file: omp does not load agents from that folder.

test('agents writes one self-review agent per configuration with the effort and tier of its reviewer agents', () => {
  const { project, agentDir } = selfReviewAgents();
  const { configs } = readJson(path.join(agentDir, 'review-bench-configs.json'));
  assert.deepEqual(
    configs.map((config) => config.name),
    ['low-fast', 'low', 'high-fast', 'high'],
  );
  assert.deepEqual(
    fs
      .readdirSync(agentDir)
      .filter((name) => name.startsWith('review-bench-selfreview-'))
      .sort(),
    configs.map((config) => `review-bench-selfreview-${config.name}.md`).sort(),
  );
  const overrides = tierOverrides(project);
  for (const { name, model, effort, tier } of configs) {
    const agent = prepare.selfReviewAgent(name);
    const reviewer = `review-bench-candidate-code-${name}`;
    assert.equal(agent, `review-bench-selfreview-${name}`);
    const fields = frontmatter(path.join(agentDir, `${agent}.md`));
    const reviewerFields = frontmatter(path.join(agentDir, `${reviewer}.md`));
    assert.deepEqual([fields.name, fields.model, fields['thinking-level']], [agent, model, effort]);
    assert.equal(reviewerFields.model, fields.model);
    assert.equal(reviewerFields['thinking-level'], fields['thinking-level']);
    assert.equal(overrides[agent], tier);
    assert.equal(overrides[agent], overrides[reviewer]);
  }
  // clean removes the self-review agents and their tier overrides with the other generated files.
  const script = path.join(SCRIPTS_DIR, 'prepare.mjs');
  const clean = spawnSync(BUN_RUNTIME, [script, 'clean', '--project', project], { encoding: 'utf8' });
  assert.equal(clean.status, 0, clean.stderr);
  assert.equal(fs.existsSync(path.join(project, '.omp')), false);
});
// Plan #115, decision 3, with the tier families of omp 19 (plan #192): omp sets a service tier only for a model of a
// tier family (omp.mjs TIER_FAMILIES: openai, anthropic, google) and records `serviceTier: null` on the messages of
// other providers. So a configuration whose model provider is in no tier family gets the single tier null: no tier
// part in its name, no tier override, and no served-tier check. More tiers then give no second configuration of that
// model.
const NO_TIER_MODEL = 'ollama/qwen3-coder';
const TIER_FAMILY_NAMES = 'openai, anthropic, google';
test('agents gives a configuration of a model in no tier family the tier null and no tier override', () => {
  const { project, agentDir } = selfReviewAgents('project', {
    model: `${MODEL},${NO_TIER_MODEL}`,
    efforts: 'xhigh',
    tiers: 'default',
  });
  const { configs } = readJson(path.join(agentDir, 'review-bench-configs.json'));
  assert.deepEqual(configs, [
    { name: 'gpt-6.1-sol-xhigh', model: MODEL, effort: 'xhigh', tier: 'default' },
    { name: 'qwen3-coder-xhigh', model: NO_TIER_MODEL, effort: 'xhigh', tier: null },
  ]);
  const overrides = tierOverrides(project);
  const agentsOf = (config) =>
    ['baseline-code', 'baseline-plan', 'candidate-code', 'candidate-plan', 'selfreview'].map(
      (part) => `review-bench-${part}-${config}`,
    );
  // Every review-bench file of a configuration is a valid agent with the model and effort of that configuration.
  for (const { name, model, effort, tier } of configs) {
    assert.deepEqual(
      fs
        .readdirSync(agentDir)
        .filter((file) => file.startsWith('review-bench-') && file.endsWith(`-${name}.md`))
        .sort(),
      agentsOf(name).map((agent) => `${agent}.md`),
    );
    for (const agent of agentsOf(name)) {
      const fields = frontmatter(path.join(agentDir, `${agent}.md`));
      assert.deepEqual([fields.name, fields.model, fields['thinking-level']], [agent, model, effort]);
      assert.equal(overrides[agent], tier ?? undefined);
    }
  }
  assert.deepEqual(
    Object.keys(overrides).filter((agent) => agent.includes('qwen')),
    [],
  );
  // The fixer keeps its OpenAI tier.
  assert.equal(overrides['review-bench-fixer'], FIXER_SETTING.tier);
  // Two tiers give two OpenAI configurations and one configuration without a tier part in its name.
  const grid = prepare.buildConfigs({
    models: [MODEL, NO_TIER_MODEL],
    efforts: ['xhigh'],
    tiers: ['priority', 'default'],
  });
  assert.deepEqual(
    grid.map(({ name, tier }) => [name, tier]),
    [
      ['gpt-6.1-sol-xhigh-fast', 'priority'],
      ['gpt-6.1-sol-xhigh', 'default'],
      ['qwen3-coder-xhigh', null],
    ],
  );
});
// A model of the anthropic or google tier family takes only the tiers of its family (`omp config get tier.<family>`),
// so agents refuses another tier before it writes, and an Anthropic configuration gets its tier override.
test('agents takes the tiers of the tier family of each model and refuses a tier that the family does not take', () => {
  const claude = 'anthropic/claude-opus-5-5';
  assert.throws(() => prepare.buildConfigs({ models: [MODEL, claude], efforts: ['xhigh'], tiers: ['default'] }), {
    message: `--tiers default does not apply to ${claude}: omp tier.anthropic takes none, priority`,
  });
  assert.throws(() => prepare.buildConfigs({ models: ['google/gemini-4-pro'], efforts: ['low'], tiers: ['scale'] }), {
    message: '--tiers scale does not apply to google/gemini-4-pro: omp tier.google takes none, flex, priority',
  });
  const { project, agentDir } = selfReviewAgents('project', { model: claude, efforts: 'xhigh', tiers: 'priority' });
  const { configs, fixer } = readJson(path.join(agentDir, 'review-bench-configs.json'));
  assert.deepEqual(configs, [{ name: 'xhigh-fast', model: claude, effort: 'xhigh', tier: 'priority' }]);
  const overrides = tierOverrides(project);
  assert.equal(overrides['review-bench-candidate-code-xhigh-fast'], 'priority');
  assert.equal(overrides['review-bench-fixer'], fixer.tier);
  // The requested tier of a transcript is the tier of the family of its model: an Anthropic run that asked for
  // priority shows priority, also when the session also holds an OpenAI tier.
  const facts = score.transcriptFacts(
    jsonl([
      { type: 'model_change', timestamp: isoAt(0), model: claude },
      { type: 'service_tier_change', timestamp: isoAt(0), serviceTier: { openai: 'default', anthropic: 'priority' } },
      { type: 'message', timestamp: isoAt(1), message: { role: 'user' } },
      assistantLine(5, 'anthropic', 'claude-opus-5-5', 'priority', { input: 10, output: 5 }),
    ]),
  );
  assert.equal(facts.requestedTier, 'priority');
});
test('report accepts a null-tier run served without a tier and refuses an OpenAI run served at another tier', () => {
  const [openai, noTier] = prepare.buildConfigs({
    models: [MODEL, NO_TIER_MODEL],
    efforts: ['xhigh'],
    tiers: ['default'],
  });
  const transcript = (provider, model, requested, served) => {
    const reply = assistantLine(5, provider, model, served, { input: 10, output: 5 });
    reply.message.serviceTier = served;
    return jsonl([
      { type: 'thinking_level_change', timestamp: isoAt(0), thinkingLevel: 'xhigh' },
      ...(requested ? [{ type: 'service_tier_change', timestamp: isoAt(0), serviceTier: { openai: requested } }] : []),
      { type: 'message', timestamp: isoAt(1), message: { role: 'user' } },
      reply,
    ]);
  };
  const runs = [
    [noTier, transcript('ollama', 'qwen3-coder', null, null)],
    [openai, transcript('openai-codex', 'gpt-6.1-sol', 'default', 'default')],
    [openai, transcript('openai-codex', 'gpt-6.1-sol', 'default', 'priority')],
  ];
  const costs = runs.map(([config, text]) => transcriptEntry(text, config.model));
  assert.deepEqual(costs[0].messages, [{ model: NO_TIER_MODEL, effort: 'xhigh', servedTier: null }]);
  const fixture = judgedArm(CODE_KNOWN.slice(0, 1), [[], [], []], costs);
  for (const [index, [config]] of runs.entries()) fixture.metas[`code-7/C3/run-${index + 1}`].config = config;
  const scores = scoreRuns(fixture);
  assert.deepEqual(
    scores.runs.map((run) => [run.run, run.invalid]),
    [
      ['run-1', []],
      ['run-2', []],
      ['run-3', ['correctness: served tier priority, not default']],
    ],
  );
  const lines = renderReport(scores, { reference: 'gpt-6.1-sol-xhigh' }).split('\n');
  assert.ok(lines.includes('- code-7/C3/run-3: correctness: served tier priority, not default'));
  assert.equal(
    lines.some((line) => /run-[12]: /.test(line) && line.startsWith('- ')),
    false,
  );
});
// Plan #115 code review: omp tells the tier family of a model by the provider part of its selector, the text before
// the first `/`. So agents refuses a `--model` or `--fixer-model` selector without a provider part, before it writes a
// file: `<option> <selector> has no provider part; give <provider>/<model>, for example openai-codex/gpt-6.1-sol`. It
// prints one line for each model that gets the tier null: `<model> gets the tier null: omp sets a service tier only
// for a model of a tier family (<families>), so --tiers <tiers> does not apply to it`. The fixer follows the same
// rule: a fixer model in no tier family gets the tier null, so no tier override and no served-tier check of its loop
// entries, and agents refuses `--fixer-tier` for it: `--fixer-tier: omp sets no service tier for <model>, whose
// provider is in no tier family (<families>); omit --fixer-tier`.

test('agents refuses a selector without a provider part and prints each model without a tier', () => {
  const grid = { model: `${MODEL},${NO_TIER_MODEL}`, efforts: 'xhigh', tiers: 'priority,default' };
  const result = selfReviewAgents('project', grid);
  const { root } = result;
  assert.deepEqual(
    result.lines.filter((line) => line.includes('tier null')),
    [
      `${NO_TIER_MODEL} gets the tier null: omp sets a service tier only for a model of a tier family (${TIER_FAMILY_NAMES}), so --tiers priority,default does not apply to it`,
    ],
  );
  const repo = path.join(root, 'repo');
  const options = agentsOptions(result);
  const noProvider = (option, model) =>
    `${option} ${model} has no provider part; give <provider>/<model>, for example openai-codex/gpt-6.1-sol`;
  const state = treeState(root);
  for (const [change, message] of [
    [{ model: 'gpt-6.1-sol' }, noProvider('--model', 'gpt-6.1-sol')],
    [{ model: `${MODEL},/gpt-6.1-sol` }, noProvider('--model', '/gpt-6.1-sol')],
    [{ 'fixer-model': 'gpt-6.1-sol' }, noProvider('--fixer-model', 'gpt-6.1-sol')],
  ]) {
    assert.throws(() => agentsOnBun({ ...options, ...change }, repo), { message });
    // agents refuses before it writes a file.
    assert.deepEqual(treeState(root), state);
  }
});
// Plan #175: the agents of the benchmark are omp agents only, so the CLI has no `--runtime` option and rejects it.
test('agents CLI rejects --runtime', () => {
  const script = path.join(SCRIPTS_DIR, 'prepare.mjs');
  for (const runtime of ['claude', 'omp']) {
    const result = spawnSync(BUN_RUNTIME, [script, 'agents', '--runtime', runtime], { encoding: 'utf8' });
    assert.equal(result.status, 1, result.stdout);
    assert.equal(result.stderr.split('\n')[0], "prepare.mjs: Unknown option '--runtime'");
  }
});
test('agents gives a fixer model in no tier family the tier null and refuses --fixer-tier for it', () => {
  const fixture = selfReviewAgents('project', { 'fixer-model': NO_TIER_MODEL });
  const { root, project, agentDir } = fixture;
  const configsFile = path.join(agentDir, 'review-bench-configs.json');
  const { fixer } = readJson(configsFile);
  assert.deepEqual(fixer, { model: NO_TIER_MODEL, effort: 'high', tier: null });
  const overrides = tierOverrides(project);
  assert.equal(Object.hasOwn(overrides, 'review-bench-fixer'), false);
  // The reviewer agents keep their tiers.
  assert.equal(overrides['review-bench-candidate-code-low'], 'default');
  // agents refuses --fixer-tier for such a model before it writes a file. An OpenAI fixer model takes it.
  const repo = path.join(root, 'repo');
  const options = agentsOptions(fixture);
  const state = treeState(root);
  const message = `--fixer-tier: omp sets no service tier for ${NO_TIER_MODEL}, whose provider is in no tier family (${TIER_FAMILY_NAMES}); omit --fixer-tier`;
  const noFamilyTier = { ...options, 'fixer-model': NO_TIER_MODEL, 'fixer-tier': 'priority' };
  assert.throws(() => agentsOnBun(noFamilyTier, repo), { message });
  assert.deepEqual(treeState(root), state);
  agentsOnBun({ ...options, 'fixer-tier': 'flex' }, repo);
  assert.deepEqual(readJson(configsFile).fixer, { model: MODEL, effort: 'high', tier: 'flex' });
  assert.equal(tierOverrides(project)['review-bench-fixer'], 'flex');
  // omp records `serviceTier: null` on the messages of such a fixer. Its loop entries get no served-tier check.
  const loop = {
    case: 'code-7',
    config: 'low',
    rounds: [
      [100, 1000, 'full', 20, ['valid']],
      [40, 1000, 'delta', 0, []],
    ],
  };
  const scored = gridFixture({ 'code-7': { split: 'dev', known: ['D1'] } }, [loop]);
  const round1 = scored.metas['code-7/C1-low/run-1/round-1'];
  round1.fixerConfig = fixer;
  round1.fixer.agents = { 'fixer-1': provenCost(fixer, 20, 100) };
  assert.deepEqual(round1.fixer.agents['fixer-1'].messages, [
    { model: NO_TIER_MODEL, effort: 'high', servedTier: null },
  ]);
  assert.deepEqual(
    scoreRuns(scored).runs.map((run) => [run.run, run.invalid]),
    [['run-1', []]],
  );
});
test('case --arms S1,S3 writes one self-review prompt on the full diff and one per lens on its focus diff', () => {
  const { root, repo, base, head } = loopRepo();
  const ws = path.join(root, 'ws');
  const cases = path.join(root, 'cases');
  const project = path.join(root, 'project');
  put(project, '.omp/agents/review-bench-configs.json', { configs: [CONFIGS.low] });
  const caseData = {
    id: 'code-7',
    kind: 'code',
    split: 'dev',
    issue: 7,
    round: 1,
    plan: 'code-7-plan.md',
    base,
    head,
    known: [],
  };
  put(cases, 'dev/code-7.json', caseData);
  put(cases, 'dev/code-7-plan.md', '# Plan 7\n');
  const options = {
    case: path.join(cases, 'dev', 'code-7.json'),
    arms: 'S1,S3',
    runs: '1',
    out: ws,
    configs: 'low',
    project,
  };
  const caseDir = path.join(ws, 'code-7');
  // The self-review runs once, before code-review round 1, so its arms take no --loop.
  assert.throws(() => prepare.prepareCase({ ...options, loop: true }, repo), /S1, S3/);
  assert.equal(fs.existsSync(caseDir), false);

  prepare.prepareCase(options, repo);
  const paths = prepare.workspacePaths(caseDir, caseData);
  const opening = prepare.buildOpening(caseData, paths);
  const runDir = (arm) => path.join(caseDir, `${arm}-low`, 'run-1');
  // A prompt file is the agent line, an empty line, and the prompt.
  const prompt = (arm, reviewer) => {
    const [agent, empty, ...rest] = readText(path.join(runDir(arm), 'prompts', `${reviewer}.txt`)).split('\n');
    assert.equal(empty, '');
    return { agent, body: rest.join('\n') };
  };
  const promptOf = (arm, reviewer) =>
    prepare.buildPromptFile({ caseData, arm, config: 'low', reviewer, paths }).split('\n').slice(2).join('\n');

  assert.deepEqual(fs.readdirSync(path.join(runDir('S1'), 'prompts')), ['self-review.txt']);
  const single = prompt('S1', 'self-review');
  assert.equal(single.agent, 'agent: review-bench-selfreview-low');
  assert.ok(single.body.startsWith(`${opening}\n\n`));
  assert.ok(single.body.split('\n').includes(`Full diff: ${paths.fullDiff}`));
  // S1 gets the prompt of a full code-review round.
  assert.equal(single.body, promptOf('C1', 'full'));

  assert.deepEqual(
    fs.readdirSync(path.join(runDir('S3'), 'prompts')).sort(),
    prepare.LENSES.map((lens) => `self-review-${lens}.txt`),
  );
  for (const lens of prepare.LENSES) {
    const panel = prompt('S3', `self-review-${lens}`);
    assert.equal(panel.agent, 'agent: review-bench-selfreview-low');
    assert.ok(panel.body.startsWith(`${opening}\n\n`));
    assert.ok(fs.existsSync(paths.focus[lens]));
    assert.ok(panel.body.split('\n').includes(`Focus diff: ${paths.focus[lens]}`));
    // Each S3 reviewer gets the prompt of a baseline panel lens, which describes the scope of the lens.
    assert.equal(panel.body, promptOf('B1', lens));
  }

  // Both arms are single-round runs.
  for (const arm of ['S1', 'S3']) {
    assert.deepEqual(fs.readdirSync(runDir(arm)).sort(), ['blocks', 'meta.json', 'prompts']);
    assert.deepEqual(readJson(path.join(runDir(arm), 'meta.json')), { config: CONFIGS.low });
  }
  assert.deepEqual(
    namesCommand(ws).map((entry) => entry.name),
    [
      'Code7S1LowR1SelfReview',
      'Code7S3LowR1SelfReviewCorrectness',
      'Code7S3LowR1SelfReviewSpecAndTests',
      'Code7S3LowR1SelfReviewTextAndSafety',
    ],
  );
});
// The agent text names the agent file in backticks, so the path of the project folder can have a space.
for (const folder of ['project', 'review project']) {
  test(`transcripts lets a self-review agent in "${folder}" read its own agent file and no other agent file`, () => {
    const { root, agentDir } = selfReviewAgents(folder);
    const ws = path.join(root, 'ws');
    const sessions = path.join(root, 'sessions');
    const caseDir = path.join(ws, 'code-7');
    const run = path.join(caseDir, 'S1-low', 'run-1');
    put(ws, 'code-7/case.json', { id: 'code-7', kind: 'code', split: 'dev' });
    put(caseDir, 'full.diff', '');
    put(run, 'prompts/self-review.txt', 'agent: review-bench-selfreview-low\n\nReview.\n');
    put(run, 'meta.json', { config: CONFIGS.low });
    const own = path.join(agentDir, 'review-bench-selfreview-low.md');
    const other = path.join(agentDir, 'review-bench-selfreview-high.md');
    const reviewer = path.join(agentDir, 'review-bench-candidate-code-low.md');
    const calls = [
      ['read', { path: own }],
      ['read', { path: `${own}:1-40` }],
      ['read', { path: 'skill://code-review' }],
      ['read', { path: 'skill://code-clarity/references/naming.md' }],
      ['read', { path: path.join(run, 'prompts', 'self-review.txt') }],
      ['read', { path: other }],
      ['read', { path: reviewer }],
    ];
    // The system prompt of the transcript holds the text of the self-review agent.
    const transcript = toolTranscript(caseDir, 30, calls, 'review-bench-selfreview-low')
      .split('\n')
      .map((line) => {
        const entry = JSON.parse(line);
        if (entry.type === 'session_init') entry.systemPrompt = ['You are a coding assistant.', readText(own)];
        return JSON.stringify(entry);
      })
      .join('\n');
    put(sessions, 'Code7S1LowR1SelfReview.jsonl', transcript);
    assert.deepEqual(transcriptsCommand(ws, sessions), ['Code7S1LowR1SelfReview']);
    assert.deepEqual(readJson(path.join(run, 'meta.json')).reviewers['self-review'].readScope, {
      outside: [other, reviewer],
    });
    // Without the agent file in the scope, the read of the own agent file is outside.
    assert.deepEqual(score.readScope(reads(own), { runDir: run, cwd: LIVE }), { outside: [own] });
  });
}
test('transcripts gives no read-scope allowance to a self-review agent file in .claude/agents', () => {
  const { root, project, agentDir } = selfReviewAgents();
  const ws = path.join(root, 'ws');
  const sessions = path.join(root, 'sessions');
  const caseDir = path.join(ws, 'code-7');
  const run = path.join(caseDir, 'S1-low', 'run-1');
  put(ws, 'code-7/case.json', { id: 'code-7', kind: 'code', split: 'dev' });
  put(caseDir, 'full.diff', '');
  put(run, 'prompts/self-review.txt', 'agent: review-bench-selfreview-low\n\nReview.\n');
  put(run, 'meta.json', { config: CONFIGS.low });
  const own = path.join(agentDir, 'review-bench-selfreview-low.md');
  const legacy = path.join(project, '.claude', 'agents', 'review-bench-selfreview-low.md');
  const calls = [
    ['read', { path: path.join(run, 'prompts', 'self-review.txt') }],
    ['read', { path: legacy }],
  ];
  // The system prompt names the agent file in `.claude/agents/` instead of `.omp/agents/`.
  const transcript = toolTranscript(caseDir, 30, calls, 'review-bench-selfreview-low')
    .split('\n')
    .map((line) => {
      const entry = JSON.parse(line);
      if (entry.type === 'session_init') {
        entry.systemPrompt = ['You are a coding assistant.', readText(own).replaceAll(own, legacy)];
      }
      return JSON.stringify(entry);
    })
    .join('\n');
  put(sessions, 'Code7S1LowR1SelfReview.jsonl', transcript);
  assert.deepEqual(transcriptsCommand(ws, sessions), ['Code7S1LowR1SelfReview']);
  assert.deepEqual(readJson(path.join(run, 'meta.json')).reviewers['self-review'].readScope, {
    outside: [legacy],
  });
});
// Changed export:
// - readScope puts these reads outside for every reviewer: a `skill://code-reviewer` or `skill://plan-reviewer` URI,
//   with or without a path, and a path under the code-reviewer or plan-reviewer skill folder of a plugin cache copy.
//   They resolve to the installed release, which can be another version than the arm. The own skill folder of a
//   reviewer under its plugin root stays allowed. A `skill://` URI that leaves the code-review or code-clarity folder
//   with `..` for another skill is outside too.
// - For a reviewer with `agentFiles` (the self-review agent), a `skill://` URI of code-review or code-clarity and a
//   path under these skill folders of a plugin cache copy are its own instructions. They stay allowed also when the
//   case changes them.

test('readScope puts the installed reviewer skills outside and exempts the own skills of the self-review agent', () => {
  const lifecycleCache = '/home/user/.omp/plugins/cache/plugins/docks___plan-lifecycle___0.17.1/skills';
  const docksCache = '/home/user/.omp/plugins/cache/plugins/docks___docks___0.21.0/skills';
  const installed = [
    'skill://code-reviewer',
    'skill://code-reviewer/references/correctness.md',
    'skill://plan-reviewer/SKILL.md',
    'skill://code-review/../code-reviewer/SKILL.md',
    `${lifecycleCache}/productivity/code-reviewer/SKILL.md`,
    `${lifecycleCache}/productivity/plan-reviewer/references/checklist.md`,
    `${lifecycleCache}/productivity/code-reviewer/references/*.md`,
  ];
  // Through these targets, a baseline reviewer reads the instructions of the installed release. Its own skill folder
  // under its plugin root stays allowed.
  const baseline = { runDir: `${SCOPE_CASE}/B0-low/run-1`, cwd: LIVE, pluginRoots: [BASELINE_PLUGIN] };
  const baselineSkill = `${BASELINE_PLUGIN}/skills/code-reviewer/SKILL.md`;
  assert.deepEqual(score.readScope(reads(...installed, baselineSkill), baseline), { outside: installed });
  const candidate = { runDir: `${SCOPE_CASE}/C1-low/run-1`, cwd: LIVE, pluginRoots: [LIVE_PLUGIN] };
  assert.deepEqual(score.readScope(reads(...installed), candidate), { outside: installed });

  // A case that changes the code-clarity skill.
  const changedFiles = ['plugins/docks/skills/code-clarity/SKILL.md'];
  const clarity = [
    'skill://code-clarity',
    `${docksCache}/engineering/code-clarity/SKILL.md`,
    `${docksCache}/engineering/code-clarity/*.md`,
  ];
  const selfReview = {
    runDir: `${SCOPE_CASE}/S1-low/run-1`,
    cwd: LIVE,
    agentFiles: ['/work/project/.omp/agents/review-bench-selfreview-low.md'],
    changedFiles,
  };
  // The self-review agent loads code-clarity as its own instructions, so the case-change rule does not apply.
  assert.deepEqual(score.readScope(reads(...clarity), selfReview), { outside: [] });
  // For a code reviewer, these reads are optional instruction reads, and the case changes their file.
  assert.deepEqual(score.readScope(reads(...clarity), { ...candidate, changedFiles }), { outside: clarity });
  // The installed reviewer skills and the copy of code-clarity in the live checkout stay outside for the self-review
  // agent.
  const liveClarity = `${LIVE}/plugins/docks/skills/code-clarity/SKILL.md`;
  assert.deepEqual(score.readScope(reads(...installed, liveClarity), selfReview), {
    outside: [...installed, liveClarity],
  });
});
// Plan #100 code review round 1: with --loop, the arm gives the side of the agent and the round policy of the loop.
// - C3 and B1: `panel-delta`, the rules of plan-lifecycle 0.17.1. A B1 panel prompt holds the lens text.
// - C1: `full-delta`, the same rules with a `full` round where they give a `panel` round.
// - B0: `full`, the policy of plan-lifecycle 0.16.0: every round is a `full` round.
// `case --loop` writes `{ policy }` to the meta.json of each run, and `loop` follows the policy that this meta.json
// records. It refuses a run whose meta.json records no policy or an unknown policy.

test('the round policy limits the modes that the rules of plan-contract.md give', () => {
  const repaired = { round: 2, completed: true, repairsOnly: true, fullLines: 120, deltaLines: 2 };
  const pulledIn = { ...repaired, repairsOnly: false };
  assert.equal(prepare.roundMode({ policy: 'panel-delta', round: 1, fullLines: 50 }), 'panel');
  assert.equal(prepare.roundMode({ policy: 'panel-delta', ...repaired }), 'delta');
  assert.equal(prepare.roundMode({ policy: 'panel-delta', ...pulledIn }), 'panel');
  // One full reviewer: a full round where panel-delta gives a panel round, and the same delta rounds.
  assert.equal(prepare.roundMode({ policy: 'full-delta', round: 1, fullLines: 50 }), 'full');
  assert.equal(prepare.roundMode({ policy: 'full-delta', ...repaired }), 'delta');
  assert.equal(prepare.roundMode({ policy: 'full-delta', ...pulledIn }), 'full');
  // No panel round and no delta round.
  assert.equal(prepare.roundMode({ policy: 'full', round: 1, fullLines: 50 }), 'full');
  assert.equal(prepare.roundMode({ policy: 'full', ...repaired }), 'full');
  assert.equal(prepare.roundMode({ policy: 'full', ...pulledIn }), 'full');
});
// The round modes of each arm: round 1 from `case --loop`, round 2 from `loop` after the fix of D1 in one line.
for (const [count, modes] of [
  [
    49,
    {
      B0: ['full', 'full'],
      B1: ['full', 'delta'],
      B3: ['full', 'delta'],
      C1: ['full', 'delta'],
      C3: ['full', 'delta'],
    },
  ],
  [
    50,
    {
      B0: ['full', 'full'],
      B1: ['panel', 'delta'],
      B3: ['panel', 'delta'],
      C1: ['full', 'delta'],
      C3: ['panel', 'delta'],
    },
  ],
]) {
  test(`case --loop and loop give each arm the rounds of its policy on a diff of ${count} lines`, () => {
    const { repo, ws, cases, caseData, caseDir, run } = policyLoops(count);
    const paths = prepare.workspacePaths(caseDir, caseData);
    const agentOf = (arm) => `agent: review-bench-${arm.startsWith('B') ? 'baseline' : 'candidate'}-code-low`;
    const reviewersOf = (mode) => (mode === 'panel' ? prepare.LENSES : [mode]);
    const promptFile = (arm, round, reviewer) => path.join(run(arm), `round-${round}`, 'prompts', `${reviewer}.txt`);

    for (const [arm, policy] of Object.entries(POLICY_ARMS)) {
      const mode = modes[arm][0];
      assert.deepEqual(readJson(path.join(run(arm), 'meta.json')), { policy });
      const meta = readJson(path.join(run(arm), 'round-1', 'meta.json'));
      assert.deepEqual([meta.config, meta.mode, meta.fullLines], [CONFIGS.low, mode, count]);
      assert.deepEqual(
        fs.readdirSync(path.join(run(arm), 'round-1', 'prompts')).sort(),
        reviewersOf(mode).map((reviewer) => `${reviewer}.txt`),
      );
      for (const reviewer of reviewersOf(mode)) {
        const file = promptFile(arm, 1, reviewer);
        assert.equal(readText(file), prepare.buildPromptFile({ caseData, arm, config: 'low', reviewer, paths, mode }));
        const { agent, body } = promptFileParts(file);
        assert.equal(agent, agentOf(arm));
        assert.ok(body.split('\n').includes(`Round mode: ${mode}.`), `${arm} ${reviewer} names another mode`);
      }
    }
    if (modes.C3[0] === 'panel') {
      // The panel prompts of B1 and C3 differ only in the lens text, which the B1 dispatch holds.
      for (const lens of prepare.LENSES) {
        const [b1, c3] = ['B1', 'C3'].map((arm) => promptFileParts(promptFile(arm, 1, lens)).body.split('\n'));
        assert.deepEqual(
          b1.filter((line) => c3.includes(line)),
          c3,
          `the B1 ${lens} prompt changes a line of the C3 prompt`,
        );
        const lensText = b1.filter((line) => !c3.includes(line));
        assert.ok(
          lensText.some((line) => line.startsWith('Your lens covers')),
          `the B1 ${lens} prompt has no scope`,
        );
        assert.ok(lensText.includes(`Use the heading \`### Code review round 1, lens ${lens}\`.`));
        assert.ok(c3.includes(`Lens: ${lens}`));
      }
    } else {
      // Below the panel threshold, B1 gets the full prompt of C3.
      const [b1, c3] = ['B1', 'C3'].map((arm) => promptFileParts(promptFile(arm, 1, 'full')).body);
      assert.equal(b1, c3);
    }

    const answers = [];
    for (const arm of Object.keys(POLICY_ARMS)) {
      const reviewers = reviewersOf(modes[arm][0]);
      for (const reviewer of reviewers) put(run(arm), `round-1/blocks/${reviewer}.md`, policyBlock(reviewer));
      const finder = reviewers.includes('correctness') ? 'correctness' : 'full';
      answers.push([`code-7/${arm}-low/run-1/round-1/${finder}#1`, 'D1']);
    }
    findingsCommand(ws);
    judgeLoop(ws, answers);
    for (const arm of Object.keys(POLICY_ARMS)) {
      const mode = modes[arm][1];
      const next = path.join(run(arm), 'round-2');
      assert.equal(prepare.prepareLoop({ run: run(arm), cases }, repo), next);
      // The fix of D1 changes one line, so the delta diff of 2 lines is at most half the full diff.
      const meta = readJson(path.join(next, 'meta.json'));
      assert.deepEqual([meta.mode, meta.fullLines, meta.deltaLines], [mode, count, 2]);
      assert.deepEqual(fs.readdirSync(path.join(next, 'prompts')), [`${mode}.txt`]);
      const { agent, body } = promptFileParts(promptFile(arm, 2, mode));
      assert.equal(agent, agentOf(arm));
      assert.ok(body.split('\n').includes(`Round mode: ${mode}.`), `${arm} round 2 names another mode`);
    }
    // B0 reviews the full diff of round 2 again and gets no delta diff.
    const b0 = promptFileParts(promptFile('B0', 2, 'full')).body.split('\n');
    assert.ok(b0.includes(`Full diff: ${path.join(run('B0'), 'round-2', 'full.diff')}`));
    assert.equal(
      b0.some((line) => line.startsWith('Delta diff:')),
      false,
    );
    // The B1 delta prompt is the C3 delta prompt with the files of its own round folder.
    const [b1, c3] = ['B1', 'C3'].map((arm) => promptFileParts(promptFile(arm, 2, 'delta')).body);
    assert.equal(b1.replaceAll(run('B1'), run('C3')), c3);
    // B3 has the C3 prompt in every round, with the files of its own run folder (#113).
    for (const [round, reviewer] of [...reviewersOf(modes.C3[0]).map((name) => [1, name]), [2, 'delta']]) {
      const [b3, candidate] = ['B3', 'C3'].map((arm) => promptFileParts(promptFile(arm, round, reviewer)).body);
      assert.equal(b3.replaceAll(run('B3'), run('C3')), candidate, `the B3 round ${round} ${reviewer} prompt`);
    }
  });
}
