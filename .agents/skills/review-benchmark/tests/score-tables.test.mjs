import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'vitest';
import { findingsCommand, main, renderReport, scoreRuns } from '../scripts/score.mjs';
import {
  CONFIGS,
  FULL_BLOCK,
  gridFixture,
  judgeAll,
  MODEL,
  PASS_ROUND,
  provenCost,
  roundWorkspace,
  tableAfter,
} from './helpers.mjs';

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
  const report = renderReport(scores, { configs: ['low', 'low-fast'], reference: 'low-fast' });
  // The decision table covers the loops and the single reviews together.
  const decision = tableAfter(report, '### Decision: dev');
  assert.deepEqual(decision.slice(0, 10), [
    '| Measure | low | low-fast |',
    '|---|---:|---:|',
    '| Runs | 4 | 4 |',
    '| Known found per run | 0.75 | 1.25 |',
    '| Escaped per run | 0.75 | 0.25 |',
    '| Escaped per 50 known | 25.00 | 8.33 |',
    '| Diff read mean | - | - |',
    `| Model | ${MODEL} | ${MODEL} |`,
    '| Effort | low | low |',
    '| Served tier | default | priority |',
  ]);
  const intervalLabels = decision.slice(10).map((row) => row.split(' | ')[0]);
  assert.deepEqual(intervalLabels, [
    '| Wrong findings / runs',
    '| Unknown ratings / runs',
    '| Reads of missing paths',
    '| Round 1 recall difference from low-fast, 90% interval',
    '| Escaped per 50 known difference from low-fast, 90% interval',
    '| Loop seconds difference from low-fast, 90% interval',
    '| Cases with an escaped difference from low-fast',
    '| Wrong findings more than low-fast, one-sided exact Poisson p',
    '| Unknown ratings more than low-fast, one-sided exact Poisson p',
    '| Cases with known defects shared with low-fast',
    '| Seeded cases of the shared cases with known defects',
    '| Escaped per 50 known difference from low-fast, each case weighs 1 (N)',
  ]);
  // Loops only: code-7 differs by 80 seconds and code-8 by 40. The single reviews, 100 seconds each, stay out.
  assert.equal(decision[15], '| Loop seconds difference from low-fast, 90% interval | [40.0, 80.0] | - |');
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
test('the decision table compares with the named reference, never with the column that escapes the fewest', () => {
  const round = (seconds, tokens, mode, fixer, answers) => [seconds, tokens, mode, fixer, answers];
  // Invalid runs can leave the configurations with different cases. low-fast escapes 1 of the 2 known defects of its
  // 2 runs (0.50 per run, 25.00 per 50 known); low escapes 1 of the 4 known defects of its 1 run (1.00 per run, 12.50
  // per 50 known). The reference is high, the production setting, which escapes the most per run.
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
  const configs = ['low-fast', 'low', 'high'];
  const report = renderReport(scoreRuns(fixture), { configs, reference: 'high' });
  const decision = tableAfter(report, '### Decision: dev');
  for (const row of [
    '| Measure | low-fast | low | high |',
    '| Runs | 2 | 1 | 1 |',
    '| Escaped per run | 0.50 | 1.00 | 2.00 |',
    '| Escaped per 50 known | 25.00 | 12.50 | 25.00 |',
    // low-fast shares no case with high; low and high share code-7.
    '| Round 1 recall difference from high, 90% interval | - | [0.25, 0.25] | - |',
    '| Escaped per 50 known difference from high, 90% interval | - | [-12.50, -12.50] | - |',
    '| Loop seconds difference from high, 90% interval | - | [-80.0, -80.0] | - |',
  ]) {
    assert.ok(decision.includes(row), `the decision table lacks ${row}`);
  }
  assert.ok(report.includes('The reference column is high.'));
  // Without a reference, the report stops: the results never pick it.
  assert.throws(() => renderReport(scoreRuns(fixture), { configs }), {
    message:
      'report needs --reference <column> for a decision table of two or more columns (low-fast, low, high): name the baseline arm or the production setting',
  });
  // A table of one column needs no reference and has no comparison rows.
  const single = tableAfter(renderReport(scoreRuns(fixture), { configs: ['low'] }), '### Decision: dev');
  assert.equal(
    single.some((row) => row.includes(' from ')),
    false,
  );
});
// `report --arms <folder,...>` (renderReport option `arms`) replaces the configuration sections with `## Arms: <split>`
// sections: the same tables, with one column per arm folder in the order of `arms`. The decision table adds the row
// `Cases` after Runs, and the row `Cases shared with <reference>` before the interval rows: the cases that the column
// and the reference column both ran (`-` in the reference column). `--configs` and `--arms` together fail.
test('report --arms gives one column per arm folder and compares it with the named reference folder', () => {
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
  const report = renderReport(scores, { arms: ['C1-xhigh-fast', 'B0-xhigh-fast'], reference: 'C1-xhigh-fast' });
  assert.equal(report.includes('## Configurations: dev'), false);
  // C1 is the reference that the operator names. Round 1 of B0 finds only D1 of code-7; its round 2 finds D2.
  assert.deepEqual(tableAfter(report, '## Arms: dev'), [
    '| Measure | C1-xhigh-fast | B0-xhigh-fast |',
    '|---|---:|---:|',
    '| Runs | 2 | 2 |',
    '| Cases | 2 | 2 |',
    '| Known found per run | 1.50 | 1.00 |',
    '| Escaped per run | 0.00 | 0.50 |',
    '| Escaped per 50 known | 0.00 | 16.67 |',
    '| Diff read mean | - | - |',
    `| Model | ${MODEL} | ${MODEL} |`,
    '| Effort | xhigh | xhigh |',
    '| Served tier | priority | priority |',
    '| Wrong findings / runs | 0 / 2 | 0 / 2 |',
    '| Unknown ratings / runs | 0 / 2 | 0 / 2 |',
    '| Reads of missing paths | 0 | 0 |',
    '| Cases shared with C1-xhigh-fast | - | 2 |',
    '| Round 1 recall difference from C1-xhigh-fast, 90% interval | - | [-1.00, -0.50] |',
    '| Escaped per 50 known difference from C1-xhigh-fast, 90% interval | - | [0.00, 50.00] |',
    '| Loop seconds difference from C1-xhigh-fast, 90% interval | - | [10.0, 60.0] |',
    '| Cases with an escaped difference from C1-xhigh-fast | - | 1 |',
    '| Wrong findings more than C1-xhigh-fast, one-sided exact Poisson p | - | 1.0000 |',
    '| Unknown ratings more than C1-xhigh-fast, one-sided exact Poisson p | - | 1.0000 |',
    '| Cases with known defects shared with C1-xhigh-fast | - | 2 |',
    '| Seeded cases of the shared cases with known defects | - | - |',
    '| Escaped per 50 known difference from C1-xhigh-fast, each case weighs 1 (N) | - | 25.00 |',
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
  const { ws, cases } = roundWorkspace([
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
    main([
      'report',
      ws,
      '--arms',
      'C1-low-fast,C1-low',
      '--reference',
      'C1-low-fast',
      '--lead',
      'C1-low',
      '--lead-ref',
      'C1-low-fast',
    ]),
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
  const report = renderReport(scoreRuns(fixture), { arms, reference: 'S1-xhigh-fast' });
  // S1 is the reference that the operator names, in every case group. C1 shares code-7 and code-8 with S1, and S3
  // shares code-8. S1 has no loop, so no column has a loop seconds interval. No shared case differs, so N is 0.
  assert.deepEqual(tableAfter(report, '### Decision: dev'), [
    '| Measure | C1-xhigh-fast | S1-xhigh-fast | S3-xhigh-fast |',
    '|---|---:|---:|---:|',
    '| Runs | 3 | 2 | 2 |',
    '| Cases | 3 | 2 | 2 |',
    '| Known found per run | 1.00 | 1.50 | 1.00 |',
    '| Escaped per run | 0.33 | 0.00 | 0.00 |',
    '| Escaped per 50 known | 12.50 | 0.00 | 0.00 |',
    '| Diff read mean | - | - | - |',
    `| Model | ${MODEL} | ${MODEL} | ${MODEL} |`,
    '| Effort | xhigh | xhigh | xhigh |',
    '| Served tier | priority | priority | priority |',
    '| Wrong findings / runs | 0 / 3 | 0 / 2 | 0 / 2 |',
    '| Unknown ratings / runs | 0 / 3 | 0 / 2 | 0 / 2 |',
    '| Reads of missing paths | 0 | 0 | 0 |',
    '| Cases shared with S1-xhigh-fast | 2 | - | 1 |',
    '| Round 1 recall difference from S1-xhigh-fast, 90% interval | [-0.50, 0.00] | - | [0.00, 0.00] |',
    '| Escaped per 50 known difference from S1-xhigh-fast, 90% interval | [0.00, 0.00] | - | [0.00, 0.00] |',
    '| Loop seconds difference from S1-xhigh-fast, 90% interval | - | - | - |',
    '| Cases with an escaped difference from S1-xhigh-fast | 0 | - | 0 |',
    '| Wrong findings more than S1-xhigh-fast, one-sided exact Poisson p | 1.0000 | - | 1.0000 |',
    '| Unknown ratings more than S1-xhigh-fast, one-sided exact Poisson p | 1.0000 | - | 1.0000 |',
    '| Cases with known defects shared with S1-xhigh-fast | 2 | - | 1 |',
    '| Seeded cases of the shared cases with known defects | - | - | - |',
    '| Escaped per 50 known difference from S1-xhigh-fast, each case weighs 1 (N) | 0.00 | - | 0.00 |',
  ]);
  assert.ok(tableAfter(report, '### Code loops: dev').includes('| Runs | 3 | 0 | 0 |'));
  const singles = tableAfter(report, '### Single reviews: dev');
  assert.ok(singles.includes('| Runs | 0 | 2 | 2 |'));
  assert.ok(singles.includes('| Seconds median | - | 70.0 | 80.0 |'));
  // The reference is the same in heldout, where S1 escapes code-5/D1 and round 1 of C1 finds it.
  const heldout = tableAfter(report, '## Arms: heldout');
  for (const row of [
    '| Cases | 1 | 1 | 0 |',
    '| Escaped per 50 known | 0.00 | 50.00 | - |',
    '| Cases shared with S1-xhigh-fast | 1 | - | 0 |',
    '| Round 1 recall difference from S1-xhigh-fast, 90% interval | [1.00, 1.00] | - | - |',
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
