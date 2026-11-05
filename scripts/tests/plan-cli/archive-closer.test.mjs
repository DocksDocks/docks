import assert from 'node:assert/strict';
import test from 'node:test';
import { closedBy, expectSuccess, planCliContext, refuse, SKIP_WAITS } from './harness.mjs';

// The pauses of an archive that reads an open plan 34 times: 250 ms, doubling up to 2 s, then 2 s each.
const CLOSE_WAITS = [250, 500, 1000, ...Array(30).fill(2000)];
const REVIEW = { author: 'plan-agent', body: '### Code review (round 2)\n\ncode-review: pass' };
const UNPROVEN = 'archive requires a closing pull request merged into DocksDocks/fixture:main';

// Every archive loads the skip-waits hook, so the pauses for an open plan return at once and get recorded.
function archive({ runWith }, plan) {
  return runWith(['--import', SKIP_WAITS], 'archive', String(plan.number), '--pr', String(plan.pr));
}

function finished(plan) {
  return `plan #${plan.number} finished (closed by ${plan.closer.url})\n`;
}

function closeComment(pr) {
  return `Closed by archive: pull request #${pr} merged into main and closes this plan, but GitHub left the plan open.`;
}

// The plan fields that an archive may change; a comment reduces to its author and body.
function stored({ issue }, number) {
  const { state, stateReason, labels, comments } = issue(number);
  return { state, stateReason, labels, comments: comments.map(({ author, body }) => ({ author, body })) };
}

function closes({ loadState }) {
  return loadState().calls.filter(([group, command]) => group === 'issue' && command === 'close');
}

test('archive finishes a closed plan with terminal work, a trusted pass, and the merged closing pull request', (t) => {
  const context = planCliContext(t);
  const plan = context.closedPlan('merged closer');
  const archived = archive(context, plan);
  expectSuccess(archived, 'archive merged closer');
  assert.equal(archived.stdout, finished(plan));
  assert.deepEqual(stored(context, plan.number), {
    state: 'CLOSED',
    stateReason: 'COMPLETED',
    labels: ['plan'],
    comments: [REVIEW],
  });
});

test('archive refuses without an issue or a pull request and writes nothing', (t) => {
  const context = planCliContext(t);
  const plan = context.closedPlan('no pull request named');
  for (const args of [[String(plan.number)], []]) {
    refuse(context.run('archive', ...args), 'archive requires an issue and --pr');
  }
  assert.deepEqual(context.writes(), []);
});

test('archive refuses a pull request that has not merged and writes nothing', (t) => {
  const context = planCliContext(t);
  const plan = context.landedPlan('unmerged pull request', { merged: false });
  refuse(archive(context, plan), `pull request #${plan.pr} is not merged`);
  assert.deepEqual(stored(context, plan.number), {
    state: 'OPEN',
    stateReason: null,
    labels: ['plan', 'plan:ongoing'],
    comments: [REVIEW],
  });
  assert.deepEqual(context.writes(), []);
  assert.deepEqual(context.waits(), []);
});

test('archive removes a stale phase label beyond the first label page of an owned plan', (t) => {
  const context = planCliContext(t);
  // The owned plan needs no claim, so the label removal is the whole write.
  const plan = context.closedPlan('phase label beyond first page');
  const unrelatedLabels = Array.from({ length: 100 }, (_, index) => `topic:${index}`);
  context.updateIssue(plan.number, (entry) => {
    entry.labels = ['plan', ...unrelatedLabels, 'plan:ongoing'];
    entry.assignees = ['plan-agent'];
  });
  expectSuccess(archive(context, plan), 'archive label on second page');
  assert.deepEqual(context.issue(plan.number).labels, ['plan', ...unrelatedLabels]);
});

test('archive finishes a plan closed by hand when the named pull request merged into main and closes it', (t) => {
  const context = planCliContext(t);
  const plan = context.closedPlan('closed by hand');
  context.updateIssue(plan.number, (entry) => {
    entry.timelineItems = [{ __typename: 'ClosedEvent', closer: null }];
  });
  const archived = archive(context, plan);
  expectSuccess(archived, 'archive a plan closed by hand');
  assert.equal(archived.stdout, finished(plan));
  assert.deepEqual(context.issue(plan.number).labels, ['plan']);
});

test('archive finishes a plan that a commit or another pull request closed when the named pull request closes it', (t) => {
  const context = planCliContext(t);
  // A commit pushed to main without a pull request, and a manually linked pull request without a closing keyword:
  // neither proves the close, and the named pull request does.
  const oid = 'c0ffee0000000000000000000000000000000003';
  context.updateState((state) => {
    state.commits = [{ oid, associatedPullRequests: [] }];
  });
  const otherPullRequest = {
    __typename: 'PullRequest',
    number: 999,
    url: 'https://github.com/DocksDocks/fixture/pull/999',
    state: 'MERGED',
    mergedAt: '2026-08-21T00:00:05Z',
    baseRefName: 'main',
    body: null,
    repository: { nameWithOwner: 'DocksDocks/fixture' },
  };
  for (const [name, closer] of [
    ['closed by a commit', { __typename: 'Commit', oid }],
    ['closed by another pull request', otherPullRequest],
  ]) {
    const plan = context.closedPlan(name);
    context.updateIssue(plan.number, (entry) => {
      entry.timelineItems = [{ __typename: 'ClosedEvent', closer }];
    });
    const archived = archive(context, plan);
    expectSuccess(archived, `archive a plan ${name}`);
    assert.equal(archived.stdout, finished(plan), name);
    assert.deepEqual(context.issue(plan.number).labels, ['plan'], name);
  }
});

test('archive accepts a repository-qualified closing keyword in mixed case', (t) => {
  const context = planCliContext(t);
  const plan = context.closedPlan('qualified closing keyword', { prBody: 'fIxEs: dOcKsDoCkS/FiXtUrE#ISSUE' });
  expectSuccess(archive(context, plan), 'archive qualified mixed-case keyword');
});

test('archive accepts a closing keyword separated from the reference by a tab', (t) => {
  const context = planCliContext(t);
  const plan = context.closedPlan('tab-separated closing keyword', { prBody: 'Resolves\t#ISSUE' });
  expectSuccess(archive(context, plan), 'archive tab-separated keyword');
});

test('archive refuses a merged pull request whose description does not prove it closes the plan', (t) => {
  const context = planCliContext(t);
  // Each pull request lists the plan in closingIssuesReferences, as one from the linked branch does; only a closing
  // keyword in its description proves that it closes the plan.
  for (const [name, prBody] of [
    ['no closing keyword', 'Refs #ISSUE'],
    ['number prefix', 'Closes #ISSUE0'],
    ['number suffix', 'Closes #ISSUEa'],
    ['keyword prefix', 'notCloses #ISSUE'],
    ['issue URL', 'Closes https://github.com/DocksDocks/fixture/issues/ISSUE'],
    ['different repository', 'Fixes: Another/repo#ISSUE'],
    ['keyword and reference in separate paragraphs', 'Closes:\n\n#ISSUE is still open'],
    ['keyword and reference on separate lines', 'Closes\n#ISSUE'],
    ['null PR description', null],
  ]) {
    const plan = context.closedPlan(name, { prBody });
    refuse(archive(context, plan), UNPROVEN);
    assert.deepEqual(context.issue(plan.number).labels, ['plan', 'plan:ongoing'], name);
  }
});

test('archive closes an open ongoing plan that GitHub leaves open after 34 reads, then removes the phase label', (t) => {
  const context = planCliContext(t);
  const plan = context.landedPlan('left open by GitHub');
  const archived = archive(context, plan);
  expectSuccess(archived, 'archive closes the plan');
  assert.equal(archived.stdout, finished(plan));
  assert.deepEqual(context.waits(), CLOSE_WAITS);
  assert.deepEqual(stored(context, plan.number), {
    state: 'CLOSED',
    stateReason: 'COMPLETED',
    labels: ['plan'],
    comments: [REVIEW, { author: 'plan-agent', body: closeComment(plan.pr) }],
  });
});

test('archive finishes an open ongoing plan that GitHub closes during the waits, without closing it itself', (t) => {
  const context = planCliContext(t);
  const plan = context.landedPlan('closed by GitHub during the waits');
  // GitHub records the close for the merge on the third read of the plan.
  context.schedule(plan.number, { afterReads: 2, ...closedBy(plan.closer) });
  const archived = archive(context, plan);
  expectSuccess(archived, 'archive after the close by GitHub');
  assert.equal(archived.stdout, finished(plan));
  assert.notDeepEqual(context.waits(), [], 'archive waits for the close');
  assert.deepEqual(stored(context, plan.number), {
    state: 'CLOSED',
    stateReason: 'COMPLETED',
    labels: ['plan'],
    comments: [REVIEW],
  });
  assert.deepEqual(closes(context), []);
});

test('archive leaves an open plan ongoing when its close fails, and a rerun archives it', (t) => {
  const context = planCliContext(t);
  const plan = context.landedPlan('close fails once');
  const failure = 'HTTP 502: Bad Gateway (https://api.github.com/graphql)';
  context.updateState((state) => {
    state.issueCloseErrorOnce = failure;
  });
  refuse(archive(context, plan), `gh issue close failed: ${failure}`);
  assert.deepEqual(stored(context, plan.number), {
    state: 'OPEN',
    stateReason: null,
    labels: ['plan', 'plan:ongoing'],
    comments: [REVIEW],
  });
  const rerun = archive(context, plan);
  expectSuccess(rerun, 'rerun archive');
  assert.equal(rerun.stdout, finished(plan));
  assert.deepEqual(stored(context, plan.number), {
    state: 'CLOSED',
    stateReason: 'COMPLETED',
    labels: ['plan'],
    comments: [REVIEW, { author: 'plan-agent', body: closeComment(plan.pr) }],
  });
});
