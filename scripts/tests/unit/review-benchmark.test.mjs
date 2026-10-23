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
    adjudications: [
      { finding: blind['code-7/C3/run-1/spec-and-tests#1'], rating: 'valid', reason: 'The check is weak.' },
      { finding: blind['code-7/C3/run-1/correctness#2'], rating: 'wrong', reason: 'The index is cached.' },
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
    '| code-7 | C3 | run-2 | 0.00 | - | 0 | 0 | 0 | 3 | 0 | 0 | - | - | incomplete | correctness: fixes-required, spec-and-tests: unreadable, text-and-safety: missing |',
    '| plan-3 | P0 | run-1 | 0.50 | K1 | 0 | 0 | 0 | 1 | 0 | 0 | - | - | repair | plan: repair |',
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
  assert.deepEqual(readJson(path.join(ws, 'code-7/C3/run-1/meta.json')), {
    note: 'kept',
    reviewers: {
      correctness: { seconds: 30, tokens: 100, model: 'm' },
      'spec-and-tests': { seconds: 40, tokens: 200 },
      'text-and-safety': { seconds: 50, tokens: 300 },
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
