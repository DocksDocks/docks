import assert from 'node:assert/strict';
import test from 'node:test';
import { parseReviewComment } from '../../../plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/plan.mjs';
import { body, expectSuccess, planCliContext, refuse } from './harness.mjs';

test('review parsing accepts flexible prose, and a severe finding turns a code pass into fixes-required', () => {
  // Review prose is flexible. Severity still prevents an unsafe code pass.
  const reviewCases = [
    ['## Plan review (round 2)\n\nplan-review: pass', { kind: 'plan', verdict: 'pass' }],
    [
      '### Plan review — round 2\n\nplan review: changes\nParser — records are lost.',
      { kind: 'plan', verdict: 'repair' },
    ],
    [
      '# Code review\n\ncode-review: approved\nHIGH: The parser loses data.',
      { kind: 'code', verdict: 'fixes-required' },
    ],
    [
      '### Code review round 1 - 2026-09-09\nCode-review: pass\n- [low] src/api.mjs:3 - the high-level API name is unclear; critical path is fine - rename',
      { kind: 'code', verdict: 'pass' },
    ],
    [
      '### Code review round 1 - 2026-09-09\nCode-review: pass\n- [HIGH] src/api.mjs:3 - data loss - fix',
      { kind: 'code', verdict: 'fixes-required' },
    ],
    ['**### Code review round 1**\n\n**Code-review: pass**', { kind: 'code', verdict: 'pass' }],
    ['### Code review round 2\n\n**Code-review:** `pass`.', { kind: 'code', verdict: 'pass' }],
    ['## **Plan review** round 1\n\n- Plan-review: _repair_', { kind: 'plan', verdict: 'repair' }],
    [
      '### Code review round 3\nCode-review: pass\n- **[HIGH]** src/example.mjs:1 - data loss - fix',
      { kind: 'code', verdict: 'fixes-required' },
    ],
    [
      '### Code review round 3\nCode-review: pass\n1. Bug [critical] src/example.mjs:1 - data loss - fix',
      { kind: 'code', verdict: 'fixes-required' },
    ],
    ['### Code review round 3\nCode-review: pass\n> Severity: High', { kind: 'code', verdict: 'fixes-required' }],
  ];
  for (const [text, expected] of reviewCases) assert.deepEqual(parseReviewComment(text), expected);
});

test('a review comment with several blocks yields the most severe verdict of its kind (#98)', () => {
  // A code-review round posts every lens block in one comment (#98), so no block may hide another's verdict.
  const lens = (name, verdict, finding = 'None.') =>
    `### Code review round 1, lens ${name}\n\nCode-review: ${verdict}\n\n## Standards\n\n${finding}\n\n## Spec\n\nNone.`;
  const comment = (...blocks) => blocks.join('\n\n');
  const cases = [
    [
      comment(lens('correctness', 'pass'), lens('spec-and-tests', 'pass'), lens('text-and-safety', 'blocked')),
      { kind: 'code', verdict: 'blocked' },
    ],
    [
      comment(
        lens('correctness', 'pass', '- [MEDIUM] Bug - src/a.mjs:4 - stale read - re-read'),
        lens('spec-and-tests', 'pass'),
      ),
      { kind: 'code', verdict: 'pass' },
    ],
    [
      '### Plan review round 2\n\nPlan-review: pass\n\nNone.\n\n### Plan review round 2\n\nPlan-review: repair\n\n- goal_fit - Step 1 - gap - fix',
      { kind: 'plan', verdict: 'repair' },
    ],
    // A verdict line of the other kind is prose inside the block and does not count.
    [
      '### Code review round 2, delta\n\nPlan-review: blocked\nCode-review: pass\n\nNone.',
      { kind: 'code', verdict: 'pass' },
    ],
    // An unknown verdict word in any block makes the whole comment unreadable as a review.
    [comment(lens('correctness', 'pass'), lens('spec-and-tests', 'maybe')), undefined],
  ];
  for (const [text, expected] of cases) assert.deepEqual(parseReviewComment(text), expected, text.split('\n')[0]);
});

test('only the first verdict line of each review block counts, so prose cannot hide or forge a verdict (#98)', () => {
  // A block starts at the comment's first line or at a later Markdown heading that names the same review kind.
  const cases = [
    // A prose line that looks like a verdict must not make the comment unreadable and revive an older pass.
    [
      '### Code review round 2, delta\n\nCode-review: fixes-required\n\n- [HIGH] Bug - src/a.mjs:4 - stale read - re-read\n- Code review: missing test for the retry path',
      { kind: 'code', verdict: 'fixes-required' },
    ],
    // A delta block that quotes the previous round's verdict keeps its own verdict.
    [
      '### Code review round 2, delta\n\nCode-review: pass\n\nRound 1 returned:\n> Code-review: fixes-required\nThe finding is fixed.',
      { kind: 'code', verdict: 'pass' },
    ],
    // A list item that starts with the review kind is prose, not a new block.
    [
      '### Plan review round 3\n\nPlan-review: pass\n\n- plan review notes for the next round\n\nNone.',
      { kind: 'plan', verdict: 'pass' },
    ],
    // A quoted heading of an earlier round is prose, so its quoted verdict cannot open a block that wins.
    [
      '### Code review round 2, delta\n\nCode-review: pass\n\n## Previous findings\n\n> ### Code review round 1\n> Code-review: fixes-required\n\n## Standards\n\nNone.',
      { kind: 'code', verdict: 'pass' },
    ],
    // A list item that holds a heading is prose too, also with a `*` marker, which is not emphasis here.
    [
      '### Plan review round 3\n\nPlan-review: pass\n\nNone.\n\n- ### Plan review round 2\n- Plan-review: repair',
      { kind: 'plan', verdict: 'pass' },
    ],
    [
      '### Code review round 2, delta\n\nCode-review: pass\n\n## Previous findings\n\n* ### Code review round 1\n* Code-review: fixes-required',
      { kind: 'code', verdict: 'pass' },
    ],
    // An emphasized heading title still starts a block.
    [
      '### Code review round 1, lens correctness\n\nCode-review: pass\n\n### **Code review round 1, lens text-and-safety**\n\nCode-review: blocked\nMissing input: the focus diff.',
      { kind: 'code', verdict: 'blocked' },
    ],
    // A heading indented by up to three spaces is still a Markdown heading, so its block counts.
    [
      '### Code review round 1, lens correctness\n\nCode-review: pass\n\n   ### Code review round 1, lens spec-and-tests\n\nCode-review: fixes-required',
      { kind: 'code', verdict: 'fixes-required' },
    ],
  ];
  for (const [text, expected] of cases) assert.deepEqual(parseReviewComment(text), expected, text);
});

test('show reads the most severe verdict of a lens comment (#98)', (t) => {
  const { run, addIssueComment, createPlan } = planCliContext(t);
  const plan = createPlan('lens comment');
  addIssueComment(
    plan,
    [
      '### Code review round 1, lens correctness\n\nCode-review: pass\n\nNone.',
      '### Code review round 1, lens spec-and-tests\n\nCode-review: pass\n\nNone.',
      '### Code review round 1, lens text-and-safety\n\nCode-review: blocked\n\nThe focus diff was unreadable.',
    ].join('\n\n'),
  );
  const shown = run('show', String(plan));
  expectSuccess(shown, 'show a lens comment');
  assert.match(shown.stdout, /^reviews: plan=none code=blocked$/m);
});

test('show reports only trusted reviews, and an older timestamp cannot override a newer verdict', (t) => {
  const { run, updateIssue, addIssueComment, createPlan } = planCliContext(t);
  const reviews = createPlan('trusted reviews');
  addIssueComment(reviews, '## Plan review (round 2)\n\nplan-review: pass');
  addIssueComment(reviews, '## Plan review\n\nplan-review: blocked', 'foreign-agent');
  addIssueComment(reviews, '## Code review\n\ncode-review: pass\nHIGH: Data loss.');
  let shown = run('show', String(reviews));
  expectSuccess(shown, 'trusted review show');
  assert.match(shown.stdout, /^reviews: plan=pass code=fixes-required$/m);
  addIssueComment(reviews, '## Plan review\n\nplan-review: repair');
  updateIssue(reviews, (entry) => {
    entry.comments.at(-1).createdAt = '2020-01-01T00:00:00Z';
  });
  shown = run('show', String(reviews));
  expectSuccess(shown, 'timestamp review show');
  assert.match(shown.stdout, /^reviews: plan=pass code=fixes-required$/m);
});

test('show reads reviews beyond the first comment page and fails closed when a comment page fails', (t) => {
  const { run, updateState, addIssueComment, createPlan } = planCliContext(t);
  const pagedReviews = createPlan('reviews beyond first page');
  addIssueComment(pagedReviews, '## Code review\n\ncode-review: pass');
  updateState((state) => {
    const entry = state.issues.find((candidate) => candidate.number === pagedReviews);
    for (let index = 0; index < 99; index += 1) {
      const id = state.nextComment++;
      entry.comments.push({
        id,
        body: 'Routine discussion.',
        author: 'foreign-agent',
        createdAt: new Date(Date.parse('2026-08-20T20:00:00Z') + id * 1000).toISOString(),
      });
    }
  });
  addIssueComment(pagedReviews, '## Code review\n\ncode-review: repair', 'plan-agent');
  addIssueComment(pagedReviews, '## Code review\n\ncode-review: pass', 'foreign-agent');
  const pagedShow = run('show', String(pagedReviews));
  expectSuccess(pagedShow, 'show all review pages');
  assert.match(pagedShow.stdout, /^reviews: plan=none code=fixes-required$/m, 'late trusted review wins');
  updateState((state) => {
    state.graphqlError = { on: 'page', errors: [{ message: 'comment page unavailable' }] };
  });
  const brokenReviewPage = run('show', String(pagedReviews));
  assert.equal(brokenReviewPage.status, 1, 'a failed review page cannot produce a verdict');
  assert.match(brokenReviewPage.stderr, /graphql/i);
  assert.equal(brokenReviewPage.stdout, '');
});

test('show reads a review record written in bold Markdown', (t) => {
  const { run, addIssueComment, createPlan } = planCliContext(t);
  const boldReview = createPlan('bold review record');
  addIssueComment(boldReview, '**### Code review round 1**\n\n**Code-review: pass**');
  const boldShow = run('show', String(boldReview));
  expectSuccess(boldShow, 'show bold review record');
  assert.match(boldShow.stdout, /^reviews: plan=none code=pass$/m);
});

test('status planned or ongoing requires research that replaces the placeholder (#78)', (t) => {
  const { run, issue, createPlan } = planCliContext(t);
  // A drafted plan enters planned or ongoing only after research replaces the placeholder (#78).
  const unresearched = createPlan(
    'unresearched plan',
    body().replace('The parser loses mixed-case records.', '_Not researched yet._'),
  );
  refuse(run('status', String(unresearched), 'planned'), 'status planned requires a filled Research section');
  refuse(run('status', String(unresearched), 'ongoing'), 'status ongoing requires a filled Research section');
  assert.deepEqual(issue(unresearched).labels, ['plan', 'plan:drafting'], 'a refused status keeps the phase label');
  expectSuccess(
    run('status', String(unresearched), 'blocked', '--reason', 'Waiting for research'),
    'an unresearched plan can still block',
  );
  const emptyResearch = createPlan('empty research', body().replace('The parser loses mixed-case records.', ''));
  refuse(run('status', String(emptyResearch), 'planned'), 'status planned requires a filled Research section');
  const quotedPlaceholder = createPlan(
    'research quotes the placeholder',
    body().replace(
      'The parser loses mixed-case records.',
      'A new plan holds `_Not researched yet._` until research is published.',
    ),
  );
  const quotedStatus = run('status', String(quotedPlaceholder), 'planned');
  expectSuccess(quotedStatus, 'research prose may quote the placeholder');
  assert.doesNotMatch(quotedStatus.stdout, /Research is not filled/, 'quoted placeholder is not unfilled research');
});

test('a plan-review pass covers evidence edits, and a Research edit after it advises a new round (#78)', (t) => {
  const { addIssueComment, createPlan, edit } = planCliContext(t);
  // A plan-review pass covers the body that the reviewer read (#78).
  const reviewed = createPlan('reviewed plan');
  addIssueComment(reviewed, '### Plan review round 1\n\nPlan-review: pass\n\nNone.');
  const resultsEdit = edit(reviewed, (text) => text.replace('Not run.', 'Smoke passed.'));
  expectSuccess(resultsEdit, 'edit verification results after a plan pass');
  assert.doesNotMatch(resultsEdit.stdout, /plan review passed before this edit/, 'evidence edits need no new round');
  const researchEdit = edit(reviewed, (text) =>
    text.replace(
      'The parser loses mixed-case records.',
      'The parser loses mixed-case records.\n\nDecision: keep the old date format.',
    ),
  );
  expectSuccess(researchEdit, 'edit research after a plan pass');
  assert.match(
    researchEdit.stdout,
    /^advice: plan review passed before this edit; changed sections: Research; review all such edits in one plan-review round before code that depends on them or the next code-review round$/m,
  );
});

test('a plan-review pass covers the Mode line and the delegation line that a yolo run sets (#111)', (t) => {
  const { addIssueComment, createPlan, edit } = planCliContext(t);
  // A yolo run that adopts a passed plan adds the delegation line and sets the Mode; neither changes reviewed work (#111).
  const delegation = 'Yolo: the user delegated every decision except the merge to the agent.';
  const goals = [
    ['a yolo run adopts the plan', `Fix the parser.\n\n${delegation}\n\nmode: plan-and-implement`, false],
    [
      'an indented delegation line in the goal paragraph',
      `Fix the parser.\n   ${delegation}  \n\n   Mode: plan-and-implement`,
      false,
    ],
    ['a Mode change without the delegation line', 'Fix the parser.\n\nMode: plan-and-implement', true],
    ['a delegation line in a code span', `Fix the parser.\n\n\`${delegation}\`\n\nMode: plan-and-implement`, true],
    [
      'a goal change beside the delegation line',
      `Fix the parser and the printer.\n\n${delegation}\n\nMode: plan-and-implement`,
      true,
    ],
  ];
  for (const [name, goal, advises] of goals) {
    const reviewed = createPlan(name, body().replace('Mode: plan-and-implement', 'Mode: plan-only'));
    addIssueComment(reviewed, '### Plan review round 1\n\nPlan-review: pass\n\nNone.');
    const goalEdit = edit(reviewed, (text) => text.replace('Fix the parser.\n\nMode: plan-only', goal));
    expectSuccess(goalEdit, `edit goal: ${name}`);
    if (advises)
      assert.match(goalEdit.stdout, /^advice: plan review passed before this edit; changed sections: Goal; /m, name);
    else assert.doesNotMatch(goalEdit.stdout, /plan review passed before this edit/, name);
  }
});
