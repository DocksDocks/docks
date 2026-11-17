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

test('archive --pr reopens a landed plan safely while one of its children is open, then archives it', (t) => {
  const context = planCliContext(t);
  const plan = context.landedPlan('landed plan with a child');
  const child = context.createChild('child', plan.number).number;
  // The pull request closed the plan after the child plan opened.
  context.updateIssue(plan.number, (entry) => {
    entry.state = 'CLOSED';
    entry.stateReason = 'COMPLETED';
    entry.timelineItems = [{ __typename: 'ClosedEvent', closer: plan.closer }];
  });
  const refused = archive(context, String(plan.number), '--pr', String(plan.pr));
  refuse(refused, `archive refused: child #${child} is drafting`);
  assert.equal(refused.stdout, `plan #${plan.number} reopened: ongoing\n`);
  closeChild(context, child, 'COMPLETED');
  expectSuccess(archive(context, String(plan.number), '--pr', String(plan.pr)), 'archive after the child');
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

// Archive reopens a plan only after the settle wait of `reopen` (#90).
const SETTLE_WAIT = 10_000;

function reopenedComment(number, child) {
  return `Reopened: child #${child} changed while plan #${number} closed; work continues.`;
}

// Each archive here loads the skip-waits hook, so its pauses and its settle wait return at once and get recorded.
function archive(context, ...args) {
  return context.runWith(['--import', SKIP_WAITS], 'archive', ...args);
}

// The GraphQL mutations of the call log.
function mutations({ writes }) {
  return writes().filter(([group]) => group === 'api');
}

// The parent fields that a reopen changes; a comment reduces to its body.
function parentState({ issue }, number) {
  const { state, stateReason, labels, comments } = issue(number);
  return { state, stateReason, labels, comments: comments.map((comment) => comment.body) };
}

// A parent with one finished child, so that its archive passes every check before the close.
function closableParent(context) {
  const parent = ongoingParent(context);
  const child = context.createChild('finished child', parent).number;
  closeChild(context, child, 'COMPLETED');
  setSteps(context, parent, parentRows([child]));
  return { parent, child };
}

// The parent after a reopen for `child`.
function reopenedParent(parent, child) {
  return {
    state: 'OPEN',
    stateReason: 'REOPENED',
    labels: ['plan', 'plan:ongoing'],
    comments: [reopenedComment(parent, child)],
  };
}

// A change that lands right after archive's close, with the child and the status that archive then reports.
const DURING_CLOSE = [
  ['a child reopens', (child) => [{ otherIssues: { [child]: REOPENED_CHILD } }, child, 'ongoing']],
  [
    'the only finished child is retired',
    (child) => [{ otherIssues: { [child]: { stateReason: 'NOT_PLANNED' } } }, child, 'retired'],
  ],
  ['the only child is unlinked', (child) => [{ subIssues: [] }, child, 'unlinked']],
  ['a closed child is added', (child, other) => [{ subIssues: [child, other] }, other, 'finished']],
];

for (const [name, during] of DURING_CLOSE) {
  test(`archive of a parent reopens it after the settle wait when ${name} during the close`, (t) => {
    const context = planCliContext(t);
    const { parent, child } = closableParent(context);
    const other = context.createPlan('later child');
    closeChild(context, other, 'COMPLETED');
    const [change, reported, status] = during(child, other);
    context.updateState((state) => {
      state.afterCloseOnce = change;
    });
    const result = archive(context, String(parent));
    refuse(result, `archive refused: child #${reported} is ${status}`);
    assert.equal(result.stdout, `plan #${parent} reopened: ongoing\n`);
    assert.deepEqual(context.waits(), [SETTLE_WAIT], 'the reopen waits for the close to settle');
    assert.deepEqual(parentState(context, parent), reopenedParent(parent, reported));
    assert.equal(closes(context).length, 1);
  });
}

test('archive --pr reopens the plan after the settle wait when a child reopens during its close', (t) => {
  const context = planCliContext(t);
  const plan = context.landedPlan('landed plan with a finished child');
  const child = context.createChild('child', plan.number).number;
  closeChild(context, child, 'COMPLETED');
  context.updateState((state) => {
    state.afterCloseOnce = { otherIssues: { [child]: REOPENED_CHILD } };
  });
  const result = archive(context, String(plan.number), '--pr', String(plan.pr));
  refuse(result, `archive refused: child #${child} is ongoing`);
  assert.equal(result.stdout, `plan #${plan.number} reopened: ongoing\n`);
  assert.equal(context.waits().at(-1), SETTLE_WAIT);
  const stored = parentState(context, plan.number);
  assert.deepEqual(
    { state: stored.state, labels: stored.labels, comment: stored.comments.at(-1) },
    { state: 'OPEN', labels: ['plan', 'plan:ongoing'], comment: reopenedComment(plan.number, child) },
  );
});

test('archive --pr counts only a change since its pre-close read as open work after its close', (t) => {
  const context = planCliContext(t);
  // A row names an issue that is not linked, and another row carries the plan's own work.
  const named = context.landedPlan('landed plan whose row names an unlinked issue');
  const finished = context.createChild('finished child', named.number).number;
  closeChild(context, finished, 'COMPLETED');
  const unlinked = context.createPlan('unlinked issue');
  setSteps(context, named.number, [
    '| 1 | fix_parser | Fix parser | src/parser.mjs | - | local | done | Records round-trip |',
    `| 2 | note | Note the issue | - | - | local | done | child #${unlinked} finished |`,
  ]);
  const first = archive(context, String(named.number), '--pr', String(named.pr));
  expectSuccess(first, 'archive a plan whose row names an unlinked issue');
  assert.equal(parentState(context, named.number).state, 'CLOSED');
  // Every row names a child and none finished, as before the close.
  const retired = context.landedPlan('landed plan with only a retired child');
  const child = context.createChild('retired child', retired.number).number;
  closeChild(context, child, 'NOT_PLANNED');
  setSteps(context, retired.number, parentRows([child]));
  expectSuccess(archive(context, String(retired.number), '--pr', String(retired.pr)), 'archive with a retired child');
  assert.equal(parentState(context, retired.number).state, 'CLOSED');
});

test('a plan with its own landing work and only a retired child or an unlinked child row gets no recovery', (t) => {
  const context = planCliContext(t);
  const ownRow = '| 1 | fix_parser | Fix parser | src/parser.mjs | - | local | done | Records round-trip |';
  const unlinked = context.createPlan('unlinked issue');
  for (const [name, rows, childReason] of [
    ['only a retired child', [ownRow], 'NOT_PLANNED'],
    [
      'an unlinked child row',
      [ownRow, `| 2 | note | Note the issue | - | - | local | done | child #${unlinked} finished |`],
      'COMPLETED',
    ],
  ]) {
    const plan = context.landedPlan(`landed plan with ${name}`);
    closeChild(context, context.createChild('child', plan.number).number, childReason);
    setSteps(context, plan.number, rows);
    expectSuccess(archive(context, String(plan.number), '--pr', String(plan.pr)), `archive --pr with ${name}`);
    const finished = parentState(context, plan.number);
    assert.deepEqual(closedAdvice(context, plan.number), [], `${name}: show gives no recovery advice`);
    context.updateState((state) => {
      state.calls = [];
    });
    // `archive` without --pr keeps the own-work refusal, and `archive --pr` finishes the plan again.
    refuse(
      archive(context, String(plan.number)),
      `archive refused: plan #${plan.number} has its own landing work; archive it with --pr`,
    );
    expectSuccess(archive(context, String(plan.number), '--pr', String(plan.pr)), `archive --pr again with ${name}`);
    assert.deepEqual(mutations(context), [], `${name}: no reopen`);
    assert.deepEqual(parentState(context, plan.number), finished);
  }
});

test('a reopen after a finished archive restores the ongoing phase label', (t) => {
  const context = planCliContext(t);
  const { parent, child } = closableParent(context);
  expectSuccess(archive(context, String(parent)), 'archive the parent');
  assert.deepEqual(parentState(context, parent).labels, ['plan']);
  // The child reopens after the archive finished, and the owner follows the advice of `show`.
  context.updateIssue(child, (entry) => Object.assign(entry, REOPENED_CHILD));
  refuse(archive(context, String(parent)), `archive refused: child #${child} is ongoing`);
  assert.deepEqual(parentState(context, parent), reopenedParent(parent, child));
  assert.match(context.run('show', String(parent)).stdout, new RegExp(`^#${parent} · ongoing · `, 'm'));
});

test('archive --pr reopens a closed plan safely on the retry after a failed read that followed its close', (t) => {
  const context = planCliContext(t);
  const plan = context.landedPlan('landed plan with a finished child');
  const child = context.createChild('child', plan.number).number;
  closeChild(context, child, 'COMPLETED');
  context.updateState((state) => {
    state.afterCloseOnce = {
      graphqlError: { errors: [{ message: 'child read unavailable' }] },
      otherIssues: { [child]: REOPENED_CHILD },
    };
  });
  refuse(
    archive(context, String(plan.number), '--pr', String(plan.pr)),
    'gh api graphql returned errors: child read unavailable',
  );
  assert.equal(parentState(context, plan.number).state, 'CLOSED');
  const retry = archive(context, String(plan.number), '--pr', String(plan.pr));
  refuse(retry, `archive refused: child #${child} is ongoing`);
  assert.equal(retry.stdout, `plan #${plan.number} reopened: ongoing\n`);
  const stored = parentState(context, plan.number);
  assert.deepEqual(
    { state: stored.state, labels: stored.labels, comment: stored.comments.at(-1) },
    { state: 'OPEN', labels: ['plan', 'plan:ongoing'], comment: reopenedComment(plan.number, child) },
  );
});

test('archive refuses with the stuck state when GitHub leaves the plan closed with reason REOPENED', (t) => {
  const context = planCliContext(t);
  const { parent, child } = closableParent(context);
  context.updateState((state) => {
    state.afterCloseOnce = { otherIssues: { [child]: REOPENED_CHILD } };
    state.reopenLeavesClosed = true;
  });
  refuse(
    archive(context, String(parent)),
    `GitHub left plan #${parent} closed with reason REOPENED and refuses every state change; ask GitHub Support to repair it`,
  );
  assert.deepEqual(context.waits(), [SETTLE_WAIT]);
  // The settle read shows the plan stuck already: archive refuses with the stuck state and does not write.
  const second = closableParent(context);
  context.updateState((state) => {
    state.afterCloseOnce = { otherIssues: { [second.child]: REOPENED_CHILD } };
    state.calls = [];
  });
  context.schedule(second.parent, { afterReads: reads(context, second.parent) + 3, stateReason: 'REOPENED' });
  refuse(
    archive(context, String(second.parent)),
    `GitHub left plan #${second.parent} closed with reason REOPENED and refuses every state change; ask GitHub Support to repair it`,
  );
  assert.deepEqual(mutations(context), []);
});

test('archive writes nothing when the close or the child changes again during the settle wait', (t) => {
  const context = planCliContext(t);
  const { parent, child } = closableParent(context);
  // Archive reads the parent before the close, again before the close, after the close, and after the settle wait.
  const settleRead = reads(context, parent) + 3;
  context.updateState((state) => {
    state.afterCloseOnce = { otherIssues: { [child]: REOPENED_CHILD } };
  });
  // The child finishes again during the wait, so the plan shows no open work.
  context.schedule(parent, {
    afterReads: settleRead,
    otherIssues: { [child]: { state: 'CLOSED', stateReason: 'COMPLETED', labels: ['plan'] } },
  });
  context.updateState((state) => {
    state.calls = [];
  });
  refuse(archive(context, String(parent)), `plan #${parent} changed during the settle wait; run archive again`);
  assert.deepEqual(mutations(context), []);
  // The rerun finishes the closed parent, whose children show no open work.
  const rerun = archive(context, String(parent));
  expectSuccess(rerun, 'archive after the settle refusal');
  assert.equal(rerun.stdout, `plan #${parent} finished (all 1 children finished)\n`);

  // Someone reopens the plan during the wait: archive writes nothing and refuses with the open child.
  const second = closableParent(context);
  context.updateState((state) => {
    state.afterCloseOnce = { otherIssues: { [second.child]: REOPENED_CHILD } };
  });
  context.schedule(second.parent, {
    afterReads: reads(context, second.parent) + 3,
    state: 'OPEN',
    stateReason: 'REOPENED',
  });
  const reopenedBySomeone = archive(context, String(second.parent));
  refuse(reopenedBySomeone, `archive refused: child #${second.child} is ongoing`);
  assert.equal(reopenedBySomeone.stdout, '');
  assert.deepEqual(parentState(context, second.parent).comments, []);
});

test('archive refuses when the plan reads open after its close and no child changed', (t) => {
  const context = planCliContext(t);
  const { parent } = closableParent(context);
  context.updateState((state) => {
    state.afterCloseOnce = { state: 'OPEN', stateReason: 'REOPENED' };
  });
  refuse(archive(context, String(parent)), 'plan issue changed remotely; re-read and retry');
  assert.deepEqual(parentState(context, parent).labels, ['plan', 'plan:ongoing'], 'the phase label stays');
  // A plan that reads open after the close, beside a changed child, needs no settle wait and gets no write.
  const second = closableParent(context);
  context.updateState((state) => {
    state.afterCloseOnce = { state: 'OPEN', stateReason: 'REOPENED', otherIssues: { [second.child]: REOPENED_CHILD } };
  });
  const waitsBefore = context.waits().length;
  const result = archive(context, String(second.parent));
  refuse(result, `archive refused: child #${second.child} is ongoing`);
  assert.deepEqual(context.waits().slice(waitsBefore), [], 'no settle wait for an open plan');
  assert.deepEqual(parentState(context, second.parent).comments, []);
});

test('archive reopens a closed plan safely on the retry after a failed read that followed its close', (t) => {
  const context = planCliContext(t);
  const { parent, child } = closableParent(context);
  context.updateState((state) => {
    state.afterCloseOnce = {
      graphqlError: { errors: [{ message: 'child read unavailable' }] },
      otherIssues: { [child]: REOPENED_CHILD },
    };
    state.calls = [];
  });
  refuse(archive(context, String(parent)), 'gh api graphql returned errors: child read unavailable');
  assert.deepEqual(parentState(context, parent), {
    state: 'CLOSED',
    stateReason: 'COMPLETED',
    labels: ['plan', 'plan:ongoing'],
    comments: [],
  });
  assert.deepEqual(mutations(context), []);
  assert.deepEqual(closedAdvice(context, parent), [
    `advice: plan is closed as completed while child #${child} is ongoing; run archive ${parent} again to reopen it safely`,
    `advice: plan is closed as completed but no child finished; run archive ${parent} again to reopen it safely`,
  ]);
  const retry = archive(context, String(parent));
  refuse(retry, `archive refused: child #${child} is ongoing`);
  assert.equal(retry.stdout, `plan #${parent} reopened: ongoing\n`);
  assert.deepEqual(parentState(context, parent), reopenedParent(parent, child));
});

test('archive reopens a closed plan safely on the retry when its only finished child was unlinked', (t) => {
  const context = planCliContext(t);
  const { parent, child } = closableParent(context);
  context.updateState((state) => {
    state.afterCloseOnce = { graphqlError: { errors: [{ message: 'child read unavailable' }] }, subIssues: [] };
  });
  refuse(archive(context, String(parent)), 'gh api graphql returned errors: child read unavailable');
  assert.deepEqual(closedAdvice(context, parent), [
    `advice: plan names child #${child}, which is not linked; relink it or edit the row; run archive ${parent} again to reopen it safely`,
    `advice: plan is closed as completed but no child finished; run archive ${parent} again to reopen it safely`,
  ]);
  const retry = archive(context, String(parent));
  refuse(retry, `archive refused: child #${child} is unlinked`);
  assert.deepEqual(parentState(context, parent), reopenedParent(parent, child));
});

test('archive reopens a closed plan safely on the retry when one of two finished children was unlinked', (t) => {
  const context = planCliContext(t);
  const parent = ongoingParent(context);
  const kept = context.createChild('kept child', parent).number;
  const lost = context.createChild('lost child', parent).number;
  closeChild(context, kept, 'COMPLETED');
  closeChild(context, lost, 'COMPLETED');
  setSteps(context, parent, parentRows([kept, lost]));
  context.updateState((state) => {
    state.afterCloseOnce = { graphqlError: { errors: [{ message: 'child read unavailable' }] }, subIssues: [kept] };
  });
  refuse(archive(context, String(parent)), 'gh api graphql returned errors: child read unavailable');
  // A finished child is still linked, so only the row of the unlinked child is open work.
  const retry = archive(context, String(parent));
  refuse(retry, `archive refused: child #${lost} is unlinked`);
  assert.deepEqual(parentState(context, parent), reopenedParent(parent, lost));
});

// The advice lines that `show` prints for a closed plan and its children.
function closedAdvice(context, number) {
  const shown = context.run('show', String(number));
  expectSuccess(shown, `show #${number}`);
  return shown.stdout.split('\n').filter((line) => /^advice: plan (?:is closed as completed|names child)/.test(line));
}

function closePlan(context, number) {
  context.updateIssue(number, (entry) => {
    entry.state = 'CLOSED';
    entry.stateReason = 'COMPLETED';
  });
}

test('show advises on each child that is not terminal while the plan is closed as completed', (t) => {
  const context = planCliContext(t);
  const parent = ongoingParent(context);
  const open = context.createChild('open child', parent).number;
  const finished = context.createChild('finished child', parent).number;
  const stuck = context.createChild('stuck child', parent).number;
  closeChild(context, finished, 'COMPLETED');
  closeChild(context, stuck, 'REOPENED');
  setSteps(context, parent, parentRows([open, finished, stuck]));
  assert.deepEqual(closedAdvice(context, parent), [], 'an open plan gets no closed-plan advice');
  closePlan(context, parent);
  const recovery = `run archive ${parent} again to reopen it safely`;
  assert.deepEqual(closedAdvice(context, parent), [
    `advice: plan is closed as completed while child #${open} is drafting; ${recovery}`,
    `advice: plan is closed as completed while child #${stuck} is unreadable; ${recovery}`,
  ]);
  // A plan with work of its own gets the same advice for an open child.
  const ownWork = ongoingParent(context, 'plan with own work');
  const ownChild = context.createChild('open child', ownWork).number;
  closePlan(context, ownWork);
  assert.deepEqual(closedAdvice(context, ownWork), [
    `advice: plan is closed as completed while child #${ownChild} is drafting; run archive ${ownWork} again to reopen it safely`,
  ]);
});

test('show advises on child rows that name an unlinked child or no finished child', (t) => {
  const context = planCliContext(t);
  const parent = ongoingParent(context);
  const retired = context.createChild('retired child', parent).number;
  closeChild(context, retired, 'NOT_PLANNED');
  const finished = context.createChild('finished child', parent).number;
  closeChild(context, finished, 'COMPLETED');
  // The rows name only the retired child, so no named child finished.
  setSteps(context, parent, parentRows([retired]));
  closePlan(context, parent);
  const recovery = `run archive ${parent} again to reopen it safely`;
  assert.deepEqual(closedAdvice(context, parent), [
    `advice: plan is closed as completed but no child finished; ${recovery}`,
  ]);
  // A row that names a finished child that is not linked, beside a linked finished child.
  const unlinked = context.createPlan('unlinked child');
  closeChild(context, unlinked, 'COMPLETED');
  setSteps(context, parent, parentRows([retired, finished, unlinked]));
  closePlan(context, parent);
  assert.deepEqual(closedAdvice(context, parent), [
    `advice: plan names child #${unlinked}, which is not linked; relink it or edit the row; ${recovery}`,
  ]);
  // A plan with its own landing work and a retired child has nothing open.
  const ownWork = ongoingParent(context, 'plan with own work');
  closeChild(context, context.createChild('retired child', ownWork).number, 'NOT_PLANNED');
  closePlan(context, ownWork);
  assert.deepEqual(closedAdvice(context, ownWork), []);
  // A closed plan without children and without steps has nothing open.
  const empty = context.createPlan('closed plan without steps');
  setSteps(context, empty, []);
  closePlan(context, empty);
  assert.deepEqual(closedAdvice(context, empty), []);
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
