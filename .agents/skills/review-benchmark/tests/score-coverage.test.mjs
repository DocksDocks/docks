import assert from 'node:assert/strict';
import path from 'node:path';
import { test } from 'vitest';
import * as prepare from '../scripts/prepare.mjs';
import * as score from '../scripts/score.mjs';
import { dispatchName, namesCommand, renderReport, scoreRuns, transcriptsCommand } from '../scripts/score.mjs';
import {
  CODE_KNOWN,
  CONFIGS,
  devLoop,
  gridFixture,
  logged,
  LOOP_R1,
  MANAGER_SETTING,
  provenCost,
  put,
  readJson,
  readText,
  scoringFixture,
  scratch,
  tableAfter,
  toolTranscript,
} from './helpers.mjs';

// Plan #119 step coverage: API note for the tests below (decision 2, read coverage).
//
// score.mjs:
// - transcriptsCommand gives each reviewer entry `diffCoverage`: the share of the lines of the own diff of the reviewer
//   that the tool results of its `read` calls showed, as an exact ratio from 0 to 1 (the shown lines divided by the
//   lines of the diff, not rounded). The own diff of the panel lens `correctness`, `spec-and-tests`, or
//   `text-and-safety` and of the self-review lens `self-review-<lens>` is `focus-<lens>.diff`, of `full` and
//   `self-review` it is `full.diff`, and of `delta` it is `delta.diff`: in the case folder for a run without round
//   folders and for round 1 of a loop, and in the round folder for a later round of a loop. The lines of a diff are
//   its lines as omp counts them in `totalLines`: the last newline ends the last line and starts no line.
// - A read call counts when its path without the read selector is the own diff; a relative path resolves against the
//   `cwd` of the session. Its shown lines come from its tool result, the `toolResult` message with the same
//   `toolCallId`:
//   - the numbers in `details.displayContent.lineNumbers` when the result has them, without the null rows (omp adds
//     context lines around a range that is not raw, also outside the shown range of a cut output);
//   - else `details.meta.truncation.shownRange` { start, end } when the result has it (omp cut the output);
//   - else the lines that the read selector names, up to `details.totalLines`, or up to the last line of the own diff
//     when the result has no totalLines (omp gives none for a comma list): `:a-b` and `:a..b` are a to b (also with
//     `L` prefixes, `:La-Lb`), `:a+n` is n lines from a, `:a` and `:a-` are a to the last line, `:-n` is the last n
//     lines, and a comma list joins ranges and single lines (`:a-b,c` is a to b and line c, as omp reads it). A `:raw`
//     part, before or after the range, changes no line, except that a bare `:a` with `:raw` (`:a:raw` or `:raw:a`) is
//     the single line a, as omp reads it. A read without a selector (also `:raw` alone) shows lines 1 to totalLines,
//     and `:img` and `:conflicts` show no line.
//   When the result has `details.meta.limits.columnTruncated` { maxColumn }, a line of the own diff longer than
//   maxColumn characters shows cut and does not count from that read; only a read that shows it whole (a raw read)
//   counts it. A read that omp read as a list of paths (`a;b`, or the paths that it records in
//   `details.displayReadTargets`) shows no line of the own diff, also when a path of the list is the own diff: omp
//   keeps no line data for a path of a list, only the text of the result, so the shown lines cannot be identified
//   without a match of the text, which fails for repeated lines. A read call without a tool result or with an error
//   result (`isError: true`) shows no line.
//   A line that several reads showed counts once. Reads of other files and calls of other tools (grep, for example)
//   show no line of the own diff.
// - A line of a focus diff also counts when the reads of `full.diff` in the same folder showed the same line: each
//   file section of the focus diff (from its `diff --git` line to the next) maps line for line to the section of the
//   full diff with the same `diff --git` line and the same lines. A section without such a section maps no line.
// - A reviewer without a read of its own diff gets 0, also a reviewer without a tool call. A reviewer whose own diff
//   does not exist or has no line gets no field, and transcripts removes an earlier value of the field then.
// - report.md: the Summary table gets the column `Diff read mean` after `Re-argued mean`: the mean of the diffCoverage
//   values of the reviewers of all rounds of the valid runs of the row (a reviewer without the field gives no value),
//   with 2 decimals, or `-` without a value. The Runs table gets the column `Diff read` after `Re-argued`: the lowest
//   diffCoverage of the reviewers of all rounds of the run, also of an invalid run, with 2 decimals, or `-` without a
//   value. The decision table of the arm and configuration sections gets the row `Diff read mean` after
//   `Escaped per 50 known`: the mean over the reviewers of all rounds of the valid runs of its column, in the same
//   format. The earlier tests of these tables get the new cells.

// The text of a diff file of `lines` lines, each with its newline.
const diffOf = (lines) => Array.from({ length: lines }, (_, index) => `+line ${index + 1}\n`).join('');
// The details of the tool result of a read of a file of `totalLines` lines that omp did not cut.
const uncut = (totalLines) => ({ totalLines });
// The details of the tool result of a read of a file of `totalLines` lines that omp cut to the lines start to end.
const cut = (totalLines, start, end) => ({
  totalLines,
  meta: { truncation: { truncatedBy: 'lines', totalLines, shownRange: { start, end }, nextOffset: end + 1 } },
});
// The details `details` of the tool result of a read with the rows that omp showed, as omp records them in
// `displayContent.lineNumbers`: each row is the number of the line that it shows, or null for a row without a line
// (an elision row).
const shown = (details, rows) => ({ ...details, displayContent: { lineNumbers: rows } });
// The line numbers from start to end.
const lineSpan = (start, end) => Array.from({ length: end - start + 1 }, (_, index) => start + index);
// The rows of the lines start to end of a diff file of diffOf, as a read without line numbers shows them.
const diffRows = (start, end) => lineSpan(start, end).map((number) => `+line ${number}`);
// The output of a read that omp cut to the lines start to end of a file of `total` lines, as the text of its result
// shows it: the rows `rows`, a blank line, and the footer row of omp, with the clauses `clauses` after the range.
const pageOutput = (rows, start, end, total, clauses = `. Use :${end + 1} to continue`) =>
  `${rows.join('\n')}\n\n[Showing lines ${start}-${end} of ${total}${clauses}]`;
// A read that omp read as a list of the paths `targets`, as readSession takes it, for the call path `target`. Each
// path has its output in `outputs`, in the same order (see pageOutput), or null when omp could not read it. omp
// records each path in displayReadTargets and a note `Could not read <path>: <reason>` for each path that it could
// not read, but no lines of a path. The text of the result is the note of omp and then the output of each path (the
// note in brackets for a path that it could not read), each after a blank line, without a header for a path.
const listRead = (targets, outputs, target = targets.join(';')) => {
  const note = `Note: interpreted as ${targets.length} paths: ${targets.join(', ')}`;
  const unread = targets.map((part) => `Could not read ${part}: Path '${part}' not found`);
  return [
    target,
    { notes: [note, ...unread.filter((_, index) => outputs[index] === null)], displayReadTargets: targets },
    [note, ...outputs.map((output, index) => output ?? `[${unread[index]}]`)].join('\n\n'),
  ];
};
// The read calls of `readList` and their tool results, as toolTranscript takes them. Each read is [path, details of
// its tool result, text of its tool result (optional)]; a read with the details null gets no tool result.
function readSession(readList) {
  return {
    calls: readList.map(([target]) => ['read', { path: target }]),
    results: Object.fromEntries(
      readList.flatMap(([, details], index) => (details === null ? [] : [[`call-${index + 1}`, details]])),
    ),
    texts: Object.fromEntries(
      readList.flatMap(([, , text], index) => (text === undefined ? [] : [[`call-${index + 1}`, text]])),
    ),
  };
}
// The workspace of the selector test below: case code-7 with a full diff of 30 lines and a correctness focus diff of
// 400 lines, and the panel run C3-low/run-1 with the correctness lens only.
function coverageCase() {
  const root = scratch();
  const ws = path.join(root, 'ws');
  const caseDir = path.join(ws, 'code-7');
  const runDir = path.join(caseDir, 'C3-low', 'run-1');
  put(ws, 'code-7/case.json', { id: 'code-7', kind: 'code', split: 'dev' });
  put(caseDir, 'full.diff', diffOf(30));
  put(caseDir, 'focus-correctness.diff', diffOf(400));
  put(runDir, 'prompts/correctness.txt', 'agent: review-bench-candidate-code-low\n\nReview.\n');
  put(runDir, 'meta.json', { config: CONFIGS.low });
  return { ws, sessions: path.join(root, 'sessions'), caseDir, runDir };
}
// The correctness entry that transcripts writes for `coverageCase` from a session with the tool calls `calls`, the
// tool results `results` and their texts `texts`, the working directory `cwd`, and the error results `isError` (see
// toolTranscript).
function correctnessEntry({ ws, sessions, caseDir, runDir }, { calls, results = {}, texts, cwd, isError }) {
  put(
    sessions,
    'Code7C3LowR1Correctness.jsonl',
    toolTranscript(caseDir, 30, calls, undefined, { results, texts, cwd, isError }),
  );
  assert.deepEqual(transcriptsCommand(ws, sessions), ['Code7C3LowR1Correctness']);
  return readJson(path.join(runDir, 'meta.json')).reviewers.correctness;
}
test('transcripts gives a reviewer the share of the lines of its own diff that its read results showed', () => {
  const fixture = coverageCase();
  const focus = path.join(fixture.caseDir, 'focus-correctness.diff');
  const full = path.join(fixture.caseDir, 'full.diff');
  // The diffCoverage of the correctness lens after the reads `readList` (see readSession), and the share of `lines`
  // lines of its focus diff of 400 lines.
  const coverage = (...readList) => correctnessEntry(fixture, readSession(readList)).diffCoverage;
  const share = (lines) => lines / 400;
  // A read without a selector shows the whole diff, or the lines of the output that omp cut.
  assert.equal(coverage([focus, uncut(400)]), 1);
  assert.equal(coverage([`${focus}:raw`, uncut(400)]), 1);
  assert.equal(coverage([focus, cut(400, 1, 300)]), share(300));
  // The shown range of a cut output decides: omp showed 3 lines after the range 1-300, and 1 line before line 51.
  assert.equal(coverage([`${focus}:1-300`, cut(400, 1, 303)]), share(303));
  assert.equal(coverage([`${focus}:51`, cut(400, 50, 350)]), share(301));
  // The line numbers of the shown rows decide before the shown range and the selector. omp shows 1 line before and 3
  // lines after a single range that is not raw, and it can add lines outside the shown range of a cut output (here
  // lines 343 and 352, each after an elision row).
  assert.equal(coverage([`${focus}:381`, shown(uncut(400), lineSpan(380, 400))]), share(21));
  assert.equal(coverage([`${focus}:51-80`, shown(uncut(400), lineSpan(50, 83))]), share(34));
  assert.equal(coverage([`${focus}:-30`, shown(uncut(400), lineSpan(370, 400))]), share(31));
  assert.equal(coverage([focus, shown(cut(400, 1, 300), [...lineSpan(1, 300), null, 343, null, 352])]), share(302));
  assert.equal(coverage([`${focus}:381:raw`, shown(cut(400, 381, 381), [381])]), share(1));
  // Without line numbers and without a cut, the selector decides, up to the last line of the diff.
  assert.equal(coverage([`${focus}:301-500`, uncut(400)]), share(100));
  assert.equal(coverage([`${focus}:51+20`, uncut(400)]), share(20));
  assert.equal(coverage([`${focus}:391-`, uncut(400)]), share(10));
  assert.equal(coverage([`${focus}:raw:11-20`, uncut(400)]), share(10));
  assert.equal(coverage([`${focus}:11-20:raw`, uncut(400)]), share(10));
  // A lone line with `:raw` is that line only, and without `:raw` it is that line to the last line. A tail `:-n` is the
  // last n lines. `L` prefixes and `..` ranges name the same lines as the plain ranges, and `:img` and `:conflicts` show
  // no line of the file.
  assert.equal(coverage([`${focus}:381:raw`, uncut(400)]), share(1));
  assert.equal(coverage([`${focus}:381`, uncut(400)]), share(20));
  assert.equal(coverage([`${focus}:-30`, uncut(400)]), share(30));
  assert.equal(coverage([`${focus}:L5-L9`, uncut(400)]), share(5));
  assert.equal(coverage([`${focus}:5..9`, uncut(400)]), share(5));
  assert.equal(coverage([`${focus}:img`, uncut(400)]), 0);
  assert.equal(coverage([`${focus}:conflicts`, uncut(400)]), 0);
  // omp gives no line numbers and no totalLines for a raw comma list, and a single line of the list is one line.
  assert.equal(coverage([`${focus}:1-3,8-9:raw`, {}]), share(5));
  assert.equal(coverage([`${focus}:2-3,7,398-410:raw`, {}]), share(6));
  // A line that several reads showed counts once.
  assert.equal(coverage([`${focus}:1-300`, cut(400, 1, 303)], [`${focus}:301-500`, uncut(400)]), 1);
  assert.equal(
    coverage([`${focus}:1-10`, uncut(400)], [`${focus}:5-15`, uncut(400)], [`${focus}:1-3,8-9:raw`, {}]),
    share(15),
  );
  // Reads of other files show no line of the own diff, and a read without a tool result shows none.
  assert.equal(coverage([full, uncut(30)], [`${full}:1-30`, uncut(30)], [`${focus}:1-4`, uncut(400)]), share(4));
  assert.equal(coverage([`${focus}:1-200`, null]), 0);
  // An error result shows no line: omp did not run the call.
  const failed = readSession([[`${focus}:1-200`, { isError: true, error: 'The tool was not run.' }]]);
  assert.equal(correctnessEntry(fixture, { ...failed, isError: true }).diffCoverage, 0);
  // A relative path resolves against the working directory of the session.
  const relative = readSession([['code-7/focus-correctness.diff:1-10', uncut(400)]]);
  assert.equal(correctnessEntry(fixture, { ...relative, cwd: fixture.ws }).diffCoverage, share(10));
  assert.equal(correctnessEntry(fixture, relative).diffCoverage, 0);
  // A search of the own diff shows none of its lines, also with a tool result, and a reviewer without a tool call
  // read none.
  const grep = { calls: [['grep', { pattern: 'line', path: focus }]], results: { 'call-1': { matchCount: 400 } } };
  assert.equal(correctnessEntry(fixture, grep).diffCoverage, 0);
  assert.equal(correctnessEntry(fixture, { calls: [] }).diffCoverage, 0);
  // The share is exact, next to the other facts of the entry.
  assert.deepEqual(correctnessEntry(fixture, readSession([[`${focus}:1-300`, cut(400, 1, 303)]])), {
    ...provenCost(CONFIGS.low, 30, 100),
    readScope: { outside: [] },
    diffCoverage: 0.7575,
  });
});
test('transcripts counts a line that omp cut at its column limit only from a read that showed it whole', () => {
  const fixture = coverageCase();
  const focus = path.join(fixture.caseDir, 'focus-correctness.diff');
  // A focus diff of 10 lines: lines 3 and 7 have 769 characters, one more than the column limit of 768, and line 5
  // has 768 characters.
  const length = { 3: 769, 5: 768, 7: 769 };
  const line = (number) => (length[number] ? `+${'x'.repeat(length[number] - 1)}` : `+line ${number}`);
  put(
    fixture.caseDir,
    'focus-correctness.diff',
    lineSpan(1, 10)
      .map((number) => `${line(number)}\n`)
      .join(''),
  );
  // The details of a read result whose output omp cut at 768 characters in the lines first to last.
  const columnCut = (details, first, last) => ({
    ...details,
    meta: { limits: { columnTruncated: { maxColumn: 768, unit: 'chars', lines: { first, last }, selectorBase: '' } } },
  });
  const coverage = (...readList) => correctnessEntry(fixture, readSession(readList)).diffCoverage;
  // A read that cut lines shows them cut, so they count only from a raw read, which shows each line whole.
  assert.equal(coverage([focus, columnCut(shown(uncut(10), lineSpan(1, 10)), 3, 7)]), 0.8);
  assert.equal(coverage([`${focus}:1-4`, columnCut(shown(uncut(10), lineSpan(1, 7)), 3, 7)]), 0.5);
  assert.equal(
    coverage([focus, columnCut(shown(uncut(10), lineSpan(1, 10)), 3, 7)], [`${focus}:3:raw`, shown(uncut(10), [3])]),
    0.9,
  );
  assert.equal(coverage([`${focus}:raw`, shown(uncut(10), lineSpan(1, 10))]), 1);
  // Without a column cut in the result, the read showed each of its lines whole.
  assert.equal(coverage([focus, shown(uncut(10), lineSpan(1, 10))]), 1);
});
test('transcripts counts no line of the own diff from a list read, also when a path of the list is the own diff', () => {
  const fixture = coverageCase();
  const focus = path.join(fixture.caseDir, 'focus-correctness.diff');
  const full = path.join(fixture.caseDir, 'full.diff');
  const coverage = (...readList) => correctnessEntry(fixture, readSession(readList)).diffCoverage;
  const share = (lines) => lines / 400;
  // The output of a read of the whole full diff of 30 lines: omp did not cut it, so it has no footer.
  const wholeFull = diffRows(1, 30).join('\n');
  // A range with the outline rows that omp shows before and after it, each on the other side of an elision row.
  const outline = ['+line 1', '…', ...diffRows(300, 323), '…', '+line 399'];
  const outlineRead = listRead([`${focus}:301-320`, full], [pageOutput(outline, 300, 323, 400), wholeFull]);
  assert.equal(coverage(outlineRead), 0);
  // A comma list, with an elision row between its ranges.
  const comma = [...diffRows(1, 10), '…', ...diffRows(21, 30)].join('\n');
  const commaRead = listRead([`${focus}:1-10,21-30`, full], [comma, wholeFull]);
  assert.equal(coverage(commaRead), 0);
  // A range up to the last line, after the output of a range of the full diff.
  const tail = diffRows(390, 400).join('\n');
  const tailRead = listRead([`${full}:1-10`, `${focus}:391-`], [pageOutput(diffRows(1, 13), 1, 13, 30), tail]);
  assert.equal(coverage(tailRead), 0);
  // Without a record, the delimiter makes the list, as omp splits it.
  const [delimited, , delimitedText] = listRead(
    [full, `${focus}:101-200`],
    [wholeFull, pageOutput(diffRows(100, 203), 100, 203, 400)],
  );
  assert.equal(coverage([delimited, {}, delimitedText]), 0);
  // A single read of the own diff in the same transcript still counts, and the list reads add no line to it.
  assert.equal(coverage(outlineRead, commaRead, tailRead, [`${focus}:1-10`, uncut(400)]), share(10));
});
test('transcripts counts a line of a focus diff that a read of the same section of the full diff showed', () => {
  const fixture = coverageCase();
  const focus = path.join(fixture.caseDir, 'focus-correctness.diff');
  const full = path.join(fixture.caseDir, 'full.diff');
  // The file section of `name`: its `diff --git` line and `count` changed lines, each with the sign `sign`.
  const section = (name, count, sign = '+') => [
    `diff --git a/${name} b/${name}`,
    ...lineSpan(1, count).map((number) => `${sign}${name} ${number}`),
  ];
  const diffText = (...sections) =>
    sections
      .flat()
      .map((line) => `${line}\n`)
      .join('');
  // full.diff has the sections of a.mjs (lines 1-5), b.mjs (6-10), c.mjs (11-14), and d.mjs (15-18). The focus diff has
  // the same sections of a.mjs (lines 1-5) and c.mjs (6-9), a section of d.mjs with other lines (10-13), and a section
  // of e.mjs (14-16) that full.diff does not have.
  put(fixture.caseDir, 'full.diff', diffText(section('a', 4), section('b', 4), section('c', 3), section('d', 3)));
  put(
    fixture.caseDir,
    'focus-correctness.diff',
    diffText(section('a', 4), section('c', 3), section('d', 3, '-'), section('e', 2)),
  );
  const coverage = (...readList) => correctnessEntry(fixture, readSession(readList)).diffCoverage;
  const share = (lines) => lines / 16;
  // A read of the whole full diff shows the 9 lines of the sections of a.mjs and c.mjs.
  assert.equal(coverage([full, shown(uncut(18), lineSpan(1, 18))]), share(9));
  // A range of the full diff shows its lines of these sections only, also the lines of its context.
  assert.equal(coverage([`${full}:11-12`, shown(uncut(18), lineSpan(10, 15))]), share(4));
  assert.equal(coverage([`${full}:11-12`, uncut(18)]), share(2));
  // A line that a read of the full diff and a read of the focus diff showed counts once.
  assert.equal(coverage([full, shown(uncut(18), lineSpan(1, 18))], [`${focus}:1-3,14-16:raw`, {}]), share(12));
  // A line that the read of the full diff showed cut does not count: here each line is longer than 3 characters.
  const columnCut = { meta: { limits: { columnTruncated: { maxColumn: 3, unit: 'chars' } } } };
  assert.equal(coverage([full, shown({ ...uncut(18), ...columnCut }, lineSpan(1, 18))]), 0);
});
test('transcripts measures each reviewer on its own diff: the focus, full, or delta diff of its run or round', () => {
  const root = scratch();
  const ws = path.join(root, 'ws');
  const sessions = path.join(root, 'sessions');
  const { low } = CONFIGS;
  const caseDir = path.join(ws, 'code-7');
  const runDir = (arm) => path.join(caseDir, arm, 'run-1');
  const roundDir = (round) => path.join(runDir('C1-low'), `round-${round}`);
  const roundDiff = (round, name) => path.join(roundDir(round), name);
  const full = path.join(caseDir, 'full.diff');
  const focus = path.join(caseDir, 'focus-correctness.diff');
  const delta = path.join(caseDir, 'delta.diff');
  put(ws, 'code-7/case.json', { id: 'code-7', kind: 'code', split: 'dev' });
  // The case folder has no focus diff of text-and-safety. Rounds 2 and 3 of the loop have diffs of their own, and the
  // full diff of round 3 has no line.
  put(caseDir, 'full.diff', diffOf(20));
  put(caseDir, 'focus-correctness.diff', diffOf(10));
  put(caseDir, 'focus-spec-and-tests.diff', diffOf(8));
  put(caseDir, 'delta.diff', diffOf(4));
  put(roundDir(2), 'full.diff', diffOf(12));
  put(roundDir(2), 'delta.diff', diffOf(6));
  put(roundDir(3), 'full.diff', '');
  // Writes the prompt of `reviewer` in run 1 of `arm` (in its round folder `round`, when set) and a transcript of the
  // reads `readList` (see readSession).
  const review = (arm, round, reviewer, ...readList) => {
    const dir = round === undefined ? runDir(arm) : path.join(runDir(arm), `round-${round}`);
    put(dir, `prompts/${reviewer}.txt`, 'agent: review-bench-candidate-code-low\n\nReview.\n');
    const { calls, results } = readSession(readList);
    const name = dispatchName('code-7', arm, 'run-1', reviewer, round);
    put(sessions, `${name}.jsonl`, toolTranscript(caseDir, 30, calls, undefined, { results }));
  };
  // correctness read 5 of the 10 lines of its focus diff, and spec-and-tests read only the diffs of other reviewers.
  review('C3-low', undefined, 'correctness', [full, uncut(20)], [`${focus}:1-5`, uncut(10)]);
  review('C3-low', undefined, 'spec-and-tests', [focus, uncut(10)], [full, uncut(20)]);
  review('C3-low', undefined, 'text-and-safety', [full, uncut(20)], [focus, uncut(10)]);
  // A full review reads the full diff, and a delta review the delta diff.
  review('B0-low', undefined, 'full', [`${full}:6-20`, uncut(20)], [focus, uncut(10)]);
  review('Bd-low', undefined, 'delta');
  // The self-review of the full diff reads the full diff, and a self-review lens the focus diff of its lens.
  review('S1-low', undefined, 'self-review', [`${full}:1-5`, uncut(20)], [focus, uncut(10)]);
  review('S3-low', undefined, 'self-review-correctness', [`${focus}:1-8`, uncut(10)], [full, uncut(20)]);
  review('S3-low', undefined, 'self-review-spec-and-tests', [focus, uncut(10)], [full, uncut(20)]);
  // Round 1 of a loop reviews the diffs of the case folder, and a later round the diffs of its round folder.
  review('C1-low', 1, 'full', [`${full}:1-10`, uncut(20)]);
  review('C1-low', 2, 'delta', [delta, uncut(4)], [`${roundDiff(2, 'delta.diff')}:3-6`, uncut(6)]);
  review('C1-low', 3, 'full', [roundDiff(3, 'full.diff'), uncut(0)], [full, uncut(20)]);
  // An earlier transcripts run gave text-and-safety a value, which the missing focus diff now removes.
  put(runDir('C3-low'), 'meta.json', { config: low, reviewers: { 'text-and-safety': { diffCoverage: 1 } } });
  put(runDir('B0-low'), 'meta.json', { config: low });
  put(runDir('Bd-low'), 'meta.json', { config: low });
  put(runDir('S1-low'), 'meta.json', { config: low });
  put(runDir('S3-low'), 'meta.json', { config: low });
  put(roundDir(1), 'meta.json', { config: low, mode: 'full' });
  put(roundDir(2), 'meta.json', { config: low, mode: 'delta' });
  put(roundDir(3), 'meta.json', { config: low, mode: 'full' });
  assert.equal(transcriptsCommand(ws, sessions).length, 11);
  // The diffCoverage of each reviewer entry of the meta.json in `dir`, or `none` for an entry without the field.
  const coverages = (dir) => {
    const { reviewers } = readJson(path.join(dir, 'meta.json'));
    return Object.fromEntries(
      Object.entries(reviewers).map(([name, entry]) => [name, 'diffCoverage' in entry ? entry.diffCoverage : 'none']),
    );
  };
  assert.deepEqual(coverages(runDir('C3-low')), { correctness: 0.5, 'spec-and-tests': 0, 'text-and-safety': 'none' });
  assert.deepEqual(coverages(runDir('B0-low')), { full: 0.75 });
  // The delta reviewer made no tool call, so it read none of its delta diff.
  assert.deepEqual(coverages(runDir('Bd-low')), { delta: 0 });
  assert.deepEqual(coverages(runDir('S1-low')), { 'self-review': 0.25 });
  assert.deepEqual(coverages(runDir('S3-low')), { 'self-review-correctness': 0.8, 'self-review-spec-and-tests': 0 });
  assert.deepEqual(coverages(roundDir(1)), { full: 0.5 });
  assert.deepEqual(coverages(roundDir(2)), { delta: 4 / 6 });
  // The full diff of round 3 has no line, so its reviewer gets no value.
  assert.deepEqual(coverages(roundDir(3)), { full: 'none' });
});
test('report.md gives the mean diff coverage of the valid runs and the lowest diff coverage of each run', () => {
  // Blocks without findings of code-7: one full review of B0, four panel runs of C3, and one loop of L1 with a full
  // round and a delta round. Run 4 of C3 has a blocked block, so it is invalid.
  const block = (arm, run, reviewer, { round, verdict = 'pass' } = {}) => ({
    case: 'code-7',
    kind: 'code',
    arm,
    run,
    ...(round === undefined ? {} : { round }),
    reviewer,
    verdict,
    findings: 0,
  });
  const panel = (run, verdicts = {}) =>
    prepare.LENSES.map((lens) => block('C3', run, lens, { verdict: verdicts[lens] }));
  const blocks = [
    block('B0', 'run-1', 'full'),
    ...panel('run-1'),
    ...panel('run-2'),
    ...panel('run-3'),
    ...panel('run-4', { 'text-and-safety': 'blocked' }),
    block('L1', 'run-1', 'full', { round: 1 }),
    block('L1', 'run-1', 'delta', { round: 2 }),
  ];
  // A meta.json whose reviewers have the diffCoverage `values`; a null value gives an entry without the field.
  const meta = (values) => ({
    reviewers: Object.fromEntries(
      Object.entries(values).map(([reviewer, value]) => [reviewer, value === null ? {} : { diffCoverage: value }]),
    ),
  });
  const metas = {
    'code-7/C3/run-1': meta({ correctness: 0.5, 'spec-and-tests': 1, 'text-and-safety': 0.25 }),
    'code-7/C3/run-2': meta({ correctness: 1, 'spec-and-tests': null, 'text-and-safety': 0.8 }),
    'code-7/C3/run-3': meta({ correctness: null }),
    'code-7/C3/run-4': meta({ correctness: 0.1 }),
    'code-7/L1/run-1/round-1': meta({ full: 1 }),
    'code-7/L1/run-1/round-2': meta({ delta: 0.5 }),
  };
  const pairs = { cases: [{ case: 'code-7', kind: 'code', known: CODE_KNOWN.slice(0, 1), runs: [] }] };
  const judgments = { matches: [], adjudications: [] };
  const scores = scoreRuns({ findings: { blocks, findings: [] }, pairs, judgments, metas });
  const report = renderReport(scores);
  const [summaryHeader, , ...summaryRows] = tableAfter(report, '## Summary');
  assert.equal(
    summaryHeader,
    '| Case | Arm | Runs | Known | Recall mean | Recall median | Recall min | Recall max | Valid extras mean | Wrong mean | Unknown mean | Unresolved mean | Unknown pairs mean | Re-argued mean | Diff read mean | Seconds median | Seconds min | Seconds max | Tokens median | Tokens min | Tokens max |',
  );
  // C3 gives the mean of the 5 values of its valid runs 1 to 3, without the value of run 4, and L1 the mean of the
  // values of its rounds.
  assert.deepEqual(summaryRows, [
    '| code-7 | B0 | 1 | 1 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | - | - | - | - | - | - | - |',
    '| code-7 | C3 | 3 | 1 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.71 | - | - | - | - | - | - |',
    '| code-7 | L1 | 1 | 1 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.75 | - | - | - | - | - | - |',
  ]);
  const [runHeader, , ...runRows] = tableAfter(report, '## Runs');
  assert.equal(
    runHeader,
    '| Case | Arm | Run | Recall | Found | Valid extras | Wrong | Unknown | Unjudged | Unresolved | Unknown pairs | Re-argued | Diff read | Seconds | Tokens | Round verdict | Block verdicts |',
  );
  // Each run gives the lowest value of its reviewers, also over the rounds of a loop and in the invalid run 4 of C3.
  assert.deepEqual(runRows, [
    '| code-7 | B0 | run-1 | 0.00 | - | 0 | 0 | 0 | 0 | 0 | 0 | - | - | - | - | pass | full: pass |',
    '| code-7 | C3 | run-1 | 0.00 | - | 0 | 0 | 0 | 0 | 0 | 0 | - | 0.25 | - | - | pass | correctness: pass, spec-and-tests: pass, text-and-safety: pass |',
    '| code-7 | C3 | run-2 | 0.00 | - | 0 | 0 | 0 | 0 | 0 | 0 | - | 0.80 | - | - | pass | correctness: pass, spec-and-tests: pass, text-and-safety: pass |',
    '| code-7 | C3 | run-3 | 0.00 | - | 0 | 0 | 0 | 0 | 0 | 0 | - | - | - | - | pass | correctness: pass, spec-and-tests: pass, text-and-safety: pass |',
    '| code-7 | C3 | run-4 | 0.00 | - | 0 | 0 | 0 | 0 | 0 | 0 | - | 0.10 | - | - | blocked | correctness: pass, spec-and-tests: pass, text-and-safety: blocked |',
    '| code-7 | L1 | run-1 | 0.00 | - | 0 | 0 | 0 | 0 | 0 | 0 | - | 0.50 | - | - | pass | delta: pass |',
  ]);
  // The decision table of each arm or configuration column gives the mean over the reviewers of all rounds of its
  // valid runs, as the summary gives it for each case.
  const decision = tableAfter(renderReport(scores, { arms: ['B0', 'C3', 'L1'], reference: 'B0' }), '### Decision: -');
  assert.ok(decision.includes('| Diff read mean | - | 0.71 | 0.75 |'), decision.join('\n'));
});
// Plan #133, step 10: the manager stage, the control cases, the base-instructions folder, the self-review roots, and
// the post-merge outcomes.
// - `case` records the manager setting of the list of configurations as `managerConfig`; `prepare.mjs manager` writes
//   `manager/manager-1.txt` per round with findings; the manager writes `manager/verdicts.md`, which `report` reads
//   into `managerVerdicts`; `transcripts` writes `manager.agents` facts. `report` adds `## Stages` and, for control
//   cases, `## Controls`.
// - A code case folder and each later loop round folder get `base-instructions/` with MANIFEST.
// - `agents --self-review-roots <name>=<ref>|<name>=worktree` writes one self-review agent per root and configuration,
//   which reads the two skills under its root; `case` takes the arms S1<name> and S3<name>.

// A dev case code-7 with three known defects and the control case code-9. C1-low is a loop whose manager gave a
// verdict for each finding, C3-low a loop whose manager gave no verdict in round 2, and B0-low a single review from a
// workspace without a manager setting. The control run has a wrong, an unknown, and a valid finding.
function stageFixture() {
  const fixture = gridFixture(
    { 'code-7': { split: 'dev', known: ['D1', 'D2', 'D3'] }, 'code-9': { split: 'dev', known: [] } },
    [
      {
        case: 'code-7',
        config: 'low',
        arm: 'C1',
        rounds: [
          [100, 1000, 'full', 20, ['D1', 'D2', 'valid']],
          [50, 500, 'delta', 0, ['D3']],
        ],
      },
      {
        case: 'code-7',
        config: 'low',
        arm: 'C3',
        rounds: [
          [100, 1000, 'full', 0, ['D2']],
          [50, 500, 'delta', 0, ['D3']],
        ],
      },
      { case: 'code-7', config: 'low', arm: 'B0', single: true, rounds: [[100, 1000, 'full', 0, ['D1']]] },
      { case: 'code-9', config: 'low', single: true, rounds: [[100, 1000, 'full', 0, ['wrong', 'unknown', 'valid']]] },
    ],
  );
  fixture.pairs.cases.find((entry) => entry.case === 'code-9').control = true;
  const round = (arm, r) => fixture.metas[`code-7/${arm}-low/run-1/round-${r}`];
  const id = (arm, r, n) => `code-7/${arm}-low/run-1/round-${r}/full#${n}`;
  const managed = (arm, r, verdicts) =>
    Object.assign(round(arm, r), {
      managerVerdicts: verdicts,
      manager: { agents: { 'manager-1': provenCost(MANAGER_SETTING, 10, 100) } },
    });
  for (const arm of ['C1', 'C3']) round(arm, 1).managerConfig = MANAGER_SETTING;
  managed('C1', 1, { [id('C1', 1, 1)]: 'reproduced', [id('C1', 1, 2)]: 'rejected', [id('C1', 1, 3)]: 'rejected' });
  managed('C1', 2, { [id('C1', 2, 1)]: 'reproduced' });
  managed('C3', 1, { [id('C3', 1, 1)]: 'reproduced' });
  return { fixture, round };
}
test('report gives raw, kept, and final loop recall per arm and the true findings that the manager rejected', () => {
  const { fixture, round } = stageFixture();
  const scores = scoreRuns(fixture);
  const report = renderReport(scores);
  // C1-low: the findings matched D1, D2, and D3, the manager kept D1 and D3, and the fix step of round 1 repaired D1
  // and D2; the manager rejected the D2 finding and the valid extra. C3-low has no round-2 verdict.
  assert.deepEqual(tableAfter(report, '### Stages: dev'), [
    '| Measure | B0-low | C1-low | C3-low |',
    '|---|---:|---:|---:|',
    '| Runs | 1 | 1 | 1 |',
    '| Runs with a complete manager stage | 0 | 1 | 0 |',
    '| Raw recall | 0.33 | 1.00 | 0.67 |',
    '| Kept recall | n/a | 0.67 | n/a |',
    '| Final loop recall | n/a | 0.67 | 0.33 |',
    '| True findings rejected per run | n/a | 2.00 | n/a |',
  ]);
  const lines = report.split('\n');
  assert.ok(lines.includes('### Incomplete manager stages'));
  assert.ok(lines.includes('- code-7/C3-low/run-1: no manager verdict for code-7/C3-low/run-1/round-2/full#1'));
  // The stages change no run validity and no other table.
  assert.deepEqual(
    scores.runs.map((run) => [run.case, run.arm, run.invalid]),
    [
      ['code-7', 'B0-low', []],
      ['code-7', 'C1-low', []],
      ['code-7', 'C3-low', []],
      ['code-9', 'C1-low', []],
    ],
  );
  // A manager without transcript facts of the manager setting leaves the stage of its run incomplete.
  delete round('C1', 2).manager;
  const [, c1] = scoreRuns(fixture).runs;
  assert.deepEqual([c1.manager.status, c1.manager.reasons], ['incomplete', ['round-2/manager-1: no transcript facts']]);
  assert.deepEqual(c1.invalid, []);
});
test('report gives the wrong and unknown findings of control cases in rows of their own', () => {
  const report = renderReport(scoreRuns(stageFixture().fixture));
  assert.deepEqual(tableAfter(report, '### Controls: dev'), [
    '| Measure | C1-low |',
    '|---|---:|',
    '| Runs | 1 |',
    '| Cases | 1 |',
    '| Findings per run | 3.00 |',
    '| Wrong per run | 1.00 |',
    '| Unknown ratings per run | 1.00 |',
    '| Valid extras per run | 1.00 |',
    '| Unjudged per run | 0.00 |',
  ]);
  // The control run stays out of the stage table: its C1-low column counts one run.
  assert.ok(tableAfter(report, '### Stages: dev').includes('| Runs | 1 | 1 | 1 |'));
  assert.ok(report.indexOf('## Stages') < report.indexOf('## Controls'));
});
test('the stage columns show n/a for a workspace without manager verdicts, and no control section', () => {
  const report = renderReport(scoreRuns(scoringFixture()));
  assert.deepEqual(tableAfter(report, '### Stages: -'), [
    '| Measure | B0 | C3 |',
    '|---|---:|---:|',
    '| Runs | 1 | 3 |',
    '| Runs with a complete manager stage | 0 | 0 |',
    '| Raw recall | 0.00 | 0.56 |',
    '| Kept recall | n/a | n/a |',
    '| Final loop recall | n/a | n/a |',
    '| True findings rejected per run | n/a | n/a |',
  ]);
  assert.equal(report.includes('## Controls'), false);
  assert.equal(report.includes('### Incomplete manager stages'), false);
});
test('manager writes one manager prompt per round with findings, and names lists it until its verdicts exist', () => {
  const { ws, round } = devLoop();
  // A run without a manager setting gets no manager prompt.
  const none = logged(() => prepare.prepareManager({ ws }));
  assert.deepEqual(none.result, { written: 0, unchanged: 0 });
  assert.ok(none.lines.includes('runs without a manager setting, so no manager stage: code-7/C1-low/run-1'));
  const metaFile = path.join(round(1), 'meta.json');
  put(round(1), 'meta.json', { ...readJson(metaFile), managerConfig: MANAGER_SETTING });
  assert.deepEqual(logged(() => prepare.prepareManager({ ws })).result, { written: 1, unchanged: 0 });
  const managerDir = path.join(round(1), 'manager');
  const prompt = readText(path.join(managerDir, 'manager-1.txt')).split('\n');
  assert.equal(prompt[0], 'agent: review-bench-manager');
  for (const line of [
    'Reproduce or reject each finding of review round 1.',
    `Repository snapshot root: ${path.join(ws, 'code-7', 'snapshot')}`,
    `Plan export: ${path.join(ws, 'code-7', 'plan.md')}`,
    `Verdict file: ${path.join(managerDir, 'verdicts.md')}`,
    `Finding ${LOOP_R1}#1: - [MEDIUM] Bug - src/extra.mjs:2 - b is 0, and the callers divide by it - set it to 2.`,
    `Finding ${LOOP_R1}#3: - [HIGH] Bug - src/sync.mjs:5 - v5 is 0 instead of 5 - set it to 5.`,
  ]) {
    assert.ok(prompt.includes(line), `the manager prompt lacks ${line}`);
  }
  // The manager prompt forbids the pages of the benchmark repository under its current name and its former name.
  assert.ok(
    prompt.some((line) =>
      line.endsWith('Do not open any page of the DocksDocks/docks-kit repository, formerly DocksDocks/docks.'),
    ),
  );
  assert.deepEqual(logged(() => prepare.prepareManager({ ws })).result, { written: 0, unchanged: 1 });
  const managerName = dispatchName('code-7', 'C1-low', 'run-1', 'manager-1', 1);
  assert.ok(namesCommand(ws).some((entry) => entry.name === managerName));
  put(managerDir, 'verdicts.md', `- \`${LOOP_R1}#1\`: reproduced - src/extra.mjs:2 sets b to 0.\n`);
  assert.equal(
    namesCommand(ws).some((entry) => entry.name === managerName),
    false,
  );
  // The verdict lines give each finding id with reproduced or rejected; a later line of an id wins.
  const text = [
    `- \`${LOOP_R1}#1\`: reproduced - src/extra.mjs:2 sets b to 0.`,
    `${LOOP_R1}#2: Rejected - README.md:1 names the module.`,
    `${LOOP_R1}#1: rejected - a second look.`,
    'A line without a verdict.',
  ].join('\n');
  assert.deepEqual(score.managerVerdicts(text), { [`${LOOP_R1}#1`]: 'rejected', [`${LOOP_R1}#2`]: 'rejected' });
});
