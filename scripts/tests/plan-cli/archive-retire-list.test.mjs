import assert from 'node:assert/strict';
import test from 'node:test';
import { expectSuccess, planCliContext, refuse, SKIP_WAITS } from './harness.mjs';

// Every archive loads the skip-waits hook, so a pause for an open plan returns at once and gets recorded.
function archive({ runWith }, plan) {
  return runWith(['--import', SKIP_WAITS], 'archive', String(plan.number), '--pr', String(plan.pr));
}

test('archive refuses a closing pull request merged into a branch other than the default branch', (t) => {
  const context = planCliContext(t);
  const plan = context.closedPlan('wrong base', { base: 'release' });
  refuse(archive(context, plan), 'archive requires a closing pull request merged into DocksDocks/fixture:main');
});

test('archive refuses a plan with a non-terminal step', (t) => {
  const context = planCliContext(t);
  const plan = context.closedPlan('unfinished step', { status: 'in-flight' });
  refuse(archive(context, plan), 'archive refused: non-terminal step fix_parser');
});

test('archive refuses a broken Steps table that parses to zero rows', (t) => {
  const context = planCliContext(t);
  // A broken Steps table parses to zero rows; that never counts as complete work.
  const plan = context.closedPlan('broken steps table');
  context.updateIssue(plan.number, (entry) => {
    entry.body = entry.body.replace('| # | Id | Task | Files | Depends | Effect | Status | Done when |\n', '');
  });
  refuse(archive(context, plan), 'archive refused: no Steps rows parsed');
});

test('archive refuses a merged closing pull request when the latest code review asks for repair', (t) => {
  const context = planCliContext(t);
  // A merged closing pull request does not replace review approval.
  const plan = context.closedPlan('review repair');
  context.addIssueComment(plan.number, '## Code review\n\ncode-review: repair\nFix data loss.');
  refuse(archive(context, plan), 'archive requires Code-review: pass');
  assert.ok(context.issue(plan.number).labels.includes('plan:ongoing'));
});

test('archive refuses an open plan that is not ongoing and writes nothing', (t) => {
  const context = planCliContext(t);
  const plan = context.landedPlan('blocked plan');
  context.updateIssue(plan.number, (entry) => {
    entry.labels = ['plan', 'plan:blocked'];
  });
  refuse(archive(context, plan), 'archive requires ongoing or finished status, found blocked');
  assert.deepEqual(context.writes(), []);
  assert.deepEqual(context.waits(), []);
});

test('archive refuses a retired plan and writes nothing', (t) => {
  const context = planCliContext(t);
  const plan = context.closedPlan('retired plan');
  context.updateIssue(plan.number, (entry) => {
    entry.stateReason = 'NOT_PLANNED';
  });
  refuse(archive(context, plan), 'archive requires ongoing or finished status, found retired');
  assert.deepEqual(context.writes(), []);
});

test('show and archive read every page of large comments', (t) => {
  const context = planCliContext(t);
  const plan = context.closedPlan('large comment pages');
  context.updateState((state) => {
    const entry = state.issues.find((candidate) => candidate.number === plan.number);
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
  const largeShow = context.run('show', String(plan.number));
  expectSuccess(largeShow, 'show large comment pages');
  assert.match(largeShow.stdout, /^reviews: plan=none code=pass$/m);
  const largeArchive = archive(context, plan);
  expectSuccess(largeArchive, 'archive large comment pages');
  assert.equal(largeArchive.stdout, `plan #${plan.number} finished (closed by ${plan.closer.url})\n`);
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
