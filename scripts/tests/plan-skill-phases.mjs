#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseDocument } from 'yaml';
import { selectedAuthorChecks } from '../lib/ci-targeting.mjs';
import { PLUGINS } from '../lib/plugins.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PRODUCTIVITY = path.join(ROOT, 'plugins/docks/skills/productivity');
const EXPECTED_PHASES = ['plan-workspace', 'plan-creator', 'plan-manager', 'plan-reviewer', 'plan-repairer'];
const EXPECTED_PUBLIC = new Map([
  ['plan-workspace', true],
  ['plan-creator', true],
  ['plan-manager', true],
  ['plan-reviewer', false],
  ['plan-repairer', false],
]);
const OLD_LIVE_NAMES = ['plan-init', 'plan-review', 'plan-improver', 'capability-tuning'];
const REVIEW_LOOP_POLICY_SURFACES = [
  'docs/plans/AGENTS.md',
  'plugins/docks/skills/productivity/plan-manager/SKILL.md',
  'plugins/docks/skills/productivity/plan-reviewer/SKILL.md',
  'plugins/docks/agents/plan-manager.md',
  'plugins/docks/agents/plan-reviewer.md',
  '.codex/agents/plan-manager.toml',
  '.codex/agents/plan-reviewer.toml',
  'docs/scaffold/templates/root-AGENTS.md.template',
  'docs/scaffold/templates/codex-plan-manager.toml.template',
  'docs/scaffold/templates/codex-plan-reviewer.toml.template',
  'plugins/docks/skills/productivity/plan-workspace/references/plans-agents-md-template.md',
  'plugins/docks/skills/productivity/plan-workspace/references/codex-agent-templates.md',
];

function parseArgs(argv) {
  if (argv.length === 0) return { caseName: 'default', version: null };
  if (argv.length === 2 && argv[0] === '--case' && argv[1] === 'resumed-release-plan') {
    return { caseName: argv[1], version: null };
  }
  if (argv.length === 4 && argv[0] === '--case' && argv[1] === 'installed-catalogs' && argv[2] === '--version') {
    assert.match(argv[3], /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/, '--version must be canonical semver');
    return { caseName: argv[1], version: argv[3] };
  }
  throw new Error('usage: plan-skill-phases.mjs [--case installed-catalogs --version <v>|--case resumed-release-plan]');
}

function parseYaml(text, label) {
  const document = parseDocument(text, { prettyErrors: true, strict: true, uniqueKeys: true });
  assert.equal(document.errors.length, 0, `${label}: ${document.errors.join('\n')}`);
  return document.toJS();
}

function readFrontmatter(file) {
  const text = fs.readFileSync(file, 'utf8');
  assert.ok(text.startsWith('---\n'), `${path.relative(ROOT, file)} must start with frontmatter`);
  const end = text.indexOf('\n---\n', 4);
  assert.notEqual(end, -1, `${path.relative(ROOT, file)} must close frontmatter`);
  return {
    metadata: parseYaml(text.slice(4, end), path.relative(ROOT, file)),
    body: text.slice(end + 5),
  };
}

function immediateSkillMetadata(skillsRoot) {
  return fs
    .readdirSync(skillsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(skillsRoot, entry.name, 'SKILL.md'))
    .filter((file) => fs.existsSync(file))
    .map((file) => ({ file, ...readFrontmatter(file) }));
}

function phaseMetadata(skillsRoot) {
  return immediateSkillMetadata(skillsRoot)
    .filter(({ metadata }) => metadata.name.startsWith('plan-'))
    .sort((left, right) => left.metadata.name.localeCompare(right.metadata.name));
}

function useWhenClaim(description) {
  assert.match(description, /^Use when\b/, 'skill description must use the CSO trigger form');
  return description.split(/\bNot for\b/i, 1)[0];
}

function assertPhaseMetadata(skillsRoot = PRODUCTIVITY) {
  const phases = phaseMetadata(skillsRoot);
  assert.deepEqual(
    phases.map(({ metadata }) => metadata.name).sort(),
    [...EXPECTED_PHASES].sort(),
    'live plan skill names',
  );

  for (const { file, metadata } of phases) {
    assert.equal(
      metadata['user-invocable'],
      EXPECTED_PUBLIC.get(metadata.name),
      `${metadata.name} public/internal flag`,
    );
    assert.equal(
      path.basename(path.dirname(file)),
      metadata.name,
      `${metadata.name} directory must match its public name`,
    );
  }

  const claims = new Map(phases.map(({ metadata }) => [metadata.name, useWhenClaim(metadata.description)]));
  const expectedClaims = new Map([
    ['plan-workspace', [/bootstrapp/i, /migrat/i, /audit/i, /refresh/i, /docs\/plans/i]],
    ['plan-creator', [/draft/i, /self-review/i, /previously nonexistent/i, /`?planned`?\s+or\s+`?scheduled`?/i]],
    ['plan-manager', [/existing-plan/i, /list\/show\/lifecycle/i, /review preparation/i, /dispatch/i]],
    ['plan-reviewer', [/read-only/i, /typed evidence/i, /sealed bundle/i]],
    ['plan-repairer', [/one patch/i, /exact accepted blocking set/i, /cannot_repair/i]],
  ]);
  for (const [name, patterns] of expectedClaims) {
    for (const pattern of patterns)
      assert.match(claims.get(name), pattern, `${name} trigger claim must include ${pattern}`);
  }
  assert.equal(
    new Set(claims.values()).size,
    EXPECTED_PHASES.length,
    'each phase must have a distinct positive trigger claim',
  );

  for (const oldName of OLD_LIVE_NAMES) {
    assert.equal(fs.existsSync(path.join(skillsRoot, oldName)), false, `${oldName} must not resolve as a live skill`);
  }
}

function parseTomlIdentity(file) {
  const text = fs.readFileSync(file, 'utf8');
  const value = (key) => {
    const match = text.match(new RegExp(`^${key}\\s*=\\s*"([^"]+)"`, 'm'));
    assert.ok(match, `${path.relative(ROOT, file)} missing ${key}`);
    return match[1];
  };
  return { name: value('name'), sandboxMode: value('sandbox_mode'), text };
}

function assertWrappers() {
  const claudeRoot = path.join(ROOT, 'plugins/docks/agents');
  const codexRoot = path.join(ROOT, '.codex/agents');
  const expected = ['plan-manager', 'plan-reviewer'];
  const claudeFiles = fs
    .readdirSync(claudeRoot)
    .filter((name) => /^plan-.*\.md$/.test(name))
    .sort();
  const codexFiles = fs
    .readdirSync(codexRoot)
    .filter((name) => /^plan-.*\.toml$/.test(name))
    .sort();
  assert.deepEqual(
    claudeFiles,
    expected.map((name) => `${name}.md`).sort(),
    'Claude wrappers are manager/reviewer only',
  );
  assert.deepEqual(
    codexFiles,
    expected.map((name) => `${name}.toml`).sort(),
    'Codex wrappers are manager/reviewer only',
  );

  const claude = new Map(
    claudeFiles.map((name) => {
      const parsed = readFrontmatter(path.join(claudeRoot, name));
      return [parsed.metadata.name, parsed];
    }),
  );
  assert.deepEqual([...claude.keys()].sort(), expected, 'Claude wrapper identities');
  assert.match(
    String(claude.get('plan-manager').metadata.tools),
    /Edit/,
    'manager wrapper may apply a prepared lifecycle write',
  );
  assert.doesNotMatch(
    String(claude.get('plan-reviewer').metadata.tools),
    /Edit|Write/,
    'reviewer wrapper must remain read-only',
  );
  assert.match(
    claude.get('plan-manager').body,
    /skills\/productivity\/plan-manager\/SKILL\.md/,
    'manager wrapper dispatch target',
  );
  assert.match(
    claude.get('plan-reviewer').body,
    /skills\/productivity\/plan-reviewer\/SKILL\.md/,
    'reviewer wrapper dispatch target',
  );

  const codex = new Map(
    codexFiles.map((name) => {
      const parsed = parseTomlIdentity(path.join(codexRoot, name));
      return [parsed.name, parsed];
    }),
  );
  assert.deepEqual([...codex.keys()].sort(), expected, 'Codex wrapper identities');
  assert.equal(codex.get('plan-manager').sandboxMode, 'workspace-write');
  assert.equal(codex.get('plan-reviewer').sandboxMode, 'read-only');
  assert.match(
    codex.get('plan-manager').text,
    /skills\/productivity\/plan-manager\/SKILL\.md/,
    'Codex manager dispatch target',
  );
  assert.match(
    codex.get('plan-reviewer').text,
    /skills\/productivity\/plan-reviewer\/SKILL\.md/,
    'Codex reviewer dispatch target',
  );
}

function assertScaffoldContract() {
  const spec = parseYaml(
    fs.readFileSync(path.join(ROOT, 'docs/scaffold/spec.yaml'), 'utf8'),
    'docs/scaffold/spec.yaml',
  );
  const planSeed = spec.tree_nodes.find((node) => node.path === 'docs/plans');
  assert.deepEqual(planSeed, { path: 'docs/plans', seed_from_skill: 'plan-workspace' });

  const bundledPlanSkills = spec.bundled_skills
    .map(({ source }) => path.basename(source))
    .filter((name) => name.startsWith('plan-'))
    .sort();
  assert.deepEqual(bundledPlanSkills, [...EXPECTED_PHASES].sort(), 'scaffold must bundle all five plan skills');

  const wrapperDestinations = spec.templated_files
    .map(({ dest }) => dest)
    .filter((dest) => dest.startsWith('.codex/agents/plan-'))
    .sort();
  assert.deepEqual(wrapperDestinations, ['.codex/agents/plan-manager.toml', '.codex/agents/plan-reviewer.toml']);
  for (const entry of spec.bundled_skills.filter(({ source }) => EXPECTED_PHASES.includes(path.basename(source)))) {
    assert.ok(
      fs.existsSync(path.join(ROOT, entry.source, 'SKILL.md')),
      `scaffold source must resolve: ${entry.source}`,
    );
  }
}

function assertAuthorCheckKey() {
  const docks = PLUGINS.find(({ name }) => name === 'docks');
  assert.ok(docks, 'docks plugin descriptor');
  const routed = [...selectedAuthorChecks([docks])];
  assert.deepEqual(
    routed.filter((name) => name.startsWith('plan-')),
    ['plan-reviewer'],
  );
  assert.equal(routed.includes('plan-review'), false, 'old plan-review author-check key must not route');
}

function assertCatalogMetadata() {
  const files = [
    'plugins/docks/.claude-plugin/plugin.json',
    'plugins/docks/.codex-plugin/plugin.json',
    '.claude-plugin/marketplace.json',
  ];
  for (const relative of files) {
    const parsed = JSON.parse(fs.readFileSync(path.join(ROOT, relative), 'utf8'));
    const description = parsed.plugins
      ? parsed.plugins.find(({ name }) => name === 'docks').description
      : parsed.description;
    assert.doesNotMatch(
      description,
      /capability[ -]tuning/i,
      `${relative} must not advertise deleted capability tuning`,
    );
  }
}

function assertControllerRecoveryOwnership() {
  const text = (relative) => fs.readFileSync(path.join(ROOT, relative), 'utf8');
  const managerFiles = [
    'docs/plans/AGENTS.md',
    'plugins/docks/skills/productivity/plan-manager/SKILL.md',
    'plugins/docks/agents/plan-manager.md',
    '.codex/agents/plan-manager.toml',
    'docs/scaffold/templates/root-AGENTS.md.template',
    'docs/scaffold/templates/codex-plan-manager.toml.template',
    'plugins/docks/skills/productivity/plan-workspace/references/plans-agents-md-template.md',
    'plugins/docks/skills/productivity/plan-workspace/references/codex-agent-templates.md',
  ];
  for (const relative of managerFiles) {
    const body = text(relative);
    assert.match(body, /prepared request/i, `${relative} must name the prepared-request boundary`);
    assert.match(body, /commitment/i, `${relative} must name the dispatch-commitment boundary`);
    assert.match(
      body,
      /(?:commit|persist)[\s\S]{0,800}read[\s-]?back|read[\s-]?back[\s\S]{0,800}(?:commit|persist)/i,
      `${relative} must require commit/read-back of launch evidence`,
    );
    assert.match(body, /dispatchCommittedReviewer/, `${relative} must name the sole dispatch gate`);
    assert.match(
      body,
      /(?:sole|only)[\s\S]{0,160}(?:spawn|process|dispatch)[\s\S]{0,160}(?:boundary|gate)|dispatchCommittedReviewer[\s\S]{0,240}(?:sole|only)/i,
      `${relative} must reserve the sole process boundary to the committed dispatch gate`,
    );
    assert.match(body, /current[\s-]+[`"]?HEAD/i, `${relative} must require the exact current HEAD`);
    assert.match(body, /single-parent/i, `${relative} must reject multi-parent dispatch commits`);
    assert.match(body, /plan-only/i, `${relative} must require a plan-only dispatch commit`);
    assert.match(
      body,
      /controllerAdapter\.dispatch|trusted adapter/i,
      `${relative} must name the trusted host adapter`,
    );
    assert.match(body, /zero times|zero-call|must not call/i, `${relative} must make rejected dispatches zero-call`);
    assert.match(
      body,
      /worktree[\s\S]{0,240}(?:byte|drift|git show)/i,
      `${relative} must reject post-commit worktree drift`,
    );
    assert.match(
      body,
      /(?:sealed )?bundle[\s\S]{0,240}(?:path|digest|hash)|(?:path|digest|hash)[\s\S]{0,240}(?:sealed )?bundle/i,
      `${relative} must bind the committed sealed bundle`,
    );
    assert.match(
      body,
      /(?:reviewer|committed|Codex)?[\s-]*workspace[\s\S]{0,320}(?:sentinel|owner|mode|symlink)|(?:sentinel|owner|mode|symlink)[\s\S]{0,320}(?:reviewer|committed|Codex)?[\s-]*workspace/i,
      `${relative} must validate the committed reviewer workspace`,
    );
    assert.match(body, /validateReviewTerminalFamily/, `${relative} must require the terminal-family validator`);
    assert.match(
      body,
      /currentPlanBytes[\s\S]{0,160}parentPlanBytes|parentPlanBytes[\s\S]{0,160}currentPlanBytes/,
      `${relative} must bind terminal validation to child and parent bytes`,
    );
  }

  const managerSkill = text('plugins/docks/skills/productivity/plan-manager/SKILL.md');
  assert.match(
    managerSkill,
    /exact(?:ly)?[- ]?600|600[- ]second/i,
    'plan-manager must retain the exact-600 launch gate',
  );
  assert.match(
    managerSkill,
    /current-user[\s\S]{0,240}(?:bytes|authorization)|(?:bytes|authorization)[\s\S]{0,240}current-user/i,
    'plan-manager must bind abandonment to current-user bytes',
  );
  assert.match(
    managerSkill,
    /main-context plan-manager[\s\S]{0,240}abandon|abandon[\s\S]{0,240}main-context plan-manager/i,
    'only main-context plan-manager may abandon',
  );

  const reviewer = text('plugins/docks/skills/productivity/plan-reviewer/SKILL.md');
  assert.match(reviewer, /read-only|evidence-only/i, 'plan-reviewer must stay read-only');
  assert.match(
    reviewer,
    /(?:must not|cannot|never)[\s\S]{0,160}abandon|abandon[\s\S]{0,160}(?:must not|cannot|never)/i,
    'plan-reviewer must not abandon',
  );
  const repairer = text('plugins/docks/skills/productivity/plan-repairer/SKILL.md');
  assert.match(repairer, /patch-only|one patch/i, 'plan-repairer must stay patch-only');
}

function assertReviewLoopPolicy() {
  for (const relative of REVIEW_LOOP_POLICY_SURFACES) {
    const body = fs.readFileSync(path.join(ROOT, relative), 'utf8');
    assert.match(
      body,
      /full project CI and acceptance evidence run once at the implementation boundary/i,
      `${relative} must run full CI and acceptance once at the implementation boundary`,
    );
    assert.match(
      body,
      /implementation tree[\s\S]{0,100}affected_paths/i,
      `${relative} must bind reusable evidence to the implementation tree and affected paths`,
    );
    assert.match(
      body,
      /reuse[\s\S]{0,80}green\s+evidence[\s\S]{0,180}only while[\s\S]{0,180}unchanged/i,
      `${relative} must reuse green evidence only while implementation inputs are unchanged`,
    );
    assert.match(
      body,
      /(?:plan-only[\s\S]{0,80}state[\s,/]+request[\s,/]+commitment[\s\S]{0,30}lifecycle[\s\S]{0,80}reuse|reuse[\s\S]{0,120}plan-only[\s\S]{0,80}state[\s\S]{0,30}request[\s\S]{0,30}commitment[\s\S]{0,30}lifecycle)/i,
      `${relative} must scope reuse to state/request/commitment/lifecycle commits`,
    );
    assert.match(
      body,
      /implementation-tree\s+or\s+affected-path\s+changes?\s+invalidates?\s+reuse\s+and\s+requires?\s+fresh\s+full\s+project\s+CI\s+and\s+acceptance\s+evidence/i,
      `${relative} must invalidate reuse and rerun full CI for implementation changes`,
    );
    assert.match(
      body,
      /bound\s+implementation\s+identity\s+is\s+SHA-256\s+of\s+compact\s+JCS\s+over\s+sorted[\s\S]{0,40}affected_paths[\s\S]{0,20}entries/i,
      `${relative} must define the implementation identity digest formula`,
    );
    assert.match(
      body,
      /each\s+entry\s+binds[\s\S]{0,80}repo-relative\s+path[\s\S]{0,80}Git\s+kind\/mode[\s\S]{0,80}blob\s+SHA-256[\s\S]{0,80}tombstone\s+for\s+absence/i,
      `${relative} must bind path, Git identity, bytes, and absence`,
    );
    assert.match(
      body,
      /exclude\s+the\s+plan\/orchestration\s+path\s+unless\s+it\s+is\s+itself\s+an\s+affected\s+implementation\s+path/i,
      `${relative} must exclude plan-only paths from implementation identity`,
    );
    assert.match(
      body,
      /before\s+reuse,\s+recompute\s+and\s+require\s+exact\s+digest\s+equality/i,
      `${relative} must recompute implementation identity before reuse`,
    );
    assert.match(
      body,
      /plan-only\s+metadata\s+or\s+orchestration\s+commit\s+preserves\s+the\s+digest/i,
      `${relative} must preserve identity across plan-only commits`,
    );
    assert.match(
      body,
      /affected-path\s+byte,\s+mode,\s+kind,\s+or\s+presence\s+change\s+invalidates\s+it[\s\S]{0,100}fresh\s+full\s+project\s+CI\s+and\s+acceptance\s+evidence/i,
      `${relative} must invalidate identity on byte/mode/kind/presence changes`,
    );
    assert.match(
      body,
      /does\s+not\s+change\s+closed\s+review-policy\s+schemas/i,
      `${relative} must keep implementation identity outside closed policy schemas`,
    );
    assert.match(
      body,
      /completion\s+consumes\s+and\s+validates\s+the\s+bound\s+green\s+project-CI\s+evidence\s+when\s+the\s+affected-path\s+digest\s+is\s+unchanged/i,
      `${relative} must consume eligible bound CI evidence at completion`,
    );
    assert.match(
      body,
      /disposable\s+helper\s+runs\s+project\s+CI\s+only\s+when\s+no\s+eligible\s+bound\s+result\s+exists\s+or\s+the\s+digest\s+changed/i,
      `${relative} must condition disposable CI on missing or changed evidence`,
    );
    assert.match(
      body,
      /must\s+not\s+rerun\s+merely\s+because\s+completion\s+review\s+began/i,
      `${relative} must not rerun project CI merely for completion review`,
    );
    assert.match(
      body,
      /acceptance\s+rows\s+still\s+run\s+once\s+as\s+required/i,
      `${relative} must retain one required acceptance-row run`,
    );
    assert.match(body, /machine-family\s+validation/i, `${relative} must retain per-commit machine-family validation`);
    assert.match(
      body,
      /(?:machine-family\s+validation[\s\S]{0,180}(?:plan\s+)?read-back|(?:plan\s+)?read-back[\s\S]{0,180}machine-family\s+validation)/i,
      `${relative} must pair machine-family validation with plan read-back`,
    );
    assert.match(
      body,
      /CI\s+evidence\s+reuse\s+is\s+the\s+churn\/performance\s+fix/i,
      `${relative} must identify evidence reuse as the churn fix`,
    );
    assert.match(
      body,
      /(?:machine-family\s+validation[\s\S]{0,180}(?:plan\s+)?read-back[\s\S]{0,120}(?:after|for)\s+every\s+plan-only\s+commit|every\s+plan-only\s+commit[\s\S]{0,120}machine-family\s+validation[\s\S]{0,180}(?:plan\s+)?read-back)/i,
      `${relative} must validate and read back every plan-only commit`,
    );
    assert.match(
      body,
      /never\s+collapses\s+authorization\s+commits/i,
      `${relative} must not collapse authorization commits for performance`,
    );
    assert.match(
      body,
      /active-state,\s+prepared-request,\s+and\s+dispatch-commitment\s+commits\s+MUST\s+remain\s+separate/i,
      `${relative} must preserve all three separate authorization commits`,
    );
    assert.match(
      body,
      /each\s+later\s+artifact\s+is\s+derived\s+only\s+after\s+committed\s+read-back\s+of\s+its\s+predecessor/i,
      `${relative} must derive each artifact only after predecessor read-back`,
    );
    assert.match(
      body,
      /combining\s+them\s+atomically\s+is\s+forbidden/i,
      `${relative} must forbid atomic authorization-commit combination`,
    );
    assert.match(
      body,
      /active\s+plan[\s\S]{0,80}chang(?:es?|ing)[\s\S]{0,100}canonical\s+review\s+controller[\s\S]{0,120}(?:plan-)?manager[\s\S]{0,120}(?:plan-)?reviewer[\s\S]{0,120}(?:use|used)[\s\S]{0,80}(?:its\s+)?own\s+completion/i,
      `${relative} must scope self-dispatch failure to a plan changing its own controller`,
    );
    assert.match(
      body,
      /(?:same-checkout[\s-]+self-dispatch\s+is\s+forbidden|must\s+not\s+be\s+same-checkout[\s-]+self-dispatched|cannot\s+be\s+same-checkout[\s-]+self-dispatched)/i,
      `${relative} must forbid same-checkout controller self-dispatch`,
    );
    assert.match(
      body,
      /(?:same-checkout[\s-]+self-dispatch\s+is\s+forbidden|must\s+not\s+be\s+same-checkout[\s-]+self-dispatched|cannot\s+be\s+same-checkout[\s-]+self-dispatched)[\s\S]{0,160}NeedsUserAction/i,
      `${relative} must fail closed from self-dispatch into NeedsUserAction`,
    );
    assert.match(
      body,
      /(?:released\s+or\s+pinned[\s\S]{0,80}bootstrap\s+reviewer|bootstrap\s+reviewer[\s\S]{0,80}released\s+or\s+pinned)/i,
      `${relative} must require a released or pinned bootstrap reviewer`,
    );
    assert.match(
      body,
      /bootstrap\s+reviewer[\s\S]{0,100}or\s+(?:waits\s+for\s+)?a\s+later\s+fresh\s+session/i,
      `${relative} must permit only bootstrap review or a later fresh session`,
    );
    assert.match(
      body,
      /independent\s+trusted[\s\S]{0,100}released\s+or\s+pinned[\s\S]{0,80}bootstrap\s+reviewer/i,
      `${relative} must require an independent trusted bootstrap reviewer`,
    );
    assert.match(
      body,
      /never\s+repair,\s+reseal,\s+or\s+replace[\s\S]{0,80}orchestration\s+in place/i,
      `${relative} must forbid in-place orchestration repair or resealing`,
    );
    assert.match(body, /stopped.{0,40}stuck/is, `${relative} must preserve stopped and stuck terminal states`);
    assert.match(
      body,
      /attempt-2 failure.{0,100}NeedsUserAction/is,
      `${relative} must return attempt-2 failure as NeedsUserAction`,
    );
    assert.match(
      body,
      /without\s+automatic\s+reprepare\s+or\s+retry/i,
      `${relative} must forbid automatic terminal reprepare or retry`,
    );
  }
}

function runCodexFacts(scriptRoot) {
  return spawnSync(process.execPath, [path.join(scriptRoot, 'scripts/skills/codex-facts.mjs')], {
    cwd: scriptRoot,
    encoding: 'utf8',
  });
}

function assertRetainedCodexFactMutation() {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'docks-plan-skill-phases-'));
  try {
    const guardDestination = path.join(temporaryRoot, 'scripts/skills/codex-facts.mjs');
    const pipelineDestination = path.join(temporaryRoot, 'plugins/docks/skills/productivity/skill-agent-pipeline');
    fs.mkdirSync(path.dirname(guardDestination), { recursive: true });
    fs.mkdirSync(path.dirname(pipelineDestination), { recursive: true });
    fs.copyFileSync(path.join(ROOT, 'scripts/skills/codex-facts.mjs'), guardDestination);
    fs.cpSync(path.join(PRODUCTIVITY, 'skill-agent-pipeline'), pipelineDestination, { recursive: true });

    const baseline = runCodexFacts(temporaryRoot);
    assert.equal(baseline.status, 0, `${baseline.stdout}\n${baseline.stderr}`);
    assert.match(baseline.stdout, /Guard PASSED/);

    const factFile = path.join(pipelineDestination, 'references/codex-agents-builder.md');
    const original = fs.readFileSync(factFile, 'utf8');
    assert.match(original, /"minimal"/, 'retained effort token fixture');
    fs.writeFileSync(factFile, original.replace('"minimal"', '"mutated-minimal"'));
    const mutant = runCodexFacts(temporaryRoot);
    assert.notEqual(mutant.status, 0, 'corrupting a retained effort token must make codex-facts fail');
    assert.match(mutant.stderr, /missing model_reasoning_effort value "minimal"/);

    fs.writeFileSync(factFile, original);
    const restored = runCodexFacts(temporaryRoot);
    assert.equal(restored.status, 0, `${restored.stdout}\n${restored.stderr}`);
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }

  const realGuard = runCodexFacts(ROOT);
  assert.equal(realGuard.status, 0, `${realGuard.stdout}\n${realGuard.stderr}`);
  assert.match(realGuard.stdout, /Guard PASSED: skill-agent-pipeline Codex facts match canonical sets/);
}

function assertHistoricalNamesRemainHistorical() {
  const oldWorkflow = readFrontmatter(path.join(ROOT, 'docs/plans/finished/2026-05-12-plan-review-smoke.md'));
  assert.equal(oldWorkflow.metadata.status, 'finished');
  assert.match(oldWorkflow.body, /\bplan-init\b/);
  assert.match(oldWorkflow.body, /\bplan-review\b/);

  const retiredCapability = readFrontmatter(
    path.join(ROOT, 'docs/plans/finished/2026-06-10-capability-tuning-research-rollout.md'),
  );
  assert.equal(retiredCapability.metadata.status, 'finished');
  assert.match(retiredCapability.body, /capability-tuning/i);
}

function resolveCatalogRoots() {
  const claude = JSON.parse(fs.readFileSync(path.join(ROOT, '.claude-plugin/marketplace.json'), 'utf8'));
  const codex = JSON.parse(fs.readFileSync(path.join(ROOT, '.agents/plugins/marketplace.json'), 'utf8'));
  const claudeEntry = claude.plugins.find(({ name }) => name === 'docks');
  const codexEntry = codex.plugins.find(({ name }) => name === 'docks');
  assert.ok(claudeEntry && codexEntry, 'both installed catalogs must expose docks');
  assert.equal(codexEntry.source.source, 'local');
  const claudeRoot = path.resolve(ROOT, claudeEntry.source);
  const codexRoot = path.resolve(ROOT, codexEntry.source.path);
  assert.equal(claudeRoot, codexRoot, 'Claude and Codex catalogs must resolve the same plugin payload');
  return { claudeEntry, claudeRoot, codexRoot };
}

function assertInstalledCatalogs(version) {
  const { claudeEntry, claudeRoot, codexRoot } = resolveCatalogRoots();
  assert.equal(claudeEntry.version, version);
  assert.equal(
    JSON.parse(fs.readFileSync(path.join(claudeRoot, '.claude-plugin/plugin.json'), 'utf8')).version,
    version,
  );
  assert.equal(JSON.parse(fs.readFileSync(path.join(codexRoot, '.codex-plugin/plugin.json'), 'utf8')).version, version);

  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'docks-installed-catalogs-'));
  try {
    for (const [catalog, source] of [
      ['claude', claudeRoot],
      ['codex', codexRoot],
    ]) {
      const installed = path.join(temporaryRoot, catalog, 'docks');
      fs.mkdirSync(path.dirname(installed), { recursive: true });
      fs.cpSync(source, installed, { recursive: true });
      assertPhaseMetadata(path.join(installed, 'skills/productivity'));
    }
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
}

function assertResumedReleasePlan() {
  const active = path.join(ROOT, 'docs/plans/active/session-relay-prebuilt-cli-release.md');
  const finishedRoot = path.join(ROOT, 'docs/plans/finished');
  const archived = fs
    .readdirSync(finishedRoot)
    .filter((name) => /^\d{4}-\d{2}-\d{2}-session-relay-prebuilt-cli-release\.md$/.test(name));
  assert.equal(fs.existsSync(active), false, 'resumed release plan must no longer resolve in active/');
  assert.equal(archived.length, 1, 'resumed release plan must have one unique ship-date archive');

  const plan = readFrontmatter(path.join(finishedRoot, archived[0]));
  assert.equal(plan.metadata.status, 'finished');
  assert.equal(plan.metadata.review_status, 'passed');
  const rows = [...plan.body.matchAll(/^\|\s*([1-7])\s*\|.*$/gm)].map((match) =>
    match[0]
      .split('|')
      .slice(1, -1)
      .map((cell) => cell.trim()),
  );
  assert.deepEqual(
    rows.map((row) => [row[0], row[4]]),
    [
      ['1', 'done'],
      ['2', 'done'],
      ['3', 'done'],
      ['4', 'done'],
      ['5', 'done'],
      ['6', 'done'],
      ['7', 'done'],
    ],
    'all seven release steps must remain done',
  );

  const receipts = [...plan.body.matchAll(/^Review-receipt:\s*(\{.*\})$/gm)].map((match) => JSON.parse(match[1]));
  const completion = receipts.find((receipt) => receipt.phase === 'completion' && receipt.policy?.schema === 6);
  assert.ok(completion, 'archived release plan must retain one schema-6 completion receipt');
  assert.equal(completion.outcome, 'passed');
}

const invocation = parseArgs(process.argv.slice(2));
if (invocation.caseName === 'installed-catalogs') {
  assertInstalledCatalogs(invocation.version);
  console.log(`installed Claude/Codex catalogs expose the five plan phases at ${invocation.version}`);
} else if (invocation.caseName === 'resumed-release-plan') {
  assertResumedReleasePlan();
  console.log('resumed Session Relay release plan archive passed');
} else {
  assertPhaseMetadata();
  assertWrappers();
  assertScaffoldContract();
  assertAuthorCheckKey();
  assertCatalogMetadata();
  assertControllerRecoveryOwnership();
  assertReviewLoopPolicy();
  assertRetainedCodexFactMutation();
  assertHistoricalNamesRemainHistorical();
  console.log('plan skill phase, wrapper, scaffold, guard, and history contracts passed');
}
