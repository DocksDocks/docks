import assert from 'node:assert/strict';
import test from 'node:test';
import { body, expectSuccess, planCliContext, refuse, SKIP_WAITS } from './harness.mjs';

// Child plans (E1) and the contract marker (E2): `new --parent`, the child lines of `show`, and the parent archive.

// The Steps rows of a parent: one row per child plan, with Files `-` and Done when `child #<c> finished`.
function parentRows(children, status = 'done') {
  return children.map(
    (child, index) =>
      `| ${index + 1} | land_${child} | Land child plan #${child} | - | - | local | ${status} | child #${child} finished |`,
  );
}

// Replace the Steps rows of plan `number`.
function setSteps(context, number, rows) {
  context.updateIssue(number, (entry) => {
    entry.body = body().replace(/^\| 1 \| fix_parser .*$/m, rows.join('\n'));
  });
}

// An open, ongoing plan owned by the acting login; a case that archives it as a parent sets its child rows.
function ongoingParent(context, name = 'parent plan') {
  const number = context.createPlan(name, body('done'));
  context.updateIssue(number, (entry) => {
    entry.labels = ['plan', 'plan:ongoing'];
  });
  return number;
}

// A child plan reopens: open, with its phase label back.
const REOPENED_CHILD = { state: 'OPEN', stateReason: 'REOPENED', labels: ['plan', 'plan:ongoing'] };

// The GraphQL reads that the fake gh has served for issue `number`.
function reads(context, number) {
  return context.issue(number).graphqlReads ?? 0;
}

function closes({ loadState }) {
  return loadState().calls.filter(([group, command]) => group === 'issue' && command === 'close');
}

function closeChild(context, number, stateReason) {
  context.updateIssue(number, (entry) => {
    entry.state = 'CLOSED';
    entry.stateReason = stateReason;
    entry.labels = ['plan'];
  });
}

function creates({ loadState }) {
  return loadState().calls.filter(([group, command]) => group === 'issue' && command === 'create');
}

test('new --parent creates a v5 child plan as a sub-issue of the parent through gh issue create --parent', (t) => {
  const context = planCliContext(t);
  const parent = context.createPlan('parent plan');
  const child = context.createChild('child plan', parent);
  assert.deepEqual(context.issue(parent).subIssues, [child.number]);
  assert.match(context.issue(child.number).body, /^<!-- plan-contract: v5 -->\n/);
  const [call] = creates(context).slice(-1);
  assert.equal(call[call.indexOf('--parent') + 1], String(parent), 'gh links the child in the create call');
  assert.deepEqual(
    context.loadState().calls.filter(([group, command]) => group === 'api' && command !== 'graphql'),
    [],
    'gh with --parent needs no REST call',
  );
});

test('new writes the v5 marker', (t) => {
  const context = planCliContext(t);
  const result = context.run('new', '--title', 'plain plan', '--goal', 'Fix the parser');
  expectSuccess(result, 'new');
  const number = Number(/^plan created: #(\d+) /m.exec(result.stdout)[1]);
  assert.match(context.issue(number).body, /^<!-- plan-contract: v5 -->\n/);
  assert.equal(context.issue(number).subIssues, undefined, 'a plan without --parent gets no parent');
});

test('new --parent links the child through the REST sub-issues API when gh lacks the --parent flag', (t) => {
  const context = planCliContext(t);
  const parent = context.createPlan('parent plan');
  context.updateState((state) => {
    state.ghLacksParentFlag = true;
  });
  const child = context.createChild('child plan', parent);
  assert.deepEqual(context.issue(parent).subIssues, [child.number]);
  assert.equal(creates(context).length, 3, 'the parent create, the refused --parent create, and one plain create');
  assert.ok(!creates(context).at(-1).includes('--parent'), 'the second create names no parent');
  assert.deepEqual(
    context
      .loadState()
      .calls.filter(([group, command]) => group === 'api' && command !== 'graphql')
      .map((call) => call.slice(1).join(' ')),
    [
      `repos/DocksDocks/fixture/issues/${child.number}`,
      `repos/DocksDocks/fixture/issues/${parent}/sub_issues --method POST -F sub_issue_id=${100_000 + child.number}`,
    ],
  );
});

test('new --parent names the created child when the REST sub-issue link fails', (t) => {
  const context = planCliContext(t);
  const parent = context.createPlan('parent plan');
  context.updateState((state) => {
    state.ghLacksParentFlag = true;
    state.subIssueErrorOnce = 'HTTP 403: Resource not accessible';
  });
  const child = context.loadState().nextIssue;
  refuse(
    context.run('new', '--title', 'child plan', '--goal', 'Land one pull request', '--parent', String(parent)),
    `plan #${child} was created, but its link to parent #${parent} failed: gh api repos/DocksDocks/fixture/issues/${parent}/sub_issues failed: HTTP 403: Resource not accessible`,
  );
  assert.ok(context.issue(child), 'the child plan exists');
  assert.equal(context.issue(parent).subIssues, undefined, 'the parent has no sub-issue');
});

test('new --parent refuses a parent that is not an open plan of the acting login and creates nothing', (t) => {
  const context = planCliContext(t);
  const closed = context.createPlan('closed parent');
  closeChild(context, closed, 'COMPLETED');
  const foreign = context.createPlan('foreign parent');
  context.updateIssue(foreign, (entry) => {
    entry.assignees = ['foreign-agent'];
  });
  const unassigned = context.createPlan('unassigned parent');
  context.updateIssue(unassigned, (entry) => {
    entry.assignees = [];
  });
  const shared = context.createPlan('shared parent');
  context.updateIssue(shared, (entry) => {
    entry.assignees = ['plan-agent', 'foreign-agent'];
  });
  const notPlan = context.createPlan('issue without a marker', 'A bug report.\n');
  const unlabelled = context.createPlan('unlabelled parent');
  context.updateIssue(unlabelled, (entry) => {
    entry.labels = ['plan'];
  });
  const issuesBefore = context.loadState().issues.length;
  for (const parent of [closed, foreign, unassigned, shared, notPlan, unlabelled]) {
    refuse(
      context.run('new', '--title', 'child plan', '--goal', 'Land one pull request', '--parent', String(parent)),
      `parent #${parent} is not an open plan`,
    );
  }
  assert.equal(context.loadState().issues.length, issuesBefore, 'a refused parent creates no issue');
  refuse(
    context.run('new', '--title', 'child plan', '--goal', 'Land one pull request', '--parent', 'x'),
    'invalid parent issue: x',
  );
});

test('show lists each child with its status after the reviews line, and a plan without children lists none', (t) => {
  const context = planCliContext(t);
  const parent = ongoingParent(context);
  const first = context.createChild('first child', parent).number;
  const second = context.createChild('second child', parent).number;
  const third = context.createChild('third child', parent).number;
  closeChild(context, second, 'COMPLETED');
  closeChild(context, third, 'NOT_PLANNED');
  const shown = context.run('show', String(parent));
  expectSuccess(shown, 'show a parent');
  assert.deepEqual(shown.stdout.split('\n').slice(1, 5), [
    'reviews: plan=none code=none',
    `child #${first} · drafting · first child`,
    `child #${second} · finished · second child`,
    `child #${third} · retired · third child`,
  ]);
  const withBody = context.run('show', String(parent), '--body');
  expectSuccess(withBody, 'show a parent with --body');
  assert.match(withBody.stderr, new RegExp(`^child #${first} · drafting · first child$`, 'm'));
  const childShow = context.run('show', String(first));
  expectSuccess(childShow, 'show a child');
  assert.doesNotMatch(childShow.stdout, /^child #/m);
});

test('archive of a parent refuses while a child is open, then finishes after every child closes', (t) => {
  const context = planCliContext(t);
  const parent = ongoingParent(context);
  const first = context.createChild('first child', parent).number;
  const second = context.createChild('second child', parent).number;
  closeChild(context, first, 'COMPLETED');
  setSteps(context, parent, parentRows([first, second]));
  context.updateState((state) => {
    state.calls = [];
  });
  refuse(context.run('archive', String(parent)), `archive refused: child #${second} is drafting`);
  assert.deepEqual(context.writes(), [], 'a refused archive writes nothing');
  closeChild(context, second, 'COMPLETED');
  const archived = context.run('archive', String(parent));
  expectSuccess(archived, 'archive a parent');
  assert.equal(archived.stdout, `plan #${parent} finished (all 2 children finished)\n`);
  const { state, stateReason, labels } = context.issue(parent);
  assert.deepEqual({ state, stateReason, labels }, { state: 'CLOSED', stateReason: 'COMPLETED', labels: ['plan'] });
  // A rerun on the finished parent closes nothing again.
  expectSuccess(context.run('archive', String(parent)), 'archive a finished parent again');
  assert.equal(
    context.loadState().calls.filter(([group, command]) => group === 'issue' && command === 'close').length,
    1,
  );
});

test('archive of a parent counts a retired or duplicate child as closed but needs one finished child', (t) => {
  const context = planCliContext(t);
  const parent = ongoingParent(context);
  const retired = context.createChild('retired child', parent).number;
  const duplicate = context.createChild('duplicate child', parent).number;
  closeChild(context, retired, 'NOT_PLANNED');
  closeChild(context, duplicate, 'DUPLICATE');
  setSteps(context, parent, parentRows([retired, duplicate]));
  refuse(
    context.run('archive', String(parent)),
    `archive refused: no child of plan #${parent} finished; retire the parent`,
  );
  assert.equal(context.issue(parent).state, 'OPEN');
  const finished = context.createChild('finished child', parent).number;
  closeChild(context, finished, 'COMPLETED');
  setSteps(context, parent, parentRows([retired, duplicate, finished]));
  const archived = context.run('archive', String(parent));
  expectSuccess(archived, 'archive a parent with retired, duplicate, and finished children');
  assert.equal(archived.stdout, `plan #${parent} finished (all 3 children finished)\n`);
});

test('archive of a parent refuses a child that GitHub left closed with reason REOPENED', (t) => {
  const context = planCliContext(t);
  const parent = ongoingParent(context);
  const child = context.createChild('stuck child', parent).number;
  closeChild(context, child, 'REOPENED');
  setSteps(context, parent, parentRows([child]));
  refuse(context.run('archive', String(parent)), `archive refused: child #${child} is unreadable`);
});

test('archive of a parent needs terminal parent steps and an ongoing parent, but no code review', (t) => {
  const context = planCliContext(t);
  const parent = context.createPlan('parent with open step');
  const child = context.createChild('child', parent).number;
  closeChild(context, child, 'COMPLETED');
  setSteps(context, parent, parentRows([child], 'in-flight'));
  refuse(context.run('archive', String(parent)), 'archive requires ongoing or finished status, found drafting');
  context.updateIssue(parent, (entry) => {
    entry.labels = ['plan', 'plan:ongoing'];
  });
  refuse(context.run('archive', String(parent)), `archive refused: non-terminal step land_${child}`);
  assert.equal(context.issue(parent).state, 'OPEN');
});

test('archive without --pr keeps the --pr rule for a plan without children', (t) => {
  const context = planCliContext(t);
  const plan = ongoingParent(context, 'plan without children');
  context.updateState((state) => {
    state.calls = [];
  });
  refuse(context.run('archive', String(plan)), 'archive requires an issue and --pr');
  assert.deepEqual(context.writes(), []);
});

test('archive --pr refuses a landed plan while one of its children is open', (t) => {
  const context = planCliContext(t);
  const plan = context.landedPlan('landed plan with a child');
  const child = context.createChild('child', plan.number).number;
  // The pull request closed the plan after the child plan opened.
  context.updateIssue(plan.number, (entry) => {
    entry.state = 'CLOSED';
    entry.stateReason = 'COMPLETED';
    entry.timelineItems = [{ __typename: 'ClosedEvent', closer: plan.closer }];
  });
  refuse(
    context.run('archive', String(plan.number), '--pr', String(plan.pr)),
    `archive refused: child #${child} is drafting`,
  );
  closeChild(context, child, 'COMPLETED');
  expectSuccess(context.run('archive', String(plan.number), '--pr', String(plan.pr)), 'archive after the child');
});

test('archive without --pr refuses a plan with a child and its own landing work', (t) => {
  const context = planCliContext(t);
  // A started plan that moved new scope into a child plan still landed its own row through a pull request.
  const plan = context.createPlan('plan with own work', body('done'));
  context.updateIssue(plan, (entry) => {
    entry.labels = ['plan', 'plan:ongoing'];
  });
  const child = context.createChild('child', plan).number;
  closeChild(context, child, 'COMPLETED');
  context.updateState((state) => {
    state.calls = [];
  });
  refuse(
    context.run('archive', String(plan)),
    `archive refused: plan #${plan} has its own landing work; archive it with --pr`,
  );
  assert.deepEqual(context.writes(), []);
  const ownWork = `archive refused: plan #${plan} has its own landing work; archive it with --pr`;
  const other = context.createChild('second child', plan).number;
  closeChild(context, other, 'COMPLETED');
  const notChild = context.createPlan('not a child');
  const probe = '| 9 | probe_limit | Measure the limit | - | - | probe | done | Results recorded |';
  for (const [name, rows] of [
    // A fileless row that is no child row is work of the plan itself.
    ['a probe row beside the child rows', [...parentRows([child, other]), probe]],
    ['a row that names an issue that is no child', parentRows([child, notChild])],
    ['a child that no row names', parentRows([child])],
    ['a child that two rows name', parentRows([child, child])],
    [
      'a child row with files',
      parentRows([child, other]).map((row, index) =>
        index === 1 ? row.replace('| - | - |', '| src/a.mjs | - |') : row,
      ),
    ],
    [
      'a Done when that only names the child',
      parentRows([child, other]).map((row) => row.replace(' finished |', ' landed |')),
    ],
  ]) {
    setSteps(context, plan, rows);
    refuse(context.run('archive', String(plan)), ownWork);
    assert.equal(context.issue(plan).state, 'OPEN', name);
  }
  setSteps(context, plan, parentRows([child, other]));
  expectSuccess(context.run('archive', String(plan)), 'one row for each child is a parent');
});

test('archive of a parent re-reads its children before the close and refuses a new or reopened child', (t) => {
  const context = planCliContext(t);
  const parent = ongoingParent(context);
  const child = context.createChild('finished child', parent).number;
  closeChild(context, child, 'COMPLETED');
  setSteps(context, parent, parentRows([child]));
  const other = context.createPlan('later child');
  // A new child plan appears after the archive snapshot and before the close.
  context.schedule(parent, { afterReads: reads(context, parent) + 1, subIssues: [child, other] });
  refuse(context.run('archive', String(parent)), 'plan issue changed remotely; re-read and retry');
  // The finished child reopens after the archive snapshot and before the close.
  context.updateIssue(parent, (entry) => {
    entry.subIssues = [child];
  });
  context.schedule(parent, {
    afterReads: reads(context, parent) + 1,
    otherIssues: { [child]: { state: 'OPEN', stateReason: 'REOPENED', labels: ['plan', 'plan:ongoing'] } },
  });
  refuse(context.run('archive', String(parent)), 'plan issue changed remotely; re-read and retry');
  assert.deepEqual(closes(context), [], 'a changed child stops the close');
  assert.equal(context.issue(parent).state, 'OPEN');
});

test('archive --pr re-reads the children before it closes a plan that GitHub left open', (t) => {
  const context = planCliContext(t);
  const plan = context.landedPlan('landed plan with a finished child');
  const child = context.createChild('child', plan.number).number;
  closeChild(context, child, 'COMPLETED');
  // The archive reads the open plan 34 times; the child reopens before the pre-close reads.
  context.schedule(plan.number, {
    afterReads: reads(context, plan.number) + 34,
    otherIssues: { [child]: { state: 'OPEN', stateReason: 'REOPENED', labels: ['plan', 'plan:ongoing'] } },
  });
  refuse(
    context.runWith(['--import', SKIP_WAITS], 'archive', String(plan.number), '--pr', String(plan.pr)),
    'plan issue changed remotely; re-read and retry',
  );
  assert.deepEqual(closes(context), []);
  assert.equal(context.issue(plan.number).state, 'OPEN');
});

test('archive of a parent reopens it and refuses when a child reopens or appears between the close and the re-read', (t) => {
  const context = planCliContext(t);
  const parent = ongoingParent(context);
  const child = context.createChild('finished child', parent).number;
  closeChild(context, child, 'COMPLETED');
  setSteps(context, parent, parentRows([child]));
  const reopened = (number) => `Reopened: child #${number} changed while plan #${parent} closed; work continues.`;
  context.updateState((state) => {
    state.afterCloseOnce = { otherIssues: { [child]: REOPENED_CHILD } };
  });
  refuse(context.run('archive', String(parent)), `archive refused: child #${child} is ongoing`);
  let stored = context.issue(parent);
  assert.deepEqual(
    { state: stored.state, labels: stored.labels, comments: stored.comments.map((comment) => comment.body) },
    { state: 'OPEN', labels: ['plan', 'plan:ongoing'], comments: [reopened(child)] },
  );
  // A new child appears between the close and the re-read. It is closed already, so only its newness is open work.
  closeChild(context, child, 'COMPLETED');
  const other = context.createPlan('later child');
  closeChild(context, other, 'COMPLETED');
  context.updateState((state) => {
    state.afterCloseOnce = { subIssues: [child, other] };
  });
  refuse(context.run('archive', String(parent)), `archive refused: child #${other} is finished`);
  stored = context.issue(parent);
  assert.equal(stored.state, 'OPEN');
  assert.equal(stored.comments.at(-1).body, reopened(other));
  assert.equal(closes(context).length, 2);
});

test('archive --pr reopens the plan and refuses when a child reopens between its close and the re-read', (t) => {
  const context = planCliContext(t);
  const plan = context.landedPlan('landed plan with a finished child');
  const child = context.createChild('child', plan.number).number;
  closeChild(context, child, 'COMPLETED');
  context.updateState((state) => {
    state.afterCloseOnce = { otherIssues: { [child]: REOPENED_CHILD } };
  });
  refuse(
    context.runWith(['--import', SKIP_WAITS], 'archive', String(plan.number), '--pr', String(plan.pr)),
    `archive refused: child #${child} is ongoing`,
  );
  const stored = context.issue(plan.number);
  assert.deepEqual(
    { state: stored.state, labels: stored.labels, comment: stored.comments.at(-1).body },
    {
      state: 'OPEN',
      labels: ['plan', 'plan:ongoing'],
      comment: `Reopened: child #${child} changed while plan #${plan.number} closed; work continues.`,
    },
  );
  assert.equal(closes(context).length, 1);
});

test('show and list read a phase label beyond the first label page of a child or a listed plan', (t) => {
  const context = planCliContext(t);
  const parent = ongoingParent(context);
  const child = context.createChild('paged child', parent).number;
  context.updateIssue(child, (entry) => {
    entry.labels = ['plan', ...Array.from({ length: 100 }, (_, index) => `topic:${index}`), 'plan:ongoing'];
  });
  const shown = context.run('show', String(parent));
  expectSuccess(shown, 'show a parent with a paged child');
  assert.match(shown.stdout, new RegExp(`^child #${child} · ongoing · paged child$`, 'm'));
  const listed = context.run('list');
  expectSuccess(listed, 'list a plan with paged labels');
  assert.match(listed.stdout, new RegExp(`^ongoing\\t#${child}\\tpaged child$`, 'm'));
});

test('a write moves a v4 plan to v5 only before work starts, and a started v4 plan stays v4', (t) => {
  const context = planCliContext(t);
  const unstarted = context.createPlan('unstarted v4', body('planned', 4));
  expectSuccess(context.run('status', String(unstarted), 'ongoing'), 'start a v4 plan');
  assert.match(context.issue(unstarted).body, /^<!-- plan-contract: v5 -->\n/);
  const started = context.createPlan('started v4', body('planned', 4));
  context.updateIssue(started, (entry) => {
    entry.labels = ['plan', 'plan:ongoing'];
  });
  expectSuccess(
    context.edit(started, (text) => text.replace('Not run.', 'Smoke passed.')),
    'edit a started v4 plan',
  );
  assert.match(context.issue(started).body, /^<!-- plan-contract: v4 -->\n/);
  // The marker comes from the stored plan, not from the edited file.
  expectSuccess(
    context.edit(started, (text) => text.replace('plan-contract: v4', 'plan-contract: v5')),
    'edit that names v5 on a started v4 plan',
  );
  assert.match(context.issue(started).body, /^<!-- plan-contract: v4 -->\n/);
  expectSuccess(context.run('step', String(started), 'fix_parser', 'in-flight'), 'step on a started v4 plan');
  assert.match(context.issue(started).body, /^<!-- plan-contract: v4 -->\n/);
  expectSuccess(context.run('status', String(started), 'blocked', '--reason', 'Waiting'), 'block a started v4 plan');
  assert.match(context.issue(started).body, /^<!-- plan-contract: v4 -->\n/);
});
