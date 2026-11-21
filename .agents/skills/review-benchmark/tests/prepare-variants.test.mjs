import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'vitest';
import { BUN_RUNTIME } from '../../../../cli/test/lib/cliEntry.ts';
import * as prepare from '../scripts/prepare.mjs';
import * as score from '../scripts/score.mjs';
import { findingsCommand, main, namesCommand, reportCommand, transcriptsCommand } from '../scripts/score.mjs';
import {
  agentsOnBun,
  CONFIGS,
  CONTRACT,
  CONTRACT_FORM,
  COPIED_SCRIPTS,
  copyContractRule,
  copyScripts,
  escapeRegExp,
  fakeOmp,
  filesUnder,
  FIXER_SETTING,
  FULL_BLOCK,
  gitIn,
  isolateGit,
  judgeAll,
  judgeLoop,
  KIT_CONTRACT,
  KIT_ROOT,
  LEGACY_PLUGIN_ROOT,
  legacyVariantAgentText,
  LIVE,
  LIVE_PLUGIN,
  loopRepo,
  MANAGER_SETTING,
  MODEL,
  neutralScratch,
  noContract,
  overlayFixture,
  PASS_ROUND,
  PLAN_BLOCK,
  PLAN_KEY,
  PREPARE_SCRIPT,
  promptFileParts,
  put,
  readJson,
  reads,
  readText,
  roundWorkspace,
  SCOPE_WS,
  SNAPSHOT_CONTRACT_RULE,
  tableAfter,
  tierOverrides,
  toolTranscript,
  treeState,
  VARIANT_DELTA,
  variantAgentText,
  variantOptions,
  variantRepo,
} from './helpers.mjs';

// Plan #109 step 1: API note for the variant tests below (decision 2).
//
// prepare.mjs:
// - prepareAgents takes `variants` (`--variants <name>=<git ref>[,...]`) and `full-only` (`--full-only <name,...>`).
//   For each variant, it extracts plugins/plan-lifecycle at the ref into the folder `variant-<name>-plugin` next to
//   the baseline copy (in the parent folder of the baseline dir). For each variant and configuration, it writes the
//   agent `review-bench-variant-<name>-plan-<config>`: renderAgent of plugins/plan-lifecycle/agents/plan-reviewer.md
//   at the ref, with the model and the effort of the configuration and the variant folder as the plugin root. The
//   agent gets the tier override of the configuration. The list of configurations gets `variants`: one
//   { name, ref, sha, delta } per variant, in --variants order. delta is false for a --full-only name. These refusals
//   come before a file of the project changes:
//   `--variants: the variant name <name> has a character other than a-z and 0-9`,
//   `--variants: the variant name <name> occurs two times`,
//   `plugins/plan-lifecycle/agents/plan-reviewer.md does not exist at <ref>`,
//   `--full-only names <name>, which is not a variant`.
// - prepareCase: a plan or plan-delta case also takes the arm `V<name>` for each variant of the list of
//   configurations. A list without `variants` gives no variant arm. The refusal of an unknown arm lists the variant
//   arms after the other arms of the kind. Code and code-delta cases take no variant arm.
//   A variant arm runs its variant agent with the reviewer `plan`. Its mode is `full` on a plan case. On a plan-delta
//   case, its mode is `delta`, or `full` when its delta is false. Its prompt is the prompt of the static arm of the
//   same mode (P0 or P1 for `full`, Pd for `delta`); only the agent line differs.
// - The case field `show_benchmark: true` puts the benchmark skill folder without its `cases/` folder in the snapshot.
//   Without the field, the snapshot leaves out the whole folder, as before. The scripts hide the skill folder of their
//   own repository, so the test of this field runs a copy of prepare.mjs, score.mjs, and the plan helper. In a review
//   loop, the fixer snapshot, the snapshot and the diffs of a later round, and the tree copy of the judge follow the
//   same rule.
// score.mjs:
// - reportCommand takes the option `reference`, and `report` takes `--reference <folder>`. The shared-cases row and
//   the interval rows then compare each column with that folder, and the report says `The reference column is
//   <folder>.` instead of `The reference column has the fewest escaped defects per 50 known defects.`
// - transcripts and readScope keep their rules: the agent text of a variant names the skill of its own plugin root,
//   so its reviewer may read that root and no other variant root.

// The variants of variantOptions and their refs.
const VARIANT_REFS = { 16: 'v16', a: 'cand-a' };
// The plugin root of a variant: `agents` extracts it next to the baseline copy.
const variantRoot = (root, name) => path.join(root, `variant-${name}-plugin`);
test('agents --variants writes an agent per variant and configuration from the plan reviewer at its ref', () => {
  const fixture = variantRepo();
  const { root, repo, project, agentDir, shas } = fixture;
  agentsOnBun(variantOptions(fixture), repo);
  const list = readJson(path.join(agentDir, 'review-bench-configs.json'));
  assert.deepEqual(
    list.configs.map((config) => config.name),
    ['low', 'low-fast', 'xhigh', 'xhigh-fast'],
  );
  assert.deepEqual(list.variants, [
    { name: '16', ref: 'v16', sha: shas.v16, delta: false },
    { name: 'a', ref: 'cand-a', sha: shas['cand-a'], delta: true },
  ]);
  assert.deepEqual(
    fs
      .readdirSync(agentDir)
      .filter((file) => file.startsWith('review-bench-variant-'))
      .sort(),
    Object.keys(VARIANT_REFS)
      .flatMap((name) => list.configs.map((config) => `review-bench-variant-${name}-plan-${config.name}.md`))
      .sort(),
  );
  const overrides = tierOverrides(project);
  for (const [name, ref] of Object.entries(VARIANT_REFS)) {
    const pluginRoot = variantRoot(root, name);
    const atRef = (file) => gitIn(repo, 'show', `${ref}:plugins/plan-lifecycle/${file}`);
    for (const { name: config, model, effort, tier } of list.configs) {
      const agent = `review-bench-variant-${name}-plan-${config}`;
      const text = readText(path.join(agentDir, `${agent}.md`));
      // The agent text at the ref, with the model and the effort of the configuration and the variant plugin root.
      const rendered = prepare.renderAgent(atRef('agents/plan-reviewer.md'), {
        name: agent,
        model,
        effort,
        pluginRoot,
      });
      assert.equal(text, rendered);
      assert.ok(text.includes(`\`${pluginRoot}/skills/plan-reviewer/SKILL.md\``));
      // The copy reads the skill of its plugin root, not the installed skill.
      assert.doesNotMatch(text, /skill:\/\/|^autoload-skills:/m);
      assert.ok(!text.includes(LEGACY_PLUGIN_ROOT));
      assert.equal(overrides[agent], tier);
    }
    // The plugin root holds plugins/plan-lifecycle at the ref, not the files of the work tree.
    for (const file of [
      'agents/plan-reviewer.md',
      'skills/plan-reviewer/SKILL.md',
      'skills/plan-manager/references/plan-contract.md',
    ]) {
      assert.equal(readText(path.join(pluginRoot, file)), atRef(file));
    }
  }
  assert.equal(fs.existsSync(path.join(variantRoot(root, 'a'), VARIANT_DELTA)), true);
  assert.equal(fs.existsSync(path.join(variantRoot(root, '16'), VARIANT_DELTA)), false);
  // clean removes the variant agents and their tier overrides with the other generated files.
  const clean = spawnSync(BUN_RUNTIME, [PREPARE_SCRIPT, 'clean', '--project', project], { encoding: 'utf8' });
  assert.equal(clean.status, 0, clean.stderr);
  assert.equal(fs.existsSync(path.join(project, '.omp')), false);
});
test('agents refuses bad or repeated variant names, refs without a plan reviewer, and unknown full-only names', () => {
  const fixture = variantRepo();
  const { root, repo, project } = fixture;
  const options = variantOptions(fixture);
  const badName = (name) => `--variants: the variant name ${name} has a character other than a-z and 0-9`;
  const refusals = [
    [{ variants: 'A=v16', 'full-only': undefined }, badName('A')],
    [{ variants: 'a-b=v16', 'full-only': undefined }, badName('a-b')],
    [{ variants: '16=v16,16=cand-a' }, '--variants: the variant name 16 occurs two times'],
    [{ variants: '16=v16,a=bare' }, 'plugins/plan-lifecycle/agents/plan-reviewer.md does not exist at bare'],
    [{ 'full-only': '16,b' }, '--full-only names b, which is not a variant'],
  ];
  for (const [change, message] of refusals) {
    assert.throws(() => agentsOnBun({ ...options, ...change }, repo), new RegExp(escapeRegExp(message)));
    // agents refuses before it writes a file of the project.
    assert.equal(fs.existsSync(path.join(project, '.omp')), false);
  }
  // The command line takes both options.
  const cli = (...args) =>
    spawnSync(
      BUN_RUNTIME,
      [
        PREPARE_SCRIPT,
        'agents',
        '--baseline-ref',
        'HEAD',
        '--model',
        MODEL,
        '--efforts',
        'low',
        '--tiers',
        'default',
        '--baseline-dir',
        path.join(root, 'cli-baseline-plugin'),
        '--project',
        project,
        ...args,
      ],
      { encoding: 'utf8', env: fakeOmp().env },
    );
  const twice = cli('--variants', 'a=HEAD,a=HEAD');
  assert.equal(twice.status, 1, twice.stderr);
  assert.match(twice.stderr, /--variants: the variant name a occurs two times/);
  const notVariant = cli('--variants', 'a=HEAD', '--full-only', 'b');
  assert.equal(notVariant.status, 1, notVariant.stderr);
  assert.match(notVariant.stderr, /--full-only names b, which is not a variant/);
  assert.equal(fs.existsSync(path.join(project, '.omp')), false);
});
test('case builds variant arms in full mode, and in delta mode on plan-delta cases unless full only', () => {
  const { root, repo, base, head } = loopRepo();
  const ws = path.join(root, 'ws');
  const cases = path.join(root, 'cases');
  const project = path.join(root, 'project');
  const configsFile = '.omp/agents/review-bench-configs.json';
  const variants = [
    { name: '16', ref: 'v16', sha: base, delta: false },
    { name: 'a', ref: 'cand-a', sha: head, delta: true },
  ];
  put(project, configsFile, { configs: [CONFIGS.low], fixer: FIXER_SETTING, variants });
  const planCase = {
    id: 'plan-3',
    kind: 'plan',
    split: 'dev',
    issue: 3,
    round: 1,
    plan: 'plan-3-plan.md',
    repo_ref: head,
  };
  const deltaCase = {
    id: 'plan-4',
    kind: 'plan-delta',
    split: 'dev',
    issue: 4,
    round: 2,
    plan: 'plan-4-plan.md',
    repo_ref: head,
    previous_body: 'plan-4-previous.md',
    previous_review: 'plan-4-review.md',
  };
  const codeCase = { id: 'code-7', kind: 'code', split: 'dev', issue: 7, round: 1, plan: 'code-7-plan.md', base, head };
  const codeDeltaCase = {
    id: 'code-8',
    kind: 'code-delta',
    split: 'dev',
    issue: 8,
    round: 2,
    plan: 'code-8-plan.md',
    base,
    head,
    delta_base: base,
    previous_review: 'code-8-review.md',
  };
  for (const caseData of [planCase, deltaCase, codeCase, codeDeltaCase]) {
    caseData.known = [];
    put(cases, `dev/${caseData.id}.json`, caseData);
    put(cases, `dev/${caseData.plan}`, `# Plan ${caseData.issue}\n\nStep 1 and step 2.\n`);
  }
  put(cases, 'dev/plan-4-previous.md', '# Plan 4\n\nStep 1.\n');
  put(cases, 'dev/plan-4-review.md', PLAN_BLOCK.replace('round 2', 'round 1'));
  put(cases, 'dev/code-8-review.md', FULL_BLOCK);
  const options = (id, arms) => ({
    case: path.join(cases, 'dev', `${id}.json`),
    arms,
    runs: '1',
    out: ws,
    configs: 'low',
    project,
  });
  const refuses = (id, arms, message) => assert.throws(() => prepare.prepareCase(options(id, arms), repo), message);
  // The variant arms of the list of configurations join the arms of the plan kinds.
  refuses('plan-3', 'Vb', /arm Vb does not apply to plan cases; use P0, P1, V16, Va$/);
  refuses('plan-4', 'Vb', /arm Vb does not apply to plan-delta cases; use P0, Pd, V16, Va$/);
  // Code and code-delta cases take no variant arm.
  for (const arm of ['V16', 'Va']) {
    refuses('code-7', arm, new RegExp(`arm ${arm} does not apply to code cases; use B0, B1, B3, C1, C3, S1, S3$`));
    refuses('code-8', arm, new RegExp(`arm ${arm} does not apply to code-delta cases; use B0, Bd, Cd$`));
  }
  // A list of configurations without variants gives no variant arm.
  put(project, configsFile, { configs: [CONFIGS.low], fixer: FIXER_SETTING });
  refuses('plan-3', 'Va', /arm Va does not apply to plan cases; use P0, P1$/);
  for (const id of ['plan-3', 'plan-4', 'code-7', 'code-8']) assert.equal(fs.existsSync(path.join(ws, id)), false);

  put(project, configsFile, { configs: [CONFIGS.low], fixer: FIXER_SETTING, variants });
  prepare.prepareCase(options('plan-3', 'P1,V16,Va'), repo);
  prepare.prepareCase(options('plan-4', 'V16,Va'), repo);
  // The prompt of a static arm at the configuration low, without its agent line.
  const promptOf = (caseData, arm) => {
    const paths = prepare.workspacePaths(path.join(ws, caseData.id), caseData);
    const file = prepare.buildPromptFile({ caseData, arm, config: 'low', reviewer: 'plan', paths });
    return file.split('\n').slice(2).join('\n');
  };
  // The one prompt file of a run at the configuration low.
  const built = (caseId, arm) => {
    const runDir = path.join(ws, caseId, `${arm}-low`, 'run-1');
    assert.deepEqual(fs.readdirSync(path.join(runDir, 'prompts')), ['plan.txt']);
    assert.deepEqual(readJson(path.join(runDir, 'meta.json')).config, CONFIGS.low);
    return promptFileParts(path.join(runDir, 'prompts', 'plan.txt'));
  };
  // On a plan case, each variant gets the full-mode prompt of P1 with its own agent.
  const full = promptOf(planCase, 'P1');
  assert.ok(full.split('\n').includes('Round mode: full.'));
  assert.deepEqual(built('plan-3', 'P1'), { agent: 'agent: review-bench-candidate-plan-low', body: full });
  assert.deepEqual(built('plan-3', 'V16'), { agent: 'agent: review-bench-variant-16-plan-low', body: full });
  assert.deepEqual(built('plan-3', 'Va'), { agent: 'agent: review-bench-variant-a-plan-low', body: full });
  // On a plan-delta case, Va gets the delta-mode prompt of Pd. V16 has no delta mode, so it gets the full-mode prompt
  // of P0.
  const deltaPaths = prepare.workspacePaths(path.join(ws, 'plan-4'), deltaCase);
  const delta = promptOf(deltaCase, 'Pd');
  assert.ok(delta.split('\n').includes('Round mode: delta.'));
  assert.ok(delta.split('\n').includes(`Plan diff: ${deltaPaths.planDiff}`));
  assert.ok(fs.existsSync(deltaPaths.planDiff));
  assert.deepEqual(built('plan-4', 'Va'), { agent: 'agent: review-bench-variant-a-plan-low', body: delta });
  const deltaFull = promptOf(deltaCase, 'P0');
  assert.ok(deltaFull.split('\n').includes('Round mode: full.'));
  assert.deepEqual(built('plan-4', 'V16'), { agent: 'agent: review-bench-variant-16-plan-low', body: deltaFull });
  assert.deepEqual(
    namesCommand(ws)
      .map((entry) => entry.name)
      .sort(),
    ['Plan3P1LowR1Plan', 'Plan3V16LowR1Plan', 'Plan3VaLowR1Plan', 'Plan4V16LowR1Plan', 'Plan4VaLowR1Plan'],
  );
});
test('transcripts lets a variant reviewer read its own plugin root and no other variant root', () => {
  const fixture = variantRepo();
  const { root, repo, agentDir } = fixture;
  agentsOnBun(variantOptions(fixture), repo);
  const agent = 'review-bench-variant-a-plan-low';
  const agentFile = path.join(agentDir, `${agent}.md`);
  assert.ok(fs.existsSync(agentFile), `agents wrote no ${agent}.md`);
  const ws = path.join(root, 'ws');
  const sessions = path.join(root, 'sessions');
  const caseDir = path.join(ws, 'plan-3');
  const run = path.join(caseDir, 'Va-low', 'run-1');
  put(caseDir, 'case.json', { id: 'plan-3', kind: 'plan', split: 'dev' });
  put(caseDir, 'plan.md', '# Plan 3\n');
  put(run, 'prompts/plan.txt', `agent: ${agent}\n\nReview.\n`);
  put(run, 'meta.json', { config: CONFIGS.low });
  const own = variantRoot(root, 'a');
  const other = variantRoot(root, '16');
  const ownReads = [
    ['read', { path: `${own}/skills/plan-reviewer/SKILL.md` }],
    ['read', { path: `${own}/${VARIANT_DELTA}:1-40` }],
    ['glob', { path: `${own}/skills/plan-reviewer/references/*.md` }],
    ['read', { path: `${own}/agents/plan-reviewer.md` }],
    ['read', { path: `${own}/skills/plan-manager/references/plan-contract.md` }],
  ];
  // The skill and the agent file of the other variant, and the skill of the live checkout.
  const outside = [
    `${other}/skills/plan-reviewer/SKILL.md`,
    `${other}/agents/plan-reviewer.md`,
    `${LIVE_PLUGIN}/skills/plan-reviewer/SKILL.md`,
  ];
  const calls = [...ownReads, ...outside.map((target) => ['read', { path: target }])];
  // The system prompt of the transcript holds the text of the variant agent.
  const transcript = toolTranscript(caseDir, 30, calls, agent)
    .split('\n')
    .map((line) => {
      const entry = JSON.parse(line);
      if (entry.type === 'session_init') entry.systemPrompt = ['You are a coding assistant.', readText(agentFile)];
      return JSON.stringify(entry);
    })
    .join('\n');
  put(sessions, 'Plan3VaLowR1Plan.jsonl', transcript);
  assert.deepEqual(transcriptsCommand(ws, sessions), ['Plan3VaLowR1Plan']);
  assert.deepEqual(readJson(path.join(run, 'meta.json')).reviewers.plan.readScope, { outside });
});
test('report --reference compares every arm column with the named folder, and report needs it', () => {
  const { ws, cases } = roundWorkspace([
    {
      config: CONFIGS.low,
      run: 1,
      rounds: [
        [FULL_BLOCK, 100, 1000, 'full'],
        [PASS_ROUND, 40, 400, 'delta'],
      ],
    },
    { config: CONFIGS['low-fast'], run: 1, rounds: [[PASS_ROUND.replace('round 2', 'round 1'), 50, 500, 'full']] },
  ]);
  findingsCommand(ws);
  main(['pairs', ws, '--cases', cases]);
  judgeAll(ws, (_, known) => (known === 'D1' ? 'match' : 'no'));
  const arms = ['C1-low-fast', 'C1-low'];
  const report = () => readText(path.join(ws, 'report.md'));
  // The shared-cases row and the three interval rows come before the rows of the exact tests and of N.
  const compared = () => tableAfter(report(), '### Decision: dev').slice(-10, -6);
  // C1-low finds D1 and escapes the fewest, but the report takes no reference from the results.
  assert.throws(() => reportCommand(ws, { arms }), /^Error: report needs --reference <column>/);
  assert.equal(fs.existsSync(path.join(ws, 'report.md')), false);
  const named = [
    '| Cases shared with C1-low-fast | - | 1 |',
    '| Round 1 recall difference from C1-low-fast, 90% interval | - | [0.33, 0.33] |',
    '| Escaped per 50 known difference from C1-low-fast, 90% interval | - | [-16.67, -16.67] |',
    '| Loop seconds difference from C1-low-fast, 90% interval | - | [90.0, 90.0] |',
  ];
  reportCommand(ws, { arms, reference: 'C1-low-fast' });
  assert.deepEqual(compared(), named);
  assert.ok(report().includes('The reference column is C1-low-fast.'));
  // The command line takes the same option.
  reportCommand(ws, { arms, reference: 'C1-low' });
  assert.equal(main(['report', ws, '--arms', arms.join(','), '--reference', 'C1-low-fast']), 'report.md: 2 runs');
  assert.deepEqual(compared(), named);
});
test('a case with show_benchmark gets the benchmark skill folder without its cases folder in the snapshot', () => {
  isolateGit();
  const root = neutralScratch();
  const repo = path.join(root, 'repo');
  const ws = path.join(root, 'ws');
  const cases = path.join(root, 'cases');
  const project = path.join(root, 'project');
  // The scripts hide the skill folder of the repository that holds them, so this test runs a copy of them in a
  // repository with a benchmark skill folder (see copyScripts).
  const skill = '.agents/skills/review-benchmark';
  gitIn(root, 'init', '-q', '-b', 'main', repo);
  const script = copyScripts(repo);
  put(repo, `${skill}/SKILL.md`, '# Review benchmark\n');
  put(repo, `${skill}/results.md`, '# Results\n');
  put(repo, `${skill}/cases/dev/plan-1.json`, { id: 'plan-1', kind: 'plan', split: 'dev', known: [] });
  put(repo, `${skill}/cases/heldout/plan-2.key.json`, { known: PLAN_KEY });
  put(repo, '.agents/skills/other/SKILL.md', '# Other\n');
  put(repo, 'README.md', '# Demo\n');
  gitIn(repo, 'add', '-A');
  gitIn(repo, 'commit', '-q', '-m', 'skill');
  const head = gitIn(repo, 'rev-parse', 'HEAD').trim();
  put(project, '.omp/agents/review-bench-configs.json', { configs: [CONFIGS.low] });
  for (const [id, field] of [
    ['plan-5', { show_benchmark: true }],
    ['plan-6', {}],
  ]) {
    const caseData = { id, kind: 'plan', split: 'dev', issue: 5, round: 1, plan: `${id}-plan.md`, repo_ref: head };
    put(cases, `dev/${id}.json`, { ...caseData, known: [], ...field });
    put(cases, `dev/${id}-plan.md`, '# Plan 5\n');
    const args = ['--case', path.join(cases, 'dev', `${id}.json`), '--arms', 'P1', '--runs', '1', '--out', ws];
    const build = spawnSync(BUN_RUNTIME, [script, 'case', ...args, '--project', project], { encoding: 'utf8' });
    assert.equal(build.status, 0, build.stderr);
  }
  const snapshotFiles = (id) => {
    const dir = path.join(ws, id, 'snapshot');
    return filesUnder(dir)
      .map((file) => path.relative(dir, file).split(path.sep).join('/'))
      .sort();
  };
  // The skill folder shows its files, and its cases folder with the keys stays out.
  assert.deepEqual(snapshotFiles('plan-5'), [
    '.agents/skills/other/SKILL.md',
    `${skill}/SKILL.md`,
    `${skill}/results.md`,
    `${skill}/scripts/omp.mjs`,
    `${skill}/scripts/prepare.mjs`,
    `${skill}/scripts/score.mjs`,
    'README.md',
  ]);
  // Without the field, the whole skill folder stays out.
  assert.deepEqual(snapshotFiles('plan-6'), ['.agents/skills/other/SKILL.md', 'README.md']);
});
// Plan #109 step 9: API note for the tests below (decision 2, and the refusals of code review round 1).
//
// prepare.mjs:
// - prepareAgents takes `contract-overlay` (`--contract-overlay <name,...>`): variants of `variants` whose commit
//   changes plugins/plan-lifecycle/skills/plan-manager/references/plan-contract.md against its first
//   parent. The entry of such a variant in the list of configurations gets `contractDiff`, the git diff of that file
//   from the first parent to the commit. Before it extracts a plugin or writes a file of the project, agents refuses: a
//   name of --full-only or --contract-overlay that is not a variant, or one of these options without --variants; an
//   empty or malformed --variants entry, and an empty --full-only; a commit that does not change the contract; plugin
//   copies that would go to one folder (a --baseline-dir that is the folder of a variant copy); and a variant agent
//   that does not name its own reviewer skill.
// - prepareCase writes, for each run of a variant arm with `contractDiff`, `run-<k>/plan-contract.md`: the contract of
//   the snapshot with the diff applied by `git apply`. The meta.json of the run gets `contractOverlay`: `applied`, or
//   `not applicable` when the diff does not apply and the contract of the snapshot holds no line that the diff removes,
//   blank lines aside (the copy then holds the contract of the snapshot). When the diff does not apply to a contract
//   that holds a removed line, case stops with `the contract change does not apply to <snapshot contract> for the run
//   <run folder>: <message of git>` and writes nothing for the case. The prompt of the run tells the reviewer to read
//   the plan contract at the copy and every other repository file under the snapshot root. A snapshot without the
//   contract stops the command.
// - prepareCase takes `extend` (`--extend`): the case folder exists and holds the same case.json, and case adds the
//   arm folders and keeps every other file. It refuses an arm folder that exists, a missing case folder, and a case
//   folder of another case file. A failed call removes only the arm folders that it wrote.
// score.mjs:
// - readScope allows `<run folder>/plan-contract.md` of its own run, also when the case changes the plan contract.
// - reportCommand refuses an empty `reference`.
// - reviewerPluginRoots, and the agent files that transcripts finds in a system prompt, take an instruction path in
//   backticks or quotes up to the closing quote, so the path can hold spaces. A bare path ends at the first space. So
//   `agents --variants` takes an --out folder whose parent has a space in its path.

test('agents --contract-overlay records the contract change of a variant against its first parent', () => {
  const fixture = variantRepo();
  const { repo, agentDir, shas } = fixture;
  agentsOnBun({ ...variantOptions(fixture), 'contract-overlay': 'a' }, repo);
  const change = gitIn(repo, 'diff', '--no-color', 'cand-a^1', 'cand-a', '--', CONTRACT);
  assert.match(change, /^-# Plan contract 0\.16\.0\n\+# Plan contract A$/m);
  assert.deepEqual(readJson(path.join(agentDir, 'review-bench-configs.json')).variants, [
    { name: '16', ref: 'v16', sha: shas.v16, delta: false },
    { name: 'a', ref: 'cand-a', sha: shas['cand-a'], delta: true, contractDiff: change },
  ]);
});
test('agents refuses colliding plugin copies, bad variant options, and unusable refs before it writes', () => {
  const fixture = variantRepo();
  const { root, repo, project } = fixture;
  const tagCommit = (tag, files) => {
    for (const [file, content] of Object.entries(files)) put(repo, file, content);
    gitIn(repo, 'add', '-A');
    gitIn(repo, 'commit', '-q', '--allow-empty', '-m', tag);
    gitIn(repo, 'tag', tag);
  };
  // A commit that does not change the plan contract, an agent that names no reviewer skill, and an agent that also
  // names the reviewer skill of another plugin root. Each commit is on HEAD, which has the kit layout.
  const agentFile = `${KIT_ROOT}/agents/plan-reviewer.md`;
  const noSkill = '---\nname: plan-reviewer\ndescription: Reviews plans.\n---\n\n# Plan Reviewer\n';
  const otherRoot = `${variantAgentText('other')}Also load \`/opt/x/skills/plan-reviewer/SKILL.md\`.\n`;
  tagCommit('same-contract', {});
  tagCommit('no-skill', { [agentFile]: noSkill });
  tagCommit('other-root', { [agentFile]: otherRoot });
  const ownSkill = (ref) =>
    `variant a: ${agentFile} at ${ref} must name its reviewer skill as skill://plan-reviewer/SKILL.md, or at a ref before the native omp packages as ${LEGACY_PLUGIN_ROOT}/skills/[<folder>/]plan-reviewer/SKILL.md, and name no other plugin root`;
  const refusals = [
    // A variant copy in the folder of the baseline copy would replace the baseline plugin of the baseline agents.
    [
      { 'baseline-dir': variantRoot(root, 'a') },
      `the baseline copy and the copy of variant a both go to ${variantRoot(root, 'a')}; give another --baseline-dir`,
    ],
    [{ variants: '' }, '--variants has an empty entry: '],
    [{ variants: '16=v16,' }, '--variants has an empty entry: 16=v16,'],
    [{ variants: '16=v16,a' }, '--variants: a is not <name>=<git ref>'],
    [{ variants: '16=v16,=cand-a' }, '--variants: =cand-a is not <name>=<git ref>'],
    [{ variants: '16=v16,a=' }, '--variants: a= is not <name>=<git ref>'],
    [{ 'full-only': '' }, '--full-only has an empty entry: '],
    [{ variants: undefined }, '--full-only names variants of --variants; give --variants too'],
    [
      { variants: undefined, 'full-only': undefined, 'contract-overlay': 'a' },
      '--contract-overlay names variants of --variants; give --variants too',
    ],
    [{ 'contract-overlay': '16,b' }, '--contract-overlay names b, which is not a variant'],
    [
      { variants: '16=v16,a=same-contract', 'contract-overlay': 'a' },
      `variant a: same-contract does not change ${CONTRACT_FORM} against its first parent; leave it out of --contract-overlay`,
    ],
    [{ variants: '16=v16,a=no-skill' }, ownSkill('no-skill')],
    [{ variants: '16=v16,a=other-root' }, ownSkill('other-root')],
  ];
  const options = variantOptions(fixture);
  const state = treeState(root);
  for (const [change, message] of refusals) {
    assert.throws(() => agentsOnBun({ ...options, ...change }, repo), { message });
    // agents refuses before it extracts a plugin copy or writes a file of the project.
    assert.deepEqual(treeState(root), state);
  }
  // The command line takes --contract-overlay.
  const args = ['--baseline-ref', 'HEAD', '--model', MODEL, '--efforts', 'low', '--tiers', 'default'];
  const cliArgs = [...args, '--baseline-dir', path.join(root, 'cli-baseline-plugin'), '--project', project];
  const overlayOnly = [PREPARE_SCRIPT, 'agents', ...cliArgs, '--contract-overlay', 'a'];
  const cli = spawnSync(BUN_RUNTIME, overlayOnly, { encoding: 'utf8', env: fakeOmp().env });
  assert.equal(cli.status, 1, cli.stderr);
  assert.match(cli.stderr, /--contract-overlay names variants of --variants; give --variants too/);
  assert.deepEqual(treeState(root), state);
});
test('agents --variants takes an --out folder whose parent has a space and keeps the same-root check', () => {
  const fixture = variantRepo();
  const { root, repo, agentDir } = fixture;
  const skill = 'skills/plan-reviewer/SKILL.md';
  // Without --baseline-dir, the plugin copies go to the parent of --out, whose path has a space.
  const parent = path.join(root, 'review runs');
  const options = { ...variantOptions(fixture), 'baseline-dir': undefined, out: path.join(parent, 'heldout') };
  agentsOnBun(options, repo);
  assert.ok(fs.existsSync(path.join(parent, 'baseline-plugin', skill)));
  for (const name of Object.keys(VARIANT_REFS)) {
    const pluginRoot = path.join(parent, `variant-${name}-plugin`);
    assert.ok(fs.existsSync(path.join(pluginRoot, skill)));
    for (const config of ['low', 'xhigh']) {
      const text = readText(path.join(agentDir, `review-bench-variant-${name}-plan-${config}.md`));
      assert.ok(text.includes(`\`${pluginRoot}/${skill}\``));
      // The read scope takes the plugin root with its space from the path in backticks.
      assert.deepEqual(score.reviewerPluginRoots(text), [pluginRoot]);
    }
  }
  // A path in quotes can hold a space too. A bare path ends at the first space, so it names no root here.
  const text = [`Load "/opt/q r/${skill}" and '/opt/s/${skill}',`, `then /opt/t/${skill}, not /opt/u v/${skill}.`];
  assert.deepEqual(score.reviewerPluginRoots(text.join('\n')), ['/opt/q r', '/opt/s', '/opt/t']);
  // An agent that also names the reviewer skill of another plugin root, whose path has a space, stays refused.
  const agentFile = `${KIT_ROOT}/agents/plan-reviewer.md`;
  put(repo, agentFile, `${variantAgentText('other')}Also load \`/opt/review x/${skill}\`.\n`);
  gitIn(repo, 'add', '-A');
  gitIn(repo, 'commit', '-q', '-m', 'other root');
  gitIn(repo, 'tag', 'other-space');
  const message = `variant a: ${agentFile} at other-space must name its reviewer skill as skill://plan-reviewer/SKILL.md, or at a ref before the native omp packages as ${LEGACY_PLUGIN_ROOT}/skills/[<folder>/]plan-reviewer/SKILL.md, and name no other plugin root`;
  assert.throws(() => agentsOnBun({ ...options, variants: '16=v16,a=other-space' }, repo), { message });
});
// B1 and B0 describe the lens or review the whole diff again, as the released reviewer of plan #98 needed. B3 and Bd
// give the baseline reviewer the prompt of the candidate arms, so a comparison measures only the reviewer files (#113).
test('the B3 and Bd arms give the baseline reviewer the prompts of the C3 and Cd arms', () => {
  assert.ok(prepare.ARMS.code.B3, 'code cases have no B3 arm');
  assert.ok(prepare.ARMS['code-delta'].Bd, 'code-delta cases have no Bd arm');
  const focus = Object.fromEntries(prepare.LENSES.map((lens) => [lens, `/ws/code-7/focus-${lens}.diff`]));
  const panelCase = { id: 'code-7', kind: 'code', issue: 7, round: 1 };
  const panelPaths = {
    snapshot: '/ws/code-7/snapshot',
    plan: '/ws/code-7/plan.md',
    fullDiff: '/ws/code-7/full.diff',
    focus,
  };
  const prompt = (caseData, arm, reviewer, paths) => {
    const [agent, , ...body] = prepare.buildPromptFile({ caseData, arm, config: 'low', reviewer, paths }).split('\n');
    return { agent, body: body.join('\n') };
  };
  for (const lens of prepare.LENSES) {
    const [baseline, candidate] = ['B3', 'C3'].map((arm) => prompt(panelCase, arm, lens, panelPaths));
    assert.equal(baseline.agent, 'agent: review-bench-baseline-code-low');
    assert.equal(candidate.agent, 'agent: review-bench-candidate-code-low');
    assert.equal(baseline.body, candidate.body, `the B3 ${lens} prompt differs from the C3 prompt`);
  }
  const deltaCase = { id: 'code-8', kind: 'code-delta', issue: 8, round: 2 };
  const deltaPaths = {
    snapshot: '/ws/code-8/snapshot',
    plan: '/ws/code-8/plan.md',
    deltaDiff: '/ws/code-8/delta.diff',
    previousReview: '/ws/code-8/previous-review.md',
  };
  const [baseline, candidate] = ['Bd', 'Cd'].map((arm) => prompt(deltaCase, arm, 'delta', deltaPaths));
  assert.equal(baseline.agent, 'agent: review-bench-baseline-code-low');
  assert.equal(baseline.body, candidate.body);
  assert.ok(baseline.body.split('\n').includes('Round mode: delta.'));
});
test('case gives each run of an overlay variant a contract copy, its record, and a prompt that names the copy', () => {
  const { repo, ws, options } = overlayFixture();
  prepare.prepareCase(options('plan-3', 'P1,V16,Va', { runs: '2' }), repo);
  prepare.prepareCase(options('plan-4', 'Pd,Va'), repo);
  const runDir = (caseId, arm, run = 1) => path.join(ws, caseId, `${arm}-low`, `run-${run}`);
  const prompt = (caseId, arm, run = 1) => promptFileParts(path.join(runDir(caseId, arm, run), 'prompts', 'plan.txt'));
  // A run without a contract overlay gets no copy, and its prompt sends the reviewer to the snapshot root.
  const p1 = prompt('plan-3', 'P1').body;
  assert.ok(p1.split('\n').includes(SNAPSHOT_CONTRACT_RULE));
  for (const arm of ['P1', 'V16']) {
    for (const run of [1, 2]) {
      assert.equal(fs.existsSync(path.join(runDir('plan-3', arm, run), 'plan-contract.md')), false);
      assert.deepEqual(readJson(path.join(runDir('plan-3', arm, run), 'meta.json')), {
        config: CONFIGS.low,
        managerConfig: MANAGER_SETTING,
      });
    }
  }
  assert.equal(prompt('plan-3', 'V16').body, p1);
  // The contract change of cand-a applies to the contract of v16. Each run gets a copy of its own, and its prompt names
  // that copy as the plan contract.
  for (const run of [1, 2]) {
    const copy = path.join(runDir('plan-3', 'Va', run), 'plan-contract.md');
    assert.equal(readText(copy), '# Plan contract A\n');
    const meta = readJson(path.join(runDir('plan-3', 'Va', run), 'meta.json'));
    assert.deepEqual(meta, { config: CONFIGS.low, managerConfig: MANAGER_SETTING, contractOverlay: 'applied' });
    assert.deepEqual(prompt('plan-3', 'Va', run), {
      agent: 'agent: review-bench-variant-a-plan-low',
      body: p1.replace(SNAPSHOT_CONTRACT_RULE, copyContractRule(copy)),
    });
  }
  // git apply changed the copy, not the snapshot.
  assert.equal(readText(path.join(ws, 'plan-3', 'snapshot', CONTRACT)), '# Plan contract 0.16.0\n');
  // The contract of the last commit does not hold the text that the change changes. The copy then holds the contract
  // of the snapshot, and the delta-mode prompt of Pd names the copy.
  const deltaCopy = path.join(runDir('plan-4', 'Va'), 'plan-contract.md');
  assert.equal(readText(deltaCopy), '# Plan contract live\n');
  assert.equal(readText(path.join(ws, 'plan-4', 'snapshot', KIT_CONTRACT)), '# Plan contract live\n');
  const deltaMeta = readJson(path.join(runDir('plan-4', 'Va'), 'meta.json'));
  assert.deepEqual(deltaMeta, {
    config: CONFIGS.low,
    managerConfig: MANAGER_SETTING,
    contractOverlay: 'not applicable',
  });
  const pd = prompt('plan-4', 'Pd').body;
  assert.ok(pd.split('\n').includes('Round mode: delta.'));
  assert.equal(prompt('plan-4', 'Va').body, pd.replace(SNAPSHOT_CONTRACT_RULE, copyContractRule(deltaCopy)));
  // A snapshot without the plan contract gives the overlay no contract to change, so case stops and writes no folder.
  const message = noContract(path.join(ws, 'plan-5', 'snapshot'));
  assert.throws(() => prepare.prepareCase(options('plan-5', 'P1,Va'), repo), { message });
  assert.equal(fs.existsSync(path.join(ws, 'plan-5')), false);
});
// A candidate code reviewer can change the plan contract too, which the reviewer reads. `--candidate-contract-overlay`
// records the change from the baseline ref to the working tree, and each run of a candidate code arm gets a copy of
// the snapshot's contract with that change; the baseline arms keep the snapshot's contract (#113).
test('agents --candidate-contract-overlay gives the runs of candidate code arms the working-tree contract change', () => {
  const fixture = variantRepo();
  const { root, repo, project, agentDir, shas } = fixture;
  // The working tree changes the contract against the baseline ref v16. The working tree has the kit layout and v16
  // the legacy layout, so the recorded change compares the text of the two contracts.
  put(repo, KIT_CONTRACT, '# Plan contract working tree\n');
  const agentOptions = { ...variantOptions(fixture), 'candidate-contract-overlay': true };
  agentsOnBun(agentOptions, repo);
  const change = readJson(path.join(agentDir, 'review-bench-configs.json')).candidateContractDiff;
  assert.deepEqual(diffChanges(change), ['-# Plan contract 0.16.0', '+# Plan contract working tree']);
  const ws = path.join(root, 'ws');
  const cases = path.join(root, 'cases');
  const codeCase = { id: 'code-7', kind: 'code', split: 'dev', issue: 7, round: 1, plan: 'code-7-plan.md' };
  put(cases, 'dev/code-7.json', { ...codeCase, base: shas.bare, head: shas.v16, known: [] });
  put(cases, 'dev/code-7-plan.md', '# Plan 7\n\nStep 1.\n');
  const caseOptions = { case: path.join(cases, 'dev', 'code-7.json'), runs: '1', out: ws, configs: 'low', project };
  prepare.prepareCase({ ...caseOptions, arms: 'B3,C3' }, repo);
  const runDir = (arm) => path.join(ws, 'code-7', `${arm}-low`, 'run-1');
  const copy = path.join(runDir('C3'), 'plan-contract.md');
  assert.equal(readText(copy), '# Plan contract working tree\n');
  assert.deepEqual(readJson(path.join(runDir('C3'), 'meta.json')), {
    config: CONFIGS.low,
    managerConfig: MANAGER_SETTING,
    contractOverlay: 'applied',
  });
  assert.equal(fs.existsSync(path.join(runDir('B3'), 'plan-contract.md')), false);
  for (const lens of prepare.LENSES) {
    const [baseline, candidate] = ['B3', 'C3'].map(
      (arm) => promptFileParts(path.join(runDir(arm), 'prompts', `${lens}.txt`)).body,
    );
    assert.ok(baseline.split('\n').includes(SNAPSHOT_CONTRACT_RULE));
    assert.equal(candidate, baseline.replace(SNAPSHOT_CONTRACT_RULE, copyContractRule(copy)));
  }
  // The later rounds of a loop would review without the contract copy, so case --loop refuses a candidate arm and
  // writes no folder; a baseline arm still builds its loop.
  const loopOptions = { ...caseOptions, out: path.join(root, 'loop-ws'), loop: true };
  assert.throws(() => prepare.prepareCase({ ...loopOptions, arms: 'B3,C3' }, repo), {
    message:
      'case --loop does not take a candidate contract overlay (C3): the later rounds of a loop would review without the contract copy; build single-round runs, or run agents without --candidate-contract-overlay',
  });
  assert.equal(fs.existsSync(path.join(root, 'loop-ws', 'code-7')), false);
  prepare.prepareCase({ ...loopOptions, arms: 'B3' }, repo);
  assert.ok(fs.existsSync(path.join(root, 'loop-ws', 'code-7', 'B3-low', 'run-1', 'round-1', 'meta.json')));
  // The command line takes the flag: without --baseline-ref, agents names that option, not an unknown flag.
  const cli = spawnSync(BUN_RUNTIME, [PREPARE_SCRIPT, 'agents', '--candidate-contract-overlay'], {
    encoding: 'utf8',
  });
  assert.notEqual(cli.status, 0);
  assert.match(cli.stderr, /agents needs --baseline-ref/);
  // Without a working-tree change, the option has nothing to record, so agents stops before it writes.
  put(repo, KIT_CONTRACT, '# Plan contract 0.16.0\n');
  assert.throws(() => agentsOnBun(agentOptions, repo), {
    message: `agents --candidate-contract-overlay: the working tree does not change ${CONTRACT_FORM} against v16`,
  });
});
test('case records not applicable only without the removed text and else stops with the git message', () => {
  const fixture = variantRepo();
  const { root, repo, project } = fixture;
  const contract = (...rules) => `# Plan contract\n\n${rules.join('\n\n')}\n`;
  const commitContract = (tag, text) => {
    put(repo, KIT_CONTRACT, text);
    gitIn(repo, 'add', '-A');
    gitIn(repo, 'commit', '-q', '-m', tag);
    gitIn(repo, 'tag', tag);
    return gitIn(repo, 'rev-parse', 'HEAD').trim();
  };
  // The contract change of cand-b removes the line `Rule 2.` and a blank line. The contract of `rewritten` does not
  // hold that line, and the contract of `moved` holds it with other context lines. The change applies to neither.
  commitContract('rules', contract('Rule 1.', 'Rule 2.', 'Rule 3.'));
  commitContract('cand-b', contract('Rule 1.', 'Rule 3.'));
  const rewritten = contract('Rule 1.', 'Rule 2 changed.', 'Rule 3.');
  const shas = {
    rewritten: commitContract('rewritten', rewritten),
    moved: commitContract('moved', contract('Rule 2.', 'Rule 1.', 'Rule 3.')),
  };
  const change = gitIn(repo, 'diff', '--no-color', 'cand-b^1', 'cand-b', '--', KIT_CONTRACT);
  const removed = change.split('\n').filter((line) => line.startsWith('-') && !line.startsWith('---'));
  assert.deepEqual(removed.sort(), ['-', '-Rule 2.']);
  const agentOptions = { ...variantOptions(fixture), variants: '16=v16,b=cand-b', 'contract-overlay': 'b' };
  agentsOnBun(agentOptions, repo);
  const ws = path.join(root, 'ws');
  const cases = path.join(root, 'cases');
  for (const [id, ref] of [
    ['plan-6', shas.rewritten],
    ['plan-7', shas.moved],
  ]) {
    const caseData = { id, kind: 'plan', split: 'dev', issue: 6, round: 1, plan: `${id}-plan.md`, repo_ref: ref };
    put(cases, `dev/${id}.json`, { ...caseData, known: [] });
    put(cases, `dev/${id}-plan.md`, '# Plan 6\n');
  }
  const options = (id, arms, more = {}) => ({
    case: path.join(cases, 'dev', `${id}.json`),
    arms,
    runs: '1',
    out: ws,
    configs: 'low',
    project,
    ...more,
  });
  const runDir = (id) => path.join(ws, id, 'Vb-low', 'run-1');

  // The text that the change removes is absent, so the run records `not applicable` and its copy holds the contract of
  // the snapshot. The blank line that the change removes does not count as text.
  prepare.prepareCase(options('plan-6', 'P1,Vb'), repo);
  assert.equal(readText(path.join(runDir('plan-6'), 'plan-contract.md')), rewritten);
  const meta = readJson(path.join(runDir('plan-6'), 'meta.json'));
  assert.deepEqual(meta, { config: CONFIGS.low, managerConfig: MANAGER_SETTING, contractOverlay: 'not applicable' });

  // The contract holds `Rule 2.`, so the failure of git apply is not an absent text: case stops with the message of
  // git, which names the copy, and the run folder, and writes nothing for the case.
  const snapshotContract = path.join(ws, 'plan-7', 'snapshot', KIT_CONTRACT);
  const prefix = `the contract change does not apply to ${snapshotContract} for the run ${runDir('plan-7')}: `;
  const stops = (error) => {
    assert.ok(error.message.startsWith(prefix), error.message);
    assert.match(error.message.slice(prefix.length), /plan-contract\.md/);
    return true;
  };
  assert.throws(() => prepare.prepareCase(options('plan-7', 'P1,Vb'), repo), stops);
  assert.equal(fs.existsSync(path.join(ws, 'plan-7')), false);
  // With --extend, case keeps the case folder and the arm folders that exist, and removes the arm folder of Vb.
  prepare.prepareCase(options('plan-7', 'P1'), repo);
  const state = treeState(ws);
  assert.throws(() => prepare.prepareCase(options('plan-7', 'Vb', { extend: true }), repo), stops);
  assert.deepEqual(treeState(ws), state);
});
// The plan contract in the layout before the native omp packages: in the category folder `productivity/`.
const LEGACY_CONTRACT = 'plugins/plan-lifecycle/skills/productivity/plan-manager/references/plan-contract.md';
// A plan contract of the rules 1 to 8, one paragraph per rule, with the rule texts of `changed` (by rule number) and
// the rules `added` after rule 8. Rules 2 and 7 are far enough apart that the diff of each has its own context lines.
const rulesContract = (changed = {}, added = []) => {
  const rules = Array.from({ length: 8 }, (_, index) => changed[index + 1] ?? `Rule ${index + 1}.`);
  return `# Plan contract\n\n${[...rules, ...added].join('\n\n')}\n`;
};
// The rule changes of old-cand and of moved (see historicalRepo).
const OLD_CAND_RULES = { 2: 'Rule 2 of old-cand.' };
const MOVED_RULES = { ...OLD_CAND_RULES, 7: 'Rule 7 moved.' };
// The lines that the diff text `diff` removes and adds, without the file headers.
const diffChanges = (diff) =>
  diff
    .slice(diff.indexOf('\n@@'))
    .split('\n')
    .filter((line) => /^[-+]/.test(line));
// A git repository that moves plan-lifecycle from the layout before the native omp packages to the flat layout, and
// then to the kit layout. Its commits, in order: `bare` (README.md only); `old`, the categorized layout with an agent
// that names its skill with the plugin root variable of Claude Code; `old-cand`, which changes rule 2 in the
// categorized contract; `moved`, which moves the skills to the flat layout, changes rule 7, and names the skill as a
// `skill://` URI; `both`, which also holds the categorized contract; `live`, which removes it again; `dropped`, which
// removes the contract; `restored`, which adds it back; and `kit`, which moves the plugin to KIT_ROOT. The working tree
// adds rule 9.
function historicalRepo() {
  isolateGit();
  const root = neutralScratch();
  const repo = path.join(root, 'repo');
  const project = path.join(root, 'project');
  fs.mkdirSync(repo);
  fs.mkdirSync(project);
  gitIn(repo, 'init', '-q', '-b', 'main');
  const plugin = 'plugins/plan-lifecycle';
  const commit = (tag, files, removed = []) => {
    for (const file of removed) fs.rmSync(path.join(repo, file), { recursive: true });
    for (const [file, content] of Object.entries(files)) put(repo, file, content);
    gitIn(repo, 'add', '-A');
    gitIn(repo, 'commit', '-q', '-m', tag);
    gitIn(repo, 'tag', tag);
    return gitIn(repo, 'rev-parse', 'HEAD').trim();
  };
  const codeAgent = `---\nname: code-reviewer\ndescription: Reviews.\n---\n\n# Code Reviewer\n`;
  const legacyAgent = legacyVariantAgentText('old').replace(
    '/skills/plan-reviewer/',
    '/skills/productivity/plan-reviewer/',
  );
  const shas = {
    bare: commit('bare', { 'README.md': '# Demo\n' }),
    old: commit('old', {
      [`${plugin}/agents/code-reviewer.md`]: codeAgent,
      [`${plugin}/agents/plan-reviewer.md`]: legacyAgent,
      [`${plugin}/skills/productivity/plan-reviewer/SKILL.md`]: '# Plan reviewer old\n',
      [LEGACY_CONTRACT]: rulesContract(),
    }),
    'old-cand': commit('old-cand', { [LEGACY_CONTRACT]: rulesContract(OLD_CAND_RULES) }),
    moved: commit(
      'moved',
      {
        [`${plugin}/agents/plan-reviewer.md`]: variantAgentText('moved'),
        [`${plugin}/skills/plan-reviewer/SKILL.md`]: '# Plan reviewer moved\n',
        [CONTRACT]: rulesContract(MOVED_RULES),
      },
      [`${plugin}/skills/productivity`],
    ),
  };
  shas.both = commit('both', { [LEGACY_CONTRACT]: rulesContract() });
  shas.live = commit('live', {}, [LEGACY_CONTRACT]);
  shas.dropped = commit('dropped', {}, [CONTRACT]);
  shas.restored = commit('restored', { [CONTRACT]: rulesContract(MOVED_RULES) });
  fs.mkdirSync(path.join(repo, path.dirname(KIT_ROOT)), { recursive: true });
  gitIn(repo, 'mv', plugin, KIT_ROOT);
  shas.kit = commit('kit', {});
  put(repo, KIT_CONTRACT, rulesContract(MOVED_RULES, ['Rule 9.']));
  return { root, repo, project, agentDir: path.join(project, '.omp', 'agents'), shas };
}
// The options of `agents` for the historical repository, at the effort low with the default tier.
const historicalOptions = ({ root, project }, more = {}) => ({
  'baseline-ref': 'old',
  model: MODEL,
  efforts: 'low',
  tiers: 'default',
  'baseline-dir': path.join(root, 'baseline-plugin'),
  project,
  ...more,
});
// A ref before the native omp packages holds the plan contract in a category folder. The contract overlay finds the
// contract in each tree, records only the change of the text across the move, and applies it to a snapshot in either
// layout.
test('the contract overlay finds the plan contract in the categorized and the flat layout', () => {
  const fixture = historicalRepo();
  const { root, repo, project, agentDir, shas } = fixture;
  agentsOnBun(historicalOptions(fixture, { variants: 'o=old-cand,m=moved', 'contract-overlay': 'o,m' }), repo);
  const variants = readJson(path.join(agentDir, 'review-bench-configs.json')).variants;
  // old-cand changes the categorized contract in place. moved moves the contract and changes rule 7, and its recorded
  // change holds only that rule, not the whole flat file.
  assert.deepEqual(diffChanges(variants[0].contractDiff), ['-Rule 2.', '+Rule 2 of old-cand.']);
  assert.deepEqual(diffChanges(variants[1].contractDiff), ['-Rule 7.', '+Rule 7 moved.']);
  // Both agent forms name the skill of the variant copy: the plugin root variable at old-cand, a skill:// URI at moved.
  for (const name of ['o', 'm']) {
    const text = readText(path.join(agentDir, `review-bench-variant-${name}-plan-low.md`));
    assert.deepEqual(score.reviewerPluginRoots(text), [variantRoot(root, name)]);
  }

  const ws = path.join(root, 'ws');
  const cases = path.join(root, 'cases');
  const planCase = (id, ref) => ({
    id,
    kind: 'plan',
    split: 'dev',
    issue: 3,
    round: 1,
    plan: `${id}-plan.md`,
    repo_ref: ref,
    known: [],
  });
  const codeCase = { id: 'code-9', kind: 'code', split: 'dev', issue: 9, round: 1, plan: 'code-9-plan.md' };
  for (const caseData of [
    planCase('plan-8', shas.old),
    planCase('plan-9', shas.live),
    planCase('plan-10', shas.both),
    { ...codeCase, base: shas.bare, head: shas.old, known: [] },
  ]) {
    put(cases, `dev/${caseData.id}.json`, caseData);
    put(cases, `dev/${caseData.plan}`, `# Plan ${caseData.issue}\n\nStep 1.\n`);
  }
  const options = (id, arms) => ({
    case: path.join(cases, 'dev', `${id}.json`),
    arms,
    runs: '1',
    out: ws,
    configs: 'low',
    project,
  });
  const run = (id, arm) => path.join(ws, id, `${arm}-low`, 'run-1');
  const copyOf = (id, arm) => readText(path.join(run(id, arm), 'plan-contract.md'));
  const overlay = (id, arm) => readJson(path.join(run(id, arm), 'meta.json')).contractOverlay;

  // The snapshot of old holds the categorized contract, and the change of each variant applies to it. The snapshot of
  // live holds the flat contract, which no longer holds rule 2 of old.
  prepare.prepareCase(options('plan-8', 'P1,Vo,Vm'), repo);
  assert.equal(copyOf('plan-8', 'Vo'), rulesContract(OLD_CAND_RULES));
  assert.equal(copyOf('plan-8', 'Vm'), rulesContract({ 7: 'Rule 7 moved.' }));
  assert.deepEqual([overlay('plan-8', 'Vo'), overlay('plan-8', 'Vm')], ['applied', 'applied']);
  prepare.prepareCase(options('plan-9', 'Vo'), repo);
  assert.equal(overlay('plan-9', 'Vo'), 'not applicable');
  assert.equal(copyOf('plan-9', 'Vo'), rulesContract(MOVED_RULES));

  // A snapshot that holds the contract in both folders has no one contract to change, so case stops and writes no
  // folder.
  const snapshot = path.join(ws, 'plan-10', 'snapshot');
  assert.throws(() => prepare.prepareCase(options('plan-10', 'Vm'), repo), {
    message: `${snapshot} holds more than one plan contract: ${CONTRACT}, ${LEGACY_CONTRACT}`,
  });
  assert.equal(fs.existsSync(path.join(ws, 'plan-10')), false);

  // The working tree holds the flat contract of the kit layout and old the categorized one. The candidate change holds
  // only the changed rules, and it applies to the categorized contract of the snapshot of old.
  agentsOnBun(historicalOptions(fixture, { 'candidate-contract-overlay': true }), repo);
  const candidateDiff = readJson(path.join(agentDir, 'review-bench-configs.json')).candidateContractDiff;
  assert.deepEqual(diffChanges(candidateDiff), [
    '-Rule 2.',
    '+Rule 2 of old-cand.',
    '-Rule 7.',
    '+Rule 7 moved.',
    '+',
    '+Rule 9.',
  ]);
  prepare.prepareCase(options('code-9', 'C3'), repo);
  assert.equal(readText(path.join(run('code-9', 'C3'), 'plan-contract.md')), readText(path.join(repo, KIT_CONTRACT)));
  assert.equal(overlay('code-9', 'C3'), 'applied');
});
test('the contract overlay stops when a tree it compares has no plan contract', () => {
  const fixture = historicalRepo();
  const { root, repo } = fixture;
  const state = treeState(root);
  const refusals = [
    [
      { variants: 'o=old', 'contract-overlay': 'o' },
      `variant o: the first parent of old has no ${CONTRACT_FORM}; leave it out of --contract-overlay`,
    ],
    [
      { variants: 'd=dropped', 'contract-overlay': 'd' },
      `variant d: dropped has no ${CONTRACT_FORM}; leave it out of --contract-overlay`,
    ],
    [
      { 'baseline-ref': 'bare', 'candidate-contract-overlay': true },
      `agents --candidate-contract-overlay: bare has no ${CONTRACT_FORM}`,
    ],
  ];
  for (const [more, message] of refusals) {
    assert.throws(() => agentsOnBun(historicalOptions(fixture, more), repo), { message });
    assert.deepEqual(treeState(root), state);
  }
  // A working tree without the contract gives the candidate overlay nothing to compare.
  fs.rmSync(path.join(repo, KIT_CONTRACT));
  const withoutContract = treeState(root);
  assert.throws(() => agentsOnBun(historicalOptions(fixture, { 'candidate-contract-overlay': true }), repo), {
    message: `agents --candidate-contract-overlay: the working tree has no ${CONTRACT_FORM}`,
  });
  assert.deepEqual(treeState(root), withoutContract);
});
test('readScope allows the contract copy of its own run, also when the case changes the plan contract', () => {
  const caseDir = `${SCOPE_WS}/plan-3`;
  const runDir = `${caseDir}/Va-low/run-1`;
  const pluginRoot = '/work/variant-a-plugin';
  const scope = { runDir, cwd: LIVE, pluginRoots: [pluginRoot], changedFiles: [CONTRACT] };
  const copy = `${runDir}/plan-contract.md`;
  assert.deepEqual(score.readScope(reads(copy, `${copy}:1-40`), scope), { outside: [] });
  const outside = [
    // The copies of another run and of another arm, and paths that hold no copy.
    `${caseDir}/Va-low/run-2/plan-contract.md`,
    `${caseDir}/Vb-low/run-1/plan-contract.md`,
    `${caseDir}/Va-low/plan-contract.md`,
    `${caseDir}/plan-contract.md`,
    // The case changes the plan contract, so the contract of the plugin root shows a later version.
    `${pluginRoot}/skills/plan-manager/references/plan-contract.md`,
  ];
  assert.deepEqual(score.readScope(reads(...outside), scope), { outside });
});
test('case --extend adds arm folders to a case folder and keeps its snapshot and its other arm folders', () => {
  const { root, repo, project, ws, cases, caseFiles, options } = overlayFixture();
  const extend = (id, arms, more = {}) => prepare.prepareCase(options(id, arms, { extend: true, ...more }), repo);
  const caseDir = path.join(ws, 'plan-3');
  prepare.prepareCase(options('plan-3', 'P1'), repo);
  const before = treeState(caseDir);
  extend('plan-3', 'V16,Va');
  const after = treeState(caseDir);
  // Every file and folder stays as it was, and the new ones are the files of the two arm folders.
  for (const [key, text] of Object.entries(before)) assert.equal(after[key], text, key);
  const runFiles = ['', 'run-1/', 'run-1/blocks/', 'run-1/meta.json', 'run-1/prompts/', 'run-1/prompts/plan.txt'];
  const expected = [
    ...runFiles.map((file) => `V16-low/${file}`),
    ...[...runFiles, 'run-1/plan-contract.md'].map((file) => `Va-low/${file}`),
  ];
  const added = Object.keys(after).filter((key) => !Object.hasOwn(before, key));
  assert.deepEqual(added.sort(), expected.sort());
  // The new arms get the prompts of a new case folder: V16 the prompt of P1, and Va that prompt with the rule of its
  // contract copy.
  const prompt = (arm) => promptFileParts(path.join(caseDir, `${arm}-low`, 'run-1', 'prompts', 'plan.txt'));
  const p1 = prompt('P1').body;
  assert.deepEqual(prompt('V16'), { agent: 'agent: review-bench-variant-16-plan-low', body: p1 });
  const copy = path.join(caseDir, 'Va-low', 'run-1', 'plan-contract.md');
  assert.equal(readText(copy), '# Plan contract A\n');
  const meta = readJson(path.join(caseDir, 'Va-low', 'run-1', 'meta.json'));
  assert.deepEqual(meta, { config: CONFIGS.low, managerConfig: MANAGER_SETTING, contractOverlay: 'applied' });
  assert.equal(prompt('Va').body, p1.replace(SNAPSHOT_CONTRACT_RULE, copyContractRule(copy)));

  // Each refusal leaves the workspace as it was.
  const refused = (call, message) => {
    const state = treeState(ws);
    assert.throws(call, { message });
    assert.deepEqual(treeState(ws), state);
  };
  refused(() => extend('plan-3', 'P0,P1'), `${path.join(caseDir, 'P1-low')} exists; leave its arm out of --arms`);
  const exists = `${caseDir} exists; remove it, choose another --out, or add arms with --extend`;
  refused(() => prepare.prepareCase(options('plan-3', 'P0'), repo), exists);
  const noFolder = `${path.join(ws, 'code-7')} holds no case folder to extend; run case without --extend`;
  refused(() => extend('code-7', 'C1', { loop: true }), noFolder);
  // The case folder of another version of the case file stays as it is.
  const changed = path.join(cases, 'changed', 'plan-3.json');
  put(cases, 'changed/plan-3.json', { ...caseFiles[0], round: 2 });
  put(cases, 'changed/plan-3-plan.md', '# Plan 3\n');
  const other = `${path.join(caseDir, 'case.json')} differs from ${changed}; build the changed case in another --out`;
  refused(() => prepare.prepareCase({ ...options('plan-3', 'P0'), case: changed, extend: true }, repo), other);
  // A failed --extend keeps the case folder. The snapshot of plan-5 has no plan contract.
  prepare.prepareCase(options('plan-5', 'P1'), repo);
  refused(() => extend('plan-5', 'V16,Va'), noContract(path.join(ws, 'plan-5', 'snapshot')));
  // A failed --extend removes the arm folders that it wrote: a prompt path with the word judge stops case after it
  // wrote the contract copy of Va at the configuration low.
  const configsFile = '.omp/agents/review-bench-configs.json';
  const list = readJson(path.join(project, configsFile));
  put(project, configsFile, { ...list, configs: [...list.configs, { ...CONFIGS.low, name: 'judge' }] });
  prepare.prepareCase(options('plan-4', 'Pd'), repo);
  const judged = 'the Va plan prompt of case plan-4 contains "judge"; choose an --out path without it';
  refused(() => extend('plan-4', 'Va', { configs: 'low,judge' }), judged);

  // With --loop, the new arm gets round 1 of its own policy on the diff of the case.
  prepare.prepareCase(options('code-7', 'C3', { loop: true }), repo);
  extend('code-7', 'C1', { loop: true });
  const roundMeta = (arm) => readJson(path.join(ws, 'code-7', `${arm}-low`, 'run-1', 'round-1', 'meta.json'));
  const { fullLines } = roundMeta('C3');
  assert.ok(fullLines > 0);
  assert.deepEqual(roundMeta('C1'), {
    config: CONFIGS.low,
    fixerConfig: FIXER_SETTING,
    managerConfig: MANAGER_SETTING,
    mode: 'full',
    fullLines,
  });
  assert.deepEqual(readJson(path.join(ws, 'code-7', 'C1-low', 'run-1', 'meta.json')), { policy: 'full-delta' });

  // The command line takes --extend.
  const cliOut = path.join(root, 'cli-ws');
  const cliArgs = [PREPARE_SCRIPT, 'case', '--case', path.join(cases, 'dev', 'plan-3.json'), '--arms', 'P0'];
  const cliRun = [...cliArgs, '--runs', '1', '--out', cliOut, '--configs', 'low', '--project', project, '--extend'];
  const cli = spawnSync(BUN_RUNTIME, cliRun, { encoding: 'utf8' });
  assert.equal(cli.status, 1, cli.stderr);
  assert.match(cli.stderr, new RegExp(escapeRegExp(`${path.join(cliOut, 'plan-3')} holds no case folder to extend`)));
  assert.equal(fs.existsSync(cliOut), false);
});
test('case refuses a show_benchmark that is not true or false and writes nothing', () => {
  const root = neutralScratch();
  const ws = path.join(root, 'ws');
  const cases = path.join(root, 'cases');
  put(cases, 'dev/plan-5-plan.md', '# Plan 5\n');
  const message = 'case plan-5: show_benchmark must be true or false';
  for (const value of ['true', 1, null]) {
    const caseData = { id: 'plan-5', kind: 'plan', split: 'dev', issue: 5, round: 1, plan: 'plan-5-plan.md' };
    put(cases, 'dev/plan-5.json', { ...caseData, repo_ref: 'HEAD', known: [], show_benchmark: value });
    const options = { case: path.join(cases, 'dev', 'plan-5.json'), arms: 'P1', runs: '1', out: ws };
    const state = treeState(root);
    assert.throws(() => prepare.prepareCase(options, root), { message });
    assert.deepEqual(treeState(root), state);
  }
  assert.equal(fs.existsSync(ws), false);
});
test('report refuses a missing, empty, or unknown --reference and a bad margin, and writes nothing', () => {
  const { ws, cases } = roundWorkspace([
    {
      config: CONFIGS.low,
      run: 1,
      rounds: [
        [FULL_BLOCK, 100, 1000, 'full'],
        [PASS_ROUND, 40, 400, 'delta'],
      ],
    },
    { config: CONFIGS['low-fast'], run: 1, rounds: [[PASS_ROUND.replace('round 2', 'round 1'), 50, 500, 'full']] },
  ]);
  findingsCommand(ws);
  main(['pairs', ws, '--cases', cases]);
  judgeAll(ws, (_, known) => (known === 'D1' ? 'match' : 'no'));
  const arms = ['C1-low-fast', 'C1-low'];
  reportCommand(ws, { arms, reference: 'C1-low' });
  const empty = 'report --reference needs the name of a column: an arm folder of --arms or a configuration';
  const refusals = [
    [{ arms, reference: '' }, empty],
    [
      { arms },
      /^report needs --reference <column> for a decision table of two or more columns \(C1-low-fast, C1-low\)/,
    ],
    [{ reference: 'C1-low' }, 'report --reference names C1-low, which is no column of the report: low, low-fast'],
    [{ configs: ['low'], reference: 'C1-low' }, 'report --reference names C1-low, which is not in --configs'],
    [{ arms: ['C1-low-fast'], reference: 'C1-low' }, 'report --reference names C1-low, which is not in --arms'],
    [{ arms, reference: 'C1-low', sequential: true }, 'report --sequential needs --reference and --margin'],
  ];
  const state = treeState(ws);
  for (const [options, message] of refusals) {
    assert.throws(() => reportCommand(ws, options), { message });
    assert.deepEqual(treeState(ws), state);
  }
  // The command line gives `--reference ''` as an empty reference, and takes a margin of 0 or more only.
  const cli = (...more) => main(['report', ws, '--arms', arms.join(','), ...more]);
  assert.throws(() => cli('--reference', ''), { message: empty });
  for (const margin of ['-1', 'four', ' ']) {
    assert.throws(() => cli('--reference', 'C1-low', '--margin', margin), {
      message: `--margin needs a number of at least 0, not ${margin}`,
    });
  }
  assert.deepEqual(treeState(ws), state);
});
// Each command and each base-instructions read of the test runs a Bun child that loads the docks-kit CLI source, so
// the test gets a longer timeout.
test('show_benchmark keeps the benchmark changes outside cases/ in the diffs of code cases and their loops', {
  timeout: 60_000,
}, () => {
  isolateGit();
  const root = neutralScratch();
  const repo = path.join(root, 'repo');
  const ws = path.join(root, 'ws');
  const cases = path.join(root, 'cases');
  const project = path.join(root, 'project');
  // As in the snapshot test above, a copy of the scripts runs in a repository with a benchmark skill folder. A code
  // case also runs the base-instructions reader, the docks-kit CLI source that copyScripts links.
  const skill = '.agents/skills/review-benchmark';
  gitIn(root, 'init', '-q', '-b', 'main', repo);
  const script = copyScripts(repo);
  put(repo, `${skill}/SKILL.md`, '# Review benchmark\n');
  put(repo, `${skill}/cases/dev/code-1.json`, { id: 'code-1', kind: 'code', split: 'dev', known: [] });
  put(repo, 'src/app.mjs', 'export const a = 1;\n');
  const commit = (message) => {
    gitIn(repo, 'add', '-A');
    gitIn(repo, 'commit', '-q', '-m', message);
    return gitIn(repo, 'rev-parse', 'HEAD').trim();
  };
  const base = commit('base');
  // The head changes a file of each lens in the skill folder, two files of its cases folder, and a file outside it.
  const changes = {
    [`${skill}/SKILL.md`]: '# Review benchmark\n\nRun the cases.\n',
    [`${skill}/scripts/extra.mjs`]: 'export const extra = 1;\n',
    [`${skill}/tests/extra.test.mjs`]: 'test();\n',
    [`${skill}/cases/dev/code-1.json`]: '{ "id": "code-1", "known": [{ "id": "D1" }] }\n',
    [`${skill}/cases/heldout/code-2.key.json`]: '{ "known": [] }\n',
    'src/app.mjs': 'export const a = 2;\n',
  };
  for (const [file, content] of Object.entries(changes)) put(repo, file, content);
  const head = commit('head');
  put(project, '.omp/agents/review-bench-configs.json', { configs: [CONFIGS.low], fixer: FIXER_SETTING });
  put(cases, 'dev/code-11-review.md', FULL_BLOCK);
  const codeCase = (id) => ({
    id,
    kind: 'code',
    split: 'dev',
    issue: 10,
    round: 1,
    plan: `${id}-plan.md`,
    base,
    head,
    known: [],
  });
  const deltaCase = {
    ...codeCase('code-11'),
    kind: 'code-delta',
    round: 2,
    delta_base: base,
    previous_review: 'code-11-review.md',
    show_benchmark: true,
  };
  for (const [caseData, arm] of [
    [{ ...codeCase('code-10'), show_benchmark: true }, 'C1'],
    [deltaCase, 'Cd'],
    [codeCase('code-12'), 'C1'],
  ]) {
    const caseFile = path.join(cases, 'dev', `${caseData.id}.json`);
    put(cases, `dev/${caseData.id}.json`, caseData);
    put(cases, `dev/${caseData.plan}`, '# Plan 10\n');
    const args = ['--case', caseFile, '--arms', arm, '--runs', '1', '--out', ws];
    const build = spawnSync(BUN_RUNTIME, [script, 'case', ...args, '--project', project], { encoding: 'utf8' });
    assert.equal(build.status, 0, build.stderr);
  }
  // The paths that a diff file changes, in sorted order.
  const diffFilePaths = (file) =>
    readText(file)
      .split('\n')
      .filter((line) => line.startsWith('+++ b/'))
      .map((line) => line.slice('+++ b/'.length))
      .sort();
  const diffPaths = (caseId, name) => diffFilePaths(path.join(ws, caseId, name));
  const skillFiles = [`${skill}/SKILL.md`, `${skill}/scripts/extra.mjs`, `${skill}/tests/extra.test.mjs`];
  // With show_benchmark, the full diff, each focus diff, and the delta diff hold the changes of the skill folder in
  // their scope, and no file of its cases folder.
  for (const caseId of ['code-10', 'code-11']) {
    assert.deepEqual(diffPaths(caseId, 'full.diff'), [...skillFiles, 'src/app.mjs']);
    assert.deepEqual(diffPaths(caseId, 'focus-correctness.diff'), [`${skill}/scripts/extra.mjs`, 'src/app.mjs']);
    assert.deepEqual(diffPaths(caseId, 'focus-spec-and-tests.diff'), [`${skill}/tests/extra.test.mjs`]);
    assert.deepEqual(diffPaths(caseId, 'focus-text-and-safety.diff'), [`${skill}/SKILL.md`]);
  }
  assert.deepEqual(diffPaths('code-11', 'delta.diff'), [...skillFiles, 'src/app.mjs']);
  // Without the field, the diffs leave out the whole skill folder. A focus diff without a path in its scope is a copy
  // of the full diff.
  for (const name of ['full', 'focus-correctness', 'focus-spec-and-tests', 'focus-text-and-safety']) {
    assert.deepEqual(diffPaths('code-12', `${name}.diff`), ['src/app.mjs']);
  }

  // A review loop on a case with show_benchmark: `case --loop`, one repair of the fixer, and round 2. The fixer
  // snapshot, the snapshot and the diffs of round 2, and the tree copy of round 2 for the judge show the skill folder
  // without its cases folder. The loop gets a workspace of its own.
  const loopWs = path.join(root, 'loop-ws');
  const loopCase = { ...codeCase('code-13'), show_benchmark: true };
  put(cases, 'dev/code-13.json', loopCase);
  put(cases, 'dev/code-13-plan.md', '# Plan 10\n');
  const runScript = (...args) => spawnSync(BUN_RUNTIME, [script, ...args], { encoding: 'utf8' });
  const caseArgs = ['--case', path.join(cases, 'dev', 'code-13.json'), '--arms', 'C3', '--runs', '1'];
  const loopBuild = runScript('case', ...caseArgs, '--out', loopWs, '--loop', '--project', project);
  assert.equal(loopBuild.status, 0, loopBuild.stderr);
  const run = path.join(loopWs, 'code-13', 'C3-low', 'run-1');
  // The diff of the case has 6 lines, so round 1 is a full round. Its one finding is a valid extra for the fixer.
  const extra = `${skill}/scripts/extra.mjs`;
  const finding = `- [MEDIUM] Bug - ${extra}:1 - extra is 1 - set it to 2.`;
  put(run, 'round-1/blocks/full.md', FULL_BLOCK.replace(/- \[HIGH\].*/, finding));
  findingsCommand(loopWs);
  judgeLoop(loopWs, [['code-13/C3-low/run-1/round-1/full#1', 'valid']]);
  const loop = () => runScript('loop', '--run', run, '--cases', cases);
  const stopped = loop();
  assert.equal(stopped.status, 1, stopped.stderr);
  assert.match(stopped.stderr, /round-1 has 1 valid extra findings for the fixer: /);
  // The files of a tree copy, in sorted order.
  const treeFiles = (dir) =>
    filesUnder(dir)
      .map((file) => path.relative(dir, file).split(path.sep).join('/'))
      .sort();
  const scripts = COPIED_SCRIPTS.map((name) => `${skill}/scripts/${name}`);
  const headFiles = [...skillFiles, ...scripts, 'src/app.mjs'].sort();
  const fixerDir = path.join(run, 'round-1', 'fixer');
  assert.deepEqual(treeFiles(path.join(fixerDir, 'snapshot')), headFiles);
  // The fixer repairs extra.mjs and adds a file of 60 lines, so round 2 is a panel round. The patch also adds a file
  // to the cases folder, which no diff of round 2 shows.
  const added = `${skill}/scripts/fix.mjs`;
  const repairs = {
    [extra]: 'export const extra = 2;\n',
    [added]: Array.from({ length: 60 }, (_, index) => `export const f${index} = ${index};\n`).join(''),
    [`${skill}/cases/dev/code-3.json`]: '{ "id": "code-3" }\n',
  };
  for (const [file, content] of Object.entries(repairs)) put(repo, file, content);
  gitIn(repo, 'add', '-A');
  const fixerPatch = gitIn(repo, 'diff', '--cached', '--no-color', '--src-prefix=a/', '--dst-prefix=b/');
  gitIn(repo, 'reset', '-q', '--hard', 'HEAD');
  fs.writeFileSync(path.join(fixerDir, 'fixer-1.patch'), fixerPatch);
  const next = loop();
  assert.equal(next.status, 0, next.stderr);
  const round2 = path.join(run, 'round-2');
  assert.equal(readJson(path.join(round2, 'meta.json')).mode, 'panel');
  const round2Files = [...headFiles, added].sort();
  assert.deepEqual(treeFiles(path.join(round2, 'snapshot')), round2Files);
  const judgeTree = path.join(loopWs, score.JUDGE_TREES, score.runLabel('code-13', 'C3-low', 'run-1/round-2'));
  assert.deepEqual(treeFiles(judgeTree), round2Files);
  const round2Diff = (name) => diffFilePaths(path.join(round2, name));
  assert.deepEqual(round2Diff('full.diff'), [...skillFiles, added, 'src/app.mjs'].sort());
  assert.deepEqual(round2Diff('focus-correctness.diff'), [extra, added, 'src/app.mjs'].sort());
  assert.deepEqual(round2Diff('focus-spec-and-tests.diff'), [`${skill}/tests/extra.test.mjs`]);
  assert.deepEqual(round2Diff('focus-text-and-safety.diff'), [`${skill}/SKILL.md`]);
  assert.deepEqual(round2Diff('delta.diff'), [extra, added].sort());
});
