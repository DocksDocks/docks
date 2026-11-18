import assert from 'node:assert/strict';
import test from 'node:test';
import { body, expectSuccess, planCliContext } from './harness.mjs';

// Authority events and the `grant:` line of `show` (contract, Delegated decisions).

const YOLO_LINE = 'Yolo: the user delegated every decision except the merge to the agent.';
const QUOTE = 'decide yourself';
const delegatedLine = (quote) =>
  `Delegated: the user delegated the design and tradeoff decisions to the agent. User: "${quote}"`;
// The harness gives comment k the time 2026-08-20T20:00:00Z plus k seconds.
const at = (seconds) => new Date(Date.parse('2026-08-20T20:00:00Z') + seconds * 1000).toISOString();

// A plan body whose Goal holds `lines` after its first paragraph.
function withGoal(...lines) {
  return body().replace('Fix the parser.\n', `Fix the parser.\n\n${lines.join('\n')}\n`);
}

// Post a comment and return its id, the number that `show` names.
function post(context, number, text, author) {
  const id = context.loadState().nextComment;
  context.addIssueComment(number, text, author);
  return String(id);
}

function setCreatedAt(context, number, id, createdAt) {
  context.updateIssue(number, (entry) => {
    entry.comments.find((comment) => String(comment.id) === id).createdAt = createdAt;
  });
}

// The output of `show`, after a check that the grant line follows the reviews line.
function show(context, number) {
  const shown = context.run('show', String(number));
  expectSuccess(shown, `show #${number}`);
  const lines = shown.stdout.split('\n');
  assert.match(lines[1], /^reviews: /);
  assert.match(lines[2], /^grant: /);
  return { grant: lines[2], lines };
}

const grantLine = (context, number) => show(context, number).grant;

// A child plan of `parent` whose Goal holds `lines`.
function childWithGoal(context, parent, ...lines) {
  const child = context.createChild('child plan', parent).number;
  context.updateIssue(child, (entry) => {
    entry.body = withGoal(...lines);
  });
  return child;
}

const endedAdvice = (parent, id) =>
  `advice: parent #${parent} comment ${id} ended the grant; remove the delegation line from Goal, with no new event`;

test('show prints grant: none for a plan without an authority event or a delegation line', (t) => {
  const context = planCliContext(t);
  const plan = context.createPlan('no grant');
  assert.equal(grantLine(context, plan), 'grant: none');
  post(context, plan, '## Plan review (round 1)\n\nplan-review: pass');
  post(context, plan, 'Delegation granted to the agent, as discussed.');
  assert.equal(grantLine(context, plan), 'grant: none');
});

test('a trusted grant event with its matching Delegated line is in force', (t) => {
  const context = planCliContext(t);
  const plan = context.createPlan('delegated grant', withGoal(delegatedLine(QUOTE)));
  const grant = post(context, plan, `Delegation grant: ${QUOTE}`);
  assert.equal(grantLine(context, plan), `grant: in force (delegated) by comment ${grant}`);
  // The quotes compare after trimming and without one pair of surrounding double quotes.
  const quoted = post(context, plan, `Delegation grant: "${QUOTE}"`);
  assert.equal(grantLine(context, plan), `grant: in force (delegated) by comment ${quoted}`);
});

test('a trusted yolo grant event with the yolo line is in force', (t) => {
  const context = planCliContext(t);
  const plan = context.createPlan('yolo grant', withGoal(YOLO_LINE));
  const grant = post(context, plan, 'Delegation grant: yolo: go for the best durable solution');
  assert.equal(grantLine(context, plan), `grant: in force (yolo) by comment ${grant}`);
});

test('a revocation ends the grant, also when the user types it by hand', (t) => {
  const context = planCliContext(t);
  const plan = context.createPlan('revoked grant', withGoal(YOLO_LINE));
  for (const revocation of [
    'Delegation revoked',
    'Delegation revoked\n"stop deciding for me"',
    '**Delegation revoked**',
    '`delegation REVOKED`',
    '\n  _Delegation Revoked_  \n',
  ]) {
    const grant = post(context, plan, 'Delegation grant: yolo: go');
    assert.equal(grantLine(context, plan), `grant: in force (yolo) by comment ${grant}`, revocation);
    const revoked = post(context, plan, revocation);
    assert.equal(grantLine(context, plan), `grant: ended by revocation comment ${revoked}`, revocation);
  }
});

test('only trusted events count: an untrusted author and two assignees give no grant', (t) => {
  const context = planCliContext(t);
  const plan = context.createPlan('untrusted grant', withGoal(YOLO_LINE));
  post(context, plan, 'Delegation grant: yolo: go', 'foreign-agent');
  const untrusted = 'grant: none; the Goal delegation line has no trusted authority event';
  assert.equal(grantLine(context, plan), untrusted);
  const grant = post(context, plan, 'Delegation grant: yolo: go');
  assert.equal(grantLine(context, plan), `grant: in force (yolo) by comment ${grant}`);
  post(context, plan, 'Delegation revoked', 'foreign-agent');
  assert.equal(grantLine(context, plan), `grant: in force (yolo) by comment ${grant}`, 'an untrusted revocation');
  context.updateIssue(plan, (entry) => {
    entry.assignees = ['plan-agent', 'foreign-agent'];
  });
  assert.equal(grantLine(context, plan), untrusted);
});

test('a live delegation line without a trusted event gives no grant', (t) => {
  const context = planCliContext(t);
  for (const line of [YOLO_LINE, delegatedLine(QUOTE)]) {
    const plan = context.createPlan('line without event', withGoal(line));
    assert.equal(grantLine(context, plan), 'grant: none; the Goal delegation line has no trusted authority event');
  }
});

test('a Goal line that does not match the deciding event gives no grant', (t) => {
  const context = planCliContext(t);
  const mismatch = (id) => `the Goal delegation line does not match comment ${id}`;
  const twoLines = (id) => `the Goal has 2 delegation lines for comment ${id}`;
  const noLine = (id) => `the Goal has no delegation line for comment ${id}`;
  const typographic = delegatedLine(QUOTE).replace(/"(.*)"$/, '\u201c$1\u201d');
  const cases = [
    ['a quote mismatch', [delegatedLine(QUOTE)], 'Delegation grant: go fast', mismatch],
    ['typographic quotes', [typographic], `Delegation grant: ${QUOTE}`, mismatch],
    ['a yolo line for a Delegated event', [YOLO_LINE], `Delegation grant: ${QUOTE}`, mismatch],
    ['a Delegated line for a yolo event', [delegatedLine(QUOTE)], `Delegation grant: yolo: ${QUOTE}`, mismatch],
    ['both lines', [YOLO_LINE, '', delegatedLine(QUOTE)], 'Delegation grant: yolo: go', twoLines],
    ['no line', [], 'Delegation grant: yolo: go', noLine],
  ];
  for (const [name, lines, event, reason] of cases) {
    const plan = context.createPlan(name, lines.length ? withGoal(...lines) : body());
    const id = post(context, plan, event);
    assert.equal(grantLine(context, plan), `grant: none; ${reason(id)}`, name);
  }
});

test('a quoted, decorated, or fenced event line and a fenced or indented Goal line do not count', (t) => {
  const context = planCliContext(t);
  const plan = context.createPlan('quoted events', withGoal(YOLO_LINE));
  for (const text of [
    '> Delegation grant: yolo: go',
    '**Delegation grant: yolo: go**',
    '`Delegation grant: yolo: go`',
    ' Delegation grant: yolo: go',
    'delegation grant: yolo: go',
    '```\nDelegation grant: yolo: go\n```',
    'As agreed:\nDelegation grant: yolo: go',
  ]) {
    post(context, plan, text);
  }
  assert.equal(grantLine(context, plan), 'grant: none; the Goal delegation line has no trusted authority event');
  for (const lines of [['```text', YOLO_LINE, '```'], [`    ${YOLO_LINE}`]]) {
    const example = context.createPlan('example line', withGoal(...lines));
    const grant = post(context, example, 'Delegation grant: yolo: go');
    assert.equal(grantLine(context, example), `grant: none; the Goal has no delegation line for comment ${grant}`);
  }
});

test('a narrowed yolo grant is in force as the narrower Delegated grant', (t) => {
  const context = planCliContext(t);
  const plan = context.createPlan('narrowed yolo', withGoal(YOLO_LINE));
  post(context, plan, 'Delegation grant: yolo: go');
  post(context, plan, 'Delegation revoked');
  const narrowed = post(context, plan, `Delegation grant: ${QUOTE}`);
  assert.equal(grantLine(context, plan), `grant: none; the Goal delegation line does not match comment ${narrowed}`);
  context.updateIssue(plan, (entry) => {
    entry.body = withGoal(delegatedLine(QUOTE));
  });
  assert.equal(grantLine(context, plan), `grant: in force (delegated) by comment ${narrowed}`);
});

test('a child grant with a Parent event link holds only while that event is the parent latest', (t) => {
  const context = planCliContext(t);
  const parent = context.createPlan('parent plan', withGoal(YOLO_LINE));
  const parentGrant = post(context, parent, 'Delegation grant: yolo: go');
  const child = childWithGoal(context, parent, YOLO_LINE);
  const childGrant = post(context, child, `Delegation grant: yolo: go\nParent event: ${parentGrant}`);
  assert.equal(grantLine(context, child), `grant: in force (yolo) by comment ${childGrant}`);
  const revoked = post(context, parent, 'Delegation revoked');
  assert.equal(grantLine(context, child), `grant: ended by parent #${parent} comment ${revoked}`);
  // A parent event ends the linked grant whatever its timestamp, also one older than the child grant.
  setCreatedAt(context, parent, revoked, at(Number(parentGrant) + 0.5));
  assert.equal(grantLine(context, child), `grant: ended by parent #${parent} comment ${revoked}`);
  // A new parent grant ends it too, and a child grant that copies the new event holds.
  const newGrant = post(context, parent, 'Delegation grant: yolo: go again');
  assert.equal(grantLine(context, child), `grant: ended by parent #${parent} comment ${newGrant}`);
  const copied = childWithGoal(context, parent, YOLO_LINE);
  const copiedGrant = post(context, copied, `Delegation grant: yolo: go again\nParent event: ${newGrant}`);
  assert.equal(grantLine(context, copied), `grant: in force (yolo) by comment ${copiedGrant}`);
  // A link in another form, such as the comment URL, never matches.
  const urlLink = childWithGoal(context, parent, YOLO_LINE);
  const url = `${context.issue(parent).url}#issuecomment-${newGrant}`;
  post(context, urlLink, `Delegation grant: yolo: go again\nParent event: ${url}`);
  assert.equal(grantLine(context, urlLink), `grant: ended by parent #${parent} comment ${newGrant}`);
});

test('a child grant without a Parent event link ends only at a newer parent event', (t) => {
  const context = planCliContext(t);
  const parent = context.createPlan('parent plan', withGoal(YOLO_LINE));
  post(context, parent, 'Delegation grant: yolo: go');
  const child = childWithGoal(context, parent, YOLO_LINE);
  // A child without a grant event gives no grant and does not read the parent.
  const parentReads = context.issue(parent).graphqlReads ?? 0;
  assert.equal(grantLine(context, child), 'grant: none; the Goal delegation line has no trusted authority event');
  assert.equal(context.issue(parent).graphqlReads ?? 0, parentReads, 'no parent read without a child grant');
  const childGrant = post(context, child, 'Delegation grant: yolo: go on the child');
  assert.equal(grantLine(context, child), `grant: in force (yolo) by comment ${childGrant}`, 'an older parent event');
  const revoked = post(context, parent, 'Delegation revoked');
  assert.equal(grantLine(context, child), `grant: ended by parent #${parent} comment ${revoked}`, 'a newer event');
  setCreatedAt(context, parent, revoked, at(Number(childGrant) - 0.5));
  assert.equal(grantLine(context, child), `grant: in force (yolo) by comment ${childGrant}`, 'an older timestamp');
});

test('a Parent event line on a plan without a parent gives no grant', (t) => {
  const context = planCliContext(t);
  const plan = context.createPlan('no parent', withGoal(YOLO_LINE));
  const grant = post(context, plan, 'Delegation grant: yolo: go\nParent event: 6982300228');
  assert.equal(
    grantLine(context, plan),
    `grant: none; comment ${grant} names a parent event, but the plan has no parent`,
  );
});

test('a parent in another repository, an unreadable parent, or a parent without trusted events gives no grant', (t) => {
  const context = planCliContext(t);
  const foreign = context.createPlan('foreign parent', withGoal(YOLO_LINE));
  context.updateIssue(foreign, (entry) => {
    entry.foreignParent = { number: 7, nameWithOwner: 'DocksDocks/other' };
  });
  post(context, foreign, 'Delegation grant: yolo: go');
  assert.equal(grantLine(context, foreign), 'grant: none; parent #7 is in another repository (DocksDocks/other)');

  const parent = context.createPlan('unreadable parent', withGoal(YOLO_LINE));
  const child = childWithGoal(context, parent, YOLO_LINE);
  post(context, child, 'Delegation grant: yolo: go');
  context.updateIssue(parent, (entry) => {
    entry.readError = 'HTTP 502: Bad Gateway';
  });
  assert.equal(grantLine(context, child), `grant: none; parent #${parent} cannot be read`);

  const shared = context.createPlan('shared parent', withGoal(YOLO_LINE));
  const parentGrant = post(context, shared, 'Delegation grant: yolo: go');
  const linked = childWithGoal(context, shared, YOLO_LINE);
  post(context, linked, `Delegation grant: yolo: go\nParent event: ${parentGrant}`);
  context.updateIssue(shared, (entry) => {
    entry.assignees = ['plan-agent', 'foreign-agent'];
  });
  assert.equal(grantLine(context, linked), `grant: none; parent #${shared} has no trusted authority event`);
});

test('show advises the removal of a child line only when a parent event ended the grant', (t) => {
  const context = planCliContext(t);
  const parent = context.createPlan('parent plan', withGoal(YOLO_LINE));
  const parentGrant = post(context, parent, 'Delegation grant: yolo: go');
  const child = childWithGoal(context, parent, YOLO_LINE);
  post(context, child, `Delegation grant: yolo: go\nParent event: ${parentGrant}`);
  assert.ok(!show(context, child).lines.some((line) => line.includes('ended the grant')), 'a grant in force');
  const revoked = post(context, parent, 'Delegation revoked');
  assert.ok(show(context, child).lines.includes(endedAdvice(parent, revoked)), 'a live line after the end');
  context.updateIssue(child, (entry) => {
    entry.body = body();
  });
  const removed = show(context, child);
  assert.equal(removed.grant, `grant: ended by parent #${parent} comment ${revoked}`);
  assert.ok(!removed.lines.some((line) => line.includes('ended the grant')), 'no line to remove');
});

test('show --body writes the grant line to stderr with the other metadata', (t) => {
  const context = planCliContext(t);
  const plan = context.createPlan('body grant', withGoal(YOLO_LINE));
  const grant = post(context, plan, 'Delegation grant: yolo: go');
  const shown = context.run('show', String(plan), '--body');
  expectSuccess(shown, 'show --body');
  assert.equal(shown.stdout, context.issue(plan).body);
  assert.deepEqual(shown.stderr.split('\n').slice(1, 3), [
    'reviews: plan=none code=none',
    `grant: in force (yolo) by comment ${grant}`,
  ]);
});
