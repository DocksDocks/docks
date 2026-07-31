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
    // `transactPlanRun` has no in-repo callers: the caller is an agent reading
    // this body. If the instruction to pass the manifest is lost, acceptance
    // silently fails closed at completion with no other signal.
    /`acceptanceManifest` and `acceptanceManifestExpectation`; omitting either fails closed/,
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
    'plugins/docks/skills/productivity/plan-workspace/references/plans-agents-md-template.md',
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
    'plugins/docks/skills/productivity/plan-workspace/references/plans-agents-md-template.md',
  ]) {
    const text = read(relative).replace(/\s+/g, ' ');
    for (const clause of clauses) {
      assert.ok(text.includes(clause), `${relative} is missing the Proposed repair clause: ${clause}`);
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
    'plugins/docks/skills/productivity/plan-workspace/references/plans-agents-md-template.md',
    'plugins/docks/skills/productivity/plan-manager/SKILL.md',
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
    'plugins/docks/skills/productivity/plan-workspace/references/plans-agents-md-template.md',
    'plugins/docks/skills/productivity/plan-manager/SKILL.md',
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

parseArgs(process.argv.slice(2));
assertLiveTopology();
assertReviewerWrappersOnly();
assertBoundedWorkflows();
assertAcceptanceProofRule();
assertProposedRepairRule();
assertQuarantineRetirementRule();
assertPortablePlanTextRule();
console.log('three-skill, one-wrapper bounded plan workflows passed');
