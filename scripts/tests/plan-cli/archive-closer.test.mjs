import assert from 'node:assert/strict';
import test from 'node:test';
import { expectSuccess, planCliContext, refuse } from './harness.mjs';

test('archive finishes a plan with terminal work, a trusted pass, and the merged closer', (t) => {
  const { run, issue, closedPlan } = planCliContext(t);
  // Archive needs terminal work, a trusted pass, and the actual merged closer.
  const landed = closedPlan('merged closer');
  const archived = run('archive', String(landed.number));
  expectSuccess(archived, 'archive merged closer');
  assert.equal(archived.stdout.trim(), `plan #${landed.number} finished (closed by ${landed.closer.url})`);
  assert.deepEqual(issue(landed.number).labels, ['plan']);
});

test('archive uses the latest actual closure over older closures and a later non-closure event', (t) => {
  const { run, updateIssue, closedPlan } = planCliContext(t);
  // The latest actual closure wins over older closures and a later non-closure event.
  const latestClosure = closedPlan('latest closure');
  updateIssue(latestClosure.number, (entry) => {
    entry.timelineItems = [
      { __typename: 'ClosedEvent', closer: { ...latestClosure.closer, baseRefName: 'release' } },
      { __typename: 'ClosedEvent', closer: latestClosure.closer },
      { __typename: 'LabeledEvent', label: { name: 'plan:ongoing' } },
    ];
  });
  expectSuccess(run('archive', String(latestClosure.number)), 'archive latest closure');
});

test('archive accepts a repository-qualified closing keyword in mixed case', (t) => {
  const { run, closedPlan } = planCliContext(t);
  const qualified = closedPlan('qualified closing keyword', {
    prBody: 'fIxEs: dOcKsDoCkS/FiXtUrE#ISSUE',
  });
  expectSuccess(run('archive', String(qualified.number)), 'archive qualified mixed-case keyword');
});

test('archive accepts a closing keyword separated from the reference by a tab', (t) => {
  const { run, closedPlan } = planCliContext(t);
  const tabSeparated = closedPlan('tab-separated closing keyword', { prBody: 'Resolves\t#ISSUE' });
  expectSuccess(run('archive', String(tabSeparated.number)), 'archive tab-separated keyword');
});

test('archive refuses a merged pull request whose description does not prove it closes the plan', (t) => {
  const { run, issue, closedPlan } = planCliContext(t);
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
    const unproven = closedPlan(name, { prBody });
    refuse(
      run('archive', String(unproven.number)),
      'archive requires a closing pull request merged into DocksDocks/fixture:main',
    );
    assert.deepEqual(issue(unproven.number).labels, ['plan', 'plan:ongoing']);
  }
});

test('archive finds the merged pull request for a commit closer beyond the first association page', (t) => {
  const { run, updateState, issue, closedPlan } = planCliContext(t);
  const commitClosed = closedPlan('commit closer beyond first association page');
  const commitOid = 'a'.repeat(40);
  updateState((state) => {
    const entry = state.issues.find((candidate) => candidate.number === commitClosed.number);
    entry.timelineItems = [
      { __typename: 'ClosedEvent', closer: commitClosed.closer },
      { __typename: 'ClosedEvent', closer: { __typename: 'Commit', oid: commitOid } },
    ];
    state.commits = [
      {
        oid: commitOid,
        associatedPullRequests: [
          ...Array.from({ length: 100 }, (_, index) => ({
            number: 10000 + index,
            state: 'MERGED',
            mergedAt: '2026-08-21T00:00:00Z',
            baseRefName: 'release',
          })),
          { ...commitClosed.closer, body: null },
        ],
      },
    ];
  });
  const commitArchive = run('archive', String(commitClosed.number));
  expectSuccess(commitArchive, 'archive merged PR associated with commit on second page');
  assert.equal(
    commitArchive.stdout.trim(),
    `plan #${commitClosed.number} finished (closed by ${commitClosed.closer.url})`,
  );
  assert.deepEqual(issue(commitClosed.number).labels, ['plan']);
});
