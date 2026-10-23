import assert from 'node:assert/strict';
import test from 'node:test';
import { body, expectSuccess, planCliContext, refuse } from './harness.mjs';

test('history freezes step state once work starts, and status refuses transitions that erase started work', (t) => {
  const { run, issue, updateIssue, createPlan, edit } = planCliContext(t);
  // The event history keeps step state frozen even if phase labels are reset.
  const frozen = createPlan('frozen steps');
  updateIssue(frozen, (entry) => {
    entry.events = [{ event: 'labeled', label: { name: 'plan:ongoing' } }];
  });
  for (const [name, before, after] of [
    ['Status', '| planned |', '| done |'],
    ['Id', '| fix_parser |', '| renamed |'],
    ['Depends', '| - |', '| 2 |'],
  ]) {
    const result = edit(frozen, (text) => text.replace(before, after));
    assert.equal(result.status, 1, `${name} must stay frozen`);
    assert.match(result.stderr, /^step state is frozen once work starts: .+\n$/);
    assert.equal(issue(frozen).body, body(), `${name} refusal must preserve the remote body`);
  }
  expectSuccess(
    edit(frozen, (text) => text.replace('Fix parser', 'Repair parser')),
    'task text edit',
  );
  assert.match(issue(frozen).body, /Repair parser/);
  const pagedHistory = createPlan('ongoing history beyond first page');
  updateIssue(pagedHistory, (entry) => {
    entry.events = [
      ...Array.from({ length: 100 }, () => ({ event: 'labeled', label: { name: 'unrelated' } })),
      { event: 'labeled', label: { name: 'plan:ongoing' } },
    ];
  });
  refuse(
    edit(pagedHistory, (text) => text.replace('| planned |', '| done |')),
    'step state is frozen once work starts: step fix_parser status changed',
  );
  assert.equal(issue(pagedHistory).body, body(), 'a late history event freezes the original step state');

  // Labels cannot erase started work, but drafting can enter implementation.
  const transitions = createPlan('status transitions');
  expectSuccess(run('status', String(transitions), 'ongoing'), 'drafting to ongoing');
  assert.ok(issue(transitions).labels.includes('plan:ongoing'));
  refuse(run('status', String(transitions), 'planned'), 'illegal plan status transition: ongoing -> planned');
  refuse(run('status', String(frozen), 'planned'), 'illegal plan status transition: drafting -> planned');
});

test('phase labels compare case-insensitively and a transition removes the stored spelling', (t) => {
  const { run, issue, updateIssue, createPlan, edit } = planCliContext(t);
  // Phase labels compare case-insensitively and are removed by their stored spelling.
  const mixedLabels = createPlan('mixed-case labels');
  updateIssue(mixedLabels, (entry) => {
    entry.labels = ['plan', 'Plan:Drafting'];
  });
  assert.match(run('show', String(mixedLabels)).stdout, /· drafting ·/, 'mixed-case phase label is read');
  expectSuccess(run('status', String(mixedLabels), 'planned'), 'transition from a mixed-case label');
  assert.deepEqual(issue(mixedLabels).labels, ['plan', 'plan:planned'], 'the mixed-case label is removed');
  updateIssue(mixedLabels, (entry) => {
    entry.events = [{ event: 'labeled', label: { name: 'Plan:Ongoing' } }];
  });
  refuse(
    edit(mixedLabels, (text) => text.replace('| planned |', '| done |')),
    'step state is frozen once work starts: step fix_parser status changed',
  );
  refuse(run('status', String(mixedLabels), 'drafting'), 'illegal plan status transition: planned -> drafting');
  assert.deepEqual(issue(mixedLabels).labels, ['plan', 'plan:planned'], 'history keeps the plan out of drafting');
});

test('a phase label beyond the first label page is read and replaced, and other labels stay', (t) => {
  const { run, issue, updateIssue, createPlan } = planCliContext(t);
  const pagedLabels = createPlan('phase label beyond first page');
  const unrelatedLabels = Array.from({ length: 100 }, (_, index) => `topic:${index}`);
  updateIssue(pagedLabels, (entry) => {
    entry.labels = ['plan', ...unrelatedLabels, 'Plan:Drafting'];
  });
  const pagedLabelShow = run('show', String(pagedLabels));
  expectSuccess(pagedLabelShow, 'show label on second page');
  assert.match(pagedLabelShow.stdout, /· drafting ·/);
  expectSuccess(run('status', String(pagedLabels), 'planned'), 'transition label on second page');
  assert.deepEqual(
    issue(pagedLabels).labels,
    ['plan', ...unrelatedLabels, 'plan:planned'],
    'phase repair preserves other labels and removes the stored spelling',
  );
});

test('status creates a phase label that the repository lacks and applies it', (t) => {
  const { run, loadState, updateState, issue, createPlan } = planCliContext(t);
  // The target phase label can be missing, for example after someone deleted it from the repository.
  const unlabelled = createPlan('missing phase label');
  updateState((state) => {
    delete state.labels['plan:planned'];
  });
  expectSuccess(run('status', String(unlabelled), 'planned'), 'status with a missing phase label');
  assert.ok(Object.hasOwn(loadState().labels, 'plan:planned'), 'the status write creates the missing label');
  assert.deepEqual(issue(unlabelled).labels, ['plan', 'plan:planned']);
});

test('step refuses to reopen a terminal row', (t) => {
  const { run, issue, createPlan } = planCliContext(t);
  // A terminal row cannot be reopened by the step command.
  const terminal = createPlan('terminal step', body('done'));
  expectSuccess(run('status', String(terminal), 'ongoing'), 'start terminal plan');
  refuse(run('step', String(terminal), 'fix_parser', 'in-flight'), 'illegal step status transition: done -> in-flight');
  assert.match(issue(terminal).body, /\| `?done`? \|/);
});
