import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'vitest';
import * as prepare from '../scripts/prepare.mjs';
import * as score from '../scripts/score.mjs';
import { blindId, findingsCommand, main, pairsCommand, renderReport, reportCommand, scoreRuns } from '../scripts/score.mjs';
import {
  CODE_KNOWN,
  CORRECTNESS_BLOCK,
  FIX_KNOWN,
  judgeAll,
  judgedArm,
  judgedRound,
  neutralScratch,
  PLAN_KEY,
  put,
  readJson,
  tableAfter,
  treeState,
  workspace,
} from './helpers.mjs';

// Plan #115 step 1: API note for the tests below (decision 2, protected decisions).
//
// Case and key files:
// - A dev case file can list `protected`: one { id, section, summary } per decision that the user made or delegated: a
//   request correction, a choice of the user that the plan records, or a decision that a yolo plan records under the
//   user's delegation (the plan contract treats it as settled; a reviewer may still report its false premise or broken
//   effect). A reviewer must not re-argue it. A held-out key file can be an object { known, protected }; a key file
//   that is a list, or an object without `protected`, gives no protected decisions.
// prepare.mjs:
// - validateCase, and so `case`, refuses `protected` in a held-out case file, also an empty list, before `case` writes
//   a file: `held-out case <id> lists protected decisions; move them to <id>.key.json`.
// score.mjs:
// - pairs.json: each case entry gets `protected`, the list of its case file or key file ([] without one), read with the
//   `--keys` rule of `known`. Each run entry gets `protectedPairs`: one { finding, protected } for each finding of the
//   run and each protected decision of its case, without the shared-file rule of code pairs, sorted by finding and then
//   by protected id.
// - pairs, as every reader of a case file or key file, refuses a `protected` value that is not a list of items with a
//   string id: `the protected decisions of <id> must be a list of items with a string id`; and a list that repeats an
//   id: `<id> repeats a protected decision id`.
// - judgments.json gets `reargued`: one { finding, protected, verdict, reason } per protected pair, with the verdict
//   `match`, `no`, or `unknown`. A missing `reargued` array holds no answers. scoreRuns, and so `report`, refuses as
//   it refuses `matches`: `judgments.json names unknown finding <blind>`; `judgments.json pairs <blind> with <id>,
//   which is not a protected decision of its case`; `judgments.json has reargued verdict <verdict>`; `judgments.json
//   gives <blind> and <id> two different answers`; and a protected pair of pairs.json without an answer:
//   `judgments.json has no reargued answer for <n> protected pairs of pairs.json: <blind> and <id>, ...` (the first
//   10, then `, and <n> more`).
// - A reargued answer changes no known-defect score: a `match` finds no known defect, `known` and recall count only
//   known defects, and the finding keeps its rating. A finding whose only `match` answer is a reargued one needs an
//   adjudication: without one it counts as unjudged, and report stops on it. An `unknown` reargued answer is no
//   unknown pair and no re-argued decision.
// - Each run gets `reargued`: the distinct protected ids that a reargued `match` of a finding of the run names, in the
//   protected-list order of its case. Each summary gets `reargued`: the mean count of these ids over its valid runs.
// - report.md: the Summary table gets the column `Re-argued mean` (2 decimals) after `Unknown pairs mean`, and the Runs
//   table gets the column `Re-argued` (the ids joined by ", ", or `-`) after `Unknown pairs`.
// - judgeAgreement compares each `reargued` answer of judgments-second.json with the reargued answer of judgments.json
//   for the same finding and protected id, and counts it in `answers` and `agreed`. A reargued answer that
//   judgments.json does not give fails: `judgments-second.json answers <finding> and <protected>, which judgments.json
//   does not answer`; a bad verdict fails: `judgments-second.json has reargued verdict <verdict>`.
// - findings: the answers that removeStaleAnswers removes for a stale finding include its `reargued` answers, in both
//   judgment files, and a stale finding with only reargued answers counts in `removed`.
// - report --keys: a key whose protected ids differ from the protected ids of its case in pairs.json stops the report:
//   `pairs.json is out of date for <case>: its key has the protected decisions <ids>, but pairs.json has <ids>; run
//   score.mjs pairs again`, with the ids sorted and joined by ", ", or `none`.
// - fixPlan, the fix step of a loop, reads no reargued answer.

const PROTECTED = [
  { id: 'U1', section: 'Decisions 1', summary: 'Fast mode stays off while benchmark dispatches run' },
  { id: 'U2', section: 'Decisions 3', summary: 'The token limit stays removed' },
  { id: 'U3', section: 'Request corrections', summary: 'Run all six follow-ups' },
];
// The workspace of `workspace`, whose dev case code-7 lists the protected decision U1 and whose held-out key of plan-3
// is an object with the protected decisions U1 and U2.
function protectedWorkspace() {
  const { ws, cases } = workspace();
  const codeCase = { id: 'code-7', kind: 'code', split: 'dev', known: CODE_KNOWN, protected: PROTECTED.slice(0, 1) };
  put(cases, 'dev/code-7.json', codeCase);
  put(cases, 'heldout/plan-3.key.json', { known: PLAN_KEY, protected: PROTECTED.slice(0, 2) });
  return { ws, cases };
}
// Adds to judgments.json (or to no answers, without the file) a reargued answer for every protected pair of
// pairs.json. `verdict(id, protectedId)` gets the stable finding id.
function judgeProtected(ws, verdict) {
  const { findings } = readJson(path.join(ws, 'findings.json'));
  const idOf = new Map(findings.map((finding) => [finding.blind, finding.id]));
  const pairs = readJson(path.join(ws, 'pairs.json')).cases.flatMap((entry) =>
    entry.runs.flatMap((run) => {
      assert.ok(Array.isArray(run.protectedPairs), `pairs.json gives the run ${run.run} no protectedPairs`);
      return run.protectedPairs;
    }),
  );
  const judgments = score.loadJudgments(ws);
  judgments.reargued = pairs.map((pair) => ({
    ...pair,
    verdict: verdict(idOf.get(pair.finding), pair.protected),
    reason: 'Read the plan.',
  }));
  put(ws, 'judgments.json', judgments);
  return judgments;
}
// judgedArm with the protected decisions `decisions` of code-7 in pairs.json. A finding can also have `reargued`, a map
// from a protected id to the verdict of its reargued answer.
function protectedArm(known, decisions, runs) {
  const fixture = judgedArm(known, runs);
  fixture.pairs.cases[0].protected = decisions;
  fixture.judgments.reargued = runs.flatMap((list, index) =>
    list.flatMap(({ reargued = {} }, n) =>
      Object.entries(reargued).map(([id, verdict]) => ({
        finding: blindId(`code-7/C3/run-${index + 1}/correctness#${n + 1}`),
        protected: id,
        verdict,
        reason: 'Read the plan.',
      })),
    ),
  );
  return fixture;
}
test('pairs.json lists the protected decisions of each case and pairs each one with every finding of its run', () => {
  const { ws, cases } = protectedWorkspace();
  const { findings } = findingsCommand(ws);
  const idOf = new Map(findings.map((finding) => [finding.blind, finding.id]));
  const blind = Object.fromEntries(findings.map((finding) => [finding.id, finding.blind]));
  const doc = pairsCommand(ws, cases);
  assert.deepEqual(readJson(path.join(ws, 'pairs.json')), doc);
  assert.deepEqual(
    doc.cases.map((entry) => [entry.case, entry.known, entry.protected]),
    [
      ['code-7', CODE_KNOWN, PROTECTED.slice(0, 1)],
      ['plan-3', PLAN_KEY, PROTECTED.slice(0, 2)],
    ],
  );
  for (const run of doc.cases.flatMap((entry) => entry.runs)) {
    const own = new Set(run.findings.map((finding) => finding.finding));
    assert.ok(Array.isArray(run.protectedPairs), `the run ${run.run} has no protectedPairs`);
    assert.ok(
      run.protectedPairs.every((pair) => own.has(pair.finding)),
      `the run ${run.run} pairs a finding of another run`,
    );
  }
  // A code finding needs no shared file: correctness#2 names src/cache.mjs, and its only known-defect pair is D3.
  const protectedPairs = doc.cases.flatMap((entry) =>
    entry.runs.flatMap((run) => run.protectedPairs.map((pair) => `${idOf.get(pair.finding)} ${pair.protected}`)),
  );
  assert.deepEqual(protectedPairs.sort(), [
    'code-7/B0/run-1/full#1 U1',
    'code-7/C3/run-1/correctness#1 U1',
    'code-7/C3/run-1/correctness#2 U1',
    'code-7/C3/run-1/correctness#3 U1',
    'code-7/C3/run-1/spec-and-tests#1 U1',
    'code-7/C3/run-2/correctness#1 U1',
    'code-7/C3/run-2/correctness#2 U1',
    'code-7/C3/run-2/correctness#3 U1',
    'plan-3/P0/run-1/plan#1 U1',
    'plan-3/P0/run-1/plan#1 U2',
    'plan-3/P0/run-1/plan#2 U1',
    'plan-3/P0/run-1/plan#2 U2',
  ]);
  const cacheFinding = blind['code-7/C3/run-1/correctness#2'];
  const cachePairs = doc.cases[0].runs.flatMap((run) => run.pairs).filter((pair) => pair.finding === cacheFinding);
  assert.deepEqual(cachePairs, [{ finding: cacheFinding, known: 'D3' }]);
  // Each protected pair holds the blind finding id and the protected id only, sorted by finding and then by id.
  const [first, second] = [blind['plan-3/P0/run-1/plan#1'], blind['plan-3/P0/run-1/plan#2']].sort();
  assert.deepEqual(doc.cases[1].runs[0].protectedPairs, [
    { finding: first, protected: 'U1' },
    { finding: first, protected: 'U2' },
    { finding: second, protected: 'U1' },
    { finding: second, protected: 'U2' },
  ]);
  // A case without protected decisions, and a key that is a list, give an empty list and no protected pairs. With
  // --keys, the key of the --keys folder gives the protected decisions of a held-out case.
  const keys = path.join(path.dirname(ws), 'keys');
  put(cases, 'dev/code-7.json', { id: 'code-7', kind: 'code', split: 'dev', known: CODE_KNOWN });
  put(keys, 'plan-3.key.json', PLAN_KEY);
  const bare = pairsCommand(ws, cases, { keys });
  assert.deepEqual(
    bare.cases.map((entry) => entry.protected),
    [[], []],
  );
  assert.deepEqual(
    bare.cases.flatMap((entry) => entry.runs.flatMap((run) => run.protectedPairs)),
    [],
  );
  put(keys, 'plan-3.key.json', { known: PLAN_KEY, protected: PROTECTED.slice(1, 2) });
  assert.deepEqual(pairsCommand(ws, cases, { keys }).cases[1].protected, PROTECTED.slice(1, 2));
});
test('pairs refuses protected decisions that are no list of items with a string id, or that repeat an id', () => {
  const { ws, cases } = protectedWorkspace();
  findingsCommand(ws);
  const keys = path.join(path.dirname(ws), 'keys');
  const [first, second] = PROTECTED;
  // Each bad `protected` value of the case `id`, with the message that stops pairs.
  const refusals = (id) => {
    const notList = `the protected decisions of ${id} must be a list of items with a string id`;
    return [
      [first, notList],
      [[first, { section: second.section, summary: second.summary }], notList],
      [[first, { ...second, id: 2 }], notList],
      [[first, null], notList],
      [[first, second, { ...first, summary: 'Another summary' }], `${id} repeats a protected decision id`],
    ];
  };
  // The held-out key of the --keys folder.
  for (const [decisions, message] of refusals('plan-3')) {
    put(keys, 'plan-3.key.json', { known: PLAN_KEY, protected: decisions });
    assert.throws(() => pairsCommand(ws, cases, { keys }), { message });
  }
  // A dev case file.
  put(keys, 'plan-3.key.json', { known: PLAN_KEY, protected: PROTECTED.slice(0, 2) });
  const codeCase = { id: 'code-7', kind: 'code', split: 'dev', known: CODE_KNOWN };
  for (const [decisions, message] of refusals('code-7')) {
    put(cases, 'dev/code-7.json', { ...codeCase, protected: decisions });
    assert.throws(() => pairsCommand(ws, cases, { keys }), { message });
  }
  // pairs refuses before it writes pairs.json.
  assert.equal(fs.existsSync(path.join(ws, 'pairs.json')), false);
});
test('case refuses protected decisions in a held-out case file, as it refuses known defects, and a dev case takes them', () => {
  const root = neutralScratch();
  const ws = path.join(root, 'ws');
  const cases = path.join(root, 'cases');
  const planCase = { id: 'plan-5', kind: 'plan', issue: 5, round: 1, plan: 'plan-5-plan.md', repo_ref: 'HEAD' };
  const dev = { ...planCase, split: 'dev', known: [], protected: PROTECTED };
  assert.deepEqual(prepare.validateCase(dev), dev);
  const message = 'held-out case plan-5 lists protected decisions; move them to plan-5.key.json';
  put(cases, 'heldout/plan-5-plan.md', '# Plan 5\n');
  for (const decisions of [PROTECTED, []]) {
    const heldout = { ...planCase, split: 'heldout', protected: decisions };
    assert.throws(() => prepare.validateCase(heldout), { message });
    put(cases, 'heldout/plan-5.json', heldout);
    const options = { case: path.join(cases, 'heldout', 'plan-5.json'), arms: 'P1', runs: '1', out: ws };
    const state = treeState(root);
    assert.throws(() => prepare.prepareCase(options, root), { message });
    assert.deepEqual(treeState(root), state);
  }
  assert.equal(fs.existsSync(ws), false);
});
test('a reargued match counts as a re-argued decision of its run, not in recall, and the finding keeps its rating', () => {
  const scores = scoreRuns(
    protectedArm(CODE_KNOWN.slice(0, 2), PROTECTED, [
      [
        { matches: { D1: 'match' }, reargued: { U2: 'match' } },
        { reargued: { U1: 'match', U2: 'match' }, rating: 'wrong' },
        { matches: { D2: 'no' }, reargued: { U3: 'unknown' }, rating: 'valid' },
      ],
      [
        { reargued: { U2: 'match' }, rating: 'valid' },
        { reargued: { U1: 'no' }, rating: 'wrong' },
      ],
      [{ reargued: { U3: 'match' } }],
    ]),
  );
  const [first, second, third] = scores.runs;
  // Run 1 re-argued U2 in two findings, which counts once, and lists its ids in protected-list order. An unknown
  // reargued answer is no re-argued decision and no unknown pair.
  assert.deepEqual(
    [first.known, first.found, first.recall, first.reargued, first.validExtras, first.wrong, first.unknownPairs],
    [2, ['D1'], 0.5, ['U1', 'U2'], 1, 1, 0],
  );
  // A reargued match finds no known defect, and the finding counts by its rating.
  assert.deepEqual(
    [second.found, second.recall, second.reargued, second.validExtras, second.wrong],
    [[], 0, ['U2'], 1, 1],
  );
  // A finding whose only match answer is a reargued one stays unjudged without a rating.
  assert.deepEqual([third.found, third.reargued, third.unjudged], [[], ['U3'], 1]);
  const [summary] = scores.summaries;
  assert.deepEqual([summary.known, summary.reargued], [2, 4 / 3]);
  assert.deepEqual(summary.recall, { mean: 0.5 / 3, median: 0, min: 0, max: 0.5 });
  const lines = renderReport(scores).split('\n');
  for (const expected of [
    '| code-7 | C3 | 3 | 2 | 0.17 | 0.00 | 0.00 | 0.50 | 0.67 | 0.67 | 0.00 | 0.00 | 0.00 | 1.33 | - | - | - | - | - | - | - |',
    '| code-7 | C3 | run-1 | 0.50 | D1 | 1 | 1 | 0 | 0 | 0 | 0 | U1, U2 | - | - | - | pass | correctness: pass |',
    '| code-7 | C3 | run-2 | 0.00 | - | 1 | 1 | 0 | 0 | 0 | 0 | U2 | - | - | - | pass | correctness: pass |',
    '| code-7 | C3 | run-3 | 0.00 | - | 0 | 0 | 0 | 1 | 0 | 0 | U3 | - | - | - | pass | correctness: pass |',
  ]) {
    assert.ok(lines.includes(expected), `the report lacks ${expected}`);
  }
});
test('report refuses a protected pair without a reargued answer and a reargued answer for an unknown decision', () => {
  // Each finding of the fixture pairs with the protected decisions U1 and U2.
  const withProtectedPairs = (fixture) => {
    const protectedPairs = fixture.findings.findings.flatMap((finding) =>
      ['U1', 'U2'].map((id) => ({ finding: finding.blind, protected: id })),
    );
    fixture.pairs.cases[0].runs = [{ run: 'R-00000000', findings: [], pairs: [], protectedPairs }];
    return fixture;
  };
  const decisions = PROTECTED.slice(0, 2);
  const open = withProtectedPairs(
    protectedArm(CODE_KNOWN.slice(0, 1), decisions, [[{ reargued: { U1: 'no' }, rating: 'valid' }]]),
  );
  const [finding] = open.findings.findings;
  const missing = `judgments.json has no reargued answer for 1 protected pairs of pairs.json: ${finding.blind} and U2`;
  assert.throws(() => scoreRuns(open), { message: missing });
  const answered = withProtectedPairs(
    protectedArm(CODE_KNOWN.slice(0, 1), decisions, [[{ reargued: { U1: 'no', U2: 'match' }, rating: 'valid' }]]),
  );
  assert.deepEqual(scoreRuns(answered).runs[0].reargued, ['U2']);
  // Each refusal below keeps the answers of every protected pair and adds one answer.
  const withAnswer = (extra) => ({
    ...answered,
    judgments: { ...answered.judgments, reargued: [...answered.judgments.reargued, extra] },
  });
  const { blind } = finding;
  assert.throws(
    () => scoreRuns(withAnswer({ finding: blind, protected: 'U9', verdict: 'no' })),
    new RegExp(`judgments\\.json pairs ${blind} with U9, which is not a protected decision of its case`),
  );
  // A known defect is not a protected decision, and a protected decision is not a known defect.
  assert.throws(
    () => scoreRuns(withAnswer({ finding: blind, protected: 'D1', verdict: 'match' })),
    new RegExp(`judgments\\.json pairs ${blind} with D1, which is not a protected decision of its case`),
  );
  const knownU1 = { finding: blind, known: 'U1', verdict: 'match' };
  assert.throws(
    () => scoreRuns({ ...answered, judgments: { ...answered.judgments, matches: [knownU1] } }),
    new RegExp(`judgments\\.json pairs ${blind} with U1, which is not a known defect of its case`),
  );
  assert.throws(
    () => scoreRuns(withAnswer({ finding: 'F-0000000000', protected: 'U1', verdict: 'no' })),
    /judgments\.json names unknown finding F-0000000000/,
  );
  assert.throws(
    () => scoreRuns(withAnswer({ finding: blind, protected: 'U1', verdict: 'maybe' })),
    /judgments\.json has reargued verdict maybe/,
  );
  assert.throws(
    () => scoreRuns(withAnswer({ finding: blind, protected: 'U1', verdict: 'match' })),
    new RegExp(`judgments\\.json gives ${blind} and U1 two different answers`),
  );
});
test('report.md gives the re-argued decisions of each run, and a reargued match does not judge a finding', () => {
  const { ws, cases } = protectedWorkspace();
  const { findings } = findingsCommand(ws);
  const blind = Object.fromEntries(findings.map((finding) => [finding.id, finding.blind]));
  const pairs = pairsCommand(ws, cases);
  assert.deepEqual(
    pairs.cases.map((entry) => entry.protected),
    [PROTECTED.slice(0, 1), PROTECTED.slice(0, 2)],
  );
  const reportFile = path.join(ws, 'report.md');
  // The B0 finding re-argues U1 and gets its rating only below.
  const lockFinding = 'code-7/B0/run-1/full#1';
  judgeAll(
    ws,
    (id, known) => (id === 'plan-3/P0/run-1/plan#1' && known === 'K1' ? 'match' : 'no'),
    (id) => (id === lockFinding ? null : 'valid'),
  );
  assert.throws(() => reportCommand(ws), /no reargued answer for 12 protected pairs of pairs\.json: .*, and 2 more$/);
  assert.equal(fs.existsSync(reportFile), false);
  const answers = {
    [`${lockFinding} U1`]: 'match',
    'code-7/C3/run-1/correctness#1 U1': 'match',
    'code-7/C3/run-1/correctness#3 U1': 'match',
    'code-7/C3/run-2/correctness#2 U1': 'unknown',
    'plan-3/P0/run-1/plan#1 U1': 'match',
    'plan-3/P0/run-1/plan#2 U1': 'unknown',
    'plan-3/P0/run-1/plan#2 U2': 'match',
  };
  const judgments = judgeProtected(ws, (id, protectedId) => answers[`${id} ${protectedId}`] ?? 'no');
  assert.throws(
    () => reportCommand(ws),
    new RegExp(`no match and no adjudication for 1 findings: ${blind[lockFinding]}$`),
  );
  assert.equal(fs.existsSync(reportFile), false);
  judgments.adjudications.push({ finding: blind[lockFinding], rating: 'wrong', reason: 'The plan chose the lock.' });
  put(ws, 'judgments.json', judgments);
  reportCommand(ws);
  const report = fs.readFileSync(reportFile, 'utf8');
  // C3 has no valid run, so the summary has rows for B0 and P0 only.
  const [summaryHeader, , ...summaryRows] = tableAfter(report, '## Summary');
  assert.equal(
    summaryHeader,
    '| Case | Arm | Runs | Known | Recall mean | Recall median | Recall min | Recall max | Valid extras mean | Wrong mean | Unknown mean | Unresolved mean | Unknown pairs mean | Re-argued mean | Diff read mean | Seconds median | Seconds min | Seconds max | Tokens median | Tokens min | Tokens max |',
  );
  assert.deepEqual(summaryRows, [
    '| code-7 | B0 | 1 | 3 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 1.00 | 0.00 | 0.00 | 0.00 | 1.00 | - | - | - | - | - | - | - |',
    '| plan-3 | P0 | 1 | 2 | 0.50 | 0.50 | 0.50 | 0.50 | 1.00 | 0.00 | 0.00 | 0.00 | 0.00 | 2.00 | - | - | - | - | - | - | - |',
  ]);
  const [runHeader, , ...runRows] = tableAfter(report, '## Runs');
  assert.equal(
    runHeader,
    '| Case | Arm | Run | Recall | Found | Valid extras | Wrong | Unknown | Unjudged | Unresolved | Unknown pairs | Re-argued | Diff read | Seconds | Tokens | Round verdict | Block verdicts |',
  );
  assert.deepEqual(runRows, [
    '| code-7 | B0 | run-1 | 0.00 | - | 0 | 1 | 0 | 0 | 0 | 0 | U1 | - | - | - | fixes-required | full: fixes-required |',
    '| code-7 | C3 | run-1 | 0.00 | - | 4 | 0 | 0 | 0 | 0 | 0 | U1 | - | - | - | incomplete | correctness: fixes-required, spec-and-tests: fixes-required, text-and-safety: unreadable |',
    '| code-7 | C3 | run-2 | 0.00 | - | 3 | 0 | 0 | 0 | 0 | 0 | - | - | - | - | incomplete | correctness: fixes-required, spec-and-tests: unreadable, text-and-safety: missing |',
    '| plan-3 | P0 | run-1 | 0.50 | K1 | 1 | 0 | 0 | 0 | 0 | 0 | U1, U2 | - | - | - | repair | plan: repair |',
  ]);
  // The report names protected ids and no text of a protected decision.
  for (const { section, summary } of PROTECTED) {
    assert.equal(report.includes(summary), false, `report.md contains ${summary}`);
    assert.equal(report.includes(section), false, `report.md contains ${section}`);
  }
});
test('the judge agreement counts the reargued answers of the second judge', () => {
  const first = {
    matches: [{ finding: 'F-0000000001', known: 'D1', verdict: 'no' }],
    adjudications: [{ finding: 'F-0000000001', rating: 'wrong' }],
    reargued: [
      { finding: 'F-0000000001', protected: 'U1', verdict: 'match' },
      { finding: 'F-0000000002', protected: 'U1', verdict: 'no' },
      { finding: 'F-0000000002', protected: 'U2', verdict: 'unknown' },
    ],
  };
  const second = {
    matches: [{ finding: 'F-0000000001', known: 'D1', verdict: 'no' }],
    reargued: [
      { finding: 'F-0000000001', protected: 'U1', verdict: 'match' },
      { finding: 'F-0000000002', protected: 'U1', verdict: 'match' },
    ],
  };
  assert.deepEqual(score.judgeAgreement(first, second), {
    answers: 3,
    agreed: 2,
    rate: 2 / 3,
    matchAnswers: 0,
    matchChecked: 0,
  });
  // A reargued answer is compared only with the reargued answer of the same finding and protected id.
  const onlyReargued = (entry) => ({ matches: [], adjudications: [], reargued: [entry] });
  assert.throws(
    () => score.judgeAgreement(first, onlyReargued({ finding: 'F-0000000009', protected: 'U1', verdict: 'no' })),
    /judgments-second\.json answers F-0000000009 and U1, which judgments\.json does not answer/,
  );
  assert.throws(
    () => score.judgeAgreement(first, onlyReargued({ finding: 'F-0000000001', protected: 'D1', verdict: 'no' })),
    /judgments-second\.json answers F-0000000001 and D1, which judgments\.json does not answer/,
  );
  assert.throws(
    () => score.judgeAgreement(first, onlyReargued({ finding: 'F-0000000001', protected: 'U1', verdict: 'maybe' })),
    /judgments-second\.json has reargued verdict maybe/,
  );
  // The report counts the reargued answers of judgments-second.json.
  const { ws, cases } = protectedWorkspace();
  findingsCommand(ws);
  pairsCommand(ws, cases);
  judgeAll(ws, () => 'no');
  const judgments = judgeProtected(ws, () => 'no');
  reportCommand(ws);
  const [kept, changed] = judgments.reargued;
  put(ws, 'judgments-second.json', {
    matches: [],
    adjudications: [judgments.adjudications[0]],
    reargued: [kept, { ...changed, verdict: 'match' }],
  });
  reportCommand(ws);
  const lines = fs.readFileSync(path.join(ws, 'report.md'), 'utf8').split('\n');
  assert.ok(
    lines.includes(
      'The second judge agreed with 2 of 3 answers (0.67). It answered 0 of the 0 match answers of judgments.json.',
    ),
  );
});
test('the fix plan of a loop ignores reargued answers', () => {
  const round = judgedRound(1, [
    { matches: { D2: 'match' } },
    { rating: 'valid' },
    { rating: 'wrong', reason: 'The plan chose this behavior.' },
  ]);
  const reargued = round.findings.map((finding) => ({
    finding: finding.blind,
    protected: 'U1',
    verdict: 'match',
    reason: 'The finding asks to undo decision 1.',
  }));
  const plan = score.fixPlan({ ...round, known: FIX_KNOWN });
  assert.deepEqual(score.fixPlan({ ...round, judgments: { ...round.judgments, reargued }, known: FIX_KNOWN }), plan);
  // A reargued match is no answer for the fix step: a finding with only that answer stops it, as an unanswered finding
  // does.
  const open = judgedRound(1, [{}]);
  const [finding] = open.findings;
  const onlyReargued = { ...open.judgments, reargued: [{ finding: finding.blind, protected: 'U1', verdict: 'match' }] };
  assert.throws(
    () => score.fixPlan({ ...open, judgments: onlyReargued, known: FIX_KNOWN }),
    new RegExp(`no match and no adjudication for 1 findings: ${finding.blind}$`),
  );
});
test('findings removes the reargued answers of each finding whose text changed or that is gone', () => {
  const { ws, cases } = protectedWorkspace();
  const { findings } = findingsCommand(ws);
  pairsCommand(ws, cases);
  // The judge has answered only the protected pairs so far, so each finding has only reargued answers.
  const judgments = judgeProtected(ws, () => 'no');
  const blind = Object.fromEntries(findings.map((finding) => [finding.id, finding.blind]));
  const changed = 'code-7/C3/run-1/correctness#2';
  const gone = 'code-7/B0/run-1/full#1';
  const kept = 'code-7/C3/run-2/correctness#2';
  const answersOf = (doc, id) => (doc.reargued ?? []).filter((entry) => entry.finding === blind[id]);
  // The second judge answered the protected pairs of the changed finding and of a finding that stays.
  const sample = [...answersOf(judgments, changed), ...answersOf(judgments, kept)];
  put(ws, 'judgments-second.json', { matches: [], adjudications: [], reargued: sample });
  for (const id of [changed, gone, kept]) assert.ok(answersOf(judgments, id).length > 0, `${id} has no answer`);
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
    assert.deepEqual(answersOf(first, id), [], `judgments.json keeps a reargued answer of ${id}`);
    assert.deepEqual(answersOf(second, id), [], `judgments-second.json keeps a reargued answer of ${id}`);
  }
  assert.deepEqual(answersOf(second, kept), answersOf(judgments, kept));
  const others = findings.map((finding) => finding.id).filter((id) => id !== changed && id !== gone);
  for (const id of others) assert.deepEqual(answersOf(first, id), answersOf(judgments, id));
  assert.equal(main(['findings', ws]).split('\n').length, 1);
});
test('report --keys refuses a key whose protected decisions changed after pairs', () => {
  const { ws, cases } = protectedWorkspace();
  const keys = path.join(path.dirname(ws), 'keys');
  const decisions = PROTECTED.slice(0, 2);
  put(keys, 'plan-3.key.json', { known: PLAN_KEY, protected: decisions });
  findingsCommand(ws);
  pairsCommand(ws, cases, { keys });
  judgeAll(ws, () => 'no');
  judgeProtected(ws, () => 'no');
  const reportFile = path.join(ws, 'report.md');
  assert.equal(main(['report', ws, '--keys', keys]), 'report.md: 4 runs');
  fs.rmSync(reportFile);
  const message = (ids) =>
    `pairs.json is out of date for plan-3: its key has the protected decisions ${ids}, but pairs.json has U1, U2; run score.mjs pairs again`;
  // The known defects stay the same. A protected decision that the key adds or removes, or a key without protected
  // decisions, stops the report before it writes.
  for (const [key, ids] of [
    [{ known: PLAN_KEY, protected: PROTECTED }, 'U1, U2, U3'],
    [{ known: PLAN_KEY, protected: decisions.slice(0, 1) }, 'U1'],
    [{ known: PLAN_KEY }, 'none'],
  ]) {
    put(keys, 'plan-3.key.json', key);
    assert.throws(() => main(['report', ws, '--keys', keys]), { message: message(ids) });
    assert.equal(fs.existsSync(reportFile), false);
  }
  // The same protected ids in another order do not stop the report.
  put(keys, 'plan-3.key.json', { known: PLAN_KEY, protected: [decisions[1], decisions[0]] });
  assert.equal(main(['report', ws, '--keys', keys]), 'report.md: 4 runs');
});
