#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PRODUCTIVITY = path.join(ROOT, 'plugins/docks/skills/productivity');
const LIVE_PLAN_SKILLS = ['plan-manager', 'plan-reviewer', 'plan-workspace'];
const REMOVED_PLAN_SKILLS = ['plan-creator', 'plan-repairer', 'plan-init', 'plan-review', 'plan-improver'];

function parseArgs(argv) {
  if (argv.length === 0) return { caseName: 'default' };
  if (argv.length === 2 && argv[0] === '--case' && argv[1] === 'bounded-workflows') {
    return { caseName: argv[1] };
  }
  throw new Error('usage: plan-skill-phases.mjs [--case bounded-workflows]');
}

function read(relative) {
  return fs.readFileSync(path.join(ROOT, relative), 'utf8');
}

function frontmatter(relative) {
  const text = read(relative);
  const match = text.match(/^---\n([\s\S]*?)\n---\n/);
  assert.ok(match, `${relative} must have YAML frontmatter`);
  return { metadata: parseYaml(match[1]), body: text.slice(match[0].length) };
}

function planSkillNames() {
  return fs
    .readdirSync(PRODUCTIVITY, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith('plan-'))
    .filter((entry) => fs.existsSync(path.join(PRODUCTIVITY, entry.name, 'SKILL.md')))
    .map((entry) => entry.name)
    .sort();
}

function assertLiveTopology() {
  assert.deepEqual(planSkillNames(), [...LIVE_PLAN_SKILLS].sort());
  for (const name of REMOVED_PLAN_SKILLS) {
    assert.equal(fs.existsSync(path.join(PRODUCTIVITY, name)), false, `${name} must not remain live`);
  }

  const expectedInvocable = new Map([
    ['plan-workspace', true],
    ['plan-manager', true],
    ['plan-reviewer', false],
  ]);
  let combinedBodyLines = 0;
  for (const name of LIVE_PLAN_SKILLS) {
    const relative = `plugins/docks/skills/productivity/${name}/SKILL.md`;
    const { metadata, body } = frontmatter(relative);
    assert.equal(metadata.name, name);
    assert.equal(metadata['user-invocable'], expectedInvocable.get(name));
    assert.match(metadata.description, /^Use when /);
    assert.match(metadata.description, /Not for /);
    const bodyLines = body.split('\n').length;
    assert.ok(bodyLines <= 310, `${name} body exceeds 310 lines: ${bodyLines}`);
    combinedBodyLines += bodyLines;
  }
  assert.ok(combinedBodyLines <= 700, `combined live plan skill bodies exceed 700 lines: ${combinedBodyLines}`);
}

function assertReviewerWrappersOnly() {
  const pluginAgents = fs
    .readdirSync(path.join(ROOT, 'plugins/docks/agents'))
    .filter((name) => name.startsWith('plan-') && name.endsWith('.md'))
    .sort();
  const codexAgents = fs
    .readdirSync(path.join(ROOT, '.codex/agents'))
    .filter((name) => name.startsWith('plan-') && name.endsWith('.toml'))
    .sort();

  assert.deepEqual(pluginAgents, ['plan-reviewer.md']);
  assert.deepEqual(codexAgents, ['plan-reviewer.toml']);

  const claude = frontmatter('plugins/docks/agents/plan-reviewer.md');
  assert.equal(claude.metadata.name, 'plan-reviewer');
  assert.equal(claude.metadata.tools, 'Read, Glob, Grep');
  assert.doesNotMatch(String(claude.metadata.tools), /Edit|Write|Bash|Agent/);
  assert.match(claude.body, /PlanReviewV1/);
  assert.match(claude.body, /immutable bundle/i);

  for (const relative of ['.codex/agents/plan-reviewer.toml']) {
    const wrapper = read(relative);
    assert.match(wrapper, /name = "plan-reviewer"/);
    assert.match(wrapper, /sandbox_mode = "read-only"/);
    assert.match(wrapper, /PlanReviewV1/);
    assert.doesNotMatch(wrapper, /plan-manager\/SKILL\.md|lifecycle authority|apply a patch/i);
  }
}

function assertBoundedWorkflows() {
  const manager = frontmatter('plugins/docks/skills/productivity/plan-manager/SKILL.md').body;
  const reviewer = frontmatter('plugins/docks/skills/productivity/plan-reviewer/SKILL.md').body;

  for (const contract of [
    /main-context `plan-manager` classifies, drafts, reviews, repairs, implements/i,
    /PlanRunV1/,
    /ExternalAuthorityV1/,
    /legacy-quarantined/,
    /One clear, reversible, low-risk local diff[\s\S]*`0 \/ 0 \/ 0`/,
    /Plan-only request[\s\S]*1–2 draft reviewers \/ 1 commit/,
    /Ordinary canonical implementation[\s\S]*1–2 draft reviewers \/ 2 commits/,
    /Sensitive, destructive, public-contract, security, or external implementation[\s\S]*≤2 draft \+ ≤2 completion reviewers \/ 3 commits/,
    /Before launching, transactionally\s+increment[\s\S]*persist\s+`reserved`/,
    /only\s+the\s+first\s+transport\s+failure\s+refunds/,
    /persists\s+`transport_retried`/,
    /no automatic push/i,
  ]) {
    assert.match(manager, contract);
  }
  assert.doesNotMatch(manager, /say [`“"]?start|turn-terminal|fallback model|third draft invocation/i);

  for (const contract of [
    /read-only bundle boundary/i,
    /One invocation, one result/i,
    /PlanReviewV1/,
    /missing_decision/,
    /contradiction/,
    /unsafe_scope/,
    /missing_acceptance/,
    /there is no score, quota/i,
  ]) {
    assert.match(reviewer, contract);
  }
  assert.doesNotMatch(reviewer, /numeric score|provider\/model fallback|apply a patch|change lifecycle/i);
}

parseArgs(process.argv.slice(2));
assertLiveTopology();
assertReviewerWrappersOnly();
assertBoundedWorkflows();
console.log('three-skill, one-wrapper bounded plan workflows passed');
