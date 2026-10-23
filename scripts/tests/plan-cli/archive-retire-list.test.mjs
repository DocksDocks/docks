import assert from 'node:assert/strict';
import test from 'node:test';
import { expectSuccess, planCliContext, refuse } from './harness.mjs';

test('archive refuses a closer merged into a branch other than the default branch', (t) => {
  const { run, closedPlan } = planCliContext(t);
  const wrongBase = closedPlan('wrong base', { base: 'release' });
  refuse(
    run('archive', String(wrongBase.number)),
    'archive requires a closing pull request merged into DocksDocks/fixture:main',
  );
});

test('archive refuses a plan with a non-terminal step', (t) => {
  const { run, closedPlan } = planCliContext(t);
  const unfinished = closedPlan('unfinished step', { status: 'in-flight' });
  refuse(run('archive', String(unfinished.number)), 'archive refused: non-terminal step fix_parser');
});

test('archive refuses a broken Steps table that parses to zero rows', (t) => {
  const { run, updateIssue, closedPlan } = planCliContext(t);
  // A broken Steps table parses to zero rows; that never counts as complete work.
  const tableless = closedPlan('broken steps table');
  updateIssue(tableless.number, (entry) => {
    entry.body = entry.body.replace('| # | Id | Task | Files | Depends | Effect | Status | Done when |\n', '');
  });
  refuse(run('archive', String(tableless.number)), 'archive refused: no Steps rows parsed');
});

test('archive refuses a merged closer when the latest code review asks for repair', (t) => {
  const { run, issue, addIssueComment, closedPlan } = planCliContext(t);
  // A merged closer does not replace review approval.
  const unapproved = closedPlan('review repair');
  addIssueComment(unapproved.number, '## Code review\n\ncode-review: repair\nFix data loss.');
  refuse(run('archive', String(unapproved.number)), 'archive requires Code-review: pass');
  assert.ok(issue(unapproved.number).labels.includes('plan:ongoing'));
});

test('show and archive read every page of large comments', (t) => {
  const { run, updateState, closedPlan } = planCliContext(t);
  const largeComments = closedPlan('large comment pages');
  updateState((state) => {
    const entry = state.issues.find((candidate) => candidate.number === largeComments.number);
    for (let i = 0; i < 20; i += 1) {
      const id = state.nextComment++;
      entry.comments.push({
        id,
        body: `Evidence round ${i}\n${'x'.repeat(60000)}`,
        author: 'plan-agent',
        createdAt: new Date(Date.parse('2026-08-20T20:00:00Z') + id * 1000).toISOString(),
      });
    }
  });
  const largeShow = run('show', String(largeComments.number));
  expectSuccess(largeShow, 'show large comment pages');
  assert.match(largeShow.stdout, /^reviews: plan=none code=pass$/m);
  const largeArchive = run('archive', String(largeComments.number));
  expectSuccess(largeArchive, 'archive large comment pages');
  assert.equal(
    largeArchive.stdout.trim(),
    `plan #${largeComments.number} finished (closed by ${largeComments.closer.url})`,
  );
});

test('show advises on a plan closed with unfinished work, and step needs a reopen before it writes', (t) => {
  const { run, updateIssue, closedPlan } = planCliContext(t);
  const partialMerge = closedPlan('closed by a partial merge', { status: 'in-flight' });
  const partialShow = run('show', String(partialMerge.number));
  expectSuccess(partialShow, 'show early closure');
  assert.ok(
    partialShow.stdout
      .split(/\r?\n/)
      .includes(
        `advice: plan is closed as completed while step fix_parser is in-flight; closed by ${partialMerge.closer.url}; reopen the issue if work remains`,
      ),
  );
  refuse(
    run('step', String(partialMerge.number), 'fix_parser', 'in-flight'),
    `plan #${partialMerge.number} is finished; reopen it before moving step fix_parser to in-flight`,
  );
  updateIssue(partialMerge.number, (entry) => {
    entry.state = 'OPEN';
    entry.stateReason = 'REOPENED';
  });
  expectSuccess(run('step', String(partialMerge.number), 'fix_parser', 'done'), 'finish step after reopen');
});

test('retire repairs labels before it closes the issue, and list filters open and closed plans', (t) => {
  const { run, updateState, issue, updateIssue, createPlan } = planCliContext(t);
  // Retire repairs labels before closing; list retains its filtered open/closed view.
  const listed = createPlan('listed drafting plan');
  const unlisted = createPlan('issue without plan label');
  updateIssue(unlisted, (entry) => {
    entry.labels = ['other'];
  });
  const retiring = createPlan('retired plan');
  updateIssue(retiring, (entry) => {
    entry.assignees = [];
  });
  updateState((state) => {
    state.labelRemovalErrorOnce = 'label removal unavailable';
  });
  refuse(
    run('retire', String(retiring), '--reason', 'No longer needed'),
    'gh api graphql failed: label removal unavailable',
  );
  assert.equal(issue(retiring).state, 'OPEN', 'a failed label repair cannot close the issue');
  assert.deepEqual(issue(retiring).labels, ['plan', 'plan:drafting']);
  const retired = run('retire', String(retiring), '--reason', 'No longer needed');
  expectSuccess(retired, 'retire an unassigned plan');
  assert.equal(retired.stdout.trim(), `plan #${retiring} retired`);
  assert.equal(issue(retiring).state, 'CLOSED');
  assert.equal(issue(retiring).stateReason, 'NOT_PLANNED');
  assert.deepEqual(issue(retiring).labels, ['plan']);
  assert.deepEqual(issue(retiring).assignees, ['plan-agent'], 'retire claims the plan in the label edit');
  const draftingList = run('list', '--status', 'drafting');
  expectSuccess(draftingList, 'list drafting plans');
  assert.match(draftingList.stdout, new RegExp(`^drafting\\t#${listed}\\tlisted drafting plan$`, 'm'));
  assert.doesNotMatch(draftingList.stdout, /issue without plan label/);
  assert.doesNotMatch(draftingList.stdout, new RegExp(`\\t#${retiring}\\t`));
  const retiredList = run('list', '--status', 'retired');
  expectSuccess(retiredList, 'list retired plans');
  assert.equal(retiredList.stdout.trim(), `retired\t#${retiring}\tretired plan`);
});

test('list advises that more plans may exist when it stops at 500 plans', (t) => {
  const { run, updateState } = planCliContext(t);
  updateState((state) => {
    for (let i = 0; i < 500; i += 1) {
      const number = state.nextIssue++;
      state.issues.push({
        number,
        title: `bulk plan ${i}`,
        body: '',
        state: 'OPEN',
        stateReason: null,
        labels: ['plan', 'plan:drafting'],
        assignees: ['plan-agent'],
        url: `https://github.com/DocksDocks/fixture/issues/${number}`,
        createdAt: '2026-08-20T20:00:00Z',
        updatedAt: '2026-08-20T20:00:00Z',
        comments: [],
        events: [],
      });
    }
  });
  const limitedList = run('list');
  expectSuccess(limitedList, 'list limit advice');
  assert.match(limitedList.stdout, /^advice: list stopped at 500 plans; more plans may exist$/m);
});

test('list prints open plans first, then closed plans, each in ascending number order', (t) => {
  const { run, updateIssue, createPlan, closedPlan } = planCliContext(t);
  // Interleave creation so number order differs from the open/closed grouping.
  const finished = closedPlan('finished plan');
  const drafting = createPlan('drafting plan');
  const retired = createPlan('retired plan');
  updateIssue(retired, (entry) => {
    entry.state = 'CLOSED';
    entry.stateReason = 'NOT_PLANNED';
    entry.labels = ['plan'];
  });
  const ongoing = createPlan('ongoing plan');
  updateIssue(ongoing, (entry) => {
    entry.labels = ['plan', 'plan:ongoing'];
  });
  const listed = run('list');
  expectSuccess(listed, 'list mixed open and closed plans');
  assert.deepEqual(listed.stdout.trim().split('\n'), [
    `drafting\t#${drafting}\tdrafting plan`,
    `ongoing\t#${ongoing}\tongoing plan`,
    `finished\t#${finished.number}\tfinished plan`,
    `retired\t#${retired}\tretired plan`,
  ]);
});
