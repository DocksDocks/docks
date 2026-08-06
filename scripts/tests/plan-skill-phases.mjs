#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PRODUCTIVITY = path.join(ROOT, 'plugins/plan-lifecycle/skills/productivity');
const LIVE_PLAN_SKILLS = ['plan-manager', 'plan-reviewer', 'plan-workspace'];
const REMOVED_PLAN_SKILLS = ['plan-creator', 'plan-repairer', 'plan-init', 'plan-review', 'plan-improver'];
const PINNED_STEP_CLASS_CONTRACTS = [
  'docs/plans/AGENTS.md',
  'plugins/plan-lifecycle/skills/productivity/plan-manager/SKILL.md',
  'plugins/plan-lifecycle/skills/productivity/plan-workspace/SKILL.md',
  'plugins/plan-lifecycle/skills/productivity/plan-workspace/references/plans-agents-md-template.md',
];
const REVIEW_CONTRACT_FILES = [
  'docs/plans/AGENTS.md',
  'plugins/plan-lifecycle/skills/productivity/plan-manager/SKILL.md',
  'plugins/plan-lifecycle/skills/productivity/plan-reviewer/SKILL.md',
  'plugins/plan-lifecycle/skills/productivity/plan-workspace/SKILL.md',
  'plugins/plan-lifecycle/skills/productivity/plan-manager/references/reviewer-dispatch-methods.md',
  'plugins/plan-lifecycle/skills/productivity/plan-workspace/references/plans-agents-md-template.md',
  'plugins/plan-lifecycle/agents/plan-reviewer.md',
  '.codex/agents/plan-reviewer.toml',
];
const REVIEW_CONTRACT_CLAUSES = [
  {
    name: 'draft-one-plus-verification',
    text: 'Draft review has one initial review and, only after an accepted repair, one mandatory fresh verification, with a ceiling of two substantive invocations.',
  },
  {
    name: 'completion-exact-two',
    text: 'Completion review has exactly two substantive invocations and an empty `accepted_classes` set.',
  },
  {
    name: 'transport-only-retry',
    text: 'A transport-only failure refunds its reservation and allows one fresh `transport_retried` dispatch without changing substantive bindings; a second transport failure degrades only local draft work at local risk and otherwise blocks. One retry, never two.',
  },
  {
    name: 'post-verification-terminal',
    text: 'A draft repair verdict is accepted at most once. Any further repair or new finding after the mandatory verification terminal-blocks the run and requires a new user-authorized successor.',
  },
  {
    name: 'historical-accepted-classes',
    text: '`accepted_classes` remains valid on read for historical records and is written by no current transition.',
  },
  {
    name: 'historical-adapter-isolation',
    text: 'Historical records are read-only inputs to the historical adapter and never current authority.',
  },
  {
    name: 'direct-review-transport',
    text: 'Review transport is a direct reviewer subprocess. Session Relay is never review evidence and never a required dependency.',
  },
];
const REVIEWER_NO_FALLBACK_CLAUSE =
  'Do not resume another reviewer, switch provider/model, fall back to Session Relay or another transport, ask the user, or launch a replacement after any output or failure.';

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

const STEP_CLASS_CONTRACT_CLAUSES = [
  {
    name: 'legacy-new-schema',
    text: 'The legacy Steps schema omits `Id`; the new Steps schema adds it immediately after `#`.',
  },
  {
    name: 'required-class-field',
    text: 'Every `PlanReviewV1` finding carries a required `class`.',
  },
  {
    name: 'grandfather-two-routes',
    text: 'The exemption has exactly two routes: the frozen set, exactly `docs/plans/active/plan-lifecycle-plugin-extraction.md` and `docs/plans/active/step-ids-and-class-budget.md`, and every `docs/plans/finished/` path by prefix. An archived plan carries no frozen entry: keeping its old active path would exempt a new plan that reused the filename, silently skipping the Id requirement.',
  },
  {
    name: 'grandfather-path-lifecycle-extraction',
    text: '`docs/plans/active/plan-lifecycle-plugin-extraction.md`',
  },
  {
    name: 'grandfather-path-step-ids',
    text: '`docs/plans/active/step-ids-and-class-budget.md`',
  },
  {
    name: 'new-id',
    text: '`Id` is immediately after `#` and must match `[a-z][a-z0-9_]{0,63}`.',
  },
  {
    name: 'grandfather-cutover',
    text: 'A missing `Id` is advisory only for the frozen grandfather set; every new plan requires the `Id` column and one valid, unique id per Steps row.',
  },
  {
    name: 'stable-guard-citation',
    text: 'Within `Done when / failure action`, step citations are accepted only as `step:<id>` and must resolve to a declared id; valid-looking numeric `step N` citations are rejected. `#` and `Depends` keep their numeric display-number semantics.',
  },
  {
    name: 'missing-decision-class',
    text: '`missing_decision` permits only `v1_missing_decision`',
  },
  {
    name: 'contradiction-classes',
    text: '`contradiction` permits only `v1_contract_contradiction`, `v1_evidence_mismatch`, or `v1_unstable_step_reference`',
  },
  {
    name: 'unsafe-scope-classes',
    text: '`unsafe_scope` permits only `v1_unauthorized_effect`, `v1_missing_safety_boundary`, or `v1_affected_paths_incomplete`',
  },
  {
    name: 'acceptance-classes',
    text: '`missing_acceptance` permits only `v1_acceptance_command_not_runnable`, `v1_acceptance_output_mismatch`, `v1_acceptance_coverage_incomplete`, or `v1_failure_action_missing`',
  },
  {
    name: 'reviewer-owned-class',
    text: 'The reviewer emits `class`; the manager validates the kind/class pair and never derives a class from plan prose.',
  },
  {
    name: 'historical-empty-class-set',
    text: '`accepted_classes` remains valid on read for historical records and is written by no current transition.',
  },
  {
    name: 'post-verification-terminal',
    text: 'A draft repair verdict is accepted at most once. Any further repair or new finding after the mandatory verification terminal-blocks the run and requires a new user-authorized successor.',
  },
  {
    name: 'finite-draft-budget',
    text: 'Draft review has one initial review and, only after an accepted repair, one mandatory fresh verification, with a ceiling of two substantive invocations.',
  },
  {
    name: 'completion-exact-two',
    text: 'Completion review has exactly two substantive invocations and an empty `accepted_classes` set.',
  },
];

const RELEASE_PRECOMPLETION_CONTRACT_CLAUSES = [
  {
    name: 'live-boundary-order-and-canonical-inputs',
    text: 'A release plan that will mutate an external boundary places every available live read-only final-boundary check before completion-review reservation, using the exact canonical identities and data spellings consumed by the later mutation.',
  },
  {
    name: 'available-check-definition',
    text: 'Available means the repository already provides a read-only command or adapter path that exercises the boundary without the pending mutation; never invent a check or network call.',
  },
  {
    name: 'missing-probe-authority',
    text: 'If an available check requires probe authority and exact live `ExternalAuthorityV1` is absent, block before completion review rather than review an unexercised release assumption.',
  },
  {
    name: 'closed-object-disposition',
    text: 'Every closed object that affected code validates or emits has an explicit preserve-or-change disposition.',
  },
  {
    name: 'preserved-exact-key-fixture',
    text: 'A preserved shape has an exact-key compatibility fixture.',
  },
  {
    name: 'intentional-shape-change',
    text: 'An intentional shape change is in scope and includes migration, versioning, and historical-reader acceptance.',
  },
  {
    name: 'release-identity-roles',
    text: 'When present, roles include release source, plan source, execution parent, implementation commit, and tag commit.',
  },
  {
    name: 'release-identity-relations',
    text: 'A release identity matrix names each role, producer, consumer, and required equality, distinction, or ancestry relation.',
  },
  {
    name: 'predecessor-current-run-pin',
    text: 'Reject a contradictory or unstated relation and any later successor whose current-run fixtures remain pinned to its predecessor.',
  },
  {
    name: 'closed-shape-and-authority-preservation',
    text: 'Existing `PlanRunV1`, review-result, affected-path manifest, `ExternalAuthorityV1`, and release-receipt shapes remain byte-compatible; these guards add no field, state, result, or authority.',
  },
];

const WORKSPACE_CURRENT_MARKER_CLAUSES = [
  {
    name: 'release-precompletion-current-marker',
    text: 'release pre-completion guards for available live read-only final-boundary checks, closed-shape dispositions, and a release identity matrix;',
  },
  {
    name: 'status-hash-mode-current-marker',
    text: 'frontmatter `plan_hash_mode: status-excluded-v1` for new and successor plans, byte-identical legacy hashing for unmarked plans, dual-digest all-`planned` bootstrap validation, and normalized-digest installation on first legal status progress;',
  },
  {
    name: 'status-normalization-current-marker',
    text: 'status normalization limited to the exact `Status` cells of a valid unfenced `## Steps` table, with only legal row-state changes plus lifecycle `updated` and optional bootstrap `plan_sha256`; terminal `done` and `skipped`, and immutable blocked/finished PlanRun bytes;',
  },
  {
    name: 'missing-marker-stale-refresh',
    text: 'Missing any marker above makes an otherwise recognizable generated two-folder contract `STALE`; only explicit refresh installs the current embedded template.',
  },
];

const STATUS_EXCLUDED_HASH_CONTRACT_CLAUSES = [
  {
    name: 'marked-opt-in-and-legacy-hashing',
    text: 'New and successor plans opt in with frontmatter `plan_hash_mode: status-excluded-v1`; unmarked plans use byte-identical legacy hashing.',
  },
  {
    name: 'bootstrap-dual-digest',
    text: 'For marked all-`planned` bootstrap plans, validation accepts either the legacy full-body digest or the normalized digest.',
  },
  {
    name: 'first-progress-normalized-install',
    text: 'The first legal status progress transaction atomically installs the normalized digest.',
  },
  {
    name: 'exact-status-cell-normalization',
    text: 'Normalization applies only to the exact `Status` cells of a valid unfenced `## Steps` table; every other cell and byte remains bound.',
  },
  {
    name: 'status-progress-write-set',
    text: 'A status progress transaction allows only legal row-state changes plus the lifecycle `updated` timestamp and an optional bootstrap `plan_sha256` change.',
  },
  {
    name: 'terminal-status-and-run-bytes',
    text: '`done` and `skipped` are terminal; blocked and finished PlanRun bytes stay immutable.',
  },
];

const WORKSPACE_QUEUE_CLAUSE =
  '`docs/plans/QUEUE.md` is optional; when present it carries exactly one `Plan-queue: PlanQueueV1` marker';
const MANAGER_QUEUE_CLAUSE = 'A valid optional queue guides dependency-aware list and `next`';
const WORKSPACE_SKILL_QUEUE_CLAUSE = '`docs/plans/QUEUE.md` is optional and classification-neutral:';

function normalizeContract(text) {
  return text.replace(/\s+/g, ' ').trim();
}
function assertReviewContract(text, relative) {
  for (const clause of REVIEW_CONTRACT_CLAUSES) {
    assert.ok(text.includes(clause.text), `${relative} is missing the ${clause.name} clause`);
  }
}

function assertReviewerNoFallback(text) {
  assert.ok(
    text.includes(REVIEWER_NO_FALLBACK_CLAUSE),
    'plan-reviewer is missing the one-invocation no-fallback clause',
  );
}

function assertStepClassContract(text, relative) {
  for (const clause of STEP_CLASS_CONTRACT_CLAUSES) {
    assert.ok(text.includes(clause.text), `${relative} is missing the ${clause.name} clause`);
  }
}

function assertReleasePrecompletionContract(text, relative) {
  for (const clause of RELEASE_PRECOMPLETION_CONTRACT_CLAUSES) {
    assert.ok(text.includes(clause.text), `${relative} is missing the ${clause.name} clause`);
  }
}

function assertReleasePrecompletionContractsAndMutations() {
  for (const relative of [
    'docs/plans/AGENTS.md',
    'plugins/plan-lifecycle/skills/productivity/plan-manager/SKILL.md',
    'plugins/plan-lifecycle/skills/productivity/plan-reviewer/SKILL.md',
    'plugins/plan-lifecycle/skills/productivity/plan-workspace/references/plans-agents-md-template.md',
  ]) {
    const text = normalizeContract(read(relative));
    assertReleasePrecompletionContract(text, relative);
    for (const clause of RELEASE_PRECOMPLETION_CONTRACT_CLAUSES) {
      const occurrences = text.split(clause.text).length - 1;
      assert.equal(occurrences, 1, `${relative} must contain exactly one ${clause.name} mutation target`);
      assert.throws(
        () => assertReleasePrecompletionContract(text.replace(clause.text, ''), relative),
        new RegExp(`missing the ${clause.name} clause`),
        `${relative} must fail when its ${clause.name} clause is removed`,
      );
    }
  }
}

function assertWorkspaceCurrentMarkersAndMutations() {
  const relative = 'plugins/plan-lifecycle/skills/productivity/plan-workspace/SKILL.md';
  const text = normalizeContract(read(relative));
  for (const clause of WORKSPACE_CURRENT_MARKER_CLAUSES) {
    assert.ok(text.includes(clause.text), `${relative} is missing the ${clause.name} clause`);
    assert.equal(
      text.split(clause.text).length - 1,
      1,
      `${relative} must contain exactly one ${clause.name} mutation target`,
    );
    assert.throws(
      () => {
        const mutated = text.replace(clause.text, '');
        for (const required of WORKSPACE_CURRENT_MARKER_CLAUSES) {
          assert.ok(mutated.includes(required.text), `${relative} is missing the ${required.name} clause`);
        }
      },
      new RegExp(`missing the ${clause.name} clause`),
      `${relative} must fail when its ${clause.name} clause is removed`,
    );
  }
}

function assertStatusExcludedHashContractsAndMutations() {
  for (const relative of [
    'docs/plans/AGENTS.md',
    'plugins/plan-lifecycle/skills/productivity/plan-workspace/references/plans-agents-md-template.md',
  ]) {
    const text = normalizeContract(read(relative));
    for (const clause of STATUS_EXCLUDED_HASH_CONTRACT_CLAUSES) {
      assert.ok(text.includes(clause.text), `${relative} is missing the ${clause.name} clause`);
      assert.equal(
        text.split(clause.text).length - 1,
        1,
        `${relative} must contain exactly one ${clause.name} mutation target`,
      );
      assert.throws(
        () => {
          const mutated = text.replace(clause.text, '');
          for (const required of STATUS_EXCLUDED_HASH_CONTRACT_CLAUSES) {
            assert.ok(mutated.includes(required.text), `${relative} is missing the ${required.name} clause`);
          }
        },
        new RegExp(`missing the ${clause.name} clause`),
        `${relative} must fail when its ${clause.name} clause is removed`,
      );
    }
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

function assertStepClassContractsAndMutations() {
  const mutationTargets = new Set([
    'legacy-new-schema',
    'new-id',
    'grandfather-cutover',
    'grandfather-two-routes',
    'stable-guard-citation',
    'historical-empty-class-set',
    'post-verification-terminal',
    'finite-draft-budget',
    'completion-exact-two',
  ]);

  for (const relative of PINNED_STEP_CLASS_CONTRACTS) {
    const text = normalizeContract(read(relative));
    assertStepClassContract(text, relative);

    for (const clause of STEP_CLASS_CONTRACT_CLAUSES.filter(({ name }) => mutationTargets.has(name))) {
      const occurrences = text.split(clause.text).length - 1;
      assert.equal(occurrences, 1, `${relative} must contain exactly one ${clause.name} mutation target`);
      const mutated = text.replace(clause.text, '');
      assert.throws(
        () => assertStepClassContract(mutated, relative),
        new RegExp(`missing the ${clause.name} clause`),
        `${relative} must fail when its ${clause.name} clause is removed`,
      );
    }
  }
}

function assertOneQueueClause(text, relative, clause, name) {
  assert.equal(text.split(clause).length - 1, 1, `${relative} must contain exactly one ${name} queue clause`);
  assert.throws(
    () => {
      const mutated = text.replace(clause, '');
      assert.ok(mutated.includes(clause), `${relative} is missing the ${name} queue clause`);
    },
    new RegExp(`missing the ${name} queue clause`),
    `${relative} must fail when its ${name} queue clause is removed`,
  );
}

function assertPlanQueueContractsAndMutations() {
  const agents = read('docs/plans/AGENTS.md');
  const template = read(
    'plugins/plan-lifecycle/skills/productivity/plan-workspace/references/plans-agents-md-template.md',
  );
  const opening = '````markdown\n';
  const closing = '\n````\n';
  const start = template.indexOf(opening);
  assert.ok(start >= 0 && template.endsWith(closing), 'workspace template must contain one terminal fence');
  const generated = `${template.slice(start + opening.length, -closing.length)}\n`;
  assert.equal(agents, generated, 'docs/plans/AGENTS.md must match the workspace template verbatim');
  assertOneQueueClause(agents, 'docs/plans/AGENTS.md', WORKSPACE_QUEUE_CLAUSE, 'workspace');
  assertOneQueueClause(
    generated,
    'plugins/plan-lifecycle/skills/productivity/plan-workspace/references/plans-agents-md-template.md',
    WORKSPACE_QUEUE_CLAUSE,
    'workspace',
  );

  assertOneQueueClause(
    read('plugins/plan-lifecycle/skills/productivity/plan-manager/SKILL.md'),
    'plugins/plan-lifecycle/skills/productivity/plan-manager/SKILL.md',
    MANAGER_QUEUE_CLAUSE,
    'manager',
  );
  assertOneQueueClause(
    read('plugins/plan-lifecycle/skills/productivity/plan-workspace/SKILL.md'),
    'plugins/plan-lifecycle/skills/productivity/plan-workspace/SKILL.md',
    WORKSPACE_SKILL_QUEUE_CLAUSE,
    'workspace-skill',
  );
}

function parseArgs(argv) {
  if (argv.length === 0) return { caseName: 'default' };
  if (
    argv.length === 2 &&
    argv[0] === '--case' &&
    ['bounded-workflows', 'plan-workspace-template', 'plan-queue'].includes(argv[1])
  ) {
    return { caseName: argv[1] };
  }
  throw new Error(
    'usage: plan-skill-phases.mjs [--case bounded-workflows|--case plan-workspace-template|--case plan-queue]',
  );
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
    .filter((name) => name.startsWith('plan-') && name.endsWith('.md'))
    .sort();
  const codexAgents = fs
    .readdirSync(path.join(ROOT, '.codex/agents'))
    .filter((name) => name.startsWith('plan-') && name.endsWith('.toml'))
    .sort();

  assert.deepEqual(pluginAgents, ['plan-reviewer.md']);
  assert.deepEqual(codexAgents, ['plan-reviewer.toml']);

  const claude = frontmatter('plugins/plan-lifecycle/agents/plan-reviewer.md');
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
  const manager = frontmatter('plugins/plan-lifecycle/skills/productivity/plan-manager/SKILL.md').body;
  const reviewer = frontmatter('plugins/plan-lifecycle/skills/productivity/plan-reviewer/SKILL.md').body;

  for (const contract of [
    /main-context `plan-manager` classifies, drafts, reviews, repairs, implements/i,
    /PlanRunV1/,
    /ExternalAuthorityV1/,
    /legacy-quarantined/,
    /One clear, reversible, low-risk local diff[\s\S]*`0 \/ 0 \/ 0`/,
    /Plan-only request[\s\S]*≤2 draft reviewers \/ 1 commit/,
    /Ordinary canonical implementation[\s\S]*≤2 draft reviewers \/ 2 commits/,
    /Sensitive, destructive, public-contract, security, or external implementation[\s\S]*≤2 draft \+ exactly 2 completion reviewers \/ 3 commits/,
    /Before launching, transactionally\s+increment[\s\S]*persist\s+`reserved`/,
    /transport-only failure refunds its reservation/i,
    /one fresh `transport_retried` dispatch without changing substantive bindings/i,
    /no automatic push/i,
    // `transactPlanRun` has no in-repo callers: the caller is an agent reading
    // this body. If the instruction to pass the manifest is lost, acceptance
    // silently fails closed at completion with no other signal.
    /`acceptanceManifest` and `acceptanceManifestExpectation`; omitting either fails closed/,
  ]) {
    assert.match(manager, contract);
  }
  assert.doesNotMatch(manager, /say [`“"]?start|turn-terminal|fallback model/i);

  for (const contract of [
    /read-only bundle boundary/i,
    /One invocation, one result/i,
    /direct reviewer subprocess/i,
    /Session Relay is never review evidence and never a required dependency/i,
    /PlanReviewV1/,
    /missing_decision/,
    /contradiction/,
    /unsafe_scope/,
    /missing_acceptance/,
    /v1_missing_decision/,
    /v1_contract_contradiction/,
    /v1_evidence_mismatch/,
    /v1_unstable_step_reference/,
    /v1_unauthorized_effect/,
    /v1_missing_safety_boundary/,
    /v1_affected_paths_incomplete/,
    /v1_acceptance_command_not_runnable/,
    /v1_acceptance_output_mismatch/,
    /v1_acceptance_coverage_incomplete/,
    /v1_failure_action_missing/,
    /required `class`/,
    /there is no score, quota/i,
  ]) {
    assert.match(reviewer, contract);
  }
  assert.ok(
    normalizeContract(reviewer).includes(REVIEWER_NO_FALLBACK_CLAUSE),
    'plan-reviewer is missing the one-invocation no-fallback clause',
  );
  assert.doesNotMatch(reviewer, /numeric score|provider\/model fallback|apply a patch|change lifecycle/i);
}

function assertReviewContractsAndMutations() {
  for (const relative of REVIEW_CONTRACT_FILES) {
    const text = normalizeContract(read(relative));
    assertReviewContract(text, relative);
    for (const clause of REVIEW_CONTRACT_CLAUSES) {
      const occurrences = text.split(clause.text).length - 1;
      assert.equal(occurrences, 1, `${relative} must contain exactly one ${clause.name} clause`);
      assert.throws(
        () => assertReviewContract(text.replace(clause.text, ''), relative),
        new RegExp(`missing the ${clause.name} clause`),
        `${relative} must fail when its ${clause.name} clause is removed`,
      );
    }
  }

  const reviewer = normalizeContract(read('plugins/plan-lifecycle/skills/productivity/plan-reviewer/SKILL.md'));
  const mutated = reviewer.replace('fall back to Session Relay or another transport', 'may fall back to Session Relay');
  assertReviewerNoFallback(reviewer);
  assert.throws(
    () => assertReviewerNoFallback(mutated),
    /missing the one-invocation no-fallback clause/,
    'allowing Session Relay fallback must violate the reviewer transport contract',
  );
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

// `docs/plans/AGENTS.md` is generated verbatim from the plan-workspace
// template, so a rule written into only one copy silently drifts and is
// regenerated away. Bind both to the same sentence.
function assertAcceptanceProofRule() {
  // Bind each distinguishing clause. A single regex spanning the sentence with
  // `[\s\S]*` would still match after a mutation in the middle, making the
  // mutation probe vacuous — the failure mode this rule exists to prevent.
  const clauses = [
    /Minting or changing an acceptance requires live manifest proof/,
    /carrying one forward unchanged, or reading an immutable terminal\s+predecessor, does not/,
    /discharged at the instant it is\s+written and is not re-provable once HEAD moves/,
    /never a durable\s+invariant\./,
  ];
  for (const relative of [
    'docs/plans/AGENTS.md',
    'plugins/plan-lifecycle/skills/productivity/plan-workspace/references/plans-agents-md-template.md',
  ]) {
    const text = fs.readFileSync(path.join(ROOT, relative), 'utf8');
    for (const clause of clauses) {
      assert.match(text, clause, `${relative} is missing the acceptance-proof rule: ${clause}`);
    }
  }
}

function assertProposedRepairRule() {
  const clauses = [
    'The non-authoritative `## Proposed repair` section is excluded from `plan_sha256`',
    'it is installed only by the transition that blocks a run',
    'never added to an already-blocked run',
    '`blocked` → `blocked` rejects any byte change',
    // The four clauses above document the section; this one pins its exhaustive
    // enumeration because a copy can satisfy one while contradicting the other.
    'the `Plan-run` line, `## Review`, manager-written `## Verification Results`, and the non-authoritative `## Proposed repair`',
  ];
  for (const relative of [
    'docs/plans/AGENTS.md',
    'plugins/plan-lifecycle/skills/productivity/plan-workspace/references/plans-agents-md-template.md',
  ]) {
    const text = read(relative).replace(/\s+/g, ' ');
    for (const clause of clauses) {
      assert.ok(text.includes(clause), `${relative} is missing the Proposed repair clause: ${clause}`);
    }
  }
}

function assertLifecycleDispatchIntegrityRule() {
  const clauses = [
    {
      name: 'three-field pre-seal rebound',
      text: "pre-seal rebinding changes exactly the run's `plan_sha256`, `source_base`, and `source_sha256`",
    },
    { name: 'pre-reserve phase retention', text: 'leaves both review phases untouched' },
    {
      name: 'record/binding plan digest',
      text: 'record `plan_sha256` to equal binding `plan_sha256`',
    },
    {
      name: 'record/binding source digest',
      text: 'record `source_sha256` to equal binding `source_sha256`',
    },
    { name: 'record/manifest source base', text: 'record `source_base` to equal manifest `source_base`' },
    { name: 'binding excludes source base', text: 'The binding has no `source_base` field' },
    {
      name: 'pre-reserve mismatch refusal',
      text: 'PREFLIGHT FAILED - no permit reserved, no reviewer dispatched.',
    },
    {
      name: 'replacement repository-relative path',
      text: "the current file's normalized repository-relative path after validating the current record",
    },
    {
      name: 'replacement path equality',
      text: "rejects unless that file path equals the current run's `plan_path`",
    },
    { name: 'replacement target is never rewritten', text: 'never rewrites the target to make it match' },
  ];
  for (const relative of [
    'docs/plans/AGENTS.md',
    'plugins/plan-lifecycle/skills/productivity/plan-workspace/references/plans-agents-md-template.md',
  ]) {
    const text = read(relative).replace(/\s+/g, ' ');
    for (const clause of clauses) {
      assert.ok(text.includes(clause.text), `${relative} is missing the ${clause.name} clause`);
    }
  }
}

// These copies are maintained separately, so bind every distinguishing clause
// in each file. A single regex spanning the sentence with `[\s\S]*` would still
// match after a mutation in the middle, making the mutation probe vacuous.
function assertQuarantineRetirementRule() {
  const clauses = [
    // The precondition. Without it, widening the exception to every quarantined
    // plan (not only an abandoned goal) passes.
    'a quarantined plan whose goal is abandoned',
    'may be retired by moving the file unchanged',
    'docs/plans/finished/<YYYY-MM-DD>-<slug>.md',
    'appending a `## Retirement` section',
    // The invariant's full subject list. Binding only the predicate lets the
    // list narrow to `Frontmatter status`, freeing record lines and the
    // classification and reopening the laundering vector this rule closes.
    'Frontmatter status, every record line, and the classification',
    'must be byte-identical before and after',
    'flipping status to `finished` is prohibited',
  ];
  for (const relative of [
    'docs/plans/AGENTS.md',
    'plugins/plan-lifecycle/skills/productivity/plan-workspace/references/plans-agents-md-template.md',
    'plugins/plan-lifecycle/skills/productivity/plan-manager/SKILL.md',
  ]) {
    const text = fs.readFileSync(path.join(ROOT, relative), 'utf8').replace(/\s+/g, ' ');
    for (const clause of clauses) {
      assert.ok(text.includes(clause), `${relative} is missing the quarantine-retirement clause: ${clause}`);
    }
  }
}

// Pure function on purpose. `docs/plans/active/` is often empty, so a walk-only
// check would pass no matter what it did — the vacuous shape completion review
// caught as F1. The cases below exercise it directly.
function machinePathCitations(planText) {
  return (
    planText
      .split('\n')
      // Frozen evidence is exempt. A machine record is `Key: {json}`; a `cwd` or path
      // captured inside one is immutable history and must never be rewritten.
      .filter((line) => !/^[A-Z][A-Za-z0-9-]*: *\{/.test(line))
      .filter((line) => /\/home\/[a-z]|\/Users\/[A-Za-z]/.test(line))
  );
}

function assertPortablePlanTextRule() {
  const clauses = [
    'portable repository identifier',
    'never a local filesystem path',
    'acceptance rows run from the repository root',
    "names the other repository's id",
    'never rewrite a `cwd`',
  ];
  for (const relative of [
    'docs/plans/AGENTS.md',
    'plugins/plan-lifecycle/skills/productivity/plan-workspace/references/plans-agents-md-template.md',
    'plugins/plan-lifecycle/skills/productivity/plan-manager/SKILL.md',
  ]) {
    const text = fs.readFileSync(path.join(ROOT, relative), 'utf8').replace(/\s+/g, ' ');
    for (const clause of clauses) {
      assert.ok(text.includes(clause), `${relative} is missing the portable-plan-text clause: ${clause}`);
    }
  }

  // Positive: prose that tells another agent to cd into this machine's checkout.
  const offending = '| A1 | `cd /home/vagrant/projects/docks && node scripts/ci.mjs` | Exit 0 |';
  assert.equal(machinePathCitations(offending).length, 1, 'an absolute machine path in plan prose must be reported');
  // Exempt: the same path captured inside frozen record bytes.
  const frozen = 'Review-receipt: {"command":{"cwd":"/home/vagrant/projects/docks"},"schema":6}';
  assert.equal(
    machinePathCitations(frozen).length,
    0,
    'a machine path inside a frozen machine record must stay exempt',
  );

  // Regression over whatever is actually in flight.
  const activeDir = path.join(ROOT, 'docs/plans/active');
  for (const name of fs.readdirSync(activeDir).filter((n) => n.endsWith('.md'))) {
    const relative = `docs/plans/active/${name}`;
    const hits = machinePathCitations(fs.readFileSync(path.join(activeDir, name), 'utf8'));
    assert.equal(hits.length, 0, `${relative} cites a machine path in plan text: ${hits[0]}`);
  }
}

const { caseName } = parseArgs(process.argv.slice(2));
if (caseName === 'plan-workspace-template') {
  assertWorkspaceTemplateSynchronized();
  console.log('plan workspace template synchronized');
} else if (caseName === 'plan-queue') {
  assertPlanQueueContractsAndMutations();
  console.log('plan queue contracts synchronized');
} else {
  assertLiveTopology();
  assertReviewerWrappersOnly();
  assertBoundedWorkflows();
  assertReviewContractsAndMutations();
  assertStepClassContractsAndMutations();
  assertReleasePrecompletionContractsAndMutations();
  assertWorkspaceCurrentMarkersAndMutations();
  assertStatusExcludedHashContractsAndMutations();
  assertAcceptanceProofRule();
  assertProposedRepairRule();
  assertLifecycleDispatchIntegrityRule();
  assertQuarantineRetirementRule();
  assertPortablePlanTextRule();
  assertLifecycleRoutePrerequisite();
  assertWorkspaceTemplateSynchronized();
  console.log('three-skill, one-wrapper bounded plan workflows passed');
}
