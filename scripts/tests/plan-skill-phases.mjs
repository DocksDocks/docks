#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';
import { machinePathCitations } from '../../plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/plan.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PRODUCTIVITY = path.join(ROOT, 'plugins/plan-lifecycle/skills/productivity');
const LIVE_PLAN_SKILLS = ['plan-manager', 'plan-reviewer', 'plan-workspace'];
const REMOVED_PLAN_SKILLS = ['plan-creator', 'plan-repairer', 'plan-init', 'plan-review', 'plan-improver'];
const MANAGER_SKILL = 'plugins/plan-lifecycle/skills/productivity/plan-manager/SKILL.md';
const REVIEWER_SKILL = 'plugins/plan-lifecycle/skills/productivity/plan-reviewer/SKILL.md';
const WORKSPACE_TEMPLATE =
  'plugins/plan-lifecycle/skills/productivity/plan-workspace/references/plans-agents-md-template.md';
const PLAN_CONTRACT = 'plugins/plan-lifecycle/skills/productivity/plan-manager/references/plan-contract.md';
const PLAN_AGENTS = 'docs/plans/AGENTS.md';

const V2_PINNED_CLAUSES = [
  {
    name: 'contract-v2-sections',
    text: 'Every v2 plan declares `plan_contract: v2` in a closed frontmatter map and carries exactly these eight `##` sections, in this order, each present once: `## Goal`, `## Research`, `## Steps`, `## Acceptance`, `## Do not touch`, `## Open questions`, `## Review`, `## Verification Results`.',
    files: [PLAN_AGENTS, WORKSPACE_TEMPLATE, PLAN_CONTRACT],
  },
  {
    name: 'review-kinds-sufficient',
    text: 'A plan-review finding is exactly one of `goal_fit`, `research_gap`, or `security_risk`; nothing else is a finding. A sufficient plan passes.',
    files: [
      REVIEWER_SKILL,
      'plugins/plan-lifecycle/agents/plan-reviewer.md',
      '.codex/agents/plan-reviewer.toml',
      PLAN_AGENTS,
      WORKSPACE_TEMPLATE,
      PLAN_CONTRACT,
    ],
  },
  {
    name: 'zero-commits',
    text: 'This lifecycle creates zero commits and never pushes.',
    files: [MANAGER_SKILL, PLAN_AGENTS, WORKSPACE_TEMPLATE],
  },
  {
    name: 'code-review-progress-guard',
    text: 'If a code-review round returns the same finding-id set as the previous round and no file changed between the two rounds, stop, append `Code-review: blocked` naming that set, and set the plan `blocked`.',
    files: [MANAGER_SKILL, PLAN_AGENTS],
  },
  {
    name: 'review-scope-guard',
    text: 'Build the review diff from what actually changed: `git status --porcelain` names the paths and the diff covers exactly those. Name every changed path that no Steps `Files` cell mentions in the review request, so the reviewer judges undeclared scope instead of the manager blocking on bookkeeping.',
    files: [MANAGER_SKILL, PLAN_AGENTS],
  },
  {
    name: 'nonlocal-effect-confirmation',
    text: 'A step whose `Effect` is not `local` requires an in-session `ask` confirmation immediately before it runs; when `ask` is unavailable the step is set `blocked` with `blocked_reason` naming the unconfirmed effect.',
    files: [MANAGER_SKILL, PLAN_AGENTS, WORKSPACE_TEMPLATE, PLAN_CONTRACT],
  },
  {
    name: 'three-option-ask',
    text: 'Phase 1 asks exactly one question with exactly three options, in this order and wording: `Plan and implement now`, `Plan only, stop at planned`, `Implement directly` — and skips the question only when the request already settles the mode.',
    files: [MANAGER_SKILL, PLAN_AGENTS, WORKSPACE_TEMPLATE],
  },
];

const PHASE_ONE_OPTIONS = ['Plan and implement now', 'Plan only, stop at planned', 'Implement directly'];

// The absent-lifecycle guard: every route into the plan lifecycle carries one
// byte-identical prerequisite paragraph, so a Codex install without the
// `plan-lifecycle` plugin fails loud instead of silently proceeding without a
// plan. Exact text is decided by the extraction plan; assert it verbatim and
// exactly once per route so removing or rewording it in any one file fails.
const LIFECYCLE_ROUTE_PREREQUISITE =
  'Prerequisite: `plan-lifecycle` must be installed. If `plan-workspace` or `plan-manager` is unavailable, STOP, name the missing `plan-lifecycle` plugin, and do not create or mutate a plan.';
const LIFECYCLE_ROUTE_FILES = [
  'plugins/docks/skills/engineering/refactor/SKILL.md',
  'plugins/docks/skills/engineering/security/SKILL.md',
  'plugins/docks/skills/productivity/context-tree/SKILL.md',
  'plugins/docks/skills/productivity/skill-agent-pipeline/SKILL.md',
  'plugins/effect-kit/skills/engineering/effect-ts-port/SKILL.md',
  'plugins/effect-kit/skills/engineering/effect-ts-setup/SKILL.md',
];

function normalizeContract(text) {
  return text.replace(/\s+/g, ' ').trim();
}

function assertPinnedClause(text, relative, clause) {
  assert.ok(text.includes(clause.text), `${relative} is missing the ${clause.name} clause`);
}

function assertV2ClausesAndMutations() {
  for (const clause of V2_PINNED_CLAUSES) {
    for (const relative of clause.files) {
      const text = normalizeContract(read(relative));
      const occurrences = text.split(clause.text).length - 1;
      assert.equal(occurrences, 1, `${relative} must contain exactly one ${clause.name} mutation target`);
      assert.throws(
        () => assertPinnedClause(text.replace(clause.text, ''), relative, clause),
        new RegExp(`missing the ${clause.name} clause`),
        `${relative} must fail when its ${clause.name} clause is removed`,
      );
    }
  }
}

function assertPhaseOneOptionLabels() {
  for (const relative of [MANAGER_SKILL, PLAN_AGENTS, WORKSPACE_TEMPLATE]) {
    const text = read(relative);
    for (const option of PHASE_ONE_OPTIONS) {
      const occurrences = text.split(option).length - 1;
      assert.equal(occurrences, 1, `${relative} must contain phase-1 option ${option} exactly once`);
    }
  }
}

function parseArgs(argv) {
  if (argv.length === 0) return { caseName: 'default' };
  if (argv.length === 2 && argv[0] === '--case' && ['bounded-workflows', 'plan-workspace-template'].includes(argv[1])) {
    return { caseName: argv[1] };
  }
  throw new Error('usage: plan-skill-phases.mjs [--case bounded-workflows|--case plan-workspace-template]');
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
    const relative = `plugins/plan-lifecycle/skills/productivity/${name}/SKILL.md`;
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
    .readdirSync(path.join(ROOT, 'plugins/plan-lifecycle/agents'))
    .filter((name) => name.endsWith('.md') && !['AGENTS.md', 'CLAUDE.md'].includes(name))
    .sort();
  const codexAgents = fs
    .readdirSync(path.join(ROOT, '.codex/agents'))
    .filter((name) => name.endsWith('.toml'))
    .sort();

  assert.deepEqual(pluginAgents, ['code-reviewer.md', 'plan-reviewer.md']);
  assert.deepEqual(codexAgents, ['code-reviewer.toml', 'plan-reviewer.toml']);

  const reviewerContracts = [
    {
      name: 'plan-reviewer',
      tools: 'Read, Glob, Grep, WebSearch, WebFetch',
      markers: ['goal_fit', 'research_gap', 'security_risk'],
    },
    {
      name: 'code-reviewer',
      tools: 'Read, Glob, Grep',
      markers: ['Code-review:', 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW'],
    },
  ];

  for (const contract of reviewerContracts) {
    const claude = frontmatter(`plugins/plan-lifecycle/agents/${contract.name}.md`);
    assert.equal(claude.metadata.name, contract.name);
    assert.equal(claude.metadata.tools, contract.tools);
    assert.doesNotMatch(String(claude.metadata.tools), /Edit|Write|Bash|Agent/);
    for (const marker of contract.markers) {
      assert.ok(claude.body.includes(marker), `${contract.name} body is missing ${marker}`);
    }

    const wrapper = read(`.codex/agents/${contract.name}.toml`);
    assert.match(wrapper, new RegExp(`^name = "${contract.name}"$`, 'm'));
    const sandboxModes = wrapper.match(/^sandbox_mode = ".+"$/gm) ?? [];
    assert.deepEqual(sandboxModes, ['sandbox_mode = "read-only"']);
    assert.doesNotMatch(wrapper, /workspace-write|danger-full-access/);
  }
}

function assertBoundedWorkflows() {
  const manager = frontmatter(MANAGER_SKILL).body;
  const reviewer = frontmatter(REVIEWER_SKILL).body;
  const headings = [
    '1. **Decide.**',
    '2. **Draft.**',
    '3. **Research.**',
    '4. **Plan review.**',
    '5. **Implement.**',
    '6. **Code review.**',
  ];
  let previousIndex = -1;
  for (const heading of headings) {
    const index = manager.indexOf(heading);
    assert.ok(index >= 0, `${MANAGER_SKILL} is missing ${heading}`);
    assert.ok(index > previousIndex, `${MANAGER_SKILL} phase headings must stay in order`);
    previousIndex = index;
  }

  const zeroCommits = V2_PINNED_CLAUSES.find(({ name }) => name === 'zero-commits').text;
  assert.ok(normalizeContract(manager).includes(zeroCommits), `${MANAGER_SKILL} is missing zero-commits`);
  assert.ok(manager.includes('references/plan-contract.md'), `${MANAGER_SKILL} must link the v2 contract`);
  // Ban only machinery identifiers. `permit` and `reserved` are ordinary words the
  // body needs in order to say the budget model is gone ("It has no hashes or
  // permits."), so banning them would make this lock fight the documentation.
  const removedManagerTerms = new RegExp(
    [
      'Plan' + 'RunV1',
      'plan_' + 'sha256',
      'plan_' + 'hash_mode',
      'accepted_' + 'classes',
      'transact' + 'PlanRun',
      'checkpoint commit',
      'External' + 'AuthorityV1',
    ].join('|'),
    'i',
  );
  assert.doesNotMatch(manager, removedManagerTerms);
  // The absence of the budget model is asserted positively instead.
  assert.match(manager, /no (?:hashes or )?permits?/i, `${MANAGER_SKILL} must state that permits are gone`);

  for (const marker of ['goal_fit', 'research_gap', 'security_risk', 'A sufficient plan passes.']) {
    assert.ok(reviewer.includes(marker), `${REVIEWER_SKILL} is missing ${marker}`);
  }
  const removedReviewerTerms = new RegExp(
    ['Plan' + 'ReviewV1', 'ReviewInvalid' + 'InputV1', 'numeric score', '32 KiB', 'immutable bundle'].join('|'),
    'i',
  );
  assert.doesNotMatch(reviewer, removedReviewerTerms);
}

function assertWorkspaceTemplateSynchronized() {
  const template = read(
    'plugins/plan-lifecycle/skills/productivity/plan-workspace/references/plans-agents-md-template.md',
  );
  const opening = '````markdown\n';
  const closing = '\n````\n';
  const start = template.indexOf(opening);
  assert.ok(start >= 0 && template.endsWith(closing), 'workspace template must contain one terminal fence');
  const generated = `${template.slice(start + opening.length, -closing.length)}\n`;
  assert.equal(
    read('docs/plans/AGENTS.md'),
    generated,
    'docs/plans/AGENTS.md must match the workspace template verbatim',
  );
  const generatedLineCount = generated.endsWith('\n')
    ? generated.slice(0, -1).split('\n').length
    : generated.split('\n').length;
  assert.ok(generatedLineCount <= 500, `generated docs/plans/AGENTS.md exceeds 500 lines: ${generatedLineCount}`);
  const templateLineCount = template.endsWith('\n')
    ? template.slice(0, -1).split('\n').length
    : template.split('\n').length;
  assert.ok(templateLineCount <= 500, `embedded workspace template exceeds 500 lines: ${templateLineCount}`);
}

function assertPortablePlanTextRule() {
  const clauses = ['repository-relative', 'acceptance rows run from the repository root'];
  for (const relative of [PLAN_AGENTS, WORKSPACE_TEMPLATE, MANAGER_SKILL]) {
    const text = normalizeContract(read(relative));
    for (const clause of clauses) {
      assert.ok(text.includes(clause), `${relative} is missing the portable-plan-text clause: ${clause}`);
    }
  }

  const offending = '| A1 | `cd /home/vagrant/projects/docks && node check.mjs` | Exit 0 |';
  assert.equal(machinePathCitations(offending).length, 1, 'an absolute machine path in plan prose must be reported');
  const frozen = 'Key: {"cwd":"/home/vagrant/projects/docks"}';
  assert.equal(machinePathCitations(frozen).length, 0, 'a machine path inside a Key: {json} record must stay exempt');

  const activeDir = path.join(ROOT, 'docs/plans/active');
  for (const name of fs.readdirSync(activeDir).filter((entry) => entry.endsWith('.md'))) {
    const relative = `docs/plans/active/${name}`;
    const hits = machinePathCitations(fs.readFileSync(path.join(activeDir, name), 'utf8'));
    assert.equal(hits.length, 0, `${relative} cites a machine path in plan text: ${hits[0]}`);
  }
}

function assertLifecycleRoutePrerequisite() {
  for (const relative of LIFECYCLE_ROUTE_FILES) {
    const occurrences = read(relative).split(LIFECYCLE_ROUTE_PREREQUISITE).length - 1;
    assert.equal(
      occurrences,
      1,
      `${relative} must carry the absent-lifecycle prerequisite paragraph exactly once (found ${occurrences})`,
    );
  }
}

const { caseName } = parseArgs(process.argv.slice(2));
if (caseName === 'plan-workspace-template') {
  assertWorkspaceTemplateSynchronized();
  console.log('plan workspace template synchronized');
} else {
  assertLiveTopology();
  assertReviewerWrappersOnly();
  assertBoundedWorkflows();
  assertV2ClausesAndMutations();
  assertPhaseOneOptionLabels();
  assertPortablePlanTextRule();
  assertLifecycleRoutePrerequisite();
  assertWorkspaceTemplateSynchronized();
  console.log('three-skill, two-wrapper v2 plan workflows passed');
}
