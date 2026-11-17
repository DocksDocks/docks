import assert from 'node:assert/strict';
import test from 'node:test';
import { body, expectSuccess, planCliContext } from './harness.mjs';

// The split budgets (E4) and the scope-freeze advice of a started v5 plan (E3).
const SPLIT = /^advice: split into child plans: /m;

// A plan body of exactly `bytes` UTF-8 bytes: the Verification Results text pads it.
function bodyOfSize(bytes) {
  const base = Buffer.byteLength(body().replace('Not run.', ''), 'utf8');
  const text = body().replace('Not run.', 'x'.repeat(bytes - base));
  assert.equal(Buffer.byteLength(text, 'utf8'), bytes);
  return text;
}

// A step row with its own file, so rows need no Depends link.
function stepRow(index) {
  return `| ${index} | step_${index} | Step ${index} | src/step-${index}.mjs | - | local | planned | Step ${index} works |`;
}

// A plan body with `count` step rows.
function bodyWithSteps(count) {
  const rows = Array.from({ length: count }, (_, index) => stepRow(index + 1)).join('\n');
  return body().replace(/^\| 1 \| fix_parser .*$/m, rows);
}

function addComments(context, number, count) {
  context.updateState((state) => {
    const entry = state.issues.find((candidate) => candidate.number === number);
    for (let index = 0; index < count; index += 1) {
      const id = state.nextComment++;
      entry.comments.push({
        id,
        body: 'Routine discussion.',
        author: 'foreign-agent',
        createdAt: '2026-08-20T20:00:00Z',
      });
    }
  });
}

function shownAdvice(context, number) {
  const shown = context.run('show', String(number));
  expectSuccess(shown, `show #${number}`);
  return shown.stdout.split('\n').filter((line) => SPLIT.test(line));
}

test('show advises a split for a body above 50,000 bytes and not for a body of 50,000 bytes', (t) => {
  const context = planCliContext(t);
  const over = context.createPlan('large body', bodyOfSize(50_001));
  assert.deepEqual(shownAdvice(context, over), ['advice: split into child plans: body is 50001 bytes (budget 50000)']);
  const atBudget = context.createPlan('body at budget', bodyOfSize(50_000));
  assert.deepEqual(shownAdvice(context, atBudget), []);
  // The budget counts UTF-8 bytes: one two-byte character takes a body of 50,000 characters past it.
  const multibyte = context.createPlan(
    'multibyte body',
    bodyOfSize(50_000).replace('Fix the parser.', 'Fix the pars\u00e9r.'),
  );
  assert.deepEqual(shownAdvice(context, multibyte), [
    'advice: split into child plans: body is 50001 bytes (budget 50000)',
  ]);
});

test('show advises a split for 21 steps and not for 20 steps', (t) => {
  const context = planCliContext(t);
  assert.deepEqual(shownAdvice(context, context.createPlan('21 steps', bodyWithSteps(21))), [
    'advice: split into child plans: 21 steps (budget 20)',
  ]);
  assert.deepEqual(shownAdvice(context, context.createPlan('20 steps', bodyWithSteps(20))), []);
});

test('show advises a split for 61 comments and not for 60 comments', (t) => {
  const context = planCliContext(t);
  const over = context.createPlan('61 comments');
  addComments(context, over, 61);
  assert.deepEqual(shownAdvice(context, over), ['advice: split into child plans: 61 comments (budget 60)']);
  const atBudget = context.createPlan('60 comments');
  addComments(context, atBudget, 60);
  assert.deepEqual(shownAdvice(context, atBudget), []);
});

test('edit advises a split for each budget that the edited plan passes', (t) => {
  const context = planCliContext(t);
  const plan = context.createPlan('growing plan', bodyWithSteps(20));
  addComments(context, plan, 61);
  const base = Buffer.byteLength(context.issue(plan).body.replace('Not run.', ''), 'utf8');
  const edited = context.edit(plan, (text) =>
    text
      .replace('Not run.', 'x'.repeat(50_001 - base - Buffer.byteLength(`${stepRow(21)}\n`, 'utf8')))
      .replace(stepRow(20), `${stepRow(20)}\n${stepRow(21)}`),
  );
  expectSuccess(edited, 'edit past every budget');
  assert.deepEqual(
    edited.stdout.split('\n').filter((line) => SPLIT.test(line)),
    [
      'advice: split into child plans: body is 50001 bytes (budget 50000)',
      'advice: split into child plans: 21 steps (budget 20)',
      'advice: split into child plans: 61 comments (budget 60)',
    ],
  );
});

const SCOPE = (number) => `advice: check for new scope; move new work into a child plan (new --parent ${number})`;

function scopeAdvice(result) {
  expectSuccess(result, 'edit');
  return result.stdout.split('\n').filter((line) => line.startsWith('advice: check for new scope'));
}

test('an edit of a started v5 plan advises a child plan for new rows, new paths, and changed Task or Done when', (t) => {
  const context = planCliContext(t);
  const plan = context.createPlan('started v5 plan', body('in-flight'));
  context.updateIssue(plan, (entry) => {
    entry.labels = ['plan', 'plan:ongoing'];
  });
  const row = '| 1 | fix_parser | Fix parser | src/parser.mjs | - | local | in-flight | Records round-trip |';
  for (const [name, change] of [
    [
      'an added row',
      (text) => text.replace(row, `${row}\n| 2 | add_docs | Add docs | docs/a.md | - | local | planned | Docs exist |`),
    ],
    ['an added Files path', (text) => text.replace('| src/parser.mjs |', '| src/parser.mjs, src/lexer.mjs |')],
    ['a changed Task', (text) => text.replace('| Fix parser |', '| Rewrite parser |')],
    ['a changed Done when', (text) => text.replace('| Records round-trip |', '| Records and dates round-trip |')],
  ]) {
    assert.deepEqual(scopeAdvice(context.edit(plan, change)), [SCOPE(plan)], name);
  }
  for (const [name, change] of [
    ['an evidence edit', (text) => text.replace('Not run.', 'Smoke passed.')],
    ['a removed Files path', (text) => text.replace('src/parser.mjs, src/lexer.mjs', 'src/parser.mjs')],
    ['a no-op edit', (text) => text],
  ]) {
    assert.deepEqual(scopeAdvice(context.edit(plan, change)), [], name);
  }
});

test('an added row gets no scope advice before work starts or on a started v4 plan', (t) => {
  const context = planCliContext(t);
  const addRow = (text) =>
    text.replace(
      /^(\| 1 \| fix_parser .*)$/m,
      '$1\n| 2 | add_docs | Add docs | docs/a.md | - | local | planned | Docs exist |',
    );
  const unstarted = context.createPlan('unstarted v5 plan');
  assert.deepEqual(scopeAdvice(context.edit(unstarted, addRow)), []);
  const legacy = context.createPlan('started v4 plan', body('in-flight', 4));
  context.updateIssue(legacy, (entry) => {
    entry.labels = ['plan', 'plan:ongoing'];
  });
  assert.deepEqual(scopeAdvice(context.edit(legacy, addRow)), []);
});
