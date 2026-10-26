import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import * as prepare from '../../../.agents/skills/review-benchmark/scripts/prepare.mjs';
import { focusesForPath } from '../../../.agents/skills/review-benchmark/scripts/prepare.mjs';
import * as score from '../../../.agents/skills/review-benchmark/scripts/score.mjs';
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
const taskMessage = (caseDir) => ({
  role: 'user',
  content: [{ type: 'text', text: `Plan export: ${path.join(caseDir, 'plan.md')}` }],
});

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
  // Blocks returned JSON-wrapped, as a JSON string or as an object whose one review field holds the block next to
  // other fields that the reviewer added, parse as the plain block. An object without a review field is unreadable.
  const passBlock = '### Code review round 1\n\nCode-review: pass\n\nNone.';
  const shapes = [
    [JSON.stringify({ review: passBlock }), 'pass', 0],
    [JSON.stringify({ report: CORRECTNESS_BLOCK }), 'fixes-required', 3],
    [JSON.stringify(passBlock), 'pass', 0],
    [JSON.stringify(CORRECTNESS_BLOCK), 'fixes-required', 3],
    [
      JSON.stringify({ acknowledgment: { mode: 'panel', lens: 'correctness' }, review: CORRECTNESS_BLOCK }),
      'fixes-required',
      3,
    ],
    [JSON.stringify({ acknowledgment: 'Reviewed panel mode, round 1.', issue: 7, review: passBlock }), 'pass', 0],
    [JSON.stringify({ acknowledgment: { mode: 'panel', lens: 'correctness' } }), 'unreadable', 0],
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
  const { removed, ...doc } = findingsCommand(ws);
  assert.deepEqual(readJson(path.join(ws, 'findings.json')), doc);
  // A first run has no previous findings.json, so it removes no judge answer.
  assert.deepEqual(removed, []);
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
  assert.deepEqual(findingsCommand(ws), { ...doc, removed: [] });
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

// Five C3 runs and one B0 run of a case with three known defects, as findings.json and judgments.json give them. Runs
// 1, 4, and 5 of C3 are valid and differ in recall, ratings, seconds, and tokens, so each summary statistic differs.
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
  const [r4c1, r4c2] = add('C3', 'run-4', 'correctness', 'fixes-required', 2);
  const [r4s1] = add('C3', 'run-4', 'spec-and-tests', 'pass', 1);
  add('C3', 'run-4', 'text-and-safety', 'pass', 0);
  const [r5c1, r5c2, r5c3] = add('C3', 'run-5', 'correctness', 'fixes-required', 3);
  const [r5s1, r5s2] = add('C3', 'run-5', 'spec-and-tests', 'fixes-required', 2);
  const [r5t1] = add('C3', 'run-5', 'text-and-safety', 'pass', 1);
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
      match(r4c1, 'D1', 'no'),
      match(r5c1, 'D1', 'match'),
      match(r5c2, 'D3', 'match'),
      match(r5s1, 'D2', 'match'),
    ],
    // r1t1 matched D1, so its rating does not count; the second text-and-safety finding of run-2 has no rating.
    adjudications: [
      rate(r1t1, 'valid'),
      rate(r2s1, 'valid'),
      rate(r2s2, 'wrong'),
      rate(r2t1, 'unknown'),
      rate(r3c1, 'wrong'),
      rate(r4c1, 'valid'),
      rate(r4c2, 'valid'),
      rate(r4s1, 'unknown'),
      rate(r5c3, 'wrong'),
      rate(r5s2, 'valid'),
      rate(r5t1, 'wrong'),
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
    'code-7/C3/run-4': {
      reviewers: {
        correctness: { seconds: 30, tokens: 300 },
        'spec-and-tests': { seconds: 45, tokens: 400 },
        'text-and-safety': { seconds: 20, tokens: 100 },
      },
    },
    'code-7/C3/run-5': {
      reviewers: {
        correctness: { seconds: 300, tokens: 5000 },
        'spec-and-tests': { seconds: 250, tokens: 3000 },
        'text-and-safety': { seconds: 260, tokens: 1000 },
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
  assert.deepEqual(Object.keys(runs), ['B0/run-1', 'C3/run-1', 'C3/run-2', 'C3/run-3', 'C3/run-4', 'C3/run-5']);
  assert.deepEqual(runs['C3/run-1'].found, ['D1', 'D2']);
  assert.equal(runs['C3/run-1'].recall, 2 / 3);
  assert.deepEqual(runs['C3/run-2'].found, ['D1', 'D2', 'D3']);
  assert.equal(runs['C3/run-2'].recall, 1);
  assert.deepEqual(runs['C3/run-3'].found, []);
  assert.equal(runs['C3/run-3'].recall, 0);
  assert.deepEqual(runs['C3/run-4'].found, []);
  assert.equal(runs['C3/run-4'].recall, 0);
  assert.deepEqual(runs['C3/run-5'].found, ['D1', 'D2', 'D3']);
  assert.equal(runs['C3/run-5'].recall, 1);
  // A blocked block and a missing block hold no review, so runs 2 and 3 of C3 are invalid and leave the summary.
  assert.deepEqual(
    scores.runs.map((run) => [`${run.arm}/${run.run}`, run.invalid]),
    [
      ['B0/run-1', []],
      ['C3/run-1', []],
      ['C3/run-2', ['correctness: no review (blocked)']],
      ['C3/run-3', ['text-and-safety: no review (missing)']],
      ['C3/run-4', []],
      ['C3/run-5', []],
    ],
  );
  const [b0, c3] = scores.summaries;
  assert.deepEqual([b0.arm, b0.runs, b0.known, b0.recall], ['B0', 1, 3, { mean: 0, median: 0, min: 0, max: 0 }]);
  // The summary covers runs 1, 4, and 5 of C3, with the recalls 2/3, 0, and 1.
  assert.deepEqual([c3.arm, c3.runs, c3.known], ['C3', 3, 3]);
  assert.deepEqual(c3.recall, { mean: (0 + 2 / 3 + 1) / 3, median: 2 / 3, min: 0, max: 1 });
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
    'C3/run-4': [2, 0, 1, 0],
    'C3/run-5': [1, 2, 0, 0],
  });
  // The summary covers runs 1, 4, and 5 of C3, the valid runs: each count has another mean.
  const c3 = scores.summaries[1];
  assert.deepEqual([c3.validExtras, c3.wrong, c3.unknown], [1, 2 / 3, 1 / 3]);
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
      [45, 800, 'fixes-required'],
      [300, 9000, 'fixes-required'],
    ],
  );
  assert.deepEqual(runs['C3/run-2'].verdicts, [
    { reviewer: 'correctness', verdict: 'blocked' },
    { reviewer: 'spec-and-tests', verdict: 'fixes-required' },
    { reviewer: 'text-and-safety', verdict: 'pass' },
  ]);
  // The summary covers runs 1, 4, and 5 of C3, the valid runs.
  assert.deepEqual(scores.summaries[1].seconds, { mean: (45 + 140.5 + 300) / 3, median: 140.5, min: 45, max: 300 });
  assert.deepEqual(scores.summaries[1].tokens, { mean: (800 + 3500 + 9000) / 3, median: 3500, min: 800, max: 9000 });
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
  const belongs = () => true;
  assert.equal(pickTranscript(files, 'Code7C3R1Correctness', belongs), '/s/Code7C3R1Correctness-2.jsonl');
  assert.equal(pickTranscript(files, 'Code7C3R1Full', belongs), '/s/Parent/Parent.Code7C3R1Full.jsonl');
  assert.equal(pickTranscript(files, 'Code7C3R2Full', belongs), undefined);
  assert.throws(
    () => pickTranscript(['/a/Name.jsonl', '/b/P.Name.jsonl'], 'Name', belongs),
    /more than one transcript for Name/,
  );
});

test('transcripts command fills meta files by dispatch name and keeps other fields', (t) => {
  const { ws } = workspace(t);
  const sessions = path.join(path.dirname(ws), 'sessions');
  const at = (second) => new Date(Date.UTC(2026, 0, 1, 0, 0, second)).toISOString();
  const transcript = (seconds, input) =>
    [
      { type: 'message', timestamp: at(0), message: taskMessage(path.join(ws, 'code-7')) },
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
  // These transcripts name no model, effort, or tier: the facts hold nulls and one message without a model or effort.
  const facts = { requestedTier: null, messages: [{ model: null, effort: null, servedTier: null }], sideCalls: [] };
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

test('transcripts command keeps same-name dispatches of two workspaces separate in one session', (t) => {
  const root = scratch(t);
  const sessions = path.join(root, 'sessions');
  const earlier = path.join(root, 'ws');
  const later = path.join(root, 'ws-later');
  const roundDir = path.join('code-7', 'C1-low', 'run-1', 'round-1');
  const reviewerName = 'Code7C1LowR1K1Full';
  const fixerName = 'Code7C1LowR1K1Fixer1';
  const transcript = (ws, seconds, fixer = false) => {
    const caseDir = path.join(ws, 'code-7');
    const target = path.join(ws, roundDir, ...(fixer ? ['fixer'] : []), 'snapshot', 'src', 'sync.mjs');
    return toolTranscript(caseDir, seconds, [['read', { path: target }]])
      .split('\n')
      .map((line) => {
        const entry = JSON.parse(line);
        if (entry.type === 'session_init') entry.padding = 'x'.repeat(70 * 1024);
        // omp can store a task as a string or as text parts.
        if (entry.message?.role === 'user' && ws === earlier)
          entry.message.content = taskMessage(caseDir).content[0].text;
        return JSON.stringify(entry);
      })
      .join('\n');
  };
  for (const ws of [earlier, later]) {
    put(ws, 'code-7/case.json', { id: 'code-7', kind: 'code', split: 'dev' });
    put(ws, 'code-7/full.diff', '');
    put(ws, path.join(roundDir, 'prompts/full.txt'), 'agent: review-bench-candidate-code-low\n\nReview.\n');
    put(ws, path.join(roundDir, 'fixer/fixer-1.txt'), 'agent: review-bench-fixer\n\nRepair.\n');
  }
  put(sessions, `${reviewerName}.jsonl`, transcript(earlier, 10));
  put(sessions, `${reviewerName}-2.jsonl`, transcript(earlier, 20));
  put(sessions, `${reviewerName}-3.jsonl`, transcript(later, 30));
  put(sessions, `Lead/Lead.${fixerName}.jsonl`, transcript(earlier, 40, true));
  put(sessions, `Lead/Lead.${fixerName}-2.jsonl`, transcript(later, 50, true));
  // A later user message cannot claim a transcript for a workspace. The lookup must stop at the first user message,
  // and must not parse the rest of a rejected candidate.
  put(
    sessions,
    `${reviewerName}-9.jsonl`,
    `${[
      { type: 'session_init', task: taskMessage(path.join(earlier, 'code-7')).content[0].text },
      { type: 'message', message: taskMessage(path.join(root, 'other', 'code-7')) },
      { type: 'message', message: taskMessage(path.join(earlier, 'code-7')) },
      { type: 'message', message: taskMessage(path.join(later, 'code-7')) },
    ]
      .map((entry) => JSON.stringify(entry))
      .join('\n')}\nnot JSON\n`,
  );
  for (const [ws, reviewerSeconds, fixerSeconds] of [
    [earlier, 20, 40],
    [later, 30, 50],
  ]) {
    assert.deepEqual(transcriptsCommand(ws, sessions), [reviewerName, fixerName]);
    const meta = readJson(path.join(ws, roundDir, 'meta.json'));
    assert.equal(meta.reviewers.full.seconds, reviewerSeconds);
    assert.deepEqual(meta.reviewers.full.readScope, { outside: [] });
    assert.equal(meta.fixer.seconds, fixerSeconds);
  }
  // The transcript of the earlier workspace is not a substitute for a missing transcript of the later one.
  fs.rmSync(path.join(sessions, `Lead/Lead.${fixerName}-2.jsonl`));
  assert.throws(() => transcriptsCommand(later, sessions), /no transcript .*Code7C1LowR1K1Fixer1/);
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
// - transcriptFacts(text, source = 'transcript') -> { requestedTier, messages, sideCalls }
//   requestedTier: `serviceTier.openai` of the last `service_tier_change`, else null.
//   messages: one { model, effort, servedTier } per assistant message, in transcript order. model is
//   `<provider>/<model>` (`<model>` without a provider, null without a model). effort is the `thinkingLevel` of the
//   last `thinking_level_change` before the message, else null. servedTier is `message.serviceTier`, else null. A
//   message with `stopReason: 'error'` and no `serviceTier` (a failed request) also gets `failed: true`.
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
//   assistant message of `model` or failed request, and tokens add only the messages of `model`. With no such
//   message, the result is { seconds: null, tokens: 0 }. Without `model`, the result does not change.
// - transcriptsCommand writes { ...parseTranscript(text, file, meta.config?.model), ...transcriptFacts(text, file) }
//   into meta.reviewers[reviewer]. The existing test 'transcripts command fills meta files ...' then gets these
//   fields in each reviewer entry.
// - Rounds: a run folder can hold `round-<r>/` folders, each with prompts/, blocks/, and meta.json. The blocks and
//   findings of such a run have `round: <r>`, and a finding id is `<case>/<arm>/<run>/round-<r>/<reviewer>#<n>`.
//   scoreRuns reads its meta at metas['<case>/<arm>/<run>/round-<r>']. A run without round folders is round 1: no
//   `round` field, and its ids and meta key do not change. Dispatch names of round folders are for step 3.
// - pairs.json: each case entry gets the `split` of its case.json. scoreRuns takes the case group from it.
// - scoreRuns: each run gets `config` (meta.config of the run, or of its round 1, else null), `invalid` (a list of
//   reasons; empty for a valid run), `loop` (true when the run has round folders), and `rounds`: one { round, mode,
//   seconds, tokens, found, verdict, fixer } per round, in order. mode is meta.mode; seconds is the slowest
//   reviewer; tokens is the sum; found lists the known ids that the round matched; verdict is roundVerdict of its
//   blocks; fixer is true when meta.fixer is set. The run's seconds and tokens are sums over its rounds; found,
//   recall, and the finding counts cover all rounds; verdicts and roundVerdict are those of the last round.
//   Summaries leave out invalid runs.
// - Invalid run: every run is checked for reads outside its inputs, and a run with `config` is also checked against
//   its configuration, and its loop fixers against `fixerConfig`. Each reviewer or fixer entry can give these reasons:
//   `<reviewer>: read outside its inputs: <targets>` when readScope.outside is not empty (every run);
//   `<agent>: model <m>, not <setting.model>` for each other model of the messages that are not failed requests;
//   `<agent>: effort <e>, not <setting.effort>` for each other effort of the messages of setting.model;
//   `<agent>: served tier <t>, not <setting.tier>` for each other served tier of the messages of setting.model that
//   are not failed requests, when setting.tier is not null;
//   `<agent>: no transcript facts` when the entry has no `messages`, and `<agent>: no served assistant message` when
//   every message is a failed request; `round-<r>/<fixer>: no fixer setting` for a fixer entry without
//   `fixerConfig`. These reasons need `config`. In a run with round folders, <reviewer> is `round-<r>/<reviewer>`,
//   and a fixer is `round-<r>/fixer-1`. A round whose meta.json has a non-empty `fix.extras` or `fixedByFixer` and
//   no `fixer.agents` entry counts as the fixer entry `fixer-1` without `messages`, so it gives
//   `round-<r>/fixer-1: no transcript facts` (or `no fixer setting` without `fixerConfig`).
//   A reviewer block whose verdict is `missing`, `unreadable`, or `blocked` holds no review, so it makes its run
//   invalid (every run) with `<reviewer>: no review (<verdict>)`, before the other reasons of that reviewer.
// - renderReport(scores, { configs, reference } = {}) keeps the Summary and Runs tables and adds:
//   `## Invalid runs`, only when there is an invalid run: one line `- <case>/<arm>/<run>: <reasons joined by "; ">`
//   per invalid run;
//   `## Configurations: <split>`: one section per case group, in name order, from the valid runs with a config of
//   the columns (a case without `split` is in the group `-`). The columns are `configs` in that order (default: the
//   config names in run order). A section holds `### Decision: <split>` over all its runs, `### Code loops: <split>`
//   over its loop runs, and `### Single reviews: <split>` over its other runs; a table without runs is left out.
//   `reference` is the base of the interval rows (default: of the columns with known defects, the one with the
//   fewest escaped per 50 known; on a tie, the first). The test 'the configuration table ...' gives every row; the
//   rows are defined above it;
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
// The fixer setting that `prepare.mjs agents` writes by default.
const FIXER_SETTING = { model: MODEL, effort: 'high', tier: 'priority' };
// One reviewer entry of meta.json, as `score.mjs transcripts` writes it for a reviewer that used its configuration.
const provenCost = (config, seconds, tokens, facts = {}) => ({
  seconds,
  tokens,
  requestedTier: config.tier,
  messages: [{ model: config.model, effort: config.effort, servedTier: config.tier }],
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
// The effort changes before the first assistant message are setup: every message shows the last of them.
const FALLBACK_FACTS = {
  requestedTier: 'priority',
  messages: [
    { model: MODEL, effort: 'xhigh', servedTier: 'priority' },
    { model: MODEL, effort: 'xhigh', servedTier: 'priority' },
    { model: 'anthropic/claude-opus-5-5', effort: 'xhigh', servedTier: null },
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

// Runs of `<arm>-<config>` arm folders, as scoreRuns gets them. `cases` maps a case id to its split, known ids, and
// kind (default `code`). Each run is { case, config, arm, run, rounds, single }: arm defaults to `C1` and run to 1, so
// without them a fixture has one run per case and config. Each round is [seconds, tokens, mode, fixer seconds,
// answers]. A run has round folders; a run with `single: true` is a single review: its one round has no round folder.
// An answer is a finding: the known id that it matches, or the rating of a finding without a match. Each round of a
// loop before its last round gets the record of its fix step, as `loop` writes it: `fix` with a fix of each matched
// known defect and the valid extras, and `fixAlreadyApplied` with the matched defects that an earlier round of the
// run fixed, whose fix the tree still holds. As `case --loop` and `transcripts` write them, round 1 of a loop gets the
// fixer setting (`fixerConfig`), and a round whose fix step gives valid extras to the fixer gets the transcript facts
// of a fixer that used this setting (`fixer.agents`).
function gridFixture(cases, runs) {
  const blocks = [];
  const findings = [];
  const judgments = { matches: [], adjudications: [] };
  const metas = {};
  for (const spec of runs) {
    const config = CONFIGS[spec.config];
    const kind = cases[spec.case].kind ?? 'code';
    const arm = `${spec.arm ?? 'C1'}-${config.name}`;
    const run = `run-${spec.run ?? 1}`;
    const fixed = new Set();
    for (const [index, [seconds, tokens, mode, fixer, answers]] of spec.rounds.entries()) {
      const inRound = spec.single ? {} : { round: index + 1 };
      const folder = spec.single ? `${spec.case}/${arm}/${run}` : `${spec.case}/${arm}/${run}/round-${index + 1}`;
      const verdict = answers.length ? 'fixes-required' : 'pass';
      blocks.push({
        case: spec.case,
        kind,
        arm,
        run,
        ...inRound,
        reviewer: 'full',
        verdict,
        findings: answers.length,
      });
      metas[folder] = {
        config,
        mode,
        ...(!spec.single && index === 0 ? { fixerConfig: FIXER_SETTING } : {}),
        ...(fixer ? { fixer: { seconds: fixer } } : {}),
        reviewers: { full: provenCost(config, seconds, tokens) },
      };
      const matched = [];
      const extras = [];
      for (const [n, answer] of answers.entries()) {
        const id = `${folder}/full#${n + 1}`;
        const blind = blindId(id);
        findings.push({ id, blind, case: spec.case, arm, run, ...inRound, reviewer: 'full', n: n + 1 });
        if (['valid', 'wrong', 'unknown'].includes(answer)) {
          judgments.adjudications.push({ finding: blind, rating: answer, reason: 'Read the snapshot.' });
          if (answer === 'valid') extras.push(id);
        } else {
          judgments.matches.push({ finding: blind, known: answer, verdict: 'match', reason: 'Same cause.' });
          if (!matched.includes(answer)) matched.push(answer);
        }
      }
      if (spec.single || index === spec.rounds.length - 1) continue;
      const fixes = matched.map((known) => ({ known, patch: `${spec.case}.${known}.fix.patch` }));
      metas[folder].fix = { fixes, extras, rejections: [] };
      if (extras.length) {
        metas[folder].fixer = { ...metas[folder].fixer, agents: { 'fixer-1': provenCost(FIXER_SETTING, fixer, 0) } };
      }
      const present = matched.filter((known) => fixed.has(known));
      if (present.length) metas[folder].fixAlreadyApplied = present;
      for (const known of matched) fixed.add(known);
    }
  }
  const pairs = {
    cases: Object.entries(cases).map(([id, { split, known, kind = 'code' }]) => ({
      case: id,
      kind,
      split,
      known: known.map((knownId) => ({ id: knownId, title: `Hidden ${knownId}`, locator: 'src/sync.mjs:1' })),
      runs: [],
    })),
  };
  return { findings: { blocks, findings }, pairs, judgments, metas };
}

test('transcript facts give the model, effort, and served tier of each message and the last requested tier', () => {
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
    requestedTier: null,
    messages: [{ model: null, effort: null, servedTier: null }],
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
  put(
    sessions,
    'Code7C1XhighFastR1Full.jsonl',
    jsonl(
      FALLBACK_TRANSCRIPT.map((entry) =>
        entry.message?.role === 'user' ? { ...entry, message: taskMessage(path.join(ws, 'code-7')) } : entry,
      ),
    ),
  );
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
    { model: MODEL, effort: 'xhigh', servedTier: 'priority' },
    { model: 'anthropic/claude-opus-5-5', effort: 'xhigh', servedTier: null },
  ];
  const costs = [
    proven(100),
    proven(500, { messages: fallback }),
    proven(600, { messages: [{ model: MODEL, effort: 'high', servedTier: 'priority' }] }),
    proven(700, { messages: [{ model: MODEL, effort: 'xhigh', servedTier: 'default' }] }),
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
  const table = tableAfter(fs.readFileSync(path.join(ws, 'report.md'), 'utf8'), '### Code loops: dev');
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

// Rows of the configuration tables. A column holds the valid runs of one configuration in one case group.
// - Runs: the number of runs of the table.
// Decision table, over all runs of the group:
// - Known found per run, Escaped per run (known minus found), as below. Escaped per 50 known: the escaped defects of
//   the runs, times 50, divided by the known defects of their cases.
// - Model, Effort, Served tier: the different values of the transcript facts (messages[].model, messages[].effort,
//   messages[].servedTier; the model and the served tier leave out failed requests), joined by ", ".
// - Interval rows: pairedBootstrap over the cases that the column and the reference both ran. The value of a case
//   is the mean over its runs. Round 1 recall: value round-1 found, weight known. Escaped per 50 known: value
//   escaped, weight known / 50. Loop seconds: value loop seconds, weight 1, over loop runs only. A cell is
//   `[low, high]`; the reference column and a column without shared cases get `-`.
// Code-loop table, over the loop runs (runs with round folders):
// - Model, Effort, Served tier after Runs, as in the decision table.
// - Round <r> rows, for r from 1 to the highest round of the loops, cover the loops that reached round r: seconds
//   median, min, and max (round seconds); modes (`<mode> <count>` in mode-name order, joined by ", "); known found
//   per run (the known defects that round r found, divided by the loops that reached it).
// - Rounds median and max: the rounds of a loop. Loop seconds median: the sum of the round seconds of a loop.
// - `... per run`: the sum over the runs divided by the runs. Known found (by the end of the loop), Escaped (known
//   minus found), Valid extras, Extra-only rounds (rounds r >= 2 whose round r - 1 records a fix step that gave
//   valid extras to the fixer and repaired no known defect), Wrong, Unjudged, Unknown ratings, and Unknown pairs.
// - Tokens median; Side-call tokens median (the sideCalls tokens of a run).
// - Loops with a fixer: the loops with meta.fixer in a round. Fixer seconds median and Fixer tokens median: over those
//   loops only, the sum of meta.fixer.seconds and the sum of meta.fixer.tokens over the rounds of a loop.
// - Known found per loop minute: the known defects found by the loops, divided by their loop seconds / 60.
// Single-review table, over the other runs: Model, Effort, and Served tier after Runs, as in the decision table;
// Seconds median, min, and max; the `... per run` rows without Extra-only rounds; Tokens median.
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
      // A C1 loop runs no panel round, so the loop with a panel round 1 is a C3 loop.
      {
        case: 'code-7',
        config: 'low-fast',
        arm: 'C3',
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
  // The reference is low-fast, the column with the fewest escaped defects per 50 known defects.
  assert.deepEqual(tableAfter(report, '## Configurations: dev'), [
    '| Measure | low | low-fast | high |',
    '|---|---:|---:|---:|',
    '| Runs | 2 | 2 | 2 |',
    '| Known found per run | 1.00 | 1.50 | 0.50 |',
    '| Escaped per run | 0.50 | 0.00 | 1.00 |',
    '| Escaped per 50 known | 16.67 | 0.00 | 33.33 |',
    `| Model | ${MODEL} | ${MODEL} | ${MODEL} |`,
    '| Effort | low | low | high |',
    '| Served tier | default | priority | default |',
    '| Round 1 recall difference from low-fast, 90% interval | [-0.50, 0.00] | - | [-1.00, -0.50] |',
    '| Escaped per 50 known difference from low-fast, 90% interval | [0.00, 25.00] | - | [25.00, 50.00] |',
    '| Loop seconds difference from low-fast, 90% interval | [50.0, 90.0] | - | [110.0, 210.0] |',
  ]);
  assert.deepEqual(tableAfter(report, '### Decision: dev'), tableAfter(report, '## Configurations: dev'));
  assert.deepEqual(tableAfter(report, '### Code loops: dev'), [
    '| Measure | low | low-fast | high |',
    '|---|---:|---:|---:|',
    '| Runs | 2 | 2 | 2 |',
    `| Model | ${MODEL} | ${MODEL} | ${MODEL} |`,
    '| Effort | low | low | high |',
    '| Served tier | default | priority | default |',
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
    // The high loop of code-8 ran no fixer, so the median covers only its code-7 loop.
    '| Loops with a fixer | 2 | 2 | 1 |',
    '| Fixer seconds median | 30.0 | 20.0 | 40.0 |',
    // The fixers of this fixture record no tokens.
    '| Fixer tokens median | 0 | 0 | 0 |',
    '| Known found per loop minute | 0.48 | 1.64 | 0.14 |',
  ]);
  // Every run of the grid is a loop, so no section has a single-review table.
  assert.equal(report.includes('### Single reviews: '), false);
  const heldout = tableAfter(report, '### Decision: heldout');
  for (const row of [
    '| Measure | low | low-fast | high |',
    '| Runs | 1 | 1 | 0 |',
    '| Escaped per run | 1.00 | 0.00 | - |',
    '| Escaped per 50 known | 50.00 | 0.00 | - |',
    '| Effort | low | low | - |',
    '| Round 1 recall difference from low-fast, 90% interval | [-1.00, -1.00] | - | - |',
    '| Escaped per 50 known difference from low-fast, 90% interval | [50.00, 50.00] | - | - |',
    '| Loop seconds difference from low-fast, 90% interval | [20.0, 20.0] | - | - |',
  ]) {
    assert.ok(heldout.includes(row), `the heldout decision table lacks ${row}`);
  }
  const heldoutLoops = tableAfter(report, '### Code loops: heldout');
  for (const row of [
    '| Measure | low | low-fast | high |',
    '| Runs | 1 | 1 | 0 |',
    '| Round 1 seconds median | 70.0 | 35.0 | - |',
    '| Round 1 modes | full 1 | full 1 | - |',
    '| Round 1 known found per run | 0.00 | 1.00 | - |',
    '| Round 2 seconds median | - | 15.0 | - |',
  ]) {
    assert.ok(heldoutLoops.includes(row), `the heldout code-loop table lacks ${row}`);
  }
  assert.equal(
    heldoutLoops.some((row) => row.startsWith('| Round 3 ')),
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

// Plan #100 step 3: API note for the tests below. They read the new exports through `prepare` and `score`.
//
// New exports of prepare.mjs:
// - LOOP_POLICIES: the round policies of a loop, { 'panel-delta', 'full-delta', full }, each { panel, delta }. ARMS.code
//   gives B0 the policy 'full', B1 and C3 'panel-delta', and C1 'full-delta'; S1 and S3 have no policy.
// - roundMode({ policy, round, fullLines, completed, repairsOnly, deltaLines, merge = false })
//   -> 'full' | 'panel' | 'delta'. policy is required: a key of LOOP_POLICIES.
//   The modes of plan-contract.md, Code-review rounds. fullLines is the size (added plus removed lines) of the full
//   diff of the round's reviewed head; deltaLines is the size of the diff from the previous round's reviewed head.
//   The size rule gives 'panel' for 50 or more full-diff lines and 'full' below; a policy without `panel` gives
//   'full'. Round 1 follows the size rule and reads no field but policy. A later round is 'delta' only when the
//   policy has `delta`, the previous round completed (every reviewer returned a block with a verdict line, and none
//   returned `blocked`), repairsOnly (every change since that round's head repairs one of its findings), not merge
//   (a merge of the default branch), and deltaLines * 2 <= fullLines. Otherwise the size rule decides.
// - prepareCase(options, repo) and prepareLoop(options, repo): the `case` and `loop` commands. options holds the
//   flags by long name, as parseArgs gives them; repo is the git repository of the case commits (main passes the
//   repository of the script). When the skill folder is not inside repo, the snapshots and diffs leave nothing out.
//
// Changed exports of prepare.mjs:
// - validateCase accepts `external`: a list of file fields that the case has (plan, patch, previous_review,
//   previous_body, rejection). Another entry fails: `case <id>: external names <field>, which is not a file field of
//   the case`.
// - `case --keys <dir>` (options.keys) reads the files of the `external` fields from <dir> instead of the case
//   folder. Without it, a case with `external` stops before it writes: `case <id> keeps <fields joined by ", "> in
//   the key folder; give that folder with --keys <dir>`. The workspace gets plan.md, the snapshot, and the diffs as
//   today, and no file of the key folder under its own name.
//
// `loop --run <ws>/<case>/<arm>-<config>/run-<n> --cases <dir> [--keys <dir>] [--fixer-patch <file>]` (options run,
// cases, keys, and 'fixer-patch') continues the loop of one run of a code case after its last round folder, round k:
// 1. A case with `external` and no keys stops as `case` does. `case --loop` writes { policy } (the round policy of
//    the arm) to run-<n>/meta.json, and the later rounds follow the policy that this meta.json records, also when it
//    is not the policy of the arm. A run whose meta.json records no policy stops: `<run>/meta.json records no round
//    policy; build the loop again with case --loop, ...`; a policy that is not a key of LOOP_POLICIES stops:
//    `<run>/meta.json records the unknown round policy "<policy>"; ...`. A round-k block whose
//    verdict is not pass or fixes-required stops the command: `<case>/<arm>/<run>/round-<k> did not complete;
//    dispatch these reviewers again, save their blocks, and run score.mjs findings again: <reviewer> (<reason>)`,
//    with the reason `no block`, `no verdict line`, or `blocked`. The command reads <ws>/findings.json,
//    <ws>/judgments.json (a missing file holds no answers), and the known defects through score.mjs readKnown(cases,
//    case, split, keys). The fix patches come from the folder of the known defects: the case folder for inline
//    `known`, else the key folder.
// 2. plan = score.fixPlan({ findings: the round-k findings of the run, judgments, known, applied }), where applied
//    lists the `known` ids of `fix.fixes` in the meta.json of rounds 1 to k - 1, in order. When
//    score.loopEnds(k, plan), the command writes nothing and returns null. It also ends so after it applies the fix
//    patches, when no extra stands and every fix of a matched defect applies in reverse (the tree holds the fix).
//    After the fixer patch (step 4), it also ends when the fix step repaired no finding of round k: no fix patch that
//    is not `pulled` applied, and the fixer patch changed nothing (step 4). A pulled-in patch repairs no finding, also
//    when it changes the tree. Then it writes the round-k record of step 5 with `fixRepairedNothing: true`, writes no
//    round folder, and returns null.
// 3. With plan.extras and no fixer patch, it writes round-k/fixer/ and stops before it writes round k + 1:
//    `<case>/<arm>/<run>/round-<k> has <n> valid extra findings for the fixer: <ids joined by ", ">; give their repair
//    with --fixer-patch <file>`. round-k/fixer/ holds snapshot/ (the round-k tree after the fix patches of plan.fixes)
//    and fixer-1.txt, the one fixer prompt of the round. Its line 1 is `agent: review-bench-fixer`, and it has the
//    lines `Repository snapshot root: <snapshot>`, `Plan export: <plan.md of the case folder>`, `Patch file:
//    <round-k/fixer/fixer-1.patch>`, and `Finding <id>: <finding line>` for each extra. The fixer patch is the
//    --fixer-patch file, else round-k/fixer/fixer-1.patch; an empty patch file changes nothing. A fixer-<n>.patch
//    with n >= 2 in round-k/fixer/ stops the command with the name of the file.
// 4. The reviewed tree of round k is the `head` of round-k/meta.json, or for round 1 the case head with the case
//    patch. The command applies the fix patches of plan.fixes in order, then the fixer patch, with `git apply`. It
//    commits the tree as the head of round k + 1, with the round-k head as parent and a fixed author and committer,
//    so that it needs no user config. When the round has findings for the fixer and the tree after the fixer patch is
//    the tree after the fix patches, the record of step 5 gets `fixerChangedNothing: true`.
// 5. It adds `fix: plan` to round-k/meta.json, with `fixAlreadyApplied`, `fixedByFixer`, and `fixLeftOut` when they
//    list a defect and `fixerChangedNothing` and `fixRepairedNothing` when they are true, keeps every other field
//    there, and writes round-<k+1>/:
//    - snapshot/: the new tree, as `case` writes a snapshot.
//    - full.diff (case base to the new head), delta.diff (round-k head to the new head), and, for a panel round,
//      the focus diffs, as `case` writes them.
//    - previous-review.md: the round-k blocks in reviewer order, each without trailing whitespace, joined by one
//      empty line, with a final newline.
//    - rejection.md, only with plan.rejections: `Rejected review findings, round <c>`, an empty line, then for each
//      rejection the finding line `- [<severity>] <category> - <locator> - <text>` and `  Evidence: <reason>`.
//      <c> is the round that the round-k prompts named: the case `round` + k - 1.
//    - prompts/: one file per reviewer of the mode (`full`, the three lenses, or `delta`), as `case` writes them for
//      the side of the arm, with round <c + 1>, the snapshot and diffs of the round folder, the plan.md of the case
//      folder, and for a delta round the previous-review.md and, when it exists, the rejection.md of the round
//      folder. An empty blocks/.
//    - meta.json: { config (of round k), mode, head, repairsOnly, fullLines, deltaLines }, where mode is
//      roundMode({ policy, round: k + 1, fullLines, completed: true, repairsOnly, deltaLines }), with the policy
//      that run-<n>/meta.json records; round k completed, because step 1 refuses a round that did not complete.
//      repairsOnly: no applied fix of the plan is `pulled`; a pulled-in patch that does not apply changes nothing, so
//      it does not prevent a delta round.
//      fullLines and deltaLines: the added plus removed lines of full.diff and delta.diff.
//    It returns the round-<k+1> folder, and stops when that folder exists.
//
// New exports of score.mjs:
// - fixPlan({ findings, judgments, known, applied = [] }) -> { fixes, extras, rejections }
//   findings: the findings of one round of one run, as findings.json gives them. judgments: judgments.json. known:
//   the known defects of the case, each with `fix` (a patch file name) and an optional `fix_after` (the ids whose
//   fixes the patch needs first). applied: the ids whose fixes earlier rounds applied.
//   fixes: one { known, patch } for each known defect that a finding of the round matches (a `match` answer), also
//   an applied one, because a later repair can bring it back, and one { known, patch, pulled: true } for each defect
//   that such a fix needs through fix_after, also indirectly, that is neither applied nor matched. Order: repeatedly
//   take the first defect in known-list order whose fix_after ids are all placed, or applied and not in the plan.
//   extras: the ids of the findings without a `match` answer that the judge rated `valid`, in findings order.
//   rejections: one { finding: <id>, rating, reason } for each finding without a `match` answer rated `wrong` or
//   `unknown` (the harness cannot confirm it), in findings order, with the judge's reason.
//   A candidate pair of a finding of the round (score.pairWanted) without an answer fails as the report does:
//   `judgments.json has no match answer for <n> candidate pairs of pairs.json: <blind id> and <known id>, ...`. A
//   finding with neither a `match` answer nor a rating fails as the report does: `judgments.json has no match and
//   no adjudication for <n> findings: <blind ids>`. A defect to fix without `fix` fails: `known defect <id> has no
//   fix patch`.
// - loopEnds(round, { fixes, extras }) -> true when there are no fixes and no extras (no finding of the round stands
//   open, because the fix step repairs every finding that stands), or when round is 5 or more.
//
// Changed exports of score.mjs:
// - dispatchName(caseId, arm, run, reviewer, round): with a round, `K<round>` follows the run part, as in
//   `Code7C1LowR1K2Delta`; without a round, the name does not change. dispatchNames reads `round` from each entry,
//   and a collision names `<case>/<arm>/<run>/round-<r>/<reviewer>`. names and transcripts take workspaces with
//   round folders: each round folder is a dispatch of its own, and transcripts writes the meta.json of the round
//   folder.
// - scoreRuns: a round r >= 2 is extra-only when the fix step after round r - 1 repaired valid extras and no known
//   defect. The fixer repaired the valid extras when it got them, the round has no `fixerChangedNothing`, and at least
//   one of them has no `not present` in `fixer.replies`. A known defect was repaired when a fix in `fix.fixes` is not
//   `pulled`, not in `fixAlreadyApplied`, and, when it is in `fixedByFixer`, repaired by the fixer: the round has no
//   `fixerChangedNothing`, and a finding of round r - 1 that matches the defect has no `not present` in
//   `fixer.replies`.
// - transcriptsCommand: the fixer entry of a round also gives `fixer.replies`: each finding id of a line
//   `<id>: repaired` or `<id>: not present` (a list marker and backticks allowed, any case) in the strings of the
//   arguments of the last `yield` call of the fixer transcript, or without such a call, of the text of the last
//   assistant message that has text. A later line of an id wins. A reply that names no finding gives no field.
// - loadJudgments(ws): <ws>/judgments.json, or { matches: [], adjudications: [] } when the file is missing. `loop`
//   and `report` read the judgments through it.
//
// The tests 'case --loop and loop give each arm the rounds of its policy ...' and 'case --loop records the fixer
// setting ...' check how `case` lays out round 1 of a loop run; the other loop tests write round-1/ by hand. Outside
// these tests: the dispatch of the fixer and the work of the fixer agent. `names` lists the fixer prompt of a round
// as `<case><arm><run>K<round>Fixer1`, and transcripts reads the fixer transcript.

test('round mode follows the size rule and allows delta only after a completed round of small repairs', () => {
  const policy = 'panel-delta';
  assert.equal(prepare.roundMode({ policy, round: 1, fullLines: 49 }), 'full');
  assert.equal(prepare.roundMode({ policy, round: 1, fullLines: 50 }), 'panel');
  // Round 1 reads only the size of the full diff.
  assert.equal(
    prepare.roundMode({ policy, round: 1, fullLines: 120, completed: true, repairsOnly: true, deltaLines: 1 }),
    'panel',
  );
  const repaired = { policy, round: 2, completed: true, repairsOnly: true };
  assert.equal(prepare.roundMode({ ...repaired, fullLines: 120, deltaLines: 60 }), 'delta');
  assert.equal(prepare.roundMode({ ...repaired, fullLines: 120, deltaLines: 61 }), 'panel');
  assert.equal(prepare.roundMode({ ...repaired, fullLines: 40, deltaLines: 20 }), 'delta');
  assert.equal(prepare.roundMode({ ...repaired, fullLines: 40, deltaLines: 21 }), 'full');
  assert.equal(prepare.roundMode({ ...repaired, round: 5, fullLines: 30, deltaLines: 2 }), 'delta');
  // A round that did not complete, a change that is not only repairs, or a merge of the default branch gets the size
  // rule, however small the delta diff is.
  assert.equal(prepare.roundMode({ ...repaired, completed: false, fullLines: 120, deltaLines: 2 }), 'panel');
  assert.equal(prepare.roundMode({ ...repaired, completed: false, fullLines: 30, deltaLines: 2 }), 'full');
  assert.equal(prepare.roundMode({ ...repaired, repairsOnly: false, fullLines: 30, deltaLines: 2 }), 'full');
  assert.equal(prepare.roundMode({ ...repaired, merge: true, fullLines: 120, deltaLines: 2 }), 'panel');
  assert.equal(prepare.roundMode({ ...repaired, merge: true, fullLines: 30, deltaLines: 2 }), 'full');
});

// Each known defect sits in a file of its own, so a finding is a candidate pair only with the defects of its files.
const fixFile = (id) => `src/${id.toLowerCase()}.mjs`;
const FIX_KNOWN = [
  { id: 'D1', locator: `${fixFile('D1')}:1`, fix: 'code-7.D1.fix.patch' },
  { id: 'D2', locator: `${fixFile('D2')}:1`, fix: 'code-7.D2.fix.patch', fix_after: ['D3'] },
  { id: 'D3', locator: `${fixFile('D3')}:1`, fix: 'code-7.D3.fix.patch' },
  { id: 'D4', locator: `${fixFile('D4')}:1`, fix: 'code-7.D4.fix.patch', fix_after: ['D1'] },
  { id: 'D5', locator: `${fixFile('D5')}:1`, fix: 'code-7.D5.fix.patch', fix_after: ['D4'] },
];
const fixId = (round, n) => `code-7/C1-low/run-1/round-${round}/full#${n}`;
// The findings of one round of run code-7/C1-low/run-1, as findings.json gives them, and the judge's answers. Each
// answer is { matches, rating, reason }: `matches` maps known ids to a pair verdict, and `rating` is the adjudication.
// A finding names the files of the known defects in its `matches`, so the judge answered each of its candidate pairs;
// a finding without `matches` names README.md, which no known defect names.
function judgedRound(round, answers) {
  const findings = [];
  const judgments = { matches: [], adjudications: [] };
  for (const [index, { matches = {}, rating, reason = 'Read the snapshot.' }] of answers.entries()) {
    const id = fixId(round, index + 1);
    const blind = blindId(id);
    const names = Object.keys(matches).length ? Object.keys(matches).map(fixFile) : ['README.md'];
    const files = names.map((file) => ({ file, start: 1, end: 1 }));
    findings.push({
      id,
      blind,
      case: 'code-7',
      arm: 'C1-low',
      run: 'run-1',
      round,
      reviewer: 'full',
      n: index + 1,
      files,
    });
    for (const [known, verdict] of Object.entries(matches)) {
      judgments.matches.push({ finding: blind, known, verdict, reason });
    }
    if (rating) judgments.adjudications.push({ finding: blind, rating, reason });
  }
  return { findings, judgments };
}

test('the fix plan orders matched fixes by fix_after, sends valid extras to the fixer, and rejects the rest', () => {
  const first = judgedRound(1, [
    { matches: { D2: 'match', D1: 'no' } },
    { matches: { D3: 'match' } },
    // Only a `match` answer counts: an unknown pair leaves the finding to its rating.
    { matches: { D1: 'unknown' }, rating: 'valid' },
    { rating: 'wrong', reason: 'src/a.mjs:12 already checks the bound.' },
    { rating: 'unknown', reason: 'The snapshot does not hold the caller.' },
  ]);
  assert.deepEqual(score.fixPlan({ ...first, known: FIX_KNOWN }), {
    fixes: [
      { known: 'D3', patch: 'code-7.D3.fix.patch' },
      { known: 'D2', patch: 'code-7.D2.fix.patch' },
    ],
    extras: [fixId(1, 3)],
    rejections: [
      { finding: fixId(1, 4), rating: 'wrong', reason: 'src/a.mjs:12 already checks the bound.' },
      { finding: fixId(1, 5), rating: 'unknown', reason: 'The snapshot does not hold the caller.' },
    ],
  });
  // Round 2 repeats D2, whose fix round 1 applied, and finds D5. A later repair can bring D2 back, so the plan keeps
  // its patch, and loop drops the patch when the tree still holds the fix. The patch of D5 needs the fix of D4, which
  // needs the fix of D1; no finding matched them, so the plan pulls both in first.
  const second = judgedRound(2, [{ matches: { D2: 'match' } }, { matches: { D5: 'match' } }]);
  assert.deepEqual(score.fixPlan({ ...second, known: FIX_KNOWN, applied: ['D3', 'D2'] }), {
    fixes: [
      { known: 'D1', patch: 'code-7.D1.fix.patch', pulled: true },
      { known: 'D2', patch: 'code-7.D2.fix.patch' },
      { known: 'D4', patch: 'code-7.D4.fix.patch', pulled: true },
      { known: 'D5', patch: 'code-7.D5.fix.patch' },
    ],
    extras: [],
    rejections: [],
  });
  // A fix_after id whose fix an earlier round applied counts as done.
  const third = judgedRound(3, [{ matches: { D4: 'match' } }]);
  assert.deepEqual(score.fixPlan({ ...third, known: FIX_KNOWN, applied: ['D1'] }).fixes, [
    { known: 'D4', patch: 'code-7.D4.fix.patch' },
  ]);
  // The fix step cannot decide a finding that the judge left without an answer.
  const open = judgedRound(1, [{ matches: { D1: 'no' } }]);
  assert.throws(
    () => score.fixPlan({ ...open, known: FIX_KNOWN }),
    new RegExp(`no match and no adjudication for 1 findings: ${open.findings[0].blind}$`),
  );
});

test('the loop ends after a round without an open finding, or at round 5', () => {
  const repair = { fixes: [{ known: 'D1', patch: 'code-7.D1.fix.patch' }], extras: [], rejections: [] };
  const extra = { fixes: [], extras: [fixId(2, 1)], rejections: [] };
  const rejected = { fixes: [], extras: [], rejections: [{ finding: fixId(3, 1), rating: 'wrong', reason: 'No.' }] };
  assert.equal(score.loopEnds(1, repair), false);
  assert.equal(score.loopEnds(2, extra), false);
  assert.equal(score.loopEnds(4, extra), false);
  assert.equal(score.loopEnds(1, { fixes: [], extras: [], rejections: [] }), true);
  assert.equal(score.loopEnds(3, rejected), true);
  assert.equal(score.loopEnds(5, repair), true);
  assert.equal(score.loopEnds(5, extra), true);
  // A round whose findings only repeat fixed defects or are wrong keeps the repeated fixes in its plan, so the plan
  // alone does not end the loop: loop ends it when the tree of the round still holds each fix.
  const quiet = judgedRound(3, [{ matches: { D2: 'match' } }, { rating: 'wrong', reason: 'No.' }]);
  assert.equal(score.loopEnds(3, score.fixPlan({ ...quiet, known: FIX_KNOWN, applied: ['D3', 'D2'] })), false);
});

const LOOP_R1 = 'code-7/C1-low/run-1/round-1/full';
const syncLine = (values, n) => `export const v${n} = ${values[n] ?? n};\n`;
const syncFile = (values) => Array.from({ length: 12 }, (_, index) => syncLine(values, index + 1)).join('');
// src/sync.mjs at the case head: v5 carries the known defect D1, and v7 the known defect D2.
const SYNC_HEAD = syncFile({ 5: 0, 7: 0 });
const SYNC_D1 = syncFile({ 7: 0 });
const SYNC_FIXED = syncFile({});
// src/extra.mjs at the case head: b carries a defect that no key lists, so the fixer repairs it.
const EXTRA_HEAD = 'export const a = 1;\nexport const b = 0;\nexport const c = 3;\nexport const d = 4;\n';
const EXTRA_FIXED = EXTRA_HEAD.replace('b = 0', 'b = 2');
const README_PLANTED = '# Demo\n\nSee src/sync.mjs.\n';
// Round 1 of the dev loop: a valid extra (#1), a wrong finding (#2), and the known defect D1 (#3).
const LOOP_ROUND_1 = `### Code review round 1

Code-review: fixes-required

## Standards

- [MEDIUM] Bug - src/extra.mjs:2 - b is 0, and the callers divide by it - set it to 2.
- [LOW] Clarity - README.md:1 - The title does not name the module - rename it.
- [HIGH] Bug - src/sync.mjs:5 - v5 is 0 instead of 5 - set it to 5.

## Spec

None.
`;
const V7_BLOCK = (round) => `### Code review round ${round}

Code-review: fixes-required

## Standards

- [HIGH] Bug - src/sync.mjs:7 - v7 is 0 instead of 7 - set it to 7.

## Spec

None.
`;
const LOOP_PASS_3 = '### Code review round 3\n\nCode-review: pass\n\nNone.\n';
// src/sync.mjs after the fixer of round 1 of the near loop: v5 is 5, as the fix patch of D1 makes it, and v10, a
// context line of the fix patch of D2, is 100.
const SYNC_NEAR = syncFile({ 7: 0, 10: 100 });
// Round 1 of the near loop: two findings that the judge rates valid, at v5 and at v10.
const NEAR_ROUND_1 = `### Code review round 1

Code-review: fixes-required

## Standards

- [HIGH] Bug - src/sync.mjs:5 - v5 is 0, and the parser divides by it - set it to 5.
- [MEDIUM] Bug - src/sync.mjs:10 - v10 is 10, and the callers need 100 - set it to 100.

## Spec

None.
`;
// Round 2 of the near loop: the known defects D1 (#1) and D2 (#2).
const NEAR_ROUND_2 = `### Code review round 2

Code-review: fixes-required

## Standards

- [HIGH] Bug - src/sync.mjs:5 - v5 is 0 instead of 5 - set it to 5.
- [HIGH] Bug - src/sync.mjs:7 - v7 is 0 instead of 7 - set it to 7.

## Spec

None.
`;

// prepare.mjs runs git with the environment of this process, so a git test isolates the process from the user's git
// config, as the release adapter tests do, and restores it afterwards.
function isolateGit(t) {
  const isolation = {
    GIT_CONFIG_GLOBAL: os.devNull,
    GIT_CONFIG_SYSTEM: os.devNull,
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_COUNT: '0',
    GIT_TERMINAL_PROMPT: '0',
  };
  const inherited = Object.fromEntries(Object.keys(isolation).map((key) => [key, process.env[key]]));
  Object.assign(process.env, isolation);
  t.after(() => {
    for (const [key, value] of Object.entries(inherited)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
}
function gitIn(repo, ...args) {
  const identity = ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.com', '-c', 'commit.gpgSign=false'];
  const result = spawnSync('git', [...identity, ...args], { cwd: repo, encoding: 'utf8' });
  assert.equal(result.status, 0, `git ${args.join(' ')} failed: ${result.stderr}`);
  return result.stdout;
}
// prepare.mjs refuses a prompt whose paths contain the word benchmark, so its workspaces get a neutral folder.
function neutralScratch(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'review-loop-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}
const readText = (file) => fs.readFileSync(file, 'utf8');
// The added and removed lines of a diff file, without its file headers.
const changedLines = (file) =>
  readText(file)
    .split('\n')
    .filter((line) => /^[-+]/.test(line) && !/^(?:---|\+\+\+) /.test(line));
const filesUnder = (dir) =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(dir, entry.name);
    return entry.isDirectory() ? filesUnder(file) : [file];
  });

// The diff of `file` from `before` to `after`, which `git apply` applies at the root of `repo`. The work tree and the
// index of `repo` go back to HEAD.
function filePatch(repo, file, before, after) {
  put(repo, file, before);
  gitIn(repo, 'add', '--', file);
  put(repo, file, after);
  const text = gitIn(repo, 'diff', '--no-color', '--src-prefix=a/', '--dst-prefix=b/', '--', file);
  gitIn(repo, 'reset', '-q', '--hard', 'HEAD');
  return text;
}

// A git repository with the commit `base` (README.md) and the case head `head`, which adds src/sync.mjs (12 lines)
// and src/extra.mjs (4 lines). The patches apply with `git apply`: D1, the fixer patch, and the planted patch (the
// `patch` of a held-out case, which changes README.md) at the head, and D2 only after D1.
function loopRepo(t) {
  isolateGit(t);
  const root = neutralScratch(t);
  const repo = path.join(root, 'repo');
  fs.mkdirSync(repo);
  gitIn(repo, 'init', '-q', '-b', 'main');
  put(repo, 'README.md', '# Demo\n');
  gitIn(repo, 'add', '-A');
  gitIn(repo, 'commit', '-q', '-m', 'base');
  const base = gitIn(repo, 'rev-parse', 'HEAD').trim();
  put(repo, 'src/sync.mjs', SYNC_HEAD);
  put(repo, 'src/extra.mjs', EXTRA_HEAD);
  gitIn(repo, 'add', '-A');
  gitIn(repo, 'commit', '-q', '-m', 'head');
  const head = gitIn(repo, 'rev-parse', 'HEAD').trim();
  const patches = {
    D1: filePatch(repo, 'src/sync.mjs', SYNC_HEAD, SYNC_D1),
    D2: filePatch(repo, 'src/sync.mjs', SYNC_D1, SYNC_FIXED),
    fixer: filePatch(repo, 'src/extra.mjs', EXTRA_HEAD, EXTRA_FIXED),
    planted: filePatch(repo, 'README.md', '# Demo\n', README_PLANTED),
  };
  return { root, repo, base, head, patches };
}

// Writes judgments.json for loop findings by stable id. Each answer is [id, answer, reason]: a known id gives a
// `match` answer, and `valid`, `wrong`, or `unknown` gives an adjudication. Each other candidate pair of an answered
// finding (score.pairWanted) gets a `no` answer, because `loop` stops on a candidate pair without an answer. `known`
// is the list of known defects; it defaults to the `known` list of the case.json of the finding's case in `ws`.
function judgeLoop(ws, answers, known) {
  const { findings } = readJson(path.join(ws, 'findings.json'));
  const byId = new Map(findings.map((finding) => [finding.id, finding]));
  const judgments = { matches: [], adjudications: [] };
  const answered = new Map();
  for (const [id, answer, reason = 'Read the snapshot.'] of answers) {
    assert.ok(byId.has(id), `findings.json has no finding ${id}`);
    const finding = byId.get(id);
    answered.set(id, finding);
    if (['valid', 'wrong', 'unknown'].includes(answer)) {
      judgments.adjudications.push({ finding: finding.blind, rating: answer, reason });
    } else {
      judgments.matches.push({ finding: finding.blind, known: answer, verdict: 'match', reason });
    }
  }
  for (const finding of answered.values()) {
    const defects = known ?? readJson(path.join(ws, finding.case, 'case.json')).known;
    assert.ok(Array.isArray(defects), `judgeLoop needs the known defects of ${finding.case}`);
    const given = new Set(
      judgments.matches.filter((entry) => entry.finding === finding.blind).map((entry) => entry.known),
    );
    for (const item of defects) {
      if (given.has(item.id) || !score.pairWanted('code', finding, item)) continue;
      judgments.matches.push({ finding: finding.blind, known: item.id, verdict: 'no', reason: 'Another cause.' });
    }
  }
  put(ws, 'judgments.json', judgments);
}

// Dev case code-7 of the loop repository, with its fix patches next to the case file, and a workspace that holds
// round 1 of run C1-low/run-1 as the reviewer and the judge left it: the prompt, the block, meta.json, findings.json,
// and judgments.json. The fixer patch repairs the valid extra of round 1.
function devLoop(t) {
  const fixture = loopRepo(t);
  const { root, base, head, patches } = fixture;
  const ws = path.join(root, 'ws');
  const cases = path.join(root, 'cases');
  const seeded = { category: 'bug', source: 'seeded' };
  const caseData = {
    id: 'code-7',
    kind: 'code',
    split: 'dev',
    issue: 7,
    round: 1,
    plan: 'code-7-plan.md',
    base,
    head,
    known: [
      { id: 'D1', locator: 'src/sync.mjs:5', ...seeded, summary: 'v5 is 0.', fix: 'code-7.D1.fix.patch' },
      {
        id: 'D2',
        locator: 'src/sync.mjs:7',
        ...seeded,
        summary: 'v7 is 0.',
        fix: 'code-7.D2.fix.patch',
        fix_after: ['D1'],
      },
    ],
  };
  put(cases, 'dev/code-7.json', caseData);
  put(cases, 'dev/code-7-plan.md', '# Plan 7\n');
  put(cases, 'dev/code-7.D1.fix.patch', patches.D1);
  put(cases, 'dev/code-7.D2.fix.patch', patches.D2);
  put(ws, 'code-7/case.json', caseData);
  put(ws, 'code-7/plan.md', '# Plan 7\n');
  const run = path.join(ws, 'code-7', 'C1-low', 'run-1');
  // `case --loop` records the round policy of the arm: C1 runs the full-delta policy.
  put(run, 'meta.json', { policy: 'full-delta' });
  const round1Meta = { config: CONFIGS.low, mode: 'full', reviewers: { full: provenCost(CONFIGS.low, 100, 1000) } };
  put(run, 'round-1/prompts/full.txt', 'agent: review-bench-candidate-code-low\n\nReview.\n');
  put(run, 'round-1/blocks/full.md', LOOP_ROUND_1);
  put(run, 'round-1/meta.json', round1Meta);
  findingsCommand(ws);
  const round1Answers = [
    [`${LOOP_R1}#1`, 'valid'],
    [`${LOOP_R1}#2`, 'wrong', 'README.md:1 names the module.'],
    [`${LOOP_R1}#3`, 'D1'],
  ];
  judgeLoop(ws, round1Answers);
  const fixerPatch = path.join(root, 'fixer.patch');
  fs.writeFileSync(fixerPatch, patches.fixer);
  const round = (r) => path.join(run, `round-${r}`);
  return { ...fixture, ws, cases, run, round, round1Meta, round1Answers, fixerPatch };
}

test('loop builds round 2 from round 1: fix patch, fixer patch, comment files, delta mode, and prompt', (t) => {
  const { repo, ws, cases, run, round, round1Meta, fixerPatch } = devLoop(t);
  // The valid extra needs the fixer's repair, so the loop stops before it writes.
  const extraId = escapeRegExp(`${LOOP_R1}#1`);
  assert.throws(
    () => prepare.prepareLoop({ run, cases }, repo),
    new RegExp(`round-1 has 1 valid extra findings for the fixer: ${extraId}; give their repair with --fixer-patch`),
  );
  assert.equal(fs.existsSync(round(2)), false);
  assert.deepEqual(readJson(path.join(round(1), 'meta.json')), round1Meta);

  assert.equal(prepare.prepareLoop({ run, cases, 'fixer-patch': fixerPatch }, repo), round(2));
  assert.deepEqual(readJson(path.join(round(1), 'meta.json')), {
    ...round1Meta,
    fix: {
      fixes: [{ known: 'D1', patch: 'code-7.D1.fix.patch' }],
      extras: [`${LOOP_R1}#1`],
      rejections: [{ finding: `${LOOP_R1}#2`, rating: 'wrong', reason: 'README.md:1 names the module.' }],
    },
  });
  const meta = readJson(path.join(round(2), 'meta.json'));
  assert.match(meta.head, /^[0-9a-f]{40,64}$/);
  // The full diff has 16 lines and the repairs change 4: at most half, after a completed round of repairs.
  assert.deepEqual(meta, {
    config: CONFIGS.low,
    mode: 'delta',
    head: meta.head,
    repairsOnly: true,
    fullLines: 16,
    deltaLines: 4,
  });
  // The new head commits the round-1 tree with the fix patch of D1 and then the fixer patch; the snapshot holds it.
  const snapshot = path.join(round(2), 'snapshot');
  for (const [file, content] of [
    ['README.md', '# Demo\n'],
    ['src/sync.mjs', SYNC_D1],
    ['src/extra.mjs', EXTRA_FIXED],
  ]) {
    assert.equal(gitIn(repo, 'show', `${meta.head}:${file}`), content);
    assert.equal(readText(path.join(snapshot, file)), content);
  }
  assert.deepEqual(changedLines(path.join(round(2), 'delta.diff')).sort(), [
    '+export const b = 2;',
    '+export const v5 = 5;',
    '-export const b = 0;',
    '-export const v5 = 0;',
  ]);
  const full = changedLines(path.join(round(2), 'full.diff'));
  assert.equal(full.length, 16);
  for (const line of ['+export const v5 = 5;', '+export const v7 = 0;', '+export const b = 2;']) {
    assert.ok(full.includes(line), `full.diff lacks ${line}`);
  }
  assert.equal(readText(path.join(round(2), 'previous-review.md')), LOOP_ROUND_1);
  assert.equal(
    readText(path.join(round(2), 'rejection.md')),
    [
      'Rejected review findings, round 1',
      '',
      '- [LOW] Clarity - README.md:1 - The title does not name the module - rename it.',
      '  Evidence: README.md:1 names the module.',
      '',
    ].join('\n'),
  );
  assert.deepEqual(fs.readdirSync(path.join(round(2), 'prompts')), ['delta.txt']);
  assert.deepEqual(fs.readdirSync(path.join(round(2), 'blocks')), []);
  const prompt = readText(path.join(round(2), 'prompts', 'delta.txt')).split('\n');
  assert.equal(prompt[0], 'agent: review-bench-candidate-code-low');
  for (const line of [
    'Code review of plan issue #7, round 2.',
    'Round: 2',
    `Repository snapshot root: ${snapshot}`,
    `Plan export: ${path.join(ws, 'code-7', 'plan.md')}`,
    'Round mode: delta.',
    `Delta diff: ${path.join(round(2), 'delta.diff')}`,
    `Previous round comment: ${path.join(round(2), 'previous-review.md')}`,
    `Rejection comment: ${path.join(round(2), 'rejection.md')}`,
  ]) {
    assert.ok(prompt.includes(line), `the delta prompt lacks ${line}`);
  }
});

test('loop writes one fixer prompt for all valid extras of a round and takes an empty patch as no change', (t) => {
  const { repo, ws, cases, run, round } = devLoop(t);
  const extras = [`${LOOP_R1}#1`, `${LOOP_R1}#2`];
  judgeLoop(ws, [...extras.map((id) => [id, 'valid']), [`${LOOP_R1}#3`, 'D1']]);
  const fixerDir = path.join(round(1), 'fixer');
  const extraIds = extras.map(escapeRegExp).join(', ');
  assert.throws(
    () => prepare.prepareLoop({ run, cases }, repo),
    new RegExp(`round-1 has 2 valid extra findings for the fixer: ${extraIds}; give their repair with --fixer-patch`),
  );
  assert.equal(fs.existsSync(round(2)), false);
  // One prompt lists both findings. The snapshot holds the round-1 tree after the fix patch of D1.
  assert.deepEqual(fs.readdirSync(fixerDir).sort(), ['fixer-1.txt', 'snapshot']);
  const snapshot = path.join(fixerDir, 'snapshot');
  assert.equal(readText(path.join(snapshot, 'src', 'sync.mjs')), SYNC_D1);
  const prompt = readText(path.join(fixerDir, 'fixer-1.txt')).split('\n');
  assert.equal(prompt[0], 'agent: review-bench-fixer');
  for (const line of [
    `Repository snapshot root: ${snapshot}`,
    `Plan export: ${path.join(ws, 'code-7', 'plan.md')}`,
    `Patch file: ${path.join(fixerDir, 'fixer-1.patch')}`,
    `Finding ${LOOP_R1}#1: - [MEDIUM] Bug - src/extra.mjs:2 - b is 0, and the callers divide by it - set it to 2.`,
    `Finding ${LOOP_R1}#2: - [LOW] Clarity - README.md:1 - The title does not name the module - rename it.`,
  ]) {
    assert.ok(prompt.includes(line), `the fixer prompt lacks ${line}`);
  }
  const round1 = path.join('code-7', 'C1-low', 'run-1', 'round-1');
  assert.deepEqual(namesCommand(ws), [
    { prompt: path.join(round1, 'prompts', 'full.txt'), name: 'Code7C1LowR1K1Full' },
    { prompt: path.join(round1, 'fixer', 'fixer-1.txt'), name: 'Code7C1LowR1K1Fixer1' },
  ]);
  // A patch file of the design with one fixer per finding stops the loop.
  const stale = path.join(fixerDir, 'fixer-2.patch');
  fs.writeFileSync(stale, '');
  assert.throws(
    () => prepare.prepareLoop({ run, cases }, repo),
    new RegExp(`stale fixer patches from the design with one fixer per finding: ${escapeRegExp(stale)};`),
  );
  assert.equal(fs.existsSync(round(2)), false);
  fs.rmSync(stale);

  // The fixer found no finding that needs a change, so it wrote an empty patch file. The fix patch of D1 still applied
  // and repaired the finding of D1, so round 2 follows, and round 1 records that the fixer patch changed nothing.
  fs.writeFileSync(path.join(fixerDir, 'fixer-1.patch'), '');
  assert.equal(prepare.prepareLoop({ run, cases }, repo), round(2));
  const round1Record = readJson(path.join(round(1), 'meta.json'));
  assert.deepEqual(round1Record.fix, {
    fixes: [{ known: 'D1', patch: 'code-7.D1.fix.patch' }],
    extras,
    rejections: [],
  });
  assert.deepEqual([round1Record.fixerChangedNothing, round1Record.fixRepairedNothing], [true, undefined]);
  const meta = readJson(path.join(round(2), 'meta.json'));
  assert.deepEqual(meta, {
    config: CONFIGS.low,
    mode: 'delta',
    head: meta.head,
    repairsOnly: true,
    fullLines: 16,
    deltaLines: 2,
  });
  for (const [file, content] of [
    ['README.md', '# Demo\n'],
    ['src/sync.mjs', SYNC_D1],
    ['src/extra.mjs', EXTRA_HEAD],
  ]) {
    assert.equal(gitIn(repo, 'show', `${meta.head}:${file}`), content);
    assert.equal(readText(path.join(round(2), 'snapshot', file)), content);
  }
  assert.equal(fs.existsSync(path.join(round(2), 'rejection.md')), false);
  assert.deepEqual(fs.readdirSync(path.join(round(2), 'prompts')), ['delta.txt']);
});

test('loop counts the fixes of earlier rounds for fix_after and ends after a round without open findings', (t) => {
  const { repo, ws, cases, run, round, round1Answers, fixerPatch } = devLoop(t);
  prepare.prepareLoop({ run, cases, 'fixer-patch': fixerPatch }, repo);
  put(run, 'round-2/blocks/delta.md', V7_BLOCK(2));
  findingsCommand(ws);
  judgeLoop(ws, [...round1Answers, ['code-7/C1-low/run-1/round-2/delta#1', 'D2']]);
  const round2Meta = readJson(path.join(round(2), 'meta.json'));
  assert.equal(prepare.prepareLoop({ run, cases }, repo), round(3));
  // The patch of D2 needs the fix of D1, which the fix step after round 1 applied.
  assert.deepEqual(readJson(path.join(round(2), 'meta.json')), {
    ...round2Meta,
    fix: { fixes: [{ known: 'D2', patch: 'code-7.D2.fix.patch' }], extras: [], rejections: [] },
  });
  const meta = readJson(path.join(round(3), 'meta.json'));
  assert.deepEqual(meta, {
    config: CONFIGS.low,
    mode: 'delta',
    head: meta.head,
    repairsOnly: true,
    fullLines: 16,
    deltaLines: 2,
  });
  assert.equal(gitIn(repo, 'show', `${meta.head}:src/sync.mjs`), SYNC_FIXED);
  assert.equal(gitIn(repo, 'show', `${meta.head}:src/extra.mjs`), EXTRA_FIXED);
  assert.equal(readText(path.join(round(3), 'previous-review.md')), V7_BLOCK(2));
  // Round 2 rejected nothing: no rejection file, and the prompt names none.
  assert.equal(fs.existsSync(path.join(round(3), 'rejection.md')), false);
  const prompt = readText(path.join(round(3), 'prompts', 'delta.txt')).split('\n');
  assert.ok(prompt.includes('Code review of plan issue #7, round 3.'));
  assert.equal(
    prompt.some((line) => line.startsWith('Rejection comment:')),
    false,
  );
  // Round 3 passes: the loop ends and writes nothing.
  put(run, 'round-3/blocks/delta.md', LOOP_PASS_3);
  findingsCommand(ws);
  assert.equal(prepare.prepareLoop({ run, cases }, repo), null);
  assert.equal(fs.existsSync(round(4)), false);
  assert.deepEqual(readJson(path.join(round(3), 'meta.json')), meta);
});

test('loop gives a defect whose fix patch does not apply to the fixer and skips a fix that the tree holds', (t) => {
  const { root, repo, ws, cases, run, round } = devLoop(t);
  // The judge matches no finding of round 1. The fixer of round 1 sets v5 to 5, as the fix patch of D1 does, and
  // changes v10, which the fix patch of D2 has as context.
  put(run, 'round-1/blocks/full.md', NEAR_ROUND_1);
  findingsCommand(ws);
  const round1Answers = [
    [`${LOOP_R1}#1`, 'valid'],
    [`${LOOP_R1}#2`, 'valid'],
  ];
  judgeLoop(ws, round1Answers);
  const round1Fixer = path.join(root, 'round-1-fixer.patch');
  fs.writeFileSync(round1Fixer, filePatch(repo, 'src/sync.mjs', SYNC_HEAD, SYNC_NEAR));
  assert.equal(prepare.prepareLoop({ run, cases, 'fixer-patch': round1Fixer }, repo), round(2));
  put(run, 'round-2/blocks/delta.md', NEAR_ROUND_2);
  findingsCommand(ws);
  const r2 = 'code-7/C1-low/run-1/round-2/delta';
  judgeLoop(ws, [...round1Answers, [`${r2}#1`, 'D1'], [`${r2}#2`, 'D2']]);
  const round2Meta = readJson(path.join(round(2), 'meta.json'));
  const fixerDir = path.join(round(2), 'fixer');
  // The fix patch of D2 does not apply, so its finding goes to the fixer.
  assert.throws(
    () => prepare.prepareLoop({ run, cases }, repo),
    new RegExp(
      `round-2 has 1 known defects whose fix patches do not apply, for the fixer: D2 \\(found by ${escapeRegExp(`${r2}#2`)}\\); give their repair with --fixer-patch`,
    ),
  );
  assert.equal(fs.existsSync(round(3)), false);
  assert.deepEqual(readJson(path.join(round(2), 'meta.json')), round2Meta);
  // No fix patch applied, so the fixer snapshot holds the tree of round 2. The prompt lists the finding of D2 and not
  // the finding of D1, whose fix the tree already holds.
  assert.equal(readText(path.join(fixerDir, 'snapshot', 'src', 'sync.mjs')), SYNC_NEAR);
  const prompt = readText(path.join(fixerDir, 'fixer-1.txt')).split('\n');
  assert.deepEqual(
    prompt.filter((line) => line.startsWith('Finding ')),
    [`Finding ${r2}#2: - [HIGH] Bug - src/sync.mjs:7 - v7 is 0 instead of 7 - set it to 7.`],
  );

  // The fixer repairs v7 in its snapshot. The next loop call gets the same split and applies the fixer patch.
  const repaired = syncFile({ 10: 100 });
  fs.writeFileSync(path.join(fixerDir, 'fixer-1.patch'), filePatch(repo, 'src/sync.mjs', SYNC_NEAR, repaired));
  assert.equal(prepare.prepareLoop({ run, cases }, repo), round(3));
  const fixes = ['D1', 'D2'].map((id) => ({ known: id, patch: `code-7.${id}.fix.patch` }));
  const fixedRound = readJson(path.join(round(2), 'meta.json'));
  // The fix patch of D1 applies in reverse: the tree already holds the fix, so loop skips the patch.
  assert.deepEqual(fixedRound.fixAlreadyApplied, ['D1']);
  assert.deepEqual(fixedRound, {
    ...round2Meta,
    fix: { fixes, extras: [], rejections: [] },
    fixAlreadyApplied: ['D1'],
    fixedByFixer: ['D2'],
  });
  const meta = readJson(path.join(round(3), 'meta.json'));
  assert.deepEqual(meta, {
    config: CONFIGS.low,
    mode: 'delta',
    head: meta.head,
    repairsOnly: true,
    fullLines: 16,
    deltaLines: 2,
  });
  assert.equal(gitIn(repo, 'show', `${meta.head}:src/sync.mjs`), repaired);
  assert.equal(readText(path.join(round(3), 'snapshot', 'src', 'sync.mjs')), repaired);
});

// Held-out case code-9: the case file has no known defects, and its plan and its planted patch are in the key folder.
const heldoutCase = ({ base, head }) => ({
  id: 'code-9',
  kind: 'code',
  split: 'heldout',
  issue: 9,
  round: 1,
  plan: 'code-9-plan.md',
  base,
  head,
  patch: 'code-9.patch',
  external: ['plan', 'patch'],
});

test('loop --keys reads the key, the fix patches, and the external patch of a held-out case', (t) => {
  const { root, repo, base, head, patches } = loopRepo(t);
  const ws = path.join(root, 'ws');
  const cases = path.join(root, 'cases');
  const keys = path.join(root, 'keys');
  const caseData = heldoutCase({ base, head });
  const seeded = { category: 'bug', source: 'seeded' };
  put(cases, 'heldout/code-9.json', caseData);
  put(keys, 'code-9.key.json', {
    known: [
      { id: 'D1', locator: 'src/sync.mjs:5', ...seeded, summary: 'v5 is 0.', fix: 'code-9.D1.fix.patch' },
      {
        id: 'D2',
        locator: 'src/sync.mjs:7',
        ...seeded,
        summary: 'v7 is 0.',
        fix: 'code-9.D2.fix.patch',
        fix_after: ['D1'],
      },
    ],
  });
  put(keys, 'code-9.D1.fix.patch', patches.D1);
  put(keys, 'code-9.D2.fix.patch', patches.D2);
  put(keys, 'code-9.patch', patches.planted);
  put(keys, 'code-9-plan.md', '# Plan 9\n');
  put(ws, 'code-9/case.json', caseData);
  put(ws, 'code-9/plan.md', '# Plan 9\n');
  const run = path.join(ws, 'code-9', 'C1-low', 'run-1');
  put(run, 'meta.json', { policy: 'full-delta' });
  const round2 = path.join(run, 'round-2');
  put(run, 'round-1/prompts/full.txt', 'agent: review-bench-candidate-code-low\n\nReview.\n');
  put(run, 'round-1/blocks/full.md', V7_BLOCK(1));
  put(run, 'round-1/meta.json', { config: CONFIGS.low, mode: 'full' });
  findingsCommand(ws);
  judgeLoop(ws, [['code-9/C1-low/run-1/round-1/full#1', 'D2']], readJson(path.join(keys, 'code-9.key.json')).known);
  assert.throws(
    () => prepare.prepareLoop({ run, cases }, repo),
    /case code-9 keeps plan, patch in the key folder; give that folder with --keys <dir>/,
  );
  assert.equal(fs.existsSync(round2), false);

  assert.equal(prepare.prepareLoop({ run, cases, keys }, repo), round2);
  // Round 1 found D2 only. Its patch needs the fix of D1, which the plan pulls in, so the change since round 1 is not
  // only repairs of round-1 findings, and round 2 gets the size rule: 18 lines give a full round.
  assert.deepEqual(readJson(path.join(run, 'round-1', 'meta.json')).fix, {
    fixes: [
      { known: 'D1', patch: 'code-9.D1.fix.patch', pulled: true },
      { known: 'D2', patch: 'code-9.D2.fix.patch' },
    ],
    extras: [],
    rejections: [],
  });
  const meta = readJson(path.join(round2, 'meta.json'));
  assert.deepEqual(meta, {
    config: CONFIGS.low,
    mode: 'full',
    head: meta.head,
    repairsOnly: false,
    fullLines: 18,
    deltaLines: 4,
  });
  // The round-1 tree is the case head with the planted patch from the key folder.
  for (const [file, content] of [
    ['README.md', README_PLANTED],
    ['src/sync.mjs', SYNC_FIXED],
  ]) {
    assert.equal(gitIn(repo, 'show', `${meta.head}:${file}`), content);
    assert.equal(readText(path.join(round2, 'snapshot', file)), content);
  }
  assert.equal(fs.existsSync(path.join(round2, 'rejection.md')), false);
  assert.deepEqual(fs.readdirSync(path.join(round2, 'prompts')), ['full.txt']);
  const prompt = readText(path.join(round2, 'prompts', 'full.txt')).split('\n');
  for (const line of [
    'Code review of plan issue #9, round 2.',
    'Round mode: full.',
    `Full diff: ${path.join(round2, 'full.diff')}`,
  ]) {
    assert.ok(prompt.includes(line), `the full prompt lacks ${line}`);
  }
  // No file of the key folder lands in the workspace.
  const keyFiles = new Set(fs.readdirSync(keys));
  assert.deepEqual(
    filesUnder(ws).filter((file) => keyFiles.has(path.basename(file))),
    [],
  );
});

test('case --keys reads the files of the external fields of a held-out case from the key folder', (t) => {
  const { root, repo, base, head, patches } = loopRepo(t);
  const ws = path.join(root, 'ws');
  const cases = path.join(root, 'cases');
  const keys = path.join(root, 'keys');
  const project = path.join(root, 'project');
  put(project, '.omp/agents/review-bench-configs.json', { configs: [CONFIGS.low] });
  const caseData = heldoutCase({ base, head });
  put(cases, 'heldout/code-9.json', caseData);
  put(keys, 'code-9.patch', patches.planted);
  put(keys, 'code-9-plan.md', '# Plan 9\n');
  const options = {
    case: path.join(cases, 'heldout', 'code-9.json'),
    arms: 'C1',
    runs: '1',
    out: ws,
    configs: 'low',
    project,
  };
  const caseDir = path.join(ws, 'code-9');
  assert.throws(
    () => prepare.prepareCase(options, repo),
    /case code-9 keeps plan, patch in the key folder; give that folder with --keys <dir>/,
  );
  assert.equal(fs.existsSync(caseDir), false);

  prepare.prepareCase({ ...options, keys }, repo);
  assert.deepEqual(readJson(path.join(caseDir, 'case.json')), caseData);
  assert.equal(readText(path.join(caseDir, 'plan.md')), '# Plan 9\n');
  assert.equal(readText(path.join(caseDir, 'snapshot', 'README.md')), README_PLANTED);
  assert.equal(readText(path.join(caseDir, 'snapshot', 'src', 'sync.mjs')), SYNC_HEAD);
  assert.ok(changedLines(path.join(caseDir, 'full.diff')).includes('+See src/sync.mjs.'));
  assert.ok(fs.existsSync(path.join(caseDir, 'C1-low', 'run-1', 'prompts', 'full.txt')));
  const keyFiles = new Set(fs.readdirSync(keys));
  assert.deepEqual(
    filesUnder(ws).filter((file) => keyFiles.has(path.basename(file))),
    [],
  );
  // `external` names only file fields of the case.
  assert.throws(
    () => prepare.validateCase({ ...caseData, external: ['base'] }),
    /case code-9: external names base, which is not a file field of the case/,
  );
});

test('round folders get dispatch names of their own, and names and transcripts work on them', (t) => {
  assert.equal(dispatchName('code-7', 'C1-low', 'run-1', 'delta', 2), 'Code7C1LowR1K2Delta');
  assert.equal(dispatchName('code-7', 'C1-low', 'run-1', 'delta'), 'Code7C1LowR1Delta');
  const reviewer = (round) => ({ caseId: 'code-7', arm: 'C1-low', run: 'run-1', round, reviewer: 'full' });
  assert.deepEqual(
    dispatchNames([reviewer(1), reviewer(2)]).map((entry) => entry.name),
    ['Code7C1LowR1K1Full', 'Code7C1LowR1K2Full'],
  );
  const { low } = CONFIGS;
  const { ws } = roundWorkspace(t, [
    {
      config: low,
      run: 1,
      rounds: [
        [FULL_BLOCK, 100, 1000, 'full'],
        [PASS_ROUND, 40, 400, 'delta'],
      ],
    },
  ]);
  const roundDir = (round) => path.join('code-7', 'C1-low', 'run-1', `round-${round}`);
  assert.deepEqual(namesCommand(ws), [
    { prompt: path.join(roundDir(1), 'prompts', 'full.txt'), name: 'Code7C1LowR1K1Full' },
    { prompt: path.join(roundDir(2), 'prompts', 'full.txt'), name: 'Code7C1LowR1K2Full' },
  ]);
  const sessions = path.join(path.dirname(ws), 'sessions');
  const transcript = (seconds, input) =>
    jsonl([
      { type: 'session', timestamp: isoAt(0) },
      { type: 'thinking_level_change', timestamp: isoAt(0), thinkingLevel: 'low' },
      { type: 'service_tier_change', timestamp: isoAt(0), serviceTier: { openai: 'default' } },
      { type: 'message', timestamp: isoAt(0), message: taskMessage(path.join(ws, 'code-7')) },
      assistantLine(seconds, 'openai-codex', 'gpt-6.1-sol', 'default', { input, output: 10 }),
    ]);
  put(sessions, 'Code7C1LowR1K1Full.jsonl', transcript(30, 90));
  put(sessions, 'Code7C1LowR1K2Full.jsonl', transcript(12, 40));
  assert.deepEqual(transcriptsCommand(ws, sessions), ['Code7C1LowR1K1Full', 'Code7C1LowR1K2Full']);
  // Each round folder gets the time, tokens, and facts of its own transcript and keeps its other fields.
  assert.deepEqual(readJson(path.join(ws, roundDir(1), 'meta.json')), {
    config: low,
    mode: 'full',
    reviewers: { full: provenCost(low, 30, 100) },
  });
  assert.deepEqual(readJson(path.join(ws, roundDir(2), 'meta.json')), {
    config: low,
    mode: 'delta',
    reviewers: { full: provenCost(low, 12, 50) },
  });
  assert.equal(fs.existsSync(path.join(ws, 'code-7', 'C1-low', 'run-1', 'meta.json')), false);
});

test('loop aggregation keeps fixer time apart and treats a repeat of a fixed defect as no cause of a round', () => {
  const round = (seconds, tokens, mode, fixer, answers) => [seconds, tokens, mode, fixer, answers];
  const fixture = gridFixture({ 'code-7': { split: 'dev', known: ['D1', 'D2'] } }, [
    {
      case: 'code-7',
      config: 'low',
      rounds: [
        round(100, 1000, 'full', 30, ['D1', 'valid']),
        // D1 again: round 1 fixed it, so only the valid extra of round 2 caused round 3.
        round(40, 400, 'delta', 20, ['D1', 'valid']),
        round(20, 200, 'delta', 0, ['valid']),
        round(10, 100, 'delta', 0, []),
      ],
    },
    {
      case: 'code-7',
      config: 'low-fast',
      rounds: [round(50, 500, 'full', 10, ['valid']), round(20, 200, 'delta', 0, [])],
    },
  ]);
  // The fixer tokens of a loop are the sum over its rounds.
  fixture.metas['code-7/C1-low/run-1/round-1'].fixer.tokens = 3000;
  fixture.metas['code-7/C1-low/run-1/round-2'].fixer.tokens = 1000;
  fixture.metas['code-7/C1-low-fast/run-1/round-1'].fixer.tokens = 500;
  const scores = scoreRuns(fixture);
  // Rounds, review seconds (the sum of the round seconds), fixer seconds, fixer tokens, tokens, found, escaped, valid
  // extras, and extra-only rounds of each run.
  const loop = (run) => [
    run.rounds.length,
    run.seconds,
    run.fixerSeconds,
    run.fixerTokens,
    run.tokens,
    run.found,
    run.escaped,
    run.validExtras,
    run.extraOnlyRounds,
  ];
  assert.deepEqual(scores.runs.map(loop), [
    [4, 170, 50, 4000, 1700, ['D1'], 1, 3, 2],
    [2, 70, 10, 500, 700, [], 2, 1, 1],
  ]);
  const table = tableAfter(renderReport(scores, { configs: ['low', 'low-fast'] }), '### Code loops: dev');
  for (const line of [
    '| Measure | low | low-fast |',
    '| Rounds median | 4.0 | 2.0 |',
    '| Rounds max | 4 | 2 |',
    '| Loop seconds median | 170.0 | 70.0 |',
    '| Known found per run | 1.00 | 0.00 |',
    '| Escaped per run | 1.00 | 2.00 |',
    '| Valid extras per run | 3.00 | 1.00 |',
    '| Extra-only rounds per run | 2.00 | 1.00 |',
    '| Tokens median | 1700 | 700 |',
    '| Fixer seconds median | 50.0 | 10.0 |',
    '| Fixer tokens median | 4000 | 500 |',
  ]) {
    assert.ok(table.includes(line), `the configuration table lacks ${line}`);
  }
});

// Plan #100: API note for the read-scope tests below. They read the new export through `score`.
//
// The reviewers run in the live checkout, which holds the fixes of the corpus defects. A reviewer that reads a file
// outside the inputs of its run can see a fix, so its recall does not count.
//
// Changed export:
// - transcriptFacts(text, source): when an assistant message of the transcript has a `toolCall` content item, the
//   result also has `toolCalls`: one { name, path } per item, in transcript order. path is `arguments.path` when it
//   is a string, else null. A `web_search` call also has `query`: `arguments.query` when it is a string, else null.
//   When the transcript has a `toolResult` message for a `web_search` call (same `toolCallId`), the call also has
//   `resultUrls`: the http and https URLs in the text content of that result, each once, in text order.
//   A transcript without a tool call gives no `toolCalls` field, so the facts of the earlier tests do not change.
//
// New export:
// - readScope(toolCalls, { runDir, round, cwd, pluginRoots }) -> { outside } or { outside, queries }
//   runDir is `<ws>/<case>/<arm folder>/run-<k>`. round is the number of a round folder, or undefined for a run
//   without round folders. cwd is the working directory of the reviewer session, or null when it is unknown.
//   pluginRoots are the plugin roots that the agent text of the reviewer names. The function reads no file.
//   The path of a grep, glob, or ast_grep call gives one target per `;`-separated part, trimmed; the path of every
//   other call is one trimmed target. A local path or an internal URI loses its selector: the
//   `:<text>` parts without `/` at its end, for example `:1-260` or `:23-54:raw`. A call without a path gives no
//   target, except grep, glob, find, and ast_grep: they search the working directory, so they give
//   `<name> without a path`. A web_search call gives its query to `queries` (each once, in call order; the field is
//   there only when the reviewer searched the web), and the target `web_search: <query>` when the query targets the
//   benchmark repository: outside its `-site:<text>` tokens, it names `DocksDocks/docks` (in any case, without a dot
//   that ends a sentence), or it names `DocksDocks` without `/<name>` of a repository and no `-site:` token excludes
//   the benchmark repository or its owner. `DocksDocks/<name>` of another repository targets that repository. Each
//   URL of its `resultUrls` that the web rule below puts outside gives the target `web_search result: <url>`. A local
//   path also loses a JSON query selector: the text from `?q=` on.
//   A relative path resolves against cwd. "Under a folder" means the folder itself or a path below it.
//   A target is allowed when it is:
//   - a path under an input of the run. An input folder is the case folder, and the run folder (a run without round
//     folders) or each `round-<j>` folder of the run with j <= round. The inputs of an input folder are `snapshot/`
//     and `prompts/`, each `*.diff` file in it, `plan.md`, `previous-review.md`, and `rejection.md`.
//   - a path under `<ws>/trees/<runLabel(case, arm folder, 'run-<k>/round-<j>')>/` with j <= round, the tree copy of
//     an earlier or the same round that `loop` wrote.
//   - for each plugin root P: `P/agents/<name>-reviewer.md`, or a path under `P/skills/code-reviewer/`,
//     `P/skills/plan-reviewer/`, `P/skills/<folder>/code-reviewer/`, or `P/skills/<folder>/plan-reviewer/`.
//   - `skill://<name>` or `skill://<name>/...`, where name is code-review or code-clarity.
//   - an `artifact://` URI.
//   - an http or https URL that cannot show the benchmark repository. Such pages are the paths `/DocksDocks/docks`
//     and below on github.com, www.github.com, and raw.githubusercontent.com, `/repos/DocksDocks/docks` and below on
//     api.github.com, and a page of any site whose decoded host, path, or query names `DocksDocks/docks`. A URL with
//     `…` (cut by a search result) cannot show it only when it does not name `DocksDocks`. The owner and the
//     repository name match in any case.
//   A path with a glob character (`*`, `?`, `[`, `{`) is allowed only when the segments before its first glob
//   segment give a folder that a rule above allows, and no later segment holds `..`.
//   Every other target is outside: every other local path, a relative path when cwd is null, and every other URI
//   (issue://, pr://, local://, history://, and others).
//   The option `lists` maps each target that omp read as a list of paths to these paths (see the list tests of code
//   review round 3 below); such a target is allowed only when each of these paths is allowed. Every other target is
//   one path.
//   outside lists each outside target once, in call order: a target as the reviewer wrote it but without its
//   selector, and a list target as the reviewer wrote it.
//
// Changed exports:
// - transcriptsCommand: a reviewer entry never gets `toolCalls`. When the transcript has tool calls, the entry gets
//   `readScope: readScope(toolCalls, scope)`. The scope takes runDir and round from the dispatch. cwd is the `cwd` of
//   the `session` entry of the transcript. pluginRoots are the folders P of each absolute path
//   `P/skills/code-reviewer/SKILL.md`, `P/skills/plan-reviewer/SKILL.md`, `P/skills/<folder>/code-reviewer/SKILL.md`,
//   or `P/skills/<folder>/plan-reviewer/SKILL.md` in the `systemPrompt` of the `session_init` entry (a string or a
//   list of strings). The system prompt holds the agent text, so these are the roots that the agent file names. A
//   fixer entry gets neither `toolCalls` nor `readScope`.
// - scoreRuns: a reviewer entry whose readScope has outside targets makes its run invalid, also in a run without a
//   config. The reason is `<reviewer>: read outside its inputs: <first 3 targets joined by ", ">`, then
//   `, and <n> more` for the other targets. It comes after the config reasons of the same reviewer.

const LIVE = '/work/live';
const LIVE_PLUGIN = `${LIVE}/plugins/plan-lifecycle`;
const BASELINE_PLUGIN = '/work/baseline-plugin';
const SCOPE_WS = '/work/ws';
const SCOPE_CASE = `${SCOPE_WS}/code-7`;
const reads = (...paths) => paths.map((target) => ({ name: 'read', path: target }));
// The part of a rendered reviewer agent that names the skill of its plugin root.
const agentText = (root) =>
  `# Code Reviewer\n\nLoad and follow\n\`${root}/skills/productivity/code-reviewer/SKILL.md\`.\n` +
  'Without `CLAUDE_PLUGIN_ROOT`, resolve `../skills/productivity/code-reviewer/SKILL.md`\nfrom this file.\n';
// A transcript of one agent that runs in the live checkout at the `low` configuration. Its last assistant message
// makes the tool calls, each [name, arguments], and `cwd` is the working directory of its session. `results` maps the
// id `call-<n>` of the n-th call to the details of its tool result; a call without an entry gets no tool result.
function toolTranscript(caseDir, seconds, calls, agent = 'review-bench-candidate-code-low', options = {}) {
  const { cwd = LIVE, results = {} } = options;
  const last = assistantLine(seconds, 'openai-codex', 'gpt-6.1-sol', 'default', { input: 90, output: 10 });
  last.message.content = [
    { type: 'text', text: 'Done.' },
    ...calls.map(([name, args], index) => ({ type: 'toolCall', id: `call-${index + 1}`, name, arguments: args })),
  ];
  const toolResults = Object.entries(results).map(([id, details]) => ({
    type: 'message',
    timestamp: isoAt(seconds),
    message: { role: 'toolResult', toolCallId: id, content: [{ type: 'text', text: 'Read.' }], details },
  }));
  return jsonl([
    { type: 'session', timestamp: isoAt(0), cwd },
    { type: 'thinking_level_change', timestamp: isoAt(0), thinkingLevel: 'low' },
    { type: 'service_tier_change', timestamp: isoAt(0), serviceTier: { openai: 'default' } },
    {
      type: 'session_init',
      timestamp: isoAt(0),
      agent,
      systemPrompt: ['You are a coding assistant.', agentText(LIVE_PLUGIN)],
      task: taskMessage(caseDir).content[0].text,
    },
    { type: 'message', timestamp: isoAt(0), message: taskMessage(caseDir) },
    last,
    ...toolResults,
  ]);
}

test('transcript facts list the name and the path of each tool call of the assistant messages', () => {
  const call = (name, args) => ({ type: 'toolCall', id: name, name, arguments: args });
  const first = assistantLine(5, 'openai-codex', 'gpt-6.1-sol', 'default', { input: 10 });
  first.message.content = [
    { type: 'thinking', thinking: 'Read the plan first.' },
    call('read', { i: 'Reading the plan', path: `${SCOPE_CASE}/plan.md:1-40` }),
    call('grep', { i: 'Finding the lock', pattern: 'lock' }),
  ];
  const second = assistantLine(9, 'openai-codex', 'gpt-6.1-sol', 'default', { input: 10 });
  second.message.content = [
    { type: 'text', text: 'Done.' },
    call('glob', { path: 7 }),
    call('yield', { result: { data: 'block' } }),
  ];
  const text = jsonl([
    { type: 'message', timestamp: isoAt(0), message: { role: 'user', content: [{ type: 'text', text: 'Review.' }] } },
    first,
    { type: 'message', timestamp: isoAt(6), message: { role: 'toolResult', content: [{ type: 'text', text: 'x' }] } },
    second,
  ]);
  assert.deepEqual(score.transcriptFacts(text, 'tools.jsonl'), {
    requestedTier: null,
    messages: [
      { model: MODEL, effort: null, servedTier: 'default' },
      { model: MODEL, effort: null, servedTier: 'default' },
    ],
    sideCalls: [],
    toolCalls: [
      { name: 'read', path: `${SCOPE_CASE}/plan.md:1-40` },
      { name: 'grep', path: null },
      { name: 'glob', path: null },
      { name: 'yield', path: null },
    ],
  });
  // A transcript without a tool call has no toolCalls field.
  assert.equal('toolCalls' in score.transcriptFacts(jsonl(FALLBACK_TRANSCRIPT), 'fallback.jsonl'), false);
});

test('readScope allows the inputs of the run, the instructions of the reviewer, and other web pages', () => {
  const scope = { runDir: `${SCOPE_CASE}/C3-low/run-1`, cwd: LIVE, pluginRoots: [LIVE_PLUGIN] };
  const allowed = [
    ...reads(
      `${SCOPE_CASE}/snapshot`,
      `${SCOPE_CASE}/snapshot/src/sync.mjs:40-52`,
      `${SCOPE_CASE}/snapshot/src/sync.mjs:1-20:raw`,
      `${SCOPE_CASE}/plan.md:1-260`,
      `${SCOPE_CASE}/full.diff`,
      `${SCOPE_CASE}/focus-correctness.diff:100+50`,
      `${SCOPE_CASE}/delta.diff`,
      `${SCOPE_CASE}/plan.diff`,
      `${SCOPE_CASE}/previous-review.md`,
      `${SCOPE_CASE}/rejection.md`,
      `${SCOPE_CASE}/C3-low/run-1/prompts/correctness.txt`,
      // The instructions of the reviewer, by an absolute path and by a path relative to the working directory.
      `${LIVE_PLUGIN}/agents/code-reviewer.md`,
      'plugins/plan-lifecycle/skills/productivity/code-reviewer/SKILL.md',
      `${LIVE_PLUGIN}/skills/productivity/code-reviewer/references/correctness.md:1-80`,
      `${LIVE_PLUGIN}/skills/productivity/plan-reviewer/references/checklist.md`,
      'skill://code-review/references/perf.md',
      'skill://code-clarity',
      'artifact://12:1-40',
      'https://nodejs.org/api/fs.html',
      'https://github.com/nodejs/node/issues/1',
    ),
    { name: 'glob', path: `${SCOPE_CASE}/snapshot/**/AGENTS.md` },
    { name: 'grep', path: `${SCOPE_CASE}/snapshot/src; ${SCOPE_CASE}/snapshot/tests` },
    { name: 'glob', path: `${LIVE_PLUGIN}/skills/productivity/code-reviewer/references/*.md` },
    // Calls without a path that search nothing.
    { name: 'yield', path: null },
    { name: 'web_search', path: null },
  ];
  assert.deepEqual(score.readScope(allowed, scope), { outside: [] });
});

test('readScope lists each target outside the inputs of the run once, in call order', () => {
  const scope = { runDir: `${SCOPE_CASE}/C3-low/run-1`, cwd: LIVE, pluginRoots: [LIVE_PLUGIN] };
  const calls = [
    // case.json can hold the known defects of a dev case.
    ...reads(
      `${SCOPE_CASE}/case.json`,
      `${SCOPE_CASE}/case.json:1-20`,
      `${SCOPE_CASE}/snapshot/../case.json`,
      `${SCOPE_CASE}/C3-high/run-1/blocks/correctness.md`,
    ),
    { name: 'glob', path: `${SCOPE_CASE}/**/*.diff` },
    { name: 'glob', path: `${SCOPE_CASE}/snapshot/**/../*.json` },
    { name: 'grep', path: `${SCOPE_CASE}/snapshot;${LIVE}/src` },
    // The live checkout: other files, other skills (they can hold fixed shipped text), and the other plugin root.
    ...reads(
      'scripts/score.mjs',
      `${LIVE}/plugins/docks/skills/engineering/code-review/references/perf.md`,
      `${LIVE_PLUGIN}/skills/productivity/plan-manager/SKILL.md`,
      `${LIVE_PLUGIN}/README.md`,
      `${BASELINE_PLUGIN}/skills/productivity/code-reviewer/SKILL.md`,
    ),
    { name: 'grep', path: null },
    { name: 'glob', path: null },
    { name: 'find', path: null },
    ...reads(
      '/etc/hosts',
      'skill://plan-manager/SKILL.md',
      'local://notes.md',
      'history://Code7C3R2Correctness',
      'issue://100',
      'pr://101',
      'https://github.com/DocksDocks/docks/blob/main/src/sync.mjs',
      'https://raw.githubusercontent.com/DocksDocks/docks/main/src/sync.mjs',
      'https://github.com/docksdocks/Docks/issues/100',
      'https://api.github.com/repos/DocksDocks/docks/pulls/101',
    ),
  ];
  assert.deepEqual(score.readScope(calls, scope), {
    outside: [
      `${SCOPE_CASE}/case.json`,
      `${SCOPE_CASE}/snapshot/../case.json`,
      `${SCOPE_CASE}/C3-high/run-1/blocks/correctness.md`,
      `${SCOPE_CASE}/**/*.diff`,
      `${SCOPE_CASE}/snapshot/**/../*.json`,
      `${LIVE}/src`,
      'scripts/score.mjs',
      `${LIVE}/plugins/docks/skills/engineering/code-review/references/perf.md`,
      `${LIVE_PLUGIN}/skills/productivity/plan-manager/SKILL.md`,
      `${LIVE_PLUGIN}/README.md`,
      `${BASELINE_PLUGIN}/skills/productivity/code-reviewer/SKILL.md`,
      'grep without a path',
      'glob without a path',
      'find without a path',
      '/etc/hosts',
      'skill://plan-manager/SKILL.md',
      'local://notes.md',
      'history://Code7C3R2Correctness',
      'issue://100',
      'pr://101',
      'https://github.com/DocksDocks/docks/blob/main/src/sync.mjs',
      'https://raw.githubusercontent.com/DocksDocks/docks/main/src/sync.mjs',
      'https://github.com/docksdocks/Docks/issues/100',
      'https://api.github.com/repos/DocksDocks/docks/pulls/101',
    ],
  });
  // Without a working directory, a relative path is outside. Without a plugin root, the skill of the reviewer is too.
  const ownSkill = `${LIVE_PLUGIN}/skills/productivity/code-reviewer/SKILL.md`;
  const relativeSkill = 'plugins/plan-lifecycle/skills/productivity/code-reviewer/SKILL.md';
  assert.deepEqual(score.readScope(reads(relativeSkill, ownSkill), { ...scope, cwd: null }), {
    outside: [relativeSkill],
  });
  assert.deepEqual(score.readScope(reads(ownSkill), { ...scope, pluginRoots: [] }), { outside: [ownSkill] });
});

test('readScope of a loop round allows the tree copies of its run up to that round and nothing fixed after it', () => {
  const run = `${SCOPE_CASE}/B0-low/run-1`;
  const tree = (runRound) => `${SCOPE_WS}/trees/${score.runLabel('code-7', 'B0-low', runRound)}/src/sync.mjs`;
  const scope = { runDir: run, round: 2, cwd: LIVE, pluginRoots: [BASELINE_PLUGIN] };
  const allowed = [
    ...reads(
      `${run}/round-2/snapshot/src/sync.mjs`,
      `${run}/round-2/full.diff`,
      `${run}/round-2/focus-spec-and-tests.diff`,
      `${run}/round-2/delta.diff`,
      `${run}/round-2/previous-review.md:1-30`,
      `${run}/round-2/rejection.md`,
      `${run}/round-2/prompts/full.txt`,
      `${run}/round-1/prompts/full.txt`,
      // Round 1 reviewed the tree of the case folder.
      `${SCOPE_CASE}/snapshot/src/sync.mjs`,
      `${SCOPE_CASE}/plan.md`,
      tree('run-1/round-2'),
      // A baseline plugin can keep its skills without a category folder.
      `${BASELINE_PLUGIN}/agents/code-reviewer.md`,
      `${BASELINE_PLUGIN}/skills/code-reviewer/SKILL.md`,
    ),
    { name: 'glob', path: `${run}/round-2/snapshot/**/*.mjs` },
  ];
  assert.deepEqual(score.readScope(allowed, scope), { outside: [] });
  // A later round and the fixer folder hold fixed code; meta.json holds the fix plan.
  const outside = [
    `${run}/round-3/snapshot/src/sync.mjs`,
    `${run}/round-1/fixer/snapshot/src/sync.mjs`,
    `${run}/round-1/fixer/fixer-1.patch`,
    `${run}/round-1/meta.json`,
    `${SCOPE_CASE}/B0-low/run-2/round-2/snapshot/src/sync.mjs`,
    tree('run-1/round-3'),
    tree('run-2/round-2'),
    `${LIVE_PLUGIN}/skills/productivity/code-reviewer/SKILL.md`,
  ];
  assert.deepEqual(score.readScope(reads(...outside), scope), { outside });
});

test('transcripts command writes the outside reads of each reviewer and leaves fixer entries without them', (t) => {
  const root = scratch(t);
  const ws = path.join(root, 'ws');
  const sessions = path.join(root, 'sessions');
  const { low } = CONFIGS;
  const caseDir = path.join(ws, 'code-7');
  const round = (r) => path.join(caseDir, 'C1-low', 'run-1', `round-${r}`);
  put(ws, 'code-7/case.json', { id: 'code-7', kind: 'code', split: 'dev' });
  put(round(1), 'prompts/full.txt', 'agent: review-bench-candidate-code-low\n\nReview.\n');
  put(round(1), 'meta.json', { config: low, mode: 'full' });
  put(round(1), 'fixer/fixer-1.txt', 'agent: review-bench-fixer\n\nRepair.\n');
  put(round(2), 'prompts/delta.txt', 'agent: review-bench-candidate-code-low\n\nReview.\n');
  put(round(2), 'meta.json', { config: low, mode: 'delta' });
  // The read scope takes the files that the case changes from the full.diff of each round.
  put(caseDir, 'full.diff', '');
  put(round(2), 'full.diff', '');
  const relativeSkill = 'plugins/docks/skills/engineering/code-review/references/perf.md';
  put(
    sessions,
    'Code7C1LowR1K1Full.jsonl',
    toolTranscript(caseDir, 30, [
      // The system prompt names the plugin root of this skill.
      ['read', { path: `${LIVE_PLUGIN}/skills/productivity/code-reviewer/SKILL.md` }],
      ['read', { path: `${path.join(caseDir, 'full.diff')}:1-200` }],
      ['read', { path: relativeSkill }],
      ['grep', { pattern: 'lock' }],
      ['yield', { result: { data: 'block' } }],
    ]),
  );
  put(
    sessions,
    'Code7C1LowR1K1Fixer1.jsonl',
    toolTranscript(
      caseDir,
      20,
      [
        ['read', { path: path.join(round(1), 'fixer', 'snapshot', 'src', 'extra.mjs') }],
        ['write', { path: '/work/scratch/b/src/extra.mjs' }],
      ],
      'review-bench-fixer',
    ),
  );
  put(
    sessions,
    'Code7C1LowR1K2Delta.jsonl',
    toolTranscript(caseDir, 12, [
      ['read', { path: path.join(round(2), 'snapshot', 'src', 'sync.mjs') }],
      ['read', { path: path.join(round(2), 'delta.diff') }],
      ['grep', { pattern: 'lock', path: path.join(round(2), 'snapshot') }],
    ]),
  );
  assert.deepEqual(transcriptsCommand(ws, sessions), [
    'Code7C1LowR1K1Full',
    'Code7C1LowR1K1Fixer1',
    'Code7C1LowR1K2Delta',
  ]);
  assert.deepEqual(readJson(path.join(round(1), 'meta.json')), {
    config: low,
    mode: 'full',
    reviewers: {
      full: { ...provenCost(low, 30, 100), readScope: { outside: [relativeSkill, 'grep without a path'] } },
    },
    fixer: { seconds: 20, tokens: 100, agents: { 'fixer-1': provenCost(low, 20, 100) } },
  });
  // A reviewer with tool calls only inside its inputs gets an empty outside list.
  assert.deepEqual(readJson(path.join(round(2), 'meta.json')), {
    config: low,
    mode: 'delta',
    reviewers: { delta: { ...provenCost(low, 12, 100), readScope: { outside: [] } } },
  });
});

test('names lists a fixer prompt only until its patch exists, and transcripts still reads the fixer transcript', (t) => {
  const root = scratch(t);
  const ws = path.join(root, 'ws');
  const sessions = path.join(root, 'sessions');
  const { low } = CONFIGS;
  const caseDir = path.join(ws, 'code-7');
  const round1 = path.join(caseDir, 'C1-low', 'run-1', 'round-1');
  const relative = path.join('code-7', 'C1-low', 'run-1', 'round-1');
  put(ws, 'code-7/case.json', { id: 'code-7', kind: 'code', split: 'dev' });
  put(round1, 'prompts/full.txt', 'agent: review-bench-candidate-code-low\n\nReview.\n');
  put(round1, 'meta.json', { config: low, mode: 'full' });
  put(round1, 'blocks/full.md', FULL_BLOCK);
  put(round1, 'fixer/fixer-1.txt', 'agent: review-bench-fixer\n\nRepair.\n');
  const reviewerEntry = { prompt: path.join(relative, 'prompts', 'full.txt'), name: 'Code7C1LowR1K1Full' };
  assert.deepEqual(namesCommand(ws), [
    reviewerEntry,
    { prompt: path.join(relative, 'fixer', 'fixer-1.txt'), name: 'Code7C1LowR1K1Fixer1' },
  ]);
  // The fixer wrote an empty patch: no listed finding needed a change.
  put(round1, 'fixer/fixer-1.patch', '');
  assert.deepEqual(namesCommand(ws), [reviewerEntry]);
  put(sessions, 'Code7C1LowR1K1Full.jsonl', toolTranscript(caseDir, 30, []));
  // The fixer replies through its `yield` call, under a key of its own choice, with one line per finding.
  const finding = (n) => `code-7/C1-low/run-1/round-1/full#${n}`;
  const reply = [`${finding(1)}: not present`, `- \`${finding(2)}\`: Not present.`];
  put(
    sessions,
    'Code7C1LowR1K1Fixer1.jsonl',
    toolTranscript(
      caseDir,
      20,
      [
        ['read', { path: path.join(round1, 'fixer', 'snapshot', 'src', 'extra.mjs') }],
        ['yield', { data: { reply } }],
      ],
      'review-bench-fixer',
    ),
  );
  assert.deepEqual(transcriptsCommand(ws, sessions), ['Code7C1LowR1K1Full', 'Code7C1LowR1K1Fixer1']);
  assert.deepEqual(readJson(path.join(round1, 'meta.json')).fixer, {
    seconds: 20,
    tokens: 100,
    agents: { 'fixer-1': provenCost(low, 20, 100) },
    replies: { [finding(1)]: 'not present', [finding(2)]: 'not present' },
  });
});

test('transcripts on the probe workspace writes the effort and the served tier of each reviewer', (t) => {
  const root = neutralScratch(t);
  const ws = path.join(root, 'ws');
  const sessions = path.join(root, 'sessions');
  const project = path.join(root, 'project');
  const configs = [CONFIGS['low-fast'], CONFIGS.high];
  put(project, '.omp/agents/review-bench-configs.json', { configs });
  const script = path.join(import.meta.dirname, '../../../.agents/skills/review-benchmark/scripts/prepare.mjs');
  const probe = spawnSync(process.execPath, [script, 'probe', '--out', ws, '--project', project], { encoding: 'utf8' });
  assert.equal(probe.status, 0, probe.stderr);
  const caseDir = path.join(ws, 'probe');
  // The probe changes no file, so its full.diff is empty.
  assert.equal(readText(path.join(caseDir, 'full.diff')), '');
  const runDir = (config) => path.join(caseDir, `C1-${config.name}`, 'run-1');
  // One fake reviewer transcript per configuration: the task is the prompt of the probe, and the reviewer replies with
  // one yield call and reads no file.
  for (const [index, config] of configs.entries()) {
    const [provider, model] = config.model.split('/');
    const [, , ...task] = readText(path.join(runDir(config), 'prompts', 'full.txt')).split('\n');
    const last = assistantLine(5 + index, provider, model, config.tier, { input: 90, output: 10 });
    last.message.content = [
      { type: 'text', text: 'ready' },
      { type: 'toolCall', id: 'call-1', name: 'yield', arguments: { result: { data: 'ready' } } },
    ];
    const message = { role: 'user', content: [{ type: 'text', text: task.join('\n') }] };
    const name = dispatchName('probe', `C1-${config.name}`, 'run-1', 'full');
    put(
      sessions,
      `${name}.jsonl`,
      jsonl([
        { type: 'session', timestamp: isoAt(0), cwd: LIVE },
        { type: 'thinking_level_change', timestamp: isoAt(0), thinkingLevel: config.effort },
        { type: 'service_tier_change', timestamp: isoAt(0), serviceTier: { openai: config.tier } },
        {
          type: 'session_init',
          timestamp: isoAt(0),
          agent: `review-bench-candidate-code-${config.name}`,
          systemPrompt: ['You are a coding assistant.'],
          task: message.content[0].text,
        },
        { type: 'message', timestamp: isoAt(0), message },
        last,
      ]),
    );
  }
  assert.deepEqual(transcriptsCommand(ws, sessions).sort(), ['ProbeC1HighR1Full', 'ProbeC1LowFastR1Full']);
  for (const [index, config] of configs.entries()) {
    assert.deepEqual(readJson(path.join(runDir(config), 'meta.json')), {
      config,
      reviewers: { full: { ...provenCost(config, 5 + index, 100), readScope: { outside: [] } } },
    });
  }
  // The probe case is a code case like the others, so a code case without full.diff still stops transcripts.
  fs.rmSync(path.join(caseDir, 'full.diff'));
  assert.throws(() => transcriptsCommand(ws, sessions), /full\.diff is missing/);
});

test('a reviewer that read outside its inputs makes the run invalid, also without a configuration', () => {
  const config = CONFIGS['xhigh-fast'];
  const many = ['a', 'b', 'c', 'd', 'e'].map((name) => `${LIVE}/src/${name}.mjs`);
  const perf = `${LIVE}/plugins/docks/skills/engineering/code-review/references/perf.md`;
  const costs = [
    provenCost(config, 100, 100, { readScope: { outside: [] } }),
    provenCost(config, 200, 100, { readScope: { outside: [perf] } }),
    provenCost(config, 300, 100, {
      messages: [{ model: MODEL, effort: 'high', servedTier: 'priority' }],
      readScope: { outside: many },
    }),
  ];
  // Only the runs that read outside their inputs find D1, so they would raise the recall of the summary.
  const answers = [[], [{ matches: { D1: 'match' } }], [{ matches: { D1: 'match' } }]];
  const fixture = judgedArm(CODE_KNOWN.slice(0, 1), answers, costs);
  for (const meta of Object.values(fixture.metas)) meta.config = config;
  const scores = scoreRuns(fixture);
  const manyReason = `correctness: read outside its inputs: ${many.slice(0, 3).join(', ')}, and 2 more`;
  assert.deepEqual(
    scores.runs.map((run) => [run.run, run.invalid]),
    [
      ['run-1', []],
      ['run-2', [`correctness: read outside its inputs: ${perf}`]],
      ['run-3', ['correctness: effort high, not xhigh', manyReason]],
    ],
  );
  const [summary] = scores.summaries;
  assert.deepEqual([summary.runs, summary.recall.mean], [1, 0]);
  const lines = renderReport(scores).split('\n');
  assert.ok(lines.includes('## Invalid runs'));
  assert.ok(lines.includes(`- code-7/C3/run-3: correctness: effort high, not xhigh; ${manyReason}`));
  // A run without a configuration still proves that it read only its inputs.
  const legacy = scoreRuns(judgedArm(CODE_KNOWN.slice(0, 1), answers, costs));
  assert.deepEqual(
    legacy.runs.map((run) => [run.run, run.invalid]),
    [
      ['run-1', []],
      ['run-2', [`correctness: read outside its inputs: ${perf}`]],
      ['run-3', [manyReason]],
    ],
  );
  assert.equal(legacy.summaries[0].runs, 1);
});

// Changed export:
// - readScope also allows, for each plugin root P, the file `P/skills/plan-manager/references/plan-contract.md` or
//   `P/skills/<folder>/plan-manager/references/plan-contract.md`: the plan-reviewer checklist tells the reviewer to
//   read this contract in its own plugin. It also allows a path under
//   `<any>/plugins/cache/plugins/<plugin dir>/skills/[<folder>/]<skill>/`, where skill is code-review or code-clarity,
//   when the path as the reviewer wrote it has no `..` segment: a `skill://` URI of these skills can resolve to this
//   installed copy. A glob follows the glob rule above. The other skills of the repository that holds P stay outside,
//   because the reviewed repository has its own copy under `snapshot/`.

test('readScope allows the plan contract of a plugin root and an installed cache copy of an allowed skill', () => {
  const scope = { runDir: `${SCOPE_CASE}/C3-low/run-1`, cwd: LIVE, pluginRoots: [LIVE_PLUGIN] };
  const cache = '/home/user/.omp/plugins/cache/plugins/docks___docks___0.21.0/skills';
  const allowed = [
    ...reads(
      `${LIVE_PLUGIN}/skills/productivity/plan-manager/references/plan-contract.md:120-160`,
      `${LIVE_PLUGIN}/skills/plan-manager/references/plan-contract.md`,
      `${cache}/engineering/code-review/references/security.md`,
      `${cache}/code-clarity/SKILL.md:1-40`,
    ),
    { name: 'glob', path: `${cache}/engineering/code-review/references/*.md` },
  ];
  assert.deepEqual(score.readScope(allowed, scope), { outside: [] });
  const outside = [
    // The docks skills of the repository that holds the plugin root. The plans name them, but the copy of the reviewed
    // repository is under the snapshot root.
    `${LIVE}/plugins/docks/skills/engineering/code-review/references/perf.md`,
    `${LIVE}/plugins/docks/skills/**/code-clarity/SKILL.md`,
    // Only the plan contract file of a plugin root of the reviewer.
    `${LIVE_PLUGIN}/skills/productivity/plan-manager/references/other.md`,
    `${LIVE_PLUGIN}/skills/productivity/plan-manager/references/*.md`,
    `${LIVE_PLUGIN}/skills/a/b/plan-manager/references/plan-contract.md`,
    `${BASELINE_PLUGIN}/skills/productivity/plan-manager/references/plan-contract.md`,
    // A cache copy of another skill, a path with a `..` segment, and a glob from a folder above the skill folders.
    `${cache}/productivity/plan-manager/references/plan-contract.md`,
    `${cache}/engineering/code-review/../code-clarity/SKILL.md`,
    `${cache}/**/code-review/SKILL.md`,
  ];
  assert.deepEqual(score.readScope(reads(...outside), scope), { outside });
});

// Changed exports:
// - readScope takes the option changedFiles: the repository paths that the case changes (default none). An optional
//   instruction read is outside when the case changes the same file: the plan contract of a plugin root, a path under
//   an allowed skill folder of a plugin cache copy, or a `skill://` URI of an allowed skill. The comparison uses the
//   path from the skill folder name on: `plugins/<plugin>/skills/[<folder>/]<skill>/<rest>` and a cache path
//   `…/skills/[<folder>/]<skill>/<rest>` give `<skill>/<rest>`, `skill://<skill>` gives `<skill>/SKILL.md`, and
//   `skill://<skill>/<rest>` gives `<skill>/<rest>`. A glob is outside when a changed file can be under the folder
//   before its first glob segment. The agent file and the skill folder of the reviewer in its plugin root stay allowed
//   also when the case changes them.
// - transcriptsCommand gives readScope the changed files of the case: for a plan or plan-delta case, the paths in the
//   Files cells of the Steps table of the plan.md of the case folder; for a run with round folders, the paths in the
//   `diff --git` and `+++ b/` lines of the full.diff of the round (round 1: of the case folder); for a single-review
//   code run, the paths in these lines of each diff file of the case folder.

test('readScope puts an optional instruction read outside when the case changes the same file', () => {
  const cache = '/home/user/.omp/plugins/cache/plugins/docks___docks___0.21.0/skills';
  const scope = {
    runDir: `${SCOPE_CASE}/C3-low/run-1`,
    cwd: LIVE,
    pluginRoots: [LIVE_PLUGIN],
    changedFiles: [
      'plugins/plan-lifecycle/skills/productivity/plan-manager/references/plan-contract.md',
      'plugins/docks/skills/engineering/code-review/SKILL.md',
      'plugins/plan-lifecycle/agents/code-reviewer.md',
      'plugins/plan-lifecycle/skills/productivity/code-reviewer/SKILL.md',
    ],
  };
  const allowed = [
    ...reads(
      `${cache}/engineering/code-review/references/perf.md`,
      'skill://code-clarity',
      // The reviewer cannot work without its agent file and its own skill folder, so they stay allowed.
      `${LIVE_PLUGIN}/skills/productivity/code-reviewer/SKILL.md`,
      `${LIVE_PLUGIN}/agents/code-reviewer.md`,
    ),
    { name: 'glob', path: `${cache}/engineering/code-review/references/*.md` },
  ];
  assert.deepEqual(score.readScope(allowed, scope), { outside: [] });
  const outside = [
    `${LIVE_PLUGIN}/skills/productivity/plan-manager/references/plan-contract.md`,
    `${cache}/engineering/code-review/SKILL.md`,
    'skill://code-review',
    // The folder before the first glob segment holds the changed SKILL.md.
    `${cache}/engineering/code-review/*.md`,
  ];
  assert.deepEqual(score.readScope(reads(...outside), scope), { outside });
  // A case that changes none of these files allows the same reads.
  assert.deepEqual(score.readScope(reads(...outside), { ...scope, changedFiles: [] }), { outside: [] });
});

test('transcripts command takes the changed files of a plan case from the Files cells of its Steps table', (t) => {
  const root = scratch(t);
  const ws = path.join(root, 'ws');
  const sessions = path.join(root, 'sessions');
  const contract = 'plugins/plan-lifecycle/skills/productivity/plan-manager/references/plan-contract.md';
  put(ws, 'plan-3/case.json', { id: 'plan-3', kind: 'plan', split: 'dev' });
  put(
    ws,
    'plan-3/plan.md',
    [
      '## Goal',
      '',
      'Change the plan contract.',
      '',
      '## Steps',
      '',
      '| # | Id | Task | Files | Depends | Effect | Status | Done when |',
      '|---:|---|---|---|---|---|---|---|',
      `| 1 | contract | Edit the contract | \`${contract}\`, scripts/a.mjs | - | local | planned | the check passes |`,
      '',
    ].join('\n'),
  );
  put(ws, 'plan-3/P0/run-1/prompts/plan.txt', 'agent: review-bench-candidate-plan-low\n\nReview.\n');
  const contractRead = `${LIVE_PLUGIN}/skills/productivity/plan-manager/references/plan-contract.md`;
  put(
    sessions,
    'Plan3P0R1Plan.jsonl',
    toolTranscript(path.join(ws, 'plan-3'), 30, [
      ['read', { path: contractRead }],
      ['read', { path: 'skill://code-review/references/perf.md' }],
    ]),
  );
  assert.deepEqual(transcriptsCommand(ws, sessions), ['Plan3P0R1Plan']);
  assert.deepEqual(readJson(path.join(ws, 'plan-3/P0/run-1/meta.json')).reviewers.plan.readScope, {
    outside: [contractRead],
  });
});

test('the code-loop rows leave out single reviews, and the fixer median leaves out loops without a fixer', () => {
  const round = (seconds, tokens, mode, fixer, answers) => [seconds, tokens, mode, fixer, answers];
  const fixture = gridFixture(
    {
      'code-7': { split: 'dev', known: ['D1', 'D2'] },
      'code-8': { split: 'dev', known: ['D1'] },
      'plan-3': { split: 'dev', known: ['P1', 'P2'], kind: 'plan' },
      'code-5': { split: 'dev', known: ['D1'], kind: 'code-delta' },
      'plan-6': { split: 'heldout', known: ['P1'], kind: 'plan-delta' },
    },
    [
      // low: a loop with a fixer, a loop without a fixer, and two single reviews that take longer than each loop.
      {
        case: 'code-7',
        config: 'low',
        rounds: [round(100, 1000, 'full', 30, ['D1', 'valid']), round(40, 400, 'delta', 0, [])],
      },
      { case: 'code-8', config: 'low', rounds: [round(80, 800, 'full', 0, [])] },
      { case: 'plan-3', config: 'low', single: true, rounds: [round(300, 3000, null, 0, ['P1', 'wrong'])] },
      { case: 'code-5', config: 'low', single: true, rounds: [round(500, 5000, null, 0, ['D1'])] },
      {
        case: 'code-7',
        config: 'low-fast',
        rounds: [round(50, 500, 'full', 20, ['D1', 'D2']), round(10, 100, 'delta', 0, [])],
      },
      {
        case: 'code-8',
        config: 'low-fast',
        rounds: [round(30, 300, 'full', 10, ['D1']), round(10, 100, 'delta', 0, [])],
      },
      { case: 'plan-3', config: 'low-fast', single: true, rounds: [round(200, 2000, null, 0, ['P1', 'P2'])] },
      { case: 'code-5', config: 'low-fast', single: true, rounds: [round(400, 4000, null, 0, [])] },
      { case: 'plan-6', config: 'low', single: true, rounds: [round(100, 1000, null, 0, ['P1'])] },
    ],
  );
  // Only the loops with a fixer have fixer tokens.
  fixture.metas['code-7/C1-low/run-1/round-1'].fixer.tokens = 3000;
  fixture.metas['code-7/C1-low-fast/run-1/round-1'].fixer.tokens = 2000;
  fixture.metas['code-8/C1-low-fast/run-1/round-1'].fixer.tokens = 600;
  const scores = scoreRuns(fixture);
  const loops = scores.runs.filter((run) => run.loop).map((run) => `${run.case}/${run.arm}`);
  assert.deepEqual(loops, ['code-7/C1-low', 'code-7/C1-low-fast', 'code-8/C1-low', 'code-8/C1-low-fast']);
  const report = renderReport(scores, { configs: ['low', 'low-fast'] });
  // The decision table covers the loops and the single reviews together.
  const decision = tableAfter(report, '### Decision: dev');
  assert.deepEqual(decision.slice(0, 9), [
    '| Measure | low | low-fast |',
    '|---|---:|---:|',
    '| Runs | 4 | 4 |',
    '| Known found per run | 0.75 | 1.25 |',
    '| Escaped per run | 0.75 | 0.25 |',
    '| Escaped per 50 known | 25.00 | 8.33 |',
    `| Model | ${MODEL} | ${MODEL} |`,
    '| Effort | low | low |',
    '| Served tier | default | priority |',
  ]);
  const intervalLabels = decision.slice(9).map((row) => row.split(' | ')[0]);
  assert.deepEqual(intervalLabels, [
    '| Round 1 recall difference from low-fast, 90% interval',
    '| Escaped per 50 known difference from low-fast, 90% interval',
    '| Loop seconds difference from low-fast, 90% interval',
  ]);
  // Loops only: code-7 differs by 80 seconds and code-8 by 40. The single reviews, 100 seconds each, stay out.
  assert.equal(decision[11], '| Loop seconds difference from low-fast, 90% interval | [40.0, 80.0] | - |');
  assert.deepEqual(tableAfter(report, '### Code loops: dev'), [
    '| Measure | low | low-fast |',
    '|---|---:|---:|',
    '| Runs | 2 | 2 |',
    `| Model | ${MODEL} | ${MODEL} |`,
    '| Effort | low | low |',
    '| Served tier | default | priority |',
    '| Round 1 seconds median | 90.0 | 40.0 |',
    '| Round 1 seconds min | 80.0 | 30.0 |',
    '| Round 1 seconds max | 100.0 | 50.0 |',
    '| Round 1 modes | full 2 | full 2 |',
    '| Round 1 known found per run | 0.50 | 1.50 |',
    '| Round 2 seconds median | 40.0 | 10.0 |',
    '| Round 2 seconds min | 40.0 | 10.0 |',
    '| Round 2 seconds max | 40.0 | 10.0 |',
    '| Round 2 modes | delta 1 | delta 2 |',
    '| Round 2 known found per run | 0.00 | 0.00 |',
    '| Rounds median | 1.5 | 2.0 |',
    '| Rounds max | 2 | 2 |',
    '| Loop seconds median | 110.0 | 50.0 |',
    '| Known found per run | 0.50 | 1.50 |',
    '| Escaped per run | 1.00 | 0.00 |',
    '| Valid extras per run | 0.50 | 0.00 |',
    '| Extra-only rounds per run | 0.00 | 0.00 |',
    '| Wrong per run | 0.00 | 0.00 |',
    '| Unjudged per run | 0.00 | 0.00 |',
    '| Unknown ratings per run | 0.00 | 0.00 |',
    '| Unknown pairs per run | 0.00 | 0.00 |',
    '| Tokens median | 1100 | 500 |',
    '| Side-call tokens median | 0 | 0 |',
    // The low loop of code-8 ran no fixer: the median is 30.0, not the median 15.0 of 30 and 0.
    '| Loops with a fixer | 1 | 2 |',
    '| Fixer seconds median | 30.0 | 15.0 |',
    // The same holds for the fixer tokens: the median is 3000, not the median 1500 of 3000 and 0.
    '| Fixer tokens median | 3000 | 1300 |',
    '| Known found per loop minute | 0.27 | 1.80 |',
  ]);
  assert.deepEqual(tableAfter(report, '### Single reviews: dev'), [
    '| Measure | low | low-fast |',
    '|---|---:|---:|',
    '| Runs | 2 | 2 |',
    `| Model | ${MODEL} | ${MODEL} |`,
    '| Effort | low | low |',
    '| Served tier | default | priority |',
    '| Seconds median | 400.0 | 300.0 |',
    '| Seconds min | 300.0 | 200.0 |',
    '| Seconds max | 500.0 | 400.0 |',
    '| Known found per run | 1.00 | 1.00 |',
    '| Escaped per run | 0.50 | 0.50 |',
    '| Valid extras per run | 0.00 | 0.00 |',
    '| Wrong per run | 0.50 | 0.00 |',
    '| Unjudged per run | 0.00 | 0.00 |',
    '| Unknown ratings per run | 0.00 | 0.00 |',
    '| Unknown pairs per run | 0.00 | 0.00 |',
    '| Tokens median | 4000 | 3000 |',
  ]);
  // The held-out group has single reviews only, so it has no code-loop table.
  assert.equal(report.includes('### Code loops: heldout'), false);
  assert.ok(tableAfter(report, '### Decision: heldout').includes('| Runs | 1 | 0 |'));
  assert.ok(tableAfter(report, '### Single reviews: heldout').includes('| Runs | 1 | 0 |'));
});

test('the decision table compares with the configuration that has the fewest escaped defects per 50 known', () => {
  const round = (seconds, tokens, mode, fixer, answers) => [seconds, tokens, mode, fixer, answers];
  // Invalid runs can leave the configurations with different cases. low-fast escapes 1 of the 2 known defects of its
  // 2 runs (0.50 per run, 25.00 per 50 known); low escapes 1 of the 4 known defects of its 1 run (1.00 per run, 12.50
  // per 50 known). The reference is low, which is not the last column.
  const fixture = gridFixture(
    {
      'code-7': { split: 'dev', known: ['D1', 'D2', 'D3', 'D4'] },
      'code-8': { split: 'dev', known: ['D1'] },
      'code-9': { split: 'dev', known: ['D1'] },
    },
    [
      {
        case: 'code-7',
        config: 'low',
        rounds: [round(100, 1000, 'full', 0, ['D1', 'D2', 'D3']), round(20, 200, 'delta', 0, [])],
      },
      { case: 'code-8', config: 'low-fast', rounds: [round(30, 300, 'full', 0, [])] },
      {
        case: 'code-9',
        config: 'low-fast',
        rounds: [round(30, 300, 'full', 0, ['D1']), round(10, 100, 'delta', 0, [])],
      },
      {
        case: 'code-7',
        config: 'high',
        rounds: [round(180, 1800, 'full', 0, ['D1', 'D2']), round(20, 200, 'delta', 0, [])],
      },
    ],
  );
  const report = renderReport(scoreRuns(fixture), { configs: ['low-fast', 'low', 'high'] });
  const decision = tableAfter(report, '### Decision: dev');
  for (const row of [
    '| Measure | low-fast | low | high |',
    '| Runs | 2 | 1 | 1 |',
    '| Escaped per run | 0.50 | 1.00 | 2.00 |',
    '| Escaped per 50 known | 25.00 | 12.50 | 25.00 |',
    // low-fast shares no case with low; high and low share code-7.
    '| Round 1 recall difference from low, 90% interval | - | - | [-0.25, -0.25] |',
    '| Escaped per 50 known difference from low, 90% interval | - | - | [12.50, 12.50] |',
    '| Loop seconds difference from low, 90% interval | - | - | [80.0, 80.0] |',
  ]) {
    assert.ok(decision.includes(row), `the decision table lacks ${row}`);
  }
});

// `report --arms <folder,...>` (renderReport option `arms`) replaces the configuration sections with `## Arms: <split>`
// sections: the same tables, with one column per arm folder in the order of `arms`. The decision table adds the row
// `Cases` after Runs, and the row `Cases shared with <reference>` before the interval rows: the cases that the column
// and the reference column both ran (`-` in the reference column). `--configs` and `--arms` together fail.
test('report --arms gives one column per arm folder and compares it with the arm that escapes the fewest', (t) => {
  const round = (seconds, tokens, mode, fixer, answers) => [seconds, tokens, mode, fixer, answers];
  const fixture = gridFixture(
    {
      'code-7': { split: 'dev', known: ['D1', 'D2'] },
      'code-8': { split: 'dev', known: ['D1'] },
    },
    [
      {
        case: 'code-7',
        config: 'xhigh-fast',
        rounds: [round(100, 1000, 'full', 0, ['D1', 'D2']), round(20, 200, 'delta', 0, [])],
      },
      { case: 'code-8', config: 'xhigh-fast', rounds: [round(50, 500, 'full', 0, ['D1'])] },
      {
        case: 'code-7',
        config: 'xhigh-fast',
        arm: 'B0',
        rounds: [
          round(120, 1200, 'full', 0, ['D1']),
          round(40, 400, 'delta', 0, ['D2']),
          round(20, 200, 'delta', 0, []),
        ],
      },
      { case: 'code-8', config: 'xhigh-fast', arm: 'B0', rounds: [round(60, 600, 'full', 0, [])] },
    ],
  );
  const scores = scoreRuns(fixture);
  const report = renderReport(scores, { arms: ['C1-xhigh-fast', 'B0-xhigh-fast'] });
  assert.equal(report.includes('## Configurations: dev'), false);
  // B0 escapes code-8/D1, so C1 is the reference. Round 1 of B0 finds only D1 of code-7; its round 2 finds D2.
  assert.deepEqual(tableAfter(report, '## Arms: dev'), [
    '| Measure | C1-xhigh-fast | B0-xhigh-fast |',
    '|---|---:|---:|',
    '| Runs | 2 | 2 |',
    '| Cases | 2 | 2 |',
    '| Known found per run | 1.50 | 1.00 |',
    '| Escaped per run | 0.00 | 0.50 |',
    '| Escaped per 50 known | 0.00 | 16.67 |',
    `| Model | ${MODEL} | ${MODEL} |`,
    '| Effort | xhigh | xhigh |',
    '| Served tier | priority | priority |',
    '| Cases shared with C1-xhigh-fast | - | 2 |',
    '| Round 1 recall difference from C1-xhigh-fast, 90% interval | - | [-1.00, -0.50] |',
    '| Escaped per 50 known difference from C1-xhigh-fast, 90% interval | - | [0.00, 50.00] |',
    '| Loop seconds difference from C1-xhigh-fast, 90% interval | - | [10.0, 60.0] |',
  ]);
  assert.deepEqual(tableAfter(report, '### Decision: dev'), tableAfter(report, '## Arms: dev'));
  assert.equal(tableAfter(report, '### Code loops: dev')[0], '| Measure | C1-xhigh-fast | B0-xhigh-fast |');
  // --configs still puts both arms of the configuration in one column, without the case rows.
  const byConfig = tableAfter(renderReport(scores, { configs: ['xhigh-fast'] }), '### Decision: dev');
  assert.deepEqual(byConfig.slice(0, 3), ['| Measure | xhigh-fast |', '|---|---:|', '| Runs | 4 |']);
  assert.equal(
    byConfig.some((row) => row.startsWith('| Cases')),
    false,
  );
  assert.throws(
    () => renderReport(scores, { configs: ['xhigh-fast'], arms: ['C1-xhigh-fast'] }),
    /^Error: report takes --configs or --arms, not both$/,
  );
  // The command line takes the same options.
  const { ws, cases } = roundWorkspace(t, [
    {
      config: CONFIGS.low,
      run: 1,
      rounds: [
        [FULL_BLOCK, 100, 1000, 'full'],
        [PASS_ROUND, 40, 400, 'delta'],
      ],
    },
    {
      config: CONFIGS['low-fast'],
      run: 1,
      rounds: [
        [FULL_BLOCK, 50, 500, 'full'],
        [PASS_ROUND, 10, 100, 'delta'],
      ],
    },
  ]);
  findingsCommand(ws);
  main(['pairs', ws, '--cases', cases]);
  judgeAll(ws, (_, known) => (known === 'D1' ? 'match' : 'no'));
  assert.throws(() => main(['report', ws, '--configs', 'low', '--arms', 'C1-low']), /not both$/);
  assert.throws(() => main(['report', ws, '--lead', 'C1-low']), /^Error: report takes --lead and --lead-ref together$/);
  assert.equal(
    main(['report', ws, '--arms', 'C1-low-fast,C1-low', '--lead', 'C1-low', '--lead-ref', 'C1-low-fast']),
    'report.md: 2 runs',
  );
  const written = fs.readFileSync(path.join(ws, 'report.md'), 'utf8');
  assert.equal(tableAfter(written, '### Decision: dev')[0], '| Measure | C1-low-fast | C1-low |');
  assert.equal(tableAfter(written, '### Self-review lead: dev')[0], '| Measure | C1-low | C1-low-fast |');
});

test('arm columns can hold different cases, and the decision table says how many cases each pair shares', () => {
  const round = (seconds, tokens, mode, fixer, answers) => [seconds, tokens, mode, fixer, answers];
  const single = (caseId, arm, seconds, answers) => ({
    case: caseId,
    config: 'xhigh-fast',
    arm,
    single: true,
    rounds: [round(seconds, seconds * 10, null, 0, answers)],
  });
  const fixture = gridFixture(
    {
      'code-7': { split: 'dev', known: ['D1', 'D2'] },
      'code-8': { split: 'dev', known: ['D1'] },
      'code-9': { split: 'dev', known: ['D1'] },
      'code-5': { split: 'heldout', known: ['D1'] },
    },
    [
      // C1 loops ran every case. S1 single reviews did not run code-9, and S3 single reviews ran code-8 and code-9.
      {
        case: 'code-7',
        config: 'xhigh-fast',
        rounds: [
          round(100, 1000, 'full', 0, ['D1']),
          round(30, 300, 'delta', 0, ['D2']),
          round(10, 100, 'delta', 0, []),
        ],
      },
      {
        case: 'code-8',
        config: 'xhigh-fast',
        rounds: [round(50, 500, 'full', 0, ['D1']), round(10, 100, 'delta', 0, [])],
      },
      { case: 'code-9', config: 'xhigh-fast', rounds: [round(40, 400, 'full', 0, [])] },
      {
        case: 'code-5',
        config: 'xhigh-fast',
        rounds: [round(45, 450, 'full', 0, ['D1']), round(15, 150, 'delta', 0, [])],
      },
      single('code-7', 'S1', 80, ['D1', 'D2']),
      single('code-8', 'S1', 60, ['D1']),
      single('code-5', 'S1', 55, []),
      single('code-8', 'S3', 90, ['D1']),
      single('code-9', 'S3', 70, ['D1']),
    ],
  );
  const arms = ['C1-xhigh-fast', 'S1-xhigh-fast', 'S3-xhigh-fast'];
  const report = renderReport(scoreRuns(fixture), { arms });
  // In dev, S1 and S3 escape nothing; S1 is the first of them, so it is the reference. C1 shares code-7 and code-8
  // with S1, and S3 shares code-8. S1 has no loop, so no column has a loop seconds interval.
  assert.deepEqual(tableAfter(report, '### Decision: dev'), [
    '| Measure | C1-xhigh-fast | S1-xhigh-fast | S3-xhigh-fast |',
    '|---|---:|---:|---:|',
    '| Runs | 3 | 2 | 2 |',
    '| Cases | 3 | 2 | 2 |',
    '| Known found per run | 1.00 | 1.50 | 1.00 |',
    '| Escaped per run | 0.33 | 0.00 | 0.00 |',
    '| Escaped per 50 known | 12.50 | 0.00 | 0.00 |',
    `| Model | ${MODEL} | ${MODEL} | ${MODEL} |`,
    '| Effort | xhigh | xhigh | xhigh |',
    '| Served tier | priority | priority | priority |',
    '| Cases shared with S1-xhigh-fast | 2 | - | 1 |',
    '| Round 1 recall difference from S1-xhigh-fast, 90% interval | [-0.50, 0.00] | - | [0.00, 0.00] |',
    '| Escaped per 50 known difference from S1-xhigh-fast, 90% interval | [0.00, 0.00] | - | [0.00, 0.00] |',
    '| Loop seconds difference from S1-xhigh-fast, 90% interval | - | - | - |',
  ]);
  assert.ok(tableAfter(report, '### Code loops: dev').includes('| Runs | 3 | 0 | 0 |'));
  const singles = tableAfter(report, '### Single reviews: dev');
  assert.ok(singles.includes('| Runs | 0 | 2 | 2 |'));
  assert.ok(singles.includes('| Seconds median | - | 70.0 | 80.0 |'));
  // Each case group has its own reference: in heldout, S1 escapes code-5/D1, so C1 is the reference.
  const heldout = tableAfter(report, '## Arms: heldout');
  for (const row of [
    '| Cases | 1 | 1 | 0 |',
    '| Escaped per 50 known | 0.00 | 50.00 | - |',
    '| Cases shared with C1-xhigh-fast | - | 1 | 0 |',
    '| Round 1 recall difference from C1-xhigh-fast, 90% interval | - | [-1.00, -1.00] | - |',
  ]) {
    assert.ok(heldout.includes(row), `the heldout arm table lacks ${row}`);
  }
});

// `report --lead <folder,...> --lead-ref <folder>` (renderReport options `lead` and `leadRef`) adds the section
// `## Self-review lead` with one table `### Self-review lead: <split>` per case group: one column per lead folder,
// then the reference folder, from the valid runs. Each run counts with its round 1 only. The only-found row lists, per
// case that the reference ran, the known ids that the column found and round 1 of no reference run found, as
// `<case>: <ids>` joined by "; ". Cases without a reference run stay out of that row and get a count.
test('the self-review lead lists the known defects that only the lead found, against round 1 of the reference', () => {
  const round = (seconds, tokens, mode, fixer, answers) => [seconds, tokens, mode, fixer, answers];
  const single = (caseId, arm, run, seconds, answers) => ({
    case: caseId,
    config: 'xhigh-fast',
    arm,
    run,
    single: true,
    rounds: [round(seconds, seconds * 10, null, 0, answers)],
  });
  const fixture = gridFixture(
    {
      'code-7': { split: 'dev', known: ['D1', 'D2', 'D3'] },
      'code-8': { split: 'dev', known: ['D1', 'D2'] },
      'code-9': { split: 'dev', known: ['D1'] },
    },
    [
      // The reference loops find code-7/D1 and code-7/D3 in round 1, and code-7/D2 only in round 2. They do not run
      // code-9.
      {
        case: 'code-7',
        config: 'xhigh-fast',
        run: 1,
        rounds: [
          round(100, 1000, 'full', 0, ['D1']),
          round(40, 400, 'delta', 0, ['D2']),
          round(10, 100, 'delta', 0, []),
        ],
      },
      {
        case: 'code-7',
        config: 'xhigh-fast',
        run: 2,
        rounds: [round(120, 1200, 'full', 0, ['D3']), round(20, 200, 'delta', 0, [])],
      },
      { case: 'code-8', config: 'xhigh-fast', run: 1, rounds: [round(80, 800, 'full', 0, [])] },
      // An invalid run: its round 1 finds code-8/D2, but it does not count.
      { case: 'code-8', config: 'xhigh-fast', run: 2, rounds: [round(30, 300, 'full', 0, ['D2'])] },
      single('code-7', 'S1', 1, 60, ['D1', 'D2']),
      single('code-7', 'S1', 2, 90, ['D3']),
      single('code-8', 'S1', 1, 70, ['D2']),
      single('code-9', 'S1', 1, 50, ['D1']),
      single('code-7', 'S3', 1, 70, ['D2']),
      single('code-8', 'S3', 1, 65, []),
    ],
  );
  fixture.metas['code-8/C1-xhigh-fast/run-2/round-1'].reviewers.full.messages[0].effort = 'high';
  // S3 is a split arm: a second reviewer of its code-7 run takes 110 seconds, so that run takes 110 seconds.
  fixture.findings.blocks.push({
    case: 'code-7',
    kind: 'code',
    arm: 'S3-xhigh-fast',
    run: 'run-1',
    reviewer: 'self-review-spec-and-tests',
    verdict: 'pass',
    findings: 0,
  });
  const { reviewers } = fixture.metas['code-7/S3-xhigh-fast/run-1'];
  reviewers['self-review-spec-and-tests'] = provenCost(CONFIGS['xhigh-fast'], 110, 100);
  const scores = scoreRuns(fixture);
  const report = renderReport(scores, { lead: ['S1-xhigh-fast', 'S3-xhigh-fast'], leadRef: 'C1-xhigh-fast' });
  assert.ok(report.split('\n').includes('## Self-review lead'));
  assert.deepEqual(tableAfter(report, '### Self-review lead: dev'), [
    '| Measure | S1-xhigh-fast | S3-xhigh-fast | C1-xhigh-fast |',
    '|---|---:|---:|---:|',
    '| Runs | 4 | 2 | 3 |',
    '| Cases | 3 | 2 | 2 |',
    '| Round 1 seconds median | 65.0 | 87.5 | 100.0 |',
    '| Round 1 seconds min | 50.0 | 65.0 | 80.0 |',
    '| Round 1 seconds max | 90.0 | 110.0 | 120.0 |',
    '| Known found in a run | code-7: D1, D2, D3; code-8: D2; code-9: D1 | code-7: D2 | code-7: D1, D3 |',
    // code-7/D2 counts: the reference found it only in round 2. code-9 stays out: the reference did not run it.
    '| Known found that no C1-xhigh-fast run found | code-7: D2; code-8: D2 | code-7: D2 | - |',
    '| Cases without a C1-xhigh-fast run | 1 | 0 | - |',
  ]);
  // The lead section comes with the configuration sections; it does not replace them.
  assert.ok(report.indexOf('## Configurations: dev') < report.indexOf('## Self-review lead'));
  assert.throws(
    () => renderReport(scores, { lead: ['S1-xhigh-fast'] }),
    /^Error: report takes --lead and --lead-ref together$/,
  );
  assert.equal(renderReport(scores).includes('## Self-review lead'), false);
});

// Plan #100 step 6: API note for the self-review tests below (#98).
//
// New exports of prepare.mjs:
// - prepareAgents(options, repo): the `agents` command. options holds the flags by long name, as parseArgs gives them.
//   For each configuration it also writes the agent selfReviewAgent(<config>) = `review-bench-selfreview-<config>`,
//   with the model, the effort, and the tier override of the reviewer agents of that configuration. Its agent text
//   names the absolute path of its own agent file.
// - selfReviewAgent(config) -> `review-bench-selfreview-<config>`.
//
// Changed exports:
// - ARMS.code has S1 (reviewer `self-review`, a full-mode prompt) and S3 (reviewers `self-review-<lens>`, the panel
//   prompt of the lens, with the lens description of a baseline lens). Both dispatch the self-review agent and take
//   no --loop.
// - readScope takes `agentFiles`, a list of absolute paths that the reviewer may read. transcriptsCommand gives the
//   paths `<dir>/.omp/agents/review-bench-selfreview-<x>.md` and `<dir>/.claude/agents/review-bench-selfreview-<x>.md`
//   that the system prompt of the `session_init` entry names.

// The `key: value` lines of the frontmatter of an agent file.
function frontmatter(file) {
  const [, block] = /^---\n([\s\S]*?)\n---\n/.exec(readText(file));
  return Object.fromEntries(
    block.split('\n').map((line) => [line.slice(0, line.indexOf(':')), line.slice(line.indexOf(':') + 1).trim()]),
  );
}

// Runs `agents` for the efforts low and high and the tiers priority and default on a git repository whose head holds
// the reviewer agents that `agents` copies. The project folder is `projectFolder` in the scratch folder. It returns the
// project folder and its omp agent folder.
function selfReviewAgents(t, projectFolder = 'project') {
  isolateGit(t);
  const root = neutralScratch(t);
  const repo = path.join(root, 'repo');
  const project = path.join(root, projectFolder);
  fs.mkdirSync(repo);
  fs.mkdirSync(project);
  gitIn(repo, 'init', '-q', '-b', 'main');
  for (const role of ['code', 'plan']) {
    const agent = `---\nname: ${role}-reviewer\ndescription: Reviews.\ntools: Read, Glob, Grep\n---\n\n# Reviewer\n`;
    put(repo, `plugins/plan-lifecycle/agents/${role}-reviewer.md`, agent);
  }
  gitIn(repo, 'add', '-A');
  gitIn(repo, 'commit', '-q', '-m', 'agents');
  const options = {
    'baseline-ref': 'HEAD',
    model: MODEL,
    efforts: 'low,high',
    tiers: 'priority,default',
    'baseline-dir': path.join(root, 'baseline-plugin'),
    project,
  };
  prepare.prepareAgents(options, repo);
  return { root, project, agentDir: path.join(project, '.omp', 'agents') };
}

test('agents writes one self-review agent per configuration with the effort and tier of its reviewer agents', (t) => {
  const { project, agentDir } = selfReviewAgents(t);
  const { configs } = readJson(path.join(agentDir, 'review-bench-configs.json'));
  assert.deepEqual(
    configs.map((config) => config.name),
    ['low-fast', 'low', 'high-fast', 'high'],
  );
  assert.deepEqual(
    fs
      .readdirSync(agentDir)
      .filter((name) => name.startsWith('review-bench-selfreview-'))
      .sort(),
    configs.map((config) => `review-bench-selfreview-${config.name}.md`).sort(),
  );
  const overrides = readJson(path.join(project, '.omp', 'settings.json')).task.agentServiceTierOverrides;
  for (const { name, model, effort, tier } of configs) {
    const agent = prepare.selfReviewAgent(name);
    const reviewer = `review-bench-candidate-code-${name}`;
    assert.equal(agent, `review-bench-selfreview-${name}`);
    const fields = frontmatter(path.join(agentDir, `${agent}.md`));
    const reviewerFields = frontmatter(path.join(agentDir, `${reviewer}.md`));
    assert.deepEqual([fields.name, fields.model, fields['thinking-level']], [agent, model, effort]);
    assert.equal(reviewerFields.model, fields.model);
    assert.equal(reviewerFields['thinking-level'], fields['thinking-level']);
    assert.equal(overrides[agent], tier);
    assert.equal(overrides[agent], overrides[reviewer]);
  }
  // clean removes the self-review agents and their tier overrides with the other generated files.
  const script = path.join(import.meta.dirname, '../../../.agents/skills/review-benchmark/scripts/prepare.mjs');
  const clean = spawnSync(process.execPath, [script, 'clean', '--project', project], { encoding: 'utf8' });
  assert.equal(clean.status, 0, clean.stderr);
  assert.equal(fs.existsSync(path.join(project, '.omp')), false);
});

test('case --arms S1,S3 writes one self-review prompt on the full diff and one per lens on its focus diff', (t) => {
  const { root, repo, base, head } = loopRepo(t);
  const ws = path.join(root, 'ws');
  const cases = path.join(root, 'cases');
  const project = path.join(root, 'project');
  put(project, '.omp/agents/review-bench-configs.json', { configs: [CONFIGS.low] });
  const caseData = {
    id: 'code-7',
    kind: 'code',
    split: 'dev',
    issue: 7,
    round: 1,
    plan: 'code-7-plan.md',
    base,
    head,
    known: [],
  };
  put(cases, 'dev/code-7.json', caseData);
  put(cases, 'dev/code-7-plan.md', '# Plan 7\n');
  const options = {
    case: path.join(cases, 'dev', 'code-7.json'),
    arms: 'S1,S3',
    runs: '1',
    out: ws,
    configs: 'low',
    project,
  };
  const caseDir = path.join(ws, 'code-7');
  // The self-review runs once, before code-review round 1, so its arms take no --loop.
  assert.throws(() => prepare.prepareCase({ ...options, loop: true }, repo), /S1, S3/);
  assert.equal(fs.existsSync(caseDir), false);

  prepare.prepareCase(options, repo);
  const paths = prepare.workspacePaths(caseDir, caseData);
  const opening = prepare.buildOpening(caseData, paths);
  const runDir = (arm) => path.join(caseDir, `${arm}-low`, 'run-1');
  // A prompt file is the agent line, an empty line, and the prompt.
  const prompt = (arm, reviewer) => {
    const [agent, empty, ...rest] = readText(path.join(runDir(arm), 'prompts', `${reviewer}.txt`)).split('\n');
    assert.equal(empty, '');
    return { agent, body: rest.join('\n') };
  };
  const promptOf = (arm, reviewer) =>
    prepare.buildPromptFile({ caseData, arm, config: 'low', reviewer, paths }).split('\n').slice(2).join('\n');

  assert.deepEqual(fs.readdirSync(path.join(runDir('S1'), 'prompts')), ['self-review.txt']);
  const single = prompt('S1', 'self-review');
  assert.equal(single.agent, 'agent: review-bench-selfreview-low');
  assert.ok(single.body.startsWith(`${opening}\n\n`));
  assert.ok(single.body.split('\n').includes(`Full diff: ${paths.fullDiff}`));
  // S1 gets the prompt of a full code-review round.
  assert.equal(single.body, promptOf('C1', 'full'));

  assert.deepEqual(
    fs.readdirSync(path.join(runDir('S3'), 'prompts')).sort(),
    prepare.LENSES.map((lens) => `self-review-${lens}.txt`),
  );
  for (const lens of prepare.LENSES) {
    const panel = prompt('S3', `self-review-${lens}`);
    assert.equal(panel.agent, 'agent: review-bench-selfreview-low');
    assert.ok(panel.body.startsWith(`${opening}\n\n`));
    assert.ok(fs.existsSync(paths.focus[lens]));
    assert.ok(panel.body.split('\n').includes(`Focus diff: ${paths.focus[lens]}`));
    // Each S3 reviewer gets the prompt of a baseline panel lens, which describes the scope of the lens.
    assert.equal(panel.body, promptOf('B1', lens));
  }

  // Both arms are single-round runs.
  for (const arm of ['S1', 'S3']) {
    assert.deepEqual(fs.readdirSync(runDir(arm)).sort(), ['blocks', 'meta.json', 'prompts']);
    assert.deepEqual(readJson(path.join(runDir(arm), 'meta.json')), { config: CONFIGS.low });
  }
  assert.deepEqual(
    namesCommand(ws).map((entry) => entry.name),
    [
      'Code7S1LowR1SelfReview',
      'Code7S3LowR1SelfReviewCorrectness',
      'Code7S3LowR1SelfReviewSpecAndTests',
      'Code7S3LowR1SelfReviewTextAndSafety',
    ],
  );
});

// The agent text names the agent file in backticks, so the path of the project folder can have a space.
for (const folder of ['project', 'review project']) {
  test(`transcripts lets a self-review agent in "${folder}" read its own agent file and no other agent file`, (t) => {
    const { root, agentDir } = selfReviewAgents(t, folder);
    const ws = path.join(root, 'ws');
    const sessions = path.join(root, 'sessions');
    const caseDir = path.join(ws, 'code-7');
    const run = path.join(caseDir, 'S1-low', 'run-1');
    put(ws, 'code-7/case.json', { id: 'code-7', kind: 'code', split: 'dev' });
    put(caseDir, 'full.diff', '');
    put(run, 'prompts/self-review.txt', 'agent: review-bench-selfreview-low\n\nReview.\n');
    put(run, 'meta.json', { config: CONFIGS.low });
    const own = path.join(agentDir, 'review-bench-selfreview-low.md');
    const other = path.join(agentDir, 'review-bench-selfreview-high.md');
    const reviewer = path.join(agentDir, 'review-bench-candidate-code-low.md');
    const calls = [
      ['read', { path: own }],
      ['read', { path: `${own}:1-40` }],
      ['read', { path: 'skill://code-review' }],
      ['read', { path: 'skill://code-clarity/references/naming.md' }],
      ['read', { path: path.join(run, 'prompts', 'self-review.txt') }],
      ['read', { path: other }],
      ['read', { path: reviewer }],
    ];
    // The system prompt of the transcript holds the text of the self-review agent.
    const transcript = toolTranscript(caseDir, 30, calls, 'review-bench-selfreview-low')
      .split('\n')
      .map((line) => {
        const entry = JSON.parse(line);
        if (entry.type === 'session_init') entry.systemPrompt = ['You are a coding assistant.', readText(own)];
        return JSON.stringify(entry);
      })
      .join('\n');
    put(sessions, 'Code7S1LowR1SelfReview.jsonl', transcript);
    assert.deepEqual(transcriptsCommand(ws, sessions), ['Code7S1LowR1SelfReview']);
    assert.deepEqual(readJson(path.join(run, 'meta.json')).reviewers['self-review'].readScope, {
      outside: [other, reviewer],
    });
    // Without the agent file in the scope, the read of the own agent file is outside.
    assert.deepEqual(score.readScope(reads(own), { runDir: run, cwd: LIVE }), { outside: [own] });
  });
}

// Changed export:
// - readScope puts these reads outside for every reviewer: a `skill://code-reviewer` or `skill://plan-reviewer` URI,
//   with or without a path, and a path under the code-reviewer or plan-reviewer skill folder of a plugin cache copy.
//   They resolve to the installed release, which can be another version than the arm. The own skill folder of a
//   reviewer under its plugin root stays allowed. A `skill://` URI that leaves the code-review or code-clarity folder
//   with `..` for another skill is outside too.
// - For a reviewer with `agentFiles` (the self-review agent), a `skill://` URI of code-review or code-clarity and a
//   path under these skill folders of a plugin cache copy are its own instructions. They stay allowed also when the
//   case changes them.

test('readScope puts the installed reviewer skills outside and exempts the own skills of the self-review agent', () => {
  const lifecycleCache = '/home/user/.omp/plugins/cache/plugins/docks___plan-lifecycle___0.17.1/skills';
  const docksCache = '/home/user/.omp/plugins/cache/plugins/docks___docks___0.21.0/skills';
  const installed = [
    'skill://code-reviewer',
    'skill://code-reviewer/references/correctness.md',
    'skill://plan-reviewer/SKILL.md',
    'skill://code-review/../code-reviewer/SKILL.md',
    `${lifecycleCache}/productivity/code-reviewer/SKILL.md`,
    `${lifecycleCache}/productivity/plan-reviewer/references/checklist.md`,
    `${lifecycleCache}/productivity/code-reviewer/references/*.md`,
  ];
  // Through these targets, a baseline reviewer reads the instructions of the installed release. Its own skill folder
  // under its plugin root stays allowed.
  const baseline = { runDir: `${SCOPE_CASE}/B0-low/run-1`, cwd: LIVE, pluginRoots: [BASELINE_PLUGIN] };
  const baselineSkill = `${BASELINE_PLUGIN}/skills/productivity/code-reviewer/SKILL.md`;
  assert.deepEqual(score.readScope(reads(...installed, baselineSkill), baseline), { outside: installed });
  const candidate = { runDir: `${SCOPE_CASE}/C1-low/run-1`, cwd: LIVE, pluginRoots: [LIVE_PLUGIN] };
  assert.deepEqual(score.readScope(reads(...installed), candidate), { outside: installed });

  // A case that changes the code-clarity skill.
  const changedFiles = ['plugins/docks/skills/engineering/code-clarity/SKILL.md'];
  const clarity = [
    'skill://code-clarity',
    `${docksCache}/engineering/code-clarity/SKILL.md`,
    `${docksCache}/engineering/code-clarity/*.md`,
  ];
  const selfReview = {
    runDir: `${SCOPE_CASE}/S1-low/run-1`,
    cwd: LIVE,
    agentFiles: ['/work/project/.omp/agents/review-bench-selfreview-low.md'],
    changedFiles,
  };
  // The self-review agent loads code-clarity as its own instructions, so the case-change rule does not apply.
  assert.deepEqual(score.readScope(reads(...clarity), selfReview), { outside: [] });
  // For a code reviewer, these reads are optional instruction reads, and the case changes their file.
  assert.deepEqual(score.readScope(reads(...clarity), { ...candidate, changedFiles }), { outside: clarity });
  // The installed reviewer skills and the copy of code-clarity in the live checkout stay outside for the self-review
  // agent.
  const liveClarity = `${LIVE}/plugins/docks/skills/engineering/code-clarity/SKILL.md`;
  assert.deepEqual(score.readScope(reads(...installed, liveClarity), selfReview), {
    outside: [...installed, liveClarity],
  });
});

// Plan #100 code review round 1: with --loop, the arm gives the side of the agent and the round policy of the loop.
// - C3 and B1: `panel-delta`, the rules of plan-lifecycle 0.17.1. A B1 panel prompt holds the lens text.
// - C1: `full-delta`, the same rules with a `full` round where they give a `panel` round.
// - B0: `full`, the policy of plan-lifecycle 0.16.0: every round is a `full` round.
// `case --loop` writes `{ policy }` to the meta.json of each run, and `loop` follows the policy that this meta.json
// records. It refuses a run whose meta.json records no policy or an unknown policy.

test('the round policy limits the modes that the rules of plan-contract.md give', () => {
  const repaired = { round: 2, completed: true, repairsOnly: true, fullLines: 120, deltaLines: 2 };
  const pulledIn = { ...repaired, repairsOnly: false };
  assert.equal(prepare.roundMode({ policy: 'panel-delta', round: 1, fullLines: 50 }), 'panel');
  assert.equal(prepare.roundMode({ policy: 'panel-delta', ...repaired }), 'delta');
  assert.equal(prepare.roundMode({ policy: 'panel-delta', ...pulledIn }), 'panel');
  // One full reviewer: a full round where panel-delta gives a panel round, and the same delta rounds.
  assert.equal(prepare.roundMode({ policy: 'full-delta', round: 1, fullLines: 50 }), 'full');
  assert.equal(prepare.roundMode({ policy: 'full-delta', ...repaired }), 'delta');
  assert.equal(prepare.roundMode({ policy: 'full-delta', ...pulledIn }), 'full');
  // No panel round and no delta round.
  assert.equal(prepare.roundMode({ policy: 'full', round: 1, fullLines: 50 }), 'full');
  assert.equal(prepare.roundMode({ policy: 'full', ...repaired }), 'full');
  assert.equal(prepare.roundMode({ policy: 'full', ...pulledIn }), 'full');
});

const POLICY_ARMS = { B0: 'full', B1: 'panel-delta', B3: 'panel-delta', C1: 'full-delta', C3: 'panel-delta' };
const POLICY_FIXER = { model: MODEL, effort: 'high', tier: 'priority' };

// The block of a round-1 reviewer of a policy loop: the full reviewer and the correctness lens find the known defect
// D1, and the other lenses pass.
function policyBlock(reviewer) {
  const heading = reviewer === 'full' ? '### Code review round 1' : `### Code review round 1, lens ${reviewer}`;
  const finds = reviewer === 'full' || reviewer === 'correctness';
  const standards = finds ? '- [HIGH] Bug - src/sync.mjs:5 - v5 is 0 instead of 5 - set it to 5.' : 'None.';
  const verdict = finds ? 'fixes-required' : 'pass';
  return `${heading}\n\nCode-review: ${verdict}\n\n## Standards\n\n${standards}\n\n## Spec\n\nNone.\n`;
}

// A prompt file: line 1 names the agent, line 2 is empty, and the prompt follows.
function promptFileParts(file) {
  const [agent, empty, ...rest] = readText(file).split('\n');
  assert.equal(empty, '');
  return { agent, body: rest.join('\n') };
}

// `case --loop` with the arms B0, B1, C1, and C3 at configuration `low`, one run each, for dev case code-7. The case
// head adds src/sync.mjs with `count` lines, so the full diff changes `count` lines. Line 5 carries the known defect
// D1, and its fix patch changes that line only.
function policyLoops(t, count) {
  isolateGit(t);
  const root = neutralScratch(t);
  const repo = path.join(root, 'repo');
  fs.mkdirSync(repo);
  gitIn(repo, 'init', '-q', '-b', 'main');
  put(repo, 'README.md', '# Demo\n');
  gitIn(repo, 'add', '-A');
  gitIn(repo, 'commit', '-q', '-m', 'base');
  const base = gitIn(repo, 'rev-parse', 'HEAD').trim();
  const sync = (values) => Array.from({ length: count }, (_, index) => syncLine(values, index + 1)).join('');
  put(repo, 'src/sync.mjs', sync({ 5: 0 }));
  gitIn(repo, 'add', '-A');
  gitIn(repo, 'commit', '-q', '-m', 'head');
  const head = gitIn(repo, 'rev-parse', 'HEAD').trim();
  const ws = path.join(root, 'ws');
  const cases = path.join(root, 'cases');
  const project = path.join(root, 'project');
  put(project, '.omp/agents/review-bench-configs.json', { configs: [CONFIGS.low], fixer: POLICY_FIXER });
  const seeded = { category: 'bug', source: 'seeded' };
  const caseData = {
    id: 'code-7',
    kind: 'code',
    split: 'dev',
    issue: 7,
    round: 1,
    plan: 'code-7-plan.md',
    base,
    head,
    known: [{ id: 'D1', locator: 'src/sync.mjs:5', ...seeded, summary: 'v5 is 0.', fix: 'code-7.D1.fix.patch' }],
  };
  put(cases, 'dev/code-7.json', caseData);
  put(cases, 'dev/code-7-plan.md', '# Plan 7\n');
  put(cases, 'dev/code-7.D1.fix.patch', filePatch(repo, 'src/sync.mjs', sync({ 5: 0 }), sync({})));
  const options = {
    case: path.join(cases, 'dev', 'code-7.json'),
    arms: Object.keys(POLICY_ARMS).join(','),
    runs: '1',
    out: ws,
    configs: 'low',
    project,
    loop: true,
  };
  // Two arms of one side run different loops, so one workspace holds all four arms.
  prepare.prepareCase(options, repo);
  const caseDir = path.join(ws, 'code-7');
  const run = (arm) => path.join(caseDir, `${arm}-low`, 'run-1');
  return { repo, ws, cases, caseData, caseDir, run };
}

// The round modes of each arm: round 1 from `case --loop`, round 2 from `loop` after the fix of D1 in one line.
for (const [count, modes] of [
  [
    49,
    {
      B0: ['full', 'full'],
      B1: ['full', 'delta'],
      B3: ['full', 'delta'],
      C1: ['full', 'delta'],
      C3: ['full', 'delta'],
    },
  ],
  [
    50,
    {
      B0: ['full', 'full'],
      B1: ['panel', 'delta'],
      B3: ['panel', 'delta'],
      C1: ['full', 'delta'],
      C3: ['panel', 'delta'],
    },
  ],
]) {
  test(`case --loop and loop give each arm the rounds of its policy on a diff of ${count} lines`, (t) => {
    const { repo, ws, cases, caseData, caseDir, run } = policyLoops(t, count);
    const paths = prepare.workspacePaths(caseDir, caseData);
    const agentOf = (arm) => `agent: review-bench-${arm.startsWith('B') ? 'baseline' : 'candidate'}-code-low`;
    const reviewersOf = (mode) => (mode === 'panel' ? prepare.LENSES : [mode]);
    const promptFile = (arm, round, reviewer) => path.join(run(arm), `round-${round}`, 'prompts', `${reviewer}.txt`);

    for (const [arm, policy] of Object.entries(POLICY_ARMS)) {
      const mode = modes[arm][0];
      assert.deepEqual(readJson(path.join(run(arm), 'meta.json')), { policy });
      const meta = readJson(path.join(run(arm), 'round-1', 'meta.json'));
      assert.deepEqual([meta.config, meta.mode, meta.fullLines], [CONFIGS.low, mode, count]);
      assert.deepEqual(
        fs.readdirSync(path.join(run(arm), 'round-1', 'prompts')).sort(),
        reviewersOf(mode).map((reviewer) => `${reviewer}.txt`),
      );
      for (const reviewer of reviewersOf(mode)) {
        const file = promptFile(arm, 1, reviewer);
        assert.equal(readText(file), prepare.buildPromptFile({ caseData, arm, config: 'low', reviewer, paths, mode }));
        const { agent, body } = promptFileParts(file);
        assert.equal(agent, agentOf(arm));
        assert.ok(body.split('\n').includes(`Round mode: ${mode}.`), `${arm} ${reviewer} names another mode`);
      }
    }
    if (modes.C3[0] === 'panel') {
      // The panel prompts of B1 and C3 differ only in the lens text, which the B1 dispatch holds.
      for (const lens of prepare.LENSES) {
        const [b1, c3] = ['B1', 'C3'].map((arm) => promptFileParts(promptFile(arm, 1, lens)).body.split('\n'));
        assert.deepEqual(
          b1.filter((line) => c3.includes(line)),
          c3,
          `the B1 ${lens} prompt changes a line of the C3 prompt`,
        );
        const lensText = b1.filter((line) => !c3.includes(line));
        assert.ok(
          lensText.some((line) => line.startsWith('Your lens covers')),
          `the B1 ${lens} prompt has no scope`,
        );
        assert.ok(lensText.includes(`Use the heading \`### Code review round 1, lens ${lens}\`.`));
        assert.ok(c3.includes(`Lens: ${lens}`));
      }
    } else {
      // Below the panel threshold, B1 gets the full prompt of C3.
      const [b1, c3] = ['B1', 'C3'].map((arm) => promptFileParts(promptFile(arm, 1, 'full')).body);
      assert.equal(b1, c3);
    }

    const answers = [];
    for (const arm of Object.keys(POLICY_ARMS)) {
      const reviewers = reviewersOf(modes[arm][0]);
      for (const reviewer of reviewers) put(run(arm), `round-1/blocks/${reviewer}.md`, policyBlock(reviewer));
      const finder = reviewers.includes('correctness') ? 'correctness' : 'full';
      answers.push([`code-7/${arm}-low/run-1/round-1/${finder}#1`, 'D1']);
    }
    findingsCommand(ws);
    judgeLoop(ws, answers);
    for (const arm of Object.keys(POLICY_ARMS)) {
      const mode = modes[arm][1];
      const next = path.join(run(arm), 'round-2');
      assert.equal(prepare.prepareLoop({ run: run(arm), cases }, repo), next);
      // The fix of D1 changes one line, so the delta diff of 2 lines is at most half the full diff.
      const meta = readJson(path.join(next, 'meta.json'));
      assert.deepEqual([meta.mode, meta.fullLines, meta.deltaLines], [mode, count, 2]);
      assert.deepEqual(fs.readdirSync(path.join(next, 'prompts')), [`${mode}.txt`]);
      const { agent, body } = promptFileParts(promptFile(arm, 2, mode));
      assert.equal(agent, agentOf(arm));
      assert.ok(body.split('\n').includes(`Round mode: ${mode}.`), `${arm} round 2 names another mode`);
    }
    // B0 reviews the full diff of round 2 again and gets no delta diff.
    const b0 = promptFileParts(promptFile('B0', 2, 'full')).body.split('\n');
    assert.ok(b0.includes(`Full diff: ${path.join(run('B0'), 'round-2', 'full.diff')}`));
    assert.equal(
      b0.some((line) => line.startsWith('Delta diff:')),
      false,
    );
    // The B1 delta prompt is the C3 delta prompt with the files of its own round folder.
    const [b1, c3] = ['B1', 'C3'].map((arm) => promptFileParts(promptFile(arm, 2, 'delta')).body);
    assert.equal(b1.replaceAll(run('B1'), run('C3')), c3);
    // B3 has the C3 prompt in every round, with the files of its own run folder (#113).
    for (const [round, reviewer] of [...reviewersOf(modes.C3[0]).map((name) => [1, name]), [2, 'delta']]) {
      const [b3, candidate] = ['B3', 'C3'].map((arm) => promptFileParts(promptFile(arm, round, reviewer)).body);
      assert.equal(b3.replaceAll(run('B3'), run('C3')), candidate, `the B3 round ${round} ${reviewer} prompt`);
    }
  });
}

test('loop follows the round policy that the run meta.json records and refuses a run without a known policy', (t) => {
  const { repo, ws, cases, run, round, fixerPatch } = devLoop(t);
  const options = { run, cases, 'fixer-patch': fixerPatch };
  const policies = 'panel-delta, full-delta, full';
  // A loop that case built before the arms had round policies has no meta.json in its run folder.
  fs.rmSync(path.join(run, 'meta.json'));
  assert.throws(
    () => prepare.prepareLoop(options, repo),
    new RegExp(
      `code-7/C1-low/run-1/meta\\.json records no round policy; build the loop again with case --loop, or record the policy that its rounds followed as \\{ "policy": "<policy>" \\}, with <policy> one of ${policies}$`,
    ),
  );
  put(run, 'meta.json', {});
  assert.throws(() => prepare.prepareLoop(options, repo), /run-1\/meta\.json records no round policy; /);
  put(run, 'meta.json', { policy: 'panel' });
  assert.throws(
    () => prepare.prepareLoop(options, repo),
    new RegExp(
      `code-7/C1-low/run-1/meta\\.json records the unknown round policy "panel"; the round policies are ${policies}$`,
    ),
  );
  assert.equal(fs.existsSync(round(2)), false);
  // Such a C1 loop ran the rules of panel-delta. With that policy recorded, it continues under these rules: the full
  // diff of 16 lines is below the panel size, and the repairs of round 1 change 4 lines, so round 2 is a delta round.
  put(run, 'meta.json', { policy: 'panel-delta' });
  assert.equal(prepare.prepareLoop(options, repo), round(2));
  assert.equal(readJson(path.join(round(2), 'meta.json')).mode, 'delta');
  // The recorded policy, not the arm, gives the mode: under `full`, round 2 of this C1 loop is a full round.
  fs.rmSync(round(2), { recursive: true });
  put(run, 'meta.json', { policy: 'full' });
  assert.equal(prepare.prepareLoop(options, repo), round(2));
  assert.equal(readJson(path.join(round(2), 'meta.json')).mode, 'full');
  assert.deepEqual(fs.readdirSync(path.join(round(2), 'prompts')), ['full.txt']);
  // A self-review arm runs no loop.
  assert.throws(
    () => prepare.prepareLoop({ run: path.join(ws, 'code-7', 'S1-low', 'run-1'), cases }, repo),
    /loop takes the runs of the code arms B0, B1, B3, C1, C3; code-7 is a code case and S1 is its arm/,
  );
});

// Plan #100, code review round 1: the loop control. A round that did not complete, a missing judgments.json, a
// candidate pair without an answer, a known defect that a later repair brings back, and the cause of a round.

const lensBlock = (lens, verdict) => `### Code review round 1, lens ${lens}\n\nCode-review: ${verdict}\n\nNone.\n`;
// A code block of round `round` with one finding at v5 of src/sync.mjs, the line of the known defect D1.
const v5Block = (round, value) => `### Code review round ${round}

Code-review: fixes-required

## Standards

- [HIGH] Bug - src/sync.mjs:5 - v5 is ${value} instead of 5 - set it to 5.

## Spec

None.
`;
// The one reviewer of a round folder that `loop` wrote.
function onlyReviewer(roundDir) {
  const names = fs.readdirSync(path.join(roundDir, 'prompts'));
  assert.equal(names.length, 1, `${roundDir} has more than one prompt`);
  return names[0].replace(/\.txt$/, '');
}

test('loop refuses a round that did not complete and names each reviewer to dispatch again', (t) => {
  const { repo, ws, cases, run, round, round1Meta } = devLoop(t);
  // Round 1 is a panel: correctness returned no block, spec-and-tests returned a block without a verdict line, and
  // text-and-safety returned `blocked`. No block has a finding, so the fix plan is empty.
  fs.rmSync(path.join(round(1), 'prompts'), { recursive: true });
  fs.rmSync(path.join(round(1), 'blocks'), { recursive: true });
  for (const lens of ['correctness', 'spec-and-tests', 'text-and-safety']) {
    put(round(1), `prompts/${lens}.txt`, 'agent: review-bench-candidate-code-low\n\nReview.\n');
  }
  put(round(1), 'blocks/spec-and-tests.md', NO_VERDICT_BLOCK);
  put(round(1), 'blocks/text-and-safety.md', lensBlock('text-and-safety', 'blocked'));
  findingsCommand(ws);
  const refusal = (reviewers) =>
    new RegExp(
      `${escapeRegExp(`${LOOP_R1.replace('/full', '')} did not complete; dispatch these reviewers again, save their blocks, and run score.mjs findings again: ${reviewers}`)}$`,
    );
  assert.throws(
    () => prepare.prepareLoop({ run, cases }, repo),
    refusal('correctness (no block), spec-and-tests (no verdict line), text-and-safety (blocked)'),
  );
  assert.equal(fs.existsSync(round(2)), false);
  assert.deepEqual(readJson(path.join(round(1), 'meta.json')), round1Meta);
  // The correctness block came back; the other two reviewers still need a dispatch.
  put(round(1), 'blocks/correctness.md', lensBlock('correctness', 'pass'));
  findingsCommand(ws);
  assert.throws(
    () => prepare.prepareLoop({ run, cases }, repo),
    refusal('spec-and-tests (no verdict line), text-and-safety (blocked)'),
  );
  // Each reviewer returned a verdict and no finding: the round completed, and the loop ends.
  put(round(1), 'blocks/spec-and-tests.md', lensBlock('spec-and-tests', 'pass'));
  put(round(1), 'blocks/text-and-safety.md', lensBlock('text-and-safety', 'pass'));
  findingsCommand(ws);
  assert.equal(prepare.prepareLoop({ run, cases }, repo), null);
  assert.equal(fs.existsSync(round(2)), false);
});

test('loop and report read a missing judgments.json as no answers and stop when a finding needs one', (t) => {
  const { repo, ws, cases, run, round } = devLoop(t);
  // Round 1 passed without findings, so the operator skipped the judge.
  put(round(1), 'blocks/full.md', LOOP_PASS_3.replace('round 3', 'round 1'));
  findingsCommand(ws);
  fs.rmSync(path.join(ws, 'judgments.json'));
  assert.equal(prepare.prepareLoop({ run, cases }, repo), null);
  pairsCommand(ws, cases);
  assert.equal(reportCommand(ws).runs.length, 1);
  assert.ok(fs.existsSync(path.join(ws, 'report.md')));
  // With findings and no judgments.json, both stop on the candidate pairs of finding #3 (src/sync.mjs:5), which
  // shares its file with D1 and D2.
  put(round(1), 'blocks/full.md', LOOP_ROUND_1);
  findingsCommand(ws);
  pairsCommand(ws, cases);
  const blind = blindId(`${LOOP_R1}#3`);
  const unanswered = new RegExp(
    `judgments\\.json has no match answer for 2 candidate pairs of pairs\\.json: ${blind} and D1, ${blind} and D2$`,
  );
  assert.throws(() => prepare.prepareLoop({ run, cases }, repo), unanswered);
  assert.throws(() => reportCommand(ws), unanswered);
  assert.equal(fs.existsSync(round(2)), false);
});

test('the fix step stops when the judge answered one candidate pair of a finding and left out another', (t) => {
  // The finding names the files of D1 and D2, and the judge answered only its pair with D1.
  const partial = judgedRound(1, [{ matches: { D1: 'match' } }]);
  partial.findings[0].files.push({ file: fixFile('D2'), start: 1, end: 1 });
  const [{ blind }] = partial.findings;
  assert.throws(
    () => score.fixPlan({ ...partial, known: FIX_KNOWN }),
    new RegExp(`no match answer for 1 candidate pairs of pairs\\.json: ${blind} and D2$`),
  );
  // In a loop, the same gap stops loop before it applies a repair or writes the fixer folder.
  const { repo, ws, cases, run, round, round1Meta } = devLoop(t);
  const judgments = readJson(path.join(ws, 'judgments.json'));
  const finding3 = blindId(`${LOOP_R1}#3`);
  judgments.matches = judgments.matches.filter((entry) => !(entry.finding === finding3 && entry.known === 'D2'));
  put(ws, 'judgments.json', judgments);
  assert.throws(
    () => prepare.prepareLoop({ run, cases }, repo),
    new RegExp(`no match answer for 1 candidate pairs of pairs\\.json: ${finding3} and D2$`),
  );
  assert.equal(fs.existsSync(path.join(round(1), 'fixer')), false);
  assert.equal(fs.existsSync(round(2)), false);
  assert.deepEqual(readJson(path.join(round(1), 'meta.json')), round1Meta);
});

test('the fix plan keeps a matched defect that an earlier round fixed, after the fix that it needs', () => {
  // A later repair brought back D3 and D2, whose fixes round 1 applied; round 3 finds both again. D2 needs D3.
  const again = judgedRound(3, [{ matches: { D2: 'match' } }, { matches: { D3: 'match' } }]);
  assert.deepEqual(score.fixPlan({ ...again, known: FIX_KNOWN, applied: ['D3', 'D2'] }).fixes, [
    { known: 'D3', patch: 'code-7.D3.fix.patch' },
    { known: 'D2', patch: 'code-7.D2.fix.patch' },
  ]);
});

test('loop repairs a defect again when a later repair brings it back, and ends when the tree holds its fix', (t) => {
  const { root, repo, ws, cases, run, round, round1Answers } = devLoop(t);
  // The fixer of round 1 repairs the valid extra and also sets v5 back to 0, after the fix patch of D1 set it to 5.
  const fixer = path.join(root, 'reverting-fixer.patch');
  const extraFix = filePatch(repo, 'src/extra.mjs', EXTRA_HEAD, EXTRA_FIXED);
  fs.writeFileSync(fixer, filePatch(repo, 'src/sync.mjs', SYNC_D1, SYNC_HEAD) + extraFix);
  assert.equal(prepare.prepareLoop({ run, cases, 'fixer-patch': fixer }, repo), round(2));
  assert.equal(readText(path.join(round(2), 'snapshot', 'src', 'sync.mjs')), SYNC_HEAD);
  // Round 2 finds D1 again. The tree does not hold its fix, so the fix patch applies again.
  const r2 = onlyReviewer(round(2));
  put(round(2), `blocks/${r2}.md`, v5Block(2, 0));
  findingsCommand(ws);
  const answers = [...round1Answers, [`code-7/C1-low/run-1/round-2/${r2}#1`, 'D1']];
  judgeLoop(ws, answers);
  const round2Meta = readJson(path.join(round(2), 'meta.json'));
  assert.equal(prepare.prepareLoop({ run, cases }, repo), round(3));
  assert.deepEqual(readJson(path.join(round(2), 'meta.json')), {
    ...round2Meta,
    fix: { fixes: [{ known: 'D1', patch: 'code-7.D1.fix.patch' }], extras: [], rejections: [] },
  });
  const meta = readJson(path.join(round(3), 'meta.json'));
  assert.equal(gitIn(repo, 'show', `${meta.head}:src/sync.mjs`), SYNC_D1);
  // Round 3 reports v5 again, and the judge matches D1. The tree holds its fix, so no finding stands: the loop ends.
  const r3 = onlyReviewer(round(3));
  put(round(3), `blocks/${r3}.md`, v5Block(3, 0));
  findingsCommand(ws);
  judgeLoop(ws, [...answers, [`code-7/C1-low/run-1/round-3/${r3}#1`, 'D1']]);
  assert.equal(prepare.prepareLoop({ run, cases }, repo), null);
  assert.equal(fs.existsSync(round(4)), false);
  assert.deepEqual(readJson(path.join(round(3), 'meta.json')), meta);
});

test('loop gives a defect that a later repair changed to the fixer, and ends when its fix repairs nothing', (t) => {
  const { root, repo, ws, cases, run, round, round1Answers } = devLoop(t);
  // The fixer of round 1 sets v5 to 50, so the fix patch of D1 applies neither forward nor in reverse.
  const fixer = path.join(root, 'changing-fixer.patch');
  const changed = syncFile({ 5: 50, 7: 0 });
  const extraFix = filePatch(repo, 'src/extra.mjs', EXTRA_HEAD, EXTRA_FIXED);
  fs.writeFileSync(fixer, filePatch(repo, 'src/sync.mjs', SYNC_D1, changed) + extraFix);
  assert.equal(prepare.prepareLoop({ run, cases, 'fixer-patch': fixer }, repo), round(2));
  const r2 = onlyReviewer(round(2));
  const finding = `code-7/C1-low/run-1/round-2/${r2}#1`;
  put(round(2), `blocks/${r2}.md`, v5Block(2, 50));
  findingsCommand(ws);
  judgeLoop(ws, [...round1Answers, [finding, 'D1']]);
  assert.throws(
    () => prepare.prepareLoop({ run, cases }, repo),
    new RegExp(
      `round-2 has 1 known defects whose fix patches do not apply, for the fixer: D1 \\(found by ${escapeRegExp(finding)}\\); give their repair with --fixer-patch`,
    ),
  );
  const fixerDir = path.join(round(2), 'fixer');
  assert.equal(readText(path.join(fixerDir, 'snapshot', 'src', 'sync.mjs')), changed);
  const prompt = readText(path.join(fixerDir, 'fixer-1.txt')).split('\n');
  assert.deepEqual(
    prompt.filter((line) => line.startsWith('Finding ')),
    [`Finding ${finding}: - [HIGH] Bug - src/sync.mjs:5 - v5 is 50 instead of 5 - set it to 5.`],
  );
  // The fixer finds the finding not present and writes an empty patch, so the fix step repairs no finding. Production
  // rejects a finding that does not reproduce: the loop ends after round 2, and round 2 records the fix step.
  const round2Meta = readJson(path.join(round(2), 'meta.json'));
  fs.writeFileSync(path.join(fixerDir, 'fixer-1.patch'), '');
  assert.equal(prepare.prepareLoop({ run, cases }, repo), null);
  assert.equal(fs.existsSync(round(3)), false);
  assert.deepEqual(readJson(path.join(round(2), 'meta.json')), {
    ...round2Meta,
    fix: { fixes: [{ known: 'D1', patch: 'code-7.D1.fix.patch' }], extras: [], rejections: [] },
    fixedByFixer: ['D1'],
    fixerChangedNothing: true,
    fixRepairedNothing: true,
  });
});

test('loop ends when the fixer patch changed nothing and only a pulled-in fix patch changed the tree', (t) => {
  const { repo, ws, cases, run, round } = devLoop(t);
  // The fix patch of D2 needs v9 to be 90, so it applies to the case head neither forward nor in reverse. It needs the
  // fix of D1 first (fix_after), and that patch applies.
  const d2Patch = filePatch(repo, 'src/sync.mjs', syncFile({ 7: 0, 9: 90 }), syncFile({ 9: 90 }));
  fs.writeFileSync(path.join(cases, 'dev', 'code-7.D2.fix.patch'), d2Patch);
  // Round 1 has a valid extra (#1) and a finding of D2 (#2).
  const block = [
    '### Code review round 1',
    '',
    'Code-review: fixes-required',
    '',
    '## Standards',
    '',
    '- [MEDIUM] Bug - src/extra.mjs:2 - b is 0, and the callers divide by it - set it to 2.',
    '- [HIGH] Bug - src/sync.mjs:7 - v7 is 0 instead of 7 - set it to 7.',
    '',
    '## Spec',
    '',
    'None.',
    '',
  ].join('\n');
  put(run, 'round-1/blocks/full.md', block);
  findingsCommand(ws);
  const [extra, d2] = [`${LOOP_R1}#1`, `${LOOP_R1}#2`];
  judgeLoop(ws, [
    [extra, 'valid'],
    [d2, 'D2'],
  ]);
  assert.throws(
    () => prepare.prepareLoop({ run, cases }, repo),
    new RegExp(
      `round-1 has 1 valid extra findings for the fixer: ${escapeRegExp(extra)} and 1 known defects whose fix patches do not apply, for the fixer: D2 \\(found by ${escapeRegExp(d2)}\\); give their repair with --fixer-patch`,
    ),
  );
  // The fixer finds both findings not present and writes an empty patch. The pulled-in fix of D1 changed the tree, but
  // a pulled-in patch repairs no finding of round 1. So the fix step repaired no finding, and the loop ends after
  // round 1.
  const round1Meta = readJson(path.join(round(1), 'meta.json'));
  fs.writeFileSync(path.join(round(1), 'fixer', 'fixer-1.patch'), '');
  assert.equal(prepare.prepareLoop({ run, cases }, repo), null);
  assert.equal(fs.existsSync(round(2)), false);
  assert.deepEqual(readJson(path.join(round(1), 'meta.json')), {
    ...round1Meta,
    fix: {
      fixes: [
        { known: 'D1', patch: 'code-7.D1.fix.patch', pulled: true },
        { known: 'D2', patch: 'code-7.D2.fix.patch' },
      ],
      extras: [extra],
      rejections: [],
    },
    fixedByFixer: ['D2'],
    fixerChangedNothing: true,
    fixRepairedNothing: true,
  });
});

test('extra-only rounds count the rounds whose previous fix step repaired valid extras and no known defect', () => {
  const round = (seconds, tokens, mode, fixer, answers) => [seconds, tokens, mode, fixer, answers];
  const fixture = gridFixture({ 'code-7': { split: 'dev', known: ['D1', 'D2'] } }, [
    {
      case: 'code-7',
      config: 'low',
      rounds: [
        round(100, 1000, 'full', 30, ['D2']),
        round(40, 400, 'delta', 20, ['D1', 'valid']),
        round(20, 200, 'delta', 0, []),
      ],
    },
    {
      case: 'code-7',
      config: 'low-fast',
      rounds: [round(50, 500, 'full', 10, ['D1', 'valid']), round(20, 200, 'delta', 0, [])],
    },
    {
      case: 'code-7',
      config: 'high',
      rounds: [round(50, 500, 'full', 10, ['D1', 'valid']), round(20, 200, 'delta', 0, [])],
    },
    {
      case: 'code-7',
      config: 'high',
      run: 2,
      rounds: [round(50, 500, 'full', 10, ['valid']), round(20, 200, 'delta', 0, [])],
    },
    {
      case: 'code-7',
      config: 'xhigh-fast',
      rounds: [round(50, 500, 'full', 10, ['D2', 'valid']), round(20, 200, 'delta', 0, [])],
    },
  ]);
  // low: the fix patch of D2 needs the fix of D1, so the fix step after round 1 pulled D1 in. Round 2 reports D1 for
  // the first time, but the tree already holds its fix: only the valid extra of round 2 caused round 3.
  const low = (r) => fixture.metas[`code-7/C1-low/run-1/round-${r}`];
  low(1).fix.fixes.unshift({ known: 'D1', patch: 'code-7.D1.fix.patch', pulled: true });
  low(2).fixAlreadyApplied = ['D1'];
  // low-fast: the fix patch of D1 did not apply, so the fixer repaired D1 with the valid extra. D1 caused round 2.
  fixture.metas['code-7/C1-low-fast/run-1/round-1'].fixedByFixer = ['D1'];
  // high: the fix patch of D1 did not apply, and the fixer replied `not present` for the finding of D1. It repaired
  // only the valid extra, so only the valid extra caused round 2.
  const high = fixture.metas['code-7/C1-high/run-1/round-1'];
  high.fixedByFixer = ['D1'];
  high.fixer.replies = {
    'code-7/C1-high/run-1/round-1/full#1': 'not present',
    'code-7/C1-high/run-1/round-1/full#2': 'repaired',
  };
  // high, run 2: the fixer replied `not present` for the only valid extra, so it repaired nothing, and the valid extra
  // caused no round.
  fixture.metas['code-7/C1-high/run-2/round-1'].fixer.replies = {
    'code-7/C1-high/run-2/round-1/full#1': 'not present',
  };
  // xhigh-fast: the fix patch of D2 did not apply, and the fix step pulled in the fix of D1, which changed the tree.
  // The fixer patch changed nothing, so the fixer repaired neither D2 nor the valid extra, and no finding caused
  // round 2. (`loop` now ends after such a fix step, see the test above; the score reads the record as it is.)
  const xhigh = fixture.metas['code-7/C1-xhigh-fast/run-1/round-1'];
  xhigh.fix.fixes.unshift({ known: 'D1', patch: 'code-7.D1.fix.patch', pulled: true });
  xhigh.fixedByFixer = ['D2'];
  xhigh.fixerChangedNothing = true;
  const scores = scoreRuns(fixture);
  assert.deepEqual(
    scores.runs.map((run) => [run.arm, run.run, run.extraOnlyRounds]),
    [
      ['C1-high', 'run-1', 1],
      ['C1-high', 'run-2', 0],
      ['C1-low', 'run-1', 1],
      ['C1-low-fast', 'run-1', 0],
      ['C1-xhigh-fast', 'run-1', 0],
    ],
  );
  const configs = ['low', 'low-fast', 'high', 'xhigh-fast'];
  const table = tableAfter(renderReport(scores, { configs }), '### Code loops: dev');
  assert.ok(table.includes('| Extra-only rounds per run | 1.00 | 0.00 | 0.50 | 0.00 |'));
});

// The meta.json reviewer entry of a transcript, as `score.mjs transcripts` writes it for the configured model `model`.
const transcriptEntry = (text, model = MODEL) => ({
  ...parseTranscript(text, 'reviewer.jsonl', model),
  ...score.transcriptFacts(text, 'reviewer.jsonl'),
});

test('each assistant message keeps the effort that was active at it, so a review at another effort is invalid', () => {
  const config = CONFIGS['xhigh-fast'];
  const effort = (second, thinkingLevel) => ({
    type: 'thinking_level_change',
    timestamp: isoAt(second),
    thinkingLevel,
  });
  const head = [
    effort(0, 'high'),
    { type: 'service_tier_change', timestamp: isoAt(0), serviceTier: { openai: 'priority' } },
    { type: 'message', timestamp: isoAt(1), message: { role: 'user' } },
  ];
  const reply = (second) => assistantLine(second, 'openai-codex', 'gpt-6.1-sol', 'priority', { input: 10 });
  // The reviewer reviews at low and switches to the configured xhigh before its last message.
  const switched = jsonl([...head, effort(2, 'low'), reply(5), effort(6, 'xhigh'), reply(9)]);
  // The changes before the first assistant message are setup: every message runs at xhigh.
  const setup = jsonl([...head, effort(2, 'xhigh'), reply(5), reply(9)]);
  assert.deepEqual(score.transcriptFacts(switched, 'switched.jsonl').messages, [
    { model: MODEL, effort: 'low', servedTier: 'priority' },
    { model: MODEL, effort: 'xhigh', servedTier: 'priority' },
  ]);
  const setupEfforts = score.transcriptFacts(setup, 'setup.jsonl').messages.map((message) => message.effort);
  assert.deepEqual(setupEfforts, ['xhigh', 'xhigh']);
  const fixture = judgedArm(CODE_KNOWN.slice(0, 1), [[], []], [transcriptEntry(switched), transcriptEntry(setup)]);
  for (const meta of Object.values(fixture.metas)) meta.config = config;
  const scores = scoreRuns(fixture);
  assert.deepEqual(
    scores.runs.map((run) => [run.run, run.invalid]),
    [
      ['run-1', ['correctness: effort low, not xhigh']],
      ['run-2', []],
    ],
  );
  // The effort row of the decision table shows the efforts of the messages of the valid runs.
  const decision = tableAfter(renderReport(scores, { configs: ['xhigh-fast'] }), '### Decision: -');
  assert.ok(decision.includes('| Effort | xhigh |'));
});

test('agents writes the fixer setting to the list of configurations', (t) => {
  const { agentDir } = selfReviewAgents(t);
  // selfReviewAgents gives no --fixer-* option, so the setting holds the defaults of the fixer agent.
  assert.deepEqual(readJson(path.join(agentDir, 'review-bench-configs.json')).fixer, FIXER_SETTING);
  const fields = frontmatter(path.join(agentDir, 'review-bench-fixer.md'));
  assert.deepEqual([fields.model, fields['thinking-level']], [FIXER_SETTING.model, FIXER_SETTING.effort]);
});

test('case --loop records the fixer setting in round 1 of each loop and stops without one', (t) => {
  const { root, repo, base, head, patches } = loopRepo(t);
  const ws = path.join(root, 'ws');
  const cases = path.join(root, 'cases');
  const project = path.join(root, 'project');
  const seeded = { category: 'bug', source: 'seeded' };
  const caseData = {
    id: 'code-7',
    kind: 'code',
    split: 'dev',
    issue: 7,
    round: 1,
    plan: 'code-7-plan.md',
    base,
    head,
    known: [{ id: 'D1', locator: 'src/sync.mjs:5', ...seeded, summary: 'v5 is 0.', fix: 'code-7.D1.fix.patch' }],
  };
  put(cases, 'dev/code-7.json', caseData);
  put(cases, 'dev/code-7-plan.md', '# Plan 7\n');
  put(cases, 'dev/code-7.D1.fix.patch', patches.D1);
  const configsFile = path.join(project, '.omp', 'agents', 'review-bench-configs.json');
  put(project, '.omp/agents/review-bench-configs.json', { configs: [CONFIGS.low] });
  const options = {
    case: path.join(cases, 'dev', 'code-7.json'),
    arms: 'C1',
    runs: '2',
    out: ws,
    configs: 'low',
    project,
    loop: true,
  };
  // A list of configurations from an `agents` call without the fixer setting cannot prove the fixer of a loop.
  assert.throws(
    () => prepare.prepareCase(options, repo),
    new RegExp(`${escapeRegExp(configsFile)} has no fixer setting; run prepare.mjs agents again`),
  );
  assert.equal(fs.existsSync(path.join(ws, 'code-7')), false);
  put(project, '.omp/agents/review-bench-configs.json', { configs: [CONFIGS.low], fixer: FIXER_SETTING });
  prepare.prepareCase(options, repo);
  for (const run of ['run-1', 'run-2']) {
    const meta = readJson(path.join(ws, 'code-7', 'C1-low', run, 'round-1', 'meta.json'));
    assert.deepEqual([meta.config, meta.fixerConfig], [CONFIGS.low, FIXER_SETTING]);
  }
});

test('a loop whose fixer ran another model, effort, or served tier than the fixer setting is invalid', () => {
  const round = (seconds, mode, fixer, answers) => [seconds, 1000, mode, fixer, answers];
  const loop = (run) => ({
    case: 'code-7',
    config: 'low',
    run,
    rounds: [round(100, 'full', 20, ['valid']), round(50, 'delta', 20, ['valid']), round(40, 'delta', 0, [])],
  });
  const fixture = gridFixture({ 'code-7': { split: 'dev', known: ['D1'] } }, [1, 2, 3, 4, 5].map(loop));
  // The fixer of round 1 used the fixer setting in every run; the fixer of round 2 gets `messages` of its own.
  const round2Fixer = [
    null,
    [{ model: 'anthropic/claude-opus-5-5', effort: 'high', servedTier: null }],
    [{ model: MODEL, effort: 'low', servedTier: 'priority' }],
    [{ model: MODEL, effort: 'high', servedTier: 'default' }],
    null,
  ];
  for (const [index, messages] of round2Fixer.entries()) {
    const meta = (r) => fixture.metas[`code-7/C1-low/run-${index + 1}/round-${r}`];
    // Run 5 comes from a workspace without the fixer setting.
    if (index === 4) delete meta(1).fixerConfig;
    meta(2).fixer.agents = { 'fixer-1': provenCost(FIXER_SETTING, 20, 100, messages ? { messages } : {}) };
  }
  const scores = scoreRuns(fixture);
  assert.deepEqual(
    scores.runs.map((run) => [run.run, run.invalid]),
    [
      ['run-1', []],
      ['run-2', ['round-2/fixer-1: model anthropic/claude-opus-5-5, not openai-codex/gpt-6.1-sol']],
      ['run-3', ['round-2/fixer-1: effort low, not high']],
      ['run-4', ['round-2/fixer-1: served tier default, not priority']],
      ['run-5', ['round-1/fixer-1: no fixer setting', 'round-2/fixer-1: no fixer setting']],
    ],
  );
  assert.equal(scores.summaries[0].runs, 1);
  const lines = renderReport(scores).split('\n');
  assert.ok(lines.includes('- code-7/C1-low/run-3: round-2/fixer-1: effort low, not high'));
});

// Plan #100 code review: a round whose fix step gave findings to the fixer needs the transcript facts of its
// fixer. A repair by hand (`loop --fixer-patch`), or a fixer whose transcript `transcripts` did not find, makes the
// loop invalid with `round-<r>/fixer-1: no transcript facts`.
test('a loop round that gave findings to the fixer is invalid without the transcript facts of its fixer', () => {
  const round = (seconds, mode, fixer, answers) => [seconds, 1000, mode, fixer, answers];
  const loop = (run, answers) => ({
    case: 'code-7',
    config: 'low',
    run,
    rounds: [round(100, 'full', 20, answers), round(40, 'delta', 0, [])],
  });
  const fixture = gridFixture({ 'code-7': { split: 'dev', known: ['D1'] } }, [
    loop(1, ['valid']),
    loop(2, ['valid']),
    loop(3, ['D1']),
    loop(4, ['D1']),
  ]);
  const round1 = (run) => fixture.metas[`code-7/C1-low/run-${run}/round-1`];
  // Run 2: `loop --fixer-patch` repaired the valid extra, so no fixer transcript exists.
  delete round1(2).fixer.agents;
  // Run 3: the fix patch of D1 did not apply, so the fixer repaired D1, but `transcripts` found no fixer transcript.
  round1(3).fixedByFixer = ['D1'];
  // Run 4: the fix patch of D1 applied, so round 1 gave no finding to the fixer and needs no fixer facts.
  const scores = scoreRuns(fixture);
  assert.deepEqual(
    scores.runs.map((run) => [run.run, run.invalid]),
    [
      ['run-1', []],
      ['run-2', ['round-1/fixer-1: no transcript facts']],
      ['run-3', ['round-1/fixer-1: no transcript facts']],
      ['run-4', []],
    ],
  );
  assert.equal(scores.summaries[0].runs, 2);
  const lines = renderReport(scores).split('\n');
  assert.ok(lines.includes('- code-7/C1-low/run-2: round-1/fixer-1: no transcript facts'));
});

// Plan #100 code review round 2: a reviewer block that holds no review (missing, unreadable, or blocked) makes its
// run invalid, so the run leaves the summary and the configuration and arm tables. The reason is
// `round-<k>/<reviewer>: no review (<verdict>)`, and `<reviewer>: no review (<verdict>)` for a run without rounds.
test('a run with a reviewer block that holds no review is invalid and leaves the summary and the tables', () => {
  const round = (seconds, mode, answers) => [seconds, 1000, mode, 0, answers];
  const loop = (run) => ({
    case: 'code-7',
    config: 'low',
    run,
    rounds: [round(100, 'full', ['D1']), round(40, 'delta', [])],
  });
  const single = (run) => ({
    case: 'code-7',
    config: 'low',
    arm: 'S1',
    run,
    single: true,
    rounds: [round(60, null, ['D1'])],
  });
  const fixture = gridFixture({ 'code-7': { split: 'dev', known: ['D1'] } }, [
    ...[1, 2, 3].map(loop),
    ...[1, 2].map(single),
  ]);
  const block = (arm, run, inRound) =>
    fixture.findings.blocks.find((entry) => entry.arm === arm && entry.run === run && entry.round === inRound);
  // A JSON object with only an `acknowledgment` field gives `unreadable`; a prompt without a block gives `missing`.
  block('C1-low', 'run-2', 2).verdict = 'unreadable';
  block('C1-low', 'run-3', 2).verdict = 'missing';
  block('S1-low', 'run-2', undefined).verdict = 'blocked';
  const scores = scoreRuns(fixture);
  assert.deepEqual(
    scores.runs.map((run) => [`${run.arm}/${run.run}`, run.invalid]),
    [
      ['C1-low/run-1', []],
      ['C1-low/run-2', ['round-2/full: no review (unreadable)']],
      ['C1-low/run-3', ['round-2/full: no review (missing)']],
      ['S1-low/run-1', []],
      ['S1-low/run-2', ['full: no review (blocked)']],
    ],
  );
  assert.deepEqual(
    scores.summaries.map((summary) => [summary.arm, summary.runs]),
    [
      ['C1-low', 1],
      ['S1-low', 1],
    ],
  );
  const configs = renderReport(scores, { configs: ['low'] });
  const lines = configs.split('\n');
  for (const line of [
    '- code-7/C1-low/run-2: round-2/full: no review (unreadable)',
    '- code-7/C1-low/run-3: round-2/full: no review (missing)',
    '- code-7/S1-low/run-2: full: no review (blocked)',
  ]) {
    assert.ok(lines.includes(line), `## Invalid runs lacks ${line}`);
  }
  assert.equal(tableAfter(configs, '### Decision: dev')[2], '| Runs | 2 |');
  assert.equal(tableAfter(configs, '### Code loops: dev')[2], '| Runs | 1 |');
  assert.equal(tableAfter(configs, '### Single reviews: dev')[2], '| Runs | 1 |');
  const arms = renderReport(scores, { arms: ['C1-low', 'S1-low'] });
  assert.equal(tableAfter(arms, '### Decision: dev')[2], '| Runs | 1 | 1 |');
});

test('the code-loop and single-review tables show the model, effort, and served tier of the transcripts', () => {
  const round = (seconds, mode, answers) => [seconds, 1000, mode, 0, answers];
  const fixture = gridFixture(
    { 'code-7': { split: 'dev', known: ['D1'] }, 'plan-6': { split: 'dev', known: ['P1'], kind: 'plan' } },
    [
      { case: 'code-7', config: 'low', rounds: [round(100, 'full', ['D1'])] },
      { case: 'code-7', config: 'xhigh-fast', rounds: [round(80, 'full', ['D1'])] },
      { case: 'plan-6', config: 'low', single: true, rounds: [round(60, null, ['P1'])] },
      { case: 'plan-6', config: 'xhigh-fast', single: true, rounds: [round(50, null, [])] },
    ],
  );
  const report = renderReport(scoreRuns(fixture), { configs: ['low', 'xhigh-fast'] });
  const facts = [`| Model | ${MODEL} | ${MODEL} |`, '| Effort | low | xhigh |', '| Served tier | default | priority |'];
  for (const heading of ['### Decision: dev', '### Code loops: dev', '### Single reviews: dev']) {
    const table = tableAfter(report, heading);
    assert.ok(
      facts.every((row) => table.includes(row)),
      `${heading} does not show the facts of the transcripts`,
    );
  }
  assert.deepEqual(tableAfter(report, '### Code loops: dev').slice(2, 6), ['| Runs | 1 | 1 |', ...facts]);
  assert.deepEqual(tableAfter(report, '### Single reviews: dev').slice(2, 6), ['| Runs | 1 | 1 |', ...facts]);
});

test('readScope splits the path of grep, glob, and ast_grep on `;` and keeps the path of other tools whole', () => {
  const scope = { runDir: `${SCOPE_CASE}/C3-low/run-1`, cwd: LIVE, pluginRoots: [LIVE_PLUGIN] };
  // A file name can hold `;`: a read or a find of it is one target under the snapshot.
  const whole = [
    ...reads(`${SCOPE_CASE}/snapshot/src/a;b.mjs`, `${SCOPE_CASE}/snapshot/src/a;b.mjs:1-20`),
    { name: 'find', path: `${SCOPE_CASE}/snapshot/src;b` },
  ];
  assert.deepEqual(score.readScope(whole, scope), { outside: [] });
  // The path of these tools is a list, so each part is a target; a relative part resolves against the live checkout.
  const lists = [
    { name: 'grep', path: `${SCOPE_CASE}/snapshot/src;b.mjs` },
    { name: 'glob', path: `${SCOPE_CASE}/snapshot/**/*.md; ${LIVE}/docs/*.md` },
    { name: 'ast_grep', path: `${SCOPE_CASE}/snapshot/src; ${LIVE}/src` },
    // ast_grep without a path searches the working directory, as grep, glob, and find do.
    { name: 'ast_grep', path: null },
  ];
  assert.deepEqual(score.readScope(lists, scope), {
    outside: ['b.mjs', `${LIVE}/docs/*.md`, `${LIVE}/src`, 'ast_grep without a path'],
  });
});

// Plan #100, code review round 3: omp reads a path as a list only when no file or folder has the whole path, and it
// resolves a relative path of the list against its working directory.
//
// Changed exports:
// - readScope takes the option `lists`: a Map from a target (the trimmed path of a call, or a `;`-part of the path of
//   grep, glob, or ast_grep, with its read selector) to the paths that omp read for it, without read selectors. A
//   target with an entry is allowed only when each of these paths is allowed, and outside lists it as the reviewer
//   wrote it. A target without an entry is one path. The function reads no file.
// - transcriptsCommand gives readScope the lists of the transcript of the reviewer:
//   - for a read call whose tool result has `details.displayReadTargets`, the paths of that list, except each path
//     that a note `Could not read <path>: <reason>` in `details.notes` names (omp could not read it);
//   - for every other target with `;`, `,`, or white space outside `{}` and not after a backslash, the split that omp
//     takes, checked on the files, with a relative path against the `cwd` of the session. A target whose whole path
//     exists, as written or without its read selector, gets no list. Else the list is the first of these splits: on
//     `;`; on `,` when some part exists; on white space when each part exists; on all three when each part exists. A
//     part exists when the folder before its first glob segment exists. A URI is a list only on `;`, and only when
//     each part is a URI.

test('readScope allows a list target only when each path that omp read for it is allowed', () => {
  const scope = { runDir: `${SCOPE_CASE}/C3-low/run-1`, cwd: LIVE, pluginRoots: [LIVE_PLUGIN] };
  const snapshot = `${SCOPE_CASE}/snapshot`;
  const [a, b] = [`${snapshot}/src/a.mjs`, `${snapshot}/src/b.mjs`];
  const lists = new Map([
    [`${a}, ${b}`, [a, b]],
    // omp could not read the path `133`, so the list holds only the snapshot file.
    [`${a}:65:raw,133:raw`, [a]],
    [`${a};${LIVE}/src/b.mjs`, [a, `${LIVE}/src/b.mjs`]],
    // A relative path of a list resolves against the working directory, the live checkout.
    [`${a}:1-20, src/b.mjs`, [a, 'src/b.mjs']],
    ['skill://code-review/SKILL.md;skill://code-reviewer', ['skill://code-review/SKILL.md', 'skill://code-reviewer']],
    [`${snapshot}/src, ${LIVE}/src`, [`${snapshot}/src`, `${LIVE}/src`]],
  ]);
  const allowed = reads(`${a}, ${b}`, `${a}:65:raw,133:raw`, `${snapshot}/docs/release notes.md:1-20`);
  assert.deepEqual(score.readScope(allowed, { ...scope, lists }), { outside: [] });
  const calls = [
    ...reads(`${a};${LIVE}/src/b.mjs`, `${a}:1-20, src/b.mjs`, 'skill://code-review/SKILL.md;skill://code-reviewer'),
    { name: 'grep', path: `${snapshot}/src, ${LIVE}/src` },
  ];
  assert.deepEqual(score.readScope(calls, { ...scope, lists }), {
    outside: [
      `${a};${LIVE}/src/b.mjs`,
      `${a}:1-20, src/b.mjs`,
      'skill://code-review/SKILL.md;skill://code-reviewer',
      `${snapshot}/src, ${LIVE}/src`,
    ],
  });
  // Without an entry in `lists`, a target is one path, and each whole path below is under the snapshot.
  assert.deepEqual(score.readScope(reads(`${a};${LIVE}/src/b.mjs`, `${a}:1-20, src/b.mjs`), scope), { outside: [] });
});

// The case `code-7` of the workspace `<root>/<name>` for the transcripts tests of list targets: one full round of the
// candidate at `low`, whose session runs in the live checkout `<root>/live`. The case changes no file.
function listCase(root, name) {
  const ws = path.join(root, name);
  const caseDir = path.join(ws, 'code-7');
  const round1 = path.join(caseDir, 'C1-low', 'run-1', 'round-1');
  put(ws, 'code-7/case.json', { id: 'code-7', kind: 'code', split: 'dev' });
  put(caseDir, 'full.diff', '');
  put(round1, 'prompts/full.txt', 'agent: review-bench-candidate-code-low\n\nReview.\n');
  put(round1, 'meta.json', { config: CONFIGS.low, mode: 'full' });
  const live = path.join(root, 'live');
  return { ws, sessions: path.join(root, 'sessions'), live, caseDir, snapshot: path.join(caseDir, 'snapshot'), round1 };
}

// The read scope that transcripts gives the reviewer of `listCase` for a session with the tool calls `calls` and the
// tool results `results` (see toolTranscript).
function listReadScope({ ws, sessions, live, caseDir, round1 }, calls, results = {}) {
  put(sessions, 'Code7C1LowR1K1Full.jsonl', toolTranscript(caseDir, 30, calls, undefined, { cwd: live, results }));
  assert.deepEqual(transcriptsCommand(ws, sessions), ['Code7C1LowR1K1Full']);
  return readJson(path.join(round1, 'meta.json')).reviewers.full.readScope;
}

test('transcripts reads a target as a list only when no file has its whole path, and prefers the list of omp', (t) => {
  // A workspace folder whose name holds a space, as `bench=…/bench-gpt 7` gives it, so each snapshot path holds one.
  const fixture = listCase(scratch(t), 'bench-gpt 7');
  const { live, snapshot } = fixture;
  // The live checkout, the working directory of the reviewer, has the layout of the snapshot. The agent text names
  // another plugin root, as for a baseline reviewer, so the skill file of the live checkout is outside.
  const skill = 'plugins/plan-lifecycle/skills/productivity/code-reviewer/SKILL.md';
  for (const file of ['src/a.mjs', 'src/a;b.mjs', 'docs/release notes.md', skill]) put(snapshot, file, 'text\n');
  put(live, skill, 'text\n');
  const a = path.join(snapshot, 'src', 'a.mjs');
  const calls = [
    // Each whole path exists, as written or without its read selector, so each target is one path.
    ['read', { path: `${a}:1-20` }],
    ['read', { path: path.join(snapshot, 'src', 'a;b.mjs') }],
    ['read', { path: `${path.join(snapshot, 'docs', 'release notes.md')}:1-20` }],
    ['grep', { pattern: 'lock', path: path.join(snapshot, 'src') }],
    // No folder has the part before the space, so omp does not split the glob on white space.
    ['glob', { path: path.join(snapshot, 'src', '*.{mjs,json}') }],
    // A URL is a list only when each part is a URI.
    ['read', { path: 'https://nodejs.org/api/fs.html;jsessionid=1' }],
    // No file has the whole path, so omp reads the paths between `,`, and the relative path resolves against the live
    // checkout.
    ['read', { path: `${a}, ${skill}` }],
    ['read', { path: `${a}, ${path.join(snapshot, skill)}` }],
    // The tool result records the list: omp could not read the path `133`, so only the snapshot file counts.
    ['read', { path: `${a}:65:raw,133:raw` }],
    // Without a tool result, transcripts cannot see which paths omp could not read, so each path of the list counts:
    // `140` resolves against the live checkout.
    ['read', { path: `${a}:70:raw,140:raw` }],
  ];
  const results = {
    'call-9': {
      notes: [`Note: interpreted as 2 paths: ${a}:65:raw, 133:raw`, "Could not read 133:raw: Path '133' not found"],
      displayReadTargets: [`${a}:65:raw`, '133:raw'],
    },
  };
  assert.deepEqual(listReadScope(fixture, calls, results), { outside: [`${a}, ${skill}`, `${a}:70:raw,140:raw`] });
});

// Each call below has no tool result, so the files decide the split, as they decided for omp. Each target that is
// outside is allowed as one path (the whole path is under the snapshot, or under the code-review skill), so only the
// split makes it outside. omp://tools/find.md is silent on a delimited path, so the path of `find` follows score.mjs:
// it is one target, not a `;` list of targets as for grep, and it splits as the path of `read` splits.
test('transcripts splits a target on `;`, on white space, and on all three delimiters as omp does', (t) => {
  // A workspace folder without a space: a white-space split of a snapshot path in `bench-gpt 7` breaks the folder name.
  const fixture = listCase(scratch(t), 'bench');
  const { live, snapshot } = fixture;
  for (const file of ['src/a.mjs', 'src/b.mjs', 'src/a,b.mjs']) put(snapshot, file, 'text\n');
  for (const file of ['src/b.mjs', 'src/c.mjs']) put(live, file, 'text\n');
  const [a, b] = [path.join(snapshot, 'src', 'a.mjs'), path.join(snapshot, 'src', 'b.mjs')];
  const [liveB, liveC] = [path.join(live, 'src', 'b.mjs'), path.join(live, 'src', 'c.mjs')];
  const whiteSpace = `${a} ${liveB}`;
  const semicolons = `${a};${liveB};missing.mjs`;
  const skills = 'skill://code-review/SKILL.md;skill://code-reviewer';
  // Each part between white space exists, but no part between `,` and not every part of the split on all three
  // delimiters exists, so only the white-space split reads this target as two paths.
  const commaName = `${path.join(snapshot, 'src', 'a,b.mjs')} ${liveC}`;
  // No part between `,` exists, and the part `<b>,<live b>` between white space does not exist, so only the split on
  // all three delimiters has parts that each exist.
  const allThree = `${a} ${b},${liveB} ${liveC}`;
  const calls = [
    // Each part exists, so omp reads the paths between white space.
    ['grep', { pattern: 'lock', path: whiteSpace }],
    // `missing.mjs` resolves against the live checkout and does not exist, so the target is one path.
    ['grep', { pattern: 'lock', path: `${a} missing.mjs` }],
    // The split on `;` needs no part to exist.
    ['find', { query: 'lock release', grep_keywords: [], path: semicolons }],
    // Each part is a URI, so omp reads the URIs between `;`: the code-reviewer skill is outside, the code-clarity
    // skill is allowed.
    ['read', { path: skills }],
    ['read', { path: 'skill://code-review/SKILL.md;skill://code-clarity' }],
    ['grep', { pattern: 'lock', path: commaName }],
    ['read', { path: allThree }],
  ];
  assert.deepEqual(listReadScope(fixture, calls), { outside: [whiteSpace, semicolons, skills, commaName, allThree] });
});

test('readScope records each web search query, and a query that targets the benchmark repository is outside', () => {
  const call = (name, args) => ({ type: 'toolCall', id: name, name, arguments: args });
  const reply = assistantLine(5, 'openai-codex', 'gpt-6.1-sol', 'default', { input: 10 });
  reply.message.content = [
    call('web_search', { query: 'node lock release finally' }),
    call('web_search', { recency: 'week' }),
    call('read', { path: `${SCOPE_CASE}/plan.md` }),
  ];
  const text = jsonl([{ type: 'message', timestamp: isoAt(0), message: { role: 'user' } }, reply]);
  assert.deepEqual(score.transcriptFacts(text, 'search.jsonl').toolCalls, [
    { name: 'web_search', path: null, query: 'node lock release finally' },
    { name: 'web_search', path: null, query: null },
    { name: 'read', path: `${SCOPE_CASE}/plan.md` },
  ]);
  const scope = { runDir: `${SCOPE_CASE}/C3-low/run-1`, cwd: LIVE, pluginRoots: [LIVE_PLUGIN] };
  const search = (query) => ({ name: 'web_search', path: null, query });
  // The repository can show the fixes of the corpus defects. A query that names it, or names its owner without
  // another repository, can find its pages, also without a URL.
  const repository = [
    'site:github.com/DocksDocks/docks sync lock',
    'docksdocks/DOCKS review fixes',
    'GITHUB.COM/docksdocks plan-lifecycle',
    'DocksDocks docks plan-lifecycle archive fix',
    '"docks-kit" site:github.com/DocksDocks/public OR site:github.com/DocksDocks/docks',
    // An exclusion does not cancel a query that names the repository itself.
    'DocksDocks/docks sync lock -site:github.com/DocksDocks/docks',
    // A dot that ends a sentence is not part of the repository name.
    'see DocksDocks/docks.',
    // An exclusion of part of the repository, or of another site, does not remove the repository from the search.
    'DocksDocks "docks-kit" -site:github.com/DocksDocks/docks/issues',
    'DocksDocks docks-kit -site:deepwiki.com/DocksDocks/docks',
  ];
  // Another repository of the owner is not the benchmark repository, and `-site:` excludes the benchmark repository.
  const other = [
    'site:github.com/DocksDocks/public "docks-kit" "fast"',
    '"docks-kit" "sync omp" "DocksDocks/public"',
    '"docks-kit" "omp" "--fast" -site:github.com/DocksDocks/docks',
    'DocksDocks docs -site:github.com/DocksDocks',
    'DocksDocks "docks-kit" -site:github.com/DocksDocks/docks',
  ];
  const calls = [
    search('node lock release finally'),
    ...repository.map(search),
    ...other.map(search),
    search('node lock release finally'),
    search(null),
    ...reads(`${SCOPE_CASE}/plan.md`),
  ];
  assert.deepEqual(score.readScope(calls, scope), {
    outside: repository.map((query) => `web_search: ${query}`),
    queries: ['node lock release finally', ...repository, ...other],
  });
  // A reviewer without a web search gets no queries.
  assert.deepEqual(score.readScope(reads(`${SCOPE_CASE}/plan.md`), scope), { outside: [] });
});

test('a web search whose result cites a page of the benchmark repository is outside', () => {
  const call = (id, query) => ({ type: 'toolCall', id, name: 'web_search', arguments: { query } });
  const reply = assistantLine(5, 'openai-codex', 'gpt-6.1-sol', 'default', { input: 10 });
  reply.message.content = [call('s1', 'docks-kit fast mode'), call('s2', 'compose anonymous volumes')];
  const result = (toolCallId, text) => ({
    type: 'message',
    timestamp: isoAt(6),
    message: { role: 'toolResult', toolCallId, toolName: 'web_search', content: [{ type: 'text', text }] },
  });
  const cited = 'https://github.com/DocksDocks/docks/blob/main/plugins/plan-lifecycle/README.md';
  const docs = 'https://docs.docker.com/reference/cli/docker/compose/down/';
  const text = jsonl([
    { type: 'message', timestamp: isoAt(0), message: { role: 'user' } },
    reply,
    result('s1', `The toggle is documented in the plugin README (${cited}).`),
    result('s2', `Anonymous volumes stay after down: ${docs}.`),
  ]);
  const toolCalls = score.transcriptFacts(text, 'search.jsonl').toolCalls;
  assert.deepEqual(toolCalls, [
    { name: 'web_search', path: null, query: 'docks-kit fast mode', resultUrls: [cited] },
    { name: 'web_search', path: null, query: 'compose anonymous volumes', resultUrls: [docs] },
  ]);
  const scope = { runDir: `${SCOPE_CASE}/C3-low/run-1`, cwd: LIVE, pluginRoots: [LIVE_PLUGIN] };
  assert.deepEqual(score.readScope(toolCalls, scope), {
    outside: [`web_search result: ${cited}`],
    queries: ['docks-kit fast mode', 'compose anonymous volumes'],
  });
});

test('a truncated result URL is outside only when its text names the owner of the benchmark repository', () => {
  // omp cuts long result text with `…`, also inside a host name, so such a URL cannot be parsed, and its cut part
  // can hold the repository name.
  const scope = { runDir: `${SCOPE_CASE}/C3-low/run-1`, cwd: LIVE, pluginRoots: [LIVE_PLUGIN] };
  const search = (resultUrls) => ({ name: 'web_search', path: null, query: 'lock release', resultUrls });
  const truncated = 'https://github.com/DocksDocks/do…';
  assert.deepEqual(score.readScope([search(['https://news.ycombinator.c…', truncated])], scope), {
    outside: [`web_search result: ${truncated}`],
    queries: ['lock release'],
  });
});

test('a page of another site that names the benchmark repository is outside', () => {
  // A mirror, a code search, or a GitHub search can show the current text of the repository.
  const scope = { runDir: `${SCOPE_CASE}/C3-low/run-1`, cwd: LIVE, pluginRoots: [LIVE_PLUGIN] };
  const mirrors = [
    'https://deepwiki.com/DocksDocks/docks',
    'https://sourcegraph.com/github.com/DocksDocks/docks/-/blob/plugins/plan-lifecycle/README.md',
    'https://github.com/search?q=repo%3ADocksDocks%2Fdocks+lock&type=code',
  ];
  const allowed = ['https://deepwiki.com/DocksDocks/public', 'https://github.com/DocksDocks/docks-kit'];
  assert.deepEqual(score.readScope(reads(...mirrors, ...allowed), scope), { outside: mirrors });
  const search = { name: 'web_search', path: null, query: 'lock release', resultUrls: [mirrors[0], allowed[0]] };
  assert.deepEqual(score.readScope([search], scope), {
    outside: [`web_search result: ${mirrors[0]}`],
    queries: ['lock release'],
  });
});

test('readScope reads a local file with a JSON query selector as the file before the selector', () => {
  const scope = { runDir: `${SCOPE_CASE}/C3-low/run-1`, cwd: LIVE, pluginRoots: [LIVE_PLUGIN] };
  const calls = reads(
    `${SCOPE_CASE}/snapshot/scripts/config/test-contracts.json?q=.suites // .`,
    `${SCOPE_CASE}/case.json?q=.known`,
  );
  assert.deepEqual(score.readScope(calls, scope), { outside: [`${SCOPE_CASE}/case.json`] });
});

// omp reads `<file>?q=<filter>` as one file with a JSON query, also when the filter holds white space. The `?` is a glob
// character, so without this rule the white-space split would find parts that each exist (`//` and `.`).
test('transcripts reads a local file with a JSON query selector as one target, also with white space', (t) => {
  const fixture = listCase(scratch(t), 'bench');
  const { live, snapshot } = fixture;
  put(snapshot, 'scripts/config/test-contracts.json', '{}\n');
  put(live, 'README.md', 'text\n');
  const file = path.join(snapshot, 'scripts', 'config', 'test-contracts.json');
  assert.deepEqual(listReadScope(fixture, [['read', { path: `${file}?q=.suites // .` }]]), { outside: [] });
});

test('a failed request without a served tier stays out of the model and tier checks and keeps its time', () => {
  const config = CONFIGS['xhigh-fast'];
  const head = [
    { type: 'thinking_level_change', timestamp: isoAt(0), thinkingLevel: 'xhigh' },
    { type: 'service_tier_change', timestamp: isoAt(0), serviceTier: { openai: 'priority' } },
    { type: 'message', timestamp: isoAt(1), message: { role: 'user' } },
  ];
  const reply = (second, tier) => assistantLine(second, 'openai-codex', 'gpt-6.1-sol', tier, { input: 10 });
  const error = (line) => {
    line.message.stopReason = 'error';
    return line;
  };
  // A failed request of the configured model, then a failed request of a fallback model at second 61.
  const failedFallback = error(assistantLine(61, 'anthropic', 'claude-opus-5-5', null, { input: 0 }));
  const failing = jsonl([...head, reply(5, 'priority'), error(reply(40, null)), failedFallback]);
  assert.deepEqual(score.transcriptFacts(failing, 'failing.jsonl').messages, [
    { model: MODEL, effort: 'xhigh', servedTier: 'priority' },
    { model: MODEL, effort: 'xhigh', servedTier: null, failed: true },
    { model: 'anthropic/claude-opus-5-5', effort: 'xhigh', servedTier: null, failed: true },
  ]);
  // The time of the failed requests is real wall time: the seconds run to the last failed request, also of another
  // model. The tokens count the messages of the configured model only.
  assert.deepEqual(parseTranscript(failing, 'failing.jsonl', MODEL), { seconds: 60, tokens: 20 });
  // Every request failed: no model served the reviewer.
  const noReply = jsonl([...head, error(reply(5, null))]);
  // A message that stopped on an error but has a served tier was served, so the checks keep it.
  const servedError = jsonl([...head, reply(5, 'priority'), error(reply(9, 'default'))]);
  const costs = [transcriptEntry(failing), transcriptEntry(noReply), transcriptEntry(servedError)];
  const fixture = judgedArm(CODE_KNOWN.slice(0, 1), [[], [], []], costs);
  for (const meta of Object.values(fixture.metas)) meta.config = config;
  const scores = scoreRuns(fixture);
  assert.deepEqual(
    scores.runs.map((run) => [run.run, run.invalid]),
    [
      ['run-1', []],
      ['run-2', ['correctness: no served assistant message']],
      ['run-3', ['correctness: served tier default, not priority']],
    ],
  );
  // The model and served-tier rows leave the failed requests out too.
  const decision = tableAfter(renderReport(scores, { configs: ['xhigh-fast'] }), '### Decision: -');
  assert.ok(decision.includes(`| Model | ${MODEL} |`));
  assert.ok(decision.includes('| Served tier | priority |'));
});

test('findings removes the judge answers of each finding whose text changed or that is gone', (t) => {
  const { ws, cases } = workspace(t);
  const { findings } = findingsCommand(ws);
  pairsCommand(ws, cases);
  const judgments = judgeAll(ws, () => 'no');
  const blind = Object.fromEntries(findings.map((finding) => [finding.id, finding.blind]));
  const changed = 'code-7/C3/run-1/correctness#2';
  const gone = 'code-7/B0/run-1/full#1';
  const kept = 'code-7/C3/run-2/correctness#2';
  const answersOf = (doc, id) => [...doc.matches, ...doc.adjudications].filter((entry) => entry.finding === blind[id]);
  // The second judge rated a sample that holds the changed finding and a finding that stays.
  const rated = (id) => judgments.adjudications.filter((entry) => entry.finding === blind[id]);
  put(ws, 'judgments-second.json', { matches: [], adjudications: [...rated(changed), ...rated(kept)] });
  for (const id of [changed, gone, kept]) assert.ok(answersOf(judgments, id).length > 0, `${id} has no answer`);
  // The reviewer of C3/run-1/correctness is dispatched again and words its second finding in another way, and the
  // block of B0/run-1/full is removed for a new dispatch. The ids stay the same, so the old answers would apply.
  put(ws, 'code-7/C3/run-1/blocks/correctness.md', CORRECTNESS_BLOCK.replace('on every call', 'for each call'));
  fs.rmSync(path.join(ws, 'code-7/B0/run-1/blocks/full.md'));
  const output = main(['findings', ws]).split('\n');
  assert.equal(
    output[1],
    `removed the judge answers of 2 findings whose text changed or that are gone: ${gone}, ${changed}`,
  );
  const first = readJson(path.join(ws, 'judgments.json'));
  const second = readJson(path.join(ws, 'judgments-second.json'));
  for (const id of [changed, gone]) {
    assert.deepEqual(answersOf(first, id), [], `judgments.json keeps an answer of ${id}`);
    assert.deepEqual(answersOf(second, id), [], `judgments-second.json keeps an answer of ${id}`);
  }
  // The answers of the other findings stay, also when the same text is at another place.
  assert.deepEqual(answersOf(first, kept), answersOf(judgments, kept));
  assert.deepEqual(answersOf(second, kept), rated(kept));
  const others = findings.map((finding) => finding.id).filter((id) => id !== changed && id !== gone);
  for (const id of others) assert.deepEqual(answersOf(first, id), answersOf(judgments, id));
  // A second call finds nothing stale and prints no removal.
  assert.equal(main(['findings', ws]).split('\n').length, 1);
  assert.deepEqual(findingsCommand(ws).removed, []);
});

// Plan #109 step 1: API note for the variant tests below (decision 2).
//
// prepare.mjs:
// - prepareAgents takes `variants` (`--variants <name>=<git ref>[,...]`) and `full-only` (`--full-only <name,...>`).
//   For each variant, it extracts plugins/plan-lifecycle at the ref into the folder `variant-<name>-plugin` next to
//   the baseline copy (in the parent folder of the baseline dir). For each variant and configuration, it writes the
//   agent `review-bench-variant-<name>-plan-<config>`: renderAgent of plugins/plan-lifecycle/agents/plan-reviewer.md
//   at the ref, with the model and the effort of the configuration and the variant folder as the plugin root. The
//   agent gets the tier override of the configuration. The list of configurations gets `variants`: one
//   { name, ref, sha, delta } per variant, in --variants order. delta is false for a --full-only name. These refusals
//   come before a file of the project changes:
//   `--variants: the variant name <name> has a character other than a-z and 0-9`,
//   `--variants: the variant name <name> occurs two times`,
//   `plugins/plan-lifecycle/agents/plan-reviewer.md does not exist at <ref>`,
//   `--full-only names <name>, which is not a variant`.
// - prepareCase: a plan or plan-delta case also takes the arm `V<name>` for each variant of the list of
//   configurations. A list without `variants` gives no variant arm. The refusal of an unknown arm lists the variant
//   arms after the other arms of the kind. Code and code-delta cases take no variant arm.
//   A variant arm runs its variant agent with the reviewer `plan`. Its mode is `full` on a plan case. On a plan-delta
//   case, its mode is `delta`, or `full` when its delta is false. Its prompt is the prompt of the static arm of the
//   same mode (P0 or P1 for `full`, Pd for `delta`); only the agent line differs.
// - The case field `show_benchmark: true` puts the benchmark skill folder without its `cases/` folder in the snapshot.
//   Without the field, the snapshot leaves out the whole folder, as before. The scripts hide the skill folder of their
//   own repository, so the test of this field runs a copy of prepare.mjs, score.mjs, and the plan helper. In a review
//   loop, the fixer snapshot, the snapshot and the diffs of a later round, and the tree copy of the judge follow the
//   same rule.
// score.mjs:
// - reportCommand takes the option `reference`, and `report` takes `--reference <folder>`. The shared-cases row and
//   the interval rows then compare each column with that folder, and the report says `The reference column is
//   <folder>.` instead of `The reference column has the fewest escaped defects per 50 known defects.`
// - transcripts and readScope keep their rules: the agent text of a variant names the skill of its own plugin root,
//   so its reviewer may read that root and no other variant root.

const PREPARE_SCRIPT = path.join(import.meta.dirname, '../../../.agents/skills/review-benchmark/scripts/prepare.mjs');
// The delta reference of the plan-reviewer skill, relative to a plugin root.
const VARIANT_DELTA = 'skills/productivity/plan-reviewer/references/delta.md';
// The variants of variantOptions and their refs.
const VARIANT_REFS = { 16: 'v16', a: 'cand-a' };

// The plan-reviewer agent at one ref of the variant repository. As the plugin agent does, it names the skill of its
// plugin root.
const variantAgentText = (label) => `---
name: plan-reviewer
description: Reviews plans.
tools: Read, Glob, Grep
---

# Plan Reviewer ${label}

Load and follow
\`\${CLAUDE_PLUGIN_ROOT}/skills/productivity/plan-reviewer/SKILL.md\`.
`;

// The plugin root of a variant: `agents` extracts it next to the baseline copy.
const variantRoot = (root, name) => path.join(root, `variant-${name}-plugin`);

// A git repository with three tags: `bare` (README.md only), `v16`, and `cand-a`, whose plugin also holds the delta
// reference. HEAD, the work tree of the candidate agents, changes the plugin again. Each plugin file names its ref,
// so a copy shows the ref that it came from.
function variantRepo(t) {
  isolateGit(t);
  const root = neutralScratch(t);
  const repo = path.join(root, 'repo');
  const project = path.join(root, 'project');
  fs.mkdirSync(repo);
  fs.mkdirSync(project);
  gitIn(repo, 'init', '-q', '-b', 'main');
  const commit = (message, files) => {
    for (const [file, content] of Object.entries(files)) put(repo, file, content);
    gitIn(repo, 'add', '-A');
    gitIn(repo, 'commit', '-q', '-m', message);
    return gitIn(repo, 'rev-parse', 'HEAD').trim();
  };
  const plugin = 'plugins/plan-lifecycle';
  const files = (label) => ({
    [`${plugin}/agents/code-reviewer.md`]: `---\nname: code-reviewer\ndescription: Reviews.\n---\n\n# ${label}\n`,
    [`${plugin}/agents/plan-reviewer.md`]: variantAgentText(label),
    [`${plugin}/skills/productivity/plan-reviewer/SKILL.md`]: `# Plan reviewer ${label}\n`,
    [`${plugin}/skills/productivity/plan-manager/references/plan-contract.md`]: `# Plan contract ${label}\n`,
  });
  const shas = {
    bare: commit('bare', { 'README.md': '# Demo\n' }),
    v16: commit('0.16.0', files('0.16.0')),
    'cand-a': commit('candidate a', { ...files('A'), [`${plugin}/${VARIANT_DELTA}`]: '# Delta mode A\n' }),
  };
  for (const [tag, sha] of Object.entries(shas)) gitIn(repo, 'tag', tag, sha);
  commit('live', files('live'));
  return { root, repo, project, agentDir: path.join(project, '.omp', 'agents'), shas };
}

// The options of `agents` for the variants 16 (v16, full only) and a (cand-a), at the efforts low and xhigh with the
// tiers default and priority.
const variantOptions = ({ root, project }) => ({
  'baseline-ref': 'v16',
  variants: '16=v16,a=cand-a',
  'full-only': '16',
  model: MODEL,
  efforts: 'low,xhigh',
  tiers: 'default,priority',
  'baseline-dir': path.join(root, 'baseline-plugin'),
  project,
});

test('agents --variants writes an agent per variant and configuration from the plan reviewer at its ref', (t) => {
  const fixture = variantRepo(t);
  const { root, repo, project, agentDir, shas } = fixture;
  prepare.prepareAgents(variantOptions(fixture), repo);
  const list = readJson(path.join(agentDir, 'review-bench-configs.json'));
  assert.deepEqual(
    list.configs.map((config) => config.name),
    ['low', 'low-fast', 'xhigh', 'xhigh-fast'],
  );
  assert.deepEqual(list.variants, [
    { name: '16', ref: 'v16', sha: shas.v16, delta: false },
    { name: 'a', ref: 'cand-a', sha: shas['cand-a'], delta: true },
  ]);
  assert.deepEqual(
    fs
      .readdirSync(agentDir)
      .filter((file) => file.startsWith('review-bench-variant-'))
      .sort(),
    Object.keys(VARIANT_REFS)
      .flatMap((name) => list.configs.map((config) => `review-bench-variant-${name}-plan-${config.name}.md`))
      .sort(),
  );
  const overrides = readJson(path.join(project, '.omp', 'settings.json')).task.agentServiceTierOverrides;
  for (const [name, ref] of Object.entries(VARIANT_REFS)) {
    const pluginRoot = variantRoot(root, name);
    const atRef = (file) => gitIn(repo, 'show', `${ref}:plugins/plan-lifecycle/${file}`);
    for (const { name: config, model, effort, tier } of list.configs) {
      const agent = `review-bench-variant-${name}-plan-${config}`;
      const text = readText(path.join(agentDir, `${agent}.md`));
      // The agent text at the ref, with the model and the effort of the configuration and the variant plugin root.
      const rendered = prepare.renderAgent(atRef('agents/plan-reviewer.md'), {
        name: agent,
        model,
        effortKey: 'thinking-level',
        effort,
        pluginRoot,
      });
      assert.equal(text, rendered);
      assert.ok(text.includes(`\`${pluginRoot}/skills/productivity/plan-reviewer/SKILL.md\``));
      assert.equal(overrides[agent], tier);
    }
    // The plugin root holds plugins/plan-lifecycle at the ref, not the files of the work tree.
    for (const file of [
      'agents/plan-reviewer.md',
      'skills/productivity/plan-reviewer/SKILL.md',
      'skills/productivity/plan-manager/references/plan-contract.md',
    ]) {
      assert.equal(readText(path.join(pluginRoot, file)), atRef(file));
    }
  }
  assert.equal(fs.existsSync(path.join(variantRoot(root, 'a'), VARIANT_DELTA)), true);
  assert.equal(fs.existsSync(path.join(variantRoot(root, '16'), VARIANT_DELTA)), false);
  // clean removes the variant agents and their tier overrides with the other generated files.
  const clean = spawnSync(process.execPath, [PREPARE_SCRIPT, 'clean', '--project', project], { encoding: 'utf8' });
  assert.equal(clean.status, 0, clean.stderr);
  assert.equal(fs.existsSync(path.join(project, '.omp')), false);
});

test('agents refuses bad or repeated variant names, refs without a plan reviewer, and unknown full-only names', (t) => {
  const fixture = variantRepo(t);
  const { root, repo, project } = fixture;
  const options = variantOptions(fixture);
  const badName = (name) => `--variants: the variant name ${name} has a character other than a-z and 0-9`;
  const refusals = [
    [{ variants: 'A=v16', 'full-only': undefined }, badName('A')],
    [{ variants: 'a-b=v16', 'full-only': undefined }, badName('a-b')],
    [{ variants: '16=v16,16=cand-a' }, '--variants: the variant name 16 occurs two times'],
    [{ variants: '16=v16,a=bare' }, 'plugins/plan-lifecycle/agents/plan-reviewer.md does not exist at bare'],
    [{ 'full-only': '16,b' }, '--full-only names b, which is not a variant'],
  ];
  for (const [change, message] of refusals) {
    assert.throws(() => prepare.prepareAgents({ ...options, ...change }, repo), new RegExp(escapeRegExp(message)));
    // agents refuses before it writes a file of the project.
    assert.equal(fs.existsSync(path.join(project, '.omp')), false);
  }
  // The command line takes both options.
  const cli = (...args) =>
    spawnSync(
      process.execPath,
      [
        PREPARE_SCRIPT,
        'agents',
        '--baseline-ref',
        'HEAD',
        '--model',
        MODEL,
        '--efforts',
        'low',
        '--tiers',
        'default',
        '--baseline-dir',
        path.join(root, 'cli-baseline-plugin'),
        '--project',
        project,
        ...args,
      ],
      { encoding: 'utf8' },
    );
  const twice = cli('--variants', 'a=HEAD,a=HEAD');
  assert.equal(twice.status, 1, twice.stderr);
  assert.match(twice.stderr, /--variants: the variant name a occurs two times/);
  const notVariant = cli('--variants', 'a=HEAD', '--full-only', 'b');
  assert.equal(notVariant.status, 1, notVariant.stderr);
  assert.match(notVariant.stderr, /--full-only names b, which is not a variant/);
  assert.equal(fs.existsSync(path.join(project, '.omp')), false);
});

test('case builds variant arms in full mode, and in delta mode on plan-delta cases unless full only', (t) => {
  const { root, repo, base, head } = loopRepo(t);
  const ws = path.join(root, 'ws');
  const cases = path.join(root, 'cases');
  const project = path.join(root, 'project');
  const configsFile = '.omp/agents/review-bench-configs.json';
  const variants = [
    { name: '16', ref: 'v16', sha: base, delta: false },
    { name: 'a', ref: 'cand-a', sha: head, delta: true },
  ];
  put(project, configsFile, { configs: [CONFIGS.low], fixer: FIXER_SETTING, variants });
  const planCase = {
    id: 'plan-3',
    kind: 'plan',
    split: 'dev',
    issue: 3,
    round: 1,
    plan: 'plan-3-plan.md',
    repo_ref: head,
  };
  const deltaCase = {
    id: 'plan-4',
    kind: 'plan-delta',
    split: 'dev',
    issue: 4,
    round: 2,
    plan: 'plan-4-plan.md',
    repo_ref: head,
    previous_body: 'plan-4-previous.md',
    previous_review: 'plan-4-review.md',
  };
  const codeCase = { id: 'code-7', kind: 'code', split: 'dev', issue: 7, round: 1, plan: 'code-7-plan.md', base, head };
  const codeDeltaCase = {
    id: 'code-8',
    kind: 'code-delta',
    split: 'dev',
    issue: 8,
    round: 2,
    plan: 'code-8-plan.md',
    base,
    head,
    delta_base: base,
    previous_review: 'code-8-review.md',
  };
  for (const caseData of [planCase, deltaCase, codeCase, codeDeltaCase]) {
    caseData.known = [];
    put(cases, `dev/${caseData.id}.json`, caseData);
    put(cases, `dev/${caseData.plan}`, `# Plan ${caseData.issue}\n\nStep 1 and step 2.\n`);
  }
  put(cases, 'dev/plan-4-previous.md', '# Plan 4\n\nStep 1.\n');
  put(cases, 'dev/plan-4-review.md', PLAN_BLOCK.replace('round 2', 'round 1'));
  put(cases, 'dev/code-8-review.md', FULL_BLOCK);
  const options = (id, arms) => ({
    case: path.join(cases, 'dev', `${id}.json`),
    arms,
    runs: '1',
    out: ws,
    configs: 'low',
    project,
  });
  const refuses = (id, arms, message) => assert.throws(() => prepare.prepareCase(options(id, arms), repo), message);
  // The variant arms of the list of configurations join the arms of the plan kinds.
  refuses('plan-3', 'Vb', /arm Vb does not apply to plan cases; use P0, P1, V16, Va$/);
  refuses('plan-4', 'Vb', /arm Vb does not apply to plan-delta cases; use P0, Pd, V16, Va$/);
  // Code and code-delta cases take no variant arm.
  for (const arm of ['V16', 'Va']) {
    refuses('code-7', arm, new RegExp(`arm ${arm} does not apply to code cases; use B0, B1, B3, C1, C3, S1, S3$`));
    refuses('code-8', arm, new RegExp(`arm ${arm} does not apply to code-delta cases; use B0, Bd, Cd$`));
  }
  // A list of configurations without variants gives no variant arm.
  put(project, configsFile, { configs: [CONFIGS.low], fixer: FIXER_SETTING });
  refuses('plan-3', 'Va', /arm Va does not apply to plan cases; use P0, P1$/);
  for (const id of ['plan-3', 'plan-4', 'code-7', 'code-8']) assert.equal(fs.existsSync(path.join(ws, id)), false);

  put(project, configsFile, { configs: [CONFIGS.low], fixer: FIXER_SETTING, variants });
  prepare.prepareCase(options('plan-3', 'P1,V16,Va'), repo);
  prepare.prepareCase(options('plan-4', 'V16,Va'), repo);
  // The prompt of a static arm at the configuration low, without its agent line.
  const promptOf = (caseData, arm) => {
    const paths = prepare.workspacePaths(path.join(ws, caseData.id), caseData);
    const file = prepare.buildPromptFile({ caseData, arm, config: 'low', reviewer: 'plan', paths });
    return file.split('\n').slice(2).join('\n');
  };
  // The one prompt file of a run at the configuration low.
  const built = (caseId, arm) => {
    const runDir = path.join(ws, caseId, `${arm}-low`, 'run-1');
    assert.deepEqual(fs.readdirSync(path.join(runDir, 'prompts')), ['plan.txt']);
    assert.deepEqual(readJson(path.join(runDir, 'meta.json')).config, CONFIGS.low);
    return promptFileParts(path.join(runDir, 'prompts', 'plan.txt'));
  };
  // On a plan case, each variant gets the full-mode prompt of P1 with its own agent.
  const full = promptOf(planCase, 'P1');
  assert.ok(full.split('\n').includes('Round mode: full.'));
  assert.deepEqual(built('plan-3', 'P1'), { agent: 'agent: review-bench-candidate-plan-low', body: full });
  assert.deepEqual(built('plan-3', 'V16'), { agent: 'agent: review-bench-variant-16-plan-low', body: full });
  assert.deepEqual(built('plan-3', 'Va'), { agent: 'agent: review-bench-variant-a-plan-low', body: full });
  // On a plan-delta case, Va gets the delta-mode prompt of Pd. V16 has no delta mode, so it gets the full-mode prompt
  // of P0.
  const deltaPaths = prepare.workspacePaths(path.join(ws, 'plan-4'), deltaCase);
  const delta = promptOf(deltaCase, 'Pd');
  assert.ok(delta.split('\n').includes('Round mode: delta.'));
  assert.ok(delta.split('\n').includes(`Plan diff: ${deltaPaths.planDiff}`));
  assert.ok(fs.existsSync(deltaPaths.planDiff));
  assert.deepEqual(built('plan-4', 'Va'), { agent: 'agent: review-bench-variant-a-plan-low', body: delta });
  const deltaFull = promptOf(deltaCase, 'P0');
  assert.ok(deltaFull.split('\n').includes('Round mode: full.'));
  assert.deepEqual(built('plan-4', 'V16'), { agent: 'agent: review-bench-variant-16-plan-low', body: deltaFull });
  assert.deepEqual(
    namesCommand(ws)
      .map((entry) => entry.name)
      .sort(),
    ['Plan3P1LowR1Plan', 'Plan3V16LowR1Plan', 'Plan3VaLowR1Plan', 'Plan4V16LowR1Plan', 'Plan4VaLowR1Plan'],
  );
});

test('transcripts lets a variant reviewer read its own plugin root and no other variant root', (t) => {
  const fixture = variantRepo(t);
  const { root, repo, agentDir } = fixture;
  prepare.prepareAgents(variantOptions(fixture), repo);
  const agent = 'review-bench-variant-a-plan-low';
  const agentFile = path.join(agentDir, `${agent}.md`);
  assert.ok(fs.existsSync(agentFile), `agents wrote no ${agent}.md`);
  const ws = path.join(root, 'ws');
  const sessions = path.join(root, 'sessions');
  const caseDir = path.join(ws, 'plan-3');
  const run = path.join(caseDir, 'Va-low', 'run-1');
  put(caseDir, 'case.json', { id: 'plan-3', kind: 'plan', split: 'dev' });
  put(caseDir, 'plan.md', '# Plan 3\n');
  put(run, 'prompts/plan.txt', `agent: ${agent}\n\nReview.\n`);
  put(run, 'meta.json', { config: CONFIGS.low });
  const own = variantRoot(root, 'a');
  const other = variantRoot(root, '16');
  const ownReads = [
    ['read', { path: `${own}/skills/productivity/plan-reviewer/SKILL.md` }],
    ['read', { path: `${own}/${VARIANT_DELTA}:1-40` }],
    ['glob', { path: `${own}/skills/productivity/plan-reviewer/references/*.md` }],
    ['read', { path: `${own}/agents/plan-reviewer.md` }],
    ['read', { path: `${own}/skills/productivity/plan-manager/references/plan-contract.md` }],
  ];
  // The skill and the agent file of the other variant, and the skill of the live checkout.
  const outside = [
    `${other}/skills/productivity/plan-reviewer/SKILL.md`,
    `${other}/agents/plan-reviewer.md`,
    `${LIVE_PLUGIN}/skills/productivity/plan-reviewer/SKILL.md`,
  ];
  const calls = [...ownReads, ...outside.map((target) => ['read', { path: target }])];
  // The system prompt of the transcript holds the text of the variant agent.
  const transcript = toolTranscript(caseDir, 30, calls, agent)
    .split('\n')
    .map((line) => {
      const entry = JSON.parse(line);
      if (entry.type === 'session_init') entry.systemPrompt = ['You are a coding assistant.', readText(agentFile)];
      return JSON.stringify(entry);
    })
    .join('\n');
  put(sessions, 'Plan3VaLowR1Plan.jsonl', transcript);
  assert.deepEqual(transcriptsCommand(ws, sessions), ['Plan3VaLowR1Plan']);
  assert.deepEqual(readJson(path.join(run, 'meta.json')).reviewers.plan.readScope, { outside });
});

test('report --reference compares every arm column with the named folder instead of the best one', (t) => {
  const { ws, cases } = roundWorkspace(t, [
    {
      config: CONFIGS.low,
      run: 1,
      rounds: [
        [FULL_BLOCK, 100, 1000, 'full'],
        [PASS_ROUND, 40, 400, 'delta'],
      ],
    },
    { config: CONFIGS['low-fast'], run: 1, rounds: [[PASS_ROUND.replace('round 2', 'round 1'), 50, 500, 'full']] },
  ]);
  findingsCommand(ws);
  main(['pairs', ws, '--cases', cases]);
  judgeAll(ws, (_, known) => (known === 'D1' ? 'match' : 'no'));
  const arms = ['C1-low-fast', 'C1-low'];
  const report = () => readText(path.join(ws, 'report.md'));
  const fewest = 'The reference column has the fewest escaped defects per 50 known defects.';
  // The shared-cases row and the three interval rows end the decision table.
  const compared = () => tableAfter(report(), '### Decision: dev').slice(-4);
  // C1-low finds D1 and escapes the fewest, so it is the reference by default.
  reportCommand(ws, { arms });
  assert.equal(compared()[0], '| Cases shared with C1-low | 1 | - |');
  assert.ok(report().includes(fewest));
  const named = [
    '| Cases shared with C1-low-fast | - | 1 |',
    '| Round 1 recall difference from C1-low-fast, 90% interval | - | [0.33, 0.33] |',
    '| Escaped per 50 known difference from C1-low-fast, 90% interval | - | [-16.67, -16.67] |',
    '| Loop seconds difference from C1-low-fast, 90% interval | - | [90.0, 90.0] |',
  ];
  reportCommand(ws, { arms, reference: 'C1-low-fast' });
  assert.deepEqual(compared(), named);
  assert.equal(report().includes(fewest), false);
  assert.ok(report().includes('The reference column is C1-low-fast.'));
  // The command line takes the same option.
  reportCommand(ws, { arms });
  assert.equal(main(['report', ws, '--arms', arms.join(','), '--reference', 'C1-low-fast']), 'report.md: 2 runs');
  assert.deepEqual(compared(), named);
});

test('a case with show_benchmark gets the benchmark skill folder without its cases folder in the snapshot', (t) => {
  isolateGit(t);
  const root = neutralScratch(t);
  const repo = path.join(root, 'repo');
  const ws = path.join(root, 'ws');
  const cases = path.join(root, 'cases');
  const project = path.join(root, 'project');
  // The scripts hide the skill folder of the repository that holds them, so this test runs a copy of them in a
  // repository with a benchmark skill folder. score.mjs imports the plan helper of plan-lifecycle.
  const skill = '.agents/skills/review-benchmark';
  const helper = 'plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/plan.mjs';
  const live = path.join(import.meta.dirname, '../../..');
  for (const file of [`${skill}/scripts/prepare.mjs`, `${skill}/scripts/score.mjs`, helper]) {
    put(repo, file, readText(path.join(live, file)));
  }
  put(repo, `${skill}/SKILL.md`, '# Review benchmark\n');
  put(repo, `${skill}/results.md`, '# Results\n');
  put(repo, `${skill}/cases/dev/plan-1.json`, { id: 'plan-1', kind: 'plan', split: 'dev', known: [] });
  put(repo, `${skill}/cases/heldout/plan-2.key.json`, { known: PLAN_KEY });
  put(repo, '.agents/skills/other/SKILL.md', '# Other\n');
  put(repo, 'README.md', '# Demo\n');
  gitIn(repo, 'init', '-q', '-b', 'main');
  gitIn(repo, 'add', '-A');
  gitIn(repo, 'commit', '-q', '-m', 'skill');
  const head = gitIn(repo, 'rev-parse', 'HEAD').trim();
  put(project, '.omp/agents/review-bench-configs.json', { configs: [CONFIGS.low] });
  const script = path.join(repo, skill, 'scripts', 'prepare.mjs');
  for (const [id, field] of [
    ['plan-5', { show_benchmark: true }],
    ['plan-6', {}],
  ]) {
    const caseData = { id, kind: 'plan', split: 'dev', issue: 5, round: 1, plan: `${id}-plan.md`, repo_ref: head };
    put(cases, `dev/${id}.json`, { ...caseData, known: [], ...field });
    put(cases, `dev/${id}-plan.md`, '# Plan 5\n');
    const args = ['--case', path.join(cases, 'dev', `${id}.json`), '--arms', 'P1', '--runs', '1', '--out', ws];
    const build = spawnSync(process.execPath, [script, 'case', ...args, '--project', project], { encoding: 'utf8' });
    assert.equal(build.status, 0, build.stderr);
  }
  const snapshotFiles = (id) => {
    const dir = path.join(ws, id, 'snapshot');
    return filesUnder(dir)
      .map((file) => path.relative(dir, file).split(path.sep).join('/'))
      .sort();
  };
  // The skill folder shows its files, and its cases folder with the keys stays out.
  assert.deepEqual(snapshotFiles('plan-5'), [
    '.agents/skills/other/SKILL.md',
    `${skill}/SKILL.md`,
    `${skill}/results.md`,
    `${skill}/scripts/prepare.mjs`,
    `${skill}/scripts/score.mjs`,
    'README.md',
    helper,
  ]);
  // Without the field, the whole skill folder stays out.
  assert.deepEqual(snapshotFiles('plan-6'), ['.agents/skills/other/SKILL.md', 'README.md', helper]);
});

// Plan #109 step 9: API note for the tests below (decision 2, and the refusals of code review round 1).
//
// prepare.mjs:
// - prepareAgents takes `contract-overlay` (`--contract-overlay <name,...>`): variants of `variants` whose commit
//   changes plugins/plan-lifecycle/skills/productivity/plan-manager/references/plan-contract.md against its first
//   parent. The entry of such a variant in the list of configurations gets `contractDiff`, the git diff of that file
//   from the first parent to the commit. Before it extracts a plugin or writes a file of the project, agents refuses: a
//   name of --full-only or --contract-overlay that is not a variant, or one of these options without --variants; an
//   empty or malformed --variants entry, and an empty --full-only; a commit that does not change the contract; plugin
//   copies that would go to one folder (a --baseline-dir that is the folder of a variant copy); and a variant agent
//   that does not name its own reviewer skill.
// - prepareCase writes, for each run of a variant arm with `contractDiff`, `run-<k>/plan-contract.md`: the contract of
//   the snapshot with the diff applied by `git apply`. The meta.json of the run gets `contractOverlay`: `applied`, or
//   `not applicable` when the diff does not apply and the contract of the snapshot holds no line that the diff removes,
//   blank lines aside (the copy then holds the contract of the snapshot). When the diff does not apply to a contract
//   that holds a removed line, case stops with `the contract change does not apply to <snapshot contract> for the run
//   <run folder>: <message of git>` and writes nothing for the case. The prompt of the run tells the reviewer to read
//   the plan contract at the copy and every other repository file under the snapshot root. A snapshot without the
//   contract stops the command.
// - prepareCase takes `extend` (`--extend`): the case folder exists and holds the same case.json, and case adds the
//   arm folders and keeps every other file. It refuses an arm folder that exists, a missing case folder, and a case
//   folder of another case file. A failed call removes only the arm folders that it wrote.
// score.mjs:
// - readScope allows `<run folder>/plan-contract.md` of its own run, also when the case changes the plan contract.
// - reportCommand refuses an empty `reference`.
// - reviewerPluginRoots, and the agent files that transcripts finds in a system prompt, take an instruction path in
//   backticks or quotes up to the closing quote, so the path can hold spaces. A bare path ends at the first space. So
//   `agents --variants` takes an --out folder whose parent has a space in its path.

const CONTRACT = 'plugins/plan-lifecycle/skills/productivity/plan-manager/references/plan-contract.md';
// The prompt rule that sends the reviewer to the snapshot root for the plan contract, and the rule of a run with a
// contract overlay, which sends the reviewer to the copy `copy`.
const SNAPSHOT_CONTRACT_RULE =
  '- Your own instruction files are your agent file and the files of your own skill folder. Read every other file, including the plan contract and other skills, under the snapshot root.';
const copyContractRule = (copy) =>
  `- Your own instruction files are your agent file and the files of your own skill folder. Read the plan contract at ${copy}. Read every other repository file, including other skills, under the snapshot root.`;
// The refusal of a contract overlay on the snapshot `snapshot`, which has no plan contract.
const noContract = (snapshot) => `${snapshot} has no ${CONTRACT}, so the contract overlay has no contract to change`;

// Each file and folder under `dir`, without the .git folders: one key per path relative to `dir`, with the text of a
// file, or '' for a folder, whose key ends with `/`. A refusal leaves this state as it was.
function treeState(dir) {
  const state = {};
  const walk = (folder) => {
    for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
      if (entry.name === '.git') continue;
      const file = path.join(folder, entry.name);
      const key = path.relative(dir, file).split(path.sep).join('/');
      if (entry.isDirectory()) {
        state[`${key}/`] = '';
        walk(file);
      } else {
        state[key] = readText(file);
      }
    }
  };
  if (fs.existsSync(dir)) walk(dir);
  return state;
}

// The variant repository after `agents` with the variants 16 and a (cand-a, with a contract overlay), and the case
// files of the overlay tests: plan-3 at v16, whose contract the contract change of cand-a applies to; plan-4, a
// plan-delta case at the last commit, whose contract does not hold the text that the change changes; plan-5 at bare,
// which has no contract; and code-7 from bare to v16. `options(id, arms, more)` gives the options of `case` for one run
// at the configuration low.
function overlayFixture(t) {
  const fixture = variantRepo(t);
  const { root, repo, project, shas } = fixture;
  prepare.prepareAgents({ ...variantOptions(fixture), 'contract-overlay': 'a' }, repo);
  const ws = path.join(root, 'ws');
  const cases = path.join(root, 'cases');
  const planCase = (id, repoRef) => ({
    id,
    kind: 'plan',
    split: 'dev',
    issue: 3,
    round: 1,
    plan: `${id}-plan.md`,
    repo_ref: repoRef,
    known: [],
  });
  const caseFiles = [
    planCase('plan-3', shas.v16),
    {
      ...planCase('plan-4', gitIn(repo, 'rev-parse', 'HEAD').trim()),
      kind: 'plan-delta',
      round: 2,
      previous_body: 'plan-4-previous.md',
      previous_review: 'plan-4-review.md',
    },
    planCase('plan-5', shas.bare),
    {
      id: 'code-7',
      kind: 'code',
      split: 'dev',
      issue: 7,
      round: 1,
      plan: 'code-7-plan.md',
      base: shas.bare,
      head: shas.v16,
      known: [],
    },
  ];
  for (const caseData of caseFiles) {
    put(cases, `dev/${caseData.id}.json`, caseData);
    put(cases, `dev/${caseData.plan}`, `# Plan ${caseData.issue}\n\nStep 1 and step 2.\n`);
  }
  put(cases, 'dev/plan-4-previous.md', '# Plan 3\n\nStep 1.\n');
  put(cases, 'dev/plan-4-review.md', PLAN_BLOCK.replace('round 2', 'round 1'));
  const options = (id, arms, more = {}) => ({
    case: path.join(cases, 'dev', `${id}.json`),
    arms,
    runs: '1',
    out: ws,
    configs: 'low',
    project,
    ...more,
  });
  return { root, repo, project, ws, cases, caseFiles, options };
}

test('agents --contract-overlay records the contract change of a variant against its first parent', (t) => {
  const fixture = variantRepo(t);
  const { repo, agentDir, shas } = fixture;
  prepare.prepareAgents({ ...variantOptions(fixture), 'contract-overlay': 'a' }, repo);
  const change = gitIn(repo, 'diff', '--no-color', 'cand-a^1', 'cand-a', '--', CONTRACT);
  assert.match(change, /^-# Plan contract 0\.16\.0\n\+# Plan contract A$/m);
  assert.deepEqual(readJson(path.join(agentDir, 'review-bench-configs.json')).variants, [
    { name: '16', ref: 'v16', sha: shas.v16, delta: false },
    { name: 'a', ref: 'cand-a', sha: shas['cand-a'], delta: true, contractDiff: change },
  ]);
});

test('agents refuses colliding plugin copies, bad variant options, and unusable refs before it writes', (t) => {
  const fixture = variantRepo(t);
  const { root, repo, project } = fixture;
  const tagCommit = (tag, files) => {
    for (const [file, content] of Object.entries(files)) put(repo, file, content);
    gitIn(repo, 'add', '-A');
    gitIn(repo, 'commit', '-q', '--allow-empty', '-m', tag);
    gitIn(repo, 'tag', tag);
  };
  // A commit that does not change the plan contract, an agent that names no reviewer skill, and an agent that also
  // names the reviewer skill of another plugin root.
  const agentFile = 'plugins/plan-lifecycle/agents/plan-reviewer.md';
  const noSkill = '---\nname: plan-reviewer\ndescription: Reviews plans.\n---\n\n# Plan Reviewer\n';
  const otherRoot = `${variantAgentText('other')}Also load \`/opt/x/skills/productivity/plan-reviewer/SKILL.md\`.\n`;
  tagCommit('same-contract', {});
  tagCommit('no-skill', { [agentFile]: noSkill });
  tagCommit('other-root', { [agentFile]: otherRoot });
  const ownSkill = (ref) =>
    `variant a: plugins/plan-lifecycle/agents/plan-reviewer.md at ${ref} must name its reviewer skill as \${CLAUDE_PLUGIN_ROOT}/skills/<folder>/plan-reviewer/SKILL.md and name no other plugin root`;
  const refusals = [
    // A variant copy in the folder of the baseline copy would replace the baseline plugin of the baseline agents.
    [
      { 'baseline-dir': variantRoot(root, 'a') },
      `the baseline copy and the copy of variant a both go to ${variantRoot(root, 'a')}; give another --baseline-dir`,
    ],
    [{ variants: '' }, '--variants has an empty entry: '],
    [{ variants: '16=v16,' }, '--variants has an empty entry: 16=v16,'],
    [{ variants: '16=v16,a' }, '--variants: a is not <name>=<git ref>'],
    [{ variants: '16=v16,=cand-a' }, '--variants: =cand-a is not <name>=<git ref>'],
    [{ variants: '16=v16,a=' }, '--variants: a= is not <name>=<git ref>'],
    [{ 'full-only': '' }, '--full-only has an empty entry: '],
    [{ variants: undefined }, '--full-only names variants of --variants; give --variants too'],
    [
      { variants: undefined, 'full-only': undefined, 'contract-overlay': 'a' },
      '--contract-overlay names variants of --variants; give --variants too',
    ],
    [{ 'contract-overlay': '16,b' }, '--contract-overlay names b, which is not a variant'],
    [
      { variants: '16=v16,a=same-contract', 'contract-overlay': 'a' },
      `variant a: same-contract does not change ${CONTRACT} against its first parent; leave it out of --contract-overlay`,
    ],
    [{ variants: '16=v16,a=no-skill' }, ownSkill('no-skill')],
    [{ variants: '16=v16,a=other-root' }, ownSkill('other-root')],
  ];
  const options = variantOptions(fixture);
  const state = treeState(root);
  for (const [change, message] of refusals) {
    assert.throws(() => prepare.prepareAgents({ ...options, ...change }, repo), { message });
    // agents refuses before it extracts a plugin copy or writes a file of the project.
    assert.deepEqual(treeState(root), state);
  }
  // The command line takes --contract-overlay.
  const args = ['--baseline-ref', 'HEAD', '--model', MODEL, '--efforts', 'low', '--tiers', 'default'];
  const cliArgs = [...args, '--baseline-dir', path.join(root, 'cli-baseline-plugin'), '--project', project];
  const overlayOnly = [PREPARE_SCRIPT, 'agents', ...cliArgs, '--contract-overlay', 'a'];
  const cli = spawnSync(process.execPath, overlayOnly, { encoding: 'utf8' });
  assert.equal(cli.status, 1, cli.stderr);
  assert.match(cli.stderr, /--contract-overlay names variants of --variants; give --variants too/);
  assert.deepEqual(treeState(root), state);
});

test('agents --variants takes an --out folder whose parent has a space and keeps the same-root check', (t) => {
  const fixture = variantRepo(t);
  const { root, repo, agentDir } = fixture;
  const skill = 'skills/productivity/plan-reviewer/SKILL.md';
  // Without --baseline-dir, the plugin copies go to the parent of --out, whose path has a space.
  const parent = path.join(root, 'review runs');
  const options = { ...variantOptions(fixture), 'baseline-dir': undefined, out: path.join(parent, 'heldout') };
  prepare.prepareAgents(options, repo);
  assert.ok(fs.existsSync(path.join(parent, 'baseline-plugin', skill)));
  for (const name of Object.keys(VARIANT_REFS)) {
    const pluginRoot = path.join(parent, `variant-${name}-plugin`);
    assert.ok(fs.existsSync(path.join(pluginRoot, skill)));
    for (const config of ['low', 'xhigh']) {
      const text = readText(path.join(agentDir, `review-bench-variant-${name}-plan-${config}.md`));
      assert.ok(text.includes(`\`${pluginRoot}/${skill}\``));
      // The read scope takes the plugin root with its space from the path in backticks.
      assert.deepEqual(score.reviewerPluginRoots(text), [pluginRoot]);
    }
  }
  // A path in quotes can hold a space too. A bare path ends at the first space, so it names no root here.
  const text = [`Load "/opt/q r/${skill}" and '/opt/s/${skill}',`, `then /opt/t/${skill}, not /opt/u v/${skill}.`];
  assert.deepEqual(score.reviewerPluginRoots(text.join('\n')), ['/opt/q r', '/opt/s', '/opt/t']);
  // An agent that also names the reviewer skill of another plugin root, whose path has a space, stays refused.
  const agentFile = 'plugins/plan-lifecycle/agents/plan-reviewer.md';
  put(repo, agentFile, `${variantAgentText('other')}Also load \`/opt/review x/${skill}\`.\n`);
  gitIn(repo, 'add', '-A');
  gitIn(repo, 'commit', '-q', '-m', 'other root');
  gitIn(repo, 'tag', 'other-space');
  const message = `variant a: ${agentFile} at other-space must name its reviewer skill as \${CLAUDE_PLUGIN_ROOT}/skills/<folder>/plan-reviewer/SKILL.md and name no other plugin root`;
  assert.throws(() => prepare.prepareAgents({ ...options, variants: '16=v16,a=other-space' }, repo), { message });
});

// B1 and B0 describe the lens or review the whole diff again, as the released reviewer of plan #98 needed. B3 and Bd
// give the baseline reviewer the prompt of the candidate arms, so a comparison measures only the reviewer files (#113).
test('the B3 and Bd arms give the baseline reviewer the prompts of the C3 and Cd arms', () => {
  assert.ok(prepare.ARMS.code.B3, 'code cases have no B3 arm');
  assert.ok(prepare.ARMS['code-delta'].Bd, 'code-delta cases have no Bd arm');
  const focus = Object.fromEntries(prepare.LENSES.map((lens) => [lens, `/ws/code-7/focus-${lens}.diff`]));
  const panelCase = { id: 'code-7', kind: 'code', issue: 7, round: 1 };
  const panelPaths = {
    snapshot: '/ws/code-7/snapshot',
    plan: '/ws/code-7/plan.md',
    fullDiff: '/ws/code-7/full.diff',
    focus,
  };
  const prompt = (caseData, arm, reviewer, paths) => {
    const [agent, , ...body] = prepare.buildPromptFile({ caseData, arm, config: 'low', reviewer, paths }).split('\n');
    return { agent, body: body.join('\n') };
  };
  for (const lens of prepare.LENSES) {
    const [baseline, candidate] = ['B3', 'C3'].map((arm) => prompt(panelCase, arm, lens, panelPaths));
    assert.equal(baseline.agent, 'agent: review-bench-baseline-code-low');
    assert.equal(candidate.agent, 'agent: review-bench-candidate-code-low');
    assert.equal(baseline.body, candidate.body, `the B3 ${lens} prompt differs from the C3 prompt`);
  }
  const deltaCase = { id: 'code-8', kind: 'code-delta', issue: 8, round: 2 };
  const deltaPaths = {
    snapshot: '/ws/code-8/snapshot',
    plan: '/ws/code-8/plan.md',
    deltaDiff: '/ws/code-8/delta.diff',
    previousReview: '/ws/code-8/previous-review.md',
  };
  const [baseline, candidate] = ['Bd', 'Cd'].map((arm) => prompt(deltaCase, arm, 'delta', deltaPaths));
  assert.equal(baseline.agent, 'agent: review-bench-baseline-code-low');
  assert.equal(baseline.body, candidate.body);
  assert.ok(baseline.body.split('\n').includes('Round mode: delta.'));
});

test('case gives each run of an overlay variant a contract copy, its record, and a prompt that names the copy', (t) => {
  const { repo, ws, options } = overlayFixture(t);
  prepare.prepareCase(options('plan-3', 'P1,V16,Va', { runs: '2' }), repo);
  prepare.prepareCase(options('plan-4', 'Pd,Va'), repo);
  const runDir = (caseId, arm, run = 1) => path.join(ws, caseId, `${arm}-low`, `run-${run}`);
  const prompt = (caseId, arm, run = 1) => promptFileParts(path.join(runDir(caseId, arm, run), 'prompts', 'plan.txt'));
  // A run without a contract overlay gets no copy, and its prompt sends the reviewer to the snapshot root.
  const p1 = prompt('plan-3', 'P1').body;
  assert.ok(p1.split('\n').includes(SNAPSHOT_CONTRACT_RULE));
  for (const arm of ['P1', 'V16']) {
    for (const run of [1, 2]) {
      assert.equal(fs.existsSync(path.join(runDir('plan-3', arm, run), 'plan-contract.md')), false);
      assert.deepEqual(readJson(path.join(runDir('plan-3', arm, run), 'meta.json')), { config: CONFIGS.low });
    }
  }
  assert.equal(prompt('plan-3', 'V16').body, p1);
  // The contract change of cand-a applies to the contract of v16. Each run gets a copy of its own, and its prompt names
  // that copy as the plan contract.
  for (const run of [1, 2]) {
    const copy = path.join(runDir('plan-3', 'Va', run), 'plan-contract.md');
    assert.equal(readText(copy), '# Plan contract A\n');
    const meta = readJson(path.join(runDir('plan-3', 'Va', run), 'meta.json'));
    assert.deepEqual(meta, { config: CONFIGS.low, contractOverlay: 'applied' });
    assert.deepEqual(prompt('plan-3', 'Va', run), {
      agent: 'agent: review-bench-variant-a-plan-low',
      body: p1.replace(SNAPSHOT_CONTRACT_RULE, copyContractRule(copy)),
    });
  }
  // git apply changed the copy, not the snapshot.
  assert.equal(readText(path.join(ws, 'plan-3', 'snapshot', CONTRACT)), '# Plan contract 0.16.0\n');
  // The contract of the last commit does not hold the text that the change changes. The copy then holds the contract
  // of the snapshot, and the delta-mode prompt of Pd names the copy.
  const deltaCopy = path.join(runDir('plan-4', 'Va'), 'plan-contract.md');
  assert.equal(readText(deltaCopy), '# Plan contract live\n');
  assert.equal(readText(path.join(ws, 'plan-4', 'snapshot', CONTRACT)), '# Plan contract live\n');
  const deltaMeta = readJson(path.join(runDir('plan-4', 'Va'), 'meta.json'));
  assert.deepEqual(deltaMeta, { config: CONFIGS.low, contractOverlay: 'not applicable' });
  const pd = prompt('plan-4', 'Pd').body;
  assert.ok(pd.split('\n').includes('Round mode: delta.'));
  assert.equal(prompt('plan-4', 'Va').body, pd.replace(SNAPSHOT_CONTRACT_RULE, copyContractRule(deltaCopy)));
  // A snapshot without the plan contract gives the overlay no contract to change, so case stops and writes no folder.
  const message = noContract(path.join(ws, 'plan-5', 'snapshot'));
  assert.throws(() => prepare.prepareCase(options('plan-5', 'P1,Va'), repo), { message });
  assert.equal(fs.existsSync(path.join(ws, 'plan-5')), false);
});

// A candidate code reviewer can change the plan contract too, which the reviewer reads. `--candidate-contract-overlay`
// records the change from the baseline ref to the working tree, and each run of a candidate code arm gets a copy of
// the snapshot's contract with that change; the baseline arms keep the snapshot's contract (#113).
test('agents --candidate-contract-overlay gives the runs of candidate code arms the working-tree contract change', (t) => {
  const fixture = variantRepo(t);
  const { root, repo, project, agentDir, shas } = fixture;
  // The working tree changes the contract against the baseline ref v16.
  put(repo, CONTRACT, '# Plan contract working tree\n');
  const agentOptions = { ...variantOptions(fixture), 'candidate-contract-overlay': true };
  prepare.prepareAgents(agentOptions, repo);
  const change = gitIn(repo, 'diff', '--no-color', 'v16', '--', CONTRACT);
  assert.match(change, /^-# Plan contract 0\.16\.0\n\+# Plan contract working tree$/m);
  assert.equal(readJson(path.join(agentDir, 'review-bench-configs.json')).candidateContractDiff, change);
  const ws = path.join(root, 'ws');
  const cases = path.join(root, 'cases');
  const codeCase = { id: 'code-7', kind: 'code', split: 'dev', issue: 7, round: 1, plan: 'code-7-plan.md' };
  put(cases, 'dev/code-7.json', { ...codeCase, base: shas.bare, head: shas.v16, known: [] });
  put(cases, 'dev/code-7-plan.md', '# Plan 7\n\nStep 1.\n');
  const caseOptions = { case: path.join(cases, 'dev', 'code-7.json'), runs: '1', out: ws, configs: 'low', project };
  prepare.prepareCase({ ...caseOptions, arms: 'B3,C3' }, repo);
  const runDir = (arm) => path.join(ws, 'code-7', `${arm}-low`, 'run-1');
  const copy = path.join(runDir('C3'), 'plan-contract.md');
  assert.equal(readText(copy), '# Plan contract working tree\n');
  assert.deepEqual(readJson(path.join(runDir('C3'), 'meta.json')), { config: CONFIGS.low, contractOverlay: 'applied' });
  assert.equal(fs.existsSync(path.join(runDir('B3'), 'plan-contract.md')), false);
  for (const lens of prepare.LENSES) {
    const [baseline, candidate] = ['B3', 'C3'].map(
      (arm) => promptFileParts(path.join(runDir(arm), 'prompts', `${lens}.txt`)).body,
    );
    assert.ok(baseline.split('\n').includes(SNAPSHOT_CONTRACT_RULE));
    assert.equal(candidate, baseline.replace(SNAPSHOT_CONTRACT_RULE, copyContractRule(copy)));
  }
  // Without a working-tree change, the option has nothing to record, so agents stops before it writes.
  put(repo, CONTRACT, '# Plan contract 0.16.0\n');
  assert.throws(() => prepare.prepareAgents(agentOptions, repo), {
    message: `agents --candidate-contract-overlay: the working tree does not change ${CONTRACT} against v16`,
  });
});

test('case records not applicable only without the removed text and else stops with the git message', (t) => {
  const fixture = variantRepo(t);
  const { root, repo, project } = fixture;
  const contract = (...rules) => `# Plan contract\n\n${rules.join('\n\n')}\n`;
  const commitContract = (tag, text) => {
    put(repo, CONTRACT, text);
    gitIn(repo, 'add', '-A');
    gitIn(repo, 'commit', '-q', '-m', tag);
    gitIn(repo, 'tag', tag);
    return gitIn(repo, 'rev-parse', 'HEAD').trim();
  };
  // The contract change of cand-b removes the line `Rule 2.` and a blank line. The contract of `rewritten` does not
  // hold that line, and the contract of `moved` holds it with other context lines. The change applies to neither.
  commitContract('rules', contract('Rule 1.', 'Rule 2.', 'Rule 3.'));
  commitContract('cand-b', contract('Rule 1.', 'Rule 3.'));
  const rewritten = contract('Rule 1.', 'Rule 2 changed.', 'Rule 3.');
  const shas = {
    rewritten: commitContract('rewritten', rewritten),
    moved: commitContract('moved', contract('Rule 2.', 'Rule 1.', 'Rule 3.')),
  };
  const change = gitIn(repo, 'diff', '--no-color', 'cand-b^1', 'cand-b', '--', CONTRACT);
  const removed = change.split('\n').filter((line) => line.startsWith('-') && !line.startsWith('---'));
  assert.deepEqual(removed.sort(), ['-', '-Rule 2.']);
  const agentOptions = { ...variantOptions(fixture), variants: '16=v16,b=cand-b', 'contract-overlay': 'b' };
  prepare.prepareAgents(agentOptions, repo);
  const ws = path.join(root, 'ws');
  const cases = path.join(root, 'cases');
  for (const [id, ref] of [
    ['plan-6', shas.rewritten],
    ['plan-7', shas.moved],
  ]) {
    const caseData = { id, kind: 'plan', split: 'dev', issue: 6, round: 1, plan: `${id}-plan.md`, repo_ref: ref };
    put(cases, `dev/${id}.json`, { ...caseData, known: [] });
    put(cases, `dev/${id}-plan.md`, '# Plan 6\n');
  }
  const options = (id, arms, more = {}) => ({
    case: path.join(cases, 'dev', `${id}.json`),
    arms,
    runs: '1',
    out: ws,
    configs: 'low',
    project,
    ...more,
  });
  const runDir = (id) => path.join(ws, id, 'Vb-low', 'run-1');

  // The text that the change removes is absent, so the run records `not applicable` and its copy holds the contract of
  // the snapshot. The blank line that the change removes does not count as text.
  prepare.prepareCase(options('plan-6', 'P1,Vb'), repo);
  assert.equal(readText(path.join(runDir('plan-6'), 'plan-contract.md')), rewritten);
  const meta = readJson(path.join(runDir('plan-6'), 'meta.json'));
  assert.deepEqual(meta, { config: CONFIGS.low, contractOverlay: 'not applicable' });

  // The contract holds `Rule 2.`, so the failure of git apply is not an absent text: case stops with the message of
  // git, which names the copy, and the run folder, and writes nothing for the case.
  const snapshotContract = path.join(ws, 'plan-7', 'snapshot', CONTRACT);
  const prefix = `the contract change does not apply to ${snapshotContract} for the run ${runDir('plan-7')}: `;
  const stops = (error) => {
    assert.ok(error.message.startsWith(prefix), error.message);
    assert.match(error.message.slice(prefix.length), /plan-contract\.md/);
    return true;
  };
  assert.throws(() => prepare.prepareCase(options('plan-7', 'P1,Vb'), repo), stops);
  assert.equal(fs.existsSync(path.join(ws, 'plan-7')), false);
  // With --extend, case keeps the case folder and the arm folders that exist, and removes the arm folder of Vb.
  prepare.prepareCase(options('plan-7', 'P1'), repo);
  const state = treeState(ws);
  assert.throws(() => prepare.prepareCase(options('plan-7', 'Vb', { extend: true }), repo), stops);
  assert.deepEqual(treeState(ws), state);
});

test('readScope allows the contract copy of its own run, also when the case changes the plan contract', () => {
  const caseDir = `${SCOPE_WS}/plan-3`;
  const runDir = `${caseDir}/Va-low/run-1`;
  const pluginRoot = '/work/variant-a-plugin';
  const scope = { runDir, cwd: LIVE, pluginRoots: [pluginRoot], changedFiles: [CONTRACT] };
  const copy = `${runDir}/plan-contract.md`;
  assert.deepEqual(score.readScope(reads(copy, `${copy}:1-40`), scope), { outside: [] });
  const outside = [
    // The copies of another run and of another arm, and paths that hold no copy.
    `${caseDir}/Va-low/run-2/plan-contract.md`,
    `${caseDir}/Vb-low/run-1/plan-contract.md`,
    `${caseDir}/Va-low/plan-contract.md`,
    `${caseDir}/plan-contract.md`,
    // The case changes the plan contract, so the contract of the plugin root shows a later version.
    `${pluginRoot}/skills/productivity/plan-manager/references/plan-contract.md`,
  ];
  assert.deepEqual(score.readScope(reads(...outside), scope), { outside });
});

test('case --extend adds arm folders to a case folder and keeps its snapshot and its other arm folders', (t) => {
  const { root, repo, project, ws, cases, caseFiles, options } = overlayFixture(t);
  const extend = (id, arms, more = {}) => prepare.prepareCase(options(id, arms, { extend: true, ...more }), repo);
  const caseDir = path.join(ws, 'plan-3');
  prepare.prepareCase(options('plan-3', 'P1'), repo);
  const before = treeState(caseDir);
  extend('plan-3', 'V16,Va');
  const after = treeState(caseDir);
  // Every file and folder stays as it was, and the new ones are the files of the two arm folders.
  for (const [key, text] of Object.entries(before)) assert.equal(after[key], text, key);
  const runFiles = ['', 'run-1/', 'run-1/blocks/', 'run-1/meta.json', 'run-1/prompts/', 'run-1/prompts/plan.txt'];
  const expected = [
    ...runFiles.map((file) => `V16-low/${file}`),
    ...[...runFiles, 'run-1/plan-contract.md'].map((file) => `Va-low/${file}`),
  ];
  const added = Object.keys(after).filter((key) => !Object.hasOwn(before, key));
  assert.deepEqual(added.sort(), expected.sort());
  // The new arms get the prompts of a new case folder: V16 the prompt of P1, and Va that prompt with the rule of its
  // contract copy.
  const prompt = (arm) => promptFileParts(path.join(caseDir, `${arm}-low`, 'run-1', 'prompts', 'plan.txt'));
  const p1 = prompt('P1').body;
  assert.deepEqual(prompt('V16'), { agent: 'agent: review-bench-variant-16-plan-low', body: p1 });
  const copy = path.join(caseDir, 'Va-low', 'run-1', 'plan-contract.md');
  assert.equal(readText(copy), '# Plan contract A\n');
  const meta = readJson(path.join(caseDir, 'Va-low', 'run-1', 'meta.json'));
  assert.deepEqual(meta, { config: CONFIGS.low, contractOverlay: 'applied' });
  assert.equal(prompt('Va').body, p1.replace(SNAPSHOT_CONTRACT_RULE, copyContractRule(copy)));

  // Each refusal leaves the workspace as it was.
  const refused = (call, message) => {
    const state = treeState(ws);
    assert.throws(call, { message });
    assert.deepEqual(treeState(ws), state);
  };
  refused(() => extend('plan-3', 'P0,P1'), `${path.join(caseDir, 'P1-low')} exists; leave its arm out of --arms`);
  const exists = `${caseDir} exists; remove it, choose another --out, or add arms with --extend`;
  refused(() => prepare.prepareCase(options('plan-3', 'P0'), repo), exists);
  const noFolder = `${path.join(ws, 'code-7')} holds no case folder to extend; run case without --extend`;
  refused(() => extend('code-7', 'C1', { loop: true }), noFolder);
  // The case folder of another version of the case file stays as it is.
  const changed = path.join(cases, 'changed', 'plan-3.json');
  put(cases, 'changed/plan-3.json', { ...caseFiles[0], round: 2 });
  put(cases, 'changed/plan-3-plan.md', '# Plan 3\n');
  const other = `${path.join(caseDir, 'case.json')} differs from ${changed}; build the changed case in another --out`;
  refused(() => prepare.prepareCase({ ...options('plan-3', 'P0'), case: changed, extend: true }, repo), other);
  // A failed --extend keeps the case folder. The snapshot of plan-5 has no plan contract.
  prepare.prepareCase(options('plan-5', 'P1'), repo);
  refused(() => extend('plan-5', 'V16,Va'), noContract(path.join(ws, 'plan-5', 'snapshot')));
  // A failed --extend removes the arm folders that it wrote: a prompt path with the word judge stops case after it
  // wrote the contract copy of Va at the configuration low.
  const configsFile = '.omp/agents/review-bench-configs.json';
  const list = readJson(path.join(project, configsFile));
  put(project, configsFile, { ...list, configs: [...list.configs, { ...CONFIGS.low, name: 'judge' }] });
  prepare.prepareCase(options('plan-4', 'Pd'), repo);
  const judged = 'the Va plan prompt of case plan-4 contains "judge"; choose an --out path without it';
  refused(() => extend('plan-4', 'Va', { configs: 'low,judge' }), judged);

  // With --loop, the new arm gets round 1 of its own policy on the diff of the case.
  prepare.prepareCase(options('code-7', 'C3', { loop: true }), repo);
  extend('code-7', 'C1', { loop: true });
  const roundMeta = (arm) => readJson(path.join(ws, 'code-7', `${arm}-low`, 'run-1', 'round-1', 'meta.json'));
  const { fullLines } = roundMeta('C3');
  assert.ok(fullLines > 0);
  assert.deepEqual(roundMeta('C1'), { config: CONFIGS.low, fixerConfig: FIXER_SETTING, mode: 'full', fullLines });
  assert.deepEqual(readJson(path.join(ws, 'code-7', 'C1-low', 'run-1', 'meta.json')), { policy: 'full-delta' });

  // The command line takes --extend.
  const cliOut = path.join(root, 'cli-ws');
  const cliArgs = [PREPARE_SCRIPT, 'case', '--case', path.join(cases, 'dev', 'plan-3.json'), '--arms', 'P0'];
  const cliRun = [...cliArgs, '--runs', '1', '--out', cliOut, '--configs', 'low', '--project', project, '--extend'];
  const cli = spawnSync(process.execPath, cliRun, { encoding: 'utf8' });
  assert.equal(cli.status, 1, cli.stderr);
  assert.match(cli.stderr, new RegExp(escapeRegExp(`${path.join(cliOut, 'plan-3')} holds no case folder to extend`)));
  assert.equal(fs.existsSync(cliOut), false);
});

test('case refuses a show_benchmark that is not true or false and writes nothing', (t) => {
  const root = neutralScratch(t);
  const ws = path.join(root, 'ws');
  const cases = path.join(root, 'cases');
  put(cases, 'dev/plan-5-plan.md', '# Plan 5\n');
  const message = 'case plan-5: show_benchmark must be true or false';
  for (const value of ['true', 1, null]) {
    const caseData = { id: 'plan-5', kind: 'plan', split: 'dev', issue: 5, round: 1, plan: 'plan-5-plan.md' };
    put(cases, 'dev/plan-5.json', { ...caseData, repo_ref: 'HEAD', known: [], show_benchmark: value });
    const options = { case: path.join(cases, 'dev', 'plan-5.json'), arms: 'P1', runs: '1', out: ws };
    const state = treeState(root);
    assert.throws(() => prepare.prepareCase(options, root), { message });
    assert.deepEqual(treeState(root), state);
  }
  assert.equal(fs.existsSync(ws), false);
});

test('report refuses an empty --reference and one without --arms or outside --arms, and writes nothing', (t) => {
  const { ws, cases } = roundWorkspace(t, [
    {
      config: CONFIGS.low,
      run: 1,
      rounds: [
        [FULL_BLOCK, 100, 1000, 'full'],
        [PASS_ROUND, 40, 400, 'delta'],
      ],
    },
    { config: CONFIGS['low-fast'], run: 1, rounds: [[PASS_ROUND.replace('round 2', 'round 1'), 50, 500, 'full']] },
  ]);
  findingsCommand(ws);
  main(['pairs', ws, '--cases', cases]);
  judgeAll(ws, (_, known) => (known === 'D1' ? 'match' : 'no'));
  const arms = ['C1-low-fast', 'C1-low'];
  reportCommand(ws, { arms });
  const empty = 'report --reference needs the name of an arm folder of --arms';
  const withoutArms = 'report takes --reference only with --arms';
  const refusals = [
    [{ arms, reference: '' }, empty],
    [{ reference: 'C1-low' }, withoutArms],
    [{ configs: ['low'], reference: 'C1-low' }, withoutArms],
    [{ arms: ['C1-low-fast'], reference: 'C1-low' }, 'report --reference names C1-low, which is not in --arms'],
  ];
  const state = treeState(ws);
  for (const [options, message] of refusals) {
    assert.throws(() => reportCommand(ws, options), { message });
    assert.deepEqual(treeState(ws), state);
  }
  // The command line gives `--reference ''` as an empty reference.
  assert.throws(() => main(['report', ws, '--arms', arms.join(','), '--reference', '']), { message: empty });
  assert.deepEqual(treeState(ws), state);
});

test('show_benchmark keeps the benchmark changes outside cases/ in the diffs of code cases and their loops', (t) => {
  isolateGit(t);
  const root = neutralScratch(t);
  const repo = path.join(root, 'repo');
  const ws = path.join(root, 'ws');
  const cases = path.join(root, 'cases');
  const project = path.join(root, 'project');
  // As in the snapshot test above, a copy of the scripts runs in a repository with a benchmark skill folder.
  const skill = '.agents/skills/review-benchmark';
  const helper = 'plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/plan.mjs';
  const live = path.join(import.meta.dirname, '../../..');
  for (const file of [`${skill}/scripts/prepare.mjs`, `${skill}/scripts/score.mjs`, helper]) {
    put(repo, file, readText(path.join(live, file)));
  }
  put(repo, `${skill}/SKILL.md`, '# Review benchmark\n');
  put(repo, `${skill}/cases/dev/code-1.json`, { id: 'code-1', kind: 'code', split: 'dev', known: [] });
  put(repo, 'src/app.mjs', 'export const a = 1;\n');
  gitIn(repo, 'init', '-q', '-b', 'main');
  const commit = (message) => {
    gitIn(repo, 'add', '-A');
    gitIn(repo, 'commit', '-q', '-m', message);
    return gitIn(repo, 'rev-parse', 'HEAD').trim();
  };
  const base = commit('base');
  // The head changes a file of each lens in the skill folder, two files of its cases folder, and a file outside it.
  const changes = {
    [`${skill}/SKILL.md`]: '# Review benchmark\n\nRun the cases.\n',
    [`${skill}/scripts/extra.mjs`]: 'export const extra = 1;\n',
    [`${skill}/tests/extra.test.mjs`]: 'test();\n',
    [`${skill}/cases/dev/code-1.json`]: '{ "id": "code-1", "known": [{ "id": "D1" }] }\n',
    [`${skill}/cases/heldout/code-2.key.json`]: '{ "known": [] }\n',
    'src/app.mjs': 'export const a = 2;\n',
  };
  for (const [file, content] of Object.entries(changes)) put(repo, file, content);
  const head = commit('head');
  put(project, '.omp/agents/review-bench-configs.json', { configs: [CONFIGS.low], fixer: FIXER_SETTING });
  put(cases, 'dev/code-11-review.md', FULL_BLOCK);
  const codeCase = (id) => ({
    id,
    kind: 'code',
    split: 'dev',
    issue: 10,
    round: 1,
    plan: `${id}-plan.md`,
    base,
    head,
    known: [],
  });
  const deltaCase = {
    ...codeCase('code-11'),
    kind: 'code-delta',
    round: 2,
    delta_base: base,
    previous_review: 'code-11-review.md',
    show_benchmark: true,
  };
  const script = path.join(repo, skill, 'scripts', 'prepare.mjs');
  for (const [caseData, arm] of [
    [{ ...codeCase('code-10'), show_benchmark: true }, 'C1'],
    [deltaCase, 'Cd'],
    [codeCase('code-12'), 'C1'],
  ]) {
    const caseFile = path.join(cases, 'dev', `${caseData.id}.json`);
    put(cases, `dev/${caseData.id}.json`, caseData);
    put(cases, `dev/${caseData.plan}`, '# Plan 10\n');
    const args = ['--case', caseFile, '--arms', arm, '--runs', '1', '--out', ws];
    const build = spawnSync(process.execPath, [script, 'case', ...args, '--project', project], { encoding: 'utf8' });
    assert.equal(build.status, 0, build.stderr);
  }
  // The paths that a diff file changes, in sorted order.
  const diffFilePaths = (file) =>
    readText(file)
      .split('\n')
      .filter((line) => line.startsWith('+++ b/'))
      .map((line) => line.slice('+++ b/'.length))
      .sort();
  const diffPaths = (caseId, name) => diffFilePaths(path.join(ws, caseId, name));
  const skillFiles = [`${skill}/SKILL.md`, `${skill}/scripts/extra.mjs`, `${skill}/tests/extra.test.mjs`];
  // With show_benchmark, the full diff, each focus diff, and the delta diff hold the changes of the skill folder in
  // their scope, and no file of its cases folder.
  for (const caseId of ['code-10', 'code-11']) {
    assert.deepEqual(diffPaths(caseId, 'full.diff'), [...skillFiles, 'src/app.mjs']);
    assert.deepEqual(diffPaths(caseId, 'focus-correctness.diff'), [`${skill}/scripts/extra.mjs`, 'src/app.mjs']);
    assert.deepEqual(diffPaths(caseId, 'focus-spec-and-tests.diff'), [`${skill}/tests/extra.test.mjs`]);
    assert.deepEqual(diffPaths(caseId, 'focus-text-and-safety.diff'), [`${skill}/SKILL.md`]);
  }
  assert.deepEqual(diffPaths('code-11', 'delta.diff'), [...skillFiles, 'src/app.mjs']);
  // Without the field, the diffs leave out the whole skill folder. A focus diff without a path in its scope is a copy
  // of the full diff.
  for (const name of ['full', 'focus-correctness', 'focus-spec-and-tests', 'focus-text-and-safety']) {
    assert.deepEqual(diffPaths('code-12', `${name}.diff`), ['src/app.mjs']);
  }

  // A review loop on a case with show_benchmark: `case --loop`, one repair of the fixer, and round 2. The fixer
  // snapshot, the snapshot and the diffs of round 2, and the tree copy of round 2 for the judge show the skill folder
  // without its cases folder. The loop gets a workspace of its own.
  const loopWs = path.join(root, 'loop-ws');
  const loopCase = { ...codeCase('code-13'), show_benchmark: true };
  put(cases, 'dev/code-13.json', loopCase);
  put(cases, 'dev/code-13-plan.md', '# Plan 10\n');
  const runScript = (...args) => spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' });
  const caseArgs = ['--case', path.join(cases, 'dev', 'code-13.json'), '--arms', 'C3', '--runs', '1'];
  const loopBuild = runScript('case', ...caseArgs, '--out', loopWs, '--loop', '--project', project);
  assert.equal(loopBuild.status, 0, loopBuild.stderr);
  const run = path.join(loopWs, 'code-13', 'C3-low', 'run-1');
  // The diff of the case has 6 lines, so round 1 is a full round. Its one finding is a valid extra for the fixer.
  const extra = `${skill}/scripts/extra.mjs`;
  const finding = `- [MEDIUM] Bug - ${extra}:1 - extra is 1 - set it to 2.`;
  put(run, 'round-1/blocks/full.md', FULL_BLOCK.replace(/- \[HIGH\].*/, finding));
  findingsCommand(loopWs);
  judgeLoop(loopWs, [['code-13/C3-low/run-1/round-1/full#1', 'valid']]);
  const loop = () => runScript('loop', '--run', run, '--cases', cases);
  const stopped = loop();
  assert.equal(stopped.status, 1, stopped.stderr);
  assert.match(stopped.stderr, /round-1 has 1 valid extra findings for the fixer: /);
  // The files of a tree copy, in sorted order.
  const treeFiles = (dir) =>
    filesUnder(dir)
      .map((file) => path.relative(dir, file).split(path.sep).join('/'))
      .sort();
  const scripts = [`${skill}/scripts/prepare.mjs`, `${skill}/scripts/score.mjs`];
  const headFiles = [...skillFiles, ...scripts, helper, 'src/app.mjs'].sort();
  const fixerDir = path.join(run, 'round-1', 'fixer');
  assert.deepEqual(treeFiles(path.join(fixerDir, 'snapshot')), headFiles);
  // The fixer repairs extra.mjs and adds a file of 60 lines, so round 2 is a panel round. The patch also adds a file
  // to the cases folder, which no diff of round 2 shows.
  const added = `${skill}/scripts/fix.mjs`;
  const repairs = {
    [extra]: 'export const extra = 2;\n',
    [added]: Array.from({ length: 60 }, (_, index) => `export const f${index} = ${index};\n`).join(''),
    [`${skill}/cases/dev/code-3.json`]: '{ "id": "code-3" }\n',
  };
  for (const [file, content] of Object.entries(repairs)) put(repo, file, content);
  gitIn(repo, 'add', '-A');
  const fixerPatch = gitIn(repo, 'diff', '--cached', '--no-color', '--src-prefix=a/', '--dst-prefix=b/');
  gitIn(repo, 'reset', '-q', '--hard', 'HEAD');
  fs.writeFileSync(path.join(fixerDir, 'fixer-1.patch'), fixerPatch);
  const next = loop();
  assert.equal(next.status, 0, next.stderr);
  const round2 = path.join(run, 'round-2');
  assert.equal(readJson(path.join(round2, 'meta.json')).mode, 'panel');
  const round2Files = [...headFiles, added].sort();
  assert.deepEqual(treeFiles(path.join(round2, 'snapshot')), round2Files);
  const judgeTree = path.join(loopWs, score.JUDGE_TREES, score.runLabel('code-13', 'C3-low', 'run-1/round-2'));
  assert.deepEqual(treeFiles(judgeTree), round2Files);
  const round2Diff = (name) => diffFilePaths(path.join(round2, name));
  assert.deepEqual(round2Diff('full.diff'), [...skillFiles, added, 'src/app.mjs'].sort());
  assert.deepEqual(round2Diff('focus-correctness.diff'), [extra, added, 'src/app.mjs'].sort());
  assert.deepEqual(round2Diff('focus-spec-and-tests.diff'), [`${skill}/tests/extra.test.mjs`]);
  assert.deepEqual(round2Diff('focus-text-and-safety.diff'), [`${skill}/SKILL.md`]);
  assert.deepEqual(round2Diff('delta.diff'), [extra, added].sort());
});
