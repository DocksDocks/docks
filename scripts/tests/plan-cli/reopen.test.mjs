import assert from 'node:assert/strict';
import test from 'node:test';
import { closedBy, expectSuccess, planCliContext, refuse, SKIP_WAITS } from './harness.mjs';

// The fake gh counts the GraphQL reads of each issue and lands a scheduled change once the plan has served
// `afterReads` of them. These cases expect `reopen` to read the plan once per poll, the first read being
// poll 1, and once more after the settle wait, right before its single write request.
const SETTLE_WAIT = 10_000;
const ONGOING = { state: 'OPEN', stateReason: null, labels: ['plan', 'plan:ongoing'], assignees: [], comments: [] };

function reopenComment(pr) {
  return `Reopened: partial pull request #${pr} closed this plan through its linked branch. Work continues.`;
}

function stuckRefusal(number) {
  return `GitHub left plan #${number} closed with reason REOPENED and refuses every state change; ask GitHub Support to repair it`;
}

// Every reopen loads the skip-waits hook, so its pauses and its settle wait return at once and get recorded.
function reopen({ runWith }, plan) {
  return runWith(['--import', SKIP_WAITS], 'reopen', String(plan.number), '--pr', String(plan.pr));
}

// The plan fields that a reopen may change; a comment reduces to its author and body.
function stored({ issue }, number) {
  const { state, stateReason, labels, assignees, comments } = issue(number);
  return { state, stateReason, labels, assignees, comments: comments.map(({ author, body }) => ({ author, body })) };
}

test('reopen waits for the close by the pull request, then reopens with the contract comment and a claim', (t) => {
  const context = planCliContext(t);
  const plan = context.partialMerge('reopen after the close');
  // GitHub records the close on the third read, so the helper pauses 250 ms and 500 ms before it sees it.
  context.schedule(plan.number, { afterReads: 2, ...closedBy(plan.closer) });
  const result = reopen(context, plan);
  expectSuccess(result, 'reopen');
  assert.equal(result.stdout, `plan #${plan.number} reopened: ongoing\n`);
  assert.equal(result.stderr, '');
  assert.deepEqual(context.waits(), [250, 500, SETTLE_WAIT]);
  assert.deepEqual(stored(context, plan.number), {
    ...ONGOING,
    stateReason: 'REOPENED',
    assignees: ['plan-agent'],
    comments: [{ author: 'plan-agent', body: reopenComment(plan.pr) }],
  });
  assert.equal(context.writes().length, 1, 'the reopen, the comment, and the claim land in one request');
});

test('reopen accepts the close by a commit of the merged pull request and leaves an owned plan with its owner', (t) => {
  const context = planCliContext(t);
  const plan = context.partialMerge('commit close', { assignees: ['plan-agent'] });
  const oid = 'c0ffee0000000000000000000000000000000001';
  context.updateState((state) => {
    state.commits = [{ oid, associatedPullRequests: [{ number: plan.pr }] }];
  });
  context.schedule(plan.number, { afterReads: 0, ...closedBy({ __typename: 'Commit', oid }) });
  const result = reopen(context, plan);
  expectSuccess(result, 'reopen after a commit close');
  assert.equal(result.stdout, `plan #${plan.number} reopened: ongoing\n`);
  assert.deepEqual(context.waits(), [SETTLE_WAIT]);
  assert.deepEqual(stored(context, plan.number), {
    ...ONGOING,
    stateReason: 'REOPENED',
    assignees: ['plan-agent'],
    comments: [{ author: 'plan-agent', body: reopenComment(plan.pr) }],
  });
  const writes = context.writes();
  assert.equal(writes.length, 1);
  assert.ok(
    !writes[0].some((argument) => argument.includes('addAssigneesToAssignable')),
    'an owned plan needs no claim',
  );
});

test('reopen writes nothing when the merged pull request does not close the plan', (t) => {
  const context = planCliContext(t);
  const plan = context.partialMerge('not closed by the pull request', { closes: false });
  const result = reopen(context, plan);
  expectSuccess(result, 'reopen without a closing reference');
  assert.equal(result.stdout, `pull request #${plan.pr} does not close plan #${plan.number}; nothing to reopen\n`);
  assert.equal(result.stderr, '');
  assert.deepEqual(stored(context, plan.number), ONGOING);
  assert.deepEqual(context.writes(), []);
  assert.deepEqual(context.waits(), []);
});

test('reopen leaves a retired plan untouched when the merged pull request does not close it', (t) => {
  const context = planCliContext(t);
  // The shape of probe issue #94: retired, unlabelled, owned by the viewer, and not closed by #95.
  const plan = context.partialMerge('retired probe', { assignees: ['plan-agent'], closes: false });
  context.updateIssue(plan.number, (entry) => {
    entry.state = 'CLOSED';
    entry.stateReason = 'NOT_PLANNED';
    entry.labels = [];
  });
  const result = reopen(context, plan);
  expectSuccess(result, 'reopen a retired plan');
  assert.equal(result.stdout, `pull request #${plan.pr} does not close plan #${plan.number}; nothing to reopen\n`);
  assert.deepEqual(stored(context, plan.number), {
    ...ONGOING,
    state: 'CLOSED',
    stateReason: 'NOT_PLANNED',
    labels: [],
    assignees: ['plan-agent'],
  });
  assert.deepEqual(context.writes(), []);
});

test('reopen refuses a pull request that has not merged', (t) => {
  const context = planCliContext(t);
  const plan = context.partialMerge('unmerged pull request', { merged: false });
  refuse(reopen(context, plan), `pull request #${plan.pr} is not merged`);
  assert.deepEqual(stored(context, plan.number), ONGOING);
  assert.deepEqual(context.writes(), []);
});

test('reopen refuses a plan that another closer closed after the pull request merged', (t) => {
  const context = planCliContext(t);
  const plan = context.partialMerge('closed by another pull request');
  const other = {
    __typename: 'PullRequest',
    number: plan.pr + 1,
    url: `https://github.com/DocksDocks/fixture/pull/${plan.pr + 1}`,
    state: 'MERGED',
    mergedAt: '2026-08-21T00:00:05Z',
    baseRefName: 'main',
    repository: { nameWithOwner: 'DocksDocks/fixture' },
  };
  context.schedule(plan.number, { afterReads: 0, ...closedBy(other, '2026-08-21T00:00:06Z') });
  refuse(
    reopen(context, plan),
    `plan #${plan.number} was closed by ${other.url} after pull request #${plan.pr} merged; reopen it by hand only if that close was a mistake`,
  );
  assert.deepEqual(stored(context, plan.number), { ...ONGOING, state: 'CLOSED', stateReason: 'COMPLETED' });
  assert.deepEqual(context.writes(), []);
});

test('reopen refuses a plan that GitHub left closed with reason REOPENED, and show advises GitHub Support', (t) => {
  const context = planCliContext(t);
  const plan = context.partialMerge('stuck before the reopen');
  // A hand reopen raced GitHub's close, as in #90.
  context.schedule(plan.number, { afterReads: 0, ...closedBy(plan.closer), stateReason: 'REOPENED' });
  refuse(reopen(context, plan), stuckRefusal(plan.number));
  assert.deepEqual(stored(context, plan.number), { ...ONGOING, state: 'CLOSED', stateReason: 'REOPENED' });
  assert.deepEqual(context.writes(), []);
  const shown = context.run('show', String(plan.number));
  expectSuccess(shown, 'show a stuck plan');
  const lines = shown.stdout.split('\n');
  assert.equal(
    lines[0],
    `#${plan.number} · unreadable · stuck before the reopen · https://github.com/DocksDocks/fixture/issues/${plan.number}`,
  );
  assert.ok(
    lines.includes(
      'advice: GitHub left this issue closed with reason REOPENED and refuses every state change; ask GitHub Support to repair it, and record step results in an issue comment until then',
    ),
    shown.stdout,
  );
});

test('reopen refuses when GitHub leaves the plan closed with reason REOPENED after the reopen', (t) => {
  const context = planCliContext(t);
  const plan = context.partialMerge('stuck after the reopen');
  context.schedule(plan.number, { afterReads: 0, ...closedBy(plan.closer) });
  context.updateState((state) => {
    state.reopenLeavesClosed = true;
  });
  refuse(reopen(context, plan), stuckRefusal(plan.number));
  // The one request ran every field: the comment and the claim landed, and only the state stuck.
  assert.deepEqual(stored(context, plan.number), {
    ...ONGOING,
    state: 'CLOSED',
    stateReason: 'REOPENED',
    assignees: ['plan-agent'],
    comments: [{ author: 'plan-agent', body: reopenComment(plan.pr) }],
  });
  assert.equal(context.writes().length, 1);
});

test('reopen refuses with the stuck state when GitHub answers the reopen with an error', (t) => {
  const context = planCliContext(t);
  const plan = context.partialMerge('reopen answered with an error');
  // Another reopen races GitHub's close after the helper's second read, so the issue is stuck at the write.
  context.schedule(
    plan.number,
    { afterReads: 0, ...closedBy(plan.closer) },
    { afterReads: 2, stateReason: 'REOPENED' },
  );
  refuse(reopen(context, plan), stuckRefusal(plan.number));
  const { state, stateReason } = context.issue(plan.number);
  assert.deepEqual([state, stateReason], ['CLOSED', 'REOPENED']);
  assert.equal(context.writes().length, 1, 'the helper does not retry the reopen');
});

test('reopen prints the open status and writes nothing for a plan reopened after the pull request closed it', (t) => {
  const context = planCliContext(t);
  const plan = context.partialMerge('already reopened');
  context.schedule(plan.number, { afterReads: 0, ...closedBy(plan.closer), state: 'OPEN', stateReason: 'REOPENED' });
  const result = reopen(context, plan);
  expectSuccess(result, 'reopen an open plan');
  assert.equal(result.stdout, `plan #${plan.number} is open: ongoing\n`);
  assert.equal(result.stderr, '');
  assert.deepEqual(stored(context, plan.number), { ...ONGOING, stateReason: 'REOPENED' });
  assert.deepEqual(context.writes(), []);
});

test('reopen prints the open status and writes nothing when someone reopens the plan during the settle wait', (t) => {
  const context = planCliContext(t);
  const plan = context.partialMerge('reopened during the settle wait');
  context.schedule(
    plan.number,
    { afterReads: 0, ...closedBy(plan.closer) },
    { afterReads: 1, state: 'OPEN', stateReason: 'REOPENED' },
  );
  const result = reopen(context, plan);
  expectSuccess(result, 'reopen a plan reopened meanwhile');
  assert.equal(result.stdout, `plan #${plan.number} is open: ongoing\n`);
  assert.equal(result.stderr, '');
  assert.deepEqual(context.waits(), [SETTLE_WAIT]);
  assert.deepEqual(stored(context, plan.number), { ...ONGOING, stateReason: 'REOPENED' });
  assert.deepEqual(context.writes(), []);
});

test('reopen refuses after 34 reads when GitHub never closes the plan for the merged pull request', (t) => {
  const context = planCliContext(t);
  const plan = context.partialMerge('never closed');
  // The latest close is older than this merge: a commit that an earlier partial pull request merged, and that
  // this pull request also contains, closed the plan before someone reopened it.
  const earlier = plan.pr - 1;
  const oid = 'c0ffee0000000000000000000000000000000002';
  context.updateState((state) => {
    state.prs.push({
      number: earlier,
      url: `https://github.com/DocksDocks/fixture/pull/${earlier}`,
      state: 'MERGED',
      mergedAt: '2026-08-20T22:00:00Z',
      baseRefName: 'main',
      repository: 'DocksDocks/fixture',
      closingIssuesReferences: [plan.number],
    });
    state.commits = [{ oid, associatedPullRequests: [{ number: earlier }, { number: plan.pr }] }];
  });
  context.updateIssue(plan.number, (entry) => {
    entry.stateReason = 'REOPENED';
    entry.timelineItems = [
      { __typename: 'ClosedEvent', closer: { __typename: 'Commit', oid }, createdAt: '2026-08-20T22:00:02Z' },
    ];
  });
  refuse(
    reopen(context, plan),
    `GitHub has not closed plan #${plan.number} for pull request #${plan.pr} yet; run reopen again once it has`,
  );
  assert.equal(context.issue(plan.number).graphqlReads, 34);
  // The pause starts at 250 ms and doubles up to 2 s between reads; no settle wait follows.
  assert.deepEqual(context.waits(), [250, 500, 1000, ...Array(30).fill(2000)]);
  assert.deepEqual(stored(context, plan.number), { ...ONGOING, stateReason: 'REOPENED' });
  assert.deepEqual(context.writes(), []);
});

test('reopen refuses a plan that another login claims during the settle wait', (t) => {
  const context = planCliContext(t);
  const plan = context.partialMerge('claimed during the settle wait');
  context.schedule(
    plan.number,
    { afterReads: 0, ...closedBy(plan.closer) },
    { afterReads: 1, assignees: ['other-agent'] },
  );
  refuse(reopen(context, plan), `plan #${plan.number} is owned by other-agent`);
  assert.deepEqual(context.waits(), [SETTLE_WAIT]);
  assert.deepEqual(stored(context, plan.number), {
    ...ONGOING,
    state: 'CLOSED',
    stateReason: 'COMPLETED',
    assignees: ['other-agent'],
  });
  assert.deepEqual(context.writes(), []);
});
