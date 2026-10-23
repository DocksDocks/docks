import assert from 'node:assert/strict';
import test from 'node:test';
import { expectSuccess, planCliContext, refuse } from './harness.mjs';

test('an indented Mode example never becomes the live Mode, wherever it sits in Goal', (t) => {
  const { issue, createPlan, edit } = planCliContext(t);
  // An indented code example never becomes the live Mode.
  const indentedMode = createPlan('indented mode example');
  expectSuccess(
    edit(indentedMode, (text) =>
      text
        .replace('Mode: plan-and-implement\n', 'Mode: plan-only\n')
        .replace('Fix the parser.\n\n', 'Fix the parser.\n\n    Mode: plan-and-implement\n\n'),
    ),
    'edit with indented mode example',
  );
  assert.ok(issue(indentedMode).body.includes('    Mode: plan-and-implement\n'), 'indented example is preserved');
  assert.match(issue(indentedMode).body, /\nMode: plan-only\n/, 'the plan-only decision is the live mode');

  for (const [label, transform] of [
    [
      'leading',
      (text) =>
        text.replace(
          '## Goal\n\nFix the parser.\n\n',
          '## Goal\n\n    Mode: plan-and-implement\n\nFix the parser.\n\n',
        ),
    ],
    ['trailing', (text) => text.replace('Mode: plan-only\n\n', 'Mode: plan-only\n\n    Mode: plan-and-implement\n\n')],
  ]) {
    const placed = createPlan(`${label} indented mode example`);
    expectSuccess(
      edit(placed, (text) => transform(text.replace('Mode: plan-and-implement\n', 'Mode: plan-only\n'))),
      `edit with ${label} indented example`,
    );
    expectSuccess(edit(placed), `${label} second normalization`);
    assert.ok(issue(placed).body.includes('    Mode: plan-and-implement\n'), `${label} indented example is preserved`);
    assert.match(issue(placed).body, /\nMode: plan-only\n/, `${label}: the plan-only decision stays live`);
    assert.equal(issue(placed).body.match(/^Mode:/gm).length, 1, `${label}: exactly one live Mode line`);
  }
});

test('an indented example table before the live table is neither selected nor rewritten', (t) => {
  const { run, issue, createPlan, edit } = planCliContext(t);
  const indentedTable = createPlan('indented example table');
  const indentedExample = [
    '    | # | Id | Task | Files | Depends | Effect | Status | Done when |',
    '    |---:|---|---|---|---|---|---|---|',
    '    | 1 | example | Example | x | - | local | done | Never |',
  ].join('\n');
  expectSuccess(
    edit(indentedTable, (text) => text.replace('## Steps\n\n', `## Steps\n\n${indentedExample}\n\n`)),
    'edit with indented example table',
  );
  assert.ok(issue(indentedTable).body.includes(indentedExample), 'indented example bytes are preserved');
  expectSuccess(run('status', String(indentedTable), 'ongoing'), 'start indented-table plan');
  expectSuccess(run('step', String(indentedTable), 'fix_parser', 'in-flight'), 'step targets the live table');
  assert.match(issue(indentedTable).body, /\| fix_parser \| .* \| in-flight \|/);
  assert.ok(issue(indentedTable).body.includes(indentedExample), 'indented example still untouched');
});

test('an explicit --mode outranks a Mode line in --goal, and a goal Mode line stays live without --mode', (t) => {
  const { run, issue, edit } = planCliContext(t);
  // An explicit --mode outranks a Mode line embedded in --goal; a later live Mode line wins.
  const explicit = run(
    'new',
    '--title',
    'explicit mode',
    '--goal',
    'Ship it.\nMode: plan-and-implement\n\n## Context\nDetails.\n\n```text\n## fenced heading\n```',
    '--mode',
    'plan-only',
  );
  expectSuccess(explicit, 'new with explicit mode');
  assert.doesNotMatch(explicit.stdout, /Mode defaulted/, 'advice honors the explicit --mode');
  const explicitNumber = Number(/^plan created: #(\d+)/m.exec(explicit.stdout)[1]);
  assert.match(issue(explicitNumber).body, /\nMode: plan-only\n/, 'explicit --mode is the live mode');
  assert.equal(issue(explicitNumber).body.match(/^Mode:/gm).length, 1, 'the embedded Mode line is removed');
  assert.ok(
    issue(explicitNumber).body.includes('### Context\nDetails.\n\n```text\n## fenced heading\n```\n\nMode: plan-only'),
    'an unfenced H2 in --goal is demoted to H3, a fenced one is kept, and both stay inside Goal',
  );
  refuse(
    edit(explicitNumber, (text) => text.replace('## Acceptance', '## Context\n\nDetails.\n\n## Acceptance')),
    'unknown section heading: Context; use only Goal, Research, Steps, Acceptance, Do not touch, Open questions, Verification Results or write it below an existing section as ### or plain text',
  );
  const embedded = run('new', '--title', 'embedded mode', '--goal', 'Ship it.\nMode: plan-and-implement');
  expectSuccess(embedded, 'new with embedded mode only');
  assert.match(
    issue(Number(/^plan created: #(\d+)/m.exec(embedded.stdout)[1])).body,
    /\nMode: plan-and-implement\n/,
    'goal-authored Mode is kept without --mode',
  );
});
