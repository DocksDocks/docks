import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'vitest';
import { BUN_RUNTIME } from '../../../../cli/test/lib/cliEntry.ts';
import * as prepare from '../scripts/prepare.mjs';
import * as score from '../scripts/score.mjs';
import { main, namesCommand, renderReport, scoreRuns, transcriptsCommand } from '../scripts/score.mjs';
import {
  agentsOnBun,
  assistantLine,
  CONFIGS,
  fakeOmp,
  copyContractRule,
  gridFixture,
  isoAt,
  KIT_CONTRACT,
  jsonl,
  LIVE,
  LIVE_PLUGIN,
  MANAGER_SETTING,
  MODEL,
  neutralScratch,
  noContract,
  oneKnownCases,
  overlayFixture,
  PREPARE_SCRIPT,
  promptFileParts,
  provenCost,
  put,
  readJson,
  reads,
  readText,
  SCOPE_CASE,
  scratch,
  sessionRecord,
  singleRuns,
  SNAPSHOT_CONTRACT_RULE,
  tableAfter,
  toolTranscript,
  variantOptions,
  variantRepo,
  writeFixture,
} from './helpers.mjs';

// Plan #135: the statistics of a decision, the fixed reference, the sequential looks, the batch control, and the
// harness fixes.

test('the exact Poisson rate test gives the binomial tail of the count of a column on known inputs', () => {
  // Two events, both in the column, with equal exposures: P(Binomial(2, 1/2) >= 2) = 1/4.
  assert.equal(score.poissonRateTest(2, 1, 0, 1), 0.25);
  // P(Binomial(2, 1/2) >= 1) = 3/4, and a count of 0 gives 1.
  assert.equal(score.poissonRateTest(1, 1, 1, 1), 0.75);
  assert.equal(score.poissonRateTest(0, 3, 4, 3), 1);
  // The share of the column is its part of the exposure: P(Binomial(3, 2/3) >= 3) = 8/27.
  assert.ok(Math.abs(score.poissonRateTest(3, 2, 0, 1) - 8 / 27) < 1e-12);
  // Only the shares count: P(Binomial(3, 1/2) >= 2) = 1/2.
  assert.ok(Math.abs(score.poissonRateTest(2, 4, 1, 4) - 0.5) < 1e-12);
  // The held-out values of plan #133: P1 with 64 wrong findings in 67 runs against P0 with 30 in 67, and C3 with 28
  // in 28 against B3 with 27 in 32.
  assert.equal(score.poissonRateTest(64, 67, 30, 67).toFixed(4), '0.0003');
  assert.equal(score.poissonRateTest(28, 28, 27, 32).toFixed(2), '0.31');
  // A column without runs has no exposure.
  assert.equal(score.poissonRateTest(1, 0, 1, 2), null);
});
test('the normal quantile and the alpha spending of each look give the published values', () => {
  assert.ok(Math.abs(score.normalQuantile(0.95) - 1.6448536) < 1e-6);
  assert.ok(Math.abs(score.normalQuantile(0.8) - 0.8416212) < 1e-6);
  assert.ok(Math.abs(score.normalQuantile(0.001) + 3.0902323) < 1e-6);
  assert.ok(Math.abs(score.normalCdf(1.959964) - 0.975) < 1e-6);
  // The O'Brien-Fleming spending function of Lan and DeMets: alpha(t) = 2 - 2 Phi(z(0.975) / sqrt(t)) with z(0.975) =
  // 1.959964. Look k of 4 spends alpha(k / 4) - alpha((k - 1) / 4).
  const spent = (t) => (t === 0 ? 0 : 2 - 2 * score.normalCdf(1.959964 / Math.sqrt(t)));
  const errors = score.spendingIncrements(score.MAX_LOOKS);
  assert.equal(score.MAX_LOOKS, 4);
  for (const [index, error] of errors.entries()) {
    assert.ok(Math.abs(error - (spent((index + 1) / 4) - spent(index / 4))) < 1e-8);
  }
  // The errors add up to the one-sided error 0.05, so the looks together keep it (union bound).
  assert.ok(Math.abs(errors.reduce((total, error) => total + error, 0) - 0.05) < 1e-6);
  assert.deepEqual(
    errors.map((error) => error.toPrecision(3)),
    ['0.0000886', '0.00549', '0.0181', '0.0264'],
  );
  // The threshold of look k is 1 / alpha_k.
  assert.deepEqual(
    errors.map((error) => Math.round(1 / error)),
    [11290, 182, 55, 38],
  );
  // One look spends the whole error.
  assert.ok(Math.abs(score.spendingIncrements(1)[0] - 0.05) < 1e-6);
});
test('the betting test passes 40 cases without a difference and 5 cases with e = -1 at margin 4, as the rule gives', () => {
  // At margin 4 the bound of the mean e is 0.08, so the test bets against x = (e + 1) / 2 >= m = 0.54 with the cap
  // 0.9 / (1 - m). For these values the plug-in bet is above the cap at each case, so each case multiplies the capital
  // by 1 + 0.9 (m - x) / (1 - m), and the test passes when the product reaches 1 / 0.05 = 20.
  const m = 0.54;
  const factor = (x) => 1 + (0.9 * (m - x)) / (1 - m);
  const fill = (count, value) => Array.from({ length: count }, () => value);
  const smallest = (x) => Math.ceil(Math.log(20) / Math.log(factor(x)));
  // All-zero cases: 20 needs ceil(ln 20 / ln(1 + 0.9 * 0.04 / 0.46)) = ceil(39.76) = 40 cases.
  assert.equal(smallest(0.5), 40);
  for (const [count, passes] of [
    [39, false],
    [40, true],
  ]) {
    const result = score.bettingTest(fill(count, 0), { bound: 4 });
    assert.ok(Math.abs(result.capital - factor(0.5) ** count) < 1e-9);
    assert.deepEqual([result.rejected, result.threshold, result.stop], [passes, 20, passes ? count : null]);
  }
  // The smallest passing count is above the neutral-data limit: (1 - 4 / 50)^n <= 0.05 needs n >= 36.
  assert.equal(score.neutralDataLimit(4), 36);
  assert.ok(smallest(0.5) > score.neutralDataLimit(4));
  // Cases with e = -1: ceil(ln 20 / ln(1 + 0.9 * 0.54 / 0.46)) = ceil(4.67) = 5 cases.
  assert.equal(smallest(0), 5);
  for (const [count, passes] of [
    [4, false],
    [5, true],
  ]) {
    const result = score.bettingTest(fill(count, -1), { bound: 4 });
    assert.ok(Math.abs(result.capital - factor(0) ** count) < 1e-9);
    assert.equal(result.rejected, passes);
  }
  // A case with e = 1 keeps 1 - 0.9 of the capital; the test stops at the first case that reaches 20.
  assert.ok(Math.abs(score.bettingTest([1], { bound: 4 }).capital - 0.1) < 1e-12);
  assert.equal(score.bettingTest(fill(60, -1), { bound: 4 }).stop, 5);
  // The other sides: `above` mirrors `below`, and `outside` halves each side.
  assert.equal(score.bettingTest(fill(40, 0), { bound: -4, side: 'above' }).rejected, true);
  assert.equal(score.bettingTest(fill(60, 0), { bound: 4, side: 'outside' }).rejected, false);
  // The seed fixes the case order, so a rerun gives the same capital.
  const mixed = [...fill(50, 0), 0.5, -0.5, 1, -1];
  assert.equal(score.bettingTest(mixed, { bound: 4 }).capital, score.bettingTest(mixed, { bound: 4 }).capital);
  assert.notEqual(
    score.bettingTest(mixed, { bound: 4, seed: 2 }).capital,
    score.bettingTest(mixed, { bound: 4 }).capital,
  );
  // The neutral-data limit of each margin: ceil(ln 0.05 / ln(1 - margin / 50)).
  assert.deepEqual([score.neutralDataLimit(2), score.neutralDataLimit(0)], [74, Number.POSITIVE_INFINITY]);
  assert.throws(() => score.bettingTest([0], { bound: 50 }), /^Error: bettingTest needs a bound between -50 and 50/);
  assert.throws(() => score.bettingTest([2], { bound: 4 }), /^Error: bettingTest needs values from -1 to 1$/);
  assert.throws(() => score.bettingTest([0], { bound: 4, side: 'both' }), /^Error: bettingTest takes the side below/);
});
// The runs of an arm on the cases of `known` (case id to known ids) with `runs` runs per case, as gridFixture takes
// them; `found(caseId, run)` gives the known ids that the run found.
const caseRuns = (arm, known, runs, found) =>
  Object.keys(known).flatMap((caseId) =>
    Array.from({ length: runs }, (_, index) => ({
      case: caseId,
      config: 'xhigh-fast',
      arm,
      run: index + 1,
      single: true,
      rounds: [[60, 600, null, 0, found(caseId, index + 1)]],
    })),
  );
// The decision rows of C1 against the reference B0, by label (with `B0` for `B0-xhigh-fast`), from the runs of
// `candidate` and `reference` (see caseRuns) on the cases of `known`.
function decisionRows(known, { candidate, reference, runs = 1, margin = 4, seeded = {} }) {
  const cases = Object.fromEntries(
    Object.entries(known).map(([id, ids]) => [id, { split: 'dev', known: ids, seeded: seeded[id] }]),
  );
  const fixture = gridFixture(cases, [
    ...caseRuns('B0', known, runs, reference),
    ...caseRuns('C1', known, runs, candidate),
  ]);
  const arms = ['B0-xhigh-fast', 'C1-xhigh-fast'];
  const report = renderReport(scoreRuns(fixture), { arms, reference: 'B0-xhigh-fast', margin });
  const rows = new Map();
  for (const line of tableAfter(report, '### Decision: dev').slice(2)) {
    const [label, , cell] = line.slice(2, -2).split(' | ');
    rows.set(label.replaceAll('B0-xhigh-fast', 'B0'), cell);
  }
  return rows;
}
const oneKnown = (count, first = 1) =>
  Object.fromEntries(Array.from({ length: count }, (_, index) => [`code-${first + index}`, ['D1']]));
const everyId = (known) => (caseId) => known[caseId];
const NOT_WORSE = 'Not worse than B0 by 4 escaped per 50 known: betting test on N, if assumption S holds';
const EQUIVALENT =
  'Equivalent to B0 within 4 escaped per 50 known: two one-sided betting tests on N, if assumption S holds';
const FIXED_CORPUS = 'Not worse than B0 by 4 on these cases, run noise only: a check, not a ship decision';
const NEUTRAL_LIMIT = 'Neutral-data limit at 4 per 50 known (information)';
const N_ROW = 'Escaped per 50 known difference from B0, each case weighs 1 (N)';
// The not-worse row and the equivalence row of a decision table, without the fixed-corpus check.
const DECISION_ROW = /^\| (Not worse than \S+ by [\d.]+ escaped|Equivalent to)/;
test('the not-worse row decides on N, so a loss in one heavy case weighs as one case, and W stays information', () => {
  // 60 cases with one known defect that both arms find, and code-61 with 14 known defects, of which C1 escapes 7.
  const heavy = Array.from({ length: 14 }, (_, index) => `D${index + 1}`);
  const known = { ...oneKnown(60), 'code-61': heavy };
  const rows = decisionRows(known, {
    reference: everyId(known),
    candidate: (caseId) => (caseId === 'code-61' ? heavy.slice(7) : known[caseId]),
  });
  // W: 7 escaped of 74 known, 4.73 per 50 known, above the margin of 4. N: e = 0.5 in one of 61 cases, 0.41.
  assert.equal(rows.get('Escaped per 50 known'), '4.73');
  assert.equal(rows.get(N_ROW), '0.41');
  assert.equal(rows.get('Cases with known defects shared with B0'), '61');
  assert.equal(rows.get(NOT_WORSE), 'pass (capital 20.33; threshold 20)');
  // The W interval stays in the report as information; its upper end is above the margin.
  assert.equal(rows.get('Escaped per 50 known difference from B0, 90% interval'), '[0.00, 10.50]');
  assert.equal(rows.get(NEUTRAL_LIMIT), 'neutral-data limit: 61 of 36 cases with known defects');
  // With one run per case, the fixed-corpus check has no run noise to draw: its interval is N itself.
  assert.equal(rows.get(FIXED_CORPUS), 'pass (90% run interval [0.41, 0.41])');
});
test('the per-run statistic fails a candidate that finds a defect in half of its runs only', () => {
  // 60 cases, 2 runs per arm. B0 finds D1 in each run; C1 finds it in run 1 only in code-1 to code-10. Each of these
  // cases has e = (0.5 - 0) / 1 = 0.5, so N = 50 * 5 / 60 = 4.17, above the margin. A count of the defects that any
  // run found would show no difference.
  const known = oneKnown(60);
  const halfRun = new Set(Object.keys(known).slice(0, 10));
  const rows = decisionRows(known, {
    runs: 2,
    reference: everyId(known),
    candidate: (caseId, run) => (halfRun.has(caseId) && run === 2 ? [] : known[caseId]),
  });
  assert.equal(rows.get('Cases with an escaped difference from B0'), '10');
  assert.equal(rows.get(N_ROW), '4.17');
  assert.equal(rows.get(NOT_WORSE), 'no pass (capital 0.34; threshold 20)');
  // The fixed-corpus check bootstraps the runs of these cases only. Its upper end is above the margin too.
  assert.equal(rows.get(FIXED_CORPUS), 'no pass (90% run interval [2.50, 5.83])');
});
test('the equivalence row runs two one-sided betting tests and fails in each direction', () => {
  const known = oneKnown(60);
  const all = everyId(known);
  const none = () => [];
  // Equal arms: the not-worse test passes at 40 of the 60 cases (see the hand computation above), and so does the
  // mirrored test of a mean e of -0.08 or less.
  const equal = decisionRows(known, { candidate: all, reference: all });
  const capital = (1 + (0.9 * 0.04) / 0.46) ** 40;
  assert.equal(equal.get(NOT_WORSE), `pass (capital ${capital.toFixed(2)}; threshold 20)`);
  assert.equal(equal.get(EQUIVALENT), `yes (capitals ${capital.toFixed(2)}, ${capital.toFixed(2)}; threshold 20)`);
  assert.equal(equal.get(FIXED_CORPUS), 'pass (90% run interval [0.00, 0.00])');
  assert.equal(equal.get(NEUTRAL_LIMIT), 'neutral-data limit: 60 of 36 cases with known defects');
  // C1 better in each case: not worse passes at 5 cases, but the test of a mean e of -0.08 or less does not reject.
  const better = decisionRows(known, { candidate: all, reference: none });
  assert.equal(better.get(N_ROW), '-50.00');
  assert.equal(better.get(NOT_WORSE), `pass (capital ${((1 + (0.9 * 0.54) / 0.46) ** 5).toFixed(2)}; threshold 20)`);
  assert.match(better.get(EQUIVALENT), /^no \(capitals /);
  // C1 worse in each case: neither test passes.
  const worse = decisionRows(known, { candidate: none, reference: all });
  assert.match(worse.get(NOT_WORSE), /^no pass \(capital /);
  assert.match(worse.get(EQUIVALENT), /^no \(capitals /);
  assert.equal(worse.get(FIXED_CORPUS), 'no pass (90% run interval [50.00, 50.00])');
});
test('the decision table gives the share of seeded cases when the case metadata tells it', () => {
  const known = oneKnown(4);
  const all = everyId(known);
  const seededRow = 'Seeded cases of the shared cases with known defects';
  const seeded = { 'code-1': true, 'code-2': false, 'code-3': false, 'code-4': false };
  assert.equal(decisionRows(known, { candidate: all, reference: all, seeded }).get(seededRow), '1 of 4 (0.25)');
  // One case that does not tell it gives no share.
  const partial = { ...seeded, 'code-4': undefined };
  assert.equal(decisionRows(known, { candidate: all, reference: all, seeded: partial }).get(seededRow), '-');
  // `report` reads the flag from case.json: a code case with a patch is seeded, and a plan case does not tell it.
  const ws = path.join(scratch(), 'ws');
  const always = () => true;
  const runs = [...singleRuns('B0', 2, 1, always), ...singleRuns('C1', 2, 1, always)];
  writeFixture(ws, gridFixture(oneKnownCases(2), runs));
  put(ws, 'code-1/case.json', { id: 'code-1', kind: 'code', split: 'dev', patch: 'plant.patch' });
  put(ws, 'code-2/case.json', { id: 'code-2', kind: 'code', split: 'dev' });
  const cli = ['report', ws, '--arms', 'B0-xhigh-fast,C1-xhigh-fast', '--reference', 'B0-xhigh-fast'];
  const row = () =>
    tableAfter(readText(path.join(ws, 'report.md')), '### Decision: dev').find((line) => line.startsWith('| Seeded'));
  main(cli);
  assert.equal(row(), `| ${seededRow} | - | 1 of 2 (0.50) |`);
  put(ws, 'code-2/case.json', { id: 'code-2', kind: 'plan', split: 'dev' });
  main(cli);
  assert.equal(row(), `| ${seededRow} | - | - |`);
  assert.throws(() => main([...cli, '--margin', '50']), { message: 'report --margin needs a margin below 50, not 50' });
});
test('the report prints the batch drift of each A/A control arm with the two-sided betting test', () => {
  // dev: B3, its control copy AB3, and C3 on 6 cases; AB3 runs like B3. heldout: B3 and AB3 on 5 cases, where AB3
  // escapes D1 in 3 of them.
  const cases = { ...oneKnownCases(6), ...oneKnownCases(5, 'heldout', 7) };
  const runs = [
    ...singleRuns('B3', 6, 1, () => true),
    ...singleRuns('AB3', 6, 1, () => true),
    ...singleRuns('C3', 6, 1, () => true),
    ...singleRuns('B3', 5, 1, () => true, 7),
    ...singleRuns('AB3', 5, 1, (index) => index >= 3, 7),
  ];
  const scores = scoreRuns(gridFixture(cases, runs));
  const drift = (report, split) => tableAfter(report, `### Batch drift: ${split}`);
  const header = [
    '| Control | Baseline | Cases shared | Cases with known defects | Cases with a difference | Escaped per 50 known difference, 90% interval | N | Two-sided capital | Drift |',
    '| --- | --- | ---: | ---: | ---: | --- | ---: | ---: | --- |',
  ];
  const withMargin = renderReport(scores, { margin: 4 });
  assert.deepEqual(drift(withMargin, 'dev'), [
    ...header,
    '| AB3-xhigh-fast | B3-xhigh-fast | 6 | 6 | 0 | [0.00, 0.00] | 0.00 | 0.33 | not shown to leave ±4 |',
  ]);
  // Five shared cases with known defects are too few for a drift check.
  assert.match(
    drift(withMargin, 'heldout')[2],
    /^\| AB3-xhigh-fast \| B3-xhigh-fast \| 5 \| 5 \| 3 \| \[.*\] \| .* \| too few cases with known defects \(5 of 6\) \|$/,
  );
  // Six shared cases are too few when five of them are controls without known defects: they give the test no value.
  const controls = {
    ...Object.fromEntries(Array.from({ length: 5 }, (_, index) => [`code-${index + 1}`, { split: 'dev', known: [] }])),
    'code-6': { split: 'dev', known: ['D1'] },
  };
  const onlyLast = (index) => index === 5;
  const mostlyControls = scoreRuns(
    gridFixture(controls, [...singleRuns('B3', 6, 1, onlyLast), ...singleRuns('AB3', 6, 1, onlyLast)]),
  );
  assert.match(
    drift(renderReport(mostlyControls, { margin: 4 }), 'dev')[2],
    /^\| AB3-xhigh-fast \| B3-xhigh-fast \| 6 \| 1 \| 0 \| .* \| too few cases with known defects \(1 of 6\) \|$/,
  );
  // Six shared control cases and no case with known defects: the check names the count, not a missing interval.
  const onlyControls = Object.fromEntries(
    Array.from({ length: 6 }, (_, index) => [`code-${index + 1}`, { split: 'dev', known: [] }]),
  );
  const never = () => false;
  const allControls = scoreRuns(
    gridFixture(onlyControls, [...singleRuns('B3', 6, 1, never), ...singleRuns('AB3', 6, 1, never)]),
  );
  assert.match(
    drift(renderReport(allControls, { margin: 4 }), 'dev')[2],
    /^\| AB3-xhigh-fast \| B3-xhigh-fast \| 6 \| 0 \| 0 \| - \| - \| - \| too few cases with known defects \(0 of 6\) \|$/,
  );
  // Without a margin, the report gives the drift values and no check.
  assert.match(drift(renderReport(scores), 'dev')[2], /\| \[0\.00, 0\.00\] \| 0\.00 \| - \| no margin \|$/);
  // A control copy is no configuration column: the configuration table counts the B3 and C3 runs only.
  assert.ok(tableAfter(withMargin, '### Decision: dev').includes('| Runs | 12 |'));
  // AB3 escapes D1 in each of 8 cases that B3 finds, so e = 1 in each case. Half of K+ at 0.54 grows by 1 + (0.9 /
  // 0.54) 0.46 per case, and it reaches 20 at the 7th case: the drift leaves ±4.
  const drifting = scoreRuns(
    gridFixture(oneKnownCases(8), [...singleRuns('B3', 8, 1, () => true), ...singleRuns('AB3', 8, 1, () => false)]),
  );
  const stop = (0.5 * (1 + (0.9 / 0.54) * 0.46) ** 7).toFixed(2);
  assert.equal(
    drift(renderReport(drifting, { margin: 4 }), 'dev')[2],
    `| AB3-xhigh-fast | B3-xhigh-fast | 8 | 8 | 8 | [50.00, 50.00] | 50.00 | ${stop} | leaves ±4 |`,
  );
  // A workspace without a control arm has no drift section.
  const withoutControl = renderReport(scoreRuns(gridFixture(oneKnownCases(6), runs.slice(0, 6))));
  assert.equal(withoutControl.includes('## Batch drift'), false);
});
// A run-plan.json for the cases `caseIds` and the arms `arms` ([arm, configuration name], the reference first), with
// the runs 1 to `runs` of each, one run per look, as `prepare.mjs sequential-plan` writes it.
const runPlanOf = (caseIds, arms, runs, split = 'dev') => {
  const [reference, ...candidates] = arms.map(([arm, config]) => ({ arm, config, folder: `${arm}-${config}` }));
  const keys = caseIds.flatMap((caseId) =>
    [reference, ...candidates].flatMap((entry) =>
      Array.from({ length: runs }, (_, index) => ({ case: caseId, split, ...entry, run: index + 1, look: index + 1 })),
    ),
  );
  return { reference, candidates, keys };
};
const B0_C1 = [
  ['B0', 'xhigh-fast'],
  ['C1', 'xhigh-fast'],
];
const caseIdsOf = (count) => Array.from({ length: count }, (_, index) => `code-${index + 1}`);
// The cells of the rows of a sequential table.
const lookRows = (report, split = 'dev') =>
  tableAfter(report, `### Sequential looks: ${split}`)
    .slice(2)
    .map((row) => row.slice(2, -2).split(' | '));
test('each sequential look runs the betting test at the error that it spends, with the threshold 1 / error', () => {
  const arms = ['B0-xhigh-fast', 'C1-xhigh-fast'];
  const runPlan = runPlanOf(caseIdsOf(60), B0_C1, 4);
  const looks = (candidate, reference, options = { sequential: true }) => {
    const fixture = gridFixture(oneKnownCases(60), [
      ...singleRuns('B0', 60, 4, reference),
      ...singleRuns('C1', 60, 4, candidate),
    ]);
    // A fixed-sample report needs a workspace without a declaration (see renderReport).
    const scores = { ...scoreRuns(fixture), runPlan: options.sequential ? runPlan : null };
    const report = renderReport(scores, { arms, reference: 'B0-xhigh-fast', margin: 4, ...options });
    const decision = tableAfter(report, '### Decision: dev').filter((row) => DECISION_ROW.test(row));
    return options.sequential ? { decision, rows: lookRows(report) } : { decision };
  };
  const always = () => true;
  const never = () => false;
  // Equal arms: each look has 60 cases without a difference. Their capital grows by 1 + 0.9 * 0.04 / 0.46 per case,
  // to about 92 after 60 cases: below the thresholds 11290 and 182 of looks 1 and 2. Look 3 has the threshold 55.4 and
  // stops after ceil(ln 55.4 / ln(1 + 0.9 * 0.04 / 0.46)) = 54 cases with a pass. The not-better test is the mirror of
  // the not-worse test, so the equivalence decision gives yes at look 3 too.
  const { decision, rows: equal } = looks(always, always);
  // The sequential looks are the decision: the decision rows give no result of their own at the threshold 20, which
  // the same data reach in a fixed-sample report of a workspace without run-plan.json.
  assert.deepEqual(
    decision.map((row) => row.split(' | ').at(-1)),
    ['see sequential looks: not-worse decision |', 'see sequential looks: equivalence decision |'],
  );
  assert.match(looks(always, always, {}).decision[0], /\| pass \(capital [\d.]+; threshold 20\) \|$/);
  assert.deepEqual(
    equal.map((row) => [row[1], row[2], row[3], row[4], row[5], row[11], row[12]]),
    [
      ['1', '60 / 60', '60', '0.0000886', '11290', 'continue', 'continue'],
      ['2', '120 / 120', '60', '0.00549', '182', 'continue', 'continue'],
      ['3', '180 / 180', '60', '0.0181', '55', 'pass: stop', 'yes: stop'],
      ['4', '240 / 240', '60', '0.0264', '38', 'after the stop at look 3', 'after the stop at look 3'],
    ],
  );
  const factor = 1 + (0.9 * 0.04) / 0.46;
  assert.equal(equal[0][7], (factor ** 60).toFixed(2));
  assert.equal(equal[0][9], (factor ** 60).toFixed(2));
  const stopAt = Math.ceil(Math.log(1 / score.spendingIncrements(4)[2]) / Math.log(factor));
  assert.equal(stopAt, 54);
  assert.equal(equal[2][7], (factor ** stopAt).toFixed(2));
  // A candidate that escapes D1 in every run of every case has e = 1: the worse test reaches 11290 at look 1, so the
  // not-worse decision fails and the equivalence decision gives no.
  const { rows: worse } = looks(never, always);
  assert.deepEqual(
    worse.map((row) => [row[1], row[6], row[11], row[12]]),
    [
      ['1', '50.00', 'fail: stop', 'no: stop'],
      ['2', '50.00', 'after the stop at look 1', 'after the stop at look 1'],
      ['3', '50.00', 'after the stop at look 1', 'after the stop at look 1'],
      ['4', '50.00', 'after the stop at look 1', 'after the stop at look 1'],
    ],
  );
  // A candidate that finds D1 in every run where the reference escapes it has e = -1: the not-worse decision passes at
  // look 1, but the better test also rejects there, so the equivalence decision gives no.
  const { rows: better } = looks(always, never);
  assert.deepEqual(
    better.map((row) => [row[1], row[6], row[11], row[12]]),
    [
      ['1', '-50.00', 'pass: stop', 'no: stop'],
      ['2', '-50.00', 'after the stop at look 1', 'after the stop at look 1'],
      ['3', '-50.00', 'after the stop at look 1', 'after the stop at look 1'],
      ['4', '-50.00', 'after the stop at look 1', 'after the stop at look 1'],
    ],
  );
  // The command line takes --sequential as a switch with --reference and --margin. The workspace has no
  // run-plan.json, so no look decides.
  const ws = path.join(scratch(), 'ws');
  const cliRuns = [...singleRuns('B0', 12, 2, always), ...singleRuns('C1', 12, 2, always)];
  writeFixture(ws, gridFixture(oneKnownCases(12), cliRuns));
  const cli = ['report', ws, '--arms', arms.join(','), '--reference', 'B0-xhigh-fast'];
  assert.equal(main([...cli, '--sequential', '--margin', '4']), 'report.md: 48 runs');
  const noFile = lookRows(readText(path.join(ws, 'report.md')));
  assert.deepEqual(
    noFile.map((row) => [row[1], row[11], row[12]]),
    [
      ['1', 'incomplete look (no run-plan.json)', 'incomplete look (no run-plan.json)'],
      ['2', 'incomplete look (no run-plan.json)', 'incomplete look (no run-plan.json)'],
    ],
  );
  assert.throws(() => main([...cli, '--sequential']), {
    message: 'report --sequential needs --reference and --margin',
  });
  // Scores without a run plan hold every look too.
  const noPlan = renderReport(scoreRuns(gridFixture(oneKnownCases(12), cliRuns)), {
    arms,
    reference: arms[0],
    margin: 4,
    sequential: true,
  });
  assert.ok(lookRows(noPlan).every((row) => row[11] === 'incomplete look (no run-plan.json)'));
});
test('a sequential look decides only when each run of the run plan has a valid run', () => {
  // 60 equal cases with 4 runs per column, which pass at look 3 when complete. C1 has no run 3 of code-5, and run 2
  // of B0 in code-9 is invalid: it has no transcript facts.
  const always = () => true;
  const runs = [...singleRuns('B0', 60, 4, always), ...singleRuns('C1', 60, 4, always)].filter(
    (run) => !(run.arm === 'C1' && run.case === 'code-5' && run.run === 3),
  );
  const fixture = gridFixture(oneKnownCases(60), runs);
  fixture.metas['code-9/B0-xhigh-fast/run-2'].reviewers = {};
  const arms = ['B0-xhigh-fast', 'C1-xhigh-fast'];
  const runPlan = runPlanOf(caseIdsOf(60), B0_C1, 4);
  const scores = { ...scoreRuns(fixture), runPlan };
  const invalidRun = scores.runs.find(
    (run) => run.case === 'code-9' && run.arm === 'B0-xhigh-fast' && run.run === 'run-2',
  );
  assert.ok(invalidRun.invalid.length > 0);
  const report = renderReport(scores, { arms, reference: 'B0-xhigh-fast', margin: 4, sequential: true });
  const missingBoth = 'incomplete look (code-5 C1-xhigh-fast run-3, code-9 B0-xhigh-fast run-2)';
  assert.deepEqual(
    lookRows(report).map((row) => [row[1], row[2], row[11], row[12]]),
    [
      ['1', '60 / 60', 'continue', 'continue'],
      ['2', '120 / 119', ...Array(2).fill('incomplete look (code-9 B0-xhigh-fast run-2)')],
      ['3', '179 / 179', missingBoth, missingBoth],
      ['4', '239 / 239', missingBoth, missingBoth],
    ],
  );
  // A run without a configuration in its meta.json holds the look, also when the plan has a key for it.
  const singles = [...singleRuns('B0', 12, 1, always), ...singleRuns('C1', 12, 1, always)];
  const unconfigured = gridFixture(oneKnownCases(12), singles);
  delete unconfigured.metas['code-4/C1-xhigh-fast/run-1'].config;
  const unconfiguredReport = renderReport(
    { ...scoreRuns(unconfigured), runPlan: runPlanOf(caseIdsOf(12), B0_C1, 1) },
    { arms, reference: arms[0], margin: 4, sequential: true },
  );
  const noConfig = 'incomplete look (code-4 C1-xhigh-fast run-1 has no configuration)';
  assert.equal(lookRows(unconfiguredReport)[0][11], noConfig);
  // On a workspace, report reads the keys of run-plan.json only. C1 has no arm folder in code-7 and no run 2 of
  // code-3; the plan expects both, so look 1 and look 2 are incomplete.
  const ws = path.join(scratch(), 'ws');
  const cliRuns = [...singleRuns('B0', 12, 2, always), ...singleRuns('C1', 12, 2, always)];
  const skipped = (run) => run.arm === 'C1' && (run.case === 'code-7' || (run.case === 'code-3' && run.run === 2));
  const kept = cliRuns.filter((run) => !skipped(run));
  writeFixture(ws, gridFixture(oneKnownCases(12), kept));
  assert.equal(fs.existsSync(path.join(ws, 'code-7', 'C1-xhigh-fast')), false);
  put(ws, 'run-plan.json', runPlanOf(caseIdsOf(12), B0_C1, 2));
  main(['report', ws, '--arms', arms.join(','), '--reference', arms[0], '--margin', '4', '--sequential']);
  assert.deepEqual(
    lookRows(readText(path.join(ws, 'report.md'))).map((row) => row[11]),
    [
      'incomplete look (code-7 C1-xhigh-fast run-1)',
      'incomplete look (code-3 C1-xhigh-fast run-2, code-7 C1-xhigh-fast run-1, code-7 C1-xhigh-fast run-2)',
    ],
  );
  // A run that the plan does not name holds the look too.
  const withoutCode1 = runPlanOf(caseIdsOf(12), B0_C1, 2);
  put(ws, 'run-plan.json', { ...withoutCode1, keys: withoutCode1.keys.filter((key) => key.case !== 'code-1') });
  main(['report', ws, '--arms', arms.join(','), '--reference', arms[0], '--margin', '4', '--sequential']);
  assert.match(
    lookRows(readText(path.join(ws, 'report.md')))[0][11],
    /^incomplete look \(code-1 B0-xhigh-fast run-1 not in run-plan\.json, code-1 C1-xhigh-fast run-1 not in run-plan\.json, code-7 C1-xhigh-fast run-1\)$/,
  );
});
test('a sequential effort comparison declares both configurations and compares the reference with each candidate', () => {
  // The reference B0 at xhigh-fast against the candidate B0 at high: one arm at two configurations, each with its own
  // keys. 60 equal cases with 3 runs each pass the not-worse test at look 3, the last declared look.
  const known = oneKnownCases(60);
  const configs = ['xhigh-fast', 'high'];
  const runsOf = (skip = () => false) =>
    caseIdsOf(60).flatMap((caseId) =>
      [1, 2, 3].flatMap((run) =>
        configs
          .filter((config) => !skip(config, caseId, run))
          .map((config) => ({
            case: caseId,
            config,
            arm: 'B0',
            run,
            single: true,
            rounds: [[60, 600, null, 0, ['D1']]],
          })),
      ),
    );
  const plan = runPlanOf(
    caseIdsOf(60),
    configs.map((config) => ['B0', config]),
    3,
  );
  const options = { arms: ['B0-xhigh-fast', 'B0-high'], reference: 'B0-xhigh-fast', margin: 4, sequential: true };
  const looks = (fixture) =>
    lookRows(renderReport({ ...scoreRuns(fixture), runPlan: plan }, options)).map((row) => [row[0], row[1], row[11]]);
  assert.deepEqual(looks(gridFixture(known, runsOf())), [
    ['B0-high', '1', 'continue'],
    ['B0-high', '2', 'continue'],
    ['B0-high', '3', 'pass: stop'],
  ]);
  // The candidate configuration misses run 2 of code-5, so looks 2 and 3 wait for it.
  const missing = runsOf((config, caseId, run) => config === 'high' && caseId === 'code-5' && run === 2);
  assert.deepEqual(
    looks(gridFixture(known, missing)).map((row) => row[2]),
    ['continue', 'incomplete look (code-5 B0-high run-2)', 'incomplete look (code-5 B0-high run-2)'],
  );
  // A run of the candidate folder that ran at the other configuration does not count for its key.
  const swapped = gridFixture(known, runsOf());
  swapped.metas['code-6/B0-high/run-1'].config = CONFIGS['xhigh-fast'];
  swapped.metas['code-6/B0-high/run-1'].reviewers.full = provenCost(CONFIGS['xhigh-fast'], 60, 600);
  assert.equal(
    looks(swapped)[0][2],
    'incomplete look (code-6 B0-high run-1 has the configuration xhigh-fast, not high)',
  );
  // The report compares the declared reference, so --reference must name it.
  const scores = { ...scoreRuns(gridFixture(known, runsOf())), runPlan: plan };
  // The text names the command that writes the declaration.
  assert.match(
    renderReport(scores, options),
    /run-plan\.json, which prepare\.mjs sequential-plan writes once before any case,/,
  );
  assert.throws(() => renderReport(scores, { ...options, reference: 'B0-high' }), {
    message:
      'report --sequential compares the reference B0-xhigh-fast of run-plan.json with its candidates; give --reference B0-xhigh-fast',
  });
});
test('with run-plan.json, the decision table and the sequential looks of report --sequential take the declared folders', () => {
  // The reference B0 at xhigh-fast, and the candidates B0 at high and C1 at xhigh-fast, over 12 cases and 1 look.
  const folders = [
    ['B0', 'xhigh-fast'],
    ['B0', 'high'],
    ['C1', 'xhigh-fast'],
  ];
  const runs = caseIdsOf(12).flatMap((caseId) =>
    folders.map(([arm, config]) => ({
      case: caseId,
      config,
      arm,
      run: 1,
      single: true,
      rounds: [[60, 600, null, 0, ['D1']]],
    })),
  );
  const scores = { ...scoreRuns(gridFixture(oneKnownCases(12), runs)), runPlan: runPlanOf(caseIdsOf(12), folders, 1) };
  const report = (options) =>
    renderReport(scores, { reference: 'B0-xhigh-fast', margin: 4, sequential: true, ...options });
  const refused = (detail) =>
    `report --sequential takes its columns from run-plan.json: give --arms with the declared folders B0-xhigh-fast, B0-high, C1-xhigh-fast in any order (${detail})`;
  // --arms that leave out a declared candidate, that add a folder, or --configs in place of --arms are refused.
  assert.throws(() => report({ arms: ['B0-xhigh-fast', 'B0-high'] }), { message: refused('missing C1-xhigh-fast') });
  assert.throws(() => report({ arms: ['B0-xhigh-fast', 'B0-high', 'C1-high'] }), {
    message: refused('missing C1-xhigh-fast; not declared C1-high'),
  });
  assert.throws(() => report({ configs: ['xhigh-fast', 'high'], reference: 'xhigh-fast' }), {
    message: refused('missing B0-xhigh-fast, B0-high, C1-xhigh-fast'),
  });
  // The declaration makes the report sequential: without --sequential, no fixed-sample decision row at threshold 20.
  assert.throws(() => report({ arms: ['B0-xhigh-fast', 'B0-high', 'C1-xhigh-fast'], sequential: undefined }), {
    message:
      'report on a workspace with run-plan.json needs --sequential: the declaration of prepare.mjs sequential-plan makes the looks the decision',
  });
  // The declared folders in another order give each declared candidate the exact tests and a sequential look.
  const text = report({ arms: ['C1-xhigh-fast', 'B0-xhigh-fast', 'B0-high'] });
  const decision = tableAfter(text, '### Decision: dev').map((row) => row.slice(2, -2).split(' | '));
  const header = decision[0];
  for (const label of ['Wrong findings', 'Unknown ratings']) {
    const row = decision.find((cells) => cells[0] === `${label} more than B0-xhigh-fast, one-sided exact Poisson p`);
    assert.deepEqual(
      ['C1-xhigh-fast', 'B0-high'].map((folder) => /^\d\.\d{4}$/.test(row[header.indexOf(folder)])),
      [true, true],
    );
  }
  assert.deepEqual(
    lookRows(text).map((row) => row[0]),
    ['C1-xhigh-fast', 'B0-high'],
  );
});
test('a deciding report holds its decisions until the second judge answers every item of its sample', () => {
  // 40 equal cases pass the not-worse test at margin 4. Every run finds D1, so the sample holds 80 match answers.
  const ws = path.join(scratch(), 'ws');
  const always = () => true;
  const fixture = gridFixture(oneKnownCases(40), [
    ...singleRuns('B0', 40, 1, always),
    ...singleRuns('C1', 40, 1, always),
  ]);
  writeFixture(ws, fixture);
  const cli = ['report', ws, '--arms', 'B0-xhigh-fast,C1-xhigh-fast', '--reference', 'B0-xhigh-fast', '--margin', '4'];
  const cells = () =>
    tableAfter(readText(path.join(ws, 'report.md')), '### Decision: dev')
      .filter((row) => DECISION_ROW.test(row))
      .map((row) => row.split(' | ').at(-1).slice(0, -2));
  // No judgments-second.json: the sample is the one that `sample` writes with its default seed.
  main(cli);
  assert.deepEqual(cells(), ['second judge incomplete (0 of 80)', 'second judge incomplete (0 of 80)']);
  // A second judge that answers one item of the sample.
  main(['sample', ws]);
  const sample = readJson(path.join(ws, 'second-sample.json'));
  const answer = (pair) => fixture.judgments.matches.find((entry) => entry.finding === pair.finding);
  put(ws, 'judgments-second.json', { matches: [answer(sample.pairs[0])] });
  main(cli);
  assert.deepEqual(cells(), ['second judge incomplete (1 of 80)', 'second judge incomplete (1 of 80)']);
  // The sequential looks wait for the second judge too, also with a complete run plan.
  put(ws, 'run-plan.json', runPlanOf(caseIdsOf(40), B0_C1, 1));
  main([...cli, '--sequential']);
  const look = tableAfter(readText(path.join(ws, 'report.md')), '### Sequential looks: dev')[2];
  assert.match(look, /\| second judge incomplete \(1 of 80\) \|$/);
  // A workspace with run-plan.json takes only sequential reports, so the fixed-sample checks below go without it.
  fs.rmSync(path.join(ws, 'run-plan.json'));
  // A complete second judge lets the tests decide.
  put(ws, 'judgments-second.json', { matches: sample.pairs.map(answer) });
  main(cli);
  assert.match(cells()[0], /^pass \(capital /);
  assert.ok(
    readText(path.join(ws, 'report.md')).includes('The second judge answered 80 of the 80 items of its sample.'),
  );
  // Without a margin, the report decides nothing, so it needs no second judge.
  put(ws, 'judgments-second.json', { matches: [] });
  main(cli.slice(0, -2));
  assert.deepEqual(cells(), []);
});
test('a match that the first judge adds after the second judge answered its sample holds the decision', () => {
  // 60 cases: both arms find D1 in code-1 to code-59 and escape it in code-60, so the sample holds 118 match answers.
  const ws = path.join(scratch(), 'ws');
  const fixtureOf = (candidate) =>
    gridFixture(oneKnownCases(60), [
      ...singleRuns('B0', 60, 1, (index) => index < 59),
      ...singleRuns('C1', 60, 1, candidate),
    ]);
  const before = fixtureOf((index) => index < 59);
  writeFixture(ws, before);
  main(['sample', ws, '--seed', '5']);
  const sample = readJson(path.join(ws, 'second-sample.json'));
  // The sample records its seed, so report can derive it again.
  assert.equal(sample.seed, 5);
  const answer = (judgments) => (pair) => judgments.matches.find((entry) => entry.finding === pair.finding);
  put(ws, 'judgments-second.json', { matches: sample.pairs.map(answer(before.judgments)) });
  const cli = ['report', ws, '--arms', 'B0-xhigh-fast,C1-xhigh-fast', '--reference', 'B0-xhigh-fast', '--margin', '4'];
  const notWorse = () =>
    tableAfter(readText(path.join(ws, 'report.md')), '### Decision: dev')
      .find((row) => DECISION_ROW.test(row))
      .split(' | ')
      .at(-1)
      .slice(0, -2);
  main(cli);
  assert.match(notWorse(), /^pass \(capital /);
  // A later run of C1 finds D1 in code-60, and the first judge answers its finding with a match. The stored sample
  // and its answers stay as they were, but the sample derived from the current answers holds the new match.
  const after = fixtureOf(() => true);
  writeFixture(ws, after);
  main(cli);
  assert.equal(notWorse(), 'second judge incomplete (118 of 119)');
  // A new sample with the same seed and an answer for the new match let the test decide again.
  main(['sample', ws, '--seed', '5']);
  const current = readJson(path.join(ws, 'second-sample.json'));
  put(ws, 'judgments-second.json', { matches: current.pairs.map(answer(after.judgments)) });
  main(cli);
  assert.match(notWorse(), /^pass \(capital /);
});
// The seeded power simulation takes about 2 s alone and more on a loaded runner, so the 5 s default timeout of bun is too short.
test('power prints the noise, the neutral-data limit, the corpus cases per reviewer, and a seeded size table', {
  timeout: 60_000,
}, () => {
  // B3 escapes D1 in code-1 and its control copy AB3 in code-2, so the differences of AB3 are -1, 1, 0, and 0.
  const root = scratch();
  const ws = path.join(root, 'ws');
  const fixture = gridFixture(oneKnownCases(4), [
    ...singleRuns('B3', 4, 1, (index) => index !== 0),
    ...singleRuns('AB3', 4, 1, (index) => index !== 1),
  ]);
  writeFixture(ws, fixture);
  // The standard error of W is 50 sqrt(4/3 * 2) / 3 for 3 known defects; N leaves out the case without one.
  const noise = score.aaNoise([
    { values: [1], references: [0], known: 1 },
    { values: [0], references: [1], known: 1 },
    { values: [0], references: [0], known: 1 },
    { values: [0], references: [0], known: 0 },
  ]);
  assert.ok(Math.abs(noise.se - (50 * Math.sqrt((4 / 3) * 2)) / 3) < 1e-9);
  assert.deepEqual([noise.withKnown, noise.normalized], [3, 0]);
  // A corpus: dev has a code case with 1 known defect, a plan case with 2, and a control. heldout has a code-delta
  // case with a key list of 3, a code case whose key is only in the keys folder, a plan-delta case with a key object of
  // 2, a plan case with a key of 14, a plan case without a key file, and a file that is no case.
  const cases = path.join(root, 'cases');
  const keys = path.join(root, 'keys');
  const known = (count) => Array.from({ length: count }, (_, index) => ({ id: `K${index + 1}`, title: 'Hidden' }));
  put(cases, 'dev/code-1.json', { id: 'code-1', kind: 'code', split: 'dev', known: known(1) });
  put(cases, 'dev/plan-2.json', { id: 'plan-2', kind: 'plan', split: 'dev', known: known(2) });
  put(cases, 'dev/code-3.json', { id: 'code-3', kind: 'code', split: 'dev', control: true, known: [] });
  put(cases, 'heldout/code-14.json', { id: 'code-14', kind: 'code-delta', split: 'heldout' });
  put(cases, 'heldout/code-14.key.json', known(3));
  put(cases, 'heldout/code-17.json', { id: 'code-17', kind: 'code', split: 'heldout' });
  put(cases, 'heldout/plan-5.json', { id: 'plan-5', kind: 'plan-delta', split: 'heldout' });
  put(cases, 'heldout/plan-5.key.json', { known: known(2) });
  put(cases, 'heldout/plan-6.json', { id: 'plan-6', kind: 'plan', split: 'heldout' });
  put(cases, 'heldout/plan-8.json', { id: 'plan-8', kind: 'plan', split: 'heldout' });
  put(cases, 'heldout/plan-8.key.json', known(14));
  put(cases, 'heldout/notes.json', { text: 'no case' });
  assert.deepEqual(score.corpusCounts(cases), {
    rows: [
      { reviewer: 'code-reviewer', dev: 1, heldout: 1 },
      { reviewer: 'plan-reviewer', dev: 1, heldout: 2 },
    ],
    missingKeys: 2,
    knownCounts: { code: { dev: [1], heldout: [3] }, plan: { dev: [2], heldout: [2, 14] } },
    plans: { code: { dev: [], heldout: [] }, plan: { dev: [], heldout: [] } },
  });
  // With a keys folder, every held-out key comes from it, as for pairs and report: the key of code-17 exists only
  // there. The pilot cases have no key in it, so `--keys` also leaves the pilot as it is.
  put(keys, 'code-14.key.json', known(3));
  put(keys, 'code-17.key.json', known(1));
  assert.deepEqual(score.corpusCounts(cases, { keys }), {
    rows: [
      { reviewer: 'code-reviewer', dev: 1, heldout: 2 },
      { reviewer: 'plan-reviewer', dev: 1, heldout: 0 },
    ],
    missingKeys: 3,
    knownCounts: { code: { dev: [1], heldout: [3, 1] }, plan: { dev: [2], heldout: [] } },
    plans: { code: { dev: [], heldout: [] }, plan: { dev: [], heldout: [] } },
  });
  // The pilot cases are code cases, so the simulation draws from the held-out code-reviewer cases only: the plan case
  // with 14 known defects stays out. The detection rates of the 4 pilot defects are 0.5, 0.5, 1, and 1 (one run of
  // each arm per case). The seeded simulation gives the same table each time.
  const lines = main(['power', ws, '--cases', cases]).replace(cases, '<cases>').split('\n');
  assert.deepEqual(lines, [
    'A/A comparison: AB3-xhigh-fast against B3-xhigh-fast, 4 cases, 1.0 runs per arm and case, 4 known defects',
    'Cases with a difference: 2 of 4',
    'Escaped per 50 known difference (W): 0.00, standard error 20.41',
    'Escaped per 50 known difference, each case weighs 1 (N): 0.00 over 4 cases with known defects',
    '',
    '| Margin per 50 known | Neutral-data limit |',
    '|---:|---:|',
    '| 2 | 74 |',
    '| 4 | 36 |',
    '',
    'Below the neutral-data limit of a margin, no valid not-worse rule can pass a candidate that differs in no case: such a pass needs (1 - margin / 50)^n at or below 0.05 for n cases with known defects. A candidate that is better in enough cases can pass with fewer.',
    '',
    '| Reviewer | Dev cases with known defects | Held-out cases with known defects |',
    '|---|---:|---:|',
    '| code-reviewer | 1 | 1 |',
    '| plan-reviewer | 1 | 2 |',
    '',
    'The cases of the corpus <cases>, by count only. Held-out cases without a key file: 2.',
    '',
    'Deciding corpus of the simulation: the held-out code-reviewer cases of the corpus, 1 with known defects.',
    '',
    '| Margin per 50 known | Cases at 1 run | Cases at 2 runs | Cases at 3 runs | Cases at 4 runs |',
    '|---:|---:|---:|---:|---:|',
    '| 2 | > 400 | 356 | 227 | 174 |',
    '| 4 | 177 | 85 | 66 | 58 |',
    '',
    'A cell gives the smallest number of cases with known defects at which at least 80% of 1000 seeded neutral paths pass the not-worse betting test at that margin. A simulated case draws its known defects from a case of the deciding corpus, and each of its defects draws its detection rate from the 4 known defects of the A/A comparison, the same for both arms. The sample of n cases is the first n cases of each path, so a path that passes at n also passes at more cases.',
  ]);
  assert.deepEqual(score.powerCommand(ws, { cases }).knownCounts, [3]);
  assert.deepEqual(score.powerCommand(ws, { cases, keys }).knownCounts, [3, 1]);
  assert.deepEqual(score.powerCommand(ws, { cases, reviewer: 'plan-reviewer' }).knownCounts, [2, 14]);
  const dev = main(['power', ws, '--cases', cases, '--split', 'dev', '--margins', '4']);
  assert.ok(
    dev.includes('Deciding corpus of the simulation: the dev code-reviewer cases of the corpus, 1 with known defects.'),
  );
  const empty = path.join(root, 'empty');
  put(empty, 'dev/code-1.json', { id: 'code-1', kind: 'code', split: 'dev', known: known(1) });
  assert.throws(() => main(['power', ws, '--cases', empty]), {
    message: `power finds no held-out code-reviewer case with known defects in ${empty}; give --keys for keys outside the repository, or another --split or --reviewer`,
  });
  assert.throws(() => main(['power', ws, '--cases', cases, '--reviewer', 'judge']), {
    message: 'power --reviewer takes code-reviewer or plan-reviewer, not judge',
  });
  const explicit = main(['power', ws, '--arms', 'B3-xhigh-fast,AB3-xhigh-fast', '--margins', '3', '--cases', cases]);
  assert.ok(explicit.split('\n').includes('| 3 | 49 |'));
  assert.throws(() => main(['power', ws, '--margins', '0']), { message: '--margins needs margins above 0' });
  assert.throws(() => main(['power', ws, '--margins', '50']), { message: '--margins needs margins below 50' });
  // Without a control arm, power needs --arms.
  const plain = path.join(root, 'plain');
  const always = () => true;
  writeFixture(plain, gridFixture(oneKnownCases(4), singleRuns('B3', 4, 1, always)));
  assert.throws(() => main(['power', plain]), /^Error: power needs one A\/A pair of a control arm A<folder>/);
});
test('the power simulation couples its sample sizes, so the pass share never falls as the cases grow', () => {
  // Each path draws its cases once, and the sample of n cases is the first n cases of each path, so a path that passes
  // at n passes at every larger n.
  const options = { rates: [0.5, 0.5, 1, 1], knownCounts: [1, 2, 3], runs: 2, margin: 4, simulations: 300 };
  const shares = score.neutralPassShares(options);
  assert.equal(shares.length, score.MAX_SIMULATED_CASES);
  for (let index = 1; index < shares.length; index += 1) assert.ok(shares[index] >= shares[index - 1]);
  assert.ok(shares.at(-1) >= 0.8);
  // The size of the table is the first sample size that reaches 80%, and the seed fixes it.
  const [{ cases }] = score.simulatedSampleSizes({ ...options, margins: [4] });
  assert.equal(cases[1], shares.findIndex((share) => share >= 0.8) + 1);
  assert.deepEqual(score.neutralPassShares(options), shares);
});
test('the second-judge sample holds every match answer and a seeded tenth of the other answers, without answers', () => {
  const ws = path.join(scratch(), 'ws');
  const id = (n) => `F-${String(n).padStart(10, '0')}`;
  const judgments = {
    matches: [
      ...[1, 2, 3].map((n) => ({ finding: id(n), known: 'D1', verdict: 'match', reason: 'Same cause.' })),
      ...Array.from({ length: 20 }, (_, index) => ({
        finding: id(10 + index),
        known: 'D2',
        verdict: index % 2 ? 'no' : 'unknown',
        reason: 'Other cause.',
      })),
    ],
    adjudications: Array.from({ length: 15 }, (_, index) => ({
      finding: id(40 + index),
      rating: 'wrong',
      reason: 'Read.',
    })),
    reargued: [
      { finding: id(1), protected: 'U1', verdict: 'match', reason: 'Steps.' },
      ...Array.from({ length: 5 }, (_, index) => ({
        finding: id(60 + index),
        protected: 'U1',
        verdict: 'no',
        reason: 'Steps.',
      })),
    ],
  };
  put(ws, 'judgments.json', judgments);
  // 3 match answers and 2 of the 20 others; 1 reargued match and 1 of the 5 others; 2 of the 15 ratings.
  assert.equal(main(['sample', ws, '--seed', '3']), 'second-sample.json: 5 pairs, 2 protected pairs, 2 findings');
  const sample = readJson(path.join(ws, 'second-sample.json'));
  for (const n of [1, 2, 3]) assert.ok(sample.pairs.some((pair) => pair.finding === id(n) && pair.known === 'D1'));
  assert.equal(sample.pairs.filter((pair) => pair.known === 'D2').length, 2);
  assert.ok(sample.protectedPairs.some((pair) => pair.finding === id(1)));
  // The sample holds the pairs and the findings only, no verdict, rating, or reason.
  for (const pair of sample.pairs) assert.deepEqual(Object.keys(pair), ['finding', 'known']);
  for (const pair of sample.protectedPairs) assert.deepEqual(Object.keys(pair), ['finding', 'protected']);
  assert.ok(sample.findings.every((finding) => judgments.adjudications.some((entry) => entry.finding === finding)));
  // The seed fixes the sample.
  assert.deepEqual(score.secondJudgeSample(judgments, { seed: 3 }), sample);
  assert.deepEqual(score.sampleCommand(ws), score.secondJudgeSample(judgments, { seed: 1 }));
  assert.throws(() => main(['sample', ws, '--seed', '1.5']), { message: '--seed needs a whole number, not 1.5' });
});
test('a read of a missing path with an error result counts as a missing read and leaves the run valid', () => {
  const root = scratch();
  const missing = path.join(root, 'heldheldout-code', 'snapshot', 'src', 'sync.mjs');
  const scope = { runDir: `${SCOPE_CASE}/C3-low/run-1`, cwd: LIVE, pluginRoots: [LIVE_PLUGIN] };
  // An error result of a path that does not exist showed no file: the read selector goes, and a glob checks the
  // folder before its first glob segment.
  const calls = [
    { name: 'read', path: `${missing}:1-20`, error: true },
    { name: 'grep', path: `${root}/nothing/**/*.mjs`, error: true },
  ];
  assert.deepEqual(score.readScope(calls, scope), { outside: [], missing: [missing, `${root}/nothing/**/*.mjs`] });
  // A read without an error result can have shown a file, so it stays outside, also for a missing path. An error
  // result of a path that exists, and of a URI, stays outside too.
  const outside = [
    { name: 'read', path: missing },
    { name: 'read', path: root, error: true },
    { name: 'read', path: 'issue://100', error: true },
  ];
  assert.deepEqual(score.readScope(outside, scope), { outside: [missing, root, 'issue://100'] });
  // A `..` read of a run input is the read of that input.
  const dotted = reads(
    `${SCOPE_CASE}/C3-low/run-1/round/../../run-1/prompts/correctness.txt`,
    `${SCOPE_CASE}//snapshot/./src`,
  );
  assert.deepEqual(score.readScope(dotted, scope), { outside: [] });
  // transcriptFacts marks a call whose tool result is an error result.
  const transcriptCalls = [
    ['read', { path: missing }],
    ['read', { path: root }],
  ];
  const text = toolTranscript(SCOPE_CASE, 5, transcriptCalls, undefined, { results: { 'call-1': {} }, isError: true });
  assert.deepEqual(score.transcriptFacts(text, 'missing.jsonl').toolCalls, [
    { name: 'read', path: missing, error: true },
    { name: 'read', path: root },
  ]);
  // The run stays valid, and the decision table counts the missing reads of each column.
  const fixture = gridFixture(oneKnownCases(2), [
    ...singleRuns('B0', 2, 1, () => true),
    ...singleRuns('C1', 2, 1, () => true),
  ]);
  fixture.metas['code-1/C1-xhigh-fast/run-1'].reviewers.full.readScope = { outside: [], missing: [missing, root] };
  const scores = scoreRuns(fixture);
  assert.deepEqual(
    scores.runs.map((run) => run.invalid),
    [[], [], [], []],
  );
  const arms = ['B0-xhigh-fast', 'C1-xhigh-fast'];
  const decision = tableAfter(renderReport(scores, { arms, reference: arms[0] }), '### Decision: dev');
  assert.ok(decision.includes('| Reads of missing paths | 0 | 2 |'));
});
test('probe gives the manager a prompt, and transcripts records the served tier of the manager', () => {
  const root = neutralScratch();
  const ws = path.join(root, 'ws');
  const sessions = path.join(root, 'sessions');
  const project = path.join(root, 'project');
  const config = CONFIGS['low-fast'];
  const manager = { model: MODEL, effort: 'high', tier: 'priority' };
  put(project, '.omp/agents/review-bench-configs.json', { configs: [config, CONFIGS.high], manager });
  const probe = spawnSync(BUN_RUNTIME, [PREPARE_SCRIPT, 'probe', '--out', ws, '--project', project], {
    encoding: 'utf8',
    env: fakeOmp().env,
  });
  assert.equal(probe.status, 0, probe.stderr);
  assert.match(probe.stdout, /, and one manager prompt in C1-low-fast$/m);
  // The probe prints the dispatch cap of omp.mjs DISPATCH_CAP, below the 9 agents from which omp moves runs to workers.
  assert.match(probe.stdout, /^dispatch at most 8 agents at a time, so that every arm runs the same way$/m);
  const runDir = path.join(ws, 'probe', 'C1-low-fast', 'run-1');
  // The manager has one setting for every configuration, so only the run of the first configuration records it.
  assert.deepEqual(readJson(path.join(runDir, 'meta.json')), { config, managerConfig: manager });
  assert.deepEqual(readJson(path.join(ws, 'probe', 'C1-high', 'run-1', 'meta.json')), { config: CONFIGS.high });
  const prompt = promptFileParts(path.join(runDir, 'manager', 'manager-1.txt'));
  assert.equal(prompt.agent, 'agent: review-bench-manager');
  assert.ok(prompt.body.includes(`Run folder: ${runDir}`));
  const names = namesCommand(ws).map((entry) => entry.name);
  assert.deepEqual(names, ['ProbeC1HighR1Full', 'ProbeC1LowFastR1Full', 'ProbeC1LowFastR1Manager1']);
  // One transcript per dispatch; the manager is served at the priority tier.
  const transcript = (file, setting) => {
    const [provider, model] = setting.model.split('/');
    const [, , ...task] = readText(file).split('\n');
    const message = { role: 'user', content: [{ type: 'text', text: task.join('\n') }] };
    return jsonl([
      sessionRecord({ cwd: LIVE }),
      { type: 'model_change', timestamp: isoAt(0), model: setting.model },
      { type: 'thinking_level_change', timestamp: isoAt(0), thinkingLevel: setting.effort },
      { type: 'service_tier_change', timestamp: isoAt(0), serviceTier: { openai: setting.tier } },
      { type: 'message', timestamp: isoAt(0), message },
      assistantLine(5, provider, model, setting.tier, { input: 90, output: 10 }),
    ]);
  };
  for (const [name, file, setting] of [
    ['ProbeC1HighR1Full', path.join(ws, 'probe', 'C1-high', 'run-1', 'prompts', 'full.txt'), CONFIGS.high],
    ['ProbeC1LowFastR1Full', path.join(runDir, 'prompts', 'full.txt'), config],
    ['ProbeC1LowFastR1Manager1', path.join(runDir, 'manager', 'manager-1.txt'), manager],
  ]) {
    put(sessions, `${name}.jsonl`, transcript(file, setting));
  }
  transcriptsCommand(ws, sessions);
  const facts = readJson(path.join(runDir, 'meta.json')).manager.agents['manager-1'];
  assert.deepEqual(
    [facts.requestedTier, facts.messages.map((message) => message.servedTier)],
    ['priority', ['priority']],
  );
});
// The declaration of a sequential decision of `overlayFixture` over plan-3 and plan-5, with the reference
// `reference` and the candidates `candidates` (`<arm>@<configuration>`), for the looks `looks`.
function declarePlan(
  { repo, ws, project, cases },
  { reference = 'P1@low', candidates = 'AP1@low,Va@low', looks = '1,2,3,4', ...more } = {},
) {
  const caseFile = (id) => path.join(cases, 'dev', `${id}.json`);
  const ids = ['plan-3', 'plan-5'];
  prepare.sequentialPlan(
    { cases: ids.map(caseFile).join(','), reference, candidates, looks, out: ws, project, ...more },
    repo,
  );
}
test('sequential-plan declares the whole grid once, and case --sequential prepares every declared arm', () => {
  const fixture = overlayFixture();
  const { repo, ws, options } = fixture;
  const look = (id, arms, more = {}) =>
    prepare.prepareCase({ ...options(id, arms), runs: undefined, sequential: true, ...more }, repo);
  const planFile = path.join(ws, 'run-plan.json');
  // case --sequential needs the declaration.
  assert.throws(() => look('plan-3'), {
    message: `case --sequential needs ${planFile}; run prepare.mjs sequential-plan first`,
  });
  // The declaration holds every case, declared arm, and run of every look at once.
  declarePlan(fixture);
  const plan = readJson(planFile);
  const entry = (arm) => ({ arm, config: 'low', folder: `${arm}-low` });
  assert.deepEqual(
    [plan.reference, plan.candidates, plan.looks],
    [entry('P1'), [entry('AP1'), entry('Va')], [1, 2, 3, 4]],
  );
  assert.deepEqual(
    plan.keys,
    ['plan-3', 'plan-5'].flatMap((caseId) =>
      ['P1', 'AP1', 'Va'].flatMap((arm) =>
        [1, 2, 3, 4].map((run) => ({ case: caseId, split: 'dev', ...entry(arm), run, look: run })),
      ),
    ),
  );
  assert.deepEqual(score.readRunPlan(ws), { reference: plan.reference, candidates: plan.candidates, keys: plan.keys });
  const planText = readText(planFile);
  assert.throws(() => declarePlan(fixture), {
    message: `${planFile} exists; a sequential decision declares its plan once, so choose another --out`,
  });
  // Each look of plan-3 prepares the three declared arms; case --sequential writes no key.
  const caseDir = path.join(ws, 'plan-3');
  const runsOf = (folder, dir = caseDir) =>
    fs
      .readdirSync(path.join(dir, folder))
      .filter((name) => name.startsWith('run-'))
      .sort();
  look('plan-3');
  for (const folder of ['P1-low', 'AP1-low', 'Va-low']) assert.deepEqual(runsOf(folder), ['run-1']);
  // The control copy AP1 runs the agent and the prompt of P1.
  const prompt = (folder, run) => readText(path.join(caseDir, folder, `run-${run}`, 'prompts', 'plan.txt'));
  assert.equal(prompt('AP1-low', 1), prompt('P1-low', 1));
  for (const run of [2, 3, 4]) {
    // --arms that repeat the declared arms are accepted.
    look('plan-3', run === 2 ? 'Va,P1,AP1' : undefined);
    for (const folder of ['P1-low', 'AP1-low', 'Va-low']) assert.equal(runsOf(folder).length, run);
    assert.equal(prompt('AP1-low', run), prompt('P1-low', 1));
    // Each run of the overlay arm gets a contract copy of its own.
    assert.equal(readText(path.join(caseDir, 'Va-low', `run-${run}`, 'plan-contract.md')), '# Plan contract A\n');
  }
  assert.equal(readText(planFile), planText);
  // A sequential decision takes at most 4 looks.
  assert.throws(() => look('plan-3'), {
    message: `${caseDir} holds 4 looks, the most that a sequential decision takes`,
  });
  assert.throws(() => look('plan-3', undefined, { runs: '2' }), {
    message: 'case --sequential adds one run per case for each look; leave out --runs',
  });
  assert.throws(() => look('plan-3', undefined, { extend: true }), {
    message: 'case --sequential adds a look to an existing case folder by itself; leave out --extend',
  });
  // A call that names one arm only, another arm, or another configuration is refused before any folder exists, so a
  // first look always prepares every declared arm. An undeclared case is refused too.
  const otherDir = path.join(ws, 'plan-5');
  const leaveOut = (option) =>
    `${planFile} declares the ${option === 'arms' ? 'arms P1, AP1, Va' : 'configurations low'} for plan-5; case --sequential prepares all of them`;
  assert.throws(() => look('plan-5', 'P1'), { message: `${leaveOut('arms')}, so leave out --arms P1` });
  assert.throws(() => look('plan-5', 'P1,AP1,V16'), { message: `${leaveOut('arms')}, so leave out --arms P1,AP1,V16` });
  assert.throws(() => look('plan-5', undefined, { configs: 'xhigh' }), {
    message: `${leaveOut('configs')}, so leave out --configs xhigh`,
  });
  assert.throws(() => look('code-7', 'B0'), {
    message: `${planFile} does not declare code-7; case --sequential prepares only declared cases`,
  });
  assert.equal(fs.existsSync(otherDir), false);
  assert.equal(readText(planFile), planText);
  // A look adds runs only to the arm folders of the first look, which hold the same number of runs.
  fs.rmSync(path.join(caseDir, 'P1-low', 'run-4'), { recursive: true });
  assert.throws(() => look('plan-3'), {
    message: `the arm folders of ${caseDir} hold different numbers of runs: 3, 4, 4`,
  });
  fs.rmSync(path.join(caseDir, 'Va-low'), { recursive: true });
  assert.throws(() => look('plan-3'), {
    message: `${path.join(caseDir, 'Va-low')} does not exist; the first look of case --sequential prepares every declared arm folder, so restore the folder or declare a new decision in another workspace`,
  });
  // An effort choice declares one arm at two configurations; each look prepares the declared arm folders only, up to
  // the last declared look. The control copy runs at xhigh-fast only, so AP1-low is no folder.
  const effort = { ...fixture, ws: path.join(fixture.root, 'effort') };
  declarePlan(effort, { candidates: 'P1@xhigh-fast,AP1@xhigh-fast', looks: '1,2' });
  const effortLook = () =>
    prepare.prepareCase(
      { ...options('plan-3'), out: effort.ws, configs: undefined, runs: undefined, sequential: true },
      repo,
    );
  effortLook();
  effortLook();
  const effortDir = path.join(effort.ws, 'plan-3');
  const effortFolders = ['AP1-xhigh-fast', 'P1-low', 'P1-xhigh-fast'];
  assert.deepEqual(
    fs
      .readdirSync(effortDir)
      .filter((name) => /^A?P1-/.test(name))
      .sort(),
    effortFolders,
  );
  for (const folder of effortFolders) assert.deepEqual(runsOf(folder, effortDir), ['run-1', 'run-2']);
  assert.equal(readJson(path.join(effortDir, 'P1-xhigh-fast', 'run-2', 'meta.json')).config.name, 'xhigh-fast');
  assert.throws(() => effortLook(), {
    message: `${path.join(effort.ws, 'run-plan.json')} declares no look 3 of plan-3; the decision has 2 looks`,
  });
  // The declaration checks its options.
  const other = { ...fixture, ws: path.join(fixture.root, 'other') };
  assert.throws(() => declarePlan(other, { candidates: 'P1@low,Va@low' }), {
    message: 'sequential-plan declares the arm folder P1-low twice',
  });
  assert.throws(() => declarePlan(other, { candidates: 'Va' }), {
    message: '--candidates takes <arm>@<configuration>, for example C3@high, not Va',
  });
  assert.throws(() => declarePlan(other, { candidates: 'Va@nope' }), {
    message: '--configs does not take nope; use low, low-fast, xhigh, xhigh-fast',
  });
  assert.throws(() => declarePlan(other, { looks: '1,3' }), {
    message: 'sequential-plan --looks takes the runs 1 to k of the looks 1 to k, k at most 4, not 1,3',
  });
  assert.throws(() => declarePlan(other, { candidates: 'B0@low' }), {
    message: 'arm B0 does not apply to plan cases; use P0, P1, V16, Va',
  });
  assert.throws(() => declarePlan(other, { reference: '' }), { message: 'sequential-plan needs --reference' });
  // An A/A control copy of a control copy is no arm.
  assert.throws(() => prepare.prepareCase(options('plan-5', 'AAP1'), repo), {
    message: 'arm AAP1 does not apply to plan cases; use P0, P1, V16, Va',
  });
});
test('a declared grid holds a look that misses an arm of a case or a run of a later look, and a complete grid decides', () => {
  // The keys come from sequential-plan over plan-3 and plan-5 with the reference P1 and the candidate Va, looks 1 to 3.
  const fixture = overlayFixture();
  declarePlan(fixture, { candidates: 'Va@low', looks: '1,2,3' });
  const runPlan = score.readRunPlan(fixture.ws);
  const cases = {
    'plan-3': { split: 'dev', known: ['D1'], kind: 'plan' },
    'plan-5': { split: 'dev', known: ['D1'], kind: 'plan' },
  };
  // The runs of the arms and run numbers `plan` (`<case>: [<arm>, <runs>]...`), each finding D1.
  const runsOf = (plan) =>
    Object.entries(plan).flatMap(([caseId, arms]) =>
      arms.flatMap(([arm, runs]) =>
        Array.from({ length: runs }, (_, index) => ({
          case: caseId,
          config: 'low',
          arm,
          run: index + 1,
          single: true,
          rounds: [[60, 600, null, 0, ['D1']]],
        })),
      ),
    );
  const looks = (plan) =>
    lookRows(
      renderReport(
        { ...scoreRuns(gridFixture(cases, runsOf(plan))), runPlan },
        { arms: ['P1-low', 'Va-low'], reference: 'P1-low', margin: 4, sequential: true },
      ),
    ).map((row) => row[11]);
  // plan-5 was prepared with the reference arm only: every look waits for its Va runs.
  const referenceOnly = looks({
    'plan-3': [
      ['P1', 3],
      ['Va', 3],
    ],
    'plan-5': [['P1', 3]],
  });
  assert.equal(referenceOnly[0], 'incomplete look (plan-5 Va-low run-1)');
  // Look 3 was prepared for plan-3 only: looks 1 and 2 decide, look 3 waits for both arms of plan-5.
  const partialLook = looks({
    'plan-3': [
      ['P1', 3],
      ['Va', 3],
    ],
    'plan-5': [
      ['P1', 2],
      ['Va', 2],
    ],
  });
  assert.deepEqual(partialLook, ['continue', 'continue', 'incomplete look (plan-5 P1-low run-3, plan-5 Va-low run-3)']);
  // The complete declared grid decides at each look, and look 3, the last declared look, ends the decision.
  const complete = looks({
    'plan-3': [
      ['P1', 3],
      ['Va', 3],
    ],
    'plan-5': [
      ['P1', 3],
      ['Va', 3],
    ],
  });
  assert.deepEqual(complete, ['continue', 'continue', 'no pass: stop']);
});
test('case gives the judge the contract copy of each overlay run, also of a plan or code candidate arm', () => {
  const { root, repo, ws, options } = overlayFixture();
  const judgeCopy = (caseId, folder, run = 1) =>
    path.join(ws, 'contracts', `${score.runLabel(caseId, folder, `run-${run}`)}.md`);
  prepare.prepareCase(options('plan-3', 'P1,Va', { runs: '2' }), repo);
  // The judge copy of a variant run is the contract copy that the reviewer of the run reads; an arm without an
  // overlay gives the judge no copy, so the judge reads the contract of the snapshot.
  for (const run of [1, 2]) {
    const copy = path.join(ws, 'plan-3', 'Va-low', `run-${run}`, 'plan-contract.md');
    assert.equal(readText(judgeCopy('plan-3', 'Va-low', run)), readText(copy));
  }
  assert.equal(fs.readdirSync(path.join(ws, 'contracts')).length, 2);
  // A case that stops removes the judge copies that it wrote: the prompt of the first Va run names a path with a
  // word that a prompt cannot hold, after case wrote the judge copy of the run.
  const named = path.join(root, 'judge-ws');
  assert.throws(() => prepare.prepareCase({ ...options('plan-3', 'Va'), out: named }, repo), /contains "judge"/);
  assert.deepEqual(fs.readdirSync(named), []);
  assert.throws(() => prepare.prepareCase(options('plan-5', 'P1,Va'), repo), {
    message: noContract(path.join(ws, 'plan-5', 'snapshot')),
  });
  assert.equal(fs.readdirSync(path.join(ws, 'contracts')).length, 2);
  // --candidate-contract-overlay gives the plan candidate arms P1 and Pd the working-tree contract change, as it gives
  // it to the code candidate arms; the baseline arm P0 keeps the contract of the snapshot.
  const fixture = variantRepo();
  put(fixture.repo, KIT_CONTRACT, '# Plan contract working tree\n');
  agentsOnBun({ ...variantOptions(fixture), 'candidate-contract-overlay': true }, fixture.repo);
  const candidateWs = path.join(fixture.root, 'candidate-ws');
  const cases = path.join(fixture.root, 'candidate-cases');
  const planCase = { id: 'plan-3', kind: 'plan', split: 'dev', issue: 3, round: 1, plan: 'plan-3-plan.md' };
  put(cases, 'dev/plan-3.json', { ...planCase, repo_ref: fixture.shas.v16, known: [] });
  put(cases, 'dev/plan-3-plan.md', '# Plan 3\n\nStep 1.\n');
  const codeCase = { id: 'code-7', kind: 'code', split: 'dev', issue: 7, round: 1, plan: 'code-7-plan.md' };
  put(cases, 'dev/code-7.json', { ...codeCase, base: fixture.shas.bare, head: fixture.shas.v16, known: [] });
  put(cases, 'dev/code-7-plan.md', '# Plan 7\n\nStep 1.\n');
  const caseOptions = (id, arms) => ({
    case: path.join(cases, 'dev', `${id}.json`),
    arms,
    runs: '1',
    out: candidateWs,
    configs: 'low',
    project: fixture.project,
  });
  prepare.prepareCase(caseOptions('plan-3', 'P0,P1'), fixture.repo);
  prepare.prepareCase(caseOptions('code-7', 'B3,C3,AC3'), fixture.repo);
  const runDir = (caseId, folder) => path.join(candidateWs, caseId, folder, 'run-1');
  const copy = path.join(runDir('plan-3', 'P1-low'), 'plan-contract.md');
  assert.equal(readText(copy), '# Plan contract working tree\n');
  assert.deepEqual(readJson(path.join(runDir('plan-3', 'P1-low'), 'meta.json')), {
    config: CONFIGS.low,
    managerConfig: MANAGER_SETTING,
    contractOverlay: 'applied',
  });
  const [baseline, candidate] = ['P0-low', 'P1-low'].map(
    (folder) => promptFileParts(path.join(runDir('plan-3', folder), 'prompts', 'plan.txt')).body,
  );
  assert.equal(candidate, baseline.replace(SNAPSHOT_CONTRACT_RULE, copyContractRule(copy)));
  const candidateCopy = (caseId, folder) =>
    path.join(candidateWs, 'contracts', `${score.runLabel(caseId, folder, 'run-1')}.md`);
  assert.equal(readText(candidateCopy('plan-3', 'P1-low')), '# Plan contract working tree\n');
  // The code candidate arm C3 and its control copy AC3 get a judge copy each; P0 and B3 get none.
  for (const folder of ['C3-low', 'AC3-low']) {
    assert.equal(readText(candidateCopy('code-7', folder)), '# Plan contract working tree\n');
  }
  assert.equal(fs.readdirSync(path.join(candidateWs, 'contracts')).length, 3);
});
