#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { registerExternalAuthority } from './plan-orchestration/external-authority.mjs';
import { FocusedSuite } from './plan-orchestration/harness.mjs';
import { registerHashingAndManifest } from './plan-orchestration/hashing-manifests.mjs';
import { registerHistoricalCharacterization } from './plan-orchestration/historical-characterization.mjs';
import { registerLegacyQuarantine } from './plan-orchestration/legacy-quarantine.mjs';
import { registerLocksAndCas } from './plan-orchestration/locks-cas.mjs';
import { registerMutations } from './plan-orchestration/mutations.mjs';
import { registerPlanSelfCheck } from './plan-orchestration/plan-self-check.mjs';
import { registerReviewBudget } from './plan-orchestration/review-budget.mjs';
import { registerStateMatrix } from './plan-orchestration/state-matrix.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PLAN_RUN_PATH = path.join(ROOT, 'plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/plan-run.mjs');
const REVIEW_POLICY_PATH = path.join(
  ROOT,
  'plugins/plan-lifecycle/skills/productivity/plan-reviewer/scripts/review-policy.mjs',
);
const LEGACY_POLICY_PATH = path.join(
  ROOT,
  'plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/legacy-review-records.mjs',
);
const PLAN_SELF_CHECK_PATH = path.join(
  ROOT,
  'plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/lifecycle/plan-self-check.mjs',
);

// Registered inline rather than as a sibling module: the dispatch-driver plan
// declares `scripts/tests/plan-orchestration.mjs` as its registration site, and
// `affected_paths` freezes when a run leaves `drafting`, so a new file here would
// fall outside the path set the run binds.
//
// Each probe owns its fixtures - a disposable plan in a disposable repository -
// so a case costs one child process and touches no real run's permits. They run
// inside the gate rather than beside it, which is what keeps the driver's guards
// regression-protected instead of hand-checked.
const DISPATCH_PROBES = [
  ['crash-refund', 'every catchable signal refunds the permit'],
  ['sigkill-control', 'SIGKILL leaves a bare reserved, keeping crash-refund honest'],
  ['stale-preimage', 'the reserve binds the bytes it sealed'],
  ['head-drift', 'HEAD moving inside the dispatch window refunds'],
  ['dry-run', 'a dry run reserves nothing and reports the sealed digest'],
  ['settle-binding', 'pass settles, repair is withheld, invalid input is terminal'],
  ['retry-block', 'a second transport failure blocks or degrades by risk'],
  // The four repair cases. Registered here so the gate runs them rather than
  // trusting a hand-run; each fails when its defect is re-introduced into a copy.
  ['preflight-before-reserve', 'the route and raw-stdout target are proven before a permit is at stake'],
  ['invalid-input-verbatim', 'a malformed invalid-input reply refunds instead of settling terminally'],
  ['dirty-drift', 'uncommitted affected-path drift refunds with HEAD unmoved'],
  ['stdout-persistence', 'the complete reviewer stdout is persisted byte-for-byte before interpretation'],
  ['repair-reserve', 'a repair reservation needs only changed input bytes, which the reducer refuses to replay'],
  ['candidate-scope', 'the sealed manifest follows the --body candidate scope, not the on-disk frontmatter'],
];

const EVIDENCE_PROBES = [
  ['command-drift', 'each proof key drifts independently and recorded commands remain inert'],
  ['stale-quantity', 'committed quantities enforce while snapshots only report'],
  ['injected-defect', 'scripted samples aggregate by fixed bundle digest and K floor'],
  ['excluded-section', 'Proposed repair is excluded without weakening blocked immutability'],
  ['paired-clause', 'both lifecycle contracts carry the Proposed repair clause'],
  ['proof-writer', 'proofs are minted only through the bound completion reservation'],
  ['status-mode', 'drafting enforces while every immutable status only counts'],
  ['r7-finished', 'finished plans report unresolved producer paths without blocking'],
  ['rules-archive', 'structural rules report recursively over the archive without blocking'],
  ['unreachable-base', 'an unreachable source_base is named rather than read as producer drift'],
];

function registerEvidenceProbes(target) {
  const probeFile = path.join(ROOT, 'scripts/tests/plan-evidence-probes.mjs');
  for (const [probe, claim] of EVIDENCE_PROBES) {
    target.test('evidence-probes', `${probe}: ${claim}`, () => {
      const result = spawnSync(process.execPath, [probeFile, probe], {
        cwd: ROOT,
        encoding: 'utf8',
        timeout: 300_000,
      });
      assert.equal(result.error, undefined, `${probe} failed to start`);
      assert.equal(result.signal, null, `${probe} was signalled`);
      assert.equal(result.status, 0, `${probe} failed:\n${result.stdout ?? ''}${result.stderr ?? ''}`);
    });
  }
}

// A FROZEN snapshot, never the live plan. Every read below mutates these bytes and asserts a
// rule fires on the result, so the source must be a fixture the lifecycle cannot move. Pointing
// this at `docs/plans/active/` coupled the suite to a plan body that drafting rewrites and
// lifecycle transitions edit: `replaceMutation` hard-asserts `text.includes(before)`, so a
// routine plan edit that dropped an anchored sentence turned this suite red with no code change.
// Refresh the fixture deliberately when a rule's construct changes; never point it back.
const STRUCTURAL_PLAN = path.join(ROOT, 'scripts/tests/fixtures/structural-plan.md');

function replaceMutation(text, before, after, label) {
  assert.notEqual(before, after, `${label}: mutation left the requested bytes unchanged`);
  assert.ok(text.includes(before), `${label}: mutation target is absent`);
  const changed = text.replace(before, after);
  assert.notEqual(changed, text, `${label}: mutation left the plan bytes unchanged`);
  return changed;
}

/**
 * Rewrite the frontmatter status line, anchored. Naming the literal `status: ongoing` coupled this
 * fixture to the LIVE plan's transient lifecycle state: when that plan moved to `blocked` the
 * target vanished and a green suite turned red with no code change. Matching a bare substring is
 * no better, because a plan body may legitimately contain `status: finished` in prose. The
 * invariant is "exactly one frontmatter status line", so that is what is asserted.
 */
function setFrontmatterStatus(text, status, label) {
  const hits = text.match(/^status: \S+[ \t]*$/gm) ?? [];
  assert.equal(hits.length, 1, `${label}: expected exactly one frontmatter status line, found ${hits.length}`);
  const changed = text.replace(/^status: \S+[ \t]*$/m, `status: ${status}`);
  assert.notEqual(changed, text, `${label}: status rewrite left the plan bytes unchanged`);
  return changed;
}

function mutateRow(text, prefix, operation, label) {
  const lines = text.split('\n');
  const index = lines.findIndex((line) => line.startsWith(prefix));
  assert.notEqual(index, -1, `${label}: row is absent`);
  const changed = operation(lines[index]);
  assert.notEqual(changed, lines[index], `${label}: mutation left the row unchanged`);
  lines[index] = changed;
  return lines.join('\n');
}

function swapRows(text, leftPrefix, rightPrefix, label) {
  const lines = text.split('\n');
  const left = lines.findIndex((line) => line.startsWith(leftPrefix));
  const right = lines.findIndex((line) => line.startsWith(rightPrefix));
  assert.notEqual(left, -1, `${label}: left row is absent`);
  assert.notEqual(right, -1, `${label}: right row is absent`);
  [lines[left], lines[right]] = [lines[right], lines[left]];
  const changed = lines.join('\n');
  assert.notEqual(changed, text, `${label}: row swap left the plan bytes unchanged`);
  return changed;
}

const STRUCTURAL_RULE_PROBES = [
  [
    'R1',
    'quoted enforced-quantity label is missing',
    (text) =>
      replaceMutation(
        text,
        '\n## Steps\n',
        '\ncommitted-producer row "missing enforced quantity" must remain bound.\n\n## Steps\n',
        'R1',
      ),
  ],
  [
    'R2',
    'acceptance command is neither runnable nor a declared observable',
    (text) =>
      mutateRow(
        text,
        '| A1 |',
        (row) =>
          row.replace(
            '`node scripts/tests/plan-evidence-probes.mjs command-drift`',
            'node scripts/tests/plan-evidence-probes.mjs command-drift',
          ),
        'R2',
      ),
  ],
  [
    'R3',
    'enforced quantity has no one-to-one producer',
    (text) =>
      replaceMutation(
        text,
        '|lines declaring `EXCLUDED_SECTIONS`|1|',
        '|lines declaring `EXCLUDED_SECTIONS`|1|\n|second enforced quantity|1|',
        'R3',
      ),
  ],
  [
    'R4',
    'template placeholder remains unsubstituted',
    (text) =>
      replaceMutation(
        text,
        '# Bind plan evidence to the bytes that produced it at row, sample and measurement scale',
        '# Bind plan evidence to the bytes that produced it at row, sample and measurement scale\n\n__UPDATED__',
        'R4',
      ),
  ],
  [
    'R5',
    'producer base is a commit literal',
    (text) => mutateRow(text, 'B="$(sed ', () => `B=${'a'.repeat(40)}`, 'R5'),
  ],
  [
    'R6',
    'prose references a missing acceptance id',
    (text) => replaceMutation(text, '\n## Steps\n', '\nA99 must remain green.\n\n## Steps\n', 'R6'),
  ],
  [
    'R7',
    'producer reference points at an unresolved active plan',
    (text) =>
      replaceMutation(
        text,
        'git show "$B":plugins/docks/skills/productivity/plan-manager/scripts/plan-run.mjs',
        'git show "$B":docs/plans/active/unresolved-producer-plan.md',
        'R7',
      ),
  ],
  [
    'R8',
    'producer cites an underived shell variable',
    (text) => replaceMutation(text, 'git show "$B":plugins/', 'git show "$UNBOUND":plugins/', 'R8'),
  ],
  [
    'R9',
    'binds table omits an acceptance row',
    (text) => replaceMutation(text, 'A8, A9, A10, A11|', 'A8, A9, A10|', 'R9'),
  ],
  [
    'R10',
    'prose references a missing step',
    (text) => replaceMutation(text, '\n## Steps\n', '\nstep 99 must run first.\n\n## Steps\n', 'R10'),
  ],
  [
    'R11',
    'prose names an absent binds value',
    (text) => replaceMutation(text, '\n## Steps\n', '\nbinds: signal\n\n## Steps\n', 'R11'),
  ],
  [
    'R12',
    'acceptance command uses a subcommand no step names',
    (text) => mutateRow(text, '| A1 |', (row) => row.replace('command-drift`', 'command-drift-unknown`'), 'R12'),
  ],
  [
    'R13',
    'producer plan path differs from Plan-run',
    (text) =>
      replaceMutation(
        text,
        // Anchor tracks the fixture: its producer base is the ARCHIVED path, which agrees with the
        // fixture's own plan_path so R13 is silent at rest. The mutation repoints it at a different
        // archived plan, which is the disagreement R13 exists to catch.
        'P=docs/plans/finished/2026-07-31-plan-evidence-row-scales.md',
        'P=docs/plans/finished/2026-07-30-plan-dispatch-driver.md',
        'R13',
      ),
  ],
  [
    'R14',
    'repository id is a local filesystem path',
    (text) =>
      replaceMutation(
        text,
        '"repository_id":"DocksDocks/docks"',
        '"repository_id":"/home/vagrant/projects/docks"',
        'R14',
      ),
  ],
  [
    'R15',
    'step number word disagrees with named subcommands',
    (text) =>
      replaceMutation(
        text,
        'Ship the eighteen structural rules as a `rules` subcommand',
        'Ship two subcommands `rules`',
        'R15',
      ),
  ],
  ['R16', 'Steps rows are out of order', (text) => swapRows(text, '| 1 |', '| 2 |', 'R16')],
  ['R17', 'acceptance ids are out of order', (text) => swapRows(text, '| A1 |', '| A2 |', 'R17')],
  [
    'R18',
    'acceptance row names an unknown step',
    (text) => mutateRow(text, '| A1 |', (row) => row.replace('| A1 | 1 |', '| A1 | 99 |'), 'R18'),
  ],
];

const structuralFixture = (body) => {
  let inSteps = false;
  let expectSeparator = false;
  let stepIndex = 0;
  const normalized = body
    .trim()
    .split('\n')
    .map((line) => {
      if (/^##\s+/.test(line)) inSteps = /^## Steps\s*$/.test(line);
      if (!inSteps) return line;
      if (/^\|\s*#\s*\|/.test(line)) {
        expectSeparator = true;
        return line.replace(/^(\|\s*#\s*\|)/, '$1 Id |');
      }
      if (expectSeparator && /^\|\s*:?-+:?\s*\|/.test(line)) {
        expectSeparator = false;
        return line.replace(/^(\|\s*:?-+:?\s*\|)/, '$1---|');
      }
      return line.replace(/^(\|\s*(\d{1,3})\s*\|)/, (match, prefix) => `${prefix} step_${++stepIndex} |`);
    })
    .join('\n');
  return `---
status: drafting
---
${normalized}
`;
};

const STRUCTURAL_WIDER_REGRESSIONS = [
  [
    'R1',
    structuralFixture(`
# Scratch
## Measurement {measurement:committed}
git status
| Enforced quantity | Count |
|---|---|
|present|1|
| note | text |
|---|---|
| x | committed-producer row "missing" |
`),
  ],
  [
    'R2',
    structuralFixture(`
# Scratch
## Acceptance criteria
| ID | command | expected |
|---|---|---|
| A1 | \`not a runnable command\` | |
`),
  ],
  [
    'R3',
    structuralFixture(`
# Scratch
## Measurement {measurement:committed}
A producer runs this command:
\`\`\`sh
git diff
\`\`\`
The actual producer command is shown inline as a prose example: \`git status\`.
git status
| Enforced quantity | Count |
|---|---|
|one|1|
`),
  ],
  [
    'R5',
    structuralFixture(`
# Scratch
## Measurement {measurement:committed}
git status
| Enforced quantity | Count |
|---|---|
|one|1|
The checksum 0123456789abcdef0123456789abcdef01234567 is documented here.
`),
  ],
  [
    'R6',
    structuralFixture(`
# Scratch
## Acceptance criteria
| ID | command | expected |
|---|---|---|
| A1 | \`echo ok\` | ok |
\`\`\`text
A99
\`\`\`
`),
  ],
  [
    'R7',
    structuralFixture(`
# Goal
Rationale cites docs/plans/active/rationale.md.
## Acceptance criteria
| ID | Step | Command | Expected |
|---|---:|---|---|
| A1 | 1 | \`docs/plans/active/acceptance.md\` | ok |
## Steps
| # | Task | Files |
|---:|---|---|
| 1 | use docs/plans/active/files.md | \`docs/plans/active/files-column.md\` |
## Measured {measurement:committed}
Producer cites docs/plans/active/producer.md.
\`\`\`
docs/plans/active/fenced.md
\`\`\`
Foreign URL https://github.com/foo/bar/docs/plans/active/foreign.md
Foreign citation foo/bar:docs/plans/active/colon.md
`),
  ],
  [
    'R10',
    structuralFixture(`
# Goal
x
## Steps
| # | Task | Files |
|---:|---|---|
| 1 | step 99 is not prose | \`x\` |
## Acceptance criteria
| ID | Step | Command | Expected |
|---|---:|---|---|
| A1 | 1 | \`node tool.mjs known\` | ok |
`),
  ],
  [
    'R11',
    structuralFixture(`
# Goal
x
## Binds
| binds | rows |
|---|---|
| known | A1 |
## Context
\`\`\`
binds: absent
\`\`\`
## Steps
| # | Task | Files |
|---:|---|---|
| 1 | known | \`x\` |
## Acceptance criteria
| ID | Step | Command | Expected |
|---|---:|---|---|
| A1 | 1 | \`node tool.mjs known\` | ok |
`),
  ],
  [
    'R13',
    structuralFixture(`
Plan-run: {"plan_path":"docs/plans/active/plan-evidence-row-scales.md","repository_id":"owner/repo"}
## Context & rationale
P=docs/plans/finished/foreign.md
## Steps
| # | Task |
|---|---|
| 1 | Do work |
## Acceptance criteria
| ID | Step |
|---|---|
| A1 | 1 |
`),
  ],
  [
    'R15',
    structuralFixture(`
## Steps
| # | Task |
|---|---|
| 1 | Run two probes \`alpha-beta\` |
## Acceptance criteria
| ID | Step |
|---|---|
| A1 | 1 |
`),
  ],
];

const STRUCTURAL_NARROWER_REGRESSIONS = [
  [
    'R8',
    structuralFixture(`
# Goal
x
## Measured {measurement:snapshot}
Producer command cites \`$UNBOUND\` but never derives it.
## Steps
| # | Task | Files |
|---:|---|---|
| 1 | known | \`x\` |
## Acceptance criteria
| ID | Step | Command | Expected |
|---|---:|---|---|
| A1 | 1 | \`node tool.mjs known\` | ok |
`),
  ],
  [
    'R12',
    structuralFixture(`
# Goal
x
## Steps
| # | Task | Files |
|---:|---|---|
| 1 | known | \`x\` |
## Acceptance criteria
| ID | Step | Command | Expected |
|---|---:|---|---|
| A1 | 1 | \`node tool.js unknown\` | ok |
`),
  ],
  [
    'R15',
    structuralFixture(`
## Steps
| # | Task |
|---|---|
| 1 | Run one subcommand alpha and beta |
## Acceptance criteria
| ID | Step |
|---|---|
| A1 | 1 |
`),
  ],
  [
    'R16',
    structuralFixture(`
## Steps
| # | Task |
|---|---|
| 1 | first |
### Nested details
| # | Task |
|---|---|
| 2 | second |
| 1 | out of order |
## Acceptance criteria
| ID | Step |
|---|---|
| A1 | 1 |
`),
  ],
];

function runRules(file) {
  const result = spawnSync(process.execPath, [PLAN_SELF_CHECK_PATH, 'rules', file], {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: 120_000,
  });
  assert.equal(result.error, undefined, 'rules subcommand failed to start');
  assert.equal(result.signal, null, 'rules subcommand was signalled');
  return { ...result, output: `${result.stdout ?? ''}${result.stderr ?? ''}` };
}

function withRuleScratch(rule, planText, operation) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `docks-rule-${rule}-`));
  try {
    const file = path.join(root, `${rule}.md`);
    fs.writeFileSync(file, planText);
    return operation(file);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function registerStructuralRuleProbes(target, selfCheck) {
  for (const [rule, claim, mutate] of STRUCTURAL_RULE_PROBES) {
    target.test('structural-rules', `${rule}: ${claim}`, () => {
      const source = fs.readFileSync(STRUCTURAL_PLAN, 'utf8');
      const changed = mutate(source);
      assert.notEqual(changed, source, `${rule}: mutation must change bytes`);
      const direct = selfCheck.structuralPlanRules(changed).map((finding) => finding.rule);
      assert.deepEqual([...new Set(direct)], [rule], `${rule}: unfiltered run must name exactly its own rule`);

      const withoutRule = selfCheck.STRUCTURAL_RULES.filter((candidate) => candidate.id !== rule);
      assert.deepEqual(
        selfCheck.structuralPlanRules(changed, withoutRule),
        [],
        `${rule}: deleting its rule must leave no failure`,
      );
      withRuleScratch(rule, changed, (file) => {
        const child = runRules(file);
        assert.equal(child.status, 0, `${rule}: ongoing mode must count without blocking:\n${child.output}`);
        assert.deepEqual(
          [...child.output.matchAll(/^(R\d+) fail /gm)].map((match) => match[1]),
          [rule],
          `${rule}: CLI must name exactly its own rule`,
        );
      });
    });
  }

  for (const [rule, fixture] of STRUCTURAL_WIDER_REGRESSIONS) {
    target.test('structural-rules', `${rule}: forbidden context stays silent`, () => {
      const findings = selfCheck.structuralPlanRules(fixture);
      assert.ok(
        findings.every((finding) => finding.rule !== rule),
        `${rule}: forbidden context must not fire:\n${JSON.stringify(findings, null, 2)}`,
      );
    });
  }

  for (const [rule, fixture] of STRUCTURAL_NARROWER_REGRESSIONS) {
    target.test('structural-rules', `${rule}: formerly missed construct fires alone`, () => {
      assert.deepEqual(
        selfCheck.structuralPlanRules(fixture).map((finding) => finding.rule),
        [rule],
        `${rule}: repaired narrower gap must name exactly its own rule`,
      );
    });
  }

  target.test('structural-rules', 'R7 producer foreign and archived citations remain exempt', () => {
    const fixture = structuralFixture(`
## Measured {measurement:snapshot}
Producer.
\`\`\`sh
node tool.mjs foo/bar:docs/plans/active/foreign.md https://example.test/docs/plans/active/url.md docs/plans/finished/archived.md
\`\`\`
`);
    assert.ok(
      selfCheck.structuralPlanRules(fixture).every((finding) => finding.rule !== 'R7'),
      'foreign-repository, URL, and archived producer citations must remain exempt',
    );
  });

  target.test('structural-rules', 'unchanged-byte mutation is rejected', () => {
    const source = fs.readFileSync(STRUCTURAL_PLAN, 'utf8');
    assert.throws(
      () => replaceMutation(source, 'status: ongoing', 'status: ongoing', 'inert mutation'),
      /mutation left the requested bytes unchanged/,
    );
  });

  target.test('structural-rules', 'drafting enforces and planned only counts', () => {
    const source = fs.readFileSync(STRUCTURAL_PLAN, 'utf8');
    const changed = STRUCTURAL_RULE_PROBES.find(([rule]) => rule === 'R4')[2](source);
    for (const [status, expected] of [
      ['drafting', 1],
      ['planned', 0],
    ]) {
      const fixture = setFrontmatterStatus(changed, status, `mode ${status}`);
      withRuleScratch(status, fixture, (file) => {
        const child = runRules(file);
        assert.equal(child.status, expected, `${status}: unexpected rules exit:\n${child.output}`);
        assert.match(child.output, new RegExp(`RULES ${selfCheck.statusMode(status)} 18 checked, 1 finding`));
        assert.match(child.output, /^R4 fail /m);
      });
    }
  });

  target.test('structural-rules', 'scan scope and Step-column absence are exact', () => {
    const source = fs.readFileSync(STRUCTURAL_PLAN, 'utf8');
    const afterReview = replaceMutation(
      source,
      '\n## Review\n',
      '\n## Review\n\n__IGNORED_AFTER_REVIEW__\n',
      'review scope',
    );
    assert.deepEqual(selfCheck.structuralPlanRules(afterReview), [], 'Review bytes must be excluded');
    const inRuleTable = replaceMutation(source, '`__UPDATED__`', '`__RULE_TABLE_ONLY__`', 'rule table scope');
    assert.deepEqual(selfCheck.structuralPlanRules(inRuleTable), [], 'rule-definition rows must be excluded');

    const sibling = fs.readFileSync(path.join(ROOT, 'docs/plans/finished/2026-07-30-plan-dispatch-driver.md'), 'utf8');
    assert.ok(
      selfCheck.structuralPlanRules(sibling).every((finding) => finding.rule !== 'R18'),
      'an acceptance table without a Step column must not fire R18',
    );
  });

  // Load-bearing guard against ONE recurring defect: a test anchored on a path the plan lifecycle
  // is free to move. It bit three times - a status line, the mutation-source bytes, and finally
  // the live-plan guard itself, which broke the moment its plan archived. Two rules follow, and
  // this case enforces both mechanically.
  target.test('structural-rules', 'no test anchors on a mutable plan path', () => {
    assert.ok(fs.existsSync(STRUCTURAL_PLAN), 'the frozen structural fixture must exist');
    const fixtureRelative = path.relative(ROOT, STRUCTURAL_PLAN);
    assert.ok(
      !fixtureRelative.startsWith('docs/plans/'),
      `structural fixture must live outside docs/plans/, found ${fixtureRelative}`,
    );

    // Rule 1: no module-level constant may point into docs/plans/. That is what made an archive
    // move break the suite, so it is banned outright rather than merely discouraged.
    const probeSource = fs.readFileSync(path.join(ROOT, 'scripts/tests/plan-evidence-probes.mjs'), 'utf8');
    const anchored = [...probeSource.matchAll(/^const (\w+) = path\.join\(ROOT, '(docs\/plans\/[^']+)'\);$/gm)].map(
      (match) => `${match[1]} -> ${match[2]}`,
    );
    assert.deepEqual(anchored, [], `no probe constant may name a lifecycle-managed path: ${anchored.join(', ')}`);

    // Rule 2: the frozen fixture is the sole source of mutated fixture bytes. Probes reach it
    // through one reader, so assert the reader exists, that it is the ONLY place opening the
    // fixture file, and that every consumer goes through it. Naming one call-site expression
    // instead would fail the moment a probe is added or a read is refactored, which says
    // nothing about the invariant; counting the direct opens says exactly it.
    assert.match(
      probeSource,
      /function readFixturePlan\(\) \{\n(?:.*\n)*?\s*return mutateSourceBase\(fs\.readFileSync\(FIXTURE_PLAN, 'utf8'\), head\);/,
      'one reader must own the frozen fixture and re-point its source_base',
    );
    assert.equal(
      (probeSource.match(/fs\.readFileSync\(FIXTURE_PLAN/g) ?? []).length,
      1,
      'only readFixturePlan may open the frozen fixture',
    );
    assert.ok(
      (probeSource.match(/readFixturePlan\(\)/g) ?? []).length >= 4,
      'every mutated-fixture probe must source its bytes from readFixturePlan',
    );

    // And the replacement invariant is corpus-wide rather than single-file, so it survives a plan
    // being archived, created or renamed underneath it.
    for (const required of ['function planCorpusDigest()', "'docs/plans/active', 'docs/plans/finished'"]) {
      assert.ok(probeSource.includes(required), `the live-plan guard must be corpus-wide: missing ${required}`);
    }
  });
}

function registerDispatchDriver(target) {
  const probeFile = path.join(ROOT, 'scripts/tests/plan-dispatch-probes.mjs');
  for (const [probe, claim] of DISPATCH_PROBES) {
    target.test('dispatch-driver', `${probe}: ${claim}`, () => {
      const result = spawnSync(process.execPath, [probeFile, probe], {
        cwd: ROOT,
        encoding: 'utf8',
        timeout: 300_000,
      });
      assert.equal(result.error, undefined, `${probe} failed to start`);
      assert.equal(result.signal, null, `${probe} was signalled`);
      assert.equal(result.status, 0, `${probe} failed:\n${result.stdout ?? ''}${result.stderr ?? ''}`);
    });
  }

  // A3 promises "no Relay dependency exists", and nothing observed it. Session Relay now ships
  // from its own repository, so a bare `session-relay` import would fail to resolve rather than
  // pass silently; the remaining ways to acquire one are a declared manifest entry or a path
  // specifier, and both are exactly what this check reads. The clause was an unfalsifiable
  // promise, which is the defect class this plan family exists to remove.
  //
  // It asserts a DEPENDENCY, not a mention, and the distinction is load-bearing: steps 7 and 8
  // require every normative copy to state "Session Relay is never review evidence and never a
  // required dependency", so a prose scan would make the independence clause its own violation.
  // Markdown is therefore out of scope and only a resolvable specifier or a manifest entry
  // counts. Read as bytes rather than by attempting an import, because the absence of a
  // dependency is what must be detected and a resolution failure is a weaker signal than a
  // declared entry.
  target.test('dispatch-driver', 'the plan-lifecycle payload names no Session Relay dependency', () => {
    const payload = path.join(ROOT, 'plugins/plan-lifecycle');
    const specifier = /(?:\bfrom\s*|\brequire\(\s*|\bimport\(\s*)['"`]([^'"`]*session[-_]relay[^'"`]*)['"`]/gi;
    const manifestEntry = /"[^"]*session[-_]relay[^"]*"\s*:/gi;
    const offenders = [];
    const walk = (directory) => {
      for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const absolute = path.join(directory, entry.name);
        if (entry.isDirectory()) {
          walk(absolute);
          continue;
        }
        if (!/\.(?:mjs|js|cjs|ts|json|toml)$/.test(entry.name)) continue;
        const text = fs.readFileSync(absolute, 'utf8');
        const hits = [...text.matchAll(specifier), ...text.matchAll(manifestEntry)].map((match) => match[0].trim());
        if (hits.length > 0) offenders.push(`${path.relative(ROOT, absolute)}: ${hits.join(', ')}`);
      }
    };
    walk(payload);
    assert.deepEqual(offenders, [], `plan-lifecycle must declare no Session Relay dependency: ${offenders.join('; ')}`);
  });
}

function parseGroups(argv) {
  if (argv.length === 0) return null;
  if (argv.length === 2 && argv[0] === '--case' && /^[a-z][a-z0-9-]*$/.test(argv[1])) {
    return new Set([argv[1]]);
  }
  throw new Error('usage: plan-orchestration.mjs [--case <group>]');
}

async function loadModule(file) {
  return import(pathToFileURL(file).href);
}

const selected = parseGroups(process.argv.slice(2));
const suite = new FocusedSuite();

const historicalPath = fs.existsSync(LEGACY_POLICY_PATH) ? LEGACY_POLICY_PATH : REVIEW_POLICY_PATH;
registerHistoricalCharacterization(suite, await loadModule(historicalPath), { root: ROOT });
if (!selected?.has('historical')) {
  const planRun = await loadModule(PLAN_RUN_PATH);
  const reviewer = await loadModule(REVIEW_POLICY_PATH);
  const selfCheck = await loadModule(PLAN_SELF_CHECK_PATH);
  registerStateMatrix(suite, planRun);
  registerHashingAndManifest(suite, planRun);
  registerLocksAndCas(suite, planRun, { planRunPath: PLAN_RUN_PATH });
  registerReviewBudget(suite, planRun, reviewer);
  registerExternalAuthority(suite, planRun);
  registerLegacyQuarantine(suite, planRun, { root: ROOT });
  registerMutations(suite, planRun);
  registerPlanSelfCheck(suite, selfCheck);
  registerDispatchDriver(suite);
  registerEvidenceProbes(suite);
  registerStructuralRuleProbes(suite, selfCheck);
}

const passed = await suite.run(selected);
process.stdout.write(`plan-orchestration: ${passed}/${passed} passed\n`);
