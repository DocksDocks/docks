import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'vitest';
import * as prepare from '../scripts/prepare.mjs';
import * as score from '../scripts/score.mjs';
import {
  dispatchName,
  dispatchNames,
  findingsCommand,
  namesCommand,
  renderReport,
  scoreRuns,
  transcriptsCommand,
} from '../scripts/score.mjs';
import {
  assistantLine,
  changedLines,
  CONFIGS,
  devLoop,
  escapeRegExp,
  EXTRA_FIXED,
  EXTRA_HEAD,
  filePatch,
  filesUnder,
  FIX_KNOWN,
  fixId,
  FULL_BLOCK,
  gitIn,
  gridFixture,
  isoAt,
  jsonl,
  judgedRound,
  judgeLoop,
  LOOP_PASS_3,
  LOOP_R1,
  LOOP_ROUND_1,
  loopRepo,
  MODEL,
  PASS_ROUND,
  provenCost,
  put,
  readJson,
  README_PLANTED,
  readText,
  roundWorkspace,
  sessionRecord,
  SYNC_D1,
  SYNC_FIXED,
  SYNC_HEAD,
  syncFile,
  tableAfter,
  taskMessage,
  V7_BLOCK,
} from './helpers.mjs';

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
test('loop builds round 2 from round 1: fix patch, fixer patch, comment files, delta mode, and prompt', () => {
  const { repo, ws, cases, run, round, round1Meta, fixerPatch } = devLoop();
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
test('loop writes one fixer prompt for all valid extras of a round and takes an empty patch as no change', () => {
  const { repo, ws, cases, run, round } = devLoop();
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
test('loop counts the fixes of earlier rounds for fix_after and ends after a round without open findings', () => {
  const { repo, ws, cases, run, round, round1Answers, fixerPatch } = devLoop();
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
test('loop gives a defect whose fix patch does not apply to the fixer and skips a fix that the tree holds', () => {
  const { root, repo, ws, cases, run, round } = devLoop();
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
test('loop --keys reads the key, the fix patches, and the external patch of a held-out case', () => {
  const { root, repo, base, head, patches } = loopRepo();
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
test('case --keys reads the files of the external fields of a held-out case from the key folder', () => {
  const { root, repo, base, head, patches } = loopRepo();
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
test('round folders get dispatch names of their own, and names and transcripts work on them', () => {
  assert.equal(dispatchName('code-7', 'C1-low', 'run-1', 'delta', 2), 'Code7C1LowR1K2Delta');
  assert.equal(dispatchName('code-7', 'C1-low', 'run-1', 'delta'), 'Code7C1LowR1Delta');
  const reviewer = (round) => ({ caseId: 'code-7', arm: 'C1-low', run: 'run-1', round, reviewer: 'full' });
  assert.deepEqual(
    dispatchNames([reviewer(1), reviewer(2)]).map((entry) => entry.name),
    ['Code7C1LowR1K1Full', 'Code7C1LowR1K2Full'],
  );
  const { low } = CONFIGS;
  const { ws } = roundWorkspace([
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
      sessionRecord(),
      { type: 'model_change', timestamp: isoAt(0), model: MODEL },
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
  const table = tableAfter(
    renderReport(scores, { configs: ['low', 'low-fast'], reference: 'low' }),
    '### Code loops: dev',
  );
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
