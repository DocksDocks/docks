import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { focusesForPath } from '../../../.agents/skills/review-benchmark/scripts/prepare.mjs';
import {
  blindId,
  dispatchName,
  dispatchNames,
  findingsCommand,
  main,
  namesCommand,
  pairsCommand,
  parseBlock,
  parseLocator,
  parseTranscript,
  pickTranscript,
  renderReport,
  reportCommand,
  roundVerdict,
  scoreRuns,
  summarize,
  transcriptsCommand,
} from '../../../.agents/skills/review-benchmark/scripts/score.mjs';
// The exports of plan #100 step 2 that do not exist yet. A namespace import lets this file load without them.
import * as score from '../../../.agents/skills/review-benchmark/scripts/score.mjs';

const CORRECTNESS_BLOCK = `### Code review round 1, lens correctness

Code-review: fixes-required

## Standards

- [HIGH] Bug - src/sync.mjs:40-52 - A timeout leaves the lock held, so the next run waits forever - release the lock in a finally block. class: lock leak on an error path
  - same class in src/queue.mjs:12
- [MEDIUM] Performance - \`src/cache.mjs#L7\` - The cache rebuilds its index on every call - build it once.
- [LOW] Bug - Step 3 of the plan - The new flag has no help text - add the help text.

## Spec

None.
`;
// A pass with a HIGH finding reads as fixes-required, the plan helper's severity rule.
const SPEC_BLOCK = `### Code review round 1, lens spec-and-tests

Code-review: pass

## Standards

- [HIGH] Bug - tests/sync.test.mjs:5 - The check never fails when the lock fix is reverted - assert the release.

## Spec

None.
`;
const NO_VERDICT_BLOCK = `### Code review round 1, lens text-and-safety

The review stopped before a verdict.
`;
const FULL_BLOCK = `### Code review round 1

Code-review: fixes-required

## Standards

- [HIGH] Bug - /work/ws/code-7/snapshot/src/sync.mjs:41 - The lock stays held after a timeout - release it.

## Spec

None.
`;
const PLAN_BLOCK = `### Plan review round 2

Plan-review: repair

- goal_fit - Steps 2; Acceptance a3 - The steps never deliver the export command - add a step.
- research_gap: Research (plan.md:10-14) - The cited interface was removed - cite the current interface.
`;
const PLAN_PASS_BLOCK = `### Plan review round 1

Plan-review: pass

None.
`;
const CODE_KNOWN = [
  { id: 'D1', title: 'Lock stays held after a timeout', locator: 'src/sync.mjs:41-45', severity: 'high' },
  { id: 'D2', title: 'Retry drops the last error', locator: 'src/other.mjs:3', severity: 'medium' },
  { id: 'D3', title: 'Flag has no help text', locator: 'Step 3 of the plan', severity: 'low' },
];
const PLAN_KEY = [
  { id: 'K1', title: 'Steps miss the export command', locator: 'Steps 2' },
  { id: 'K2', title: 'Research cites a removed interface', locator: 'Research (plan.md:10-14)' },
];

function scratch(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'review-benchmark-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}
function put(root, relative, content) {
  const file = path.join(root, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, typeof content === 'string' ? content : `${JSON.stringify(content, null, 2)}\n`);
}
const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));

// A workspace as prepare.mjs lays it out, with saved blocks, and the case folder it came from.
function workspace(t) {
  const root = scratch(t);
  const ws = path.join(root, 'ws');
  const cases = path.join(root, 'cases');
  const run = (caseId, arm, k, blocks) => {
    for (const [reviewer, block] of Object.entries(blocks)) {
      put(ws, `${caseId}/${arm}/run-${k}/prompts/${reviewer}.txt`, 'agent: review-bench-candidate-code\n\nReview.\n');
      if (block !== null) put(ws, `${caseId}/${arm}/run-${k}/blocks/${reviewer}.md`, block);
    }
  };
  put(ws, 'code-7/case.json', { id: 'code-7', kind: 'code', split: 'dev' });
  put(ws, 'code-7/snapshot/src/sync.mjs', 'export const lock = 1;\n');
  run('code-7', 'B0', 1, { full: FULL_BLOCK });
  run('code-7', 'C3', 1, {
    correctness: CORRECTNESS_BLOCK,
    'spec-and-tests': SPEC_BLOCK,
    'text-and-safety': NO_VERDICT_BLOCK,
  });
  run('code-7', 'C3', 2, {
    correctness: CORRECTNESS_BLOCK,
    'spec-and-tests': PLAN_PASS_BLOCK,
    'text-and-safety': null,
  });
  put(ws, 'plan-3/case.json', { id: 'plan-3', kind: 'plan', split: 'heldout' });
  run('plan-3', 'P0', 1, { plan: PLAN_BLOCK });
  put(cases, 'dev/code-7.json', { id: 'code-7', kind: 'code', split: 'dev', known: CODE_KNOWN });
  put(cases, 'heldout/plan-3.json', { id: 'plan-3', kind: 'plan', split: 'heldout' });
  put(cases, 'heldout/plan-3.key.json', { known: PLAN_KEY });
  return { ws, cases };
}

test('parses code findings with severity, category, locators, and continuation lines', () => {
  const { verdict, findings } = parseBlock(CORRECTNESS_BLOCK, 'code');
  assert.equal(verdict, 'fixes-required');
  assert.deepEqual(findings, [
    {
      type: 'code',
      severity: 'HIGH',
      category: 'Bug',
      locator: 'src/sync.mjs:40-52',
      files: [
        { file: 'src/sync.mjs', start: 40, end: 52 },
        { file: 'src/queue.mjs', start: 12, end: 12 },
      ],
      text: 'A timeout leaves the lock held, so the next run waits forever - release the lock in a finally block. class: lock leak on an error path - same class in src/queue.mjs:12',
    },
    {
      type: 'code',
      severity: 'MEDIUM',
      category: 'Performance',
      locator: '`src/cache.mjs#L7`',
      files: [{ file: 'src/cache.mjs', start: 7, end: 7 }],
      text: 'The cache rebuilds its index on every call - build it once.',
    },
    {
      type: 'code',
      severity: 'LOW',
      category: 'Bug',
      locator: 'Step 3 of the plan',
      files: [],
      text: 'The new flag has no help text - add the help text.',
    },
  ]);
});

test('parses plan findings and reads each block verdict through the plan helper', () => {
  const plan = parseBlock(PLAN_BLOCK, 'plan');
  assert.equal(plan.verdict, 'repair');
  assert.deepEqual(
    plan.findings.map(({ category, locator, files, text }) => ({ category, locator, files, text })),
    [
      {
        category: 'goal_fit',
        locator: 'Steps 2; Acceptance a3',
        files: [],
        text: 'The steps never deliver the export command - add a step.',
      },
      {
        category: 'research_gap',
        locator: 'Research (plan.md:10-14)',
        files: [{ file: 'plan.md', start: 10, end: 14 }],
        text: 'The cited interface was removed - cite the current interface.',
      },
    ],
  );
  assert.equal(parseBlock(SPEC_BLOCK, 'code').verdict, 'fixes-required');
  assert.equal(parseBlock(NO_VERDICT_BLOCK, 'code').verdict, 'unreadable');
  assert.equal(parseBlock(PLAN_PASS_BLOCK, 'code').verdict, 'unreadable');
  assert.equal(parseBlock(PLAN_PASS_BLOCK, 'plan').verdict, 'pass');
  // Blocks returned JSON-wrapped, as an object with one string field or as a JSON string, parse as the plain block.
  const passBlock = '### Code review round 1\n\nCode-review: pass\n\nNone.';
  const shapes = [
    [JSON.stringify({ review: passBlock }), 'pass', 0],
    [JSON.stringify({ report: CORRECTNESS_BLOCK }), 'fixes-required', 3],
    [JSON.stringify(passBlock), 'pass', 0],
    [JSON.stringify(CORRECTNESS_BLOCK), 'fixes-required', 3],
    [passBlock, 'pass', 0],
    [CORRECTNESS_BLOCK, 'fixes-required', 3],
  ];
  for (const [text, verdict, count] of shapes) {
    const parsed = parseBlock(text, 'code');
    assert.deepEqual([parsed.verdict, parsed.findings.length], [verdict, count], text);
  }
});

test('parseLocator reads paths, line ranges, and snapshot paths, and skips plan sections', () => {
  assert.deepEqual(parseLocator('a/b.mjs:12–30; `c/d.md#L4-L9`, e.json'), [
    { file: 'a/b.mjs', start: 12, end: 30 },
    { file: 'c/d.md', start: 4, end: 9 },
    { file: 'e.json', start: null, end: null },
  ]);
  assert.deepEqual(parseLocator('/work/ws/code-7/snapshot/src/x.mjs:3'), [{ file: 'src/x.mjs', start: 3, end: 3 }]);
  assert.deepEqual(parseLocator('./src/y.mjs:8:4.'), [{ file: 'src/y.mjs', start: 8, end: 8 }]);
  assert.deepEqual(parseLocator('Research, Decision 1; Steps 2'), []);
  assert.deepEqual(parseLocator('https://example.com/guide.md'), []);
});

test('focus diffs classify test, prose, configuration, and production paths', () => {
  assert.deepEqual(focusesForPath('scripts/tests/unit/sync.test.mjs'), ['spec-and-tests']);
  assert.deepEqual(focusesForPath('src/parser.spec.mjs'), ['spec-and-tests']);
  assert.deepEqual(focusesForPath('docs/guide.md'), ['text-and-safety']);
  assert.deepEqual(focusesForPath('tests/fixtures/sample.md'), ['spec-and-tests', 'text-and-safety']);
  assert.deepEqual(focusesForPath('scripts/config/test-contracts.json'), ['correctness', 'spec-and-tests']);
  assert.deepEqual(focusesForPath('src/sync.mjs'), ['correctness']);
});

test('findings command writes stable ids, blind ids, and every block including missing ones', (t) => {
  const { ws } = workspace(t);
  const doc = findingsCommand(ws);
  assert.deepEqual(readJson(path.join(ws, 'findings.json')), doc);
  assert.deepEqual(
    doc.blocks.map(
      (block) => `${block.case}/${block.arm}/${block.run}/${block.reviewer} ${block.verdict} ${block.findings}`,
    ),
    [
      'code-7/B0/run-1/full fixes-required 1',
      'code-7/C3/run-1/correctness fixes-required 3',
      'code-7/C3/run-1/spec-and-tests fixes-required 1',
      'code-7/C3/run-1/text-and-safety unreadable 0',
      'code-7/C3/run-2/correctness fixes-required 3',
      'code-7/C3/run-2/spec-and-tests unreadable 0',
      'code-7/C3/run-2/text-and-safety missing 0',
      'plan-3/P0/run-1/plan repair 2',
    ],
  );
  assert.deepEqual(
    doc.findings.map((finding) => finding.id),
    [
      'code-7/B0/run-1/full#1',
      'code-7/C3/run-1/correctness#1',
      'code-7/C3/run-1/correctness#2',
      'code-7/C3/run-1/correctness#3',
      'code-7/C3/run-1/spec-and-tests#1',
      'code-7/C3/run-2/correctness#1',
      'code-7/C3/run-2/correctness#2',
      'code-7/C3/run-2/correctness#3',
      'plan-3/P0/run-1/plan#1',
      'plan-3/P0/run-1/plan#2',
    ],
  );
  for (const finding of doc.findings) {
    assert.equal(finding.blind, blindId(finding.id));
    assert.match(finding.blind, /^F-[0-9a-f]{10}$/);
  }
  assert.deepEqual(doc.findings[0].files, [{ file: 'src/sync.mjs', start: 41, end: 41 }]);
  assert.deepEqual(findingsCommand(ws), doc);
});

test('pairs keep code pairs that share a file and always keep plan pairs and pairs without a file', (t) => {
  const { ws, cases } = workspace(t);
  const { findings } = findingsCommand(ws);
  const idOf = new Map(findings.map((finding) => [finding.blind, finding.id]));
  const doc = pairsCommand(ws, cases);
  assert.deepEqual(readJson(path.join(ws, 'pairs.json')), doc);
  const pairs = doc.cases.flatMap((entry) =>
    entry.runs.flatMap((run) => run.pairs.map((pair) => `${idOf.get(pair.finding)} ${pair.known}`)),
  );
  assert.deepEqual(pairs.sort(), [
    'code-7/B0/run-1/full#1 D1',
    'code-7/B0/run-1/full#1 D3',
    'code-7/C3/run-1/correctness#1 D1',
    'code-7/C3/run-1/correctness#1 D3',
    'code-7/C3/run-1/correctness#2 D3',
    'code-7/C3/run-1/correctness#3 D1',
    'code-7/C3/run-1/correctness#3 D2',
    'code-7/C3/run-1/correctness#3 D3',
    'code-7/C3/run-1/spec-and-tests#1 D3',
    'code-7/C3/run-2/correctness#1 D1',
    'code-7/C3/run-2/correctness#1 D3',
    'code-7/C3/run-2/correctness#2 D3',
    'code-7/C3/run-2/correctness#3 D1',
    'code-7/C3/run-2/correctness#3 D2',
    'code-7/C3/run-2/correctness#3 D3',
    'plan-3/P0/run-1/plan#1 K1',
    'plan-3/P0/run-1/plan#1 K2',
    'plan-3/P0/run-1/plan#2 K1',
    'plan-3/P0/run-1/plan#2 K2',
  ]);
});

test('pairs.json gives the judge every finding and the held-out key but no arm, run, or reviewer names', (t) => {
  const { ws, cases } = workspace(t);
  findingsCommand(ws);
  const doc = pairsCommand(ws, cases);
  assert.deepEqual(
    doc.cases.map((entry) => [entry.case, entry.kind, entry.known, entry.runs.length]),
    [
      ['code-7', 'code', CODE_KNOWN, 3],
      ['plan-3', 'plan', PLAN_KEY, 1],
    ],
  );
  const runs = doc.cases.flatMap((entry) => entry.runs);
  assert.equal(runs.flatMap((run) => run.findings).length, 10);
  for (const run of runs) assert.match(run.run, /^R-[0-9a-f]{8}$/);
  const raw = fs.readFileSync(path.join(ws, 'pairs.json'), 'utf8');
  for (const name of ['B0', 'C3', 'P0', 'run-', 'correctness', 'spec-and-tests', 'text-and-safety']) {
    assert.equal(raw.includes(name), false, `pairs.json contains ${name}`);
  }
});

// Three C3 runs and one B0 run of a case with three known defects, as findings.json and judgments.json give them.
function scoringFixture() {
  const blocks = [];
  const findings = [];
  const add = (arm, run, reviewer, verdict, count) => {
    blocks.push({ case: 'code-7', kind: 'code', arm, run, reviewer, verdict, findings: count });
    return Array.from({ length: count }, (_, index) => {
      const id = `code-7/${arm}/${run}/${reviewer}#${index + 1}`;
      findings.push({ id, blind: blindId(id), case: 'code-7', arm, run, reviewer, n: index + 1 });
      return blindId(id);
    });
  };
  const [r1c1] = add('C3', 'run-1', 'correctness', 'fixes-required', 1);
  const [r1s1] = add('C3', 'run-1', 'spec-and-tests', 'pass', 1);
  const [r1t1] = add('C3', 'run-1', 'text-and-safety', 'pass', 1);
  const [r2c1, r2c2] = add('C3', 'run-2', 'correctness', 'blocked', 2);
  const [r2s1, r2s2] = add('C3', 'run-2', 'spec-and-tests', 'fixes-required', 2);
  const [r2t1] = add('C3', 'run-2', 'text-and-safety', 'pass', 2);
  const [r3c1] = add('C3', 'run-3', 'correctness', 'pass', 1);
  add('C3', 'run-3', 'spec-and-tests', 'pass', 0);
  add('C3', 'run-3', 'text-and-safety', 'missing', 0);
  add('B0', 'run-1', 'full', 'pass', 0);
  const match = (finding, known, verdict) => ({ finding, known, verdict, reason: 'Same cause.' });
  const rate = (finding, rating) => ({ finding, rating, reason: 'Read the snapshot.' });
  const judgments = {
    matches: [
      match(r1c1, 'D1', 'match'),
      match(r1c1, 'D3', 'no'),
      match(r1s1, 'D2', 'match'),
      match(r1t1, 'D1', 'match'),
      match(r2c1, 'D1', 'match'),
      match(r2c1, 'D3', 'match'),
      match(r2c2, 'D2', 'match'),
      match(r2s1, 'D2', 'no'),
      match(r3c1, 'D1', 'unknown'),
    ],
    // r1t1 matched D1, so its rating does not count; the second text-and-safety finding of run-2 has no rating.
    adjudications: [
      rate(r1t1, 'valid'),
      rate(r2s1, 'valid'),
      rate(r2s2, 'wrong'),
      rate(r2t1, 'unknown'),
      rate(r3c1, 'wrong'),
    ],
  };
  const metas = {
    'code-7/C3/run-1': {
      reviewers: {
        correctness: { seconds: 100, tokens: 1000 },
        'spec-and-tests': { seconds: 140.5, tokens: 2000 },
        'text-and-safety': { seconds: 120, tokens: 500 },
      },
    },
    'code-7/C3/run-2': {
      reviewers: {
        correctness: { seconds: 90, tokens: 10 },
        'spec-and-tests': { seconds: 80, tokens: null },
        'text-and-safety': { seconds: 70, tokens: 30 },
      },
    },
    'code-7/B0/run-1': { reviewers: { full: { seconds: 200, tokens: 9000 } } },
  };
  const pairs = { cases: [{ case: 'code-7', kind: 'code', known: CODE_KNOWN, runs: [] }] };
  return { findings: { blocks, findings }, pairs, judgments, metas };
}
const byRun = (scores) => Object.fromEntries(scores.runs.map((run) => [`${run.arm}/${run.run}`, run]));

test('recall per run is the union over its reviewers, summarized by mean, median, min, and max', () => {
  const scores = scoreRuns(scoringFixture());
  const runs = byRun(scores);
  assert.deepEqual(Object.keys(runs), ['B0/run-1', 'C3/run-1', 'C3/run-2', 'C3/run-3']);
  assert.deepEqual(runs['C3/run-1'].found, ['D1', 'D2']);
  assert.equal(runs['C3/run-1'].recall, 2 / 3);
  assert.deepEqual(runs['C3/run-2'].found, ['D1', 'D2', 'D3']);
  assert.equal(runs['C3/run-2'].recall, 1);
  assert.deepEqual(runs['C3/run-3'].found, []);
  assert.equal(runs['C3/run-3'].recall, 0);
  const [b0, c3] = scores.summaries;
  assert.deepEqual([b0.arm, b0.runs, b0.known, b0.recall], ['B0', 1, 3, { mean: 0, median: 0, min: 0, max: 0 }]);
  assert.deepEqual([c3.arm, c3.runs, c3.known], ['C3', 3, 3]);
  assert.ok(Math.abs(c3.recall.mean - 5 / 9) < 1e-12);
  assert.deepEqual([c3.recall.median, c3.recall.min, c3.recall.max], [2 / 3, 0, 1]);
});

test('findings without a match count as valid extras, wrong, unknown, or unjudged', () => {
  const scores = scoreRuns(scoringFixture());
  const counts = Object.fromEntries(
    scores.runs.map((run) => [`${run.arm}/${run.run}`, [run.validExtras, run.wrong, run.unknown, run.unjudged]]),
  );
  assert.deepEqual(counts, {
    'B0/run-1': [0, 0, 0, 0],
    'C3/run-1': [0, 0, 0, 0],
    'C3/run-2': [1, 1, 1, 1],
    'C3/run-3': [0, 1, 0, 0],
  });
  const c3 = scores.summaries[1];
  assert.deepEqual([c3.validExtras, c3.wrong, c3.unknown], [1 / 3, 2 / 3, 1 / 3]);
});

test('run time is the slowest reviewer, tokens are the sum, and the round verdict is the worst block', () => {
  const scores = scoreRuns(scoringFixture());
  const runs = byRun(scores);
  assert.deepEqual(
    Object.values(runs).map((run) => [run.seconds, run.tokens, run.roundVerdict]),
    [
      [200, 9000, 'pass'],
      [140.5, 3500, 'fixes-required'],
      [90, null, 'blocked'],
      [null, null, 'incomplete'],
    ],
  );
  assert.deepEqual(runs['C3/run-2'].verdicts, [
    { reviewer: 'correctness', verdict: 'blocked' },
    { reviewer: 'spec-and-tests', verdict: 'fixes-required' },
    { reviewer: 'text-and-safety', verdict: 'pass' },
  ]);
  assert.deepEqual(scores.summaries[1].seconds, { mean: 115.25, median: 115.25, min: 90, max: 140.5 });
  assert.deepEqual(scores.summaries[1].tokens, { mean: 3500, median: 3500, min: 3500, max: 3500 });
  assert.equal(roundVerdict(['pass', 'repair', 'pass']), 'repair');
  assert.equal(roundVerdict(['pass', 'unreadable']), 'incomplete');
  assert.equal(roundVerdict([]), 'incomplete');
});

// One C3 arm of code-7 with the given known defects. Each run is a list of findings of one correctness block;
// each finding is `{ matches: { D1: verdict }, rating }`, and a cost is `{ seconds, tokens }`.
function judgedArm(known, runs, costs = []) {
  const blocks = [];
  const findings = [];
  const judgments = { matches: [], adjudications: [] };
  const metas = {};
  for (const [index, list] of runs.entries()) {
    const run = `run-${index + 1}`;
    blocks.push({
      case: 'code-7',
      kind: 'code',
      arm: 'C3',
      run,
      reviewer: 'correctness',
      verdict: 'pass',
      findings: 0,
    });
    if (costs[index]) metas[`code-7/C3/${run}`] = { reviewers: { correctness: costs[index] } };
    for (const [n, { matches = {}, rating }] of list.entries()) {
      const id = `code-7/C3/${run}/correctness#${n + 1}`;
      const blind = blindId(id);
      findings.push({ id, blind, case: 'code-7', arm: 'C3', run, reviewer: 'correctness', n: n + 1 });
      for (const [knownId, verdict] of Object.entries(matches))
        judgments.matches.push({ finding: blind, known: knownId, verdict, reason: 'Read the snapshot.' });
      if (rating) judgments.adjudications.push({ finding: blind, rating, reason: 'Read the snapshot.' });
    }
  }
  const pairs = { cases: [{ case: 'code-7', kind: 'code', known, runs: [] }] };
  return { findings: { blocks, findings }, pairs, judgments, metas };
}

test('an unknown pair with a missed known defect counts as unresolved, and the finding keeps its rating', () => {
  const scores = scoreRuns(judgedArm(CODE_KNOWN.slice(0, 1), [[{ matches: { D1: 'unknown' }, rating: 'valid' }]]));
  const [run] = scores.runs;
  assert.deepEqual(
    [run.recall, run.validExtras, run.unknown, run.unjudged, run.unresolved, run.unknownPairs],
    [0, 1, 0, 0, 1, 1],
  );
  assert.deepEqual([scores.summaries[0].unresolved, scores.summaries[0].unknownPairs], [1, 1]);
  const lines = renderReport(scores).split('\n');
  assert.ok(
    lines.includes('| code-7 | C3 | run-1 | 0.00 | - | 1 | 0 | 0 | 0 | 1 | 1 | - | - | pass | correctness: pass |'),
  );
});

test('an unknown pair with a known defect that the run found counts as an unknown pair, not as unresolved', () => {
  const scores = scoreRuns(
    judgedArm(CODE_KNOWN.slice(0, 1), [
      [{ matches: { D1: 'match' } }, { matches: { D1: 'unknown' }, rating: 'valid' }],
    ]),
  );
  const [run] = scores.runs;
  assert.deepEqual([run.recall, run.validExtras, run.unresolved, run.unknownPairs], [1, 1, 0, 1]);
  assert.deepEqual([scores.summaries[0].unresolved, scores.summaries[0].unknownPairs], [0, 1]);
  const lines = renderReport(scores).split('\n');
  assert.ok(
    lines.includes('| code-7 | C3 | run-1 | 1.00 | D1 | 1 | 0 | 0 | 0 | 0 | 1 | - | - | pass | correctness: pass |'),
  );
  assert.ok(lines.some((line) => line.includes('| Unresolved mean | Unknown pairs mean |')));
});

test('a finding that matches one known defect and has an unknown pair with a missed one leaves it unresolved', () => {
  const scores = scoreRuns(judgedArm(CODE_KNOWN.slice(0, 2), [[{ matches: { D1: 'match', D2: 'unknown' } }]]));
  const [run] = scores.runs;
  assert.deepEqual([run.found, run.recall, run.unresolved, run.unknownPairs], [['D1'], 0.5, 1, 1]);
});

test('an unknown pair with a known defect that another finding of the run matches is not unresolved', () => {
  const scores = scoreRuns(
    judgedArm(CODE_KNOWN.slice(0, 2), [
      [{ matches: { D1: 'match', D2: 'unknown' } }, { matches: { D2: 'match' } }],
      [{ matches: { D2: 'unknown' }, rating: 'wrong' }],
    ]),
  );
  const [first, second] = scores.runs;
  assert.deepEqual([first.found, first.unresolved, first.unknownPairs], [['D1', 'D2'], 0, 1]);
  assert.deepEqual([second.found, second.unresolved, second.unknownPairs], [[], 1, 1]);
  assert.deepEqual([scores.summaries[0].unresolved, scores.summaries[0].unknownPairs], [0.5, 1]);
});

test('the summary gives the median and the range of seconds and tokens, so one slow run does not move the median', () => {
  const costs = [
    { seconds: 100, tokens: 10 },
    { seconds: 100, tokens: 10 },
    { seconds: 400, tokens: 40 },
  ];
  const scores = scoreRuns(judgedArm(CODE_KNOWN, [[], [], []], costs));
  const [summary] = scores.summaries;
  assert.deepEqual(summary.seconds, { mean: 200, median: 100, min: 100, max: 400 });
  assert.deepEqual(summary.tokens, { mean: 20, median: 10, min: 10, max: 40 });
  const report = renderReport(scores);
  assert.ok(
    report.includes('| Seconds median | Seconds min | Seconds max | Tokens median | Tokens min | Tokens max |'),
  );
  assert.ok(report.includes('| 0.00 | 100.0 | 100.0 | 400.0 | 10 | 10 | 40 |'));
  const open = scoreRuns(judgedArm(CODE_KNOWN, [[], []], [{ seconds: 50, tokens: null }]));
  assert.deepEqual(open.summaries[0].seconds, { mean: 50, median: 50, min: 50, max: 50 });
  assert.deepEqual(open.summaries[0].tokens, { mean: null, median: null, min: null, max: null });
});

test('report.md lists known-defect ids and no defect text', (t) => {
  const { ws, cases } = workspace(t);
  const { findings } = findingsCommand(ws);
  const pairs = pairsCommand(ws, cases);
  const blind = Object.fromEntries(findings.map((finding) => [finding.id, finding.blind]));
  const matches = [
    { finding: blind['code-7/B0/run-1/full#1'], known: 'D1', verdict: 'match', reason: 'Same lock.' },
    { finding: blind['code-7/C3/run-1/correctness#1'], known: 'D1', verdict: 'match', reason: 'Same lock.' },
    { finding: blind['code-7/C3/run-1/correctness#3'], known: 'D2', verdict: 'match', reason: 'Same retry.' },
    { finding: blind['plan-3/P0/run-1/plan#1'], known: 'K1', verdict: 'match', reason: 'Same step.' },
  ];
  // The judge answers every candidate pair, so each other candidate pair gets the answer `no`.
  const answered = new Set(matches.map((entry) => `${entry.finding} ${entry.known}`));
  for (const pair of pairs.cases.flatMap((entry) => entry.runs.flatMap((run) => run.pairs))) {
    if (!answered.has(`${pair.finding} ${pair.known}`))
      matches.push({ ...pair, verdict: 'no', reason: 'Other cause.' });
  }
  put(ws, 'judgments.json', {
    matches,
    // The report stops on a finding with neither a match nor an adjudication, so each such finding gets a rating.
    adjudications: [
      { finding: blind['code-7/C3/run-1/spec-and-tests#1'], rating: 'valid', reason: 'The check is weak.' },
      { finding: blind['code-7/C3/run-1/correctness#2'], rating: 'wrong', reason: 'The index is cached.' },
      { finding: blind['code-7/C3/run-2/correctness#1'], rating: 'valid', reason: 'Read the snapshot.' },
      { finding: blind['code-7/C3/run-2/correctness#2'], rating: 'wrong', reason: 'Read the snapshot.' },
      { finding: blind['code-7/C3/run-2/correctness#3'], rating: 'unknown', reason: 'Read the snapshot.' },
      { finding: blind['plan-3/P0/run-1/plan#2'], rating: 'valid', reason: 'Read the plan.' },
    ],
  });
  put(ws, 'code-7/B0/run-1/meta.json', { reviewers: { full: { seconds: 61.5, tokens: 4200 } } });
  reportCommand(ws);
  const report = fs.readFileSync(path.join(ws, 'report.md'), 'utf8');
  const lines = report.split('\n');
  for (const expected of [
    '| code-7 | B0 | 1 | 3 | 0.33 | 0.33 | 0.33 | 0.33 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 61.5 | 61.5 | 61.5 | 4200 | 4200 | 4200 |',
    '| code-7 | B0 | run-1 | 0.33 | D1 | 0 | 0 | 0 | 0 | 0 | 0 | 61.5 | 4200 | fixes-required | full: fixes-required |',
    '| code-7 | C3 | run-1 | 0.67 | D1, D2 | 1 | 1 | 0 | 0 | 0 | 0 | - | - | incomplete | correctness: fixes-required, spec-and-tests: fixes-required, text-and-safety: unreadable |',
    '| code-7 | C3 | run-2 | 0.00 | - | 1 | 1 | 1 | 0 | 0 | 0 | - | - | incomplete | correctness: fixes-required, spec-and-tests: unreadable, text-and-safety: missing |',
    '| plan-3 | P0 | run-1 | 0.50 | K1 | 1 | 0 | 0 | 0 | 0 | 0 | - | - | repair | plan: repair |',
  ]) {
    assert.ok(lines.includes(expected), `report.md lacks ${expected}`);
  }
  for (const text of [...CODE_KNOWN, ...PLAN_KEY].map((item) => item.title).concat(['timeout', 'export command'])) {
    assert.equal(report.includes(text), false, `report.md contains ${text}`);
  }
  assert.equal(renderReport(scoreRuns(scoringFixture())).includes('Lock stays held'), false);
});

test('report refuses judgments with unknown ids or conflicting answers', () => {
  const fixture = scoringFixture();
  const [first] = fixture.findings.findings;
  const withMatches = (matches) => ({ ...fixture, judgments: { matches, adjudications: [] } });
  assert.throws(
    () => scoreRuns(withMatches([{ finding: 'F-0000000000', known: 'D1', verdict: 'match' }])),
    /unknown finding F-0000000000/,
  );
  assert.throws(
    () => scoreRuns(withMatches([{ finding: first.blind, known: 'K9', verdict: 'match' }])),
    /not a known defect/,
  );
  assert.throws(
    () =>
      scoreRuns(
        withMatches([
          { finding: first.blind, known: 'D1', verdict: 'match' },
          { finding: first.blind, known: 'D1', verdict: 'no' },
        ]),
      ),
    /two different answers/,
  );
  assert.throws(
    () =>
      scoreRuns({ ...fixture, judgments: { matches: [], adjudications: [{ finding: first.blind, rating: 'maybe' }] } }),
    /rating maybe/,
  );
});

test('report refuses judgments that skip a candidate pair and names the missing pairs', () => {
  const withCandidates = (fixture) => {
    const pairs = fixture.findings.findings.map((finding) => ({ finding: finding.blind, known: 'D1' }));
    fixture.pairs.cases[0].runs = [{ run: 'R-00000000', findings: [], pairs }];
    return fixture;
  };
  const one = withCandidates(judgedArm(CODE_KNOWN.slice(0, 1), [[{ rating: 'valid' }]]));
  const [finding] = one.findings.findings;
  assert.throws(() => scoreRuns(one), new RegExp(`no match answer for 1 candidate pairs .*${finding.blind} and D1$`));
  const answered = withCandidates(judgedArm(CODE_KNOWN.slice(0, 1), [[{ matches: { D1: 'no' }, rating: 'valid' }]]));
  assert.equal(scoreRuns(answered).runs[0].validExtras, 1);
  const many = withCandidates(judgedArm(CODE_KNOWN.slice(0, 1), [Array.from({ length: 12 }, () => ({}))]));
  assert.throws(() => scoreRuns(many), /no match answer for 12 candidate pairs .*, and 2 more$/);
});

test('summarize takes the middle pair for an even count and gives nulls without values', () => {
  assert.deepEqual(summarize([4, 1, 3, 2]), { mean: 2.5, median: 2.5, min: 1, max: 4 });
  assert.deepEqual(summarize([5, null, 1, 3]), { mean: 3, median: 3, min: 1, max: 5 });
  assert.deepEqual(summarize([null]), { mean: null, median: null, min: null, max: null });
});

test('transcript reader measures first user to last assistant message and sums tokens', () => {
  const lines = [
    { type: 'session', timestamp: '2026-01-01T00:00:00.000Z' },
    { type: 'message', timestamp: '2026-01-01T00:00:01.000Z', message: { role: 'user' } },
    {
      type: 'message',
      timestamp: '2026-01-01T00:00:05.000Z',
      message: { role: 'assistant', usage: { input: 100, output: 10, cacheRead: 50, cacheWrite: 5 } },
    },
    { type: 'message', timestamp: '2026-01-01T00:00:06.000Z', message: { role: 'toolResult' } },
    { type: 'model_usage', timestamp: '2026-01-01T00:00:07.000Z', usage: { input: 999, output: 999 } },
    {
      type: 'message',
      timestamp: '2026-01-01T00:01:31.200Z',
      message: { role: 'assistant', usage: { input: 200, output: 20, cacheRead: 150 } },
    },
  ];
  const text = lines.map((entry) => JSON.stringify(entry)).join('\n');
  assert.deepEqual(parseTranscript(`${text}\n`), { seconds: 90.2, tokens: 535 });
  assert.throws(() => parseTranscript(JSON.stringify(lines[1]), 'half.jsonl'), /half\.jsonl has no timestamped/);
  assert.throws(() => parseTranscript('{"type":', 'cut.jsonl'), /cut\.jsonl line 1 is not JSON/);
});

test('pickTranscript finds nested and repeated transcripts and refuses ties', () => {
  const files = [
    '/s/Code7C3R1Correctness.jsonl',
    '/s/Code7C3R1Correctness-2.jsonl',
    '/s/Code7C3R1Correctness.md',
    '/s/XCode7C3R1Full.jsonl',
    '/s/Parent/Parent.Code7C3R1Full.jsonl',
  ];
  assert.equal(pickTranscript(files, 'Code7C3R1Correctness'), '/s/Code7C3R1Correctness-2.jsonl');
  assert.equal(pickTranscript(files, 'Code7C3R1Full'), '/s/Parent/Parent.Code7C3R1Full.jsonl');
  assert.equal(pickTranscript(files, 'Code7C3R2Full'), undefined);
  assert.throws(
    () => pickTranscript(['/a/Name.jsonl', '/b/P.Name.jsonl'], 'Name'),
    /more than one transcript for Name/,
  );
});

test('transcripts command fills meta files by dispatch name and keeps other fields', (t) => {
  const { ws } = workspace(t);
  const sessions = path.join(path.dirname(ws), 'sessions');
  const at = (second) => new Date(Date.UTC(2026, 0, 1, 0, 0, second)).toISOString();
  const transcript = (seconds, input) =>
    [
      { type: 'message', timestamp: at(0), message: { role: 'user' } },
      { type: 'message', timestamp: at(seconds), message: { role: 'assistant', usage: { input, output: 1 } } },
    ]
      .map((entry) => JSON.stringify(entry))
      .join('\n');
  put(sessions, 'Code7C3R1Correctness.jsonl', transcript(30, 99));
  put(sessions, 'Code7C3R1SpecAndTests.jsonl', transcript(10, 9));
  put(sessions, 'Code7C3R1SpecAndTests-2.jsonl', transcript(40, 199));
  put(sessions, 'Lead/Lead.Code7C3R1TextAndSafety.jsonl', transcript(50, 299));
  put(ws, 'code-7/C3/run-1/meta.json', {
    note: 'kept',
    reviewers: { correctness: { seconds: 1, tokens: 1, model: 'm' } },
  });
  assert.throws(() => transcriptsCommand(ws, sessions), /no transcript .*Code7B0R1Full.*Plan3P0R1Plan/);
  // These transcripts name no model, effort, or tier: the facts hold nulls and one message without a model.
  const facts = { effort: null, requestedTier: null, messages: [{ model: null, servedTier: null }], sideCalls: [] };
  assert.deepEqual(readJson(path.join(ws, 'code-7/C3/run-1/meta.json')), {
    note: 'kept',
    reviewers: {
      correctness: { seconds: 30, tokens: 100, model: 'm', ...facts },
      'spec-and-tests': { seconds: 40, tokens: 200, ...facts },
      'text-and-safety': { seconds: 50, tokens: 300, ...facts },
    },
  });
  assert.equal(fs.existsSync(path.join(ws, 'code-7/B0/run-1/meta.json')), false);
});

test('names command gives one dispatch name per prompt', (t) => {
  const { ws } = workspace(t);
  const names = namesCommand(ws);
  assert.equal(names.length, 8);
  assert.deepEqual(names[0], {
    prompt: path.join('code-7', 'B0', 'run-1', 'prompts', 'full.txt'),
    name: 'Code7B0R1Full',
  });
  assert.equal(new Set(names.map((entry) => entry.name)).size, names.length);
  assert.equal(dispatchName('code-delta-96', 'Cd', 'run-12', 'spec-and-tests'), 'CodeDelta96CdR12SpecAndTests');
});

test('dispatch names that collide stop the names and transcripts commands', (t) => {
  const reviewer = (caseId) => ({ caseId, arm: 'C3', run: 'run-1', reviewer: 'correctness' });
  assert.deepEqual(
    dispatchNames([reviewer('code-7'), reviewer('code-8')]).map((entry) => entry.name),
    ['Code7C3R1Correctness', 'Code8C3R1Correctness'],
  );
  const collision = /code-7\/C3\/run-1\/correctness and code_7\/C3\/run-1\/correctness both give Code7C3R1Correctness/;
  assert.throws(() => dispatchNames([reviewer('code-7'), reviewer('code_7')]), collision);
  const { ws } = workspace(t);
  put(ws, 'code_7/case.json', { id: 'code_7', kind: 'code', split: 'dev' });
  put(ws, 'code_7/B0/run-1/prompts/full.txt', 'agent: review-bench-baseline-code\n\nReview.\n');
  const sessions = path.join(path.dirname(ws), 'sessions');
  // A readable transcript, so only the name check keeps the command from writing meta.json.
  const message = (role, second) => ({
    type: 'message',
    timestamp: new Date(Date.UTC(2026, 0, 1, 0, 0, second)).toISOString(),
    message: { role, usage: { input: 5, output: 1 } },
  });
  const lines = [message('user', 0), message('assistant', 9)].map((entry) => JSON.stringify(entry));
  put(sessions, 'Code7B0R1Full.jsonl', lines.join('\n'));
  const fullCollision = /code-7\/B0\/run-1\/full and code_7\/B0\/run-1\/full both give Code7B0R1Full/;
  assert.throws(() => namesCommand(ws), fullCollision);
  assert.throws(() => transcriptsCommand(ws, sessions), fullCollision);
  assert.equal(fs.existsSync(path.join(ws, 'code-7/B0/run-1/meta.json')), false);
});

// Plan #100 step 2: API note for the tests below. They read the new exports through `score`.
//
// New exports of score.mjs:
// - transcriptFacts(text, source = 'transcript') -> { effort, requestedTier, messages, sideCalls }
//   effort: `thinkingLevel` of the last `thinking_level_change`, else null.
//   requestedTier: `serviceTier.openai` of the last `service_tier_change`, else null.
//   messages: one { model, servedTier } per assistant message, in transcript order. model is `<provider>/<model>`
//   (`<model>` without a provider, null without a model). servedTier is `message.serviceTier`, else null.
//   sideCalls: one { model, purpose, tokens } per `model_usage` record. tokens adds input, cacheRead, cacheWrite,
//   and output, as for assistant messages.
// - pairedBootstrap(cases, { seed = 1, resamples = 10000, level = 0.9 } = {})
//   -> { estimate, low, high, cases: <count>, resamples }
//   cases: one { value, reference, weight = 1 } per case; other fields stay unread. The statistic of a set of cases
//   is sum(value - reference) / sum(weight). estimate is the statistic of all cases. A resample draws as many cases
//   as there are, with replacement. low and high are the (1 - level) / 2 and (1 + level) / 2 quantiles of the
//   resampled statistics. A seeded generator in score.mjs draws; Math.random stays unused. With no cases,
//   estimate, low, and high are null.
// - judgeAgreement(judgments, second) -> { answers, agreed, rate }
//   Each answer of `second` (a match by finding and known id, an adjudication by finding) is compared with the same
//   answer of `judgments`. rate is agreed / answers, or null with no answers. An answer that `judgments` does not
//   give fails: `judgments-second.json answers <finding> and <known>, which judgments.json does not answer`, or
//   `... answers <finding>, which judgments.json does not answer` for an adjudication.
// - readKey(dir, caseId) -> the known list of `<dir>/<caseId>.key.json` (a list, or { known: [...] }), or
//   undefined when the file does not exist. It fails with `the known defects of <caseId> must be a list of items
//   with a string id`. readKnown, `report --keys`, and the loop command of step 3 read key files only through it.
//
// Changed exports:
// - parseTranscript(text, source, model): with `model`, seconds run from the first user message to the last
//   assistant message of `model`, and tokens add only the messages of `model`. With no message of `model`, the
//   result is { seconds: null, tokens: 0 }. Without `model`, the result does not change.
// - transcriptsCommand writes { ...parseTranscript(text, file, meta.config?.model), ...transcriptFacts(text, file) }
//   into meta.reviewers[reviewer]. The existing test 'transcripts command fills meta files ...' then gets these
//   fields in each reviewer entry.
// - Rounds: a run folder can hold `round-<r>/` folders, each with prompts/, blocks/, and meta.json. The blocks and
//   findings of such a run have `round: <r>`, and a finding id is `<case>/<arm>/<run>/round-<r>/<reviewer>#<n>`.
//   scoreRuns reads its meta at metas['<case>/<arm>/<run>/round-<r>']. A run without round folders is round 1: no
//   `round` field, and its ids and meta key do not change. Dispatch names of round folders are for step 3.
// - pairs.json: each case entry gets the `split` of its case.json. scoreRuns takes the case group from it.
// - scoreRuns: each run gets `config` (meta.config of the run, or of its round 1, else null), `invalid` (a list of
//   reasons; empty for a valid run), and `rounds`: one { round, mode, seconds, tokens, found, verdict } per round,
//   in order. mode is meta.mode; seconds is the slowest reviewer; tokens is the sum; found lists the known ids
//   that the round matched; verdict is roundVerdict of its blocks. The run's seconds and tokens are sums over its
//   rounds; found, recall, and the finding counts cover all rounds; verdicts and roundVerdict are those of the last
//   round. Summaries leave out invalid runs.
// - Invalid run: only a run with `config` is checked. Each reviewer entry can give these reasons:
//   `<reviewer>: model <m>, not <config.model>` for each other model in messages;
//   `<reviewer>: effort <e>, not <config.effort>`;
//   `<reviewer>: served tier <t>, not <config.tier>` for each other served tier of the messages of config.model,
//   when config.tier is not null;
//   `<reviewer>: no transcript facts` when the entry has no `messages`.
//   In a run with round folders, <reviewer> is `round-<r>/<reviewer>`.
// - renderReport(scores, { configs, reference } = {}) keeps the Summary and Runs tables and adds:
//   `## Invalid runs`, only when there is an invalid run: one line `- <case>/<arm>/<run>: <reasons joined by "; ">`
//   per invalid run;
//   `## Configurations: <split>`: one table per case group, in name order, from the valid runs with a config (a case
//   without `split` is in the group `-`). The columns are `configs` in that order (default: the config names in run
//   order). `reference` is the base of the interval rows (default: of the columns with runs, the one with the
//   fewest escaped per run; on a tie, the first). The test 'the configuration table ...' gives every row; the rows
//   are defined above it;
//   `## Judge agreement`, only when scores.agreement is set, with the line
//   `The second judge agreed with <agreed> of <answers> answers (<rate with 2 decimals>).`
// - reportCommand(ws, { keys, configs } = {}) returns the scores as today and also stops before it writes report.md:
//   when a finding has no `match` answer and no adjudication: `judgments.json has no match and no adjudication for
//   <n> findings: <blind ids>` (the first 10 in findings.json order, then `, and <n> more`). The existing test
//   'report.md lists known-defect ids and no defect text' then needs an adjudication for each finding that it leaves
//   unjudged;
//   with `keys`, when the known ids of a case in pairs.json differ from readKey(keys, case) for a case that has a key
//   there: `pairs.json is out of date for <case>: ...; run score.mjs pairs again`.
//   It reads `<ws>/judgments-second.json` when it exists and gives renderReport `agreement: judgeAgreement(...)`.
// - pairsCommand(ws, casesDir, { keys } = {}) and readKnown(casesDir, caseId, split, keys): with `keys`, a case
//   without inline `known` reads `<keys>/<case>.key.json` and never the key file next to the case file. A missing
//   key fails with `<key file> is missing and <case file> has no known defects`, as today.
// - main: `pairs <ws> --cases <dir> [--keys <dir>]` and `report <ws> [--keys <dir>] [--configs <name,...>]`.

const MODEL = 'openai-codex/gpt-6.1-sol';
const CONFIGS = {
  low: { name: 'low', model: MODEL, effort: 'low', tier: 'default' },
  'low-fast': { name: 'low-fast', model: MODEL, effort: 'low', tier: 'priority' },
  high: { name: 'high', model: MODEL, effort: 'high', tier: 'default' },
  'xhigh-fast': { name: 'xhigh-fast', model: MODEL, effort: 'xhigh', tier: 'priority' },
};
// One reviewer entry of meta.json, as `score.mjs transcripts` writes it for a reviewer that used its configuration.
const provenCost = (config, seconds, tokens, facts = {}) => ({
  seconds,
  tokens,
  effort: config.effort,
  requestedTier: config.tier,
  messages: [{ model: config.model, servedTier: config.tier }],
  sideCalls: [],
  ...facts,
});
const jsonl = (entries) => entries.map((entry) => JSON.stringify(entry)).join('\n');
const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const isoAt = (second) => new Date(Date.UTC(2026, 0, 1, 0, 0, second)).toISOString();
const assistantLine = (second, provider, model, serviceTier, usage) => ({
  type: 'message',
  timestamp: isoAt(second),
  message: {
    role: 'assistant',
    provider,
    model,
    ...(serviceTier ? { serviceTier } : {}),
    usage,
    timestamp: Date.parse(isoAt(second)),
  },
});
// A reviewer transcript that asks for xhigh and the priority tier. It has a titling side call of a helper model,
// and its last message comes from a usage fallback to another model.
const FALLBACK_TRANSCRIPT = [
  { type: 'session', timestamp: isoAt(0) },
  { type: 'model_change', timestamp: isoAt(0), model: MODEL },
  { type: 'thinking_level_change', timestamp: isoAt(0), thinkingLevel: 'high' },
  { type: 'service_tier_change', timestamp: isoAt(0), serviceTier: { openai: 'default' } },
  { type: 'thinking_level_change', timestamp: isoAt(0), thinkingLevel: 'xhigh' },
  { type: 'service_tier_change', timestamp: isoAt(0), serviceTier: { openai: 'priority' } },
  { type: 'message', timestamp: isoAt(1), message: { role: 'user' } },
  assistantLine(5, 'openai-codex', 'gpt-6.1-sol', 'priority', { input: 100, output: 10, cacheRead: 50, cacheWrite: 5 }),
  {
    type: 'model_usage',
    timestamp: isoAt(6),
    purpose: 'title',
    provider: 'openai-codex',
    model: 'gpt-6-luna',
    usage: { input: 300, output: 62 },
  },
  { type: 'message', timestamp: isoAt(7), message: { role: 'toolResult' } },
  assistantLine(31, 'openai-codex', 'gpt-6.1-sol', 'priority', { input: 200, output: 20, cacheRead: 150 }),
  { type: 'model_change', timestamp: isoAt(32), model: 'anthropic/claude-opus-5-5' },
  assistantLine(91, 'anthropic', 'claude-opus-5-5', null, { input: 1000, output: 100 }),
];
const FALLBACK_FACTS = {
  effort: 'xhigh',
  requestedTier: 'priority',
  messages: [
    { model: MODEL, servedTier: 'priority' },
    { model: MODEL, servedTier: 'priority' },
    { model: 'anthropic/claude-opus-5-5', servedTier: null },
  ],
  sideCalls: [{ model: 'openai-codex/gpt-6-luna', purpose: 'title', tokens: 362 }],
};
const PASS_ROUND = '### Code review round 2\n\nCode-review: pass\n\nNone.\n';
const EXTRA_ROUND = `### Code review round 2

Code-review: fixes-required

## Standards

- [LOW] Clarity - src/sync.mjs:1 - The export name does not say what the lock guards - rename it.

## Spec

None.
`;

// Writes judgments.json with an answer for every candidate pair of pairs.json and a rating for every finding
// without a `match` answer. `verdict(id, known)` and `rating(id)` get the stable finding id; a null rating leaves
// the finding without an adjudication.
function judgeAll(ws, verdict, rating = () => 'valid') {
  const { findings } = readJson(path.join(ws, 'findings.json'));
  const idOf = new Map(findings.map((finding) => [finding.blind, finding.id]));
  const pairs = readJson(path.join(ws, 'pairs.json')).cases.flatMap((entry) => entry.runs.flatMap((run) => run.pairs));
  const matches = pairs.map((pair) => ({
    ...pair,
    verdict: verdict(idOf.get(pair.finding), pair.known),
    reason: 'Read the snapshot.',
  }));
  const matched = new Set(matches.filter((entry) => entry.verdict === 'match').map((entry) => entry.finding));
  const adjudications = findings
    .filter((finding) => !matched.has(finding.blind) && rating(finding.id) !== null)
    .map((finding) => ({ finding: finding.blind, rating: rating(finding.id), reason: 'Read the snapshot.' }));
  const judgments = { matches, adjudications };
  put(ws, 'judgments.json', judgments);
  return judgments;
}

// The table rows after a heading of the report, up to the first line after the table that is not a table row.
function tableAfter(report, heading) {
  const lines = report.split('\n');
  const start = lines.indexOf(heading);
  assert.notEqual(start, -1, `the report has no heading ${heading}`);
  const rows = [];
  for (const line of lines.slice(start + 1)) {
    if (line.startsWith('|')) rows.push(line);
    else if (rows.length) break;
  }
  return rows;
}

// A workspace of case code-7 whose runs hold review rounds: `C1-<config>/run-<k>/round-<r>/` with a prompt, a block,
// and a meta.json whose reviewer used its configuration. Each round is [block, seconds, tokens, mode].
function roundWorkspace(t, runs) {
  const root = scratch(t);
  const ws = path.join(root, 'ws');
  const cases = path.join(root, 'cases');
  put(ws, 'code-7/case.json', { id: 'code-7', kind: 'code', split: 'dev' });
  put(ws, 'code-7/snapshot/src/sync.mjs', 'export const lock = 1;\n');
  put(cases, 'dev/code-7.json', { id: 'code-7', kind: 'code', split: 'dev', known: CODE_KNOWN });
  for (const { config, run, rounds } of runs) {
    for (const [index, [block, seconds, tokens, mode]] of rounds.entries()) {
      const dir = `code-7/C1-${config.name}/run-${run}/round-${index + 1}`;
      put(ws, `${dir}/prompts/full.txt`, `agent: review-bench-candidate-code-${config.name}\n\nReview.\n`);
      put(ws, `${dir}/blocks/full.md`, block);
      put(ws, `${dir}/meta.json`, { config, mode, reviewers: { full: provenCost(config, seconds, tokens) } });
    }
  }
  return { ws, cases };
}

// Runs of `C1-<config>` arms with review rounds, as scoreRuns gets them. `cases` maps a case id to its split and
// known ids. Each run is { case, config, rounds } with one run per case and config, and each round is
// [seconds, tokens, mode, fixer seconds, answers]. An answer is a finding: the known id that it matches, or the
// rating of a finding without a match.
function gridFixture(cases, runs) {
  const blocks = [];
  const findings = [];
  const judgments = { matches: [], adjudications: [] };
  const metas = {};
  for (const spec of runs) {
    const config = CONFIGS[spec.config];
    const arm = `C1-${config.name}`;
    const run = 'run-1';
    for (const [index, [seconds, tokens, mode, fixer, answers]] of spec.rounds.entries()) {
      const round = index + 1;
      const verdict = answers.length ? 'fixes-required' : 'pass';
      blocks.push({
        case: spec.case,
        kind: 'code',
        arm,
        run,
        round,
        reviewer: 'full',
        verdict,
        findings: answers.length,
      });
      metas[`${spec.case}/${arm}/${run}/round-${round}`] = {
        config,
        mode,
        ...(fixer ? { fixer: { seconds: fixer } } : {}),
        reviewers: { full: provenCost(config, seconds, tokens) },
      };
      for (const [n, answer] of answers.entries()) {
        const id = `${spec.case}/${arm}/${run}/round-${round}/full#${n + 1}`;
        const blind = blindId(id);
        findings.push({ id, blind, case: spec.case, arm, run, round, reviewer: 'full', n: n + 1 });
        if (['valid', 'wrong', 'unknown'].includes(answer))
          judgments.adjudications.push({ finding: blind, rating: answer, reason: 'Read the snapshot.' });
        else judgments.matches.push({ finding: blind, known: answer, verdict: 'match', reason: 'Same cause.' });
      }
    }
  }
  const pairs = {
    cases: Object.entries(cases).map(([id, { split, known }]) => ({
      case: id,
      kind: 'code',
      split,
      known: known.map((knownId) => ({ id: knownId, title: `Hidden ${knownId}`, locator: 'src/sync.mjs:1' })),
      runs: [],
    })),
  };
  return { findings: { blocks, findings }, pairs, judgments, metas };
}

test('transcript facts give each assistant model and served tier and the last requested effort and tier', () => {
  const text = `${jsonl(FALLBACK_TRANSCRIPT)}\n`;
  assert.deepEqual(score.transcriptFacts(text, 'fallback.jsonl'), FALLBACK_FACTS);
  // Time and tokens count only the configured model: the side call and the fallback message stay out.
  assert.deepEqual(parseTranscript(text, 'fallback.jsonl', MODEL), { seconds: 30, tokens: 535 });
  assert.deepEqual(parseTranscript(text, 'fallback.jsonl'), { seconds: 90, tokens: 1635 });
  const fallbackOnly = jsonl(FALLBACK_TRANSCRIPT.filter((entry) => entry.message?.model !== 'gpt-6.1-sol'));
  assert.deepEqual(parseTranscript(fallbackOnly, 'fallback.jsonl', MODEL), { seconds: null, tokens: 0 });
  const bare = jsonl([
    { type: 'message', timestamp: isoAt(0), message: { role: 'user' } },
    { type: 'message', timestamp: isoAt(4), message: { role: 'assistant', usage: { input: 1 } } },
  ]);
  assert.deepEqual(score.transcriptFacts(bare, 'bare.jsonl'), {
    effort: null,
    requestedTier: null,
    messages: [{ model: null, servedTier: null }],
    sideCalls: [],
  });
});

test('transcripts command writes the facts and the time and tokens of the configured model', (t) => {
  const root = scratch(t);
  const ws = path.join(root, 'ws');
  const sessions = path.join(root, 'sessions');
  const config = CONFIGS['xhigh-fast'];
  put(ws, 'code-7/case.json', { id: 'code-7', kind: 'code', split: 'dev' });
  put(ws, 'code-7/C1-xhigh-fast/run-1/prompts/full.txt', 'agent: review-bench-candidate-code-xhigh-fast\n\nReview.\n');
  put(ws, 'code-7/C1-xhigh-fast/run-1/meta.json', { config });
  put(sessions, 'Code7C1XhighFastR1Full.jsonl', jsonl(FALLBACK_TRANSCRIPT));
  assert.deepEqual(transcriptsCommand(ws, sessions), ['Code7C1XhighFastR1Full']);
  assert.deepEqual(readJson(path.join(ws, 'code-7/C1-xhigh-fast/run-1/meta.json')), {
    config,
    reviewers: { full: { seconds: 30, tokens: 535, ...FALLBACK_FACTS } },
  });
});

test('a run whose transcript shows another model, effort, or served tier is invalid and leaves the summary', () => {
  const config = CONFIGS['xhigh-fast'];
  const proven = (seconds, facts) => provenCost(config, seconds, 100, facts);
  const fallback = [
    { model: MODEL, servedTier: 'priority' },
    { model: 'anthropic/claude-opus-5-5', servedTier: null },
  ];
  const costs = [
    proven(100),
    proven(500, { messages: fallback }),
    proven(600, { effort: 'high' }),
    proven(700, { messages: [{ model: MODEL, servedTier: 'default' }] }),
    { seconds: 800, tokens: 100 },
  ];
  const answers = [[{ matches: { D1: 'match' } }], [{ matches: { D1: 'match' } }], [], [], []];
  const fixture = judgedArm(CODE_KNOWN.slice(0, 1), answers, costs);
  for (const meta of Object.values(fixture.metas)) meta.config = config;
  const scores = scoreRuns(fixture);
  assert.deepEqual(
    scores.runs.map((run) => [run.run, run.invalid]),
    [
      ['run-1', []],
      ['run-2', ['correctness: model anthropic/claude-opus-5-5, not openai-codex/gpt-6.1-sol']],
      ['run-3', ['correctness: effort high, not xhigh']],
      ['run-4', ['correctness: served tier default, not priority']],
      ['run-5', ['correctness: no transcript facts']],
    ],
  );
  const [summary] = scores.summaries;
  assert.deepEqual([summary.runs, summary.recall.mean, summary.seconds.max], [1, 1, 100]);
  const lines = renderReport(scores).split('\n');
  assert.ok(lines.includes('## Invalid runs'));
  assert.ok(
    lines.includes('- code-7/C3/run-2: correctness: model anthropic/claude-opus-5-5, not openai-codex/gpt-6.1-sol'),
  );
  // A run without a configuration has nothing to prove, so it stays in the summary.
  const legacy = scoreRuns(judgedArm(CODE_KNOWN.slice(0, 1), answers, costs));
  assert.deepEqual([legacy.runs.every((run) => run.invalid.length === 0), legacy.summaries[0].runs], [true, 5]);
  assert.equal(renderReport(legacy).includes('## Invalid runs'), false);
});

test('a run with round folders keeps scores and timing per round, and the report has rows per round index', (t) => {
  const { low } = CONFIGS;
  const lowFast = CONFIGS['low-fast'];
  const { ws, cases } = roundWorkspace(t, [
    {
      config: low,
      run: 1,
      rounds: [
        [FULL_BLOCK, 100, 1000, 'full'],
        [PASS_ROUND, 40, 400, 'delta'],
      ],
    },
    {
      config: low,
      run: 2,
      rounds: [
        [FULL_BLOCK, 120, 1200, 'full'],
        [EXTRA_ROUND, 60, 600, 'delta'],
        [PASS_ROUND, 20, 200, 'delta'],
      ],
    },
    {
      config: lowFast,
      run: 1,
      rounds: [
        [FULL_BLOCK, 50, 500, 'full'],
        [PASS_ROUND, 10, 100, 'delta'],
      ],
    },
  ]);
  const doc = findingsCommand(ws);
  assert.deepEqual(
    doc.blocks.map((block) => `${block.arm}/${block.run}/round-${block.round}/${block.reviewer} ${block.verdict}`),
    [
      'C1-low/run-1/round-1/full fixes-required',
      'C1-low/run-1/round-2/full pass',
      'C1-low/run-2/round-1/full fixes-required',
      'C1-low/run-2/round-2/full fixes-required',
      'C1-low/run-2/round-3/full pass',
      'C1-low-fast/run-1/round-1/full fixes-required',
      'C1-low-fast/run-1/round-2/full pass',
    ],
  );
  assert.deepEqual(
    doc.findings.map((finding) => [finding.id, finding.round]),
    [
      ['code-7/C1-low/run-1/round-1/full#1', 1],
      ['code-7/C1-low/run-2/round-1/full#1', 1],
      ['code-7/C1-low/run-2/round-2/full#1', 2],
      ['code-7/C1-low-fast/run-1/round-1/full#1', 1],
    ],
  );
  main(['pairs', ws, '--cases', cases]);
  // The round-1 findings are the known lock defect D1; the round-2 finding is a valid extra.
  judgeAll(ws, (id, known) => (id.includes('/round-1/') && known === 'D1' ? 'match' : 'no'));
  const scores = reportCommand(ws, { configs: ['low-fast', 'low'] });
  const loop = scores.runs.find((run) => run.arm === 'C1-low' && run.run === 'run-2');
  const roundRow = ({ round, mode, seconds, tokens, found, verdict }) => [round, mode, seconds, tokens, found, verdict];
  assert.deepEqual(loop.rounds.map(roundRow), [
    [1, 'full', 120, 1200, ['D1'], 'fixes-required'],
    [2, 'delta', 60, 600, [], 'fixes-required'],
    [3, 'delta', 20, 200, [], 'pass'],
  ]);
  assert.deepEqual(
    [loop.seconds, loop.tokens, loop.found, loop.recall, loop.validExtras, loop.roundVerdict],
    [200, 2000, ['D1'], 1 / 3, 1, 'pass'],
  );
  assert.equal(main(['report', ws, '--configs', 'low-fast,low']), 'report.md: 3 runs');
  const table = tableAfter(fs.readFileSync(path.join(ws, 'report.md'), 'utf8'), '## Configurations: dev');
  for (const row of [
    '| Measure | low-fast | low |',
    '| Runs | 1 | 2 |',
    '| Round 1 seconds median | 50.0 | 110.0 |',
    '| Round 1 seconds min | 50.0 | 100.0 |',
    '| Round 1 seconds max | 50.0 | 120.0 |',
    '| Round 1 modes | full 1 | full 2 |',
    '| Round 1 known found per run | 1.00 | 1.00 |',
    '| Round 2 seconds median | 10.0 | 50.0 |',
    '| Round 2 known found per run | 0.00 | 0.00 |',
    '| Round 3 seconds median | - | 20.0 |',
    '| Round 3 modes | - | delta 1 |',
    '| Rounds median | 2.0 | 2.5 |',
    '| Rounds max | 2 | 3 |',
    '| Loop seconds median | 60.0 | 170.0 |',
  ]) {
    assert.ok(table.includes(row), `the configuration table lacks ${row}`);
  }
});

// Rows of a configuration table. A column holds the valid runs of one configuration in one case group.
// - Runs: the number of runs.
// - Round <r> rows, for r from 1 to the highest round of the group, cover the runs that reached round r: seconds
//   median, min, and max (round seconds); modes (`<mode> <count>` in mode-name order, joined by ", "); known found
//   per run (the known defects that round r found, divided by the runs that reached it).
// - Rounds median and max: the rounds of a run. Loop seconds median: the sum of the round seconds of a run.
// - `... per run`: the sum over the runs divided by the runs. Known found (by the end of the loop), Escaped (known
//   minus found), Valid extras, Extra-only rounds (rounds r >= 2 whose round r - 1 found no known defect and had a
//   valid extra), Wrong, Unjudged, Unknown ratings, and Unknown pairs.
// - Tokens median; Side-call tokens median (the sideCalls tokens of a run); Fixer seconds median (the sum of
//   meta.fixer.seconds over the rounds of a run; a round without `fixer` adds 0).
// - Model, Effort, Served tier: the different values of the transcript facts (messages[].model, effort,
//   messages[].servedTier), joined by ", ".
// - Known found per loop minute: the known defects found by the runs, divided by their loop seconds / 60.
// - Interval rows: pairedBootstrap over the cases that the column and the reference both ran. The value of a case
//   is the mean over its runs. Round 1 recall: value round-1 found, weight known. Escaped per 50 known: value
//   escaped, weight known / 50. Loop seconds: value loop seconds, weight 1. A cell is `[low, high]`; the reference
//   column and a column without shared cases get `-`.
// - Formats: seconds and rounds median with 1 decimal; per-run, per-minute, recall, and escaped values with 2;
//   counts and tokens whole; `-` for no value.
test('the configuration table gives one column per configuration and the rows of each case group', () => {
  const round = (seconds, tokens, mode, fixer, answers) => [seconds, tokens, mode, fixer, answers];
  const fixture = gridFixture(
    {
      'code-7': { split: 'dev', known: ['D1', 'D2'] },
      'code-8': { split: 'dev', known: ['D1'] },
      'code-9': { split: 'heldout', known: ['D1'] },
    },
    [
      {
        case: 'code-7',
        config: 'low',
        rounds: [
          round(100, 1000, 'full', 30, ['D1', 'valid']),
          round(40, 200, 'delta', 10, ['valid']),
          round(20, 100, 'delta', 0, []),
        ],
      },
      { case: 'code-8', config: 'low', rounds: [round(60, 600, 'full', 20, ['D1']), round(30, 300, 'delta', 0, [])] },
      {
        case: 'code-7',
        config: 'low-fast',
        rounds: [round(50, 900, 'panel', 25, ['D1', 'D2']), round(20, 100, 'delta', 0, [])],
      },
      {
        case: 'code-8',
        config: 'low-fast',
        rounds: [round(30, 500, 'full', 15, ['D1', 'wrong']), round(10, 100, 'delta', 0, [])],
      },
      {
        case: 'code-7',
        config: 'high',
        rounds: [round(200, 3000, 'full', 40, ['D1', 'unknown']), round(80, 800, 'delta', 0, [])],
      },
      { case: 'code-8', config: 'high', rounds: [round(150, 2000, 'full', 0, ['wrong'])] },
      { case: 'code-9', config: 'low', rounds: [round(70, 700, 'full', 0, [])] },
      {
        case: 'code-9',
        config: 'low-fast',
        rounds: [round(35, 350, 'full', 5, ['D1']), round(15, 50, 'delta', 0, [])],
      },
    ],
  );
  fixture.metas['code-7/C1-low/run-1/round-1'].reviewers.full.sideCalls = [
    { model: 'openai-codex/gpt-6-luna', purpose: 'title', tokens: 362 },
  ];
  const scores = scoreRuns(fixture);
  const configs = ['low', 'low-fast', 'high'];
  const report = renderReport(scores, { configs });
  assert.deepEqual(tableAfter(report, '## Configurations: dev'), [
    '| Measure | low | low-fast | high |',
    '|---|---:|---:|---:|',
    '| Runs | 2 | 2 | 2 |',
    '| Round 1 seconds median | 80.0 | 40.0 | 175.0 |',
    '| Round 1 seconds min | 60.0 | 30.0 | 150.0 |',
    '| Round 1 seconds max | 100.0 | 50.0 | 200.0 |',
    '| Round 1 modes | full 2 | full 1, panel 1 | full 2 |',
    '| Round 1 known found per run | 1.00 | 1.50 | 0.50 |',
    '| Round 2 seconds median | 35.0 | 15.0 | 80.0 |',
    '| Round 2 seconds min | 30.0 | 10.0 | 80.0 |',
    '| Round 2 seconds max | 40.0 | 20.0 | 80.0 |',
    '| Round 2 modes | delta 2 | delta 2 | delta 1 |',
    '| Round 2 known found per run | 0.00 | 0.00 | 0.00 |',
    '| Round 3 seconds median | 20.0 | - | - |',
    '| Round 3 seconds min | 20.0 | - | - |',
    '| Round 3 seconds max | 20.0 | - | - |',
    '| Round 3 modes | delta 1 | - | - |',
    '| Round 3 known found per run | 0.00 | - | - |',
    '| Rounds median | 2.5 | 2.0 | 1.5 |',
    '| Rounds max | 3 | 2 | 2 |',
    '| Loop seconds median | 125.0 | 55.0 | 215.0 |',
    '| Known found per run | 1.00 | 1.50 | 0.50 |',
    '| Escaped per run | 0.50 | 0.00 | 1.00 |',
    '| Valid extras per run | 1.00 | 0.00 | 0.00 |',
    '| Extra-only rounds per run | 0.50 | 0.00 | 0.00 |',
    '| Wrong per run | 0.00 | 0.50 | 0.50 |',
    '| Unjudged per run | 0.00 | 0.00 | 0.00 |',
    '| Unknown ratings per run | 0.00 | 0.00 | 0.50 |',
    '| Unknown pairs per run | 0.00 | 0.00 | 0.00 |',
    '| Tokens median | 1100 | 800 | 2900 |',
    '| Side-call tokens median | 181 | 0 | 0 |',
    '| Fixer seconds median | 30.0 | 20.0 | 20.0 |',
    `| Model | ${MODEL} | ${MODEL} | ${MODEL} |`,
    '| Effort | low | low | high |',
    '| Served tier | default | priority | default |',
    '| Known found per loop minute | 0.48 | 1.64 | 0.14 |',
    '| Round 1 recall difference from low-fast, 90% interval | [-0.50, 0.00] | - | [-1.00, -0.50] |',
    '| Escaped per 50 known difference from low-fast, 90% interval | [0.00, 25.00] | - | [25.00, 50.00] |',
    '| Loop seconds difference from low-fast, 90% interval | [50.0, 90.0] | - | [110.0, 210.0] |',
  ]);
  const heldout = tableAfter(report, '## Configurations: heldout');
  for (const row of [
    '| Measure | low | low-fast | high |',
    '| Runs | 1 | 1 | 0 |',
    '| Round 1 seconds median | 70.0 | 35.0 | - |',
    '| Round 1 modes | full 1 | full 1 | - |',
    '| Round 1 known found per run | 0.00 | 1.00 | - |',
    '| Round 2 seconds median | - | 15.0 | - |',
    '| Escaped per run | 1.00 | 0.00 | - |',
    '| Effort | low | low | - |',
    '| Round 1 recall difference from low-fast, 90% interval | [-1.00, -1.00] | - | - |',
    '| Escaped per 50 known difference from low-fast, 90% interval | [50.00, 50.00] | - | - |',
    '| Loop seconds difference from low-fast, 90% interval | [20.0, 20.0] | - | - |',
  ]) {
    assert.ok(heldout.includes(row), `the heldout table lacks ${row}`);
  }
  assert.equal(
    heldout.some((row) => row.startsWith('| Round 3 ')),
    false,
  );
  assert.ok(report.indexOf('## Configurations: dev') < report.indexOf('## Configurations: heldout'));
  // Another reference, and the default column order: the configuration names in run order.
  const byLow = tableAfter(renderReport(scores, { configs, reference: 'low' }), '## Configurations: dev');
  assert.ok(byLow.includes('| Loop seconds difference from low, 90% interval | - | [-90.0, -50.0] | [60.0, 120.0] |'));
  assert.equal(tableAfter(renderReport(scores), '## Configurations: dev')[0], '| Measure | high | low | low-fast |');
});

test('pairedBootstrap gives a seeded 90% interval of the difference over resampled cases', () => {
  // Ten cases with the differences 0.1 to 1.0 on references far apart. The 90% interval is near 0.40 to 0.70.
  const spread = Array.from({ length: 10 }, (_, index) => ({
    case: `case-${index + 1}`,
    reference: index * 7,
    value: index * 7 + (index + 1) / 10,
  }));
  const realRandom = Math.random;
  Math.random = () => {
    throw new Error('pairedBootstrap must use its own seeded generator');
  };
  let first;
  let again;
  try {
    first = score.pairedBootstrap(spread, { seed: 7 });
    again = score.pairedBootstrap(spread, { seed: 7 });
  } finally {
    Math.random = realRandom;
  }
  assert.deepEqual(again, first);
  assert.deepEqual([first.cases, first.resamples], [10, 10000]);
  assert.ok(Math.abs(first.estimate - 0.55) < 1e-9, `estimate ${first.estimate}`);
  assert.ok(first.low >= 0.36 && first.low <= 0.44, `low ${first.low}`);
  assert.ok(first.high >= 0.66 && first.high <= 0.74, `high ${first.high}`);
  // Paired: the same difference on every case gives that difference, however far apart the references are.
  const constant = score.pairedBootstrap([
    { value: 0.1, reference: 0 },
    { value: 0.9, reference: 0.8 },
    { value: 50.1, reference: 50 },
  ]);
  for (const bound of [constant.estimate, constant.low, constant.high]) assert.ok(Math.abs(bound - 0.1) < 1e-9);
  // Weights make the statistic a ratio of sums: (3 + 0) / (3 + 1), not the mean of 3 / 3 and 0 / 1.
  assert.deepEqual(
    score.pairedBootstrap([
      { value: 4, reference: 1, weight: 3 },
      { value: 2, reference: 2, weight: 1 },
    ]),
    { estimate: 0.75, low: 0, high: 1, cases: 2, resamples: 10000 },
  );
  assert.deepEqual(score.pairedBootstrap([]), { estimate: null, low: null, high: null, cases: 0, resamples: 10000 });
});

test('report stops on a finding that has neither a match nor an adjudication and names it', (t) => {
  const { ws, cases } = workspace(t);
  const { findings } = findingsCommand(ws);
  pairsCommand(ws, cases);
  const blind = Object.fromEntries(findings.map((finding) => [finding.id, finding.blind]));
  const open = ['code-7/C3/run-2/correctness#2', 'plan-3/P0/run-1/plan#2'];
  judgeAll(
    ws,
    () => 'no',
    (id) => (open.includes(id) ? null : 'valid'),
  );
  assert.throws(
    () => reportCommand(ws),
    new RegExp(`no match and no adjudication for 2 findings: ${blind[open[0]]}, ${blind[open[1]]}$`),
  );
  assert.equal(fs.existsSync(path.join(ws, 'report.md')), false);
  judgeAll(ws, () => 'no');
  reportCommand(ws);
  const lines = fs.readFileSync(path.join(ws, 'report.md'), 'utf8').split('\n');
  assert.ok(
    lines.includes(
      '| code-7 | C3 | run-2 | 0.00 | - | 3 | 0 | 0 | 0 | 0 | 0 | - | - | incomplete | correctness: fixes-required, spec-and-tests: unreadable, text-and-safety: missing |',
    ),
  );
});

test('the judge agreement rate compares the answers of a second judge with the same answers of the first', (t) => {
  const first = {
    matches: [
      { finding: 'F-0000000001', known: 'D1', verdict: 'match' },
      { finding: 'F-0000000001', known: 'D2', verdict: 'no' },
      { finding: 'F-0000000002', known: 'D1', verdict: 'unknown' },
    ],
    adjudications: [
      { finding: 'F-0000000002', rating: 'valid' },
      { finding: 'F-0000000003', rating: 'wrong' },
    ],
  };
  const second = {
    matches: [
      { finding: 'F-0000000001', known: 'D1', verdict: 'match' },
      { finding: 'F-0000000002', known: 'D1', verdict: 'no' },
    ],
    adjudications: [{ finding: 'F-0000000003', rating: 'wrong' }],
  };
  assert.deepEqual(score.judgeAgreement(first, second), { answers: 3, agreed: 2, rate: 2 / 3 });
  assert.deepEqual(score.judgeAgreement(first, { matches: [], adjudications: [] }), {
    answers: 0,
    agreed: 0,
    rate: null,
  });
  assert.throws(
    () => score.judgeAgreement(first, { matches: [{ finding: 'F-0000000009', known: 'D1', verdict: 'no' }] }),
    /F-0000000009 and D1, which judgments\.json does not answer/,
  );
  assert.throws(
    () => score.judgeAgreement(first, { adjudications: [{ finding: 'F-0000000001', rating: 'valid' }] }),
    /F-0000000001, which judgments\.json does not answer/,
  );
  // The report reads the answers of the second judge from judgments-second.json when the file exists.
  const { ws, cases } = workspace(t);
  findingsCommand(ws);
  pairsCommand(ws, cases);
  const judgments = judgeAll(ws, () => 'no');
  reportCommand(ws);
  const reportFile = path.join(ws, 'report.md');
  assert.equal(fs.readFileSync(reportFile, 'utf8').includes('## Judge agreement'), false);
  const [kept, changed] = judgments.matches;
  put(ws, 'judgments-second.json', {
    matches: [kept, { ...changed, verdict: 'match' }],
    adjudications: [judgments.adjudications[0]],
  });
  reportCommand(ws);
  const lines = fs.readFileSync(reportFile, 'utf8').split('\n');
  assert.ok(lines.includes('## Judge agreement'));
  assert.ok(lines.includes('The second judge agreed with 2 of 3 answers (0.67).'));
});

test('pairs and report read held-out keys from --keys instead of the cases folder', (t) => {
  const { ws, cases } = workspace(t);
  const keys = path.join(path.dirname(ws), 'keys');
  const outside = [PLAN_KEY[0], { id: 'K7', title: 'Steps miss the rollback', locator: 'Steps 4' }];
  put(keys, 'plan-3.key.json', { known: outside });
  put(keys, 'list-1.key.json', outside);
  put(keys, 'bad-1.key.json', { known: [{ title: 'No id' }] });
  assert.deepEqual(score.readKey(keys, 'plan-3'), outside);
  assert.deepEqual(score.readKey(keys, 'list-1'), outside);
  assert.equal(score.readKey(keys, 'code-7'), undefined);
  assert.throws(
    () => score.readKey(keys, 'bad-1'),
    /the known defects of bad-1 must be a list of items with a string id/,
  );
  findingsCommand(ws);
  assert.match(main(['pairs', ws, '--cases', cases, '--keys', keys]), /^pairs\.json: \d+ candidate pairs in 2 cases$/);
  // The dev case keeps its inline known defects; the held-out case takes the key of the --keys folder.
  assert.deepEqual(
    readJson(path.join(ws, 'pairs.json')).cases.map((entry) => [entry.case, entry.known]),
    [
      ['code-7', CODE_KNOWN],
      ['plan-3', outside],
    ],
  );
  judgeAll(ws, () => 'no');
  assert.equal(main(['report', ws, '--keys', keys]), 'report.md: 4 runs');
  // A key that changed after pairs.json stops the report.
  put(keys, 'plan-3.key.json', { known: [...outside, { id: 'K8', title: 'Late defect', locator: 'Steps 5' }] });
  assert.throws(
    () => main(['report', ws, '--keys', keys]),
    /pairs\.json is out of date for plan-3.*run score\.mjs pairs again/,
  );
  // With --keys, a held-out key that is not in that folder stops pairs, also when the cases folder has one.
  fs.rmSync(path.join(keys, 'plan-3.key.json'));
  assert.ok(fs.existsSync(path.join(cases, 'heldout/plan-3.key.json')));
  assert.throws(
    () => main(['pairs', ws, '--cases', cases, '--keys', keys]),
    new RegExp(`${escapeRegExp(path.join(keys, 'plan-3.key.json'))} is missing`),
  );
});
