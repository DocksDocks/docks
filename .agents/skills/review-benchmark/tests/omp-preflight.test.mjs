// The omp side of `prepare.mjs agents`, `probe`, and `clean`: the agent files that omp 19 loads, the tier overrides in
// the omp project config, and the preflight against the installed omp. Each test runs prepare.mjs on Bun (see
// helpers.mjs onBun) with a fake omp first on PATH (see helpers.mjs fakeOmp), so no test runs the omp of the user.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'vitest';
import { BUN_RUNTIME } from '../../../../cli/test/lib/cliEntry.ts';
import {
  agentsOnBun,
  fakeOmp,
  gitIn,
  isolateGit,
  KIT_ROOT,
  MODEL,
  neutralScratch,
  onBun,
  PREPARE_SCRIPT,
  projectConfig,
  put,
  readJson,
  readText,
  REPO_ROOT,
  treeState,
  VERIFIED_OMP,
} from './helpers.mjs';

// The frontmatter keys that omp 19 reads in an agent file (omp://task-agent-discovery.md), and its effort levels.
const OMP_AGENT_KEYS = new Set([
  'name',
  'description',
  'tools',
  'spawns',
  'model',
  'thinking-level',
  'thinking',
  'output',
  'blocking',
  'structured',
  'autoload-skills',
  'read-summarize',
  'prewalk',
  'advisor',
]);
const OMP_EFFORTS = new Set(['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max']);
// The skill folders of the kit plugin that the agents, the self-review roots, and the plan contract use.
const KIT_SKILLS = ['code-reviewer', 'plan-reviewer', 'plan-manager', 'code-review', 'code-clarity'];
const PINS = readJson(path.join(REPO_ROOT, 'SoT', 'toolchain.json')).tools.omp;

// A git repository whose head and working tree hold the reviewer agents and the kit skills of the working tree of this
// checkout, in the kit layout, and an empty project folder.
function kitRepo() {
  isolateGit();
  const root = neutralScratch();
  const repo = path.join(root, 'repo');
  const project = path.join(root, 'project');
  fs.mkdirSync(project);
  gitIn(root, 'init', '-q', '-b', 'main', repo);
  const source = path.join(REPO_ROOT, KIT_ROOT);
  fs.cpSync(path.join(source, 'agents'), path.join(repo, KIT_ROOT, 'agents'), { recursive: true });
  for (const skill of KIT_SKILLS) {
    fs.cpSync(path.join(source, 'skills', skill), path.join(repo, KIT_ROOT, 'skills', skill), { recursive: true });
  }
  gitIn(repo, 'add', '-A');
  gitIn(repo, 'commit', '-q', '-m', 'kit plugin');
  const options = {
    'baseline-ref': 'HEAD',
    model: MODEL,
    efforts: 'low',
    tiers: 'default',
    'baseline-dir': path.join(root, 'baseline-plugin'),
    project,
  };
  return { root, repo, project, options, agentDir: path.join(project, '.omp', 'agents') };
}

// The frontmatter of an agent file: each top-level `key: value` line.
function frontmatterOf(file) {
  const match = /^---\n([\s\S]*?)\n---\n/.exec(readText(file));
  assert.ok(match, `${file} has no frontmatter`);
  return Object.fromEntries(
    match[1]
      .split('\n')
      .map((line) => /^([A-Za-z][\w-]*):\s*(.*)$/.exec(line))
      .filter(Boolean)
      .map(([, key, value]) => [key, value]),
  );
}

test('agents renders every generated agent with omp 19 frontmatter, lowercase tools, and no installed reviewer skill', () => {
  const { repo, options, agentDir } = kitRepo();
  agentsOnBun({ ...options, variants: 'v=HEAD', 'self-review-roots': 'wt=worktree' }, repo);
  const files = fs.readdirSync(agentDir).filter((file) => file.endsWith('.md'));
  const kinds = {
    baseline: /^review-bench-baseline-(code|plan)-low\.md$/,
    candidate: /^review-bench-candidate-(code|plan)-low\.md$/,
    variant: /^review-bench-variant-v-plan-low\.md$/,
    selfReview: /^review-bench-selfreview-(wt-)?low\.md$/,
    fixer: /^review-bench-fixer\.md$/,
    manager: /^review-bench-manager\.md$/,
  };
  for (const [kind, pattern] of Object.entries(kinds)) {
    assert.ok(files.some((file) => pattern.test(file)), `agents wrote no ${kind} agent: ${files.join(', ')}`);
  }
  assert.deepEqual(
    files.filter((file) => !Object.values(kinds).some((pattern) => pattern.test(file))),
    [],
  );
  const pluginCopies = [kinds.baseline, kinds.candidate, kinds.variant];
  for (const file of files) {
    const text = readText(path.join(agentDir, file));
    const fields = frontmatterOf(path.join(agentDir, file));
    const unknown = Object.keys(fields).filter((key) => !OMP_AGENT_KEYS.has(key));
    assert.deepEqual(unknown, [], `${file} has frontmatter keys that omp 19 does not read`);
    assert.equal(fields.name, file.replace(/\.md$/, ''));
    assert.ok(OMP_EFFORTS.has(fields['thinking-level']), `${file} has the effort ${fields['thinking-level']}`);
    assert.equal(fields.model, MODEL, file);
    const tools = fields.tools.split(',').map((tool) => tool.trim());
    assert.ok(tools.length > 0 && tools.every((tool) => /^[a-z_]+$/.test(tool)), `${file} has the tools ${fields.tools}`);
    if (pluginCopies.some((pattern) => pattern.test(file))) {
      // A plugin copy reads the skill of its own plugin root, not the installed reviewer skill.
      assert.equal(Object.hasOwn(fields, 'autoload-skills'), false, `${file} keeps autoload-skills`);
      assert.doesNotMatch(text, /skill:\/\/(code-reviewer|plan-reviewer)\b/, file);
    }
  }
});

test('agents writes the tier overrides to .omp/config.yml, keeps every other key, and clean removes only its own', () => {
  const { repo, project, options, agentDir } = kitRepo();
  const config = path.join(project, '.omp', 'config.yml');
  const legacy = path.join(project, '.omp', 'settings.json');
  put(
    project,
    '.omp/config.yml',
    'modelRoles:\n  default: anthropic/claude-opus-5-5\ntask:\n  agentModelOverrides:\n    code-reviewer: openai-codex/gpt-6.1-sol\n  agentServiceTierOverrides:\n    reviewer: inherit\n',
  );
  // A legacy project file of an older run of the script.
  put(project, '.omp/settings.json', {
    task: { agentServiceTierOverrides: { 'review-bench-candidate-code-old': 'priority', 'code-reviewer': 'inherit' } },
    theme: 'dark',
  });
  const omp = fakeOmp();
  const { lines } = agentsOnBun(options, repo, omp);
  const written = projectConfig(project);
  assert.equal(written.modelRoles.default, 'anthropic/claude-opus-5-5');
  assert.deepEqual(written.task.agentModelOverrides, { 'code-reviewer': 'openai-codex/gpt-6.1-sol' });
  const overrides = written.task.agentServiceTierOverrides;
  assert.equal(overrides.reviewer, 'inherit');
  assert.equal(overrides['review-bench-candidate-code-low'], 'default');
  assert.equal(overrides['review-bench-fixer'], 'priority');
  const ours = Object.keys(overrides).filter((name) => name.startsWith('review-bench-'));
  assert.ok(lines.includes(`wrote ${ours.length} tier overrides to ${config}`), lines.join('\n'));
  // agents first removes the generated entries of an earlier run from the legacy file, keeps its other keys, and
  // writes no new entry to it.
  const legacyKept = { task: { agentServiceTierOverrides: { 'code-reviewer': 'inherit' } }, theme: 'dark' };
  assert.deepEqual(readJson(legacy), legacyKept);
  // The list of configurations records the omp version of the preflight.
  assert.equal(readJson(path.join(agentDir, 'review-bench-configs.json')).ompVersion, VERIFIED_OMP);

  const clean = spawnSync(BUN_RUNTIME, [PREPARE_SCRIPT, 'clean', '--project', project], { encoding: 'utf8' });
  assert.equal(clean.status, 0, clean.stderr);
  const cleaned = projectConfig(project);
  assert.deepEqual(cleaned, {
    modelRoles: { default: 'anthropic/claude-opus-5-5' },
    task: {
      agentModelOverrides: { 'code-reviewer': 'openai-codex/gpt-6.1-sol' },
      agentServiceTierOverrides: { reviewer: 'inherit' },
    },
  });
  assert.deepEqual(readJson(legacy), legacyKept);
  assert.equal(fs.existsSync(agentDir), false);
});

test('writeTierOverrides writes no file without overrides, and removeGenerated removes files that hold only its entries', () => {
  const { project } = kitRepo();
  const config = path.join(project, '.omp', 'config.yml');
  assert.deepEqual(onBun('prepare.mjs', 'writeTierOverrides', [project, {}]).lines, [
    `no tier overrides, so ${config} stays as it is`,
  ]);
  assert.equal(fs.existsSync(path.join(project, '.omp')), false);
  onBun('prepare.mjs', 'writeTierOverrides', [project, { 'review-bench-manager': 'priority' }]);
  assert.deepEqual(projectConfig(project), { task: { agentServiceTierOverrides: { 'review-bench-manager': 'priority' } } });
  put(project, '.omp/settings.json', { task: { agentServiceTierOverrides: { 'review-bench-fixer': 'flex' } } });
  put(project, '.omp/agents/review-bench-manager.md', '---\nname: review-bench-manager\n---\n');
  put(project, '.omp/agents/my-agent.md', '---\nname: my-agent\n---\n');
  const { lines } = onBun('prepare.mjs', 'removeGenerated', [project]);
  assert.deepEqual(lines.slice(0, 2), [
    `removed 1 tier overrides from ${config}`,
    `removed 1 tier overrides from ${path.join(project, '.omp', 'settings.json')}`,
  ]);
  // Both files held only generated entries, so they go; the agent folder keeps the agent of the user.
  assert.deepEqual(treeState(path.join(project, '.omp')), { 'agents/': '', 'agents/my-agent.md': '---\nname: my-agent\n---\n' });
});

test('the preflight refuses an omp below the floor before it writes and warns above the verified pin', () => {
  const { repo, project, options, agentDir } = kitRepo();
  const below = '18.12.0';
  assert.throws(() => agentsOnBun(options, repo, fakeOmp({ version: below })), {
    message: `omp ${below} is below the omp floor ${PINS.floor} of SoT/toolchain.json; update omp`,
  });
  assert.equal(fs.existsSync(path.join(project, '.omp')), false);
  const above = '99.0.0';
  const { stderr } = agentsOnBun(options, repo, fakeOmp({ version: above }));
  assert.match(
    stderr,
    new RegExp(
      `warning: omp ${above} is newer than omp ${PINS.verified.replaceAll('.', '\\.')}, the release that SoT/toolchain.json verified; run the probe before a benchmark run`,
    ),
  );
  assert.equal(readJson(path.join(agentDir, 'review-bench-configs.json')).ompVersion, above);
  // probe runs the same version check.
  const probe = spawnSync(BUN_RUNTIME, [PREPARE_SCRIPT, 'probe', '--out', path.join(project, 'ws'), '--project', project], {
    encoding: 'utf8',
    env: fakeOmp({ version: below }).env,
  });
  assert.equal(probe.status, 1, probe.stdout);
  assert.match(probe.stderr, new RegExp(`omp ${below} is below the omp floor`));
});

test('the preflight refuses an effort that omp does not list for the model, before it writes', () => {
  const { repo, project, options } = kitRepo();
  const omp = fakeOmp({ thinking: ['low', 'medium', 'high'] });
  assert.throws(() => agentsOnBun({ ...options, efforts: 'low,xhigh' }, repo, omp), {
    message: `${MODEL} does not take the effort xhigh: omp lists low, medium, high for it`,
  });
  assert.throws(() => agentsOnBun(options, repo, fakeOmp({ thinking: [] })), {
    message: `${MODEL} does not take the effort low, high: omp lists no effort for it`,
  });
  assert.equal(fs.existsSync(path.join(project, '.omp')), false);
});

test('the preflight refuses a written tier override that omp does not load and task.enableEffort true', () => {
  const { repo, project, options } = kitRepo();
  const hint = `the agent files stay; run prepare.mjs clean --project ${project} to remove them`;
  assert.throws(() => agentsOnBun(options, repo, fakeOmp({ loadsConfig: false })), (error) => {
    assert.match(
      error.message,
      new RegExp(
        `^omp config get task\\.agentServiceTierOverrides in ${project} does not show the tier of \\d+ written agents, for example review-bench-\\S+: omp did not load \\.omp/config\\.yml; ${hint}$`,
      ),
    );
    return true;
  });
  assert.throws(() => agentsOnBun(options, repo, fakeOmp({ enableEffort: true })), {
    message: `task.enableEffort is true in ${project}, so the effort of a task would replace the thinking-level of an agent; set it to false, then run agents again (${hint})`,
  });
  // With the settings that omp 19 gives by default, agents passes and prints them.
  const { lines } = agentsOnBun(options, repo);
  assert.ok(
    lines.some((line) => /^omp settings in .+: \d+ tier overrides loaded, task\.enableEffort false, task\.structured false$/.test(line)),
    lines.join('\n'),
  );
});
