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
const WORKSPACE_SKILL = 'plugins/plan-lifecycle/skills/productivity/plan-workspace/SKILL.md';
const WORKSPACE_TEMPLATE = 'plugins/plan-lifecycle/skills/productivity/plan-workspace/references/plan-md-template.md';
const PLAN_CONTRACT = 'plugins/plan-lifecycle/skills/productivity/plan-manager/references/plan-contract.md';
const PLAN_MD = 'docs/PLAN.md';
const CODE_REVIEWER_AGENT = 'plugins/plan-lifecycle/agents/code-reviewer.md';
const CODE_REVIEWER_CODEX = '.codex/agents/code-reviewer.toml';
const CODE_REVIEWER_TEMPLATE =
  'plugins/plan-lifecycle/skills/productivity/plan-workspace/references/codex-agent-templates.md';
const ISSUE_PUBLICATION =
  'plugins/plan-lifecycle/skills/productivity/plan-manager/references/github-issue-publication.md';
const ROOT_AGENTS = 'AGENTS.md';
const README_MD = 'README.md';
const EXECUTOR_DISPATCH = 'plugins/docks/skills/engineering/refactor/references/executor-dispatch.md';
const LIFECYCLE_SKILLS_AGENTS = 'plugins/plan-lifecycle/skills/AGENTS.md';
const DOCKS_README = 'plugins/docks/README.md';
const CLAUDE_PLAN_MANIFEST = 'plugins/plan-lifecycle/.claude-plugin/plugin.json';
const CODEX_PLAN_MANIFEST = 'plugins/plan-lifecycle/.codex-plugin/plugin.json';
const CLAUDE_MARKETPLACE = '.claude-plugin/marketplace.json';

const V3_PINNED_CLAUSES = [
  {
    name: 'standard-v3-sections',
    text: 'After the marker, the body contains exactly these eight `##` sections, once each and in this order: `## Goal`, `## Research`, `## Steps`, `## Acceptance`, `## Do not touch`, `## Open questions`, `## Review`, `## Verification Results`.',
    files: [PLAN_MD, WORKSPACE_TEMPLATE],
  },
  {
    name: 'contract-v3-sections',
    text: 'Every v3 plan opens with `<!-- plan-contract: v3 -->`, then a blank line, then exactly these eight `##` sections, in this order, each present once: `## Goal`, `## Research`, `## Steps`, `## Acceptance`, `## Do not touch`, `## Open questions`, `## Review`, `## Verification Results`.',
    files: [PLAN_CONTRACT],
  },
  {
    name: 'review-kinds-sufficient',
    text: 'A plan-review finding is exactly one of `goal_fit`, `research_gap`, or `security_risk`; nothing else is a finding. A sufficient plan passes.',
    files: [
      REVIEWER_SKILL,
      'plugins/plan-lifecycle/agents/plan-reviewer.md',
      '.codex/agents/plan-reviewer.toml',
      PLAN_MD,
      WORKSPACE_TEMPLATE,
      PLAN_CONTRACT,
    ],
  },
  {
    name: 'review-export-handoff',
    text: 'the export path the manager supplies',
    files: [
      REVIEWER_SKILL,
      'plugins/plan-lifecycle/agents/plan-reviewer.md',
      'plugins/plan-lifecycle/agents/code-reviewer.md',
      '.codex/agents/plan-reviewer.toml',
      '.codex/agents/code-reviewer.toml',
      PLAN_CONTRACT,
    ],
  },
  {
    name: 'review-export-dispatch',
    text: "`plan.mjs export <issue>` and dispatch `plan-reviewer` with the issue number and that round's printed export path",
    files: [MANAGER_SKILL],
  },
  {
    name: 'routine-issue-publication',
    text: 'The settled plan mode authorizes routine creation and update of the plan issue in the repository that the preflight resolved. Do not ask again for that publication or show a repository picker that repeats a resolved fact.',
    files: [MANAGER_SKILL, ISSUE_PUBLICATION],
  },
  {
    name: 'body-review-comment-pointer',
    text: '`## Review` contains exactly `_Review records are stored in issue comments._`; review reports are not appended to the body.',
    files: [PLAN_MD, WORKSPACE_TEMPLATE],
  },
  {
    name: 'contract-review-comment-pointer',
    text: '`## Review` is a static pointer, not a review log:',
    files: [PLAN_CONTRACT, PLAN_MD, WORKSPACE_TEMPLATE],
  },
  {
    name: 'generated-review-comment-pointer',
    text: 'Closed completion derives from GitHub `state` and `stateReason`. `## Review` contains exactly `_Review records are stored in issue comments._`.',
    files: [WORKSPACE_SKILL, ROOT_AGENTS],
  },
  {
    name: 'review-comment-publication',
    text: 'The reviewer returns exactly one markdown block. The manager posts that whole block as one issue comment without editing it.',
    files: [PLAN_CONTRACT, PLAN_MD, WORKSPACE_TEMPLATE],
  },
  {
    name: 'trusted-review-selection',
    text: "A record is trusted only when the issue has exactly one assignee and the comment's author login equals that assignee. For each review kind independently, the latest trusted well-formed comment wins, ordered by `createdAt` with API order as the tie-break. Foreign-authored, malformed, and superseded comments never establish current review state. A legacy verdict in the body is consulted for one review kind only when there is no trusted well-formed comment record of that kind.",
    files: [PLAN_CONTRACT, PLAN_MD, WORKSPACE_TEMPLATE],
  },
  {
    name: 'code-review-repair-bound',
    text: 'Both review phases run at most five rounds. Each round uses a fresh plan export; each code-review round also uses a fresh complete-candidate diff. On rounds 1 through 4, a `repair` or `fixes-required` verdict requires every reproduced or named finding to be fixed, followed by a fresh export or diff and a fresh review. A repair that changes no relevant bytes is no progress. A finding repeated in the next round survived its fix. Either condition stops the loop, as does `repair` or `fixes-required` in round 5; there is no sixth-round repair.',
    files: [PLAN_CONTRACT, PLAN_MD, WORKSPACE_TEMPLATE],
  },
  {
    name: 'manager-plan-review-bound',
    text: '4. **Plan review.** Run at most five rounds.',
    files: [MANAGER_SKILL],
  },
  {
    name: 'manager-code-review-bound',
    text: '6. **Code review.** Run at most five rounds.',
    files: [MANAGER_SKILL],
  },
  {
    name: 'plan-review-blocked-routing',
    text: 'A plan-review `blocked` verdict routes its user-only decision through `## Open questions` and `ask`; the verdict alone is not a lifecycle block.',
    files: [PLAN_CONTRACT, PLAN_MD, WORKSPACE_TEMPLATE],
  },
  {
    name: 'code-review-pass-verdict',
    text: '- `pass`: No `CRITICAL` or `HIGH` finding stands unfixed. Advisory `MEDIUM` and `LOW` lines may ride along on a `pass`: the manager records them as follow-ups and does not change reviewed bytes after the pass; they never trigger a re-review.',
    files: [CODE_REVIEWER_AGENT, CODE_REVIEWER_CODEX, CODE_REVIEWER_TEMPLATE],
  },
  {
    name: 'code-review-fixes-required-verdict',
    text: '- `fixes-required`: At least one evidenced `CRITICAL` or `HIGH` defect. The manager fixes every named defect and dispatches a fresh re-review on a fresh diff.',
    files: [CODE_REVIEWER_AGENT, CODE_REVIEWER_CODEX, CODE_REVIEWER_TEMPLATE],
  },
  {
    name: 'advisory-pass-immutable',
    text: 'After a pass, record each advisory as follow-up work and do not change reviewed bytes; advisory findings never trigger another review.',
    files: [PLAN_CONTRACT, PLAN_MD, WORKSPACE_TEMPLATE],
  },
  {
    name: 'review-scope-guard',
    text: 'Build the review diff from the complete candidate pull request, not only the dirty worktree. Resolve and fetch the repository default branch, then compute `<merge-base>` with `git merge-base <default-remote-ref> HEAD`. Cover one net tracked candidate with `git diff <merge-base> -- <changed paths>`. Add one `git diff --no-index /dev/null <path>` hunk for each untracked path. `git status --porcelain` still names dirty paths. Name every changed path that no Steps `Files` cell mentions in the review request.',
    files: [PLAN_MD, WORKSPACE_TEMPLATE],
  },
  {
    name: 'manager-review-scope-guard',
    text: 'At the start of every round, build a fresh review diff from the complete candidate pull request, not only the dirty worktree.',
    files: [MANAGER_SKILL],
  },
  {
    name: 'reviewed-pr-diff-match',
    text: 'After pull-request creation, record `headRefOid` and compare the changed paths and hunks from `gh pr diff` with the reviewed net candidate. Any mismatch invalidates the pass and blocks merge.',
    files: [PLAN_MD, WORKSPACE_TEMPLATE],
  },
  {
    name: 'manager-reviewed-pr-diff-match',
    text: 'Record its `headRefOid` and compare the changed paths and hunks from `gh pr diff` with the reviewed net candidate. Any mismatch invalidates the pass and blocks merge.',
    files: [MANAGER_SKILL],
  },
  {
    name: 'nonlocal-effect-confirmation',
    text: 'A step whose `Effect` is not `local` requires an in-session `ask` confirmation immediately before it runs; when `ask` is unavailable the step is set `blocked` and `Blocked: <unconfirmed effect>` is recorded first in `## Open questions`.',
    files: [PLAN_MD, WORKSPACE_TEMPLATE],
  },
  {
    name: 'manager-nonlocal-blocked-reason',
    text: 'A step whose `Effect` is not `local` requires an in-session `ask` confirmation immediately before it runs; when `ask` is unavailable the step is set `blocked` and the first line of `## Open questions` becomes `Blocked: <one-line reason>` naming the unconfirmed effect.',
    files: [MANAGER_SKILL],
  },
  {
    name: 'three-option-ask',
    text: 'Phase 1 asks exactly one question with exactly three options, in this order and wording: `Plan and implement now`, `Plan only, stop at planned`, `Implement directly` — and skips the question only when the request already settles the mode.',
    files: [MANAGER_SKILL, PLAN_MD, WORKSPACE_TEMPLATE],
  },
  {
    name: 'lifecycle-tool-ownership',
    text: '`plan.mjs` is plugin payload, not project payload. It ships inside the installed `plan-lifecycle` plugin at `skills/productivity/plan-manager/scripts/plan.mjs`. A project never vendors, copies, or re-creates it, and an unresolvable tool means the plugin is not installed. Never report it as a file missing from the repository.',
    files: [MANAGER_SKILL, WORKSPACE_SKILL, PLAN_MD, WORKSPACE_TEMPLATE],
  },
  {
    name: 'record-backend',
    text: 'The plan record is a GitHub issue. Its body carries the v3 byte contract and the human-authored plan, review records live in issue comments, and GitHub fields carry the machine state GitHub already owns. No plan markdown is tracked in the repository.',
    files: [PLAN_MD, WORKSPACE_TEMPLATE],
  },
  {
    name: 'output-discipline',
    text: 'Render a plan body verbatim only when the user names that plan and asks to see it. After a write, report the one-line header strip and the changed lines only; a write never re-renders the body.',
    files: [MANAGER_SKILL, PLAN_CONTRACT, PLAN_MD, WORKSPACE_TEMPLATE],
  },
  {
    name: 'show-review-summary',
    text: 'The header strip is `#<issue> · <status> · <title> · <url>`. `show` prints `reviews: plan=<pass|repair|blocked|none> code=<pass|fixes-required|blocked|none>` on the next line. With `show --body`, the record alone goes to stdout and both metadata lines go to stderr, header first.',
    files: [PLAN_CONTRACT, PLAN_MD, WORKSPACE_TEMPLATE],
  },
  {
    name: 'plan-only-resume-body',
    text: 'A later session resumes by reading the full record with `plan.mjs show <issue> --body`.',
    files: [MANAGER_SKILL],
  },
  {
    name: 'implement-branch-clean-tree',
    text: 'Before any branch checkout, and specifically before any `gh issue develop --checkout`, require `git status --porcelain` to be empty. If it is dirty, never stash, move, or commit the ambient work. Set the plan `blocked` and name the dirty paths, or continue only in an authorized clean worktree.',
    files: [MANAGER_SKILL, ISSUE_PUBLICATION, PLAN_CONTRACT, PLAN_MD, WORKSPACE_TEMPLATE],
  },
  {
    name: 'implement-linked-branch',
    text: "Pass `--repo <nameWithOwner>` to every `gh issue develop` call. First run `gh issue develop <issue> --repo <nameWithOwner> --list`. If it reports a linked branch, verify that branch belongs to the resolved repository, fetch it, and check it out. Otherwise run `gh issue develop <issue> --repo <nameWithOwner> --base <default-branch> --checkout`. After either path, verify that the checked-out branch is the issue's linked branch.",
    files: [PLAN_CONTRACT, PLAN_MD, WORKSPACE_TEMPLATE],
  },
  {
    name: 'default-pr-landing',
    text: 'After `Code-review: pass`, commit and push any remaining reviewed bytes, then create or update one pull request carrying `Closes #<issue>` and targeting the repository default branch. This landing work needs no additional prompt.',
    files: [ISSUE_PUBLICATION, PLAN_CONTRACT, PLAN_MD, WORKSPACE_TEMPLATE],
  },
  {
    name: 'manager-default-pr-landing',
    text: 'After a pass, commit and push any remaining reviewed bytes, then create or update the closing pull request under `## Landing`.',
    files: [MANAGER_SKILL],
  },
  {
    name: 'ci-check-discovery',
    text: 'Never treat an empty first checks result as success. Retry `gh pr checks --json name,bucket` at most 12 times with a 10-second delay until checks appear. If required checks exist, run `gh pr checks --watch --required`; if CI checks exist but none are required, run `gh pr checks --watch` to wait for all reported CI. Any failed check blocks merge. If no checks appear, continue only when repository inspection confirms that no pull-request CI is configured; otherwise leave the pull request open with a named no-checks blocker and do not show the merge prompt.',
    files: [MANAGER_SKILL, ISSUE_PUBLICATION, PLAN_CONTRACT, PLAN_MD, WORKSPACE_TEMPLATE],
  },
  {
    name: 'merge-approval-boundary',
    text: 'When the checks policy passes and GitHub reports the pull request mergeable, ask immediately with exactly two options: `Merge now` or `Leave pull request open`. Merge only on that fresh answer. If the user declines, or `ask` is unavailable, leave the pull request and the issue open and report the pull request URL. Never auto-merge, force-push, bypass branch protection, or merge on a stale or assumed answer.',
    files: [MANAGER_SKILL, ISSUE_PUBLICATION, PLAN_CONTRACT, PLAN_MD, WORKSPACE_TEMPLATE],
  },
  {
    name: 'merge-head-revalidation',
    text: "Immediately before merge, re-read `headRefOid` and `gh pr diff`. If the head SHA or diff changed, block merge. Invoke `gh pr merge` with `--match-head-commit <reviewed-head-sha>` and the repository's configured merge strategy only after the fresh `Merge now` answer.",
    files: [MANAGER_SKILL, ISSUE_PUBLICATION, PLAN_CONTRACT, PLAN_MD, WORKSPACE_TEMPLATE],
  },
  {
    name: 'repository-landing-summary',
    text: "Routine plan issue publication, implement-start linked branch creation, commits, normal pushes, and the closing pull request carry the settled mode's authorization and need no repeated prompt.",
    files: [WORKSPACE_SKILL, ROOT_AGENTS],
  },
  {
    name: 'generated-clean-tree-summary',
    text: 'Before any branch checkout, including `gh issue develop --checkout`, require `git status --porcelain` to be empty. If it is dirty, never stash, move, or commit ambient work; set the plan `blocked` and name the dirty paths, or use an authorized clean worktree.',
    files: [WORKSPACE_SKILL, ROOT_AGENTS],
  },
  {
    name: 'readme-landing-summary',
    text: 'The lifecycle runs six phases: decide, draft, research, plan review, implement, and code review. Plan repairs are re-reviewed from fresh exports, and code fixes are re-reviewed from fresh diffs, with a five-round ceiling in each review phase. Each reviewer returns one markdown block that the manager stores as one issue comment. When implementation starts, the manager reuses or creates the GitHub-linked plan branch. After code review passes, it commits and pushes any remaining reviewed bytes, opens the closing pull request, and waits for repository CI. It then asks `Merge now` or `Leave pull request open`. Without a fresh `Merge now` answer, it leaves the pull request and issue open. After an approved merge, `plan.mjs archive` verifies the merged closing pull request.',
    files: [README_MD],
  },
  {
    name: 'shipped-readme-landing-summary',
    text: 'Plan repairs are re-reviewed from fresh exports, and code fixes are re-reviewed from fresh diffs, with a five-round ceiling in each review phase. Each reviewer returns one markdown block that the manager stores as one issue comment. When implementation starts, the manager reuses or creates the GitHub-linked plan branch. After code review passes, it commits and pushes any remaining reviewed bytes, opens the closing pull request, waits for repository CI, and asks `Merge now` or `Leave pull request open`. Without a fresh `Merge now` answer, it leaves the pull request and issue open. After an approved merge, `plan.mjs archive` verifies the merged closing pull request.',
    files: [DOCKS_README],
  },
  {
    name: 'lifecycle-authoring-landing-boundary',
    text: 'comment-backed review records, five-round plan and code review repair loops, implement-start linked-branch publication, default pull-request landing, explicit merge confirmation',
    files: [LIFECYCLE_SKILLS_AGENTS],
  },
  {
    name: 'descriptor-coherence',
    text: 'Cross-tool GitHub-issue plan lifecycle with marker-based plan bodies, comment-backed review records, implement-start linked branches, bounded plan and code review repair loops, and two read-only reviewer wrappers.',
    files: [CLAUDE_PLAN_MANIFEST, CODEX_PLAN_MANIFEST, CLAUDE_MARKETPLACE],
  },
  {
    name: 'executor-landing-handoff',
    text: "follows the manager's full Landing flow. It archives only after an approved merge lands the closing pull request.",
    files: [EXECUTOR_DISPATCH],
  },
  {
    name: 'label-set',
    text: 'The exact closed lifecycle label set is created idempotently with `gh label create --force`: `plan`, `plan:drafting`, `plan:planned`, `plan:ongoing`, and `plan:blocked`. The four open-work statuses are exactly `drafting`, `planned`, `ongoing`, and `blocked`; `finished` is not a writable status. The retired names `plan:finished` and `plan-scheduled` are deleted and are not created, parsed, or applied.',
    files: [PLAN_MD, WORKSPACE_TEMPLATE],
  },
  {
    name: 'closed-status-derivation',
    text: 'Phase labels describe open work only. Every read of a closed issue ignores all phase labels and derives completion from `stateReason`. `plan.mjs status` refuses a closed issue with a message containing `is closed; status applies to open plans`. `plan.mjs archive` and `plan.mjs retire` strip every phase label that a closing merge or earlier edit left behind.',
    files: [PLAN_MD, WORKSPACE_TEMPLATE],
  },
  {
    name: 'contract-label-set',
    text: 'The label set is created idempotently with `gh label create --force`: `plan`, `plan:drafting`, `plan:planned`, `plan:ongoing`, and `plan:blocked`. These are the complete reserved set; no completion or scheduling label exists.',
    files: [PLAN_CONTRACT],
  },
  {
    name: 'archive-verifier',
    text: '`plan.mjs archive` is a verifier, not a writer of lifecycle state. It requires all Steps rows to be terminal (`done` or `skipped`), the latest trusted well-formed code-review comment to carry `Code-review: pass`, and an issue already closed as completed by an eligible merged pull request. It accepts an exact legacy body line `Code-review: pass` only when no trusted well-formed code-review comment exists. It writes no status. On success it removes any stale phase label and prints `plan #<n> finished (closed by <url>)`.',
    files: [PLAN_MD, WORKSPACE_TEMPLATE],
  },
  {
    name: 'issue-write-precondition',
    text: 'A plan-issue write is a read-modify-write, and the GitHub API offers no precondition for it. Every mutating command re-reads the issue body immediately before the edit, refuses when it differs from the body it read, and re-reads after the edit to confirm the pushed bytes.',
    files: [PLAN_CONTRACT, PLAN_MD, WORKSPACE_TEMPLATE],
  },
  {
    name: 'frozen-history-boundary',
    text: 'No lifecycle command or workspace migration operation opens, inventories, parses, classifies, lists, or migrates it.',
    files: [PLAN_CONTRACT, PLAN_MD, WORKSPACE_TEMPLATE],
  },
];
const CONTRACT_CLASSIFICATION_PINS = [
  { name: 'v3 marker', text: '<!-- plan-contract: v3 -->' },
  { name: 'unreadable outcome', text: '| Anything else | unreadable | Refused; no parser is attempted |' },
  {
    name: 'frozen-history-human-read-boundary',
    text: '`docs/plans/finished/` holds records written before the lifecycle moved to issues. Humans may read it as history, but it is never a source of truth.',
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

function assertV3ClausesAndMutations() {
  for (const clause of V3_PINNED_CLAUSES) {
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

  for (const relative of [PLAN_MD, WORKSPACE_TEMPLATE]) {
    const text = normalizeContract(read(relative));
    for (const clause of CONTRACT_CLASSIFICATION_PINS) {
      const occurrences = text.split(clause.text).length - 1;
      assert.ok(occurrences > 0, `${relative} must fail when every ${clause.name} occurrence is removed`);
      assert.throws(
        () => assertPinnedClause(text.replaceAll(clause.text, ''), relative, clause),
        new RegExp(`missing the ${clause.name} clause`),
        `${relative} must fail when every ${clause.name} occurrence is removed`,
      );
    }
    assert.equal(
      text.includes('plan_contract:'),
      false,
      `${relative} must fail when a plan_contract: frontmatter key is inserted`,
    );
  }
}

function assertPhaseOneOptionLabels() {
  for (const relative of [MANAGER_SKILL, PLAN_MD, WORKSPACE_TEMPLATE]) {
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
    if (contract.name === 'plan-reviewer') {
      for (const [relative, text] of [
        ['plugins/plan-lifecycle/agents/plan-reviewer.md', claude.body],
        ['.codex/agents/plan-reviewer.toml', wrapper],
      ]) {
        assert.ok(/issue number|<issue>/i.test(text), `${relative} must take an issue number`);
        assert.ok(!/plan path/i.test(text), `${relative} must not take a plan path`);
      }
    }
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

  const issuePublication = V3_PINNED_CLAUSES.find(({ name }) => name === 'routine-issue-publication').text;
  assert.ok(
    normalizeContract(manager).includes(issuePublication),
    `${MANAGER_SKILL} is missing routine-issue-publication`,
  );
  for (const file of [
    MANAGER_SKILL,
    PLAN_CONTRACT,
    WORKSPACE_SKILL,
    WORKSPACE_TEMPLATE,
    PLAN_MD,
    ROOT_AGENTS,
    README_MD,
    EXECUTOR_DISPATCH,
    DOCKS_README,
  ]) {
    const normalized = normalizeContract(read(file));
    assert.doesNotMatch(
      normalized,
      /This lifecycle creates zero commits and never pushes\.|creates zero automatic commits and never pushes|branch, commits, push, pull request, and merge are the user's|no automatic commit, no automatic push/i,
      `${file} retains the retired user-owned landing boundary`,
    );
  }
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
  const template = read(WORKSPACE_TEMPLATE);
  const opening = '````markdown\n';
  const closing = '\n````\n';
  const start = template.lastIndexOf(opening);
  assert.ok(start >= 0 && template.endsWith(closing), 'workspace template must contain one terminal fence');
  const generated = `${template.slice(start + opening.length, -closing.length)}\n`;
  assert.equal(read(PLAN_MD), generated, `${PLAN_MD} must match the workspace template verbatim`);
  const generatedLineCount = generated.endsWith('\n')
    ? generated.slice(0, -1).split('\n').length
    : generated.split('\n').length;
  assert.ok(generatedLineCount <= 500, `${PLAN_MD} exceeds 500 lines: ${generatedLineCount}`);
  const templateLineCount = template.endsWith('\n')
    ? template.slice(0, -1).split('\n').length
    : template.split('\n').length;
  assert.ok(templateLineCount <= 500, `embedded workspace template exceeds 500 lines: ${templateLineCount}`);
}

function assertPortablePlanTextRule() {
  const clauses = ['repository-relative', 'acceptance rows run from the repository root'];
  for (const relative of [PLAN_MD, WORKSPACE_TEMPLATE, MANAGER_SKILL]) {
    const text = normalizeContract(read(relative));
    for (const clause of clauses) {
      assert.ok(text.includes(clause), `${relative} is missing the portable-plan-text clause: ${clause}`);
    }
  }

  const offending = '| A1 | `cd /home/vagrant/projects/docks && node check.mjs` | Exit 0 |';
  assert.equal(machinePathCitations(offending).length, 1, 'an absolute machine path in plan prose must be reported');
  const frozen = 'Key: {"cwd":"/home/vagrant/projects/docks"}';
  assert.equal(machinePathCitations(frozen).length, 0, 'a machine path inside a Key: {json} record must stay exempt');

  for (const relative of [PLAN_MD, WORKSPACE_TEMPLATE]) {
    const hits = machinePathCitations(read(relative));
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
  assertV3ClausesAndMutations();
  assertPhaseOneOptionLabels();
  assertPortablePlanTextRule();
  assertLifecycleRoutePrerequisite();
  assertWorkspaceTemplateSynchronized();
  console.log('three-skill, two-wrapper v3 plan workflows passed');
}
