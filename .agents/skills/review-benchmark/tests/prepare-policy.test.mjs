import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'vitest';
import * as prepare from '../scripts/prepare.mjs';
import * as score from '../scripts/score.mjs';
import { blindId, findingsCommand, pairsCommand, renderReport, reportCommand, scoreRuns } from '../scripts/score.mjs';
import {
  assistantLine,
  CODE_KNOWN,
  CONFIGS,
  devLoop,
  escapeRegExp,
  EXTRA_FIXED,
  EXTRA_HEAD,
  filePatch,
  FIX_KNOWN,
  FIXER_SETTING,
  fixFile,
  frontmatter,
  gitIn,
  gridFixture,
  isoAt,
  jsonl,
  judgedArm,
  judgedRound,
  judgeLoop,
  LOOP_PASS_3,
  LOOP_R1,
  LOOP_ROUND_1,
  loopRepo,
  MODEL,
  NO_VERDICT_BLOCK,
  policyBlock,
  policyLoops,
  promptFileParts,
  provenCost,
  put,
  readJson,
  readText,
  selfReviewAgents,
  SYNC_D1,
  SYNC_HEAD,
  syncFile,
  tableAfter,
  transcriptEntry,
} from './helpers.mjs';

test('loop follows the round policy that the run meta.json records and refuses a run without a known policy', () => {
  const { repo, ws, cases, run, round, fixerPatch } = devLoop();
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
    /loop takes the runs of the code arms B0, B1, B3, C1, C3 and of their control copies A<arm>; code-7 is a code case and S1 is its arm/,
  );
});
test('loop runs the control copy AC3 as the loop of C3', () => {
  const { repo, ws, cases, run } = policyLoops(50, ['C3', 'AC3']);
  const answers = [];
  for (const arm of ['C3', 'AC3']) {
    assert.deepEqual(readJson(path.join(run(arm), 'meta.json')), { policy: 'panel-delta' });
    for (const lens of prepare.LENSES) put(run(arm), `round-1/blocks/${lens}.md`, policyBlock(lens));
    answers.push([`code-7/${arm}-low/run-1/round-1/correctness#1`, 'D1']);
  }
  findingsCommand(ws);
  judgeLoop(ws, answers);
  const delta = (arm) => path.join(run(arm), 'round-2', 'prompts', 'delta.txt');
  for (const arm of ['C3', 'AC3']) {
    assert.equal(prepare.prepareLoop({ run: run(arm), cases }, repo), path.join(run(arm), 'round-2'));
    assert.equal(readJson(path.join(run(arm), 'round-2', 'meta.json')).mode, 'delta');
    assert.equal(promptFileParts(delta(arm)).agent, 'agent: review-bench-candidate-code-low');
  }
  // The copy gets the round-2 prompt of C3, with the files of its own run folder.
  const [c3, ac3] = ['C3', 'AC3'].map((arm) => promptFileParts(delta(arm)).body);
  assert.equal(ac3.replaceAll(run('AC3'), run('C3')), c3);
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
test('loop refuses a round that did not complete and names each reviewer to dispatch again', () => {
  const { repo, ws, cases, run, round, round1Meta } = devLoop();
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
test('loop and report read a missing judgments.json as no answers and stop when a finding needs one', () => {
  const { repo, ws, cases, run, round } = devLoop();
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
test('the fix step stops when the judge answered one candidate pair of a finding and left out another', () => {
  // The finding names the files of D1 and D2, and the judge answered only its pair with D1.
  const partial = judgedRound(1, [{ matches: { D1: 'match' } }]);
  partial.findings[0].files.push({ file: fixFile('D2'), start: 1, end: 1 });
  const [{ blind }] = partial.findings;
  assert.throws(
    () => score.fixPlan({ ...partial, known: FIX_KNOWN }),
    new RegExp(`no match answer for 1 candidate pairs of pairs\\.json: ${blind} and D2$`),
  );
  // In a loop, the same gap stops loop before it applies a repair or writes the fixer folder.
  const { repo, ws, cases, run, round, round1Meta } = devLoop();
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
test('loop repairs a defect again when a later repair brings it back, and ends when the tree holds its fix', () => {
  const { root, repo, ws, cases, run, round, round1Answers } = devLoop();
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
test('loop gives a defect that a later repair changed to the fixer, and ends when its fix repairs nothing', () => {
  const { root, repo, ws, cases, run, round, round1Answers } = devLoop();
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
test('loop ends when the fixer patch changed nothing and only a pulled-in fix patch changed the tree', () => {
  const { repo, ws, cases, run, round } = devLoop();
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
  const table = tableAfter(renderReport(scores, { configs, reference: 'low' }), '### Code loops: dev');
  assert.ok(table.includes('| Extra-only rounds per run | 1.00 | 0.00 | 0.50 | 0.00 |'));
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
test('agents writes the fixer setting to the list of configurations', () => {
  const { agentDir } = selfReviewAgents();
  // selfReviewAgents gives no --fixer-* option, so the setting holds the defaults of the fixer agent.
  assert.deepEqual(readJson(path.join(agentDir, 'review-bench-configs.json')).fixer, FIXER_SETTING);
  const fields = frontmatter(path.join(agentDir, 'review-bench-fixer.md'));
  assert.deepEqual([fields.model, fields['thinking-level']], [FIXER_SETTING.model, FIXER_SETTING.effort]);
});
test('case --loop records the fixer setting in round 1 of each loop and stops without one', () => {
  const { root, repo, base, head, patches } = loopRepo();
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
  const arms = renderReport(scores, { arms: ['C1-low', 'S1-low'], reference: 'C1-low' });
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
  const report = renderReport(scoreRuns(fixture), { configs: ['low', 'xhigh-fast'], reference: 'low' });
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
